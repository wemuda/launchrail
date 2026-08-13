import { existsSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "./checksum.js";
import {
  applyPluginDeclaration,
  applyRemovePluginDeclaration,
  CLAUDE_SETTINGS_PATH,
  planPluginDeclaration,
  planRemovePluginDeclaration,
  RETIRED_SUPERPOWERS_DECLARATION,
} from "./claudeSettings.js";
import type { Lockfile } from "./lockfile.js";
import { MANIFEST_FILENAME, parseManifest, removeManifestKey, setModuleEnabled } from "./manifest.js";
import { RALPH_MODULE, RALPH_WORKFLOW_PATH, ralphFiles } from "./ralph.js";
import { SKILLS_DEST_PREFIX, skillFiles } from "./skills.js";
import { applyPlan, planWrites } from "./writer.js";

export interface MigrationContext {
  cwd: string;
  lockfile: Lockfile;
}

export interface MigrationPlan {
  /** Human-readable changes this run would make; empty when already satisfied. */
  changes: string[];
  apply: () => void;
}

export interface Migration {
  /** Date-prefixed (`2026-08-plugin-declaration`), so lexicographic order is chronological order. */
  id: string;
  description: string;
  plan(ctx: MigrationContext): MigrationPlan;
}

/**
 * Every structural change ever shipped, in order. Entries must be idempotent —
 * planning against an already-migrated repository yields no changes — and every
 * migration's end state must also be produced by the current `init`, which is
 * why a fresh init stamps the whole registry as applied.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: "2026-08-plugin-declaration",
    description: `declare the Launchrail Claude plugin in ${CLAUDE_SETTINGS_PATH} (ADR-0003)`,
    plan(ctx) {
      const settings = planPluginDeclaration(ctx.cwd);
      if (settings.content === null) return { changes: [], apply: () => {} };
      return {
        changes: [`${CLAUDE_SETTINGS_PATH} — ${settings.detail}`],
        apply: () => {
          applyPluginDeclaration(ctx.cwd, settings);
        },
      };
    },
  },
  {
    id: "2026-08-upstream-plugin-declarations",
    description: `declare the upstream workflow plugins (Matt Pocock's skills) in ${CLAUDE_SETTINGS_PATH} (ADR-0011)`,
    plan(ctx) {
      // Shares the roster-driven plan: projects initialized before the roster
      // grew get the upstream declarations; anything newer is already satisfied.
      const settings = planPluginDeclaration(ctx.cwd);
      if (settings.content === null) return { changes: [], apply: () => {} };
      return {
        changes: [`${CLAUDE_SETTINGS_PATH} — ${settings.detail}`],
        apply: () => {
          applyPluginDeclaration(ctx.cwd, settings);
        },
      };
    },
  },
  {
    id: "2026-08-vendor-workflow-skills",
    description: `vendor the workflow skills as managed files under .claude/skills/ and remove the retired plugin declarations from ${CLAUDE_SETTINGS_PATH} (ADR-0019)`,
    plan(ctx) {
      // The skill files themselves flow through the regular managed-file surface
      // (sync regenerates it after migrations run); this migration only performs
      // the structural change the writer can't express — stripping the retired
      // launchrail/mattpocock declarations from a consumer's settings.json.
      const removal = planRemovePluginDeclaration(ctx.cwd);
      if (removal.content === null) return { changes: [], apply: () => {} };
      return {
        changes: [`${CLAUDE_SETTINGS_PATH} — ${removal.detail}`],
        apply: () => {
          applyRemovePluginDeclaration(ctx.cwd, removal);
        },
      };
    },
  },
  {
    id: "2026-08-wire-default-implementation-loop",
    description:
      "install the built-in implementation loop's materials when the manifest selects ralph, so /launch-implement works without `launchrail add ralph` (ADR-0018)",
    plan(ctx) {
      const none = { changes: [], apply: () => {} };
      const manifestPath = join(ctx.cwd, MANIFEST_FILENAME);
      if (!existsSync(manifestPath)) return none;
      const source = readFileSync(manifestPath, "utf8");
      const parsed = parseManifest(source);
      // An invalid manifest is sync's own precondition failure, not this
      // migration's. Ralph is the implementation loop (ADR-0020), so every
      // valid manifest gets its materials; before ADR-0020 this checked the
      // manifest's `implementationLoop` selection.
      if (!parsed.manifest) return none;

      const changes: string[] = [];
      const manifestUpdate = setModuleEnabled(source, RALPH_MODULE, {});
      if (manifestUpdate.changed) changes.push(`${MANIFEST_FILENAME} — enable the ralph module`);
      const actions = planWrites(ctx.cwd, ralphFiles(), ctx.lockfile);
      for (const action of actions) {
        if (action.kind === "create" || action.kind === "update") {
          changes.push(`${action.spec.relPath} — ${action.detail}`);
        }
        if (action.kind === "conflict") {
          changes.push(`${RALPH_WORKFLOW_PATH} — local modifications kept (eject or revert to receive updates)`);
        }
      }
      if (changes.length === 0) return none;
      return {
        changes,
        apply: () => {
          if (manifestUpdate.changed) writeFileSync(manifestPath, manifestUpdate.source, "utf8");
          applyPlan(ctx.cwd, actions, ctx.lockfile);
        },
      };
    },
  },
  {
    id: "2026-08-workflow-skills-independence",
    description:
      "retire the vendored upstream skills in favor of Launchrail's own complete launch-* set, and drop the removed implementationLoop manifest field (ADR-0020)",
    plan(ctx) {
      const changes: string[] = [];

      // 1. Skill files the surface no longer ships (the vendored bare-name
      // snapshot and its NOTICE): delete each tracked file that is unmodified
      // since Launchrail wrote it; a locally-modified copy is kept on disk and
      // handed to the project. Either way the lockfile stops tracking the
      // path. The absorbed launch-* skills arrive through the regular managed
      // surface right after migrations run — this only clears what they
      // replace.
      const current = new Set(skillFiles().map((spec) => spec.relPath));
      const removable: string[] = [];
      const keptModified: string[] = [];
      for (const [relPath, entry] of Object.entries(ctx.lockfile.files)) {
        if (!relPath.startsWith(`${SKILLS_DEST_PREFIX}/`) || entry.class === "ejected" || current.has(relPath)) {
          continue;
        }
        const abs = join(ctx.cwd, relPath);
        if (existsSync(abs) && sha256(readFileSync(abs, "utf8")) !== entry.checksum) {
          keptModified.push(relPath);
        } else {
          removable.push(relPath);
        }
      }
      if (removable.length > 0) {
        changes.push(`${SKILLS_DEST_PREFIX} — remove ${removable.length} retired skill file(s)`);
      }
      for (const relPath of keptModified) {
        changes.push(`${relPath} — locally modified; kept on disk, no longer managed`);
      }

      // 2. The manifest's implementationLoop field is retired — Ralph is the
      // implementation loop, no field selects it.
      const manifestPath = join(ctx.cwd, MANIFEST_FILENAME);
      const manifestSource = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : null;
      const keyRemoval = manifestSource === null ? null : removeManifestKey(manifestSource, "implementationLoop");
      if (keyRemoval?.changed) {
        changes.push(`${MANIFEST_FILENAME} — remove the retired implementationLoop field`);
      }

      // 3. A project that had selected superpowers converges on Ralph: the
      // plugin declaration Launchrail added for that loop is removed (only
      // then — a declaration the user added themselves is never touched) and
      // Ralph's materials install.
      const wasSuperpowers = keyRemoval?.previous === "superpowers";
      const settingsRemoval = wasSuperpowers
        ? planRemovePluginDeclaration(ctx.cwd, [RETIRED_SUPERPOWERS_DECLARATION])
        : null;
      if (settingsRemoval !== null && settingsRemoval.content !== null) {
        changes.push(`${CLAUDE_SETTINGS_PATH} — ${settingsRemoval.detail}`);
      }
      const ralphEnable =
        wasSuperpowers && keyRemoval ? setModuleEnabled(keyRemoval.source, RALPH_MODULE, {}) : null;
      if (ralphEnable?.changed) {
        changes.push(`${MANIFEST_FILENAME} — enable the ralph module (superpowers loop retired)`);
      }
      const ralphActions = wasSuperpowers ? planWrites(ctx.cwd, ralphFiles(), ctx.lockfile) : [];
      for (const action of ralphActions) {
        if (action.kind === "create" || action.kind === "update") {
          changes.push(`${action.spec.relPath} — ${action.detail}`);
        }
      }

      if (changes.length === 0) return { changes: [], apply: () => {} };
      const skillsRoot = join(ctx.cwd, SKILLS_DEST_PREFIX);
      return {
        changes,
        apply: () => {
          for (const relPath of removable) {
            const abs = join(ctx.cwd, relPath);
            if (existsSync(abs)) unlinkSync(abs);
            delete ctx.lockfile.files[relPath];
          }
          for (const relPath of keptModified) delete ctx.lockfile.files[relPath];
          // Clear the skill directories the deletes emptied, deepest first;
          // rmdir refuses a non-empty directory, which is exactly the guard.
          const dirs = [...new Set(removable.map((relPath) => dirname(join(ctx.cwd, relPath))))].sort(
            (a, b) => b.length - a.length,
          );
          for (const dir of dirs) {
            for (let d = dir; d !== skillsRoot && d.startsWith(skillsRoot); d = dirname(d)) {
              try {
                rmdirSync(d);
              } catch {
                break;
              }
            }
          }
          const manifestFinal = ralphEnable ?? keyRemoval;
          if (manifestFinal && (keyRemoval?.changed || ralphEnable?.changed)) {
            writeFileSync(manifestPath, manifestFinal.source, "utf8");
          }
          if (settingsRemoval !== null) applyRemovePluginDeclaration(ctx.cwd, settingsRemoval);
          if (ralphActions.length > 0) applyPlan(ctx.cwd, ralphActions, ctx.lockfile);
        },
      };
    },
  },
];

export function migrationIds(registry: Migration[] = MIGRATIONS): string[] {
  return registry.map((migration) => migration.id);
}

/** Migrations not yet recorded in the lockfile, in the order they must run. */
export function pendingMigrations(lockfile: Lockfile, registry: Migration[] = MIGRATIONS): Migration[] {
  const applied = new Set(lockfile.migrations);
  return [...registry].sort((a, b) => a.id.localeCompare(b.id)).filter((m) => !applied.has(m.id));
}

export interface PlannedMigration {
  id: string;
  description: string;
  changes: string[];
}

/** Dry-run view of what `applyPendingMigrations` would do. Touches nothing. */
export function planPendingMigrations(ctx: MigrationContext, registry: Migration[] = MIGRATIONS): PlannedMigration[] {
  return pendingMigrations(ctx.lockfile, registry).map((migration) => ({
    id: migration.id,
    description: migration.description,
    changes: migration.plan(ctx).changes,
  }));
}

export type MigrationStatus = "applied" | "already-satisfied" | "failed";

export interface MigrationResult {
  id: string;
  description: string;
  status: MigrationStatus;
  changes: string[];
  error: string | null;
}

/**
 * Apply pending migrations in order, recording each in `lockfile.migrations`.
 * A failure stops the run and is reported; earlier migrations stay recorded so
 * a re-run resumes exactly where this one stopped.
 */
export function applyPendingMigrations(ctx: MigrationContext, registry: Migration[] = MIGRATIONS): MigrationResult[] {
  const results: MigrationResult[] = [];
  for (const migration of pendingMigrations(ctx.lockfile, registry)) {
    let changes: string[] = [];
    try {
      const plan = migration.plan(ctx);
      changes = plan.changes;
      plan.apply();
    } catch (err) {
      results.push({
        id: migration.id,
        description: migration.description,
        status: "failed",
        changes,
        error: err instanceof Error ? err.message : String(err),
      });
      return results;
    }
    ctx.lockfile.migrations.push(migration.id);
    results.push({
      id: migration.id,
      description: migration.description,
      status: changes.length > 0 ? "applied" : "already-satisfied",
      changes,
      error: null,
    });
  }
  return results;
}
