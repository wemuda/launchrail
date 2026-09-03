# Changelog

## [1.15.0](https://github.com/wemuda/launchrail/compare/v1.14.0...v1.15.0) (2026-09-03)


### Features

* **cli:** loop readiness — doctor readiness lines and the launch-loop-readiness skill (ADR-0033) ([7df4f25](https://github.com/wemuda/launchrail/commit/7df4f2575d90c3fb68d2708c8ef5c25baec2a382))

## [1.14.0](https://github.com/wemuda/launchrail/compare/v1.13.0...v1.14.0) (2026-09-03)


### Features

* **cli:** lean Ralph loop — local landing under a fast gate, pushed branches, checkpoints (ADR-0032) ([bd3c7ce](https://github.com/wemuda/launchrail/commit/bd3c7cee358251ec13f187976d7f9d2b95e7aaff))
* **cli:** one-click structured checkpoints in launch-tickets and launch-spec ([284b822](https://github.com/wemuda/launchrail/commit/284b822980d13b106e7b683e29967854c61a0862))
* **cli:** ride the merge gate's CI wait on cheap read-only watchers (ADR-0030) ([547dbf9](https://github.com/wemuda/launchrail/commit/547dbf9742110f79965ed0a6903280b952000988))
* **cli:** seed the ADR registry and scope the ADR reading contract (ADR-0031) ([9ba6b48](https://github.com/wemuda/launchrail/commit/9ba6b48bb6e69e169f1501132c603c1f908579c7))
* **cli:** sharpen the launch-* skills against current upstream (ADR-0020) ([484de1d](https://github.com/wemuda/launchrail/commit/484de1d8437be7f37b4df2dba761aac594fd7236))


### Bug Fixes

* **cli:** quote launch-project-alignment's description — a bare colon broke its YAML frontmatter ([beb6cb1](https://github.com/wemuda/launchrail/commit/beb6cb187091aa43783480fd002fdd5f95c89383))

## [1.13.0](https://github.com/wemuda/launchrail/compare/v1.12.0...v1.13.0) (2026-08-20)


### Features

* **cli:** adopt the planning interaction contract and phase-legible rail (ADR-0029) ([bd0a2de](https://github.com/wemuda/launchrail/commit/bd0a2de207a8d0878f6d50ec3791d4484e1d4c28))

## [1.12.0](https://github.com/wemuda/launchrail/compare/v1.11.0...v1.12.0) (2026-08-20)


### Features

* **cli:** bundle the spec under a tracker milestone ([9d8b891](https://github.com/wemuda/launchrail/commit/9d8b891fee6840219b0915e0b531dbfeb51c9fc7))

## [1.11.0](https://github.com/wemuda/launchrail/compare/v1.10.1...v1.11.0) (2026-08-19)


### Features

* **cli:** target the hosted session's designated branch in Ralph runs ([182e5bd](https://github.com/wemuda/launchrail/commit/182e5bd713fa8950840fc110bcb1fb5633a180dc))

## [1.10.1](https://github.com/wemuda/launchrail/compare/v1.10.0...v1.10.1) (2026-08-19)


### Bug Fixes

* **ralph:** re-poll a still-running CI in place instead of rebuilding ([c890054](https://github.com/wemuda/launchrail/commit/c890054deda593205c78d015c19c1e47e7dc3ffd))

## [1.10.0](https://github.com/wemuda/launchrail/compare/v1.9.0...v1.10.0) (2026-08-19)


### Features

* **cli:** add launch-design-handoff — the design-to-code on-ramp (ADR-0024) ([1779e84](https://github.com/wemuda/launchrail/commit/1779e8421da0cad89474fb021ac3c97623a9737e))
* **cli:** shrink the init interview — retire project modes, detect the test command ([8fa9886](https://github.com/wemuda/launchrail/commit/8fa988684bdc3b331b799068bd5c1cf3a0efcdd7))
* **cli:** spec home follows the configured tracker ([31cfd40](https://github.com/wemuda/launchrail/commit/31cfd409e890fe35f9d130e773c529ef43e1efbb))
* **cli:** spec home follows the configured tracker ([32cb894](https://github.com/wemuda/launchrail/commit/32cb894b1701998456a9ed8ba1cbb2e04fa32496))
* **cli:** use native GitHub issue relationships for tickets and PR linkage ([6e0b832](https://github.com/wemuda/launchrail/commit/6e0b832705693f2ff36464fdfcf7b404aee2ce2e))
* **ralph:** default multi-ticket runs to consolidation, not trunk ([6f8f667](https://github.com/wemuda/launchrail/commit/6f8f6679ad2155e133f585ee713923b7d51c5302))
* **ralph:** default multi-ticket runs to consolidation, not trunk ([041dfb9](https://github.com/wemuda/launchrail/commit/041dfb9f0ef5136259046f78c48ab667b62fbddd))


### Bug Fixes

* **ralph:** give the supervisor an output budget to curb verbose narration ([2e627de](https://github.com/wemuda/launchrail/commit/2e627de0084259e1df3a4dfbeab8aebb8f3a9b7d))

## [1.9.0](https://github.com/wemuda/launchrail/compare/v1.8.0...v1.9.0) (2026-08-17)


### Features

* **cli:** unify Ralph on the workflow engine with a declared integration target ([d49928a](https://github.com/wemuda/launchrail/commit/d49928a1d05b8a5aecf02d088e554df21b7823cc))

## [1.8.0](https://github.com/wemuda/launchrail/compare/v1.7.0...v1.8.0) (2026-08-13)


### Features

* **cli:** absorb the workflow skills as one independent launch-* set (ADR-0020) ([0f03eee](https://github.com/wemuda/launchrail/commit/0f03eee7a711e77b526fb235e112ef0b80419fc6))
* **cli:** install the default implementation loop with init ([00e46e3](https://github.com/wemuda/launchrail/commit/00e46e3f7b71caae6e581394e03d463e8ddfaaf7))
* **cli:** ship Ralph's unattended-launch permission guard (ADR-0020) ([640c983](https://github.com/wemuda/launchrail/commit/640c983310785a642dffab59bd688d0b8e533e24))
* **cli:** slim the skill set to 16 — seed docs/agents from the manifest, fold domain modeling into the grill (ADR-0020) ([6a8b417](https://github.com/wemuda/launchrail/commit/6a8b4170240c0791cd8a3c5b4618a25c54f87038))
* **cli:** vendor pinned Matt Pocock skills snapshot under CLI assets ([f51e4c3](https://github.com/wemuda/launchrail/commit/f51e4c3c6635827442e5b1f6afe1baa61667f4ce))
* **cli:** vendor workflow skills as managed files, retire marketplace plugin (ADR-0019) ([d4984f5](https://github.com/wemuda/launchrail/commit/d4984f59f18e9d78c7bf16567ec31c5da37a0deb))
* **cli:** write vendored skills on init/sync; retire the plugin path (ADR-0019) ([8b960ed](https://github.com/wemuda/launchrail/commit/8b960edf37001ed83b66969d9f0163f3a108ad10))
* one front door for building — /launchrail:implement, start-feature folded into launch, loop installed by init ([133388b](https://github.com/wemuda/launchrail/commit/133388ba5fcc0b32e203ea40d817efe4b8859fd7))
* **plugin:** one implement front door; fold start-feature into launch ([2143d7e](https://github.com/wemuda/launchrail/commit/2143d7e817521a04d449201676dc7a999d0e544b))
* **ralph:** bounded runs — a max-merges cap and a scope-resolution contract ([29d9eec](https://github.com/wemuda/launchrail/commit/29d9eec983ab3d69c1fe74a8a5c2e56a1c5663aa))
* **ralph:** bounded runs — max-merges cap + prose scope resolution in implement ([819119d](https://github.com/wemuda/launchrail/commit/819119d0ae0bb787610121daef0e1007f0ed7bd9))


### Bug Fixes

* **adr:** complete ADR-0016→0017 renumber in merged files ([083e76d](https://github.com/wemuda/launchrail/commit/083e76d4e5196a253ac4b4fe2774be9a5a7120ca))

## [1.7.0](https://github.com/wemuda/launchrail/compare/v1.6.0...v1.7.0) (2026-08-11)


### Features

* **plugin:** add divergent discovery research stage before the grill ([7270e25](https://github.com/wemuda/launchrail/commit/7270e25ef58ed0a3c8705a22593802b0491ad3d7))
* **plugin:** scale design validation through a four-level fidelity ladder ([678fb06](https://github.com/wemuda/launchrail/commit/678fb06a6da503d131437e6ea0780c07cdfa05e3))


### Bug Fixes

* **plugin:** correct stale ADR stage ref and defer harness in spec handoff ([a160d3f](https://github.com/wemuda/launchrail/commit/a160d3fa49e20f855f330bd10b9c3b13871c862d))
* **plugin:** hand off user-typed spec gate instead of calling it ([47bedec](https://github.com/wemuda/launchrail/commit/47bedec6ea24a65d6bb2c2f720ed8642b82f1710))
* **plugin:** route by spec surface at stage 7 and guard ready-for-agent ([c5d897c](https://github.com/wemuda/launchrail/commit/c5d897c1898573926fa6e2a2978cbba523a54918))

## [1.6.0](https://github.com/wemuda/launchrail/compare/v1.5.0...v1.6.0) (2026-08-10)


### Features

* **plugin:** add the start-feature conductor for the delivery loop ([0436f96](https://github.com/wemuda/launchrail/commit/0436f968bf90d62ef8557adb7213d06c95f838dd))


### Bug Fixes

* **plugin:** route stage 3 to grill-with-docs, not the bare grilling primitive ([5e7478b](https://github.com/wemuda/launchrail/commit/5e7478b3c8b21bd70520c26a3725e973ba76a1ef))
* **plugin:** route stage 3 to grill-with-docs, not the bare grilling primitive ([ab60b1b](https://github.com/wemuda/launchrail/commit/ab60b1b26808dc3fd72243f8d125006a5d4fe510))

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
