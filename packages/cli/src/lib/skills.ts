import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSpec } from "./writer.js";

/**
 * The workflow skills are Launchrail's own complete, `launch-`-prefixed set
 * (ADR-0020), shipped as real files under assets/skills/launchrail/ and written
 * into consuming repos as managed files (ADR-0019) — no plugin and no vendored
 * upstream snapshot. Skills that absorb text from Matt Pocock's MIT-licensed
 * skills carry a derivation note; the license travels as the NOTICE file. The
 * asset dir resolves from both src/ (tests) and dist/ (published CLI); both are
 * siblings of assets/, exactly like the Ralph workflow asset (see ralph.ts).
 */
const SKILLS_ASSET_DIR = fileURLToPath(new URL("../../assets/skills/", import.meta.url));

/** Where the workflow skills land in a consuming repo. */
export const SKILLS_DEST_PREFIX = ".claude/skills";
/** Attribution file for the skills with upstream-derived text (MIT). */
export const SKILLS_NOTICE_PATH = `${SKILLS_DEST_PREFIX}/NOTICE.md`;

/** The single skill source root — Launchrail's own set. */
const SOURCE_ROOT = "launchrail";

/** Recursively list every file under `dir` (absolute paths). */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Every skill file Launchrail writes into a consuming repo, as managed specs,
 * plus the attribution NOTICE beside them.
 */
export function skillFiles(): FileSpec[] {
  const rootDir = join(SKILLS_ASSET_DIR, SOURCE_ROOT);
  const specs: FileSpec[] = walk(rootDir).map((file) => ({
    relPath: `${SKILLS_DEST_PREFIX}/${relative(rootDir, file).split(sep).join("/")}`,
    content: readFileSync(file, "utf8"),
    ownership: "managed" as const,
  }));
  specs.push({
    relPath: SKILLS_NOTICE_PATH,
    content: readFileSync(join(SKILLS_ASSET_DIR, "NOTICE.md"), "utf8"),
    ownership: "managed",
  });
  return specs;
}

/** Directory names of every skill written into the consumer, for reporting/verification. */
export function skillNames(): string[] {
  return readdirSync(join(SKILLS_ASSET_DIR, SOURCE_ROOT), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
