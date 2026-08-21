/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  bills: {
    create: jest.fn(),
  },
  billPayments: {
    create: jest.fn(),
  },
};

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  canonicalTeams: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  teamRegistrations: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const listOrganizationUsersScopeEventsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: canManageOrganizationMock,
  hasOrgPermission: hasOrgPermissionMock,
}));
jest.mock('@/server/organizationUsersAccess', () => ({
  listOrganizationUsersScopeEvents: listOrganizationUsersScopeEventsMock,
}));

import { POST } from '@/app/api/organizations/[id]/bills/route';

describe('POST /api/organizations/[id]/bills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    canManageOrganizationMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockReturnValue(true);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([{ userIds: ['player_1'], teamIds: [] }]);
    txMock.bills.create.mockResolvedValue({ id: 'bill_1' });
    txMock.billPayments.create.mockResolvedValue({ id: 'payment_1' });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
  });

  it('creates a customer bill and records the paid amount', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/bills', {
        method: 'POST',
        body: JSON.stringify({
          ownerType: 'USER',
          ownerId: 'player_1',
          label: 'Registration fee',
          totalAmountCents: 12500,
          paidAmountCents: 3000,
          dueDate: '2026-08-30',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(201);
    expect(txMock.bills.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerId: 'player_1',
        totalAmountCents: 12500,
        paidAmountCents: 3000,
        status: 'OPEN',
      }),
    }));
    expect(txMock.billPayments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amountCents: 12500,
        paidAmountCents: 3000,
        status: 'PARTIAL',
      }),
    }));
  });

  it('rejects a paid amount above the bill amount before writing', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/bills', {
        method: 'POST',
        body: JSON.stringify({
          ownerType: 'USER',
          ownerId: 'player_1',
          label: 'Registration fee',
          totalAmountCents: 12500,
          paidAmountCents: 13000,
          dueDate: '2026-08-30',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
