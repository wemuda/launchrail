# Getting started

How to install Launchrail into a project and live with it day to day. For what Launchrail *is*, read the [README](../README.md) first.

## Prerequisites

- Node ≥ 22
- A git repository (`init` runs `git init` for you when the directory isn't one — the safe-write model leans on git history)
- [Claude Code](https://claude.com/claude-code) if you want the workflow plugin and skills (the CLI works without it)

## Installing

> **Not on npm yet.** The publish flips on with the first release token (see [releasing](releasing.md)). Until then, run the CLI from a checkout of this repo:
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
- `.claude/workflows/ralph.js` — the built-in implementation loop's workflow form, managed ([ADR-0018](adr/0018-implement-front-door.md)): the default loop is present from day one, so `/launchrail:implement` works the moment tickets exist. (Selecting the Superpowers loop skips this and installs its plugin instead.)
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
2. **Run `/launchrail:launch`.** The planning conductor detects the project's stage and drives the workflow from there. On a fresh project that means running `/setup-matt-pocock-skills` (the skills plugin is preinstalled), then vision creation — which also replaces the seeded `AGENTS.md` project-purpose TODO. You don't fill the seeded files in by hand; the stages that own the knowledge write it.
3. **When tickets exist, run `/launchrail:implement`.** The one door to building: it drives every ready ticket to a verified merge through the project's selected loop — or just one (`/launchrail:implement 15`). That's the whole surface to remember: `launch` plans, `implement` builds.

Teammates don't need the CLI at all: the committed `.claude/settings.json` makes Claude Code offer them both workflow plugins the first time they trust the project folder.

## Adding modules

```bash
npx @wemuda/launchrail add browser-testing   # Playwright baseline + smoke-journey contract (ADR-0004)
npx @wemuda/launchrail add ralph             # re-install the Ralph loop's materials (installed by init; ADR-0005/0018)
```

Both update the manifest (preserving your comments), seed or manage their files, and extend the generated Claude instructions. `verify` runs the deterministic gate; `smoke` scaffolds an evidence bundle for an agentic browser-smoke run. The Ralph loop itself needs no `add` on the golden path — `init` installs it when it's the selected implementation loop, and `sync` brings older projects current.

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

With the plugin installed, the development loop runs vision → discovery → grill → research → ADRs → spec → design validation → tickets → bounded implementation → verification → release. The stage contract lives in the plugin's [workflow doc](../plugins/launchrail/docs/workflow.md).

Two commands run it. `/launchrail:launch` plans: it detects which stage your project has reached and routes you to the right stage skill, jumps straight to a stage you name (e.g. `launch deep-research`), and sizes each new feature once the foundation exists. `/launchrail:implement` builds: it drives the ready tickets to verified merges through the project's selected loop. You don't have to memorize the order — `launch` finds the frontier and, when it can't tell whether a stage is done, asks.
