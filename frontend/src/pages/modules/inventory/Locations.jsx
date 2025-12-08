import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit2, Search } from 'lucide-react';
import MobileLocationModal from './LocationModalMobile.jsx';
import './Locations.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const buildApiUrl = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
};

const INITIAL_FORM = {
  location_name: '',
  location_group_id: '',
  location_type: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postal_code: ''
};

const PAGE_SIZE = 10;
const INVENTORY_PAGE_SIZE = 20;

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumberValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numberFormatter.format(numeric);
};

const formatDateValue = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString();
};

const getStatusTone = (status = '') => {
  const normalized = status.toLowerCase();
  if (normalized === 'expired') return 'danger';
  if (normalized === 'expiring soon') return 'warning';
  if (normalized === 'active') return 'success';
  return 'neutral';
};

const DETAIL_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'inventory', label: 'Inventory' }
];

function useDebouncedValue(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}

const LOCATION_TYPE_OPTIONS = [
  { value: '', label: 'Select a type' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'facility', label: 'Facility' },
  { value: 'residential', label: 'Residential' },
  { value: 'distributorship', label: 'Distributorship' }
];

const getLocationTypeLabel = (value) => {
  if (!value) return 'Not specified';
  const match = LOCATION_TYPE_OPTIONS.find(option => option.value === value);
  return match?.label || value;
};

