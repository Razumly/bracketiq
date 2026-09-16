/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/contracts/eventEditor", () => {
  const actual = jest.requireActual("@/contracts/eventEditor");
  return {
    ...actual,
    eventEditorMaintenanceAcceptedResultSchema: { parse: (value: unknown) => value },
    eventEditorMaintenanceProposalSchema: { parse: (value: unknown) => value },
    eventEditorMaintenanceRejectedResultSchema: { parse: (value: unknown) => value },
    eventEditorMaintenanceScheduleOutcomeSchema: { parse: (value: unknown) => value },
  };
});
jest.mock("@/server/repositories/locks", () => ({
  acquireEventLock: jest.fn(),
  acquireFieldLocks: jest.fn(),
  acquireRentalBookingLocks: jest.fn(),
  acquireTimeSlotLocks: jest.fn(),
}));
jest.mock("@/server/repositories/fieldSchedulingConflicts", () => ({
  loadFieldBlockerCatalog: jest.fn(),
}));
jest.mock("@/server/repositories/events", () => ({
  loadEventWithRelations: jest.fn(),
  persistScheduledRosterTeams: jest.fn(),
  saveEventSchedule: jest.fn(),
  saveMatches: jest.fn(),
}));
jest.mock("@/server/events/eventEditorSnapshot", () => ({
  computeEventEditorRevision: jest.fn((value: unknown) => JSON.stringify(value)),
  loadEventScheduleState: jest.fn(),
  loadExistingEventEditorSnapshot: jest.fn(),
}));
jest.mock("@/server/events/eventProtectedHistory", () => ({
  loadEventProtectedHistory: jest.fn(),
}));
jest.mock("@/server/scheduler/eventScheduleMutation", () => ({
  editorMatchProjectionsFor: jest.fn(),
  reconcileEventSchedule: jest.fn(),
  validateAndNormalizeSerializedGraph: jest.fn(),
}));
jest.mock("@/server/scheduler/serialize", () => ({
  serializeEvent: jest.fn(),
  serializeMatches: jest.fn(),
}));
jest.mock("@/server/accessControl", () => ({
  canManageEvent: jest.fn(),
}));
jest.mock("@/server/matchScheduleNotifications", () => ({
  collectMatchScheduleChanges: jest.fn(() => []),
  snapshotMatchScheduleState: jest.fn(() => new Map()),
}));
import {
  acceptMaintenanceProposal,
  classifyMaintenanceMatch,
  createMaintenanceProposal,
  protectedMaintenanceMatchIds,
  rejectMaintenanceProposal,
  type MaintenanceClient,
} from "@/server/scheduler/eventScheduleMaintenance";
import { canManageEvent } from "@/server/accessControl";
import {
  loadEventScheduleState,
  loadExistingEventEditorSnapshot,
} from "@/server/events/eventEditorSnapshot";
import { loadEventProtectedHistory } from "@/server/events/eventProtectedHistory";
import {
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
} from "@/server/repositories/events";
import { loadFieldBlockerCatalog } from "@/server/repositories/fieldSchedulingConflicts";
import {
  acquireEventLock,
  acquireFieldLocks,
  acquireRentalBookingLocks,
  acquireTimeSlotLocks,
} from "@/server/repositories/locks";
import {
  editorMatchProjectionsFor,
  reconcileEventSchedule,
  validateAndNormalizeSerializedGraph,
} from "@/server/scheduler/eventScheduleMutation";
import { serializeEvent, serializeMatches } from "@/server/scheduler/serialize";
import type {
  EventEditorAcceptMaintenanceProposal,
  EventEditorMaintenanceProposal,
  EventEditorMaintenanceRequest,
  EventEditorRejectMaintenanceProposal,
} from "@/contracts/eventEditor";
import type { League, Match } from "@/server/scheduler/types";

const match = (overrides: Record<string, unknown> = {}) => ({
  id: "match_1",
  locked: false,
  status: null,
  resultStatus: null,
  resultType: null,
  actualStart: null,
  actualEnd: null,
  winnerEventTeamId: null,
  team1Points: [],
  team2Points: [],
  placementState: "UNPLACED",
  ...overrides,
}) as unknown as Match;

