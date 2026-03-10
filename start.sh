#!/bin/bash
# Start Trinity with clean environment (no Claude Code nesting detection)
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT

DIR="$(cd "$(dirname "$0")" && pwd)"

# Start Elixir backend
(cd "$DIR/backend" && mix phx.server) &
BACKEND_PID=$!

# Start Next.js frontend
(cd "$DIR" && npx next dev) &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo "Trinity started: frontend=http://localhost:3000  backend=http://localhost:4000"
wait
