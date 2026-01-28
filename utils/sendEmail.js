const SibApiV3Sdk = require('sib-api-v3-sdk');


const Setting = require('../models/Setting');

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
    try {
        console.log(`[Email Service] Attempting to send email to: ${to}`);

        // Fetch company settings
        const settings = await Setting.findOne();
        const companyName = settings?.companyName || "Barlina Support";

        // Configure API key authorization: api-key
        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        const apiKey = defaultClient.authentications['api-key'];

        if (!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY.startsWith('xkeysib-PLACEHOLDER')) {
            throw new Error("Missing or invalid BREVO_API_KEY in .env. Please generate a 'v3 API Key' from Brevo Dashboard.");
        }

        apiKey.apiKey = process.env.BREVO_API_KEY;

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html;
        // Use a default sender if not provided
        const senderEmail = process.env.EMAIL_FROM || "no-reply@example.com";
        const senderName = companyName;

        sendSmtpEmail.sender = { name: senderName, email: senderEmail };
        sendSmtpEmail.to = [{ email: to }];

        // Handle attachments if present
        if (attachments && attachments.length > 0) {
            sendSmtpEmail.attachment = attachments.map(att => ({
                name: att.filename,
                content: att.content // Base64 content
            }));
        }

        console.log(`[Brevo API] Sending transactional email...`);

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('[Brevo API] Email sent successfully. Message ID:', data.messageId);
        return data;
    } catch (error) {
        console.error('[Brevo API] Error sending email:', error);
        // Better error logging for Brevo specifics
        if (error.response && error.response.body) {
            console.error('[Brevo API] Detailed Error:', JSON.stringify(error.response.body, null, 2));
        }
        throw error;
    }
};

module.exports = sendEmail;
