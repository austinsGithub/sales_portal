// routes/inventory/productCategoriesRoutes.mjs
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.mjs';
import {
  list,
  search,
  topLevel,
  subcategories,
  getOne,
  create,
  patch,
  destroy,
  categoryProducts,
  productCategories,
  linkProduct,
  unlinkProduct,
} from '../../controllers/inventory/productCategoriesController.mjs';

const router = Router();

/**
 * All routes below require a valid JWT.
 * requireAuth sets req.user = { user_id, company_id, ... } from the token.
 */
router.use(requireAuth);

// --- Specific routes FIRST (so they don't get shadowed by :id) ---
router.get('/search', search);                        // simple text search
router.get('/top-level', topLevel);                   // get top-level categories (no parent)
router.get('/subcategories/:parent_id', subcategories); // get subcategories of a parent

// --- Product-to-category lookup ---
router.param('product_id', (req, res, next, val) => {
  const id = Number(val);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid product id' });
  }
  req.params.product_id = id;
  next();
});
router.get('/by-product/:product_id', productCategories);

// --- Base collection ---
router.get('/', list);                                // list all categories
router.post('/', create);                             // create new category

// --- ID param guard (prevents NaN reaching SQL) ---
router.param('id', (req, res, next, val) => {
  const id = Number(val);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid category id' });
  }
  req.params.id = id;
  next();
});

// --- Product links ---
router.get('/:id/products', categoryProducts);        // get products in this category
router.post('/:id/products', linkProduct);            // link a product to this category
router.delete('/:id/products/:product_id', unlinkProduct); // unlink a product from this category

// --- Item mutations ---
router.patch('/:id', patch);                          // update category
router.delete('/:id', destroy);                       // delete category

// --- Finally, single fetch LAST ---
router.get('/:id', getOne);

export default router;
