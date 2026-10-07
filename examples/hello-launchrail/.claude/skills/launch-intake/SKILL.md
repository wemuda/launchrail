---
name: launch-intake
description: "The on-ramp for a project that arrives with its thinking already done — a specification document, a Claude Design prototype, or both. Files the material as the project's input of record (the spec under docs/brief/, the prototype as a design package under docs/design/), corroborates the spec against the prototype, judges whether the spec is build-ready, drafts the vision from the material and interviews only the gaps, and writes everything the material leaves open into an intake record that becomes the agenda for discovery and the grill — then hands back to launch. Use when the user brings a spec, PRD, or brief, or a finished prototype, to a project that has no vision yet, or says they already know what they are building."
---

# Intake — starting from what you already have

The rail is written for a project that starts from an idea, and `launch-project-alignment` covers one that starts from code. A third start is common: the user arrives with the thinking already done — a thorough specification document, a clickable Claude Design prototype, or both — and no product yet. Interviewing them for a vision from scratch re-asks what the material answers. Skipping the rail forfeits what it still adds: a stack chosen from the real option space, the risks attacked before they are built, research, ADRs, and tickets the loop can run. This skill is the **on-ramp for brought material**: it files the material as the project's input of record, reads it hard, drafts what it can from it, asks only what it leaves open, and hands every gap forward to the stage that owns it. Like alignment, it is a way onto the same rail, not a second workflow ([intake-onramp](https://github.com/wemuda/launchrail/blob/master/docs/adr/2026-10-07-intake-onramp.md)).

## Ground rules

