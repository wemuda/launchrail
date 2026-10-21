---
name: launch-orchestrate
description: Trial engine for multi-ticket runs. This session runs the Ralph loop itself instead of the ralph workflow, keeping every ready ticket building at once in background worktree subagents, landing each finished branch with `launchrail land`, and keeping its state in an on-disk ledger that compaction cannot lose. Same scope, target, branches, labels, and gates as /launch-implement; user-typed only, for trial runs beside it.
disable-model-invocation: true
---

# Orchestrate — the Ralph loop, run from this session (trial)

The user types `/launch-orchestrate` instead of `/launch-implement` to trial a second engine for multi-ticket runs ([session-orchestrator-trial](https://github.com/wemuda/launchrail/blob/master/docs/adr/2026-10-21-session-orchestrator-trial.md)). The loop's contract is Ralph's: fresh context per ticket, pushed `ralph/<n>-*` branches, lands one at a time under the fast gate, the full gate at checkpoints and release, nothing counted until the remote says so. What changes is who orchestrates. The `ralph` workflow runs at most `min(16, CPUs − 2)` agents at once, builders and landers together, so two in a 4-vCPU cloud container. Here this session dispatches builders as background subagents, as many as the frontier and the land path can use, and lands their branches itself with `launchrail land`.

You are the orchestrator. **You do not write code, read diffs, or repair branches.** You keep the ledger, compute what is ready, dispatch, land, check the remote, and decide. Your context is this engine's scarce resource: every report and command output you read stays in it. So keep what enters it small: builders end with a short JSON block, `land` answers in one JSON line, and gates write to logs you read only on failure.

**Output budget: decisions, not working.** You owe the user two reports per run: the one-line echo before anything dispatches, and the close-out recap with its trial report. Add any failure or changed plan the moment it happens. Everything else is silent: precondition checks, ledger writes, arming check-ins, routine lands.

## Start

1. **Resolve the scope and the integration target exactly as [`launch-implement`](../launch-implement/SKILL.md) Step 1 does.**
   - **Scope:** a bare call is the whole ready frontier; numbers, a count ("the next 5"), or a spec reference scope the run.
   - **Target:** it consolidates by default — the session's designated branch in a hosted session, else the scope's own `spec/<n>-<slug>`, else a `launch/*` fallback. Trunk only when the user asks in so many words.
   - **Authority:** the user typing `/launch-orchestrate` authorizes the loop's own mechanics: per-ticket `ralph/*` branches pushed as they grow and landed onto the target, no PR among them. An environment rule about branches or PRs re-targets the run; it never shrinks the run to sequential in-session building.
   - **Optional arguments:** a width ("width 12"), `canary`, and `known green <sha>`.
2. **Echo once**, then stay quiet: `Scope: … · Cap: … · Target: <branch> (<default> untouched; one release PR offered at the end) · Width: <n> · Engine: launch-orchestrate (trial: this session orchestrates; builders in background worktrees; lands by launchrail land)`. If the session runs in an interactive permission mode, add that a builder's first un-allowlisted command will wait for an answer: an unattended run wants a non-prompting mode.
3. **Preflight.** Refuse to start if any check fails: say which one, and stop.
   - **Tracker:** `.launchrail.yml` names an `issueTracker` other than `none`, reachable from here. Use the CLI the project docs assume, else the substitute tools; name the working route in every brief.
   - **Tickets:** open `ready-for-agent` tickets with `Blocked by` edges exist. Anything wearing the label that is plainly not a ticket (a spec, research notes) is relabeled before the start.
   - **The CLI:** pin it as `npx -y @wemuda/launchrail@<launchrailVersion from .launchrail-lock.json>`. That is the release that installed this skill, and it carries `land`; a cached older `npx` copy may not. Below, `$CLI` stands for that command. Spell it out in full in every command and every brief, because a shell variable does not survive from one command to the next.
   - **This checkout:** it is clean (`git status --porcelain --untracked-files=no` prints nothing).
   - **The target, on the live remote:** `git fetch --prune origin`, then `git ls-remote --heads origin <target>`. A missing target is created from the default branch's tip and pushed; a designated branch that exists only locally is pushed as it is. Check it out and fast-forward it to `origin/<target>`. A diverged local target is a refusal.
   - **The run's directory:** create it with the state directory's self-ignore, so nothing in it ever shows up in git: `mkdir -p .launchrail/state/orchestrate && { test -f .launchrail/state/.gitignore || echo '*' > .launchrail/state/.gitignore; }`. Record the target's tip as the run's start sha.
   - **Dependencies and the base gate:** run the project's verbatim install command (from `AGENTS.md`). Then start the full gate **in the background**: `$CLI verify > .launchrail/state/orchestrate/preflight.log 2>&1; echo "exit $?"`. Read the graph while it runs. A red gate, or an empty verification contract, is a refusal. With `known green <sha>` and the target tip at exactly that sha, skip the gate.
4. **Read the graph** through one helper subagent: an `Agent` call with `model: "haiku"` and `run_in_background: false`. This keeps ticket bodies out of your context. Its brief is the graph brief in [builder-brief.md](builder-brief.md).
   - It returns each ready ticket's number, title, and verbatim `Blocked by` line. Parse the `#n` yourself.
   - A blocker outside the ready set counts as settled before the run; the builder's dependency gate is the backstop.
   - List the pushed branches (`git ls-remote --heads origin 'ralph/*'`). A ticket that already has one is dispatched to adopt it.
5. **Open the ledger** ([ledger.md](ledger.md)) at `.launchrail/state/orchestrate/ledger.md`, under the state directory git ignores: the header, one row per ticket, the first events.
6. **When the preflight gate reports green**, dispatch (see *Dispatching a builder*), arm the check-in, and end the turn.

## Width

- **The default is every ready ticket, at most 8 builders at once**; the user's number wins. Width is a lever, not a goal. Narrow it when tickets would collide (same module, same files). With `canary`, run one builder until the first land proves the plumbing end to end.
- **The land path is the ceiling.** Lands are serialized, so the useful width is roughly average build minutes ÷ minutes per land, a land being its fast gate plus a share of each checkpoint. Builders past that only queue finished branches.
- **The harness caps concurrent subagents.** In Claude Code that is 20 per session by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` raises it), and a spawn over the cap is refused, not queued. Keep width, your own helpers, and the sub-agents builders start (each self-review runs two) under the cap. A refused spawn sends the ticket back to pending; dispatch it when a slot frees, never retry in a loop.
- **The box is shared.** A cloud container has about 4 vCPU, 16 GB, and 30 GB of disk; each builder has its own worktree and install, and test runs contend. When the fast gate slows badly under load or disk runs short, narrow. Remove each landed ticket's worktree as soon as it lands.
- **Backstop:** 60 dispatches, or three per ticket in scope when that is more (retries, re-syncs, and repairs count). Reaching it stops dispatching, and the run closes out.

## The loop

The loop is event-driven. You wake when a builder finishes, a background gate finishes, a check-in fires, or the user writes. On every wake, in this order:

1. **Re-hydrate when unsure.** If you cannot account for the campaign from context (after a compaction, or on a check-in), read the ledger first. After a compaction, re-read this skill (`.claude/skills/launch-orchestrate/SKILL.md`) and its briefs too: the contract must not decay into a summary. Then reconcile the ledger against ground truth:
   - `git ls-remote --heads origin 'ralph/*' <target>`: the branches, and the base tip;
   - the tracker: closed tickets, `needs-info`, `ralph:building`;
   - the builders still running.

   The remote and the tracker win any disagreement; fix the ledger.
2. **Take every finished builder's report.** Parse the JSON block it ended with, update its row, log the event, and route it by status (see *Outcomes*).
3. **Land** handed-off branches one at a time, most dependents first. A checkpoint or a repair in progress means nothing lands. A re-sync holding the land lock means only that ticket may land.
4. **Checkpoint** when five lands have happened since the last green full gate.
5. **Fill the free slots** from the frontier: pending tickets whose blockers are all settled (closed before the run, or landed by it), not parked, under their attempt cap, most dependents first.
   - Spawn the batch in a single message.
   - A deferred ticket waits for the next land or tracker refresh.
   - With a cap ("the next 5"), dispatch only while landed plus in flight is below it.
   - When nothing is running or ready but tickets remain, re-read the tracker once: an externally closed blocker may have freed them.
6. **Write the ledger**, then end the turn by the rules in *Staying alive*.

**The user can steer a running campaign.** They may add or drop tickets, change the width, or stop dispatching. Apply it at this wake, log it, and confirm it in one line. The trial report counts it as an intervention only when the run needed it (a stall, a wrong call), not when the user chose to change course.

### Dispatching a builder

- **The call:** one `Agent` call per ticket, with a general-purpose subagent, `isolation: "worktree"`, `run_in_background: true`, and the description `build #<n> <slug>`.
- **The prompt:** the build brief from [builder-brief.md](builder-brief.md) with every placeholder filled, or its retry, re-sync, or repair variant when it is one. Fresh context every time: never resume a builder that failed.
- **Before any dispatch that adopts a branch** (a retry, a re-sync, a lost builder's redo), remove the ticket's previous worktree (`git worktree remove --force <path>`; `git worktree list` finds it). Git refuses to check out a branch another worktree holds.
- **Afterwards:** mark the row `building` and log the time.

### Landing a branch

```bash
$CLI land <branch> --base <target> --issue <n> --title "<commitTitle>" --expect <headSha> --install "<install command>" --json
```

- **Flags:** add `--trunk` in trunk mode, and `--full` for a repair or a review fix.
- **How to run it:** in the foreground, with the longest timeout (10 minutes). If the fast gate takes longer, run it in the background and treat its exit as the next event. Never start a second land meanwhile; `land` refuses one anyway.
- **What it does:** it merges `--no-ff`, keeping the branch's commits, as `<commitTitle> (#n)` with `Closes #n`. It installs when dependency files changed, gates the merged tree, pushes, and confirms the push on the remote. Any failure leaves the target at the remote tip.

Read the one JSON line and act on its status:

- **`landed` or `already-landed`** → do the bookkeeping:
  - close the issue explicitly (auto-close never fires off the default branch) and read it back closed;
  - remove `ralph:building`;
  - comment once: "Landed on `<target>` at `<mergeCommit>` (merge of `<branch>`) by launch-orchestrate."

  `land` confirmed the landing commit on the remote, and you read the issue back closed; together that is a verified land. Mark the row `landed`, add it to lands-since-green, remove the builder's worktree, and dispatch what it unblocked.
- **`conflict`, `stale`, or `gate-failed` with `baseMoved: true`** → a hand-back, not a failure: the base moved under a finished branch.
  - Re-sync it: a fresh builder with the re-sync brief and `land`'s summary (the conflicting files, or the gate's tail).
  - **This ticket holds the land lock until it re-lands.** Land nothing else meanwhile, however many branches finish.
  - No attempt is spent; after two re-syncs it counts as a failure. A re-sync builder that fails releases the lock, and that failure is the ticket's attempt.
- **`gate-failed` with `baseMoved: false`** → the builder's own failure: the branch already contained the base and is red on it. It spends the attempt.
- **`failed`** → read the summary.
  - **A dirty checkout:** see what changed (`git status`). Files a checkpoint's gate regenerated are the loop's own, so restore them (`git checkout -- <files>`). Anything else is someone's work: stop and report, and never discard it.
  - **A branch that moved since the hand-off:** if nothing else can be pushing to it (its builder reported, and no other builder holds the ticket), the reported sha was stale, so land again without `--expect`. Otherwise stop the other pusher first.
  - **Anything else:** try once more, then stop and report. The land path is infrastructure.

### Checkpoints and the repair

- **When:** after five lands since the last green full gate, with no land running. Fetch, fast-forward the target, install, and run `$CLI verify > .launchrail/state/orchestrate/checkpoint-<k>.log 2>&1; echo "exit $?"` in the background.
- **While it runs:** no land runs until it reports. Builders keep building, and finished branches queue.
- **Afterwards:** the checkout must be clean again. If the gate rewrote tracked files, restore them with `git checkout -- .` and say once that the gate writes tracked files; that is a `launch-loop-readiness` finding.
- **Green:** record its sha as the last green.
- **Red:** dispatch exactly one repair builder with the repair brief: the failing lines from the log's tail, and the tickets landed since the last green sha. Its `ralph/repair-<k>-<slug>` branch lands with `--full`. Until it does, nothing else lands: landing onto a red base only adds suspects.
  - If it lands, the base is green again.
  - If it does not, **the base is red**: land nothing more. Finished branches are held and keep `ralph:building`. Let in-flight builders finish, then end the run unverified with the reason. A human repairs the base and relaunches, and either engine adopts the held branches.

## Outcomes

- **`ready`** → into the land queue.
- **`already-done`** → the ticket was closed before it was built; settle it.
- **`blocked`** → a deferral: a declared blocker had not landed. Hand the attempt back and retry after the next land or tracker refresh. After two deferrals it is a real failure.
- **`verify-failed`, `conflict`, or `failed`** → a failed attempt.
  - Post its one-line failure on the ticket. It survives a lost container, and the retry reads it there.
  - Retry once with a fresh builder that adopts the pushed branch and fixes forward.
  - A second failure parks the ticket: comment the failure history and the branch, remove `ralph:building`, add `needs-info`, move on.
- **No report** (the builder ended without its JSON block, or died) → infrastructure. Re-dispatch it to adopt its branch, spending no attempt. Three builders lost in a row means stop and report: the problem is systemic.
- **Systemic failures:** the base still red after its repair, the tracker unreachable, or the same infrastructure error on different tickets. Stop dispatching, let in-flight builders finish, and close out unverified.

## Staying alive

The workflow never stops early; a session can. Guard against it:

- **End a turn only when:**
  - a builder or a background gate is running, so its completion wakes you;
  - the run is closed and the recap is out; or
  - a real blocker needs the user. Say exactly what it is, once.

  Never end a turn with a free slot and a ready ticket, or with a handed-off branch and a free land path. Never ask whether to continue: `/launch-orchestrate` was the go-ahead for the whole campaign.
- **Arm one safety-net check-in** before ending a turn to wait, if the session can schedule a message to itself (`send_later`, about 45 minutes out). Re-arm it on each wake, keep one pending at a time, and cancel it at close-out. A builder that dies with its container never sends a notification, and nothing else would wake you.
- **A check-in reconciles.** Is each `building` row's builder still running? The liveness signal is its `ralph/<n>-*` branch moving on the remote. A quiet branch alone is not death, since long builds think. Never dispatch a second builder onto a branch whose first may still be alive.
- **A lost container is recoverable.** The signs: the ledger is gone, the checkout is a fresh clone, and no builders run.
  - Redo preflight, passing the last green sha you know as known green.
  - Rebuild the ledger from your context, the remote, and the tracker. The remote has the `ralph/*` branches, and merge commits on the target name the `ralph/<n>-…` branch they landed. The tracker has closed tickets, labels, and failure comments.
  - Re-dispatch every unfinished ticket to adopt its branch, spending no attempt.

## Close-out

When the frontier drains, or the cap, a red base, the backstop, or a stop condition ends the run:

1. **Review against the spec, once,** when the run landed two or more tickets.
   - Dispatch one reviewer with the review brief: `launch-code-review` over the whole campaign, from the run's start sha to `origin/<target>` (in trunk mode too), against the spec and its tickets. It splits findings into blocking (the spec contradicted, a defect across tickets, a regression) and follow-ups.
   - Blocking findings get exactly one fix builder (`ralph/review-<slug>`), landed with `--full`, then one focused re-check of those findings only.
   - Then stop. What is still open goes to the recap. Never loop review and fix.
2. **Verify the release:** run the full gate on the final target tip, unless the last green full gate (a checkpoint, or a `--full` land) ran at exactly this tip. If it is red, the run is unverified; say so, with the failures.
3. **Prune** the remote branches of the landed tickets (`git push origin --delete <branch>`), and only those: held and parked branches stay. Remove the remaining worktrees.
4. **Write the recap**, the `launch-ralph` close-out contract:
   - where the work lives: the target and its head sha (in consolidation mode, say that the default branch is untouched);
   - the ticket → landing-commit table;
   - held, parked, and stuck tickets, with why;
   - the checkpoint verdicts and the review outcome;
   - punted follow-ups, in one list;
   - the verification evidence;
   - the single next step: offer the one release PR `<target> → <default>`, opened only when the user says so. In trunk mode there is nothing to release: every ticket is already live on the default branch.

   Render the rail banner under it, as `launch-implement` does.
5. **Add the trial report** ([ledger.md](ledger.md)). These are the numbers that decide whether this engine replaces the workflow. Put it under the recap and in the body of the release PR you offer, then mark the ledger `closed`.

## Rules

- Never implement, review, or repair code in this session: dispatch instead.
- Never edit a tracked file in the landing checkout. The ledger and logs live under `.launchrail/state/`, which git ignores.
- One target and one engine per run, stated in the echo and again in the recap.
- Fresh context for every dispatch, retry, re-sync, and repair. Name the skills (`launch-ralph-implement`, `launch-resolving-merge-conflicts`, `launch-code-review`); never paraphrase them into a brief.
- Blocking edges come from the verbatim `Blocked by` lines, parsed by you.
- Nothing counts as landed until `land` has confirmed it on the remote and the issue reads closed. Nothing is done until the full gate is green on the final tip.
- A deferral is not a failure, a re-sync is not an attempt, and a lost builder is not an attempt.
- Switching engines is always safe. Stop dispatching, and `/launch-implement` (the workflow) adopts the pushed `ralph/*` branches wherever this run left them.
