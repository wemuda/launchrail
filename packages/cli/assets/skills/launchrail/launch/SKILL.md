---
name: launch
description: The planning conductor and single entry point to the Launchrail loop. Detects how far a project has moved from idea toward release — setup, vision, visual exploration, discovery, grill, research, ADRs, spec, design validation, tickets — then runs or routes to the stage that owns the next step, and hands implementation to /launch-implement. Reports position as six phases with an explicit rail banner at every transition. Once the foundation exists it also sizes each new feature (large / semi / small) and routes the planning subset that size needs. Use to start or continue the workflow, ask what stage or phase a project is at, size a new feature, or jump straight to a named stage.
---

# Launch — the loop conductor

One command for the whole rail. You are the **conductor**, not a stage: find where the project sits, then run or hand off to the skill that owns the next step. Every stage has exactly one owner; [`workflow.md`](workflow.md) is the contract for who owns what, for the phase view and rail banner, for the interaction contract, and for the conductor rules — compose owners by name, gate on committed artifacts, prepare handoffs for user-typed stages, keep detection read-only. Follow those rules; this file only tells you how to route.

**You are also the handrail.** The user sees the rail as **six phases** — Intent (stages 0–1) → Exploration (2–3) → Decisions (4–6) → Blueprint (7–9) → Build (10) → Ship (11–12) — and every time you orient, route, or resume, you render the **rail banner** from `workflow.md`'s phase view: phase m of n, Done / Now / Next / Later, one `➤` next action. Stages are your working vocabulary; phases and the banner are the user's. Never replace the banner with loose prose.

## The stage map

Read `.launchrail.yml` (`origin`, `modules`, `issueTracker`) first — it is the source of truth for configuration; `npx @wemuda/launchrail status` for what's installed and current.

| # | Stage | Owner (invoke / run) | Done when |
|---|---|---|---|
| 0 | Setup | `npx @wemuda/launchrail init` | Manifest + lockfile committed; `doctor` green (`docs/agents/` is seeded by init) |
| 1 | Vision | `launch-vision-creation` — via `launch-project-alignment` when `origin: existing` | `docs/vision.md` exists and is real (not the bare template) |
| 2 | Visual exploration | Claude Design | Exploration artifacts linked from `docs/vision.md` |
| 3 | Discovery | `launch-discovery` | Landscape map committed under `docs/research/` (`discovery-*.md`) |
| 4 | Complexity grill | `launch-grill` | Grill constraints committed under `docs/research/` |
| 5 | Technical research | `launch-research`, fed the grill constraints | Research notes committed under `docs/research/` |
| 6 | Architecture decisions | ADRs (`docs/adr/0000-template.md`) | `docs/adr/NNNN-*.md` beyond the template |
| 7 | MVP specification | `launch-wayfinder` / `launch-spec` † | A spec exists — a `spec`-labeled issue on the tracker, or a `docs/specs/` file in local mode (read `docs/agents/issue-tracker.md`) |
| 8 | Design validation | `launch-design-validation` (fidelity chosen inside the skill) | The spec carries a `## Design validation` section (a recorded skip counts) |
| 9 | Tickets | `launch-tickets` † | Tracker has `ready-for-agent` tickets with `Blocked by: #n` edges |
| 10 | Implementation | `/launch-implement` † — drives the Ralph loop | The ready frontier is drained; PRs merged and verified |
| 11 | Verification | `npx @wemuda/launchrail verify` · `launch-browser-smoke` | The gate is green; smoke evidence where behavior is user-facing |
| 12 | Release | The project's release setup | The release is cut |

† User-typed (`disable-model-invocation`): prepare the handoff — inputs committed, exact fully-argumented command handed over, resume when the artifact lands (see the conductor rules). Never call one and get refused, and never reverse-engineer it.

`deep-research` = stages 3 → 4 → 5 as one arc: discovery widens the option space, the grill narrows it, research de-risks what survives. The workflow doc's stage notes carry the judgment calls for stages 3, 4, 8, and 10.

## Sizing the next feature

Once the foundation exists (a real vision, ADRs beyond the template) and the user brings **one new feature**, the frontier question changes from "what stage is next" to "how much planning does this feature deserve." Size it — propose with your reasoning, let the user correct you; they see scope the artifacts don't show:

