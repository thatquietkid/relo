import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';

// [path, symbol, label]
const navByRole: Record<string, Array<[string, string, string]>> = {
  employee: [
    ['/', '⌂', 'Home'],
    ['/checklist', '✓', 'Checklist'],
    ['/explore', '⌖', 'Explore'],
    ['/requests', '↗', 'Requests'],
    ['/profile', '◌', 'Profile'],
  ],
  hr: [
    ['/hr', '▦', 'Overview'],
    ['/hr/employees', '♙', 'Employees'],
    ['/hr/programs', '✓', 'Programs'],
    ['/hr/requests', '↗', 'Requests'],
    ['/hr/reports', '◌', 'Reports'],
    ['/hr/settings', '⚙', 'Settings'],
  ],
  reviewer: [
    ['/review', '✦', 'Review'],
    ['/review/directory', '⌖', 'Directory'],
    ['/review/audit', '▤', 'Audit'],
    ['/review/settings', '⚙', 'Settings'],
  ],
  admin: [
    ['/admin', '◈', 'Events'],
    ['/admin/users', '♙', 'Users'],
  ],
  platform_admin: [
    ['/admin/tenants', '⌂', 'Tenants'],
    ['/admin/health', '♡', 'Health'],
    ['/admin/settings', '⚙', 'Settings'],
  ],
};

export function resolvedRole(identity: ReturnType<typeof useAuth>['identity']): string {
  if (
    identity?.platformAuthorization?.scope === 'platform'
    && identity.platformAuthorization.roles.includes('platform_admin')
  ) return 'platform_admin';
  return identity?.memberships[0]?.roles[0]?.key || 'employee';
}

function DashboardHome({ role }: { role: string }) {
  const employee = role === 'employee';
  return (
    <div className="page-content animate-fade-up">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{employee ? 'Your relocation' : 'Mobility workspace'}</p>
          <h1>{employee ? 'Small steps, thoughtfully arranged.' : 'See the whole programme, at a glance.'}</h1>
        </div>
        <p>{employee
          ? 'One place for the next right step, with people and places your company can stand behind.'
          : 'A clear view of the work that keeps a relocation programme moving.'}
        </p>
      </div>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">{employee ? 'Your next best action' : 'Workspace pulse'}</p>
          <h2>{employee ? 'Start with the checklist.' : 'Keep the right work visible.'}</h2>
          <p>{employee
            ? 'Your move is a sequence of manageable moments. We will keep the next one close.'
            : 'Protected operational data appears only after your role and membership are confirmed.'}
          </p>
          <Link
            className="button button-primary"
            to={employee ? '/checklist' : navByRole[role]?.[1]?.[0] || '/'}
          >
            {employee ? 'Open checklist' : 'Open workspace'}
          </Link>
        </div>
        <div className="hero-mark" aria-hidden="true">r</div>
      </section>
      <section className="content-grid stagger">
        <article className="panel">
          <p className="eyebrow">A good place to begin</p>
          <h2>{employee ? 'Your relocation profile' : 'Programme health'}</h2>
          <p>{employee
            ? 'Add the details that help Relo make recommendations useful and relevant.'
            : 'The shell is ready for your protected workspace modules.'}
          </p>
        </article>
        <article className="panel panel-mint">
          <p className="eyebrow">Relo principle</p>
          <h2>Useful, trusted, human.</h2>
          <p>Privacy is the default. Every next step should earn its place.</p>
        </article>
      </section>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { identity, status, signOut } = useAuth();
  const location = useLocation();

  if (status === 'loading' || !identity) {
    return <div className="route-state" role="status">Checking your session</div>;
  }

  const role = resolvedRole(identity);
  const items = navByRole[role] || navByRole.employee;
  const currentPath = location.pathname;
  const userLabel = identity.user.email || 'Relo user';
  const pageTitle = items.find(([href]) => href === currentPath)?.[2] || 'Overview';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="dashboard-brand" to="/" aria-label="Relo dashboard home">
          <img src="/relo-logo.svg" alt="" />
          <span>relo</span>
        </Link>
        <p className="nav-label">Workspace</p>
        <nav className="nav-list" aria-label="Primary navigation">
          {items.map(([href, icon, label]) => (
            <Link
              key={href}
              className={`nav-item${currentPath === href ? ' active' : ''}`}
              to={href}
              aria-current={currentPath === href ? 'page' : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p className="trust-note">
            <strong>Why Relo?</strong>
            One place for the next right step, with people and places your company can stand behind.
          </p>
          <div className="profile-chip">
            <span className="avatar">{userLabel.slice(0, 1).toUpperCase()}</span>
            <span>{userLabel}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{role === 'employee' ? 'Your relocation' : 'Mobility workspace'}</p>
            <p className="topbar-title">{pageTitle}</p>
          </div>
          <button
            className="button button-quiet button-small"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </header>

        {children || <DashboardHome role={role} />}
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {items.slice(0, 5).map(([href, icon, label]) => (
          <Link
            key={href}
            className={`mobile-nav-item${currentPath === href ? ' active' : ''}`}
            to={href}
            aria-current={currentPath === href ? 'page' : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PublicPage({ kind }: { kind: 'privacy' | 'terms' | 'status' }) {
  const content = {
    privacy: [
      'Privacy at Relo.',
      'Relo uses the minimum information needed to support an employer-sponsored move. Your profile stays private unless you explicitly request a service or your programme administrator needs an operational status.',
    ],
    terms: [
      'Terms for a trusted move.',
      'Relo is provided through your employer or programme sponsor. Use the workspace for your own relocation and keep invitation links, one-time codes, and account access private.',
    ],
    status: [
      'Relo service status.',
      'The web workspace is available. API and background processing health is monitored separately from this browser shell.',
    ],
  } as const;
  return (
    <main className="public-shell">
      <Link className="dashboard-brand" to="/">
        <img src="/relo-logo.svg" alt="" />
        <span>relo</span>
      </Link>
      <p className="eyebrow">Relo</p>
      <h1>{content[kind][0]}</h1>
      <p className="public-copy">{content[kind][1]}</p>
      <Link to="/" className="button button-dark">Return to Relo</Link>
    </main>
  );
}
