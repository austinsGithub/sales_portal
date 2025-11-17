import express from 'express';
import { 
  getInventory, 
  getInventoryByProduct, 
  getAllInventory 
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
 * @route   GET /api/procurement/inventory/:partId
 * @desc    Get inventory records for a given part, including lots, suppliers, and locations
 */
router.get('/:partId', getInventory);

export default router;
