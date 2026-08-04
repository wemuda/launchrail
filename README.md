# Launchrail

> **Status:** Pre-release. Nothing is published to npm yet.

Launchrail is an open-source, updatable development system for taking a software idea from broad product intent to a visually validated, specified, tested, and working release.

This repository is the Launchrail **toolchain**: the CLI, Claude Code plugin, templates, and migrations that initialize other repositories and keep them current. It is not an application framework and it does not replace Claude Code, Claude Design, Matt Pocock's skills, GitHub, Playwright, or a project's chosen stack — it is the shared rail that connects them:

```text
Vision
  → visual exploration
  → complexity and technical research
  → architecture decisions
  → MVP specification
  → visual validation
  → tickets
  → bounded autonomous implementation
  → deterministic and agentic verification
  → release
  → feedback
  ↺
```

The ownership model that makes projects updatable instead of copy-once-and-rot:

```text
Shared capabilities are subscribed to.
Shared standards are synchronized.
Product knowledge remains locally owned.
Reusable lessons are deliberately promoted upstream.
```

## Usage (in a consuming project)

```bash
# Initialize a new or existing repository
npx @wemuda/launchrail init

# Inspect versions, enabled modules, drift, and missing requirements
npx @wemuda/launchrail status

# Preview upstream changes
npx @wemuda/launchrail diff

# Synchronize managed capabilities and run migrations
npx @wemuda/launchrail sync

# Validate the repository and environment
npx @wemuda/launchrail doctor

# Run the complete verification contract
npx @wemuda/launchrail verify
```

Consuming projects get a `.launchrail.yml` manifest, a committed `.launchrail-lock.json`, and a strict file-ownership model: **managed** files Launchrail may replace, **seeded** files it creates once and never overwrites, and **project-owned** files it never touches.

## Repository layout

```text
launchrail/
├── packages/
│   └── cli/                 # @wemuda/launchrail — the npx entry point
├── plugins/
│   └── launchrail/          # Claude Code plugin (skills, commands, agents, hooks)
├── .claude-plugin/
│   └── marketplace.json     # Claude Code plugin marketplace manifest
├── templates/               # Files seeded into consuming projects (added as built)
├── migrations/              # Versioned, idempotent upgrade steps (added as built)
├── examples/                # Example consuming projects for integration tests (added as built)
└── docs/
    └── adr/                 # Architecture decision records
```

Directories marked "added as built" are created when their first real content lands.

## Development

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
pnpm build
pnpm --filter @wemuda/launchrail exec launchrail --help
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) — a living checklist of what exists, what's in progress, and what's missing. The phases in one line:

`init` + `doctor` → core workflow plugin → browser testing → Ralph orchestration → sync engine → open-source readiness

## Contributing

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`) — see [ADR-0002](docs/adr/0002-conventional-commits.md). Meaningful decisions are recorded in [docs/adr/](docs/adr/).

## License

To be selected before public launch (open source intended).
