import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runEject } from "../src/commands/eject.js";
import { runInit } from "../src/commands/init.js";
import { runStatus } from "../src/commands/status.js";
import { sha256 } from "../src/lib/checksum.js";
import { editLockfile, makeTmpRepo, type TmpRepo } from "./helpers.js";

const GENERATED = ".launchrail/CLAUDE.generated.md";

let tmp: TmpRepo;
beforeEach(async () => {
  tmp = makeTmpRepo();
  await runInit({ cwd: tmp.root, dryRun: false, yes: true });
});
afterEach(() => tmp.cleanup());

describe("launchrail status", () => {
  test("clean project: everything up to date, no pending migrations", () => {
    const report = runStatus(tmp.root);
    expect(report.code).toBe(0);
    expect(report.modules).toContain("core");
    expect(report.actions.every((a) => a.kind === "skip-unchanged")).toBe(true);
    expect(report.pendingMigrationIds).toEqual([]);
    expect(report.advisories).toEqual([]);
    expect(report.ejected).toEqual([]);
  });

  test("reports an available update for an unmodified managed file", () => {
    const old = "# Old workflow instructions\n";
    writeFileSync(join(tmp.root, GENERATED), old);
    editLockfile(tmp.root, (lock) => {
      lock.files[GENERATED] = { class: "managed", checksum: sha256(old) };
    });
    const report = runStatus(tmp.root);
    expect(report.actions.find((a) => a.spec.relPath === GENERATED)?.kind).toBe("update");
  });

  test("reports a locally modified managed file as a conflict", () => {
    const local = readFileSync(join(tmp.root, GENERATED), "utf8") + "\nLocal note.\n";
    writeFileSync(join(tmp.root, GENERATED), local);
    const report = runStatus(tmp.root);
    expect(report.actions.find((a) => a.spec.relPath === GENERATED)?.kind).toBe("conflict");
  });

  test("reports a deleted seeded file as missing", () => {
    rmSync(join(tmp.root, "AGENTS.md"));
    const report = runStatus(tmp.root);
    expect(report.actions.find((a) => a.spec.relPath === "AGENTS.md")?.kind).toBe("create");
  });

  test("surfaces pending migrations", () => {
    editLockfile(tmp.root, (lock) => {
      lock.migrations = [];
    });
    const report = runStatus(tmp.root);
    expect(report.pendingMigrationIds).toContain("2026-08-plugin-declaration");
  });

  test("lists ejected files and stops planning writes for them", () => {
    runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: false });
    const report = runStatus(tmp.root);
    expect(report.ejected).toEqual([GENERATED]);
    expect(report.actions.some((a) => a.spec.relPath === GENERATED)).toBe(false);
  });

  test("fails with guidance when the project is not initialized", () => {
    const fresh = makeTmpRepo();
    try {
      const report = runStatus(fresh.root);
      expect(report.code).toBe(1);
      expect(report.errors[0]).toContain("launchrail init");
    } finally {
      fresh.cleanup();
    }
  });
});
