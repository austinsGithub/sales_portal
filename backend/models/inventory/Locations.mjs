import pool from '../../db/pool.mjs';

export const ProcurementLocationsModel = {
  async getAll({ company_id, q, limit, offset }) {
    let sql = `
      SELECT 
        l.location_id,
        l.company_id,
        l.location_group_id,
        l.location_name,
        l.location_type,
        l.address,
        l.city,
        l.state,
        l.country,
        l.postal_code,
        l.is_active,
        l.created_at,
        lg.group_name,
        lg.description as group_description
      FROM locations l
      LEFT JOIN location_groups lg ON l.location_group_id = lg.group_id AND lg.is_active = 1
      WHERE l.company_id = ?
        AND l.location_type = 'warehouse'
        AND l.is_active = 1
    `;
    const params = [company_id];

    if (q) {
      sql += ` AND (
        l.location_name LIKE ? OR l.city LIKE ? OR l.state LIKE ? OR l.address LIKE ? OR lg.group_name LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    sql += ` ORDER BY l.location_name ASC`;

    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    try {
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (error) {
      console.error('Database error in ProcurementLocationsModel.getAll:', error);
      throw error;
    }
  },

  async create({ company_id, location_name, location_group_id, address, city, state, country, postal_code }) {
    const [result] = await pool.query(
      `INSERT INTO locations 
        (company_id, location_group_id, location_name, location_type, address, city, state, country, postal_code, is_active)
       VALUES (?, ?, ?, 'warehouse', ?, ?, ?, ?, ?, 1)`,
      [company_id, location_group_id || null, location_name, address, city, state, country, postal_code]
    );
    return { location_id: result.insertId, location_name };
  },

  async update({ company_id, location_id, patch }) {
    const fields = Object.keys(patch)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.values(patch);

    if (!fields) return;

    await pool.query(
      `UPDATE locations SET ${fields} WHERE company_id = ? AND location_id = ? AND location_type = 'warehouse'`,
      [...values, company_id, location_id]
    );
  },

  async softDelete({ company_id, location_id }) {
    await pool.query(
      `UPDATE locations SET is_active = 0 WHERE company_id = ? AND location_id = ? AND location_type = 'warehouse'`,
      [company_id, location_id]
    );
  }
};
