import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseJourneyNames, runSmoke } from "../src/commands/smoke.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
let server: Server | null = null;

beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(async () => {
  tmp.cleanup();
  if (server) {
    await new Promise((resolve) => server?.close(resolve));
    server = null;
  }
});

function writeManifest(browserTesting: boolean, appUrl: string | null = null): void {
  const modules = `modules:\n  core: true\n  browser-testing: ${browserTesting}\n`;
  const testing = appUrl ? `testing:\n  appUrl: ${JSON.stringify(appUrl)}\n` : "";
  writeFileSync(join(tmp.root, ".launchrail.yml"), `schemaVersion: 1\nmode: standard-mvp\n${testing}${modules}`);
}

async function listen(): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>ok</body></html>");
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  return `http://127.0.0.1:${address.port}`;
}

describe("launchrail smoke", () => {
  test("requires the browser-testing module", async () => {
    writeManifest(false);
    const outcome = await runSmoke({ cwd: tmp.root, url: null, dryRun: false });
    expect(outcome.code).toBe(1);
  });

  test("requires an app URL", async () => {
    writeManifest(true);
    const outcome = await runSmoke({ cwd: tmp.root, url: null, dryRun: false });
    expect(outcome.code).toBe(1);
  });

  test("fails when the app is not responding", async () => {
    writeManifest(true, "http://127.0.0.1:9");
    const outcome = await runSmoke({ cwd: tmp.root, url: null, dryRun: false });
    expect(outcome.code).toBe(1);
    expect(existsSync(join(tmp.root, "artifacts"))).toBe(false);
  });

  test("scaffolds an evidence bundle when the app responds", async () => {
    const url = await listen();
    writeManifest(true, url);
    mkdirSync(join(tmp.root, "docs/testing"), { recursive: true });
    writeFileSync(
      join(tmp.root, "docs/testing/smoke-journeys.md"),
      "# Smoke journeys\n\n## Journey: App loads\n\nSteps.\n\n## Journey: Sign in\n\nSteps.\n",
    );

    const outcome = await runSmoke({ cwd: tmp.root, url: null, dryRun: false });
    expect(outcome.code).toBe(0);
    expect(outcome.runDir).not.toBeNull();
    const runDir = outcome.runDir as string;

    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    expect(meta.baseUrl).toBe(url);
    expect(meta.environment).toBeDefined();
    expect(meta.journeys).toEqual(["App loads", "Sign in"]);
    expect(meta.commitSha).toBeNull();

    const summary = readFileSync(join(runDir, "summary.md"), "utf8");
    expect(summary).toContain("- [ ] App loads");
    expect(summary).toContain("- [ ] Sign in");
    expect(summary).toContain("No uncaught console errors");

    expect(existsSync(join(runDir, "screenshots"))).toBe(true);
    expect(existsSync(join(runDir, "traces"))).toBe(true);
    expect(existsSync(join(tmp.root, "artifacts/verification/.gitignore"))).toBe(true);
  });

  test("--url overrides the manifest appUrl", async () => {
    const url = await listen();
    writeManifest(true, "http://127.0.0.1:9");
    const outcome = await runSmoke({ cwd: tmp.root, url, dryRun: false });
    expect(outcome.code).toBe(0);
    const meta = JSON.parse(readFileSync(join(outcome.runDir as string, "meta.json"), "utf8"));
    expect(meta.baseUrl).toBe(url);
  });

  test("dry run scaffolds nothing", async () => {
    const url = await listen();
    writeManifest(true, url);
    const outcome = await runSmoke({ cwd: tmp.root, url: null, dryRun: true });
    expect(outcome.code).toBe(0);
    expect(outcome.runDir).toBeNull();
    expect(existsSync(join(tmp.root, "artifacts"))).toBe(false);
  });

  test("consecutive runs get distinct run directories", async () => {
    const url = await listen();
    writeManifest(true, url);
    const first = await runSmoke({ cwd: tmp.root, url: null, dryRun: false });
    const second = await runSmoke({ cwd: tmp.root, url: null, dryRun: false });
    expect(first.runDir).not.toBe(second.runDir);
    expect(readdirSync(join(tmp.root, "artifacts/verification")).filter((f) => f !== ".gitignore")).toHaveLength(2);
  });
});

describe("parseJourneyNames", () => {
  test("extracts journey headings only", () => {
    const names = parseJourneyNames("# Doc\n\n## Journey: One\n\n## Other heading\n\n## Journey: Two\n");
    expect(names).toEqual(["One", "Two"]);
  });
});
