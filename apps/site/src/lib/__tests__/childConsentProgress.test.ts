/** @jest-environment node */

const prismaMock = {
  $executeRaw: jest.fn(),
  eventRegistrations: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  documentRequirementSatisfactions: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';

describe('syncChildRegistrationConsentStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      id: 'registration_1',
      parentId: 'parent_1',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      organizationId: 'org_1',
      requiredTemplateIds: ['template_1'],
    });
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({
      email: 'child@example.com',
    });
  });

  it('counts sign-once child signatures from other events', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        signOnce: true,
      },
    ]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([
      {
        documentSubjectId: 'document-subject:org_1:child_1',
        templateDocumentId: 'template_1',
        scopeType: 'ORGANIZATION',
        scopeId: 'org_1',
        status: 'SATISFIED',
        isComplete: true,
        requiredSignerRoles: ['parent_guardian', 'child'],
        completedSignerRoles: ['parent_guardian', 'child'],
      },
    ]);

    await syncChildRegistrationConsentStatus({
      eventId: 'event_1',
      childUserId: 'child_1',
    });

    expect(prismaMock.documentRequirementSatisfactions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        documentSubjectId: 'document-subject:org_1:child_1',
        invalidatedAt: null,
        OR: [{
          scopeType: 'ORGANIZATION',
          scopeId: 'org_1',
          templateDocumentId: 'template_1',
        }],
      }),
    }));

    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'registration_1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        consentStatus: 'completed',
      }),
    }));
  });

  it('keeps event-scoped templates tied to the current event', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        signOnce: false,
      },
    ]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([]);

    await syncChildRegistrationConsentStatus({
      eventId: 'event_1',
      childUserId: 'child_1',
    });

    expect(prismaMock.documentRequirementSatisfactions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        documentSubjectId: 'document-subject:org_1:child_1',
        invalidatedAt: null,
        OR: [{
          scopeType: 'EVENT_PARTICIPATION',
          scopeId: 'event_1',
          templateDocumentId: 'template_1',
        }],
      }),
    }));

    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'registration_1' },
      data: expect.objectContaining({
        status: 'STARTED',
        consentStatus: 'guardian_approval_required',
      }),
    }));
  });
});
