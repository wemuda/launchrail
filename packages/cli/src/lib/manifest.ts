import { parse, parseDocument, stringify } from "yaml";
import {
  DEFAULT_IMPLEMENTATION_LOOP,
  IMPLEMENTATION_LOOPS,
  type ImplementationLoop,
} from "./implementationLoops.js";

export const MANIFEST_FILENAME = ".launchrail.yml";

export const MODES = ["spike", "standard-mvp", "high-rigor"] as const;
export type Mode = (typeof MODES)[number];

/**
 * Whether the repository is a greenfield start or a codebase being adopted.
 * `existing` sends `launch` down the alignment on-ramp — infer artifacts from
 * the code and fill gaps — instead of the from-scratch vision flow (ADR-0013).
 */
export const ORIGINS = ["new", "existing"] as const;
export type Origin = (typeof ORIGINS)[number];

export const ISSUE_TRACKERS = ["github", "linear", "none"] as const;
export type IssueTracker = (typeof ISSUE_TRACKERS)[number];

export const TESTING_KEYS = ["unitCommand", "devCommand", "e2eCommand", "smokeCommand", "appUrl"] as const;
export type TestingKey = (typeof TESTING_KEYS)[number];

export interface Manifest {
  schemaVersion: 1;
  mode: Mode;
  origin: Origin;
  issueTracker: IssueTracker;
  conventions: {
    conventionalCommits: boolean;
  };
  testing: Record<TestingKey, string | null>;
  modules: Record<string, boolean>;
  /** Which stage-10 loop drives ready tickets to verified merges (ADR-0017). */
  implementationLoop: ImplementationLoop;
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

  // Optional with a default so manifests written before `origin` existed stay
  // valid; an explicit but unknown value is still an error.
  let origin: Origin = "new";
  if (data.origin !== undefined) {
    if (typeof data.origin === "string" && (ORIGINS as readonly string[]).includes(data.origin)) {
      origin = data.origin as Origin;
    } else {
      errors.push(`origin must be one of: ${ORIGINS.join(", ")}`);
    }
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

  const testing: Record<TestingKey, string | null> = {
    unitCommand: null,
    devCommand: null,
    e2eCommand: null,
    smokeCommand: null,
    appUrl: null,
  };
  if (data.testing !== undefined) {
    if (isRecord(data.testing)) {
      for (const key of TESTING_KEYS) {
        const value = data.testing[key];
        if (value === undefined || value === null) continue;
        if (typeof value === "string") testing[key] = value;
        else errors.push(`testing.${key} must be a string or null`);
      }
    } else {
      errors.push("testing must be a mapping");
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

  // Optional with a default so manifests written before the loop became
  // selectable stay valid (ADR-0017); an explicit but unknown value still errors.
  let implementationLoop: ImplementationLoop = DEFAULT_IMPLEMENTATION_LOOP;
  if (data.implementationLoop !== undefined) {
    if (
      typeof data.implementationLoop === "string" &&
      (IMPLEMENTATION_LOOPS as readonly string[]).includes(data.implementationLoop)
    ) {
      implementationLoop = data.implementationLoop as ImplementationLoop;
    } else {
      errors.push(`implementationLoop must be one of: ${IMPLEMENTATION_LOOPS.join(", ")}`);
    }
  }

  if (errors.length > 0) return { manifest: null, errors };
  return {
    manifest: {
      schemaVersion: 1,
      mode: data.mode as Mode,
      origin,
      issueTracker,
      conventions: { conventionalCommits },
      testing,
      modules,
      implementationLoop,
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

export interface ModuleEnableResult {
  source: string;
  changed: boolean;
}

/**
 * Enable a module and record testing commands in an existing manifest source.
 *
 * The manifest is seeded (project-owned once created), so this is the one
 * deliberate exception to "never rewrite seeded files": a user-requested
 * configuration change, applied via a YAML document round-trip that preserves
 * the user's comments and formatting.
 */
export function setModuleEnabled(
  source: string,
  module: string,
  testing: Partial<Record<TestingKey, string | null>>,
): ModuleEnableResult {
  const doc = parseDocument(source);
  let changed = false;
  if (doc.getIn(["modules", module]) !== true) {
    doc.setIn(["modules", module], true);
    changed = true;
  }
  for (const [key, value] of Object.entries(testing)) {
    const current = doc.getIn(["testing", key]);
    if ((current ?? null) !== (value ?? null)) {
      doc.setIn(["testing", key], value);
      changed = true;
    }
  }
  return { source: doc.toString(), changed };
}
