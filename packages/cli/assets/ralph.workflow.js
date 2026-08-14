// Managed by Launchrail. Do not hand-edit — `launchrail sync` may replace this file.
// Override policy per run via args instead, e.g. { width: 1, only: [9, 10], max: 5 }.
//
// The Ralph loop as a deterministic workflow: the plan, the frontier bookkeeping,
// and every intermediate report live in script variables — not in any context window —
// so long or wide runs cannot compact away their own state. The watchable, checkpointed
// variant of the same loop is the launch-ralph skill; the two share one policy block,
// and a policy change belongs in both places (ADR-0005, field-revised by ADR-0010).
export const meta = {
  name: 'ralph',
  description: 'Autonomous Ralph loop: implement ready tickets with fresh-context subagents, verification-gated',
  whenToUse:
    'Run the Ralph implementation loop over the ticket backlog when the dependency graph is wide or the run is long. Scope a run via args: { only: [9, 10], width: 2 }, just [9, 10], or { max: 5 } to stop after 5 verified merges ("the next five" — the frontier picks which, in dependency order). Args must be JSON — resolve any natural-language scope to ticket numbers and a cap before launching. For a watchable, checkpointed run (or when something is already going wrong), use the launch-ralph skill instead.',
  phases: [
    { title: 'Preflight', detail: 'read project config, sync the base, run the verification gate' },
    { title: 'Graph', detail: 'list ready tickets and their blocking edges, verbatim' },
    { title: 'Build', detail: 'one fresh-context implementer per ticket, merge included' },
    { title: 'Verify', detail: 'remote ground truth for every claimed merge' },
    { title: 'Park', detail: 'comment failure history, label needs-info' },
    { title: 'Release', detail: 'final verification gate and evidence summary' },
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
  // a run has landed tickets cleanly on this project.
  width: A.width ?? 3,
  // Tries per ticket: 1 attempt + 1 retry with a fresh context, then park. Deferrals
  // (a declared blocker had not landed yet) hand their attempt back, capped separately.
  attempts: A.attempts ?? 2,
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
  required: ['green', 'base', 'trackerAccess', 'verifyCommand', 'localCommands', 'failures'],
  properties: {
    green: { type: 'boolean', description: 'base is synced and the verification gate passed' },
    headSha: { type: 'string', description: 'commit sha the gate ran against' },
    repo: { type: 'string', description: 'owner/name from the git remote, or empty' },
    base: { type: 'string', description: 'default branch name' },
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
      enum: ['merged', 'already-done', 'blocked', 'ci-red', 'ci-timeout', 'conflict', 'verify-failed', 'failed'],
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

Implement ticket #${ticket.number} ("${ticket.title}") end to end — merge included. You own it alone; assume no knowledge of any other session. Other implementers are working on other tickets against the same base right now, so ${pre.base} will move under you. That is expected.
${retry}
Steps, in order:
1. Dependency gate: before anything else, confirm every ticket on this ticket's "Blocked by" line is CLOSED with its work merged into ${pre.base}. If any blocker is still open, do NOT build on a missing dependency — report status "blocked", name the open blocker in "failure", and stop. That is a deferral, not a failure; the loop retries you after the blocker lands.
2. Read the ticket and everything it links (spec sections, ADRs, journeys). Report status "already-done" if it is already closed.
3. Label the ticket ralph:building so a lost session leaves a trace.
4. Branch from a fresh sync of ${pre.base}: ralph/${ticket.number}-<short-slug>.
5. Implement by invoking the launch-ralph-implement skill — it owns the per-ticket contract: TDD, the verification gate, browser smoke for user-facing changes, self-review via /code-review, commit conventions.
6. Pre-PR sync: merge the latest ${pre.base} into your branch. Conflicts are ordinary work — resolve them with the launch-resolving-merge-conflicts skill and re-run the verification gate if anything changed.
7. Open a PR titled from the ticket, with "Closes #${ticket.number}" in the body. Never open a second PR if one already exists — adopt it. Opening against an up-to-date base means CI tests the state that will actually land.
8. Wait for CI if the repository has it, spacing polls with the Monitor tool or a background sleep — never a foreground sleep, never a busy loop; treat ~20 minutes as the budget and report status "ci-timeout" beyond it. Fix what your branch broke and push. If a failure reproduces on ${pre.base} itself, report "ci-red" and stop — that is systemic, not this ticket's problem.
9. Immediately before merging, re-sync with ${pre.base} once more (retry up to 3 times if the base keeps moving), then squash-merge. Squash-merge does not reliably fire "Closes" — read the issue back, close it explicitly if it is still open, and remove the ralph:building label. Never push to ${pre.base} directly; the PR is the only door.

${INTEGRITY}

${IDEMPOTENCY}

Report honestly via the schema: "merged" only after the squash-merge API call succeeded; "blocked" when a declared blocker had not landed; "verify-failed" when the verification gate would not go green; "conflict" when a conflict was too ambiguous to resolve without losing behavior (say which files and why); "ci-red" / "ci-timeout" / "failed" otherwise, with a summary a fresh retry can act on. List deliberately-out-of-scope discoveries in "punted".`
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

// A compact ASCII dependency graph of the scoped frontier, logged before the first
// dispatch so even a headless run shows the plan (the format launch-implement documents:
// tiers by dependency depth, "<-" open blockers, "->" what each ticket unblocks). Pure
// string work — no clock, no randomness — so a resumed run renders identically. Edges to
// tickets outside this set are treated as settled, exactly as the frontier computation does.
function renderGraph(tickets) {
  if (tickets.length === 0) return 'Dependency graph: no ready tickets in scope.'
  const present = new Set(tickets.map((t) => t.number))
  const within = (t) => t.blockedBy.filter((b) => present.has(b))
  const unblocks = (n) => tickets.filter((t) => t.blockedBy.includes(n)).map((t) => t.number)
  const clip = (s) => (s.length > 30 ? `${s.slice(0, 29)}…` : s).padEnd(30)
  const tierOf = new Map()
  let remaining = tickets.slice()
  let tier = 0
  while (remaining.length > 0) {
    const ready = remaining.filter((t) => within(t).every((b) => tierOf.has(b)))
    if (ready.length === 0) break // cycle or unresolved edge — bucket the rest below
    for (const t of ready) tierOf.set(t.number, tier)
    remaining = remaining.filter((t) => !tierOf.has(t.number))
    tier += 1
  }
  const lines = [`Dependency graph — ${tickets.length} ready ticket(s) in scope:`]
  for (let i = 0; i < tier; i += 1) {
    lines.push('', i === 0 ? 'Tier 1 — buildable now' : `Tier ${i + 1} — after tier ${i}`)
    for (const t of tickets.filter((x) => tierOf.get(x.number) === i)) {
      const ann = [
        within(t).length ? `<- ${within(t).map((b) => `#${b}`).join(', ')}` : '',
        unblocks(t.number).length ? `-> ${unblocks(t.number).map((b) => `#${b}`).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('   ')
      lines.push(`  #${t.number}  ${clip(t.title)} ${ann}`.trimEnd())
    }
  }
  if (remaining.length > 0) {
    lines.push('', `Unresolved (cycle or missing edge): ${remaining.map((t) => `#${t.number}`).join(', ')}`)
  }
  return lines.join('\n')
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
  if (build.status !== 'merged') {
    s.failures.push(`[attempt ${s.attempts}] ${build.status}: ${build.failure ?? build.summary}`)
    return { ticket, ok: false }
  }
  if (!build.pr) {
    s.failures.push(`[attempt ${s.attempts}] reported merged but returned no PR number`)
    return { ticket, ok: false }
  }
  // Nothing is trusted from a report — a claimed merge is checked against the remote
  // by a separate, cheap agent with tracker access only.
  const verdict = await agent(verifyPrompt(pre, ticket, build), {
    label: `verify:#${ticket.number}`,
    phase: 'Verify',
    schema: VERIFY_SCHEMA,
    model: 'haiku',
    effort: 'low',
  })
  if (verdict?.merged && verdict.issueClosed) {
    s.status = 'merged'
    s.pr = build.pr
    s.mergeCommit = verdict.mergeCommit || build.mergeCommit
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
  `Preflight for a Ralph loop run in this repository. Fix nothing; report actual state.
1. Read .launchrail.yml (issueTracker, testing commands, modules) and AGENTS.md (verbatim commands).
2. Identify the repo (git remote) and the default/base branch; sync it fresh (clean tree). If the base branch does not exist on the remote, report not green and say the base is missing — do not guess another branch.
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
    (POLICY.only.length > 0
      ? `Scoped to ${POLICY.only.map((n) => `#${n}`).join(', ')}.`
      : 'No scope — building the whole ready frontier.') +
    (POLICY.max > 0 ? ` Stopping after ${POLICY.max} verified merge(s).` : '') +
    ` Width ${POLICY.width}, ${POLICY.attempts} attempts per ticket.`,
)
let graph = await agent(graphPrompt(pre), { label: 'read-graph', phase: 'Graph', schema: GRAPH_SCHEMA, model: 'haiku', effort: 'low' })
if (!graph) throw new Error('graph agent died — refusing to start')
warnNotTickets(graph)
let tickets = parseGraph(graph)
log(`${tickets.length} ready ticket(s) on the tracker`)
log(renderGraph(POLICY.only.length > 0 ? tickets.filter((t) => POLICY.only.includes(t.number)) : tickets))

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
  const batch = ready.slice(0, Math.min(POLICY.width, capLeft))
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

return {
  rounds,
  verified: release?.verified ?? false,
  maxReached,
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
