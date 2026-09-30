import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { getProfile, updateProfile, type UserProfile } from '../../app/api/profile';
import { ErrorBanner } from '../../components/ErrorBanner';

export function ProfileEditPage() {
  const { session, identity } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [bio, setBio] = useState('');
  const [notificationsEmail, setNotificationsEmail] = useState(true);
  const [notificationsInApp, setNotificationsInApp] = useState(true);
  const [shareContact, setShareContact] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!session?.accessToken) return;
      try {
        setLoading(true);
        setError(null);
        const data = await getProfile(session.accessToken);
        if (!active) return;
        const p: UserProfile = data.profile;
        setFullName(p.fullName || '');
        setPhone(p.phone || '');
        setJobTitle(p.jobTitle || '');
        setDepartment(p.department || '');
        setBio(p.bio || '');
        if (p.preferences) {
          setNotificationsEmail(p.preferences.notificationsEmail ?? true);
          setNotificationsInApp(p.preferences.notificationsInApp ?? true);
          setShareContact(p.preferences.shareContact ?? false);
        }
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const result = await updateProfile(session.accessToken, {
        fullName,
        phone,
        jobTitle,
        department,
        bio,
        preferences: {
          notificationsEmail,
          notificationsInApp,
          shareContact
        }
      });

      setSuccessMessage(result.message || 'Profile updated successfully.');
      setTimeout(() => {
        navigate('/profile');
      }, 1200);
    } catch (err: any) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="route-state" role="status">Loading your profile details</div>;
  }

  return (
    <div className="page-content employee-page animate-fade-up">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account & Identity</p>
          <h1>Edit Profile</h1>
        </div>
        <p>Keep your professional profile and contact preferences up to date for smooth relocation coordination.</p>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {successMessage && (
        <div className="success-banner animate-fade-up" role="status">
          <span className="success-icon">✓</span>
          <span>{successMessage} Redirecting back...</span>
        </div>
      )}

      <form className="panel form-panel" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2>Personal Information</h2>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                required
                className="input"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                disabled
                className="input input-disabled"
                value={identity?.user.email || ''}
              />
              <small className="field-hint">Managed by your organization</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                className="input"
                placeholder="+1 (555) 012-3456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="jobTitle">Job Title</label>
              <input
                id="jobTitle"
                type="text"
                className="input"
                placeholder="Senior Software Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="department">Department / Team</label>
            <input
              id="department"
              type="text"
              className="input"
              placeholder="Infrastructure Engineering"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="bio">Relocation Notes / Bio</label>
            <textarea
              id="bio"
              rows={3}
              className="textarea"
              placeholder="Any details about your move, family, or housing preferences..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Preferences & Privacy</h2>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={notificationsEmail}
                onChange={(e) => setNotificationsEmail(e.target.checked)}
              />
              <span>Receive relocation updates via email</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={notificationsInApp}
                onChange={(e) => setNotificationsInApp(e.target.checked)}
              />
              <span>Show in-app task and milestone notifications</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={shareContact}
                onChange={(e) => setShareContact(e.target.checked)}
              />
              <span>Share contact information with shortlisted relocation partners</span>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <Link to="/profile" className="button button-quiet">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="button button-primary"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ProfileEditPage;
