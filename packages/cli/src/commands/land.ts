import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { MANIFEST_FILENAME } from "../lib/manifest.js";
import { ensureStateDir, STATE_DIR } from "../lib/stack.js";
import { runVerify } from "./verify.js";

/**
 * `launchrail land` — the Ralph lander as code (2026-10-21-session-orchestrator-trial).
 * It lands one pushed branch onto an integration base in the checkout it runs in:
 * fetch, fast-forward the base to the remote, merge the branch (--no-ff, its commits
 * preserved), install when dependency files changed, run the verify gate on the merged
 * tree, push, and confirm the remote. A conflict, a red gate, or a remote that keeps
 * moving leaves the base exactly at the remote tip. Nothing is stashed, discarded, or
 * pushed red. Gate output goes to a log; the result is the verdict.
 */

/** Gate logs and the record of every land, inside the self-ignoring state dir. */
export const LAND_DIR = `${STATE_DIR}/land`;
export const LAND_RECORD = `${LAND_DIR}/lands.jsonl`;
const LOCK_NAME = "launchrail-land.lock";
const TAIL_LINES = 40;

export type LandStatus =
  | "landed"
  | "already-landed"
  | "conflict"
  | "gate-failed"
  | "stale"
  | "failed"
  | "would-land"
  | "would-conflict";

export interface LandOptions {
  cwd: string;
  /** The pushed branch, by its name on the remote (e.g. ralph/12-magic-link). */
  branch: string;
  /** The integration base it lands on. */
  base: string;
  remote?: string;
  /** The ticket the branch implements: `(#n)` on the subject and a `Closes #n` line. */
  issue?: number | null;
  /** The merge commit's subject — the builder's Conventional Commit title. */
  title?: string | null;
  /** The tip the builder handed off; a remote branch that moved since is refused. */
  expect?: string | null;
  /** Gate with the full verification contract instead of the fast tier. */
  full?: boolean;
  /** The project's install command, run when the merge changes dependency files. */
  install?: string | null;
  /** Allow landing onto the remote's default branch (trunk mode). */
  trunk?: boolean;
  dryRun?: boolean;
}

export interface LandGate {
  tier: "fast" | "full";
  exitCode: number;
  /** The gate's whole output, relative to the project root. */
  log: string;
  /** The log's last lines when the gate failed — enough for a fresh implementer to act on. */
  tail: string[];
}

export interface LandResult {
  status: LandStatus;
  base: string;
  branch: string;
  /** The branch tip as the remote reported it. */
  branchSha: string | null;
  /** The remote base tip the land started from. */
  baseSha: string | null;
  /** The landing commit, confirmed on the remote. */
  mergeCommit: string | null;
  /** The base moved since the branch last synced: its tip was not contained in the branch. */
  baseMoved: boolean | null;
  conflicts: string[];
  /** The install command that ran because dependency files changed, or null. */
  installed: string | null;
  gate: LandGate | null;
  startedAt: string;
  durationMs: number;
  summary: string;
}

export interface LandOutcome {
  code: number;
  result: LandResult;
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

// Never wait on a credential prompt: an unattended land must fail, not hang.
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

function git(cwd: string, args: string[]): Run {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
  return { status: run.status ?? 1, stdout: (run.stdout ?? "").trim(), stderr: (run.stderr ?? "").trim() };
}

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
const lastLine = (text: string): string => lines(text).at(-1) ?? "no output";
const short = (sha: string | null): string => (sha ? sha.slice(0, 7) : "?");

function revParse(cwd: string, ref: string): string | null {
  const run = git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return run.status === 0 ? run.stdout : null;
}

function isAncestor(cwd: string, ancestor: string, descendant: string): boolean {
  return git(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]).status === 0;
}

/** Changes to these mean the merged tree needs an install before its gate can be trusted. */
const DEPENDENCY_FILE =
  /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|go\.sum|Cargo\.lock|composer\.lock)$/;

