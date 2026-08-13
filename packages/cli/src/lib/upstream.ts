import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Upstream dependency compatibility tracking (ADR-0006). Names of the external
 * tools Launchrail drives (Claude Design, Playwright) — and of its own skills
 * and commands — end up in project-owned docs. When a rename ships, an entry
 * lands in this registry and `status` reports stale references. Project-owned
 * files are never edited automatically: advisories only, the fix stays a human
 * (or agent) decision.
 */
export interface UpstreamRename {
  /** The retired name, matched as a whole word (hyphens count as word characters). */
  from: string;
  to: string;
  note?: string;
}

/** Known upstream renames. Empty until an upstream rename actually ships. */
export const UPSTREAM_RENAMES: UpstreamRename[] = [];

/** Project-owned docs worth scanning: agent contracts and launch-setup's output. */
const SCAN_FILES = ["AGENTS.md", "CLAUDE.md", "docs/workflow.md"];
const SCAN_DIRS = ["docs/agents"];

export interface UpstreamAdvisory {
  relPath: string;
  rename: UpstreamRename;
}

function scanTargets(root: string): string[] {
  const targets = SCAN_FILES.filter((rel) => existsSync(join(root, rel)));
  for (const dir of SCAN_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    for (const entry of readdirSync(join(root, dir))) {
      if (entry.endsWith(".md")) targets.push(`${dir}/${entry}`);
    }
  }
  return targets;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scanUpstreamReferences(
  root: string,
  renames: UpstreamRename[] = UPSTREAM_RENAMES,
): UpstreamAdvisory[] {
  if (renames.length === 0) return [];
  const advisories: UpstreamAdvisory[] = [];
  for (const relPath of scanTargets(root)) {
    const content = readFileSync(join(root, relPath), "utf8");
    for (const rename of renames) {
      const pattern = new RegExp(`(?<![\\w-])${escapeRegExp(rename.from)}(?![\\w-])`);
      if (pattern.test(content)) advisories.push({ relPath, rename });
    }
  }
  return advisories;
}
