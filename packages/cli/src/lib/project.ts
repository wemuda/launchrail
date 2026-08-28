import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsDocsFiles } from "./agentsDocs.js";
import { BROWSER_TESTING_MODULE, browserTestingFiles } from "./browser-testing.js";
import { detectRepo, type RepoDetection } from "./detect.js";
import { LOCKFILE_FILENAME, readLockfile, type Lockfile } from "./lockfile.js";
import { MANIFEST_FILENAME, parseManifest, type Manifest } from "./manifest.js";
import { RALPH_MODULE, ralphFiles } from "./ralph.js";
import { seedFiles } from "./seeds.js";
import { skillFiles } from "./skills.js";
import type { FileSpec } from "./writer.js";
import { VERSION } from "../version.js";

export interface ProjectState {
  manifest: Manifest;
  lockfile: Lockfile;
  detection: RepoDetection;
  /** Project root the state was loaded from — seeds that read the repo need it. */
  cwd: string;
}

export interface ProjectLoadResult {
  state: ProjectState | null;
  errors: string[];
}

/** Load manifest and lockfile — the precondition for status, diff, sync, and eject. */
export function loadProject(cwd: string): ProjectLoadResult {
  const detection = detectRepo(cwd);
  if (!detection.hasManifest) {
    return { state: null, errors: [`${MANIFEST_FILENAME} not found — run \`launchrail init\` first.`] };
  }
  const parsed = parseManifest(readFileSync(join(cwd, MANIFEST_FILENAME), "utf8"));
  if (!parsed.manifest) {
    return { state: null, errors: [`${MANIFEST_FILENAME} is invalid: ${parsed.errors.join("; ")}`] };
  }
  const { lockfile, error } = readLockfile(cwd);
  if (error) return { state: null, errors: [`${LOCKFILE_FILENAME}: ${error}`] };
  if (!lockfile) {
    return { state: null, errors: [`${LOCKFILE_FILENAME} not found — run \`launchrail init\` first.`] };
  }
  return { state: { manifest: parsed.manifest, lockfile, detection, cwd }, errors: [] };
}

/** The files each enabled module contributes at the current version, rendered for this project. */
export function moduleSpecs(state: ProjectState): Record<string, FileSpec[]> {
  const ctx = {
    projectName: state.detection.projectName,
    manifest: state.manifest,
    launchrailVersion: VERSION,
    cwd: state.cwd,
  };
  // Skills ship as managed files on every project (ADR-0019/0020) — not
  // module-gated, so they ship regardless of which modules are enabled. The
  // docs/agents configuration seeds with core, derived from the manifest.
  const modules: Record<string, FileSpec[]> = {
    core: [...seedFiles(ctx), ...agentsDocsFiles(state.manifest)],
    skills: skillFiles(),
  };
  if (state.manifest.modules[BROWSER_TESTING_MODULE]) {
    modules[BROWSER_TESTING_MODULE] = browserTestingFiles({ manifest: state.manifest, detection: state.detection });
  }
  if (state.manifest.modules[RALPH_MODULE]) {
    modules[RALPH_MODULE] = ralphFiles();
  }
  return modules;
}

/**
 * The full file surface Launchrail maintains for this configuration —
 * everything init/add would write today — minus paths the project has ejected.
 */
export function desiredSpecs(state: ProjectState): FileSpec[] {
  return Object.values(moduleSpecs(state))
    .flat()
    .filter((spec) => state.lockfile.files[spec.relPath]?.class !== "ejected");
}
