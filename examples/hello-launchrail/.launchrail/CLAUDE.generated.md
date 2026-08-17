<!-- Managed by Launchrail v1.9.0. Do not edit: `launchrail sync` may replace this file. Project-specific instructions belong in CLAUDE.md. -->

# Launchrail workflow instructions

- This project follows the Launchrail development loop: vision → design exploration → discovery → grill/research → ADRs → spec → visual validation → tickets → bounded implementation → verification → release.
- Product knowledge (vision, specs, ADRs, designs, tickets, code) is project-owned; Launchrail never overwrites it.
- `.launchrail.yml` is project configuration; `.launchrail-lock.json` is machine-managed — do not hand-edit it.
- The issue-tracker workflow (labels included) and the domain-doc consumer rules live in `docs/agents/` — seeded from `.launchrail.yml`, yours to edit.
- Before claiming completion, run the project's deterministic checks. Completion requires evidence, not assertion.
- Run `npx @wemuda/launchrail doctor` when repository state seems inconsistent.

## The Ralph loop

- Implementation starts with `/launch-implement` — all ready tickets, or one with `/launch-implement <ticket>`. Multi-ticket runs execute as the `ralph` workflow (`.claude/workflows/ralph.js`), supervised per the `launch-ralph` skill; single tickets build in-session. Only ever started explicitly by the user.
- Every run declares one integration target: the default branch (trunk — the default) or a named consolidation branch via the `target` workflow arg, which collects the campaign and ends by offering one release PR to the default branch. The run's recap states where the work lives and the single next step.
- Tickets enter the loop with the `ready-for-agent` label and explicit `Blocked by: #n` edges; parked tickets carry `needs-info` plus their failure history.
- A ticket counts done only when its PR is merged on the remote, the issue is closed, and `npx @wemuda/launchrail verify` is green — agent reports are claims, not evidence.
- `.claude/workflows/ralph.js` is managed by Launchrail: override policy per run via workflow args (e.g. `{ width: 1 }`), never by editing the file.
- Launch unattended runs in a non-prompting permission mode (bypass/autonomous); a guard hook (`.claude/hooks/ralph-permission-guard.py`) warns if the `ralph` workflow starts in an interactive mode, since one benign prompt can stall a walk-away run and lose the container mid-ticket.
