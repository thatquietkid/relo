import { useState } from 'react';
import type { ApiFailure } from '../app/api/base';

export interface ErrorBannerProps {
  error: Error | ApiFailure | string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  title?: string;
  className?: string;
}

export function ErrorBanner({
  error,
  onRetry,
  onDismiss,
  title = 'Something went wrong',
  className = ''
}: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!error || dismissed) return null;

  let message = 'An unexpected error occurred.';
  let code: string | undefined;
  let details: Array<{ field?: string; message: string }> | undefined;

  if (typeof error === 'string') {
    message = error;
  } else if ('response' in error && error.response?.error) {
    message = error.response.error.message || message;
    code = error.response.error.code;
    if (Array.isArray(error.response.error.details)) {
      details = error.response.error.details as Array<{ field?: string; message: string }>;
    }
  } else if (error.message) {
    message = error.message;
  }

  const handleClose = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className={`error-banner animate-fade-up ${className}`} role="alert">
      <div className="error-banner-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className="error-banner-content">
        <div className="error-banner-header">
          <strong>{title}</strong>
          {code && <span className="error-code-badge">{code}</span>}
        </div>
        <p className="error-banner-message">{message}</p>

        {details && details.length > 0 && (
          <ul className="error-banner-details">
            {details.map((d, i) => (
              <li key={i}>
                {d.field ? <code>{d.field}: </code> : null}
                {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="error-banner-actions">
        {onRetry && (
          <button
            type="button"
            className="button button-small button-primary"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          onClick={handleClose}
          aria-label="Dismiss error notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
