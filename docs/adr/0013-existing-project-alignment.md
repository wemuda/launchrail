# ADR-0013: Adopting existing projects — the `existing` origin and the alignment on-ramp

## Status
Accepted — builds on [ADR-0009](0009-launch-orchestrator-skill.md) (the `launch` conductor) and [ADR-0012](0012-init-wires-imports-into-existing-claude-md.md) (init adopting an existing repo's files). The skill ships as the managed `launch-project-alignment` skill since [ADR-0019](0019-vendor-skills-retire-plugin.md)/[ADR-0020](0020-independent-skill-set.md); stage numbers in this ADR predate the [ADR-0015](0015-discovery-research-stage.md) renumber.

## Context
ADR-0012 made `init` safe and additive on a repository that already exists. But adoption was only half-solved. The workflow itself (ADR-0009) is written for a greenfield start: `launch` detects the frontier from committed artifacts and, finding none, treats a mid-development project as stage 0 — routing the user to `vision-creation`, which interviews for a vision from scratch. A project that already has a working app, a design system, tests, and a README is asked to start as if from an idea. That re-derives what the code already answers and makes Launchrail feel bolted-on rather than adopted.

Two things were missing:

1. Nothing recorded *that* a project was being adopted, so nothing could route differently.
2. There was no cheaper on-ramp — a way to reach the loop's first real artifact (a vision) by inferring from the code and asking only about the gaps, instead of a full from-scratch interview.

## Decision
- **A new manifest field, `origin` (`new` | `existing`).** The `init` interview asks "new or existing project," and defaults to `existing` when detection finds a `package.json` or pre-existing agent files (a repo with real work in it). It is optional and defaults to `new` on read, so manifests written before this field stay valid. It is recorded in the lockfile decisions alongside `mode`.
- **A new plugin skill, `project-alignment`,** the on-ramp for `origin: existing`. It inventories the codebase against Launchrail's artifact set; infers a draft vision from the README, dependencies, routes, and models; interviews the user only on the gaps the code can't answer; and detects an existing design system, recording it as the baseline for visual exploration (stage 2) and design validation (stage 7). It **composes, never duplicates**: the vision is finalized and committed by `vision-creation` (as a revision), and every other artifact stays owned by its stage. Its output is a confirmed vision plus an alignment map of real gaps, handed back to `launch`.
- **`launch` routes on `origin`.** When the frontier is stage 1 and `origin: existing`, `launch` routes to `project-alignment` instead of `vision-creation`; `align`/`adopt` are stage keywords for it. Everything downstream of the vision is unchanged — alignment is an on-ramp onto the same rail, not a parallel workflow.

## Alternatives considered
- **Force the greenfield flow.** Rejected: it re-interviews the user about things the codebase already states and produces a vision divorced from the running product.
- **A separate, parallel "brownfield" workflow.** Rejected: it would duplicate every stage and split the contract in two. The stages after the vision are identical; only the on-ramp differs.
- **Pure-CLI inference (generate a vision non-interactively in `init`).** Rejected: inferring intent from code and resolving the gaps needs a conversation and repo reading — an agent skill, not a deterministic CLI step. The CLI's job is to record `origin`; the skill's job is to align.
- **Infer silently and commit.** Rejected: an inferred vision presented as fact is worse than an open question. Inference must be marked as inferred and confirmed before anything is committed.

## Consequences
- Easier: adopting a mid-development project reaches a real vision and a gap map with the least work; an existing design system is reused as a baseline instead of re-explored; the user is never asked what their code already answers.
- Harder: `launch` now branches on `origin`, and `project-alignment` must stay disciplined about composing (not reimplementing) `vision-creation` and the downstream stages — the same duplication risk ADR-0009 guards against.
- Constrained: `project-alignment` owns no artifact and writes nothing the stage owners don't; it may infer and propose, but only the owning skills commit. `origin` calibrates the on-ramp only — it never changes the stage order or which stages `mode` may skip.

## Revisit when
- Adoption reveals a recurring gap worth its own skill (e.g. reverse-engineering ADRs from load-bearing decisions already in the code).
- `origin` needs more than two values (e.g. distinguishing a rewrite from an incremental adoption).
- The alignment map becomes worth committing as its own durable artifact rather than a reported summary.
