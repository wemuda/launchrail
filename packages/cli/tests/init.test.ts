import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runInit } from "../src/commands/init.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

const EXPECTED_FILES = [
  ".launchrail.yml",
  ".launchrail-lock.json",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/adr/0000-template.md",
  ".launchrail/CLAUDE.generated.md",
  ".claude/settings.json",
];

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpRepo();
});
afterEach(() => tmp.cleanup());

describe("launchrail init", () => {
  test("initializes a blank git repo with defaults", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    for (const file of EXPECTED_FILES) {
      expect(existsSync(join(tmp.root, file)), file).toBe(true);
    }
    const agents = readFileSync(join(tmp.root, "AGENTS.md"), "utf8");
    expect(agents).toContain("Conventional Commits");
    const claude = readFileSync(join(tmp.root, "CLAUDE.md"), "utf8");
    expect(claude).toContain("@AGENTS.md");
    expect(claude).toContain("@.launchrail/CLAUDE.generated.md");
  });

  test("re-running is a no-op (idempotent)", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const lockBefore = readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8");
    const second = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(second.code).toBe(0);
    expect(second.actions.every((a) => a.kind === "skip-unchanged")).toBe(true);
    expect(second.settings.kind).toBe("skip-declared");
    expect(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8")).toBe(lockBefore);
  });

  test("preserves an existing AGENTS.md", async () => {
    writeFileSync(join(tmp.root, "AGENTS.md"), "# My precious contract\n");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(readFileSync(join(tmp.root, "AGENTS.md"), "utf8")).toBe("# My precious contract\n");
    const action = outcome.actions.find((a) => a.spec.relPath === "AGENTS.md");
    expect(action?.kind).toBe("skip-seeded-exists");
  });

  test("dry run writes nothing", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: true, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.actions.length).toBeGreaterThan(0);
    for (const file of EXPECTED_FILES) {
      expect(existsSync(join(tmp.root, file)), file).toBe(false);
    }
  });

  test("respects an existing manifest's configuration", async () => {
    writeFileSync(
      join(tmp.root, ".launchrail.yml"),
      "schemaVersion: 1\nmode: spike\nconventions:\n  conventionalCommits: false\n",
    );
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(readFileSync(join(tmp.root, "AGENTS.md"), "utf8")).not.toContain("Conventional Commits");
    const lock = JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8"));
    expect(lock.decisions.mode).toBe("spike");
  });

  test("ends with the Claude Code handoff (plugin approval + /launchrail:launch)", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      lines.push(args.join(" "));
    });
    try {
      const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
      expect(outcome.code).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const output = lines.join("\n");
    expect(output).toContain("claude plugin marketplace add wemuda/launchrail");
    expect(output).toContain("/launchrail:launch");
    expect(output).not.toContain("fill in the TODO");
  });

  test("fails cleanly on an invalid manifest", async () => {
    writeFileSync(join(tmp.root, ".launchrail.yml"), "schemaVersion: 7\nmode: nonsense\n");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(1);
    expect(existsSync(join(tmp.root, "AGENTS.md"))).toBe(false);
  });
});
