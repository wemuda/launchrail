import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdrIndex } from "../src/commands/adr.js";
import { runInit } from "../src/commands/init.js";
import {
  ADR_MAINTAINING_SECTION,
  adrDuplicates,
  adrIndexTable,
  adrRegistryContent,
  adrRelations,
  adrStatusCell,
  ADR_INDEX_END,
  ADR_INDEX_POINTER,
  ADR_INDEX_START,
  COMMITTED_INDEX_BULLETS,
  healCommittedIndexBullet,
  healRegistryMinting,
  PRE_DATE_SLUG_MAINTAINING_SECTION,
  PRINTED_INDEX_BULLET,
  scanAdrs,
  withoutCommittedIndex,
} from "../src/lib/adr.js";
import { makeTmpRepo, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpRepo();
  mkdirSync(join(tmp.root, "docs/adr"), { recursive: true });
});
afterEach(() => tmp.cleanup());

function record(file: string, title: string, status = "Accepted") {
  writeFileSync(join(tmp.root, "docs/adr", file), `# ${title}\n\n## Status\n${status}\n\n## Context\nBecause.\n`);
}

// Records are identified by decision date and slug (adr-date-slug-identifiers);
// the numbered records from before that scheme keep their names and their
// number as the handle. Both kinds live in one corpus.
describe("ADR scanning", () => {
  test("reads numbered and dated records into one timeline, template excluded", () => {
    writeFileSync(join(tmp.root, "docs/adr/0000-template.md"), "# Short decision title\n");
    writeFileSync(join(tmp.root, "docs/adr/README.md"), "# ADR registry\n");
    record("0002-event-bus.md", "ADR-0002: One event bus");
    record("2026-09-11-drop-redis.md", "Drop Redis", "Accepted — supersedes [0002](0002-event-bus.md)");
    record("0001-use-postgres.md", "Use Postgres", "");
    writeFileSync(join(tmp.root, "docs/adr/notes.md"), "# not a record\n");
    const entries = scanAdrs(tmp.root);
    expect(entries.map((e) => [e.id, e.date, e.title, e.status])).toEqual([
      ["0001", null, "Use Postgres", ""],
      ["0002", null, "One event bus", "Accepted"],
      ["drop-redis", "2026-09-11", "Drop Redis", "Accepted — supersedes [0002](0002-event-bus.md)"],
    ]);
  });

  test("a dated slug must be lowercase kebab-case to count as a record", () => {
    record("2026-09-11-Drop_Redis.md", "Nope");
    record("2026-09-11-drop-redis.md", "Yes");
    expect(scanAdrs(tmp.root).map((e) => e.file)).toEqual(["2026-09-11-drop-redis.md"]);
  });
});

