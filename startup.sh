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
#   ./startup.sh --debug   run with `set -x` and verbose child output
#   ./startup.sh --help    show this help
#
# Logs are written to ./logs/backend.log and ./logs/frontend.log so you can
# inspect failures even after the script exits.
# ---------------------------------------------------------------------------

# NOTE: deliberately NOT using `set -e`. macOS ships bash 3.2 and we want
# to handle errors explicitly so a backgrounded child failing doesn't tear
# the whole script down with a silent trap.
set -uo pipefail

# --- locate ourselves -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
NODE_MODULES="$FRONTEND_DIR/node_modules"
LOG_DIR="$SCRIPT_DIR/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR"

# --- pretty output ----------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

say()  { printf "%s[startup]%s %s\n" "$BLUE"  "$RESET" "$*"; }
ok()   { printf "%s[ ok    ]%s %s\n" "$GREEN" "$RESET" "$*"; }
warn() { printf "%s[ warn  ]%s %s\n" "$YELLOW" "$RESET" "$*"; }
err()  { printf "%s[ error ]%s %s\n" "$RED"   "$RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

# --- args -------------------------------------------------------------------
RESET=0
DEBUG=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --debug) DEBUG=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown argument: $arg (try --help)" ;;
  esac
done
[[ $DEBUG -eq 1 ]] && set -x

# --- prerequisite checks ----------------------------------------------------
command -v python3 >/dev/null 2>&1 || die "python3 not found. Install via 'brew install python@3.12' or python.org."
command -v node    >/dev/null 2>&1 || die "node not found. Install via 'brew install node'."
command -v npm     >/dev/null 2>&1 || die "npm not found (should ship with node)."

PY_VERSION="$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
say "python ${PY_VERSION}, node $(node -v), bash ${BASH_VERSION%%(*}"

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
  say "installing backend deps (this can take a minute)"
  if ! pip install -r "$BACKEND_DIR/requirements.txt"; then
    die "pip install failed. Try: ./startup.sh --reset"
  fi
  ok "backend deps installed"
else
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
fi

# Sanity-check that uvicorn is actually importable now — catches the
# "venv exists but is broken / wrong Python" case before we try to launch.
if ! python -c "import uvicorn, fastapi, soundfile, audioread, numpy, scipy" 2>"$LOG_DIR/import-check.log"; then
  err "backend imports failed. Details:"
  sed 's/^/    /' "$LOG_DIR/import-check.log" >&2
  die "fix the venv (./startup.sh --reset usually does it)"
fi

# --- frontend bootstrap -----------------------------------------------------
if [[ ! -d "$NODE_MODULES" ]]; then
  say "installing frontend deps (npm install)"
  if ! ( cd "$FRONTEND_DIR" && npm install ); then
    die "npm install failed"
  fi
  ok "frontend deps installed"
fi

# --- LAN IP for iPhone testing ---------------------------------------------
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[[ -z "${LAN_IP:-}" ]] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"

# --- pre-flight: ports free? -----------------------------------------------
port_in_use() { lsof -ti:"$1" >/dev/null 2>&1; }
if port_in_use 8000; then
  warn "port 8000 already in use — kill the holder with: lsof -ti:8000 | xargs kill -9"
fi
if port_in_use 5173; then
  warn "port 5173 already in use — kill the holder with: lsof -ti:5173 | xargs kill -9"
fi

# --- spawn servers ----------------------------------------------------------
# Truncate logs at the start of each run.
: > "$BACKEND_LOG"
: > "$FRONTEND_LOG"

BACKEND_PID=""
FRONTEND_PID=""
TAIL_BE_PID=""
TAIL_FE_PID=""

cleanup() {
  trap - EXIT INT TERM
  say "shutting down…"
  for pid in "$BACKEND_PID" "$FRONTEND_PID" "$TAIL_BE_PID" "$TAIL_FE_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.5
  for pid in "$BACKEND_PID" "$FRONTEND_PID" "$TAIL_BE_PID" "$TAIL_FE_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  ok "stopped"
}
trap cleanup EXIT INT TERM

say "starting backend  → $BACKEND_LOG"
(
  cd "$BACKEND_DIR"
  exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

say "starting frontend → $FRONTEND_LOG"
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Stream both logs to the terminal with a prefix, in the background.
( tail -F -n 0 "$BACKEND_LOG"  2>/dev/null | sed -u -e "s/^/${BLUE}[backend ]${RESET} /" ) &
TAIL_BE_PID=$!
( tail -F -n 0 "$FRONTEND_LOG" 2>/dev/null | sed -u -e "s/^/${GREEN}[frontend]${RESET} /" ) &
TAIL_FE_PID=$!

# --- summary banner ---------------------------------------------------------
sleep 1
cat <<EOF

${BOLD}Drum Pad Trainer is running.${RESET}

  ${BOLD}Mac browser:${RESET}    http://localhost:5173
  ${BOLD}Backend API:${RESET}    http://localhost:8000  (docs at /docs)
$( [[ -n "${LAN_IP:-}" ]] && printf "  %siPhone (same Wi-Fi):%s http://%s:5173\n" "$BOLD" "$RESET" "$LAN_IP" )

  Logs:  $BACKEND_LOG
         $FRONTEND_LOG

${DIM}Press Ctrl-C to stop both servers.${RESET}

EOF

# --- supervise: poll until either server exits ------------------------------
# (bash-3.2 compatible — does not use `wait -n`.)
while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "backend exited unexpectedly. Last 30 lines of $BACKEND_LOG:"
    tail -n 30 "$BACKEND_LOG" | sed 's/^/    /' >&2
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    err "frontend exited unexpectedly. Last 30 lines of $FRONTEND_LOG:"
    tail -n 30 "$FRONTEND_LOG" | sed 's/^/    /' >&2
    exit 1
  fi
  sleep 1
done
