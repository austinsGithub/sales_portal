import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, MapPin } from 'lucide-react';
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

const LocationGroups = () => {
  const [groups, setGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const response = await axios.get(buildApiUrl('/api/inventory/location-groups'), {
        params: {
          q: searchQuery || undefined,
          withCount: 'true'
        }
      });
      setGroups(response.data || []);
    } catch (error) {
      console.error('Error fetching location groups:', error);
      setErrorMessage('Unable to load location groups. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

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

    return (
      <div className="groups-grid">
        {groups.map(group => (
          <article className="group-card" key={group.group_id}>
            <div className="group-card-header">
              <div>
                <h3>{group.group_name}</h3>
                {group.state && <span className="group-badge">{group.state}</span>}
              </div>
              <div className="group-card-actions">
                <button type="button" className="ghost-btn" onClick={() => handleEdit(group)}>
                  <Edit2 size={16} />
                  Edit
                </button>
                <button type="button" className="ghost-btn danger" onClick={() => handleDelete(group.group_id)}>
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>

            {group.description && (
              <p className="group-description">{group.description}</p>
            )}

            <div className="group-stats">
              <div className="group-stat">
                <MapPin size={16} />
                <span>
                  {group.location_count || 0} location{group.location_count === 1 ? '' : 's'}
                </span>
              </div>
              <span className="group-created">
                Created {group.created_at ? new Date(group.created_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className="location-groups-page">
      <header className="groups-header">
        <div>
          <h1>Location Groups</h1>
          <p>Segment your warehouses and docks by region, purpose, or ownership.</p>
        </div>
        <button type="button" className="primary-btn" onClick={openCreateModal}>
          <Plus size={18} />
          Add Location Group
        </button>
      </header>

      <div className="groups-toolbar">
        <div className="group-search">
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

      {errorMessage && <div className="error-banner">{errorMessage}</div>}

      {renderGroups()}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal group-modal">
            <div className="modal-header">
              <h2>{editingGroup ? 'Edit Location Group' : 'Add Location Group'}</h2>
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
