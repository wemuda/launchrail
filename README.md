<div align="center">

<img src="assets/logo.png" alt="Launchrail logo" width="200" />

# Launchrail

**An updatable development system for taking a software idea from product intent to a verified release.**

[![CI](https://github.com/wemuda/launchrail/actions/workflows/ci.yml/badge.svg)](https://github.com/wemuda/launchrail/actions/workflows/ci.yml)
[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange)](ROADMAP.md)
[![Node >= 22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](package.json)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](pnpm-workspace.yaml)
[![Conventional Commits](https://img.shields.io/badge/commits-conventional-FE5196?logo=conventionalcommits&logoColor=white)](docs/adr/0002-conventional-commits.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[How it works](#how-it-works) ·
[Getting started](docs/getting-started.md) ·
[Using it](#using-it-in-your-project) ·
[Ownership model](#the-ownership-model) ·
[Repository layout](#repository-layout) ·
[Roadmap](ROADMAP.md) ·
[Contributing](#contributing) ·
[Credits](#credits)

</div>

---

> **Status:** Pre-release. All six roadmap phases are implemented; nothing is published to npm yet.

This repository is the Launchrail **toolchain**: the CLI, Claude Code plugin, templates, and migrations that initialize other repositories and keep them current. It is not an application framework and it does not replace Claude Code, Claude Design, [Matt Pocock's skills](https://github.com/mattpocock/skills), GitHub, Playwright, or a project's chosen stack. It is the shared rail that connects them.

## How it works

Launchrail structures development as two movements. The **foundation** runs once per project: it turns an idea into hard constraints and recorded decisions. Then the **delivery loop** takes over — spec a slice, validate it, break it into tickets, implement, verify, and go around again for the next slice of the platform. Every stage leaves a committed artifact behind, and the next stage starts from that artifact, not from chat memory. The `launch` skill is the single entry point: it reads the committed artifacts, detects where the project is, and routes to the stage's owner.

```mermaid
flowchart LR
    subgraph foundation ["Foundation — once per project"]
        direction TB
        V(["Vision"]) --> X["Visual exploration"]
        X --> G["Complexity grill"]
        G --> R["Technical research"]
        R --> A["Architecture decisions"]
    end

    A --> S

    subgraph loop ["Delivery loop — once per slice"]
        direction TB
        S["MVP specification"] --> D["Design validation"]
        D --> T["Tickets"]
        T --> I["Bounded implementation — Ralph campaign"]
        I --> VF["Verification — launchrail verify + browser smoke"]
        VF -.->|"next slice"| S
    end
```

Several stages run directly on [Matt Pocock's skills](https://github.com/mattpocock/skills) — see [Credits](#credits). The full stage contract — inputs, artifacts, composition rules, and per-mode rigor — lives in [the workflow doc](plugins/launchrail/docs/workflow.md).

What makes projects **updatable** instead of copy-once-and-rot is the second half of the system: shared capabilities are *subscribed to*, shared standards are *synchronized*, product knowledge stays *locally owned*, and reusable lessons are *deliberately promoted upstream*.

## Using it in your project

One command sets the rails:

```bash
npx @wemuda/launchrail init
```

`init` interviews you (or takes `--yes`), runs `git init` if the directory isn't a repository yet, seeds `AGENTS.md` and ADR conventions without touching existing content, subscribes the repository to the workflow's Claude Code plugins through `.claude/settings.json` — so every collaborator who opens the project in Claude Code gets the same skills — and, when the `claude` CLI is on your PATH, installs those plugins for you on the spot — Launchrail's own and Matt Pocock's skills ([ADR-0011](docs/adr/0011-init-installs-plugin-via-claude-cli.md)).

From there, the day-to-day driver is not the CLI — it's the **`launch` skill** inside Claude Code: open the project and run `/launchrail:launch`. Invoke it (or just ask "what's next?") and it reads your committed artifacts, works out where the project is — no vision yet, mid-grill, spec validated, tickets ready — and runs or routes to the next stage's owner. Give it a stage name (`launch design-validation`) to jump straight there. The plugin carries the rest of the workflow too:

- **`vision-creation`** and **`design-validation`** — the Launchrail-owned stages of the pipeline
- **`browser-smoke`** — drives a real browser journey and leaves a traceable evidence bundle (with the browser-testing module)
- **`ralph`**, **`ralph-implement`**, **`resolving-merge-conflicts`** — the verification-gated implementation campaign (with the ralph module)

The CLI is the maintenance surface you return to between sessions:

```bash
npx @wemuda/launchrail status                # versions, drift, pending migrations
npx @wemuda/launchrail diff                  # preview upstream changes
npx @wemuda/launchrail sync                  # apply managed updates + run migrations
npx @wemuda/launchrail add browser-testing   # enable a module (also: add ralph)
npx @wemuda/launchrail doctor                # repository and environment checks
npx @wemuda/launchrail verify                # deterministic verification gate
npx @wemuda/launchrail smoke                 # scaffold a browser-smoke evidence bundle
npx @wemuda/launchrail eject <module|file>   # opt out of management (vendor mode: --all)
```

Initialized projects carry two files: `.launchrail.yml` (configuration) and `.launchrail-lock.json` (versions, checksums, applied migrations; committed to the repo). Full walkthrough: [docs/getting-started.md](docs/getting-started.md). Committed, unedited example of what `init` produces: [examples/hello-launchrail](examples/hello-launchrail).

## The ownership model

Every file Launchrail touches in a consuming project belongs to exactly one class — and no feature is allowed to blur the lines:

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
├── examples/
│   └── hello-launchrail/    # Committed, unedited output of `launchrail init` on a tiny app
└── docs/
    ├── adr/                 # Architecture decision records
    ├── getting-started.md   # Installation and day-2 guide
    └── releasing.md         # How releases are cut
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

See [ROADMAP.md](ROADMAP.md), a living checklist of what exists, what's in progress, and what's missing. All six phases — `init` + `doctor`, the core workflow plugin, browser testing, Ralph orchestration, the sync engine, and open-source readiness — are implemented and covered by 137 tests. The first real Ralph campaigns have run against a Wemuda project, and their lessons are folded back into the toolchain (ADR-0010). What stands between here and a first release: the dogfood case study on a real project and flipping on the npm publish.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`); see [ADR-0002](docs/adr/0002-conventional-commits.md). Releases and the changelog are generated from them ([docs/releasing.md](docs/releasing.md)).
- Meaningful decisions are recorded as ADRs in [docs/adr/](docs/adr/).
- The agent operating contract lives in [AGENTS.md](AGENTS.md).
- Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Credits

Launchrail doesn't reinvent a workflow — it composes one, and much of that workflow is [**Matt Pocock**](https://www.mattpocock.com/)'s. Four stages of the pipeline (complexity grill, technical research, MVP specification, tickets) run directly on his [`skills`](https://github.com/mattpocock/skills) repository — `grill-with-docs`, the research skill, `wayfinder`/`to-spec`, and `to-tickets`. Launchrail exists to wire those skills into a repo cleanly and keep them updatable, not to replace them.

If Launchrail is useful to you, the credit belongs upstream first: star [`mattpocock/skills`](https://github.com/mattpocock/skills), watch [Matt's YouTube channel](https://www.youtube.com/@mattpocockuk), follow [@mattpocockuk on X](https://x.com/mattpocockuk), and check out [AI Hero](https://www.aihero.dev/).

## License

[MIT](LICENSE) ([ADR-0007](docs/adr/0007-mit-license.md)). Everything Launchrail writes into *your* repository — seeded files, managed files, rendered templates — is yours, with no attribution or license obligation attached.
