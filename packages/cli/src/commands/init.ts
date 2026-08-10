import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { detectClaudeCli, installPlugin, WORKFLOW_PLUGINS, type WorkflowPlugin } from "../lib/claudeCli.js";
import {
  applyClaudeImports,
  planClaudeImports,
  type ClaudeImportsPlan,
} from "../lib/claudeImports.js";
import {
  applyPluginDeclaration,
  CLAUDE_SETTINGS_PATH,
  planPluginDeclaration,
  type SettingsPlan,
} from "../lib/claudeSettings.js";
import { detectRepo, type RepoDetection } from "../lib/detect.js";
import { emptyLockfile, readLockfile, writeLockfile } from "../lib/lockfile.js";
import { migrationIds } from "../lib/migrations.js";
import {
  ISSUE_TRACKERS,
  MANIFEST_FILENAME,
  parseManifest,
  serializeManifest,
  type IssueTracker,
  type Manifest,
  type Mode,
  type Origin,
} from "../lib/manifest.js";
import { seedFiles } from "../lib/seeds.js";
import { ACTION_LABEL, applyPlan, planWrites, type FileSpec, type PlannedAction } from "../lib/writer.js";
import { VERSION } from "../version.js";

export interface InitOptions {
  cwd: string;
  dryRun: boolean;
  yes: boolean;
  /** Write the declaration but skip the `claude` CLI plugin install. */
  skipPluginInstall?: boolean;
}

/** How the Claude Code plugin install ended up. */
export type PluginHandoff = "installed" | "already-installed" | "failed" | "no-cli" | "skipped" | "dry-run";

export interface InitOutcome {
  code: number;
  actions: PlannedAction[];
  settings: SettingsPlan;
  /** How init wired the two workflow @-imports into CLAUDE.md (relevant when the repo already had one). */
  claudeImports: ClaudeImportsPlan;
  plugin: PluginHandoff;
}

function suggestedTestCommand(detection: RepoDetection): string | null {
  if (!detection.testScript) return null;
  return `${detection.packageManager ?? "npm"} test`;
}

function defaultTesting(detection: RepoDetection): Manifest["testing"] {
  return {
    unitCommand: suggestedTestCommand(detection),
    devCommand: detection.devScript ? `${detection.packageManager ?? "npm"} run dev` : null,
    e2eCommand: null,
    smokeCommand: null,
    appUrl: null,
  };
}

function defaultManifestFor(detection: RepoDetection): Manifest {
  return {
    schemaVersion: 1,
    mode: "standard-mvp",
    origin: detection.looksEstablished ? "existing" : "new",
    issueTracker: detection.gitRemoteUrl?.includes("github.com") ? "github" : "none",
    conventions: {
      conventionalCommits:
        detection.conventionalCommitRatio === null ? true : detection.conventionalCommitRatio >= 0.5,
    },
    testing: defaultTesting(detection),
    modules: { core: true },
  };
}

async function interview(detection: RepoDetection): Promise<Manifest> {
  const defaults = defaultManifestFor(detection);
  p.intro("launchrail init");
  if (!detection.isGitRepo) {
    p.log.warn("This is not a git repository. Launchrail relies on git history for safe writes.");
  }

  const answers = await p.group(
    {
      origin: () =>
        p.select({
          message: "New project, or an existing one you're adopting?",
          initialValue: defaults.origin as string,
          options: [
            { value: "new", label: "New project", hint: "start the full vision → spec → build loop" },
            {
              value: "existing",
              label: "Existing project",
              hint: "adopt code you already have; launch aligns it to Launchrail's artifacts",
            },
          ],
        }),
      mode: () =>
        p.select({
          message: "Project mode",
          initialValue: defaults.mode as string,
          options: [
            { value: "standard-mvp", label: "Standard MVP", hint: "default product workflow" },
            { value: "spike", label: "Spike", hint: "short experiment; disposable or highly uncertain" },
            { value: "high-rigor", label: "High-rigor", hint: "security-sensitive, regulated, or multi-team" },
          ],
        }),
      issueTracker: () =>
        p.select({
          message: "Issue tracker",
          initialValue: defaults.issueTracker as string,
          options: ISSUE_TRACKERS.map((t) => ({ value: t, label: t })),
        }),
      conventionalCommits: () =>
        p.confirm({
          message: "Use Conventional Commits? (recorded in the seeded AGENTS.md so agents follow it)",
          initialValue: defaults.conventions.conventionalCommits,
        }),
      unitCommand: () =>
        p.text({
          message: "Deterministic test command (empty to decide later)",
          initialValue: defaults.testing.unitCommand ?? "",
          placeholder: "e.g. pnpm test",
        }),
    },
    {
      onCancel: () => {
        p.cancel("Cancelled — nothing was written.");
        process.exit(130);
      },
    },
  );

  return {
    schemaVersion: 1,
    mode: answers.mode as Mode,
    origin: answers.origin as Origin,
    issueTracker: answers.issueTracker as IssueTracker,
    conventions: { conventionalCommits: answers.conventionalCommits },
    testing: {
      ...defaultTesting(detection),
      unitCommand: answers.unitCommand.trim() === "" ? null : answers.unitCommand.trim(),
    },
    modules: { core: true },
  };
}

