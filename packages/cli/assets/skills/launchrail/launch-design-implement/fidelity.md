# The fidelity protocol — what "true to the prototype" means

A Claude Design prototype comes back as running code: real markup, real styles, a script that switches its screens and opens its modals. An implementation is *true* to it when every state the prototype can reach exists in the product and looks the same at the viewport the design was approved at — not when the first render resembles a screenshot. This file is the operational definition. `launch-design-implement` builds under it; `launch-design-handoff` uses §1 to inventory an interactive prototype; `launch-ralph-implement` follows it when a ticket names a `docs/design/<slug>/` package; `launch-browser-smoke`'s named design comparison is §4.

## Reading a Claude Design export

- **One file per canvas.** An export zip carries each canvas of the project as a self-contained HTML file (`<name>.dc.html` — inline styles and script, sometimes an `assets/` folder beside it). Its `<title>` or filename is the name the user refers to; an export usually holds *several* canvases, and only the one(s) the user names are the subject — the rest are context or earlier iterations. Never guess: list them, match the user's words, ask when two could fit.
- **One canvas can be a whole clickable prototype.** A single file may hold a page, its sub-pages, tabs, drawers, and modals, switched by its own script. Opened in a browser, it runs. Reading it means reading the markup, the stylesheet, *and* the script — not the first render.
- **Values live in the code.** Spacing, sizes, colors, radii, shadows, weights, line-heights, and copy are literal in the file — custom properties, utility classes, inline styles. Take them from there. When a value is indirect (a class chain, a computed layout), read it off the running prototype: `agent-browser get styles <sel>` for computed styles, `get box <sel>` for the rendered box.
- **The designed viewport** is the size the design was approved at: fixed dimensions on the canvas root or frame in the file, or what the user says ("1080p" is 1920×1080). Everything below is judged at that viewport; record it in `handoff.md` and `fidelity.md`.

## 1. The state inventory — every reachable state is in scope

A **state** is any distinct render the prototype can reach: a screen or sub-page; a tab; a modal, drawer, popover, menu, or tooltip; an expanded row or section; a filter, sort, or selection applied; a hover, focus, or active treatment the prototype styles; an empty, loading, error, long-content, or permission variant it shows; a step in a flow. Two states differ when a user would see a different screen.

**Find them twice** — the second pass catches what the first missed:

1. **Read the script and markup.** Hidden sections (`hidden`, `display: none`, off-canvas), class or `data-*` toggles, click handlers, anything that swaps content or routes between views. Every branch is a state.
2. **Drive the prototype.** Open the file in the browser at the designed viewport, `snapshot -i`, click every interactive element (re-snapshot after each click — refs die on re-render), scroll to the bottom of every screen, hover and focus what the styles treat. Every new render is a state; note exactly how you reached it.

**Record each state as a row:** an id (`S1`, `S2`, …), a name, its kind, how it is reached in the prototype (the click path from the initial render), and the *specifics that must match* — the elements, copy, and treatments particular to that state (a badge, an inline form, a disabled control, a count).

**The completeness rule.** A state the prototype reaches and the product doesn't is a deviation, never an omission — it stays on the table until built or explicitly accepted with a reason. A state the prototype does *not* show (a validation error it never renders, a width it isn't drawn at) is an open question for `handoff.md`, never invented: build what is shown, record what isn't.

## 2. Token and component maps — structure from the prototype, idiom from the project

- **Tokens.** Map each value the prototype uses to the project's design system only where `handoff.md` rules the divergence *intentional* and names the token — or where the value already equals the token. Any other value ships verbatim, marked `raw` in the record, until a ruling exists. Never substitute the nearest existing token, and never restyle the prototype toward what the product already has; where the design system must change to carry the prototype, change the design system (that is the ruling's meaning).
- **Components.** Map each prototype element to an existing component only when that component renders the state with no visible difference; otherwise a variant of it, or a new component. "No visible difference" is proven by the comparison in §4, never assumed from a name — an existing `Card` is not the prototype's card because both are called cards.
- **Structure.** Port the prototype's layout technique and dimensions (grid vs. flex, fixed vs. fluid, column widths, gaps) into the project's component model; do not re-derive a layout from a screenshot. Where the product's framework forces a different DOM, the *render* still has to match.

## 3. The data map — real or declared, never faked

Every visible datum in a state is one of:

- **sourced** — a real field, prop, or computation; name it;
- **placeholder** — sample content the prototype needed (names, dates, counts) that the real source replaces; and
- **missing** — shown by the prototype with no source in the product today.

Placeholder copy never ships in code. A **missing** datum is a decision, recorded before the build: a `decide-now` question for the user when it changes what the page promises (at most three per round, each with a recommended answer), otherwise an agent default — usually "build the layout; the element renders when the data exists" — written into the record as Provisional. Neither faking the value nor dropping the element silently is an option. The prototype is a decision record ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)): "as the prototype shows it" is the default answer to every question.

