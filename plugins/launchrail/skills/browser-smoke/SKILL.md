---
name: browser-smoke
description: Drive the running app through its defined smoke journeys in a real browser and produce a Launchrail evidence bundle. Use when user-facing work needs verification beyond deterministic tests, when the user asks to smoke-test the app, or before declaring user-facing work done in a project with the browser-testing module enabled (.launchrail.yml modules.browser-testing).
---

# Browser smoke testing

Drive the real application through its user journeys in a browser and record evidence. Agentic smoke testing supplements deterministic tests — it never replaces them, and it never substitutes assertion for evidence.

## Preconditions

1. `.launchrail.yml` has `modules.browser-testing: true`. If not, stop and suggest `npx @wemuda/launchrail add browser-testing`.
2. Deterministic checks pass first: run `node scripts/verify.mjs`. If verify fails, fix that before smoke testing — smoke runs on top of a green build.
3. The app is running. Start it with `node scripts/dev.mjs` (use `--background` in cloud or CI sessions; logs land in `.launchrail/state/dev.log`). In a fresh clone, run `node scripts/setup.mjs` first.

## Run contract

1. **Collect the journeys.** Read `docs/testing/smoke-journeys.md` (sections headed `## Journey:`) plus any journeys defined in the ticket or spec under verification. Each journey has a start point, steps, and verify checks.
2. **Scaffold the evidence bundle.** Run `npx @wemuda/launchrail smoke` (add `--url <url>` for a preview environment). It confirms the app responds and creates `artifacts/verification/<run-id>/` containing `meta.json`, a `summary.md` skeleton, and `screenshots/` + `traces/` directories. If it reports the app unreachable, start the app — do not skip the journey.
3. **Drive each journey in a real browser** — Playwright MCP, browser tools, or a Playwright script, whichever is available. The browser-testing module seeds a Playwright MCP server (`.mcp.json`); approve it once in Claude Code to drive the browser interactively, or fall back to a Playwright script in headless CI. Follow the steps as a user would: click, type, navigate. Try realistic variations and obvious edge cases, and watch the console and network panel as you go.
4. **Capture evidence while testing, not afterwards:**
   - Screenshots of each key state → `screenshots/`
   - Console errors and warnings → `console.log`
   - Failed or unexpected requests → `network-errors.json`
   - Playwright traces where available → `traces/`
5. **Apply the standard checks to every journey:**
   - No uncaught console errors
   - No failed API requests
   - The success state is visible
   - Data remains after refresh

## When you find a real bug

1. Record the precise reproduction in the evidence bundle.
2. Add or update a deterministic test that fails on the bug.
3. Fix the bug.
4. Prove the deterministic test passes.
5. Re-run the affected journey.
6. Keep the trace or screenshot that shows the failure.

This turns exploratory findings into permanent regression coverage instead of forgotten discoveries.

## Completing the run

- Fill in `summary.md` completely: journey outcomes, standard checks, evidence references, deviations, newly added tests, remaining blockers. Check only boxes you actually verified.
- Record any deviation from the spec or design in `deviations.md` next to the summary.
- A journey you could not complete is a failure or a blocker, never a pass.
- Never mark a journey passed while it has unexplained console or network errors.
- The committed record is `summary.md`, `deviations.md`, and `meta.json`; bulky evidence stays local or becomes a CI artifact.
