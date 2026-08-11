# Getting started

How to install Launchrail into a project and live with it day to day. For what Launchrail *is*, read the [README](../README.md) first.

## Prerequisites

- Node ≥ 22
- A git repository (`init` runs `git init` for you when the directory isn't one — the safe-write model leans on git history)
- [Claude Code](https://claude.com/claude-code) if you want the workflow plugin and skills (the CLI works without it)

## Installing

There is no install step — the CLI is published to npm as [`@wemuda/launchrail`](https://www.npmjs.com/package/@wemuda/launchrail) and every command runs through `npx`:

```bash
npx @wemuda/launchrail init
```

(Working on Launchrail itself? Run it from a checkout instead: `pnpm install && pnpm build`, then `node packages/cli/dist/index.js` in place of `npx @wemuda/launchrail`.)

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
- `.claude/settings.json` — declares both workflow plugin marketplaces (Launchrail's and Matt Pocock's) and enables their plugins via an additive merge ([ADR-0003](adr/0003-plugin-subscription-via-project-settings.md), extended by [ADR-0011](adr/0011-init-installs-plugin-via-claude-cli.md)), which is how the rest of the team gets offered the same skills when they first trust the folder.

Finally, when the `claude` CLI is on your `PATH`, `init` **installs every Claude Code plugin the workflow needs** — Launchrail's own (`launchrail@launchrail` from `wemuda/launchrail`) and Matt Pocock's skills (`mattpocock-skills@mattpocock` from `mattpocock/skills`) — via `claude plugin marketplace add` + `claude plugin install` ([ADR-0011](adr/0011-init-installs-plugin-via-claude-cli.md)). Already installed? `init` updates them to the marketplace's latest instead, so re-running it is also how you refresh the plugins. No CLI, or an install fails? `init` prints the exact commands instead. Opt out with `--skip-plugin-install` (or `LAUNCHRAIL_SKIP_CLAUDE_CLI=1`).

Re-running `init` is idempotent — it reports "everything already up to date" rather than duplicating or clobbering. See [examples/hello-launchrail](../examples/hello-launchrail) for a committed, unedited example of the result.

### Adopting an existing project

Running `init` inside a mid-development project that already uses AI works the same way, and nothing you own is overwritten. Your `AGENTS.md` and `CLAUDE.md` are kept as-is (`keep` in the plan). The one thing `init` does add is linkage: if you already have a `CLAUDE.md`, it **additively prepends the two workflow imports** — `@AGENTS.md` and `@.launchrail/CLAUDE.generated.md` — to the top of your file, leaving the rest byte-for-byte ([ADR-0012](adr/0012-init-wires-imports-into-existing-claude-md.md)). Without them, the managed workflow instructions Launchrail writes to `.launchrail/CLAUDE.generated.md` would sit on disk unread. The merge is idempotent (an import already present is never duplicated), so a project onboarded before this behavior existed is brought current by simply re-running `init`, and `doctor` warns if either import is missing.

The interview also asks whether this is a **new or existing project** and records the answer as `origin` in `.launchrail.yml` — it defaults to `existing` when it detects a `package.json` or existing agent files. That answer changes how the workflow starts: for an existing project, `/launchrail:launch` takes the **alignment on-ramp** ([ADR-0013](adr/0013-existing-project-alignment.md)) instead of a blank vision. The `project-alignment` skill inventories what your codebase already has, infers a draft vision from the code, interviews you only about the gaps (the real target user, the bet, the success signal), and detects your existing design system as the baseline for later design stages — then hands to `vision-creation` to commit and routes you to the first real gap. Everything after the vision is the same loop; alignment just gets an adopted project onto the rail without re-asking what the code already answers.

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

Teammates don't need the CLI at all: the committed `.claude/settings.json` makes Claude Code offer them both workflow plugins the first time they trust the project folder.

## Adding modules

```bash
npx @wemuda/launchrail add browser-testing   # Playwright baseline + smoke-journey contract (ADR-0004)
npx @wemuda/launchrail add ralph             # the bounded autonomous Ralph implementation loop (ADR-0005)
```

Both update the manifest (preserving your comments), seed or manage their files, and extend the generated Claude instructions. `verify` runs the deterministic gate; `smoke` scaffolds an evidence bundle for an agentic browser-smoke run.

## Updating to a new release

The whole update is this, in this order:

```text
# 1. In Claude Code — update the plugin, then reload:
/plugin              # → launchrail → update (and mattpocock-skills, if it has one)
/reload-plugins

# 2. In the terminal, from the project root — apply the release's files and migrations:
npx -y @wemuda/launchrail@latest sync

# 3. Commit, and optionally confirm health:
git add -A && git commit -m "chore: sync launchrail to 1.7.0"
npx -y @wemuda/launchrail@latest doctor
```

That's it. The next `/launchrail:launch` re-detects your position against the release's stage map, so anything the release added — a new stage, a reworked skill — either shows up as the next thing to do or is already behind your frontier. What each release contains is in the [CHANGELOG](../CHANGELOG.md).

The rest of this section is the why and the edge cases.

### Why the plugin updates first

A release versions two things in lockstep: the **plugin** (the `/launchrail:*` skills) and the **CLI** (the managed files and migrations `sync` applies). They update through different mechanisms — `sync` never touches plugins — and the order matters: the managed instructions a newer CLI writes can name workflow stages whose skills only exist in the newer plugin. Sync the files while an old plugin is still installed and `.launchrail/CLAUDE.generated.md` describes a loop your session can't run. Plugin first (or both in the same sitting) keeps the halves consistent.

No Claude Code session open? `claude plugin update launchrail@launchrail` from the terminal does the same thing, and re-running `npx -y @wemuda/launchrail@latest init` also refreshes already-installed plugins as part of its idempotent pass ([ADR-0011](adr/0011-init-installs-plugin-via-claude-cli.md)).

### Why `@latest` matters

The templates your project is compared against ship *inside* the CLI — no network check happens — and `npx` caches downloads. A stale cached CLI happily reports "everything up to date" against last month's templates. `@latest` forces `npx` to resolve the newest published release every time (`-y` just skips the install confirmation).

`status` shows the gap directly: its first line reads like `launchrail 1.7.0 — lockfile written by 1.5.0` — the CLI you're running versus the version that last wrote the project, recorded as `launchrailVersion` in `.launchrail-lock.json`. `sync` is what closes it.

### Previewing before you apply

All read-only:

```bash
npx -y @wemuda/launchrail@latest status         # summary: outdated files, pending migrations, advisories
npx -y @wemuda/launchrail@latest diff           # the same changes as unified diffs
npx -y @wemuda/launchrail@latest sync --dry-run # the full plan, migrations included
```

### What sync will and won't do

([ADR-0006](adr/0006-sync-engine.md))

- **Managed files** (e.g. `.launchrail/CLAUDE.generated.md`) are replaced with the new release's content — unless you've edited them locally, in which case your version is kept and the file is reported as a conflict. Revert the local edits to receive updates, or opt the file out of management permanently:

  ```bash
  npx -y @wemuda/launchrail@latest eject <module|file>   # vendor mode: Launchrail never writes that path again
  ```

- **Seeded files** (`AGENTS.md`, `CLAUDE.md`, the ADR template) and **project-owned files** are never touched, on any run.
- **Migrations** — structural changes like moving a file or rewriting a manifest field — run first, in order, idempotently. A failed migration stops the run and leaves the repository recoverable; nothing after it is attempted.

### Teammates

The file half of an update travels through git — teammates just `git pull`. The plugin half is per machine: each person updates their own through `/plugin` (the committed `.claude/settings.json` already points everyone at the same marketplaces).

## The workflow

With the plugin installed, the development loop runs vision → discovery → grill → research → ADRs → spec → design validation → tickets → bounded implementation (Ralph) → verification → release. The stage contract lives in the plugin's [workflow doc](../plugins/launchrail/docs/workflow.md).

To run it, invoke the `launch` skill (`/launchrail:launch`) — it detects which stage your project has reached and routes you to the right stage skill, or jumps straight to a stage you name (e.g. `launch deep-research`). You don't have to memorize the order; `launch` finds the frontier and, when it can't tell whether a stage is done, asks.
