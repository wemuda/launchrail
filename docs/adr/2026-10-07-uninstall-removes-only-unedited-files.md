# Uninstall removes only what Launchrail wrote and nobody has edited

## Status
Accepted; extends [ADR-0006](0006-sync-engine.md): `eject` stops management and leaves the files in place, and `uninstall` is its removal counterpart. It takes Launchrail's footprint out of a project.

## Context
`init` writes about forty paths into a repository. It also runs `git init` when the directory isn't a repository yet. Running it in the wrong folder left the user deleting all of that by hand. A project leaving the rail had the same chore. Nothing in the toolchain could reverse an `init`.

Deleting files in a consuming repository is new for Launchrail. The safety rules say seeded and project-owned files are never overwritten and local work is never destroyed. A removal command has to keep both promises. It must also handle Launchrail's lines inside files the project owns: the guard-hook registration in `.claude/settings.json` (ADR-0021) and the `@`-imports wired into an existing `CLAUDE.md` (ADR-0012).

## Decision
- **The lockfile drives removal.** It records every file Launchrail wrote, with a checksum. A tracked file that is still byte-identical to what Launchrail wrote is removed, whether it is managed or seeded, because nobody has made it theirs. A file edited since, or an ejected file, belongs to the project. It is kept byte-for-byte and listed. Without a lockfile, uninstall refuses to guess.
- **Shared files keep their own content.** Launchrail's lines come out of a shared file only when the file they point at is being removed. An edited, kept guard script keeps its registration, and a kept `AGENTS.md` keeps its import, so nothing is left dangling or broken. The rest of the file stays as it was. A wired `CLAUDE.md` gets back its exact original bytes. A `settings.json` that held only the registration is deleted, just as the printed-index migration deletes a `.gitattributes` it emptied.
- **Bookkeeping always goes.** `.launchrail.yml`, `.launchrail-lock.json` and `dev`'s runtime state under `.launchrail/state/` only mean something to Launchrail, so they go even when edited. Directories the removals leave empty are removed.
- **The repository goes only if init made it and it is empty.** `init` now records `gitInitialized` in the lockfile when it ran `git init`. Uninstall removes `.git` only with that record and only while no ref or reflog holds a commit. With a commit, `.git` is kept and listed.
- **Recoverable and confirmed.** `--dry-run` prints the plan and writes nothing. A real run asks for confirmation; `--yes` skips the prompt, and a non-interactive session without `--yes` refuses. The lockfile is removed last, so an interrupted run is finished by running it again. Uninstall refuses while a background `dev` stack is running, because removing its pid file would orphan the stack. Lockfile paths that resolve outside the project are never touched.

## Alternatives considered
- **Delete every tracked path, edited or not.** Rejected: it destroys local work, which the safety rules forbid. A `--force` flag can be added if someone needs one. The mistaken-`init` case never does, because nothing has been edited.
- **Keep seeded files and remove only managed ones.** Rejected: a mistaken `init` would leave `AGENTS.md`, `CLAUDE.md` and the ADR scaffolding behind, which is most of what the user wanted gone. An unedited seed has no project content to protect.
- **Revert through git** (`git clean` / `git checkout`). Rejected: it assumes the init was committed or the worktree is otherwise clean, it can't tell Launchrail's files from the project's untracked work, and it does nothing for a repository init created.
- **Never touch `.git`.** Rejected: a stray repository is the most confusing leftover of a mistaken init. Every folder below it then looks like part of a repository. Gating removal on init's own record and an empty history removes only what init created.

## Consequences
- Easier: a mistaken `init` is undone with one command and a non-git folder goes back to exactly what it held. A project leaving the rail keeps everything it made its own.
- Harder: edited files stay behind and the user removes them by hand. A managed file edited in place still carries its "Managed by Launchrail" header.
- Constrained: anything new that writes into a consuming repo must be reversible by uninstall. That means a tracked file, or a shared-file line with an inverse that runs when its target goes. Projects initialized before `gitInitialized` was recorded keep their `.git`.

## Revisit when
- Users ask to discard edited files too (add `--force`), or a module writes something that is neither lockfile-tracked nor reversible by a planned inverse.
