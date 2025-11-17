import express from 'express';
import { LocationGroupsController } from '../../controllers/inventory/LocationGroupsController.mjs';
import { requireAuth } from '../../middleware/requireAuth.mjs';

const router = express.Router();

router.get('/', requireAuth, LocationGroupsController.list);
router.get('/:id', requireAuth, LocationGroupsController.getById);
router.post('/', requireAuth, LocationGroupsController.create);
router.put('/:id', requireAuth, LocationGroupsController.update);
router.delete('/:id', requireAuth, LocationGroupsController.softDelete);

export default router;
