import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.mjs';
import {
  list,
  search,
  searchAdvanced,
  getOne,
  create,
  patch,
  deactivate,
  destroy
} from '../../controllers/inventory/productsController.mjs';

const router = Router();
router.use(requireAuth);

router.get('/search-advanced', searchAdvanced);
router.get('/search', search);
router.get('/', list);
router.post('/', create);

router.param('id', (req, res, next, val) => {
  const id = Number(val);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid product id' });
  req.params.id = id;
  next();
});

router.patch('/:id', patch);
router.post('/:id/deactivate', deactivate);
router.delete('/:id', destroy);
router.get('/:id', getOne);

export default router;