describe("maintenance Match protection", () => {
  it("protects a Match with only the explicit lock flag", () => {
    expect(classifyMaintenanceMatch(match({ locked: true }))).toBe("PROTECTED");
  });

  it("protects completed and in-progress status even without a lock", () => {
    expect(classifyMaintenanceMatch(match({ status: "COMPLETED" }))).toBe("PROTECTED");
    expect(classifyMaintenanceMatch(match({ resultStatus: "IN_PROGRESS" }))).toBe("PROTECTED");
  });

  it("protects authoritative history IDs and leaves an untouched future node replaceable", () => {
    expect(classifyMaintenanceMatch(match(), new Set(["match_1"]))).toBe("PROTECTED");
    expect(classifyMaintenanceMatch(match({ id: "match_2" }))).toBe("REPLACEABLE");
  });

  it("returns the union of protected and replaceable graph identities", () => {
    const ids = protectedMaintenanceMatchIds([
      match({ id: "locked", locked: true }),
      match({ id: "started", status: "STARTED" }),
      match({ id: "future" }),
    ], new Set(["future"]));
    expect(ids).toEqual(new Set(["locked", "started", "future"]));
  });
});
const emptyBlockerCatalog = () => ({
  lowerBound: new Date("2026-01-01T00:00:00.000Z"),
  intervalsByFieldId: new Map(),
  recurringByFieldId: new Map(),
});

const maintenanceEvent = (
  overrides: Record<string, unknown> = {},
): League => ({
  id: "event_1",
  name: "League",
  eventType: "LEAGUE",
  automatedScheduling: true,
  start: new Date("2026-06-01T10:00:00.000Z"),
  end: new Date("2026-06-01T18:00:00.000Z"),
  scheduleEndConstraint: null,
  generatedScheduleEnd: null,
  noFixedEndDateTime: false,
  fields: {
    field_1: { id: "field_1", name: "Field 1" },
  },
  timeSlots: [
    {
      id: "slot_1",
      fieldIds: ["field_1"],
      rentalBookingId: "booking_1",
      rentalBookingItemId: "booking_item_1",
    },
  ],
  matches: {},
  officialPositions: [],
  ...overrides,
} as unknown as League);

const maintenanceRequest = (
  operation: EventEditorMaintenanceRequest["operation"] = "REBUILD",
): EventEditorMaintenanceRequest => ({
  contractVersion: 3,
  eventId: "event_1",
  operation,
  operationId: "operation_1",
});

