---
name: launch-grill
description: The grill — a relentless, round-based interview that stress-tests a plan, decision, or idea into surviving constraints, maintains the domain model as terms and decisions crystallise, and always ends by committing the constraints under docs/research/. Runs in two contexts, the foundation's complexity grill (stage 4) and the feature grill that opens every delivery-loop path before speccing and tickets. Use whenever the user wants to be grilled, stress-test thinking, or get aligned before building.
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# The grill

Interview the user relentlessly until you reach a shared understanding — then commit what survived. The grill is the rail's *convergent* tool, and it runs anywhere the user needs to get aligned with the agent before work hardens into specs and tickets. A grill that ends in conversation and no committed file has not finished — see [the artifact](#the-artifact-closes-the-grill) below.

Run every grill with the **domain-modeling discipline** ([domain-modeling.md](./domain-modeling.md)) active: challenge terms against the glossary, sharpen fuzzy language, update `CONTEXT.md` as terms resolve, and offer an ADR (the project's `docs/adr/0000-template.md` format) when a decision meets its three-part bar.

## Two contexts, one grill

- **The foundation grill (stage 4).** Inputs: the vision, the visual exploration, and the discovery landscape (`docs/research/discovery-*.md`). The job is to narrow the whole product's option space into the constraints everything downstream builds on. When discovery ran, the landscape map is the option space — pick from the real contenders it surfaced; don't re-assume the default that the discovery stage existed to widen past. The surviving constraints become technical research's brief (stage 5).
- **The feature grill (delivery loop).** Every sizing path — large, semi, small — starts here: when a new feature or idea arrives, grill it *before* `launch-spec` and `launch-tickets`, so the spec synthesizes decisions actually made together rather than assumptions. Same method, narrower brief: inputs are the feature idea plus the founded artifacts it touches (vision, ADRs, existing specs, the code). Hand off to whatever the sizing path says comes next — usually straight to `launch-spec` or `launch-tickets`.

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

## The artifact closes the grill

A grill gates on a committed file, not on the conversation. When the user confirms shared understanding, write the surviving constraints to **`docs/research/grill-<topic>.md`** (feature grills take the feature's slug) and commit it. The doc records:

- the decisions made, each with its one-line why;
- the assumptions attacked, and whether they survived;
- the options ruled out, with the reason;
- the open questions handed onward — to technical research after a foundation grill, or into the spec after a feature grill.

Everything under `docs/research/` is project-owned; Launchrail tooling never overwrites it.

One exception: when another skill invokes the grill for its own artifact — a `launch-wayfinder` ticket records its resolution on the ticket — that caller's artifact replaces the `docs/research/` doc. Absent such a caller, the committed doc is never optional.
