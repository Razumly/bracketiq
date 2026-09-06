/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/server/repositories/locks", () => ({
  acquireEventLock: jest.fn(),
  acquireFieldLocks: jest.fn(),
  acquireTimeSlotLocks: jest.fn(),
  acquireEventTemplateLocks: jest.fn(),
  acquireRentalBookingLocks: jest.fn(),
}));
jest.mock("@/server/repositories/events", () => ({
  upsertEventFromPayload: jest.fn(),
}));
jest.mock("@/server/accessControl", () => ({
  canManageEvent: jest.fn().mockResolvedValue(true),
  hasOrgPermission: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/server/scheduler/matchTimingPolicy", () => ({
  resolveMatchTimingPolicy: jest.fn().mockReturnValue({
    durationMinutes: 60,
    breakMinutes: 0,
    totalMinutes: 60,
    source: "MATCH_DURATION",
  }),
}));
jest.mock(
  "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters",
  () => ({
    editorDraftToLegacyEvent: jest.fn().mockReturnValue({}),
  }),
);
jest.mock("../eventEditorSnapshot", () => ({
  buildEventEditorSnapshot: jest.fn(),
  loadEventEditorSnapshot: jest.fn(),
  loadCreateEventEditorSnapshot: jest.fn(),
  computeEventEditorRevision: jest.fn().mockReturnValue("revision"),
}));
jest.mock("../eventStaffReconciliation", () => ({
  EVENT_STAFF_CONTRACT_VERSION: 1,
  EventStaffInputError: class EventStaffInputError extends Error {},
  reconcileEventStaffDesiredState: jest
    .fn()
    .mockResolvedValue({ emailCandidates: [] }),
}));
jest.mock("@/server/scheduler/serialize", () => ({
  serializeEvent: jest.fn((event: Record<string, unknown>) => event),
  serializeMatches: jest.fn((matches: Array<Record<string, unknown>>) => matches),
}));
jest.mock("@/server/scheduler/eventScheduleMutation", () => {
  class EventScheduleMutationError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "EventScheduleMutationError";
      this.code = code;
    }
  }

  class EventScheduleRevisionConflictError extends EventScheduleMutationError {
    readonly currentRevision: string;

    constructor(currentRevision: string) {
      super("EDITOR_SCHEDULE_REVISION_CONFLICT", "The schedule changed.");
      this.name = "EventScheduleRevisionConflictError";
      this.currentRevision = currentRevision;
    }
  }

  return {
    EventScheduleMutationError,
    EventScheduleProposalGraphError: class EventScheduleProposalGraphError extends Error {},
    EventScheduleRevisionConflictError,
    persistCreateOnlyMatchGraph: jest.fn(),
    persistSerializedScheduleGraph: jest.fn(),
    reconcileEventSchedule: jest.fn(),
    validateAndNormalizeSerializedGraph: jest.fn(
      (_eventId: string, graph: unknown) => graph,
    ),
    editorMatchProjectionsFor: jest.fn(
      (matches: Array<Record<string, unknown>>) =>
        matches.map((match) => ({
          id: String(match.id ?? ""),
          matchId: typeof match.matchId === "number" ? match.matchId : null,
          eventId: String(match.eventId ?? "event-created"),
          start: null,
          end: null,
          locked: false,
          placementState: "UNPLACED",
          phase: typeof match.phase === "string" ? match.phase : null,
          sourceDivisionId: typeof match.sourceDivisionId === "string"
            ? match.sourceDivisionId
            : null,
          phaseDivisionId: typeof match.phaseDivisionId === "string"
            ? match.phaseDivisionId
            : null,
          division: typeof match.division === "string" ? match.division : null,
          fieldId: null,
          team1Id: null,
          team2Id: null,
          team1Seed: null,
          team2Seed: null,
          status: null,
          resultStatus: null,
          resultType: null,
          actualStart: null,
          actualEnd: null,
          statusReason: null,
          winnerEventTeamId: null,
          matchRulesSnapshot: null,
          resolvedMatchRules: null,
          segments: [],
          incidents: [],
          officialId: null,
          officialIds: [],
          teamOfficialId: null,
          team1Points: [],
          team2Points: [],
          losersBracket: false,
          winnerNextMatchId: null,
          loserNextMatchId: null,
          previousLeftId: null,
          previousRightId: null,
          side: null,
          officialCheckedIn: false,
        })),
    ),
  };
});

import { eventEditorFixtures } from "@/test/eventEditor/fixtures";
import { prisma } from "@/lib/prisma";
import type { CreateEventEditorCommand } from "@/contracts/eventEditor";
import type * as EditorContractAdapters from "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters";
import { editorDraftToLegacyEvent } from "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters";
import { EventDivisionNameValidationError } from "@/lib/divisionTypes";
import { acquireEventLock } from "@/server/repositories/locks";
import { upsertEventFromPayload } from "@/server/repositories/events";
import {
  buildEventEditorSnapshot,
  loadCreateEventEditorSnapshot,
  loadEventEditorSnapshot,
  computeEventEditorRevision,
} from "../eventEditorSnapshot";
import {
  EventStaffInputError,
  reconcileEventStaffDesiredState,
} from "../eventStaffReconciliation";
import {
  EventScheduleProposalGraphError,
  editorMatchProjectionsFor,
  persistCreateOnlyMatchGraph,
  persistSerializedScheduleGraph,
  reconcileEventSchedule,
  validateAndNormalizeSerializedGraph,
} from "@/server/scheduler/eventScheduleMutation";
import {
  createScheduleProposalFromEditor,
  acceptScheduleProposalFromEditor,
  acceptPartialScheduleProposalFromEditor,
  rejectScheduleProposalFromEditor,
  createEventEditor,
  EditorInputError,
  EditorPermissionError,
  EventEditorProposalInvalidError,
  EditorRevisionConflictError,
  EventEditorProposalStaleError,
  saveEventEditor,
} from "../eventEditorSave";

const mockedPersistSerializedScheduleGraph =
  persistSerializedScheduleGraph as jest.Mock;
const mockedPersistCreateOnlyMatchGraph =
  persistCreateOnlyMatchGraph as jest.Mock;
const mockedReconcileEventSchedule = reconcileEventSchedule as jest.Mock;
const mockedValidateAndNormalizeSerializedGraph =
  validateAndNormalizeSerializedGraph as jest.Mock;
const mockedEditorMatchProjectionsFor = editorMatchProjectionsFor as jest.Mock;

const txFor = (questionRows: Array<{ id: string }> = []) => {
  const tx: any = {
    events: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "event_1", hostId: "host_1" }),
    },
    fields: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    timeSlots: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    registrationQuestions: {
      findMany: jest
        .fn()
        .mockImplementation(async () =>
          questionRows.map((row) => ({ ...row })),
        ),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        questionRows.push({ id: data.id });
        return data;
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  (prisma as any).$transaction = jest.fn(
    async (callback: (client: any) => unknown) => callback(tx),
  );
  return tx;
};

const snapshot = (editorRevision = "revision_1") =>
  ({
    contractVersion: 3,
    mode: "EDIT",
    eventId: "event_1",
    editorRevision,
    staffRevision: "staff_revision_1",
    draft: {
      basics: { eventType: "EVENT" },
    },
    capabilities: {
      canUseOnlinePayments: true,
      canManageStaff: true,
      canEdit: true,
      canDelegateHost: true,
      readOnly: false,
      readOnlyReason: null,
      managementAuthority: null,
      eventHostId: "host_1",
      viewerIsEventHost: true,
      supportsTeamStaffing: true,
    },
    catalogs: { sports: [], organizations: [], fields: [], templates: [] },
    immutable: { fieldNames: [], rental: false, template: false },
    scheduleState: {
      sourceType: null,
      matchCount: 0,
      availableMaintenanceOperations: [],
      revision: "schedule_revision_1",
      hasProtectedHistory: false,
    },
  }) as any;

const commandFor = (questions: unknown[]) =>
  ({
    contractVersion: 3,
    editorRevision: "revision_1",
    staffRevision: "staff_revision_1",
    draft: {
      basics: { eventType: "EVENT", hostId: "host_1", organizationId: null, affiliateUrl: "" },
      registration: {
        payment: { mode: "FREE", priceCents: 0 },
        questions,
      },
      competition: {
        usesSets: false,
        matchDurationMinutes: 60,
        matchRulesOverride: null,
        divisionDetails: [],
        playoffDivisionDetails: [],
        divisionFieldIds: {},
      },
      staff: {
        assistantHostIds: [],
        officialPositions: [],
        eventOfficials: [],
        pendingInvites: [],
      },
      resources: { fieldIds: [], timeSlotIds: [], fields: [], timeSlots: [] },
    },
    scheduleTransition: { mode: "PRESERVE" },
  }) as any;
const actualEditorAdapters = jest.requireActual(
  "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters",
) as typeof EditorContractAdapters;
const createDraft = actualEditorAdapters.legacyEventToEditorDraft(
  eventEditorFixtures[0].event,
);
const leagueCreateDraft = actualEditorAdapters.legacyEventToEditorDraft(
  eventEditorFixtures[1].event,
);
const tournamentBootstrapDraft = actualEditorAdapters.legacyEventToEditorDraft(
  eventEditorFixtures[2].event,
);
const tournamentPlannedEnd = "2026-09-10T20:00:00.000Z";
const tournamentCreateDraft = {
  ...tournamentBootstrapDraft,
  schedule: {
    ...tournamentBootstrapDraft.schedule,
    isAutomatedScheduling: false,
    mode: "FIXED_END" as const,
    endConstraint: tournamentPlannedEnd,
  },
};
const expectedCreateRevisions = {
  editorRevision: "create-editor-revision",
  staffRevision: "create-staff-revision",
  scheduleRevision: "new",
};
const createSnapshot = (mode: "CREATE" | "EDIT", eventId: string | null) => ({
  contractVersion: 3,
  mode,
  eventId,
  editorRevision: "create-editor-revision",
  staffRevision: "create-staff-revision",
  draft: createDraft,
  capabilities: {
    canUseOnlinePayments: true,
    canManageStaff: true,
    canEdit: true,
    canDelegateHost: true,
    readOnly: false,
    readOnlyReason: null,
    managementAuthority: null,
    eventHostId: "host_1",
    viewerIsEventHost: true,
    supportsTeamStaffing: true,
  },
  catalogs: { sports: [], organizations: [], fields: [], templates: [] },
  immutable: { fieldNames: [], rental: false, template: false },
  scheduleState: {
    sourceType: null,
    matchCount: 0,
    availableMaintenanceOperations: [],
    revision: mode === "CREATE" ? "new" : "schedule_revision_1",
    hasProtectedHistory: false,
  },
});
const serializedProposalEvent = (eventId: string) => ({
  id: eventId,
  name: "Proposal Event",
  description: "",
  start: "2026-08-24T09:00:00.000Z",
  end: "2026-08-24T17:00:00.000Z",
  location: "Fixture",
  coordinates: null,
  price: null,
  minAge: null,
  maxAge: null,
  rating: null,
  imageId: "",
  hostId: "host_1",
  noFixedEndDateTime: false,
  scheduleEndConstraint: null,
  generatedScheduleEnd: null,
  state: "UNPUBLISHED",
  maxParticipants: 16,
  teamSizeLimit: 2,
  restTimeMinutes: 10,
  teamSignup: true,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  teamIds: [],
  userIds: [],
  fieldIds: [],
  timeSlotIds: [],
  officialIds: [],
  officialSchedulingMode: "SCHEDULE",
  staffingPriority: "BEST_AVAILABLE_COVERAGE",
  officialPositions: [],
  eventOfficials: [],
  matchRulesOverride: null,
  autoCreatePointMatchIncidents: false,
  resolvedMatchRules: null,
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: null,
  eventType: "LEAGUE",
  sportIds: [],
  leagueScoringConfigId: null,
  organizationId: null,
  requiredTemplateIds: [],
  allowPaymentPlans: false,
  installmentCount: 0,
  installmentDueDates: [],
  installmentDueRelativeDays: [],
  installmentAmounts: [],
  allowTeamSplitDefault: false,
  splitLeaguePlayoffDivisions: false,
  divisions: [],
  divisionDetails: [],
  playoffDivisionDetails: [],
  fields: [],
  teams: [],
  timeSlots: [],
  officials: [],
  gamesPerOpponent: 1,
  includePlayoffs: false,
  playoffTeamCount: 0,
  pointsToVictory: [],
});

