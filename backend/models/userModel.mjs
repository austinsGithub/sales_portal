import pool from '../db/pool.mjs';

/**
 * Get the raw user row by email (no joins, exact schema columns).
 * Returns: { user_id, company_id, username, email, password_hash, is_active, created_at, updated_at, ... } or null
 */
export async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `
    SELECT
      user_id,
      company_id,
      username,
      email,
      password_hash,
      is_active,
      is_super_admin,
      first_name,
      last_name,
      phone,
      last_login,
      created_at,
      updated_at
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [email]
  );
  return rows[0] || null;
}

/**
 * Get ALL roles for a user (as rows). Use this to build effective permissions from multiple roles.
 * Returns: [{ role_id, role_name, assigned_at }, ...]
 */
export async function getUserRoles(user_id) {
  const [rows] = await pool.query(
    `
    SELECT
      r.role_id,
      r.role_name,
      ur.assigned_at
    FROM user_roles ur
    JOIN roles r ON r.role_id = ur.role_id
    WHERE ur.user_id = ?
    ORDER BY ur.assigned_at DESC, r.role_name ASC
    `,
    [user_id]
  );
  return rows;
}

/**
 * Convenience: Get one "primary" role (most recently assigned) if you really need a single role.
 * Returns: { role_id, role_name, assigned_at } or null
 */
export async function getPrimaryUserRole(user_id) {
  const [rows] = await pool.query(
    `
    SELECT
      r.role_id,
      r.role_name,
      ur.assigned_at
    FROM user_roles ur
    JOIN roles r ON r.role_id = ur.role_id
    WHERE ur.user_id = ?
    ORDER BY ur.assigned_at DESC, r.role_name ASC
    LIMIT 1
    `,
    [user_id]
  );
  return rows[0] || null;
}

/**
 * Get all users with aggregated role names (comma-separated).
 * NOTE: Uses GROUP_CONCAT (MySQL 5.7/8.0 compatible). For JSON array, see alt below.
 */
export async function getAllUsers() {
  const [rows] = await pool.query(
    `
    SELECT
      u.user_id,
      u.company_id,
      u.username,
      u.email,
      u.is_active,
      u.created_at,
      COALESCE(GROUP_CONCAT(DISTINCT r.role_name ORDER BY ur.assigned_at DESC SEPARATOR ', '), '') AS roles
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r       ON ur.role_id = r.role_id
    GROUP BY u.user_id
    ORDER BY u.created_at DESC
    `
  );
  return rows;
}

/**
 * Update user details
 * @param {number} userId - The ID of the user to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<boolean>} - Returns true if update was successful
 */
export async function updateUser(userId, updates) {
  const allowedFields = [
    'first_name',
    'last_name',
    'email',
    'phone',
    'username',
    'is_active',
    'is_super_admin',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'country'
  ];

  // Filter updates to only include allowed fields
  const validUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key) && updates[key] !== undefined) {
      validUpdates[key] = updates[key];
    }
  });

  if (Object.keys(validUpdates).length === 0) {
    return false; // No valid fields to update
  }

  const setClause = Object.keys(validUpdates)
    .map(field => `${field} = ?`)
    .join(', ');
  
  const values = [
    ...Object.values(validUpdates),
    userId
  ];

  try {
    const [result] = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      console.error(`User not found with ID: ${userId}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating user:', error);
    console.error('Query:', `UPDATE users SET ${setClause} WHERE user_id = ?`);
    console.error('Values:', values);
    throw error; // Re-throw to be handled by the route handler
  }
}

/* ---------- OPTIONAL: JSON array of roles (MySQL 8.0+) ----------
export async function getAllUsersJsonRoles() {
  const [rows] = await pool.query(
    `
    SELECT
      u.user_id,
      u.company_id,
      u.username,
      u.email,
      u.is_active,
      u.created_at,
      JSON_ARRAYAGG(
        DISTINCT JSON_OBJECT(
          'role_id', r.role_id,
          'role_name', r.role_name,
          'assigned_at', ur.assigned_at
        )
      ) AS roles
    FROM users u
    LEFT JOIN user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN roles r       ON ur.role_id = r.role_id
    GROUP BY u.user_id
    ORDER BY u.created_at DESC
    `
  );
  return rows;
}
------------------------------------------------------------------ */
