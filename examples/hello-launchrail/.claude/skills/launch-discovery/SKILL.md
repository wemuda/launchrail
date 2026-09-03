---
name: launch-discovery
description: The divergent option-space scan before the complexity grill — map the real landscape of libraries, frameworks, vendors, and patterns for the hard parts of the product (alternatives with trade-offs, no winners) and commit the landscape map the grill narrows. Use after the vision (and visual exploration) and before the grill, or when the user asks to explore the tech landscape, survey vendors or libraries, or do discovery research. Composes `launch-research` for depth on any single thread.
---

# Discovery research — map the option space before you narrow it

The stage that keeps the grill honest. A complexity grill is a *convergent* tool: it prunes a design tree. But it can only prune the branches already on the tree — so when the stack is assumed upstream (an `EXECUTION.md`, a README, a founder's default), the grill narrows an assumption instead of the real option space, and the technical-research stage that follows only ever de-risks the first guess. Discovery is the **divergent** counterweight: before the grill narrows anything, widen the field. For each hard part of the product, surface the actual alternatives that exist so the grill has real options to choose between.

Diverge here; converge in the grill; de-risk in technical research. This stage owns the *diverge*.

## Ground rules

- **Diverge, don't decide.** Your job is to widen, not to pick. For each area, present the real contenders and their trade-offs; do **not** crown a winner or collapse to one option — that is the grill's job (stage 4), fed by what you surface here. A discovery doc that recommends exactly one tool per area has skipped its own stage.
- **Bounded by the vision and the intended stack.** This is not open-ended reading. The vision says what's being built; the intended stack (and any existing design system) says what it must fit. Explore the landscape *for this product on this stack* — options that can't plug into the stack are noted and set aside, not explored in depth. This boundary is what keeps discovery from wandering into research nobody asked for.
- **Compose, never duplicate.** Discovery is divergent framing over `launch-research`. Do the framing yourself — carve the product into areas, enumerate contenders — and call the Skill tool with `launch-research` to go deep on any single thread that needs primary sources (real capabilities, maintenance health, license, integration cost). Don't reimplement research; drive it.
- **Everything here is project-owned.** The landscape map is committed to the project under `docs/research/`; Launchrail tooling never overwrites it.
- **Evidence over vibes.** A contender listed from memory is a lead, not a finding. Where a choice is load-bearing, confirm the fact — does it actually do X, is it maintained, what's the license — through `launch-research` rather than asserting it.

## Process

1. **Read the inputs.** `docs/vision.md` and the intended stack (from the vision, `.launchrail.yml`, an `EXECUTION.md`/README, or by asking). Note the existing design system if one was recorded during alignment — it constrains front-end options.
2. **Carve the product into areas of genuine choice.** Not everything needs discovery — most of a stack is settled or obvious. Find the handful of areas where the option space is real *and* the decision is load-bearing: the parts a grill would otherwise narrow blindly. They usually cluster around auth/identity, data storage and access, background/async work, third-party integrations, and whatever the vision's core mechanic demands (session replay, real-time transport, payments, …). Confirm the shortlist with the user — three to six areas is the useful range; don't manufacture choice where there is none.
3. **For each area, enumerate the real contenders.** List the actual options that fit this stack — libraries, frameworks, hosted services, vendors, and the roll-your-own baseline. For each: what it is, what it buys you, what it costs (integration effort, lock-in, license, operational burden), and where it breaks down for *this* vision. Include the boring and the build-it-yourself options; a landscape that lists only the trendy pick is not a landscape.
4. **Go deep where it's load-bearing.** For the areas where the choice most shapes the architecture, drive `launch-research` on the specific threads — verify real capabilities against the vision's needs, maintenance and community health, license, and concrete integration cost on this stack. Where research agents aren't available in the session, say so and fall back to a clearly-marked best-effort survey — do not silently skip the depth pass.
5. **Write the landscape map.** Commit one doc per area (or one grouped doc) under `docs/research/`, named `discovery-<area>.md`. Each area records: the contenders with their trade-offs, what's verified vs. assumed, any options ruled out with the reason, and — most importantly — the **questions this hands to the grill**: the decisions now teed up with real options behind them.
6. **Hand to the grill — with the rail banner.** This stage does not choose. Route to the complexity grill (`launch-grill`, stage 4), which takes the landscape as input and narrows it into surviving constraints. Close with the banner from [`workflow.md`](../launch/workflow.md)'s phase view: what you surveyed and where the docs are under Done, the grill as Now, and the one next action on the `➤` line.

## What this stage is not

- **Not the grill.** It opens options; it doesn't close them. If you find yourself arguing for one choice, stop and hand that argument to the grill.
- **Not technical research.** Technical research (stage 5) runs *after* the grill and de-risks the decisions it made. Discovery runs *before* the grill and widens the decisions it will make. Same research skill, opposite direction — one diverges, one converges.
- **Not a stack rewrite.** Options that can't fit the intended stack are noted and set aside, not campaigned for. If discovery surfaces that the intended stack itself is wrong for the vision, that's a finding for the grill and possibly an ADR — raise it, don't act on it here.
