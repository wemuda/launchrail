import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { ADR_DIR, ADR_REGISTRY_PATH, isAdrRecordFilename } from "./adr.js";

/**
 * The generated ADR index (`docs/adr/README.md`, the rows between the markers)
 * is a pure derived artifact: two branches that each add a record and run
 * `launchrail adr index` insert different rows at the same anchor, which git's
 * line merge cannot order and reports as a textual conflict — even though the
 * records themselves (dated `YYYY-MM-DD-slug.md` names never collide) merge
 * cleanly. The conflict carries no real disagreement, so Launchrail resolves it
 * by regeneration rather than line-merge, via a named git merge driver.
 *
 * A merge driver is named in committed `.gitattributes` but *defined* in
 * per-clone git config, so it takes two installs: this module manages the
 * `.gitattributes` line (committed, additive) and registers the driver in the
 * repo's local git config (per clone, from init / sync / doctor). The driver
 * itself is `launchrail adr merge-driver` (see commands/adr.ts).
 */
export const ADR_MERGE_DRIVER_NAME = "launchrail-adr-index";

/** The committed `.gitattributes` file and the single line Launchrail manages in it. */
export const GITATTRIBUTES_FILENAME = ".gitattributes";
export const ADR_MERGE_ATTRIBUTE_LINE = `${ADR_REGISTRY_PATH} merge=${ADR_MERGE_DRIVER_NAME}`;

/** Human-readable driver name git shows in diagnostics. */
export const ADR_MERGE_DRIVER_DESCRIPTION = "Launchrail ADR registry index (regenerated on merge)";

/**
 * The command git stores in per-clone config and runs to resolve the file. It
 * invokes the same published package that generates the index, so the driver
 * can never drift from the generator's format (a hand-rolled driver in each
 * consumer repo would). `%O %A %B` are the base/ours/theirs temp files and `%P`
 * the path in the work tree; git reads the resolved result back from `%A`. The
 * placeholders are quoted so a temp path with a space cannot split an argument.
 */
export const ADR_MERGE_DRIVER_COMMAND = 'npx --yes @wemuda/launchrail adr merge-driver "%O" "%A" "%B" "%P"';

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function isGitRepo(cwd: string): boolean {
  return (git(cwd, ["rev-parse", "--is-inside-work-tree"]) ?? "").trim() === "true";
}

function gitDir(cwd: string): string {
  const dir = (git(cwd, ["rev-parse", "--git-dir"]) ?? ".git").trim() || ".git";
  return isAbsolute(dir) ? dir : join(cwd, dir);
}

/**
 * The commits carrying the "other side" of the operation git is resolving. Only
 * the three README temp files are guaranteed complete when the driver runs (with
 * merge-ort the incoming side's new record files are not yet on disk, nor in the
 * index), so the driver must read those records straight from git. Covers the
 * standard operations: merge exports `GITHEAD_<sha>` per merged head; cherry-pick
 * / revert / (stopped) rebase write their own head refs; rebase keeps the branch
 * being replayed under `.git/rebase-merge/orig-head` (or `rebase-apply/`).
 */
function incomingCommits(cwd: string): string[] {
  const shas = new Set<string>();
  for (const key of Object.keys(process.env)) {
    const match = /^GITHEAD_([0-9a-f]{7,64})$/.exec(key);
    if (match?.[1]) shas.add(match[1]);
  }
  for (const ref of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD"]) {
    const sha = (git(cwd, ["rev-parse", "--verify", "--quiet", ref]) ?? "").trim();
    if (sha) shas.add(sha);
  }
  const dir = gitDir(cwd);
  for (const rel of ["rebase-merge/orig-head", "rebase-apply/original-commit"]) {
    const path = join(dir, rel);
    if (!existsSync(path)) continue;
    const sha = readFileSync(path, "utf8").trim();
    if (sha) shas.add(sha);
  }
  return [...shas];
}

/** Read every ADR record blob under docs/adr/ from a tree-ish into `sources`. */
function recordsFromTree(cwd: string, treeish: string, sources: Map<string, string>, skipExisting: boolean): void {
  const listing = git(cwd, ["ls-tree", "-r", "-z", treeish, "--", `${ADR_DIR}/`]);
  if (!listing) return;
  for (const entry of listing.split("\0")) {
    if (!entry) continue;
    const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(entry);
    if (!match?.[1] || !match[2]) continue;
    const file = match[2].split("/").pop() ?? "";
    if (!isAdrRecordFilename(file) || (skipExisting && sources.has(file))) continue;
    const content = git(cwd, ["cat-file", "blob", match[1]]);
    if (content !== null) sources.set(file, content);
  }
}

/**
 * The tree of the real 3-way merge of two commit-ish, via `git merge-tree
 * --write-tree` (git >= 2.38). Null on older git (no `--write-tree`), a usage
 * error, or unparsable output. Exit 1 means "merged, with conflicts in some
 * files"; the tree is still written and returned — a genuinely conflicted record
 * would be surfaced by git separately, so the ADR index resolved off it is moot.
 */
function mergedTree(cwd: string, ours: string, theirs: string): string | null {
  const result = spawnSync("git", ["merge-tree", "--write-tree", ours, theirs], { cwd, encoding: "utf8" });
  if (result.error || (typeof result.status === "number" && result.status > 1)) return null;
  const first = (result.stdout ?? "").split("\n")[0]?.trim() ?? "";
  return /^[0-9a-f]{7,64}$/.test(first) ? first : null;
}

