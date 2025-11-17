import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.mjs';
import * as controller from '../../controllers/procurement/purchaseOrdersController.mjs';

const router = Router();
router.use(requireAuth);

// --- Purchase Order routes ---
// Note: Specific routes must come BEFORE generic parameterized routes
router.get('/', controller.list);
router.get('/search', controller.list); // Alias for search functionality
router.post('/', controller.create);

// Specific action routes (must be before generic /:id routes)
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);
router.post('/:id/send', controller.sendToSupplier);
router.post('/:id/deactivate', controller.deactivate);

// Purchase Order Line routes (must be before generic /:id routes)
router.post('/:id/lines', controller.addLine);
router.put('/:id/lines/:line_id', controller.updateLine); // Changed from PATCH to PUT to match frontend
router.delete('/:id/lines/:line_id', controller.deleteLine); // Added /:id/ to match frontend

// Generic parameterized routes (must come AFTER specific routes)
router.get('/:id', controller.getOne);
router.patch('/:id', controller.update);
router.delete('/:id', controller.destroy);

export default router;
