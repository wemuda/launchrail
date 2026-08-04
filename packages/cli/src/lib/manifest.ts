import { parse, stringify } from "yaml";

export const MANIFEST_FILENAME = ".launchrail.yml";

export const MODES = ["spike", "standard-mvp", "high-rigor"] as const;
export type Mode = (typeof MODES)[number];

export const ISSUE_TRACKERS = ["github", "linear", "none"] as const;
export type IssueTracker = (typeof ISSUE_TRACKERS)[number];

export interface Manifest {
  schemaVersion: 1;
  mode: Mode;
  issueTracker: IssueTracker;
  conventions: {
    conventionalCommits: boolean;
  };
  testing: {
    unitCommand: string | null;
  };
  modules: Record<string, boolean>;
}

export interface ManifestParseResult {
  manifest: Manifest | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict on the fields that change behavior (schemaVersion, mode), lenient
 * with defaults on the rest so hand-edited manifests stay valid.
 */
export function validateManifest(data: unknown): ManifestParseResult {
  if (!isRecord(data)) {
    return { manifest: null, errors: ["manifest must be a YAML mapping"] };
  }
  const errors: string[] = [];

  if (data.schemaVersion !== 1) {
    errors.push(`schemaVersion must be 1 (found ${JSON.stringify(data.schemaVersion ?? null)})`);
  }
  if (typeof data.mode !== "string" || !(MODES as readonly string[]).includes(data.mode)) {
    errors.push(`mode must be one of: ${MODES.join(", ")}`);
  }

  let issueTracker: IssueTracker = "none";
  if (data.issueTracker !== undefined) {
    if (typeof data.issueTracker === "string" && (ISSUE_TRACKERS as readonly string[]).includes(data.issueTracker)) {
      issueTracker = data.issueTracker as IssueTracker;
    } else {
      errors.push(`issueTracker must be one of: ${ISSUE_TRACKERS.join(", ")}`);
    }
  }

  let conventionalCommits = true;
  if (data.conventions !== undefined) {
    if (isRecord(data.conventions) && typeof data.conventions.conventionalCommits === "boolean") {
      conventionalCommits = data.conventions.conventionalCommits;
    } else {
      errors.push("conventions.conventionalCommits must be a boolean");
    }
  }

  let unitCommand: string | null = null;
  if (data.testing !== undefined) {
    if (isRecord(data.testing) && (data.testing.unitCommand === null || typeof data.testing.unitCommand === "string")) {
      unitCommand = data.testing.unitCommand;
    } else {
      errors.push("testing.unitCommand must be a string or null");
    }
  }

  let modules: Record<string, boolean> = { core: true };
  if (data.modules !== undefined) {
    if (isRecord(data.modules) && Object.values(data.modules).every((v) => typeof v === "boolean")) {
      modules = data.modules as Record<string, boolean>;
    } else {
      errors.push("modules must map module names to booleans");
    }
  }

  if (errors.length > 0) return { manifest: null, errors };
  return {
    manifest: {
      schemaVersion: 1,
      mode: data.mode as Mode,
      issueTracker,
      conventions: { conventionalCommits },
      testing: { unitCommand },
      modules,
    },
    errors: [],
  };
}

export function parseManifest(source: string): ManifestParseResult {
  let data: unknown;
  try {
    data = parse(source);
  } catch (err) {
    return { manifest: null, errors: [`invalid YAML: ${err instanceof Error ? err.message : String(err)}`] };
  }
  return validateManifest(data);
}

export function serializeManifest(manifest: Manifest): string {
  const header =
    "# Launchrail project manifest — https://github.com/wemuda/launchrail\n" +
    "# This file is yours to edit; Launchrail reads it and never force-overwrites it.\n";
  return header + stringify(manifest);
}
