jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/server/repositories/locks", () => ({
  acquireEventLock: jest.fn(),
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
}));
jest.mock("../eventStaffReconciliation", () => ({
  EVENT_STAFF_CONTRACT_VERSION: 1,
  EventStaffInputError: class EventStaffInputError extends Error {},
  reconcileEventStaffDesiredState: jest
    .fn()
    .mockResolvedValue({ emailCandidates: [] }),
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
    EventScheduleRevisionConflictError,
    persistCreateOnlyMatchGraph: jest.fn(),
    reconcileEventSchedule: jest.fn(),
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
import { EventDivisionNameValidationError } from "@/lib/divisionTypes";
import { acquireEventLock } from "@/server/repositories/locks";
import { upsertEventFromPayload } from "@/server/repositories/events";
import {
  buildEventEditorSnapshot,
  loadCreateEventEditorSnapshot,
  loadEventEditorSnapshot,
} from "../eventEditorSnapshot";
import {
  EventStaffInputError,
  reconcileEventStaffDesiredState,
} from "../eventStaffReconciliation";
import {
  persistCreateOnlyMatchGraph,
  reconcileEventSchedule,
} from "@/server/scheduler/eventScheduleMutation";
import {
  createEventEditor,
  EditorInputError,
  EditorPermissionError,
  EditorRevisionConflictError,
  saveEventEditor,
} from "../eventEditorSave";

const mockedPersistCreateOnlyMatchGraph =
  persistCreateOnlyMatchGraph as jest.Mock;
const mockedReconcileEventSchedule = reconcileEventSchedule as jest.Mock;

const txFor = (questionRows: Array<{ id: string }> = []) => {
  const tx: any = {
    events: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "event_1", hostId: "host_1" }),
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
      basics: { eventType: "EVENT", hostId: "host_1", organizationId: null },
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
    revision: mode === "CREATE" ? "new" : "schedule_revision_1",
    hasProtectedHistory: false,
  },
});

const createEventEditorTxFor = () => {
  const rows = new Map<string, any>();
  const operations = {
    findUnique: jest.fn(
      async ({ where }: any) =>
        rows.get(String(where.createOperationId)) ?? null,
    ),
    createMany: jest.fn(async ({ data }: any) => {
      const key = String(data.createOperationId);
      if (rows.has(key)) return { count: 0 };
      rows.set(key, { ...data });
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(String(where.createOperationId));
      if (!row) throw new Error("create operation not found");
      Object.assign(row, data);
      return row;
    }),
  };
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
  };
  (prisma as any).eventEditorCreateOperations = operations;
  (prisma as any).$transaction = jest.fn(
    async (callback: (client: unknown) => unknown) => {
      const rowsBefore = new Map(
        Array.from(rows.entries()).map(([key, value]) => [key, { ...value }]),
      );
      const questionsBefore = questionRows.map((row) => ({ ...row }));
      try {
        return await callback(tx);
      } catch (error) {
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
    (loadEventEditorSnapshot as jest.Mock).mockResolvedValue(snapshot());
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
  it("builds a League schedule inside the create transaction", async () => {
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
    mockedReconcileEventSchedule.mockResolvedValue({
      event: {},
      matches: [{ id: "match-created", eventId: "event-created", fieldId: null }],
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
      event: {},
      matches: Array.from({ length: 6 }, (_, index) => ({
        id: `event-created:match:${index + 1}`,
        eventId: "event-created",
        placementState: "UNPLACED",
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
        automatedScheduling: false,
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
          automatedScheduling: false,
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
