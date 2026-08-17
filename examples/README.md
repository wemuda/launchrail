# Examples

## hello-launchrail

A minimal Node app (dependency-free HTTP server + `node --test` tests) showing exactly what `launchrail init` writes into a project. Everything in the directory beyond `package.json`, `server.js`, and `server.test.js` was produced by the CLI, unedited:

| File | Ownership | Meaning |
| --- | --- | --- |
| `.launchrail.yml` | seeded | Project manifest — origin, tracker, conventions, test commands, modules. Yours to edit. |
| `.launchrail-lock.json` | machine-managed | Versions, per-file ownership classes and checksums, applied migrations. Committed, never hand-edited. |
| `AGENTS.md` | seeded | Agent operating contract with the chosen conventions baked in; fill in the TODOs. |
| `CLAUDE.md` | seeded | Claude Code entry point importing `@AGENTS.md` and the generated instructions. |
| `.launchrail/CLAUDE.generated.md` | managed | Workflow instructions Launchrail may replace on `sync`. |
| `docs/adr/0000-template.md` | seeded | ADR template. |
| `docs/agents/` | seeded | Issue-tracker conventions (templated from the manifest's `issueTracker`) and domain-doc rules ([ADR-0020](../docs/adr/0020-independent-skill-set.md)). |
| `.claude/skills/` | managed | The complete `launch-*` workflow skill set plus its attribution `NOTICE.md` ([ADR-0019](../docs/adr/0019-vendor-skills-retire-plugin.md), [ADR-0020](../docs/adr/0020-independent-skill-set.md)). |
| `.claude/workflows/ralph.js` | managed | The Ralph loop's workflow form, installed by `init` ([ADR-0018](../docs/adr/0018-implement-front-door.md)). |
| `.claude/hooks/ralph-permission-guard.py` | managed | Warns when the Ralph loop is launched in an interactive permission mode, so an unattended run can't stall on a prompt ([ADR-0021](../docs/adr/0021-ralph-unattended-permission-guard.md)). |
| `.claude/settings.json` | merged | Registers the Ralph guard hook on the Workflow tool ([ADR-0021](../docs/adr/0021-ralph-unattended-permission-guard.md)). Additively merged — your other settings are preserved. |

### Regenerating

The example is real output, not a mock-up. To regenerate it after changing `init` or the seeds:

```bash
pnpm build
cd examples/hello-launchrail
rm -rf .launchrail .launchrail.yml .launchrail-lock.json .claude AGENTS.md CLAUDE.md docs
node ../../packages/cli/dist/index.js init --yes
node ../../packages/cli/dist/index.js doctor
```

(`init` detects git from the monorepo working tree; `doctor` should report healthy with a package-manager warning only.)
