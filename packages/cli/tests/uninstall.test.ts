import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runEject } from "../src/commands/eject.js";
import { runInit } from "../src/commands/init.js";
import { runUninstall } from "../src/commands/uninstall.js";
import { sha256 } from "../src/lib/checksum.js";
import { CLAUDE_SETTINGS_PATH, ralphGuardHookState } from "../src/lib/claudeSettings.js";
import { DEV_PID_FILE, ensureStateDir, STACK_STATE_FILE } from "../src/lib/stack.js";
import { editLockfile, makeTmpDir, makeTmpRepo, type TmpRepo } from "./helpers.js";

let tmp: TmpRepo;
beforeEach(() => {
  tmp = makeTmpRepo();
});
afterEach(() => tmp.cleanup());

/** Every path under `root` (files and directories) except .git, relative and sorted. */
function tree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(dir, entry.name);
      out.push(relative(root, full));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return out.sort();
}

function uninstall(overrides: Partial<Parameters<typeof runUninstall>[0]> = {}) {
  return runUninstall({ cwd: tmp.root, dryRun: false, yes: true, ...overrides });
}

function write(relPath: string, content: string): void {
  mkdirSync(join(tmp.root, relPath, ".."), { recursive: true });
  writeFileSync(join(tmp.root, relPath), content);
}

function read(relPath: string): string {
  return readFileSync(join(tmp.root, relPath), "utf8");
}

