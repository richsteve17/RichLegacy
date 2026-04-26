/**
 * Pad mapping — translates a MIDI (channel, note) tuple from the
 * Hercules DJControl Mix into a logical on-screen pad index 0..3.
 *
 * Practice layout: ONE deck's 4 pads, displayed as a 2×2 grid:
 *
 *     ┌──────┬──────┐
 *     │  P1  │  P2  │   ← top-left, top-right
 *     ├──────┼──────┤
 *     │  P3  │  P4  │   ← bottom-left, bottom-right
 *     └──────┴──────┘
 *
 * MIDI defaults (verified against the official Mixxx mapping XML):
 *   - Deck 1 sends on channel 6 (status byte 0x96).
 *   - Deck 2 sends on channel 7 (status byte 0x97).
 *   - Note number depends on the controller's current pad mode:
 *       Hot Cue  : 0x00..0x03   (0..3)
 *       Sampler  : 0x10..0x13   (16..19)
 *       FX       : 0x20..0x23   (32..35)
 *       Loop     : 0x30..0x33   (48..51)
 *
 *   In every mode the offset within the deck is the same:
 *     pad 1 → +0,  pad 2 → +1,  pad 3 → +2,  pad 4 → +3
 *
 * The default mapping pre-populates ALL FOUR modes for the selected
 * deck, so the user can leave the controller in any mode and the app
 * will still respond correctly. Per-pad calibration overrides this.
 */

export const PAD_COUNT = 4;
export const GRID_COLS = 2;
export const GRID_ROWS = 2;

/** Pad mode → note offset within a deck. */
export const MODE_OFFSETS: Record<string, number> = {
  hotCue: 0x00,
  sampler: 0x10,
  fx: 0x20,
  loop: 0x30,
};

export type DeckId = 1 | 2;

/** Channel for Deck 1 / Deck 2 according to the Hercules MIDI spec. */
export function channelForDeck(deck: DeckId): number {
  return deck === 1 ? 6 : 7;
}

const STORAGE_KEY = 'drumpad.padMapping.v3';

export interface PadMapping {
  /** Currently active deck (1 or 2). */
  deck: DeckId;
  /** Map from `${channel}:${note}` → pad index 0..PAD_COUNT-1. */
  byKey: Record<string, number>;
  /** Display labels for each on-screen pad. */
  labels: string[];
}

export function padKey(channel: number, note: number): string {
  return `${channel}:${note}`;
}

export function defaultLabels(): string[] {
  return ['P1', 'P2', 'P3', 'P4'];
}

/**
 * Default mapping for the Hercules DJControl Mix on the chosen deck.
 * Covers all four pad modes (Hot Cue / Sampler / FX / Loop) so the user
 * can practice in whichever mode they prefer.
 */
export function defaultMapping(deck: DeckId = 1): PadMapping {
  const ch = channelForDeck(deck);
  const byKey: Record<string, number> = {};
  for (const offset of Object.values(MODE_OFFSETS)) {
    for (let p = 0; p < PAD_COUNT; p++) {
      byKey[padKey(ch, offset + p)] = p;
    }
  }
  return { deck, byKey, labels: defaultLabels() };
}

export function loadMapping(): PadMapping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMapping();
    const parsed = JSON.parse(raw) as Partial<PadMapping>;
    if (!parsed || typeof parsed !== 'object' || !parsed.byKey) {
      return defaultMapping();
    }
    const deck: DeckId = parsed.deck === 2 ? 2 : 1;
    return {
      deck,
      byKey: parsed.byKey as Record<string, number>,
      labels:
        Array.isArray(parsed.labels) && parsed.labels.length === PAD_COUNT
          ? (parsed.labels as string[])
          : defaultLabels(),
    };
  } catch {
    return defaultMapping();
  }
}

export function saveMapping(m: PadMapping): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* localStorage may be unavailable (private browsing) — ignore. */
  }
}

/** Look up which on-screen pad a (channel, note) belongs to, or null. */
export function noteToPad(
  mapping: PadMapping,
  channel: number,
  note: number,
): number | null {
  const v = mapping.byKey[padKey(channel, note)];
  return typeof v === 'number' ? v : null;
}

/**
 * Calibration: bind a (channel, note) to a specific pad. Removes other
 * bindings that pointed to that pad so the calibration is unambiguous.
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

/** Switch the active deck. Rebuilds the default mapping on the new deck. */
export function withDeck(_mapping: PadMapping, deck: DeckId): PadMapping {
  return defaultMapping(deck);
}
