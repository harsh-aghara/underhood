# Plain prompt: packages/pg-pool/

> I'm new to this codebase. Can you explain what packages/pg-pool does and how it works?

---

pg-pool is the connection pooling library for node-postgres.

When users write const { Pool } = require('pg'), they are using Pool from pg-pool pre-bound with the pg client constructor (configured in index.js:13-25). It can also be installed and used standalone.

---

### Why It Exists

Establishing a new PostgreSQL connection is expensive (TCP handshake, SSL negotiation, backend process creation, authentication, startup parameters). If an application opened a new connection for every query or HTTP request, PostgreSQL would quickly run out of memory and connection slots.

pg-pool maintains a reusable cache of active connections, limits concurrent connections, and queues incoming requests until a connection becomes available.

---

### Core Architecture & State

The entire pool is implemented in index.js and extends Node's EventEmitter. It tracks connection state through four primary structures:

| Property | Type | Purpose |
| :--- | :--- | :--- |
| this._clients | Array<Client> | All active connections currently managed by the pool (checked out + idle). |
| this._idle | Array<IdleItem> | Connections currently in the pool waiting to be used, wrapped with an idle timer. |
| this._pendingQueue | Array<PendingItem> | FIFO queue of callers waiting for a connection when the pool is at capacity (options.max). |
| this._expired | WeakSet<Client> | Clients that exceeded maxLifetimeSeconds and must be closed once released. |

---

### How It Works: Key Workflows

```text
  Caller (connect / query)
          │
          ▼
     Idle client        YES
     available? ───────────────────► Pop from _idle, cancel idle timer, hand to caller
          │ NO
          ▼
     Pool at max        NO
     capacity?  ───────────────────► Spawn new Client, connect, hand to caller
          │ YES
          ▼
     Push to _pendingQueue
          │
     (Waits for client release or connectionTimeoutMillis)
```

#### 1. Acquiring a Connection: connect(cb)

- Supports both callbacks and Promises via promisify().
- If an idle client exists: It schedules a queue pulse via process.nextTick to immediately reuse it.
- If no idle client and _clients.length < max: It calls newClient() to establish a new PostgreSQL connection.
- If at capacity (_clients.length >= max): The request is added to _pendingQueue. If connectionTimeoutMillis is set, a timer will reject the pending request if a client isn't acquired in time.
- Optional lifecycle hooks are executed:
  - onConnect(client): Runs once when a client is initially created.
  - verify(client, cb): Runs before checking out a client.

#### 2. The Central Dispatcher: _pulseQueue()

- Triggered whenever clients become idle, new connections finish opening, or requests are queued.
- Pairs the oldest pending request (_pendingQueue.shift()) with an idle client (_idle.pop()), or triggers creation of a new client if pool capacity allows.

#### 3. Returning Connections: _releaseOnce() and _release()

When callers checkout a client, a custom client.release([err]) function is attached:

- Double-release guard: _releaseOnce() tracks whether release() has already been called and throws an error if called twice.
- Eviction check: The client is disconnected and removed via _remove() instead of returned to the pool if:
  - An error err was passed to release(err).
  - The connection is broken or closed (!client._queryable || client._ending).
  - maxUses has been reached (client._poolUseCount >= options.maxUses).
  - maxLifetimeSeconds expired while checked out.
  - The pool is shutting down (this.ending === true).
- Return to idle: If healthy, the client is pushed into _idle and an idleTimeoutMillis timer is started (if above options.min). _pulseQueue() is called so waiting requests can immediately grab it.

#### 4. Single-Query Convenience: pool.query(text, values, cb)

For typical one-off queries (without manual transaction management), pool.query:

1. Calls pool.connect().
2. Executes client.query(...).
3. Guarantees client.release(err) is called on completion or error.
4. Returns the query result.

#### 5. Graceful Teardown: end(cb)

Sets this.ending = true, immediately closes all idle connections, waits for any in-flight checked-out connections to be released and closed, and resolves when _clients.length === 0.

---

### Reliability & Edge-Case Handling

1. Idle Connection Errors:
If an idle connection drops (e.g., PostgreSQL restart, network blip, or DB server timeout), makeIdleListener() catches the client 'error', purges the dead connection from _idle and _clients, and emits an 'error' event on the Pool instance so the application process does not crash with an unhandled exception.

2. Credential Sanitization:
The Pool\` constructor defines password and ssl.key as non-enumerable properties so they do not leak into console logs or stack traces.

3. Process Exit Management (allowExitOnIdle):
When allowExitOnIdle: true is configured, idle timers and client sockets call .unref() so Node.js can naturally terminate if only idle database connections remain in the event loop.

---

### Important Events Emitted

- 'connect': Emitted when a brand new database connection is created.
- 'acquire': Emitted whenever a client is checked out by a consumer.
- 'release': Emitted when a client is returned to the pool (or discarded).
- 'remove': Emitted when a client is closed and permanently evicted from the pool.
- 'error': Emitted when an error occurs on an idle connection sitting in the pool.
