---
name: launch-implement
description: Start building — the single entry point for implementation (stage 10). Drives ready tickets to verified merges through the Ralph loop. `/launch-implement` works the whole ready frontier; `/launch-implement 15` builds one ticket end to end in this session; several numbers scope the loop to just those tickets; a count ("the next 5") caps the run; a spec or slice reference ("spec #2's tickets") resolves to its tickets. It repairs its own setup (missing loop materials install via `launchrail sync`) instead of stopping. Only ever started explicitly by the user.
disable-model-invocation: true
---

# Implement — the one door to building

Everything before this skill produces tickets; this skill turns them into verified, merged code. The user never has to know how the engine runs behind the door: read the manifest, fix the setup if it's incomplete, and route. The engine (`launch-ralph`) stays where it is — you compose it, never reimplement it.

## Step 1 — Read the project and resolve the scope

From `.launchrail.yml`: `issueTracker` and the `testing` commands. From the arguments, the scope — in whatever form the user gave it:

- **no arguments** → the whole ready frontier (every open ticket labeled `ready-for-agent` whose blockers are settled);
- **one ticket number** → that ticket, built end to end in this session;
- **several numbers** → the loop, scoped to those tickets and the order their `Blocked by: #n` edges impose;
- **a count** — "the next 5", "max 5" → the loop with a merge cap. Don't hand-pick which five: the cap is a stop condition, and the frontier decides the order — the loop stops after that many *verified merges* and leaves the rest ready;
- **a spec, slice, or epic reference** — "spec #2's tickets", "the rest of slice 1" → resolve it to explicit numbers against the live tracker: the open tickets that belong to it (a "Part of: #n" line, the spec issue's ticket list, or a label), plus any open in-set blockers so the scope stays dependency-closed. Combinations compose: "the next 5 of spec #2" → that spec's tickets *and* a cap of 5.

**Resolve the integration target with the scope.** Every loop run merges its per-ticket PRs into exactly one base (ADR-0022): **trunk** — the default branch, each ticket live the moment it merges — unless the user names a consolidation branch ("collect spec #44 on `spec/44-mvp`", "don't touch master yet") or the environment forbids pushing to the default branch (a harness-designated branch: use it, and say that constraint is why). Consolidation means the default branch stays untouched and the run ends by offering one release PR `<target> → <default>`; it is a choice the user should recognize, never a silent fallback.

**Resolve prose to data before anything launches.** The loop's inputs are ticket numbers and policy values (`only`, `max`, `width`, `target`) — the workflow takes them as JSON args and refuses a natural-language string by design. Translating the user's words into that scope, against live tracker state, is *your* job, and it ends with an echo before any dispatch: "Scope: #14, #15, #19 — the remaining slice-1 tickets; #19 builds after #14. Cap: none. Target: trunk (`master`). Engine: the `ralph` workflow." A misread scope corrected here costs a sentence; corrected after launch it costs a run.

## Step 2 — Repair setup, don't gatekeep

If the loop's materials are missing — `modules.ralph` off in the manifest, or `.claude/workflows/ralph.js` absent — run `npx @wemuda/launchrail sync` (additive and idempotent; its migration installs them) and say what it did. Never answer the user's "build this" with "first go run a command" for anything this skill can run itself. What you cannot repair, report precisely: no tracker configured (`issueTracker: none`), or an empty verification contract (no `testing` commands — `verify` fails on an empty contract and the loop refuses a start it cannot gate).

## Step 3 — Route by scope

**The frontier (or any multi-ticket scope):** the engine is the `ralph` workflow (`.claude/workflows/ralph.js`) — launch it with the resolved scope and target as JSON args, e.g. `{ only: [14, 15, 19], max: 5, target: 'spec/2-checkout' }` (`canary: true` on a project's first run), then supervise it per the `launch-ralph` skill, which owns the policies (width, attempts, cap, deferrals, the merge gate, remote-verified merges) and the supervisor's contract. Orchestrating dispatches by hand under that skill instead is the exception, chosen out loud in the echo: the user asked to watch each dispatch, the Workflow tool is unavailable here, or the run is a targeted intervention (one parked ticket). One engine, one shape — a session that invents its own fan-out is not running the loop.

**One ticket:** build it here, watchable, under the same contract a Ralph dispatch carries (kept textually parallel with `launch-ralph` — change one, change both). One deliberate divergence: you are the session, not a subagent, so you also run the merge gate yourself — waiting on CI here is fine:

1. **Dependency gate:** every ticket on the `Blocked by:` line is closed with its work merged. An open blocker stops you before any code — name it and offer to build it first.
2. Read the ticket and everything it links (spec sections, ADRs, journeys), plus `AGENTS.md`/`CLAUDE.md`.
3. Label the ticket `ralph:building`; branch `ralph/<n>-<short-slug>` from a fresh sync of the base (the resolved integration target).
4. Implement by the **`launch-ralph-implement`** contract — TDD, the `verify` gate, browser smoke for user-facing changes, self-review, commit conventions. Name the skill; don't paraphrase it.
5. Pre-PR sync: merge the latest base; resolve conflicts with `launch-resolving-merge-conflicts`; re-run the gate if anything changed.
6. Open a PR titled from the ticket with `Closes #<n>`; adopt an existing `ralph/<n>-*` branch or PR rather than opening a second.
7. Wait for CI (Monitor or a background sleep, never a foreground busy-wait); fix what the branch broke; merge; confirm on the remote that the PR merged and the issue closed — close it explicitly if squash-merge didn't. Remove `ralph:building`.
8. **Integrity:** no placeholders, no stubs, never delete or weaken a test to get green, never claim verification you didn't run.

## Ground rules

- **Only the user starts this.** Conductors and other skills hand over the command (`/launch-implement`); they never invoke it. The engines behind it inherit the same rule — reaching them through this door *is* the explicit user start.
- **Nothing is done until `npx @wemuda/launchrail verify` is green** — per ticket, and once more on the final base when a loop run ends. Where `modules.browser-testing` is enabled and the change is user-facing, a `launch-browser-smoke` journey is part of done.
- **Report evidence, not assertions:** PR numbers, merge commits, issues closed, the verify outcome — and what was parked or punted, with why.
- **Every loop run ends with the campaign recap** (the `launch-ralph` close-out): where the work lives — target branch and head SHA — the ticket → PR → merge-commit table, parked and stuck tickets, punted follow-ups in one list, and the single next step; in consolidation mode that step is *offering* the one release PR to the default branch, opened only when the user says so.
