# ADR-0003: Plugin subscription via project-scoped Claude Code settings

## Status
Superseded by [ADR-0019](0019-vendor-skills-retire-plugin.md) — the plugin subscription is retired in favor of vendored, managed skill files that reach cloud and non-Claude agents. (Originally Accepted; extended by [ADR-0011](0011-init-installs-plugin-via-claude-cli.md): the declaration covered the whole workflow plugin roster and init installed it via the `claude` CLI.)

## Context
Phase 2 requires that consuming projects get the Launchrail Claude Code plugin "through a project-scoped declaration": every collaborator who opens the repo in Claude Code should be offered the same skills, without each person installing the plugin by hand. Claude Code supports this natively — a committed `.claude/settings.json` can declare marketplaces (`extraKnownMarketplaces`) and enable plugins (`enabledPlugins`), and Claude Code prompts collaborators to trust and install them. The complication is ownership: `.claude/settings.json` also carries unrelated, project-owned configuration (permissions, hooks, environment), so none of Launchrail's existing whole-file ownership classes (managed / seeded) fit it.

## Decision
- `launchrail init` declares the plugin in the committed `.claude/settings.json`: the `launchrail` marketplace (GitHub source `wemuda/launchrail`) under `extraKnownMarketplaces`, and `"launchrail@launchrail": true` under `enabledPlugins`.
- The file remains **project-owned**. Init performs an additive JSON merge only: it creates the file when absent, adds the two keys when missing, and never removes, reorders, or rewrites anything else. It is not tracked in the lockfile — checksum tracking would misreport every legitimate project edit as drift.
- Existing values win. A `launchrail` marketplace entry pointing elsewhere (e.g. a fork) is kept, and an explicit `"launchrail@launchrail": false` is an opt-out that init never flips back.
- A file that fails to parse is left untouched; init reports the conflict and continues, and `doctor` warns about it.

## Alternatives considered
- **Manual installation instructions only** — no per-project consistency; every collaborator's session would depend on their global plugin setup.
- **Managing `.claude/settings.json` as a managed file** — rejected: Launchrail would own a file that projects must also edit, guaranteeing constant checksum conflicts or destroyed local configuration.
- **A separate managed settings file** (e.g. `.claude/settings.launchrail.json`) — Claude Code does not merge arbitrary extra settings files, so the declaration would be dead weight.
- **Vendoring the plugin into each project** — copy-once-and-rot; contradicts the subscription model the toolchain exists to provide.

## Consequences
- Easier: one `init` gives the whole team the same skills; `doctor` can verify the subscription; future modules can extend the same declaration.
- Harder: the merge path is bespoke (outside the planWrites/applyPlan writer), so it carries its own tests for idempotence and preservation of local content.
- Constrained: Launchrail may only ever add keys it owns to this file; anything more invasive needs a new decision.

## Revisit when
- Claude Code changes the project-scoped marketplace/plugin declaration format.
- The plugin is published somewhere other than the `wemuda/launchrail` GitHub repo.
- Launchrail needs to write settings beyond the two declaration keys.
