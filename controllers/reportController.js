const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const PDFDocument = require('pdfkit');

// Helper to convert JSON to CSV
const convertToCSV = (data, fields) => {
    const csvRows = [];
    // Header
    csvRows.push(fields.join(','));

    // Rows
    for (const row of data) {
        const values = fields.map(field => {
            const val = row[field];
            return `"${String(val).replace(/"/g, '""')}"`; // Escape quotes
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
};

// Helper: Generate PDF Table
const generatePDF = (res, title, data, headers) => {
    const doc = new PDFDocument({ margin: 30 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${title}.pdf"`);

    doc.pipe(res);

    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown();

    doc.fontSize(10);

    const tableTop = 100;
    let y = tableTop;
    const colWidth = 550 / headers.length;

    // Headers
    doc.font('Helvetica-Bold');
    headers.forEach((header, i) => {
        doc.text(header, 30 + (i * colWidth), y, { width: colWidth, align: 'left' });
    });
    y += 20;

    // Rows
    doc.font('Helvetica');
    data.forEach((row) => {
        if (y > 700) {
            doc.addPage();
            y = 50;
        }

        // We assume 'row' corresponds to headers order, so we need keys
        // Since we pass mapped objects, we can use Object.values(row) but order isn't guaranteed
        // So we will iterate based on keys passed as separate arg or just object keys if consistent.
        // Better: Update mappedData to be arrays or handle keys.
        // For simplicity here, let's assume 'data' is array of objects and we print values.

        // Actually, let's just use Object.values for this simple implementation
        const values = Object.values(row);

        values.forEach((val, i) => {
            doc.text(String(val).substring(0, 20), 30 + (i * colWidth), y, { width: colWidth, align: 'left' });
        });
        y += 20;

        // rudimentary line
        doc.lineWidth(0.5).moveTo(30, y - 5).lineTo(580, y - 5).stroke();
    });

    doc.end();
};

// Unified Report Generator
const generateReport = (res, format, filename, data, fields) => {
    if (format === 'pdf') {
        generatePDF(res, filename, data, fields);
    } else {
        const csv = convertToCSV(data, fields);
        res.setHeader('Content-Type', 'text/csv');
        res.attachment(`${filename}.csv`);
        res.status(200).send(csv);
    }
};

const Contact = require('../models/Contact'); // Import Contact model

// ... existing helpers ...

// @desc    Get dashboard stats
// @route   GET /api/reports/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
    const orders = await Order.find({ isPaid: true });
    const totalRevenue = orders.reduce((acc, order) => acc + order.totalPrice, 0);
    const orderCount = await Order.countDocuments();
    const paidOrders = orders.length;
    const deliveredOrders = await Order.countDocuments({ isDelivered: true });
    const userCount = await User.countDocuments();
    const productCount = await Product.countDocuments();

    // New counts for notifications
    const openComplaintsCount = await Complaint.countDocuments({ isViewedByAdmin: false });
    const newInquiriesCount = await Contact.countDocuments({ status: 'New' });

    const dailyOrders = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: new Date(new Date() - 7 * 60 * 60 * 24 * 1000) }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                sales: { $sum: "$totalPrice" },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const ordersByStatus = {
        paid: paidOrders,
        delivered: deliveredOrders,
        pending: orderCount - paidOrders
    };

    res.json({
        totalRevenue,
        orderCount,
        userCount,
        productCount,
        dailyOrders,
        ordersByStatus,
        openComplaintsCount,
        newInquiriesCount
    });
});

// @desc    Download Sales Report
// @route   GET /api/reports/sales/download
// @access  Private/Admin
const downloadSalesReport = asyncHandler(async (req, res) => {
    // Current Month Sales
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const orders = await Order.find({
        createdAt: { $gte: startOfMonth },
        isPaid: true
    }).populate('user', 'name email');

    const mappedData = orders.map(o => ({
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Unknown',
        Email: o.user ? o.user.email : 'N/A',
        Amount: o.totalPrice,
        Date: o.createdAt.toISOString().split('T')[0],
        Status: o.isDelivered ? 'Delivered' : 'Paid'
    }));

    const csv = convertToCSV(mappedData, ['OrderID', 'Customer', 'Email', 'Amount', 'Date', 'Status']);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`Monthly_Sales_Report_${new Date().getMonth() + 1}.csv`);
    res.status(200).send(csv);
});

// @desc    Download Complaint Report
// @route   GET /api/reports/complaints/download
// @access  Private/Admin
const downloadComplaintReport = asyncHandler(async (req, res) => {
    const complaints = await Complaint.find({}).populate('user', 'name email').populate('order', '_id');

    const mappedData = complaints.map(c => ({
        ComplaintID: c._id,
        OrderID: c.order ? c.order._id : 'N/A',
        Customer: c.user ? c.user.name : 'Unknown',
        Subject: c.subject,
        Status: c.status,
        Date: c.createdAt.toISOString().split('T')[0]
    }));

    const csv = convertToCSV(mappedData, ['ComplaintID', 'OrderID', 'Customer', 'Subject', 'Status', 'Date']);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`Complaints_Report.csv`);
    res.status(200).send(csv);
});

