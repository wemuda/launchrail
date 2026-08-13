# ADR-0020: Launchrail owns its complete skill set

## Status
Accepted — supersedes the vendoring half of [ADR-0019](0019-vendor-skills-retire-plugin.md) (skills still ship as managed files in the consuming repo; the pinned upstream snapshot is retired); amends [ADR-0017](0017-implementation-loop-provider.md) (the `superpowers` provider and the `implementationLoop` manifest field are removed — Ralph is the implementation loop)

## Context
ADR-0019 made skills travel as files in the consuming repo — that part works and stays. But it filled the skill set two ways: Launchrail's own `launch-*` skills plus a pinned, MIT-attributed snapshot of Matt Pocock's skills under their bare upstream names, refreshed deliberately through a vendoring pipeline. Separately, ADR-0017 made stage 10 a provider seam so obra/superpowers could replace Ralph.

Living with that composition for even one iteration showed the seams leaking:

1. **The rail already replaces or guards every upstream skill it gates on.** Upstream `implement` was dropped (superseded by `launch-implement`), `resolving-merge-conflicts` was replaced, and the conductor has to carry warnings like "stage 4 is `grill-with-docs`, never bare `grilling`" because the generic upstream skill doesn't produce the committed artifact the stage gates on. Upstream `to-spec` publishes specs to the tracker with the `ready-for-agent` label — directly against the rail's own rule that `ready-for-agent` marks tickets, never specs, and that specs live in `docs/specs/`. Composition means steering around the composed skills.
2. **Most of the snapshot is ballast.** The rail names six of the eighteen vendored skills (`research`, `grilling`/`grill-with-docs`, `wayfinder`, `to-spec`, `to-tickets`, `code-review`, plus the setup skill). The other twelve ship into every consumer unused, and one — `setup-matt-pocock-skills` — invites installing a live upstream copy beside the pinned managed one.
3. **Two vocabularies, one product.** Consumers see a mix of `launch-*` skills and bare upstream names, two conceptual owners, and a NOTICE explaining the split. The product is one workflow; the skill set should read as one system.
4. **The provider seam has no second user.** `superpowers` shipped experimental days ago; it drags a provider registry, a wizard question, a manifest field, plugin install/declare/doctor machinery, and a per-machine plugin exception through the whole codebase for an option nobody selected.
5. **Bare upstream names collide.** ADR-0019 itself flagged the residual clash risk of vendored bare names (`code-review` collides with Claude Code's built-in command today).

ADR-0019's own "revisit when" anticipated reconsidering the snapshot if maintaining it became a burden. The burden showed up immediately — as overrides, guard rails, and contract mismatches rather than refresh effort.

## Decision
**Launchrail is one complete, independent skill system.** Every skill on the rail is Launchrail's own, `launch-` prefixed, contract-native, and shipped as managed files exactly as ADR-0019 established. Nothing on the rail composes an external skill or plugin.

1. **The workflow-critical upstream skills are absorbed, not composed.** Each becomes a Launchrail skill written to the rail's contract (committed artifacts, stage gates, the `verify` gate, the rail's label vocabulary):
   - `research` → `launch-research` (findings land under `docs/research/` by default)
   - `grilling` + `grill-with-docs` + `domain-modeling` → `launch-grill` (one skill; the interview always ends in the committed `docs/research/` constraints doc, eliminating the "never bare `grilling`" footgun; the domain-modeling glossary/ADR discipline rides along as the skill's reference files, with ADRs using the project's seeded `docs/adr/0000-template.md`, not a second format). The grill deliberately serves **two contexts** — the foundation's stage 4 and the feature grill that opens every delivery-loop path before spec and tickets — so it is written as one general grill, not a stage-4 tool.
   - `wayfinder` → `launch-wayfinder`
   - `to-spec` → `launch-spec` (the spec is committed to `docs/specs/` — the stage-7 artifact; a tracker copy is optional and never labeled `ready-for-agent`)
   - `to-tickets` → `launch-tickets`
   - `code-review` → `launch-code-review`
   - `setup-matt-pocock-skills` → **retired, not absorbed as a skill.** Upstream needed an interactive setup skill because it has no CLI; Launchrail has a manifest, seeded files, and `sync`. Its outputs are derivable from init's answers, so init/sync **seed** them: `docs/agents/issue-tracker.md` (templated from the manifest's `issueTracker` — the enum grows to `github | gitlab | linear | local | none` — and carrying the rail's fixed label vocabulary) and `docs/agents/domain.md` (the domain-doc consumer rules). Seeded means project-owned after creation; deleting one makes the next `sync` re-seed it from the manifest's current answers. Stage 0 is just `init`.
