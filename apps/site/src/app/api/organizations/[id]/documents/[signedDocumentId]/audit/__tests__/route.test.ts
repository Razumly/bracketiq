/** @jest-environment node */

import { NextRequest } from 'next/server';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';

const prismaMock = {
  organizations: { findUnique: jest.fn() },
  signedDocuments: { findFirst: jest.fn() },
  documentEvidenceAuditEvents: { findMany: jest.fn() },
  userData: { findMany: jest.fn() },
};
const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: hasOrgPermissionMock,
}));

import { GET } from '@/app/api/organizations/[id]/documents/[signedDocumentId]/audit/route';

describe('GET /api/organizations/[id]/documents/[signedDocumentId]/audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.signedDocuments.findFirst.mockResolvedValue({ id: 'evidence_1' });
    prismaMock.documentEvidenceAuditEvents.findMany.mockResolvedValue([
      {
        id: 'audit_1',
        createdAt: new Date('2026-08-22T10:00:00.000Z'),
        eventType: 'IMPORT',
        actorUserId: 'owner_1',
        reason: null,
        note: 'Private archive note.',
        payload: { importedFileId: 'file_1' },
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'owner_1',
        firstName: 'Alex',
        lastName: 'Owner',
        userName: 'alex',
      },
    ]);
  });

  it('returns audit history only after the owner or platform-admin check', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      auditEvents: [expect.objectContaining({
        id: 'audit_1',
        eventType: 'IMPORT',
        actorDisplayName: 'Alex Owner',
        note: 'Private archive note.',
        payload: { importedFileId: 'file_1' },
      })],
    });
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(
      { userId: 'owner_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      ORG_PERMISSIONS.DOCUMENTS_AUDIT_VIEW,
    );
    expect(prismaMock.documentEvidenceAuditEvents.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org_1', signedDocumentId: 'evidence_1' },
      orderBy: { createdAt: 'asc' },
    }));
    expect(prismaMock.userData.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['owner_1'] } },
      select: { id: true, firstName: true, lastName: true, userName: true },
    });
  });

  it('does not read audit history for an unauthorized staff member', async () => {
    hasOrgPermissionMock.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.signedDocuments.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.documentEvidenceAuditEvents.findMany).not.toHaveBeenCalled();
  });

  it('does not cross organization boundaries', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(404);
    expect(prismaMock.documentEvidenceAuditEvents.findMany).not.toHaveBeenCalled();
  });
});
