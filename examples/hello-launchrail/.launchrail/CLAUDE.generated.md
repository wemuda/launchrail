<!-- Managed by Launchrail v1.2.0. Do not edit: `launchrail sync` may replace this file. Project-specific instructions belong in CLAUDE.md. -->

# Launchrail workflow instructions

- This project follows the Launchrail development loop: vision → design exploration → grill/research → ADRs → spec → visual validation → tickets → bounded implementation → verification → release.
- Product knowledge (vision, specs, ADRs, designs, tickets, code) is project-owned; Launchrail never overwrites it.
- `.launchrail.yml` is project configuration; `.launchrail-lock.json` is machine-managed — do not hand-edit it.
- Before claiming completion, run the project's deterministic checks. Completion requires evidence, not assertion.
- Run `npx @wemuda/launchrail doctor` when repository state seems inconsistent.
