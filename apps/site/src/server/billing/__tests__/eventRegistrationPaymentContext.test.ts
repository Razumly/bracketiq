/** @jest-environment node */

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findUnique: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  loadBillPurchaseMetadata,
  resolveEventRegistrationPurchaseContext,
} from '@/server/billing/eventRegistrationPaymentContext';

describe('event registration payment context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives participant registration identity from a bill source record', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      ownerType: 'USER',
      ownerId: 'user_1',
      eventId: 'event_1',
      organizationId: 'org_1',
      slotId: null,
      occurrenceDate: null,
      sourceType: 'EVENT_REGISTRATION',
      sourceId: 'registration_1',
      lineItems: [
        {
          id: 'line_1',
          type: 'EVENT',
          label: 'Event registration',
          amountCents: 4500,
          purchaseType: 'event',
          eventId: 'event_other',
          userId: 'user_other',
          registrationId: 'registration_other',
        },
      ],
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      eventId: 'event_1',
      registrantId: 'user_1',
      parentId: null,
      registrantType: 'SELF',
      eventTeamId: null,
      divisionId: 'entry_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'open',
      slotId: null,
      occurrenceDate: null,
    });

    const billMetadata = await loadBillPurchaseMetadata('bill_1');
    const context = resolveEventRegistrationPurchaseContext({
      billMetadata,
      fallback: {
        purchaseType: 'bill',
        eventId: null,
        teamId: null,
        userId: 'payer_1',
        registrantType: null,
        parentId: null,
        registrationId: null,
        occurrenceSlotId: null,
        occurrenceDate: null,
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
      },
    });

    expect(context).toEqual({
      purchaseType: 'event',
      eventId: 'event_1',
      teamId: null,
      userId: 'user_1',
      registrantType: 'SELF',
      parentId: null,
      registrationId: 'registration_1',
      occurrenceSlotId: null,
      occurrenceDate: null,
      divisionId: 'entry_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'open',
    });
    expect(prismaMock.eventRegistrations.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'registration_1' },
    }));
  });
  it('marks an event registration source that does not belong to the bill owner', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      organizationId: null,
      slotId: null,
      occurrenceDate: null,
      sourceType: 'EVENT_REGISTRATION',
      sourceId: 'registration_other',
      lineItems: [],
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      eventId: 'event_1',
      registrantId: 'event_team_other',
      parentId: 'team_other',
      registrantType: 'TEAM',
      eventTeamId: 'event_team_other',
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      slotId: null,
      occurrenceDate: null,
    });

    const context = resolveEventRegistrationPurchaseContext({
      billMetadata: await loadBillPurchaseMetadata('bill_1'),
      fallback: {
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
      },
    });

    expect(context.sourceIntegrityFailure).toBe('source_owner_mismatch');
  });
  it('uses the parent team owner for a split child bill source', async () => {
    prismaMock.bills.findUnique
      .mockResolvedValueOnce({
        ownerType: 'USER',
        ownerId: 'player_1',
        parentBillId: 'bill_parent',
        eventId: 'event_1',
        organizationId: 'org_1',
        slotId: null,
        occurrenceDate: null,
        sourceType: 'EVENT_REGISTRATION',
        sourceId: 'registration_1',
        lineItems: [],
      })
      .mockResolvedValueOnce({
        ownerType: 'TEAM',
        ownerId: 'team_1',
        eventId: 'event_1',
        organizationId: 'org_1',
        slotId: null,
        occurrenceDate: null,
        sourceType: 'EVENT_REGISTRATION',
        sourceId: 'registration_1',
      });
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      eventId: 'event_1',
      registrantId: 'event_team_1',
      parentId: 'team_1',
      registrantType: 'TEAM',
      eventTeamId: 'event_team_1',
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      slotId: null,
      occurrenceDate: null,
    });

    const context = resolveEventRegistrationPurchaseContext({
      billMetadata: await loadBillPurchaseMetadata('bill_child'),
      fallback: {
        purchaseType: 'bill',
        eventId: null,
        teamId: null,
        userId: 'player_1',
        registrantType: null,
        parentId: null,
        registrationId: null,
        occurrenceSlotId: null,
        occurrenceDate: null,
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
      },
    });

    expect(context).toEqual(expect.objectContaining({
      purchaseType: 'event',
      eventId: 'event_1',
      teamId: 'event_team_1',
      registrationId: 'registration_1',
    }));
    expect(context.sourceIntegrityFailure).toBeUndefined();
  });



  it('keeps complete line-item identity when a bill has no source record', async () => {
    const billMetadata = {
      purchaseType: 'event',
      eventId: 'event_2',
      teamId: 'event_team_2',
      registrationId: 'registration_2',
      eventRegistrationRegistrantType: 'TEAM',
      eventRegistrationParentId: 'canonical_team_2',
      occurrenceSlotId: 'slot_2',
      occurrenceDate: '2026-08-22',
      eventRegistrationDivisionId: 'entry_open',
      eventRegistrationDivisionTypeId: 'open',
      eventRegistrationDivisionTypeKey: 'open',
    };

    expect(resolveEventRegistrationPurchaseContext({
      billMetadata,
      fallback: {
        purchaseType: 'bill',
        eventId: null,
        teamId: null,
        userId: 'payer_2',
        registrantType: null,
        parentId: null,
        registrationId: null,
        occurrenceSlotId: null,
        occurrenceDate: null,
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
      },
    })).toEqual({
      purchaseType: 'event',
      eventId: 'event_2',
      teamId: 'event_team_2',
      userId: 'payer_2',
      registrantType: 'TEAM',
      parentId: 'canonical_team_2',
      registrationId: 'registration_2',
      occurrenceSlotId: 'slot_2',
      occurrenceDate: '2026-08-22',
      divisionId: 'entry_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'open',
    });
  });
});
