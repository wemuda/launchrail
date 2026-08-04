import { readFileSync } from "node:fs";
import type { FileSpec } from "./writer.js";

export const RALPH_MODULE = "ralph";
export const RALPH_WORKFLOW_PATH = ".claude/workflows/ralph.js";

// The workflow script ships as a real .js asset (readable, reviewable, syntax-checkable)
// rather than an inline template string. It resolves from both src/ (tests) and dist/
// (published CLI) because the two are sibling directories of assets/.
const WORKFLOW_ASSET_URL = new URL("../../assets/ralph.workflow.js", import.meta.url);

export function ralphWorkflowContent(): string {
  return readFileSync(WORKFLOW_ASSET_URL, "utf8");
}

/**
 * Everything `launchrail add ralph` writes. The workflow script is managed-class —
 * it contains toolchain logic only (policy is overridden per run via workflow args,
 * never by editing the file), so Launchrail may replace it as the loop improves.
 * The skills half of Ralph (`ralph`, `ralph-implement`, `resolving-merge-conflicts`)
 * ships through the plugin and writes no files here.
 */
export function ralphFiles(): FileSpec[] {
  return [{ relPath: RALPH_WORKFLOW_PATH, content: ralphWorkflowContent(), ownership: "managed" }];
}
