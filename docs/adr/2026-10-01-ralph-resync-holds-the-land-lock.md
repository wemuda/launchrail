# Ralph re-syncs under the land lock; the predicted migration flag is retired

## Status
Accepted; amends [ADR-0032](0032-ralph-lean-local-gate-loop.md): a land hand-back keeps the land lock through its re-sync and re-land, and the graph reader's `migration` flag, along with the one-migration-ticket-in-flight rule built on it, is removed.

## Context
ADR-0032 had two defenses against parallel tickets colliding on the base:

- **Prevention:** the graph reader, a small model at low effort, flagged each ticket that "plainly adds or changes a database schema or migration" (false when unsure). The pool kept one flagged ticket in flight at a time.
- **Healing:** when the base moved under a finished branch and the land conflicted, a fresh implementer re-synced the pushed branch without spending an attempt, up to `resyncs` (2) times. The lock was released when the land handed back.

A nineteen-ticket campaign on fixback (Drizzle migrations, width 3) showed that neither defense held:

- **The flag never fired.** The reader flagged none of the 19 tickets, yet at least five carried a migration: #639, #644, #648 and #641 landed 0093–0097, and #646 added its own. Prediction from ticket text is guesswork. Even a perfect flag would have serialized 40–50-minute builds to protect a number that is only contended during a land, which takes seconds.
- **A re-sync could lose the race it was dispatched to settle.** Ticket #646 (a 53-minute, ~730k-token build) branched when the base held migration 0093 and generated 0094. Three times it lost its number to a ticket that reached the lock first:
  - #644 landed 0094 at 17:56.
  - Re-sync 1 renumbered to 0095 at 18:46. Two minutes later #648 landed 0095, ahead of #646's re-land.
  - Re-sync 2 renumbered to 0096 at 19:04. Three minutes later #641 landed 0096 and 0097.

  Each re-sync cost 6–7 minutes and ~110–130k tokens. The third hand-back exhausted the re-syncs and spent the ticket's real attempt. One more loss would have parked it.
- **It was not only the migration number.** Replaying each of the three merges with `git merge-tree` shows conflicts outside the migrations directory every time: the admin test harness, the ingest controller and the operator module registration in the first two, and the shared package's barrel `index.ts` in the third, plus the design fidelity record in all three. These are files every ticket in an area appends to. The migration journal is the most frequent of them, but not the only one. A fix that only renumbered migrations would have saved none of #646's hand-backs.

The root cause is structural. The lock serialized each land but not the handed-back branch's way back to the base. Anything that lands during a re-sync can invalidate it again.

## Decision
- **A land hand-back keeps the land lock.** When a land returns an integration failure that gets a re-sync (a conflict, a merged tree failing the gate after the base moved, or a stale remote), the ticket keeps the lock. It holds it through the re-sync build and the re-land. No other branch lands in between, so the base the re-sync merges is the base it lands on. In the normal case a hand-back costs exactly one re-sync. In the workflow this is an explicit acquire/release promise-chain lock. `drive()` keeps the release from the hand-back to the re-land and frees it on every exit path. In skill mode the orchestrator lands nothing else until the re-synced ticket's re-land.
- **The predicted `migration` flag is retired.** The graph reader no longer classifies tickets and the pool no longer serializes them. Schema tickets build at full width, and their number collision is settled at the land like any other integration conflict.
- **The re-sync dispatch says the base is held still**, so the implementer resolves once and completely instead of chasing a moving base. `launch-resolving-merge-conflicts` names sequenced migrations as a regenerate-don't-merge case: take the base's migrations, drop yours, regenerate after the schema source is resolved.
- **Unchanged:** `resyncs` (2) stays as the backstop for a re-sync that fails to resolve, or a remote moved from outside the loop. Re-syncs spend no attempt. Builders never land, and the lander never writes code. A gate that fails on an up-to-date branch is still the builder's failure.

## Alternatives considered
- **Repair the flag** with a stronger model, a bias towards true, and reading ticket bodies. Rejected: it is still a prediction, and accuracy is not the issue. Serializing builds for a contention that only exists during a land would have serialized most of this campaign.
- **Renumber migrations inside the lander.** Under the lock, regenerate the branch's migration with the project's generator against the merged schema, prove it equivalent to the original, and land it without a re-sync. Rejected for now: every one of #646's hand-backs also conflicted in source files, which a lander must not resolve, so it would have saved none of them. It also adds tool detection, a non-interactive generator run and an equivalence check to the lander.
- **Timestamped migration names** (Drizzle's `migrations.prefix`). Rejected as the loop's fix: it removes file-name clashes, but the journal and the snapshot chain still fork. Choosing it is the project's decision, not the loop's.
- **Raise `resyncs`.** Rejected: it adds more tries at the same race, at ~120k tokens each.
- **Pause dispatch rather than lands during a re-sync.** Rejected: builds are not what collides, and pausing them costs throughput without protecting the land.

## Consequences
- Easier: a hand-back converges after one re-sync instead of re-racing every land that happens meanwhile. A schema-heavy campaign builds at full width with no per-ticket guess. Failures like #646's no longer turn into spent attempts and parked tickets. The graph reader's prompt is smaller.
- Harder: lands pause while a re-sync runs, usually for minutes. Builders keep building, but finished branches queue behind the re-sync and keep their pool slots. A pathologically slow re-sync holds every land for its duration. A supervisor sees gaps in `land:` lines that are the lock working, not a stall; the launch-ralph skill names this as a healthy shape.
- Covered by the workflow tests, run against mock agents. A branch that finishes during another ticket's re-sync lands only after that ticket's re-land, and the re-sync lands first time. The same scenario fails against the previous workflow, where the re-sync conflicts again. A re-sync that ends without a branch releases the lock and the rest of the pool still lands. Schema tickets build at full width with no migration flag in the graph prompt.

## Revisit when
- Re-syncs routinely run long enough that the land pause costs more than a lost race. That would argue for holding only the conflicting files' area, or for bounding the hold.
- Field data shows many hand-backs whose only conflict is migration metadata. Then lander-side renumbering earns its complexity as a no-re-sync fast path.
- Shared append-hotspot files (barrels, module registries, fidelity records) cause most hand-backs. That is a readiness concern (`launch-loop-readiness`) more than a loop one.
