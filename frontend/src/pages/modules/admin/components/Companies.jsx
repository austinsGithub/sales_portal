import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Search,
  Plus,
  PencilLine,
  Save,
  X,
  XCircle,
  RefreshCcw,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import '../../../../css/modules/admin/Companies.css';

function joinUrl(base, path) {
  const normalizedBase = (base || '').replace(/\/+$/, '');
  const normalizedPath = (path || '').replace(/^\/+/, '');
  if (!normalizedBase) {
    return `/${normalizedPath}`;
  }
  return `${normalizedBase}/${normalizedPath}`;
}

const API_BASE = joinUrl(import.meta.env.VITE_API_BASE_URL || '', '/api/admin/companies');

const FIELD_DEFINITIONS = [
  { name: 'company_name', label: 'Company Name', required: true },
  { name: 'legal_name', label: 'Legal Name' },
  { name: 'dba_name', label: 'Doing Business As' },
  { name: 'status', label: 'Status' },
  { name: 'contact_email', label: 'Contact Email', type: 'email' },
  { name: 'contact_phone', label: 'Contact Phone' },
  { name: 'phone', label: 'Phone' },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'address_line1', label: 'Address Line 1' },
  { name: 'address_line2', label: 'Address Line 2' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State / Province' },
  { name: 'postal_code', label: 'Postal / ZIP Code' },
  { name: 'country', label: 'Country' },
  { name: 'timezone', label: 'Timezone' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

const ACTIVE_FIELD_CANDIDATES = ['is_active', 'active'];

function getDisplayName(company) {
  if (!company) return '';
  return (
    company.company_name ||
    company.name ||
    company.legal_name ||
    company.dba_name ||
    (company.company_id ? `Company #${company.company_id}` : company.id ? `Company #${company.id}` : 'Company')
  );
}

function getSecondaryLine(company) {
  if (!company) return '';
  const parts = [];
  if (company.city) parts.push(company.city);
  if (company.state) parts.push(company.state);
  if (!parts.length && company.status) parts.push(company.status);
  if (!parts.length && company.contact_email) parts.push(company.contact_email);
  return parts.join(', ');
}

function buildInitialForm(fields, company, activeField) {
  const base = {};
  fields.forEach((field) => {
    base[field.name] = company ? company[field.name] ?? '' : '';
  });
  if (activeField) {
    base[activeField] = company ? Boolean(company[activeField]) : true;
  }
  return base;
}

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

function Banner({ banner, onClose }) {
  if (!banner) return null;
  const Icon = banner.type === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`company-banner ${banner.type}`}>
      <Icon size={18} />
      <span>{banner.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  const activeField = useMemo(() => {
    if (!meta?.columns) return null;
    return meta.columns.find((col) => ACTIVE_FIELD_CANDIDATES.includes(col.name))?.name || null;
  }, [meta]);

  const writableFields = useMemo(() => {
    if (!meta?.columns) return FIELD_DEFINITIONS;
    const available = new Set(meta.columns.filter((col) => col.writable).map((col) => col.name));
    const preferred = FIELD_DEFINITIONS.filter((field) => available.has(field.name));
    const extras = meta.columns
      .filter((col) => col.writable && !preferred.some((field) => field.name === col.name) && !ACTIVE_FIELD_CANDIDATES.includes(col.name))
      .map((col) => ({ name: col.name, label: col.name.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) }));
    return [...preferred, ...extras];
  }, [meta]);

  const selectedCompany = useMemo(
    () => companies.find((company) => {
      if (!company) return false;
      if ('company_id' in company && company.company_id === selectedId) return true;
      if ('id' in company && company.id === selectedId) return true;
      return false;
    }) || null,
    [companies, selectedId],
  );

  useEffect(() => {
    if (!banner) return undefined;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  const fetchMeta = async () => {
    try {
      const response = await fetch(`${API_BASE}/meta`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load company metadata');
      }
      const data = await response.json();
      setMeta(data);
    } catch (err) {
      console.error('Company metadata error:', err);
      setMeta(null);
    }
  };

  const fetchCompanies = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('offset', '0');
      params.set('includeInactive', includeInactive ? 'true' : 'false');
      params.set('withTotal', 'true');
      if (debouncedSearch) params.set('search', debouncedSearch);

      const response = await fetch(`${API_BASE}?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || detail.message || 'Failed to load companies');
      }

      const totalHeader = response.headers.get('X-Total-Count');
      if (totalHeader) {
        setTotalCount(Number(totalHeader));
      } else {
        setTotalCount(null);
      }

      const data = await response.json();
      setCompanies(Array.isArray(data) ? data : data?.rows || []);
      if (!selectedId && Array.isArray(data) && data.length) {
        const first = data[0];
        setSelectedId(first?.company_id ?? first?.id ?? null);
      }
    } catch (err) {
      console.error('Company fetch error:', err);
      setError(err.message || 'Failed to load companies');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, includeInactive]);

  const openCreateModal = () => {
    setIsEditMode(false);
    setFormData(buildInitialForm(writableFields, null, activeField));
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedCompany) return;
    setIsEditMode(true);
    setFormData(buildInitialForm(writableFields, selectedCompany, activeField));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({});
    setSaving(false);
  };

  const handleFormChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleActive = async () => {
    if (!selectedCompany || !activeField) return;
    const nextValue = !Boolean(selectedCompany[activeField]);
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/${selectedCompany.company_id ?? selectedCompany.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ [activeField]: nextValue }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || detail.message || 'Failed to update company');
      }
      const updated = await response.json();
      setCompanies((prev) => prev.map((company) => {
        const companyId = company.company_id ?? company.id;
        if (companyId === (updated.company_id ?? updated.id)) {
          return updated;
        }
        return company;
      }));
      setBanner({ type: 'success', message: `${getDisplayName(updated)} ${nextValue ? 'activated' : 'deactivated'}` });
    } catch (err) {
      console.error('Toggle active error:', err);
      setBanner({ type: 'error', message: err.message || 'Failed to update company status' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCompany) return;
    const confirmDelete = window.confirm(`Delete ${getDisplayName(selectedCompany)}?`);
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/${selectedCompany.company_id ?? selectedCompany.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || detail.message || 'Failed to delete company');
      }
      setCompanies((prev) => prev.filter((company) => (company.company_id ?? company.id) !== (selectedCompany.company_id ?? selectedCompany.id)));
      setSelectedId(null);
      setBanner({ type: 'success', message: `${getDisplayName(selectedCompany)} deleted` });
    } catch (err) {
      console.error('Delete company error:', err);
      setBanner({ type: 'error', message: err.message || 'Failed to delete company' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const method = isEditMode ? 'PATCH' : 'POST';
      const targetId = selectedCompany?.company_id ?? selectedCompany?.id;
      const endpoint = isEditMode && targetId ? `${API_BASE}/${targetId}` : API_BASE;

      const payload = { ...formData };
      if (activeField && payload[activeField] !== undefined) {
        payload[activeField] = Boolean(payload[activeField]);
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || detail.message || 'Failed to save company');
      }

      const savedCompany = await response.json();

      setCompanies((prev) => {
        if (isEditMode) {
          return prev.map((company) => (company.company_id ?? company.id) === (savedCompany.company_id ?? savedCompany.id) ? savedCompany : company);
        }
        return [savedCompany, ...prev];
      });

      setSelectedId(savedCompany.company_id ?? savedCompany.id ?? null);
      setBanner({ type: 'success', message: `Company ${isEditMode ? 'updated' : 'created'} successfully` });
      closeModal();
    } catch (err) {
      console.error('Save company error:', err);
      setBanner({ type: 'error', message: err.message || 'Failed to save company' });
      setSaving(false);
    }
  };

  return (
    <div className="company-admin-container">
      <Banner banner={banner} onClose={() => setBanner(null)} />

      <div className="company-admin-layout">
        <div className="company-list-panel">
          <div className="company-list-header">
            <div className="header-title">
              <Building2 size={22} />
              <div>
                <h2>Companies</h2>
                <p>Manage customer and partner organizations</p>
              </div>
            </div>
            <div className="company-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search companies..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <div className="company-list-actions">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                />
                <span>Include inactive</span>
              </label>
              <button type="button" className="primary" onClick={openCreateModal}>
                <Plus size={16} />
                New Company
              </button>
            </div>
          </div>

          <div className="company-list">
            {loading && initialLoad && (
              <div className="company-list-empty">
                <Loader2 size={24} className="spin" />
                <span>Loading companies...</span>
              </div>
            )}

            {!loading && error && (
              <div className="company-list-empty error">
                <AlertCircle size={20} />
                <span>{error}</span>
                <button type="button" onClick={fetchCompanies}>
                  <RefreshCcw size={14} /> Retry
                </button>
              </div>
            )}

            {!loading && !error && companies.length === 0 && (
              <div className="company-list-empty">
                <Building2 size={24} />
                <span>No companies found</span>
                <button type="button" onClick={openCreateModal}>
                  <Plus size={14} /> Add your first company
                </button>
              </div>
            )}

            {companies.map((company) => {
              const companyId = company.company_id ?? company.id;
              const isSelected = companyId === selectedId;
              const isInactive = activeField ? !Boolean(company[activeField]) : false;
              return (
                <button
                  key={companyId}
                  type="button"
                  className={`company-list-item${isSelected ? ' selected' : ''}`}
                  onClick={() => setSelectedId(companyId)}
                >
                  <div className="company-list-item-header">
                    <span className="name">{getDisplayName(company)}</span>
                    {isInactive && <span className="status">Inactive</span>}
                  </div>
                  <span className="secondary">{getSecondaryLine(company)}</span>
                  {company.contact_email && <span className="muted">{company.contact_email}</span>}
                </button>
              );
            })}
          </div>

          <div className="company-list-footer">
            <div>
              {totalCount != null ? `${totalCount} companies` : `${companies.length} companies loaded`}
            </div>
            <button type="button" className="ghost" onClick={fetchCompanies} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="company-detail-panel">
          {selectedCompany ? (
            <div className="company-detail-card">
              <header className="company-detail-header">
                <div>
                  <h3>{getDisplayName(selectedCompany)}</h3>
                  <p>{getSecondaryLine(selectedCompany)}</p>
                </div>
                <div className="action-buttons">
                  {activeField && (
                    <button type="button" className="secondary" onClick={handleToggleActive} disabled={saving}>
                      {Boolean(selectedCompany[activeField]) ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                  <button type="button" className="secondary" onClick={openEditModal} disabled={saving}>
                    <PencilLine size={16} /> Edit
                  </button>
                  <button type="button" className="danger" onClick={handleDelete} disabled={saving}>
                    <XCircle size={16} /> Delete
                  </button>
                </div>
              </header>

              <section className="company-detail-grid">
                {writableFields.map((field) => {
                  const value = selectedCompany[field.name];
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <div key={field.name} className="detail-item">
                      <span className="label">{field.label}</span>
                      <span className="value">{String(value)}</span>
                    </div>
                  );
                })}
                {activeField && (
                  <div className="detail-item">
                    <span className="label">Status</span>
                    <span className={`status-pill ${selectedCompany[activeField] ? 'active' : 'inactive'}`}>
                      {selectedCompany[activeField] ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                )}
              </section>

              <footer className="company-detail-footer">
                {selectedCompany.created_at && (
                  <span>Created: {new Date(selectedCompany.created_at).toLocaleString()}</span>
                )}
                {selectedCompany.updated_at && (
                  <span>Updated: {new Date(selectedCompany.updated_at).toLocaleString()}</span>
                )}
              </footer>
            </div>
          ) : (
            <div className="company-detail-placeholder">
              <Building2 size={40} />
              <h3>Select a company</h3>
              <p>Choose an organization from the list to view details or create a new company.</p>
              <button type="button" className="primary" onClick={openCreateModal}>
                <Plus size={16} /> Create Company
              </button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="company-modal-backdrop" role="dialog" aria-modal="true">
          <div className="company-modal">
            <header className="modal-header">
              <div>
                <h3>{isEditMode ? 'Edit Company' : 'New Company'}</h3>
                <p>{isEditMode ? 'Update company details' : 'Create a new company profile'}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-grid">
                {writableFields.map((field) => {
                  if (!(field.name in formData)) return null;
                  const commonProps = {
                    id: field.name,
                    name: field.name,
                    value: formData[field.name] ?? '',
                    onChange: (event) => handleFormChange(field.name, event.target.value),
                  };

                  return (
                    <label key={field.name} htmlFor={field.name} className="form-field">
                      <span>{field.label}{field.required ? ' *' : ''}</span>
                      {field.type === 'textarea' ? (
                        <textarea
                          {...commonProps}
                          rows={3}
                          required={Boolean(field.required)}
                        />
                      ) : (
                        <input
                          {...commonProps}
                          type={field.type || 'text'}
                          required={Boolean(field.required)}
                        />
                      )}
                    </label>
                  );
                })}

                {activeField && activeField in formData && (
                  <label className="form-field checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(formData[activeField])}
                      onChange={(event) => handleFormChange(activeField, event.target.checked)}
                    />
                    <span>Active</span>
                  </label>
                )}
              </div>

              <footer className="modal-footer">
                <button type="button" className="secondary" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={saving}>
                  {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  {isEditMode ? 'Save Changes' : 'Create Company'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

