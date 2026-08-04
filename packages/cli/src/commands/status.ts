import { loadProject, desiredSpecs } from "../lib/project.js";
import { pendingMigrations } from "../lib/migrations.js";
import { scanUpstreamReferences, type UpstreamAdvisory } from "../lib/upstream.js";
import { planWrites, type PlannedAction } from "../lib/writer.js";
import { VERSION } from "../version.js";

export interface StatusReport {
  code: number;
  errors: string[];
  cliVersion: string;
  lockfileVersion: string | null;
  modules: string[];
  ejected: string[];
  actions: PlannedAction[];
  pendingMigrationIds: string[];
  advisories: UpstreamAdvisory[];
}

export function runStatus(cwd: string): StatusReport {
  const { state, errors } = loadProject(cwd);
  if (!state) {
    return {
      code: 1,
      errors,
      cliVersion: VERSION,
      lockfileVersion: null,
      modules: [],
      ejected: [],
      actions: [],
      pendingMigrationIds: [],
      advisories: [],
    };
  }
  return {
    code: 0,
    errors: [],
    cliVersion: VERSION,
    lockfileVersion: state.lockfile.launchrailVersion,
    modules: Object.entries(state.manifest.modules)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name),
    ejected: Object.entries(state.lockfile.files)
      .filter(([, file]) => file.class === "ejected")
      .map(([relPath]) => relPath),
    actions: planWrites(cwd, desiredSpecs(state), state.lockfile),
    pendingMigrationIds: pendingMigrations(state.lockfile).map((m) => m.id),
    advisories: scanUpstreamReferences(cwd),
  };
}

function fileLine(action: PlannedAction): string {
  const path = action.spec.relPath;
  switch (action.kind) {
    case "create":
      return `  missing   ${path} — sync will create it`;
    case "update":
      return `  outdated  ${path} — sync will update it`;
    case "conflict":
      return `  modified  ${path} — locally modified managed file; sync keeps your version`;
    case "skip-seeded-exists":
    case "skip-unchanged":
      return `  ok        ${path}`;
    case "skip-ejected":
      return `  ejected   ${path}`;
  }
}

export function printStatus(report: StatusReport): void {
  if (report.errors.length > 0) {
    for (const error of report.errors) console.error(`launchrail: ${error}`);
    return;
  }

  console.log(`launchrail ${report.cliVersion} — lockfile written by ${report.lockfileVersion}`);
  console.log(`  modules: ${report.modules.join(", ")}`);
  if (report.ejected.length > 0) {
    console.log(`  ejected: ${report.ejected.join(", ")}`);
  }

  console.log("\nFiles:");
  for (const action of report.actions) console.log(fileLine(action));

  if (report.pendingMigrationIds.length > 0) {
    console.log("\nPending migrations:");
    for (const id of report.pendingMigrationIds) console.log(`  ${id}`);
  }

  if (report.advisories.length > 0) {
    console.log("\nUpstream renames:");
    for (const advisory of report.advisories) {
      const note = advisory.rename.note ? ` (${advisory.rename.note})` : "";
      console.log(
        `  ${advisory.relPath} references \`${advisory.rename.from}\` — renamed upstream to \`${advisory.rename.to}\`${note}`,
      );
    }
  }

  const updates = report.actions.filter((a) => a.kind === "create" || a.kind === "update").length;
  const conflicts = report.actions.filter((a) => a.kind === "conflict").length;
  if (updates + report.pendingMigrationIds.length > 0) {
    console.log(`\n${updates} update(s) and ${report.pendingMigrationIds.length} migration(s) available — run \`launchrail sync\` (or \`launchrail diff\` to preview).`);
  } else if (conflicts > 0) {
    console.log(`\nUp to date; ${conflicts} file(s) carry local modifications (run \`launchrail eject <file>\` to own them permanently).`);
  } else {
    console.log("\nEverything up to date.");
  }
}
