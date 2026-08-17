# ADR-0023: The spec's home follows the configured tracker

## Status
Accepted — amends the stage-7 artifact contract in the `launch` skill's [workflow.md](../../packages/cli/assets/skills/launchrail/launch/workflow.md).

## Context
Stage 7's committed artifact was pinned to a file under `docs/specs/`, regardless of how the project tracks work. `launch-spec` committed that file **and** could publish a `spec`-labeled copy to the tracker — the same spec living in two places, with nothing keeping them in sync. Meanwhile stage 9 tickets already solved exactly this problem: [launch-tickets](../../packages/cli/assets/skills/launchrail/launch-tickets/SKILL.md) lets the ticket's home *follow the configured tracker* — local files under `.scratch/` for `issueTracker: local`, real issues for GitHub/GitLab/Linear. The spec was the one planning artifact that never got that treatment, so a real-tracker project ended up with its spec in the repo and its tickets on the tracker, with no native link between them.

Every tracker doc already declares a `spec` label ("a spec or research note published to the tracker") — the vocabulary for a tracker-hosted spec existed, but the workflow treated it as an optional secondary copy rather than the home.

## Decision
The spec's home follows the configured tracker, mirroring how tickets already behave.

- **Real tracker (`github` / `gitlab` / `linear`)** → the spec **is** a `spec`-labeled issue. That issue is the single canonical stage-7 artifact. `launch-tickets` breaks it into tickets that reference it through the platform's **native parent / sub-issue relation**. No `docs/specs/` file is written.
- **`local`** (and `none`, which is treated as local) → the spec is a committed file at `docs/specs/<feature-slug>.md`. There is no external store, so the file *is* the canonical artifact — project-owned, and the only home. The former `.scratch/<feature-slug>/spec.md` working copy is dropped from the contract.

Stage-7 detection becomes tracker-aware: `/launch` reads the tracker config to know where the artifact lives — a `spec`-labeled issue on a real tracker, or a `docs/specs/` file in local mode — rather than always stat-ing a path.

`ready-for-agent` still marks tickets only; a spec published to a real tracker wears `spec` so the implementation loop's frontier never dispatches it as work — the invariant that already governs the tracker is unchanged.

## Alternatives considered
- **Keep `docs/specs/` canonical everywhere; never publish the spec to the tracker.** Rejected: it splits the planning record — spec in the repo, its tickets on the tracker, no native link between them — and keeps the spec inconsistent with tickets, which already live on the tracker. It removes the duplication in the wrong direction.
- **Tracker-first, but keep an optional committed mirror.** Rejected: that is essentially the current state and the source of the drift. Two homes for one artifact with no sync is exactly what this ADR removes.
- **A CLI-computed spec location.** Rejected for the reason ADR-0009/0014 rejected CLI-owned planning stages: writing and detecting the spec is interview-and-synthesis work owned by a skill, not an idempotent file write.

## Consequences
- **Easier:** one home per artifact. On a real tracker the spec and its tickets share a store and a native parent/child link; there is no file-vs-issue drift to reconcile.
- **Harder:** stage-7 detection is now tracker-aware — `/launch` must consult `docs/agents/issue-tracker.md`, not just stat `docs/specs/`. Local mode keeps the simple file check.
- **Constrained:** `launch-spec` no longer writes `docs/specs/` on a real-tracker project. A team that wants a durable in-repo spec chooses `local` mode; on a real tracker the spec issue is the record of decision.

## Revisit when
- A project wants *both* a tracker spec and a committed in-repo mirror as first-class, kept-in-sync artifacts — that would need a real sync mechanism (checksummed, like the sync engine), not the manual copy this ADR removes.
- A supported tracker gains or loses a native parent/child relation, changing how tickets link back to their spec.