2. **The rest of the snapshot is dropped.** `grill-me`, `teach`, `triage`, `prototype`, `handoff`, `tdd`, `diagnosing-bugs`, `codebase-design`, `improve-codebase-architecture` are not absorbed — the rail never names them. `assets/skills/vendor/` and its `VENDOR.json` pipeline are deleted.
3. **Attribution stays, honestly.** Skills whose text derives from the MIT-licensed upstream carry a one-line derivation note, and `.claude/skills/NOTICE.md` (replacing `NOTICE-mattpocock.md`) reproduces the MIT license and names the derived skills. Matt Pocock is credited as the origin of the methodology in the README. "Independent" changes who owns the text, not who gets credit.
4. **The superpowers provider is removed; Ralph is the implementation loop.** The `implementationLoop` manifest field, the provider registry (`lib/implementationLoops.ts`), the wizard question, and the plugin install/declare/doctor machinery (`lib/claudeCli.ts`) go away. `launchrail verify` gating every merge — ADR-0017's real contract — is unchanged; it is simply Ralph's contract now rather than a provider interface.
5. **A migration carries consumers across.** `2026-08-workflow-skills-independence` — idempotent, dry-runnable, checksum-guarded — removes the vendored skill files and `NOTICE-mattpocock.md` from `.claude/skills/` (only where unmodified since Launchrail wrote them; local edits are kept and reported), drops their lockfile entries, deletes the `implementationLoop` key from the manifest (comment-preserving YAML round-trip), and — where the key said `superpowers` — removes the superpowers plugin declaration Launchrail added and installs Ralph's materials. The absorbed `launch-*` skills flow through the regular managed-file surface on the same `sync`.
6. **Upstream stays an input, deliberately.** Launchrail monitors `mattpocock/skills` (and the ecosystem) and translates improvements worth having into its own skills — reading diffs as inspiration, not patches. This is more work per upstream change than a snapshot refresh; it is accepted because the skills diverge toward the rail's contract anyway.

## Alternatives considered
- **Keep the pinned vendored snapshot (status quo, ADR-0019).** Free-flowing upstream quality via re-copy, but the overrides list, the stage guard rails, and the `to-spec`/label contract mismatch show the composition already fighting the rail. Rejected: the trend line ends at ownership; better to arrive deliberately while the consumer count is ~1 than override-by-override later.
- **Absorb only the conflicting skills; keep composing the rest.** Smallest diff, but preserves two vocabularies, the vendor pipeline, and the bare-name collisions for the skills that remain. Rejected: the split model is the complexity, not any single skill.
- **Reimplement Superpowers as a Launchrail loop.** Forking a large, live execution library with none of the pinned-snapshot safety. Rejected outright; the choice was only ever keep-the-seam or remove-it.
- **Keep the provider seam with Ralph as the sole registered loop.** Cheap, preserves the "conduct any loop" claim. Rejected: a registry with one permanent entry is ceremony ahead of need (and the claim can return with a future ADR if a real second loop shows demand); the manifest field would keep a dead enum alive in every consumer.
- **"Inspiration credit" without MIT attribution.** Rejected: the absorbed skills start from upstream text (which the MIT license permits); carrying the license notice is the legally clean and honest position. Skills rewritten from scratch may drop to a plain credit later.

## Consequences
- **One system.** Every skill a consumer sees is `launch-*`, written to the rail's artifact contract; the stage table names no external owner. Collisions with users' own skills or built-in commands are gone by construction.
- **Contract mismatches become impossible instead of guarded.** The spec lands in `docs/specs/`, the grill always writes its artifact, ADRs have one format — because the skills are written against the gates, not adapted to them.
- **Launchrail owns prompt quality now.** Upstream improvements no longer arrive by re-copy; keeping the absorbed skills sharp means monitoring upstream and translating. A hasty rewrite can silently regress a stage — absorbed skills change under dogfood evidence, not on vibes.
- **Less machinery.** The vendor pipeline, provider registry, plugin install/declare/doctor paths, one wizard question, and one manifest field are deleted. `init` never invokes the `claude` CLI.
- **Consumer churn, once.** The next `sync` removes the bare-name skills and delivers the absorbed set — a large but mechanical, reviewable diff. Old manifests with `implementationLoop` stay valid (the key is removed by migration; unknown keys never fail validation).
- **AGENTS.md's "compose upstream" convention narrows to runtime tools** (Claude Design, Playwright): compose tools the workflow *drives*; own the skills the workflow *is*.

## Revisit when
- A second implementation loop has a real user — reintroduce the provider seam via a new ADR (the verify-gate contract in ADR-0017 remains the design to build on).
- An absorbed skill and its upstream ancestor diverge so far that monitoring upstream stops paying — drop the monitoring for that skill and note it in the NOTICE.
- The ecosystem produces a skill-distribution or composition mechanism that makes external skills contract-safe (parameterizable gates, namespacing) — reconsider composing where it beats owning.
