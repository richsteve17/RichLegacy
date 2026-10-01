/**
 * Shared MIDI event types — independent of the React hook so the engine
 * can use them too.
 */

export type ControllerType =
  | 'reloop-ready'
  | 'reloop-buddy'
  | 'hercules'
  | 'custom';

export type DeckMode = 'dual' | 'deck1' | 'deck2';


export interface MidiNoteEvent {
  /** MIDI note number 0–127. */
  note: number;
  /** 0–127. 0 typically means note-off via running status. */
  velocity: number;
  /** 0-indexed channel (0–15). Reloop Ready uses 4 (Deck A) and 5 (Deck B); Hercules uses 6 and 7. */
  channel: number;
  /** performance.now()-style timestamp from the MIDI driver. */
  timestamp: number;
}

export type NoteHandler = (e: MidiNoteEvent) => void;

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export interface MidiOutputInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}


