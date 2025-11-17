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

const LOCATION_TYPE_OPTIONS = [
  { value: '', label: 'Select a type' },
  { value: 'corporate_warehouse', label: 'Corporate Warehouse' },
  { value: 'distribution_center', label: 'Distribution Center' },
  { value: 'ship_to', label: 'Ship To Address' },
  { value: 'manufacturing', label: 'Manufacturing Plant' },
  { value: 'retail', label: 'Retail / Showroom' },
  { value: 'office', label: 'Corporate Office' },
  { value: 'other', label: 'Other' }
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

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    setOffset(0);
  }, [searchQuery]);

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

  const handleSelectLocation = (location) => {
    setSelectedLocation(location);
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

  return (
    <div className="locations-layout">
      <section className="location-list-panel">
        <div className="list-panel-header">
          <h1>Locations</h1>
          <div className="search-bar">
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

      <section className="detail-panel location-detail-panel">
        <div className="detail-card location-detail-content">
          {renderLocationDetails(selectedLocation)}
        </div>
      </section>

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
        {renderLocationDetails(selectedLocation)}
      </MobileLocationModal>
    </div>
  );
};

export default Locations;
