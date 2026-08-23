/** @jest-environment node */

import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    billPaymentProofs: { findFirst: jest.fn() },
    signedDocuments: { findFirst: jest.fn() },
    documentSubjects: { findUnique: jest.fn() },
    parentChildLinks: { findFirst: jest.fn() },
    organizations: { findUnique: jest.fn() },
  },
}));
jest.mock('@/lib/permissions', () => ({ requireSession: jest.fn() }));
jest.mock('@/server/billing/billPaymentActions', () => ({
  canManageBillPayment: jest.fn(),
  loadBillForAction: jest.fn(),
}));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: jest.fn(),
}));

import { assertFileReadAccess } from '@/server/fileAccess';

const fileRequest = (fileId: string) => new NextRequest(`http://localhost/api/files/${fileId}`);

const prismaMock = jest.requireMock('@/lib/prisma').prisma as {
  billPaymentProofs: { findFirst: jest.Mock };
  signedDocuments: { findFirst: jest.Mock };
  documentSubjects: { findUnique: jest.Mock };
  parentChildLinks: { findFirst: jest.Mock };
  organizations: { findUnique: jest.Mock };
};
const requireSessionMock = jest.requireMock('@/lib/permissions').requireSession as jest.Mock;
const billingActionsMock = jest.requireMock('@/server/billing/billPaymentActions') as {
  canManageBillPayment: jest.Mock;
  loadBillForAction: jest.Mock;
};
const organizationAccessMock = jest.requireMock('@/server/accessControl') as {
  hasOrgPermission: jest.Mock;
};
describe('assertFileReadAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.billPaymentProofs.findFirst.mockResolvedValue(null);
    prismaMock.signedDocuments.findFirst.mockResolvedValue(null);
  });
  it('keeps normal public images readable without a session', async () => {
    await expect(assertFileReadAccess(fileRequest('public_file'), 'public_file')).resolves.toBeUndefined();
    expect(requireSessionMock).not.toHaveBeenCalled();
  });

  it('requires a session for a manual payment proof', async () => {
    prismaMock.billPaymentProofs.findFirst.mockResolvedValueOnce({
      billId: 'bill_1',
      uploadedByUserId: 'payer_1',
    });
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(assertFileReadAccess(fileRequest('proof_file'), 'proof_file'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('allows the proof uploader without widening bill access', async () => {
    prismaMock.billPaymentProofs.findFirst.mockResolvedValueOnce({
      billId: 'bill_1',
      uploadedByUserId: 'payer_1',
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'payer_1', isAdmin: false });

    await expect(assertFileReadAccess(fileRequest('proof_file'), 'proof_file')).resolves.toBeUndefined();
    expect(billingActionsMock.loadBillForAction).not.toHaveBeenCalled();
  });

  it('allows an authorized bill manager to read a manual payment proof', async () => {
    const bill = { id: 'bill_1', ownerType: 'TEAM', ownerId: 'team_1' };
    prismaMock.billPaymentProofs.findFirst.mockResolvedValueOnce({
      billId: 'bill_1',
      uploadedByUserId: 'payer_1',
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'manager_1', isAdmin: false });
    billingActionsMock.loadBillForAction.mockResolvedValueOnce(bill);
    billingActionsMock.canManageBillPayment.mockResolvedValueOnce(true);

    await expect(assertFileReadAccess(fileRequest('proof_file'), 'proof_file')).resolves.toBeUndefined();
    expect(billingActionsMock.canManageBillPayment).toHaveBeenCalledWith(
      { userId: 'manager_1', isAdmin: false },
      bill,
    );
  });

  it('rejects unrelated authenticated users before storage is read', async () => {
    prismaMock.billPaymentProofs.findFirst.mockResolvedValueOnce({
      billId: 'bill_1',
      uploadedByUserId: 'payer_1',
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'unrelated_1', isAdmin: false });
    billingActionsMock.loadBillForAction.mockResolvedValueOnce({ id: 'bill_1' });
    billingActionsMock.canManageBillPayment.mockResolvedValueOnce(false);

    await expect(assertFileReadAccess(fileRequest('proof_file'), 'proof_file'))
      .rejects.toMatchObject({ status: 403 });
  });
  it('requires the subject session for an imported document file', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValueOnce({
      userId: 'subject_1',
      documentSubjectId: null,
      organizationId: 'org_1',
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'unrelated_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    organizationAccessMock.hasOrgPermission.mockResolvedValueOnce(false);
    await expect(assertFileReadAccess(fileRequest('imported_file'), 'imported_file'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('allows an imported document subject to read the file', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValueOnce({
      userId: 'subject_1',
      documentSubjectId: null,
      organizationId: 'org_1',
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'subject_1', isAdmin: false });

    await expect(assertFileReadAccess(fileRequest('imported_file'), 'imported_file'))
      .resolves.toBeUndefined();
  });
});
