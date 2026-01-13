const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

const AdminApprovalRequest = require('./models/AdminApprovalRequest');
const ReturnRequest = require('./models/ReturnRequest');

const checkData = async () => {
    await connectDB();

    try {
        const approvals = await AdminApprovalRequest.find({ status: 'PENDING' }).lean();
        console.log(`Found ${approvals.length} pending approvals.`);

        for (const app of approvals) {
            console.log('--- Approval Request ---');
            console.log('ID:', app._id);
            console.log('Action:', app.action);
            console.log('TargetModel:', app.targetModel);
            console.log('TargetId:', app.targetId);

            if (app.targetModel === 'ReturnRequest' && app.targetId) {
                const returnReq = await ReturnRequest.findById(app.targetId);
                console.log('Found Linked ReturnRequest?', !!returnReq);
                if (returnReq) {
                    console.log('Return Request ID:', returnReq._id);
                    console.log('Reason:', returnReq.reason);
                    console.log('Comments:', returnReq.comments);
                    console.log('Images:', returnReq.images);
                } else {
                    console.log('ERROR: ReturnRequest not found for ID:', app.targetId);
                }
            } else {
                console.log('Mismatch: targetModel/targetId missing or wrong type');
                console.log('targetModel type:', typeof app.targetModel);
                console.log('targetId type:', typeof app.targetId);
            }
        }
    } catch (e) {
        console.error(e);
    }

    process.exit();
};

checkData();
