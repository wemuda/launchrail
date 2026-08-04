import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Lockfile } from "../src/lib/lockfile.js";

export interface TmpRepo {
  root: string;
  cleanup: () => void;
}

export function makeTmpDir(): TmpRepo {
  const root = mkdtempSync(join(tmpdir(), "launchrail-test-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function makeTmpRepo(): TmpRepo {
  const tmp = makeTmpDir();
  const git = (args: string[]): void => {
    execFileSync("git", args, { cwd: tmp.root, stdio: "ignore" });
  };
  git(["init", "-q", "-b", "master"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Launchrail Test"]);
  return tmp;
}

/** Edit the lockfile on disk — used to simulate repositories written by older toolchain versions. */
export function editLockfile(root: string, edit: (lockfile: Lockfile) => void): void {
  const path = join(root, ".launchrail-lock.json");
  const lockfile = JSON.parse(readFileSync(path, "utf8")) as Lockfile;
  edit(lockfile);
  writeFileSync(path, JSON.stringify(lockfile, null, 2) + "\n", "utf8");
}
