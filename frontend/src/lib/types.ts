export interface UploadResult {
  file_id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
}

export interface OnsetInfo {
  times: number[];
  count: number;
}

export interface TempoInfo {
  bpm: number;
  beat_times: number[];
}

export interface PatternSummary {
  bars: number;
  time_signature: string;
  density: number;
  notes: string[];
  kick_count?: number;
  snare_count?: number;
  hihat_count?: number;
}

export interface KitSuggestion {
  name: string;
  reason: string;
  score: number;
}

export interface DrumHit {
  time: number;
  drums: string[];
  primary: string;
  intensity: number;
}

export interface AnalysisResult {
  file_id: string;
  duration_sec: number;
  sample_rate: number;
  tempo: TempoInfo;
  onsets: OnsetInfo;
  drum_hits?: DrumHit[];
  pattern: PatternSummary;
  kit_suggestions: KitSuggestion[];
}

export interface SongbookTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  bpm: number;
  duration_sec: number;
  genre: string;
  file_path: string;
  filename: string;
  is_cached: boolean;
}

export interface SongbookPlaylist {
  id: string;
  name: string;
  track_count: number;
  description: string;
}

export interface SongbookPlaylistDetail {
  id: string;
  name: string;
  track_count: number;
  tracks: SongbookTrack[];
}

export interface SongbookLoadResponse {
  upload: UploadResult;
  analysis: AnalysisResult;
}

