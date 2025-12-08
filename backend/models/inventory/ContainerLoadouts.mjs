import pool from '../../db/pool.mjs';

export const ContainerLoadoutsModel = {
  /**
   * Retrieves a list of container loadouts for a given company, with optional search and pagination.
   * Joins with blueprints and locations for display data.
   * @param {number} company_id - The ID of the company to filter by.
   * @param {object} options
   * @param {number} [options.limit] - The maximum number of results to return.
   * @param {number} [options.offset] - The number of results to skip.
   * @param {string} [options.q] - Search query for loadout details.
   * @returns {Promise<Array<object>>} - The list of loadouts.
   */
  async getAll({ company_id, limit, offset, q, blueprint_id, location_id, includeInactive = false }) {
    let sql = `
      SELECT 
        cl.*,
        cb.blueprint_name,
        cb.serial_number_prefix,
        l.location_name,
        CONCAT(COALESCE(cb.serial_number_prefix, ''), COALESCE(cl.serial_suffix, '')) as full_serial
      FROM container_loadouts cl
      LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
      LEFT JOIN locations l ON cl.location_id = l.location_id
      WHERE cl.company_id = ?
    `;
    const params = [company_id];

    if (!includeInactive) {
      sql += ' AND cl.is_active = 1';
    }

    if (blueprint_id) {
      sql += ' AND cl.blueprint_id = ?';
      params.push(Number(blueprint_id));
    }

    if (location_id) {
      sql += ' AND cl.location_id = ?';
      params.push(Number(location_id));
    }

    if (q) {
      sql += ` AND (
        cl.serial_suffix LIKE ? OR 
        cb.blueprint_name LIKE ? OR
        CONCAT(COALESCE(cb.serial_number_prefix, ''), COALESCE(cl.serial_suffix, '')) LIKE ?
      )`;
      const qWildcard = `%${q}%`;
      params.push(qWildcard, qWildcard, qWildcard);
    }

    sql += ` ORDER BY cl.created_at DESC`;

    // Only apply limit/offset if they're explicitly provided
    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  /**
   * Counts the total number of loadouts matching the query for a company.
   * @param {number} company_id - The ID of the company.
   * @param {string} [q] - Search query.
   * @returns {Promise<number>} - The total count.
   */
  async countAll({ company_id, q, blueprint_id, location_id, includeInactive = false }) {
    let sql = `
      SELECT COUNT(cl.loadout_id) AS total
      FROM container_loadouts cl
      LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
      WHERE cl.company_id = ?
    `;
    const params = [company_id];

    if (!includeInactive) {
      sql += ' AND cl.is_active = 1';
    }

    if (blueprint_id) {
      sql += ' AND cl.blueprint_id = ?';
      params.push(Number(blueprint_id));
    }

    if (location_id) {
      sql += ' AND cl.location_id = ?';
      params.push(Number(location_id));
    }

    if (q) {
      sql += ` AND (
        cl.serial_suffix LIKE ? OR 
        cb.blueprint_name LIKE ? OR
        CONCAT(COALESCE(cb.serial_number_prefix, ''), COALESCE(cl.serial_suffix, '')) LIKE ?
      )`;
      const qWildcard = `%${q}%`;
      params.push(qWildcard, qWildcard, qWildcard);
    }

    const [[{ total }]] = await pool.query(sql, params);
    return total;
  },

  /**
   * Retrieves a single loadout by ID and company ID.
   * @param {number} id - The loadout ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object|null>} - The loadout object or null if not found/no access.
   */
  async getById(id, company_id) {
    const sql = `
      SELECT 
        cl.*,
        cb.blueprint_name,
        cb.serial_number_prefix,
        l.location_name,
        CONCAT(COALESCE(cb.serial_number_prefix, ''), COALESCE(cl.serial_suffix, '')) as full_serial
      FROM container_loadouts cl
      LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
      LEFT JOIN locations l ON cl.location_id = l.location_id
      WHERE cl.loadout_id = ? AND cl.company_id = ?
    `;
    const [[row]] = await pool.query(sql, [id, company_id]);
    return row;
  },

  /**
   * Creates a new container loadout.
   * NOTE: company_id is provided in the data and is critical for security.
   * @param {object} data - Loadout data. Must include company_id.
   * @returns {Promise<object>} - The newly created loadout object.
   */
  async create(data) {
    const { 
      blueprint_id, company_id, location_id, serial_suffix, status, notes, created_by
    } = data;
    
    const [result] = await pool.query(
      `INSERT INTO container_loadouts (
        company_id,
        blueprint_id,
        location_id,
        serial_suffix,
        notes,
        created_by,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        blueprint_id,
        location_id,
        serial_suffix,
        notes || null,
        created_by,
        data.is_active !== undefined ? data.is_active : 1
      ]
    );
    
    // Return the full object including joined names
    return this.getById(result.insertId, company_id);
  },

  /**
   * Updates a container loadout.
   * @param {number} id - The loadout ID.
   * @param {object} patch - The fields to update.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - The updated loadout object.
   */
  async update(id, patch, company_id) {
    // Prevent updating company_id directly
    const { company_id: _, loadout_id: __, created_at: ___, ...safePatch } = patch;
    
    // If status was provided, convert to is_active
    if (safePatch.status !== undefined) {
      safePatch.is_active = safePatch.status === 'Active' ? 1 : 0;
      delete safePatch.status;
    }
    
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
      `UPDATE container_loadouts 
       SET ${fields} 
       WHERE loadout_id = ? AND company_id = ?`,
      [...values, id, company_id]
    );
    
    if (result.affectedRows === 0) {
      const existing = await this.getById(id, company_id);
      if (!existing) {
        throw new Error('Loadout not found or access denied');
      }
    }
    
    return this.getById(id, company_id);
  },

  /**
   * Retrieves all assigned lots for a specific loadout.
   * @param {number} loadout_id - The loadout ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<Array<object>>} - The list of assigned lots.
   */
  async getLotsByLoadoutId(loadout_id, company_id) {
    const sql = `
      SELECT 
        cll.*,
        p.product_name,
        l.lot_number
      FROM container_loadout_lots cll
      JOIN container_loadouts cl ON cll.loadout_id = cl.loadout_id
      LEFT JOIN products p ON cll.product_id = p.product_id
      LEFT JOIN lots l ON cll.lot_id = l.lot_id
      WHERE cll.loadout_id = ? AND cl.company_id = ?
    `;
    const [rows] = await pool.query(sql, [loadout_id, company_id]);
    return rows;
  },

  /**
   * Adds a lot to a container loadout and updates inventory.
   * @param {number} loadout_id - The loadout ID.
   * @param {number} company_id - The company ID for security.
   * @param {object} lotData - The lot assignment data.
   * @returns {Promise<object>} - The newly created loadout lot object.
   */
  async addLotToLoadout(loadout_id, company_id, lotData) {
    const { product_id, lot_id, quantity_used, notes } = lotData;

    // Use a transaction to ensure atomic operation
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verify the loadout belongs to the company
      const [[loadout]] = await connection.query(
        `SELECT loadout_id FROM container_loadouts WHERE loadout_id = ? AND company_id = ?`,
        [loadout_id, company_id]
      );
      
      if (!loadout) {
        throw new Error('Loadout not found or access denied');
      }

      // Get the part_id for this product through the products table
      const [[product]] = await connection.query(
        `SELECT p.part_id 
         FROM products prod
         JOIN parts p ON prod.part_id = p.part_id
         WHERE prod.product_id = ? AND p.company_id = ?`,
        [product_id, company_id]
      );

      if (!product) {
        throw new Error('Product not found');
      }

      // Check if there's enough available inventory
      const [[inventory]] = await connection.query(
        `SELECT quantity_available FROM inventory 
         WHERE lot_id = ? AND part_id = ? AND company_id = ?`,
        [lot_id, product.part_id, company_id]
      );

      if (!inventory || inventory.quantity_available < quantity_used) {
        throw new Error('Insufficient inventory available');
      }

      // Insert the lot assignment
      const [result] = await connection.query(
        `INSERT INTO container_loadout_lots
         (loadout_id, product_id, lot_id, quantity_used, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [loadout_id, product_id, lot_id, quantity_used, notes || null]
      );

      // Update inventory - decrease available, increase reserved
      await connection.query(
        `UPDATE inventory 
         SET quantity_available = quantity_available - ?,
             quantity_reserved = quantity_reserved + ?
         WHERE lot_id = ? AND part_id = ? AND company_id = ?`,
        [quantity_used, quantity_used, lot_id, product.part_id, company_id]
      );

      await connection.commit();

      // Return the newly created lot with joined data
      const [[created]] = await pool.query(
        `SELECT cll.*, p.product_name, l.lot_number
         FROM container_loadout_lots cll
         LEFT JOIN products p ON cll.product_id = p.product_id
         LEFT JOIN lots l ON cll.lot_id = l.lot_id
         WHERE cll.loadout_lot_id = ?`,
        [result.insertId]
      );

      return created;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Removes a lot from a container loadout and updates inventory.
   * @param {number} loadout_id - The loadout ID.
   * @param {number} lot_loadout_id - The primary key (loadout_lot_id) of the container_loadout_lots table.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - Success status.
   */
  async removeLotFromLoadout(loadout_id, lot_loadout_id, company_id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('=== removeLotFromLoadout START ===');
      console.log('Parameters:', { loadout_id, lot_loadout_id, company_id });

      // Get the lot assignment details before deleting
      const [lotAssignments] = await connection.query(
        `SELECT cll.product_id, cll.lot_id, cll.quantity_used, cl.company_id
         FROM container_loadout_lots cll
         JOIN container_loadouts cl ON cll.loadout_id = cl.loadout_id
         WHERE cll.loadout_lot_id = ? AND cll.loadout_id = ? AND cl.company_id = ?`,
        [lot_loadout_id, loadout_id, company_id]
      );

      console.log('Found lot assignments:', lotAssignments.length);

      if (!lotAssignments || lotAssignments.length === 0) {
        console.log('No lot assignment found - rolling back');
        await connection.rollback();
        return { success: false, affectedRows: 0 };
      }

      const lotAssignment = lotAssignments[0];
      console.log('Lot assignment:', lotAssignment);

      // Get the part_id for this product through the products table
      // The products table has part_id, not the parts table having product_id
      const [products] = await connection.query(
        `SELECT p.part_id 
         FROM products prod
         JOIN parts p ON prod.part_id = p.part_id
         WHERE prod.product_id = ?`,
        [lotAssignment.product_id]
      );

      console.log('Found products:', products.length);

      if (products && products.length > 0) {
        const product = products[0];
        console.log('Product part_id:', product.part_id);

        // Check if inventory record exists
        const [inventories] = await connection.query(
          `SELECT inventory_id, quantity_available, quantity_reserved 
           FROM inventory 
           WHERE lot_id = ? AND part_id = ?`,
          [lotAssignment.lot_id, product.part_id]
        );

        console.log('Found inventories:', inventories.length);

        if (inventories && inventories.length > 0) {
          console.log('Updating inventory...');
          
          // Update inventory - increase available, decrease reserved
          const [updateResult] = await connection.query(
            `UPDATE inventory 
             SET quantity_available = quantity_available + ?,
                 quantity_reserved = GREATEST(0, quantity_reserved - ?)
             WHERE lot_id = ? AND part_id = ?`,
            [lotAssignment.quantity_used, lotAssignment.quantity_used, 
             lotAssignment.lot_id, product.part_id]
          );

          console.log(`Inventory updated: ${updateResult.affectedRows} rows`);
        } else {
          console.warn('No inventory record found, skipping inventory update');
        }
      } else {
        console.warn('No product found, skipping inventory update');
      }

      // Delete the lot assignment
      console.log('Attempting to delete lot assignment...');
      const [deleteResult] = await connection.query(
        `DELETE FROM container_loadout_lots WHERE loadout_lot_id = ?`,
        [lot_loadout_id]
      );

      console.log(`Delete result: ${deleteResult.affectedRows} rows deleted`);

      await connection.commit();
      console.log('=== removeLotFromLoadout SUCCESS ===');
      
      return { 
        success: deleteResult.affectedRows > 0, 
        affectedRows: deleteResult.affectedRows 
      };
      
    } catch (error) {
      await connection.rollback();
      console.error('=== removeLotFromLoadout ERROR ===');
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error stack:', error.stack);
      throw error;
    } finally {
      connection.release();
    }
  }
};
