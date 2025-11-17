// models/procurement/Supplier.mjs
import pool from '../../db/pool.mjs';

export const SUPPLIER_COLUMNS = [
  'company_id',
  'supplier_code',
  'supplier_name',
  'contact_name',
  'contact_email',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'website',
  'payment_terms',
  'lead_time_days',
  'minimum_order_amount',
  'preferred_vendor',
  'quality_rating',
  'certifications',
  'notes',
  'is_active',
];

// Require company_id for every operation
function assertCompanyId(company_id) {
  if (company_id == null) throw new Error('company_id is required in model call');
}

// Normalizers for numeric/boolean-like fields (optional but safe)
function normalizePatch(patch = {}) {
  const out = { ...patch };
  if ('preferred_vendor' in out) out.preferred_vendor = out.preferred_vendor ? 1 : 0;
  if ('is_active' in out) out.is_active = out.is_active ? 1 : 0;
  if ('lead_time_days' in out && out.lead_time_days !== null && out.lead_time_days !== undefined) {
    out.lead_time_days = Number(out.lead_time_days) || 0;
  }
  if ('minimum_order_amount' in out && out.minimum_order_amount !== null && out.minimum_order_amount !== undefined) {
    out.minimum_order_amount = Number(out.minimum_order_amount) || 0;
  }
  return out;
}

/**
 * Get single supplier by id scoped to company
 */
export async function getSupplierById(company_id, supplier_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      supplier_id, company_id, supplier_code, supplier_name,
      contact_name, contact_email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      website, payment_terms, lead_time_days, minimum_order_amount,
      preferred_vendor, quality_rating, certifications, notes,
      is_active, created_at, updated_at
    FROM suppliers
    WHERE company_id = ? AND supplier_id = ?
    LIMIT 1
    `,
    [company_id, supplier_id]
  );
  return rows[0] || null;
}

/**
 * Get single supplier by code scoped to company
 */
export async function getSupplierByCode(company_id, supplier_code) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      supplier_id, company_id, supplier_code, supplier_name,
      contact_name, contact_email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      website, payment_terms, lead_time_days, minimum_order_amount,
      preferred_vendor, quality_rating, certifications, notes,
      is_active, created_at, updated_at
    FROM suppliers
    WHERE company_id = ? AND supplier_code = ?
    LIMIT 1
    `,
    [company_id, supplier_code]
  );
  return rows[0] || null;
}

/**
 * List suppliers for a company (optional includeInactive)
 */
