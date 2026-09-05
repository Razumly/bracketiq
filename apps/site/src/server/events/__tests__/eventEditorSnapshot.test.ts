/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/server/registrationQuestions", () => ({
  listRegistrationQuestions: jest.fn(),
}));
jest.mock("../eventStaffReconciliation", () => ({
  loadEventStaffSnapshot: jest.fn(),
}));

import {
  buildEventEditorSnapshot,
  loadCreateEventEditorSnapshot,
  loadEventScheduleState,
} from "../eventEditorSnapshot";
import { parseSaveEventEditorCommand } from "@/contracts/eventEditor";
import { syncEventDivisions } from "@/server/repositories/events";

const buildClient = (
  fields: unknown[],
  timeSlots: unknown[],
  facilities: unknown[] = [],
) =>
  ({
    fields: { findMany: jest.fn().mockResolvedValue(fields) },
    facilities: { findMany: jest.fn().mockResolvedValue(facilities) },
    timeSlots: { findMany: jest.fn().mockResolvedValue(timeSlots) },
    sports: { findMany: jest.fn().mockResolvedValue([]) },
    organizations: { findMany: jest.fn().mockResolvedValue([]) },
    eventTemplates: { findMany: jest.fn().mockResolvedValue([]) },
    stripeAccounts: { findFirst: jest.fn().mockResolvedValue(null) },
    eventRegistrations: { findFirst: jest.fn().mockResolvedValue(null) },
  }) as any;

describe("buildEventEditorSnapshot", () => {
  it("projects real resource rows into the strict editor resource contract", async () => {
    const client = buildClient(
      [
        {
          id: "field_1",
          createdAt: new Date("2026-08-01T10:00:00.000Z"),
          updatedAt: new Date("2026-08-02T10:00:00.000Z"),
          name: "Court 1",
          location: "Main Gym",
          organizationId: null,
          facilityId: "facility_1",
          rentalSlotIds: [],
          sportIds: [],
          status: "ACTIVE",
        },
      ],
      [
        {
          id: "slot_1",
          createdAt: new Date("2026-08-01T10:00:00.000Z"),
          updatedAt: new Date("2026-08-02T10:00:00.000Z"),
          startDate: new Date("2026-08-09T09:00:00.000Z"),
          endDate: new Date("2026-08-09T10:00:00.000Z"),
          timeZone: "UTC",
          repeating: false,
          scheduledFieldId: "field_1",
          scheduledFieldIds: ["field_1"],
          divisions: [],
          requiredTemplateIds: [],
          hostRequiredTemplateIds: [],
          rentalLocked: false,
          status: "ACTIVE",
        },
      ],
      [{ id: "facility_1", name: "Main Facility", location: "Main Gym" }],
    );

    const snapshot = await buildEventEditorSnapshot(
      {
        name: "Resource contract event",
        description: "",
        eventType: "EVENT",
        sportIds: [],
        start: "2026-08-09T09:00:00.000Z",
        end: "2026-08-09T10:00:00.000Z",
        noFixedEndDateTime: false,
        timeZone: "UTC",
        location: "Main Gym",
        address: "",
        coordinates: [0, 0],
        organizationId: null,
        state: "UNPUBLISHED",
        fieldIds: ["field_1"],
        timeSlotIds: ["slot_1"],
      },
      { client, mode: "CREATE" },
    );

    expect(snapshot.draft.resources.fields[0]).toEqual(
      expect.objectContaining({
        id: "field_1",
        $id: "field_1",
        name: "Court 1",
      }),
    );
    expect(snapshot.draft.resources.fields[0]).not.toHaveProperty("createdAt");
    expect(snapshot.draft.resources.fields[0]).not.toHaveProperty("status");
    expect(snapshot.catalogs.fields[0]).toEqual(
      expect.objectContaining({
        id: "field_1",
        facility: expect.objectContaining({
          id: "facility_1",
          name: "Main Facility",
        }),
      }),
    );
    expect(snapshot.draft.resources.fields[0]).not.toHaveProperty("facility");
    expect(snapshot.draft.resources.timeSlots[0]).toEqual(
      expect.objectContaining({
        id: "slot_1",
        $id: "slot_1",
        startDate: "2026-08-09T09:00:00.000Z",
        endDate: "2026-08-09T10:00:00.000Z",
      }),
    );
    expect(snapshot.draft.resources.timeSlots[0]).not.toHaveProperty(
      "updatedAt",
    );
    expect(snapshot.draft.resources.timeSlots[0]).not.toHaveProperty("status");
  });
});

