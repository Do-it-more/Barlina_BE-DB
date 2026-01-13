const admin = require('firebase-admin');

// Ensure you have your serviceAccountKey.json in the Backend/config folder or ENV variables
// For production, use environment variables to construct the object or path
// We will try to parse from ENV string or file

const initializeFirebaseAdmin = () => {
    try {
        let serviceAccount;

        // 1. Try Environment Variable
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            } catch (e) {
                console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var");
            }
        }

        // 2. Try File (Backend/config/serviceAccountKey.json)
        if (!serviceAccount) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, 'serviceAccountKey.json');
            if (fs.existsSync(filePath)) {
                serviceAccount = require(filePath);
            }
        }

        // 3. If neither found, warn and skip
        if (!serviceAccount) {
            console.log("ℹ️  FIREBASE_SERVICE_ACCOUNT not found in .env or config/serviceAccountKey.json. Running in Development Mode (Backend Phone Verification Disabled).");
            return;
        }

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("🔥 Firebase Admin Initialized Successfully");
        }
    } catch (error) {
        console.error("❌ Firebase Admin Initialization Failed:", error.message);
    }
};

module.exports = { admin, initializeFirebaseAdmin };
