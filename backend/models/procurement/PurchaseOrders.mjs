// models/procurement/PurchaseOrders.mjs
import pool from '../../db/pool.mjs';

function assertCompanyId(company_id) {
  if (!company_id) throw new Error('company_id is required in model call');
}

function normalizeStatuses(status) {
  if (!status) return [];
  const raw = Array.isArray(status) ? status : String(status).split(',');
  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : String(value).trim()))
    .filter((value) => value.length > 0);
}

/**
 * List or search purchase orders
 */
export async function getPurchaseOrders({
  company_id,
  q = '',
  status,
  supplier_id,
  limit = 50,
  offset = 0,
  includeInactive = false,
} = {}) {
  assertCompanyId(company_id);
  const params = [company_id];
  let sql = `
    SELECT
      po.purchase_order_id,
      po.po_number,
      po.order_date,
      po.supplier_id,
      po.ship_to_location_id,
      po.status,
      po.requested_delivery_date,
      po.terms,
      po.shipping_method,
      po.subtotal,
      po.tax_amount,
      po.shipping_amount,
      po.total_amount,
      po.is_active,
      po.created_at,
      po.updated_at,
      s.supplier_name,
      s.supplier_code,
      l.location_name AS ship_to_location_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
    LEFT JOIN locations l ON po.ship_to_location_id = l.location_id
    WHERE po.company_id = ?
  `;

  if (!includeInactive) sql += ' AND po.is_active = 1';

  if (q) {
    sql += ' AND (po.po_number LIKE ? OR s.supplier_name LIKE ? OR s.supplier_code LIKE ?)';
    const qLike = `%${q}%`;
    params.push(qLike, qLike, qLike);
  }

  const statusFilters = normalizeStatuses(status);
  if (statusFilters.length === 1) {
    sql += ' AND po.status = ?';
    params.push(statusFilters[0]);
  } else if (statusFilters.length > 1) {
    const placeholders = statusFilters.map(() => '?').join(', ');
    sql += ` AND po.status IN (${placeholders})`;
    params.push(...statusFilters);
  }

  if (supplier_id) {
    sql += ' AND po.supplier_id = ?';
    params.push(supplier_id);
  }

  sql += ' ORDER BY po.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Count purchase orders with the same filters as getPurchaseOrders
 */
export async function countPurchaseOrders({
  company_id,
  q = '',
  status,
  supplier_id,
  includeInactive = false,
} = {}) {
  assertCompanyId(company_id);
  const params = [company_id];
  let sql = `
    SELECT COUNT(*) AS total
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
    WHERE po.company_id = ?
  `;

  if (!includeInactive) sql += ' AND po.is_active = 1';

  if (q) {
    sql += ' AND (po.po_number LIKE ? OR s.supplier_name LIKE ? OR s.supplier_code LIKE ?)';
    const qLike = `%${q}%`;
    params.push(qLike, qLike, qLike);
  }

  const statusFilters = normalizeStatuses(status);
  if (statusFilters.length === 1) {
    sql += ' AND po.status = ?';
    params.push(statusFilters[0]);
  } else if (statusFilters.length > 1) {
    const placeholders = statusFilters.map(() => '?').join(', ');
    sql += ` AND po.status IN (${placeholders})`;
    params.push(...statusFilters);
  }

  if (supplier_id) {
    sql += ' AND po.supplier_id = ?';
    params.push(supplier_id);
  }

  const [[row]] = await pool.query(sql, params);
  return row?.total || 0;
}

/**
 * Fetch single PO (optionally joined with supplier/location)
 */
export async function getPurchaseOrderById(company_id, purchase_order_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      po.*, s.supplier_name, s.supplier_code,
      l.location_name AS ship_to_location_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
    LEFT JOIN locations l ON po.ship_to_location_id = l.location_id
    WHERE po.company_id = ? AND po.purchase_order_id = ?
    `,
    [company_id, purchase_order_id]
  );
  return rows[0] || null;
}

/**
 * Generate a unique PO number
 */
async function generatePONumber(company_id) {
  const prefix = 'PO';
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  // Get the latest PO number for this company
  const [rows] = await pool.query(
    'SELECT po_number FROM purchase_orders WHERE company_id = ? ORDER BY created_at DESC LIMIT 1',
    [company_id]
  );
  
  let sequence = 1;
  if (rows.length > 0) {
    const lastPO = rows[0].po_number;
    const lastSequence = parseInt(lastPO.split('-').pop(), 10);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }
  
  return `${prefix}${year}${month}-${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create PO
 */
export async function createPurchaseOrder(company_id, data = {}) {
  assertCompanyId(company_id);
  
  // Generate a PO number if not provided
  const po_number = data.po_number || await generatePONumber(company_id);
  
  const {
    order_date,
    supplier_id,
    ship_to_location_id,
    status = 'draft',
    requested_delivery_date = null,
    terms = null,
    shipping_method = null,
    subtotal = 0,
    tax_amount = 0,
    shipping_amount = 0,
    total_amount = 0,
  } = data;

  const [result] = await pool.query(
    `
    INSERT INTO purchase_orders (
      po_number, order_date, supplier_id, ship_to_location_id,
      status, requested_delivery_date, terms, shipping_method,
      subtotal, tax_amount, shipping_amount, total_amount,
      company_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      po_number,
      order_date,
      supplier_id,
      ship_to_location_id,
      status,
      requested_delivery_date,
      terms,
      shipping_method,
      subtotal,
      tax_amount,
      shipping_amount,
      total_amount,
      company_id,
    ]
  );
  return getPurchaseOrderById(company_id, result.insertId);
}

/**
 * Update PO
 */
export async function updatePurchaseOrder(company_id, purchase_order_id, patch = {}) {
  assertCompanyId(company_id);
  const keys = Object.keys(patch);
  if (!keys.length) return null;

  const setSql = keys.map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(patch), company_id, purchase_order_id];

  await pool.query(
    `UPDATE purchase_orders SET ${setSql}, updated_at = NOW()
     WHERE company_id = ? AND purchase_order_id = ?`,
    values
  );
  return getPurchaseOrderById(company_id, purchase_order_id);
}

/**
 * Soft delete (deactivate)
 */
export async function deactivatePurchaseOrder(company_id, purchase_order_id) {
  assertCompanyId(company_id);
  await pool.query(
    `UPDATE purchase_orders SET is_active = 0, updated_at = NOW()
     WHERE company_id = ? AND purchase_order_id = ?`,
    [company_id, purchase_order_id]
  );
}

/**
 * Hard delete
 */
export async function deletePurchaseOrder(company_id, purchase_order_id) {
  assertCompanyId(company_id);
  await pool.query(
    `DELETE FROM purchase_orders WHERE company_id = ? AND purchase_order_id = ?`,
    [company_id, purchase_order_id]
  );
}

/**
 * Send purchase order to supplier (update status)
 */
export async function sendPurchaseOrderToSupplier(company_id, purchase_order_id, user_id) {
  assertCompanyId(company_id);
  
  // First check if PO exists and is approved
  const po = await getPurchaseOrderById(company_id, purchase_order_id);
  
  if (!po) {
    throw new Error('Purchase order not found');
  }
  
  if (po.status !== 'approved') {
    throw new Error(`Cannot send purchase order with status '${po.status}'. Only approved purchase orders can be sent.`);
  }
  
  // Update status to sent_to_supplier
  await pool.query(
    `UPDATE purchase_orders 
     SET status = 'sent_to_supplier',
         sent_at = NOW(),
         sent_by = ?,
         updated_at = NOW(),
         updated_by = ?
     WHERE company_id = ? AND purchase_order_id = ?`,
    [user_id, user_id, company_id, purchase_order_id]
  );
  
  return getPurchaseOrderById(company_id, purchase_order_id);
}

/**
 * Log status change (optional - for audit trail)
 */
export async function logStatusChange({ purchase_order_id, status, changed_by, notes, changed_at }) {
  // This is optional - you can implement an audit log table later
  // For now, just log to console
  console.log('PO Status Change:', { purchase_order_id, status, changed_by, notes, changed_at });
}

/**
 * Recalculates purchase_order_lines.quantity_received from receiving_items.
 * Used by receiving flows when items are added/updated/removed.
 * @param {number} purchase_order_id
 */
export async function recomputeLineReceipts(purchase_order_id) {
  if (!purchase_order_id) return;

  await pool.query(
    `
    UPDATE purchase_order_lines pol
    LEFT JOIN (
      SELECT 
        po_line_id,
        SUM(quantity_received) AS qty_received
      FROM receiving_items
      WHERE purchase_order_id = ?
      GROUP BY po_line_id
    ) ri ON ri.po_line_id = pol.po_line_id
    SET pol.quantity_received = COALESCE(ri.qty_received, 0)
    WHERE pol.purchase_order_id = ?
    `,
    [purchase_order_id, purchase_order_id]
  );
}

/**
 * Recomputes purchase order status based on line receipt progress.
 * pending -> partial -> received.
 * @param {number} purchase_order_id
 */
export async function recomputePOStatus(purchase_order_id) {
  if (!purchase_order_id) return;

  const [[po]] = await pool.query(
    `SELECT purchase_order_id, status FROM purchase_orders WHERE purchase_order_id = ?`,
    [purchase_order_id]
  );
  if (!po) return;

  const [[lineAgg]] = await pool.query(
    `
    SELECT 
      COUNT(*) AS total_lines,
      SUM(CASE WHEN COALESCE(quantity_received,0) >= COALESCE(quantity_ordered,0) AND quantity_ordered IS NOT NULL THEN 1 ELSE 0 END) AS fully_received,
      SUM(CASE WHEN COALESCE(quantity_received,0) > 0 
                 AND COALESCE(quantity_received,0) < COALESCE(quantity_ordered,0) THEN 1 ELSE 0 END) AS partially_received
    FROM purchase_order_lines
    WHERE purchase_order_id = ?
    `,
    [purchase_order_id]
  );

  if (!lineAgg || !lineAgg.total_lines) {
    // No lines: keep existing status
    return;
  }

  let nextStatus = po.status;
  const canAutoupdate = new Set(['draft', 'pending', 'approved', 'partial', 'received']);

  if (canAutoupdate.has(po.status)) {
    if (lineAgg.fully_received === lineAgg.total_lines) {
      nextStatus = 'received';
    } else if (lineAgg.fully_received > 0 || lineAgg.partially_received > 0) {
      nextStatus = 'partial';
    } else {
      nextStatus = 'pending';
    }
  }

  if (nextStatus !== po.status) {
    await pool.query(
      `UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE purchase_order_id = ?`,
      [nextStatus, purchase_order_id]
    );
  }
}

/**
 * Ensure the status ENUM includes a specific value (e.g., "rejected")
 */
export async function ensureStatusOption(value) {
  if (!value) return;

  const [[column]] = await pool.query(
    `
    SELECT COLUMN_TYPE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'purchase_orders'
      AND COLUMN_NAME = 'status'
    `
  );

  if (!column) {
    console.warn('Unable to inspect purchase_orders.status column metadata');
    return;
  }

  const columnType = (column.COLUMN_TYPE || '').toLowerCase();

  // Only attempt to alter the column if it is actually an ENUM
  if (!columnType.startsWith('enum(')) {
    return;
  }

  if (columnType.includes(`'${value.toLowerCase()}'`)) {
    return;
  }

  const enumValues = column.COLUMN_TYPE
    .replace(/^enum\(/i, '')
    .replace(/\)$/, '')
    .split(',')
    .map((entry) => entry.trim().replace(/^'/, '').replace(/'$/, ''));

  enumValues.push(value);
  const enumSql = enumValues.map((entry) => `'${entry}'`).join(', ');
  const defaultValue = column.COLUMN_DEFAULT || 'draft';

  console.log(`Extending purchase_orders.status enum to include "${value}"`);
  await pool.query(
    `
    ALTER TABLE purchase_orders
    MODIFY COLUMN status ENUM(${enumSql}) NOT NULL DEFAULT ?
    `,
    [defaultValue]
  );
}
