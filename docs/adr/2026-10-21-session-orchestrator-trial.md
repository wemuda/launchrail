# A trial session engine for multi-ticket runs (`launch-orchestrate`), landing through `launchrail land`

## Status
Accepted as a trial — amends [ADR-0022](0022-ralph-campaign-revision.md) (beside the one engine, a user-typed trial door, `/launch-orchestrate`, runs the same loop orchestrated from the session until the trial's exit criteria below decide between them) and [ADR-0032](0032-ralph-lean-local-gate-loop.md) (the local landing gains a deterministic implementation, `launchrail land`, which the trial door uses and either engine may).

## Context
The `ralph` workflow became the one engine for multi-ticket runs because its state lives in script variables that compaction cannot destroy (ADR-0005, ADR-0022). Its throughput depends on a limit nobody had accounted for. The Workflow runtime runs at most `min(16, CPUs − 2)` `agent()` calls at once per workflow, and queues the rest. The public docs put it as "up to 16 concurrent agents by default, fewer when Claude Code has fewer CPUs available, including inside a CPU-limited container". A hosted session's container has about 4 vCPUs, so a hosted run gets **two slots**. A workflow script has no shell, so every Ralph stage is an agent: builders, landers, verifiers, checkpoints, and graph reads all share those two slots. The default `width: 3` cannot happen there. ADR-0032's 14.5-hour hosted campaign accounts for its overhead in detail and never mentions the cap.

A simulation ran the real `ralph.workflow.js` against mock agents that enforce the cap as a FIFO queue on a virtual clock. It used 24 independent tickets (30–60 minute builds, 17.5 hours in total), every one green first time, 3-minute lands, and a 12-minute full gate every five lands:

- **Two slots:** 10.4 hours at width 2, 3, or 6 alike. Width above the cap only lengthens the time a finished branch waits for a lander slot, to 6, 15, and 101 minutes at worst. It waits while holding the land lock, behind a queued *build*. A trace at width 3 shows build #3 queued for 30 minutes, #2's lander waiting 15 minutes behind a build, and a one-minute verify waiting 38, while that ticket's dependents could not dispatch.
- **Eight slots** (a 10-core laptop): 3.5 hours.
- **No cap:** 2.9 hours at width 12, and still 2.9 at width 16. Lands are serialized, so past roughly *build minutes ÷ minutes per land* the land path is the ceiling. With 1-minute lands the curve keeps improving to 2.3 hours at width 16.

Meanwhile a consuming project ran a campaign from an ordinary session that dispatched background subagents. It kept nine builders running at once and finished about 650 agents over the run. It also showed the failure modes ADR-0005 and ADR-0022 predicted for an orchestrator session. It stopped until the user typed "continue". It invented a status file to survive compaction. It repaired failing tests in its own context. Matt Pocock's [`/implement-spec`](https://www.aihero.dev/skills-implement-spec) takes the same shape: a frontier from blocking edges, every frontier ticket at once in a worktree, one integration branch. Its own write-up lists gaps Ralph has closed: no gate at land time, blocked tickets that wait for a tracker close, parallel tickets colliding on shared files, and a review-and-fix loop with no stop rule. It adds one thing Ralph lacks, a review of the whole integration branch against the spec once the last ticket lands.

The harness limits that matter for the alternative:

- **Session subagents:** Claude Code runs at most 20 concurrent subagents per session by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). A spawn over the cap is refused, not queued.
- **The workflow cap is adjustable:** `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` (1–256, v2.1.269+) raises it. The docs do not say whether that overrides the CPU-based reduction, and it has not been tried here.
- **Hosted containers:** about 4 vCPU, 16 GB of memory, and 30 GB of disk. A foreground shell command may run for up to 10 minutes.

## Decision
- **A trial door, user-typed: `/launch-orchestrate`.** It is a second engine for the Ralph loop, orchestrated from the session. `/launch-implement` stays the default and is unchanged, and the conductor still hands it over. The trial door keeps the loop's contract whole:
  - fresh context per dispatch;
  - pushed `ralph/<n>-*` branches that are adopted, never rebuilt;
  - blocking edges parsed from the verbatim `Blocked by` lines;
  - attempts, deferrals, and re-syncs that hold the land lock;
  - lands one at a time under the fast gate, and the full gate at checkpoints with one bounded repair;
  - lands verified on the remote, consolidation by default, and the recap.

  What changes:
  - **Builders are background worktree subagents.** Width defaults to the ready frontier, at most 8 at once, kept under the harness's subagent cap with headroom for the sub-agents builders start themselves (self-review runs two). Past the land path's ceiling, more width only queues finished branches.
  - **Lands go through `launchrail land`.** The session never runs a lander agent.
  - **A run ledger at `.launchrail/state/orchestrate/ledger.md`.** It is re-read whenever the session cannot account for the campaign, and it is reconciled against the remote and the tracker, which always win.
  - **Turn discipline.** A turn ends only while something is running, the run is closed, or a real blocker needs the user. A safety-net check-in covers a builder that dies with its container and never notifies.
  - **Recovery from a lost container.** The session rebuilds from context, the remote, and the tracker, and re-dispatches to adopt the pushed branches, spending no attempt.
  - **A whole-spec review at close-out, bounded.** One `launch-code-review` over the campaign against its spec, one fix landed under the full gate, one focused re-check, then stop.
  - **A trial report** of the numbers this decision turns on.
