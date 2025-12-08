import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Edit2, X, Trash2 } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import './Bins.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const buildApiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
const getAuthToken = () => localStorage.getItem('auth_token') || '';

const emptyForm = {
  location_id: '',
  aisle: '',
  rack: '',
  shelf: '',
  bin: '',
  zone: '',
  description: '',
  is_active: true
};

const Bins = () => {
  const [bins, setBins] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedBin, setSelectedBin] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingBin, setEditingBin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const { can } = usePermissions();

  const canView = can('inventory.bins.view');
  const canCreate = can('inventory.bins.create');
  const canEdit = can('inventory.bins.edit');
  const canDelete = can('inventory.bins.delete');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
  };

  const loadLocations = async () => {
    try {
      const res = await fetch(buildApiUrl('/api/inventory/locations'), { headers });
      if (!res.ok) throw new Error('Failed to load locations');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.locations || data.data || []);
      setLocations(list);
    } catch (e) {
      console.error(e);
      setErr(e.message);
    }
  };

  const loadBins = async () => {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({ limit: 250 });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (filterLocation) params.set('location_id', filterLocation);

      const res = await fetch(buildApiUrl(`/api/inventory/bins?${params.toString()}`), { headers });
      if (!res.ok) throw new Error('Failed to load bins');
      const data = await res.json();
      const incoming = Array.isArray(data) ? data : (data.data || []);
      setBins(incoming);

      // Keep selected bin in sync with filtered data when search or location filter change
      if (selectedBin) {
        const stillExists = incoming.find((b) => b.bin_id === selectedBin.bin_id);
        if (!stillExists) {
          setSelectedBin(null);
          setEditingBin(null);
        }
      }
    } catch (e) {
      console.error(e);
      setErr(e.message);
      setBins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (getAuthToken() && canView) {
      loadBins();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, debouncedSearch, filterLocation]);

  const formatBinLocation = (bin) => {
    const parts = [bin.aisle, bin.rack, bin.shelf, bin.bin].filter(Boolean);
    return parts.length > 0 ? parts.join('-') : `Bin ${bin.bin_id}`;
  };

  const filteredBins = useMemo(() => {
    const term = search.trim().toLowerCase();
    const locationId = filterLocation ? Number(filterLocation) : null;

    return bins.filter((b) => {
      const matchesLocation = locationId ? b.location_id === locationId : true;
      if (!matchesLocation) return false;

      if (!term) return true;
      const binCode = formatBinLocation(b).toLowerCase();
      const locationName = (b.location_name || `Location ${b.location_id}`).toLowerCase();
      const zone = (b.zone || '').toLowerCase();
      const description = (b.description || '').toLowerCase();

      return (
        binCode.includes(term) ||
        locationName.includes(term) ||
        zone.includes(term) ||
        description.includes(term)
      );
    });
  }, [bins, filterLocation, search]);

  const change = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateNew = () => {
    setEditingBin(null);
    setSelectedBin(null);
    setForm({ ...emptyForm, location_id: locations.length ? locations[0].location_id : '' });
  };

  const handleEditBin = (bin) => {
    setEditingBin(bin);
    setSelectedBin(bin);
    setForm({
      location_id: bin.location_id || '',
      aisle: bin.aisle || '',
      rack: bin.rack || '',
      shelf: bin.shelf || '',
      bin: bin.bin || '',
      zone: bin.zone || '',
      description: bin.description || '',
      is_active: bin.is_active !== undefined ? Boolean(bin.is_active) : true
    });
  };

  const handleSelectBin = (bin) => {
    if (selectedBin?.bin_id === bin.bin_id) {
      setSelectedBin(null);
      setEditingBin(null);
      setForm(emptyForm);
    } else {
      setSelectedBin(bin);
      setEditingBin(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if ((!canCreate && !editingBin) || (!canEdit && editingBin)) {
      setErr('You do not have permission to perform this action');
      return;
    }
    if (saving) return;
    setSaving(true);
    setErr('');
    try {
      const payload = {
        ...form,
        location_id: form.location_id ? Number(form.location_id) : null,
        is_active: form.is_active ? 1 : 0
      };

      const url = editingBin
        ? buildApiUrl(`/api/inventory/bins/${editingBin.bin_id}`)
        : buildApiUrl('/api/inventory/bins');

      const method = editingBin ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${editingBin ? 'update' : 'create'} bin`);
      }

      const result = await res.json();

      loadBins();

      if (editingBin) {
        setSelectedBin(result);
        setEditingBin(null);
      } else {
        setForm({ ...emptyForm, location_id: form.location_id });
        setSelectedBin(null);
      }
    } catch (e) {
      console.error(e);
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingBin(null);
    if (selectedBin) {
      // Revert to view mode
      setForm(emptyForm);
    } else {
      setForm({ ...emptyForm, location_id: locations.length ? locations[0].location_id : '' });
    }
  };

  const removeBin = async (bin_id) => {
    if (!canDelete) {
      setErr('You do not have permission to delete bins');
      return;
    }

    const confirmed = window.confirm('Delete this bin? This cannot be undone.');
    if (!confirmed) return;

    setErr('');
    try {
      const res = await fetch(buildApiUrl(`/api/inventory/bins/${bin_id}`), {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error(data.error || 'Bin has inventory and cannot be deleted');
        }
        throw new Error(data.error || 'Failed to delete bin');
      }

      if (selectedBin?.bin_id === bin_id) {
        setSelectedBin(null);
        setEditingBin(null);
        setForm(emptyForm);
      }

      loadBins();
    } catch (e) {
      console.error(e);
      setErr(e.message);
    }
  };

  return (
    <div className="bins-layout">
      <div className="bins-header">
        <div>
          <h1>Bins</h1>
          <p className="subtitle">Manage warehouse bins by aisle, rack, shelf, and zone.</p>
        </div>
        <div className="bins-header-actions">
          <select
            className="location-filter"
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.location_id} value={loc.location_id}>
                {loc.location_name || `Location ${loc.location_id}`}
              </option>
            ))}
          </select>
          {canCreate && (
            <button className="btn-primary" onClick={handleCreateNew}>
              <Plus size={16} />
              New Bin
            </button>
          )}
        </div>
      </div>

      {err && <div className="error-banner">{err}</div>}

      <div className="bins-content">
        {/* Left Panel - Bins List */}
        <div className="bins-list-panel">
          <div className="bins-list-header">
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="     Search bins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="bins-count">
              {filteredBins.length} bin{filteredBins.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="bins-list">
            {loading ? (
              <div className="empty-state">Loading...</div>
            ) : filteredBins.length === 0 ? (
              <div className="empty-state">
                <p>No bins found</p>
                {canCreate && (
                  <button className="btn-secondary" onClick={handleCreateNew}>
                    <Plus size={16} />
                    Create First Bin
                  </button>
                )}
              </div>
            ) : (
              filteredBins.map((bin) => (
                <div
                  key={bin.bin_id}
                  className={`bin-list-item ${selectedBin?.bin_id === bin.bin_id ? 'selected' : ''}`}
                  onClick={() => handleSelectBin(bin)}
                >
                  <div className="bin-item-header">
                    <div className="bin-item-title">
                      {formatBinLocation(bin)}
                    </div>
                    <span className={`bin-status-badge ${bin.is_active ? 'active' : 'inactive'}`}>
                      {bin.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="bin-item-meta">
                    <span className="bin-location">{bin.location_name || `Location ${bin.location_id}`}</span>
                    {bin.zone && <span className="bin-zone">Zone: {bin.zone}</span>}
                  </div>
                  {bin.description && (
                    <div className="bin-item-desc">{bin.description}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Details / Form */}
        <div className="bins-detail-panel">
          {!selectedBin && !editingBin && (!canCreate || form.location_id === '') ? (
            <div className="empty-state">
              <p>Select a bin to view details</p>
              {canCreate && (
                <button className="btn-primary" onClick={handleCreateNew}>
                  <Plus size={16} />
                  Create New Bin
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="detail-header">
                <h2>{editingBin ? 'Edit Bin' : selectedBin ? formatBinLocation(selectedBin) : 'New Bin'}</h2>
                {selectedBin && !editingBin && (
                  <div className="detail-actions">
                    {canEdit && (
                      <button className="btn-secondary" onClick={() => handleEditBin(selectedBin)}>
                        <Edit2 size={16} />
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn-danger" onClick={() => removeBin(selectedBin.bin_id)}>
                        <Trash2 size={16} />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {selectedBin && !editingBin ? (
                <div className="detail-content">
                  <div className="detail-section">
                    <h3>Location Details</h3>
                    <div className="detail-grid">
                      <div className="detail-field">
                        <label>Location</label>
                        <div>{selectedBin.location_name || `Location ${selectedBin.location_id}`}</div>
                      </div>
                      <div className="detail-field">
                        <label>Aisle</label>
                        <div>{selectedBin.aisle || '-'}</div>
                      </div>
                      <div className="detail-field">
                        <label>Rack</label>
                        <div>{selectedBin.rack || '-'}</div>
                      </div>
                      <div className="detail-field">
                        <label>Shelf</label>
                        <div>{selectedBin.shelf || '-'}</div>
                      </div>
                      <div className="detail-field">
                        <label>Bin</label>
                        <div>{selectedBin.bin || '-'}</div>
                      </div>
                      <div className="detail-field">
                        <label>Zone</label>
                        <div>{selectedBin.zone || '-'}</div>
                      </div>
                      <div className="detail-field full-width">
                        <label>Description</label>
                        <div>{selectedBin.description || 'No description'}</div>
                      </div>
                      <div className="detail-field">
                        <label>Status</label>
                        <div>
                          <span className={`status-badge ${selectedBin.is_active ? 'active' : 'inactive'}`}>
                            {selectedBin.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form className="detail-form" onSubmit={submit}>
                  <div className="form-section">
                    <h3>Bin Information</h3>
                    <div className="form-grid">
                      <label className="full-width">
                        Warehouse / Location *
                        <select name="location_id" value={form.location_id} onChange={change} required>
                          <option value="">Select location...</option>
                          {locations.map((loc) => (
                            <option key={loc.location_id} value={loc.location_id}>
                              {loc.location_name || `Location ${loc.location_id}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Aisle
                        <input name="aisle" value={form.aisle} onChange={change} placeholder="A1" />
                      </label>
                      <label>
                        Rack
                        <input name="rack" value={form.rack} onChange={change} placeholder="R1" />
                      </label>
                      <label>
                        Shelf
                        <input name="shelf" value={form.shelf} onChange={change} placeholder="S1" />
                      </label>
                      <label>
                        Bin
                        <input name="bin" value={form.bin} onChange={change} placeholder="B1" />
                      </label>
                      <label className="full-width">
                        Zone
                        <input name="zone" value={form.zone} onChange={change} placeholder="Z1" />
                      </label>
                      <label className="full-width">
                        Description
                        <textarea
                          name="description"
                          value={form.description}
                          onChange={change}
                          placeholder="Notes (optional)"
                          rows="3"
                        />
                      </label>
                      <label className="full-width" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          name="is_active"
                          checked={form.is_active}
                          onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        <span>Active</span>
                      </label>
                    </div>
                  </div>

                  <div className="form-actions">
                    {(editingBin || selectedBin) && (
                      <button type="button" className="btn-secondary" onClick={cancelEdit}>
                        <X size={16} />
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="btn-primary" disabled={saving}>
                      <Plus size={16} />
                      {saving ? 'Saving...' : editingBin ? 'Update Bin' : 'Create Bin'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Bins;
