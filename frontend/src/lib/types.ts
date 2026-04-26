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
}

export interface KitSuggestion {
  name: string;
  reason: string;
  score: number;
}

export interface AnalysisResult {
  file_id: string;
  duration_sec: number;
  sample_rate: number;
  tempo: TempoInfo;
  onsets: OnsetInfo;
  pattern: PatternSummary;
  kit_suggestions: KitSuggestion[];
}
