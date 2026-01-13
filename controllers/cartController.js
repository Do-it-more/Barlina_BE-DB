const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Add item to cart
// @route   POST /api/cart/add
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
    const { productId, quantity, name, image, price, countInStock, color } = req.body;
    const qty = Number(quantity);
    const user = req.user._id;

    let cart = await Cart.findOne({ user });

    if (!cart) {
        cart = await Cart.create({
            user,
            items: []
        });
    }

    // Robust comparison including color
    const itemIndex = cart.items.findIndex(p =>
        p.product.toString() === productId.toString() &&
        (p.color === color || (!p.color && !color))
    );

    if (itemIndex > -1) {
        // Product exists in cart, update quantity
        cart.items[itemIndex].quantity += qty;
    } else {
        // Product does not exist in cart, add new item
        cart.items.push({
            product: productId,
            name,
            quantity: qty,
            image,
            price,
            countInStock,
            color
        });
    }

    await cart.save();
    await cart.populate('items.product', 'isCodAvailable name image price'); // Populate to return full info
    res.status(200).json(cart);
});

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'isCodAvailable');
    res.json(cart ? cart.items : []);
});


const updateCartItem = asyncHandler(async (req, res) => {
    const { productId, quantity, color } = req.body;
    const user = req.user._id;

    let cart = await Cart.findOne({ user });

    if (!cart) {
        res.status(404);
        throw new Error('Cart not found');
    }

    const itemIndex = cart.items.findIndex(p =>
        p.product.toString() === productId &&
        (p.color === color || (!p.color && !color))
    );

    if (itemIndex > -1) {
        let productItem = cart.items[itemIndex];
        productItem.quantity = quantity;
        cart.items[itemIndex] = productItem;
        await cart.save();
        await cart.populate('items.product', 'isCodAvailable');
        res.json(cart);
    } else {
        res.status(404);
        throw new Error('Item not found in cart');
    }
});

const removeCartItem = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { color } = req.query; // Get color from query string
    const user = req.user._id;

    let cart = await Cart.findOne({ user });

    if (!cart) {
        res.status(404);
        throw new Error('Cart not found');
    }

    cart.items = cart.items.filter(item =>
        !(item.product.toString() === productId && (item.color === color || (!item.color && !color)))
    );
    await cart.save();
    await cart.populate('items.product', 'isCodAvailable');
    res.json(cart);
});

// @desc    Clear user cart
// @route   DELETE /api/cart/clear
// @access  Private
const clearCart = asyncHandler(async (req, res) => {
    const user = req.user._id;
    const cart = await Cart.findOne({ user });

    if (cart) {
        cart.items = [];
        await cart.save();
    }

    res.json({ message: 'Cart cleared' });
});

module.exports = {
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem,
    clearCart
};
