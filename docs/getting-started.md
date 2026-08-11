# Getting started

How to install Launchrail into a project and live with it day to day. For what Launchrail *is*, read the [README](../README.md) first.

## Prerequisites

- Node ≥ 22
- A git repository (`init` runs `git init` for you when the directory isn't one — the safe-write model leans on git history)
- [Claude Code](https://claude.com/claude-code) if you want to run the workflow skills (the CLI works without it, and the vendored skills are plain files any repo-reading agent can use)

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
- `.claude/workflows/ralph.js` — the built-in implementation loop's workflow form, managed ([ADR-0018](adr/0018-implement-front-door.md)): the default loop is present from day one, so `/launch-implement` works the moment tickets exist. (Selecting the Superpowers loop skips this and installs its plugin instead.)
- `docs/adr/0000-template.md` — ADR template.
- `.claude/skills/` — the workflow skills, vendored as **managed files** ([ADR-0019](adr/0019-vendor-skills-retire-plugin.md)): Launchrail's own (`launch-*`) plus a pinned, MIT-attributed snapshot of Matt Pocock's skills (bare upstream names), and a `NOTICE-mattpocock.md` carrying the license. Committed to the repo, so the whole team — and every session, cloud or local, on any agent — has them after a `git pull`. (`.claude/settings.json` is touched only if you select an external loop like Superpowers, which still ships as a plugin.)

There is no plugin to install — the skills are on disk the moment `init` finishes, and re-running `init` (or `sync`) is how you refresh them. The one exception is the implementation loop: if you pick **Superpowers** instead of the default **Ralph**, that engine still ships as a Claude Code plugin, so `init` installs it via the `claude` CLI when it's on your `PATH` (and prints the exact commands when it isn't). Opt out of that install with `--skip-plugin-install` (or `LAUNCHRAIL_SKIP_CLAUDE_CLI=1`).

Re-running `init` is idempotent — it reports "everything already up to date" rather than duplicating or clobbering. See [examples/hello-launchrail](../examples/hello-launchrail) for a committed, unedited example of the result.

### Adopting an existing project

Running `init` inside a mid-development project that already uses AI works the same way, and nothing you own is overwritten. Your `AGENTS.md` and `CLAUDE.md` are kept as-is (`keep` in the plan). The one thing `init` does add is linkage: if you already have a `CLAUDE.md`, it **additively prepends the two workflow imports** — `@AGENTS.md` and `@.launchrail/CLAUDE.generated.md` — to the top of your file, leaving the rest byte-for-byte ([ADR-0012](adr/0012-init-wires-imports-into-existing-claude-md.md)). Without them, the managed workflow instructions Launchrail writes to `.launchrail/CLAUDE.generated.md` would sit on disk unread. The merge is idempotent (an import already present is never duplicated), so a project onboarded before this behavior existed is brought current by simply re-running `init`, and `doctor` warns if either import is missing.

The interview also asks whether this is a **new or existing project** and records the answer as `origin` in `.launchrail.yml` — it defaults to `existing` when it detects a `package.json` or existing agent files. That answer changes how the workflow starts: for an existing project, `/launch` takes the **alignment on-ramp** ([ADR-0013](adr/0013-existing-project-alignment.md)) instead of a blank vision. The `project-alignment` skill inventories what your codebase already has, infers a draft vision from the code, interviews you only about the gaps (the real target user, the bet, the success signal), and detects your existing design system as the baseline for later design stages — then hands to `vision-creation` to commit and routes you to the first real gap. Everything after the vision is the same loop; alignment just gets an adopted project onto the rail without re-asking what the code already answers.

Then validate and commit:

```bash
npx @wemuda/launchrail doctor
git add -A && git commit -m "chore: initialize launchrail"
```

`doctor` checks the manifest, lockfile, checksum drift, pending migrations, vendored skills, and environment, and exits non-zero on failures (warnings don't fail it).

## Handing off to Claude Code

From here the workflow lives in Claude Code, not the CLI:

1. **Open Claude Code (or another agent) in the project.** The skills are already in `.claude/skills/` — nothing to install. (A Claude Code session that was open during `init` may need `/reload-plugins` or a restart to pick up the new files.)
2. **Run `/launch`.** The planning conductor detects the project's stage and drives the workflow from there. On a fresh project that means running `/setup-matt-pocock-skills` (vendored — run once to configure the issue tracker, labels, and domain docs), then vision creation — which also replaces the seeded `AGENTS.md` project-purpose TODO. You don't fill the seeded files in by hand; the stages that own the knowledge write it.
3. **When tickets exist, run `/launch-implement`.** The one door to building: it drives every ready ticket to a verified merge through the project's selected loop — or just one (`/launch-implement 15`), or a bounded slice of the backlog ("the next 5 of spec #2" — it resolves the scope against the tracker, tells you what it resolved, and stops after five verified merges). That's the whole surface to remember: `launch` plans, `launch-implement` builds.

Teammates don't need the CLI at all: the skills are committed files, so a `git pull` gives everyone the same workflow — no install, no per-machine plugin state.

## Adding modules

```bash
npx @wemuda/launchrail add browser-testing   # Playwright baseline + smoke-journey contract (ADR-0004)
npx @wemuda/launchrail add ralph             # re-install the Ralph loop's materials (installed by init; ADR-0005/0018)
```

Both update the manifest (preserving your comments), seed or manage their files, and extend the generated Claude instructions. `verify` runs the deterministic gate; `smoke` scaffolds an evidence bundle for an agentic browser-smoke run. The Ralph loop itself needs no `add` on the golden path — `init` installs it when it's the selected implementation loop, and `sync` brings older projects current.

## Updating to a new release

The whole update is:

```bash
# From the project root — apply the release's files (skills included) and migrations:
npx -y @wemuda/launchrail@latest sync

# Commit, and optionally confirm health:
git add -A && git commit -m "chore: sync launchrail"
npx -y @wemuda/launchrail@latest doctor
```

That's it — one command. Because the skills are managed files, `sync` updates them alongside the templates and migrations in a single pass: there is no separate plugin step, and no plugin-vs-CLI version skew to sequence. The next `/launch` re-detects your position against the release's stage map, so anything the release added — a new stage, a reworked skill — either shows up as the next thing to do or is already behind your frontier. What each release contains is in the [CHANGELOG](../CHANGELOG.md).

The rest of this section is the why and the edge cases.

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

The whole update travels through git — the skills are managed files, so teammates just `git pull`. (One exception: if the project uses the **Superpowers** loop, that external plugin is still per-machine — each person updates it through `/plugin`.)

## The workflow

With the skills vendored into `.claude/skills/`, the development loop runs vision → discovery → grill → research → ADRs → spec → design validation → tickets → bounded implementation → verification → release. The stage contract lives in the [workflow doc](../packages/cli/assets/skills/launchrail/launch/workflow.md) (vendored into projects as `.claude/skills/launch/workflow.md`).

Two commands run it. `/launch` plans: it detects which stage your project has reached and routes you to the right stage skill, jumps straight to a stage you name (e.g. `launch deep-research`), and sizes each new feature once the foundation exists. `/launch-implement` builds: it drives the ready tickets to verified merges through the project's selected loop. You don't have to memorize the order — `launch` finds the frontier and, when it can't tell whether a stage is done, asks.
