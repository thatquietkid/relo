import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as client from '../../app/auth/auth-client';
import { useAuth } from '../../app/auth/AuthProvider';
import { ProgressCard } from '../../components/employee/ProgressCard';

export function EmployeeHomePage() {
  const { session, identity } = useAuth();
  const [relocation, setRelocation] = useState<client.EmployeeCase | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!session) return;
    void Promise.allSettled([
      client.getEmployeeCase(session.accessToken),
      client.getNotifications(session.accessToken),
    ]).then(([caseResult, notificationResult]) => {
      if (caseResult.status === 'fulfilled') setRelocation(caseResult.value.relocation);
      if (notificationResult.status === 'fulfilled') setUnread(notificationResult.value.unreadCount);
    });
  }, [session]);

  return (
    <div className="page-content employee-page">
      <div className="page-heading employee-heading animate-fade-up">
        <div>
          <p className="eyebrow">Good to see you</p>
          <h1>Your move, in good hands.</h1>
        </div>
        <p>One calm place for the next useful step, trusted local support, and the details you choose to share.</p>
      </div>

      <div className="employee-home-grid stagger">
        <div>
          <ProgressCard
            progress={relocation?.progress_percent ?? 0}
            destination={relocation?.destination_city_name ?? undefined}
            moveDate={relocation?.move_date}
          />
          <section className="next-action panel">
            <div>
              <p className="eyebrow">Next best action</p>
              <h2>Keep the move moving.</h2>
              <p>Start with your checklist, then explore services selected for your destination.</p>
            </div>
            <Link className="button button-primary" to="/checklist">Open checklist</Link>
          </section>
        </div>

        <aside className="home-rail stagger">
          <section className="panel rail-card">
            <p className="eyebrow">Your workspace</p>
            <h2>{identity?.user.email || 'Employee'}</h2>
            <p>Private by default. Every request asks before sharing your details.</p>
            <Link className="text-button" to="/profile">View profile →</Link>
          </section>

          <section className="panel panel-mint rail-card">
            <p className="eyebrow">Inbox</p>
            <h2>{unread} unread</h2>
            <p>Updates from your relocation programme land here.</p>
            <Link className="text-button" to="/settings">Open notifications →</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
