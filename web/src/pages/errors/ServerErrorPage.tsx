import { Link } from 'react-router-dom';

interface ServerErrorPageProps {
  error?: Error | null;
  resetError?: () => void;
  requestId?: string;
}

export function ServerErrorPage({
  error,
  resetError,
  requestId
}: ServerErrorPageProps) {
  return (
    <div className="error-page-container">
      <div className="error-card animate-fade-up">
        <div className="error-badge error-badge-danger">500 Server Error</div>
        <div className="error-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1>Something went wrong</h1>
        <p className="error-description">
          An unexpected error occurred while processing this request. Our engineering team has been notified.
        </p>

        {requestId && (
          <div className="error-details-box">
            <span>Reference ID: <code>{requestId}</code></span>
          </div>
        )}

        {error && (
          <details className="error-debug-details">
            <summary>Technical error details</summary>
            <pre>{error.message}</pre>
            {error.stack && <pre className="error-stack">{error.stack}</pre>}
          </details>
        )}

        <div className="error-actions">
          {resetError ? (
            <button
              type="button"
              className="button button-primary"
              onClick={resetError}
            >
              Try again
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={() => window.location.reload()}
            >
              Reload application
            </button>
          )}
          <Link to="/" className="button button-quiet">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ServerErrorPage;