it("keeps create revisions stable when defaults are omitted", async () => {
  const client = buildClient([], []);
  const initial = await loadCreateEventEditorSnapshot({}, { client });
  const reloaded = await loadCreateEventEditorSnapshot(
    {
      eventType: initial.draft.basics.eventType,
      sportId: initial.draft.basics.sportIds[0],
      start: initial.draft.basics.start,
    },
    { client },
  );

  expect(initial.draft.schedule.mode).toBe("FIXED_END");
  expect(
    new Date(initial.draft.schedule.endConstraint).getTime() -
      new Date(initial.draft.basics.start).getTime(),
  ).toBe(60 * 60 * 1000);
  expect(reloaded.editorRevision).toBe(initial.editorRevision);
  expect(reloaded.scheduleState.revision).toBe(initial.scheduleState.revision);
});
it("keeps competition create defaults on the generated-end schedule policy", async () => {
  const snapshot = await loadCreateEventEditorSnapshot(
    {
      eventType: "LEAGUE",
      start: "2026-09-01T09:00:00.000Z",
    },
    { client: buildClient([], []) },
  );

  expect(snapshot.draft.schedule.mode).toBe("GENERATED_END");
  expect(snapshot.draft.schedule.endConstraint).toBeNull();
  expect(snapshot.draft.schedule.generatedScheduleEnd).toBeNull();
});
describe("loadEventScheduleState", () => {
  it("reports persisted Match Graph demand without requiring placements", async () => {
    const client = {
      matches: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "event_1:match:1",
            division: "division_1",
            placementState: "UNPLACED",
            fieldId: null,
          },
          {
            id: "event_1:match:2",
            division: "division_1",
            placementState: "UNPLACED",
            fieldId: null,
          },
          {
            id: "event_1:match:3",
            division: "division_2",
            placementState: "UNPLACED",
            fieldId: null,
          },
        ]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          { id: "division_1", phase: "LEAGUE" },
          { id: "division_2", phase: "PLAYOFF" },
        ]),
      },
    } as any;

    const state = await loadEventScheduleState(
      { sourceType: null, updatedAt: new Date("2026-08-16T00:00:00.000Z") },
      "event_1",
      client,
    );

    expect(state.matchDemand).toEqual({
      total: 3,
      byDivision: { division_1: 2, division_2: 1 },
      byPhase: { LEAGUE: 2, PLAYOFF: 1 },
      placed: 0,
      unplaced: 3,
    });
  });
});
it("hydrates rental booking slots as immutable create resources", async () => {
  const rentalItem = {
    id: "booking_item_1",
    bookingId: "booking_1",
    organizationId: "org_1",
    fieldId: "field_1",
    start: new Date("2026-08-09T09:00:00.000Z"),
    end: new Date("2026-08-09T10:00:00.000Z"),
    timeZone: "UTC",
    requiredTemplateIds: ["template_1"],
    hostRequiredTemplateIds: [],
  };
  const client = {
    rentalBookings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "booking_1", organizationId: "org_1" }),
    },
    rentalBookingItems: {
      findMany: jest.fn().mockResolvedValue([rentalItem]),
    },
    fields: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: "field_1", name: "Court 1", organizationId: "org_1" },
        ]),
    },
    sports: { findMany: jest.fn().mockResolvedValue([]) },
    organizations: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        id: "org_1",
        ownerId: "owner_1",
        ownershipStatus: "CLAIMED",
      }),
    },
    eventTemplates: { findMany: jest.fn().mockResolvedValue([]) },
    stripeAccounts: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;

  const snapshot = await loadCreateEventEditorSnapshot(
    {
      organizationId: "org_1",
      rentalBookingId: "booking_1",
    },
    { client },
  );

  expect(snapshot.immutable.rental).toBe(true);
  expect(snapshot.draft.resources.rentalBookingId).toBe("booking_1");
  expect(snapshot.draft.resources.timeSlots).toEqual([
    expect.objectContaining({
      rentalBookingId: "booking_1",
      rentalBookingItemId: "booking_item_1",
      rentalLocked: true,
      scheduledFieldIds: ["field_1"],
    }),
  ]);
  client.rentalBookingItems.findMany.mockResolvedValue([
    {
      ...rentalItem,
      end: new Date("2026-08-09T10:30:00.000Z"),
    },
  ]);
  const changedRentalSnapshot = await loadCreateEventEditorSnapshot(
    {
      organizationId: "org_1",
      rentalBookingId: "booking_1",
    },
    { client },
  );
  expect(changedRentalSnapshot.editorRevision).not.toBe(
    snapshot.editorRevision,
  );
  expect(changedRentalSnapshot.scheduleState.revision).not.toBe(
    snapshot.scheduleState.revision,
  );
});

