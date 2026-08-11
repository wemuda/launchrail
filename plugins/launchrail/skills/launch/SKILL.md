---
name: launch
description: The single entry point to the Launchrail loop. Detects how far a project has moved from idea toward release — setup, vision, visual exploration, discovery research, complexity grill, technical research, ADRs, MVP spec, design validation, tickets, implementation, verification — then runs or routes to the stage that owns the next step. Use to start or continue the Launchrail workflow, to ask what stage a project is at or what comes next, or to jump straight to a named stage (e.g. vision, discovery, deep-research, design-validation, tickets). It composes the stage skills; it never reimplements them.
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
- **Skills are invoked, not reverse-engineered.** Invoke a skill by its name, or hand the user the exact command to type — never browse `~/.claude/plugins` caches, grep plugin internals, or reproduce a skill's work by hand. Some stage owners are **user-typed by upstream design**: marked `disable-model-invocation`, the Skill tool refuses them and only the user can start them. On this rail those are stage 0 setup (`/setup-matt-pocock-skills`), stage 7 spec (`wayfinder` / `to-spec`), and stage 10 Ralph (governed by its own rule below). Treat each as a **prepared handoff, not a wall** — never discover it by calling and getting refused. **If the Skill tool returns a `disable-model-invocation` refusal for any owner, that refusal is the cue to switch into handoff mode — never to reverse-engineer the skill's work.** A prepared handoff is three moves: (1) confirm the stage's input artifacts are committed; (2) hand the user the **exact, fully-argumented command** — never a bare `/skill`, which sends it re-deriving from scratch what your inputs already settle — naming the authoritative inputs in order plus any project ground truth it would otherwise re-explore; (3) pick up automatically once the stage's artifact lands. Arguments that point a skill at committed inputs are *parameters*, not paraphrase — parameterizing an invocation is not wrapping or re-prompting it. For stage 0, pre-answer `/setup-matt-pocock-skills`'s interview from what Launchrail already knows — issue tracker from `.launchrail.yml`, keep the default triage labels (`ready-for-agent`/`needs-info` are exactly what Ralph expects), single-context docs unless it's a real monorepo — then resume once `docs/agents/` exists.
- **Respect ownership and mode.** The workflow artifacts (vision, research, ADRs, spec, tickets) are project-owned; the stage skills already honor that. The manifest's `mode` decides which stages may be skipped — read it before insisting on one.
- **Existing projects take the alignment on-ramp.** When `.launchrail.yml` says `origin: existing` and there is no real vision yet, stage 1 is owned by `launchrail:project-alignment`, not `vision-creation` directly. A mid-development codebase already answers much of the vision — alignment infers a draft from the code, interviews only the gaps, and inventories the existing design system before handing to `vision-creation` to commit. Don't start an adopted project from a blank vision, and don't re-ask what the repository already states.
- **Never start Ralph unprompted.** The implementation loop (`launchrail:ralph`) is user-invoked only. Route the user to it and explain; do not launch it yourself.
- **The next feature has its own conductor.** Once the foundation exists and the project is delivering feature by feature, `launchrail:start-feature` sizes a single feature (large / semi / small) and routes its planning path (ADR-0014). `launch` still drives the frontier per feature; hand to `start-feature` when the user is explicitly starting one new feature and wants the sizing made up front.

## The stage map

Read `.launchrail.yml` (`mode`, `modules`, `issueTracker`) and confirm setup with `npx @wemuda/launchrail status` first — it is the source of truth for what's installed and current.

