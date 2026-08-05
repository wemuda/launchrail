# Brand due diligence — "Launchrail"

> Findings recorded 2026-08-04. Availability changes over time; re-verify before publishing to npm or announcing publicly.

## Method

Checked from a live environment on 2026-08-04:

- **npm** — registry lookups for `launchrail` and `@wemuda/launchrail`, plus a scope search for `@wemuda`.
- **GitHub** — public page for the `launchrail` user/org namespace.
- **Domains** — RDAP registration data plus DNS-over-HTTPS resolution for `launchrail.{com,dev,io,ai}`.
- **Trademark and market** — web searches for software products and trademark filings using "LaunchRail" / "Launch Rail". Best-effort only; not a substitute for professional clearance in the jurisdictions Wemuda operates in.

## Findings

| Asset | Status | Detail |
| --- | --- | --- |
| npm `@wemuda/launchrail` | ✅ Available | Unpublished; `@wemuda` scope has no packages yet. Publishing requires the `wemuda` npm org/user to be registered (could not be verified anonymously from this environment). |
| npm `launchrail` (unscoped) | ✅ Unclaimed | 404 on the registry. We deliberately publish scoped ([ADR-0001](adr/0001-provisional-implementation-stack.md)), so this is a defensive observation, not a plan. |
| GitHub `wemuda/launchrail` | ✅ Ours | This repository. |
| GitHub `launchrail` org | ❌ Taken | Active organization: an AWS EKS + Argo CD GitOps platform toolchain — 5 public repos including `launchrail-cli`, Apache-2.0, last active January–February 2026. Same broad category (developer/deployment tooling). |
| `launchrail.com` | ❌ Registered | Held since 2018-09, expires 2027-09, transfer-locked, currently no DNS (parked/inactive). Owner not identifiable from redacted RDAP. |
| `launchrail.dev` | ✅ Appears available | RDAP not found + NXDOMAIN. |
| `launchrail.io` | ✅ Appears available | RDAP not found + NXDOMAIN. |
| `launchrail.ai` | ⚠️ Likely available | NXDOMAIN; `.ai` RDAP coverage is patchy, so registration status is not conclusive. |
| Trademark | ⚠️ Best-effort clear | No registered "LaunchRail" software trademark surfaced in web/Trademarkia searches. No USPTO/EUIPO database query was performed; professional clearance is still required before public launch. |

## Adjacent users of the name

- **`launchrail` GitHub org** — installable AWS platform (EKS, Argo CD, GitOps guardrails) with its own `launchrail-cli`. The closest collision: same audience (developers), same artifact type (CLI + platform tooling).
- **Launch Rail** (`launch-rail.com`) — an active "Enterprise SaaS Backend Ecosystem for Go" (identity, auth, billing, audit logs). Developer-tooling adjacent.
- **Launchrail (bxrne)** — a Go high-power rocketry simulator (student final-year project).
- **Generic rocketry term** — a "launch rail" is standard model-rocketry launch hardware (e.g. Estes launch rail systems), which both dilutes distinctiveness and lowers the odds of any one party owning the term broadly.

## Assessment

The handles Launchrail actually ships under today are secure: the GitHub repo is ours and the scoped npm name has no conflict. The bare name, however, is crowded — two active software products (one of them a deployment-tooling CLI) and a simulator already use it, and `launchrail.com` is held by an unknown party.

- **Low risk:** continuing under `@wemuda/launchrail` + `wemuda/launchrail`. The scope/owner prefix disambiguates, exactly as ADR-0001 anticipated.
- **Medium risk:** marketing the product as bare "Launchrail" — expect discoverability collisions with the GitOps org and the Go SaaS product, and no path to the `launchrail` GitHub org or `.com`.
- **Open item:** formal trademark clearance (and registration, if the name is kept) before any public announcement.

## Recommended actions before public launch

1. Register the `wemuda` npm org (if not already held) and publish `@wemuda/launchrail` early to anchor the scoped name.
2. Register `launchrail.dev` (and optionally `launchrail.io`) while available, even if docs live on a Wemuda domain.
3. Commission a real trademark search (US + EU at minimum) — or consciously accept the "descriptive name, scoped distribution" posture and skip registration.
4. If bare-name confusion with the GitOps `launchrail` org becomes real, revisit naming before v1.0 — renames get strictly more expensive after npm publication.
