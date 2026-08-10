import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  applyClaudeImports,
  importsPath,
  missingImports,
  planClaudeImports,
  REQUIRED_CLAUDE_IMPORTS,
} from "../src/lib/claudeImports.js";
import { makeTmpDir, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => tmp.cleanup());

function writeClaude(content: string): void {
  writeFileSync(join(tmp.root, "CLAUDE.md"), content);
}

describe("importsPath / missingImports", () => {
  test("matches an import only on a line of its own, not in prose", () => {
    expect(importsPath("@AGENTS.md\n", "@AGENTS.md")).toBe(true);
    expect(importsPath("  @AGENTS.md  \n", "@AGENTS.md")).toBe(true);
    expect(importsPath("see @AGENTS.md for the contract\n", "@AGENTS.md")).toBe(false);
  });

  test("reports missing imports in canonical order (contract first)", () => {
    expect(missingImports("# nothing here\n")).toEqual([
      "@AGENTS.md",
      "@.launchrail/CLAUDE.generated.md",
    ]);
    expect(missingImports("@AGENTS.md\n")).toEqual(["@.launchrail/CLAUDE.generated.md"]);
    expect(missingImports(REQUIRED_CLAUDE_IMPORTS.join("\n"))).toEqual([]);
  });
});

describe("planClaudeImports", () => {
  test("no CLAUDE.md yet → seed (init's writer creates it)", () => {
    const plan = planClaudeImports(tmp.root);
    expect(plan.kind).toBe("seed");
    expect(plan.content).toBeNull();
    expect(plan.added).toEqual([]);
  });

  test("both imports already present → ok (idempotent no-op)", () => {
    writeClaude("@AGENTS.md\n@.launchrail/CLAUDE.generated.md\n\n# mine\n");
    const plan = planClaudeImports(tmp.root);
    expect(plan.kind).toBe("ok");
    expect(plan.content).toBeNull();
  });

  test("prose-only file → merge prepends both imports and preserves content", () => {
    writeClaude("# My existing Claude instructions\n\nDo the thing.\n");
    const plan = planClaudeImports(tmp.root);
    expect(plan.kind).toBe("merge");
    expect(plan.added).toEqual(["@AGENTS.md", "@.launchrail/CLAUDE.generated.md"]);
    expect(plan.content).toBe(
      "@AGENTS.md\n@.launchrail/CLAUDE.generated.md\n\n# My existing Claude instructions\n\nDo the thing.\n",
    );
  });

  test("one import present → merge adds only the missing one, contiguous with the existing import block", () => {
    writeClaude("@AGENTS.md\n\n# mine\n");
    const plan = planClaudeImports(tmp.root);
    expect(plan.kind).toBe("merge");
    expect(plan.added).toEqual(["@.launchrail/CLAUDE.generated.md"]);
    // File already opens with an @-import, so the new line butts directly against it.
    expect(plan.content).toBe("@.launchrail/CLAUDE.generated.md\n@AGENTS.md\n\n# mine\n");
  });
});

describe("applyClaudeImports", () => {
  test("writes the merged content and reports it wrote", () => {
    writeClaude("# mine\n");
    const wrote = applyClaudeImports(tmp.root, planClaudeImports(tmp.root));
    expect(wrote).toBe(true);
    const after = readFileSync(join(tmp.root, "CLAUDE.md"), "utf8");
    expect(missingImports(after)).toEqual([]);
    expect(after).toContain("# mine");
  });

  test("is a no-op for a plan with no content", () => {
    writeClaude("@AGENTS.md\n@.launchrail/CLAUDE.generated.md\n");
    const before = readFileSync(join(tmp.root, "CLAUDE.md"), "utf8");
    expect(applyClaudeImports(tmp.root, planClaudeImports(tmp.root))).toBe(false);
    expect(readFileSync(join(tmp.root, "CLAUDE.md"), "utf8")).toBe(before);
  });
});
