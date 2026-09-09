import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runInit } from "../src/commands/init.js";
import { parseManifest } from "../src/lib/manifest.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

const SEEDED_FILES = [
  "playwright.config.ts",
  "tests/e2e/baseline.spec.ts",
  "scripts/setup.mjs",
  "scripts/dev.mjs",
  "scripts/verify.mjs",
  "scripts/doctor.mjs",
];

/** Retired by ADR-0034 — the module must not seed any of these again. */
const RETIRED_FILES = [".mcp.json", "docs/testing/smoke-journeys.md", "scripts/smoke.mjs", "tests/e2e/smoke.spec.ts"];

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
    for (const file of RETIRED_FILES) {
      expect(existsSync(join(tmp.root, file)), file).toBe(false);
    }
    const parsed = parseManifest(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8"));
    expect(parsed.manifest?.modules["browser-testing"]).toBe(true);
    expect(parsed.manifest?.testing.appUrl).toBe("http://localhost:3000");
    expect(parsed.manifest?.testing.e2eCommand).toBe("npx playwright test");
    expect(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8")).not.toContain("smokeCommand");
  });

  test("setup installs the browser smoke's driver next to Playwright", async () => {
    await addBrowserTesting();
    const setup = readFileSync(join(tmp.root, "scripts/setup.mjs"), "utf8");
    expect(setup).toContain("@playwright/test");
    expect(setup).toContain("npx playwright install");
    expect(setup).toContain("agent-browser");
    expect(setup).toContain("npx agent-browser install");
  });

  test("dev.mjs honors --port, exposes it as PORT, and records the URL for agents", async () => {
    // A dev script that prints the port it was given stands in for the app.
    writeFileSync(
      join(tmp.root, "package.json"),
      JSON.stringify({ name: "app", scripts: { dev: "node -e \"console.log('PORT=' + process.env.PORT)\"" } }),
    );
    await addBrowserTesting();
    const output = execFileSync(process.execPath, ["scripts/dev.mjs", "--port", "4321"], {
      cwd: tmp.root,
      encoding: "utf8",
    });
    expect(output).toContain("PORT=4321");
    expect(readFileSync(join(tmp.root, ".launchrail/state/dev.url"), "utf8")).toBe("http://localhost:4321\n");
    expect(readFileSync(join(tmp.root, ".launchrail/state/.gitignore"), "utf8")).toBe("*\n");
  });

  test("regenerates the managed Claude instructions with the two-lane browser-testing section", async () => {
    await addBrowserTesting();
    const generated = readFileSync(join(tmp.root, ".launchrail/CLAUDE.generated.md"), "utf8");
    expect(generated).toContain("## Browser testing");
    expect(generated).toContain("launch-browser-smoke");
    expect(generated).toContain("agent-browser");
    expect(generated).not.toContain("smoke-journeys.md");
    expect(generated).not.toContain("artifacts/verification");
  });

  test("tracks seeded files in the lockfile and records decisions", async () => {
    await addBrowserTesting();
    const lock = JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8"));
    for (const file of SEEDED_FILES) {
      expect(lock.files[file], file).toMatchObject({ class: "seeded" });
    }
    expect(lock.decisions["module:browser-testing"]).toBe(true);
    expect(lock.decisions.appUrl).toBe("http://localhost:3000");
    expect(lock.decisions).not.toHaveProperty("smokeCommand");
  });

  test("marks scripts executable", async () => {
    if (process.platform === "win32") return;
    await addBrowserTesting();
    const mode = statSync(join(tmp.root, "scripts/dev.mjs")).mode;
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
    expect(planned).not.toContain("tests/e2e/baseline.spec.ts");
    expect(existsSync(join(tmp.root, "scripts/dev.mjs"))).toBe(true);
  });

  test("never overwrites an existing seeded script", async () => {
    await addBrowserTesting();
    writeFileSync(join(tmp.root, "scripts/dev.mjs"), "// ours\n", "utf8");
    const outcome = await addBrowserTesting();
    expect(outcome.code).toBe(0);
    expect(readFileSync(join(tmp.root, "scripts/dev.mjs"), "utf8")).toBe("// ours\n");
    const action = outcome.actions.find((a) => a.spec.relPath === "scripts/dev.mjs");
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
