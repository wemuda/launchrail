import type { PackageManager, RepoDetection } from "./detect.js";
import type { Manifest } from "./manifest.js";
import type { FileSpec } from "./writer.js";

export const BROWSER_TESTING_MODULE = "browser-testing";
export const SMOKE_JOURNEYS_PATH = "docs/testing/smoke-journeys.md";
export const SEMANTIC_SCRIPTS = ["setup", "dev", "verify", "smoke", "doctor"] as const;

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

function smokeSpec(): string {
  return `import { expect, test } from "@playwright/test";

// Seeded by Launchrail — the E2E baseline: the app starts, responds, and renders
// without console errors. Extend or replace with real journeys as they stabilize.
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

function smokeJourneysDoc(): string {
  return `# Smoke journeys

Seeded by Launchrail — this file is yours. It is the smoke-journey contract: the
concrete user journeys an agent drives through the real app in a browser before
user-facing work counts as done.

- Every ticket that changes user-facing behavior adds or updates a journey here
  (or defines one in the ticket itself).
- Each journey heading starts with \`## Journey:\` so tools can list them —
  \`npx @wemuda/launchrail smoke\` scaffolds an evidence bundle from this file.
- Agentic smoke testing supplements deterministic tests; it never replaces them.
  When a smoke run finds a real bug: record the reproduction, add a failing
  deterministic test, fix the bug, prove the test passes, re-run the journey.

Every journey is verified against the standard checks plus its own list:

- No uncaught console errors
- No failed API requests
- The success state is visible
- Data remains after refresh

## Journey: App loads

- startAt: /
- actor: anonymous

Steps:

1. Open the app root.
2. Confirm the main content renders.

Verify:

- The page shows meaningful content, not an error screen.
`;
}

/**
 * A project-scoped Playwright MCP server so the `browser-smoke` skill can drive
 * the app agentically (click/type/navigate, watch console + network) instead of
 * only running fixed specs — the skill already looks for "Playwright MCP ...
 * whichever is available". Deliberately app-agnostic: the agent supplies URLs at
 * run time, so no hardcoded origins. `--isolated` keeps it profile-less, which is
 * what a fresh clone / CI / cloud session wants. It is a convenience, never a hard
 * dependency — where no MCP is available the seeded Playwright scripts still run
 * headless (ADR-0004).
 */
function mcpConfig(): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["-y", "@playwright/mcp@latest", "--isolated"],
          },
        },
      },
      null,
      2,
    ) + "\n"
  );
}

const ADD_PLAYWRIGHT_DEP: Record<PackageManager, string> = {
  pnpm: "pnpm add -D @playwright/test",
  yarn: "yarn add -D @playwright/test",
  bun: "bun add -d @playwright/test",
  npm: "npm install -D @playwright/test",
};

function setupScript(pm: PackageManager): string {
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
  run("${ADD_PLAYWRIGHT_DEP[pm]}");
}
// Cloud and CI machines need browser OS dependencies; local machines usually have them.
run(cloud ? "npx playwright install --with-deps chromium" : "npx playwright install chromium");
console.log("\\nSetup complete. Next: node scripts/doctor.mjs");
`;
}

function devScript(devCommand: string | null): string {
  return `#!/usr/bin/env node
// Seeded by Launchrail — yours to adapt. Starts the app for development and testing.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";

const DEV_COMMAND = ${JSON.stringify(devCommand ?? "")};
if (DEV_COMMAND === "") {
  console.error("No dev command configured. Edit scripts/dev.mjs and set DEV_COMMAND to whatever starts this app.");
  process.exit(1);
}

if (process.argv.includes("--background")) {
  // Cloud and CI sessions need the app running without holding the terminal.
  mkdirSync(".launchrail/state", { recursive: true });
  const log = openSync(".launchrail/state/dev.log", "a");
  const child = spawn(DEV_COMMAND, { shell: true, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  console.log("Started \`" + DEV_COMMAND + "\` in the background (pid " + child.pid + "). Logs: .launchrail/state/dev.log");
} else {
  const result = spawnSync(DEV_COMMAND, { shell: true, stdio: "inherit" });
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
 * project already has an E2E layer — keep it, seed neither config nor baseline.
 */
export function browserTestingFiles(ctx: BrowserTestingContext): FileSpec[] {
  const pm = ctx.detection.packageManager ?? "npm";
  const specs: FileSpec[] = [];

  if (!ctx.detection.playwrightConfigFile) {
    specs.push(
      { relPath: "playwright.config.ts", content: playwrightConfig(ctx.manifest), ownership: "seeded" },
      { relPath: "tests/e2e/smoke.spec.ts", content: smokeSpec(), ownership: "seeded" },
    );
  }

  specs.push(
    { relPath: ".mcp.json", content: mcpConfig(), ownership: "seeded" },
    { relPath: SMOKE_JOURNEYS_PATH, content: smokeJourneysDoc(), ownership: "seeded" },
    { relPath: "scripts/setup.mjs", content: setupScript(pm), ownership: "seeded", executable: true },
    { relPath: "scripts/dev.mjs", content: devScript(ctx.manifest.testing.devCommand), ownership: "seeded", executable: true },
    { relPath: "scripts/verify.mjs", content: delegatingScript("verify"), ownership: "seeded", executable: true },
    { relPath: "scripts/smoke.mjs", content: delegatingScript("smoke"), ownership: "seeded", executable: true },
    { relPath: "scripts/doctor.mjs", content: delegatingScript("doctor"), ownership: "seeded", executable: true },
  );

  return specs;
}
