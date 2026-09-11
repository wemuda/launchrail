---
name: launch-browser-smoke
description: Drive the running app in a real browser to see a just-built change working — a one-off, agent-driven check of the feature, not a test suite and not an evidence bundle. Use before declaring user-facing work done when .launchrail.yml has modules.browser-testing enabled, or when the user asks to smoke-test or click through the app.
---

# Browser smoke — see the change working

A browser smoke is you driving the real stack in a real browser to check that what you just built looks right and works. It is **one-off**: it lives for this change and ends in a verdict, not in a test file, a journeys catalogue, or a committed report ([ADR-0034](https://github.com/wemuda/launchrail/blob/master/docs/adr/0034-browser-smoke-one-off-driving.md)). Deterministic coverage is the other lane — `npx @wemuda/launchrail verify` with the unit command and the thin Playwright e2e specs — and a smoke never grows it by accident.

The stack you drive starts through the CLI, never through a hand-adapted script ([ADR-0036](https://github.com/wemuda/launchrail/blob/master/docs/adr/0036-cli-owned-stack-start.md)): `launchrail dev` owns the start command, the readiness wait, the state files and the driver's browser, so what this skill relies on is the same in every project.

## Step zero — a fresh clone has nothing installed

A hosted session (`CLAUDE_CODE_REMOTE=true`) is always a fresh clone, and a missing `node_modules` fails every later step with a misleading error. Run `node scripts/setup.mjs` first, unconditionally, in any hosted session and whenever `node_modules` is missing. It installs dependencies, Playwright's Chromium, and `agent-browser`.

## Preconditions

1. `.launchrail.yml` has `modules.browser-testing: true`. If not, stop and suggest `npx @wemuda/launchrail add browser-testing`.
2. **The gate, proportionate.** If `testing.checkCommand` is set, run `npx @wemuda/launchrail verify --fast` and fix red before smoking. If it is not set, do **not** run the full suite as a stand-in; say in your handoff that no fast gate is configured and the smoke ran without one (`launch-loop-readiness` sets it). Inside a Ralph dispatch the fast gate already ran before this step.
3. **Start the stack from the manifest:** `npx @wemuda/launchrail dev --background` (add `--port <n>` with a port nobody else uses when other builders share the machine). It runs `smoke.start`, else `testing.devCommand`, waits until every origin answers, and writes `.launchrail/state/stack.json` (origins, pid, log — plus whatever a composed start command adds: keys, fixture ids, a mailbox path), `dev.url`, `dev.pid`, and `browser.env`. Read your URLs from `stack.json`; never assume `testing.appUrl`.
4. **If the stack cannot start from the manifest, the smoke is blocked — do not rebuild the stack by hand inside a ticket.** Frontends that come up without their backend, a start command that needs Docker, a page that says "not configured": these mean the project has no `smoke.start` for its composed stack. Report the smoke as blocked with the exact gap, and point at [composed-stack.md](composed-stack.md) — the fix is a start command plus a manifest entry, proven once with `launchrail dev --check`, not fifteen tool calls of archaeology in every smoke.
5. **The driver.** `set -a; . .launchrail/state/browser.env; set +a` before the first `agent-browser` command: it points the driver at Playwright's Chromium and, in a root container, turns the sandbox off. Then `npx agent-browser --version` must answer. Sharp edge: the env vars are the reliable form — `--executable-path` is ignored once a daemon is running and only warns, so a first `open` can look fine and the next `snapshot` fail with "Chrome not found". Change the browser only after `npx agent-browser close`. If no Chromium resolves at all, `npx agent-browser install` fetches its own; if the driver still cannot run, use the fallback at the end.

## The run

1. **Decide what to check.** From the ticket's acceptance criteria and your diff, write three to six steps for *this change*: where to start, what to click or type, what must be visible at the end. They live in your head and your handoff — never in a repository file.
2. **Drive them, one session per ticket.** `export AGENT_BROWSER_SESSION=<branch-or-ticket>` keeps your browser apart from other builders'. Then, from the shell:
   - `npx agent-browser open <url>` — start on the origin the change lives on, from `stack.json`.
   - `npx agent-browser snapshot -i` — the interactive elements with refs (`@e1`, `@e2`, …). **Refs die with navigation:** re-snapshot after every `open`, reload, or route change before clicking anything.
   - `npx agent-browser click @e3`, `fill @e5 "text"`, `type`, `press Enter` — act as a user would. Prefer refs, or role-based finds, over text finds: a text find for a word that appears in a menu can open the menu instead of the control you meant.
   - `npx agent-browser wait --load networkidle`, `wait --text "Saved"`, `wait <selector>` — **after every action that triggers a request or opens a modal, wait before the next snapshot**; a snapshot taken too early is the usual false failure. **Success toasts auto-dismiss:** a `wait --text` on one can time out on a success that did happen, so confirm the outcome through `network requests` (the request and its status) or the resulting state, not the toast alone.
   - `npx agent-browser screenshot <path>` — and look at the image yourself (open it with the Read tool). Layout, copy, empty states, and wrong-but-rendering are what a script cannot judge; that judgment is the point of this lane.
   - `npx agent-browser errors`, `console`, `network requests` — after each step, not only at the end. `errors` is uncaught exceptions only; `console` carries the page's own error logs.
3. **Click around beyond the happy path.** The obvious wrong input, the empty state, a reload, the back button. You are looking for what the ticket did not spell out.
4. **The standard checks, every time:** no uncaught exceptions, no failed requests, the success state visible in a screenshot you looked at, the data still there after a reload.
5. **Design:** compare the screen to a design only when the ticket or spec names one (a `docs/design/` handoff, a mockup). Never invent a comparison.

## When something is wrong

1. Fix it.
2. Add the regression test at the **cheapest seam that would have caught it** — a unit or integration test first. A new Playwright spec under `tests/e2e/` only when the ticket asks for one or the behavior exists only in a real browser; the e2e lane stays thin, and a smoke never becomes a spec by default.
3. Re-drive the steps that failed.

## Done

- `npx agent-browser close`, then `npx @wemuda/launchrail dev --stop`.
- Your handoff states, in a few lines, what you drove and what you saw — that is the record. Nothing is committed for the smoke: no journeys file, no `artifacts/` bundle, no screenshots in the repo. Everything you wrote lives under `.launchrail/state/`, which ignores itself in git.
- A smoke you could not drive is a failure, not a pass. Never report one you did not run.

## Fallback — no driver

If `agent-browser` cannot run here even after `browser.env` and `install`, write a throwaway `playwright-core` script under `.launchrail/state/` that drives the same steps and prints what it saw, and run it with the project's Playwright. It stays there — it never moves under `tests/`, and it is no substitute for looking at the screenshots.
