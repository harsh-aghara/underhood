# Underhood: packages/pg-pool/

> /underhood explain packages/pg-pool/

---

Scope: packages/pg-pool/ · Module · queue-driven asynchronous resource manager (LIFO idle stack / FIFO waiter queue) · static analysis, nothing executed
Coverage: read 2 behavior-carrying files (packages/pg-pool/index.js, packages/pg-pool/esm/index.mjs); not read: 17 test suites in packages/pg-pool/test/* (test harnesses, excluded from behavioral scope)
Assumptions: Target analyzed as the connection pooling module for node-postgres; callers provide or default to a pg.Client implementing connect(cb), query(text, values, cb), end(cb), and EventEmitter.
Evidence: unmarked claims were read directly in source · [INFERRED] · [UNKNOWN]
At a glance: pg-pool manages a bounded collection of persistent PostgreSQL client instances, brokering checkouts and automating query lifecycles over Node's single-threaded event loop. State lives in four collections on the Pool instance: an array of all active clients, a LIFO stack of idle clients, an unbounded FIFO queue of acquisition callbacks, and a WeakSet of expired instances. The sharpest operational risk is unhandled idle connection failures: if an idle client drops its TCP connection and the caller has not registered a pool.on('error') listener, Node's EventEmitter throws an unhandled error and terminates the process.

---

### 1. Topology & Core State Engine

- Purpose: Provide connection pooling, acquisition queueing, and automatic lifecycle management (idle eviction, max-use rotation, and lifetime expiration) for PostgreSQL client sockets.
- Flow diagram:

```text
    [pool.query() / pool.connect()]
                 │
                 ▼
          promisify() (index.js:30)
                 │
                 ▼
          Pool.connect() (index.js:190)
                 │
         ┌───────┴────────────────────────┐
         ▼                                ▼
    [_idle.length > 0]             [!_isFull()]
         │                                │
    _idle.pop() (index.js:158)     newClient() (index.js:240)
         │                                │
         └───────┬────────────────────────┘
                 ▼
       _acquireClient() (index.js:335) ───► client.removeListener('error', idleListener)
                 │
                 ▼
       [Caller / client.query()]
                 │
                 ▼
         client.release() ───► _releaseOnce() (index.js:368)
                                    │
                                    ▼
                             Pool._release() (index.js:382)
                                    │
             ┌──────────────────────┴──────────────────────┐
             ▼                                             ▼
    [err || ending || maxUses || expired]          [healthy connection]
             │                                             │
     _remove() (index.js:172)                      _idle.push() (index.js:427)
             │                                             │
      client.end() (index.js:181)                  _pulseQueue() (index.js:428)
```

- Excluded surface: packages/pg-pool/esm/index.mjs (5-line ESM default export re-exporting CommonJS index.js); option masking boilerplate (packages/pg-pool/index.js:71-87).
- Core state engine:
The volatile state engine lives on the Pool instance (packages/pg-pool/index.js:102-109):
    - this._clients (Array, packages/pg-pool/index.js:102): All active client instances owned by the pool (connecting, busy, or idle). Invariant: this._clients.length <= this.options.max (packages/pg-pool/index.js:120).
    - this._idle (Array<IdleItem>, packages/pg-pool/index.js:103): Active clients available for acquisition, paired with their active idle eviction timer (timeoutId) and error listener (idleListener).
    - this._pendingQueue (Array<PendingItem>, packages/pg-pool/index.js:105): Waiters queued for client checkout when the pool is fully saturated (_isFull() is true and _idle is empty).
    - this._expired (WeakSet<Client>, packages/pg-pool/index.js:104): Set of clients flagged for disposal because maxLifetimeSeconds expired.
    - this.ending / this.ended (Boolean, packages/pg-pool/index.js:107-108): Coordinated drain flags.

---

### 2. Primary execution path

Trace of pool.query(text, values) end-to-end:
1. packages/pg-pool/index.js:431 (Pool.prototype.query): Normalizes arguments, wraps callback or returns a Promise via promisify(this.Promise, cb) (packages/pg-pool/index.js:446).
2. packages/pg-pool/index.js:449 (Pool.prototype.connect): Checks this.ending (packages/pg-pool/index.js:191). If this._idle.length > 0, defers queue pulsing with process.nextTick(() => this._pulseQueue()) (packages/pg-pool/index.js:203) and appends a PendingItem to this._pendingQueue (packages/pg-pool/index.js:207).
3. packages/pg-pool/index.js:127 (Pool.prototype._pulseQueue):
    - Dequeues the oldest waiter: const pendingItem = this._pendingQueue.shift() (packages/pg-pool/index.js:156).
    - Pops the newest idle client: const idleItem = this._idle.pop() (packages/pg-pool/index.js:158).
    - Cancels the client's idle timer: clearTimeout(idleItem.timeoutId) (packages/pg-pool/index.js:159).
    - Restores event loop ref: client.ref && client.ref() (packages/pg-pool/index.js:161).
    - Invokes this._acquireClient(client, pendingItem, idleItem.idleListener, false) (packages/pg-pool/index.js:164).
4. packages/pg-pool/index.js:335 (Pool.prototype._acquireClient):
    - Emits 'acquire' (packages/pg-pool/index.js:340).
    - Wraps release callback: client.release = this._releaseOnce(client, idleListener) (packages/pg-pool/index.js:342).
    - Detaches idle error listener: client.removeListener('error', idleListener) (packages/pg-pool/index.js:344).
    - Dispatches client to waiter callback: pendingItem.callback(undefined, client, client.release) (packages/pg-pool/index.js:357).
5. packages/pg-pool/index.js:454 (Inside pool.query acquisition callback):
    - Attaches a temporary one-time error listener to catch execution failure: client.once('error', onError) (packages/pg-pool/index.js:464).
    - Dispatches SQL query: client.query(text, values, (err, res) => ...) (packages/pg-pool/index.js:467).
6. packages/pg-pool/index.js:469 (client.query completion callback):
    - Removes query error listener: client.removeListener('error', onError) (packages/pg-pool/index.js:469).
    - Atomically guards double-release with boolean flag clientReleased = true (packages/pg-pool/index.js:473).
    - Returns client: client.release(err) (packages/pg-pool/index.js:474).
    - Dispatches query result: cb(undefined, res) (packages/pg-pool/index.js:478).
7. packages/pg-pool/index.js:368 (Pool.prototype._releaseOnce):
    - Asserts released === false, sets released = true (packages/pg-pool/index.js:377), and calls this._release(client, idleListener, err) (packages/pg-pool/index.js:378).
8. packages/pg-pool/index.js:382 (Pool.prototype._release):
    - Re-attaches pool idle listener: client.on('error', idleListener) (packages/pg-pool/index.js:385).
    - Increments usage count: client._poolUseCount = (client._poolUseCount || 0) + 1 (packages/pg-pool/index.js:387).
    - Emits 'release' (packages/pg-pool/index.js:390).
    - Evaluates retention criteria (err, this.ending, !client._queryable, client._ending, maxUses, or _expired) (packages/pg-pool/index.js:392, 400).
    - If retained, schedules idle eviction timer if this.options.idleTimeoutMillis && this._isAboveMin() (packages/pg-pool/index.js:409-415).
    - Pushes client to idle list: this._idle.push(new IdleItem(client, idleListener, tid)) (packages/pg-pool/index.js:427).
    - Triggers this._pulseQueue() (packages/pg-pool/index.js:428) to satisfy any remaining waiters in this._pendingQueue.

Resource disposal:
- Socket closure occurs strictly in _remove(client, callback) (packages/pg-pool/index.js:172-188).
- Removal sequence:
    1. removeWhere(this._idle, ...) clears pending idle eviction timers (packages/pg-pool/index.js:173-177).
    2. this._clients = this._clients.filter((c) => c !== client) synchronously unregisters the client from the active capacity count (packages/pg-pool/index.js:179).
    3. client.end(() => { context.emit('remove', client); callback(); }) asynchronously flushes and terminates the PostgreSQL socket (packages/pg-pool/index.js:181-187).

---

### 3. Decisions & contracts

- Design choice: Hybrid queue topology: LIFO idle list (_idle.push at line 427 / _idle.pop at line 158) combined with FIFO checkout queue (_pendingQueue.push at lines 207, 231 / _pendingQueue.shift at line 156).
Why: Reusing the most recently released connection keeps a small subset of sockets warm (avoiding TCP keepalive retransmits and backend buffer churn) while leaving older connections untouched at the bottom of the stack so their idleTimeoutMillis timers expire (packages/pg-pool/index.js:410-415), shedding unused capacity down to options.min.
- Alternative not taken: FIFO idle reuse (round-robin) [INFERRED]. Round-robin touches every client sequentially, resetting their idle timers on each query and preventing idle connection pruning until traffic drops to zero across the entire pool.
- Upstream contracts:
    - Caller release contract: Every client acquired via pool.connect() must call client.release() exactly once. Calling client.release() a second time synchronously throws throwOnDoubleRelease (packages/pg-pool/index.js:27, 374).
    - Error delegation contract: While checked out to a caller, the pool's idleListener is detached (packages/pg-pool/index.js:344). Callers using pool.connect() must attach their own error handlers to client or use pool.query() (which attaches client.once('error') at line 464); unhandled socket errors while checked out bypass the pool's event emitter.
    - Driver private contract: Relies on non-standard internal flags client._queryable and client._ending (packages/pg-pool/index.js:392) to decide whether a released client is eligible for return to _idle.

---

### 4. Failure modes

1. Nominal path:
    - Normal completion: client.release() (packages/pg-pool/index.js:372) → client._poolUseCount increments (packages/pg-pool/index.js:387) → pushes new IdleItem to this._idle (packages/pg-pool/index.js:427) → calls this._pulseQueue() (packages/pg-pool/index.js:428).
2. Interrupted or exceptional paths:
    - Idle socket drop or server restart:
    TCP disconnect on idle socket at packages/pg-pool/index.js:52 → pool._remove(client) at packages/pg-pool/index.js:59 removes client from this._idle (clearing idle timer) and filters it from this._clients (declared at line 102) → pool.emit('error', err, client) at packages/pg-pool/index.js:62.
    State outcome: Socket closed; slot freed in this._clients. If the consumer has no pool.on('error', ...) listener registered, Node crashes immediately on unhandled EventEmitter error.
    - Query failure inside pool.query:
    Backend returns error or throws in client.query at packages/pg-pool/index.js:474, 480 → client.release(err) passes error to _release at line 382 → err check at line 392 routes to this._remove(client) → client purged from this._clients, client.end() called → waiter queue pulsed to replace slot.
    - Connection establishment timeout (connectionTimeoutMillis):
    tid timer fires at packages/pg-pool/index.js:251 → client.connection.stream.destroy() or client.end() invoked (packages/pg-pool/index.js:255, 260) → client.connect callback fires with error at line 271 → this._clients filtered at line 274 → pendingItem.callback(err) invoked with Error('Connection terminated due to connection timeout') (packages/pg-pool/index.js:276, 283) → _pulseQueue() called (packages/pg-pool/index.js:280).
    - Queue acquisition timeout:
    Timeout fires while waiter is in _pendingQueue at packages/pg-pool/index.js:219 → removeWhere(this._pendingQueue, ...) removes waiter at line 222 → sets pendingItem.timedOut = true at line 223 → waiter callback called with timeout error at line 224.
    Late acquisition recovery: If a client becomes available or finishes connecting after timeout, _acquireClient checks pendingItem.timedOut at packages/pg-pool/index.js:346, 360 and calls client.release(), preventing connection leakage.
    - Pool termination (pool.end()):
    this.ending = true set at packages/pg-pool/index.js:494. Future pool.connect() calls reject immediately with Cannot use a pool after calling end on the pool (packages/pg-pool/index.js:192). _pulseQueue() purges all existing idle clients via this._remove (packages/pg-pool/index.js:137). Active clients continue their queries; as each calls client.release(), this.ending === true triggers this._remove(client) (packages/pg-pool/index.js:392). Once this._clients.length === 0, this.ended = true and this._endCallback() fires (packages/pg-pool/index.js:141-143).
3. Concurrency and re-entrancy:
    - Single-threaded event loop ensures atomic state mutations (_clients.push, _idle.pop, _pendingQueue.shift).
    - Double release: Guarded by closure variable released in _releaseOnce (packages/pg-pool/index.js:370, 373). Second call throws Error('Release called on client which has already been released to the pool.') (packages/pg-pool/index.js:27) synchronously before mutating state.
    - Double pool.end(): Guarded by this.ending check at packages/pg-pool/index.js:490; rejects immediately with Error('Called end on pool more than once').

---

### 5. Spec vs. implementation

| Claim | Where stated | Status | Evidence |
| :--- | :--- | :--- | :--- |
| Bounded pool size (max, default 10) | README:35 | SUPPORTED | Enforced via _isFull() (index.js:120) and checked in connect() (index.js:200). |
| Minimum pool size (min, default 0) | README:90 / code | SUPPORTED | Evaluated in _isAboveMin() (index.js:124) before scheduling idle eviction (index.js:409). |
| Close idle clients after idleTimeoutMillis (default 10000) | README:36, 98-100 | SUPPORTED | Idle timer scheduled in _release() (index.js:410-415) and cleared on acquire (index.js:159). |
| Timeout on connection checkout (connectionTimeoutMillis) | README:37 | SUPPORTED | Enforced both while waiting in queue (index.js:219) and during initial client connect (index.js:250). |
| Rebalance via maxUses (close connection after N uses) | README:38, 316-338 | SUPPORTED | Incremented at index.js:387; destroyed if client._poolUseCount >= this.options.maxUses (index.js:392). |
| Expire connections after maxLifetimeSeconds | Code (index.js:93, 312-329) | SUPPORTED | Tracked via setTimeout and this._expired WeakSet; removed on checkout or release. |
| Allow Node to exit cleanly when idle (allowExitOnIdle) | Code (index.js:92, 417-425) | SUPPORTED | Invokes tid.unref() and client.unref() when connections are idle. |
| Execute single query and return client (pool.query) | README:137-158 | SUPPORTED | Connects, wraps error handling, executes query, and calls release() in callback (index.js:431-486). |
| Events emitted: error, connect, acquire | README:220-299 | SUPPORTED | Emitted at index.js:62, index.js:337, and index.js:340. (Additionally emits undocumented release at line 390 and remove at line 182). |

Non-obvious runtime costs verified in source:

- Unbounded Queue Allocation: this._pendingQueue (packages/pg-pool/index.js:105) has no maximum size limit. Under sustained connection starvation without connectionTimeoutMillis, pending requests accumulate in memory indefinitely.
- O(K) Linear Queue Scans: When connectionTimeoutMillis fires for queued waiters, removeWhere (packages/pg-pool/index.js:222) executes findIndex across the entire _pendingQueue. Under deep queues with mass timeouts, this creates O(K²) scan overhead.
- Per-Checkout Closures: Every checkout allocates a new _releaseOnce wrapper (packages/pg-pool/index.js:368), a PendingItem object, and a Promise rejection catch handler (packages/pg-pool/index.js:42-47).
- Stack Trace Mutability: In promisify() (packages/pg-pool/index.js:45), Error.captureStackTrace(err) re-captures the stack trace on rejection to replace the asynchronous TCP.onStreamRead frame with the query caller's stack, modifying the incoming error instance in-place.
