import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Consuming projects subscribe to the Launchrail plugin through a committed,
 * project-scoped declaration in .claude/settings.json (ADR-0003). The file is
 * project-owned and shared with unrelated Claude Code configuration, so it is
 * never tracked in the lockfile and never replaced: init only performs an
 * additive merge of the two keys below, and an explicit opt-out
 * (`"launchrail@launchrail": false`) is respected.
 */
export const CLAUDE_SETTINGS_PATH = join(".claude", "settings.json");

const MARKETPLACE_NAME = "launchrail";
const PLUGIN_KEY = "launchrail@launchrail";
const MARKETPLACE_SOURCE = { source: "github", repo: "wemuda/launchrail" };

export type DeclarationState = "declared" | "no-file" | "invalid-json" | "undeclared";

interface Settings {
  extraKnownMarketplaces?: Record<string, unknown>;
  enabledPlugins?: Record<string, unknown>;
  [key: string]: unknown;
}

function readSettings(root: string): { settings: Settings | null; state: DeclarationState } {
  const path = join(root, CLAUDE_SETTINGS_PATH);
  if (!existsSync(path)) return { settings: null, state: "no-file" };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { settings: null, state: "invalid-json" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { settings: null, state: "invalid-json" };
  }
  const settings = data as Settings;
  const declared =
    settings.extraKnownMarketplaces?.[MARKETPLACE_NAME] !== undefined &&
    settings.enabledPlugins?.[PLUGIN_KEY] !== undefined;
  return { settings, state: declared ? "declared" : "undeclared" };
}

export function declarationState(root: string): DeclarationState {
  return readSettings(root).state;
}

export type SettingsPlanKind = "create" | "merge" | "skip-declared" | "skip-invalid";

export interface SettingsPlan {
  kind: SettingsPlanKind;
  detail: string;
  /** Full file content to write; null when nothing should change. */
  content: string | null;
}

export function planPluginDeclaration(root: string): SettingsPlan {
  const { settings, state } = readSettings(root);
  if (state === "invalid-json") {
    return { kind: "skip-invalid", detail: "unparseable JSON — not touching it", content: null };
  }
  if (state === "declared") {
    return { kind: "skip-declared", detail: "plugin already declared", content: null };
  }

  const merged: Settings = settings ? { ...settings } : {};
  merged.extraKnownMarketplaces = { ...merged.extraKnownMarketplaces };
  if (merged.extraKnownMarketplaces[MARKETPLACE_NAME] === undefined) {
    merged.extraKnownMarketplaces[MARKETPLACE_NAME] = { source: MARKETPLACE_SOURCE };
  }
  merged.enabledPlugins = { ...merged.enabledPlugins };
  if (merged.enabledPlugins[PLUGIN_KEY] === undefined) {
    merged.enabledPlugins[PLUGIN_KEY] = true;
  }

  return {
    kind: state === "no-file" ? "create" : "merge",
    detail:
      state === "no-file"
        ? "declares the Launchrail plugin for this project"
        : "adding the Launchrail plugin declaration, keeping existing settings",
    content: JSON.stringify(merged, null, 2) + "\n",
  };
}

/** Execute a plan. Returns true when the file was written. */
export function applyPluginDeclaration(root: string, plan: SettingsPlan): boolean {
  if (plan.content === null) return false;
  const abs = join(root, CLAUDE_SETTINGS_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, plan.content, "utf8");
  return true;
}
