const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const { OAuth2Client } = require('google-auth-library');

const sendEmail = require('../utils/sendEmail');
const User = require('../models/User');
const Verification = require('../models/Verification');
const { admin } = require('../config/firebaseAdmin');
const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

// Initialize Google OAuth Client
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("❌ CRITICAL ERROR: Google Client ID or Secret is missing from environment variables.");
} else {
    console.log(`✅ Initializing Google OAuth with Client ID ending in ...${process.env.GOOGLE_CLIENT_ID.slice(-6)}`);
    // Check for Secret length just to be sure
    console.log(`ℹ️  Google Client Secret length: ${process.env.GOOGLE_CLIENT_SECRET.length}`);
}

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    (process.env.GOOGLE_CLIENT_SECRET || '').trim(), // Trim whitespace
    'postmessage'
);

// @desc    Register new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, phoneNumber, verificationToken, phoneVerificationToken } = req.body;

    // Debugging logs for registration flow
    console.log(`[Register] Request for: ${email}`);
    if (process.env.NODE_ENV !== 'production') {
        console.log('Body Tokens:', { verificationToken: !!verificationToken, phoneVerificationToken: !!phoneVerificationToken });
    }

    if (!name || !email || !password || !phoneNumber) {

        res.status(400);
        throw new Error('Please add all fields including Phone Number');
    }

    // Verify Email Token
    if (!verificationToken) {
        res.status(400);
        throw new Error('Email verification required');
    }

    let isPhoneVerified = false;

    // Verify Phone Token (Optional)
    if (phoneVerificationToken) {
        try {
            // 1. Verify Email Token (Custom JWT)
            const decodedEmail = jwt.verify(verificationToken, process.env.JWT_SECRET);
            if (decodedEmail.email !== email || !decodedEmail.verified) {
                throw new Error('Invalid email verification token');
            }

            // 2. Verify Phone Token (Custom JWT or Firebase ID Token)
            try {
                // First check if it is our own Custom JWT (old flow)
                try {
                    const decodedPhone = jwt.verify(phoneVerificationToken, process.env.JWT_SECRET);
                    if (decodedPhone.phone !== phoneNumber || !decodedPhone.verified) {
                        throw new Error('Invalid phone verification token');
                    }
                    isPhoneVerified = true;
                } catch (jwtError) {
                    // Not a custom JWT, assume it's a Firebase ID Token
                    if (admin.apps.length) {
                        try {
                            const decodedFirebaseToken = await admin.auth().verifyIdToken(phoneVerificationToken);
                            const verifiedPhoneNumber = decodedFirebaseToken.phone_number;

                            // Simple check:
                            if (!verifiedPhoneNumber.includes(phoneNumber)) {
                                throw new Error(`Phone number mismatch. Verified: ${verifiedPhoneNumber}`);
                            }
                            isPhoneVerified = true;
                        } catch (firebaseError) {
                            throw new Error('Phone verification failed: Invalid Firebase Token >> ' + firebaseError.message);
                        }
                    } else {
                        // DEV MODE: Firebase Admin not initialized (missing .env)
                        console.warn("⚠️ DEV MODE: Firebase Admin not initialized. Skipping backend phone token verification.");
                        isPhoneVerified = true; // Allow dev mode bypass
                    }
                }

            } catch (error) {
                res.status(400);
                throw new Error('Verification failed: ' + error.message);
            }

        } catch (error) {
            res.status(400);
            throw new Error('Verification failed: ' + error.message);
        }
    } else {
        // Just verify email token if phone is skipped
        try {
            const decodedEmail = jwt.verify(verificationToken, process.env.JWT_SECRET);
            if (decodedEmail.email !== email || !decodedEmail.verified) {
                throw new Error('Invalid email verification token');
            }
        } catch (error) {
            res.status(400);
            throw new Error('Invalid email verification token');
        }
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    // Hash password handled in User model pre-save hook

    // Create user
    const user = await User.create({
        name,
        email,
        password,
        phoneNumber,
        isEmailVerified: true,
        isPhoneVerified: isPhoneVerified
    });

    if (user) {
        res.status(201).json({
            _id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            profilePhoto: user.profilePhoto,
            role: user.role,
            token: generateToken(user._id)
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = req.body;

    // Check for user by email OR phoneNumber
    const user = await User.findOne({
        $or: [
            { email: email },
            { phoneNumber: email }
        ]
    });

    if (user && (await user.matchPassword(password))) {
        // Enforce 2FA only if enabled by user
        if (user.isTwoFactorEnabled) {

            // Generate 6-digit OTP
            const otp = crypto.randomInt(100000, 999999).toString();
            console.log("SUPER ADMIN LOGIN OTP:", otp);
            const salt = await bcrypt.genSalt(10);
            const hashedOtp = await bcrypt.hash(otp, salt);

            user.otp = hashedOtp;
            user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 mins
            await user.save();

            try {
                await sendEmail({
                    to: user.email,
                    subject: 'Two-Factor Authentication Code',
                    html: `<p>Your 2FA Login Code is: <strong>${otp}</strong></p>`
                });

                return res.json({
                    twoFactorRequired: true,
                    email: user.email,
                    message: "OTP sent to your email"
                });
            } catch (error) {
                console.error("2FA Email failed", error);

                // FALLBACK FOR DEV/TIMEOUTS: Allow proceed if email fails, relying on Console OTP
                // In strict production, you might want to throw, but to "fix it" for now:
                return res.json({
                    twoFactorRequired: true,
                    email: user.email,
                    message: "OTP generated (Email service failed - Check Server Console)"
                });
            }
        }

        // user asks for "expiry adjust"
        // standard: 1d, rememberMe: 30d
        const expiresIn = rememberMe ? '30d' : '1d';

        // Log Admin Login
        if (user.role === 'admin' || user.role === 'super_admin') {
            try {
                // Non-blocking (failed audit log shouldn't stop login)
                AuditLog.create({
                    action: 'LOGIN',
                    performedBy: {
                        id: user._id,
                        name: user.name,
                        role: user.role,
                        email: user.email
                    },
                    targetId: user._id,
                    targetModel: 'User',
                    details: 'Admin logged in via Standard Auth'
                }).catch(e => console.error("AuditLog missing/failed:", e.message));
            } catch (auditErr) { console.error("Audit log setup failed", auditErr); }
        }

        res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            profilePhoto: user.profilePhoto, // Return profile photo on login
            address: user.address,
            role: user.role,
            permissions: user.permissions, // Include permissions for RBAC
            isFirstLogin: user.isFirstLogin, // Include flag for frontend redirect
            token: generateToken(user._id, expiresIn)
        });
    } else {
        res.status(400);
        throw new Error('Invalid credentials');
    }
});

