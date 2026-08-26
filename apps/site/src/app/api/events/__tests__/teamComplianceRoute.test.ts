/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
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
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));

import { GET } from '@/app/api/events/[eventId]/teams/compliance/route';

describe('GET /api/events/[eventId]/teams/compliance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Test League',
      start: new Date('2026-08-01T12:00:00.000Z'),
      teamSignup: true,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      requiredTemplateIds: [],
    });
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'slot_1',
        name: 'Slot Team',
        playerIds: [],
        parentTeamId: 'team_canonical',
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        id: 'event_1__team__slot_1',
        eventId: 'event_1',
        registrantId: 'slot_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
  });

  it('uses parent team bills when event team is a slot with parentTeamId', async () => {
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_parent_team',
        ownerId: 'team_canonical',
        totalAmountCents: 12000,
        paidAmountCents: 3000,
        status: 'PENDING',
        parentBillId: null,
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-05T12:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.bills.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_1',
          ownerType: 'TEAM',
          ownerId: { in: expect.arrayContaining(['slot_1', 'team_canonical']) },
        }),
      }),
    );
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0].teamId).toBe('slot_1');
    expect(payload.teams[0].payment).toMatchObject({
      hasBill: true,
      billId: 'bill_parent_team',
      totalAmountCents: 12000,
      paidAmountCents: 3000,
      inheritedFromTeamBill: true,
    });
  });

  it('falls back to slot-team bill when parent team bill is not present', async () => {
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_slot_team',
        ownerId: 'slot_1',
        totalAmountCents: 9000,
        paidAmountCents: 9000,
        status: 'PAID',
        parentBillId: null,
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-05T12:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0].payment).toMatchObject({
      hasBill: true,
      billId: 'bill_slot_team',
      totalAmountCents: 9000,
      paidAmountCents: 9000,
      isPaidInFull: true,
      inheritedFromTeamBill: false,
    });
  });

  it('marks team payment pending when the event registration is pending and no bill exists yet', async () => {
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'event_1__team__slot_1',
        eventId: 'event_1',
        registrantId: 'slot_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        status: 'PENDING',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-02T12:00:00.000Z'),
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0].payment).toMatchObject({
      hasBill: false,
      billId: null,
      paymentPending: true,
    });
  });
  it('counts a completed Team-membership Satisfaction for an event player', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Team League',
      start: new Date('2026-08-01T12:00:00.000Z'),
      teamSignup: true,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      requiredTemplateIds: ['template_1'],
    });
    prismaMock.teams.findMany.mockResolvedValue([{
      id: 'event_team_1',
      name: 'Event Team',
      playerIds: ['player_1'],
      parentTeamId: 'team_canonical',
    }]);
    prismaMock.eventRegistrations.findMany
      .mockReset()
      .mockResolvedValueOnce([{
        id: 'event_registration_1',
        eventId: 'event_1',
        registrantId: 'event_team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        status: 'CONSENTFAILED',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-01T12:00:00.000Z'),
      }])
      .mockResolvedValueOnce([{
        eventTeamId: 'event_team_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        parentId: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-01T12:00:00.000Z'),
      }]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([{
      id: 'template_1',
      title: 'Team waiver',
      type: 'PDF',
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
    }]);
    prismaMock.userData.findMany.mockResolvedValue([{
      id: 'player_1',
      firstName: 'Player',
      lastName: 'One',
      userName: 'player1',
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    }]);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([{
      documentSubjectId: 'document-subject:org_1:player_1',
      templateDocumentId: 'template_1',
      scopeType: 'TEAM_MEMBERSHIP',
      scopeId: 'team_canonical',
      sourceEvidenceId: 'team_evidence_1',
      updatedAt: new Date('2026-07-02T12:00:00.000Z'),
    }]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([{
      id: 'team_evidence_1',
      signedAt: new Date('2026-07-02T12:00:00.000Z'),
    }]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(prismaMock.eventRegistrations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
      }),
    }));
    expect(response.status).toBe(200);
    expect(payload.teams[0].users[0].documents).toEqual({
      signedCount: 1,
      requiredCount: 1,
    });
    expect(prismaMock.documentRequirementSatisfactions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { scopeType: 'TEAM_MEMBERSHIP', scopeId: 'team_canonical' },
          ]),
        }),
      }),
    );
  });

  it('hides a snapshot-only team player without an individual registration', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Team League',
      start: new Date('2026-08-01T12:00:00.000Z'),
      teamSignup: true,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      requiredTemplateIds: ['template_1'],
    });
    prismaMock.teams.findMany.mockResolvedValue([{
      id: 'event_team_1',
      name: 'Event Team',
      playerIds: ['player_1'],
      parentTeamId: 'team_canonical',
    }]);
    prismaMock.eventRegistrations.findMany
      .mockReset()
      .mockResolvedValueOnce([{
        id: 'event_registration_1',
        eventId: 'event_1',
        registrantId: 'event_team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-01T12:00:00.000Z'),
      }])
      .mockResolvedValueOnce([]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([{
      id: 'template_1',
      title: 'Team waiver',
      type: 'PDF',
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
    }]);
    prismaMock.userData.findMany.mockResolvedValue([{
      id: 'player_1',
      firstName: 'Player',
      lastName: 'One',
      userName: 'player1',
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    }]);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams[0].users).toEqual([]);
  });
  it('hides a cancelled team player and reuses satisfaction after restore', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Team League',
      start: new Date('2026-08-01T12:00:00.000Z'),
      teamSignup: true,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      requiredTemplateIds: ['template_1'],
    });
    prismaMock.teams.findMany.mockResolvedValue([{
      id: 'event_team_1',
      name: 'Event Team',
      playerIds: ['player_1'],
      parentTeamId: 'team_canonical',
    }]);
    prismaMock.eventRegistrations.findMany.mockReset();
    const teamRegistration = {
      id: 'event_registration_1',
      eventId: 'event_1',
      registrantId: 'event_team_1',
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-01T12:00:00.000Z'),
      updatedAt: new Date('2026-07-01T12:00:00.000Z'),
    };
    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([teamRegistration])
      .mockResolvedValueOnce([{
        eventTeamId: 'event_team_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        parentId: null,
        status: 'CANCELLED',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-03T12:00:00.000Z'),
      }]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([{
      id: 'template_1',
      title: 'Team waiver',
      type: 'PDF',
      signOnce: false,
      requiredSignerType: 'PARTICIPANT',
    }]);
    prismaMock.userData.findMany.mockResolvedValue([{
      id: 'player_1',
      firstName: 'Player',
      lastName: 'One',
      userName: 'player1',
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    }]);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([{
      documentSubjectId: 'document-subject:org_1:player_1',
      templateDocumentId: 'template_1',
      scopeType: 'TEAM_MEMBERSHIP',
      scopeId: 'team_canonical',
      sourceEvidenceId: 'team_evidence_1',
      updatedAt: new Date('2026-07-02T12:00:00.000Z'),
    }]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([{
      id: 'team_evidence_1',
      signedAt: new Date('2026-07-02T12:00:00.000Z'),
    }]);

    const cancelledResponse = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const cancelledPayload = await cancelledResponse.json();

    expect(prismaMock.eventRegistrations.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        eventTeamId: { in: ['event_team_1'] },
        registrantId: { in: ['player_1'] },
        registrantType: { in: ['SELF', 'CHILD'] },
      }),
    }));
    expect(cancelledResponse.status).toBe(200);
    expect(cancelledPayload.teams[0].users).toEqual([]);

    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([teamRegistration])
      .mockResolvedValueOnce([{
        eventTeamId: 'event_team_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        parentId: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-04T12:00:00.000Z'),
      }]);

    const restoredResponse = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const restoredPayload = await restoredResponse.json();

    expect(restoredResponse.status).toBe(200);
    expect(restoredPayload.teams[0].users[0].documents).toEqual({
      signedCount: 1,
      requiredCount: 1,
    });
  });
});
