# ADR-0035: Ralph preflight verifies the integration base on the live remote

## Status
Accepted — amends [ADR-0032](0032-ralph-lean-local-gate-loop.md) (preflight's base check) and [ADR-0028](0028-hosted-session-designated-branch-target.md) (a session-pinned base that lives only locally is published, not assumed present)

## Context
The lean loop (ADR-0032) lands each finished branch with a local squash-merge onto the integration base and pushes it; every land begins with `git fetch origin <base>`. Preflight is the gate that proves the base is sound before any builder is dispatched, and its `green` verdict is what the workflow trusts to start.

A field run exposed a hole in that verdict. Preflight judged the base *present on origin* from a local `refs/remotes/origin/<base>` tracking ref (a `git branch -r` view), which is a cache of the last fetch, not the live remote. When the base existed only locally — a session-pinned working branch (ADR-0028) with committed but unpushed work — a stale tracking ref left from an earlier fetch made the branch look present. Preflight reported `green: true, targetCreated: false` and dispatched builds. Then every land failed at `git fetch origin <base>` → "couldn't find remote ref", and with `canary` holding width at 1 until the first verified land, no land ever succeeded: the whole run was wasted. The only recovery was to stop the run, `git push -u origin <base>` by hand, and relaunch with `knownGreen`.

The defect is that `green` *inferred* base-on-origin locally instead of *asserting* it against the remote. A `git fetch` without `--prune` never drops the stale ref, and a `--ff-only` merge from an already-ancestor tracking ref is a silent no-op, so nothing downstream noticed.

## Decision
Preflight's `green` verdict must assert the base is on origin, proven against the live remote — never inferred from a local tracking ref.

- **Prune, then query the live remote.** Preflight runs `git fetch --prune origin` (which drops the stale `origin/<base>` ref) and judges the base's presence with `git ls-remote --heads origin <base>` — explicitly never `git branch -r` or any `refs/remotes/origin/*` ref. The confirming sha is reported as a new `baseOnRemote` field.
- **Recover an absent base by class, then re-confirm.** When `ls-remote` shows the base absent from origin: a **consolidation target** is minted from the default branch's tip and pushed (the existing `targetCreated` path); a **session-pinned base with local-only commits** is pushed to origin (`git push -u origin <base>`, reported as `basePushed`) — its committed work *is* the base, so it is published, not discarded and not assumed present. If preflight can neither push nor create it, it refuses with "push the base first". A missing *default* branch stays a refusal, unchanged.
- **`green` encodes base-on-origin, and the script enforces it.** `green` now means `baseOnRemote` is non-empty and equal to `headSha` (origin carries the base at exactly the tip this checkout builds against) *and* the base is synced in *and* the full gate passed (or was skipped as `knownGreen`). As a backstop the workflow refuses to dispatch when a `green` preflight did not supply a matching `baseOnRemote`, so a misreport cannot revive the bug. Publishing a local-only base is added to preflight's permitted mutations (alongside creating the consolidation branch and syncing the checkout).

Per ADR-0005's parallel-policy rule the change lands in both the `ralph.workflow.js` policy and the `launch-ralph` skill's preconditions.

## Alternatives considered
- **Keep inferring from the tracking ref but always `--prune` first.** Pruning fixes *this* reproduction, but the verdict would still be reading a cache; any path that leaves a tracking ref without a matching remote branch (a partial fetch, a concurrent delete) reopens the hole. Asserting against `ls-remote` removes the class of bug, not the instance.
- **Refuse whenever the base is absent from origin ("push the base first").** Correct but needlessly manual for the two cases preflight can safely resolve itself: minting a consolidation target is already its job (ADR-0026), and a session-pinned base's commits are already made — pushing them is the same publish the operator would do by hand. Refusal is kept only as the fallback when neither is possible.
- **Have the lander create the base on the first land.** Moves base-establishment past the point where builders have already been dispatched against a base that may not hold, and splits the "is the base sound?" question across two stages. Preflight is the one gate before fan-out; the check belongs there.

## Consequences
- Easier: a local-only or session-pinned base no longer wastes an entire canary run; the failure that cost a run and a manual recovery is caught before dispatch, or fixed by preflight itself; the recap says whether the base was created or pushed.
- Harder: preflight runs one more remote round-trip (`ls-remote`) and may push the base; the reported `green` now carries `baseOnRemote` that the script cross-checks. Covered by tests that assert the preflight prompt prunes and queries the live remote, and that a `green` verdict without a matching `baseOnRemote` refuses to dispatch.
- Constrained: the workflow will not start a run against a base it cannot see on origin, even when a local checkout looks ready — the live remote is the sole authority for base-on-origin.

## Revisit when
- A hosted environment forbids pushing the session-pinned base at the transport level (not just by instruction) — preflight could then neither find nor publish it, forcing the operator-pushes-first path as the only one.
- `ls-remote` per preflight becomes a measurable cost on very large remotes often enough to want a narrower query or a cached-with-validation scheme — unlikely, since preflight already fetches.
