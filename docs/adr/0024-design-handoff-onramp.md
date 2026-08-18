# ADR-0024: The design handoff on-ramp (`launch-design-handoff`)

## Status
Accepted — amends [ADR-0016](0016-design-validation-fidelity-ladder.md): the linked-evidence rule is scoped to stage-8 validation evidence; design *handoff* prototypes are a distinct artifact class, committed under `docs/design/`

## Context
The delivery loop runs through Claude Design in both directions. The rail already drives code→design at stage 2 (visual exploration) and stage 8 (design validation, fidelity level 4). Real usage adds the reverse trip: after a delivery loop or two, the user connects the repo to Claude Design, produces a tweak, the next few pages, or a redesign there, and returns to Claude Code with the result — typically a zip of artboard files and assets dropped into the session, with "here is the prototype of feature X".

Today that arrival has no owner. The files land in chat, the intent lives in conversation, and the user hand-drives the sequence every time: ask for the designs to be documented "somewhere in the repo", start a grill, ask for a spec that references the designs, then tickets. That violates the rail's core rule — artifacts gate stages, not chat memory — at exactly the moment the most expensive-to-reproduce input (a finished visual prototype) enters the loop.

Constraints:

- A dropped zip has no durable link and sessions are ephemeral — the ADR-0016 model for stage-8 evidence (link, don't commit) cannot preserve it.
- The prototype is the authoritative visual input for implementation. Paraphrasing it into prose forfeits exactly the fidelity the design trip bought — the "reads fine in prose" failure of ADR-0016, run in reverse.
- One owner per stage: sizing lives in `launch`, the grill in `launch-grill`, specs in `launch-spec`, implementation behind the user-typed `/launch-implement`. The arrival needs an owner that composes these, not a parallel workflow.
- Whatever the workflow produces is project-owned.

## Decision
A new skill, **`launch-design-handoff`**, owns the design→code return trip as a delivery-loop **on-ramp** — like `launch-project-alignment` is the on-ramp for existing projects: a way onto the same rail, not a new stage number.

1. **Intake.** A `.zip` export, an extracted folder, loose artboard/HTML/image files, or a published canvas link. Unpacked in a scratch directory, junk-stripped (`__MACOSX/`, `.DS_Store`), and every artboard *read* — Claude Design artboards are self-contained HTML, so layout, tokens, and copy are extractable, not just filed.
2. **The committed artifact is a handoff package** under `docs/design/<feature-slug>/`: the prototype files verbatim plus a distilled `handoff.md` — each screen classified new/changed/context against the current code, a component map to existing code components, token deltas against the design-system baseline with an intentional-vs-accident ruling, the states the prototype doesn't show recorded as open questions, a precedence rule (prototype governs look, the doc governs behavior), and a recommended path. All project-owned; one slug per feature, revised in place on iteration. `docs/design/` is one accumulating home, so successive handoffs (visual identity, per-feature prototypes) sit together as the repo's design reference.
3. **The skill interviews only what documenting needs** (scope, divergence rulings, load-bearing copy). Everything the prototype is silent on becomes the **feature grill's agenda** — the handoff feeds the grill, mirroring how the grill feeds research. No double interview.
4. **Routing composes existing owners.** The skill proposes a size, the user confirms, `launch` sizing consumes `handoff.md`: a tweak goes grill → tickets; the common case goes short feature grill → `launch-spec` (the spec cites `docs/design/<slug>/` as its UX/UI reference) → `launch-tickets`; a redesign takes the large-feature path. When the spec is written from the prototype, stage 8 typically becomes a recorded skip citing the package — recorded through `launch-design-validation`, so the gate stays artifact-based.
5. **Relationship to ADR-0016.** 0016's "evidence is linked, not committed" and its rejection of committing under `docs/design/` are **scoped to stage-8 validation evidence** — linkable published pages whose findings must land in the spec anyway. A handoff prototype is a different class: an un-linkable input of record that implementation will be held against. This ADR gives `docs/design/` to that class; validation evidence stays linked.

The skill ships through the managed skill surface automatically (`skillFiles()` walks the assets directory) — no CLI change.

## Alternatives considered
- **Paraphrase the prototype into the spec and discard the files.** Loses the visual fidelity the design trip bought; the spec stage re-derives layout from prose — the failure mode design validation exists to catch, reintroduced upstream. Rejected.
- **Link instead of commit, extending ADR-0016's model.** There is nothing durable to link — a chat upload dies with the session, and Claude Design exports carry no stable versioned URL a repo can cite. Rejected until that changes (see below).
- **Make it a numbered stage.** The return trip is per-feature and optional; a stage number would imply every feature needs it. It is an on-ramp into sizing, exactly like alignment. Rejected.
- **Let `launch` handle drops inline.** Conductor detection is read-only and one-owner-per-stage is the composition contract; this work reads, interviews, and writes. Rejected.
- **Absorb the upstream `handoff` skill dropped by ADR-0020.** Coincidental name only — that skill hands context between sessions; this one hands designs between tools. Nothing to absorb.

## Consequences
- Design work round-trips: Claude Design output enters the rail as a committed, gateable, citable artifact instead of chat context, and the manual drop→document→grill→spec sequence becomes one command.
- `docs/design/` becomes a real, project-owned directory in consuming repos. Repo weight grows by the prototype's size — accepted because the package *is* the implementation reference; junk-stripping and the unused-asset rule keep it lean.
- ADR-0016 is narrowed in scope, not changed in behavior: stage-8 evidence stays linked; its "revisit when" about link rot is untouched.
- The spec gains a standard way to reference designs (`docs/design/<slug>/`), and the feature grill gains a prepared agenda when a feature arrives design-first.
- The `launch` conductor, `workflow.md`, and the README document the on-ramp.

## Revisit when
- Claude Design exports gain durable, versioned links a repo can reference — reconsider linking prototypes rather than committing them.
- Handoff packages grow media-heavy enough that repo weight hurts — add an asset policy (size guidance, LFS) to the skill.
- Design-first arrival becomes the dominant path for sized features — reconsider whether spec creation should absorb intake rather than reference it.
