import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import './Suppliers.css';
import SupplierAddress from './SupplierAddress.jsx';
import useIsMobile from '../../../hooks/useIsMobile.js';
import MobileSupplierModal from './SupplierModalMobile.jsx';
import { useAuth } from '../../../shared/contexts/AuthContext.jsx';
import ListItem from '../../../components/ListItem.jsx';

const PAGE_SIZE = 10;
const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/procurement/suppliers`;

// Helper function to get auth token with validation
const getAuthToken = () => {
  return localStorage.getItem('auth_token') || '';
};

/* ------------------------- Add Supplier Modal ------------------------- */
function AddSupplierModal({ open, onClose, onCreated, authTokenStr }) {
  if (!open) return null;

  const [form, setForm] = useState({
    supplier_code: '',
    supplier_name: '',
    contact_name: '',
    contact_email: '',
    phone: '',
    website: '',
    payment_terms: 'Net 30',
    lead_time_days: 0,
    minimum_order_amount: 0,
    quality_rating: 'Good',
    preferred_vendor: false,
    certifications: '',
    notes: '',
    is_active: true,
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'United States',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.supplier_name) {
      setErr('Supplier name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokenStr}`
        },
        body: JSON.stringify({
          ...form,
          preferred_vendor: form.preferred_vendor ? 1 : 0,
          is_active: form.is_active ? 1 : 0,
          lead_time_days: Number(form.lead_time_days) || 0,
          minimum_order_amount: Number(form.minimum_order_amount) || 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      onCreated(created);
      onClose();
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-supplier-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="add-supplier-title">Add Supplier</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}
        <form onSubmit={submit} className="modal-body grid-2">
          <label>Supplier Code
            <input name="supplier_code" value={form.supplier_code} onChange={change} />
          </label>
          <label>Supplier Name *
            <input name="supplier_name" value={form.supplier_name} onChange={change} required />
          </label>
          <label>Contact Name
            <input name="contact_name" value={form.contact_name} onChange={change} />
          </label>
          <label>Contact Email
            <input type="email" name="contact_email" value={form.contact_email} onChange={change} />
          </label>
          <label>Phone
            <input name="phone" value={form.phone} onChange={change} />
          </label>
          <label>Website
            <input name="website" value={form.website} onChange={change} />
          </label>

          <label>Payment Terms
            <select name="payment_terms" value={form.payment_terms} onChange={change}>
              <option>Net 30</option><option>Net 60</option><option>On Delivery</option>
            </select>
          </label>
          <label>Lead Time (days)
            <input type="number" name="lead_time_days" min={0} value={form.lead_time_days} onChange={change} />
          </label>
          <label>Minimum Order Amount
            <input type="number" name="minimum_order_amount" min={0} value={form.minimum_order_amount} onChange={change} />
          </label>
          <label>Quality Rating
            <select name="quality_rating" value={form.quality_rating} onChange={change}>
              <option>Excellent</option><option>Good</option><option>Average</option>
            </select>
          </label>

          <label className="col-span-2">Address Line 1
            <input name="address_line1" value={form.address_line1} onChange={change} />
          </label>
          <label className="col-span-2">Address Line 2
            <input name="address_line2" value={form.address_line2} onChange={change} />
          </label>
          <label>City
            <input name="city" value={form.city} onChange={change} />
          </label>
          <label>State
            <input name="state" value={form.state} onChange={change} />
          </label>
          <label>Postal Code
            <input name="postal_code" value={form.postal_code} onChange={change} />
          </label>
          <label>Country
            <input name="country" value={form.country} onChange={change} />
          </label>

          <label className="col-span-2">Certifications
            <textarea name="certifications" rows={2} value={form.certifications} onChange={change} />
          </label>
          <label className="col-span-2">Notes
            <textarea name="notes" rows={3} value={form.notes} onChange={change} />
          </label>

          <label className="checkbox">
            <input type="checkbox" name="preferred_vendor" checked={form.preferred_vendor} onChange={change} />
            Preferred vendor
          </label>
          <label className="checkbox">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={change} />
            Active
          </label>

          <div className="modal-actions col-span-2">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------- Advanced Search Modal ----------------------- */
function AdvancedSearchModal({
  open,
  onClose,
  filters,
  setFilters,
  includeInactive,
  setIncludeInactive,
  onClear,
  onApply,
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal adv-modal" role="dialog" aria-modal="true" aria-labelledby="adv-search-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="adv-search-title">Advanced Search</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body adv-grid">
          <label>Preferred
            <select value={filters.preferred_vendor} onChange={(e) => setFilters(f => ({ ...f, preferred_vendor: e.target.value }))}>
              <option value="">Any</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>
          <label>Payment Terms
            <select value={filters.payment_terms} onChange={(e) => setFilters(f => ({ ...f, payment_terms: e.target.value }))}>
              <option value="">Any</option>
              <option>Net 30</option>
              <option>Net 60</option>
              <option>On Delivery</option>
            </select>
          </label>
          <label>Quality Rating
            <select value={filters.quality_rating} onChange={(e) => setFilters(f => ({ ...f, quality_rating: e.target.value }))}>
              <option value="">Any</option>
              <option>Excellent</option>
              <option>Good</option>
              <option>Average</option>
            </select>
          </label>
          <label>City
            <input value={filters.city} onChange={(e) => setFilters(f => ({ ...f, city: e.target.value }))} />
          </label>
          <label>State
            <input value={filters.state} onChange={(e) => setFilters(f => ({ ...f, state: e.target.value }))} />
          </label>
          <label>Lead Time Min
            <input type="number" min="0" value={filters.min_lead_time_days} onChange={(e) => setFilters(f => ({ ...f, min_lead_time_days: e.target.value }))} />
          </label>
          <label>Lead Time Max
            <input type="number" min="0" value={filters.max_lead_time_days} onChange={(e) => setFilters(f => ({ ...f, max_lead_time_days: e.target.value }))} />
          </label>
          <label>Min Order Min
            <input type="number" min="0" value={filters.min_minimum_order_amount} onChange={(e) => setFilters(f => ({ ...f, min_minimum_order_amount: e.target.value }))} />
          </label>
          <label>Min Order Max
            <input type="number" min="0" value={filters.max_minimum_order_amount} onChange={(e) => setFilters(f => ({ ...f, max_minimum_order_amount: e.target.value }))} />
          </label>
          <label className="adv-inline">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show deactivated suppliers
          </label>
        </div>
        <div className="modal-actions adv-actions">
          <button className="cancel-btn" onClick={onClear}>Clear</button>
          <button className="update-btn" onClick={onApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Main Page ------------------------------ */
export default function Suppliers() {
  const { user, token, isLoading: authLoading } = useAuth();
  
  const [suppliers, setSuppliers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [isEditing, setIsEditing] = useState(false);
  const isMobile = useIsMobile(768);

  const [q, setQ] = useState('');
  const [typing, setTyping] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [totalCount, setTotalCount] = useState(null);

  const [openAdd, setOpenAdd] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);

  // filters
  const [includeInactive, setIncludeInactive] = useState(false); // default off = hide deactivated
  const [filters, setFilters] = useState({
    preferred_vendor: '',     // '', '1', '0'
    city: '',
    state: '',
    payment_terms: '',        // 'Net 30', 'Net 60', 'On Delivery', ''
    quality_rating: '',       // 'Excellent','Good','Average',''
    min_lead_time_days: '',
    max_lead_time_days: '',
    min_minimum_order_amount: '',
    max_minimum_order_amount: '',
  });

  const abortRef = useRef(null);

  const selected = useMemo(
    () => suppliers.find(s => s.supplier_id === selectedId) || null,
    [suppliers, selectedId]
  );

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typing.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [typing]);

  // fetch page
  useEffect(() => {
    const fetchPage = async () => {
      setLoading(true);
      setErr('');

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (includeInactive) params.set('includeInactive', 'true');
      if (q) params.set('q', q);

      // advanced filters (only send if provided)
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) params.set(k, String(v));
      });

      const url = `${API_BASE}/search-advanced?${params.toString()}`;

      try {
        const authToken = token || getAuthToken();
        console.log('Using auth token:', authToken ? 'Token exists' : 'No token found');
        
        const res = await fetch(url, { 
          signal: ctrl.signal,
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const headerTotal = res.headers.get('X-Total-Count') || res.headers.get('x-total-count');
        const parsedTotal = headerTotal != null ? Number(headerTotal) : null;
        setTotalCount(Number.isFinite(parsedTotal) ? parsedTotal : null);
        const rows = await res.json();
        // Replace list per page rather than appending (numbered pagination)
        setSuppliers(rows);
        setHasMore(rows.length === PAGE_SIZE);
        if (offset === 0) {
          setSelectedId(rows[0]?.supplier_id ?? null);
          setIsEditing(false);
        }
      } catch (e) {
        if (e.name !== 'AbortError') setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
    
    // Cleanup function to abort pending requests
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [offset, q, includeInactive, filters]);

  // pagination helpers
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : null;
  const prevPage = () => {
    if (offset === 0 || loading) return;
    setOffset(prev => Math.max(0, prev - PAGE_SIZE));
  };
  const nextPage = () => {
    if (!hasMore || loading) return;
    setOffset(prev => prev + PAGE_SIZE);
  };

  const replaceSupplierInList = (supplier_id, updatedRow) => {
    setSuppliers(prev => prev.map(s => (s.supplier_id === supplier_id ? updatedRow : s)));
  };

  // PATCH general fields
  const saveGeneral = async (supplier_id, patch) => {
    const res = await fetch(`${API_BASE}/${supplier_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || getAuthToken()}`
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Update failed ${res.status}`);
    const updated = await res.json();
    replaceSupplierInList(supplier_id, updated);
    setIsEditing(false);
  };

  // PATCH address fields
  const saveAddress = async (supplier_id, addrPatch) => {
    const res = await fetch(`${API_BASE}/${supplier_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || getAuthToken()}`
      },
      body: JSON.stringify(addrPatch),
    });
    if (!res.ok) throw new Error(`Address update failed ${res.status}`);
    const updated = await res.json();
    replaceSupplierInList(supplier_id, updated);
  };

  const handleCreated = (created) => {
    // Prepend new supplier and select it
    setSuppliers(prev => [created, ...prev]);
    setSelectedId(created.supplier_id);
    setActiveTab('general');
    setIsEditing(false);
    // Optional: reset to first page to reflect server paging truth
    // setOffset(0);
  };

  /* ---------------------------- Subcomponents ---------------------------- */
  const SupplierDetails = ({ s, onEdit }) => (
    <div className="supplier-detail-content">
      <div className="detail-header">
        <h2>{s.supplier_name}</h2>
        <button onClick={onEdit} className="edit-btn">Edit</button>
      </div>

      <div className="detail-grid">
        <div className="detail-item"><label>Supplier ID</label><p>{s.supplier_id}</p></div>
        <div className="detail-item"><label>Company ID</label><p>{s.company_id}</p></div>
        <div className="detail-item"><label>Supplier Code</label><p>{s.supplier_code}</p></div>
        <div className="detail-item"><label>Contact Name</label><p>{s.contact_name}</p></div>
        <div className="detail-item"><label>Email</label><p>{s.contact_email}</p></div>
        <div className="detail-item"><label>Phone</label><p>{s.phone}</p></div>
        <div className="detail-item"><label>Website</label><p>{s.website}</p></div>
        <div className="detail-item"><label>Payment Terms</label><p>{s.payment_terms}</p></div>
        <div className="detail-item"><label>Lead Time (days)</label><p>{s.lead_time_days}</p></div>
        <div className="detail-item"><label>Min Order Amount</label><p>{s.minimum_order_amount}</p></div>
        <div className="detail-item"><label>Quality Rating</label><p>{s.quality_rating}</p></div>
        <div className="detail-item"><label>Preferred Vendor</label><p>{s.preferred_vendor ? 'Yes' : 'No'}</p></div>
        <div className="detail-item"><label>Active</label><p>{s.is_active ? 'Yes' : 'No'}</p></div>
        <div className="detail-item"><label>Created At</label><p>{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</p></div>
        <div className="detail-item col-span-2"><label>Certifications</label><p>{s.certifications || '—'}</p></div>
        <div className="detail-item col-span-2"><label>Notes</label><p>{s.notes || '—'}</p></div>
      </div>
    </div>
  );

  const SupplierForm = ({ s, onCancel, onSave }) => {
    const [form, setForm] = useState({
      company_id: s.company_id || '',
      supplier_code: s.supplier_code || '',
      supplier_name: s.supplier_name || '',
      contact_name: s.contact_name || '',
      contact_email: s.contact_email || '',
      phone: s.phone || '',
      website: s.website || '',
      payment_terms: s.payment_terms || 'Net 30',
      lead_time_days: s.lead_time_days || 0,
      minimum_order_amount: s.minimum_order_amount || 0,
      quality_rating: s.quality_rating || 'Good',
      preferred_vendor: Boolean(s.preferred_vendor),
      certifications: s.certifications || '',
      notes: s.notes || '',
      is_active: Boolean(s.is_active),
    });

    const change = (e) => {
      const { name, value, type, checked } = e.target;
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    return (
      <div className="supplier-detail-content">
        <h2>Edit Supplier</h2>

        <div className="form-grid">
          <div className="form-field"><label>Supplier Code</label>
            <input name="supplier_code" value={form.supplier_code} onChange={change} />
          </div>
          <div className="form-field"><label>Supplier Name</label>
            <input name="supplier_name" value={form.supplier_name} onChange={change} />
          </div>
          <div className="form-field"><label>Contact Name</label>
            <input name="contact_name" value={form.contact_name} onChange={change} />
          </div>
          <div className="form-field"><label>Email</label>
            <input type="email" name="contact_email" value={form.contact_email} onChange={change} />
          </div>
          <div className="form-field"><label>Phone</label>
            <input name="phone" value={form.phone} onChange={change} />
          </div>
          <div className="form-field"><label>Website</label>
            <input name="website" value={form.website} onChange={change} />
          </div>

          <div className="form-field"><label>Payment Terms</label>
            <select name="payment_terms" value={form.payment_terms} onChange={change}>
              <option>Net 30</option><option>Net 60</option><option>On Delivery</option>
            </select>
          </div>
          <div className="form-field"><label>Lead Time (days)</label>
            <input type="number" name="lead_time_days" value={form.lead_time_days} onChange={change} />
          </div>
          <div className="form-field"><label>Minimum Order Amount</label>
            <input type="number" name="minimum_order_amount" value={form.minimum_order_amount} onChange={change} />
          </div>
          <div className="form-field"><label>Quality Rating</label>
            <select name="quality_rating" value={form.quality_rating} onChange={change}>
              <option>Excellent</option><option>Good</option><option>Average</option>
            </select>
          </div>

          <div className="form-field col-span-2">
            <label>Certifications</label>
            <textarea name="certifications" rows={3} value={form.certifications} onChange={change} />
          </div>
          <div className="form-field col-span-2">
            <label>Notes</label>
            <textarea name="notes" rows={4} value={form.notes} onChange={change} />
          </div>
        </div>

        <div className="form-checkbox">
          <input id="preferred_vendor" name="preferred_vendor" type="checkbox"
                 checked={form.preferred_vendor} onChange={change} />
          <label htmlFor="preferred_vendor">Preferred vendor</label>
        </div>

        <div className="form-checkbox">
          <input id="is_active" name="is_active" type="checkbox"
                 checked={form.is_active} onChange={change} />
          <label htmlFor="is_active">Active</label>
        </div>

        <div className="form-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="update-btn"
            onClick={() => onSave({
              company_id: form.company_id,
              supplier_code: form.supplier_code,
              supplier_name: form.supplier_name,
              contact_name: form.contact_name,
              contact_email: form.contact_email,
              phone: form.phone,
              website: form.website,
              payment_terms: form.payment_terms,
              lead_time_days: Number(form.lead_time_days),
              minimum_order_amount: Number(form.minimum_order_amount),
              quality_rating: form.quality_rating,
              preferred_vendor: form.preferred_vendor ? 1 : 0,
              certifications: form.certifications,
              notes: form.notes,
              is_active: form.is_active ? 1 : 0,
            })}>
            Update Supplier
          </button>
        </div>

        <div style={{ marginTop: 12, opacity: 0.7 }}>
          <small>Created at: {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</small>
        </div>
      </div>
    );
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="suppliers-layout">
      <div className="supplier-list-panel">
        <div className="list-panel-header">
          <h1>Suppliers</h1>
          <div className="list-panel-actions">
            <button className="filters-btn" onClick={() => setOpenFilters(true)}>Filters</button>
            {includeInactive && <span className="filter-chip">Including deactivated</span>}
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search suppliers..."
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
            />
          </div>
        </div>

        

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="supplier-list">
          {suppliers.map(s => (
            <ListItem
              key={s.supplier_id}
              title={s.supplier_name}
              details={[s.supplier_code, [s.city, s.state].filter(Boolean).join(', ')]}
              selected={selectedId === s.supplier_id}
              onClick={() => { setSelectedId(s.supplier_id); setIsEditing(false); }}
            />
          ))}
          {loading && <div className="loading-row">Loading...</div>}
        </div>

        <div className="list-panel-footer">
          <button className="add-supplier-btn" onClick={() => setOpenAdd(true)}>
            <Plus size={18}/> Add Supplier
          </button>
          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={prevPage}
              disabled={offset === 0 || loading}
              title="Previous page"
            >
              Prev
            </button>
            <span className="page-indicator">
              {totalPages ? (`Page ${currentPage} of ${totalPages}`) : (`Page ${currentPage}`)}
              {` • ${PAGE_SIZE} per page`}
            </span>
            <button
              className="pagination-btn"
              onClick={nextPage}
              disabled={!hasMore || loading}
              title="Next page"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isMobile ? (
        <MobileSupplierModal
          open={Boolean(selected)}
          onClose={() => { setSelectedId(null); setIsEditing(false); }}
          title={selected ? selected.supplier_name : 'Supplier'}
        >
          <div className="supplier-tabs">
            <button
              className={`tab-btn ${activeTab === 'general' ? 'active' : ''}` }
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              className={`tab-btn ${activeTab === 'address' ? 'active' : ''}` }
              onClick={() => setActiveTab('address')}
            >
              Address
            </button>
          </div>

          {selected && activeTab === 'general' && (
            isEditing ? (
              <SupplierForm
                s={selected}
                onCancel={() => setIsEditing(false)}
                onSave={(patch) => saveGeneral(selected.supplier_id, patch)}
              />
            ) : (
              <SupplierDetails s={selected} onEdit={() => setIsEditing(true)} />
            )
          )}

          {selected && activeTab === 'address' && (
            <SupplierAddress
              value={{
                address_line1: selected.address_line1,
                address_line2: selected.address_line2,
                city: selected.city,
                state: selected.state,
                postal_code: selected.postal_code,
                country: selected.country,
                phone: selected.phone,
              }}
              isEditing={true}
              onUpdate={(addrPatch) => saveAddress(selected.supplier_id, addrPatch)}
            />
          )}
        </MobileSupplierModal>
      ) : (
        <div className="supplier-detail-panel">
          {!selected ? (
            <p>Select a supplier to see details.</p>
          ) : (
            <>
              <div className="supplier-tabs">
                <button
                  className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  General
                </button>
                <button
                  className={`tab-btn ${activeTab === 'address' ? 'active' : ''}`}
                  onClick={() => setActiveTab('address')}
                >
                  Address
                </button>
              </div>

              {activeTab === 'general' && (
                isEditing ? (
                  <SupplierForm
                    s={selected}
                    onCancel={() => setIsEditing(false)}
                    onSave={(patch) => saveGeneral(selected.supplier_id, patch)}
                  />
                ) : (
                  <SupplierDetails s={selected} onEdit={() => setIsEditing(true)} />
                )
              )}

              {activeTab === 'address' && (
                <SupplierAddress
                  value={{
                    address_line1: selected.address_line1,
                    address_line2: selected.address_line2,
                    city: selected.city,
                    state: selected.state,
                    postal_code: selected.postal_code,
                    country: selected.country,
                    phone: selected.phone,
                  }}
                  isEditing={true}
                  onUpdate={(addrPatch) => saveAddress(selected.supplier_id, addrPatch)}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Modal */}
      <AdvancedSearchModal
        open={openFilters}
        onClose={() => setOpenFilters(false)}
        filters={filters}
        setFilters={setFilters}
        includeInactive={includeInactive}
        setIncludeInactive={setIncludeInactive}
        onClear={() => {
          setFilters({
            preferred_vendor: '',
            city: '',
            state: '',
            payment_terms: '',
            quality_rating: '',
            min_lead_time_days: '',
            max_lead_time_days: '',
            min_minimum_order_amount: '',
            max_minimum_order_amount: '',
          });
          setIncludeInactive(false);
          setOffset(0);
        }}
        onApply={() => { setOffset(0); setOpenFilters(false); }}
      />
      <AddSupplierModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token || getAuthToken()}
      />
    </div>
  );
}
