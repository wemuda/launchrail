# ADR-0001: Provisional implementation stack for the Launchrail CLI

## Status
Proposed — to be confirmed or revised after the v0.1 grill and technical-landscape research (handoff §5.4–5.6).

## Context
Launchrail is distributed as an npm CLI intended to run via `npx @wemuda/launchrail`, plus a Claude Code plugin. The runtime and repo tooling must support that distribution model, work on macOS/Linux/Windows, and be testable against temporary Git repositories. The handoff (§11) proposes a provisional stack and explicitly asks for a short ADR before implementation.

## Decision
- TypeScript on Node.js (≥ 22), ESM only
- npm publication under the scoped name `@wemuda/launchrail`
- pnpm workspace for Launchrail's own monorepo (`packages/*`)
- A small command framework and prompt library (specific libraries chosen during research)
- JSON Schema or equivalent runtime-validated manifest schema
- Snapshot and fixture tests for synchronization behavior
- Temporary Git repositories for integration testing

## Alternatives considered
- **Bun or Deno runtime** — faster startup, but `npx` distribution and ecosystem compatibility make Node the low-friction default for consumers.
- **Go or Rust binary** — better startup and single-binary distribution, but loses trivial `npx` install, raises contribution barrier, and the CLI is I/O-bound, not compute-bound.
- **Unscoped `launchrail` npm name** — rejected for now; the scoped name makes ownership clear and avoids conflicts with existing projects using the name (handoff §15).

## Consequences
- Easier: `npx` bootstrap, community contribution, sharing types with the plugin/templates.
- Harder: Node startup latency; Windows support must be deliberate (no Bash-only scripts).
- Constrained: published package must remain ESM-compatible for consumers.

## Revisit when
- Grill or research surfaces a requirement Node/TypeScript cannot meet.
- Startup latency or distribution size becomes a measured user complaint.
- The plugin distribution model changes in a way that decouples it from npm.
