#!/usr/bin/env node
const VERSION = "0.0.0";

const HELP = `launchrail ${VERSION} — an updatable development system for AI-assisted projects

Usage: launchrail <command> [options]

Commands:
  init      Initialize Launchrail in a new or existing repository
  status    Inspect versions, enabled modules, drift, and missing requirements
  diff      Preview upstream changes
  sync      Synchronize managed capabilities and run migrations
  add       Add a module to the project
  doctor    Validate the repository and environment
  verify    Run the complete verification contract
  eject     Stop managing a selected module or file
  promote   Inspect potential reusable local improvements

Options:
  -h, --help       Show this help
  -v, --version    Show version

All commands that write files will support --dry-run.`;

const COMMANDS = [
  "init",
  "status",
  "diff",
  "sync",
  "add",
  "doctor",
  "verify",
  "eject",
  "promote",
] as const;

type Command = (typeof COMMANDS)[number];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

const arg = process.argv[2];

if (arg === undefined || arg === "-h" || arg === "--help" || arg === "help") {
  console.log(HELP);
  process.exit(0);
}

if (arg === "-v" || arg === "--version" || arg === "version") {
  console.log(VERSION);
  process.exit(0);
}

if (!isCommand(arg)) {
  console.error(`launchrail: unknown command "${arg}"\n`);
  console.error(HELP);
  process.exit(1);
}

console.error(`launchrail: "${arg}" is not implemented yet.`);
process.exit(1);
