# Examples

## hello-launchrail

A minimal Node app (dependency-free HTTP server + `node --test` tests) showing exactly what `launchrail init` writes into a project. Everything in the directory beyond `package.json`, `server.js`, and `server.test.js` was produced by the CLI, unedited:

| File | Ownership | Meaning |
| --- | --- | --- |
| `.launchrail.yml` | seeded | Project manifest — mode, tracker, conventions, test commands, modules. Yours to edit. |
| `.launchrail-lock.json` | machine-managed | Versions, per-file ownership classes and checksums, applied migrations. Committed, never hand-edited. |
| `AGENTS.md` | seeded | Agent operating contract with the chosen conventions baked in; fill in the TODOs. |
| `CLAUDE.md` | seeded | Claude Code entry point importing `@AGENTS.md` and the generated instructions. |
| `.launchrail/CLAUDE.generated.md` | managed | Workflow instructions Launchrail may replace on `sync`. |
| `docs/adr/0000-template.md` | seeded | ADR template. |
| `.claude/settings.json` | merged | Declares the Launchrail plugin marketplace and enables the plugin ([ADR-0003](../docs/adr/0003-plugin-subscription-via-project-settings.md)). |

### Regenerating

The example is real output, not a mock-up. To regenerate it after changing `init` or the seeds:

```bash
pnpm build
cd examples/hello-launchrail
rm -rf .launchrail .launchrail.yml .launchrail-lock.json .claude AGENTS.md CLAUDE.md docs
node ../../packages/cli/dist/index.js init --yes
node ../../packages/cli/dist/index.js doctor
```

(`init` detects git from the monorepo working tree; `doctor` should report healthy with warnings only for package manager and Matt Pocock setup.)
