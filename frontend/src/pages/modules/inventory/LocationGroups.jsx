import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import './LocationGroups.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const buildApiUrl = (path) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
};

const INITIAL_FORM = {
  group_name: '',
  description: '',
  state: ''
};

const PAGE_SIZE = 10;

const LocationGroups = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errorMessage, setErrorMessage] = useState('');
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const response = await axios.get(buildApiUrl('/api/inventory/location-groups'), {
        params: {
          q: searchQuery || undefined,
          withCount: 'true',
          limit: PAGE_SIZE,
          offset: offset
        }
      });

      const data = response.data || [];

      // Handle pagination metadata if provided
      if (response.data && typeof response.data === 'object' && response.data.groups) {
        setGroups(response.data.groups);
        setTotalCount(response.data.total || null);
      } else {
        setGroups(data);
        setTotalCount(null);
      }

      // Auto-select first group if none selected
      setSelectedGroup(prev => {
        const groupList = Array.isArray(data) ? data : (data.groups || []);
        if (!groupList.length) return null;
        if (!prev) return groupList[0];
        return groupList.find(item => item.group_id === prev.group_id) || groupList[0];
      });
    } catch (error) {
      console.error('Error fetching location groups:', error);
      setErrorMessage('Unable to load location groups. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, offset]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    setOffset(0);
  }, [searchQuery]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreateModal = () => {
    setEditingGroup(null);
    setFormData(INITIAL_FORM);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        await axios.put(buildApiUrl(`/api/inventory/location-groups/${editingGroup.group_id}`), formData);
      } else {
        await axios.post(buildApiUrl('/api/inventory/location-groups'), formData);
      }
      await fetchGroups();
      closeModal();
    } catch (error) {
      console.error('Error saving location group:', error);
      alert('Failed to save location group');
    }
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setFormData({
      group_name: group.group_name,
      description: group.description || '',
      state: group.state || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (group_id) => {
    if (!window.confirm('Are you sure you want to delete this location group?')) return;

    try {
      await axios.delete(buildApiUrl(`/api/inventory/location-groups/${group_id}`));
      await fetchGroups();
    } catch (error) {
      console.error('Error deleting location group:', error);
      const message = error.response?.data?.message || 'Failed to delete location group';
      alert(message);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGroup(null);
    setFormData(INITIAL_FORM);
  };

  const handlePrevPage = () => {
    if (offset > 0) {
      setOffset(prev => Math.max(0, prev - PAGE_SIZE));
    }
  };

  const handleNextPage = () => {
    setOffset(prev => prev + PAGE_SIZE);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : null;
  const hasNextPage = totalCount ? offset + PAGE_SIZE < totalCount : groups.length === PAGE_SIZE;

  const renderGroups = () => {
    if (loading) {
      return <div className="loading-row">Loading location groups...</div>;
    }

    if (!groups.length) {
      return (
        <div className="groups-empty">
          <MapPin size={48} />
          <h3>No location groups yet</h3>
          <p>Organize your warehouses by creating regional or functional groups.</p>
          <button type="button" className="outline-btn" onClick={openCreateModal}>
            Create a group
          </button>
        </div>
      );
    }

    return groups.map(group => (
      <div
        key={group.group_id}
        className={`group-list-item${selectedGroup?.group_id === group.group_id ? ' selected' : ''}`}
        onClick={() => setSelectedGroup(group)}
      >
        <div className="group-list-header">
          <div className="group-list-title">
            <span className="group-icon-small">
              <MapPin size={16} />
            </span>
            <h3>{group.group_name}</h3>
          </div>
          <div className="group-list-actions">
            <button
              type="button"
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(group);
              }}
            >
              <Edit2 size={16} />
            </button>
            <button
              type="button"
              className="action-btn danger"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(group.group_id);
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <div className="group-list-meta">
          <span className={`group-state-badge${group.state ? '' : ' neutral'}`}>
            {group.state || 'No region'}
          </span>
          <span className="group-meta-divider">&bull;</span>
          <span className="group-location-count">
            {group.location_count || 0} location{group.location_count === 1 ? '' : 's'}
          </span>
        </div>
        {group.description && (
          <p className="group-list-description">{group.description}</p>
        )}
        <div className="group-list-footer">
          <span className="group-created-date">
            Created {group.created_at ? new Date(group.created_at).toLocaleDateString() : '-'}
          </span>
        </div>
      </div>
    ));
  };

  return (
    <div className="location-groups-page">
      <div className="location-groups-layout">
        <div className="groups-list-panel">
          <div className="list-panel-header">
            <div className="header-top">
              <div className="header-title">
                <h2>Location Groups</h2>
                <p className="header-subtitle">Segment your warehouses and docks by region, purpose, or ownership.</p>
              </div>
              <button type="button" className="add-group-btn" onClick={openCreateModal}>
                <Plus size={18} />
                Add Group
              </button>
            </div>

            <div className="list-controls">
              <div className="search-bar">
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  placeholder="Search by name, description, or state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
          </div>

          <div className="list-body">
            {errorMessage && <div className="error-banner">{errorMessage}</div>}
            {renderGroups()}
          </div>

          {!loading && groups.length > 0 && (
            <div className="list-panel-footer">
              <div className="pagination">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className="page-indicator">
                  Page {currentPage}
                  {totalPages && ` of ${totalPages}`}
                  {totalCount && ` (${totalCount} total)`}
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={handleNextPage}
                  disabled={!hasNextPage}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="modal group-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-group-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="location-group-title">{editingGroup ? 'Edit Location Group' : 'Add Location Group'}</h2>
              <button type="button" className="icon-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <label>
                  Group Name *
                  <input
                    type="text"
                    name="group_name"
                    value={formData.group_name}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g., Southwest Operations"
                  />
                </label>

                <label>
                  Description
                  <textarea
                    name="description"
                    rows="3"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Optional description of this location group"
                  ></textarea>
                </label>

                <label>
                  State / Region
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    placeholder="e.g., Arizona, Northwest"
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="update-btn">
                  {editingGroup ? 'Update Group' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationGroups;
