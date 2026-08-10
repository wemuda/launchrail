// Generates packages/cli/README.md from the monorepo README so npm ships a
// real README for @wemuda/launchrail. npm resolves the README from the package
// directory, not the repo root, so without this the published package has none.
//
// Runs in `prepack`, i.e. right before `npm publish`/`npm pack` builds the
// tarball. The generated file is git-ignored: the repo README stays the single
// source of truth and this copy exists only inside the published package.

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteReadmeLinks } from "./rewrite-readme.mjs";

const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/scripts
const packageDir = resolve(here, ".."); // packages/cli
const repoRoot = resolve(here, "..", "..", ".."); // repo root

const sourceReadme = join(repoRoot, "README.md");
const targetReadme = join(packageDir, "README.md");

// The branch relative README links resolve against on GitHub (see CLAUDE.md).
const REF = "master";

function repoUrl() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const url = pkg.repository?.url ?? "https://github.com/wemuda/launchrail";
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

function isDirectory(path) {
  try {
    return statSync(join(repoRoot, path)).isDirectory();
  } catch {
    return false;
  }
}

const source = readFileSync(sourceReadme, "utf8");
const rewritten = rewriteReadmeLinks(source, { repoUrl: repoUrl(), ref: REF, isDirectory });
const banner = "<!-- Generated from the repository README by scripts/generate-readme.mjs; do not edit by hand. -->\n\n";

writeFileSync(targetReadme, banner + rewritten);
console.log(`Generated ${targetReadme} from ${sourceReadme}`);
