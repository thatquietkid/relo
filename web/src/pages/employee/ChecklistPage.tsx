import { useEffect, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';
import { ChecklistItem } from '../../components/employee/ChecklistItem';

export function ChecklistPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<client.ChecklistItem[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!session) return;
    void client.getEmployeeChecklist(session.accessToken).then((result) => setItems(result.checklist)).catch(() => setError('Your checklist could not be loaded.'));
  }, [session]);
  async function complete(item: client.ChecklistItem) {
    if (!session) return;
    setStatus('Saving your progress');
    try {
      const result = await client.updateChecklistItem(session.accessToken, item.id, 'completed', `check-${item.id}-${Date.now()}`);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...result.checklist_item, state: 'completed' } : candidate));
      setStatus('Saved');
    } catch { setStatus('Could not save that step'); }
  }
  return <div className="page-content employee-page"><div className="page-heading"><div><p className="eyebrow">Your plan</p><h1>My checklist</h1></div><p>Small, useful steps. Complete one when it feels right and we will keep your progress ready.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<section className="checklist-list" aria-label="Relocation checklist">{items.length === 0 && !error ? <div className="panel empty-state"><h2>Getting your plan ready</h2><p>Checklist steps will appear here once your relocation is active.</p></div> : items.map((item) => <ChecklistItem key={item.id} item={item} onComplete={() => void complete(item)} />)}</section><div className="status-line" role="status" aria-live="polite">{status}</div></div>;
}
