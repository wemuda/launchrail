---
name: launch-ralph-implement
description: Implement a single ticket end to end under the Launchrail completion contract — TDD, commit-and-push after every green step, the fast verification gate before hand-off, browser smoke for user-facing changes, self-review, and conventional commits. Used by Ralph loop dispatches and by /launch-implement's single-ticket mode.
---

# Implement one ticket

The per-ticket implementation contract. Ralph dispatches name this skill so the contract lives in one place — every implementer, on every run, gets the same one.

1. **Read before coding.** The ticket, every artifact it links (spec sections, ADRs, smoke journeys), and `AGENTS.md`/`CLAUDE.md`. The commands you run come from `.launchrail.yml` (`testing.*`) and `AGENTS.md`, verbatim.
2. **Push early, push often.** Your branch is pushed before you write a line, and you **commit and push after every green step** — a passing test slice, a finished subtask. The pushed branch is the checkpoint a lost session resumes from (a successor adopts it at its last commit instead of rebuilding) and the loop's liveness signal. Work that is not on the remote does not exist to the next session. Never push to the base branch and never open a PR from inside a loop dispatch — the loop lands your branch.
3. **TDD at the seams the ticket names.** Write the failing test first where the ticket or spec defines behavior. Typecheck and run single test files as you go; save whole-suite runs for the gate — the machine may be shared with other implementers.
4. **The gate — tiered.** Before you hand off, `npx @wemuda/launchrail verify --fast` (the fast gate: `testing.checkCommand`, else the unit command) must exit 0 on your branch. Inside a Ralph dispatch that is your gate: the loop runs it again on the merged tree before pushing the base, and runs the full `npx @wemuda/launchrail verify` (browser journeys included) at its checkpoints — so do not spend your turn on the whole suite; run only the slow test files your change touches (a journey you edited). Outside the loop (single-ticket mode, a PR of your own), the full `npx @wemuda/launchrail verify` must exit 0 before the PR. Never delete, skip, or weaken a test to get there; if a test is genuinely wrong, fix it deliberately and say so in the commit message.
5. **User-facing behavior, with `modules.browser-testing` enabled:** update or add the affected journey in `docs/testing/smoke-journeys.md` and drive it per the `launch-browser-smoke` skill. A journey you could not complete is a failure, not a pass.
6. **Self-review:** call the Skill tool with `launch-code-review` on the result and fix what it finds before handing off.
7. **Commit to the current branch** following the project's commit conventions (Conventional Commits when `.launchrail.yml` says so); the loop squashes your branch onto the base, so also hand it a Conventional Commit title for that squash. Update any artifact the change invalidates (spec, ADR, journey) in the same change.

Done means: the gate is green, the review found nothing unaddressed, the branch is pushed, and the evidence (test output, journey results) exists — not that the code "should work".
