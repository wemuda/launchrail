import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Manifest } from "./manifest.js";
import type { FileSpec } from "./writer.js";

/**
 * Per-repo workflow configuration under docs/agents/: the issue-tracker
 * conventions (including the rail's label vocabulary) and the domain-doc
 * consumer rules. Upstream needed an interactive setup skill to write these;
 * Launchrail derives them from the manifest and seeds them at init/sync
 * (ADR-0020), so stage 0 is just `init`. Seeded means created once and then
 * project-owned — edit them freely, or delete one to have `sync` re-seed it
 * from the manifest's current answers (e.g. after switching trackers).
 */
const AGENTS_DOCS_ASSET_DIR = fileURLToPath(new URL("../../assets/agents-docs/", import.meta.url));

export const AGENTS_DOCS_DEST_PREFIX = "docs/agents";

function asset(name: string): string {
  return readFileSync(join(AGENTS_DOCS_ASSET_DIR, name), "utf8");
}

export function agentsDocsFiles(manifest: Manifest): FileSpec[] {
  const specs: FileSpec[] = [
    { relPath: `${AGENTS_DOCS_DEST_PREFIX}/domain.md`, content: asset("domain.md"), ownership: "seeded" },
  ];
  // `none` means no tracker — nothing to document.
  if (manifest.issueTracker !== "none") {
    specs.push({
      relPath: `${AGENTS_DOCS_DEST_PREFIX}/issue-tracker.md`,
      content: asset(`issue-tracker-${manifest.issueTracker}.md`),
      ownership: "seeded",
    });
  }
  return specs;
}
