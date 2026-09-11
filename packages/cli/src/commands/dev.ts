import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MANIFEST_FILENAME, parseManifest, type Manifest } from "../lib/manifest.js";
import {
  BROWSER_ENV_FILE,
  DEV_LOG_FILE,
  DEV_PID_FILE,
  DEV_URL_FILE,
  ensureStateDir,
  INSTALL_HINT,
  mergeStackState,
  missingDependencies,
  readStackState,
  resolveStackStart,
  STACK_STATE_FILE,
  waitForOrigins,
  writeBrowserEnv,
  type OriginStatus,
} from "../lib/stack.js";

export interface DevOptions {
  cwd: string;
  /** Start detached, log to .launchrail/state/dev.log, wait for readiness, leave it running. */
  background: boolean;
  /** Re-address the single derived origin and expose PORT to the start command. */
  port: string | null;
  /** Stop the background stack recorded in dev.pid. */
  stop: boolean;
  /** Start, wait for every origin, assert the state files, tear down — the adoption-time proof. */
  check: boolean;
  /** Readiness deadline for --background and --check. */
  timeoutMs?: number;
}

export interface DevOutcome {
  code: number;
  origins: Record<string, string>;
  /** Per-origin readiness after the wait (background/check only). */
  ready: Record<string, OriginStatus>;
  pid: number | null;
}

const NONE: DevOutcome = { code: 1, origins: {}, ready: {}, pid: null };
const DEFAULT_TIMEOUT_MS = 120_000;

function loadManifest(cwd: string): Manifest | null {
  const path = join(cwd, MANIFEST_FILENAME);
  if (!existsSync(path)) {
    console.error(`launchrail: ${MANIFEST_FILENAME} not found — run \`launchrail init\` first.`);
    return null;
  }
  const parsed = parseManifest(readFileSync(path, "utf8"));
  if (!parsed.manifest) {
    console.error(`launchrail: ${MANIFEST_FILENAME} is invalid:`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    return null;
  }
  return parsed.manifest;
}

function readPid(cwd: string): number | null {
  const path = join(cwd, DEV_PID_FILE);
  if (!existsSync(path)) return readStackState(cwd)?.pid ?? null;
  const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stop the detached stack: the whole process group when the platform has one, the pid otherwise. */
export async function stopStack(cwd: string): Promise<{ code: number; pid: number | null }> {
  const pid = readPid(cwd);
  if (pid === null) {
    console.log("No background stack recorded (no .launchrail/state/dev.pid) — nothing to stop.");
    return { code: 0, pid: null };
  }
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // Already gone.
      }
    }
    for (let i = 0; i < 20 && alive(pid); i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!alive(pid)) break;
  }
  rmSync(join(cwd, DEV_PID_FILE), { force: true });
  mergeStackState(cwd, { pid: null });
  console.log(alive(pid) ? `launchrail: pid ${pid} did not exit.` : `Stopped the background stack (pid ${pid}).`);
  return { code: alive(pid) ? 1 : 0, pid };
}

function printReadiness(origins: Record<string, string>, ready: Record<string, OriginStatus>): void {
  for (const [name, url] of Object.entries(origins)) {
    const status = ready[name];
    console.log(`  ${status ? "✓" : "✗"} ${name}: ${url}${status ? ` (${status})` : " — not answering"}`);
  }
}

/**
 * Start the smokeable stack from the manifest and own its state (ADR-0036):
 * `.launchrail/state/stack.json` (origins, pid, log — merged with whatever a
 * composed start command writes there), `dev.url`/`dev.pid` for shells, and
 * `browser.env` for the smoke's driver. The seeded `scripts/dev.mjs` delegates
 * here, so adapted copies in older projects can no longer drift away from the
 * contract the `launch-browser-smoke` skill relies on.
 */
