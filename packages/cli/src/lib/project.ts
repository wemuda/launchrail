import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_TESTING_MODULE, browserTestingFiles } from "./browser-testing.js";
import { detectRepo, type RepoDetection } from "./detect.js";
import { LOCKFILE_FILENAME, readLockfile, type Lockfile } from "./lockfile.js";
import { MANIFEST_FILENAME, parseManifest, type Manifest } from "./manifest.js";
import { seedFiles } from "./seeds.js";
import type { FileSpec } from "./writer.js";
import { VERSION } from "../version.js";

export interface ProjectState {
  manifest: Manifest;
  lockfile: Lockfile;
  detection: RepoDetection;
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
  return { state: { manifest: parsed.manifest, lockfile, detection }, errors: [] };
}

/** The files each enabled module contributes at the current version, rendered for this project. */
export function moduleSpecs(state: ProjectState): Record<string, FileSpec[]> {
  const ctx = {
    projectName: state.detection.projectName,
    manifest: state.manifest,
    launchrailVersion: VERSION,
  };
  const modules: Record<string, FileSpec[]> = { core: seedFiles(ctx) };
  if (state.manifest.modules[BROWSER_TESTING_MODULE]) {
    modules[BROWSER_TESTING_MODULE] = browserTestingFiles({ manifest: state.manifest, detection: state.detection });
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
