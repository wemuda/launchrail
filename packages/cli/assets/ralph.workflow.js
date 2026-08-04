// Managed by Launchrail. Do not hand-edit — `launchrail sync` may replace this file.
// Override policy per run via args instead, e.g. { width: 1, only: [9, 10] }.
//
// The Ralph campaign as a deterministic workflow: the plan, the frontier bookkeeping,
// and every intermediate report live in script variables — not in any context window —
// so long or wide runs cannot compact away their own state. The watchable, checkpointed
// variant of the same loop is the launchrail:ralph skill; the two share one policy block,
// and a policy change belongs in both places.
export const meta = {
  name: 'ralph',
  description: 'Autonomous Ralph campaign: implement ready tickets with fresh-context subagents, verification-gated',
  whenToUse:
    'Run a Ralph implementation campaign over the ticket backlog when the dependency graph is wide or the run is long. For a watchable, checkpointed run (or when something is already going wrong), use the launchrail:ralph skill instead.',
  phases: [
    { title: 'Preflight', detail: 'read project config, sync the base, run the verification gate' },
    { title: 'Graph', detail: 'list ready tickets and their blocking edges' },
    { title: 'Build', detail: 'one fresh-context implementer per ticket, merge included' },
    { title: 'Verify', detail: 'remote ground truth for every claimed merge' },
    { title: 'Park', detail: 'comment failure history, label needs-info' },
    { title: 'Release', detail: 'final verification gate and evidence summary' },
  ],
}

// ---------------------------------------------------------------------------
// Policy — the launchrail:ralph policy block, as code. Override via args.
// ---------------------------------------------------------------------------
const A = args && !Array.isArray(args) ? args : {}
const POLICY = {
  // Scope the run to specific ticket numbers ([] = whole ready frontier).
  // Shorthand: a bare array as args, e.g. args: [9, 10].
  only: Array.isArray(args) ? args : (A.only ?? []),
  // Parallel implementers. Width multiplies conflict rate and local load, not just
  // throughput — use 1 until a campaign has landed tickets cleanly on this project.
  width: A.width ?? 2,
  // Tries per ticket: 1 attempt + 1 retry with a fresh context, then park.
  attempts: A.attempts ?? 2,
  // Backstop against a graph that never drains.
  maxRounds: A.maxRounds ?? 10,
  // Re-read the tracker between rounds so externally closed tickets unblock things.
  refreshGraph: A.refreshGraph ?? true,
  // Stop starting new rounds when the remaining token budget drops below this.
  reserve: A.reserve ?? 50_000,
}

// ---------------------------------------------------------------------------
// Clauses carried verbatim in every dispatch, retries included.
// ---------------------------------------------------------------------------
const INTEGRITY = `INTEGRITY: No placeholders, no stubs, no "simplified for now". Never delete,
skip, or weaken a test to get a green run; if a test is genuinely wrong, fix it deliberately
and say so in the PR body. Never claim verification passed without having run it.`

const IDEMPOTENCY = `IDEMPOTENCY: Before starting, check whether the ticket is already closed
(if so, report status "already-done" and stop) and whether a ralph/<n>-* branch or an open PR
for this ticket already exists (if so, adopt it and continue from where it left off — do not
start over). Never open a second PR for the same ticket.`

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
        required: ['number', 'title', 'blockedBy'],
        properties: {
          number: { type: 'integer' },
          title: { type: 'string' },
          blockedBy: {
            type: 'array',
            items: { type: 'integer' },
            description: 'raw blocking edges as written on the ticket; do not filter or resolve them',
          },
        },
      },
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
      enum: ['merged', 'already-done', 'ci-red', 'ci-timeout', 'conflict', 'verify-failed', 'failed'],
    },
    pr: { type: 'integer', description: 'PR number, when one was opened or adopted' },
    mergeCommit: { type: 'string' },
    summary: { type: 'string', description: 'what happened, short; on failure, enough for a retry to act on' },
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
    merged: { type: 'boolean' },
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

