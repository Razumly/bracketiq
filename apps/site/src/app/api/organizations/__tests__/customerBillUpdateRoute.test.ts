/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  bills: {
    update: jest.fn(),
  },
  billPayments: {
    update: jest.fn(),
  },
};

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  bills: {
    findUnique: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: canManageOrganizationMock,
  hasOrgPermission: hasOrgPermissionMock,
}));

import { PATCH } from '@/app/api/organizations/[id]/bills/[billId]/route';

describe('PATCH /api/organizations/[id]/bills/[billId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    canManageOrganizationMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockReturnValue(true);
    prismaMock.bills.findUnique
      .mockResolvedValueOnce({
        id: 'bill_1',
        organizationId: 'org_1',
        eventId: null,
        sourceType: 'MANUAL_CUSTOMER_BILL',
        totalAmountCents: 12500,
        paidAmountCents: 3000,
      })
      .mockResolvedValueOnce({ id: 'bill_1', totalAmountCents: 15000, paidAmountCents: 5000 });
    prismaMock.billPayments.findMany.mockResolvedValue([{
      id: 'payment_1',
      paymentIntentId: null,
      refundedAmountCents: 0,
      paidAt: null,
    }]);
    txMock.billPayments.update.mockResolvedValue({ id: 'payment_1' });
    txMock.bills.update.mockResolvedValue({ id: 'bill_1' });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
  });

  it('updates the bill and its payment in one transaction', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/bills/bill_1', {
        method: 'PATCH',
        body: JSON.stringify({
          label: 'Updated registration fee',
          totalAmountCents: 15000,
          paidAmountCents: 5000,
          dueDate: '2026-09-15',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', billId: 'bill_1' }) },
    );

    expect(response.status).toBe(200);
    expect(txMock.billPayments.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment_1' },
      data: expect.objectContaining({ amountCents: 15000, paidAmountCents: 5000, status: 'PARTIAL' }),
    }));
    expect(txMock.bills.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bill_1' },
      data: expect.objectContaining({ totalAmountCents: 15000, paidAmountCents: 5000, status: 'OPEN' }),
    }));
  });
  it('rejects a user when both asynchronous billing permissions are false', async () => {
    hasOrgPermissionMock.mockResolvedValue(false);

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/bills/bill_1', {
        method: 'PATCH',
        body: JSON.stringify({
          label: 'Updated registration fee',
          totalAmountCents: 15000,
          paidAmountCents: 5000,
          dueDate: '2026-09-15',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', billId: 'bill_1' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a paid amount above the updated bill amount before writing', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/bills/bill_1', {
        method: 'PATCH',
        body: JSON.stringify({
          label: 'Updated registration fee',
          totalAmountCents: 15000,
          paidAmountCents: 16000,
          dueDate: '2026-09-15',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', billId: 'bill_1' }) },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
