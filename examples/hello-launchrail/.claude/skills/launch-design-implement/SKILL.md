---
name: launch-design-implement
description: One invocation from a Claude Design export to a built page — drop the zip (or name a package already committed under docs/design/), name the canvas, and this skill packages it, writes the fidelity contract, builds the canvas from the prototype's own markup and styles state by state, and verifies it side by side against the running prototype in a real browser at the designed viewport before it counts as done. Use when the user wants a Claude Design prototype implemented as a redesign or a new page — "implement the issue detail prototype", "build this design", "make it look like the Claude Design version".
disable-model-invocation: true
---

# Design implement — build the prototype, not an impression of it

A design that comes back from Claude Design is running code: every screen, modal, and sub-page of the canvas, with exact spacing, type, color, and copy. Implementations "miss the mark" in six known ways — the agent reads screenshots instead of that code; builds the first render and skips the states behind clicks; normalizes the design toward the components and tokens the product already has; never puts the two side by side at the size the design was approved at; picks the wrong canvas from an export that holds several; and quietly drops or fakes data the prototype shows. This skill closes all six in **one invocation**: the user drops the export (or names a package already under `docs/design/`), names the canvas, and types the command — the skill packages the drop, writes the contract, builds **that one canvas** under the [fidelity protocol](fidelity.md) (what "true" means), and ends only when every reachable state of the prototype exists in the product and has been compared against it on screen. Nothing has to be run before it.

