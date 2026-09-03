---
name: launch-loop-readiness
description: Check and tune a repository for the implementation loop — measure the verification gates, then set the fast per-land gate, parallelize browser journeys, share caches for parallel builders, narrow CI triggers, create the tracker labels, add hosted-session setup, and document the verbatim commands. Measured first, applied with one confirmation, never a gate on the rail. Run once before the first /launch-implement on an existing codebase, or whenever doctor's `ralph …` readiness lines warn.
---

# Loop readiness — tune the repo for the implementation loop

The Ralph loop is only as fast as the repository lets it be. Every land runs the fast gate, every fifth land runs the full gate, every builder starts in a fresh worktree, every push can wake a CI runner, and a hosted session starts from an empty container. A repo tuned for humans typing `pnpm test` once an hour wastes tokens and wall-clock when three fresh-context builders hammer it all night. This skill measures that waste and removes it — without weakening a single test.

It is advice, never a gate: `/launch-implement` runs whether or not this skill ever ran. `npx @wemuda/launchrail doctor` shows the same findings as warn-only `ralph …` lines; this skill is where they get fixed with numbers behind them.

## Contract

- **Measure before proposing.** Every finding carries a number — seconds cold, seconds warm, journeys count — from a run you made, not an estimate.
- **Propose in impact order, with the expected saving**, then apply everything reversible in **one confirmation round** (the interaction contract in [`workflow.md`](../launch/workflow.md): reversible implementation details are yours, the user confirms only what touches their testing methodology — which journeys stay serial, what CI still runs).
- **Never weaken coverage.** No deleted, skipped, or loosened tests; no lowered assertions; latency-sensitive journeys stay serial. Speed comes from tiering, parallelism, caching, and not running the same suite twice.
- **Idempotent.** Re-running on a tuned repo reports "ready" and changes nothing.
- **One commit** at the end, in the project's convention (`chore: tune the repo for the implementation loop`), listing what changed.

## Step 1 — Inventory (read-only)

1. `npx @wemuda/launchrail doctor` — collect every `ralph …` line; they are the deterministic half of this checklist.
2. `.launchrail.yml` `testing.*` (unit, check, e2e, dev, smoke) and `AGENTS.md`'s Commands section: which commands exist verbatim, which are missing.
3. The package manager and its install command (frozen-lockfile form); the scripts (`test`, `lint`, `typecheck`, `build`, `check`); the monorepo tool (turbo, nx, workspaces) and its cache configuration; the test runners and their configs (vitest/jest workers and cache, Playwright `workers`, `fullyParallel`, `projects`, `retries`).
4. CI: every workflow's triggers and jobs; whether the required check is the same command the loop runs locally.
5. Data: the migration tool and its generate/renumber command; whether tests need a database, ports, or external services, and how they isolate per run.
6. Tracker: the labels the loop uses (`ready-for-agent`, `ralph:building`, `needs-info`, `spec`) exist — check with the tracker tools named in `docs/agents/issue-tracker.md`.
7. `.claude/settings.json`: hooks (the Ralph guard, any `SessionStart`), permissions; the seeded `scripts/setup.mjs` when the browser-testing module is on.

## Step 2 — Measure

Run, and time, in this order — twice each, so cold and warm are both known:

- `npx @wemuda/launchrail verify --fast` (the per-land gate).
- `npx @wemuda/launchrail verify` (the checkpoint and release gate); note the per-package breakdown the runner prints and, with browser journeys, their count and their share of the time.
- The install command in a fresh worktree (`git worktree add ../readiness-probe HEAD`, install, then remove it) — what every builder pays before its first test.

Write the numbers down; they anchor every proposal and the closing card.

## Step 3 — The catalogue

Work through these; each names the check, the fix, and why it matters to the loop.

