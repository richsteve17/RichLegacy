import { useEffect, useRef, useState } from 'react';
import { fileUrl } from '../../lib/api';
import type { UploadResult } from '../../lib/types';

interface Props {
  upload: UploadResult;
}

export default function PlayerPanel({ upload }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  return (
    <section className="card">
      <h2>2. Play</h2>
      <p className="muted">
        Tap play (iOS requires a user gesture). Slow down for practice.
      </p>
      {/*
        controls + playsInline are required for iOS Safari to show
        the native transport without trying to enter fullscreen.
      */}
      <audio
        ref={audioRef}
        src={fileUrl(upload.file_id)}
        controls
        playsInline
        preload="metadata"
        className="player"
      />
      <div className="row">
        <label>
          Speed: {rate.toFixed(2)}×
          <input
            type="range"
            min={0.5}
            max={1.25}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
          />
        </label>
      </div>
    </section>
  );
}
