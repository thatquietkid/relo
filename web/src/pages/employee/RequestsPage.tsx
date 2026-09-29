import { useEffect, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';

export function RequestsPage() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<client.ProviderRequest[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    void client.getProviderRequests(session.accessToken)
      .then((result) => {
        setRequests(result.requests);
        setMessage('');
      })
      .catch(() => setMessage('Requests are unavailable right now.'))
      .finally(() => setLoading(false));
  }, [session]);

  async function withdraw(id: string) {
    if (!session) return;
    try {
      const result = await client.withdrawProviderRequest(session.accessToken, id);
      setRequests((current) => current.map((req) => req.id === id ? result.request : req));
      setMessage('Request withdrawn');
    } catch {
      setMessage('That request could not be withdrawn.');
    }
  }

  return (
    <div className="page-content employee-page">
      <div className="page-heading animate-fade-up">
        <div>
          <p className="eyebrow">Introductions</p>
          <h1>My requests</h1>
        </div>
        <p>Track the support you have asked for. You can withdraw a request while it is still in motion.</p>
      </div>

      {message && <div className="status-line" role="status">{message}</div>}

      <section className="request-list stagger" aria-label="Provider requests">
        {loading
          ? <div className="panel empty-state"><h2>Loading requests…</h2><p>Fetching your provider introductions.</p></div>
          : message === 'Requests are unavailable right now.'
            ? <div className="panel empty-state"><h2>Requests are unavailable</h2><p>Please try again in a moment.</p></div>
            : requests.length === 0
          ? (
            <div className="panel empty-state">
              <h2>No requests yet.</h2>
              <p>When you ask for an introduction, its progress will appear here.</p>
            </div>
          )
          : requests.map((request) => (
            <article className="request-row" key={request.id}>
              <div>
                <span className="category-pill">{request.status.replaceAll('_', ' ')}</span>
                <h2>{request.entry.title}</h2>
                <p>{request.entry.providerName} · {request.entry.cityName}</p>
              </div>
              {request.status !== 'withdrawn' && (
                <button
                  className="button button-quiet button-small"
                  type="button"
                  onClick={() => void withdraw(request.id)}
                >
                  Withdraw
                </button>
              )}
            </article>
          ))}
      </section>
    </div>
  );
}
