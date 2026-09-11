import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdrIndex } from "../src/commands/adr.js";
import { runInit } from "../src/commands/init.js";
import { runSync } from "../src/commands/sync.js";
import { adrIndexTable, adrRelations, adrStatusCell, scanAdrs, withRegeneratedIndex } from "../src/lib/adr.js";
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
      "Accepted — partially superseded by [drop-postgres](2026-09-12-drop-postgres.md); amended by [read-replicas](2026-09-11-read-replicas.md)",
    );
    expect(adrStatusCell(replicas!, entries)).toBe(
      "Accepted; amends [0001](0001-use-postgres.md); extended by [drop-postgres](2026-09-12-drop-postgres.md)",
    );
    expect(adrStatusCell(drop!, entries)).toBe(
      "Proposed; supersedes [0001](0001-use-postgres.md); extends [read-replicas](2026-09-11-read-replicas.md)",
    );
  });

  test("reads legacy backward phrasing and ADR-NNNN mentions, and stops a clause at the sentence end", () => {
    record("0001-use-postgres.md", "Use Postgres", "Superseded by [ADR-0003](0003-use-mysql.md) — nothing survives.");
    record("0002-event-bus.md", "One event bus", "Accepted — extends ADR-0001 (the store). Landed alongside [ADR-0003](0003-use-mysql.md), unrelated.");
    record("0003-use-mysql.md", "Use MySQL", "Accepted (amends ADR-0002)");
    const entries = scanAdrs(tmp.root);
    const cells = entries.map((e) => adrStatusCell(e, entries));
    expect(cells[0]).toBe("**Superseded by [0003](0003-use-mysql.md)**; extended by [0002](0002-event-bus.md)");
    expect(cells[1]).toBe("Accepted; extends [0001](0001-use-postgres.md); amended by [0003](0003-use-mysql.md)");
    expect(cells[2]).toBe("Accepted; supersedes [0001](0001-use-postgres.md); amends [0002](0002-event-bus.md)");
  });

  test("a record without a status is Unclassified", () => {
    writeFileSync(join(tmp.root, "docs/adr/0001-use-postgres.md"), "# Use Postgres\n\nNo status section.\n");
    const entries = scanAdrs(tmp.root);
    expect(adrIndexTable(entries)).toContain("| [0001](0001-use-postgres.md) | — | Use Postgres | Unclassified |");
  });

  test("regenerates between the markers and leaves everything else alone", () => {
    record("0001-use-postgres.md", "Use Postgres");
    const entries = scanAdrs(tmp.root);
    const registry = `# ADR registry\n\nDoctrine.\n\n## Index\n\n${adrIndexTable([])}\n\n## The live picture\n\nOurs.\n`;
    const next = withRegeneratedIndex(registry, entries);
    expect(next).toContain("Doctrine.\n\n## Index\n\n<!-- adr-index:start");
    expect(next).toContain("| [0001](0001-use-postgres.md) | — | Use Postgres | Accepted |\n<!-- adr-index:end -->\n\n## The live picture\n\nOurs.\n");
    // Idempotent.
    expect(withRegeneratedIndex(next!, entries)).toBe(next);
  });

  test("migrates a registry written before the markers: the table under ## Index is replaced", () => {
    record("0001-use-postgres.md", "Use Postgres");
    record("2026-09-11-drop-redis.md", "Drop Redis");
    const entries = scanAdrs(tmp.root);
    const registry =
      "# ADR registry\n\n## Index\n\n| ADR | Title | Status |\n| --- | --- | --- |\n| [0001](0001-use-postgres.md) | Use Postgres | Accepted |\n\n## The live picture\n\nOurs.\n";
    const next = withRegeneratedIndex(registry, entries)!;
    expect(next).toContain("## Index\n\n<!-- adr-index:start");
    expect(next).not.toContain("| ADR | Title | Status |");
    expect(next).toContain("| [drop-redis](2026-09-11-drop-redis.md) | 2026-09-11 | Drop Redis | Accepted |");
    expect(next).toContain("<!-- adr-index:end -->\n\n## The live picture\n\nOurs.\n");
  });

  test("a registry in the project's own format, without an index, is left alone", () => {
    record("0001-use-postgres.md", "Use Postgres");
    expect(withRegeneratedIndex("# Our decisions\n\nProse only.\n", scanAdrs(tmp.root))).toBeNull();
  });
});

describe("launchrail adr index", () => {
  test("writes the seeded registry's table, reports current on a second run, and --check never writes", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    record("2026-09-11-drop-redis.md", "Drop Redis");
    expect(runAdrIndex({ cwd: tmp.root, check: true }).result).toBe("stale");
    expect(readFileSync(join(tmp.root, "docs/adr/README.md"), "utf8")).not.toContain("drop-redis");
    expect(runAdrIndex({ cwd: tmp.root, check: false })).toMatchObject({ code: 0, result: "updated", records: 1 });
    const registry = readFileSync(join(tmp.root, "docs/adr/README.md"), "utf8");
    expect(registry).toContain("| [drop-redis](2026-09-11-drop-redis.md) | 2026-09-11 | Drop Redis | Accepted |");
    expect(registry).toContain("## The live picture");
    expect(runAdrIndex({ cwd: tmp.root, check: true })).toMatchObject({ code: 0, result: "current" });
    // The registry is seeded: the regenerated table is the project's, and sync leaves it be.
    const outcome = runSync({ cwd: tmp.root, dryRun: false });
    expect(outcome.actions.find((a) => a.spec.relPath === "docs/adr/README.md")?.kind).toBe("skip-seeded-exists");
    expect(readFileSync(join(tmp.root, "docs/adr/README.md"), "utf8")).toBe(registry);
  });

  test("fails clearly without a registry or without an index section", () => {
    record("0001-use-postgres.md", "Use Postgres");
    expect(runAdrIndex({ cwd: tmp.root, check: false })).toMatchObject({ code: 1, result: "missing" });
    writeFileSync(join(tmp.root, "docs/adr/README.md"), "# Our decisions\n");
    expect(runAdrIndex({ cwd: tmp.root, check: false })).toMatchObject({ code: 1, result: "missing" });
  });
});
