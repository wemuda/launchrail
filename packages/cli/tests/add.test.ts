import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runInit } from "../src/commands/init.js";
import { parseManifest } from "../src/lib/manifest.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

const SEEDED_FILES = [
  ".mcp.json",
  "playwright.config.ts",
  "tests/e2e/smoke.spec.ts",
  "docs/testing/smoke-journeys.md",
  "scripts/setup.mjs",
  "scripts/dev.mjs",
  "scripts/verify.mjs",
  "scripts/smoke.mjs",
  "scripts/doctor.mjs",
];

let tmp: TmpRepo;
beforeEach(async () => {
  tmp = makeTmpRepo();
  await runInit({ cwd: tmp.root, dryRun: false, yes: true });
});
afterEach(() => tmp.cleanup());

function addBrowserTesting(overrides: Partial<Parameters<typeof runAdd>[0]> = {}) {
  return runAdd({ cwd: tmp.root, module: "browser-testing", dryRun: false, yes: true, ...overrides });
}

describe("launchrail add browser-testing", () => {
  test("seeds the module files and updates the manifest", async () => {
    const outcome = await addBrowserTesting();
    expect(outcome.code).toBe(0);
    for (const file of SEEDED_FILES) {
      expect(existsSync(join(tmp.root, file)), file).toBe(true);
    }
    const mcp = JSON.parse(readFileSync(join(tmp.root, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers.playwright.args).toContain("@playwright/mcp@latest");
    const parsed = parseManifest(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8"));
    expect(parsed.manifest?.modules["browser-testing"]).toBe(true);
    expect(parsed.manifest?.testing.appUrl).toBe("http://localhost:3000");
    expect(parsed.manifest?.testing.e2eCommand).toBe("npx playwright test");
    expect(parsed.manifest?.testing.smokeCommand).toBe("node scripts/smoke.mjs");
  });

  test("regenerates the managed Claude instructions with a browser-testing section", async () => {
    await addBrowserTesting();
    const generated = readFileSync(join(tmp.root, ".launchrail/CLAUDE.generated.md"), "utf8");
    expect(generated).toContain("## Browser testing");
    expect(generated).toContain("smoke-journeys.md");
  });

  test("tracks seeded files in the lockfile and records decisions", async () => {
    await addBrowserTesting();
    const lock = JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8"));
    for (const file of SEEDED_FILES) {
      expect(lock.files[file], file).toMatchObject({ class: "seeded" });
    }
    expect(lock.decisions["module:browser-testing"]).toBe(true);
    expect(lock.decisions.appUrl).toBe("http://localhost:3000");
  });

  test("marks scripts executable", async () => {
    if (process.platform === "win32") return;
    await addBrowserTesting();
    const mode = statSync(join(tmp.root, "scripts/smoke.mjs")).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  test("dry run writes nothing", async () => {
    const manifestBefore = readFileSync(join(tmp.root, ".launchrail.yml"), "utf8");
    const outcome = await addBrowserTesting({ dryRun: true });
    expect(outcome.code).toBe(0);
    for (const file of SEEDED_FILES) {
      expect(existsSync(join(tmp.root, file)), file).toBe(false);
    }
    expect(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8")).toBe(manifestBefore);
  });

  test("re-running is a no-op (idempotent)", async () => {
    await addBrowserTesting();
    const manifestBefore = readFileSync(join(tmp.root, ".launchrail.yml"), "utf8");
    const lockBefore = readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8");
    const second = await addBrowserTesting();
    expect(second.code).toBe(0);
    expect(second.actions.every((a) => a.kind === "skip-unchanged")).toBe(true);
    expect(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8")).toBe(manifestBefore);
    expect(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8")).toBe(lockBefore);
  });

  test("preserves manifest comments added by the user", async () => {
    const manifestPath = join(tmp.root, ".launchrail.yml");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8") + "# do not lose me\n");
    await addBrowserTesting();
    expect(readFileSync(manifestPath, "utf8")).toContain("# do not lose me");
  });

  test("keeps an existing Playwright setup: seeds neither config nor baseline spec", async () => {
    writeFileSync(join(tmp.root, "playwright.config.js"), "module.exports = {};\n");
    const outcome = await addBrowserTesting();
    expect(outcome.code).toBe(0);
    const planned = outcome.actions.map((a) => a.spec.relPath);
    expect(planned).not.toContain("playwright.config.ts");
    expect(planned).not.toContain("tests/e2e/smoke.spec.ts");
    expect(existsSync(join(tmp.root, "docs/testing/smoke-journeys.md"))).toBe(true);
  });

  test("never overwrites an existing smoke-journeys file", async () => {
    mkdirSync(join(tmp.root, "docs/testing"), { recursive: true });
    writeFileSync(join(tmp.root, "docs/testing/smoke-journeys.md"), "# Our journeys\n", "utf8");
    const outcome = await addBrowserTesting();
    expect(outcome.code).toBe(0);
    expect(readFileSync(join(tmp.root, "docs/testing/smoke-journeys.md"), "utf8")).toBe("# Our journeys\n");
    const action = outcome.actions.find((a) => a.spec.relPath === "docs/testing/smoke-journeys.md");
    expect(action?.kind).toBe("skip-seeded-exists");
  });

  test("never overwrites an existing .mcp.json (keeps the project's MCP servers)", async () => {
    const existing = '{\n  "mcpServers": {\n    "custom": { "command": "node", "args": ["mine.js"] }\n  }\n}\n';
    writeFileSync(join(tmp.root, ".mcp.json"), existing, "utf8");
    const outcome = await addBrowserTesting();
    expect(outcome.code).toBe(0);
    expect(readFileSync(join(tmp.root, ".mcp.json"), "utf8")).toBe(existing);
    const action = outcome.actions.find((a) => a.spec.relPath === ".mcp.json");
    expect(action?.kind).toBe("skip-seeded-exists");
  });

  test("fails without a manifest", async () => {
    const fresh = makeTmpRepo();
    try {
      const outcome = await runAdd({ cwd: fresh.root, module: "browser-testing", dryRun: false, yes: true });
      expect(outcome.code).toBe(1);
    } finally {
      fresh.cleanup();
    }
  });

  test("rejects unknown modules", async () => {
    const outcome = await runAdd({ cwd: tmp.root, module: "nonsense", dryRun: false, yes: true });
    expect(outcome.code).toBe(1);
  });
});
