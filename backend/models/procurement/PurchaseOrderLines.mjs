// models/procurement/PurchaseOrderLines.mjs
import pool from '../../db/pool.mjs';

function assertCompanyId(company_id) {
  if (!company_id) throw new Error('company_id is required in model call');
}

/**
 * Get all lines for a specific PO
 */
export async function getLinesByPurchaseOrderId(company_id, purchase_order_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT 
      pol.po_line_id,
      pol.purchase_order_id,
      pol.line_number,
      pol.part_id,
      p.sku,
      p.gtin,
      p.product_name AS part_name,
      p.description,
      pol.quantity_ordered,
      pol.quantity_received,
      pol.unit_cost AS unit_price,
      pol.line_total,
      pol.expected_delivery_date,
      pol.notes,
      pol.company_id
    FROM purchase_order_lines pol
    LEFT JOIN parts p ON pol.part_id = p.part_id
    WHERE pol.company_id = ? AND pol.purchase_order_id = ?
    ORDER BY pol.line_number ASC
    `,
    [company_id, purchase_order_id]
  );
  return rows;
}

/**
 * Create line
 */
export async function createPurchaseOrderLine(company_id, data = {}) {
  assertCompanyId(company_id);
  const {
    purchase_order_id,
    line_number = 1,
    part_id,
    quantity_ordered,
    quantity_received = 0,
    unit_cost,
    expected_delivery_date = null,
    notes = null,
  } = data;

  const [result] = await pool.query(
    `
    INSERT INTO purchase_order_lines (
      purchase_order_id, line_number, part_id,
      quantity_ordered, quantity_received,
      unit_cost, expected_delivery_date, notes, company_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      purchase_order_id,
      line_number,
      part_id,
      quantity_ordered,
      quantity_received,
      unit_cost,
      expected_delivery_date,
      notes,
      company_id,
    ]
  );
  return result.insertId;
}

/**
 * Update line
 */
export async function updatePurchaseOrderLine(company_id, po_line_id, patch = {}) {
  assertCompanyId(company_id);
  const keys = Object.keys(patch);
  if (!keys.length) return null;
  const setSql = keys.map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(patch), company_id, po_line_id];

  await pool.query(
    `UPDATE purchase_order_lines SET ${setSql}
     WHERE company_id = ? AND po_line_id = ?`,
    values
  );
}

/**
 * Delete line
 */
export async function deletePurchaseOrderLine(company_id, po_line_id) {
  assertCompanyId(company_id);
  await pool.query(
    `DELETE FROM purchase_order_lines
     WHERE company_id = ? AND po_line_id = ?`,
    [company_id, po_line_id]
  );
}