export async function getSuppliers({ company_id, limit = 50, offset = 0, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const args = [company_id];
  const where = ['company_id = ?'];
  if (!includeInactive) where.push('is_active = 1');

  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      supplier_id, company_id, supplier_code, supplier_name,
      contact_name, contact_email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      website, payment_terms, lead_time_days, minimum_order_amount,
      preferred_vendor, quality_rating, certifications, notes,
      is_active, created_at, updated_at
    FROM suppliers
    WHERE ${where.join(' AND ')}
    ORDER BY supplier_name ASC, created_at DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Simple search by name/code/email/city/state scoped to company
 */
export async function searchSuppliers({ company_id, q = '', limit = 50, offset = 0, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const like = `%${q}%`;
  const args = [company_id, like, like, like, like, like];

  const where = [
    'company_id = ?',
    '(supplier_name LIKE ? OR supplier_code LIKE ? OR contact_email LIKE ? OR city LIKE ? OR state LIKE ?)'
  ];
  if (!includeInactive) where.push('is_active = 1');

  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      supplier_id, company_id, supplier_code, supplier_name,
      contact_name, contact_email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      website, payment_terms, lead_time_days, minimum_order_amount,
      preferred_vendor, quality_rating, certifications, notes,
      is_active, created_at, updated_at
    FROM suppliers
    WHERE ${where.join(' AND ')}
    ORDER BY supplier_name ASC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}

/**
 * Create supplier for a company. company_id is enforced.
 */
export async function createSupplier(company_id, data = {}) {
  assertCompanyId(company_id);

  const payload = normalizePatch({ ...data, company_id });
  const cols = SUPPLIER_COLUMNS.filter(c => payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No valid supplier columns provided');
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map(c => payload[c]);

  const [result] = await pool.query(
    `INSERT INTO suppliers (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return getSupplierById(company_id, result.insertId);
}

/**
 * Update supplier scoped to company
 */
export async function updateSupplier(company_id, supplier_id, patch = {}) {
  assertCompanyId(company_id);

  const payload = normalizePatch({ ...patch });
  // Prevent cross-tenant tampering if caller accidentally passes company_id
  if ('company_id' in payload) delete payload.company_id;

  const cols = SUPPLIER_COLUMNS.filter(c => c !== 'company_id' && payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No updatable fields provided');
  const setSql = cols.map(c => `${c} = ?`).join(', ');
  const values = cols.map(c => payload[c]);

  const [res] = await pool.query(
    `UPDATE suppliers SET ${setSql}, updated_at = NOW() WHERE company_id = ? AND supplier_id = ?`,
    [...values, company_id, supplier_id]
  );
  if (res.affectedRows === 0) return null;
  return getSupplierById(company_id, supplier_id);
}

/**
 * Deactivate supplier (set is_active = 0) scoped to company
 */
export async function deactivateSupplier(company_id, supplier_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `UPDATE suppliers SET is_active = 0, updated_at = NOW() WHERE company_id = ? AND supplier_id = ?`,
    [company_id, supplier_id]
  );
  if (res.affectedRows === 0) return null;
  return getSupplierById(company_id, supplier_id);
}

/**
 * Delete supplier scoped to company
 */
export async function deleteSupplier(company_id, supplier_id) {
  assertCompanyId(company_id);
  const [res] = await pool.query(
    `DELETE FROM suppliers WHERE company_id = ? AND supplier_id = ?`,
    [company_id, supplier_id]
  );
  return { supplier_id, deleted: res.affectedRows > 0 };
}

/**
 * Advanced search scoped to company
 */
export async function searchSuppliersAdvanced(opts = {}) {
  const {
    company_id,
    q = '',
    limit = 50,
    offset = 0,
    includeInactive = false,
    preferred_vendor, // '1' | '0' | undefined
    city,
    state,
    payment_terms,
    quality_rating,
    min_lead_time_days,
    max_lead_time_days,
    min_minimum_order_amount,
    max_minimum_order_amount,
  } = opts;

  assertCompanyId(company_id);

  const where = ['company_id = ?'];
  const args = [company_id];

  if (q) {
    where.push('(supplier_name LIKE ? OR supplier_code LIKE ? OR contact_email LIKE ? OR city LIKE ? OR state LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }

  if (!includeInactive) where.push('is_active = 1');

  if (preferred_vendor === '1' || preferred_vendor === '0') {
    where.push('preferred_vendor = ?'); args.push(Number(preferred_vendor));
  }
  if (city) { where.push('city LIKE ?'); args.push(`%${city}%`); }
  if (state) { where.push('state LIKE ?'); args.push(`%${state}%`); }
  if (payment_terms) { where.push('payment_terms = ?'); args.push(payment_terms); }
  if (quality_rating) { where.push('quality_rating = ?'); args.push(quality_rating); }

  if (min_lead_time_days !== undefined) { where.push('lead_time_days >= ?'); args.push(Number(min_lead_time_days)); }
  if (max_lead_time_days !== undefined) { where.push('lead_time_days <= ?'); args.push(Number(max_lead_time_days)); }

  if (min_minimum_order_amount !== undefined) { where.push('minimum_order_amount >= ?'); args.push(Number(min_minimum_order_amount)); }
  if (max_minimum_order_amount !== undefined) { where.push('minimum_order_amount <= ?'); args.push(Number(max_minimum_order_amount)); }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  args.push(Number(limit), Number(offset));

  const [rows] = await pool.query(
    `
    SELECT
      supplier_id, company_id, supplier_code, supplier_name,
      contact_name, contact_email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      website, payment_terms, lead_time_days, minimum_order_amount,
      preferred_vendor, quality_rating, certifications, notes,
      is_active, created_at, updated_at
    FROM suppliers
    ${whereSql}
    ORDER BY supplier_name ASC, created_at DESC
    LIMIT ? OFFSET ?
    `,
    args
  );
  return rows;
}
