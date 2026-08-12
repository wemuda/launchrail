import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runInit } from "../src/commands/init.js";
import {
  CLAUDE_SETTINGS_PATH,
  planPluginDeclaration,
  planRemovePluginDeclaration,
  RETIRED_PLUGIN_DECLARATIONS,
} from "../src/lib/claudeSettings.js";
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
function writeManifest(loop: string): void {
  writeFileSync(
    join(tmp.root, ".launchrail.yml"),
    `schemaVersion: 1\nmode: standard-mvp\nimplementationLoop: ${loop}\n`,
  );
}

// Under ADR-0019 the workflow skills are vendored as files, not installed as
// plugins, so init no longer declares launchrail/mattpocock. The declaration
// machinery survives only for a selected external loop plugin (superpowers).
describe("plugin declaration in .claude/settings.json (loop plugins only, ADR-0019)", () => {
  test("the default ralph loop writes no plugin declaration — skills are vendored", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.settings.kind).toBe("skip-declared");
    expect(existsSync(settingsPath())).toBe(false);
  });

  test("selecting the superpowers loop declares only its plugin", async () => {
    writeManifest("superpowers");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.extraKnownMarketplaces["superpowers-dev"].source).toEqual({
      source: "github",
      repo: "obra/superpowers",
    });
    expect(settings.enabledPlugins["superpowers@superpowers-dev"]).toBe(true);
    // The retired core plugins are never declared.
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBeUndefined();
    expect(settings.enabledPlugins["mattpocock-skills@mattpocock"]).toBeUndefined();
  });

  test("the superpowers declaration merges into existing settings without touching unrelated keys", async () => {
    writeManifest("superpowers");
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
    expect(settings.enabledPlugins["superpowers@superpowers-dev"]).toBe(true);
  });

  test("re-running init with superpowers is a no-op for settings", async () => {
    writeManifest("superpowers");
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const before = readFileSync(settingsPath(), "utf8");
    const second = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(second.settings.kind).toBe("skip-declared");
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  });

  test("leaves invalid JSON untouched and init still succeeds (superpowers path)", async () => {
    writeManifest("superpowers");
    writeSettings("{ not json");
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.settings.kind).toBe("skip-invalid");
    expect(readFileSync(settingsPath(), "utf8")).toBe("{ not json");
  });

  test("planPluginDeclaration with the empty core roster never touches the file", () => {
    const plan = planPluginDeclaration(tmp.root);
    expect(plan.kind).toBe("skip-declared");
    expect(plan.content).toBeNull();
    expect(existsSync(settingsPath())).toBe(false);
  });
});

describe("retiring the old plugin declaration (ADR-0019)", () => {
  test("strips the retired launchrail/mattpocock keys, preserving unrelated ones", () => {
    writeSettings({
      permissions: { allow: ["Bash(pnpm test)"] },
      extraKnownMarketplaces: {
        launchrail: { source: { source: "github", repo: "wemuda/launchrail" } },
        mattpocock: { source: { source: "github", repo: "mattpocock/skills" } },
        other: { source: { source: "github", repo: "acme/tools" } },
      },
      enabledPlugins: {
        "launchrail@launchrail": true,
        "mattpocock-skills@mattpocock": true,
        "formatter@other": true,
      },
    });
    const plan = planRemovePluginDeclaration(tmp.root);
    expect(plan.kind).toBe("remove");
    const settings = JSON.parse(plan.content ?? "{}");
    expect(settings.extraKnownMarketplaces.launchrail).toBeUndefined();
    expect(settings.extraKnownMarketplaces.mattpocock).toBeUndefined();
    expect(settings.enabledPlugins["launchrail@launchrail"]).toBeUndefined();
    expect(settings.enabledPlugins["mattpocock-skills@mattpocock"]).toBeUndefined();
    // Unrelated entries and unrelated settings survive untouched.
    expect(settings.extraKnownMarketplaces.other.source.repo).toBe("acme/tools");
    expect(settings.enabledPlugins["formatter@other"]).toBe(true);
    expect(settings.permissions).toEqual({ allow: ["Bash(pnpm test)"] });
  });

  test("drops a container emptied by the removal rather than leaving {}", () => {
    writeSettings({
      extraKnownMarketplaces: { launchrail: { source: { source: "github", repo: "wemuda/launchrail" } } },
      enabledPlugins: { "launchrail@launchrail": true, "mattpocock-skills@mattpocock": true },
    });
    const plan = planRemovePluginDeclaration(tmp.root);
    const settings = JSON.parse(plan.content ?? "{}");
    expect(settings.extraKnownMarketplaces).toBeUndefined();
    expect(settings.enabledPlugins).toBeUndefined();
  });

  test("is a no-op when no retired declaration is present", () => {
    writeSettings({ enabledPlugins: { "superpowers@superpowers-dev": true } });
    const plan = planRemovePluginDeclaration(tmp.root);
    expect(plan.kind).toBe("skip-absent");
    expect(plan.content).toBeNull();
  });

  test("skips a missing settings file", () => {
    const plan = planRemovePluginDeclaration(tmp.root);
    expect(plan.kind).toBe("skip-no-file");
    expect(plan.content).toBeNull();
  });

  test("skips invalid JSON", () => {
    writeSettings("{ not json");
    const plan = planRemovePluginDeclaration(tmp.root);
    expect(plan.kind).toBe("skip-invalid");
    expect(plan.content).toBeNull();
  });

  test("RETIRED_PLUGIN_DECLARATIONS names the launchrail and mattpocock plugins", () => {
    expect(RETIRED_PLUGIN_DECLARATIONS.map((d) => d.pluginKey)).toEqual([
      "launchrail@launchrail",
      "mattpocock-skills@mattpocock",
    ]);
  });
});
