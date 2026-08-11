---
name: start-feature
description: Start a new feature on an already-founded project and drive it through the delivery loop. Sizes the feature (large / semi / small), then routes to the planning subset that size needs — complexity grill, wayfinder, to-spec, design validation, to-tickets — before handing off to the project's selected implementation loop (Ralph by default) and verification. Use to begin or continue one feature once the project's foundation (vision, ADRs) exists. It composes the stage owners and never reimplements them; for a brand-new project with no vision yet, use launch instead.
---

# Start feature — the delivery-loop conductor

Sibling to `launch`. Where `launch` takes a fresh project from idea to its first release, **start-feature drives one feature through the delivery loop** on a project whose foundation already exists. You are the **conductor**: size the feature, run or route to the planning skills the size calls for, then hand off to the project's selected implementation loop (Ralph by default) and verification. Every stage is owned by exactly one tool — a Launchrail skill, an upstream Matt Pocock skill, or a CLI command. Route to them; never reimplement them.

## When this skill, when `launch`

- **No real vision or ADRs yet** — the project isn't founded. Use `launch` (or `launchrail:project-alignment` for an existing codebase), then come back per feature once the foundation is committed.
- **Foundation exists, you're adding the next feature** — this skill.
- `launch` still works per feature — it detects the frontier and routes. start-feature is the same rail with the *sizing* decision pulled to the front, so a small change doesn't get a large change's pipeline.

## Ground rules (the loop's, unchanged)

- **Compose, never duplicate.** Invoke each owner by its exact name; don't paraphrase, wrap, or re-prompt it. [`docs/workflow.md`](../../docs/workflow.md) stays the contract for who owns what.
- **Artifacts gate stages, not chat memory.** A stage counts done only when its committed artifact exists — read the repository, don't trust this session.
- **Sizing and detection are read-only.** Every write happens inside the skill or CLI command you route to.
- **Everything the loop produces is project-owned** — feature spec, ADRs, tickets. Launchrail tooling never overwrites them.
- **Never start the implementation loop unprompted.** Stage 10 is user-invoked only, whichever loop the project selected (`.launchrail.yml` `implementationLoop`; default `ralph`). Route to it and explain; do not launch it yourself.

## Step 1 — Frame the feature

Get a sentence or two on what this feature is and the outcome it delivers. If the user just says "start a feature" with nothing more, ask for that first — sizing needs it. Then confirm the foundation exists (a real `docs/vision.md`, ADRs beyond the template). If it doesn't, say so and route to `launch`; this skill assumes the rails are already down.

## Step 2 — Size it

Size is the one decision this skill adds. Read the feature's shape, **propose a size with your reasoning, and let the user correct you** — they see scope the artifacts don't show.

| Size | Looks like | Planning path |
|---|---|---|
| **Large** | A new subsystem or cross-cutting change; real unknowns; decisions worth an ADR; breaks into many tickets | discovery *(new tech only)* → `wayfinder` → grill → `to-spec` → design validation → `to-tickets` |
| **Semi** | A self-contained feature with some design surface; a handful of tickets; moderate unknowns | grill → `to-spec` → design validation *(optional)* → `to-tickets` |
| **Small** | A well-understood change; little or no design surface; one or few tickets | grill → `to-tickets` |

Judgment calls:

- The grill here is **feature-scoped**, not the project-wide foundation grill — same skill (`grill-with-docs`), narrower brief.
- **wayfinder** earns its place only when the feature is big enough to need breaking down; for semi and small, go straight to the grill.
- **discovery** — the divergent option-space scan (foundation stage 3) earns a place on a feature only when it opens genuinely new tech territory: a new vendor category, storage engine, or integration the project hasn't used. A feature that stays within the chosen stack skips it — the options are already settled.
- **design validation** is for features with real UI surface — expected on large when it touches the interface, optional on semi, skipped on small.
- If the grill or spec surfaces a genuine architecture decision, record an **ADR** (`docs/adr/`) before tickets — a feature can move the architecture too.
- Between two sizes, pick the smaller and say why. It's cheaper to add a stage than to over-plan a small change.

## Step 3 — Calibrate for mode

The manifest's `mode` (`.launchrail.yml`) adjusts the path the size chose (same contract `launch` reads):

- `spike` — you may drop `to-spec` and design validation even on a semi; record the skip in the ticket or a feature note.
- `standard-mvp` — run the size's path as written.
- `high-rigor` — bump one notch: a semi gets design validation, each large decision gets an ADR, and design validation covers error and edge states, not just the happy path.

## Step 4 — Run the planning path

Walk the chosen path, invoking each owner by its exact name and gating on its committed artifact before the next:

- **wayfinder** (Matt Pocock) — break the feature into a navigable plan; feed its output to the spec.
- **grill** → Matt Pocock `grill-with-docs`, feature-scoped; its surviving constraints are the spec's brief.
- **spec** → Matt Pocock `to-spec`, committed under `docs/specs/`.
- **design validation** → `launchrail:design-validation` (spec + Claude Design → revised spec carrying a `## Design validation` section).
- **tickets** → Matt Pocock `to-tickets`. Tickets must carry `Blocked by: #n` edges and the `ready-for-agent` label; touch up the output if it lacks them — the implementation loop depends on both, whichever one the project selected.

## Step 5 — Hand off to the selected implementation loop

Once ready tickets exist, the feature is ready to build. Read `.launchrail.yml` `implementationLoop` (default `ralph`) and hand off to that loop — never pick one for the user, and never start it yourself. Launchrail owns both edges regardless of the loop: `ready-for-agent` tickets with `Blocked by: #n` edges go in, and Step 6's `launchrail verify` gate stands between every merge and done.

- `ralph` → explain the Ralph loop and let the user start it — `launchrail:ralph` (watchable) or the `ralph` workflow for wide or long runs (needs `launchrail add ralph`).
- `superpowers` → hand off to obra/superpowers' execution skills (experimental — say so, and point the user at its setup). The verification gate is unchanged (ADR-0016).

## Step 6 — Verify, then go around again

Completion is verification-gated: `npx @wemuda/launchrail verify`, plus a `launchrail:browser-smoke` evidence bundle where the browser-testing module is enabled and the feature is user-facing. When the feature has merged and verified, offer to start the next one — that's the loop.

## Keywords

Accept any of these as a direct jump (case-insensitive):

- `size` — size the described feature and stop: recommend a path, route nowhere.
- `grill` / `spec` / `validate` / `tickets` — jump to that owner for this feature (sanity-check its inputs exist first; offer to start earlier if one is missing).
- `implement` / `ralph` / `loop` — hand off to the selected implementation loop (explicit start).
- `verify` / `smoke` — the verification gate.

## Always leave a map

Whatever you route to, tell the user the feature's size, the planning path it implies, the current step, and the next — and that they can jump to any step by keyword.
