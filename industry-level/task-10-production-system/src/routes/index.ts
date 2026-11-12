// ROUTES: map URL + method to a controller and say WHO may call it.
//   public        : no token needed
//   authenticate  : any logged-in user (CUSTOMER or ADMIN)
//   requireAdmin  : ADMIN only
// asyncHandler forwards async errors to the error handler.
import { Router } from 'express';
import { login, me, register } from '../controllers/authController';
import { checkoutCartHandler, getCart, removeCartItem, setCartItem } from '../controllers/cartController';
import { checkoutOrder, getOrder, listOrders } from '../controllers/orderController';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from '../controllers/productController';
import { getPopularQueries, searchProducts } from '../controllers/searchController';
import { deleteUser, getUser, listUsers, setUserRole, updateUser } from '../controllers/userController';
import { asyncHandler } from '../lib/validation';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/authorize';
import { createAuthLimiter } from '../middleware/rateLimiter';

export function createApiRouter(): Router {
  const router = Router();

  // --- Auth (public) ---
  router.post('/auth/register', asyncHandler(register));
  router.post('/auth/login', createAuthLimiter(), asyncHandler(login));
  router.get('/auth/me', authenticate, asyncHandler(me));

  // --- Catalog: reading is public (Redis cache-aside), writing is ADMIN only ---
  // Semantic search is registered BEFORE "/products/:id", otherwise "search" would be read as a product id.
  router.get('/products/search', asyncHandler(searchProducts));
  router.get('/products', asyncHandler(listProducts));
  router.get('/products/:id', asyncHandler(getProduct));
  router.post('/products', authenticate, requireAdmin, asyncHandler(createProduct));
  router.put('/products/:id', authenticate, requireAdmin, asyncHandler(updateProduct));
  router.delete('/products/:id', authenticate, requireAdmin, asyncHandler(deleteProduct));
  router.get('/search/popular', authenticate, requireAdmin, asyncHandler(getPopularQueries));

  // --- Cart and orders: any logged-in user, always scoped to the token's user ---
  router.get('/cart', authenticate, asyncHandler(getCart));
  router.put('/cart/items', authenticate, asyncHandler(setCartItem));
  router.delete('/cart/items/:productId', authenticate, asyncHandler(removeCartItem));
  router.post('/cart/checkout', authenticate, asyncHandler(checkoutCartHandler));
  router.get('/orders', authenticate, asyncHandler(listOrders));
  router.get('/orders/:id', authenticate, asyncHandler(getOrder));
  router.post('/orders/checkout', authenticate, asyncHandler(checkoutOrder));

  // --- User administration: ADMIN only ---
  router.get('/users', authenticate, requireAdmin, asyncHandler(listUsers));
  router.get('/users/:id', authenticate, requireAdmin, asyncHandler(getUser));
  router.put('/users/:id', authenticate, requireAdmin, asyncHandler(updateUser));
  router.patch('/users/:id/role', authenticate, requireAdmin, asyncHandler(setUserRole));
  router.delete('/users/:id', authenticate, requireAdmin, asyncHandler(deleteUser));

  return router;
}
