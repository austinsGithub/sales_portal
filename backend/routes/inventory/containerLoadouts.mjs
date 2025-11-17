import express from 'express';
// Importing auth middleware for JWT verification and user authentication
import { requireAuth } from '../../middleware/requireAuth.mjs';
import { ContainerLoadoutsController } from '../../controllers/inventory/ContainerLoadoutsController.mjs';

const router = express.Router();

// All routes use requireAuth for authentication and company ID enforcement

// Loadouts Collection
router.get('/search', requireAuth, ContainerLoadoutsController.search);
router.post('/', requireAuth, ContainerLoadoutsController.create);

// Single Loadout Item
router.get('/:id', requireAuth, ContainerLoadoutsController.get);
router.patch('/:id', requireAuth, ContainerLoadoutsController.update);

// Loadout Lots Sub-collection
router.get('/:loadoutId/lots', requireAuth, ContainerLoadoutsController.getLots);
router.post('/:loadoutId/lots', requireAuth, ContainerLoadoutsController.addLot);
router.delete('/:loadoutId/lots/:lotLoadoutId', requireAuth, ContainerLoadoutsController.removeLot);

// Toggle active status
router.patch('/:id/active', requireAuth, ContainerLoadoutsController.toggleActive);

export default router;