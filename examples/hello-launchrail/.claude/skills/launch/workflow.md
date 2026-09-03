# The Launchrail core workflow

How a project moves from idea to verified, released software through committed artifacts. The rail is one complete, self-contained skill set — every stage owner is a Launchrail `launch-*` skill, written to the rail's artifact contract ([ADR-0020](https://github.com/wemuda/launchrail/blob/master/docs/adr/0020-independent-skill-set.md); several absorb methodology from [Matt Pocock's skills](https://github.com/mattpocock/skills), credited in `NOTICE.md`). This document carries four contracts: the **phase view** (what the user is shown), the **stage table** (which skill owns which stage and what artifact it must leave behind), the **interaction contract** (how any stage spends the user's attention — ADR-0029), and the **conductor rules** (how the `launch` conductor, and any agent working the rail, behaves between stages).

## Running it

Two commands cover the whole rail:

- **`/launch`** — plan. It detects which stage the project has reached from its committed artifacts and runs or routes to that stage's owner; it takes a stage name (`vision`, `discovery`, `design-validation`, …) to jump straight there, and it sizes each new feature once the foundation exists ([ADR-0009](https://github.com/wemuda/launchrail/blob/master/docs/adr/0009-launch-orchestrator-skill.md), [ADR-0018](https://github.com/wemuda/launchrail/blob/master/docs/adr/0018-implement-front-door.md)).
- **`/launch-implement`** — build. The single entry point for stage 10: it drives ready tickets to verified merges through the project's selected loop — the whole frontier, a spec's tickets, the next N ("max 5"), or one ticket at a time.

## The phase view — what the user is shown

The rail's internal machinery is thirteen stages, and stages, tickets, rounds, frontiers, and fog are all real concepts — but they are *the agent's* working vocabulary, not the user's progress model. "Stage 7 of 12" tells a user nothing about how far they are from using their product. So the rail is **presented as six phases**, each answering one plain question ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)):

| Phase | Name | Answers | Stages inside |
|---|---|---|---|
| 1 | **Intent** | What are we building, for whom, and what would prove it? | 0 Setup · 1 Vision |
| 2 | **Exploration** | What should it feel like, and what options exist? | 2 Visual exploration · 3 Discovery |
| 3 | **Decisions** | Which risks and choices must be settled before building? | 4 Grill · 5 Research · 6 ADRs |
| 4 | **Blueprint** | What exactly is the next slice, and is it right on screen? | 7 Spec · 8 Design validation · 9 Tickets |
| 5 | **Build** | Does it work, end to end? | 10 Implementation |
| 6 | **Ship** | Is it proven and released? | 11 Verification · 12 Release |

Stages stay the normative contract — ownership, artifacts, and gates are all stage-level, and nothing below changes meaning. Phases are the *legibility layer*: every report of position, every transition, and every session close is phrased in phases first, stages second. A sized feature walks a subset of the rail, so its banner counts the phases **on its own path** (a semi feature's grill → spec → tickets is "Phase 1 of 3: Decisions" for that feature), exactly as the foundation counts all six.

### The rail banner

Every transition on the rail is announced with the same fixed banner — a fenced block, never loose prose — so "where we are" and "where we're going" are legible at a glance. Render it whenever position is reported or changes hands: when the conductor orients or routes, when a stage skill closes, and at the end of any session summary. The banner reflects the frontier **at the moment it renders** — a stage that just closed appears under Done, and Now points at the next mover.

```
🛤️ <path> — Phase <m> of <n>: <phase name>   ·   stage: <current stage>
Done:  <phases/artifacts behind you — compact, ✓-marked>
Now:   <the stage in motion and the artifact it leaves behind>
Next:  <the stage after that, one clause>
Later: <the remaining arc, arrows — plus any majors deliberately deferred>
➤ <the single next action — the exact command when the user types it>
```

`<path>` is `Foundation` or the feature's name; `<n>` counts the phases on that path. The `➤` line carries exactly one action — a fully-argumented command for a user-typed stage, or what the agent does next. Never bury the banner's content in prose instead of rendering it: the block *is* the handrail.

### Session summaries

A planning session (a grill, a wayfinder ticket, an interview) closes with the banner **plus a summary of exactly four blocks** — nothing else:

- **Locked** — decisions made, one line each with the why.
- **Provisional** — defaults the agent chose and recorded as changeable (see the interaction contract); revisiting one later is cheap and expected.
- **Deferred** — questions parked with the trigger that reopens them.
- **Next command** — the one thing to type (or the one thing the agent does next).

## Prerequisites

- The repository is initialized (`npx @wemuda/launchrail init`) and healthy (`npx @wemuda/launchrail doctor`). Init writes the workflow skills, the implementation loop's materials, *and* the `docs/agents/` configuration (issue-tracker conventions and domain-doc rules, seeded from the manifest's answers) — there is no separate install or setup step on the golden path.
- Before the first `/launch-implement` on an existing codebase, `launch-loop-readiness` (stage 0, optional) measures the verification gates and tunes the repository for the implementation loop — a fast per-land gate, parallel browser journeys, shared caches for parallel builders, CI triggers, tracker labels, hosted-session setup, verbatim commands ([ADR-0033](https://github.com/wemuda/launchrail/blob/master/docs/adr/0033-loop-readiness.md)). `doctor`'s `ralph …` readiness lines say when it is worth running; they warn, never fail.

## Stages

| # | Stage | Tool | Input | Committed artifact |
|---|---|---|---|---|
| 1 | Vision | Launchrail `vision-creation` skill | The idea, the user | `docs/vision.md` |
| 2 | Visual exploration | Claude Design | Vision | Exploration artifacts (linked from the vision) |
| 3 | Discovery research | Launchrail `discovery` skill (composes `launch-research`) | Vision + intended stack | Landscape/options map in `docs/research/` (`discovery-*.md`) |
| 4 | Complexity grill | `launch-grill` | Vision + exploration + discovery | Grill constraints in `docs/research/` |
| 5 | Technical research | `launch-research` | **Grill constraints** | Research notes in `docs/research/` |
| 6 | Architecture decisions | ADRs (seeded template) | Research | `docs/adr/NNNN-*.md` |
| 7 | MVP specification | `launch-wayfinder` / `launch-spec` † | Vision, ADRs, research | A `spec`-labeled issue on the tracker (or `docs/specs/` in local mode) ‡ |
| 8 | Design validation | Launchrail `design-validation` skill | Spec (+ Claude Design at the top fidelity) | Revised spec with `## Design validation` section |
| 9 | Tickets | `launch-tickets` † | Validated spec | Tickets in the tracker: `ready-for-agent` label, `Blocked by: #n` edges |
| 10 | Implementation | `/launch-implement` † → the Ralph loop | Ready tickets | PRs merged and verified; the frontier drained |
| 11 | Verification | `npx @wemuda/launchrail verify` · Launchrail `browser-smoke` skill | Merged work | The gate green; smoke evidence where behavior is user-facing |
| 12 | Release | The project's release setup | Verified base | The release cut |

† **User-typed by design** — `disable-model-invocation`: only the user can start these. `launch-wayfinder`/`launch-spec` and `launch-tickets` publish to the tracker; `/launch-implement` spawns agents and merges PRs. A conductor prepares the handoff instead of calling them — see the conductor rules.

Stage notes:

- **Stages 3 → 4 → 5 are one arc** (`deep-research`): discovery *diverges* — it maps the real option space for the vision's hard parts (all the auth vendors, not one) and never picks winners; the grill *converges* — it narrows that landscape into constraints; research de-risks what survives. Don't collapse discovery into the grill unless the vision's non-goals record the skip: a grill with no discovery narrows whatever stack was assumed upstream, the exact failure discovery exists to prevent ([ADR-0015](https://github.com/wemuda/launchrail/blob/master/docs/adr/0015-discovery-research-stage.md)).
- **Stage 4 converges far enough to build, not exhaustively.** The grill's stopping rule is build-safety — the decisions the next slice depends on are locked or safely defaulted — never an empty question tree: product design is generative, and "everything answered before implementation" is not a reachable state ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)). "Nothing silently assumed" still holds, but it means every open question is *labeled and parked*, not answered. And stage 4 ends in a committed file, always: `launch-grill` closes its interview by writing the surviving constraints to `docs/research/` — the conversation alone never closes the stage, and the skill treats the committed doc as part of its own contract.
- **‡ The stage-7 spec's home follows the tracker** ([ADR-0025](https://github.com/wemuda/launchrail/blob/master/docs/adr/0025-spec-home-follows-tracker.md)), exactly as stage-9 tickets do. On a real tracker (GitHub, GitLab, Linear) the spec **is** a `spec`-labeled issue and no `docs/specs/` file is written; in local mode (`local`, or no tracker) it is a committed `docs/specs/<slug>.md` file. Detection is therefore tracker-aware — read `docs/agents/issue-tracker.md` to know where to look. `ready-for-agent` still marks tickets only; the spec issue wears `spec` so the loop never dispatches prose as work.
- **Stage 8 scales to the spec's design surface** through a fidelity ladder ([ADR-0016](https://github.com/wemuda/launchrail/blob/master/docs/adr/0016-design-validation-fidelity-ladder.md)): recorded skip, flow diagrams, screen mockups, or Claude Design. The level choice lives inside `design-validation` (recommend, user confirms). It exists to catch "specified but wrong on screen" while the finding still costs a spec edit rather than re-cut tickets — that's why it precedes stage 9 and is not stage 11, which checks the *built* product. Even a skip is recorded through the skill, so the gate stays artifact-based.
- **Stage 10 is one door.** `/launch-implement` drives the Ralph loop ([ADR-0017](https://github.com/wemuda/launchrail/blob/master/docs/adr/0017-implementation-loop-provider.md) as amended by [ADR-0020](https://github.com/wemuda/launchrail/blob/master/docs/adr/0020-independent-skill-set.md)). Launchrail owns both edges of the loop: `ready-for-agent` tickets with `Blocked by: #n` edges in, `launchrail verify --fast` gating every land and the full `launchrail verify` (+ browser smoke where enabled) at the loop's checkpoints and release ([ADR-0032](https://github.com/wemuda/launchrail/blob/master/docs/adr/0032-ralph-lean-local-gate-loop.md)).

## Sizing the work in the delivery loop

The stages above take a fresh project to its first release. After that, the delivery loop repeats once per feature, and `launch` sizes each feature so its planning depth matches the work ([ADR-0014](https://github.com/wemuda/launchrail/blob/master/docs/adr/0014-start-feature-conductor.md), folded into `launch` by [ADR-0018](https://github.com/wemuda/launchrail/blob/master/docs/adr/0018-implement-front-door.md)):

- **Large feature** — discovery when it opens new tech territory, `launch-wayfinder` to break it down, a grill, `launch-spec`, design validation, then `launch-tickets`.
- **Semi feature** — a grill, `launch-spec`, optionally design validation, then `launch-tickets`.
- **Small feature** — a grill straight to `launch-tickets`.

Every size ends the same way: `/launch-implement`, gated by `launchrail verify`. Sizing changes *how many* planning stages a feature needs, never *who owns* them.

A feature may arrive **design-first**: as a Claude Design prototype dropped into the session rather than a described idea. That arrival goes through the design handoff on-ramp (below) before sizing — the committed `handoff.md` then serves as the feature brief sizing consumes.

## Returning from Claude Design

The stages drive Claude Design code→design (stages 2 and 8). The delivery loop also runs the reverse trip: design work done *in* Claude Design — a tweak, the next few pages, a redesign — comes back as files, typically a zip of artboards. The Launchrail `design-handoff` skill owns that arrival ([ADR-0024](https://github.com/wemuda/launchrail/blob/master/docs/adr/0024-design-handoff-onramp.md)): it reads the prototype against the current code and design system, asks only the questions documenting needs, and commits a **handoff package** under `docs/design/<feature-slug>/` — the prototype verbatim plus a distilled `handoff.md`, both project-owned, in the same accumulating `docs/design/` home as earlier handoffs.

From there the normal sizing paths apply, with two design-first twists: the handoff doc's open questions become the feature grill's agenda (the handoff feeds the grill, as the grill feeds research), and the spec cites `docs/design/<feature-slug>/` as its UX/UI reference — so design validation typically becomes a recorded skip citing the package, recorded through the `design-validation` skill as always. Like alignment, this is an on-ramp onto the same rail, not a second workflow; the handoff skill routes and never starts implementation.

## Adopting an existing project

When `.launchrail.yml` records `origin: existing`, stage 1 is reached through the Launchrail `project-alignment` skill: it inventories what the codebase already has, infers a draft vision from the code, interviews only the gaps, and detects the existing design system as the baseline for stages 2 and 8, then hands to `vision-creation` to commit ([ADR-0013](https://github.com/wemuda/launchrail/blob/master/docs/adr/0013-existing-project-alignment.md)). Alignment is an on-ramp onto the same rail, not a second workflow.

## The interaction contract

How every stage spends the user's attention ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)). The grill carries the detailed mechanics, but these rules bind *any* stage that interviews, proposes, or checkpoints — the human in the loop must mean meaningful control, not procedural approval of an unmanageable working set.

- **Decision ownership is split.** The user owns product promises, priorities, risk tolerance, and irreversible or costly-to-reverse tradeoffs — data loss, security, tenancy, spend, public contracts. The agent owns reversible implementation details *within* those constraints: it picks a sensible default, records it as **Provisional**, and moves on. A reversible choice escalated as a question is a contract violation, not diligence.
- **Label every uncertainty; only one label reaches the user.** Every open question is triaged as `decide-now`, `agent-default`, `research`, `prototype`, or `defer` — and only `decide-now` questions are asked. The other four are worked or parked by the agent and surface in the session summary, not as questions.
- **Rounds are small.** At most **three questions per round** — and a genuinely consequential decision rides alone, with the context it deserves. Working memory holds about four chunks; a round of eleven interdependent questions is delegation pressure, not rigor.
- **Sessions are budgeted.** About **six user decisions per session**. When the budget is spent, close: write the artifact, summarize Locked / Provisional / Deferred, hand over the next command. Pressing on past the budget converts the decision-maker into an approval machine.
- **Checkpoint every two rounds.** Offer the explicit choice: **continue** grilling, **prototype** to raise fidelity, **defer** the rest, or **go build**. The user steers the process, not just the answers.
- **Stop at build-safety.** Planning stops when the next vertical slice can be built safely — not when the frontier is empty. Questions beyond that line get labeled and parked, and the slice's feedback reopens them cheaper than speculation ever could.
- **Approved prototypes have authority.** Behavior shown in an approved prototype or design package is *presumed in scope*. Proposing to cut it requires a concrete safety, infrastructure, or measured-cost reason — "the spec would be simpler" is not one. A prototype is a decision record, not a feature inventory to re-litigate.
- **Planning must keep touching ground.** Never more than **two consecutive planning sessions or planning tickets without a runnable or visual checkpoint** — a prototype, a spike, or building the slice that's already safe. Planning that only produces more planning has left the rail.

## Conductor rules

The contract for `launch`, `/launch-implement`, and any agent driving the rail. The conductors execute these rules; this document owns them.

- **Every transition renders the rail banner.** Orientation, routing, stage close, session summary — position is announced with the banner from the phase view above, never gestured at in prose. The user should never have to ask "where are we, and what happens now?"
- **One owner per stage, invoked by name.** Every stage has exactly one owning skill. Invoke it by calling the Skill tool with the owner's exact name (a user-typed stage gets the prepared handoff instead); do not paraphrase, wrap, re-prompt, or re-derive its work inline — the skill is the only place its stage's behavior lives.
- **Artifacts gate stages, not chat memory.** A stage is done only when its committed artifact exists; detect by reading the repository, and when a signal is ambiguous (a template-only vision, an abandoned spec draft), ask rather than assume. Detection and sizing are read-only — every write happens inside the stage owner.
- **User-typed stages get a prepared handoff, never reverse-engineering.** A `disable-model-invocation` refusal is the cue to hand over, not to reproduce the skill's work by hand or grep vendored skill files. A prepared handoff is three moves: confirm the stage's input artifacts are committed; hand the user the exact, fully-argumented command naming those inputs (a bare `/skill` sends it re-deriving what your inputs already settle — arguments that point at committed inputs are parameters, not paraphrase); pick up automatically once the stage's artifact lands.
- **The grill feeds research.** Run the grill before technical research and hand research the grill's surviving constraints as its brief.
- **`ready-for-agent` marks tickets, never specs.** The implementation loop's frontier is every open issue wearing that label, and it cannot tell prose from work — a spec or research note published to the tracker takes a different label (e.g. `spec`), or the loop will dispatch the document as work. Relabel before anyone starts the loop.
- **Implementation is never started unprompted.** Stage 10 belongs to the user: conductors hand over `/launch-implement` and explain; they do not launch it.
- **Everything the workflow produces is project-owned.** Vision, research, ADRs, specs, tickets — Launchrail tooling never overwrites them.
- **Setup gaps are action, not conversation.** Known, additive fixes (commit untracked init output, run `init` when the manifest is missing, `sync` when loop materials are absent, record the project's test command as `testing.unitCommand` in `.launchrail.yml` once a real test runner exists — init detects it where it can and otherwise leaves it null) get applied and reported; questions are saved for product artifacts, where intent is genuinely unknowable. Init owns installs — never improvise a dependency install from the web.

## Stage-skipping

Skip nothing silently. A stage may be skipped deliberately — a short experiment might drop visual exploration, discovery, research, or design validation — but only when the vision's non-goals record the skip. A recorded skip is honored without nagging.

When a stage looks skipped, check the vision's non-goals before deciding whether it's deliberate — and if you still can't tell, ask.