// @desc    Verify 2FA OTP and Login
// @route   POST /api/users/login/2fa
// @access  Public
const verifyTwoFactor = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (!user.otp || !user.otpExpires || user.otpExpires < Date.now()) {
        res.status(400);
        throw new Error('OTP invalid or expired');
    }

    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Log Admin Login (2FA)
    if (user.role === 'admin' || user.role === 'super_admin') {
        await AuditLog.create({
            action: 'LOGIN',
            performedBy: {
                _id: user._id,
                name: user.name,
                role: user.role,
                email: user.email
            },
            targetId: user._id,
            targetModel: 'User',
            details: 'Admin logged in via 2FA'
        });
    }

    res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePhoto: user.profilePhoto,
        address: user.address,
        role: user.role,
        permissions: user.permissions, // Include permissions for RBAC
        token: generateToken(user._id)
    });
});

// @desc    Resend 2FA Login OTP
// @route   POST /api/users/login/resend-2fa
// @access  Public
const resendTwoFactorLogin = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (!user.isTwoFactorEnabled) {
        res.status(400);
        throw new Error('Two-Factor Authentication is not enabled for this account');
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    console.log("RESENT LOGIN OTP:", otp);
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    user.otp = hashedOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    try {
        await sendEmail({
            to: user.email,
            subject: 'New Two-Factor Authentication Code',
            html: `<p>Your New 2FA Login Code is: <strong>${otp}</strong></p>`
        });

        res.json({ message: "New OTP sent to your email" });
    } catch (error) {
        console.error("2FA Resend Email failed", error);
        // Fallback for Dev
        res.json({ message: "New OTP generated (Email failed - Check Console)" });
    }
});

