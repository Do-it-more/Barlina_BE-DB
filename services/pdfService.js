const PDFDocument = require('pdfkit');
const fs = require('fs');

/**
 * Generate Settlement PDF
 * @param {Object} settlement - Settlement object with populated seller
 * @param {Object} ledgerEntries - Array of ledger entries linked to this settlement
 * @returns {Promise<Buffer>} - PDF document buffer
 */
const generateSettlementPDF = (settlement, ledgerEntries = []) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // --- Header ---
            doc.fontSize(20).text('Settlement Statement', { align: 'center' });
            doc.moveDown();

            // --- Company Info (Placeholder) ---
            doc.fontSize(10).text('Your Company Name', { align: 'right' });
            doc.text('123 Business Street', { align: 'right' });
            doc.text('City, Country, 12345', { align: 'right' });
            doc.text('support@example.com', { align: 'right' });
            doc.moveDown();

            // --- Settlement Info ---
            doc.fontSize(12).text(`Settlement ID: ${settlement.settlementNumber}`);
            doc.text(`Date: ${new Date().toLocaleDateString()}`);
            doc.text(`Period: ${new Date(settlement.periodStart).toLocaleDateString()} - ${new Date(settlement.periodEnd).toLocaleDateString()}`);

            // --- Seller Info ---
            doc.moveDown();
            doc.fontSize(14).text('Seller Details', { underline: true });
            doc.fontSize(10).text(`Business Name: ${settlement.seller?.businessName || 'N/A'}`);
            doc.text(`Owner Name: ${settlement.seller?.ownerName || 'N/A'}`);
            doc.text(`Email: ${settlement.seller?.email || 'N/A'}`);
            if (settlement.seller?.gstNumber) {
                doc.text(`GST Number: ${settlement.seller.gstNumber}`);
            }

            // --- Financial Summary ---
            doc.moveDown();
            doc.fontSize(14).text('Financial Summary', { underline: true });
            doc.moveDown(0.5);

            const summaryTableTop = doc.y;
            const itemX = 50;
            const amountX = 400;

            doc.fontSize(10);

            // Helper for rows
            const addRow = (label, value, isBold = false) => {
                const y = doc.y;
                if (isBold) doc.font('Helvetica-Bold');
                else doc.font('Helvetica');

                doc.text(label, itemX, y);
                doc.text(value, amountX, y, { align: 'right' });
                doc.moveDown(0.5);

                if (isBold) doc.font('Helvetica');
            };

            addRow('Gross Sales amount', `Rs. ${settlement.grossAmount?.toFixed(2)}`);
            addRow('Total Commission', `- Rs. ${settlement.totalCommission?.toFixed(2)}`);
            addRow('GST on Commission', `- Rs. ${settlement.totalGST?.toFixed(2)}`);
            addRow('TDS on Sales', `- Rs. ${settlement.totalTDS?.toFixed(2)}`);

            if (settlement.totalReturns > 0) {
                addRow('Returns & Refunds', `- Rs. ${settlement.totalReturns?.toFixed(2)}`);
            }

            if (settlement.totalDeductions > 0 && settlement.totalReturns === 0 && settlement.totalCommission === 0) {
                addRow('Other Deductions', `- Rs. ${settlement.totalDeductions?.toFixed(2)}`);
            }

            doc.moveTo(itemX, doc.y).lineTo(amountX + 100, doc.y).stroke();
            doc.moveDown(0.5);

            addRow('Net Payable Amount', `Rs. ${settlement.netPayable?.toFixed(2)}`, true);

            doc.moveDown();

            // --- Payment Info (if paid) ---
            if (settlement.status === 'PAID' && settlement.paymentInfo) {
                doc.fontSize(14).text('Payment Information', { underline: true });
                doc.fontSize(10).text(`Status: PAID`);
                doc.text(`Paid Date: ${new Date(settlement.paymentInfo.paidAt).toLocaleDateString()}`);
                doc.text(`Reference / UTR: ${settlement.paymentInfo.utrNumber || 'N/A'}`);
                doc.text(`Payment Method: ${settlement.paymentInfo.method || 'Bank Transfer'}`);
            } else {
                doc.fontSize(14).text('Payment Information', { underline: true });
                doc.fontSize(10).text(`Status: ${settlement.status}`);
            }

            // --- Ledger Breakdown (Optional) ---
            if (ledgerEntries && ledgerEntries.length > 0) {
                doc.addPage();
                doc.fontSize(14).text('Transaction Detail', { underline: true });
                doc.moveDown();

                // Table Header
                const tableTop = doc.y;
                doc.fontSize(9).font('Helvetica-Bold');
                doc.text('Date', 50, tableTop);
                doc.text('Type', 150, tableTop);
                doc.text('Description', 250, tableTop);
                doc.text('Amount', 450, tableTop, { align: 'right' });
                doc.font('Helvetica');

                doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
                doc.moveDown(2);

                ledgerEntries.forEach(entry => {
                    const y = doc.y;

                    // Check for page break
                    if (y > 700) {
                        doc.addPage();
                        doc.moveDown();
                    }

                    doc.text(new Date(entry.createdAt).toLocaleDateString(), 50, doc.y, { width: 90 });
                    doc.text(entry.type.replace('_', ' '), 150, doc.y - 12, { width: 90 }); // Adjustment for line height
                    doc.text(entry.description || '-', 250, doc.y - 12, { width: 190, ellipsis: true });

                    let amountStr = `Rs. ${entry.netAmount.toFixed(2)}`;
                    doc.text(amountStr, 450, doc.y - 12, { width: 100, align: 'right' });

                    doc.moveDown(1);
                });
            }

            // --- Footer ---
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).text(
                    `Page ${i + 1} of ${range.count}`,
                    50,
                    doc.page.height - 50,
                    { align: 'center' }
                );
            }

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { generateSettlementPDF };
