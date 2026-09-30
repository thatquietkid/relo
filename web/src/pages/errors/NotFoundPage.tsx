import { Link, useNavigate } from 'react-router-dom';

interface NotFoundPageProps {
  message?: string;
}

export function NotFoundPage({ message = "The page you're looking for doesn't exist or has been moved." }: NotFoundPageProps) {
  const navigate = useNavigate();

  return (
    <div className="error-page-container">
      <div className="error-card animate-fade-up">
        <div className="error-badge">404 Error</div>
        <div className="error-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6M9 9l6 6" />
          </svg>
        </div>
        <h1>Page not found</h1>
        <p className="error-description">{message}</p>
        <div className="error-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={() => navigate(-1)}
          >
            ← Go back
          </button>
          <Link to="/" className="button button-primary">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
