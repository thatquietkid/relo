import { InviteUsersPanel } from '../../components/InviteUsersPanel';

export function EmployeesPage() {
  return (
    <div className="page-content operations-page">
      <div className="page-heading">
        <div><p className="eyebrow">HR workspace</p><h1>Employees.</h1></div>
        <p>Invite employees and follow the people who have joined your relocation programme.</p>
      </div>
      <InviteUsersPanel />
    </div>
  );
}