const maintenanceClientFor = () => {
  const operations = {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
  const client = {
    events: {
      findUnique: jest.fn().mockResolvedValue({
        id: "event_1",
        hostId: "host_1",
        assistantHostIds: [],
        organizationId: null,
        automatedScheduling: true,
      }),
    },
    fields: {
      findMany: jest.fn().mockResolvedValue([{ id: "field_1", revision: "field-1" }]),
    },
    timeSlots: {
      findMany: jest.fn().mockResolvedValue([{ id: "slot_1", revision: "slot-1" }]),
    },
    rentalBookings: {
      findMany: jest.fn().mockResolvedValue([{ id: "booking_1", revision: "booking-1" }]),
    },
    rentalBookingItems: {
      findMany: jest.fn().mockResolvedValue([
        { id: "booking_item_1", revision: "booking-item-1" },
      ]),
    },
    matches: {
      deleteMany: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    divisions: {
      update: jest.fn().mockResolvedValue(undefined),
    },
    teamCheckIns: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    broadcastOverlayStates: {
      updateMany: jest.fn().mockResolvedValue(undefined),
    },
    matchSegments: {
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
    matchIncidents: {
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
    eventEditorMaintenanceOperations: operations,
  };
  return {
    client: client as unknown as MaintenanceClient,
    rawClient: client,
    operations,
  };
};

const acceptanceRequestFor = (
  proposal: EventEditorMaintenanceProposal,
): EventEditorAcceptMaintenanceProposal => ({
  contractVersion: 3,
  eventId: proposal.eventId,
  operation: proposal.operation,
  operationId: proposal.operationId,
  proposalRevision: proposal.proposalRevision,
  acceptanceOperationId: "acceptance_1",
});

const configureMaintenanceMocks = () => {
  (acquireEventLock as jest.Mock).mockResolvedValue(undefined);
  (acquireFieldLocks as jest.Mock).mockResolvedValue(undefined);
  (acquireRentalBookingLocks as jest.Mock).mockResolvedValue(undefined);
  (acquireTimeSlotLocks as jest.Mock).mockResolvedValue(undefined);
  (canManageEvent as jest.Mock).mockResolvedValue(true);
  (loadEventScheduleState as jest.Mock).mockResolvedValue({
    revision: "schedule_1",
  });
  (loadExistingEventEditorSnapshot as jest.Mock).mockResolvedValue({
    editorRevision: "editor_1",
    staffRevision: "staff_1",
  });
  (loadEventProtectedHistory as jest.Mock).mockResolvedValue({
    protectedMatchIds: new Set(),
  });
  (loadFieldBlockerCatalog as jest.Mock).mockResolvedValue(emptyBlockerCatalog());
  (editorMatchProjectionsFor as jest.Mock).mockReturnValue([]);
  (persistScheduledRosterTeams as jest.Mock).mockResolvedValue([]);
  (saveEventSchedule as jest.Mock).mockResolvedValue(undefined);
  (saveMatches as jest.Mock).mockResolvedValue(undefined);
  (validateAndNormalizeSerializedGraph as jest.Mock).mockImplementation(
    (_eventId: string, graph: unknown) => graph,
  );
  (serializeEvent as jest.Mock).mockImplementation((event: League) => ({
    id: event.id,
    name: event.name,
    end: event.end.toISOString(),
    generatedScheduleEnd: event.generatedScheduleEnd?.toISOString() ?? null,
    noFixedEndDateTime: event.noFixedEndDateTime,
    scheduleEndConstraint: event.scheduleEndConstraint?.toISOString() ?? null,
    hostId: null,
    eventType: event.eventType,
    includePlayoffs: false,
    singleDivision: false,
    teamSizeLimit: null,
    divisions: [],
    divisionDetails: [],
    playoffDivisionDetails: [],
    teams: [],
  }));
  (serializeMatches as jest.Mock).mockReturnValue([]);
};

describe("maintenance post-lock snapshots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureMaintenanceMocks();
  });

  it("rejects an incomplete outcome without a phase or division identity", async () => {
    const { client, operations } = maintenanceClientFor();
    const event = maintenanceEvent({
      matches: { match_1: match({ id: "match_1" }) },
    });
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [event.matches.match_1],
      warnings: [],
    });
    (editorMatchProjectionsFor as jest.Mock).mockReturnValue([{
      id: "match_1",
      placementState: "UNPLACED",
    }]);

    await expect(createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("REBUILD"),
    })).rejects.toMatchObject({
      code: "EDITOR_MAINTENANCE_INVALID",
      message: "Unscheduled Match match_1 has no Competition Phase or Division identity.",
    });
    expect(operations.create).not.toHaveBeenCalled();
  });

  it("uses the post-lock Event for proposal binding, state, and graph data", async () => {
    const { client, rawClient } = maintenanceClientFor();
    const before = maintenanceEvent({
      fields: {
        field_1: { id: "field_1", name: "Before" },
      },
      timeSlots: [{
        id: "slot_1",
        fieldIds: ["field_1"],
        rentalBookingId: "booking_1",
        rentalBookingItemId: "booking_item_1",
      }],
    });
    const after = maintenanceEvent({
      name: "After",
      fields: {
        field_2: { id: "field_2", name: "After" },
      },
      timeSlots: [{
        id: "slot_2",
        fieldIds: ["field_2"],
        rentalBookingId: "booking_2",
        rentalBookingItemId: "booking_item_2",
      }],
    });
    (rawClient.events.findUnique as jest.Mock).mockResolvedValue(after);
    const order: string[] = [];
    (loadEventWithRelations as jest.Mock).mockImplementation(async () => {
      order.push("load");
      return order.length === 1 ? before : after;
    });
    (acquireFieldLocks as jest.Mock).mockImplementation(async (_tx, ids: string[]) => {
      order.push(`field-lock:${ids.join(",")}`);
    });
    (acquireTimeSlotLocks as jest.Mock).mockImplementation(async (_tx, ids: string[]) => {
      order.push(`slot-lock:${ids.join(",")}`);
    });
    (acquireRentalBookingLocks as jest.Mock).mockImplementation(
      async (_tx, bookingIds: string[], bookingItemIds: string[]) => {
        order.push(`rental-lock:${bookingIds.join(",")}:${bookingItemIds.join(",")}`);
      },
    );
    (loadEventScheduleState as jest.Mock).mockImplementation(async (event: League) => {
      order.push(event === after ? "state-after" : "state-before");
      return { revision: "schedule_1" };
    });
    (rawClient.fields.findMany as jest.Mock).mockResolvedValue([
      { id: "field_2", revision: "field-2" },
    ]);
    (rawClient.timeSlots.findMany as jest.Mock).mockResolvedValue([
      { id: "slot_2", revision: "slot-2" },
    ]);
    (rawClient.rentalBookings.findMany as jest.Mock).mockResolvedValue([
      { id: "booking_2", revision: "booking-2" },
    ]);
    (rawClient.rentalBookingItems.findMany as jest.Mock).mockResolvedValue([
      { id: "booking_item_2", revision: "booking-item-2" },
    ]);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event: after,
      matches: [],
      warnings: [],
    });

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("BUILD"),
    });

    expect(order).toEqual([
      "load",
      "field-lock:field_1",
      "slot-lock:slot_1",
      "rental-lock:booking_1:booking_item_1",
      "load",
      "field-lock:field_2",
      "slot-lock:slot_2",
      "rental-lock:booking_2:booking_item_2",
      "load",
      "state-after",
    ]);
    expect(loadEventScheduleState).toHaveBeenCalledWith(after, "event_1", client);
    expect(proposal.graph.event).toEqual(expect.objectContaining({
      id: "event_1",
      name: "After",
    }));
    expect(proposal.revisionBinding.fieldRevisions).toEqual({
      field_2: expect.any(String),
    });
    expect(proposal.revisionBinding.timeSlotRevisions).toEqual({
      slot_2: expect.any(String),
    });
    expect(loadFieldBlockerCatalog).toHaveBeenCalledWith(expect.objectContaining({
      fieldIds: ["field_2"],
      excludeEventId: "event_1",
    }));
  });
  it("locks retained Match resources before loading the revision binding", async () => {
    const { client, rawClient } = maintenanceClientFor();
    const event = maintenanceEvent();
    const matchRows = [{
      id: "fixed_match",
      fieldId: "field_retained",
      division: "phase_1",
    }];
    const findMany = jest.fn().mockResolvedValue(matchRows);
    Object.assign(rawClient.matches, { findMany });
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (rawClient.fields.findMany as jest.Mock).mockResolvedValue([
      { id: "field_1", revision: "field-1" },
      { id: "field_retained", revision: "field-retained" },
    ]);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });

    await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("BUILD"),
    });

    expect(acquireFieldLocks).toHaveBeenCalledWith(
      client,
      ["field_1", "field_retained"],
    );
    expect(findMany).toHaveBeenCalled();
    expect(rawClient.fields.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["field_1", "field_retained"] },
      },
    });
  });

  it("rejects proposal creation when a displayed binding is stale at action time", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const event = maintenanceEvent();
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });

    const displayedProposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("BUILD"),
    });
    (rawClient.fields.findMany as jest.Mock).mockResolvedValue([
      { id: "field_1", revision: "field-after" },
    ]);

    await expect(createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: {
        ...maintenanceRequest("BUILD"),
        operationId: "operation_2",
        expectedRevisions: displayedProposal.revisionBinding,
      },
    })).rejects.toMatchObject({ code: "EDITOR_MAINTENANCE_STALE" });
    expect(reconcileEventSchedule).toHaveBeenCalledTimes(1);
    expect(operations.create).toHaveBeenCalledTimes(1);
    expect(loadEventProtectedHistory).toHaveBeenCalledTimes(1);
  });
  it.each(["BUILD", "COMPLETE", "REBUILD"] as const)(
    "accepts a matching full binding for %s proposal creation",
    async (operation) => {
      const { client, operations } = maintenanceClientFor();
      const event = maintenanceEvent({
        matches: operation === "BUILD"
          ? {}
          : { match_1: match({ id: "match_1" }) },
      });
      (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
      (reconcileEventSchedule as jest.Mock).mockResolvedValue({
        event,
        matches: [],
        warnings: [],
      });

      const displayedProposal = await createMaintenanceProposal({
        tx: client,
        actor: { userId: "host_1", isAdmin: false },
        request: {
          ...maintenanceRequest(operation),
          operationId: `display-${operation.toLowerCase()}`,
        },
      });
      const proposal = await createMaintenanceProposal({
        tx: client,
        actor: { userId: "host_1", isAdmin: false },
        request: {
          ...maintenanceRequest(operation),
          operationId: `matching-${operation.toLowerCase()}`,
          expectedRevisions: displayedProposal.revisionBinding,
        },
      });

      expect(proposal.status).toBe("PROPOSED");
      expect(reconcileEventSchedule).toHaveBeenCalledTimes(2);
      expect(operations.create).toHaveBeenCalledTimes(2);
    },
  );



  it("rejects acceptance when a field revision changes while waiting for the lock", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const event = maintenanceEvent({
      matches: {
        match_1: match({ id: "match_1" }),
      },
    });
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });
    let phase = "create";
    let fieldRevision = "field-before";
    (acquireFieldLocks as jest.Mock).mockImplementation(async () => {
      if (phase === "accept") fieldRevision = "field-after";
    });
    (rawClient.fields.findMany as jest.Mock).mockImplementation(async () => [
      { id: "field_1", revision: fieldRevision },
    ]);
    let operationRow: Record<string, unknown> | null = null;
    operations.findUnique.mockImplementation(async () => (
      operationRow ? operationRow : null
    ));

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest(),
    });
    operationRow = {
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "PROPOSED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    };
    phase = "accept";
    const acceptanceRequest = acceptanceRequestFor(proposal);

    await expect(acceptMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceRequest,
    })).rejects.toMatchObject({ code: "EDITOR_MAINTENANCE_STALE" });
    expect(saveMatches).not.toHaveBeenCalled();
    expect(persistScheduledRosterTeams).not.toHaveBeenCalled();
    expect(rawClient.matches.deleteMany).not.toHaveBeenCalled();
    expect(operations.update).not.toHaveBeenCalled();
    expect(acquireRentalBookingLocks).toHaveBeenCalledTimes(2);
  });

  it("rejects acceptance when rental rows or blockers change while waiting for the lock", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const event = maintenanceEvent({
      matches: {
        match_1: match({ id: "match_1" }),
      },
    });
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });
    let phase = "create";
    (rawClient.rentalBookings.findMany as jest.Mock).mockImplementation(async () => [
      { id: "booking_1", revision: phase === "create" ? "booking-before" : "booking-after" },
    ]);
    (loadFieldBlockerCatalog as jest.Mock).mockImplementation(async () => ({
      ...emptyBlockerCatalog(),
      intervalsByFieldId: phase === "create"
        ? new Map()
        : new Map([["field_1", [{
          fieldId: "field_1",
          start: new Date("2026-06-01T12:00:00.000Z"),
          end: new Date("2026-06-01T13:00:00.000Z"),
          source: {
            id: "blocker_1",
            eventId: "blocker_event",
            parentId: "blocker_event",
            kind: "ONE_TIME_EVENT",
            daysOfWeek: [],
            scheduledFieldIds: ["field_1"],
          },
        }]]]),
    }));
    let operationRow: Record<string, unknown> | null = null;
    operations.findUnique.mockImplementation(async () => (
      operationRow ? operationRow : null
    ));

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest(),
    });
    operationRow = {
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "PROPOSED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    };
    phase = "accept";

    await expect(acceptMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceRequestFor(proposal),
    })).rejects.toMatchObject({ code: "EDITOR_MAINTENANCE_STALE" });
    expect(saveMatches).not.toHaveBeenCalled();
    expect(persistScheduledRosterTeams).not.toHaveBeenCalled();
    expect(rawClient.matches.deleteMany).not.toHaveBeenCalled();
    expect(operations.update).not.toHaveBeenCalled();
  });

  it("passes every placed Match to Complete reconciliation for relation hydration", async () => {
    const { client } = maintenanceClientFor();
    const fixedMatch = match({
      id: "fixed_match",
      placementState: "PLACED",
      field: { id: "field_1", name: "Field 1" },
    });
    const openMatch = match({
      id: "open_match",
      placementState: "UNPLACED",
    });
    const event = maintenanceEvent({
      matches: { fixed_match: fixedMatch, open_match: openMatch },
    });
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    const staffingWarning = {
      code: "UNRESOLVED_TEAM_DUTY",
      message: "Some placed matches do not have a Team-duty assignment.",
      matchIds: ["fixed_match"],
    };
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [fixedMatch],
      warnings: [staffingWarning],
    });

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("COMPLETE"),
    });

    expect(proposal.scheduleOutcome.warnings).toEqual([staffingWarning]);

    expect(reconcileEventSchedule).toHaveBeenCalledWith(expect.objectContaining({
      mode: "RESCHEDULE_PRESERVING_LOCKS",
      protectedMatchIds: new Set(["fixed_match"]),
    }));
  });

  it("uses post-lock matches when deleting replaced Rebuild nodes", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const proposalEvent = maintenanceEvent({
      matches: {
        match_before: match({ id: "match_before" }),
      },
    });
    const acceptanceBeforeEvent = maintenanceEvent({
      matches: {
        match_before: match({ id: "match_before" }),
      },
    });
    const acceptanceAfterEvent = maintenanceEvent({
      matches: {
        match_after: match({ id: "match_after" }),
      },
    });
    const loadedEvents = [
      proposalEvent,
      proposalEvent,
      acceptanceBeforeEvent,
      acceptanceAfterEvent,
    ];
    (loadEventWithRelations as jest.Mock).mockImplementation(async () => loadedEvents.shift());
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event: proposalEvent,
      matches: [],
      warnings: [],
    });
    let operationRow: Record<string, unknown> | null = null;
    operations.findUnique.mockImplementation(async () => (
      operationRow ? operationRow : null
    ));

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest(),
    });
    Object.assign(proposal.graph.event, {
      teams: [{
        id: "placeholder_1",
        captainId: null,
        division: null,
        kind: "PLACEHOLDER",
        name: "TBD",
        playerIds: [],
        players: [],
        playerRegistrations: [],
      }],
    });
    operationRow = {
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "PROPOSED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    };

    const accepted = await acceptMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceRequestFor(proposal),
    });

    expect(rawClient.matches.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "event_1", id: { in: ["match_after"] } },
    });
    expect(persistScheduledRosterTeams).toHaveBeenCalledTimes(1);
    expect(saveEventSchedule).toHaveBeenCalledTimes(1);
    expect(persistScheduledRosterTeams).toHaveBeenCalledWith(
      {
        eventId: "event_1",
        scheduled: expect.objectContaining({
          teams: {
            placeholder_1: expect.objectContaining({
              captainId: null,
              playerIds: [],
              name: "TBD",
            }),
          },
        }),
      },
      client,
    );
    expect(accepted.response.status).toBe("ACCEPTED");
  });
  it("rejects an accepted graph that references an unresolved team", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const event = maintenanceEvent({
      matches: {
        match_1: match({ id: "match_1" }),
      },
    });
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });
    let operationRow: Record<string, unknown> | null = null;
    operations.findUnique.mockImplementation(async () => (
      operationRow ? operationRow : null
    ));

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest(),
    });
    Object.assign(proposal.graph, {
      matches: [{
        id: "reviewed_match",
        division: null,
        sourceDivisionId: null,
        phaseDivisionId: null,
        team1Id: "missing_team",
        team2Id: null,
        teamOfficialId: null,
        winnerEventTeamId: null,
      }],
    });
    operationRow = {
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "PROPOSED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    };

    await expect(acceptMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceRequestFor(proposal),
    })).rejects.toMatchObject({
      code: "EDITOR_MAINTENANCE_INVALID",
      message: "Match reviewed_match references unknown team missing_team.",
    });
    expect(persistScheduledRosterTeams).not.toHaveBeenCalled();
    expect(saveMatches).not.toHaveBeenCalled();
    expect(rawClient.matches.deleteMany).not.toHaveBeenCalled();
  });


  it("rejects acceptance when teams, divisions, or officials change after the proposal", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const before = maintenanceEvent({
      teams: { team_1: { id: "team_1", name: "Before" } },
      divisions: [{ id: "division_1", name: "Before" }],
      officialPositions: [{ id: "position_1", name: "Before" }],
      eventOfficials: [{ id: "official_1", userId: "official_1" }],
      matches: {
        match_1: match({ id: "match_1" }),
      },
    });
    const after = maintenanceEvent({
      teams: { team_2: { id: "team_2", name: "After" } },
      divisions: [{ id: "division_2", name: "After" }],
      officialPositions: [{ id: "position_2", name: "After" }],
      eventOfficials: [{ id: "official_2", userId: "official_2" }],
      matches: {
        match_1: match({ id: "match_1" }),
      },
    });
    const loadedEvents = [before, before, after, after];
    (loadEventWithRelations as jest.Mock).mockImplementation(async () => loadedEvents.shift());
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event: before,
      matches: [],
      warnings: [],
    });
    (loadExistingEventEditorSnapshot as jest.Mock).mockResolvedValue({
      editorRevision: "editor_1",
      staffRevision: "staff_1",
    });
    let operationRow: Record<string, unknown> | null = null;
    operations.findUnique.mockImplementation(async () => (
      operationRow ? operationRow : null
    ));

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest(),
    });
    operationRow = {
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "PROPOSED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    };

    await expect(acceptMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceRequestFor(proposal),
    })).rejects.toMatchObject({ code: "EDITOR_MAINTENANCE_STALE" });
    expect(saveMatches).not.toHaveBeenCalled();
    expect(persistScheduledRosterTeams).not.toHaveBeenCalled();
    expect(rawClient.matches.deleteMany).not.toHaveBeenCalled();
    expect(operations.update).not.toHaveBeenCalled();
  });
  it("persists every reviewed Division team assignment on acceptance", async () => {
    const { client, rawClient, operations } = maintenanceClientFor();
    const event = maintenanceEvent();
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });
    let operationRow: Record<string, unknown> | null = null;
    operations.findUnique.mockImplementation(async () => operationRow);

    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("BUILD"),
    });
    const division = (id: string, role: string, teamIds: string[]) => ({
      id,
      name: id,
      kind: "LEAGUE",
      role,
      phase: role === "PHASE" ? "POOL" : null,
      sourceDivisionId: null,
      isSystemGenerated: false,
      phaseSettings: {},
      teamIds,
      playoffTeamCount: null,
      playoffPlacementDivisionIds: [],
      standingsOverrides: null,
      standingsConfirmedAt: null,
      standingsConfirmedBy: null,
      playoffConfig: null,
      leagueConfig: null,
    });
    Object.assign(proposal.graph.event, {
      divisions: ["phase_1", "playoff_1", "single_1"],
      divisionDetails: [
        division("phase_1", "PHASE", ["team_1"]),
        division("single_1", "ENTRY", ["team_2"]),
      ],
      playoffDivisionDetails: [
        division("playoff_1", "ENTRY", ["team_3"]),
      ],
    });
    operationRow = {
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "PROPOSED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    };

    await acceptMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceRequestFor(proposal),
    });

    expect(rawClient.divisions.update).toHaveBeenCalledTimes(3);
    expect(rawClient.divisions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "phase_1" },
      data: expect.objectContaining({ teamIds: ["team_1"] }),
    }));
    expect(rawClient.divisions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "playoff_1" },
      data: expect.objectContaining({ teamIds: ["team_3"] }),
    }));
    expect(rawClient.divisions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "single_1" },
      data: expect.objectContaining({ teamIds: ["team_2"] }),
    }));
  });
});

