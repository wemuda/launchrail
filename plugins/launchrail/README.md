# Launchrail Claude Code plugin

Skills, commands, agents, and hooks that consuming projects subscribe to via the Launchrail marketplace. Consuming projects declare the plugin in `.claude/settings.json` — `launchrail init` sets this up (see ADR-0003).

## Skills

Two doors cover the rail: [`launch`](skills/launch/SKILL.md) plans — it detects where a project sits in the loop, routes to the stage skills below, and sizes each new feature once the foundation exists — and [`implement`](skills/implement/SKILL.md) builds. The rest own individual stages.

| Skill | Purpose |
|---|---|
| [`launch`](skills/launch/SKILL.md) | The planning conductor: detect the project's current stage and run or route to the stage that owns the next step; jump straight to a stage by name (e.g. `deep-research`); size a new feature (large / semi / small) and run the planning subset it needs ([ADR-0009](../../docs/adr/0009-launch-orchestrator-skill.md), [ADR-0018](../../docs/adr/0018-implement-front-door.md)) |
| [`implement`](skills/implement/SKILL.md) | The one door to building (user-typed): drive the ready ticket frontier — or a single ticket — to verified merges through the project's selected implementation loop; repairs its own setup instead of gatekeeping ([ADR-0018](../../docs/adr/0018-implement-front-door.md)) |
| [`project-alignment`](skills/project-alignment/SKILL.md) | The on-ramp for adopting an existing codebase (`origin: existing`): inventory what's there, infer a draft vision from the code, interview only the gaps, detect the existing design system, then hand to the loop ([ADR-0013](../../docs/adr/0013-existing-project-alignment.md)) |
| [`vision-creation`](skills/vision-creation/SKILL.md) | Turn an idea into broad product intent, assumptions, and non-goals (`docs/vision.md`) |
| [`discovery`](skills/discovery/SKILL.md) | Divergent option-space scan before the grill: map the real libraries/frameworks/vendors for the vision's hard parts (all the contenders, not one), committed under `docs/research/`; composes Matt Pocock's research skill for depth ([ADR-0015](../../docs/adr/0015-discovery-research-stage.md)) |
| [`design-validation`](skills/design-validation/SKILL.md) | Validate a spec visually at a confirmed fidelity level — recorded skip, flow diagrams, screen mockups, or Claude Design — and fold the findings back into the spec ([ADR-0016](../../docs/adr/0016-design-validation-fidelity-ladder.md)) |
| [`browser-smoke`](skills/browser-smoke/SKILL.md) | Drive the app through defined smoke journeys and capture a traceable evidence bundle (pairs with `launchrail add browser-testing`) |
| [`ralph`](skills/ralph/SKILL.md) | The loop engine behind `implement`: fresh-context implementers over the ticket frontier, remote-verified merges, verification-gated completion (started only through `/launchrail:implement` or an explicit user request) |
| [`ralph-implement`](skills/ralph-implement/SKILL.md) | The per-ticket implementation contract Ralph dispatches and `implement`'s single-ticket mode name: TDD, the `verify` gate, browser smoke, self-review, conventional commits |
| [`resolving-merge-conflicts`](skills/resolving-merge-conflicts/SKILL.md) | Resolve conflicts without losing either side's behavior — the protocol for parallel implementers landing against a moving base |

The same loop also exists as a deterministic workflow: `init` installs a managed `.claude/workflows/ralph.js` for wide or long runs (`launchrail sync` restores or updates it; ADR-0005, ADR-0018). The skill and the workflow share one policy block — change one, change both.

## Workflow

[docs/workflow.md](docs/workflow.md) is the stage-by-stage contract from idea to validated MVP spec: which tool owns each stage and what committed artifact it leaves behind.

Stages that upstream skills already cover are composed, not duplicated — all from [Matt Pocock's `skills`](https://github.com/mattpocock/skills) repository:

- **Complexity grill** → Matt Pocock's `grill-with-docs`
- **Technical research** → Matt Pocock's research skill, fed by the project's grill constraints
- **Spec and tickets** → Matt Pocock's `wayfinder`, `to-spec`, `to-tickets`
