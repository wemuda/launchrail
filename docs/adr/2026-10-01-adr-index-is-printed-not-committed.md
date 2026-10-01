# The ADR index is printed on demand, never committed

## Status
Accepted; supersedes [adr-index-merge-driver](2026-09-21-adr-index-merge-driver.md); amends [adr-date-slug-identifiers](2026-09-11-adr-date-slug-identifiers.md): the index stays generated from the records' own `## Status` lines, but it is printed by `launchrail adr index` instead of committed into the registry. Amends [ADR-0031](0031-adr-registry-and-reading-contract.md): the reading contract starts from the printed index; the registry keeps the doctrine, the live picture and the minting summary.

## Context
[adr-date-slug-identifiers](2026-09-11-adr-date-slug-identifiers.md) made record *files* coordination-free, but kept a generated table committed in `docs/adr/README.md` that every ADR-adding branch rewrites. [adr-index-merge-driver](2026-09-21-adr-index-merge-driver.md) tried to make that shared file merge cleanly with a git merge driver. In the field it did not hold:

- **GitHub never runs it.** A merge driver is defined in per-clone git config. A pull request's mergeability check and GitHub's conflict editor do a plain text merge, so a PR that added an ADR still showed "This branch has conflicts" whenever its base had gained another ADR touching the same row. Fixback's PR 627 hit exactly this.
- **The rows collide even with dated names.** A new record that amends an older one adds an "amended by" link to the *older* record's row. Two branches amending the same popular record (fixback's usage-based billing ADR has about ten inbound links) edit the same line.
- **The driver recursed without end.** It read the merged records with `git merge-tree --write-tree`, a real merge that resolves `docs/adr/README.md` through the same driver, and so on. A merge where both sides changed the index never finished. Fixback carried a guard script against it, and this repository's own driver test set off the same runaway in a sandbox.
- **It needed per-clone setup.** Every clone had to register the driver (`init`, `sync`, `doctor`, or a setup hook), and a session that skipped it fell back to the conflict.

Each fix added machinery to keep one shared, derived file mergeable. The file did not need to be shared at all. Its content is fully derived from the records, and the records already merge cleanly.

## Decision
- **The index is printed, never committed.** `launchrail adr index` prints the table to stdout: every record in timeline order, with its live status and the reverse links later records imply. The table is the same one the registry used to hold, with links that resolve from the repository root. It writes nothing. Adding or re-statusing an ADR touches only that record, so parallel ADR branches have no shared file to conflict over, on GitHub or anywhere else.
- **The registry keeps everything a human writes.** `docs/adr/README.md` keeps the doctrine paragraph, the live picture and the minting summary. Its `## Index` section becomes a pointer to the command.
- **The reading contract starts from the printed index.** Every place that told agents to read the registry index now says to print it with `npx @wemuda/launchrail adr index`: the managed `CLAUDE.generated.md`, Ralph's implementer preamble, the spec and ticket skills, and the seeded `AGENTS.md` and `docs/agents/domain.md`.
- **The merge driver is removed.** `init`, `sync` and `doctor` stop registering it, and `sync` and `doctor` remove the clone's leftover config. `launchrail adr merge-driver` stays only as a shim that runs git's own text merge, for a clone that still binds it from an older branch's `.gitattributes`. Doctor's "missing from the index" and "index out of date" checks go with the table. Doctor warns instead when a registry still commits a table.
- **One migration, `2026-10-adr-index-printed-not-committed`, carries existing repos over.** It replaces the table between the `adr-index` markers with the pointer. Those rows were always Launchrail's, rewritten wholesale on every run. It also swaps the exact guidance bullet and template text Launchrail seeded about the committed table, and removes the one `.gitattributes` line Launchrail added, deleting the file when that line was all it held. A table without markers, edited wording and other attribute rules stay the project's, and an ejected registry is not touched. The retired `2026-09-adr-index-merge-driver` migration becomes a no-op, kept so lockfiles that recorded it stay valid.

## Alternatives considered
- **Keep the driver and fix the recursion.** That fixes local merges only. GitHub still shows the conflict, and every clone still needs the per-clone config.
- **A bot that merges the base into conflicted PRs and regenerates.** Pushes made with the default `GITHUB_TOKEN` do not trigger CI, so it would need an app token or a personal access token, plus a managed workflow in every consumer. That is more machinery for a file nobody needs to share.
- **Drop only the reverse links from the committed table.** That removes the same-row collisions, but two branches appending rows at the end of the table on nearby dates still conflict.
- **Regenerate the committed table on the default branch after each merge.** That needs a bot commit on every ADR merge and permission to push to a protected branch, and the index is stale on every feature branch in between.

## Consequences
- Easier: ADR work never conflicts on the index, through GitHub, a local merge, a rebase or the Ralph loop. No per-clone setup, merge driver, guard script or `.gitattributes` line remains, and there is no "regenerate and commit the index in the same commit" rule to forget.
- Harder: browsing `docs/adr/` on GitHub no longer shows a status table. The file listing still reads as a timeline, because dated names sort by date, but seeing at a glance what superseded what takes running the command. Agents run one command where they used to read one file.
- Constrained: the printed index is only as good as the records' `## Status` lines, which was already true of the generated table. The live picture is still hand-written prose, so two branches rewriting the same paragraph still conflict. That is a genuine conflict, and it stays one.

## Revisit when
- People rely on browsing the status table on GitHub. That would argue for publishing it somewhere generated (a docs site or a release artifact), never committed back into the tree.
- A consumer needs the index in a machine-readable form. That would argue for a `--json` flag, not for committing a file.
