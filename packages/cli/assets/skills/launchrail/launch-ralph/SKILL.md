---
name: launch-ralph
description: The Ralph implementation loop's contract — policies, dispatch steps, the loop-owned merge gate, and the supervisor's duties when the loop runs as the ralph workflow (the default engine for any multi-ticket run). Skill-mode orchestration of fresh-context implementers lives here too, as the declared exception. Behind /launch-implement (the user-typed front door) — never invoke it on your own initiative; reach it through that door or an explicit user request to run the loop.
---

# Ralph — the autonomous implementation loop

The user starts this loop through `/launch-implement` (or by asking for it in so many words); it is never started unprompted — a campaign spawns many agents and merges PRs, so the start is always a human decision.

You are the orchestrator. **You do not write code. You do not read diffs. You do not fix failing branches yourself.** You compute what's ready, dispatch, verify, and keep a running log. Tracker state and subagent reports in, decisions out.

**Output budget: decisions, not working.** You owe the user two reports per run — a one-line pre-launch echo (scope, target, engine) and the close-out recap — plus any *failure* or *changed plan* the moment it happens. Everything else is working, not output: precondition checks, base-branch resolution, guard-hook state, journal reads, arming check-ins. Do it silently. A passing check is not a status update; a launched run is not a recap; the scope, target, and engine are stated once at the echo and once at close-out, never restated between. Keep the running log for yourself — surface it only at those two moments.

One agent implementing a whole backlog in a single session degrades — context fills with diffs and half-remembered state, and quality drops with every ticket. This loop inverts that: every ticket gets a fresh-context implementer subagent that owns the build through an open PR, the loop's merge gate lands it, and nothing anyone reports is trusted until the remote confirms it.

This skill is the loop's contract and its supervisor. The loop itself runs as the deterministic `ralph` workflow (`.claude/workflows/ralph.js`, installed by init; `launchrail sync` restores it) — **the workflow is the engine for every multi-ticket run**, launched with the resolved scope and integration target as JSON args and then supervised per this skill; its script state cannot be compacted away. Orchestrating dispatches from this session instead is the exception, and it is chosen out loud — name the engine and why before anything dispatches: the user asked to watch each dispatch, the Workflow tool is unavailable in this environment, or this is a targeted intervention (one parked ticket, re-run watchably). A hand-rolled fan-out that is neither is not the loop. And the exception swaps only who orchestrates, never the shape: fresh context per ticket, per-ticket PRs into the target, and the loop-owned gate survive every engine. An environment rule about branches or PRs re-targets the run (see Integration target) — it never selects this exception and never licenses sequential in-session implementation. The two forms share one policy block: change a policy here, change it in the workflow too (ADR-0005, field-revised by ADR-0010, ADR-0022, and ADR-0026).

## Policies

