const express = require('express');
const router = express.Router();
const {
    getProducts,
    getProductById,
    createProduct,
    deleteProduct,
    updateProduct,
    getTopProducts,
    createProductReview,
    updateStockManual,
    getRelatedProducts
} = require('../controllers/productController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getProducts)
    .post(protect, admin, createProduct);

router.get('/public', getProducts);

router.get('/top', getTopProducts);
router
    .route('/:id')
    .get(getProductById)
    .delete(protect, admin, deleteProduct)
    .put(protect, admin, updateProduct);

router.route('/:id/reviews').post(protect, createProductReview);
router.route('/:id/stock').patch(protect, admin, updateStockManual);
router.get('/:id/related', getRelatedProducts);

module.exports = router;
