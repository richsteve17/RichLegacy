interface Props {
  labels: string[];
  /** Pad index that just received a hit/wrong/tap (briefly). */
  activePad: number | null;
  /** One or more pad indices that should be hit soon (supports simultaneous hits). */
  nextPads?: number[];
  nextPad?: number | null;
  /** Visual feedback for the most recent activation. */
  feedback: 'hit' | 'wrong' | 'tap' | null;
  /** Optional touch fallback for mouse/touch users. */
  onPadTap?: (pad: number) => void;
}

function getDrumClass(drumName: string): string {
  const d = drumName.toLowerCase();
  if (d.includes('kick')) return 'padgrid__pad--kick';
  if (d.includes('snare')) return 'padgrid__pad--snare';
  if (d.includes('closed') || d.includes('pedal') || (d.includes('hat') && !d.includes('open')) || d === 'hihat') return 'padgrid__pad--hat';
  if (d.includes('open')) return 'padgrid__pad--hat-open';
  if (d.includes('crash')) return 'padgrid__pad--crash';
  if (d.includes('ride') || d.includes('bell')) return 'padgrid__pad--ride';
  if (d.includes('tom')) return 'padgrid__pad--tom';
  return 'padgrid__pad--perc';
}

function renderPadButton(
  i: number,
  labels: string[],
  activePad: number | null,
  nextPads: number[] | undefined,
  nextPad: number | null | undefined,
  feedback: 'hit' | 'wrong' | 'tap' | null,
  onPadTap?: (pad: number) => void,
) {
  const isActive = activePad === i;
  const isNext = (nextPads && nextPads.includes(i)) || nextPad === i;

  const rawLabel = labels[i] ?? `P${i + 1}`;
  const parts = rawLabel.split(':');
  const drumName = parts.length > 1 ? parts[1].trim() : rawLabel;
  const drumClass = getDrumClass(drumName);

  const cls = ['padgrid__pad', drumClass];
  if (isNext) cls.push('padgrid__pad--next');
  if (isActive && feedback === 'hit') cls.push('padgrid__pad--hit');
  if (isActive && feedback === 'wrong') cls.push('padgrid__pad--wrong');
  if (isActive && feedback === 'tap') cls.push('padgrid__pad--tap');

  const deckNum = i < 8 ? 1 : 2;
  const padInDeck = (i % 8) + 1;

  return (
    <button
      key={i}
      type="button"
      className={cls.join(' ')}
      onPointerDown={() => onPadTap?.(i)}
      aria-label={`Pad ${i + 1} (Deck ${deckNum} #${padInDeck}): ${drumName}${isNext ? ' (target cue)' : ''}`}
    >
      <div className="padgrid__header">
        <span className="padgrid__num">{i + 1}</span>
        <span className="padgrid__deck-sub">D{deckNum}#{padInDeck}</span>
      </div>
      <span className="padgrid__drum-name">{drumName}</span>
      {isNext && <span className="padgrid__cue-indicator">HIT!</span>}
    </button>
  );
}

export default function PadGrid({
  labels,
  activePad,
  nextPads,
  nextPad,
  feedback,
  onPadTap,
}: Props) {
  const padCount = labels.length;

  if (padCount === 16) {
    // Dual-Deck layout: Deck 1 (Left Hand) and Deck 2 (Right Hand)
    return (
      <div className="padgrid-dual" role="group" aria-label="Dual Deck Drum Pads">
        <div className="padgrid-deck-card padgrid-deck-card--deck1">
          <div className="padgrid-deck-header">
            <span className="padgrid-deck-badge padgrid-deck-badge--left">DECK 1 • LEFT HAND</span>
            <span className="padgrid-deck-sub">Kick / Snare / Core Groove</span>
          </div>
          <div className="padgrid padgrid--cols-4">
            {Array.from({ length: 8 }, (_, idx) =>
              renderPadButton(idx, labels, activePad, nextPads, nextPad, feedback, onPadTap),
            )}
          </div>
        </div>

        <div className="padgrid-deck-card padgrid-deck-card--deck2">
          <div className="padgrid-deck-header">
            <span className="padgrid-deck-badge padgrid-deck-badge--right">DECK 2 • RIGHT HAND</span>
            <span className="padgrid-deck-sub">Hi-Hat Pulse / Cymbals / Fills</span>
          </div>
          <div className="padgrid padgrid--cols-4">
            {Array.from({ length: 8 }, (_, idx) =>
              renderPadButton(idx + 8, labels, activePad, nextPads, nextPad, feedback, onPadTap),
            )}
          </div>
        </div>
      </div>
    );
  }

  // Single Deck layout (8 pads or 4 pads)
  const cols = padCount > 4 ? 4 : 2;
  return (
    <div
      className={`padgrid padgrid--cols-${cols}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      role="group"
      aria-label="Drum pads"
    >
      {Array.from({ length: padCount }, (_, i) =>
        renderPadButton(i, labels, activePad, nextPads, nextPad, feedback, onPadTap),
      )}
    </div>
  );
}
