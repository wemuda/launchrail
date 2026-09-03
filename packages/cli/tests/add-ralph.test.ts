import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { sha256 } from "../src/lib/checksum.js";
import { parseManifest } from "../src/lib/manifest.js";
import { CLAUDE_SETTINGS_PATH, ralphGuardHookState } from "../src/lib/claudeSettings.js";
import { RALPH_GUARD_HOOK_PATH, RALPH_WORKFLOW_PATH, ralphGuardHookContent, ralphWorkflowContent } from "../src/lib/ralph.js";
import { editLockfile, makeTmpRepo, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(async () => {
  tmp = makeTmpRepo();
  await runInit({ cwd: tmp.root, dryRun: false, yes: true });
});
afterEach(() => tmp.cleanup());

function addRalph(overrides: Partial<Parameters<typeof runAdd>[0]> = {}) {
  return runAdd({ cwd: tmp.root, module: "ralph", dryRun: false, yes: true, ...overrides });
}

/**
 * Rewind to a pre-ADR-0018 project: init used to leave the ralph module off and
 * its materials uninstalled — the population `add ralph` now serves. Also removes
 * the guard hook, its lockfile entry, and the settings.json registration so tests
 * observe `add ralph` creating them from scratch (ADR-0021).
 */
function stripRalph(): void {
  const manifestPath = join(tmp.root, ".launchrail.yml");
  writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace(/^\s*ralph: true\n/m, ""), "utf8");
  rmSync(join(tmp.root, RALPH_WORKFLOW_PATH));
  rmSync(join(tmp.root, RALPH_GUARD_HOOK_PATH));
  rmSync(join(tmp.root, CLAUDE_SETTINGS_PATH), { force: true });
  editLockfile(tmp.root, (lock) => {
    delete lock.files[RALPH_WORKFLOW_PATH];
    delete lock.files[RALPH_GUARD_HOOK_PATH];
  });
}