const SETTINGS_LABEL: Record<SettingsPlan["kind"], string> = {
  create: "create  ",
  merge: "update  ",
  "skip-declared": "ok      ",
  "skip-invalid": "conflict",
};

const CLAUDE_IMPORTS_LABEL: Record<ClaudeImportsPlan["kind"], string> = {
  seed: "create  ",
  ok: "ok      ",
  merge: "update  ",
};

export async function runInit(opts: InitOptions): Promise<InitOutcome> {
  const detection = detectRepo(opts.cwd);
  // Launchrail relies on git history for safe writes — a missing repository is
  // something init fixes, not something it lectures about. `git init` never
  // fires inside an existing repository (detection walks up the tree).
  let gitInitialized = false;
  if (!detection.isGitRepo && !opts.dryRun) {
    gitInitialized = spawnSync("git", ["init", "-q"], { cwd: opts.cwd, encoding: "utf8" }).status === 0;
    if (gitInitialized) {
      console.log("Initialized a git repository (`git init`) — Launchrail relies on git history for safe writes.");
      detection.isGitRepo = true;
    }
  }
  const settings = planPluginDeclaration(opts.cwd);
  const claudeImports = planClaudeImports(opts.cwd);
  const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  let manifest: Manifest;
  if (detection.hasManifest) {
    const parsed = parseManifest(readFileSync(join(opts.cwd, MANIFEST_FILENAME), "utf8"));
    if (!parsed.manifest) {
      console.error(`launchrail: existing ${MANIFEST_FILENAME} is invalid:`);
      for (const error of parsed.errors) console.error(`  - ${error}`);
      return { code: 1, actions: [], settings, claudeImports, plugin: "skipped" };
    }
    manifest = parsed.manifest;
    console.log(`Found existing ${MANIFEST_FILENAME} — using its configuration (init is idempotent).`);
  } else if (interactive) {
    manifest = await interview(detection);
  } else if (opts.yes) {
    manifest = defaultManifestFor(detection);
  } else {
    console.error("launchrail: non-interactive session — re-run with --yes to accept defaults.");
    return { code: 1, actions: [], settings, claudeImports, plugin: "skipped" };
  }

  // Adopting a project that already exists (not a fresh Launchrail init): make
  // the safe-write model explicit — existing files are kept, and Launchrail
  // wires itself in additively rather than overwriting anything.
  const adoptingExisting =
    !detection.hasManifest && (detection.hasAgentsMd || detection.hasClaudeMd || detection.hasPackageJson);
  if (adoptingExisting) {
    console.log(
      "Adopting an existing project — your files are kept as-is; Launchrail wires itself in additively and overwrites nothing.",
    );
  }

  const specs: FileSpec[] = [
    { relPath: MANIFEST_FILENAME, content: serializeManifest(manifest), ownership: "seeded" },
    ...seedFiles({ projectName: detection.projectName, manifest, launchrailVersion: VERSION }),
  ];

  const existing = readLockfile(opts.cwd);
  if (existing.error) {
    console.error(`launchrail: ${existing.error} — refusing to continue. Fix or remove the lockfile first.`);
    return { code: 1, actions: [], settings, claudeImports, plugin: "skipped" };
  }
  const lockfile = existing.lockfile ?? emptyLockfile(VERSION);
  if (!existing.lockfile) {
    // A fresh init produces the current structure, so every shipped migration
    // is satisfied by definition. Existing lockfiles are left to `sync`.
    lockfile.migrations = migrationIds().sort();
  }
  const lockBefore = JSON.stringify(lockfile);

  const actions = planWrites(opts.cwd, specs, lockfile);
  console.log("");
  for (const action of actions) {
    console.log(`  ${ACTION_LABEL[action.kind]}  ${action.spec.relPath}  (${action.detail})`);
  }
  console.log(`  ${SETTINGS_LABEL[settings.kind]}  ${CLAUDE_SETTINGS_PATH}  (${settings.detail})`);
  // Only worth a line when a CLAUDE.md already exists; a fresh one is seeded
  // with both imports and shows up in the file actions above.
  if (claudeImports.kind !== "seed") {
    console.log(`  ${CLAUDE_IMPORTS_LABEL[claudeImports.kind]}  CLAUDE.md  (${claudeImports.detail})`);
  }

  if (opts.dryRun) {
    if (!detection.isGitRepo) {
      console.log("  git-init  .  (not a git repository — init will run `git init` first)");
    }
    if (opts.skipPluginInstall) {
      console.log("  skip      Claude Code plugin install  (--skip-plugin-install)");
    } else {
      const version = detectClaudeCli(opts.cwd);
      console.log(
        version
          ? `  install   ${WORKFLOW_PLUGINS.map((wp) => wp.id).join(" + ")} into Claude Code  (claude CLI ${version} detected)`
          : "  manual    Claude Code plugin install  (claude CLI not found — instructions will be printed)",
      );
    }
    console.log("\nDry run — nothing was written.");
    return { code: 0, actions, settings, claudeImports, plugin: "dry-run" };
  }

  const written = applyPlan(opts.cwd, actions, lockfile);
  if (applyPluginDeclaration(opts.cwd, settings)) written.push(CLAUDE_SETTINGS_PATH);
  // Wire the workflow imports into a pre-existing CLAUDE.md (no-op when init
  // just seeded a fresh one, which already carries both). Additive and
  // idempotent, mirroring the .claude/settings.json merge (ADR-0003, ADR-0012).
  const importsWired = applyClaudeImports(opts.cwd, claudeImports);
  if (importsWired) written.push("CLAUDE.md");
  lockfile.launchrailVersion = VERSION;
  lockfile.decisions = {
    ...lockfile.decisions,
    mode: manifest.mode,
    origin: manifest.origin,
    issueTracker: manifest.issueTracker,
    conventionalCommits: manifest.conventions.conventionalCommits,
    unitCommand: manifest.testing.unitCommand,
  };
  if (JSON.stringify(lockfile) !== lockBefore || !existing.lockfile) {
    writeLockfile(opts.cwd, lockfile);
  }

  console.log(
    written.length > 0
      ? `\nWrote ${written.length} file(s).`
      : "\nEverything already up to date — nothing written.",
  );
  if (importsWired) {
    console.log(
      `Wired the workflow imports into your existing CLAUDE.md (${claudeImports.added.join(", ")}) — your content is untouched above them.`,
    );
  }
  if (!detection.isGitRepo) {
    console.log("\n⚠ Not a git repository. Run `git init` before letting agents work here — Launchrail relies on git for safe writes.");
  }

  let plugin: PluginHandoff = "skipped";
  const failedPlugins: WorkflowPlugin[] = [];
  if (!opts.skipPluginInstall) {
    const version = detectClaudeCli(opts.cwd);
    if (version === null) {
      plugin = "no-cli";
    } else {
      console.log("\nInstalling the Claude Code plugins the workflow needs (first run clones marketplaces)…");
      let fresh = 0;
      for (const wp of WORKFLOW_PLUGINS) {
        const result = installPlugin(opts.cwd, wp);
        if (result.state === "installed") {
          if (result.detail !== "up-to-date") fresh += 1;
          const suffix =
            result.detail === "updated"
              ? ` — updated${result.versions ? ` (${result.versions})` : ""}`
              : result.detail === "up-to-date"
                ? " — already up to date"
                : "";
          console.log(`  ✓ ${wp.label} (${wp.id})${suffix}`);
        } else {
          failedPlugins.push(wp);
          console.log(`  ⚠ ${wp.label} (${wp.id}) failed at ${result.step}:`);
          for (const line of result.output.split("\n").slice(0, 3)) {
            if (line.trim()) console.log(`      ${line.trim()}`);
          }
        }
      }
      plugin = failedPlugins.length > 0 ? "failed" : fresh > 0 ? "installed" : "already-installed";
    }
  }

  const pluginReady = plugin === "installed" || plugin === "already-installed";
  console.log("\nYou're set up — from here the workflow runs inside Claude Code:");
  console.log('  1. Commit the result: git add -A && git commit -m "chore: initialize launchrail"');
  if (pluginReady) {
    console.log("  2. Open Claude Code in this project — the workflow plugins and their skills are ready.");
    console.log("     (Session already open? Run /reload-plugins, or restart Claude Code.)");
  } else {
    const toInstall = plugin === "failed" ? failedPlugins : WORKFLOW_PLUGINS;
    console.log("  2. Install the workflow plugins into Claude Code:");
    for (const wp of toInstall) {
      console.log(`       claude plugin marketplace add ${wp.marketplace}`);
      console.log(`       claude plugin install ${wp.id}`);
    }
    console.log("     (No claude CLI? Inside Claude Code run /plugin → Marketplaces → Add, and enter the");
    console.log(`      owner/repo sources above. ${CLAUDE_SETTINGS_PATH} also declares these plugins, so`);
    console.log("      Claude Code offers them by itself the first time this folder is trusted.)");
  }
  console.log("  3. Run /launchrail:launch — it detects the project's stage and drives the workflow from there.");
  if (manifest.origin === "existing") {
    console.log("     For an existing project it starts by aligning your code with Launchrail's artifacts:");
    console.log("     it infers a vision from what you already have, asks about the gaps, and inventories your");
    console.log("     design system — rather than starting from a blank vision. Run /setup-matt-pocock-skills");
    console.log("     first (the skills are already installed).");
  } else {
    console.log("     On a fresh project that means running /setup-matt-pocock-skills (the skills are already");
    console.log("     installed), then vision creation, which also replaces the seeded AGENTS.md project-purpose");
    console.log("     TODO. No seeded file needs filling in by hand.");
  }
  console.log("\nRun `npx @wemuda/launchrail doctor` any time to validate the setup.");
  return { code: 0, actions, settings, claudeImports, plugin };
}
