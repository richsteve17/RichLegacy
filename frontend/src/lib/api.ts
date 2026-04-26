import type { AnalysisResult, UploadResult } from './types';

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
