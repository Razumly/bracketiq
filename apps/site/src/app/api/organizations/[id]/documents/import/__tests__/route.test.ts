/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  signedDocuments: {
    create: jest.fn(),
  },
};

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const ensureDocumentSubjectMock = jest.fn();
const signedDocumentEvidenceFieldsMock = jest.fn();
const createDocumentRequirementSatisfactionMock = jest.fn();
const appendDocumentEvidenceAuditEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: canManageOrganizationMock,
  hasOrgPermission: hasOrgPermissionMock,
}));
jest.mock('@/server/documentEvidence', () => ({
  DOCUMENT_EVIDENCE_PROVENANCE: { IMPORTED: 'IMPORTED' },
  ensureDocumentSubject: ensureDocumentSubjectMock,
  signedDocumentEvidenceFields: signedDocumentEvidenceFieldsMock,
  createDocumentRequirementSatisfaction: createDocumentRequirementSatisfactionMock,
  appendDocumentEvidenceAuditEvent: appendDocumentEvidenceAuditEventMock,
}));

import { POST } from '@/app/api/organizations/[id]/documents/import/route';

describe('POST /api/organizations/[id]/documents/import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageOrganizationMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      signerRoles: ['participant'],
    });
    ensureDocumentSubjectMock.mockResolvedValue('document-subject:org_1:player_1');
    signedDocumentEvidenceFieldsMock.mockReturnValue({
      provenance: 'IMPORTED',
      providerDocumentId: null,
      signerUserId: 'player_1',
      documentSubjectId: 'document-subject:org_1:player_1',
      scopeType: 'ORGANIZATION',
      scopeId: 'org_1',
    });
    txMock.signedDocuments.create.mockResolvedValue({ id: 'evidence_1' });
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));
  });

  it('stores imported evidence and records its import audit event', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents/import', {
        method: 'POST',
        body: JSON.stringify({
          subjectUserId: 'player_1',
          templateId: 'version_1',
          documentName: 'Prior waiver',
          contentHash: 'sha256:abc',
          importedFileId: 'file_1',
          scopeType: 'ORGANIZATION',
          scopeId: 'org_1',
          historicalSigningDate: '2026-08-01T10:00:00.000Z',
          signerRole: 'participant',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provenance: 'IMPORTED',
        providerDocumentId: null,
        contentHash: 'sha256:abc',
        documentSubjectId: 'document-subject:org_1:player_1',
        status: 'SIGNED',
      }),
    }));
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(expect.objectContaining({
      evidenceId: 'evidence_1',
      templateDocumentId: 'version_1',
    }), expect.anything());
    expect(appendDocumentEvidenceAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'IMPORT',
      evidenceId: 'evidence_1',
    }), expect.anything());
  });

  it('rejects an exact imported evidence duplicate', async () => {
    txMock.signedDocuments.create.mockRejectedValue({ code: 'P2002' });

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents/import', {
        method: 'POST',
        body: JSON.stringify({
          subjectUserId: 'player_1',
          templateId: 'version_1',
          documentName: 'Prior waiver',
          contentHash: 'sha256:abc',
          scopeType: 'ORGANIZATION',
          scopeId: 'org_1',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(409);
  });
});
