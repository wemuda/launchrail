import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { BROWSER_TESTING_MODULE } from "./browser-testing.js";
import { CLAUDE_SETTINGS_PATH } from "./claudeSettings.js";
import type { RepoDetection } from "./detect.js";
import type { Manifest } from "./manifest.js";

/**
 * Loop readiness (ADR-0033): the implementation loop is only as fast as the
 * repository's gates, caches, and CI triggers let it be. These are the
 * deterministic halves of the readiness story — doctor reports them as warn-only
 * `ralph …` lines, and the `launch-loop-readiness` skill measures and fixes them.
 */
export const READINESS_SKILL = "launch-loop-readiness";

/** The placeholder init seeds into AGENTS.md when no test command was detected. */
export const AGENTS_COMMANDS_TODO = "TODO: document the commands agents must run";

export interface FastGateReadiness {
  status: "pass" | "warn";
  message: string;
}

/**
 * `verify --fast` runs `testing.checkCommand` and falls back to the unit command.
 * On a project with browser journeys that fallback makes every land pay the full
 * suite — a warning; on a light project it is fine, and only worth a hint.
 */
export function fastGateReadiness(manifest: Manifest, detection: RepoDetection): FastGateReadiness {
  if (manifest.testing.checkCommand) {
    return { status: "pass", message: `fast gate: ${manifest.testing.checkCommand}` };
  }
  const heavy =
    manifest.modules[BROWSER_TESTING_MODULE] === true ||
    manifest.testing.e2eCommand !== null ||
    detection.playwrightConfigFile !== null ||
    detection.hasPlaywrightDep;
  if (heavy) {
    return {
      status: "warn",
      message: `testing.checkCommand unset — the loop's per-land gate is the full unit command, browser journeys included; name a lint + typecheck + quick-unit command (${READINESS_SKILL} measures and sets it)`,
    };
  }
  return {
    status: "pass",
    message: "fast gate falls back to the unit command (set testing.checkCommand for a quicker per-land gate)",
  };
}

export interface CiTriggerReadiness {
  /** Workflow files found under .github/workflows. */
  workflows: string[];
  /** The ones whose `on` fires on every push — no branch, path, or tag filter. */
  everyPush: string[];
}

const PUSH_FILTERS = ["branches", "branches-ignore", "paths", "paths-ignore", "tags", "tags-ignore"];

function runsOnEveryPush(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null) return false;
  const record = doc as Record<string, unknown>;
  // YAML 1.1 readers turn the bare key `on` into boolean true; the yaml package
  // (1.2) keeps it a string. Accept both spellings.
  const on = "on" in record ? record.on : record.true;
  if (on === undefined) return false;
  if (typeof on === "string") return on === "push";
  if (Array.isArray(on)) return on.includes("push");
  if (typeof on === "object" && on !== null && "push" in on) {
    const push = (on as Record<string, unknown>).push;
    if (typeof push !== "object" || push === null) return true;
    return !PUSH_FILTERS.some((key) => key in push);
  }
  return false;
}

/**
 * The loop pushes `ralph/*` branches on every green step and the integration
 * branch on every land. A workflow that triggers on every push turns each of
 * those into a CI run nobody waits on — runner minutes and queue slots for
 * nothing. GitHub Actions only; other CI systems are the skill's job.
 */
export function ciTriggerReadiness(cwd: string): CiTriggerReadiness {
  const dir = join(cwd, ".github", "workflows");
  if (!existsSync(dir)) return { workflows: [], everyPush: [] };
  const workflows = readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();
  const everyPush: string[] = [];
  for (const file of workflows) {
    let doc: unknown;
    try {
      doc = parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue; // an unparseable workflow is CI's problem, not readiness's
    }
    if (runsOnEveryPush(doc)) everyPush.push(file);
  }
  return { workflows, everyPush };
}

export interface JourneyReadiness {
  file: string;
  /** The config pins Playwright to a single worker, so every journey runs serially. */
  serial: boolean;
  evidence: string | null;
}

/**
 * A `workers: 1` pin makes the whole journey suite serial — the full gate's
 * dominant cost in the field. A textual heuristic (the config is code): it flags
 * only the global single-worker pin, never per-project parallelism choices.
 */
export function journeyReadiness(cwd: string, configFile: string): JourneyReadiness {
  const source = readFileSync(join(cwd, configFile), "utf8");
  const match = /\bworkers\s*:\s*1\b(?!\s*:)/.exec(source);
  return { file: configFile, serial: match !== null, evidence: match?.[0] ?? null };
}

export type SessionStartHookState = "registered" | "missing" | "invalid-json";

/**
 * Hosted sessions (Claude Code on the web) start from a fresh container: without
 * a SessionStart hook nothing installs dependencies or the pinned browsers, and
 * the loop's preflight refuses on the mismatch. Any registered SessionStart
 * command counts — the hook's contents are the project's.
 */
export function sessionStartHookState(cwd: string): SessionStartHookState {
  const path = join(cwd, CLAUDE_SETTINGS_PATH);
  if (!existsSync(path)) return "missing";
  let settings: unknown;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return "invalid-json";
  }
  const entries = (settings as { hooks?: { SessionStart?: unknown } } | null)?.hooks?.SessionStart;
  if (!Array.isArray(entries)) return "missing";
  const registered = entries.some(
    (entry: { hooks?: unknown }) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((hook: { command?: unknown }) => typeof hook?.command === "string" && hook.command.length > 0),
  );
  return registered ? "registered" : "missing";
}

export type AgentsCommandsState = "documented" | "todo" | "missing";

/** Builders read install, check, and test commands verbatim from AGENTS.md. */
export function agentsCommandsState(cwd: string): AgentsCommandsState {
  const path = join(cwd, "AGENTS.md");
  if (!existsSync(path)) return "missing";
  return readFileSync(path, "utf8").includes(AGENTS_COMMANDS_TODO) ? "todo" : "documented";
}
