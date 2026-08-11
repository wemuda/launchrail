---
name: design-validation
description: Validate an approved spec visually before implementation — drive the spec's key flows through Claude Design, feed the findings back into a revised spec, and produce a handoff note for ticket creation. Use when a spec in docs/specs/ is drafted and the user wants design validation, a visual review, or pre-implementation sign-off.
---

# Design validation

Coordinate the loop **spec → Claude Design → revised spec → handoff**. The goal is to catch "specified but wrong on screen" before implementation starts: flows that read fine in prose but collapse when a user has to click through them.

## Ground rules

- The spec and everything this skill writes are **project-owned** artifacts. Revise the spec in place; never fork a parallel copy that can drift.
- Validate flows, not pixels. This stage answers "does the specified behavior survive contact with a screen?", not "is the visual style final?".
- Every design finding must land in exactly one place: a spec revision, an ADR (if it changes an architecture decision), or an explicitly recorded rejection. Findings that live only in chat are lost.
- Scale to the spec's design surface. A UI-heavy spec gets the full flow pass. An API-, schema-, or infrastructure-heavy spec may have only a screen or two — validate just those and record the rest as having no design surface. When there is genuinely nothing to drive, write the `## Design validation` section anyway as a recorded skip (date, what was assessed, why nothing needed driving): the section is the artifact the ticket stage gates on, and a skip that lives only in chat re-opens the question every review.
- Do not start implementation from this skill. The output is a validated spec and a handoff note — tickets come next.

## Process

1. **Locate the spec.** Find the spec under `docs/specs/` (ask if there are several). Read it plus `docs/vision.md` and any grill/research artifacts it references, so validation happens against the product's constraints rather than in a vacuum.
2. **Extract the flows to validate.** From the spec, list the user-facing journeys it implies — entry point, steps, decision points, end state. Confirm the list with the user; three to six flows is the useful range for an MVP.
3. **Drive Claude Design.** For each flow, use Claude Design to explore it visually (mockups of the key screens and states, including empty, loading, and error states the spec claims to handle). Where Claude Design is unavailable in the session, say so and fall back to low-fidelity textual walkthroughs — do not silently skip the stage.
4. **Harvest findings.** For each flow record: what the design confirmed, what it contradicted in the spec, and what the spec turned out to be silent on. Ambiguities count as findings.
5. **Revise the spec.** Apply the accepted findings to the spec in place. If a finding invalidates an ADR, update or supersede that ADR in the same change. Note rejected findings and why in the handoff note, so the question does not resurface every review.
6. **Write the handoff note** at the end of the spec (section `## Design validation`) with: date, flows validated, links to the design artifacts, accepted changes, rejected findings with reasons, and open questions. This section is the evidence that validation happened — the ticket stage (`to-tickets`) reads the spec as validated only if it is present.
7. **Hand off.** Confirm with the user that the revised spec is approved, commit it (respect the project's commit conventions), and point them at ticket creation as the next stage. See the plugin's `docs/workflow.md` for the full stage order.
