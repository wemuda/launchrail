import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { CLAUDE_SETTINGS_PATH } from "../src/lib/claudeSettings.js";
import { detectRepo } from "../src/lib/detect.js";
import { parseManifest } from "../src/lib/manifest.js";
import {
  AGENTS_COMMANDS_TODO,
  agentsCommandsState,
  ciTriggerReadiness,
  fastGateReadiness,
  journeyReadiness,
  sessionStartHookState,
} from "../src/lib/readiness.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpRepo();
});
afterEach(() => tmp.cleanup());

function writeWorkflow(name: string, body: string): void {
  mkdirSync(join(tmp.root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(tmp.root, ".github", "workflows", name), body);
}

function manifestFrom(body: string) {
  const parsed = parseManifest(`schemaVersion: 1\n${body}`);
  if (!parsed.manifest) throw new Error(parsed.errors.join("; "));
  return parsed.manifest;
}

describe("loop readiness — the fast gate", () => {
  test("a configured check command passes and is named", () => {
    const m = manifestFrom("testing:\n  unitCommand: pnpm test\n  checkCommand: pnpm lint && pnpm typecheck\n");
    expect(fastGateReadiness(m, detectRepo(tmp.root))).toEqual({ status: "pass", message: "fast gate: pnpm lint && pnpm typecheck" });
  });

  test("unset on a project with browser journeys warns — every land would pay the full suite", () => {
    const m = manifestFrom("testing:\n  unitCommand: pnpm test\n  e2eCommand: npx playwright test\nmodules:\n  core: true\n  browser-testing: true\n");
    const r = fastGateReadiness(m, detectRepo(tmp.root));
    expect(r.status).toBe("warn");
    expect(r.message).toContain("testing.checkCommand unset");
    expect(r.message).toContain("launch-loop-readiness");
    // A playwright config alone is enough of a signal.
    writeFileSync(join(tmp.root, "playwright.config.ts"), "export default {}\n");
    expect(fastGateReadiness(manifestFrom("testing:\n  unitCommand: pnpm test\n"), detectRepo(tmp.root)).status).toBe("warn");
  });

  test("unset on a light project passes with a hint", () => {
    const r = fastGateReadiness(manifestFrom("testing:\n  unitCommand: npm test\n"), detectRepo(tmp.root));
    expect(r.status).toBe("pass");
    expect(r.message).toContain("set testing.checkCommand");
  });
});

describe("loop readiness — CI triggers", () => {
  test("no workflows directory means nothing to check", () => {
    expect(ciTriggerReadiness(tmp.root)).toEqual({ workflows: [], everyPush: [] });
  });

  test("flags the workflows that run on every push, in each spelling", () => {
    writeWorkflow("a.yml", "on: push\njobs: {}\n");
    writeWorkflow("b.yml", "on: [push, pull_request]\njobs: {}\n");
    writeWorkflow("c.yml", "on:\n  push:\njobs: {}\n");
    writeWorkflow("d.yaml", "on:\n  push: {}\n  pull_request: {}\njobs: {}\n");
    expect(ciTriggerReadiness(tmp.root)).toEqual({
      workflows: ["a.yml", "b.yml", "c.yml", "d.yaml"],
      everyPush: ["a.yml", "b.yml", "c.yml", "d.yaml"],
    });
  });

  test("filtered pushes, PR-only, and other triggers are fine; unparseable files are skipped", () => {
    writeWorkflow("ci.yml", "on:\n  push:\n    branches: [master]\n  pull_request:\njobs: {}\n");
    writeWorkflow("release.yml", "on:\n  push:\n    tags: ['v*']\njobs: {}\n");
    writeWorkflow("pr.yml", "on:\n  pull_request:\n    types: [opened]\njobs: {}\n");
    writeWorkflow("cron.yml", "on:\n  schedule:\n    - cron: '0 0 * * *'\njobs: {}\n");
    writeWorkflow("broken.yml", "on: [push\n  jobs: :\n");
    expect(ciTriggerReadiness(tmp.root).everyPush).toEqual([]);
    expect(ciTriggerReadiness(tmp.root).workflows).toHaveLength(5);
  });
});

describe("loop readiness — journeys, hosted setup, commands", () => {
  test("a workers: 1 pin is serial; a real worker count or a CI-conditional is not", () => {
    writeFileSync(join(tmp.root, "playwright.config.ts"), "export default { workers: 1, fullyParallel: false }\n");
    expect(journeyReadiness(tmp.root, "playwright.config.ts")).toEqual({ file: "playwright.config.ts", serial: true, evidence: "workers: 1" });
    writeFileSync(join(tmp.root, "playwright.config.ts"), "export default { workers: process.env.CI ? 1 : 4 }\n");
    expect(journeyReadiness(tmp.root, "playwright.config.ts").serial).toBe(false);
    writeFileSync(join(tmp.root, "playwright.config.ts"), "export default { workers: 4 }\n");
    expect(journeyReadiness(tmp.root, "playwright.config.ts").serial).toBe(false);
  });

  test("a SessionStart hook counts only when a command is registered", () => {
    expect(sessionStartHookState(tmp.root)).toBe("missing");
    mkdirSync(join(tmp.root, ".claude"), { recursive: true });
    const settings = join(tmp.root, CLAUDE_SETTINGS_PATH);
    writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Workflow", hooks: [{ type: "command", command: "x" }] }] } }));
    expect(sessionStartHookState(tmp.root)).toBe("missing");
    writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" }] }] } }));
    expect(sessionStartHookState(tmp.root)).toBe("registered");
    writeFileSync(settings, "{ nope");
    expect(sessionStartHookState(tmp.root)).toBe("invalid-json");
  });

  test("AGENTS.md commands: the seeded placeholder is a todo, real commands are documented", () => {
    expect(agentsCommandsState(tmp.root)).toBe("missing");
    writeFileSync(join(tmp.root, "AGENTS.md"), `## Commands\n\n${AGENTS_COMMANDS_TODO} (setup, tests, checks).\n`);
    expect(agentsCommandsState(tmp.root)).toBe("todo");
    writeFileSync(join(tmp.root, "AGENTS.md"), "## Commands\n\n```bash\npnpm test\n```\n");
    expect(agentsCommandsState(tmp.root)).toBe("documented");
  });
});

describe("doctor reports loop readiness as advice, never as a failure", () => {
  test("a light project after init: fast-gate hint, documented commands, no CI or journey lines", async () => {
    writeFileSync(join(tmp.root, "package.json"), JSON.stringify({ name: "app", scripts: { test: "node --test" } }));
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const outcome = runDoctor(tmp.root);
    const names = outcome.checks.map((c) => c.name);
    expect(outcome.checks.find((c) => c.name === "ralph fast gate")).toMatchObject({ status: "pass" });
    expect(outcome.checks.find((c) => c.name === "ralph commands")).toMatchObject({ status: "pass" });
    expect(names).not.toContain("ralph ci triggers");
    expect(names).not.toContain("ralph journeys");
    expect(names).not.toContain("ralph hosted setup");
    expect(outcome.code).toBe(0);
  });

  test("an every-push workflow and an undocumented AGENTS.md warn without failing", async () => {
    writeFileSync(join(tmp.root, "package.json"), JSON.stringify({ name: "app" }));
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    writeWorkflow("ci.yml", "on: [push, pull_request]\njobs: {}\n");
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.find((c) => c.name === "ralph ci triggers")).toMatchObject({ status: "warn" });
    expect(outcome.checks.find((c) => c.name === "ralph ci triggers")?.message).toContain("ci.yml");
    // No test script was detected, so init seeded the commands placeholder.
    expect(readFileSync(join(tmp.root, "AGENTS.md"), "utf8")).toContain(AGENTS_COMMANDS_TODO);
    expect(outcome.checks.find((c) => c.name === "ralph commands")).toMatchObject({ status: "warn" });
    expect(outcome.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(outcome.code).toBe(0);
  });

  test("with browser testing: the journeys pin and the missing SessionStart hook warn, and both clear", async () => {
    writeFileSync(join(tmp.root, "package.json"), JSON.stringify({ name: "app", scripts: { test: "vitest run" } }));
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    await runAdd({ cwd: tmp.root, module: "browser-testing", dryRun: false, yes: true });
    writeFileSync(join(tmp.root, "playwright.config.ts"), "export default { workers: 1 }\n");
    const before = runDoctor(tmp.root);
    expect(before.checks.find((c) => c.name === "ralph fast gate")).toMatchObject({ status: "warn" });
    expect(before.checks.find((c) => c.name === "ralph journeys")).toMatchObject({ status: "warn" });
    expect(before.checks.find((c) => c.name === "ralph hosted setup")).toMatchObject({ status: "warn" });

    writeFileSync(join(tmp.root, "playwright.config.ts"), "export default { workers: 4 }\n");
    const settingsPath = join(tmp.root, CLAUDE_SETTINGS_PATH);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    settings.hooks.SessionStart = [{ hooks: [{ type: "command", command: "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" }] }];
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    const manifestPath = join(tmp.root, ".launchrail.yml");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace("checkCommand: null", "checkCommand: pnpm lint && vitest run"));
    const after = runDoctor(tmp.root);
    expect(after.checks.find((c) => c.name === "ralph fast gate")).toMatchObject({ status: "pass" });
    expect(after.checks.find((c) => c.name === "ralph journeys")).toMatchObject({ status: "pass" });
    expect(after.checks.find((c) => c.name === "ralph hosted setup")).toMatchObject({ status: "pass" });
  });
});
