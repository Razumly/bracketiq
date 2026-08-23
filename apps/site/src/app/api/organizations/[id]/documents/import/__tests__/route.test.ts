/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  file: { create: jest.fn() },
  signedDocuments: { create: jest.fn() },
};

const prismaMock = {
  organizations: { findUnique: jest.fn() },
  templateDocuments: { findUnique: jest.fn() },
  documentRequirements: { findUnique: jest.fn() },
  userData: { findMany: jest.fn() },
  events: { findUnique: jest.fn() },
  canonicalTeams: { findUnique: jest.fn(), findMany: jest.fn() },
  teams: { findMany: jest.fn() },
  teamRegistrations: { findMany: jest.fn() },
  teamStaffAssignments: { findMany: jest.fn() },
  eventRegistrations: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const getStorageProviderMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const listOrganizationUsersScopeEventsMock = jest.fn();
const ensureDocumentSubjectMock = jest.fn();
const signedDocumentEvidenceFieldsMock = jest.fn();
const createDocumentRequirementSatisfactionMock = jest.fn();
const appendDocumentEvidenceAuditEventMock = jest.fn();
const notifyDocumentEvidenceChangeMock = jest.fn();
const validatePdfBufferMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ hasOrgPermission: hasOrgPermissionMock }));
jest.mock('@/lib/storageProvider', () => ({ getStorageProvider: getStorageProviderMock }));
jest.mock('@/server/organizationUsersAccess', () => ({
  listOrganizationUsersScopeEvents: listOrganizationUsersScopeEventsMock,
}));
jest.mock('@/server/documentEvidence', () => ({
  DOCUMENT_EVIDENCE_PROVENANCE: { IMPORTED: 'IMPORTED' },
  ensureDocumentSubject: ensureDocumentSubjectMock,
  signedDocumentEvidenceFields: signedDocumentEvidenceFieldsMock,
  createDocumentRequirementSatisfaction: createDocumentRequirementSatisfactionMock,
  appendDocumentEvidenceAuditEvent: appendDocumentEvidenceAuditEventMock,
}));
jest.mock('@/server/documentNotifications', () => ({
  notifyDocumentEvidenceChange: notifyDocumentEvidenceChangeMock,
}));
jest.mock('@/lib/pdfUploadValidation', () => ({
  validatePdfBuffer: validatePdfBufferMock,
}));

import { POST } from '@/app/api/organizations/[id]/documents/import/route';

const routeParams = { params: Promise.resolve({ id: 'org_1' }) };

const buildPdfFile = (name = 'signed.pdf'): File => new File(
  [Buffer.from('%PDF-1.7 imported')],
  name,
  { type: 'application/pdf' },
);

const buildRequest = (
  values: Record<string, string> = {},
  file: File | null = buildPdfFile(),
): NextRequest => {
  const form = new FormData();
  const defaults = {
    subjectUserId: 'player_1',
    templateId: 'version_1',
    documentName: 'Prior waiver',
    historicalSigningDate: '2026-08-01',
    sourceNote: 'Imported from the customer archive.',
    attestationAccepted: 'true',
    scopeType: 'ORGANIZATION',
    scopeId: 'org_1',
  };
  Object.entries({ ...defaults, ...values }).forEach(([key, value]) => form.append(key, value));
  if (file) form.append('file', file, file.name);
  return new NextRequest('http://localhost/api/organizations/org_1/documents/import', {
    method: 'POST',
    body: form,
  });
};