export async function runDev(opts: DevOptions): Promise<DevOutcome> {
  const manifest = loadManifest(opts.cwd);
  if (!manifest) return NONE;
  if (opts.stop) {
    const stopped = await stopStack(opts.cwd);
    return { ...NONE, code: stopped.code, pid: stopped.pid };
  }

  if (missingDependencies(opts.cwd)) {
    console.error(`launchrail: dependencies are not installed (no node_modules) — ${INSTALL_HINT}.`);
    return NONE;
  }

  const stack = resolveStackStart(manifest, opts.port);
  if (!stack.command) {
    console.error(
      `launchrail: no start command — set testing.devCommand in ${MANIFEST_FILENAME}, or smoke.start (with smoke.origins) for a composed stack.`,
    );
    return NONE;
  }

  ensureStateDir(opts.cwd);
  const browser = writeBrowserEnv(opts.cwd);
  const env: NodeJS.ProcessEnv = opts.port ? { ...process.env, PORT: opts.port } : { ...process.env };
  const primary = Object.values(stack.origins)[0] ?? null;
  const detached = opts.background || opts.check;

  console.log(`Starting the stack via ${stack.source}: ${stack.command}`);
  if (stack.composed && opts.port) {
    console.log("  --port is passed through as PORT; a composed stack's origins are the declared ones.");
  }

  if (!detached) {
    mergeStackState(opts.cwd, { command: stack.command, origins: stack.origins, pid: null, log: null, startedAt: new Date().toISOString() });
    if (primary) writeFileSync(join(opts.cwd, DEV_URL_FILE), primary + "\n", "utf8");
    const result = spawnSync(stack.command, { cwd: opts.cwd, shell: true, stdio: "inherit", env });
    return { code: result.status ?? 0, origins: stack.origins, ready: {}, pid: null };
  }

  const log = openSync(join(opts.cwd, DEV_LOG_FILE), "a");
  const child = spawn(stack.command, { cwd: opts.cwd, shell: true, detached: true, stdio: ["ignore", log, log], env });
  child.unref();
  const pid = child.pid ?? null;
  if (pid !== null) writeFileSync(join(opts.cwd, DEV_PID_FILE), String(pid) + "\n", "utf8");
  if (primary) writeFileSync(join(opts.cwd, DEV_URL_FILE), primary + "\n", "utf8");
  mergeStackState(opts.cwd, {
    command: stack.command,
    origins: stack.origins,
    pid,
    log: DEV_LOG_FILE,
    startedAt: new Date().toISOString(),
  });

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  console.log(`  pid ${pid ?? "?"} · log ${DEV_LOG_FILE} · waiting up to ${Math.round(timeoutMs / 1000)}s for ${Object.keys(stack.origins).length} origin(s)`);
  const ready = await waitForOrigins(stack.origins, timeoutMs);
  printReadiness(stack.origins, ready);
  const allReady = Object.values(ready).every((s) => s !== null);

  // A composed start command may have merged its real origins/keys into stack.json meanwhile.
  const state = readStackState(opts.cwd);
  console.log(
    `  state: ${STACK_STATE_FILE}${state && Object.keys(state).some((k) => !["schemaVersion", "command", "origins", "pid", "log", "startedAt"].includes(k)) ? " (the start command added fields)" : ""}` +
      ` · ${DEV_URL_FILE} · ${DEV_PID_FILE}`,
  );
  console.log(
    `  browser: ${browser.executablePath ? `${browser.executablePath} (${browser.source})` : "no Playwright Chromium found — agent-browser will use its own (npx agent-browser install)"}` +
      `${browser.args ? ` · args ${browser.args}` : ""} → ${BROWSER_ENV_FILE}`,
  );

  if (opts.check) {
    const filesOk = [STACK_STATE_FILE, DEV_URL_FILE, DEV_PID_FILE, BROWSER_ENV_FILE].every((f) => existsSync(join(opts.cwd, f)));
    await stopStack(opts.cwd);
    if (allReady && filesOk) {
      console.log("\nStack check passed: every origin answered and the state files were written.");
      return { code: 0, origins: stack.origins, ready, pid };
    }
    console.error(
      `\nStack check failed: ${allReady ? "state files missing" : "not every origin answered before the deadline"} — see ${DEV_LOG_FILE}.`,
    );
    return { code: 1, origins: stack.origins, ready, pid };
  }

  if (!allReady) {
    console.error(`\nlaunchrail: the stack did not answer on every origin within ${Math.round(timeoutMs / 1000)}s — it is still running; read ${DEV_LOG_FILE}, or stop it with \`launchrail dev --stop\`.`);
    return { code: 1, origins: stack.origins, ready, pid };
  }
  console.log(`\nStack ready. Stop it with \`launchrail dev --stop\`.`);
  return { code: 0, origins: stack.origins, ready, pid };
}
