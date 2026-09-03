---
name: launch-grill
description: The grill — a budgeted, round-based interview that stress-tests a plan, decision, or idea until the next slice can be built safely, keeps the domain model current as terms crystallise, and always commits what settled under docs/research/. Runs as the foundation's complexity grill (stage 4) and as the feature grill opening every delivery-loop path. Use whenever the user wants to be grilled, stress-test thinking, or get aligned before building.
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# The grill

Interview the user until the next move is safe — then commit what settled. The grill is the rail's *convergent* tool, and it runs anywhere the user needs to get aligned with the agent before work hardens into specs and tickets. But convergence has a target: **build-safety, not exhaustion**. Product design is generative — every answer reveals new questions — so a grill that only stops at an empty question tree never stops; it converts the decision-maker into an approval machine and calls the exhaustion rigor. This skill executes the interaction contract in [`workflow.md`](../launch/workflow.md) ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)): the user's attention is the scarcest resource on the rail — spend it only on decisions that are genuinely theirs.

Run every grill with the **domain-modeling discipline** ([domain-modeling.md](./domain-modeling.md)) active: challenge terms against the glossary, sharpen fuzzy language, update `CONTEXT.md` as terms resolve, and offer an ADR (the project's `docs/adr/0000-template.md` format) when a decision meets its three-part bar.

A grill that ends in conversation and no committed file has not finished — see [the artifact](#the-artifact-closes-the-grill) below.

## Two contexts, one grill

- **The foundation grill (stage 4).** Inputs: the vision, the visual exploration, and the discovery landscape (`docs/research/discovery-*.md`). Open with the **risk cut**: name the handful of assumptions — about five — that could kill or fundamentally reshape the product (tenancy and isolation, money arithmetic, data durability, the core mechanic, the load-bearing integration). Those are the decide-now agenda; the long tail of product surface — slice counts, control placement, empty-state copy — is real work but not foundation work: default it or defer it to the slice that touches it. When discovery ran, the landscape map is the option space — pick from the real contenders it surfaced; don't re-assume the default that the discovery stage existed to widen past. The surviving constraints become technical research's brief (stage 5).
- **The feature grill (delivery loop).** Every sizing path — large, semi, small — starts here: when a new feature or idea arrives, grill it *before* `launch-spec` and `launch-tickets`, so the spec synthesizes decisions actually made together rather than assumptions. Same method, narrower brief: inputs are the feature idea plus the founded artifacts it touches (vision, ADRs, existing specs, the code). A feature that arrived design-first brings its handoff package: the prototype has [authority](#approved-prototypes-have-authority), and `handoff.md`'s open questions are the agenda — already triaged fodder, not a reason to re-interview the package. Hand off to whatever the sizing path says comes next — usually straight to `launch-spec` or `launch-tickets`.

## Triage before you ask

Every uncertainty gets exactly one label the moment it surfaces — labeling is *your* job and costs the user nothing:

| Label | It is | Resolved by |
|---|---|---|
| `decide-now` | A product promise, priority, risk tolerance, or an irreversible / costly-to-reverse tradeoff **that the next slice depends on** | The user — this is the only label that becomes a question |
| `agent-default` | A reversible implementation detail with a sensible default | You: pick it, record it as **Provisional**, move on |
| `research` | A fact the environment or primary sources can answer | A dispatched sub-agent — never the user |
| `prototype` | Best answered by reacting to something concrete, not by prose | A cheap artifact to react to |
| `defer` | Doesn't gate the next slice | Parked under **Deferred** with the trigger that reopens it |

`decide-now` is a conjunction of **ownership** and **dependency**: it must be the user's kind of decision *and* the next slice must depend on it. Miss either test and the label is one of the other four. Escalating a reversible choice as a question is not diligence — it is how an interview swells into a hundred questions and the human's control becomes procedural approval. When in doubt whether a decision needs the user, default it, mark it Provisional, and let the built slice arbitrate.

## The interview

Map the discussion as a **design tree**: every decision branches into the decisions that hang off it. The **frontier** is every open question whose prerequisites are already settled. But the frontier is what you *triage*, not what you *ask*. Work in **rounds**:

1. Recompute the frontier; label everything new on it.
2. Work the non-user labels: dispatch `research`, pick and record `agent-default`s, park `defer`s, propose a `prototype` when one would collapse several questions at once.
3. Ask at most **three** `decide-now` questions — the most load-bearing ones on the frontier. A genuinely consequential decision **rides alone**, with the context it deserves. Number each question, give your recommended answer, and separate questions with a horizontal rule — format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

4. Wait for the answers. Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.

**Checkpoint every two rounds.** Before the third round, and every second round after, stop and offer the explicit choice — **continue** grilling, **prototype** to raise the fidelity, **defer** what's left, or **go build** what's already safe — with your recommendation. The user steers the process, not just the answers.

**The budget is about six user decisions per session.** When it's spent, don't press on — close: write the artifact, summarize, hand over the next command. A second grill session is always available; a burned-out decision-maker is not.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — work the rest of the round now. The _decisions_ are the user's — put each to them and wait.

## Stop at build-safety

The session is done when **the next vertical slice can be built safely**: every decision that slice depends on is Locked or safely Provisional, and everything else on the tree carries a label and a parking place. The frontier does *not* need to be empty — it never will be, and chasing emptiness is how planning eats the product. "Nothing silently assumed" still holds in full force, but it means every open question is **labeled and written down**, not answered. Do not act on the decisions until the user confirms you have reached a shared understanding.

## Approved prototypes have authority

When an approved prototype, design package, or working design exists for the thing being grilled, its behavior is **presumed in scope** — it is a decision record, not a feature inventory to re-litigate. Never propose cutting something the prototype shows as a default or a simplification; a cut is a `decide-now` question only when you bring a concrete **safety, infrastructure, or measured-cost** reason, stated with the evidence. Shared structure the prototype demonstrates (a repeated component, a mode, a rail pattern) is a finding to name, not a scope to question.

## The artifact closes the grill

A grill gates on a committed file, not on the conversation. When the user confirms shared understanding — or the budget is spent — write what settled to **`docs/research/grill-<topic>.md`** (feature grills take the feature's slug) and commit it. The doc records:

- **Locked** — the decisions made, each with its one-line why.
- **Provisional** — the agent-defaults chosen, each marked changeable; revisiting one later is cheap and expected.
- **Deferred** — the questions parked, each with the trigger that reopens it (a slice, a metric, a user signal). After a foundation grill these hand onward to technical research; after a feature grill, into the spec's Out of Scope.
- **Ruled out** — the options rejected and the assumptions that died under attack, each with the reason.

Everything under `docs/research/` is project-owned; Launchrail tooling never overwrites it.

Close the session with the **rail banner** and the four-block summary — **Locked, Provisional, Deferred, Next command** — as defined in [`workflow.md`](../launch/workflow.md)'s phase view. The summary is drawn from the artifact, and the next command is fully argumented (name the committed doc), so the user always knows where they are and what to type.

One exception: when another skill invokes the grill for its own artifact — a `launch-wayfinder` ticket records its resolution on the ticket — that caller's artifact replaces the `docs/research/` doc, and the caller may hand the grill a tighter budget and a set of already-settled decisions to inherit. Inherited decisions are never re-opened. Absent such a caller, the committed doc is never optional.
