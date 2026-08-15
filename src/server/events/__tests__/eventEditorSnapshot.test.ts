jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/registrationQuestions', () => ({ listRegistrationQuestions: jest.fn() }));
jest.mock('../eventStaffReconciliation', () => ({ loadEventStaffSnapshot: jest.fn() }));

import { buildEventEditorSnapshot, loadCreateEventEditorSnapshot } from '../eventEditorSnapshot';
import { parseSaveEventEditorCommand } from '@/contracts/eventEditor';

const buildClient = (fields: unknown[], timeSlots: unknown[], facilities: unknown[] = []) => ({
  fields: { findMany: jest.fn().mockResolvedValue(fields) },
  facilities: { findMany: jest.fn().mockResolvedValue(facilities) },
  timeSlots: { findMany: jest.fn().mockResolvedValue(timeSlots) },
  sports: { findMany: jest.fn().mockResolvedValue([]) },
  organizations: { findMany: jest.fn().mockResolvedValue([]) },
  eventTemplates: { findMany: jest.fn().mockResolvedValue([]) },
  stripeAccounts: { findFirst: jest.fn().mockResolvedValue(null) },
  eventRegistrations: { findFirst: jest.fn().mockResolvedValue(null) },
}) as any;

describe('buildEventEditorSnapshot', () => {
  it('projects real resource rows into the strict editor resource contract', async () => {
    const client = buildClient(
      [{
        id: 'field_1',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-02T10:00:00.000Z'),
        name: 'Court 1',
        location: 'Main Gym',
        organizationId: null,
        facilityId: 'facility_1',
        rentalSlotIds: [],
        sportIds: [],
        status: 'ACTIVE',
      }],
      [{
        id: 'slot_1',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-02T10:00:00.000Z'),
        startDate: new Date('2026-08-09T09:00:00.000Z'),
        endDate: new Date('2026-08-09T10:00:00.000Z'),
        timeZone: 'UTC',
        repeating: false,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        divisions: [],
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
        rentalLocked: false,
        status: 'ACTIVE',
      }],
      [{ id: 'facility_1', name: 'Main Facility', location: 'Main Gym' }],
    );

    const snapshot = await buildEventEditorSnapshot({
      name: 'Resource contract event',
      description: '',
      eventType: 'EVENT',
      sportIds: [],
      start: '2026-08-09T09:00:00.000Z',
      end: '2026-08-09T10:00:00.000Z',
      noFixedEndDateTime: false,
      timeZone: 'UTC',
      location: 'Main Gym',
      address: '',
      coordinates: [0, 0],
      organizationId: null,
      state: 'UNPUBLISHED',
      fieldIds: ['field_1'],
      timeSlotIds: ['slot_1'],
    }, { client, mode: 'CREATE' });

    expect(snapshot.draft.resources.fields[0]).toEqual(expect.objectContaining({
      id: 'field_1',
      $id: 'field_1',
      name: 'Court 1',
    }));
    expect(snapshot.draft.resources.fields[0]).not.toHaveProperty('createdAt');
    expect(snapshot.draft.resources.fields[0]).not.toHaveProperty('status');
    expect(snapshot.catalogs.fields[0]).toEqual(expect.objectContaining({
      id: 'field_1',
      facility: expect.objectContaining({
        id: 'facility_1',
        name: 'Main Facility',
      }),
    }));
    expect(snapshot.draft.resources.fields[0]).not.toHaveProperty('facility');
    expect(snapshot.draft.resources.timeSlots[0]).toEqual(expect.objectContaining({
      id: 'slot_1',
      $id: 'slot_1',
      startDate: '2026-08-09T09:00:00.000Z',
      endDate: '2026-08-09T10:00:00.000Z',
    }));
    expect(snapshot.draft.resources.timeSlots[0]).not.toHaveProperty('updatedAt');
    expect(snapshot.draft.resources.timeSlots[0]).not.toHaveProperty('status');
  });
});
  it('hydrates rental booking slots as immutable create resources', async () => {
    const rentalItem = {
      id: 'booking_item_1',
      bookingId: 'booking_1',
      organizationId: 'org_1',
      fieldId: 'field_1',
      start: new Date('2026-08-09T09:00:00.000Z'),
      end: new Date('2026-08-09T10:00:00.000Z'),
      timeZone: 'UTC',
      requiredTemplateIds: ['template_1'],
      hostRequiredTemplateIds: [],
    };
    const client = {
      rentalBookings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'booking_1', organizationId: 'org_1' }),
      },
      rentalBookingItems: {
        findMany: jest.fn().mockResolvedValue([rentalItem]),
      },
      fields: {
        findMany: jest.fn().mockResolvedValue([{ id: 'field_1', name: 'Court 1', organizationId: 'org_1' }]),
      },
      sports: { findMany: jest.fn().mockResolvedValue([]) },
      organizations: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'org_1',
          ownerId: 'owner_1',
          ownershipStatus: 'CLAIMED',
        }),
      },
      eventTemplates: { findMany: jest.fn().mockResolvedValue([]) },
      stripeAccounts: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;

    const snapshot = await loadCreateEventEditorSnapshot({
      organizationId: 'org_1',
      rentalBookingId: 'booking_1',
    }, { client });

    expect(snapshot.immutable.rental).toBe(true);
    expect(snapshot.draft.resources.rentalBookingId).toBe('booking_1');
    expect(snapshot.draft.resources.timeSlots).toEqual([
      expect.objectContaining({
        rentalBookingId: 'booking_1',
        rentalBookingItemId: 'booking_item_1',
        rentalLocked: true,
        scheduledFieldIds: ['field_1'],
      }),
    ]);
    client.rentalBookingItems.findMany.mockResolvedValue([{
      ...rentalItem,
      end: new Date('2026-08-09T10:30:00.000Z'),
    }]);
    const changedRentalSnapshot = await loadCreateEventEditorSnapshot({
      organizationId: 'org_1',
      rentalBookingId: 'booking_1',
    }, { client });
    expect(changedRentalSnapshot.editorRevision).not.toBe(snapshot.editorRevision);
    expect(changedRentalSnapshot.scheduleState.revision).not.toBe(snapshot.scheduleState.revision);
  });

  it('hydrates template source values and resources in create snapshots', async () => {
    const templateSource = {
      id: 'template_1',
      name: 'Template event',
      description: 'Template description',
      eventType: 'EVENT',
      organizationId: 'org_1',
      location: 'Main Gym',
      timeZone: 'UTC',
      noFixedEndDateTime: false,
      endOffsetMinutesFromEventStart: 60,
      price: 0,
      maxParticipants: 4,
    };
    const client = {
      eventTemplates: {
        findUnique: jest.fn().mockResolvedValue(templateSource),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventTemplateResources: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'template_resource_1',
          name: 'Court 1',
          sourceResourceId: null,
          organizationId: null,
        }]),
      },
      eventTemplateTimeSlots: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'template_slot_1',
          templateResourceIds: ['template_resource_1'],
          startOffsetMinutesFromEventStart: 0,
          endOffsetMinutesFromEventStart: 60,
          daysOfWeek: [0],
        }]),
      },
      eventTemplateRentalResourceHints: { findMany: jest.fn().mockResolvedValue([]) },
      eventTemplateLeagueScoringConfigs: { findUnique: jest.fn().mockResolvedValue(null) },
      fields: { findMany: jest.fn().mockResolvedValue([]) },
      timeSlots: { findMany: jest.fn().mockResolvedValue([]) },
      sports: { findMany: jest.fn().mockResolvedValue([]) },
      organizations: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'org_1',
          ownerId: 'owner_1',
          ownershipStatus: 'CLAIMED',
        }),
      },
      stripeAccounts: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;

    const snapshot = await loadCreateEventEditorSnapshot({
      organizationId: 'org_1',
      templateId: 'template_1',
    }, { client });

    expect(snapshot.immutable.template).toBe(true);
    expect(snapshot.draft.basics.name).toBe('Template event');
    expect(snapshot.draft.resources.requiredTemplateIds).toEqual(['template_1']);
    expect(snapshot.draft.resources.fields).toEqual([
      expect.objectContaining({ name: 'Court 1' }),
    ]);
    expect(snapshot.draft.resources.timeSlots).toHaveLength(1);
    expect(snapshot.editorRevision).not.toBe('new');
    expect(snapshot.scheduleState.revision).not.toBe('new');

    client.eventTemplates.findUnique.mockResolvedValue({
      ...templateSource,
      description: 'Template description changed at the source',
    });
    const changedSourceSnapshot = await loadCreateEventEditorSnapshot({
      organizationId: 'org_1',
      templateId: 'template_1',
    }, { client });
    expect(changedSourceSnapshot.editorRevision).not.toBe(snapshot.editorRevision);
    expect(changedSourceSnapshot.scheduleState.revision).not.toBe(snapshot.scheduleState.revision);
  });

