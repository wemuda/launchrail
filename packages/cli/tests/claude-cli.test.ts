import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { detectClaudeCli, installLaunchrailPlugin, launchrailPluginState } from "../src/lib/claudeCli.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

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

  test("installs via marketplace add then plugin install", () => {
    const outcome = installLaunchrailPlugin(tmp.root);
    expect(outcome).toEqual({ state: "installed", alreadyInstalled: false });
    expect(stubCalls()).toEqual([
      "--version",
      "plugin marketplace add wemuda/launchrail",
      "plugin install launchrail@launchrail",
    ]);
  });

  test("reports an idempotent re-install as already installed", () => {
    process.env.CLAUDE_STUB_INSTALL_MSG = 'Plugin "launchrail@launchrail" is already installed (scope: user)';
    const outcome = installLaunchrailPlugin(tmp.root);
    expect(outcome).toEqual({ state: "installed", alreadyInstalled: true });
  });

  test("surfaces a failing step", () => {
    process.env.CLAUDE_STUB_FAIL = "marketplace add";
    const outcome = installLaunchrailPlugin(tmp.root);
    expect(outcome.state).toBe("failed");
    if (outcome.state === "failed") expect(outcome.step).toBe("marketplace-add");
  });

  test("reads the installed state from plugin list --json", () => {
    expect(launchrailPluginState(tmp.root)).toBe("not-installed");
    process.env.CLAUDE_STUB_LIST = '[{"id":"launchrail@launchrail","enabled":true}]';
    expect(launchrailPluginState(tmp.root)).toBe("installed");
  });
});

describe("init plugin handoff", () => {
  test("installs the plugin when the CLI is present", async () => {
    const outcome = await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(outcome.code).toBe(0);
    expect(outcome.plugin).toBe("installed");
    expect(stubCalls()).toContain("plugin install launchrail@launchrail");
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
    expect(output).toContain("claude plugin marketplace add wemuda/launchrail");
    expect(output).toContain("claude plugin install launchrail@launchrail");
  });
});

describe("doctor plugin install check", () => {
  test("warns when not installed, passes when installed", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true, skipPluginInstall: true });
    const before = runDoctor(tmp.root).checks.find((c) => c.name === "plugin install");
    expect(before?.status).toBe("warn");
    process.env.CLAUDE_STUB_LIST = '[{"id":"launchrail@launchrail","enabled":true}]';
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
