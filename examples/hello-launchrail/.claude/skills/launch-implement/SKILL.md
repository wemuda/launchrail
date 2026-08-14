---
name: launch-implement
description: Start building — the one door to implementation (stage 10). Renders the ticket dependency graph as ASCII in the chat, then drives the ready tickets to verified merges through the Ralph loop, watchable in this session. `/launch-implement` builds the whole ready frontier; `/launch-implement 15` scopes it to one ticket; several numbers, "the next 5", or "spec #2's tickets" scope and cap a run. Repairs its own setup instead of stopping. Only ever started explicitly by the user.
disable-model-invocation: true
---

# Implement — the one door to building

Planning produced tickets; this door turns them into merged, verified code. There is **one engine — the Ralph loop** (`launch-ralph`, the parallel orchestrator) — and one job here: show the graph, then start it. Don't deliberate over which engine or which path; there is only one. Read two things, draw the graph, launch. The loop self-corrects as it runs — getting started is worth more than getting the plan perfect.

## Just start

1. **Read two things, once.** From `.launchrail.yml`: `issueTracker` and the `testing` commands. From the arguments: the scope — default is the whole ready frontier. Scope forms, briefly: one number = that ticket; several numbers = just those; "the next 5" / "max 5" = a cap (the frontier picks which, in dependency order); "spec #2's tickets" / "the rest of slice 1" = resolve to the open ticket numbers that belong to it against the live tracker, plus any open in-set blockers so the scope stays dependency-closed. Echo the resolved scope in one line — then move.

2. **Render the dependency graph in the chat** (format below). Read the scoped `ready-for-agent` tickets and their verbatim `Blocked by: #n` edges and draw them as a compact ASCII graph, so the user sees the plan before anything builds. This is the one "look before you leap" — a wrong scope or a surprise edge is caught here for the price of a sentence.

3. **Start the loop.** Hand the resolved scope to **`launch-ralph`** and run it **watchably in this session** — you see each dispatch build and can interrupt. For a long, wide, or walk-away run, launch its workflow form instead (`.claude/workflows/ralph.js`, scope as JSON args like `{ only: [14, 15, 19], max: 5 }`); `launch-ralph` owns that call and its supervision contract. **One ticket** (`/launch-implement 15`) is not a separate path: invoke **`launch-ralph-implement`** on that number right here — dependency-gate first — then open the PR, merge, and confirm the merge and closed issue on the remote. Name the skills; never paraphrase their contracts inline.

**Repair, don't gatekeep.** If the loop's materials are missing — `modules.ralph` off in the manifest, or `.claude/workflows/ralph.js` absent — run `npx @wemuda/launchrail sync` first (additive, idempotent; its migration installs them) and say what it did. Never answer "build this" with "go run a command." What you genuinely cannot repair, name plainly: no tracker (`issueTracker: none`), or an empty `testing` contract — `verify` can't gate an empty contract, so the loop refuses a start it cannot verify.

## Rendering the graph

Group the scoped tickets into **tiers** by dependency depth: tier 1 is every scoped ticket whose blockers are all settled (closed, or outside the scope); each later tier holds tickets whose blockers all sit in earlier tiers. Annotate each ticket with `←` its still-open blockers and `→` the scoped tickets it unblocks. Keep it compact — this is a plan preview, not an art project.

```
Ralph loop — scope: slice-1 (6 tickets) · cap: none · 3 buildable now

Tier 1 — buildable now
  #11  Auth data model        → #14, #15
  #12  Database schema        → #16
  #13  Structured logging     ·

Tier 2 — after tier 1
  #14  Login API              ← #11   → #19
  #15  Session store          ← #11
  #16  Schema migrations      ← #12

Tier 3
  #19  Login screen           ← #14
```

Then flag whatever the shape reveals, in a line under the graph: a scoped ticket blocked by an **open** ticket outside the scope (it will defer until that lands — name it), an edge that resolves to no real ticket, or a cycle (stop and report — the loop cannot order a cycle). A single-ticket scope is just that ticket with any open blockers stacked above it.

## Ground rules

- **Only the user starts this.** Conductors and other skills hand over the command (`/launch-implement`); they never invoke it. The never-unprompted rule holds through the door into the engine — reaching Ralph through this door *is* the explicit user start.
- **Nothing is done until `npx @wemuda/launchrail verify` is green** — per ticket, and once more on the final base when a loop run ends. Where `modules.browser-testing` is enabled and the change is user-facing, a `launch-browser-smoke` journey is part of done.
- **Report evidence, not assertions:** PR numbers, merge commits, issues closed, the verify outcome — and what was parked or punted, with why.
