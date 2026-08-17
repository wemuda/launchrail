import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_TESTING_MODULE, SEMANTIC_SCRIPTS, SMOKE_JOURNEYS_PATH } from "../lib/browser-testing.js";
import { sha256 } from "../lib/checksum.js";
import { missingImports } from "../lib/claudeImports.js";
import {
  CLAUDE_SETTINGS_PATH,
  declarationState,
  ralphGuardHookState,
  RETIRED_PLUGIN_DECLARATIONS,
} from "../lib/claudeSettings.js";
import { detectRepo } from "../lib/detect.js";
import { readLockfile } from "../lib/lockfile.js";
import { pendingMigrations } from "../lib/migrations.js";
import { MANIFEST_FILENAME, parseManifest, type Manifest } from "../lib/manifest.js";
import { RALPH_GUARD_HOOK_PATH, RALPH_MODULE, RALPH_WORKFLOW_PATH } from "../lib/ralph.js";
import { skillNames } from "../lib/skills.js";

export type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  status: CheckStatus;
  name: string;
  message: string;
}

export interface DoctorOutcome {
  code: number;
  checks: DoctorCheck[];
}

export function runDoctor(cwd: string): DoctorOutcome {
  const checks: DoctorCheck[] = [];
  const add = (status: CheckStatus, name: string, message = ""): void => {
    checks.push({ status, name, message });
  };

  const detection = detectRepo(cwd);

  if (detection.isGitRepo) add("pass", "git repository");
  else add("warn", "git repository", "not a git repo — Launchrail relies on git history for safe writes");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 22) add("pass", "node version", `v${process.versions.node}`);
  else add("warn", "node version", `v${process.versions.node} — Launchrail targets Node >= 22`);

  if (detection.packageManager) add("pass", "package manager", detection.packageManager);
  else add("warn", "package manager", "none detected (no lockfile or packageManager field)");

  let manifest: Manifest | null = null;
  if (!existsSync(join(cwd, MANIFEST_FILENAME))) {
    add("fail", "manifest", `${MANIFEST_FILENAME} missing — run \`launchrail init\``);
  } else {
    const parsed = parseManifest(readFileSync(join(cwd, MANIFEST_FILENAME), "utf8"));
    if (parsed.manifest) {
      manifest = parsed.manifest;
      add("pass", "manifest", `valid (origin: ${parsed.manifest.origin})`);
    } else {
      add("fail", "manifest", `invalid: ${parsed.errors.join("; ")}`);
    }
  }

  const { lockfile, error: lockError } = readLockfile(cwd);
  if (lockError) {
    add("fail", "lockfile", lockError);
  } else if (!lockfile) {
    add("fail", "lockfile", "missing — run `launchrail init`");
  } else {
    add("pass", "lockfile", `${Object.keys(lockfile.files).length} tracked file(s)`);
    const managed = Object.entries(lockfile.files).filter(([, f]) => f.class === "managed");
    const drifted: string[] = [];
    let missing = 0;
    for (const [relPath, locked] of managed) {
      const abs = join(cwd, relPath);
      if (!existsSync(abs)) {
        add("fail", "managed file", `${relPath} is tracked but missing`);
        missing += 1;
      } else if (sha256(readFileSync(abs, "utf8")) !== locked.checksum) {
        drifted.push(relPath);
      }
    }
    if (drifted.length > 0) {
      add("warn", "managed drift", `${drifted.join(", ")} locally modified — sync will ask before replacing`);
    } else if (missing === 0 && managed.length > 0) {
      add("pass", "managed files", "match lockfile checksums");
    }
    const pending = pendingMigrations(lockfile);
    if (pending.length > 0) {
      add("warn", "migrations", `${pending.length} pending (${pending.map((m) => m.id).join(", ")}) — run \`launchrail sync\``);
    } else {
      add("pass", "migrations", "all applied");
    }
  }

  if (detection.hasAgentsMd) add("pass", "AGENTS.md");
  else add("fail", "AGENTS.md", "missing — run `launchrail init`");

  if (!detection.hasClaudeMd) {
    add("fail", "CLAUDE.md", "missing — run `launchrail init`");
  } else {
    const missing = missingImports(readFileSync(join(cwd, "CLAUDE.md"), "utf8"));
    if (missing.length === 0) {
      add("pass", "CLAUDE.md", "imports the shared contract and workflow instructions");
    } else {
      // The generated import is the silent one: without it Launchrail's managed
      // workflow instructions sit on disk that Claude never loads.
      const consequence = missing.includes("@.launchrail/CLAUDE.generated.md")
        ? "Launchrail's workflow instructions never reach Claude"
        : "Claude will not see the shared agent contract";
      add("warn", "CLAUDE.md", `does not import ${missing.join(", ")} — ${consequence}; re-run \`launchrail init\` to wire it in`);
    }
  }

  // Skills ship as managed files (ADR-0019/0020), not a plugin. Their exact
  // contents/checksums are covered by the managed-file checks above; here give a
  // single friendly signal that every expected skill directory is on disk.
  if (lockfile) {
    const missingSkills = skillNames().filter(
      (name) => !existsSync(join(cwd, ".claude", "skills", name, "SKILL.md")),
    );
    if (missingSkills.length === 0) {
      add("pass", "workflow skills", `${skillNames().length} in .claude/skills/`);
    } else {
      add(
        "fail",
        "workflow skills",
        `${missingSkills.length} missing (e.g. ${missingSkills.slice(0, 3).join(", ")}) — run \`launchrail sync\``,
      );
    }
    // The plugin was retired (ADR-0019); flag any retired declaration that lingers.
    if (declarationState(cwd, RETIRED_PLUGIN_DECLARATIONS) === "declared") {
      add(
        "warn",
        "plugin declaration",
        `${CLAUDE_SETTINGS_PATH} still declares the retired workflow plugins — run \`launchrail sync\` to remove them`,
      );
    }
  }

  if (manifest) {
    if (!manifest.modules[RALPH_MODULE]) {
      add(
        "warn",
        "implementation loop",
        "Ralph's materials are not installed — run `launchrail sync`",
      );
    } else {
      add("pass", "implementation loop", "Ralph — start with /launch-implement");
    }
  }

  if (manifest?.modules[BROWSER_TESTING_MODULE]) {
    if (detection.hasPlaywrightDep) {
      add("pass", "playwright dependency", "@playwright/test declared");
    } else {
      add("fail", "playwright dependency", "@playwright/test not declared — run `node scripts/setup.mjs`");
    }
    if (detection.playwrightConfigFile) {
      add("pass", "playwright config", detection.playwrightConfigFile);
    } else {
      add("fail", "playwright config", "no playwright.config.* found — re-run `launchrail add browser-testing`");
    }
    if (existsSync(join(cwd, SMOKE_JOURNEYS_PATH))) {
      add("pass", "smoke journeys", SMOKE_JOURNEYS_PATH);
    } else {
      add("warn", "smoke journeys", `${SMOKE_JOURNEYS_PATH} missing — smoke runs will have no defined journeys`);
    }
    const missingScripts = SEMANTIC_SCRIPTS.filter((name) => !existsSync(join(cwd, "scripts", `${name}.mjs`)));
    if (missingScripts.length === 0) {
      add("pass", "semantic scripts", "scripts/{setup,dev,verify,smoke,doctor}.mjs");
    } else {
      add("warn", "semantic scripts", `missing: ${missingScripts.map((name) => `scripts/${name}.mjs`).join(", ")}`);
    }
    if (manifest.testing.e2eCommand && manifest.testing.smokeCommand) {
      add("pass", "testing commands", "e2e and smoke commands configured");
    } else {
      add("warn", "testing commands", `set testing.e2eCommand and testing.smokeCommand in ${MANIFEST_FILENAME}`);
    }
  }

  if (manifest?.modules[RALPH_MODULE]) {
    if (existsSync(join(cwd, RALPH_WORKFLOW_PATH))) {
      add("pass", "ralph workflow", RALPH_WORKFLOW_PATH);
    } else {
      add("fail", "ralph workflow", `${RALPH_WORKFLOW_PATH} missing — run \`launchrail sync\` to restore it`);
    }
    // The unattended-launch guard (ADR-0021): the hook file is managed; its
    // registration in the shared settings.json is not lockfile-tracked, so this
    // is the only check that confirms it is actually wired in.
    if (!existsSync(join(cwd, RALPH_GUARD_HOOK_PATH))) {
      add("fail", "ralph guard", `${RALPH_GUARD_HOOK_PATH} missing — run \`launchrail sync\` to restore it`);
    } else {
      const guard = ralphGuardHookState(cwd);
      if (guard === "registered") {
        add("pass", "ralph guard", `unattended-launch guard registered in ${CLAUDE_SETTINGS_PATH}`);
      } else if (guard === "invalid-json") {
        add("warn", "ralph guard", `${CLAUDE_SETTINGS_PATH} is not valid JSON — cannot confirm the guard is registered`);
      } else {
        add(
          "warn",
          "ralph guard",
          `guard hook present but not registered in ${CLAUDE_SETTINGS_PATH} — run \`launchrail sync\``,
        );
      }
    }
    if (manifest.issueTracker !== "none") {
      add("pass", "ralph tracker", `issueTracker: ${manifest.issueTracker}`);
    } else {
      add("warn", "ralph tracker", `issueTracker is none — Ralph runs off tickets; set it in ${MANIFEST_FILENAME}`);
    }
    if (manifest.testing.unitCommand || manifest.testing.e2eCommand) {
      add("pass", "ralph verification gate", "testing commands configured");
    } else {
      add(
        "warn",
        "ralph verification gate",
        `no testing commands in ${MANIFEST_FILENAME} — \`verify\` fails on an empty contract and Ralph refuses to start`,
      );
    }
  }

  return { code: checks.some((c) => c.status === "fail") ? 1 : 0, checks };
}

const SYMBOL: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✗" };

export function printDoctor(outcome: DoctorOutcome): void {
  for (const check of outcome.checks) {
    console.log(`  ${SYMBOL[check.status]} ${check.name}${check.message ? ` — ${check.message}` : ""}`);
  }
  const failed = outcome.checks.filter((c) => c.status === "fail").length;
  const warned = outcome.checks.filter((c) => c.status === "warn").length;
  console.log(
    `\n${failed === 0 ? "Healthy" : "Unhealthy"}: ${outcome.checks.length} checks, ${failed} failed, ${warned} warning(s).`,
  );
  if (failed === 0) {
    console.log("Next: open Claude Code in this project and run /launch.");
  }
}
