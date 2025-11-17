import express from 'express';

// Controller (works with default or named exports)
import * as RCNS from '../../controllers/procurement/receivingController.mjs';
const RC = RCNS.default ?? RCNS;

// AUTH: make sure we always have a function
let requireAuth = (_req, _res, next) => next(); // no-op fallback
try {
  const AuthNS = await import('../../middleware/requireAuth.mjs');
  requireAuth = AuthNS.requireAuth ?? AuthNS.default ?? requireAuth;
} catch (_) {
  // keep no-op if file doesn't exist yet
  console.warn('Using no-op auth middleware. For production, implement proper authentication.');
}

const router = express.Router();

// Debug (you already printed keys, keep if helpful)
console.log('[ReceivingController keys]', Object.keys(RC));

// Receiving list/search
router.get('/',          requireAuth, RC.list);
router.get('/search',    requireAuth, RC.search);

// Scan utilities
router.post('/parse-scan',   requireAuth, RC.parseScan);
router.post('/match-scan',   requireAuth, RC.matchScannedData);

// Purchase order lookup
router.get('/po/:poNumber',  requireAuth, RC.getPurchaseOrder);

// Receiving header
router.post('/',         requireAuth, RC.create);
router.get('/by-po/:poId', requireAuth, RC.getByPO); // New endpoint to find by PO ID
router.get('/:id',       requireAuth, RC.getOne);
router.patch('/:id',     requireAuth, RC.patch);
router.post('/:id/complete', requireAuth, RC.complete);

// Receiving items
router.get('/:id/items',                requireAuth, RC.listItems);
router.post('/:id/items',               requireAuth, RC.addItem);
router.put('/:id/items/:item_id',       requireAuth, RC.updateItem);
router.delete('/:id/items/:item_id',    requireAuth, RC.removeItem);

export default router;
