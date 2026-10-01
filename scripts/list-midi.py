#!/usr/bin/env python3
"""list-midi.py — enumerate MIDI input + output ports and optionally monitor messages.

Uses ``mido`` (with the ``python-rtmidi`` backend).

Install into the backend virtualenv:
    pip install mido python-rtmidi

Run:
    python scripts/list-midi.py
    python scripts/list-midi.py --monitor
"""
from __future__ import annotations

import re
import sys
import time

RELOOP_RE = re.compile(r"reloop|ready|buddy", re.IGNORECASE)
HERCULES_RE = re.compile(r"hercules|dj.?control.?mix", re.IGNORECASE)


def safe_print(s: str) -> None:
    try:
        print(s)
    except UnicodeEncodeError:
        print(s.encode("ascii", "replace").decode("ascii"))


def main() -> int:
    try:
        import mido  # type: ignore
    except ImportError:
        print("mido is not installed.", file=sys.stderr)
        print(
            "Install it into the backend venv:\n"
            "    pip install mido python-rtmidi",
            file=sys.stderr,
        )
        return 1

    inputs = mido.get_input_names()
    outputs = mido.get_output_names()

    def fmt(name: str) -> str:
        flags = []
        if RELOOP_RE.search(name):
            flags.append("Reloop")
        if HERCULES_RE.search(name):
            flags.append("Hercules")
        tag = f" <- {' / '.join(flags)}" if flags else ""
        return f"  [{name!r}]{tag}"

    safe_print("== MIDI inputs ==")
    if inputs:
        for n in inputs:
            safe_print(fmt(n))
    else:
        safe_print("  (none)")

    safe_print("\n== MIDI outputs ==")
    if outputs:
        for n in outputs:
            safe_print(fmt(n))
    else:
        safe_print("  (none)")

    reloop_found = any(RELOOP_RE.search(n) for n in inputs + outputs)
    hercules_found = any(HERCULES_RE.search(n) for n in inputs + outputs)

    safe_print("")
    if reloop_found:
        safe_print("[OK] Reloop controller detected and ready for Web MIDI!")
    elif hercules_found:
        safe_print("[OK] Hercules controller detected and ready for Web MIDI!")
    else:
        safe_print("[!] No Reloop or Hercules device detected. See scripts/README.md.")

    # Optional LED test mode
    if "--test-leds" in sys.argv:
        target = next((n for n in outputs if RELOOP_RE.search(n)), None)
        if not target and outputs:
            target = outputs[0]

        if not target:
            safe_print("No MIDI output available to test LEDs.")
            return 2

        safe_print(f"\nTesting LED chase on {target!r}...")
        try:
            with mido.open_output(target) as port:
                # Colors: (r, g, b) where each is 0..3
                palette = [
                    (3, 0, 0), # Red
                    (3, 1, 0), # Orange
                    (3, 3, 0), # Yellow
                    (0, 3, 0), # Green
                    (0, 3, 3), # Cyan
                    (0, 0, 3), # Blue
                    (1, 0, 3), # Violet
                    (3, 0, 3), # Magenta
                ]
                # Rainbow sweep across all 8 pads
                for step in range(16):
                    for i in range(8):
                        r, g, b = palette[(step + i) % len(palette)]
                        val = (r << 4) | (g << 2) | b | (1 << 6)
                        port.send(mido.Message("note_on", channel=4, note=20 + i, velocity=val))
                    time.sleep(0.08)

                # Flash all green
                for i in range(8):
                    val = (0 << 4) | (3 << 2) | 0 | (1 << 6)
                    port.send(mido.Message("note_on", channel=4, note=20 + i, velocity=val))
                time.sleep(0.3)

                # Clear all
                for i in range(8):
                    port.send(mido.Message("note_on", channel=4, note=20 + i, velocity=0))

                safe_print("LED test complete! All 8 pads responded.")
        except Exception as e:
            safe_print(f"LED test error: {e}")

    # Optional monitor mode
    if "--monitor" in sys.argv:
        target = next((n for n in inputs if RELOOP_RE.search(n)), None)
        if not target and inputs:
            target = inputs[0]

        if not target:
            safe_print("No MIDI input available to monitor.")
            return 2

        safe_print(f"\nMonitoring {target!r}... (Press Ctrl+C to stop)")
        try:
            with mido.open_input(target) as port:
                for msg in port:
                    safe_print(f"  {msg}")
        except KeyboardInterrupt:
            safe_print("\nStopped.")

    return 0 if (reloop_found or hercules_found) else 2


if __name__ == "__main__":
    sys.exit(main())
