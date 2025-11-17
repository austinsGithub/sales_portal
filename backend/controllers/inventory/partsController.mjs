import {
  getPartById,
  searchPartsAdvanced,
  getPartBySku,
  getParts,
  searchParts,
  createPart,
  updatePart,
  deactivatePart,
  deletePart,
  PART_COLUMNS,
} from '../../models/inventory/Parts.mjs';

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function sendWithTotal(res, payload) {
  if (Array.isArray(payload)) {
    return res.json(payload);
  }
  const { rows = [], total } = payload || {};
  if (Number.isFinite(total)) {
    res.set('X-Total-Count', String(total));
    res.set('Access-Control-Expose-Headers', 'X-Total-Count');
  }
  return res.json(rows);
}

/* ------------------------- COLLECTION ------------------------- */

export async function list(req, res, next) {
  try {
    const { company_id } = req.user;
    const { limit, offset, includeInactive } = req.query;

    const result = await getParts({
      company_id,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeInactive: includeInactive === 'true',
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}

export async function search(req, res, next) {
  try {
    const { company_id } = req.user;
    const { q, limit, offset, includeInactive } = req.query;

    const result = await searchParts({
      company_id,
      q: q || '',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeInactive: includeInactive === 'true',
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}

/* ------------------------- SINGLE ------------------------- */

export async function getOne(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const row = await getPartById(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

export async function bySku(req, res, next) {
  try {
    const { company_id } = req.user;
    const { sku } = req.params;

    const row = await getPartBySku(company_id, sku);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

/* ------------------------- CREATE / UPDATE / DELETE ------------------------- */

export async function create(req, res, next) {
  try {
    const { company_id } = req.user;

    const body = pick(req.body, PART_COLUMNS);
    delete body.company_id;

    if (!body.product_name) {
      return res.status(400).json({ error: 'product_name required' });
    }

    if (body.is_active === undefined) body.is_active = 1;

    const boolFields = [
      'lot_tracked',
      'serial_tracked',
      'expiration_required',
      'temperature_sensitive',
      'sterile_required',
    ];
    for (const f of boolFields) {
      if (body[f] !== undefined) body[f] = body[f] ? 1 : 0;
    }

    const numericFields = [
      'reorder_point',
      'reorder_quantity',
      'weight',
    ];
    for (const f of numericFields) {
      if (body[f] !== undefined) body[f] = Number(body[f]) || 0;
    }

    const created = await createPart(company_id, body);
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function patch(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const body = pick(req.body, PART_COLUMNS);
    delete body.company_id;

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'empty patch' });
    }

    const boolFields = [
      'lot_tracked',
      'serial_tracked',
      'expiration_required',
      'temperature_sensitive',
      'sterile_required',
      'is_active',
    ];
    for (const f of boolFields) {
      if (body[f] !== undefined) body[f] = body[f] ? 1 : 0;
    }

    const numericFields = [
      'reorder_point',
      'reorder_quantity',
      'weight',
    ];
    for (const f of numericFields) {
      if (body[f] !== undefined) body[f] = Number(body[f]) || 0;
    }

    // Remove any undefined or null values
    Object.keys(body).forEach(key => {
      if (body[key] === undefined || body[key] === null) {
        delete body[key];
      }
    });

    // Remove manufacturer_id if it's being sent
    if ('manufacturer_id' in body) {
      delete body.manufacturer_id;
    }

    // Ensure default_supplier_id is a number or null
    if ('default_supplier_id' in body) {
      body.default_supplier_id = body.default_supplier_id ? Number(body.default_supplier_id) : null;
    }

    const updated = await updatePart(company_id, id, body);
    if (!updated) return res.status(404).json({ error: 'Not found' });

    res.json(updated);
  } catch (e) { 
    console.error('Error in parts patch:', e);
    next(e); 
  }
}

export async function deactivate(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const row = await deactivatePart(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

export async function destroy(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const out = await deletePart(company_id, id);
    res.json(out);
  } catch (e) { next(e); }
}

/* ------------------------- ADVANCED SEARCH ------------------------- */

export async function searchAdvanced(req, res, next) {
  try {
    const { company_id } = req.user;
    const {
      q = '',
      limit,
      offset,
      includeInactive,
      category,
      subcategory,
      regulatory_class,
      lot_tracked,
      serial_tracked,
      expiration_required,
    } = req.query;

    const result = await searchPartsAdvanced({
      company_id,
      q,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      includeInactive: includeInactive === 'true',
      category,
      subcategory,
      regulatory_class,
      lot_tracked,
      serial_tracked,
      expiration_required,
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}
