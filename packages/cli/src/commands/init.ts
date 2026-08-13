import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { agentsDocsFiles } from "../lib/agentsDocs.js";
import {
  applyClaudeImports,
  planClaudeImports,
  type ClaudeImportsPlan,
} from "../lib/claudeImports.js";
import { detectRepo, type RepoDetection } from "../lib/detect.js";
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
}

export interface InitOutcome {
  code: number;
  actions: PlannedAction[];
  /** How init wired the two workflow @-imports into CLAUDE.md (relevant when the repo already had one). */
  claudeImports: ClaudeImportsPlan;
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
 * Ralph is the implementation loop (ADR-0020), so its module is on from the
 * start: init installs the loop's materials and nobody meets a "needs
 * `launchrail add ralph`" wall at the moment they start building (ADR-0018).
 */
function defaultModules(): Manifest["modules"] {
  return { core: true, [RALPH_MODULE]: true };
}

function defaultManifestFor(detection: RepoDetection): Manifest {
  return {
    schemaVersion: 1,
    mode: "standard-mvp",
    origin: detection.looksEstablished ? "existing" : "new",
    issueTracker: detection.gitRemoteUrl?.includes("github.com")
      ? "github"
      : detection.gitRemoteUrl?.includes("gitlab")
        ? "gitlab"
        : "none",
    conventions: {
      conventionalCommits:
        detection.conventionalCommitRatio === null ? true : detection.conventionalCommitRatio >= 0.5,
    },
    testing: defaultTesting(detection),
    modules: defaultModules(),
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
    modules: defaultModules(),
  };
}

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
  if (!detection.isGitRepo && !opts.dryRun) {
    const gitInitialized = spawnSync("git", ["init", "-q"], { cwd: opts.cwd, encoding: "utf8" }).status === 0;
    if (gitInitialized) {
      console.log("Initialized a git repository (`git init`) — Launchrail relies on git history for safe writes.");
      detection.isGitRepo = true;
    }
  }
  const claudeImports = planClaudeImports(opts.cwd);
  const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  let manifest: Manifest;
  if (detection.hasManifest) {
    const parsed = parseManifest(readFileSync(join(opts.cwd, MANIFEST_FILENAME), "utf8"));
    if (!parsed.manifest) {
      console.error(`launchrail: existing ${MANIFEST_FILENAME} is invalid:`);
      for (const error of parsed.errors) console.error(`  - ${error}`);
      return { code: 1, actions: [], claudeImports };
    }
    manifest = parsed.manifest;
    console.log(`Found existing ${MANIFEST_FILENAME} — using its configuration (init is idempotent).`);
  } else if (interactive) {
    manifest = await interview(detection);
  } else if (opts.yes) {
    manifest = defaultManifestFor(detection);
  } else {
    console.error("launchrail: non-interactive session — re-run with --yes to accept defaults.");
    return { code: 1, actions: [], claudeImports };
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
    // Workflow configuration under docs/agents/ seeds straight from the
    // manifest's answers (ADR-0020) — there is no interactive setup stage.
    ...agentsDocsFiles(manifest),
    // The workflow skills — Launchrail's own complete set (ADR-0020) — ship as
    // managed files (ADR-0019): they travel with the repo, so cloud and
    // non-Claude agents get them with no install step.
    ...skillFiles(),
    // The Ralph loop's materials install with init when its module is on
    // (fresh manifests always enable it, ADR-0018/0020). An existing manifest
    // without the module is brought current by sync's migration, not silently
    // rewritten here.
    ...(manifest.modules[RALPH_MODULE] ? ralphFiles() : []),
  ];

  const existing = readLockfile(opts.cwd);
  if (existing.error) {
    console.error(`launchrail: ${existing.error} — refusing to continue. Fix or remove the lockfile first.`);
    return { code: 1, actions: [], claudeImports };
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
  // Only worth a line when a CLAUDE.md already exists; a fresh one is seeded
  // with both imports and shows up in the file actions above.
  if (claudeImports.kind !== "seed") {
    console.log(`  ${CLAUDE_IMPORTS_LABEL[claudeImports.kind]}  CLAUDE.md  (${claudeImports.detail})`);
  }

  if (opts.dryRun) {
    if (!detection.isGitRepo) {
      console.log("  git-init  .  (not a git repository — init will run `git init` first)");
    }
    console.log("\nDry run — nothing was written.");
    return { code: 0, actions, claudeImports };
  }

  const written = applyPlan(opts.cwd, actions, lockfile);
  // Wire the workflow imports into a pre-existing CLAUDE.md (no-op when init
  // just seeded a fresh one, which already carries both). Additive and
  // idempotent, mirroring the old .claude/settings.json merge (ADR-0012).
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

  console.log("\nYou're set up — the workflow skills are in .claude/skills/ (managed by Launchrail):");
  console.log('  1. Commit the result: git add -A && git commit -m "chore: initialize launchrail"');
  console.log("  2. Open Claude Code (or another agent) here — the skills are ready to invoke, nothing to install.");
  console.log("  3. Run /launch — it detects the project's stage and drives the workflow from there.");
  if (manifest.origin === "existing") {
    console.log("     For an existing project it starts by aligning your code with Launchrail's artifacts:");
    console.log("     it infers a vision from what you already have, asks about the gaps, and inventories your");
    console.log("     design system — rather than a blank vision.");
  } else {
    console.log("     On a fresh project that starts with vision creation, which also replaces the seeded");
    console.log("     AGENTS.md project-purpose TODO.");
  }
  console.log("\nRun `npx @wemuda/launchrail doctor` any time to validate the setup.");
  return { code: 0, actions, claudeImports };
}
