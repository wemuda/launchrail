<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is committed under `docs/specs/` (the rail's stage-7 artifact); `.scratch/<feature-slug>/spec.md` may hold a working copy
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Ticket state is recorded as a `Status:` line near the top of each issue file, using the label vocabulary below
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Labels

The Launchrail workflow's label vocabulary, written as `Status:` / `Type:` line values — the skills quote these exact strings:

- **`ready-for-agent`** — an implementable ticket the implementation loop may pick up. Only tickets wear it.
- **`needs-info`** — a parked ticket, carrying its failure history; a human unblocks it.
- **`spec`** — a spec or research note, never an implementable ticket.
- **`ralph:building`** — claimed by an implementer; cleared when its work merges.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `launch-wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
