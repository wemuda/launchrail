# ADRs are identified by decision date and slug; the registry index is generated

## Status
Accepted — amends [ADR-0031](0031-adr-registry-and-reading-contract.md): the sequence number and the hand-maintained index row (the collision surface 0031 deliberately kept as a "visible merge conflict") are replaced by a coordination-free identifier and a generated table. The registry, the reading contract, the creation bar, and doctor's filename-level checks stand.

## Context
[ADR-0031](0031-adr-registry-and-reading-contract.md) made the ADR registry the corpus's front door and turned two parallel sessions minting the same number into a merge conflict on the shared index row rather than a silent collision. In practice the conflict is the everyday case, not the exception: most work on this toolchain now runs as parallel agent sessions, each of which mints its record by scanning for the highest number and incrementing. Every pair of branches that both add an ADR collides on the number; the loser renumbers, and the renumber cascades into every reference in that branch — the registry row, the record's own heading, links from READMEs, skills, code comments and commit messages (the history carries a "renumber ADR 0024 → 0025" merge for exactly this).

The number was not the only conflict point. Four distinct collisions showed up:

1. **Same number on two branches** — described above.
2. **Both branches append a row at the end of the index table.** Git treats two insertions at the same line as a conflict even when the numbers differ.
3. **Both branches edit the "live picture" prose.** Same paragraphs, same section — a genuine semantic conflict, independent of any identifier.
4. **Both branches amend the same earlier ADR.** Each rewrites the earlier record's `## Status` line to add itself ("amended by 0034, 0036"): same line, same conflict.

Against that cost the sequence number carries almost no information: it says only that a record came after the one before it, which the file's date would say better, and it is meaningless to a reader who has not memorized the corpus.

## Decision
- **New records are named `YYYY-MM-DD-short-slug.md`** — the date the decision was made, then a slug unique within `docs/adr/`. The identifier is mintable with no coordination (two branches on the same day differ by slug), never needs renumbering, matches the shape this toolchain already uses for migration IDs (`2026-08-add-agents-canonical`), and sorts as a timeline. The **slug is the handle** other documents use: `[adr-date-slug-identifiers](docs/adr/2026-09-11-adr-date-slug-identifiers.md)` in links, "the `adr-date-slug-identifiers` ADR" in prose. Titles no longer carry an `ADR-NNNN:` prefix.
- **Existing numbered records keep their names and are referenced by number.** Renaming 36 files would break the links baked into consuming repos' seeded files and hundreds of references here, for no gain: the scanner accepts both patterns, and the mixed corpus sorts cleanly because `0036-` orders before `2026-`. A project whose records still follow the `NNNN-` scheme keeps those names; only new records take dates.
- **The registry's index table is generated.** `launchrail adr index` rewrites the rows between `<!-- adr-index:start -->` / `<!-- adr-index:end -->` markers in `docs/adr/README.md` from the records on disk — identifier, date, title (the record's first heading), and a status cell derived from the record's `## Status` paragraph. A registry written before the markers existed migrates on the first run: the table under `## Index` is replaced and the markers introduced. After a merge, re-running the command *is* the conflict resolution. Everything outside the markers — the doctrine paragraph, the live picture, the rules — stays hand-written and project-owned; `sync` never touches the file (it is seeded, per 0031), so the table changes only when a person or agent runs the command and commits. `--check` reports staleness without writing, for CI; `doctor` warns on a stale table the same way it warns on an unindexed record.
- **Relations are declared forward and derived backward.** A new record names what it `supersedes`, `amends`, or `extends` in its own `## Status` line, linking the earlier record by file. The generator reads those clauses across the corpus (legacy `amended by …` phrasing is read too) and prints the reverse links in each earlier record's row. Amending an ADR therefore no longer requires editing it — collision 4 disappears, and the explanation of *what* changed lives in the new record where it was written. A superseded ADR's `## Status` line is still rewritten to name its successor: that is the one fact a reader of the record alone must not miss, and supersession is rare enough that the conflict cost is acceptable.
- **Doctor checks identifiers, not numbers.** The duplicate check covers both kinds of identifier (two numbered records sharing a number, two dated records sharing a slug); the registry check adds "index table out of date". Warn, never fail, filename-level only — unchanged posture from 0031.
- **Not chosen as identifier material: a complexity or impact score.** An identifier must be stable and mintable without judgment; a score is subjective, arguable in review, and liable to change as understanding improves, and none of that helps anyone find or cite the record. If impact matters it is a line in the record, not the filename.

## Alternatives considered
- **Keep numbers, add a reservation step (claim the number on the default branch first).** Adds a round-trip to every ADR and still cascades when the claim is forgotten; the number still carries nothing.
- **Random or hash identifiers (ULIDs, short hashes).** Collision-free but meaningless; a reader cannot tell two records apart or order them without opening them. The date gives the same collision freedom with meaning attached.
- **Rename the whole corpus to the dated scheme.** Breaks external links in seeded consuming-repo files and every reference in this repo for no functional gain; 0031's "never renumber" rule exists for this reason.
- **Keep the index hand-maintained but sort rows so insertions land apart.** Same-day records still land adjacent, and the "amended by" column stays a hand-edited shared line. Generation removes the class, not one instance.
- **Regenerate the index from `sync`.** The registry is a seeded file; `sync` writing into it would blur the ownership classes the safety rules protect. A separate, explicit command keeps the write visible and reviewable.

## Consequences
- Easier: parallel sessions mint ADRs without coordinating or renumbering; merges that used to conflict on the index resolve by re-running one command; amending a record touches one file instead of two; the registry row for any record is always in sync with its `## Status`.
- Harder: the derived status cell is only as good as the `## Status` prose — relations must be phrased with the keywords (`supersedes`, `amends`, `extends`, `superseded by`, `amended by`, `extended by`) and link the record by file, and a clause runs to the next keyword, semicolon, or sentence end. References by slug are longer than `ADR-0031`; the payoff is that they mean something.
- Constrained: the mixed corpus is permanent — numbered and dated records coexist and are referenced differently. Consuming repos initialized before this ADR receive the new rules through the managed surfaces (`CLAUDE.generated.md`, skills, the domain doc) and can adopt the generated table by running `launchrail adr index` once; their seeded registry text keeps its old wording until they edit it.

## Revisit when
- The derived status cell mis-reads real status prose often enough that authors start editing the table by hand — the signal to move relations into structured front-matter instead of prose.
- The live picture becomes the dominant conflict point — the signal that legibility needs per-area sections or the distillation stage 0031 declined to build.
