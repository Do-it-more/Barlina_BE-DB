const cron = require('node-cron');
const Cart = require('../models/Cart');
const sendEmail = require('../utils/sendEmail');
const Setting = require('../models/Setting');

// Run every hour: '0 * * * *'
// For testing, we can use every minute: '* * * * *' if needed
// We will stick to every hour to avoid spam during development unless requested otherwise.
// Actually, let's do every 30 minutes to catch them relatively fast.
const scheduleAbandonedCartEmails = () => {
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Cron] Running Abandoned Cart Check...');
        try {
            // Logic:
            // 1. Find carts updated > 1 hour ago
            // 2. AND < 24 hours ago (don't recover ancient carts)
            // 3. AND abandonedEmailSent is false
            // 4. AND has items

            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const abandonedCarts = await Cart.find({
                updatedAt: { $lt: oneHourAgo, $gt: twentyFourHoursAgo },
                abandonedEmailSent: false,
                items: { $exists: true, $not: { $size: 0 } }
            }).populate('user', 'name email');

            console.log(`[Cron] Found ${abandonedCarts.length} abandoned carts.`);

            const settings = await Setting.findOne();
            const currency = settings?.currency || '₹';

            for (const cart of abandonedCarts) {
                if (!cart.user || !cart.user.email) continue;

                const user = cart.user;
                const itemsList = cart.items.map(item => `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">
                            <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                        </td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">
                            <p style="margin: 0; font-weight: bold; color: #333;">${item.name}</p>
                            <p style="margin: 0; font-size: 12px; color: #777;">Quantity: ${item.quantity}</p>
                        </td>
                         <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                            <p style="margin: 0; font-weight: bold; color: #333;">${currency}${item.price}</p>
                        </td>
                    </tr>
                `).join('');

                const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/cart`;

                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                        <h2 style="color: #2563eb;">Did you forget something? 🛒</h2>
                        <p>Hi ${user.name},</p>
                        <p>We noticed you left some great items in your cart. They are saved for you, but stocks are limited!</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            ${itemsList}
                        </table>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${checkoutUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Complete Your Order</a>
                        </div>

                        <p style="color: #777; font-size: 12px; text-align: center;">
                            If you didn't mean to create a cart, you can safely ignore this email.
                        </p>
                    </div>
                `;

                try {
                    await sendEmail({
                        to: user.email,
                        subject: 'Your cart is waiting! Complete your purchase',
                        html: emailHtml
                    });

                    // Mark as sent
                    cart.abandonedEmailSent = true;
                    await cart.save();
                    console.log(`[Cron] Abandoned cart email sent to ${user.email}`);

                } catch (emailError) {
                    console.error(`[Cron] Failed to send email to ${user.email}`, emailError.message);
                }
            }

        } catch (error) {
            console.error('[Cron] Error in Abandoned Cart Scheduler:', error);
        }
    });
};

module.exports = scheduleAbandonedCartEmails;