describe("launchrail add ralph", () => {
  beforeEach(() => stripRalph());
  test("writes the Ralph loop workflow and enables the module", async () => {
    const outcome = await addRalph();
    expect(outcome.code).toBe(0);
    expect(existsSync(join(tmp.root, RALPH_WORKFLOW_PATH))).toBe(true);
    const parsed = parseManifest(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8"));
    expect(parsed.manifest?.modules.ralph).toBe(true);
  });

  test("the workflow file is managed-class and checksum-tracked", async () => {
    await addRalph();
    const lock = JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8"));
    expect(lock.files[RALPH_WORKFLOW_PATH]).toMatchObject({ class: "managed" });
    expect(lock.files[RALPH_WORKFLOW_PATH].checksum).toBe(sha256(ralphWorkflowContent()));
    expect(lock.decisions["module:ralph"]).toBe(true);
  });

  test("writes the unattended-launch guard hook as an executable managed file, checksum-tracked", async () => {
    await addRalph();
    const abs = join(tmp.root, RALPH_GUARD_HOOK_PATH);
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs, "utf8")).toBe(ralphGuardHookContent());
    const lock = JSON.parse(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8"));
    expect(lock.files[RALPH_GUARD_HOOK_PATH]).toMatchObject({ class: "managed" });
    expect(lock.files[RALPH_GUARD_HOOK_PATH].checksum).toBe(sha256(ralphGuardHookContent()));
    if (process.platform !== "win32") {
      expect(statSync(abs).mode & 0o111).not.toBe(0);
    }
  });

  test("registers the guard hook in .claude/settings.json (created for the ralph module)", async () => {
    await addRalph();
    expect(ralphGuardHookState(tmp.root)).toBe("registered");
    const settings = JSON.parse(readFileSync(join(tmp.root, CLAUDE_SETTINGS_PATH), "utf8"));
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Workflow");
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("ralph-permission-guard.py");
  });

  test("dry run creates neither the guard hook file nor settings.json", async () => {
    const outcome = await addRalph({ dryRun: true });
    expect(outcome.code).toBe(0);
    expect(existsSync(join(tmp.root, RALPH_GUARD_HOOK_PATH))).toBe(false);
    expect(existsSync(join(tmp.root, CLAUDE_SETTINGS_PATH))).toBe(false);
  });

  test("the seeded workflow script is syntactically valid and declares the meta contract", () => {
    const content = ralphWorkflowContent();
    // The Workflow tool runs the script body in an async function context where
    // top-level await/return are legal and these hooks are in scope — mirror that
    // to parse (not execute) the script.
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => unknown;
    const body = content.replace("export const meta", "const meta");
    expect(
      () => new AsyncFunction("args", "budget", "agent", "parallel", "pipeline", "phase", "log", "workflow", body),
    ).not.toThrow();
    expect(content).toContain("export const meta");
    expect(content).toContain("name: 'ralph'");
    expect(content).toContain("npx @wemuda/launchrail verify");
    expect(content).toContain("npx @wemuda/launchrail verify --fast");
    expect(content).toContain("launch-ralph-implement");
    expect(content).toContain("launch-resolving-merge-conflicts");
  });

  test("the workflow carries the max-lands cap", () => {
    const content = ralphWorkflowContent();
    // Cap policy: 0 = uncapped; dispatch never exceeds the remainder, so a run
    // cannot overshoot; hitting the cap is reported, not silent.
    expect(content).toContain("max: A.max ?? 0");
    expect(content).toContain("landedCount + inFlight.size >= POLICY.max");
    expect(content).toContain("maxReached");
  });

  test("the workflow carries the ADR-0022 campaign mechanics", () => {
    const content = ralphWorkflowContent();
    // One integration target per run: consolidation by default (the front door supplies a
    // scope-native target arg, ADR-0026), trunk ('') the explicit opt-in.
    expect(content).toContain("target: A.target ?? ''");
    expect(content).toContain("'consolidation' : 'trunk'");
    // Canary holds width at 1 until the first verified land.
    expect(content).toContain("canary: A.canary ?? false");
    // The recap is structured output: where the work lives and the one next step.
    expect(content).toContain("nextStep");
  });

  test("the workflow is the lean local-gate loop (ADR-0032): no per-ticket PR, no CI wait", () => {
    const content = ralphWorkflowContent();
    // Builders hand off a pushed branch; the loop lands it with a local squash-merge under
    // the fast gate, one land at a time, and the full gate runs at checkpoints.
    expect(content).toContain("'ready'");
    expect(content).toContain("phase: 'Land'");
    expect(content).toContain("git merge --squash");
    expect(content).toContain("withLandLock");
    expect(content).toContain("checkpointEvery: A.checkpointEvery ?? 5");
    expect(content).toContain("resyncs: A.resyncs ?? 2");
    expect(content).toContain("knownGreen: A.knownGreen ?? ''");
    expect(content).toContain("pushedBranches");
    // The old cloud-CI merge gate and its watcher loop are gone.
    expect(content).not.toContain("gateWaits");
    expect(content).not.toContain("ci-timeout");
    expect(content).not.toContain("CI_WATCH_SCHEMA");
    expect(content).not.toContain("'pr-open'");
  });

  test("the workflow carries the ADR-0010 field-revision mechanics", () => {
    const content = ralphWorkflowContent();
    // Blocking edges cross the model boundary verbatim and are parsed in script code.
    expect(content).toContain("blockedByLine");
    expect(content).toContain("matchAll(/#(\\d+)/g)");
    // Dependency gate: blocked dispatches defer instead of burning an attempt.
    expect(content).toContain("'blocked'");
    expect(content).toContain("s.defers");
    // Unparseable args refuse the run instead of building the whole tracker.
    expect(content).toContain("refusing to run");
  });

  test("regenerates the managed Claude instructions with a Ralph section", async () => {
    await addRalph();
    const generated = readFileSync(join(tmp.root, ".launchrail/CLAUDE.generated.md"), "utf8");
    expect(generated).toContain("## The Ralph loop");
    expect(generated).toContain(RALPH_WORKFLOW_PATH);
  });

  test("dry run writes nothing", async () => {
    const manifestBefore = readFileSync(join(tmp.root, ".launchrail.yml"), "utf8");
    const outcome = await addRalph({ dryRun: true });
    expect(outcome.code).toBe(0);
    expect(existsSync(join(tmp.root, RALPH_WORKFLOW_PATH))).toBe(false);
    expect(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8")).toBe(manifestBefore);
  });

  test("re-running is a no-op (idempotent)", async () => {
    await addRalph();
    const lockBefore = readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8");
    const second = await addRalph();
    expect(second.code).toBe(0);
    expect(second.actions.every((a) => a.kind === "skip-unchanged")).toBe(true);
    expect(readFileSync(join(tmp.root, ".launchrail-lock.json"), "utf8")).toBe(lockBefore);
  });

  test("never overwrites a locally modified managed workflow", async () => {
    await addRalph();
    const abs = join(tmp.root, RALPH_WORKFLOW_PATH);
    writeFileSync(abs, "// local experiment\n", "utf8");
    const outcome = await addRalph();
    expect(outcome.code).toBe(0);
    const action = outcome.actions.find((a) => a.spec.relPath === RALPH_WORKFLOW_PATH);
    expect(action?.kind).toBe("conflict");
    expect(readFileSync(abs, "utf8")).toBe("// local experiment\n");
  });

  test("replaces an unmodified managed workflow when the toolchain content changes", async () => {
    await addRalph();
    const abs = join(tmp.root, RALPH_WORKFLOW_PATH);
    // Simulate a previous toolchain version: different on-disk content whose
    // checksum matches the lockfile (i.e. Launchrail wrote it, nobody edited it).
    const oldContent = "// ralph workflow v0\n";
    writeFileSync(abs, oldContent, "utf8");
    const lockPath = join(tmp.root, ".launchrail-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.files[RALPH_WORKFLOW_PATH].checksum = sha256(oldContent);
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");

    const outcome = await addRalph();
    const action = outcome.actions.find((a) => a.spec.relPath === RALPH_WORKFLOW_PATH);
    expect(action?.kind).toBe("update");
    expect(readFileSync(abs, "utf8")).toBe(ralphWorkflowContent());
  });

  test("preserves manifest comments added by the user", async () => {
    const manifestPath = join(tmp.root, ".launchrail.yml");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8") + "# do not lose me\n");
    await addRalph();
    expect(readFileSync(manifestPath, "utf8")).toContain("# do not lose me");
  });

  test("composes with browser-testing: generated instructions carry both sections", async () => {
    await runAdd({ cwd: tmp.root, module: "browser-testing", dryRun: false, yes: true });
    await addRalph();
    const generated = readFileSync(join(tmp.root, ".launchrail/CLAUDE.generated.md"), "utf8");
    expect(generated).toContain("## Browser testing");
    expect(generated).toContain("## The Ralph loop");
    const parsed = parseManifest(readFileSync(join(tmp.root, ".launchrail.yml"), "utf8"));
    expect(parsed.manifest?.modules["browser-testing"]).toBe(true);
    expect(parsed.manifest?.modules.ralph).toBe(true);
  });
});

describe("doctor with the ralph module", () => {
  test("skips ralph checks when the module is disabled, but flags the uninstalled default loop", () => {
    stripRalph();
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.some((c) => c.name.startsWith("ralph"))).toBe(false);
    // The selected loop's materials being absent is the pothole ADR-0018
    // closes — doctor points at sync instead of leaving it to be discovered.
    const loop = outcome.checks.find((c) => c.name === "implementation loop");
    expect(loop?.status).toBe("warn");
    expect(loop?.message).toContain("launchrail sync");
  });

  test("fails when the workflow file is missing, warns on tracker and empty gate", async () => {
    await addRalph();
    // Default --yes init: issueTracker none, no testing commands.
    const before = runDoctor(tmp.root);
    expect(before.checks.find((c) => c.name === "ralph workflow")?.status).toBe("pass");
    expect(before.checks.find((c) => c.name === "ralph tracker")?.status).toBe("warn");
    expect(before.checks.find((c) => c.name === "ralph verification gate")?.status).toBe("warn");

    const { rmSync } = await import("node:fs");
    rmSync(join(tmp.root, RALPH_WORKFLOW_PATH));
    const after = runDoctor(tmp.root);
    expect(after.checks.find((c) => c.name === "ralph workflow")?.status).toBe("fail");
    expect(after.code).toBe(1);
  });

  test("ralph guard check reflects the hook file and its settings.json registration", () => {
    // The top-level init set up ralph with the guard registered.
    expect(runDoctor(tmp.root).checks.find((c) => c.name === "ralph guard")?.status).toBe("pass");
    // Registration gone (file still present) → warn, pointing at sync.
    rmSync(join(tmp.root, CLAUDE_SETTINGS_PATH), { force: true });
    const warn = runDoctor(tmp.root).checks.find((c) => c.name === "ralph guard");
    expect(warn?.status).toBe("warn");
    expect(warn?.message).toContain("launchrail sync");
    // Hook file gone → fail.
    rmSync(join(tmp.root, RALPH_GUARD_HOOK_PATH));
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.find((c) => c.name === "ralph guard")?.status).toBe("fail");
    expect(outcome.code).toBe(1);
  });

  test("passes when tracker and testing commands are configured", async () => {
    await addRalph();
    const manifestPath = join(tmp.root, ".launchrail.yml");
    const manifest = readFileSync(manifestPath, "utf8")
      .replace("issueTracker: none", "issueTracker: github")
      .replace("unitCommand: null", "unitCommand: npm test");
    writeFileSync(manifestPath, manifest, "utf8");
    mkdirSync(join(tmp.root, "docs/agents"), { recursive: true });
    const outcome = runDoctor(tmp.root);
    expect(outcome.checks.find((c) => c.name === "ralph tracker")?.status).toBe("pass");
    expect(outcome.checks.find((c) => c.name === "ralph verification gate")?.status).toBe("pass");
  });
});

