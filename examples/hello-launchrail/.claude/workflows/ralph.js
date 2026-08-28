// Managed by Launchrail. Do not hand-edit — `launchrail sync` may replace this file.
// Override policy per run via args instead, e.g. { width: 1, only: [9, 10], max: 5 }.
//
// The Ralph loop as a deterministic workflow: the plan, the frontier bookkeeping,
// and every intermediate report live in script variables — not in any context window —
// so long or wide runs cannot compact away their own state. This is the engine for
// every multi-ticket run (ADR-0022); the launch-ralph skill carries the same policy
// block as the supervisor's contract and the declared-exception watchable mode, and
// a policy change belongs in both places (ADR-0005, field-revised by ADR-0010, ADR-0022).
export const meta = {
  name: 'ralph',
  description: 'Autonomous Ralph loop: implement ready tickets with fresh-context subagents, verification-gated',
  whenToUse:
    'The engine for any multi-ticket Ralph run. Scope a run via args: { only: [9, 10], width: 2 }, just [9, 10], or { max: 5 } to stop after 5 verified merges ("the next five" — the frontier picks which, in dependency order). The front door consolidates by DEFAULT (ADR-0026): it passes { target: "spec/44-mvp" } to collect the campaign onto that branch (default branch untouched; released later by one offered PR). In a session pinned to a designated working branch (hosted sessions), the front door passes that branch as the target (ADR-0028). Omitting target is the explicit trunk opt-in — each ticket merged straight into the default branch. { canary: true } holds width at 1 until the first verified merge. Args must be JSON — resolve any natural-language scope to ticket numbers, a cap, and a target before launching. For a watchable run (an explicit user ask, or a targeted intervention), use the launch-ralph skill instead — and say why.',
  phases: [
    { title: 'Preflight', detail: 'read project config, resolve the integration target, run the verification gate' },
    { title: 'Graph', detail: 'list ready tickets and their blocking edges, verbatim' },
    { title: 'Build', detail: 'one fresh-context implementer per ticket, handing off at PR-open' },
    { title: 'Gate', detail: 'per-ticket merge gate: CI wait, squash-merge, explicit close' },
    { title: 'Verify', detail: 'remote ground truth for every claimed merge' },
    { title: 'Park', detail: 'comment failure history, label needs-info' },
    { title: 'Release', detail: 'final verification gate and the where-it-lives recap' },
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
  // Stop after this many verified merges (0 = no cap). "The next five": the frontier
  // decides which five, in dependency order. Batches never exceed the remainder, so a
  // run has at most `max` merges and leaves the rest of the frontier ready, not parked.
  max: A.max ?? 0,
  // Parallel implementers. Width also caps local build concurrency — several implementers
  // share one machine, and fanning out test runs buys backpressure, not speed. Use 1 until
  // a run has landed tickets cleanly on this project — or pass canary: true, which does it
  // for you. Tickets that add DB migrations collide on the next migration number when run
  // in parallel; the pre-PR sync renumbers, but serializing them is cheaper.
  width: A.width ?? 3,
  // Integration target. The front door consolidates by DEFAULT (ADR-0026): it resolves a
  // scope-native branch name and passes it here, so the campaign collects on that branch and
  // the default branch is never touched — the run ends by offering ONE release PR
  // target -> default. A session pinned to a designated working branch passes that
  // branch here (ADR-0028) — the pin re-targets the run, it never changes the engine. '' is the explicit trunk opt-in: each ticket PR merged straight into
  // the default branch; a bare launch with no target is therefore trunk mode — non-default.
  target: A.target ?? '',
  // Canary: hold width at 1 until the run's first verified merge proves the plumbing
  // end to end (branch, PR, CI, merge gate, close). For a project's first campaign.
  canary: A.canary ?? false,
  // Tries per ticket: 1 attempt + 1 retry with a fresh context, then park. Deferrals
  // (a declared blocker had not landed yet) hand their attempt back, capped separately.
  attempts: A.attempts ?? 2,
  // CI-wait re-polls for the merge gate — distinct from build attempts. A gate agent
  // gets one turn and cannot idle-wait (a background sleep never resumes it), so a PR
  // whose CI is still running comes back "ci-timeout": not done yet, not a failure.
  // The wait itself is pure reading, so it rides on cheap read-only small-model
  // watchers: up to this many watch turns before the ticket spends a fresh implementer
  // attempt, with the full gate recalled only once a watcher sees the run finish — a
  // slow CI must never cost a rebuild (ADR-0027), and waiting must never cost
  // full-model gate dispatches (ADR-0030). Concurrent tickets in the round supply the
  // wall-clock CI needs.
  gateWaits: A.gateWaits ?? 6,
  // Backstop against a graph that never drains; deferral rounds spend from this too.
  maxRounds: A.maxRounds ?? 25,
  // Re-read the tracker between rounds so externally closed tickets unblock things.
  refreshGraph: A.refreshGraph ?? true,
  // Stop starting new rounds when the remaining token budget drops below this — a round
  // that starts without enough budget to merge is worse than one that never starts.
  reserve: A.reserve ?? 200_000,
}

// ---------------------------------------------------------------------------
// Clauses carried verbatim in every dispatch, retries included.
// ---------------------------------------------------------------------------
const INTEGRITY = `INTEGRITY: No placeholders, no stubs, no "simplified for now". Never delete,
skip, or weaken a test to get a green run; if a test is genuinely wrong, fix it deliberately
and say so in the PR body. Never claim verification passed without having run it.`

const IDEMPOTENCY = `IDEMPOTENCY: This step can be replayed after an interruption, so check
before you act: if the ticket is already closed, report status "already-done" and stop; if a
ralph/<n>-* branch or an open PR for this ticket already exists, adopt it and continue from
where it left off — do not start over. Never open a second PR for the same ticket.`

// ---------------------------------------------------------------------------
// Schemas — stages return validated structure, never prose the script must parse.
// ---------------------------------------------------------------------------
const PREFLIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['green', 'base', 'defaultBranch', 'trackerAccess', 'verifyCommand', 'localCommands', 'failures'],
  properties: {
    green: { type: 'boolean', description: 'base is synced and the verification gate passed' },
    headSha: { type: 'string', description: 'commit sha the gate ran against' },
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
    verifyCommand: { type: 'string', description: 'the verification gate command, verbatim' },
    localCommands: {
      type: 'array',
      items: { type: 'string' },
      description: 'other verbatim local commands (install, typecheck, unit tests) implementers should use',
    },
    browserTesting: { type: 'boolean', description: '.launchrail.yml modules.browser-testing' },
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
        required: ['number', 'title', 'blockedByLine'],
        properties: {
          number: { type: 'integer' },
          title: { type: 'string' },
          blockedByLine: {
            type: 'string',
            description:
              'The ticket\'s "Blocked by" line copied VERBATIM (e.g. "**Blocked by:** #11, #9"), or "" if it has none. Do NOT interpret or resolve the edges — copy the characters; the caller parses the #n itself.',
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
      enum: ['pr-open', 'merged', 'already-done', 'blocked', 'conflict', 'verify-failed', 'failed'],
      description:
        '"pr-open" is the normal hand-off (the loop owns CI and merge); "merged" only when an adopted PR turned out to be merged already (idempotency)',
    },
    pr: { type: 'integer', description: 'PR number, when one was opened or adopted' },
    mergeCommit: { type: 'string' },
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

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary'],
  properties: {
    status: {
      type: 'string',
      enum: ['merged', 'ci-failed', 'ci-timeout', 'not-mergeable', 'failed'],
    },
    mergeCommit: { type: 'string' },
    issueClosed: { type: 'boolean' },
    summary: {
      type: 'string',
      description: 'on merged: the API facts; on failure: the failing check or conflicting files, enough for a fresh implementer to act on',
    },
  },
}

// The CI wait is pure reading, so it rides on the cheapest agent there is — a
// read-only small-model watcher with this tiny schema — never on a full merge-gate
// dispatch (ADR-0030). "running" keeps the watch going; "green"/"red" recalls the gate.
const CI_WATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ci', 'note'],
  properties: {
    ci: { type: 'string', enum: ['green', 'red', 'running'] },
    note: { type: 'string', description: 'on red: the failing check name(s); otherwise a short status' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['merged', 'issueClosed', 'evidence'],
  properties: {
    merged: {
      type: 'boolean',
      description: 'true only if the PR is merged AND its merge commit appears in the base branch history',
    },
    issueClosed: { type: 'boolean' },
    mergeCommit: { type: 'string' },
    evidence: { type: 'string', description: 'the API facts that establish the verdict' },
  },
}

const RELEASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verified', 'summary'],
  properties: {
    verified: { type: 'boolean', description: 'verification gate green on the final base' },
    headSha: { type: 'string' },
    smokeBundle: { type: 'string', description: 'path of the smoke evidence bundle, when one was produced' },
    summary: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

// ---------------------------------------------------------------------------
// Dispatch prompts
// ---------------------------------------------------------------------------
function preamble(pre) {
  return `You are working in a Launchrail project${pre.repo ? ` (${pre.repo})` : ''}; base branch: ${pre.base}.
Binding docs: AGENTS.md and CLAUDE.md, plus the vision, specs, and ADRs under docs/. Read them before touching code.
Tracker access from this environment: ${pre.trackerAccess}
Blocking edges live on tickets as "Blocked by: #n" lines.
Verbatim local commands: ${[...pre.localCommands, pre.verifyCommand].join(' ; ')}
The verification gate is: ${pre.verifyCommand} — a ticket is not done while it fails.
Several implementers share this machine — run single test files while iterating and save full runs for the gate.`
}

function buildPrompt(pre, ticket, attempt, priorFailure) {
  const retry =
    attempt > 1
      ? `\nThis is a RETRY with a fresh context. Prior attempt failed: ${priorFailure}
Start clean: delete the failed ralph/${ticket.number}-* branch first, re-sync the base, and take a different approach where the failure suggests one.\n`
      : ''
  return `${preamble(pre)}

Implement ticket #${ticket.number} ("${ticket.title}") through to an open PR. You own the build alone; assume no knowledge of any other session. Other implementers are working on other tickets against the same base right now, so ${pre.base} will move under you. That is expected.
${retry}
Steps, in order:
1. Dependency gate: before anything else, confirm every ticket on this ticket's "Blocked by" line is CLOSED with its work merged into ${pre.base}. If any blocker is still open, do NOT build on a missing dependency — report status "blocked", name the open blocker in "failure", and stop. That is a deferral, not a failure; the loop retries you after the blocker lands.
2. Read the ticket and everything it links (spec sections, ADRs, journeys). If the tracker tool truncates the body (long code spans are a known trigger), fetch the full text by another route — the tracker's search API, the spec file in the repo — and never implement from a truncated ticket. Report status "already-done" if the ticket is already closed.
3. Label the ticket ralph:building so a lost session leaves a trace.
4. Branch from a fresh sync of ${pre.base}: ralph/${ticket.number}-<short-slug>.
5. Implement by invoking the launch-ralph-implement skill — it owns the per-ticket contract: TDD, the verification gate, browser smoke for user-facing changes, self-review via /code-review, commit conventions.
6. Pre-PR sync: merge the latest ${pre.base} into your branch. Conflicts are ordinary work — resolve them with the launch-resolving-merge-conflicts skill. If ${pre.base} gained DB migrations since you branched, regenerate yours to follow them with the project's migration tool — never hand-edit the migration journal. Re-run the verification gate if anything changed.
7. Open a PR against ${pre.base}, titled from the ticket, with "Closes #${ticket.number}" in the body. Never open a second PR if one already exists — adopt it. Opening against an up-to-date base means CI tests the state that will actually land. Then report status "pr-open" with the PR number and STOP: the CI wait, the merge, and the issue close belong to the loop's merge gate, not to you — a subagent cannot wait on CI (a background sleep will not resume you). Never push to ${pre.base} directly; the PR is the only door.

${INTEGRITY}

${IDEMPOTENCY}

Report honestly via the schema: "pr-open" once the PR exists against ${pre.base}; "merged" only when an adopted PR turned out to be already merged; "blocked" when a declared blocker had not landed; "verify-failed" when the verification gate would not go green; "conflict" when a conflict was too ambiguous to resolve without losing behavior (say which files and why); "failed" otherwise, with a summary a fresh retry can act on. List deliberately-out-of-scope discoveries in "punted".`
}

function gatePrompt(pre, ticket, build, waited = 0) {
  return `You are the merge gate for ticket #${ticket.number}: PR #${build.pr} is open against ${pre.base}.
Tracker access from this environment: ${pre.trackerAccess}
You own the CI wait, the squash-merge, and the tracker bookkeeping — and nothing else. You never write code, never push commits, never repair a failing branch; a failing PR is reported, not fixed here.
${waited > 0 ? `The CI was still running when the gate last looked; a cheap read-only watcher has been polling since (${waited} watch turn(s)) and reports the run has finished. Start again from step 1 and act on what the API shows NOW — never on the watcher's word.\n` : ''}1. Check the PR's CI, if the repository has it. You have ONE turn and cannot idle-wait — a background sleep will not resume you, so do NOT try to sit on a long wait. Poll a handful of times, spacing the checks with the Monitor tool (never a bare sleep, never a busy loop), across the minute or two you can cover, then act on what you see: green → step 2; still in progress when your turn is ending → report status "ci-timeout" and STOP. A "ci-timeout" is not a failure — the loop hands the wait to a cheap read-only watcher and recalls you once CI lands; never merge on a run that has not finished green.
2. CI green (or absent): check mergeability against ${pre.base} — the base may have moved since CI started. Mergeable: squash-merge via the tracker API; if the base moves between check and merge, re-check and retry up to 3 times. A real conflict is status "not-mergeable" — name the conflicting files if the API reports them.
3. Merged: read issue #${ticket.number} back and close it explicitly if it is still open — "Closes #n" only auto-fires from the default branch${POLICY.target ? ', and this run does not merge there' : ', and squash-merge does not reliably fire it even there'} — then remove the ralph:building label. Report status "merged" with the merge commit sha.
4. CI failed on the PR: report status "ci-failed" with the failing check and a summary a fresh implementer can act on. Fix nothing.`
}

// The watcher's whole job is to be cheap: it reads CI state and nothing else, so the
// prompt stays minimal — no project preamble, no merge steps, no tracker bookkeeping.
function ciWatchPrompt(pre, ticket, build, waited) {
  return `Watch CI for PR #${build.pr}${pre.repo ? ` in ${pre.repo}` : ''} (ticket #${ticket.number}, base ${pre.base}). READ-ONLY: you never merge, comment, label, push, or write anything.
Tracker access from this environment: ${pre.trackerAccess}
This is watch turn ${waited}/${POLICY.gateWaits}; the merge gate returns the moment you see a finished run. You have ONE turn and cannot idle-wait (a background sleep will not resume you): poll the PR's checks a handful of times, spacing the polls with the Monitor tool (never a bare sleep, never a busy loop) to cover as much of the turn as you can, then report exactly what the API shows:
- every check completed and none failed (or the repository runs no CI on PRs) → ci: "green"
- at least one check completed as failed → ci: "red", naming the failing check(s) in note
- anything still queued or in progress as your turn ends → ci: "running"
Never guess a verdict from an unfinished run — "running" is always the honest fallback.`
}

function verifyPrompt(pre, ticket, build) {
  return `Establish ground truth for ticket #${ticket.number} using the tracker API only.
Tracker access: ${pre.trackerAccess}
An implementer claims it merged via PR #${build.pr}${build.mergeCommit ? ` (merge commit ${build.mergeCommit})` : ''}.
Check, against the remote: (1) the PR exists and is merged; (2) its merge commit actually appears in ${pre.base}'s history; (3) the issue is closed.
Report merged: true only when (1) and (2) both hold. A PR description or comment is NOT evidence — only API state counts. Do not run local git, do not use a shell. Fix nothing, close nothing; report only.`
}

const graphPrompt = (pre) => `List the open, ready tickets for a Ralph loop run. Change nothing on the tracker.
Tracker access: ${pre.trackerAccess}
Include every open ticket labeled ready-for-agent, excluding any labeled needs-info.
An open issue wearing ready-for-agent that is plainly not an implementable ticket — a published spec, research notes, an epic — is a labeling error: leave it out of tickets and report its number in notTickets instead. When in doubt, include it as a ticket.
For each, report its number, its exact title, and its "Blocked by" line copied VERBATIM (the whole line, e.g. "**Blocked by:** #11, #9"), or "" when it has none. If the tracker records blocking through native relations instead of a body line, render those relations as one "Blocked by: #n, #m" line and nothing else.
Do NOT interpret, resolve, or filter the edges — copy the characters and let the caller parse the #n. Getting a blocker wrong dispatches a ticket before its dependency lands.`

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
    blockedBy: [...(t.blockedByLine ?? '').matchAll(/#(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n !== t.number),
  }))
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
const state = new Map() // number -> { ticket, attempts, defers, failures[], status, pr, mergeCommit, punted[] }

function entry(ticket) {
  if (!state.has(ticket.number)) {
    state.set(ticket.number, { ticket, attempts: 0, defers: 0, failures: [], status: 'pending', punted: [] })
  }
  return state.get(ticket.number)
}

async function drive(pre, ticket) {
  const s = entry(ticket)
  s.attempts += 1
  const build = await agent(buildPrompt(pre, ticket, s.attempts, s.failures.join(' | ')), {
    label: `build:#${ticket.number}${s.attempts > 1 ? ':retry' : ''}`,
    phase: 'Build',
    schema: BUILD_SCHEMA,
    isolation: 'worktree', // parallel implementers must never fight over one checkout
  })
  if (!build) {
    s.failures.push('implementer died (infrastructure)')
    return { ticket, ok: false, dead: true }
  }
  s.punted.push(...(build.punted ?? []))
  if (build.status === 'already-done') {
    s.status = 'merged'
    return { ticket, ok: true }
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
  if (build.status !== 'pr-open' && build.status !== 'merged') {
    s.failures.push(`[attempt ${s.attempts}] ${build.status}: ${build.failure ?? build.summary}`)
    return { ticket, ok: false }
  }
  if (!build.pr) {
    s.failures.push(`[attempt ${s.attempts}] reported ${build.status} but returned no PR number`)
    return { ticket, ok: false }
  }
  let mergeCommit = build.mergeCommit
  if (build.status === 'pr-open') {
    // The loop owns the merge gate (ADR-0022): an implementer cannot wait on CI (a
    // subagent's background sleep never resumes it), and a single gate owner keeps
    // merge ordering sane. A failing gate hands the ticket back as a failed attempt;
    // the fresh retry adopts the PR via the idempotency clause, repairs, hands off again.
    //
    // But the gate agent cannot idle-wait either — given one turn it can only poll CI a
    // few times, so a PR whose CI is still running comes back "ci-timeout": not done
    // yet, not a failure of the code. Waiting is pure reading, so the wait rides on
    // cheap read-only small-model watchers (up to POLICY.gateWaits turns, shared across
    // the whole wait) and the full gate is recalled only once a watcher sees the run
    // finish — a slow CI can never cost a full rebuild (ADR-0027), and the wait itself
    // never costs full-model gate dispatches (ADR-0030). Only a real verdict — merged,
    // ci-failed, not-mergeable — leaves the loop early; a CI that never lands still
    // parks the ticket once the watch turns run out.
    let gate
    let waited = 0
    for (;;) {
      gate = await agent(gatePrompt(pre, ticket, build, waited), {
        label: `gate:#${ticket.number}${waited > 0 ? `:ci-done${waited}` : ''}`,
        phase: 'Gate',
        schema: GATE_SCHEMA,
        effort: 'low',
      })
      if (!gate) {
        s.failures.push('gate agent died (infrastructure)')
        return { ticket, ok: false, dead: true }
      }
      if (gate.status !== 'ci-timeout' || waited >= POLICY.gateWaits) break
      let watch = null
      while (waited < POLICY.gateWaits) {
        waited += 1
        log(`#${ticket.number}: CI still running on PR #${build.pr} — cheap watch (${waited}/${POLICY.gateWaits})`)
        watch = await agent(ciWatchPrompt(pre, ticket, build, waited), {
          label: `gate:#${ticket.number}:ci-wait${waited}`,
          phase: 'Gate',
          schema: CI_WATCH_SCHEMA,
          model: 'haiku',
          effort: 'low',
        })
        // A dead watcher costs one watch turn, never the run; "running" keeps watching.
        if (watch && watch.ci !== 'running') break
      }
      // Watch turns spent with CI still unfinished: keep the gate's honest "ci-timeout"
      // verdict and fall through to the unchanged attempt/park safety net.
      if (!watch || watch.ci === 'running') break
    }
    if (gate.status !== 'merged') {
      s.failures.push(`[attempt ${s.attempts}] PR #${build.pr} ${gate.status}: ${gate.summary}`)
      return { ticket, ok: false }
    }
    mergeCommit = gate.mergeCommit || mergeCommit
  }
  // Nothing is trusted from a report — a claimed merge is checked against the remote
  // by a separate, cheap agent with tracker access only.
  const verdict = await agent(verifyPrompt(pre, ticket, { pr: build.pr, mergeCommit }), {
    label: `verify:#${ticket.number}`,
    phase: 'Verify',
    schema: VERIFY_SCHEMA,
    model: 'haiku',
    effort: 'low',
  })
  if (verdict?.merged && verdict.issueClosed) {
    s.status = 'merged'
    s.pr = build.pr
    s.mergeCommit = verdict.mergeCommit || mergeCommit
    return { ticket, ok: true }
  }
  // Merged-but-issue-open fails verification too: the retry adopts the merged PR (the
  // idempotency clause), closes the issue explicitly, and the ticket settles cleanly.
  s.failures.push(
    `[attempt ${s.attempts}] claimed merged, remote disagrees: ${verdict ? verdict.evidence : 'verifier died'}`,
  )
  return { ticket, ok: false }
}

// A ticket is ready when it isn't settled, hasn't exhausted its attempts, every blocker
// is closed-before-the-run or merged-by-us, and no blocker is parked. Pure code — the
// orchestrator never asks a subagent what's ready. The implementer's dependency gate is
// the backstop for what this check cannot see (a blocker that is open but never entered
// the ready set).
function frontier(tickets, closedBefore) {
  return tickets.filter((t) => {
    const s = entry(t)
    if (s.status !== 'pending') return false
    if (s.attempts >= POLICY.attempts) return false
    if (POLICY.only.length > 0 && !POLICY.only.includes(t.number)) return false
    return t.blockedBy.every((b) => {
      if (closedBefore.has(b)) return true
      const blocker = state.get(b)
      return blocker !== undefined && blocker.status === 'merged'
    })
  })
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
phase('Preflight')
const pre = await agent(
  `Preflight for a Ralph loop run in this repository. Report actual state; fix nothing — the one permitted mutation is creating the declared integration branch in step 2.
1. Read .launchrail.yml (issueTracker, testing commands, modules) and AGENTS.md (verbatim commands).
2. Identify the repo (git remote) and its default branch; report the default branch name as defaultBranch. ${
    POLICY.target
      ? `This run consolidates onto the integration branch "${POLICY.target}" — that branch is the base. If it does not exist on the remote, create it from the default branch's tip (no force; the default branch itself is never touched) and report targetCreated: true. A missing DEFAULT branch is still not green — do not guess.`
      : `This run merges into the default branch (trunk) — that branch is the base. If it does not exist on the remote, report not green and say the base is missing — do not guess another branch.`
  } Sync the base fresh (clean tree) and report its name as base.
3. Determine how the tracker is reachable from THIS environment: check whether the CLI the project docs assume (e.g. gh) is installed; if not, name the concrete substitute available here (e.g. GitHub MCP tools) as an instruction future agents can follow.
4. Run the project's install command, then the verification gate: npx @wemuda/launchrail verify. Report the actual exit codes, not the reassuring summary line. An empty verification contract failing the gate is a refusal condition, not something to work around.
green means: base synced AND the verification gate exited 0.`,
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

phase('Graph')
log(
  `Base green at ${pre.headSha ?? pre.base} on ${pre.base}. ` +
    (POLICY.target
      ? `Consolidating onto ${pre.base}${pre.targetCreated ? ' (created from the default branch tip)' : ''}; ${pre.defaultBranch || 'the default branch'} stays untouched. `
      : `Trunk mode — each ticket merges into ${pre.base}. `) +
    (POLICY.only.length > 0
      ? `Scoped to ${POLICY.only.map((n) => `#${n}`).join(', ')}.`
      : 'No scope — building the whole ready frontier.') +
    (POLICY.max > 0 ? ` Stopping after ${POLICY.max} verified merge(s).` : '') +
    ` Width ${POLICY.width}${POLICY.canary ? ' (canary: width 1 until the first verified merge)' : ''}, ${POLICY.attempts} attempts per ticket.`,
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

const mergedCount = () => [...state.values()].filter((s) => s.status === 'merged').length

let rounds = 0
let maxReached = false
while (rounds < POLICY.maxRounds) {
  if (budget.total && budget.remaining() < POLICY.reserve) {
    log(`token budget at reserve (${Math.round(budget.remaining() / 1000)}k left) — stopping before a new round`)
    break
  }
  // The cap counts verified merges only — a failed or deferred dispatch frees its slot
  // for a different ticket next round. Capping the batch at the remainder means even a
  // fully successful round cannot overshoot.
  const capLeft = POLICY.max > 0 ? POLICY.max - mergedCount() : Infinity
  if (capLeft <= 0) {
    maxReached = true
    log(`cap reached: ${POLICY.max} verified merge(s) — stopping; the rest of the frontier stays ready`)
    break
  }
  const ready = frontier(tickets, closedBefore)
  if (ready.length === 0) break
  rounds += 1
  // Canary: the first verified merge proves the plumbing end to end (branch, PR, CI,
  // merge gate, explicit close); until it lands, dispatch one ticket at a time.
  const width = POLICY.canary && mergedCount() === 0 ? 1 : POLICY.width
  const batch = ready.slice(0, Math.min(width, capLeft))
  log(`round ${rounds}: dispatching ${batch.map((t) => `#${t.number}`).join(', ')} (${ready.length} unblocked)`)
  const results = await parallel(batch.map((t) => () => drive(pre, t)))
  const landed = results.filter((r) => r?.ok)
  for (const r of results.filter((x) => x?.deferred)) {
    log(`#${r.ticket.number} deferred (blocker not landed yet): ${r.why}`)
  }
  if (results.every((r) => !r || r.dead)) {
    log('every agent in the round died — infrastructure, not tickets; stopping the run')
    break
  }
  for (const t of batch) {
    const s = entry(t)
    if (s.status !== 'merged' && s.attempts >= POLICY.attempts) s.status = 'parked'
  }
  log(`round ${rounds}: ${landed.length}/${batch.length} verified merged`)
  if (POLICY.refreshGraph && frontier(tickets, closedBefore).length > 0) {
    graph = await agent(graphPrompt(pre), { label: `read-graph:r${rounds}`, phase: 'Graph', schema: GRAPH_SCHEMA, model: 'haiku', effort: 'low' })
    if (graph) {
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
        if (!still && (!s || (s.status === 'pending' && s.attempts === 0))) {
          entry(t).status = 'external'
          closedBefore.add(t.number)
        }
      }
    }
  }
}

const merged = [...state.values()].filter((s) => s.status === 'merged')
const parked = [...state.values()].filter((s) => s.status === 'parked')
const stuck = tickets.filter((t) => {
  const s = state.get(t.number)
  return !s || s.status === 'pending'
})
const settledNumber = (b) => closedBefore.has(b) || state.get(b)?.status === 'merged'

phase('Park')
if (parked.length > 0) {
  await agent(
    `On the tracker (${pre.trackerAccess}), for each of these parked tickets: post one comment containing its accumulated failure history verbatim, remove the ralph:building label if present, and add the needs-info label. Change nothing else. Fix nothing.
${parked.map((s) => `#${s.ticket.number} (${s.ticket.title}): ${s.failures.join(' | ')}`).join('\n')}`,
    { label: 'park', phase: 'Park', schema: { type: 'object', properties: { done: { type: 'boolean' } }, required: ['done'], additionalProperties: false }, model: 'haiku', effort: 'low' },
  )
}

// The completion contract: the loop cannot declare success while required
// verification fails on the final, post-merge base.
phase('Release')
const release = await agent(
  `Release verification for a finished Ralph loop run. Fix nothing.
1. Sync a fresh ${pre.base} and record its head sha.
2. Run the verification gate: npx @wemuda/launchrail verify. Report the actual exit code.
${
    pre.browserTesting && merged.length > 0
      ? `3. The browser-testing module is enabled: start the app (node scripts/dev.mjs --background), scaffold an evidence bundle (npx @wemuda/launchrail smoke), and drive the smoke journeys from docs/testing/smoke-journeys.md per the launch-browser-smoke skill. Report the bundle path. A journey you could not complete is a failure, never a pass.`
      : ''
  }
verified means: the verification gate exited 0${pre.browserTesting && merged.length > 0 ? ' AND no smoke journey failed' : ''}.`,
  { label: 'release-verification', phase: 'Release', schema: RELEASE_SCHEMA },
)

// The recap is part of the contract (ADR-0022): where the work lives and the one
// next step, as data — the supervisor relays it, never reconstructs it.
const mode = POLICY.target ? 'consolidation' : 'trunk'
return {
  rounds,
  verified: release?.verified ?? false,
  maxReached,
  target: { mode, base: pre.base, defaultBranch: pre.defaultBranch ?? '', headSha: release?.headSha ?? '' },
  nextStep:
    mode === 'consolidation'
      ? `All campaign work is on ${pre.base}; ${pre.defaultBranch || 'the default branch'} is untouched. Release it with one PR ${pre.base} -> ${pre.defaultBranch || 'the default branch'} — offer it, and open it only when the user says so.`
      : `Every merged ticket is live on ${pre.base}; nothing is left to integrate.`,
  release,
  merged: merged.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, pr: s.pr, mergeCommit: s.mergeCommit })),
  parked: parked.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, failures: s.failures })),
  stuck: stuck.map((t) => ({
    ticket: t.number,
    title: t.title,
    blockedBy: t.blockedBy.filter((b) => !settledNumber(b)),
  })),
  followUps: [...state.values()].flatMap((s) => s.punted),
}
