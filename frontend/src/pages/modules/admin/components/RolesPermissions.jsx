import React, { useEffect, useState, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Package,
  Plus,
  X,
} from "lucide-react";
import Toast from "../../../../shared/components/Toast.jsx";
import "../../../../css/modules/admin/AdminSettings.css";
import "../../../../css/modules/admin/Toast.css";

function RolesPermissions() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedModules, setExpandedModules] = useState({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRole, setNewRole] = useState({
    role_name: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState({});

  // Custom checkbox component that supports indeterminate state
  const IndeterminateCheckbox = ({ checked, indeterminate, ...rest }) => {
    const ref = useRef(null);

    useEffect(() => {
      if (ref.current) {
        ref.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    return (
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        {...rest}
        style={{ marginRight: 10, cursor: 'pointer', transform: 'scale(1.1)' }}
      />
    );
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        
        // Load roles and permissions in parallel
        const [rolesRes, permsRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/roles`, { 
            headers,
            credentials: 'include' // Include cookies for session
          }),
          fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/permissions`, {
            headers,
            credentials: 'include'
          })
        ]);

        if (!rolesRes.ok) throw new Error('Failed to load roles');
        if (!permsRes.ok) throw new Error('Failed to load permissions');

        const rolesData = await rolesRes.json();
        const permsData = await permsRes.json();

        if (rolesData.success) setRoles(rolesData.roles || []);
        if (permsData.success) setPermissions(permsData.permissions || []);
      } catch (e) {
        console.error("RolesPermissions load error", e);
        setToast({ message: 'Failed to load data. Please try again.', type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    load();
  }, []);

  useEffect(() => {
    if (!selectedRole) return;
    
    const loadRolePerms = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/admin/roles/${selectedRole.role_id}/permissions`,
          { 
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          }
        );
        
        if (!res.ok) throw new Error('Failed to load role permissions');
        
        const data = await res.json();
        
        if (data.success) {
          setRolePermissions(new Set(data.permissions || []));
        } else {
          throw new Error(data.message || 'Failed to load role permissions');
        }
      } catch (e) {
        console.error('Error loading role permissions:', e);
        setToast({ 
          message: 'Failed to load role permissions. Please try again.', 
          type: 'error' 
        });
      }
    };
    
    loadRolePerms();
  }, [selectedRole]);

  const toggleRolePermission = async (roleId, permissionId, assigned) => {
    const oldPermissions = new Set(rolePermissions);
    
    try {
      const token = localStorage.getItem("auth_token");
      const endpoint = assigned ? "remove" : "assign";
      
      // Optimistic UI update
      setRolePermissions(prev => {
        const newSet = new Set(prev);
        if (assigned) {
          newSet.delete(permissionId);
        } else {
          newSet.add(permissionId);
        }
        return newSet;
      });
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/admin/role_permissions/${endpoint}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: 'include',
          body: JSON.stringify({ 
            role_id: roleId, 
            permission_id: permissionId 
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to ${endpoint} permission`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || `Failed to ${endpoint} permission`);
      }
      
      // Update with fresh data from server
      const permsRes = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/admin/roles/${roleId}/permissions`,
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        }
      );
      
      if (permsRes.ok) {
        const permsData = await permsRes.json();
        if (permsData.success) {
          setRolePermissions(new Set(permsData.permissions || []));
        }
      }
      
      setToast({
        message: `Permission ${assigned ? 'removed from' : 'assigned to'} role successfully`,
        type: 'success'
      });
      
    } catch (e) {
      console.error("toggleRolePermission error", e);
      // Revert on error
      setRolePermissions(oldPermissions);
      setToast({
        message: `Failed to update permission: ${e.message}`,
        type: 'error'
      });
    }
  };

  const groupByModule = (perms) => {
    const grouped = {};
    perms.forEach((p) => {
      const mod = p.module_name || "Misc";
      const sub = p.submodule_name || "General";
      grouped[mod] = grouped[mod] || {};
      grouped[mod][sub] = grouped[mod][sub] || [];
      grouped[mod][sub].push(p);
    });
    return grouped;
  };

  const toggleSubmodule = async (roleId, moduleName, submoduleName, assign) => {
    const token = localStorage.getItem("auth_token");
    const permsToToggle = permissions.filter(
      (p) => p.module_name === moduleName && p.submodule_name === submoduleName
    );
    const permIdsToToggle = permsToToggle.map(p => p.permission_id);

    // Optimistic UI update for submodule
    setRolePermissions(prev => {
      const newSet = new Set(prev);
      if (assign) {
        permIdsToToggle.forEach(id => newSet.add(id));
      } else {
        permIdsToToggle.forEach(id => newSet.delete(id));
      }
      return newSet;
    });

    try {
      const endpoint = assign ? "assign" : "remove";
      await Promise.all(
        permsToToggle.map(p => 
          fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/admin/role_permissions/${endpoint}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                role_id: roleId,
                permission_id: p.permission_id,
              }),
            }
          )
        )
      );

      setToast({
        message: assign
          ? `Assigned all ${submoduleName}`
          : `Removed all ${submoduleName}`,
        type: "success",
      });
    } catch (e) {
      console.error("toggleSubmodule error", e);
      setToast({ message: "Error toggling submodule", type: "error" });
      
      // Refetch on error to correct state
      try {
        const jRes = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/admin/roles/${roleId}/permissions`,
          { 
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          }
        );
        const j = await jRes.json();
        if (j.success) setRolePermissions(new Set(j.permissions || []));
      } catch (fetchError) {
        console.error("Error fetching permissions:", fetchError);
      }
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!newRole.role_name.trim()) {
      errors.role_name = 'Role name is required';
    } else if (roles.some(r => r.role_name.toLowerCase() === newRole.role_name.toLowerCase())) {
      errors.role_name = 'A role with this name already exists';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(newRole)
      });

      const data = await response.json();
      
      if (data.success) {
        // Add the new role to the list and select it
        const createdRole = data.role;
        setRoles([...roles, createdRole]);
        setSelectedRole(createdRole);
        setIsCreateModalOpen(false);
        setNewRole({ role_name: '', description: '' });
        setFormErrors({});
        setToast({ message: 'Role created successfully', type: 'success' });
      } else {
        setToast({ message: data.message || 'Failed to create role', type: 'error' });
      }
    } catch (error) {
      console.error('Error creating role:', error);
      setToast({ message: 'An error occurred while creating the role', type: 'error' });
    }
  };

  if (loading)
    return (
      <div className="settings-card">
        <div className="loader">Loading roles & permissions...</div>
      </div>
    );

  const grouped = groupByModule(permissions);

  return (
    <div className="settings-card" style={{ padding: "20px 24px" }}>
      <h3 className="card-title" style={{ marginBottom: 20 }}>
        Roles & Permissions
      </h3>
      <div style={{ display: "flex", gap: 24 }}>
        {/* LEFT: Roles list */}
        {/* --- NO CHANGES HERE, this part was already good --- */}
        <div
          style={{
            width: 260,
            borderRight: "1px solid #eee",
            paddingRight: 12,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4>Roles</h4>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#4a6cf7',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#3a5bd9'}
              onMouseOut={(e) => e.currentTarget.style.background = '#4a6cf7'}
            >
              <Plus size={16} />
              New Role
            </button>
          </div>
          <input
            type="text"
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
              marginBottom: 12,
            }}
          />
          <div
            style={{
              overflowY: "auto",
              flex: 1,
              border: "1px solid #f1f1f1",
              borderRadius: 8,
            }}
          >
            {roles
              .filter((r) =>
                r.role_name.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map((r) => (
                <div
                  key={r.role_id}
                  onClick={() => setSelectedRole(r)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f4f4f4",
                    backgroundColor:
                      selectedRole?.role_id === r.role_id ? "#eef2ff" : "#fff",
                    color:
                      selectedRole?.role_id === r.role_id ? "#3b5bdb" : "#222",
                    fontWeight:
                      selectedRole?.role_id === r.role_id ? 600 : 400,
                    transition: "background 0.2s",
                  }}
                >
                  {r.role_name}
                </div>
              ))}
          </div>
        </div>

        {/* RIGHT: Permissions */}
        <div style={{ flex: 1 }}>
          {!selectedRole && (
            <div style={{ color: "#666", fontStyle: "italic" }}>
              Select a role to view permissions
            </div>
          )}
          {selectedRole &&
            Object.entries(grouped).map(([mod, subs]) => (
              <div
                key={mod}
                style={{
                  border: "1px solid #dbe4ff",
                  borderRadius: 8,
                  marginBottom: 24,
                  background: "#f8f9ff",
                }}
              >
                {/* Module Header */}
                <div
                  onClick={() =>
                    setExpandedModules((prev) => ({
                      ...prev,
                      [mod]: !prev[mod],
                    }))
                  }
                  style={{
                    padding: "10px 16px",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#2b4eff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Folder size={18} />
                    {mod}
                  </div>
                  {expandedModules[mod] ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </div>

                {/* Submodules */}
                {expandedModules[mod] && (
                  <div style={{ padding: "12px 16px" }}>
                    {Object.entries(subs).map(([sub, perms]) => {
                      // --- NEW ---: Calculate submodule selection state
                      const subPermissionIds = perms.map(p => p.permission_id);
                      const assignedInSub = subPermissionIds.filter(id => rolePermissions.has(id)).length;
                      const allAssigned = assignedInSub === subPermissionIds.length;
                      const noneAssigned = assignedInSub === 0;
                      const indeterminate = !allAssigned && !noneAssigned;

                      return (
                        <div
                          key={sub}
                          style={{
                            background: "#fff",
                            border: "1px solid #e9ecef",
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 12,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 10,
                            }}
                          >
                            {/* --- UPDATED ---: Submodule title now includes master checkbox */}
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
                              <IndeterminateCheckbox
                                checked={allAssigned}
                                indeterminate={indeterminate}
                                onChange={() =>
                                  toggleSubmodule(
                                    selectedRole.role_id,
                                    mod,
                                    sub,
                                    !allAssigned // If all assigned, next click removes. Else, next click assigns.
                                  )
                                }
                              />
                              {sub}
                            </label>

                            {/* --- REMOVED ---: "Assign All" / "Remove All" buttons removed */}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(200px, 1fr))", // Increased min-width
                              gap: 8,
                            }}
                          >
                            {/* --- UPDATED ---: Individual permission item */}
                            {perms.map((p) => {
                              const isAssigned = rolePermissions.has(p.permission_id);
                              return (
                                <label
                                  htmlFor={`perm-${p.permission_id}`}
                                  key={p.permission_id}
                                  style={{
                                    border: "1px solid",
                                    borderColor: isAssigned ? "#4a6cf7" : "#f1f3f5",
                                    borderRadius: 6,
                                    padding: "8px 10px",
                                    background: isAssigned ? "#eef2ff" : "#fafafa",
                                    display: "flex",
                                    alignItems: "center",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    id={`perm-${p.permission_id}`}
                                    checked={isAssigned}
                                    onChange={() =>
                                      toggleRolePermission(
                                        selectedRole.role_id,
                                        p.permission_id,
                                        isAssigned
                                      )
                                    }
                                    style={{ marginRight: 10, cursor: 'pointer' }}
                                  />
                                  <Package size={16} style={{ marginRight: 8, color: isAssigned ? '#4a6cf7' : '#555' }} />
                                  <span style={{ fontWeight: isAssigned ? 500 : 400, color: isAssigned ? '#3b5bdb' : '#222' }}>
                                    {p.action}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
      {/* Create Role Modal */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #eee',
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Create New Role</h3>
              <button 
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewRole({ role_name: '', description: '' });
                  setFormErrors({});
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '4px',
                  borderRadius: '4px',
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateRole} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#444',
                }}>
                  Role Name *
                </label>
                <input
                  type="text"
                  value={newRole.role_name}
                  onChange={(e) => setNewRole({...newRole, role_name: e.target.value})}
                  placeholder="e.g., Content Moderator"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: `1px solid ${formErrors.role_name ? '#ff4d4f' : '#d9d9d9'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    transition: 'all 0.3s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#4a6cf7'}
                  onBlur={(e) => e.target.style.borderColor = formErrors.role_name ? '#ff4d4f' : '#d9d9d9'}
                />
                {formErrors.role_name && (
                  <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>
                    {formErrors.role_name}
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#444',
                }}>
                  Description
                </label>
                <textarea
                  value={newRole.description}
                  onChange={(e) => setNewRole({...newRole, description: e.target.value})}
                  placeholder="Brief description of the role's purpose"
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    minHeight: '80px',
                    transition: 'all 0.3s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#4a6cf7'}
                  onBlur={(e) => e.target.style.borderColor = '#d9d9d9'}
                />
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #f0f0f0',
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setNewRole({ role_name: '', description: '' });
                    setFormErrors({});
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'none',
                    border: '1px solid #d9d9d9',
                    borderRadius: '6px',
                    color: '#444',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#999'}
                  onMouseOut={e => e.currentTarget.style.borderColor = '#d9d9d9'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    background: '#4a6cf7',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#3a5bd9'}
                  onMouseOut={e => e.currentTarget.style.background = '#4a6cf7'}
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "info" })}
      />
    </div>
  );
}

export default RolesPermissions;
