import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpRepo();
});
afterEach(() => tmp.cleanup());

describe("launchrail doctor", () => {
  test("healthy after init", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(outcome.code).toBe(0);
  });

  test("fails in an uninitialized repository", () => {
    const outcome = runDoctor(tmp.root);
    expect(outcome.code).toBe(1);
    const failures = outcome.checks.filter((c) => c.status === "fail").map((c) => c.name);
    expect(failures).toContain("manifest");
    expect(failures).toContain("lockfile");
  });

  test("warns about drift in a modified managed file", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(join(tmp.root, ".launchrail/CLAUDE.generated.md"), "tampered\n");
    const outcome = runDoctor(tmp.root);
    expect(outcome.code).toBe(0);
    const drift = outcome.checks.find((c) => c.name === "managed drift");
    expect(drift?.status).toBe("warn");
    expect(drift?.message).toContain("CLAUDE.generated.md");
  });

  test("fails when a tracked managed file is deleted", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    rmSync(join(tmp.root, ".launchrail/CLAUDE.generated.md"));
    const outcome = runDoctor(tmp.root);
    expect(outcome.code).toBe(1);
    expect(outcome.checks.some((c) => c.status === "fail" && c.name === "managed file")).toBe(true);
  });

  test("warns when CLAUDE.md lacks the AGENTS.md import", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(join(tmp.root, "CLAUDE.md"), "# Custom claude file\n");
    const outcome = runDoctor(tmp.root);
    const check = outcome.checks.find((c) => c.name === "CLAUDE.md");
    expect(check?.status).toBe("warn");
  });

  test("warns when CLAUDE.md imports the contract but not the workflow instructions", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    // The silent failure: contract imported, but the managed workflow file is orphaned.
    writeFileSync(join(tmp.root, "CLAUDE.md"), "@AGENTS.md\n\n# mine\n");
    const check = runDoctor(tmp.root).checks.find((c) => c.name === "CLAUDE.md");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("@.launchrail/CLAUDE.generated.md");
  });

  test("passes the CLAUDE.md check after a normal init (both imports present)", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const check = runDoctor(tmp.root).checks.find((c) => c.name === "CLAUDE.md");
    expect(check?.status).toBe("pass");
  });

  test("passes the plugin declaration check after init, warns without it", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(runDoctor(tmp.root).checks.find((c) => c.name === "plugin declaration")?.status).toBe("pass");
    rmSync(join(tmp.root, ".claude"), { recursive: true });
    const outcome = runDoctor(tmp.root);
    const check = outcome.checks.find((c) => c.name === "plugin declaration");
    expect(check?.status).toBe("warn");
    expect(outcome.code).toBe(0);
  });

  test("skips browser-testing checks when the module is disabled", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.some((c) => c.name === "playwright dependency")).toBe(false);
  });

  test("fails when browser-testing is enabled but Playwright is not declared", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    await runAdd({ cwd: tmp.root, module: "browser-testing", dryRun: false, yes: true });
    const outcome = runDoctor(tmp.root);
    const dep = outcome.checks.find((c) => c.name === "playwright dependency");
    expect(dep?.status).toBe("fail");
    expect(outcome.checks.find((c) => c.name === "playwright config")?.status).toBe("pass");
    expect(outcome.checks.find((c) => c.name === "smoke journeys")?.status).toBe("pass");
    expect(outcome.checks.find((c) => c.name === "semantic scripts")?.status).toBe("pass");
    expect(outcome.checks.find((c) => c.name === "testing commands")?.status).toBe("pass");
  });

  test("healthy browser-testing module passes", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(
      join(tmp.root, "package.json"),
      JSON.stringify({ name: "app", devDependencies: { "@playwright/test": "^1.0.0" } }),
    );
    await runAdd({ cwd: tmp.root, module: "browser-testing", dryRun: false, yes: true });
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.filter((c) => c.status === "fail")).toEqual([]);
  });
});
