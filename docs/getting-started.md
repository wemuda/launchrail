# Getting started

How to install Launchrail into a project and live with it day to day. For what Launchrail *is*, read the [README](../README.md) first.

## Prerequisites

- Node ≥ 22
- A git repository (Launchrail warns but proceeds without one — its safe-write model leans on git history)
- [Claude Code](https://claude.com/claude-code) if you want the workflow plugin and skills (the CLI works without it)

## Installing

> **Pre-release note:** `@wemuda/launchrail` is not on npm yet ([roadmap](../ROADMAP.md)). Until it is, run the CLI from a checkout of this repo:
>
> ```bash
> git clone https://github.com/wemuda/launchrail && cd launchrail
> pnpm install && pnpm build
> node packages/cli/dist/index.js --help   # use this path in place of `npx @wemuda/launchrail`
> ```

Once published, no install step is needed — every command runs through `npx`:

```bash
npx @wemuda/launchrail init
```

## Initializing a project

From the project root:

```bash
npx @wemuda/launchrail init            # interactive interview
npx @wemuda/launchrail init --yes      # accept detected defaults (CI/agents)
npx @wemuda/launchrail init --dry-run  # print the plan, write nothing
```

The interview asks four things — project mode (spike / standard MVP / high-rigor), issue tracker, Conventional Commits, and your deterministic test command — with defaults detected from the repo (package manager, scripts, commit history). It then writes:

- `.launchrail.yml` — the manifest. Seeded: yours to edit.
- `.launchrail-lock.json` — versions, ownership classes, checksums, applied migrations. Machine-managed; commit it, never hand-edit it.
- `AGENTS.md` + `CLAUDE.md` — the agent operating contract (with your chosen conventions baked in) and the Claude Code entry point importing it. Seeded once; existing files are never overwritten.
- `.launchrail/CLAUDE.generated.md` — managed workflow instructions, replaced on `sync` as modules change.
- `docs/adr/0000-template.md` — ADR template.
- `.claude/settings.json` — declares the Launchrail plugin marketplace and enables the plugin via an additive merge ([ADR-0003](adr/0003-plugin-subscription-via-project-settings.md)), which is how the rest of the team gets offered the plugin when they first trust the folder.

Finally, when the `claude` CLI is on your `PATH`, `init` **installs every Claude Code plugin the workflow needs** — Launchrail's own (`launchrail@launchrail` from `wemuda/launchrail`) and Matt Pocock's skills (`mattpocock-skills@mattpocock` from `mattpocock/skills`) — via `claude plugin marketplace add` + `claude plugin install` ([ADR-0011](adr/0011-init-installs-plugin-via-claude-cli.md)). No CLI, or an install fails? `init` prints the exact commands instead. Opt out with `--skip-plugin-install` (or `LAUNCHRAIL_SKIP_CLAUDE_CLI=1`).

Re-running `init` is idempotent — it reports "everything already up to date" rather than duplicating or clobbering. See [examples/hello-launchrail](../examples/hello-launchrail) for a committed, unedited example of the result.

Then validate and commit:

```bash
npx @wemuda/launchrail doctor
git add -A && git commit -m "chore: initialize launchrail"
```

`doctor` checks the manifest, lockfile, checksum drift, pending migrations, plugin declaration, and environment, and exits non-zero on failures (warnings don't fail it).

## Handing off to Claude Code

From here the workflow lives in Claude Code, not the CLI:

1. **Open Claude Code in the project.** `init` already installed the workflow plugins if the `claude` CLI was available; a session that was open during `init` needs `/reload-plugins` or a restart to see them. If `init` printed manual steps instead, run them (inside Claude Code: `/plugin` → Marketplaces → Add → the full `owner/repo` source, e.g. `wemuda/launchrail` — a bare name is rejected).
2. **Run `/launchrail:launch`.** The conductor detects the project's stage and drives the workflow from there. On a fresh project that means running `/setup-matt-pocock-skills` (the skills plugin is preinstalled), then vision creation — which also replaces the seeded `AGENTS.md` project-purpose TODO. You don't fill the seeded files in by hand; the stages that own the knowledge write it.

Teammates don't need the CLI at all: the committed `.claude/settings.json` makes Claude Code offer them the plugin the first time they trust the project folder.

## Adding modules

```bash
npx @wemuda/launchrail add browser-testing   # Playwright baseline + smoke-journey contract (ADR-0004)
npx @wemuda/launchrail add ralph             # bounded autonomous implementation campaigns (ADR-0005)
```

Both update the manifest (preserving your comments), seed or manage their files, and extend the generated Claude instructions. `verify` runs the deterministic gate; `smoke` scaffolds an evidence bundle for an agentic browser-smoke run.

## Staying current

```bash
npx @wemuda/launchrail status   # drift, available updates, pending migrations, upstream advisories
npx @wemuda/launchrail diff     # preview upstream changes as unified diffs
npx @wemuda/launchrail sync     # apply managed updates + ordered, idempotent migrations
```

`sync` only replaces managed files whose checksums match the lockfile — local edits to a managed file are reported as conflicts, never overwritten ([ADR-0006](adr/0006-sync-engine.md)). To keep local edits permanently:

```bash
npx @wemuda/launchrail eject <module|file>   # vendor mode: Launchrail never writes that path again
```

## The workflow

With the plugin installed, the development loop runs vision → grill → research → ADRs → spec → design validation → tickets → bounded implementation (Ralph) → verification → release. The stage contract lives in the plugin's [workflow doc](../plugins/launchrail/docs/workflow.md).

To run it, invoke the `launch` skill (`/launchrail:launch`) — it detects which stage your project has reached and routes you to the right stage skill, or jumps straight to a stage you name (e.g. `launch deep-research`). You don't have to memorize the order; `launch` finds the frontier and, when it can't tell whether a stage is done, asks.
