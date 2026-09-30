import { useEffect, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';

const nextStatus: Partial<Record<client.HrProviderRequestStatus, client.HrProviderRequestStatus>> = {
  submitted: 'in_review',
  in_review: 'approved',
  approved: 'in_progress',
  in_progress: 'completed',
};

const actionLabel: Partial<Record<client.HrProviderRequestStatus, string>> = {
  submitted: 'Start review',
  in_review: 'Approve',
  approved: 'Start service',
  in_progress: 'Mark complete',
};

export function HrRequestsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<client.HrProviderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!session) return;
    void client.getHrProviderRequests(session.accessToken)
      .then((result) => setItems(result.items))
      .catch(() => setMessage('Provider requests are unavailable right now.'))
      .finally(() => setLoading(false));
  }, [session]);

  async function advance(request: client.HrProviderRequest) {
    if (!session) return;
    const status = nextStatus[request.status];
    if (!status) return;
    try {
      const result = await client.updateHrProviderRequestStatus(session.accessToken, request.id, status);
      setItems((current) => current.map((item) => item.id === request.id ? result.request : item));
      setMessage(`Request moved to ${status.replaceAll('_', ' ')}.`);
    } catch {
      setMessage('That request could not be updated.');
    }
  }

  return (
    <div className="page-content operations-page">
      <div className="page-heading">
        <div><p className="eyebrow">HR workspace</p><h1>Provider requests</h1></div>
        <p>Review employee requests and move them through a controlled operational lifecycle.</p>
      </div>
      {message && <p className="status-line" role="status">{message}</p>}
      <section className="operations-list" aria-label="Provider requests" aria-busy={loading}>
        {items.length === 0
          ? <article className="panel empty-state"><h2>{loading ? 'Loading requests…' : 'No open requests'}</h2><p>{loading ? 'Fetching requests for this workspace.' : 'Submitted employee requests will appear here with their current status and provider context.'}</p></article>
          : items.map((request) => (
            <article className="panel operation-row" key={request.id}>
              <div>
                <span className="category-pill">{request.status.replaceAll('_', ' ')}</span>
                <h2>{request.entryTitle}</h2>
                <p>{request.providerName} · Submitted {new Date(request.submittedAt).toLocaleDateString()}</p>
              </div>
              {actionLabel[request.status] && <button className="button button-quiet button-small" type="button" onClick={() => void advance(request)}>{actionLabel[request.status]}</button>}
            </article>
          ))}
      </section>
    </div>
  );
}
