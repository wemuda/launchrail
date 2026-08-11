---
name: ralph
description: Orchestrate the bounded Ralph implementation loop — dispatch fresh-context implementer subagents over the ready ticket frontier, verify every claimed merge against the remote, and gate completion on the project's verification contract. Also the supervisor's contract when the loop runs as the ralph workflow. The engine behind /launchrail:implement (the user-typed front door) — never invoke it on your own initiative; reach it through that door or an explicit user request to run the loop.
---

# Ralph — the autonomous implementation loop

The user starts this loop through `/launchrail:implement` (or by asking for it in so many words); it is never started unprompted — a campaign spawns many agents and merges PRs, so the start is always a human decision.

You are the orchestrator. **You do not write code. You do not read diffs. You do not fix failing branches yourself.** You compute what's ready, dispatch, verify, and keep a running log. Tracker state and subagent reports in, decisions out.

One agent implementing a whole backlog in a single session degrades — context fills with diffs and half-remembered state, and quality drops with every ticket. This loop inverts that: every ticket gets a fresh-context implementer subagent that owns it end to end, merge included, and nothing an implementer reports is trusted until the remote confirms it.

This skill is the watchable, checkpointed frontend of the loop. The same loop exists as a deterministic workflow (`.claude/workflows/ralph.js`, installed by init; `launchrail sync` restores it) — prefer the workflow when the dependency graph is wide or the run is long (script state cannot be compacted away); prefer this skill when you want to watch each dispatch, the graph is a chain, or something is already going wrong. The two share one policy block: change a policy here, change it in the workflow too (ADR-0005, field-revised by ADR-0010).

## Policies

- **Width: 3** implementers at once. Width multiplies conflict rate and shared-machine load, not just throughput — use 1 until a run has landed tickets cleanly on this project. Cut a batch below width when its tickets would obviously collide (same module, same files); when in doubt, narrow.
- **Attempts: 2** — retry a failed ticket once with a fresh context, then park it.
- **Deferrals are not attempts.** An implementer that stops at its dependency gate (a declared blocker had not actually landed) hands the attempt back and is retried after the blocker lands — capped at 2 deferrals, then it counts as a real failure.
- **Max rounds: 25** — a backstop, not a target; deferral rounds spend from it too. Stop and report if the frontier hasn't drained.
- **Checkpoints: none** by default — run to completion, report once. The user may ask for a pause after each round instead.
- **Review gate:** the implementer's own self-review via `/code-review`, inside `launchrail:ralph-implement`.
- **Verification gate:** `npx @wemuda/launchrail verify` — per ticket before the PR, and once more on the final base before the loop may report success.
- **Merge ordering: optimistic, arbitrated by the remote.** Implementers re-sync immediately before merging and retry up to 3 times if the base moved. No merge locks.
- **Labels:** tickets enter as `ready-for-agent`, are marked `ralph:building` while owned, and leave as closed or `needs-info` (parked).

## Preconditions — refuse to start if any fails

