/**
 * Email Templates Unit Tests
 */

const {
    getSettlementGeneratedTemplate,
    getSettlementProcessedTemplate,
    getSettlementPaidTemplate
} = require('../../services/emailTemplates');

describe('Email Templates', () => {
    const mockSettlement = {
        settlementNumber: 'STL-202602-0001',
        periodStart: new Date('2026-02-01'),
        periodEnd: new Date('2026-02-07'),
        netPayable: 8720,
        status: 'PENDING_APPROVAL',
        seller: {
            ownerName: 'John Doe',
            email: 'john@example.com',
            bankDetails: {
                bankName: 'Test Bank',
                accountNumber: '1234567890'
            }
        },
        paymentInfo: {
            utrNumber: 'UTR123456',
            paidAt: new Date('2026-02-10')
        }
    };

    describe('getSettlementGeneratedTemplate', () => {
        it('should generate template with correct details', () => {
            const html = getSettlementGeneratedTemplate(mockSettlement);
            expect(html).toContain('John Doe');
            expect(html).toContain('STL-202602-0001');
            expect(html).toContain('8,720'); // Formatted amount
            expect(html).toContain('PENDING_APPROVAL');
        });
    });

    describe('getSettlementProcessedTemplate', () => {
        it('should generate template with bank details', () => {
            const html = getSettlementProcessedTemplate(mockSettlement);
            expect(html).toContain('John Doe');
            expect(html).toContain('STL-202602-0001');
            expect(html).toContain('Test Bank');
            expect(html).toContain('...7890'); // Masked account
        });
    });

    describe('getSettlementPaidTemplate', () => {
        it('should generate template with payment details', () => {
            const html = getSettlementPaidTemplate(mockSettlement);
            expect(html).toContain('John Doe');
            expect(html).toContain('STL-202602-0001');
            expect(html).toContain('UTR123456');
            expect(html).toContain('8,720');
        });
    });
});