const serializedProposalMatch = (eventId: string) => ({
  id: "match-created",
  matchId: 1,
  eventId,
  start: "2026-08-24T09:00:00.000Z",
  end: "2026-08-24T10:00:00.000Z",
  locked: false,
  placementState: "PLACED",
  phase: null,
  sourceDivisionId: null,
  phaseDivisionId: null,
  division: null,
  fieldId: null,
  team1Id: "team-fixture",
  team2Id: null,
  team1Seed: null,
  team2Seed: null,
  status: null,
  resultStatus: null,
  resultType: null,
  actualStart: null,
  actualEnd: null,
  statusReason: null,
  winnerEventTeamId: null,
  matchRulesSnapshot: null,
  resolvedMatchRules: null,
  segments: [],
  incidents: [],
  officialIds: [],
  officialAssignments: [],
  teamOfficialId: null,
  teamOfficialSeed: null,
  team1Points: [],
  team2Points: [],
  losersBracket: false,
  winnerNextMatchId: null,
  loserNextMatchId: null,
  previousLeftId: null,
  previousRightId: null,
  side: null,
  officialCheckedIn: false,
  team1: null,
  team2: null,
  teamOfficial: null,
  official: null,
  field: null,
});
const partialProjectionFor = (match: Record<string, unknown>) => ({
  id: String(match.id),
  matchId: typeof match.matchId === "number" ? match.matchId : null,
  eventId: String(match.eventId),
  start: typeof match.start === "string" ? match.start : null,
  end: typeof match.end === "string" ? match.end : null,
  locked: Boolean(match.locked),
  placementState: match.placementState,
  phase: typeof match.phase === "string" ? match.phase : null,
  sourceDivisionId:
    typeof match.sourceDivisionId === "string" ? match.sourceDivisionId : null,
  phaseDivisionId:
    typeof match.phaseDivisionId === "string" ? match.phaseDivisionId : null,
  division: typeof match.division === "string" ? match.division : null,
  fieldId: typeof match.fieldId === "string" ? match.fieldId : null,
  team1Id: typeof match.team1Id === "string" ? match.team1Id : null,
  team2Id: typeof match.team2Id === "string" ? match.team2Id : null,
  team1Seed: typeof match.team1Seed === "number" ? match.team1Seed : null,
  team2Seed: typeof match.team2Seed === "number" ? match.team2Seed : null,
  status: typeof match.status === "string" ? match.status : null,
  resultStatus:
    typeof match.resultStatus === "string" ? match.resultStatus : null,
  resultType: typeof match.resultType === "string" ? match.resultType : null,
  actualStart: typeof match.actualStart === "string" ? match.actualStart : null,
  actualEnd: typeof match.actualEnd === "string" ? match.actualEnd : null,
  statusReason:
    typeof match.statusReason === "string" ? match.statusReason : null,
  winnerEventTeamId:
    typeof match.winnerEventTeamId === "string"
      ? match.winnerEventTeamId
      : null,
  matchRulesSnapshot:
    match.matchRulesSnapshot &&
    typeof match.matchRulesSnapshot === "object" &&
    !Array.isArray(match.matchRulesSnapshot)
      ? match.matchRulesSnapshot
      : null,
  resolvedMatchRules:
    match.resolvedMatchRules &&
    typeof match.resolvedMatchRules === "object" &&
    !Array.isArray(match.resolvedMatchRules)
      ? match.resolvedMatchRules
      : null,
  segments: Array.isArray(match.segments) ? match.segments : [],
  incidents: Array.isArray(match.incidents) ? match.incidents : [],
  officialId: typeof match.officialId === "string" ? match.officialId : null,
  officialIds: Array.isArray(match.officialIds) ? match.officialIds : [],
  teamOfficialId:
    typeof match.teamOfficialId === "string" ? match.teamOfficialId : null,
  team1Points: Array.isArray(match.team1Points) ? match.team1Points : [],
  team2Points: Array.isArray(match.team2Points) ? match.team2Points : [],
  losersBracket: Boolean(match.losersBracket),
  winnerNextMatchId:
    typeof match.winnerNextMatchId === "string"
      ? match.winnerNextMatchId
      : null,
  loserNextMatchId:
    typeof match.loserNextMatchId === "string" ? match.loserNextMatchId : null,
  previousLeftId:
    typeof match.previousLeftId === "string" ? match.previousLeftId : null,
  previousRightId:
    typeof match.previousRightId === "string" ? match.previousRightId : null,
  side: typeof match.side === "string" ? match.side : null,
  officialCheckedIn: Boolean(match.officialCheckedIn),
});

const createEventEditorTxFor = (
  resources: {
    fields?: Array<Record<string, unknown>>;
    timeSlots?: Array<Record<string, unknown>>;
  } = {},
) => {
  const rows = new Map<string, any>();
  const operations = {
    findUnique: jest.fn(
      async ({ where }: any) =>
        rows.get(String(where.createOperationId)) ?? null,
    ),
    createMany: jest.fn(async ({ data }: any) => {
      const key = String(data.createOperationId);
      if (rows.has(key)) return { count: 0 };
      rows.set(key, {
        proposalJson: null,
        proposalRevision: null,
        proposalStatus: "NONE",
        ...data,
      });
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(String(where.createOperationId));
      if (!row) throw new Error("create operation not found");
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(String(where.createOperationId));
      if (!row || (where.updatedAt && row.updatedAt !== where.updatedAt)) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    }),
    delete: jest.fn(async ({ where }: any) => {
      rows.delete(String(where.createOperationId));
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const row = rows.get(String(where.createOperationId));
      if (
        !row
        || Object.entries(where).some(([key, value]) => row[key] !== value)
      ) {
        return { count: 0 };
      }
      rows.delete(String(where.createOperationId));
      return { count: 1 };
    }),
  };
  const fieldRows = resources.fields ?? [];
  const timeSlotRows = resources.timeSlots ?? [];
  const questionRows: Array<{ id: string }> = [];
  const tx: any = {
    eventEditorCreateOperations: operations,
    events: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "event-source", hostId: "host_1" }),
    },
    organizations: {
      findUnique: jest.fn(),
    },
    staffMembers: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    invites: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    registrationQuestions: {
      findMany: jest.fn().mockResolvedValue(questionRows),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        questionRows.push({ id: data.id });
        return data;
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    fields: {
      findMany: jest.fn().mockImplementation(async () =>
        fieldRows.map((row) => ({ ...row })),
      ),
    },
    timeSlots: {
      findMany: jest.fn().mockImplementation(async () =>
        timeSlotRows.map((row) => ({ ...row })),
      ),
    },
    rentalBookings: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    rentalBookingItems: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  (prisma as any).eventEditorCreateOperations = operations;
  (prisma as any).$transaction = jest.fn(
    async (callback: (client: unknown) => unknown) => {
      const fieldRowsBefore = fieldRows.map((row) => ({ ...row }));
      const timeSlotRowsBefore = timeSlotRows.map((row) => ({ ...row }));
      const rowsBefore = new Map(
        Array.from(rows.entries()).map(([key, value]) => [key, { ...value }]),
      );
      const questionsBefore = questionRows.map((row) => ({ ...row }));
      try {
        return await callback(tx);
      } catch (error) {
        fieldRows.splice(0, fieldRows.length, ...fieldRowsBefore);
        timeSlotRows.splice(0, timeSlotRows.length, ...timeSlotRowsBefore);
        rows.clear();
        rowsBefore.forEach((value, key) => rows.set(key, value));
        questionRows.splice(0, questionRows.length, ...questionsBefore);
        throw error;
      }
    },
  );
  return { operations, questionRows, rows, tx };
};