const Locations = () => {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationGroups, setLocationGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryData, setInventoryData] = useState([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryOffset, setInventoryOffset] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState(DETAIL_TABS[0].id);

  const selectedLocationId = selectedLocation?.location_id;
  const debouncedInventorySearch = useDebouncedValue(inventorySearch, 400);

  const applyInventoryResponse = useCallback((payload) => {
    const rawItems = payload?.items ?? payload?.data ?? payload?.rows ?? [];
    const normalizedItems = Array.isArray(rawItems) ? rawItems : [];
    const parsedTotal = Number(payload?.total ?? payload?.count);

    setInventoryData(normalizedItems);
    setInventoryTotal(Number.isFinite(parsedTotal) ? parsedTotal : normalizedItems.length);
    setInventoryError(null);
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(buildApiUrl('/api/inventory/locations'), {
        params: {
          q: searchQuery,
          limit: PAGE_SIZE,
          offset: offset
        }
      });
      const data = response.data || [];

      // Check if response includes pagination metadata
      if (response.data && typeof response.data === 'object' && response.data.locations) {
        setLocations(response.data.locations);
        setTotalCount(response.data.total || null);
        setHasMore(response.data.hasMore || false);
      } else {
        // Fallback for simple array response
        setLocations(data);
        setHasMore(data.length === PAGE_SIZE);
        setTotalCount(null);
      }

      setSelectedLocation(prev => {
        const locationList = Array.isArray(data) ? data : (data.locations || []);
        if (!locationList.length) return null;
        if (!prev) return locationList[0];
        return locationList.find(item => item.location_id === prev.location_id) || locationList[0];
      });
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, offset]);

  const loadLocationInventory = useCallback(async () => {
    if (!selectedLocationId) {
      setInventoryData([]);
      setInventoryTotal(0);
      setInventoryError(null);
      setInventoryLoading(false);
      return;
    }

    setInventoryLoading(true);
    setInventoryError(null);

    const sharedParams = {
      q: debouncedInventorySearch || undefined,
      limit: INVENTORY_PAGE_SIZE,
      offset: inventoryOffset
    };

    try {
      const response = await axios.get(
        buildApiUrl(`/api/inventory/locations/${selectedLocationId}/inventory`),
        { params: sharedParams }
      );
      applyInventoryResponse(response.data || {});
    } catch (primaryError) {
      console.error('Error fetching location inventory (enhanced route):', primaryError);

      try {
        const fallbackResponse = await axios.get(
          buildApiUrl('/api/inventory/items'),
          {
            params: {
              ...sharedParams,
              locationId: selectedLocationId
            }
          }
        );

        applyInventoryResponse(fallbackResponse.data || {});
      } catch (fallbackError) {
        console.error('Fallback inventory fetch failed:', fallbackError);
        setInventoryData([]);
        setInventoryTotal(0);
        setInventoryError('Unable to load inventory for this location right now.');
      }
    } finally {
      setInventoryLoading(false);
    }
  }, [selectedLocationId, debouncedInventorySearch, inventoryOffset, applyInventoryResponse]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadLocationInventory();
  }, [loadLocationInventory]);

  useEffect(() => {
    setOffset(0);
  }, [searchQuery]);

  useEffect(() => {
    setInventorySearch('');
    setInventoryOffset(0);
    setActiveDetailTab(DETAIL_TABS[0].id);
  }, [selectedLocationId]);

  useEffect(() => {
    setInventoryOffset(0);
  }, [debouncedInventorySearch]);

  useEffect(() => {
    const fetchLocationGroups = async () => {
      try {
        const response = await axios.get(buildApiUrl('/api/inventory/location-groups'));
        setLocationGroups(response.data || []);
      } catch (error) {
        console.error('Error fetching location groups:', error);
      }
    };
    fetchLocationGroups();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setShowMobileDetail(false);
    }
  }, [isMobile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : null;

  const nextPage = () => {
    if (hasMore) {
      setOffset(prev => prev + PAGE_SIZE);
    }
  };

  const prevPage = () => {
    if (offset > 0) {
      setOffset(prev => Math.max(0, prev - PAGE_SIZE));
    }
  };

  const nextInventoryPage = () => {
    setInventoryOffset(prev => {
      const next = prev + INVENTORY_PAGE_SIZE;
      if (next >= inventoryTotal) {
        return prev;
      }
      return next;
    });
  };

  const prevInventoryPage = () => {
    setInventoryOffset(prev => Math.max(0, prev - INVENTORY_PAGE_SIZE));
  };

  const handleSelectLocation = (location) => {
    setSelectedLocation(location);
    setActiveDetailTab(DETAIL_TABS[0].id);
    if (isMobile) {
      setShowMobileDetail(true);
    }
  };

  const openCreateModal = () => {
    setEditingLocation(null);
    setFormData(INITIAL_FORM);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      location_group_id: formData.location_group_id || null,
      location_type: formData.location_type || null
    };

    try {
      if (editingLocation) {
        await axios.put(buildApiUrl(`/api/inventory/locations/${editingLocation.location_id}`), payload);
      } else {
        await axios.post(buildApiUrl('/api/inventory/locations'), payload);
      }
      await loadLocations();
      closeModal();
    } catch (error) {
      console.error('Error saving location:', error);
      alert('Failed to save location');
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location);
    setFormData({
      location_name: location.location_name || '',
      location_group_id: location.location_group_id ? String(location.location_group_id) : '',
      location_type: location.location_type || '',
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      country: location.country || '',
      postal_code: location.postal_code || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (location_id) => {
    if (!window.confirm('Are you sure you want to delete this location?')) return;

    try {
      await axios.delete(buildApiUrl(`/api/inventory/locations/${location_id}`));
      await loadLocations();
    } catch (error) {
      console.error('Error deleting location:', error);
      alert('Failed to delete location');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLocation(null);
    setFormData(INITIAL_FORM);
  };

  const renderLocationDetails = (location) => {
    if (!location) {
      return (
        <div className="no-selection">
          <p>Select a location to view details</p>
        </div>
      );
    }

    const detailItems = [
      { label: 'Group', value: location.group_name || 'Unassigned' },
      { label: 'Location Type', value: getLocationTypeLabel(location.location_type) },
      { label: 'Address', value: location.address || '—' },
      { label: 'City', value: location.city || '—' },
      { label: 'State / Region', value: location.state || '—' },
      { label: 'Country', value: location.country || '—' },
      { label: 'Postal Code', value: location.postal_code || '—' },
      { label: 'Created', value: location.created_at ? new Date(location.created_at).toLocaleDateString() : '—' }
    ];

    return (
      <>
        <div className="detail-header">
          <div>
            <h2>{location.location_name}</h2>
            {location.group_name && <p className="detail-subtitle">{location.group_name}</p>}
          </div>
          <div className="detail-actions">
            <button type="button" className="edit-btn" onClick={() => handleEdit(location)}>
              <Edit2 size={16} />
              <span>Edit</span>
            </button>
            <button type="button" className="delete-btn" onClick={() => handleDelete(location.location_id)}>
              Delete
            </button>
          </div>
        </div>

        <div className="detail-grid">
          {detailItems.map((item) => (
            <div className="detail-item" key={item.label}>
              <label>{item.label}</label>
              <p>{item.value}</p>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderInventorySection = () => {
    if (!selectedLocation) {
      return null;
    }

    const totalPages = Math.max(Math.ceil((inventoryTotal || 0) / INVENTORY_PAGE_SIZE), 1);
    const currentPage = Math.min(totalPages, Math.floor(inventoryOffset / INVENTORY_PAGE_SIZE) + 1);
    const hasPrevInventory = inventoryOffset > 0;
    const hasNextInventory = inventoryOffset + INVENTORY_PAGE_SIZE < inventoryTotal;

    return (
      <div className="location-inventory-section">
        <div className="section-header">
          <div>
            <h3>Inventory at this location</h3>
            <p className="section-subtitle">Search by SKU, supplier, lot or serial number.</p>
          </div>
          <div className="inventory-count-pill">
            {inventoryLoading ? 'Loading...' : `${inventoryTotal} line${inventoryTotal === 1 ? '' : 's'}`}
          </div>
        </div>

        <div className="inventory-toolbar">
          <div className="inventory-search">
            <Search className="inventory-search-icon" size={16} />
            <input
              type="text"
              placeholder="Search SKU, supplier, lot, serial..."
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
            />
          </div>
        </div>

        {inventoryError && (
          <div className="error-banner inventory-error">
            {inventoryError}
          </div>
        )}

        <div className="inventory-table-wrapper">
          {inventoryLoading ? (
            <div className="loading-row">Loading inventory...</div>
          ) : inventoryData.length === 0 ? (
            <div className="detail-empty-state">
              <p>No inventory lines match your filters.</p>
            </div>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Available</th>
                  <th>On Hand</th>
                  <th>Reserved</th>
                  <th>Supplier</th>
                  <th>Lot / Expiration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventoryData.map(item => (
                  <tr key={item.inventory_id}>
                    <td>
                      <div className="inventory-item-cell">
                        <span className="item-name">{item.product_name || 'Unnamed Item'}</span>
                        <span className="item-meta">
                          {item.sku ? `SKU ${item.sku}` : 'SKU N/A'}
                          {item.category ? ` • ${item.category}` : ''}
                        </span>
                        {item.serial_number && (
                          <span className="item-meta muted">SN: {item.serial_number}</span>
                        )}
                      </div>
                    </td>
                    <td>{formatNumberValue(item.quantity_available)}</td>
                    <td>{formatNumberValue(item.quantity_on_hand)}</td>
                    <td>{formatNumberValue(item.quantity_reserved)}</td>
                    <td>
                      <div className="inventory-item-cell">
                        <span>{item.supplier_name || '—'}</span>
                        {item.received_date && (
                          <span className="item-meta muted">
                            Received {formatDateValue(item.received_date)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="inventory-item-cell">
                        <span>{item.lot_number || '—'}</span>
                        <span className="item-meta muted">
                          {item.expiration_date
                            ? `Exp ${formatDateValue(item.expiration_date)}`
                            : 'No expiration'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`inventory-status status-${getStatusTone(item.status)}`}>
                        {item.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="inventory-pagination">
            <button
              type="button"
              onClick={prevInventoryPage}
              className="pagination-btn"
              disabled={!hasPrevInventory || inventoryLoading}
            >
              Prev
            </button>
            <span className="page-indicator">{`Page ${currentPage} of ${totalPages}`}</span>
            <button
              type="button"
              onClick={nextInventoryPage}
              className="pagination-btn"
              disabled={!hasNextInventory || inventoryLoading}
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="locations-layout">
      <section className="location-list-panel">
        <div className="list-panel-header">
          <h1>Locations</h1>
          <div className="search-bar">
            <Search className="search-icon" size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="location-list">
          {loading ? (
            <div className="loading-row">Loading locations...</div>
          ) : locations.length === 0 ? (
            <div className="no-selection">
              <p>No locations found</p>
            </div>
          ) : (
            locations.map(location => {
              const listSummary = [
                location.group_name || 'Unassigned',
                location.location_type ? getLocationTypeLabel(location.location_type) : null
              ].filter(Boolean).join(' • ');

              return (
                <button
                  key={location.location_id}
                  type="button"
                  className={`location-list-item ${selectedLocation?.location_id === location.location_id ? 'selected' : ''}`}
                  onClick={() => handleSelectLocation(location)}
                >
                  <h3>{location.location_name}</h3>
                  <p>{listSummary}</p>
                  {(location.city || location.state) && (
                    <span className="location-meta">
                      {[location.city, location.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="list-panel-footer">
          <button
            onClick={openCreateModal}
            className="add-location-btn"
          >
            <Plus size={18} />
            Add Location
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

      {!isMobile && (
        <section className="detail-panel location-detail-panel">
          <div className="detail-card location-detail-content">
            <div className="detail-tabs">
              {DETAIL_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`detail-tab-btn ${activeDetailTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeDetailTab === 'details' && renderLocationDetails(selectedLocation)}
            {activeDetailTab === 'inventory' && renderInventorySection()}
          </div>
        </section>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal location-modal">
            <div className="modal-header">
              <h2>{editingLocation ? 'Edit Location' : 'Add Location'}</h2>
              <button type="button" className="icon-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body grid-2">
                <label>
                  Location Name *
                  <input
                    type="text"
                    name="location_name"
                    value={formData.location_name}
                    onChange={handleInputChange}
                    required
                  />
                </label>

                <label>
                  Location Group
                  <select
                    name="location_group_id"
                    value={formData.location_group_id}
                    onChange={handleInputChange}
                  >
                    <option value="">-- No Group --</option>
                    {locationGroups.map(group => (
                      <option key={group.group_id} value={group.group_id}>
                        {group.group_name}
                      </option>
                    ))}
                  </select>
                </label>
                
                <label>
                  Location Type
                  <select
                    name="location_type"
                    value={formData.location_type}
                    onChange={handleInputChange}
                  >
                    {LOCATION_TYPE_OPTIONS.map(option => (
                      <option key={option.value || 'none'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="col-span-2">
                  Address
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                  />
                </label>

                <label>
                  City
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                  />
                </label>

                <label>
                  State / Region
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                  />
                </label>

                <label>
                  Country
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                  />
                </label>

                <label>
                  Postal Code
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleInputChange}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="update-btn">
                  {editingLocation ? 'Update Location' : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MobileLocationModal
        open={Boolean(isMobile && showMobileDetail && selectedLocation)}
        onClose={() => setShowMobileDetail(false)}
        title="Location Details"
      >
        <>
          <div className="detail-tabs mobile">
            {DETAIL_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`detail-tab-btn ${activeDetailTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveDetailTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeDetailTab === 'details' && renderLocationDetails(selectedLocation)}
          {activeDetailTab === 'inventory' && renderInventorySection()}
        </>
      </MobileLocationModal>
    </div>
  );
};

export default Locations;
