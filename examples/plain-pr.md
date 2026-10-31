# Plain prompt: PR #3838

> Review PR #3838 on brianc/node-postgres and summarize what it changes and whether it looks safe to merge.

---

### Overview of PR #3838

- Title: fix(pg-pool): avoid stale async context on client reuse. (PR #3838 https://github.com/brianc/node-postgres/pull/3838)
- Author: bizob2828 (Bob Evans)
- Status: Open (2 commits, +229 / -25 lines)
- Target Package: pg-pool

---

### What It Changes & Why

#### The Problem

In Node.js, AsyncLocalStorage (ALS) associates the active asynchronous context with long-lived native handles (such as the TCP socket underlying a Client).

When pg-pool pools a connection and reuses it across multiple database requests:

1. Context Pollution (#2533 https://github.com/brianc/node-postgres/issues/2533): Subsequent queries on a reused client execute within the async context of the initial connection setup rather than the context of the caller who checked out the client.
2. Memory Leaks in APMs (newrelic/node-newrelic#4408 https://github.com/newrelic/node-newrelic/issues/4408): APM agents (New Relic, OpenTelemetry, Datadog) storing trace data in ALS keep initial trace objects reachable for the entire lifetime of the pooled socket.

#### The Proposed Solution

1. Capturing Caller Context: In Pool.prototype.connect, it captures the caller's context using const asyncResource = new AsyncResource('pg-pool.connect') and attaches it to PendingItem.
2. Dispatching in Caller Scope: In Pool.prototype._acquireClient, it invokes asyncResource.runInAsyncScope(dispatch) so the checkout callback runs in the correct async scope.
3. Resetting Native Handle Async Context:
    - Inspects client.connection.stream._handle.
    - Calls handle.asyncReset(new ReusedHandle(handle.getProviderType(), handle)) (analogous to Node’s internal http.Agent in lib/_http_agent.js).
4. Node < 24 Workaround:
    - On Node < 24, asyncReset does not clear the internal kResourceStore symbol on the handle.
    - The PR inspects Object.getOwnPropertySymbols(handle), searches for the symbol whose name contains 'kResourceStore', and sets handle[resourceStoreSymbol] = undefined.

---

### Is It Safe to Merge?

Verdict: No, it is not currently safe to merge.

While the underlying issue is valid, the PR has several blockers and design flaws that need resolution:

#### 1. Core Maintainer Blocked on Internal Symbol Tampering

The PR searches for Node internals by string comparison:

```js
const resourceStoreSymbol = Object.getOwnPropertySymbols(handle).find((symbol) =>
  symbol.toString().includes('kResourceStore')
)
if (resourceStoreSymbol) {
  handle[resourceStoreSymbol] = undefined
}
```

Core collaborator charmander explicitly objected:

> "Reaching into Node implementation details, especially in this way, is rarely the best or only way to solve a problem... Updating symbol-keyed properties by string representation is really questionable."
> "that really seems like the kind of code that should not be added."

The author conceded that this part should likely be removed or handled as an external workaround for Node < 24.

#### 2. Logic Flaw with Queued Callers and isNew

In _acquireClient:

```js
if (isNew || !asyncResource) {
  return dispatch()
}
return asyncResource.runInAsyncScope(dispatch)
```

If all pool clients are busy, callers wait in _pendingQueue. If an existing client dies and the pool establishes a brand new client to fulfill that pending request, isNew is true. Because of if (isNew ...) return dispatch(), the queued request's callback is not restored to its original asyncResource context.

Furthermore, while the PR description states that socket handles are reset "once right after it finishes connecting", the implementation guards resetClientAsyncContext(client) with if (!isNew), meaning new connections never receive an initial reset.

#### 3. Fragility with Non-Standard Runtimes & Transports

stream._handle and handle.asyncReset are private Node.js C++ bindings. While the code checks typeof handle.asyncReset === 'function', relying on private Node internal state can behave unpredictably across alternative JavaScript runtimes (Bun, Deno, Cloudflare Workers/workerd), custom streams, or native bindings (pg-native).

#### 4. Performance Overhead on Hot Query Path

Because pool.query() delegates to pool.connect():

- Every single query creates a new AsyncResource instance.
- Every reused connection runs Object.getOwnPropertySymbols(handle) and performs string searches over the symbol array.

In high-throughput environments running tens of thousands of queries per second, this creates noticeable GC pressure and CPU overhead.

---

### Recommendation

The PR should not be merged in its current form. Before it can be considered:

1. Remove the kResourceStore hack: Drop internal symbol inspection on Node < 24 as requested by the maintainers.
2. Fix isNew async-scope propagation: Ensure queued pending callers always have their asyncResource restored even when fulfilled by a newly connected client.
3. Optimize hot-path allocations: Avoid scanning property symbols on every checkout, and profile the overhead of AsyncResource creation on pool.query().
