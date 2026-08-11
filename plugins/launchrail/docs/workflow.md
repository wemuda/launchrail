# The Launchrail core workflow

How a fresh project moves from idea to an approved, validated MVP spec through committed artifacts. Launchrail composes upstream skills wherever one already covers a stage — the table below is the contract for which tool owns which stage and what artifact it must leave behind.

## Running it

Invoke the `launch` skill (or just say where you are and ask what's next). It detects which stage a project has reached from its committed artifacts, then runs or routes to that stage's owner below — and it takes a stage name (`vision`, `discovery`, `deep-research`, `design-validation`, …) to jump straight there ([ADR-0009](../../../docs/adr/0009-launch-orchestrator-skill.md)). This table stays the contract for who owns each stage; `launch` executes it, it does not replace it.

## Prerequisites

- The repository is initialized (`npx @wemuda/launchrail init`) and healthy (`npx @wemuda/launchrail doctor`).
- [Matt Pocock's skills](https://github.com/mattpocock/skills) are installed — `init` preinstalls the plugin alongside Launchrail's own (ADR-0011) — and set up: run `/setup-matt-pocock-skills` once per repository (expected output: `docs/agents/`). `doctor` checks both.
- The workflow plugins (Launchrail's and Matt Pocock's) are declared in `.claude/settings.json` (init does this), so every collaborator's Claude Code session offers the same skills.

## Stages

| # | Stage | Tool | Input | Committed artifact |
|---|---|---|---|---|
| 1 | Vision | Launchrail `vision-creation` skill | The idea, the user | `docs/vision.md` |
| 2 | Visual exploration | Claude Design | Vision | Exploration artifacts (linked from the vision) |
| 3 | Discovery research | Launchrail `discovery` skill (composes Matt Pocock's research skill) | Vision + intended stack | Landscape/options map in `docs/research/` (`discovery-*.md`) |
| 4 | Complexity grill | Matt Pocock's `grill-with-docs` | Vision + exploration + discovery | Grill constraints in `docs/research/` |
| 5 | Technical research | Matt Pocock's research skill | **Grill constraints** | Research notes in `docs/research/` |
| 6 | Architecture decisions | ADRs (seeded template) | Research | `docs/adr/NNNN-*.md` |
| 7 | MVP specification | Matt Pocock's `wayfinder` / `to-spec` | Vision, ADRs, research | `docs/specs/` |
| 8 | Design validation | Launchrail `design-validation` skill | Spec (+ Claude Design at the top fidelity) | Revised spec with `## Design validation` section |
| 9 | Tickets | Matt Pocock's `to-tickets` | Validated spec | Tickets in the project's tracker |

Stage 8 scales to the spec's design surface through a fidelity ladder ([ADR-0016](../../../docs/adr/0016-design-validation-fidelity-ladder.md)): a recorded skip, an artifact page of flow diagrams, an artifact page of screen mockups, or high-fidelity screens driven through Claude Design — the skill recommends a level from the spec's surface and the manifest `mode` (advisory, never a gate) and the user confirms. Design validation catches "specified but wrong on screen" while a finding still costs a spec edit rather than re-cut tickets or reworked code — that is why it sits before tickets, and why it is not the post-implementation check (that is browser smoke / `verify`, on the built product). Whatever the level, the `## Design validation` section gets written — it is the stage's artifact gate; levels above skip link their diagram/mockup/design artifacts from it, and a recorded skip states what was assessed and why there was nothing to drive.

After stage 9, bounded implementation is **the project's selected implementation loop** — stage 10, chosen in `.launchrail.yml` as `implementationLoop` (default `ralph`, [ADR-0017](../../../docs/adr/0017-implementation-loop-provider.md)). Whichever loop runs, Launchrail owns both edges: tickets enter carrying the `ready-for-agent` label and `Blocked by: #n` edges (touch up `to-tickets` output if it lacks them), and every merge is gated by `launchrail verify` plus, where the browser-testing module is enabled, browser smoke evidence — the loop implements, Launchrail verifies. The built-in default is the Ralph loop: `launchrail add ralph` installs it, and the `ralph` skill (watchable) or the `ralph` workflow (wide/long runs) drives the tickets to verified merges. `superpowers` (obra/superpowers) is a selectable alternative that fills the same slot with its own skills — `superpowers:executing-plans` + `superpowers:test-driven-development`, closing with `superpowers:finishing-a-development-branch` — under the same input and verification contract; `init` installs and declares its plugin (`superpowers@superpowers-dev`) when the project selects it, so teammates get the same loop. `ready-for-agent` belongs to tickets exclusively: the loop's frontier is every open issue wearing the label, so an issue that publishes a workflow artifact to the tracker — a spec, research notes, an epic — must carry a different label (e.g. `spec`), or the loop will dispatch the document itself as work.

## Sizing the work in the delivery loop

The stages above take a fresh project to its first release. After that, the delivery loop repeats once per feature, and its planning front-end scales with the feature's size instead of always producing a full MVP spec:

- **Large feature** — discovery when it opens new tech territory, `wayfinder` to break it down, a complexity grill, `to-spec`, design validation, then `to-tickets`.
- **Semi feature** — a grill, `to-spec`, optionally design validation, then `to-tickets`.
- **Small feature** — a grill straight to `to-tickets`.

Every size ends the same way: the project's selected implementation loop (default Ralph) implements the resulting tickets, gated by `launchrail verify`. Sizing changes *how many* planning stages a feature needs, never *who owns* them — the stage table above is still the contract. The `launchrail:start-feature` skill conducts exactly this: it sizes a feature and routes it through the matching path, composing the same owners ([ADR-0014](../../../docs/adr/0014-start-feature-conductor.md)).

## Adopting an existing project

A project that already has code doesn't start at a blank vision. When `.launchrail.yml` records `origin: existing` (the `init` interview asks, and defaults to it when it detects a `package.json` or existing agent files), the loop gains an **on-ramp** at stage 1: the Launchrail `project-alignment` skill. It inventories what the project already has against the artifacts below, infers a draft vision from the code, interviews only about the gaps, and detects an existing design system (recording it as the baseline for stages 2 and 8). It then hands to `vision-creation` to commit the vision and returns to `launch` for the first real gap.

Alignment is an on-ramp, not a second workflow: everything from the vision onward is the same table above, and `project-alignment` composes the stage owners rather than duplicating them ([ADR-0013](../../../docs/adr/0013-existing-project-alignment.md)). Its job is to get an adopted codebase onto the rail with the least work — infer what the code answers, ask only what it doesn't.

## Composition rules

- **No duplicate skills.** Where the table names an upstream skill, use it. Launchrail does not wrap, fork, or re-prompt `grill-with-docs`, the research skill, `wayfinder`, `to-spec`, or `to-tickets`. The `discovery` skill is Launchrail-owned framing that *drives* the research skill for depth — it composes it, it does not reimplement it.
- **Discovery diverges, the grill converges.** Discovery runs before the grill and widens the option space; the grill takes that landscape and narrows it. Don't let discovery pick winners (that's the grill), and don't let the grill narrow options discovery never surfaced — diverge before you converge.
- **Some owners are user-typed by design.** A few stage owners are `disable-model-invocation`: stage 0's `/setup-matt-pocock-skills` and stage 7's `wayfinder` / `to-spec` upstream, and the Ralph loop by Launchrail's own choice ([ADR-0005](../../../docs/adr/0005-ralph-two-frontends-one-policy.md)). The `launch` conductor cannot call these — it prepares a handoff: confirm the inputs are committed, hand over the exact fully-argumented command (never a bare invocation, which sends the skill re-deriving what the inputs already settle), and resume when the artifact lands. A `disable-model-invocation` refusal is a handoff cue, never licence to reverse-engineer the skill.
- **The grill feeds research.** Run the grill before technical research and hand the research skill the grill's surviving constraints as its brief — research without grill constraints answers questions nobody asked.
- **Artifacts gate stages.** Each stage starts from the previous stage's committed artifact, not from chat memory. If the artifact is missing, go back one stage instead of improvising.
- **Everything the workflow produces is project-owned.** Vision, discovery and research notes, ADRs, specs, and tickets belong to the project; Launchrail tooling never overwrites them.

## Stage-skipping by project mode

The manifest's `mode` (`.launchrail.yml`) calibrates rigor, not the stage order:

- `spike` — stages 2–5 and 8 may be skipped deliberately; record the skip in the vision's non-goals.
- `standard-mvp` — the default path above.
- `high-rigor` — no skips; ADRs required for every stage-6 decision, and design validation covers error and edge states, not just happy paths.
