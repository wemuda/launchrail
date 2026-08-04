# Security policy

Launchrail's job is writing files into other people's repositories, so its security bar is concrete: nothing it does may exceed what the ownership model and manifest declare.

## Reporting a vulnerability

Report vulnerabilities privately via **[GitHub private vulnerability reporting](https://github.com/wemuda/launchrail/security/advisories/new)** ("Report a vulnerability" on the repo's Security tab). Please do not open public issues or pull requests for security problems.

Include what you can: affected command or module, a reproduction (ideally against a scratch repository), and impact. You can expect an acknowledgement within 7 days. Coordinated disclosure is appreciated; we'll credit reporters in release notes unless you prefer otherwise.

## What counts as a vulnerability here

Beyond the usual (dependency compromise, code execution), Launchrail-specific classes we care about most:

- **Ownership-model escapes** — any write that overwrites a seeded or project-owned file, or touches paths outside the consuming repository (path traversal via templates, module names, or manifest values).
- **Checksum/dry-run bypass** — a code path that writes without dry-run support, or replaces a locally modified managed file without detecting the conflict.
- **Migration damage** — a failed migration that leaves a repository unrecoverable.
- **Template or manifest injection** — untrusted content in `.launchrail.yml`, lockfile, or upstream templates causing writes or command execution the user didn't ask for.
- **Secret leakage** — anything that causes secrets to be written into the manifest, lockfile, templates, or evidence bundles.

Skills and workflow scripts installed into consuming projects (`.claude/`, `scripts/`) are instructions executed by coding agents and Node; treat injection into those artifacts as in scope too.

## Supported versions

Pre-release: only the latest published version (and `master`) receives security fixes. This section will be updated with a version table once 1.0 ships.
