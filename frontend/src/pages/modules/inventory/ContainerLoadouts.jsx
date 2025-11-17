import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import './Parts.css';

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

function AddLoadoutModal({ open, onClose, onCreated, authTokenStr, user }) {
  if (!open) return null;

  const [blueprints, setBlueprints] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    blueprint_id: '',
    location_id: '',
    serial_suffix: '',
    notes: '',
  });
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchBlueprints = async () => {
      try {
        const url = buildApiUrl('api/inventory/container_blueprints/search');
        const res = await fetch(url, {
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

    if (open) {
      fetchBlueprints();
      fetchLocations();
    }
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
  if (!open) return null;

  const [quantity, setQuantity] = useState(10);
  const [serialPrefix, setSerialPrefix] = useState('');
  const [startingSuffix, setStartingSuffix] = useState('001');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const presetQuantities = [10, 15, 50];

  useEffect(() => {
    const fetchBlueprintPrefix = async () => {
      if (!sourceLoadout?.blueprint_id) return;
      
      setLoading(true);
      try {
        const res = await fetch(
          buildApiUrl(`api/inventory/container_blueprints/${sourceLoadout.blueprint_id}`),
          {
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

    if (open) {
      fetchBlueprintPrefix();
    }
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
        method: 'PUT',
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
    <div className="part-detail-content">
      <div className="detail-header">
        <h2>{loadout.blueprint_name} - {loadout.serial_suffix || `#${loadout.loadout_id}`}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setOpenDuplicate(true)} className="edit-btn" style={{ backgroundColor: '#10b981' }}>
            Duplicate
          </button>
          <button onClick={onEdit} className="edit-btn">Edit</button>
        </div>
      </div>
      
      <div className="detail-grid">
        <div className="detail-item">
          <label>Blueprint</label>
          <p>{loadout.blueprint_name || 'N/A'}</p>
        </div>
        <div className="detail-item">
          <label>Location</label>
          <p>{loadout.location_name || 'N/A'}</p>
        </div>
        <div className="detail-item">
          <label>Serial Suffix</label>
          <p>{loadout.serial_suffix || '—'}</p>
        </div>
        <div className="detail-item col-span-2">
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
      <div className="part-detail-content">
        <h2>Edit Loadout</h2>

        <div className="form-grid">
          <div className="form-field">
            <label>Serial Suffix</label>
            <input name="serial_suffix" value={form.serial_suffix} onChange={change} />
          </div>
          <div className="form-field col-span-2">
            <label>Notes</label>
            <textarea name="notes" rows={4} value={form.notes} onChange={change} />
          </div>
        </div>

        <div className="form-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button 
            className="update-btn"
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

  const LoadoutItems = ({ loadoutId, blueprintId }) => {
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
          setAvailableLots(
            Array.isArray(data)
              ? data
                  .filter(item => Number(item.quantity_available) > 0)
                  .map(item => ({
                    lot_id: item.lot_id,
                    lot_number: item.lot_number,
                    quantity_available: item.quantity_available,
                    expiration_date: item.expiration_date
                  }))
              : []
          );
        } catch (e) {
          console.error('Error fetching inventory:', e);
        }
      };

      fetchAvailableLots();
    }, [assigningToItem]);

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
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created = await res.json();
        setAssignedLots(prev => [...prev, created]);
        setAssigningToItem(null);
        setSelectedLot({ lot_id: '', quantity_used: 1 });
      } catch (e) {
        console.error('Error assigning lot:', e);
        alert('Failed to assign lot: ' + e.message);
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

    if (loading) return <div>Loading items...</div>;

    return (
      <div className="part-detail-content">
        <div className="detail-header">
          <h2>Blueprint Items</h2>
        </div>

        {blueprintItems.length === 0 ? (
          <p>No items in this blueprint.</p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Product</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Required Qty</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Assigned Lots</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600' }}>Actions</th>
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
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: '500' }}>
                            {item.product_name || `Product #${item.product_id}`}
                          </div>
                          {item.usage_notes && (
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                              {item.usage_notes}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {requiredQty}
                          {item.quantity_max && item.quantity_max !== requiredQty && (
                            <span style={{ color: '#6b7280' }}> - {item.quantity_max}</span>
                          )}
                          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            Assigned: {assignedQty} • Remaining: {remainingQty}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {itemLots.length === 0 ? (
                            <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.875rem' }}>
                              No lots assigned
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {itemLots.map(lot => (
                                <div key={lot.loadout_lot_id} style={{ 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  fontSize: '0.875rem'
                                }}>
                                  <span style={{ fontWeight: '500' }}>
                                    {lot.lot_number || `Lot #${lot.lot_id}`}
                                  </span>
                                  <span style={{ color: '#6b7280' }}>
                                    (Qty: {lot.quantity_used})
                                  </span>
                                  <button 
                                    onClick={() => removeLot(lot.loadout_lot_id)}
                                    style={{ 
                                      background: 'transparent',
                                      color: '#ef4444', 
                                      border: 'none', 
                                      cursor: 'pointer',
                                      padding: '0.125rem',
                                      fontSize: '1rem'
                                    }}
                                    title="Remove lot"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          {!isAssigning && (
                            <button 
                              onClick={() => canAssignMore && setAssigningToItem(item)}
                              disabled={!canAssignMore}
                              style={{
                                backgroundColor: canAssignMore ? '#3b82f6' : '#cbd5f5',
                                color: canAssignMore ? 'white' : '#64748b',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.375rem',
                                cursor: canAssignMore ? 'pointer' : 'not-allowed',
                                fontSize: '0.875rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
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
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <td colSpan={4} style={{ padding: '1rem' }}>
                            <div style={{ 
                              display: 'grid',
                              gridTemplateColumns: '2fr 1fr auto',
                              gap: '1rem',
                              alignItems: 'end'
                            }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                  Select Lot
                                </label>
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
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem'
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
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                  Quantity
                                </label>
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
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem'
                                  }}
                                />
                                {selectedLot.lot_id && (
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                    Max available: {availableLots.find(l => l.lot_id === Number(selectedLot.lot_id))?.quantity_available || 0}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                  onClick={() => {
                                    setAssigningToItem(null);
                                    setSelectedLot({ lot_id: '', quantity_used: 1 });
                                  }}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem',
                                    backgroundColor: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={assignLot}
                                  disabled={!selectedLot.lot_id}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    backgroundColor: selectedLot.lot_id ? '#3b82f6' : '#d1d5db',
                                    color: 'white',
                                    cursor: selectedLot.lot_id ? 'pointer' : 'not-allowed'
                                  }}
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
    <div className="parts-layout">
      <div className="part-list-panel">
        <div className="list-panel-header">
          <h1>Container Loadouts</h1>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search loadouts..."
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
            />
          </div>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <div className="part-list">
          {loading ? (
            <div className="loading-row">Loading…</div>
          ) : loadouts.length === 0 ? (
            <div className="no-data">No loadouts found</div>
          ) : (
            loadouts.map(l => (
              <div 
                key={l.loadout_id}
                className={`part-list-item ${selectedId === l.loadout_id ? 'selected' : ''}`}
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
            className="add-blueprint-btn flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors"
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
      </div>

      <div className="part-detail-panel">
        {!selected ? (
          <p>Select a loadout to see details.</p>
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
                className={`tab-btn ${activeTab === 'items' ? 'active' : ''}`}
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
              <LoadoutItems loadoutId={selected.loadout_id} blueprintId={selected.blueprint_id} />
            )}
          </>
        )}
      </div>

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