it("hydrates template source values and resources in create snapshots", async () => {
  const templateSource = {
    id: "template_1",
    name: "Template event",
    description: "Template description",
    eventType: "EVENT",
    organizationId: "org_1",
    location: "Main Gym",
    timeZone: "UTC",
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
      findMany: jest.fn().mockResolvedValue([
        {
          id: "template_resource_1",
          name: "Court 1",
          sourceResourceId: null,
          organizationId: null,
        },
      ]),
    },
    eventTemplateTimeSlots: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "template_slot_1",
          templateResourceIds: ["template_resource_1"],
          startOffsetMinutesFromEventStart: 0,
          endOffsetMinutesFromEventStart: 60,
          daysOfWeek: [0],
        },
      ]),
    },
    eventTemplateRentalResourceHints: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventTemplateLeagueScoringConfigs: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    fields: { findMany: jest.fn().mockResolvedValue([]) },
    timeSlots: { findMany: jest.fn().mockResolvedValue([]) },
    sports: { findMany: jest.fn().mockResolvedValue([]) },
    organizations: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        id: "org_1",
        ownerId: "owner_1",
        ownershipStatus: "CLAIMED",
      }),
    },
    stripeAccounts: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;

  const snapshot = await loadCreateEventEditorSnapshot(
    {
      organizationId: "org_1",
      templateId: "template_1",
    },
    { client },
  );

  expect(snapshot.immutable.template).toBe(true);
  expect(snapshot.draft.basics.name).toBe("Template event");
  expect(snapshot.draft.resources.requiredTemplateIds).toEqual(["template_1"]);
  expect(snapshot.draft.resources.fields).toEqual([
    expect.objectContaining({ name: "Court 1" }),
  ]);
  expect(snapshot.draft.resources.timeSlots).toHaveLength(1);
  expect(snapshot.editorRevision).not.toBe("new");
  expect(snapshot.scheduleState.revision).not.toBe("new");
  const repeatedSourceSnapshot = await loadCreateEventEditorSnapshot(
    {
      organizationId: "org_1",
      templateId: "template_1",
    },
    { client },
  );
  expect(repeatedSourceSnapshot.editorRevision).toBe(snapshot.editorRevision);
  expect(repeatedSourceSnapshot.scheduleState.revision).toBe(
    snapshot.scheduleState.revision,
  );

  client.eventTemplates.findUnique.mockResolvedValue({
    ...templateSource,
    description: "Template description changed at the source",
  });
  const changedSourceSnapshot = await loadCreateEventEditorSnapshot(
    {
      organizationId: "org_1",
      templateId: "template_1",
    },
    { client },
  );
  expect(changedSourceSnapshot.editorRevision).not.toBe(
    snapshot.editorRevision,
  );
  expect(changedSourceSnapshot.scheduleState.revision).not.toBe(
    snapshot.scheduleState.revision,
  );
});

