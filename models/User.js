const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true
    },
    phoneNumber: {
        type: String,
        required: [false, 'Please add a phone number']
    },
    address: {
        street: { type: String, default: '' },
        addressLine2: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        postalCode: { type: String, default: '' },
        country: { type: String, default: '' },
        phoneNumber: { type: String, default: '' }
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    isPhoneVerified: {
        type: Boolean,
        default: false
    },
    isTwoFactorEnabled: {
        type: Boolean,
        default: false
    },
    password: {
        type: String,
        required: [true, 'Please add a password']
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'super_admin'],
        default: 'user'
    },
    permissions: {
        orders: { type: Boolean, default: false },
        returns: { type: Boolean, default: false },
        complaints: { type: Boolean, default: false },
        inquiries: { type: Boolean, default: false },
        users: { type: Boolean, default: false }, // Added for user management visibility if needed, though mostly Super Admin
        products: { type: Boolean, default: false },
        categories: { type: Boolean, default: false },
        coupons: { type: Boolean, default: false },
        settings: { type: Boolean, default: false }
    },
    assignedCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isFirstLogin: {
        type: Boolean,
        default: false
    },
    profilePhoto: {
        type: String,
        default: ''
    },
    otp: {
        type: String
    },
    otpExpires: {
        type: Date
    },
    wishlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }]
}, {
    timestamps: true
});

// Hash password before saving
// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
