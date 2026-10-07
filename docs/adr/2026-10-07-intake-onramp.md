# The intake on-ramp — starting the rail from a spec or prototype already in hand (`launch-intake`)

## Status
Accepted — extends [ADR-0013](0013-existing-project-alignment.md): stage 1 gains a second on-ramp, keyed on material the user brings rather than on `origin`, and alignment composes it when an existing codebase also arrives with material. Extends [ADR-0024](0024-design-handoff-onramp.md): the handoff on-ramp also packages a prototype at foundation time and returns to its caller. Extends [ADR-0029](0029-planning-interaction-contract.md): the authority an approved prototype carries also covers what a brought brief decides.

## Context
The rail has two ways into stage 1. A project that starts from an idea gets `launch-vision-creation`, which interviews for a vision from scratch. A project that starts from code gets `launch-project-alignment` (ADR-0013), which infers a vision from the codebase and asks only the gaps.

A third start keeps showing up: the user sets up Launchrail with the thinking already done and no code yet — a thorough specification document, a finished clickable prototype from Claude Design, often both. The rail has no place for that. `origin: new` sends them into a from-scratch vision interview that re-asks what the spec answers. `launch-design-handoff` (ADR-0024) can file the prototype, but it is a delivery-loop on-ramp: it routes to feature sizing, which presumes a founded project. So users either sit through the interview or bypass the rail.

Bypassing loses what the rail still adds when the product is described. A spec rarely fixes the whole stack, and the library and vendor landscape for its hard parts still needs discovery. Its riskiest assumptions still need attacking before they are built. Research, ADRs, a spec the loop can run on the tracker, and tickets with dependency edges are all still needed. And brought material is uneven: features are often described in depth while the bet, the first concrete user, the failure signal, and the error states go unsaid — and where a spec and a prototype were made separately, they disagree in places.

Constraints: artifacts gate stages, not chat memory. Every stage has one owner. Everything the workflow produces is project-owned. Planning runs under the interaction contract (ADR-0029). And `init` asks only what changes the files it writes (ADR-0023).

## Decision
A new skill, **`launch-intake`**, is the stage-1 on-ramp for **brought material** — a way onto the same rail, like alignment and the handoff, not a new stage number.

1. **The material is committed as the input of record, verbatim.** The spec lands under `docs/brief/` (converted to Markdown faithfully when it arrived as .docx, PDF, or an export — never paraphrased). The prototype becomes a design package under `docs/design/<slug>/` made by `launch-design-handoff`, which packages it and returns without sizing. At foundation time it has no code to diff against, so every screen is new and the prototype's tokens are recorded as the proposed design-system baseline. All of it is project-owned and never rewritten by tooling.
2. **Intake owns one artifact, `docs/brief/intake.md`.** It records the material, a verdict on the spec (**build-ready**, or the areas that **need grilling**), a coverage map of the material against what each later stage needs, the spec↔prototype corroboration, the stack (fixed by the material or the user vs. open), and an agenda: every gap triaged with ADR-0029's labels — `decide-now` for the grill, `research` for discovery and research, `agent-default` recorded Provisional, `prototype` for design validation, `defer` with its trigger.
3. **Corroboration uses the rail's existing precedence.** The prototype governs look and layout; the spec governs behavior and rules. A conflict that rule settles is recorded as settled. A conflict over what the product *does* goes to the grill as `decide-now`. Prototype-only behavior is in scope by presumption and is written down so the spec picks it up.
4. **The vision is drafted from the material, not interviewed from scratch.** Every line cites its source and inferences are marked. Only the gaps are asked — the vision's, plus any fixed stack constraints the spec doesn't state — and `launch-vision-creation` confirms and commits the draft without re-interviewing. The vision template gains an optional **References** section for the brief and design packages it draws on. A prototype's own code is never read as a stack decision.
5. **The rest of the rail runs, shortened rather than skipped.** A design package linked from the vision satisfies visual exploration. Discovery is bounded by the intake's stack section: fixed choices are its bounds, open ones its areas. The foundation grill takes the intake agenda alongside its risk cut. Research and ADRs run as always. The stage-7 spec is written *from* the brief, keeping what it decided. Design validation leans toward a recorded skip citing the package when the spec came from a corroborated prototype.
6. **A brought brief has the authority of an approved prototype.** What it decides is presumed decided; reversing a decision needs a concrete safety, infrastructure, or measured-cost reason. What it only assumes stays open to the grill's risk cut.
7. **The brief is never stage 7's artifact.** It is not filed under `docs/specs/` or published as a `spec` issue. If it were, the conductor would read stage 7 as reached and pass over the stages the user still wants.
8. **Routing.** `launch` routes stage 1 to intake when material is in hand (the user brings it, or `docs/brief/intake.md` exists without a real vision). Loose, unfiled material in the repository is a question, not a guess. `intake` / `brief` / `bring` are stage keywords. On `origin: existing`, alignment stays the on-ramp and calls intake for material describing what comes *next*; intake then returns its findings without interviewing, and alignment runs the one interview.
9. **No manifest field and no init question.** The committed brief is the signal. `init`'s closing message tells the user they can bring a spec or prototype to `/launch`. The skill ships through the managed skill surface like every other.