- **The material is committed as received, and it is project-owned.** A document dropped into chat dies with the session, and every later stage cites it. The spec lands under `docs/brief/` verbatim — converted to Markdown when it arrived as .docx, PDF, or an export, faithfully and never paraphrased; the prototype becomes a design package under `docs/design/<slug>/` through `launch-design-handoff`. Launchrail tooling never rewrites either, and this skill never edits them.
- **Brought material has authority.** A spec the user wrote and a prototype they approved are decision records ([ADR-0029](https://github.com/wemuda/launchrail/blob/master/docs/adr/0029-planning-interaction-contract.md)): what they *decide* is presumed decided, and downstream stages build from it rather than re-ask it. Proposing to cut or reverse a decision needs a concrete safety, infrastructure, or measured-cost reason. What the material only *assumes* stays attackable — that is what the grill's risk cut is for.
- **Infer, then confirm — and cite.** Every vision line drafted from the material names its source (a spec section, a prototype screen); anything not stated outright is marked inferred. A confident guess presented as the author's intent is worse than an open question.
- **Ask only what the material can't answer.** Read all of it before asking anything. The interview covers the vision's gaps and, when the spec is silent on the stack, its fixed constraints — under the interaction contract in [`workflow.md`](../launch/workflow.md): at most three questions per round, each with a recommended answer. Everything else is triaged and written down, not asked.
- **Assess, don't grill.** This skill judges whether the spec is build-ready and records where it isn't; it does not run the grill. Gaps, contradictions, and load-bearing assumptions become the foundation grill's agenda; open option spaces become discovery's areas. Each decision is put to the user once, by the stage that owns it.
- **Compose, never duplicate.** `launch-vision-creation` finalizes and commits the vision; `launch-design-handoff` makes the design package; discovery, the grill, research, ADRs, the spec, and tickets keep their owners. This skill owns exactly one artifact: the intake record, `docs/brief/intake.md`.
- **A prototype's code is not a stack decision.** A Claude Design canvas is markup, styles, and a script built to be clicked through; the framework it happens to use says nothing about the product's stack.

## Process

1. **Take intake.** Accept what arrived: a document (Markdown, text, .docx, PDF, a Google Docs or Notion export, a link the session can reach — if it can't, ask for an export), a Claude Design export (zip, folder, artboard files, canvas link), or both. Look in the repository too — a `SPEC.md`, a `PRD.md`, a document or export the user points at. Confirm in one line what each piece is and whether the spec and the prototype describe the same product and scope. If `docs/vision.md` is already real, this run is a revision: everything below feeds a revision of it, never a rewrite. On `origin: existing`, see [On an existing codebase](#on-an-existing-codebase).
2. **File the material.**
   - **The spec** goes under `docs/brief/`, one file per document, named for what it is (`docs/brief/spec.md`, `docs/brief/pricing-rules.md`). Keep headings, tables, and lists intact through any conversion; keep the original file beside the Markdown only when conversion lost something load-bearing (a diagram, a table that didn't survive), and record that in the intake record rather than in the document.
   - **The prototype** goes through `launch-design-handoff`: call the Skill tool with it, say the package is for a foundation-time intake, and give it the slug — `mvp` (or the product's name) for a whole-product prototype. It unpacks, names the canvases, inventories every reachable state, commits `docs/design/<slug>/`, and returns without sizing or routing. Never re-derive the package here.
3. **Read for coverage.** Walk the [coverage map](#the-coverage-map) and mark each row **covered**, **thin**, **silent**, or **contradicted**, citing where in the material.
4. **Corroborate the spec against the prototype** — when both arrived. Walk the state inventory in `handoff.md` against the spec's flows and stories:
   - **matched** — both show it;
   - **prototype-only** — drawn but not specified: in scope by presumption; write down the behavior the screens imply so the spec stage picks it up;
   - **spec-only** — specified but not drawn: expected for rules and back-end behavior; a missing *user-facing* state is a design gap for design validation (stage 8);
   - **contradicted** — they disagree. Apply the precedence the rail uses everywhere: the prototype governs look and layout, the spec governs behavior and rules. A conflict that rule settles is recorded as settled (`agent-default`, Provisional); a conflict about what the product *does* — a feature one includes and the other excludes, two different rules — is `decide-now` for the grill.
5. **Triage every gap.** Each thin, silent, or contradicted row gets one label from the interaction contract — `decide-now` (the grill's agenda), `research` (discovery's or research's brief), `agent-default` (picked and recorded Provisional), `prototype` (design validation or a Claude Design pass), or `defer` (parked with the trigger that reopens it). Then give the spec a verdict: **build-ready** — the foundation grill shrinks to the risk cut plus the agenda — or **needs grilling**, naming the areas.
6. **Draft the vision from the material.** Problem, bet, first users, what the MVP must prove, assumptions, non-goals, success signals — each drawn from the spec, or for a prototype alone from its screens, flows, and copy (who the screens address, what the core mechanic is, what the empty states promise); each citing its source, inferences marked. Rewrite the material's assumptions in falsifiable form and lift its explicit exclusions into non-goals. A spec usually states features and rarely the bet, the first concrete user, or the signal that would call the product failed — those are the usual gaps.
7. **Interview the gaps.** One or two rounds: the vision gaps the material left open, and — when the spec doesn't fix the stack — whether anything about it is fixed (a language, a host, an existing platform to integrate with, the team's skills). Everything else about the stack is discovery's question, not the user's.
8. **Commit and hand the vision over.** Write the intake record (template below) and commit it with the filed material. Then call the Skill tool with `launch-vision-creation` and hand it the drafted vision: the interview is done, so it confirms and commits — linking `docs/brief/` and any design package from the vision, and syncing the `AGENTS.md` project-purpose line.
9. **Report and hand back — with the rail banner.** Present what the material already settled, the spec's verdict, and the gaps in rail order. A prototype packaged and linked from the vision satisfies visual exploration (stage 2), so discovery is next; without one, visual exploration is next — Claude Design, with the brief as its input — unless the vision's non-goals record the skip. Route to `/launch` for the frontier and close with the banner from [`workflow.md`](../launch/workflow.md)'s phase view: Intent ✓ under Done (with the design ✓ when a package exists), the next stage as Now, and the arc ahead — discovery → grill → research → ADRs → spec → design validation → tickets — under Next and Later, each stage shorter for what the material already decided.

## The coverage map

| What the rail needs | Look for in the material | Feeds |
|---|---|---|
| Problem, first users, bet | Background, personas, the problem statement; the prototype's audience, copy, and empty states | The vision (stage 1) |
| MVP proof, success signals, assumptions | Goals, KPIs, launch criteria, stated assumptions | The vision; the grill's risk cut |
| Non-goals | Explicit exclusions, "later" phases, out-of-scope lists | The vision's non-goals; the spec's Out of Scope |
| Look and flows | The prototype; wireframes or flow descriptions in the spec | Stage 2 (a design package linked from the vision satisfies it); stage 8 |
| Stack and hosting | Named languages, frameworks, vendors, platforms, hard constraints | Discovery's bounds — fixed choices bound it, open ones become its areas |
| Hard parts | Auth, money, data durability, real-time, integrations, the core mechanic | Discovery's areas; the grill's risk cut |
| Behavior and rules | User stories, business rules, permissions, the data model, validation | The grill's agenda; the stage-7 spec |
| States | Empty, loading, error, permission-denied, edge cases | The grill's agenda; stage 8 |
| Verification | Acceptance criteria, test expectations | The spec's Testing Decisions |

## The intake record

`docs/brief/intake.md` is the one file this skill writes, and the stages after it read it: discovery for its stack bounds and areas, the grill for its agenda, the spec for the brief's place among its inputs, design validation for what the corroboration already settled.

```markdown
# Intake — <product name>

## Material
Each source: its path (docs/brief/… or docs/design/<slug>/), what it is, where it came from, the date received, conversion notes.

## Verdict
Build-ready, or needs grilling (the areas) — and why, in a paragraph.

## Coverage
The coverage map, filled: each row covered / thin / silent / contradicted, with citations.

## Spec ↔ prototype
Matched (a count), then each prototype-only, spec-only, and contradicted item with its ruling or label.

## Stack
Fixed — by the material or by the user, with the source. Open — handed to discovery as areas.

## Agenda
- Grill (decide-now): …
- Discovery and research: …
- Provisional (agent-default): …
- Prototype / design validation: …
- Deferred: … (each with its trigger)

## Precedence
The brief and the design package are decision records: the prototype governs look and layout, the brief governs behavior and rules. A decision made later on the rail (a grill, an ADR, the spec) governs where it explicitly revises them; the brief itself is never edited.
```

New or revised material later — a second spec version, an updated export — replaces the file under `docs/brief/` (or the package, through the handoff), and the intake record is revised in place with a dated note. Never a second competing brief.

## On an existing codebase

On `origin: existing`, `launch-project-alignment` is the stage-1 on-ramp, and the code is the evidence for what exists. When the user also brings material for what comes next — not documents describing what is already built — alignment calls this skill for it; invoked directly on such a project, hand to `launch-project-alignment` and let it call back. Run steps 1–5 as above, with the code as a third source in the coverage map (built, partly built, or not built yet), write the intake record, and return the coverage, the agenda, and the drafted intent to alignment: no interview and no banner here — alignment merges them with what it inferred from the code, runs the one gap interview, and hands the vision to `launch-vision-creation`.

## What this skill does not do

- It does not run discovery, the grill, research, or the spec — it hands them their agenda.
- It does not write the stage-7 spec. The brought spec is that stage's main input, not its artifact: filed under `docs/specs/` or published as a `spec` issue, it would read as stage 7 done and skip the decisions the rail exists to make. `launch-spec` later writes the spec *from* the brief, keeping what it decided.
- It does not edit the material — corrections are new decisions, recorded where decisions live.
- It does not start a build. A faithful build of the prototype (`/launch-design-implement`) needs a product to build into; it becomes available once the stack is stood up, and until then the package is the design reference.
