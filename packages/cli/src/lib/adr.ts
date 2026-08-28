import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ADR_DIR = "docs/adr";
export const ADR_TEMPLATE_FILENAME = "0000-template.md";
export const ADR_REGISTRY_PATH = `${ADR_DIR}/README.md`;

export interface AdrEntry {
  /** Four-digit number parsed from the filename — ambiguous when two files share it. */
  number: string;
  /** Filename inside docs/adr/. */
  file: string;
  /** First `# ` heading (any `ADR-NNNN:` prefix stripped); the filename when there is none. */
  title: string;
}

const ADR_FILENAME = /^(\d{4})-.+\.md$/;
const TITLE_PREFIX = /^ADR[-\s]?\d+\s*[:—–-]\s*/i;

function adrTitle(abs: string, file: string): string {
  try {
    const heading = /^#\s+(.+)$/m.exec(readFileSync(abs, "utf8"))?.[1];
    if (heading) return heading.replace(TITLE_PREFIX, "").trim();
  } catch {
    // Unreadable file — fall through to the filename.
  }
  return file.replace(/\.md$/, "");
}

/**
 * The decision records already in a repository's docs/adr/ (template and
 * registry excluded), sorted by number then filename. Read-only.
 */
export function scanAdrs(cwd: string): AdrEntry[] {
  const dir = join(cwd, ADR_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file !== ADR_TEMPLATE_FILENAME && ADR_FILENAME.test(file))
    .sort()
    .map((file) => ({
      // The filter above guarantees the four leading digits.
      number: file.slice(0, 4),
      file,
      title: adrTitle(join(dir, file), file),
    }));
}

/** Numbers claimed by more than one record — every reference by number is ambiguous. */
export function duplicateAdrNumbers(entries: AdrEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.number, (counts.get(entry.number) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([number]) => number);
}

/** Records whose filename never appears in the registry — rows the index is missing. */
export function unindexedAdrs(registrySource: string, entries: AdrEntry[]): AdrEntry[] {
  return entries.filter((entry) => !registrySource.includes(entry.file));
}

/**
 * The seeded ADR registry. When init/sync adopts a repository that already has
 * decision records, the index prefills from them (status Unclassified — only
 * the project can know which decisions still stand); a fresh repository gets
 * the empty index. Seeded once, then project-owned: the project maintains it.
 */
export function adrRegistryContent(entries: AdrEntry[]): string {
  const header = "| ADR | Title | Status |\n| --- | --- | --- |";
  const rows = entries.map((e) => `| [${e.number}](${e.file}) | ${e.title} | Unclassified |`).join("\n");
  const index = entries.length === 0 ? header : `${header}\n${rows}`;
  const unclassifiedNote =
    entries.length === 0
      ? ""
      : "\n\nRows marked **Unclassified** existed before this registry was seeded. Classify each as you next touch its area: set the record's status (`Accepted`, `Accepted — amended by ADR-NNNN`, `Superseded by ADR-NNNN`) and mirror it here.";
  const livePicture =
    entries.length === 0
      ? "_No decisions recorded yet. When ADRs land, summarize here how they compose into the current system, and name the few a newcomer should read first._"
      : "_Not yet written. Summarize how the accepted decisions compose into the current system, and name the few ADRs a newcomer should read first._";

  return `# ADR registry

The index of every architecture decision record in this repository. Read this first, then open only the ADRs that touch the area you are working in — the index is the cheap surface; the records are depth.

An ADR records a decision and the context it was made in. It is **not documentation of the current system**: never treat an ADR as evidence that a component exists or still works as described — the code is the source of truth for what exists today.

## Index

${index}${unclassifiedNote}

## The live picture

How the accepted decisions compose into the current system. This section describes the present — rewrite it freely as the system grows; the ADRs behind it are history and stay untouched.

${livePicture}

## Maintaining this registry

- New ADRs copy [0000-template.md](0000-template.md), take the next free number (\`NNNN-short-slug.md\` — check both this index and the files on disk), and add their row here **in the same commit**. The shared row turns two branches minting the same number into a visible merge conflict instead of a silent collision.
- When a new ADR supersedes or amends an earlier one — including reversing part of the earlier one's context — update the earlier ADR's \`## Status\` line and its row here in the same commit.
- Never delete or renumber an ADR once it is referenced; superseded ADRs are historical records other documents link to.
`;
}