describe("ADR relations and the generated index", () => {
  test("derives reverse links from forward declarations, so amending never edits the earlier record", () => {
    record("0001-use-postgres.md", "Use Postgres");
    record("2026-09-11-read-replicas.md", "Read replicas", "Accepted — amends [0001](0001-use-postgres.md): reads may hit a replica.");
    record("2026-09-12-drop-postgres.md", "Drop Postgres", "Proposed — supersedes [0001](0001-use-postgres.md); extends [read-replicas](2026-09-11-read-replicas.md)");
    const entries = scanAdrs(tmp.root);
    const graph = adrRelations(entries);
    expect(graph.get("0001-use-postgres.md")?.amends.map((e) => e.id)).toEqual(["read-replicas"]);
    expect(graph.get("0001-use-postgres.md")?.supersedes.map((e) => e.id)).toEqual(["drop-postgres"]);
    expect(graph.get("2026-09-11-read-replicas.md")?.extends.map((e) => e.id)).toEqual(["drop-postgres"]);
    const [postgres, replicas, drop] = entries;
    // 0001 still says plain "Accepted": the successor is only proposed, so the
    // cell reports it as partial rather than declaring the record superseded.
    expect(adrStatusCell(postgres!, entries)).toBe(
      "Accepted — partially superseded by [drop-postgres](docs/adr/2026-09-12-drop-postgres.md); amended by [read-replicas](docs/adr/2026-09-11-read-replicas.md)",
    );
    expect(adrStatusCell(replicas!, entries)).toBe(
      "Accepted; amends [0001](docs/adr/0001-use-postgres.md); extended by [drop-postgres](docs/adr/2026-09-12-drop-postgres.md)",
    );
    expect(adrStatusCell(drop!, entries)).toBe(
      "Proposed; supersedes [0001](docs/adr/0001-use-postgres.md); extends [read-replicas](docs/adr/2026-09-11-read-replicas.md)",
    );
  });

  test("reads legacy backward phrasing and ADR-NNNN mentions, and stops a clause at the sentence end", () => {
    record("0001-use-postgres.md", "Use Postgres", "Superseded by [ADR-0003](0003-use-mysql.md) — nothing survives.");
    record("0002-event-bus.md", "One event bus", "Accepted — extends ADR-0001 (the store). Landed alongside [ADR-0003](0003-use-mysql.md), unrelated.");
    record("0003-use-mysql.md", "Use MySQL", "Accepted (amends ADR-0002)");
    const entries = scanAdrs(tmp.root);
    const cells = entries.map((e) => adrStatusCell(e, entries));
    expect(cells[0]).toBe("**Superseded by [0003](docs/adr/0003-use-mysql.md)**; extended by [0002](docs/adr/0002-event-bus.md)");
    expect(cells[1]).toBe("Accepted; extends [0001](docs/adr/0001-use-postgres.md); amended by [0003](docs/adr/0003-use-mysql.md)");
    expect(cells[2]).toBe("Accepted; supersedes [0001](docs/adr/0001-use-postgres.md); amends [0002](docs/adr/0002-event-bus.md)");
  });

  test("a record without a status is Unclassified", () => {
    writeFileSync(join(tmp.root, "docs/adr/0001-use-postgres.md"), "# Use Postgres\n\nNo status section.\n");
    const entries = scanAdrs(tmp.root);
    expect(adrIndexTable(entries)).toContain("| [0001](docs/adr/0001-use-postgres.md) | — | Use Postgres | Unclassified |");
  });

});

// The index is printed, never committed (adr-index-is-printed-not-committed):
// a table an older version committed is replaced by a pointer, and only the
// marked rows — always Launchrail's — are ever touched.
describe("a committed index left behind", () => {
  const registry = (index: string) =>
    `# ADR registry\n\nDoctrine.\n\n## Index\n\n${index}\n\nRows marked **Unclassified** — our note.\n\n## The live picture\n\nOurs.\n`;

  test("the marked table is replaced by the pointer and every other line stays", () => {
    const committed = registry(`${ADR_INDEX_START}\n| ADR | Decided | Title | Status |\n| --- | --- | --- | --- |\n| [0001](0001-x.md) | — | X | Accepted |\n${ADR_INDEX_END}`);
    const next = withoutCommittedIndex(committed);
    expect(next).toBe(registry(ADR_INDEX_POINTER));
    expect(withoutCommittedIndex(next!)).toBeNull();
  });

  test("a hand-kept table without markers is the project's and is left alone", () => {
    expect(withoutCommittedIndex(registry("| ADR | Title |\n| --- | --- |\n| [0001](0001-x.md) | X |"))).toBeNull();
  });

  test("the seeded regenerate-and-commit bullets heal to the printed-index bullet; a project's own wording stays", () => {
    for (const bullet of COMMITTED_INDEX_BULLETS) {
      const healed = healCommittedIndexBullet(`## Maintaining this registry\n\n- First.\n${bullet}\n- Last.\n`);
      expect(healed).toBe(`## Maintaining this registry\n\n- First.\n${PRINTED_INDEX_BULLET}\n- Last.\n`);
      expect(healCommittedIndexBullet(healed!)).toBeNull();
    }
    expect(healCommittedIndexBullet("- The index table between the markers is **generated** — our own wording.\n")).toBeNull();
  });

  test("the seeded registry carries the pointer, not a table", () => {
    record("0001-use-postgres.md", "Use Postgres");
    const seed = adrRegistryContent(scanAdrs(tmp.root));
    expect(seed).toContain(`## Index\n\n${ADR_INDEX_POINTER}\n`);
    expect(seed).not.toContain("adr-index:start");
    expect(seed).not.toContain("| ADR |");
  });
});

