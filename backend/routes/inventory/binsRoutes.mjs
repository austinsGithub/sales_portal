import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.mjs';
import { requirePermission } from '../../controllers/security/permissionsController.mjs';
import { list, create, update, destroy } from '../../controllers/inventory/BinsController.mjs';

const router = Router();

router.use(requireAuth);

router.get('/', requirePermission('inventory.bins.view'), list);
router.post('/', requirePermission('inventory.bins.create'), create);
router.patch('/:id', requirePermission('inventory.bins.edit'), update);
router.delete('/:id', requirePermission('inventory.bins.delete'), destroy);

export default router;
