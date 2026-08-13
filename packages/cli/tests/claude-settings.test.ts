import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runInit } from "../src/commands/init.js";
import {
  applyRalphGuardHook,
  CLAUDE_SETTINGS_PATH,
  planPluginDeclaration,
  planRalphGuardHook,
  planRemovePluginDeclaration,
  RALPH_GUARD_HOOK_COMMAND,
  ralphGuardHookState,
  RETIRED_PLUGIN_DECLARATIONS,
  RETIRED_SUPERPOWERS_DECLARATION,
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

// Under ADR-0019/0020 the workflow skills ship as files and no loop declares an
// external plugin; init writes .claude/settings.json only to register the Ralph
// unattended-launch guard (ADR-0021). The plugin-declaration machinery survives
// for the migrations that remove retired declarations.
describe("plugin declarations retired; init registers only the guard hook (ADR-0019/0020/0021)", () => {
  test("init writes settings.json for the guard hook only — no plugin declarations", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    // The unattended-launch guard creates settings.json (ADR-0021)…
    expect(outcome.ralphHook?.kind).toBe("create");
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    // …with only the hook; no plugin declarations (skills ship as files).
    expect(settings.enabledPlugins).toBeUndefined();
    expect(settings.extraKnownMarketplaces).toBeUndefined();
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Workflow");
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("ralph-permission-guard.py");
  });

  test("init preserves an existing settings.json, adding only the guard hook", async () => {
    writeSettings({
      permissions: { allow: ["Bash(pnpm test)"] },
      extraKnownMarketplaces: { other: { source: { source: "github", repo: "acme/tools" } } },
      enabledPlugins: { "formatter@other": true },
    });
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    // Unrelated settings survive untouched…
    expect(settings.permissions).toEqual({ allow: ["Bash(pnpm test)"] });
    expect(settings.extraKnownMarketplaces.other.source.repo).toBe("acme/tools");
    expect(settings.enabledPlugins["formatter@other"]).toBe(true);
    // …and the guard hook is registered additively (ADR-0021).
    expect(ralphGuardHookState(tmp.root)).toBe("registered");
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

describe("registering the Ralph guard hook in .claude/settings.json (ADR-0021)", () => {
  test("creates the file with the PreToolUse(Workflow) registration when none exists", () => {
    const plan = planRalphGuardHook(tmp.root);
    expect(plan.kind).toBe("create");
    expect(applyRalphGuardHook(tmp.root, plan)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Workflow");
    expect(settings.hooks.PreToolUse[0].hooks[0]).toEqual({ type: "command", command: RALPH_GUARD_HOOK_COMMAND });
    expect(ralphGuardHookState(tmp.root)).toBe("registered");
  });

  test("merges into existing settings without touching unrelated keys or other hooks", () => {
    writeSettings({
      permissions: { allow: ["Bash(pnpm test)"] },
      hooks: {
        PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo hi" }] }],
        PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "echo bye" }] }],
      },
    });
    const plan = planRalphGuardHook(tmp.root);
    expect(plan.kind).toBe("merge");
    applyRalphGuardHook(tmp.root, plan);
    const settings = JSON.parse(readFileSync(settingsPath(), "utf8"));
    expect(settings.permissions).toEqual({ allow: ["Bash(pnpm test)"] });
    // The pre-existing PreToolUse hook survives; the guard is appended after it.
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Write");
    expect(settings.hooks.PreToolUse[1].matcher).toBe("Workflow");
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });

  test("is idempotent — an existing registration is detected and left byte-for-byte alone", () => {
    applyRalphGuardHook(tmp.root, planRalphGuardHook(tmp.root));
    const before = readFileSync(settingsPath(), "utf8");
    const second = planRalphGuardHook(tmp.root);
    expect(second.kind).toBe("skip-registered");
    expect(second.content).toBeNull();
    expect(applyRalphGuardHook(tmp.root, second)).toBe(false);
    expect(readFileSync(settingsPath(), "utf8")).toBe(before);
  });

  test("detects a registration by its command even under a different matcher", () => {
    writeSettings({
      hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: RALPH_GUARD_HOOK_COMMAND }] }] },
    });
    expect(ralphGuardHookState(tmp.root)).toBe("registered");
    expect(planRalphGuardHook(tmp.root).kind).toBe("skip-registered");
  });

  test("leaves invalid JSON untouched", () => {
    writeSettings("{ not json");
    const plan = planRalphGuardHook(tmp.root);
    expect(plan.kind).toBe("skip-invalid");
    expect(plan.content).toBeNull();
    expect(ralphGuardHookState(tmp.root)).toBe("invalid-json");
    expect(readFileSync(settingsPath(), "utf8")).toBe("{ not json");
  });

  test("ralphGuardHookState reports no-file and unregistered", () => {
    expect(ralphGuardHookState(tmp.root)).toBe("no-file");
    writeSettings({ permissions: { allow: [] } });
    expect(ralphGuardHookState(tmp.root)).toBe("unregistered");
  });
});

describe("retiring the superpowers loop declaration (ADR-0020)", () => {
  test("strips only the superpowers keys, preserving unrelated ones", () => {
    writeSettings({
      extraKnownMarketplaces: {
        "superpowers-dev": { source: { source: "github", repo: "obra/superpowers" } },
        other: { source: { source: "github", repo: "acme/tools" } },
      },
      enabledPlugins: { "superpowers@superpowers-dev": true, "formatter@other": true },
    });
    const plan = planRemovePluginDeclaration(tmp.root, [RETIRED_SUPERPOWERS_DECLARATION]);
    expect(plan.kind).toBe("remove");
    const settings = JSON.parse(plan.content ?? "{}");
    expect(settings.extraKnownMarketplaces["superpowers-dev"]).toBeUndefined();
    expect(settings.enabledPlugins["superpowers@superpowers-dev"]).toBeUndefined();
    expect(settings.extraKnownMarketplaces.other.source.repo).toBe("acme/tools");
    expect(settings.enabledPlugins["formatter@other"]).toBe(true);
  });
});
