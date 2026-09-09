import type { PackageManager, RepoDetection } from "./detect.js";
import type { Manifest } from "./manifest.js";
import type { FileSpec } from "./writer.js";

export const BROWSER_TESTING_MODULE = "browser-testing";
export const SEMANTIC_SCRIPTS = ["setup", "dev", "verify", "doctor"] as const;

/**
 * The browser smoke's driver (ADR-0034): a shell-driven browser built for
 * agents. Bash is the one surface every session has — hosted, unattended,
 * inside a subagent — and `--session` keeps parallel builders apart.
 */
export const BROWSER_DRIVER_PACKAGE = "agent-browser";

/** Where `scripts/dev.mjs` records the URL and pid of the app it started. */
export const DEV_STATE_DIR = ".launchrail/state";

/**
 * Paths the module seeded before ADR-0034 — the journey catalogue, the
 * `smoke` entry point and the Playwright MCP config. The retirement migration
 * removes each copy that is unmodified since Launchrail wrote it.
 */
export const RETIRED_BROWSER_TESTING_SEEDS = [
  "docs/testing/smoke-journeys.md",
  "scripts/smoke.mjs",
  ".mcp.json",
] as const;

const DEFAULT_APP_URL = "http://localhost:3000";

function playwrightConfig(manifest: Manifest): string {
  const appUrl = manifest.testing.appUrl ?? DEFAULT_APP_URL;
  const webServer = manifest.testing.devCommand
    ? `  webServer: {
    command: ${JSON.stringify(manifest.testing.devCommand)},
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
`
    : `  // webServer: { command: "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI },
`;
  return `import { defineConfig } from "@playwright/test";

// Seeded by Launchrail — this file is yours to adapt.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? ${JSON.stringify(appUrl)};

export default defineConfig({
  testDir: "tests/e2e",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
${webServer}});
`;
}

function baselineSpec(): string {
  return `import { expect, test } from "@playwright/test";

// Seeded by Launchrail — the deterministic e2e baseline: the app starts, responds,
// and renders without console errors. The e2e lane stays thin (ADR-0034): add a
// spec here for a standing golden path or a behavior only a real browser can
// exercise — a feature's one-off check is the browser smoke, never a spec.
test("app starts and renders without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");
  expect(response?.ok(), "app must respond successfully on baseURL").toBe(true);
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});
`;
}

const ADD_DEV_DEP: Record<PackageManager, (pkg: string) => string> = {
  pnpm: (pkg) => `pnpm add -D ${pkg}`,
  yarn: (pkg) => `yarn add -D ${pkg}`,
  bun: (pkg) => `bun add -d ${pkg}`,
  npm: (pkg) => `npm install -D ${pkg}`,
};

function setupScript(pm: PackageManager): string {
  const addDev = ADD_DEV_DEP[pm];
  return `#!/usr/bin/env node
// Seeded by Launchrail — yours to adapt. Prepares a fresh clone for local, CI, or cloud work.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const cloud = process.argv.includes("--cloud") || process.env.CLAUDE_CODE_REMOTE === "true" || !!process.env.CI;

function run(command) {
  console.log("\\n$ " + command);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("${pm} install");
if (!existsSync("node_modules/@playwright/test")) {
  run("${addDev("@playwright/test")}");
}
// Cloud and CI machines need browser OS dependencies; local machines usually have them.
run(cloud ? "npx playwright install --with-deps chromium" : "npx playwright install chromium");
// The browser smoke's driver: a shell-driven browser for agents, with its own Chromium.
if (!existsSync("node_modules/${BROWSER_DRIVER_PACKAGE}")) {
  run("${addDev(BROWSER_DRIVER_PACKAGE)}");
}
run("npx ${BROWSER_DRIVER_PACKAGE} install");
console.log("\\nSetup complete. Next: node scripts/doctor.mjs");
`;
}

