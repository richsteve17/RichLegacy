import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResult } from '../../lib/types';

interface Props {
  analysis: AnalysisResult;
}

const PADS = ['Kick', 'Snare', 'Hat', 'Tom'] as const;

/**
 * Practice mode v0:
 *  - Touch-friendly drum pads (works on iPhone).
 *  - Counts your taps so you can compare to the song's onset count.
 *
 * Extension points:
 *  - Sync visual cue with audio currentTime (lift audio ref into context).
 *  - Score taps against onset times for accuracy/timing feedback.
 *  - Real sample playback per pad via Web Audio API.
 */
export default function PracticePanel({ analysis }: Props) {
  const [taps, setTaps] = useState<number>(0);
  const [active, setActive] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const target = analysis.onsets.count;

  const accuracy = useMemo(() => {
    if (target === 0) return 0;
    return Math.min(100, Math.round((taps / target) * 100));
  }, [taps, target]);

  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  function ensureContext(): AudioContext {
    // Lazy-create on first user gesture (iOS requirement).
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }

  function click(pad: string) {
    const ctx = ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();

    // Quick synthesised click — placeholder until we load real samples.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq =
      pad === 'Kick' ? 80 : pad === 'Snare' ? 200 : pad === 'Tom' ? 140 : 600;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);

    setActive(pad);
    setTaps((t) => t + 1);
    window.setTimeout(() => setActive(null), 90);
  }

  return (
    <section className="card">
      <h2>4. Practice</h2>
      <p className="muted">
        Tap along with the song. Target onsets:{' '}
        <strong>{target}</strong> · Your taps: <strong>{taps}</strong> ·
        Coverage: <strong>{accuracy}%</strong>
      </p>

      <div className="pads">
        {PADS.map((pad) => (
          <button
            key={pad}
            type="button"
            className={`pad${active === pad ? ' pad--active' : ''}`}
            onPointerDown={() => click(pad)}
          >
            {pad}
          </button>
        ))}
      </div>

      <button className="btn" onClick={() => setTaps(0)}>
        Reset taps
      </button>
    </section>
  );
}
