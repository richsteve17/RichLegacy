/**
 * Pad mapping — translates a MIDI (channel, note) tuple into a logical
 * on-screen pad index, and binds physical pads to specific drum elements
 * (Kick, Snare, Hi-Hat, Crash, Toms, etc.).
 *
 * Supported controllers:
 * 1. Reloop Ready:
 *    - 16 full-color performance pads (8 per deck in two 4×2 grids).
 *    - Supports DUAL-DECK mode (both decks active simultaneously for 2-handed drumming!)
 *    - Deck 1 (Left hand) = MIDI Ch 5 (0-indexed channel 4, status 0x94)
 *    - Deck 2 (Right hand) = MIDI Ch 6 (0-indexed channel 5, status 0x95)
 *    - Notes 20..27 (base) and 28..35 (shift layer)
 *
 * 2. Reloop Buddy:
 *    - Distinct 8-pad portable controller.
 *    - Deck 1 = MIDI Ch 1 (0-indexed 0) / Deck 2 = MIDI Ch 2 (0-indexed 1)
 *
 * 3. Hercules DJControl Mix:
 *    - 4 pads per deck (2×2 layout).
 *    - Deck 1 = MIDI Ch 7 (0-indexed 6) / Deck 2 = MIDI Ch 8 (0-indexed 7)
 */
import type { ControllerType, DeckMode } from './types';

export const PAD_COUNT = 16;
export const DEFAULT_PAD_COUNT = 16;

export type DeckId = 1 | 2;

export type DrumElement =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'hihatOpen'
  | 'crash'
  | 'ride'
  | 'tomLow'
  | 'tomMid'
  | 'tomHigh'
  | 'percussion';

export const DRUM_NAMES: Record<DrumElement, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Closed Hi-Hat',
  hihatOpen: 'Open Hi-Hat',
  crash: 'Crash Cymbal',
  ride: 'Ride Cymbal',
  tomLow: 'Floor / Low Tom',
  tomMid: 'Mid Tom',
  tomHigh: 'High Tom',
  percussion: 'Perc / Clap',
};

/**
 * Default 16-pad layout optimized for two-handed finger drumming on Reloop Ready:
 * - Left Hand (Deck 1 / Left Deck - Pads 1..8): Rhythm Core (Kick, Snare, Toms)
 * - Right Hand (Deck 2 / Right Deck - Pads 9..16): Timekeeping, Cymbals, Accents
 */
export const DEFAULT_DRUM_ASSIGNMENTS_16: DrumElement[] = [
  // Deck 1 (Left Hand - Rhythm Engine)
  'kick',       // P1: Main Kick
  'snare',      // P2: Main Snare
  'kick',       // P3: Punch / Sub Kick
  'snare',      // P4: Rim / Alt Snare
  'tomLow',     // P5: Floor Tom
  'tomMid',     // P6: Mid Tom
  'tomHigh',    // P7: High Tom
  'hihatOpen',  // P8: Open Hi-Hat Accent

  // Deck 2 (Right Hand - Timekeeping & Accents)
  'hihat',      // P9: Closed Hi-Hat (main right-hand pulse!)
  'hihatOpen',  // P10: Open Hi-Hat sizzle
  'crash',      // P11: Punk Crash Cymbal
  'ride',       // P12: Ride Cymbal
  'snare',      // P13: Snare Accent / Roll (Right Hand)
  'kick',       // P14: Double Kick (Right Hand)
  'tomLow',     // P15: Secondary Tom
  'percussion', // P16: Percussion / Handclap
];

export const DEFAULT_DRUM_ASSIGNMENTS_8: DrumElement[] = [
  'kick',       // P1
  'snare',      // P2
  'hihat',      // P3
  'crash',      // P4
  'tomLow',     // P5
  'tomHigh',    // P6
  'ride',       // P7
  'percussion', // P8
];

export const DEFAULT_DRUM_ASSIGNMENTS_4: DrumElement[] = [
  'kick',  // P1
  'snare', // P2
  'hihat', // P3
  'crash', // P4
];

