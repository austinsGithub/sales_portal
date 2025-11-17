import pool from '../../db/pool.mjs';

// Model location: backend/models/warehouse/Locations.mjs

export const LocationsModel = {
  /**
   * Retrieves a list of locations for a given company, with optional search and pagination.
   * @param {number} company_id - The ID of the company to filter by.
   * @param {object} options
   * @param {number} [options.limit] - The maximum number of results to return.
   * @param {number} [options.offset] - The number of results to skip.
   * @param {string} [options.q] - Search query for location details.
   * @param {boolean} [options.activeOnly] - Whether to filter only active locations (default: true).
   * @returns {Promise<Array<object>>} - The list of locations.
   */
  async getAll({ company_id, limit, offset, q, activeOnly = true }) {
    let sql = `
      SELECT 
        location_id,
        company_id,
        location_name,
        location_type,
        address,
        city,
        state,
        country,
        postal_code,
        is_active,
        created_at
      FROM locations
      WHERE company_id = ?
    `;
    const params = [company_id];

    if (activeOnly) {
      sql += ` AND is_active = 1`;
    }

    if (q) {
      sql += ` AND (
        location_name LIKE ? OR 
        location_type LIKE ? OR
        city LIKE ? OR
        state LIKE ? OR
        address LIKE ?
      )`;
      const qWildcard = `%${q}%`;
      params.push(qWildcard, qWildcard, qWildcard, qWildcard, qWildcard);
    }

    sql += ` ORDER BY location_name ASC`;

    // Only apply limit/offset if they're explicitly provided
    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  /**
   * Counts the total number of locations matching the query for a company.
   * @param {number} company_id - The ID of the company.
   * @param {string} [q] - Search query.
   * @param {boolean} [activeOnly] - Whether to filter only active locations (default: true).
   * @returns {Promise<number>} - The total count.
   */
  async countAll(company_id, q, activeOnly = true) {
    let sql = `
      SELECT COUNT(location_id) AS total
      FROM locations
      WHERE company_id = ?
    `;
    const params = [company_id];

    if (activeOnly) {
      sql += ` AND is_active = 1`;
    }

    if (q) {
      sql += ` AND (
        location_name LIKE ? OR 
        location_type LIKE ? OR
        city LIKE ? OR
        state LIKE ? OR
        address LIKE ?
      )`;
      const qWildcard = `%${q}%`;
      params.push(qWildcard, qWildcard, qWildcard, qWildcard, qWildcard);
    }

    const [[{ total }]] = await pool.query(sql, params);
    return total;
  },

  /**
   * Retrieves a single location by ID and company ID.
   * @param {number} id - The location ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object|null>} - The location object or null if not found/no access.
   */
  async getById(id, company_id) {
    const sql = `
      SELECT 
        location_id,
        company_id,
        location_name,
        location_type,
        address,
        city,
        state,
        country,
        postal_code,
        is_active,
        created_at
      FROM locations
      WHERE location_id = ? AND company_id = ?
    `;
    const [[row]] = await pool.query(sql, [id, company_id]);
    return row || null;
  },

  /**
   * Creates a new location.
   * @param {object} data - Location data. Must include company_id.
   * @returns {Promise<object>} - The newly created location object.
   */
  async create(data) {
    const {
      company_id,
      location_name,
      location_type,
      address,
      city,
      state,
      country,
      postal_code
    } = data;

    if (!company_id || !location_name) {
      throw new Error('company_id and location_name are required');
    }

    const [result] = await pool.query(
      `INSERT INTO locations
       (company_id, location_name, location_type, address, city, state, country, postal_code, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        company_id,
        location_name,
        location_type || null,
        address || null,
        city || null,
        state || null,
        country || null,
        postal_code || null
      ]
    );

    return this.getById(result.insertId, company_id);
  },

  /**
   * Updates a location.
   * @param {number} id - The location ID.
   * @param {object} patch - The fields to update.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - The updated location object.
   */
  async update(id, patch, company_id) {
    // Prevent updating company_id or location_id
    const { company_id: _, location_id: __, created_at: ___, ...safePatch } = patch;

    const fields = Object.keys(safePatch)
      .filter(key => safePatch[key] !== undefined)
      .map(key => `${key} = ?`)
      .join(', ');

    const values = Object.values(safePatch).filter(v => v !== undefined);

    if (fields.length === 0) {
      // If nothing to update, just return the current object
      return this.getById(id, company_id);
    }

    // Always include company_id in the WHERE clause for security
    const [result] = await pool.query(
      `UPDATE locations
       SET ${fields}
       WHERE location_id = ? AND company_id = ?`,
      [...values, id, company_id]
    );

    if (result.affectedRows === 0) {
      const existing = await this.getById(id, company_id);
      if (!existing) {
        throw new Error('Location not found or access denied');
      }
    }

    return this.getById(id, company_id);
  },

  /**
   * Soft deletes a location by setting is_active to 0.
   * @param {number} id - The location ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - Success status.
   */
  async softDelete(id, company_id) {
    const [result] = await pool.query(
      `UPDATE locations
       SET is_active = 0
       WHERE location_id = ? AND company_id = ?`,
      [id, company_id]
    );

    return { success: result.affectedRows > 0, affectedRows: result.affectedRows };
  }
};