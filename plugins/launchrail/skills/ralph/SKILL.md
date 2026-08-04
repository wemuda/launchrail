---
name: ralph
description: Orchestrate a bounded Ralph implementation campaign — dispatch fresh-context implementer subagents over the ready ticket frontier, verify every claimed merge against the remote, and gate completion on the project's verification contract. Only ever started explicitly by the user.
disable-model-invocation: true
---

# Ralph — the autonomous implementation campaign

You are the orchestrator. **You do not write code. You do not read diffs. You do not fix failing branches yourself.** You compute what's ready, dispatch, verify, and keep a running log. Tracker state and subagent reports in, decisions out.

One agent implementing a whole backlog in a single session degrades — context fills with diffs and half-remembered state, and quality drops with every ticket. This loop inverts that: every ticket gets a fresh-context implementer subagent that owns it end to end, merge included, and nothing an implementer reports is trusted until the remote confirms it.

This skill is the watchable, checkpointed frontend of the loop. The same loop exists as a deterministic workflow (`.claude/workflows/ralph.js`, installed by `launchrail add ralph`) — prefer the workflow when the dependency graph is wide or the run is long (script state cannot be compacted away); prefer this skill when you want to watch each dispatch, the graph is a chain, or something is already going wrong. The two share one policy block: change a policy here, change it in the workflow too.

## Policies

- **Width: 2** implementers at once. Width multiplies conflict rate and shared-machine load, not just throughput — use 1 until a campaign has landed tickets cleanly on this project. Cut a batch below width when its tickets would obviously collide (same module, same files); when in doubt, narrow.
- **Attempts: 2** — retry a failed ticket once with a fresh context, then park it.
- **Max rounds: 10** — a backstop, not a target; stop and report if the frontier hasn't drained.
- **Checkpoints: none** by default — run to completion, report once. The user may ask for a pause after each round instead.
- **Review gate:** the implementer's own self-review via `/code-review`, inside `launchrail:ralph-implement`.
- **Verification gate:** `npx @wemuda/launchrail verify` — per ticket before the PR, and once more on the final base before the campaign may report success.
- **Merge ordering: optimistic, arbitrated by the remote.** Implementers re-sync immediately before merging and retry up to 3 times if the base moved. No merge locks.
- **Labels:** tickets enter as `ready-for-agent`, are marked `ralph:building` while owned, and leave as closed or `needs-info` (parked).

## Preconditions — refuse to start if any fails

1. `.launchrail.yml` exists with `issueTracker` not `none`, and the tracker is reachable **from this environment**: check whether the CLI the project docs assume (e.g. `gh`) is installed here; if not, identify the substitute (e.g. GitHub MCP tools) and name it in every dispatch.
2. Open tickets labeled `ready-for-agent` exist and carry explicit `Blocked by: #n` edges (or the tracker's native blocking relations). No tickets with edges → nothing to orchestrate; point the user at `to-tickets`.
3. The base branch is green on a fresh checkout: sync it, run the install command, then `npx @wemuda/launchrail verify` — a broken base poisons every implementer after it. An **empty verification contract fails `verify` and is a refusal condition**: a campaign whose completion nothing can verify must not start. Tell the user to configure `testing` commands in `.launchrail.yml` first.
4. The verbatim local commands are known (from `AGENTS.md` / `.launchrail.yml`), including which checks belong to CI rather than the shared local machine.

## The loop

Sync → compute frontier → dispatch batch → verify → handle outcomes → back to sync.

- **You resolve blocking edges yourself,** from tracker state — never by asking a subagent what's ready. The frontier is every ticket that is open, labeled `ready-for-agent`, not `needs-info`, not already attempted twice, and whose blockers are all settled (closed before the run, or merged and verified by this run). Parked tickets never block the loop; anything behind them is reported as stuck.
- Dispatch up to *width* frontier tickets, **spawning the batch's subagents in a single message** so they run concurrently.
- **Verify every claimed merge against the remote** before it counts: PR merged into the base, issue closed. A subagent's report is a claim, not evidence. Use a cheap, separate check (tracker API only — a PR description or comment is not evidence).

## The dispatch prompt

Each implementer prompt is self-contained — assume it knows nothing about this session or the other implementers. It carries: the ticket number and title, the verbatim commands, how to reach the tracker from this environment, and these seven steps:

1. Read the ticket and everything it links (spec sections, ADRs, journeys), plus `AGENTS.md`/`CLAUDE.md`. If the ticket is already closed, report "already-done" and stop.
2. Label the ticket `ralph:building`.
3. Branch from a fresh sync of the base: `ralph/<n>-<short-slug>`.
4. Implement by invoking the **`launchrail:ralph-implement`** skill — it owns TDD, the verification gate, browser smoke for user-facing changes, self-review via `/code-review`, and commit conventions. Name the skill; do not paraphrase it.
5. Pre-PR sync: merge the latest base into the branch; resolve conflicts with the **`launchrail:resolving-merge-conflicts`** skill; re-run the verification gate if anything changed.
6. Open a PR titled from the ticket with `Closes #<n>` in the body. Never open a second PR for a ticket — adopt an existing one.
7. Wait for CI if the repository has it (fix failures on the branch; ~20 minutes is the budget), re-sync immediately before merging (up to 3 retries if the base moves), then squash-merge. Squash-merge does not reliably fire `Closes` — read the issue back and close it explicitly if still open.

Every dispatch — retries included — also carries these two clauses verbatim:

> **Integrity.** No placeholders, no stubs, no "simplified for now". Never delete, skip, or weaken a test to get a green run; if a test is genuinely wrong, fix it deliberately and say so in the PR body. Never claim verification passed without having run it.

> **Idempotency.** Before starting, check whether the ticket is already closed (report "already-done") and whether a `ralph/<n>-*` branch or open PR already exists (adopt it, don't restart). Never open a second PR for a ticket.

## Outcome handling

- **Verified merge** → one log line; the ticket settles and may unblock others.
- **First failure** → delete the failed branch, then re-dispatch later with a *fresh context* plus the failure summary. A failed attempt's context is assumed poisoned — never resume it.
- **Second failure** → park: comment both failure summaries on the ticket, remove `ralph:building`, add `needs-info`, move on.
- **Systemic failure** — the base breaks, the tracker becomes unreachable, or the *same* infrastructure error hits different tickets → stop the whole campaign and report; another retry won't fix it.

## Campaign close-out — verification-gated completion

When the frontier drains (or max rounds / a stop condition hits):

1. Sync a fresh base and run `npx @wemuda/launchrail verify`. **The campaign may not report success while this fails** — report "unverified" with the failures instead.
2. If `.launchrail.yml` has `modules.browser-testing: true` and any merged ticket changed user-facing behavior, dispatch one smoke run per the `launchrail:browser-smoke` skill and reference its evidence bundle (`artifacts/verification/<run-id>/`).
3. Report the release evidence summary: merged tickets (PR and merge commit each), parked tickets with their failure histories, stuck tickets and what blocks them, follow-ups implementers punted, and the verification outcome with its evidence. Evidence over assertion — link what was run, never summarize what wasn't.

## Rules

- Fresh context per dispatch, per retry. No exceptions.
- Never implement, review, or repair code in the orchestrator session — dispatch instead.
- Name the skills (`launchrail:ralph-implement`, `launchrail:resolving-merge-conflicts`, `launchrail:browser-smoke`); never paraphrase their contents into a prompt.
- Nothing counts as merged until the remote says so; nothing counts as done until `verify` is green.
- Width is a lever, not a goal. Narrow it whenever tickets might collide.
