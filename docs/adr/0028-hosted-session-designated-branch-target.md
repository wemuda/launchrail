# ADR-0028: Hosted-session Ralph runs target the session's designated branch

## Status
Accepted (amends [ADR-0026](0026-ralph-default-consolidation.md))

## Context
Hosted sessions (claude.ai/code and similar) pin every session to a designated working branch at start and instruct the agent: develop on this one branch, never push others, never open a PR unprompted. Those rules live in the session's system prompt, which outranks any skill text.

The first spec-sized campaign run in such a session exposed the gap. `/launch-implement` on a 9-ticket spec resolved the scope correctly, then concluded the Ralph engine was forbidden — every declared engine (the `ralph` workflow and the skill-mode exception alike) is built out of per-ticket branches and PRs — and collapsed to sequential in-session implementation on the designated branch, citing the skill's exception clause. That is exactly the degradation the loop exists to prevent (one context filling with a whole backlog's diffs), reached through the loop's own escape hatch: the clause names when the engine may be swapped but not what must survive the swap, and nothing anywhere said what the integration target is when the environment has already named a branch.

The collision is illusory. The hosted pin constrains the *deliverable* — mainline stays untouched until a human acts — which is precisely what ADR-0026 consolidation guarantees. And the user typing `/launch-implement` is the explicit authorization the pin's "without permission" clauses ask for: the command's documented contract is per-ticket branches and PRs collecting onto one integration branch.

## Decision
Resolve it by naming, not by a new mode:

- **The designated branch is the integration target.** In target resolution, the session's pinned working branch outranks the scope-native `spec/*` name and the generated fallbacks; only a branch the user explicitly names outranks it. The session branch exists to receive exactly this run's work — a `spec/*` twin minted beside it would strand the campaign where the session's own delivery flow never looks.
- **A pinned environment re-targets the run; it never changes the engine.** Per-ticket `ralph/*` branches and their PRs are the loop's internal mechanics, authorized by the user-typed start; they all land on the target, mainline stays untouched, and the release PR `<target> → <default>` stays offered, never opened. Environment rules about branches or PRs therefore never select the skill-mode exception and never license sequential in-session implementation.
- **The exception clause is tightened** to state the invariants that survive every engine swap: fresh context per ticket, per-ticket PRs into the target, the loop-owned merge gate.

The mechanism is unchanged: `ralph.workflow.js` already takes any `target` arg; the front door simply passes the designated branch. Policy text lands in both frontends and the workflow's policy block, per ADR-0005's parallel-policy rule.

## Alternatives considered
- **A declared "local consolidation" engine mode** — worktree-isolated implementers merged locally, no remote branches or PRs — rejected: it forks the engine into a second shape to appease constraints the environment does not actually impose once the user's start is read as the authorization it is. Per-ticket CI and PR history would be lost for nothing.
- **Accept the sequential in-session fallback in pinned sessions** — rejected: it is the documented anti-pattern (one degrading context owning a whole backlog), and it silently discards parallelism, fresh contexts, and per-ticket gates.
- **Keep scope-native naming and push `spec/*` from hosted sessions anyway** — rejected: the campaign would land on a branch the session's delivery flow never surfaces, and the pinned branch would end the run empty — the one branch the user is watching.

## Consequences
- Easier: hosted sessions run the same loop as everywhere else — same engine, same policies, same recap; the user ends with the campaign consolidated on the branch their session already tracks, ready to release to mainline as one reviewed PR.
- Harder: nothing mechanical; the front door checks one more fact (does the environment pin a branch?) before naming the target.
- Constrained: in a pinned session the single-ticket mode's base is the designated branch too — its one PR merges there, not to mainline.

## Revisit when
- Hosted environments start rejecting pushes of any non-designated branch at the transport level (not just by instruction) — that would force the worktree-local engine variant this ADR declined.
- A campaign needs to span multiple hosted sessions, which would reopen how one integration branch is shared between pins.
