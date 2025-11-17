import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Info } from 'lucide-react';
import './Parts.css';
import PartInventory from './PartInventory.jsx';
import useIsMobile from '../../../hooks/useIsMobile.js';
import MobilePartModal from './PartModalMobile.jsx';
import { useAuth } from '../../../shared/contexts/AuthContext.jsx';
import ListItem from '../../../components/ListItem.jsx';

const PAGE_SIZE = 10;
const API_BASE = import.meta.env.VITE_API_BASE_URL + '/api/inventory/parts';

// Helper function to get auth token with validation
const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  console.log('Token from localStorage:', token ? 'Token exists' : 'No token found');
  if (!token) {
    console.warn('No auth token found in localStorage');
  }
  return token || '';
};

const summarizeInventory = (items = []) => {
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(now.getDate() + 30);

  let totalOnHand = 0;
  let totalAvailable = 0;
  let expiringSoon = 0;
  let expired = 0;
  const locations = new Set();

  items.forEach(item => {
    const onHand = Number(item.quantity_on_hand ?? item.quantity ?? 0) || 0;
    const available = Number(item.quantity_available ?? item.availableQuantity ?? item.quantity ?? 0) || 0;
    totalOnHand += onHand;
    totalAvailable += available;

    const expirationCandidate = item.expiration_date || item.expiry_date;
    if (expirationCandidate) {
      const expirationDate = new Date(expirationCandidate);
      if (!Number.isNaN(expirationDate.getTime())) {
        if (expirationDate < now) {
          expired += onHand;
        } else if (expirationDate <= soon) {
          expiringSoon += onHand;
        }
      }
    }

    const locationKey = item.location_id ?? item.location_name ?? item.warehouse_name ?? item.location_details;
    if (locationKey) {
      locations.add(locationKey);
    }
  });

  return {
    totalOnHand,
    totalAvailable,
    expiringSoon,
    expired,
    locations: locations.size,
  };
};

