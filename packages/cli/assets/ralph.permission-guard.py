#!/usr/bin/env python3
"""
Ralph unattended-launch guard  (PreToolUse hook on the `Workflow` tool).

Launchrail's Ralph loop — the `ralph` workflow at `.claude/workflows/ralph.js`,
reached through `/launch-implement` — is meant to be launched and then left alone
for hours while it drives a ticket backlog to merged code. If it is launched
while the session is in an INTERACTIVE permission mode, a single benign
permission prompt (e.g. an MCP or Bash tool call the session has not
pre-approved) can stall the whole run. Once the session sits idle waiting on a
human who has walked away, an ephemeral cloud container is reclaimed and the run
dies mid-ticket — leaving a half-finished ticket and starving everything blocked
behind it.

This hook WARNS (it does not block) when Ralph is launched in a prompting mode,
so the reminder lands while the user is still at the keyboard and can switch to a
non-prompting mode (bypass / autonomous) before walking away.

It is a pure guard: it NEVER grants a permission. For anything that is not a
Ralph `Workflow` launch, and for Ralph launches already in a safe mode, it prints
nothing and exits 0, leaving normal permission handling completely untouched.

Managed by Launchrail (`launchrail sync` may replace this file). Contract:
https://code.claude.com/docs/en/hooks  (PreToolUse: reads `permission_mode` /
`tool_name` / `tool_input`; a `systemMessage` with no `permissionDecision` warns
the user without changing the decision.)
"""
import json
import sys

# Modes that still raise interactive permission prompts. In any of these, a tool
# call the session has not pre-approved waits on a human — fatal for an
# unattended multi-hour run. `acceptEdits` only auto-approves file edits, so
# MCP/Bash calls still prompt; it belongs here too. The non-prompting family
# (bypassPermissions / auto / dontAsk) is intentionally absent — those are safe.
INTERACTIVE_MODES = {"default", "plan", "acceptEdits"}


def is_ralph_workflow(tool_name, tool_input):
    """True only for a launch of the `ralph` workflow (named, inline, or resumed)."""
    if tool_name != "Workflow" or not isinstance(tool_input, dict):
        return False
    if tool_input.get("name") == "ralph":
        return True
    # An inline `script` or a `scriptPath` (resume) that points at the ralph script.
    blob = " ".join(str(tool_input.get(k, "")) for k in ("script", "scriptPath"))
    return "ralph" in blob.lower()


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unparseable input → never interfere

    mode = data.get("permission_mode", "")
    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    if not is_ralph_workflow(tool_name, tool_input):
        sys.exit(0)  # not a Ralph launch → normal handling
    if mode not in INTERACTIVE_MODES:
        sys.exit(0)  # already unattended-safe → let it run silently

    warning = (
        f"⚠ Ralph is launching in '{mode}' permission mode, which still raises "
        "interactive permission prompts. If you walk away, this run can stall on a single "
        "benign prompt (e.g. an un-allowlisted MCP or Bash tool call) and the idle container "
        "may be reclaimed mid-ticket, leaving a half-finished ticket. For an unattended run, "
        "switch to a non-prompting mode (bypass / autonomous) before leaving. Proceeding anyway."
    )
    # Warn-but-allow: surface the message to the user and add context for the
    # orchestrating agent, but emit NO `permissionDecision`, so the launch
    # proceeds through normal permission handling.
    print(json.dumps({
        "systemMessage": warning,
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": (
                f"Ralph was launched in an interactive permission mode ('{mode}'). Remind the "
                "user to switch to a non-prompting mode (bypass/autonomous) if this run is meant "
                "to be unattended, so it cannot stall on a permission prompt."
            ),
        },
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
