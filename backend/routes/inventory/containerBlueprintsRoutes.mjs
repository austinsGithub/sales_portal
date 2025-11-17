import express from 'express';
import { ContainerBlueprintsController } from '../../controllers/inventory/containerBlueprintsController.mjs';
import { requireAuth } from '../../middleware/requireAuth.mjs';

const router = express.Router();

/**
 * @route   GET /api/container_blueprints/search
 * @desc    Search and paginate blueprints
 */
router.get('/search', requireAuth, ContainerBlueprintsController.search);

/**
 * @route   POST /api/container_blueprints
 * @desc    Create new blueprint
 */
router.post('/', requireAuth, ContainerBlueprintsController.create);

/**
 * @route   GET /api/container_blueprints/:id
 * @desc    Get single blueprint by ID
 */
router.get('/:id', requireAuth, ContainerBlueprintsController.getOne);

/**
 * @route   PATCH /api/container_blueprints/:id
 * @desc    Update blueprint
 */
router.patch('/:id', requireAuth, ContainerBlueprintsController.update);

/**
 * @route   GET /api/container_blueprints/:id/items
 * @desc    Get blueprint items
 */
router.get('/:id/items', requireAuth, ContainerBlueprintsController.getItems);

/**
 * @route   POST /api/container_blueprints/:id/items
 * @desc    Add product item to blueprint
 */
router.post('/:id/items', requireAuth, ContainerBlueprintsController.addItem);

/**
 * @route   DELETE /api/container_blueprints/:id/items/:itemId
 * @desc    Remove item from blueprint
 */
router.delete('/:id/items/:itemId', requireAuth, ContainerBlueprintsController.removeItem);

export default router;