describe("maintenance rejection authorization", () => {
  it("reauthorizes the current Event actor before returning an idempotent rejection", async () => {
    jest.clearAllMocks();
    configureMaintenanceMocks();
    const { client, operations } = maintenanceClientFor();
    const event = maintenanceEvent();
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event,
      matches: [],
      warnings: [],
    });
    const proposal = await createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: maintenanceRequest("BUILD"),
    });
    operations.findUnique.mockResolvedValue({
      operationId: proposal.operationId,
      eventId: proposal.eventId,
      actorUserId: "host_1",
      operation: proposal.operation,
      requestHash: "request-hash",
      proposalRevision: proposal.proposalRevision,
      proposalJson: proposal,
      revisionBindingJson: proposal.revisionBinding,
      status: "REJECTED",
      acceptanceOperationId: null,
      acceptedResponseJson: null,
    });
    (canManageEvent as jest.Mock).mockResolvedValue(false);
    const request: EventEditorRejectMaintenanceProposal = {
      contractVersion: 3,
      eventId: proposal.eventId,
      operation: proposal.operation,
      operationId: proposal.operationId,
      proposalRevision: proposal.proposalRevision,
    };

    await expect(rejectMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request,
    })).rejects.toMatchObject({ code: "EDITOR_MAINTENANCE_UNAUTHORIZED" });
    expect(operations.update).not.toHaveBeenCalled();
  });
});
