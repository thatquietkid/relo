import { useEffect, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';
import { DirectoryCard } from '../../components/employee/DirectoryCard';

export function SavedPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<Array<{ directoryEntryId: string; entry: client.DirectoryEntry }>>([]);

  useEffect(() => {
    if (session) {
      void client.getShortlist(session.accessToken)
        .then((result) => setItems(result.shortlist))
        .catch(() => undefined);
    }
  }, [session]);

  async function remove(entryId: string) {
    if (!session) return;
    await client.removeShortlist(session.accessToken, entryId);
    setItems((current) => current.filter((item) => item.directoryEntryId !== entryId));
  }

  return (
    <div className="page-content employee-page">
      <div className="page-heading animate-fade-up">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1>Saved for later</h1>
        </div>
        <p>Keep the options you want to return to when the timing is right.</p>
      </div>

      <section className="directory-grid stagger" aria-label="Saved services">
        {items.length === 0
          ? (
            <div className="panel empty-state">
              <h2>Your saved guides will live here.</h2>
              <p>Explore trusted services and tap the star when something feels useful.</p>
            </div>
          )
          : items.map((item) => (
            <DirectoryCard
              key={item.directoryEntryId}
              entry={item.entry}
              saved
              onSave={() => void remove(item.directoryEntryId)}
            />
          ))}
      </section>
    </div>
  );
}
