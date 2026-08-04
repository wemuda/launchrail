---
name: resolving-merge-conflicts
description: Resolve merge conflicts without losing either side's behavior — the named protocol for parallel implementers landing against a moving base. Use when a merge or rebase reports conflicts, especially inside a Ralph campaign.
---

# Resolving merge conflicts

When parallel work lands against the same base, conflicts are ordinary work with a procedure — not failure. The one unforgivable resolution is the silent one that discards somebody's behavior.

1. **Sync deliberately.** Fetch and merge the latest base into your branch (rebase only if it is the project's stated convention). Read the conflict list before touching anything.
2. **Understand both sides.** For each conflicted file, find out what the other side's change was *for* — read its commit message, PR, or ticket if needed. You are merging intents, not text blocks.
3. **Preserve both behaviors.** The resolved code must do what your change does *and* what theirs does. Taking "ours" or "theirs" wholesale is only correct when the two changes are genuinely the same fix.
4. **Regenerate, don't hand-merge, generated files.** Lockfiles and other generated artifacts are re-created by their tool after resolving the source of truth — never merged line by line.
5. **Prove it.** After resolving, run the verification gate (`npx @wemuda/launchrail verify`). A resolution that was never run is not a resolution.
6. **Escalate ambiguity.** If both sides changed the same logic and any resolution you can see loses behavior, stop and report the conflict (which files, which intents collide) instead of guessing. In a Ralph campaign that is the `conflict` outcome — a legitimate result, unlike a quiet wrong merge.