// Reloop Ready note definitions
export const RELOOP_READY_BASE_NOTES = [20, 21, 22, 23, 24, 25, 26, 27];
export const RELOOP_READY_SHIFT_NOTES = [28, 29, 30, 31, 32, 33, 34, 35];

// Hercules DJControl Mix note offsets
export const HERCULES_MODE_OFFSETS: Record<string, number> = {
  hotCue: 0x00,
  sampler: 0x10,
  fx: 0x20,
  loop: 0x30,
};

export function channelForDeck(controller: ControllerType, deck: DeckId): number {
  if (controller === 'reloop-ready') {
    return deck === 1 ? 4 : 5; // Deck 1 = 4 (Ch 5), Deck 2 = 5 (Ch 6)
  }
  if (controller === 'reloop-buddy') {
    return deck === 1 ? 0 : 1; // Deck 1 = 0 (Ch 1), Deck 2 = 1 (Ch 2)
  }
  // Hercules DJControl Mix: Deck 1 = 6 (Ch 7), Deck 2 = 7 (Ch 8)
  return deck === 1 ? 6 : 7;
}

const STORAGE_KEY = 'drumpad.padMapping.v7';

export interface PadMapping {
  controller: ControllerType;
  /** Deck mode: 'dual' (16 pads across both decks), 'deck1' (8 pads), 'deck2' (8 pads). */
  deckMode: DeckMode;
  /** Active deck when in single-deck mode (1 or 2). */
  deck: DeckId;
  /** Number of active pads (16 for dual deck, 8 for single deck, 4 for Hercules). */
  padCount: number;
  /** Map from `${channel}:${note}` → pad index 0..padCount-1. */
  byKey: Record<string, number>;
  /** Drum assignment for each pad. */
  drumAssignments: DrumElement[];
  /** Display labels for each on-screen pad. */
  labels: string[];
}

export function padKey(channel: number, note: number): string {
  return `${channel}:${note}`;
}

export function generateLabels(drums: DrumElement[], deckMode: DeckMode = 'dual'): string[] {
  return drums.map((d, i) => {
    const name = DRUM_NAMES[d] ?? d.toUpperCase();
    if (deckMode === 'dual') {
      const deckNum = i < 8 ? 1 : 2;
      const padInDeck = (i % 8) + 1;
      return `P${i + 1} (D${deckNum}#${padInDeck}): ${name}`;
    }
    return `P${i + 1}: ${name}`;
  });
}

/**
 * Generates default mapping for the chosen controller preset and deck mode.
 */
