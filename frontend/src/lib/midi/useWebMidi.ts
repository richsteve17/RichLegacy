import { useCallback, useEffect, useRef, useState } from 'react';
import type { MidiInputInfo, MidiNoteEvent, NoteHandler } from './types';

// Match the Hercules DJControl Mix and close relatives by name.
const HERCULES_MATCH = /dj.?control.?mix|hercules/i;

export interface UseWebMidiResult {
  /** True if the browser exposes navigator.requestMIDIAccess. */
  supported: boolean;
  /** True once MIDIAccess has been granted and inputs enumerated. */
  ready: boolean;
  /** User-visible error message, if any. */
  error: string | null;
  /** Currently visible MIDI inputs. */
  inputs: MidiInputInfo[];
  /** ID of the input we're listening to, or null. */
  selectedInputId: string | null;
  /** Programmatic input switch. */
  selectInput: (id: string | null) => void;
  /** Subscribe to note-on. Returns an unsubscribe fn. */
  onNoteOn: (handler: NoteHandler) => () => void;
  /** Subscribe to note-off. Returns an unsubscribe fn. */
  onNoteOff: (handler: NoteHandler) => () => void;
}

/**
 * React hook for the Web MIDI API.
 *
 * - Lazily requests access on mount.
 * - Re-enumerates inputs whenever the OS reports a state change.
 * - Auto-selects the first input whose name/manufacturer looks like a
 *   Hercules pad; the user can override via selectInput.
 * - Decodes raw MIDIMessageEvent into a structured MidiNoteEvent and
 *   fans out to all subscribers.
 *
 * Note: Web MIDI is not available on iOS Safari. The hook reports
 * supported=false there so the UI can render a clear fallback.
 */
export function useWebMidi(): UseWebMidiResult {
  const [supported] = useState<boolean>(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.requestMIDIAccess === 'function',
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);

  const accessRef = useRef<MIDIAccess | null>(null);
  const currentInputRef = useRef<MIDIInput | null>(null);
  const noteOnHandlers = useRef<Set<NoteHandler>>(new Set());
  const noteOffHandlers = useRef<Set<NoteHandler>>(new Set());

  // --- enumerate inputs from the current MIDIAccess --------------------
  const refreshInputs = useCallback(() => {
    const acc = accessRef.current;
    if (!acc) return;
    const list: MidiInputInfo[] = [];
    acc.inputs.forEach((inp) => {
      list.push({
        id: inp.id,
        name: inp.name ?? '(unnamed)',
        manufacturer: inp.manufacturer ?? '',
        state: inp.state,
      });
    });
    setInputs(list);

    setSelectedInputId((current) => {
      // Keep current selection if it's still around.
      if (current && list.some((i) => i.id === current)) return current;
      // Auto-pick a Hercules-looking device.
      const hercules = list.find(
        (i) => HERCULES_MATCH.test(i.name) || HERCULES_MATCH.test(i.manufacturer),
      );
      if (hercules) return hercules.id;
      // Fall back to first input.
      return list[0]?.id ?? null;
    });
  }, []);

  // --- request access on mount ----------------------------------------
  useEffect(() => {
    if (!supported) {
      setError(
        'Web MIDI is not available in this browser. Use Chrome, Edge, or Opera on macOS.',
      );
      return;
    }

    let cancelled = false;
    const req = navigator.requestMIDIAccess?.({ sysex: false });
    if (!req) {
      setError('navigator.requestMIDIAccess returned undefined.');
      return;
    }

    req.then(
      (acc) => {
        if (cancelled) return;
        accessRef.current = acc;
        acc.onstatechange = () => refreshInputs();
        setReady(true);
        refreshInputs();
      },
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`MIDI access denied: ${msg}`);
      },
    );

    return () => {
      cancelled = true;
      const acc = accessRef.current;
      if (acc) acc.onstatechange = null;
      if (currentInputRef.current) {
        currentInputRef.current.onmidimessage = null;
        currentInputRef.current = null;
      }
    };
  }, [supported, refreshInputs]);

  // --- attach onmidimessage to the selected input ----------------------
  useEffect(() => {
    const acc = accessRef.current;
    if (!acc) return;

    if (currentInputRef.current) {
      currentInputRef.current.onmidimessage = null;
      currentInputRef.current = null;
    }

    if (!selectedInputId) return;

    const input = acc.inputs.get(selectedInputId);
    if (!input) return;

    input.onmidimessage = (msg: MIDIMessageEvent) => {
      const data = msg.data;
      if (data.length < 2) return;

      const status = data[0] & 0xf0;
      const channel = data[0] & 0x0f;
      const note = data[1];
      const velocity = data.length > 2 ? data[2] : 0;
      const event: MidiNoteEvent = {
        note,
        velocity,
        channel,
        timestamp: msg.timeStamp,
      };

      // 0x90 = note-on. velocity 0 is the running-status note-off.
      if (status === 0x90 && velocity > 0) {
        noteOnHandlers.current.forEach((h) => h(event));
      } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
        noteOffHandlers.current.forEach((h) => h(event));
      }
    };
    currentInputRef.current = input;

    return () => {
      if (input) input.onmidimessage = null;
    };
  }, [selectedInputId]);

  const onNoteOn = useCallback((h: NoteHandler) => {
    noteOnHandlers.current.add(h);
    return () => {
      noteOnHandlers.current.delete(h);
    };
  }, []);

  const onNoteOff = useCallback((h: NoteHandler) => {
    noteOffHandlers.current.add(h);
    return () => {
      noteOffHandlers.current.delete(h);
    };
  }, []);

  return {
    supported,
    ready,
    error,
    inputs,
    selectedInputId,
    selectInput: setSelectedInputId,
    onNoteOn,
    onNoteOff,
  };
}
