import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import * as p from "@clack/prompts";
import { sha256 } from "../lib/checksum.js";
import { CLAUDE_MD_FILENAME, importsPath, REQUIRED_CLAUDE_IMPORTS, withoutImports } from "../lib/claudeImports.js";
import { CLAUDE_SETTINGS_PATH, planUnregisterRalphGuardHook } from "../lib/claudeSettings.js";
import { LOCKFILE_FILENAME, readLockfile, type Lockfile } from "../lib/lockfile.js";
import { MANIFEST_FILENAME } from "../lib/manifest.js";
import { RALPH_GUARD_HOOK_PATH } from "../lib/ralph.js";
import { STATE_DIR } from "../lib/stack.js";
import { runningStackPid } from "./dev.js";

export interface UninstallOptions {
  cwd: string;
  dryRun: boolean;
  yes: boolean;
}

export type UninstallActionKind = "remove" | "update" | "keep";

export interface UninstallAction {
  kind: UninstallActionKind;
  relPath: string;
  detail: string;
  /** `update` only: the file's content once Launchrail's lines are out. */
  content?: string;
  /** `remove` of a whole directory. */
  directory?: boolean;
}

export interface UninstallOutcome {
  code: number;
  actions: UninstallAction[];
}

const LABEL: Record<UninstallActionKind, string> = {
  remove: "remove  ",
  update: "update  ",
  keep: "keep    ",
};

function isFile(abs: string): boolean {
  return statSync(abs, { throwIfNoEntry: false })?.isFile() === true;
}

function isDirectory(abs: string): boolean {
  return statSync(abs, { throwIfNoEntry: false })?.isDirectory() === true;
}

/** Whether a lockfile path resolves inside the project — a hand-edited `../x` never does. */
function insideProject(root: string, relPath: string): boolean {
  const rel = relative(root, resolve(root, relPath));
  return rel !== "" && !isAbsolute(rel) && rel.split(sep)[0] !== "..";
}

