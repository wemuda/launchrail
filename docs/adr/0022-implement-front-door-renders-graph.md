# ADR-0022: The implement front door renders the graph and starts immediately

## Status
Accepted — amends [ADR-0018](0018-implement-front-door.md) (front-door behavior; resolves its "single-ticket path drifts from the dispatch contract" revisit clause) and [ADR-0005](0005-ralph-two-frontends-one-policy.md) (adds a graph-render step to both loop frontends). Builds on [ADR-0020](0020-independent-skill-set.md), which removed the Superpowers provider and the `implementationLoop` field — Ralph is the sole implementation loop, which is why the door has no engine to choose between.

## Context
Field feedback on `/launch-implement`: it deliberates too much before anything builds. The front door carried a three-step routine — enumerate six scope forms, repair setup, then "route by scope" — and that last step made a workflow-vs-skill judgment call and restated an eight-step single-ticket contract kept **textually parallel** with `launch-ralph` (ADR-0018's deliberate choice). That is a lot of reading and deciding for a door whose entire job, now that Ralph is the only loop (ADR-0020 removed the provider seam), is *show the plan and start*. The thinking-to-output ratio was wrong at the exact moment of maximum momentum.

Two smaller gaps rode along. Nothing showed the user the **ticket dependency graph** before a campaign started — the first visible artifact was dispatch logs, so a wrong scope or a surprise edge surfaced only after the loop spent tokens. And the duplicated single-ticket contract was precisely the drift risk ADR-0018 pre-registered in its "revisit when."

## Decision
1. **The front door is render-graph-then-start.** `launch-implement` reads two things (`issueTracker` + `testing` commands; the scope, defaulting to the whole ready frontier), renders the scoped frontier as an ASCII dependency graph **in the chat**, then hands the scope to `launch-ralph` and runs it **watchably in this session**. The six enumerated scope forms collapse to one compact line; the workflow-vs-skill decision defaults to the watchable in-session run, with the `ralph` workflow reserved for long / wide / walk-away runs.
2. **The single-ticket path stops duplicating the dispatch contract.** `/launch-implement <n>` invokes `launch-ralph-implement` on that number in-session (dependency-gate first, then PR / merge / remote-verified close), rather than restating an eight-step contract. This gives ADR-0018's revisit clause its resolution: the per-ticket contract has **one home** (`launch-ralph-implement`), not textual parallelism across two files.
3. **The graph render is a shared step of the loop, documented once.** `launch-implement` owns the format; `launch-ralph` renders it before the first dispatch; the `ralph` workflow logs the same tiered ASCII in its Graph phase via a pure renderer (no clock, no randomness — a resumed run renders identically). Format: tiers by dependency depth, `←` open blockers, `→` what each ticket unblocks, with cycles and unresolved edges surfaced rather than hidden.
4. **The safety properties are untouched.** `disable-model-invocation` stays on the door; `npx @wemuda/launchrail verify` still gates every merge and the loop close-out; the loop is still never started unprompted (ADR-0018 §2, ADR-0005). The change is subtractive — less prose, less duplication — plus one rendering step.

## Alternatives considered
- **Keep the textually-parallel single-ticket contract** (ADR-0018's original choice). Rejected: real use hit the exact drift the clause named; one home beats two hand-synchronized copies, and the door is lighter for it.
- **Put the graph only in the workflow (headless).** Rejected: the user watches the chat before a walk-away launch, so the front door is where "look before you leap" pays off; the workflow log is a consistency bonus, not the primary surface.
- **Draw box-and-line graph art.** Rejected: fragile across arbitrary graphs. A tiered list with blocker/unblocks annotations is deterministic to produce and reads at a glance.
- **Write a fresh ADR asserting "Ralph is the only loop."** Unnecessary: ADR-0020 already decided that. This ADR only removes the deliberation a single fixed loop no longer needs.

## Consequences
- **Easier:** the door's read-to-act ratio drops sharply — two reads, a graph, a launch. Users see the plan (and catch a wrong scope) before a campaign spends a token. The per-ticket contract has one maintenance home instead of two.
- **Constrained / harder:** nothing new is constrained. The remaining parallel surface between `launch-implement` and `launch-ralph` is a shared *graph format referenced by name*, far smaller than the retired eight-step contract.
- **No structural churn:** no manifest, lockfile, or migration change — the skills and the workflow are managed files that flow through the normal `sync`. The example snapshot and the generated `## The Ralph loop` instructions gain the graph-step mention.

## Revisit when
- The tiered ASCII proves unreadable on very wide graphs (hundreds of ready tickets at once) — then paginate, or summarize by per-tier counts with detail on request.
- A second implementation loop returns (ADR-0020's provider-seam trigger fires) — the door would regain exactly one decision, *which loop*, and this ADR's "no deliberation" stance narrows to "no deliberation beyond loop selection."
- The single-ticket in-session path and the orchestrated dispatch visibly diverge again despite sharing `launch-ralph-implement` — then the shared skill, not the front door, is where the fix lands.
