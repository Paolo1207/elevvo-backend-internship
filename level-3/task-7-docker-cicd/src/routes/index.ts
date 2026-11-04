// ROUTES: map URL + method to a controller. asyncHandler forwards async errors to the error handler.
import { Router } from 'express';
import { checkoutOrder, getOrder, listOrders } from '../controllers/orderController';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from '../controllers/productController';
import { createUser, deleteUser, getUser, listUsers, updateUser } from '../controllers/userController';
import { asyncHandler } from '../lib/validation';

const router = Router();

router.get('/users', asyncHandler(listUsers));
router.get('/users/:id', asyncHandler(getUser));
router.post('/users', asyncHandler(createUser));
router.put('/users/:id', asyncHandler(updateUser));
router.delete('/users/:id', asyncHandler(deleteUser));

router.get('/products', asyncHandler(listProducts));
router.get('/products/:id', asyncHandler(getProduct));
router.post('/products', asyncHandler(createProduct));
router.put('/products/:id', asyncHandler(updateProduct));
router.delete('/products/:id', asyncHandler(deleteProduct));

router.get('/orders', asyncHandler(listOrders));
router.get('/orders/:id', asyncHandler(getOrder));
router.post('/orders/checkout', asyncHandler(checkoutOrder));

export default router;