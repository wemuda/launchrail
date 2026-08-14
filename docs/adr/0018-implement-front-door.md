# ADR-0018: One front door for implementation, one planning conductor

## Status
Accepted — supersedes [ADR-0014](0014-start-feature-conductor.md); amends [ADR-0005](0005-ralph-two-frontends-one-policy.md) (gate placement, workflow-file distribution) and [ADR-0017](0017-implementation-loop-provider.md) (stage-10 handoff target). Amended by [ADR-0022](0022-implement-front-door-renders-graph.md): the door renders the dependency graph then starts immediately, and the single-ticket path unifies on `launch-ralph-implement` instead of the textually-parallel contract this ADR introduced (resolving its own revisit clause).

## Context
Field use surfaced a sharp DevEx failure at the exact moment of maximum momentum. A consuming project finished planning — spec published, thirteen dependency-ordered tickets cut — and the user had to ask which of four commands starts the build: `launch` (routes but never starts the loop), `start-feature` (sounds like "start building", is a planning conductor), `ralph` (the loop, but its workflow file needed a separate `launchrail add ralph` nobody had run), or `ralph-implement` (one ticket). Answering took a comparison table, module archaeology in the manifest, and an explanation of the skill-vs-workflow frontends and the provider dimension — six concepts standing between the user and one verb.

Three structural causes:

1. **Planning had one door; implementation had four names and a locked one.** The default loop's materials weren't installed by `init` — stage 10's own map read "needs `launchrail add ralph`", so every golden-path project hit a wall exactly once, at the finish line of planning.
2. **`start-feature` answered to the wrong question.** Its name promises building; its job was sizing the planning path. ADR-0014 pre-registered its own exit ("revisit when a single conductor with a mode flag would be simpler than two"); the trigger fired as naming confusion rather than content drift.
3. **The conductor prose compounded.** `launch` reached ~2,900 words, absorbing a stanza per feature, and three routing surfaces (`workflow.md`, `launch`, `start-feature`) had to stay consistent by hand — a cost ADR-0014 accepted and which grew with every release.

## Decision
1. **A single user-typed front door for building: `launchrail:implement`.** `/launchrail:implement` drives the whole ready frontier; `/launchrail:implement <n>` builds one ticket end to end in-session; several numbers scope the loop. It reads `implementationLoop` and routes to the selected engine (`launchrail:ralph`, or Superpowers' execution skills), so users never learn engine or provider names. It repairs its own setup — missing loop materials install via `launchrail sync` — instead of gatekeeping.
2. **The hard gate moves to the door.** `implement` carries `disable-model-invocation`; `ralph` drops it (its description and body keep the never-unprompted rule) so the front door can compose the engine — a Skill-tool refusal between the two would rebuild the wall the door removes. "Only a human starts a campaign" is preserved: the only ways in are the user-typed door or the user's explicit words.
3. **`init` installs the default loop's materials.** A fresh manifest selecting `ralph` enables its module and init writes `.claude/workflows/ralph.js`; the migration `2026-08-wire-default-implementation-loop` brings existing projects current on their next `sync` (manifest module flag + workflow file, checksum-safe, dry-runnable). `launchrail add ralph` remains for re-installing or switching providers later.
4. **`start-feature` folds into `launch`.** Sizing (large / semi / small → planning subset) becomes a `launch` section triggered when the foundation exists and the user brings one feature — one question, not a second 1,300-word conductor. The size→path table lives in `workflow.md`.
5. **`launch` slims to routing; `workflow.md` owns the contract.** The conductor rules (compose-never-duplicate, artifact gating, prepared handoffs for user-typed stages, label hygiene, setup-is-action) move to `workflow.md` as the single normative home; `launch` references them and keeps only the stage map, sizing, routing steps, and keywords (~2,900 → ~1,250 words).

## Alternatives considered
- **Keep `start-feature`, rename it (`plan-feature`).** Rejected: fixes the name collision but keeps three routing surfaces to hand-synchronize, and ADR-0014's own revisit clause already named folding as the simpler end state.
- **A CLI command (`launchrail implement`).** Rejected for ADR-0009's standing reason: implementation is agent work in Claude Code, not an idempotent file write; the CLI owns files, conductors are skills.
- **Keep `disable-model-invocation` on `ralph` and have `implement` restate the loop.** Rejected: two full copies of the orchestration contract is the duplication ADR-0005 exists to prevent; the single-ticket path in `implement` is deliberately the *dispatch* contract (kept textually parallel, same rule as skill↔workflow), not the orchestrator.
- **Auto-start the loop from `launch` once tickets exist.** Rejected: starting a campaign spawns agents and merges PRs; it stays a human decision, unchanged from ADR-0005.

## Consequences
- The answer to "how do I start building" is one line — `/launchrail:implement` — with no table, no module archaeology, no engine names. Planning and building are symmetrical: one door each.
- The plugin's conductor surface shrinks (two conductors → `launch` + a build door; ~4,200 → ~1,950 words) while `workflow.md` grows into the single normative contract — drift now has one home to check instead of three.
- `ralph` is model-invocable; the safety property rests on the front door's hard gate plus prose in `ralph` itself. If unprompted starts are ever observed, the gate placement — not the front door — is what to revisit.
- `init` writes one more managed file on the golden path; projects that select `superpowers` get no ralph materials (unchanged), and `add ralph` shifts from "required step" to "repair/opt-in tool".
- Consuming projects see the migration flip `modules.ralph` on and the workflow file appear on their next `sync` — additive, checksum-guarded, and reported like any managed write.

## Revisit when
- A third implementation provider lands (ADR-0017's registry threshold) — `implement`'s routing section is where it plugs in.
- Real use shows the single-ticket in-session path and Ralph's dispatch contract drifting apart — then the shared contract needs one home, not textual parallelism.
- Unprompted loop starts are observed despite the description-level guard on `ralph`.
