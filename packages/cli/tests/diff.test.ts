import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runDiff } from "../src/commands/diff.js";
import { runInit } from "../src/commands/init.js";
import { sha256 } from "../src/lib/checksum.js";
import { formatUnifiedDiff } from "../src/lib/diff.js";
import { editLockfile, makeTmpRepo, type TmpRepo } from "./helpers.js";

describe("formatUnifiedDiff", () => {
  test("identical texts produce no diff", () => {
    expect(formatUnifiedDiff("a\nb\n", "a\nb\n")).toBe("");
  });

  test("a changed line shows as del + add with a hunk header", () => {
    const diff = formatUnifiedDiff("a\nb\nc\n", "a\nx\nc\n");
    expect(diff).toBe("@@ -1,3 +1,3 @@\n a\n-b\n+x\n c\n");
  });

  test("content added to an empty file is all additions", () => {
    const diff = formatUnifiedDiff("", "one\ntwo\n");
    expect(diff).toBe("@@ -0,0 +1,2 @@\n+one\n+two\n");
  });

  test("distant changes trim to hunks with three lines of context", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const changed = [...lines];
    changed[9] = "CHANGED";
    const diff = formatUnifiedDiff(lines.join("\n") + "\n", changed.join("\n") + "\n");
    expect(diff).toContain("@@ -7,7 +7,7 @@");
    expect(diff).toContain("-line 10");
    expect(diff).toContain("+CHANGED");
    expect(diff).not.toContain("line 1\n");
    expect(diff).not.toContain("line 20");
  });
});

describe("launchrail diff", () => {
  let tmp: TmpRepo;
  beforeEach(async () => {
    tmp = makeTmpRepo();
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
  });
  afterEach(() => tmp.cleanup());

  test("clean project has no entries", () => {
    const outcome = runDiff(tmp.root);
    expect(outcome.code).toBe(0);
    expect(outcome.entries).toEqual([]);
  });

  test("an outdated managed file previews as an update diff", () => {
    const relPath = ".launchrail/CLAUDE.generated.md";
    const old = "# Old workflow instructions\n";
    writeFileSync(join(tmp.root, relPath), old);
    editLockfile(tmp.root, (lock) => {
      lock.files[relPath] = { class: "managed", checksum: sha256(old) };
    });
    const outcome = runDiff(tmp.root);
    const entry = outcome.entries.find((e) => e.relPath === relPath);
    expect(entry?.kind).toBe("update");
    expect(entry?.diff).toContain("-# Old workflow instructions");
    expect(entry?.diff).toContain("+# Launchrail workflow instructions");
  });

  test("a deleted seeded file previews as a create diff", () => {
    rmSync(join(tmp.root, "docs/adr/0000-template.md"));
    const outcome = runDiff(tmp.root);
    const entry = outcome.entries.find((e) => e.relPath === "docs/adr/0000-template.md");
    expect(entry?.kind).toBe("create");
    expect(entry?.diff.startsWith("@@ -0,0")).toBe(true);
    expect(entry?.diff).toContain("+# ADR-NNNN");
  });

  test("fails with guidance when the project is not initialized", () => {
    const fresh = makeTmpRepo();
    try {
      const outcome = runDiff(fresh.root);
      expect(outcome.code).toBe(1);
      expect(outcome.errors[0]).toContain("launchrail init");
    } finally {
      fresh.cleanup();
    }
  });
});
