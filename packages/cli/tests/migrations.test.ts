import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emptyLockfile, type Lockfile } from "../src/lib/lockfile.js";
import {
  applyPendingMigrations,
  MIGRATIONS,
  pendingMigrations,
  planPendingMigrations,
  type Migration,
} from "../src/lib/migrations.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
let lockfile: Lockfile;

beforeEach(() => {
  tmp = makeTmpDir();
  lockfile = emptyLockfile("0.0.0-test");
});
afterEach(() => tmp.cleanup());

const noop = (id: string, changes: string[] = []): Migration => ({
  id,
  description: `fixture ${id}`,
  plan: () => ({ changes, apply: () => {} }),
});

describe("migration engine", () => {
  test("pending migrations run in id order and exclude applied ones", () => {
    const registry = [noop("2026-03-c"), noop("2026-01-a"), noop("2026-02-b")];
    lockfile.migrations = ["2026-02-b"];
    expect(pendingMigrations(lockfile, registry).map((m) => m.id)).toEqual(["2026-01-a", "2026-03-c"]);
  });

  test("applying records each migration; a second run has nothing left", () => {
    const registry = [noop("2026-01-a", ["did a thing"]), noop("2026-02-b")];
    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, registry);
    expect(results.map((r) => r.status)).toEqual(["applied", "already-satisfied"]);
    expect(lockfile.migrations).toEqual(["2026-01-a", "2026-02-b"]);
    expect(applyPendingMigrations(ctx, registry)).toEqual([]);
  });

  test("planning is side-effect free and reports per-migration changes", () => {
    const registry = [noop("2026-01-a", ["would touch x"])];
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile }, registry);
    expect(planned).toEqual([{ id: "2026-01-a", description: "fixture 2026-01-a", changes: ["would touch x"] }]);
    expect(lockfile.migrations).toEqual([]);
  });

  test("a failure stops the run, keeps earlier results, and skips the rest", () => {
    const ran: string[] = [];
    const registry: Migration[] = [
      {
        id: "2026-01-first",
        description: "first",
        plan: () => ({ changes: ["ok"], apply: () => ran.push("first") }),
      },
      {
        id: "2026-02-explodes",
        description: "explodes",
        plan: () => ({
          changes: ["boom"],
          apply: () => {
            throw new Error("disk on fire");
          },
        }),
      },
      {
        id: "2026-03-never",
        description: "never runs",
        plan: () => ({ changes: [], apply: () => ran.push("never") }),
      },
    ];
    const results = applyPendingMigrations({ cwd: tmp.root, lockfile }, registry);
    expect(results.map((r) => r.status)).toEqual(["applied", "failed"]);
    expect(results[1]?.error).toContain("disk on fire");
    expect(ran).toEqual(["first"]);
    expect(lockfile.migrations).toEqual(["2026-01-first"]);
    // The failed migration is still pending, so a re-run resumes at it.
    expect(pendingMigrations(lockfile, registry).map((m) => m.id)).toEqual(["2026-02-explodes", "2026-03-never"]);
  });

  test("shipped registry: ids are unique and date-ordered", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  test("2026-08-plugin-declaration declares the plugin and is idempotent", () => {
    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, MIGRATIONS);
    const result = results.find((r) => r.id === "2026-08-plugin-declaration");
    expect(result?.status).toBe("applied");
    const settingsPath = join(tmp.root, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBe(true);
    // Already satisfied now: a fresh lockfile plans no changes.
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile: emptyLockfile("x") }, MIGRATIONS);
    expect(planned.find((p) => p.id === "2026-08-plugin-declaration")?.changes).toEqual([]);
  });
});
