/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  canonicalTeams: {
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  documentSubjects: {
    upsert: jest.fn(),
  },
  documentRequirementSatisfactions: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  signedDocuments: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
  },
  documentRequirements: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  teamRegistrations: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const syncChildRegistrationConsentStatusMock = jest.fn();
const findLatestBoldSignOperationMock = jest.fn();
const createOrUpdateBoldSignOperationMock = jest.fn();
const updateBoldSignOperationByIdMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/childConsentProgress', () => ({
  syncChildRegistrationConsentStatus: syncChildRegistrationConsentStatusMock,
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_WEBHOOK: 'PENDING_WEBHOOK',
  },
  BOLDSIGN_OPERATION_TYPES: {
    DOCUMENT_SEND: 'DOCUMENT_SEND',
  },
  findLatestBoldSignOperation: (...args: any[]) => findLatestBoldSignOperationMock(...args),
  createOrUpdateBoldSignOperation: (...args: any[]) => createOrUpdateBoldSignOperationMock(...args),
  updateBoldSignOperationById: (...args: any[]) => updateBoldSignOperationByIdMock(...args),
}));

import { POST } from '@/app/api/documents/record-signature/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/documents/record-signature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    requireSessionMock.mockResolvedValue({ userId: 'parent_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
    });
    prismaMock.canonicalTeams.findUnique.mockResolvedValue(null);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      templateId: 'template_1',
      organizationId: 'org_1',
      userId: 'parent_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      hostId: 'child_1',
      eventId: 'event_1',
      teamId: null,
      scopeType: 'EVENT_PARTICIPATION',
      scopeId: 'event_1',
      status: 'UNSIGNED',
      signedAt: null,
      signerRole: 'parent_guardian',
    });
    prismaMock.signedDocuments.create.mockResolvedValue({ id: 'signed_1' });
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'template_1',
      organizationId: 'org_1',
      signOnce: false,
      type: 'TEXT',
      documentRequirementId: 'requirement_1',
      signerRoles: ['parent_guardian'],
    });
    prismaMock.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findFirst.mockResolvedValue(null);
    syncChildRegistrationConsentStatusMock.mockResolvedValue(undefined);
    findLatestBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      operationType: 'DOCUMENT_SEND',
      status: 'PENDING_WEBHOOK',
      payload: {},
      templateDocumentId: 'template_1',
      eventId: 'event_1',
      teamId: null,
      documentId: 'document_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerRole: 'parent_guardian',
    });
    createOrUpdateBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      status: 'PENDING_WEBHOOK',
      payload: {},
      templateDocumentId: 'template_1',
      eventId: 'event_1',
    });
    updateBoldSignOperationByIdMock.mockResolvedValue(undefined);
  });

  it('acknowledges PDF callbacks without mutating signedDocuments directly', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'template_1',
      organizationId: 'org_1',
      signOnce: false,
      type: 'PDF',
      documentRequirementId: 'requirement_1',
      signerRoles: ['parent_guardian'],
    });
    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'PDF',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      ok: true,
      operationId: 'op_1',
      syncStatus: 'PENDING_WEBHOOK',
    }));
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
    expect(prismaMock.signedDocuments.update).not.toHaveBeenCalled();
    expect(syncChildRegistrationConsentStatusMock).not.toHaveBeenCalled();
    expect(updateBoldSignOperationByIdMock).toHaveBeenCalled();
  });

  it('transitions only a server-issued text acknowledgement to signed', async () => {
    await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(prismaMock.signedDocuments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'signed_1' },
        data: expect.objectContaining({
          status: 'SIGNED',
          signedAt: expect.any(String),
        }),
      }),
    );
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
  });
  it('writes the signed document and consent sync through one transaction client', async () => {
    const transaction = {
      ...prismaMock,
      signedDocuments: {
        ...prismaMock.signedDocuments,
        update: jest.fn().mockResolvedValue({ id: 'signed_1', status: 'SIGNED' }),
      },
    };
    const transactionRunner = jest.fn(
      async (callback: (client: typeof transaction) => Promise<void>) =>
        callback(transaction),
    );
    (prismaMock as typeof prismaMock & {
      $transaction: typeof transactionRunner;
    }).$transaction = transactionRunner;
    syncChildRegistrationConsentStatusMock.mockImplementationOnce(
      async (params: { client?: unknown }) => {
        expect(params.client).toBe(transaction);
      },
    );

    await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));

    expect(transactionRunner).toHaveBeenCalledTimes(1);
    expect(transaction.signedDocuments.update).toHaveBeenCalled();
    expect(prismaMock.signedDocuments.update).not.toHaveBeenCalled();
  });


  it('derives required roles from the template signer type when roles are absent', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'template_1',
      organizationId: 'org_1',
      signOnce: false,
      type: 'TEXT',
      documentRequirementId: 'requirement_1',
      requiredSignerType: 'PARENT_GUARDIAN',
      signerRoles: [],
    });

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(response.status).toBe(200);
    expect(prismaMock.documentRequirementSatisfactions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          requiredSignerRoles: ['Parent/Guardian'],
        }),
      }),
    );
  });

  it('does not downgrade an already signed text row when receiving another text callback', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      templateId: 'template_1',
      organizationId: 'org_1',
      userId: 'parent_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      hostId: 'child_1',
      eventId: 'event_1',
      teamId: null,
      scopeType: 'EVENT_PARTICIPATION',
      scopeId: 'event_1',
      status: 'SIGNED',
      signedAt: '2026-03-01T01:02:03.000Z',
      signerRole: 'parent_guardian',
    });

    await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(prismaMock.signedDocuments.update).not.toHaveBeenCalled();
  });

  it('syncs all pending/active child registrations when a sign-once text template is signed', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'template_1',
      organizationId: 'org_1',
      signOnce: true,
      type: 'TEXT',
      documentRequirementId: 'requirement_1',
      signerRoles: ['parent_guardian'],
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      { eventId: 'event_1', parentId: 'parent_1' },
      { eventId: 'event_2', parentId: 'parent_1' },
      { eventId: 'event_2', parentId: 'parent_1' },
      { eventId: 'event_3', parentId: null },
    ]);
    prismaMock.signedDocuments.findFirst.mockResolvedValueOnce({
      id: 'signed_1',
      templateId: 'template_1',
      organizationId: 'org_1',
      userId: 'parent_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      hostId: 'child_1',
      eventId: 'event_1',
      teamId: null,
      scopeType: 'ORGANIZATION',
      scopeId: 'org_1',
      status: 'UNSIGNED',
      signedAt: null,
      signerRole: 'parent_guardian',
    });

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(response.status).toBe(200);
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledTimes(3);
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      childUserId: 'child_1',
      parentUserId: 'parent_1',
      client: prismaMock,
    });
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_2',
      childUserId: 'child_1',
      parentUserId: 'parent_1',
      client: prismaMock,
    });
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_3',
      childUserId: 'child_1',
      parentUserId: undefined,
      client: prismaMock,
    });
  });

  it('rejects a caller-defined text document that was never issued by a scoped signing flow', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValueOnce(null);

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'forged_text_document',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('server-issued');
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
    expect(syncChildRegistrationConsentStatusMock).not.toHaveBeenCalled();
  });

  it('rejects evidence from a different Organization before changing it', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      templateId: 'template_1',
      organizationId: 'org_2',
      userId: 'parent_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_2:child_1',
      hostId: 'child_1',
      eventId: 'event_1',
      teamId: null,
      scopeType: 'EVENT_PARTICIPATION',
      scopeId: 'event_1',
      status: 'UNSIGNED',
    });

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.signedDocuments.update).not.toHaveBeenCalled();
  });

  it('rejects a callback whose Event or Team scope differs from existing evidence', async () => {
    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_2',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.signedDocuments.update).not.toHaveBeenCalled();
  });

  it('repairs missing evidence Organization only when an owned Event proves it', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      templateId: 'template_1',
      organizationId: null,
      userId: 'parent_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      hostId: 'child_1',
      eventId: 'event_1',
      teamId: null,
      scopeType: 'EVENT_PARTICIPATION',
      scopeId: 'event_1',
      status: 'UNSIGNED',
    });

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));

    expect(response.status).toBe(200);
    expect(prismaMock.signedDocuments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org_1' }),
      }),
    );
  });

  it('rejects missing Organization evidence when no owned scope can repair it', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      templateId: 'template_1',
      organizationId: null,
      userId: 'parent_1',
      signerUserId: 'parent_1',
      documentSubjectId: 'document-subject:org_1:child_1',
      hostId: 'child_1',
      eventId: null,
      teamId: null,
      scopeType: null,
      scopeId: null,
      status: 'UNSIGNED',
    });

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: 'Unable to derive Organization ownership for this evidence.',
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns a client error when Satisfaction fails', async () => {
    prismaMock.documentRequirementSatisfactions.upsert.mockRejectedValue(
      new Error('Satisfaction write failed.'),
    );

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      type: 'TEXT',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'Satisfaction write failed.' }),
    );
    expect(syncChildRegistrationConsentStatusMock).not.toHaveBeenCalled();
  });
});
