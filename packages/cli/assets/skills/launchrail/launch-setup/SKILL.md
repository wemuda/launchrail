---
name: launch-setup
description: Configure this repo for the Launchrail workflow skills — set up its issue tracker and domain doc layout under docs/agents/. Stage 0 of the rail; run once per repository before the stages that read or write the tracker (launch-wayfinder, launch-spec, launch-tickets, launch-code-review, the implementation loop).
disable-model-invocation: true
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

# Launch setup

Scaffold the per-repo configuration the workflow skills assume:

- **Issue tracker** — where issues live (GitHub by default; GitLab and local markdown are also supported out of the box), including the rail's label vocabulary
- **Domain docs** — where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write. Everything it writes under `docs/agents/` is project-owned — Launchrail tooling never overwrites it, and the user can edit it directly later.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config` — is this a GitHub repo? Which one?
- `.launchrail.yml` — the manifest's `issueTracker` answer is the strongest signal for Section A; propose it.
- `AGENTS.md` and `CLAUDE.md` at the repo root — does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/` — does this skill's prior output already exist?
- `.scratch/` — sign that a local-markdown issue tracker convention is already in use
- Monorepo signals — a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order — one section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip a section entirely when exploration already settled it (Section B when there's no monorepo).

**Section A — Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `launch-tickets`, `launch-wayfinder`, and `launch-code-review` — and the implementation loop — read from and write to it: they need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: propose what `.launchrail.yml`'s `issueTracker` already says. Where the manifest doesn't settle it, propose GitHub when a `git remote` points there, GitLab for a GitLab host, and otherwise offer:

- **GitHub** — issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab** — issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown** — issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.) — ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`, starting from the matching seed template in this skill folder. The templates already record the rail's label vocabulary (`ready-for-agent`, `needs-info`, `spec`, `ralph:building`, `wayfinder:*`) — those strings are part of the workflow's contract, so seed them as-is; a repo whose tracker genuinely uses other strings edits the doc afterward, knowing the skills quote the canonical names.

**Section B — Domain docs.** Default to **single-context** — one `CONTEXT.md` + `docs/adr/` at the repo root. This fits almost every repo; write it without asking.

Offer **multi-context** — a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files — only when exploration found monorepo signals. Then confirm which layout they want.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md` and `docs/agents/domain.md`

Let them edit before writing.

### 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create — don't pick for them. (On an initialized Launchrail project both exist — edit `CLAUDE.md`.)

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa) — always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md) — GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) — GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md) — local-markdown issue tracker
- [domain.md](./domain.md) — domain doc consumer rules + layout

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description — keep its "Labels" and "Wayfinding operations" sections so every skill finds the same contract regardless of tracker.

### 5. Done

Tell the user the setup is complete and which skills now read from these files: `launch-wayfinder`, `launch-spec`, `launch-tickets`, and `launch-code-review` use the tracker doc; every design-stage skill (`launch-grill`, `launch-domain-modeling`, and friends) uses the domain doc. Mention they can edit `docs/agents/*.md` directly later — re-running this skill is only necessary to switch issue trackers or restart from scratch.
