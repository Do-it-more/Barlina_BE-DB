const FinancialRecord = require('../models/FinancialRecord');
const Order = require('../models/Order');
const ReturnRequest = require('../models/ReturnRequest');

// @desc    Get financial stats (Income, Expense, Salary, Refund)
// @route   GET /api/finance/stats
// @access  Private/Admin
const getFinancialStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        // 1. Calculate Income from Orders (Paid and Delivered/Completed ideally, but 'isPaid' is good)
        // Adjust filter for Order based on dateFilter if needed, usually 'paidAt' or 'createdAt'
        const orderFilter = { isPaid: true };
        if (startDate && endDate) {
            orderFilter.paidAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const incomeAggregation = await Order.aggregate([
            { $match: orderFilter },
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]);
        const totalIncome = incomeAggregation.length > 0 ? incomeAggregation[0].total : 0;

        // 2. Calculate Refunds from ReturnRequests
        // Filter: status = REFUNDED
        const refundFilter = { status: 'REFUNDED' };
        if (startDate && endDate) {
            refundFilter.updatedAt = { $gte: new Date(startDate), $lte: new Date(endDate) }; // Refund happens at update
        }

        const refundAggregation = await ReturnRequest.aggregate([
            { $match: refundFilter },
            { $group: { _id: null, total: { $sum: "$refundAmount" } } }
        ]);

        // 2b. Calculate Refunds from Order Cancellations
        const cancellationFilter = { status: 'CANCELLED', 'cancellation.refundAmount': { $gt: 0 } };
        if (startDate && endDate) {
            cancellationFilter['cancellation.approvedAt'] = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        const cancellationAggregation = await Order.aggregate([
            { $match: cancellationFilter },
            { $group: { _id: null, total: { $sum: "$cancellation.refundAmount" } } }
        ]);

        const totalRefunds = (refundAggregation.length > 0 ? refundAggregation[0].total : 0) +
            (cancellationAggregation.length > 0 ? cancellationAggregation[0].total : 0);

        // 3. Calculate Expenses and Salaries from FinancialRecord
        const recordFilter = {};
        if (startDate && endDate) {
            recordFilter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const expenseAggregation = await FinancialRecord.aggregate([
            { $match: { ...recordFilter, type: 'EXPENSE' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalExpenses = expenseAggregation.length > 0 ? expenseAggregation[0].total : 0;

        const salaryAggregation = await FinancialRecord.aggregate([
            { $match: { ...recordFilter, type: 'SALARY' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalSalaries = salaryAggregation.length > 0 ? salaryAggregation[0].total : 0;

        const netProfit = totalIncome - totalRefunds - totalExpenses - totalSalaries;

        res.json({
            income: totalIncome,
            refunds: totalRefunds,
            expenses: totalExpenses,
            salaries: totalSalaries,
            netProfit
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all financial records
// @route   GET /api/finance/records
// @access  Private/Admin
const getFinancialRecords = async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query;
        const filter = {};

        if (type) filter.type = type;
        if (startDate && endDate) {
            filter.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const records = await FinancialRecord.find(filter).sort({ date: -1 }).populate('createdBy', 'name');
        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Add a financial record (Expense/Salary)
// @route   POST /api/finance
// @access  Private/Admin
const addFinancialRecord = async (req, res) => {
    try {
        const { type, category, amount, description, date, paymentMethod } = req.body;

        const record = new FinancialRecord({
            type,
            category,
            amount,
            description,
            date: date || Date.now(),
            paymentMethod,
            createdBy: req.user._id
        });

        const createdRecord = await record.save();
        res.status(201).json(createdRecord);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a financial record
// @route   DELETE /api/finance/:id
// @access  Private/Admin
const deleteFinancialRecord = async (req, res) => {
    try {
        const record = await FinancialRecord.findById(req.params.id);

        if (record) {
            await record.deleteOne();
            res.json({ message: 'Record removed' });
        } else {
            res.status(404).json({ message: 'Record not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getFinancialStats,
    getFinancialRecords,
    addFinancialRecord,
    deleteFinancialRecord
};
