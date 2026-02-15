import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Edit, X, Save, User, Loader, MoreVertical, Key } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import './Users.css';

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const buildApiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!RAW_API_BASE_URL) return normalizedPath;
  if (RAW_API_BASE_URL.endsWith('/api') && normalizedPath.startsWith('/api')) {
    return `${RAW_API_BASE_URL}${normalizedPath.slice(4)}`;
  }
  return `${RAW_API_BASE_URL}${normalizedPath}`;
};

const createEmptyUser = () => ({
  name: '',
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  phone: '',
  role: '',
  status: 'active',
  password: '',
  confirmPassword: '',
  address_street: '',
  address_line2: '',
  address_city: '',
  address_state: '',
  address_zip: '',
  address_country: 'US'
});

// Status badge component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    active: { label: 'Active', className: 'status-active' },
    inactive: { label: 'Inactive', className: 'status-inactive' },
    pending: { label: 'Pending', className: 'status-pending' },
  };

  const safeStatus = status || 'inactive';
  const config = statusConfig[safeStatus.toLowerCase()] || statusConfig.inactive;

  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
};

function Users() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedUser, setSelectedUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [creatingUser, setCreatingUser] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [form, setForm] = useState(createEmptyUser());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [showActionsMenu, setShowActionsMenu] = useState(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const modalOpen = Boolean(creatingUser || editingUser || (showPasswordReset && selectedUser));

  const handleUnauthorized = useCallback((message = 'Session expired. Please log in again.') => {
    Promise.resolve(logout())
      .catch(() => {})
      .finally(() => navigate('/login'));
  }, [logout, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        handleUnauthorized('Please log in to view users.');
        return;
      }
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const [usersResponse, rolesResponse] = await Promise.all([
        fetch(buildApiUrl('/api/admin/users'), { headers, credentials: 'include' }),
        fetch(buildApiUrl('/api/admin/roles'), { headers, credentials: 'include' })
      ]);

      if ([usersResponse.status, rolesResponse.status].some(status => status === 401 || status === 403)) {
        handleUnauthorized();
        return;
      }

      if (!usersResponse.ok) {
        const errorData = await usersResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch users');
      }
      const usersData = await usersResponse.json();
      setUsers(usersData.users || usersData.data || []);

      if (!rolesResponse.ok) {
        const errorData = await rolesResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch roles');
      }
      const rolesData = await rolesResponse.json();
      setRoles(rolesData.roles || rolesData.data || []);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (modalOpen) {
      document.body.classList.add('admin-modal-open');
    } else {
      document.body.classList.remove('admin-modal-open');
    }
    return () => document.body.classList.remove('admin-modal-open');
  }, [modalOpen]);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];

    return users.filter(user => {
      const searchLower = searchTerm.toLowerCase();
      const username = (user.username || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
      const matchesSearch =
        !searchLower ||
        username.includes(searchLower) ||
        email.includes(searchLower) ||
        fullName.includes(searchLower);

      const rawRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
      const userRoles = rawRoles
        .map(role => {
          if (typeof role === 'string') return role;
          if (role && typeof role === 'object') {
            return role.role_name || role.name || role.code || '';
          }
          return '';
        })
        .filter(Boolean);
      const matchesRole = roleFilter === 'all' ||
        userRoles.some(role => role.toLowerCase() === roleFilter.toLowerCase());

      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Pagination helpers
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const handleSelectUser = (user) => {
    if (selectedUser?.user_id === user.user_id) {
      setSelectedUser(null);
      setEditingUser(null);
      setCreatingUser(false);
      setForm(createEmptyUser());
    } else {
      setSelectedUser(user);
      setEditingUser(null);
      setCreatingUser(false);
    }
  };

  const handleEditUser = (user) => {
    const userRole = (() => {
      if (typeof user.role === 'string') return user.role;
      if (Array.isArray(user.roles) && user.roles.length > 0) {
        const primaryRole = user.roles[0];
        if (typeof primaryRole === 'string') return primaryRole;
        if (primaryRole && typeof primaryRole === 'object') {
          return primaryRole.role_name || primaryRole.name || primaryRole.code || '';
        }
      }
      return '';
    })();

    setEditingUser(user);
    setSelectedUser(user);
    setCreatingUser(false);
    setForm({
      user_id: user.user_id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' '),
      email: user.email || '',
      phone: user.phone || '',
      username: user.username || '',
      role: userRole,
      status: user.status || (user.is_active ? 'active' : 'inactive'),
      address_street: user.address?.street || user.address_street || '',
      address_line2: user.address?.line2 || user.address_line2 || '',
      address_city: user.address?.city || user.address_city || '',
      address_state: user.address?.state || user.address_state || '',
      address_zip: user.address?.zip || user.address_zip || '',
      address_country: user.address?.country || user.address_country || 'US',
      password: '',
      confirmPassword: ''
    });
  };

  const handleCreateUser = () => {
    setCreatingUser(true);
    setEditingUser(null);
    setSelectedUser(null);
    setForm(createEmptyUser());
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setCreatingUser(false);
    setForm(createEmptyUser());
    setFormError('');
  };

  const handlePasswordReset = (user) => {
    setShowPasswordReset(true);
    setSelectedUser(user);
    setResetPassword('');
    setResetConfirmPassword('');
    setResetError('');
    setShowActionsMenu(null);
  };

  const handleCancelPasswordReset = () => {
    setShowPasswordReset(false);
    setResetPassword('');
    setResetConfirmPassword('');
    setResetError('');
  };

  const handleSubmitPasswordReset = async (e) => {
    e.preventDefault();
    if (resetting) return;

    // Validation
    if (!resetPassword || !resetConfirmPassword) {
      setResetError('Both password fields are required');
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }

    setResetError('');
    setResetting(true);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        handleUnauthorized('Please log in to reset passwords.');
        return;
      }

      const response = await fetch(buildApiUrl(`/api/admin/users/${selectedUser.user_id}/reset-password`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ password: resetPassword })
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized('Please log in to reset passwords.');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.msg || errorData.message || 'Failed to reset password');
      }

      // Success - close modal
      setShowPasswordReset(false);
      setResetPassword('');
      setResetConfirmPassword('');
      setResetError('');

    } catch (error) {
      console.error('Error resetting password:', error);
      setResetError(error.message || 'Failed to reset password. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    // Validation
    if (!form.email || !form.username) {
      setFormError('Email and username are required');
      return;
    }

    if (creatingUser && (!form.password || !form.confirmPassword)) {
      setFormError('Password is required for new users');
      return;
    }

    if (form.password && form.password !== form.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (creatingUser && form.password && form.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    setFormError('');
    setSaving(true);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        handleUnauthorized('Please log in to save changes.');
        return;
      }

      const url = editingUser
        ? buildApiUrl(`/api/admin/users/${editingUser.user_id}`)
        : buildApiUrl('/api/admin/users');

      const method = editingUser ? 'PUT' : 'POST';

      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || '',
        username: form.username,
        status: form.status,
        is_active: form.status === 'active' ? 1 : 0,
        role: form.role,
        address_line1: form.address_street || '',
        address_line2: form.address_line2 || '',
        city: form.address_city || '',
        state: form.address_state || '',
        postal_code: form.address_zip || '',
        country: form.address_country || 'US'
      };

      if (creatingUser) {
        payload.password = form.password;
        payload.name = form.name || `${form.first_name} ${form.last_name}`.trim();
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized('Please log in to save changes.');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.msg || errorData.message || 'Failed to save user');
      }

      // Refresh data
      await fetchData();

      // Close form
      setEditingUser(null);
      setCreatingUser(false);
      setSelectedUser(null);
      setForm(createEmptyUser());

    } catch (error) {
      console.error('Error saving user:', error);
      setFormError(error.message || 'Failed to save user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const getUserRole = (user) => {
    if (Array.isArray(user.roles)) {
      return user.roles
        .map(role => {
          if (typeof role === 'string') return role;
          if (role && typeof role === 'object') {
            return role.role_name || role.name || role.code || '';
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }
    return typeof user.role === 'string' ? user.role : (user.is_super_admin ? 'Super Admin' : 'User');
  };

  const renderModal = (node) => {
    if (typeof document === 'undefined') return null;
    return createPortal(node, document.body);
  };

  return (
    <div className="users-layout">
      {/* Header */}
      <div className="users-header">
        <div>
          <h1>User Management</h1>
          <p className="subtitle">Manage all users across the platform</p>
        </div>
        <div className="users-header-actions">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="role-filter" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            {roles.map(r => <option key={r.role_id} value={r.role_name}>{r.role_name}</option>)}
          </select>
          <button className="btn-primary" onClick={handleCreateUser}>
            <UserPlus size={18} />
            <span>New User</span>
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Content */}
      <div className="users-table-container">
        {loading ? (
          <div className="loading-state">
            <Loader size={24} className="spinner" />
            <p>Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <User size={48} />
            <h3>No users found</h3>
            <p>Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="users-table-wrapper">
            <div className="users-table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map(user => (
                    <tr key={user.user_id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar-small">
                            {(user.username || user.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="username-text">{user.username || '-'}</span>
                        </div>
                      </td>
                      <td>{user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '-'}</td>
                      <td className="email-cell">{user.email || '-'}</td>
                      <td className="company-cell">{user.company_name || '-'}</td>
                      <td>
                        <span className="role-chip">{getUserRole(user)}</span>
                      </td>
                      <td><StatusBadge status={user.status || (user.is_active ? 'active' : 'inactive')} /></td>
                      <td className="actions-column">
                        <div className="table-actions">
                          <button
                            className="btn-icon-small"
                            onClick={() => handleEditUser(user)}
                            title="Edit user"
                          >
                            <Edit size={16} />
                          </button>
                          <div className="actions-menu-container">
                            <button
                              className="btn-icon-small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowActionsMenu(showActionsMenu === user.user_id ? null : user.user_id);
                              }}
                              title="More actions"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {showActionsMenu === user.user_id && (
                              <div className="actions-menu">
                                <button onClick={() => handlePasswordReset(user)}>
                                  <Key size={16} />
                                  Reset Password
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="users-pagination">
              <div className="page-info">
                Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                {' - '}
                {Math.min(currentPage * pageSize, filteredUsers.length)} of {filteredUsers.length} users
              </div>
              <div className="page-controls">
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>
                <span className="page-number">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      {(creatingUser || editingUser) && renderModal(
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              <div className="modal-header">
                <h2>{creatingUser ? 'New User' : 'Edit User'}</h2>
                <button type="button" className="btn-icon" onClick={handleCancelEdit}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                {formError && <div className="form-error">{formError}</div>}

                <div className="detail-section">
                  <h3>User Information</h3>
                  <div className="form-grid">
                    <label className="span-2">
                      Email *
                      <input
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={change}
                        placeholder="user@example.com"
                        required
                      />
                    </label>
                    <label className="span-2">
                      Username *
                      <input
                        name="username"
                        value={form.username}
                        onChange={change}
                        placeholder="username"
                        required
                      />
                    </label>
                    <label>
                      First Name
                      <input
                        name="first_name"
                        value={form.first_name}
                        onChange={change}
                        placeholder="John"
                      />
                    </label>
                    <label>
                      Last Name
                      <input
                        name="last_name"
                        value={form.last_name}
                        onChange={change}
                        placeholder="Doe"
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        name="phone"
                        type="tel"
                        value={form.phone}
                        onChange={change}
                        placeholder="+1 (555) 123-4567"
                      />
                    </label>
                    <label>
                      Role
                      <select name="role" value={form.role} onChange={change}>
                        <option value="">Select role</option>
                        {roles.map(r => (
                          <option key={r.role_id} value={r.role_name}>{r.role_name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status
                      <select name="status" value={form.status} onChange={change}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="pending">Pending</option>
                      </select>
                    </label>
                  </div>
                </div>

                {creatingUser && (
                  <div className="detail-section">
                    <h3>Password</h3>
                    <div className="form-grid">
                      <label>
                        Password *
                        <input
                          name="password"
                          type="password"
                          value={form.password}
                          onChange={change}
                          placeholder="At least 8 characters"
                          required={creatingUser}
                        />
                      </label>
                      <label>
                        Confirm Password *
                        <input
                          name="confirmPassword"
                          type="password"
                          value={form.confirmPassword}
                          onChange={change}
                          placeholder="Re-enter password"
                          required={creatingUser}
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="detail-section">
                  <h3>Address</h3>
                  <div className="form-grid">
                    <label className="span-2">
                      Street Address
                      <input
                        name="address_street"
                        value={form.address_street}
                        onChange={change}
                        placeholder="123 Main St"
                      />
                    </label>
                    <label className="span-2">
                      Apt, Suite, etc.
                      <input
                        name="address_line2"
                        value={form.address_line2}
                        onChange={change}
                        placeholder="Apt 4B"
                      />
                    </label>
                    <label>
                      City
                      <input
                        name="address_city"
                        value={form.address_city}
                        onChange={change}
                        placeholder="New York"
                      />
                    </label>
                    <label>
                      State
                      <input
                        name="address_state"
                        value={form.address_state}
                        onChange={change}
                        placeholder="NY"
                      />
                    </label>
                    <label>
                      ZIP
                      <input
                        name="address_zip"
                        value={form.address_zip}
                        onChange={change}
                        placeholder="10001"
                      />
                    </label>
                    <label>
                      Country
                      <select name="address_country" value={form.address_country} onChange={change}>
                        <option value="US">United States</option>
                        <option value="CA">Canada</option>
                        <option value="MX">Mexico</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={handleCancelEdit}>
                  <X size={16} />
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <Save size={16} />
                  {saving ? 'Saving...' : creatingUser ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && selectedUser && renderModal(
        <div className="modal-overlay" onClick={handleCancelPasswordReset}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reset Password</h2>
              <button className="btn-icon" onClick={handleCancelPasswordReset}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitPasswordReset}>
              <div className="modal-body">
                <p className="modal-description">
                  Reset password for <strong>{selectedUser.username || selectedUser.email}</strong>
                </p>

                {resetError && <div className="form-error">{resetError}</div>}

                <div className="form-grid">
                  <label className="span-2">
                    New Password *
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                    />
                  </label>
                  <label className="span-2">
                    Confirm Password *
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={handleCancelPasswordReset}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={resetting}>
                  <Key size={16} />
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
