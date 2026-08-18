# ADR-0025: Ralph default integration target — consolidate by default, trunk is opt-in

## Status
Accepted (amends [ADR-0022](0022-ralph-campaign-revision.md))

## Context
ADR-0022 gave every Ralph run an explicit integration target and made **trunk the default**: each verified ticket merges straight into the repository's default branch, live on mainline the moment its CI passes. Consolidation onto a named branch — default branch untouched, one release PR offered at the end — existed but was opt-in, reached only when the user named a branch or the environment forbade pushing to the default branch.

That default is backwards for a loop whose whole premise is running unattended. A multi-ticket campaign that lands each ticket on the default branch the instant CI goes green puts aggregated, machine-reviewed change on mainline with no single human checkpoint. Each per-ticket PR passed the loop's own self-review, but no person ever saw the campaign as a whole before it was live. "Safe by default" for autonomous work means the default branch is not touched until a human says so — so the human reviews one consolidated diff, not a merge queue that already happened.

The machinery to do this already shipped in ADR-0022; it was simply not the default, and it required the *user* to supply the branch name. ADR-0022 even records consolidation being "improvised" mid-run on the first real campaign because nobody had chosen it up front. Making it the default means the front door must name the branch itself.

## Decision
Flip the default and let the front door own the naming, keeping the two frontends' policy blocks parallel:

- **Consolidation is the default for multi-ticket runs.** The whole ready frontier, several ticket numbers, a count, or a spec/slice reference all collect onto one integration branch; the default branch is never touched, and the run ends by *offering* one release PR `<target> → <default>`. **Trunk** — each ticket live on the default branch the moment it merges — is demoted from default to an explicit opt-in the user asks for ("land each ticket on master as it goes").
- **The front door owns branch naming, and the name is scope-native.** `launch-implement` resolves the integration branch before anything dispatches: the user's name when given; else the scope's own name when it maps to a spec / epic / slice (`spec/<n>-<slug>`, as in ADR-0022's examples); else a generated fallback (`launch/frontier-<date>`, or `launch/tickets-<n>-<m>`) for an ad-hoc frontier. It restates the resolved branch in the pre-launch echo.
- **The workflow stays mechanically "a target, or trunk when none is given"; the front door always supplies a target.** The clockless, byte-identical `ralph.workflow.js` cannot mint a branch name (no clock, no randomness, and scope→spec resolution needs tracker context it does not hold), so the *policy* "consolidate by default" lives at the door while the *mechanism* stays in the workflow. A bare workflow launch with no `target` is still trunk mode — now an explicit, non-default path.
- **The release PR is offered, not opened** — unchanged from ADR-0022. The terminal state hands the user a ready-to-fire PR; opening it, and the merge, stay human actions.
- **Single-ticket in-session mode is unchanged.** `/launch-implement <n>` builds one ticket and merges its one CI-gated PR into the default branch. A single explicitly-named ticket has nothing to consolidate, and a consolidation branch plus a second PR for one ticket is overhead, not safety. Consolidation-by-default is a property of the multi-ticket loop.

## Alternatives considered
- **Keep trunk the default; rely on users to opt into consolidation** — rejected: the safe mode should be the one you get without asking, most of all for a loop built to run unattended. Opt-in safety is precisely the gap ADR-0022 observed when consolidation had to be improvised mid-run.
- **Auto-open the release PR at the end** — rejected: the human checkpoint is the whole point. The loop already stops short of the default branch; opening an outward-facing PR without a human yes would spend the checkpoint this change exists to add. The loop offers; the human opens and merges.
- **Let the workflow auto-name the branch** — rejected: it has no clock or randomness and ships byte-identical across projects, and scope-native naming needs tracker context the front door already holds. Naming belongs at the door.
- **Consolidate single tickets too** — rejected: nothing to consolidate; two PRs for one ticket is pure overhead with no added safety.

## Consequences
- Easier: an unattended campaign never touches the default branch until a human merges the release PR; the campaign is reviewable as one diff; consolidation is first-class instead of improvised.
- Harder: every multi-ticket run now creates and carries an integration branch and ends with a release PR the user must merge — one more step before work is live; the front door gains branch-naming logic it did not have.
- Constrained: trunk (per-ticket merges to the default branch) is reachable only by asking for it explicitly; the front door must resolve a branch name before any dispatch and restate it in the echo.

## Revisit when
- Consolidation campaigns need stacked targets (a branch per track within one run) rather than one branch per run — already on ADR-0022's revisit list.
- Usage shows the release-PR step is friction users routinely skip, which would argue for an opt-in auto-open after all.
- Single-ticket runs come to want the same stop-and-offer safety (teams that never auto-merge to the default branch), which would argue for a project-level default rather than a per-run one.
