/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockPrisma = {
  organizations: {
    findUnique: jest.fn(),
  },
  documentRequirements: {
    create: jest.fn(),
  },
  templateDocuments: {
    create: jest.fn(),
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

import { POST } from '@/app/api/organizations/[id]/templates/route';

describe('POST /api/organizations/[id]/templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 'staff_1' });
    mockHasOrgPermission.mockResolvedValue(true);
    mockPrisma.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    mockPrisma.documentRequirements.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);
    mockPrisma.templateDocuments.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma));
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
    const requirementData = mockPrisma.documentRequirements.create.mock.calls[0][0].data;
    const versionData = mockPrisma.templateDocuments.create.mock.calls[0][0].data;

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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