describe("saveEventEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(snapshot());
    (computeEventEditorRevision as jest.Mock).mockReturnValue("revision");
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(snapshot());
  });
  it("saves organizer additions while retaining the booked resource and interval", async () => {
    const tx = txFor();
    tx.rentalBookings = { findMany: jest.fn().mockResolvedValue([
      { id: "booking-1", renterOrganizationId: null, renterUserId: "host_1" },
    ]) };
    tx.rentalBookingItems = { findMany: jest.fn().mockResolvedValue([
      { id: "item-1", bookingId: "booking-1", fieldId: "court-booked", timeZone: "UTC",
        start: new Date("2026-08-24T09:00:00Z"), end: new Date("2026-08-24T10:00:00Z"),
        requiredTemplateIds: [], hostRequiredTemplateIds: [] },
    ]) };
    const command = commandFor([]);
    command.draft = structuredClone(createDraft);
    command.draft.basics.hostId = "host_1";
    command.draft.resources = {
      ...command.draft.resources,
      rentalBookingId: "booking-1",
      rentalBookingItemId: "item-1",
      fieldIds: ["court-booked"],
      fields: [{ id: "court-booked", name: "Booked court" }],
      timeSlotIds: ["slot-booked"],
      timeSlots: [{
        id: "slot-booked", scheduledFieldIds: ["court-booked"],
        startDate: "2026-08-24T09:00:00.000Z", endDate: "2026-08-24T10:00:00.000Z",
        timeZone: "UTC", rentalBookingId: "booking-1", rentalBookingItemId: "item-1",
        sourceType: "RENTAL_BOOKING", rentalLocked: true,
      }],
    };
    const current = snapshot();
    current.draft = structuredClone(command.draft);
    current.immutable.rental = true;
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    const adapter = editorDraftToLegacyEvent as jest.Mock;
    adapter.mockImplementation(actualEditorAdapters.editorDraftToLegacyEvent);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");
    command.draft.resources.fieldIds.push("court-added");
    command.draft.resources.fields.push({ id: "court-added", name: "Organizer court" });
    command.draft.resources.timeSlotIds.push("slot-added");
    command.draft.resources.timeSlots.push({
      id: "slot-added", scheduledFieldIds: ["court-added"],
      startDate: "2026-08-24T09:00:00.000Z", endDate: "2026-08-24T10:00:00.000Z",
      timeZone: "UTC",
    });
    try {
      await saveEventEditor({ userId: "host_1" }, command, "event_1");
      expect(upsertEventFromPayload).toHaveBeenCalledWith(expect.objectContaining({
        fieldIds: ["court-booked", "court-added"],
        timeSlots: expect.arrayContaining([current.draft.resources.timeSlots[0]]),
      }), expect.anything(), expect.anything());
      for (const [field, change] of [
        ["timeSlots", (draft: typeof command.draft) => { draft.resources.timeSlots = []; }],
        ["fieldIds", (draft: typeof command.draft) => { draft.resources.fieldIds = []; }],
        ["organizationId", (draft: typeof command.draft) => { draft.basics.organizationId = "other-org"; }],
        ["rentalBookingId", (draft: typeof command.draft) => { draft.resources.rentalBookingId = "other-booking"; }],
        ["timeSlots", (draft: typeof command.draft) => { draft.resources.timeSlots[0].startTimeMinutes = 570; }],
        ["fields", (draft: typeof command.draft) => {
          draft.resources.fields.push({ ...draft.resources.fields[0], name: "Changed booked court" });
        }],
        ["timeSlots", (draft: typeof command.draft) => {
          draft.resources.timeSlots.unshift({
            ...draft.resources.timeSlots[0],
            rentalBookingId: null, rentalBookingItemId: null,
            rentalLocked: false, sourceType: "CUSTOM",
          });
        }],
      ] as const) {
        (upsertEventFromPayload as jest.Mock).mockClear();
        const rejected = { ...command, draft: structuredClone(current.draft) };
        change(rejected.draft);
        await expect(saveEventEditor({ userId: "host_1" }, rejected, "event_1"))
          .rejects.toMatchObject({ name: "EditorImmutableFieldError", fieldName: field });
        expect(upsertEventFromPayload).not.toHaveBeenCalled();
      }
    } finally {
      adapter.mockImplementation(() => ({}));
    }
  });
  it("treats a retry of an already completed rejection as a no-op", async () => {
    createEventEditorTxFor();

    await expect(
      rejectScheduleProposalFromEditor(
        { userId: "user_fixture_host" },
        "missing-proposal-operation",
        "proposal-revision",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a stale editor revision before any configuration write", async () => {
    const tx = txFor();
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(
      snapshot("revision_current"),
    );

    await expect(
      saveEventEditor({ userId: "host_1" }, commandFor([]), "event_1"),
    ).rejects.toBeInstanceOf(EditorRevisionConflictError);

    expect(tx.events.findUnique).toHaveBeenCalledTimes(1);
    expect(upsertEventFromPayload).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredState).not.toHaveBeenCalled();
  });
  it("strips stale Tryout staff state before reconciliation", async () => {
    const tx = txFor();
    const current = snapshot();
    current.draft = {
      ...current.draft,
      basics: { ...current.draft.basics, eventType: "TRYOUT" },
    };
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");

    const command = commandFor([]);
    command.draft.basics = {
      ...command.draft.basics,
      eventType: "TRYOUT",
      organizationId: "org-tryout",
      start: "2026-08-24T09:00:00.000Z",
      end: "2026-08-24T17:00:00.000Z",
      timeZone: "UTC",
    };
    command.draft.schedule = {
      mode: "FIXED_END",
      endConstraint: "2026-08-24T17:00:00.000Z",
      generatedScheduleEnd: null,
      isAutomatedScheduling: false,
    };
    command.draft.resources = {
      ...command.draft.resources,
      fieldIds: ["field-tryout"],
      timeSlotIds: ["slot-tryout"],
      fields: [{ id: "field-tryout", organizationId: "org-tryout" }],
      timeSlots: [{
        id: "slot-tryout",
        repeating: false,
        startDate: "2026-08-24",
        endDate: "2026-08-24",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 17 * 60,
        timeZone: "UTC",
        scheduledFieldIds: ["field-tryout"],
      }],
    };
    tx.fields.findMany.mockResolvedValue([
      { id: "field-tryout", organizationId: "org-tryout" },
    ]);
    command.draft.staff = {
      ...command.draft.staff,
      officialIds: ["official-stale"],
      officialPositions: [
        { id: "position-stale", name: "Referee", count: 1, order: 0 },
      ],
      eventOfficials: [
        {
          id: "event-official-stale",
          userId: "official-stale",
          positionIds: ["position-stale"],
          fieldIds: [],
          isActive: true,
        },
      ],
      assistantHostIds: ["assistant-stale"],
      pendingInvites: [
        {
          email: "stale@example.com",
          firstName: "Stale",
          lastName: "Official",
          roles: ["OFFICIAL", "ASSISTANT_HOST"],
        },
      ],
      doTeamsOfficiate: true,
      teamOfficialsMaySwap: true,
      teamCheckInMode: "MATCH",
      allowMatchRosterEdits: true,
      allowTemporaryMatchPlayers: true,
      autoCreatePointMatchIncidents: true,
    };

    await saveEventEditor({ userId: "host_1" }, command, "event_1");

    expect(reconcileEventStaffDesiredState).toHaveBeenCalledWith(
      tx,
      "event_1",
      expect.objectContaining({
        assistantHostIds: ["assistant-stale"],
        officialPositions: [],
        eventOfficials: [],
        pendingInvites: [
          {
            email: "stale@example.com",
            firstName: "Stale",
            lastName: "Official",
            roles: ["ASSISTANT_HOST"],
          },
        ],
      }),
      "host_1",
    );
  });

  it("rolls back before question or staff reconciliation when event persistence fails", async () => {
    const tx = txFor();
    (upsertEventFromPayload as jest.Mock).mockRejectedValue(
      new Error("division persistence failed"),
    );

    await expect(
      saveEventEditor({ userId: "host_1" }, commandFor([]), "event_1"),
    ).rejects.toThrow("division persistence failed");

    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect(tx.registrationQuestions.create).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredState).not.toHaveBeenCalled();
  });

  it("maps duplicate division names to an actionable editor input error", async () => {
    txFor();
    (upsertEventFromPayload as jest.Mock).mockRejectedValue(
      new EventDivisionNameValidationError(["Open"]),
    );

    await expect(
      saveEventEditor({ userId: "host_1" }, commandFor([]), "event_1"),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "EditorInputError",
        message:
          "Division name must be unique within this event. Choose a different name.",
      }),
    );
  });
  it("rejects a tournament team count below three as editor input", async () => {
    txFor();
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue({
      ...snapshot(),
      draft: { basics: { eventType: "TOURNAMENT" } },
    });
    const command = commandFor([]);
    command.draft.basics.eventType = "TOURNAMENT";
    command.draft.participation = { maxParticipants: 2 };
    command.draft.competition.includePlayoffs = false;

    await expect(
      saveEventEditor({ userId: "host_1" }, command, "event_1"),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "EditorInputError",
        message: "Tournament team count must be at least 3.",
      }),
    );
    expect(upsertEventFromPayload).not.toHaveBeenCalled();
  });

  it("maps invalid staff assignments to an actionable editor input error", async () => {
    const tx = txFor();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");
    (reconcileEventStaffDesiredState as jest.Mock).mockRejectedValueOnce(
      new EventStaffInputError("Organization staff assignment is invalid."),
    );

    const error = await saveEventEditor(
      { userId: "host_1" },
      commandFor([]),
      "event_1",
    ).then(
      () => null,
      (failure) => failure,
    );

    expect(error).toBeInstanceOf(EditorInputError);
    expect(error).toHaveProperty(
      "message",
      "Organization staff assignment is invalid.",
    );
  });

  it("maps a new question client id once and updates its canonical row on repeat", async () => {
    const questionRows: Array<{ id: string }> = [];
    const tx = txFor(questionRows);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");
    (loadEventEditorSnapshot as jest.Mock)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot());

    const first = await saveEventEditor(
      { userId: "host_1" },
      commandFor([
        {
          clientId: "question_client_1",
          prompt: "Preferred side?",
          answerType: "TEXT",
          required: true,
          sortOrder: 0,
        },
      ]),
      "event_1",
    );
    const canonicalId = first.questionIdMap.question_client_1;
    expect(canonicalId).toEqual(expect.any(String));
    expect(tx.registrationQuestions.create).toHaveBeenCalledTimes(1);

    await saveEventEditor(
      { userId: "host_1" },
      commandFor([
        {
          id: canonicalId,
          prompt: "Preferred side?",
          answerType: "TEXT",
          required: true,
          sortOrder: 0,
        },
      ]),
      "event_1",
    );

    expect(tx.registrationQuestions.create).toHaveBeenCalledTimes(1);
    expect(tx.registrationQuestions.update).toHaveBeenCalledTimes(1);
    expect(acquireEventLock).toHaveBeenCalledTimes(2);
  });
  it("makes concurrent create retries await terminal staff delivery metadata", async () => {
    jest.useFakeTimers();
    try {
      const { operations } = createEventEditorTxFor();
      (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
      (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
        createSnapshot("CREATE", null),
      );
      (loadEventEditorSnapshot as jest.Mock).mockReset();
      (loadEventEditorSnapshot as jest.Mock).mockImplementation(
        async (eventId: string) => createSnapshot("EDIT", eventId),
      );
      (upsertEventFromPayload as jest.Mock).mockReset();
      (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
      (reconcileEventStaffDesiredState as jest.Mock).mockReset();
      (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
        emailCandidates: [{ email: "official@example.com" }],
      });

      let signalDeliveryStarted = () => {};
      const deliveryStarted = new Promise<void>((resolve) => {
        signalDeliveryStarted = resolve;
      });
      let releaseDelivery = (_value: "QUEUED") => {};
      const deliveryFinished = new Promise<"QUEUED">((resolve) => {
        releaseDelivery = resolve;
      });
      const sendStaffInvites = jest.fn(async () => {
        signalDeliveryStarted();
        return deliveryFinished;
      });
      const onEventCreated = jest.fn().mockResolvedValue(undefined);
      const command = {
        contractVersion: 3,
        createOperationId: "concurrent-create-operation",
        expectedRevisions: expectedCreateRevisions,
        draft: createDraft,
        completion: { mode: "CREATE_ONLY" },
      } satisfies CreateEventEditorCommand;
      const actor = { userId: "user_fixture_host" };
      const firstPromise = createEventEditor(actor, command, {
        sendStaffInvites,
        onEventCreated,
      });
      await deliveryStarted;

      let secondSettled = false;
      const secondPromise = createEventEditor(actor, command, {
        sendStaffInvites,
        onEventCreated,
      }).then((value) => {
        secondSettled = true;
        return value;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(secondSettled).toBe(false);

      releaseDelivery("QUEUED");
      await jest.advanceTimersByTimeAsync(10);
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first).toEqual(second);
      expect(first.staffEmailDelivery).toBe("QUEUED");
      const retry = await createEventEditor(actor, command, {
        sendStaffInvites,
        onEventCreated,
      });
      expect(retry).toEqual(first);
      expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
      expect(reconcileEventStaffDesiredState).toHaveBeenCalledTimes(1);
      expect(onEventCreated).toHaveBeenCalledTimes(1);
      expect(sendStaffInvites).toHaveBeenCalledTimes(1);
      expect(operations.createMany).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("builds a League schedule and returns its canonical graph inside the create transaction", async () => {
    const { tx } = createEventEditorTxFor();
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    (reconcileEventStaffDesiredState as jest.Mock).mockReset();
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
    mockedReconcileEventSchedule.mockReset();
    const graphEvent = serializedProposalEvent("event-created");
    const graphMatches = [serializedProposalMatch("event-created")];
    mockedReconcileEventSchedule.mockResolvedValue({
      event: graphEvent,
      matches: graphMatches,
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });

    const result = await createEventEditor({ userId: "user_fixture_host" }, {
      contractVersion: 3,
      createOperationId: "create-and-build-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: leagueCreateDraft,
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand);

    expect(mockedReconcileEventSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        eventId: expect.any(String),
        mode: "BUILD",
        includePlaceholderTeams: true,
      }),
    );
    expect(result.scheduleOutcome).toEqual(
      expect.objectContaining({
        status: "BUILT",
        matchCount: 1,
        warnings: [],
      }),
    );
    expect(result.graph).toEqual({
      event: graphEvent,
      matches: graphMatches,
    });
  });
  it("rejects an invalid schedule proposal before storing a receipt", async () => {
    const fieldRows = [
      { id: "field_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const timeSlotRows = [
      { id: "slot_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const { operations, rows } = createEventEditorTxFor({
      fields: fieldRows,
      timeSlots: timeSlotRows,
    });
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    mockedReconcileEventSchedule.mockReset();
    mockedReconcileEventSchedule.mockResolvedValue({
      event: serializedProposalEvent("event-created"),
      matches: [serializedProposalMatch("event-created")],
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });
    mockedValidateAndNormalizeSerializedGraph.mockImplementationOnce(() => {
      throw new EventScheduleProposalGraphError("unresolved officiating slot");
    });

    const command = {
      contractVersion: 3,
      createOperationId: "invalid-proposal-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: leagueCreateDraft,
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand;

    await expect(
      createScheduleProposalFromEditor(
        { userId: "user_fixture_host" },
        command,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalInvalidError);
    expect(rows.has(command.createOperationId)).toBe(false);
    expect(operations.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        createOperationId: command.createOperationId,
        updatedAt: expect.any(Date),
      }),
    });
    expect(mockedPersistSerializedScheduleGraph).not.toHaveBeenCalled();
  });
  it("accepts a template-based revision-bound proposal without rebuilding or using its document requirement as the source", async () => {
    const fieldRows = [
      { id: "field_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const timeSlotRows = [
      { id: "slot_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const { operations, rows, tx } = createEventEditorTxFor({
      fields: fieldRows,
      timeSlots: timeSlotRows,
    });
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockImplementation(async () => {
      const provisionalRevision = new Date("2026-08-24T09:00:00.000Z");
      fieldRows[0].updatedAt = provisionalRevision;
      timeSlotRows[0].updatedAt = provisionalRevision;
      return "event-created";
    });
    (reconcileEventStaffDesiredState as jest.Mock).mockReset();
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
    mockedReconcileEventSchedule.mockReset();
    mockedReconcileEventSchedule.mockResolvedValue({
      event: {
        ...serializedProposalEvent("event-created"),
        staffingPriority: "BEST_AVAILABLE_COVERAGE",
        doTeamsOfficiate: true,
        officialPositions: [
          { id: "position-referee", name: "Referee", count: 1, order: 0 },
        ],
      },
      matches: [
        {
          ...serializedProposalMatch("event-created"),
          officialAssignments: [
            {
              positionId: "position-referee",
              slotIndex: 0,
              holderType: "OFFICIAL",
              userId: null,
              eventOfficialId: null,
              checkedIn: false,
              hasConflict: false,
            },
          ],
        },
      ],
      warnings: [
        {
          code: "UNRESOLVED_OFFICIAL_SLOT",
          message: "One official slot remains unresolved.",
          matchIds: ["match-created"],
        },
      ],
      previousMatchCount: 0,
      notification: null,
    });
    mockedPersistSerializedScheduleGraph.mockReset();
    mockedPersistSerializedScheduleGraph.mockResolvedValue(undefined);

    const command = {
      contractVersion: 5,
      createOperationId: "proposal-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: {
        ...leagueCreateDraft,
        resources: {
          ...leagueCreateDraft.resources,
          sourceTemplateId: "event-template-source",
          requiredTemplateIds: ["document-requirement"],
        },
      },
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand;
    const actor = { userId: "user_fixture_host" };

    const proposal = await createScheduleProposalFromEditor(actor, command);
    const validationCall =
      mockedValidateAndNormalizeSerializedGraph.mock.calls[0];
    expect(validationCall?.[0]).toBe(proposal.eventId);
    expect(validationCall?.[1]).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          staffingPriority: "BEST_AVAILABLE_COVERAGE",
          doTeamsOfficiate: false,
          officialPositions: [
            expect.objectContaining({
              id: "position-referee",
              count: 0,
            }),
          ],
        }),
        matches: [
          expect.objectContaining({
            officialAssignments: [],
          }),
        ],
      }),
    );
    expect(proposal.scheduleOutcome.warnings).toEqual([
      {
        code: "UNRESOLVED_OFFICIAL_SLOT",
        message: "One official slot remains unresolved.",
        matchIds: ["match-created"],
      },
    ]);

    expect(proposal.status).toBe("PROPOSED");
    if (proposal.status !== "PROPOSED") {
      throw new Error("Expected a schedule proposal.");
    }
    expect(proposal.eventId).toBeTruthy();
    expect(proposal.graph.matches).toHaveLength(1);
    expect(proposal.snapshot).toEqual(
      expect.objectContaining({
        mode: "CREATE",
        eventId: null,
        draft: command.draft,
      }),
    );
    expect(proposal.revisionBinding).toEqual(
      expect.objectContaining({
        editorRevision: expectedCreateRevisions.editorRevision,
        staffRevision: expectedCreateRevisions.staffRevision,
        scheduleRevision: expectedCreateRevisions.scheduleRevision,
        fieldRevisions: {
          field_fixture: expect.any(String),
        },
        timeSlotRevisions: {
          slot_fixture: expect.any(String),
        },
        rentalBookingRevisions: {},
        rentalBookingItemRevisions: {},
      }),
    );
    expect(rows.get(command.createOperationId)).toEqual(
      expect.objectContaining({
        proposalStatus: "PENDING",
        eventId: proposal.eventId,
      }),
    );
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
    const storedProposal = rows.get(command.createOperationId).proposalJson;
    rows.get(command.createOperationId).proposalJson = {
      ...storedProposal,
      revisionBinding: Object.fromEntries(
        Object.entries(storedProposal.revisionBinding).reverse(),
      ),
    };

    tx.events.findUnique.mockResolvedValue(null);
    mockedValidateAndNormalizeSerializedGraph.mockImplementationOnce(() => {
      throw new EventScheduleProposalGraphError("dangling reference");
    });
    await expect(
      acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        command.draft,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalInvalidError);
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
    expect(mockedPersistSerializedScheduleGraph).not.toHaveBeenCalled();

    const onScheduleChanged = jest.fn();
    const accepted = await acceptScheduleProposalFromEditor(
      actor,
      command.createOperationId,
      proposal.proposalRevision,
      command.draft,
      { onScheduleChanged },
    );


    expect(accepted.status).toBe("SAVED");
    expect(loadCreateEventEditorSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ templateId: "event-template-source" }),
      expect.anything(),
    );
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(2);
    expect(mockedReconcileEventSchedule).toHaveBeenCalledTimes(1);
    expect(mockedPersistSerializedScheduleGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: proposal.eventId,
        graph: proposal.graph,
      }),
    );
    expect(onScheduleChanged).toHaveBeenCalledTimes(1);
    expect(onScheduleChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: accepted.snapshot.eventId,
        eventName: "Proposal Event",
        forceBatch: true,
        changes: [
          expect.objectContaining({
            matchId: "match-created",
            teamIds: ["team-fixture"],
            scheduleChanged: true,
            teamAdded: true,
            deleted: false,
          }),
        ],
      }),
    );
    expect(operations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createOperationId: command.createOperationId,
          updatedAt: expect.any(Date),
        }),
        data: expect.objectContaining({
          proposalStatus: "ACCEPTED",
        }),
      }),
    );
    const replay = await createScheduleProposalFromEditor(actor, command);
    expect(replay).toEqual(accepted);
    expect(mockedReconcileEventSchedule).toHaveBeenCalledTimes(1);
    (computeEventEditorRevision as jest.Mock).mockImplementation(
      (input: { basics?: { name?: string } }) =>
        input.basics?.name === command.draft.basics.name
          ? "original-revision"
          : "changed-revision",
    );
    await expect(
      acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        {
          ...command.draft,
          basics: { ...command.draft.basics, name: "Changed after acceptance" },
        },
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalStaleError);
  });
  it("explicitly accepts a complete PARTIAL graph with a fresh identity and replays it", async () => {
    const fieldRows = [
      { id: "field_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const timeSlotRows = [
      { id: "slot_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const { rows, tx } = createEventEditorTxFor({
      fields: fieldRows,
      timeSlots: timeSlotRows,
    });
    const phaseDetail = {
      id: "phase_league",
      name: "Open",
      kind: "LEAGUE",
      role: "PHASE",
      phase: "LEAGUE",
      sourceDivisionId: "division_source",
      isSystemGenerated: false,
      phaseSettings: { LEAGUE: {} },
      teamIds: [],
      playoffTeamCount: null,
      playoffPlacementDivisionIds: [],
      standingsOverrides: null,
      standingsConfirmedAt: null,
      standingsConfirmedBy: null,
      playoffConfig: null,
      leagueConfig: null,
    };
    const graphEvent = {
      ...serializedProposalEvent("event-created"),
      divisionDetails: [phaseDetail],
    };
    const graphMatches = [
      {
        ...serializedProposalMatch("event-created"),
        id: "match-placed",
        matchId: 1,
        start: "2026-08-24T09:00:00.000Z",
        end: "2026-08-24T10:00:00.000Z",
        placementState: "PLACED",
        phase: "LEAGUE",
        sourceDivisionId: "division_source",
        phaseDivisionId: "phase_league",
        division: "division_source",
        fieldId: "field_fixture",
      },
      {
        ...serializedProposalMatch("event-created"),
        id: "match-unplaced",
        matchId: 2,
        start: null,
        end: null,
        placementState: "UNPLACED",
        phase: "LEAGUE",
        sourceDivisionId: "division_source",
        phaseDivisionId: "phase_league",
        division: "division_source",
        fieldId: null,
      },
      {
        ...serializedProposalMatch("event-created"),
        id: "match-unknown-phase",
        matchId: 3,
        start: null,
        end: null,
        placementState: "UNPLACED",
        phase: "POOL",
        sourceDivisionId: "division_unknown",
        phaseDivisionId: "phase_missing",
        division: "division_unknown",
        fieldId: null,
      },
    ];
    const graphProjections = graphMatches.map(partialProjectionFor);
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    (reconcileEventStaffDesiredState as jest.Mock).mockReset();
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
    mockedReconcileEventSchedule.mockReset();
    mockedReconcileEventSchedule.mockResolvedValue({
      event: graphEvent,
      matches: graphMatches,
      warnings: [],
      placementFailures: [],
      previousMatchCount: 0,
      notification: null,
    });
    mockedEditorMatchProjectionsFor.mockImplementationOnce(
      (matches: Array<Record<string, unknown>>) =>
        matches.map(partialProjectionFor),
    );
    mockedPersistSerializedScheduleGraph.mockReset();
    mockedPersistSerializedScheduleGraph.mockResolvedValue(undefined);

    const command = {
      contractVersion: 3,
      createOperationId: "partial-proposal-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: leagueCreateDraft,
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand;
    const actor = { userId: "user_fixture_host" };
    const proposal = await createScheduleProposalFromEditor(actor, command);

    expect(proposal.status).toBe("PROPOSED");
    if (proposal.status !== "PROPOSED") {
      throw new Error("Expected a schedule proposal.");
    }
    expect(proposal.graph).toEqual({
      event: graphEvent,
      matches: graphMatches,
    });
    expect(proposal.scheduleOutcome).toEqual({
      status: "PARTIAL",
      isComplete: false,
      matchCount: 3,
      placedMatchCount: 1,
      unplacedMatchCount: 2,
      matches: graphProjections,
      unscheduledMatches: [
        {
          id: "match-unplaced",
          matchId: 2,
          phaseDivisionId: "phase_league",
          phase: "LEAGUE",
          sourceDivisionId: "division_source",
        },
        {
          id: "match-unknown-phase",
          matchId: 3,
          phaseDivisionId: "phase_missing",
          phase: "POOL",
          sourceDivisionId: "division_unknown",
        },
      ],
      affectedCompetitionPhases: [
        {
          id: "phase_league",
          name: "Open",
          phase: "LEAGUE",
          sourceDivisionId: "division_source",
        },
        {
          id: "phase_missing",
          name: "Competition Phase details unavailable",
          phase: "POOL",
          sourceDivisionId: "division_unknown",
        },
      ],
      warnings: [],
    });
    expect(rows.get(command.createOperationId)).toEqual(
      expect.objectContaining({
        proposalStatus: "PENDING",
        eventId: proposal.eventId,
      }),
    );
    const pendingRow = rows.get(command.createOperationId);
    const storedProposalJson = pendingRow.proposalJson;
    const transactionMock = prisma.$transaction as unknown as jest.Mock;
    const transactionImplementation = transactionMock.getMockImplementation();
    transactionMock.mockImplementation(
      async (callback: (client: unknown) => unknown) => {
        pendingRow.proposalJson = {
          ...storedProposalJson,
          proposalRevision: "concurrent-proposal-revision",
        };
        try {
          return await callback(tx);
        } finally {
          pendingRow.proposalJson = storedProposalJson;
        }
      },
    );
    await expect(
      acceptPartialScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        "stale-acceptance-operation",
        command.draft,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalStaleError);
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
    expect(mockedPersistSerializedScheduleGraph).not.toHaveBeenCalled();
    expect(pendingRow).toEqual(
      expect.objectContaining({ proposalStatus: "PENDING" }),
    );
    transactionMock.mockImplementation(transactionImplementation);

    tx.events.findUnique.mockResolvedValue(null);
    mockedReconcileEventSchedule.mockClear();
    mockedPersistSerializedScheduleGraph.mockClear();
    const acceptanceOperationId = "partial-acceptance-operation";
    const accepted = await acceptPartialScheduleProposalFromEditor(
      actor,
      command.createOperationId,
      proposal.proposalRevision,
      acceptanceOperationId,
      command.draft,
    );

    expect(accepted).toEqual(
      expect.objectContaining({
        status: "SAVED",
        createOperationId: command.createOperationId,
        acceptanceOperationId,
        scheduleOutcome: proposal.scheduleOutcome,
        graph: proposal.graph,
      }),
    );
    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();
    expect(mockedPersistSerializedScheduleGraph).toHaveBeenCalledTimes(1);
    expect(mockedPersistSerializedScheduleGraph).toHaveBeenCalledWith({
      tx,
      eventId: proposal.eventId,
      graph: proposal.graph,
    });
    await expect(
      acceptPartialScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        "different-acceptance-operation",
        command.draft,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalInvalidError);
    expect(mockedPersistSerializedScheduleGraph).toHaveBeenCalledTimes(1);
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(2);
    expect(rows.get(command.createOperationId)).toEqual(
      expect.objectContaining({ proposalStatus: "ACCEPTED" }),
    );

    const replay = await acceptPartialScheduleProposalFromEditor(
      actor,
      command.createOperationId,
      proposal.proposalRevision,
      acceptanceOperationId,
      command.draft,
    );
    expect(replay).toEqual(accepted);
    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();
    expect(mockedPersistSerializedScheduleGraph).toHaveBeenCalledTimes(1);
  });
  it("waits for terminal metadata when replaying an accepted proposal", async () => {
    jest.useFakeTimers();
    try {
      const { tx } = createEventEditorTxFor();
      (loadEventEditorSnapshot as jest.Mock).mockResolvedValue({
        ...createSnapshot("EDIT", "event-created"),
        draft: leagueCreateDraft,
      });
      (upsertEventFromPayload as jest.Mock).mockReset();
      (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
      (reconcileEventStaffDesiredState as jest.Mock).mockReset();
      (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
        emailCandidates: [{ email: "official@example.com" }],
      });
      mockedReconcileEventSchedule.mockReset();
      mockedReconcileEventSchedule.mockResolvedValue({
        event: {
          ...serializedProposalEvent("event-created"),
          staffingPriority: "BEST_AVAILABLE_COVERAGE",
        },
        matches: [serializedProposalMatch("event-created")],
        warnings: [],
        previousMatchCount: 0,
        notification: null,
      });

      const command = {
        contractVersion: 3,
        createOperationId: "accepted-replay-proposal",
        expectedRevisions: expectedCreateRevisions,
        draft: leagueCreateDraft,
        completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
      } satisfies CreateEventEditorCommand;
      const actor = { userId: "user_fixture_host" };
      const proposal = await createScheduleProposalFromEditor(actor, command);
      if (proposal.status !== "PROPOSED") {
        throw new Error("Expected a schedule proposal.");
      }
      tx.events.findUnique.mockResolvedValue(null);

      let signalDeliveryStarted = () => {};
      const deliveryStarted = new Promise<void>((resolve) => {
        signalDeliveryStarted = resolve;
      });
      let releaseDelivery = (_value: "QUEUED") => {};
      const deliveryFinished = new Promise<"QUEUED">((resolve) => {
        releaseDelivery = resolve;
      });
      const sendStaffInvites = jest.fn(async () => {
        signalDeliveryStarted();
        return deliveryFinished;
      });
      const firstPromise = acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        command.draft,
        { sendStaffInvites },
      );
      await deliveryStarted;

      let secondSettled = false;
      const secondPromise = acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        command.draft,
        { sendStaffInvites },
      ).then((value) => {
        secondSettled = true;
        return value;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(secondSettled).toBe(false);

      releaseDelivery("QUEUED");
      await jest.advanceTimersByTimeAsync(10);
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      expect(first).toEqual(second);
      expect(second.staffEmailDelivery).toBe("QUEUED");
      expect(sendStaffInvites).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("rejects an unresolved assignment with an unknown position under optional coverage", async () => {
    const { operations, rows } = createEventEditorTxFor();
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    mockedReconcileEventSchedule.mockReset();
    mockedReconcileEventSchedule.mockResolvedValue({
      event: {
        ...serializedProposalEvent("event-created"),
        staffingPriority: "BEST_AVAILABLE_COVERAGE",
        officialPositions: [
          { id: "position-referee", name: "Referee", count: 1, order: 0 },
        ],
      },
      matches: [
        {
          ...serializedProposalMatch("event-created"),
          officialAssignments: [
            {
              positionId: "position-missing",
              slotIndex: 0,
              holderType: "OFFICIAL",
              userId: null,
              eventOfficialId: null,
              checkedIn: false,
              hasConflict: false,
            },
          ],
        },
      ],
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });

    const command = {
      contractVersion: 3,
      createOperationId: "invalid-position-proposal",
      expectedRevisions: expectedCreateRevisions,
      draft: leagueCreateDraft,
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand;

    await expect(
      createScheduleProposalFromEditor(
        { userId: "user_fixture_host" },
        command,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalInvalidError);
    expect(rows.has(command.createOperationId)).toBe(false);
    expect(operations.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        responseJson: null,
        proposalJson: null,
        proposalStatus: "NONE",
        emailDelivery: "PROCESSING",
      }),
    });
    expect(mockedValidateAndNormalizeSerializedGraph).not.toHaveBeenCalled();
  });
  it("rejects a stale revision before replaying a concurrent accepted result", async () => {
    const { rows, tx } = createEventEditorTxFor();
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    mockedReconcileEventSchedule.mockReset();
    mockedReconcileEventSchedule.mockResolvedValue({
      event: {
        ...serializedProposalEvent("event-created"),
        staffingPriority: "BEST_AVAILABLE_COVERAGE",
      },
      matches: [serializedProposalMatch("event-created")],
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });

    const command = {
      contractVersion: 3,
      createOperationId: "stale-replay-proposal",
      expectedRevisions: expectedCreateRevisions,
      draft: leagueCreateDraft,
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand;
    const actor = { userId: "user_fixture_host" };
    const proposal = await createScheduleProposalFromEditor(actor, command);
    if (proposal.status !== "PROPOSED") {
      throw new Error("Expected a schedule proposal.");
    }

    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue({
      ...createSnapshot("EDIT", "event-created"),
      draft: leagueCreateDraft,
    });
    tx.events.findUnique.mockResolvedValue(null);
    const accepted = await acceptScheduleProposalFromEditor(
      actor,
      command.createOperationId,
      proposal.proposalRevision,
      command.draft,
    );
    const row = rows.get(command.createOperationId);
    const storedProposalJson = row.proposalJson;
    row.responseJson = null;
    row.proposalStatus = "PENDING";
    row.emailDelivery = "PROPOSED";
    const transactionMock = prisma.$transaction as unknown as jest.Mock;
    transactionMock.mockImplementation(
      async (callback: (client: unknown) => unknown) => {
        row.proposalJson = {
          ...storedProposalJson,
          proposalRevision: "new-proposal-revision",
        };
        row.responseJson = accepted;
        row.proposalStatus = "ACCEPTED";
        row.emailDelivery = "QUEUED";
        return callback(tx);
      },
    );

    await expect(
      acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        command.draft,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalStaleError);
  });
  it("rejects proposal acceptance when authoritative availability changes", async () => {
    const fieldRows = [
      { id: "field_fixture", updatedAt: new Date("2026-08-24T08:00:00.000Z") },
    ];
    const { rows, tx } = createEventEditorTxFor({ fields: fieldRows });
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    (reconcileEventStaffDesiredState as jest.Mock).mockReset();
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
    mockedReconcileEventSchedule.mockReset();
    mockedReconcileEventSchedule.mockResolvedValue({
      event: serializedProposalEvent("event-created"),
      matches: [serializedProposalMatch("event-created")],
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });

    const command = {
      contractVersion: 3,
      createOperationId: "stale-availability-proposal",
      expectedRevisions: expectedCreateRevisions,
      draft: leagueCreateDraft,
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
    } satisfies CreateEventEditorCommand;
    const actor = { userId: "user_fixture_host" };
    (computeEventEditorRevision as jest.Mock).mockImplementation((input: unknown) =>
      JSON.stringify(input),
    );
    const proposal = await createScheduleProposalFromEditor(actor, command);
    if (proposal.status !== "PROPOSED") {
      throw new Error("Expected a schedule proposal.");
    }

    await expect(
      acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        {
          ...command.draft,
          basics: { ...command.draft.basics, name: "Changed after review" },
        },
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalStaleError);

    fieldRows[0].updatedAt = new Date("2026-08-24T09:00:00.000Z");
    tx.events.findUnique.mockResolvedValue(null);

    await expect(
      acceptScheduleProposalFromEditor(
        actor,
        command.createOperationId,
        proposal.proposalRevision,
        command.draft,
      ),
    ).rejects.toBeInstanceOf(EventEditorProposalStaleError);
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
    expect(mockedPersistSerializedScheduleGraph).not.toHaveBeenCalled();
    expect(rows.get(command.createOperationId)).toEqual(
      expect.objectContaining({ proposalStatus: "PENDING" }),
    );
  });
  it("persists an unplaced Match Graph when Automated Scheduling is off", async () => {
    const { tx } = createEventEditorTxFor();
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    (reconcileEventStaffDesiredState as jest.Mock).mockReset();
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
    mockedPersistCreateOnlyMatchGraph.mockReset();
    mockedPersistCreateOnlyMatchGraph.mockResolvedValue({
      event: serializedProposalEvent("event-created"),
      matches: Array.from({ length: 6 }, (_, index) => ({
        ...serializedProposalMatch("event-created"),
        id: `event-created:match:${index + 1}`,
        phase: "LEAGUE",
        sourceDivisionId: "division_1",
        phaseDivisionId: "phase_1",
        division: "division_1",
      })),
      demand: {
        total: 6,
        byDivision: { division_1: 6 },
        byPhase: { LEAGUE: 6 },
        placed: 0,
        unplaced: 6,
      },
    });
    const unscheduledLeagueDraft = {
      ...leagueCreateDraft,
      schedule: {
        ...leagueCreateDraft.schedule,
        isAutomatedScheduling: false,
        mode: "FIXED_END" as const,
        endConstraint: "2026-09-01T18:00:00.000Z",
      },
    };


    const result = await createEventEditor({ userId: "user_fixture_host" }, {
      contractVersion: 3,
      createOperationId: "create-only-league-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: unscheduledLeagueDraft,
      completion: { mode: "CREATE_ONLY" },
    } satisfies CreateEventEditorCommand);

    expect(mockedPersistCreateOnlyMatchGraph).toHaveBeenCalledWith({
      tx,
      eventId: expect.any(String),
      includePlaceholderTeams: true,
    });
    expect(result.scheduleOutcome).toEqual(expect.objectContaining({
      status: "NOT_REQUESTED",
      matchCount: 6,
      matches: expect.arrayContaining([
        expect.objectContaining({
          id: "event-created:match:1",
          placementState: "UNPLACED",
          phase: "LEAGUE",
          sourceDivisionId: "division_1",
          phaseDivisionId: "phase_1",
          division: "division_1",
        }),
      ]),
      warnings: [],
    }));
    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();
  });
  it("rolls back the create receipt with a failed domain transaction", async () => {
    const { rows, tx } = createEventEditorTxFor();
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockRejectedValue(
      new Error("domain write failed"),
    );
    (prisma as any).$transaction = jest.fn(
      async (callback: (client: any) => unknown) => {
        try {
          return await callback(tx);
        } catch (error) {
          rows.clear();
          throw error;
        }
      },
    );

    await expect(
      createEventEditor({ userId: "user_fixture_host" }, {
        contractVersion: 3,
        createOperationId: "failed-create-operation",
        expectedRevisions: expectedCreateRevisions,
        draft: createDraft,
        completion: { mode: "CREATE_ONLY" },
      } satisfies CreateEventEditorCommand),
    ).rejects.toThrow("domain write failed");

    expect(rows.size).toBe(0);
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
  });
  it("preserves a concurrent identical retry receipt when a direct create transaction fails", async () => {
    const { operations, rows, tx } = createEventEditorTxFor();
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("EDIT", "event-created"),
    );
    (reconcileEventStaffDesiredState as jest.Mock).mockReset();
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
    const actor = { userId: "user_fixture_host" };
    const command = {
      contractVersion: 3,
      createOperationId: "failed-create-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: createDraft,
      completion: { mode: "CREATE_ONLY" },
    } satisfies CreateEventEditorCommand;
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock)
      .mockRejectedValueOnce(new Error("domain write failed"))
      .mockResolvedValue("event-created");
    let transactionCount = 0;
    let retryResult: unknown;
    const transactionMock = prisma.$transaction as unknown as jest.Mock;
    transactionMock.mockImplementation(
      async (callback: (client: unknown) => unknown) => {
        transactionCount += 1;
        try {
          return await callback(tx);
        } catch (error) {
          if (transactionCount === 1) {
            rows.clear();
            retryResult = await createEventEditor(actor, command);
          }
          throw error;
        }
      },
    );

    await expect(createEventEditor(actor, command)).rejects.toThrow(
      "domain write failed",
    );

    expect(retryResult).toEqual(
      expect.objectContaining({
        createOperationId: command.createOperationId,
      }),
    );
    expect(rows.get(command.createOperationId)).toEqual(
      expect.objectContaining({
        createOperationId: command.createOperationId,
        actorUserId: actor.userId,
        responseStatus: 201,
        emailDelivery: "NOT_REQUESTED",
      }),
    );
    expect(operations.delete).not.toHaveBeenCalled();
  });
  it("rebuilds the schedule for an event-type transition inside the save transaction", async () => {
    const tx = txFor();
    const current = snapshot();
    current.draft = { ...current.draft, basics: { eventType: "EVENT" } };
    current.scheduleState = {
      ...current.scheduleState,
      matchCount: 0,
      revision: "schedule_revision_event",
    };
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");
    mockedReconcileEventSchedule.mockResolvedValue({
      event: { id: "event_1", eventType: "LEAGUE" },
      matches: [{ id: "match_1", eventId: "event_1", fieldId: null }],
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });

    const command = commandFor([]);
    command.draft.basics.eventType = "LEAGUE";
    command.scheduleTransition = {
      mode: "RECONCILE",
      expectedScheduleRevision: "schedule_revision_event",
    };
    const result = await saveEventEditor(
      { userId: "host_1" },
      command,
      "event_1",
    );

    expect(mockedReconcileEventSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        eventId: "event_1",
        mode: "BUILD",
        includePlaceholderTeams: true,
      }),
    );
    expect(result.scheduleOutcome).toEqual(
      expect.objectContaining({
        status: "BUILT",
        matchCount: 1,
      }),
    );
  });
  it("preserves the existing schedule for an event-type transition with PRESERVE", async () => {
    const tx = txFor();
    const current = snapshot();
    current.scheduleState = {
      ...current.scheduleState,
      matchCount: 3,
      revision: "schedule_revision_existing",
    };
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");

    const command = commandFor([]);
    command.draft.basics.eventType = "LEAGUE";
    command.scheduleTransition = { mode: "PRESERVE" };

    const result = await saveEventEditor(
      { userId: "host_1" },
      command,
      "event_1",
    );

    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();
    expect(result.scheduleOutcome).toEqual(
      expect.objectContaining({
        status: "NOT_REQUESTED",
        matchCount: 3,
      }),
    );
    expect(upsertEventFromPayload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event_1" }),
      tx,
      expect.objectContaining({
        preserveOperationalState: true,
        preserveStaffState: true,
      }),
    );
  });
  it.each(["EVENT", "WEEKLY_EVENT", "TRYOUT"] as const)(
    "sanitizes bracket-only division settings when saving as %s",
    async (eventType) => {
      const tx = txFor();
      const current = snapshot();
      current.draft = {
        ...current.draft,
        basics: { ...current.draft.basics, eventType: "LEAGUE" },
      };
      current.scheduleState = {
        ...current.scheduleState,
        matchCount: 0,
        revision: "schedule_revision_transition",
      };
      (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
      (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
      (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");
      mockedReconcileEventSchedule.mockResolvedValue({
        event: { id: "event_1", eventType },
        matches: [],
        warnings: [],
        previousMatchCount: 0,
        notification: null,
      });

      const baseDivision = leagueCreateDraft.competition.divisionDetails[0];
      const division = {
        ...baseDivision,
        sourceDivisionId: "division-source",
        fieldIds: ["field-assigned"],
        teamIds: ["team-assigned"],
        isSystemGenerated: true,
        role: "PHASE",
        phase: "POOL",
        poolPlay: true,
        playoffTeamCount: 8,
        poolCount: 2,
        poolTeamCount: 4,
        phaseSettings: { POOL: { officialPositions: [{ id: "position" }] } },
        playoffPlacementDivisionIds: ["division-placement"],
        standingsOverrides: { team: 12 },
        playoffConfig: {
          doubleElimination: true,
          winnerSetCount: 3,
          loserSetCount: 2,
          winnerBracketPointsToVictory: [21, 15],
          loserBracketPointsToVictory: [21],
          prize: "Trophy",
          fieldCount: 2,
        },
        gamesPerOpponent: 3,
        restTimeMinutes: 12,
        usesSets: true,
        matchDurationMinutes: 90,
        setDurationMinutes: 30,
        setsPerMatch: 3,
        pointsToVictory: [21, 21, 15],
        standingsConfirmedAt: "2026-08-24T09:00:00.000Z",
        standingsConfirmedBy: "official",
      };
      const command = commandFor([]);
      command.draft = {
        ...createDraft,
        basics: {
          ...createDraft.basics,
          eventType,
          hostId: "host_1",
          parentEvent: eventType === "WEEKLY_EVENT" ? "parent-event" : null,
          ...(eventType === "TRYOUT"
            ? {
              organizationId: "org-tryout",
              start: "2026-08-24T09:00:00.000Z",
              end: "2026-08-24T17:00:00.000Z",
              timeZone: "UTC",
            }
            : {}),
        },
        competition: {
          ...createDraft.competition,
          divisionIds: [division.id],
          divisionDetails: [division],
        },
        resources: eventType === "TRYOUT"
          ? {
            ...createDraft.resources,
            fieldIds: ["field-tryout"],
            timeSlotIds: ["slot-tryout"],
            fields: [{ id: "field-tryout", organizationId: "org-tryout" }],
            timeSlots: [{
              id: "slot-tryout",
              repeating: false,
              startDate: "2026-08-24",
              endDate: "2026-08-24",
              startTimeMinutes: 9 * 60,
              endTimeMinutes: 17 * 60,
              timeZone: "UTC",
              scheduledFieldIds: ["field-tryout"],
            }],
          }
          : {
            ...createDraft.resources,
            fieldIds: ["field-assigned"],
          },
      };
      command.scheduleTransition = {
        mode: "RECONCILE",
        expectedScheduleRevision: "schedule_revision_transition",
      };
      if (eventType === "TRYOUT") {
        tx.fields.findMany.mockResolvedValue([
          { id: "field-tryout", organizationId: "org-tryout" },
        ]);
      }

      await saveEventEditor({ userId: "host_1" }, command, "event_1");

      expect(mockedReconcileEventSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          tx,
          eventId: "event_1",
          mode: "DELETE",
        }),
      );
      expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
      const [payload] = (upsertEventFromPayload as jest.Mock).mock.calls[0];
      expect(payload.divisionDetails).toEqual([
        expect.objectContaining({
          id: division.id,
          sourceDivisionId: "division-source",
          fieldIds: ["field-assigned"],
          teamIds: eventType === "TRYOUT" ? [] : ["team-assigned"],
          price: division.price,
          maxParticipants: division.maxParticipants,
          allowPaymentPlans: division.allowPaymentPlans,
          installmentCount: division.installmentCount,
          installmentDueDates: division.installmentDueDates,
          installmentDueRelativeDays: division.installmentDueRelativeDays,
          installmentAmounts: division.installmentAmounts,
          ageCutoffDate: division.ageCutoffDate,
          ageCutoffLabel: division.ageCutoffLabel,
          ageCutoffSource: division.ageCutoffSource,
          isSystemGenerated: false,
          role: "ENTRY",
          phase: null,
          poolPlay: false,
          playoffTeamCount: null,
          poolCount: null,
          poolTeamCount: null,
          phaseSettings: {},
          playoffPlacementDivisionIds: [],
          standingsOverrides: null,
          playoffConfig: null,
          gamesPerOpponent: null,
          restTimeMinutes: null,
          usesSets: null,
          matchDurationMinutes: null,
          setDurationMinutes: null,
          setsPerMatch: null,
          pointsToVictory: [],
          standingsConfirmedAt: null,
          standingsConfirmedBy: null,
        }),
      ]);
      expect(payload.playoffDivisionDetails).toEqual([]);
      expect(payload.divisionFieldIds).toEqual({});
    },
  );


  it("persists a Playoff count change with PRESERVE without scheduling an open-ended unplaced Match Graph", async () => {
    const tx = txFor();
    const current = snapshot();
    current.draft = {
      ...current.draft,
      basics: {
        ...current.draft.basics,
        eventType: "LEAGUE",
        start: "2026-08-19T10:00:00.000Z",
      },
      competition: {
        includePlayoffs: true,
        playoffTeamCount: 3,
      },
      schedule: {
        mode: "GENERATED_END",
        endConstraint: null,
        generatedScheduleEnd: "2026-08-18T09:00:00.000Z",
      },
    };
    current.scheduleState = {
      ...current.scheduleState,
      matchCount: 3,
      matchDemand: {
        total: 3,
        byDivision: { division_1: 3 },
        byPhase: { LEAGUE: 3 },
        placed: 0,
        unplaced: 3,
      },
      revision: "schedule_revision_open_ended",
    };
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");

    const command = commandFor([]);
    command.draft.basics = {
      ...command.draft.basics,
      eventType: "LEAGUE",
      start: "2026-08-19T10:00:00.000Z",
    };
    command.draft.competition = {
      ...command.draft.competition,
      includePlayoffs: true,
      playoffTeamCount: 4,
    };
    command.draft.schedule = {
      mode: "GENERATED_END",
      endConstraint: null,
      generatedScheduleEnd: "2026-08-18T09:00:00.000Z",
    };
    command.scheduleTransition = { mode: "PRESERVE" };

    const result = await saveEventEditor(
      { userId: "host_1" },
      command,
      "event_1",
    );

    expect(upsertEventFromPayload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event_1" }),
      tx,
      expect.objectContaining({
        preserveOperationalState: true,
        preserveStaffState: true,
      }),
    );
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
    expect(result.scheduleOutcome).toEqual(
      expect.objectContaining({
        status: "NOT_REQUESTED",
        matchCount: 3,
        warnings: [],
      }),
    );
    expect(result.snapshot.scheduleState.matchCount).toBe(3);
    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();
  });

  it("deletes the schedule for a transition to a non-schedulable event type", async () => {
    const tx = txFor();
    const current = snapshot();
    current.draft = { ...current.draft, basics: { eventType: "LEAGUE" } };
    current.scheduleState = {
      ...current.scheduleState,
      matchCount: 3,
      revision: "schedule_revision_league",
    };
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(current);
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event_1");
    mockedReconcileEventSchedule.mockResolvedValue({
      event: { id: "event_1", eventType: "EVENT" },
      matches: [],
      warnings: [],
      previousMatchCount: 3,
      notification: null,
    });

    const command = commandFor([]);
    command.draft.basics.eventType = "EVENT";
    command.scheduleTransition = {
      mode: "RECONCILE",
      expectedScheduleRevision: "schedule_revision_league",
    };
    const result = await saveEventEditor(
      { userId: "host_1" },
      command,
      "event_1",
    );

    expect(mockedReconcileEventSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        eventId: "event_1",
        mode: "DELETE",
      }),
    );
    expect(result.scheduleOutcome).toEqual({
      status: "DELETED",
      matchCount: 0,
      matches: [],
      warnings: [],
    });
  });

  it("rejects a stale schedule revision before persisting an event-type transition", async () => {
    const tx = txFor();
    const current = snapshot();
    current.draft = { ...current.draft, basics: { eventType: "EVENT" } };
    current.scheduleState = {
      ...current.scheduleState,
      revision: "schedule_revision_current",
    };
    (buildEventEditorSnapshot as jest.Mock).mockResolvedValue(current);

    const command = commandFor([]);
    command.draft.basics.eventType = "LEAGUE";
    command.scheduleTransition = {
      mode: "RECONCILE",
      expectedScheduleRevision: "schedule_revision_stale",
    };

    await expect(
      saveEventEditor({ userId: "host_1" }, command, "event_1"),
    ).rejects.toMatchObject({
      code: "EDITOR_SCHEDULE_REVISION_CONFLICT",
    });

    expect(upsertEventFromPayload).not.toHaveBeenCalled();
    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();
    expect(tx.registrationQuestions.create).not.toHaveBeenCalled();
  });
});

