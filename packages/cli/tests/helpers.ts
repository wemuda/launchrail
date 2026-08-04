import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