| Size | Looks like | Planning path |
|---|---|---|
| **Large** | A new subsystem or cross-cutting change; real unknowns; decisions worth an ADR | discovery *(new tech territory only)* → `launch-wayfinder` → grill → `launch-spec` → design validation → `launch-tickets` |
| **Semi** | Self-contained feature, some design surface, a handful of tickets | grill → `launch-spec` → design validation *(optional)* → `launch-tickets` |
| **Small** | Well-understood change, little or no design surface, one or few tickets | grill → `launch-tickets` |

Judgment calls: the grill here is feature-scoped (same `launch-grill`, narrower brief); discovery earns a place only when the feature opens genuinely new tech territory — a vendor category or storage engine the project hasn't used; design validation is for real UI surface; a genuine architecture decision gets an ADR before tickets. Between two sizes pick the smaller — it's cheaper to add a stage than to over-plan a small change. Every size ends at `/launch-implement`. The sized path is also the feature's **banner path**: its phases are counted against that path (a semi feature's grill opens as "Phase 1 of 3: Decisions"), so progress reads against what will actually happen, not the full foundation rail.

A feature that arrives **design-first** — a dropped zip or folder of Claude Design artboards, "here is the prototype of X" — routes through `launch-design-handoff` before sizing: it commits the package under `docs/design/<slug>/` and proposes a size; sizing then consumes its `handoff.md` as the feature brief, the grill takes the doc's open questions as its agenda, the spec cites the package as its UX/UI reference, and design validation usually becomes a recorded skip citing it.

## Running it

1. **Did the user name a stage or a feature?** A stage keyword (below): sanity-check its inputs exist, offer the earlier stage if one is missing, but honor the jump if they insist — then invoke or hand off and stop. A new feature on a founded project: size it (above) and run the path.
2. **Otherwise orient, then find the frontier.** A cheap read-only look first: `git status`, current branch, recent commits — is something already in flight for the stage you're about to start? If the tracker is configured and reachable, read the live discussion on relevant tickets and PRs, not just titles; skip what isn't there (orientation sharpens routing, never gates it). Then close stage-0 gaps yourself without asking (init, commit init output, `sync` — it seeds `docs/agents/` too). Walk stages 1 → 12 and stop at the first whose "done when" fails, skipping only what the vision's non-goals record as deliberately skipped. `origin: existing` with no real vision → route to `launch-project-alignment`, not a blank vision.
3. **Confirm the read — with the banner.** Render the rail banner for the position you detected, then say why — which artifacts you found and which you didn't. Ambiguous signals (template-only vision, several specs) are questions, not guesses.
4. **Route.** Invoke the owner by exact name, or prepare the handoff for a user-typed stage (†). For stage 7, name the authoritative inputs in order; if the stack isn't stood up yet, tell it to name its seams but leave harness mechanics to the foundation work. For stage 10, hand over `/launch-implement` — never start it yourself.
5. **Close every transition with the banner.** When a stage finishes or a handoff is prepared, re-render the banner — the just-closed artifact under Done, the next mover under Now, the `➤` line carrying the one next action (the exact fully-argumented command when the stage is user-typed). Add a sentence on what the next stage does and whether it's optional here, and that any stage is reachable by keyword — a bare stage name reads as a turnstile; explain, don't gate.

## Stage keywords

Case-insensitive direct jumps:

- `status` / `where` — render the rail banner for the detected position (with the evidence) and stop.
- `next` — detect the frontier and drive it (the default).
- `setup` / `init` — 0 · `align` / `adopt` — the existing-project on-ramp · `vision` — 1 · `explore` — 2 · `discovery` / `landscape` — 3 · `grill` — 4 · `research` — 5 · `deep-research` — 3→5 · `adr` / `architecture` — 6 · `spec` — 7 · `design-validation` / `validate` — 8 · `tickets` — 9 · `implement` / `build` / `ralph` / `loop` — hand over `/launch-implement` · `verify` / `smoke` — 11 · `release` — 12 · `handoff` / `design-handoff` — the design→code on-ramp (`launch-design-handoff`).
- `feature` / `size` — size a described feature (recommend a path; route on request).

Unrecognized keyword → show this list and ask.

## Deliberate skips

Skip nothing silently. A stage may be skipped only when the vision's non-goals record the skip — then honor it and don't nag. When a stage looks skipped, check the vision's non-goals before deciding — and if you can't tell, ask.