// @desc    Toggle Two-Factor Auth
// @route   PUT /api/users/2fa
// @access  Private (Super Admin Only recommended)
const toggleTwoFactor = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        // MIGRATION FIX: Ensure Super Admin has valid Permissions Object
        // This fixes legacy data where permissions might be an Array, causing Mongoose save() to crash.
        if (user.role === 'super_admin') {
            user.permissions = {
                orders: true,
                returns: true,
                complaints: true,
                inquiries: true,
                users: true,
                products: true,
                categories: true,
                coupons: true,
                settings: true
            };
            // Explicitly mark as modified to ensure $set overwrites any DB garbage
            user.markModified('permissions');
        }

        user.isTwoFactorEnabled = !user.isTwoFactorEnabled;
        const updatedUser = await user.save();
        res.json({
            message: `Two-Factor Authentication ${updatedUser.isTwoFactorEnabled ? 'Enabled' : 'Disabled'}`,
            isTwoFactorEnabled: updatedUser.isTwoFactorEnabled
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update Password (Authenticated)
// @route   PUT /api/users/password
// @access  Private
const updatePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, otp } = req.body;
    const user = await User.findById(req.user._id);

    if (user && (await user.matchPassword(currentPassword))) {
        // Super Admin requires OTP
        if (user.role === 'super_admin') {
            if (!otp) {
                res.status(400);
                throw new Error('OTP is required for Super Admin security');
            }

            if (!user.otp || !user.otpExpires || user.otpExpires < Date.now()) {
                res.status(400);
                throw new Error('OTP invalid or expired');
            }

            const isMatch = await bcrypt.compare(otp, user.otp);
            if (!isMatch) {
                res.status(400);
                throw new Error('Invalid OTP');
            }

            // Clear OTP after successful use
            user.otp = undefined;
            user.otpExpires = undefined;
        }

        user.password = newPassword;
        user.isFirstLogin = false; // Reset flag after successful change
        await user.save();
        res.json({ message: 'Password updated successfully' });
    } else {
        res.status(400);
        throw new Error('Invalid current password');
    }
});

// @desc    Send Security OTP (Authenticated)
// @route   POST /api/users/send-security-otp
// @access  Private
const sendSecurityOtp = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    user.otp = hashedOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    try {
        await sendEmail({
            to: user.email,
            subject: 'Security Verification Code',
            html: `<p>Your Security Verification Code is: <strong>${otp}</strong></p><p>Use this code to verify your identity for sensitive actions.</p>`
        });
        res.json({ message: 'Security code sent to your email' });
    } catch (error) {
        console.error("Email send failed:", error);
        res.status(500);
        throw new Error('Failed to send security code');
    }
});

