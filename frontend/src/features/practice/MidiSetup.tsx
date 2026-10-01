import { useEffect, useState } from 'react';
import {
  defaultMapping,
  DRUM_NAMES,
  noteToPad,
  saveMapping,
  setDrumForPad,
  setPadForNote,
  withController,
  type DrumElement,
  type PadMapping,
} from '../../lib/midi/padMapping';
import { drumSampler } from '../../lib/audio/drumSampler';
import { runRainbowChase } from '../../lib/midi/reloopLed';
import type { UseWebMidiResult } from '../../lib/midi/useWebMidi';

interface Props {
  midi: UseWebMidiResult;
  mapping: PadMapping;
  setMapping: (m: PadMapping) => void;
}

const AVAILABLE_DRUMS: DrumElement[] = [
  'kick',
  'snare',
  'hihat',
  'hihatPedal',
  'hihatOpen',
  'crash',
  'crash2',
  'ride',
  'rideBell',
  'tomHigh',
  'tomLow',
  'percussion',
];

/**
 * MIDI device picker + controller preset + dual-deck drum pad assignment editor + LED test.
 */
export default function MidiSetup({ midi, mapping, setMapping }: Props) {
  const [calibrating, setCalibrating] = useState(false);
  const [calibratePad, setCalibratePad] = useState(0);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [showDrumAssignments, setShowDrumAssignments] = useState(false);
  const [testingLeds, setTestingLeds] = useState(false);

  // Sync controller preset if specific hardware was detected
  useEffect(() => {
    if (midi.detectedController && midi.detectedController !== 'custom') {
      if (mapping.controller !== midi.detectedController) {
        const next = withController(mapping, midi.detectedController, 'dual');
        setMapping(next);
        saveMapping(next);
      }
    }
  }, [midi.detectedController]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture the next note-on while calibrating.
  useEffect(() => {
    if (!calibrating) return;
    const off = midi.onNoteOn((e) => {
      const next = setPadForNote(mapping, e.channel, e.note, calibratePad);
      setMapping(next);
      saveMapping(next);
      setLastEvent(
        `ch ${e.channel + 1}, note ${e.note} (0x${e.note.toString(16).toUpperCase()}), vel ${e.velocity}`,
      );
      if (calibratePad + 1 < mapping.padCount) {
        setCalibratePad((p) => p + 1);
      } else {
        setCalibrating(false);
      }
    });
    return off;
  }, [calibrating, calibratePad, mapping, setMapping, midi]);

  // Show the most recent note outside calibration for verification
  useEffect(() => {
    if (calibrating) return;
    const off = midi.onNoteOn((e) => {
      const pad = noteToPad(mapping, e.channel, e.note);
      const drum =
        pad !== null && mapping.drumAssignments[pad]
          ? ` (${DRUM_NAMES[mapping.drumAssignments[pad]]})`
          : '';
      const target = pad !== null ? ` → Pad ${pad + 1}${drum}` : ' (unmapped)';
      setLastEvent(
        `ch ${e.channel + 1}, note ${e.note} (0x${e.note.toString(16).toUpperCase()}), vel ${e.velocity}${target}`,
      );
    });
    return off;
  }, [calibrating, mapping, midi]);

  if (!midi.supported) {
    return (
      <div className="midi-setup">
        <p className="error">
          Web MIDI isn't available in this browser. Use Chrome, Edge, or
          Opera on Windows or macOS to connect your controller.
        </p>
      </div>
    );
  }

  if (midi.error) {
    return (
      <div className="midi-setup">
        <p className="error">{midi.error}</p>
      </div>
    );
  }

  if (!midi.ready) {
    return (
      <div className="midi-setup">
        <p className="muted">Initializing MIDI…</p>
      </div>
    );
  }

  const handlePresetChange = (value: string) => {
    let next: PadMapping;
    if (value === 'reloop-ready-dual') {
      next = defaultMapping('reloop-ready', 'dual');
    } else if (value === 'reloop-ready-d1') {
      next = defaultMapping('reloop-ready', 'deck1', 1);
    } else if (value === 'reloop-ready-d2') {
      next = defaultMapping('reloop-ready', 'deck2', 2);
    } else if (value === 'reloop-buddy-dual') {
      next = defaultMapping('reloop-buddy', 'dual');
    } else if (value === 'reloop-buddy-8') {
      next = defaultMapping('reloop-buddy', 'deck1', 1);
    } else if (value === 'hercules') {
      next = defaultMapping('hercules', 'deck1', 1);
    } else {
      next = defaultMapping('custom', 'dual');
    }
    setMapping(next);
    saveMapping(next);
  };

  const onDrumChange = (padIdx: number, drum: DrumElement) => {
    const next = setDrumForPad(mapping, padIdx, drum);
    setMapping(next);
    saveMapping(next);
    // Instant audio feedback: let the user immediately hear what they selected!
    drumSampler.playElement(drum, 110);
  };

  const handleTestLeds = () => {
    setTestingLeds(true);
    const stop = runRainbowChase(midi.sendMidi, mapping.padCount, mapping.controller);
    setTimeout(() => {
      stop();
      setTestingLeds(false);
    }, 2200);
  };

  const presetValue =
    mapping.controller === 'reloop-ready'
      ? mapping.deckMode === 'dual'
        ? 'reloop-ready-dual'
        : mapping.deck === 2
          ? 'reloop-ready-d2'
          : 'reloop-ready-d1'
      : mapping.controller === 'reloop-buddy'
        ? mapping.deckMode === 'dual'
          ? 'reloop-buddy-dual'
          : 'reloop-buddy-8'
        : mapping.controller === 'hercules'
          ? 'hercules'
          : 'custom';

  return (
    <div className="midi-setup">
      <div className="row">
        <label>
          MIDI Input Controller
          <select
            value={midi.selectedInputId ?? ''}
            onChange={(e) => midi.selectInput(e.target.value || null)}
          >
            <option value="">— none —</option>
            {midi.inputs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.manufacturer ? ` (${i.manufacturer})` : ''}
                {i.state === 'disconnected' ? ' [offline]' : ''}
              </option>
            ))}
          </select>
        </label>

        {midi.outputs.length > 0 && (
          <label>
            MIDI Output (RGB LEDs)
            <select
              value={midi.selectedOutputId ?? ''}
              onChange={(e) => midi.selectOutput(e.target.value || null)}
            >
              <option value="">— none —</option>
              {midi.outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.manufacturer ? ` (${o.manufacturer})` : ''}
                  {o.state === 'disconnected' ? ' [offline]' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Controller Preset & Pads
          <select value={presetValue} onChange={(e) => handlePresetChange(e.target.value)}>
            <option value="reloop-ready-dual">
              ⭐ Reloop Ready (16 Pads — Dual Decks Left & Right)
            </option>
            <option value="reloop-ready-d1">Reloop Ready (Deck 1 Only — 8 Pads)</option>
            <option value="reloop-ready-d2">Reloop Ready (Deck 2 Only — 8 Pads)</option>
            <option value="reloop-buddy-dual">Reloop Buddy (16 Pads — Dual Decks)</option>
            <option value="reloop-buddy-8">Reloop Buddy (8 Pads)</option>
            <option value="hercules">Hercules DJControl Mix (4 Pads)</option>
            <option value="custom">Custom / Generic MIDI Controller</option>
          </select>
        </label>
      </div>

      <div className="row midi-actions-row">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setShowDrumAssignments((prev) => !prev)}
        >
          {showDrumAssignments ? 'Hide Drum Assignment Matrix' : '🥁 Customize Drum Assignments'}
        </button>

        {mapping.controller.startsWith('reloop') && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleTestLeds}
            disabled={testingLeds}
          >
            {testingLeds ? '✨ Rainbow Chase Running…' : '🌈 Test Hardware LEDs'}
          </button>
        )}

        <button
          type="button"
          className="btn"
          onClick={() => {
            if (calibrating) {
              setCalibrating(false);
            } else {
              setCalibratePad(0);
              setCalibrating(true);
              setLastEvent(null);
            }
          }}
        >
          {calibrating ? 'Cancel calibration' : `Calibrate ${mapping.padCount} pads`}
        </button>

        <button
          type="button"
          className="btn btn--muted"
          onClick={() => {
            const next = defaultMapping(mapping.controller, mapping.deckMode, mapping.deck);
            setMapping(next);
            saveMapping(next);
          }}
        >
          Reset defaults
        </button>
      </div>

      {showDrumAssignments && (
        <div className="drum-assignment-panel">
          <h4>Customize physical pad assignments:</h4>
          <p className="muted" style={{ marginBottom: 12 }}>
            Assign which drum part (Kick, Snare, Hi-Hat, Cymbals, Toms) plays on each pad:
          </p>

          {mapping.padCount === 16 ? (
            <div className="drum-assignment-dual-grid">
              <div className="drum-assignment-col">
                <strong className="deck-tag deck-tag--deck1">Deck 1 • Left Hand (Pads 1–8)</strong>
                {Array.from({ length: 8 }, (_, i) => {
                  const currentDrum = mapping.drumAssignments[i] ?? 'kick';
                  return (
                    <div key={i} className="drum-assignment-item">
                      <span className="drum-assignment-pad">Pad {i + 1} (D1#{i + 1})</span>
                      <select
                        value={currentDrum}
                        onChange={(e) => onDrumChange(i, e.target.value as DrumElement)}
                      >
                        {AVAILABLE_DRUMS.map((d) => (
                          <option key={d} value={d}>
                            {DRUM_NAMES[d]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="drum-assignment-col">
                <strong className="deck-tag deck-tag--deck2">Deck 2 • Right Hand (Pads 9–16)</strong>
                {Array.from({ length: 8 }, (_, idx) => {
                  const i = idx + 8;
                  const currentDrum = mapping.drumAssignments[i] ?? 'hihat';
                  return (
                    <div key={i} className="drum-assignment-item">
                      <span className="drum-assignment-pad">Pad {i + 1} (D2#{idx + 1})</span>
                      <select
                        value={currentDrum}
                        onChange={(e) => onDrumChange(i, e.target.value as DrumElement)}
                      >
                        {AVAILABLE_DRUMS.map((d) => (
                          <option key={d} value={d}>
                            {DRUM_NAMES[d]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="drum-assignment-grid">
              {Array.from({ length: mapping.padCount }, (_, i) => {
                const currentDrum = mapping.drumAssignments[i] ?? 'kick';
                return (
                  <div key={i} className="drum-assignment-item">
                    <span className="drum-assignment-pad">Pad {i + 1}</span>
                    <select
                      value={currentDrum}
                      onChange={(e) => onDrumChange(i, e.target.value as DrumElement)}
                    >
                      {AVAILABLE_DRUMS.map((d) => (
                        <option key={d} value={d}>
                          {DRUM_NAMES[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {calibrating ? (
        <p className="callout">
          Press pad <strong>{calibratePad + 1}</strong> on your controller…
          {lastEvent && <span className="muted"> last seen: {lastEvent}</span>}
        </p>
      ) : (
        lastEvent && (
          <p className="muted" style={{ marginTop: 8 }}>
            Last MIDI: {lastEvent}
          </p>
        )
      )}
    </div>
  );
}
