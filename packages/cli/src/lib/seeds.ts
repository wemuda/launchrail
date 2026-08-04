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

- Do not silently change scope; surface deviations from the spec or ADRs.
- If implementation invalidates an artifact (vision, spec, ADR, design note), update that artifact in the same change.
- Meaningful decisions become lightweight ADRs in \`docs/adr/\` using [docs/adr/0000-template.md](docs/adr/0000-template.md).

## Definition of done

- The change matches the relevant spec or ADR, or updates it.
- Deterministic checks pass${manifest.testing.unitCommand ? ` (\`${manifest.testing.unitCommand}\`)` : ""}.
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
  return `<!-- Managed by Launchrail v${ctx.launchrailVersion}. Do not edit: \`launchrail sync\` may replace this file. Project-specific instructions belong in CLAUDE.md. -->

# Launchrail workflow instructions

- This project follows the Launchrail development loop: vision → design exploration → grill/research → ADRs → spec → visual validation → tickets → bounded implementation → verification → release.
- Product knowledge (vision, specs, ADRs, designs, tickets, code) is project-owned; Launchrail never overwrites it.
- \`.launchrail.yml\` is project configuration; \`.launchrail-lock.json\` is machine-managed — do not hand-edit it.
- Before claiming completion, run the project's deterministic checks. Completion requires evidence, not assertion.
- Run \`npx @wemuda/launchrail doctor\` when repository state seems inconsistent.
`;
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

/** Everything init seeds beyond the manifest and lockfile. */
export function seedFiles(ctx: SeedContext): FileSpec[] {
  return [
    { relPath: "AGENTS.md", content: agentsMd(ctx), ownership: "seeded" },
    { relPath: "CLAUDE.md", content: claudeMd(), ownership: "seeded" },
    { relPath: "docs/adr/0000-template.md", content: adrTemplate(), ownership: "seeded" },
    { relPath: ".launchrail/CLAUDE.generated.md", content: claudeGeneratedMd(ctx), ownership: "managed" },
  ];
}
