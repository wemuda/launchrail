import type { PluginDeclaration } from "./claudeSettings.js";

/**
 * The implementation loop is Launchrail's stage 10 — the engine that turns
 * ready tickets into verified, merged code (ADR-0017). Launchrail owns both
 * edges of that loop regardless of which engine runs between them:
 *
 *   - input:  tickets with the `ready-for-agent` label and `Blocked by: #n` edges
 *   - gate:   every merge passes `launchrail verify` (+ browser smoke when enabled)
 *
 * Which engine fills the middle is the project's choice, recorded in the
 * manifest's `implementationLoop`. `ralph` is the built-in default; `superpowers`
 * (obra/superpowers) is a fully-wired alternative that owns the same slot with
 * its own TDD/execution skills. This module is the single source of truth for
 * that closed set and each provider's routing and plugin metadata.
 */
export const IMPLEMENTATION_LOOPS = ["ralph", "superpowers"] as const;
export type ImplementationLoop = (typeof IMPLEMENTATION_LOOPS)[number];

export const DEFAULT_IMPLEMENTATION_LOOP: ImplementationLoop = "ralph";

export interface ImplementationLoopProvider {
  id: ImplementationLoop;
  /** Human-readable label for the wizard, init/doctor messages. */
  label: string;
  /** One-line hint shown beside the wizard option. */
  hint: string;
  /** How the conductor's stage 10 hands off — the concrete skill(s) it routes to. */
  entry: string;
  /**
   * The Claude Code plugin this loop needs, when it lives outside the launchrail
   * plugin. `null` for `ralph`, whose skills ship in the launchrail plugin and
   * whose workflow file init installs (`launchrail sync` brings older projects
   * current). When present, init installs and declares it alongside the core
   * roster and doctor checks it.
   */
  declaration: PluginDeclaration | null;
  /** Short line init/doctor/conductor print so the user knows how to run this loop. */
  setupHint: string;
}

export const IMPLEMENTATION_LOOP_PROVIDERS: Record<ImplementationLoop, ImplementationLoopProvider> = {
  ralph: {
    id: "ralph",
    label: "Ralph (built-in)",
    hint: "Launchrail's verification-gated loop",
    entry: "launchrail:ralph",
    declaration: null,
    setupHint: "Start building with /launchrail:implement when the ready tickets exist (add a ticket number to build just one).",
  },
  superpowers: {
    id: "superpowers",
    label: "Superpowers",
    hint: "obra/superpowers' TDD/execution loop in place of Ralph",
    entry:
      "superpowers:executing-plans + superpowers:test-driven-development, closing with superpowers:finishing-a-development-branch",
    declaration: {
      marketplace: "superpowers-dev",
      repo: "obra/superpowers",
      pluginKey: "superpowers@superpowers-dev",
      label: "Superpowers",
    },
    setupHint:
      "Start building with /launchrail:implement — it drives the ready tickets through Superpowers' execution skills. `launchrail verify` still gates every merge.",
  },
};

export function implementationLoopProvider(loop: ImplementationLoop): ImplementationLoopProvider {
  return IMPLEMENTATION_LOOP_PROVIDERS[loop];
}

/** The plugin declaration(s) a loop adds to the roster — empty for the built-in `ralph`. */
export function implementationLoopDeclarations(loop: ImplementationLoop): PluginDeclaration[] {
  const { declaration } = IMPLEMENTATION_LOOP_PROVIDERS[loop];
  return declaration ? [declaration] : [];
}
