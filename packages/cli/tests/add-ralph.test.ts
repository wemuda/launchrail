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
    expect(content).toContain("launch-ralph-implement");
    expect(content).toContain("launch-resolving-merge-conflicts");
  });

  test("the workflow carries the max-merges cap", () => {
    const content = ralphWorkflowContent();
    // Cap policy: 0 = uncapped; batches never exceed the remainder, so a run
    // cannot overshoot; hitting the cap is reported, not silent.
    expect(content).toContain("max: A.max ?? 0");
    expect(content).toContain("Math.min(width, capLeft)");
    expect(content).toContain("maxReached");
  });

  test("the workflow carries the ADR-0022 campaign mechanics", () => {
    const content = ralphWorkflowContent();
    // One integration target per run: consolidation by default (the front door supplies a
    // scope-native target arg, ADR-0026), trunk ('') the explicit opt-in.
    expect(content).toContain("target: A.target ?? ''");
    expect(content).toContain("'consolidation' : 'trunk'");
    // Implementers hand off at PR-open; a per-ticket gate agent owns CI, merge, close.
    expect(content).toContain("'pr-open'");
    expect(content).toContain("phase: 'Gate'");
    // Canary holds width at 1 until the first verified merge.
    expect(content).toContain("canary: A.canary ?? false");
    // The recap is structured output: where the work lives and the one next step.
    expect(content).toContain("nextStep");
  });

  test("the merge gate waits out CI with cheap watchers instead of rebuilding (ADR-0027, ADR-0030)", () => {
    const content = ralphWorkflowContent();
    // A gate agent cannot idle-wait, so a still-running CI comes back "ci-timeout" — not
    // a failure. The loop absorbs it with up to POLICY.gateWaits watch turns before a
    // ticket ever spends a fresh implementer attempt, so a slow CI cannot cost a rebuild.
    expect(content).toContain("gateWaits: A.gateWaits ?? 6");
    expect(content).toContain("waited >= POLICY.gateWaits");
    expect(content).toContain(":ci-wait");
    // "ci-timeout" is the one status that keeps the gate loop going; every real verdict
    // (merged, ci-failed, not-mergeable) leaves it.
    expect(content).toContain("gate.status !== 'ci-timeout'");
    // The wait itself is read-only and rides on a small model — never on a full
    // merge-gate dispatch (ADR-0030); the real gate is recalled once CI resolves.
    expect(content).toContain("CI_WATCH_SCHEMA");
    expect(content).toContain(":ci-done");
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

describe("ralph workflow — merge-gate CI wait (ADR-0027, ADR-0030)", () => {
  type AgentResult = Record<string, unknown> | null;
  type Dispatch = { label: string; model?: string; effort?: string };
  type RalphResult = {
    merged: { ticket: number; title: string; pr?: number; mergeCommit?: string }[];
    parked: { ticket: number; title: string; failures: string[] }[];
  };

  // Execute the seeded workflow script against mock hooks so the test can assert on the
  // *sequence of agent dispatches* — the strongest evidence that a premature CI timeout
  // is absorbed by cheap read-only watch turns and never by a fresh implementer build
  // (ADR-0027) nor by full-model gate re-dispatches (ADR-0030).
  // The script body runs in an async-function context with these hooks in scope, exactly
  // as the Workflow tool runs it (mirrors the parse test above, but executes it).
  async function runRalph(opts: {
    args?: Record<string, unknown>;
    tickets?: { number: number; title: string; blockedByLine?: string }[];
    onAgent: (label: string) => AgentResult;
  }): Promise<{ result: RalphResult; labels: string[]; dispatches: Dispatch[]; logs: string[] }> {
    const tickets = opts.tickets ?? [{ number: 1, title: "T1", blockedByLine: "" }];
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...args: unknown[]) => Promise<unknown>;
    const body = ralphWorkflowContent().replace("export const meta", "const meta");
    const fn = new AsyncFunction("args", "budget", "agent", "parallel", "pipeline", "phase", "log", "workflow", body);

    const labels: string[] = [];
    const dispatches: Dispatch[] = [];
    const logs: string[] = [];
    const budget = { total: null, spent: () => 0, remaining: () => Number.POSITIVE_INFINITY };
    const agent = async (_prompt: string, o: { label?: string; model?: string; effort?: string } = {}): Promise<AgentResult> => {
      const label = o.label ?? "";
      labels.push(label);
      dispatches.push({ label, model: o.model, effort: o.effort });
      // The run's plumbing agents (preflight, graph, release, park) return canned green
      // state; the per-ticket build/gate/verify agents are the scenario under test.
      if (label === "preflight")
        return {
          green: true, headSha: "base0", repo: "wemuda/x", base: "master", defaultBranch: "master",
          issueTracker: "github", trackerAccess: "GitHub MCP tools",
          verifyCommand: "npx @wemuda/launchrail verify", localCommands: ["pnpm install"], failures: [],
        };
      if (label.startsWith("read-graph"))
        return { tickets: tickets.map((t) => ({ number: t.number, title: t.title, blockedByLine: t.blockedByLine ?? "" })) };
      if (label === "release-verification") return { verified: true, headSha: "final0", summary: "green", failures: [] };
      if (label === "park") return { done: true };
      return opts.onAgent(label);
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
    return { result, labels, dispatches, logs };
  }

  test("a premature ci-timeout is waited out by a cheap watcher; the gate returns once — no fresh build attempt", async () => {
    const { result, labels, dispatches } = await runRalph({
      args: { only: [1], width: 1, target: "", gateWaits: 3 },
      onAgent: (label) => {
        if (label.startsWith("build:#1")) return { status: "pr-open", pr: 100, summary: "built" };
        if (label.startsWith("gate:#1:ci-wait")) return { ci: "green", note: "all checks passed" };
        if (label === "gate:#1") return { status: "ci-timeout", summary: "CI still in progress" };
        if (label.startsWith("gate:#1:ci-done"))
          return { status: "merged", mergeCommit: "m100", issueClosed: true, summary: "merged" };
        if (label.startsWith("verify:#1"))
          return { merged: true, issueClosed: true, mergeCommit: "m100", evidence: "merge commit on master" };
        return null;
      },
    });
    // The premature timeout was absorbed by a cheap read-only watch turn, and the real
    // gate came back exactly once, after the watcher saw CI finish ...
    expect(labels).toContain("gate:#1");
    expect(labels).toContain("gate:#1:ci-wait1");
    expect(labels).toContain("gate:#1:ci-done1");
    // ... and never triggered the expensive fresh implementer (the old build:#n:retry waste).
    expect(labels.filter((l) => l.startsWith("build:#1"))).toEqual(["build:#1"]);
    expect(labels).not.toContain("build:#1:retry");
    // The wait rode on the small model; the acting gate dispatches inherit the session model.
    expect(dispatches.find((d) => d.label === "gate:#1:ci-wait1")).toMatchObject({ model: "haiku", effort: "low" });
    expect(dispatches.find((d) => d.label === "gate:#1")?.model).toBeUndefined();
    expect(dispatches.find((d) => d.label === "gate:#1:ci-done1")?.model).toBeUndefined();
    // The ticket merged on its first and only attempt.
    expect(result.merged).toEqual([{ ticket: 1, title: "T1", pr: 100, mergeCommit: "m100" }]);
    expect(result.parked).toEqual([]);
  });

  test("watch turns are bounded: a CI that never lands falls back to a fresh attempt, then parks", async () => {
    const { result, labels, dispatches } = await runRalph({
      args: { only: [1], width: 1, target: "", gateWaits: 2, attempts: 2 },
      onAgent: (label) => {
        if (label.startsWith("build:#1")) return { status: "pr-open", pr: 100, summary: "built" };
        if (label.startsWith("gate:#1:ci-wait")) return { ci: "running", note: "still in progress" };
        if (label.startsWith("gate:#1")) return { status: "ci-timeout", summary: "CI never finishes" };
        if (label.startsWith("verify:#1")) return { merged: false, issueClosed: false, evidence: "not merged" };
        return null;
      },
    });
    // The watch loop is capped at gateWaits — it never spins unboundedly.
    expect(labels).toContain("gate:#1:ci-wait1");
    expect(labels).toContain("gate:#1:ci-wait2");
    expect(labels).not.toContain("gate:#1:ci-wait3");
    // A CI that never resolves never recalls the full gate — the whole wait stayed on
    // the small model; only the initial gate of each attempt inherits the session model.
    expect(labels.filter((l) => l.startsWith("gate:#1:ci-done"))).toEqual([]);
    expect(dispatches.filter((d) => d.label.startsWith("gate:#1") && d.model !== "haiku").map((d) => d.label)).toEqual([
      "gate:#1",
      "gate:#1",
    ]);
    // A genuinely stuck CI still degrades to the old safety net — a fresh implementer attempt ...
    expect(labels).toContain("build:#1:retry");
    // ... and after its attempts are spent the ticket parks rather than looping forever.
    expect(result.parked.map((p) => p.ticket)).toEqual([1]);
    expect(result.merged).toEqual([]);
  });

  test("a watcher seeing CI fail recalls the gate for the real verdict — no further watch turns", async () => {
    const { result, labels } = await runRalph({
      args: { only: [1], width: 1, target: "", gateWaits: 3, attempts: 1 },
      onAgent: (label) => {
        if (label.startsWith("build:#1")) return { status: "pr-open", pr: 100, summary: "built" };
        if (label.startsWith("gate:#1:ci-wait")) return { ci: "red", note: "unit-tests failed" };
        if (label === "gate:#1") return { status: "ci-timeout", summary: "CI still in progress" };
        if (label.startsWith("gate:#1:ci-done"))
          return { status: "ci-failed", summary: "unit-tests failed on PR #100" };
        if (label.startsWith("verify:#1")) return { merged: false, issueClosed: false, evidence: "not merged" };
        return null;
      },
    });
    // Red is a real verdict: one watch turn, then the gate returns and reports ci-failed.
    expect(labels).toContain("gate:#1:ci-wait1");
    expect(labels).not.toContain("gate:#1:ci-wait2");
    expect(labels).toContain("gate:#1:ci-done1");
    // The failure enters the ordinary attempt/park path with the gate's summary.
    expect(result.parked.map((p) => p.ticket)).toEqual([1]);
    expect(result.parked[0].failures.join(" ")).toContain("ci-failed");
  });
});
