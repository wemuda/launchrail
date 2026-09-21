import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { runAdrIndex } from "../src/commands/adr.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { runSync } from "../src/commands/sync.js";
import { ADR_MAINTAINING_SECTION } from "../src/lib/adr.js";
import {
  ADR_MERGE_ATTRIBUTE_LINE,
  ADR_MERGE_DRIVER_COMMAND,
  ADR_MERGE_DRIVER_NAME,
  adrMergeDriverConfigState,
  applyAdrMergeAttribute,
  GITATTRIBUTES_FILENAME,
  planAdrMergeAttribute,
  registerAdrMergeDriver,
} from "../src/lib/adrMergeDriver.js";
import { makeTmpDir, makeTmpRepo, type TmpRepo } from "./helpers.js";

// The driver runs as a real git subprocess, so it exercises the compiled CLI.
// CI builds before testing; locally we build once if dist is missing.
const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const distEntry = join(cliRoot, "dist", "index.js");
beforeAll(() => {
  if (!existsSync(distEntry)) {
    const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
    execFileSync(process.execPath, [tsc, "-p", cliRoot], { stdio: "inherit" });
  }
}, 120_000);

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

/** Point the driver at the freshly built local CLI instead of `npx` (offline, deterministic, version-exact). */
function useLocalDriver(root: string): void {
  git(root, ["config", "--local", `merge.${ADR_MERGE_DRIVER_NAME}.name`, "launchrail adr index (test)"]);
  git(root, [
    "config",
    "--local",
    `merge.${ADR_MERGE_DRIVER_NAME}.driver`,
    `node "${distEntry}" adr merge-driver "%O" "%A" "%B" "%P"`,
  ]);
}

function writeRecord(root: string, file: string, title: string, status = "Accepted"): void {
  writeFileSync(join(root, "docs/adr", file), `# ${title}\n\n## Status\n${status}\n\n## Context\nBecause.\n`);
}

const registry = (root: string): string => readFileSync(join(root, "docs/adr/README.md"), "utf8");

describe(".gitattributes management", () => {
  let tmp: TmpRepo;
  beforeEach(() => (tmp = makeTmpDir()));
  afterEach(() => tmp.cleanup());

  test("creates .gitattributes with the merge binding when none exists", () => {
    const plan = planAdrMergeAttribute(tmp.root);
    expect(plan.kind).toBe("create");
    expect(plan.content).toBe(`${ADR_MERGE_ATTRIBUTE_LINE}\n`);
    expect(applyAdrMergeAttribute(tmp.root)).toBe(true);
    expect(readFileSync(join(tmp.root, GITATTRIBUTES_FILENAME), "utf8")).toBe(`${ADR_MERGE_ATTRIBUTE_LINE}\n`);
  });

  test("appends to an existing .gitattributes, preserving the project's own rules", () => {
    writeFileSync(join(tmp.root, GITATTRIBUTES_FILENAME), "*.png binary\n*.lockb -diff");
    expect(planAdrMergeAttribute(tmp.root).kind).toBe("append");
    applyAdrMergeAttribute(tmp.root);
    const content = readFileSync(join(tmp.root, GITATTRIBUTES_FILENAME), "utf8");
    expect(content).toContain("*.png binary");
    expect(content).toContain("*.lockb -diff");
    expect(content).toContain(ADR_MERGE_ATTRIBUTE_LINE);
    expect(content.endsWith("\n")).toBe(true);
  });

  test("is idempotent — a second apply writes nothing", () => {
    applyAdrMergeAttribute(tmp.root);
    expect(planAdrMergeAttribute(tmp.root).kind).toBe("present");
    expect(applyAdrMergeAttribute(tmp.root)).toBe(false);
  });
});

