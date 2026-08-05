import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_TESTING_MODULE, SEMANTIC_SCRIPTS, SMOKE_JOURNEYS_PATH } from "../lib/browser-testing.js";
import { sha256 } from "../lib/checksum.js";
import { listInstalledPluginIds, WORKFLOW_PLUGINS } from "../lib/claudeCli.js";
import { CLAUDE_SETTINGS_PATH, declarationState } from "../lib/claudeSettings.js";
import { detectRepo } from "../lib/detect.js";
import { readLockfile } from "../lib/lockfile.js";
import { pendingMigrations } from "../lib/migrations.js";
import { MANIFEST_FILENAME, parseManifest, type Manifest } from "../lib/manifest.js";
import { RALPH_MODULE, RALPH_WORKFLOW_PATH } from "../lib/ralph.js";

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
      add("pass", "manifest", `valid (mode: ${parsed.manifest.mode})`);
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
  } else if (readFileSync(join(cwd, "CLAUDE.md"), "utf8").includes("@AGENTS.md")) {
    add("pass", "CLAUDE.md", "imports @AGENTS.md");
  } else {
    add("warn", "CLAUDE.md", "does not import @AGENTS.md — Claude will not see the shared agent contract");
  }

  if (detection.hasMattPocockSetup) add("pass", "Matt Pocock setup", "docs/agents/ present");
  else add("warn", "Matt Pocock setup", "docs/agents/ not found — run /setup-matt-pocock-skills in Claude Code (init preinstalls the skills plugin)");

  const declaration = declarationState(cwd);
  if (declaration === "declared") {
    add("pass", "plugin declaration", `${CLAUDE_SETTINGS_PATH} declares the workflow plugins`);
  } else if (declaration === "invalid-json") {
    add("warn", "plugin declaration", `${CLAUDE_SETTINGS_PATH} is not valid JSON`);
  } else {
    add("warn", "plugin declaration", `Launchrail plugin not declared in ${CLAUDE_SETTINGS_PATH} — run \`launchrail init\``);
  }

  const installed = listInstalledPluginIds(cwd);
  if (installed.state === "ok") {
    const missing = WORKFLOW_PLUGINS.filter((wp) => !installed.ids.includes(wp.id));
    if (missing.length === 0) {
      add("pass", "plugin install", `${WORKFLOW_PLUGINS.map((wp) => wp.id).join(", ")} installed in Claude Code`);
    } else {
      add(
        "warn",
        "plugin install",
        `missing: ${missing
          .map((wp) => `${wp.id} (\`claude plugin marketplace add ${wp.marketplace} && claude plugin install ${wp.id}\`)`)
          .join(", ")}`,
      );
    }
  } else if (installed.state === "no-cli") {
    add(
      "warn",
      "plugin install",
      "claude CLI not found — cannot verify; Claude Code offers the declared plugin when the folder is first trusted",
    );
  } else {
    add("warn", "plugin install", "could not read `claude plugin list --json`");
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
      add("fail", "ralph workflow", `${RALPH_WORKFLOW_PATH} missing — re-run \`launchrail add ralph\``);
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
    console.log("Next: open Claude Code in this project and run /launchrail:launch.");
  }
}
