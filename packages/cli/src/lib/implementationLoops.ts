import type { WorkflowPlugin } from "./claudeCli.js";

/**
 * The implementation loop is Launchrail's stage 10 — the engine that turns
 * ready tickets into verified, merged code (ADR-0016). Launchrail owns both
 * edges of that loop regardless of which engine runs between them:
 *
 *   - input:  tickets with the `ready-for-agent` label and `Blocked by: #n` edges
 *   - gate:   every merge passes `launchrail verify` (+ browser smoke when enabled)
 *
 * Which engine fills the middle is the project's choice, recorded in the
 * manifest's `implementationLoop`. `ralph` is the built-in default; `superpowers`
 * (obra/superpowers) is a selectable, experimental alternative that owns the
 * same slot with its own TDD/execution skills. This module is the single source
 * of truth for that closed set and each provider's routing metadata.
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
  /**
   * Not yet a first-class, deeply-wired provider: `init` records the choice and
   * offers install, and the conductor hands off with an honest note, but its
   * internal stage-10 skills are not pinned into managed routing (ADR-0016).
   */
  experimental: boolean;
  /** How the conductor's stage 10 hands off — an invokable skill or a short description. */
  entry: string;
  /**
   * The Claude Code plugin this loop needs installed when it lives outside the
   * launchrail plugin. `null` for `ralph`, whose skills ship in the launchrail
   * plugin and whose workflow file installs via `launchrail add ralph`.
   */
  plugin: WorkflowPlugin | null;
  /** Short line init/doctor/conductor print so the user knows how to run this loop. */
  setupHint: string;
}

export const IMPLEMENTATION_LOOP_PROVIDERS: Record<ImplementationLoop, ImplementationLoopProvider> = {
  ralph: {
    id: "ralph",
    label: "Ralph (built-in)",
    hint: "Launchrail's verification-gated loop",
    experimental: false,
    entry: "launchrail:ralph",
    plugin: null,
    setupHint: "Run `launchrail add ralph`, then start `launchrail:ralph` when the ready tickets exist.",
  },
  superpowers: {
    id: "superpowers",
    label: "Superpowers (experimental)",
    hint: "obra/superpowers' TDD/execution loop in place of Ralph",
    experimental: true,
    entry: "the Superpowers execution skills (brainstorming → writing-plans → TDD → code review)",
    // Best-effort install target; the exact marketplace/id may need adjusting as
    // obra/superpowers evolves. On failure, init falls back to printing manual
    // guidance (the same path shipped plugins use), so a wrong guess self-reports.
    plugin: {
      marketplace: "obra/superpowers",
      id: "superpowers@superpowers",
      label: "Superpowers",
    },
    setupHint:
      "Experimental: install obra/superpowers, then drive its execution skills on the ready tickets. `launchrail verify` still gates every merge.",
  },
};

export function implementationLoopProvider(loop: ImplementationLoop): ImplementationLoopProvider {
  return IMPLEMENTATION_LOOP_PROVIDERS[loop];
}
