import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "./checksum.js";
import type { Lockfile, OwnershipClass } from "./lockfile.js";

export interface FileSpec {
  relPath: string;
  content: string;
  ownership: OwnershipClass;
  /** Mark scripts executable after writing (no-op on Windows). */
  executable?: boolean;
}

export type ActionKind =
  | "create"
  | "update"
  | "skip-unchanged"
  | "skip-seeded-exists"
  | "skip-ejected"
  | "conflict";

export interface PlannedAction {
  spec: FileSpec;
  kind: ActionKind;
  detail: string;
}

export const ACTION_LABEL: Record<ActionKind, string> = {
  create: "create  ",
  update: "update  ",
  "skip-unchanged": "ok      ",
  "skip-seeded-exists": "keep    ",
  "skip-ejected": "ejected ",
  conflict: "conflict",
};

/**
 * Decide what would happen for each desired file without touching disk.
 *
 * - ejected paths are never touched again, not even to recreate them
 * - seeded files are never overwritten once they exist
 * - managed files are only replaced when their on-disk checksum matches the
 *   lockfile (i.e. nobody edited them since Launchrail last wrote them)
 */
export function planWrites(root: string, specs: FileSpec[], lockfile: Lockfile): PlannedAction[] {
  return specs.map((spec) => {
    const abs = join(root, spec.relPath);
    if (lockfile.files[spec.relPath]?.class === "ejected") {
      return { spec, kind: "skip-ejected" as const, detail: "ejected — Launchrail no longer manages this path" };
    }
    if (!existsSync(abs)) {
      return { spec, kind: "create" as const, detail: "new file" };
    }
    const current = readFileSync(abs, "utf8");
    if (current === spec.content) {
      return { spec, kind: "skip-unchanged" as const, detail: "already up to date" };
    }
    if (spec.ownership === "seeded") {
      return { spec, kind: "skip-seeded-exists" as const, detail: "exists — seeded files are never overwritten" };
    }
    const locked = lockfile.files[spec.relPath];
    if (locked && sha256(current) === locked.checksum) {
      return { spec, kind: "update" as const, detail: "managed file, unmodified since last write" };
    }
    return { spec, kind: "conflict" as const, detail: "managed file has local modifications — not overwriting" };
  });
}

/** Execute a plan. Mutates `lockfile.files` to reflect what is now on disk. */
export function applyPlan(root: string, actions: PlannedAction[], lockfile: Lockfile): string[] {
  const written: string[] = [];
  for (const action of actions) {
    const { spec, kind } = action;
    if (kind === "create" || kind === "update") {
      const abs = join(root, spec.relPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, spec.content, "utf8");
      if (spec.executable && process.platform !== "win32") chmodSync(abs, 0o755);
      written.push(spec.relPath);
    }
    if (kind === "create" || kind === "update" || kind === "skip-unchanged") {
      lockfile.files[spec.relPath] = { class: spec.ownership, checksum: sha256(spec.content) };
    }
  }
  return written;
}
