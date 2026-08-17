<!--
  Seeded by `launchrail init` from `.launchrail.yml` (issueTracker: linear).
  This file is yours — edit it freely; Launchrail never overwrites it.
-->

# Issue tracker: Linear

Issues and specs for this repo live in Linear. Use the **Linear MCP server's tools** when the session has them (tool names like `mcp__Linear__save_issue`, `mcp__Linear__list_issues`); otherwise say so and hand the operation to the user rather than guessing at an API.

Fill in the team/project so agents don't have to ask:

- **Team**: _(e.g. `ENG` — the team whose backlog this repo's tickets live in)_
- **Project**: _(optional — a Linear project to attach workflow-created issues to)_

## Conventions

- **Create an issue**: `save_issue` with title, markdown description, team, and labels.
- **Read an issue**: `get_issue` (by identifier like `ENG-123`), plus `list_comments` for the discussion.
- **List issues**: `list_issues` filtered by label and state.
- **Comment on an issue**: `save_comment`.
- **Apply / remove labels**: update the issue's labels via `save_issue`; create missing labels with `create_issue_label` once, not per issue.
- **Close**: set the issue's state to Done via `save_issue`, with a closing comment first.
- **Issue ↔ PR linkage**: reference the Linear identifier (e.g. `ENG-123`) in the branch name or PR title so Linear's GitHub integration links and auto-closes it; if the integration isn't set up, close the issue explicitly after the merge.

## Labels

The Launchrail workflow's label vocabulary — the skills quote these exact strings:

- **`ready-for-agent`** — an implementable ticket the implementation loop may pick up. Only tickets wear it; the loop's frontier is computed from this label alone and cannot tell prose from work.
- **`needs-info`** — a parked ticket, carrying its failure history; a human unblocks it.
- **`spec`** — a spec or research note published to the tracker. Never `ready-for-agent`.
- **`ralph:building`** — claimed by an implementer; removed when its PR merges.
- **`wayfinder:map`** / **`wayfinder:<type>`** — a wayfinder map and its decision tickets (see below).

## When a skill says "publish to the issue tracker"

Create a Linear issue in the team above.

## When a skill says "fetch the relevant ticket"

Fetch the issue by its identifier (`ENG-123`) including comments.

## Specs and their tickets

The stage-7 spec ([ADR-0023](https://github.com/wemuda/launchrail/blob/master/docs/adr/0023-spec-home-follows-tracker.md)) is itself an issue here — created by `launch-spec`, labelled **`spec`**, never `ready-for-agent`. There is no `docs/specs/` file; the issue is the canonical spec. When `launch-tickets` breaks it down, each ticket is a **sub-issue of the spec** (Linear's native parent/child). Design validation revises the spec issue in place (its `## Design validation` section lives in the issue description).

## Wayfinding operations

Used by `launch-wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a **sub-issue** of the map (Linear's native parent/child), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Linear's **native "blocked by" relation** — the canonical, UI-visible representation. A ticket is unblocked when every blocking issue is Done.
- **Frontier query**: list the map's open sub-issues, drop any with an open blocking relation or an assignee; first in map order wins.
- **Claim**: assign the issue to yourself — the session's first write.
- **Resolve**: post the answer as a comment, move the issue to Done, then append a context pointer (gist + link) to the map's Decisions-so-far.
