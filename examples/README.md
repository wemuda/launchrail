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
| `.claude/workflows/ralph.js` | managed | The Ralph implementation loop as a deterministic workflow ([ADR-0005](../docs/adr/0005-ralph-two-frontends-one-policy.md)). |
| `.claude/hooks/ralph-permission-guard.py` | managed | Warns when the Ralph loop is launched in an interactive permission mode, so an unattended run can't stall on a prompt ([ADR-0020](../docs/adr/0020-ralph-unattended-permission-guard.md)). |
| `.claude/settings.json` | merged | Registers the Ralph guard hook on the Workflow tool ([ADR-0020](../docs/adr/0020-ralph-unattended-permission-guard.md)). Additively merged — your other settings are preserved. |

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
