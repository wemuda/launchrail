---
name: launch-project-alignment
description: The on-ramp for adopting an existing, mid-development codebase into the Launchrail loop. Instead of starting from a blank vision, it inventories what the project already has, infers a draft vision from the code, interviews only about the gaps, and detects an existing design system — then routes the real gaps back into the normal workflow. Use when initializing Launchrail on a project that already has code (`origin: existing` in `.launchrail.yml`), when the user asks to adopt, align, or onboard an existing project, or when `launch` sends an existing project to stage 1.
---

# Project alignment — adopting an existing project

The Launchrail loop is written for a project that starts from an idea. A project already mid-development starts somewhere in the middle: it may already have a working app, a design system, tests, even docs — but none of Launchrail's artifacts. This skill is the **on-ramp**: it aligns what you already have with the artifacts the loop expects, inferring what the code already answers and asking only about what it doesn't. It is not a parallel workflow — it gets an existing project to a real vision and a clear map of gaps, then hands back to `launch`.

## Ground rules

- **Align, don't rebuild.** The goal is to reach the loop's frontier with the least work, not to re-derive decisions the codebase already embodies. This is a short pass, not a from-scratch run.
- **Infer, then confirm — never fabricate certainty.** You may propose a vision, a target user, a design-system baseline from reading the code. Mark every inference as inferred, show your evidence, and get the user's sign-off before committing anything. A confident guess presented as fact is worse than an open question.
- **Ask only what the repository can't answer.** Read the README, `package.json`, the directory structure, routes/models/entrypoints, and existing docs first. Spend the user's attention on genuine gaps and open questions, not on things the code already states.
- **Compose, never duplicate.** This skill does not own any artifact. The vision is written and committed by `launch-vision-creation`; ADRs, specs, tickets, and design validation stay owned by their stages. This skill front-loads the inference and the gap interview, then routes to those owners. It mirrors the composition contract in [`workflow.md`](../launch/workflow.md).
- **Additive and non-destructive.** Everything you touch (a drafted vision, the `AGENTS.md` project-purpose line) is project-owned. Never overwrite existing product knowledge; if `docs/vision.md` already exists, this is a revision, not a rewrite.

## Process

1. **Confirm the on-ramp applies.** Read `.launchrail.yml`. This skill is for `origin: existing`; if the manifest says `origin: new`, say so and route to `launch-vision-creation` instead — a blank start doesn't need alignment.
2. **Inventory the project against the artifact map** (below). Read the repo — README, `package.json`/manifest, folder layout, entrypoints, routes, data models, config, existing `docs/`. Produce an **alignment map**: for each Launchrail artifact, mark it *present*, *partial*, or *missing*, with the evidence you found. This map is what you report at the end.
3. **Align the vision** — the one artifact worth inferring:
   - If `docs/vision.md` exists and is real (not the bare template), read it and note where it's thin or stale. This becomes a revision.
   - If it's missing or template-only, **draft an inferred vision** from the inventory: what the product appears to be, who it seems to serve, what it does today, and the assumptions and non-goals the code implies. Mark clearly what is inferred vs. observed, and list the open questions the code can't resolve (the real target user, the bet, the success signal).
   - **Interview the user on those gaps only** — a few questions at a time, in their language. Don't re-ask what you inferred with confidence; confirm it.
   - **Hand the result to `launch-vision-creation`** to finalize and commit as a *revision* — it owns the template, the commit, and the `AGENTS.md` project-purpose sync. The interview is already done; it should confirm and commit, not re-interview from scratch.
4. **Detect the design system.** Look for an existing one: design tokens, a theme or Tailwind config, a component library, Storybook, a CSS framework, or Figma links in the docs. If a real design system exists, record it as the **baseline** for visual exploration (stage 2) and design validation (stage 8) — link it from the vision — so those stages extend what's there instead of exploring from zero. If none exists, note it as a genuine stage-2 gap.
5. **Map the remaining artifacts, don't manufacture them.** For ADRs, the MVP spec, tickets, and the verification setup, record present/partial/missing in the alignment map. Do not back-fill them here — each has an owning stage. Where a project already has, say, architecture docs or a test suite, note that the corresponding stage is largely satisfied so `launch` doesn't send the user to redo it.
6. **Report and hand back.** Present the alignment map: what's already aligned, what you inferred and the user confirmed, and the real gaps in loop order. Then route to `launch` to drive the first real gap. Leave the user a clear picture of where their existing project sits on the rail and what's next.

## The artifact map

How each Launchrail artifact shows up in an existing project, and what to do:

| Artifact | Detect in an existing repo | If present | If missing |
|---|---|---|---|
| Vision (`docs/vision.md`) | The file; else infer from README, deps, routes/models | Revise where thin | Infer a draft, gap-interview, hand to `vision-creation` |
| Design system | Tokens, theme/Tailwind config, component lib, Storybook, Figma links | Record as the baseline; link from the vision | Note as a stage-2 gap |
| Architecture decisions (`docs/adr/`) | ADRs beyond the template; or de-facto decisions in code/docs | Note stage 6 as largely satisfied | Note as a gap; capture load-bearing existing decisions as ADRs later |
| MVP spec (`docs/specs/`) | Spec docs, PRDs, design docs | Note stage 7 as partial/satisfied | Real gap — owned by the spec stage |
| Tickets | The tracker in `.launchrail.yml` (issues/backlog) | Note stage 9 as partial | Real gap — owned by `launch-tickets` |
| Verification | Test suite, CI config, Playwright | Wire `testing` commands in `.launchrail.yml`; note stage 11 partial | Note as a gap |

## What this skill does not do

- It does not run the whole loop. It reaches a confirmed vision and a gap map, then hands to `launch`.
- It does not write ADRs, specs, or tickets, or start Ralph. Those stay with their owners and are user-driven.
- It does not overwrite anything the project already owns.