Implement ticket #${ticket.number} ("${ticket.title}") end to end — merge included. You own it alone; assume no knowledge of any other session.
${retry}
Steps, in order:
1. Read the ticket and everything it links (spec sections, ADRs, journeys). Report status "already-done" if it is already closed.
2. Label the ticket ralph:building.
3. Branch from a fresh sync of ${pre.base}: ralph/${ticket.number}-<short-slug>.
4. Implement by invoking the launchrail:ralph-implement skill — it owns the per-ticket contract: TDD, the verification gate, browser smoke for user-facing changes, self-review via /code-review, commit conventions.
5. Pre-PR sync: merge the latest ${pre.base} into your branch. Conflicts are ordinary work — resolve them with the launchrail:resolving-merge-conflicts skill and re-run the verification gate if anything changed.
6. Open a PR titled from the ticket, with "Closes #${ticket.number}" in the body. Never open a second PR if one already exists — adopt it.
7. Wait for CI if the repository has it (fix failures on your branch; treat ~20 minutes as the budget and report status "ci-timeout" beyond it). Immediately before merging, re-sync with ${pre.base} once more (retry up to 3 times if the base keeps moving), then squash-merge. Squash-merge does not reliably fire "Closes" — read the issue back and close it explicitly if it is still open.

${INTEGRITY}

${IDEMPOTENCY}

Report honestly via the schema: "merged" only after the squash-merge API call succeeded; "verify-failed" when the verification gate would not go green; "conflict" when a conflict was too ambiguous to resolve without losing behavior (say which files and why); "ci-red" / "ci-timeout" / "failed" otherwise, with a summary a fresh retry can act on. List deliberately-out-of-scope discoveries in "punted".`
}

function verifyPrompt(pre, ticket, build) {
  return `Establish ground truth for ticket #${ticket.number} using the tracker API only.
Tracker access: ${pre.trackerAccess}
An implementer claims it merged${build.pr ? ` via PR #${build.pr}` : ''}${build.mergeCommit ? ` (merge commit ${build.mergeCommit})` : ''}.
Check, against the remote: (1) the PR exists and is merged into ${pre.base}; (2) the issue is closed.
A PR description or comment is NOT evidence — only API state counts. Do not run local git. Fix nothing, close nothing; report only.`
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
const state = new Map() // number -> { ticket, attempts, failures[], status, pr, mergeCommit, punted[] }

function entry(ticket) {
  if (!state.has(ticket.number)) {
    state.set(ticket.number, { ticket, attempts: 0, failures: [], status: 'pending', punted: [] })
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
  if (build.status !== 'merged') {
    s.failures.push(`${build.status}: ${build.summary}`)
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
  if (verdict?.merged) {
    s.status = 'merged'
    s.pr = build.pr
    s.mergeCommit = verdict.mergeCommit || build.mergeCommit
    if (!verdict.issueClosed) log(`#${ticket.number} merged but issue still open — flagged in the report`)
    return { ticket, ok: true, issueClosed: verdict?.issueClosed ?? false }
  }
  s.failures.push(`claimed merged, remote disagrees: ${verdict ? verdict.evidence : 'verifier died'}`)
  return { ticket, ok: false }
}

// A ticket is ready when it isn't settled, hasn't exhausted its attempts, every blocker
// is closed-before-the-run or merged-by-us, and no blocker is parked. Pure code — the
// orchestrator never asks a subagent what's ready.
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
  `Preflight for a Ralph campaign in this repository. Fix nothing; report actual state.
1. Read .launchrail.yml (issueTracker, testing commands, modules) and AGENTS.md (verbatim commands).
2. Identify the repo (git remote) and the default/base branch; sync it fresh.
3. Determine how the tracker is reachable from THIS environment: check whether the CLI the project docs assume (e.g. gh) is installed; if not, name the concrete substitute available here (e.g. GitHub MCP tools) as an instruction future agents can follow.
4. Run the project's install command, then the verification gate: npx @wemuda/launchrail verify. Report the real exit status. An empty verification contract failing the gate is a refusal condition, not something to work around.
green means: base synced AND the verification gate exited 0.`,
  { label: 'preflight', phase: 'Preflight', schema: PREFLIGHT_SCHEMA },
)
if (!pre) throw new Error('preflight agent died — refusing to start')
if (!pre.green) {
  // A broken base poisons every implementer after it; a campaign that starts red
  // can only end with unverifiable results.
  return { refused: true, reason: 'preflight not green', failures: pre.failures }
}
if ((pre.issueTracker ?? 'none') === 'none') {
  return { refused: true, reason: 'no issue tracker configured (.launchrail.yml issueTracker: none) — Ralph needs tickets' }
}

