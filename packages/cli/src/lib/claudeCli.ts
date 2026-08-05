import { spawnSync } from "node:child_process";
import { MARKETPLACE_REPO, PLUGIN_KEY } from "./claudeSettings.js";

/**
 * The committed declaration (ADR-0003) makes Claude Code offer the plugin when
 * a folder is trusted for the *first* time — a folder trusted before init ran
 * is never prompted. When the `claude` CLI is on PATH, init closes that gap by
 * installing the plugin directly (ADR-0011). These helpers wrap that CLI.
 *
 * Setting LAUNCHRAIL_SKIP_CLAUDE_CLI=1 disables all `claude` invocations —
 * the environment twin of `init --skip-plugin-install`, and the seam the test
 * suite uses so running tests never touches a developer's real Claude setup.
 */

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
  | { state: "failed"; step: "marketplace-add" | "plugin-install"; output: string }
  | { state: "no-cli" };

/**
 * Register the Launchrail marketplace and install the plugin at user scope.
 * Both underlying commands are idempotent ("already on disk" / "already
 * installed" exit 0), so re-running init stays safe.
 */
export function installLaunchrailPlugin(cwd: string): PluginInstallOutcome {
  if (detectClaudeCli(cwd) === null) return { state: "no-cli" };
  const add = runClaude(cwd, ["plugin", "marketplace", "add", MARKETPLACE_REPO]);
  if (!add.ok) {
    return { state: "failed", step: "marketplace-add", output: add.stderr || add.stdout };
  }
  const install = runClaude(cwd, ["plugin", "install", PLUGIN_KEY]);
  if (!install.ok) {
    return { state: "failed", step: "plugin-install", output: install.stderr || install.stdout };
  }
  return { state: "installed", alreadyInstalled: install.stdout.includes("already installed") };
}

export type PluginInstalledState = "installed" | "not-installed" | "no-cli" | "unreadable";

/** Whether the plugin is actually installed in Claude Code (via `claude plugin list --json`). */
export function launchrailPluginState(cwd: string): PluginInstalledState {
  if (detectClaudeCli(cwd) === null) return "no-cli";
  const res = runClaude(cwd, ["plugin", "list", "--json"]);
  if (!res.ok) return "unreadable";
  try {
    const plugins = JSON.parse(res.stdout) as Array<{ id?: string }>;
    return plugins.some((p) => p.id === PLUGIN_KEY) ? "installed" : "not-installed";
  } catch {
    return "unreadable";
  }
}
