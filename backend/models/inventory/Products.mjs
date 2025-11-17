import pool from '../../db/pool.mjs';

export const PRODUCT_COLUMNS = [
  'company_id',
  'part_id',
  'product_name',
  'public_sku',
  'base_price',
  'description',
  'product_category',
  'is_active'
];

// --- Guard ---
function assertCompanyId(company_id) {
  if (!company_id) throw new Error('company_id is required in model call');
}

// --- Normalizer ---
function normalizePatch(patch = {}) {
  const out = { ...patch };

  if ('is_active' in out) out.is_active = out.is_active ? 1 : 0;
  if ('base_price' in out && out.base_price !== null && out.base_price !== undefined)
    out.base_price = Number(out.base_price) || 0;
  if ('part_id' in out && out.part_id === '') out.part_id = null;

  return out;
}

// --- Queries ---
export async function getProductById(company_id, product_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `SELECT * FROM products WHERE company_id = ? AND product_id = ? LIMIT 1`,
    [company_id, product_id]
  );
  return rows[0] || null;
}

export async function getProducts({ company_id, limit = 50, offset = 0, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const where = ['company_id = ?'];
  const args = [company_id];
  if (!includeInactive) where.push('is_active = 1');
  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `SELECT * FROM products WHERE ${where.join(' AND ')} 
     ORDER BY product_name ASC LIMIT ? OFFSET ?`,
    args
  );
  return rows;
}

export async function searchProducts({ company_id, q = '', limit = 50, offset = 0, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const like = `%${q}%`;
  const where = [
    'company_id = ?',
    '(product_name LIKE ? OR public_sku LIKE ? OR product_category LIKE ? OR description LIKE ?)'
  ];
  const args = [company_id, like, like, like, like];
  if (!includeInactive) where.push('is_active = 1');
  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `SELECT * FROM products WHERE ${where.join(' AND ')} 
     ORDER BY product_name ASC LIMIT ? OFFSET ?`,
    args
  );
  return rows;
}

export async function createProduct(company_id, data = {}) {
  assertCompanyId(company_id);
  const payload = normalizePatch({ ...data, company_id });
  const cols = PRODUCT_COLUMNS.filter((c) => payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No valid product fields provided');
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => payload[c]);
  const [result] = await pool.query(
    `INSERT INTO products (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return getProductById(company_id, result.insertId);
}

export async function updateProduct(company_id, product_id, patch = {}) {
  assertCompanyId(company_id);
  const payload = normalizePatch({ ...patch });
  delete payload.company_id;
  const cols = PRODUCT_COLUMNS.filter((c) => payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No updatable fields provided');

  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => payload[c]);
  const sql = `UPDATE products SET ${setSql}, updated_at = NOW() WHERE company_id = ? AND product_id = ?`;
  const params = [...values, company_id, product_id];

  const [res] = await pool.query(sql, params);
  if (res.affectedRows === 0) return null;
  return getProductById(company_id, product_id);
}

export async function deactivateProduct(company_id, product_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `UPDATE products SET is_active = 0, updated_at = NOW() WHERE company_id = ? AND product_id = ?`,
    [company_id, product_id]
  );
  if (res.affectedRows === 0) return null;
  return getProductById(company_id, product_id);
}

export async function deleteProduct(company_id, product_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `DELETE FROM products WHERE company_id = ? AND product_id = ?`,
    [company_id, product_id]
  );
  return { product_id, deleted: res.affectedRows > 0 };
}

// Advanced search (category, min/max price)
export async function searchProductsAdvanced({
  company_id,
  q = '',
  limit = 50,
  offset = 0,
  includeInactive = false,
  product_category,
  min_base_price,
  max_base_price,
} = {}) {
  assertCompanyId(company_id);
  const where = ['company_id = ?'];
  const args = [company_id];

  if (q) {
    where.push('(product_name LIKE ? OR public_sku LIKE ? OR description LIKE ? OR product_category LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  if (!includeInactive) where.push('is_active = 1');
  if (product_category) { where.push('product_category LIKE ?'); args.push(`%${product_category}%`); }
  if (min_base_price) { where.push('base_price >= ?'); args.push(Number(min_base_price)); }
  if (max_base_price) { where.push('base_price <= ?'); args.push(Number(max_base_price)); }

  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `SELECT * FROM products WHERE ${where.join(' AND ')} 
     ORDER BY product_name ASC LIMIT ? OFFSET ?`,
    args
  );
  return rows;
}
