import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { BROWSER_TESTING_MODULE, browserTestingFiles } from "../lib/browser-testing.js";
import { detectRepo, type RepoDetection } from "../lib/detect.js";
import { emptyLockfile, readLockfile, writeLockfile } from "../lib/lockfile.js";
import { MANIFEST_FILENAME, parseManifest, setModuleEnabled, type Manifest } from "../lib/manifest.js";
import { claudeGeneratedFile } from "../lib/seeds.js";
import { ACTION_LABEL, applyPlan, planWrites, type FileSpec, type PlannedAction } from "../lib/writer.js";
import { VERSION } from "../version.js";

export interface AddOptions {
  cwd: string;
  module: string;
  dryRun: boolean;
  yes: boolean;
}

export interface AddOutcome {
  code: number;
  actions: PlannedAction[];
}

export const AVAILABLE_MODULES = [BROWSER_TESTING_MODULE];

interface BrowserTestingAnswers {
  appUrl: string;
  devCommand: string | null;
  e2eCommand: string;
  smokeCommand: string;
}

function defaultAnswers(manifest: Manifest, detection: RepoDetection): BrowserTestingAnswers {
  const pm = detection.packageManager ?? "npm";
  return {
    appUrl: manifest.testing.appUrl ?? "http://localhost:3000",
    devCommand: manifest.testing.devCommand ?? (detection.devScript ? `${pm} run dev` : null),
    e2eCommand: manifest.testing.e2eCommand ?? "npx playwright test",
    smokeCommand: manifest.testing.smokeCommand ?? "node scripts/smoke.mjs",
  };
}

async function interview(defaults: BrowserTestingAnswers): Promise<BrowserTestingAnswers> {
  p.intro("launchrail add browser-testing");
  const answers = await p.group(
    {
      appUrl: () =>
        p.text({
          message: "App URL browser tests run against",
          initialValue: defaults.appUrl,
        }),
      devCommand: () =>
        p.text({
          message: "Command that starts the app (empty to fill in later)",
          initialValue: defaults.devCommand ?? "",
          placeholder: "e.g. pnpm dev",
        }),
      e2eCommand: () =>
        p.text({
          message: "Deterministic browser-test command",
          initialValue: defaults.e2eCommand,
        }),
      smokeCommand: () =>
        p.text({
          message: "Smoke entry command",
          initialValue: defaults.smokeCommand,
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
    appUrl: answers.appUrl.trim() || defaults.appUrl,
    devCommand: answers.devCommand.trim() === "" ? null : answers.devCommand.trim(),
    e2eCommand: answers.e2eCommand.trim() || defaults.e2eCommand,
    smokeCommand: answers.smokeCommand.trim() || defaults.smokeCommand,
  };
}

export async function runAdd(opts: AddOptions): Promise<AddOutcome> {
  if (opts.module !== BROWSER_TESTING_MODULE) {
    console.error(
      `launchrail: unknown module "${opts.module}". Available modules: ${AVAILABLE_MODULES.join(", ")}`,
    );
    return { code: 1, actions: [] };
  }

  const detection = detectRepo(opts.cwd);
  if (!detection.hasManifest) {
    console.error(`launchrail: ${MANIFEST_FILENAME} not found — run \`launchrail init\` first.`);
    return { code: 1, actions: [] };
  }
  const manifestSource = readFileSync(join(opts.cwd, MANIFEST_FILENAME), "utf8");
  const parsed = parseManifest(manifestSource);
  if (!parsed.manifest) {
    console.error(`launchrail: ${MANIFEST_FILENAME} is invalid:`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    return { code: 1, actions: [] };
  }

  const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;
  const answers = interactive
    ? await interview(defaultAnswers(parsed.manifest, detection))
    : defaultAnswers(parsed.manifest, detection);

  // The manifest object the seeded files are rendered from.
  const manifest: Manifest = {
    ...parsed.manifest,
    testing: { ...parsed.manifest.testing, ...answers },
    modules: { ...parsed.manifest.modules, [BROWSER_TESTING_MODULE]: true },
  };

  const manifestUpdate = setModuleEnabled(manifestSource, BROWSER_TESTING_MODULE, {
    appUrl: answers.appUrl,
    devCommand: answers.devCommand,
    e2eCommand: answers.e2eCommand,
    smokeCommand: answers.smokeCommand,
  });

  const existing = readLockfile(opts.cwd);
  if (existing.error) {
    console.error(`launchrail: ${existing.error} — refusing to continue. Fix or remove the lockfile first.`);
    return { code: 1, actions: [] };
  }
  const lockfile = existing.lockfile ?? emptyLockfile(VERSION);
  const lockBefore = JSON.stringify(lockfile);

  const specs: FileSpec[] = [
    ...browserTestingFiles({ manifest, detection }),
    claudeGeneratedFile({ projectName: detection.projectName, manifest, launchrailVersion: VERSION }),
  ];
  const actions = planWrites(opts.cwd, specs, lockfile);

  console.log("");
  console.log(
    manifestUpdate.changed
      ? `  update    ${MANIFEST_FILENAME}  (enable ${BROWSER_TESTING_MODULE}, record testing commands)`
      : `  ok        ${MANIFEST_FILENAME}  (${BROWSER_TESTING_MODULE} already enabled)`,
  );
  for (const action of actions) {
    console.log(`  ${ACTION_LABEL[action.kind]}  ${action.spec.relPath}  (${action.detail})`);
  }
  if (detection.playwrightConfigFile) {
    console.log(`\nExisting ${detection.playwrightConfigFile} detected — keeping it; no config or baseline spec seeded.`);
  }

  if (opts.dryRun) {
    console.log("\nDry run — nothing was written.");
    return { code: 0, actions };
  }

  if (manifestUpdate.changed) {
    writeFileSync(join(opts.cwd, MANIFEST_FILENAME), manifestUpdate.source, "utf8");
  }
  const written = applyPlan(opts.cwd, actions, lockfile);
  lockfile.launchrailVersion = VERSION;
  lockfile.decisions = {
    ...lockfile.decisions,
    [`module:${BROWSER_TESTING_MODULE}`]: true,
    appUrl: answers.appUrl,
    devCommand: answers.devCommand,
    e2eCommand: answers.e2eCommand,
    smokeCommand: answers.smokeCommand,
  };
  if (JSON.stringify(lockfile) !== lockBefore || !existing.lockfile) {
    writeLockfile(opts.cwd, lockfile);
  }

  console.log(
    written.length > 0 || manifestUpdate.changed
      ? `\nWrote ${written.length + (manifestUpdate.changed ? 1 : 0)} file(s).`
      : "\nEverything already up to date — nothing written.",
  );

  console.log("\nNext steps:");
  console.log("  1. Run `node scripts/setup.mjs` — installs @playwright/test and browser binaries.");
  if (!answers.devCommand) {
    console.log("  2. Set the dev command: edit scripts/dev.mjs (DEV_COMMAND) and testing.devCommand in .launchrail.yml.");
  }
  console.log(`  ${answers.devCommand ? "2" : "3"}. Review the seeded files — they are yours: playwright config, tests/e2e/, docs/testing/smoke-journeys.md.`);
  console.log(`  ${answers.devCommand ? "3" : "4"}. Verify: \`node scripts/verify.mjs\`, then \`npx @wemuda/launchrail smoke\` with the app running.`);
  return { code: 0, actions };
}