// @desc    Forgot Password - Send OTP
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw new Error('Please provide an email');
    }

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Generate 6-digit OTP (Secure)
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Save OTP and expiry
    user.otp = hashedOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
        await sendEmail({
            to: email,
            subject: 'Barlina Fashion Design Password Reset OTP',
            html: `<p>Your Verification Code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
        });

        res.status(200).json({ message: 'OTP sent to email' });
    } catch (error) {
        console.error("Email send failed:", error);
        res.status(500).json({
            message: 'Failed to send email. Please try again later.',
            error: error.message
        });
    }
});


// @desc    Verify OTP
// @route   POST /api/users/verify-otp
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        res.status(400);
        throw new Error('Please provide email and OTP');
    }

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (user.otpExpires < Date.now()) {
        res.status(400);
        throw new Error('OTP expired');
    }

    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    res.status(200).json({ message: 'OTP verified' });
});

// @desc    Reset Password
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        res.status(400);
        throw new Error('Please provide all fields');
    }

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (user.otpExpires < Date.now()) {
        res.status(400);
        throw new Error('OTP expired');
    }

    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    // Hash new password - User model handles hashing in pre-save, but only if modified.
    // We can assign directly and .save() will trigger pre-save hash.
    user.password = newPassword;

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    res.status(200).json({ message: 'Password reset successful' });
});

// @desc    Get user data
// @route   GET /api/users/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
    res.status(200).json(req.user);
});

// @desc    Delete user profile photo
// @route   DELETE /api/users/profile-photo
// @access  Private
const deleteProfilePhoto = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.profilePhoto = '';
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            profilePhoto: updatedUser.profilePhoto,
            address: updatedUser.address,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user profile photo
// @route   PUT /api/users/profile-photo
// @access  Private
const updateProfilePhoto = asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('Please upload a file');
    }

    // Fix: Use relative URL path, not absolute file system path
    const imagePath = `/uploads/${req.file.filename}`;

    const user = await User.findById(req.user._id);

    if (user) {
        user.profilePhoto = imagePath;
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            profilePhoto: updatedUser.profilePhoto,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
    // RESOURCE: Nuke the legacy array data using native driver to bypass Mongoose Schema casting
    const rawUser = await User.collection.findOne({ _id: req.user._id });

    if (rawUser && Array.isArray(rawUser.permissions)) {
        console.log(`[CRITICAL FIX] Found malformed 'permissions' (Array) for user ${req.user.email} from native driver. Converting to Object.`);

        let properPermissions = {
            orders: false, returns: false, complaints: false, inquiries: false,
            users: false, products: false, categories: false, coupons: false, settings: false
        };

        if (rawUser.role === 'super_admin') {
            properPermissions = {
                orders: true, returns: true, complaints: true, inquiries: true,
                users: true, products: true, categories: true, coupons: true, settings: true
            };
        }

        await User.collection.updateOne(
            { _id: req.user._id },
            { $set: { permissions: properPermissions } }
        );
        console.log(`[CRITICAL FIX] Permissions repaired successfully.`);
    }

    const user = await User.findById(req.user._id);

    // Debug Log for Profile Update
    if (req.body.address) {
        console.log(`[Profile Update] User ${req.user.email} updating address:`, req.body.address);
    }

    if (user) {
        user.name = req.body.name || user.name;

        // Handle Phone Number update
        if (req.body.phoneNumber) {
            user.phoneNumber = req.body.phoneNumber;
        }

        if (req.body.address) {
            user.address = req.body.address;
        }

        if (req.body.email) {
            user.email = req.body.email; // Allow email update
        }

        if (req.body.password) {
            user.password = req.body.password;
        }



        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            phoneNumber: updatedUser.phoneNumber,
            profilePhoto: updatedUser.profilePhoto,
            address: updatedUser.address,
            role: updatedUser.role,
            permissions: updatedUser.permissions,
            token: generateToken(updatedUser._id),
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Toggle item in wishlist
// @route   POST /api/users/wishlist/:id
// @access  Private
const toggleWishlist = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    const productId = req.params.id;

    if (user) {
        const isListed = user.wishlist.includes(productId);

        if (isListed) {
            user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
            await user.save();
            res.json({ message: 'Product removed from wishlist', wishlist: user.wishlist });
        } else {
            user.wishlist.push(productId);
            await user.save();
            res.json({ message: 'Product added to wishlist', wishlist: user.wishlist });
        }
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Get user wishlist
// @route   GET /api/users/wishlist
// @access  Private
const getWishlist = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('wishlist');

    if (user) {
        res.json(user.wishlist);
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});


// @desc    Send Email Verification OTP
// @route   POST /api/users/send-verification
// @access  Public
const sendVerificationEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;
    console.log(`[Verification] OTP Request for: ${email}`);

    if (!email) {
        res.status(400);
        throw new Error('Please provide an email');
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists with this email');
    }

    // Generate 6-digit OTP (Secure)
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Save/Update Verification Document via identifier
    await Verification.findOneAndUpdate(
        { identifier: email },
        {
            identifier: email,
            otp: hashedOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
        },
        { upsert: true, new: true }
    );

    try {
        await sendEmail({
            to: email,
            subject: 'Email Verification',
            html: `<p>Your Verification Code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
        });
        res.status(200).json({ message: 'Verification email sent' });
    } catch (error) {
        console.error("Email send failed:", error);
        // Still log OTP for debugging/fallback if email fails completely
        console.log(`[FALLBACK] Verification OTP for ${email}: ${otp}`);

        res.status(500).json({
            message: 'Failed to send verification email.',
            error: error.message
        });
    }
});

