import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { sha256 } from "../src/lib/checksum.js";
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

  test("2026-08-vendor-workflow-skills strips a retired plugin declaration and is idempotent", () => {
    // A pre-ADR-0019 project that still declares the retired launchrail/mattpocock plugins.
    mkdirSync(join(tmp.root, ".claude"), { recursive: true });
    const settingsPath = join(tmp.root, ".claude", "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          extraKnownMarketplaces: { launchrail: { source: { source: "github", repo: "wemuda/launchrail" } } },
          enabledPlugins: { "launchrail@launchrail": true, "mattpocock-skills@mattpocock": true },
        },
        null,
        2,
      ) + "\n",
    );
    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, MIGRATIONS);
    const result = results.find((r) => r.id === "2026-08-vendor-workflow-skills");
    expect(result?.status).toBe("applied");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.enabledPlugins).toBeUndefined();
    expect(settings.extraKnownMarketplaces).toBeUndefined();
    // Idempotent: with nothing left to strip, a fresh lockfile plans no changes.
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile: emptyLockfile("x") }, MIGRATIONS);
    expect(planned.find((p) => p.id === "2026-08-vendor-workflow-skills")?.changes).toEqual([]);
  });

  test("2026-08-remove-project-mode drops the retired mode key, preserving comments, and is idempotent", () => {
    const manifestPath = join(tmp.root, ".launchrail.yml");
    writeFileSync(
      manifestPath,
      "# my precious comment\nschemaVersion: 1\nmode: high-rigor\norigin: existing # keep this\n",
    );
    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, MIGRATIONS);
    expect(results.find((r) => r.id === "2026-08-remove-project-mode")?.status).toBe("applied");
    const migrated = readFileSync(manifestPath, "utf8");
    expect(migrated).not.toContain("mode:");
    expect(migrated).toContain("# my precious comment");
    expect(migrated).toContain("origin: existing # keep this");
    // Idempotent: with the key gone, a fresh lockfile plans no changes.
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile: emptyLockfile("x") }, MIGRATIONS);
    expect(planned.find((p) => p.id === "2026-08-remove-project-mode")?.changes).toEqual([]);
  });

  const RALPH_MANIFEST = [
    "schemaVersion: 1",
    "mode: standard-mvp",
    "issueTracker: github",
    "conventions:",
    "  conventionalCommits: true",
    "testing:",
    "  unitCommand: npm test",
    "  devCommand: null",
    "  e2eCommand: null",
    "  smokeCommand: null",
    "  appUrl: null",
    "modules:",
    "  core: true",
    "  ralph: true",
    "",
  ].join("\n");

  test("2026-08-ralph-permission-guard registers the guard hook for a ralph project and is idempotent", () => {
    writeFileSync(join(tmp.root, ".launchrail.yml"), RALPH_MANIFEST);
    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, MIGRATIONS);
    expect(results.find((r) => r.id === "2026-08-ralph-permission-guard")?.status).toBe("applied");
    const settings = JSON.parse(readFileSync(join(tmp.root, ".claude", "settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Workflow");
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("ralph-permission-guard.py");
    // Idempotent: the registration is detected, so a fresh lockfile plans no changes.
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile: emptyLockfile("x") }, MIGRATIONS);
    expect(planned.find((p) => p.id === "2026-08-ralph-permission-guard")?.changes).toEqual([]);
  });

  test("2026-08-ralph-permission-guard is a no-op without a manifest (nothing to guard)", () => {
    // Post-ADR-0020 Ralph is the implementation loop, so every *valid* manifest is
    // a Ralph project; the only no-op is the absence of a manifest to read.
    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, MIGRATIONS);
    expect(results.find((r) => r.id === "2026-08-ralph-permission-guard")?.status).toBe("already-satisfied");
    expect(existsSync(join(tmp.root, ".claude", "settings.json"))).toBe(false);
  });

  test("2026-08-workflow-skills-independence retires vendored skill files, keeping local edits", () => {
    // A pre-ADR-0020 project with the vendored snapshot on disk: one pristine
    // skill, one locally edited, plus the old attribution notice.
    const skillsDir = join(tmp.root, ".claude", "skills");
    const pristine = "---\nname: research\n---\nSpin up a background agent.\n";
    const edited = "---\nname: tdd\n---\nMy local tweaks.\n";
    mkdirSync(join(skillsDir, "research"), { recursive: true });
    mkdirSync(join(skillsDir, "tdd"), { recursive: true });
    writeFileSync(join(skillsDir, "research", "SKILL.md"), pristine);
    writeFileSync(join(skillsDir, "tdd", "SKILL.md"), edited);
    writeFileSync(join(skillsDir, "NOTICE-mattpocock.md"), "old notice\n");
    lockfile.files[".claude/skills/research/SKILL.md"] = { class: "managed", checksum: sha256(pristine) };
    lockfile.files[".claude/skills/tdd/SKILL.md"] = { class: "managed", checksum: sha256("what launchrail wrote\n") };
    lockfile.files[".claude/skills/NOTICE-mattpocock.md"] = { class: "managed", checksum: sha256("old notice\n") };

    const ctx = { cwd: tmp.root, lockfile };
    const results = applyPendingMigrations(ctx, MIGRATIONS);
    const result = results.find((r) => r.id === "2026-08-workflow-skills-independence");
    expect(result?.status).toBe("applied");
    // Pristine vendored files are deleted, emptied directories included.
    expect(existsSync(join(skillsDir, "research"))).toBe(false);
    expect(existsSync(join(skillsDir, "NOTICE-mattpocock.md"))).toBe(false);
    // A locally modified copy stays on disk but stops being managed.
    expect(readFileSync(join(skillsDir, "tdd", "SKILL.md"), "utf8")).toBe(edited);
    expect(result?.changes.join(" ")).toContain("locally modified");
    expect(lockfile.files[".claude/skills/research/SKILL.md"]).toBeUndefined();
    expect(lockfile.files[".claude/skills/tdd/SKILL.md"]).toBeUndefined();
    expect(lockfile.files[".claude/skills/NOTICE-mattpocock.md"]).toBeUndefined();
    // Idempotent: a second application plans no changes.
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile: { ...lockfile, migrations: [] } }, MIGRATIONS);
    expect(planned.find((p) => p.id === "2026-08-workflow-skills-independence")?.changes).toEqual([]);
  });
});

