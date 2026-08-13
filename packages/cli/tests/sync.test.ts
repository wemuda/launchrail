import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runInit } from "../src/commands/init.js";
import { runSync } from "../src/commands/sync.js";
import { sha256 } from "../src/lib/checksum.js";
import { RALPH_WORKFLOW_PATH } from "../src/lib/ralph.js";
import type { Lockfile } from "../src/lib/lockfile.js";
import type { Migration } from "../src/lib/migrations.js";
import { editLockfile, makeTmpRepo, type TmpRepo } from "./helpers.js";

const GENERATED = ".launchrail/CLAUDE.generated.md";
const OLD_CONTENT = "<!-- Managed by Launchrail v0.0.0-old. Do not edit. -->\n\n# Old workflow instructions\n";

let tmp: TmpRepo;
beforeEach(async () => {
  tmp = makeTmpRepo();
  await runInit({ cwd: tmp.root, dryRun: false, yes: true });
});
afterEach(() => tmp.cleanup());

/** Rewind the managed file and its lockfile entry to an older toolchain's output. */
function simulateOlderToolchain(): void {
  writeFileSync(join(tmp.root, GENERATED), OLD_CONTENT);
  editLockfile(tmp.root, (lock) => {
    lock.files[GENERATED] = { class: "managed", checksum: sha256(OLD_CONTENT) };
    lock.launchrailVersion = "0.0.0-old";
  });
}

function readLock(): Lockfile {
  return JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8")) as Lockfile;
}

