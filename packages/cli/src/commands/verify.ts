import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_TESTING_MODULE } from "../lib/browser-testing.js";
import { MANIFEST_FILENAME, parseManifest } from "../lib/manifest.js";
import { INSTALL_HINT, missingDependencies } from "../lib/stack.js";

export interface VerifyStep {
  name: string;
  command: string;
}

export interface VerifyResult {
  step: VerifyStep;
  status: number;
}

export interface VerifyOutcome {
  code: number;
  results: VerifyResult[];
}

export interface VerifyOptions {
  /**
   * The fast tier: only `testing.checkCommand` (or `unitCommand` when no check
   * command is configured) — never the e2e step. The Ralph loop runs this before
   * every land and saves the full contract for its checkpoints and the release.
   */
  fast?: boolean;
  /**
   * Write everything verify prints, the steps' own output included, to this
   * file descriptor instead of the terminal. `launchrail land` keeps the gate's
   * output in a log and reports only the verdict.
   */
  outputFd?: number;
}

/**
 * Run the project's deterministic verification contract: every configured
 * check, in order, with a pass/fail summary. The browser smoke is separate — a
 * one-off, agent-driven check of a change (ADR-0034) — verify is the stable
 * release gate. `--fast` runs the
 * cheap tier only (see VerifyOptions).
 */
export function runVerify(cwd: string, options: VerifyOptions = {}): VerifyOutcome {
  const fd = options.outputFd;
  const out = (line: string) => (fd === undefined ? console.log(line) : writeSync(fd, `${line}\n`));
  const err = (line: string) => (fd === undefined ? console.error(line) : writeSync(fd, `${line}\n`));
  const manifestPath = join(cwd, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    err(`launchrail: ${MANIFEST_FILENAME} not found — run \`launchrail init\` first.`);
    return { code: 1, results: [] };
  }
  const parsed = parseManifest(readFileSync(manifestPath, "utf8"));
  if (!parsed.manifest) {
    err(`launchrail: ${MANIFEST_FILENAME} is invalid:`);
    for (const error of parsed.errors) err(`  - ${error}`);
    return { code: 1, results: [] };
  }

  // A fresh clone (every hosted session) has no node_modules: the failure to
  // name is the missing install, not "turbo: not found" from the first step.
  if (missingDependencies(cwd)) {
    err(`launchrail: dependencies are not installed (no node_modules) — ${INSTALL_HINT}.`);
    return { code: 1, results: [] };
  }

  const { testing, modules } = parsed.manifest;
  const steps: VerifyStep[] = [];
  if (options.fast) {
    const command = testing.checkCommand ?? testing.unitCommand;
    if (command) steps.push({ name: "check", command });
  } else {
    if (testing.unitCommand) steps.push({ name: "unit", command: testing.unitCommand });
    if (modules[BROWSER_TESTING_MODULE] && testing.e2eCommand) {
      steps.push({ name: "e2e", command: testing.e2eCommand });
    }
  }

  if (steps.length === 0) {
    err(
      "launchrail: no verification commands configured — set testing.unitCommand (and testing.e2eCommand) in " +
        `${MANIFEST_FILENAME}. An empty verification contract cannot pass.`,
    );
    return { code: 1, results: [] };
  }
  if (options.fast) {
    out(
      testing.checkCommand
        ? "Fast gate (testing.checkCommand) — the full contract runs with plain `verify`."
        : "Fast gate — no testing.checkCommand configured, running testing.unitCommand; set checkCommand in " +
            `${MANIFEST_FILENAME} to name a quicker lint/typecheck/unit gate.`,
    );
  }

  const results: VerifyResult[] = [];
  for (const step of steps) {
    out(`\n→ ${step.name}: ${step.command}`);
    const run = spawnSync(step.command, { cwd, shell: true, stdio: fd === undefined ? "inherit" : ["ignore", fd, fd] });
    results.push({ step, status: run.status ?? 1 });
  }

  out("");
  for (const { step, status } of results) {
    out(`  ${status === 0 ? "✓" : "✗"} ${step.name} (${step.command})`);
  }
  const failed = results.filter((r) => r.status !== 0).length;
  const tier = options.fast ? "Fast gate" : "Verification";
  out(failed === 0 ? `\n${tier} passed.` : `\n${tier} failed: ${failed} of ${results.length} step(s).`);
  return { code: failed === 0 ? 0 : 1, results };
}
