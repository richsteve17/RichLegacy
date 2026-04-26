#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Drum Pad Trainer — one-shot dev launcher for macOS.
#
# Starts the FastAPI backend (port 8000) and the Vite frontend (port 5173)
# in the same terminal. Press Ctrl-C once to stop both cleanly.
#
# Usage:
#   ./startup.sh           start both servers (auto-bootstraps if needed)
#   ./startup.sh --reset   wipe .venv + node_modules, then start fresh
#   ./startup.sh --help    show this help
# ---------------------------------------------------------------------------
set -euo pipefail

# --- locate ourselves -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
NODE_MODULES="$FRONTEND_DIR/node_modules"

# --- pretty output ----------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

say()  { printf "%s[startup]%s %s\n" "$BLUE" "$RESET" "$*"; }
ok()   { printf "%s[ ok    ]%s %s\n" "$GREEN" "$RESET" "$*"; }
warn() { printf "%s[ warn  ]%s %s\n" "$YELLOW" "$RESET" "$*"; }
die()  { printf "%s[ error ]%s %s\n" "$RED" "$RESET" "$*" >&2; exit 1; }

# --- args -------------------------------------------------------------------
RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown argument: $arg (try --help)" ;;
  esac
done

# --- prerequisite checks ----------------------------------------------------
command -v python3 >/dev/null 2>&1 || die "python3 not found. Install from python.org or via 'brew install python@3.12'."
command -v node    >/dev/null 2>&1 || die "node not found. Install via 'brew install node'."
command -v npm     >/dev/null 2>&1 || die "npm not found (should ship with node)."

PY_VERSION="$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
say "python ${PY_VERSION}, node $(node -v)"

# --- optional reset ---------------------------------------------------------
if [[ $RESET -eq 1 ]]; then
  warn "removing $VENV_DIR and $NODE_MODULES"
  rm -rf "$VENV_DIR" "$NODE_MODULES"
fi

# --- backend bootstrap ------------------------------------------------------
if [[ ! -d "$VENV_DIR" ]]; then
  say "creating Python virtualenv at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip >/dev/null
  say "installing backend deps (numpy, scipy, soundfile, audioread, fastapi…)"
  pip install -r "$BACKEND_DIR/requirements.txt"
  ok "backend deps installed"
else
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
fi

# --- frontend bootstrap -----------------------------------------------------
if [[ ! -d "$NODE_MODULES" ]]; then
  say "installing frontend deps (npm install)"
  ( cd "$FRONTEND_DIR" && npm install )
  ok "frontend deps installed"
fi

# --- LAN IP for iPhone testing ---------------------------------------------
# Picks the first non-loopback IPv4. Works on macOS without extra tools.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[[ -z "$LAN_IP" ]] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"

# --- spawn servers ----------------------------------------------------------
PIDS=()
cleanup() {
  say "shutting down…"
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  # give them a moment, then force
  sleep 0.5
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  ok "stopped"
}
trap cleanup EXIT INT TERM

say "starting backend on http://localhost:8000"
( cd "$BACKEND_DIR" && exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 ) &
PIDS+=("$!")

say "starting frontend on http://localhost:5173"
( cd "$FRONTEND_DIR" && exec npm run dev -- --host ) &
PIDS+=("$!")

# --- summary ----------------------------------------------------------------
sleep 1
cat <<EOF

${BOLD}Drum Pad Trainer is running.${RESET}

  ${BOLD}Mac browser:${RESET}    http://localhost:5173
  ${BOLD}Backend API:${RESET}    http://localhost:8000  (docs at /docs)
$( [[ -n "$LAN_IP" ]] && printf "  %siPhone (same Wi-Fi):%s http://%s:5173\n" "$BOLD" "$RESET" "$LAN_IP" )

${DIM}Press Ctrl-C to stop both servers.${RESET}

EOF

# --- wait for either child to exit; cleanup will fire via trap --------------
wait -n "${PIDS[@]}" || true
