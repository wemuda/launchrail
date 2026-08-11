# ADR-0014: A start-feature conductor drives the per-feature delivery loop

## Status
Superseded by [ADR-0018](0018-implement-front-door.md) — the sizing decision and per-feature routing folded into `launch`; the `start-feature` skill is removed. (This ADR's own "revisit when" named exactly this consolidation.)

## Context
`launch` ([ADR-0009](0009-launch-orchestrator-skill.md)) is the loop's conductor, but it is shaped around a *fresh* project moving once from idea to its first release: detect the frontier across the eleven stages and drive the first one that isn't done. Real projects spend most of their life *after* that first release, adding one feature at a time. That recurring work carries a decision `launch` doesn't model: **how much planning does this feature need?** A copy tweak and a new subsystem do not deserve the same grill → spec → design-validation → tickets pipeline. Today the user either over-plans small work or under-plans large work, and the sizing judgment lives only in people's heads — the workflow doc describes one path to the first MVP, not how a feature scales its planning.

## Decision
Add a `start-feature` skill: a second conductor, sibling to `launch`, for the per-feature delivery loop on an already-founded project.

- It **frames** the feature, confirms the foundation exists (else routes to `launch`), then **sizes** it — large / semi / small — proposing a size with its reasoning and letting the user override.
- Each size maps to a **planning subset** of the existing owners: large = `wayfinder` → grill → `to-spec` → design-validation → `to-tickets`; semi = grill → `to-spec` → *(optional)* design-validation → `to-tickets`; small = grill → `to-tickets`.
- The manifest's `mode` **calibrates rigor on top of size** (spike relaxes, high-rigor tightens), reusing the mode contract `launch` and the workflow doc already honor.
- It **routes to each stage's existing owner** and never reimplements one; sizing is read-only; every write stays inside the owner it routes to. It **never starts Ralph** unprompted, honoring that loop's user-invoked-only contract.
- It hands off to the **Ralph loop**, points at verification, then offers the next feature — closing the loop.

## Alternatives considered
- **Fold sizing into `launch`.** Rejected: `launch`'s job is "detect the frontier and drive the next unfinished stage." Sizing is a different question asked at a different moment — the frontier is already "spec"; the open question is how deep to go. Overloading one skill with both blurs a clean model and makes the already-dense `launch` harder to read. The two share every stage owner, so splitting them costs no duplication.
- **A CLI command (`launchrail feature`).** Rejected for the reason ADR-0009 rejected `launchrail next`: these stages are interviews and design work, not idempotent file writes. The CLI owns files; conductors are skills.
- **Encode the sizing table as fixed, silent rules.** Rejected: size is a judgment about scope and unknowns the user often knows better than the committed artifacts show. The skill proposes and the user overrides; it never sizes silently.

## Consequences
- Easier: one entry point for "the next feature," with planning depth matched to the work instead of guessed; the size → path mapping is written down where it used to be folklore.
- Harder: a third routing surface (`docs/workflow.md`, `launch`, now `start-feature`) that must stay consistent with the stage owners. Like `launch`, the skill points at the workflow doc as the contract to keep the duplication shallow.
- Constrained: `start-feature` may only frame, size, and route. Any real stage work belongs in a stage owner, not here — the same constraint ADR-0009 placed on `launch`.

## Revisit when
- The size buckets prove too coarse or too fine in real use (a fourth size, or two collapsing into one).
- `launch` and `start-feature` drift far enough that a single conductor with a mode flag would be simpler than two.
- The sizing heuristic wants signals the CLI could compute (diff size, touched modules, ticket count) — expose them through `status` rather than guessing in prose.
