import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Manifest } from "./manifest.js";

/**
 * The smokeable stack's state (ADR-0036): where `launchrail dev` records what
 * it started, and where the browser smoke reads it back. The directory ignores
 * itself in git, so nothing here — URLs, pids, logs, a throwaway driver script —
 * ever shows up as an untracked file.
 */
export const STATE_DIR = ".launchrail/state";
export const STACK_STATE_FILE = `${STATE_DIR}/stack.json`;
export const DEV_URL_FILE = `${STATE_DIR}/dev.url`;
export const DEV_PID_FILE = `${STATE_DIR}/dev.pid`;
export const DEV_LOG_FILE = `${STATE_DIR}/dev.log`;
export const BROWSER_ENV_FILE = `${STATE_DIR}/browser.env`;

export const DEFAULT_APP_URL = "http://localhost:3000";

export function ensureStateDir(cwd: string): void {
  mkdirSync(join(cwd, STATE_DIR), { recursive: true });
  const ignore = join(cwd, STATE_DIR, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n", "utf8");
}

/** True when the state directory exists but does not ignore itself (written by an older seed). */
export function stateDirUnignored(cwd: string): boolean {
  return existsSync(join(cwd, STATE_DIR)) && !existsSync(join(cwd, STATE_DIR, ".gitignore"));
}

export interface StackStart {
  /** The command that boots the stack — smoke.start, else testing.devCommand; null when neither is set. */
  command: string | null;
  /** Where the command came from, for messages. */
  source: "smoke.start" | "testing.devCommand" | null;
  /** name → URL. Declared for a composed stack; the single `app` at testing.appUrl otherwise. */
  origins: Record<string, string>;
  /** Origins were declared in the manifest (a composed stack) rather than derived. */
  composed: boolean;
}

/** Resolve how this project's smokeable stack starts and where it answers. */
export function resolveStackStart(manifest: Manifest, port: string | null = null): StackStart {
  const composed = Object.keys(manifest.smoke.origins).length > 0;
  const command = manifest.smoke.start ?? manifest.testing.devCommand;
  const source = manifest.smoke.start ? "smoke.start" : manifest.testing.devCommand ? "testing.devCommand" : null;
  let origins: Record<string, string>;
  if (composed) {
    origins = { ...manifest.smoke.origins };
  } else {
    const url = new URL(manifest.testing.appUrl ?? DEFAULT_APP_URL);
    // --port only re-addresses the derived single origin; a composed stack's
    // start command owns its ports and writes the real ones into stack.json.
    if (port) url.port = port;
    origins = { app: url.href.replace(/\/$/, "") };
  }
  return { command, source, origins, composed };
}

export interface StackState {
  schemaVersion: 1;
  command: string | null;
  origins: Record<string, string>;
  pid: number | null;
  log: string | null;
  startedAt: string | null;
  [extra: string]: unknown;
}

/**
 * Read-merge-write: both `launchrail dev` and a composed stack's start command
 * write here, so neither ever replaces the other's fields — the start command
 * adds what the smoke needs (keys, fixture ids, a mailbox path), the CLI adds
 * what it started.
 */
export function mergeStackState(cwd: string, patch: Partial<StackState>): StackState {
  const path = join(cwd, STACK_STATE_FILE);
  let current: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (typeof parsed === "object" && parsed !== null) current = parsed as Record<string, unknown>;
    } catch {
      // A half-written or hand-edited file is replaced, not fatal.
    }
  }
  const next = {
    schemaVersion: 1 as const,
    command: null,
    origins: {},
    pid: null,
    log: null,
    startedAt: null,
    ...current,
    ...patch,
  } as StackState;
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function readStackState(cwd: string): StackState | null {
  const path = join(cwd, STACK_STATE_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StackState;
  } catch {
    return null;
  }
}

export interface BrowserEnv {
  /** A Chromium the driver can reuse — Playwright's, so no second download. */
  executablePath: string | null;
  /** Where it was found, for doctor and messages. */
  source: string | null;
  /** Comma-separated launch args; root containers need the sandbox off. */
  args: string | null;
}

const KNOWN_CHROMIUM_PATHS = ["/opt/pw-browsers/chromium"];

