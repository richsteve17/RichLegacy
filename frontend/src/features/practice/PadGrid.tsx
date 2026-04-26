import { GRID_COLS, PAD_COUNT } from '../../lib/midi/padMapping';

interface Props {
  labels: string[];
  /** Pad index that just received a hit/wrong/tap (briefly). */
  activePad: number | null;
  /** Pad index that should be hit soon. */
  nextPad: number | null;
  /** Visual feedback for the most recent activation. */
  feedback: 'hit' | 'wrong' | 'tap' | null;
  /** Optional touch fallback for iOS / mouse users. */
  onPadTap?: (pad: number) => void;
}

/**
 * 2×2 visualization of the Hercules DJControl Mix's deck pads.
 *
 * - `nextPad` glows with a pulsing outline (you should hit this next).
 * - `activePad` flashes green ('hit'), red ('wrong'), or blue ('tap').
 * - Both states can stack — a pad can be "next" *and* just hit.
 */
export default function PadGrid({
  labels,
  activePad,
  nextPad,
  feedback,
  onPadTap,
}: Props) {
  return (
    <div
      className="padgrid"
      style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
      role="group"
      aria-label="Drum pads"
    >
      {Array.from({ length: PAD_COUNT }, (_, i) => {
        const isActive = activePad === i;
        const isNext = nextPad === i;
        const cls = ['padgrid__pad'];
        if (isNext) cls.push('padgrid__pad--next');
        if (isActive && feedback === 'hit') cls.push('padgrid__pad--hit');
        if (isActive && feedback === 'wrong') cls.push('padgrid__pad--wrong');
        if (isActive && feedback === 'tap') cls.push('padgrid__pad--tap');
        return (
          <button
            key={i}
            type="button"
            className={cls.join(' ')}
            onPointerDown={() => onPadTap?.(i)}
            aria-label={`Pad ${i + 1}${isNext ? ' (next)' : ''}`}
          >
            <span className="padgrid__num">{i + 1}</span>
            <span className="padgrid__label">{labels[i] ?? ''}</span>
          </button>
        );
      })}
    </div>
  );
}