/**
 * Every ADR record in the merged corpus, file→source. Feed to
 * `entriesFromSources` to regenerate the index exactly as `launchrail adr index`
 * would over the finished merge — the property that keeps `adr index --check`
 * clean on the result.
 *
 * Only the three README temp files are guaranteed complete when git invokes the
 * driver: with merge-ort the incoming side's record files are not on disk yet,
 * nor in the index. So the records are read from git. Preferred path is a real
 * 3-way merged tree, which resolves records the incoming side *modifies* (a new
 * ADR that supersedes and re-statuses an older one) exactly as the finished merge
 * will. The fallback — this side's working tree plus the records only the
 * incoming side adds — covers older git and is correct for the additive case
 * (two branches each add a record).
 */
export function gatherMergedAdrSources(cwd: string): Map<string, string> {
  const head = (git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]) ?? "").trim();
  const incoming = incomingCommits(cwd);

  if (head && incoming.length === 1 && incoming[0]) {
    const tree = mergedTree(cwd, head, incoming[0]);
    if (tree) {
      const merged = new Map<string, string>();
      recordsFromTree(cwd, tree, merged, false);
      return merged;
    }
  }

  const sources = new Map<string, string>();
  const dir = join(cwd, ADR_DIR);
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!isAdrRecordFilename(file)) continue;
      try {
        sources.set(file, readFileSync(join(dir, file), "utf8"));
      } catch {
        sources.set(file, "");
      }
    }
  }
  for (const commit of incoming) recordsFromTree(cwd, commit, sources, true);
  return sources;
}

// --- .gitattributes (committed, additive) --------------------------------------

export type AttributePlanKind = "create" | "append" | "present";

export interface AttributePlan {
  kind: AttributePlanKind;
  detail: string;
  /** Full file content to write; null when the line is already present. */
  content: string | null;
}

/** Whether `.gitattributes` already binds the registry path to the driver. */
function hasMergeAttribute(source: string): boolean {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return false;
    const [pattern, ...attrs] = trimmed.split(/\s+/);
    return pattern === ADR_REGISTRY_PATH && attrs.includes(`merge=${ADR_MERGE_DRIVER_NAME}`);
  });
}

/**
 * Plan the `.gitattributes` line additively: create the file with just the line,
 * append the line (on its own newline) to an existing file, or do nothing when
 * the binding is already present. The file is shared and project-owned — never
 * lockfile-tracked, never rewritten wholesale, only this one line added.
 */
export function planAdrMergeAttribute(cwd: string): AttributePlan {
  const path = join(cwd, GITATTRIBUTES_FILENAME);
  if (!existsSync(path)) {
    return { kind: "create", detail: `add \`${ADR_MERGE_ATTRIBUTE_LINE}\``, content: `${ADR_MERGE_ATTRIBUTE_LINE}\n` };
  }
  const current = readFileSync(path, "utf8");
  if (hasMergeAttribute(current)) {
    return { kind: "present", detail: "already binds the ADR index to the merge driver", content: null };
  }
  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  return {
    kind: "append",
    detail: `append \`${ADR_MERGE_ATTRIBUTE_LINE}\``,
    content: `${current}${separator}${ADR_MERGE_ATTRIBUTE_LINE}\n`,
  };
}

/** Execute the `.gitattributes` plan. Returns true when the file was written. */
export function applyAdrMergeAttribute(cwd: string): boolean {
  const plan = planAdrMergeAttribute(cwd);
  if (plan.content === null) return false;
  writeFileSync(join(cwd, GITATTRIBUTES_FILENAME), plan.content, "utf8");
  return true;
}

// --- git config (per clone) ----------------------------------------------------

export type MergeDriverConfigState = "registered" | "mismatch" | "unregistered" | "not-git";

/** Whether the driver is defined in this clone's local git config. */
export function adrMergeDriverConfigState(cwd: string): MergeDriverConfigState {
  if (!isGitRepo(cwd)) return "not-git";
  const current = git(cwd, ["config", "--local", "--get", `merge.${ADR_MERGE_DRIVER_NAME}.driver`]);
  if (current === null) return "unregistered";
  return current.trim() === ADR_MERGE_DRIVER_COMMAND ? "registered" : "mismatch";
}

/**
 * Register (or correct) the driver in the repo's local git config. Idempotent,
 * and a no-op outside a git repo. Because the definition is per-clone and never
 * committed, this must run from whatever a fresh clone runs (init / sync /
 * doctor) rather than once behind a lockfile-recorded migration. Returns whether
 * it changed anything.
 */
export function registerAdrMergeDriver(cwd: string): boolean {
  const state = adrMergeDriverConfigState(cwd);
  if (state === "not-git" || state === "registered") return false;
  git(cwd, ["config", "--local", `merge.${ADR_MERGE_DRIVER_NAME}.name`, ADR_MERGE_DRIVER_DESCRIPTION]);
  git(cwd, ["config", "--local", `merge.${ADR_MERGE_DRIVER_NAME}.driver`, ADR_MERGE_DRIVER_COMMAND]);
  return true;
}
