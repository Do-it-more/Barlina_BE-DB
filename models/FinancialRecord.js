const mongoose = require('mongoose');

const financialRecordSchema = mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['INCOME', 'EXPENSE', 'SALARY', 'REFUND', 'ADJUSTMENT']
    },
    category: {
        type: String,
        required: true,
        // Examples: 'Sales', 'Office Rent', 'Marketing', 'Employee Salary', 'Server Costs'
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    reference: {
        model: {
            type: String,
            enum: ['Order', 'User', 'ReturnRequest', null],
            default: null
        },
        id: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'reference.model'
        }
    },
    paymentMethod: {
        type: String,
        required: true,
        default: 'BANK_TRANSFER'
    },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
        default: 'COMPLETED'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // Admin who created existing record
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('FinancialRecord', financialRecordSchema);
