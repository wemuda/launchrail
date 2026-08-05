# ADR-0007: MIT license, with generated output unencumbered

## Status
Accepted

## Context
Open-source readiness (roadmap phase 6) requires a license before anything is published to npm or announced. Launchrail has one property most CLIs don't: its core job is writing files *into other people's repositories* (managed and seeded content, templates, workflow scripts). Whatever license the toolchain carries must not leak obligations into consuming projects — a team running `launchrail init` must own the result outright, with no attribution or notice requirements riding along.

## Decision
1. The entire repository — CLI, plugin, templates, docs — is licensed **MIT**, copyright Wemuda.
2. Content Launchrail writes into a consuming repository (seeded files, managed files, rendered templates) is treated as that project's own work: Wemuda asserts no license obligation over generated output. This mirrors the established posture of scaffolding tools (e.g. create-react-app, Vite templates), where the tool is licensed but its output is the user's.
3. `license` fields: `MIT` in every published `package.json`; the LICENSE file lives at the repo root and ships in the npm package.

## Alternatives considered
- **Apache-2.0** — explicit patent grant and trademark clause (attractive given the crowded name, see [brand due diligence](../brand-due-diligence.md)); rejected as heavier than needed for a small toolchain, and the NOTICE mechanics are exactly the kind of obligation we must not seed into consuming repos.
- **MIT-0 / CC0 for templates only** — a split license per directory removes doubt about generated output but adds per-file bookkeeping; the explicit statement in this ADR and the README achieves the same effect without a second license text.
- **Staying UNLICENSED until launch** — blocks publishing, contradicts the open-source intent already stated in the README, and phase 6 exists precisely to close this.

## Consequences
- Easier: npm publication, external contribution, composing with the MIT/Apache upstream tools Launchrail already orchestrates.
- Constrained: MIT carries no patent grant and no trademark protection — brand protection, if wanted, must come from trademark registration (tracked in brand due diligence), not the license.
- Consuming projects need no attribution for anything Launchrail writes into them.

## Revisit when
- Wemuda's legal review (pre-launch trademark clearance) recommends Apache-2.0's explicit patent/trademark terms.
- A contributor-scale project would benefit from a CLA or DCO process that interacts with the license choice.
