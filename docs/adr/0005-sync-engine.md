# ADR-0005: Sync engine — checksum-gated safe subset, in-CLI migrations, eject as lockfile state

## Status
Accepted

## Context
Phase 5 of the roadmap: an older project must receive new skills and renamed capabilities without losing local product knowledge. The lockfile already records an ownership class and a checksum per written file, but not the content Launchrail originally wrote — so at sync time the engine knows *whether* a file was locally modified, not *what* the local modification was. The roadmap allows "three-way merge (or safe initial subset)". Everything the engine writes must honor the safety rules: dry-run support, checksum awareness, idempotency, never touching seeded or project-owned files.

## Decision
- **Sync is the safe subset, not a three-way merge.** The desired file surface is recomputed from the manifest (core seeds plus each enabled module), and every write goes through the existing safe writer: missing files are created, managed files are replaced only when their on-disk checksum still matches the lockfile, and a locally modified managed file is a reported conflict that keeps the local version — sync never merges content it cannot reconstruct a base for. `status` reports the same plan without writing; `diff` renders it as unified diffs (a dependency-free LCS diff — the files involved are small).
- **Migrations are code in the CLI, not files in the repo.** A single ordered registry (`MIGRATIONS`) holds every structural change ever shipped, with date-prefixed IDs (`2026-08-plugin-declaration`) so lexicographic order is chronological. Each migration returns an idempotent plan (empty = already satisfied, also the dry-run view); applied IDs are recorded in `.launchrail-lock.json`. A failure stops the run, keeps earlier migrations recorded, and leaves the repository recoverable — re-running resumes at the failed step. Two invariants: planning against a migrated repo yields no changes, and every migration's end state is also produced by the current `init` — which is why a fresh init stamps the whole registry as applied and an existing lockfile is left to `sync`.
- **Eject is lockfile state, not deletion.** `launchrail eject <file|module>` (or `--all` for vendor mode) flips tracked entries to class `"ejected"`: the safe writer refuses every future write to that path — update, or re-creation after deletion — across sync, init, and add. The managed do-not-edit header is rewritten to an "ejected" note only when the file is provably unmodified (checksum match); otherwise the file is left byte-for-byte alone. Eject changes file management only; module flags in `.launchrail.yml` stay as they are.
- **Upstream compatibility tracking is advisory.** A registry of upstream renames (Matt Pocock skills and friends; empty until a rename actually ships) is scanned against project-owned agent docs (`AGENTS.md`, `CLAUDE.md`, `docs/workflow.md`, `docs/agents/*.md`). Stale references are reported by `status` — project-owned files are never edited automatically.
- **Generated-section updates stay whole-file.** Consuming projects get updatable instructions through the managed `.launchrail/CLAUDE.generated.md` imported from the seeded `CLAUDE.md` (phase 2), so sync replaces a whole managed file instead of editing marked sections inside project-owned ones.

## Alternatives considered
- **True three-way merge** — requires the base content of each managed file (stored blobs, or every historical template version addressable by the lockfile's recorded toolchain version). Deliberately deferred, not rejected: the checksum gate is correct today because a conflict never destroys anything, only declines to update.
- **Git-assisted merging** (write desired content on a branch, let `git merge` resolve) — rejected: assumes a clean worktree and pollutes history for what should be a plain command.
- **Marker-delimited managed sections inside seeded files** — rejected: fragile under user edits, and the import-based split already gives updatable content without shared ownership of one file.
- **Migrations as versioned files in consuming repos** — rejected: consuming repos would carry toolchain internals; the CLI version already pins which migrations exist.
- **Eject deleting lockfile entries** — rejected: an untracked-but-existing file looks like a permanent conflict to the planner, and re-seeding after deletion would resurrect ejected files.

## Consequences
- Easier: `status`/`diff`/`sync` share one planner with `init`/`add`, so every command reports identical ownership semantics; new upstream capabilities arrive in old projects as plain `create` actions.
- Harder: a locally modified managed file never receives updates until the user reverts it or ejects it — there is no assisted merge yet.
- Constrained: migrations must keep the satisfied-by-current-init invariant, or the init stamping decision becomes wrong.

## Revisit when
- A real conflict backlog appears in consuming projects (store base content in `.launchrail/` and upgrade the conflict path to a true three-way merge).
- The first actual upstream rename ships (populate the registry; consider an opt-in fixer that edits project-owned docs with confirmation).
- Modules gain files whose generated content must live inside project-owned files (revisit marker-delimited sections).
