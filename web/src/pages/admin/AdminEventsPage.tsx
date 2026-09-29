import { useEffect, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';

function eventLabel(action: string): string {
  return action.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(value: string): string {
  const elapsedSeconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  const steps: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Number.POSITIVE_INFINITY, 'year'],
  ];
  let elapsed = elapsedSeconds;
  for (const [limit, unit] of steps) {
    if (Math.abs(elapsed) < limit) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(elapsed), unit);
    elapsed = Math.round(elapsed / limit);
  }
  return new Date(value).toLocaleDateString();
}

function eventSymbol(action: string): string {
  if (/invite|member|role/i.test(action)) return '♙';
  if (/auth|login|otp/i.test(action)) return '⌁';
  if (/delete|revoke|suspend/i.test(action)) return '×';
  if (/create|update|publish/i.test(action)) return '✦';
  return '◦';
}

export function AdminEventsPage() {
  const { session } = useAuth();
  const [events, setEvents] = useState<client.AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError('');
    void client.getAdminEvents(session.accessToken, category ? { resourceType: category } : {})
      .then((result) => {
        if (!active) return;
        setEvents(result.items);
        setTotal(result.total);
        if (!category) setCategories([...new Set(result.items.map((event) => event.resourceType))].sort());
      })
      .catch(() => { if (active) setError('Activity is unavailable right now. Try refreshing in a moment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, category, refreshCount]);

  return (
    <div className="page-content operations-page">
      <div className="page-heading">
        <div><p className="eyebrow">Platform administration</p><h1>Activity.</h1></div>
        <p>A live view of the changes that keep this tenant moving. Sensitive employee details stay out of the feed.</p>
      </div>
      <section className="activity-board" aria-busy={loading}>
        <div className="activity-board-heading">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h2>Recent movement</h2>
            <p>{loading ? 'Checking for updates…' : `${total} ${total === 1 ? 'event' : 'events'} in this view`}</p>
          </div>
          <div className="activity-tools">
            <label className="select-field" htmlFor="activity-category">
              <span>Category</span>
              <select id="activity-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All activity</option>
                {[...new Set([...categories, ...(category ? [category] : [])])].sort().map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <button className="button button-quiet button-small" type="button" onClick={() => setRefreshCount((current) => current + 1)} disabled={loading}>
              <span aria-hidden="true">↻</span> Refresh
            </button>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading && events.length === 0
          ? <div className="activity-empty" role="status">Loading the latest activity…</div>
          : events.length === 0
            ? <div className="activity-empty"><span className="activity-empty-mark" aria-hidden="true">◦</span><h3>No events yet</h3><p>Invitations and other admin changes will appear here as they happen.</p></div>
            : <div className="activity-list">{events.map((event, index) => (
              <article className="activity-row" key={event.id}>
                <span className={`activity-symbol activity-symbol-${index % 4}`} aria-hidden="true">{eventSymbol(event.action)}</span>
                <div className="activity-copy"><strong>{eventLabel(event.action)}</strong><span>{event.resourceType.replaceAll('_', ' ')}</span></div>
                <time className="activity-time" dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString()}>{relativeTime(event.createdAt)}</time>
              </article>
            ))}</div>}
      </section>
    </div>
  );
}
