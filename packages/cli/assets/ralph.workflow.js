// Managed by Launchrail. Do not hand-edit — `launchrail sync` may replace this file.
// Override policy per run via args instead, e.g. { width: 1, only: [9, 10], max: 5 }.
//
// The Ralph loop as a deterministic workflow: the plan, the frontier bookkeeping,
// and every intermediate report live in script variables — not in any context window —
// so long or wide runs cannot compact away their own state. This is the engine for
// every multi-ticket run (ADR-0022); the launch-ralph skill carries the same policy
// block as the supervisor's contract and the declared-exception watchable mode, and
// a policy change belongs in both places (ADR-0005, field-revised by ADR-0010,
// ADR-0022, and ADR-0032).
//
// The lean shape (ADR-0032): builders push their branch from the first commit on, so
// a lost container costs minutes, not a build; each finished branch is landed by the
// loop itself — a local squash-merge onto the integration base gated by the FAST
// verification tier, in this checkout, one land at a time — and pushed; the FULL
// gate runs at checkpoints (every N lands) and at release, with one bounded repair
// when a checkpoint is red. No per-ticket PR, no cloud-CI wait anywhere in the loop:
// cloud CI runs once, on the release PR the run offers. A work pool keeps `width`
// builders busy continuously — a slow ticket never holds a round.
export const meta = {
  name: 'ralph',
  description: 'Autonomous Ralph loop: implement ready tickets with fresh-context subagents, verification-gated',
  whenToUse:
    'The engine for any multi-ticket Ralph run. Scope a run via args: { only: [9, 10], width: 2 }, just [9, 10], or { max: 5 } to stop after 5 verified lands ("the next five" — the frontier picks which, in dependency order). The front door consolidates by DEFAULT (ADR-0026): it passes { target: "spec/44-mvp" } to collect the campaign onto that branch (default branch untouched; released later by one offered PR). In a session pinned to a designated working branch (hosted sessions), the front door passes that branch as the target (ADR-0028). Omitting target is the explicit trunk opt-in — each ticket landed straight onto the default branch. { canary: true } holds width at 1 until the first verified land. { knownGreen: "<sha>" } lets a relaunch skip the preflight gate when the base still sits at a sha a previous run verified. Args must be JSON — resolve any natural-language scope to ticket numbers, a cap, and a target before launching. For a watchable run (an explicit user ask, or a targeted intervention), use the launch-ralph skill instead — and say why.',
  phases: [
    { title: 'Preflight', detail: 'read project config, sync the integration base into this checkout, run the full gate (or honor knownGreen)' },
    { title: 'Graph', detail: 'list ready tickets and their blocking edges, verbatim' },
    { title: 'Build', detail: 'one fresh-context implementer per ticket on a pushed ralph/<n>-* branch, handing off at a green fast gate' },
    { title: 'Land', detail: 'local squash-merge onto the base under the fast gate, push, explicit close — one land at a time' },
    { title: 'Verify', detail: 'remote ground truth for every claimed land' },
    { title: 'Checkpoint', detail: 'the full gate on the base every N lands, with one bounded repair when red' },
    { title: 'Park', detail: 'comment failure history, label needs-info' },
    { title: 'Release', detail: 'final full gate and smoke, prune landed branches, the where-it-lives recap' },
  ],
}

// ---------------------------------------------------------------------------
// Policy — the launch-ralph policy block, as code. Override via args.
// ---------------------------------------------------------------------------

// args may arrive as an object ({ only, width, ... }), a bare array of ticket numbers,
// or a JSON string of either — some launch surfaces stringify it. Normalise all three.
// A provided-but-unparseable args is a caller error, not licence to build the whole tracker.
function resolveArgs(raw) {
  if (raw == null) return {}
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      throw new Error(`ralph: args was a string but not valid JSON — refusing to run: ${raw}`)
    }
  }
  return Array.isArray(value) ? { only: value } : value
}

const A = resolveArgs(args)

const POLICY = {
  // Scope the run to specific ticket numbers ([] = the whole ready frontier).
  only: A.only ?? [],
  // Stop after this many verified lands (0 = no cap). "The next five": the frontier
  // decides which five, in dependency order. Dispatch never exceeds the remainder, so a
  // run has at most `max` lands and leaves the rest of the frontier ready, not parked.
  max: A.max ?? 0,
  // Parallel implementers, kept busy continuously by a work pool: when one finishes the
  // next ready ticket dispatches — a slow ticket never holds the others. Width also caps
  // local build concurrency — several implementers share one machine, and fanning out
  // test runs buys backpressure, not speed. Use 1 until a run has landed tickets cleanly
  // on this project — or pass canary: true, which does it for you. Tickets that add DB
  // migrations are serialized by the loop itself (see the graph's `migration` flag).
  width: A.width ?? 3,
  // Integration target. The front door consolidates by DEFAULT (ADR-0026): it resolves a
  // scope-native branch name and passes it here, so the campaign collects on that branch and
  // the default branch is never touched — the run ends by offering ONE release PR
  // target -> default, which is also where cloud CI runs. A session pinned to a designated
  // working branch passes that branch here (ADR-0028) — the pin re-targets the run, it never
  // changes the engine. '' is the explicit trunk opt-in: each ticket landed straight onto
  // the default branch; a bare launch with no target is therefore trunk mode — non-default.
  target: A.target ?? '',
  // Canary: hold width at 1 until the run's first verified land proves the plumbing
  // end to end (branch, push, land, gate, close). For a project's first campaign.
  canary: A.canary ?? false,
  // Tries per ticket: 1 attempt + 1 retry with a fresh context, then park. A retry adopts
  // the pushed branch and fixes forward — the work persists, only the context is fresh.
  // Deferrals (a declared blocker had not landed yet) hand their attempt back, capped
  // separately at the same number.
  attempts: A.attempts ?? 2,
  // Land hand-backs that spend no attempt: the base moved under a finished branch and the
  // squash-merge conflicted, or the merged tree failed the loop's gate although the branch
  // was fine on its own. The builder did nothing wrong, so a fresh implementer re-syncs the
  // pushed branch (minutes, not a rebuild) — up to this many times per ticket before it
  // counts as a real failure.
  resyncs: A.resyncs ?? 2,
  // Run the FULL verification gate on the base after this many lands (0 = only at release).
  // Every land already passed the fast gate on the merged tree; the full suite (browser
  // journeys included) is paid once per checkpoint instead of once per ticket, and a red
  // checkpoint has at most this many suspects.
  checkpointEvery: A.checkpointEvery ?? 5,
  // A sha the caller vouches for: a previous run verified the base green at exactly this
  // commit. Preflight still syncs and installs, but skips the full gate when the base tip
  // equals it — relaunching after a lost container costs minutes, not a re-proof.
  knownGreen: A.knownGreen ?? '',
  // Backstop against a graph that never drains: total build dispatches (attempts, retries,
  // deferrals, re-syncs, repairs included).
  maxBuilds: A.maxBuilds ?? 60,
  // Re-read the tracker when the frontier is empty but tickets remain, so externally closed
  // blockers unblock things.
  refreshGraph: A.refreshGraph ?? true,
  // Stop dispatching when the remaining token budget drops below this — a build that starts
  // without enough budget to land is worse than one that never starts.
  reserve: A.reserve ?? 200_000,
}

