#!/usr/bin/env bash
#
# start-dev.sh — start Marutham AgroLink for web + mobile testing.
#
# Three servers make up the dev stack; the browser and the phone only ever
# talk to the backend on :3000 (the "front door"), which proxies the other two:
#
#   backend (Express)  :3000   <- browse here / phone connects here
#     ├─ /app/*   -> portal (Vite)  :5173   (React portal, also the mobile app)
#     └─ / , /_next/*, shop assets -> shop (Next) :3001   (public storefront)
#
# Run it from anywhere:   ./start-dev.sh
# Stop everything with:   ./stop-dev.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOGDIR="$ROOT/.dev-logs"
mkdir -p "$LOGDIR"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
PNPM="corepack pnpm"   # pnpm is not on PATH on this box; go through corepack

# --- helpers --------------------------------------------------------------
port_up()  { ss -ltn 2>/dev/null | grep -q ":$1 "; }
wait_port() {
  local port="$1" name="$2" tries="${3:-45}"
  printf 'waiting for %-8s on :%s ' "$name" "$port"
  for _ in $(seq 1 "$tries"); do
    if port_up "$port"; then echo " up"; return 0; fi
    printf '.'; sleep 2
  done
  echo " TIMEOUT — check $LOGDIR/$name.log"; return 1
}
start_bg() {  # start_bg <name> <port> <command...>
  local name="$1" port="$2"; shift 2
  if port_up "$port"; then
    echo "• $name already listening on :$port — leaving it"
    return 0
  fi
  echo "• starting $name -> :$port  (log: $LOGDIR/$name.log)"
  nohup "$@" >"$LOGDIR/$name.log" 2>&1 &
  echo $! >"$LOGDIR/$name.pid"
}

# --- 1) portal (Vite) + shop (Next) --------------------------------------
start_bg portal 5173 $PNPM --filter @marutham/web  dev
start_bg shop   3001 $PNPM --filter @marutham/shop dev

wait_port 5173 portal
wait_port 3001 shop

# --- 2) backend front door (proxies the two above) -----------------------
if port_up 3000; then
  echo "• backend already listening on :3000 — leaving it"
else
  echo "• starting backend -> :3000  (log: $LOGDIR/backend.log)"
  ( cd "$ROOT/backend" && \
    WEB_URL=http://localhost:5173 SHOP_URL=http://localhost:3001 \
    nohup node server.js >"$LOGDIR/backend.log" 2>&1 & echo $! >"$LOGDIR/backend.pid" )
fi
wait_port 3000 backend

# --- done ----------------------------------------------------------------
cat <<EOF

✅ Marutham AgroLink is running. Use the :3000 front door only.

  Web (this machine)
    Storefront : http://localhost:3000/
    Portal     : http://localhost:3000/app/

  Mobile app (phone on the same Wi-Fi)
    API / site : http://${LAN_IP:-<LAN-IP>}:3000
    (the APK is built to point at this address; phone must be on the same network)

  Logs : $LOGDIR/{backend,portal,shop}.log
  Stop : ./stop-dev.sh
EOF
