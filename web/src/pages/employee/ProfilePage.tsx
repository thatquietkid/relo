import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';

export function ProfilePage() {
  const { identity } = useAuth();
  return <div className="page-content employee-page"><div className="page-heading"><div><p className="eyebrow">Your details</p><h1>Profile</h1></div><p>These details help your programme understand who is moving. Relo keeps them private by default.</p></div><section className="profile-panel panel"><div className="profile-large-avatar">{(identity?.user.email || 'R').slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Signed in as</p><h2>{identity?.user.email || 'Relo employee'}</h2><p className="muted">Employee workspace</p></div></section><section className="panel profile-settings-link"><div><p className="eyebrow">Control your experience</p><h2>Notifications and privacy</h2><p className="muted">Choose where updates arrive and what you share when asking for support.</p></div><Link className="button button-primary" to="/settings">Open settings</Link></section></div>;
}
