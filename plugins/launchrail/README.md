# Launchrail Claude Code plugin

Skills, commands, agents, and hooks that consuming projects subscribe to via the Launchrail marketplace.

Planned skills (see repository roadmap):

| Skill | Purpose |
|---|---|
| `vision-creation` | Turn an idea into broad product intent, assumptions, and non-goals |
| `design-validation` | Coordinate spec → Claude Design → revised spec → handoff |
| `ralph-release` | Bounded release implementation campaign (Wemuda-provided skill + workflow script, integrated) |
| `browser-smoke` | Drive the app through ticket-defined journeys and capture evidence |

Stages that upstream skills already cover are composed, not duplicated:

- **Complexity grill** → Matt Pocock's `grill-with-docs`
- **Technical research** → Matt Pocock's research skill, fed by the project's grill constraints
- **Spec and tickets** → Matt Pocock's `wayfinder`, `to-spec`, `to-tickets`
