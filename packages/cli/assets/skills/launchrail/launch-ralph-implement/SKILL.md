---
name: launch-ralph-implement
description: Implement a single ticket end to end under the Launchrail completion contract — TDD, the deterministic verification gate, browser smoke for user-facing changes, self-review, and conventional commits. Used by Ralph loop dispatches and by /launch-implement's single-ticket mode.
---

# Implement one ticket

The per-ticket implementation contract. Ralph dispatches name this skill so the contract lives in one place — every implementer, on every run, gets the same one.

1. **Read before coding.** The ticket, every artifact it links (spec sections, ADRs, smoke journeys), and `AGENTS.md`/`CLAUDE.md`. The commands you run come from `.launchrail.yml` (`testing.*`) and `AGENTS.md`, verbatim.
2. **TDD at the seams the ticket names.** Write the failing test first where the ticket or spec defines behavior. Typecheck and run single test files as you go; save full-suite runs for the gate — the machine may be shared with other implementers.
3. **The gate:** `npx @wemuda/launchrail verify` must exit 0 before the work is done. Never delete, skip, or weaken a test to get there; if a test is genuinely wrong, fix it deliberately and say so in the PR body.
4. **User-facing behavior, with `modules.browser-testing` enabled:** update or add the affected journey in `docs/testing/smoke-journeys.md` and drive it per the `launch-browser-smoke` skill. A journey you could not complete is a failure, not a pass.
5. **Self-review:** call the Skill tool with `launch-code-review` on the result and fix what it finds before handing off.
6. **Commit to the current branch** following the project's commit conventions (Conventional Commits when `.launchrail.yml` says so). Update any artifact the change invalidates (spec, ADR, journey) in the same change.

Done means: the gate is green, the review found nothing unaddressed, and the evidence (test output, journey results) exists — not that the code "should work".
