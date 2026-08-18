# The Launchrail core workflow

How a project moves from idea to verified, released software through committed artifacts. The rail is one complete, self-contained skill set — every stage owner is a Launchrail `launch-*` skill, written to the rail's artifact contract ([ADR-0020](https://github.com/wemuda/launchrail/blob/master/docs/adr/0020-independent-skill-set.md); several absorb methodology from [Matt Pocock's skills](https://github.com/mattpocock/skills), credited in `NOTICE.md`). The stage table below is the contract for which skill owns which stage and what artifact it must leave behind, and the conductor rules further down are the contract for how the `launch` conductor (and any agent working the rail) behaves between stages.

## Running it

Two commands cover the whole rail:

- **`/launch`** — plan. It detects which stage the project has reached from its committed artifacts and runs or routes to that stage's owner; it takes a stage name (`vision`, `discovery`, `design-validation`, …) to jump straight there, and it sizes each new feature once the foundation exists ([ADR-0009](https://github.com/wemuda/launchrail/blob/master/docs/adr/0009-launch-orchestrator-skill.md), [ADR-0018](https://github.com/wemuda/launchrail/blob/master/docs/adr/0018-implement-front-door.md)).
- **`/launch-implement`** — build. The single entry point for stage 10: it drives ready tickets to verified merges through the project's selected loop — the whole frontier, a spec's tickets, the next N ("max 5"), or one ticket at a time.

## Prerequisites

- The repository is initialized (`npx @wemuda/launchrail init`) and healthy (`npx @wemuda/launchrail doctor`). Init writes the workflow skills, the implementation loop's materials, *and* the `docs/agents/` configuration (issue-tracker conventions and domain-doc rules, seeded from the manifest's answers) — there is no separate install or setup step on the golden path.

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
- **Stage 4 ends in a committed file, always.** `launch-grill` closes its interview by writing the surviving constraints to `docs/research/` — the conversation alone never closes the stage, and the skill treats the committed doc as part of its own contract.
- **‡ The stage-7 spec's home follows the tracker** ([ADR-0025](https://github.com/wemuda/launchrail/blob/master/docs/adr/0025-spec-home-follows-tracker.md)), exactly as stage-9 tickets do. On a real tracker (GitHub, GitLab, Linear) the spec **is** a `spec`-labeled issue and no `docs/specs/` file is written; in local mode (`local`, or no tracker) it is a committed `docs/specs/<slug>.md` file. Detection is therefore tracker-aware — read `docs/agents/issue-tracker.md` to know where to look. `ready-for-agent` still marks tickets only; the spec issue wears `spec` so the loop never dispatches prose as work.
- **Stage 8 scales to the spec's design surface** through a fidelity ladder ([ADR-0016](https://github.com/wemuda/launchrail/blob/master/docs/adr/0016-design-validation-fidelity-ladder.md)): recorded skip, flow diagrams, screen mockups, or Claude Design. The level choice lives inside `design-validation` (recommend, user confirms). It exists to catch "specified but wrong on screen" while the finding still costs a spec edit rather than re-cut tickets — that's why it precedes stage 9 and is not stage 11, which checks the *built* product. Even a skip is recorded through the skill, so the gate stays artifact-based.
- **Stage 10 is one door.** `/launch-implement` drives the Ralph loop ([ADR-0017](https://github.com/wemuda/launchrail/blob/master/docs/adr/0017-implementation-loop-provider.md) as amended by [ADR-0020](https://github.com/wemuda/launchrail/blob/master/docs/adr/0020-independent-skill-set.md)). Launchrail owns both edges of the loop: `ready-for-agent` tickets with `Blocked by: #n` edges in, `launchrail verify` (+ browser smoke where enabled) gating every merge.

## Sizing the work in the delivery loop

The stages above take a fresh project to its first release. After that, the delivery loop repeats once per feature, and `launch` sizes each feature so its planning depth matches the work ([ADR-0014](https://github.com/wemuda/launchrail/blob/master/docs/adr/0014-start-feature-conductor.md), folded into `launch` by [ADR-0018](https://github.com/wemuda/launchrail/blob/master/docs/adr/0018-implement-front-door.md)):

- **Large feature** — discovery when it opens new tech territory, `launch-wayfinder` to break it down, a grill, `launch-spec`, design validation, then `launch-tickets`.
- **Semi feature** — a grill, `launch-spec`, optionally design validation, then `launch-tickets`.
- **Small feature** — a grill straight to `launch-tickets`.

Every size ends the same way: `/launch-implement`, gated by `launchrail verify`. Sizing changes *how many* planning stages a feature needs, never *who owns* them.

## Adopting an existing project

When `.launchrail.yml` records `origin: existing`, stage 1 is reached through the Launchrail `project-alignment` skill: it inventories what the codebase already has, infers a draft vision from the code, interviews only the gaps, and detects the existing design system as the baseline for stages 2 and 8, then hands to `vision-creation` to commit ([ADR-0013](https://github.com/wemuda/launchrail/blob/master/docs/adr/0013-existing-project-alignment.md)). Alignment is an on-ramp onto the same rail, not a second workflow.

## Conductor rules

The contract for `launch`, `/launch-implement`, and any agent driving the rail. The conductors execute these rules; this document owns them.

- **One owner per stage, invoked by name.** Every stage has exactly one owning skill. Invoke it by name; do not paraphrase, wrap, re-prompt, or re-derive its work inline — the skill is the only place its stage's behavior lives.
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