// @desc    Download Order Report
// @route   GET /api/reports/orders/download
// @access  Private/Admin
const downloadOrderReport = asyncHandler(async (req, res) => {
    const orders = await Order.find({}).populate('user', 'name email');

    const mappedData = orders.map(o => ({
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Unknown',
        Amount: o.totalPrice,
        Paid: o.isPaid ? 'Yes' : 'No',
        Delivered: o.isDelivered ? 'Yes' : 'No',
        Date: o.createdAt.toISOString().split('T')[0]
    }));

    const csv = convertToCSV(mappedData, ['OrderID', 'Customer', 'Amount', 'Paid', 'Delivered', 'Date']);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`All_Orders_Report.csv`);
    res.status(200).send(csv);
});

// @desc    Download Today's Orders Report
// @route   GET /api/reports/orders/today/download
// @access  Private/Admin
const downloadTodayOrdersReport = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const orders = await Order.find({
        createdAt: { $gte: today, $lt: tomorrow }
    }).populate('user', 'name email mobile');

    const mappedData = orders.map(o => ({
        InvoiceNo: o.invoiceNumber || 'N/A',
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Guest',
        Email: o.user ? o.user.email : 'N/A',
        Mobile: o.shippingAddress?.phoneNumber || 'N/A',
        Amount: `Rs.${o.totalPrice}`,
        Status: o.status || 'CREATED',
        Date: o.createdAt.toISOString().split('T')[0]
    }));

    const fields = ['InvoiceNo', 'OrderID', 'Customer', 'Email', 'Mobile', 'Amount', 'Status', 'Date'];
    const filename = `Todays_Orders_${today.toISOString().split('T')[0]}`;

    generateReport(res, req.query.format, filename, mappedData, fields);
});

// @desc    Download Shipped Orders Report
// @route   GET /api/reports/orders/shipped/download
// @access  Private/Admin
const downloadShippedOrdersReport = asyncHandler(async (req, res) => {
    const orders = await Order.find({
        status: 'SHIPPED'
    }).populate('user', 'name email');

    const mappedData = orders.map(o => ({
        InvoiceNo: o.invoiceNumber || 'N/A',
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Guest',
        TrackingID: o.courier?.trackingId || 'N/A',
        Courier: o.courier?.name || 'N/A',
        ShippedDate: o.courier?.shippedAt ? new Date(o.courier.shippedAt).toISOString().split('T')[0] : 'N/A',
        Address: `${o.shippingAddress?.city}` // Shortened for PDF fit
    }));

    const fields = ['InvoiceNo', 'OrderID', 'Customer', 'TrackingID', 'Courier', 'ShippedDate', 'City'];
    const filename = `Shipped_Orders_Report`;

    generateReport(res, req.query.format, filename, mappedData, fields);
});

// @desc    Download Delivered Orders Report
// @route   GET /api/reports/orders/delivered/download
// @access  Private/Admin
const downloadDeliveredOrdersReport = asyncHandler(async (req, res) => {
    // Determine filter: either by status 'DELIVERED' or flag isDelivered: true
    const orders = await Order.find({
        $or: [{ status: 'DELIVERED' }, { isDelivered: true }]
    }).populate('user', 'name email');

    const mappedData = orders.map(o => ({
        InvoiceNo: o.invoiceNumber || 'N/A',
        OrderID: o._id,
        Customer: o.user ? o.user.name : 'Guest',
        DeliveredDate: o.deliveredAt ? new Date(o.deliveredAt).toISOString().split('T')[0] : 'N/A',
        Amount: `Rs.${o.totalPrice}`,
        Payment: o.paymentMethod
    }));

    const fields = ['InvoiceNo', 'OrderID', 'Customer', 'DeliveredDate', 'Amount', 'Payment'];
    const filename = `Delivered_Orders_Report`;

    generateReport(res, req.query.format, filename, mappedData, fields);
});

module.exports = {
    getDashboardStats,
    downloadSalesReport,
    downloadComplaintReport,
    downloadOrderReport,
    downloadTodayOrdersReport,
    downloadShippedOrdersReport,
    downloadDeliveredOrdersReport
};
