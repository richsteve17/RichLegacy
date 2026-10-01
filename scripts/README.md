# Diagnostic scripts

Small utilities used to verify hardware and OS MIDI plumbing.

## `list-midi.py` — MIDI port detector & monitor

Uses `mido` + `python-rtmidi` against the OS MIDI subsystem — the exact same path the browser's Web MIDI API uses.

Install into the backend virtualenv:

```bash
# Windows:
.\backend\.venv\Scripts\pip install mido python-rtmidi

# macOS / Linux:
source backend/.venv/bin/activate
pip install mido python-rtmidi
```

### Detect connected controllers

```bash
python scripts/list-midi.py
```

Sample output:

```
== MIDI inputs ==
  ['Reloop Ready In 0'] <- Reloop

== MIDI outputs ==
  ['Microsoft GS Wavetable Synth 0']
  ['Reloop Ready Out 1'] <- Reloop

[OK] Reloop controller detected and ready for Web MIDI!
```

### Monitor live pad taps

To see note numbers, channels, and velocity live in your terminal when hitting your pads:

```bash
python scripts/list-midi.py --monitor
```

## `list-midi.sh` — macOS CoreMIDI inspector

Zero install for macOS. Uses `system_profiler` (built into macOS).

```bash
./scripts/list-midi.sh
```
