/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { encryptSecret } from '@/server/integrations/secretCrypto';
import {
  buildQuickBooksStaffPayRunJournalEntry,
  syncStaffPayRunToQuickBooks,
} from '@/server/integrations/quickBooksPayRunSync';

describe('quickBooksPayRunSync', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
  };

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
  });

  afterEach(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('builds a balanced QuickBooks journal entry for a staff pay run', () => {
    const payload = buildQuickBooksStaffPayRunJournalEntry({
      payRun: {
        id: 'pay_run_1',
        organizationId: 'org_1',
        title: 'June payroll',
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T23:59:59.999Z'),
        scheduledPayDate: new Date('2026-07-05T00:00:00.000Z'),
        status: 'APPROVED',
        totalAmountCents: 6000,
      },
      mapping: {
        payrollExpenseAccountExternalId: '62',
        payrollExpenseAccountName: 'Payroll Expenses',
        payrollLiabilityAccountExternalId: '41',
        payrollLiabilityAccountName: 'Payroll Clearing',
      },
    });

    expect(payload.TxnDate).toBe('2026-07-05');
    expect(payload.Line).toHaveLength(2);
    expect(payload.Line[0]).toEqual(expect.objectContaining({
      Amount: 60,
      JournalEntryLineDetail: expect.objectContaining({
        PostingType: 'Debit',
        AccountRef: { value: '62', name: 'Payroll Expenses' },
      }),
    }));
    expect(payload.Line[1]).toEqual(expect.objectContaining({
      Amount: 60,
      JournalEntryLineDetail: expect.objectContaining({
        PostingType: 'Credit',
        AccountRef: { value: '41', name: 'Payroll Clearing' },
      }),
    }));
  });


  it('requires explicit QuickBooks payroll account mappings before syncing', async () => {
    const client = {
      staffPayRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pay_run_1',
          organizationId: 'org_1',
          title: 'June payroll',
          periodStart: new Date('2026-06-01T00:00:00.000Z'),
          periodEnd: new Date('2026-06-30T23:59:59.999Z'),
          status: 'APPROVED',
          totalAmountCents: 6000,
        }),
      },
      organizationAccountingConnections: {
        findUnique: jest.fn().mockResolvedValue({
          payrollExpenseAccountExternalId: null,
          payrollLiabilityAccountExternalId: null,
        }),
      },
      accountingSyncRecords: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const fetchMock = jest.fn();

    await expect(syncStaffPayRunToQuickBooks({
      organizationId: 'org_1',
      payRunId: 'pay_run_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
    })).rejects.toThrow('Set QuickBooks payroll expense and liability account IDs before syncing pay runs.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.accountingSyncRecords.upsert).not.toHaveBeenCalled();
  });
});
