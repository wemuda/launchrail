# Launchrail Claude Code plugin

Skills, commands, agents, and hooks that consuming projects subscribe to via the Launchrail marketplace. Consuming projects declare the plugin in `.claude/settings.json` — `launchrail init` sets this up (see ADR-0003).

## Skills

| Skill | Purpose |
|---|---|
| [`vision-creation`](skills/vision-creation/SKILL.md) | Turn an idea into broad product intent, assumptions, and non-goals (`docs/vision.md`) |
| [`design-validation`](skills/design-validation/SKILL.md) | Coordinate spec → Claude Design → revised spec → handoff |

Planned (see repository roadmap): `browser-smoke` (evidence-producing journey testing) and `ralph-release` (bounded release implementation campaign, integrating the Wemuda-provided skill and workflow script).

## Workflow

[docs/workflow.md](docs/workflow.md) is the stage-by-stage contract from idea to validated MVP spec: which tool owns each stage and what committed artifact it leaves behind.

Stages that upstream skills already cover are composed, not duplicated:

- **Complexity grill** → Matt Pocock's `grill-with-docs`
- **Technical research** → Matt Pocock's research skill, fed by the project's grill constraints
- **Spec and tickets** → Matt Pocock's `wayfinder`, `to-spec`, `to-tickets`
