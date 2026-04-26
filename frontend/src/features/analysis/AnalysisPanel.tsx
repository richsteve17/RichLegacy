import { useState } from 'react';
import { analyze } from '../../lib/api';
import type { AnalysisResult, UploadResult } from '../../lib/types';

interface Props {
  upload: UploadResult;
  analysis: AnalysisResult | null;
  onAnalyzed: (a: AnalysisResult) => void;
}

export default function AnalysisPanel({ upload, analysis, onAnalyzed }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onAnalyzed(await analyze(upload.file_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>3. Analyze</h2>
      {!analysis && (
        <button className="btn btn--primary" onClick={run} disabled={busy}>
          {busy ? 'Analyzing…' : 'Detect tempo & pattern'}
        </button>
      )}
      {error && <p className="error">{error}</p>}

      {analysis && (
        <div className="grid">
          <Stat label="Tempo" value={`${Math.round(analysis.tempo.bpm)} BPM`} />
          <Stat
            label="Duration"
            value={`${analysis.duration_sec.toFixed(1)} s`}
          />
          <Stat
            label="Onsets"
            value={`${analysis.onsets.count}`}
          />
          <Stat
            label="Density"
            value={`${analysis.pattern.density.toFixed(2)} /s`}
          />
          <Stat label="Bars (4/4)" value={`${analysis.pattern.bars}`} />
          <Stat label="Sample rate" value={`${analysis.sample_rate} Hz`} />

          {analysis.pattern.notes.length > 0 && (
            <ul className="notes">
              {analysis.pattern.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="kits">
            <h3>Suggested kits</h3>
            <ul>
              {analysis.kit_suggestions.map((k) => (
                <li key={k.name}>
                  <strong>{k.name}</strong> — {k.reason}{' '}
                  <span className="muted">({(k.score * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
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
