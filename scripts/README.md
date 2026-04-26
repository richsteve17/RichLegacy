# Diagnostic scripts

Small, copy-paste-friendly tools that don't run as part of the app — used
to verify hardware and OS plumbing while we build the MIDI features.

## `list-midi.sh` — confirm macOS sees your Hercules pad

Zero install. Uses `system_profiler` (built into macOS).

```bash
./scripts/list-midi.sh
```

What you'll see if it works:

```
== macOS MIDI devices ==
[ devices ]
    ✓ DJControl Inpulse 200   ← looks like your pad

✓ Hercules device detected by CoreMIDI.
```

What you'll see if it doesn't:

```
✗ No Hercules device found.
  Checks to run: …
```

## `list-midi.py` — separate input vs output ports (richer view)

Uses `mido` + `python-rtmidi` against CoreMIDI — the same path the
browser's Web MIDI API uses, so this is the most accurate preview of
what the React app will be able to listen to.

One-time install into the existing backend venv:

```bash
source backend/.venv/bin/activate
pip install mido python-rtmidi
```

Then:

```bash
python scripts/list-midi.py
```

Sample output:

```
== MIDI inputs ==
  ['DJControl Inpulse 200'] ← Hercules

== MIDI outputs ==
  ['DJControl Inpulse 200'] ← Hercules

✓ Hercules device available to CoreMIDI / Web MIDI.
```

## Triage if the pad doesn't appear

1. Plug it in via USB (not just paired over Bluetooth audio).
2. Open `Audio MIDI Setup.app` → `Window` → `Show MIDI Studio`. If it's
   greyed out there, the OS isn't enumerating it as MIDI — try a
   different cable/port.
3. Quit any DJ software (DJUCED, Serato, rekordbox). Some Hercules
   controllers grab exclusive access and disappear from generic MIDI
   enumeration while that's running.
4. Re-run `./scripts/list-midi.sh`.
