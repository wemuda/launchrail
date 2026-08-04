#!/usr/bin/env node
import { runDoctor, printDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { VERSION } from "./version.js";

const HELP = `launchrail ${VERSION} — an updatable development system for AI-assisted projects

Usage: launchrail <command> [options]

Commands:
  init      Initialize Launchrail in a new or existing repository
  doctor    Validate the repository and environment
  status    Inspect versions, enabled modules, drift, and missing requirements
  diff      Preview upstream changes
  sync      Synchronize managed capabilities and run migrations
  add       Add a module to the project
  verify    Run the complete verification contract
  eject     Stop managing a selected module or file
  promote   Inspect potential reusable local improvements

Options:
  -h, --help       Show this help
  -v, --version    Show version

init options:
  --dry-run        Show what would be written without writing
  -y, --yes        Accept defaults; no interactive questions`;

const NOT_IMPLEMENTED = ["status", "diff", "sync", "add", "verify", "eject", "promote"];

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

if (NOT_IMPLEMENTED.includes(command)) {
  console.error(`launchrail: "${command}" is not implemented yet.`);
  process.exit(1);
}

console.error(`launchrail: unknown command "${command}"\n`);
console.error(HELP);
process.exit(1);
