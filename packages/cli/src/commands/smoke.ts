import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_TESTING_MODULE, SMOKE_JOURNEYS_PATH } from "../lib/browser-testing.js";
import { MANIFEST_FILENAME, parseManifest } from "../lib/manifest.js";
import { VERSION } from "../version.js";

export interface SmokeOptions {
  cwd: string;
  url: string | null;
  dryRun: boolean;
}

export interface SmokeOutcome {
  code: number;
  /** Absolute path of the created run directory, when one was created. */
  runDir: string | null;
}

export type SmokeEnvironment = "local" | "ci" | "cloud";

function detectEnvironment(env: NodeJS.ProcessEnv): SmokeEnvironment {
  if (env.CLAUDE_CODE_REMOTE === "true") return "cloud";
  if (env.CI) return "ci";
  return "local";
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function parseJourneyNames(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => line.startsWith("## Journey:"))
    .map((line) => line.slice("## Journey:".length).trim())
    .filter((name) => name.length > 0);
}

const EVIDENCE_GITIGNORE = `# Managed by Launchrail: keep summaries and deviations reviewable, ignore bulky evidence.
*
!.gitignore
!*/
!*/summary.md
!*/deviations.md
!*/meta.json
`;

function summaryTemplate(opts: {
  runId: string;
  baseUrl: string;
  commitSha: string | null;
  gitDirty: boolean;
  environment: SmokeEnvironment;
  appStatus: string;
  journeys: string[];
}): string {
  const journeyLines =
    opts.journeys.length > 0
      ? opts.journeys.map((name) => `- [ ] ${name}`).join("\n")
      : `_No journeys defined in ${SMOKE_JOURNEYS_PATH} — record the journeys actually driven (e.g. from the ticket under verification)._`;
  return `# Smoke verification — ${opts.runId}

- Commit: ${opts.commitSha ?? "no git history"}${opts.gitDirty ? " (working tree dirty)" : ""}
- Base URL: ${opts.baseUrl} (responded ${opts.appStatus})
- Environment: ${opts.environment}
- Launchrail: v${VERSION}
- Spec / ticket references: _fill in_

## Journeys

${journeyLines}

## Standard checks

- [ ] No uncaught console errors
- [ ] No failed API requests
- [ ] Success state visible for each journey
- [ ] Data remains after refresh

## Evidence

_Reference files in this directory: screenshots/, traces/, console.log, network-errors.json, test-results.json._

## Deviations from spec or design

_None recorded — add details here and in deviations.md when found._

## New regression tests

_Deterministic tests added from smoke findings._

## Blockers

_None._
`;
}

/**
 * Prepare an agentic smoke run: confirm the app is reachable, then scaffold a
 * traceable evidence bundle under artifacts/verification/<run-id>/. The agent
 * (browser-smoke skill) drives the journeys and fills the bundle in.
 *
 * Only ever creates new files in a fresh run directory — it never modifies
 * existing project files, so no checksum tracking is needed.
 */
export async function runSmoke(opts: SmokeOptions): Promise<SmokeOutcome> {
  const manifestPath = join(opts.cwd, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    console.error(`launchrail: ${MANIFEST_FILENAME} not found — run \`launchrail init\` first.`);
    return { code: 1, runDir: null };
  }
  const parsed = parseManifest(readFileSync(manifestPath, "utf8"));
  if (!parsed.manifest) {
    console.error(`launchrail: ${MANIFEST_FILENAME} is invalid:`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    return { code: 1, runDir: null };
  }
  if (!parsed.manifest.modules[BROWSER_TESTING_MODULE]) {
    console.error(
      `launchrail: the ${BROWSER_TESTING_MODULE} module is not enabled — run \`launchrail add ${BROWSER_TESTING_MODULE}\` first.`,
    );
    return { code: 1, runDir: null };
  }

  const baseUrl = opts.url ?? parsed.manifest.testing.appUrl;
  if (!baseUrl) {
    console.error(`launchrail: no app URL — set testing.appUrl in ${MANIFEST_FILENAME} or pass --url <url>.`);
    return { code: 1, runDir: null };
  }

  let appStatus: string | null = null;
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    appStatus = `HTTP ${response.status}`;
  } catch {
    // Any response counts as reachable; only a connection failure aborts the run.
  }
  if (appStatus === null) {
    console.error(
      `launchrail: ${baseUrl} is not responding. Start the app first (\`node scripts/dev.mjs --background\`) or pass --url <url>.`,
    );
    return { code: 1, runDir: null };
  }

  const journeysPath = join(opts.cwd, SMOKE_JOURNEYS_PATH);
  const journeys = existsSync(journeysPath) ? parseJourneyNames(readFileSync(journeysPath, "utf8")) : [];

  const commitSha = git(opts.cwd, ["rev-parse", "HEAD"]);
  const gitDirty = (git(opts.cwd, ["status", "--porcelain"]) ?? "") !== "";
  const environment = detectEnvironment(process.env);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  let runId = `${stamp}-${commitSha?.slice(0, 7) ?? "nogit"}`;
  const verificationDir = join(opts.cwd, "artifacts", "verification");
  for (let n = 2; existsSync(join(verificationDir, runId)); n += 1) {
    runId = `${stamp}-${commitSha?.slice(0, 7) ?? "nogit"}-${n}`;
  }
  const runDir = join(verificationDir, runId);

  console.log(`App responding at ${baseUrl} (${appStatus}).`);
  if (journeys.length > 0) {
    console.log(`\n${journeys.length} journey(s) from ${SMOKE_JOURNEYS_PATH}:`);
    for (const name of journeys) console.log(`  - ${name}`);
  } else {
    console.log(`\nNo journeys defined in ${SMOKE_JOURNEYS_PATH} — drive the journeys defined by the work under verification.`);
  }

  if (opts.dryRun) {
    console.log(`\nDry run — would create artifacts/verification/${runId}/ (meta.json, summary.md, screenshots/, traces/).`);
    return { code: 0, runDir: null };
  }

  mkdirSync(join(runDir, "screenshots"), { recursive: true });
  mkdirSync(join(runDir, "traces"), { recursive: true });
  const gitignorePath = join(verificationDir, ".gitignore");
  if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, EVIDENCE_GITIGNORE, "utf8");

  const meta = {
    schemaVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    commitSha,
    gitDirty,
    baseUrl,
    appStatus,
    environment,
    launchrailVersion: VERSION,
    journeys,
  };
  writeFileSync(join(runDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  writeFileSync(
    join(runDir, "summary.md"),
    summaryTemplate({ runId, baseUrl, commitSha, gitDirty, environment, appStatus, journeys }),
    "utf8",
  );

  console.log(`\nEvidence bundle scaffolded: artifacts/verification/${runId}/`);
  console.log("  - summary.md        fill in as journeys complete; check every box you verified");
  console.log("  - screenshots/      capture key states as you go");
  console.log("  - traces/           Playwright traces where available");
  console.log("  - console.log / network-errors.json / test-results.json — write these when relevant");
  console.log("\nEvery journey must pass the standard checks. Convert real bugs into failing deterministic tests before fixing.");
  return { code: 0, runDir };
}
