// routes/procurement/partCostsRoutes.mjs
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.mjs';
import {
  listBySupplier,
  listByPart,
  search,
  getOne,
  create,
  patch,
  destroy,
} from '../../controllers/procurement/partCostsController.mjs';

const router = Router();

/**
 * All routes below require a valid JWT.
 * requireAuth sets req.user = { user_id, company_id, ... } from the token.
 */
router.use(requireAuth);

// --- Specific routes FIRST (so they don't get shadowed by :id) ---
router.get('/search', search);                        // simple text search; company_id from JWT
router.get('/by-supplier/:supplier_id', listBySupplier); // get all costs for a supplier
router.get('/by-part/:part_id', listByPart);          // get all costs for a part

// --- Base collection ---
router.post('/', create);                             // create with company_id from JWT

// --- ID param guard (prevents NaN reaching SQL) ---
router.param('id', (req, res, next, val) => {
  const id = Number(val);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid cost id' });
  }
  req.params.id = id;
  next();
});

// --- Item mutations ---
router.patch('/:id', patch);                          // company_id from JWT + cost_id param
router.delete('/:id', destroy);

// --- Finally, single fetch LAST ---
router.get('/:id', getOne);

export default router;
