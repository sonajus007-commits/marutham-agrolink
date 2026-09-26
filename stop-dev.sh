#!/usr/bin/env bash
#
# stop-dev.sh — stop the three dev servers started by ./start-dev.sh
#
# Kills only the PIDs recorded in .dev-logs/*.pid (backend, portal, shop).
# It deliberately does NOT `pkill -f node` — that would kill unrelated node
# processes and any other running tools.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$ROOT/.dev-logs"

for name in backend portal shop; do
  pidfile="$LOGDIR/$name.pid"
  if [[ -f "$pidfile" ]]; then
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "• stopping $name (pid $pid)"
      # kill the whole process group so pnpm/vite/next children die too
      kill -- "-$(ps -o pgid= "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid" 2>/dev/null
    else
      echo "• $name (pid $pid) not running"
    fi
    rm -f "$pidfile"
  else
    echo "• no pidfile for $name — skipping"
  fi
done

echo "done."
