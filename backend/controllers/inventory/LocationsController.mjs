import { ProcurementLocationsModel } from '../../models/inventory/Locations.mjs';

function getCompanyId(req) {
  return req.user?.company_id;
}

export const ProcurementLocationsController = {
  async list(req, res) {
    try {
      const company_id = getCompanyId(req);
      const { q, limit, offset } = req.query;
      const data = await ProcurementLocationsModel.getAll({
        company_id,
        q,
        limit: parseInt(limit) || undefined,
        offset: parseInt(offset) || undefined
      });
      res.json(data);
    } catch (err) {
      console.error('Error fetching procurement locations:', err);
      res.status(500).json({ message: 'Failed to load procurement locations' });
    }
  },

  async create(req, res) {
    try {
      const company_id = getCompanyId(req);
      const location = await ProcurementLocationsModel.create({
        company_id,
        ...req.body
      });
      res.status(201).json(location);
    } catch (err) {
      console.error('Error creating procurement location:', err);
      res.status(500).json({ message: 'Failed to create procurement location' });
    }
  },

  async update(req, res) {
    try {
      const company_id = getCompanyId(req);
      const location_id = req.params.id;
      await ProcurementLocationsModel.update({
        company_id,
        location_id,
        patch: req.body
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating procurement location:', err);
      res.status(500).json({ message: 'Failed to update procurement location' });
    }
  },

  async softDelete(req, res) {
    try {
      const company_id = getCompanyId(req);
      const location_id = req.params.id;
      await ProcurementLocationsModel.softDelete({ company_id, location_id });
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting procurement location:', err);
      res.status(500).json({ message: 'Failed to delete procurement location' });
    }
  }
};