describe('POST /api/organizations/[id]/documents/import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: true,
    });
    prismaMock.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
    });
    prismaMock.userData.findMany.mockResolvedValue([{ id: 'player_1' }]);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([]);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      { id: 'event_1', userIds: ['player_1'], teamIds: [] },
    ]);
    getStorageProviderMock.mockReturnValue({
      putObject: jest.fn().mockResolvedValue({
        key: 'private/org_1/signed.pdf',
        bucket: 'private-bucket',
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    });
    validatePdfBufferMock.mockResolvedValue({ valid: true });
    signedDocumentEvidenceFieldsMock.mockImplementation((params: {
      documentSubjectUserId?: string | null;
      provenance: string;
      scopeType?: string | null;
      scopeId?: string | null;
    }) => ({
      provenance: params.provenance,
      providerDocumentId: null,
      signerUserId: null,
      documentSubjectId: `document-subject:org_1:${params.documentSubjectUserId}`,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
    }));
    ensureDocumentSubjectMock.mockResolvedValue('document-subject:org_1:player_1');
    txMock.file.create.mockResolvedValue({ id: 'file_1' });
    txMock.signedDocuments.create.mockResolvedValue({ id: 'evidence_1' });
    createDocumentRequirementSatisfactionMock.mockResolvedValue(undefined);
    appendDocumentEvidenceAuditEventMock.mockResolvedValue(undefined);
    notifyDocumentEvidenceChangeMock.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) => (
      callback(txMock)
    ));
  });

  it('stores the uploaded PDF, subject-only evidence, satisfaction, and audit event in one transaction', async () => {
    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(201);
    expect(getStorageProviderMock().putObject).toHaveBeenCalledWith(expect.objectContaining({
      originalName: 'signed.pdf',
      contentType: 'application/pdf',
      organizationId: 'org_1',
    }));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.file.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        uploaderId: 'manager_1',
        path: 'private/org_1/signed.pdf',
        mimeType: 'application/pdf',
      }),
    });
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        provenance: 'IMPORTED',
        providerDocumentId: null,
        documentSubjectId: 'document-subject:org_1:player_1',
        signerUserId: null,
        userId: null,
        status: 'SIGNED',
        scopeType: 'ORGANIZATION',
        scopeId: 'org_1',
        contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        attestationVersion: '1',
      }),
    });
    expect(ensureDocumentSubjectMock).toHaveBeenCalledWith(
      { organizationId: 'org_1', documentSubjectUserId: 'player_1' },
      expect.anything(),
    );
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: expect.any(String),
        templateDocumentId: 'version_1',
        documentRequirementId: 'requirement_1',
        requiredSignerRoles: ['participant'],
        completedSignerRoles: ['participant'],
        scopeType: 'ORGANIZATION',
        scopeId: 'org_1',
      }),
      expect.anything(),
    );
    expect(appendDocumentEvidenceAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'IMPORT',
        evidenceId: expect.any(String),
        actorUserId: 'manager_1',
      }),
      expect.anything(),
    );
    expect(notifyDocumentEvidenceChangeMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'IMPORT',
      evidenceId: expect.any(String),
      subjectUserId: 'player_1',
    }));
  });

  it('rejects a non-PDF upload before storage', async () => {
    const response = await POST(
      buildRequest({}, new File([Buffer.from('not pdf')], 'not-image.png', { type: 'image/png' })),
      routeParams,
    );

    expect(response.status).toBe(415);
    expect(validatePdfBufferMock).not.toHaveBeenCalled();
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed PDF before storage', async () => {
    validatePdfBufferMock.mockResolvedValue({ valid: false, reason: 'The PDF is incomplete.' });

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe('The PDF is incomplete.');
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('requires the explicit Document Import Attestation', async () => {
    const response = await POST(
      buildRequest({ attestationAccepted: 'false' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Attestation');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it('rejects impossible or non-date historical signing values', async () => {
    const response = await POST(
      buildRequest({ historicalSigningDate: '2024-02-30' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('historicalSigningDate must be a valid date.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });


  it('requires multipart input and a file', async () => {
    const jsonResponse = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents/import', {
        method: 'POST',
        body: JSON.stringify({ subjectUserId: 'player_1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      routeParams,
    );
    expect(jsonResponse.status).toBe(400);

    const form = new FormData();
    form.append('subjectUserId', 'player_1');
    const missingFileResponse = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents/import', {
        method: 'POST',
        body: form,
      }),
      routeParams,
    );
    expect(missingFileResponse.status).toBe(400);
  });

  it('rejects a non-sign-once version when Organization scope is selected', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('require Event Participation scope');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('accepts Event Participation scope for a non-sign-once version', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.events.findUnique.mockResolvedValue({ id: 'event_1', organizationId: 'org_1' });

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
    });
  });

  it('accepts an EventTeam snapshot through its canonical Team membership', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.events.findUnique.mockResolvedValue({ id: 'event_1', organizationId: 'org_1' });
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      { id: 'event_1', userIds: [], teamIds: ['event_team_snapshot_1'] },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        registrantId: 'event_team_snapshot_1',
        parentId: 'canonical_team_1',
        eventTeamId: 'event_team_snapshot_1',
      },
    ]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([{ id: 'canonical_team_1' }]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { teamId: 'canonical_team_1', userId: 'player_1' },
    ]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(prismaMock.teamRegistrations.findMany).toHaveBeenCalledWith(expect.objectContaining({

      where: expect.objectContaining({ teamId: { in: expect.arrayContaining(['canonical_team_1']) } }),
    }));
  });
  it('accepts an EventTeam snapshot member shown as an Organization customer', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.userData.findMany.mockResolvedValueOnce([{ id: 'snapshot_player_1' }]);
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        registrantId: 'event_team_snapshot_1',
        parentId: 'canonical_team_1',
        eventTeamId: 'event_team_snapshot_1',
      },
    ]);
    prismaMock.canonicalTeams.findMany.mockResolvedValueOnce([{ id: 'canonical_team_1' }]);
    prismaMock.teamRegistrations.findMany.mockResolvedValueOnce([]);
    prismaMock.teams.findMany.mockResolvedValueOnce([{
      playerIds: ['snapshot_player_1'],
      captainId: 'snapshot_player_1',
      managerId: '',
      headCoachId: null,
      coachIds: [],
    }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', userIds: [], teamIds: ['event_team_snapshot_1'] },
    ]);

    const response = await POST(
      buildRequest({
        subjectUserId: 'snapshot_player_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
      }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(prismaMock.teams.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['event_team_snapshot_1'] },
      }),
    }));
  });
  it('accepts an EventTeam snapshot member registration without a team-level row', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.userData.findMany.mockResolvedValueOnce([{ id: 'snapshot_player_1' }]);
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        registrantId: 'snapshot_player_1',
        parentId: 'canonical_team_1',
        eventTeamId: 'event_team_snapshot_1',
      },
    ]);
    prismaMock.canonicalTeams.findMany.mockResolvedValueOnce([{ id: 'canonical_team_1' }]);
    prismaMock.teamRegistrations.findMany.mockResolvedValueOnce([]);
    prismaMock.teams.findMany.mockResolvedValueOnce([{
      playerIds: ['snapshot_player_1'],
      captainId: 'snapshot_player_1',
      managerId: '',
      headCoachId: null,
      coachIds: [],
    }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', userIds: [], teamIds: ['event_team_snapshot_1'] },
    ]);

    const response = await POST(
      buildRequest({
        subjectUserId: 'snapshot_player_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
      }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(prismaMock.eventRegistrations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { eventTeamId: { not: null } },
        ]),
      }),
    }));
  });
  it('accepts a canonical team staff member shown as an Organization customer', async () => {
    prismaMock.userData.findMany.mockResolvedValueOnce([{ id: 'staff_1' }]);
    prismaMock.canonicalTeams.findMany.mockResolvedValueOnce([{ id: 'canonical_team_1' }]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValueOnce([
      { userId: 'staff_1' },
    ]);

    const response = await POST(
      buildRequest({ subjectUserId: 'staff_1' }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(prismaMock.teamStaffAssignments.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        teamId: { in: ['canonical_team_1'] },
      }),
    }));
  });


  it('rejects a missing customer before opening the transaction', async () => {
    prismaMock.userData.findMany.mockResolvedValue([]);

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
  });

  it('rejects a User who is not an Organization customer', async () => {
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      { id: 'event_1', userIds: ['other_player'], teamIds: [] },
    ]);

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('not a customer');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a rental Event host shown as an Organization customer', async () => {
    prismaMock.userData.findMany.mockResolvedValue([{ id: 'host_1' }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      {
        id: 'rental_event_1',
        organizationId: 'facility_1',
        userIds: [],
        teamIds: [],
        hostId: 'host_1',
        assistantHostIds: [],
        officialIds: [],
      },
    ]);

    const response = await POST(
      buildRequest({ subjectUserId: 'host_1' }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an Event owned by another Organization', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.events.findUnique.mockResolvedValue({ id: 'event_2', organizationId: 'org_2' });

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_2' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('does not belong');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a template whose Requirement belongs to another Organization', async () => {
    prismaMock.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_2',
    });

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a Team identifier as the Document Subject', async () => {
    prismaMock.userData.findMany.mockResolvedValue([{ id: 'team_1' }]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([{ id: 'team_1' }]);

    const response = await POST(
      buildRequest({ subjectUserId: 'team_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('must be a User');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns conflict and cleans up storage for an exact duplicate', async () => {
    txMock.signedDocuments.create.mockRejectedValueOnce({ code: 'P2002' });

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('already exists');
    expect(getStorageProviderMock().deleteObject).toHaveBeenCalledWith({
      key: 'private/org_1/signed.pdf',
      bucket: 'private-bucket',
    });
    expect(notifyDocumentEvidenceChangeMock).not.toHaveBeenCalled();
  });

  it('rolls back the database result and cleans up storage when satisfaction fails', async () => {
    createDocumentRequirementSatisfactionMock.mockRejectedValueOnce(new Error('Satisfaction write failed.'));

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Unable to import');
    expect(getStorageProviderMock().deleteObject).toHaveBeenCalled();
    expect(notifyDocumentEvidenceChangeMock).not.toHaveBeenCalled();
  });
  it('keeps committed evidence when notification delivery fails', async () => {
    notifyDocumentEvidenceChangeMock.mockRejectedValueOnce(new Error('Notification delivery failed.'));

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(getStorageProviderMock().deleteObject).not.toHaveBeenCalled();
  });


  it('does not accept a signer identity from import input', async () => {
    const form = buildRequest();
    const body = await form.formData();
    body.append('signerUserId', 'another_user');
    const request = new NextRequest('http://localhost/api/organizations/org_1/documents/import', {
      method: 'POST',
      body,
    });

    const response = await POST(request, routeParams);

    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ signerUserId: null, userId: null }),
    });
  });
});
