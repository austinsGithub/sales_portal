// controllers/security/permissionsController.mjs
import db from '../../db/pool.mjs';

/**
 * Check if a permission pattern matches a required permission
 * Supports wildcards like:
 * - '*' matches everything
 * - 'procurement.*' matches all procurement permissions
 * - '*.view' matches all view permissions
 */
const matchesPermission = (pattern, required) => {
  // Exact match
  if (pattern === required) return true;
  
  // Wildcard: * matches everything
  if (pattern === '*') return true;
  
  // Module wildcard: procurement.* matches procurement.suppliers.view
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return required.startsWith(prefix + '.');
  }
  
  // Action wildcard: *.view matches any module's view permission
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // includes the dot
    return required.endsWith(suffix);
  }
  
  return false;
};

/**
 * Get current user's permission keys
 * @route GET /api/permissions/my-keys
 */
export const getMyPermissionKeysHandler = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const companyId = req.user.company_id;
    const isSuperAdmin = req.user.is_super_admin === 1 || req.user.is_super_admin === true;
    
    console.log(`[Permissions] Fetching permissions for user ${userId}, company ${companyId}`);
    
    // Super admins get wildcard access to everything
    if (isSuperAdmin) {
      console.log('[Permissions] User is super admin - granting all permissions');
      return res.json({ 
        permissions: ['*'],
        isSuperAdmin: true,
        roles: ['super_admin']
      });
    }
    
    // Query to get user's permissions through roles with submodules
    const permissionQuery = `
      SELECT DISTINCT
        r.role_name,
        p.permission_id,
        p.action,
        p.description as permission_description,
        m.module_name,
        s.submodule_name,
        CONCAT(
          LOWER(m.module_name), 
          '.', 
          LOWER(REPLACE(s.submodule_name, ' ', '_')),
          '.',
          LOWER(p.action)
        ) as permission_key
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      JOIN role_permissions rp ON r.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.permission_id
      JOIN modules m ON p.module_id = m.module_id
      LEFT JOIN submodules s ON p.submodule_id = s.submodule_id
      WHERE ur.user_id = ? 
        AND ur.company_id = ?
        AND p.permission_id IS NOT NULL
      ORDER BY m.module_name, s.submodule_name, p.action
    `;
    
    const [permissionRows] = await db.query(permissionQuery, [userId, companyId]);
    
    // Get role names
    const roleQuery = `
      SELECT DISTINCT r.role_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = ? AND ur.company_id = ?
    `;
    
    const [roleRows] = await db.query(roleQuery, [userId, companyId]);
    
    if ((!permissionRows || permissionRows.length === 0) && (!roleRows || roleRows.length === 0)) {
      console.log('[Permissions] No roles or permissions found for user');
      return res.json({ 
        permissions: [],
        isSuperAdmin: false,
        roles: []
      });
    }
    
    // Collect permissions
    const permissionSet = new Set();
    const roleNames = new Set();
    
    // Add permissions from query
    permissionRows.forEach(row => {
      if (row.role_name) roleNames.add(row.role_name);
      if (row.permission_key) {
        permissionSet.add(row.permission_key);
      }
    });
    
    // Add role names
    roleRows.forEach(row => {
      if (row.role_name) roleNames.add(row.role_name);
    });
    
    const permissions = Array.from(permissionSet);
    const roles = Array.from(roleNames);
    
    console.log(`[Permissions] User has ${permissions.length} permissions from ${roles.length} roles`);
    console.log(`[Permissions] Permissions:`, permissions.slice(0, 10), permissions.length > 10 ? '...' : '');
    
    return res.json({ 
      permissions,
      isSuperAdmin: false,
      roles
    });
    
  } catch (error) {
    console.error('[Permissions] Error fetching user permissions:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch permissions',
      message: error.message,
      permissions: [],
      isSuperAdmin: false,
      roles: []
    });
  }
};

/**
 * Check if user has a specific permission
 * @route POST /api/permissions/check
 * Body: { permission: 'procurement.suppliers.view' }
 */
export const checkPermissionHandler = async (req, res) => {
  try {
    const { permission } = req.body;
    const userId = req.user.user_id;
    const companyId = req.user.company_id;
    const isSuperAdmin = req.user.is_super_admin === 1 || req.user.is_super_admin === true;
    
    if (!permission) {
      return res.status(400).json({ 
        error: 'Permission key is required',
        hasPermission: false 
      });
    }
    
    // Super admins have all permissions
    if (isSuperAdmin) {
      return res.json({ hasPermission: true, reason: 'super_admin' });
    }
    
    // Parse the permission key: module.submodule.action
    const parts = permission.split('.');
    if (parts.length < 3) {
      return res.status(400).json({
        error: 'Invalid permission format. Expected: module.submodule.action',
        hasPermission: false
      });
    }
    
    const moduleName = parts[0];
    const submoduleName = parts.slice(1, -1).join('_').replace(/_/g, ' '); // Handle multi-word submodules
    const action = parts[parts.length - 1];
    
    // Check via junction tables with submodules
    const checkQuery = `
      SELECT COUNT(*) as has_permission
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      JOIN role_permissions rp ON r.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.permission_id
      JOIN modules m ON p.module_id = m.module_id
      LEFT JOIN submodules s ON p.submodule_id = s.submodule_id
      WHERE ur.user_id = ?
        AND ur.company_id = ?
        AND LOWER(m.module_name) = LOWER(?)
        AND LOWER(REPLACE(s.submodule_name, ' ', '_')) = LOWER(?)
        AND LOWER(p.action) = LOWER(?)
    `;
    
    const [rows] = await db.query(checkQuery, [userId, companyId, moduleName, submoduleName, action]);
    
    const hasPermission = rows[0].has_permission > 0;
    
    return res.json({ 
      hasPermission,
      permission,
      reason: hasPermission ? 'role_permission' : 'no_permission'
    });
    
  } catch (error) {
    console.error('Error checking permission:', error);
    return res.status(500).json({ 
      error: 'Failed to check permission',
      message: error.message,
      hasPermission: false 
    });
  }
};

