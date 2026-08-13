import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { detectClaudeCli, installPlugin, toWorkflowPlugin, WORKFLOW_PLUGINS, type WorkflowPlugin } from "../lib/claudeCli.js";
import {
  applyClaudeImports,
  planClaudeImports,
  type ClaudeImportsPlan,
} from "../lib/claudeImports.js";
import {
  applyPluginDeclaration,
  applyRalphGuardHook,
  CLAUDE_SETTINGS_PATH,
  planPluginDeclaration,
  planRalphGuardHook,
  PLUGIN_DECLARATIONS,
  type HookPlan,
  type SettingsPlan,
} from "../lib/claudeSettings.js";
import { detectRepo, type RepoDetection } from "../lib/detect.js";
import {
  DEFAULT_IMPLEMENTATION_LOOP,
  implementationLoopDeclarations,
  implementationLoopProvider,
  type ImplementationLoop,
} from "../lib/implementationLoops.js";
import { emptyLockfile, readLockfile, writeLockfile } from "../lib/lockfile.js";
import { migrationIds } from "../lib/migrations.js";
import { RALPH_MODULE, ralphFiles } from "../lib/ralph.js";
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
import { skillFiles } from "../lib/skills.js";
import { ACTION_LABEL, applyPlan, planWrites, type FileSpec, type PlannedAction } from "../lib/writer.js";
import { VERSION } from "../version.js";

export interface InitOptions {
  cwd: string;
  dryRun: boolean;
  yes: boolean;
  /** Write the declaration but skip the `claude` CLI plugin install. */
  skipPluginInstall?: boolean;
}

/** How the Claude Code plugin install ended up. "none" = nothing to install (the default, ralph — skills are vendored). */
export type PluginHandoff = "installed" | "already-installed" | "failed" | "no-cli" | "skipped" | "none" | "dry-run";