function chromiumUnder(dir: string): string | null {
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries.filter((e) => e.startsWith("chromium")).sort().reverse()) {
    for (const rel of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe"]) {
      const candidate = join(dir, entry, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Where the browser smoke's driver finds a browser. Resolution order: an
 * explicit AGENT_BROWSER_EXECUTABLE_PATH; Playwright's browsers path (a file,
 * or a directory of `chromium-*` builds); the hosted image's Chromium;
 * Playwright's per-user cache. None found means agent-browser downloads its
 * own (`npx agent-browser install`). File checks only — doctor may call this.
 */
export function resolveBrowserEnv(env: NodeJS.ProcessEnv = process.env): BrowserEnv {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const args = isRoot ? "--no-sandbox,--disable-dev-shm-usage" : null;
  const found = (executablePath: string, source: string): BrowserEnv => ({ executablePath, source, args });

  if (env.AGENT_BROWSER_EXECUTABLE_PATH) return found(env.AGENT_BROWSER_EXECUTABLE_PATH, "AGENT_BROWSER_EXECUTABLE_PATH");
  if (env.PLAYWRIGHT_BROWSERS_PATH) {
    const p = env.PLAYWRIGHT_BROWSERS_PATH;
    if (isFile(p)) return found(p, "PLAYWRIGHT_BROWSERS_PATH");
    const under = chromiumUnder(p);
    if (under) return found(under, "PLAYWRIGHT_BROWSERS_PATH");
  }
  for (const known of KNOWN_CHROMIUM_PATHS) {
    if (isFile(known)) return found(known, "hosted image");
  }
  const caches = [
    join(homedir(), ".cache", "ms-playwright"),
    join(homedir(), "Library", "Caches", "ms-playwright"),
    ...(env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, "ms-playwright")] : []),
  ];
  for (const cache of caches) {
    const under = chromiumUnder(cache);
    if (under) return found(under, "Playwright cache");
  }
  return { executablePath: null, source: null, args };
}

/**
 * The shell fragment the smoke sources before its first driver command.
 * The env-var form is the reliable one: `--executable-path` is ignored once a
 * daemon is running and only warns.
 */
export function browserEnvFile(resolved: BrowserEnv): string {
  const lines = [
    "# Written by `launchrail dev` — source it before the first agent-browser command:",
    `#   set -a; . ${BROWSER_ENV_FILE}; set +a`,
    "# The env-var form is reliable; --executable-path is ignored once a daemon runs. Change it only after `agent-browser close`.",
  ];
  if (resolved.executablePath) {
    lines.push(`export AGENT_BROWSER_EXECUTABLE_PATH=${JSON.stringify(resolved.executablePath)}`);
  } else {
    lines.push("# No Playwright Chromium found — agent-browser uses its own: `npx agent-browser install`.");
  }
  if (resolved.args) lines.push(`export AGENT_BROWSER_ARGS=${JSON.stringify(resolved.args)}`);
  return lines.join("\n") + "\n";
}

export function writeBrowserEnv(cwd: string, env: NodeJS.ProcessEnv = process.env): BrowserEnv {
  ensureStateDir(cwd);
  const resolved = resolveBrowserEnv(env);
  writeFileSync(join(cwd, BROWSER_ENV_FILE), browserEnvFile(resolved), "utf8");
  return resolved;
}

export type OriginStatus = string | null;

/** One probe per origin: any HTTP response counts as ready; a connection failure does not. */
export async function probeOrigin(url: string, timeoutMs = 2000): Promise<OriginStatus> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return `HTTP ${response.status}`;
  } catch {
    return null;
  }
}

/** Poll every origin until all answer or the deadline passes. */
export async function waitForOrigins(
  origins: Record<string, string>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<Record<string, OriginStatus>> {
  const status: Record<string, OriginStatus> = Object.fromEntries(Object.keys(origins).map((name) => [name, null]));
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await Promise.all(
      Object.entries(origins).map(async ([name, url]) => {
        if (status[name] === null) status[name] = await probeOrigin(url);
      }),
    );
    if (Object.values(status).every((s) => s !== null) || Date.now() >= deadline) return status;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Dependencies missing from a Node project — the fix is the install, not the failing command. */
export function missingDependencies(cwd: string): boolean {
  return existsSync(join(cwd, "package.json")) && !existsSync(join(cwd, "node_modules"));
}

export const INSTALL_HINT = "run `node scripts/setup.mjs` (or the project's install command) first";
