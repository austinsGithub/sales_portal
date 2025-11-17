import express from 'express';
import TransferOrdersController from '../../controllers/inventory/TransferOrdersController.mjs';
import { requireAuth } from '../../middleware/requireAuth.mjs';

const router = express.Router();

// Role/permission guard that is aware of super admins and role arrays
const authorize = (roles = []) => (req, res, next) => {
  if (!roles.length) return next();

  const isSuperAdmin =
    req.user?.is_super_admin === 1 ||
    req.user?.is_super_admin === true ||
    (req.user?.role || '').toLowerCase() === 'super_admin';
  if (isSuperAdmin) return next();

  const normalizedRequired = roles.map((role) => role.toLowerCase());
  const primaryRole = (req.user?.role || req.user?.user_role || req.user?.user_type || '').toLowerCase();
  const attachedRoles = Array.isArray(req.user?.roles)
    ? req.user.roles.map((role) =>
        typeof role === 'string' ? role.toLowerCase() : (role?.role_name || '').toLowerCase()
      )
    : [];

  const hasRole =
    (primaryRole && normalizedRequired.includes(primaryRole)) ||
    attachedRoles.some((role) => normalizedRequired.includes(role));

  if (!hasRole) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  next();
};

// All routes require authentication
router.use(requireAuth);

// Get all transfer orders with filtering
router.get('/', TransferOrdersController.getAll);

// Get single transfer order by ID
router.get('/:id', TransferOrdersController.getById);

// Create new transfer order
router.post('/', authorize(['admin', 'manager', 'warehouse']), TransferOrdersController.create);

// Update transfer order
router.put('/:id', authorize(['admin', 'manager', 'warehouse']), TransferOrdersController.update);

// Auto assign inventory for a blueprint requirement
router.post(
  '/:id/blueprint-items/:blueprintItemId/auto-assign',
  authorize(['admin', 'manager', 'warehouse']),
  TransferOrdersController.autoAssignBlueprintItem
);

// Manually assign a specific inventory lot to a blueprint requirement
router.post(
  '/:id/assignments',
  authorize(['admin', 'manager', 'warehouse']),
  TransferOrdersController.manualAssignInventory
);

// Assign an existing loadout to an order
router.post(
  '/:id/assign-loadout',
  authorize(['admin', 'manager', 'warehouse']),
  TransferOrdersController.assignLoadout
);

// Add item to transfer order
router.post('/:id/items', authorize(['admin', 'manager', 'warehouse']), TransferOrdersController.addItem);

// Delete item from transfer order
router.delete('/:id/items/:itemId', authorize(['admin', 'manager']), TransferOrdersController.deleteItem);

// Delete transfer order
router.delete('/:id', authorize(['admin', 'manager']), TransferOrdersController.delete);

export default router;