// @desc    Verify Email OTP
// @route   POST /api/users/verify-email
// @access  Public
const verifyEmailOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        res.status(400);
        throw new Error('Please provide email and OTP');
    }

    const verification = await Verification.findOne({ identifier: email });

    if (!verification) {
        res.status(400);
        throw new Error('Invalid or expired verification session');
    }

    const isMatch = await bcrypt.compare(otp, verification.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    // Generate Verification Token (valid for 1 hour)
    const verificationToken = jwt.sign(
        { email, verified: true },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    // Remove verification record
    await Verification.deleteOne({ identifier: email });

    res.status(200).json({
        message: 'Email verified successfully',
        verificationToken
    });
});

// @desc    Send Mock Phone OTP (Dev use to bypass SMS cost)
// @route   POST /api/users/send-phone-otp
// @access  Public
const sendMockPhoneOtp = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        res.status(400);
        throw new Error('Please provide phone number');
    }

    // Generate 6-digit OTP (FIXED for easier testing based on user feedback)
    const otp = "123456";

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Reuse Verification model, identifier = phone
    await Verification.findOneAndUpdate(
        { identifier: phone },
        {
            identifier: phone,
            otp: hashedOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        },
        { upsert: true, new: true }
    );

    // LOG TO CONSOLE
    console.log(`[MOCK SMS] OTP for ${phone}: ${otp}`);

    res.status(200).json({ message: 'OTP sent (Check server console)' });
});

// @desc    Verify Mock Phone OTP
// @route   POST /api/users/verify-phone-otp
// @access  Public
const verifyMockPhoneOtp = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        res.status(400);
        throw new Error('Please provide phone and OTP');
    }

    const verification = await Verification.findOne({ identifier: phone });

    if (!verification) {
        res.status(400);
        throw new Error('Invalid or expired verification session');
    }

    const isMatch = await bcrypt.compare(otp, verification.otp);

    if (!isMatch) {
        res.status(400);
        throw new Error('Invalid OTP');
    }

    // Create a Token similar to what we do for Email
    const phoneVerificationToken = jwt.sign(
        { phone, verified: true },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    await Verification.deleteOne({ identifier: phone });

    res.status(200).json({
        message: 'Phone verified successfully',
        phoneVerificationToken
    });
});

