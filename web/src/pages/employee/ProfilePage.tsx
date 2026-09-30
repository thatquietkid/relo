import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { getProfile, type UserProfile } from '../../app/api/profile';
import { ErrorBanner } from '../../components/ErrorBanner';

export function ProfilePage() {
  const { session, identity } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!session?.accessToken) return;
      try {
        setLoading(true);
        const data = await getProfile(session.accessToken);
        if (active) setProfile(data.profile);
      } catch (err: any) {
        if (active) setError(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  const email = profile?.email || identity?.user.email || 'Relo employee';
  const fullName = profile?.fullName || identity?.user.email?.split('@')[0] || 'Relo user';
  const initials = (fullName || email).slice(0, 1).toUpperCase();

  return (
    <div className="page-content employee-page animate-fade-up">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your details</p>
          <h1>Profile</h1>
        </div>
        <p>These details help your programme understand who is moving. Relo keeps them private by default.</p>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="profile-panel panel">
        <div className="profile-large-avatar">{initials}</div>
        <div className="profile-meta">
          <p className="eyebrow">Signed in as</p>
          <h2>{fullName}</h2>
          <p className="muted">{email}</p>
          {profile?.jobTitle && (
            <p className="profile-role">
              <strong>{profile.jobTitle}</strong>
              {profile.department && ` · ${profile.department}`}
            </p>
          )}
        </div>
        <div className="profile-actions">
          <Link className="button button-primary" to="/profile/edit">
            Edit profile
          </Link>
        </div>
      </section>

      {profile && (
        <section className="panel profile-details-grid">
          <div className="detail-item">
            <span className="detail-label">Phone</span>
            <span className="detail-value">{profile.phone || 'Not provided'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Department</span>
            <span className="detail-value">{profile.department || 'Not provided'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Role</span>
            <span className="detail-value capitalize">{profile.role || 'employee'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Email updates</span>
            <span className="detail-value">{profile.preferences?.notificationsEmail !== false ? 'Enabled' : 'Disabled'}</span>
          </div>
          {profile.bio && (
            <div className="detail-item detail-full-width">
              <span className="detail-label">Relocation notes</span>
              <p className="detail-bio">{profile.bio}</p>
            </div>
          )}
        </section>
      )}

      <section className="panel profile-settings-link">
        <div>
          <p className="eyebrow">Control your experience</p>
          <h2>Notifications and privacy</h2>
          <p className="muted">Choose where updates arrive and what you share when asking for support.</p>
        </div>
        <Link className="button button-quiet" to="/settings">
          Open settings
        </Link>
      </section>
    </div>
  );
}

export default ProfilePage;
