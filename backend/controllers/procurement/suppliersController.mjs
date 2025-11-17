// controllers/procurement/suppliersController.mjs
import {
  getSupplierById,
  searchSuppliersAdvanced,
  getSupplierByCode,
  getSuppliers,
  searchSuppliers,
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  deleteSupplier,
  SUPPLIER_COLUMNS,
} from '../../models/procurement/Supplier.mjs';

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function sendWithTotal(res, payload) {
  // Support both shapes:
  // 1) array of rows
  // 2) { rows: [], total: number }
  if (Array.isArray(payload)) {
    return res.json(payload);
  }
  const { rows = [], total } = payload || {};
  if (Number.isFinite(total)) {
    // Expose the header to browsers (CORS)
    res.set('X-Total-Count', String(total));
    res.set('Access-Control-Expose-Headers', 'X-Total-Count');
  }
  return res.json(rows);
}

/* ------------------------- COLLECTION ------------------------- */

export async function list(req, res, next) {
  try {
    const { company_id } = req.user;             // <- from JWT
    const { limit, offset, includeInactive } = req.query;

    const result = await getSuppliers({
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

    const result = await searchSuppliers({
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

    const row = await getSupplierById(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

export async function byCode(req, res, next) {
  try {
    const { company_id } = req.user;
    const { supplier_code } = req.params;

    const row = await getSupplierByCode(company_id, supplier_code);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

/* ------------------------- CREATE / UPDATE / DELETE ------------------------- */

export async function create(req, res, next) {
  try {
    const { company_id } = req.user;

    // Only accept allowed supplier columns from body
    const body = pick(req.body, SUPPLIER_COLUMNS);

    // Never trust client tenant
    delete body.company_id;

    if (!body.supplier_name) {
      return res.status(400).json({ error: 'supplier_name required' });
    }

    // Optional coercions/sensible defaults
    if (body.is_active === undefined) body.is_active = 1;
    if (body.preferred_vendor !== undefined) {
      body.preferred_vendor = body.preferred_vendor ? 1 : 0;
    }
    if (body.lead_time_days !== undefined) {
      body.lead_time_days = Number(body.lead_time_days) || 0;
    }
    if (body.minimum_order_amount !== undefined) {
      body.minimum_order_amount = Number(body.minimum_order_amount) || 0;
    }

    const created = await createSupplier(company_id, body);
    res.status(201).json(created);
  } catch (e) { next(e); }
}

export async function patch(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const body = pick(req.body, SUPPLIER_COLUMNS);
    delete body.company_id; // prevent cross-tenant tampering

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'empty patch' });
    }

    // Coerce a few common numeric/boolean-y fields if present
    if (body.preferred_vendor !== undefined) {
      body.preferred_vendor = body.preferred_vendor ? 1 : 0;
    }
    if (body.is_active !== undefined) {
      body.is_active = body.is_active ? 1 : 0;
    }
    if (body.lead_time_days !== undefined) {
      body.lead_time_days = Number(body.lead_time_days) || 0;
    }
    if (body.minimum_order_amount !== undefined) {
      body.minimum_order_amount = Number(body.minimum_order_amount) || 0;
    }

    const updated = await updateSupplier(company_id, id, body);
    if (!updated) return res.status(404).json({ error: 'Not found' });

    res.json(updated);
  } catch (e) { next(e); }
}

export async function deactivate(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const row = await deactivateSupplier(company_id, id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    res.json(row);
  } catch (e) { next(e); }
}

export async function destroy(req, res, next) {
  try {
    const { company_id } = req.user;
    const id = Number(req.params.id);

    const out = await deleteSupplier(company_id, id);
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
      preferred_vendor,
      city,
      state,
      payment_terms,
      quality_rating,
      min_lead_time_days,
      max_lead_time_days,
      min_minimum_order_amount,
      max_minimum_order_amount,
    } = req.query;

    const result = await searchSuppliersAdvanced({
      company_id,
      q,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      includeInactive: includeInactive === 'true',
      preferred_vendor,
      city,
      state,
      payment_terms,
      quality_rating,
      min_lead_time_days: min_lead_time_days ? Number(min_lead_time_days) : undefined,
      max_lead_time_days: max_lead_time_days ? Number(max_lead_time_days) : undefined,
      min_minimum_order_amount: min_minimum_order_amount ? Number(min_minimum_order_amount) : undefined,
      max_minimum_order_amount: max_minimum_order_amount ? Number(max_minimum_order_amount) : undefined,
    });

    sendWithTotal(res, result);
  } catch (e) { next(e); }
}
