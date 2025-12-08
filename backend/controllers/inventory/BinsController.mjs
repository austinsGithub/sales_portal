import { BinsModel } from '../../models/inventory/Bins.mjs';

export async function list(req, res, next) {
  try {
    const { company_id } = req.user;
    const { location_id, q, limit, offset } = req.query;
    const rows = await BinsModel.list({
      company_id,
      location_id: location_id ? Number(location_id) : undefined,
      q,
      limit,
      offset
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { company_id } = req.user;
    const { location_id, aisle, rack, shelf, bin, zone, description } = req.body || {};

    if (!location_id) {
      return res.status(400).json({ error: 'location_id is required' });
    }

    const created = await BinsModel.create({
      company_id,
      location_id,
      aisle,
      rack,
      shelf,
      bin,
      zone,
      description
    });

    // Return the created bin with location_name
    const bins = await BinsModel.list({ company_id, limit: 1000 });
    const newBin = bins.find(b => b.bin_id === created.bin_id);

    res.status(201).json(newBin || created);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { company_id } = req.user;
    const bin_id = Number(req.params.id);
    if (!bin_id) return res.status(400).json({ error: 'invalid bin id' });

    await BinsModel.update({
      company_id,
      bin_id,
      patch: req.body || {}
    });

    // Return the updated bin with location_name
    const bins = await BinsModel.list({ company_id, limit: 1000 });
    const updatedBin = bins.find(b => b.bin_id === bin_id);

    res.json(updatedBin || { bin_id, updated: true });
  } catch (err) {
    next(err);
  }
}

export async function destroy(req, res, next) {
  try {
    const { company_id } = req.user;
    const bin_id = Number(req.params.id);
    if (!bin_id) return res.status(400).json({ error: 'invalid bin id' });

    await BinsModel.softDelete({ company_id, bin_id });
    res.json({ bin_id, deleted: true });
  } catch (err) {
    if (err?.code === 'BIN_IN_USE') {
      return res.status(409).json({
        error: 'Bin has inventory and cannot be deleted',
        code: 'BIN_IN_USE'
      });
    }
    next(err);
  }
}
