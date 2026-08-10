import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The seeded CLAUDE.md wires Claude Code into Launchrail through two @-imports:
 * the shared agent contract (`@AGENTS.md`) and the managed workflow
 * instructions (`@.launchrail/CLAUDE.generated.md`). When `init` adopts a
 * project that already has its own CLAUDE.md, that file is seeded /
 * project-owned and is never overwritten — but without those imports the
 * managed instructions Launchrail writes to `.launchrail/CLAUDE.generated.md`
 * are orphaned: Claude Code never loads them.
 *
 * So, exactly as `init` additively merges the plugin declaration into a
 * project-owned `.claude/settings.json` (ADR-0003), it additively wires the two
 * required imports into an existing CLAUDE.md (ADR-0012): only the missing
 * import lines are added, at the top of the file, and nothing else is touched.
 * The file is not tracked in the lockfile — checksum tracking would misreport
 * every legitimate project edit as drift.
 */
export const CLAUDE_MD_FILENAME = "CLAUDE.md";

/** The @-imports the workflow relies on, in canonical order (contract first). */
export const REQUIRED_CLAUDE_IMPORTS = ["@AGENTS.md", "@.launchrail/CLAUDE.generated.md"] as const;

/** True when `content` imports `importPath` on a line of its own (prose mentions do not count). */
export function importsPath(content: string, importPath: string): boolean {
  return content.split("\n").some((line) => line.trim() === importPath);
}

/** The workflow imports that `content` is missing, in canonical order. */
export function missingImports(content: string): string[] {
  return REQUIRED_CLAUDE_IMPORTS.filter((imp) => !importsPath(content, imp));
}

export type ClaudeImportsPlanKind = "seed" | "ok" | "merge";

export interface ClaudeImportsPlan {
  kind: ClaudeImportsPlanKind;
  detail: string;
  /** Full file content to write; null when nothing should change. */
  content: string | null;
  /** The imports that will be added (empty unless kind === "merge"). */
  added: string[];
}

/**
 * Decide how to ensure an existing CLAUDE.md imports the workflow files,
 * without touching disk.
 *
 * - no file yet → `seed`: init's writer creates a complete CLAUDE.md, so there
 *   is nothing to wire in here.
 * - file present, both imports already there → `ok`: nothing to do (idempotent).
 * - file present, one or both imports missing → `merge`: prepend the missing
 *   import lines, preserving every existing byte after them.
 */
export function planClaudeImports(root: string): ClaudeImportsPlan {
  const abs = join(root, CLAUDE_MD_FILENAME);
  if (!existsSync(abs)) {
    return { kind: "seed", detail: "init will seed CLAUDE.md with the workflow imports", content: null, added: [] };
  }
  const existing = readFileSync(abs, "utf8");
  const missing = missingImports(existing);
  if (missing.length === 0) {
    return { kind: "ok", detail: "already imports the workflow files", content: null, added: [] };
  }
  // Keep the import block contiguous: if the file already opens with an
  // @-import, butt the new lines directly against it; otherwise separate the
  // import block from the prose with a blank line.
  const separator = existing.trimStart().startsWith("@") ? "\n" : "\n\n";
  return {
    kind: "merge",
    detail: `adding ${missing.join(", ")}, keeping your content`,
    content: missing.join("\n") + separator + existing,
    added: missing,
  };
}

/** Execute a plan. Returns true when CLAUDE.md was written. */
export function applyClaudeImports(root: string, plan: ClaudeImportsPlan): boolean {
  if (plan.content === null) return false;
  writeFileSync(join(root, CLAUDE_MD_FILENAME), plan.content, "utf8");
  return true;
}
