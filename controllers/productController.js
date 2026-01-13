const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Order = require('../models/Order');

// @desc    Get all products
// @route   GET /api/products
// @access  Public / Scoped for Admin
const getProducts = asyncHandler(async (req, res) => {
    const keyword = req.query.keyword ? {
        name: {
            $regex: req.query.keyword,
            $options: 'i'
        }
    } : {};

    let categoryFilter = req.query.category ? { category: req.query.category } : {};

    // RBAC: If request is from an authenticated admin (not super admin), MUST filter by assigned categories
    if (req.user && req.user.role === 'admin') {
        const assignedIds = req.user.assignedCategories.map(c => c.toString());

        // If a specific category was requested, verify it's assigned
        if (req.query.category) {
            if (!assignedIds.includes(req.query.category)) {
                // Return empty if trying to access unauthorized category
                return res.json([]);
            }
        } else {
            // Default: Show only assigned categories
            categoryFilter = { category: { $in: req.user.assignedCategories } };
        }
    }

    const products = await Product.find({ ...keyword, ...categoryFilter })
        .select('name price discountPrice image countInStock rating numReviews category isCodAvailable estimatedDeliveryDays colors specifications');
    res.json(products);
});

// @desc    Get top rated products
// @route   GET /api/products/top
// @access  Public
const getTopProducts = asyncHandler(async (req, res) => {
    // Return newest 10 products as a simple "Top" metric for now, or just limit 8
    const products = await Product.find({})
        .sort({ createdAt: -1 })
        .select('name price discountPrice image countInStock rating numReviews category')
        .limit(8);
    res.json(products);
});

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        res.json(product);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
    const { name, price, discountPrice, description, image, images, brand, category, countInStock, isCodAvailable, estimatedDeliveryDays, colors, specifications } = req.body;

    const mainImage = (images && images.length > 0) ? images[0] : image;

    const product = new Product({
        name,
        price,
        discountPrice: discountPrice || 0,
        user: req.user._id,
        image: mainImage,
        images: images || [mainImage],
        brand,
        category,
        countInStock,
        isCodAvailable: isCodAvailable !== undefined ? isCodAvailable : true,
        estimatedDeliveryDays: estimatedDeliveryDays || undefined,
        colors: colors || [],
        specifications: specifications || [],
        numReviews: 0,
        description,
        returnPolicy: req.body.returnPolicy // Persist Return Policy
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
});

const AdminApprovalRequest = require('../models/AdminApprovalRequest');

// ... imports ...

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        // APPROVAL WORKFLOW:
        // If not Super Admin, we don't delete. We Request Approval.
        if (req.user && req.user.role !== 'super_admin') {

            // Check if there is already a pending request to avoid duplicates
            const existingRequest = await AdminApprovalRequest.findOne({
                targetId: req.params.id,
                action: 'DELETE_PRODUCT',
                status: 'PENDING'
            });

            if (existingRequest) {
                res.status(400);
                throw new Error('A deletion request for this product is already pending.');
            }

            const request = await AdminApprovalRequest.create({
                admin: req.user._id,
                action: 'DELETE_PRODUCT',
                targetModel: 'Product',
                targetId: req.params.id,
                requestData: {
                    productName: product.name,
                    reason: 'Admin requested deletion via dashboard'
                },
                status: 'PENDING'
            });

            return res.status(202).json({
                message: 'Deletion request submitted for Super Admin approval',
                approvalId: request._id,
                isPending: true
            });
        }

        // Processing for Super Admin
        await product.deleteOne();
        res.json({ message: 'Product removed' });
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
    const { name, price, discountPrice, description, image, images, brand, category, countInStock, isCodAvailable, estimatedDeliveryDays, colors, specifications } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
        product.name = name || product.name;
        product.price = price !== undefined ? price : product.price; // Allow 0
        product.discountPrice = discountPrice !== undefined ? discountPrice : product.discountPrice;
        product.description = description || product.description;
        product.images = images || product.images;
        product.isCodAvailable = isCodAvailable !== undefined ? isCodAvailable : product.isCodAvailable;

        if (estimatedDeliveryDays !== undefined) {
            product.estimatedDeliveryDays = estimatedDeliveryDays || null;
        }

        product.colors = colors || product.colors;
        product.specifications = specifications || product.specifications;

        // Update main image if images array is provided
        if (images && images.length > 0) {
            product.image = images[0];
        } else if (image) {
            product.image = image;
        }

        product.brand = brand || product.brand;
        product.category = category || product.category;
        product.countInStock = countInStock !== undefined ? countInStock : product.countInStock; // Allow 0
        product.returnPolicy = req.body.returnPolicy || product.returnPolicy; // Persist Return Policy

        const updatedProduct = await product.save();
        res.json(updatedProduct);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private

