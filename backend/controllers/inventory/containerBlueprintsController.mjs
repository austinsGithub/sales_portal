import { ContainerBlueprintModel } from '../../models/inventory/ContainerBlueprints.mjs';
import pool from '../../db/pool.mjs';

// Helper function to get company_id from request
function getCompanyId(req) {
  return req.user?.company_id;
}

export const ContainerBlueprintsController = {
  async search(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ message: 'Company ID is required' });
      }

      const limit = parseInt(req.query.limit || 10);
      const offset = parseInt(req.query.offset || 0);
      const q = req.query.q || '';

      const [data, total] = await Promise.all([
        ContainerBlueprintModel.getAll({ company_id, limit, offset, q }),
        ContainerBlueprintModel.countAll(company_id, q)
      ]);

      res.setHeader('X-Total-Count', total);
      res.json(data);
    } catch (err) {
      console.error('Error searching blueprints:', err);
      res.status(500).json({ message: 'Failed to retrieve blueprints' });
    }
  },

  async getOne(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ message: 'Company ID is required' });
      }

      const blueprint = await ContainerBlueprintModel.getOne(req.params.id, company_id);
      
      if (!blueprint) {
        return res.status(404).json({ message: 'Blueprint not found' });
      }

      res.json(blueprint);
    } catch (err) {
      console.error('Error fetching blueprint:', err);
      res.status(500).json({ message: 'Failed to fetch blueprint' });
    }
  },

  async create(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ message: 'Company ID is required' });
      }

      const created = await ContainerBlueprintModel.create({
        ...req.body,
        company_id // Ensure company_id comes from the authenticated user
      });
      res.status(201).json(created);
    } catch (err) {
      console.error('Error creating blueprint:', err);
      res.status(500).json({ message: 'Failed to create blueprint' });
    }
  },

  async update(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ message: 'Company ID is required' });
      }

      // Verify the blueprint belongs to the company before updating
      const [blueprint] = await pool.query(
        'SELECT 1 FROM container_blueprints WHERE blueprint_id = ? AND company_id = ?',
        [req.params.id, company_id]
      );

      if (!blueprint.length) {
        return res.status(404).json({ message: 'Blueprint not found or access denied' });
      }

      const updated = await ContainerBlueprintModel.update(req.params.id, req.body, company_id);
      res.json(updated);
    } catch (err) {
      console.error('Error updating blueprint:', err);
      res.status(500).json({ message: 'Failed to update blueprint' });
    }
  },

  async getItems(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ message: 'Company ID is required' });
      }

      // Verify the blueprint belongs to the company
      const [blueprint] = await pool.query(
        'SELECT 1 FROM container_blueprints WHERE blueprint_id = ? AND company_id = ?',
        [req.params.id, company_id]
      );

      if (!blueprint.length) {
        return res.status(404).json({ message: 'Blueprint not found or access denied' });
      }

      const items = await ContainerBlueprintModel.getItems(req.params.id, company_id);
      res.json(items);
    } catch (err) {
      console.error('Error fetching blueprint items:', err);
      res.status(500).json({ message: 'Failed to load blueprint items' });
    }
  },

  async addItem(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ message: 'Company ID is required' });
      }

      // Verify the blueprint belongs to the company
      const [blueprint] = await pool.query(
        'SELECT 1 FROM container_blueprints WHERE blueprint_id = ? AND company_id = ?',
        [req.params.id, company_id]
      );

      if (!blueprint.length) {
        return res.status(404).json({ message: 'Blueprint not found or access denied' });
      }

      const item = await ContainerBlueprintModel.addItem(req.params.id, req.body, company_id);
      res.status(201).json(item);
    } catch (err) {
      console.error('Error adding blueprint item:', err);
      res.status(500).json({ message: 'Failed to add blueprint item' });
    }
  },

  async removeItem(req, res) {
    try {
      const company_id = getCompanyId(req);
      if (!company_id) {
        return res.status(403).json({ 
          success: false,
          message: 'Company ID is required' 
        });
      }

      const result = await ContainerBlueprintModel.removeItem(
        req.params.id, 
        req.params.itemId, 
        company_id
      );
      
      if (result.success) {
        return res.json({
          success: true,
          message: result.message || 'Item removed successfully'
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Item not found or already removed'
        });
      }
    } catch (err) {
      console.error('Error removing blueprint item:', err);
      const statusCode = err.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Failed to remove blueprint item'
      });
    }
  }
};