/* ------------------------- Add Part Modal ------------------------- */
function AddPartModal({ open, onClose, onCreated, authTokenStr }) {
  if (!open) return null;

  const [form, setForm] = useState({
    company_id: '',
    product_name: '',
    gtin: '',
    description: '',
    sku: '',
    udi_code: '',
    category: '',
    subcategory: '',
    supplier_id: '',  // This will be set to the same as default_supplier_id
    default_supplier_id: '',
    lot_tracked: false,
    serial_tracked: false,
    expiration_required: false,
    temperature_sensitive: false,
    sterile_required: false,
    regulatory_class: '',
    reorder_point: 0,
    reorder_quantity: 0,
    unit_of_measure: '',
    weight: 0,
    dimensions: '',
    is_active: true,
    create_as_product: true, // Set to true by default
  });

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [suppliers, setSuppliers] = useState([]);

  // Fetch suppliers for dropdowns
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/procurement/suppliers`, {
          headers: { Authorization: `Bearer ${authTokenStr}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch suppliers: ${res.status}`);
        const data = await res.json();
        setSuppliers(data);
      } catch (e) {
        console.error('Error fetching suppliers', e);
        setErr('Failed to load supplier list.');
      }
    };
    fetchSuppliers();
  }, [authTokenStr]);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    // When default_supplier_id changes, also update supplier_id
    if (name === 'default_supplier_id') {
      setForm(prev => ({
        ...prev,
        default_supplier_id: newValue,
        supplier_id: newValue  // Keep both in sync
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: newValue }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');

    // Basic form validation
    if (!form.product_name) {
      setErr('Product name is required.');
      return;
    }

    // Prepare the payload with proper type conversion
    const payload = {
      ...form,
      // Remove supplier_id as it's not needed
      default_supplier_id: form.default_supplier_id ? Number(form.default_supplier_id) : null,
      // Convert boolean values to 1/0 for the backend
      lot_tracked: form.lot_tracked ? 1 : 0,
      serial_tracked: form.serial_tracked ? 1 : 0,
      expiration_required: form.expiration_required ? 1 : 0,
      temperature_sensitive: form.temperature_sensitive ? 1 : 0,
      sterile_required: form.sterile_required ? 1 : 0,
      is_active: form.is_active ? 1 : 0,
      // Convert numeric fields, defaulting to 0 if invalid
      reorder_point: Number(form.reorder_point) || 0,
      reorder_quantity: Number(form.reorder_quantity) || 0,
      weight: Number(form.weight) || 0,
    };

    setSubmitting(true);
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authTokenStr}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      
      // If "Create as Product" is checked, create a product as well
      if (form.create_as_product) {
        try {
          const productPayload = {
            product_name: created.product_name,
            public_sku: created.sku,
            base_price: created.unit_price,
            description: created.description,
            product_category: created.category,
            part_id: created.part_id,
            is_active: 1,
          };

          const productRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/inventory/products`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authTokenStr}`,
            },
            body: JSON.stringify(productPayload),
          });
          
          if (!productRes.ok) {
            const errorData = await productRes.json().catch(() => ({}));
            console.error('Product creation error response:', errorData);
            throw new Error(`Product creation failed (${productRes.status}): ${errorData.message || 'Unknown error'}`);
          }
          
          console.log('✅ Product created automatically from Part');
        } catch (prodErr) {
          console.error('Error creating product:', prodErr);
          // Show error but don't prevent the form from closing
          alert('Part was created, but there was an error creating the product: ' + prodErr.message);
        }
      }
      
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
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-part-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="add-part-title">Add Part</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <form onSubmit={submit} className="modal-body">
          <div className="grid-2">
            <h3 className="col-span-2" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: '0.5rem 0 0.25rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>Basic Information</h3>

            <label>Part Name *
              <input name="product_name" value={form.product_name} onChange={change} required />
            </label>
            <label>SKU
              <input name="sku" value={form.sku} onChange={change} />
            </label>
            <label>Category
              <input name="category" value={form.category} onChange={change} />
            </label>
            <label>Subcategory
              <input name="subcategory" value={form.subcategory} onChange={change} />
            </label>
            <label className="col-span-2">Default Supplier *
              <select name="default_supplier_id" value={form.default_supplier_id || ""} onChange={change} required>
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2">Description
              <textarea name="description" rows={2} value={form.description} onChange={change} />
            </label>

            <h3 className="col-span-2" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: '1rem 0 0.25rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>Identifiers</h3>

            <label>GTIN
              <input name="gtin" value={form.gtin} onChange={change} />
            </label>
            <label>UDI Code
              <input name="udi_code" value={form.udi_code} onChange={change} />
            </label>

            <h3 className="col-span-2" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: '1rem 0 0.25rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>Inventory Settings</h3>

            <label>Unit of Measure
              <input name="unit_of_measure" value={form.unit_of_measure} onChange={change} placeholder="EA, BOX, CASE" />
            </label>
            <label>Regulatory Class
              <input name="regulatory_class" value={form.regulatory_class} onChange={change} placeholder="Class I, II, III" />
            </label>
            <label>Reorder Point
              <input type="number" name="reorder_point" min={0} value={form.reorder_point} onChange={change} />
            </label>
            <label>Reorder Quantity
              <input type="number" name="reorder_quantity" min={0} value={form.reorder_quantity} onChange={change} />
            </label>

            <h3 className="col-span-2" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: '1rem 0 0.25rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>Physical Properties</h3>

            <label>Weight (lbs)
              <input type="number" step="0.01" name="weight" min={0} value={form.weight} onChange={change} />
            </label>
            <label>Dimensions (L x W x H)
              <input name="dimensions" value={form.dimensions} onChange={change} placeholder="e.g., 10 x 5 x 3" />
            </label>

            <h3 className="col-span-2" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: '1rem 0 0.25rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>Tracking & Compliance</h3>

            <label className="checkbox">
              <input type="checkbox" name="lot_tracked" checked={form.lot_tracked} onChange={change} />
              Lot tracked
            </label>
            <label className="checkbox">
              <input type="checkbox" name="serial_tracked" checked={form.serial_tracked} onChange={change} />
              Serial tracked
            </label>
            <label className="checkbox">
              <input type="checkbox" name="expiration_required" checked={form.expiration_required} onChange={change} />
              Expiration required
            </label>
            <label className="checkbox">
              <input type="checkbox" name="temperature_sensitive" checked={form.temperature_sensitive} onChange={change} />
              Temperature sensitive
            </label>
            <label className="checkbox">
              <input type="checkbox" name="sterile_required" checked={form.sterile_required} onChange={change} />
              Sterile required
            </label>
            <label className="checkbox">
              <input type="checkbox" name="is_active" checked={form.is_active} onChange={change} />
              Active
            </label>
            <label className="checkbox">
              <input type="checkbox" name="create_as_product" checked={form.create_as_product} onChange={(e) => setForm(prev => ({ ...prev, create_as_product: e.target.checked }))} />
              Create as Product
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Part'}
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
          <label>Category
            <input value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))} />
          </label>
          <label>Subcategory
            <input value={filters.subcategory} onChange={(e) => setFilters(f => ({ ...f, subcategory: e.target.value }))} />
          </label>
          <label>Regulatory Class
            <input value={filters.regulatory_class} onChange={(e) => setFilters(f => ({ ...f, regulatory_class: e.target.value }))} />
          </label>
          <label>Lot Tracked
            <select value={filters.lot_tracked} onChange={(e) => setFilters(f => ({ ...f, lot_tracked: e.target.value }))}>
              <option value="">Any</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>
          <label>Serial Tracked
            <select value={filters.serial_tracked} onChange={(e) => setFilters(f => ({ ...f, serial_tracked: e.target.value }))}>
              <option value="">Any</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>
          <label>Expiration Required
            <select value={filters.expiration_required} onChange={(e) => setFilters(f => ({ ...f, expiration_required: e.target.value }))}>
              <option value="">Any</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>
          <label>Min Price
            <input type="number" step="0.01" min="0" value={filters.min_unit_price} onChange={(e) => setFilters(f => ({ ...f, min_unit_price: e.target.value }))} />
          </label>
          <label>Max Price
            <input type="number" step="0.01" min="0" value={filters.max_unit_price} onChange={(e) => setFilters(f => ({ ...f, max_unit_price: e.target.value }))} />
          </label>
          <label className="adv-inline">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show deactivated parts
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
export default function Parts() {
  const { user, token, isLoading: authLoading } = useAuth();
  
  const [parts, setParts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [isEditingGeneral, setIsEditingGeneral] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const isMobile = useIsMobile(768);

  const [q, setQ] = useState('');
  const [typing, setTyping] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [totalCount, setTotalCount] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    subcategory: '',
    regulatory_class: '',
    lot_tracked: '',
    serial_tracked: '',
    expiration_required: '',
    // cost and unit price removed – filters simplified
  });
  const [stockSummary, setStockSummary] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState('');

  const abortRef = useRef(null);

  const selected = useMemo(
    () => parts.find(p => p.part_id === selectedId) || null,
    [parts, selectedId]
  );

  // Fetch suppliers list for displaying supplier information
  useEffect(() => {
    const fetchSuppliers = async () => {
      setLoadingSuppliers(true);
      try {
        const authToken = token || getAuthToken();
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/procurement/suppliers`, {
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
        });
        if (!res.ok) throw new Error(`Failed to fetch suppliers: ${res.status}`);
        const data = await res.json();
        setSuppliers(data);
      } catch (e) {
        console.error('Error fetching suppliers', e);
      } finally {
        setLoadingSuppliers(false);
      }
    };
    
    if (token || getAuthToken()) {
      fetchSuppliers();
    }
  }, [token]);

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
        setParts(rows);
        setHasMore(rows.length === PAGE_SIZE);
        if (offset === 0) {
          setSelectedId(rows[0]?.part_id ?? null);
          setIsEditingGeneral(false);
          setIsEditingDetails(false);
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
  }, [offset, q, includeInactive, filters, token]);

  useEffect(() => {
    let ignore = false;

    if (!selectedId) {
      setStockSummary(null);
      setStockError('');
      setStockLoading(false);
      return () => {
        ignore = true;
      };
    }

    const fetchStockSummary = async () => {
      setStockLoading(true);
      setStockError('');
      try {
        const authToken = token || getAuthToken();
        if (!authToken) throw new Error('Missing auth token');

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/inventory/items/${selectedId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to load stock info (HTTP ${res.status})`);
        }

        const payload = await res.json();
        const inventoryRows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];
        const summary = summarizeInventory(inventoryRows);
        if (!ignore) {
          setStockSummary(summary);
        }
      } catch (error) {
        console.error('Error loading stock summary:', error);
        if (!ignore) {
          setStockSummary(null);
          setStockError(error.message || 'Failed to check inventory');
        }
      } finally {
        if (!ignore) {
          setStockLoading(false);
        }
      }
    };

    fetchStockSummary();

    return () => {
      ignore = true;
    };
  }, [selectedId, token]);

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

  const replacePartInList = (part_id, updatedRow) => {
    setParts(prev => prev.map(p => (p.part_id === part_id ? updatedRow : p)));
  };

  // PATCH general fields
  const saveGeneral = async (part_id, patch) => {
    try {
      console.log('Sending PATCH request with data:', patch);
      const res = await fetch(`${API_BASE}/${part_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || getAuthToken()}`
        },
        body: JSON.stringify(patch),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Update failed with status:', res.status, 'Error:', errorData);
        throw new Error(`Update failed: ${res.status} - ${errorData.message || 'Unknown error'}`);
      }
      
      const updated = await res.json();
      
      // Merge the updated fields with the existing part data to preserve any missing fields
      const existingPart = parts.find(p => p.part_id === part_id);
      const mergedPart = {
        ...existingPart,
        ...updated,
        // Ensure default_supplier_id is properly set from the patch if it was updated
        default_supplier_id: 'default_supplier_id' in patch ? 
          (patch.default_supplier_id ? Number(patch.default_supplier_id) : null) : 
          (existingPart?.default_supplier_id || null)
      };
      
      replacePartInList(part_id, mergedPart);
      setIsEditingGeneral(false);
      setIsEditingDetails(false);
      
      // If we have the full supplier object in the form, update the parts list with it
      if (patch.supplier) {
        setParts(prev => prev.map(p => 
          p.part_id === part_id ? { ...p, supplier: patch.supplier } : p
        ));
      }
      
      return mergedPart;
    } catch (error) {
      console.error('Error in saveGeneral:', error);
      throw error; // Re-throw to be caught by the caller
    }
  };

  const handleCreated = (created) => {
    // Prepend new part and select it
    setParts(prev => [created, ...prev]);
    setSelectedId(created.part_id);
    setActiveTab('general');
    setIsEditingGeneral(false);
    setIsEditingDetails(false);
    // Optional: reset to first page to reflect server paging truth
    // setOffset(0);
  };

  /* ---------------------------- Subcomponents ---------------------------- */
  const PartDetails = ({
    p,
    onEdit,
    suppliers = [],
    loadingSuppliers,
    mode = 'details',
    stockSummary,
    stockLoading,
    stockError,
  }) => {
    const defaultSupplier = p.default_supplier_id 
      ? suppliers.find(s => s.supplier_id === p.default_supplier_id)
      : null;
    const formatQuantity = (value) => {
      if (value === null || value === undefined) return '0';
      const numeric = Number(value);
      return Number.isNaN(numeric) ? '0' : numeric.toLocaleString();
    };

    const summaryFields = [
      { label: 'SKU', value: p.sku || 'N/A' },
      { label: 'Category', value: p.category || 'Uncategorized' },
      { label: 'Default Supplier', value: defaultSupplier ? defaultSupplier.supplier_name : 'Not Assigned' },
      { label: 'Status', value: p.is_active ? 'Active' : 'Inactive' },
      { label: 'Created', value: p.created_at ? new Date(p.created_at).toLocaleDateString() : '—' }
    ];

    const detailFields = [
      { label: 'SKU', value: p.sku || 'N/A' },
      { label: 'GTIN', value: p.gtin || 'N/A' },
      { label: 'UDI Code', value: p.udi_code || 'N/A' },
      { label: 'Category', value: p.category || 'N/A' },
      { label: 'Subcategory', value: p.subcategory || 'N/A' },
      { label: 'Cost', value: 'Now managed per supplier' },
      {
        label: 'Default Supplier',
        value: loadingSuppliers
          ? 'Loading suppliers...'
          : defaultSupplier
          ? `${defaultSupplier.supplier_name}${defaultSupplier.email ? ` (${defaultSupplier.email})` : ''}`
          : 'No default supplier selected'
      },
      { label: 'Regulatory Class', value: p.regulatory_class || 'N/A' },
      { label: 'Unit of Measure', value: p.unit_of_measure || 'EA' },
      { label: 'Reorder Point', value: p.reorder_point || 0 },
      { label: 'Reorder Quantity', value: p.reorder_quantity || 0 },
      { label: 'Weight', value: p.weight ? `${p.weight} lbs` : 'N/A' },
      { label: 'Dimensions', value: p.dimensions || 'N/A' },
      { label: 'Lot Tracked', value: p.lot_tracked ? 'Yes' : 'No' },
      { label: 'Serial Tracked', value: p.serial_tracked ? 'Yes' : 'No' },
      { label: 'Expiration Required', value: p.expiration_required ? 'Yes' : 'No' },
      { label: 'Temperature Sensitive', value: p.temperature_sensitive ? 'Yes' : 'No' },
      { label: 'Sterile Required', value: p.sterile_required ? 'Yes' : 'No' },
      { label: 'Status', value: p.is_active ? 'Active' : 'Inactive' },
      { label: 'Created At', value: p.created_at ? new Date(p.created_at).toLocaleString() : '—' },
      { label: 'Updated At', value: p.updated_at ? new Date(p.updated_at).toLocaleString() : '—' }
    ];

    const renderStockSummary = () => {
      if (stockLoading) {
        return <p className="stock-meta">Checking inventory...</p>;
      }
      if (stockError) {
        return <p className="stock-error">{stockError}</p>;
      }
      if (!stockSummary) {
        return <p className="stock-meta">No inventory records yet for this part.</p>;
      }
      return (
        <>
          <div className="stock-grid">
            <div className="stock-card">
              <p className="stock-label">On Hand</p>
              <p className="stock-value">{formatQuantity(stockSummary.totalOnHand)}</p>
            </div>
            <div className="stock-card">
              <p className="stock-label">Available</p>
              <p className="stock-value">{formatQuantity(stockSummary.totalAvailable)}</p>
            </div>
            <div className="stock-card">
              <p className="stock-label">Expiring Soon</p>
              <p className="stock-value warning">{formatQuantity(stockSummary.expiringSoon)}</p>
            </div>
            <div className="stock-card">
              <p className="stock-label">Expired</p>
              <p className="stock-value danger">{formatQuantity(stockSummary.expired)}</p>
            </div>
          </div>
          <p className="stock-meta">
            {stockSummary.totalOnHand > 0
              ? `Tracking ${stockSummary.totalOnHand === 1 ? 'unit' : 'units'} across ${stockSummary.locations || 0} ${stockSummary.locations === 1 ? 'location' : 'locations'}.`
              : 'Nothing on the shelf right now.'}
          </p>
        </>
      );
    };

    if (mode === 'summary') {
      return (
        <div className="part-detail-content part-detail-summary">
          <div className="detail-header">
            <div>
              <h2>{p.product_name || 'Unnamed Part'}</h2>
              {p.description && <p className="description">{p.description}</p>}
            </div>
            <button onClick={onEdit} className="edit-btn">Edit</button>
          </div>
          <div className="detail-grid summary-grid">
            {summaryFields.map(field => (
              <div key={field.label} className="detail-item">
                <label>{field.label}</label>
                <p>{field.value}</p>
              </div>
            ))}
          </div>
          <div className="stock-section" aria-live="polite">
            <div className="stock-section-header">
              <h3>What's in stock</h3>
              <div className="stock-info" aria-label="Inventory definitions">
                <Info size={16} strokeWidth={2} />
                <div className="stock-info-tooltip" role="tooltip">
                  <p><strong>On hand</strong> is the total physically sitting on the shelf.</p>
                  <p><strong>Available</strong> is what remains after reservations and holds.</p>
                </div>
              </div>
              {stockSummary && (
                <span className="stock-pill">
                  {stockSummary.locations || 0} {stockSummary.locations === 1 ? 'location' : 'locations'}
                </span>
              )}
            </div>
            {renderStockSummary()}
          </div>
        </div>
      );
    }

    return (
      <div className="part-detail-content">
        <div className="detail-header">
          <h2>{p.product_name || 'Unnamed Part'}</h2>
          <button onClick={onEdit} className="edit-btn">Edit</button>
        </div>
        {p.description && <p className="description">{p.description}</p>}
        <div className="detail-grid">
          {detailFields.map(field => (
            <div key={field.label} className="detail-item">
              <label>{field.label}</label>
              <p>{field.value}</p>
            </div>
          ))}
          <div className="detail-item col-span-2">
            <label>Notes</label>
            <p>{p.description || '—'}</p>
          </div>
        </div>
      </div>
    );
  };

  const PartForm = ({ p, onCancel, onSave }) => {
    const [form, setForm] = useState({
      company_id: p.company_id || '',
      product_name: p.product_name || '',
      gtin: p.gtin || '',
      description: p.description || '',
      sku: p.sku || '',
      udi_code: p.udi_code || '',
      category: p.category || '',
      subcategory: p.subcategory || '',
      default_supplier_id: p.default_supplier_id ? String(p.default_supplier_id) : '',
      lot_tracked: Boolean(p.lot_tracked),
      serial_tracked: Boolean(p.serial_tracked),
      expiration_required: Boolean(p.expiration_required),
      temperature_sensitive: Boolean(p.temperature_sensitive),
      sterile_required: Boolean(p.sterile_required),
      regulatory_class: p.regulatory_class || '',
      reorder_point: p.reorder_point || 0,
      reorder_quantity: p.reorder_quantity || 0,
      unit_of_measure: p.unit_of_measure || 'EA',
      weight: p.weight || 0,
      dimensions: p.dimensions || '',
      is_active: Boolean(p.is_active !== undefined ? p.is_active : true),
    });
    
    const [formSuppliers, setFormSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch suppliers for dropdown
    useEffect(() => {
      const fetchSuppliers = async () => {
        try {
          const authToken = token || getAuthToken();
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/procurement/suppliers`, {
            headers: { 
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
          });
          if (!res.ok) throw new Error(`Failed to fetch suppliers: ${res.status}`);
          const data = await res.json();
          setFormSuppliers(data);
        } catch (e) {
          console.error('Error fetching suppliers', e);
        } finally {
          setLoading(false);
        }
      };
      fetchSuppliers();
    }, [token]);

    const change = (e) => {
      const { name, value, type, checked } = e.target;
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    return (
      <div className="part-detail-content">
        <h2>Edit Part</h2>

        <div className="form-grid">
          <div className="form-field"><label>Product Name</label>
            <input name="product_name" value={form.product_name} onChange={change} />
          </div>
          <div className="form-field"><label>SKU</label>
            <input name="sku" value={form.sku} onChange={change} />
          </div>
          <div className="form-field"><label>GTIN</label>
            <input name="gtin" value={form.gtin} onChange={change} />
          </div>
          <div className="form-field"><label>UDI Code</label>
            <input name="udi_code" value={form.udi_code} onChange={change} />
          </div>
          <div className="form-field"><label>Category</label>
            <input name="category" value={form.category} onChange={change} />
          </div>
          <div className="form-field"><label>Subcategory</label>
            <input name="subcategory" value={form.subcategory} onChange={change} />
          </div>
          <div className="form-field"><label>Cost</label>
            <input type="number" step="0.01" name="cost" disabled placeholder="Now managed per supplier" />
          </div>
          <div className="form-field">
            <label>Default Supplier</label>
            <select 
              name="default_supplier_id" 
              value={form.default_supplier_id} 
              onChange={change}
              className="w-full p-2 border rounded"
              disabled={loading}
            >
              <option value="">Select default supplier</option>
              {formSuppliers.map((supplier) => (
                <option key={supplier.supplier_id} value={supplier.supplier_id}>
                  {supplier.supplier_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field"><label>Regulatory Class</label>
            <input name="regulatory_class" value={form.regulatory_class} onChange={change} />
          </div>
          <div className="form-field"><label>Unit of Measure</label>
            <input name="unit_of_measure" value={form.unit_of_measure} onChange={change} />
          </div>
          <div className="form-field"><label>Reorder Point</label>
            <input type="number" name="reorder_point" value={form.reorder_point} onChange={change} />
          </div>
          <div className="form-field"><label>Reorder Quantity</label>
            <input type="number" name="reorder_quantity" value={form.reorder_quantity} onChange={change} />
          </div>
          <div className="form-field"><label>Weight</label>
            <input type="number" step="0.01" name="weight" value={form.weight} onChange={change} />
          </div>
          <div className="form-field"><label>Dimensions</label>
            <input name="dimensions" value={form.dimensions} onChange={change} />
          </div>

          <div className="form-field col-span-2">
            <label>Description</label>
            <textarea name="description" rows={4} value={form.description} onChange={change} />
          </div>
        </div>

        <div className="form-checkbox">
          <input id="lot_tracked" name="lot_tracked" type="checkbox"
                 checked={form.lot_tracked} onChange={change} />
          <label htmlFor="lot_tracked">Lot tracked</label>
        </div>

        <div className="form-checkbox">
          <input id="serial_tracked" name="serial_tracked" type="checkbox"
                 checked={form.serial_tracked} onChange={change} />
          <label htmlFor="serial_tracked">Serial tracked</label>
        </div>

        <div className="form-checkbox">
          <input id="expiration_required" name="expiration_required" type="checkbox"
                 checked={form.expiration_required} onChange={change} />
          <label htmlFor="expiration_required">Expiration required</label>
        </div>

        <div className="form-checkbox">
          <input id="temperature_sensitive" name="temperature_sensitive" type="checkbox"
                 checked={form.temperature_sensitive} onChange={change} />
          <label htmlFor="temperature_sensitive">Temperature sensitive</label>
        </div>

        <div className="form-checkbox">
          <input id="sterile_required" name="sterile_required" type="checkbox"
                 checked={form.sterile_required} onChange={change} />
          <label htmlFor="sterile_required">Sterile required</label>
        </div>

        <div className="form-checkbox">
          <input id="is_active" name="is_active" type="checkbox"
                 checked={form.is_active} onChange={change} />
          <label htmlFor="is_active">Active</label>
        </div>

        <div className="form-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button 
            className="update-btn"
            onClick={() => {
              const updateData = {
                company_id: form.company_id,
                product_name: form.product_name,
                gtin: form.gtin || null,
                description: form.description || null,
                sku: form.sku,
                udi_code: form.udi_code || null,
                category: form.category || null,
                subcategory: form.subcategory || null,
                default_supplier_id: form.default_supplier_id ? Number(form.default_supplier_id) : null,
                lot_tracked: form.lot_tracked ? 1 : 0,
                serial_tracked: form.serial_tracked ? 1 : 0,
                expiration_required: form.expiration_required ? 1 : 0,
                temperature_sensitive: form.temperature_sensitive ? 1 : 0,
                sterile_required: form.sterile_required ? 1 : 0,
                regulatory_class: form.regulatory_class || null,
                reorder_point: Number(form.reorder_point) || 0,
                reorder_quantity: Number(form.reorder_quantity) || 0,
                unit_of_measure: form.unit_of_measure || 'EA',
                weight: Number(form.weight) || 0,
                dimensions: form.dimensions || null,
                is_active: form.is_active ? 1 : 0,
              };
              
              // Remove empty strings and convert to null
              Object.keys(updateData).forEach(key => {
                if (updateData[key] === '') {
                  updateData[key] = null;
                }
              });
              
              onSave(updateData);
            }}
          >
            Update Part
          </button>
        </div>

        <div style={{ marginTop: 12, opacity: 0.7 }}>
          <small>Created at: {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</small>
        </div>
      </div>
    );
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="parts-layout">
      <div className="part-list-panel">
        <div className="list-panel-header">
          <h1>Parts</h1>
          <div className="list-panel-actions">
            <button className="filters-btn" onClick={() => setOpenFilters(true)}>Filters</button>
            {includeInactive && <span className="filter-chip">Including deactivated</span>}
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search parts..."
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
            />
          </div>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="part-list">
          {parts.map(p => (
            <ListItem
              key={p.part_id}
              title={p.product_name}
              details={[p.sku, p.description].filter(Boolean).slice(0, 2)}
              selected={selectedId === p.part_id}
              onClick={() => { setSelectedId(p.part_id); setIsEditingGeneral(false); setIsEditingDetails(false); }}
            />
          ))}
          {loading && <div className="loading-row">Loading...</div>}
        </div>

        <div className="list-panel-footer">
          <button className="add-part-btn" onClick={() => setOpenAdd(true)}>
            <Plus size={18}/> Add Part
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
        <MobilePartModal
          open={Boolean(selected)}
          onClose={() => { setSelectedId(null); setIsEditingGeneral(false); setIsEditingDetails(false); }}
          title={selected ? selected.product_name : 'Part'}
        >
          <div className="part-tabs">
            <button
              className={`tab-btn ${activeTab === 'general' ? 'active' : ''}` }
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              className={`tab-btn ${activeTab === 'details' ? 'active' : ''}` }
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
            <button
              className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}` }
              onClick={() => setActiveTab('inventory')}
            >
              Inventory
            </button>
          </div>

          {selected && activeTab === 'general' && (
            isEditingGeneral ? (
              <PartForm
                p={selected}
                onCancel={() => setIsEditingGeneral(false)}
                onSave={(patch) => saveGeneral(selected.part_id, patch)}
              />
            ) : (
              <PartDetails
                p={selected}
                onEdit={() => setIsEditingGeneral(true)}
                suppliers={suppliers}
                loadingSuppliers={loadingSuppliers}
                mode="summary"
                stockSummary={stockSummary}
                stockLoading={stockLoading}
                stockError={stockError}
              />
            )
          )}

          {selected && activeTab === 'details' && (
            isEditingDetails ? (
              <PartForm
                p={selected}
                onCancel={() => setIsEditingDetails(false)}
                onSave={(patch) => saveGeneral(selected.part_id, patch)}
              />
            ) : (
              <PartDetails
                p={selected}
                onEdit={() => setIsEditingDetails(true)}
                suppliers={suppliers}
                loadingSuppliers={loadingSuppliers}
                mode="details"
              />
            )
          )}

          {selected && activeTab === 'inventory' && (
            <PartInventory
              partId={selected.part_id}
              authToken={token || getAuthToken()}
            />
          )}
        </MobilePartModal>
      ) : (
        <div className="part-detail-panel">
          {!selected ? (
            <p>Select a part to see details.</p>
          ) : (
            <>
              <div className="part-tabs">
                <button
                  className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  General
                </button>
                <button
                  className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  Details
                </button>
                <button
                  className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inventory')}
                >
                  Inventory
                </button>
              </div>

              {activeTab === 'general' && (
                isEditingGeneral ? (
                  <PartForm
                    p={selected}
                    onCancel={() => setIsEditingGeneral(false)}
                    onSave={(patch) => saveGeneral(selected.part_id, patch)}
                  />
                ) : (
              <PartDetails
                p={selected}
                onEdit={() => setIsEditingGeneral(true)}
                suppliers={suppliers}
                loadingSuppliers={loadingSuppliers}
                mode="summary"
                stockSummary={stockSummary}
                stockLoading={stockLoading}
                stockError={stockError}
              />
            )
          )}

              {activeTab === 'details' && selected && (
                isEditingDetails ? (
                  <PartForm
                    p={selected}
                    onCancel={() => setIsEditingDetails(false)}
                    onSave={(patch) => saveGeneral(selected.part_id, patch)}
                  />
                ) : (
                  <PartDetails
                    p={selected}
                    onEdit={() => setIsEditingDetails(true)}
                    suppliers={suppliers}
                    loadingSuppliers={loadingSuppliers}
                    mode="details"
                  />
                )
              )}

              {activeTab === 'inventory' && selected && (
                <PartInventory
                  partId={selected.part_id}
                  authToken={token || getAuthToken()}
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
            category: '',
            subcategory: '',
            regulatory_class: '',
            lot_tracked: '',
            serial_tracked: '',
            expiration_required: '',
            min_unit_price: '',
            max_unit_price: '',
            min_cost: '',
            max_cost: '',
          });
          setIncludeInactive(false);
          setOffset(0);
        }}
        onApply={() => { setOffset(0); setOpenFilters(false); }}
      />
      <AddPartModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token || getAuthToken()}
      />
    </div>
  );
}
