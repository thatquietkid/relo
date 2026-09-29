import { InviteUsersPanel } from '../../components/InviteUsersPanel';

export function AdminUsersPage() {
  return (
    <div className="page-content operations-page">
      <div className="page-heading">
        <div><p className="eyebrow">Tenant administration</p><h1>People and access.</h1></div>
        <p>Invite employees and add HR teammates to this tenant. HR access uses the existing role and permissions.</p>
      </div>
      <InviteUsersPanel allowHrRole />
    </div>
  );
}
