<div align="center">

<img src="assets/logo.png" alt="Launchrail logo" width="200" />

# Launchrail

**An updatable development system for taking a software idea from product intent to a verified release.**

[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange)](ROADMAP.md)
[![Node >= 22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](package.json)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](pnpm-workspace.yaml)
[![Conventional Commits](https://img.shields.io/badge/commits-conventional-FE5196?logo=conventionalcommits&logoColor=white)](docs/adr/0002-conventional-commits.md)

[How it works](#how-it-works) ·
[Usage](#usage-in-a-consuming-project) ·
[Ownership model](#the-ownership-model) ·
[Repository layout](#repository-layout) ·
[Roadmap](ROADMAP.md) ·
[Contributing](#contributing)

</div>

---

> **Status:** Pre-release. Nothing is published to npm yet.

This repository is the Launchrail **toolchain**: the CLI, Claude Code plugin, templates, and migrations that initialize other repositories and keep them current. It is not an application framework and it does not replace Claude Code, Claude Design, Matt Pocock's skills, GitHub, Playwright, or a project's chosen stack. It is the shared rail that connects them.

## How it works

Launchrail structures the path from idea to release as an explicit pipeline:

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

What makes projects updatable instead of copy-once-and-rot:

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

# Add a module later
npx @wemuda/launchrail add browser-testing
npx @wemuda/launchrail add ralph

# Validate the repository and environment
npx @wemuda/launchrail doctor

# Run the deterministic verification contract
npx @wemuda/launchrail verify

# Scaffold an evidence bundle for an agentic browser smoke run
npx @wemuda/launchrail smoke

# Stop managing a file or module (vendor mode: --all)
npx @wemuda/launchrail eject <module|file>
```

Initialized projects carry two files: `.launchrail.yml` (configuration) and `.launchrail-lock.json` (versions, checksums, applied migrations; committed to the repo).

## The ownership model

Every file Launchrail touches in a consuming project belongs to exactly one class:

| Class | Who owns it | What Launchrail may do |
| --- | --- | --- |
| **Managed** | Launchrail | Replace it on `sync` |
| **Seeded** | The project, after creation | Create it once, then never touch it |
| **Project-owned** | The project, always | Nothing |

Every write supports dry-run, is checksum-aware, and is idempotent: re-running `init` or `sync` never duplicates blocks or destroys local work. A managed file you edit locally keeps your edits — `sync` reports the conflict instead of overwriting — and `launchrail eject` permanently opts a file or module out of management ([ADR-0006](docs/adr/0006-sync-engine.md)).

## Repository layout

```text
launchrail/
├── assets/                  # Logo and other repo media
├── packages/
│   └── cli/                 # @wemuda/launchrail — the npx entry point
├── plugins/
│   └── launchrail/          # Claude Code plugin (skills, commands, agents, hooks)
├── .claude-plugin/
│   └── marketplace.json     # Claude Code plugin marketplace manifest
├── templates/               # Files seeded into consuming projects (added as built)
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

See [ROADMAP.md](ROADMAP.md), a living checklist of what exists, what's in progress, and what's missing. The phases in one line:

`init` + `doctor` → core workflow plugin → browser testing → Ralph orchestration → sync engine → open-source readiness

## Contributing

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`); see [ADR-0002](docs/adr/0002-conventional-commits.md).
- Meaningful decisions are recorded as ADRs in [docs/adr/](docs/adr/).
- The agent operating contract lives in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) ([ADR-0007](docs/adr/0007-mit-license.md)). Everything Launchrail writes into *your* repository — seeded files, managed files, rendered templates — is yours, with no attribution or license obligation attached.
