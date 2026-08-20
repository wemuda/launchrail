# ADR-0029: Planning interaction contract — decision budget, build-safe stopping, phase legibility

## Status
Accepted — amends the stage contract and conductor rules in `workflow.md` (the grill, wayfinder, and conductor skill contracts with them) and ADR-0009's conductor duties

## Context
The first rigorous outside run of the full rail (a colleague taking a real product from vision to implementation, using every stage as intended) produced a field report with a hard number in it: roughly **146 decisions or questions put to the human before any running software existed**. The report's diagnosis, which we accept:

- The grill's stopping rule — an empty frontier, every branch visited — is wrong for generative work. Product design produces questions faster than it answers them; "nothing left silently assumed" read as "everything answered" is unreachable before implementation, so the grill could not end well.
- Equal ceremony was applied to unequal risks: tenant isolation and billing arithmetic got the same pre-implementation treatment as donut slice counts and empty-state copy.
- Planning recursed: a foundation grill, then a wayfinder map whose tickets each invoked another exhaustive grill — convergence duplicated at several levels, and one map ticket was outright delivery work (implementing a PDF worker) that wayfinder's own contract says doesn't belong there.
- Rounds of five to eleven interdependent questions exceeded anyone's working memory; the human began delegating answers wholesale, at which point "human in the loop" had become procedural approval rather than meaningful control.
- The human was asked to own technical defaults that were reversible implementation details.
- Progress was internally legible only: stages, tickets, rounds, frontier, fog, and reopened ADRs are agent vocabulary. "7 of 16" answered nothing about distance from a usable product; transitions between stages arrived as loose prose.
- An approved, substantial interactive prototype was treated as a feature inventory to trim rather than a decision record — features it showed were repeatedly proposed for removal without a concrete cost or safety reason.

What the report validated stays untouched: committed artifacts over chat memory, distinct outputs per stage, serious upfront work on genuinely dangerous decisions, and verification as part of delivery.

## Decision
Adopt an **interaction contract**, binding on every stage that spends the user's attention, plus a **legibility layer** over the stages. Normative text lives in `workflow.md`; the grill and wayfinder skills carry the mechanics.

**The interaction contract:**

- **Decision ownership is split.** The user owns product promises, priorities, risk tolerance, and irreversible or costly-to-reverse tradeoffs. The agent owns reversible implementation details within those constraints — chosen as defaults, recorded as **Provisional**, changeable without re-planning.
- **Every uncertainty is labeled** — `decide-now`, `agent-default`, `research`, `prototype`, or `defer` — and only `decide-now` (ownership *and* dependency: the user's kind of decision, and the next slice depends on it) becomes a question.
- **Rounds hold at most three questions**; a genuinely consequential decision rides alone. Each question ships with a recommended answer.
- **Sessions budget about six user decisions.** A spent budget closes the session (artifact, summary, next command) rather than pressing on.
- **A checkpoint lands every two rounds**: continue / prototype / defer / build — the user steers the process itself, not just the answers.
- **Planning stops at build-safety**: the next vertical slice can be built safely — its decisions Locked or safely Provisional — never at frontier exhaustion. "Nothing silently assumed" now means every open question is labeled and parked, not answered. The foundation grill opens with a **risk cut**: the ~five assumptions that could kill or reshape the product form the decide-now agenda; the long tail defaults or defers.
- **Approved prototypes have authority.** Behavior an approved prototype or committed handoff package shows is presumed in scope; a proposed cut requires a concrete safety, infrastructure, or measured-cost reason.
- **Planning keeps touching ground**: never more than two consecutive planning sessions or planning tickets without a runnable or visual checkpoint. Wayfinder is decisions-only — the execution override is removed, Task tickets must name the decision they unblock, maps don't nest, and a ticket's grill inherits settled decisions under a tight budget instead of re-converging.

**The legibility layer:**

- The thirteen stages remain the normative contract (ownership, artifacts, gates) but are **presented as six phases** — Intent, Exploration, Decisions, Blueprint, Build, Ship — each answering one plain question. A sized feature counts phases against its own path.
- Every orientation, routing, stage close, and session summary renders the **rail banner**: a fixed fenced block — phase m of n, Done / Now / Next / Later, one `➤` next action — never loose prose.
- Session summaries contain exactly four blocks: **Locked, Provisional, Deferred, Next command**.

## Alternatives considered
- **Replace the grill with prototype-first planning** — rejected: the report itself endorses convergence for dangerous decisions; the failure was the stopping rule and the routing of trivia through the human, not convergence as such. The prototype gains authority and the checkpoint offers "prototype" as a first-class move instead.
- **Collapse the stage list to six stages** — rejected: stages carry the artifact and ownership contract, and renumbering would orphan every existing reference (ADR-0015 already renumbered once). Presentation changes; the contract doesn't.
- **Hard mechanical caps enforced by tooling** (a linter counting questions) — rejected: the numbers are working-memory calibration, not law; a consequential decision legitimately rides alone, and a trivial confirm can share a round. The contract makes violations visible and nameable, which is what a text protocol can enforce.
- **Keep the empty-frontier rule but shrink rounds** — rejected: smaller rounds against an unbounded frontier just stretch the same 146 decisions over more sessions. The stopping rule is the load-bearing fix; the budget and round caps only make the path to it humane.

## Consequences
- Easier: a human can steer a full planning arc without exhaustion; progress and transitions are legible to someone who knows nothing about the rail's internals; prototypes stop being re-litigated; reversible choices become cheap Provisional defaults instead of interview items.
- Harder: the agent carries real judgment weight — triaging labels honestly (a mislabeled `agent-default` on an irreversible choice is now a contract violation, not a style miss) and keeping Provisional records faithful so revisiting stays cheap.
- Constrained: exhaustive pre-implementation closure is no longer an available mode, even when a user's instinct asks for it — the checkpoint is where they can consciously choose "continue" anyway.

## Revisit when
- Field runs show six decisions per session or three questions per round mis-calibrated in either direction.
- Provisional defaults are observed silently hardening into unrevisited de-facto decisions — the label needs a lifecycle (review triggers, expiry) beyond a marker.
- The phase view needs per-project customization (different phase names or counts) rather than one fixed six-phase vocabulary.
- Tooling gains a way to render position (a `launchrail status --rail` or richer tracker integration) that should replace the hand-rendered banner.
