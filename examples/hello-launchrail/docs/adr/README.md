# ADR registry

The index of every architecture decision record in this repository. Read this first, then open only the ADRs that touch the area you are working in — the index is the cheap surface; the records are depth.

An ADR records a decision and the context it was made in. It is **not documentation of the current system**: never treat an ADR as evidence that a component exists or still works as described — the code is the source of truth for what exists today.

## Index

The index is generated from the records each time it is read, and never committed — so branches that add ADRs in parallel have no shared table to conflict over. Print it with `npx @wemuda/launchrail adr index`: every record in date order, with its live status (superseded, amended, extended) derived from the records' own `## Status` lines.

## The live picture

How the accepted decisions compose into the current system. This section describes the present — rewrite it freely as the system grows; the ADRs behind it are history and stay untouched.

_No decisions recorded yet. When ADRs land, summarize here how they compose into the current system, and name the few a newcomer should read first._

## Maintaining this registry

- New ADRs copy [0000-template.md](0000-template.md) to `YYYY-MM-DD-short-slug.md` — the date the decision was made, then a slug unique in this directory. There is no sequence number to claim, so parallel branches never collide, and nothing is renumbered.
- The index is **printed, never committed**: `launchrail adr index` builds it from the records each time it runs, so adding or re-statusing a record touches only that record — there is no table to regenerate, commit, or merge.
- A new ADR declares what it supersedes, amends, or extends in its own `## Status` line, linking the earlier record by file. The index derives the reverse links, so amending an ADR does not require editing it. A superseded ADR's `## Status` line is still rewritten to name its successor — that is the one fact a reader of the record alone must not miss.
- Never delete or rename an ADR once it is referenced; superseded ADRs are historical records other documents link to.
- The naming and relation mechanics above summarize a contract Launchrail keeps current in the managed workflow instructions (`.launchrail/CLAUDE.generated.md`); if this seeded summary ever drifts from that managed contract, the managed contract is what holds.
