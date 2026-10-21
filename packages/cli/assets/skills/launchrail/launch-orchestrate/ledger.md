# The run ledger

The orchestrator's state lives on disk at `.launchrail/state/orchestrate/ledger.md`, under the state directory, which ignores itself in git. The workflow kept this state in script variables. You keep it here, because your context can be compacted and the file cannot.

- **When to write it:** at every state change. Edit the header lines and the ticket's row in place. Append the event as one line: events stay the last section, so `echo "- $(date -u +%FT%RZ) …" >> .launchrail/state/orchestrate/ledger.md` lands it in the right place with its timestamp.
- **When to read it:** whenever you cannot account for the campaign from context — after a compaction, on a check-in, or when the user asks where things stand.
- **When it disagrees** with the remote (`git ls-remote`) or the tracker, they win. Fix the ledger, and log the correction as an event.
- **A new run in a checkout** whose ledger says `running` for the same target resumes that campaign. Any other old ledger is renamed `ledger-<its start stamp>.md` first.
- **`land` keeps its own record** in `.launchrail/state/land/lands.jsonl`: one JSON line per land, with status, duration, gate tier, and log path. Read it for the trial report; never copy it in here.

## Template

```markdown
# Campaign ledger — {target}

- Status: running
- Started: {UTC} · Engine: launch-orchestrate (trial) · CLI: {cli}
- Scope: {#n, … | the whole ready frontier} · Cap: {none | N lands} · Width: {n}{ · canary until the first land}
- Target: {target} ({consolidation | trunk}) · Default: {default} ({untouched | the target, in trunk mode}) · Start sha: {the target's tip at preflight}
- Commands: install `{install}` · fast `{cli} verify --fast` · full `{cli} verify`
- Tracker: {how it is reached from here}
- Last green full gate: {sha} ({preflight | checkpoint k | repair k | review fix}) at {UTC}
- Lands since green: {#n, … | none}
- Land lock: free  (or: held by #n, re-sync k, since {UTC})
- Checkpoint: none running  (or: k running since {UTC}, log …)
- Dispatches: {count} of {backstop} · In flight: {n} · Peak: {n}

## Tickets

| # | Title | Blocked by | Status | Tries | Re-syncs | Defers | Branch | Head | Worktree |
|---|---|---|---|---|---|---|---|---|---|
| 12 | Magic-link sign-in | #11 | building | 1 | 0 | 0 | ralph/12-magic-link | | |

Status: pending · building · ready (handed off, waiting to land) · re-sync · landed <sha> · done-before · parked · held · external

## Failures

- #13 try 1 · verify-failed — {the one fact a retry must know}

## Events

- 2026-10-21T19:31Z preflight started; graph read: 14 tickets, 3 with pushed branches
- 2026-10-21T19:40Z preflight green at abc1234 (full gate 9m)
- 2026-10-21T19:41Z dispatch #12 #13 #15 #16 #18 #20 #21 #22 (8 in flight)
- 2026-10-21T20:19Z #13 ready ralph/13-otp@def5678 (38m)
- 2026-10-21T20:23Z #13 landed at 9a8b7c6 (land 3m, fast gate) — unblocks #19
```

## Trial report

The trial report is the close-out's last block. It holds the numbers that decide whether the session engine replaces the workflow (the exit criteria in the [ADR](https://github.com/wemuda/launchrail/blob/master/docs/adr/2026-10-21-session-orchestrator-trial.md)). Compute it from the events and `lands.jsonl`; never estimate a number you can count. Write "n/a" for anything that did not happen.

```markdown
### Trial report — launch-orchestrate

| | |
|---|---|
| Host | {cloud container / local machine} · {nproc} CPUs · CLI {version} |
| Wall clock | {preflight start → release verified}, {h:mm} |
| Tickets | {landed} landed · {parked} parked · {held} held · {stuck} stuck · {done-before} already done — of {scope} in scope |
| Builder time | {sum over builds of dispatch → report}, {h:mm}; mean build {m} min |
| Parallelism | width {w}; peak {p} builders; mean {builder time ÷ build-phase wall clock} |
| Land path | {lands} lands; land median {s}s, max {S}s; hand-off → land median {a} min, max {b} min; land lock held by re-syncs {c} min |
| Dispatches | {total}: {first} builds, {retries} retries, {resyncs} re-syncs, {deferrals} deferrals, {repairs} repairs, {lost} lost and redone |
| Checkpoints | {k} run, {red} red, {repaired} repaired |
| Spec review | {blocking} blocking ({fixed / open}), {followUps} follow-ups |
| Infrastructure | {recycles} lost containers, {lostBuilders} lost builders, {compactions} compactions noticed, {checkins} check-ins fired |
| Interventions | {n} — each time the user had to step in, and why |
| Workflow at this cap | the ralph workflow would run at most min(16, {nproc} − 2) = {slots} agents at once here, builders and landers together (unless CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS raises it) |
```
