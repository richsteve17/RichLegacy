import { useEffect, useMemo, useRef, useState } from 'react';
import { fileUrl } from '../../lib/api';
import { loadMapping, noteToPad, type PadMapping } from '../../lib/midi/padMapping';
import { useWebMidi } from '../../lib/midi/useWebMidi';
import type { AnalysisResult, UploadResult } from '../../lib/types';
import {
  HIT_WINDOW_MS,
  attemptHit,
  generatePattern,
  nextPadCue,
  resetHits,
  scanMisses,
  scoreOf,
  type PatternMode,
  type ScheduledHit,
} from './engine';
import MidiSetup from './MidiSetup';
import PadGrid from './PadGrid';

interface Props {
  upload: UploadResult;
  analysis: AnalysisResult;
}

const FEEDBACK_MS = 130;

export default function PracticePanel({ upload, analysis }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const midi = useWebMidi();

  const [mapping, setMapping] = useState<PadMapping>(() => loadMapping());
  const [mode, setMode] = useState<PatternMode>('rotate4');

  // Derived: scheduled hit list. Memoized; we copy into a mutable ref
  // so MIDI/rAF handlers can update statuses without triggering React
  // updates on every change.
  const initialPattern = useMemo(
    () => generatePattern(analysis, mode),
    [analysis, mode],
  );
  const hitsRef = useRef<ScheduledHit[]>(initialPattern);
  const [tick, setTick] = useState(0); // bump to force re-render of derived values

  useEffect(() => {
    hitsRef.current = resetHits(initialPattern);
    setTick((t) => t + 1);
  }, [initialPattern]);

  const [activePad, setActivePad] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'hit' | 'wrong' | 'tap' | null>(null);
  const [nextPad, setNextPad] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // ----- MIDI input handler --------------------------------------------
  useEffect(() => {
    const off = midi.onNoteOn((e) => {
      const pad = noteToPad(mapping, e.channel, e.note);
      if (pad === null) return;

      const audio = audioRef.current;
      const t = audio?.currentTime ?? 0;

      if (!audio || audio.paused) {
        // Free-play: just light up the pad.
        flashPad(pad, 'tap');
        return;
      }

      const result = attemptHit(hitsRef.current, pad, t);
      if (result.result === 'hit') {
        const h = hitsRef.current[result.index];
        h.status = 'hit';
        h.hitDelta = result.delta;
        flashPad(pad, 'hit');
      } else if (result.result === 'wrong') {
        const h = hitsRef.current[result.index];
        h.status = 'wrong';
        h.hitDelta = result.delta;
        h.actualPad = pad;
        flashPad(pad, 'wrong');
      } else {
        // No nearby target — purely informational.
        flashPad(pad, 'tap');
      }
      setTick((tk) => tk + 1);
    });
    return off;
  }, [midi, mapping]);

  // ----- audio sync loop -----------------------------------------------
  useEffect(() => {
    let raf = 0;
    let lastNext: number | null = null;
    const loop = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        const t = audio.currentTime;

        const missed = scanMisses(hitsRef.current, t);
        if (missed.length > 0) {
          for (const i of missed) hitsRef.current[i].status = 'missed';
          setTick((tk) => tk + 1);
        }

        const cue = nextPadCue(hitsRef.current, t);
        const cuePad = cue ? cue.pad : null;
        if (cuePad !== lastNext) {
          lastNext = cuePad;
          setNextPad(cuePad);
        }
      } else if (lastNext !== null) {
        lastNext = null;
        setNextPad(null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function flashPad(pad: number, kind: 'hit' | 'wrong' | 'tap') {
    setActivePad(pad);
    setFeedback(kind);
    window.setTimeout(() => {
      setActivePad((p) => (p === pad ? null : p));
      setFeedback(null);
    }, FEEDBACK_MS);
  }

  function reset() {
    hitsRef.current = resetHits(initialPattern);
    setTick((t) => t + 1);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  // Score is recomputed on every tick; it's cheap (one pass over hits).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const score = useMemo(() => scoreOf(hitsRef.current), [tick]);

  return (
    <section className="card">
      <h2>4. Practice with your Hercules pad</h2>
      <p className="muted">
        Hit the highlighted pad on your hardware as it lights up. Hit
        window: ±{HIT_WINDOW_MS} ms.
      </p>

      <MidiSetup midi={midi} mapping={mapping} setMapping={setMapping} />

      <div className="row">
        <label>
          Pattern
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PatternMode)}
          >
            <option value="kick">All on pad 1 (warm-up)</option>
            <option value="kickSnare">Pad 1 / 2 alternating</option>
            <option value="rotate3">Rotate pads 1–3</option>
            <option value="rotate4">Rotate all 4 pads</option>
          </select>
        </label>
      </div>

      <audio
        ref={audioRef}
        src={fileUrl(upload.file_id)}
        controls
        playsInline
        preload="metadata"
        className="player"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <PadGrid
        labels={mapping.labels}
        activePad={activePad}
        nextPad={playing ? nextPad : null}
        feedback={feedback}
        onPadTap={(pad) => flashPad(pad, 'tap')}
      />

      <div className="grid">
        <Stat label="Hits" value={`${score.hit} / ${score.scheduled}`} />
        <Stat label="Accuracy" value={`${score.accuracyPct}%`} />
        <Stat label="Wrong pad" value={`${score.wrong}`} />
        <Stat label="Missed" value={`${score.missed}`} />
        <Stat
          label="Avg timing"
          value={score.hit ? `${score.meanTimingMs} ms` : '—'}
        />
      </div>

      <button type="button" className="btn" onClick={reset}>
        Reset session
      </button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}
