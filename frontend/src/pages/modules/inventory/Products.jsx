import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import './Products.css';
import useIsMobile from '../../../hooks/useIsMobile.js';
import MobileProductModal from './ProductModalMobile.jsx';
import { useAuth } from '../../../shared/contexts/AuthContext.jsx';
import ListItem from '../../../components/ListItem.jsx';

const PAGE_SIZE = 10;
const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/products`;
const CATEGORY_API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/product-categories`;

// Helper function to get auth token
const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    console.warn('No auth token found in localStorage');
  }
  return token || '';
};

const createInitialProductForm = (companyId = '') => ({
  company_id: companyId || '',
  part_id: '',
  product_name: '',
  public_sku: '',
  base_price: '',
  description: '',
  product_category: '',
  is_active: true,
});

/* ------------------------- Add Product Modal ------------------------- */
function AddProductModal({ open, onClose, onCreated, authTokenStr, defaultCompanyId = '' }) {
  const [form, setForm] = useState(() => createInitialProductForm(defaultCompanyId));
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [parts, setParts] = useState([]);
  const [partsError, setPartsError] = useState('');
  const [loadingParts, setLoadingParts] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(createInitialProductForm(defaultCompanyId));
    setErr('');
    setFieldErrors({});
  }, [open, defaultCompanyId]);

  // Fetch parts for dropdown
  useEffect(() => {
    if (!open) return;

    const ctrl = new AbortController();
    const fetchParts = async () => {
      setLoadingParts(true);
      setPartsError('');
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/parts`, {
          headers: { Authorization: `Bearer ${authTokenStr}` },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Failed to fetch parts: ${res.status}`);
        const data = await res.json();
        setParts(data);
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error fetching parts', e);
        setPartsError('Failed to load parts list.');
      } finally {
        setLoadingParts(false);
      }
    };
    fetchParts();

    return () => ctrl.abort();
  }, [authTokenStr, open]);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!form.product_name.trim()) {
      nextErrors.product_name = 'Product name is required';
    }
    if (form.base_price !== '' && Number(form.base_price) < 0) {
      nextErrors.base_price = 'Base price must be zero or greater';
    }
    if (form.public_sku && form.public_sku.length > 64) {
      nextErrors.public_sku = 'Public SKU is limited to 64 characters';
    }

    return nextErrors;
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');

    const nextErrors = validateForm();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {
      ...form,
      part_id: form.part_id ? Number(form.part_id) : null,
      base_price: form.base_price === '' ? 0 : Number(form.base_price),
      is_active: form.is_active ? 1 : 0,
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
      onCreated(created);
      onClose();
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-product-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="add-product-title">Add Product</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <form onSubmit={submit} className="modal-body grid-2">
          <label>Product Name *
            <input
              name="product_name"
              value={form.product_name}
              onChange={change}
              aria-invalid={Boolean(fieldErrors.product_name)}
            />
            {fieldErrors.product_name && <span className="field-error">{fieldErrors.product_name}</span>}
          </label>
          <label>Public SKU
            <input
              name="public_sku"
              value={form.public_sku}
              onChange={change}
              aria-invalid={Boolean(fieldErrors.public_sku)}
            />
            {fieldErrors.public_sku && <span className="field-error">{fieldErrors.public_sku}</span>}
          </label>
          
          <label className="col-span-2">
            Associated Part
            <select
              name="part_id"
              value={form.part_id || ""}
              onChange={change}
              className="w-full p-2 border rounded"
              disabled={loadingParts}
            >
              <option value="">{loadingParts ? 'Loading parts…' : 'Select part (optional)'}</option>
              {parts.map((p) => (
                <option key={p.part_id} value={p.part_id}>
                  {p.product_name} - {p.sku || 'No SKU'}
                </option>
              ))}
            </select>
            {partsError && <span className="field-error">{partsError}</span>}
          </label>

          <label>Base Price
            <input 
              type="number" 
              step="0.01" 
              name="base_price"
              min={0} 
              value={form.base_price === '' ? '' : form.base_price} 
              onChange={change}
              aria-invalid={Boolean(fieldErrors.base_price)}
            />
            {fieldErrors.base_price && <span className="field-error">{fieldErrors.base_price}</span>}
          </label>
          <label>Product Category
            <input name="product_category" value={form.product_category} onChange={change} />
          </label>

          <label className="col-span-2">Description
            <textarea name="description" rows={3} value={form.description} onChange={change} />
          </label>

          <label className="checkbox col-span-2">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={change} />
            Active
          </label>

          <div className="modal-actions col-span-2">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Product'}
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

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onApply();
  };

  return (
    <div className="filter-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="filter-modal" role="dialog" aria-modal="true" aria-labelledby="product-adv-search" onClick={(e) => e.stopPropagation()}>
        <div className="filter-modal__header">
          <h3 id="product-adv-search">Advanced Search</h3>
          <button type="button" className="filter-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="filter-modal__body" onSubmit={handleSubmit}>
          <div className="filter-modal__grid">
            <label className="filter-field">Product Category
              <input value={filters.product_category} onChange={handleChange('product_category')} />
            </label>
            <label className="filter-field">Min Price
              <input type="number" step="0.01" min="0" value={filters.min_base_price} onChange={handleChange('min_base_price')} />
            </label>
            <label className="filter-field">Max Price
              <input type="number" step="0.01" min="0" value={filters.max_base_price} onChange={handleChange('max_base_price')} />
            </label>
          </div>
          <label className="filter-checkbox">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show deactivated products
          </label>
          <div className="filter-modal__actions">
            <button type="button" className="filter-btn ghost" onClick={onClear}>Clear</button>
            <button type="submit" className="filter-btn primary">Apply</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------ Main Page ------------------------------ */
export default function Products() {
  const { user, token, isLoading: authLoading } = useAuth();
  
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const isMobile = useIsMobile(768);

  const [q, setQ] = useState('');
  const [typing, setTyping] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [totalCount, setTotalCount] = useState(null);
  const [parts, setParts] = useState([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [filters, setFilters] = useState({
    product_category: '',
    min_base_price: '',
    max_base_price: '',
  });
  const [productCategoriesMap, setProductCategoriesMap] = useState({});

  const abortRef = useRef(null);

  const selected = useMemo(
    () => products.find(p => p.product_id === selectedId) || null,
    [products, selectedId]
  );

  const ensureProductCategories = useCallback(async (productId) => {
    if (!productId) return;
    setProductCategoriesMap((prev) => {
      const current = prev[productId];
      if (current?.loading || current?.loaded) return prev;
      return { ...prev, [productId]: { items: [], loading: true, error: '' } };
    });

    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${CATEGORY_API_BASE}/by-product/${productId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      setProductCategoriesMap((prev) => ({
        ...prev,
        [productId]: { items: rows, loading: false, loaded: true, error: '' }
      }));
    } catch (e) {
      console.error('Failed to load categories for product', productId, e);
      setProductCategoriesMap((prev) => ({
        ...prev,
        [productId]: { items: [], loading: false, loaded: false, error: String(e.message || e) }
      }));
    }
  }, [token]);

  useEffect(() => {
    if (selectedId) {
      ensureProductCategories(selectedId);
    }
  }, [selectedId, ensureProductCategories]);

  // Fetch parts list for displaying part information
  useEffect(() => {
    const fetchParts = async () => {
      setLoadingParts(true);
      try {
        const authToken = token || getAuthToken();
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/parts`, {
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
        });
        if (!res.ok) throw new Error(`Failed to fetch parts: ${res.status}`);
        const data = await res.json();
        setParts(data);
      } catch (e) {
        console.error('Error fetching parts', e);
      } finally {
        setLoadingParts(false);
      }
    };
    
    if (token || getAuthToken()) {
      fetchParts();
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

      // advanced filters
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) params.set(k, String(v));
      });

      const url = `${API_BASE}/search-advanced?${params.toString()}`;

      try {
        const authToken = token || getAuthToken();
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
        setProducts(rows);
        setHasMore(rows.length === PAGE_SIZE);
        rows.forEach((row) => ensureProductCategories(row.product_id));

        let selectionCleared = false;
        setSelectedId(prev => {
          if (prev == null) return prev;
          const stillExists = rows.some(row => row.product_id === prev);
          if (stillExists) return prev;
          selectionCleared = true;
          return null;
        });
        if (selectionCleared) {
          setIsEditing(false);
        }
      } catch (e) {
        if (e.name !== 'AbortError') setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
    
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [offset, q, includeInactive, filters, token, ensureProductCategories]);

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

  const replaceProductInList = (product_id, updatedRow) => {
    setProducts(prev => prev.map(p => (p.product_id === product_id ? updatedRow : p)));
  };

  // PATCH product
  const saveProduct = async (product_id, patch) => {
    try {
      const res = await fetch(`${API_BASE}/${product_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || getAuthToken()}`
        },
        body: JSON.stringify(patch),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`Update failed: ${res.status} - ${errorData.message || 'Unknown error'}`);
      }
      
      const updated = await res.json();
      const existingProduct = products.find(p => p.product_id === product_id);
      const mergedProduct = {
        ...existingProduct,
        ...updated,
        part_id: 'part_id' in patch ? 
          (patch.part_id ? Number(patch.part_id) : null) : 
          (existingProduct?.part_id || null)
      };
      
      replaceProductInList(product_id, mergedProduct);
      setIsEditing(false);
      return mergedProduct;
    } catch (error) {
      console.error('Error in saveProduct:', error);
      throw error;
    }
  };

  const handleCreated = (created) => {
    setProducts(prev => [created, ...prev]);
    setSelectedId(created.product_id);
    setIsEditing(false);
  };

  /* ---------------------------- Subcomponents ---------------------------- */
  const ProductDetails = ({ p, onEdit, parts = [], loadingParts, categoriesState }) => {
    const associatedPart = p.part_id ? parts.find(part => part.part_id === p.part_id) : null;
    const categoryItems = categoriesState?.items || [];
    const categoryNames = categoryItems.map((c) => c.category_name).filter(Boolean);
    
    return (
      <div className="product-detail-content">
        <div className="detail-header">
          <div className="detail-title-block">
            <h2>{p.product_name || 'Unnamed Product'}</h2>
            {p.description && <p className="description">{p.description}</p>}
          </div>
          <button onClick={onEdit} className="edit-btn">Edit</button>
        </div>
        
        <div className="detail-grid">
          <div className="detail-item">
            <label>Product ID</label>
            <p>{p.product_id || 'N/A'}</p>
          </div>
          <div className="detail-item">
            <label>Public SKU</label>
            <p>{p.public_sku || 'N/A'}</p>
          </div>
          <div className="detail-item">
            <label>Base Price</label>
            <p>${Number(p.base_price || 0).toFixed(2)}</p>
          </div>
          <div className="detail-item">
            <label>Product Category</label>
            {categoriesState?.loading && <p>Loading categories…</p>}
            {categoriesState?.error && <p className="text-gray-500">Error loading categories: {categoriesState.error}</p>}
            {!categoriesState?.loading && !categoriesState?.error && (
              <p>{categoryNames.length ? categoryNames.join(', ') : (p.product_category || 'Unassigned')}</p>
            )}
          </div>
          <div className="detail-item">
            <label>Associated Part</label>
            <div>
              {loadingParts ? (
                <span>Loading parts...</span>
              ) : associatedPart ? (
                <div>
                  <div>{associatedPart.product_name}</div>
                  <div className="text-sm text-gray-500">SKU: {associatedPart.sku || 'N/A'}</div>
                  <div className="text-sm text-gray-500">Part ID: {associatedPart.part_id}</div>
                </div>
              ) : (
                <span className="text-gray-500">No part associated</span>
              )}
            </div>
          </div>
          <div className="detail-item">
            <label>Status</label>
            <p>{p.is_active ? 'Active' : 'Inactive'}</p>
          </div>
          <div className="detail-item">
            <label>Created At</label>
            <p>{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</p>
          </div>
          <div className="detail-item">
            <label>Updated At</label>
            <p>{p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}</p>
          </div>
          <div className="detail-item col-span-2">
            <label>Description</label>
            <p>{p.description || '—'}</p>
          </div>
        </div>
      </div>
    );
  };

  const ProductForm = ({ p, onCancel, onSave, categoriesState }) => {
    const [form, setForm] = useState({
      company_id: p.company_id || '',
      part_id: p.part_id ? String(p.part_id) : '',
      product_name: p.product_name || '',
      public_sku: p.public_sku || '',
      base_price: p.base_price || 0,
      description: p.description || '',
      product_category: p.product_category || '',
      is_active: Boolean(p.is_active !== undefined ? p.is_active : true),
    });
    
    const [formParts, setFormParts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchParts = async () => {
        try {
          const authToken = token || getAuthToken();
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/parts`, {
            headers: { 
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
          });
          if (!res.ok) throw new Error(`Failed to fetch parts: ${res.status}`);
          const data = await res.json();
          setFormParts(data);
        } catch (e) {
          console.error('Error fetching parts', e);
        } finally {
          setLoading(false);
        }
      };
      fetchParts();
    }, [token]);

    const categoryNames = (categoriesState?.items || []).map((c) => c.category_name).filter(Boolean);
    const displayCategory = categoryNames.length
      ? categoryNames.join(', ')
      : (form.product_category || 'Not assigned');

    const change = (e) => {
      const { name, value, type, checked } = e.target;
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    return (
      <div className="product-detail-content">
        <h2>Edit Product</h2>

        <div className="form-grid">
          <div className="form-field">
            <label>Product Name</label>
            <input name="product_name" value={form.product_name} onChange={change} />
          </div>
          <div className="form-field">
            <label>Public SKU</label>
            <input name="public_sku" value={form.public_sku} onChange={change} />
          </div>
          <div className="form-field">
            <label>Base Price</label>
            <input type="number" step="0.01" name="base_price" value={form.base_price} onChange={change} />
          </div>
          <div className="form-field">
            <label>Product Category</label>
            <input
              name="product_category"
              value={displayCategory}
              onChange={change}
              disabled
              placeholder="Enter category"
            />
            <p className="field-hint">
              {categoryNames.length
                ? `Categories are assigned under the Product Category tab: ${categoryNames.join(', ')}.`
                : 'Not assigned. Manage categories under the Product Category tab.'}
            </p>
          </div>
          <div className="form-field col-span-2">
            <label>Associated Part</label>
            <select 
              name="part_id" 
              value={form.part_id} 
              onChange={change}
              className="w-full p-2 border rounded"
              disabled={loading}
            >
              <option value="">Select part (optional)</option>
              {formParts.map((part) => (
                <option key={part.part_id} value={part.part_id}>
                  {part.product_name} - {part.sku || 'No SKU'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field col-span-2">
            <label>Description</label>
            <textarea name="description" rows={4} value={form.description} onChange={change} />
          </div>
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
                part_id: form.part_id ? Number(form.part_id) : null,
                product_name: form.product_name,
                public_sku: form.public_sku || null,
                base_price: Number(form.base_price) || 0,
                description: form.description || null,
                is_active: form.is_active ? 1 : 0,
              };
              
              // If categories are managed via the Product Category tab (always in this form),
              // avoid overwriting the column; keep server value as-is.
              if (categoryNames.length) {
                delete updateData.product_category;
              } else {
                updateData.product_category = form.product_category || null;
              }
              
              Object.keys(updateData).forEach(key => {
                if (updateData[key] === '') {
                  updateData[key] = null;
                }
              });
              
              onSave(updateData);
            }}
          >
            Update Product
          </button>
        </div>

        <div style={{ marginTop: 12, opacity: 0.7 }}>
          <small>Created at: {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</small>
          <br />
          <small>Updated at: {p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}</small>
        </div>
      </div>
    );
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="products-layout">
      <section className="product-list-panel list-panel">
        <div className="list-panel-header product-list-header">
          <h2>Products</h2>
          <div className="list-controls">
            <div className="search-bar">
              <Search size={16} className="search-icon" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search products..."
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
              />
            </div>
            <button className="filters-btn" onClick={() => setOpenFilters(true)}>Filters</button>
            {includeInactive && <span className="filter-chip">Including deactivated</span>}
          </div>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="product-list list-body">
          {products.map(p => {
            const categories = (productCategoriesMap[p.product_id]?.items || []).map((c) => c.category_name).filter(Boolean);
            const categoryLabel = categories.length ? categories.join(', ') : (p.product_category || null);
            return (
              <ListItem
                key={p.product_id}
                title={p.product_name}
                details={[p.public_sku, categoryLabel].filter(Boolean)}
                selected={selectedId === p.product_id}
                onClick={() => { setSelectedId(p.product_id); setIsEditing(false); }}
              />
            );
          })}
          {loading && <div className="loading-row">Loading...</div>}
        </div>

        <div className="list-panel-footer">
          <button className="add-product-btn" onClick={() => setOpenAdd(true)}>
            <Plus size={18}/> Add Product
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
      </section>

      {isMobile ? (
        <MobileProductModal
          open={Boolean(selected)}
          onClose={() => { setSelectedId(null); setIsEditing(false); }}
          title={selected ? selected.product_name : 'Product'}
        >
          {selected && (
            isEditing ? (
              <ProductForm
                p={selected}
                onCancel={() => setIsEditing(false)}
                onSave={(patch) => saveProduct(selected.product_id, patch)}
                categoriesState={productCategoriesMap[selected.product_id]}
              />
            ) : (
              <ProductDetails 
                p={selected} 
                onEdit={() => setIsEditing(true)}
                parts={parts}
                loadingParts={loadingParts}
                categoriesState={productCategoriesMap[selected.product_id]}
              />
            )
          )}
        </MobileProductModal>
      ) : (
        <section className="product-detail-panel detail-panel">
          {!selected ? (
            <div className="detail-empty-state product-empty-state">
              <p>Select a product to see details.</p>
            </div>
          ) : (
            isEditing ? (
              <ProductForm
                p={selected}
                onCancel={() => setIsEditing(false)}
                onSave={(patch) => saveProduct(selected.product_id, patch)}
                categoriesState={productCategoriesMap[selected.product_id]}
              />
            ) : (
              <ProductDetails 
                p={selected} 
                onEdit={() => setIsEditing(true)}
                parts={parts}
                loadingParts={loadingParts}
                categoriesState={productCategoriesMap[selected.product_id]}
              />
            )
          )}
        </section>
      )}

      <AdvancedSearchModal
        open={openFilters}
        onClose={() => setOpenFilters(false)}
        filters={filters}
        setFilters={setFilters}
        includeInactive={includeInactive}
        setIncludeInactive={setIncludeInactive}
        onClear={() => {
          setFilters({
            product_category: '',
            min_base_price: '',
            max_base_price: '',
          });
          setIncludeInactive(false);
          setOffset(0);
        }}
        onApply={() => { setOffset(0); setOpenFilters(false); }}
      />
      <AddProductModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token || getAuthToken()}
        defaultCompanyId={user?.company_id || ''}
      />
    </div>
  );
}
