---
name: launch-spec
description: Synthesize what the conversation already decided into a spec — published as a spec-labeled issue on the tracker, or committed under docs/specs/ in local mode. No interview.
disable-model-invocation: true
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user — just synthesize what you already know: the vision, the grill's surviving constraints, the research notes, and the ADRs are the inputs; a conductor handing off this stage names them.

Synthesis preserves the grill's labels ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)): **Locked** decisions are stated as decisions; **Provisional** agent-defaults stay marked provisional in the spec (changeable without re-planning); **Deferred** questions land in Out of Scope with the trigger that reopens them — never silently dropped, never silently promoted into scope.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary (`CONTEXT.md`) throughout the spec, and respect any ADRs in the area you're touching — find them through the registry index (`docs/adr/README.md`) rather than reading the whole directory, and remember an ADR records a decision, not what exists; the codebase is the evidence for current state.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better — the ideal number is one.

   Check the seams with the user through the structured question tool (`AskUserQuestion`) rather than a freetext ask — one question, recommended answer first ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)): the seams as sketched, ready to write and publish. The other options are the real alternative placements you considered (a different existing seam, fewer seams, a higher one). Selecting the recommended answer flows straight into step 3 — write and publish with no further confirmation; an alternative answer re-sketches the seams and asks again. In an environment without a structured question tool, fall back to a numbered question with a ➡️ recommended answer.

3. Write the spec using the template below and publish it to **its tracker-appropriate home** — the spec's home follows the configured tracker, exactly as tickets do ([ADR-0025](https://github.com/wemuda/launchrail/blob/master/docs/adr/0025-spec-home-follows-tracker.md)). Read `docs/agents/issue-tracker.md` to know which applies:

   - **A real tracker (GitHub, GitLab, Linear)** → publish the spec as an issue labeled **`spec`**. That issue is stage 7's canonical artifact — do not also commit a `docs/specs/` file. Never label it `ready-for-agent`: that label marks implementable tickets, the implementation loop computes its frontier from it, and it cannot tell prose from work.
   - **Local mode (`local`, or no tracker)** → commit the spec under `docs/specs/` (`<feature-slug>.md`). There is no external store, so the committed file is the canonical artifact. It is project-owned.

On a real tracker, also bundle the spec under a **milestone** named for the feature: create the milestone, put the spec issue in it, and set its description to a one-line goal plus a link back to the spec issue. That milestone is the rollup `launch-tickets` hangs every ticket on, so the whole feature reads as one progress bar — a *view*, not the spec's home; the `spec`-labelled issue stays canonical. See `docs/agents/issue-tracker.md` for the exact per-tracker commands; local mode has no milestone (the feature's files are its bundle).

The spec then flows on: design validation (stage 8) revises it in place, and `launch-tickets` (stage 9) breaks it into tickets that reference it. Close by rendering the rail banner ([`workflow.md`](../launch/workflow.md)'s phase view) — the published spec under Done, design validation as Now, tickets as Next — with the one next command on the `➤` line.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature *as decided* — behavior an approved prototype shows is in scope by presumption, while questions the grill deferred belong in Out of Scope, not as invented stories.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec — including every question the grill deferred, each with the trigger that reopens it.

## Further Notes

Any further notes about the feature.

</spec-template>
