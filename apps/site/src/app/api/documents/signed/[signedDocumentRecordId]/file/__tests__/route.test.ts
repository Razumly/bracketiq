/** @jest-environment node */

import { Readable } from 'stream';
import { NextRequest } from 'next/server';

const prismaMock = {
  signedDocuments: { findUnique: jest.fn() },
  documentSubjects: { findUnique: jest.fn() },
  parentChildLinks: { findFirst: jest.fn() },
  file: { findUnique: jest.fn() },
  organizations: { findUnique: jest.fn() },
  events: { findUnique: jest.fn() },
  eventRegistrations: { findFirst: jest.fn() },
  canonicalTeams: { findUnique: jest.fn() },
  teamRegistrations: { findFirst: jest.fn() },
  teamStaffAssignments: { findFirst: jest.fn() },
};
const requireSessionMock = jest.fn();
const getStorageProviderMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const canOfficialOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/storageProvider', () => ({ getStorageProvider: getStorageProviderMock }));
jest.mock('@/lib/boldsignServer', () => ({
  downloadSignedDocumentPdf: jest.fn(),
  isBoldSignConfigured: jest.fn(),
}));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: unknown[]) => canManageOrganizationMock(...args),
  canOfficialOrganization: (...args: unknown[]) => canOfficialOrganizationMock(...args),
  hasOrgPermission: (...args: unknown[]) => hasOrgPermissionMock(...args),
}));

import { GET } from '@/app/api/documents/signed/[signedDocumentRecordId]/file/route';

const request = () => new NextRequest(
  'http://localhost/api/documents/signed/signed_imported_1/file',
);
const routeParams = { params: Promise.resolve({ signedDocumentRecordId: 'signed_imported_1' }) };

describe('GET /api/documents/signed/[signedDocumentRecordId]/file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'subject_1', isAdmin: false });
    prismaMock.signedDocuments.findUnique.mockResolvedValue({
      id: 'signed_imported_1',
      signedDocumentId: 'imported-file-record',
      provenance: 'IMPORTED',
      templateId: 'version_1',
      userId: null,
      documentSubjectId: 'document-subject:org_1:subject_1',
      importedFileId: 'file_1',
      documentName: 'Historical waiver',
      organizationId: 'org_1',
      eventId: null,
      teamId: null,
    });
    prismaMock.documentSubjects.findUnique.mockResolvedValue({
      userId: 'subject_1',
      organizationId: 'org_1',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue(null);
    prismaMock.file.findUnique.mockResolvedValue({
      id: 'file_1',
      organizationId: 'org_1',
      bucket: 'private-bucket',
      originalName: 'historical waiver.pdf',
      mimeType: 'application/pdf',
      path: 'private/org_1/file_1.pdf',
    });
    getStorageProviderMock.mockReturnValue({
      getObjectStream: jest.fn().mockResolvedValue({
        stream: Readable.from([Buffer.from('%PDF-1.7 imported')]),
        contentType: 'application/pdf',
      }),
    });
    canManageOrganizationMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockResolvedValue(false);
    canOfficialOrganizationMock.mockResolvedValue(false);
  });

  it('serves the stored imported PDF to its document subject', async () => {
    const response = await GET(request(), routeParams);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('historical_waiver.pdf');
    await expect(response.text()).resolves.toContain('%PDF-1.7 imported');
  });
  it('marks imported PDF responses as non-sniffable', async () => {
    const response = await GET(request(), routeParams);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects an imported file whose stored MIME type is not PDF', async () => {
    prismaMock.file.findUnique.mockResolvedValueOnce({
      id: 'file_1',
      organizationId: 'org_1',
      bucket: 'private-bucket',
      originalName: 'not-a-pdf.png',
      mimeType: 'image/png',
      path: 'private/org_1/file_1.png',
    });

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(415);
    expect(getStorageProviderMock).not.toHaveBeenCalled();
  });

  it('rejects PDF-labelled storage content without a PDF header', async () => {
    getStorageProviderMock.mockReturnValue({
      getObjectStream: jest.fn().mockResolvedValue({
        stream: Readable.from([Buffer.from('<svg></svg>')]),
        contentType: 'application/pdf',
      }),
    });

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(415);
  });

  it('maps provider missing-object errors to not found', async () => {
    getStorageProviderMock.mockReturnValue({
      getObjectStream: jest.fn().mockRejectedValue(new Error('FILE_MISSING')),
    });

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(404);
  });

  it('allows an active guardian link to view the imported PDF', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'guardian_1', isAdmin: false });
    prismaMock.documentSubjects.findUnique.mockResolvedValue({
      userId: 'child_1',
      organizationId: 'org_1',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).toHaveBeenCalledWith({
      where: {
        parentId: 'guardian_1',
        childId: 'child_1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('allows organization staff with document import permission to view the imported PDF', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'staff_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    hasOrgPermissionMock.mockResolvedValue(true);

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(200);
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(
      { userId: 'staff_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      'documents.import',
    );
  });

  it('rejects organization staff without document import permission', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'staff_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    hasOrgPermissionMock.mockResolvedValue(false);

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(403);
    expect(getStorageProviderMock).not.toHaveBeenCalled();
  });
  it('rejects an unrelated Event registrant before reading private storage', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'unrelated_1', isAdmin: false });
    prismaMock.signedDocuments.findUnique.mockResolvedValueOnce({
      id: 'signed_imported_1',
      signedDocumentId: 'imported-file-record',
      provenance: 'IMPORTED',
      templateId: 'version_1',
      userId: null,
      documentSubjectId: 'document-subject:org_1:subject_1',
      importedFileId: 'file_1',
      documentName: 'Historical waiver',
      organizationId: 'org_1',
      eventId: 'event_1',
      teamId: null,
    });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({ id: 'registration_1' });

    const response = await GET(request(), routeParams);

    expect(response.status).toBe(403);
    expect(getStorageProviderMock).not.toHaveBeenCalled();
  });
});
