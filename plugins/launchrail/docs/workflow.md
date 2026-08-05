# The Launchrail core workflow

How a fresh project moves from idea to an approved, validated MVP spec through committed artifacts. Launchrail composes upstream skills wherever one already covers a stage — the table below is the contract for which tool owns which stage and what artifact it must leave behind.

## Running it

Invoke the `launch` skill (or just say where you are and ask what's next). It detects which stage a project has reached from its committed artifacts, then runs or routes to that stage's owner below — and it takes a stage name (`vision`, `deep-research`, `design-validation`, …) to jump straight there ([ADR-0009](../../../docs/adr/0009-launch-orchestrator-skill.md)). This table stays the contract for who owns each stage; `launch` executes it, it does not replace it.

## Prerequisites

- The repository is initialized (`npx @wemuda/launchrail init`) and healthy (`npx @wemuda/launchrail doctor`).
- [Matt Pocock's skills](https://github.com/mattpocock/skills) are installed — `init` preinstalls the plugin alongside Launchrail's own (ADR-0011) — and set up: run `/setup-matt-pocock-skills` once per repository (expected output: `docs/agents/`). `doctor` checks both.
- The Launchrail plugin is declared in `.claude/settings.json` (init does this), so every collaborator's Claude Code session offers the same skills.

## Stages

| # | Stage | Tool | Input | Committed artifact |
|---|---|---|---|---|
| 1 | Vision | Launchrail `vision-creation` skill | The idea, the user | `docs/vision.md` |
| 2 | Visual exploration | Claude Design | Vision | Exploration artifacts (linked from the vision) |
| 3 | Complexity grill | Matt Pocock's `grill-with-docs` | Vision + exploration | Grill transcript/constraints in `docs/research/` |
| 4 | Technical research | Matt Pocock's research skill | **Grill constraints** | Research notes in `docs/research/` |
| 5 | Architecture decisions | ADRs (seeded template) | Research | `docs/adr/NNNN-*.md` |
| 6 | MVP specification | Matt Pocock's `wayfinder` / `to-spec` | Vision, ADRs, research | `docs/specs/` |
| 7 | Design validation | Launchrail `design-validation` skill | Spec + Claude Design | Revised spec with `## Design validation` section |
| 8 | Tickets | Matt Pocock's `to-tickets` | Validated spec | Tickets in the project's tracker |

After stage 8, bounded implementation is a Ralph campaign: `launchrail add ralph` installs it, and the `ralph` skill (watchable) or the `ralph` workflow (wide/long runs) drives the tickets to verified merges — gated by `launchrail verify` and, where the browser-testing module is enabled, browser smoke evidence. Tickets must carry `Blocked by: #n` edges and the `ready-for-agent` label; touch up `to-tickets` output if it lacks them.

## Composition rules

- **No duplicate skills.** Where the table names an upstream skill, use it. Launchrail does not wrap, fork, or re-prompt `grill-with-docs`, the research skill, `wayfinder`, `to-spec`, or `to-tickets`.
- **The grill feeds research.** Run the grill before technical research and hand the research skill the grill's surviving constraints as its brief — research without grill constraints answers questions nobody asked.
- **Artifacts gate stages.** Each stage starts from the previous stage's committed artifact, not from chat memory. If the artifact is missing, go back one stage instead of improvising.
- **Everything the workflow produces is project-owned.** Vision, research notes, ADRs, specs, and tickets belong to the project; Launchrail tooling never overwrites them.

## Stage-skipping by project mode

The manifest's `mode` (`.launchrail.yml`) calibrates rigor, not the stage order:

- `spike` — stages 2–4 and 7 may be skipped deliberately; record the skip in the vision's non-goals.
- `standard-mvp` — the default path above.
- `high-rigor` — no skips; ADRs required for every stage-5 decision, and design validation covers error and edge states, not just happy paths.