| # | Stage | Owner (invoke / run) | Done when |
|---|---|---|---|
| 0 | Setup | `npx @wemuda/launchrail init` (seeds files, installs the workflow plugins), then `/setup-matt-pocock-skills` † | `.launchrail.yml` + `.launchrail-lock.json` exist and are committed; `doctor` is green; `docs/agents/` present (soft until stage 7 — see step 2) |
| 1 | Vision | `launchrail:vision-creation` — or `launchrail:project-alignment` when `origin: existing` (see below) | `docs/vision.md` exists and is real (not the bare template) |
| 2 | Visual exploration | Claude Design | Exploration artifacts exist and are linked from `docs/vision.md` |
| 3 | Discovery research | `launchrail:discovery` (Launchrail-owned; composes the Matt Pocock research skill) | A landscape/options map committed under `docs/research/` (convention: `discovery-*.md`) |
| 4 | Complexity grill | Matt Pocock `grill-with-docs` — never the bare `grilling` primitive | Grill constraints committed under `docs/research/` |
| 5 | Technical research | Matt Pocock research skill (fed the grill constraints) | Research notes committed under `docs/research/` |
| 6 | Architecture decisions | ADRs (`docs/adr/0000-template.md`) | `docs/adr/NNNN-*.md` exist beyond the template |
| 7 | MVP specification | Matt Pocock `wayfinder` / `to-spec` † | A spec exists under `docs/specs/` |
| 8 | Design validation | `launchrail:design-validation` | The spec carries a `## Design validation` section |
| 9 | Tickets | Matt Pocock `to-tickets` | The tracker has `ready-for-agent` tickets with `Blocked by: #n` edges |
| 10 | Implementation | `launchrail:ralph` † (needs `launchrail add ralph`) | The ready frontier is drained; PRs merged and verified |
| 11 | Verification | `npx @wemuda/launchrail verify` · `launchrail:browser-smoke` | The gate is green; smoke evidence exists where behavior is user-facing |
| 12 | Release | The project's release setup | The release is cut |

