/**
 * Practice engine — pure functions for converting analyzed drum transients
 * into musically accurate scheduled drum patterns (Kick, Snare, Hi-Hat, etc.).
 *
 * Supports two-handed dual-deck finger drumming (Deck 1 Left Hand + Deck 2 Right Hand),
 * single-drum isolation, 2-pad groove training (Kick + Snare),
 * and full transcribed grooves with simultaneous multi-pad hits.
 */
import type { AnalysisResult } from '../../lib/types';
import type { DrumElement, PadMapping } from '../../lib/midi/padMapping';
import { getPadForDrum } from '../../lib/midi/padMapping';

/** Tolerance window for a hit (ms either side of the target time). */
export const HIT_WINDOW_MS = 160;

/** How far ahead we light up the "next pad" cue (seconds). */
export const LOOKAHEAD_S = 1.0;

export type HitStatus = 'pending' | 'hit' | 'wrong' | 'missed';

export interface ScheduledHit {
  /** Index in the original sequence. */
  index: number;
  /** Seconds from the start of the song. */
  time: number;
  /**
   * Expected pad index(es) to hit.
   * Supports 1 or 2 simultaneous pads (e.g. Kick + Hi-Hat on beat 1).
   */
  pads: number[];
  /** Expected drum names (e.g. ['kick'], ['kick', 'hihat'], ['snare']). */
  drums: string[];
  /** Primary pad index for backward-compatible lookups. */
  pad: number;
  /** Lifecycle status. */
  status: HitStatus;
  /** Timing accuracy delta in ms (positive = late, negative = early). */
  hitDelta?: number;
  /** Pad that was physically pressed. */
  actualPad?: number;
}

export type PatternMode =
  | 'kickSnare'        // 2 Pads: Kick (P1) + Snare (P2) backbeat groove
  | 'fullGroove'       // Multi-Pad: Full transcribed drum kit (Kick, Snare, Hi-Hat, Crash) across both decks
  | 'kickOnly'         // 1 Pad: Kick drum stamina & timing
  | 'snareOnly'        // 1 Pad: Snare backbeat precision
  | 'hatOnly'          // 1 Pad: Hi-Hat / Cymbal pulse
  | 'rotationalWarmup';// Finger independence drill (1 -> 2 -> 3 -> 4)

