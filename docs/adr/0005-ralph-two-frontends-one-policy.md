# ADR-0005: Ralph release orchestration — two frontends, one policy, verification-gated completion

## Status
Accepted — amended by [ADR-0010](0010-ralph-field-revision.md) (mechanics and defaults revised after the first real campaigns) and by [ADR-0018](0018-implement-front-door.md) (the user-typed hard gate (`disable-model-invocation`) moved from the `ralph` skill to the implement front door, and the workflow file installs with `init` rather than only via `launchrail add ralph`); extended by [ADR-0021](0021-ralph-unattended-permission-guard.md) (unattended-launch permission guard). Distribution note: the skills named here ship as managed `launch-*` files ([ADR-0019](0019-vendor-skills-retire-plugin.md)/[ADR-0020](0020-independent-skill-set.md)), not as plugin skills.

## Context
Phase 4 of the roadmap: Ralph implements a ticket backlog autonomously and cannot declare success while required verification fails. Wemuda supplied a working Ralph design from another project (handoff document) with two interchangeable frontends over one policy set: a skill (an orchestrator session dispatching fresh-context implementer subagents) and a dynamic workflow script (the same loop as deterministic code). The open questions were which frontend to ship, how each distributes through Launchrail's ownership model, and how completion is gated on this toolchain's verification surface.

## Decision
- **Ship both frontends.** They fail differently and cover each other: the skill is watchable and interruptible (right for chains, first campaigns, and debugging); the workflow keeps the plan, frontier bookkeeping, and reports in script variables that context compaction cannot destroy (right for wide graphs and long runs). Their policy blocks are kept textually parallel — a policy change lands in both files in the same commit.
- **The skills ship in the plugin; the workflow ships as a managed file.** Claude Code plugins distribute skills but not workflow scripts (the Workflow tool reads `.claude/workflows/`), so `launchrail add ralph` writes `.claude/workflows/ralph.js` as Launchrail's first **managed-class** file in consuming repos: it contains toolchain logic only, policy is overridden per run via workflow `args` (never by editing the file), and the safe writer's checksum rules govern updates. The plugin gains three skills: `ralph` (orchestrator, `disable-model-invocation: true` — campaigns spawn many agents and merge PRs, so only a human starts one), `ralph-implement` (the per-ticket contract), and `resolving-merge-conflicts` (the width>1 protocol). Dispatches name these skills instead of paraphrasing them, so the contracts live in one place.
- **The workflow script is environment-agnostic by construction.** Instead of baking repo, base branch, tracker access, and commands into each project's copy (which would make every copy unique and managed updates messy), a preflight agent reads `.launchrail.yml`/`AGENTS.md` at run time and reports them as structured output; the script composes every dispatch preamble from that. One byte-identical file across all consuming projects.
- **Completion is verification-gated at three points.** `npx @wemuda/launchrail verify` must be green (1) at preflight — a red or *empty* verification contract is a refusal to start, not a warning; (2) per ticket inside `ralph-implement` before a PR opens; (3) at campaign close-out on the final post-merge base — with a browser-smoke evidence bundle when `modules.browser-testing` is enabled and merged work is user-facing. A campaign whose final gate fails reports "unverified", never success.
- **Nothing is trusted from a report.** A claimed merge counts only after a separate cheap verifier (tracker API only, no shell, "fix nothing") confirms the PR merged and the issue closed. Retry once with a fresh context, then park with `needs-info` and the failure history; max rounds backstops a graph that never drains.

## Alternatives considered
- **Skill only** — simplest to ship, but long/wide campaigns compact away their own orchestration state; the workflow variant exists precisely because that failure was observed upstream.
- **Workflow only** — cheapest to run at scale, but unwatchable mid-flight and wrong for first campaigns and debugging; the supplied design's operational guidance assumes a watchable mode exists.
- **Composing the upstream Ralph Wiggum plugin unmodified** — the roadmap deliberately integrates the Wemuda-supplied variant instead: it carries the earned policies (remote verification, parking, integrity/idempotency clauses) and composes with Launchrail's verify gate, which the generic plugin knows nothing about.
- **Seeding the workflow script (seeded-class)** — rejected: it is toolchain logic, not project knowledge; seeding would orphan every copy at version 1. Managed-class with args-based policy keeps it updatable.
- **Rendering project config into the workflow at add-time** — rejected in favor of run-time preflight discovery; baked config goes stale the moment the manifest changes and breaks byte-identical managed updates.

## Consequences
- Easier: consuming projects get autonomous backlog implementation with the same evidence discipline as the rest of Launchrail; policy tuning is a run-time argument, not a file edit; the workflow updates cleanly via sync.
- Harder: two frontends must be kept behaviorally parallel by hand (the policy blocks reference each other); the loop depends on a ticket pipeline producing `Blocked by: #n` edges and a `ready-for-agent` label, which `to-tickets` output may need touching up to satisfy.
- Constrained: campaigns never start on a red or empty verification gate, and never report success past a failing one — by design, even when every ticket merged.

## Revisit when
- Claude Code plugins learn to distribute workflow scripts (the managed file could move into the plugin).
- A consuming project needs a non-GitHub tracker in campaigns (Linear labels/relations may need first-class mapping).
- Real campaign data suggests different defaults (width, attempts, max rounds) or a human-approval merge gate instead of self-review.
