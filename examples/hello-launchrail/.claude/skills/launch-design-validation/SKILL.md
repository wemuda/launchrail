---
name: launch-design-validation
description: Validate an approved spec visually before implementation — at a confirmed fidelity level (recorded skip, flow-diagram artifact, screen-mockup artifact, or Claude Design), feed the findings back into a revised spec, and produce a handoff note for ticket creation. Use when a spec is drafted (a spec-labeled issue on the tracker, or a docs/specs/ file in local mode) and the user wants design validation, a visual review, or pre-implementation sign-off.
---

# Design validation

Coordinate the loop **spec → visual pass at the right fidelity → revised spec → handoff**. The goal is to catch "specified but wrong on screen" before implementation starts: flows that read fine in prose but collapse when a user has to click through them.

## The fidelity ladder

The stage runs at one of four levels, chosen per spec ([ADR-0016](https://github.com/wemuda/launchrail/blob/master/docs/adr/0016-design-validation-fidelity-ladder.md)):

| Level | What gets made | Made by |
|---|---|---|
| 1 · Recorded skip | Nothing driven; the `## Design validation` section records what was assessed and why | this skill |
| 2 · Flow diagrams | An artifact page of flow/state diagrams describing what is being made — entry points, steps, decision points, end states | this skill, in-session |
| 3 · Screen mockups | An artifact page showing the designs — mid-fidelity mockups of the key screens and the states the spec claims to handle (empty, loading, error) | this skill, in-session |
| 4 · Claude Design | High-fidelity designs of entire screens/pages | Claude Design — drive it, or hand off (see below) |

Every level answers the same question — does the specified behavior survive contact with a screen? — at increasing cost and resolution. Claude Design is reserved for level 4: full screens properly designed. The diagram and mockup artifacts of levels 2–3 are the session's own work.

## Ground rules

- The spec and everything this skill writes are **project-owned** artifacts. Revise the spec in place; never fork a parallel copy that can drift.
- Validate flows, not pixels. Even at level 4, this stage answers "does the specified behavior survive contact with a screen?", not "is the visual style final?".
- Every design finding must land in exactly one place: a spec revision, an ADR (if it changes an architecture decision), or an explicitly recorded rejection. Findings that live only in chat are lost.
- **Evidence is linked, not committed.** Levels 2–4 link their artifact pages / design artifacts from the spec's `## Design validation` section — the same way stage 2's exploration artifacts are linked from the vision. The committed gate stays the spec section itself; because every finding lands in the spec or an ADR anyway, the gate never depends on the links surviving. If the session cannot publish a linkable page, say so and link the most durable render it can produce — never leave the evidence chat-only.
- Do not start implementation from this skill. The output is a validated spec and a handoff note — tickets come next.

## Process

1. **Locate the spec.** Find the spec in its tracker-appropriate home — a `spec`-labeled issue on the tracker, or a file under `docs/specs/` in local mode (read `docs/agents/issue-tracker.md`; ask if there are several). Read it plus `docs/vision.md` and any grill/research artifacts it references, so validation happens against the product's constraints rather than in a vacuum.
2. **Extract the flows to validate.** From the spec, list the user-facing journeys it implies — entry point, steps, decision points, end state. Confirm the list with the user; three to six flows is the useful range for an MVP.
3. **Choose the level — recommend, then confirm.** Read the spec's design surface, recommend one level with a one-line reason, and let the user confirm or override across all four. The recommendation is **advisory, never a gate**: little or no design surface leans toward a recorded skip; a large or risky surface leans toward mockups or Claude Design with error and edge states covered — but the user owns the call. Never pick silently.
4. **Run the level.**
   - **Recorded skip** — go straight to step 7 and write the section as a recorded skip: date, what was assessed, why nothing needed driving.
   - **Flow diagrams** — build one artifact page of flow/state diagrams covering the confirmed flows, including the decision points and terminal states the spec claims.
   - **Screen mockups** — build one artifact page mocking the key screens and states per flow, including the empty, loading, and error states the spec claims to handle.
   - **Claude Design** — drive it flow by flow when the session can reach it. When it can't, prepare a fully-argumented handoff — the flows, the states each must show, links to the spec and vision, and any existing design-system baseline (see `project-alignment`) — hand it to the user to run, and resume when the design artifacts land. Never silently downgrade a level-4 choice to mockups; a downgrade is the user's decision.
5. **Harvest findings.** For each flow record: what the design confirmed, what it contradicted in the spec, and what the spec turned out to be silent on. Ambiguities count as findings. Findings at a low level are also a signal — if the diagrams alone surface deep uncertainty, recommend re-running a flow at a higher level before revising.
6. **Revise the spec.** Apply the accepted findings to the spec in place. If a finding invalidates an ADR, update or supersede that ADR in the same change. Note rejected findings and why in the handoff note, so the question does not resurface every review.
7. **Write the handoff note** at the end of the spec (section `## Design validation`) with: date, the level that ran, flows validated, links to the artifact pages / design artifacts, accepted changes, rejected findings with reasons, and open questions. This section is the evidence that validation happened — the ticket stage (`launch-tickets`) reads the spec as validated only if it is present.
8. **Hand off.** Confirm with the user that the revised spec is approved, save it in place — commit the file, or update the spec issue on the tracker — respecting the project's commit conventions, and point them at ticket creation as the next stage. See [`workflow.md`](../launch/workflow.md) for the full stage order.
