// AdminController.mjs
// -----------------------------------------------------------------------------
// This file defines all administrative and role-based access control handlers
// for the Sales Portal backend. It manages user accounts, roles, modules,
// submodules, and permissions at the company level, including creation,
// assignment, and deletion of each. It enforces super admin authorization for
// all endpoints, ensuring only privileged users can modify security data.
//
// Core capabilities include:
// - Managing users (create, update, activate/deactivate, assign roles)
// - Managing roles, modules, submodules, and permissions
// - Mapping permissions to roles and users (role_permissions, user_permissions)
// - Enforcing hierarchical access control (super admin → company admin → users)
// - Supporting bulk assignment/removal of module or submodule permissions
// - Handling order status transitions with role-based validation logic
//
// The file serves as the primary backend controller for administrative security
// and access control functions across the system.

import pool from '../../db/pool.mjs';
import bcrypt from 'bcrypt';
import { getAllUsers, getUserRoles, updateUser } from '../../models/userModel.mjs';

// Simple guard: only allow super admins
function ensureSuperAdmin(req, res) {
  if (!req.user) return res.status(401).json({ success: false, msg: 'Unauthorized' });
  if (req.user.is_super_admin !== 1) return res.status(403).json({ success: false, msg: 'Forbidden' });
  return null;
}

