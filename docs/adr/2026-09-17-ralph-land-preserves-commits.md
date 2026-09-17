# Ralph land preserves the branch's commits — a merge, not a squash

## Status
Accepted — amends [ADR-0032](0032-ralph-lean-local-gate-loop.md) and [ADR-0022](0022-ralph-campaign-revision.md): the loop lands each finished branch with a non-fast-forward merge that preserves the branch's own commits, replacing the local squash-merge those records specified.

## Context
ADR-0022 gave the loop ownership of the merge gate and ADR-0032 turned that gate into a local landing: the loop lands each finished `ralph/<n>-<slug>` branch with `git merge --squash` onto the integration base and commits once, carrying the implementer's Conventional Commit title, `(#n)`, and a `Closes #n` trailer. One commit per ticket on the base — the branch's own commits collapsed into it.

The squash was inherited from the per-ticket-PR era (ADR-0022 squash-merged through the GitHub API), not chosen against the landing model that replaced it. Two facts of the current loop argue against it. First, ADR-0032's persistence model has each implementer **commit and push after every green step** — the branch is a real, if noisy, record of how the ticket was built (its TDD seams, its subtasks), and the squash discards all of it at the base. Second, the integration base is the campaign's history until the one release PR; collapsing every ticket to a single commit there is a choice about what that history preserves, and the preference is now the opposite one: keep the branch's commits on the base rather than one large per-ticket commit.

## Decision
The land is a **non-fast-forward merge** of the pushed branch onto the base, and nothing else about the landing changes.

- The lander runs `git merge --no-ff origin/ralph/<n>-<slug>` in the loop's own checkout, under the fast gate, strictly one at a time. The merge commit's message is what the squash commit's was — the implementer's Conventional Commit title, `(#n)`, and the `Closes #n` trailer, plus the `Landed by the Ralph loop from <branch>@<sha>` provenance line — so the ticket→commit trail and the auto-close keyword are intact; they now ride a merge commit whose second parent is the branch, with the branch's commits reachable beneath it.
- **`--no-ff` always**, never a fast-forward: every ticket produces exactly one merge commit even when the branch already contains the base tip. That merge commit is the per-ticket landing marker and the grouping that records which commits came from which ticket.
- A merge that reports **"Already up to date"** (the branch adds nothing to the base) is the empty-land case, reported `failed` exactly as the empty squash was.
- The `baseMoved` and **re-sync** machinery is unchanged. A merge that conflicts, or a merged tree that fails the gate although the branch was fine on its own, hands the ticket back for a re-sync (no attempt spent, twice at most) as before; the merge's conflict surface is the branch's net change against the moved base — the same surface the squash had.
- The manifest/lockfile-change check (`git diff --name-only HEAD~1 HEAD`, deciding whether to reinstall before the gate) reads the merge commit's first parent — the base tip it merged into — so it still sees exactly the branch's net contribution.

The parallel copies move together (ADR-0005/0022): the `ralph` workflow's Land dispatch, the `launch-ralph` skill's landing section and policy lines, the `launch-ralph-implement` hand-off note, and the seeded loop summary all describe a merge, not a squash.

## Alternatives considered
- **Keep the squash-merge.** Rejected: it is precisely what discards the per-ticket history we now want to keep, and the deliberately noisy push-after-every-green-step cadence means there is real branch history to preserve.
- **Linear history via rebase or `--ff-only`** (replay the branch's commits with no merge commit). Rejected: `--ff-only` lands only when the branch already contains the base tip, so a base that moved under a finished branch — the ordinary case at width > 1 — could no longer land directly and would force a re-sync the squash and the merge do not need, trading throughput for a flat log; a rebase-on-land would rewrite the pushed branch's shas and break the "the pushed branch is the checkpoint" adoption model (ADR-0032). The merge commit also records which commits belong to which ticket, which a flattened history loses.
- **Preserve commits but curate them** (collapse the WIP noise, keep only meaningful commits). Rejected as out of scope here: that is a change to the implementer's commit cadence, not to the landing. The cadence is the crash-recovery mechanism and is meant to be cheap; if curated per-ticket history is wanted later, tighten it in `launch-ralph-implement` and the landing will merge whatever the branch carries.

## Consequences
- Easier: the integration base — and the release PR it becomes — shows each ticket's real commits, grouped under a labelled merge commit; reverting a landed ticket is `git revert -m 1 <merge>`; bisect still works.
- Changed: the base history is no longer one linear commit per ticket. It carries a merge commit per ticket with the branch's commits beneath — including whatever the push-after-every-green-step cadence produced. A reader who wants a one-line-per-ticket view of the base reads `git log --first-parent`. Preserving all of the branch's commits, WIP included, is the behavior asked for.
- Unchanged: the fast gate still runs on the merged tree before the base is pushed; the serialized lander, remote verification, checkpoints, `resyncs`, `knownGreen`, and the recap are untouched; `Closes #n` and the `(#n)` trail ride the merge commit. The single-ticket `/launch-implement` PR flow is not the loop's landing and is untouched — a one-ticket PR squash-merged into the default branch stays a conventional, separate choice.
- Covered by the workflow tests: the Land dispatch merges with `git merge --no-ff origin/<branch>`, no `--squash` anywhere in the engine; the conflict and gate-failed hand-backs still re-sync without spending an attempt.

## Revisit when
- Field data shows the merge commits, or the preserved WIP noise beneath them, make the integration history hard to read or the release PR unwieldy enough that curated per-ticket commits (a tightened implementer cadence) or a `--first-parent`-only release view earns its contract.
- A project wants linear integration history badly enough to accept rebase-on-land and the pushed-branch-sha rewrite it implies.
