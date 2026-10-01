import { useEffect, useMemo, useRef, useState } from 'react';
import { fileUrl } from '../../lib/api';
import { loadMapping, noteToPad, type PadMapping } from '../../lib/midi/padMapping';
import {
  clearAllReloopLeds,
  runRainbowChase,
  sendReloopPadLed,
  type ReloopLedColor,
} from '../../lib/midi/reloopLed';
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
  onChangeSong?: () => void;
}

export default function PracticePanel({ upload, analysis, onChangeSong }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const midi = useWebMidi();

  const [mapping, setMapping] = useState<PadMapping>(() => loadMapping());
  const [mode, setMode] = useState<PatternMode>('fullGroove');
  const [ledFeedback, setLedFeedback] = useState(true);
  const [testingLeds, setTestingLeds] = useState(false);

  // Derived: scheduled hit list. Memoized; we copy into a mutable ref
  // so MIDI/rAF handlers can update statuses without triggering React updates.
  const initialPattern = useMemo(
    () => generatePattern(analysis, mode, mapping),
    [analysis, mode, mapping],
  );
  const hitsRef = useRef<ScheduledHit[]>(initialPattern);
  const [tick, setTick] = useState(0); // bump to force re-render of derived values
  const currentCuePadsRef = useRef<number[]>([]);

  useEffect(() => {
    hitsRef.current = resetHits(initialPattern);
    setTick((t) => t + 1);
  }, [initialPattern]);

  const [activePad, setActivePad] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'hit' | 'wrong' | 'tap' | null>(null);
  const [nextPads, setNextPads] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);

  // ----- Synchronize hardware pad LEDs for upcoming cue pad(s) -----
  useEffect(() => {
    if (!mapping.controller.startsWith('reloop') || !ledFeedback) return;
    const prevPads = currentCuePadsRef.current;

    // Turn off pads no longer queued
    for (const p of prevPads) {
      if (!nextPads.includes(p)) {
        sendReloopPadLed(midi.sendMidi, p, 'off', false, mapping.controller, mapping.deckMode);
      }
    }

    // Light up newly queued pads in bright amber (supports simultaneous multi-pad hits!)
    if (playing) {
      for (const p of nextPads) {
        sendReloopPadLed(midi.sendMidi, p, 'amber', true, mapping.controller, mapping.deckMode);
      }
    }
    currentCuePadsRef.current = nextPads;
  }, [nextPads, playing, mapping.controller, mapping.deckMode, ledFeedback, midi.sendMidi]);

  // Turn off all LEDs when paused or stopped
  useEffect(() => {
    if (!playing && mapping.controller.startsWith('reloop')) {
      clearAllReloopLeds(midi.sendMidi, mapping.padCount, mapping.controller);
      currentCuePadsRef.current = [];
    }
  }, [playing, mapping.controller, mapping.padCount, midi.sendMidi]);

  // Turn off all LEDs on unmount
  useEffect(() => {
    return () => {
      if (mapping.controller.startsWith('reloop')) {
        clearAllReloopLeds(midi.sendMidi, mapping.padCount, mapping.controller);
      }
    };
  }, [mapping.controller, mapping.padCount, midi.sendMidi]);

  // ----- MIDI input handler --------------------------------------------
  useEffect(() => {
    const off = midi.onNoteOn((e) => {
      const pad = noteToPad(mapping, e.channel, e.note);
      if (pad === null) return;

      const audio = audioRef.current;
      const t = audio?.currentTime ?? 0;

      if (!audio || audio.paused) {
        // Free-play: light up on-screen pad and hardware LED
        flashPad(pad, 'tap');
        return;
      }

      const result = attemptHit(hitsRef.current, pad, t, mapping);
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
        // Extra tap
        flashPad(pad, 'tap');
      }
      setTick((tk) => tk + 1);
    });
    return off;
  }, [midi, mapping, ledFeedback]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- audio sync loop -----------------------------------------------
  useEffect(() => {
    let raf = 0;
    let lastPadsKey = '';
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
        const pads = cue ? cue.pads : [];
        const key = pads.join(',');
        if (key !== lastPadsKey) {
          lastPadsKey = key;
          setNextPads(pads);
        }
      } else if (lastPadsKey !== '') {
        lastPadsKey = '';
        setNextPads([]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function flashPad(pad: number, kind: 'hit' | 'wrong' | 'tap') {
    setActivePad(pad);
    setFeedback(kind);

    // Hardware LED feedback: Green for hit, Red for wrong, Cyan for free tap
    if (mapping.controller.startsWith('reloop') && ledFeedback) {
      const ledColor: ReloopLedColor =
        kind === 'hit' ? 'green' : kind === 'wrong' ? 'red' : 'cyan';
      sendReloopPadLed(midi.sendMidi, pad, ledColor, true, mapping.controller, mapping.deckMode);
    }

    window.setTimeout(() => {
      setActivePad((p) => (p === pad ? null : p));
      setFeedback((f) => (f === kind ? null : f));
      // If currently cued, restore cue amber color; else turn off
      if (mapping.controller.startsWith('reloop') && ledFeedback) {
        if (playing && currentCuePadsRef.current.includes(pad)) {
          sendReloopPadLed(midi.sendMidi, pad, 'amber', true, mapping.controller, mapping.deckMode);
        } else {
          sendReloopPadLed(midi.sendMidi, pad, 'off', false, mapping.controller, mapping.deckMode);
        }
      }
    }, 140);
  }

  function reset() {
    hitsRef.current = resetHits(initialPattern);
    setActivePad(null);
    setFeedback(null);
    setNextPads([]);
    setTick((t) => t + 1);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
      setPlaying(false);
    }
    if (mapping.controller.startsWith('reloop')) {
      clearAllReloopLeds(midi.sendMidi, mapping.padCount, mapping.controller);
      currentCuePadsRef.current = [];
    }
  }

  const handleTestLeds = () => {
    setTestingLeds(true);
    const stop = runRainbowChase(midi.sendMidi, mapping.padCount, mapping.controller);
    setTimeout(() => {
      stop();
      setTestingLeds(false);
    }, 2200);
  };

  // Score is recomputed on every tick
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const score = useMemo(() => scoreOf(hitsRef.current), [tick]);

  const controllerTitle =
    mapping.controller === 'reloop-ready'
      ? 'Reloop Ready'
      : mapping.controller === 'reloop-buddy'
        ? 'Reloop Buddy'
        : mapping.controller === 'hercules'
          ? 'Hercules'
          : 'MIDI';

  const kickCount = analysis.pattern.kick_count ?? 0;
  const snareCount = analysis.pattern.snare_count ?? 0;
  const hihatCount = analysis.pattern.hihat_count ?? 0;

  return (
    <section className="card practice-panel">
      <div className="practice-header">
        <div>
          <h2>🥁 Practice: {upload.filename}</h2>
          <p className="muted">
            Hit the pads on your {controllerTitle} as they illuminate. Timing tolerance: ±{HIT_WINDOW_MS} ms.
          </p>
        </div>
        {onChangeSong && (
          <button type="button" className="btn btn--secondary" onClick={onChangeSong}>
            🎵 Change Song / DJ Playlists
          </button>
        )}
      </div>

      {kickCount > 0 && (
        <div className="drum-transcription-badge">
          <span>🎯 Real Transcribed Drums:</span>
          <strong>{kickCount} kicks</strong>,
          <strong>{snareCount} snares</strong>,
          <strong>{hihatCount} cymbals/hi-hats</strong>
          {mapping.padCount === 16 && (
            <span className="badge badge--dual">✨ 2-Handed Dual Deck Active</span>
          )}
        </div>
      )}

      <MidiSetup midi={midi} mapping={mapping} setMapping={setMapping} />

      <div className="row mode-row">
        <label>
          Practice Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PatternMode)}
          >
            <option value="fullGroove">
              🔥 Full Transcribed Drum Kit (Both Decks — Kick, Snare, Hi-Hats, Cymbals)
            </option>
            <option value="kickSnare">
              🥁 Kick & Snare (2-Pad Groove — Core Practice)
            </option>
            <option value="hatOnly">
              ⚡ Hi-Hat & Cymbals Only (Timekeeping Pulse)
            </option>
            <option value="kickOnly">
              Kick Drum Only (Stamina & Downbeats)
            </option>
            <option value="snareOnly">
              Snare Drum Only (Backbeat Precision)
            </option>
            <option value="rotationalWarmup">
              Warmup Agility Drill (4-Pad Round Robin)
            </option>
          </select>
        </label>
      </div>

      {mapping.controller.startsWith('reloop') && (
        <div className="led-feedback-bar">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={ledFeedback}
              onChange={(e) => {
                setLedFeedback(e.target.checked);
                if (!e.target.checked) {
                  clearAllReloopLeds(midi.sendMidi, mapping.padCount, mapping.controller);
                }
              }}
            />
            <span>
              💡 <strong>{controllerTitle}</strong> Hardware Pad LED Sync (lights up physical pads in real-time!)
            </span>
          </label>
          <button
            type="button"
            className="btn btn--small"
            onClick={handleTestLeds}
            disabled={testingLeds}
          >
            {testingLeds ? '✨ Rainbow Chase Running…' : '🌈 Test Hardware LEDs'}
          </button>
        </div>
      )}

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
        nextPads={playing ? nextPads : []}
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

      <div className="row">
        <button type="button" className="btn" onClick={reset}>
          Reset session
        </button>
      </div>
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
