import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ADR_REGISTRY_PATH, scanAdrs, withRegeneratedIndex } from "../lib/adr.js";

export interface AdrIndexOptions {
  cwd: string;
  /** Report whether the index is current without writing; exit 1 when it is not. */
  check: boolean;
}

export interface AdrIndexOutcome {
  code: number;
  /** "current" | "updated" | "stale" (check mode) | "missing" (no registry / no index section). */
  result: "current" | "updated" | "stale" | "missing";
  records: number;
}

/**
 * `launchrail adr index` — regenerate the registry's index table from the
 * records on disk. The registry is project-owned; only the rows between the
 * markers are touched, and only here (never by sync), so the project keeps
 * every other line and parallel branches merge by re-running the command.
 */
export function runAdrIndex(options: AdrIndexOptions): AdrIndexOutcome {
  const registryPath = join(options.cwd, ADR_REGISTRY_PATH);
  const entries = scanAdrs(options.cwd);
  if (!existsSync(registryPath)) {
    console.error(`launchrail: ${ADR_REGISTRY_PATH} not found — run \`launchrail sync\` to seed the registry first`);
    return { code: 1, result: "missing", records: entries.length };
  }
  const source = readFileSync(registryPath, "utf8");
  const next = withRegeneratedIndex(source, entries);
  if (next === null) {
    console.error(
      `launchrail: ${ADR_REGISTRY_PATH} has no index to regenerate — add a \`## Index\` heading with a table (or the adr-index markers) and re-run`,
    );
    return { code: 1, result: "missing", records: entries.length };
  }
  if (next === source) {
    console.log(`adr index: current (${entries.length} record(s))`);
    return { code: 0, result: "current", records: entries.length };
  }
  if (options.check) {
    console.error(`adr index: out of date — run \`launchrail adr index\` and commit ${ADR_REGISTRY_PATH}`);
    return { code: 1, result: "stale", records: entries.length };
  }
  writeFileSync(registryPath, next);
  console.log(`adr index: updated ${ADR_REGISTRY_PATH} (${entries.length} record(s))`);
  return { code: 0, result: "updated", records: entries.length };
}
