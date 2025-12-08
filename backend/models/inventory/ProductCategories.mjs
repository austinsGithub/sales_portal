import pool from '../../db/pool.mjs';

export const CATEGORY_COLUMNS = [
  'company_id',
  'category_name',
  'parent_category_id',
  'description',
  'is_active',
];

// Require company_id for every operation
function assertCompanyId(company_id) {
  if (company_id == null) throw new Error('company_id is required in model call');
}

/**
 * Get single category by id scoped to company
 */
export async function getCategoryById(company_id, category_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      pc.category_id, pc.company_id, pc.category_name, pc.parent_category_id,
      pc.description, pc.is_active, pc.created_at,
      parent.category_name as parent_category_name
    FROM product_categories pc
    LEFT JOIN product_categories parent ON pc.parent_category_id = parent.category_id
    WHERE pc.company_id = ? AND pc.category_id = ?
    LIMIT 1
    `,
    [company_id, category_id]
  );
  return rows[0] || null;
}

/**
 * List all categories for a company (with parent info)
 */
export async function getCategories({ company_id, includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const args = [company_id];
  const where = ['pc.company_id = ?'];
  if (!includeInactive) where.push('pc.is_active = 1');

  const [rows] = await pool.query(
    `
    SELECT
      pc.category_id, pc.company_id, pc.category_name, pc.parent_category_id,
      pc.description, pc.is_active, pc.created_at,
      parent.category_name as parent_category_name
    FROM product_categories pc
    LEFT JOIN product_categories parent ON pc.parent_category_id = parent.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY pc.category_name ASC
    `,
    args
  );
  return rows;
}

/**
 * Search categories by name
 */
export async function searchCategories({ company_id, q = '', includeInactive = false } = {}) {
  assertCompanyId(company_id);
  const like = `%${q}%`;
  const args = [company_id, like, like];

  const where = [
    'pc.company_id = ?',
    '(pc.category_name LIKE ? OR pc.description LIKE ?)',
  ];
  if (!includeInactive) where.push('pc.is_active = 1');

  const [rows] = await pool.query(
    `
    SELECT
      pc.category_id, pc.company_id, pc.category_name, pc.parent_category_id,
      pc.description, pc.is_active, pc.created_at,
      parent.category_name as parent_category_name
    FROM product_categories pc
    LEFT JOIN product_categories parent ON pc.parent_category_id = parent.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY pc.category_name ASC
    `,
    args
  );
  return rows;
}

/**
 * Get all top-level categories (no parent)
 */
export async function getTopLevelCategories(company_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      category_id, company_id, category_name, parent_category_id,
      description, is_active, created_at
    FROM product_categories
    WHERE company_id = ? AND parent_category_id IS NULL AND is_active = 1
    ORDER BY category_name ASC
    `,
    [company_id]
  );
  return rows;
}

/**
 * Get all subcategories of a parent category
 */
export async function getSubcategories(company_id, parent_category_id) {
  assertCompanyId(company_id);
  const [rows] = await pool.query(
    `
    SELECT
      category_id, company_id, category_name, parent_category_id,
      description, is_active, created_at
    FROM product_categories
    WHERE company_id = ? AND parent_category_id = ? AND is_active = 1
    ORDER BY category_name ASC
    `,
    [company_id, parent_category_id]
  );
  return rows;
}

/**
 * Create category for a company
 */
