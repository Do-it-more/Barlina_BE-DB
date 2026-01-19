const express = require('express');
const router = express.Router();
const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getCategories)
    .post(protect, superAdmin, createCategory);

router.route('/:id')
    .put(protect, superAdmin, updateCategory)
    .delete(protect, superAdmin, deleteCategory);

module.exports = router;
