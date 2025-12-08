import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import './ProductCategories.css';
import { useAuth } from '../../../shared/contexts/AuthContext.jsx';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/product-categories`;
const PRODUCTS_API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/inventory/products`;

const getAuthToken = () => localStorage.getItem('auth_token') || '';

/* ------------------------- Add Category Modal ------------------------- */
function AddCategoryModal({ open, onClose, onCreated, authTokenStr, allCategories, defaultParentId = '', editMode = false, initialData = null }) {
  const [form, setForm] = useState({
    category_name: '',
    parent_category_id: defaultParentId || '',
    description: '',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editMode && initialData) {
      setForm({
        category_name: initialData.category_name || '',
        parent_category_id: initialData.parent_category_id || '',
        description: initialData.description || '',
        is_active: Boolean(initialData.is_active),
      });
    } else {
      setForm({
        category_name: '',
        parent_category_id: defaultParentId || '',
        description: '',
        is_active: true,
      });
    }
    setErr('');
  }, [open, defaultParentId, editMode, initialData]);

  if (!open) return null;

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.category_name) {
      setErr('Category name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const url = editMode ? `${API_BASE}/${initialData.category_id}` : `${API_BASE}`;
      const method = editMode ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokenStr}`
        },
        body: JSON.stringify({
          ...form,
          is_active: form.is_active ? 1 : 0,
          parent_category_id: form.parent_category_id || null,
        }),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          message = data?.error || data?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const result = await res.json();
      onCreated(result);
      onClose();
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editMode ? 'Edit Product Category' : 'Add Product Category'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}
        <form onSubmit={submit} className="modal-body">
          <label>Category Name *
            <input name="category_name" value={form.category_name} onChange={change} required />
          </label>

          <label>Parent Category
            <select name="parent_category_id" value={form.parent_category_id} onChange={change}>
              <option value="">None (Top Level)</option>
              {allCategories.map(cat => (
                <option key={cat.category_id} value={cat.category_id}>
                  {cat.parent_category_name ? `${cat.parent_category_name} > ` : ''}{cat.category_name}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2">Description
            <textarea name="description" rows={3} value={form.description} onChange={change} />
          </label>

          <label className="checkbox col-span-2">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={change} />
            Active
          </label>

          <div className="modal-actions col-span-2">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : (editMode ? 'Update Category' : 'Create Category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------- Product Picker Modal ------------------------- */
function ProductPickerModal({
  open,
  onClose,
  category,
  existingProductIds,
  onLinked,
  authTokenStr,
}) {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [linking, setLinking] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearchInput('');
    setSearchTerm('');
    setResults([]);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput, open]);

  useEffect(() => {
    if (!open || !searchTerm) {
      if (abortRef.current) abortRef.current.abort();
      setLoading(false);
      setError('');
      setResults([]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const fetchResults = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('q', searchTerm);
        params.set('limit', '20');
        const res = await fetch(`${PRODUCTS_API_BASE}/search?${params.toString()}`, {
          signal: ctrl.signal,
          headers: {
            'Authorization': `Bearer ${authTokenStr}`,
            'Content-Type': 'application/json',
          }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        setResults(rows);
      } catch (e) {
        if (e.name !== 'AbortError') setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
    return () => ctrl.abort();
  }, [searchTerm, open, authTokenStr]);

  if (!open) return null;

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!category) return;
    const toLink = Array.from(selected).filter(id => !existingProductIds.has(id));
    if (toLink.length === 0) {
      onClose();
      return;
    }
    setLinking(true);
    try {
      await Promise.all(toLink.map(async (product_id) => {
        const res = await fetch(`${API_BASE}/${category.category_id}/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authTokenStr}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ product_id })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }));
      onLinked();
      onClose();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal large" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add products to "{category?.category_name || ''}"</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">Error: {error}</div>}
          <div className="search-bar pill" style={{ marginBottom: '0.5rem' }}>
            <Search className="search-icon" size={16} />
            <input
              type="text"
              placeholder="Search products..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="product-search-results wide">
            {loading && <div className="loading-row">Searching…</div>}
            {!loading && searchTerm && results.length === 0 && (
              <div className="empty-tree">No matching products found.</div>
            )}
            {!loading && results.map((prod) => (
              <label className="product-search-item selectable" key={prod.product_id}>
                <input
                  type="checkbox"
                  checked={selected.has(prod.product_id) || existingProductIds.has(prod.product_id)}
                  disabled={existingProductIds.has(prod.product_id)}
                  onChange={() => toggle(prod.product_id)}
                />
                <div className="product-row-main">
                  <div className="product-title">
                    {prod.product_name}
                    {existingProductIds.has(prod.product_id) && <span className="tree-pill muted">Already added</span>}
                  </div>
                  <div className="product-meta">
                    {prod.public_sku || prod.sku || 'No SKU'}
                    {prod.description && <span> • {prod.description}</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={linking || selected.size === 0}>
              {linking ? 'Linking…' : `Add ${selected.size || ''} product${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Main Page ------------------------------ */
export default function ProductCategories() {
  const { token } = useAuth();

  const [categories, setCategories] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [categoryProductsMap, setCategoryProductsMap] = useState({});
  const [unlinkingProductId, setUnlinkingProductId] = useState(null);

  const [productModal, setProductModal] = useState({ open: false, category: null });

  const [q, setQ] = useState('');
  const [typing, setTyping] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [addParentId, setAddParentId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const abortRef = useRef(null);

  const categoryTree = useMemo(() => {
    const nodes = categories.map(c => ({ ...c, children: [] }));
    const byId = new Map(nodes.map(n => [n.category_id, n]));
    const roots = [];

    nodes.forEach(node => {
      if (node.parent_category_id && byId.has(node.parent_category_id)) {
        byId.get(node.parent_category_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (list) => {
      list.sort((a, b) => a.category_name.localeCompare(b.category_name));
      list.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);
    return roots;
  }, [categories]);

  useEffect(() => {
    const t = setTimeout(() => setQ(typing.trim()), 300);
    return () => clearTimeout(t);
  }, [typing]);

  // fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setErr('');

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const params = new URLSearchParams();
      if (includeInactive) params.set('includeInactive', 'true');
      if (q) params.set('q', q);

      const url = q
        ? `${API_BASE}/search?${params.toString()}`
        : `${API_BASE}?${params.toString()}`;

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
        const rows = await res.json();
        setCategories(rows);
        // auto-expand top-level on first load
        if (!expandedIds.size) {
          const tops = rows.filter(r => !r.parent_category_id).map(r => r.category_id);
          setExpandedIds(new Set(tops));
          tops.forEach(id => ensureCategoryProducts(id));
        }
      } catch (e) {
        if (e.name !== 'AbortError') setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, includeInactive, token]);

  const ensureCategoryProducts = useCallback(async (categoryId) => {
    if (!categoryId) return;
    setCategoryProductsMap(prev => {
      const current = prev[categoryId];
      if (current?.loading || current?.loaded) return prev;
      return {
        ...prev,
        [categoryId]: { ...(current || {}), loading: true, error: '' }
      };
    });

    try {
      const authToken = token || getAuthToken();
      const res = await fetch(`${API_BASE}/${categoryId}/products`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      setCategoryProductsMap(prev => ({
        ...prev,
        [categoryId]: { items: rows, loading: false, error: '', loaded: true }
      }));
    } catch (e) {
      setCategoryProductsMap(prev => ({
        ...prev,
        [categoryId]: { items: [], loading: false, error: String(e.message || e), loaded: false }
      }));
    }
  }, [token]);

  const refreshCategoryProducts = async (categoryId) => {
    setCategoryProductsMap(prev => ({
      ...prev,
      [categoryId]: { ...(prev[categoryId] || {}), loaded: false }
    }));
    await ensureCategoryProducts(categoryId);
  };

  const toggleNode = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        ensureCategoryProducts(id);
      }
      return next;
    });
  };

  const handleDelete = async (category_id) => {
    if (!confirm('Delete this category? This will fail if it has subcategories.')) return;
    try {
      const res = await fetch(`${API_BASE}/${category_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token || getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setCategories(prev => prev.filter(c => c.category_id !== category_id));
      setCategoryProductsMap(prev => {
        const next = { ...prev };
        delete next[category_id];
        return next;
      });
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  };

  const handleCreated = (created) => {
    setCategories(prev => [created, ...prev]);
    if (created.parent_category_id) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(created.parent_category_id);
        return next;
      });
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setOpenEdit(true);
  };

  const handleUpdated = (updated) => {
    setCategories(prev => prev.map(c => c.category_id === updated.category_id ? updated : c));
    setOpenEdit(false);
    setEditingCategory(null);
  };

  const handleUnlinkProduct = async (categoryId, product_id) => {
    if (!categoryId || !product_id) return;
    setUnlinkingProductId(product_id);
    try {
      const res = await fetch(`${API_BASE}/${categoryId}/products/${product_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token || getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setCategoryProductsMap(prev => ({
        ...prev,
        [categoryId]: {
          ...(prev[categoryId] || {}),
          items: (prev[categoryId]?.items || []).filter(p => p.product_id !== product_id),
          loaded: true,
          loading: false,
          error: ''
        }
      }));
    } catch (e) {
      alert(`Error unlinking product: ${e.message}`);
    } finally {
      setUnlinkingProductId(null);
    }
  };

  const openProductModal = (category) => {
    ensureCategoryProducts(category.category_id);
    setProductModal({ open: true, category });
  };

  const linkedProductIdsFor = (categoryId) => new Set((categoryProductsMap[categoryId]?.items || []).map(p => p.product_id));

  const renderTree = (nodes, depth = 0) => nodes.map(node => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.category_id);
    const productsState = categoryProductsMap[node.category_id] || { items: [], loading: false, error: '' };
    const productItems = productsState.items || [];
    const productCount = productItems.length;

    return (
      <div key={node.category_id} className="tree-node">
        <div
          className="tree-row"
          style={{ '--depth': depth }}
          onClick={() => toggleNode(node.category_id)}
        >
          <div className="tree-main">
            <button
              type="button"
              className={`tree-toggle ${hasChildren ? '' : 'leaf'}`}
              aria-label={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : 'Leaf'}
            >
              {hasChildren ? (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="tree-dot" />}
            </button>
            <Folder size={16} className="tree-folder" aria-hidden="true" />
            <div className="tree-text">
              <div className="tree-title">
                {node.category_name}
                {!node.is_active && <span className="tree-pill muted">Inactive</span>}
              </div>
              <div className="tree-meta">
                {hasChildren && `${node.children.length} subcategory${node.children.length === 1 ? '' : 'ies'}`}
                {hasChildren && productCount > 0 && ' - '}
                {productCount > 0 && `${productCount} product${productCount === 1 ? '' : 's'}`}
                {!hasChildren && productCount === 0 && 'Empty category'}
                {productsState.loading && ' - loading...'}
              </div>
            </div>
          </div>
          <div className="tree-actions" onClick={(e) => e.stopPropagation()}>
            <button className="link-btn positive" onClick={() => { setAddParentId(node.category_id); setOpenAdd(true); }}>+ Subcategory</button>
            <button className="link-btn" onClick={() => handleEdit(node)}>Edit</button>
            <button className="link-btn danger" onClick={() => handleDelete(node.category_id)}>Delete</button>
          </div>
        </div>

        {isExpanded && (
          <div className="tree-children">
            {hasChildren && renderTree(node.children, depth + 1)}
            {!hasChildren && (
              <div className="product-list-inline">
                <div className="product-inline-header">
                  <span className="eyebrow product-eyebrow">PRODUCTS</span>
                </div>
              {productsState.error && (
                <div className="error-banner subtle">Products: {productsState.error}</div>
              )}
              {productsState.loading && <div className="loading-row">Loading products...</div>}
              {!productsState.loading && productItems.length === 0 && (
                <div className="empty-tree">No products linked yet.</div>
              )}
              {!productsState.loading && productItems.map((p) => (
                <div className="product-row inline" key={p.product_id}>
                  <div className="product-row-main">
                    <div className="product-title">{p.product_name}</div>
                    <div className="product-meta">
                      {p.public_sku || p.sku || 'No SKU'}
                      {p.description && <span> - {p.description}</span>}
                    </div>
                  </div>
                  <button
                    className="link-btn danger"
                    onClick={() => handleUnlinkProduct(node.category_id, p.product_id)}
                    disabled={unlinkingProductId === p.product_id}
                  >
                    {unlinkingProductId === p.product_id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
              <button className="add-product-inline" onClick={() => openProductModal(node)}>
                <Plus size={14} /> Add Product
              </button>
            </div>
            )}
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="categories-layout single-column">
      <section className="category-card">
        <div className="card-header">
          <h1>Product Categories</h1>
          <div className="list-panel-actions">
            <button className="add-category-btn primary" onClick={() => { setAddParentId(''); setOpenAdd(true); }}>
              <Plus size={16}/> New Category
            </button>
          </div>
        </div>

        <div className="list-controls compact-controls">
          <div className="search-bar">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              placeholder="Search categories..."
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
            />
          </div>
          <button
            className="filters-btn"
            onClick={() => setShowFilters(!showFilters)}
            style={{ position: 'relative' }}
          >
            Filters {includeInactive && <span className="filter-badge">1</span>}
          </button>
        </div>

        {showFilters && (
          <div className="filters-panel">
            <label className="checkbox inline">
              <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
              Include inactive
            </label>
          </div>
        )}

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="category-list category-tree list-body">
          {categoryTree.length > 0 ? renderTree(categoryTree) : !loading && (
            <div className="empty-tree">No categories found.</div>
          )}
          {loading && <div className="loading-row">Loading...</div>}
        </div>

      </section>

      {/* Modals */}
      <AddCategoryModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token || getAuthToken()}
        allCategories={categories}
        defaultParentId={addParentId}
      />
      <AddCategoryModal
        open={openEdit}
        onClose={() => { setOpenEdit(false); setEditingCategory(null); }}
        onCreated={handleUpdated}
        authTokenStr={token || getAuthToken()}
        allCategories={categories.filter(c => c.category_id !== editingCategory?.category_id)}
        defaultParentId={editingCategory?.parent_category_id || ''}
        editMode={true}
        initialData={editingCategory}
      />
      <ProductPickerModal
        open={productModal.open}
        category={productModal.category}
        onClose={() => setProductModal({ open: false, category: null })}
        existingProductIds={productModal.category ? linkedProductIdsFor(productModal.category.category_id) : new Set()}
        onLinked={() => productModal.category && refreshCategoryProducts(productModal.category.category_id)}
        authTokenStr={token || getAuthToken()}
      />
    </div>
  );
}
