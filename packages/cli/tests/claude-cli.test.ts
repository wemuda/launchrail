import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { detectClaudeCli, installPlugin, listInstalledPluginIds, WORKFLOW_PLUGINS } from "../src/lib/claudeCli.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

const ALL_INSTALLED = JSON.stringify(WORKFLOW_PLUGINS.map((wp) => ({ id: wp.id, enabled: true })));

/**
 * Integration tests against a stub `claude` binary on PATH: they verify what
 * init/doctor *invoke*, not Claude Code itself. The stub records every call
 * and its behavior is steered via environment variables.
 */

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
      marketplace) echo "Successfully added marketplace: launchrail";;
      install) echo "\${CLAUDE_STUB_INSTALL_MSG:-Successfully installed plugin: launchrail@launchrail (scope: user)}";;
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
  rmSync(stubDir, { recursive: true, force: true });
  tmp.cleanup();
});

describe("claude CLI wrapper", () => {
  test("detects the CLI and honors the opt-out env", () => {
    expect(detectClaudeCli(tmp.root)).toBe("9.9.9 (Claude Code)");
    process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = "1";
    expect(detectClaudeCli(tmp.root)).toBeNull();
  });

  test("installs a plugin via marketplace add then plugin install", () => {
    const outcome = installPlugin(tmp.root, WORKFLOW_PLUGINS[0]);
    expect(outcome).toEqual({ state: "installed", alreadyInstalled: false });
    expect(stubCalls()).toEqual([
      "plugin marketplace add wemuda/launchrail",
      "plugin install launchrail@launchrail",
    ]);
  });

  test("reports an idempotent re-install as already installed", () => {
    process.env.CLAUDE_STUB_INSTALL_MSG = 'Plugin "launchrail@launchrail" is already installed (scope: user)';
    const outcome = installPlugin(tmp.root, WORKFLOW_PLUGINS[0]);
    expect(outcome).toEqual({ state: "installed", alreadyInstalled: true });
  });

  test("surfaces a failing step", () => {
    process.env.CLAUDE_STUB_FAIL = "marketplace add";
    const outcome = installPlugin(tmp.root, WORKFLOW_PLUGINS[0]);
    expect(outcome.state).toBe("failed");
    if (outcome.state === "failed") expect(outcome.step).toBe("marketplace-add");
  });

  test("reads installed plugin ids from plugin list --json", () => {
    expect(listInstalledPluginIds(tmp.root)).toEqual({ state: "ok", ids: [] });
    process.env.CLAUDE_STUB_LIST = ALL_INSTALLED;
    expect(listInstalledPluginIds(tmp.root)).toEqual({
      state: "ok",
      ids: WORKFLOW_PLUGINS.map((wp) => wp.id),
    });
  });
});

describe("init plugin handoff", () => {
  test("installs every workflow plugin when the CLI is present", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.plugin).toBe("installed");
    for (const wp of WORKFLOW_PLUGINS) {
      expect(stubCalls()).toContain(`plugin marketplace add ${wp.marketplace}`);
      expect(stubCalls()).toContain(`plugin install ${wp.id}`);
    }
  });

  test("a partial failure reports failed and prints the missing commands", async () => {
    process.env.CLAUDE_STUB_FAIL = "marketplace add mattpocock/skills";
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
    const output = lines.join("\n");
    expect(output).toContain("claude plugin install mattpocock-skills@mattpocock");
    expect(output).not.toContain("claude plugin install launchrail@launchrail");
  });

  test("--skip-plugin-install never invokes claude", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true, skipPluginInstall: true });
    expect(outcome.plugin).toBe("skipped");
    expect(stubCalls()).toEqual([]);
  });

  test("dry run detects but never installs", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: true, yes: true });
    expect(outcome.plugin).toBe("dry-run");
    expect(stubCalls()).toEqual(["--version"]);
  });

  test("falls back to manual instructions when the CLI is missing", async () => {
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
    for (const wp of WORKFLOW_PLUGINS) {
      expect(output).toContain(`claude plugin marketplace add ${wp.marketplace}`);
      expect(output).toContain(`claude plugin install ${wp.id}`);
    }
  });
});

describe("doctor plugin install check", () => {
  test("warns when plugins are missing, passes when all installed", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true, skipPluginInstall: true });
    const before = runDoctor(tmp.root).checks.find((c) => c.name === "plugin install");
    expect(before?.status).toBe("warn");
    process.env.CLAUDE_STUB_LIST = '[{"id":"launchrail@launchrail","enabled":true}]';
    const partial = runDoctor(tmp.root).checks.find((c) => c.name === "plugin install");
    expect(partial?.status).toBe("warn");
    expect(partial?.message).toContain("mattpocock-skills@mattpocock");
    process.env.CLAUDE_STUB_LIST = ALL_INSTALLED;
    const after = runDoctor(tmp.root).checks.find((c) => c.name === "plugin install");
    expect(after?.status).toBe("pass");
  });

  test("warns without failing when the CLI is absent", async () => {
    process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = "1";
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const check = runDoctor(tmp.root).checks.find((c) => c.name === "plugin install");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("claude CLI not found");
  });
});
