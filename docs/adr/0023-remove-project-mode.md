# ADR-0023: Init asks only what the user can answer — project modes removed

## Status
Accepted — amends [ADR-0016](0016-design-validation-fidelity-ladder.md) (the fidelity recommendation reads the spec's design surface alone, no longer a manifest `mode`). References to `mode` in earlier ADRs ([0013](0013-existing-project-alignment.md), [0014](0014-start-feature-conductor.md), [0016](0016-design-validation-fidelity-ladder.md)) are historical.

## Context
The `init` interview asked five things: project mode (`spike` / `standard-mvp` / `high-rigor`), new-or-existing origin, issue tracker, Conventional Commits, and a deterministic test command. Field feedback: two of those questions confused people at the exact moment Launchrail should feel effortless — before the project exists.

**Project mode** asked users to classify a project on a rigor scale they had no way to reason about yet ("High-rigor" reads as "is my project serious?"), and the answer barely did anything: `mode`'s only consumers were three advisory sentences in the workflow skills — the stage-skipping section, one sizing hint, and a lean in the design-validation level recommendation. The actual gate for skipping stages was never the mode; it was always the vision's non-goals recording the skip.

**The test command** asked for something the user either doesn't know yet (a fresh project has no stack, so the only honest answer is "empty to decide later") or that detection already knows (a repo with a `test` script gets it suggested as the default anyway).

## Decision
- **The `mode` field is removed** from the manifest schema, the interview, `doctor` output, and the lockfile decisions. Manifests still carrying the key stay valid (unknown keys are ignored, mirroring the retired `implementationLoop`), and the `2026-08-remove-project-mode` migration deletes it on the next `sync`, preserving comments.
- **Rigor calibration folds into the mechanism that already carried it**: a stage may be skipped only when the vision's non-goals record the skip; a recorded skip is honored without nagging; anything else is skipped-nothing-silently. The high-rigor extras (an ADR per architecture decision, error and edge states in design validation) are things a user asks for, not a config value.
- **Design validation recommends from the spec's design surface alone** — little or no surface leans toward a recorded skip, a large or risky surface leans toward mockups or Claude Design with error and edge states covered. The recommend-then-confirm contract of ADR-0016 is unchanged.
- **The test command is detected, never interviewed.** Init records the repo's test script as `testing.unitCommand` when one exists and otherwise leaves it null; the conductor's setup-gaps rule records the real command in the manifest once a test runner exists, and `verify` refuses with a pointer while it's unset.
- The interview is now three questions, each one only the user can answer: new-or-existing, issue tracker, Conventional Commits.

## Alternatives considered
- **Trim to two modes or rename them** (e.g. "Standard" / "Spike") — rejected: renaming doesn't fix the real problem, which is asking for a rigor classification before the user can know it, to feed a field almost nothing reads.
- **Keep `mode` in the manifest but drop the interview question** — rejected: a field nobody is asked about and three sentences of prose consume is dead configuration; it would still need docs, validation, and explanation.
- **Keep the test-command question for existing projects only** — rejected: those are exactly the projects where detection already supplies the answer as the default, so the question is pure friction there too.

## Consequences
- Easier: `init` is three questions with detected defaults; nothing asks users to self-classify rigor.
- Consuming projects converge automatically: legacy manifests stay valid and `sync` removes the stale key.
- Constrained: there is no machine-readable rigor knob. Anything (CI, tooling) that wanted to key behavior on `mode` must find another signal — none did as of this ADR.

## Revisit when
- A consumer genuinely needs machine-readable rigor (e.g. CI-enforced gates per project class) — that would be a new, purpose-built field, not a revival of the three-way mode.
- Detection proves too weak for test commands in practice (users routinely land with a wrong or missing `unitCommand` that the workflow fails to settle).
