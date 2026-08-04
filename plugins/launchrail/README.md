# Launchrail Claude Code plugin

Skills, commands, agents, and hooks that consuming projects subscribe to via the Launchrail marketplace. Consuming projects declare the plugin in `.claude/settings.json` — `launchrail init` sets this up (see ADR-0003).

## Skills

| Skill | Purpose |
|---|---|
| [`vision-creation`](skills/vision-creation/SKILL.md) | Turn an idea into broad product intent, assumptions, and non-goals (`docs/vision.md`) |
| [`design-validation`](skills/design-validation/SKILL.md) | Coordinate spec → Claude Design → revised spec → handoff |
| [`browser-smoke`](skills/browser-smoke/SKILL.md) | Drive the app through defined smoke journeys and capture a traceable evidence bundle (pairs with `launchrail add browser-testing`) |
| [`ralph`](skills/ralph/SKILL.md) | Orchestrate a bounded Ralph implementation campaign — fresh-context implementers over the ticket frontier, remote-verified merges, verification-gated completion (pairs with `launchrail add ralph`; user-invoked only) |
| [`ralph-implement`](skills/ralph-implement/SKILL.md) | The per-ticket implementation contract Ralph dispatches name: TDD, the `verify` gate, browser smoke, self-review, conventional commits |
| [`resolving-merge-conflicts`](skills/resolving-merge-conflicts/SKILL.md) | Resolve conflicts without losing either side's behavior — the protocol for parallel implementers landing against a moving base |

The same campaign also exists as a deterministic workflow: `launchrail add ralph` installs a managed `.claude/workflows/ralph.js` for wide or long runs (ADR-0005). The skill and the workflow share one policy block — change one, change both.

## Workflow

[docs/workflow.md](docs/workflow.md) is the stage-by-stage contract from idea to validated MVP spec: which tool owns each stage and what committed artifact it leaves behind.

Stages that upstream skills already cover are composed, not duplicated:

- **Complexity grill** → Matt Pocock's `grill-with-docs`
- **Technical research** → Matt Pocock's research skill, fed by the project's grill constraints
- **Spec and tickets** → Matt Pocock's `wayfinder`, `to-spec`, `to-tickets`