// ... (existing code)

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = asyncHandler(async (req, res) => {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
        // Check if user has purchased the item
        const hasPurchased = await Order.findOne({
            user: req.user._id,
            'orderItems.product': req.params.id,
            isPaid: true
        });

        if (!hasPurchased) {
            res.status(400);
            throw new Error('You can only review products you have purchased.');
        }

        const alreadyReviewed = product.reviews.find(
            (r) => r.user.toString() === req.user._id.toString()
        );

        if (alreadyReviewed) {
            res.status(400);
            throw new Error('Product already reviewed');
        }

        const review = {
            name: req.user.name,
            rating: Number(rating),
            comment,
            user: req.user._id
        };

        product.reviews.push(review);
        product.numReviews = product.reviews.length;
        product.rating =
            product.reviews.reduce((acc, item) => item.rating + acc, 0) /
            product.reviews.length;

        await product.save();
        res.status(201).json({ message: 'Review added' });
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Manual Stock Adjustment (Admin)
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin
const updateStockManual = asyncHandler(async (req, res) => {
    const { qtyChange } = req.body; // e.g., 10 to add, -5 to remove

    if (qtyChange === undefined || isNaN(qtyChange)) {
        res.status(400);
        throw new Error('Please provide a valid quantity change (qtyChange)');
    }

    const product = await Product.findById(req.params.id);

    if (product) {
        // Atomic update to prevent overwriting live stock changes from orders
        const result = await Product.findOneAndUpdate(
            {
                _id: req.params.id,
                // If decreasing, ensure we don't go below 0
                ...(qtyChange < 0 ? { countInStock: { $gte: Math.abs(qtyChange) } } : {})
            },
            { $inc: { countInStock: qtyChange } },
            { new: true }
        );

        if (!result) {
            res.status(400);
            throw new Error(qtyChange < 0 ? 'Insufficient stock for this manual reduction' : 'Failed to update stock');
        }

        console.log(`[Admin Stock Update] ${product.name}: ${qtyChange < 0 ? 'Reduced' : 'Added'} ${Math.abs(qtyChange)}. New stock: ${result.countInStock}`);
        res.json(result);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Get related products
// @route   GET /api/products/:id/related
// @access  Public
const getRelatedProducts = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        // 1. Get products from the same category
        let related = await Product.find({
            _id: { $ne: product._id },
            category: product.category
        })
            .select('name price discountPrice image countInStock rating numReviews category')
            .limit(8);

        // 2. If we have less than 8, fill the remaining space with other products
        if (related.length < 8) {
            const excludeIds = [product._id, ...related.map(p => p._id)];
            const filler = await Product.find({
                _id: { $nin: excludeIds }
            })
                .select('name price discountPrice image countInStock rating numReviews category')
                .limit(8 - related.length);

            related = [...related, ...filler];
        }

        res.json(related);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

module.exports = {
    getProducts,
    getTopProducts,
    getProductById,
    createProduct,
    deleteProduct,
    updateProduct,
    createProductReview,
    updateStockManual,
    getRelatedProducts
};
