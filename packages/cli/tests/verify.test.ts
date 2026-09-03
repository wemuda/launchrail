import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runVerify } from "../src/commands/verify.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => tmp.cleanup());

function writeManifest(body: string): void {
  writeFileSync(join(tmp.root, ".launchrail.yml"), `schemaVersion: 1\nmode: standard-mvp\n${body}`);
}

describe("launchrail verify", () => {
  test("passes when every configured command passes", () => {
    writeManifest('testing:\n  unitCommand: node -e "process.exit(0)"\n');
    const outcome = runVerify(tmp.root);
    expect(outcome.code).toBe(0);
    expect(outcome.results).toHaveLength(1);
  });

  test("fails when a command fails", () => {
    writeManifest('testing:\n  unitCommand: node -e "process.exit(3)"\n');
    const outcome = runVerify(tmp.root);
    expect(outcome.code).toBe(1);
    expect(outcome.results[0]?.status).toBe(3);
  });

  test("an empty verification contract cannot pass", () => {
    writeManifest("");
    expect(runVerify(tmp.root).code).toBe(1);
  });

  test("runs the e2e command only when browser-testing is enabled", () => {
    const marker = join(tmp.root, "e2e-ran");
    const e2e = `node -e "require('node:fs').writeFileSync('e2e-ran', '')"`;
    writeManifest(`testing:\n  unitCommand: node -e "process.exit(0)"\n  e2eCommand: ${JSON.stringify(e2e)}\n`);
    runVerify(tmp.root);
    expect(existsSync(marker)).toBe(false);

    writeManifest(
      `testing:\n  unitCommand: node -e "process.exit(0)"\n  e2eCommand: ${JSON.stringify(e2e)}\nmodules:\n  core: true\n  browser-testing: true\n`,
    );
    const outcome = runVerify(tmp.root);
    expect(outcome.code).toBe(0);
    expect(existsSync(marker)).toBe(true);
    expect(outcome.results.map((r) => r.step.name)).toEqual(["unit", "e2e"]);
  });

  test("fails without a manifest", () => {
    expect(runVerify(tmp.root).code).toBe(1);
  });
});

describe("launchrail verify --fast", () => {
  test("runs the check command alone — never the unit or e2e steps", () => {
    const unit = join(tmp.root, "unit-ran");
    const e2e = join(tmp.root, "e2e-ran");
    const touch = (name: string) => `node -e "require('node:fs').writeFileSync('${name}', '')"`;
    writeManifest(
      `testing:\n  unitCommand: ${JSON.stringify(touch("unit-ran"))}\n  checkCommand: node -e "process.exit(0)"\n  e2eCommand: ${JSON.stringify(touch("e2e-ran"))}\nmodules:\n  core: true\n  browser-testing: true\n`,
    );
    const outcome = runVerify(tmp.root, { fast: true });
    expect(outcome.code).toBe(0);
    expect(outcome.results.map((r) => r.step.name)).toEqual(["check"]);
    expect(existsSync(unit)).toBe(false);
    expect(existsSync(e2e)).toBe(false);
  });

  test("falls back to the unit command when no check command is configured, still skipping e2e", () => {
    const e2e = join(tmp.root, "e2e-ran");
    writeManifest(
      `testing:\n  unitCommand: node -e "process.exit(0)"\n  e2eCommand: ${JSON.stringify(`node -e "require('node:fs').writeFileSync('e2e-ran', '')"`)}\nmodules:\n  core: true\n  browser-testing: true\n`,
    );
    const outcome = runVerify(tmp.root, { fast: true });
    expect(outcome.code).toBe(0);
    expect(outcome.results.map((r) => r.step.command)).toEqual(['node -e "process.exit(0)"']);
    expect(existsSync(e2e)).toBe(false);
  });

  test("a failing fast gate fails, and an empty contract cannot pass", () => {
    writeManifest('testing:\n  checkCommand: node -e "process.exit(2)"\n');
    expect(runVerify(tmp.root, { fast: true }).code).toBe(1);
    writeManifest("");
    expect(runVerify(tmp.root, { fast: true }).code).toBe(1);
  });
});
