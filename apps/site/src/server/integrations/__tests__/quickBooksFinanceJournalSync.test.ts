/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

const loadOrganizationFinanceSummaryMock = jest.fn();
const listOrganizationFinanceCategoryAccountingMappingsMock = jest.fn();

jest.mock('@/server/finance/financeRepository', () => ({
  loadOrganizationFinanceSummary: (...args: unknown[]) => loadOrganizationFinanceSummaryMock(...args),
}));

jest.mock('@/server/integrations/financeCategoryAccountingMappings', () => ({
  listOrganizationFinanceCategoryAccountingMappings: (...args: unknown[]) => (
    listOrganizationFinanceCategoryAccountingMappingsMock(...args)
  ),
}));

import { encryptSecret } from '@/server/integrations/secretCrypto';
import {
  buildFinanceJournalSyncSourceKey,
  syncOrganizationFinanceJournalEntryToQuickBooks,
} from '@/server/integrations/quickBooksFinanceJournalSync';

describe('quickBooksFinanceJournalSync', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
    loadOrganizationFinanceSummaryMock.mockResolvedValue({
      organizationId: 'org_1',
      grossRevenueCents: 0,
      refundCents: 0,
      feeCents: 0,
      actualRevenueCents: 0,
      actualCostCents: 2500,
      actualProfitCents: -2500,
      futureCostCents: 0,
      projectedProfitCents: -2500,
      staffCostCents: 0,
      customCostCents: 2500,
      warnings: [],
      lineItems: [
        {
          id: 'custom:line_1',
          sourceType: 'custom_line_item',
          sourceId: 'line_1',
          scope: 'ORGANIZATION',
          label: 'Field rental',
          category: 'Rentals',
          amountCents: -2500,
          classification: 'custom_cost',
          status: 'ACTUAL',
          timing: 'ACTUAL',
          isGenerated: false,
        },
      ],
    });
    listOrganizationFinanceCategoryAccountingMappingsMock.mockResolvedValue([
      {
        id: 'mapping_1',
        organizationId: 'org_1',
        provider: 'QUICKBOOKS_ONLINE',
        category: 'Rentals',
        categoryKey: 'rentals',
        entryType: 'EXPENSE',
        accountExternalId: '75',
        accountName: 'Field Rental Expense',
        isActive: true,
      },
    ]);
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

  it('builds stable source keys from finance date ranges', () => {
    expect(buildFinanceJournalSyncSourceKey({
      organizationId: 'org_1',
      from: '2026-06-01T07:00:00.000Z',
      to: '2026-07-01T06:59:59.999Z',
    })).toBe('organization:org_1:finance-journal:2026-06-01:2026-07-01');
  });


  it('does not post when finance account mappings are incomplete', async () => {
    listOrganizationFinanceCategoryAccountingMappingsMock.mockResolvedValue([]);
    const client = {
      organizationAccountingConnections: {
        findUnique: jest.fn(async (args: any) => {
          if (args?.select) {
            return {
              status: 'CONNECTED',
              financeClearingAccountExternalId: '35',
              financeClearingAccountName: 'Undeposited Funds',
            };
          }
          return null;
        }),
      },
      accountingSyncRecords: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const fetchMock = jest.fn();

    await expect(syncOrganizationFinanceJournalEntryToQuickBooks({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      from: '2026-06-01',
      to: '2026-06-30',
      client,
      fetchImpl: fetchMock,
    })).rejects.toThrow('Resolve the QuickBooks account mappings before syncing this journal entry.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.accountingSyncRecords.upsert).not.toHaveBeenCalled();
  });
});
