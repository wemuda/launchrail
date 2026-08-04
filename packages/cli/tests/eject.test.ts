import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runEject } from "../src/commands/eject.js";
import { runInit } from "../src/commands/init.js";
import { runSync } from "../src/commands/sync.js";
import type { Lockfile } from "../src/lib/lockfile.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

const GENERATED = ".launchrail/CLAUDE.generated.md";

let tmp: TmpRepo;
beforeEach(async () => {
  tmp = makeTmpRepo();
  await runInit({ cwd: tmp.root, dryRun: false, yes: true });
});
afterEach(() => tmp.cleanup());

function readLock(): Lockfile {
  return JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8")) as Lockfile;
}

describe("launchrail eject", () => {
  test("ejects a managed file and rewrites its do-not-edit header", () => {
    const outcome = runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.ejected).toEqual([GENERATED]);
    expect(readLock().files[GENERATED]?.class).toBe("ejected");
    const content = readFileSync(join(tmp.root, GENERATED), "utf8");
    expect(content.startsWith("<!-- Ejected from Launchrail management")).toBe(true);
    expect(content).not.toContain("Managed by Launchrail");
  });

  test("a locally modified managed file is ejected byte-for-byte untouched", () => {
    const local = "my own instructions now\n";
    writeFileSync(join(tmp.root, GENERATED), local);
    runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: false });
    expect(readLock().files[GENERATED]?.class).toBe("ejected");
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toBe(local);
  });

  test("an ejected path is never written again, not even after deletion", async () => {
    runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: false });
    rmSync(join(tmp.root, GENERATED));
    const sync = runSync({ cwd: tmp.root, dryRun: false });
    expect(sync.code).toBe(0);
    expect(existsSync(join(tmp.root, GENERATED))).toBe(false);
    const init = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(init.actions.find((a) => a.spec.relPath === GENERATED)?.kind).toBe("skip-ejected");
    expect(existsSync(join(tmp.root, GENERATED))).toBe(false);
  });

  test("ejecting a module ejects all of its tracked files", () => {
    const outcome = runEject({ cwd: tmp.root, target: "core", all: false, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.ejected.sort()).toEqual(
      [".launchrail/CLAUDE.generated.md", "AGENTS.md", "CLAUDE.md", "docs/adr/0000-template.md"].sort(),
    );
    const lock = readLock();
    for (const relPath of outcome.ejected) {
      expect(lock.files[relPath]?.class, relPath).toBe("ejected");
    }
  });

  test("--all is vendor mode: everything ejected, sync plans nothing", () => {
    const outcome = runEject({ cwd: tmp.root, target: null, all: true, dryRun: false });
    expect(outcome.code).toBe(0);
    const lock = readLock();
    expect(Object.values(lock.files).every((f) => f.class === "ejected")).toBe(true);
    rmSync(join(tmp.root, "docs/adr/0000-template.md"));
    const sync = runSync({ cwd: tmp.root, dryRun: false });
    expect(sync.actions).toEqual([]);
    expect(existsSync(join(tmp.root, "docs/adr/0000-template.md"))).toBe(false);
  });

  test("dry run changes nothing", () => {
    runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: true });
    expect(readLock().files[GENERATED]?.class).toBe("managed");
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toContain("Managed by Launchrail");
  });

  test("ejecting twice reports nothing left to eject", () => {
    runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: false });
    const second = runEject({ cwd: tmp.root, target: GENERATED, all: false, dryRun: false });
    expect(second.code).toBe(0);
    expect(second.ejected).toEqual([]);
  });

  test("rejects targets that are neither a module nor a tracked file", () => {
    expect(runEject({ cwd: tmp.root, target: "nonsense", all: false, dryRun: false }).code).toBe(1);
    expect(runEject({ cwd: tmp.root, target: null, all: false, dryRun: false }).code).toBe(1);
  });
});
