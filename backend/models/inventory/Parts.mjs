import pool from '../../db/pool.mjs';

export const PART_COLUMNS = [
  'company_id',
  'product_name',
  'gtin',
  'description',
  'sku',
  'udi_code',
  'category',
  'subcategory',
  'default_supplier_id',
  'preferred_bin_id',
  'lot_tracked',
  'serial_tracked',
  'expiration_required',
  'temperature_sensitive',
  'sterile_required',
  'regulatory_class',
  'reorder_point',
  'reorder_quantity',
  'unit_of_measure',
  'weight',
  'dimensions',
  'is_active',
];

// Require company_id for every operation
function assertCompanyId(company_id) {
  if (company_id == null) throw new Error('company_id is required in model call');
}

// Normalizers for numeric/boolean-like fields
function normalizePatch(patch = {}) {
  const out = { ...patch };

  // Boolean conversions
  if ('lot_tracked' in out) out.lot_tracked = out.lot_tracked ? 1 : 0;
  if ('serial_tracked' in out) out.serial_tracked = out.serial_tracked ? 1 : 0;
  if ('expiration_required' in out) out.expiration_required = out.expiration_required ? 1 : 0;
  if ('temperature_sensitive' in out) out.temperature_sensitive = out.temperature_sensitive ? 1 : 0;
  if ('sterile_required' in out) out.sterile_required = out.sterile_required ? 1 : 0;
  if ('is_active' in out) out.is_active = out.is_active ? 1 : 0;

  // Numeric conversions
  if ('reorder_point' in out && out.reorder_point !== null && out.reorder_point !== undefined) {
    out.reorder_point = Number(out.reorder_point) || 0;
  }
  if ('reorder_quantity' in out && out.reorder_quantity !== null && out.reorder_quantity !== undefined) {
    out.reorder_quantity = Number(out.reorder_quantity) || 0;
  }
  if ('weight' in out && out.weight !== null && out.weight !== undefined) {
    out.weight = Number(out.weight) || 0;
  }

  // Supplier cleanup (convert empty strings to null)
  if ('supplier_id' in out && (out.supplier_id === '' || out.supplier_id === undefined)) {
    out.supplier_id = null;
  }
  if ('default_supplier_id' in out && (out.default_supplier_id === '' || out.default_supplier_id === undefined)) {
    out.default_supplier_id = null;
  }

  // Bin cleanup (convert empty strings to null)
  if ('preferred_bin_id' in out && (out.preferred_bin_id === '' || out.preferred_bin_id === undefined)) {
    out.preferred_bin_id = null;
  }

  return out;
}

/**
 * Get single part by id scoped to company
 */
export async function getPartById(company_id, part_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      part_id, company_id, product_name, gtin, description, sku, udi_code,
      category, subcategory, default_supplier_id, preferred_bin_id,
      lot_tracked, serial_tracked, expiration_required, temperature_sensitive,
      sterile_required, regulatory_class, reorder_point, reorder_quantity,
      unit_of_measure, weight, dimensions, is_active, created_at, updated_at
    FROM parts
    WHERE company_id = ? AND part_id = ?
    LIMIT 1
    `,
    [company_id, part_id]
  );
  return rows[0] || null;
}

/**
 * Get single part by SKU scoped to company
 */
export async function getPartBySku(company_id, sku) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      part_id, company_id, product_name, gtin, description, sku, udi_code,
      category, subcategory, default_supplier_id, preferred_bin_id,
      lot_tracked, serial_tracked, expiration_required, temperature_sensitive,
      sterile_required, regulatory_class, reorder_point, reorder_quantity,
      unit_of_measure, weight, dimensions, is_active, created_at, updated_at
    FROM parts
    WHERE company_id = ? AND sku = ?
    LIMIT 1
    `,
    [company_id, sku]
  );
  return rows[0] || null;
}

/**
 * List parts for a company (optional includeInactive)
 */
