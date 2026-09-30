import { Link } from 'react-router-dom';

interface ForbiddenPageProps {
  requiredPermission?: string;
  message?: string;
}

export function ForbiddenPage({
  requiredPermission,
  message = 'Your current Relo membership or role does not have authorization to view this workspace.'
}: ForbiddenPageProps) {
  return (
    <div className="error-page-container">
      <div className="error-card animate-fade-up">
        <div className="error-badge error-badge-warning">403 Forbidden</div>
        <div className="error-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1>Access not available</h1>
        <p className="error-description">{message}</p>
        {requiredPermission && (
          <div className="error-details-box">
            <span>Required permission: <code>{requiredPermission}</code></span>
          </div>
        )}
        <div className="error-actions">
          <Link to="/" className="button button-primary">
            Return to your dashboard
          </Link>
          <Link to="/status" className="button button-quiet">
            Check permissions status
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForbiddenPage;
