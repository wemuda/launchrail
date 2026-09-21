import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADR_INDEX_SENTINEL,
  ADR_REGISTRY_PATH,
  adrIndexTable,
  entriesFromSources,
  replaceIndexRegion,
  scanAdrs,
  withRegeneratedIndex,
} from "../lib/adr.js";
import { gatherMergedAdrSources } from "../lib/adrMergeDriver.js";

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

export interface AdrMergeDriverOptions {
  cwd: string;
  /** git's `%O`, `%A`, `%B`: the base, ours (also the destination git reads back), and theirs temp files. */
  base: string;
  ours: string;
  theirs: string;
  /** git's `%P`: the path in the work tree. Diagnostic only. */
  path?: string;
}

export interface AdrMergeDriverOutcome {
  code: number;
  /** "merged" (clean), "conflict" (a real prose conflict remains for a human), "regenerated" (marker-less fallback), "error" (left ours; git falls back to the manual step). */
  result: "merged" | "conflict" | "regenerated" | "error";
}

/**
 * `launchrail adr merge-driver %O %A %B %P` — the git merge driver bound to
 * docs/adr/README.md. The generated index is a derived artifact whose source of
 * truth (the records) merges cleanly, so instead of line-merging the table this
 * regenerates it from the full merged corpus and writes the result to `%A`.
 *
 * The records themselves are gathered from the working tree plus the incoming
 * side (read from git — with merge-ort the incoming side's new record files are
 * not on disk yet when the driver runs), so the output equals `launchrail adr
 * index` over the finished merge and `adr index --check` stays clean. Everything
 * outside the index table is a genuine 3-way merge via `git merge-file`: prose
 * changes merge normally and a real prose conflict still surfaces for a human,
 * while the index table alone is always auto-resolved.
 */
export function runAdrMergeDriver(options: AdrMergeDriverOptions): AdrMergeDriverOutcome {
  try {
    const oursSource = readFileSync(options.ours, "utf8");
    const table = adrIndexTable(entriesFromSources(gatherMergedAdrSources(options.cwd)));

    const sentinelOurs = replaceIndexRegion(oursSource, ADR_INDEX_SENTINEL);
    const sentinelBase = replaceIndexRegion(readFileSync(options.base, "utf8"), ADR_INDEX_SENTINEL);
    const sentinelTheirs = replaceIndexRegion(readFileSync(options.theirs, "utf8"), ADR_INDEX_SENTINEL);

    if (sentinelOurs !== null && sentinelBase !== null && sentinelTheirs !== null) {
      const dir = mkdtempSync(join(tmpdir(), "launchrail-adr-merge-"));
      try {
        const oursFile = join(dir, "ours");
        const baseFile = join(dir, "base");
        const theirsFile = join(dir, "theirs");
        writeFileSync(oursFile, sentinelOurs);
        writeFileSync(baseFile, sentinelBase);
        writeFileSync(theirsFile, sentinelTheirs);

        // git merge-file 3-way merges the prose (the index region is a stable
        // sentinel on every side, so it never conflicts). Non-zero exit means a
        // real prose conflict remains; the conflicted text is still on stdout.
        let status = 0;
        let merged: string;
        try {
          merged = execFileSync(
            "git",
            ["merge-file", "-p", "-L", "ours", "-L", "base", "-L", "theirs", oursFile, baseFile, theirsFile],
            { cwd: options.cwd, encoding: "utf8" },
          );
        } catch (err) {
          const failure = err as { status?: number; stdout?: string };
          if (typeof failure.stdout !== "string") throw err;
          merged = failure.stdout;
          status = typeof failure.status === "number" && failure.status > 0 ? failure.status : 1;
        }

        if (merged.includes(ADR_INDEX_SENTINEL)) {
          writeFileSync(options.ours, merged.split(ADR_INDEX_SENTINEL).join(table));
          return { code: status, result: status === 0 ? "merged" : "conflict" };
        }
        // Sentinel gone (a prose conflict engulfed it): fall through to a clean regen.
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    // Fallback: no usable markers on some side, or the sentinel was lost — write
    // the regenerated index straight into ours' content.
    writeFileSync(options.ours, replaceIndexRegion(oursSource, table) ?? oursSource);
    return { code: 0, result: "regenerated" };
  } catch {
    // Never corrupt the file: leave ours in place and report a conflict so git
    // falls back to the documented manual step (`launchrail adr index` + add).
    return { code: 1, result: "error" };
  }
}
