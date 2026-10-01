import { useState } from 'react';
import SongbookPanel from './features/songbook/SongbookPanel';
import UploadPanel from './features/upload/UploadPanel';
import PlayerPanel from './features/player/PlayerPanel';
import AnalysisPanel from './features/analysis/AnalysisPanel';
import PracticePanel from './features/practice/PracticePanel';
import type { UploadResult, AnalysisResult } from './lib/types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'songbook' | 'upload'>('songbook');
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const handleSongbookLoaded = (data: { upload: UploadResult; analysis: AnalysisResult }) => {
    setUpload(data.upload);
    setAnalysis(data.analysis);
  };

  const handleChangeSong = () => {
    setUpload(null);
    setAnalysis(null);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>🥁 Drum Pad Trainer</h1>
        <p className="muted">
          Dual-Deck finger drumming with real-time hardware LED lighting for Reloop Ready & DJ Playlists.
        </p>
      </header>

      <main className="app__main">
        {!upload ? (
          <>
            <nav className="app-nav-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'songbook'}
                className={`nav-tab ${activeTab === 'songbook' ? 'nav-tab--active' : ''}`}
                onClick={() => setActiveTab('songbook')}
              >
                🎵 DJ Playlists Songbook
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'upload'}
                className={`nav-tab ${activeTab === 'upload' ? 'nav-tab--active' : ''}`}
                onClick={() => setActiveTab('upload')}
              >
                📁 Upload Custom Audio File
              </button>
            </nav>

            {activeTab === 'songbook' ? (
              <SongbookPanel onLoaded={handleSongbookLoaded} />
            ) : (
              <UploadPanel
                onUploaded={(u) => {
                  setUpload(u);
                  setAnalysis(null);
                }}
              />
            )}
          </>
        ) : (
          <>
            {analysis ? (
              <PracticePanel
                upload={upload}
                analysis={analysis}
                onChangeSong={handleChangeSong}
              />
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={handleChangeSong}
                  >
                    ← Back to Songbook
                  </button>
                </div>
                <PlayerPanel upload={upload} />
                <AnalysisPanel
                  upload={upload}
                  analysis={analysis}
                  onAnalyzed={setAnalysis}
                />
              </>
            )}
          </>
        )}
      </main>

      <footer className="app__footer muted">
        Local-only • Transcribing audio directly on your machine • Dual-deck Reloop Ready supported
      </footer>
    </div>
  );
}
