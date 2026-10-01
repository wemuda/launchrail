import { ADR_DIR, ADR_UNCLASSIFIED_NOTE, adrIndexTable, scanAdrs } from "../lib/adr.js";

export interface AdrIndexOptions {
  cwd: string;
}

export interface AdrIndexOutcome {
  code: number;
  records: number;
  /** What was printed: the table (plus the Unclassified note when it applies), or the empty-corpus line. */
  output: string;
}

/**
 * `launchrail adr index` — print the registry index, built from the records on
 * disk: one row per record in timeline order, each with its live status and the
 * reverse links later records imply. Read-only, and never committed: a table
 * every ADR-adding branch rewrites is one parallel branches conflict over
 * (2026-10-01-adr-index-is-printed-not-committed), so the records alone are the
 * source and the index is computed each time it is read.
 */
export function runAdrIndex(options: AdrIndexOptions): AdrIndexOutcome {
  const entries = scanAdrs(options.cwd);
  const output =
    entries.length === 0
      ? `No decision records in ${ADR_DIR}/ yet.`
      : [adrIndexTable(entries), ...(entries.some((e) => e.status === "") ? ["", ADR_UNCLASSIFIED_NOTE] : [])].join("\n");
  console.log(output);
  return { code: 0, records: entries.length, output };
}