describe("ralph workflow — the lean local-gate loop (ADR-0032)", () => {
  type AgentResult = Record<string, unknown> | null;
  type Dispatch = { label: string; prompt: string; model?: string; effort?: string; isolation?: string };
  type Handler = (label: string, prompt: string) => AgentResult | Promise<AgentResult> | undefined;
  type RalphResult = {
    verified: boolean;
    stopReason: string;
    maxReached: boolean;
    baseRed: string | null;
    checkpoints: { k: number; headSha: string; green: boolean; suspects: number[]; repair?: string }[];
    landed: { ticket: number; title: string; mergeCommit: string; branch: string }[];
    held: { ticket: number; title: string; branch: string }[];
    parked: { ticket: number; title: string; branch: string; failures: string[] }[];
    stuck: { ticket: number; blockedBy: number[] }[];
    nextStep: string;
  };
  type Ticket = { number: number; title?: string; blockedByLine?: string; migration?: boolean };

  // A promise the test resolves by hand — to hold one mock builder open while the pool
  // keeps dispatching and landing the others.
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  // Execute the seeded workflow script against mock hooks so the tests can assert on the
  // *sequence of agent dispatches* and their prompts — the strongest evidence that the loop
  // lands locally under the fast gate, waits on no cloud CI, hands integration failures back
  // without spending attempts, checkpoints on cadence, and repairs a red base once.
  // The script body runs in an async-function context with these hooks in scope, exactly
  // as the Workflow tool runs it (mirrors the parse test above, but executes it).
  async function runRalph(opts: {
    args?: Record<string, unknown> | string;
    tickets?: Ticket[];
    pushedBranches?: { branch: string; sha: string }[];
    preflight?: Record<string, unknown>;
    onAgent?: Handler;
  }): Promise<{ result: RalphResult; labels: string[]; dispatches: Dispatch[]; logs: string[]; active: Map<string, string[]> }> {
    const tickets = opts.tickets ?? [{ number: 1, title: "T1", blockedByLine: "" }];
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...args: unknown[]) => Promise<unknown>;
    const body = ralphWorkflowContent().replace("export const meta", "const meta");
    const fn = new AsyncFunction("args", "budget", "agent", "parallel", "pipeline", "phase", "log", "workflow", body);

    const labels: string[] = [];
    const dispatches: Dispatch[] = [];
    const logs: string[] = [];
    // Which build labels were still running when each dispatch started — the pool's
    // concurrency, observed from the agents' side.
    const running = new Set<string>();
    const active = new Map<string, string[]>();
    const budget = { total: null, spent: () => 0, remaining: () => Number.POSITIVE_INFINITY };
    const target = typeof opts.args === "object" && opts.args !== null ? String(opts.args.target ?? "") : "";
    const defaults = (label: string): AgentResult => {
      const n = Number(/#(\d+)/.exec(label)?.[1] ?? 0);
      if (label === "preflight")
        return {
          green: true, headSha: "base0", skippedGate: false, repo: "wemuda/x", base: target || "master", defaultBranch: "master",
          issueTracker: "github", trackerAccess: "GitHub MCP tools", installCommand: "pnpm install",
          verifyCommand: "npx @wemuda/launchrail verify", fastGateCommand: "npx @wemuda/launchrail verify --fast",
          localCommands: [], browserTesting: false, pushedBranches: opts.pushedBranches ?? [], failures: [],
          ...(opts.preflight ?? {}),
        };
      if (label.startsWith("read-graph"))
        return {
          tickets: tickets.map((t) => ({
            number: t.number, title: t.title ?? `T${t.number}`, blockedByLine: t.blockedByLine ?? "", migration: t.migration ?? false,
          })),
        };
      if (label === "release-verification") return { verified: true, headSha: "final0", summary: "green", failures: [], prunedBranches: [] };
      if (label === "park") return { done: true };
      if (label.startsWith("build:")) return { status: "ready", branch: `ralph/${n}-t${n}`, headSha: `h${n}`, commitTitle: `feat: t${n}`, summary: "built" };
      if (label.startsWith("land:")) return { status: "landed", mergeCommit: `m${n}`, baseMoved: false, issueClosed: true, summary: "landed" };
      if (label.startsWith("verify:")) return { landed: true, issueClosed: true, mergeCommit: `m${n}`, evidence: "commit on master" };
      if (label.startsWith("checkpoint:")) return { green: true, headSha: `cp${label.split(":")[1]}`, summary: "green", failures: [] };
      if (label.startsWith("repair:")) return { status: "ready", branch: `ralph/repair-${label.split(":")[1]}-fix`, headSha: "hr", commitTitle: "fix: repair", summary: "fixed" };
      return null;
    };
    const agent = async (
      prompt: string,
      o: { label?: string; model?: string; effort?: string; isolation?: string } = {},
    ): Promise<AgentResult> => {
      const label = o.label ?? "";
      labels.push(label);
      dispatches.push({ label, prompt, model: o.model, effort: o.effort, isolation: o.isolation });
      active.set(label, [...running]);
      if (label.startsWith("build:")) running.add(label);
      try {
        const custom = opts.onAgent?.(label, prompt);
        // Always yield: a mock that resolves synchronously would leave `running` empty
        // before the pool could dispatch the next ticket.
        return await (custom === undefined ? defaults(label) : custom);
      } finally {
        running.delete(label);
      }
    };
    const parallel = (thunks: Array<() => Promise<unknown>>) => Promise.all(thunks.map((t) => t()));
    const pipeline = async () => {
      throw new Error("pipeline is not used by the ralph workflow");
    };
    const phase = () => {};
    const log = (m: string) => logs.push(m);
    const workflow = async () => {
      throw new Error("nested workflow is not used by the ralph workflow");
    };

    const result = (await fn(opts.args ?? {}, budget, agent, parallel, pipeline, phase, log, workflow)) as RalphResult;
    return { result, labels, dispatches, logs, active };
  }

  test("a ticket lands locally under the fast gate: build → land → verify, no PR and no CI wait", async () => {
    const { result, labels, dispatches } = await runRalph({ args: { only: [1], width: 1, target: "spec/1-x" } });
    expect(labels).toEqual(["preflight", "read-graph", "build:#1", "land:#1", "verify:#1", "release-verification"]);
    const build = dispatches.find((d) => d.label === "build:#1")!;
    // Builders run isolated, push from the first commit on, and never open a PR.
    expect(build.isolation).toBe("worktree");
    expect(build.prompt).toContain("git push -u origin HEAD");
    expect(build.prompt).toContain("commit and push after every green step");
    expect(build.prompt).toContain("never open a PR");
    expect(build.prompt).toContain("npx @wemuda/launchrail verify --fast");
    // The lander squash-merges in the main checkout (no worktree) under the fast gate, on
    // the session model at low effort; the remote verifier rides the small model.
    const land = dispatches.find((d) => d.label === "land:#1")!;
    expect(land.isolation).toBeUndefined();
    expect(land.effort).toBe("low");
    expect(land.model).toBeUndefined();
    expect(land.prompt).toContain("git merge --squash origin/ralph/1-t1");
    expect(land.prompt).toContain("the FAST gate: npx @wemuda/launchrail verify --fast");
    expect(land.prompt).toContain("git push origin spec/1-x");
    expect(land.prompt).toContain("close issue #1 explicitly");
    expect(dispatches.find((d) => d.label === "verify:#1")).toMatchObject({ model: "haiku", effort: "low" });
    // No gate agent, no watcher, nothing polls a remote CI.
    expect(labels.some((l) => l.startsWith("gate:"))).toBe(false);
    expect(result.landed).toEqual([{ ticket: 1, title: "T1", mergeCommit: "m1", branch: "ralph/1-t1" }]);
    expect(result.parked).toEqual([]);
    expect(result.verified).toBe(true);
    expect(result.stopReason).toBe("frontier drained");
    expect(result.nextStep).toContain("spec/1-x -> master");
    // The release prunes exactly the landed branches.
    expect(dispatches.find((d) => d.label === "release-verification")!.prompt).toContain("ralph/1-t1");
  });

  test("a land hand-back (the base moved: conflict) re-syncs the pushed branch without spending an attempt", async () => {
    let lands = 0;
    const { result, labels, dispatches } = await runRalph({
      args: { only: [1], width: 1, target: "", attempts: 1 },
      onAgent: (label) => {
        if (label === "land:#1") {
          lands += 1;
          return { status: "conflict", baseMoved: true, summary: "CONFLICT in src/app.ts" };
        }
        return undefined;
      },
    });
    // The first land conflicted; a fresh implementer re-synced the same branch (no retry,
    // no attempt spent — attempts: 1 would otherwise have parked it) and the re-land landed.
    expect(labels).toEqual([
      "preflight", "read-graph", "build:#1", "land:#1", "build:#1:resync1", "land:#1:resync1", "verify:#1", "release-verification",
    ]);
    expect(lands).toBe(1);
    const resync = dispatches.find((d) => d.label === "build:#1:resync1")!;
    expect(resync.prompt).toContain("RE-SYNC, not a failure");
    expect(resync.prompt).toContain("CONFLICT in src/app.ts");
    expect(resync.prompt).toContain("adopt");
    expect(result.landed.map((l) => l.ticket)).toEqual([1]);
    expect(result.parked).toEqual([]);
  });

  test("a gate that fails on an up-to-date branch is the builder's failure: a fresh retry adopts the branch", async () => {
    let lands = 0;
    const { result, labels, dispatches } = await runRalph({
      args: { only: [1], width: 1, target: "" },
      onAgent: (label) => {
        if (label.startsWith("land:#1")) {
          lands += 1;
          if (lands === 1) return { status: "gate-failed", baseMoved: false, summary: "unit: 2 tests failed in src/app.test.ts" };
        }
        return undefined;
      },
    });
    expect(labels).toEqual([
      "preflight", "read-graph", "build:#1", "land:#1", "build:#1:retry", "land:#1", "verify:#1", "release-verification",
    ]);
    const retry = dispatches.find((d) => d.label === "build:#1:retry")!;
    expect(retry.prompt).toContain("RETRY with a fresh context");
    expect(retry.prompt).toContain("2 tests failed");
    expect(retry.prompt).toContain("adopt it and fix forward");
    expect(result.landed.map((l) => l.ticket)).toEqual([1]);
    expect(result.parked).toEqual([]);
  });

  test("re-syncs are bounded: a branch that keeps conflicting becomes a real failure and parks", async () => {
    const { result, labels } = await runRalph({
      args: { only: [1], width: 1, target: "", attempts: 1, resyncs: 2 },
      onAgent: (label) => (label.startsWith("land:#1") ? { status: "conflict", baseMoved: true, summary: "CONFLICT" } : undefined),
    });
    expect(labels.filter((l) => l.startsWith("build:#1"))).toEqual(["build:#1", "build:#1:resync1", "build:#1:resync2"]);
    expect(result.parked.map((p) => p.ticket)).toEqual([1]);
    expect(result.parked[0].failures.join(" ")).toContain("land conflict");
    expect(labels).toContain("park");
  });

  test("a claimed land the remote disagrees with is a failed attempt; the retry settles it", async () => {
    let verifies = 0;
    const { result, labels } = await runRalph({
      args: { only: [1], width: 1, target: "" },
      onAgent: (label) => {
        if (label === "verify:#1") {
          verifies += 1;
          if (verifies === 1) return { landed: true, issueClosed: false, evidence: "issue #1 still open" };
        }
        return undefined;
      },
    });
    expect(labels.filter((l) => l.startsWith("build:#1"))).toEqual(["build:#1", "build:#1:retry"]);
    expect(result.landed.map((l) => l.ticket)).toEqual([1]);
  });

  test("the full gate runs as a checkpoint every N lands; the release skips it when the tip is already proven", async () => {
    const three = [1, 2, 3].map((n) => ({ number: n }));
    const a = await runRalph({ args: { width: 1, target: "", checkpointEvery: 2 }, tickets: three });
    // Lands 1 and 2 → checkpoint 1; land 3 → no checkpoint yet, so the release runs the gate.
    expect(a.labels.filter((l) => l.startsWith("checkpoint:"))).toEqual(["checkpoint:1"]);
    expect(a.labels.indexOf("checkpoint:1")).toBeGreaterThan(a.labels.indexOf("land:#2"));
    expect(a.labels.indexOf("checkpoint:1")).toBeLessThan(a.labels.indexOf("build:#3"));
    const cp = a.dispatches.find((d) => d.label === "checkpoint:1")!;
    expect(cp.prompt).toContain("FULL verification gate: npx @wemuda/launchrail verify");
    expect(cp.prompt).toContain("#1 (T1), #2 (T2)");
    expect(cp.effort).toBe("low");
    expect(a.result.checkpoints).toEqual([{ k: 1, headSha: "cp1", green: true, suspects: [1, 2] }]);
    expect(a.dispatches.find((d) => d.label === "release-verification")!.prompt).toContain("then the FULL verification gate");

    const b = await runRalph({
      args: { width: 1, target: "", checkpointEvery: 2 },
      tickets: three.slice(0, 2),
      // A real checkpoint reports the tip it gated — the last landing commit.
      onAgent: (label) => (label === "checkpoint:1" ? { green: true, headSha: "m2", summary: "green", failures: [] } : undefined),
    });
    // Two lands, one green checkpoint at the final tip: the release does not pay the gate again.
    expect(b.dispatches.find((d) => d.label === "release-verification")!.prompt).toContain("already passed at exactly this tip (m2)");
    expect(b.result.verified).toBe(true);
  });

  test("a red checkpoint gets one repair landed under the full gate, then landing continues", async () => {
    const { result, labels, dispatches } = await runRalph({
      args: { width: 1, target: "", checkpointEvery: 1 },
      tickets: [{ number: 1 }, { number: 2 }],
      onAgent: (label) => {
        if (label === "checkpoint:1") return { green: false, headSha: "red1", summary: "e2e failed", failures: ["journey checkout: timeout"] };
        return undefined;
      },
    });
    expect(labels).toEqual([
      "preflight", "read-graph",
      "build:#1", "land:#1", "checkpoint:1", "repair:1", "land:repair:1", "verify:#1",
      "build:#2", "land:#2", "checkpoint:2", "verify:#2",
      "release-verification",
    ]);
    const repair = dispatches.find((d) => d.label === "repair:1")!;
    expect(repair.isolation).toBe("worktree");
    expect(repair.prompt).toContain("journey checkout: timeout");
    expect(repair.prompt).toContain("#1 (T1, landed as m1)");
    expect(repair.prompt).toContain("ralph/repair-1-");
    // The repair lands under the FULL gate — that landing is the new green checkpoint.
    const repairLand = dispatches.find((d) => d.label === "land:repair:1")!;
    expect(repairLand.prompt).toContain("the FULL gate: npx @wemuda/launchrail verify");
    expect(repairLand.prompt).not.toContain("close issue");
    expect(result.checkpoints.map((c) => [c.k, c.green, c.repair ?? null])).toEqual([
      [1, false, null], [1, true, "ralph/repair-1-fix"], [2, true, null],
    ]);
    expect(result.landed.map((l) => l.ticket)).toEqual([1, 2]);
    expect(result.baseRed).toBeNull();
    expect(result.verified).toBe(true);
  });

  test("when the repair does not land the base is red: nothing else lands, finished tickets are held, the run is unverified", async () => {
    const { result, labels } = await runRalph({
      args: { width: 3, target: "", checkpointEvery: 1 },
      tickets: [{ number: 1 }, { number: 2 }, { number: 3 }],
      onAgent: (label) => {
        if (label === "checkpoint:1") return { green: false, headSha: "red1", summary: "unit failed", failures: ["app.test.ts"] };
        if (label === "land:repair:1") return { status: "gate-failed", baseMoved: false, summary: "still failing" };
        return undefined;
      },
    });
    expect(labels).toContain("repair:1");
    // Exactly one ticket landed (its checkpoint went red); the others were built (their
    // branches are pushed) but never landed — no lander was even dispatched for them.
    expect(result.landed.map((l) => l.ticket)).toEqual([1]);
    expect(labels.filter((l) => l.startsWith("land:#")).sort()).toEqual(["land:#1"]);
    expect(result.held.map((h) => h.ticket).sort()).toEqual([2, 3]);
    expect(result.held.every((h) => h.branch.startsWith("ralph/"))).toBe(true);
    expect(result.parked).toEqual([]);
    expect(result.stuck).toEqual([]);
    expect(result.baseRed).toContain("repair branch");
    expect(result.verified).toBe(false);
    expect(result.stopReason).toBe("base red");
    expect(result.nextStep).toContain("knownGreen");
  });

  test("the pool keeps dispatching around a slow build — no round barrier", async () => {
    const slow = deferred<AgentResult>();
    const { labels, active } = await runRalph({
      args: { width: 2, target: "" },
      tickets: [{ number: 1 }, { number: 2 }, { number: 3 }],
      onAgent: (label) => {
        if (label === "build:#1") return slow.promise;
        if (label === "verify:#3") {
          // #3 is landing while #1 is still building: only now release the slow build.
          slow.resolve({ status: "ready", branch: "ralph/1-t1", headSha: "h1", commitTitle: "feat: t1", summary: "built" });
        }
        return undefined;
      },
    });
    // #3 was dispatched (and landed) while #1 was still in flight ...
    expect(active.get("build:#3")).toEqual(["build:#1"]);
    expect(labels.indexOf("land:#3")).toBeLessThan(labels.indexOf("land:#1"));
    // ... and everything landed in the end.
    expect(labels.filter((l) => l.startsWith("verify:")).sort()).toEqual(["verify:#1", "verify:#2", "verify:#3"]);
  });

  test("migration-adding tickets run one at a time; others fill the width", async () => {
    const m = await runRalph({
      args: { width: 3, target: "" },
      tickets: [{ number: 1, migration: true }, { number: 2, migration: true }, { number: 3 }],
    });
    // #1 and #3 start together (one migration ticket in flight); #2 waits for #1 to finish.
    expect(m.active.get("build:#3")).toEqual(["build:#1"]);
    expect(m.active.get("build:#2")).not.toContain("build:#1");
    expect(m.result.landed.map((l) => l.ticket).sort()).toEqual([1, 2, 3]);

    const plain = await runRalph({ args: { width: 3, target: "" }, tickets: [{ number: 1 }, { number: 2 }, { number: 3 }] });
    expect(plain.active.get("build:#3")).toEqual(["build:#1", "build:#2"]);
  });

  test("the frontier respects edges and dispatches the most-depended-on ticket first", async () => {
    const { labels, result } = await runRalph({
      args: { width: 2, target: "" },
      tickets: [
        { number: 1 }, { number: 2, blockedByLine: "**Blocked by:** #1" },
        { number: 3 }, { number: 4, blockedByLine: "Blocked by: #3" }, { number: 5, blockedByLine: "Blocked by: #4" },
      ],
    });
    // #3 unblocks two tickets, #1 one: #3 dispatches first; #4 only after #3 verified.
    expect(labels.indexOf("build:#3")).toBeLessThan(labels.indexOf("build:#1"));
    expect(labels.indexOf("build:#4")).toBeGreaterThan(labels.indexOf("verify:#3"));
    expect(labels.indexOf("build:#5")).toBeGreaterThan(labels.indexOf("verify:#4"));
    expect(labels.indexOf("build:#2")).toBeGreaterThan(labels.indexOf("verify:#1"));
    expect(result.landed.map((l) => l.ticket).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(result.stuck).toEqual([]);
  });

  test("canary holds width at 1 until the first verified land", async () => {
    const { labels, active } = await runRalph({
      args: { width: 3, target: "", canary: true },
      tickets: [{ number: 1 }, { number: 2 }, { number: 3 }],
    });
    expect(active.get("build:#1")).toEqual([]);
    expect(labels.indexOf("build:#2")).toBeGreaterThan(labels.indexOf("verify:#1"));
    // After the canary landed, the pool widens.
    expect(active.get("build:#3")).toEqual(["build:#2"]);
  });

  test("a deferral hands the attempt back; the ticket is retried after a tracker refresh", async () => {
    let builds = 0;
    const { result, labels } = await runRalph({
      args: { only: [1], width: 1, target: "" },
      onAgent: (label) => {
        if (label === "build:#1") {
          builds += 1;
          if (builds === 1) return { status: "blocked", failure: "#9 still open", summary: "blocked" };
        }
        return undefined;
      },
    });
    // Same label twice (no ':retry' — a deferral is not an attempt), a graph refresh between.
    expect(labels).toEqual(["preflight", "read-graph", "build:#1", "read-graph:l0", "build:#1", "land:#1", "verify:#1", "release-verification"]);
    expect(result.landed.map((l) => l.ticket)).toEqual([1]);
  });

  test("the cap stops dispatch at the remainder and reports maxReached", async () => {
    const { result, labels } = await runRalph({ args: { width: 3, target: "", max: 1 }, tickets: [{ number: 1 }, { number: 2 }] });
    expect(labels.filter((l) => l.startsWith("build:"))).toEqual(["build:#1"]);
    expect(result.maxReached).toBe(true);
    expect(result.landed.map((l) => l.ticket)).toEqual([1]);
    expect(result.stopReason).toContain("cap reached");
  });

  test("pushed ralph/* branches from a previous session are adopted, and knownGreen skips the preflight gate", async () => {
    const { dispatches, logs } = await runRalph({
      args: { only: [2], width: 1, target: "", knownGreen: "base0" },
      tickets: [{ number: 2 }],
      pushedBranches: [{ branch: "ralph/2-auth", sha: "abc123" }, { branch: "refs/heads/ralph/7-other", sha: "def" }],
      preflight: { skippedGate: true },
    });
    const preflight = dispatches.find((d) => d.label === "preflight")!;
    expect(preflight.prompt).toContain('compare headSha with "base0"');
    expect(preflight.prompt).toContain("skip the verification gate");
    expect(preflight.prompt).toContain("git ls-remote --heads origin 'ralph/*'");
    expect(logs.join("\n")).toContain("known green — gate skipped");
    expect(logs.join("\n")).toContain("Adopting pushed branches for #2, #7");
    const build = dispatches.find((d) => d.label === "build:#2")!;
    expect(build.prompt).toContain("A pushed branch already exists for this ticket: ralph/2-auth at abc123");
    expect(build.prompt).toContain("never start over");
  });

  test("a red preflight refuses to start; unparseable args refuse to run", async () => {
    const red = await runRalph({ preflight: { green: false, failures: ["verify exited 1"] } });
    expect(red.result).toMatchObject({ refused: true, reason: "preflight not green" });
    expect(red.labels).toEqual(["preflight"]);
    await expect(runRalph({ args: "not json" })).rejects.toThrow("refusing to run");
  });
});
