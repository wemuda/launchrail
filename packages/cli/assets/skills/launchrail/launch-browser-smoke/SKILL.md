---
name: launch-browser-smoke
description: Drive the running app in a real browser to see a just-built change working — a one-off, agent-driven check of the feature, not a test suite and not an evidence bundle. Use before declaring user-facing work done when .launchrail.yml has modules.browser-testing enabled, or when the user asks to smoke-test or click through the app.
---

# Browser smoke — see the change working

A browser smoke is you driving the real stack in a real browser to check that what you just built looks right and works. It is **one-off**: it lives for this change and ends in a verdict, not in a test file, a journeys catalogue, or a committed report ([ADR-0034](https://github.com/wemuda/launchrail/blob/master/docs/adr/0034-browser-smoke-one-off-driving.md)). Deterministic coverage is the other lane — `npx @wemuda/launchrail verify` with the unit command and the thin Playwright e2e specs — and a smoke never grows it by accident.

## Preconditions

1. `.launchrail.yml` has `modules.browser-testing: true`. If not, stop and suggest `npx @wemuda/launchrail add browser-testing`.
2. The fast gate is green: `npx @wemuda/launchrail verify --fast`. A smoke runs on top of a green build; a red one is fixed first.
3. The app runs from **this** worktree: `node scripts/dev.mjs --background` (in a fresh clone, `node scripts/setup.mjs` first). Other builders may share the machine — pass `--port <n>` with a port nobody else uses. The script writes the URL to `.launchrail/state/dev.url` and the pid to `.launchrail/state/dev.pid`; read the URL from there rather than assuming `testing.appUrl`.
4. The driver is `agent-browser`, installed by `scripts/setup.mjs`: `npx agent-browser --version` must answer. If it does not, run setup; if it still cannot install, use the fallback below.

## The run

1. **Decide what to check.** From the ticket's acceptance criteria and your diff, write three to six steps for *this change*: where to start, what to click or type, what must be visible at the end. They live in your head and your handoff — never in a repository file.
2. **Drive them, one session per ticket.** `export AGENT_BROWSER_SESSION=<branch-or-ticket>` keeps your browser apart from other builders'. Then, from the shell:
   - `npx agent-browser open <url>` — start on the page the change lives on.
   - `npx agent-browser snapshot -i` — the interactive elements with refs (`@e1`, `@e2`, …).
   - `npx agent-browser click @e3`, `fill @e5 "text"`, `type`, `press Enter` — act as a user would.
   - `npx agent-browser wait --load networkidle`, `wait --text "Saved"`, `wait <selector>` — **after every action that triggers a request or opens a modal, wait before the next snapshot**; a snapshot taken too early is the usual false failure.
   - `npx agent-browser screenshot <path>` — and look at the image yourself (open it with the Read tool). Layout, copy, empty states, and wrong-but-rendering are what a script cannot judge; that judgment is the point of this lane.
   - `npx agent-browser errors`, `console`, `network requests` — after each step, not only at the end.
3. **Click around beyond the happy path.** The obvious wrong input, the empty state, a reload, the back button. You are looking for what the ticket did not spell out.
4. **The standard checks, every time:** no uncaught exceptions, no failed requests, the success state visible in a screenshot you looked at, the data still there after a reload.
5. **Design:** compare the screen to a design only when the ticket or spec names one (a `docs/design/` handoff, a mockup). Never invent a comparison.

## When something is wrong

1. Fix it.
2. Add the regression test at the **cheapest seam that would have caught it** — a unit or integration test first. A new Playwright spec under `tests/e2e/` only when the ticket asks for one or the behavior exists only in a real browser; the e2e lane stays thin, and a smoke never becomes a spec by default.
3. Re-drive the steps that failed.

## Done

- `npx agent-browser close`, and stop the app you started: `kill $(cat .launchrail/state/dev.pid)`.
- Your handoff states, in a few lines, what you drove and what you saw — that is the record. Nothing is committed for the smoke: no journeys file, no `artifacts/` bundle, no screenshots in the repo.
- A smoke you could not drive is a failure, not a pass. Never report one you did not run.

## Fallback — no driver

If `agent-browser` cannot be installed here, write a throwaway `playwright-core` script under `.launchrail/state/` (gitignored) that drives the same steps and prints what it saw, and run it with the project's Playwright. It stays there — it never moves under `tests/`, and it is no substitute for looking at the screenshots.
