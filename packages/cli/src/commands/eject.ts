import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../lib/checksum.js";
import { writeLockfile } from "../lib/lockfile.js";
import { loadProject, moduleSpecs } from "../lib/project.js";

export interface EjectOptions {
  cwd: string;
  /** A module name or a tracked file path; null with `all` for vendor mode. */
  target: string | null;
  all: boolean;
  dryRun: boolean;
}

export interface EjectOutcome {
  code: number;
  ejected: string[];
}

const MANAGED_HEADER = /^<!-- Managed by Launchrail[\s\S]*?-->\n?/;
const EJECTED_HEADER = "<!-- Ejected from Launchrail management — this file is yours to edit. -->\n";

/**
 * Stop managing paths: mark them "ejected" in the lockfile so no future init,
 * sync, or add ever writes them again — not even to recreate them if deleted.
 * `--all` is vendor mode: eject everything Launchrail has ever written here.
 */
export function runEject(opts: EjectOptions): EjectOutcome {
  const { state, errors } = loadProject(opts.cwd);
  if (!state) {
    for (const error of errors) console.error(`launchrail: ${error}`);
    return { code: 1, ejected: [] };
  }
  if (!opts.all && opts.target === null) {
    console.error("launchrail: usage: launchrail eject <module|file> [--dry-run], or launchrail eject --all");
    return { code: 1, ejected: [] };
  }

  const { lockfile } = state;
  const tracked = (relPath: string): boolean => lockfile.files[relPath] !== undefined;
  const notEjected = (relPath: string): boolean => lockfile.files[relPath]?.class !== "ejected";

  const modules = moduleSpecs(state);
  let targets: string[];
  if (opts.all) {
    targets = Object.keys(lockfile.files).filter(notEjected);
  } else if (opts.target !== null && modules[opts.target] !== undefined) {
    targets = modules[opts.target]!.map((spec) => spec.relPath).filter(tracked).filter(notEjected);
  } else if (opts.target !== null && tracked(opts.target)) {
    targets = [opts.target].filter(notEjected);
  } else {
    console.error(
      `launchrail: "${opts.target}" is neither an enabled module (${Object.keys(modules).join(", ")}) nor a file tracked in the lockfile.`,
    );
    return { code: 1, ejected: [] };
  }

  if (targets.length === 0) {
    console.log("Nothing to eject — the selected path(s) are already ejected.");
    return { code: 0, ejected: [] };
  }

  // The managed do-not-edit header becomes wrong the moment a file is ejected.
  // Rewrite it only when the file is provably unmodified; otherwise the file is
  // already the user's and is left byte-for-byte alone.
  const headerRewrites = new Map<string, string>();
  for (const relPath of targets) {
    const locked = lockfile.files[relPath]!;
    const abs = join(opts.cwd, relPath);
    if (locked.class !== "managed" || !existsSync(abs)) continue;
    const current = readFileSync(abs, "utf8");
    if (sha256(current) === locked.checksum && MANAGED_HEADER.test(current)) {
      headerRewrites.set(relPath, current.replace(MANAGED_HEADER, EJECTED_HEADER));
    }
  }

  for (const relPath of targets) {
    console.log(`  eject     ${relPath}${headerRewrites.has(relPath) ? "  (managed header rewritten)" : ""}`);
  }

  if (opts.dryRun) {
    console.log("\nDry run — nothing was written.");
    return { code: 0, ejected: [] };
  }

  for (const relPath of targets) {
    const rewritten = headerRewrites.get(relPath);
    if (rewritten !== undefined) writeFileSync(join(opts.cwd, relPath), rewritten, "utf8");
    lockfile.files[relPath] = {
      class: "ejected",
      checksum: rewritten !== undefined ? sha256(rewritten) : lockfile.files[relPath]!.checksum,
    };
  }
  writeLockfile(opts.cwd, lockfile);

  console.log(`\nEjected ${targets.length} file(s) — Launchrail will never write them again.`);
  return { code: 0, ejected: targets };
}
