---
name: launch-research
description: Investigate a question against high-trust primary sources and commit the findings as a Markdown file. Owns stage 5 (technical research, fed the grill's surviving constraints) and provides research depth wherever the rail needs facts gathered — docs, API surfaces, maintenance health, licenses — by a background agent while the session keeps working.
---

<!-- Contains text derived from Matt Pocock's skills (https://github.com/mattpocock/skills), MIT — see ../NOTICE.md -->

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Commit it where the repo keeps such notes. On the rail that is `docs/research/` — stage-5 notes sit beside the grill constraints and the `discovery-*.md` landscape maps, and everything there is project-owned. Match a different convention only if the repo clearly has one, and say where the file landed.

When this runs as **stage 5**, its brief is the grill's surviving constraints: de-risk the decisions the grill made — verify the chosen option really does what the decision assumes — don't reopen them. When `launch-discovery` drives it, the brief is one divergent thread: real capabilities, maintenance and community health, license, and concrete integration cost on this stack.
