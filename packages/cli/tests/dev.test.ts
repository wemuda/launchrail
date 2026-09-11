import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runDev } from "../src/commands/dev.js";
import { browserEnvFile, mergeStackState, resolveBrowserEnv, resolveStackStart } from "../src/lib/stack.js";
import { parseManifest } from "../src/lib/manifest.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(async () => {
  // Never leave a detached server behind, whatever the test did.
  if (existsSync(join(tmp.root, ".launchrail/state/dev.pid"))) {
    await runDev({ cwd: tmp.root, background: false, port: null, stop: true, check: false });
  }
  tmp.cleanup();
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A one-file HTTP server standing in for the app; listens on PORT (or a default) and answers everything. */
const SERVER = (fallbackPort: number) =>
  `node -e "require('node:http').createServer((q,r)=>r.end('ok')).listen(process.env.PORT||${fallbackPort})"`;

function writeManifest(body: string): void {
  writeFileSync(join(tmp.root, ".launchrail.yml"), `schemaVersion: 1\n${body}`);
}

const dev = (opts: Partial<Parameters<typeof runDev>[0]>) =>
  runDev({ cwd: tmp.root, background: false, port: null, stop: false, check: false, timeoutMs: 15_000, ...opts });

describe("launchrail dev — the stack start contract (ADR-0036)", () => {
  test("--background starts the dev command, waits for the app origin, and writes the state files", async () => {
    writeManifest(`testing:\n  devCommand: ${JSON.stringify(SERVER(4581))}\n  appUrl: http://localhost:4581\n`);
    const outcome = await dev({ background: true });
    expect(outcome.code).toBe(0);
    expect(outcome.origins).toEqual({ app: "http://localhost:4581" });
    expect(outcome.ready.app).toMatch(/^HTTP 200/);
    expect(outcome.pid).not.toBeNull();
    expect(alive(outcome.pid!)).toBe(true);

    const state = join(tmp.root, ".launchrail/state");
    expect(readFileSync(join(state, ".gitignore"), "utf8")).toBe("*\n");
    expect(readFileSync(join(state, "dev.url"), "utf8")).toBe("http://localhost:4581\n");
    expect(Number(readFileSync(join(state, "dev.pid"), "utf8"))).toBe(outcome.pid);
    expect(existsSync(join(state, "dev.log"))).toBe(true);
    expect(existsSync(join(state, "browser.env"))).toBe(true);
    const stack = JSON.parse(readFileSync(join(state, "stack.json"), "utf8"));
    expect(stack).toMatchObject({ schemaVersion: 1, origins: { app: "http://localhost:4581" }, pid: outcome.pid, log: ".launchrail/state/dev.log" });

    const stopped = await dev({ stop: true });
    expect(stopped.code).toBe(0);
    expect(alive(outcome.pid!)).toBe(false);
    expect(existsSync(join(state, "dev.pid"))).toBe(false);
    expect(JSON.parse(readFileSync(join(state, "stack.json"), "utf8")).pid).toBeNull();
  });

  test("--port re-addresses the app origin and reaches the command as PORT", async () => {
    writeManifest(`testing:\n  devCommand: ${JSON.stringify(SERVER(4582))}\n  appUrl: http://localhost:4582\n`);
    // The server listens on PORT when given one, so readiness on 4583 proves the env var arrived.
    const outcome = await dev({ background: true, port: "4583" });
    expect(outcome.code).toBe(0);
    expect(outcome.origins).toEqual({ app: "http://localhost:4583" });
    expect(readFileSync(join(tmp.root, ".launchrail/state/dev.url"), "utf8")).toBe("http://localhost:4583\n");
  });

  test("--check starts, waits, asserts the files, tears down, and passes", async () => {
    writeManifest(`testing:\n  devCommand: ${JSON.stringify(SERVER(4584))}\n  appUrl: http://localhost:4584\n`);
    const outcome = await dev({ check: true });
    expect(outcome.code).toBe(0);
    expect(outcome.ready.app).toMatch(/^HTTP/);
    expect(alive(outcome.pid!)).toBe(false);
    expect(existsSync(join(tmp.root, ".launchrail/state/dev.pid"))).toBe(false);
  });

  test("--check fails when an origin never answers, and still tears down", async () => {
    writeManifest(`testing:\n  devCommand: "node -e \\"setInterval(() => {}, 1000)\\""\n  appUrl: http://localhost:4585\n`);
    const outcome = await dev({ check: true, timeoutMs: 1500 });
    expect(outcome.code).toBe(1);
    expect(outcome.ready.app).toBeNull();
    expect(alive(outcome.pid!)).toBe(false);
  });

  test("a composed stack runs smoke.start and waits for every declared origin", async () => {
    const start = `node -e "const h=require('node:http');h.createServer((q,r)=>r.end('a')).listen(4586);h.createServer((q,r)=>r.end('b')).listen(4587)"`;
    writeManifest(
      `testing:\n  devCommand: "echo wrong"\nsmoke:\n  start: ${JSON.stringify(start)}\n  origins:\n    dashboard: http://localhost:4586\n    demo: http://localhost:4587/health\n`,
    );
    const outcome = await dev({ background: true });
    expect(outcome.code).toBe(0);
    expect(outcome.origins).toEqual({ dashboard: "http://localhost:4586", demo: "http://localhost:4587/health" });
    expect(outcome.ready.dashboard).toMatch(/^HTTP/);
    expect(outcome.ready.demo).toMatch(/^HTTP/);
    const stack = JSON.parse(readFileSync(join(tmp.root, ".launchrail/state/stack.json"), "utf8"));
    expect(stack.command).toBe(start);
    expect(readFileSync(join(tmp.root, ".launchrail/state/dev.url"), "utf8")).toBe("http://localhost:4586\n");
  });

  test("stack.json merges: fields a start command wrote survive the CLI's own write", () => {
    mkdirSync(join(tmp.root, ".launchrail/state"), { recursive: true });
    writeFileSync(
      join(tmp.root, ".launchrail/state/stack.json"),
      JSON.stringify({ fixtures: { publishableKey: "pk_test" }, mailbox: ".launchrail/state/mail/" }),
    );
    const merged = mergeStackState(tmp.root, { pid: 42, origins: { app: "http://localhost:1" } });
    expect(merged).toMatchObject({ schemaVersion: 1, pid: 42, origins: { app: "http://localhost:1" }, fixtures: { publishableKey: "pk_test" }, mailbox: ".launchrail/state/mail/" });
  });

  test("names the install when node_modules is missing, and the manifest field when no start command exists", async () => {
    writeFileSync(join(tmp.root, "package.json"), JSON.stringify({ name: "app" }));
    writeManifest("testing:\n  devCommand: npm run dev\n");
    expect((await dev({ background: true })).code).toBe(1);
    mkdirSync(join(tmp.root, "node_modules"));
    writeManifest("testing:\n  devCommand: null\n");
    expect((await dev({ background: true })).code).toBe(1);
    expect(existsSync(join(tmp.root, ".launchrail/state/dev.pid"))).toBe(false);
  });

  test("--stop with nothing recorded is a clean no-op", async () => {
    writeManifest("testing:\n  devCommand: echo hi\n");
    expect((await dev({ stop: true })).code).toBe(0);
  });
});