// @desc    Google OAuth Login/Register
// @route   POST /api/users/google-auth
// @access  Public
// @desc    Google OAuth Login/Register
// @route   POST /api/users/google-auth
// @access  Public
const googleAuth = asyncHandler(async (req, res) => {
    const { code } = req.body; // Changed from 'token' to 'code' for auth-code flow

    if (!code) {
        res.status(400);
        throw new Error('Google authorization code is required');
    }

    try {
        // Exchange code for tokens
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        // Get User Profile
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        if (!email) {
            res.status(400);
            throw new Error('Email not provided by Google');
        }

        // Fetch Phone & Address from People API
        let phoneNumber = '';
        let address = {};

        try {
            const peopleApiUrl = 'https://people.googleapis.com/v1/people/me?personFields=phoneNumbers,addresses';
            const peopleRes = await client.request({ url: peopleApiUrl });
            const person = peopleRes.data;

            if (person.phoneNumbers && person.phoneNumbers.length > 0) {
                phoneNumber = person.phoneNumbers[0].value;
                console.log("✅ Found Phone Number from Google:", phoneNumber);
            }
            // console.log("ℹ️  No Phone Number found in Google Account");

            if (person.addresses && person.addresses.length > 0) {
                const addr = person.addresses[0];
                address = {
                    street: addr.streetAddress || '',
                    city: addr.city || '',
                    state: addr.region || '',
                    postalCode: addr.postalCode || '',
                    country: addr.country || ''
                };
                console.log("✅ Found Address from Google:", address);
            }
            // console.log("ℹ️  No Address found in Google Account");

            // Log entire person object for debugging (remove in production)
            // console.log("🔍 Full People API Response:", JSON.stringify(person, null, 2));
        } catch (peopleError) {
            console.warn("Failed to fetch People API data:", peopleError.message);
            // Continue login even if People API fails
        }

        // Check if user exists
        let user = await User.findOne({
            $or: [
                { email },
                { googleId }
            ]
        });

        if (user) {
            // Update User
            if (!user.googleId) {
                user.googleId = googleId;
                user.authProvider = 'google';
            }
            if (!user.profilePhoto && picture) user.profilePhoto = picture;

            // Only update phone/address if not already set
            if (!user.phoneNumber && phoneNumber) user.phoneNumber = phoneNumber;
            if (!user.address?.street && address.street) user.address = { ...user.address, ...address };

            await user.save();

            res.json({
                _id: user.id,
                name: user.name,
                email: user.email,
                phoneNumber: user.phoneNumber,
                profilePhoto: user.profilePhoto,
                address: user.address,
                role: user.role,
                permissions: user.permissions,
                isFirstLogin: user.isFirstLogin,
                token: generateToken(user._id, '30d')
            });
        } else {
            // Create New User
            user = await User.create({
                name: name || email.split('@')[0],
                email,
                googleId,
                authProvider: 'google',
                isEmailVerified: true,
                password: crypto.randomBytes(32).toString('hex'),
                profilePhoto: picture || '',
                phoneNumber: phoneNumber,
                address: address,
                role: 'user'
            });

            res.status(201).json({
                _id: user.id,
                name: user.name,
                email: user.email,
                phoneNumber: user.phoneNumber,
                profilePhoto: user.profilePhoto,
                address: user.address,
                role: user.role,
                permissions: user.permissions,
                isFirstLogin: user.isFirstLogin,
                token: generateToken(user._id, '30d')
            });
        }
    } catch (error) {
        console.error('Google OAuth error:', error);
        res.status(400);
        throw new Error('Google Authentication Failed: ' + error.message);
    }
});

// @desc    Delete user account (Self)
// @route   DELETE /api/users/profile
// @access  Private
const deleteMyAccount = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        await user.deleteOne();
        res.json({ message: 'User account deleted' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Logout user / Clear cookie or log action
// @route   POST /api/users/logout
// @access  Private
const logoutUser = asyncHandler(async (req, res) => {
    // Log the logout action for Admins
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
        await AuditLog.create({
            action: 'LOGOUT',
            entityId: req.user._id,
            entityModel: 'User',
            performedBy: {
                id: req.user._id,
                name: req.user.name,
                role: req.user.role
            },
            details: `Admin logged out`,
            timestamp: new Date()
        });
    }

    res.status(200).json({ message: 'Logged out successfully' });
});

// Generate JWT
const generateToken = (id, expiresIn = '30d') => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn,
    });
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    updateProfilePhoto,
    deleteProfilePhoto,
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
    resendTwoFactorLogin,
    toggleTwoFactor,
    updatePassword,
    sendSecurityOtp,
    sendMockPhoneOtp,
    verifyMockPhoneOtp,
    googleAuth,
    logoutUser
};