† **User-typed stage** — the owner is `disable-model-invocation` (upstream, or Launchrail's own choice for Ralph). You can't invoke it; you prepare the handoff and hand over the command. See "Skills are invoked, not reverse-engineered" above.

`deep-research` = the tech-decision arc, stages 3 → 4 → 5 (discovery → grill → technical research): discovery widens the option space, the grill narrows it, research de-risks what survives.

**Stage 3 (discovery) feeds stage 4 (the grill).** Discovery is Launchrail-owned and *divergent* — it maps the real options for the vision's hard parts (all the auth vendors, not one) so the grill has a real field to narrow, then commits a landscape doc under `docs/research/`. It composes the Matt Pocock research skill for depth but owns the divergent framing, and it does **not** pick winners. Don't collapse discovery into the grill unless `mode` is `spike`: a grill with no discovery narrows whatever stack was assumed upstream, which is exactly the failure discovery exists to prevent.

**Stage 4 is `grill-with-docs`, never the bare `grilling` primitive.** Both ship in the installed `mattpocock-skills` plugin, so the wrong one is a tab-completion away — but only `grill-with-docs` runs the domain-modeling pass that writes the `docs/research/` artifact this stage is *done when* it has. The bare `grilling` primitive produces conversation and no committed file, so the frontier never advances and stage 5 research gets no brief. `grill-with-docs` composes `grilling` under the hood, so the interview is identical either way — reaching for the primitive only loses you the artifact.

**Existing projects (`origin: existing`).** Reach stage 1 through `launchrail:project-alignment`: it inventories what the codebase already has, infers a draft vision, interviews only the gaps, and detects the existing design system (a baseline for stages 2 and 8), then hands to `vision-creation` to commit and returns here for the first real gap. Everything downstream of the vision is unchanged — alignment is an on-ramp onto the same rail, not a separate track.

## Orient before you route

The stage map tells you *what's next on the rail*; a quick read of the live session state tells you whether something is *already in flight* — and that context is the least obvious, because it is not in the committed artifacts. Before routing, take a cheap, read-only look:

- **Working tree and branch.** `git status --short`, the current branch, and the last few commits: is there uncommitted or half-finished work, or a branch/PR already open for the stage you are about to start? Surface it and fold it in — never recommend starting fresh on top of it.
- **Freshest tracker/PR context — when there is a tracker.** If `.launchrail.yml` sets `issueTracker` (not `none`) and it is reachable from this environment, read the *discussion* on the relevant ticket and recent PRs — comments and review threads, not just titles and descriptions. Descriptions go stale; the load-bearing decisions live in the thread.
- **Best-effort, never blocking.** A fresh cloud clone may have no tracker and no history — skip what is not there and route on the committed artifacts alone. Orientation sharpens the recommendation; it never gates it, and it stays read-only like the rest of detection.

## Running it

1. **Did the user name a stage?** Resolve it against the keywords below. Sanity-check its inputs exist (e.g. `spec` needs a vision and research). If a prerequisite is missing, say so and offer to start there instead — but if the user still wants the jump, honor it; they may have context you can't see. Then invoke that stage's owner and stop.
2. **Otherwise, orient (above), then find the frontier.** Confirm setup (stage 0) first — and close its gaps yourself, without asking (see ground rules): if `.launchrail.yml` is missing, run `init`; if the init output is untracked, commit it; if `docs/agents/` is missing, tell the user to type `/setup-matt-pocock-skills` (user-invoked upstream — hand them the manifest-derived answers so it's a ten-second run). A missing `docs/agents/` alone never blocks stages 1–6 and is never a sequencing question: hand over the one-liner, then drive the real frontier in the same breath — the hard dependents are the spec and tickets stages (7 and 9), so treat it as required only from there. Then walk stages 1 → 12 in order and stop at the first whose "done when" is not satisfied. Skip only the stages the manifest's `mode` permits skipping (see below). **If the frontier is stage 1 and `.launchrail.yml` says `origin: existing`, route to `launchrail:project-alignment` rather than `vision-creation` directly** — the on-ramp infers from the code and aligns instead of starting blank.
3. **Confirm the read.** Tell the user where you think they are and why — which artifacts you found, which you didn't. If any signal was ambiguous (a template-only vision, several specs, a recorded skip), ask before acting. This is the moment to ask "have you done X yet?" rather than guess.
4. **Route.** Invoke the owning skill by its exact name (`launchrail:vision-creation`, `launchrail:design-validation`, `launchrail:browser-smoke`), or hand off to the upstream skill / CLI command the map names. For a **user-typed** stage (†) you can't invoke, prepare the handoff instead of calling and getting refused: for stage 7, hand over the exact, fully-argumented `wayfinder` / `to-spec` command with the authoritative inputs named, so it builds on the settled decisions rather than re-exploring the codebase — and if the stack isn't stood up yet, tell it to name its seams but leave the harness mechanism (test database, CI wiring) to the foundation work, rather than pinning infrastructure the stack hasn't chosen; for stage 10, explain the loop and let the user start `launchrail:ralph` themselves.
5. **Always leave a map.** Whatever you route to, tell the user their current stage, the next one, and that they can jump to any stage by keyword.

## Stage keywords

Accept any of these as a direct jump (case-insensitive):

- `status` / `where` — report the detected stage and stop (route nowhere).
- `next` — detect the frontier and drive it (the default when no keyword is given).
- `setup` / `init` — stage 0.
- `align` / `adopt` — the existing-project on-ramp to stage 1 (`launchrail:project-alignment`).
- `vision` — stage 1.
- `explore` / `design-exploration` — stage 2.
- `discovery` / `landscape` — stage 3 (`launchrail:discovery`).
- `grill` — stage 4.
- `research` — stage 5.
- `deep-research` — stages 3 → 4 → 5 as a set (discovery → grill → research).
- `adr` / `architecture` — stage 6.
- `spec` — stage 7.
- `design-validation` / `validate` — stage 8.
- `tickets` — stage 9.
- `implement` / `ralph` — stage 10 (hand off for explicit start).
- `verify` / `smoke` — stage 11.
- `release` — stage 12.
- `feature` / `start-feature` — hand a single new feature to `launchrail:start-feature`, which sizes it and routes its planning path.

An unrecognized keyword → show this list and ask which stage they meant.

## Mode calibration

The manifest's `mode` calibrates rigor, not stage order (see [`docs/workflow.md`](../../docs/workflow.md)):

- `spike` — stages 2–5 and 8 may be skipped deliberately; treat them as done when the vision's non-goals record the skip, and don't nag.
- `standard-mvp` — the full path; skip nothing silently.
- `high-rigor` — no skips; every stage-6 decision needs an ADR, and design validation covers error and edge states, not just happy paths.

When a stage looks skipped, check the vision's non-goals before deciding whether it's a deliberate skip or a real gap — and if you still can't tell, ask.
