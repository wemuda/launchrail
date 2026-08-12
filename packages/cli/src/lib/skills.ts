import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileSpec } from "./writer.js";

/**
 * The workflow skills ship as real files under assets/skills/ and are vendored
 * into consuming repos as managed files (ADR-0019) — no Claude Code plugin. The
 * asset dir resolves from both src/ (tests) and dist/ (published CLI); both are
 * siblings of assets/, exactly like the Ralph workflow asset (see ralph.ts).
 *
 * Two source roots flatten into one destination:
 *   - launchrail/       — Launchrail's own skills, `launch-` prefixed
 *   - vendor/mattpocock/ — a pinned MIT snapshot, bare upstream names
 * Both land under .claude/skills/<name>/… in the consumer, and the vendored
 * snapshot's upstream LICENSE travels with them as an attribution NOTICE.
 */
const SKILLS_ASSET_DIR = fileURLToPath(new URL("../../assets/skills/", import.meta.url));

/** Where vendored skills land in a consuming repo. */
export const SKILLS_DEST_PREFIX = ".claude/skills";
/** Attribution file carrying the vendored snapshot's upstream MIT license. */
export const MATTPOCOCK_NOTICE_PATH = `${SKILLS_DEST_PREFIX}/NOTICE-mattpocock.md`;
/** Relative path (from assets/skills/) to the vendored snapshot's license. */
const MATTPOCOCK_LICENSE = join("vendor", "mattpocock", "LICENSE");

/** Skill source roots, in write order. */
const SOURCE_ROOTS = ["launchrail", join("vendor", "mattpocock")] as const;

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

/** A short attribution note prepended to the vendored snapshot's MIT license. */
function mattpocockNotice(licenseText: string): string {
  return `# Vendored skills — attribution

Some skills in this directory are vendored from [Matt Pocock's skills](https://github.com/mattpocock/skills)
and redistributed under the MIT License, reproduced below. Launchrail keeps this
snapshot current through \`launchrail sync\`; edit a vendored skill in place only if
you intend to own it (\`launchrail eject <path>\`), which stops future updates to it.

Skills prefixed \`launch-\` (and the \`launch\` conductor) are Launchrail's own.

---

${licenseText.trim()}
`;
}

/**
 * Every skill file Launchrail writes into a consuming repo, as managed specs.
 * Root-level metadata in a source root (the vendored LICENSE and VENDOR.json)
 * is not a skill: VENDOR.json is toolchain-internal and dropped; the LICENSE is
 * re-emitted once as the attribution NOTICE.
 */
export function skillFiles(): FileSpec[] {
  const specs: FileSpec[] = [];
  for (const root of SOURCE_ROOTS) {
    const rootDir = join(SKILLS_ASSET_DIR, root);
    for (const file of walk(rootDir)) {
      const rel = relative(rootDir, file).split(sep).join("/");
      // Root-level files (no skill directory) are metadata, not skills.
      if (!rel.includes("/")) continue;
      specs.push({
        relPath: `${SKILLS_DEST_PREFIX}/${rel}`,
        content: readFileSync(file, "utf8"),
        ownership: "managed",
      });
    }
  }
  const licenseText = readFileSync(join(SKILLS_ASSET_DIR, MATTPOCOCK_LICENSE), "utf8");
  specs.push({
    relPath: MATTPOCOCK_NOTICE_PATH,
    content: mattpocockNotice(licenseText),
    ownership: "managed",
  });
  return specs;
}

/** Directory names of every skill written into the consumer, for reporting/verification. */
export function skillNames(): string[] {
  return SOURCE_ROOTS.flatMap((root) =>
    readdirSync(join(SKILLS_ASSET_DIR, root), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  ).sort();
}
