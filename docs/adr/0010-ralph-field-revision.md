# ADR-0010: Ralph field revision — deterministic edges, dependency-gate deferrals, supervised workflow runs

## Status
Accepted (amends ADR-0005) — amended by [ADR-0022](0022-ralph-campaign-revision.md) (the CI wait moves out of implementer dispatches into a loop-owned merge gate) and by [ADR-0032](0032-ralph-lean-local-gate-loop.md) (no dispatch waits on CI at all — the "CI wait discipline" clause is moot; everything else here stands)

## Context
ADR-0005 shipped Ralph from a supplied design and listed "real campaign data suggests different defaults" as its revisit trigger. That data now exists: the first real Ralph campaigns ran against a Wemuda project (outside this repo), and the run-hardened workflow script and orchestrator skill that came back carry mechanics the shipped version lacks. Per the promotion loop, the reusable lessons move upstream into the toolchain; the project-specific parts (hardcoded repo, base branch, and commands) do not — ADR-0005's environment-agnostic preflight already covers those and stays.

## Decision
Fold the run-earned mechanics into both frontends, keeping their policy blocks parallel:

- **Blocking edges cross the model boundary verbatim.** The graph reader copies each ticket's `Blocked by` line character-for-character; the orchestrator parses the `#n` references deterministically (self-references dropped). Models were observed misresolving edges, and a single misread edge silently builds a ticket on a dependency that hasn't landed.
- **Dependency gate with deferrals.** Every implementer's first step is confirming its declared blockers are closed and merged into the base; if not, it reports `blocked` and stops. A deferral hands the attempt back (capped at the attempts count, then it becomes a real failure). This backstops the one hole in frontier computation: a blocker that is open but never entered the ready set was silently treated as settled.
- **Stricter remote verification.** A merge counts only when the PR is merged, its merge commit is in the base branch's history, and the issue is closed. Merged-but-issue-open now fails verification; the retry adopts the merged PR via the idempotency clause and finishes the bookkeeping — self-healing instead of silently inconsistent tracker state.
- **Defensive run entry.** String `args` are parsed as JSON and unparseable args refuse the run (a caller error is not licence to build the whole tracker); a missing base branch is a preflight refusal, never a guess; preflight reports actual exit codes, not summary lines.
- **CI wait discipline in every dispatch.** Polls spaced with Monitor or a background sleep (never foreground/busy loops), ~20-minute budget, and a failure that reproduces on the base itself is `ci-red` — systemic, not the ticket's.
- **Field defaults.** Width 3 (still "use 1 until a campaign has landed cleanly"), max rounds 25 (deferral rounds spend from it), token reserve 200k. Attempts stay at 2.
- **The skill gains a supervision contract.** Launching the workflow does not end the orchestrator's job: read the resolved scope back immediately, establish ground truth from the remote and the workflow journal (never the run's own reports), arm check-ins across long waits, know the healthy shapes (a deferral is not a failure), intervene by exception, report once.

## Alternatives considered
- **Adopt the field files wholesale** — rejected: they hardcode one project's repo, base branch, commands, and tracker workarounds, which would regress the byte-identical managed-file design and the run-time preflight of ADR-0005.
- **Keep the shipped defaults and mechanics** — rejected: the deferral and verbatim-edge changes fix observed failure modes (burned attempts on stale frontiers, misread edges), not stylistic preferences.
- **A `blocked`-specific attempts knob** — rejected: reusing the attempts count as the deferral cap keeps the policy surface small; maxRounds already backstops pathological graphs.

## Consequences
- Easier: blocked dispatches no longer burn attempts; tracker state converges (issues actually closed); edge resolution can no longer hallucinate; workflow runs get a defined supervisor.
- Harder: a permanently missing dependency takes more dispatches to park (deferral cap + attempts); the skill and workflow have more surface to keep textually parallel.
- Constrained: unparseable args and a missing base branch are refusals, not best guesses.

## Revisit when
- Campaign data shows the deferral cap or width default wrong at scale.
- Trackers with native blocking relations (Linear) need more than the render-to-a-line convention the graph reader uses.
- The workflow runtime grows first-class scheduling/check-in hooks that replace the skill's manual supervision steps.
