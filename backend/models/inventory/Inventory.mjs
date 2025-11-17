import pool from '../../db/pool.mjs';

/**
 * Get inventory data for a given part ID
 * Includes supplier, lot, and location details
 * Uses expiration_date from the lots table only
 */
export async function getInventoryByPartId(partId) {
  const [rows] = await pool.query(
    `
    SELECT
      i.inventory_id,
      i.part_id,
      i.lot_id,
      i.supplier_id,
      s.supplier_name,
      l.lot_number,
      l.supplier_lot_number,
      l.expiration_date AS expiration_date,
      i.quantity_on_hand,
      i.quantity_available,
      i.received_date,
      i.location,
      loc.location_name,
      loc.city,
      loc.state,
      loc.country,
      CASE
        WHEN l.expiration_date < CURDATE() THEN 'Expired'
        WHEN l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          THEN 'Expiring Soon'
        ELSE 'Active'
      END AS status
    FROM inventory i
    LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
    LEFT JOIN lots l ON i.lot_id = l.lot_id
    LEFT JOIN locations loc ON i.location_id = loc.location_id
    WHERE i.part_id = ?
      AND i.is_active = 1
    ORDER BY l.expiration_date ASC;
    `,
    [partId]
  );

  return rows;
}

/**
 * Get inventory data for a given product ID
 * Resolves product → part → lot + inventory chain
 * Uses expiration_date from the lots table only
 */
export async function getInventoryByProductId(productId) {
  const [rows] = await pool.query(
    `
    SELECT
      i.inventory_id,
      i.part_id,
      p.product_id,
      p.product_name,
      p.public_sku,
      l.lot_id,
      l.lot_number,
      l.expiration_date AS expiration_date,
      i.supplier_id,
      s.supplier_name,
      i.quantity_on_hand,
      i.quantity_available,
      i.received_date,
      loc.location_name,
      loc.city,
      loc.state,
      loc.country,
      CASE
        WHEN l.expiration_date < CURDATE() THEN 'Expired'
        WHEN l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          THEN 'Expiring Soon'
        ELSE 'Active'
      END AS status
    FROM products p
    LEFT JOIN parts pr ON p.part_id = pr.part_id
    LEFT JOIN inventory i ON pr.part_id = i.part_id
    LEFT JOIN lots l ON i.lot_id = l.lot_id
    LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
    LEFT JOIN locations loc ON i.location_id = loc.location_id
    WHERE p.product_id = ?
      AND i.is_active = 1
      AND i.quantity_available > 0
    ORDER BY l.expiration_date ASC;
    `,
    [productId]
  );

  return rows;
}

/**
 * Get all inventory with comprehensive filtering
 * Supports search by part, supplier, lot, location, and status
 */
export async function getAllInventory({ companyId, filters = {}, limit = 50, offset = 0 }) {
  let sql = `
    SELECT
      i.inventory_id,
      i.part_id,
      i.lot_id,
      i.supplier_id,
      i.location_id,
      i.quantity_on_hand,
      i.quantity_available,
      i.quantity_reserved,
      i.quantity_on_order,
      i.serial_number,
      i.received_date,
      i.is_active,
      p.product_name,
      p.sku,
      p.gtin,
      l.lot_number,
      l.supplier_lot_number,
      l.expiration_date,
      l.manufacture_date,
      s.supplier_name,
      loc.location_name,
      w.warehouse_name,
      CASE
        WHEN l.expiration_date < CURDATE() THEN 'Expired'
        WHEN l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          THEN 'Expiring Soon'
        ELSE 'Active'
      END AS status
    FROM inventory i
    LEFT JOIN parts p ON i.part_id = p.part_id
    LEFT JOIN lots l ON i.lot_id = l.lot_id
    LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
    LEFT JOIN locations loc ON i.location_id = loc.location_id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.warehouse_id
    WHERE i.company_id = ?
  `;

  const params = [companyId];

  // Apply filters
  if (filters.search) {
    sql += ` AND (
      p.product_name LIKE ? OR 
      p.sku LIKE ? OR 
      p.gtin LIKE ? OR
      l.lot_number LIKE ? OR
      l.supplier_lot_number LIKE ? OR
      s.supplier_name LIKE ? OR
      loc.location_name LIKE ? OR
      i.serial_number LIKE ?
    )`;
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (filters.supplierId) {
    sql += ` AND i.supplier_id = ?`;
    params.push(filters.supplierId);
  }

  if (filters.partId) {
    sql += ` AND i.part_id = ?`;
    params.push(filters.partId);
  }

  if (filters.lotId) {
    sql += ` AND i.lot_id = ?`;
    params.push(filters.lotId);
  }

  if (filters.locationId) {
    sql += ` AND i.location_id = ?`;
    params.push(filters.locationId);
  }

  if (filters.status) {
    if (filters.status === 'Expired') {
      sql += ` AND l.expiration_date < CURDATE()`;
    } else if (filters.status === 'Expiring Soon') {
      sql += ` AND l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
    } else if (filters.status === 'Active') {
      sql += ` AND (l.expiration_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) OR l.expiration_date IS NULL)`;
    }
  }

  sql += ` ORDER BY 
    CASE 
      WHEN l.expiration_date < CURDATE() THEN 0
      WHEN l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1
      ELSE 2
    END,
    l.expiration_date ASC
    LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const [rows] = await pool.query(sql, params);

  // Get total count with same filters
  let countSql = `
    SELECT COUNT(*) AS total
    FROM inventory i
    LEFT JOIN parts p ON i.part_id = p.part_id
    LEFT JOIN lots l ON i.lot_id = l.lot_id
    LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
    LEFT JOIN locations loc ON i.location_id = loc.location_id
    WHERE i.company_id = ?
  `;
  
  const countParams = [companyId];

  // Apply same filters for count
  if (filters.search) {
    countSql += ` AND (
      p.product_name LIKE ? OR 
      p.sku LIKE ? OR 
      p.gtin LIKE ? OR
      l.lot_number LIKE ? OR
      l.supplier_lot_number LIKE ? OR
      s.supplier_name LIKE ? OR
      loc.location_name LIKE ? OR
      i.serial_number LIKE ?
    )`;
    const searchTerm = `%${filters.search}%`;
    countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (filters.supplierId) {
    countSql += ` AND i.supplier_id = ?`;
    countParams.push(filters.supplierId);
  }

  if (filters.partId) {
    countSql += ` AND i.part_id = ?`;
    countParams.push(filters.partId);
  }

  if (filters.lotId) {
    countSql += ` AND i.lot_id = ?`;
    countParams.push(filters.lotId);
  }

  if (filters.locationId) {
    countSql += ` AND i.location_id = ?`;
    countParams.push(filters.locationId);
  }

  if (filters.status) {
    if (filters.status === 'Expired') {
      countSql += ` AND l.expiration_date < CURDATE()`;
    } else if (filters.status === 'Expiring Soon') {
      countSql += ` AND l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
    } else if (filters.status === 'Active') {
      countSql += ` AND (l.expiration_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) OR l.expiration_date IS NULL)`;
    }
  }

  const [[{ total }]] = await pool.query(countSql, countParams);

  return { data: rows, total };
}
