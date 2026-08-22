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

import { applyBillPaymentOutcome } from '@/server/billing/eventRegistrationPaymentApplication';

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
});
