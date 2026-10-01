import { useEffect, useMemo, useRef, useState } from 'react';
import { fileUrl } from '../../lib/api';
import { drumSampler } from '../../lib/audio/drumSampler';
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

const SPEED_PRESETS = [
  { value: 0.5, label: '0.50× (Half)' },
  { value: 0.65, label: '0.65×' },
  { value: 0.75, label: '0.75× (Slow)' },
  { value: 0.85, label: '0.85× (Cruising)' },
  { value: 1.0, label: '1.00× (Normal)' },
  { value: 1.15, label: '1.15× (Fast)' },
  { value: 1.25, label: '1.25× (Turbo)' },
];

export default function PracticePanel({ upload, analysis, onChangeSong }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const midi = useWebMidi();

  const [mapping, setMapping] = useState<PadMapping>(() => loadMapping());
  const [mode, setMode] = useState<PatternMode>('fullGroove');
  const [ledFeedback, setLedFeedback] = useState(true);
  const [testingLeds, setTestingLeds] = useState(false);
  const [drumAudioEnabled, setDrumAudioEnabled] = useState(true);
  const [drumVolume, setDrumVolume] = useState(0.85);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Synchronize audio playback speed (tempo training) & preserve pitch
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      if ('preservesPitch' in audioRef.current) {
        audioRef.current.preservesPitch = true;
      }
    }
  }, [playbackSpeed, upload.file_id]);

  // Preload authentic 16-pad drum kit audio samples
  useEffect(() => {
    drumSampler.preloadKit();
  }, []);

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

      // Play authentic punchy drum sample immediately with zero delay
      if (drumAudioEnabled) {
        drumSampler.playPad(pad, e.velocity);
      }

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
  }, [midi, mapping, ledFeedback, drumAudioEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handlePadTap(pad: number) {
    if (drumAudioEnabled) {
      drumSampler.playPad(pad, 110);
    }
    flashPad(pad, 'tap');
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
  const rawBpm = analysis.tempo?.bpm ? Math.round(analysis.tempo.bpm) : 0;
  const effectiveBpm = rawBpm > 0 ? Math.round(rawBpm * playbackSpeed) : null;

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

      <div className="sampler-control-bar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={drumAudioEnabled}
            onChange={(e) => {
              setDrumAudioEnabled(e.target.checked);
              drumSampler.setMuted(!e.target.checked);
            }}
          />
          <span>
            🔊 <strong>Live Drum Audio</strong> (triggers authentic punchy drum samples on every pad hit)
          </span>
        </label>

        <div className="sampler-volume-slider">
          <span>Drum Vol:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={drumVolume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setDrumVolume(val);
              drumSampler.setVolume(val);
            }}
          />
          <span className="muted" style={{ minWidth: 32, fontSize: '0.8rem' }}>
            {Math.round(drumVolume * 100)}%
          </span>
        </div>
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

      {/* Speed Gauge & Tempo Trainer */}
      <div className="speed-gauge-panel">
        <div className="speed-gauge-header">
          <div className="speed-gauge-title">
            <span className="speed-gauge-icon">🎚️</span>
            <strong>Practice Speed Gauge:</strong>
            <span
              className={`speed-badge ${
                playbackSpeed < 1
                  ? 'speed-badge--slow'
                  : playbackSpeed > 1
                    ? 'speed-badge--fast'
                    : 'speed-badge--normal'
              }`}
            >
              {playbackSpeed.toFixed(2)}×
            </span>
          </div>

          {rawBpm > 0 && effectiveBpm && (
            <div className="speed-gauge-bpm">
              <span className="muted">Song:</span>
              <strong>{rawBpm} BPM</strong>
              <span className="speed-arrow">➔</span>
              <span className="speed-effective-label">Practice:</span>
              <strong className="speed-effective-bpm">{effectiveBpm} BPM</strong>
              <span
                className={`badge ${
                  playbackSpeed < 1
                    ? 'badge--slow-tempo'
                    : playbackSpeed > 1
                      ? 'badge--fast-tempo'
                      : 'badge--cached'
                }`}
              >
                {playbackSpeed < 1
                  ? `${Math.round((1 - playbackSpeed) * 100)}% Slower`
                  : playbackSpeed > 1
                    ? `+${Math.round((playbackSpeed - 1) * 100)}% Faster`
                    : 'Original Tempo'}
              </span>
            </div>
          )}
        </div>

        <div className="speed-gauge-slider-row">
          <span className="speed-limit-label">0.50× (Half)</span>
          <input
            type="range"
            min={0.5}
            max={1.25}
            step={0.05}
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="speed-range-slider"
            aria-label="Practice playback speed slider"
          />
          <span className="speed-limit-label">1.25× (Turbo)</span>
        </div>

        <div className="speed-preset-buttons">
          <span className="speed-preset-label">Speed Presets:</span>
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`btn-speed-preset ${
                Math.abs(playbackSpeed - preset.value) < 0.01
                  ? 'btn-speed-preset--active'
                  : ''
              }`}
              onClick={() => setPlaybackSpeed(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={fileUrl(upload.file_id)}
        controls
        playsInline
        preload="metadata"
        className="player"
        onPlay={() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = playbackSpeed;
          }
          setPlaying(true);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = playbackSpeed;
          }
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <PadGrid
        labels={mapping.labels}
        activePad={activePad}
        nextPads={playing ? nextPads : []}
        feedback={feedback}
        onPadTap={handlePadTap}
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
