import { useRef, useState } from 'react';
import { uploadAudio } from '../../lib/api';
import type { UploadResult } from '../../lib/types';

interface Props {
  onUploaded: (u: UploadResult) => void;
}

export default function UploadPanel({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadAudio(file);
      onUploaded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className="card">
      <h2>1. Choose a song</h2>
      <p className="muted">
        Pick an audio file from your device. Stays local — never streamed.
      </p>
      <label className="btn btn--primary">
        {busy ? 'Uploading…' : 'Pick audio file'}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={handleChange}
          hidden
        />
      </label>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
