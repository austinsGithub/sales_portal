import {
  getProductById,
  getProducts,
  searchProducts,
  searchProductsAdvanced,
  createProduct,
  updateProduct,
  deactivateProduct,
  deleteProduct
} from '../../models/inventory/Products.mjs';

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function handledDbError(res, err) {
  if (err?.code === 'ER_BAD_FIELD_ERROR') {
    res.status(400).json({
      error: 'Invalid field in query',
      detail: err.sqlMessage || 'A filter references a missing column'
    });
    return true;
  }
  return false;
}

function sendWithTotal(res, payload) {
  if (Array.isArray(payload)) return res.json(payload);
  const { rows = [], total } = payload || {};
  if (Number.isFinite(total)) {
    res.set('X-Total-Count', String(total));
    res.set('Access-Control-Expose-Headers', 'X-Total-Count');
  }
  return res.json(rows);
}

export async function list(req, res, next) {
  try {
    const { company_id } = req.user;
    const { limit, offset, includeInactive } = req.query;
    const result = await getProducts({
      company_id,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeInactive: includeInactive === 'true'
    });
    sendWithTotal(res, result);
  } catch (e) {
    if (handledDbError(res, e)) return;
    next(e);
  }
}

export async function search(req, res, next) {
  try {
    const { company_id } = req.user;
    const { q, limit, offset, includeInactive } = req.query;
    const result = await searchProducts({
      company_id,
      q: q || '',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeInactive: includeInactive === 'true'
    });
    sendWithTotal(res, result);
  } catch (e) {
    if (handledDbError(res, e)) return;
    next(e);
  }
}

export async function getOne(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);
    const row = await getProductById(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const { company_id } = req.user;
    const body = pick(req.body, [
      'part_id','product_name','public_sku','base_price','description','is_active'
    ]);
    if (!body.product_name) return res.status(400).json({ error: 'product_name required' });
    if (body.is_active === undefined) body.is_active = 1;
    body.base_price = Number(body.base_price) || 0;
    const created = await createProduct(company_id, body);
    res.status(201).json(created);
  } catch (e) {
    if (handledDbError(res, e)) return;
    next(e);
  }
}

export async function patch(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);
    const body = pick(req.body, [
      'part_id','product_name','public_sku','base_price','description','is_active'
    ]);
    if (Object.keys(body).length === 0) return res.status(400).json({ error: 'empty patch' });
    if ('is_active' in body) body.is_active = body.is_active ? 1 : 0;
    if ('base_price' in body) body.base_price = Number(body.base_price) || 0;
    const updated = await updateProduct(company_id, id, body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    if (handledDbError(res, e)) return;
    next(e);
  }
}

export async function deactivate(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);
    const row = await deactivateProduct(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
}

export async function destroy(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);
    const out = await deleteProduct(company_id, id);
    res.json(out);
  } catch (e) { next(e); }
}

export async function searchAdvanced(req, res, next) {
  try {
    const { company_id } = req.user;
    const {
      q = '', limit, offset, includeInactive, product_category, min_base_price, max_base_price
    } = req.query;

    const result = await searchProductsAdvanced({
      company_id,
      q,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      includeInactive: includeInactive === 'true',
      // product_category is ignored until column exists in schema
      product_category: undefined,
      min_base_price,
      max_base_price
    });
    sendWithTotal(res, result);
  } catch (e) {
    if (handledDbError(res, e)) return;
    next(e);
  }
}
