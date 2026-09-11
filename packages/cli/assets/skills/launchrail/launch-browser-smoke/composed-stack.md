# Starting a composed stack for the browser smoke

`launchrail dev` needs one command that brings up everything the smoke drives, and a list of the origins that must answer. For a single-process app that is `testing.devCommand` and `testing.appUrl`, and nothing else is needed. This page is for the other kind: a customer page running an SDK, an API, a dashboard on a third origin, a worker, fixtures — where "start the dev server" starts five frontends and no backend, and the backend's own start needs Docker that a hosted session does not have.

## The contract

```yaml
# .launchrail.yml
smoke:
  start: node scripts/smoke-stack.mjs     # boots the whole smokeable stack, in-process where it can
  origins:                                # every one must answer HTTP before the stack is "ready"
    dashboard: http://localhost:5173
    demo: http://localhost:4173
    api: http://localhost:3001/health
```

`launchrail dev --background` runs `start`, polls the origins, and writes `.launchrail/state/stack.json`. The start command **merges** anything the smoke will need into that same file — read it, add your keys, write it back; never replace it, the CLI merges too:

```json
{
  "origins": { "dashboard": "http://localhost:5173", "demo": "http://localhost:4173" },
  "pid": 41337,
  "fixtures": { "orgId": "org_test", "projectId": "prj_test", "publishableKey": "pk_test_…" },
  "mailbox": ".launchrail/state/mail/"
}
```

`launchrail dev --check` proves the contract once — start, wait, assert the files, tear down — at adoption and whenever the stack changes. Nothing in a smoke should discover the stack; the smoke reads `stack.json` and drives.

## The pattern that works without Docker

Every platform arrives at the same shape once it needs to run in a fresh container:

1. **Boot the real backend in-process** against an in-process database (Postgres-in-WASM, SQLite, an embedded engine) — the real app module, not a mock server. Migrate and seed on start.
2. **Stub only the outbound seams:** mail to a captured sender, object storage to memory, queues to a synchronous stub, third-party APIs to recorded responses. Everything the user's click touches stays real.
3. **Seed fixtures directly**, through the backend's own services or repository layer, not through the UI: a member, an org, a project, a publishable key, an allowlisted origin. Write their ids and keys into `stack.json`.
4. **Run the real frontend dev servers** on their real origins, so CORS, cookies across ports, and credentialed requests are exercised for real. Point them at the in-process API through their normal env vars.
5. **Solve auth for the driver.** Every product has one of these. Magic-link sign-in: the captured mail sender writes each message to `mailbox`, and the smoke reads the link from the newest file and opens it. Password or session sign-in: seed the credential and put it in `fixtures`. Never bypass auth with a test-only backdoor in the app — the smoke should sign in the way a user does.
6. **Write the customer-facing page** the SDK runs on as a small static host (a demo page) that reads the publishable key from `stack.json` or an env var, so it comes up configured, not "not configured".
7. **Exit cleanly on SIGTERM** so `launchrail dev --stop` tears everything down: one process group, child servers closed in a handler.

A project that already has such a harness for its own full-stack tests is one script away: wrap the harness in `scripts/smoke-stack.mjs`, keep it running instead of exiting after a test, and merge the URLs and fixtures into `stack.json`.

## What the smoke then does

`set -a; . .launchrail/state/browser.env; set +a`, read `stack.json`, `agent-browser open` the origin the ticket touches, sign in via the `mailbox` or `fixtures`, and drive the change. Nothing here is written back to the repository; `.launchrail/state/` ignores itself.
