#!/usr/bin/env python3
"""list-midi.py — enumerate MIDI input + output ports via CoreMIDI.

Uses ``mido`` (with the ``python-rtmidi`` backend) which talks to CoreMIDI
under the hood — i.e. it sees devices the same way the Web MIDI API will.

Install once into the existing backend venv:
    source backend/.venv/bin/activate
    pip install mido python-rtmidi

Run:
    python scripts/list-midi.py
"""
from __future__ import annotations

import sys


def main() -> int:
    try:
        import mido  # type: ignore
    except ImportError:
        print("mido is not installed.", file=sys.stderr)
        print(
            "Install it into the backend venv:\n"
            "    source backend/.venv/bin/activate\n"
            "    pip install mido python-rtmidi",
            file=sys.stderr,
        )
        return 1

    inputs = mido.get_input_names()
    outputs = mido.get_output_names()

    def fmt(name: str) -> str:
        flag = " ← Hercules" if "hercules" in name.lower() else ""
        return f"  [{name!r}]{flag}"

    print("== MIDI inputs ==")
    if inputs:
        for n in inputs:
            print(fmt(n))
    else:
        print("  (none)")

    print("\n== MIDI outputs ==")
    if outputs:
        for n in outputs:
            print(fmt(n))
    else:
        print("  (none)")

    found = any("hercules" in n.lower() for n in inputs + outputs)
    print()
    if found:
        print("✓ Hercules device available to CoreMIDI / Web MIDI.")
        return 0
    print("✗ No Hercules device found. See scripts/README.md for triage.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