async function getAllUsersHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    // Get all users with their roles
    const [users] = await pool.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.company_id,
        u.is_active,
        u.is_super_admin,
        u.address_line1,
        u.address_line2,
        u.city,
        u.state,
        u.postal_code,
        u.country,
        u.last_login,
        u.created_at,
        u.updated_at,
        c.company_name,
        GROUP_CONCAT(r.role_name) as roles
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.company_id
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE u.company_id = ?
      GROUP BY u.user_id
      ORDER BY u.created_at DESC
    `, [req.user.company_id]);

    // Format the response with both field name formats
    const formattedUsers = users.map(user => ({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      company_id: user.company_id,
      company_name: user.company_name,
      is_active: user.is_active,
      is_super_admin: user.is_super_admin,
      roles: user.roles ? user.roles.split(',') : [],
      role: user.roles ? user.roles.split(',')[0] : null,
      status: user.is_active ? 'active' : 'inactive',
      last_login: user.last_login,
      lastLogin: user.last_login, // Alternative field name
      created_at: user.created_at,
      updated_at: user.updated_at,
      // Frontend format
      address_street: user.address_line1,
      address_line2: user.address_line2,
      address_city: user.city,
      address_state: user.state,
      address_zip: user.postal_code,
      address_country: user.country,
      // Database schema format
      address_line1: user.address_line1,
      city: user.city,
      state: user.state,
      postal_code: user.postal_code,
      country: user.country
    }));

    res.json({ success: true, users: formattedUsers });
  } catch (e) {
    console.error('getAllUsersHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to load users' });
  }
}

// Get a single user by ID
async function getUserHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, msg: 'Invalid user ID' });
    }

    // Get user data
    const [users] = await pool.query(
      `SELECT u.* FROM users u WHERE u.user_id = ?`,
      [userId]
    );
    
    if (!users.length) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }

    const user = users[0];
    
    // Get user roles
    const [roles] = await pool.query(
      'SELECT r.role_name FROM user_roles ur ' +
      'JOIN roles r ON ur.role_id = r.role_id ' +
      'WHERE ur.user_id = ?',
      [userId]
    );
    
    // Return complete user data with roles and formatted fields
    res.json({ 
      success: true,
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      company_id: user.company_id,
      is_active: user.is_active,
      is_super_admin: user.is_super_admin,
      roles: roles.map(r => r.role_name),
      status: user.is_active ? 'active' : 'inactive',
      // Address fields - return both frontend-expected names and database names
      address_street: user.address_line1,
      address_line1: user.address_line1,
      address_line2: user.address_line2,
      address_city: user.city,
      city: user.city,
      address_state: user.state,
      state: user.state,
      address_zip: user.postal_code,
      postal_code: user.postal_code,
      address_country: user.country,
      country: user.country,
      created_at: user.created_at,
      updated_at: user.updated_at
    });
  } catch (e) {
    console.error('getUserHandler error', e);
    res.status(500).json({ 
      success: false, 
      msg: 'Failed to load user',
      error: e.message 
    });
  }
}

async function listRolesHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const [rows] = await pool.query('SELECT role_id, role_name FROM roles WHERE company_id = ? ORDER BY role_name ASC', [req.user.company_id]);
    res.json({ success: true, roles: rows });
  } catch (e) {
    console.error('listRolesHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to load roles' });
  }
}

// Set/unset super admin flag on a user
async function setSuperAdminHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const userId = Number(req.params.id);
    const { is_super_admin } = req.body;
    if (typeof is_super_admin === 'undefined') return res.status(400).json({ success: false, msg: 'is_super_admin required' });

    await pool.query('UPDATE users SET is_super_admin = ? WHERE user_id = ?', [is_super_admin ? 1 : 0, userId]);
    res.json({ success: true });
  } catch (e) {
    console.error('setSuperAdminHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to update user' });
  }
}

// Assign role to user
async function assignRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { user_id, role_id } = req.body || {};
    if (!user_id || !role_id) return res.status(400).json({ success: false, msg: 'user_id and role_id required' });

    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id, company_id, assigned_at) VALUES (?, ?, ?, NOW())', [user_id, role_id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) {
    console.error('assignRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to assign role' });
  }
}

// Remove role mapping
async function removeRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { user_id, role_id } = req.body || {};
    if (!user_id || !role_id) return res.status(400).json({ success: false, msg: 'user_id and role_id required' });

    await pool.query('DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND company_id = ?', [user_id, role_id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) {
    console.error('removeRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to remove role' });
  }
}

// List all permissions (module/submodule/action) for the company
async function listPermissionsHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const [rows] = await pool.query(
      `SELECT permission_id, p.module_id, p.submodule_id, p.action, m.module_name, s.submodule_name
       FROM permissions p
       LEFT JOIN modules m ON m.module_id = p.module_id
       LEFT JOIN submodules s ON s.submodule_id = p.submodule_id
       WHERE p.company_id = ? OR p.company_id IS NULL
       ORDER BY m.module_name, s.submodule_name, p.action`,
      [req.user.company_id]
    );
    res.json({ success: true, permissions: rows });
  } catch (e) {
    console.error('listPermissionsHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to load permissions' });
  }
}

// List modules for the company
async function listModulesHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const [rows] = await pool.query('SELECT module_id, module_name FROM modules WHERE company_id = ? OR company_id IS NULL ORDER BY module_name', [req.user.company_id]);
    res.json({ success: true, modules: rows });
  } catch (e) {
    console.error('listModulesHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to load modules' });
  }
}

// Create module
async function createModuleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { module_name } = req.body || {};
    if (!module_name) return res.status(400).json({ success: false, msg: 'module_name required' });

    const [ins] = await pool.query('INSERT INTO modules (company_id, module_name, created_at) VALUES (?, ?, NOW())', [req.user.company_id, module_name]);
    res.json({ success: true, module: { module_id: ins.insertId, module_name } });
  } catch (e) {
    console.error('createModuleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to create module' });
  }
}

// List submodules for a module
async function listSubmodulesHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const moduleId = Number(req.params.moduleId);
    if (!moduleId) return res.status(400).json({ success: false, msg: 'module id required' });

    const [rows] = await pool.query('SELECT submodule_id, submodule_name FROM submodules WHERE (company_id = ? OR company_id IS NULL) AND module_id = ? ORDER BY submodule_name', [req.user.company_id, moduleId]);
    res.json({ success: true, submodules: rows });
  } catch (e) {
    console.error('listSubmodulesHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to load submodules' });
  }
}

// Create submodule under a module
async function createSubmoduleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { module_id, submodule_name } = req.body || {};
    if (!module_id || !submodule_name) return res.status(400).json({ success: false, msg: 'module_id and submodule_name required' });

    const [ins] = await pool.query('INSERT INTO submodules (company_id, module_id, submodule_name, created_at) VALUES (?, ?, ?, NOW())', [req.user.company_id, module_id, submodule_name]);
    res.json({ success: true, submodule: { submodule_id: ins.insertId, submodule_name } });
  } catch (e) {
    console.error('createSubmoduleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to create submodule' });
  }
}

// Create a new role for the company
async function createRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { role_name } = req.body || {};
    if (!role_name) return res.status(400).json({ success: false, msg: 'role_name required' });

    const [ins] = await pool.query('INSERT INTO roles (company_id, role_name, created_at) VALUES (?, ?, NOW())', [req.user.company_id, role_name]);
    const roleId = ins.insertId;
    res.json({ success: true, role: { role_id: roleId, role_name } });
  } catch (e) {
    console.error('createRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to create role' });
  }
}

// Create a new permission (module/submodule/action)
async function createPermissionHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { module_id = null, submodule_id = null, action } = req.body || {};
    if (!action) return res.status(400).json({ success: false, msg: 'action required' });

    const [ins] = await pool.query('INSERT INTO permissions (company_id, module_id, submodule_id, action, created_at) VALUES (?, ?, ?, ?, NOW())', [req.user.company_id, module_id, submodule_id, action]);
    const permissionId = ins.insertId;
    res.json({ success: true, permission: { permission_id: permissionId, module_id, submodule_id, action } });
  } catch (e) {
    console.error('createPermissionHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to create permission' });
  }
}

// GET permissions assigned to a role
async function getRolePermissionsHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const roleId = Number(req.params.id);
    if (!roleId) return res.status(400).json({ success: false, msg: 'role id required' });

    const [rows] = await pool.query('SELECT permission_id FROM role_permissions WHERE role_id = ? AND company_id = ?', [roleId, req.user.company_id]);
    const permissionIds = rows.map(r => r.permission_id);
    res.json({ success: true, permissions: permissionIds });
  } catch (e) {
    console.error('getRolePermissionsHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to fetch role permissions' });
  }
}

// Assign a permission to a role
async function assignPermissionToRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { role_id, permission_id } = req.body || {};
    if (!role_id || !permission_id) return res.status(400).json({ success: false, msg: 'role_id and permission_id required' });

    await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id, company_id) VALUES (?, ?, ?)', [role_id, permission_id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) {
    console.error('assignPermissionToRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to assign permission to role' });
  }
}

// Remove permission from role
async function removePermissionFromRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { role_id, permission_id } = req.body || {};
    if (!role_id || !permission_id) return res.status(400).json({ success: false, msg: 'role_id and permission_id required' });

    await pool.query('DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ? AND company_id = ?', [role_id, permission_id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) {
    console.error('removePermissionFromRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to remove permission from role' });
  }
}

// Set per-user permission override (allow/deny)
async function setUserPermissionOverrideHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { user_id, permission_id, is_allowed } = req.body || {};
    if (!user_id || !permission_id || typeof is_allowed === 'undefined') return res.status(400).json({ success: false, msg: 'user_id, permission_id, is_allowed required' });

    await pool.query('INSERT INTO user_permissions (user_id, permission_id, company_id, is_allowed) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed)', [user_id, permission_id, req.user.company_id, is_allowed ? 1 : 0]);
    res.json({ success: true });
  } catch (e) {
    console.error('setUserPermissionOverrideHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to set user permission override' });
  }
}

// Create a new user and optionally assign a role
async function createUserHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { email, password, username = null, first_name = null, last_name = null, role_id = null } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, msg: 'email and password required' });

    const passwordHash = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO users (company_id, username, email, password_hash, first_name, last_name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [req.user.company_id, username, email, passwordHash, first_name, last_name]
      );
      const userId = ins.insertId;

      if (role_id) {
        await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id, company_id, assigned_at) VALUES (?, ?, ?, NOW())', [userId, role_id, req.user.company_id]);
      }

      await conn.commit();
      res.status(201).json({ success: true, user_id: userId });
    } catch (e) {
      await conn.rollback();
      console.error('createUserHandler transaction error', e);
      res.status(500).json({ success: false, msg: 'Failed to create user' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('createUserHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to create user' });
  }
}

// Bulk-assign all permissions under a module/submodule to a role
async function assignSubmoduleToRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { role_id, module_id = null, submodule_id = null } = req.body || {};
    if (!role_id || (!module_id && !submodule_id)) return res.status(400).json({ success: false, msg: 'role_id and module_id or submodule_id required' });

    // find all permission ids matching module/submodule for this company or global (company_id IS NULL)
    const [perms] = await pool.query('SELECT permission_id FROM permissions WHERE (company_id = ? OR company_id IS NULL) AND module_id <=> ? AND submodule_id <=> ?', [req.user.company_id, module_id, submodule_id]);
    const permissionIds = perms.map(p => p.permission_id);
    if (permissionIds.length === 0) return res.json({ success: true, assigned: 0 });

    // Insert all mappings IGNORE duplicates
    const values = permissionIds.map(pid => [role_id, pid, req.user.company_id]);
    await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id, company_id) VALUES ?', [values]);
    res.json({ success: true, assigned: permissionIds.length });
  } catch (e) {
    console.error('assignSubmoduleToRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to assign submodule permissions to role' });
  }
}

// Bulk-remove all permissions under a module/submodule from a role
async function removeSubmoduleFromRoleHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const { role_id, module_id = null, submodule_id = null } = req.body || {};
    if (!role_id || (!module_id && !submodule_id)) return res.status(400).json({ success: false, msg: 'role_id and module_id or submodule_id required' });

    const [perms] = await pool.query('SELECT permission_id FROM permissions WHERE (company_id = ? OR company_id IS NULL) AND module_id <=> ? AND submodule_id <=> ?', [req.user.company_id, module_id, submodule_id]);
    const permissionIds = perms.map(p => p.permission_id);
    if (permissionIds.length === 0) return res.json({ success: true, removed: 0 });

    await pool.query('DELETE FROM role_permissions WHERE role_id = ? AND permission_id IN (?) AND company_id = ?', [role_id, permissionIds, req.user.company_id]);
    res.json({ success: true, removed: permissionIds.length });
  } catch (e) {
    console.error('removeSubmoduleFromRoleHandler error', e);
    res.status(500).json({ success: false, msg: 'Failed to remove submodule permissions from role' });
  }
}

// Update user details - FIXED VERSION with Role Assignment
async function updateUserHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, msg: 'Invalid user ID' });
    }

    console.log('updateUserHandler received body:', req.body);
    
    // Extract and validate updates
    const updates = {};
    const {
      first_name, last_name, email, phone, username,
      is_active, is_super_admin, role, status,
      // Frontend sends these field names
      address_street, address_line2, address_city,
      address_state, address_zip, address_country,
      // Also accept database field names
      address_line1, city, state, postal_code, country,
      // Accept nested address object for backward compatibility
      address,
      // Password update
      password, new_password
    } = req.body;

    // Basic user info
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (username !== undefined) updates.username = username;
    
    // Handle is_active - convert from status string or boolean
    if (status !== undefined) {
      updates.is_active = status === 'active' ? 1 : 0;
    } else if (is_active !== undefined) {
      updates.is_active = is_active ? 1 : 0;
    }
    
    // Handle super admin status
    if (is_super_admin !== undefined) {
      updates.is_super_admin = is_super_admin ? 1 : 0;
    } else if (role === 'super_admin') {
      updates.is_super_admin = 1;
    } else if (role && role !== 'super_admin') {
      updates.is_super_admin = 0;
    }

    // Handle address fields - map frontend names to database schema
    if (address_line1 !== undefined) {
      updates.address_line1 = address_line1;
    } else if (address_street !== undefined) {
      updates.address_line1 = address_street;
    }
    
    if (address_line2 !== undefined) updates.address_line2 = address_line2;
    
    if (city !== undefined) {
      updates.city = city;
    } else if (address_city !== undefined) {
      updates.city = address_city;
    }
    
    if (state !== undefined) {
      updates.state = state;
    } else if (address_state !== undefined) {
      updates.state = address_state;
    }
    
    if (postal_code !== undefined) {
      updates.postal_code = postal_code;
    } else if (address_zip !== undefined) {
      updates.postal_code = address_zip;
    }
    
    if (country !== undefined) {
      updates.country = country;
    } else if (address_country !== undefined) {
      updates.country = address_country;
    }

    // Handle nested address object (for backward compatibility)
    if (address && typeof address === 'object') {
      if (address.street !== undefined) updates.address_line1 = address.street;
      if (address.line1 !== undefined) updates.address_line1 = address.line1;
      if (address.line2 !== undefined) updates.address_line2 = address.line2;
      if (address.city !== undefined) updates.city = address.city;
      if (address.state !== undefined) updates.state = address.state;
      if (address.zip !== undefined) updates.postal_code = address.zip;
      if (address.postal_code !== undefined) updates.postal_code = address.postal_code;
      if (address.country !== undefined) updates.country = address.country;
    }

    // Handle password update if provided
    if (password || new_password) {
      const passwordToHash = new_password || password;
      if (passwordToHash && passwordToHash.length >= 8) {
        updates.password_hash = await bcrypt.hash(passwordToHash, 10);
      }
    }

    // Handle role assignment if role name is provided
    let roleId = null;
    if (role && role !== '') {
      console.log('🔍 Looking up role_id for role name:', role);
      
      // Look up the role_id from the role name
      const [roleRows] = await pool.query(
        'SELECT role_id FROM roles WHERE role_name = ? AND company_id = ?',
        [role, req.user.company_id]
      );
      
      if (roleRows.length > 0) {
        roleId = roleRows[0].role_id;
        console.log('✅ Found role_id:', roleId);
        
        // Update the role_id in the users table
        updates.role_id = roleId;
      } else {
        console.log('⚠️ Role not found:', role);
        return res.status(400).json({ 
          success: false, 
          msg: `Role '${role}' not found` 
        });
      }
    }

    // Check if we have any fields to update
    if (Object.keys(updates).length === 0 && !roleId) {
      return res.status(400).json({ success: false, msg: 'No valid fields to update' });
    }

    // Start transaction for atomic updates
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Update user table if there are any updates
      if (Object.keys(updates).length > 0) {
        const success = await updateUser(userId, updates);
        if (!success) {
          await conn.rollback();
          return res.status(400).json({ success: false, msg: 'Failed to update user' });
        }
      }

      // Update user_roles junction table if role was provided
      if (roleId !== null) {
        console.log('🔄 Updating user_roles for user_id:', userId, 'role_id:', roleId);
        
        // Remove all existing roles for this user
        await conn.query(
          'DELETE FROM user_roles WHERE user_id = ? AND company_id = ?',
          [userId, req.user.company_id]
        );
        
        // Add the new role
        await conn.query(
          'INSERT INTO user_roles (user_id, role_id, company_id, assigned_at) VALUES (?, ?, ?, NOW())',
          [userId, roleId, req.user.company_id]
        );
        
        console.log('✅ Role assignment updated in user_roles table');
      }

      await conn.commit();
      console.log('✅ Transaction committed successfully');

      // Fetch complete updated user data
      const [updatedUsers] = await pool.query(
        `SELECT u.* FROM users u WHERE u.user_id = ?`,
        [userId]
      );
      
      if (!updatedUsers.length) {
        return res.status(404).json({ success: false, msg: 'User not found after update' });
      }

      const updatedUser = updatedUsers[0];
      
      // Get user roles
      const [roles] = await pool.query(
        'SELECT r.role_name FROM user_roles ur ' +
        'JOIN roles r ON ur.role_id = r.role_id ' +
        'WHERE ur.user_id = ?',
        [userId]
      );
      
      console.log('✅ Updated user roles:', roles.map(r => r.role_name));
      
      // Return complete user data with ALL address fields in both formats
      res.json({ 
        success: true,
        user_id: updatedUser.user_id,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        username: updatedUser.username,
        company_id: updatedUser.company_id,
        is_active: updatedUser.is_active,
        is_super_admin: updatedUser.is_super_admin,
        roles: roles.map(r => r.role_name),
        role: roles.length > 0 ? roles[0].role_name : null,
        status: updatedUser.is_active ? 'active' : 'inactive',
        // Return address in BOTH formats for compatibility
        // Frontend format
        address_street: updatedUser.address_line1,
        address_line2: updatedUser.address_line2,
        address_city: updatedUser.city,
        address_state: updatedUser.state,
        address_zip: updatedUser.postal_code,
        address_country: updatedUser.country,
        // Database schema format
        address_line1: updatedUser.address_line1,
        city: updatedUser.city,
        state: updatedUser.state,
        postal_code: updatedUser.postal_code,
        country: updatedUser.country,
        created_at: updatedUser.created_at,
        updated_at: updatedUser.updated_at
      });
    } catch (e) {
      await conn.rollback();
      console.error('updateUserHandler transaction error', e);
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('updateUserHandler error', e);
    
    // Handle duplicate entry error
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false, 
        msg: 'Email or username already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      msg: 'Failed to update user',
      error: e.message 
    });
  }
}

// Update order status with role-based permissions
async function updateOrderStatus(req, res) {
  try {
    const { order_id, new_status } = req.body;
    const user = req.user;
    
    if (!order_id || !new_status) {
      return res.status(400).json({ success: false, msg: 'order_id and new_status are required' });
    }

    // Validate status transition
    const validStatuses = ['draft', 'submitted', 'processed', 'completed', 'cancelled'];
    if (!validStatuses.includes(new_status)) {
      return res.status(400).json({ success: false, msg: 'Invalid status' });
    }

    // Get current order status
    const [order] = await pool.query('SELECT status, created_by FROM sales_orders WHERE order_id = ?', [order_id]);
    if (!order.length) {
      return res.status(404).json({ success: false, msg: 'Order not found' });
    }

    const currentStatus = order[0].status;
    const createdBy = order[0].created_by;

    // Role-based permission checks
    const userRoles = await getUserRoles(user.user_id);
    const isSuperAdmin = user.is_super_admin === 1;
    const isCreator = createdBy === user.user_id;
    const isSalesRep = userRoles.some(r => r.role_name === 'sales_rep');
    const isFacilityAdmin = userRoles.some(r => r.role_name === 'facility_admin');
    const isManufacturer = userRoles.some(r => r.role_name === 'manufacturer_user');

    // Validate status transition based on role
    switch (currentStatus) {
      case 'draft':
        if (new_status !== 'submitted' && !isSuperAdmin) {
          return res.status(403).json({ success: false, msg: 'Unauthorized status transition' });
        }
        if (!isCreator && !isSuperAdmin && !isSalesRep) {
          return res.status(403).json({ success: false, msg: 'Only the creator or sales rep can submit this order' });
        }
        break;
        
      case 'submitted':
        if (new_status !== 'processed' && !isSuperAdmin) {
          return res.status(403).json({ success: false, msg: 'Only processed status is allowed after submitted' });
        }
        if (!isFacilityAdmin && !isSuperAdmin) {
          return res.status(403).json({ success: false, msg: 'Only facility admins can process orders' });
        }
        break;
        
      case 'processed':
        if (new_status !== 'completed' && !isSuperAdmin) {
          return res.status(403).json({ success: false, msg: 'Only completed status is allowed after processed' });
        }
        if (!isManufacturer && !isSuperAdmin) {
          return res.status(403).json({ success: false, msg: 'Only manufacturer users can complete orders' });
        }
        break;
        
      case 'completed':
        return res.status(400).json({ success: false, msg: 'Cannot modify a completed order' });
        
      case 'cancelled':
        return res.status(400).json({ success: false, msg: 'Cannot modify a cancelled order' });
    }

    // Update order status and log the change
    await pool.query('UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE order_id = ?', [new_status, order_id]);
    
    // Log status change
    await pool.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, ?, ?, ?)',
      [order_id, new_status, user.user_id, `Status changed from ${currentStatus} to ${new_status}`]
    );

    res.json({ success: true, status: new_status });
    
  } catch (e) {
    console.error('updateOrderStatus error', e);
    res.status(500).json({ success: false, msg: 'Failed to update order status' });
  }
}

async function resetUserPasswordHandler(req, res) {
  try {
    const err = ensureSuperAdmin(req, res);
    if (err) return;

    const userId = parseInt(req.params.userId);
    const { password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ success: false, msg: 'User ID and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the user's password
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE user_id = ? AND company_id = ?',
      [hashedPassword, userId, req.user.company_id]
    );

    res.json({ success: true, msg: 'Password reset successfully' });
  } catch (e) {
    console.error('Error resetting user password:', e);
    res.status(500).json({ success: false, msg: 'Failed to reset password' });
  }
}

export {
  getAllUsersHandler,
  getUserHandler,
  listRolesHandler,
  setSuperAdminHandler,
  assignRoleHandler,
  removeRoleHandler,
  listPermissionsHandler,
  listModulesHandler,
  createModuleHandler,
  listSubmodulesHandler,
  createSubmoduleHandler,
  createRoleHandler,
  createPermissionHandler,
  getRolePermissionsHandler,
  assignPermissionToRoleHandler,
  removePermissionFromRoleHandler,
  setUserPermissionOverrideHandler,
  createUserHandler,
  assignSubmoduleToRoleHandler,
  removeSubmoduleFromRoleHandler,
  updateUserHandler,
  updateOrderStatus,
  resetUserPasswordHandler
};
