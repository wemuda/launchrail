import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { skillFiles, skillNames } from "../src/lib/skills.js";

// The harness in every consuming repo parses each SKILL.md's YAML frontmatter;
// one unquoted `foo: bar` inside a description breaks that skill silently
// everywhere sync ships it, so the assets are validated at the source.

const SKILL_MD = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/;

/** Skill directory name → parsed frontmatter of its SKILL.md. */
function parsedSkills(): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const spec of skillFiles()) {
    const match = SKILL_MD.exec(spec.relPath);
    if (!match) continue;
    const fm = /^---\n([\s\S]+?)\n---\n/.exec(spec.content);
    if (!fm) throw new Error(`${spec.relPath}: missing YAML frontmatter`);
    let data: unknown;
    try {
      data = parse(fm[1]!);
    } catch (err) {
      throw new Error(`${spec.relPath}: frontmatter is not valid YAML — ${(err as Error).message}`);
    }
    if (typeof data !== "object" || data === null) {
      throw new Error(`${spec.relPath}: frontmatter is not a YAML mapping`);
    }
    out.set(match[1]!, data as Record<string, unknown>);
  }
  return out;
}

describe("shipped skill frontmatter", () => {
  const skills = parsedSkills();

  test("every skill directory ships a SKILL.md with parseable frontmatter", () => {
    expect([...skills.keys()].sort()).toEqual(skillNames());
  });

  test("name matches the directory and the description is real", () => {
    for (const [dir, fm] of skills) {
      expect(fm.name, `${dir}: frontmatter name`).toBe(dir);
      expect(typeof fm.description, `${dir}: description type`).toBe("string");
      expect((fm.description as string).length, `${dir}: description length`).toBeGreaterThan(20);
    }
  });

  test("exactly the user-typed stages disable model invocation", () => {
    // The † contract in workflow.md: these four are started only by the user;
    // every other skill must stay reachable via the Skill tool.
    const userTyped = [...skills]
      .filter(([, fm]) => fm["disable-model-invocation"] === true)
      .map(([dir]) => dir)
      .sort();
    expect(userTyped).toEqual(["launch-implement", "launch-spec", "launch-tickets", "launch-wayfinder"]);
  });
});
