import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LOCKFILE_FILENAME = ".launchrail-lock.json";

export type OwnershipClass = "managed" | "seeded";

export interface LockedFile {
  class: OwnershipClass;
  checksum: string;
}

export interface Lockfile {
  schemaVersion: 1;
  launchrailVersion: string;
  files: Record<string, LockedFile>;
  migrations: string[];
  decisions: Record<string, string | number | boolean | null>;
}

export function emptyLockfile(launchrailVersion: string): Lockfile {
  return {
    schemaVersion: 1,
    launchrailVersion,
    files: {},
    migrations: [],
    decisions: {},
  };
}

export interface LockfileReadResult {
  lockfile: Lockfile | null;
  error: string | null;
}

export function readLockfile(root: string): LockfileReadResult {
  const path = join(root, LOCKFILE_FILENAME);
  if (!existsSync(path)) return { lockfile: null, error: null };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { lockfile: null, error: `unreadable JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof data !== "object" || data === null || (data as { schemaVersion?: unknown }).schemaVersion !== 1) {
    return { lockfile: null, error: "unsupported lockfile schema" };
  }
  const raw = data as Partial<Lockfile>;
  return {
    lockfile: {
      schemaVersion: 1,
      launchrailVersion: typeof raw.launchrailVersion === "string" ? raw.launchrailVersion : "0.0.0",
      files: raw.files ?? {},
      migrations: raw.migrations ?? [],
      decisions: raw.decisions ?? {},
    },
    error: null,
  };
}

export function writeLockfile(root: string, lockfile: Lockfile): void {
  const sortedFiles = Object.fromEntries(
    Object.entries(lockfile.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  const content = JSON.stringify({ ...lockfile, files: sortedFiles }, null, 2) + "\n";
  writeFileSync(join(root, LOCKFILE_FILENAME), content, "utf8");
}
