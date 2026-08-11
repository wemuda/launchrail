# The Launchrail core workflow

How a project moves from idea to verified, released software through committed artifacts. Launchrail composes upstream skills wherever one already covers a stage — the stage table below is the contract for which tool owns which stage and what artifact it must leave behind, and the conductor rules further down are the contract for how the `launch` conductor (and any agent working the rail) behaves between stages.

## Running it

Two commands cover the whole rail:

- **`/launchrail:launch`** — plan. It detects which stage the project has reached from its committed artifacts and runs or routes to that stage's owner; it takes a stage name (`vision`, `discovery`, `design-validation`, …) to jump straight there, and it sizes each new feature once the foundation exists ([ADR-0009](../../../docs/adr/0009-launch-orchestrator-skill.md), [ADR-0018](../../../docs/adr/0018-implement-front-door.md)).
- **`/launchrail:implement`** — build. The single entry point for stage 10: it drives ready tickets to verified merges through the project's selected loop — the whole frontier, a spec's tickets, the next N ("max 5"), or one ticket at a time.

## Prerequisites

- The repository is initialized (`npx @wemuda/launchrail init`) and healthy (`npx @wemuda/launchrail doctor`). Init installs the workflow plugins *and* the default implementation loop's materials — there is no separate install step on the golden path.
- [Matt Pocock's skills](https://github.com/mattpocock/skills) are set up: run `/setup-matt-pocock-skills` once per repository (expected output: `docs/agents/`). `doctor` checks it.

## Stages

| # | Stage | Tool | Input | Committed artifact |
|---|---|---|---|---|
| 1 | Vision | Launchrail `vision-creation` skill | The idea, the user | `docs/vision.md` |
| 2 | Visual exploration | Claude Design | Vision | Exploration artifacts (linked from the vision) |
| 3 | Discovery research | Launchrail `discovery` skill (composes Matt Pocock's research skill) | Vision + intended stack | Landscape/options map in `docs/research/` (`discovery-*.md`) |
| 4 | Complexity grill | Matt Pocock's `grill-with-docs` | Vision + exploration + discovery | Grill constraints in `docs/research/` |
| 5 | Technical research | Matt Pocock's research skill | **Grill constraints** | Research notes in `docs/research/` |
| 6 | Architecture decisions | ADRs (seeded template) | Research | `docs/adr/NNNN-*.md` |
| 7 | MVP specification | Matt Pocock's `wayfinder` / `to-spec` † | Vision, ADRs, research | `docs/specs/` |
| 8 | Design validation | Launchrail `design-validation` skill | Spec (+ Claude Design at the top fidelity) | Revised spec with `## Design validation` section |
| 9 | Tickets | Matt Pocock's `to-tickets` | Validated spec | Tickets in the tracker: `ready-for-agent` label, `Blocked by: #n` edges |
| 10 | Implementation | `/launchrail:implement` † → the selected loop (`implementationLoop`, default Ralph) | Ready tickets | PRs merged and verified; the frontier drained |
| 11 | Verification | `npx @wemuda/launchrail verify` · Launchrail `browser-smoke` skill | Merged work | The gate green; smoke evidence where behavior is user-facing |
| 12 | Release | The project's release setup | Verified base | The release cut |

† **User-typed by design** — `disable-model-invocation`: only the user can start these (upstream's choice for `/setup-matt-pocock-skills` and `wayfinder`/`to-spec`; Launchrail's own for `/launchrail:implement`, because implementation spawns agents and merges PRs). A conductor prepares the handoff instead of calling them — see the conductor rules.

Stage notes:

- **Stages 3 → 4 → 5 are one arc** (`deep-research`): discovery *diverges* — it maps the real option space for the vision's hard parts (all the auth vendors, not one) and never picks winners; the grill *converges* — it narrows that landscape into constraints; research de-risks what survives. Don't collapse discovery into the grill outside `spike` mode: a grill with no discovery narrows whatever stack was assumed upstream, the exact failure discovery exists to prevent ([ADR-0015](../../../docs/adr/0015-discovery-research-stage.md)).
- **Stage 4 is `grill-with-docs`, never the bare `grilling` primitive.** Both ship in the installed plugin, but only `grill-with-docs` writes the `docs/research/` artifact the stage gates on — the primitive produces conversation and no committed file.
- **Stage 8 scales to the spec's design surface** through a fidelity ladder ([ADR-0016](../../../docs/adr/0016-design-validation-fidelity-ladder.md)): recorded skip, flow diagrams, screen mockups, or Claude Design. The level choice lives inside `design-validation` (recommend, user confirms). It exists to catch "specified but wrong on screen" while the finding still costs a spec edit rather than re-cut tickets — that's why it precedes stage 9 and is not stage 11, which checks the *built* product. Even a skip is recorded through the skill, so the gate stays artifact-based.
- **Stage 10 is provider-selected behind one door.** `/launchrail:implement` reads `implementationLoop` (`ralph` default, `superpowers` selectable — [ADR-0017](../../../docs/adr/0017-implementation-loop-provider.md)) and routes to that engine. Launchrail owns both edges whichever loop runs: `ready-for-agent` tickets with `Blocked by: #n` edges in, `launchrail verify` (+ browser smoke where enabled) gating every merge.

## Sizing the work in the delivery loop

The stages above take a fresh project to its first release. After that, the delivery loop repeats once per feature, and `launch` sizes each feature so its planning depth matches the work ([ADR-0014](../../../docs/adr/0014-start-feature-conductor.md), folded into `launch` by [ADR-0018](../../../docs/adr/0018-implement-front-door.md)):

- **Large feature** — discovery when it opens new tech territory, `wayfinder` to break it down, a grill, `to-spec`, design validation, then `to-tickets`.
- **Semi feature** — a grill, `to-spec`, optionally design validation, then `to-tickets`.
- **Small feature** — a grill straight to `to-tickets`.

Every size ends the same way: `/launchrail:implement`, gated by `launchrail verify`. Sizing changes *how many* planning stages a feature needs, never *who owns* them.

## Adopting an existing project

When `.launchrail.yml` records `origin: existing`, stage 1 is reached through the Launchrail `project-alignment` skill: it inventories what the codebase already has, infers a draft vision from the code, interviews only the gaps, and detects the existing design system as the baseline for stages 2 and 8, then hands to `vision-creation` to commit ([ADR-0013](../../../docs/adr/0013-existing-project-alignment.md)). Alignment is an on-ramp onto the same rail, not a second workflow.

## Conductor rules

The contract for `launch`, `/launchrail:implement`, and any agent driving the rail. The conductors execute these rules; this document owns them.

- **Compose, never duplicate.** Every stage has exactly one owner. Invoke it by name; do not paraphrase, wrap, re-prompt, or reimplement it. Launchrail does not fork `grill-with-docs`, the research skill, `wayfinder`, `to-spec`, or `to-tickets`.
- **Artifacts gate stages, not chat memory.** A stage is done only when its committed artifact exists; detect by reading the repository, and when a signal is ambiguous (a template-only vision, an abandoned spec draft), ask rather than assume. Detection and sizing are read-only — every write happens inside the stage owner.
- **User-typed stages get a prepared handoff, never reverse-engineering.** A `disable-model-invocation` refusal is the cue to hand over, not to reproduce the skill's work by hand or grep plugin internals. A prepared handoff is three moves: confirm the stage's input artifacts are committed; hand the user the exact, fully-argumented command naming those inputs (a bare `/skill` sends it re-deriving what your inputs already settle — arguments that point at committed inputs are parameters, not paraphrase); pick up automatically once the stage's artifact lands.
- **The grill feeds research.** Run the grill before technical research and hand research the grill's surviving constraints as its brief.
- **`ready-for-agent` marks tickets, never specs.** The implementation loop's frontier is every open issue wearing that label, and it cannot tell prose from work — a spec or research note published to the tracker takes a different label (e.g. `spec`), or the loop will dispatch the document as work. Relabel before anyone starts the loop.
- **Implementation is never started unprompted.** Stage 10 belongs to the user: conductors hand over `/launchrail:implement` and explain; they do not launch it.
- **Everything the workflow produces is project-owned.** Vision, research, ADRs, specs, tickets — Launchrail tooling never overwrites them.
- **Setup gaps are action, not conversation.** Known, additive fixes (commit untracked init output, run `init` when the manifest is missing, `sync` when loop materials are absent) get applied and reported; questions are saved for product artifacts, where intent is genuinely unknowable. Init owns installs — never improvise a dependency install from the web.

## Stage-skipping by project mode

The manifest's `mode` calibrates rigor, not stage order:

- `spike` — stages 2–5 and 8 may be skipped deliberately; record the skip in the vision's non-goals.
- `standard-mvp` — the default path; skip nothing silently.
- `high-rigor` — no skips; ADRs for every stage-6 decision, and design validation covers error and edge states, not just happy paths.

When a stage looks skipped, check the vision's non-goals before deciding whether it's deliberate — and if you still can't tell, ask.
