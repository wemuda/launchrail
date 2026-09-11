#!/usr/bin/env node
import { AVAILABLE_MODULES, runAdd } from "./commands/add.js";
import { runAdrIndex } from "./commands/adr.js";
import { printDiff, runDiff } from "./commands/diff.js";
import { runDev } from "./commands/dev.js";
import { runDoctor, printDoctor } from "./commands/doctor.js";
import { runEject } from "./commands/eject.js";
import { runInit } from "./commands/init.js";
import { printStatus, runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runVerify } from "./commands/verify.js";
import { VERSION } from "./version.js";

const HELP = `launchrail ${VERSION} — an updatable development system for AI-assisted projects

Usage: launchrail <command> [options]

Commands:
  init      Initialize Launchrail in a new or existing repository
  doctor    Validate the repository and environment
  add       Add a module to the project (available: ${AVAILABLE_MODULES.join(", ")})
  verify    Run the deterministic verification contract
  dev       Start the smokeable stack from the manifest and record its state
  status    Inspect versions, enabled modules, drift, and missing requirements
  diff      Preview upstream changes
  sync      Synchronize managed capabilities and run migrations
  eject     Stop managing a selected module or file
  adr       Maintain the decision-record registry (adr index [--check])
  promote   Inspect potential reusable local improvements

Options:
  -h, --help       Show this help
  -v, --version    Show version

init / add options:
  --dry-run        Show what would be written without writing
  -y, --yes        Accept defaults; no interactive questions

verify options:
  --fast           Run only the fast gate (testing.checkCommand, else unitCommand; never e2e)

dev options:
  --background     Start detached, wait for every origin to answer, leave it running
  --port <n>       Re-address the app origin and expose PORT to the start command
  --stop           Stop the background stack recorded in .launchrail/state/dev.pid
  --check          Start, wait, assert the state files, tear down — proves the start contract
  --timeout <s>    Readiness deadline for --background/--check (default 120)

sync options:
  --dry-run        Preview migrations and file updates without writing

eject usage:
  launchrail eject <module|file> [--dry-run]   Stop managing a module's files or one file
  launchrail eject --all [--dry-run]           Vendor mode: eject everything

adr usage:
  launchrail adr index [--check]               Regenerate docs/adr/README.md's index table from the records (--check: report only)`;

const NOT_IMPLEMENTED = ["promote"];

const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.slice(1));

if (command === undefined || command === "-h" || command === "--help" || command === "help") {
  console.log(HELP);
  process.exit(0);
}

if (command === "-v" || command === "--version" || command === "version") {
  console.log(VERSION);
  process.exit(0);
}

if (command === "init") {
  const outcome = await runInit({
    cwd: process.cwd(),
    dryRun: flags.has("--dry-run"),
    yes: flags.has("--yes") || flags.has("-y"),
  });
  process.exit(outcome.code);
}

if (command === "doctor") {
  const outcome = runDoctor(process.cwd());
  printDoctor(outcome);
  process.exit(outcome.code);
}

if (command === "add") {
  const module = args[1] !== undefined && !args[1].startsWith("-") ? args[1] : null;
  if (!module) {
    console.error(`launchrail: usage: launchrail add <module> — available modules: ${AVAILABLE_MODULES.join(", ")}`);
    process.exit(1);
  }
  const outcome = await runAdd({
    cwd: process.cwd(),
    module,
    dryRun: flags.has("--dry-run"),
    yes: flags.has("--yes") || flags.has("-y"),
  });
  process.exit(outcome.code);
}

if (command === "verify") {
  process.exit(runVerify(process.cwd(), { fast: flags.has("--fast") }).code);
}

if (command === "dev") {
  const portIndex = args.indexOf("--port");
  const timeoutIndex = args.indexOf("--timeout");
  const timeoutSeconds = timeoutIndex !== -1 ? Number(args[timeoutIndex + 1]) : NaN;
  const outcome = await runDev({
    cwd: process.cwd(),
    background: flags.has("--background"),
    port: portIndex !== -1 ? (args[portIndex + 1] ?? null) : null,
    stop: flags.has("--stop"),
    check: flags.has("--check"),
    timeoutMs: Number.isFinite(timeoutSeconds) ? timeoutSeconds * 1000 : undefined,
  });
  process.exit(outcome.code);
}

if (command === "status") {
  const report = runStatus(process.cwd());
  printStatus(report);
  process.exit(report.code);
}

if (command === "diff") {
  const outcome = runDiff(process.cwd());
  printDiff(outcome);
  process.exit(outcome.code);
}

if (command === "sync") {
  process.exit(runSync({ cwd: process.cwd(), dryRun: flags.has("--dry-run") }).code);
}

if (command === "eject") {
  const target = args[1] !== undefined && !args[1].startsWith("-") ? args[1] : null;
  const outcome = runEject({
    cwd: process.cwd(),
    target,
    all: flags.has("--all"),
    dryRun: flags.has("--dry-run"),
  });
  process.exit(outcome.code);
}

if (command === "adr") {
  if (args[1] !== "index") {
    console.error("launchrail: usage: launchrail adr index [--check]");
    process.exit(1);
  }
  process.exit(runAdrIndex({ cwd: process.cwd(), check: flags.has("--check") }).code);
}

if (NOT_IMPLEMENTED.includes(command)) {
  console.error(`launchrail: "${command}" is not implemented yet.`);
  process.exit(1);
}

console.error(`launchrail: unknown command "${command}"\n`);
console.error(HELP);
process.exit(1);
