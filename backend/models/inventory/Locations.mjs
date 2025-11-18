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
  },

  async getInventoryByLocation({ company_id, location_id, q, limit, offset }) {
    if (!location_id) {
      return {
        items: [],
        total: 0,
        summary: {
          totalQuantityOnHand: 0,
          totalQuantityAvailable: 0,
          totalQuantityReserved: 0,
          uniquePartCount: 0,
          uniqueSkuCount: 0
        }
      };
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const limitValue = Number.isFinite(parsedLimit) ? Math.max(parsedLimit, 1) : 25;
    const offsetValue = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const baseParams = [company_id, location_id];
    let searchClause = '';
    let searchParams = [];

    if (q) {
      searchClause = ` AND (
        p.product_name LIKE ? OR
        p.sku LIKE ? OR
        p.description LIKE ? OR
        s.supplier_name LIKE ? OR
        lt.lot_number LIKE ? OR
        lt.supplier_lot_number LIKE ? OR
        i.serial_number LIKE ?
      )`;
      const like = `%${q}%`;
      searchParams = [like, like, like, like, like, like, like];
    }

    const selectSql = `
      SELECT
        i.inventory_id,
        i.part_id,
        i.lot_id,
        p.product_name,
        p.sku,
        p.category,
        i.quantity_on_hand,
        i.quantity_available,
        i.quantity_reserved,
        i.serial_number,
        i.received_date,
        s.supplier_name,
        lt.lot_number,
        lt.supplier_lot_number,
        lt.manufacture_date,
        lt.expiration_date,
        CASE
          WHEN lt.expiration_date IS NULL THEN 'No Expiration'
          WHEN lt.expiration_date < CURDATE() THEN 'Expired'
          WHEN lt.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Expiring Soon'
          ELSE 'Active'
        END AS status
      FROM inventory i
      LEFT JOIN parts p ON i.part_id = p.part_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      LEFT JOIN lots lt ON i.lot_id = lt.lot_id
      WHERE i.company_id = ?
        AND i.location_id = ?
        AND i.is_active = 1
        ${searchClause}
      ORDER BY p.product_name ASC, lt.expiration_date ASC
      LIMIT ? OFFSET ?
    `;

    const summarySql = `
      SELECT
        COUNT(*) AS totalItems,
        COALESCE(SUM(i.quantity_on_hand), 0) AS totalQuantityOnHand,
        COALESCE(SUM(i.quantity_available), 0) AS totalQuantityAvailable,
        COALESCE(SUM(i.quantity_reserved), 0) AS totalQuantityReserved,
        COUNT(DISTINCT i.part_id) AS uniquePartCount,
        COUNT(DISTINCT p.sku) AS uniqueSkuCount
      FROM inventory i
      LEFT JOIN parts p ON i.part_id = p.part_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      LEFT JOIN lots lt ON i.lot_id = lt.lot_id
      WHERE i.company_id = ?
        AND i.location_id = ?
        AND i.is_active = 1
        ${searchClause}
    `;

    const selectParams = [...baseParams, ...searchParams, limitValue, offsetValue];
    const summaryParams = [...baseParams, ...searchParams];

    const [items] = await pool.query(selectSql, selectParams);
    const [[summaryRow = {}]] = await pool.query(summarySql, summaryParams);

    return {
      items,
      total: Number(summaryRow.totalItems) || 0,
      summary: {
        totalQuantityOnHand: Number(summaryRow.totalQuantityOnHand) || 0,
        totalQuantityAvailable: Number(summaryRow.totalQuantityAvailable) || 0,
        totalQuantityReserved: Number(summaryRow.totalQuantityReserved) || 0,
        uniquePartCount: Number(summaryRow.uniquePartCount) || 0,
        uniqueSkuCount: Number(summaryRow.uniqueSkuCount) || 0
      }
    };
  }
};
