import pool from '../../db/pool.mjs';

function requireCompany(company_id) {
  if (!company_id) throw new Error('company_id is required');
}

export const BinsModel = {
  async binInUse({ company_id, bin_id }) {
    requireCompany(company_id);
    if (!bin_id) throw new Error('bin_id is required');

    // Only enforce the rule if the inventory table tracks bin_id
    const [columnCheck] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'inventory'
         AND column_name = 'bin_id'`
    );

    if (!columnCheck?.[0]?.cnt) return false;

    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM inventory
       WHERE company_id = ? AND bin_id = ?`,
      [company_id, bin_id]
    );

    return row?.cnt > 0;
  },

  async list({ company_id, location_id, q, limit = 50, offset = 0 } = {}) {
    requireCompany(company_id);
    const params = [company_id];
    let sql = `
      SELECT 
        b.bin_id,
        b.company_id,
        b.location_id,
        b.aisle,
        b.rack,
        b.shelf,
        b.bin,
        b.zone,
        b.description,
        b.is_active,
        b.created_at,
        l.location_name
      FROM bins b
      LEFT JOIN locations l 
        ON b.location_id = l.location_id 
        AND l.company_id = b.company_id
      WHERE b.company_id = ?
    `;

    if (location_id) {
      sql += ' AND b.location_id = ?';
      params.push(location_id);
    }

    if (q) {
      const like = `%${q}%`;
      sql += `
        AND (
          b.aisle LIKE ? OR b.rack LIKE ? OR b.shelf LIKE ? OR b.bin LIKE ? OR 
          b.zone LIKE ? OR b.description LIKE ? OR l.location_name LIKE ?
        )
      `;
      params.push(like, like, like, like, like, like, like);
    }

    sql += `
      ORDER BY l.location_name ASC, b.aisle ASC, b.rack ASC, b.shelf ASC, b.bin ASC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit) || 50, Number(offset) || 0);

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  async create({ company_id, location_id, aisle, rack, shelf, bin, zone, description }) {
    requireCompany(company_id);
    const [result] = await pool.query(
      `INSERT INTO bins (
        company_id, location_id, aisle, rack, shelf, bin, zone, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        location_id,
        aisle || null,
        rack || null,
        shelf || null,
        bin || null,
        zone || null,
        description || null
      ]
    );
    return { bin_id: result.insertId };
  },

  async update({ company_id, bin_id, patch = {} }) {
    requireCompany(company_id);
    if (!bin_id) throw new Error('bin_id is required');

    const allowed = ['location_id', 'aisle', 'rack', 'shelf', 'bin', 'zone', 'description', 'is_active'];
    const entries = Object.entries(patch).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (!entries.length) return;

    const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
    const params = entries.map(([_, v]) => v);
    params.push(company_id, bin_id);

    await pool.query(
      `UPDATE bins SET ${setSql} WHERE company_id = ? AND bin_id = ?`,
      params
    );
  },

  async softDelete({ company_id, bin_id }) {
    requireCompany(company_id);
    if (!bin_id) throw new Error('bin_id is required');

    const inUse = await this.binInUse({ company_id, bin_id });
    if (inUse) {
      const error = new Error('Cannot delete bin that contains inventory');
      error.code = 'BIN_IN_USE';
      throw error;
    }

    await pool.query(
      `UPDATE bins SET is_active = 0 WHERE company_id = ? AND bin_id = ?`,
      [company_id, bin_id]
    );
  }
};
