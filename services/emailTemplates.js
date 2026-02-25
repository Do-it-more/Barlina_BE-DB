/**
 * Email Templates for System Notifications
 */

const getSettlementGeneratedTemplate = (settlement) => {
    return `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Settlement Statement Generated</h2>
            <p>Dear ${settlement.seller.ownerName},</p>
            <p>Your settlement statement for the period <strong>${new Date(settlement.periodStart).toLocaleDateString()}</strong> to <strong>${new Date(settlement.periodEnd).toLocaleDateString()}</strong> has been generated.</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Settlement ID:</strong> ${settlement.settlementNumber}</p>
                <p><strong>Net Payable Amount:</strong> ₹${settlement.netPayable.toLocaleString('en-IN')}</p>
                <p><strong>Status:</strong> <span style="color: #d97706; font-weight: bold;">${settlement.status}</span></p>
            </div>

            <p>This settlement is currently pending approval. You will be notified once it has been processed.</p>
            
            <p>Best regards,<br>The Finance Team</p>
        </div>
    `;
};

const getSettlementProcessedTemplate = (settlement) => {
    return `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #059669;">Settlement Processed</h2>
            <p>Dear ${settlement.seller.ownerName},</p>
            <p>Good news! Your settlement <strong>${settlement.settlementNumber}</strong> has been approved and is being processed for payment.</p>
            
            <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #059669;">
                <p><strong>Amount to be Credited:</strong> ₹${settlement.netPayable.toLocaleString('en-IN')}</p>
                <p><strong>Bank Account:</strong> ${settlement.seller.bankDetails?.bankName} (...${settlement.seller.bankDetails?.accountNumber?.slice(-4)})</p>
            </div>

            <p>You can expect the funds to reach your account within 1-3 business days.</p>
            
            <p>Best regards,<br>The Finance Team</p>
        </div>
    `;
};

const getSettlementPaidTemplate = (settlement) => {
    return `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #059669;">Payment Successful!</h2>
            <p>Dear ${settlement.seller.ownerName},</p>
            <p>We have successfully transferred the funds for settlement <strong>${settlement.settlementNumber}</strong>.</p>
            
            <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #059669;">
                <p><strong>Amount Paid:</strong> ₹${settlement.netPayable.toLocaleString('en-IN')}</p>
                <p><strong>Transaction ID (UTR):</strong> ${settlement.paymentInfo.utrNumber}</p>
                <p><strong>Date:</strong> ${new Date(settlement.paymentInfo.paidAt).toLocaleDateString()}</p>
            </div>

            <p>A copy of your settlement statement is attached to this email.</p>
            
            <p>Best regards,<br>The Finance Team</p>
        </div>
    `;
};

module.exports = {
    getSettlementGeneratedTemplate,
    getSettlementProcessedTemplate,
    getSettlementPaidTemplate
};