export function generatePattern(
  analysis: AnalysisResult,
  mode: PatternMode = 'kickSnare',
  mapping: PadMapping,
): ScheduledHit[] {
  const kickPad = getPadForDrum(mapping, 'kick') ?? 0;
  const snarePad = getPadForDrum(mapping, 'snare') ?? 1;
  const hatPad = getPadForDrum(mapping, 'hihat') ?? (mapping.padCount === 16 ? 8 : 2);
  const crashPad = getPadForDrum(mapping, 'crash') ?? (mapping.padCount === 16 ? 10 : 3);

  if (analysis.drum_hits && analysis.drum_hits.length > 0) {
    const hits: ScheduledHit[] = [];

    for (let i = 0; i < analysis.drum_hits.length; i++) {
      const dh = analysis.drum_hits[i];
      const hasKick = dh.drums.includes('kick');
      const hasSnare = dh.drums.includes('snare');
      const hasHat = dh.drums.includes('hihat');
      const hasCrash = dh.drums.includes('crash');

      const targetPads: number[] = [];
      const targetDrums: string[] = [];

      switch (mode) {
        case 'kickSnare':
          // 2-pad practice: Kick (Pad 1) and Snare (Pad 2)
          if (hasKick) {
            targetPads.push(kickPad);
            targetDrums.push('kick');
          }
          if (hasSnare) {
            targetPads.push(snarePad);
            targetDrums.push('snare');
          }
          break;

        case 'fullGroove':
          // Full kit: Left Hand Kick/Snare + Right Hand Hi-Hat/Crash
          if (hasKick) {
            targetPads.push(kickPad);
            targetDrums.push('kick');
          }
          if (hasSnare) {
            targetPads.push(snarePad);
            targetDrums.push('snare');
          }
          if (hasHat) {
            targetPads.push(hatPad);
            targetDrums.push('hihat');
          }
          if (hasCrash) {
            targetPads.push(crashPad);
            targetDrums.push('crash');
          }
          break;

        case 'kickOnly':
          if (hasKick) {
            targetPads.push(kickPad);
            targetDrums.push('kick');
          }
          break;

        case 'snareOnly':
          if (hasSnare) {
            targetPads.push(snarePad);
            targetDrums.push('snare');
          }
          break;

        case 'hatOnly':
          if (hasHat || hasCrash) {
            targetPads.push(hasCrash ? crashPad : hatPad);
            targetDrums.push(hasCrash ? 'crash' : 'hihat');
          }
          break;

        case 'rotationalWarmup':
          // Finger agility warm-up: 4-pad loop
          const p = i % Math.min(mapping.padCount, 4);
          targetPads.push(p);
          targetDrums.push(`Pad ${p + 1}`);
          break;
      }

      if (targetPads.length > 0) {
        const uniquePads = Array.from(new Set(targetPads));
        hits.push({
          index: i,
          time: dh.time,
          pads: uniquePads,
          drums: targetDrums,
          pad: uniquePads[0],
          status: 'pending',
        });
      }
    }

    if (hits.length > 0) return hits;
  }

  // Musical fallback based on tempo and onsets (Kick on 1/3, Snare on 2/4, Hat on 8ths)
  // NEVER cycles 1..8 sequentially!
  const bpm = analysis.tempo?.bpm && analysis.tempo.bpm > 40 ? analysis.tempo.bpm : 120;
  const spb = 60 / bpm; // Seconds per beat

  return analysis.onsets.times.map((t, i) => {
    const beatInBar = (t / spb) % 4; // 0..4
    const isDownbeat = beatInBar < 0.6 || (beatInBar >= 1.8 && beatInBar < 2.4); // Beats 1 & 3
    const isBackbeat = (beatInBar >= 0.8 && beatInBar < 1.4) || (beatInBar >= 2.8 && beatInBar < 3.4); // Beats 2 & 4

    let pads: number[] = [];
    let drums: string[] = [];

    switch (mode) {
      case 'kickSnare':
        if (isBackbeat) {
          pads = [snarePad];
          drums = ['snare'];
        } else {
          pads = [kickPad];
          drums = ['kick'];
        }
        break;

      case 'fullGroove':
        if (isBackbeat) {
          pads = [snarePad, hatPad];
          drums = ['snare', 'hihat'];
        } else if (isDownbeat) {
          pads = [kickPad, hatPad];
          drums = ['kick', 'hihat'];
        } else {
          pads = [hatPad];
          drums = ['hihat'];
        }
        break;

      case 'kickOnly':
        pads = [kickPad];
        drums = ['kick'];
        break;

      case 'snareOnly':
        pads = [snarePad];
        drums = ['snare'];
        break;

      case 'hatOnly':
        pads = [hatPad];
        drums = ['hihat'];
        break;

      case 'rotationalWarmup':
        const p = i % Math.min(mapping.padCount, 4);
        pads = [p];
        drums = [`Pad ${p + 1}`];
        break;
    }

    const uniquePads = Array.from(new Set(pads));
    return {
      index: i,
      time: t,
      pads: uniquePads,
      drums,
      pad: uniquePads[0] ?? 0,
      status: 'pending' as const,
    };
  });
}

/** Reset every hit back to 'pending' (used on session restart). */
export function resetHits(hits: ScheduledHit[]): ScheduledHit[] {
  return hits.map((h) => ({
    ...h,
    status: 'pending',
    hitDelta: undefined,
    actualPad: undefined,
  }));
}

export interface HitAttemptResult {
  index: number;
  result: 'hit' | 'wrong' | 'noTarget';
  delta: number;
}

