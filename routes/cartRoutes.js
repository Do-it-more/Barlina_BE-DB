const express = require('express');
const router = express.Router();
const { addToCart, getCart, updateCartItem, removeCartItem, clearCart } = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

router.route('/add').post(protect, addToCart);
router.route('/update').put(protect, updateCartItem);
router.route('/remove/:productId').delete(protect, removeCartItem);
router.route('/clear').delete(protect, clearCart);
router.route('/').get(protect, getCart);

module.exports = router;
