/** @jest-environment node */

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  timeSlots: {
    findFirst: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
const acquireEventLockAndLoadStructureMock = jest.fn();
const syncDivisionTeamMembershipFromRegistrationsMock = jest.fn();
const claimOrCreateEventTeamSnapshotMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/events/eventRegistrations', () => {
  const actual = jest.requireActual('@/server/events/eventRegistrations');
  return {
    ...actual,
    acquireEventLockAndLoadStructure: (...args: unknown[]) => acquireEventLockAndLoadStructureMock(...args),
    syncDivisionTeamMembershipFromRegistrations: (...args: unknown[]) => (
      syncDivisionTeamMembershipFromRegistrationsMock(...args)
    ),
  };
});
jest.mock('@/server/teams/teamMembership', () => {
  const actual = jest.requireActual('@/server/teams/teamMembership');
  return {
    ...actual,
    claimOrCreateEventTeamSnapshot: (...args: unknown[]) => claimOrCreateEventTeamSnapshotMock(...args),
  };
});

import {
  applyBillPaymentOutcome,
  ensureEventRegistrationFromPurchase,
} from '@/server/billing/eventRegistrationPaymentApplication';

const fallbackBillContext = {
  purchaseType: 'bill',
  eventId: null,
  teamId: null,
  userId: null,
  registrantType: null,
  parentId: null,
  registrationId: null,
  occurrenceSlotId: null,
  occurrenceDate: null,
  divisionId: null,
  divisionTypeId: null,
  divisionTypeKey: null,
};

const billSource = {
  ownerType: 'TEAM',
  ownerId: 'team_1',
  eventId: 'event_1',
  organizationId: 'org_1',
  slotId: null,
  occurrenceDate: null,
  sourceType: 'EVENT_REGISTRATION',
  sourceId: 'event_1__team__team_1',
  lineItems: [],
};