## Alternatives considered
- **Let `launch-vision-creation` read the material.** Rejected: the vision is one or two pages. Filing, corroboration, and gap triage feed stages 2 through 8, so they would end up in chat memory or bloat the vision.
- **Extend alignment to documents.** Rejected: alignment is keyed on `origin: existing` and treats code as the evidence. A new project with a spec is not an existing project, and folding it in would make `origin` lie. The two compose instead.
- **Treat the brought spec as the stage-7 spec and jump ahead.** Rejected: that skips stack discovery, the risk cut, research, and ADRs — the parts the user still wants. A brought document also doesn't meet the stage-7 contract: the tracker home (ADR-0025), test seams, and Locked/Provisional/Deferred labels.
- **Use the design handoff alone.** Rejected: it is per-feature and routes to sizing, and a spec-only arrival has no on-ramp there at all.
- **A new `origin` value or an init question.** Rejected: brought material is orthogonal to new vs. existing — either kind of project can arrive with a spec — and the init answer would change nothing init writes (ADR-0023). Artifacts gate stages; the committed brief says what a config value would.
- **Grill the spec during intake.** Rejected: it would put the same decisions to the user twice, and it would converge before discovery widens the option space (ADR-0015).
- **Paraphrase the spec into the vision and discard it.** Rejected for the reason ADR-0024 commits prototypes: the brief is the spec stage's main input, and a paraphrase loses what its author settled.

## Consequences
- Easier: a project that arrives with a spec, a prototype, or both reaches a committed vision in one short session, keeps every downstream stage, and finds each one shorter for what the material already decided. Disagreements between the spec and the prototype surface before the build, not during it.
- `docs/brief/` becomes a project-owned directory in consuming repositories, beside `docs/design/`.
- Harder: intake carries real triage weight. A decision mislabeled `agent-default` is silently assumed, and one mislabeled `decide-now` is asked twice. Brief authority also means a weak decision in the brief survives unless a stage brings a concrete reason, so the risk cut is the guard.
- The conductor's stage-1 routing now looks at material in hand as well as `origin`. Vision-creation accepts drafts from either on-ramp and gains an optional References section.

## Revisit when
- Spec-first features on an already-founded project become common — consider letting intake file a per-feature brief the way the handoff files per-feature packages.
- Briefs routinely arrive so complete that `launch-spec` only reformats them — consider letting a brief that meets the stage-7 contract stand as the spec.
- Material arrives in forms that can't be committed faithfully (heavy media, live documents with no export) — add a link-or-commit policy, as ADR-0024 anticipates for prototypes.
