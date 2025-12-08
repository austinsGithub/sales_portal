import {
  getCategoryById,
  getCategories,
  searchCategories,
  getTopLevelCategories,
  getSubcategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProductsByCategory,
  getCategoriesByProduct,
  linkProductToCategory,
  unlinkProductFromCategory,
  CATEGORY_COLUMNS,
} from '../../models/inventory/ProductCategories.mjs';

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/* ------------------------- COLLECTION ------------------------- */

export async function list(req, res, next) {
  try {
    const { company_id } = req.user;
    const { includeInactive } = req.query;

    const result = await getCategories({
      company_id,
      includeInactive: includeInactive === 'true',
    });

    res.json(result);
  } catch (e) { next(e); }
}

export async function search(req, res, next) {
  try {
    const { company_id } = req.user;
    const { q, includeInactive } = req.query;

    const result = await searchCategories({
      company_id,
      q: q || '',
      includeInactive: includeInactive === 'true',
    });

    res.json(result);
  } catch (e) { next(e); }
}

export async function topLevel(req, res, next) {
  try {
    const { company_id } = req.user;
    const result = await getTopLevelCategories(company_id);
    res.json(result);
  } catch (e) { next(e); }
}

export async function subcategories(req, res, next) {
  try {
    const { company_id } = req.user;
    const parent_category_id = Number(req.params.parent_id);

    const result = await getSubcategories(company_id, parent_category_id);
    res.json(result);
  } catch (e) { next(e); }
}

/* ------------------------- SINGLE ------------------------- */

export async function getOne(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const row = await getCategoryById(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

/* ------------------------- CREATE / UPDATE / DELETE ------------------------- */

export async function create(req, res, next) {
  try {
    const { company_id } = req.user;

    const body = pick(req.body, CATEGORY_COLUMNS);
    delete body.company_id;

    if (!body.category_name) {
      return res.status(400).json({ error: 'category_name required' });
    }

    if (body.is_active === undefined) body.is_active = 1;
    body.is_active = body.is_active ? 1 : 0;

    const created = await createCategory(company_id, body);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

export async function patch(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const body = pick(req.body, CATEGORY_COLUMNS);
    delete body.company_id;

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'empty patch' });
    }

    if (body.is_active !== undefined) {
      body.is_active = body.is_active ? 1 : 0;
    }

    const updated = await updateCategory(company_id, id, body);
    if (!updated) return res.status(404).json({ error: 'Not found' });

    res.json(updated);
  } catch (e) { next(e); }
}

export async function destroy(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const out = await deleteCategory(company_id, id);
    res.json(out);
  } catch (e) {
    if (e.message.includes('Cannot delete category with subcategories')) {
      return res.status(400).json({ error: e.message });
    }
    next(e);
  }
}

/* ------------------------- PRODUCT LINKS ------------------------- */

export async function categoryProducts(req, res, next) {
  try {
    const { company_id } = req.user;
    const category_id = Number(req.params.id);

    const result = await getProductsByCategory(company_id, category_id);
    res.json(result);
  } catch (e) { next(e); }
}

export async function productCategories(req, res, next) {
  try {
    const { company_id } = req.user;
    const product_id = Number(req.params.product_id);

    if (!product_id || Number.isNaN(product_id)) {
      return res.status(400).json({ error: 'invalid product id' });
    }

    const result = await getCategoriesByProduct(company_id, product_id);
    res.json(result);
  } catch (e) { next(e); }
}

export async function linkProduct(req, res, next) {
  try {
    const { company_id } = req.user;
    const category_id = Number(req.params.id);
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: 'product_id required' });
    }

    const result = await linkProductToCategory(company_id, product_id, category_id);
    res.json(result);
  } catch (e) { next(e); }
}

export async function unlinkProduct(req, res, next) {
  try {
    const { company_id } = req.user;
    const category_id = Number(req.params.id);
    const product_id = Number(req.params.product_id);

    const result = await unlinkProductFromCategory(company_id, product_id, category_id);
    res.json(result);
  } catch (e) { next(e); }
}
