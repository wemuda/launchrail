# Launchrail Claude Code plugin

Skills, commands, agents, and hooks that consuming projects subscribe to via the Launchrail marketplace.

Planned skills (see repository roadmap):

| Skill | Purpose |
|---|---|
| `vision-creation` | Turn an idea into broad product intent, assumptions, and non-goals |
| `complexity-grill` | Classify the project and surface product, technical, security, and operational constraints |
| `technical-landscape` | Create a research brief tied to the project's constraints |
| `design-validation` | Coordinate spec → Claude Design → revised spec → handoff |
| `ralph-release` | Create a bounded release implementation prompt from approved tickets |
| `browser-smoke` | Drive the app through ticket-defined journeys and capture evidence |
| `release-verification` | Check spec, design, tests, smoke results, and reviews before release |
| `launchrail-status` | Explain the project's current stage, missing artifacts, and drift |

The plugin composes upstream skills (Matt Pocock's engineering skills, the Ralph Wiggum plugin) rather than duplicating them.