1. **The fast gate** — `testing.checkCommand` unset, or slower than ~2 minutes warm. Set it to lint + typecheck + the unit suites without browser journeys (on turbo: `turbo run lint typecheck test --filter=!<web-package>` plus the web package's unit runner). Every land and every hand-off runs this; the journeys move to the checkpoints.
2. **Browser journeys** — a global `workers: 1` or `fullyParallel: false`. Split: a `serial` Playwright project holding the latency-asserting journeys (matched by directory or a `@serial` tag) and a `parallel` project for the rest; run them as two invocations from the e2e command (`playwright test --project=parallel --workers=4 && playwright test --project=serial --workers=1`). Which journeys are latency-sensitive is the user's call — ask with the list in hand. Target: the full suite in a fraction of its serial time with identical assertions.
3. **Caches for parallel builders** — each builder starts in a fresh worktree with an empty cache. Enable the monorepo tool's shared cache: turbo remote cache, or `TURBO_CACHE_DIR` pointing at a path outside the worktree (persist it for hosted sessions via `$CLAUDE_ENV_FILE` in the SessionStart hook); a shared vitest `cacheDir`; the package manager's content-addressable store (pnpm has one by default). Unchanged packages then cost nothing at the builder's gate and at the lander's.
4. **CI triggers** — a workflow that runs on every push. The loop pushes `ralph/*` on every green step and the integration branch on every land; each would start a run nobody waits on. Trigger on `pull_request` and pushes to the default branch only, and add a `concurrency` group with `cancel-in-progress` so a release PR's re-pushes do not queue behind each other. Cloud CI runs once, on the release PR — make sure the required check there is the same full gate the loop ran at release.
5. **Tracker labels** — create any of `ready-for-agent`, `ralph:building`, `needs-info`, `spec` that are missing, with the descriptions from `docs/agents/issue-tracker.md`. A run refuses or mislabels without them.
6. **Hosted-session setup** — no `SessionStart` hook. Hosted sessions (Claude Code on the web) start from a fresh container: add `.claude/hooks/session-start.sh` that exits early unless `$CLAUDE_CODE_REMOTE` is `true`, runs the install command, and — with the browser-testing module — `node scripts/setup.mjs` so the pinned browser build is present (a version mismatch here is a preflight refusal in the field). Register it additively under `hooks.SessionStart` in `.claude/settings.json` (merge; the Ralph guard's `PreToolUse` entry stays). Synchronous first; offer async mode only if the user wants faster session starts. Validate it once with `CLAUDE_CODE_REMOTE=true` before committing.
7. **Verbatim commands** — `AGENTS.md`'s Commands section still holds the seeded TODO, or lacks any of install, fast gate, full gate, dev, and the migration generate/renumber command. Builders and the pre-land sync read these verbatim; fill them in from the inventory, and mirror the test ones into `.launchrail.yml` `testing.*`.
8. **Test isolation for parallel builders** — fixed ports, a shared database or schema, temp files at fixed paths. Three builders run the suites at once on one machine: use ephemeral ports (`0`), per-run database names or schemas, and `os.tmpdir()`-based paths. A flake that only appears at width 3 is this.
9. **Worktree hygiene** — configs or scripts that assume the checkout path (absolute paths, `..` walks out of the repo), generated files that are not ignored, install steps that write outside the repo. Builders work in `git worktree`s; anything path-bound breaks there first.
10. **Unattended runs** — remind, once, that an unattended run launches in a non-prompting permission mode (the guard hook warns at launch), and that any MCP or CLI the loop needs (the tracker tools) must be reachable from the session that launches it.

## Step 4 — Confirm, apply, re-measure

Present the proposals as one list — finding, fix, expected saving — and ask one round of at most three questions, only about what needs the user's judgment (which journeys stay serial; whether CI may be narrowed; anything touching production or secrets). Then apply everything approved, run `doctor` again, re-run the Step 2 timings, and commit.

## Step 5 — The readiness card

Close with a card the user can act on without scrolling back:

```
Loop readiness — <project>
Fast gate:   <before> → <after> (warm <n>s) · <command>
Full gate:   <before> → <after> · journeys <n> (<parallel>/<serial>)
Builder cold start: install <n>s · first fast gate <n>s
Changed:  <one line per change, with the file>
Left for you: <anything that needs a human — secrets, remote cache login, CI settings>
```

Then hand back: when reached through `launch`, close with the rail banner from [`workflow.md`](../launch/workflow.md) — stage 0 under Done, the next stage under Now.

## What this skill does not do

- It never starts the loop, and never blocks it — `/launch-implement` runs without it.
- It never touches product artifacts (vision, specs, tickets) or the managed Launchrail files.
- It never deletes, skips, or weakens a test, and never lowers an assertion to buy speed.
- It never changes what CI verifies, only when it runs; a project's required checks stay required.
