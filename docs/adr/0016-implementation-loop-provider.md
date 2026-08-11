# ADR-0016: The implementation loop is a provider, not a fixed stage

## Status
Accepted

## Context
Launchrail's rail runs Vision → … → Tickets (stages 1–9), then **Implementation** (stage 10): the loop that turns ready tickets into verified, merged code. Stage 10 is hard-wired to one owner, **the Ralph loop** — `launchrail:ralph` plus the managed `.claude/workflows/ralph.js` (ADR-0005). Both conductors name it directly (`launch` stage map, `start-feature` step 5), and `workflow.md` describes stage 10 as Ralph.

That coupling is fine as long as Ralph is the only loop anyone would run. But the value proposition is that Launchrail is *where the developer launches* — the single conductor over every delivery loop — and some teams already have an implementation methodology they prefer over Ralph. [Superpowers](https://github.com/obra/superpowers) (obra) is the concrete example: a mature execution library (brainstorming → writing-plans → **TDD** → systematic-debugging → code-review → finishing-branches). A developer who lives in Superpowers shouldn't have to leave the rail to use it, and Launchrail shouldn't fork its foundation to accommodate it.

The tempting framing — "let the wizard pick Matt Pocock **or** Superpowers as the skills provider" — is a category error. Matt Pocock's skills own Launchrail's *planning* stages (grill, research, spec, tickets); Superpowers ships **no** vision/grill/research/spec/tickets skill. They barely overlap. Superpowers competes with **Ralph**, not with Matt Pocock — it owns the *implementation* half of the loop, the exact slot stage 10 fills. So the real seam is not "swap the planner"; it is "**swap the implementation loop**," and it lives at one place: the handoff after stage 9.

## Decision
Make **the implementation loop a provider the project selects**, recorded in the manifest as `implementationLoop`. Everything through stage 9 is unchanged. Stage 10 stops naming Ralph directly and instead routes to the selected provider.

- **Providers.** `ralph` (built-in, the default) and `superpowers` (selectable, **experimental** in this iteration). The set is a closed enum in `lib/implementationLoops.ts`, the single source of truth for each provider's label, wizard hint, stage-10 entry, and any Claude Code plugin it needs.
- **The contract that keeps loops swappable — Launchrail owns both edges.** Whichever loop runs, Launchrail owns the boundary on each side of it:
  - **Input:** tickets carrying the `ready-for-agent` label and explicit `Blocked by: #n` edges (already the standard `to-tickets` output).
  - **Gate:** every ticket reaches a merge that passes **`launchrail verify`** — plus browser-smoke evidence where the browser-testing module is enabled.

  The provider does the *implementing*; **verification stays Launchrail's**, so "evidence over assertion" (the definition of done) holds no matter which engine runs between tickets and merge. A loop is a valid provider exactly when it honors this input/gate contract.
- **Where the choice lives.** A new typed manifest field, `implementationLoop: "ralph" | "superpowers"`, single-select like `mode`/`origin`. It is **optional-with-default (`ralph`)** in the validator, so every manifest written before this ADR stays valid and no lockfile migration is required. `init` writes it explicitly; the wizard adds one question.
- **Routing.** The stage-10 rows in `launch` and `start-feature` read `implementationLoop` and hand off to that provider's entry, under the unchanged rule that the loop is **never started unprompted**. `doctor` reports the configured loop and, for a non-default provider, points at its setup.
- **Superpowers is experimental this iteration.** `init` records the choice, offers to install the Superpowers plugin (best-effort; failure prints manual guidance), and the conductor hands off to its execution skills with an explicit "experimental" note — but Launchrail does **not** yet hard-code Superpowers' internal stage-10 skill names or deep-wire its steps. Ralph remains the fully-wired default. This ships the *choice* and the *seam* now, and defers a provider's brittle internals until a real Superpowers dogfood justifies pinning them.

## Alternatives considered
- **Provider-swap the planning stages (Matt Pocock ↔ Superpowers).** Rejected: false equivalence. Superpowers owns no planning stage; swapping it in would leave stages 3–9 unowned. The libraries are complementary (Pocock plans, Superpowers implements), not alternative — this is exactly the "assume the field is the one option you already had in mind" trap ADR-0015 was written about.
- **Generalize the `modules` map instead of a typed field.** Rejected: the implementation loop is a single-select (you run one loop), not a set of independent on/off capabilities. A typed enum matches `mode`/`origin`, drives routing directly, and can't express the invalid "ralph and superpowers both on" state a boolean map would allow. Ralph's *files* still install through `launchrail add ralph` and its `modules.ralph` flag — the provider field selects the loop; the module installs the built-in one's assets.
- **Fully wire Superpowers now (install + deep stage-10 skill mapping + doctor check).** Rejected for this iteration: its exact skill-invocation contract is external and moving; hard-coding it before a real run would ship guesses into managed routing. Ship the seam with Ralph as the working default and Superpowers as an honest, experimental option first.
- **Leave stage 10 hard-wired to Ralph.** Rejected: it makes Launchrail's "one conductor over your whole loop" claim false for any team with an existing implementation methodology, and the seam is cheap and well-bounded (one handoff point, both edges already Launchrail-owned via the ticket and verify contracts).

## Consequences
- Launchrail can conduct a loop it does not own, without forking the foundation: the planning spine (Launchrail + Matt Pocock) is untouched, and only the stage-10 handoff becomes provider-aware.
- One new manifest field and one new wizard question; older manifests keep working via the default, so `sync` needs no migration for this change.
- The invariant "`launchrail verify` gates every merge" is now the *defining* contract of a provider, not an incidental Ralph property — it must stay true for any loop added later, and `doctor`/the conductors are written to assume it.
- Superpowers is selectable but experimental: a user who picks it gets an honest handoff and setup pointer, not a fully managed stage-10 run. Promoting it to first-class (pinned skills, doctor check, `.claude/settings.json` declaration so teammates auto-get it) is a follow-up gated on a real dogfood.
- `workflow.md`, the `launch` stage map, and `start-feature` step 5 stop reading as "Ralph is stage 10" and start reading as "the selected loop is stage 10, Ralph by default."

## Revisit when
A second non-Ralph provider is wanted (the two-provider registry earns a real abstraction over install/declare/route/doctor instead of per-provider branches), or a Superpowers dogfood justifies promoting it from experimental to a fully-wired, teammate-declared provider — at which point its stage-10 skill mapping and a `.claude/settings.json` declaration get pinned.