it("round-trips configured playoff phase rules without treating them as standings overrides", async () => {
  const client = {
    ...buildClient([], []),
    divisions: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "division_league",
          eventId: "event_rules",
          status: "ACTIVE",
          kind: "LEAGUE",
          key: "open",
          name: "Open",
          standingsOverrides: { wins: 2 },
          playoffDoubleElimination: true,
          playoffWinnerSetCount: 3,
          playoffLoserSetCount: 2,
          playoffWinnerBracketPointsToVictory: [21, 21, 15],
          playoffLoserBracketPointsToVictory: [21, 15],
          playoffPrize: "Trophy",
          playoffFieldCount: 2,
          playoffRestTimeMinutes: 10,
          playoffMatchDurationMinutes: 75,
          playoffSetDurationMinutes: 20,
          fieldIds: [],
        },
        {
          id: "division_league__phase__playoff",
          eventId: "event_rules",
          status: "ACTIVE",
          kind: "PLAYOFF",
          role: "PHASE",
          phase: "PLAYOFF",
          sourceDivisionId: "division_league",
          key: "championship",
          name: "Championship",
          standingsOverrides: {
            doubleElimination: true,
            winnerSetCount: 3,
            loserSetCount: 2,
            winnerBracketPointsToVictory: [21, 21, 15],
            loserBracketPointsToVictory: [21, 15],
            prize: "Trophy",
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

  const snapshot = await buildEventEditorSnapshot(
    {
      id: "event_rules",
      $id: "event_rules",
      name: "Rules event",
      description: "",
      eventType: "TOURNAMENT",
      sportIds: [],
      start: "2026-09-10T18:00:00.000Z",
      end: "2026-09-10T20:00:00.000Z",
      noFixedEndDateTime: false,
      timeZone: "UTC",
      location: "",
      address: "",
      coordinates: [0, 0],
      organizationId: null,
      hostId: "host_rules",
      state: "UNPUBLISHED",
      fieldIds: [],
      timeSlotIds: [],
      divisions: ["division_league"],
      divisionDetails: [],
      playoffDivisionDetails: [],
    },
    { client, mode: "EDIT", actor: { userId: "host_rules" } },
  );

  expect(snapshot.draft.competition.divisionDetails[0]).toEqual(
    expect.objectContaining({
      standingsOverrides: { wins: 2 },
      playoffConfig: expect.objectContaining({
        doubleElimination: true,
        winnerSetCount: 3,
        winnerBracketPointsToVictory: [21, 21, 15],
      }),
    }),
  );
  expect(snapshot.draft.competition.playoffDivisionDetails[0]).toEqual(
    expect.objectContaining({
      name: "Championship",
      standingsOverrides: null,
      playoffConfig: expect.objectContaining({
        doubleElimination: true,
        loserSetCount: 2,
        setDurationMinutes: 20,
      }),
    }),
  );

  const command = parseSaveEventEditorCommand({
    contractVersion: snapshot.contractVersion,
    editorRevision: snapshot.editorRevision,
    staffRevision: snapshot.staffRevision,
    draft: snapshot.draft,
    scheduleTransition: { mode: "PRESERVE" },
  });
  expect(command.draft.competition.playoffDivisionDetails).toEqual(
    snapshot.draft.competition.playoffDivisionDetails,
  );
});

it("collapses generated tournament pools into one editable bracket division", async () => {
  const bracketDivisionId = "event_pool__division__open";
  const poolDivisionIds = ["a", "b"].map(
    (suffix) => `event_pool__division__open_pool_${suffix}`,
  );
  const client = {
    ...buildClient([], []),
    divisions: {
      findMany: jest.fn().mockResolvedValue([
        ...poolDivisionIds.map((id, index) => ({
          id,
          eventId: "event_pool",
          status: "ACTIVE",
          kind: "LEAGUE",
          isSystemGenerated: true,
          key: `open_pool_${String.fromCharCode(97 + index)}`,
          name: `Pool ${String.fromCharCode(65 + index)}`,
          maxParticipants: 8,
          playoffTeamCount: 4,
          price: 16000,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentDueDates: [],
          installmentDueRelativeDays: [0, 14],
          installmentAmounts: [8000, 8000],
          teamIds: [`team_${index + 1}`],
          playoffPlacementDivisionIds: [bracketDivisionId, bracketDivisionId],
          fieldIds: [],
        })),
        {
          id: bracketDivisionId,
          eventId: "event_pool",
          status: "ACTIVE",
          kind: "PLAYOFF",
          key: "open",
          name: "Open",
          maxParticipants: 8,
          playoffTeamCount: 8,
          poolCount: 2,
          price: null,
          allowPaymentPlans: false,
          installmentCount: null,
          installmentDueDates: [],
          installmentDueRelativeDays: [],
          installmentAmounts: [],
          teamIds: [],
          fieldIds: [],
        },
      ]),
    },
  } as any;

  const snapshot = await buildEventEditorSnapshot(
    {
      id: "event_pool",
      $id: "event_pool",
      name: "Pool tournament",
      description: "",
      eventType: "TOURNAMENT",
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: false,
      maxParticipants: 16,
      playoffTeamCount: 8,
      sportIds: [],
      start: "2026-09-10T18:00:00.000Z",
      end: "2026-09-10T20:00:00.000Z",
      noFixedEndDateTime: false,
      timeZone: "UTC",
      location: "",
      address: "",
      coordinates: [0, 0],
      organizationId: null,
      hostId: "host_pool",
      state: "UNPUBLISHED",
      fieldIds: [],
      timeSlotIds: [],
      divisions: poolDivisionIds,
      divisionDetails: [],
      playoffDivisionDetails: [],
    },
    { client, mode: "EDIT", actor: { userId: "host_pool" } },
  );

  expect(snapshot.draft.competition.divisionIds).toEqual([bracketDivisionId]);
  expect(snapshot.draft.competition.divisionDetails).toEqual([
    expect.objectContaining({
      id: bracketDivisionId,
      maxParticipants: 16,
      playoffTeamCount: 8,
      poolCount: 2,
      poolTeamCount: 8,
      price: 16000,
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentDueRelativeDays: [0, 14],
      installmentAmounts: [8000, 8000],
      teamIds: ["team_1", "team_2"],
    }),
  ]);
  expect(snapshot.draft.competition.playoffDivisionDetails).toEqual([
    expect.objectContaining({
      id: bracketDivisionId,
      maxParticipants: 8,
      playoffTeamCount: 8,
    }),
  ]);
});

it("keeps organizer-owned rows that have generated pool fields", async () => {
  const bracketDivisionId = "event_pool__division__open";
  const organizerDivisionId = "event_pool__division__beginner_pool";
  const client = {
    ...buildClient([], []),
    divisions: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: organizerDivisionId,
          eventId: "event_pool",
          status: "ACTIVE",
          kind: "LEAGUE",
          role: "ENTRY",
          isSystemGenerated: false,
          key: "beginner_pool",
          name: "Beginner Pool",
          maxParticipants: 4,
          playoffTeamCount: 2,
          playoffPlacementDivisionIds: [bracketDivisionId],
          fieldIds: [],
          teamIds: [],
        },
        {
          id: bracketDivisionId,
          eventId: "event_pool",
          status: "ACTIVE",
          kind: "PLAYOFF",
          role: "PHASE",
          isSystemGenerated: false,
          key: "open",
          name: "Open",
          maxParticipants: 8,
          playoffTeamCount: 4,
          poolCount: 2,
          fieldIds: [],
          teamIds: [],
        },
      ]),
    },
  } as any;

  const snapshot = await buildEventEditorSnapshot(
    {
      id: "event_pool",
      $id: "event_pool",
      name: "Pool tournament",
      description: "",
      eventType: "TOURNAMENT",
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: false,
      maxParticipants: 8,
      playoffTeamCount: 4,
      sportIds: [],
      start: "2026-09-10T18:00:00.000Z",
      end: "2026-09-10T20:00:00.000Z",
      noFixedEndDateTime: false,
      timeZone: "UTC",
      location: "",
      address: "",
      coordinates: [0, 0],
      organizationId: null,
      hostId: "host_pool",
      state: "UNPUBLISHED",
      fieldIds: [],
      timeSlotIds: [],
      divisions: [organizerDivisionId],
      divisionDetails: [],
      playoffDivisionDetails: [],
    },
    { client, mode: "EDIT", actor: { userId: "host_pool" } },
  );

  expect(snapshot.draft.competition.divisionDetails).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: organizerDivisionId,
        name: "Beginner Pool",
        isSystemGenerated: false,
      }),
    ]),
  );
});

