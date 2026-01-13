const PDFDocument = require('pdfkit');

const generateInvoicePDF = (order, user) => {
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
            doc
                .fillColor('#444444')
                .fontSize(20)
                .text('BARLINA FASHION DESIGN', 110, 57)
                .fontSize(10)
                .text('123 Fashion Street', 200, 65, { align: 'right' })
                .text('Chennai, TN, 600017', 200, 80, { align: 'right' })
                .moveDown();

            // --- Invoice Info ---
            doc
                .fillColor('#444444')
                .fontSize(20)
                .text('INVOICE', 50, 160);

            doc
                .fontSize(10)
                .text(`Invoice Number: ${order.invoiceNumber || order._id}`, 50, 200)
                .text(`Invoice Date: ${new Date(order.paidAt || Date.now()).toLocaleDateString()}`, 50, 215);

            // --- Billing Address ---
            doc
                .fontSize(10)
                .text(`Bill To:`, 50, 250)
                .font('Helvetica-Bold')
                .text(user.name, 50, 265)
                .font('Helvetica')
                .text(order.shippingAddress.address, 50, 280)
                .text(`${order.shippingAddress.city}, ${order.shippingAddress.postalCode}`, 50, 295)
                .text(order.shippingAddress.country, 50, 310)
                .text(user.phoneNumber || '', 50, 325) // Added Phone Number
                .moveDown();

            // --- Table Header ---
            const tableTop = 350;
            doc.font('Helvetica-Bold');
            doc.text('Item', 50, tableTop);
            doc.text('Quantity', 300, tableTop, { width: 90, align: 'right' });
            doc.text('Price', 400, tableTop, { width: 90, align: 'right' });
            doc.text('Total', 500, tableTop, { width: 90, align: 'right' });

            doc.moveTo(50, tableTop + 15).lineTo(600, tableTop + 15).stroke();

            // --- Items ---
            let position = tableTop + 30;
            doc.font('Helvetica');

            order.orderItems.forEach(item => {
                const name = item.name.length > 40 ? item.name.substring(0, 40) + '...' : item.name;

                doc.text(name, 50, position);
                doc.text(item.qty.toString(), 300, position, { width: 90, align: 'right' });
                doc.text(`Rs. ${item.price.toFixed(2)}`, 400, position, { width: 90, align: 'right' });
                doc.text(`Rs. ${(item.price * item.qty).toFixed(2)}`, 500, position, { width: 90, align: 'right' });

                position += 20;
            });

            // --- Divider ---
            doc.moveTo(50, position + 10).lineTo(600, position + 10).stroke();

            // --- Totals ---
            const subtotalPosition = position + 30;

            doc.font('Helvetica-Bold');
            doc.text('Subtotal:', 400, subtotalPosition, { width: 90, align: 'right' });
            doc.text(`Rs. ${order.itemsPrice ? order.itemsPrice.toFixed(2) : order.totalPrice.toFixed(2)}`, 500, subtotalPosition, { width: 90, align: 'right' });

            doc.font('Helvetica');
            doc.text('Tax:', 400, subtotalPosition + 15, { width: 90, align: 'right' });
            doc.text(`Rs. ${order.taxPrice ? order.taxPrice.toFixed(2) : '0.00'}`, 500, subtotalPosition + 15, { width: 90, align: 'right' });

            doc.text('Shipping:', 400, subtotalPosition + 30, { width: 90, align: 'right' });
            doc.text(`Rs. ${order.shippingPrice ? order.shippingPrice.toFixed(2) : '0.00'}`, 500, subtotalPosition + 30, { width: 90, align: 'right' });

            doc.font('Helvetica-Bold').fontSize(12);
            doc.text('Total:', 400, subtotalPosition + 50, { width: 90, align: 'right' });
            doc.text(`Rs. ${order.totalPrice.toFixed(2)}`, 500, subtotalPosition + 50, { width: 90, align: 'right' });

            // --- Payment Details ---
            doc.font('Helvetica').fontSize(10);
            doc.text(`Payment Method: ${order.paymentMethod}`, 50, subtotalPosition + 70);
            doc.text(`Payment Date: ${new Date(order.paidAt || Date.now()).toLocaleString()}`, 50, subtotalPosition + 85);

            // --- Footer ---
            doc
                .font('Helvetica')
                .fontSize(10)
                .text('Thank you.', 50, 700, { align: 'center', width: 500 });

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
};

module.exports = generateInvoicePDF;