- **`launchrail land <branch> --base <target>` is the lander as code.** In the checkout it runs in, it does these steps in order:
  - refuses a dirty tree, a local base with commits that are not on the remote, a branch that moved since the hand-off (`--expect`), a concurrent land (a lock under `.git`), and the remote's default branch without `--trunk`;
  - fetches the base and the branch, and fast-forwards the base;
  - merges `--no-ff`, keeping the branch's commits, as `<title> (#n)` with `Closes #n`;
  - installs when dependency files changed;
  - gates the merged tree with `verify --fast` (`--full` for repairs);
  - pushes, merging and gating once more if the remote moved, then reports `stale`;
  - confirms the push with `git ls-remote`.

  Any failure leaves the base at the remote tip, and nothing is stashed, discarded, or pushed red. The verdict is one JSON line (`--json`). Gate output goes to a log under `.launchrail/state/land/`, and every land is appended to `lands.jsonl`. `--dry-run` predicts the merge with `git merge-tree` and touches nothing. Moving the workflow's lander prompt onto `land` is out of scope for the trial.
- **Ownership.** The skill's files are managed, like every `launch-*` skill, and reach existing projects on `sync` with no migration. The ledger, gate logs, and land record are runtime state under `.launchrail/state/`, which ignores itself in git: never committed, never managed or seeded. `land` changes no tracked file except through the merge it pushes.
- **The engines interoperate.** Both use the same branch names, labels, and `ralph/<n>` references in landing commits. Switching mid-campaign is safe: either engine adopts what the other pushed.
- **Trial protocol and exit criteria.** Run at least two campaigns of eight or more tickets with `/launch-orchestrate` in hosted sessions. Compare them with `/launch-implement` runs of similar size, including one launched with `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` raised, as the control for "just lift the cap". Compare:
  - wall-clock per landed ticket;
  - user interventions;
  - parks and re-syncs;
  - lost builders;
  - the final verification verdict.
  
  If the session engine lands comparable work in materially less wall-clock with no more interventions and no verification regressions, a successor record makes it the default and supersedes ADR-0022's one-engine rule. Otherwise the trial door is retired, and `land` stays.

## Alternatives considered
- **Raise the workflow's cap and change nothing else.** It is cheaper if the override beats the CPU reduction, and the trial runs it as the control arm for exactly that reason. But it leaves every bookkeeping step an agent competing for slots, keeps the run headless (no mid-run steering), and its effect in a 4-vCPU container is undocumented. It is a measurement, not a substitute.
- **Make the session engine the default now.** Rejected. ADR-0022's reasons are still live: compaction, and a session improvising its own fan-out. The evidence for the alternative is one improvised campaign. A trial behind a user-typed door costs nothing to the runs that keep using the default.
- **Adopt `/implement-spec` as it is.** Rejected. It lacks the land gate, deterministic edges, re-syncs under the lock, the checkpoint repair, and remote verification, all of which Ralph earned in the field (ADR-0010, ADR-0032, ralph-resync-holds-the-land-lock). Only its whole-spec review is taken.
- **A CLI-owned campaign state machine** (`launchrail campaign next / record / land`), porting the workflow script into the CLI with a JSON ledger. Deferred. It would build the workflow a second time before the trial shows the session engine is worth it. `land` plus the ledger cover the two failures that matter, a model-driven land and lost state. Revisit if the trial shows the session's own bookkeeping drifting.
- **Builders in separate cloud environments** (one container per builder). Not adopted. Availability is gated, the land path still serializes, and lands need the shared warm checkout (ADR-0032). Revisit if the shared box, rather than the land path, becomes the limit.
- **Keep the lander a prompt** (the session follows the recipe in `launch-ralph` skill mode). Rejected. Every land would put git and gate output into the orchestrator's context, the scarce resource of this engine. And the steps are pure git plus `verify`: code is faster, testable, and cannot improvise a reset.

## Consequences
- **Easier:** wide runs in hosted sessions. A user can steer a run without stopping it. A land is one CLI call with a one-line verdict instead of an agent dispatch. Any engine, or a person, can land a branch by the same audited procedure.
- **Harder:** during the trial the dispatch contract exists in three places (`launch-ralph`, the workflow, `launch-orchestrate`'s briefs), kept parallel by hand. In the session engine the bookkeeping is skill text and a ledger, not code, except for `land`. Wide runs spend quota proportionally and contend for one container's CPU, memory, and disk.
- **Constrained:**
  - `/launch-orchestrate` is user-typed. The conductor never hands it over, and nothing invokes it unprompted.
  - `land` refuses the default branch without `--trunk`.
  - Covered by integration tests against temporary repositories (a bare remote, the landing checkout, a builder clone): a land that keeps the branch's commits; a land after the base moved; a conflict and a red gate that leave the base at the remote tip and push nothing; the full tier; a dirty checkout; untracked files; a local base with unpushed commits; already-landed; the trunk guard; a remote that moves during the gate (merged again once) and one that keeps moving (stale); the dry run; the lock (live and dead holders); installs on dependency changes, failing installs included; `--expect`; a missing branch; refusal outside a Launchrail project.

## Revisit when
- The trial campaigns are in (the exit criteria above).
- `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` is shown to beat the CPU reduction in a hosted container. The workflow arm would then be judged on width it can actually reach.
- The harness gains per-builder containers, a lander primitive, or workflow scripts that can run commands without an agent.
