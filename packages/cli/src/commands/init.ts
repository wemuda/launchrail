import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { detectRepo, type RepoDetection } from "../lib/detect.js";
import { emptyLockfile, readLockfile, writeLockfile } from "../lib/lockfile.js";
import {
  ISSUE_TRACKERS,
  MANIFEST_FILENAME,
  MODES,
  parseManifest,
  serializeManifest,
  type IssueTracker,
  type Manifest,
  type Mode,
} from "../lib/manifest.js";
import { seedFiles } from "../lib/seeds.js";
import { applyPlan, planWrites, type FileSpec, type PlannedAction } from "../lib/writer.js";
import { VERSION } from "../version.js";

export interface InitOptions {
  cwd: string;
  dryRun: boolean;
  yes: boolean;
}

export interface InitOutcome {
  code: number;
  actions: PlannedAction[];
}

function suggestedTestCommand(detection: RepoDetection): string | null {
  if (!detection.testScript) return null;
  return `${detection.packageManager ?? "npm"} test`;
}

function defaultManifestFor(detection: RepoDetection): Manifest {
  return {
    schemaVersion: 1,
    mode: "standard-mvp",
    issueTracker: detection.gitRemoteUrl?.includes("github.com") ? "github" : "none",
    conventions: {
      conventionalCommits:
        detection.conventionalCommitRatio === null ? true : detection.conventionalCommitRatio >= 0.5,
    },
    testing: { unitCommand: suggestedTestCommand(detection) },
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
    issueTracker: answers.issueTracker as IssueTracker,
    conventions: { conventionalCommits: answers.conventionalCommits },
    testing: { unitCommand: answers.unitCommand.trim() === "" ? null : answers.unitCommand.trim() },
    modules: { core: true },
  };
}

const ACTION_LABEL: Record<PlannedAction["kind"], string> = {
  create: "create  ",
  update: "update  ",
  "skip-unchanged": "ok      ",
  "skip-seeded-exists": "keep    ",
  conflict: "conflict",
};

export async function runInit(opts: InitOptions): Promise<InitOutcome> {
  const detection = detectRepo(opts.cwd);
  const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  let manifest: Manifest;
  if (detection.hasManifest) {
    const parsed = parseManifest(readFileSync(join(opts.cwd, MANIFEST_FILENAME), "utf8"));
    if (!parsed.manifest) {
      console.error(`launchrail: existing ${MANIFEST_FILENAME} is invalid:`);
      for (const error of parsed.errors) console.error(`  - ${error}`);
      return { code: 1, actions: [] };
    }
    manifest = parsed.manifest;
    console.log(`Found existing ${MANIFEST_FILENAME} — using its configuration (init is idempotent).`);
  } else if (interactive) {
    manifest = await interview(detection);
  } else if (opts.yes) {
    manifest = defaultManifestFor(detection);
  } else {
    console.error("launchrail: non-interactive session — re-run with --yes to accept defaults.");
    return { code: 1, actions: [] };
  }

  const specs: FileSpec[] = [
    { relPath: MANIFEST_FILENAME, content: serializeManifest(manifest), ownership: "seeded" },
    ...seedFiles({ projectName: detection.projectName, manifest, launchrailVersion: VERSION }),
  ];

  const existing = readLockfile(opts.cwd);
  if (existing.error) {
    console.error(`launchrail: ${existing.error} — refusing to continue. Fix or remove the lockfile first.`);
    return { code: 1, actions: [] };
  }
  const lockfile = existing.lockfile ?? emptyLockfile(VERSION);
  const lockBefore = JSON.stringify(lockfile);

  const actions = planWrites(opts.cwd, specs, lockfile);
  console.log("");
  for (const action of actions) {
    console.log(`  ${ACTION_LABEL[action.kind]}  ${action.spec.relPath}  (${action.detail})`);
  }

  if (opts.dryRun) {
    console.log("\nDry run — nothing was written.");
    return { code: 0, actions };
  }

  const written = applyPlan(opts.cwd, actions, lockfile);
  lockfile.launchrailVersion = VERSION;
  lockfile.decisions = {
    ...lockfile.decisions,
    mode: manifest.mode,
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
  if (!detection.isGitRepo) {
    console.log("\n⚠ Not a git repository. Run `git init` before letting agents work here — Launchrail relies on git for safe writes.");
  }

  console.log("\nNext steps:");
  console.log("  1. Review the seeded AGENTS.md and fill in the TODO sections.");
  if (!detection.hasMattPocockSetup) {
    console.log("  2. Install Matt Pocock's skills and run /setup-matt-pocock-skills (expected output: docs/agents/).");
  }
  console.log(`  ${detection.hasMattPocockSetup ? "2" : "3"}. Run \`npx @wemuda/launchrail doctor\` to validate the setup.`);
  console.log(`  ${detection.hasMattPocockSetup ? "3" : "4"}. Commit the result.`);
  return { code: 0, actions };
}