phase('Graph')
const graphPrompt = `List the open, ready tickets for a Ralph campaign.
Tracker access: ${pre.trackerAccess}
Include every open ticket labeled ready-for-agent, excluding any labeled needs-info.
For each, report its number, exact title, and raw blocking edges ("Blocked by: #n" lines in the body, or the tracker's native blocking relations). Report edges as written — do not resolve or filter them. Change nothing on the tracker.`
let graph = await agent(graphPrompt, { label: 'read-graph', phase: 'Graph', schema: GRAPH_SCHEMA, effort: 'low' })
if (!graph) throw new Error('graph agent died — refusing to start')
let tickets = graph.tickets
log(`${tickets.length} ready ticket(s) on the tracker`)

const closedBefore = new Set() // blockers not in the ready set are treated as settled before the run
for (const t of tickets) {
  for (const b of t.blockedBy) {
    if (!tickets.some((x) => x.number === b)) closedBefore.add(b)
  }
}

let rounds = 0
while (rounds < POLICY.maxRounds) {
  if (budget.total && budget.remaining() < POLICY.reserve) {
    log(`token budget at reserve (${Math.round(budget.remaining() / 1000)}k left) — stopping before a new round`)
    break
  }
  const ready = frontier(tickets, closedBefore)
  if (ready.length === 0) break
  rounds += 1
  const batch = ready.slice(0, POLICY.width)
  log(`round ${rounds}: dispatching ${batch.map((t) => `#${t.number}`).join(', ')}`)
  const results = await parallel(batch.map((t) => () => drive(pre, t)))
  const landed = results.filter((r) => r?.ok)
  if (results.every((r) => !r || r.dead)) {
    log('every agent in the round died — infrastructure, not tickets; stopping the campaign')
    break
  }
  for (const t of batch) {
    const s = entry(t)
    if (s.status !== 'merged' && s.attempts >= POLICY.attempts) s.status = 'parked'
  }
  log(`round ${rounds}: ${landed.length}/${batch.length} verified merged`)
  if (POLICY.refreshGraph && frontier(tickets, closedBefore).length > 0) {
    graph = await agent(graphPrompt, { label: `read-graph:r${rounds}`, phase: 'Graph', schema: GRAPH_SCHEMA, effort: 'low' })
    if (graph) {
      for (const t of graph.tickets) {
        if (!tickets.some((x) => x.number === t.number)) tickets.push(t)
      }
      for (const t of tickets) {
        const still = graph.tickets.some((x) => x.number === t.number)
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

phase('Park')
if (parked.length > 0) {
  await agent(
    `On the tracker (${pre.trackerAccess}), for each of these parked tickets: post one comment containing its accumulated failure history, remove the ralph:building label if present, and add the needs-info label. Change nothing else.
${parked.map((s) => `#${s.ticket.number} (${s.ticket.title}): ${s.failures.join(' | ')}`).join('\n')}`,
    { label: 'park', phase: 'Park', schema: { type: 'object', properties: { done: { type: 'boolean' } }, required: ['done'], additionalProperties: false }, model: 'haiku', effort: 'low' },
  )
}

// The completion contract: the campaign cannot declare success while required
// verification fails on the final, post-merge base.
phase('Release')
const release = await agent(
  `Release verification for a finished Ralph campaign. Fix nothing.
1. Sync a fresh ${pre.base} and record its head sha.
2. Run the verification gate: npx @wemuda/launchrail verify. Report the real exit status.
${
    pre.browserTesting && merged.length > 0
      ? `3. The browser-testing module is enabled: start the app (node scripts/dev.mjs --background), scaffold an evidence bundle (npx @wemuda/launchrail smoke), and drive the smoke journeys from docs/testing/smoke-journeys.md per the launchrail:browser-smoke skill. Report the bundle path. A journey you could not complete is a failure, never a pass.`
      : ''
  }
verified means: the verification gate exited 0${pre.browserTesting && merged.length > 0 ? ' AND no smoke journey failed' : ''}.`,
  { label: 'release-verification', phase: 'Release', schema: RELEASE_SCHEMA },
)

return {
  rounds,
  verified: release?.verified ?? false,
  release,
  merged: merged.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, pr: s.pr, mergeCommit: s.mergeCommit })),
  parked: parked.map((s) => ({ ticket: s.ticket.number, title: s.ticket.title, failures: s.failures })),
  stuck: stuck.map((t) => ({ ticket: t.number, title: t.title, blockedBy: t.blockedBy })),
  followUps: [...state.values()].flatMap((s) => s.punted),
}
