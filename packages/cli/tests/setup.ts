// Tests must never touch a developer's real Claude Code setup: running the
// suite should not clone marketplaces or install plugins at user scope. This
// forces the no-CLI path everywhere; claude-cli.test.ts opts back in against
// a stub binary.
process.env.LAUNCHRAIL_SKIP_CLAUDE_CLI = "1";
