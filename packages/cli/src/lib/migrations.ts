import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPluginDeclaration, CLAUDE_SETTINGS_PATH, planPluginDeclaration } from "./claudeSettings.js";
import type { Lockfile } from "./lockfile.js";
import { MANIFEST_FILENAME, parseManifest, setModuleEnabled } from "./manifest.js";
import { RALPH_MODULE, RALPH_WORKFLOW_PATH, ralphFiles } from "./ralph.js";
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
    id: "2026-08-wire-default-implementation-loop",
    description:
      "install the built-in implementation loop's materials when the manifest selects ralph, so /launchrail:implement works without `launchrail add ralph` (ADR-0018)",
    plan(ctx) {
      const none = { changes: [], apply: () => {} };
      const manifestPath = join(ctx.cwd, MANIFEST_FILENAME);
      if (!existsSync(manifestPath)) return none;
      const source = readFileSync(manifestPath, "utf8");
      const parsed = parseManifest(source);
      // An invalid manifest is sync's own precondition failure, not this
      // migration's; a project that selected another loop needs nothing.
      if (!parsed.manifest || parsed.manifest.implementationLoop !== "ralph") return none;

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
