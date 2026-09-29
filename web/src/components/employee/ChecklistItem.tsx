import { useState } from 'react';
import type { ChecklistItem as ChecklistItemData } from '../../app/auth/auth-client';

interface ChecklistItemProps {
  item: ChecklistItemData;
  onComplete: () => void;
}

export function ChecklistItem({ item, onComplete }: ChecklistItemProps) {
  const complete = item.state === 'completed';
  const [animating, setAnimating] = useState(false);

  function handleComplete() {
    if (animating || complete) return;
    setAnimating(true);
    // Small delay so the CSS animation plays before state update
    setTimeout(() => {
      onComplete();
      setAnimating(false);
    }, 120);
  }

  return (
    <article className={`checklist-item${complete ? ' is-complete' : ''}`}>
      <span
        className="checklist-dot"
        aria-hidden="true"
        style={animating ? { transform: 'scale(1.25)', background: 'var(--relo-mint)' } : undefined}
      >
        {complete ? '✓' : '·'}
      </span>
      <div className="checklist-copy">
        <h3>{item.title}</h3>
        {item.description && <p>{item.description}</p>}
      </div>
      {complete
        ? <span className="checklist-state">Done ✓</span>
        : (
          <button
            className="button button-quiet button-small"
            type="button"
            aria-label={`Complete ${item.title}`}
            onClick={handleComplete}
            disabled={animating}
          >
            {animating ? '✓' : 'Complete'}
          </button>
        )
      }
    </article>
  );
}