/** The install command for a JS project, from its lockfile; other ecosystems pass --install. */
export function detectInstallCommand(cwd: string): string | null {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm install --frozen-lockfile";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn install --frozen-lockfile";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun install --frozen-lockfile";
  if (existsSync(join(cwd, "package-lock.json")) || existsSync(join(cwd, "npm-shrinkwrap.json"))) return "npm ci";
  if (existsSync(join(cwd, "package.json"))) return "npm install";
  return null;
}

/** The remote's default branch from the live remote, else the local origin/HEAD; null when neither says. */
function remoteDefaultBranch(cwd: string, remote: string): string | null {
  const live = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(git(cwd, ["ls-remote", "--symref", remote, "HEAD"]).stdout);
  if (live?.[1]) return live[1];
  const cached = git(cwd, ["symbolic-ref", "--quiet", `refs/remotes/${remote}/HEAD`]);
  return cached.status === 0 ? cached.stdout.replace(`refs/remotes/${remote}/`, "") : null;
}

/** How the local base relates to the remote one: missing, equal, behind (fast-forwardable), ahead, or diverged. */
function localBaseState(cwd: string, base: string, baseRef: string): "absent" | "even" | "behind" | "ahead" | "diverged" {
  const local = revParse(cwd, `refs/heads/${base}`);
  if (!local) return "absent";
  const remote = revParse(cwd, baseRef);
  if (local === remote) return "even";
  if (isAncestor(cwd, local, baseRef)) return "behind";
  if (isAncestor(cwd, baseRef, local)) return "ahead";
  return "diverged";
}

/** The merge commit on the base that brought this exact tip in, when there is one. */
function landingCommit(cwd: string, branchSha: string | null, baseRef: string): string | null {
  if (!branchSha) return null;
  const merges = git(cwd, ["log", "--merges", "--ancestry-path", "--format=%H %P", `${branchSha}..${baseRef}`]);
  for (const line of lines(merges.stdout).reverse()) {
    const [commit, ...parents] = line.split(" ");
    if (commit && parents.slice(1).includes(branchSha)) return commit;
  }
  return null;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** One land at a time per repository. A lock whose holder is gone is taken over. */
function acquireLock(cwd: string, branch: string): { release: () => void } | { busy: string } {
  const dir = git(cwd, ["rev-parse", "--git-common-dir"]);
  if (dir.status !== 0) return { busy: "cannot locate the git directory for the land lock" };
  const path = join(isAbsolute(dir.stdout) ? dir.stdout : join(cwd, dir.stdout), LOCK_NAME);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, branch, since: new Date().toISOString() }));
      closeSync(fd);
      return {
        release: () => {
          try {
            unlinkSync(path);
          } catch {
            // Already gone; nothing to release.
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let holder: { pid?: unknown; branch?: unknown; since?: unknown } = {};
      try {
        holder = JSON.parse(readFileSync(path, "utf8")) as typeof holder;
      } catch {
        // Unreadable lock: treat its holder as gone.
      }
      if (typeof holder.pid === "number" && alive(holder.pid)) {
        return { busy: `another land is running (pid ${holder.pid}, ${String(holder.branch)}, since ${String(holder.since)})` };
      }
      try {
        unlinkSync(path);
      } catch {
        // Raced with its owner's release; try again.
      }
    }
  }
  return { busy: "could not take the land lock" };
}

type Attempt =
  | { kind: "pushed" }
  | { kind: "conflict"; files: string[] }
  | { kind: "merge-failed"; message: string }
  | { kind: "gate-failed"; install: boolean }
  | { kind: "rejected" }
  | { kind: "push-failed"; message: string };