describe("2026-09-browser-smoke-one-off (ADR-0034)", () => {
  const ID = "2026-09-browser-smoke-one-off";
  const MANIFEST = [
    "# my precious comment",
    "schemaVersion: 1",
    "issueTracker: github",
    "testing:",
    "  unitCommand: npm test",
    "  e2eCommand: npx playwright test # keep this",
    "  smokeCommand: node scripts/smoke.mjs",
    "  appUrl: http://localhost:3000",
    "modules:",
    "  core: true",
    "  browser-testing: true",
    "",
  ].join("\n");

  function seed(relPath: string, content: string, tracked = true): void {
    const abs = join(tmp.root, relPath);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
    if (tracked) lockfile.files[relPath] = { class: "seeded", checksum: sha256(content) };
  }

  test("removes the unmodified retired seeds, keeps a modified one, and strips testing.smokeCommand", () => {
    writeFileSync(join(tmp.root, ".launchrail.yml"), MANIFEST);
    seed(".mcp.json", '{ "mcpServers": {} }\n');
    seed("scripts/smoke.mjs", "#!/usr/bin/env node\n");
    seed("docs/testing/smoke-journeys.md", "# Smoke journeys\n");
    // The project edited its journeys: the content is theirs now.
    writeFileSync(join(tmp.root, "docs/testing/smoke-journeys.md"), "# Smoke journeys\n\n## Journey: Checkout\n", "utf8");
    // A file Launchrail never wrote is not touched, tracked or not.
    seed("scripts/verify.mjs", "// still seeded\n");

    const results = applyPendingMigrations({ cwd: tmp.root, lockfile }, MIGRATIONS);
    const result = results.find((r) => r.id === ID);
    expect(result?.status).toBe("applied");
    expect(result?.changes).toEqual([
      "scripts/smoke.mjs — remove (retired seed, unmodified since Launchrail wrote it)",
      ".mcp.json — remove (retired seed, unmodified since Launchrail wrote it)",
      "docs/testing/smoke-journeys.md — locally modified; kept on disk, no longer managed",
      ".launchrail.yml — remove the retired testing.smokeCommand field",
    ]);

    expect(existsSync(join(tmp.root, ".mcp.json"))).toBe(false);
    expect(existsSync(join(tmp.root, "scripts/smoke.mjs"))).toBe(false);
    expect(readFileSync(join(tmp.root, "docs/testing/smoke-journeys.md"), "utf8")).toContain("## Journey: Checkout");
    expect(existsSync(join(tmp.root, "scripts/verify.mjs"))).toBe(true);
    expect(lockfile.files).not.toHaveProperty(".mcp.json");
    expect(lockfile.files).not.toHaveProperty("scripts/smoke.mjs");
    expect(lockfile.files).not.toHaveProperty("docs/testing/smoke-journeys.md");
    expect(lockfile.files["scripts/verify.mjs"]).toBeDefined();

    const migrated = readFileSync(join(tmp.root, ".launchrail.yml"), "utf8");
    expect(migrated).not.toContain("smokeCommand");
    expect(migrated).toContain("# my precious comment");
    expect(migrated).toContain("e2eCommand: npx playwright test # keep this");

    // Idempotent: nothing left to do for a fresh lockfile against the migrated tree.
    const planned = planPendingMigrations({ cwd: tmp.root, lockfile: emptyLockfile("x") }, MIGRATIONS);
    expect(planned.find((p) => p.id === ID)?.changes).toEqual([]);
  });

  test("clears the directory a removed journeys file leaves empty", () => {
    writeFileSync(join(tmp.root, ".launchrail.yml"), "schemaVersion: 1\nmodules:\n  core: true\n");
    seed("docs/testing/smoke-journeys.md", "# Smoke journeys\n");
    applyPendingMigrations({ cwd: tmp.root, lockfile }, MIGRATIONS);
    expect(existsSync(join(tmp.root, "docs/testing"))).toBe(false);
    expect(existsSync(join(tmp.root, "docs"))).toBe(true);
  });

  test("leaves an ejected copy and an untracked copy alone", () => {
    writeFileSync(join(tmp.root, ".launchrail.yml"), "schemaVersion: 1\nmodules:\n  core: true\n");
    seed(".mcp.json", '{ "mcpServers": {} }\n');
    lockfile.files[".mcp.json"] = { class: "ejected", checksum: lockfile.files[".mcp.json"]!.checksum };
    seed("scripts/smoke.mjs", "#!/usr/bin/env node\n", false);
    const results = applyPendingMigrations({ cwd: tmp.root, lockfile }, MIGRATIONS);
    expect(results.find((r) => r.id === ID)?.status).toBe("already-satisfied");
    expect(existsSync(join(tmp.root, ".mcp.json"))).toBe(true);
    expect(existsSync(join(tmp.root, "scripts/smoke.mjs"))).toBe(true);
    expect(lockfile.files[".mcp.json"]?.class).toBe("ejected");
  });

  test("is a no-op without a manifest", () => {
    seed(".mcp.json", '{ "mcpServers": {} }\n');
    const results = applyPendingMigrations({ cwd: tmp.root, lockfile }, MIGRATIONS);
    expect(results.find((r) => r.id === ID)?.status).toBe("already-satisfied");
    expect(existsSync(join(tmp.root, ".mcp.json"))).toBe(true);
  });
});
