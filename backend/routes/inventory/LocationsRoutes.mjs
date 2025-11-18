import express from 'express';
import { ProcurementLocationsController } from '../../controllers/inventory/LocationsController.mjs';
import { requireAuth } from '../../middleware/requireAuth.mjs';

const router = express.Router();

router.get('/', requireAuth, ProcurementLocationsController.list);
router.get('/:id/inventory', requireAuth, ProcurementLocationsController.inventoryByLocation);
router.post('/', requireAuth, ProcurementLocationsController.create);
router.put('/:id', requireAuth, ProcurementLocationsController.update);
router.delete('/:id', requireAuth, ProcurementLocationsController.softDelete);

export default router;
