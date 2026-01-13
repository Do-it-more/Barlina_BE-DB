const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public / Scoped for Admin
const getCategories = asyncHandler(async (req, res) => {
    let query = {};

    // If request is from an authenticated admin (not super admin), filter by assigned categories
    if (req.user && req.user.role === 'admin') {
        query = { _id: { $in: req.user.assignedCategories } };
    }

    const categories = await Category.find(query).sort({ order: 1 });
    res.json(categories);
});

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
    const { name, description, image, order } = req.body;

    const categoryExists = await Category.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });
    if (categoryExists) {
        res.status(400);
        throw new Error('Category already exists');
    }

    const category = await Category.create({
        name,
        description,
        image,
        order
    });

    if (category) {
        res.status(201).json(category);
    } else {
        res.status(400);
        throw new Error('Invalid category data');
    }
});

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (category) {
        if (req.body.name && req.body.name !== category.name) {
            const categoryExists = await Category.findOne({
                name: { $regex: new RegExp(`^${req.body.name.trim()}$`, 'i') },
                _id: { $ne: category._id }
            });
            if (categoryExists) {
                res.status(400);
                throw new Error('Category already exists with this name');
            }
        }
        category.name = req.body.name || category.name;
        category.description = req.body.description || category.description;
        category.image = req.body.image || category.image;
        category.order = req.body.order || category.order;

        const updatedCategory = await category.save();
        res.json(updatedCategory);
    } else {
        res.status(404);
        throw new Error('Category not found');
    }
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (category) {
        await category.deleteOne();
        res.json({ message: 'Category removed' });
    } else {
        res.status(404);
        throw new Error('Category not found');
    }
});

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