export async function getParts({ company_id, limit = 50, offset = 0, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const args = [company_id];
  const where = ['company_id = ?'];
  if (!includeInactive) where.push('is_active = 1');

  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      part_id, company_id, product_name, gtin, description, sku, udi_code,
      category, subcategory, default_supplier_id, preferred_bin_id,
      lot_tracked, serial_tracked, expiration_required, temperature_sensitive,
      sterile_required, regulatory_class, reorder_point, reorder_quantity,
      unit_of_measure, weight, dimensions, is_active, created_at, updated_at
    FROM parts
    WHERE ${where.join(' AND ')}
    ORDER BY product_name ASC, created_at DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Simple search by name/sku/gtin/category scoped to company
 */
export async function searchParts({ company_id, q = '', limit = 50, offset = 0, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const like = `%${q}%`;
  const args = [company_id, like, like, like, like, like];

  const where = [
    'company_id = ?',
    '(product_name LIKE ? OR sku LIKE ? OR gtin LIKE ? OR category LIKE ? OR udi_code LIKE ?)',
  ];
  if (!includeInactive) where.push('is_active = 1');

  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      part_id, company_id, product_name, gtin, description, sku, udi_code,
      category, subcategory, default_supplier_id, preferred_bin_id,
      lot_tracked, serial_tracked, expiration_required, temperature_sensitive,
      sterile_required, regulatory_class, reorder_point, reorder_quantity,
      unit_of_measure, weight, dimensions, is_active, created_at, updated_at
    FROM parts
    WHERE ${where.join(' AND ')}
    ORDER BY product_name ASC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Create part for a company. company_id is enforced.
 */
export async function createPart(company_id, data = {}) {
  assertCompanyId(company_id);

  const payload = normalizePatch({ ...data, company_id });
  const cols = PART_COLUMNS.filter((c) => payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No valid part columns provided');

  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => payload[c]);

  const [result] = await pool.query(
    `INSERT INTO parts (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return getPartById(company_id, result.insertId);
}

/**
 * Update part scoped to company
 */
export async function updatePart(company_id, part_id, patch = {}) {
  assertCompanyId(company_id);

  const payload = normalizePatch({ ...patch });
  if ('company_id' in payload) delete payload.company_id;

  const cols = PART_COLUMNS.filter((c) => c !== 'company_id' && payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No updatable fields provided');
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => payload[c]);

  const sql = `UPDATE parts SET ${setSql}, updated_at = NOW() WHERE company_id = ? AND part_id = ?`;
  const params = [...values, company_id, part_id];
  
  console.log('Executing SQL:', sql);
  console.log('With params:', params);

  try {
    const [res] = await pool.query(sql, params);
    if (res.affectedRows === 0) {
      console.log('No rows affected - part not found or not modified');
      return null;
    }
    return await getPartById(company_id, part_id);
  } catch (error) {
    console.error('Database error in updatePart:', {
      error: error.message,
      code: error.code,
      sql: error.sql,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState
    });
    throw error;
  }
}

/**
 * Deactivate part (set is_active = 0) scoped to company
 */
export async function deactivatePart(company_id, part_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `UPDATE parts SET is_active = 0, updated_at = NOW() WHERE company_id = ? AND part_id = ?`,
    [company_id, part_id]
  );
  if (res.affectedRows === 0) return null;
  return getPartById(company_id, part_id);
}

/**
 * Delete part scoped to company
 */
export async function deletePart(company_id, part_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `DELETE FROM parts WHERE company_id = ? AND part_id = ?`,
    [company_id, part_id]
  );
  return { part_id, deleted: res.affectedRows > 0 };
}

/**
 * Advanced search scoped to company
 */
export async function searchPartsAdvanced(opts = {}) {
  const {
    company_id,
    q = '',
    limit = 50,
    offset = 0,
    includeInactive = false,
    category,
    subcategory,
    regulatory_class,
    lot_tracked,
    serial_tracked,
    expiration_required,
  } = opts;

  assertCompanyId(company_id);

  const where = ['company_id = ?'];
  const args = [company_id];

  if (q) {
    where.push('(product_name LIKE ? OR sku LIKE ? OR gtin LIKE ? OR category LIKE ? OR udi_code LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }

  if (!includeInactive) where.push('is_active = 1');
  if (category) { where.push('category LIKE ?'); args.push(`%${category}%`); }
  if (subcategory) { where.push('subcategory LIKE ?'); args.push(`%${subcategory}%`); }
  if (regulatory_class) { where.push('regulatory_class = ?'); args.push(regulatory_class); }

  if (lot_tracked === '1' || lot_tracked === '0') {
    where.push('lot_tracked = ?'); args.push(Number(lot_tracked));
  }
  if (serial_tracked === '1' || serial_tracked === '0') {
    where.push('serial_tracked = ?'); args.push(Number(serial_tracked));
  }
  if (expiration_required === '1' || expiration_required === '0') {
    where.push('expiration_required = ?'); args.push(Number(expiration_required));
  }


  const whereSql = `WHERE ${where.join(' AND ')}`;
  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      part_id, company_id, product_name, gtin, description, sku, udi_code,
      category, subcategory, default_supplier_id, preferred_bin_id,
      lot_tracked, serial_tracked, expiration_required, temperature_sensitive,
      sterile_required, regulatory_class, reorder_point, reorder_quantity,
      unit_of_measure, weight, dimensions, is_active, created_at, updated_at
    FROM parts
    ${whereSql}
    ORDER BY product_name ASC, created_at DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}