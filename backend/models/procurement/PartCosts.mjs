import pool from '../../db/pool.mjs';

export const PART_COST_COLUMNS = [
  'part_id',
  'supplier_id',
  'unit_cost',
  'effective_date',
  'notes',
  'company_id',
];

// Require company_id for every operation
function assertCompanyId(company_id) {
  if (company_id == null) throw new Error('company_id is required in model call');
}

/**
 * Get single part cost by id scoped to company
 */
export async function getPartCostById(company_id, cost_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      pc.cost_id, pc.part_id, pc.supplier_id, pc.unit_cost, pc.effective_date,
      pc.notes, pc.company_id, pc.created_at, pc.updated_at,
      p.product_name, p.sku,
      s.supplier_name
    FROM part_costs pc
    LEFT JOIN parts p ON pc.part_id = p.part_id
    LEFT JOIN suppliers s ON pc.supplier_id = s.supplier_id
    WHERE pc.company_id = ? AND pc.cost_id = ?
    LIMIT 1
    `,
    [company_id, cost_id]
  );
  return rows[0] || null;
}

/**
 * Get all part costs for a specific supplier scoped to company
 */
export async function getPartCostsBySupplier({ company_id, supplier_id, limit = 50, offset = 0 } = {}) {
  assertCompanyId(company_id);
  const args = [company_id, supplier_id, Number(limit), Number(offset)];

  const [rows] = await pool.query(
    `
    SELECT
      pc.cost_id, pc.part_id, pc.supplier_id, pc.unit_cost, pc.effective_date,
      pc.notes, pc.company_id, pc.created_at, pc.updated_at,
      p.product_name, p.sku, p.unit_of_measure,
      s.supplier_name,
      GROUP_CONCAT(DISTINCT pcat.category_name ORDER BY pcat.category_name SEPARATOR ', ') AS category
    FROM part_costs pc
    LEFT JOIN parts p ON pc.part_id = p.part_id
    LEFT JOIN suppliers s ON pc.supplier_id = s.supplier_id
    LEFT JOIN product_categories_link pcl ON p.part_id = pcl.product_id
    LEFT JOIN product_categories pcat ON pcl.category_id = pcat.category_id
    WHERE pc.company_id = ? AND pc.supplier_id = ?
    GROUP BY pc.cost_id, pc.part_id, pc.supplier_id, pc.unit_cost, pc.effective_date,
             pc.notes, pc.company_id, pc.created_at, pc.updated_at,
             p.product_name, p.sku, p.unit_of_measure, s.supplier_name
    ORDER BY p.product_name ASC, pc.effective_date DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Get all part costs for a specific part scoped to company
 */
export async function getPartCostsByPart({ company_id, part_id, limit = 50, offset = 0 } = {}) {
  assertCompanyId(company_id);
  const args = [company_id, part_id, Number(limit), Number(offset)];

  const [rows] = await pool.query(
    `
    SELECT
      pc.cost_id, pc.part_id, pc.supplier_id, pc.unit_cost, pc.effective_date,
      pc.notes, pc.company_id, pc.created_at, pc.updated_at,
      p.product_name, p.sku,
      s.supplier_name, s.supplier_code
    FROM part_costs pc
    LEFT JOIN parts p ON pc.part_id = p.part_id
    LEFT JOIN suppliers s ON pc.supplier_id = s.supplier_id
    WHERE pc.company_id = ? AND pc.part_id = ?
    ORDER BY pc.effective_date DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Search part costs scoped to company
 */
export async function searchPartCosts({ company_id, q = '', limit = 50, offset = 0 } = {}) {
  assertCompanyId(company_id);
  const like = `%${q}%`;
  const args = [company_id, like, like, like];

  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      pc.cost_id, pc.part_id, pc.supplier_id, pc.unit_cost, pc.effective_date,
      pc.notes, pc.company_id, pc.created_at, pc.updated_at,
      p.product_name, p.sku,
      s.supplier_name
    FROM part_costs pc
    LEFT JOIN parts p ON pc.part_id = p.part_id
    LEFT JOIN suppliers s ON pc.supplier_id = s.supplier_id
    WHERE pc.company_id = ?
      AND (p.product_name LIKE ? OR p.sku LIKE ? OR s.supplier_name LIKE ?)
    ORDER BY p.product_name ASC, pc.effective_date DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Get the most recent cost for a part from a specific supplier scoped to company
 */
export async function getLatestPartCostForSupplier({ company_id, part_id, supplier_id } = {}) {
  assertCompanyId(company_id);
  if (!part_id || !supplier_id) return null;

  const [rows] = await pool.query(
    `
    SELECT
      pc.cost_id, pc.part_id, pc.supplier_id, pc.unit_cost, pc.effective_date,
      pc.notes, pc.company_id, pc.created_at, pc.updated_at
    FROM part_costs pc
    WHERE pc.company_id = ? AND pc.part_id = ? AND pc.supplier_id = ?
    ORDER BY 
      pc.effective_date DESC,
      pc.created_at DESC
    LIMIT 1
    `,
    [company_id, part_id, supplier_id]
  );

  return rows[0] || null;
}

/**
 * Create part cost for a company. company_id is enforced.
 */
export async function createPartCost(company_id, data = {}) {
  assertCompanyId(company_id);

  const payload = { ...data, company_id };

  // Validate required fields
  if (!payload.part_id) throw new Error('part_id is required');
  if (!payload.supplier_id) throw new Error('supplier_id is required');
  if (payload.unit_cost == null) throw new Error('unit_cost is required');

  // Normalize unit_cost to number
  payload.unit_cost = Number(payload.unit_cost);

  const cols = PART_COST_COLUMNS.filter((c) => payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No valid part cost columns provided');

  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => payload[c]);

  const [result] = await pool.query(
    `INSERT INTO part_costs (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return getPartCostById(company_id, result.insertId);
}

/**
 * Update part cost scoped to company
 */
export async function updatePartCost(company_id, cost_id, patch = {}) {
  assertCompanyId(company_id);

  const payload = { ...patch };
  if ('company_id' in payload) delete payload.company_id;

  // Normalize unit_cost if present
  if (payload.unit_cost != null) {
    payload.unit_cost = Number(payload.unit_cost);
  }

  const cols = PART_COST_COLUMNS.filter((c) => c !== 'company_id' && payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No updatable fields provided');
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => payload[c]);

  const sql = `UPDATE part_costs SET ${setSql}, updated_at = NOW() WHERE company_id = ? AND cost_id = ?`;
  const params = [...values, company_id, cost_id];

  const [res] = await pool.query(sql, params);
  if (res.affectedRows === 0) return null;
  return getPartCostById(company_id, cost_id);
}

/**
 * Delete part cost scoped to company
 */
export async function deletePartCost(company_id, cost_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `DELETE FROM part_costs WHERE company_id = ? AND cost_id = ?`,
    [company_id, cost_id]
  );
  return { cost_id, deleted: res.affectedRows > 0 };
}