describe("createEventEditor", () => {
  // The Prisma mock is intentionally narrowed to the transaction seam used by this suite.
  const prismaTransactionMock = prisma as { $transaction: jest.Mock };
  const createActor = { userId: "user_fixture_host" };
  const command = () => ({
    contractVersion: 3 as const,
    createOperationId: "create-operation-1",
    expectedRevisions: {
      editorRevision: "create-editor-revision",
      staffRevision: "create-staff-revision",
      scheduleRevision: "new",
    },
    draft: createDraft,
    completion: { mode: "CREATE_ONLY" as const },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue(undefined);
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue(
      createSnapshot("CREATE", null),
    );
    (loadEventEditorSnapshot as jest.Mock).mockImplementation(
      async (eventId: string) => createSnapshot("EDIT", eventId),
    );
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [],
    });
  });
  it("rejects schedule construction when Automated Scheduling is off", async () => {
    const invalidCommand = {
      ...command(),
      createOperationId: "create-only-required-operation",
      draft: {
        ...leagueCreateDraft,
        schedule: {
          ...leagueCreateDraft.schedule,
          isAutomatedScheduling: false,
          mode: "FIXED_END",
          endConstraint: "2026-09-01T18:00:00.000Z",
        },
      },
      completion: { mode: "CREATE_AND_BUILD_SCHEDULE" as const },
    } satisfies CreateEventEditorCommand;

    await expect(createEventEditor(createActor, invalidCommand)).rejects.toThrow(
      "Automated Scheduling must be enabled when Create builds a schedule.",
    );
    expect(prismaTransactionMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns the operation identity and every canonical revision", async () => {
    createEventEditorTxFor();

    const result = await createEventEditor(createActor, command());

    expect(result).toEqual(
      expect.objectContaining({
        createOperationId: "create-operation-1",
        editorRevision: "create-editor-revision",
        staffRevision: "create-staff-revision",
        scheduleRevision: "schedule_revision_1",
      }),
    );
    expect(result.editorRevision).toBe(result.snapshot.editorRevision);
    expect(result.staffRevision).toBe(result.snapshot.staffRevision);
    expect(result.scheduleRevision).toBe(
      result.snapshot.scheduleState.revision,
    );
  });
  it("includes the persisted Match Graph in a direct Tournament saved result", async () => {
    const { tx } = createEventEditorTxFor();
    (loadCreateEventEditorSnapshot as jest.Mock).mockReset();
    (loadCreateEventEditorSnapshot as jest.Mock).mockResolvedValue({
      ...createSnapshot("CREATE", null),
      draft: tournamentCreateDraft,
    });
    (loadEventEditorSnapshot as jest.Mock).mockReset();
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue({
      ...createSnapshot("EDIT", "event-created"),
      draft: tournamentCreateDraft,
    });
    (upsertEventFromPayload as jest.Mock).mockReset();
    (upsertEventFromPayload as jest.Mock).mockResolvedValue("event-created");
    mockedPersistCreateOnlyMatchGraph.mockReset();
    const freshTournamentBootstrapDraft =
      actualEditorAdapters.legacyEventToEditorDraft(eventEditorFixtures[2].event);
    expect(freshTournamentBootstrapDraft.schedule.isAutomatedScheduling).toBe(true);

    const phaseDivision = {
      id: "division-phase",
      name: "Generated Pool",
      kind: "POOL",
      role: "PHASE",
      phase: "POOL",
      sourceDivisionId: "division-source",
      isSystemGenerated: true,
      phaseSettings: {},
      teamIds: [],
      playoffTeamCount: null,
      playoffPlacementDivisionIds: [],
      standingsOverrides: null,
      standingsConfirmedAt: null,
      standingsConfirmedBy: null,
      playoffConfig: null,
      leagueConfig: null,
    };
    const graphField = {
      id: "field-generated",
      organizationId: null,
      divisions: ["division-phase"],
      name: "Generated Field",
    };
    const graphTimeSlot = {
      id: "slot-generated",
      dayOfWeek: 1,
      daysOfWeek: [1],
      startDate: "2026-08-24T09:00:00.000Z",
      endDate: null,
      repeating: false,
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      price: null,
      scheduledFieldId: "field-generated",
      scheduledFieldIds: ["field-generated"],
      divisions: ["division-phase"],
    };
    const graphMatch = {
      ...serializedProposalMatch("event-created"),
      start: null,
      end: null,
      placementState: "UNPLACED",
      phase: "POOL",
      sourceDivisionId: "division-source",
      phaseDivisionId: "division-phase",
      division: "division-phase",
      fieldId: null,
      officialIds: [],
      officialAssignments: [],
      teamOfficialId: null,
      teamOfficialSeed: null,
      official: null,
      teamOfficial: null,
      field: null,
    };
    const graphEvent = {
      ...serializedProposalEvent("event-created"),
      eventType: "TOURNAMENT",
      end: tournamentPlannedEnd,
      scheduleEndConstraint: tournamentPlannedEnd,
      generatedScheduleEnd: null,
      noFixedEndDateTime: false,
      divisions: ["division-source", "division-phase"],
      fieldIds: ["field-generated"],
      timeSlotIds: ["slot-generated"],
      divisionDetails: [phaseDivision],
      fields: [graphField],
      timeSlots: [graphTimeSlot],
    };
    mockedPersistCreateOnlyMatchGraph.mockResolvedValue({
      event: graphEvent,
      matches: [graphMatch],
      demand: {},
    });

    const result = await createEventEditor(createActor, {
      contractVersion: 3,
      createOperationId: "create-only-graph-operation",
      expectedRevisions: expectedCreateRevisions,
      draft: tournamentCreateDraft,
      completion: { mode: "CREATE_ONLY" },
    } satisfies CreateEventEditorCommand);
    expect(result).toEqual(
      expect.objectContaining({
        createOperationId: "create-only-graph-operation",
        editorRevision: "create-editor-revision",
        staffRevision: "create-staff-revision",
        scheduleRevision: "schedule_revision_1",
      }),
    );
    expect(result.snapshot.draft.schedule).toEqual(
      expect.objectContaining({
        mode: "FIXED_END",
        endConstraint: tournamentPlannedEnd,
        isAutomatedScheduling: false,
      }),
    );
    expect(result.graph?.event).toEqual(
      expect.objectContaining({
        end: tournamentPlannedEnd,
        scheduleEndConstraint: tournamentPlannedEnd,
        generatedScheduleEnd: null,
        noFixedEndDateTime: false,
      }),
    );
    expect(result.scheduleOutcome).toEqual(
      expect.objectContaining({
        status: "NOT_REQUESTED",
        matchCount: 1,
        matches: [
          expect.objectContaining({
            id: "match-created",
            start: null,
            end: null,
            placementState: "UNPLACED",
            fieldId: null,
            officialId: null,
            officialIds: [],
            teamOfficialId: null,
          }),
        ],
        warnings: [],
      }),
    );
    expect(mockedReconcileEventSchedule).not.toHaveBeenCalled();

    expect(mockedPersistCreateOnlyMatchGraph).toHaveBeenCalledWith({
      tx,
      eventId: expect.any(String),
      includePlaceholderTeams: true,
    });
    expect(result.graph).toEqual({
      event: graphEvent,
      matches: [graphMatch],
    });
    expect(result.graph?.event.divisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "division-phase", isSystemGenerated: true }),
      ]),
    );
    expect(result.graph?.event.fields).toEqual([
      expect.objectContaining({ id: "field-generated", divisions: ["division-phase"] }),
    ]);
    expect(result.graph?.event.timeSlots).toEqual([
      expect.objectContaining({ id: "slot-generated", divisions: ["division-phase"] }),
    ]);
    expect(result.graph?.matches).toEqual([
      expect.objectContaining({
        id: "match-created",
        start: null,
        end: null,
        placementState: "UNPLACED",
        phaseDivisionId: "division-phase",
        division: "division-phase",
        fieldId: null,
        officialIds: [],
        officialAssignments: [],
        teamOfficialId: null,
        teamOfficialSeed: null,
        official: null,
        teamOfficial: null,
        field: null,
      }),
    ]);
  });

  it("defaults a claimed Organization Event created by non-Host staff to the current owner", async () => {
    const { tx } = createEventEditorTxFor();
    tx.organizations.findUnique.mockResolvedValue({
      id: "org_1",
      ownerId: "owner_1",
      ownershipStatus: "CLAIMED",
      enabledFeatures: ["EVENT_MANAGEMENT"],
    });
    tx.staffMembers.findMany.mockResolvedValue([
      {
        organizationId: "org_1",
        userId: "user_fixture_host",
        types: ["STAFF"],
      },
    ]);
    const organizationCommand = command();
    organizationCommand.draft = {
      ...organizationCommand.draft,
      basics: {
        ...organizationCommand.draft.basics,
        organizationId: "org_1",
        hostId: null,
      },
    };

    await createEventEditor(createActor, organizationCommand);

    expect(upsertEventFromPayload).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: "owner_1" }),
      tx,
      expect.objectContaining({ preserveStaffState: true }),
    );
    expect(reconcileEventStaffDesiredState).toHaveBeenCalledWith(
      tx,
      expect.any(String),
      expect.objectContaining({ assistantHostIds: [] }),
      "user_fixture_host",
    );
  });

  it("rejects a requested claimed Organization host who is not owner or active Host staff", async () => {
    const { tx } = createEventEditorTxFor();
    tx.organizations.findUnique.mockResolvedValue({
      id: "org_1",
      ownerId: "owner_1",
      ownershipStatus: "CLAIMED",
      enabledFeatures: ["EVENT_MANAGEMENT"],
    });
    tx.staffMembers.findMany.mockResolvedValue([
      {
        organizationId: "org_1",
        userId: "user_fixture_host",
        types: ["STAFF"],
      },
    ]);
    const organizationCommand = command();
    organizationCommand.draft = {
      ...organizationCommand.draft,
      basics: {
        ...organizationCommand.draft.basics,
        organizationId: "org_1",
        hostId: "user_fixture_host",
      },
    };

    await expect(
      createEventEditor(createActor, organizationCommand),
    ).rejects.toBeInstanceOf(EditorPermissionError);
    expect(upsertEventFromPayload).not.toHaveBeenCalled();
  });

  it("rejects a stale create revision before Event-owned persistence", async () => {
    const { rows } = createEventEditorTxFor();
    const staleCommand = command();
    staleCommand.expectedRevisions.editorRevision = "stale-editor-revision";

    await expect(
      createEventEditor(createActor, staleCommand),
    ).rejects.toMatchObject({
      currentEditorRevision: "create-editor-revision",
      currentStaffRevision: "create-staff-revision",
      currentScheduleRevision: "new",
    });

    expect(upsertEventFromPayload).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredState).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });

  it("rolls back all Event-owned state and emits no effects when creation fails", async () => {
    const { questionRows, rows, tx } = createEventEditorTxFor();
    const persistedEventIds: string[] = [];
    const createWithQuestion = command();
    createWithQuestion.draft = {
      ...createWithQuestion.draft,
      registration: {
        ...createWithQuestion.draft.registration,
        questions: [
          {
            clientId: "question-client-1",
            prompt: "Emergency contact",
            answerType: "TEXT",
            required: true,
            sortOrder: 0,
          },
        ],
      },
    };
    (upsertEventFromPayload as jest.Mock).mockImplementation(
      async (payload: { id: string }) => {
        persistedEventIds.push(payload.id);
      },
    );
    (reconcileEventStaffDesiredState as jest.Mock).mockImplementation(
      async () => {
        persistedEventIds.push("partial-staff-write");
        throw new Error("staff persistence failed");
      },
    );
    prismaTransactionMock.$transaction = jest.fn(
      async (callback: (client: unknown) => unknown) => {
        const rowsBefore = new Map(
          Array.from(rows.entries()).map(([key, value]) => [key, { ...value }]),
        );
        const questionsBefore = questionRows.map((row) => ({ ...row }));
        const eventsBefore = [...persistedEventIds];
        try {
          return await callback(tx);
        } catch (error) {
          rows.clear();
          rowsBefore.forEach((value, key) => rows.set(key, value));
          questionRows.splice(0, questionRows.length, ...questionsBefore);
          persistedEventIds.splice(
            0,
            persistedEventIds.length,
            ...eventsBefore,
          );
          throw error;
        }
      },
    );
    const sendStaffInvites = jest.fn();
    const onEventCreated = jest.fn();
    const onScheduleChanged = jest.fn();

    await expect(
      createEventEditor(createActor, createWithQuestion, {
        sendStaffInvites,
        onEventCreated,
        onScheduleChanged,
      }),
    ).rejects.toThrow("staff persistence failed");

    expect(rows.size).toBe(0);
    expect(questionRows).toHaveLength(0);
    expect(persistedEventIds).toHaveLength(0);
    expect(sendStaffInvites).not.toHaveBeenCalled();
    expect(onEventCreated).not.toHaveBeenCalled();
    expect(onScheduleChanged).not.toHaveBeenCalled();
  });

  it("emits invitations and creation notifications after commit at most once on exact retry", async () => {
    const { tx } = createEventEditorTxFor();
    let committed = false;
    prismaTransactionMock.$transaction = jest.fn(
      async (callback: (client: unknown) => unknown) => {
        const result = await callback(tx);
        committed = true;
        return result;
      },
    );
    (reconcileEventStaffDesiredState as jest.Mock).mockResolvedValue({
      emailCandidates: [{ email: "official@example.com" }],
    });
    const sendStaffInvites = jest.fn(async () => {
      expect(committed).toBe(true);
      return "QUEUED" as const;
    });
    const onEventCreated = jest.fn(async () => {
      expect(committed).toBe(true);
    });
    const unchangedCommand = command();

    const first = await createEventEditor(createActor, unchangedCommand, {
      sendStaffInvites,
      onEventCreated,
    });
    const replay = await createEventEditor(createActor, unchangedCommand, {
      sendStaffInvites,
      onEventCreated,
    });

    expect(replay).toEqual(first);
    expect(upsertEventFromPayload).toHaveBeenCalledTimes(1);
    expect(sendStaffInvites).toHaveBeenCalledTimes(1);
    expect(onEventCreated).toHaveBeenCalledTimes(1);
  });
});