it("round-trips two collapsed tournament brackets through division sync", async () => {
  const eventId = "event_pool_roundtrip";
  const bracketNames = ["Open 18+", "Advanced 18+"];
  const bracketKeys = ["open", "advanced"];
  const bracketDivisionIds = bracketKeys.map(
    (key) => `${eventId}__division__${key}`,
  );
  const poolDivisionIds = bracketKeys.map(
    (key) => `${eventId}__division__${key}_pool_a`,
  );
  const poolRows = poolDivisionIds.map((id, index) => ({
    id,
    eventId,
    status: "ACTIVE",
    kind: "LEAGUE",
    role: "ENTRY",
    isSystemGenerated: true,
    key: `${bracketKeys[index]}_pool_a`,
    name: "Pool A",
    maxParticipants: 4,
    playoffTeamCount: 2,
    playoffPlacementDivisionIds: [
      bracketDivisionIds[index],
      bracketDivisionIds[index],
    ],
    teamIds: [],
    fieldIds: [],
  }));
  const bracketRows = bracketDivisionIds.map((id, index) => ({
    id,
    eventId,
    status: "ACTIVE",
    kind: "PLAYOFF",
    role: "PHASE",
    phase: "BRACKET",
    isSystemGenerated: false,
    key: bracketKeys[index],
    name: bracketNames[index],
    maxParticipants: 4,
    playoffTeamCount: 2,
    poolCount: 1,
    playoffPlacementDivisionIds: [],
    teamIds: [],
    fieldIds: [],
  }));
  const persistedRows = [...poolRows, ...bracketRows];
  const snapshotClient = {
    ...buildClient([], []),
    divisions: {
      findMany: jest.fn().mockResolvedValue(persistedRows),
    },
  } as any;
  const snapshot = await buildEventEditorSnapshot(
    {
      id: eventId,
      $id: eventId,
      name: "Two bracket pool tournament",
      description: "",
      eventType: "TOURNAMENT",
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: false,
      maxParticipants: 8,
      playoffTeamCount: 4,
      sportIds: [],
      start: "2026-09-10T18:00:00.000Z",
      end: "2026-09-10T20:00:00.000Z",
      noFixedEndDateTime: false,
      timeZone: "UTC",
      location: "",
      address: "",
      coordinates: [0, 0],
      organizationId: null,
      hostId: "host_pool",
      state: "UNPUBLISHED",
      fieldIds: [],
      timeSlotIds: [],
      divisions: poolDivisionIds,
      divisionDetails: [],
      playoffDivisionDetails: [],
    },
    { client: snapshotClient, mode: "EDIT", actor: { userId: "host_pool" } },
  );
  expect(snapshot.draft.competition.divisionIds).toEqual(bracketDivisionIds);
  expect(
    snapshot.draft.competition.divisionDetails.map((detail) => detail.name),
  ).toEqual(bracketNames);

  const divisionUpsert = jest.fn().mockResolvedValue(undefined);
  const syncClient = {
    divisions: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(persistedRows)
        .mockResolvedValueOnce(bracketRows),
      deleteMany: jest.fn().mockResolvedValue(undefined),
      upsert: divisionUpsert,
    },
    eventDivisionPhaseSources: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    eventDivisionPhaseParticipants: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
  };
  await syncEventDivisions(
    {
      eventId,
      divisionIds: snapshot.draft.competition.divisionIds,
      fieldIds: [],
      includePlayoffs: snapshot.draft.competition.includePlayoffs,
      singleDivision: false,
      divisionDetails: snapshot.draft.competition.divisionDetails,
      playoffDivisionDetails: snapshot.draft.competition.playoffDivisionDetails,
      defaultMaxParticipants: snapshot.draft.participation.maxParticipants,
      defaultPlayoffTeamCount: snapshot.draft.competition.playoffTeamCount,
      eventType: snapshot.draft.basics.eventType,
    },
    syncClient as any,
  );

  bracketRows.forEach((bracket) => {
    expect(divisionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bracket.id },
        create: expect.objectContaining({
          name: bracket.name,
          role: "PHASE",
          isSystemGenerated: false,
        }),
      }),
    );
  });
  poolDivisionIds.forEach((poolDivisionId) => {
    expect(divisionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: poolDivisionId },
        create: expect.objectContaining({ isSystemGenerated: true }),
      }),
    );
  });
});

