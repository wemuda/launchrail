# ADR-0011: `init` actively installs the Claude plugin via the `claude` CLI

## Status
Accepted

## Context
ADR-0003 subscribes consuming projects to the Launchrail plugin through a committed `.claude/settings.json` declaration, relying on Claude Code to prompt for installation. The first real-project dogfood run exposed the gap: Claude Code only offers declared plugins when a folder is **trusted for the first time**. A project whose folder was already trusted before `init` ran — the common case when Launchrail is added to a repo someone has been working in — never sees a prompt, and the user is left with no skills and no explanation. The manual fallback is also a trap: the `/plugin` "Add Marketplace" dialog rejects a bare name like `launchrail` and requires the full `owner/repo` source.

Claude Code ships a scriptable CLI that closes the gap: `claude plugin marketplace add <owner/repo>` and `claude plugin install <plugin>@<marketplace>` work headlessly, are idempotent (exit 0 on "already on disk" / "already installed"), and `claude plugin list --json` reports installed plugins machine-readably.

## Decision
- After writing files, `init` detects the `claude` CLI and, when present, installs the plugin directly: `claude plugin marketplace add wemuda/launchrail`, then `claude plugin install launchrail@launchrail` (user scope). Failure or absence of the CLI never fails `init`; it degrades to printed instructions carrying the exact commands, including the full `owner/repo` marketplace source.
- The committed declaration (ADR-0003) stays: it is what subscribes *the rest of the team*, whose first folder trust still prompts them.
- `doctor` gains a `plugin install` check backed by `claude plugin list --json` — pass when installed, warn (never fail) otherwise or when the CLI is missing.
- Opt-outs: `init --skip-plugin-install`, or `LAUNCHRAIL_SKIP_CLAUDE_CLI=1` in the environment. The test suite sets the latter globally so running tests never mutates a developer's real Claude setup; CLI-invoking tests run against a stub binary on `PATH`.

## Alternatives considered
- **Keep relying on the trust prompt** — failed in practice; the prompt is unreachable for already-trusted folders and there is no documented way to re-trigger it.
- **Manual instructions only** — error-prone (the bare-name trap), and contradicts the goal of a hands-off onboarding.
- **Writing `~/.claude` user settings directly** — bypasses Claude Code's own validation, cache, and clone management; fragile against format changes.
- **`--scope project` install** — redundant with the ADR-0003 declaration that already covers the project scope.

## Consequences
- Easier: one `init` ends with the plugin actually installed; `doctor` can prove it; the printed handoff ("run `/launchrail:launch`") is immediately actionable.
- Harder: `init` now shells out to a third-party CLI whose flags and messages can drift — the wrapper isolates that in one module (`lib/claudeCli.ts`), and tests assert our invocations, not Claude Code's behavior.
- Constrained: the install is user-scoped and machine-local; teammates still onboard through the committed declaration or by running `init`/the printed commands themselves.

## Revisit when
- Claude Code adds a way to trigger the declared-plugin install prompt programmatically or on declaration change.
- The `claude plugin` CLI surface changes (command names, exit codes, `--json` shape).
- The plugin distribution moves off the `wemuda/launchrail` GitHub marketplace.
