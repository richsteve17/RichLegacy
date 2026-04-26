#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# list-midi.sh — show every MIDI device macOS sees.
#
# Zero-install: uses system_profiler, which ships with macOS.
# Highlights any device whose name contains "Hercules" (case-insensitive)
# so you can tell at a glance whether the pad was detected.
#
# Usage:
#   ./scripts/list-midi.sh
# ---------------------------------------------------------------------------
set -uo pipefail

# --- pretty colours (only when stdout is a TTY) ----------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; BLUE=$'\033[34m'
  RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; BLUE=""; RESET=""
fi

printf "%s== macOS MIDI devices ==%s\n" "$BOLD" "$RESET"
printf "%susing: system_profiler SPMIDIDataType%s\n\n" "$DIM" "$RESET"

# --- run system_profiler ---------------------------------------------------
RAW="$(system_profiler SPMIDIDataType 2>/dev/null || true)"

if [[ -z "$RAW" ]]; then
  printf "%sNo MIDI subsystem data returned by system_profiler.%s\n" "$RED" "$RESET"
  printf "Things to try:\n"
  printf "  1. Make sure the Hercules pad is plugged in over USB.\n"
  printf "  2. Open Audio MIDI Setup.app  →  Window  →  Show MIDI Studio\n"
  printf "     and confirm the device appears there.\n"
  exit 1
fi

# --- raw dump --------------------------------------------------------------
printf "%s[ raw ]%s\n" "$BLUE" "$RESET"
printf "%s\n" "$RAW" | sed 's/^/    /'
printf "\n"

# --- summary: just the device names ----------------------------------------
# system_profiler's "MIDI Devices:" section lists each device with its name
# as a key followed by ":" on its own line, two spaces of indent.
# We grab anything that looks like a device entry.
NAMES="$(printf "%s\n" "$RAW" \
  | awk '
      /^[[:space:]]+MIDI Devices:/ { in_devs=1; next }
      /^[[:space:]]+MIDI Software:/ { in_devs=0 }
      in_devs && /^[[:space:]]{6}[^[:space:]].*:[[:space:]]*$/ {
        gsub(/^[[:space:]]+|:[[:space:]]*$/, "", $0)
        print
      }
    ')"

printf "%s[ devices ]%s\n" "$BLUE" "$RESET"
if [[ -z "$NAMES" ]]; then
  printf "    %s(none reported)%s\n" "$DIM" "$RESET"
else
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if printf "%s" "$name" | grep -qi "hercules"; then
      printf "    %s✓ %s%s   ← looks like your pad\n" "$GREEN" "$name" "$RESET"
    else
      printf "    • %s\n" "$name"
    fi
  done <<< "$NAMES"
fi
printf "\n"

# --- verdict ---------------------------------------------------------------
if printf "%s" "$RAW" | grep -qi "hercules"; then
  printf "%s✓ Hercules device detected by CoreMIDI.%s\n" "$GREEN" "$RESET"
  printf "  Next step: open Chrome on this Mac and run the Web MIDI test\n"
  printf "  we'll wire into the frontend.\n"
  exit 0
else
  printf "%s✗ No Hercules device found.%s\n" "$YELLOW" "$RESET"
  printf "  Checks to run:\n"
  printf "    1. %sIs it plugged in via USB (not just over Bluetooth audio)?%s\n" "$DIM" "$RESET"
  printf "    2. %sOpen 'Audio MIDI Setup.app' → Window → Show MIDI Studio.%s\n" "$DIM" "$RESET"
  printf "       The pad should appear there with a non-greyed icon.\n"
  printf "    3. %sTry a different USB port / cable.%s\n" "$DIM" "$RESET"
  printf "    4. %sSome Hercules controllers (DJControl Inpulse, DJControl Pro)%s\n" "$DIM" "$RESET"
  printf "       only enumerate as MIDI when no DJ software has grabbed them —\n"
  printf "       quit DJUCED / Serato / rekordbox and try again.\n"
  exit 2
fi
