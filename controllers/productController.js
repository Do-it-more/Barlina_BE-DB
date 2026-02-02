const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Order = require('../models/Order');
const StockSubscription = require('../models/StockSubscription');
const sendEmail = require('../utils/sendEmail');

const Category = require('../models/Category');

// @desc    Get all products
// @route   GET /api/products
// @access  Public / Scoped for Admin
const getProducts = asyncHandler(async (req, res) => {
    // START FILTER: Only show Live and Non-deleted products for public storefront
    const publicFilter = {
        isDeleted: false,
        listingStatus: 'APPROVED',
        isLive: true
    };
    // END FILTER

    const keyword = req.query.keyword ? {
        name: {
            $regex: req.query.keyword,
            $options: 'i'
        }
    } : {};

    let categoryFilter = req.query.category ? { category: req.query.category } : {};

    // RBAC: Filter by assigned categories ONLY if specific categories are assigned.
    // If no categories are assigned, we assume the Admin has global product access.
    if (req.user && req.user.role === 'admin') {
        const assignedCategoryIds = req.user.assignedCategories;

        if (assignedCategoryIds && assignedCategoryIds.length > 0) {
            // Product model stores category NAME usually, but let's confirm.
            // Earlier fix confirmed we need to map IDs to Names.
            const allowedCategories = await Category.find({ _id: { $in: assignedCategoryIds } });
            const allowedCategoryNames = allowedCategories.map(c => c.name);

            if (req.query.category) {
                if (!allowedCategoryNames.includes(req.query.category)) {
                    // Return empty if trying to access unauthorized category
                    return res.json([]);
                }
            } else {
                // Restrict to allowed categories
                categoryFilter = { category: { $in: allowedCategoryNames } };
            }
        }
        // Else: No assigned categories -> View ALL products (Global Access)
    }

    const pageSize = Number(req.query.limit) || 12;
    const page = Number(req.query.page) || 1;

    // Combine all filters
    const finalFilter = { ...publicFilter, ...keyword, ...categoryFilter };

    const count = await Product.countDocuments(finalFilter);

    const products = await Product.find(finalFilter)
        .populate('seller', 'businessName ownerName user')
        .select('name price discountPrice image countInStock isStockEnabled rating numReviews category isCodAvailable estimatedDeliveryDays colors specifications seller ownerType')
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
});

// @desc    Get top rated products
// @route   GET /api/products/top
// @access  Public
const getTopProducts = asyncHandler(async (req, res) => {
    // Return newest 10 products as a simple "Top" metric for now, or just limit 8
    // Only show Live, Approved, and Non-deleted products
    const products = await Product.find({
        isDeleted: false,
        listingStatus: 'APPROVED',
        isLive: true
    })
        .sort({ createdAt: -1 })
        .select('name price discountPrice image countInStock isStockEnabled rating numReviews category')
        .limit(12);
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
    const { name, price, discountPrice, description, image, images, brand, category, countInStock, isStockEnabled, isCodAvailable, estimatedDeliveryDays, colors, specifications } = req.body;

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
        category,
        countInStock,
        isStockEnabled: isStockEnabled !== undefined ? isStockEnabled : true,
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
    const { name, price, discountPrice, description, image, images, brand, category, countInStock, isStockEnabled, isCodAvailable, estimatedDeliveryDays, colors, specifications } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
        const previousStock = product.countInStock;
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
        product.isStockEnabled = isStockEnabled !== undefined ? isStockEnabled : product.isStockEnabled;
        product.returnPolicy = req.body.returnPolicy || product.returnPolicy; // Persist Return Policy

        const updatedProduct = await product.save();

        // Check if stock was updated from 0 to > 0
        if (previousStock <= 0 && updatedProduct.countInStock > 0 && updatedProduct.isStockEnabled !== false) {
            const subscriptions = await StockSubscription.find({ product: updatedProduct._id });

            if (subscriptions.length > 0) {
                // Send emails in background
                const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/product/${updatedProduct._id}`;

                for (const sub of subscriptions) {
                    let imageUrl = updatedProduct.image;
                    if (imageUrl && imageUrl.startsWith('/')) {
                        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
                        // Gmail cannot access localhost images, so we use a placeholder for dev testing
                        if (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
                            imageUrl = 'https://placehold.co/300x300/png?text=Product+Image';
                        } else {
                            // Prepend backend URL if it's a relative path on production
                            imageUrl = `${backendUrl}${imageUrl}`;
                        }
                    }

                    try {
                        await sendEmail({
                            to: sub.email,
                            subject: `'${updatedProduct.name}' is back in stock!`,
                            html: `
                                <div style="font-family: Arial, sans-serif;">
                                    <h2>Good news! 🚀</h2>
                                    <p>The product you were waiting for, <strong>${updatedProduct.name}</strong>, is back in stock!</p>
                                    <img src="${imageUrl}" style="width: 150px; border-radius: 8px; margin: 10px 0;">
                                    <p>Hurry up before it runs out again.</p>
                                    <a href="${checkoutUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Buy Now</a>
                                </div>
                             `
                        });
                        // Remove subscription
                        await StockSubscription.findByIdAndDelete(sub._id);
                    } catch (error) {
                        console.error(`Failed to notify ${sub.email}:`, error);
                    }
                }
            }
        }

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
            .select('name price discountPrice image countInStock isStockEnabled rating numReviews category')
            .limit(8);

        // 2. If we have less than 8, fill the remaining space with other products
        if (related.length < 8) {
            const excludeIds = [product._id, ...related.map(p => p._id)];
            const filler = await Product.find({
                _id: { $nin: excludeIds }
            })
                .select('name price discountPrice image countInStock isStockEnabled rating numReviews category')
                .limit(8 - related.length);

            related = [...related, ...filler];
        }

        res.json(related);
    } else {
        res.status(404);
        throw new Error('Product not found');
    }
});

// @desc    Subscribe to back in stock notifications
// @route   POST /api/products/:id/subscribe
// @access  Public
const subscribeToStock = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    if (product.countInStock > 0) {
        res.status(400);
        throw new Error('Product is already in stock');
    }

    const alreadySubscribed = await StockSubscription.findOne({
        product: req.params.id,
        email
    });

    if (alreadySubscribed) {
        res.status(400);
        throw new Error('You are already subscribed to this product');
    }

    await StockSubscription.create({
        product: req.params.id,
        email,
        user: req.user ? req.user._id : null
    });

    res.status(201).json({ message: 'You will be notified when this product is back in stock.' });
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
    getRelatedProducts,
    subscribeToStock
};
