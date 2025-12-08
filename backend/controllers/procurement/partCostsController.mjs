import {
  getPartCostById,
  getPartCostsBySupplier,
  getPartCostsByPart,
  searchPartCosts,
  createPartCost,
  updatePartCost,
  deletePartCost,
  PART_COST_COLUMNS,
} from '../../models/procurement/PartCosts.mjs';

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

/**
 * Get part costs by supplier
 */
export async function listBySupplier(req, res, next) {
  try {
    const { company_id } = req.user;
    const supplier_id = Number(req.params.supplier_id);
    const { limit, offset } = req.query;

    const result = await getPartCostsBySupplier({
      company_id,
      supplier_id,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}

/**
 * Get part costs by part
 */
export async function listByPart(req, res, next) {
  try {
    const { company_id } = req.user;
    const part_id = Number(req.params.part_id);
    const { limit, offset } = req.query;

    const result = await getPartCostsByPart({
      company_id,
      part_id,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}

/**
 * Search part costs
 */
export async function search(req, res, next) {
  try {
    const { company_id } = req.user;
    const { q, limit, offset } = req.query;

    const result = await searchPartCosts({
      company_id,
      q: q || '',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}

/* ------------------------- SINGLE ------------------------- */

export async function getOne(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const row = await getPartCostById(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

/* ------------------------- CREATE / UPDATE / DELETE ------------------------- */

export async function create(req, res, next) {
  try {
    const { company_id } = req.user;

    const body = pick(req.body, PART_COST_COLUMNS);
    delete body.company_id;

    if (!body.part_id) {
      return res.status(400).json({ error: 'part_id required' });
    }
    if (!body.supplier_id) {
      return res.status(400).json({ error: 'supplier_id required' });
    }
    if (body.unit_cost == null) {
      return res.status(400).json({ error: 'unit_cost required' });
    }

    const created = await createPartCost(company_id, body);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

export async function patch(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const body = pick(req.body, PART_COST_COLUMNS);
    delete body.company_id;

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'empty patch' });
    }

    const updated = await updatePartCost(company_id, id, body);
    if (!updated) return res.status(404).json({ error: 'Not found' });

    res.json(updated);
  } catch (e) { next(e); }
}

export async function destroy(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const out = await deletePartCost(company_id, id);
    res.json(out);
  } catch (e) { next(e); }
}
