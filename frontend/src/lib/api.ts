import type {
  AnalysisResult,
  SongbookLoadResponse,
  SongbookPlaylist,
  SongbookPlaylistDetail,
  SongbookTrack,
  UploadResult,
} from './types';

// In dev, Vite proxies `/api` → http://localhost:8000.
// In prod / mobile-direct, set VITE_API_BASE to e.g. http://192.168.1.10:8000.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function uploadAudio(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function analyze(fileId: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze/${fileId}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analysis failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function fileUrl(fileId: string): string {
  return `${API_BASE}/api/files/${fileId}`;
}

export async function fetchSongbookPlaylists(): Promise<SongbookPlaylist[]> {
  const res = await fetch(`${API_BASE}/api/songbook/playlists`);
  if (!res.ok) {
    throw new Error(`Failed to load playlists: ${res.status}`);
  }
  return res.json();
}

export async function fetchSongbookPlaylistDetail(
  playlistId: string,
): Promise<SongbookPlaylistDetail> {
  const res = await fetch(`${API_BASE}/api/songbook/playlists/${playlistId}`);
  if (!res.ok) {
    throw new Error(`Failed to load playlist details: ${res.status}`);
  }
  return res.json();
}

export async function searchSongbookTracks(query: string): Promise<SongbookTrack[]> {
  const res = await fetch(`${API_BASE}/api/songbook/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  return res.json();
}

export async function loadSongbookTrack(
  filePath: string,
  title?: string,
  artist?: string,
): Promise<SongbookLoadResponse> {
  const res = await fetch(`${API_BASE}/api/songbook/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath, title, artist }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed loading track: ${text}`);
  }
  return res.json();
}

