import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { MANIFEST_FILENAME } from "./manifest.js";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export interface RepoDetection {
  isGitRepo: boolean;
  gitRemoteUrl: string | null;
  /** Share of the last 20 commit subjects following Conventional Commits; null when there is no history. */
  conventionalCommitRatio: number | null;
  packageManager: PackageManager | null;
  hasPackageJson: boolean;
  packageName: string | null;
  testScript: string | null;
  devScript: string | null;
  /** `@playwright/test` (or `playwright`) declared in dependencies/devDependencies. */
  hasPlaywrightDep: boolean;
  /** First `playwright.config.*` found at the repo root, if any. */
  playwrightConfigFile: string | null;
  projectName: string;
  hasAgentsMd: boolean;
  hasClaudeMd: boolean;
  hasManifest: boolean;
  /** The repo already carries real work (source manifest or agent files) — default the interview to the `existing` origin. */
  looksEstablished: boolean;
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const CONVENTIONAL_SUBJECT = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?:\s/;

export function detectRepo(root: string): RepoDetection {
  const isGitRepo = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  const gitRemoteUrl = isGitRepo ? git(root, ["remote", "get-url", "origin"]) : null;

  let conventionalCommitRatio: number | null = null;
  if (isGitRepo) {
    const log = git(root, ["log", "-n", "20", "--format=%s"]);
    const subjects = log ? log.split("\n").filter(Boolean) : [];
    if (subjects.length > 0) {
      conventionalCommitRatio = subjects.filter((s) => CONVENTIONAL_SUBJECT.test(s)).length / subjects.length;
    }
  }

  const hasPackageJson = existsSync(join(root, "package.json"));
  let packageName: string | null = null;
  let testScript: string | null = null;
  let devScript: string | null = null;
  let hasPlaywrightDep = false;
  let packageManagerField: string | null = null;
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        name?: unknown;
        scripts?: Record<string, unknown>;
        packageManager?: unknown;
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      if (typeof pkg.name === "string") packageName = pkg.name;
      if (typeof pkg.scripts?.test === "string") testScript = pkg.scripts.test;
      if (typeof pkg.scripts?.dev === "string") devScript = pkg.scripts.dev;
      if (typeof pkg.packageManager === "string") packageManagerField = pkg.packageManager;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      hasPlaywrightDep = "@playwright/test" in deps || "playwright" in deps;
    } catch {
      // Malformed package.json is doctor's problem, not detection's.
    }
  }

  const playwrightConfigFile =
    ["ts", "js", "mjs", "cjs", "mts", "cts"]
      .map((ext) => `playwright.config.${ext}`)
      .find((file) => existsSync(join(root, file))) ?? null;

  let packageManager: PackageManager | null = null;
  if (existsSync(join(root, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (existsSync(join(root, "yarn.lock"))) packageManager = "yarn";
  else if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) packageManager = "bun";
  else if (existsSync(join(root, "package-lock.json"))) packageManager = "npm";
  else if (packageManagerField) {
    const prefix = packageManagerField.split("@")[0];
    if (prefix === "pnpm" || prefix === "yarn" || prefix === "bun" || prefix === "npm") packageManager = prefix;
  }

  return {
    isGitRepo,
    gitRemoteUrl,
    conventionalCommitRatio,
    packageManager,
    hasPackageJson,
    packageName,
    testScript,
    devScript,
    hasPlaywrightDep,
    playwrightConfigFile,
    projectName: packageName ?? basename(root),
    hasAgentsMd: existsSync(join(root, "AGENTS.md")),
    hasClaudeMd: existsSync(join(root, "CLAUDE.md")),
    hasManifest: existsSync(join(root, MANIFEST_FILENAME)),
    // A package.json or pre-existing agent files mean there is already a
    // project here to adopt, not a blank slate to start from.
    looksEstablished:
      hasPackageJson ||
      existsSync(join(root, "AGENTS.md")) ||
      existsSync(join(root, "CLAUDE.md")),
  };
}
