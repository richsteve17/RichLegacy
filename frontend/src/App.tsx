import { useState } from 'react';
import UploadPanel from './features/upload/UploadPanel';
import PlayerPanel from './features/player/PlayerPanel';
import AnalysisPanel from './features/analysis/AnalysisPanel';
import PracticePanel from './features/practice/PracticePanel';
import type { UploadResult, AnalysisResult } from './lib/types';

export default function App() {
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  return (
    <div className="app">
      <header className="app__header">
        <h1>🥁 Drum Pad Trainer</h1>
        <p className="muted">
          Upload a song, get tempo + pattern analysis, then practice along.
        </p>
      </header>

      <main className="app__main">
        <UploadPanel
          onUploaded={(u) => {
            setUpload(u);
            setAnalysis(null);
          }}
        />

        {upload && (
          <>
            <PlayerPanel upload={upload} />
            <AnalysisPanel
              upload={upload}
              analysis={analysis}
              onAnalyzed={setAnalysis}
            />
            {analysis && <PracticePanel analysis={analysis} />}
          </>
        )}
      </main>

      <footer className="app__footer muted">
        Local-only: your audio never leaves your machine.
      </footer>
    </div>
  );
}
