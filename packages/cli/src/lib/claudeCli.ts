import { spawnSync } from "node:child_process";
import { MARKETPLACE_REPO, PLUGIN_KEY } from "./claudeSettings.js";

/**
 * The committed declaration (ADR-0003) makes Claude Code offer the plugin when
 * a folder is trusted for the *first* time — a folder trusted before init ran
 * is never prompted, and upstream dependencies are not declared at all. When
 * the `claude` CLI is on PATH, init closes both gaps by installing every
 * plugin the workflow depends on directly (ADR-0011). These helpers wrap that
 * CLI.
 *
 * Setting LAUNCHRAIL_SKIP_CLAUDE_CLI=1 disables all `claude` invocations —
 * the environment twin of `init --skip-plugin-install`, and the seam the test
 * suite uses so running tests never touches a developer's real Claude setup.
 */

export interface WorkflowPlugin {
  /** Marketplace source accepted by `claude plugin marketplace add` (owner/repo). */
  marketplace: string;
  /** Qualified id accepted by `claude plugin install` (plugin@marketplace). */
  id: string;
  /** Human-readable label for init/doctor messages. */
  label: string;
}

/** Every Claude Code plugin the Launchrail workflow depends on. */
export const WORKFLOW_PLUGINS: WorkflowPlugin[] = [
  { marketplace: MARKETPLACE_REPO, id: PLUGIN_KEY, label: "Launchrail" },
  { marketplace: "mattpocock/skills", id: "mattpocock-skills@mattpocock", label: "Matt Pocock's skills" },
];

const RUN_OPTS = { encoding: "utf8" as const, timeout: 180_000 };

interface RunResult {
  ok: boolean;
  notFound: boolean;
  stdout: string;
  stderr: string;
}

function runClaude(cwd: string, args: string[]): RunResult {
  const res = spawnSync("claude", args, { ...RUN_OPTS, cwd });
  return {
    ok: res.status === 0,
    notFound: res.error !== undefined,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}

/** The `claude` CLI version, or null when it is unavailable or opted out. */
export function detectClaudeCli(cwd: string): string | null {
  if (process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI) return null;
  const res = runClaude(cwd, ["--version"]);
  if (!res.ok || res.notFound) return null;
  return res.stdout || "unknown version";
}

export type PluginInstallOutcome =
  | { state: "installed"; alreadyInstalled: boolean }
  | { state: "failed"; step: "marketplace-add" | "plugin-install"; output: string };

/**
 * Register one plugin's marketplace and install it at user scope. Both
 * underlying commands are idempotent ("already on disk" / "already installed"
 * exit 0), so re-running init stays safe. Assumes the CLI is present —
 * callers detect first.
 */
export function installPlugin(cwd: string, plugin: WorkflowPlugin): PluginInstallOutcome {
  const add = runClaude(cwd, ["plugin", "marketplace", "add", plugin.marketplace]);
  if (!add.ok) {
    return { state: "failed", step: "marketplace-add", output: add.stderr || add.stdout };
  }
  const install = runClaude(cwd, ["plugin", "install", plugin.id]);
  if (!install.ok) {
    return { state: "failed", step: "plugin-install", output: install.stderr || install.stdout };
  }
  return { state: "installed", alreadyInstalled: install.stdout.includes("already installed") };
}

export type InstalledPluginIds =
  | { state: "ok"; ids: string[] }
  | { state: "no-cli" }
  | { state: "unreadable" };

/** The ids of installed plugins, via `claude plugin list --json`. */
export function listInstalledPluginIds(cwd: string): InstalledPluginIds {
  if (detectClaudeCli(cwd) === null) return { state: "no-cli" };
  const res = runClaude(cwd, ["plugin", "list", "--json"]);
  if (!res.ok) return { state: "unreadable" };
  try {
    const plugins = JSON.parse(res.stdout) as Array<{ id?: string }>;
    return { state: "ok", ids: plugins.map((p) => p.id).filter((id): id is string => typeof id === "string") };
  } catch {
    return { state: "unreadable" };
  }
}
