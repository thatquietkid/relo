import { useEffect, useMemo, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';
import { ConsentDialog } from '../../components/employee/ConsentDialog';
import { DirectoryCard } from '../../components/employee/DirectoryCard';

export function ExplorePage() {
  const { session } = useAuth();
  const [entries, setEntries] = useState<client.DirectoryEntry[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [preview, setPreview] = useState<client.ProviderRequestPreview | null>(null);
  const [message, setMessage] = useState('');
  const [cityId, setCityId] = useState('destination');
  useEffect(() => {
    if (!session) return;
    void client.getEmployeeCase(session.accessToken).then((result) => setCityId(result.relocation.destination_city_id)).catch(() => undefined);
  }, [session]);
  useEffect(() => {
    if (!session) return;
    void client.getDirectory(session.accessToken, { cityId, query, category }).then((result) => setEntries(result.items)).catch(() => setMessage('Explore is unavailable right now.'));
    void client.getShortlist(session.accessToken).then((result) => setSaved(new Set(result.shortlist.map((item) => item.directoryEntryId)))).catch(() => undefined);
  }, [session, cityId, query, category]);
  const categories = useMemo(() => Array.from(new Set(entries.map((entry) => entry.category))).filter(Boolean), [entries]);
  async function toggleSave(entry: client.DirectoryEntry) {
    if (!session) return;
    if (saved.has(entry.id)) await client.removeShortlist(session.accessToken, entry.id);
    else await client.saveShortlist(session.accessToken, entry.id);
    setSaved((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; });
    setMessage(saved.has(entry.id) ? 'Removed from saved' : 'Saved for later');
  }
  async function requestSupport(entry: client.DirectoryEntry) {
    if (!session) return;
    try { setPreview((await client.getProviderRequestPreview(session.accessToken, entry.id)).preview); } catch { setMessage('This provider request is not available right now.'); }
  }
  async function confirmRequest(consents: Array<{ field: string; consented: boolean }>) {
    if (!session || !preview) return;
    try { await client.submitProviderRequest(session.accessToken, { entryId: preview.entry.id, consents }, `provider-${preview.entry.id}-${Date.now()}`); setPreview(null); setMessage('Request sent'); } catch { setMessage('Your request could not be sent.'); }
  }
  return <div className="page-content employee-page"><div className="page-heading"><div><p className="eyebrow">Destination guide</p><h1>Explore trusted services</h1></div><p>Find useful local support for your move. Save a guide or request an introduction when you are ready.</p></div><div className="explore-tools"><label className="search-field"><span className="sr-only">Search services</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search housing, schools, banking" /></label><label className="select-field"><span className="sr-only">Filter category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All services</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>{message && <div className="status-line" role="status">{message}</div>}<section className="directory-grid">{entries.length === 0 ? <div className="panel empty-state"><h2>Nothing here yet</h2><p>Try another search or check back as your destination guide grows.</p></div> : entries.map((entry) => <DirectoryCard key={entry.id} entry={entry} saved={saved.has(entry.id)} onSave={() => void toggleSave(entry)} onRequest={() => void requestSupport(entry)} />)}</section>{preview && <ConsentDialog fields={preview.fields} onConfirm={(consents) => void confirmRequest(consents)} onCancel={() => setPreview(null)} />}</div>;
}
