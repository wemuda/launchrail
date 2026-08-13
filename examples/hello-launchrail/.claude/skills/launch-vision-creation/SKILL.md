---
name: launch-vision-creation
description: Turn a raw product idea into a committed docs/vision.md capturing product intent, target users, assumptions, non-goals, and success signals. Use when a project has no vision document yet, when the user describes a new product idea, or when they ask to write or revise the vision.
---

# Vision creation

Produce `docs/vision.md`: a short, honest statement of what this product is, who it serves, and what it deliberately is not. It is the first artifact of the Launchrail loop and the input to design exploration, discovery research, and the complexity grill.

## Ground rules

- `docs/vision.md` is **project-owned**: it belongs to the user and their repository. If it already exists, this run is a revision — read it first and change only what the user wants changed. Never regenerate it wholesale.
- Capture broad intent, not a feature list. The vision states the problem and the bet; screens, endpoints, and data models come later in the loop.
- Short beats complete. One to two pages. A vision nobody rereads is worthless.
- Every assumption must be explicit and falsifiable — the complexity grill stage exists to attack them, so write them down in attackable form.
- Non-goals carry as much weight as goals. A vision that excludes nothing decides nothing.

## Process

1. **Read what exists.** Check for `docs/vision.md`, a README, and any notes the user points at. Do not ask questions the repository already answers.
2. **Interview the user** — briefly, a few questions at a time, in their language:
   - What problem hurts, and for whom? How do those people cope today?
   - Why this, why now — what is the bet that makes this worth building?
   - Who is the first concrete user (a person or team you could name), as opposed to the eventual market?
   - What is deliberately out of scope for the MVP?
   - What observable signal would say the bet is working — and what would say it failed?
   - Which assumption, if wrong, kills the product?
3. **Draft** `docs/vision.md` using the template below. Use the user's words where they were precise; sharpen where they were vague, and say so.
4. **Challenge the draft once.** Before presenting it, check: is any "goal" actually a feature? Is any assumption untestable as written? Is the non-goals section empty or evasive? Fix what you find.
5. **Present and iterate** until the user approves.
6. **Sync the agent contract.** If the seeded `AGENTS.md` still carries the TODO under `## Project purpose`, replace it with a one-paragraph distillation of the approved vision — what this is, who it serves, what it is not. Touch only that section: `AGENTS.md` belongs to the project, and the rest of it is not this skill's business.
7. **Commit** `docs/vision.md` and the `AGENTS.md` update together (respect the project's commit conventions).
8. **Hand off.** Point the user at the next stages of the loop: visual exploration in Claude Design to make the intent concrete, discovery research (`launch-discovery`) to map the real options for the vision's hard parts, then the complexity grill (`launch-grill`) to attack the assumptions just recorded. See [`workflow.md`](../launch/workflow.md) for the full stage order.

## Template

```markdown
# Vision — <product name>

## Problem
Who hurts, how, and how they cope today.

## Bet
The one-sentence wager this product makes, and why now.

## First users
The concrete person or team this serves first — not the eventual market.

## What the MVP must prove
The smallest outcome that validates the bet.

## Assumptions
Numbered, falsifiable statements. Each one is an attack surface for the grill.

## Non-goals
What this product deliberately does not do, and for how long that holds.

## Success signals
Observable signals that the bet is working — and the signal that would call it failed.
```