describe("stack resolution and the driver's browser", () => {
  test("derives the single app origin from testing.appUrl, re-addressed by port", () => {
    const m = parseManifest("schemaVersion: 1\ntesting:\n  devCommand: pnpm dev\n  appUrl: http://localhost:3000/app\n").manifest!;
    expect(resolveStackStart(m)).toEqual({ command: "pnpm dev", source: "testing.devCommand", origins: { app: "http://localhost:3000/app" }, composed: false });
    expect(resolveStackStart(m, "4000").origins).toEqual({ app: "http://localhost:4000/app" });
    const none = parseManifest("schemaVersion: 1\n").manifest!;
    expect(resolveStackStart(none)).toMatchObject({ command: null, source: null, origins: { app: "http://localhost:3000" } });
  });

  test("a declared smoke block wins and keeps its origins under --port", () => {
    const m = parseManifest("schemaVersion: 1\ntesting:\n  devCommand: pnpm dev\nsmoke:\n  start: node stack.mjs\n  origins:\n    api: http://localhost:3001\n").manifest!;
    const r = resolveStackStart(m, "9999");
    expect(r).toEqual({ command: "node stack.mjs", source: "smoke.start", origins: { api: "http://localhost:3001" }, composed: true });
  });

  test("browser resolution prefers an explicit path, then PLAYWRIGHT_BROWSERS_PATH, and turns the sandbox off for root", () => {
    const explicit = resolveBrowserEnv({ AGENT_BROWSER_EXECUTABLE_PATH: "/x/chrome" });
    expect(explicit).toMatchObject({ executablePath: "/x/chrome", source: "AGENT_BROWSER_EXECUTABLE_PATH" });
    const browsers = join(tmp.root, "browsers");
    mkdirSync(join(browsers, "chromium-1200", "chrome-linux"), { recursive: true });
    writeFileSync(join(browsers, "chromium-1200", "chrome-linux", "chrome"), "");
    const fromDir = resolveBrowserEnv({ PLAYWRIGHT_BROWSERS_PATH: browsers, HOME: tmp.root });
    expect(fromDir.executablePath).toBe(join(browsers, "chromium-1200", "chrome-linux", "chrome"));
    expect(fromDir.source).toBe("PLAYWRIGHT_BROWSERS_PATH");
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    expect(fromDir.args).toBe(isRoot ? "--no-sandbox,--disable-dev-shm-usage" : null);
    const file = browserEnvFile(fromDir);
    expect(file).toContain(`export AGENT_BROWSER_EXECUTABLE_PATH=${JSON.stringify(fromDir.executablePath)}`);
    expect(file).toContain("--executable-path is ignored once a daemon runs");
    expect(browserEnvFile({ executablePath: null, source: null, args: null })).toContain("npx agent-browser install");
  });
});
