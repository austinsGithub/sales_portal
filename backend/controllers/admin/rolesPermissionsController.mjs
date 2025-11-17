import pool from '../../db/pool.mjs';

/** ========== ROLES ========== */
export async function getRoles(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM roles WHERE company_id = ? ORDER BY role_name ASC',
      [req.user.company_id]
    );
    return res.json({ success: true, roles: rows });
  } catch (err) {
    console.error('getRoles error', err);
    return res.status(500).json({ success: false, msg: 'Failed to load roles' });
  }
}

export async function createRole(req, res) {
  try {
    const { role_name } = req.body;
    if (!role_name) return res.status(400).json({ success: false, msg: 'Missing role_name' });

    const [result] = await pool.query(
      'INSERT INTO roles (role_name, company_id, created_at) VALUES (?, ?, NOW())',
      [role_name, req.user.company_id]
    );

    const [rows] = await pool.query('SELECT * FROM roles WHERE role_id = ?', [result.insertId]);
    return res.json({ success: true, role: rows[0] });
  } catch (err) {
    console.error('createRole error', err);
    return res.status(500).json({ success: false, msg: 'Failed to create role' });
  }
}

/** ========== PERMISSIONS ========== */
export async function getPermissions(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.permission_id,
        p.action,
        m.module_name,
        s.submodule_name
      FROM permissions p
      LEFT JOIN modules m     ON m.module_id = p.module_id
      LEFT JOIN submodules s  ON s.submodule_id = p.submodule_id
      ORDER BY m.module_name, s.submodule_name, p.action
    `);
    return res.json({ success: true, permissions: rows });
  } catch (err) {
    console.error('getPermissions error', err);
    return res.status(500).json({ success: false, msg: 'Failed to load permissions' });
  }
}

export async function createPermission(req, res) {
  try {
    const { action } = req.body;
    if (!action) return res.status(400).json({ success: false, msg: 'Missing action' });

    const [result] = await pool.query(
      'INSERT INTO permissions (action, company_id, created_at) VALUES (?, ?, NOW())',
      [action, req.user.company_id]
    );

    const [rows] = await pool.query('SELECT * FROM permissions WHERE permission_id = ?', [result.insertId]);
    return res.json({ success: true, permission: rows[0] });
  } catch (err) {
    console.error('createPermission error', err);
    return res.status(500).json({ success: false, msg: 'Failed to create permission' });
  }
}

/** ========== ROLE PERMISSIONS ========== */
export async function getRolePermissions(req, res) {
  try {
    const { roleId } = req.params;
    const [rows] = await pool.query(
      'SELECT permission_id FROM role_permissions WHERE role_id = ? AND company_id = ?',
      [roleId, req.user.company_id]
    );
    return res.json({ success: true, permissions: rows.map(r => r.permission_id) });
  } catch (err) {
    console.error('getRolePermissions error', err);
    return res.status(500).json({ success: false, msg: 'Failed to load role permissions' });
  }
}

export async function assignRolePermission(req, res) {
  try {
    const { role_id, permission_id } = req.body;
    if (!role_id || !permission_id) {
      return res.status(400).json({ success: false, msg: 'Missing role_id or permission_id' });
    }
    await pool.query(
      'INSERT IGNORE INTO role_permissions (role_id, permission_id, company_id) VALUES (?, ?, ?)',
      [role_id, permission_id, req.user.company_id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('assignRolePermission error', err);
    return res.status(500).json({ success: false, msg: 'Failed to assign permission' });
  }
}

export async function removeRolePermission(req, res) {
  try {
    const { role_id, permission_id } = req.body;
    if (!role_id || !permission_id) {
      return res.status(400).json({ success: false, msg: 'Missing role_id or permission_id' });
    }
    await pool.query(
      'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ? AND company_id = ?',
      [role_id, permission_id, req.user.company_id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('removeRolePermission error', err);
    return res.status(500).json({ success: false, msg: 'Failed to remove permission' });
  }
}
