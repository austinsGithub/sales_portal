import pool from '../../db/pool.mjs';

export const ContainerBlueprintModel = {
  async getAll({ company_id, limit, offset, q }) {
    let sql = `SELECT * FROM container_blueprints WHERE company_id = ?`;
    const params = [company_id];

    if (q) {
      sql += ` AND (blueprint_name LIKE ? OR serial_number_prefix LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY updated_at DESC`;
    
    // Only apply limit/offset if they're not undefined
    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  async countAll(company_id, q) {
    let sql = `SELECT COUNT(*) AS total FROM container_blueprints WHERE company_id = ?`;
    const params = [company_id];

    if (q) {
      sql += ` AND (blueprint_name LIKE ? OR serial_number_prefix LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    const [[{ total }]] = await pool.query(sql, params);
    return total;
  },

  async getOne(id, company_id) {
    const [[row]] = await pool.query(
      `SELECT * FROM container_blueprints 
       WHERE blueprint_id = ? AND company_id = ?`,
      [id, company_id]
    );
    return row;
  },

  async create(data) {
    const { company_id, blueprint_name, serial_number_prefix, blueprint_description, is_active } = data;
    
    if (!company_id) {
      throw new Error('Company ID is required');
    }

    const [result] = await pool.query(
      `INSERT INTO container_blueprints 
       (company_id, blueprint_name, serial_number_prefix, blueprint_description, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        company_id, 
        blueprint_name, 
        serial_number_prefix || null, 
        blueprint_description || null, 
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      ]
    );
    
    const [[created]] = await pool.query(
      `SELECT * FROM container_blueprints WHERE blueprint_id = ?`, 
      [result.insertId]
    );
    
    return created;
  },

  async update(id, patch, company_id) {
    // Don't allow updating company_id
    const { company_id: _, ...safePatch } = patch;
    
    const fields = Object.keys(safePatch)
      .filter(key => safePatch[key] !== undefined)
      .map(key => `${key} = ?`)
      .join(', ');
      
    const values = Object.values(safePatch).filter(v => v !== undefined);
    
    // Always include company_id in the WHERE clause for security
    const [result] = await pool.query(
      `UPDATE container_blueprints 
       SET ${fields || 'blueprint_id = blueprint_id'} 
       WHERE blueprint_id = ? AND company_id = ?`,
      [...values, id, company_id]
    );
    
    if (result.affectedRows === 0) {
      throw new Error('Blueprint not found or access denied');
    }
    
    const [[updated]] = await pool.query(
      `SELECT * FROM container_blueprints WHERE blueprint_id = ? AND company_id = ?`,
      [id, company_id]
    );
    
    return updated;
  },

  async getItems(blueprintId, company_id) {
    const [rows] = await pool.query(
      `SELECT 
        cbi.*,
        prod.product_name,
        prod.public_sku,
        prod.product_id,
        parts.part_id,
        parts.product_name AS part_product_name,
        parts.sku AS part_sku,
        parts.gtin AS part_gtin,
        parts.unit_of_measure AS part_unit_of_measure,
        COALESCE(cbi.default_quantity, cbi.minimum_quantity, 1) AS required_quantity
       FROM container_blueprint_items cbi
       JOIN container_blueprints cb ON cbi.blueprint_id = cb.blueprint_id
       LEFT JOIN products prod ON cbi.product_id = prod.product_id
       LEFT JOIN parts parts ON prod.part_id = parts.part_id
       WHERE cbi.blueprint_id = ? AND cb.company_id = ?`,
      [blueprintId, company_id]
    );
    return rows;
  },

  async addItem(blueprintId, item, company_id) {
    // Verify the blueprint belongs to the company
    const [[blueprint]] = await pool.query(
      'SELECT 1 FROM container_blueprints WHERE blueprint_id = ? AND company_id = ?',
      [blueprintId, company_id]
    );
    
    if (!blueprint) {
      throw new Error('Blueprint not found or access denied');
    }

    const { product_id, minimum_quantity, maximum_quantity, default_quantity, usage_notes, lot_id = null } = item;
    
    const [result] = await pool.query(
      `INSERT INTO container_blueprint_items
       (blueprint_id, product_id, lot_id, minimum_quantity, maximum_quantity, default_quantity, usage_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        blueprintId, 
        product_id, 
        lot_id || null, 
        minimum_quantity || 0, 
        maximum_quantity || 1, 
        default_quantity || 1,
        usage_notes || ''
      ]
    );
    
    const [[created]] = await pool.query(
      `SELECT * FROM container_blueprint_items WHERE blueprint_item_id = ?`,
      [result.insertId]
    );
    
    return created;
  },

  async removeItem(blueprintId, itemId, company_id) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      // Verify the item belongs to a blueprint owned by the company
      const [[item]] = await conn.query(
        `SELECT 1 FROM container_blueprint_items cbi
         JOIN container_blueprints cb ON cbi.blueprint_id = cb.blueprint_id
         WHERE cbi.blueprint_item_id = ? AND cbi.blueprint_id = ? AND cb.company_id = ?`,
        [itemId, blueprintId, company_id]
      );
      
      if (!item) {
        throw new Error('Item not found or access denied');
      }
      
      // Delete the item
      const [result] = await conn.query(
        `DELETE FROM container_blueprint_items 
         WHERE blueprint_id = ? AND blueprint_item_id = ?`,
        [blueprintId, itemId]
      );
      
      await conn.commit();
      return { 
        success: result.affectedRows > 0,
        message: 'Item removed successfully' 
      };
    } catch (error) {
      await conn.rollback();
      console.error('Error in removeItem:', error);
      throw error;
    } finally {
      conn.release();
    }
  }
};