1. `.launchrail.yml` exists with `issueTracker` not `none`, and the tracker is reachable **from this environment**: check whether the CLI the project docs assume (e.g. `gh`) is installed here; if not, identify the substitute (e.g. GitHub MCP tools) and name it in every dispatch.
2. Open tickets labeled `ready-for-agent` exist and carry explicit `Blocked by: #n` edges (or the tracker's native blocking relations). No tickets with edges → nothing to orchestrate; point the user at `to-tickets`. If anything wearing `ready-for-agent` is plainly not an implementable ticket — a published spec, research notes, an epic — stop and have it relabeled (e.g. `spec`) before starting: the frontier is computed from the label alone and cannot tell prose from work.
3. The base branch exists on the remote and is green on a fresh checkout: sync it, run the install command, then `npx @wemuda/launchrail verify` — report actual exit codes, not the reassuring summary line; a broken base poisons every implementer after it. A missing base branch is a refusal, not a cue to guess another. An **empty verification contract fails `verify` and is a refusal condition**: a run whose completion nothing can verify must not start. Tell the user to configure `testing` commands in `.launchrail.yml` first.
4. The verbatim local commands are known (from `AGENTS.md` / `.launchrail.yml`), including which checks belong to CI rather than the shared local machine.

## The loop

Sync → compute frontier → dispatch batch → verify → handle outcomes → back to sync.

- **You resolve blocking edges yourself,** deterministically, from tracker state — read each ticket's `Blocked by` line verbatim and parse the `#n` references; never ask a subagent what's ready, and never let one paraphrase the edges. A single misread edge silently builds a ticket on a dependency that hasn't landed. The frontier is every ticket that is open, labeled `ready-for-agent`, not `needs-info`, not already attempted twice, and whose blockers are all settled (closed before the run, or merged and verified by this run). Parked tickets never block the loop; anything behind them is reported as stuck.
- Dispatch up to *width* frontier tickets, **spawning the batch's subagents in a single message** so they run concurrently.
- **Verify every claimed merge against the remote** before it counts: PR merged, its merge commit actually in the base branch's history, issue closed. A subagent's report is a claim, not evidence. Use a cheap, separate check (tracker API only — a PR description or comment is not evidence).

## The dispatch prompt

Each implementer prompt is self-contained — assume it knows nothing about this session or the other implementers. It carries: the ticket number and title, the verbatim commands, how to reach the tracker from this environment, and these eight steps:

1. **Dependency gate:** before anything else, confirm every ticket on the `Blocked by` line is closed with its work merged into the base. If any blocker is still open, do not build on a missing dependency — report "blocked" naming the open blocker, and stop. A deferral, not a failure; the loop retries after the blocker lands.
2. Read the ticket and everything it links (spec sections, ADRs, journeys), plus `AGENTS.md`/`CLAUDE.md`. If the ticket is already closed, report "already-done" and stop.
3. Label the ticket `ralph:building` so a lost session leaves a trace.
4. Branch from a fresh sync of the base: `ralph/<n>-<short-slug>`.
5. Implement by invoking the **`launchrail:ralph-implement`** skill — it owns TDD, the verification gate, browser smoke for user-facing changes, self-review via `/code-review`, and commit conventions. Name the skill; do not paraphrase it.
6. Pre-PR sync: merge the latest base into the branch; resolve conflicts with the **`launchrail:resolving-merge-conflicts`** skill; re-run the verification gate if anything changed.
7. Open a PR titled from the ticket with `Closes #<n>` in the body. Never open a second PR for a ticket — adopt an existing one. Opening against an up-to-date base means CI tests the state that will actually land.
8. Wait for CI if the repository has it — space polls with the Monitor tool or a background sleep, never a foreground sleep or busy loop; ~20 minutes is the budget. Fix what the branch broke and push; a failure that reproduces on the base itself is "ci-red" — systemic, not this ticket's problem. Re-sync immediately before merging (up to 3 retries if the base moves), then squash-merge. Squash-merge does not reliably fire `Closes` — read the issue back, close it explicitly if still open, and remove `ralph:building`.

Every dispatch — retries included — also carries these two clauses verbatim:

> **Integrity.** No placeholders, no stubs, no "simplified for now". Never delete, skip, or weaken a test to get a green run; if a test is genuinely wrong, fix it deliberately and say so in the PR body. Never claim verification passed without having run it.

> **Idempotency.** This step can be replayed after an interruption, so check before acting: if the ticket is already closed, report "already-done"; if a `ralph/<n>-*` branch or open PR already exists, adopt it and continue — don't restart. Never open a second PR for a ticket.

## Outcome handling

- **Verified merge** → one log line; the ticket settles and may unblock others.
- **Blocked (deferred)** → the dependency gate stopped the build. Hand the attempt back and retry in a later round; after 2 deferrals it becomes a real failure. A deferral costs a round, never an attempt.
- **First failure** → delete the failed branch, then re-dispatch later with a *fresh context* plus the failure summary. A failed attempt's context is assumed poisoned — never resume it.
- **Claimed merged, remote disagrees** — including merged-but-issue-still-open — → a failure like any other; the retry adopts the merged PR (idempotency clause), finishes the bookkeeping, and settles cleanly.
- **Second failure** → park: comment both failure summaries on the ticket, remove `ralph:building`, add `needs-info`, move on.
- **Systemic failure** — the base breaks, the tracker becomes unreachable, or the *same* infrastructure error hits different tickets → stop the whole run and report; another retry won't fix it.

## Supervising a workflow run

When the Ralph loop runs as the `ralph` workflow instead of through this skill, you are still on the hook — the script runs headless, but a human is watching *you*, not it. Babysit the run like a deploy:

1. **Read the resolved scope back, immediately.** The first `log()` lines state it ("Scoped to #11, #12" or "No scope — building the whole ready frontier"). An unscoped run when the user asked for three tickets is the cheapest failure to catch and the most expensive to miss — stop and relaunch if it is wrong. Scan the listed numbers for anything that is not an implementable ticket: a spec or research issue wearing `ready-for-agent` will be built as if it were work (the workflow excludes and logs obvious cases, but the label is the fix — have it corrected).
2. **Establish ground truth from the remote, never from the run's own reports.** On every check-in read the workflow journal (`journal.jsonl`) *and* the tracker/PRs. A merge is real only when the commit is on the base branch and the issue is closed.
3. **Arm check-ins across the long waits.** If the session can schedule a self-message, arm one a few minutes out (confirm scope and the first dispatches) and a longer fallback (catch completion or a stall). The workflow's completion notification is the primary signal; the check-ins are the backstop so the run survives an interruption.
4. **Know the healthy shapes so you don't cry wolf.** A ticket can appear twice in Build — that is the retry policy, or a *deferral* because its dependency had not landed yet (not a failure). A ticket only truly fails after two real attempts, then it parks.
5. **Intervene by exception, not by reflex.** Parked ticket → dispatch a fresh scoped run for just that one. Stall (an agent stops writing, CI never returns) → diagnose from the journal. Wrong scope or wrong base → stop, fix, relaunch. Otherwise stay out of the way; the loop is built to self-correct.
6. **Report once at the end, concretely** — PR numbers, merge commits, issues closed, the verification outcome, anything punted — then disarm the check-ins.

## Loop close-out — verification-gated completion

When the frontier drains (or max rounds / a stop condition hits):

1. Sync a fresh base and run `npx @wemuda/launchrail verify`. **The loop may not report success while this fails** — report "unverified" with the failures instead.
2. If `.launchrail.yml` has `modules.browser-testing: true` and any merged ticket changed user-facing behavior, dispatch one smoke run per the `launchrail:browser-smoke` skill and reference its evidence bundle (`artifacts/verification/<run-id>/`).
3. Report the release evidence summary: merged tickets (PR and merge commit each), parked tickets with their failure histories, stuck tickets and what blocks them, follow-ups implementers punted, and the verification outcome with its evidence. Evidence over assertion — link what was run, never summarize what wasn't.

## Rules

- Fresh context per dispatch, per retry. No exceptions.
- Never implement, review, or repair code in the orchestrator session — dispatch instead.
- Name the skills (`launchrail:ralph-implement`, `launchrail:resolving-merge-conflicts`, `launchrail:browser-smoke`); never paraphrase their contents into a prompt.
- Blocking edges are parsed from the verbatim `Blocked by` line, by you — never resolved by a model in between.
- Nothing counts as merged until the remote says so; nothing counts as done until `verify` is green.
- A deferral is not a failure; a failure is never silently retried without its summary.
- Width is a lever, not a goal. Narrow it whenever tickets might collide.
