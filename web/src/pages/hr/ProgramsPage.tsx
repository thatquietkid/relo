import { useEffect, useState } from 'react';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export function ProgramsPage() {
  const { session } = useAuth();
  const [programs, setPrograms] = useState<client.HrProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    void client.getHrPrograms(session.accessToken)
      .then((result) => setPrograms(result.items))
      .catch(() => setError('Programs could not be loaded. Try refreshing the page.'))
      .finally(() => setLoading(false));
  }, [session]);

  return <div className="page-content operations-page">
    <div className="page-heading"><div><p className="eyebrow">HR workspace</p><h1>Programs</h1></div><p>Shape relocation cohorts with clear dates, destinations, and lifecycle status.</p></div>
    {error && <p className="status-line" role="status">{error}</p>}
    {loading ? <section className="panel empty-state"><p>Loading programs…</p></section> : programs.length === 0
      ? <section className="panel empty-state"><h2>No programmes yet</h2><p>Create a programme when your next relocation cohort is ready.</p></section>
      : <section className="content-grid" aria-label="Relocation programs">{programs.map((program) => <article className="panel" key={program.id}>
        <div className="page-heading"><div><p className="eyebrow">{program.status}</p><h2>{program.name}</h2></div></div>
        <p className="muted">{dateLabel(program.startsAt)} – {dateLabel(program.endsAt)}</p>
        {program.name.includes('(Demo)') && <p className="eyebrow">Sample programme</p>}
      </article>)}</section>}
  </div>;
}