describe("launchrail uninstall", () => {
  test("takes out everything init, add, and dev wrote — the repository is left as it was", async () => {
    write("src/app.ts", "export const app = 1;\n");
    write("docs/notes.md", "# Our notes\n");
    const before = tree(tmp.root);

    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    await runAdd({ cwd: tmp.root, module: "browser-testing", dryRun: false, yes: true });
    ensureStateDir(tmp.root);
    writeFileSync(join(tmp.root, STACK_STATE_FILE), "{}\n");
    expect(tree(tmp.root)).toContain(".claude/skills/launch/SKILL.md");

    const outcome = await uninstall();
    expect(outcome.code).toBe(0);
    expect(outcome.actions.filter((a) => a.kind === "keep")).toEqual([]);
    expect(tree(tmp.root)).toEqual(before);
    // The repository was already here before init, so it stays.
    expect(existsSync(join(tmp.root, ".git"))).toBe(true);
  });

  test("a folder init turned into a repository is restored completely, .git included", async () => {
    const plain = makeTmpDir();
    try {
      writeFileSync(join(plain.root, "notes.txt"), "mine\n");
      await runInit({ cwd: plain.root, dryRun: false, yes: true });
      expect(existsSync(join(plain.root, ".git"))).toBe(true);

      const outcome = await runUninstall({ cwd: plain.root, dryRun: false, yes: true });
      expect(outcome.code).toBe(0);
      expect(readdirSync(plain.root)).toEqual(["notes.txt"]);
    } finally {
      plain.cleanup();
    }
  });

  test("keeps the repository init created once something is committed to it", async () => {
    const plain = makeTmpDir();
    try {
      await runInit({ cwd: plain.root, dryRun: false, yes: true });
      const git = (args: string[]) => execFileSync("git", args, { cwd: plain.root, stdio: "ignore" });
      git(["add", "-A"]);
      git(["-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-qm", "chore: initialize launchrail"]);

      const outcome = await runUninstall({ cwd: plain.root, dryRun: false, yes: true });
      expect(outcome.code).toBe(0);
      expect(outcome.actions.find((a) => a.relPath === ".git")?.kind).toBe("keep");
      expect(existsSync(join(plain.root, ".git"))).toBe(true);
      expect(existsSync(join(plain.root, "AGENTS.md"))).toBe(false);
    } finally {
      plain.cleanup();
    }
  });

  test("dry run reports the plan and removes nothing", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const before = tree(tmp.root);
    const outcome = await uninstall({ dryRun: true, yes: false });
    expect(outcome.code).toBe(0);
    const planned = (relPath: string) => outcome.actions.find((a) => a.relPath === relPath)?.kind;
    expect(planned("AGENTS.md")).toBe("remove");
    expect(planned(".launchrail.yml")).toBe("remove");
    expect(planned(CLAUDE_SETTINGS_PATH)).toBe("remove");
    expect(outcome.actions.at(-1)?.relPath).toBe(".launchrail-lock.json");
    expect(tree(tmp.root)).toEqual(before);
  });

  test("refuses to remove anything without --yes in a non-interactive session", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const before = tree(tmp.root);
    const outcome = await uninstall({ yes: false });
    expect(outcome.code).toBe(1);
    expect(tree(tmp.root)).toEqual(before);
  });

  test("files edited since Launchrail wrote them are the project's and stay", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    const agents = read("AGENTS.md") + "\nOur own rule.\n";
    const skill = read(".claude/skills/launch/SKILL.md") + "\nLocal tweak.\n";
    write("AGENTS.md", agents);
    write(".claude/skills/launch/SKILL.md", skill);

    const outcome = await uninstall();
    expect(outcome.code).toBe(0);
    expect(outcome.actions.filter((a) => a.kind === "keep").map((a) => a.relPath)).toEqual([
      ".claude/skills/launch/SKILL.md",
      "AGENTS.md",
    ]);
    expect(read("AGENTS.md")).toBe(agents);
    expect(read(".claude/skills/launch/SKILL.md")).toBe(skill);
    expect(existsSync(join(tmp.root, ".claude/skills/launch/workflow.md"))).toBe(false);
    expect(existsSync(join(tmp.root, ".claude/skills/launch-grill"))).toBe(false);
    expect(existsSync(join(tmp.root, ".launchrail-lock.json"))).toBe(false);
  });

  test("an existing CLAUDE.md and settings.json get back exactly the bytes they had", async () => {
    const claude = "# Our Claude rules\n\nBe brief.\n";
    const settings = JSON.stringify({ permissions: { allow: ["Bash(pnpm test)"] } }, null, 2) + "\n";
    write("CLAUDE.md", claude);
    write(CLAUDE_SETTINGS_PATH, settings);
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    expect(read("CLAUDE.md")).toContain("@.launchrail/CLAUDE.generated.md");
    expect(ralphGuardHookState(tmp.root)).toBe("registered");

    const outcome = await uninstall();
    expect(outcome.code).toBe(0);
    expect(read("CLAUDE.md")).toBe(claude);
    expect(read(CLAUDE_SETTINGS_PATH)).toBe(settings);
  });

  test("an edited CLAUDE.md loses only the imports whose files are gone", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    write("CLAUDE.md", read("CLAUDE.md") + "\nOur instructions.\n");
    write("AGENTS.md", read("AGENTS.md") + "\nOur rule.\n");

    const outcome = await uninstall();
    expect(outcome.actions.find((a) => a.relPath === "CLAUDE.md")?.kind).toBe("update");
    const claude = read("CLAUDE.md");
    expect(claude.startsWith("@AGENTS.md\n")).toBe(true);
    expect(claude).not.toContain("@.launchrail/CLAUDE.generated.md");
    expect(claude).toContain("Our instructions.");
  });

  test("ejected files stay, and so does the registration of an ejected guard hook", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    runEject({ cwd: tmp.root, target: "ralph", all: false, dryRun: false });

    const outcome = await uninstall();
    expect(outcome.code).toBe(0);
    expect(existsSync(join(tmp.root, ".claude/workflows/ralph.js"))).toBe(true);
    expect(existsSync(join(tmp.root, ".claude/hooks/ralph-permission-guard.py"))).toBe(true);
    expect(ralphGuardHookState(tmp.root)).toBe("registered");
    expect(existsSync(join(tmp.root, ".launchrail.yml"))).toBe(false);
  });

  test("refuses while the background stack `dev` started is still running", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    ensureStateDir(tmp.root);
    // This test process stands in for the live stack.
    writeFileSync(join(tmp.root, DEV_PID_FILE), `${process.pid}\n`);
    const outcome = await uninstall();
    expect(outcome.code).toBe(1);
    expect(existsSync(join(tmp.root, "AGENTS.md"))).toBe(true);
  });

  test("never touches a path outside the project, whatever the lockfile says", async () => {
    const outside = makeTmpDir();
    try {
      await runInit({ cwd: tmp.root, dryRun: false, yes: true });
      writeFileSync(join(outside.root, "victim.txt"), "keep me\n");
      const escape = relative(tmp.root, join(outside.root, "victim.txt"));
      editLockfile(tmp.root, (lock) => {
        lock.files[escape] = { class: "managed", checksum: sha256("keep me\n") };
      });
      const outcome = await uninstall();
      expect(outcome.code).toBe(0);
      expect(outcome.actions.find((a) => a.relPath === escape)?.kind).toBe("keep");
      expect(readFileSync(join(outside.root, "victim.txt"), "utf8")).toBe("keep me\n");
    } finally {
      outside.cleanup();
    }
  });

  test("is idempotent, and a re-run finishes an interrupted uninstall", async () => {
    const before = tree(tmp.root);
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    // An earlier run that stopped part-way: the lockfile, which goes last, is still there.
    for (const relPath of [".launchrail.yml", "AGENTS.md", ".claude/settings.json"]) {
      rmSync(join(tmp.root, relPath));
    }
    expect((await uninstall()).code).toBe(0);
    expect(tree(tmp.root)).toEqual(before);

    const again = await uninstall();
    expect(again.code).toBe(0);
    expect(again.actions).toEqual([]);
  });

  test("a manifest without a lockfile is refused — there is no record of what Launchrail wrote", async () => {
    await runInit({ cwd: tmp.root, dryRun: false, yes: true });
    rmSync(join(tmp.root, ".launchrail-lock.json"));
    const outcome = await uninstall();
    expect(outcome.code).toBe(1);
    expect(existsSync(join(tmp.root, "AGENTS.md"))).toBe(true);
  });
});
