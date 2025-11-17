// routes/procurement/suppliersRoutes.mjs
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.mjs';
import {
  list,
  search,
  searchAdvanced,
  getOne,
  byCode,
  create,
  patch,
  deactivate,
  destroy,
} from '../../controllers/procurement/suppliersController.mjs';

const router = Router();

/**
 * All routes below require a valid JWT.
 * requireAuth sets req.user = { user_id, company_id, ... } from the token.
 */
router.use(requireAuth);

// --- Specific routes FIRST (so they don't get shadowed by :id) ---
router.get('/search-advanced', searchAdvanced);       // filters + q; company_id comes from JWT
router.get('/search', search);                        // simple text search; company_id from JWT
router.get('/by-code/:supplier_code', byCode);        // company_id from JWT, code in params

// --- Base collection ---
router.get('/', list);                                // list by company_id from JWT
router.post('/', create);                             // create with company_id from JWT (ignore client company_id)

// --- ID param guard (prevents NaN reaching SQL) ---
router.param('id', (req, res, next, val) => {
  const id = Number(val);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid supplier id' });
  }
  req.params.id = id;
  next();
});

// --- Item mutations ---
router.patch('/:id', patch);                          // company_id from JWT + supplier_id param
router.post('/:id/deactivate', deactivate);
router.delete('/:id', destroy);

// --- Finally, single fetch LAST ---
router.get('/:id', getOne);

export default router;
