import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { scanUpstreamReferences, type UpstreamRename } from "../src/lib/upstream.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

const RENAMES: UpstreamRename[] = [
  { from: "old-grill-skill", to: "grill-with-docs", note: "renamed upstream in 2026" },
];

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => tmp.cleanup());

describe("upstream rename scanning", () => {
  test("an empty registry yields no advisories", () => {
    writeFileSync(join(tmp.root, "AGENTS.md"), "Run old-grill-skill often.\n");
    expect(scanUpstreamReferences(tmp.root, [])).toEqual([]);
  });

  test("finds whole-word references in agent contract files", () => {
    writeFileSync(join(tmp.root, "AGENTS.md"), "Use the old-grill-skill for complexity checks.\n");
    const advisories = scanUpstreamReferences(tmp.root, RENAMES);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]?.relPath).toBe("AGENTS.md");
    expect(advisories[0]?.rename.to).toBe("grill-with-docs");
  });

  test("hyphenated supersets do not match", () => {
    writeFileSync(join(tmp.root, "AGENTS.md"), "Use not-old-grill-skill-extended instead.\n");
    expect(scanUpstreamReferences(tmp.root, RENAMES)).toEqual([]);
  });

  test("scans Matt Pocock's docs/agents output", () => {
    mkdirSync(join(tmp.root, "docs", "agents"), { recursive: true });
    writeFileSync(join(tmp.root, "docs", "agents", "workflow.md"), "old-grill-skill goes here\n");
    const advisories = scanUpstreamReferences(tmp.root, RENAMES);
    expect(advisories.map((a) => a.relPath)).toEqual(["docs/agents/workflow.md"]);
  });

  test("files without stale references stay quiet", () => {
    writeFileSync(join(tmp.root, "AGENTS.md"), "Everything already uses grill-with-docs.\n");
    expect(scanUpstreamReferences(tmp.root, RENAMES)).toEqual([]);
  });
});
