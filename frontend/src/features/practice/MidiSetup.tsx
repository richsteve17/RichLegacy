import { useEffect, useState } from 'react';
import {
  PAD_COUNT,
  defaultMapping,
  saveMapping,
  setPadForNote,
  withDeck,
} from '../../lib/midi/padMapping';
import type { DeckId, PadMapping } from '../../lib/midi/padMapping';
import type { UseWebMidiResult } from '../../lib/midi/useWebMidi';

interface Props {
  midi: UseWebMidiResult;
  mapping: PadMapping;
  setMapping: (m: PadMapping) => void;
}

/**
 * MIDI device picker + Hercules deck selector + per-pad calibration.
 *
 * Calibration flow: user clicks "Calibrate", then taps each physical pad
 * in turn. The next note-on we hear is bound to that pad.
 */
export default function MidiSetup({ midi, mapping, setMapping }: Props) {
  const [calibrating, setCalibrating] = useState(false);
  const [calibratePad, setCalibratePad] = useState(0);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  // Capture the next note-on while calibrating.
  useEffect(() => {
    if (!calibrating) return;
    const off = midi.onNoteOn((e) => {
      const next = setPadForNote(mapping, e.channel, e.note, calibratePad);
      setMapping(next);
      saveMapping(next);
      setLastEvent(`ch ${e.channel + 1}, note ${e.note}, vel ${e.velocity}`);
      if (calibratePad + 1 < PAD_COUNT) {
        setCalibratePad((p) => p + 1);
      } else {
        setCalibrating(false);
      }
    });
    return off;
  }, [calibrating, calibratePad, mapping, setMapping, midi]);

  // Show the most recent note even outside calibration so the user can
  // sanity-check that messages are flowing.
  useEffect(() => {
    if (calibrating) return;
    const off = midi.onNoteOn((e) => {
      setLastEvent(`ch ${e.channel + 1}, note ${e.note}, vel ${e.velocity}`);
    });
    return off;
  }, [calibrating, midi]);

  if (!midi.supported) {
    return (
      <div className="midi-setup">
        <p className="error">
          Web MIDI isn't available in this browser. Use Chrome, Edge, or
          Opera on macOS to talk to your Hercules pad.
        </p>
        <p className="muted">
          (iOS Safari has no Web MIDI support — on iPhone the pads are
          touch-only.)
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

  const onDeckChange = (deck: DeckId) => {
    const next = withDeck(mapping, deck);
    setMapping(next);
    saveMapping(next);
  };

  return (
    <div className="midi-setup">
      <div className="row">
        <label>
          Device
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

        <label>
          Hercules deck
          <select
            value={mapping.deck}
            onChange={(e) => onDeckChange(Number(e.target.value) as DeckId)}
          >
            <option value={1}>Deck 1 (left)</option>
            <option value={2}>Deck 2 (right)</option>
          </select>
        </label>
      </div>

      <div className="row">
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
          {calibrating ? 'Cancel calibration' : 'Calibrate pads'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const next = defaultMapping(mapping.deck);
            setMapping(next);
            saveMapping(next);
          }}
        >
          Reset to default
        </button>
      </div>

      {calibrating ? (
        <p className="callout">
          Press pad <strong>{calibratePad + 1}</strong> on your Hercules…
          {lastEvent && <span className="muted"> last seen: {lastEvent}</span>}
        </p>
      ) : (
        lastEvent && (
          <p className="muted">
            Last MIDI message: {lastEvent}
          </p>
        )
      )}
    </div>
  );
}