## 4. The side-by-side comparison — same state, same viewport, both looked at

Verification is you, looking at the prototype and the product in the same state at the same size, and saying whether they match. Nothing else counts as verified.

1. **Two browser sessions**, one viewport. `AGENT_BROWSER_SESSION=proto` for the prototype, `=app` for the product; `agent-browser set viewport <w> <h>` on each before the first `open`. The prototype opens from its committed file (`file://<absolute path to docs/design/<slug>/prototype/<canvas>.dc.html>`; if the driver refuses file URLs, serve the `prototype/` directory with any static server on a free port). The product runs from the stack `launchrail dev --background` started, with data seeded so every row is reachable.
2. **Per row:** drive the prototype to the state by its recorded path and `screenshot`; drive the product to the same state through its real UI and `screenshot`; open both images and compare. Where the eye cannot tell, measure: `get box` for positions and sizes, `get styles` for type, color, spacing, radius, shadow — on both sides, same element.
3. **Compare the state's specifics** (the row's "must match"), then the constants: layout and alignment; spacing rhythm; type family, size, weight, line-height; color of text, surfaces, borders; radii and shadows; iconography; copy, casing, and punctuation; the treatment of the interactive element that reached this state.
4. **Verdicts** — one per row, always current in the record:
   - `pending` — not yet built or not yet compared;
   - `match` — no visible difference at the designed viewport (sub-pixel and font-rendering noise is not a difference; a different font family, weight, or size is);
   - `deviation` — a visible difference, described: what, where, and why it is there — to be fixed and re-captured;
   - `accepted` — a deviation kept on purpose, with its concrete reason (data that does not exist, a platform constraint, the user's call) and who accepted it; "close enough" is not a reason;
   - `unverified` — built but not compared on screen (no browser available); reported as such, never as done.
5. **The checks the smoke always runs**, on the product side: no uncaught exceptions, no failed requests, the state still correct after a reload.
6. **One narrower width**, once, on the product only — to catch overflow, clipping, and wrapped controls. Fidelity is judged at the designed viewport; behavior at other widths the prototype doesn't draw is an open question, not a deviation.

**Captures** live under `.launchrail/state/design/<slug>/` as `<row-id>.proto.png` and `<row-id>.app.png` (the directory ignores itself once `launchrail dev` has run; if it doesn't exist yet, create it with a `.gitignore` containing `*`). They are regenerable from the committed prototype and the running product, so they are never committed — the prototype file is the durable reference, the record below is the durable verdict.

## 5. The record — `docs/design/<slug>/fidelity.md`

Project-owned, written *before* the build with every row `pending` and kept current until every row is `match` or `accepted`. It sits beside `handoff.md`: the handoff says what the design is and decides; this file says what was built against it and how it was proven.

```markdown
# Fidelity — <canvas name>

Canvas: `prototype/<file>.dc.html` · Viewport: 1920×1080 · Revision: <date> (<zip or export name>)
Built on: <branch> · Routes: <product routes or pages this canvas maps to>

## States

| Id | State | Reached in the prototype by | In the product at | Component / file | Verdict | Note |
|---|---|---|---|---|---|---|
| S1 | Issue detail — default | initial render | `/issues/:id` | `IssueDetail.tsx` | match | |
| S2 | Trace tab, row expanded | Trace tab → first row | `/issues/:id?tab=trace` → click row | `TraceRow.tsx` | deviation | expanded row misses the 1px divider (#E5E7EB) — fixing |
| S3 | Assign modal | header → Assign | header → Assign | `AssignDialog.tsx` | accepted | search field omitted: no user search endpoint yet (user, 2026-09-17) |

## Tokens

| Prototype value | Used for | Project token | Ruling |
|---|---|---|---|
| `#2563EB` | primary action | `--color-primary` | equal |
| `14px / 500` | meta labels | — | raw (no ruling in handoff.md) |

## Data

| Shown | Source | Decision |
|---|---|---|
| assignee avatar | `issue.assignee.avatarUrl` | sourced |
| "captured" badge on request body | `issue.serverContext.requestBody` | sourced — renders only when present (Provisional) |

## Accepted deviations
- S3 — search field: no user search endpoint; the modal lists members without a filter. Accepted by the user, 2026-09-17. Reopens when the endpoint lands.

## Verification
<date> — <n> of <m> states match, <k> accepted, 0 pending; gates: `verify --fast` green, `verify` green; standard checks clean.
```

Revising the canvas later (a new export) updates this file in place: bump the revision line, reset the rows the diff touched to `pending`, and re-run §4 on every row — a re-export can move things the diff doesn't name.
