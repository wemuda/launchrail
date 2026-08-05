import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runInit } from "../src/commands/init.js";
import { CLAUDE_SETTINGS_PATH, declarationState, planPluginDeclaration } from "../src/lib/claudeSettings.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpRepo();
});
afterEach(() => tmp.cleanup());

function settingsPath(): string {
  return join(tmp.root, CLAUDE_SETTINGS_PATH);
}

function writeSettings(value: unknown): void {
  mkdirSync(join(tmp.root, ".claude"), { recursive: true });
  writeFileSync(settingsPath(), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
}

describe("plugin declaration in .claude/settings.json", () => {
  test("init creates the declaration in a blank repo", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.settings.kind).toBe("create");
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.extraKnownMarketplaces.launchrail.source).toEqual({
      source: "github",
      repo: "wemuda/launchrail",
    });
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBe(true);
    expect(settings.extraKnownMarketplaces.mattpocock.source).toEqual({
      source: "github",
      repo: "mattpocock/skills",
    });
    expect(settings.enabledPlugins["mattpocock-skills@mattpocock"]).toBe(true);
    expect(declarationState(tmp.root)).toBe("declared");
  });

  test("merges into existing settings without touching unrelated keys", async () => {
    writeSettings({
      permissions: { allow: ["Bash(pnpm test)"] },
      extraKnownMarketplaces: { other: { source: { source: "github", repo: "acme/tools" } } },
      enabledPlugins: { "formatter@other": true },
    });
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.settings.kind).toBe("merge");
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.permissions).toEqual({ allow: ["Bash(pnpm test)"] });
    expect(settings.extraKnownMarketplaces.other.source.repo).toBe("acme/tools");
    expect(settings.enabledPlugins["formatter@other"]).toBe(true);
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBe(true);
  });

  test("re-running init is a no-op for settings", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const before = readFileSync(settingsPath(), "utf8");
    const second = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(second.settings.kind).toBe("skip-declared");
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  });

  test("respects an explicit opt-out while still declaring the rest of the roster", async () => {
    writeSettings({
      extraKnownMarketplaces: { launchrail: { source: { source: "github", repo: "wemuda/launchrail" } } },
      enabledPlugins: { "launchrail@launchrail": false },
    });
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.settings.kind).toBe("merge");
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBe(false);
    expect(settings.enabledPlugins["mattpocock-skills@mattpocock"]).toBe(true);
  });

  test("an opt-out of every roster plugin is fully declared — nothing to merge", async () => {
    writeSettings({
      extraKnownMarketplaces: {
        launchrail: { source: { source: "github", repo: "wemuda/launchrail" } },
        mattpocock: { source: { source: "github", repo: "mattpocock/skills" } },
      },
      enabledPlugins: { "launchrail@launchrail": false, "mattpocock-skills@mattpocock": false },
    });
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.settings.kind).toBe("skip-declared");
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBe(false);
    expect(settings.enabledPlugins["mattpocock-skills@mattpocock"]).toBe(false);
  });

  test("leaves invalid JSON untouched and init still succeeds", async () => {
    writeSettings("{ not json");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.settings.kind).toBe("skip-invalid");
    expect(readFileSync(settingsPath(), "utf8")).toBe("{ not json");
    expect(declarationState(tmp.root)).toBe("invalid-json");
  });

  test("dry run plans the declaration but writes nothing", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: true, yes: true });
    expect(outcome.settings.kind).toBe("create");
    expect(existsSync(settingsPath())).toBe(false);
  });

  test("planPluginDeclaration keeps a foreign launchrail marketplace entry as-is", () => {
    writeSettings({ extraKnownMarketplaces: { launchrail: { source: { source: "github", repo: "fork/launchrail" } } } });
    const plan = planPluginDeclaration(tmp.root);
    expect(plan.kind).toBe("merge");
    const merged = JSON.parse(plan.content ?? "{}");
    expect(merged.extraKnownMarketplaces.launchrail.source.repo).toBe("fork/launchrail");
    expect(merged.enabledPlugins["launchrail@launchrail"]).toBe(true);
  });
});