// The pre-date-slug registry told agents to "take the next free number"; the
// managed-not-seeded-guidance ADR moves the authoritative rule to the managed
// surface, keeps a project-owned summary in the registry, and heals the seeded
// prose Launchrail wrote before the dated scheme.
describe("minting guidance", () => {
  const registryWith = (section: string) =>
    `# ADR registry\n\nIntro.\n\n## Index\n\n| ADR | Title | Status |\n| --- | --- | --- |\n| [0001](0001-x.md) | X | Accepted |\n\n## The live picture\n\nProject-owned prose.\n\n${section}\n`;

  test("the seeded registry teaches date-and-slug, defers to the managed contract, and never mints a number", () => {
    const seed = adrRegistryContent([]);
    expect(seed).toContain(ADR_MAINTAINING_SECTION);
    expect(seed).not.toContain("next free number");
    expect(seed).toContain("There is no sequence number to claim");
    expect(seed).toContain(".launchrail/CLAUDE.generated.md");
  });

  test("heals only the exact pre-date-slug section, preserving the index and live picture", () => {
    const stale = registryWith(PRE_DATE_SLUG_MAINTAINING_SECTION);
    const { state, next } = healRegistryMinting(stale);
    expect(state).toBe("healed");
    expect(next).toBe(registryWith(ADR_MAINTAINING_SECTION));
    expect(next).not.toContain("next free number");
    // The project's own sections are untouched — only the guidance changed.
    expect(next).toContain("| ADR | Title | Status |");
    expect(next).toContain("## The live picture\n\nProject-owned prose.");
  });

  test("a current registry is left alone; healing is idempotent", () => {
    const current = registryWith(ADR_MAINTAINING_SECTION);
    const first = healRegistryMinting(current);
    expect(first.state).toBe("current");
    expect(first.next).toBe(current);
    expect(healRegistryMinting(healRegistryMinting(registryWith(PRE_DATE_SLUG_MAINTAINING_SECTION)).next).state).toBe(
      "current",
    );
  });

  test("a project-edited section is reported modified and never rewritten", () => {
    const edited = registryWith(`${PRE_DATE_SLUG_MAINTAINING_SECTION}\n- Our own extra house rule.`);
    const { state, next } = healRegistryMinting(edited);
    expect(state).toBe("modified");
    expect(next).toBe(edited);
  });

  test("a registry without a Maintaining section is absent", () => {
    expect(healRegistryMinting("# ADR registry\n\nJust an index, no maintenance notes.\n").state).toBe("absent");
  });
});

describe("duplicate identifiers", () => {
  test("names every file that claims a shared id, across numbered and dated records", () => {
    record("0053-first.md", "First");
    record("0053-second.md", "Second");
    record("2026-09-10-solo.md", "Solo");
    expect(adrDuplicates(scanAdrs(tmp.root))).toEqual([{ id: "0053", files: ["0053-first.md", "0053-second.md"] }]);
  });
});

describe("launchrail adr index", () => {
  test("prints the index from the records and writes nothing", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    record("2026-09-11-drop-redis.md", "Drop Redis");
    record("2026-09-12-keep-sqlite.md", "Keep SQLite", "Accepted — amends [drop-redis](2026-09-11-drop-redis.md)");
    const before = gitStatus();
    const outcome = runAdrIndex({ cwd: tmp.root });
    expect(outcome).toMatchObject({ code: 0, records: 2 });
    expect(outcome.output).toContain(
      "| [drop-redis](docs/adr/2026-09-11-drop-redis.md) | 2026-09-11 | Drop Redis | Accepted; amended by [keep-sqlite](docs/adr/2026-09-12-keep-sqlite.md) |",
    );
    expect(outcome.output).not.toContain("Unclassified");
    expect(gitStatus()).toBe(before);
  });

  test("notes Unclassified rows, and says so when there are no records", () => {
    expect(runAdrIndex({ cwd: tmp.root })).toMatchObject({ code: 0, records: 0, output: "No decision records in docs/adr/ yet." });
    writeFileSync(join(tmp.root, "docs/adr/0001-use-postgres.md"), "# Use Postgres\n\nNo status section.\n");
    const outcome = runAdrIndex({ cwd: tmp.root });
    expect(outcome.output).toContain("| Unclassified |");
    expect(outcome.output).toContain("Rows marked **Unclassified**");
    expect(existsSync(join(tmp.root, "docs/adr/README.md"))).toBe(false);
  });
});

function gitStatus(): string {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: tmp.root, encoding: "utf8" });
}
