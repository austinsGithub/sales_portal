import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '../../../shared/contexts/AuthContext.jsx';
import useIsMobile from '../../../hooks/useIsMobile.js';
import './ContainersBlueprint.css';

/* --------------------------- Constants --------------------------- */
const PAGE_SIZE = 10;
const API_BASE = import.meta.env.VITE_API_BASE_URL + '/api/inventory/container_blueprints';

/* --------------------------- Helper --------------------------- */
const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) console.warn('No auth token found in localStorage');
  return token || '';
};

/* ------------------------- Add Blueprint Modal ------------------------- */
function AddBlueprintModal({ open, onClose, onCreated, authTokenStr }) {
  if (!open) return null;
  const { user } = useAuth();

  const [form, setForm] = useState({
    blueprint_name: '',
    serial_number_prefix: '',
    blueprint_description: '',
    is_active: true,
  });

  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');

    if (!form.blueprint_name?.trim()) {
      setErr('Blueprint name is required.');
      return;
    }

    if (!user?.company_id) {
      setErr('User company information is not available. Please log in again.');
      return;
    }

    try {
      // Ensure all required fields are present and properly formatted
      const payload = {
        blueprint_name: form.blueprint_name.trim(),
        serial_number_prefix: form.serial_number_prefix?.trim() || null,
        blueprint_description: form.blueprint_description?.trim() || null,
        is_active: form.is_active ? 1 : 0
      };

      console.log('Submitting payload:', payload); // Debug log

      setSubmitting(true);
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authTokenStr}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }
      
      const created = await res.json();
      onCreated(created);
      onClose();
    } catch (e2) {
      setErr(e2.message || 'An error occurred while saving the blueprint');
      console.error('Error in AddBlueprintModal:', e2);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop blueprint-modal__backdrop" onClick={onClose}>
      <div className="modal blueprint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Container Blueprint</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <form onSubmit={submit} className="modal-body grid-2">
          <label>Blueprint Name *
            <input name="blueprint_name" value={form.blueprint_name} onChange={change} required />
          </label>
          <label>Serial Number Prefix
            <input 
              name="serial_number_prefix" 
              value={form.serial_number_prefix} 
              onChange={change}
              placeholder="Enter prefix"
            />
          </label>
          <label className="col-span-2">Description
            <textarea name="blueprint_description" rows={3} value={form.blueprint_description} onChange={change} />
          </label>
          <label className="checkbox">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={change} />
            Active
          </label>

          <div className="modal-actions col-span-2">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Blueprint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------ Main Component ------------------------------ */
export default function ContainerBlueprints() {
  const { token, user } = useAuth();
  const [blueprints, setBlueprints] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [isEditing, setIsEditing] = useState(false);
  const [q, setQ] = useState('');
  const [typing, setTyping] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [totalCount, setTotalCount] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);
  const abortRef = useRef(null);
  const isMobile = useIsMobile(768);

  const selected = useMemo(
    () => blueprints.find(b => b.blueprint_id === selectedId) || null,
    [blueprints, selectedId]
  );

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typing.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [typing]);

  // fetch page
  useEffect(() => {
    const fetchBlueprints = async () => {
      if (!user?.company_id) return; // Don't fetch if no company ID
      
      setLoading(true);
      setErr('');

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (q) params.set('q', q);
      // Add company_id filter
      params.set('company_id', user.company_id);

      const url = `${API_BASE}/search?${params.toString()}`;

      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token || getAuthToken()}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const headerTotal = res.headers.get('X-Total-Count') || res.headers.get('x-total-count');
        const parsedTotal = headerTotal != null ? Number(headerTotal) : null;
        setTotalCount(Number.isFinite(parsedTotal) ? parsedTotal : null);
        const data = await res.json();
        setBlueprints(data);
        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        if (e.name !== 'AbortError') setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    };

    fetchBlueprints();
    return () => abortRef.current?.abort();
  }, [offset, q, token, user?.company_id]);

  const handleCreated = (created) => {
    setBlueprints(prev => [created, ...prev]);
    setSelectedId(created.blueprint_id);
    setActiveTab('general');
    setIsEditing(false);
  };

  const saveGeneral = async (blueprint_id, patch) => {
    try {
      const res = await fetch(`${API_BASE}/${blueprint_id}`, {
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
      const existingBlueprint = blueprints.find(b => b.blueprint_id === blueprint_id);
      const mergedBlueprint = { ...existingBlueprint, ...updated };
      
      setBlueprints(prev => prev.map(b => b.blueprint_id === blueprint_id ? mergedBlueprint : b));
      setIsEditing(false);
      return mergedBlueprint;
    } catch (error) {
      console.error('Error in saveGeneral:', error);
      throw error;
    }
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : null;

  /* ---------------------------- Subcomponents ---------------------------- */
  const BlueprintDetails = ({ blueprint, onEdit }) => (
    <div className="blueprint-detail-card">
      <div className="detail-header">
        <h2>{blueprint.blueprint_name || 'Unnamed Blueprint'}</h2>
        <button onClick={onEdit} className="edit-btn">Edit</button>
      </div>
      
      {blueprint.blueprint_description && <p className="description">{blueprint.blueprint_description}</p>}
      
      <div className="detail-grid">
        <div className="detail-item">
          <label>Blueprint ID</label>
          <p>{blueprint.blueprint_id || 'N/A'}</p>
        </div>
        <div className="detail-item">
          <label>Serial Number Prefix
</label>
          <p>{blueprint.serial_number_prefix || 'N/A'}</p>
        </div>
        <div className="detail-item">
          <label>Status</label>
          <p>{blueprint.is_active ? 'Active' : 'Inactive'}</p>
        </div>
        <div className="detail-item col-span-2">
          <label>Description</label>
          <p>{blueprint.blueprint_description || '—'}</p>
        </div>
      </div>
    </div>
  );

  const BlueprintForm = ({ blueprint, onCancel, onSave }) => {
    const [form, setForm] = useState({
      blueprint_name: blueprint.blueprint_name || '',
      serial_number_prefix: blueprint.serial_number_prefix || '',
      blueprint_description: blueprint.blueprint_description || '',
      is_active: Boolean(blueprint.is_active !== undefined ? blueprint.is_active : true),
    });

    const change = (e) => {
      const { name, value, type, checked } = e.target;
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    return (
      <div className="blueprint-detail-card">
        <h2>Edit Blueprint</h2>

        <div className="blueprint-form-grid">
          <div className="blueprint-form-field">
            <label>Blueprint Name</label>
            <input name="blueprint_name" value={form.blueprint_name} onChange={change} />
          </div>
          <div className="blueprint-form-field">
            <label>Serial Number Prefix</label>
            <input 
              name="serial_number_prefix" 
              value={form.serial_number_prefix} 
              onChange={change}
              placeholder="Enter prefix"
            />
          </div>
          <div className="blueprint-form-field col-span-2">
            <label>Description</label>
            <textarea name="blueprint_description" rows={4} value={form.blueprint_description} onChange={change} />
          </div>
        </div>

        <label className="blueprint-checkbox">
          <input id="is_active" name="is_active" type="checkbox"
                 checked={form.is_active} onChange={change} />
          <span>Active</span>
        </label>

        <div className="blueprint-form-actions">
          <button className="blueprint-btn ghost" onClick={onCancel}>Cancel</button>
          <button 
            className="blueprint-btn primary"
            onClick={() => {
              const updateData = {
                blueprint_name: form.blueprint_name,
               serial_number_prefix: form.serial_number_prefix || null,
                blueprint_description: form.blueprint_description || null,
                is_active: form.is_active ? 1 : 0,
              };
              onSave(updateData);
            }}
          >
            Update Blueprint
          </button>
        </div>
      </div>
    );
  };

  const BlueprintItems = ({ blueprintId }) => {
    const [items, setItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [newItem, setNewItem] = useState({
      product_id: '',
      minimum_quantity: 0,  // Set default minimum quantity to 0
      maximum_quantity: 1,
      default_quantity: 1,
      usage_notes: ''
    });

    // Ensure max quantity is never less than min quantity
    const updateQuantity = (field, value) => {
      const numValue = Math.max(0, parseInt(value) || 0);
      setNewItem(prev => {
        const updated = { ...prev, [field]: numValue };
        
        // Ensure max is never less than min
        if (field === 'minimum_quantity') {
          if (updated.maximum_quantity < numValue) {
            updated.maximum_quantity = numValue;
          }
          // Adjust default if needed
          if (updated.default_quantity < numValue) {
            updated.default_quantity = numValue;
          }
        } else if (field === 'maximum_quantity') {
          if (updated.minimum_quantity > numValue) {
            updated.minimum_quantity = numValue;
          }
          // Adjust default if needed
          if (updated.default_quantity > numValue) {
            updated.default_quantity = numValue;
          }
        }
        
        return updated;
      });
    };

    useEffect(() => {
      const fetchItems = async () => {
        setLoading(true);
        try {
          const res = await fetch(`${API_BASE}/${blueprintId}/items`, {
            headers: { Authorization: `Bearer ${token || getAuthToken()}` }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setItems(data);
        } catch (e) {
          console.error('Error fetching blueprint items:', e);
        } finally {
          setLoading(false);
        }
      };

      const fetchProducts = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/inventory/products`, {
            headers: { Authorization: `Bearer ${token || getAuthToken()}` }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setProducts(data);
        } catch (e) {
          console.error('Error fetching products:', e);
        }
      };

      fetchItems();
      fetchProducts();
    }, [blueprintId, token]);

    const addItem = async () => {
      if (!newItem.product_id) {
        alert('Please select a product');
        return;
      }
      
      // Validate quantities
      if (newItem.minimum_quantity > newItem.maximum_quantity) {
        alert('Minimum quantity cannot be greater than maximum quantity');
        return;
      }
      
      if (newItem.default_quantity < newItem.minimum_quantity || 
          newItem.default_quantity > newItem.maximum_quantity) {
        alert('Default quantity must be between minimum and maximum quantities');
        return;
      }
      
      try {
        const res = await fetch(`${API_BASE}/${blueprintId}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || getAuthToken()}`
          },
          body: JSON.stringify({
            product_id: Number(newItem.product_id),
            minimum_quantity: Number(newItem.minimum_quantity),
            maximum_quantity: Number(newItem.maximum_quantity),
            default_quantity: Number(newItem.default_quantity),
            usage_notes: newItem.usage_notes || ''
          })
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${res.status}`);
        }
        
        const created = await res.json();
        setItems(prev => [...prev, created]);
        setAdding(false);
        setNewItem({ 
          product_id: '', 
          minimum_quantity: 1, 
          maximum_quantity: 1, 
          default_quantity: 1,
          usage_notes: '' 
        });
      } catch (e) {
        console.error('Error adding item:', e);
        alert('Failed to add item: ' + e.message);
      }
    };

    const removeItem = async (itemId) => {
      if (!window.confirm('Are you sure you want to remove this item from the blueprint? This action cannot be undone.')) {
        return;
      }
      
      try {
        const res = await fetch(`${API_BASE}/${blueprintId}/items/${itemId}`, {
          method: 'DELETE',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || getAuthToken()}` 
          }
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.message || `Failed to remove item (HTTP ${res.status})`);
        }
        
        if (data.success) {
          // Show success message
          setItems(prev => prev.filter(i => i.blueprint_item_id !== itemId));
          // You could add a toast notification here for better UX
          console.log('Item removed successfully');
        } else {
          throw new Error(data.message || 'Failed to remove item');
        }
      } catch (e) {
        console.error('Error removing item:', e);
        alert(`Error: ${e.message}

This item might be in use by existing containers. Please check and try again.`);
      }
    };

    if (loading) return <div>Loading items...</div>;

    return (
      <section className="part-detail-content">
        <div className="detail-header">
          <h2>Blueprint Items</h2>
          <button className="edit-btn" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add Product
          </button>
        </div>

        {adding && (
          <div className="blueprint-add-item-card">
            <h3>Add Product to Blueprint</h3>
            <div className="blueprint-form-grid">
              <div className="blueprint-form-field">
                <label>Product</label>
                <select 
                  value={newItem.product_id} 
                  onChange={(e) => setNewItem(prev => ({ ...prev, product_id: e.target.value }))}
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="blueprint-form-field">
                <label>Minimum Quantity (0-{newItem.maximum_quantity})</label>
                <input 
                  type="number" 
                  min="0"
                  max={newItem.maximum_quantity}
                  value={newItem.minimum_quantity}
                  onChange={(e) => updateQuantity('minimum_quantity', e.target.value)}
                  placeholder="Minimum required"
                  className={newItem.minimum_quantity > newItem.maximum_quantity ? 'error' : ''}
                />
              </div>
              <div className="blueprint-form-field">
                <label>Maximum Quantity ({newItem.minimum_quantity}+)</label>
                <input 
                  type="number" 
                  min={Math.max(1, newItem.minimum_quantity)}
                  value={newItem.maximum_quantity}
                  onChange={(e) => updateQuantity('maximum_quantity', e.target.value)}
                  placeholder="Maximum allowed"
                  className={newItem.maximum_quantity < newItem.minimum_quantity ? 'error' : ''}
                />
              </div>
              <div className="blueprint-form-field">
                <label>Default Quantity ({newItem.minimum_quantity}-{newItem.maximum_quantity})</label>
                <input 
                  type="number" 
                  min={newItem.minimum_quantity}
                  max={newItem.maximum_quantity}
                  value={newItem.default_quantity}
                  onChange={(e) => setNewItem(prev => ({ ...prev, default_quantity: parseInt(e.target.value) || 0 }))}
                  placeholder="Default quantity"
                />
              </div>
              <div className="blueprint-form-field col-span-2">
                <label>Usage Notes</label>
                <textarea 
                  rows={2}
                  value={newItem.usage_notes}
                  onChange={(e) => setNewItem(prev => ({ ...prev, usage_notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="blueprint-form-actions">
              <button className="blueprint-btn ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="blueprint-btn primary" onClick={addItem}>Add Item</button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="blueprint-empty-state">
            <p>No products assigned to this blueprint yet.</p>
            <button 
              className="blueprint-btn primary"
              onClick={() => setAdding(true)}
            >
              <Plus size={16} /> Add First Item
            </button>
          </div>
        ) : (
          <div className="blueprint-table-card">
            <table className="blueprint-items-table">
              <thead>
                <tr>
                  <th className="product-col">Product</th>
                  <th className="qty-col">Min</th>
                  <th className="qty-col">Max</th>
                  <th className="qty-col">Default</th>
                  <th className="notes-col">Usage Notes</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const product = products.find(p => p.product_id === item.product_id);
                  return (
                    <tr key={item.blueprint_item_id} className="item-row">
                      <td className="product-cell">
                        <div className="product-info">
                          <div className="product-name">
                            {product?.product_name || `Product #${item.product_id}`}
                          </div>
                          {product?.sku && (
                            <div className="product-sku">SKU: {product.sku}</div>
                          )}
                        </div>
                      </td>
                      <td className="qty-cell">{item.minimum_quantity}</td>
                      <td className="qty-cell">{item.maximum_quantity}</td>
                      <td className="qty-cell default-qty">
                        <span className="qty-badge">{item.default_quantity}</span>
                      </td>
                      <td className="notes-cell">
                        {item.usage_notes || '-'}
                      </td>
                      <td className="actions-cell">
                        <button 
                          onClick={() => removeItem(item.blueprint_item_id)}
                          className="remove-btn"
                          title="Remove item"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  /* ---------------------------- Main UI ---------------------------- */
  return (
    <div className="blueprints-layout">
      <section className="blueprint-list-panel list-panel">
        <div className="list-panel-header">
          <h1>Container Blueprints</h1>
          <div className="list-controls">
            <div className="search-bar">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                placeholder="Search blueprints..."
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
              />
            </div>
          </div>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="blueprint-list list-body">
          {blueprints.map(b => (
            <div
              key={b.blueprint_id}
              className={`list-item blueprint-list-item ${selectedId === b.blueprint_id ? 'selected' : ''}`}
              onClick={() => { setSelectedId(b.blueprint_id); setIsEditing(false); setActiveTab('general'); }}
            >
              <h3>{b.blueprint_name}</h3>
              <p>{[b.serial_number_prefix, b.is_active ? 'Active' : 'Inactive'].filter(Boolean).join(' • ')}</p>
            </div>
          ))}
          {loading && <div className="loading-row">Loading…</div>}
        </div>

        <div className="list-panel-footer">
          <button 
            className="add-blueprint-btn"
            onClick={() => setOpenAdd(true)}
          >
            <Plus size={18} /> Add Blueprint
          </button>
          <div className="pagination">
            <button 
              className="pagination-btn"
              disabled={offset === 0 || loading} 
              onClick={() => setOffset(prev => Math.max(0, prev - PAGE_SIZE))}
            >
              Prev
            </button>
            <span className="page-indicator">
              Page {currentPage}{totalPages ? ` of ${totalPages}` : ''} • {PAGE_SIZE} per page
            </span>
            <button 
              className="pagination-btn"
              disabled={!hasMore || loading} 
              onClick={() => setOffset(prev => prev + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="blueprint-detail-panel detail-panel">
        {!selected ? (
          <div className="detail-empty-state blueprint-empty-state">
            <p>Select a blueprint to see details.</p>
          </div>
        ) : (
          <>
            <div className="blueprint-tabs">
              <button
                className={`blueprint-tab ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                General
              </button>
              <button
                className={`blueprint-tab ${activeTab === 'items' ? 'active' : ''}`}
                onClick={() => setActiveTab('items')}
              >
                Items
              </button>
            </div>

            {activeTab === 'general' && (
              isEditing ? (
                <BlueprintForm
                  blueprint={selected}
                  onCancel={() => setIsEditing(false)}
                  onSave={(patch) => saveGeneral(selected.blueprint_id, patch)}
                />
              ) : (
                <BlueprintDetails 
                  blueprint={selected} 
                  onEdit={() => setIsEditing(true)}
                />
              )
            )}

            {activeTab === 'items' && selected && (
              <BlueprintItems blueprintId={selected.blueprint_id} />
            )}
          </>
        )}
      </section>

      <AddBlueprintModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token || getAuthToken()}
      />
    </div>
  );
}