export function defaultMapping(
  controller: ControllerType = 'reloop-ready',
  deckMode: DeckMode = 'dual',
  deck: DeckId = 1,
): PadMapping {
  const byKey: Record<string, number> = {};
  let padCount = 16;
  let drumAssignments: DrumElement[];

  if (controller === 'hercules') {
    padCount = 4;
    deckMode = 'deck1';
    drumAssignments = [...DEFAULT_DRUM_ASSIGNMENTS_4];
    const ch = channelForDeck(controller, deck);
    for (const offset of Object.values(HERCULES_MODE_OFFSETS)) {
      for (let p = 0; p < 4; p++) {
        byKey[padKey(ch, offset + p)] = p;
      }
    }
  } else if (controller === 'reloop-buddy') {
    if (deckMode === 'dual') {
      padCount = 16;
      drumAssignments = [...DEFAULT_DRUM_ASSIGNMENTS_16];
      // Deck 1 (ch 0)
      for (let p = 0; p < 8; p++) {
        byKey[padKey(0, 20 + p)] = p;
      }
      // Deck 2 (ch 1)
      for (let p = 0; p < 8; p++) {
        byKey[padKey(1, 20 + p)] = 8 + p;
      }
    } else {
      padCount = 8;
      drumAssignments = [...DEFAULT_DRUM_ASSIGNMENTS_8];
      const ch = channelForDeck(controller, deck);
      for (let p = 0; p < 8; p++) {
        byKey[padKey(ch, 20 + p)] = p;
      }
    }
  } else {
    // Reloop Ready (Default)
    if (deckMode === 'dual') {
      padCount = 16;
      drumAssignments = [...DEFAULT_DRUM_ASSIGNMENTS_16];
      // Deck 1 (Channel 4) -> Pads 0..7
      for (let p = 0; p < 8; p++) {
        byKey[padKey(4, RELOOP_READY_BASE_NOTES[p])] = p;
        byKey[padKey(4, RELOOP_READY_SHIFT_NOTES[p])] = p;
      }
      // Deck 2 (Channel 5) -> Pads 8..15
      for (let p = 0; p < 8; p++) {
        byKey[padKey(5, RELOOP_READY_BASE_NOTES[p])] = 8 + p;
        byKey[padKey(5, RELOOP_READY_SHIFT_NOTES[p])] = 8 + p;
      }
    } else {
      padCount = 8;
      drumAssignments = [...DEFAULT_DRUM_ASSIGNMENTS_8];
      const ch = channelForDeck('reloop-ready', deck);
      for (let p = 0; p < 8; p++) {
        byKey[padKey(ch, RELOOP_READY_BASE_NOTES[p])] = p;
        byKey[padKey(ch, RELOOP_READY_SHIFT_NOTES[p])] = p;
      }
    }
  }

  return {
    controller,
    deckMode,
    deck,
    padCount,
    byKey,
    drumAssignments,
    labels: generateLabels(drumAssignments, deckMode),
  };
}

export function loadMapping(): PadMapping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMapping('reloop-ready', 'dual');
    const parsed = JSON.parse(raw) as Partial<PadMapping>;
    if (!parsed || typeof parsed !== 'object' || !parsed.byKey) {
      return defaultMapping('reloop-ready', 'dual');
    }
    const controller: ControllerType =
      parsed.controller === 'hercules' ||
      parsed.controller === 'reloop-buddy' ||
      parsed.controller === 'custom'
        ? parsed.controller
        : 'reloop-ready';

    const deckMode: DeckMode =
      parsed.deckMode === 'deck1' || parsed.deckMode === 'deck2' || parsed.deckMode === 'dual'
        ? parsed.deckMode
        : 'dual';

    const deck: DeckId = parsed.deck === 2 ? 2 : 1;
    const padCount: number =
      parsed.padCount === 16 ? 16 : parsed.padCount === 4 ? 4 : 8;

    const defaultAssignments =
      padCount === 16
        ? DEFAULT_DRUM_ASSIGNMENTS_16
        : padCount === 4
          ? DEFAULT_DRUM_ASSIGNMENTS_4
          : DEFAULT_DRUM_ASSIGNMENTS_8;

    const drumAssignments: DrumElement[] =
      Array.isArray(parsed.drumAssignments) &&
      parsed.drumAssignments.length === padCount
        ? (parsed.drumAssignments as DrumElement[])
        : [...defaultAssignments];

    return {
      controller,
      deckMode,
      deck,
      padCount,
      byKey: parsed.byKey as Record<string, number>,
      drumAssignments,
      labels: generateLabels(drumAssignments, deckMode),
    };
  } catch {
    return defaultMapping('reloop-ready', 'dual');
  }
}

export function saveMapping(m: PadMapping): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* localStorage may be unavailable in private browsing — ignore. */
  }
}

/** Look up which on-screen pad a (channel, note) belongs to, or null. */
export function noteToPad(
  mapping: PadMapping,
  channel: number,
  note: number,
): number | null {
  const v = mapping.byKey[padKey(channel, note)];
  return typeof v === 'number' && v < mapping.padCount ? v : null;
}

/**
 * Look up the primary on-screen pad assigned to a drum type (e.g. 'kick').
 * Prioritizes natural finger drumming placements:
 * - Kick: Pad 1 (index 0)
 * - Snare: Pad 2 (index 1)
 * - Hi-Hat: Pad 9 (index 8) on 16 pads, or Pad 3 (index 2) on 8 pads
 * - Crash: Pad 11 (index 10) on 16 pads, or Pad 4 (index 3) on 8 pads
 */
