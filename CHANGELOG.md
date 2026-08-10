# Changelog

## [1.5.0](https://github.com/wemuda/launchrail/compare/v1.4.0...v1.5.0) (2026-08-10)


### Features

* adopt existing projects via an origin flag and the project-alignment on-ramp ([983401f](https://github.com/wemuda/launchrail/commit/983401fdb95ac914ad718bfabc49fa63f26a1eab))
* **cli:** init updates already-installed plugins instead of leaving them stale ([4c545fd](https://github.com/wemuda/launchrail/commit/4c545fd56d2332f0e394294782b445a749182c92))
* **cli:** make init aware of adopting an existing project ([9673882](https://github.com/wemuda/launchrail/commit/96738823ed56b2513310826379026218aabd60bf))
* launch orientation, seeded operating principles, optional browser MCP ([e2e97c7](https://github.com/wemuda/launchrail/commit/e2e97c75571f2ca9c9ea344ded47de8a1e321055))
* launch orientation, seeded operating principles, optional browser MCP ([b7af7eb](https://github.com/wemuda/launchrail/commit/b7af7eb7367cdb5aee93e39c1c8e9fcb94341ce9))


### Bug Fixes

* **cli:** ship the README with the npm package ([435b404](https://github.com/wemuda/launchrail/commit/435b40409bf4bd49e47c8c628587b48ef0c810c6))
* **plugin:** a missing docs/agents/ never blocks the vision or forces a sequencing question ([8ff7abf](https://github.com/wemuda/launchrail/commit/8ff7abf67405f3d703f6ca7946bd2e15fa202914))

## [1.4.0](https://github.com/wemuda/launchrail/compare/v1.3.0...v1.4.0) (2026-08-05)


### Features

* **cli:** make the whole onboarding journey hands-off (roster declaration, git init, doctor next-step) ([5c6c446](https://github.com/wemuda/launchrail/commit/5c6c44605fbf3c8546b4f327b0e605abed400bcd))


### Bug Fixes

* **plugin:** launch hands /setup-matt-pocock-skills to the user instead of reverse-engineering it ([b9b3526](https://github.com/wemuda/launchrail/commit/b9b3526ad88dcf7e4e8fcd97e4c55861ff77671b))

## [1.3.0](https://github.com/wemuda/launchrail/compare/v1.2.0...v1.3.0) (2026-08-05)


### Features

* **cli:** preinstall the whole workflow plugin roster from init ([cccc597](https://github.com/wemuda/launchrail/commit/cccc5976ae603d219de88036a67fbff129eb3870))

## [1.2.0](https://github.com/wemuda/launchrail/compare/v1.1.0...v1.2.0) (2026-08-05)


### Features

* **cli:** install the Claude plugin from init via the claude CLI (ADR-0011) ([f378410](https://github.com/wemuda/launchrail/commit/f378410ef0b2465588507af09b3a4191119e55cd))

## [1.1.0](https://github.com/wemuda/launchrail/compare/v1.0.0...v1.1.0) (2026-08-05)


### Features

* **cli:** end init with a hand-off into the Claude Code workflow ([ef6fecb](https://github.com/wemuda/launchrail/commit/ef6fecbfd1b08de28a3f3d6b30ceeb9bec6c59e9))

## 1.0.0 (2026-08-05)


### Features

* **cli:** add browser-testing module with verify, smoke, and browser-smoke skill ([5af256a](https://github.com/wemuda/launchrail/commit/5af256aed9d16559b0886677dd7034af8334cd51))
* **cli:** add sync engine — status, diff, sync, migrations, eject (ADR-0005) ([8d429e4](https://github.com/wemuda/launchrail/commit/8d429e4956fe716dbf95743c8fd2bd325f668b81))
* **cli:** implement init and doctor with safe writer, manifest, and lockfile ([27ce321](https://github.com/wemuda/launchrail/commit/27ce3219121bb980a6fa4fe8222a1c38f9f242db))
* complete phase 2 — core workflow plugin ([2835c22](https://github.com/wemuda/launchrail/commit/2835c22a978e1ea9b386757e1bcd4e9c552f973c))
* phase 4 — Ralph release orchestration, two frontends over one policy (ADR-0005) ([570623f](https://github.com/wemuda/launchrail/commit/570623fa959b897bfb7340c3ec7d8f441f38b60f))
* **plugin:** add launch orchestrator skill for the workflow loop ([2a91d11](https://github.com/wemuda/launchrail/commit/2a91d118b8f9306d22f356e628376e3442e15beb))
* **ralph:** fold field-run lessons into both campaign frontends (ADR-0010) ([d92b99d](https://github.com/wemuda/launchrail/commit/d92b99dff36d1187ebb3e7c6a502f777cd0d99ec))
* scaffold toolchain monorepo with CLI stub and Claude plugin skeleton ([6db0656](https://github.com/wemuda/launchrail/commit/6db06569e11c3da8455429ee8a31300c011f7c53))
