import { LocationGroupsModel } from '../../models/inventory/LocationGroups.mjs';

function getCompanyId(req) {
  return req.user?.company_id;
}

export const LocationGroupsController = {
  async list(req, res) {
    try {
      const company_id = getCompanyId(req);
      const { q, limit, offset, withCount } = req.query;
      
      let data;
      if (withCount === 'true') {
        data = await LocationGroupsModel.getWithLocationCount({ company_id });
      } else {
        data = await LocationGroupsModel.getAll({
          q,
          limit: parseInt(limit) || undefined,
          offset: parseInt(offset) || undefined
        });
      }
      
      res.json(data);
    } catch (err) {
      console.error('Error fetching location groups:', err);
      res.status(500).json({ message: 'Failed to load location groups' });
    }
  },

  async getById(req, res) {
    try {
      const group_id = req.params.id;
      const data = await LocationGroupsModel.getById({ group_id });
      
      if (!data) {
        return res.status(404).json({ message: 'Location group not found' });
      }
      
      res.json(data);
    } catch (err) {
      console.error('Error fetching location group:', err);
      res.status(500).json({ message: 'Failed to load location group' });
    }
  },

  async create(req, res) {
    try {
      const group = await LocationGroupsModel.create(req.body);
      res.status(201).json(group);
    } catch (err) {
      console.error('Error creating location group:', err);
      res.status(500).json({ message: 'Failed to create location group' });
    }
  },

  async update(req, res) {
    try {
      const group_id = req.params.id;
      await LocationGroupsModel.update({
        group_id,
        patch: req.body
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating location group:', err);
      res.status(500).json({ message: 'Failed to update location group' });
    }
  },

  async softDelete(req, res) {
    try {
      const group_id = req.params.id;
      await LocationGroupsModel.softDelete({ group_id });
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting location group:', err);
      
      if (err.message.includes('Cannot delete')) {
        return res.status(400).json({ message: err.message });
      }
      
      res.status(500).json({ message: 'Failed to delete location group' });
    }
  }
};
