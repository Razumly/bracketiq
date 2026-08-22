/** @jest-environment node */

import { NextRequest } from 'next/server';

const transactionPrisma = {
  documentRequirements: {
    upsert: jest.fn(),
  },
  templateDocuments: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
};
const mockPrisma = {
  organizations: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockRequireSession = jest.fn();
const mockHasOrgPermission = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: unknown[]) => mockHasOrgPermission(...args),
}));
jest.mock('@/lib/boldsignServer', () => ({
  createEmbeddedTemplateFromPdf: jest.fn(),
  isBoldSignConfigured: jest.fn(),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: { PENDING_WEBHOOK: 'PENDING_WEBHOOK' },
  BOLDSIGN_OPERATION_TYPES: { TEMPLATE_CREATE: 'TEMPLATE_CREATE' },
  createOrUpdateBoldSignOperation: jest.fn(),
}));

import { GET, POST } from '@/app/api/organizations/[id]/templates/route';

describe('/api/organizations/[id]/templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 'staff_1' });
    mockHasOrgPermission.mockResolvedValue(true);
    mockPrisma.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    transactionPrisma.documentRequirements.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) => ({
        id: create.id,
        organizationId: create.organizationId,
      }),
    );
    transactionPrisma.templateDocuments.findFirst.mockResolvedValue(null);
    transactionPrisma.$queryRaw.mockResolvedValue([{ id: 'locked_requirement' }]);
    transactionPrisma.templateDocuments.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => data,
    );
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionPrisma) => unknown) => callback(transactionPrisma),
    );
  });

  it('returns only the latest Version per Requirement for installed mobile clients', async () => {
    mockPrisma.templateDocuments.findMany.mockResolvedValue([
      { id: 'version_2', documentRequirementId: 'requirement_1', versionSequence: 2 },
      { id: 'version_1', documentRequirementId: 'requirement_1', versionSequence: 1 },
      { id: 'version_3', documentRequirementId: 'requirement_2', versionSequence: 1 },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/templates'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).templates).toEqual([
      expect.objectContaining({ id: 'version_2' }),
      expect.objectContaining({ id: 'version_3' }),
    ]);
  });

  it('returns every Version when the web manager requests version history', async () => {
    mockPrisma.templateDocuments.findMany.mockResolvedValue([
      { id: 'version_2', documentRequirementId: 'requirement_1', versionSequence: 2 },
      { id: 'version_1', documentRequirementId: 'requirement_1', versionSequence: 1 },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/templates?includeVersions=true'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).templates).toEqual([
      expect.objectContaining({ id: 'version_2' }),
      expect.objectContaining({ id: 'version_1' }),
    ]);
  });

  it('creates the first text version with one stable requirement in one transaction', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'staff_1',
          template: {
            title: 'Photo waiver',
            description: 'Event photography consent',
            type: 'TEXT',
            content: 'I agree to the photo policy.',
          },
        }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(201);
    const requirementData = transactionPrisma.documentRequirements.upsert.mock.calls[0][0].create;
    const versionData = transactionPrisma.templateDocuments.create.mock.calls[0][0].data;

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionPrisma.documentRequirements.upsert).toHaveBeenCalledTimes(1);
    expect(transactionPrisma.templateDocuments.findFirst).toHaveBeenCalledWith({
      where: { documentRequirementId: requirementData.id },
      orderBy: { versionSequence: 'desc' },
      select: { versionSequence: true },
    });
    expect(transactionPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(requirementData).toEqual(expect.objectContaining({
      organizationId: 'org_1',
      title: 'Photo waiver',
      status: 'ACTIVE',
    }));
    expect(versionData).toEqual(expect.objectContaining({
      organizationId: 'org_1',
      title: 'Photo waiver',
      type: 'TEXT',
      versionSequence: 1,
      documentRequirementId: requirementData.id,
    }));
  });
});
