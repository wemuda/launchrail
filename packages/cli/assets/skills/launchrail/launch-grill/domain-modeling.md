<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# The domain-modeling discipline

Run every grill with this discipline active: build and sharpen the project's domain model *as you design*, challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is a one-line habit any skill can do; this discipline is for when the model is being changed.)

## File structure

Most repos have a single context: one `CONTEXT.md` at the repo root, plus `docs/adr/`. If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts and the map points to where each `CONTEXT.md` lives (with `src/<context>/docs/adr/` for context-scoped decisions). The layouts and inference rules are in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. Everything here is project-owned; Launchrail tooling never overwrites it.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. ADRs use the **project's own format**: copy `docs/adr/0000-template.md` (seeded by `launchrail init`), scan `docs/adr/` for the highest existing number, and increment by one — `NNNN-short-slug.md`. One format per project; do not introduce a second.