describe("merge driver git-config registration", () => {
  test("registers in a git repo, is idempotent, and corrects a mismatch", () => {
    const tmp = makeTmpRepo();
    try {
      expect(adrMergeDriverConfigState(tmp.root)).toBe("unregistered");
      expect(registerAdrMergeDriver(tmp.root)).toBe(true);
      expect(adrMergeDriverConfigState(tmp.root)).toBe("registered");
      expect(git(tmp.root, ["config", "--local", "--get", `merge.${ADR_MERGE_DRIVER_NAME}.driver`]).trim()).toBe(
        ADR_MERGE_DRIVER_COMMAND,
      );
      // Idempotent.
      expect(registerAdrMergeDriver(tmp.root)).toBe(false);
      // A stale/hand-edited definition is a mismatch, and gets corrected.
      git(tmp.root, ["config", "--local", `merge.${ADR_MERGE_DRIVER_NAME}.driver`, "old-command %A"]);
      expect(adrMergeDriverConfigState(tmp.root)).toBe("mismatch");
      expect(registerAdrMergeDriver(tmp.root)).toBe(true);
      expect(adrMergeDriverConfigState(tmp.root)).toBe("registered");
    } finally {
      tmp.cleanup();
    }
  });

  test("is a safe no-op outside a git repository", () => {
    const tmp = makeTmpDir();
    try {
      expect(adrMergeDriverConfigState(tmp.root)).toBe("not-git");
      expect(registerAdrMergeDriver(tmp.root)).toBe(false);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("init / sync / doctor install the driver", () => {
  let tmp: TmpRepo;
  beforeEach(() => (tmp = makeTmpRepo()));
  afterEach(() => tmp.cleanup());

  test("init writes the .gitattributes binding, registers the driver, and seeds the how/why", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(readFileSync(join(tmp.root, GITATTRIBUTES_FILENAME), "utf8")).toContain(ADR_MERGE_ATTRIBUTE_LINE);
    expect(adrMergeDriverConfigState(tmp.root)).toBe("registered");
    // The seeded registry explains the driver and the manual fallback.
    expect(ADR_MAINTAINING_SECTION).toContain("git merge driver");
    expect(registry(tmp.root)).toContain("git merge driver");
  });

  test("doctor repairs the per-clone driver on a fresh clone (config gone, binding committed)", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    // Simulate a fresh clone: the committed .gitattributes is present, but the
    // per-clone git config that defines the driver is not.
    git(tmp.root, ["config", "--local", "--unset", `merge.${ADR_MERGE_DRIVER_NAME}.driver`]);
    expect(adrMergeDriverConfigState(tmp.root)).toBe("unregistered");
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(adrMergeDriverConfigState(tmp.root)).toBe("registered");
    expect(outcome.checks.find((c) => c.name === "adr merge driver")?.status).toBe("pass");
    expect(outcome.checks.find((c) => c.name === "adr merge driver config")?.status).toBe("pass");
  });

  test("sync adds the binding to a repo initialized before the feature and registers the driver", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    // Roll the repo back to "before the driver": drop the attribute and its
    // migration record, and clear the per-clone config.
    writeFileSync(join(tmp.root, GITATTRIBUTES_FILENAME), "*.png binary\n");
    editMigrations(tmp.root);
    git(tmp.root, ["config", "--local", "--unset", `merge.${ADR_MERGE_DRIVER_NAME}.driver`]);

    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.migrations.find((m) => m.id === "2026-09-adr-index-merge-driver")?.status).toBe("applied");
    const attrs = readFileSync(join(tmp.root, GITATTRIBUTES_FILENAME), "utf8");
    expect(attrs).toContain("*.png binary"); // the project's own rule is kept
    expect(attrs).toContain(ADR_MERGE_ATTRIBUTE_LINE);
    expect(adrMergeDriverConfigState(tmp.root)).toBe("registered");
  });
});

/** Drop the merge-driver migration id from the lockfile so sync re-runs it. */
function editMigrations(root: string): void {
  const path = join(root, ".launchrail-lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8")) as { migrations: string[] };
  lock.migrations = lock.migrations.filter((id) => id !== "2026-09-adr-index-merge-driver");
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n");
}

/**
 * Seed a Launchrail repo with a base ADR, then two divergent branches that each
 * add a record and regenerate the index. `relation` makes the second branch's
 * record supersede the base record (and re-status it) — the case that only a
 * true regeneration from the merged corpus resolves correctly.
 */
