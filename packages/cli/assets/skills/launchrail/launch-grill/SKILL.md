---
name: launch-grill
description: The complexity grill — stage 4. A relentless, round-based interview that stress-tests the vision, exploration artifacts, and discovery landscape into surviving constraints, maintains the domain model as terms and decisions crystallise, and always ends by committing the grill constraints under docs/research/. Also used feature-scoped when sizing routes a feature through a grill. Use when the user wants a plan, decision, or idea grilled or stress-tested.
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# The complexity grill

Interview the user relentlessly until you reach a shared understanding — then commit what survived. The grill is the rail's *convergent* tool: it takes the vision, the visual exploration, and the discovery landscape and narrows them into the constraints that everything downstream (research, ADRs, spec) builds on. A grill that ends in conversation and no committed file has not finished — see [the artifact](#the-artifact-is-the-stage) below.

Run it with the **`launch-domain-modeling`** skill active throughout: challenge terms against the glossary, sharpen fuzzy language, update `CONTEXT.md` as terms resolve, and offer an ADR (the project's `docs/adr/0000-template.md` format) when a decision meets its three-part bar.

## The interview

Map the discussion as a **design tree**: every decision branches into the decisions that hang off it. Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — ask the rest of the frontier now. The _decisions_ are the user's — put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on the decisions until the user confirms you have reached a shared understanding.

Grill against what's committed: when discovery ran (stage 3), the landscape map under `docs/research/discovery-*.md` is the option space to narrow — pick from the real contenders it surfaced, don't re-assume the default the discovery stage existed to widen past.

## The artifact is the stage

Stage 4 gates on a committed file, not on the conversation. When the user confirms shared understanding, write the surviving constraints to **`docs/research/grill-<topic>.md`** (feature-scoped grills take the feature's slug) and commit it. The doc records:

- the decisions made, each with its one-line why;
- the assumptions attacked, and whether they survived;
- the options ruled out, with the reason;
- the open questions handed to technical research (stage 5) — its brief.

Everything under `docs/research/` is project-owned; Launchrail tooling never overwrites it.

One exception: when another skill invokes the grill for its own artifact — a `launch-wayfinder` ticket records its resolution on the ticket — that caller's artifact replaces the `docs/research/` doc. Absent such a caller, the committed doc is never optional.
