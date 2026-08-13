import { describe, expect, test } from "vitest";
import { parseManifest, serializeManifest, setModuleEnabled, type Manifest } from "../src/lib/manifest.js";

const manifest: Manifest = {
  schemaVersion: 1,
  mode: "standard-mvp",
  origin: "new",
  issueTracker: "github",
  conventions: { conventionalCommits: true },
  testing: {
    unitCommand: "pnpm test",
    devCommand: "pnpm dev",
    e2eCommand: "npx playwright test",
    smokeCommand: "node scripts/smoke.mjs",
    appUrl: "http://localhost:3000",
  },
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

  test("rejects unknown origin", () => {
    const parsed = parseManifest("schemaVersion: 1\nmode: spike\norigin: legacy\n");
    expect(parsed.manifest).toBeNull();
    expect(parsed.errors.join(" ")).toContain("origin must be one of");
  });

  test("origin round-trips and defaults to new when absent (older manifests stay valid)", () => {
    const withOrigin = parseManifest("schemaVersion: 1\nmode: spike\norigin: existing\n");
    expect(withOrigin.errors).toEqual([]);
    expect(withOrigin.manifest?.origin).toBe("existing");
    const withoutOrigin = parseManifest("schemaVersion: 1\nmode: spike\n");
    expect(withoutOrigin.manifest?.origin).toBe("new");
  });

  test("applies defaults for optional fields", () => {
    const parsed = parseManifest("schemaVersion: 1\nmode: spike\n");
    expect(parsed.manifest).toMatchObject({
      origin: "new",
      issueTracker: "none",
      conventions: { conventionalCommits: true },
      testing: {
        unitCommand: null,
        devCommand: null,
        e2eCommand: null,
        smokeCommand: null,
        appUrl: null,
      },
      modules: { core: true },
    });
  });

  test("ignores the retired implementationLoop key — pre-ADR-0020 manifests stay valid", () => {
    const parsed = parseManifest("schemaVersion: 1\nmode: standard-mvp\nimplementationLoop: superpowers\n");
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest).not.toBeNull();
    expect("implementationLoop" in (parsed.manifest ?? {})).toBe(false);
  });

  test("accepts a manifest written before the testing fields existed", () => {
    const parsed = parseManifest(
      "schemaVersion: 1\nmode: standard-mvp\ntesting:\n  unitCommand: pnpm test\n",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest?.testing.unitCommand).toBe("pnpm test");
    expect(parsed.manifest?.testing.e2eCommand).toBeNull();
  });

  test("rejects invalid YAML", () => {
    const parsed = parseManifest("schemaVersion: [1\n");
    expect(parsed.manifest).toBeNull();
    expect(parsed.errors[0]).toContain("invalid YAML");
  });
});

describe("setModuleEnabled", () => {
  const source =
    "# my precious comment\nschemaVersion: 1\nmode: standard-mvp\ntesting:\n  unitCommand: pnpm test # keep this\nmodules:\n  core: true\n";

  test("enables the module and fills testing commands, preserving comments", () => {
    const result = setModuleEnabled(source, "browser-testing", {
      appUrl: "http://localhost:3000",
      e2eCommand: "npx playwright test",
    });
    expect(result.changed).toBe(true);
    expect(result.source).toContain("# my precious comment");
    expect(result.source).toContain("# keep this");
    const parsed = parseManifest(result.source);
    expect(parsed.manifest?.modules["browser-testing"]).toBe(true);
    expect(parsed.manifest?.testing.unitCommand).toBe("pnpm test");
    expect(parsed.manifest?.testing.appUrl).toBe("http://localhost:3000");
    expect(parsed.manifest?.testing.e2eCommand).toBe("npx playwright test");
  });

  test("is a no-op when everything already matches", () => {
    const first = setModuleEnabled(source, "browser-testing", { appUrl: "http://localhost:3000" });
    const second = setModuleEnabled(first.source, "browser-testing", { appUrl: "http://localhost:3000" });
    expect(second.changed).toBe(false);
    expect(second.source).toBe(first.source);
  });
});