export function runLand(opts: LandOptions): LandOutcome {
  const { cwd, base, branch } = opts;
  const startedMs = Date.now();
  const result: LandResult = {
    status: "failed",
    base,
    branch,
    branchSha: null,
    baseSha: null,
    mergeCommit: null,
    baseMoved: null,
    conflicts: [],
    installed: null,
    gate: null,
    startedAt: new Date(startedMs).toISOString(),
    durationMs: 0,
    summary: "",
  };
  // Only a Launchrail project's state dir receives the record, and a dry run writes nothing.
  let recordable = false;
  const finish = (status: LandStatus, summary: string): LandOutcome => {
    result.status = status;
    result.summary = summary;
    result.durationMs = Date.now() - startedMs;
    if (recordable && !opts.dryRun) {
      ensureStateDir(cwd);
      mkdirSync(join(cwd, LAND_DIR), { recursive: true });
      appendFileSync(join(cwd, LAND_RECORD), `${JSON.stringify(result)}\n`, "utf8");
    }
    return { code: status === "landed" || status === "already-landed" || status === "would-land" ? 0 : 1, result };
  };

  if (!existsSync(join(cwd, MANIFEST_FILENAME))) {
    return finish("failed", `${MANIFEST_FILENAME} not found — land gates with the project's verify contract; run it from the project root`);
  }
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"]).stdout !== "true") return finish("failed", "not inside a git work tree");
  recordable = true;
  // The lock comes first: a land that finds another one mid-merge must say so, not
  // report the other land's half-merged tree as a dirty checkout.
  if (opts.dryRun) return landSteps(opts, result, finish);
  const lock = acquireLock(cwd, branch);
  if ("busy" in lock) return finish("failed", lock.busy);
  try {
    return landSteps(opts, result, finish);
  } finally {
    lock.release();
  }
}

