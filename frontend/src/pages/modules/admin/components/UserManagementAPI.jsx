import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  UserPlus, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  User, 
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../../../shared/contexts/AuthContext';

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const buildApiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!RAW_API_BASE_URL) return normalizedPath;
  if (RAW_API_BASE_URL.endsWith('/api') && normalizedPath.startsWith('/api')) {
    return `${RAW_API_BASE_URL}${normalizedPath.slice(4)}`;
  }
  return `${RAW_API_BASE_URL}${normalizedPath}`;
};

const createEmptyNewUser = () => ({
  name: '',
  email: '',
  username: '',
  company_id: '',
  role: 'user',
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

// Helper component for user avatar with fallback
const UserAvatar = ({ user, className = '' }) => {
  const getInitials = (name) => {
    if (!name) return '';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className={`user-avatar ${className}`}>
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} />
      ) : (
        <div className="avatar-fallback">
          {getInitials(user.name || user.username || user.email)}
        </div>
      )}
    </div>
  );
};

// Status badge component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    active: { label: 'Active', className: 'status-active' },
    inactive: { label: 'Inactive', className: 'status-inactive' },
    pending: { label: 'Pending', className: 'status-pending' },
    unknown: { label: 'Unknown', className: 'status-unknown' },
  };

  const safeStatus = status || 'unknown';
  const config = statusConfig[safeStatus.toLowerCase()] || { label: safeStatus, className: 'status-unknown' };

  return (
    <span className={`status-badge ${config.className}`}>
      {config.label}
    </span>
  );
};

