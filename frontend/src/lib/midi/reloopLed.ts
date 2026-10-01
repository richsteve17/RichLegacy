/**
 * Hardware LED feedback for the Reloop Ready DJ controller.
 *
 * Controls the 16 full-color RGB performance pads (8 per deck in a 2×4 grid).
 *
 * Protocol:
 * - Deck 1 (Left Deck) sends/receives on MIDI Ch 5 (0-indexed channel 4, status byte 0x94)
 * - Deck 2 (Right Deck) sends/receives on MIDI Ch 6 (0-indexed channel 5, status byte 0x95)
 * - Pad notes are 20..27 (0x14..0x1B) for pads 1..8 on each deck
 * - Velocity byte encodes 2 bits per color component (r: 0..3, g: 0..3, b: 0..3)
 *   plus bit 6 (0x40) as the bright/full-on flag:
 *     v = (r << 4) | (g << 2) | b | (bright ? 0x40 : 0)
 */
import type { ControllerType, DeckMode } from './types';

export type ReloopLedColor =
  | 'off'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'mint'
  | 'cyan'
  | 'azure'
  | 'blue'
  | 'violet'
  | 'magenta'
  | 'pink'
  | 'white';

export const RELOOP_COLORS: Record<ReloopLedColor, [number, number, number]> = {
  off: [0, 0, 0],
  red: [3, 0, 0],
  orange: [3, 1, 0],
  amber: [3, 2, 0],
  yellow: [3, 3, 0],
  lime: [2, 3, 0],
  green: [0, 3, 0],
  mint: [0, 3, 2],
  cyan: [0, 3, 3],
  azure: [0, 2, 3],
  blue: [0, 0, 3],
  violet: [1, 0, 3],
  magenta: [3, 0, 3],
  pink: [3, 1, 2],
  white: [3, 3, 3],
};

export const RELOOP_PAD_NOTE_BASE = 20; // Pad 1 note (0x14)

/**
 * Calculates the velocity byte (0..127) for a given Reloop RGB color.
 */
export function calcReloopVelocity(
  color: ReloopLedColor,
  bright: boolean = true,
): number {
  if (color === 'off') return 0;
  const [r, g, b] = RELOOP_COLORS[color] ?? [0, 0, 0];
  if (r === 0 && g === 0 && b === 0) return 0;
  let v = (r << 4) | (g << 2) | b;
  if (bright) {
    v |= 1 << 6;
  }
  return v & 0x7f;
}

/**
 * Sends a pad LED color command to the Reloop controller via Web MIDI.
 * Automatically handles 16 pads across Deck 1 (indices 0..7) and Deck 2 (indices 8..15).
 */
export function sendReloopPadLed(
  sendFn: (bytes: number[]) => void,
  padIndex: number,
  color: ReloopLedColor,
  bright: boolean = true,
  controller: ControllerType = 'reloop-ready',
  deckMode: DeckMode = 'dual',
): void {
  let channel = 4; // Default Deck 1 (Ch 5)
  let noteOffset = padIndex;

  if (controller === 'reloop-buddy') {
    if (deckMode === 'dual') {
      channel = padIndex < 8 ? 0 : 1;
      noteOffset = padIndex % 8;
    } else {
      channel = deckMode === 'deck2' ? 1 : 0;
      noteOffset = padIndex % 8;
    }
  } else {
    // Reloop Ready
    if (deckMode === 'dual' || padIndex >= 8) {
      channel = padIndex < 8 ? 4 : 5; // Deck 1 = 4, Deck 2 = 5
      noteOffset = padIndex % 8;
    } else {
      channel = deckMode === 'deck2' ? 5 : 4;
      noteOffset = padIndex % 8;
    }
  }

  const status = 0x90 | channel;
  const note = RELOOP_PAD_NOTE_BASE + noteOffset;
  const velocity = calcReloopVelocity(color, bright);
  sendFn([status, note, velocity]);
}

/**
 * Turns off pad LEDs across all active decks.
 */
export function clearAllReloopLeds(
  sendFn: (bytes: number[]) => void,
  padCount: number = 16,
  controller: ControllerType = 'reloop-ready',
): void {
  const isBuddy = controller === 'reloop-buddy';
  const ch1 = isBuddy ? 0 : 4;
  const ch2 = isBuddy ? 1 : 5;

  // Clear Deck 1
  const status1 = 0x90 | ch1;
  for (let i = 0; i < 8; i++) {
    sendFn([status1, RELOOP_PAD_NOTE_BASE + i, 0]);
  }

  // Clear Deck 2 if in 16-pad or dual mode
  if (padCount > 8) {
    const status2 = 0x90 | ch2;
    for (let i = 0; i < 8; i++) {
      sendFn([status2, RELOOP_PAD_NOTE_BASE + i, 0]);
    }
  }
}

/**
 * Plays an RGB rainbow chase light show across all 16 pads!
 */
export function runRainbowChase(
  sendFn: (bytes: number[]) => void,
  padCount: number = 16,
  controller: ControllerType = 'reloop-ready',
): () => void {
  const rainbow: ReloopLedColor[] = [
    'red',
    'orange',
    'yellow',
    'lime',
    'green',
    'cyan',
    'blue',
    'magenta',
  ];
  let step = 0;
  const timer = setInterval(() => {
    for (let i = 0; i < padCount; i++) {
      const color = rainbow[(step + i) % rainbow.length];
      sendReloopPadLed(sendFn, i, color, true, controller, 'dual');
    }
    step++;
    if (step > 24) {
      clearInterval(timer);
      clearAllReloopLeds(sendFn, padCount, controller);
    }
  }, 90);

  return () => {
    clearInterval(timer);
    clearAllReloopLeds(sendFn, padCount, controller);
  };
}
