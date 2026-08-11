import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Consuming projects subscribe to the workflow's Claude Code plugins through a
 * committed, project-scoped declaration in .claude/settings.json (ADR-0003,
 * extended to the full roster by ADR-0011) — that is what offers teammates the
 * same skills on their first folder trust. The file is project-owned and
 * shared with unrelated Claude Code configuration, so it is never tracked in
 * the lockfile and never replaced: init only performs an additive merge of
 * the declaration keys below, and an explicit opt-out (a pluginKey set to
 * `false`) is respected.
 */
export const CLAUDE_SETTINGS_PATH = join(".claude", "settings.json");

export interface PluginDeclaration {
  /** Marketplace name as declared under extraKnownMarketplaces. */
  marketplace: string;
  /** GitHub owner/repo — the marketplace source, also fed to `claude plugin marketplace add`. */
  repo: string;
  /** Qualified plugin id (plugin@marketplace) — the enabledPlugins key and `claude plugin install` target. */
  pluginKey: string;
  /** Human-readable label for init/doctor messages. */
  label: string;
}

/**
 * The core workflow plugin roster is empty: Launchrail's own skills and the Matt
 * Pocock snapshot are vendored as managed files, not installed as plugins
 * (ADR-0019). A selected implementation loop may still declare its own external
 * plugin (superpowers) — that flows through `implementationLoopDeclarations`, not
 * this list. Kept as an (empty) array so the declaration machinery still serves
 * those provider plugins.
 */
export const PLUGIN_DECLARATIONS: PluginDeclaration[] = [];

/**
 * The declarations Launchrail wrote before it vendored skills (ADR-0003/0011).
 * The vendor migration strips these from a consumer's settings.json; they live
 * here only so it knows what to remove.
 */
export const RETIRED_PLUGIN_DECLARATIONS: PluginDeclaration[] = [
  { marketplace: "launchrail", repo: "wemuda/launchrail", pluginKey: "launchrail@launchrail", label: "Launchrail" },
  {
    marketplace: "mattpocock",
    repo: "mattpocock/skills",
    pluginKey: "mattpocock-skills@mattpocock",
    label: "Matt Pocock's skills",
  },
];

export type DeclarationState = "declared" | "no-file" | "invalid-json" | "undeclared";

interface Settings {
  extraKnownMarketplaces?: Record<string, unknown>;
  enabledPlugins?: Record<string, unknown>;
  [key: string]: unknown;
}

function readSettings(
  root: string,
  declarations: PluginDeclaration[],
): { settings: Settings | null; state: DeclarationState } {
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
  const declared = declarations.every(
    (d) =>
      settings.extraKnownMarketplaces?.[d.marketplace] !== undefined &&
      settings.enabledPlugins?.[d.pluginKey] !== undefined,
  );
  return { settings, state: declared ? "declared" : "undeclared" };
}

export function declarationState(root: string, declarations: PluginDeclaration[] = PLUGIN_DECLARATIONS): DeclarationState {
  return readSettings(root, declarations).state;
}

export type SettingsPlanKind = "create" | "merge" | "skip-declared" | "skip-invalid";

export interface SettingsPlan {
  kind: SettingsPlanKind;
  detail: string;
  /** Full file content to write; null when nothing should change. */
  content: string | null;
}

export function planPluginDeclaration(
  root: string,
  declarations: PluginDeclaration[] = PLUGIN_DECLARATIONS,
): SettingsPlan {
  // Nothing to declare (the core roster is vendored now) — never create or touch
  // the file just to write empty declaration objects.
  if (declarations.length === 0) {
    return { kind: "skip-declared", detail: "no workflow plugins to declare", content: null };
  }
  const { settings, state } = readSettings(root, declarations);
  if (state === "invalid-json") {
    return { kind: "skip-invalid", detail: "unparseable JSON — not touching it", content: null };
  }
  if (state === "declared") {
    return { kind: "skip-declared", detail: "workflow plugins already declared", content: null };
  }

  const merged: Settings = settings ? { ...settings } : {};
  merged.extraKnownMarketplaces = { ...merged.extraKnownMarketplaces };
  merged.enabledPlugins = { ...merged.enabledPlugins };
  for (const d of declarations) {
    if (merged.extraKnownMarketplaces[d.marketplace] === undefined) {
      merged.extraKnownMarketplaces[d.marketplace] = { source: { source: "github", repo: d.repo } };
    }
    if (merged.enabledPlugins[d.pluginKey] === undefined) {
      merged.enabledPlugins[d.pluginKey] = true;
    }
  }

  return {
    kind: state === "no-file" ? "create" : "merge",
    detail:
      state === "no-file"
        ? "declares the workflow plugins for this project"
        : "adding the workflow plugin declarations, keeping existing settings",
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

export type SettingsRemovalKind = "remove" | "skip-absent" | "skip-invalid" | "skip-no-file";

export interface SettingsRemovalPlan {
  kind: SettingsRemovalKind;
  detail: string;
  /** Full file content to write; null when nothing should change. */
  content: string | null;
}

/**
 * Plan removal of retired plugin declarations from .claude/settings.json — the
 * additive inverse of planPluginDeclaration (ADR-0019). Only the named keys are
 * dropped; anything else the project put there (other marketplaces/plugins, a
 * selected loop's declaration, unrelated settings) is preserved, and a container
 * emptied by the removal is dropped rather than left as `{}`.
 */
export function planRemovePluginDeclaration(
  root: string,
  declarations: PluginDeclaration[] = RETIRED_PLUGIN_DECLARATIONS,
): SettingsRemovalPlan {
  const path = join(root, CLAUDE_SETTINGS_PATH);
  if (!existsSync(path)) return { kind: "skip-no-file", detail: "no .claude/settings.json", content: null };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { kind: "skip-invalid", detail: "unparseable JSON — not touching it", content: null };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { kind: "skip-invalid", detail: "unparseable JSON — not touching it", content: null };
  }
  const settings = data as Settings;
  let changed = false;
  for (const d of declarations) {
    if (settings.extraKnownMarketplaces && d.marketplace in settings.extraKnownMarketplaces) {
      delete settings.extraKnownMarketplaces[d.marketplace];
      changed = true;
    }
    if (settings.enabledPlugins && d.pluginKey in settings.enabledPlugins) {
      delete settings.enabledPlugins[d.pluginKey];
      changed = true;
    }
  }
  if (!changed) return { kind: "skip-absent", detail: "no retired plugin declarations present", content: null };
  if (settings.extraKnownMarketplaces && Object.keys(settings.extraKnownMarketplaces).length === 0) {
    delete settings.extraKnownMarketplaces;
  }
  if (settings.enabledPlugins && Object.keys(settings.enabledPlugins).length === 0) {
    delete settings.enabledPlugins;
  }
  return {
    kind: "remove",
    detail: "removing the retired workflow plugin declarations",
    content: JSON.stringify(settings, null, 2) + "\n",
  };
}

/** Execute a removal plan. Returns true when the file was written. */
export function applyRemovePluginDeclaration(root: string, plan: SettingsRemovalPlan): boolean {
  if (plan.content === null) return false;
  writeFileSync(join(root, CLAUDE_SETTINGS_PATH), plan.content, "utf8");
  return true;
}
