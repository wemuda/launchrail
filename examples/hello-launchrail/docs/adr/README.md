# ADR registry

The index of every architecture decision record in this repository. Read this first, then open only the ADRs that touch the area you are working in — the index is the cheap surface; the records are depth.

An ADR records a decision and the context it was made in. It is **not documentation of the current system**: never treat an ADR as evidence that a component exists or still works as described — the code is the source of truth for what exists today.

## Index

| ADR | Title | Status |
| --- | --- | --- |

## The live picture

How the accepted decisions compose into the current system. This section describes the present — rewrite it freely as the system grows; the ADRs behind it are history and stay untouched.

_No decisions recorded yet. When ADRs land, summarize here how they compose into the current system, and name the few a newcomer should read first._

## Maintaining this registry

- New ADRs copy [0000-template.md](0000-template.md), take the next free number (`NNNN-short-slug.md` — check both this index and the files on disk), and add their row here **in the same commit**. The shared row turns two branches minting the same number into a visible merge conflict instead of a silent collision.
- When a new ADR supersedes or amends an earlier one — including reversing part of the earlier one's context — update the earlier ADR's `## Status` line and its row here in the same commit.
- Never delete or renumber an ADR once it is referenced; superseded ADRs are historical records other documents link to.
