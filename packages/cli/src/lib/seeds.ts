import { ADR_REGISTRY_PATH, adrRegistryContent, scanAdrs } from "./adr.js";
import type { Manifest } from "./manifest.js";
import { AGENTS_COMMANDS_TODO } from "./readiness.js";
import type { FileSpec } from "./writer.js";

export interface SeedContext {
  projectName: string;
  manifest: Manifest;
  launchrailVersion: string;
  /** Project root. Seeds that adopt existing repository content (the ADR registry) read it. */
  cwd: string;
}

function agentsMd(ctx: SeedContext): string {
  const { manifest } = ctx;
  const commands = manifest.testing.unitCommand
    ? "```bash\n" + manifest.testing.unitCommand + "\n```"
    : `${AGENTS_COMMANDS_TODO} (setup, tests, checks).`;

  // The stage-7 spec's home follows the tracker (ADR-0023): a `spec`-labelled
  // issue on a real tracker, or a committed file in local mode.
  const specPointer =
    manifest.issueTracker === "local" || manifest.issueTracker === "none"
      ? "[docs/specs/](docs/specs/) — approved specifications"
      : "approved specifications — `spec`-labelled issues on the project tracker (see [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md))";

  const commitSection = manifest.conventions.conventionalCommits
    ? `
## Commit conventions

Conventional Commits: \`type(scope): summary\` — types \`feat\`, \`fix\`, \`docs\`, \`chore\`, \`refactor\`, \`test\`, \`build\`, \`ci\`.
`
    : "";

  return `# Agent operating contract — ${ctx.projectName}

This file is the vendor-neutral contract for any coding agent working in this repository.

## Project purpose

TODO: One paragraph on what this project is, who it serves, and what it is not.

## Canonical context

1. [docs/vision.md](docs/vision.md) — product vision and non-goals
2. [docs/adr/README.md](docs/adr/README.md) — the decision registry: read its index first, then only the ADRs touching your area
3. ${specPointer}

## Commands

${commands}
${commitSection}
## Workflow rules

- Ask, don't guess. On product decisions, data-model or schema changes, security-relevant behaviour, or anything genuinely ambiguous, stop and ask rather than guessing — a wrong guess on these costs more than the question.
- Do not silently change scope; surface deviations from the spec or ADRs.
- If implementation invalidates an artifact (vision, spec, ADR, design note), update that artifact in the same change.
- Decisions that are hard to reverse, surprising without context, and the result of a real trade-off become lightweight ADRs in \`docs/adr/\` using [docs/adr/0000-template.md](docs/adr/0000-template.md), with a row added to the registry index in the same commit. Prefer amending the ADR that owns an area over minting a sibling; product decisions belong in the spec, not an ADR.

## Definition of done

- The change matches the relevant spec or ADR, or updates it.
- Deterministic checks pass${manifest.testing.unitCommand ? ` (\`${manifest.testing.unitCommand}\`)` : ""}.
- Behaviour-bearing changes are proven in the running app, not only by green unit tests — capability is not the same as done.
- Report honest status: say what you verified and to what depth; never imply complete when it is not.
- Evidence over assertion: "done" requires passing checks, not agent say-so.
`;
}

function claudeMd(): string {
  return `@AGENTS.md
@.launchrail/CLAUDE.generated.md

## Project-specific Claude Code instructions

Add project-specific Claude behavior here. This file is yours — Launchrail never overwrites it.
`;
}

function claudeGeneratedMd(ctx: SeedContext): string {
  const browserTesting = ctx.manifest.modules["browser-testing"]
    ? `
## Browser testing

- User-facing changes are verified twice: deterministic checks (\`node scripts/verify.mjs\`) and agentic smoke journeys from \`docs/testing/smoke-journeys.md\` (browser-smoke skill).
- Start the app with \`node scripts/dev.mjs\` (\`--background\` in cloud or CI sessions); prepare an evidence bundle with \`npx @wemuda/launchrail smoke\`.
- Drive journeys agentically via the seeded Playwright MCP (\`.mcp.json\`, approve it once in Claude Code) or a Playwright script — whichever the session has; headless CI falls back to the scripts.
- Smoke evidence lives in \`artifacts/verification/<run-id>/\` — fill in \`summary.md\`; only summary, deviations, and meta are meant to be committed.
- When a smoke run finds a real bug: reproduce it, add a failing deterministic test, fix, prove the test passes, re-run the journey.
`
    : "";

  const ralph = ctx.manifest.modules.ralph
    ? `
## The Ralph loop

- Implementation starts with \`/launch-implement\` — all ready tickets, or one with \`/launch-implement <ticket>\`. Multi-ticket runs execute as the \`ralph\` workflow (\`.claude/workflows/ralph.js\`), supervised per the \`launch-ralph\` skill; single tickets build in-session. Only ever started explicitly by the user.
- Every run declares one integration target: by default a consolidation branch (named via the \`target\` workflow arg, it collects the campaign and ends by offering one release PR to the default branch, which stays untouched), or the default branch (trunk) as an explicit opt-in. The loop lands each finished \`ralph/<n>-*\` branch itself — a local squash-merge onto the base under \`npx @wemuda/launchrail verify --fast\`, pushed — and runs the full \`npx @wemuda/launchrail verify\` every few lands and at release; no per-ticket PR, no CI wait — cloud CI runs once, on the offered release PR. The run's recap states where the work lives and the single next step.
- Implementers push their branch from the first commit on and after every green step; a relaunch adopts pushed branches (pass \`knownGreen: "<sha>"\` to skip re-proving a verified base). Name a quick lint/typecheck/unit gate as \`testing.checkCommand\` in \`.launchrail.yml\` to make every land cheaper (the fast gate falls back to the unit command).
- Tickets enter the loop with the \`ready-for-agent\` label and explicit \`Blocked by: #n\` edges; parked tickets carry \`needs-info\` plus their failure history.
- A ticket counts done only when its landing commit is on the remote base, the issue is closed, and the gates are green — agent reports are claims, not evidence.
- \`.claude/workflows/ralph.js\` is managed by Launchrail: override policy per run via workflow args (e.g. \`{ width: 1 }\`), never by editing the file.
- Launch unattended runs in a non-prompting permission mode (bypass/autonomous); a guard hook (\`.claude/hooks/ralph-permission-guard.py\`) warns if the \`ralph\` workflow starts in an interactive mode, since one benign prompt can stall a walk-away run and lose the container mid-ticket.
- \`launch-loop-readiness\` tunes the repo for the loop — fast gate, parallel journeys, shared caches, CI triggers, labels, hosted-session setup, verbatim commands — with measurements; \`doctor\`'s \`ralph …\` readiness lines say when it is worth running.
`
    : "";

  return `<!-- Managed by Launchrail v${ctx.launchrailVersion}. Do not edit: \`launchrail sync\` may replace this file. Project-specific instructions belong in CLAUDE.md. -->

# Launchrail workflow instructions

- This project follows the Launchrail rail — six phases: Intent → Exploration → Decisions → Blueprint → Build → Ship. Report position with the rail banner at every transition; the stage detail and the interaction contract live in \`.claude/skills/launch/workflow.md\`.
- Product knowledge (vision, specs, ADRs, designs, tickets, code) is project-owned; Launchrail never overwrites it.
- Architecture decisions: read \`docs/adr/README.md\` — the registry index — first, and open only the ADRs touching your area. An ADR records a decision, not the current system; never take one as evidence that a component exists or still works as described — the code is the source of truth.
- \`.launchrail.yml\` is project configuration; \`.launchrail-lock.json\` is machine-managed — do not hand-edit it.
- The issue-tracker workflow (labels included) and the domain-doc consumer rules live in \`docs/agents/\` — seeded from \`.launchrail.yml\`, yours to edit.
- Before claiming completion, run the project's deterministic checks. Completion requires evidence, not assertion.
- Run \`npx @wemuda/launchrail doctor\` when repository state seems inconsistent.
${browserTesting}${ralph}`;
}

function adrTemplate(): string {
  return `# ADR-NNNN: Short decision title

## Status
Proposed | Accepted | Accepted — amended by ADR-NNNN | Superseded by ADR-NNNN

When a later ADR amends or supersedes this one, update this line and the registry index ([README.md](README.md)) in the same commit.

## Context
What requirement or constraint requires a decision?

## Decision
What was selected?

## Alternatives considered
What realistic alternatives were rejected?

## Consequences
What becomes easier, harder, or constrained?

## Revisit when
What change would justify reconsidering this decision?
`;
}

/** The managed Claude instructions file — regenerated whenever module configuration changes. */
export function claudeGeneratedFile(ctx: SeedContext): FileSpec {
  return { relPath: ".launchrail/CLAUDE.generated.md", content: claudeGeneratedMd(ctx), ownership: "managed" };
}

/** Everything init seeds beyond the manifest and lockfile. */
export function seedFiles(ctx: SeedContext): FileSpec[] {
  return [
    { relPath: "AGENTS.md", content: agentsMd(ctx), ownership: "seeded" },
    { relPath: "CLAUDE.md", content: claudeMd(), ownership: "seeded" },
    { relPath: "docs/adr/0000-template.md", content: adrTemplate(), ownership: "seeded" },
    // The registry (ADR-0031) makes the corpus navigable: agents read its index,
    // not the whole directory. Adopting a repo with existing records prefills it.
    { relPath: ADR_REGISTRY_PATH, content: adrRegistryContent(scanAdrs(ctx.cwd)), ownership: "seeded" },
    claudeGeneratedFile(ctx),
  ];
}