export interface InitOutcome {
  code: number;
  actions: PlannedAction[];
  settings: SettingsPlan;
  /** How init registered Ralph's unattended-launch guard hook in settings.json — null when the ralph module is off. */
  ralphHook: HookPlan | null;
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

/**
 * The default loop should be present by default (ADR-0018): selecting `ralph`
 * enables its module up front, so init installs the loop's materials and nobody
 * meets a "needs `launchrail add ralph`" wall at the moment they start building.
 */
function modulesFor(loop: ImplementationLoop): Manifest["modules"] {
  return loop === "ralph" ? { core: true, [RALPH_MODULE]: true } : { core: true };
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
    modules: modulesFor(DEFAULT_IMPLEMENTATION_LOOP),
    implementationLoop: DEFAULT_IMPLEMENTATION_LOOP,
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
      implementationLoop: () =>
        p.select({
          message: "Implementation loop (drives ready tickets to verified merges)",
          initialValue: defaults.implementationLoop as string,
          options: [
            {
              value: "ralph",
              label: "Ralph",
              hint: "built-in, verification-gated (recommended); installed by init",
            },
            {
              value: "superpowers",
              label: "Superpowers",
              hint: "obra/superpowers' TDD/execution loop instead of Ralph",
            },
          ],
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
    modules: modulesFor(answers.implementationLoop as ImplementationLoop),
    implementationLoop: answers.implementationLoop as ImplementationLoop,
  };
}

const SETTINGS_LABEL: Record<SettingsPlan["kind"], string> = {
  create: "create  ",
  merge: "update  ",
  "skip-declared": "ok      ",
  "skip-invalid": "conflict",
};

const HOOK_LABEL: Record<HookPlan["kind"], string> = {
  create: "create  ",
  merge: "update  ",
  "skip-registered": "ok      ",
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
  // Base declaration (launchrail + Matt Pocock) for the early-exit paths that
  // run before the manifest is known; recomputed with the selected loop's
  // plugin once the manifest resolves below (ADR-0017).
  let settings = planPluginDeclaration(opts.cwd);
  // Set once the manifest is known and the ralph module is on (ADR-0020).
  let ralphHook: HookPlan | null = null;
  const claudeImports = planClaudeImports(opts.cwd);
  const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  let manifest: Manifest;
  if (detection.hasManifest) {
    const parsed = parseManifest(readFileSync(join(opts.cwd, MANIFEST_FILENAME), "utf8"));
    if (!parsed.manifest) {
      console.error(`launchrail: existing ${MANIFEST_FILENAME} is invalid:`);
      for (const error of parsed.errors) console.error(`  - ${error}`);
      return { code: 1, actions: [], settings, ralphHook, claudeImports, plugin: "skipped" };
    }
    manifest = parsed.manifest;
    console.log(`Found existing ${MANIFEST_FILENAME} — using its configuration (init is idempotent).`);
  } else if (interactive) {
    manifest = await interview(detection);
  } else if (opts.yes) {
    manifest = defaultManifestFor(detection);
  } else {
    console.error("launchrail: non-interactive session — re-run with --yes to accept defaults.");
    return { code: 1, actions: [], settings, ralphHook, claudeImports, plugin: "skipped" };
  }

  // The selected implementation loop (stage 10, ADR-0017) may ship its own
  // Claude Code plugin. Fold it into the roster Launchrail declares and installs
  // so a teammate opening the project gets the same loop, exactly as they get
  // launchrail + Matt Pocock. `ralph` (the default) adds nothing here.
  const loopProvider = implementationLoopProvider(manifest.implementationLoop);
  const providerDeclarations = implementationLoopDeclarations(manifest.implementationLoop);
  if (providerDeclarations.length > 0) {
    settings = planPluginDeclaration(opts.cwd, [...PLUGIN_DECLARATIONS, ...providerDeclarations]);
  }
  const installTargets: WorkflowPlugin[] = [...WORKFLOW_PLUGINS, ...providerDeclarations.map(toWorkflowPlugin)];

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
    // The workflow skills are vendored as managed files (ADR-0019): they travel
    // with the repo, so cloud and non-Claude agents get them with no plugin.
    ...skillFiles(),
    // The built-in loop's materials install with init when its module is on
    // (fresh manifests enable it whenever the loop is `ralph`, ADR-0018). An
    // existing manifest without the module is brought current by sync's
    // migration, not silently rewritten here.
    ...(manifest.modules[RALPH_MODULE] ? ralphFiles() : []),
  ];
  // Ralph's guard-hook file rides `specs`; its registration in the shared,
  // project-owned settings.json is planned as an additive merge (ADR-0020).
  if (manifest.modules[RALPH_MODULE]) ralphHook = planRalphGuardHook(opts.cwd);

  const existing = readLockfile(opts.cwd);
  if (existing.error) {
    console.error(`launchrail: ${existing.error} — refusing to continue. Fix or remove the lockfile first.`);
    return { code: 1, actions: [], settings, ralphHook, claudeImports, plugin: "skipped" };
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
  if (ralphHook) {
    console.log(`  ${HOOK_LABEL[ralphHook.kind]}  ${CLAUDE_SETTINGS_PATH}  (${ralphHook.detail})`);
  }
  // Only worth a line when a CLAUDE.md already exists; a fresh one is seeded
  // with both imports and shows up in the file actions above.
  if (claudeImports.kind !== "seed") {
    console.log(`  ${CLAUDE_IMPORTS_LABEL[claudeImports.kind]}  CLAUDE.md  (${claudeImports.detail})`);
  }

  if (opts.dryRun) {
    if (!detection.isGitRepo) {
      console.log("  git-init  .  (not a git repository — init will run `git init` first)");
    }
    if (installTargets.length === 0) {
      console.log("  ok        no plugin install — the workflow skills are vendored into .claude/skills/");
    } else if (opts.skipPluginInstall) {
      console.log(`  skip      ${loopProvider.label} loop plugin install  (--skip-plugin-install)`);
    } else {
      const version = detectClaudeCli(opts.cwd);
      console.log(
        version
          ? `  install   ${installTargets.map((wp) => wp.id).join(" + ")} into Claude Code  (claude CLI ${version} detected)`
          : `  manual    ${loopProvider.label} loop plugin install  (claude CLI not found — instructions will be printed)`,
      );
    }
    console.log(`  loop      implementation loop: ${loopProvider.label}  (${loopProvider.setupHint})`);
    console.log("\nDry run — nothing was written.");
    return { code: 0, actions, settings, ralphHook, claudeImports, plugin: "dry-run" };
  }

  const written = applyPlan(opts.cwd, actions, lockfile);
  if (applyPluginDeclaration(opts.cwd, settings)) written.push(CLAUDE_SETTINGS_PATH);
  // Register Ralph's guard hook (ADR-0020). Re-plan against the on-disk file so
  // the merge lands on top of any plugin declaration just written above — both
  // additively edit the same shared settings.json.
  if (manifest.modules[RALPH_MODULE]) {
    const applied = applyRalphGuardHook(opts.cwd, planRalphGuardHook(opts.cwd));
    if (applied && !written.includes(CLAUDE_SETTINGS_PATH)) written.push(CLAUDE_SETTINGS_PATH);
  }
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
    implementationLoop: manifest.implementationLoop,
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

  let plugin: PluginHandoff = installTargets.length === 0 ? "none" : "skipped";
  const failedPlugins: WorkflowPlugin[] = [];
  if (installTargets.length > 0 && !opts.skipPluginInstall) {
    const version = detectClaudeCli(opts.cwd);
    if (version === null) {
      plugin = "no-cli";
    } else {
      console.log(`\nInstalling the ${loopProvider.label} loop plugin (first run clones the marketplace)…`);
      let fresh = 0;
      for (const wp of installTargets) {
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

  console.log("\nYou're set up — the workflow skills are vendored into .claude/skills/ (managed by Launchrail):");
  console.log('  1. Commit the result: git add -A && git commit -m "chore: initialize launchrail"');
  console.log("  2. Open Claude Code (or another agent) here — the skills are ready to invoke, no plugin install.");
  if (installTargets.length > 0) {
    const ready = plugin === "installed" || plugin === "already-installed";
    if (ready) {
      console.log(`     Your ${loopProvider.label} loop plugin is installed too.`);
      console.log("     (Session already open? Run /reload-plugins, or restart Claude Code.)");
    } else {
      const toInstall = plugin === "failed" ? failedPlugins : installTargets;
      console.log(`     Your implementation loop (${loopProvider.label}) ships as a plugin — install it in Claude Code:`);
      for (const wp of toInstall) {
        console.log(`       claude plugin marketplace add ${wp.marketplace}`);
        console.log(`       claude plugin install ${wp.id}`);
      }
    }
  }
  console.log("  3. Run /launch — it detects the project's stage and drives the workflow from there.");
  console.log(`     Implementation loop (stage 10): ${loopProvider.label}. ${loopProvider.setupHint}`);
  if (manifest.origin === "existing") {
    console.log("     For an existing project it starts by aligning your code with Launchrail's artifacts:");
    console.log("     it infers a vision from what you already have, asks about the gaps, and inventories your");
    console.log("     design system — rather than a blank vision. Run /setup-matt-pocock-skills first");
    console.log("     (vendored in .claude/skills/).");
  } else {
    console.log("     On a fresh project that means running /setup-matt-pocock-skills (vendored in .claude/skills/),");
    console.log("     then vision creation, which also replaces the seeded AGENTS.md project-purpose TODO.");
  }
  console.log("\nRun `npx @wemuda/launchrail doctor` any time to validate the setup.");
  return { code: 0, actions, settings, ralphHook, claudeImports, plugin };
}