export async function createCategory(company_id, data = {}) {
  assertCompanyId(company_id);

  const payload = { ...data, company_id };

  // Validate required fields
  if (!payload.category_name) throw new Error('category_name is required');

  // Normalize is_active
  if (payload.is_active === undefined) payload.is_active = 1;
  payload.is_active = payload.is_active ? 1 : 0;

  // Handle null parent_category_id
  if (!payload.parent_category_id) {
    payload.parent_category_id = null;
  }

  const cols = CATEGORY_COLUMNS.filter((c) => payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No valid category columns provided');

  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => payload[c]);

  const [result] = await pool.query(
    `INSERT INTO product_categories (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return getCategoryById(company_id, result.insertId);
}

/**
 * Update category scoped to company
 */
export async function updateCategory(company_id, category_id, patch = {}) {
  assertCompanyId(company_id);

  const payload = { ...patch };
  if ('company_id' in payload) delete payload.company_id;

  // Normalize is_active if present
  if (payload.is_active !== undefined) {
    payload.is_active = payload.is_active ? 1 : 0;
  }

  // Handle null parent_category_id
  if (payload.parent_category_id === '' || payload.parent_category_id === undefined) {
    payload.parent_category_id = null;
  }

  const cols = CATEGORY_COLUMNS.filter((c) => c !== 'company_id' && payload[c] !== undefined);
  if (cols.length === 0) throw new Error('No updatable fields provided');
  const setSql = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => payload[c]);

  const sql = `UPDATE product_categories SET ${setSql} WHERE company_id = ? AND category_id = ?`;
  const params = [...values, company_id, category_id];

  const [res] = await pool.query(sql, params);
  if (res.affectedRows === 0) return null;
  return getCategoryById(company_id, category_id);
}

/**
 * Delete category scoped to company
 */
export async function deleteCategory(company_id, category_id) {
  assertCompanyId(company_id);

  // Check if category has subcategories
  const [subcategories] = await pool.query(
    `SELECT category_id FROM product_categories WHERE company_id = ? AND parent_category_id = ? LIMIT 1`,
    [company_id, category_id]
  );

  if (subcategories.length > 0) {
    throw new Error('Cannot delete category with subcategories');
  }

  const [res] = await pool.query(
    `DELETE FROM product_categories WHERE company_id = ? AND category_id = ?`,
    [company_id, category_id]
  );
  return { category_id, deleted: res.affectedRows > 0 };
}

/**
 * Get products linked to a category
 */
export async function getProductsByCategory(company_id, category_id) {
  assertCompanyId(company_id);
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.product_id,
        p.product_name,
        p.public_sku,
        p.description,
        pcl.category_id
      FROM product_categories_link pcl
      JOIN product_categories pc ON pc.category_id = pcl.category_id
      JOIN products p ON p.product_id = pcl.product_id
      WHERE pc.company_id = ? AND p.company_id = pc.company_id AND pcl.category_id = ?
      ORDER BY p.product_name ASC
      `,
      [company_id, category_id]
    );
    return rows;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw err;
  }
}

/**
 * Get categories linked to a product
 */
export async function getCategoriesByProduct(company_id, product_id) {
  assertCompanyId(company_id);
  try {
    const [rows] = await pool.query(
      `
      SELECT
        pc.category_id,
        pc.category_name,
        pc.parent_category_id,
        parent.category_name as parent_category_name
      FROM product_categories_link pcl
      JOIN product_categories pc ON pc.category_id = pcl.category_id
      JOIN products p ON p.product_id = pcl.product_id
      LEFT JOIN product_categories parent ON pc.parent_category_id = parent.category_id
      WHERE pc.company_id = ? AND p.company_id = pc.company_id AND pcl.product_id = ?
      ORDER BY pc.category_name ASC
      `,
      [company_id, product_id]
    );
    return rows;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw err;
  }
}

/**
 * Link a product to a category
 */
export async function linkProductToCategory(company_id, product_id, category_id) {
  assertCompanyId(company_id);

  // Ensure the category/product belong to the requesting company
  const [[categoryMatch]] = await pool.query(
    `SELECT category_id FROM product_categories WHERE company_id = ? AND category_id = ? LIMIT 1`,
    [company_id, category_id]
  );
  if (!categoryMatch) throw new Error('Category not found for company');

  const [[productMatch]] = await pool.query(
    `SELECT product_id FROM products WHERE company_id = ? AND product_id = ? LIMIT 1`,
    [company_id, product_id]
  );
  if (!productMatch) throw new Error('Product not found for company');

  const insertWithCompany = `
    INSERT INTO product_categories_link (product_id, category_id, company_id)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE category_id = VALUES(category_id)
  `;
  const insertWithoutCompany = `
    INSERT INTO product_categories_link (product_id, category_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE category_id = VALUES(category_id)
  `;

  try {
    await pool.query(insertWithCompany, [product_id, category_id, company_id]);
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_WRONG_VALUE_COUNT_ON_ROW') {
      await pool.query(insertWithoutCompany, [product_id, category_id]);
    } else {
      throw err;
    }
  }

  return { product_id, category_id, linked: true };
}

/**
 * Unlink a product from a category
 */
export async function unlinkProductFromCategory(company_id, product_id, category_id) {
  assertCompanyId(company_id);

  const deleteWithCompany = `DELETE FROM product_categories_link WHERE company_id = ? AND product_id = ? AND category_id = ?`;
  const deleteWithoutCompany = `DELETE FROM product_categories_link WHERE product_id = ? AND category_id = ?`;

  let res;
  try {
    [res] = await pool.query(deleteWithCompany, [company_id, product_id, category_id]);
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      [res] = await pool.query(deleteWithoutCompany, [product_id, category_id]);
    } else {
      throw err;
    }
  }

  return { product_id, category_id, unlinked: res.affectedRows > 0 };
}
