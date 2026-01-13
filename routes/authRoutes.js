const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    getMe,
    updateProfilePhoto,
    updateUserProfile,
    deleteMyAccount,
    forgotPassword,
    verifyOtp,
    resetPassword,
    toggleWishlist,
    getWishlist,
    sendVerificationEmail,
    verifyEmailOtp,
    verifyTwoFactor,
    toggleTwoFactor,
    updatePassword,
    sendSecurityOtp,

    deleteProfilePhoto
} = require('../controllers/authController');
const {
    getUsers,
    deleteUser,
    getUserById,
    updateUser,
    createUser,
    getUserFullDetails
} = require('../controllers/userController');
const { protect, admin, superAdmin, checkPermission } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// =======================
// PUBLIC ROUTES
// =======================
router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/', registerUser); // Alias for consistency
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/send-verification', sendVerificationEmail);
router.post('/verify-email', verifyEmailOtp);
// Mock Phone Verification (Dev/Free Tier Alternative)
router.post('/send-phone-otp', require('../controllers/authController').sendMockPhoneOtp);
router.post('/verify-phone-otp', require('../controllers/authController').verifyMockPhoneOtp);


// =======================
// PROTECTED ROUTES
// =======================
router.get('/me', protect, getMe);
router.put('/profile', protect, updateUserProfile);
router.delete('/profile', protect, deleteMyAccount);
router.put('/profile-photo', protect, upload.single('image'), updateProfilePhoto);
router.delete('/profile-photo', protect, deleteProfilePhoto);
router.post('/login/2fa', verifyTwoFactor);
router.put('/2fa', protect, toggleTwoFactor);
router.put('/password', protect, updatePassword);
router.post('/send-security-otp', protect, sendSecurityOtp);

router.get('/wishlist', protect, getWishlist);
router.post('/wishlist/:id', protect, toggleWishlist);

// =======================
// ADMIN ROUTES (Strict RBAC: Super Admin Only for User Management)
// =======================
router.get('/', protect, admin, getUsers);
router.post('/admin/create', protect, checkPermission('users'), createUser);
router.route('/:id')
    .get(protect, admin, getUserById) // Allow admins to view specific user
    .put(protect, checkPermission('users'), updateUser)
    .delete(protect, checkPermission('users'), deleteUser);

router.get('/:id/full-details', protect, admin, getUserFullDetails);

module.exports = router;