It is user-typed, like `/launch-implement`: only the user starts a build. `/launch-implement` stays the door for tickets; a ticket that names a design package follows the same protocol through `launch-ralph-implement`. Packaging is composed, never re-done here: `launch-design-handoff` owns the handoff package and is called for it on the way ([ADR design-fidelity-build](https://github.com/wemuda/launchrail/blob/master/docs/adr/2026-09-17-design-fidelity-build.md)).

## Ground rules

- **The prototype's code is the source of truth.** Values come from its markup and styles (or its computed styles in the browser), never from eyeballing an image. Screenshots verify; they never inform.
- **Every reachable state is in scope** — screens, tabs, modals, drawers, expanded rows, hover and focus treatments, the empty and error variants it draws. The state inventory is written before the first line of product code, and a state on it stays there until it is built or accepted with a reason.
- **Structure from the prototype, idiom from the project.** Port layout and values into the product's component model and styling system; reuse an existing component only when it renders the state with no visible difference; never restyle the design toward what exists. Where the design system must change to carry the prototype, change it.
- **Data is real or declared.** Every visible datum maps to a source, is marked placeholder, or is a recorded decision. Nothing is faked in product code; nothing is dropped silently.
- **Verified means compared.** The build is done when every row of the record is `match` or `accepted` after a side-by-side look at the designed viewport — a row you could not compare is `unverified` and is reported that way, never as done.
- **The interaction contract applies** ([`workflow.md`](../launch/workflow.md)): at most three questions per round, each with a recommended answer, and the prototype is a decision record — "as shown" is the default. Ask only what blocks a shown state.

## Step 0 — a fresh clone has nothing installed

In a hosted session (`CLAUDE_CODE_REMOTE=true`), or whenever `node_modules` is missing, run `node scripts/setup.mjs` first, unconditionally — it installs dependencies, Playwright's Chromium, and `agent-browser` (the `launch-browser-smoke` skill's step zero).

## Step 1 — Resolve the source, then echo it

1. **The package — made on the way.** The usual input is a fresh drop: a `.zip` export, an extracted folder, or artboard files in the session. Call the Skill tool with **`launch-design-handoff`** and tell it the package is for a faithful build — it unpacks in a scratch directory, names the canvases, reads and inventories the prototype, asks only its documenting questions, commits `docs/design/<slug>/` (`prototype/` verbatim plus `handoff.md`), and returns without sizing or routing; then continue here. Never unpack an export straight into the repo yourself, and never re-derive the package inline. When the user instead names a package already committed under `docs/design/<slug>/`, read its `handoff.md` and `prototype/` in full and skip the packaging.
2. **The canvas.** List every canvas in `prototype/` — each `.dc.html` (or artboard file) by its `<title>` and filename. Match the user's words to exactly one; when two could fit, ask (one question). Several canvases build in sequence, one contract each — never one blended contract.
3. **The viewport.** From `handoff.md`; else the fixed dimensions on the canvas root or frame; else ask — "1080p" is 1920×1080.
4. **The branch.** The session's designated working branch when the environment pinned one; otherwise `design/<slug>` from a fresh sync of the default branch. Push it before the first product change.
5. **Echo, once, before any code** — the one pre-build report, in the shape of `/launch-implement`'s scope echo: canvas and file; viewport; what it maps to in the product (routes or pages, each `new` or `changed` per `handoff.md`); the token rulings the handoff made; the branch. A misread canvas corrected here costs a sentence; corrected after the build it costs the build.

## Step 2 — Write the contract before the code

1. **Inventory the states** — [fidelity.md §1](fidelity.md): read the script and markup for every branch, then open the prototype in the browser at the designed viewport and click through everything, recording how each state is reached and what in it must match.
2. **Map tokens, components, and data** — [§2 and §3](fidelity.md). The handoff's intentional-vs-accident rulings decide which values become tokens; everything else ships verbatim and is marked `raw`. Each visible datum is sourced, placeholder, or missing.
3. **Write `docs/design/<slug>/fidelity.md`** from the [§5 template](fidelity.md) with every state `pending`, and commit it. The contract exists before the build so nothing can be narrowed quietly along the way — a state that is hard to build is a `deviation` to argue in the open, not a row that disappears.
4. **Ask what blocks a shown state — and nothing else.** Missing data that changes what the page promises; an interaction the prototype implies but cannot show (what a button does after the click it animates). Three questions per round at most, each with a recommended answer; everything reversible is an agent default written into the record as Provisional. Questions the prototype is silent on (states it doesn't draw) stay in `handoff.md`'s open questions for the grill; they don't gate this build. **One interview, not two:** when the package was made in this invocation, the handoff's documenting questions (the scope reading, a token divergence ruling, load-bearing copy) and these blocking questions share the same rounds and the same session budget — batch them, in that order, and let the prototype's authority answer everything it can.

## Step 3 — Build, state by state

1. **Order.** The main screen's default state first, then the rows in table order. Compare each row (Step 4) as soon as it is built — a build that compares once at the end finds its deviations when they are most expensive to fix.
2. **Port, don't reinterpret.** For each row, read the prototype's DOM and styles for that state — `agent-browser get styles <sel>` and `get box <sel>` on the running prototype when the stylesheet is indirect — and write the same structure and values in the project's idiom. A value changes only where a token ruling maps it. An existing component is reused only for an identical render; otherwise extend it with a variant or build the element.
3. **Replace, don't accumulate.** When a row replaces an existing design (an earlier redesign attempt, the old page), the replaced markup and styles go in the same change once the row matches — never two designs left behind for someone to reconcile.
4. **Wire real data.** Sourced data comes from the real field; placeholder copy from the prototype never ships; a missing datum follows its recorded decision. No sample data in product code, no `TODO` standing in for a state.
5. **Test what has behavior.** Tabs, expand/collapse, modal open and close, filters — the state logic gets a unit or component test at the cheapest seam. Tests written for the replaced design are updated deliberately, never deleted to get green.
6. **Push cadence.** Commit and push after every green step, as `launch-ralph-implement` does; the pushed branch is the checkpoint a lost session resumes from. Conventional Commits when the manifest says so.

## Step 4 — Verify side by side

The loop that makes the build true — [fidelity.md §4](fidelity.md):

1. **Start the product** from the manifest: `npx @wemuda/launchrail dev --background` (with `--port <n>` when builders share the machine), then `set -a; . .launchrail/state/browser.env; set +a`. Read the origin from `.launchrail/state/stack.json`. A stack `dev` cannot start is a blocker to report with the exact gap (see the smoke skill's `composed-stack.md`), not something to rebuild by hand here. Seed whatever data every row needs to be reachable.
2. **Two sessions, one viewport.** `AGENT_BROWSER_SESSION=proto` opens the committed prototype file (`file://…/docs/design/<slug>/prototype/<canvas>.dc.html`; a static server on the `prototype/` directory if the driver refuses file URLs); `AGENT_BROWSER_SESSION=app` opens the product. `agent-browser set viewport <w> <h>` on both before the first `open`.
3. **Per row:** drive the prototype to the state by its recorded path, `screenshot` it to `.launchrail/state/design/<slug>/<id>.proto.png`; drive the product to the same state through its real UI, `screenshot` to `<id>.app.png`; open both images with the Read tool and compare the row's specifics, then the constants — layout, spacing, type, color, radii and shadows, icons, copy. Measure with `get box` and `get styles` where the eye can't tell.
4. **Record the verdict** in `fidelity.md` — `match`, or `deviation` with what and why — fix the deviation, re-capture, repeat. `accepted` only with a concrete reason and who accepted it; "close enough" is a deviation.
5. **The standard checks** on the product side after the rows: `errors`, `console`, `network requests`, a reload. Then one narrower width, once, for overflow and clipping — never to judge fidelity.
6. **Close the browsers**: `npx agent-browser close` for each session, `npx @wemuda/launchrail dev --stop`.

Captures are regenerable and never committed; `.launchrail/state/` ignores itself. If no browser can run here — `modules.browser-testing` off, or the driver and its fallback both unavailable — the build is **unverified**: mark every compared-nothing row `unverified`, say so in the close, and recommend `npx @wemuda/launchrail add browser-testing`; the throwaway `playwright-core` script the smoke skill describes can still capture both sides when only the driver is missing.

## Step 5 — Gate, record, close

1. `npx @wemuda/launchrail verify --fast`, then the full `npx @wemuda/launchrail verify` — green before any PR. Call the Skill tool with `launch-code-review` and fix what it finds.
2. Finalize `fidelity.md`: every row `match` or `accepted`, the accepted deviations listed with reasons, the data decisions, the verification line (counts, gates, checks). Commit and push it with the build.
3. **The change ships as a PR of its own** — a single-scope build, so its base is the default branch (or the pinned designated branch): open the PR per the environment's rules, `Closes #n` when a ticket exists. Never merge it yourself.
4. **Report evidence, not assertions:** states matched, accepted deviations with their reasons, anything unverified, gate outcomes, the PR. Then the rail banner ([`workflow.md`](../launch/workflow.md)'s phase view): the canvas under Build ✓ and Ship — verification and release — as what remains; the `➤` line carries the one next action.

## Iterating — a new export of the same canvas

The user goes back to Claude Design, changes the canvas, and drops a new zip. Call `launch-design-handoff` to revise the package in place (same slug, dated revision note, the prototype file replaced), `git diff` the prototype file to see what moved, reset the touched rows to `pending`, rebuild them — and re-run Step 4 on **every** row: a re-export can shift what the diff doesn't name.
