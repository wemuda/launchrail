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

  test("passes the workflow skills check after init; the ralph path declares no plugin", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const checks = runDoctor(tmp.root).checks;
    expect(checks.find((c) => c.name === "workflow skills")?.status).toBe("pass");
    // The default (ralph) path vendors skills and declares no plugin at all.
    expect(checks.find((c) => c.name === "plugin declaration")).toBeUndefined();
  });

  test("warns (without failing) when a retired plugin declaration lingers", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(
      join(tmp.root, ".claude/settings.json"),
      JSON.stringify(
        {
          extraKnownMarketplaces: {
            launchrail: { source: { source: "github", repo: "wemuda/launchrail" } },
            mattpocock: { source: { source: "github", repo: "mattpocock/skills" } },
          },
          enabledPlugins: { "launchrail@launchrail": true, "mattpocock-skills@mattpocock": true },
        },
        null,
        2,
      ) + "\n",
    );
    const outcome = runDoctor(tmp.root);
    const check = outcome.checks.find((c) => c.name === "plugin declaration");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("retired");
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

// Filename-level invariants only (ADR-0031): record contents use the project's
// own format, so doctor never inspects them — and both checks warn, never fail.
describe("launchrail doctor — ADR checks", () => {
  function check(name: string) {
    return runDoctor(tmp.root).checks.find((c) => c.name === name);
  }

  test("a repo without decision records gets no ADR checks", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    // The seeded template and registry are not records.
    expect(check("adr numbering")).toBeUndefined();
    expect(check("adr registry")).toBeUndefined();
  });

  test("unique numbers and a covering index pass", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(join(tmp.root, "docs/adr/0001-use-postgres.md"), "# ADR-0001: Use Postgres\n");
    writeFileSync(
      join(tmp.root, "docs/adr/README.md"),
      "# ADR registry\n\n| [0001](0001-use-postgres.md) | Use Postgres | Accepted |\n",
    );
    expect(check("adr numbering")?.status).toBe("pass");
    expect(check("adr registry")?.status).toBe("pass");
  });

  test("warns when two records claim one number", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(join(tmp.root, "docs/adr/0001-use-postgres.md"), "# Use Postgres\n");
    writeFileSync(join(tmp.root, "docs/adr/0001-use-mysql.md"), "# Use MySQL\n");
    const numbering = check("adr numbering");
    expect(numbering?.status).toBe("warn");
    expect(numbering?.message).toContain("0001");
  });

  test("warns on records missing from the index, and on a missing registry", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeFileSync(join(tmp.root, "docs/adr/0001-use-postgres.md"), "# Use Postgres\n");
    const unindexed = check("adr registry");
    expect(unindexed?.status).toBe("warn");
    expect(unindexed?.message).toContain("0001-use-postgres.md");
    rmSync(join(tmp.root, "docs/adr/README.md"));
    const missing = check("adr registry");
    expect(missing?.status).toBe("warn");
    expect(missing?.message).toContain("launchrail sync");
  });
});
