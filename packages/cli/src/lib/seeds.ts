import type { Manifest } from "./manifest.js";
import type { FileSpec } from "./writer.js";

export interface SeedContext {
  projectName: string;
  manifest: Manifest;
  launchrailVersion: string;
}

function agentsMd(ctx: SeedContext): string {
  const { manifest } = ctx;
  const commands = manifest.testing.unitCommand
    ? "```bash\n" + manifest.testing.unitCommand + "\n```"
    : "TODO: document the commands agents must run (setup, tests, checks).";

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
2. [docs/adr/](docs/adr/) — accepted architecture decisions
3. [docs/specs/](docs/specs/) — approved specifications

## Commands

${commands}
${commitSection}
## Workflow rules

- Ask, don't guess. On product decisions, data-model or schema changes, security-relevant behaviour, or anything genuinely ambiguous, stop and ask rather than guessing — a wrong guess on these costs more than the question.
- Do not silently change scope; surface deviations from the spec or ADRs.
- If implementation invalidates an artifact (vision, spec, ADR, design note), update that artifact in the same change.
- Meaningful decisions become lightweight ADRs in \`docs/adr/\` using [docs/adr/0000-template.md](docs/adr/0000-template.md).

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

- Bounded implementation runs through the Ralph loop: the \`launchrail:ralph\` skill (watchable, checkpointed) or the \`ralph\` workflow in \`.claude/workflows/ralph.js\` (wide or long runs). Both are only ever started explicitly by the user.
- Tickets enter the loop with the \`ready-for-agent\` label and explicit \`Blocked by: #n\` edges; parked tickets carry \`needs-info\` plus their failure history.
- A ticket counts done only when its PR is merged on the remote, the issue is closed, and \`npx @wemuda/launchrail verify\` is green — agent reports are claims, not evidence.
- \`.claude/workflows/ralph.js\` is managed by Launchrail: override policy per run via workflow args (e.g. \`{ width: 1 }\`), never by editing the file.
`
    : "";

  return `<!-- Managed by Launchrail v${ctx.launchrailVersion}. Do not edit: \`launchrail sync\` may replace this file. Project-specific instructions belong in CLAUDE.md. -->

# Launchrail workflow instructions

- This project follows the Launchrail development loop: vision → design exploration → grill/research → ADRs → spec → visual validation → tickets → bounded implementation → verification → release.
- Product knowledge (vision, specs, ADRs, designs, tickets, code) is project-owned; Launchrail never overwrites it.
- \`.launchrail.yml\` is project configuration; \`.launchrail-lock.json\` is machine-managed — do not hand-edit it.
- Before claiming completion, run the project's deterministic checks. Completion requires evidence, not assertion.
- Run \`npx @wemuda/launchrail doctor\` when repository state seems inconsistent.
${browserTesting}${ralph}`;
}

function adrTemplate(): string {
  return `# ADR-NNNN: Short decision title

## Status
Proposed | Accepted | Superseded by ADR-NNNN

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
    claudeGeneratedFile(ctx),
  ];
}
