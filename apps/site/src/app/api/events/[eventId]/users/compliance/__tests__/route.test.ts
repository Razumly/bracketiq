/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  documentRequirementSatisfactions: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));

import { GET } from '@/app/api/events/[eventId]/users/compliance/route';

const requestFor = () => new NextRequest('http://localhost/api/events/event_1/users/compliance');

describe('GET /api/events/[eventId]/users/compliance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
  });

  it('returns user compliance summaries for non-team events', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-06-01T10:00:00.000Z'),
      teamSignup: false,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      userIds: ['user_1'],
      requiredTemplateIds: [],
    });
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'user_1',
        firstName: 'Casey',
        lastName: 'Rivers',
        userName: 'crivers',
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        registrantId: 'user_1',
        registrantType: 'SELF',
        parentId: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        updatedAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValue([
      {
        id: 'bill_1',
        ownerId: 'user_1',
        totalAmountCents: 5000,
        paidAmountCents: 5000,
        status: 'PAID',
        parentBillId: null,
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        updatedAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ]);

    const response = await GET(requestFor(), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });
    const payload = await response.json();

    expect(prismaMock.eventRegistrations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
      }),
    }));
    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(1);
    expect(payload.users[0]).toEqual(
      expect.objectContaining({
        userId: 'user_1',
        fullName: 'Casey Rivers',
        payment: expect.objectContaining({
          hasBill: true,
          billId: 'bill_1',
          totalAmountCents: 5000,
          paidAmountCents: 5000,
          isPaidInFull: true,
        }),
        documents: {
          signedCount: 0,
          requiredCount: 0,
        },
      }),
    );
    expect(prismaMock.signedDocuments.findMany).not.toHaveBeenCalled();
  });

  it('counts a completed imported Satisfaction as signed evidence', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-06-01T10:00:00.000Z'),
      teamSignup: false,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      userIds: ['user_1'],
      requiredTemplateIds: ['template_1'],
    });
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'user_1',
        firstName: 'Casey',
        lastName: 'Rivers',
        userName: 'crivers',
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        id: 'registration_1',
        registrantId: 'user_1',
        registrantType: 'SELF',
        parentId: null,
        status: 'CONSENTFAILED',
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        updatedAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        title: 'Event waiver',
        type: 'PDF',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([{
      id: 'imported_evidence_1',
      signedAt: '2026-04-30T10:00:00.000Z',
    }]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([
      {
        documentSubjectId: 'document-subject:org_1:user_1',
        templateDocumentId: 'template_1',
        scopeType: 'EVENT_PARTICIPATION',
        scopeId: 'event_1',
        sourceEvidenceId: 'imported_evidence_1',
        updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    ]);

    const response = await GET(requestFor(), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users[0].documents).toEqual({
      signedCount: 1,
      requiredCount: 1,
    });
    expect(payload.users[0].requiredDocuments[0]).toEqual(
      expect.objectContaining({
        status: 'SIGNED',
        signedDocumentRecordId: 'imported_evidence_1',
        signedAt: '2026-04-30T10:00:00.000Z',
      }),
    );
  });

  it('returns an empty list when event is team-signup based', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-06-01T10:00:00.000Z'),
      teamSignup: true,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      userIds: ['user_1'],
      requiredTemplateIds: [],
    });

    const response = await GET(requestFor(), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ users: [] });
  });
});
