# Underhood: PR 3838

> /underhood explain PR 3838

---

Scope: PR 3838 (brianc/node-postgres#3838) · Delta · async context propagation & native socket handle reset · static analysis, nothing executed
Coverage: read 1 behavior-carrying file (packages/pg-pool/index.js) and 1 test file (packages/pg-pool/test/async-context-reset.js); not read: 16 existing test suites in packages/pg-pool/test/* (unmodified test harnesses)
Assumptions: PR evaluated against master at commit ab514fa88; diff and GitHub PR metadata retrieved via gh pr diff 3838 and gh pr view 3838.
Evidence: unmarked claims were read directly in source · [INFERRED] · [UNKNOWN]
At a glance: PR 3838 addresses a known memory leak and context pollution bug where long-lived TCP socket handles retain the AsyncLocalStorage (ALS) context active when they were first opened, leaking APM trace metadata and delivering subsequent query callbacks into obsolete async contexts. It introduces AsyncResource capture at pool.connect() time, executes the handoff inside runInAsyncScope, and invokes Node's internal handle.asyncReset() on the underlying stream handle when reusing connections (mirroring Node core's http.Agent). The highest-risk choice is an invasive workaround for Node < 24 that reflects over Object.getOwnPropertySymbols(handle) to forcefully wipe kResourceStore, which has already received collaborator pushback.

---

### 1. Intent vs. reality

- Stated intent:
The PR description (and commit 5d45833) states that it avoids stale AsyncLocalStorage context on client reuse (resolving newrelic/node-newrelic#4408 and node-postgres#2533). It claims to:
    1. Capture AsyncResource at connect()/query() time and replay it on handoff.
    2. Drop the AsyncResource from PendingItem immediately after dispatch to prevent closure retention.
    3. Reset the socket's async context via handle.asyncReset() on reuse "and once right after it finishes connecting".
    4. Clear the internal kResourceStore symbol on Node < 24 (commit 124be0d).
- Diff reality:
    - Omission in implementation: The PR description states it resets the handle "once right after it finishes connecting". In reality, the diff does not do this. resetClientAsyncContext(client) is guarded by if (!isNew) in _acquireClient (packages/pg-pool/index.js:407-409). Newly created connections never have resetClientAsyncContext invoked.
    - Context replay bypassed on new connections: Even though connect() captures an AsyncResource and passes it to this.newClient(new PendingItem(..., asyncResource)) (packages/pg-pool/index.js:302), _acquireClient explicitly checks if (isNew || !asyncResource) return dispatch() (packages/pg-pool/index.js:461). When isNew === true, asyncResource.runInAsyncScope(dispatch) is bypassed. If connection establishment takes multiple ticks, the handoff callback executes outside the caller's captured context.
    - Unannounced reflection: Commit 124be0d introduced symbol reflection via Object.getOwnPropertySymbols(handle).find(...) to clear kResourceStore. This was not in the original PR scope and was flagged by project maintainers (charmander) for tampering with Node internals.

---

### 2. Behavior delta

1. PendingItem state storage:
    - Before (packages/pg-pool/index.js:20-24): Constructor accepted only callback:
```js
class PendingItem {
  constructor(callback) { this.callback = callback }
}
```
    - After (packages/pg-pool/index.js:21-26): Constructor accepts (callback, asyncResource):
```js
class PendingItem {
  constructor(callback, asyncResource) {
    this.callback = callback
    this.asyncResource = asyncResource
  }
}
```

2. Context capture on pool.connect():
    - Before (packages/pg-pool/index.js:190-238): connect() pushed response.callback into this._pendingQueue without capturing ambient async context. If the request was queued, its callback ran in whatever context triggered _pulseQueue() (typically an unrelated caller's client.release()).
    - After (packages/pg-pool/index.js:254-301): connect() instantiates const asyncResource = new AsyncResource('pg-pool.connect') synchronously in the caller's stack frame (packages/pg-pool/index.js:263) and forwards it to all three new PendingItem(...) call sites (packages/pg-pool/index.js:274, 283, 302).

3. Client handoff & handle reset in _acquireClient:
    - Before (packages/pg-pool/index.js:335-366): Directly emitted 'acquire', assigned client.release, removed idleListener, and invoked pendingItem.callback(undefined, client, client.release) in the ambient call stack. The underlying socket (stream._handle) retained whatever async context was bound to it at connection time.
    - After (packages/pg-pool/index.js:400-474):
        - Dereferences pendingItem.asyncResource = null (packages/pg-pool/index.js:405) to prevent memory retention if pendingItem survives in external closures.
        - Wraps acquisition logic in a local dispatch() closure (packages/pg-pool/index.js:406).
        - When !isNew, calls resetClientAsyncContext(client) (packages/pg-pool/index.js:408):
            - Invokes native handle.asyncReset(new ReusedHandle(handle.getProviderType(), handle)) (packages/pg-pool/index.js:73), updating the native handle's async ID and trigger async ID in V8/Node.
            - Searches for kResourceStore via Object.getOwnPropertySymbols(handle) and sets handle[resourceStoreSymbol] = undefined (packages/pg-pool/index.js:75-80).
        - If !isNew && asyncResource, executes return asyncResource.runInAsyncScope(dispatch) (packages/pg-pool/index.js:473), replaying the checkout caller's ALS context and ensuring asyncReset binds the socket to the acquiring caller.

---

### 3. Invariants and contracts touched

- Invariants preserved:
    - Pool capacity invariants (_clients.length <= options.max) and FIFO waiter queue ordering remain untouched.
    - Double-release detection via _releaseOnce remains unchanged.
- Invariants weakened / broken:
    - Encapsulation of Node runtime internals: Breaks encapsulation by directly reflecting over and modifying private symbol properties (kResourceStore) on Node's C++ stream wrapper handles (packages/pg-pool/index.js:75-80).
- New upstream assumptions added:
    - Assumes client.connection.stream._handle may exist and provides asyncReset (Node's C++ AsyncWrap API).
    - Safe degradation: if _handle or asyncReset is absent (e.g. pg-native, mocked streams, or non-Node runtimes like Cloudflare Workers), resetClientAsyncContext returns early with a no-op (packages/pg-pool/index.js:69-71).

---

### 4. Blast radius

- Callers and dependents of changed symbols:
    - PendingItem: Used exclusively inside packages/pg-pool/index.js. All internal calls in connect() updated to pass asyncResource.
    - Unupdated call site in _afterConnect: At packages/pg-pool/index.js:320 (maxLifetimeSeconds idle retirement), PendingItem is instantiated with only one argument:
```js
new PendingItem((err, client, clientRelease) => clientRelease())
```
    Here asyncResource is undefined. In _acquireClient, if (isNew || !asyncResource) triggers return dispatch(), so background retirement executes safely without attempting context restoration.
    - Pool.prototype._acquireClient: Internal dispatch method called by _pulseQueue and _afterConnect.
- External consumers:
    - Every application using AsyncLocalStorage (e.g. NestJS request scoping, OpenTelemetry, Datadog, New Relic) running queries through pg-pool or pg.Pool.
- Test coverage:
    - Added test suite packages/pg-pool/test/async-context-reset.js (104 lines) testing:
        1. Spying on handle.asyncReset during client checkout.
        2. Asserting handle[kResourceStore] becomes undefined on Node < 24.
        3. Verifying sequential pool.query() calls retain independent ALS contexts.

---

### 5. Unhandled edges and failure modes

1. Cold start / new connection context drop:
<cold pool or expansion> at index.js:302 → newClient(new PendingItem(cb, asyncResource)) → _acquireClient(..., isNew = true) at index.js:461 → if (isNew || !asyncResource) returns dispatch().
Because isNew === true, runInAsyncScope is skipped. If client.connect() takes multiple event loop turns to complete the TCP/TLS handshake, pendingItem.callback fires in the context of the TCP connection callback, losing the original caller's ALS context on the first query while preserving it on subsequent reused queries.

2. Per-acquire linear symbol reflection:
Every single reused client acquisition executes Object.getOwnPropertySymbols(handle).find(symbol => symbol.toString().includes('kResourceStore')) (packages/pg-pool/index.js:75-77). This allocates an array of symbols and executes string conversions on the hot acquisition path. On Node >= 24, where kResourceStore does not exist, this full linear search runs on every checkout and always returns undefined.

3. Symbol string collision risk:
Matching symbols by symbol.toString().includes('kResourceStore') could match and overwrite an unrelated symbol property if another library attaches diagnostic symbols containing that substring to the socket handle.

---

### 6. Docs and tests

- Docs out of sync:
No documentation or README updates were made in packages/pg-pool/README.md. The interaction with AsyncLocalStorage and the requirement of Node's async_hooks module are undocumented.
- Test coupling:
packages/pg-pool/test/async-context-reset.js:38-72 tests internal private implementation details by reading handle[resourceStoreSymbol]. As noted in review discussion by charmander, this ties the test suite to internal Node symbols that are absent in Node 24+.

---

Highest-risk change: packages/pg-pool/index.js:75-80 (handle[resourceStoreSymbol] = undefined via Object.getOwnPropertySymbols), which mutates undocumented Node internal symbols by string matching, creating unvetted runtime coupling and performance overhead on every client acquisition.