describe("launchrail sync", () => {
  test("is a no-op on a current project", () => {
    const lockBefore = readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8");
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.actions.every((a) => a.kind === "skip-unchanged")).toBe(true);
    expect(outcome.migrations).toEqual([]);
    expect(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8")).toBe(lockBefore);
  });

  test("updates an outdated managed file that has no local modifications", () => {
    simulateOlderToolchain();
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.actions.find((a) => a.spec.relPath === GENERATED)?.kind).toBe("update");
    const content = readFileSync(join(tmp.root, GENERATED), "utf8");
    expect(content).toContain("# Launchrail workflow instructions");
    const lock = readLock();
    expect(lock.files[GENERATED]?.checksum).toBe(sha256(content));
    expect(lock.launchrailVersion).not.toBe("0.0.0-old");
  });

  test("keeps a locally modified managed file and reports the conflict", () => {
    const local = readFileSync(join(tmp.root, GENERATED), "utf8") + "\nLocal product knowledge.\n";
    writeFileSync(join(tmp.root, GENERATED), local);
    simulateUpstreamChange();
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.actions.find((a) => a.spec.relPath === GENERATED)?.kind).toBe("conflict");
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toBe(local);
  });

  test("updates an outdated managed module file (ralph workflow)", async () => {
    await runAdd({ cwd: tmp.root, module: "ralph", dryRun: false, yes: true });
    const old = "// old workflow shipped by an older toolchain\n";
    writeFileSync(join(tmp.root, RALPH_WORKFLOW_PATH), old);
    editLockfile(tmp.root, (lock) => {
      lock.files[RALPH_WORKFLOW_PATH] = { class: "managed", checksum: sha256(old) };
    });
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.actions.find((a) => a.spec.relPath === RALPH_WORKFLOW_PATH)?.kind).toBe("update");
    expect(readFileSync(join(tmp.root, RALPH_WORKFLOW_PATH), "utf8")).not.toBe(old);
  });

  test("recreates a deleted seeded file", () => {
    rmSync(join(tmp.root, "docs/adr/0000-template.md"));
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.actions.find((a) => a.spec.relPath === "docs/adr/0000-template.md")?.kind).toBe("create");
    expect(existsSync(join(tmp.root, "docs/adr/0000-template.md"))).toBe(true);
  });

  test("dry run previews without writing", () => {
    simulateOlderToolchain();
    const outcome = runSync({ cwd: tmp.root, dryRun: true });
    expect(outcome.code).toBe(0);
    expect(outcome.actions.find((a) => a.spec.relPath === GENERATED)?.kind).toBe("update");
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toBe(OLD_CONTENT);
    expect(readLock().launchrailVersion).toBe("0.0.0-old");
  });

  test("applies pending migrations and records them in the lockfile", () => {
    // A pre-ADR-0019 project still declaring the retired plugins; the vendor
    // migration has not run yet. Sync strips the declaration and records it.
    writeFileSync(
      join(tmp.root, ".claude", "settings.json"),
      JSON.stringify(
        { enabledPlugins: { "launchrail@launchrail": true, "mattpocock-skills@mattpocock": true } },
        null,
        2,
      ) + "\n",
    );
    editLockfile(tmp.root, (lock) => {
      lock.migrations = lock.migrations.filter((id) => id !== "2026-08-vendor-workflow-skills");
    });
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    const result = outcome.migrations.find((m) => m.id === "2026-08-vendor-workflow-skills");
    expect(result?.status).toBe("applied");
    const settings = JSON.parse(readFileSync(join(tmp.root, ".claude", "settings.json"), "utf8"));
    expect(settings.enabledPlugins).toBeUndefined();
    expect(readLock().migrations).toContain("2026-08-vendor-workflow-skills");
  });

  test("records an already-satisfied migration without changes", () => {
    editLockfile(tmp.root, (lock) => {
      lock.migrations = [];
    });
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    // A fresh ralph project has no retired declaration to strip: the vendor
    // migration is recorded, but as already-satisfied.
    const result = outcome.migrations.find((m) => m.id === "2026-08-vendor-workflow-skills");
    expect(result?.status).toBe("already-satisfied");
    expect(readLock().migrations).toContain("2026-08-vendor-workflow-skills");
  });

  test("wires the default loop into a pre-ADR-0018 project: manifest, workflow file, and regenerated instructions in one run", () => {
    // Rewind to a project initialized before the loop shipped with init:
    // no module flag, no workflow file, and generated instructions without
    // the Ralph section.
    const manifestPath = join(tmp.root, ".launchrail.yml");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace(/^\s*ralph: true\n/m, ""), "utf8");
    rmSync(join(tmp.root, RALPH_WORKFLOW_PATH));
    const generatedWithout = readFileSync(join(tmp.root, GENERATED), "utf8").replace(/## The Ralph loop[\s\S]*$/, "");
    writeFileSync(join(tmp.root, GENERATED), generatedWithout);
    editLockfile(tmp.root, (lock) => {
      delete lock.files[RALPH_WORKFLOW_PATH];
      lock.files[GENERATED] = { class: "managed", checksum: sha256(generatedWithout) };
      lock.migrations = lock.migrations.filter((id) => id !== "2026-08-wire-default-implementation-loop");
    });

    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    const result = outcome.migrations.find((m) => m.id === "2026-08-wire-default-implementation-loop");
    expect(result?.status).toBe("applied");
    expect(readFileSync(manifestPath, "utf8")).toContain("ralph: true");
    expect(existsSync(join(tmp.root, RALPH_WORKFLOW_PATH))).toBe(true);
    expect(readLock().files[RALPH_WORKFLOW_PATH]).toMatchObject({ class: "managed" });
    // The regenerated surface reflects the post-migration manifest in the
    // same run — the Ralph section is back without a second sync.
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toContain("## The Ralph loop");

    const second = runSync({ cwd: tmp.root, dryRun: false });
    expect(second.migrations).toEqual([]);
    expect(second.actions.every((a) => a.kind === "skip-unchanged")).toBe(true);
  });

  test("converges a pre-ADR-0020 superpowers project on Ralph: manifest field dropped, declaration removed, materials installed", () => {
    // Rewind to a project that had selected the retired superpowers loop:
    // the manifest carries the field, no ralph module or workflow file, and
    // settings.json declares the plugin Launchrail installed back then.
    const manifestPath = join(tmp.root, ".launchrail.yml");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace(/^\s*ralph: true\n/m, "") + "implementationLoop: superpowers\n",
      "utf8",
    );
    rmSync(join(tmp.root, RALPH_WORKFLOW_PATH));
    writeFileSync(
      join(tmp.root, ".claude", "settings.json"),
      JSON.stringify(
        {
          extraKnownMarketplaces: { "superpowers-dev": { source: { source: "github", repo: "obra/superpowers" } } },
          enabledPlugins: { "superpowers@superpowers-dev": true },
        },
        null,
        2,
      ) + "\n",
    );
    editLockfile(tmp.root, (lock) => {
      delete lock.files[RALPH_WORKFLOW_PATH];
      lock.migrations = lock.migrations.filter(
        (id) => id !== "2026-08-wire-default-implementation-loop" && id !== "2026-08-workflow-skills-independence",
      );
    });

    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.migrations.find((m) => m.id === "2026-08-wire-default-implementation-loop")?.status).toBe(
      "applied",
    );
    expect(outcome.migrations.find((m) => m.id === "2026-08-workflow-skills-independence")?.status).toBe("applied");
    const manifest = readFileSync(manifestPath, "utf8");
    expect(manifest).not.toContain("implementationLoop");
    expect(manifest).toContain("ralph: true");
    expect(existsSync(join(tmp.root, RALPH_WORKFLOW_PATH))).toBe(true);
    // The declaration Launchrail added for the retired loop is gone.
    const settings = JSON.parse(readFileSync(join(tmp.root, ".claude", "settings.json"), "utf8"));
    expect(settings.extraKnownMarketplaces).toBeUndefined();
    expect(settings.enabledPlugins).toBeUndefined();
  });

  test("a failing migration stops the run before files regenerate and stays recoverable", () => {
    simulateOlderToolchain();
    const registry: Migration[] = [
      {
        id: "2026-01-first",
        description: "first",
        plan: () => ({ changes: ["ok"], apply: () => {} }),
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
    ];
    const outcome = runSync({ cwd: tmp.root, dryRun: false, registry });
    expect(outcome.code).toBe(1);
    const lock = readLock();
    expect(lock.migrations).toContain("2026-01-first");
    expect(lock.migrations).not.toContain("2026-02-explodes");
    // The file surface was not regenerated after the failure.
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toBe(OLD_CONTENT);
    // Re-running with the cause fixed resumes at the failed migration and completes.
    const fixed = registry.map((m) =>
      m.id === "2026-02-explodes" ? { ...m, plan: () => ({ changes: ["ok now"], apply: () => {} }) } : m,
    );
    const second = runSync({ cwd: tmp.root, dryRun: false, registry: fixed });
    expect(second.code).toBe(0);
    expect(readLock().migrations).toContain("2026-02-explodes");
    expect(readFileSync(join(tmp.root, GENERATED), "utf8")).toContain("# Launchrail workflow instructions");
  });

  test("fails with guidance when the project is not initialized", () => {
    const fresh = makeTmpRepo();
    try {
      expect(runSync({ cwd: fresh.root, dryRun: false }).code).toBe(1);
    } finally {
      fresh.cleanup();
    }
  });
});

/** Make the lockfile claim an older write so the current content counts as a local modification. */
function simulateUpstreamChange(): void {
  editLockfile(tmp.root, (lock) => {
    lock.files[GENERATED] = { class: "managed", checksum: sha256(OLD_CONTENT) };
  });
}
