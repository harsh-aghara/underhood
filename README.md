<h1 align="center">Underhood (`/underhood`)</h1>

<p align="center">
  <em>The whiteboard test for your code. Stop vibe-skimming, start owning.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-111111?style=flat-square" alt="Version">
  <img src="https://img.shields.io/npm/v/underhood?style=flat-square&color=111111&label=npm" alt="npm">
  <img src="https://img.shields.io/badge/works%20with-20%20agents-111111?style=flat-square" alt="Works with 20 agents">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/zero%20Q%26A%20friction-single%20turn-111111?style=flat-square" alt="Single Turn">
</p>

---

Every team has that staff engineer. 

You pull them into a Slack huddle, point to a terrifying legacy repo you just inherited or a 2,000-line PR, and ask what it actually does.

They don't read every file. They ignore the configs, the DTOs, the linter rules, and the routes. They walk up to a whiteboard, uncap a dry-erase marker, draw three boxes, and say:

> *"Ignore the 40 files in `/src`. This whole service is just an event queue pretending to be an API. The only place state actually changes is right here on line 74. If this worker drops its connection before writing the ack, the message gets re-delivered forever. Everything else is just plumbing."*

In ninety seconds, you actually understand how the machine moves.

Now compare that to what happens when you ask an AI assistant to explain a codebase:

> *"This repository utilizes a modular, decoupled architecture following industry best practices. It features comprehensive error handling, scalable data pipelines, and a robust TypeScript foundation designed for maximum developer velocity..."*

You nod along. You close the tab. Five minutes later, someone asks you what breaks if an operation times out, and you have no idea.

You didn't understand the code. You just read a promotional brochure about the nouns in the directory tree.

**`/underhood` puts the whiteboard architect into your AI coding agent.**

---

## The Whiteboard Standard

You understand code deeply when you can close the editor and the AI and do four things from your own head:

1. **Trace the fuel line**: Follow one operation from call to cleanup, naming every line where state changes.
2. **Defend the choice**: Explain why the author built it this way instead of the obvious alternative, and what broke when they tried.
3. **Predict the failure**: State what happens when a network call hangs, a function is called twice, or an input is malformed.
4. **Catch the lie**: Spot the exact line where the README promised "zero overhead" or "thread-safe", but the implementation disagreed.

If you can't walk up to a whiteboard and predict what the code does before running it, you don't own it yet. You just vibe-coded.

---

## Before / After

### You ask standard AI: *"Explain this PR / repo"*
> *"This PR implements connection pooling optimizations. It refactors the checkout flow into modular helper functions and adds defensive checks to improve stability and resource management across high-concurrency workloads."*

### You run `/underhood`:
> **Scope:** `src/pool/` · Module · State Machine · static analysis, nothing executed  
> **Coverage:** read 3 behavior-carrying files; not read: `test/` (fixtures only)  
> **Assumptions:** none  
> **Evidence:** unmarked claims were read directly in source · [INFERRED] · [UNKNOWN]  
>  
> **At a glance:** Connection lease state machine wrapping an upstream driver. Active leases and timeout handles live in an internal Map in `src/pool/tracker.ts:18`. The sharpest operational edge is double-release, which exits as a silent no-op without corrupting timer state.  
>  
> **1. Topology & Core State Engine**  
> - **Purpose:** State machine lease tracker managing client socket lifecycle.  
> - **Flow:** `acquire()` [pool.ts:42] $\rightarrow$ lease budget [tracker.ts:55] $\rightarrow$ unref timer [tracker.ts:68] $\rightarrow$ client socket  
> - **Core state engine:** `src/pool/tracker.ts:18` holds lease Map and timer references.  
>  
> **2. Primary Execution Path**  
> 1. `acquire()` at `pool.ts:42` queries lease budget at `tracker.ts:55`.  
> 2. `tracker.ts:68` arms checkout timeout timer with `unref()`.  
> 3. `pool.ts:89` rebinds `this` context before dispatching to caller.  
>  
> **3. Decisions & Contracts**  
> - **Design choice:** Internal Map for leases instead of socket properties [INFERRED: avoids collision with third-party middleware].  
> - **Alternative not taken:** Monkey-patching client socket; causes silent collision under nested interceptors.  
> - **Upstream contracts:** Caller must invoke `release()` once per checkout.  
>  
> **4. Failure Modes**  
> - **Nominal:** `release()` at `pool.ts:104` deletes Map entry and clears timer.  
> - **Interrupted / Timeout:** Timer fires at `tracker.ts:74`, destroys socket, rejects pending checkout.  
> - **Concurrency / Re-entrancy:** Calling `release()` twice is a silent no-op; second call receives `undefined` and exits without corrupting timer state.  
>  
> **5. Spec vs. Implementation**  
> | Claim | Where stated | Status | Evidence |  
> | :--- | :--- | :--- | :--- |  
> | Zero-allocation tracking | README.md:14 | GAP | Line 68 allocates anonymous closure on every checkout |

