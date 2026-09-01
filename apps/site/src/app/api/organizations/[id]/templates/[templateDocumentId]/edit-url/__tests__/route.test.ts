/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockPrisma = {
  organizations: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockLatestVersionFindFirst = jest.fn();
const mockRequireSession = jest.fn();
const mockHasOrgPermission = jest.fn();
const mockCloneEmbeddedTemplate = jest.fn();
const mockDeleteTemplate = jest.fn();
const mockIsBoldSignConfigured = jest.fn();
const mockCreateOrUpdateBoldSignOperation = jest.fn();
const mockLockDocumentTemplateVersionForUpdate = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/permissions', () => ({ requireSession: mockRequireSession }));
jest.mock('@/server/accessControl', () => ({ hasOrgPermission: mockHasOrgPermission }));
jest.mock('@/lib/boldsignServer', () => ({
  cloneEmbeddedTemplate: mockCloneEmbeddedTemplate,
  deleteTemplate: mockDeleteTemplate,
  isBoldSignConfigured: mockIsBoldSignConfigured,
  isBoldSignForbiddenError: jest.fn(() => false),
  isBoldSignInvalidTemplateIdError: jest.fn(() => false),
  isBoldSignNotFoundError: jest.fn(() => false),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_WEBHOOK: 'PENDING_WEBHOOK',
  },
  BOLDSIGN_OPERATION_TYPES: {
    TEMPLATE_CREATE: 'TEMPLATE_CREATE',
  },
  createOrUpdateBoldSignOperation: mockCreateOrUpdateBoldSignOperation,
}));
jest.mock('@/server/documents/documentTemplateVersions', () => ({
  DocumentTemplateVersionNotFoundError: class DocumentTemplateVersionNotFoundError extends Error {},
  lockDocumentTemplateVersionForUpdate: mockLockDocumentTemplateVersionForUpdate,
}));

import { GET } from '../route';

describe('template edit URL route', () => {
  const template = {
    id: 'version_1',
    organizationId: 'org_1',
    type: 'PDF',
    templateId: 'bold_template_1',
    documentRequirementId: 'requirement_1',
    versionSequence: 1,
    frozenAt: null,
    roleIndex: 1,
    roleIndexes: [1, 2],
    signerRoles: ['participant', 'guardian'],
    signOnce: false,
    requiredSignerType: 'PARTICIPANT',
    createdBy: 'manager_1',
    title: 'Photo waiver',
    description: 'Waiver description',
    documentRequirement: {
      title: 'Photo waiver',
      description: 'Waiver description',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 'manager_1' });
    mockPrisma.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    mockPrisma.templateDocuments.findUnique.mockResolvedValue(template);
    mockHasOrgPermission.mockResolvedValue(true);
    mockIsBoldSignConfigured.mockReturnValue(true);
    mockLatestVersionFindFirst.mockResolvedValue({ versionSequence: 2 });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback({
      templateDocuments: {
        findFirst: mockLatestVersionFindFirst,
      },
    }));
    mockLockDocumentTemplateVersionForUpdate.mockResolvedValue({
      isFrozen: false,
      version: template,
    });
    mockCloneEmbeddedTemplate.mockResolvedValue({
      templateId: 'bold_template_clone_1',
      editUrl: 'https://app.boldsign.com/templates/edit/bold_template_clone_1',
    });
    mockCreateOrUpdateBoldSignOperation.mockResolvedValue({ id: 'operation_1' });
  });

  it('opens the cloned template without changing the selected version', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/templates/version_1/edit-url'),
      { params: Promise.resolve({ id: 'org_1', templateDocumentId: 'version_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      editUrl: 'https://app.boldsign.com/templates/edit/bold_template_clone_1',
      selectedVersion: 1,
      frozen: false,
      willCreateNewVersion: true,
      nextVersionSequence: 3,
      operationId: 'operation_1',
      templateId: 'bold_template_clone_1',
    });
    expect(mockCloneEmbeddedTemplate).toHaveBeenCalledWith({ templateId: 'bold_template_1' });
    expect(mockCreateOrUpdateBoldSignOperation).toHaveBeenCalledWith(expect.objectContaining({
      templateDocumentId: expect.any(String),
      templateId: 'bold_template_clone_1',
      payload: expect.objectContaining({
        sourceTemplateDocumentId: 'version_1',
        sourceTemplateId: 'bold_template_1',
        deferProjectionUntilEdit: true,
      }),
    }));
    const operation = mockCreateOrUpdateBoldSignOperation.mock.calls[0][0];
    expect(operation.payload.templateDocumentId).toBe(operation.templateDocumentId);
  });

  it('marks a frozen selected version as creating a new version', async () => {
    mockLockDocumentTemplateVersionForUpdate.mockResolvedValue({
      isFrozen: true,
      version: { ...template, frozenAt: new Date('2026-08-20T12:00:00.000Z') },
    });

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/templates/version_1/edit-url'),
      { params: Promise.resolve({ id: 'org_1', templateDocumentId: 'version_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      frozen: true,
      willCreateNewVersion: true,
      selectedVersion: 1,
      nextVersionSequence: 3,
    });
    expect(mockLockDocumentTemplateVersionForUpdate).toHaveBeenCalledWith(expect.anything(), 'version_1');
    expect(mockCloneEmbeddedTemplate).toHaveBeenCalledTimes(1);
  });
});
