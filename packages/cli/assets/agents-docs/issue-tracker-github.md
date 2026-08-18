<!--
  Seeded by `launchrail init` from `.launchrail.yml` (issueTracker: github).
  This file is yours — edit it freely; Launchrail never overwrites it.
  Contains text derived from Matt Pocock's skills (MIT): https://github.com/mattpocock/skills
-->

# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone. In `gh api` paths you can write the `{owner}/{repo}` placeholders literally and `gh` fills them from the current clone.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## Labels

The Launchrail workflow's label vocabulary — the skills quote these exact strings:

- **`ready-for-agent`** — an implementable ticket the implementation loop may pick up. Only tickets wear it; the loop's frontier is computed from this label alone and cannot tell prose from work.
- **`needs-info`** — a parked ticket, carrying its failure history; a human unblocks it.
- **`spec`** — a spec or research note published to the tracker. Never `ready-for-agent`.
- **`ralph:building`** — claimed by an implementer; removed when its PR merges.
- **`wayfinder:map`** / **`wayfinder:<type>`** — a wayfinder map and its decision tickets (see below).

## Relationships — native, not prose

GitHub renders issue relationships in its own UI: **blocking dependencies** and **parent/child sub-issues** both show in the issue's sidebar, so the frontier is visible at a glance without opening a body. **These native relationships are the canonical representation — create them, don't just describe them in prose.** A body line is the fallback only where the native relationship isn't available; when the two ever disagree, the native relationship wins.

Both APIs key off an issue's numeric **database id**, _not_ its `#number` and _not_ its GraphQL `node_id`. Resolve it once per issue and reuse it:

```bash
gh api repos/{owner}/{repo}/issues/<n> --jq .id     # the database id to pass as issue_id / sub_issue_id below
```

### Blocking (`blocked by`)

- **Add an edge**: `gh api --method POST repos/{owner}/{repo}/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker-db-id>` — issue `<blocked>` is now blocked by the issue whose database id is `<blocker-db-id>`.
- **Read the gate**: an issue carries `issue_dependencies_summary.blocked_by`, the count of its still-**open** blockers — `gh api repos/{owner}/{repo}/issues/<n> --jq .issue_dependencies_summary.blocked_by`. `> 0` means blocked; `0` means every blocker is closed and the edge is clear. List them with `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by`.
- **Remove an edge**: `gh api --method DELETE repos/{owner}/{repo}/issues/<blocked>/dependencies/blocked_by/<blocker-db-id>`.
- **Fallback** (dependencies unavailable): a `**Blocked by:** #<n>, #<n>` line at the top of the blocked issue's body. A ticket is unblocked when every blocker it names is closed.

### Parent / child (sub-issues)

- **Link a child**: `gh api --method POST repos/{owner}/{repo}/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` — the child now nests under the parent and rolls up in its progress. The child must live in the same repo owner as the parent.
- **Read**: `gh api repos/{owner}/{repo}/issues/<n>/parent` and `gh api repos/{owner}/{repo}/issues/<n>/sub_issues`.
- **Fallback** (sub-issues unavailable): a `Part of #<parent>` line at the top of the child body, plus a task list in the parent.

## Issue ↔ PR linkage (Development)

Tie every implementation PR to its ticket so the work closes the loop automatically — this is what fills an issue's **Development** section and closes it on merge:

- Put a **closing keyword** in the PR body — `Closes #<n>` (`Fixes` / `Resolves` work too). GitHub links the PR under the issue's **Development** section, and **merging the PR into the repository's default branch closes the issue**.
- **Auto-close fires only from the default branch.** A PR merged into a consolidation / integration branch (not the default) still links but does **not** auto-close — close the issue explicitly after the merge (`gh issue close <n>`). Squash-merges can also miss the trigger even on the default branch; read the issue back on the remote and close it explicitly if it's still open.
- **One ticket, one PR.** Adopt an existing `<n>`-scoped branch or PR rather than opening a second — the linkage should point at a single PR.

## When a skill says "publish to the issue tracker"

Create a GitHub issue. When the ticket declares blocking edges or a parent, wire them as the **native relationships above** (blocking dependency, sub-issue) — the canonical, UI-visible form the implementation loop's frontier reads — falling back to a body line only where the native relationship isn't available.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Specs and their tickets

The stage-7 spec ([ADR-0025](https://github.com/wemuda/launchrail/blob/master/docs/adr/0025-spec-home-follows-tracker.md)) is itself an issue here — created by `launch-spec`, labelled **`spec`**, never `ready-for-agent`. There is no `docs/specs/` file; the issue is the canonical spec. When `launch-tickets` breaks it down, each ticket is a **GitHub sub-issue of the spec** (`gh api` on the sub-issues endpoint), or carries `Part of #<spec>` at the top of its body where sub-issues aren't enabled. Design validation revises the spec issue in place (its `## Design validation` section lives in the issue body).

## Wayfinding operations

Used by `launch-wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a **sub-issue** (see Relationships → Parent / child), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: the native **`blocked by` dependency** from Relationships — the canonical, UI-visible gate; GitHub reports open blockers as `issue_dependencies_summary.blocked_by`. Fall back to a `Blocked by: #<n>` body line only where dependencies aren't available.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