function UserManagementAPI() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'username', direction: 'asc' });
  const [editingUser, setEditingUser] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editFormData, setEditFormData] = useState({
    user_id: '',
    first_name: '',
    last_name: '',
    name: '',
    email: '',
    phone: '',
    username: '',
    role: '',
    status: 'active',
    address_street: '',
    address_line2: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    address_country: 'US'
  });
  const [newUser, setNewUser] = useState(() => createEmptyNewUser());
  const [passwordError, setPasswordError] = useState('');

  const handleUnauthorized = useCallback((message = 'Session expired. Please log in again.') => {
    setToast({
      message,
      type: 'error'
    });
    Promise.resolve(logout())
      .catch(() => {})
      .finally(() => navigate('/login'));
  }, [logout, navigate]);

  const resetNewUserForm = useCallback(() => {
    setPasswordError('');
    setNewUser(createEmptyNewUser());
  }, []);

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

      // Fetch users and roles in parallel
      const [usersResponse, rolesResponse] = await Promise.all([
        fetch(buildApiUrl('/api/admin/users'), { 
          headers,
          credentials: 'include' 
        }),
        fetch(buildApiUrl('/api/admin/roles'), { 
          headers,
          credentials: 'include' 
        })
      ]);

      if ([usersResponse.status, rolesResponse.status].some(status => status === 401 || status === 403)) {
        handleUnauthorized();
        return;
      }

      // Handle users response
      if (!usersResponse.ok) {
        const errorData = await usersResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch users');
      }
      const usersData = await usersResponse.json();
      setUsers(usersData.users || usersData.data || []);

      // Handle roles response
      if (!rolesResponse.ok) {
        const errorData = await rolesResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch roles');
      }
      const rolesData = await rolesResponse.json();
      setRoles(rolesData.roles || rolesData.data || []);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again later.');
      setToast({
        message: 'Failed to load data. Please try again.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch users and roles from API
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const validatePassword = (password) => {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/\d/.test(password)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*]/.test(password)) return 'Password must contain at least one special character';
    return '';
  };

  const handleCreateUser = async (e) => {
    e?.preventDefault();
    
    if (isCreatingUser) return;
    
    // Validate passwords match
    if (newUser.password !== newUser.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    
    if (newUser.password.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }
    
    setPasswordError('');
    setIsCreatingUser(true);
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        handleUnauthorized('Please log in to create users.');
        return;
      }
      const response = await fetch(buildApiUrl('/api/admin/users'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
          password: newUser.password,
          role: newUser.role,
          status: newUser.status,
          // Include address fields if needed
          address_street: newUser.address_street || '',
          address_line2: newUser.address_line2 || '',
          address_city: newUser.address_city || '',
          address_state: newUser.address_state || '',
          address_zip: newUser.address_zip || '',
          address_country: newUser.address_country || 'US'
        })
      });
      
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized('Please log in to create users.');
        return;
      }

      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create user');
      }
      
      // Refresh users list
      await fetchData();
      
      // Close modal and reset form
      setShowAddUser(false);
      resetNewUserForm();
      
      setToast({
        message: data.message || 'User created successfully',
        type: 'success'
      });
      
    } catch (error) {
      console.error('Error creating user:', error);
      setToast({
        message: error.message || 'Failed to create user. Please check the form and try again.',
        type: 'error',
        autoClose: 5000
      });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    
    return users
      .filter(user => {
        const searchLower = searchTerm.toLowerCase();
        const username = (user.username || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
        const matchesSearch =
          !searchLower ||
          username.includes(searchLower) ||
          email.includes(searchLower) ||
          fullName.includes(searchLower);
        
        // Normalize role list to strings before comparing
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
        
        const matchesCompany = companyFilter === 'all' || 
          (user.company_id && user.company_id.toString() === companyFilter);
        
        return matchesSearch && matchesRole && matchesCompany;
      })
      .sort((a, b) => {
        if (!sortConfig?.key) return 0;
        
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        // Handle nested properties like address fields
        if (sortConfig.key.includes('.')) {
          const keys = sortConfig.key.split('.');
          aValue = keys.reduce((obj, key) => obj?.[key], a);
          bValue = keys.reduce((obj, key) => obj?.[key], b);
        }
        
        // Handle undefined/null values
        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        
        // Convert to string for comparison if needed
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        
        if (sortConfig.direction === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
  }, [users, searchTerm, roleFilter, companyFilter, sortConfig]);

  // Pagination
  const indexOfLastUser = currentPage * itemsPerPage;
  const indexOfFirstUser = indexOfLastUser - itemsPerPage;
  const currentUsers = Array.isArray(filteredUsers) 
    ? filteredUsers.slice(indexOfFirstUser, indexOfLastUser)
    : [];
  const totalPages = Math.max(1, Math.ceil((filteredUsers?.length || 0) / itemsPerPage));

  // Handle sort
  const handleSort = (key) => {
    setSortConfig(prev => {
      // If clicking the same column, toggle direction
      if (prev.key === key) {
        return { 
          key, 
          direction: prev.direction === 'asc' ? 'desc' : 'asc' 
        };
      }
      // If clicking a different column, default to ascending
      return { key, direction: 'asc' };
    });
  };

  // Handle row selection
  const handleSelectRow = (userId) => {
    setSelectedRows(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedRows.length === currentUsers.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(currentUsers.map(user => user.user_id));
    }
  };

  // Handle edit user
  const handleEditUser = (user) => {
    console.log('📝 Editing user:', user);
    console.log('📝 User role:', user.role);
    console.log('📝 User roles array:', user.roles);
    
    setEditingUser(user);
    
    // Get the role - backend may return role string or array of objects
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
    console.log('📝 Setting role to:', userRole);
    
    setEditFormData({
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
      address_country: user.address?.country || user.address_country || 'US'
    });
  };

  // Handle save edit
  const handleSaveEdit = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        handleUnauthorized('Please log in to update users.');
        return;
      }
      const response = await fetch(buildApiUrl(`/api/admin/users/${editFormData.user_id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          first_name: editFormData.first_name,
          last_name: editFormData.last_name,
          email: editFormData.email,
          phone: editFormData.phone || '',
          username: editFormData.username,
          status: editFormData.status,
          is_active: editFormData.status === 'active' ? 1 : 0,
          role: editFormData.role,
          // Send in database schema format
          address_line1: editFormData.address_street || '',
          address_line2: editFormData.address_line2 || '',
          city: editFormData.address_city || '',
          state: editFormData.address_state || '',
          postal_code: editFormData.address_zip || '',
          country: editFormData.address_country || 'US'
        })
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized('Please log in to update users.');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.msg || errorData.message || 'Failed to update user');
      }

      // Get the complete updated data from the response
      const updatedData = await response.json().catch(() => ({}));
      
      // Update the users array with the complete response data
      setUsers(prev => prev.map(u => 
        u.user_id === editFormData.user_id ? {
          ...u,
          ...updatedData,
          // Ensure we have the correct role format
          role: updatedData.roles?.[0] || updatedData.role || editFormData.role,
          roles: updatedData.roles || (updatedData.role ? [updatedData.role] : []),
          // Ensure status is set correctly
          status: updatedData.status || (updatedData.is_active ? 'active' : 'inactive'),
          is_active: updatedData.is_active
        } : u
      ));
      
      setToast({ 
        message: 'User updated successfully', 
        type: 'success' 
      });
      setEditingUser(null);
      
      // Clear the form
      setEditFormData({
        user_id: '',
        first_name: '',
        last_name: '',
        name: '',
        email: '',
        phone: '',
        username: '',
        role: '',
        status: 'active',
        address_street: '',
        address_line2: '',
        address_city: '',
        address_state: '',
        address_zip: '',
        address_country: 'US'
      });
    } catch (error) {
      console.error('Error updating user:', error);
      setToast({
        message: error.message || 'Failed to update user. Please check the form and try again.',
        type: 'error',
        autoClose: 5000
      });
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditFormData({
      user_id: '',
      first_name: '',
      last_name: '',
      name: '',
      email: '',
      phone: '',
      username: '',
      role: '',
      status: 'active',
      address_street: '',
      address_line2: '',
      address_city: '',
      address_state: '',
      address_zip: '',
      address_country: 'US'
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>User Management</h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Manage all users across the platform.</p>
        </div>
        <button 
          onClick={() => setShowAddUser(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem'
          }}
        >
          <UserPlus size={18} />
          <span>Add User</span>
        </button>
      </div>

      {/* Filters */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '16px', 
        borderRadius: '12px', 
        marginBottom: '24px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 40px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '0.875rem'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Filter size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', zIndex: 1 }} />
            <select 
              value={roleFilter} 
              onChange={e => setRoleFilter(e.target.value)}
              style={{
                padding: '8px 32px 8px 36px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                appearance: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Roles</option>
              {roles.map(r => <option key={r.role_id} value={r.role_name}>{r.role_name}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
          
          <div style={{ position: 'relative' }}>
            <select 
              value={companyFilter} 
              onChange={e => setCompanyFilter(e.target.value)}
              style={{
                padding: '8px 32px 8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                appearance: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Companies</option>
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedRows.length === currentUsers.length && currentUsers.length > 0}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                    <span onClick={() => handleSort('username')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      USER
                      {sortConfig.key === 'username' && (
                        <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </div>
                </th>
                <th onClick={() => handleSort('roles')} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ROLE
                    {sortConfig.key === 'roles' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  STATUS
                </th>
                <th onClick={() => handleSort('last_login')} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    LAST LOGIN
                    {sortConfig.key === 'last_login' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: '48px', textAlign: 'center' }}>
                    <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto', color: '#3b82f6' }} />
                    <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading users...</p>
                  </td>
                </tr>
              ) : currentUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '48px', textAlign: 'center' }}>
                    <User size={48} style={{ margin: '0 auto', color: '#d1d5db' }} />
                    <h3 style={{ marginTop: '12px', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>No users found</h3>
                    <p style={{ marginTop: '4px', color: '#6b7280', fontSize: '0.875rem' }}>Try adjusting your search or filter to find what you're looking for.</p>
                  </td>
                </tr>
              ) : (
                currentUsers.map(user => (
                  <tr key={user.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedRows.includes(user.user_id)}
                          onChange={() => handleSelectRow(user.user_id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          backgroundColor: '#e0e7ff', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontWeight: 600,
                          color: '#4f46e5',
                          fontSize: '0.875rem'
                        }}>
                          {(user.username||user.email||'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem' }}>
                            {user.username || user.email}
                          </div>
                          <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                        {Array.isArray(user.roles) 
                          ? user.roles
                              .map(role => {
                                if (typeof role === 'string') return role;
                                if (role && typeof role === 'object') {
                                  return role.role_name || role.name || role.code || '';
                                }
                                return '';
                              })
                              .filter(Boolean)
                              .join(', ')
                          : (typeof user.role === 'string'
                              ? user.role
                              : (user.is_super_admin ? 'Super Admin' : 'User'))}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <StatusBadge status={user.status || (user.is_active ? 'active' : 'inactive')} />
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {user.last_login || user.lastLogin 
                          ? new Date(user.last_login || user.lastLogin).toLocaleDateString() 
                          : 'Never'}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleEditUser(user)}
                          style={{
                            padding: '6px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Edit"
                        >
                          <Edit2 size={16} color="#6b7280" />
                        </button>
                        <button 
                          style={{
                            padding: '6px',
                            border: '1px solid #fee2e2',
                            borderRadius: '6px',
                            backgroundColor: '#fef2f2',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Delete"
                        >
                          <Trash2 size={16} color="#dc2626" />
                        </button>
                        <button 
                          style={{
                            padding: '6px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <MoreVertical size={16} color="#6b7280" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && filteredUsers.length > 0 && (
          <div style={{ 
            padding: '16px', 
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Showing <span style={{ fontWeight: 500, color: '#111827' }}>{Math.min((currentPage - 1) * itemsPerPage + 1, filteredUsers.length)}</span> to{' '}
              <span style={{ fontWeight: 500, color: '#111827' }}>{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of{' '}
              <span style={{ fontWeight: 500, color: '#111827' }}>{filteredUsers.length}</span> results
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button 
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  padding: '6px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: currentPage === 1 ? '#f9fafb' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronsLeft size={16} color={currentPage === 1 ? '#d1d5db' : '#6b7280'} />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: currentPage === 1 ? '#f9fafb' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronLeft size={16} color={currentPage === 1 ? '#d1d5db' : '#6b7280'} />
              </button>
              <span style={{ padding: '0 12px', fontSize: '0.875rem', color: '#374151' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: currentPage === totalPages ? '#f9fafb' : 'white',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronRight size={16} color={currentPage === totalPages ? '#d1d5db' : '#6b7280'} />
              </button>
              <button 
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: currentPage === totalPages ? '#f9fafb' : 'white',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronsRight size={16} color={currentPage === totalPages ? '#d1d5db' : '#6b7280'} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div style={{
          position:'fixed',
          inset:0,
          background:'rgba(0,0,0,0.5)',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          zIndex: 9999
        }}>
          <div style={{
            background:'#fff',
            padding: '24px',
            borderRadius: '12px',
            minWidth: '400px',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1.25rem', fontWeight: 600 }}>Add User</h3>
            <div style={{display:'grid', gap: '16px'}}>
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Email</label>
                <input 
                  value={newUser.email} 
                  onChange={e => setNewUser(prev => ({...prev, email: e.target.value}))} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Username</label>
                <input 
                  value={newUser.username} 
                  onChange={e => setNewUser(prev => ({...prev, username: e.target.value}))} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="username"
                />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Company ID</label>
                <input 
                  value={newUser.company_id} 
                  onChange={e => setNewUser(prev => ({...prev, company_id: e.target.value}))} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="Company ID"
                />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Password</label>
                <input 
                  type="password" 
                  value={newUser.password} 
                  onChange={e => {
                    setPasswordError('');
                    setNewUser(prev => ({...prev, password: e.target.value}));
                  }} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Confirm Password</label>
                <input 
                  type="password" 
                  value={newUser.confirmPassword} 
                  onChange={e => {
                    setPasswordError('');
                    setNewUser(prev => ({...prev, confirmPassword: e.target.value}));
                  }} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="Re-enter password"
                />
              </div>
              {passwordError && (
                <div style={{color: '#dc2626', fontSize: '0.875rem', marginTop: '4px'}}>
                  {passwordError}
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:'12px',marginTop:'24px',justifyContent:'flex-end'}}>
              <button 
                onClick={() => {
                  setShowAddUser(false);
                  resetNewUserForm();
                }}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateUser}
                disabled={
                  isCreatingUser ||
                  !newUser.email || 
                  !newUser.username || 
                  !newUser.password || 
                  !newUser.confirmPassword || 
                  passwordError
                }
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: (
                    isCreatingUser ||
                    !newUser.email || 
                    !newUser.username || 
                    !newUser.password || 
                    !newUser.confirmPassword || 
                    passwordError
                  ) ? '#d1d5db' : '#3b82f6',
                  color: 'white',
                  cursor: (
                    isCreatingUser ||
                    !newUser.email || 
                    !newUser.username || 
                    !newUser.password || 
                    !newUser.confirmPassword || 
                    passwordError
                  ) ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                {isCreatingUser ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit User Modal */}
      {editingUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            padding: '24px',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            position: 'relative'
          }}>
            <h3 style={{marginBottom: '20px', fontSize: '1.25rem', fontWeight: 600, color: '#111827'}}>Edit User</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                <div>
                  <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>First Name</label>
                  <input 
                    value={editFormData.first_name || ''} 
                    onChange={e => setEditFormData(prev => ({...prev, first_name: e.target.value}))} 
                    style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Last Name</label>
                  <input 
                    value={editFormData.last_name || ''} 
                    onChange={e => setEditFormData(prev => ({...prev, last_name: e.target.value}))} 
                    style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                    placeholder="Enter last name"
                  />
                </div>
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Email</label>
                <input 
                  type="email"
                  value={editFormData.email || ''} 
                  onChange={e => setEditFormData(prev => ({...prev, email: e.target.value}))} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="email@example.com"
                />
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Phone</label>
                <input 
                  type="tel"
                  value={editFormData.phone || ''} 
                  onChange={e => setEditFormData(prev => ({...prev, phone: e.target.value}))} 
                  placeholder="+1 (555) 123-4567"
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                />
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Username</label>
                <input 
                  value={editFormData.username || ''} 
                  onChange={e => setEditFormData(prev => ({...prev, username: e.target.value}))} 
                  style={{width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px'}}
                  placeholder="Enter username"
                />
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151'}}>Role</label>
                <div style={{ position: 'relative' }}>
                  <div 
                    onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      minHeight: '40px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: '2px' }}>
                        {editFormData.role || 'Select a role...'}
                      </div>
                      {editFormData.role && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {roles.find(r => r.role_name === editFormData.role)?.description || ''}
                        </div>
                      )}
                    </div>
                    <ChevronDown 
                      size={16} 
                      style={{
                        color: '#6b7280',
                        transition: 'transform 0.2s',
                        transform: showRoleDropdown ? 'rotate(180deg)' : 'none'
                      }}
                    />
                  </div>
                  
                  {showRoleDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      maxHeight: '300px',
                      overflowY: 'auto',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                      zIndex: 10
                    }}>
                      {roles.map(role => (
                        <div
                          key={role.role_id}
                          onClick={() => {
                            setEditFormData(prev => ({
                              ...prev, 
                              role: role.role_name,
                              role_id: role.role_id
                            }));
                            setShowRoleDropdown(false);
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            backgroundColor: editFormData.role === role.role_name ? '#f3f4f6' : 'white',
                            borderBottom: '1px solid #f9fafb'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = editFormData.role === role.role_name ? '#f3f4f6' : 'white'}
                        >
                          <div style={{ 
                            fontWeight: 500,
                            color: editFormData.role === role.role_name ? '#3b82f6' : '#111827',
                            marginBottom: '2px'
                          }}>
                            {role.role_name}
                          </div>
                          {role.description && (
                            <div style={{ 
                              fontSize: '0.75rem',
                              color: '#6b7280'
                            }}>
                              {role.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Address Section */}
              <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <h4 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Address Information</h4>
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Street Address</label>
                      <input 
                        value={editFormData.address_street || ''}
                        onChange={e => setEditFormData(prev => ({...prev, address_street: e.target.value}))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                        placeholder="123 Main St"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Apt, Suite, etc.</label>
                      <input 
                        value={editFormData.address_line2 || ''}
                        onChange={e => setEditFormData(prev => ({...prev, address_line2: e.target.value}))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                        placeholder="Apt 4B"
                      />
                    </div>
                  </div>
                
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>City</label>
                      <input 
                        value={editFormData.address_city || ''}
                        onChange={e => setEditFormData(prev => ({...prev, address_city: e.target.value}))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                        placeholder="New York"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>State</label>
                      <select 
                        value={editFormData.address_state || ''}
                        onChange={e => setEditFormData(prev => ({...prev, address_state: e.target.value}))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      >
                        <option value="">Select</option>
                        <option value="AL">AL</option>
                        <option value="AK">AK</option>
                        <option value="AZ">AZ</option>
                        <option value="CA">CA</option>
                        <option value="NY">NY</option>
                        <option value="TX">TX</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>ZIP</label>
                      <input 
                        value={editFormData.address_zip || ''}
                        onChange={e => setEditFormData(prev => ({...prev, address_zip: e.target.value}))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                        placeholder="10001"
                      />
                    </div>
                  </div>
                
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Country</label>
                    <select 
                      value={editFormData.address_country || 'US'}
                      onChange={e => setEditFormData(prev => ({...prev, address_country: e.target.value}))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="MX">Mexico</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Status</label>
                <select 
                  value={editFormData.status} 
                  onChange={e => setEditFormData(prev => ({...prev, status: e.target.value}))} 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:'12px',marginTop:'24px',justifyContent:'flex-end', paddingTop: '16px', borderTop: '1px solid #e5e7eb'}}>
              <button 
                onClick={handleCancelEdit}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast */}
      {toast.message && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 20px',
          backgroundColor: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          fontSize: '0.875rem',
          fontWeight: 500,
          zIndex: 10000
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// Add CSS for status badges
const style = document.createElement('style');
style.textContent = `
  .status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    display: inline-block;
  }
  .status-active {
    background-color: #d1fae5;
    color: #065f46;
  }
  .status-inactive {
    background-color: #fee2e2;
    color: #991b1b;
  }
  .status-pending {
    background-color: #fef3c7;
    color: #92400e;
  }
  .status-unknown {
    background-color: #e5e7eb;
    color: #374151;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

export default UserManagementAPI;
