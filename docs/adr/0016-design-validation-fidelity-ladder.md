# ADR-0016: Design validation scales through a fidelity ladder

## Status
Accepted — amended by [ADR-0023](0023-remove-project-mode.md): the manifest `mode` is retired, so the level recommendation reads the spec's design surface alone; the recommend-then-confirm contract and the ladder itself are unchanged. Amended by [ADR-0024](0024-design-handoff-onramp.md): the linked-evidence rule (and the rejection of committing under `docs/design/`) is scoped to stage-8 validation evidence — design *handoff* prototypes are a distinct artifact class that does commit there.

## Context
Stage 8 (design validation) knew exactly two fidelities, chosen by tool availability rather than by fit: drive Claude Design, or — when it was unavailable in the session — "fall back to low-fidelity textual walkthroughs", plus a recorded skip for specs with no design surface. That shape had two problems. A textual walkthrough is weak evidence for the one failure mode the stage exists to catch — a flow that *reads fine in prose* but collapses on screen cannot be caught by more prose. And Claude Design is heavyweight for a spec with a modest design surface, so the real choice ("how much visual evidence does this spec deserve?") was never actually put to the user.

A grill on the redesign (2026-08-11) settled the four open questions: who chooses the level, where the evidence lives, how the manifest `mode` constrains the choice, and how the Claude Design step runs.

## Decision
Design validation runs at one of **four explicit fidelity levels**, chosen per spec:

1. **Recorded skip** — the `## Design validation` section records what was assessed and why nothing needed driving.
2. **Flow diagrams** — an artifact page of flow/state diagrams describing what is being made, produced by the Claude Code session itself.
3. **Screen mockups** — an artifact page showing the designs (mid-fidelity mockups of key screens and states), also produced by the session itself.
4. **Claude Design** — high-fidelity designs of entire screens/pages. Claude Design is reserved for this level only; the session drives it when it can reach it, and otherwise prepares a fully-argumented handoff (the same pattern as the user-typed stages) — never a silent downgrade.

Around the ladder:

- **Recommend, then confirm.** The skill reads the spec's design surface and the manifest `mode`, recommends one level with a one-line reason, and the user confirms or overrides. Never silently picked.
- **Mode is advisory.** `spike` leans toward a recorded skip, `high-rigor` leans toward mockups or Claude Design with error and edge states covered — but mode never forbids a level. The user owns the sign-off.
- **Evidence is linked, not committed.** Levels 2–4 link their artifact pages / design artifacts from the spec's `## Design validation` section, mirroring how stage 2's exploration artifacts are linked from the vision. The committed gate stays the spec section itself; the linked pages are supporting evidence.

## Alternatives considered
- **Commit diagram/mockup files under `docs/design/`.** Rejected in the grill: repo noise for evidence whose durable content — the findings — must land in the spec or an ADR anyway, and stage 2 already set the linked-artifact precedent.
- **Mode as a hard floor** (e.g. `high-rigor` forbids skip and diagrams-only). Rejected: mode calibrates rigor, and a hard floor turns a judgment stage into a turnstile. The advisory lean preserves the intent without removing the user's call.
- **Rules pick the level silently** from mode + surface. Rejected: the stage's whole point is human sign-off before tickets exist; removing the confirmation removes the checkpoint.
- **Keep textual walkthroughs as the fallback.** Rejected: prose cannot catch "reads fine in prose". The diagram and mockup levels replace it with reviewable visual evidence at comparable cost.

## Consequences
- Specs with a modest design surface get real visual evidence cheaply instead of the old binary (full Claude Design pass or prose).
- Link rot is possible since evidence is linked rather than committed — accepted because every finding must land in the spec, an ADR, or a recorded rejection regardless, so the gate never depends on the links surviving.
- The conductors (`launch`, `start-feature`) route to `launchrail:design-validation` unchanged; the fidelity choice lives inside the skill, not in routing.
- The stage-8 notes in `docs/workflow.md`, the `launch` stage map, and the skill description now describe the ladder.

## Revisit when
Artifact links rot often enough that reviews cannot retrace the evidence — which would reopen committing under `docs/design/` — or the level confirmation becomes ceremony because one level is always chosen.
