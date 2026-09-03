# ADR-0033: Loop readiness — doctor's readiness lines and the `launch-loop-readiness` skill

## Status
Accepted — extends [ADR-0032](0032-ralph-lean-local-gate-loop.md) (the lean loop assumes a repository tuned for it); amends [ADR-0009](0009-launch-orchestrator-skill.md) (stage 0 gains an optional readiness pass).

## Context
ADR-0032 moved the implementation loop's gate local and made every land pay `launchrail verify --fast`, every fifth land the full `verify`, and every builder a fresh worktree. That makes the loop's speed a property of the *repository*: what the fast gate actually runs, whether browser journeys are pinned to one worker, whether a fresh worktree hits any cache, whether every push wakes a CI runner, whether the tracker carries the loop's labels, and whether a hosted session's container has dependencies and browsers at all.

The field campaign behind ADR-0032 showed each of these as a concrete cost: a `pnpm test` gate that includes 161 serial Playwright journeys (~5 minutes, run 30–40 times); `workers: 1` chosen for a handful of latency-asserting journeys and applied to all of them; cold worktrees; a CI workflow that would run on every `ralph/*` push; a hosted container whose Chromium build did not match the repository's Playwright pin, refusing the very first preflight. None of these is a Launchrail bug and none is fixed by Launchrail's managed files — they are project setup — but nothing on the rail guided a user to fix them, and the retrospective's own "how to make this fast" list had to be reconstructed from a night's logs.

Launchrail already has the two places such guidance belongs: `doctor`, for what a file read can prove, and a `launch-*` skill, for what needs measurement, judgment, and edits to project-owned files with the user's confirmation.

## Decision
- **`doctor` gains warn-only loop-readiness lines** under the `ralph` prefix, computed from files alone: `ralph fast gate` (`testing.checkCommand` set; unset warns only when browser journeys are in play, otherwise a hint), `ralph ci triggers` (a GitHub workflow that fires on every push), `ralph journeys` (a global `workers: 1` pin in the Playwright config), `ralph hosted setup` (no `SessionStart` hook when the browser-testing module is on), `ralph commands` (AGENTS.md still carries the seeded commands placeholder). They never fail doctor: readiness is advice about speed and tokens, not correctness, and a run must never be blocked by a tuning opportunity.
- **A new managed skill, `launch-loop-readiness`, owns the fix.** It inventories the repo, **measures** the fast and full gates cold and warm plus a fresh worktree's install cost, and works a fixed catalogue in impact order: the fast gate, a serial/parallel split of the browser journeys, shared caches for worktree builders, CI triggers and concurrency, tracker labels, a hosted-session `SessionStart` hook that installs dependencies and the pinned browsers, verbatim commands in `AGENTS.md` and the manifest, test isolation for parallel builders, worktree hygiene, and the unattended-run reminder. It applies the reversible changes after one confirmation round, re-measures, commits once, and closes with a readiness card of before/after numbers. Its hard rule: speed comes from tiering, parallelism, caching, and not running the same suite twice — never from a deleted, skipped, or loosened test.
- **It is optional and never a gate.** The conductor's stage 0 names it (recommended once for an existing codebase), the stage keywords reach it (`readiness`, `tune`, `optimize`), the alignment on-ramp recommends it in its verification row, and `/launch-implement` mentions it once when doctor warns — then proceeds. The golden path for a fresh project stays `init` → `/launch`.
- **The seeded AGENTS.md placeholder becomes a shared constant** so the readiness check and the seed cannot drift apart.

## Alternatives considered
- **Make `init` ask for the fast gate and CI shape.** Rejected: ADR-0023 shrank the init interview to what a user can answer at that moment; a fast-gate command is discovered by measuring, not by asking, and an existing project's CI is not init's to rewrite.
- **Have the loop's preflight tune the repo.** Rejected: preflight reports and refuses, it does not mutate project-owned files; and tuning needs the user's judgment on which journeys stay serial.
- **Fail doctor on readiness gaps.** Rejected: doctor's failures mean "the setup is broken"; a slow-but-correct gate is neither, and a failing doctor would block conductors that treat "doctor green" as stage 0's done-when.
- **Fold the checklist into `launch-project-alignment`.** Rejected: alignment is about product artifacts and ends in a vision; readiness is about build mechanics, is useful on new projects too once a test suite exists, and is re-run whenever the suite grows — a separate owner keeps both skills small.

## Consequences
- Easier: a project can be brought to the lean loop's assumptions in one measured pass instead of a night of discovery; `doctor` says when that pass is worth running; the fast-gate fallback is never silently the full suite on a journey-heavy project.
- Harder: five more doctor lines to keep honest (each a heuristic — the journeys check reads a code file textually and flags only the global single-worker pin); one more skill in the managed set and its row in every consuming repo's `.claude/skills/`.
- Constrained: the CI-trigger check understands GitHub Actions only, and the hosted-setup check knows Claude Code's `SessionStart` hook only — other CI systems and hosts are the skill's judgment, not doctor's. The skill edits project-owned files (test configs, workflows, `AGENTS.md`, `.claude/settings.json`) only with confirmation and never touches managed files.

## Revisit when
- Field cards show a catalogue item that never pays (drop it) or a recurring cost outside it (add it), or show the doctor heuristics misfiring on common configs.
- A consuming project runs a CI system or a host the deterministic checks do not understand often enough to deserve its own check.
- Launchrail's browser-testing seed changes its Playwright defaults (a seeded serial/parallel project split would make the journeys check moot for new projects).