it('round-trips configured playoff phase rules without treating them as standings overrides', async () => {
  const client = {
    ...buildClient([], []),
    divisions: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'division_league',
          eventId: 'event_rules',
          status: 'ACTIVE',
          kind: 'LEAGUE',
          key: 'open',
          name: 'Open',
          standingsOverrides: { wins: 2 },
          playoffDoubleElimination: true,
          playoffWinnerSetCount: 3,
          playoffLoserSetCount: 2,
          playoffWinnerBracketPointsToVictory: [21, 21, 15],
          playoffLoserBracketPointsToVictory: [21, 15],
          playoffPrize: 'Trophy',
          playoffFieldCount: 2,
          playoffRestTimeMinutes: 10,
          playoffMatchDurationMinutes: 75,
          playoffSetDurationMinutes: 20,
          fieldIds: [],
        },
        {
          id: 'division_playoff',
          eventId: 'event_rules',
          status: 'ACTIVE',
          kind: 'PLAYOFF',
          key: 'playoff',
          name: 'Playoff',
          standingsOverrides: {
            doubleElimination: true,
            winnerSetCount: 3,
            loserSetCount: 2,
            winnerBracketPointsToVictory: [21, 21, 15],
            loserBracketPointsToVictory: [21, 15],
            prize: 'Trophy',
            fieldCount: 2,
            restTimeMinutes: 10,
            matchDurationMinutes: 75,
            setDurationMinutes: 20,
          },
          fieldIds: [],
        },
      ]),
    },
  } as any;

  const snapshot = await buildEventEditorSnapshot({
    id: 'event_rules',
    $id: 'event_rules',
    name: 'Rules event',
    description: '',
    eventType: 'TOURNAMENT',
    sportIds: [],
    start: '2026-09-10T18:00:00.000Z',
    end: '2026-09-10T20:00:00.000Z',
    noFixedEndDateTime: false,
    timeZone: 'UTC',
    location: '',
    address: '',
    coordinates: [0, 0],
    organizationId: null,
    hostId: 'host_rules',
    state: 'UNPUBLISHED',
    fieldIds: [],
    timeSlotIds: [],
    divisions: ['division_league'],
    divisionDetails: [],
    playoffDivisionDetails: [],
  }, { client, mode: 'EDIT', actor: { userId: 'host_rules' } });

  expect(snapshot.draft.competition.divisionDetails[0]).toEqual(expect.objectContaining({
    standingsOverrides: { wins: 2 },
    playoffConfig: expect.objectContaining({
      doubleElimination: true,
      winnerSetCount: 3,
      winnerBracketPointsToVictory: [21, 21, 15],
    }),
  }));
  expect(snapshot.draft.competition.playoffDivisionDetails[0]).toEqual(expect.objectContaining({
    standingsOverrides: null,
    playoffConfig: expect.objectContaining({
      doubleElimination: true,
      loserSetCount: 2,
      setDurationMinutes: 20,
    }),
  }));

  const command = parseSaveEventEditorCommand({
    contractVersion: snapshot.contractVersion,
    editorRevision: snapshot.editorRevision,
    staffRevision: snapshot.staffRevision,
    draft: snapshot.draft,
    scheduleTransition: { mode: 'PRESERVE' },
  });
  expect(command.draft.competition.playoffDivisionDetails).toEqual(
    snapshot.draft.competition.playoffDivisionDetails,
  );
});