// ---------------------------------------------------------------------------
// Clauses carried verbatim in every dispatch, retries included.
// ---------------------------------------------------------------------------
const INTEGRITY = `INTEGRITY: No placeholders, no stubs, no "simplified for now". Never delete,
skip, or weaken a test to get a green run; if a test is genuinely wrong, fix it deliberately
and say so in the commit message. Never claim a gate passed without having run it.`

const IDEMPOTENCY = `IDEMPOTENCY: This step can be replayed after an interruption, so check
before you act: if the ticket is already closed, report status "already-done" and stop; if a
pushed ralph/<n>-* branch for this ticket already exists, adopt it and continue from its last
commit — do not start over, and never create a second branch for the same ticket.`

// ---------------------------------------------------------------------------
// Schemas — stages return validated structure, never prose the script must parse.
// ---------------------------------------------------------------------------
const PREFLIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['green', 'base', 'defaultBranch', 'trackerAccess', 'installCommand', 'verifyCommand', 'fastGateCommand', 'localCommands', 'pushedBranches', 'failures'],
  properties: {
    green: { type: 'boolean', description: 'base is synced into this checkout and the full gate passed (or was skipped as known green)' },
    headSha: { type: 'string', description: 'the base tip the gate ran against (or that matched knownGreen)' },
    skippedGate: { type: 'boolean', description: 'true when the gate was skipped because the base tip equals knownGreen' },
    repo: { type: 'string', description: 'owner/name from the git remote, or empty' },
    base: { type: 'string', description: "the run's integration base: the declared target branch when one is set, else the default branch" },
    defaultBranch: { type: 'string', description: 'the repository default branch name' },
    targetCreated: { type: 'boolean', description: 'true when a declared target branch was missing from the remote and was created from the default branch tip' },
    issueTracker: { type: 'string', description: 'issueTracker from .launchrail.yml (github | linear | none)' },
    trackerAccess: {
      type: 'string',
      description:
        'instruction for reaching the tracker from THIS execution environment (exact CLI or MCP tools available here), for inclusion in dispatch prompts',
    },
    installCommand: { type: 'string', description: 'the verbatim dependency install command (e.g. pnpm install --frozen-lockfile)' },
    verifyCommand: { type: 'string', description: 'the FULL verification gate command, verbatim' },
    fastGateCommand: { type: 'string', description: 'the FAST verification gate command, verbatim' },
    localCommands: {
      type: 'array',
      items: { type: 'string' },
      description: 'other verbatim local commands (typecheck, lint, unit tests) implementers should use',
    },
    browserTesting: { type: 'boolean', description: '.launchrail.yml modules.browser-testing' },
    pushedBranches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['branch', 'sha'],
        properties: {
          branch: { type: 'string', description: 'a ralph/<n>-<slug> branch present on the remote' },
          sha: { type: 'string' },
        },
      },
      description: 'every ralph/* branch on the remote — in-flight work a previous run pushed, which this run adopts',
    },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

const GRAPH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tickets'],
  properties: {
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'title', 'blockedByLine', 'migration'],
        properties: {
          number: { type: 'integer' },
          title: { type: 'string' },
          blockedByLine: {
            type: 'string',
            description:
              'The ticket\'s "Blocked by" line copied VERBATIM (e.g. "**Blocked by:** #11, #9"), or "" if it has none. Do NOT interpret or resolve the edges — copy the characters; the caller parses the #n itself.',
          },
          migration: {
            type: 'boolean',
            description:
              'true when the ticket plainly adds or changes a database schema or migration (a new table, column, or migration file); false otherwise or when unsure. Used only to serialize such tickets — never to skip one.',
          },
        },
      },
    },
    notTickets: {
      type: 'array',
      items: { type: 'integer' },
      description:
        'Issue numbers wearing ready-for-agent that are plainly not implementable tickets (a published spec, research notes, an epic) — a labeling error to surface, not work to dispatch.',
    },
  },
}

const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary'],
  properties: {
    status: {
      type: 'string',
      enum: ['ready', 'already-done', 'blocked', 'conflict', 'verify-failed', 'failed'],
      description:
        '"ready" is the normal hand-off: the branch is pushed and the fast gate is green on it (the loop lands it); "already-done" when the ticket turned out to be closed already (idempotency)',
    },
    branch: { type: 'string', description: 'the pushed ralph/<n>-<slug> branch' },
    headSha: { type: 'string', description: 'the pushed tip, as the remote reports it' },
    commitTitle: {
      type: 'string',
      description: 'a Conventional Commit title for the squash the loop will make, e.g. "feat(auth): add magic-link sign-in"',
    },
    summary: { type: 'string', description: 'what happened, short; on failure, enough for a retry to act on' },
    failure: {
      type: 'string',
      description: 'on "blocked": which blocker is still open; on failure: the one fact a fresh retry must know',
    },
    punted: {
      type: 'array',
      items: { type: 'string' },
      description: 'follow-up work discovered but deliberately left out of scope',
    },
  },
}

const LAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary'],
  properties: {
    status: {
      type: 'string',
      enum: ['landed', 'conflict', 'gate-failed', 'stale', 'failed'],
      description:
        '"landed": squashed onto the base, gate green, pushed, remote confirmed; "conflict": the squash-merge conflicted; "gate-failed": the merged tree failed the gate; "stale": the remote base kept moving outside this loop; "failed": a precondition (dirty or diverged checkout, empty squash)',
    },
    mergeCommit: { type: 'string', description: 'on landed: the landing commit sha, as the remote reports it' },
    baseMoved: {
      type: 'boolean',
      description: 'true when the base had moved since the implementer synced (its tip was not contained in the branch)',
    },
    issueClosed: { type: 'boolean' },
    summary: {
      type: 'string',
      description: 'on landed: the facts (sha, gate); on conflict: the conflicting files; on gate-failed: the failing checks and key lines a fresh implementer can act on',
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['landed', 'issueClosed', 'evidence'],
  properties: {
    landed: {
      type: 'boolean',
      description: 'true only if the reported landing commit exists on the remote AND is on the base branch',
    },
    issueClosed: { type: 'boolean' },
    mergeCommit: { type: 'string' },
    evidence: { type: 'string', description: 'the API facts that establish the verdict' },
  },
}

const CHECKPOINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['green', 'headSha', 'summary'],
  properties: {
    green: { type: 'boolean', description: 'the full verification gate exited 0 on the synced base' },
    headSha: { type: 'string', description: 'the base tip the gate ran against' },
    summary: { type: 'string' },
    failures: {
      type: 'array',
      items: { type: 'string' },
      description: 'on red: the failing checks/tests with their key lines — a repair implementer acts on exactly this',
    },
  },
}

const RELEASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verified', 'summary'],
  properties: {
    verified: { type: 'boolean', description: 'the full verification gate is green on the final base (run now, or already proven at this exact tip)' },
    headSha: { type: 'string' },
    smokeBundle: { type: 'string', description: 'path of the smoke evidence bundle, when one was produced' },
    prunedBranches: { type: 'array', items: { type: 'string' }, description: 'the landed ralph/* branches deleted from the remote' },
    summary: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

// ---------------------------------------------------------------------------
// Dispatch prompts
// ---------------------------------------------------------------------------
function preamble(pre) {
  return `You are working in a Launchrail project${pre.repo ? ` (${pre.repo})` : ''}; integration base: ${pre.base}.
Binding docs: AGENTS.md and CLAUDE.md, plus the vision and specs under docs/. Read them before touching code.
Architecture decisions: read the registry index (docs/adr/README.md) and open only the ADRs touching your ticket's area — an ADR records a decision, not the current system; the code is the evidence for what exists.
Tracker access from this environment: ${pre.trackerAccess}
Blocking edges live on tickets as "Blocked by: #n" lines.
Verbatim local commands: install: ${pre.installCommand}${pre.localCommands.length > 0 ? ` ; ${pre.localCommands.join(' ; ')}` : ''}
Two gates. The FAST gate is ${pre.fastGateCommand} — run it before every hand-off; it must exit 0. The FULL gate (${pre.verifyCommand}) belongs to the loop, which runs it on the base at its checkpoints — do not spend your turn on the whole suite; run only the slow test files your change touches (a browser journey you edited).
Several implementers share this machine — run single test files while iterating and save full runs for the gate.`
}

function buildPrompt(pre, ticket, s, pushed, resync) {
  const retry =
    s.attempts > 1
      ? `\nThis is a RETRY with a fresh context. Prior attempt failed: ${s.failures.join(' | ')}
The pushed branch (if any) holds the previous attempt's work — adopt it and fix forward from the failure. Only if the failure shows the approach itself was wrong, reset the branch to origin/${pre.base} and start over (force-pushing your own ralph/${ticket.number}-* branch is allowed; nothing else ever is).\n`
      : ''
  const resyncNote = resync
    ? `\nThe loop could not land the pushed branch because ${pre.base} moved under it: ${resync}
This is a RE-SYNC, not a failure: adopt the branch, merge the latest ${pre.base} into it (conflicts are ordinary work — the launch-resolving-merge-conflicts skill; regenerate migrations that now collide), make the fast gate green on the merged result, push, and hand off again.\n`
    : ''
  const adopt = pushed
    ? `A pushed branch already exists for this ticket: ${pushed.branch} at ${pushed.sha} — a previous session's work. Adopt it (\`git fetch origin ${pushed.branch} && git checkout -b ${pushed.branch} origin/${pushed.branch}\`), read its log and its diff against origin/${pre.base}, and continue from where it stopped — never start over.`
    : `Check the remote first (\`git ls-remote --heads origin 'ralph/${ticket.number}-*'\`) and adopt any pushed branch you find (\`git fetch origin <branch> && git checkout -b <branch> origin/<branch>\`, then continue from its last commit). Otherwise branch from a fresh fetch and push at once: \`git fetch origin ${pre.base} && git checkout -b ralph/${ticket.number}-<short-slug> origin/${pre.base} && git push -u origin HEAD\`. Never check out ${pre.base} itself in this worktree — the loop lands in the main checkout.`
  return `${preamble(pre)}

Implement ticket #${ticket.number} ("${ticket.title}") through to a pushed, fast-gate-green branch. You own the build alone; assume no knowledge of any other session. Other implementers are working on other tickets against the same base right now, so ${pre.base} will move under you. That is expected.
${retry}${resyncNote}
Steps, in order:
1. Dependency gate: before anything else, confirm every ticket on this ticket's "Blocked by" line is CLOSED with its work landed on ${pre.base}. If any blocker is still open, do NOT build on a missing dependency — report status "blocked", name the open blocker in "failure", and stop. That is a deferral, not a failure; the loop retries you after the blocker lands.
2. Read the ticket and everything it links (spec sections, ADRs, journeys). If the tracker tool truncates the body (long code spans are a known trigger), fetch the full text by another route — the tracker's search API, the spec file in the repo — and never implement from a truncated ticket. Report status "already-done" if the ticket is already closed.
3. Label the ticket ralph:building so a lost session leaves a trace.
4. Branch and push immediately. ${adopt} From here on the pushed branch is your checkpoint: commit and push after every green step (a passing test slice, a finished subtask) — a session that dies keeps everything up to its last push, and its successor resumes from there instead of rebuilding. The pushes are also the loop's liveness signal.
5. Implement by invoking the launch-ralph-implement skill — it owns the per-ticket contract: TDD, commit-and-push cadence, the fast gate, browser smoke for user-facing changes, self-review via launch-code-review, commit conventions.
6. Pre-land sync: merge the latest origin/${pre.base} into your branch. Conflicts are ordinary work — resolve them with the launch-resolving-merge-conflicts skill. If ${pre.base} gained DB migrations since you branched, regenerate yours to follow them with the project's migration tool — never hand-edit the migration journal. Re-run the fast gate if anything changed, then push.
7. Hand off: confirm the tip is pushed (\`git ls-remote origin refs/heads/<branch>\` equals \`git rev-parse HEAD\`) and report status "ready" with branch, headSha, and commitTitle — a Conventional Commit title for the squash the loop will make (e.g. "feat(auth): add magic-link sign-in"). Then STOP: the loop lands your branch (a local squash-merge onto ${pre.base} under its own gate run, the push, the explicit issue close). Never push to ${pre.base} yourself, never merge your work into ${pre.base}, and never open a PR — the campaign is released by one PR at the end.

${INTEGRITY}

${IDEMPOTENCY}

Report honestly via the schema: "ready" once the branch is pushed with the fast gate green; "already-done" when the ticket was closed already; "blocked" when a declared blocker had not landed; "verify-failed" when the fast gate would not go green; "conflict" when a conflict was too ambiguous to resolve without losing behavior (say which files and why); "failed" otherwise, with a summary a fresh retry can act on. List deliberately-out-of-scope discoveries in "punted".`
}

// The lander is the loop's own gate: it re-runs the gate on the merged tree in THIS
// checkout (warm caches, seconds to minutes), never trusting the builder's word, and
// pushes only a green base. One land at a time — the script serializes them.
function landPrompt(pre, subject, full) {
  const gate = full ? `the FULL gate: ${pre.verifyCommand}` : `the FAST gate: ${pre.fastGateCommand}`
  const what = subject.repair
    ? `a repair of the red base`
    : `ticket #${subject.number} ("${subject.title}")`
  const title = subject.commitTitle || (subject.repair ? `fix: repair ${pre.base}` : `feat: ${subject.title}`)
  const trailer = subject.repair ? '' : ` -m "Closes #${subject.number}"`
  return `You are landing ${what}: the implementer pushed branch ${subject.branch} (head ${subject.headSha || 'see remote'}) and reports the fast gate green there. You own the local squash-merge onto ${pre.base}, the loop's own gate run, the push, and the tracker bookkeeping — nothing else. You never write code and never repair a branch: a squash that conflicts or a gate that fails is reported, not fixed here. Work in THIS checkout (no worktree); exactly one land runs at a time, so nothing else touches it while you do.
Tracker access from this environment: ${pre.trackerAccess}
1. Preconditions: \`git status --porcelain\` must show no modified or staged files (untracked files are fine) — a dirty tree is status "failed" ("dirty checkout"); never stash or discard anything. Then \`git fetch origin ${pre.base} ${subject.branch}\`.
2. Check out the base: \`git checkout ${pre.base}\` (or \`git checkout -b ${pre.base} --track origin/${pre.base}\` when no local branch exists), then \`git merge --ff-only origin/${pre.base}\`. If the fast-forward is refused, the local ${pre.base} has diverged from the remote — report status "failed" saying so; do not reset it.
3. Record whether the base moved since the implementer synced: \`git merge-base --is-ancestor origin/${pre.base} origin/${subject.branch}\` — exit 0 means the branch already contains the base tip (baseMoved: false); otherwise baseMoved: true.
4. Squash-merge: \`git merge --squash origin/${subject.branch}\`. On conflicts, restore the exact clean state of step 2 with \`git reset --hard origin/${pre.base}\` and report status "conflict" naming the conflicting files. Otherwise commit: \`git commit -m ${JSON.stringify(subject.repair ? title : `${title} (#${subject.number})`)}${trailer} -m "Landed by the Ralph loop from ${subject.branch}@${subject.headSha || 'HEAD'}"\`. Nothing to commit → status "failed" (the branch adds nothing to the base).
5. If the landed change touched a dependency manifest or lockfile (\`git diff --name-only HEAD~1 HEAD\`), run the install command first: ${pre.installCommand}. Then run ${gate}. It must exit 0. On failure, undo the landing with \`git reset --hard origin/${pre.base}\` and report status "gate-failed" with the failing checks/tests and their key lines — enough for a fresh implementer to act on. A red base is never pushed.
6. \`git push origin ${pre.base}\`. A rejected (non-fast-forward) push means the remote moved outside this loop: \`git fetch origin ${pre.base} && git reset --hard origin/${pre.base}\` and redo steps 3–6 ONCE; a second rejection is status "stale".
7. Confirm on the remote: \`git ls-remote origin refs/heads/${pre.base}\` must equal \`git rev-parse HEAD\`. That sha is mergeCommit.${
    subject.repair
      ? ''
      : `
8. Tracker bookkeeping: close issue #${subject.number} explicitly (auto-close never fires off the default branch) and read it back closed; remove the ralph:building label; post one comment: "Landed on ${pre.base} at <sha> (squash of ${subject.branch}) by the Ralph loop." Report status "landed" with mergeCommit and issueClosed.`
  }
Report "landed" only after step 7 confirmed the remote; every other outcome by its status, with a summary the loop can act on.`
}

function verifyPrompt(pre, ticket, land) {
  return `Establish ground truth for ticket #${ticket.number} using the tracker/API tools only.
Tracker access: ${pre.trackerAccess}
The loop reports it landed on ${pre.base} as commit ${land.mergeCommit}.
Check, against the remote: (1) commit ${land.mergeCommit} exists in the repository and is on branch ${pre.base} (list the branch's recent commits, or compare the branch with the sha); (2) issue #${ticket.number} is closed.
Report landed: true only when (1) holds, issueClosed from (2). A comment or a report is NOT evidence — only API state counts. Do not run local git, do not use a shell. Fix nothing, close nothing; report only.`
}

function checkpointPrompt(pre, k, suspects) {
  return `Full verification checkpoint ${k} for the Ralph loop's base ${pre.base}, in THIS checkout (exactly one land or checkpoint runs at a time, so nothing else touches it). Fix nothing.
Since the last green checkpoint these tickets landed: ${suspects.map((t) => `#${t.number} (${t.title})`).join(', ') || 'none'}.
1. \`git fetch origin ${pre.base}\`; \`git checkout ${pre.base}\` and \`git merge --ff-only origin/${pre.base}\`; record \`git rev-parse HEAD\` as headSha.
2. Run the install command (${pre.installCommand}) so the tree's dependencies are current, then the FULL verification gate: ${pre.verifyCommand}. Report the actual exit code, not the reassuring summary line.
green means: the gate exited 0. On red, list every failing check or test with its key lines in failures — a repair implementer will act on exactly that.`
}

function repairPrompt(pre, cp, suspects, k) {
  return `${preamble(pre)}

The Ralph loop's base ${pre.base} is RED at ${cp.headSha}: the full verification gate failed at checkpoint ${k} after these tickets landed since the last green base (${cp.greenSha || 'the run start'}): ${suspects.map((t) => `#${t.number} (${t.title}, landed as ${t.mergeCommit})`).join(', ') || 'none'}.
Failures: ${(cp.failures ?? []).join(' | ') || cp.summary}

Repair the base through to a pushed, green branch:
1. Branch from a fresh fetch and push at once: \`git fetch origin ${pre.base} && git checkout -b ralph/repair-${k}-<short-slug> origin/${pre.base} && git push -u origin HEAD\`. Never check out ${pre.base} itself in this worktree.
2. Reproduce the failure — the failing test files first, the full gate if needed — and find the root cause among the listed landings (\`git log ${cp.greenSha || ''}..${cp.headSha}\`): an integration break between two tickets, a migration-number collision, a journey a landing invalidated. Fix it properly; regenerate colliding migrations with the project's migration tool.
3. Make the fast gate green, then the FULL gate (${pre.verifyCommand}) green — this repair lands under the full gate. Self-review via the launch-code-review skill, commit conventionally, push after every green step.
4. Hand off: report status "ready" with branch, headSha, and a commitTitle like "fix(<scope>): <what>". Then STOP — the loop lands it. Never push to ${pre.base} yourself.
Report "failed" with the one fact a human must know if the base cannot be repaired without losing behavior.

${INTEGRITY}`
}

function releasePrompt(pre, opts) {
  const gateStep = opts.baseRed
    ? `2. The base is known RED (${opts.baseRedReason}) — skip the gate and report verified: false with that reason in failures.`
    : opts.needsGate
      ? `2. Run the install command (${pre.installCommand}), then the FULL verification gate: ${pre.verifyCommand}. Report the actual exit code.`
      : `2. The full gate already passed at exactly this tip (${opts.greenSha}) during the run — report verified: true without re-running it, unless the tip you synced differs, in which case run ${pre.verifyCommand}.`
  const smokeStep =
    !opts.baseRed && opts.smoke
      ? `
3. The browser-testing module is enabled and tickets landed: start the app (node scripts/dev.mjs --background), scaffold an evidence bundle (npx @wemuda/launchrail smoke), and drive the smoke journeys from docs/testing/smoke-journeys.md per the launch-browser-smoke skill. Report the bundle path. A journey you could not complete is a failure, never a pass.`
      : ''
  const pruneStep =
    opts.prune.length > 0
      ? `
4. Prune the remote branches of the verified-landed tickets, and ONLY these: ${opts.prune.join(', ')} (\`git push origin --delete <branch>\` each; a branch already gone is fine). Never delete any other branch. Report prunedBranches.`
      : ''
  return `Release verification for a finished Ralph loop run, in THIS checkout. Fix nothing.
1. Sync a fresh ${pre.base} (\`git fetch origin ${pre.base}\`, \`git checkout ${pre.base}\`, \`git merge --ff-only origin/${pre.base}\`) and record its head sha.
${gateStep}${smokeStep}${pruneStep}
verified means: the full verification gate is green on the final base${!opts.baseRed && opts.smoke ? ' AND no smoke journey failed' : ''}.`
}

const graphPrompt = (pre) => `List the open, ready tickets for a Ralph loop run. Change nothing on the tracker.
Tracker access: ${pre.trackerAccess}
Include every open ticket labeled ready-for-agent, excluding any labeled needs-info.
An open issue wearing ready-for-agent that is plainly not an implementable ticket — a published spec, research notes, an epic — is a labeling error: leave it out of tickets and report its number in notTickets instead. When in doubt, include it as a ticket.
For each, report its number, its exact title, and its "Blocked by" line copied VERBATIM (the whole line, e.g. "**Blocked by:** #11, #9"), or "" when it has none. If the tracker records blocking through native relations instead of a body line, render those relations as one "Blocked by: #n, #m" line and nothing else.
Do NOT interpret, resolve, or filter the edges — copy the characters and let the caller parse the #n. Getting a blocker wrong dispatches a ticket before its dependency lands.
Also flag migration: true for a ticket that plainly adds or changes a database schema or migration (a new table, column, or migration file) — false otherwise or when unsure. The loop only uses it to run such tickets one at a time.`

// A non-ticket wearing ready-for-agent (a published spec, research notes) is excluded from
// the frontier but never silently: the label is the bug, and the supervisor should fix it.
function warnNotTickets(graph) {
  for (const n of graph?.notTickets ?? []) {
    log(`#${n} wears ready-for-agent but is not an implementable ticket — excluded from the frontier; relabel it (e.g. spec)`)
  }
}

// Blocking edges are parsed here, deterministically, from the verbatim line — never by a
// model. A single misread edge silently builds a ticket on a dependency that hasn't landed.
function parseGraph(graph) {
  return (graph?.tickets ?? []).map((t) => ({
    number: t.number,
    title: t.title,
    migration: t.migration === true,
    blockedBy: [...(t.blockedByLine ?? '').matchAll(/#(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n !== t.number),
  }))
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// number -> { ticket, attempts, defers, resyncs, failures[], status, branch, mergeCommit, punted[], waiting }
// status: pending | landed | done-before | external | parked | held
const state = new Map()

function entry(ticket) {
  if (!state.has(ticket.number)) {
    state.set(ticket.number, {
      ticket,
      attempts: 0,
      defers: 0,
      resyncs: 0,
      failures: [],
      status: 'pending',
      branch: '',
      mergeCommit: '',
      punted: [],
      waiting: false,
    })
  }
  return state.get(ticket.number)
}

let builds = 0 // every build-type dispatch: attempts, retries, deferrals, re-syncs, repairs
let landedCount = 0 // verified lands
const landedSinceGreen = [] // { number, title, mergeCommit } landed since the last green full gate
let sinceCheckpoint = 0
let lastGreenSha = ''
let baseTip = ''
let baseRed = false
let baseRedReason = ''
let checkpointRuns = 0
const checkpoints = [] // every full-gate verdict on the base, repairs included

// The land lock: exactly one land or checkpoint touches the main checkout at a time.
// A promise chain, so it needs no timers and survives a resumed run unchanged.
let landLock = Promise.resolve()
function withLandLock(fn) {
  const run = landLock.then(fn, fn)
  landLock = run.then(
    () => {},
    () => {},
  )
  return run
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

// A green full gate on the base: after every POLICY.checkpointEvery lands, and whenever
// a repair lands. Called holding the land lock. A red checkpoint gets exactly one repair
// dispatch (a fresh implementer with the failures and the suspects); if that does not land
// green, the base is declared red and nothing lands until a human looks — built tickets
// keep their pushed branches and are reported as held.
async function checkpoint(pre) {
  checkpointRuns += 1
  const k = checkpointRuns
  const suspects = [...landedSinceGreen]
  const cp = await agent(checkpointPrompt(pre, k, suspects), {
    label: `checkpoint:${k}`,
    phase: 'Checkpoint',
    schema: CHECKPOINT_SCHEMA,
    effort: 'low',
  })
  if (!cp) {
    log(`checkpoint ${k}: agent died (infrastructure) — the next land re-runs it`)
    return
  }
  checkpoints.push({ k, headSha: cp.headSha, green: cp.green, suspects: suspects.map((t) => t.number) })
  if (cp.green) {
    lastGreenSha = cp.headSha
    sinceCheckpoint = 0
    landedSinceGreen.length = 0
    log(`checkpoint ${k}: full gate green at ${cp.headSha}`)
    return
  }
  log(`checkpoint ${k}: full gate RED at ${cp.headSha} after ${suspects.map((t) => `#${t.number}`).join(', ') || 'no lands'} — dispatching one repair`)
  builds += 1
  const fix = await agent(repairPrompt(pre, { ...cp, greenSha: lastGreenSha }, suspects, k), {
    label: `repair:${k}`,
    phase: 'Build',
    schema: BUILD_SCHEMA,
    isolation: 'worktree',
  })
  if (fix && fix.status === 'ready' && fix.branch) {
    const land = await agent(landPrompt(pre, { repair: true, ...fix }, true), {
      label: `land:repair:${k}`,
      phase: 'Land',
      schema: LAND_SCHEMA,
      effort: 'low',
    })
    if (land && land.status === 'landed') {
      lastGreenSha = land.mergeCommit
      baseTip = land.mergeCommit
      sinceCheckpoint = 0
      landedSinceGreen.length = 0
      checkpoints.push({ k, headSha: land.mergeCommit, green: true, suspects: [], repair: fix.branch })
      log(`repair landed at ${land.mergeCommit} under the full gate — base green again`)
      return
    }
    baseRedReason = `repair branch ${fix.branch} did not land: ${land ? `${land.status}: ${land.summary}` : 'lander died'}`
  } else {
    baseRedReason = `repair did not produce a branch: ${fix ? (fix.failure ?? fix.summary) : 'repair agent died'}`
  }
  baseRed = true
  log(`base RED at ${cp.headSha} and the repair did not land (${baseRedReason}) — no further lands; finished tickets stay on their pushed branches as held`)
}

// Land a finished branch: one at a time, in the main checkout, under the fast gate.
function landTicket(pre, ticket, build) {
  return withLandLock(async () => {
    if (baseRed) return { status: 'held', summary: baseRedReason }
    const land = await agent(landPrompt(pre, { number: ticket.number, title: ticket.title, ...build }, false), {
      label: `land:#${ticket.number}${build.resyncLabel ?? ''}`,
      phase: 'Land',
      schema: LAND_SCHEMA,
      effort: 'low',
    })
    if (land && land.status === 'landed') {
      baseTip = land.mergeCommit
      sinceCheckpoint += 1
      landedSinceGreen.push({ number: ticket.number, title: ticket.title, mergeCommit: land.mergeCommit })
      if (POLICY.checkpointEvery > 0 && sinceCheckpoint >= POLICY.checkpointEvery) await checkpoint(pre)
    }
    return land
  })
}

async function drive(pre, ticket, pushed) {
  const s = entry(ticket)
  let resync = null
  for (;;) {
    s.attempts += 1
    builds += 1
    const label = `build:#${ticket.number}${s.attempts > 1 ? ':retry' : ''}${resync ? `:resync${s.resyncs}` : ''}`
    const build = await agent(buildPrompt(pre, ticket, s, pushed, resync), {
      label,
      phase: 'Build',
      schema: BUILD_SCHEMA,
      isolation: 'worktree', // parallel implementers must never fight over one checkout
    })
    if (!build) {
      s.failures.push('implementer died (infrastructure)')
      return { ticket, ok: false, dead: true }
    }
    s.punted.push(...(build.punted ?? []))
    if (build.branch) s.branch = build.branch
    if (build.status === 'already-done') {
      s.status = 'done-before'
      return { ticket, ok: false, doneBefore: true }
    }
    if (build.status === 'blocked') {
      // A declared blocker had not actually landed — the frontier's view was stale, or the
      // blocker is open but outside the ready set. Hand the attempt back: a deferral is not
      // a failure. Capped so a permanently missing dependency still parks eventually.
      s.defers += 1
      if (s.defers <= POLICY.attempts) {
        s.attempts -= 1
        return { ticket, ok: false, deferred: true, why: build.failure ?? build.summary }
      }
      s.failures.push(`still blocked after ${s.defers} deferrals: ${build.failure ?? build.summary}`)
      return { ticket, ok: false }
    }
    if (build.status !== 'ready') {
      s.failures.push(`[attempt ${s.attempts}] ${build.status}: ${build.failure ?? build.summary}`)
      return { ticket, ok: false }
    }
    if (!build.branch) {
      s.failures.push(`[attempt ${s.attempts}] reported ready but returned no branch`)
      return { ticket, ok: false }
    }
    // The loop owns the landing (ADR-0022, ADR-0032): a local squash-merge onto the base
    // under the fast gate, one at a time. No PR, no CI wait — the builder's branch is
    // pushed, so nothing is lost whatever happens next.
    const land = await landTicket(pre, ticket, { ...build, resyncLabel: resync ? `:resync${s.resyncs}` : '' })
    if (!land) {
      s.failures.push('lander died (infrastructure)')
      return { ticket, ok: false, dead: true }
    }
    if (land.status === 'held') {
      s.status = 'held'
      return { ticket, ok: false, held: true }
    }
    if (land.status === 'landed') {
      // Nothing is trusted from a report — a claimed land is checked against the remote
      // by a separate, cheap agent with tracker access only.
      const verdict = await agent(verifyPrompt(pre, ticket, land), {
        label: `verify:#${ticket.number}`,
        phase: 'Verify',
        schema: VERIFY_SCHEMA,
        model: 'haiku',
        effort: 'low',
      })
      if (verdict?.landed && verdict.issueClosed) {
        s.status = 'landed'
        s.mergeCommit = verdict.mergeCommit || land.mergeCommit
        return { ticket, ok: true }
      }
      // Landed-but-issue-open fails verification too: the retry finds the ticket's work on
      // the base (empty squash) or the issue open, finishes the bookkeeping, and settles.
      s.failures.push(`[attempt ${s.attempts}] claimed landed, remote disagrees: ${verdict ? verdict.evidence : 'verifier died'}`)
      return { ticket, ok: false }
    }
    // The base moved under a finished branch: a conflict, a gate that only fails on the
    // merged tree, or a remote that kept moving. The builder did nothing wrong — hand the
    // pushed branch to a fresh implementer to re-sync, without spending an attempt.
    const integration = land.status === 'conflict' || land.status === 'stale' || (land.status === 'gate-failed' && land.baseMoved === true)
    if (integration && s.resyncs < POLICY.resyncs) {
      s.resyncs += 1
      s.attempts -= 1
      resync = `${land.status}: ${land.summary}`
      log(`#${ticket.number}: land hand-back (${land.status}) — re-syncing the pushed branch (${s.resyncs}/${POLICY.resyncs}), no attempt spent`)
      pushed = { branch: build.branch, sha: build.headSha ?? '' }
      continue
    }
    s.failures.push(`[attempt ${s.attempts}] land ${land.status}: ${land.summary}`)
    return { ticket, ok: false }
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
phase('Preflight')
const pre = await agent(
  `Preflight for a Ralph loop run in THIS checkout — the loop lands tickets here (one land at a time), while builders use their own worktrees. Report actual state; fix nothing — the permitted mutations are creating the declared integration branch (step 2) and syncing this checkout onto the base.
1. Read .launchrail.yml (issueTracker, testing commands, modules) and AGENTS.md (verbatim commands).
2. Identify the repo (git remote) and its default branch; report the default branch name as defaultBranch. ${
    POLICY.target
      ? `This run consolidates onto the integration branch "${POLICY.target}" — that branch is the base. If it does not exist on the remote, create it from the default branch's tip (no force; the default branch itself is never touched) and report targetCreated: true. A missing DEFAULT branch is still not green — do not guess.`
      : `This run lands onto the default branch (trunk) — that branch is the base. If it does not exist on the remote, report not green and say the base is missing — do not guess another branch.`
  } Sync the base INTO THIS CHECKOUT: the tree must be clean (\`git status --porcelain\` shows no modified or staged files — untracked files are fine; a dirty tree is not green: say so, stash nothing); \`git fetch origin\`, check out the base (tracking origin) and \`git merge --ff-only origin/<base>\` — a local base that has diverged from origin is not green (say "push or reset it first"). Report the base name as base and its tip as headSha.
3. Determine how the tracker is reachable from THIS environment: check whether the CLI the project docs assume (e.g. gh) is installed; if not, name the concrete substitute available here (e.g. GitHub MCP tools) as an instruction future agents can follow.
4. List in-flight work from previous sessions: \`git ls-remote --heads origin 'ralph/*'\` — report every branch with its sha as pushedBranches (the loop adopts them; delete nothing).
5. Run the project's install command (report it verbatim as installCommand). ${
    POLICY.knownGreen
      ? `Then compare headSha with "${POLICY.knownGreen}": if they are EQUAL, a previous run verified the base green at exactly this commit — skip the verification gate, report skippedGate: true and green: true. If they differ, run the FULL gate as below.`
      : 'Then run the FULL verification gate'
  }: npx @wemuda/launchrail verify. Report the actual exit codes, not the reassuring summary line. An empty verification contract failing the gate is a refusal condition, not something to work around.
Report verifyCommand as "npx @wemuda/launchrail verify" and fastGateCommand as "npx @wemuda/launchrail verify --fast" (the fast tier: testing.checkCommand, else the unit command — never e2e).
green means: base synced in this checkout AND (the full gate exited 0 OR it was skipped as known green).`,
  { label: 'preflight', phase: 'Preflight', schema: PREFLIGHT_SCHEMA },
)
if (!pre) throw new Error('preflight agent died — refusing to start')
if (!pre.green) {
  // A broken base poisons every implementer after it; a run that starts red
  // can only end with unverifiable results.
  return { refused: true, reason: 'preflight not green', failures: pre.failures }
}
if ((pre.issueTracker ?? 'none') === 'none') {
  return { refused: true, reason: 'no issue tracker configured (.launchrail.yml issueTracker: none) — Ralph needs tickets' }
}
lastGreenSha = pre.headSha ?? ''
baseTip = pre.headSha ?? ''

// Pushed ralph/<n>-* branches are a previous session's in-flight work; the number in the
// branch name says whose. The dispatch tells the builder to adopt it — resume costs the
// minutes since its last push, never a rebuild.
const pushedByTicket = new Map()
for (const b of pre.pushedBranches ?? []) {
  const m = /^(?:refs\/heads\/)?ralph\/(\d+)-/.exec(b.branch ?? '')
  if (m) pushedByTicket.set(Number(m[1]), { branch: b.branch.replace(/^refs\/heads\//, ''), sha: b.sha })
}

phase('Graph')
log(
  `Base green at ${pre.headSha ?? pre.base} on ${pre.base}${pre.skippedGate ? ' (known green — gate skipped)' : ''}. ` +
    (POLICY.target
      ? `Consolidating onto ${pre.base}${pre.targetCreated ? ' (created from the default branch tip)' : ''}; ${pre.defaultBranch || 'the default branch'} stays untouched. `
      : `Trunk mode — each ticket lands on ${pre.base}. `) +
    (POLICY.only.length > 0
      ? `Scoped to ${POLICY.only.map((n) => `#${n}`).join(', ')}.`
      : 'No scope — building the whole ready frontier.') +
    (POLICY.max > 0 ? ` Stopping after ${POLICY.max} verified land(s).` : '') +
    ` Width ${POLICY.width}${POLICY.canary ? ' (canary: width 1 until the first verified land)' : ''}, ${POLICY.attempts} attempts per ticket, full gate every ${POLICY.checkpointEvery || 'release-only'} land(s).` +
    (pushedByTicket.size > 0 ? ` Adopting pushed branches for ${[...pushedByTicket.keys()].map((n) => `#${n}`).join(', ')}.` : ''),
)
let graph = await agent(graphPrompt(pre), { label: 'read-graph', phase: 'Graph', schema: GRAPH_SCHEMA, model: 'haiku', effort: 'low' })
if (!graph) throw new Error('graph agent died — refusing to start')
warnNotTickets(graph)
let tickets = parseGraph(graph)
log(`${tickets.length} ready ticket(s) on the tracker`)

const closedBefore = new Set() // blockers not in the ready set are treated as settled before the run
for (const t of tickets) {
  for (const b of t.blockedBy) {
    if (!tickets.some((x) => x.number === b)) closedBefore.add(b)
  }
}

function settled(n) {
  if (closedBefore.has(n)) return true
  const s = state.get(n)
  return s !== undefined && (s.status === 'landed' || s.status === 'done-before' || s.status === 'external')
}

// Transitive dependents: the tickets that cannot start until this one lands. The frontier
// dispatches the most-depended-on first, so a wide graph unblocks quickly — pure code.
function dependents(n) {
  const seen = new Set()
  const queue = [n]
  while (queue.length > 0) {
    const x = queue.pop()
    for (const t of tickets) {
      if (t.blockedBy.includes(x) && !seen.has(t.number)) {
        seen.add(t.number)
        queue.push(t.number)
      }
    }
  }
  return seen.size
}

const inFlight = new Map() // number -> promise of a drive() result

// A ticket is ready when it isn't settled, isn't in flight or waiting on a state change,
// hasn't exhausted its attempts, every blocker is closed-before-the-run or landed-by-us,
// and no blocker is parked or held. Pure code — the orchestrator never asks a subagent
// what's ready. The implementer's dependency gate is the backstop for what this check
// cannot see (a blocker that is open but never entered the ready set).
function frontier() {
  return tickets
    .filter((t) => {
      const s = entry(t)
      if (s.status !== 'pending' || s.waiting || inFlight.has(t.number)) return false
      if (s.attempts >= POLICY.attempts) return false
      if (POLICY.only.length > 0 && !POLICY.only.includes(t.number)) return false
      return t.blockedBy.every(settled)
    })
    .sort((a, b) => dependents(b.number) - dependents(a.number) || a.number - b.number)
}

function unsettledRemain() {
  return tickets.some((t) => {
    const s = entry(t)
    return s.status === 'pending' && s.attempts < POLICY.attempts && (POLICY.only.length === 0 || POLICY.only.includes(t.number))
  })
}

async function refreshGraph(reason) {
  graph = await agent(graphPrompt(pre), { label: `read-graph:${reason}`, phase: 'Graph', schema: GRAPH_SCHEMA, model: 'haiku', effort: 'low' })
  if (!graph) return
  warnNotTickets(graph)
  const fresh = parseGraph(graph)
  for (const t of fresh) {
    if (!tickets.some((x) => x.number === t.number)) tickets.push(t)
  }
  for (const t of tickets) {
    const still = fresh.some((x) => x.number === t.number)
    const s = state.get(t.number)
    // Ticket left the ready set without us touching it (closed or re-labeled
    // externally): treat it as settled for blockers and never dispatch it.
    if (!still && (!s || (s.status === 'pending' && s.attempts === 0 && !inFlight.has(t.number)))) {
      entry(t).status = 'external'
      closedBefore.add(t.number)
    }
  }
  for (const s of state.values()) s.waiting = false
}

// The work pool: keep `width` builders busy, land each as it finishes, dispatch the next.
let stopReason = ''
let maxReached = false
let deadStreak = 0
let refreshedAt = -1
for (;;) {
  const budgetLow = Boolean(budget.total) && budget.remaining() < POLICY.reserve
  // Canary: the first verified land proves the plumbing end to end (branch, push, land,
  // gate, explicit close); until it does, one ticket at a time.
  const width = POLICY.canary && landedCount === 0 ? 1 : POLICY.width
  const migrationInFlight = () => [...inFlight.keys()].some((n) => tickets.find((t) => t.number === n)?.migration)
  while (!baseRed && !budgetLow && inFlight.size < width && builds < POLICY.maxBuilds) {
    const ready = frontier()
    // Migration-adding tickets collide on the next migration number when built in
    // parallel — the loop keeps one such ticket in flight at a time.
    const next = ready.find((t) => !t.migration || !migrationInFlight())
    if (!next) break
    // The cap counts verified lands; in-flight tickets reserve their share so even a
    // fully successful pool cannot overshoot.
    if (POLICY.max > 0 && landedCount + inFlight.size >= POLICY.max) break
    const pushed = pushedByTicket.get(next.number) ?? null
    log(`dispatch #${next.number}${pushed ? ` (adopting ${pushed.branch})` : ''} — ${inFlight.size + 1} in flight, ${ready.length - 1} more ready`)
    inFlight.set(
      next.number,
      drive(pre, next, pushed)
        .catch((err) => ({ ticket: next, ok: false, dead: true, error: String(err) }))
        .then((r) => ({ ...r, number: next.number })),
    )
  }
  if (inFlight.size === 0) {
    if (baseRed) {
      stopReason = 'base red'
      break
    }
    if (budgetLow) {
      stopReason = `token budget at reserve (${Math.round(budget.remaining() / 1000)}k left)`
      break
    }
    if (builds >= POLICY.maxBuilds) {
      stopReason = `maxBuilds (${POLICY.maxBuilds}) reached`
      break
    }
    if (POLICY.max > 0 && landedCount >= POLICY.max) {
      maxReached = true
      stopReason = `cap reached: ${POLICY.max} verified land(s) — the rest of the frontier stays ready`
      break
    }
    // Nothing running and nothing ready: a tracker refresh is the only thing that can
    // change that (an externally closed blocker), and it is worth one look per change.
    if (POLICY.refreshGraph && unsettledRemain() && refreshedAt !== landedCount) {
      refreshedAt = landedCount
      await refreshGraph(`l${landedCount}`)
      continue
    }
    stopReason = unsettledRemain() ? 'frontier stuck — remaining tickets wait on parked, held, or open blockers' : 'frontier drained'
    break
  }
  const done = await Promise.race([...inFlight.values()])
  inFlight.delete(done.number)
  const s = entry(done.ticket)
  if (done.dead) {
    deadStreak += 1
    log(`#${done.number}: agent died (infrastructure)${done.error ? ` — ${done.error}` : ''}`)
    if (deadStreak >= 3) {
      stopReason = 'three agents in a row died — infrastructure, not tickets'
      break
    }
  } else {
    deadStreak = 0
  }
  if (done.ok) {
    landedCount += 1
    log(`#${done.number} landed on ${pre.base} at ${s.mergeCommit} (verified) — ${landedCount} landed`)
    for (const other of state.values()) other.waiting = false // a land is the state change deferred tickets wait for
  } else if (done.doneBefore) {
    log(`#${done.number} was already closed — settled without a land`)
    for (const other of state.values()) other.waiting = false
  } else if (done.deferred) {
    s.waiting = true
    log(`#${done.number} deferred (blocker not landed yet): ${done.why}`)
  } else if (done.held) {
    log(`#${done.number} built and pushed on ${s.branch} but NOT landed — base red; a relaunch adopts it`)
  }
  if (s.status === 'pending' && s.attempts >= POLICY.attempts) {
    s.status = 'parked'
    log(`#${done.number} parked after ${s.attempts} attempts: ${s.failures[s.failures.length - 1]}`)
  }
}
log(`stopping: ${stopReason}`)

const landed = [...state.values()].filter((s) => s.status === 'landed')
const parked = [...state.values()].filter((s) => s.status === 'parked')
const held = [...state.values()].filter((s) => s.status === 'held')
const stuck = tickets.filter((t) => {
  const s = state.get(t.number)
  return (!s || s.status === 'pending') && (POLICY.only.length === 0 || POLICY.only.includes(t.number))
})

phase('Park')
if (parked.length > 0) {
  await agent(
    `On the tracker (${pre.trackerAccess}), for each of these parked tickets: post one comment containing its accumulated failure history verbatim (and the pushed branch that holds its work, when there is one), remove the ralph:building label if present, and add the needs-info label. Change nothing else. Fix nothing.
${parked.map((s) => `#${s.ticket.number} (${s.ticket.title})${s.branch ? ` — branch ${s.branch}` : ''}: ${s.failures.join(' | ')}`).join('\n')}`,
    { label: 'park', phase: 'Park', schema: { type: 'object', properties: { done: { type: 'boolean' } }, required: ['done'], additionalProperties: false }, model: 'haiku', effort: 'low' },
  )
}

// The completion contract: the loop cannot declare success while required
// verification fails on the final, post-land base. The last green checkpoint counts
// when the base has not moved since; otherwise the full gate runs once more here.
phase('Release')
const release = await agent(
  releasePrompt(pre, {
    baseRed,
    baseRedReason,
    needsGate: baseTip !== lastGreenSha,
    greenSha: lastGreenSha,
    smoke: Boolean(pre.browserTesting) && landed.length > 0,
    prune: landed.map((s) => s.branch).filter(Boolean),
  }),
  { label: 'release-verification', phase: 'Release', schema: RELEASE_SCHEMA },
)

// The recap is part of the contract (ADR-0022): where the work lives and the one
// next step, as data — the supervisor relays it, never reconstructs it.
const mode = POLICY.target ? 'consolidation' : 'trunk'
return {
  builds,
  stopReason,
  verified: !baseRed && (release?.verified ?? false),
  maxReached,
  target: { mode, base: pre.base, defaultBranch: pre.defaultBranch ?? '', headSha: release?.headSha ?? baseTip },
  baseRed: baseRed ? baseRedReason : null,
  checkpoints,
  nextStep:
    (mode === 'consolidation'
      ? `All campaign work is on ${pre.base}; ${pre.defaultBranch || 'the default branch'} is untouched. Release it with one PR ${pre.base} -> ${pre.defaultBranch || 'the default branch'} — cloud CI runs there, once — offer it, and open it only when the user says so.`
      : `Every landed ticket is live on ${pre.base}; nothing is left to integrate.`) +
    (baseRed
      ? ` The base is RED (${baseRedReason}): fix it by hand, then relaunch the loop with knownGreen set to the sha you verified — it adopts the held branches.`
      : held.length > 0
        ? ' Relaunch the loop (knownGreen: the last green sha) to land the held tickets.'
        : ''),
  release,
  landed: landed.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, mergeCommit: s.mergeCommit, branch: s.branch })),
  held: held.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, branch: s.branch })),
  parked: parked.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, branch: s.branch, failures: s.failures })),
  stuck: stuck.map((t) => ({
    ticket: t.number,
    title: t.title,
    blockedBy: t.blockedBy.filter((b) => !settled(b)),
  })),
  followUps: [...state.values()].flatMap((s) => s.punted),
}
