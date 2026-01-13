const express = require('express');
const router = express.Router();


router.get('/', async (req, res) => {
    // Simplified test route for API-based sending
    const sendEmail = require('../utils/sendEmail');
    const targetEmail = process.env.EMAIL_FROM || "test@example.com";

    try {
        await sendEmail({
            to: targetEmail, // Send to self (sender)
            subject: "Test Email from Brevo API",
            html: "<p>If you see this, <strong>Brevo API</strong> is WORKING!</p>"
        });

        res.json({ message: "Email sent successfully! Check your inbox." });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).json({
            message: "Failed to send email",
            error: error.message
        });
    }
});

module.exports = router;
