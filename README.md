<div align="center">

# Underhood

**The whiteboard test for your code.**

`/underhood` makes your AI coding agent explain a repo, PR, or diff the way a staff engineer would at a whiteboard: where state changes, what breaks, and where the docs disagree with the code.

[![npm](https://img.shields.io/npm/v/underhood?style=flat-square&color=2563eb&label=npm)](https://www.npmjs.com/package/underhood)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb?style=flat-square)](./LICENSE)

[Install](#install) · [Usage](#usage) · [Real example](#real-example) · [Benchmark](#benchmark-underhood-vs-a-plain-prompt) · [Supported agents](#supported-agents) · [Scope](#scope-and-limitations)

</div>

## Install

```bash
npx underhood init             # current project
npx underhood init --global    # all projects (~/.claude, ~/.gemini, ...)
```

Requires Node.js >= 18.0.0.

Then, inside your coding agent:

```text
/underhood
```

> [!NOTE]
> Some agents namespace plugin commands. In Antigravity the command can also run as `/underhood`.

## Why

Every team has that staff engineer. You point at a 2,000-line PR or an inherited repo and ask what it actually does. They ignore the configs, DTOs and routes, draw three boxes, and say:

> *"Ignore the 40 files in `/src`. This whole service is just an event queue pretending to be an API. The only place state actually changes is line 74. If this worker drops its connection before writing the ack, the message gets re-delivered forever. Everything else is plumbing."*

Ask an AI assistant the same question and you often get a tour of the directory names instead of the behavior. `/underhood` gives your agent the whiteboard architect's habits: trace the real path, name the state, predict the failure, check the claims.

### The Whiteboard Standard

You own a piece of code when you can close the editor and the AI and still:

| | Skill | In practice |
| :-: | :-- | :-- |
| 1 | **Trace the fuel line** | Follow one operation from call to cleanup, naming every line where state changes. |
| 2 | **Defend the choice** | Explain why the author chose this design over the obvious alternative. |
| 3 | **Predict the failure** | Say what happens when a call hangs, a function runs twice, or input is malformed. |
| 4 | **Catch the lie** | Find the line where the README says "thread-safe" and the code disagrees. |

## Usage

Give it whatever you are looking at:

| You want to understand | Run |
| :-- | :-- |
| A whole repo (onboarding, hackathons, architecture review) | `/underhood` or `/underhood this repo` |
| A pull request | `/underhood pr 14` · `/underhood pr #14` · `/underhood <PR URL>` |
| A subsystem or file | `/underhood src/engine/` · `/underhood src/storage/wal.rs` |
| A commit or diff | `/underhood commit 8e3a21b` · `/underhood git show HEAD~1` |

Every run is a single turn: one dense analysis, no questionnaire first.

## What you get

**Repositories and modules**

| # | Section | What it answers |
| :-: | :-- | :-- |
| 1 | Topology & core state engine | Pipeline, state machine, event loop, or layered domain? Which files form each subsystem, what data structures they hand off, and where volatile state lives (`file:line`). |
| 2 | Primary execution path | The main operation, step by step, with `file:line` citations, state mutations, and async boundaries. |
| 3 | Decisions & contracts | Why this pattern, which alternative was rejected and why it would fail, what upstream code must guarantee. |
| 4 | Failure modes | Nominal, interrupted/timeout, and concurrent re-entrant behavior at the data-structure level. |
| 5 | Spec vs. implementation | README and doc claims checked against source, marked `SUPPORTED`, `PARTIAL`, or `GAP`. |

**Pull requests, commits, and diffs (Delta mode)**

| # | Section | What it answers |
| :-: | :-- | :-- |
| 1 | Intent vs. reality | Does the diff do what the title and description promise? |
| 2 | Behavior delta | State mutations and control flow before and after, cited on both sides. |
| 3 | Invariants & contracts touched | Guarantees kept, weakened, or broken; new assumptions on callers. |
| 4 | Blast radius | Callers, consumers, and dependents of changed symbols, mapped to test coverage. |
| 5 | Unhandled edges | Leaks, timeout traps, and races introduced by the change. |
| 6 | Docs & tests out of sync | Where modified code and existing docs or tests now disagree. |

Delta mode ends with the **highest-risk change**: the single most dangerous change in the diff, with the code that shows why.

## Real example

Run on [`brianc/node-postgres`](https://github.com/brianc/node-postgres), in Antigravity. Excerpts below are copied from the run and trimmed with `[…]`; the full outputs are in [`examples/plain-module.md`](./examples/plain-module.md), [`examples/underhood-module.md`](./examples/underhood-module.md), [`examples/plain-pr.md`](./examples/plain-pr.md), and [`examples/underhood-pr.md`](./examples/underhood-pr.md).

<details open>
<summary><code>/underhood explain packages/pg-pool/</code></summary>

> **Scope:** `packages/pg-pool/` · Module · queue-driven asynchronous resource manager (LIFO idle stack / FIFO waiter queue) · static analysis, nothing executed<br>
> **Coverage:** read 2 behavior-carrying files (`packages/pg-pool/index.js`, `packages/pg-pool/esm/index.mjs`); not read: 17 test suites in `packages/pg-pool/test/*`
>
> **At a glance:** pg-pool manages a bounded collection of persistent PostgreSQL client instances, brokering checkouts and automating query lifecycles over Node's single-threaded event loop. State lives in four collections on the Pool instance: an array of all active clients, a LIFO stack of idle clients, an unbounded FIFO queue of acquisition callbacks, and a WeakSet of expired instances. The sharpest operational risk is unhandled idle connection failures: if an idle client drops its TCP connection and the caller has not registered a `pool.on('error')` listener, Node's EventEmitter throws an unhandled error and terminates the process.
>
> […]
>
> **4. Failure modes** — *Queue acquisition timeout:* Timeout fires while waiter is in `_pendingQueue` at `packages/pg-pool/index.js:219` → `removeWhere(this._pendingQueue, ...)` removes waiter at line 222 → sets `pendingItem.timedOut = true` at line 223 → waiter callback called with timeout error at line 224. *Late acquisition recovery:* If a client becomes available or finishes connecting after timeout, `_acquireClient` checks `pendingItem.timedOut` at `packages/pg-pool/index.js:346, 360` and calls `client.release()`, preventing connection leakage.
>
> […]
>
> **5. Spec vs. implementation** — *Non-obvious runtime costs verified in source:* `this._pendingQueue` (`packages/pg-pool/index.js:105`) has no maximum size limit. Under sustained connection starvation without `connectionTimeoutMillis`, pending requests accumulate in memory indefinitely. […]

</details>

<details open>
<summary><code>/underhood explain PR 3838</code> (Delta mode)</summary>

> **Scope:** PR 3838 (`brianc/node-postgres#3838`) · Delta · async context propagation & native socket handle reset · static analysis, nothing executed
>
> **At a glance:** PR 3838 addresses a known memory leak and context pollution bug where long-lived TCP socket handles retain the AsyncLocalStorage (ALS) context active when they were first opened, leaking APM trace metadata and delivering subsequent query callbacks into obsolete async contexts. […] The highest-risk choice is an invasive workaround for Node < 24 that reflects over `Object.getOwnPropertySymbols(handle)` to forcefully wipe `kResourceStore`, which has already received collaborator pushback.
>
> […]
>
> **1. Intent vs. reality** — *Omission in implementation:* The PR description states it resets the handle "once right after it finishes connecting". In reality, the diff does not do this. `resetClientAsyncContext(client)` is guarded by `if (!isNew)` in `_acquireClient` (`packages/pg-pool/index.js:407-409`). Newly created connections never have resetClientAsyncContext invoked.
>
> […]
>
> **Highest-risk change:** `packages/pg-pool/index.js:75-80` (`handle[resourceStoreSymbol] = undefined` via `Object.getOwnPropertySymbols`), which mutates undocumented Node internal symbols by string matching, creating unvetted runtime coupling and performance overhead on every client acquisition.

</details>

The PR was still open when this was run, so its discussion may have moved on.

## Benchmark: Underhood vs. a plain prompt

Same repo, same agent, same session setup. The plain runs were made without the skill installed, so the agent could not trigger it by accident.

| | |
| :-- | :-- |
| Repo | `brianc/node-postgres` |
| Agent | Antigravity (`agy`) |
| Model | Gemini 3.8 Flash (high) |
| PR run | An open PR on the same repo (exact commit not pinned) |
| Runs | One run per prompt. Treat this as an illustration, not a statistical benchmark. |

The repository commit was not pinned for these runs, so output on newer commits may differ.

**Prompts**

| | Plain | Underhood |
| :-- | :-- | :-- |
| Module | *"I'm new to this codebase. Can you explain what packages/pg-pool does and how it works?"* | `/underhood explain packages/pg-pool/` |
| PR | *"Review PR #3838 on brianc/node-postgres and summarize what it changes and whether it looks safe to merge."* | `/underhood explain PR 3838` |

The plain PR prompt asks for a merge verdict and the Underhood one does not, so read the PR comparison with that in mind.

### Module: `packages/pg-pool/`

| | Plain prompt | Underhood |
| :-- | :-- | :-- |
| Agent-reported thinking time | ~28 s | ~1 m 38 s |
| Citations | One `file:line` reference | `file:line` on nearly every claim |
| Design reasoning | Not covered | LIFO idle list + FIFO waiters, with the rejected alternative |
| Failure handling | Idle-connection errors, eviction conditions, teardown | Five interrupted paths traced with line numbers, including late-arriving clients after a queue timeout |
| Runtime costs | Not covered | Unbounded queue, linear `removeWhere` scans, per-checkout allocations |
| Idle-connection errors | Says the pool emits `'error'` "so the application process does not crash" | Says the process crashes if no `pool.on('error')` listener is registered |
| Readability for a newcomer | Better: reads like a guided tour | Reads like a reference document |

### PR: #3838

| | Plain prompt | Underhood |
| :-- | :-- | :-- |
| Agent-reported thinking time | ~83 s | ~80 s |
| Both found | The `kResourceStore` symbol hack, the `isNew` async-scope bypass, the description-vs-diff mismatch on resetting after connect, and the hot-path overhead | (same) |
| Only in the plain run | An explicit "not safe to merge" verdict, a verbatim maintainer quote, PR status and size, a fix list | |
| Only in the Underhood run | | Before/after code with `file:line` on both sides, an unupdated `PendingItem` call site in `_afterConnect`, the point that on Node ≥ 24 the symbol scan runs on every checkout and always finds nothing, a symbol-substring collision risk, tests coupled to Node internals, one named highest-risk line |

### How to read this

On the module, the gap is large: Underhood's output is checkable line by line and covers failure paths and design reasoning the plain answer skips. On the PR, a good review prompt found the same headline problems, and Underhood's advantage is precision and a few extra edges rather than a different conclusion.

Use a plain prompt for a quick "what is this?" Use Underhood when you are about to modify, review, or rely on the code and want claims you can verify against specific lines.

Reproduce it:

```bash
git clone https://github.com/brianc/node-postgres && cd node-postgres
# plain prompts first, before `npx underhood init`
npx underhood init
```

## Supported agents

One specification, native adapters for each tool.

| Agent / environment | Invocation | Integration |
| :-- | :-- | :-- |
| Google Antigravity (`agy`) | `/underhood` | Slash command with autocomplete |
| Claude Code (`claude`) | `/underhood <target>` | Slash command |
| Cursor | `/underhood` in Composer / Chat | Project rule (MDC) |
| Windsurf | `/underhood` in Cascade | Cascade rule |
| OpenCode / Qoder | `/underhood` in Command Palette | TOML command |
| Devin / Cline | `/underhood` | Agent skill |
| ChatGPT / Claude / Copilot (web) | Paste [`AGENTS.md`](./AGENTS.md) | Standalone prompt, no install |

## Scope and limitations

- **Static analysis only.** Underhood reads source; it does not run your code, so runtime behavior is reasoned about, not observed.
- **Claims are labeled.** Unmarked statements were read directly in source. `[INFERRED]` marks a reasoned guess; `[UNKNOWN]` marks something the code does not reveal. Spot-check citations before relying on them.
- **Coverage is stated.** Every report lists which files were read and which were not.
- **The spec check covers the docs the agent reads.** In the pg-pool run, claims were checked against the package README only, not a separate docs site.
- **It can trigger without being named.** Agents that discover skills by description may invoke it on a plain "explain this codebase" prompt. Remove the skill to get a plain baseline.
- **It is slower than a casual answer.** Expect more thinking time on module runs.
- **Single turn.** It does not ask clarifying questions first; if your target is ambiguous, check the `Assumptions` line.

## Contributing

Issues and pull requests are welcome, especially adapters for agents not listed above, and reports of wrong citations or missed code paths.

## License

[MIT](./LICENSE) © [Harsh Aghara](https://github.com/harsh-aghara)
