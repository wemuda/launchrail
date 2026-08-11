---
name: implement
description: Start building — the single entry point for implementation (stage 10). Drives ready tickets to verified merges through the project's selected implementation loop. `/launchrail:implement` works the whole ready frontier; `/launchrail:implement 15` builds one ticket end to end in this session; several numbers scope the loop to just those tickets; a count ("the next 5") caps the run; a spec or slice reference ("spec #2's tickets") resolves to its tickets. It repairs its own setup (missing loop materials install via `launchrail sync`) instead of stopping. Only ever started explicitly by the user.
disable-model-invocation: true
---

# Implement — the one door to building

Everything before this skill produces tickets; this skill turns them into verified, merged code. The user never has to know which engine runs behind the door: read the manifest, fix the setup if it's incomplete, and route. The engines (`launchrail:ralph`, Superpowers) stay where they are — you compose them, never reimplement them.

## Step 1 — Read the project and resolve the scope

From `.launchrail.yml`: `implementationLoop` (default `ralph`), `issueTracker`, and the `testing` commands. From the arguments, the scope — in whatever form the user gave it:

- **no arguments** → the whole ready frontier (every open ticket labeled `ready-for-agent` whose blockers are settled);
- **one ticket number** → that ticket, built end to end in this session;
- **several numbers** → the loop, scoped to those tickets and the order their `Blocked by: #n` edges impose;
- **a count** — "the next 5", "max 5" → the loop with a merge cap. Don't hand-pick which five: the cap is a stop condition, and the frontier decides the order — the loop stops after that many *verified merges* and leaves the rest ready;
- **a spec, slice, or epic reference** — "spec #2's tickets", "the rest of slice 1" → resolve it to explicit numbers against the live tracker: the open tickets that belong to it (a "Part of: #n" line, the spec issue's ticket list, or a label), plus any open in-set blockers so the scope stays dependency-closed. Combinations compose: "the next 5 of spec #2" → that spec's tickets *and* a cap of 5.

**Resolve prose to data before anything launches.** The loop's inputs are ticket numbers and policy values (`only`, `max`, `width`) — the workflow form takes them as JSON args and refuses a natural-language string by design. Translating the user's words into that scope, against live tracker state, is *your* job, and it ends with an echo before any dispatch: "Scope: #14, #15, #19 — the remaining slice-1 tickets; #19 builds after #14. Cap: none." A misread scope corrected here costs a sentence; corrected after launch it costs a run.

## Step 2 — Repair setup, don't gatekeep

If the selected loop's materials are missing — `modules.ralph` off in the manifest, or `.claude/workflows/ralph.js` absent — run `npx @wemuda/launchrail sync` (additive and idempotent; its migration installs them) and say what it did. Never answer the user's "build this" with "first go run a command" for anything this skill can run itself. What you cannot repair, report precisely: no tracker configured (`issueTracker: none`), or an empty verification contract (no `testing` commands — `verify` fails on an empty contract and the loop refuses a start it cannot gate).

## Step 3 — Route by scope and loop

**The frontier (or a resolved scope), `ralph`:** run the loop under the `launchrail:ralph` skill — it owns the policies (width, attempts, cap, deferrals, remote-verified merges) and the orchestrator's contract. For a wide dependency graph or a long run, prefer its workflow form (`.claude/workflows/ralph.js`) — the skill explains when — passing the resolved scope as JSON args, e.g. `{ only: [14, 15, 19], max: 5, width: 1 }`.

**The frontier, `superpowers`:** drive the ready tickets through `superpowers:executing-plans` with `superpowers:test-driven-development`, closing each branch with `superpowers:finishing-a-development-branch`. Launchrail still owns both edges: `ready-for-agent` tickets in, `npx @wemuda/launchrail verify` green before anything counts as done.

**One ticket:** build it here, watchable, under the same contract a Ralph dispatch carries (kept textually parallel with `launchrail:ralph` — change one, change both):

1. **Dependency gate:** every ticket on the `Blocked by:` line is closed with its work merged. An open blocker stops you before any code — name it and offer to build it first.
2. Read the ticket and everything it links (spec sections, ADRs, journeys), plus `AGENTS.md`/`CLAUDE.md`.
3. Label the ticket `ralph:building`; branch `ralph/<n>-<short-slug>` from a fresh sync of the base.
4. Implement by the **`launchrail:ralph-implement`** contract — TDD, the `verify` gate, browser smoke for user-facing changes, self-review, commit conventions. Name the skill; don't paraphrase it.
5. Pre-PR sync: merge the latest base; resolve conflicts with `launchrail:resolving-merge-conflicts`; re-run the gate if anything changed.
6. Open a PR titled from the ticket with `Closes #<n>`; adopt an existing `ralph/<n>-*` branch or PR rather than opening a second.
7. Wait for CI (Monitor or a background sleep, never a foreground busy-wait); fix what the branch broke; merge; confirm on the remote that the PR merged and the issue closed — close it explicitly if squash-merge didn't. Remove `ralph:building`.
8. **Integrity:** no placeholders, no stubs, never delete or weaken a test to get green, never claim verification you didn't run.

## Ground rules

- **Only the user starts this.** Conductors and other skills hand over the command (`/launchrail:implement`); they never invoke it. The engines behind it inherit the same rule — reaching them through this door *is* the explicit user start.
- **Nothing is done until `npx @wemuda/launchrail verify` is green** — per ticket, and once more on the final base when a loop run ends. Where `modules.browser-testing` is enabled and the change is user-facing, a `launchrail:browser-smoke` journey is part of done.
- **Report evidence, not assertions:** PR numbers, merge commits, issues closed, the verify outcome — and what was parked or punted, with why.
