import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_TESTING_MODULE } from "../lib/browser-testing.js";
import { MANIFEST_FILENAME, parseManifest } from "../lib/manifest.js";

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
}

/**
 * Run the project's deterministic verification contract: every configured
 * check, in order, with a pass/fail summary. Agentic smoke testing is separate
 * (`launchrail smoke`) — verify is the stable release gate. `--fast` runs the
 * cheap tier only (see VerifyOptions).
 */
export function runVerify(cwd: string, options: VerifyOptions = {}): VerifyOutcome {
  const manifestPath = join(cwd, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    console.error(`launchrail: ${MANIFEST_FILENAME} not found — run \`launchrail init\` first.`);
    return { code: 1, results: [] };
  }
  const parsed = parseManifest(readFileSync(manifestPath, "utf8"));
  if (!parsed.manifest) {
    console.error(`launchrail: ${MANIFEST_FILENAME} is invalid:`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
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
    console.error(
      "launchrail: no verification commands configured — set testing.unitCommand (and testing.e2eCommand) in " +
        `${MANIFEST_FILENAME}. An empty verification contract cannot pass.`,
    );
    return { code: 1, results: [] };
  }
  if (options.fast) {
    console.log(
      testing.checkCommand
        ? "Fast gate (testing.checkCommand) — the full contract runs with plain `verify`."
        : "Fast gate — no testing.checkCommand configured, running testing.unitCommand; set checkCommand in " +
            `${MANIFEST_FILENAME} to name a quicker lint/typecheck/unit gate.`,
    );
  }

  const results: VerifyResult[] = [];
  for (const step of steps) {
    console.log(`\n→ ${step.name}: ${step.command}`);
    const run = spawnSync(step.command, { cwd, shell: true, stdio: "inherit" });
    results.push({ step, status: run.status ?? 1 });
  }

  console.log("");
  for (const { step, status } of results) {
    console.log(`  ${status === 0 ? "✓" : "✗"} ${step.name} (${step.command})`);
  }
  const failed = results.filter((r) => r.status !== 0).length;
  const tier = options.fast ? "Fast gate" : "Verification";
  console.log(failed === 0 ? `\n${tier} passed.` : `\n${tier} failed: ${failed} of ${results.length} step(s).`);
  return { code: failed === 0 ? 0 : 1, results };
}
