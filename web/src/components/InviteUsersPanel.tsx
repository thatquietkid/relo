import { useEffect, useState } from 'react';
import * as client from '../app/auth/auth-client';
import { useAuth } from '../app/auth/AuthProvider';

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InviteUsersPanel({ allowHrRole = false }: { allowHrRole?: boolean }) {
  const { identity, session } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'employee' | 'hr'>('employee');
  const [employees, setEmployees] = useState<client.HrEmployeeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invite, setInvite] = useState<client.HrInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void client.getHrEmployees(session.accessToken)
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setTotal(result.total);
      })
      .catch(() => {
        if (active) setError('The people list is unavailable right now.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    setInvite(null);
    setCopied(false);
    try {
      const result = await client.createHrInvitation(session.accessToken, { email: email.trim(), role }, idempotencyKey());
      setInvite(result.invitation);
      setEmail('');
      setNotice(`${role === 'hr' ? 'HR' : 'Employee'} invitation link is ready to share.`);
    } catch (cause) {
      const message = (cause as { response?: { error?: { message?: string } } })?.response?.error?.message;
      setError(message || 'The invitation could not be created. Check the email and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvite() {
    if (!invite?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
    } catch {
      setError('Could not copy the link. Select and copy it from the field.');
    }
  }

  return (
    <div className="people-workspace">
      <section className="panel invite-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Access, by invitation</p>
            <h2>Invite someone</h2>
            <p>We’ll create a single-use link for {identity?.memberships[0]?.tenant.name ?? 'your workspace'}.</p>
          </div>
          <span className="category-pill">{allowHrRole ? 'Employee or HR' : 'Employee access'}</span>
        </div>
        <form className="invite-form" onSubmit={(event) => void submit(event)}>
          <label className="search-field" htmlFor="invite-email">
            <span>Work email</span>
            <input id="invite-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
          </label>
          {allowHrRole && (
            <label className="select-field" htmlFor="invite-role">
              <span>Access level</span>
              <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as 'employee' | 'hr')}>
                <option value="employee">Employee</option>
                <option value="hr">HR team member</option>
              </select>
            </label>
          )}
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating link…' : 'Send invitation'}
          </button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="status-line" role="status">{notice}</p>}
        {invite?.inviteUrl && (
          <div className="invite-link-row">
            <a href={invite.inviteUrl} aria-label="Copy or open invitation" target="_blank" rel="noreferrer">{invite.inviteUrl}</a>
            <button className="button button-quiet button-small" type="button" onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        )}
      </section>

      <section className="panel people-panel" aria-busy={loading}>
        <div className="panel-heading">
          <div><p className="eyebrow">Your workspace</p><h2>People</h2></div>
          <span className="category-pill">{loading ? 'Loading' : `${total} active`}</span>
        </div>
        {!loading && employees.length === 0
          ? <div className="empty-state"><h3>No active members yet</h3><p>New team members will appear here after they accept an invitation.</p></div>
          : <div className="people-list">{employees.map((employee) => (
            <article className="people-row" key={employee.membershipId}>
              <span className="people-avatar" aria-hidden="true">{(employee.name || employee.email).slice(0, 1).toUpperCase()}</span>
              <span className="people-copy"><strong>{employee.name || employee.email}</strong><small>{employee.email}</small></span>
              <span className="people-roles">{employee.roles.map((item) => <span className="category-pill" key={item}>{item}</span>)}</span>
            </article>
          ))}</div>}
      </section>
    </div>
  );
}