export function getPadForDrum(
  mapping: PadMapping,
  drumType: string,
): number | null {
  const normalized = drumType.toLowerCase();

  // Explicit prioritized search for natural hand placements on 16 pads
  if (mapping.padCount === 16) {
    if (normalized === 'kick') {
      if (mapping.drumAssignments[0] === 'kick') return 0;
    }
    if (normalized === 'snare') {
      if (mapping.drumAssignments[1] === 'snare') return 1;
    }
    if (normalized === 'hihat') {
      // Right hand closed hat (Pad 9 / index 8)
      if (mapping.drumAssignments[8] === 'hihat') return 8;
    }
    if (normalized === 'crash') {
      // Right hand crash (Pad 11 / index 10)
      if (mapping.drumAssignments[10] === 'crash') return 10;
    }
  }

  // Fallback to first matching pad
  const idx = mapping.drumAssignments.findIndex((d) => {
    const dLower = d.toLowerCase();
    if (dLower === normalized) return true;
    if (normalized === 'hihat' && (dLower === 'hihat' || dLower === 'hihatopen' || dLower === 'ride')) return true;
    if (normalized === 'crash' && (dLower === 'crash' || dLower === 'ride')) return true;
    if (normalized.includes('tom') && dLower.includes('tom')) return true;
    return false;
  });
  return idx !== -1 && idx < mapping.padCount ? idx : null;
}

/**
 * Returns ALL pad indices that match a drum type.
 * Allows the finger drummer to hit either pad (e.g. Left-hand Kick Pad 1 or Right-hand Kick Pad 14).
 */
export function getAllPadsForDrum(
  mapping: PadMapping,
  drumType: string,
): number[] {
  const normalized = drumType.toLowerCase();
  const out: number[] = [];

  for (let i = 0; i < mapping.padCount; i++) {
    const dLower = mapping.drumAssignments[i]?.toLowerCase() ?? '';
    if (dLower === normalized) {
      out.push(i);
    } else if (normalized === 'hihat' && (dLower === 'hihat' || dLower === 'hihatopen' || dLower === 'ride')) {
      out.push(i);
    } else if (normalized === 'crash' && (dLower === 'crash' || dLower === 'ride')) {
      out.push(i);
    } else if (normalized.includes('tom') && dLower.includes('tom')) {
      out.push(i);
    }
  }

  return out;
}

/**
 * Rebinds a specific pad to a different drum element.
 */
export function setDrumForPad(
  mapping: PadMapping,
  padIndex: number,
  drum: DrumElement,
): PadMapping {
  const nextDrums = [...mapping.drumAssignments];
  nextDrums[padIndex] = drum;
  return {
    ...mapping,
    drumAssignments: nextDrums,
    labels: generateLabels(nextDrums, mapping.deckMode),
  };
}

/**
 * Calibration: bind a (channel, note) to a specific pad.
 */
export function setPadForNote(
  mapping: PadMapping,
  channel: number,
  note: number,
  pad: number,
): PadMapping {
  const next: Record<string, number> = { ...mapping.byKey };
  for (const k of Object.keys(next)) {
    if (next[k] === pad) delete next[k];
  }
  next[padKey(channel, note)] = pad;
  return { ...mapping, byKey: next };
}

/** Switch the controller preset. */
export function withController(
  _mapping: PadMapping,
  controller: ControllerType,
  deckMode: DeckMode = 'dual',
): PadMapping {
  return defaultMapping(controller, deckMode);
}

/** Switch deck mode ('dual' vs 'deck1' vs 'deck2'). */
export function withDeckMode(
  mapping: PadMapping,
  deckMode: DeckMode,
): PadMapping {
  const deck: DeckId = deckMode === 'deck2' ? 2 : 1;
  return defaultMapping(mapping.controller, deckMode, deck);
}
