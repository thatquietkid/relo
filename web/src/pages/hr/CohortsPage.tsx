import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/auth/AuthProvider';
import {
  getHrCohorts,
  createHrCohort,
  updateHrCohort,
  type HrCohort,
} from '../../app/api/hr';
import { ErrorBanner } from '../../components/ErrorBanner';

export function CohortsPage() {
  const { session } = useAuth();
  const [cohorts, setCohorts] = useState<HrCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [destinationCity, setDestinationCity] = useState('London');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetDate, setTargetDate] = useState('');
  const [memberCount, setMemberCount] = useState(5);
  const [budgetPerEmployee, setBudgetPerEmployee] = useState(12000);
  const [description, setDescription] = useState('');

  const fetchCohorts = async () => {
    if (!session?.accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getHrCohorts(session.accessToken, statusFilter || undefined);
      setCohorts(data.cohorts || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCohorts();
  }, [session?.accessToken, statusFilter]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await createHrCohort(session.accessToken, {
        name,
        destinationCity,
        destinationCountry: destinationCity === 'London' ? 'United Kingdom' : destinationCity === 'Berlin' ? 'Germany' : 'United States',
        startDate,
        targetDate,
        memberCount: Number(memberCount),
        budgetPerEmployee: Number(budgetPerEmployee),
        description,
        status: 'planning',
      });

      setSuccess(`Cohort "${res.cohort.name}" created successfully.`);
      setShowAddModal(false);
      resetForm();
      fetchCohorts();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: HrCohort['status']) => {
    if (!session?.accessToken) return;
    try {
      setError(null);
      await updateHrCohort(session.accessToken, id, { status: newStatus });
      setCohorts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      );
      setSuccess('Cohort status updated.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err);
    }
  };

  const resetForm = () => {
    setName('');
    setDestinationCity('London');
    setStartDate(new Date().toISOString().split('T')[0]);
    setTargetDate('');
    setMemberCount(5);
    setBudgetPerEmployee(12000);
    setDescription('');
  };

  return (
    <div className="page-content hr-page animate-fade-up">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Relocation Planning</p>
          <h1>Relocation Cohorts</h1>
        </div>
        <p>Group employees into planned destination cohorts to optimize corporate housing and support logistics.</p>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {success && (
        <div className="success-banner animate-fade-up" role="status">
          <span className="success-icon">✓</span>
          <span>{success}</span>
        </div>
      )}

      <div className="page-toolbar">
        <div className="filters-row">
          <select
            className="select select-small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <button
          type="button"
          className="button button-primary"
          onClick={() => setShowAddModal(true)}
        >
          + Add Cohort
        </button>
      </div>

      {loading ? (
        <div className="route-state" role="status">Loading relocation cohorts...</div>
      ) : cohorts.length === 0 ? (
        <section className="panel empty-state">
          <h2>No cohorts found</h2>
          <p>Create a cohort to begin grouping staff moving to the same city.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddModal(true)}
          >
            + Add Cohort
          </button>
        </section>
      ) : (
        <div className="cohorts-table-container panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cohort Name</th>
                <th>Destination</th>
                <th>Timeline</th>
                <th>Members</th>
                <th>Budget / Person</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.id}>
                  <td>
                    <strong>{cohort.name}</strong>
                    {cohort.description && (
                      <p className="muted small-text">{cohort.description}</p>
                    )}
                  </td>
                  <td>{cohort.destinationCity}</td>
                  <td>
                    <span>{cohort.startDate}</span>
                    {cohort.targetDate && (
                      <span className="muted small-text"> → {cohort.targetDate}</span>
                    )}
                  </td>
                  <td>{cohort.memberCount} members</td>
                  <td>${cohort.budgetPerEmployee?.toLocaleString() || '10,000'}</td>
                  <td>
                    <span className={`status-badge status-${cohort.status}`}>
                      {cohort.status}
                    </span>
                  </td>
                  <td>
                    <select
                      className="select select-micro"
                      value={cohort.status}
                      onChange={(e) => handleStatusChange(cohort.id, e.target.value as any)}
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cohort-modal-title">
          <div className="modal-content animate-fade-up">
            <div className="modal-header">
              <h2 id="cohort-modal-title">Create Relocation Cohort</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-field">
                  <label htmlFor="cohort-name">Cohort Name</label>
                  <input
                    id="cohort-name"
                    type="text"
                    required
                    className="input"
                    placeholder="e.g. Q4 2026 Tech Expansion - London"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="cohort-city">Destination City</label>
                    <input
                      id="cohort-city"
                      type="text"
                      required
                      className="input"
                      placeholder="e.g. London"
                      value={destinationCity}
                      onChange={(e) => setDestinationCity(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="cohort-members">Initial Member Count</label>
                    <input
                      id="cohort-members"
                      type="number"
                      min="1"
                      className="input"
                      value={memberCount}
                      onChange={(e) => setMemberCount(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="cohort-start">Start Date</label>
                    <input
                      id="cohort-start"
                      type="date"
                      required
                      className="input"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="cohort-target">Target Completion Date</label>
                    <input
                      id="cohort-target"
                      type="date"
                      className="input"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="cohort-budget">Budget per Employee ($)</label>
                  <input
                    id="cohort-budget"
                    type="number"
                    min="1000"
                    step="500"
                    className="input"
                    value={budgetPerEmployee}
                    onChange={(e) => setBudgetPerEmployee(Number(e.target.value))}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="cohort-desc">Description / Purpose</label>
                  <textarea
                    id="cohort-desc"
                    rows={2}
                    className="textarea"
                    placeholder="Strategic context, business unit, relocation package level..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="button button-primary"
                >
                  {submitting ? 'Creating...' : 'Create Cohort'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CohortsPage;
