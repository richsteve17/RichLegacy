import { useEffect, useState } from 'react';
import {
  fetchSongbookPlaylistDetail,
  fetchSongbookPlaylists,
  loadSongbookTrack,
} from '../../lib/api';
import type {
  AnalysisResult,
  SongbookPlaylist,
  SongbookTrack,
  UploadResult,
} from '../../lib/types';

interface Props {
  onLoaded: (data: { upload: UploadResult; analysis: AnalysisResult }) => void;
}

export default function SongbookPanel({ onLoaded }: Props) {
  const [playlists, setPlaylists] = useState<SongbookPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [tracks, setTracks] = useState<SongbookTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load playlists on mount
  useEffect(() => {
    let active = true;
    fetchSongbookPlaylists()
      .then((list) => {
        if (!active) return;
        setPlaylists(list);
        if (list.length > 0) {
          setSelectedPlaylistId(list[0].id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed loading playlists');
      });
    return () => {
      active = false;
    };
  }, []);

  // Load tracks when selected playlist changes
  useEffect(() => {
    if (!selectedPlaylistId) return;
    let active = true;
    setLoading(true);
    setError(null);

    fetchSongbookPlaylistDetail(selectedPlaylistId)
      .then((detail) => {
        if (!active) return;
        setTracks(detail.tracks);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed loading playlist tracks');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPlaylistId]);

  const handleLoadTrack = async (t: SongbookTrack) => {
    setLoadingTrackId(t.id);
    setError(null);
    try {
      const resp = await loadSongbookTrack(t.file_path, t.title, t.artist);
      onLoaded({
        upload: resp.upload,
        analysis: resp.analysis,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading track for practice');
      setLoadingTrackId(null);
    }
  };

  const filteredTracks = tracks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q) ||
      t.filename.toLowerCase().includes(q)
    );
  });

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  return (
    <section className="songbook card">
      <div className="songbook__header">
        <div>
          <h2>🎵 DJ Playlists Songbook</h2>
          <p className="muted">
            Choose any track from your DJ library. Drum parts (Kick, Snare, Hi-Hat) are
            transcribed automatically for finger drumming on your Reloop Ready.
          </p>
        </div>
      </div>

      {error && <div className="callout error">{error}</div>}

      <div className="songbook__controls">
        <div className="songbook__playlist-select">
          <label>
            DJ Playlist:
            <select
              value={selectedPlaylistId}
              onChange={(e) => {
                setSelectedPlaylistId(e.target.value);
                setSearchQuery('');
              }}
              disabled={loadingTrackId !== null}
            >
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.track_count} tracks)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="songbook__search">
          <label>
            Search tracks or artists:
            <input
              type="text"
              placeholder="e.g. Rancid, Blink-182, Ruby Soho, NOFX..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loadingTrackId !== null}
            />
          </label>
        </div>
      </div>

      {selectedPlaylist?.description && (
        <div className="songbook__desc-badge">
          <span>🔥</span> {selectedPlaylist.description}
        </div>
      )}

      {loading ? (
        <div className="songbook__loading muted">
          Loading playlist tracks…
        </div>
      ) : (
        <div className="songbook__track-list">
          {filteredTracks.length === 0 ? (
            <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              No tracks matched "{searchQuery}".
            </p>
          ) : (
            filteredTracks.map((t, idx) => {
              const isLoadingThis = loadingTrackId === t.id;
              const hasBpm = t.bpm > 0;

              return (
                <div key={t.id} className="songbook__track-card">
                  <div className="songbook__track-idx">{idx + 1}</div>

                  <div className="songbook__track-info">
                    <div className="songbook__track-title-row">
                      <strong className="songbook__track-title">{t.title}</strong>
                      {hasBpm && (
                        <span className="badge badge--bpm">{t.bpm} BPM</span>
                      )}
                      {t.is_cached && (
                        <span className="badge badge--cached">⚡ Instant Load</span>
                      )}
                    </div>

                    <div className="songbook__track-meta">
                      {t.artist && <span className="songbook__artist">{t.artist}</span>}
                      {t.album && <span className="songbook__album muted">• {t.album}</span>}
                      {t.genre && (
                        <span className="songbook__genre muted">• {t.genre}</span>
                      )}
                    </div>
                  </div>

                  <div className="songbook__track-action">
                    <button
                      type="button"
                      className={`btn btn--primary ${isLoadingThis ? 'loading' : ''}`}
                      onClick={() => handleLoadTrack(t)}
                      disabled={loadingTrackId !== null}
                    >
                      {isLoadingThis ? '⏳ Analyzing drums…' : '🥁 Practice'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