describe('event registration payment application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => (
      callback(prismaMock)
    ));
    prismaMock.eventRegistrations.update.mockResolvedValue({});
    prismaMock.eventRegistrations.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.timeSlots.findFirst.mockResolvedValue(null);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    acquireEventLockAndLoadStructureMock.mockResolvedValue({
      id: 'event_1',
      eventType: 'EVENT',
      teamSignup: true,
    });
    claimOrCreateEventTeamSnapshotMock.mockResolvedValue({ id: 'team_1' });
    syncDivisionTeamMembershipFromRegistrationsMock.mockResolvedValue(undefined);
  });

  it('applies a paid bill outcome from persisted event registration identity', async () => {
    const registrationId = 'event_1__team__team_1';
    prismaMock.bills.findUnique.mockResolvedValueOnce(billSource);
    prismaMock.eventRegistrations.findUnique
      .mockResolvedValueOnce({
        eventId: 'event_1',
        registrantId: 'team_1',
        parentId: null,
        registrantType: 'TEAM',
        eventTeamId: 'team_1',
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
        slotId: null,
        occurrenceDate: null,
      })
      .mockResolvedValueOnce({ status: 'PENDING' });

    const result = await applyBillPaymentOutcome({
      billId: 'bill_1',
      outcome: 'PAID',
      fallback: fallbackBillContext,
      billStatus: 'PAID',
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(result.registrationResult).toEqual(expect.objectContaining({ applied: true, activated: true }));
    expect(result.context).toEqual(expect.objectContaining({
      purchaseType: 'event',
      eventId: 'event_1',
      teamId: 'team_1',
      registrationId,
    }));
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: registrationId },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('does not activate an event registration source owned by a different team', async () => {
    const registrationId = 'event_1__team__team_other';
    prismaMock.bills.findUnique.mockResolvedValueOnce({
      ...billSource,
      ownerId: 'team_1',
      sourceId: registrationId,
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      eventId: 'event_1',
      registrantId: 'team_other',
      parentId: 'team_other',
      registrantType: 'TEAM',
      eventTeamId: 'team_other',
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      slotId: null,
      occurrenceDate: null,
    });

    const result = await applyBillPaymentOutcome({
      billId: 'bill_1',
      outcome: 'PAID',
      fallback: {
        ...fallbackBillContext,
        purchaseType: 'event',
        eventId: 'event_1',
        teamId: 'team_other',
        registrantType: 'TEAM',
        parentId: 'team_other',
        registrationId,
      },
      billStatus: 'PAID',
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(result.registrationResult).toEqual({
      applied: false,
      reason: 'invalid_event_registration_source',
    });
    expect(result.paymentResolutionResult).toBeNull();
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.updateMany).not.toHaveBeenCalled();
  });

  it('applies a failed bill outcome from the same persisted event registration identity', async () => {
    const registrationId = 'event_1__team__team_1';
    prismaMock.bills.findUnique.mockResolvedValueOnce(billSource);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      eventId: 'event_1',
      registrantId: 'team_1',
      parentId: null,
      registrantType: 'TEAM',
      eventTeamId: 'team_1',
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      slotId: null,
      occurrenceDate: null,
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 'event_1', eventType: 'EVENT', teamSignup: true },
    ]);
    prismaMock.eventRegistrations.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await applyBillPaymentOutcome({
      billId: 'bill_1',
      outcome: 'FAILED',
      fallback: fallbackBillContext,
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(result.registrationResult).toEqual(expect.objectContaining({ applied: true }));
    expect(result.context).toEqual(expect.objectContaining({
      purchaseType: 'event',
      eventId: 'event_1',
      teamId: 'team_1',
      registrationId,
    }));
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: registrationId }),
        data: expect.objectContaining({ status: 'PAYMENT_FAILED' }),
      }),
    );
  });
  it('finalizes a pre-archive Weekly PENDING reservation after payment succeeds', async () => {
    const registrationId = 'event_1__self__user_1__slot_1__2026-08-02';
    const archivedWeeklyEvent = {
      id: 'event_1',
      eventType: 'WEEKLY_EVENT',
      teamSignup: false,
      parentEvent: null,
      archivedAt: new Date('2026-08-03T00:00:00.000Z'),
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: null,
      timeSlotIds: ['slot_1'],
      maxParticipants: null,
      singleDivision: null,
      divisionIds: [],
    };
    acquireEventLockAndLoadStructureMock.mockResolvedValueOnce(archivedWeeklyEvent);
    prismaMock.timeSlots.findFirst.mockResolvedValueOnce({
      id: 'slot_1',
      repeating: true,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: '2026-08-01',
      endDate: null,
      startTimeMinutes: 600,
      endTimeMinutes: 660,
      timeZone: 'UTC',
      divisions: [],
      archivedAt: null,
    });
    prismaMock.eventRegistrations.findUnique
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({
        id: registrationId,
        eventId: 'event_1',
        registrantId: 'user_1',
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'PENDING',
        acceptedAt: null,
        eventTeamId: null,
        sourceTeamRegistrationId: null,
        ageAtEvent: null,
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
        jerseyNumber: null,
        position: null,
        isCaptain: false,
        consentDocumentId: null,
        consentStatus: null,
        createdBy: 'user_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-08-02',
        createdAt: null,
        updatedAt: null,
      });

    const result = await ensureEventRegistrationFromPurchase({
      purchaseType: 'event',
      eventId: 'event_1',
      teamId: null,
      userId: 'user_1',
      registrantType: 'SELF',
      registrationId,
      occurrenceSlotId: 'slot_1',
      occurrenceDate: '2026-08-02',
      now: new Date('2026-08-02T12:00:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      applied: true,
      registrationId,
      activated: true,
    }));
    expect(acquireEventLockAndLoadStructureMock).toHaveBeenCalledWith(
      prismaMock,
      'event_1',
      undefined,
      { allowArchivedWeeklyReservation: true },
    );
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: registrationId },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('does not create a new Weekly registration after archive', async () => {
    acquireEventLockAndLoadStructureMock.mockResolvedValueOnce({
      id: 'event_1',
      eventType: 'WEEKLY_EVENT',
      teamSignup: false,
      parentEvent: null,
      archivedAt: new Date('2026-08-03T00:00:00.000Z'),
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: null,
      timeSlotIds: ['slot_1'],
      maxParticipants: null,
      singleDivision: null,
      divisionIds: [],
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce(null);

    const result = await ensureEventRegistrationFromPurchase({
      purchaseType: 'event',
      eventId: 'event_1',
      teamId: null,
      userId: 'user_1',
      registrantType: 'SELF',
      registrationId: null,
      occurrenceSlotId: 'slot_1',
      occurrenceDate: '2026-08-02',
      now: new Date('2026-08-02T12:00:00.000Z'),
    });

    expect(result).toEqual({ applied: false, reason: 'event_archived' });
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
  });
});
