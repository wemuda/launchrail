# ADR-0015: Discovery research — a divergent stage before the grill

## Status
Accepted

## Context
The workflow placed **technical research** (Matt Pocock's research skill) *after* the complexity grill, fed the grill's surviving constraints. The stated rationale — "research without grill constraints answers questions nobody asked" ([`docs/workflow.md`](../../plugins/launchrail/docs/workflow.md)) — is sound for *convergent* research: de-risking decisions the grill already made. But it left the pipeline with no *divergent* step.

The grill is a convergent tool: it prunes a design tree, and it can only prune branches already on the tree. When the stack is assumed upstream (an `EXECUTION.md`, a README, a founder's default), the grill narrows *within* that assumption and technical research only ever de-risks the first guess — nothing on the rail asks "what are the real alternatives here?" A dogfood grill on an auth/orgs/projects spec showed the symptom cleanly: `better-auth` was assumed before the grill ran, the grill narrowed its usage, and research verified the already-chosen tool — the field of alternatives (Lucia, Auth.js, Clerk, WorkOS, roll-your-own) was never mapped, so it was never actually chosen.

## Decision
Add **Discovery research** as a distinct, Launchrail-owned stage that runs after visual exploration and **before** the complexity grill — the *divergent* counterpart to the existing *convergent* technical-research stage.

- **Input:** the vision + the intended stack (and any existing design system).
- **Job:** carve the product into the handful of areas where the option space is real and load-bearing, and for each enumerate the actual contenders — libraries, frameworks, vendors, hosted services, roll-your-own — with their trade-offs. It **does not pick winners**; it hands the grill real options to choose between.
- **Artifact:** a landscape/options map committed under `docs/research/` (`discovery-<area>.md`), which becomes the grill's input.
- **Composition:** a new `launchrail:discovery` skill owns the divergent *framing* and composes Matt Pocock's research skill for depth on individual threads — it does not duplicate it.

The tech-decision arc becomes **diverge → converge → de-risk**: discovery widens the field, the grill narrows it, technical research de-risks the survivors. The existing technical-research stage and its prompt are unchanged; discovery is added beside it, not merged into it.

Inserting a numbered stage renumbers the rail from the grill onward: grill 3→4, technical research 4→5, ADRs 5→6, spec 6→7, design validation 7→8, tickets 8→9, implementation 9→10, verification 10→11, release 11→12. `deep-research` now denotes the whole arc (discovery → grill → technical research). Discovery runs by default in `standard-mvp` and `high-rigor`; `spike` may skip it (recorded in the vision's non-goals). It is primarily a foundation stage; per-feature (`start-feature`) it earns its place only on a large feature that opens genuinely new tech territory.

## Alternatives considered
- **Broaden the existing research prompt to be exploratory.** Rejected: it conflates two opposite motions in one stage (diverge vs. de-risk) and, worse, keeps discovery *after* the grill — you cannot grill options you never discovered. Divergence has to precede convergence.
- **A pre-grill discovery brief inline in `workflow.md`, no new skill.** Rejected: the conductor invokes skills by name and does not improvise multi-step method from prose; the divergent method is reusable and load-bearing enough to be an invokable skill, consistent with `vision-creation`/`design-validation` owning their stages.
- **Fold discovery into the vision stage.** Rejected: the vision is product intent, deliberately tech-agnostic; loading it with vendor surveys muddies what the vision is for, and discovery needs the intended stack as input — which the vision establishes.

## Consequences
- The grill narrows a real option space instead of an assumption; technical research still de-risks, unchanged.
- One more foundation stage (skippable in `spike`), and a rail renumber that ripples through the contract (`docs/workflow.md`), the conductor (`launch`), and the operational skills that route by stage number (`project-alignment`, `start-feature`).
- Prior ADRs (0009, 0013) reference the pre-insertion stage numbers and are left as historical records — the canonical map is `docs/workflow.md` plus the `launch` stage map.
- Three stages now write to `docs/research/` (discovery, grill, technical research); discovery uses a `discovery-*.md` filename convention so its artifact stays distinguishable for frontier detection.
- The `assets/how-launchrail-works.png` diagram is now stale (missing Discovery research) and needs regenerating.

## Revisit when
Discovery consistently surfaces nothing the grill couldn't have found on its own — the divergence isn't earning its stage — or the option-space scan proves better fused into the grill than run before it.