it("preserves a saved two-team tournament so the editor can reject it", async () => {
  const divisionId = "event_legacy__division__open";
  const playoffDivisionId = "event_legacy__division__playoff";
  const snapshot = await buildEventEditorSnapshot(
    {
      id: "event_legacy",
      $id: "event_legacy",
      name: "Legacy tournament",
      description: "",
      eventType: "TOURNAMENT",
      includePlayoffs: true,
      teamSignup: true,
      singleDivision: true,
      maxParticipants: 2,
      playoffTeamCount: 2,
      sportIds: [],
      start: "2026-09-10T18:00:00.000Z",
      end: "2026-09-10T20:00:00.000Z",
      noFixedEndDateTime: false,
      timeZone: "UTC",
      location: "",
      address: "",
      coordinates: [0, 0],
      organizationId: null,
      hostId: "host_legacy",
      state: "UNPUBLISHED",
      fieldIds: [],
      timeSlotIds: [],
      divisions: [divisionId],
      divisionDetails: [
        {
          id: divisionId,
          kind: "LEAGUE",
          key: "open",
          name: "Open",
          maxParticipants: 2,
          playoffTeamCount: 2,
          fieldIds: [],
        },
      ],
      playoffDivisionDetails: [
        {
          id: playoffDivisionId,
          kind: "PLAYOFF",
          key: "playoff",
          name: "Playoff",
          maxParticipants: 2,
          playoffTeamCount: 2,
          fieldIds: [],
        },
      ],
    },
    {
      client: buildClient([], []) as any,
      mode: "EDIT",
      actor: { userId: "host_legacy" },
    },
  );

  expect(snapshot.draft.participation.maxParticipants).toBe(2);
  expect(snapshot.draft.competition.playoffTeamCount).toBe(2);
  expect(snapshot.draft.competition.divisionDetails[0]).toEqual(
    expect.objectContaining({
      maxParticipants: 2,
      playoffTeamCount: 2,
    }),
  );
  expect(snapshot.draft.competition.playoffDivisionDetails[0]).toEqual(
    expect.objectContaining({
      maxParticipants: 2,
      playoffTeamCount: 2,
    }),
  );
});
