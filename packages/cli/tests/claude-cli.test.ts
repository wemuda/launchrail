import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { detectClaudeCli, installPlugin, listInstalledPluginIds, type WorkflowPlugin } from "../src/lib/claudeCli.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

/**
 * Under ADR-0019 the workflow skills are vendored, not installed — so the core
 * plugin roster is empty and the only plugin init ever installs is the external
 * loop plugin a project selects (superpowers). These integration tests run
 * against a stub `claude` binary on PATH and verify what init/doctor *invoke*.
 */
const SUPERPOWERS: WorkflowPlugin = {
  marketplace: "obra/superpowers",
  id: "superpowers@superpowers-dev",
  label: "Superpowers",
};

let stubDir: string;
let logPath: string;
let tmp: TmpRepo;
const savedPath = process.env.PATH;
const savedSkip = process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI;

function stubCalls(): string[] {
  try {
    return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function selectSuperpowers(root: string): void {
  writeFileSync(join(root, ".launchrail.yml"), "schemaVersion: 1\nmode: standard-mvp\nimplementationLoop: superpowers\n");
}

beforeEach(() => {
  tmp = makeTmpRepo();
  stubDir = mkdtempSync(join(tmpdir(), "claude-stub-"));
  logPath = join(stubDir, "calls.log");
  writeFileSync(
    join(stubDir, "claude"),
    `#!/usr/bin/env bash
echo "$@" >> "${logPath}"
if [ -n "$CLAUDE_STUB_FAIL" ] && [[ "$*" == *"$CLAUDE_STUB_FAIL"* ]]; then
  echo "stub: induced failure for: $*" >&2
  exit 1
fi
case "$1" in
  --version) echo "9.9.9 (Claude Code)";;
  plugin)
    case "$2" in
      marketplace) echo "Successfully added marketplace";;
      install) echo "\${CLAUDE_STUB_INSTALL_MSG:-Successfully installed plugin (scope: user)}";;
      update) echo "\${CLAUDE_STUB_UPDATE_MSG:-already at the latest version (9.9.9).}";;
      list) echo "\${CLAUDE_STUB_LIST:-[]}";;
    esac;;
esac
exit 0
`,
  );
  chmodSync(join(stubDir, "claude"), 0o755);
  process.env.PATH = `${stubDir}${delimiter}${savedPath}`;
  delete process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI;
});

afterEach(() => {
  process.env.PATH = savedPath;
  if (savedSkip === undefined) delete process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI;
  else process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = savedSkip;
  delete process.env.CLAUDE_STUB_FAIL;
  delete process.env.CLAUDE_STUB_LIST;
  delete process.env.CLAUDE_STUB_INSTALL_MSG;
  delete process.env.CLAUDE_STUB_UPDATE_MSG;
  rmSync(stubDir, { recursive: true, force: true });
  tmp.cleanup();
});

describe("claude CLI wrapper", () => {
  test("detects the CLI and honors the opt-out env", () => {
    expect(detectClaudeCli(tmp.root)).toBe("9.9.9 (Claude Code)");
    process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = "1";
    expect(detectClaudeCli(tmp.root)).toBeNull();
  });

  test("installs a plugin via marketplace add then plugin install — no update on fresh installs", () => {
    const outcome = installPlugin(tmp.root, SUPERPOWERS);
    expect(outcome).toEqual({ state: "installed", detail: "installed" });
    expect(stubCalls()).toEqual([
      "plugin marketplace add obra/superpowers",
      "plugin install superpowers@superpowers-dev",
    ]);
  });

  test("an already-installed plugin is updated to the marketplace's latest", () => {
    process.env.CLAUDE_STUB_INSTALL_MSG = 'Plugin "superpowers@superpowers-dev" is already installed (scope: user)';
    process.env.CLAUDE_STUB_UPDATE_MSG = 'Plugin "superpowers" updated from 1.2.0 to 1.4.0 for scope user. Restart to apply changes.';
    const outcome = installPlugin(tmp.root, SUPERPOWERS);
    expect(outcome).toEqual({ state: "installed", detail: "updated", versions: "1.2.0 → 1.4.0" });
    expect(stubCalls()).toContain("plugin update superpowers@superpowers-dev");
  });

  test("an already-current plugin reports up to date", () => {
    process.env.CLAUDE_STUB_INSTALL_MSG = 'Plugin "superpowers@superpowers-dev" is already installed (scope: user)';
    const outcome = installPlugin(tmp.root, SUPERPOWERS);
    expect(outcome).toEqual({ state: "installed", detail: "up-to-date" });
  });

  test("surfaces a failing step", () => {
    process.env.CLAUDE_STUB_FAIL = "marketplace add";
    const outcome = installPlugin(tmp.root, SUPERPOWERS);
    expect(outcome.state).toBe("failed");
    if (outcome.state === "failed") expect(outcome.step).toBe("marketplace-add");
  });

  test("reads installed plugin ids from plugin list --json", () => {
    expect(listInstalledPluginIds(tmp.root)).toEqual({ state: "ok", ids: [] });
    process.env.CLAUDE_STUB_LIST = '[{"id":"superpowers@superpowers-dev","enabled":true}]';
    expect(listInstalledPluginIds(tmp.root)).toEqual({ state: "ok", ids: ["superpowers@superpowers-dev"] });
  });
});

describe("init plugin handoff", () => {
  test("the default ralph loop installs no plugin — skills are vendored", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.plugin).toBe("none");
    expect(stubCalls()).toEqual([]);
  });

  test("installs the loop plugin when superpowers is selected and the CLI is present", async () => {
    selectSuperpowers(tmp.root);
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.plugin).toBe("installed");
    expect(stubCalls()).toContain("plugin marketplace add obra/superpowers");
    expect(stubCalls()).toContain("plugin install superpowers@superpowers-dev");
  });

  test("an install failure reports failed and prints the manual command", async () => {
    selectSuperpowers(tmp.root);
    process.env.CLAUDE_STUB_FAIL = "install superpowers";
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };
    try {
      const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
      expect(outcome.plugin).toBe("failed");
    } finally {
      console.log = original;
    }
    expect(lines.join("\n")).toContain("claude plugin install superpowers@superpowers-dev");
  });

  test("--skip-plugin-install never invokes claude (superpowers)", async () => {
    selectSuperpowers(tmp.root);
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true, skipPluginInstall: true });
    expect(outcome.plugin).toBe("skipped");
    expect(stubCalls()).toEqual([]);
  });

  test("dry run detects but never installs (superpowers)", async () => {
    selectSuperpowers(tmp.root);
    const outcome = await runInit({ cwd: tmp.root, dryRun: true, yes: true });
    expect(outcome.plugin).toBe("dry-run");
    expect(stubCalls()).toEqual(["--version"]);
  });

  test("falls back to manual instructions when the CLI is missing (superpowers)", async () => {
    selectSuperpowers(tmp.root);
    process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = "1";
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };
    try {
      const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
      expect(outcome.plugin).toBe("no-cli");
    } finally {
      console.log = original;
    }
    const output = lines.join("\n");
    expect(output).toContain("claude plugin marketplace add obra/superpowers");
    expect(output).toContain("claude plugin install superpowers@superpowers-dev");
  });
});

describe("doctor loop plugin check", () => {
  test("warns when the superpowers loop plugin is missing, passes when installed", async () => {
    selectSuperpowers(tmp.root);
    await runInit({ cwd: tmp.root, dryRun: false, yes: true, skipPluginInstall: true });
    const before = runDoctor(tmp.root).checks.find((c) => c.name === "loop plugin install");
    expect(before?.status).toBe("warn");
    process.env.CLAUDE_STUB_LIST = '[{"id":"superpowers@superpowers-dev","enabled":true}]';
    const after = runDoctor(tmp.root).checks.find((c) => c.name === "loop plugin install");
    expect(after?.status).toBe("pass");
  });

  test("no loop plugin check for the default ralph loop", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const check = runDoctor(tmp.root).checks.find((c) => c.name === "loop plugin install");
    expect(check).toBeUndefined();
  });

  test("warns without failing when the CLI is absent (superpowers)", async () => {
    selectSuperpowers(tmp.root);
    process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = "1";
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const check = runDoctor(tmp.root).checks.find((c) => c.name === "loop plugin install");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("claude CLI not found");
  });
});