/** The land itself, from the clean-tree check to the remote's confirmation: under the lock, or lock-free for a dry run. */
function landSteps(opts: LandOptions, result: LandResult, finish: (status: LandStatus, summary: string) => LandOutcome): LandOutcome {
  const { cwd, base, branch } = opts;
  const remote = opts.remote ?? "origin";
  const tier = opts.full ? "full" : "fast";
  const baseRef = `refs/remotes/${remote}/${base}`;
  const branchRef = `refs/remotes/${remote}/${branch}`;
  const startedMs = Date.parse(result.startedAt);

  const dirty = git(cwd, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty.stdout) {
    return finish("failed", `dirty checkout — commit or stash first; land never stashes or discards: ${lines(dirty.stdout).slice(0, 5).join(", ")}`);
  }
  if (git(cwd, ["remote", "get-url", remote]).status !== 0) return finish("failed", `no remote named ${remote}`);
  if (!opts.trunk && remoteDefaultBranch(cwd, remote) === base) {
    return finish("failed", `${base} is ${remote}'s default branch — pass --trunk to land onto it; a consolidation run leaves the default branch untouched`);
  }

  const fetch = git(cwd, ["fetch", "--quiet", remote, `+refs/heads/${base}:${baseRef}`, `+refs/heads/${branch}:${branchRef}`]);
  if (fetch.status !== 0) {
    const missing = /couldn't find remote ref (\S+)/.exec(fetch.stderr)?.[1];
    return finish(
      "failed",
      missing ? `${missing.replace(/^refs\/heads\//, "")} is not on ${remote} — push it first` : `fetch from ${remote} failed: ${lastLine(fetch.stderr)}`,
    );
  }
  result.baseSha = revParse(cwd, baseRef);
  result.branchSha = revParse(cwd, branchRef);
  if (opts.expect && !result.branchSha?.startsWith(opts.expect.toLowerCase())) {
    return finish("failed", `${branch} moved since the hand-off: expected ${short(opts.expect)}, ${remote} has ${short(result.branchSha)} — is another session still pushing to it?`);
  }
  if (isAncestor(cwd, branchRef, baseRef)) {
    result.mergeCommit = landingCommit(cwd, result.branchSha, baseRef);
    return finish(
      "already-landed",
      `${branch}@${short(result.branchSha)} is already on ${base}${result.mergeCommit ? ` (merged by ${short(result.mergeCommit)})` : ""} — nothing to merge; finish the bookkeeping`,
    );
  }

  const local = localBaseState(cwd, base, baseRef);
  if (local === "ahead") {
    return finish("failed", `local ${base} has commits that are not on ${remote} — push or reset them first; land never pushes work it did not merge`);
  }
  if (local === "diverged") {
    return finish("failed", `local ${base} has diverged from ${remote}/${base} — push or reset it first; land never resets your local base`);
  }

  if (opts.dryRun) {
    result.baseMoved = !isAncestor(cwd, baseRef, branchRef);
    const moved = result.baseMoved ? " (the base moved since the branch synced)" : "";
    const tree = git(cwd, ["merge-tree", "--write-tree", "--name-only", "--no-messages", baseRef, branchRef]);
    if (tree.status === 0) return finish("would-land", `${branch} merges cleanly onto ${base}${moved} — dry run: no checkout, merge, gate, or push`);
    if (tree.status === 1) {
      result.conflicts = lines(tree.stdout).slice(1);
      return finish("would-conflict", `${branch} would conflict on ${base} in ${result.conflicts.length} file(s)${moved} — dry run, nothing written`);
    }
    return finish("failed", `cannot predict the merge: ${lastLine(tree.stderr)}`);
  }

  // Where this checkout's tree, and so its installed dependencies, stood before the land.
  const before = revParse(cwd, "HEAD");
  const checkout =
    local === "absent"
      ? git(cwd, ["checkout", "--quiet", "-b", base, "--track", `${remote}/${base}`])
      : git(cwd, ["checkout", "--quiet", base]);
  if (checkout.status !== 0) return finish("failed", `could not check out ${base}: ${lastLine(checkout.stderr)}`);
  if (local === "behind" && git(cwd, ["merge", "--quiet", "--ff-only", baseRef]).status !== 0) {
    return finish("failed", `could not fast-forward ${base} to ${remote}/${base}`);
  }

  ensureStateDir(cwd);
  mkdirSync(join(cwd, LAND_DIR), { recursive: true });
  const logRel = `${LAND_DIR}/${result.startedAt.replace(/[:.]/g, "-")}-${branch.replace(/[^A-Za-z0-9._-]+/g, "-")}.log`;
  const logAbs = join(cwd, logRel);
  const fd = openSync(logAbs, "a");
  writeSync(fd, `launchrail land ${branch} -> ${base} (${tier} gate), ${result.startedAt}\n`);

  const installCommand = (): string | null => opts.install ?? detectInstallCommand(cwd);
  const runInstall = (command: string, why: string): number => {
    writeSync(fd, `\n→ install (${why}): ${command}\n`);
    return spawnSync(command, { cwd, shell: true, stdio: ["ignore", fd, fd], env: ENV }).status ?? 1;
  };
  const dependenciesChanged = (from: string | null, to: string): boolean =>
    from !== null && lines(git(cwd, ["diff", "--name-only", from, to]).stdout).some((file) => DEPENDENCY_FILE.test(file));
  // The tree moved without this land's merge (a fast-forward, or the remote moving under
  // a push): bring the installed dependencies along, or the gate judges a stale install.
  const catchUp = (from: string | null): void => {
    const command = installCommand();
    if (command && dependenciesChanged(from, "HEAD")) {
      result.installed = command;
      runInstall(command, "the base's dependency files changed");
    }
  };

  const subject = `${opts.title ?? `chore: land ${branch}`}${opts.issue ? ` (#${opts.issue})` : ""}`;
  const mergeArgs = ["merge", "--no-ff", "--no-edit", "-m", subject];
  if (opts.issue) mergeArgs.push("-m", `Closes #${opts.issue}`);
  mergeArgs.push("-m", `Landed from ${branch}@${short(result.branchSha)} by launchrail land.`, branchRef);

  // Back to exactly the remote base tip. node_modules is not tracked, so an install
  // this attempt ran is re-run on the restored tree to match the base's lockfile.
  const restore = (installed: string | null): void => {
    git(cwd, ["merge", "--abort"]);
    git(cwd, ["reset", "--quiet", "--hard", baseRef]);
    if (installed) runInstall(installed, "restore the base's dependencies");
  };

  const attempt = (): Attempt => {
    result.baseMoved = !isAncestor(cwd, baseRef, branchRef);
    const merge = git(cwd, mergeArgs);
    if (merge.status !== 0) {
      const files = lines(git(cwd, ["diff", "--name-only", "--diff-filter=U"]).stdout);
      restore(null);
      return files.length > 0 ? { kind: "conflict", files } : { kind: "merge-failed", message: lastLine(merge.stderr || merge.stdout) };
    }
    let installed: string | null = null;
    if (dependenciesChanged("HEAD^1", "HEAD")) {
      installed = installCommand();
      if (installed) {
        result.installed = installed;
        const status = runInstall(installed, "dependency files changed");
        if (status !== 0) {
          result.gate = { tier, exitCode: status, log: logRel, tail: lines(readFileSync(logAbs, "utf8")).slice(-TAIL_LINES) };
          restore(installed);
          return { kind: "gate-failed", install: true };
        }
      } else {
        writeSync(fd, "\n(dependency files changed, but no install command is known — pass --install)\n");
      }
    }
    const verify = runVerify(cwd, { fast: !opts.full, outputFd: fd });
    result.gate = { tier, exitCode: verify.code, log: logRel, tail: [] };
    if (verify.code !== 0) {
      result.gate.tail = lines(readFileSync(logAbs, "utf8")).slice(-TAIL_LINES);
      restore(installed);
      return { kind: "gate-failed", install: false };
    }
    const push = git(cwd, ["push", "--quiet", remote, `HEAD:refs/heads/${base}`]);
    if (push.status === 0) return { kind: "pushed" };
    restore(installed);
    // Rejected client-side (the remote moved before the push), or server-side when it
    // moved between the ref advertisement and the update.
    if (/\[rejected\]|non-fast-forward|fetch first|cannot lock ref|but expected/i.test(push.stderr)) return { kind: "rejected" };
    return { kind: "push-failed", message: lastLine(push.stderr) };
  };

  try {
    catchUp(before);
    for (let round = 1; ; round++) {
      const step = attempt();
      if (step.kind === "pushed") break;
      if (step.kind === "conflict") {
        result.conflicts = step.files;
        return finish("conflict", `${branch} conflicts with ${base} in ${step.files.length} file(s) — ${base} untouched; re-sync the branch`);
      }
      if (step.kind === "merge-failed") return finish("failed", `merge failed: ${step.message} — ${base} untouched`);
      if (step.kind === "gate-failed") {
        const what = step.install ? `the install (${result.installed}) failed on the merged tree` : `the merged tree failed the ${tier} gate`;
        return finish(
          "gate-failed",
          `${what}${result.baseMoved ? " — the base moved since the branch synced" : ""}; ${base} untouched, nothing pushed (log: ${logRel})`,
        );
      }
      if (step.kind === "push-failed") return finish("failed", `push to ${remote}/${base} failed: ${step.message} — ${base} untouched`);
      // Rejected: the remote base moved outside this checkout. Take the new tip, and
      // redo the merge and the gate once on it.
      const previous = revParse(cwd, "HEAD");
      const resynced = git(cwd, ["fetch", "--quiet", remote, `+refs/heads/${base}:${baseRef}`]).status === 0;
      if (resynced) {
        git(cwd, ["reset", "--quiet", "--hard", baseRef]);
        catchUp(previous);
      }
      if (round === 2) return finish("stale", `${remote}/${base} kept moving under the push — ${base} untouched; land again once it settles`);
      if (!resynced) return finish("failed", `fetch from ${remote} failed after a rejected push — ${base} untouched`);
      result.baseSha = revParse(cwd, baseRef);
      if (isAncestor(cwd, branchRef, baseRef)) {
        result.mergeCommit = landingCommit(cwd, result.branchSha, baseRef);
        return finish("already-landed", `${branch} reached ${base} from elsewhere while this land ran — nothing to merge; finish the bookkeeping`);
      }
    }
  } finally {
    closeSync(fd);
  }

  // Ground truth is the live remote: its tip is the landing commit, or (when another
  // push followed within seconds) a descendant of it.
  const head = revParse(cwd, "HEAD");
  const tip = /^(\S+)/.exec(git(cwd, ["ls-remote", remote, `refs/heads/${base}`]).stdout)?.[1] ?? null;
  const containsHead = (): boolean =>
    git(cwd, ["fetch", "--quiet", remote, `+refs/heads/${base}:${baseRef}`]).status === 0 && head !== null && isAncestor(cwd, head, baseRef);
  if (!head || !tip || (tip !== head && !containsHead())) {
    return finish("failed", `the push reported success but ${remote}/${base} is at ${short(tip)}, which does not contain ${short(head)} — check the remote before landing again`);
  }
  result.mergeCommit = head;
  // The tree was clean when the land began, so a tracked file modified now was written
  // by this land's own install or gate. Restore the landed tree, or the next land
  // would refuse a dirty checkout.
  const rewritten = lines(git(cwd, ["status", "--porcelain", "--untracked-files=no"]).stdout);
  if (rewritten.length > 0) git(cwd, ["reset", "--quiet", "--hard", "HEAD"]);
  const seconds = Math.round((Date.now() - startedMs) / 1000);
  return finish(
    "landed",
    `landed ${branch} on ${base} at ${short(head)} — ${tier} gate green, ${seconds}s` +
      (result.baseMoved ? "; the base had moved since the branch synced" : "") +
      (rewritten.length > 0 ? `; the gate rewrote ${rewritten.length} tracked file(s), restored — a gate should not write tracked files` : ""),
  );
}

/** Human output by default; one JSON object with --json, for an orchestrator to read. */
export function printLand(result: LandResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(`${result.status}: ${result.summary}`);
  for (const file of result.conflicts) console.log(`  conflict  ${file}`);
  if (result.gate) console.log(`  gate      ${result.gate.tier}, exit ${result.gate.exitCode} — ${result.gate.log}`);
  for (const line of result.gate?.tail ?? []) console.log(`  | ${line}`);
}

export const LAND_USAGE =
  "launchrail land <branch> --base <branch> [--issue <n>] [--title <subject>] [--expect <sha>] [--full] [--install <cmd>] [--trunk] [--remote <name>] [--dry-run] [--json]";

export interface ParsedLandArgs {
  options: Omit<LandOptions, "cwd">;
  json: boolean;
}

/** Parse `land`'s arguments; a missing or malformed one is an error, never a guess. */
export function parseLandArgs(argv: string[]): ParsedLandArgs | { error: string } {
  const valued = new Set(["--base", "--issue", "--title", "--expect", "--install", "--remote"]);
  const values: Record<string, string> = {};
  const switches = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (valued.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { error: `${arg} needs a value` };
      values[arg] = value;
      i++;
    } else if (["--full", "--trunk", "--dry-run", "--json"].includes(arg)) {
      switches.add(arg);
    } else if (arg.startsWith("-")) {
      return { error: `unknown option ${arg}` };
    } else {
      positional.push(arg);
    }
  }
  const branch = positional[0];
  const base = values["--base"];
  if (!branch || positional.length > 1) return { error: "name exactly one branch to land" };
  if (!base) return { error: "--base is required — the integration branch to land onto" };
  if (branch === base) return { error: "the branch and the base are the same" };
  if (values["--expect"] !== undefined && !/^[0-9a-f]{7,40}$/i.test(values["--expect"])) {
    return { error: `--expect must be a commit sha (7–40 hex characters), got ${values["--expect"]}` };
  }
  let issue: number | null = null;
  if (values["--issue"] !== undefined) {
    issue = Number(values["--issue"].replace(/^#/, ""));
    if (!Number.isInteger(issue) || issue <= 0) return { error: `--issue must be a ticket number, got ${values["--issue"]}` };
  }
  return {
    options: {
      branch,
      base,
      remote: values["--remote"] ?? "origin",
      issue,
      title: values["--title"] ?? null,
      expect: values["--expect"] ?? null,
      install: values["--install"] ?? null,
      full: switches.has("--full"),
      trunk: switches.has("--trunk"),
      dryRun: switches.has("--dry-run"),
    },
    json: switches.has("--json"),
  };
}
