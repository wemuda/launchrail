# ADR-0030: Ralph merge gate — the CI wait rides on cheap read-only watchers

## Status
Accepted (amends [ADR-0027](0027-ralph-gate-ci-wait-repoll.md))

## Context
ADR-0027 fixed the merge gate's worst waste: a still-running CI (`ci-timeout`) is re-polled in place instead of burning a fresh implementer rebuild. But it re-polled by **re-dispatching the full gate agent** — the agent that carries the merge steps, the tracker bookkeeping, and the whole gate prompt — with only `effort: 'low'` to soften the cost. Crucially, that dispatch sets no `model`, so every re-poll inherits the session model, the most capable (and most expensive) tier in the run.

A field campaign showed what that costs. In a four-ticket run, the Gate phase spent 15 dispatches, eleven of them `gate:#n:ci-wait*` re-polls at roughly 50–77k session-model tokens each — about 700k tokens of the run's total, spent doing nothing but reading CI status and reporting "still running" or handing off to a merge. One ticket alone (`#104`) accumulated six re-polls (~400k tokens) waiting out a single ordinary CI run. Meanwhile the same workflow already runs its other read-only roles — graph read, merge verification, park bookkeeping — on the small model (`haiku`) without incident.

The structural facts from ADR-0027 all still hold: a dispatched subagent cannot idle-wait, the workflow script has no timer, and wall-clock comes only from concurrent work. What ADR-0027 did not separate is the two jobs the gate loop performs: **waiting** (read CI status until it resolves — no judgment, no writes) and **acting** (squash-merge, ordering, issue close — the careful part). The re-poll loop paid acting prices for waiting work.

## Decision
Split the wait from the act inside the workflow's gate loop:

- **Watch turns are read-only and small-model.** On `ci-timeout`, the loop dispatches a dedicated **CI watcher** — `model: 'haiku'`, `effort: 'low'`, a minimal prompt with no project preamble and no merge steps, and a three-value schema (`green` / `red` / `running`). It polls the PR's checks with Monitor-spaced reads across its turn and reports exactly what the API shows. It never merges, comments, labels, or writes. `gateWaits` now bounds these watch turns (same knob, same default, same meaning: the budget a slow CI gets before the ticket falls back to a fresh attempt).
- **The full gate is recalled only when there is a verdict to act on.** When a watcher reports `green` or `red`, the loop re-dispatches the real gate agent (`gate:#n:ci-done<k>`), which re-checks the API first-hand and acts — merge, or report `ci-failed` with a summary a fresh implementer can use. The gate never takes the watcher's word for anything; the watcher only decides *when* the gate is worth recalling.
- **The fallback path is unchanged.** Watch turns exhausted with CI still running keeps the gate's honest `ci-timeout` verdict and degrades to ADR-0027's unchanged safety net: a failed attempt, a fresh-context retry that adopts the PR, eventually a park. A dead watcher costs one watch turn, never the run.

On the common slow-CI path a ticket now costs one full-model gate (first look), a few small-model watch turns, and one full-model gate (the merge) — instead of up to `gateWaits + 1` full-model gates. The fast path (CI already done at first look) is untouched: one gate, no watcher.

Skill mode is untouched, as in ADR-0027: its orchestrator waits on its own timers and has no gate subagent to re-poll.

## Alternatives considered
- **Just add `model: 'haiku'` to the re-poll gate dispatches.** Smaller diff, but it hands the squash-merge, merge-ordering retries, and tracker bookkeeping to the small model whenever CI finishes during a re-poll — the common case, so the careful path would routinely run on the cheap tier. Splitting roles keeps merge authority where it was and makes the watcher structurally unable to act (its schema has no verb).
- **Have the watcher supply the `ci-failed` summary itself and skip the final gate on red.** Saves one full-model dispatch on the failure path, but the gate's first-hand read produces the summary the retry implementer acts on, and red is the rare path; not worth weakening the "gate trusts only its own API reads" rule.
- **Make each watch turn cover more wall-clock.** The turn length is a harness property, not a prompt choice — a subagent still cannot idle-wait, and Monitor spacing already fills the turn. Cheap turns make the number of turns nearly irrelevant; the fix is the price per turn, not the count.

## Consequences
- Easier: the wait on an ordinary 3–5-minute CI costs a handful of small-model watch turns instead of hundreds of thousands of session-model tokens; Gate-phase cost stops scaling with CI duration on the expensive tier. The watcher's tiny prompt also cuts input tokens per poll.
- Harder: one more dispatch role (`gate:#n:ci-wait*` is now a watcher, `gate:#n:ci-done<k>` the recalled gate) for supervisors to recognize in the progress display; the `launch-ralph` skill's healthy-shapes guidance is updated to match.
- Constrained: the watch loop is strictly bounded by `gateWaits`; the full gate can be recalled at most once per resolved watch round and always re-verifies against the API; a stuck CI still ends in the unchanged attempt/park path. Behavior is covered by the mock-agent workflow tests (premature timeout → cheap watch → single gate recall, no rebuild; bounded watches → fallback → park; red watch → gate recall, no further watches).

## Revisit when
- The harness lets dispatched subagents wait efficiently (ADR-0022's and ADR-0027's standing trigger) — a gate that can truly wait collapses the watcher loop back to one dispatch.
- Campaign data shows watcher verdicts disagreeing with the recalled gate's first-hand reads (flapping between `ci-done` and another `ci-timeout`), which would argue for letting the gate re-check less or the watcher report more.
