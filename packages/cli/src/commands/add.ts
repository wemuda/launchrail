import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { BROWSER_TESTING_MODULE, browserTestingFiles } from "../lib/browser-testing.js";
import { detectRepo, type RepoDetection } from "../lib/detect.js";
import { emptyLockfile, readLockfile, writeLockfile, type Lockfile } from "../lib/lockfile.js";
import { MANIFEST_FILENAME, parseManifest, setModuleEnabled, type Manifest, type TestingKey } from "../lib/manifest.js";
import { RALPH_MODULE, RALPH_WORKFLOW_PATH, ralphFiles } from "../lib/ralph.js";
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

export const AVAILABLE_MODULES = [BROWSER_TESTING_MODULE, RALPH_MODULE];

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

interface ModulePlan {
  /** The manifest object the written files are rendered from. */
  manifest: Manifest;
  /** Testing keys to record alongside the module flag in the manifest. */
  testing: Partial<Record<TestingKey, string | null>>;
  specs: FileSpec[];
  /** Extra decisions recorded in the lockfile. */
  decisions: Record<string, string | boolean | null>;
  notes: string[];
  nextSteps: string[];
}

function planBrowserTesting(
  parsed: Manifest,
  detection: RepoDetection,
  answers: BrowserTestingAnswers,
): ModulePlan {
  const manifest: Manifest = {
    ...parsed,
    testing: { ...parsed.testing, ...answers },
    modules: { ...parsed.modules, [BROWSER_TESTING_MODULE]: true },
  };
  const notes: string[] = [];
  if (detection.playwrightConfigFile) {
    notes.push(`Existing ${detection.playwrightConfigFile} detected — keeping it; no config or baseline spec seeded.`);
  }
  const nextSteps = ["Run `node scripts/setup.mjs` — installs @playwright/test and browser binaries."];
  if (!answers.devCommand) {
    nextSteps.push("Set the dev command: edit scripts/dev.mjs (DEV_COMMAND) and testing.devCommand in .launchrail.yml.");
  }
  nextSteps.push(
    "Review the seeded files — they are yours: playwright config, tests/e2e/, docs/testing/smoke-journeys.md, .mcp.json.",
    "In Claude Code, approve the seeded Playwright MCP (.mcp.json) for agent-driven browser journeys; where no MCP is available (e.g. headless CI), the seeded Playwright scripts still run.",
    "Verify: `node scripts/verify.mjs`, then `npx @wemuda/launchrail smoke` with the app running.",
  );
  return {
    manifest,
    testing: { ...answers },
    specs: browserTestingFiles({ manifest, detection }),
    decisions: { ...answers },
    notes,
    nextSteps,
  };
}

function planRalph(parsed: Manifest): ModulePlan {
  const manifest: Manifest = {
    ...parsed,
    modules: { ...parsed.modules, [RALPH_MODULE]: true },
  };
  const notes: string[] = [];
  if (parsed.issueTracker === "none") {
    notes.push(
      "Warning: .launchrail.yml has issueTracker: none — Ralph runs off tracker tickets and will refuse to start until one is configured.",
    );
  }
  if (!parsed.testing.unitCommand && !parsed.testing.e2eCommand) {
    notes.push(
      "Warning: no testing commands configured — `launchrail verify` fails on an empty contract, and Ralph refuses to start on a red gate.",
    );
  }
  return {
    manifest,
    testing: {},
    specs: ralphFiles(),
    decisions: {},
    notes,
    nextSteps: [
      "Create the tracker labels Ralph uses: ready-for-agent, ralph:building, needs-info.",
      "Produce tickets with explicit `Blocked by: #n` edges and the ready-for-agent label (Matt Pocock's to-tickets, stage 8 of the workflow).",
      "Run the loop: the launchrail:ralph skill (watchable) or the `ralph` workflow (wide or long runs; scope with args, e.g. { width: 1 }).",
      "Start with width 1 until a few tickets have landed cleanly, then widen.",
    ],
  };
}

export async function runAdd(opts: AddOptions): Promise<AddOutcome> {
  if (!AVAILABLE_MODULES.includes(opts.module)) {
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

  let plan: ModulePlan;
  if (opts.module === BROWSER_TESTING_MODULE) {
    const interactive = !opts.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;
    const answers = interactive
      ? await interview(defaultAnswers(parsed.manifest, detection))
      : defaultAnswers(parsed.manifest, detection);
    plan = planBrowserTesting(parsed.manifest, detection, answers);
  } else {
    plan = planRalph(parsed.manifest);
  }

  const manifestUpdate = setModuleEnabled(manifestSource, opts.module, plan.testing);

  const existing = readLockfile(opts.cwd);
  if (existing.error) {
    console.error(`launchrail: ${existing.error} — refusing to continue. Fix or remove the lockfile first.`);
    return { code: 1, actions: [] };
  }
  const lockfile: Lockfile = existing.lockfile ?? emptyLockfile(VERSION);
  const lockBefore = JSON.stringify(lockfile);

  const specs: FileSpec[] = [
    ...plan.specs,
    claudeGeneratedFile({ projectName: detection.projectName, manifest: plan.manifest, launchrailVersion: VERSION }),
  ];
  const actions = planWrites(opts.cwd, specs, lockfile);

  console.log("");
  console.log(
    manifestUpdate.changed
      ? `  update    ${MANIFEST_FILENAME}  (enable ${opts.module}${Object.keys(plan.testing).length > 0 ? ", record testing commands" : ""})`
      : `  ok        ${MANIFEST_FILENAME}  (${opts.module} already enabled)`,
  );
  for (const action of actions) {
    console.log(`  ${ACTION_LABEL[action.kind]}  ${action.spec.relPath}  (${action.detail})`);
  }
  for (const note of plan.notes) console.log(`\n${note}`);

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
    [`module:${opts.module}`]: true,
    ...plan.decisions,
  };
  if (JSON.stringify(lockfile) !== lockBefore || !existing.lockfile) {
    writeLockfile(opts.cwd, lockfile);
  }

  const conflicts = actions.filter((a) => a.kind === "conflict");
  if (conflicts.length > 0) {
    console.log(
      `\nNot overwritten (locally modified managed file${conflicts.length > 1 ? "s" : ""}): ${conflicts
        .map((a) => a.spec.relPath)
        .join(", ")} — revert local edits to receive updates, or run \`launchrail eject <file>\` to own them permanently.`,
    );
  }

  console.log(
    written.length > 0 || manifestUpdate.changed
      ? `\nWrote ${written.length + (manifestUpdate.changed ? 1 : 0)} file(s).`
      : "\nEverything already up to date — nothing written.",
  );

  console.log("\nNext steps:");
  plan.nextSteps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
  if (opts.module === RALPH_MODULE) {
    console.log(`\nThe Ralph loop workflow lives at ${RALPH_WORKFLOW_PATH} (managed — do not hand-edit).`);
  }
  return { code: 0, actions };
}
