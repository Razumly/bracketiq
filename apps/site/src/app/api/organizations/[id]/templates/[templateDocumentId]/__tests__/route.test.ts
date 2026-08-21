/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockPrisma = {
  organizations: { findUnique: jest.fn() },
  templateDocuments: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const transactionPrisma = {
  documentRequirements: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
  events: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  canonicalTeams: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};
const mockRequireSession = jest.fn();
const mockHasOrgPermission = jest.fn();
const mockDeleteTemplate = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: unknown[]) => mockHasOrgPermission(...args),
}));
jest.mock('@/lib/boldsignServer', () => ({
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  isBoldSignConfigured: jest.fn(() => true),
  isBoldSignForbiddenError: jest.fn(() => false),
  isBoldSignInvalidTemplateIdError: jest.fn(() => false),
  isBoldSignNotFoundError: jest.fn(() => false),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_RECONCILE: 'PENDING_RECONCILE',
  },
  BOLDSIGN_OPERATION_TYPES: {
    TEMPLATE_DELETE: 'TEMPLATE_DELETE',
  },
  createOrUpdateBoldSignOperation: jest.fn(),
}));

import { DELETE, PATCH } from '@/app/api/organizations/[id]/templates/[templateDocumentId]/route';

const baseTemplate = {
  id: 'version_1',
  organizationId: 'org_1',
  documentRequirementId: 'requirement_1',
  versionSequence: 1,
  frozenAt: new Date('2026-08-21T00:00:00.000Z'),
  type: 'TEXT',
  templateId: null,
  title: 'Waiver',
  description: null,
  signOnce: false,
  requiredSignerType: 'PARTICIPANT',
  status: 'ACTIVE',
  createdBy: 'staff_1',
  roleIndex: 0,
  roleIndexes: [],
  signerRoles: [],
  content: 'Old text',
};

const request = (method: 'DELETE' | 'PATCH', body?: Record<string, unknown>) => new NextRequest(
  'http://localhost/api/organizations/org_1/templates/version_1',
  {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  },
);

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireSession.mockResolvedValue({ userId: 'staff_1' });
  mockHasOrgPermission.mockResolvedValue(true);
  mockPrisma.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
  transactionPrisma.$queryRaw.mockResolvedValue([baseTemplate]);
  mockPrisma.$transaction.mockImplementation(
    async (callback: (tx: typeof transactionPrisma) => unknown) => callback(transactionPrisma),
  );
});

describe('Document Template Version item routes', () => {
  it('rejects deletion of a frozen Version before any provider or local delete', async () => {
    mockPrisma.templateDocuments.findUnique.mockResolvedValue(baseTemplate);

    const response = await DELETE(request('DELETE'), {
      params: Promise.resolve({ id: 'org_1', templateDocumentId: 'version_1' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({ frozen: true }));
    expect(mockDeleteTemplate).not.toHaveBeenCalled();
  });

  it('updates frozen Version metadata without creating or mutating a Version', async () => {
    mockPrisma.templateDocuments.findUnique.mockResolvedValue(baseTemplate);
    transactionPrisma.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
      title: 'Waiver',
      description: null,
    });
    transactionPrisma.documentRequirements.update.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
      title: 'Updated waiver',
      description: null,
    });

    const response = await PATCH(request('PATCH', { title: 'Updated waiver' }), {
      params: Promise.resolve({ id: 'org_1', templateDocumentId: 'version_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.newVersionCreated).toBe(false);
    expect(body.previousVersionId).toBeNull();
    expect(body.requirement).toEqual(expect.objectContaining({ title: 'Updated waiver' }));
    expect(transactionPrisma.documentRequirements.update).toHaveBeenCalledTimes(1);
    expect(transactionPrisma.templateDocuments.update).not.toHaveBeenCalled();
    expect(transactionPrisma.templateDocuments.create).not.toHaveBeenCalled();
    expect(body.template).toEqual(expect.objectContaining({
      id: 'version_1',
      title: 'Waiver',
      description: null,
      templateId: null,
      type: 'TEXT',
      content: 'Old text',
      signerRoles: [],
      roleIndexes: [],
    }));
  });


  it('creates the next Version when a referenced TEXT Version is edited', async () => {
    const current = { ...baseTemplate, frozenAt: null };
    mockPrisma.templateDocuments.findUnique.mockResolvedValue(current);
    transactionPrisma.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ id: 'event_1' }])
      .mockResolvedValueOnce([{ id: 'requirement_1' }]);
    transactionPrisma.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
      title: 'Waiver',
      description: null,
    });
    transactionPrisma.templateDocuments.findFirst.mockResolvedValue({ versionSequence: 1 });
    transactionPrisma.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    transactionPrisma.templateDocuments.create.mockImplementation(async ({ data }) => data);

    const response = await PATCH(request('PATCH', {
      content: 'New text',
      title: 'Updated waiver',
    }), {
      params: Promise.resolve({ id: 'org_1', templateDocumentId: 'version_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.newVersionCreated).toBe(true);
    expect(body.previousVersionId).toBe('version_1');
    expect(body.template).toEqual(expect.objectContaining({
      documentRequirementId: 'requirement_1',
      versionSequence: 2,
      content: 'New text',
    }));
    expect(transactionPrisma.templateDocuments.create).toHaveBeenCalledTimes(1);
  });

  it('creates the next Version when a referenced PDF Version is edited', async () => {
    const current = {
      ...baseTemplate,
      type: 'PDF',
      templateId: 'bold_template_1',
      frozenAt: null,
      content: null,
      roleIndex: 1,
      roleIndexes: [1],
      signerRoles: ['participant'],
    };
    mockPrisma.templateDocuments.findUnique.mockResolvedValue(current);
    transactionPrisma.$queryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ id: 'team_1' }])
      .mockResolvedValueOnce([{ id: 'requirement_1' }]);
    transactionPrisma.documentRequirements.findUnique.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
      title: 'Waiver',
      description: null,
    });
    transactionPrisma.documentRequirements.update.mockResolvedValue({
      id: 'requirement_1',
      organizationId: 'org_1',
      title: 'Waiver',
      description: null,
    });
    transactionPrisma.templateDocuments.findFirst.mockResolvedValue({ versionSequence: 1 });
    transactionPrisma.templateDocuments.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    transactionPrisma.templateDocuments.create.mockImplementation(async ({ data }) => data);

    const pdfResponse = await PATCH(request('PATCH', {
      templateId: 'bold_template_2',
      signerRoles: ['participant', 'guardian'],
      roleIndexes: [1, 2],
    }), {
      params: Promise.resolve({ id: 'org_1', templateDocumentId: 'version_1' }),
    });
    const pdfBody = await pdfResponse.json();

    expect(pdfResponse.status).toBe(200);
    expect(pdfBody.newVersionCreated).toBe(true);
    expect(pdfBody.previousVersionId).toBe('version_1');
    expect(pdfBody.template).toEqual(expect.objectContaining({
      id: expect.not.stringMatching(/^version_1$/),
      documentRequirementId: 'requirement_1',
      versionSequence: 2,
      templateId: 'bold_template_2',
      type: 'PDF',
      roleIndexes: [1, 2],
      signerRoles: ['participant', 'guardian'],
    }));
    expect(transactionPrisma.events.update).not.toHaveBeenCalled();
    expect(transactionPrisma.canonicalTeams.update).not.toHaveBeenCalled();
    expect(transactionPrisma.timeSlots.update).not.toHaveBeenCalled();
  });
});
