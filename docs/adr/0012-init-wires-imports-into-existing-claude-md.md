# ADR-0012: Init wires the workflow imports into an existing CLAUDE.md

## Status
Accepted — applies the additive-merge precedent of [ADR-0003](0003-plugin-subscription-via-project-settings.md) to a second project-owned file.

## Context
`launchrail init` is meant to work "on a blank repo and a realistic existing repo without destroying local files" (Phase 1). The realistic existing repo is the one already using AI: it almost always already has a `CLAUDE.md`.

`CLAUDE.md` is a **seeded** file — created once, then project-owned, never overwritten. That protection is correct and unchanged. But Launchrail's seeded `CLAUDE.md` earns its keep through two `@`-imports at the top:

- `@AGENTS.md` — the shared, vendor-neutral agent contract, and
- `@.launchrail/CLAUDE.generated.md` — the **managed** workflow instructions, rewritten by `sync` as modules change.

When init skips a pre-existing `CLAUDE.md`, those import lines are never added. Init still writes `.launchrail/CLAUDE.generated.md` (it is managed, so it is always created), but nothing imports it: the managed workflow instructions sit on disk and Claude Code never loads them. This is silent — the previous `doctor` only checked for the `@AGENTS.md` import, so a project could look healthy while the workflow guidance was disconnected. Onboarding a mid-development project therefore required two manual, undocumented steps (add the imports; fold conventions in) that nothing surfaced.

This is exactly the ownership problem ADR-0003 already solved for `.claude/settings.json`: a project-owned file that Launchrail nonetheless needs to *link itself into* without owning wholesale.

## Decision
- `init` treats the two `@`-imports as required linkage and ensures they are present in `CLAUDE.md`. When the file already exists, it performs an **additive merge**: it prepends only the missing import lines at the top of the file and touches nothing else. When there is no `CLAUDE.md` yet, the existing seed writer creates the complete file as before — the merge path is a no-op.
- The merge is **idempotent**: an import already present (on a line of its own) is never re-added, so re-running `init` — the supported way to bring a project adopted before this change up to date — converges. Existing content is preserved verbatim below the imports.
- `CLAUDE.md` remains **project-owned and un-overwritten**. The whole-file writer still classifies a pre-existing `CLAUDE.md` as `keep` (`skip-seeded-exists`); the import wiring is a separate, surgical, additive edit, and (like the `.claude/settings.json` declaration) it is **not tracked in the lockfile** — checksum tracking would misreport every legitimate edit to a project-owned file as drift.
- `init` is **explicit** about adopting an existing project: it prints an "adopting an existing project" line, shows the CLAUDE.md wiring in its plan, and confirms afterward exactly which imports it added.
- `doctor` now checks **both** imports and names the missing one, so the orphaned-instructions case can no longer pass silently.

## Alternatives considered
- **Warn only, wire nothing** — leaves the manual step in place; the managed instructions stay orphaned until the user reads a warning and hand-edits a file. The whole point of `init` is to set the rails, not to assign homework.
- **Overwrite the existing CLAUDE.md with the seed** — destroys the project's own Claude instructions; violates the seeded/project-owned guarantee.
- **Track CLAUDE.md as a managed file** — rejected for the same reason ADR-0003 rejected managing `.claude/settings.json`: the project must keep editing it, so every edit would read as drift or get clobbered.
- **Append the imports at the end of the file** — `@`-imports work anywhere, but the top is where they are discoverable and where the seed puts them; prepending keeps the import block contiguous and matches a fresh init's output.

## Consequences
- Easier: adopting a mid-development project is one command; the managed workflow instructions actually reach Claude; `doctor` surfaces the disconnect if the imports are ever removed; a project onboarded before this change is fixed by simply re-running `init`.
- Harder: a second bespoke additive-merge path outside the `planWrites`/`applyPlan` writer, carrying its own idempotence/preservation tests (as ADR-0003's does).
- Constrained: Launchrail may only ever *add* its own import lines to `CLAUDE.md` — never reorder, rewrite, or remove the project's content. Anything more invasive needs a new decision.

## Revisit when
- Claude Code changes how `CLAUDE.md` imports are expressed.
- The set of required imports changes (a new managed instructions file, or a rename).
- A user needs a supported way to *opt out* of an import (today the escape hatch is `eject` of the generated file plus removing the line; if that becomes common, model it explicitly as ADR-0003 does for a `false` plugin value).
