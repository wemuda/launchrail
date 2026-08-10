---
name: launch
description: The single entry point to the Launchrail loop. Detects how far a project has moved from idea toward release — setup, vision, visual exploration, complexity grill, technical research, ADRs, MVP spec, design validation, tickets, implementation, verification — then runs or routes to the stage that owns the next step. Use to start or continue the Launchrail workflow, to ask what stage a project is at or what comes next, or to jump straight to a named stage (e.g. vision, deep-research, design-validation, tickets). It composes the stage skills; it never reimplements them.
---

# Launch — the Launchrail loop conductor

One command for the whole workflow. You are the **conductor**, not a stage: you find where the project sits on the rail, then run or hand off to the skill that owns the next step. Every stage already has an owner — a Launchrail skill, an upstream Matt Pocock skill, or a CLI command. This skill routes to them; it never re-does their work.

Two ways in:

- **"Where am I / what's next / continue"** — detect the frontier (the first stage not yet done) and drive it.
- **A named stage** (`deep-research`, `vision`, `spec`, …) — jump straight there.

## Ground rules

- **Compose, never duplicate.** Each stage is owned by exactly one tool (see the map). Invoke it by its name; do not paraphrase, wrap, or re-prompt it. This mirrors the composition rules in [`docs/workflow.md`](../../docs/workflow.md), which stays the contract for who owns what.
- **Artifacts gate stages, not chat memory.** A stage counts as done only when its committed artifact exists. Detect by reading the repository, not by remembering this session.
- **Detect, then confirm when unsure.** A file existing is not proof a stage finished — `docs/vision.md` may be the bare template, `docs/specs/` may hold an abandoned draft. When a signal is ambiguous, or an artifact looks thin, ask the user what they have and haven't done before routing. Never silently assume a stage is complete or incomplete.
- **Detection is read-only.** Finding the frontier changes nothing on disk. Every write happens inside the stage skill or CLI command you route to.
- **Stage 0 is action, not conversation.** Setup gaps have known, additive fixes — apply them and report what you did instead of asking how to proceed: commit untracked init output (`chore: initialize launchrail`), and route to `npx @wemuda/launchrail init` when the manifest or a workflow plugin is missing (init installs the whole plugin roster, ADR-0011). Never improvise a dependency install from the web — init owns installs. Save questions for the product artifacts, where the user's intent is genuinely unknowable.
- **Skills are invoked, not reverse-engineered.** Invoke a skill by its name, or hand the user the exact command to type — never browse `~/.claude/plugins` caches, grep plugin internals, or reproduce a skill's work by hand. One stage-0 step is user-typed by upstream design: `/setup-matt-pocock-skills` is marked `disable-model-invocation`, so you cannot run it. Give the user that one command and pre-answer its questions from what Launchrail already knows — issue tracker from `.launchrail.yml`, keep the default triage labels (`ready-for-agent`/`needs-info` are exactly what Ralph expects), single-context docs unless it's a real monorepo — then pick up automatically once `docs/agents/` exists.
- **Respect ownership and mode.** The workflow artifacts (vision, research, ADRs, spec, tickets) are project-owned; the stage skills already honor that. The manifest's `mode` decides which stages may be skipped — read it before insisting on one.
- **Never start Ralph unprompted.** The implementation campaign (`launchrail:ralph`) is user-invoked only. Route the user to it and explain; do not launch it yourself.

## The stage map

Read `.launchrail.yml` (`mode`, `modules`, `issueTracker`) and confirm setup with `npx @wemuda/launchrail status` first — it is the source of truth for what's installed and current.

| # | Stage | Owner (invoke / run) | Done when |
|---|---|---|---|
| 0 | Setup | `npx @wemuda/launchrail init` (seeds files, installs the workflow plugins), then `/setup-matt-pocock-skills` | `.launchrail.yml` + `.launchrail-lock.json` exist and are committed; `doctor` is green; `docs/agents/` present (soft until stage 6 — see step 2) |
| 1 | Vision | `launchrail:vision-creation` | `docs/vision.md` exists and is real (not the bare template) |
| 2 | Visual exploration | Claude Design | Exploration artifacts exist and are linked from `docs/vision.md` |
| 3 | Complexity grill | Matt Pocock `grill-with-docs` | Grill constraints committed under `docs/research/` |
| 4 | Technical research | Matt Pocock research skill (fed the grill constraints) | Research notes committed under `docs/research/` |
| 5 | Architecture decisions | ADRs (`docs/adr/0000-template.md`) | `docs/adr/NNNN-*.md` exist beyond the template |
| 6 | MVP specification | Matt Pocock `wayfinder` / `to-spec` | A spec exists under `docs/specs/` |
| 7 | Design validation | `launchrail:design-validation` | The spec carries a `## Design validation` section |
| 8 | Tickets | Matt Pocock `to-tickets` | The tracker has `ready-for-agent` tickets with `Blocked by: #n` edges |
| 9 | Implementation | `launchrail:ralph` (needs `launchrail add ralph`) | The ready frontier is drained; PRs merged and verified |
| 10 | Verification | `npx @wemuda/launchrail verify` · `launchrail:browser-smoke` | The gate is green; smoke evidence exists where behavior is user-facing |
| 11 | Release | The project's release setup | The release is cut |

