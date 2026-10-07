# Research fans out one layer — a dispatched research agent is a leaf, and discovery dispatches five at most

## Status
Accepted — amends [ADR-0015](0015-discovery-research-stage.md): discovery's depth pass dispatches one layer of research agents, one per load-bearing area and five at most for the stage, and every agent `launch-research` starts is a leaf that dispatches nothing.

## Context
A dogfood discovery run on a customer portal confirmed five areas, and the session announced five parallel research agents, one per area. Within three minutes, 21 agents were running. Each area agent had started its own per-thread agents: identity spawned "Entra External ID + Auth0" and "self-hosted IdPs and TS libs", documents spawned malware scanning, EU S3 providers, and PDF/zip/image libraries, and so on. Every agent ran on the session's model. The tasks visible at the four-and-a-half-minute mark had used about 1.6M tokens, and the count was still climbing. Nothing in the rail asked for a second layer, and nothing forbade one.

Two lines of skill text combined to cause it:

- **`launch-research` opened with an unconditional order:** "Spin up a background agent to do the research." It is written for the session that invokes it, but any agent that loads the skill reads it the same way, including the agent dispatched to do the research. Nothing made the research agent the last level. `launch-wayfinder`'s research subagents call the Skill tool with `launch-research` and had the same latent second layer.
- **`launch-discovery`'s depth pass said to drive `launch-research` "on the specific threads".** It gave no count and didn't say who dispatches. The session dispatched per area. Each area agent then read "drive research on the threads" as its own instruction and dispatched per thread.

## Decision
- **A dispatched research agent is a leaf.** `launch-research` keeps its background-agent default for the session that invokes it. An agent that was itself dispatched to research does the work in its own context and starts no agents. Every brief that starts a research agent says so in plain words, so the rule does not depend on the agent recognising its own position.
- **Discovery dispatches one layer, five at most.** Only the session running `launch-discovery` dispatches. Each research agent covers one area and carries that area's threads in its brief, worked in sequence rather than one agent per thread. The stage starts at most five. When more areas want depth than that, the least load-bearing ones get the session's own clearly-marked best-effort survey instead of an agent.
- **Research agents keep the session's model.** Five agents on the session's model is an accepted cost. The problem was the count, not the price per agent.

## Alternatives considered
- **Run research agents on a cheaper model.** Rejected for now. It trades depth for price on exactly the facts the grill builds on, and it does nothing about a fan-out that multiplies the count.
- **No agents in discovery — the session researches every area inline.** Rejected. Five areas of primary-source reading in one context crowds out the framing the session owns, and serializes reading that parallelizes cleanly.
- **A per-area cap with no total.** Rejected. The area range is three to six, so it is nearly bounded already, but "one per area" alone does not stop an area agent from fanning out. The leaf rule and the total of five together close both gaps.
- **A hook that refuses agent dispatch from inside a subagent.** Rejected. It is harness-specific, while the skills are the vendor-neutral contract, and it would also block legitimate nesting: `launch-code-review` runs inside a Ralph builder and starts its two parallel review sub-agents from there.

## Consequences
- Discovery's worst case drops from unbounded (areas × threads, plus whatever the agents nest) to five agents.
- An area's threads share one agent's context and are worked in sequence, so a thread may get less depth than a dedicated agent would give it. A sixth area gets a best-effort survey rather than an agent.
- The leaf rule also removes the second layer under `launch-wayfinder`'s research tickets and under any sub-agent the grill dispatches that loads `launch-research`. Wayfinder's own count, one agent per research ticket, is unchanged.

## Revisit when
Discovery maps come back thin on load-bearing areas because one agent cannot cover an area's threads, or the harness gains a native budget for agent dispatch that makes a skill-level cap redundant.
