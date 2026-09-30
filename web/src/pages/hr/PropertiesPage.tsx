import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/auth/AuthProvider';
import {
  getHrProperties,
  createHrProperty,
  deleteHrProperty,
  type HrProperty,
} from '../../app/api/hr';
import { ErrorBanner } from '../../components/ErrorBanner';

export function PropertiesPage() {
  const { session } = useAuth();
  const [properties, setProperties] = useState<HrProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [cityFilter, setCityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('London');
  const [propertyType, setPropertyType] = useState<HrProperty['propertyType']>('apartment');
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [rentMonthly, setRentMonthly] = useState(2500);
  const [deposit, setDeposit] = useState(2500);
  const [availableFrom, setAvailableFrom] = useState(new Date().toISOString().split('T')[0]);
  const [amenities, setAmenities] = useState('Furnished, Wi-Fi, Gym');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const fetchProperties = async () => {
    if (!session?.accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getHrProperties(session.accessToken, {
        city: cityFilter || undefined,
        type: typeFilter || undefined,
      });
      setProperties(data.properties || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [session?.accessToken, cityFilter, typeFilter]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await createHrProperty(session.accessToken, {
        title,
        address,
        city,
        country: city === 'London' ? 'United Kingdom' : city === 'Berlin' ? 'Germany' : 'United States',
        propertyType,
        bedrooms: Number(bedrooms),
        bathrooms: Number(bathrooms),
        rentMonthly: Number(rentMonthly),
        deposit: Number(deposit),
        availableFrom,
        amenities: amenities.split(',').map((s) => s.trim()).filter(Boolean),
        description,
        contactEmail: contactEmail || 'relo-housing@relo-global.internal',
        contactPhone: '',
        status: 'active',
      });

      setSuccess(`Property "${res.property.title}" enlisted successfully.`);
      setShowAddModal(false);
      resetForm();
      fetchProperties();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, propTitle: string) => {
    if (!session?.accessToken) return;
    if (!window.confirm(`Are you sure you want to remove "${propTitle}" from listings?`)) return;

    try {
      setError(null);
      await deleteHrProperty(session.accessToken, id);
      setProperties((prev) => prev.filter((p) => p.id !== id));
      setSuccess(`Property listing removed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err);
    }
  };

  const resetForm = () => {
    setTitle('');
    setAddress('');
    setCity('London');
    setPropertyType('apartment');
    setBedrooms(1);
    setBathrooms(1);
    setRentMonthly(2500);
    setDeposit(2500);
    setAmenities('Furnished, Wi-Fi, Gym');
    setDescription('');
    setContactEmail('');
  };

  return (
    <div className="page-content hr-page animate-fade-up">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Relocation Housing</p>
          <h1>Corporate Properties</h1>
        </div>
        <p>Enlist and manage employer-vetted residential properties for relocating staff.</p>
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
          <input
            type="search"
            className="input input-small"
            placeholder="Filter by city..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          />
          <select
            className="select select-small"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All property types</option>
            <option value="apartment">Apartment</option>
            <option value="condo">Condo</option>
            <option value="studio">Studio</option>
            <option value="house">House</option>
          </select>
        </div>

        <button
          type="button"
          className="button button-primary"
          onClick={() => setShowAddModal(true)}
        >
          + Enlist Property
        </button>
      </div>

      {loading ? (
        <div className="route-state" role="status">Loading property listings...</div>
      ) : properties.length === 0 ? (
        <section className="panel empty-state">
          <h2>No properties listed</h2>
          <p>Enlist your organization's first approved corporate property listing.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddModal(true)}
          >
            + Enlist Property
          </button>
        </section>
      ) : (
        <div className="properties-grid">
          {properties.map((property) => (
            <article key={property.id} className="panel property-card">
              <div className="property-card-header">
                <span className="category-pill">{property.propertyType}</span>
                <span className={`status-badge status-${property.status}`}>
                  {property.status}
                </span>
              </div>
              <h3>{property.title}</h3>
              <p className="property-address">{property.address}, {property.city}</p>
              <div className="property-specs">
                <span>{property.bedrooms} Bed</span>
                <span>•</span>
                <span>{property.bathrooms} Bath</span>
                <span>•</span>
                <span>Available {property.availableFrom}</span>
              </div>
              <p className="property-rent">
                <strong>${property.rentMonthly.toLocaleString()}</strong> / month
              </p>
              {property.description && (
                <p className="property-desc">{property.description}</p>
              )}
              {property.amenities?.length > 0 && (
                <div className="property-amenities">
                  {property.amenities.slice(0, 3).map((amenity, i) => (
                    <span key={i} className="amenity-tag">{amenity}</span>
                  ))}
                  {property.amenities.length > 3 && (
                    <span className="amenity-tag">+{property.amenities.length - 3} more</span>
                  )}
                </div>
              )}
              <div className="property-card-actions">
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() => handleDelete(property.id, property.title)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-content animate-fade-up">
            <div className="modal-header">
              <h2 id="modal-title">Enlist New Property</h2>
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
                  <label htmlFor="prop-title">Property Title</label>
                  <input
                    id="prop-title"
                    type="text"
                    required
                    className="input"
                    placeholder="e.g. Kensington Corporate Suites"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="prop-city">City</label>
                    <input
                      id="prop-city"
                      type="text"
                      required
                      className="input"
                      placeholder="e.g. London"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="prop-type">Property Type</label>
                    <select
                      id="prop-type"
                      className="select"
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value as any)}
                    >
                      <option value="apartment">Apartment</option>
                      <option value="condo">Condo</option>
                      <option value="studio">Studio</option>
                      <option value="house">House</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="prop-address">Street Address</label>
                  <input
                    id="prop-address"
                    type="text"
                    required
                    className="input"
                    placeholder="e.g. 42 Kensington High St"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="prop-bedrooms">Bedrooms</label>
                    <input
                      id="prop-bedrooms"
                      type="number"
                      min="0"
                      className="input"
                      value={bedrooms}
                      onChange={(e) => setBedrooms(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="prop-bathrooms">Bathrooms</label>
                    <input
                      id="prop-bathrooms"
                      type="number"
                      min="1"
                      className="input"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="prop-rent">Monthly Rent ($)</label>
                    <input
                      id="prop-rent"
                      type="number"
                      min="1"
                      required
                      className="input"
                      value={rentMonthly}
                      onChange={(e) => setRentMonthly(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="prop-deposit">Security Deposit ($)</label>
                    <input
                      id="prop-deposit"
                      type="number"
                      min="0"
                      className="input"
                      value={deposit}
                      onChange={(e) => setDeposit(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="prop-amenities">Amenities (comma-separated)</label>
                  <input
                    id="prop-amenities"
                    type="text"
                    className="input"
                    placeholder="Furnished, High-speed Wi-Fi, Gym, Doorman"
                    value={amenities}
                    onChange={(e) => setAmenities(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="prop-desc">Description</label>
                  <textarea
                    id="prop-desc"
                    rows={2}
                    className="textarea"
                    placeholder="Key highlights and location notes..."
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
                  {submitting ? 'Listing...' : 'Enlist Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PropertiesPage;
