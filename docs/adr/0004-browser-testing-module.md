# ADR-0004: Browser-testing module — Playwright baseline, semantic commands, agentic smoke with evidence bundles

## Status
Accepted

## Context
Phase 3 of the roadmap: an agent must be able to start an app in a fresh environment (local, CI, or cloud clone), complete a defined user journey in a real browser, and produce a traceable evidence bundle. The handoff (§9) requires two complementary systems — deterministic browser tests as release gates and agentic smoke testing as exploratory acceptance — plus stable semantic commands regardless of the project's internal stack. Everything written into consuming repos must respect the ownership model and the safe-writer contract.

## Decision
- **Playwright is the single browser layer.** One dependency backs deterministic E2E tests, traces/screenshots, headless CI, and agent-driven sessions. The agentic interface stays open (Playwright MCP, browser tools, or Playwright scripting) — the skill is written against journeys and evidence, not a specific driver.
- **`launchrail add browser-testing` enables the module.** It flips `modules.browser-testing` in `.launchrail.yml` via a comment-preserving YAML round-trip (the one deliberate, user-requested exception to "never rewrite seeded files"), records `testing.{devCommand,e2eCommand,smokeCommand,appUrl}`, and seeds — all seeded-class, created once then project-owned: `playwright.config.ts` + `tests/e2e/smoke.spec.ts` (skipped entirely when a Playwright config already exists), `docs/testing/smoke-journeys.md`, and `scripts/{setup,dev,verify,smoke,doctor}.mjs`.
- **Semantic commands are Node `.mjs` scripts** (cross-platform, no Bash assumption). `setup` installs dependencies and browser binaries (`--with-deps` under CI/cloud), `dev` starts the app (with `--background` for cloud sessions), and `verify`/`smoke`/`doctor` delegate to the CLI so behavior updates with the toolchain.
- **`launchrail verify` is the deterministic gate**: it runs every configured testing command (unit, then e2e when the module is enabled) and fails on an empty contract — a verification contract with no checks cannot pass.
- **`launchrail smoke` scaffolds the evidence bundle**: it confirms the app responds (any HTTP response counts; connection failure aborts), then creates `artifacts/verification/<run-id>/` with `meta.json` (commit SHA, environment local/ci/cloud via `CI`/`CLAUDE_CODE_REMOTE`, base URL, journey list) and a `summary.md` skeleton. It only ever creates new files in fresh run directories. A `.gitignore` keeps `summary.md`, `deviations.md`, and `meta.json` committable while bulky evidence (traces, screenshots, logs) stays out of history.
- **The journey contract is Markdown**: `## Journey:` sections in `docs/testing/smoke-journeys.md`, parsed by `smoke` and driven by the plugin's `browser-smoke` skill, which owns the agentic loop: verify first, drive journeys, capture evidence as you go, convert real bugs into failing deterministic tests before fixing them.

## Alternatives considered
- **Playwright MCP as the mandated agent interface** — rejected as a hard dependency; availability varies by environment. The skill works with whatever browser tooling the session has, and an adapter abstraction can come later if a non-Playwright layer is ever needed.
- **Cypress or WebdriverIO** — weaker fit for agents (trace format, accessibility-first selectors, one-dependency coverage of E2E + exploration).
- **YAML journey files** — Markdown chosen: journeys are authored by humans and agents inside tickets and docs, and the only machine need (listing names) doesn't justify a schema.
- **Bash `scripts/`** — rejected; Windows support must be deliberate (ADR-0001), and Node is already required.
- **Seeding a CI workflow now** — deferred to the github module; nothing in this module is CI-specific beyond environment detection.

## Consequences
- Easier: consuming projects converge on one command surface (`scripts/*.mjs`) that works locally, in CI, and in fresh cloud clones; verification produces reviewable artifacts instead of agent say-so.
- Harder: the module assumes a Node project with a package manager; non-Node stacks would need their own adapter later.
- Constrained: `smoke` deliberately does not drive the browser itself — the CLI stays deterministic and the agentic loop lives in the skill.

## Revisit when
- A consuming project needs a non-Playwright browser layer (introduce the adapter seam).
- Preview-environment authentication and seeded test data need first-class support (handoff §9.8).
- Evidence bundles need standardized upload/retention (CI artifact integration).
