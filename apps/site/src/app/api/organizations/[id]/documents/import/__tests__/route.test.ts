/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  $queryRaw: jest.fn(),
  documentRequirements: { findUnique: jest.fn() },
  events: { findUnique: jest.fn() },
  eventRegistrations: { findMany: jest.fn() },
  teams: { findMany: jest.fn() },
  canonicalTeams: { findMany: jest.fn() },
  teamRegistrations: { findMany: jest.fn() },
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
  eventRegistrations: { findMany: jest.fn() },
  teamRegistrations: { findMany: jest.fn() },
  teamStaffAssignments: { findMany: jest.fn() },
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
const readByIdChunksMock = <T>(
  ids: string[],
  read: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> => read(ids);
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
  readByIdChunks: readByIdChunksMock,
}));
jest.mock('@/server/documentNotifications', () => ({
  notifyDocumentEvidenceChange: (...args: unknown[]) => notifyDocumentEvidenceChangeMock(...args),
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
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'City League',
    });
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'version_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: true,
    });
    prismaMock.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
    });
    txMock.$queryRaw.mockResolvedValue([{
      id: 'version_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: true,
    }]);
    txMock.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
    });
    txMock.events.findUnique.mockResolvedValue(null);
    txMock.eventRegistrations.findMany.mockResolvedValue([]);
    txMock.teams.findMany.mockResolvedValue([]);
    txMock.canonicalTeams.findMany.mockResolvedValue([]);
    txMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([{ id: 'player_1' }]);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue(null);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
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
    validatePdfBufferMock.mockResolvedValue({ isValid: true });
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
    expect(await response.json()).toEqual({
      evidenceId: expect.any(String),
      documentId: expect.stringMatching(/^imported-/),
      provenance: 'IMPORTED',
    });

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
        documentName: 'Imported Waiver',
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
        importedAt: expect.any(Date),
        uploaderId: 'manager_1',
        historicalSigningDate: new Date('2026-08-01T00:00:00.000Z'),
        sourceNote: 'Imported from the customer archive.',
        attestationText: 'I confirm that this file is a complete signed document for the shown customer, Document Template Version, and scope. I confirm that it contains all required signatures. I understand that BracketIQ did not verify the signatures.',
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
    expect(notifyDocumentEvidenceChangeMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      organizationName: 'City League',
      subjectUserId: 'player_1',
      evidenceId: expect.any(String),
      documentName: 'Imported Waiver',
      action: 'IMPORT',
      actorUserId: 'manager_1',
    });
  });
  it('keeps a committed import when notification delivery fails', async () => {
    notifyDocumentEvidenceChangeMock.mockRejectedValueOnce(new Error('Notification failed.'));

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(notifyDocumentEvidenceChangeMock).toHaveBeenCalled();
  });

  it('completes every signer role required by the selected version', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARENT_GUARDIAN_CHILD',
      signerRoles: ['parent_guardian', 'child'],
      signOnce: true,
    });
    txMock.$queryRaw.mockResolvedValueOnce([{
      id: 'version_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARENT_GUARDIAN_CHILD',
      signerRoles: ['parent_guardian', 'child'],
      signOnce: true,
    }]);

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(201);
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredSignerRoles: ['parent_guardian', 'child'],
        completedSignerRoles: ['parent_guardian', 'child'],
      }),
      expect.anything(),
    );
  });
  it('accepts a User who is a member of an Organization Event team', async () => {
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', userIds: [], teamIds: ['event_team_1'] },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        eventId: 'event_1',
        registrantId: 'event_team_1',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        eventTeamId: 'event_team_1',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValueOnce([
      {
        id: 'event_team_1',
        kind: 'TEAM',
        playerIds: ['player_1'],
        captainId: null,
        managerId: null,
        headCoachId: null,
        coachIds: [],
      },
    ]);

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(201);
    expect(prismaMock.teams.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: expect.arrayContaining(['event_team_1']) },
      }),
    }));
  });
  it('forbids staff without document import permission before reading the upload', async () => {
    hasOrgPermissionMock.mockResolvedValueOnce(false);

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(403);
    expect(prismaMock.templateDocuments.findUnique).not.toHaveBeenCalled();
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
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
  it('rejects an upload over 25 MB before PDF parsing or storage', async () => {
    const oversizedFile = new File(
      [Buffer.alloc(25 * 1024 * 1024 + 1)],
      'oversized.pdf',
      { type: 'application/pdf' },
    );

    const response = await POST(buildRequest({}, oversizedFile), routeParams);

    expect(response.status).toBe(413);
    expect(validatePdfBufferMock).not.toHaveBeenCalled();
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed PDF before storage', async () => {
    validatePdfBufferMock.mockResolvedValue({ isValid: false, reason: 'The PDF is incomplete.' });

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe('The PDF is incomplete.');
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it('rejects encrypted or password-protected PDFs before storage', async () => {
    validatePdfBufferMock.mockResolvedValue({
      isValid: false,
      reason: 'Encrypted or password-protected PDFs are not supported.',
    });
    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe(
      'Encrypted or password-protected PDFs are not supported.',
    );
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

  it.each(['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'])('accepts a non-sign-once version for an eligible, ended Event Participation in %s status', async (status) => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Event Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    txMock.$queryRaw.mockResolvedValueOnce([{
      id: 'version_1',
      title: 'Imported Event Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    }]);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      organizationId: 'org_1',
      end: new Date('2026-01-01T00:00:00.000Z'),
    });
    txMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      organizationId: 'org_1',
      end: new Date('2026-01-01T00:00:00.000Z'),
    });
    const participation = {
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'player_1',
      parentId: null,
      registrantType: 'SELF',
      status,
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    };
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([participation]);
    txMock.eventRegistrations.findMany.mockResolvedValueOnce([participation]);
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: [], teamIds: [] },
    ]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentName: 'Imported Event Waiver',
        eventId: 'event_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
      }),
    });
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
      }),
      expect.anything(),
    );
  });
  it.each(['CANCELLED', 'PAYMENT_FAILED', 'LEFT', 'REMOVED'])('rejects %s Event Participation status', async (status) => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Event Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([{
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'player_1',
      parentId: null,
      registrantType: 'SELF',
      status,
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: ['player_1'], teamIds: [] },
    ]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('eligible participation');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it('rejects an Event Participation scope outside the Organization event list', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Event Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_2', organizationId: 'org_1' });
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: ['player_1'], teamIds: [] },
    ]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_2' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('eligible participation');
    expect(prismaMock.eventRegistrations.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an Event Participation when the selected customer differs from the event registration', async () => {
    prismaMock.userData.findMany.mockResolvedValueOnce([{ id: 'player_2' }]);
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Event Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: ['player_2'], teamIds: [] },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([{
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'player_1',
      parentId: null,
      registrantType: 'SELF',
      status: 'ACTIVE',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    }]);

    const response = await POST(
      buildRequest({ subjectUserId: 'player_2', scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('eligible participation');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });


  it('accepts a player whose eligible participation comes from a registered Team', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Team Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    txMock.$queryRaw.mockResolvedValueOnce([{
      id: 'version_1',
      title: 'Imported Team Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: [], teamIds: ['event_team_1', 'event_team_2'] },
    ]);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      organizationId: 'org_1',
      end: new Date('2026-01-01T00:00:00.000Z'),
    });
    txMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      organizationId: 'org_1',
      end: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.canonicalTeams.findMany
      .mockResolvedValueOnce([])
      .mockImplementationOnce((args) => Promise.resolve(
        args.where.id.in.includes('canonical_team_1')
          ? [{ id: 'canonical_team_1' }, { id: 'canonical_team_2' }]
          : [],
      ));
    txMock.canonicalTeams.findMany.mockResolvedValueOnce([
      { id: 'canonical_team_1' },
      { id: 'canonical_team_2' },
    ]);
    const teamRegistration = {
      id: 'event_team_registration_1',
      eventId: 'event_1',
      registrantId: 'event_team_1',
      parentId: 'canonical_team_1',
      registrantType: 'TEAM',
      status: 'ACTIVE',
      eventTeamId: 'event_team_1',
      sourceTeamRegistrationId: null,
    };
    const playerRegistration = {
      id: 'event_player_registration_1',
      eventId: 'event_1',
      registrantId: 'player_1',
      parentId: 'canonical_team_1',
      registrantType: 'SELF',
      status: 'CONSENTFAILED',
      eventTeamId: 'event_team_1',
      sourceTeamRegistrationId: 'team_membership_1',
    };
    const eventTeam = {
      id: 'event_team_1',
      eventId: 'event_1',
      parentTeamId: null,
      kind: 'REGISTERED',
      playerIds: ['player_1'],
      captainId: null,
      managerId: null,
      headCoachId: null,
      coachIds: [],
    };
    const secondTeamRegistration = {
      ...teamRegistration,
      id: 'event_team_registration_2',
      registrantId: 'event_team_2',
      parentId: 'canonical_team_2',
      eventTeamId: 'event_team_2',
    };
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      teamRegistration,
      secondTeamRegistration,
      playerRegistration,
    ]);
    txMock.eventRegistrations.findMany.mockResolvedValueOnce([
      teamRegistration,
      secondTeamRegistration,
      playerRegistration,
    ]);
    const secondEventTeam = {
      ...eventTeam,
      parentTeamId: null,
      playerIds: ['player_2'],
    };
    prismaMock.teams.findMany.mockResolvedValueOnce([eventTeam, secondEventTeam]);
    txMock.teams.findMany.mockResolvedValueOnce([eventTeam, secondEventTeam]);
    prismaMock.teamRegistrations.findMany.mockResolvedValueOnce([{
      id: 'team_membership_1',
      teamId: 'canonical_team_1',
      userId: 'player_1',
      status: 'ACTIVE',
    }]);
    txMock.teamRegistrations.findMany.mockResolvedValueOnce([{
      id: 'team_membership_1',
      teamId: 'canonical_team_1',
      userId: 'player_1',
      status: 'ACTIVE',
    }]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(prismaMock.eventRegistrations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED', 'PAYMENT_FAILED', 'CANCELLED'] },
      }),
    }));
    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentSubjectId: 'document-subject:org_1:player_1',
        eventId: 'event_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
      }),
    });
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentSubjectId: 'document-subject:org_1:player_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
      }),
      expect.anything(),
    );
  });
  it('rejects a terminal player registration even when the EventTeam snapshot still lists the player', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Team Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: [], teamIds: ['event_team_1'] },
    ]);
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    prismaMock.canonicalTeams.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'canonical_team_1' }]);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'event_team_registration_1',
        eventId: 'event_1',
        registrantId: 'event_team_1',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        status: 'ACTIVE',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: null,
      },
      {
        id: 'event_player_registration_1',
        eventId: 'event_1',
        registrantId: 'player_1',
        parentId: 'canonical_team_1',
        registrantType: 'SELF',
        status: 'CANCELLED',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: 'membership_1',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValueOnce([{
      id: 'event_team_1',
      eventId: 'event_1',
      parentTeamId: 'canonical_team_1',
      kind: 'REGISTERED',
      playerIds: ['player_1'],
      captainId: null,
      managerId: null,
      headCoachId: null,
      coachIds: [],
    }]);
    prismaMock.teamRegistrations.findMany.mockResolvedValueOnce([{
      id: 'membership_1',
      teamId: 'canonical_team_1',
      userId: 'player_1',
      status: 'ACTIVE',
    }]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('eligible participation');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
  });
  it('rejects a teammate who is not in the selected Team event roster', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Team Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: [], teamIds: ['event_team_1'] },
    ]);
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    prismaMock.canonicalTeams.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'canonical_team_1' }]);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([{
      id: 'event_team_registration_1',
      eventId: 'event_1',
      registrantId: 'event_team_1',
      parentId: 'canonical_team_1',
      registrantType: 'TEAM',
      status: 'ACTIVE',
      eventTeamId: 'event_team_1',
      sourceTeamRegistrationId: null,
    }]);
    prismaMock.teams.findMany.mockResolvedValueOnce([{
      id: 'event_team_1',
      eventId: 'event_1',
      parentTeamId: 'canonical_team_1',
      kind: 'REGISTERED',
      playerIds: ['teammate_1'],
      captainId: null,
      managerId: null,
      headCoachId: null,
      coachIds: [],
    }]);
    prismaMock.teamRegistrations.findMany.mockResolvedValueOnce([{
      id: 'team_membership_1',
      teamId: 'canonical_team_1',
      userId: 'player_1',
    }]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('eligible participation');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(getStorageProviderMock().putObject).not.toHaveBeenCalled();
  });
  it('rejects removed Team membership for a new Event Participation import', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'version_1',
      title: 'Imported Team Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    });
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', organizationId: 'org_1', userIds: [], teamIds: ['event_team_1'] },
    ]);
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', organizationId: 'org_1' });
    prismaMock.canonicalTeams.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'canonical_team_1' }]);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'event_team_registration_1',
        eventId: 'event_1',
        registrantId: 'event_team_1',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        status: 'ACTIVE',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: null,
      },
      {
        id: 'event_player_registration_1',
        eventId: 'event_1',
        registrantId: 'player_1',
        parentId: 'canonical_team_1',
        registrantType: 'SELF',
        status: 'ACTIVE',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: 'membership_removed',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValueOnce([{
      id: 'event_team_1',
      eventId: 'event_1',
      parentTeamId: 'canonical_team_1',
      kind: 'REGISTERED',
      playerIds: ['player_1'],
      captainId: null,
      managerId: null,
      headCoachId: null,
      coachIds: [],
    }]);
    prismaMock.teamRegistrations.findMany.mockResolvedValueOnce([{
      id: 'membership_removed',
      teamId: 'canonical_team_1',
      userId: 'player_1',
      status: 'REMOVED',
    }]);

    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('eligible participation');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it('locks and revalidates the selected version inside the transaction', async () => {
    txMock.$queryRaw.mockResolvedValueOnce([{
      id: 'version_1',
      title: 'Imported Waiver',
      organizationId: 'org_1',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARTICIPANT',
      signerRoles: ['participant'],
      signOnce: false,
    }]);

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Unable to import document evidence.');
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.file.create).not.toHaveBeenCalled();
    expect(getStorageProviderMock().deleteObject).toHaveBeenCalledWith({
      key: 'private/org_1/signed.pdf',
      bucket: 'private-bucket',
    });
  });

  it('rejects a non-Organization scope for a sign-once version', async () => {
    const response = await POST(
      buildRequest({ scopeType: 'EVENT_PARTICIPATION', scopeId: 'event_1' }),
      routeParams,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('require Organization scope');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
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

  it('rejects an official from an Organization-owned Event who is not a customer', async () => {
    prismaMock.userData.findMany.mockResolvedValue([{ id: 'official_1' }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      {
        id: 'organization_event_1',
        organizationId: 'org_1',
        userIds: [],
        teamIds: [],
        hostId: null,
        assistantHostIds: [],
        officialIds: ['official_1'],
      },
    ]);

    const response = await POST(
      buildRequest({ subjectUserId: 'official_1' }),
      routeParams,
    );

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
  it('does not create database rows when storage upload fails', async () => {
    getStorageProviderMock().putObject.mockRejectedValueOnce(new Error('Storage unavailable.'));

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Unable to import');
    expect(getStorageProviderMock().deleteObject).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.file.create).not.toHaveBeenCalled();
    expect(txMock.signedDocuments.create).not.toHaveBeenCalled();
  });

  it('allows the same PDF bytes for a different customer', async () => {
    const firstResponse = await POST(buildRequest(), routeParams);
    expect(firstResponse.status).toBe(201);

    prismaMock.userData.findMany.mockResolvedValueOnce([{ id: 'player_2' }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValueOnce([
      { id: 'event_1', userIds: ['player_1', 'player_2'], teamIds: [] },
    ]);
    ensureDocumentSubjectMock.mockResolvedValueOnce('document-subject:org_1:player_2');
    txMock.signedDocuments.create.mockResolvedValueOnce({ id: 'evidence_2' });

    const secondResponse = await POST(
      buildRequest({ subjectUserId: 'player_2' }),
      routeParams,
    );

    expect(secondResponse.status).toBe(201);
    expect(getStorageProviderMock().putObject).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
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
  });
  it('surfaces repeated storage cleanup failure after a database rollback', async () => {
    createDocumentRequirementSatisfactionMock.mockRejectedValueOnce(new Error('Satisfaction write failed.'));
    getStorageProviderMock().deleteObject.mockRejectedValue(new Error('Storage unavailable.'));

    const response = await POST(buildRequest(), routeParams);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('Stored file cleanup failed');
    expect(getStorageProviderMock().deleteObject).toHaveBeenCalledTimes(3);
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
