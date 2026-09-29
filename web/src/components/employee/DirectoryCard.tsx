import type { DirectoryEntry } from '../../app/auth/auth-client';

interface DirectoryCardProps {
  entry: DirectoryEntry;
  saved?: boolean;
  disabled?: boolean;
  onSave?: () => void;
  onRequest?: () => void;
}

export function DirectoryCard({ entry, saved = false, disabled = false, onSave, onRequest }: DirectoryCardProps) {
  return (
    <article className="directory-card">
      <div className="directory-card-top">
        <span className="category-pill">{entry.category}</span>
        {onSave && (
          <button
            className={`icon-button${saved ? ' is-saved' : ''}`}
            type="button"
            disabled={disabled}
            aria-label={`${saved ? 'Remove' : 'Save'} ${entry.title}`}
            onClick={onSave}
            title={saved ? 'Saved — click to remove' : 'Save for later'}
          >
            {saved ? '★' : '☆'}
          </button>
        )}
      </div>
      <h3>{entry.title}</h3>
      <p>{entry.description}</p>
      <div className="directory-provider">
        <span className="avatar avatar-small">{entry.providerName.slice(0, 1)}</span>
        <span>
          <strong>{entry.providerName}</strong>
          <small>{entry.cityName}</small>
        </span>
      </div>
      <div className="directory-actions">
        {onRequest && (
          <button className="button button-primary button-small" type="button" disabled={disabled} onClick={onRequest}>
            Request support
          </button>
        )}
        {entry.sourceUrl && (
          <a className="text-button" href={entry.sourceUrl} target="_blank" rel="noreferrer">
            View guide ↗
          </a>
        )}
      </div>
    </article>
  );
}
