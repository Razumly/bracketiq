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
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'evidence_1',
      documentName: 'Imported Waiver',
      provenance: 'IMPORTED',
      status: 'SIGNED',
      historicalSigningDate: new Date('2026-08-20T12:00:00.000Z'),
      importedAt: new Date('2026-08-22T09:00:00.000Z'),
      sourceNote: 'Private source note.',
      attestationText: 'Private attestation.',
      attestationVersion: '2026-08-01',
      contentHash: 'sha256:abc',
      uploaderId: 'owner_1',
    });
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

  it('returns a restricted audit trail after the permission check', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      auditTrail: {
        description: 'This audit trail records application events. It is not tamper-proof.',
        evidence: {
          id: 'evidence_1',
          documentName: 'Imported Waiver',
          provenance: 'IMPORTED',
          status: 'SIGNED',
          historicalSigningDate: '2026-08-20T12:00:00.000Z',
          importedAt: '2026-08-22T09:00:00.000Z',
          sourceNote: 'Private source note.',
          attestationText: 'Private attestation.',
          attestationVersion: '2026-08-01',
          contentHash: 'sha256:abc',
          uploader: { userId: 'owner_1', displayName: 'Alex Owner' },
        },
        events: [{
          id: 'audit_1',
          createdAt: '2026-08-22T10:00:00.000Z',
          eventType: 'IMPORT',
          actorUserId: 'owner_1',
          actorDisplayName: 'Alex Owner',
          reason: null,
          note: 'Private archive note.',
          payload: { importedFileId: 'file_1' },
        }],
      },
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
      select: { id: true, firstName: true, lastName: true },
    });
  });

  it('uses an explicit label when an actor has no display name', async () => {
    prismaMock.userData.findMany.mockResolvedValueOnce([
      {
        id: 'owner_1',
        firstName: null,
        lastName: null,
        userName: 'alex',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.auditTrail.events[0].actorDisplayName).toBe('Name unavailable');
    expect(payload.auditTrail.evidence.uploader.displayName).toBe('Name unavailable');
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

  it('denies audit history to a document subject', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'subject_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(403);
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(
      { userId: 'subject_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      ORG_PERMISSIONS.DOCUMENTS_AUDIT_VIEW,
    );
    expect(prismaMock.signedDocuments.findFirst).not.toHaveBeenCalled();
  });

  it('denies audit history to a linked guardian', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'guardian_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/documents/evidence_1/audit'),
      { params: Promise.resolve({ id: 'org_1', signedDocumentId: 'evidence_1' }) },
    );

    expect(response.status).toBe(403);
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(
      { userId: 'guardian_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      ORG_PERMISSIONS.DOCUMENTS_AUDIT_VIEW,
    );
    expect(prismaMock.signedDocuments.findFirst).not.toHaveBeenCalled();
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
