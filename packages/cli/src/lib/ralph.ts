import { readFileSync } from "node:fs";
import type { FileSpec } from "./writer.js";

export const RALPH_MODULE = "ralph";
export const RALPH_WORKFLOW_PATH = ".claude/workflows/ralph.js";
export const RALPH_GUARD_HOOK_PATH = ".claude/hooks/ralph-permission-guard.py";

// The workflow script and the permission-guard hook ship as real assets
// (readable, reviewable, syntax-checkable) rather than inline template strings.
// They resolve from both src/ (tests) and dist/ (published CLI) because the two
// are sibling directories of assets/.
const WORKFLOW_ASSET_URL = new URL("../../assets/ralph.workflow.js", import.meta.url);
const GUARD_HOOK_ASSET_URL = new URL("../../assets/ralph.permission-guard.py", import.meta.url);

export function ralphWorkflowContent(): string {
  return readFileSync(WORKFLOW_ASSET_URL, "utf8");
}

export function ralphGuardHookContent(): string {
  return readFileSync(GUARD_HOOK_ASSET_URL, "utf8");
}

/**
 * Everything `launchrail add ralph` writes. Both files are managed-class — they
 * contain toolchain logic only (workflow policy is overridden per run via args,
 * never by editing the file), so Launchrail may replace them as the loop improves.
 *
 * - the workflow script (`.claude/workflows/ralph.js`), read by the Workflow tool;
 * - the unattended-launch guard hook, which warns when the loop is launched in an
 *   interactive permission mode (ADR-0021). The hook file rides here; its
 *   registration in the project-owned `.claude/settings.json` is an additive merge
 *   handled separately (see `planRalphGuardHook`), exactly like the plugin
 *   declaration, because that file is shared and never lockfile-tracked.
 *
 * The skills half of Ralph (`launch-ralph`, `launch-ralph-implement`,
 * `launch-resolving-merge-conflicts`) is vendored as managed skill files
 * (ADR-0019) and flows through `skillFiles()`, not here.
 */
export function ralphFiles(): FileSpec[] {
  return [
    { relPath: RALPH_WORKFLOW_PATH, content: ralphWorkflowContent(), ownership: "managed" },
    {
      relPath: RALPH_GUARD_HOOK_PATH,
      content: ralphGuardHookContent(),
      ownership: "managed",
      executable: true,
    },
  ];
}
