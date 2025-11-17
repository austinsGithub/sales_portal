import { ContainerLoadoutsModel } from '../../models/inventory/ContainerLoadouts.mjs';

const getCompanyId = (req, res) => {
  const company_id = req.user?.company_id;
  if (!company_id) {
    res.status(401).json({ message: 'Unauthorized: Missing company ID on user token.' });
    return null;
  }
  return company_id;
};

export const ContainerLoadoutsController = {
  async get(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;

    const loadout_id = parseInt(req.params.id, 10);
    if (isNaN(loadout_id)) {
      return res.status(400).json({ message: 'Invalid loadout ID.' });
    }

    try {
      const loadout = await ContainerLoadoutsModel.getById(loadout_id, company_id);

      if (!loadout) {
        return res.status(404).json({ message: 'Container loadout not found or access denied.' });
      }

      res.status(200).json(loadout);
    } catch (error) {
      console.error('Error fetching loadout:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  },

  async search(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;

    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;
    const q = req.query.q;
    const blueprintId = req.query.blueprintId ? Number(req.query.blueprintId) : undefined;
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const includeInactive = req.query.includeInactive === 'true';

    try {
      const total = await ContainerLoadoutsModel.countAll({
        company_id,
        q,
        blueprint_id: blueprintId,
        location_id: locationId,
        includeInactive
      });
      const loadouts = await ContainerLoadoutsModel.getAll({ 
        company_id,
        limit,
        offset,
        q,
        blueprint_id: blueprintId,
        location_id: locationId,
        includeInactive
      });

      res.header('X-Total-Count', total);
      res.status(200).json(loadouts);
    } catch (error) {
      console.error('Error searching loadouts:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  },

  async create(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;

    const { 
      blueprint_id, location_id, serial_suffix, status, notes
    } = req.body;
    
    if (!blueprint_id || !location_id) {
      return res.status(400).json({ message: 'Blueprint ID and Location ID are required.' });
    }
    
    const data = {
      blueprint_id: Number(blueprint_id),
      company_id: company_id,
      location_id: Number(location_id),
      serial_suffix: serial_suffix,
      status: status,
      notes: notes,
      created_by: req.user.user_id || null
    };

    try {
      const createdLoadout = await ContainerLoadoutsModel.create(data);
      res.status(201).json(createdLoadout);
    } catch (error) {
      console.error('Error creating loadout:', error);
      res.status(500).json({ message: error.message || 'Failed to create loadout.' });
    }
  },

  async update(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;
    
    const loadout_id = parseInt(req.params.id, 10);
    if (isNaN(loadout_id)) {
      return res.status(400).json({ message: 'Invalid loadout ID.' });
    }

    const patch = req.body;
    
    try {
      const updatedLoadout = await ContainerLoadoutsModel.update(loadout_id, patch, company_id);
      res.status(200).json(updatedLoadout);
    } catch (error) {
      console.error('Error updating loadout:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: error.message || 'Failed to update loadout.' });
    }
  },

  async toggleActive(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;

    const loadout_id = parseInt(req.params.id, 10);
    if (isNaN(loadout_id)) {
      return res.status(400).json({ message: 'Invalid loadout ID.' });
    }

    try {
      const current = await ContainerLoadoutsModel.getById(loadout_id, company_id);
      if (!current) {
        return res.status(404).json({ message: 'Loadout not found or access denied.' });
      }

      const updated = await ContainerLoadoutsModel.update(loadout_id, 
        { is_active: !current.is_active }, 
        company_id
      );

      res.json({
        message: 'Status updated successfully',
        data: updated
      });
    } catch (error) {
      console.error('Error toggling loadout status:', error);
      res.status(500).json({ message: 'Failed to update loadout status.' });
    }
  },

  async getLots(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;
    
    const loadout_id = parseInt(req.params.loadoutId, 10);
    if (isNaN(loadout_id)) {
      return res.status(400).json({ message: 'Invalid loadout ID.' });
    }

    try {
      const lots = await ContainerLoadoutsModel.getLotsByLoadoutId(loadout_id, company_id);
      res.status(200).json(lots);
    } catch (error) {
      console.error('Error fetching loadout lots:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  },

  async addLot(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;
    
    const loadout_id = parseInt(req.params.loadoutId, 10);
    if (isNaN(loadout_id)) {
      return res.status(400).json({ message: 'Invalid loadout ID.' });
    }
    
    const { product_id, lot_id, quantity_used, notes } = req.body;

    if (!product_id || !lot_id || !quantity_used) {
      return res.status(400).json({ message: 'Product ID, Lot ID, and Quantity Used are required.' });
    }
    
    const lotData = {
      product_id: Number(product_id),
      lot_id: Number(lot_id),
      quantity_used: Number(quantity_used),
      notes: notes
    };

    try {
      const createdLot = await ContainerLoadoutsModel.addLotToLoadout(loadout_id, company_id, lotData);
      res.status(201).json(createdLot);
    } catch (error) {
      console.error('Error adding lot to loadout:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({ message: error.message });
      }
      if (error.message.includes('Insufficient inventory')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message || 'Failed to add lot to loadout.' });
    }
  },

  async removeLot(req, res) {
    const company_id = getCompanyId(req, res);
    if (!company_id) return;
    
    const loadout_id = parseInt(req.params.loadoutId, 10);
    const lot_loadout_id = parseInt(req.params.lotLoadoutId, 10);

    if (isNaN(loadout_id) || isNaN(lot_loadout_id)) {
      return res.status(400).json({ message: 'Invalid loadout ID or loadout lot ID.' });
    }

    try {
      const result = await ContainerLoadoutsModel.removeLotFromLoadout(loadout_id, lot_loadout_id, company_id);

      if (!result.success) {
        return res.status(404).json({ message: 'Lot assignment not found, loadout not found, or access denied.' });
      }

      res.status(204).end();
    } catch (error) {
      console.error('Error removing loadout lot:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
};