async function twoParallelAdrBranches(root: string, { relation = false } = {}): Promise<void> {
  await runInit({ cwd: root, dryRun: false, yes: true });
  useLocalDriver(root);
  writeRecord(root, "2026-01-00-base-record.md", "Base record");
  runAdrIndex({ cwd: root, check: false });
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "chore: base ADR"]);

  git(root, ["checkout", "-q", "-b", "feature-a"]);
  writeRecord(root, "2026-01-01-aaa-test.md", "Record Aaa");
  runAdrIndex({ cwd: root, check: false });
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "docs: add aaa"]);

  git(root, ["checkout", "-q", "master"]);
  git(root, ["checkout", "-q", "-b", "feature-b"]);
  writeRecord(
    root,
    "2026-01-01-bbb-test.md",
    "Record Bbb",
    relation ? "Accepted — supersedes [base-record](2026-01-00-base-record.md)" : "Accepted",
  );
  if (relation) {
    writeRecord(root, "2026-01-00-base-record.md", "Base record", "Superseded by [bbb-test](2026-01-01-bbb-test.md)");
  }
  runAdrIndex({ cwd: root, check: false });
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "docs: add bbb"]);

  git(root, ["checkout", "-q", "feature-a"]);
}

function expectCleanMergedIndex(root: string): void {
  const readme = registry(root);
  expect(readme).not.toContain("<<<<<<<");
  expect(readme).not.toContain(">>>>>>>");
  expect(readme).toContain("2026-01-00-base-record.md");
  expect(readme).toContain("2026-01-01-aaa-test.md");
  expect(readme).toContain("2026-01-01-bbb-test.md");
  // Rows are in canonical (date-sorted) order.
  expect(readme.indexOf("2026-01-00-base-record.md")).toBeLessThan(readme.indexOf("2026-01-01-aaa-test.md"));
  expect(readme.indexOf("2026-01-01-aaa-test.md")).toBeLessThan(readme.indexOf("2026-01-01-bbb-test.md"));
  // The whole point: the driver's output has no drift from `adr index`.
  expect(runAdrIndex({ cwd: root, check: true }).result).toBe("current");
  // Prose outside the table is preserved.
  expect(readme).toContain("## The live picture");
}

describe("end-to-end: parallel ADRs merge without a hand-resolved index", () => {
  let tmp: TmpRepo;
  beforeEach(() => (tmp = makeTmpRepo()));
  afterEach(() => tmp.cleanup());

  test("git merge auto-resolves the index, both rows present, no drift", async () => {
    await twoParallelAdrBranches(tmp.root);
    const output = git(tmp.root, ["merge", "--no-edit", "feature-b"]);
    expect(output).not.toContain("CONFLICT");
    expectCleanMergedIndex(tmp.root);
  });

  test("git rebase auto-resolves the index, both rows present, no drift", async () => {
    await twoParallelAdrBranches(tmp.root);
    git(tmp.root, ["rebase", "feature-b"]); // throws if it stops on a conflict
    expectCleanMergedIndex(tmp.root);
  });

  test("a new ADR that supersedes and re-statuses an existing one still resolves and re-statuses correctly", async () => {
    await twoParallelAdrBranches(tmp.root, { relation: true });
    git(tmp.root, ["merge", "--no-edit", "feature-b"]);
    expectCleanMergedIndex(tmp.root);
    // The base record's cell reflects the merged corpus: superseded by bbb.
    expect(registry(tmp.root)).toContain("**Superseded by [bbb-test](2026-01-01-bbb-test.md)**");
  });

  test("without the driver registered, the same merge conflicts — proving the driver does the work", async () => {
    await twoParallelAdrBranches(tmp.root);
    // Simulate a clone that never ran setup/doctor: binding committed, no driver.
    git(tmp.root, ["config", "--local", "--unset", `merge.${ADR_MERGE_DRIVER_NAME}.driver`]);
    let conflicted = false;
    try {
      git(tmp.root, ["merge", "--no-edit", "feature-b"]);
    } catch {
      conflicted = true;
    }
    expect(conflicted).toBe(true);
    expect(registry(tmp.root)).toContain("<<<<<<<");
    // And the documented manual fallback resolves it.
    git(tmp.root, ["merge", "--abort"]);
  });
});
