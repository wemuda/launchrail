import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emptyLockfile, type Lockfile } from "../src/lib/lockfile.js";
import { applyPlan, planWrites, type FileSpec } from "../src/lib/writer.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
let lockfile: Lockfile;

beforeEach(() => {
  tmp = makeTmpDir();
  lockfile = emptyLockfile("0.0.0-test");
});
afterEach(() => tmp.cleanup());

const seeded = (content = "seeded v1\n"): FileSpec => ({
  relPath: "docs/seeded.md",
  content,
  ownership: "seeded",
});
const managed = (content = "managed v1\n"): FileSpec => ({
  relPath: ".launchrail/managed.md",
  content,
  ownership: "managed",
});

describe("safe writer", () => {
  test("creates new files and records checksums", () => {
    const plan = planWrites(tmp.root, [seeded(), managed()], lockfile);
    expect(plan.map((a) => a.kind)).toEqual(["create", "create"]);
    const written = applyPlan(tmp.root, plan, lockfile);
    expect(written).toHaveLength(2);
    expect(readFileSync(join(tmp.root, "docs/seeded.md"), "utf8")).toBe("seeded v1\n");
    expect(Object.keys(lockfile.files)).toHaveLength(2);
  });

  test("is idempotent: unchanged content plans no writes", () => {
    applyPlan(tmp.root, planWrites(tmp.root, [seeded(), managed()], lockfile), lockfile);
    const plan = planWrites(tmp.root, [seeded(), managed()], lockfile);
    expect(plan.map((a) => a.kind)).toEqual(["skip-unchanged", "skip-unchanged"]);
    expect(applyPlan(tmp.root, plan, lockfile)).toHaveLength(0);
  });

  test("never overwrites an existing seeded file", () => {
    const abs = join(tmp.root, "docs/seeded.md");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "user content\n");
    const plan = planWrites(tmp.root, [seeded()], lockfile);
    expect(plan[0]?.kind).toBe("skip-seeded-exists");
    applyPlan(tmp.root, plan, lockfile);
    expect(readFileSync(abs, "utf8")).toBe("user content\n");
  });

  test("updates an unmodified managed file", () => {
    applyPlan(tmp.root, planWrites(tmp.root, [managed()], lockfile), lockfile);
    const plan = planWrites(tmp.root, [managed("managed v2\n")], lockfile);
    expect(plan[0]?.kind).toBe("update");
    applyPlan(tmp.root, plan, lockfile);
    expect(readFileSync(join(tmp.root, ".launchrail/managed.md"), "utf8")).toBe("managed v2\n");
  });

  test("refuses to overwrite a locally modified managed file", () => {
    applyPlan(tmp.root, planWrites(tmp.root, [managed()], lockfile), lockfile);
    const abs = join(tmp.root, ".launchrail/managed.md");
    writeFileSync(abs, "local edits\n");
    const plan = planWrites(tmp.root, [managed("managed v2\n")], lockfile);
    expect(plan[0]?.kind).toBe("conflict");
    applyPlan(tmp.root, plan, lockfile);
    expect(readFileSync(abs, "utf8")).toBe("local edits\n");
  });

  test("planning alone touches nothing on disk", () => {
    planWrites(tmp.root, [seeded(), managed()], lockfile);
    expect(existsSync(join(tmp.root, "docs"))).toBe(false);
    expect(existsSync(join(tmp.root, ".launchrail"))).toBe(false);
  });
});