- **Integration target: declared, singular, restated.** Every run merges its per-ticket PRs into exactly one base, named before anything dispatches and again in the close-out. **Consolidation** (the default, ADR-0026): one integration branch (e.g. `spec/44-mvp`) collects the whole campaign and the default branch is never touched; the front door names it scope-native — the session's designated working branch when the environment pinned one at start, else the scope's own spec/epic/slice name when it maps to one, else a generated `launch/*` fallback — and passes it as the `target` arg. A pinned-branch session (ADR-0028) changes only that name: the user's start authorizes the loop's mechanics, per-ticket `ralph/*` branches and PRs included, and the pin's real demands — default branch untouched, release PR offered not opened — are exactly what consolidation already does. The run ends by *offering* one release PR `<target> → <default>` — opened only when the user says so. **Trunk** (the explicit opt-in): the repository's default branch — each verified merge is immediately on mainline, and when the run ends there is nothing left to integrate; select it only when the user asks for per-ticket merges to the default branch, and never when the environment forbids pushing there. A named target missing from the remote is created from the default branch's tip before preflight verifies it; a missing *default* branch stays a refusal. In consolidation mode `Closes #n` never auto-fires (auto-close only triggers from the default branch), so the explicit post-merge close is load-bearing, not belt-and-suspenders.
- **Width: 3** implementers at once. Width multiplies conflict rate and shared-machine load, not just throughput — use 1 until a run has landed tickets cleanly on this project (the workflow's `canary: true` encodes exactly that). Cut a batch below width when its tickets would obviously collide (same module, same files); when in doubt, narrow. Tickets that add DB migrations are a known collision: two parallel implementers both claim the next migration number — serialize them, or expect the second to renumber at pre-PR sync.
- **Cap: none** by default. The user may bound a run ("the next 5"): stop once that many merges have been *verified*, keeping every batch within the remainder so the run cannot overshoot. Failed and deferred dispatches never consume the cap — their slots go to other tickets. Hitting the cap ends the run cleanly: the rest of the frontier stays ready (reported, never parked), and close-out runs as usual.
- **Attempts: 2** — retry a failed ticket once with a fresh context, then park it.
- **Deferrals are not attempts.** An implementer that stops at its dependency gate (a declared blocker had not actually landed) hands the attempt back and is retried after the blocker lands — capped at 2 deferrals, then it counts as a real failure.
- **Max rounds: 25** — a backstop, not a target; deferral rounds spend from it too. Stop and report if the frontier hasn't drained.
- **Checkpoints: none** by default — run to completion, report once. The user may ask for a pause after each round instead.
- **Review gate:** the implementer's own self-review via `/launch-code-review`, inside `launch-ralph-implement`.
- **Verification gate:** `npx @wemuda/launchrail verify` — per ticket before the PR, and once more on the final base before the loop may report success.
- **Merge ownership: the loop, not the implementer.** Implementers build, open the PR, and hand off at PR-open; the merge gate — CI wait, mergeability re-check, squash-merge, explicit issue close, `ralph:building` removal — belongs to the loop (you in skill mode, a per-ticket gate agent in the workflow). An implementer subagent must never sit in a CI wait: it cannot foreground-sleep, and a background sleep surfaces to its parent without resuming it — tokens burn, nothing advances. Merge ordering stays optimistic and remote-arbitrated (re-check mergeability immediately before merging, up to 3 retries if the base moves; no merge locks), and the single gate owner serializes where it matters — critical-path first, schema-touching tickets one at a time.
- **Labels:** tickets enter as `ready-for-agent`, are marked `ralph:building` while owned, and leave as closed or `needs-info` (parked).

## Preconditions — refuse to start if any fails

Verify them silently: a green base and a reachable tracker are the expected case, not news — surface a precondition only when it fails.

1. `.launchrail.yml` exists with `issueTracker` not `none`, and the tracker is reachable **from this environment**: check whether the CLI the project docs assume (e.g. `gh`) is installed here; if not, identify the substitute (e.g. GitHub MCP tools) and name it in every dispatch.
2. Open tickets labeled `ready-for-agent` exist and carry explicit `Blocked by: #n` edges (or the tracker's native blocking relations). No tickets with edges → nothing to orchestrate; point the user at `launch-tickets`. If anything wearing `ready-for-agent` is plainly not an implementable ticket — a published spec, research notes, an epic — stop and have it relabeled (e.g. `spec`) before starting: the frontier is computed from the label alone and cannot tell prose from work.
3. The integration target is resolved (a consolidation branch by default, or trunk when the user opts in — see Policies) and its branch is green on a fresh checkout: sync it (creating a named consolidation branch from the default branch's tip if the remote lacks it), run the install command, then `npx @wemuda/launchrail verify` — report actual exit codes, not the reassuring summary line; a broken base poisons every implementer after it. A missing *default* branch is a refusal, not a cue to guess another. An **empty verification contract fails `verify` and is a refusal condition**: a run whose completion nothing can verify must not start. Tell the user to configure `testing` commands in `.launchrail.yml` first.
4. The verbatim local commands are known (from `AGENTS.md` / `.launchrail.yml`), including which checks belong to CI rather than the shared local machine.

## The loop

Sync → compute frontier → dispatch batch → verify → handle outcomes → back to sync.

- **You resolve blocking edges yourself,** deterministically, from tracker state — read each ticket's `Blocked by` line verbatim and parse the `#n` references; never ask a subagent what's ready, and never let one paraphrase the edges. A single misread edge silently builds a ticket on a dependency that hasn't landed. The frontier is every ticket that is open, labeled `ready-for-agent`, not `needs-info`, not already attempted twice, and whose blockers are all settled (closed before the run, or merged and verified by this run). Parked tickets never block the loop; anything behind them is reported as stuck.
- Dispatch up to *width* frontier tickets, **spawning the batch's subagents in a single message** so they run concurrently.
- **Verify every claimed merge against the remote** before it counts: PR merged, its merge commit actually in the base branch's history, issue closed. A subagent's report is a claim, not evidence. Use a cheap, separate check (tracker API only — a PR description or comment is not evidence).

## The dispatch prompt

Each implementer prompt is self-contained — assume it knows nothing about this session or the other implementers. It carries: the ticket number and title, the verbatim commands, how to reach the tracker from this environment, which branch is the base (the integration target), and these seven steps:

1. **Dependency gate:** before anything else, confirm every ticket on the `Blocked by` line is closed with its work merged into the base. If any blocker is still open, do not build on a missing dependency — report "blocked" naming the open blocker, and stop. A deferral, not a failure; the loop retries after the blocker lands.
2. Read the ticket and everything it links (spec sections, ADRs, journeys), plus `AGENTS.md`/`CLAUDE.md`. If the tracker tool truncates the body (long code spans are a known trigger), fetch the full text by another route — the tracker's search API, the spec file in the repo — and never implement from a truncated ticket. If the ticket is already closed, report "already-done" and stop.
3. Label the ticket `ralph:building` so a lost session leaves a trace.
4. Branch from a fresh sync of the base: `ralph/<n>-<short-slug>`.
5. Implement by invoking the **`launch-ralph-implement`** skill — it owns TDD, the verification gate, browser smoke for user-facing changes, self-review via `/launch-code-review`, and commit conventions. Name the skill; do not paraphrase it.
6. Pre-PR sync: merge the latest base into the branch; resolve conflicts with the **`launch-resolving-merge-conflicts`** skill; if the base gained DB migrations since branching, regenerate yours to follow them with the project's migration tool — never hand-edit the journal; re-run the verification gate if anything changed.
7. Open a PR against the base, titled from the ticket, with `Closes #<n>` in the body. Never open a second PR for a ticket — adopt an existing one. Opening against an up-to-date base means CI tests the state that will actually land. Then **report PR-open and stop**: the CI wait, the merge, and the issue close belong to the loop's merge gate, not to you. Never push to the base directly.

## The merge gate — owned by the loop

In skill mode, you run the gate for every PR the implementers hand off (the workflow runs it as a per-ticket gate agent). Order merges yourself — critical-path first, schema-touching PRs one at a time:

1. Wait for the PR's CI from *this* session, spacing checks with your own timers (a background sleep here wakes you — the orchestrator can wait; implementer subagents cannot). ~20 minutes is the budget.
2. Green → re-check mergeability (the base may have moved since CI started), then squash-merge; if the base moves between check and merge, re-check and retry up to 3 times.
3. Merged → read the issue back and close it explicitly if still open — in consolidation mode auto-close never fires — and remove `ralph:building`. Then verify as always: the remote's word, not yours.
4. CI failed on the PR, or a real conflict → the ticket becomes a failed attempt with the failing check or conflicting files as its summary; the fresh retry adopts the PR (idempotency clause), repairs, and hands off again. A failure that reproduces on the base itself is systemic — stop the run, not the ticket.

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

0. **Launch it unattended-safe.** An unattended run must start in a non-prompting permission mode (bypass / autonomous). In an interactive mode (default / plan / acceptEdits) a single benign permission prompt — an un-allowlisted MCP or Bash call — stalls the whole run, and an idle ephemeral container can be reclaimed mid-ticket, leaving a half-finished ticket. A guard hook warns at launch, but switching modes before you walk away is yours to do.
1. **Read the resolved scope back, immediately.** The first `log()` lines state it ("Scoped to #11, #12", "Stopping after 5 verified merge(s)", or "No scope — building the whole ready frontier"). An unscoped run when the user asked for three tickets is the cheapest failure to catch and the most expensive to miss — stop and relaunch if it is wrong. Scan the listed numbers for anything that is not an implementable ticket: a spec or research issue wearing `ready-for-agent` will be built as if it were work (the workflow excludes and logs obvious cases, but the label is the fix — have it corrected).
2. **Establish ground truth from the remote, never from the run's own reports.** On every check-in read the workflow journal (`journal.jsonl`) *and* the tracker/PRs. A merge is real only when the commit is on the base branch and the issue is closed.
3. **Arm check-ins across the long waits.** If the session can schedule a self-message, arm one a few minutes out (confirm scope and the first dispatches) and a longer fallback (catch completion or a stall). The workflow's completion notification is the primary signal; the check-ins are the backstop so the run survives an interruption.
4. **Know the healthy shapes so you don't cry wolf.** A ticket can appear twice in Build — that is the retry policy, or a *deferral* because its dependency had not landed yet (not a failure). Build ending at PR-open with a separate Gate agent doing the merge is the design, not a stall. Several Gate dispatches for one PR (`gate:#n`, then `gate:#n:ci-wait1…`) are the loop re-polling a still-running CI in place — cheap, expected on anything but the fastest CI, and *not* a build attempt: a slow CI costs re-polls, never a rebuild (ADR-0027). A ticket only truly fails after two real attempts, then it parks.
5. **Intervene by exception, not by reflex.** Parked ticket → dispatch a fresh scoped run for just that one. Stall (an agent stops writing, CI never returns) → diagnose from the journal. Wrong scope or wrong base → stop, fix, relaunch. Otherwise stay out of the way; the loop is built to self-correct.
6. **Report once at the end, concretely** — PR numbers, merge commits, issues closed, the verification outcome, anything punted — then disarm the check-ins.

## Loop close-out — verification-gated completion

When the frontier drains (or max rounds / a stop condition hits):

1. Sync a fresh base and run `npx @wemuda/launchrail verify`. **The loop may not report success while this fails** — report "unverified" with the failures instead.
2. If `.launchrail.yml` has `modules.browser-testing: true` and any merged ticket changed user-facing behavior, dispatch one smoke run per the `launch-browser-smoke` skill and reference its evidence bundle (`artifacts/verification/<run-id>/`).
3. Report the campaign recap — it must let the user act without scrolling back:
   - **Where the work lives:** the integration target and its head SHA; in consolidation mode, say explicitly that the default branch is untouched.
   - The ticket → PR → merge-commit table; parked tickets with their failure histories; stuck tickets and what blocks them.
   - Follow-ups and operator steps implementers punted, gathered into one list.
   - The verification outcome with its evidence. Evidence over assertion — link what was run, never summarize what wasn't.
   - **The single next step:** consolidation (the default) — offer the one release PR `<target> → <default>` with this recap as its body, and open it only when the user says so. Trunk — nothing; every merged ticket is already live on the default branch.

## Rules

- Fresh context per dispatch, per retry. No exceptions.
- One integration target and one engine per run, declared in the pre-launch echo and restated once in the close-out recap — never in between.
- Never implement, review, or repair code in the orchestrator session — dispatch instead. Running the merge gate is bookkeeping, not repair.
- Name the skills (`launch-ralph-implement`, `launch-resolving-merge-conflicts`, `launch-browser-smoke`); never paraphrase their contents into a prompt.
- Blocking edges are parsed from the verbatim `Blocked by` line, by you — never resolved by a model in between.
- Nothing counts as merged until the remote says so; nothing counts as done until `verify` is green.
- A deferral is not a failure; a failure is never silently retried without its summary.
- Width is a lever, not a goal. Narrow it whenever tickets might collide.
