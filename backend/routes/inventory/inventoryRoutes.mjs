import express from 'express';
import { 
  getInventory, 
  getInventoryByProduct, 
  getAllInventory,
  getInventoryByLocation
} from '../../controllers/inventory/inventoryController.mjs';
import { requireAuth } from '../../middleware/requireAuth.mjs';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * @route   GET /api/procurement/inventory
 * @desc    Get all inventory with pagination and search
 */
router.get('/', getAllInventory);

/**
 * @route   GET /api/procurement/inventory/by-product/:productId
 * @desc    Get inventory records by product → part linkage
 */
router.get('/by-product/:productId', getInventoryByProduct);

/**
 * @route   GET /api/inventory/items/by-location/:locationId
 * @desc    Get inventory records constrained to a single location (requires locationId)
 */
router.get('/by-location/:locationId', getInventoryByLocation);

/**
 * @route   GET /api/procurement/inventory/:partId
 * @desc    Get inventory records for a given part, including lots, suppliers, and locations
 */
router.get('/:partId', getInventory);

export default router;
