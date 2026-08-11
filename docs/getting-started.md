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

Every Launchrail release versions the CLI and the Claude Code plugin in lockstep — `v1.7.0` covers both — but a project consumes them through two different mechanisms, and `sync` deliberately handles only one. A full update is two moves: refresh the plugins, then sync the files. Do them in that order (or in the same sitting): the managed instructions a newer CLI writes can reference workflow stages whose skills only exist in the newer plugin.

### 1. Update the Claude Code plugins

`sync` never touches plugins. Refresh them any of three ways — all end in the same place:

- **In Claude Code:** run `/plugin` and update the installed plugins (`launchrail` and `mattpocock-skills`). A session that's already open needs `/reload-plugins` or a restart to run the new skills.
- **From the terminal:** `claude plugin update launchrail@launchrail` (and `claude plugin update mattpocock-skills@mattpocock` while you're at it).
- **Re-run init:** `npx @wemuda/launchrail@latest init` updates already-installed plugins to the marketplace's latest as part of its idempotent pass ([ADR-0011](adr/0011-init-installs-plugin-via-claude-cli.md)).

Plugins install per user, not per repository — each teammate refreshes their own machine the same way.

### 2. Sync the project files

```bash
npx @wemuda/launchrail@latest status         # the gap: outdated files, pending migrations, advisories
npx @wemuda/launchrail@latest diff           # the same changes as unified diffs
npx @wemuda/launchrail@latest sync --dry-run # the full plan, migrations included — writes nothing
npx @wemuda/launchrail@latest sync           # apply: migrations first, then managed file updates
```

**The `@latest` is load-bearing.** The templates a project is compared against ship *inside* the CLI — no network check happens — and `npx` caches downloads. Run a stale cached CLI and `status` will report "everything up to date" against last month's templates. `@latest` forces `npx` to resolve the newest published release every time.

`status` also tells you where you stand: its first line reads like `launchrail 1.7.0 — lockfile written by 1.5.0`, and that gap is exactly what `sync` closes (recorded as `launchrailVersion` in `.launchrail-lock.json`).

What `sync` will and won't do ([ADR-0006](adr/0006-sync-engine.md)):

- **Managed files** (e.g. `.launchrail/CLAUDE.generated.md`) are replaced with the new release's content — unless you've edited them locally, in which case your version is kept and the file is reported as a conflict. Revert the local edits to receive updates, or opt the file out of management permanently:

  ```bash
  npx @wemuda/launchrail@latest eject <module|file>   # vendor mode: Launchrail never writes that path again
  ```

- **Seeded files** (`AGENTS.md`, `CLAUDE.md`, the ADR template) and **project-owned files** are never touched, on any run.
- **Migrations** — structural changes like moving a file or rewriting a manifest field — run first, in order, idempotently. A failed migration stops the run and leaves the repository recoverable; nothing after it is attempted.

### 3. Review, commit, verify

```bash
git diff                                     # sync output is a normal working-tree change
git add -A && git commit -m "chore: launchrail sync to v1.7.0"
npx @wemuda/launchrail@latest doctor         # manifest, lockfile, plugin wiring, environment
```

Teammates pick up the file half of the update with a plain `git pull`; the plugin half each person refreshes on their own machine (step 1). With both halves updated, the next `/launchrail:launch` re-detects the project's position against the release's stage map — if the new version added a workflow stage, this is where you find out whether it applies to you or is already behind your frontier.

## The workflow

With the plugin installed, the development loop runs vision → discovery → grill → research → ADRs → spec → design validation → tickets → bounded implementation (Ralph) → verification → release. The stage contract lives in the plugin's [workflow doc](../plugins/launchrail/docs/workflow.md).

To run it, invoke the `launch` skill (`/launchrail:launch`) — it detects which stage your project has reached and routes you to the right stage skill, or jumps straight to a stage you name (e.g. `launch deep-research`). You don't have to memorize the order; `launch` finds the frontier and, when it can't tell whether a stage is done, asks.
