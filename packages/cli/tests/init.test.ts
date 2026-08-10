import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runInit } from "../src/commands/init.js";
import { makeTmpDir, makeTmpRepo, type TmpRepo } from "./helpers.js";

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

  test("wires the workflow imports into an existing CLAUDE.md, preserving its content", async () => {
    // A mid-development project already using AI almost always has a CLAUDE.md.
    // It is never overwritten — but init must additively wire in the two
    // @-imports, or the managed workflow instructions are orphaned.
    writeFileSync(join(tmp.root, "CLAUDE.md"), "# My existing Claude setup\n\nAlways run the tests.\n");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.claudeImports.kind).toBe("merge");
    expect(outcome.claudeImports.added).toEqual(["@AGENTS.md", "@.launchrail/CLAUDE.generated.md"]);
    // The CLAUDE.md action itself is still a keep — the writer never overwrites it.
    expect(outcome.actions.find((a) => a.spec.relPath === "CLAUDE.md")?.kind).toBe("skip-seeded-exists");
    const claude = readFileSync(join(tmp.root, "CLAUDE.md"), "utf8");
    expect(claude).toContain("@AGENTS.md");
    expect(claude).toContain("@.launchrail/CLAUDE.generated.md");
    expect(claude).toContain("# My existing Claude setup");
    expect(claude).toContain("Always run the tests.");
  });

  test("adds only the missing import when CLAUDE.md already imports the contract", async () => {
    writeFileSync(join(tmp.root, "CLAUDE.md"), "@AGENTS.md\n\n# House rules\n");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.claudeImports.added).toEqual(["@.launchrail/CLAUDE.generated.md"]);
    const claude = readFileSync(join(tmp.root, "CLAUDE.md"), "utf8");
    // @AGENTS.md is not duplicated.
    expect(claude.match(/^@AGENTS\.md$/gm)).toHaveLength(1);
    expect(claude).toContain("@.launchrail/CLAUDE.generated.md");
    expect(claude).toContain("# House rules");
  });

  test("re-adopting is idempotent — a CLAUDE.md that already imports both is left untouched", async () => {
    writeFileSync(
      join(tmp.root, "CLAUDE.md"),
      "@AGENTS.md\n@.launchrail/CLAUDE.generated.md\n\n# mine\n",
    );
    const first = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(first.claudeImports.kind).toBe("ok");
    const before = readFileSync(join(tmp.root, "CLAUDE.md"), "utf8");
    const second = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(second.claudeImports.kind).toBe("ok");
    expect(readFileSync(join(tmp.root, "CLAUDE.md"), "utf8")).toBe(before);
  });

  test("dry run plans the CLAUDE.md import wiring but writes nothing", async () => {
    writeFileSync(join(tmp.root, "CLAUDE.md"), "# mine\n");
    const outcome = await runInit({ cwd: tmp.root, dryRun: true, yes: true });
    expect(outcome.claudeImports.kind).toBe("merge");
    expect(readFileSync(join(tmp.root, "CLAUDE.md"), "utf8")).toBe("# mine\n");
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

  test("runs git init in a directory that is not a repository", async () => {
    const plain = makeTmpDir();
    try {
      const outcome = await runInit({ cwd: plain.root, dryRun: false, yes: true });
      expect(outcome.code).toBe(0);
      expect(existsSync(join(plain.root, ".git"))).toBe(true);
    } finally {
      plain.cleanup();
    }
  });

  test("dry run plans git init but does not run it", async () => {
    const plain = makeTmpDir();
    try {
      const outcome = await runInit({ cwd: plain.root, dryRun: true, yes: true });
      expect(outcome.code).toBe(0);
      expect(existsSync(join(plain.root, ".git"))).toBe(false);
    } finally {
      plain.cleanup();
    }
  });

  test("fails cleanly on an invalid manifest", async () => {
    writeFileSync(join(tmp.root, ".launchrail.yml"), "schemaVersion: 7\nmode: nonsense\n");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(1);
    expect(existsSync(join(tmp.root, "AGENTS.md"))).toBe(false);
  });
});
