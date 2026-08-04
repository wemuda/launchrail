import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatUnifiedDiff } from "../lib/diff.js";
import { loadProject, desiredSpecs } from "../lib/project.js";
import { planWrites } from "../lib/writer.js";

export interface DiffEntry {
  relPath: string;
  kind: "create" | "update" | "conflict";
  diff: string;
}

export interface DiffOutcome {
  code: number;
  errors: string[];
  entries: DiffEntry[];
}

/** Preview what `launchrail sync` would write, as unified diffs against disk. */
export function runDiff(cwd: string): DiffOutcome {
  const { state, errors } = loadProject(cwd);
  if (!state) return { code: 1, errors, entries: [] };

  const entries: DiffEntry[] = [];
  for (const action of planWrites(cwd, desiredSpecs(state), state.lockfile)) {
    if (action.kind !== "create" && action.kind !== "update" && action.kind !== "conflict") continue;
    const current = action.kind === "create" ? "" : readFileSync(join(cwd, action.spec.relPath), "utf8");
    entries.push({
      relPath: action.spec.relPath,
      kind: action.kind,
      diff: formatUnifiedDiff(current, action.spec.content),
    });
  }
  return { code: 0, errors: [], entries };
}

export function printDiff(outcome: DiffOutcome): void {
  if (outcome.errors.length > 0) {
    for (const error of outcome.errors) console.error(`launchrail: ${error}`);
    return;
  }
  if (outcome.entries.length === 0) {
    console.log("No upstream changes — managed files and seeds are up to date.");
    return;
  }
  for (const entry of outcome.entries) {
    console.log(`--- ${entry.kind === "create" ? "/dev/null" : `a/${entry.relPath}`}`);
    console.log(`+++ b/${entry.relPath}`);
    if (entry.kind === "conflict") {
      console.log("(locally modified — sync will keep your version; shown for reference)");
    }
    process.stdout.write(entry.diff);
    console.log("");
  }
}