/**
 * Get all available permissions in the system from database
 * @route GET /api/permissions/available
 */
export const getAvailablePermissionsHandler = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    
    const query = `
      SELECT 
        p.permission_id,
        m.module_name,
        s.submodule_name,
        p.action,
        p.description,
        CONCAT(
          LOWER(m.module_name), 
          '.', 
          LOWER(REPLACE(s.submodule_name, ' ', '_')),
          '.',
          LOWER(p.action)
        ) as permission_key
      FROM permissions p
      JOIN modules m ON p.module_id = m.module_id
      LEFT JOIN submodules s ON p.submodule_id = s.submodule_id
      WHERE p.company_id = ?
      ORDER BY m.module_name, s.submodule_name, p.action
    `;
    
    const [rows] = await db.query(query, [companyId]);
    
    // Group by module
    const groupedPermissions = {};
    rows.forEach(row => {
      const moduleKey = row.module_name.toLowerCase();
      if (!groupedPermissions[moduleKey]) {
        groupedPermissions[moduleKey] = {
          label: row.module_name,
          submodules: {}
        };
      }
      
      const submoduleKey = row.submodule_name ? row.submodule_name.toLowerCase().replace(/\s+/g, '_') : 'general';
      if (!groupedPermissions[moduleKey].submodules[submoduleKey]) {
        groupedPermissions[moduleKey].submodules[submoduleKey] = {
          label: row.submodule_name || 'General',
          permissions: []
        };
      }
      
      groupedPermissions[moduleKey].submodules[submoduleKey].permissions.push({
        key: row.permission_key,
        action: row.action,
        description: row.description || `${row.action} permission for ${row.submodule_name} in ${row.module_name}`
      });
    });
    
    return res.json({ permissions: groupedPermissions });
    
  } catch (error) {
    console.error('Error fetching available permissions:', error);
    return res.status(500).json({ error: 'Failed to fetch available permissions' });
  }
};

/**
 * Middleware to check if user has required permission(s)
 * Usage: router.get('/suppliers', requirePermission('procurement.suppliers.view'), handler)
 */
export const requirePermission = (requiredPermission, options = {}) => {
  const { requireAll = false } = options;
  
  return async (req, res, next) => {
    try {
      const userId = req.user?.user_id;
      const companyId = req.user?.company_id;
      const isSuperAdmin = req.user?.is_super_admin === 1 || req.user?.is_super_admin === true;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Super admins bypass all permission checks
      if (isSuperAdmin) {
        return next();
      }
      
      const permissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
      
      // Check each required permission
      let hasAccessCount = 0;
      
      for (const perm of permissions) {
        const parts = perm.split('.');
        if (parts.length < 3) continue;
        
        const moduleName = parts[0];
        const submoduleName = parts.slice(1, -1).join('_').replace(/_/g, ' ');
        const action = parts[parts.length - 1];
        
        const checkQuery = `
          SELECT COUNT(*) as has_permission
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.role_id
          JOIN role_permissions rp ON r.role_id = rp.role_id
          JOIN permissions p ON rp.permission_id = p.permission_id
          JOIN modules m ON p.module_id = m.module_id
          LEFT JOIN submodules s ON p.submodule_id = s.submodule_id
          WHERE ur.user_id = ?
            AND ur.company_id = ?
            AND LOWER(m.module_name) = LOWER(?)
            AND LOWER(REPLACE(s.submodule_name, ' ', '_')) = LOWER(?)
            AND LOWER(p.action) = LOWER(?)
        `;
        
        const [rows] = await db.query(checkQuery, [userId, companyId, moduleName, submoduleName, action]);
        
        if (rows[0].has_permission > 0) {
          hasAccessCount++;
          
          if (!requireAll) {
            // If we only need one permission and we found it, allow access
            return next();
          }
        } else if (requireAll) {
          // If we need all permissions and one is missing, deny access
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'You do not have permission to access this resource',
            requiredPermissions: permissions,
            missingPermission: perm
          });
        }
      }
      
      // If requireAll and we made it through all checks
      if (requireAll && hasAccessCount === permissions.length) {
        return next();
      }
      
      // If !requireAll and we didn't find any matching permission
      if (!requireAll && hasAccessCount === 0) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'You do not have permission to access this resource',
          requiredPermissions: permissions
        });
      }
      
      // This shouldn't happen, but just in case
      next();
      
    } catch (error) {
      console.error('Error checking permission:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Export the helper function for testing
export { matchesPermission };