/** Whether the repository at `cwd` holds any commit, on any ref or reflog. Null when git can't say. */
function hasCommits(cwd: string): boolean | null {
  try {
    const out = execFileSync("git", [`--git-dir=${join(cwd, ".git")}`, "rev-list", "-n", "1", "--all", "--reflog"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() !== "";
  } catch {
    return null;
  }
}

/**
 * Decide what uninstall would do, without touching disk. The lockfile is the
 * record of what Launchrail wrote, so it drives everything:
 *
 * - a tracked file still byte-identical to what Launchrail wrote (checksum
 *   match) is removed, whatever its class — nobody has made it theirs;
 * - an edited or ejected file is the project's, and stays;
 * - Launchrail's lines in shared project files (the guard hook registration in
 *   .claude/settings.json, the @-imports in CLAUDE.md) come out only when the
 *   file they point at is going, so nothing is left dangling or broken;
 * - the manifest, the lockfile and `dev`'s runtime state are Launchrail's own
 *   bookkeeping and always go — the lockfile last, so an interrupted run can
 *   simply be re-run;
 * - the git repository goes only when init created it and nothing has been
 *   committed to it since.
 */
export function planUninstall(cwd: string, lockfile: Lockfile): UninstallAction[] {
  const root = resolve(cwd);
  const actions: UninstallAction[] = [];
  const removed = new Set<string>();

  for (const [relPath, entry] of Object.entries(lockfile.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (relPath === MANIFEST_FILENAME) continue;
    if (!insideProject(root, relPath)) {
      actions.push({ kind: "keep", relPath, detail: "outside the project — never touched" });
      continue;
    }
    const abs = join(root, relPath);
    if (!isFile(abs)) continue;
    if (entry.class === "ejected") {
      actions.push({ kind: "keep", relPath, detail: "ejected — yours" });
    } else if (sha256(readFileSync(abs, "utf8")) !== entry.checksum) {
      actions.push({ kind: "keep", relPath, detail: `${entry.class} file edited since Launchrail wrote it — yours` });
    } else {
      actions.push({ kind: "remove", relPath, detail: `${entry.class}, unmodified since Launchrail wrote it` });
      removed.add(relPath);
    }
  }
  const remains = (relPath: string): boolean => existsSync(join(root, relPath)) && !removed.has(relPath);

  if (remains(CLAUDE_MD_FILENAME) && isFile(join(root, CLAUDE_MD_FILENAME))) {
    const current = readFileSync(join(root, CLAUDE_MD_FILENAME), "utf8");
    const dangling = REQUIRED_CLAUDE_IMPORTS.filter((imp) => !remains(imp.slice(1)) && importsPath(current, imp));
    if (dangling.length > 0) {
      const content = withoutImports(current, dangling);
      const kept = actions.find((action) => action.relPath === CLAUDE_MD_FILENAME);
      if (kept) {
        Object.assign(kept, { kind: "update", content, detail: `${kept.detail}; removing ${dangling.join(", ")}` });
      } else {
        actions.push({
          kind: "update",
          relPath: CLAUDE_MD_FILENAME,
          detail: `removing ${dangling.join(", ")}, keeping your content`,
          content,
        });
      }
    }
  }

  if (!remains(RALPH_GUARD_HOOK_PATH)) {
    const plan = planUnregisterRalphGuardHook(root);
    if (plan.content === "") {
      actions.push({ kind: "remove", relPath: CLAUDE_SETTINGS_PATH, detail: plan.detail });
    } else if (plan.content !== null) {
      actions.push({ kind: "update", relPath: CLAUDE_SETTINGS_PATH, detail: plan.detail, content: plan.content });
    }
  }

  if (isDirectory(join(root, STATE_DIR))) {
    actions.push({ kind: "remove", relPath: STATE_DIR, detail: "runtime state from `launchrail dev`", directory: true });
  }
  if (existsSync(join(root, MANIFEST_FILENAME))) {
    actions.push({ kind: "remove", relPath: MANIFEST_FILENAME, detail: "Launchrail's configuration" });
  }
  if (lockfile.decisions.gitInitialized === true && isDirectory(join(root, ".git"))) {
    const commits = hasCommits(root);
    actions.push(
      commits === false
        ? { kind: "remove", relPath: ".git", detail: "the repository init created — nothing committed to it", directory: true }
        : {
            kind: "keep",
            relPath: ".git",
            detail: commits ? "init created this repository, but it has commits now" : "could not inspect the repository",
          },
    );
  }
  actions.push({ kind: "remove", relPath: LOCKFILE_FILENAME, detail: "Launchrail's lockfile — removed last" });
  return actions;
}

/** Remove the directories the removals emptied, deepest first; rmdir refuses a non-empty one, which is the guard. */
function pruneEmptyDirectories(root: string, removedPaths: string[]): void {
  const dirs = [...new Set(removedPaths.map((relPath) => dirname(join(root, relPath))))].sort(
    (a, b) => b.length - a.length,
  );
  for (const dir of dirs) {
    for (let d = dir; d !== root && d.startsWith(root + sep); d = dirname(d)) {
      try {
        rmdirSync(d);
      } catch {
        break;
      }
    }
  }
}

/**
 * Take Launchrail out of a project — the counterpart to `init`, for a repo
 * initialized by mistake or one leaving the rail. Removes only what Launchrail
 * wrote and nobody has edited since (2026-10-07-uninstall-removes-only-unedited-files).
 */
export async function runUninstall(opts: UninstallOptions): Promise<UninstallOutcome> {
  const { lockfile, error } = readLockfile(opts.cwd);
  if (error) {
    console.error(`launchrail: ${LOCKFILE_FILENAME}: ${error} — refusing to guess which files Launchrail wrote.`);
    return { code: 1, actions: [] };
  }
  if (!lockfile) {
    if (existsSync(join(opts.cwd, MANIFEST_FILENAME))) {
      console.error(
        `launchrail: ${MANIFEST_FILENAME} found but no ${LOCKFILE_FILENAME} — without the lockfile, uninstall cannot tell which files Launchrail wrote. Nothing was removed.`,
      );
      return { code: 1, actions: [] };
    }
    console.log(`Launchrail is not installed here (no ${LOCKFILE_FILENAME}) — nothing to uninstall.`);
    return { code: 0, actions: [] };
  }
  const pid = runningStackPid(opts.cwd);
  if (pid !== null) {
    console.error(
      `launchrail: the background stack \`launchrail dev\` started is still running (pid ${pid}) — stop it with \`launchrail dev --stop\` first, or it is orphaned.`,
    );
    return { code: 1, actions: [] };
  }

  const actions = planUninstall(opts.cwd, lockfile);
  console.log("");
  for (const action of actions) {
    console.log(`  ${LABEL[action.kind]}  ${action.relPath}${action.directory ? "/" : ""}  (${action.detail})`);
  }
  const kept = actions.filter((action) => action.kind !== "remove");

  if (opts.dryRun) {
    console.log("\nDry run — nothing was removed.");
    return { code: 0, actions };
  }
  if (!opts.yes) {
    const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
    if (!interactive) {
      console.error("\nlaunchrail: non-interactive session — re-run with --yes to uninstall, or --dry-run to preview.");
      return { code: 1, actions };
    }
    const confirmed = await p.confirm({ message: "Remove Launchrail from this project?", initialValue: false });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled — nothing was removed.");
      return { code: 130, actions };
    }
  }

  const root = resolve(opts.cwd);
  const removedPaths: string[] = [];
  try {
    for (const action of actions) {
      const abs = join(root, action.relPath);
      if (action.kind === "update") writeFileSync(abs, action.content!, "utf8");
      if (action.kind === "remove") {
        rmSync(abs, { recursive: action.directory === true, force: true });
        removedPaths.push(action.relPath);
      }
    }
  } catch (err) {
    console.error(`\nlaunchrail: uninstall stopped: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`${LOCKFILE_FILENAME} goes last, so re-running \`launchrail uninstall\` finishes the job.`);
    return { code: 1, actions };
  }
  pruneEmptyDirectories(root, removedPaths);

  console.log(`\nRemoved ${removedPaths.length} path(s) and the directories they left empty — Launchrail is uninstalled.`);
  if (kept.length > 0) {
    console.log(`Kept (yours): ${kept.map((action) => action.relPath).join(", ")}`);
  }
  return { code: 0, actions };
}
