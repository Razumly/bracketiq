/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  documentSubjects: {
    findMany: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  teamRegistrations: {
    findMany: jest.fn(),
  },
  teamStaffAssignments: {
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  documentRequirementSatisfactions: {
    findMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET } from '@/app/api/profile/documents/route';

describe('GET /api/profile/documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    prismaMock.documentSubjects.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'user@example.com' });
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        start: new Date('2026-03-01T10:00:00.000Z'),
        organizationId: 'org_1',
        requiredTemplateIds: ['tmpl_1'],
        userIds: ['user_1'],
        teamIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_1',
        organizationId: 'org_1',
        title: 'Minor 7 Parent Waiver',
        type: 'PDF',
        versionSequence: 1,
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
        content: null,
        documentRequirement: {
          title: 'Minor 7 Parent Waiver',
        },
      },
    ]);
    prismaMock.organizations.findMany.mockResolvedValue([
      {
        id: 'org_1',
        name: 'Soccer Club',
      },
    ]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
  });

  it('does not treat a revoked raw document as requirement completion', async () => {
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_old',
        signedDocumentId: 'doc_signed_1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        signerRole: 'participant',
        status: 'SIGNED',
        signedAt: '2026-03-01T12:00:00.000Z',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
      {
        id: 'revoked_new',
        signedDocumentId: 'doc_revoked_1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        signerRole: 'participant',
        status: 'REVOKED',
        signedAt: null,
        createdAt: new Date('2026-03-02T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.unsigned).toEqual([
      expect.objectContaining({
        eventId: 'event_1',
        templateId: 'tmpl_1',
        status: 'UNSIGNED',
      }),
    ]);
    expect(json.signed).toEqual([]);
  });

  it('keeps normal signed documents visible when they are not revoked', async () => {
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      {
        id: 'document-subject:org_1:user_1',
        userId: 'user_1',
        organizationId: 'org_1',
      },
    ]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([
      {
        documentSubjectId: 'document-subject:org_1:user_1',
        templateDocumentId: 'tmpl_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
        status: 'SATISFIED',
        isComplete: true,
        sourceEvidenceId: 'signed_1',
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_1',
        signedDocumentId: 'doc_signed_1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        signerRole: 'participant',
        status: 'SIGNED',
        signedAt: '2026-03-01T12:00:00.000Z',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.viewerUserId).toBe('user_1');
    expect(json.unsigned).toEqual([]);
    expect(json.signed).toHaveLength(1);
    expect(json.signed[0]).toEqual(expect.objectContaining({
      id: 'signed_1',
      status: 'SIGNED',
      templateId: 'tmpl_1',
    }));
  });

  it('does not treat a raw signed document as requirement completion', async () => {
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_without_satisfaction',
        signedDocumentId: 'doc_signed_2',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        signerRole: 'participant',
        status: 'SIGNED',
        signedAt: '2026-03-01T12:00:00.000Z',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.unsigned).toEqual([
      expect.objectContaining({
        eventId: 'event_1',
        templateId: 'tmpl_1',
        status: 'UNSIGNED',
      }),
    ]);
    expect(json.signed).toHaveLength(1);
  });
  it('does not re-offer a completed parent signer in a partial child document', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'guardian_1', isAdmin: false });
    prismaMock.parentChildLinks.findMany
      .mockResolvedValueOnce([{ childId: 'child_1' }])
      .mockResolvedValueOnce([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'registration_1',
        eventId: 'event_1',
        parentId: 'guardian_1',
        registrantId: 'child_1',
        registrantType: 'CHILD',
        rosterRole: 'PARTICIPANT',
        status: 'STARTED',
        consentStatus: 'APPROVED',
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'child_1', firstName: 'Child', lastName: 'One', dateOfBirth: new Date('2015-01-01') },
    ]);
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      { id: 'document-subject:org_1:child_1', userId: 'child_1', organizationId: 'org_1' },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_1',
        organizationId: 'org_1',
        title: 'Minor 7 Parent Waiver',
        type: 'PDF',
        signOnce: false,
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        content: null,
      },
    ]);
    prismaMock.documentRequirementSatisfactions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          documentSubjectId: 'document-subject:org_1:child_1',
          templateDocumentId: 'tmpl_1',
          scopeType: 'EVENT_PARTICIPATION',
          scopeId: 'event_1',
          completedSignerRoles: ['parent_guardian'],
        },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.unsigned).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'tmpl_1',
        signerContext: 'parent_guardian',
        childUserId: 'child_1',
      }),
    ]));
  });
  it('shows a subject-only imported document through its Document Subject', async () => {
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      { id: 'document-subject:org_1:user_1', userId: 'user_1', organizationId: 'org_1' },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'imported_subject_only',
        signedDocumentId: 'imported-file-1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        organizationId: 'org_1',
        importedFileId: 'file_imported_subject_only',
        importedAt: new Date('2026-03-02T12:00:00.000Z'),
        provenance: 'IMPORTED',
        sourceNote: 'Private migration note',
        attestationVersion: 'private-version',
        uploaderId: 'private-uploader',
        attestationText: 'Private attestation',
        contentHash: 'private-content-hash',
        importedBy: 'staff_1',
        signerRole: null,
        status: 'SIGNED',
        signedAt: '2026-03-01T12:00:00.000Z',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signed).toEqual([
      expect.objectContaining({
        id: 'imported_subject_only',
        signedDocumentRecordId: 'imported_subject_only',
        viewUrl: '/api/documents/signed/imported_subject_only/file',
      }),
    ]);
    expect(json.signed[0]).not.toHaveProperty('sourceNote');
    expect(json.signed[0]).not.toHaveProperty('attestationText');
    expect(json.signed[0]).not.toHaveProperty('contentHash');
    expect(json.signed[0]).not.toHaveProperty('importedBy');
    expect(json.signed[0]).not.toHaveProperty('importedFileId');
    expect(json.signed[0]).not.toHaveProperty('attestationVersion');
    expect(json.signed[0]).not.toHaveProperty('uploaderId');
    expect(json.signed[0]).not.toHaveProperty('importedAt');
    expect(json.signed[0]).not.toHaveProperty('auditTrail');
  });
  it('hides imported metadata when the subject belongs to another organization', async () => {
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      {
        id: 'document-subject:org_2:user_1',
        userId: 'user_1',
        organizationId: 'org_2',
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'imported_cross_org',
        signedDocumentId: 'imported-cross-org-file',
        templateId: 'tmpl_1',
        eventId: null,
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_2:user_1',
        organizationId: 'org_1',
        importedFileId: 'file_imported_cross_org',
        provenance: 'IMPORTED',
        signerRole: null,
        status: 'SIGNED',
        signedAt: null,
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signed).toEqual([]);
    expect(json.voided).toEqual([]);
  });
  it('hides imported metadata when the evidence has no organization', async () => {
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      {
        id: 'document-subject:org_1:user_1',
        userId: 'user_1',
        organizationId: 'org_1',
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'imported_missing_organization',
        signedDocumentId: 'imported-missing-organization-file',
        templateId: 'tmpl_1',
        eventId: null,
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        organizationId: null,
        importedFileId: 'file_imported_missing_organization',
        provenance: 'IMPORTED',
        signerRole: null,
        status: 'SIGNED',
        signedAt: null,
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signed).toEqual([]);
    expect(json.voided).toEqual([]);
  });

  it('shows a guardian-signed child import to the linked guardian', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'guardian_1', isAdmin: false });
    prismaMock.parentChildLinks.findMany
      .mockResolvedValueOnce([{ childId: 'child_1' }])
      .mockResolvedValueOnce([]);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'child_1', firstName: 'Child', lastName: 'One', dateOfBirth: new Date('2015-01-01') },
    ]);
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      { id: 'document-subject:org_1:child_1', userId: 'child_1', organizationId: 'org_1' },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'imported_guardian_child',
        signedDocumentId: 'imported-file-2',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        teamId: null,
        userId: 'guardian_1',
        hostId: 'child_1',
        documentSubjectId: 'document-subject:org_1:child_1',
        organizationId: 'org_1',
        importedFileId: 'file_imported_guardian_child',
        provenance: 'IMPORTED',
        signerRole: 'parent_guardian',
        status: 'SIGNED',
        signedAt: '2026-03-02T12:00:00.000Z',
        createdAt: new Date('2026-03-02T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signed).toEqual([
      expect.objectContaining({
        id: 'imported_guardian_child',
        childUserId: 'child_1',
        signerContext: 'parent_guardian',
      }),
    ]);
  });
  it('returns imported void status, provenance, and stable import-order history', async () => {
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      { id: 'document-subject:org_1:user_1', userId: 'user_1', organizationId: 'org_1' },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'imported_void',
        signedDocumentId: 'imported-file-void',
        templateId: 'tmpl_1',
        eventId: null,
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        organizationId: 'org_1',
        importedFileId: 'file_imported_void',
        provenance: 'IMPORTED',
        signerRole: null,
        status: 'VOID',
        signedAt: null,
        historicalSigningDate: null,
        importedAt: new Date('2026-03-03T12:00:00.000Z'),
        createdAt: new Date('2026-03-03T12:00:00.000Z'),
      },
      {
        id: 'imported_void_without_import_time',
        signedDocumentId: 'imported-file-void-without-import-time',
        templateId: 'tmpl_1',
        eventId: null,
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        organizationId: 'org_1',
        importedFileId: 'file_imported_void_without_import_time',
        provenance: 'IMPORTED',
        signerRole: null,
        status: 'VOID',
        signedAt: null,
        historicalSigningDate: new Date('2026-03-05T12:00:00.000Z'),
        importedAt: null,
        createdAt: new Date('2026-03-05T12:00:00.000Z'),
      },
      {
        id: 'imported_void_older_history',
        signedDocumentId: 'imported-file-void-older-history',
        templateId: 'tmpl_1',
        eventId: null,
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        organizationId: 'org_1',
        importedFileId: 'file_imported_void_older_history',
        provenance: 'IMPORTED',
        signerRole: null,
        status: 'VOID',
        signedAt: null,
        historicalSigningDate: new Date('2024-01-01T12:00:00.000Z'),
        importedAt: new Date('2026-03-04T12:00:00.000Z'),
        createdAt: new Date('2026-03-04T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signed).toEqual([]);
    expect(json.voided.map((document: { id: string }) => document.id)).toEqual([
      'imported_void_without_import_time',
      'imported_void_older_history',
      'imported_void',
    ]);
    expect(json.voided[0]).not.toHaveProperty('importedAt');
  });
  it('fails when an imported document has no stored file relation', async () => {
    prismaMock.documentSubjects.findMany.mockResolvedValue([
      { id: 'document-subject:org_1:user_1', userId: 'user_1', organizationId: 'org_1' },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'imported_missing_file',
        signedDocumentId: 'imported-missing-file',
        templateId: 'tmpl_1',
        eventId: null,
        teamId: null,
        userId: null,
        hostId: null,
        documentSubjectId: 'document-subject:org_1:user_1',
        organizationId: 'org_1',
        provenance: 'IMPORTED',
        status: 'SIGNED',
        signedAt: null,
        createdAt: new Date('2026-03-04T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Imported document metadata is incomplete.');
  });
});