---

## 🚀 1-Command Installation

Add `/underhood` to your current project in 2 seconds:

```bash
npx underhood init
```

*Or install globally across all your projects (`~/.gemini`, `~/.claude`):*
```bash
npx underhood init --global
```

---

## 🛠️ Works Across Your Entire Toolchain

One universal specification. Native adapters for every major coding agent:

| Agent / Environment | Invocation | How It Runs |
| :--- | :--- | :---: |
| **Google Antigravity (`agy`)** | `/underhood` | Native autocomplete slash command |
| **Claude Code CLI (`claude`)** | `/underhood <target>` | Native terminal command |
| **Cursor** | `/underhood` in Composer / Chat | Native MDC project rule |
| **Windsurf** | `/underhood` in Cascade | Native Cascade rule |
| **OpenCode / Qoder** | `/underhood` in Command Palette | Native TOML command |
| **Devin / Cline** | `/underhood` | Integrated agent skill |
| **Web ChatGPT / Claude / Copilot** | Copy-paste `AGENTS.md` | Zero-dependency standalone prompt |

---

## 🎯 Usage (Zero Ceremony)

Syntax-agnostic. Give it whatever you're looking at:

```bash
# 1. Full Repository (Onboarding, Hackathons, Architecture Reviews)
/underhood
/underhood this repo

# 2. Pull Requests & Code Reviews (Catch broken invariants before merge)
/underhood pr 14
/underhood pr #14
/underhood https://github.com/org/repo/pull/14

# 3. Subsystems & Modules (Deep-dive into the complex stuff)
/underhood src/engine/
/underhood src/storage/wal.rs

# 4. Commits & Diffs (Investigating regressions)
/underhood commit 8e3a21b
/underhood git show HEAD~1
```

---

## 🔬 What Every Output Delivers

Every response is a single-turn, high-density technical analysis tailored to the target scope:

### Repositories & Modules (Sections 1–5)
1. **Topology & Core State Engine**: Identifies whether the system is a Pipeline, State Machine, Event Loop, or Layered Domain with a compact ASCII flow diagram. Groups files into subsystems with **explicit handoff data structures** and pinpoints where volatile state lives (`file:line`).
2. **Primary Execution Path Trace**: Chronological numbered call path of the primary operation with exact `file:line` citations, state mutations, and async/concurrency boundaries.
3. **Architectural Decisions & Contracts**: Why the author chose this pattern, **what alternative was rejected and why it would fail**, and upstream dependency assumptions.
4. **Operational Boundaries & Failure Modes**: Evaluates mechanical behavior at the data structure level: nominal completion, interrupted/timeout paths, and concurrent re-entrancy.
5. **Specification vs. Implementation Audit**: Audits README/doc claims against source code reality in a structured audit table (`SUPPORTED`, `PARTIAL`, or `GAP`), uncovering hidden runtime costs.

### Pull Requests & Diffs (Delta Mode, Sections 1–6)
When pointed at a PR (`/underhood pr 14`), commit, or diff, `/underhood` switches to **Delta mode**:
1. **Intent vs. Reality**: Verifies PR title/description promises against actual diff mechanics.
2. **Behavior Delta**: Pre- vs post-change state mutations and control flow with `file:line` citations on both sides.
3. **Invariants & Contracts Touched**: Guarantees kept, weakened, or broken, and new upstream assumptions.
4. **Blast Radius**: Callers, consumers, and dependents of changed symbols with test coverage mapping.
5. **Unhandled Edges & Failure Modes**: Leaks, timeout traps, and concurrency races introduced by the diff.
6. **Docs & Tests Out of Sync**: Discrepancies between modified code and existing documentation/tests.  
*Ending with:* **Highest-risk change**: The single most dangerous change in the diff and why, citing code.

---

## ⚖️ License

MIT © [Harsh Aghara](https://github.com/harsh-aghara)
