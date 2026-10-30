---
name: underhood
description: >-
  High-precision architectural and execution analysis tool. Calibrates scale dynamically
  (Monolith, Subsystem, or PR/Diff) and extracts system topology, primary execution trace,
  architectural trade-offs, failure mode mechanics, and specification audits.
  Single-turn execution with zero conversational overhead.
metadata:
  icon: visibility
---

# Codebase Architectural & Execution Analysis (`/underhood`)

Deliver a high-precision architectural and execution analysis of the target codebase, subsystem, or PR.
Analyze the target objectively: map state transitions, concurrency boundaries, and failure limits.

Execute as a single-turn analysis without interactive pauses, quizzes, or conversational filler.

---

## 1. Scale & Topology Calibration

Assess target scope before structuring the analysis:

### A. Scale Calibration
- **Monolith / Macro (7+ behavior-carrying files)**:
  Group components into 3–4 logical subsystems or stages with explicit handoff data structures. Identify the core state engine (the primary module managing state mutation or concurrency) and focus detailed tracing there.
- **Localized Module (< 6 behavior-carrying files)**:
  Bypass high-level stage abstractions. Trace line-level execution, state transitions, and resource lifecycles directly.
- **Delta / PR Review (Diff, commit, or changed files)**:
  Prioritize behavioral changes (before vs. after), broken invariants, regression blast radius, and unhandled edge cases.

### B. System Topology Classification
Classify the primary system topology based on how the code naturally moves:
- **Pipeline / Stream**: Serial stages, transformations, and handoff contracts.
- **State Machine / Event Loop**: Discrete states, transitions, tick intervals, and worker loops.
- **Event-Driven / Pub-Sub**: Emitters, subscriptions, dispatch cycles, and message lifecycles.
- **Layered / Domain-Driven**: Controller, service, and persistence boundaries with transaction semantics.

### C. Execution Discipline: Reading Sequence
Inspect the codebase in strict operational sequence before generating the analysis:
1. Entry Points: Inspect module entry points, CLI handlers, or public interface boundaries.
2. State Engine: Identify the primary component managing state mutations or concurrency.
3. Execution Path: Trace the primary operation path end-to-end across files.
4. Contracts: Audit external boundary contracts and assumptions.
Do not examine peripheral utilities, data schemas, or configuration files first.

---

## 2. Technical Analysis Requirements

Structure the response into the following five sections:

### Section 1: System Topology & Core State Engine
- **Topology & Primary Purpose**: Define the architecture type and single primary responsibility in technical terms.
- **Subsystem Map & Boundaries**: Component breakdown, one-line functional role per component, and explicit handoff data structures crossing subsystem boundaries.
- **Excluded Surface**: Explicitly list non-behavioral boilerplate omitted from scope (configuration, migrations, routing boilerplate, DTO definitions).
- **Core State Engine**: Name the specific module or file where volatile state, concurrency control, or critical invariants reside.

### Section 2: Primary Execution Path Trace
Trace the primary operation end-to-end:
- Chronological, step-by-step call path with exact `file:line` (or `file#symbol`) citations.
- **State Mutations**: Explicitly document every modified variable, in-memory collection, cache, or persistent record.
- **Async & Concurrency Boundaries**: Explicitly identify asynchronous boundaries, thread dispatch, synchronization primitives, or background tasks if present. If execution is synchronous, trace stack frames and invocation depth directly.
- **Resource Disposal**: Exact cleanup sequence, handle closure, or memory reclamation paths.

### Section 3: Architectural Decisions & System Contracts
- **Primary Design Rationale**: Identify the core architectural pattern or data structure chosen by the author. State what concrete constraint, performance objective, or trade-off motivated this approach over the naive default.
- **Rejected Alternatives**: Name the viable alternative pattern and explain the specific failure mode, coupling, or performance penalty that led to its rejection.
- **Upstream Contracts & Invariants**: Document what guarantees this code strictly assumes from its callers, dependencies, or language runtime to remain correct.

### Section 4: Operational Boundaries & Failure Modes
Evaluate mechanical behavior at root-cause state level (in-memory data structures, pointers/references, lifecycle handles, and resource allocation)—not superficial log strings or catch blocks:
1. **Nominal Path**: Execution lifecycle, state mutations, and resource cleanup under standard completion.
2. **Interrupted / Exceptional Path**: Behavior when operations stall, fail, or encounter malformed input. Detail active handles, uncleaned state in collections, and error propagation boundaries.
3. **Concurrency & Re-Entrancy**: Behavior under concurrent execution, re-entrant invocations, or repeated teardowns. If single-threaded/synchronous, state this explicitly and evaluate state consistency under unexpected call order.

### Section 5: Specification vs. Implementation Audit
Audit documented behavior (README, docstrings, architectural notes) against implementation reality:
- Evaluate documented guarantees regarding safety, complexity, or idempotency as `[SUPPORTED]`, `[PARTIAL]`, or `[SPEC-vs-CODE GAP]`. If the implementation faithfully guarantees all claims with zero gaps, explicitly state `[VERIFIED: Implementation matches documented specification]`.
- Note any implicit costs (unexpected allocations, unconstrained resource growth, or unhandled conditions).

---

## 3. Evidence & Verification Rules

- Base all claims on verified source code. If context is missing, explicitly cite: `[UNKNOWN: Cannot locate <symbol/path>]`.
- Cite exact code locations (`file:line`).
- Label claims: `[VERIFIED]` (confirmed in visible source or test) or `[INFERRED]` (deduced from contracts/types).
- Do not use abstract qualifiers (e.g., "scalable", "robust", "modular"). Ground all explanations in concrete data structures, execution timing, and state transitions.
- Execute as a single-turn analysis. Do not pause for interactive prompts, quizzes, or conversational filler.
