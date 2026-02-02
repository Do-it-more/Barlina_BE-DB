const express = require('express');
const router = express.Router();
const {
    getAllTickets,
    getTicketById,
    replyToTicket,
    updateTicketStatus
} = require('../controllers/adminSupportController');
const { protect, admin } = require('../middleware/authMiddleware');

// All routes require admin authentication
router.use(protect, admin);

router.get('/', getAllTickets);
router.get('/:id', getTicketById);
router.put('/:id/reply', replyToTicket);
router.put('/:id/status', updateTicketStatus);

module.exports = router;
