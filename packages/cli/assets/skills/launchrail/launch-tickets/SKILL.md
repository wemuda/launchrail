---
name: launch-tickets
description: Break a validated spec, plan, or the current conversation into tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker with the ready-for-agent label — the exact input contract the implementation loop's frontier is computed from. Owns stage 9.
disable-model-invocation: true
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# To tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it. The output is the implementation loop's input: open tickets wearing `ready-for-agent` with explicit `Blocked by: #n` edges are the frontier `/launch-implement` drives.

The issue tracker configuration lives in `docs/agents/issue-tracker.md`, seeded by `launchrail init` from the manifest — `npx @wemuda/launchrail sync` re-seeds it if it's missing.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference as an argument, fetch it and read its full body and comments. The reference names wherever the spec lives — a `spec`-labeled issue on the tracker (number or URL), or a spec path under `docs/specs/` in local mode ([ADR-0025](https://github.com/wemuda/launchrail/blob/master/docs/adr/0025-spec-home-follows-tracker.md)). A spec that ran design validation carries a `## Design validation` section — the revised spec is the one to ticket.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary (`CONTEXT.md`), and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker configured in `docs/agents/issue-tracker.md` — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, GitLab, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's edges reference real identifiers. Wire every blocking edge and any parent as the tracker's **native relationship** — GitHub/GitLab issue dependencies and sub-issues, Linear's blocked-by and sub-issue relations — the canonical, UI-visible form the implementation loop's frontier reads. The body's `Parent` / `Blocked by` lines then only mirror it, becoming the gate itself only on a tracker that lacks the native relationship. When the spec is itself a `spec`-labeled issue on the tracker ([ADR-0025](https://github.com/wemuda/launchrail/blob/master/docs/adr/0025-spec-home-follows-tracker.md)), it **is** the parent — link each ticket to it through that same native sub-issue relation. `docs/agents/issue-tracker.md` carries the exact per-tracker API. Apply the **`ready-for-agent`** label unless instructed otherwise — the tickets are agent-grabbable by construction. Only tickets wear that label: the spec issue keeps its `spec` label, or the loop will dispatch the document as work.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue. Each new ticket is closed later by its own implementing PR (`Closes #n`, per the tracker doc's Issue ↔ PR linkage), not by hand here.

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue — mirrors the native parent/sub-issue link (omit this section if there is no parent).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

**Blocked by:** #n, #n — one line mirroring the native blocking relationship (the canonical gate), or "None — can start immediately". Where the tracker has no native dependencies, this line *is* the gate.

</issue-template>

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.