function matchDrumType(targetDrum: string, padDrum?: DrumElement): boolean {
  if (!padDrum) return false;
  const t = targetDrum.toLowerCase();
  const p = padDrum.toLowerCase();
  if (t === p) return true;
  if (t === 'hihat' && (p === 'hihat' || p === 'hihatopen' || p === 'ride')) return true;
  if (t === 'crash' && (p === 'crash' || p === 'ride')) return true;
  if (t.includes('tom') && p.includes('tom')) return true;
  return false;
}

/**
 * Handles incoming player hit on `pad` at time `currentTime`.
 * Supports both direct pad match AND drum-element match across decks (two-handed dexterity).
 */
export function attemptHit(
  hits: ScheduledHit[],
  pad: number,
  currentTime: number,
  mapping?: PadMapping,
): HitAttemptResult {
  const windowSec = HIT_WINDOW_MS / 1000;
  let bestIdx = -1;
  let bestAbsDelta = Infinity;

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (h.status !== 'pending') continue;
    const delta = currentTime - h.time;
    const abs = Math.abs(delta);
    if (abs > windowSec) continue;
    if (abs < bestAbsDelta) {
      bestAbsDelta = abs;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) {
    return { index: -1, result: 'noTarget', delta: 0 };
  }

  const target = hits[bestIdx];
  const delta = (currentTime - target.time) * 1000;

  // Direct pad match or drum element match
  const directMatch = target.pads.includes(pad);
  const drumMatch =
    mapping && mapping.drumAssignments[pad]
      ? target.drums.some((d) => matchDrumType(d, mapping.drumAssignments[pad]))
      : false;

  const isMatch = directMatch || drumMatch;

  return {
    index: bestIdx,
    result: isMatch ? 'hit' : 'wrong',
    delta,
  };
}

/**
 * Scans for missed targets whose timing window has passed.
 */
export function scanMisses(
  hits: ScheduledHit[],
  currentTime: number,
): number[] {
  const cutoff = currentTime - HIT_WINDOW_MS / 1000;
  const out: number[] = [];
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].status === 'pending' && hits[i].time < cutoff) {
      out.push(i);
    }
  }
  return out;
}

export interface NextPadCueResult {
  pads: number[];
  pad: number;
  drums: string[];
  index: number;
  time: number;
}

/**
 * Returns the upcoming target hit(s) within the lookahead window.
 * Supports multiple simultaneous pads (e.g. Kick + Hi-Hat).
 */
export function nextPadCue(
  hits: ScheduledHit[],
  currentTime: number,
): NextPadCueResult | null {
  const horizon = currentTime + LOOKAHEAD_S;
  const earliestActive = currentTime - HIT_WINDOW_MS / 1000;

  for (const h of hits) {
    if (h.status !== 'pending') continue;
    if (h.time < earliestActive) continue;
    if (h.time > horizon) return null;
    return {
      pads: h.pads,
      pad: h.pad,
      drums: h.drums,
      index: h.index,
      time: h.time,
    };
  }
  return null;
}

export interface ScoreSummary {
  scheduled: number;
  hit: number;
  wrong: number;
  missed: number;
  pending: number;
  accuracyPct: number;
  meanTimingMs: number;
}

export function scoreOf(hits: ScheduledHit[]): ScoreSummary {
  let hit = 0;
  let wrong = 0;
  let missed = 0;
  let pending = 0;
  let timingSum = 0;
  let timingCount = 0;

  for (const h of hits) {
    switch (h.status) {
      case 'hit':
        hit++;
        if (typeof h.hitDelta === 'number') {
          timingSum += Math.abs(h.hitDelta);
          timingCount++;
        }
        break;
      case 'wrong':
        wrong++;
        break;
      case 'missed':
        missed++;
        break;
      case 'pending':
        pending++;
        break;
    }
  }

  const evaluated = hit + wrong + missed;
  return {
    scheduled: hits.length,
    hit,
    wrong,
    missed,
    pending,
    accuracyPct: evaluated > 0 ? Math.round((hit / evaluated) * 100) : 0,
    meanTimingMs: timingCount > 0 ? Math.round(timingSum / timingCount) : 0,
  };
}
