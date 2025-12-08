import pool from '../../db/pool.mjs';

/**
 * Get inventory for a specific part
 * Includes expiration_date from lots (not inventory)
 */
export async function getInventory(req, res) {
  try {
    const { company_id } = req.user;
    const { partId } = req.params;

    const [inventory] = await pool.query(
      `SELECT
        i.inventory_id,
        i.part_id,
        i.lot_id,
        i.supplier_id,
        i.location_id,
        i.bin_id,
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
        l.expiration_date AS expiration_date,
        s.supplier_name,
        loc.location_name,
        b.aisle,
        b.rack,
        b.shelf,
        b.bin,
        b.zone,
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
      LEFT JOIN bins b ON i.bin_id = b.bin_id AND b.company_id = i.company_id
      WHERE i.part_id = ?
        AND i.company_id = ?
      ORDER BY l.expiration_date ASC`,
      [partId, company_id]
    );

    console.log('Found inventory items:', inventory.length);
    
    // ✅ CONSISTENT RESPONSE FORMAT - matches what PartInventory.jsx expects
    return res.json({ 
      success: true,
      data: inventory,
      total: inventory.length 
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch inventory' 
    });
  }
}

/**
 * Get inventory constrained to a single location (used by transfer orders)
 * Requires locationId and returns only rows for that location with available stock
 */
export async function getInventoryByLocation(req, res) {
  try {
    const { company_id } = req.user;
    const locationId = Number(req.params.locationId || req.query.locationId);

    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const { limit = 400, offset = 0, q } = req.query;

    let sql = `
      SELECT
        i.inventory_id,
        i.part_id,
        i.lot_id,
        i.supplier_id,
        i.location_id,
        i.bin_id,
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
        l.expiration_date,
        s.supplier_name,
        loc.location_name,
        b.aisle,
        b.rack,
        b.shelf,
        b.bin,
        b.zone,
        GREATEST(
          IFNULL(i.quantity_available, i.quantity_on_hand - IFNULL(i.quantity_reserved, 0)),
          0
        ) AS computed_available
      FROM inventory i
      LEFT JOIN parts p ON i.part_id = p.part_id
      LEFT JOIN lots l ON i.lot_id = l.lot_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      LEFT JOIN locations loc ON i.location_id = loc.location_id
      LEFT JOIN bins b ON i.bin_id = b.bin_id AND b.company_id = i.company_id
      WHERE i.company_id = ?
        AND i.location_id = ?
    `;

    const params = [company_id, locationId];

    if (q) {
      sql += ` AND (
        p.product_name LIKE ? OR 
        p.sku LIKE ? OR 
        p.gtin LIKE ? OR
        l.lot_number LIKE ? OR
        i.serial_number LIKE ?
      )`;
      const term = `%${q}%`;
      params.push(term, term, term, term, term);
    }

    sql += `
      ORDER BY p.product_name ASC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (error) {
    console.error('Error fetching inventory by location:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory for location' });
  }
}

/**
 * Get inventory by product ID
 * Follows product → part → inventory → lot chain
 */
export async function getInventoryByProduct(req, res) {
  try {
    const { company_id } = req.user;
    const { productId } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        i.inventory_id,
        i.part_id,
        i.lot_id,
        i.supplier_id,
        i.location_id,
        i.bin_id,
        i.quantity_on_hand,
        i.quantity_available,
        i.quantity_reserved,
        i.quantity_on_order,
        i.serial_number,
        i.received_date,
        i.is_active,
        p.product_id,
        p.product_name,
        p.public_sku,
        pr.sku AS part_sku,
        pr.gtin AS part_gtin,
        l.lot_number,
        l.expiration_date AS expiration_date,
        s.supplier_name,
        loc.location_name,
        b.aisle,
        b.rack,
        b.shelf,
        b.bin,
        b.zone,
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
      LEFT JOIN bins b ON i.bin_id = b.bin_id AND b.company_id = i.company_id
      WHERE p.product_id = ?
        AND i.company_id = ?
        AND i.quantity_available > 0
      ORDER BY l.expiration_date ASC;
      `,
      [productId, company_id]
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('Error fetching inventory by product:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

/**
 * Get all inventory with comprehensive filtering, pagination, search, and expiration status
 */
export async function getAllInventory(req, res) {
  try {
    const { company_id } = req.user;
    const { 
      limit = 50, 
      offset = 0, 
      q, 
      supplierId, 
      partId, 
      lotId, 
      locationId, 
      status 
    } = req.query;

    let sql = `
      SELECT
        i.inventory_id,
        i.part_id,
        i.lot_id,
        i.supplier_id,
        i.location_id,
        i.bin_id,
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
        lg.group_name AS warehouse_name,
        b.aisle,
        b.rack,
        b.shelf,
        b.bin,
        b.zone,
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
      LEFT JOIN location_groups lg ON loc.location_group_id = lg.group_id
      LEFT JOIN bins b ON i.bin_id = b.bin_id AND b.company_id = i.company_id
      WHERE i.company_id = ?
    `;

    const params = [company_id];

    // Search filter
    if (q) {
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
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Supplier filter
    if (supplierId) {
      sql += ` AND i.supplier_id = ?`;
      params.push(parseInt(supplierId));
    }

    // Part filter
    if (partId) {
      sql += ` AND i.part_id = ?`;
      params.push(parseInt(partId));
    }

    // Lot filter
    if (lotId) {
      sql += ` AND i.lot_id = ?`;
      params.push(parseInt(lotId));
    }

    // Location filter
    if (locationId) {
      sql += ` AND i.location_id = ?`;
      params.push(parseInt(locationId));
    }

    // Status filter
    if (status) {
      if (status === 'Expired') {
        sql += ` AND l.expiration_date < CURDATE()`;
      } else if (status === 'Expiring Soon') {
        sql += ` AND l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
      } else if (status === 'Active') {
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

    const [inventory] = await pool.query(sql, params);

    console.log('Found inventory items:', inventory.length);

    // Count total with same filters
    let countSql = `
      SELECT COUNT(*) AS total
      FROM inventory i
      LEFT JOIN parts p ON i.part_id = p.part_id
      LEFT JOIN lots l ON i.lot_id = l.lot_id
      LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
      LEFT JOIN locations loc ON i.location_id = loc.location_id
      LEFT JOIN location_groups lg ON loc.location_group_id = lg.group_id
      WHERE i.company_id = ?
    `;
    const countParams = [company_id];

    if (q) {
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
      const searchTerm = `%${q}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (supplierId) {
      countSql += ` AND i.supplier_id = ?`;
      countParams.push(parseInt(supplierId));
    }

    if (partId) {
      countSql += ` AND i.part_id = ?`;
      countParams.push(parseInt(partId));
    }

    if (lotId) {
      countSql += ` AND i.lot_id = ?`;
      countParams.push(parseInt(lotId));
    }

    if (locationId) {
      countSql += ` AND i.location_id = ?`;
      countParams.push(parseInt(locationId));
    }

    if (status) {
      if (status === 'Expired') {
        countSql += ` AND l.expiration_date < CURDATE()`;
      } else if (status === 'Expiring Soon') {
        countSql += ` AND l.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
      } else if (status === 'Active') {
        countSql += ` AND (l.expiration_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) OR l.expiration_date IS NULL)`;
      }
    }

    const [[{ total }]] = await pool.query(countSql, countParams);

    return res.json({
      items: inventory,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching all inventory:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}
