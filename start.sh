#!/bin/bash
# Start Trinity with clean environment (no Claude Code nesting detection)
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT
exec npx next dev "$@"