function devScript(devCommand: string | null, appUrl: string | null): string {
  return `#!/usr/bin/env node
// Seeded by Launchrail — yours to adapt. Starts the app for development and testing.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";

const DEV_COMMAND = ${JSON.stringify(devCommand ?? "")};
const APP_URL = ${JSON.stringify(appUrl ?? DEFAULT_APP_URL)};
const STATE_DIR = ${JSON.stringify(DEV_STATE_DIR)};

if (DEV_COMMAND === "") {
  console.error("No dev command configured. Edit scripts/dev.mjs and set DEV_COMMAND to whatever starts this app.");
  process.exit(1);
}

// Parallel builders each start their own app: \`--port <n>\` picks a port nobody
// else uses. The dev command sees it as PORT — adapt this file if your app reads
// another name or flag.
const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const port = portFlag !== -1 ? args[portFlag + 1] : process.env.PORT;
const url = new URL(APP_URL);
if (port) url.port = String(port);
const appUrl = url.href.replace(/\\/$/, "");
const env = port ? { ...process.env, PORT: String(port) } : process.env;

// Agents read the URL (and the pid, in background mode) from here; the state
// directory ignores itself so nothing in it reaches git.
mkdirSync(STATE_DIR, { recursive: true });
if (!existsSync(STATE_DIR + "/.gitignore")) writeFileSync(STATE_DIR + "/.gitignore", "*\\n");
writeFileSync(STATE_DIR + "/dev.url", appUrl + "\\n");

if (args.includes("--background")) {
  // Cloud and CI sessions need the app running without holding the terminal.
  const log = openSync(STATE_DIR + "/dev.log", "a");
  const child = spawn(DEV_COMMAND, { shell: true, detached: true, stdio: ["ignore", log, log], env });
  child.unref();
  writeFileSync(STATE_DIR + "/dev.pid", String(child.pid) + "\\n");
  console.log(
    "Started \`" + DEV_COMMAND + "\` in the background (pid " + child.pid + ") for " + appUrl +
      ". Logs: " + STATE_DIR + "/dev.log — stop it with \`kill $(cat " + STATE_DIR + "/dev.pid)\`.",
  );
} else {
  const result = spawnSync(DEV_COMMAND, { shell: true, stdio: "inherit", env });
  process.exit(result.status ?? 0);
}
`;
}

/** Stable semantic entry point that delegates to the Launchrail CLI. */
function delegatingScript(subcommand: string): string {
  return `#!/usr/bin/env node
// Seeded by Launchrail — stable entry point for humans, CI, and agents; delegates to the Launchrail CLI.
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["@wemuda/launchrail", "${subcommand}", ...process.argv.slice(2)],
  { shell: process.platform === "win32", stdio: "inherit" },
);
process.exit(result.status ?? 1);
`;
}

export interface BrowserTestingContext {
  manifest: Manifest;
  detection: RepoDetection;
}

/**
 * Everything `launchrail add browser-testing` seeds. All files are seeded-class:
 * created once, then project-owned. An existing Playwright config means the
 * project already has an e2e layer — keep it, seed neither config nor baseline.
 *
 * Two lanes (ADR-0034): the deterministic e2e baseline runs inside `verify`;
 * the browser smoke is one-off driving by the agent and seeds no file of its
 * own — its driver installs through `scripts/setup.mjs`.
 */
export function browserTestingFiles(ctx: BrowserTestingContext): FileSpec[] {
  const pm = ctx.detection.packageManager ?? "npm";
  const specs: FileSpec[] = [];

  if (!ctx.detection.playwrightConfigFile) {
    specs.push(
      { relPath: "playwright.config.ts", content: playwrightConfig(ctx.manifest), ownership: "seeded" },
      { relPath: "tests/e2e/baseline.spec.ts", content: baselineSpec(), ownership: "seeded" },
    );
  }

  specs.push(
    { relPath: "scripts/setup.mjs", content: setupScript(pm), ownership: "seeded", executable: true },
    {
      relPath: "scripts/dev.mjs",
      content: devScript(ctx.manifest.testing.devCommand, ctx.manifest.testing.appUrl),
      ownership: "seeded",
      executable: true,
    },
    { relPath: "scripts/verify.mjs", content: delegatingScript("verify"), ownership: "seeded", executable: true },
    { relPath: "scripts/doctor.mjs", content: delegatingScript("doctor"), ownership: "seeded", executable: true },
  );

  return specs;
}
