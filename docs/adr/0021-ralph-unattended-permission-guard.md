# ADR-0021: Ralph's unattended-launch permission guard

## Status
Accepted — extends [ADR-0005](0005-ralph-two-frontends-one-policy.md) (the two Ralph frontends) and reuses the additive `.claude/settings.json` merge model of [ADR-0003](0003-plugin-subscription-via-project-settings.md)/[ADR-0019](0019-vendor-skills-retire-plugin.md). Landed alongside [ADR-0020](0020-independent-skill-set.md), which made Ralph the sole implementation loop and removed the plugin-declaration machinery from `init`; the guard's own settings.json registration is independent of that machinery and unaffected.

## Context
The Ralph loop (ADR-0005) is meant to be launched and then left unattended for hours while it drives a ticket backlog to merged code — most sharply as the `ralph` workflow, which the Workflow tool runs headless. Its host is usually an ephemeral cloud container that is reclaimed once the session sits idle.

That combination has a specific, observed failure mode. If the loop is launched while the session is in a permission mode that still raises interactive prompts (`default` / `plan` / `acceptEdits`), a single benign, un-allowlisted tool call — typically an MCP or Bash call the session has not pre-approved — blocks waiting for a human. If nobody is at the keyboard, the session goes idle, the container is reclaimed, and the run dies mid-ticket: a half-finished ticket, and everything blocked behind it starved. The wemuda GSD project hit exactly this (a green, cleanly-mergeable PR left unmerged because the implementer stalled on a permission prompt while waiting on CI), and added a guard; Launchrail ships the same protection to every consuming project, since Launchrail is where the loop is distributed from.

The non-prompting modes (`bypassPermissions` / `auto` / `dontAsk`) do not have this problem — a walk-away run in one of them cannot stall on a prompt. The gap is entirely one of *launching in the wrong mode*, and the cheapest place to catch it is at launch, while the user is still present.

## Decision
- **Ship a warn-but-allow `PreToolUse(Workflow)` hook.** `.claude/hooks/ralph-permission-guard.py` fires when the Workflow tool is invoked for the `ralph` workflow (matched by `name` or by the `ralph` script path, so inline and resumed launches are covered too). If the session is in an interactive mode it emits a `systemMessage` warning plus orchestrator context and exits 0 — it **never** emits a `permissionDecision`, so normal permission handling is untouched. For any non-Ralph tool call, and for Ralph launches already in a non-prompting mode, it prints nothing. It is a pure guard: it warns, it never grants.
- **The hook file is a managed Ralph asset.** It ships in `ralphFiles()` alongside the workflow — managed-class, executable, checksum-tracked — so it installs with `init` (when the ralph module is on), with `launchrail add ralph`, updates cleanly via `sync`, and is never silently overwritten once a project has diverged.
- **Its registration is an additive `.claude/settings.json` merge.** That file is project-owned and shared with unrelated Claude Code configuration, so — exactly like the plugin declaration (ADR-0003) — it is never lockfile-tracked and never rewritten wholesale. `planRalphGuardHook` appends one `PreToolUse(Workflow)` entry, preserving every other setting and hook, and is idempotent: an existing registration is detected by its command (not by exact JSON) and left alone. Existing projects are brought current by the `2026-08-ralph-permission-guard` migration, which performs the registration the managed-file writer cannot express; the hook file itself rides the regular managed-file surface.
- **`doctor` verifies both halves.** Because the registration is not lockfile-tracked, a dedicated `ralph guard` check is the only signal that it is actually wired in: it fails on a missing hook file and warns when the file is present but unregistered, pointing at `sync`.
- **The `launch-ralph` skill documents the expectation in prose.** The hook only fires inside Claude Code; cloud and non-Claude agents (the vendored-skills audience) get the guidance to launch unattended runs in a non-prompting mode from the skill's workflow-supervision section instead.

## Alternatives considered
- **Block the launch (emit a denying `permissionDecision`) in interactive modes** — rejected: too blunt. A user may deliberately want to watch an interactive run, and a hard block turns a helpful nudge into a wall; warn-but-allow keeps the human in control.
- **Skill/prose guidance only, no hook** — rejected: the failure is a launch-time mistake made precisely when the user is about to stop paying attention. Documentation that must be recalled at the wrong moment does not prevent it; an at-launch warning does. (Prose is kept as well, for the agents the hook can't reach.)
- **Track the registration in the lockfile like a managed file** — rejected: `.claude/settings.json` is shared, project-owned, and additively merged by design (ADR-0003); tracking it would fight that model and risk clobbering unrelated hooks and settings.
- **Guard the session-orchestrated (`launch-ralph` skill) frontend too** — deferred: that frontend dispatches subagents rather than launching the Workflow tool, and a watched orchestrator session is far less likely to be abandoned mid-prompt. The workflow frontend is where the unattended stall was observed; the prose note covers the skill frontend.

## Consequences
- Easier: an unattended Ralph run can no longer be silently killed by a single launch-in-the-wrong-mode mistake — the warning lands while it is still cheap to fix. Consuming projects inherit the protection with no action beyond a normal `init`/`sync`.
- Harder: Ralph now writes a second managed file and, for the default (plugin-free) loop, creates `.claude/settings.json` where before it created none — so a fresh ralph init now produces that file (with only the hook in it).
- Constrained: the guard is Workflow-tool-scoped and Claude-Code-scoped by nature; it protects the workflow frontend inside Claude Code and does nothing for other launch surfaces, which is why the skill also states the expectation in prose.

## Revisit when
- Claude Code gains a first-class "unattended/headless" permission signal a launcher can set, making a launch-time heuristic unnecessary.
- The session-orchestrated frontend shows the same abandoned-mid-prompt failure in practice, justifying a guard (or a hard gate) there too.
- Real runs show the warning is routinely ignored, arguing for escalating from warn-but-allow to a confirmation gate.
