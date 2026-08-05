# ADR-0011: `init` actively installs the workflow's Claude plugins via the `claude` CLI

## Status
Accepted

## Context
ADR-0003 subscribes consuming projects to the Launchrail plugin through a committed `.claude/settings.json` declaration, relying on Claude Code to prompt for installation. The first real-project dogfood run exposed the gap: Claude Code only offers declared plugins when a folder is **trusted for the first time**. A project whose folder was already trusted before `init` ran — the common case when Launchrail is added to a repo someone has been working in — never sees a prompt, and the user is left with no skills and no explanation. The manual fallback is also a trap: the `/plugin` "Add Marketplace" dialog rejects a bare name like `launchrail` and requires the full `owner/repo` source.

The same dogfood run stalled again one stage later: the `launch` conductor's first move on a fresh project is Matt Pocock's skills setup, a dependency a new user has never heard of and has no reason to know how to install. The workflow's upstream plugins are as much a prerequisite as Launchrail's own.

Claude Code ships a scriptable CLI that closes the gap: `claude plugin marketplace add <owner/repo>` and `claude plugin install <plugin>@<marketplace>` work headlessly, are idempotent (exit 0 on "already on disk" / "already installed"), and `claude plugin list --json` reports installed plugins machine-readably.

## Decision
- After writing files, `init` detects the `claude` CLI and, when present, installs **every plugin the workflow depends on** (user scope): `launchrail@launchrail` from `wemuda/launchrail` and `mattpocock-skills@mattpocock` from `mattpocock/skills`. The roster is one list (`WORKFLOW_PLUGINS` in `lib/claudeCli.ts`) and grows only when the workflow gains a real upstream dependency. Failure or absence of the CLI never fails `init`; it degrades to printed instructions carrying the exact commands, including the full `owner/repo` marketplace sources.
- The committed declaration (ADR-0003) stays and grows the same roster: init declares both marketplaces and both plugins in `.claude/settings.json`, so a teammate's first folder trust offers the upstream skills too — not just Launchrail's plugin. A shipped migration (`2026-08-upstream-plugin-declarations`) brings existing projects along via `sync`.
- `doctor` gains a `plugin install` check backed by `claude plugin list --json` — pass when the whole roster is installed, warn (never fail) listing what's missing or when the CLI is absent.
- Opt-outs: `init --skip-plugin-install`, or `LAUNCHRAIL_SKIP_CLAUDE_CLI=1` in the environment. The test suite sets the latter globally so running tests never mutates a developer's real Claude setup; CLI-invoking tests run against a stub binary on `PATH`.

## Alternatives considered
- **Keep relying on the trust prompt** — failed in practice; the prompt is unreachable for already-trusted folders and there is no documented way to re-trigger it.
- **Manual instructions only** — error-prone (the bare-name trap), and contradicts the goal of a hands-off onboarding.
- **Writing `~/.claude` user settings directly** — bypasses Claude Code's own validation, cache, and clone management; fragile against format changes.
- **`--scope project` install** — redundant with the ADR-0003 declaration that already covers the project scope.

## Consequences
- Easier: one `init` ends with every workflow plugin actually installed; `doctor` can prove it; the printed handoff ("run `/launchrail:launch`") is immediately actionable, and the conductor never has to explain who Matt Pocock is before the user can proceed.
- Harder: `init` now shells out to a third-party CLI whose flags and messages can drift — the wrapper isolates that in one module (`lib/claudeCli.ts`), and tests assert our invocations, not Claude Code's behavior. Installing upstream plugins also means their marketplaces' availability affects init UX (degraded messaging, never failure).
- Constrained: installs are user-scoped and machine-local; teammates still onboard through the committed declaration or by running `init`/the printed commands themselves. The roster is opinionated by design — customization happens in Claude Code afterwards, not through init options.

## Revisit when
- Claude Code adds a way to trigger the declared-plugin install prompt programmatically or on declaration change.
- The `claude plugin` CLI surface changes (command names, exit codes, `--json` shape).
- The plugin distribution moves off the `wemuda/launchrail` GitHub marketplace.
