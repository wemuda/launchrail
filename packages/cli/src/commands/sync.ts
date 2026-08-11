import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeLockfile } from "../lib/lockfile.js";
import { MANIFEST_FILENAME, parseManifest } from "../lib/manifest.js";
import {
  applyPendingMigrations,
  MIGRATIONS,
  planPendingMigrations,
  type Migration,
  type MigrationResult,
} from "../lib/migrations.js";
import { loadProject, desiredSpecs } from "../lib/project.js";
import { ACTION_LABEL, applyPlan, planWrites, type PlannedAction } from "../lib/writer.js";
import { VERSION } from "../version.js";

export interface SyncOptions {
  cwd: string;
  dryRun: boolean;
  /** Migration registry override for tests; defaults to all shipped migrations. */
  registry?: Migration[];
}

export interface SyncOutcome {
  code: number;
  actions: PlannedAction[];
  migrations: MigrationResult[];
}

function printActions(actions: PlannedAction[]): void {
  for (const action of actions) {
    console.log(`  ${ACTION_LABEL[action.kind]}  ${action.spec.relPath}  (${action.detail})`);
  }
}

function reportConflicts(actions: PlannedAction[]): void {
  const conflicts = actions.filter((a) => a.kind === "conflict");
  if (conflicts.length === 0) return;
  console.log(`\n${conflicts.length} managed file(s) kept local modifications:`);
  for (const action of conflicts) console.log(`  ${action.spec.relPath}`);
  console.log("Revert the local edits to receive updates, or run `launchrail eject <file>` to own them permanently.");
}

/**
 * Bring an initialized project up to the current toolchain: run pending
 * migrations in order, then regenerate the managed/seeded surface through the
 * safe writer (unmodified managed files update, local modifications win).
 */
export function runSync(opts: SyncOptions): SyncOutcome {
  const registry = opts.registry ?? MIGRATIONS;
  const { state, errors } = loadProject(opts.cwd);
  if (!state) {
    for (const error of errors) console.error(`launchrail: ${error}`);
    return { code: 1, actions: [], migrations: [] };
  }
  const ctx = { cwd: opts.cwd, lockfile: state.lockfile };
  const lockBefore = JSON.stringify(state.lockfile);

  if (opts.dryRun) {
    const planned = planPendingMigrations(ctx, registry);
    if (planned.length > 0) {
      console.log("Pending migrations:");
      for (const migration of planned) {
        console.log(`  ${migration.id} — ${migration.description}`);
        for (const change of migration.changes) console.log(`      ${change}`);
        if (migration.changes.length === 0) console.log("      already satisfied — will be recorded");
      }
      console.log("");
    }
    const actions = planWrites(opts.cwd, desiredSpecs(state), state.lockfile);
    printActions(actions);
    reportConflicts(actions);
    console.log("\nDry run — nothing was written.");
    return { code: 0, actions, migrations: [] };
  }

  // Migrations first: structural changes land before the file surface regenerates.
  const migrations = applyPendingMigrations(ctx, registry);
  for (const result of migrations) {
    if (result.status === "failed") continue;
    const detail = result.status === "applied" ? result.changes.join("; ") : "already satisfied";
    console.log(`  migrate   ${result.id}  (${detail})`);
  }
  const failed = migrations.find((result) => result.status === "failed");
  if (failed) {
    if (JSON.stringify(state.lockfile) !== lockBefore) writeLockfile(opts.cwd, state.lockfile);
    console.error(`\nlaunchrail: migration ${failed.id} failed: ${failed.error}`);
    console.error("Migrations applied before the failure are recorded; fix the cause and re-run `launchrail sync`.");
    return { code: 1, actions: [], migrations };
  }

  // A migration may edit the manifest (e.g. enabling a module); re-read it so
  // the regenerated file surface reflects the post-migration configuration in
  // this run instead of the next one.
  if (migrations.some((result) => result.status === "applied")) {
    const reparsed = parseManifest(readFileSync(join(opts.cwd, MANIFEST_FILENAME), "utf8"));
    if (reparsed.manifest) state.manifest = reparsed.manifest;
  }

  const actions = planWrites(opts.cwd, desiredSpecs(state), state.lockfile);
  printActions(actions);
  const written = applyPlan(opts.cwd, actions, state.lockfile);

  state.lockfile.launchrailVersion = VERSION;
  if (JSON.stringify(state.lockfile) !== lockBefore) writeLockfile(opts.cwd, state.lockfile);

  reportConflicts(actions);
  const migrated = migrations.filter((result) => result.status === "applied").length;
  console.log(
    written.length + migrated > 0
      ? `\nApplied ${migrated} migration(s), wrote ${written.length} file(s).`
      : "\nEverything already up to date — nothing written.",
  );
  return { code: 0, actions, migrations };
}
