# ADR-0027: Ralph merge gate — re-poll CI in place instead of rebuilding

## Status
Accepted (amends [ADR-0022](0022-ralph-campaign-revision.md)) — amended by [ADR-0030](0030-ralph-ci-wait-cheap-watcher.md): the in-place re-polls now ride on cheap read-only small-model watchers, with the full gate recalled only once CI resolves

## Context
ADR-0022 gave the loop ownership of the merge gate: implementers hand off at PR-open, and a per-ticket **gate agent** owns the CI wait, the squash-merge, and the tracker bookkeeping. That ADR closed with two "Revisit when" triggers — the harness gaining a way for subagents to wait efficiently, and *campaign data showing the gate-agent retry loop too expensive versus a repair-in-place step*. A field run produced exactly that data.

A width-2 run merged two tickets, then burned a full fresh implementer on each of two more (`build:#77:retry`, `build:#78:retry`) that changed nothing — they re-adopted an already-open, already-green PR and handed off again. The cause is structural, not a CI problem:

- The gate is dispatched as a **subagent**, and a subagent cannot idle-wait — foreground sleep is blocked and a background sleep surfaces to its parent without resuming the child (the same constraint ADR-0022 §Context cited for *implementers*, which is *why* implementers hand merges to the loop). The gate prompt nonetheless told it to "wait ~20 minutes." It cannot. Given one turn it polls CI a few times, sees `in_progress`, and returns `ci-timeout` after a minute or two.
- `drive()` treated `ci-timeout` like any other non-`merged` verdict: push a failed attempt, and next round re-dispatch the **build** stage. So a CI that was merely *still running* — the ~3–4 minute norm, well inside the nominal budget — cost a full implementer rebuild whose only real work was the idempotent PR-adopt.

The premature-timeout diagnosis was initially mistaken for CI queue contention; pulling the actual GitHub run timings (created = started, 3m45s, `success`) showed zero queueing. The waste was entirely the gate agent giving up early and the loop answering a not-done-yet CI with a rebuild.

Workflow mode cannot adopt skill mode's fix (the orchestrator waits on its own timers), because the workflow script has no timer/sleep primitive either. The only actor that supplies wall-clock is *other useful work* — the concurrent tickets in the round.

## Decision
Separate the **CI-wait re-poll** from the **build attempt** in the workflow's `drive()`:

- `ci-timeout` is treated as "not done yet," not a failure. On it, the loop **re-polls the same cheap gate agent in place** (reads only until it can merge; `effort: 'low'`) up to `POLICY.gateWaits` times (default 6, overridable per run) before the ticket ever spends a fresh implementer attempt. Every *real* verdict — `merged`, `ci-failed`, `not-mergeable`, `failed` — leaves the re-poll loop immediately.
- Only after the bounded re-polls are exhausted does a still-unfinished CI fall back to the pre-existing safety net: a failed attempt, a fresh-context retry that adopts the PR, and eventually a park. A stuck CI can no longer loop forever, and a slow-but-fine CI can no longer cost a rebuild.
- The gate prompt is made honest: it states the one-turn constraint outright, tells the agent to poll a handful of Monitor-spaced times and then report `ci-timeout` if CI is still running, and frames that status as a cheap re-poll signal — never a reason to merge on an unfinished run. Re-polls carry a `waited` counter so the prompt can say "it has very likely finished by now."

`gateWaits` is a workflow arg, not a shared policy knob: skill-mode orchestration has no gate subagent to re-poll — the orchestrator waits directly — so the `launch-ralph` policy block is unchanged. Concurrent tickets in a round supply the wall-clock the re-polls ride on; at width 1 the re-polls still cost only cheap gate agents, never an implementer.

## Alternatives considered
- **Make the gate agent actually wait 20 minutes.** Rejected: it structurally cannot (the constraint this ADR is built around). Telling it to was the bug.
- **Move the CI wait to the orchestrator script with real timers.** Rejected: the workflow sandbox has no sleep/timer primitive (and no `Date.now`); only skill mode's session can wait on timers. This remains ADR-0022's open "Revisit when" for a future harness capability.
- **Repair the PR in place inside the gate on `ci-failed`.** Rejected here: a red CI is a genuine code failure that warrants a fresh-context implementer (ADR-0022's model). This ADR narrows the expensive path to *real* failures rather than widening the gate's remit.
- **Drop the gate to width-1 / serialize all merges** to dodge any overlap. Rejected: width is the throughput lever, and the waste was never contention — it was a single agent timing out early. Serializing would slow every run to fix a non-cause.

## Consequences
- Easier: a slow-but-passing CI merges on the first attempt via cheap re-polls; the common `ci-timeout` no longer spends an implementer; run cost drops on exactly the wide runs where it spiked. The gate prompt no longer promises a wait it cannot perform.
- Harder: one more per-run knob (`gateWaits`) to keep documented in the workflow; a genuinely stuck CI now emits a short run of `gate:#n:ci-wait*` dispatches before it falls back (bounded, and each is cheap).
- Constrained: the re-poll loop is strictly bounded by `gateWaits`, then degrades to the unchanged attempt/park path — it can never merge an unfinished run and can never loop forever. Behavior is covered by tests that execute the workflow script against mock agents and assert the dispatch sequence (`ci-timeout` → in-place re-poll, no `build:#n:retry`; persistent timeout → bounded re-polls → fresh attempt → park).

## Revisit when
- The harness lets dispatched subagents wait efficiently (a first-class scheduling/Monitor primitive that resumes the child) — then a single gate agent can wait properly and the re-poll loop collapses back to one call. This is the same trigger ADR-0022 named; it would also reopen the merge-ownership split.
- Campaign data shows `gateWaits`'s default is wrong for real CI durations (too few → avoidable fallbacks; too many → cheap-agent churn on stuck CI), warranting a different default or an adaptive bound.
