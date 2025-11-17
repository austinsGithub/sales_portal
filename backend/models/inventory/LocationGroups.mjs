import pool from '../../db/pool.mjs';

export const LocationGroupsModel = {
  async getAll({ company_id, q, limit, offset }) {
    let sql = `
      SELECT 
        group_id,
        group_name,
        description,
        state,
        is_active,
        created_at
      FROM location_groups
      WHERE is_active = 1
    `;
    const params = [];

    if (q) {
      sql += ` AND (
        group_name LIKE ? OR description LIKE ? OR state LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    sql += ` ORDER BY group_name ASC`;

    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    try {
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (error) {
      console.error('Database error in LocationGroupsModel.getAll:', error);
      throw error;
    }
  },

  async getById({ group_id }) {
    const [rows] = await pool.query(
      `SELECT 
        group_id,
        group_name,
        description,
        state,
        is_active,
        created_at
       FROM location_groups
       WHERE group_id = ? AND is_active = 1`,
      [group_id]
    );
    return rows[0];
  },

  async getWithLocationCount({ company_id }) {
    const sql = `
      SELECT 
        lg.group_id,
        lg.group_name,
        lg.description,
        lg.state,
        lg.is_active,
        lg.created_at,
        COUNT(l.location_id) as location_count
      FROM location_groups lg
      LEFT JOIN locations l ON lg.group_id = l.location_group_id 
        AND l.company_id = ? 
        AND l.is_active = 1
      WHERE lg.is_active = 1
      GROUP BY lg.group_id
      ORDER BY lg.group_name ASC
    `;
    
    try {
      const [rows] = await pool.query(sql, [company_id]);
      return rows;
    } catch (error) {
      console.error('Database error in LocationGroupsModel.getWithLocationCount:', error);
      throw error;
    }
  },

  async create({ group_name, description, state }) {
    const [result] = await pool.query(
      `INSERT INTO location_groups 
        (group_name, description, state, is_active)
       VALUES (?, ?, ?, 1)`,
      [group_name, description || null, state || null]
    );
    return { group_id: result.insertId, group_name };
  },

  async update({ group_id, patch }) {
    const fields = Object.keys(patch)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.values(patch);

    if (!fields) return;

    await pool.query(
      `UPDATE location_groups SET ${fields} WHERE group_id = ?`,
      [...values, group_id]
    );
  },

  async softDelete({ group_id }) {
    // Check if any locations are using this group
    const [locations] = await pool.query(
      `SELECT COUNT(*) as count FROM locations WHERE location_group_id = ? AND is_active = 1`,
      [group_id]
    );

    if (locations[0].count > 0) {
      throw new Error('Cannot delete location group that has active locations assigned to it');
    }

    await pool.query(
      `UPDATE location_groups SET is_active = 0 WHERE group_id = ?`,
      [group_id]
    );
  }
};
