const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const generateInvoicePDF = (order, user, settings = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // --- 1. Barcode (Top Right) ---
            try {
                const barcodeBuffer = await bwipjs.toBuffer({
                    bcid: 'code128',       // Barcode type
                    text: order.invoiceNumber || order._id.toString(),    // Text to encode
                    scale: 3,               // 3x scaling factor
                    height: 10,             // Bar height, in millimeters
                    includetext: false,      // Show human-readable text
                    textxalign: 'center',   // Always good to set this
                });
                doc.image(barcodeBuffer, 400, 40, { width: 150 });
            } catch (e) {
                console.error("Barcode generation failed", e);
            }

            // --- 2. Company Info (Top Left) ---
            const companyName = settings.companyName || 'Shop Styles';
            const companyPhone = settings.companyPhone || '+91 98765 43210';
            const addr = settings.companyAddress || {};

            // Format address lines
            const streetLine = [addr.doorNo, addr.street].filter(Boolean).join(', ') || '123 Fashion Street';
            // Fallback Address if settings missing
            const cityStateZip = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || 'Chennai, TN, 600017';
            const gstLine = settings.gstNo ? `GSTIN: ${settings.gstNo}` : '';

            doc.fillColor('#333333');
            doc.fontSize(20).text(companyName, 50, 50);

            doc.fontSize(9).font('Helvetica').fillColor('#555555');
            doc.text(streetLine, 50, 80);
            doc.text(cityStateZip, 50, 95);
            if (gstLine) doc.text(gstLine, 50, 110);
            doc.text(`Phone: ${companyPhone}`, 50, gstLine ? 125 : 110);


            // --- 3. INVOICE Title & Details ---
            const invY = 160;
            doc.fontSize(16).fillColor('#333333').font('Helvetica-Bold').text('INVOICE', 50, invY);

            doc.fontSize(9).font('Helvetica').fillColor('#555555');
            doc.text(`Invoice Number: ${order.invoiceNumber || order._id}`, 50, invY + 25);
            doc.text(`Invoice Date: ${new Date(order.createdAt).toLocaleDateString()}`, 50, invY + 40);


            // --- 4. Bill To & Ship To ---
            const addrY = 220;

            // Bill To
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Bill To:', 50, addrY);
            doc.font('Helvetica').fontSize(9).fillColor('#555555');

            const customerName = user.name || order.user?.name || 'Guest';
            const customerEmail = user.email || order.user?.email || '';
            const customerPhone = user.phoneNumber || order.user?.phoneNumber || '';
            const shipAddr = order.shippingAddress || {};

            // Use shipping address for billing if not separate
            doc.text(customerName, 50, addrY + 15);
            doc.text(shipAddr.address || '', 50, addrY + 30);
            let billY = addrY + 45;
            if (shipAddr.city) {
                doc.text(`${shipAddr.city}, ${shipAddr.postalCode || ''}`, 50, billY);
                billY += 15;
            }
            if (shipAddr.country) {
                doc.text(shipAddr.country, 50, billY);
                billY += 15;
            }
            doc.text(customerPhone, 50, billY);

            // --- 5. Table Header ---
            const tableTop = 320;
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');

            const colItem = 50;
            const colQty = 350;
            const colPrice = 430;
            const colTotal = 500;

            doc.text('Item', colItem, tableTop);
            doc.text('Quantity', colQty, tableTop, { align: 'right', width: 50 });
            doc.text('Price', colPrice, tableTop, { align: 'right', width: 60 });
            doc.text('Total', colTotal, tableTop, { align: 'right', width: 50 });

            // Line
            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#aaaaaa').lineWidth(1).stroke();

            // --- 6. Table Items ---
            let y = tableTop + 30;
            doc.font('Helvetica').fillColor('#333333');

            if (order.orderItems) {
                order.orderItems.forEach(item => {
                    const price = item.price || 0;
                    const qty = item.qty || 0;
                    const total = (price * qty).toFixed(2);

                    // Item Name
                    doc.text(item.name, colItem, y, { width: 280 });

                    // Removed "Sold By" line as requested

                    // Values
                    doc.text(qty.toString(), colQty, y, { align: 'right', width: 50 });
                    doc.text(`Rs. ${price.toFixed(2)}`, colPrice, y, { align: 'right', width: 60 });
                    doc.text(`Rs. ${total}`, colTotal, y, { align: 'right', width: 50 });

                    y += 30; // Spacing per item
                });
            }

            // --- 7. Line Separator ---
            doc.moveTo(50, y).lineTo(550, y).stroke();
            y += 15;

            // --- 8. Totals Section (Right Aligned) ---
            const rightColX = 400;
            const valX = 500;
            const spacing = 15;

            // Subtotal
            doc.fontSize(9).font('Helvetica-Bold').text('Subtotal:', rightColX, y, { align: 'right', width: 90 });
            doc.font('Helvetica').text(`Rs. ${(order.itemsPrice || order.totalPrice).toFixed(2)}`, valX, y, { align: 'right', width: 50 });
            y += spacing;

            // Tax
            if (order.taxPrice > 0) {
                doc.font('Helvetica-Bold').text('Tax:', rightColX, y, { align: 'right', width: 90 });
                doc.font('Helvetica').text(`Rs. ${order.taxPrice.toFixed(2)}`, valX, y, { align: 'right', width: 50 });
                y += spacing;
            }

            // Shipping
            doc.font('Helvetica-Bold').text('Shipping:', rightColX, y, { align: 'right', width: 90 });
            doc.font('Helvetica').text(`Rs. ${(order.shippingPrice || 0).toFixed(2)}`, valX, y, { align: 'right', width: 50 });
            y += spacing + 5;

            // Total (Larger)
            doc.fontSize(11).font('Helvetica-Bold').text('Total:', rightColX, y, { align: 'right', width: 90 });
            doc.text(`Rs. ${order.totalPrice.toFixed(2)}`, valX, y, { align: 'right', width: 50 });


            // --- 9. Footer Info (Bottom Left) ---
            const footerY = 700;
            doc.fontSize(9).font('Helvetica').fillColor('#333333');

            const paymentMethod = order.paymentMethod || 'Online';
            doc.text(`Payment Method: ${paymentMethod}`, 50, footerY);
            doc.text(`Payment Date: ${order.paidAt ? new Date(order.paidAt).toLocaleDateString() : new Date().toLocaleDateString()}`, 50, footerY + 15);


            // --- End ---
            doc.fontSize(8).text('Thank you.', 275, 750, { align: 'center' });

            doc.end();

        } catch (error) {
            console.error("PDF Generation Error:", error);
            reject(error);
        }
    });
};

module.exports = generateInvoicePDF;
