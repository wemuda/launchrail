import { describe, expect, test } from "vitest";
// @ts-expect-error — build-time script, plain ESM without type declarations.
import { rewriteReadmeLinks } from "../scripts/rewrite-readme.mjs";

const DIRS = new Set(["docs/adr", "examples/hello-launchrail"]);
const opts = {
  repoUrl: "https://github.com/wemuda/launchrail",
  ref: "master",
  isDirectory: (path: string) => DIRS.has(path),
};

const rewrite = (markdown: string) => rewriteReadmeLinks(markdown, opts);

describe("rewriteReadmeLinks", () => {
  test("rewrites an HTML <img> logo to a raw content URL", () => {
    expect(rewrite('<img src="assets/logo.png" alt="Launchrail logo" width="200" />')).toBe(
      '<img src="https://github.com/wemuda/launchrail/raw/master/assets/logo.png" alt="Launchrail logo" width="200" />',
    );
  });

  test("rewrites a relative file link to a blob URL", () => {
    expect(rewrite("[Roadmap](ROADMAP.md)")).toBe(
      "[Roadmap](https://github.com/wemuda/launchrail/blob/master/ROADMAP.md)",
    );
  });

  test("rewrites a nested path file link to a blob URL", () => {
    expect(rewrite("[ADR-0006](docs/adr/0006-sync-engine.md)")).toBe(
      "[ADR-0006](https://github.com/wemuda/launchrail/blob/master/docs/adr/0006-sync-engine.md)",
    );
  });

  test("rewrites a directory link to a tree URL and preserves a trailing slash", () => {
    expect(rewrite("[ADRs](docs/adr/)")).toBe(
      "[ADRs](https://github.com/wemuda/launchrail/tree/master/docs/adr/)",
    );
    expect(rewrite("[example](examples/hello-launchrail)")).toBe(
      "[example](https://github.com/wemuda/launchrail/tree/master/examples/hello-launchrail)",
    );
  });

  test("rewrites the relative target of a badge link but leaves the badge image absolute", () => {
    const input =
      "[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)";
    expect(rewrite(input)).toBe(
      "[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/wemuda/launchrail/blob/master/LICENSE)",
    );
  });

  test("leaves absolute URLs and in-page anchors untouched", () => {
    const input =
      "[skills](https://github.com/mattpocock/skills) · [How it works](#how-it-works)";
    expect(rewrite(input)).toBe(input);
  });

  test("does not touch relative-looking text inside a code fence's diagram lines", () => {
    // The transform only recognizes link/image syntax, so mermaid/tree lines
    // without `](` or src/href attributes pass through verbatim.
    const input = 'S["MVP specification"] --> D["Design validation"]\n├── packages/';
    expect(rewrite(input)).toBe(input);
  });

  test("is idempotent — a second pass changes nothing", () => {
    const input = [
      '<img src="assets/logo.png" />',
      "[Roadmap](ROADMAP.md)",
      "[ADRs](docs/adr/)",
      "[skills](https://github.com/mattpocock/skills)",
    ].join("\n");
    const once = rewrite(input);
    expect(rewrite(once)).toBe(once);
  });
});