`deep-research` = stages 3 + 4 together (grill → research); the grill always runs first and feeds research.

## Orient before you route

The stage map tells you *what's next on the rail*; a quick read of the live session state tells you whether something is *already in flight* — and that context is the least obvious, because it is not in the committed artifacts. Before routing, take a cheap, read-only look:

- **Working tree and branch.** `git status --short`, the current branch, and the last few commits: is there uncommitted or half-finished work, or a branch/PR already open for the stage you are about to start? Surface it and fold it in — never recommend starting fresh on top of it.
- **Freshest tracker/PR context — when there is a tracker.** If `.launchrail.yml` sets `issueTracker` (not `none`) and it is reachable from this environment, read the *discussion* on the relevant ticket and recent PRs — comments and review threads, not just titles and descriptions. Descriptions go stale; the load-bearing decisions live in the thread.
- **Best-effort, never blocking.** A fresh cloud clone may have no tracker and no history — skip what is not there and route on the committed artifacts alone. Orientation sharpens the recommendation; it never gates it, and it stays read-only like the rest of detection.

## Running it

1. **Did the user name a stage?** Resolve it against the keywords below. Sanity-check its inputs exist (e.g. `spec` needs a vision and research). If a prerequisite is missing, say so and offer to start there instead — but if the user still wants the jump, honor it; they may have context you can't see. Then invoke that stage's owner and stop.
2. **Otherwise, orient (above), then find the frontier.** Confirm setup (stage 0) first — and close its gaps yourself, without asking (see ground rules): if `.launchrail.yml` is missing, run `init`; if the init output is untracked, commit it; if `docs/agents/` is missing, tell the user to type `/setup-matt-pocock-skills` (user-invoked upstream — hand them the manifest-derived answers so it's a ten-second run). A missing `docs/agents/` alone never blocks stages 1–5 and is never a sequencing question: hand over the one-liner, then drive the real frontier in the same breath — the hard dependents are the spec and tickets stages (6 and 8), so treat it as required only from there. Then walk stages 1 → 11 in order and stop at the first whose "done when" is not satisfied. Skip only the stages the manifest's `mode` permits skipping (see below).
3. **Confirm the read.** Tell the user where you think they are and why — which artifacts you found, which you didn't. If any signal was ambiguous (a template-only vision, several specs, a recorded skip), ask before acting. This is the moment to ask "have you done X yet?" rather than guess.
4. **Route.** Invoke the owning skill by its exact name (`launchrail:vision-creation`, `launchrail:design-validation`, `launchrail:browser-smoke`), or hand off to the upstream skill / CLI command the map names. For stage 9, explain the campaign and let the user start `launchrail:ralph` themselves.
5. **Always leave a map.** Whatever you route to, tell the user their current stage, the next one, and that they can jump to any stage by keyword.

## Stage keywords

Accept any of these as a direct jump (case-insensitive):

- `status` / `where` — report the detected stage and stop (route nowhere).
- `next` — detect the frontier and drive it (the default when no keyword is given).
- `setup` / `init` — stage 0.
- `vision` — stage 1.
- `explore` / `design-exploration` — stage 2.
- `grill` — stage 3.
- `research` — stage 4.
- `deep-research` — stages 3 → 4 as a pair.
- `adr` / `architecture` — stage 5.
- `spec` — stage 6.
- `design-validation` / `validate` — stage 7.
- `tickets` — stage 8.
- `implement` / `ralph` — stage 9 (hand off for explicit start).
- `verify` / `smoke` — stage 10.
- `release` — stage 11.

An unrecognized keyword → show this list and ask which stage they meant.

## Mode calibration

The manifest's `mode` calibrates rigor, not stage order (see [`docs/workflow.md`](../../docs/workflow.md)):

- `spike` — stages 2–4 and 7 may be skipped deliberately; treat them as done when the vision's non-goals record the skip, and don't nag.
- `standard-mvp` — the full path; skip nothing silently.
- `high-rigor` — no skips; every stage-5 decision needs an ADR, and design validation covers error and edge states, not just happy paths.

When a stage looks skipped, check the vision's non-goals before deciding whether it's a deliberate skip or a real gap — and if you still can't tell, ask.
