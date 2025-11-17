import pool from '../../db/pool.mjs';

/**
 * Get all modules with their submodules and access status for a company
 */
export async function getModuleAccess(req, res) {
  try {
    const { company_id } = req.user;

    // Get all modules with their access status for the company
    const [modules] = await pool.query(`
      SELECT 
        m.module_id, 
        m.module_name, 
        m.display_name,
        m.description,
        COALESCE(cma.is_enabled, 1) as is_enabled
      FROM modules m
      LEFT JOIN custom_module_access cma ON m.module_id = cma.module_id 
        AND cma.company_id = ?
      WHERE m.is_active = 1
      ORDER BY m.module_name
    `, [company_id]);

    // Get all submodules for these modules
    const [submodules] = await pool.query(`
      SELECT 
        s.submodule_id,
        s.module_id,
        s.submodule_name,
        s.display_name,
        s.is_active
      FROM submodules s
      WHERE s.module_id IN (?)
      ORDER BY s.module_id, s.submodule_name
    `, [modules.map(m => m.module_id)]);

    // Get all permissions for these submodules
    const [permissions] = await pool.query(`
      SELECT 
        p.permission_id,
        p.module_id,
        p.submodule_id,
        p.action,
        p.description
      FROM permissions p
      WHERE p.company_id = ?
      ORDER BY p.module_id, p.submodule_id, p.action
    `, [company_id]);

    // Group submodules by module
    const modulesWithSubmodules = modules.map(module => ({
      ...module,
      submodules: submodules
        .filter(s => s.module_id === module.module_id)
        .map(submodule => ({
          ...submodule,
          permissions: permissions.filter(p => 
            p.module_id === module.module_id && 
            p.submodule_id === submodule.submodule_id
          )
        }))
    }));

    return res.json({ success: true, data: modulesWithSubmodules });
  } catch (error) {
    console.error('Error getting module access:', error);
    return res.status(500).json({ success: false, error: 'Failed to get module access' });
  }
}

/**
 * Update module access for a company
 */
export async function updateModuleAccess(req, res) {
  const { company_id } = req.user;
  const { module_id, is_enabled } = req.body;

  if (typeof module_id === 'undefined' || typeof is_enabled === 'undefined') {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    await pool.query(`
      INSERT INTO custom_module_access (company_id, module_id, is_enabled)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)
    `, [company_id, module_id, is_enabled]);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating module access:', error);
    return res.status(500).json({ success: false, error: 'Failed to update module access' });
  }
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(req, res) {
  const { company_id } = req.user;
  const { roleId } = req.params;

  try {
    // Get all permissions for the role
    const [assignedPermissions] = await pool.query(`
      SELECT p.permission_id 
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = ? AND rp.company_id = ?
    `, [roleId, company_id]);

    // Get all permissions grouped by module and submodule
    const [modules] = await pool.query(`
      SELECT 
        m.module_id, 
        m.module_name, 
        m.display_name as module_display_name,
        s.submodule_id,
        s.submodule_name,
        s.display_name as submodule_display_name,
        p.permission_id,
        p.action,
        p.description
      FROM modules m
      JOIN submodules s ON m.module_id = s.module_id
      JOIN permissions p ON s.submodule_id = p.submodule_id
      WHERE p.company_id = ?
      ORDER BY m.module_name, s.submodule_name, p.action
    `, [company_id]);

    // Group data for the response
    const result = [];
    let currentModule = null;
    let currentSubmodule = null;

    modules.forEach(row => {
      // Add module if not already added
      if (!currentModule || currentModule.module_id !== row.module_id) {
        currentModule = {
          module_id: row.module_id,
          module_name: row.module_name,
          display_name: row.module_display_name,
          submodules: []
        };
        result.push(currentModule);
        currentSubmodule = null;
      }

      // Add submodule if not already added
      if (!currentSubmodule || currentSubmodule.submodule_id !== row.submodule_id) {
        currentSubmodule = {
          submodule_id: row.submodule_id,
          submodule_name: row.submodule_name,
          display_name: row.submodule_display_name,
          permissions: []
        };
        currentModule.submodules.push(currentSubmodule);
      }

      // Add permission
      currentSubmodule.permissions.push({
        permission_id: row.permission_id,
        action: row.action,
        description: row.description,
        is_assigned: assignedPermissions.some(p => p.permission_id === row.permission_id)
      });
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting role permissions:', error);
    return res.status(500).json({ success: false, error: 'Failed to get role permissions' });
  }
}

/**
 * Update role permissions
 */
export async function updateRolePermissions(req, res) {
  const { company_id } = req.user;
  const { role_id, permission_id, is_assigned } = req.body;

  if (typeof role_id === 'undefined' || 
      typeof permission_id === 'undefined' || 
      typeof is_assigned === 'undefined') {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    if (is_assigned) {
      // Add permission to role
      await pool.query(`
        INSERT IGNORE INTO role_permissions (role_id, permission_id, company_id)
        VALUES (?, ?, ?)
      `, [role_id, permission_id, company_id]);
    } else {
      // Remove permission from role
      await pool.query(`
        DELETE FROM role_permissions 
        WHERE role_id = ? AND permission_id = ? AND company_id = ?
      `, [role_id, permission_id, company_id]);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return res.status(500).json({ success: false, error: 'Failed to update role permissions' });
  }
}
