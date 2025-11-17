import {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deactivateCompany,
  deleteCompany,
  getCompanyColumnsMetadata,
} from '../../models/admin/Companies.mjs';

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return defaultValue;
}

export async function listCompanies(req, res, next) {
  try {
    const {
      limit,
      offset,
      includeInactive,
      search,
      q,
      withTotal,
    } = req.query;

    const result = await getCompanies({
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      includeInactive: parseBoolean(includeInactive, true),
      search: search ?? q ?? '',
      withTotal: parseBoolean(withTotal, false),
    });

    if (result && typeof result === 'object' && 'rows' in result && 'total' in result) {
      res.set('X-Total-Count', String(result.total ?? 0));
      res.set('Access-Control-Expose-Headers', 'X-Total-Count');
      return res.json(result.rows);
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getCompany(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid company identifier' });
    }

    const company = await getCompanyById(id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json(company);
  } catch (error) {
    return next(error);
  }
}

export async function createCompanyHandler(req, res, next) {
  try {
    const company = await createCompany(req.body ?? {});
    if (!company) {
      return res.status(500).json({ error: 'Failed to create company' });
    }
    return res.status(201).json(company);
  } catch (error) {
    if (error.message && error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
}

export async function updateCompanyHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid company identifier' });
    }

    const updated = await updateCompany(id, req.body ?? {});
    if (!updated) {
      return res.status(404).json({ error: 'Company not found or no changes applied' });
    }

    return res.json(updated);
  } catch (error) {
    if (error.message && error.message.toLowerCase().includes('no updatable')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
}

export async function deactivateCompanyHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid company identifier' });
    }

    const updated = await deactivateCompany(id);
    if (!updated) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json(updated);
  } catch (error) {
    if (error.message && error.message.includes('does not have is_active')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
}

export async function deleteCompanyHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid company identifier' });
    }

    const result = await deleteCompany(id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function companyMetadataHandler(req, res, next) {
  try {
    const columns = await getCompanyColumnsMetadata({ refresh: parseBoolean(req.query.refresh, false) });
    return res.json({ columns });
  } catch (error) {
    return next(error);
  }
}

