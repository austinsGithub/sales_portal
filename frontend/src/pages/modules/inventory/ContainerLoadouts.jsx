import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import './ContainerLoadouts.css';

const PAGE_SIZE = 10;

const buildApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  const cleanBase = base.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return cleanEndpoint ? `${cleanBase}/${cleanEndpoint}` : cleanBase;
};

const API_BASE = buildApiUrl('api/inventory/container_loadouts');

const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) console.warn('No auth token found in localStorage');
  return token || '';
};

const DEFAULT_ADD_FORM = {
  blueprint_id: '',
  location_id: '',
  serial_suffix: '',
  notes: '',
};

function AddLoadoutModal({ open, onClose, onCreated, authTokenStr, user }) {
  const [blueprints, setBlueprints] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(DEFAULT_ADD_FORM);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset modal state each time it opens to avoid stale data
  useEffect(() => {
    if (!open) return;
    setForm({ ...DEFAULT_ADD_FORM });
    setErr('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const abortCtrl = new AbortController();

    const fetchBlueprints = async () => {
      try {
        const url = buildApiUrl('api/inventory/container_blueprints/search');
        const res = await fetch(url, {
          signal: abortCtrl.signal,
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokenStr}` 
          }
        });
        if (!res.ok) {
          setBlueprints([]);
          return;
        }
        const data = await res.json();
        const blueprintsData = Array.isArray(data) ? data : (data.data || []);
        setBlueprints(blueprintsData);
      } catch (error) {
        console.error('Error fetching blueprints:', error);
        setBlueprints([]);
      }
    };

    const fetchLocations = async () => {
      try {
        const url = buildApiUrl('api/inventory/locations');
        const token = getAuthToken();
        const response = await fetch(url, {
          signal: abortCtrl.signal,
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const locationsData = Array.isArray(data) ? data : (data.data || []);
        setLocations(locationsData);
      } catch (error) {
        console.error('Error fetching locations:', error);
        setLocations([]);
      }
    };

    fetchBlueprints();
    fetchLocations();

    return () => abortCtrl.abort();
  }, [open, authTokenStr]);

  const change = (e) => {
    const { name, value } = e.target;
    const processedValue = (name === 'blueprint_id' || name === 'location_id')
      ? value === '' ? '' : Number(value)
      : value;
    setForm(prev => ({ ...prev, [name]: processedValue }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');

    if (!form.blueprint_id) {
      setErr('Blueprint is required.');
      return;
    }
    if (!form.location_id) {
      setErr('Location is required.');
      return;
    }
    if (!user?.company_id) {
      setErr('User company information is not available. Please log in again.');
      return;
    }

    try {
      const payload = {
        blueprint_id: Number(form.blueprint_id),
        company_id: user.company_id,
        location_id: Number(form.location_id),
        serial_suffix: form.serial_suffix?.trim() || null,
        notes: form.notes?.trim() || null,
        created_by: user.user_id
      };

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
      setErr(e2.message || 'An error occurred while creating the loadout');
      console.error('Error in AddLoadoutModal:', e2);
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
        aria-labelledby="add-loadout-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="add-loadout-title">Create Container Loadout</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <form onSubmit={submit} className="modal-body">
          <div className="grid-2">
            <label className="col-span-2">Blueprint *
              <select
                name="blueprint_id"
                value={form.blueprint_id}
                onChange={change}
                required
              >
                <option value="" disabled>Select blueprint...</option>
                {blueprints.map(b => (
                  <option key={b.blueprint_id} value={b.blueprint_id}>
                    {b.blueprint_name}
                  </option>
                ))}
              </select>
            </label>
            <label>Location *
              <select
                name="location_id"
                value={form.location_id}
                onChange={change}
                required
              >
                <option value="">Select a location</option>
                {Array.isArray(locations) && locations.map((location) => (
                  <option key={location.location_id} value={location.location_id}>
                    {location.location_name || `Location ${location.location_id}`}
                  </option>
                ))}
              </select>
            </label>
            <label>Serial Suffix
              <input
                name="serial_suffix"
                value={form.serial_suffix}
                onChange={change}
                placeholder="e.g., 001, A1"
              />
            </label>
            <label className="col-span-2">Notes
              <textarea name="notes" rows={3} value={form.notes} onChange={change} />
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Loadout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DuplicateLoadoutModal({ open, onClose, onCreated, authTokenStr, user, sourceLoadout }) {
  const [quantity, setQuantity] = useState(10);
  const [serialPrefix, setSerialPrefix] = useState('');
  const [startingSuffix, setStartingSuffix] = useState('001');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const presetQuantities = [10, 15, 50];

  // Reset modal inputs between opens so old values don't stick
  useEffect(() => {
    if (!open) return;
    setQuantity(10);
    setSerialPrefix('');
    setStartingSuffix('001');
    setErr('');
    setSubmitting(false);
    setLoading(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const abortCtrl = new AbortController();

    const fetchBlueprintPrefix = async () => {
      if (!sourceLoadout?.blueprint_id) return;
      
      setLoading(true);
      try {
        const res = await fetch(
          buildApiUrl(`api/inventory/container_blueprints/${sourceLoadout.blueprint_id}`),
          {
            signal: abortCtrl.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authTokenStr}`
            }
          }
        );
        
        if (res.ok) {
          const blueprint = await res.json();
          console.log('Blueprint data:', blueprint);
          console.log('Available fields:', Object.keys(blueprint));
          
          // Try different possible field names
          const prefix = blueprint.serial_number_prefix || 
                        blueprint.serial_prefix || 
                        blueprint.blueprint_code || 
                        blueprint.prefix ||
                        '';
          
          console.log('Using prefix:', prefix);
          setSerialPrefix(prefix);
        } else {
          console.error('Failed to fetch blueprint:', res.status);
        }
      } catch (error) {
        console.error('Error fetching blueprint:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBlueprintPrefix();

    return () => abortCtrl.abort();
  }, [open, sourceLoadout, authTokenStr]);

  const submit = async () => {
    setErr('');

    if (quantity < 1 || quantity > 100) {
      setErr('Quantity must be between 1 and 100');
      return;
    }

    if (!user?.company_id) {
      setErr('User company information is not available. Please log in again.');
      return;
    }

    try {
      setSubmitting(true);
      const createdLoadouts = [];

      // Create loadouts sequentially
      for (let i = 0; i < quantity; i++) {
        const suffixNumber = parseInt(startingSuffix) + i;
        const paddedSuffix = String(suffixNumber).padStart(startingSuffix.length, '0');
        const fullSuffix = serialPrefix ? `${serialPrefix}-${paddedSuffix}` : paddedSuffix;

        const payload = {
          blueprint_id: sourceLoadout.blueprint_id,
          company_id: user.company_id,
          location_id: sourceLoadout.location_id,
          serial_suffix: fullSuffix,
          notes: sourceLoadout.notes,
          created_by: user.user_id
        };

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
          throw new Error(`Failed to create loadout ${i + 1}: ${errorData.message || `HTTP ${res.status}`}`);
        }

        const created = await res.json();
        createdLoadouts.push(created);
      }

      onCreated(createdLoadouts);
      onClose();
    } catch (e2) {
      setErr(e2.message || 'An error occurred while duplicating loadouts');
      console.error('Error in DuplicateLoadoutModal:', e2);
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
        aria-labelledby="duplicate-loadout-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="duplicate-loadout-title">Duplicate Loadout</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {loading ? (
            <div>Loading blueprint information...</div>
          ) : (
            <>
              <div>
                <p style={{ margin: 0, marginBottom: '0.5rem', color: '#6b7280' }}>
                  Creating duplicates of: <strong>{sourceLoadout?.blueprint_name}</strong>
                </p>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Number of Copies (max 100)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {presetQuantities.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setQuantity(preset)}
                      style={{
                        padding: '0.5rem 1rem',
                        border: `2px solid ${quantity === preset ? '#3b82f6' : '#d1d5db'}`,
                        borderRadius: '0.375rem',
                        backgroundColor: quantity === preset ? '#eff6ff' : 'white',
                        color: quantity === preset ? '#3b82f6' : '#374151',
                        cursor: 'pointer',
                        fontWeight: quantity === preset ? '600' : '400'
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Serial Prefix (from blueprint)
                  </label>
                  <input
                    type="text"
                    value={serialPrefix}
                    readOnly
                    disabled
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      backgroundColor: '#f3f4f6',
                      color: '#6b7280',
                      cursor: 'not-allowed'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Starting Suffix
                  </label>
                  <input
                    type="text"
                    value={startingSuffix}
                    onChange={(e) => setStartingSuffix(e.target.value)}
                    placeholder="001"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#f9fafb', 
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}>
                <strong>Preview:</strong>
                <div style={{ marginTop: '0.5rem', color: '#6b7280' }}>
                  {serialPrefix && <span>{serialPrefix}-</span>}
                  {startingSuffix}
                  {quantity > 1 && (
                    <>
                      {' → '}
                      {serialPrefix && <span>{serialPrefix}-</span>}
                      {String(parseInt(startingSuffix) + quantity - 1).padStart(startingSuffix.length, '0')}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose} 
              disabled={submitting}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={submit} 
              disabled={submitting}
            >
              {submitting ? `Creating ${quantity} loadouts...` : `Create ${quantity} Loadout${quantity > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContainerLoadouts() {
  const user = { company_id: 1, user_id: 1 }; // Mock - replace with actual auth context
  const token = getAuthToken();
  
  const [loadouts, setLoadouts] = useState([]);
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
  const [openDuplicate, setOpenDuplicate] = useState(false);
  const abortRef = useRef(null);

  const selected = useMemo(
    () => loadouts.find(l => l.loadout_id === selectedId) || null,
    [loadouts, selectedId]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typing.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [typing]);

  useEffect(() => {
    const fetchLoadouts = async () => {
      if (!user?.company_id) return;
      
      setLoading(true);
      setErr('');

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (q) params.set('q', q);
      params.set('company_id', user.company_id);

      const url = `${API_BASE}/search?${params.toString()}`;
      const authToken = getAuthToken();
      
      if (!authToken) {
        console.error('No authentication token available');
        setErr('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const headerTotal = res.headers.get('X-Total-Count') || res.headers.get('x-total-count');
        const parsedTotal = headerTotal != null ? Number(headerTotal) : null;
        setTotalCount(Number.isFinite(parsedTotal) ? parsedTotal : null);
        const data = await res.json();
        const responseData = Array.isArray(data) ? data : (data.data || []);
        const processedData = responseData.map(item => ({
          ...item,
          is_active: Boolean(item.is_active)
        }));
        setLoadouts(processedData);
        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        if (e.name !== 'AbortError') setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    };

    fetchLoadouts();
    return () => abortRef.current?.abort();
  }, [offset, q, user?.company_id]);

  const handleCreated = (created) => {
    setLoadouts(prev => [created, ...prev]);
    setSelectedId(created.loadout_id);
    setActiveTab('general');
    setIsEditing(false);
  };

  const handleDuplicated = (createdLoadouts) => {
    setLoadouts(prev => [...createdLoadouts, ...prev]);
    if (createdLoadouts.length > 0) {
      setSelectedId(createdLoadouts[0].loadout_id);
    }
    setActiveTab('general');
    setIsEditing(false);
  };

  const saveGeneral = async (loadout_id, patch) => {
    try {
      const res = await fetch(`${API_BASE}/${loadout_id}`, {
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
      const existingLoadout = loadouts.find(l => l.loadout_id === loadout_id);
      const mergedLoadout = { ...existingLoadout, ...updated };
      
      setLoadouts(prev => prev.map(l => l.loadout_id === loadout_id ? mergedLoadout : l));
      setIsEditing(false);
      return mergedLoadout;
    } catch (error) {
      console.error('Error in saveGeneral:', error);
      throw error;
    }
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : null;

  const LoadoutDetails = ({ loadout, onEdit }) => (
    <div className="loadout-detail-card">
      <div className="detail-header">
        <h2>{loadout.blueprint_name} - {loadout.serial_suffix || `#${loadout.loadout_id}`}</h2>
        <div className="loadout-detail-actions">
          <button onClick={() => setOpenDuplicate(true)} className="loadout-btn pill neutral">
            Duplicate
          </button>
          <button onClick={onEdit} className="loadout-btn pill">Edit</button>
        </div>
      </div>
      
      <div className="loadout-detail-grid">
        <div className="loadout-detail-item">
          <label>Blueprint</label>
          <p>{loadout.blueprint_name || 'N/A'}</p>
        </div>
        <div className="loadout-detail-item">
          <label>Location</label>
          <p>{loadout.location_name || 'N/A'}</p>
        </div>
        <div className="loadout-detail-item">
          <label>Serial Suffix</label>
          <p>{loadout.serial_suffix || '—'}</p>
        </div>
        <div className="loadout-detail-item col-span-2">
          <label>Notes</label>
          <p>{loadout.notes || '—'}</p>
        </div>
      </div>
    </div>
  );

  const LoadoutForm = ({ loadout, onCancel, onSave }) => {
    const [form, setForm] = useState({
      serial_suffix: loadout.serial_suffix || '',
      notes: loadout.notes || '',
    });

    const change = (e) => {
      const { name, value } = e.target;
      setForm(prev => ({ ...prev, [name]: value }));
    };

    return (
      <div className="loadout-detail-card">
        <h2>Edit Loadout</h2>

        <div className="loadout-form-grid">
          <div className="loadout-form-field">
            <label>Serial Suffix</label>
            <input name="serial_suffix" value={form.serial_suffix} onChange={change} />
          </div>
          <div className="loadout-form-field col-span-2">
            <label>Notes</label>
            <textarea name="notes" rows={4} value={form.notes} onChange={change} />
          </div>
        </div>

        <div className="loadout-form-actions">
          <button className="loadout-btn ghost" onClick={onCancel}>Cancel</button>
          <button 
            className="loadout-btn primary"
            onClick={() => {
              const updateData = {
                serial_suffix: form.serial_suffix || null,
                notes: form.notes || null,
              };
              onSave(updateData);
            }}
          >
            Update Loadout
          </button>
        </div>
      </div>
    );
  };

  const LoadoutItems = ({ loadoutId, blueprintId, loadoutLocationId }) => {
    const [blueprintItems, setBlueprintItems] = useState([]);
    const [assignedLots, setAssignedLots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [assigningToItem, setAssigningToItem] = useState(null);
    const [availableLots, setAvailableLots] = useState([]);
    const [selectedLot, setSelectedLot] = useState({
      lot_id: '',
      quantity_used: 1
    });

    const getRequiredQuantity = (item) =>
      item?.default_quantity ||
      item?.quantity_default ||
      item?.quantity_min ||
      item?.quantity_required ||
      1;

    const getAssignedQuantity = (item) =>
      assignedLots
        .filter((lot) => lot.product_id === item?.product_id)
        .reduce((sum, lot) => sum + Number(lot.quantity_used || 0), 0);

    const getRemainingQuantity = (item) =>
      Math.max(getRequiredQuantity(item) - getAssignedQuantity(item), 0);

    // Update quantity when assigning to a new item
    useEffect(() => {
      if (assigningToItem) {
        const defaultQty =
          assigningToItem.default_quantity ||
          assigningToItem.quantity_default ||
          assigningToItem.quantity_min ||
          assigningToItem.quantity_required ||
          1;
        const remaining = getRemainingQuantity(assigningToItem) || 1;
        const safeQty = Math.max(1, Math.min(defaultQty, remaining));
        setSelectedLot({ lot_id: '', quantity_used: safeQty });
      } else {
        setSelectedLot({ lot_id: '', quantity_used: 1 });
      }
    }, [assigningToItem, assignedLots]);

    useEffect(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          const itemsRes = await fetch(
            buildApiUrl(`api/inventory/container_blueprints/${blueprintId}/items`),
            { 
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || getAuthToken()}` 
              } 
            }
          );
          if (!itemsRes.ok) throw new Error(`HTTP ${itemsRes.status}`);
          const itemsData = await itemsRes.json();
          console.log('Blueprint items fetched:', itemsData);
          
          // Log the first item to see available fields
          if (itemsData && itemsData.length > 0) {
            console.log('First item fields:', Object.keys(itemsData[0]));
            console.log('First item data:', itemsData[0]);
          }
          
          // Fetch product details for each item if product_name is missing
          const itemsWithProducts = await Promise.all(
            (Array.isArray(itemsData) ? itemsData : []).map(async (item) => {
              if (!item.product_name && item.product_id) {
                try {
                  const productRes = await fetch(
                    buildApiUrl(`api/inventory/products/${item.product_id}`),
                    { 
                      headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token || getAuthToken()}` 
                      } 
                    }
                  );
                  if (productRes.ok) {
                    const productData = await productRes.json();
                    return { ...item, product_name: productData.product_name || productData.name };
                  }
                } catch (e) {
                  console.error(`Error fetching product ${item.product_id}:`, e);
                }
              }
              return item;
            })
          );
          
          console.log('Blueprint items with products:', itemsWithProducts);
          setBlueprintItems(itemsWithProducts);
          
          const lotsRes = await fetch(
            buildApiUrl(`api/inventory/container_loadouts/${loadoutId}/lots`),
            { 
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || getAuthToken()}` 
              } 
            }
          );
          
          if (!lotsRes.ok) throw new Error(`HTTP ${lotsRes.status}`);
          const lotsData = await lotsRes.json();
          console.log('Assigned lots fetched:', lotsData);
          setAssignedLots(Array.isArray(lotsData) ? lotsData : []);
        } catch (e) {
          console.error('Error fetching loadout data:', e);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [loadoutId, blueprintId]);

    useEffect(() => {
      if (!assigningToItem) {
        setAvailableLots([]);
        return;
      }

      const fetchAvailableLots = async () => {
        try {
          const res = await fetch(
            buildApiUrl(`api/inventory/items/by-product/${assigningToItem.product_id}`),
            { headers: { Authorization: `Bearer ${token || getAuthToken()}` } }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const lots = Array.isArray(data)
            ? data
                .filter(item => Number(item.quantity_available) > 0)
                .filter(item =>
                  loadoutLocationId ? Number(item.location_id) === Number(loadoutLocationId) : true
                )
                .map(item => ({
                  lot_id: item.lot_id,
                  lot_number: item.lot_number,
                  quantity_available: item.quantity_available,
                  expiration_date: item.expiration_date
                }))
            : [];
          setAvailableLots(lots);
        } catch (e) {
          console.error('Error fetching inventory:', e);
        }
      };

      fetchAvailableLots();
    }, [assigningToItem, loadoutLocationId]);

    const assignLot = async () => {
      if (!selectedLot.lot_id || !assigningToItem) return;

      const remainingQty = getRemainingQuantity(assigningToItem);
      if (remainingQty <= 0) {
        alert('Required quantity already assigned for this item.');
        setAssigningToItem(null);
        return;
      }

      const qtyToApply = Math.min(
        Number(selectedLot.quantity_used) || 1,
        remainingQty
      );
      
      try {
        const res = await fetch(`${API_BASE}/${loadoutId}/lots`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || getAuthToken()}`
          },
          body: JSON.stringify({
            loadout_id: loadoutId,
            product_id: Number(assigningToItem.product_id),
            lot_id: Number(selectedLot.lot_id),
            quantity_used: qtyToApply
          })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.message || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const created = await res.json();
        setAssignedLots(prev => [...prev, created]);
        setAssigningToItem(null);
        setSelectedLot({ lot_id: '', quantity_used: 1 });
      } catch (e) {
        console.error('Error assigning lot:', e);
        alert('Failed to assign lot: ' + (e.message || 'Unknown error'));
      }
    };

    const removeLot = async (lotLoadoutId) => {
      if (!confirm('Remove this lot from the loadout?')) return;
      
      try {
        const res = await fetch(`${API_BASE}/${loadoutId}/lots/${lotLoadoutId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token || getAuthToken()}` }
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setAssignedLots(prev => prev.filter(l => l.loadout_lot_id !== lotLoadoutId));
      } catch (e) {
        console.error('Error removing lot:', e);
        alert('Failed to remove lot: ' + e.message);
      }
    };

    if (loading) return <div className="loading-row">Loading items...</div>;

    return (
      <div className="loadout-items-card">
        <div className="detail-header">
          <h2>Blueprint Items</h2>
        </div>

        {blueprintItems.length === 0 ? (
          <div className="loadout-empty-state">
            <p>No items in this blueprint.</p>
          </div>
        ) : (
          <div className="loadout-table-wrapper">
            <table className="loadout-items-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Required Qty</th>
                  <th>Assigned Lots</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {blueprintItems.map(item => {
                  const itemLots = assignedLots.filter(lot => lot.product_id === item.product_id);
                  const isAssigning = assigningToItem?.product_id === item.product_id;
                  const requiredQty = getRequiredQuantity(item);
                  const assignedQty = getAssignedQuantity(item);
                  const remainingQty = Math.max(requiredQty - assignedQty, 0);
                  const canAssignMore = remainingQty > 0;
                  
                  return (
                    <React.Fragment key={item.blueprint_item_id}>
                      <tr>
                        <td>
                          <div className="product-name">
                            {item.product_name || `Product #${item.product_id}`}
                          </div>
                          {item.usage_notes && (
                            <div className="product-usage">{item.usage_notes}</div>
                          )}
                        </td>
                        <td>
                          {requiredQty}
                          {item.quantity_max && item.quantity_max !== requiredQty && (
                            <span className="text-muted"> - {item.quantity_max}</span>
                          )}
                          <div className="text-muted">
                            Assigned: {assignedQty} • Remaining: {remainingQty}
                          </div>
                        </td>
                        <td>
                          {itemLots.length === 0 ? (
                            <span className="text-muted italic">No lots assigned</span>
                          ) : (
                            <div className="lot-list">
                              {itemLots.map(lot => (
                                <div key={lot.loadout_lot_id} className="lot-chip">
                                  <span>{lot.lot_number || `Lot #${lot.lot_id}`}</span>
                                  <span className="text-muted">(Qty: {lot.quantity_used})</span>
                                  <button onClick={() => removeLot(lot.loadout_lot_id)} title="Remove lot">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {!isAssigning && (
                            <button 
                              onClick={() => canAssignMore && setAssigningToItem(item)}
                              disabled={!canAssignMore}
                              className={`loadout-btn primary ${!canAssignMore ? 'disabled' : ''}`}
                              title={
                                canAssignMore
                                  ? 'Assign another lot'
                                  : 'Required quantity already assigned'
                              }
                            >
                              <Plus size={16} /> Assign Lot
                            </button>
                          )}
                        </td>
                      </tr>
                      
                      {isAssigning && (
                        <tr className="lot-assignment-row">
                          <td colSpan={4}>
                            <div className="lot-assignment-form">
                              <div className="lot-assignment-field">
                                <label>Select Lot</label>
                                <select 
                                  value={selectedLot.lot_id} 
                                  onChange={(e) => {
                                    const lotId = e.target.value;
                                    const selectedLotData = availableLots.find(l => l.lot_id === Number(lotId));
                                    const maxLotQty = selectedLotData ? selectedLotData.quantity_available : 1;
                                    const maxQty = Math.min(maxLotQty, remainingQty || 1);
                                    setSelectedLot({ 
                                      lot_id: lotId, 
                                      quantity_used: Math.max(1, Math.min(selectedLot.quantity_used, maxQty)) 
                                    });
                                  }}
                                >
                                  <option value="">Select lot...</option>
                                  {availableLots.map(lot => (
                                    <option key={lot.lot_id} value={lot.lot_id}>
                                      {lot.lot_number} (Available: {lot.quantity_available})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="lot-assignment-field">
                                <label>Quantity</label>
                                <input 
                                  type="number" 
                                  min="1"
                                  max={(() => {
                                    const availableQty = availableLots.find(l => l.lot_id === Number(selectedLot.lot_id))?.quantity_available || 1;
                                    return Math.max(1, Math.min(availableQty, remainingQty || 1));
                                  })()}
                                  value={selectedLot.quantity_used}
                                  onChange={(e) => {
                                    const availableQty = availableLots.find(l => l.lot_id === Number(selectedLot.lot_id))?.quantity_available || 1;
                                    const maxQty = Math.max(1, Math.min(availableQty, remainingQty || 1));
                                    const newQty = Math.max(1, Math.min(Number(e.target.value) || 1, maxQty));
                                    setSelectedLot(prev => ({ ...prev, quantity_used: newQty }));
                                  }}
                                />
                                {selectedLot.lot_id && (
                                  <div className="text-muted">
                                    Max available: {availableLots.find(l => l.lot_id === Number(selectedLot.lot_id))?.quantity_available || 0}
                                  </div>
                                )}
                              </div>
                              <div className="lot-assignment-actions">
                                <button 
                                  onClick={() => {
                                    setAssigningToItem(null);
                                    setSelectedLot({ lot_id: '', quantity_used: 1 });
                                  }}
                                  className="loadout-btn ghost"
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={assignLot}
                                  disabled={!selectedLot.lot_id}
                                  className={`loadout-btn primary ${!selectedLot.lot_id ? 'disabled' : ''}`}
                                >
                                  Assign
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="loadouts-layout">
      <section className="loadout-list-panel list-panel">
        <div className="list-panel-header">
          <h1>Container Loadouts</h1>
          <div className="list-controls">
            <div className="search-bar">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                placeholder="Search loadouts..."
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
              />
            </div>
          </div>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="loadout-list list-body">
          {loading ? (
            <div className="loading-row">Loading…</div>
          ) : loadouts.length === 0 ? (
            <div className="no-data">No loadouts found</div>
          ) : (
            loadouts.map(l => (
              <div 
                key={l.loadout_id}
                className={`list-item loadout-list-item ${selectedId === l.loadout_id ? 'selected' : ''}`}
                onClick={() => { setSelectedId(l.loadout_id); setIsEditing(false); setActiveTab('general'); }}
              >
                <h3>{l.blueprint_name || 'Untitled Loadout'}</h3>
                <p>
                  {l.location_name && <span>{l.location_name}</span>}
                  {l.location_name && l.full_serial && <span> • </span>}
                  {l.full_serial && <span>{l.full_serial}</span>}
                  {(l.location_name || l.full_serial) && <span> • </span>}
                  <span>{new Date(l.created_at).toLocaleString()}</span>
                </p>
              </div>
            ))
          )}
        </div>

        <div className="list-panel-footer">
          <button 
            className="loadout-add-btn"
            onClick={() => setOpenAdd(true)}
          >
            <Plus size={18} /> Add Loadout
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

      <section className="loadout-detail-panel detail-panel">
        {!selected ? (
          <div className="detail-empty-state loadout-empty-state">
            <p>Select a loadout to see details.</p>
          </div>
        ) : (
          <>
            <div className="loadout-tabs">
              <button
                className={`loadout-tab ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                General
              </button>
              <button
                className={`loadout-tab ${activeTab === 'items' ? 'active' : ''}`}
                onClick={() => setActiveTab('items')}
              >
                Items & Lots
              </button>
            </div>

            {activeTab === 'general' && (
              isEditing ? (
                <LoadoutForm
                  loadout={selected}
                  onCancel={() => setIsEditing(false)}
                  onSave={(patch) => saveGeneral(selected.loadout_id, patch)}
                />
              ) : (
                <LoadoutDetails 
                  loadout={selected} 
                  onEdit={() => setIsEditing(true)}
                />
              )
            )}

            {activeTab === 'items' && selected && (
              <LoadoutItems
                loadoutId={selected.loadout_id}
                blueprintId={selected.blueprint_id}
                loadoutLocationId={selected.location_id}
              />
            )}
          </>
        )}
      </section>

      <AddLoadoutModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token || getAuthToken()}
        user={user}
      />

      <DuplicateLoadoutModal
        open={openDuplicate}
        onClose={() => setOpenDuplicate(false)}
        onCreated={handleDuplicated}
        authTokenStr={token || getAuthToken()}
        user={user}
        sourceLoadout={selected}
      />
    </div>
  );
}
