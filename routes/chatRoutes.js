const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Initialize Gemini with API Key from environment variables
// Note: If API_KEY is missing, it will use a fallback logic
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

router.post('/', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ reply: "Please provide a message." });
    }

    try {
        // --- 1. Basic Rule-Based Matching (Fast Response) ---
        const lowerMsg = message.toLowerCase();

        if (lowerMsg.includes('shipping') || lowerMsg.includes('delivery')) {
            return res.json({ reply: "We offer free shipping on orders over $50! Standard delivery takes 3-5 business days." });
        }
        if (lowerMsg.includes('return') || lowerMsg.includes('refund')) {
            return res.json({ reply: "You can return items within 30 days of purchase. Please visit our Returns page for more info." });
        }
        if (lowerMsg.includes('contact') || lowerMsg.includes('support')) {
            return res.json({ reply: "You can reach our support team at support@barlinafashion.com or +91 88256 35443." });
        }
        if (lowerMsg.includes('complaint') || lowerMsg.includes('issue') || lowerMsg.includes('problem') || lowerMsg.includes('complait')) {
            return res.json({ reply: "I'm sorry you're facing an issue. You can raise a formal complaint by going to your Profile and clicking on 'My Complaints' > 'Raise New Complaint'." });
        }

        // --- 2. AI Processing (Gemini) ---
        if (genAI) {
            // Fetch some context if needed (e.g., top products) to give the AI "knowledge"
            // For now, let's keep it simple.
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });

            const prompt = `
            You are 'Barlina AI', a helpful and friendly shopping assistant for a fashion e-commerce store called "Barlina Fashion Design".
            
            Key Store Info:
            - We sell trendy fashion clothing and accessories.
            - Free shipping over $50.
            - 30-day return policy.
            - Contact: support@barlinafashion.com.
            - To raise a complaint: Go to your Profile > My Complaints > Raise New Complaint.
            
            User Message: "${message}"
            
            Respond politely and concisely as a customer support agent. Do NOT mention you are a Google AI.
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            return res.json({ reply: text });
        }

        // --- 3. Fallback (If no API Key) ---
        return res.json({
            reply: "I'm currently running in basic mode. I can help with 'shipping', 'returns', 'complaints', or 'contact' info. For specific queries, please email support."
        });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ reply: "I'm having trouble thinking right now. Please try again later." });
    }
});

module.exports = router;
