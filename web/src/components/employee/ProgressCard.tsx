import { useEffect, useState } from 'react';

interface ProgressCardProps {
  progress: number;
  destination?: string;
  moveDate?: string;
}

export function ProgressCard({ progress, destination, moveDate }: ProgressCardProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const radius = 34;
  const circumference = 2 * Math.PI * radius; // ≈ 213.6
  const clamped = Math.max(0, Math.min(progress, 100));
  const dashOffset = circumference - (clamped / 100) * circumference;

  // Animate number counter on mount / change
  useEffect(() => {
    const start = displayProgress;
    const end = clamped;
    if (start === end) return;
    const duration = 900;
    const startTime = performance.now();
    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayProgress(Math.round(start + (end - start) * ease));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  return (
    <section className="progress-card" aria-label="Relocation progress">
      <div className="progress-card-copy">
        <p className="eyebrow">Your move</p>
        <h2>{displayProgress}% arranged</h2>
        <p>{destination ? `Preparing for ${destination}.` : 'Your relocation plan is taking shape.'}</p>
      </div>

      <div className="progress-ring-wrap" aria-label={`${clamped} percent complete`}>
        <svg className="progress-ring-svg" viewBox="0 0 88 88" aria-hidden="true">
          <circle
            className="progress-ring-track"
            cx="44"
            cy="44"
            r={radius}
          />
          <circle
            className="progress-ring-fill"
            cx="44"
            cy="44"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="progress-ring-text">
          <span className="progress-ring-value">{displayProgress}</span>
          <span className="progress-ring-percent">%</span>
        </div>
      </div>

      <div className="progress-bar" aria-hidden="true">
        <span
          className="progress-bar-inner"
          style={{ width: `${clamped}%` }}
        />
      </div>

      {moveDate && (
        <p className="progress-date">
          Move date <strong>{moveDate}</strong>
        </p>
      )}
    </section>
  );
}
