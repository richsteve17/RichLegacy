import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ControllerType, MidiInputInfo, MidiNoteEvent, MidiOutputInfo, NoteHandler } from './types';

// Match Reloop controllers (Ready, Buddy, etc.)
const RELOOP_MATCH = /reloop|ready|buddy/i;
// Match Hercules DJControl Mix and close relatives by name
const HERCULES_MATCH = /dj.?control.?mix|hercules/i;

export interface UseWebMidiResult {
  /** True if the browser exposes navigator.requestMIDIAccess. */
  supported: boolean;
  /** True once MIDIAccess has been granted and inputs/outputs enumerated. */
  ready: boolean;
  /** User-visible error message, if any. */
  error: string | null;
  /** Currently visible MIDI inputs. */
  inputs: MidiInputInfo[];
  /** Currently visible MIDI outputs. */
  outputs: MidiOutputInfo[];
  /** ID of the input we're listening to, or null. */
  selectedInputId: string | null;
  /** ID of the output we're sending to, or null. */
  selectedOutputId: string | null;
  /** Inferred controller preset based on selected device. */
  detectedController: ControllerType;
  /** Programmatic input switch. */
  selectInput: (id: string | null) => void;
  /** Programmatic output switch. */
  selectOutput: (id: string | null) => void;
  /** Send raw MIDI bytes (e.g. [0x94, 20, 79] for LED on). */
  sendMidi: (bytes: number[]) => void;
  /** Subscribe to note-on. Returns an unsubscribe fn. */
  onNoteOn: (handler: NoteHandler) => () => void;
  /** Subscribe to note-off. Returns an unsubscribe fn. */
  onNoteOff: (handler: NoteHandler) => () => void;
}

/**
 * React hook for the Web MIDI API (Input + Output).
 *
 * - Lazily requests access on mount.
 * - Re-enumerates inputs and outputs whenever the OS reports a state change.
 * - Auto-selects Reloop devices first, falling back to Hercules.
 * - Decodes raw MIDIMessageEvent into a structured MidiNoteEvent.
 * - Exposes `sendMidi` for hardware LED pad illumination.
 *
 * Note: Web MIDI is supported in Chrome, Edge, and Opera on Windows, macOS, Linux, and Android.
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
  const [outputs, setOutputs] = useState<MidiOutputInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);

  const accessRef = useRef<MIDIAccess | null>(null);
  const currentInputRef = useRef<MIDIInput | null>(null);
  const currentOutputRef = useRef<MIDIOutput | null>(null);
  const noteOnHandlers = useRef<Set<NoteHandler>>(new Set());
  const noteOffHandlers = useRef<Set<NoteHandler>>(new Set());

  // --- enumerate inputs and outputs from current MIDIAccess -----------
  const refreshDevices = useCallback(() => {
    const acc = accessRef.current;
    if (!acc) return;

    const inList: MidiInputInfo[] = [];
    acc.inputs.forEach((inp) => {
      inList.push({
        id: inp.id,
        name: inp.name ?? '(unnamed)',
        manufacturer: inp.manufacturer ?? '',
        state: inp.state,
      });
    });
    setInputs(inList);

    const outList: MidiOutputInfo[] = [];
    acc.outputs.forEach((out) => {
      outList.push({
        id: out.id,
        name: out.name ?? '(unnamed)',
        manufacturer: out.manufacturer ?? '',
        state: out.state,
      });
    });
    setOutputs(outList);

    setSelectedInputId((current) => {
      if (current && inList.some((i) => i.id === current)) return current;
      const reloop = inList.find(
        (i) => RELOOP_MATCH.test(i.name) || RELOOP_MATCH.test(i.manufacturer),
      );
      if (reloop) return reloop.id;
      const hercules = inList.find(
        (i) => HERCULES_MATCH.test(i.name) || HERCULES_MATCH.test(i.manufacturer),
      );
      if (hercules) return hercules.id;
      return inList[0]?.id ?? null;
    });

    setSelectedOutputId((current) => {
      if (current && outList.some((o) => o.id === current)) return current;
      const reloop = outList.find(
        (o) => RELOOP_MATCH.test(o.name) || RELOOP_MATCH.test(o.manufacturer),
      );
      if (reloop) return reloop.id;
      const hercules = outList.find(
        (o) => HERCULES_MATCH.test(o.name) || HERCULES_MATCH.test(o.manufacturer),
      );
      if (hercules) return hercules.id;
      return outList[0]?.id ?? null;
    });
  }, []);

  // --- request access on mount ----------------------------------------
  useEffect(() => {
    if (!supported) {
      setError(
        'Web MIDI is not available in this browser. Use Chrome, Edge, or Opera on Windows or macOS.',
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
        acc.onstatechange = () => refreshDevices();
        setReady(true);
        refreshDevices();
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
      currentOutputRef.current = null;
    };
  }, [supported, refreshDevices]);

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
      if (!data || data.length < 2) return;

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

      // 0x90 = note-on. velocity 0 is running-status note-off.
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

  // --- attach selected output -----------------------------------------
  useEffect(() => {
    const acc = accessRef.current;
    if (!acc || !selectedOutputId) {
      currentOutputRef.current = null;
      return;
    }
    const output = acc.outputs.get(selectedOutputId) ?? null;
    currentOutputRef.current = output;
  }, [selectedOutputId]);

  const sendMidi = useCallback((bytes: number[]) => {
    try {
      currentOutputRef.current?.send(bytes);
    } catch (err) {
      console.warn('Failed to send MIDI message:', err);
    }
  }, []);

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

  const detectedController = useMemo<ControllerType>(() => {
    if (!selectedInputId) return 'reloop-ready';
    const found = inputs.find((i) => i.id === selectedInputId);
    if (!found) return 'reloop-ready';
    const target = `${found.name} ${found.manufacturer}`;
    if (/ready/i.test(target)) return 'reloop-ready';
    if (/buddy/i.test(target)) return 'reloop-buddy';
    if (/reloop/i.test(target)) return 'reloop-ready';
    if (HERCULES_MATCH.test(target)) return 'hercules';
    return 'custom';
  }, [selectedInputId, inputs]);

  return {
    supported,
    ready,
    error,
    inputs,
    outputs,
    selectedInputId,
    selectedOutputId,
    detectedController,
    selectInput: setSelectedInputId,
    selectOutput: setSelectedOutputId,
    sendMidi,
    onNoteOn,
    onNoteOff,
  };
}
