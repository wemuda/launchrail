import { describe, expect, test } from "vitest";
import { parseManifest, serializeManifest, type Manifest } from "../src/lib/manifest.js";

const manifest: Manifest = {
  schemaVersion: 1,
  mode: "standard-mvp",
  issueTracker: "github",
  conventions: { conventionalCommits: true },
  testing: { unitCommand: "pnpm test" },
  modules: { core: true },
};

describe("manifest", () => {
  test("serialize/parse roundtrip", () => {
    const parsed = parseManifest(serializeManifest(manifest));
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest).toEqual(manifest);
  });

  test("serialization is deterministic", () => {
    expect(serializeManifest(manifest)).toBe(serializeManifest({ ...manifest }));
  });

  test("rejects unknown mode", () => {
    const parsed = parseManifest("schemaVersion: 1\nmode: yolo\n");
    expect(parsed.manifest).toBeNull();
    expect(parsed.errors.join(" ")).toContain("mode must be one of");
  });

  test("rejects wrong schemaVersion", () => {
    const parsed = parseManifest("schemaVersion: 2\nmode: spike\n");
    expect(parsed.manifest).toBeNull();
    expect(parsed.errors.join(" ")).toContain("schemaVersion");
  });

  test("applies defaults for optional fields", () => {
    const parsed = parseManifest("schemaVersion: 1\nmode: spike\n");
    expect(parsed.manifest).toMatchObject({
      issueTracker: "none",
      conventions: { conventionalCommits: true },
      testing: { unitCommand: null },
      modules: { core: true },
    });
  });

  test("rejects invalid YAML", () => {
    const parsed = parseManifest("schemaVersion: [1\n");
    expect(parsed.manifest).toBeNull();
    expect(parsed.errors[0]).toContain("invalid YAML");
  });
});
