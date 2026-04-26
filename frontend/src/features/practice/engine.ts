/**
 * Practice engine — pure functions for converting analysis results
 * into a scheduled drum-pattern, detecting hits, and tracking misses.
 *
 * Lives outside React so it's trivial to unit-test and swap.
 */
import type { AnalysisResult } from '../../lib/types';
import { PAD_COUNT } from '../../lib/midi/padMapping';

/** Tolerance window for a hit (ms either side of the target time). */
export const HIT_WINDOW_MS = 150;

/** How far ahead we light up the "next pad" cue (seconds). */
export const LOOKAHEAD_S = 1.0;

export type HitStatus = 'pending' | 'hit' | 'wrong' | 'missed';

export interface ScheduledHit {
  /** Index in the original onset array. */
  index: number;
  /** Seconds from the start of the song. */
  time: number;
  /** Expected pad (0..PAD_COUNT-1). */
  pad: number;
  /** Lifecycle. */
  status: HitStatus;
  /**
   * If `status` is 'hit' or 'wrong': how late (positive) or early
   * (negative) the player hit, in milliseconds.
   */
  hitDelta?: number;
  /** If 'wrong': which pad they actually pressed. */
  actualPad?: number;
}

export type PatternMode =
  | 'kick'        // every onset → pad 0 (warm-up / stamina)
  | 'kickSnare'   // alternating pads 0 and 1
  | 'rotate3'     // rotate pads 0..2
  | 'rotate4';    // rotate all four pads

/**
 * Map an onset index → pad based on the chosen pattern mode.
 * Always returns a value in [0, PAD_COUNT-1].
 */
export function padForOnset(i: number, mode: PatternMode): number {
  let p: number;
  switch (mode) {
    case 'kick':       p = 0; break;
    case 'kickSnare':  p = i % 2; break;
    case 'rotate3':    p = i % 3; break;
    case 'rotate4':    p = i % PAD_COUNT; break;
  }
  return Math.min(p, PAD_COUNT - 1);
}

export function generatePattern(
  analysis: AnalysisResult,
  mode: PatternMode = 'rotate4',
): ScheduledHit[] {
  return analysis.onsets.times.map((t, i) => ({
    index: i,
    time: t,
    pad: padForOnset(i, mode),
    status: 'pending' as const,
  }));
}

/** Reset every hit back to 'pending' (used on a session restart). */
export function resetHits(hits: ScheduledHit[]): ScheduledHit[] {
  return hits.map((h) => ({
    index: h.index,
    time: h.time,
    pad: h.pad,
    status: 'pending',
  }));
}

export interface HitAttemptResult {
  /** Index of the target consumed, or -1 if no target was nearby. */
  index: number;
  result: 'hit' | 'wrong' | 'noTarget';
  /** Signed delta in ms (currentTime - target.time). */
  delta: number;
}

/**
 * The user pressed `pad` at song time `currentTime`. Find the closest
 * pending target inside HIT_WINDOW_MS and decide whether it was a hit
 * or a wrong-pad press. If no target is nearby, returns 'noTarget'.
 *
 * NOTE: this function is read-only — it does not mutate `hits`. The
 * caller is responsible for applying the result.
 */
export function attemptHit(
  hits: ScheduledHit[],
  pad: number,
  currentTime: number,
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
  return {
    index: bestIdx,
    result: target.pad === pad ? 'hit' : 'wrong',
    delta,
  };
}

/**
 * Returns the indices of any pending hits whose hit-window has fully
 * passed. The caller should mark them as 'missed'.
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

/**
 * The pad we should highlight as "coming up next" — the earliest
 * pending hit within the lookahead window. Returns null if there is
 * no upcoming target.
 */
export function nextPadCue(
  hits: ScheduledHit[],
  currentTime: number,
): { pad: number; index: number; time: number } | null {
  const horizon = currentTime + LOOKAHEAD_S;
  const earliestActive = currentTime - HIT_WINDOW_MS / 1000;
  for (const h of hits) {
    if (h.status !== 'pending') continue;
    if (h.time < earliestActive) continue;
    if (h.time > horizon) return null;
    return { pad: h.pad, index: h.index, time: h.time };
  }
  return null;
}

export interface ScoreSummary {
  scheduled: number;
  hit: number;
  wrong: number;
  missed: number;
  pending: number;
  /** hits / (hits + wrong + missed), as 0..100 integer. */
  accuracyPct: number;
  /** Mean |delta| across hits, in ms. */
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
      case 'wrong':   wrong++; break;
      case 'missed':  missed++; break;
      case 'pending': pending++; break;
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
