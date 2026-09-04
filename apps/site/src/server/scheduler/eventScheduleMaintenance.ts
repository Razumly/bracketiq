import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  eventEditorMaintenanceAcceptedResultSchema,
  eventEditorMaintenanceProposalSchema,
  eventEditorMaintenanceRejectedResultSchema,
  eventEditorMaintenanceScheduleOutcomeSchema,
  type EventEditorAcceptMaintenanceProposal,
  type EventEditorMaintenanceOperation,
  type EventEditorMaintenanceProposal,
  type EventEditorMaintenanceRequest,
  type EventEditorMaintenanceResponse,
  type EventEditorRejectMaintenanceProposal,
  type EventEditorRevisionBinding,
  type EventEditorScheduleWarning,
  type EventEditorScheduleDiagnostics,
} from "@/contracts/eventEditor";
import { canManageEvent } from "@/server/accessControl";
import {
  computeEventEditorRevision,
  loadEventScheduleState,
  loadExistingEventEditorSnapshot,
} from "@/server/events/eventEditorSnapshot";
import {
  loadMaintenanceLockResourceIdsFor,
  loadMaintenanceRevisionBinding,
  type MaintenanceLockResourceIds,
} from "@/server/scheduler/eventScheduleMaintenanceRevisionBinding";
import { loadEventProtectedHistory } from "@/server/events/eventProtectedHistory";
import {
  collectPhaseDivisions,
  persistPhaseParticipantAssignments,
  type PhasePersistenceClient,
} from "@/server/repositories/eventDivisionPhases";
import {
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
  type MatchPersistenceInput,
  type ScheduledRosterInput,
  type ScheduledRosterTeamInput,
} from "@/server/repositories/events";
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
import type { League, Match, Tournament } from "@/server/scheduler/types";
import {
  collectMatchScheduleChanges,
  snapshotMatchScheduleState,
  type MatchScheduleNotificationPlan,
} from "@/server/matchScheduleNotifications";

export type MaintenanceClient = Prisma.TransactionClient;

type MaintenanceActorEvent = {
  event: League | Tournament;
  persistedEvent: Record<string, unknown>;
  automatedScheduling: boolean;
};

type MaintenanceOperationRow = {
  operationId: string;
  eventId: string;
  actorUserId: string;
  operation: string;
  requestHash: string;
  proposalRevision: string | null;
  proposalJson: unknown;
  revisionBindingJson: unknown;
  status: string;
  acceptanceOperationId: string | null;
  acceptedResponseJson: unknown;
};

type MaintenanceDelegate = {
  findUnique: (args: unknown) => Promise<MaintenanceOperationRow | null>;
  create: (args: unknown) => Promise<MaintenanceOperationRow>;
  update: (args: unknown) => Promise<MaintenanceOperationRow>;
};

const operationsFor = (client: MaintenanceClient): MaintenanceDelegate => {
  const operations = (client as unknown as Record<string, unknown>)
    .eventEditorMaintenanceOperations;
  if (!operations || typeof operations !== "object") {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Maintenance operation storage is unavailable.",
    );
  }
  return operations as MaintenanceDelegate;
};

const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.startsWith("$"))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, jsonSafe(entry)]),
    );
  }
  return value;
};

const hash = (value: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(jsonSafe(value))).digest("hex");
const operationRequestHash = (
  request: EventEditorMaintenanceRequest,
): string => hash(request);

const equalJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(jsonSafe(left)) === JSON.stringify(jsonSafe(right));

export class MaintenanceOperationError extends Error {
  readonly code:
    | "EDITOR_MAINTENANCE_INVALID"
    | "EDITOR_MAINTENANCE_NOT_FOUND"
    | "EDITOR_MAINTENANCE_REJECTED"
    | "EDITOR_MAINTENANCE_STALE"
    | "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT"
    | "EDITOR_MAINTENANCE_UNAUTHORIZED";

  constructor(
    code: MaintenanceOperationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "MaintenanceOperationError";
    this.code = code;
  }
}

const asEventType = (event: { eventType?: unknown }): string =>
  String(event.eventType ?? "").trim().toUpperCase();

export const assertMaintenanceCapability = (
  event: League | Tournament,
  operation: EventEditorMaintenanceOperation,
  automatedScheduling: boolean,
): void => {
  if (!["LEAGUE", "TOURNAMENT"].includes(asEventType(event))) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Only League and Tournament events support schedule maintenance.",
    );
  }
  if (automatedScheduling !== true) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Automated Scheduling must be enabled for schedule maintenance.",
    );
  }
  const eventRecord = event as unknown as Record<string, unknown>;
  if (String(eventRecord.state ?? "").trim().toUpperCase() === "TEMPLATE") {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Schedule maintenance is not available for Template events.",
    );
  }
  const matches = Object.values(event.matches ?? {});
  const matchCount = matches.length;
  if (operation === "BUILD" && matchCount > 0) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Build is available only for an Event without an existing Match Graph.",
    );
  }
  if ((operation === "COMPLETE" || operation === "REBUILD") && matchCount === 0) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      `${operation} requires an existing Match Graph.`,
    );
  }
  if (
    operation === "COMPLETE"
    && !matches.some((match) => match.placementState === "UNPLACED")
  ) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Complete requires at least one unplaced Match.",
    );
  }
};
const maintenanceCapabilityDrifted = (
  proposal: EventEditorMaintenanceProposal,
  event: League | Tournament,
  automatedScheduling: boolean,
): boolean => {
  if (asEventType(event) !== asEventType(proposal.graph.event)) {
    return true;
  }
  if (automatedScheduling !== true) {
    return true;
  }
  const eventRecord = event as unknown as Record<string, unknown>;
  if (String(eventRecord.state ?? "").trim().toUpperCase() === "TEMPLATE") {
    return true;
  }
  const matches = Object.values(event.matches ?? {});
  if (proposal.operation === "BUILD" && matches.length > 0) {
    return true;
  }
  if (
    proposal.operation === "COMPLETE"
    && !matches.some((match) => match.placementState === "UNPLACED")
  ) {
    return true;
  }
  return proposal.operation === "REBUILD" && matches.length === 0;
};

const protectedStatus = new Set([
  "STARTED",
  "IN_PROGRESS",
  "COMPLETE",
  "COMPLETED",
  "FINAL",
  "SUSPENDED",
]);

export type MaintenanceMatchClassification = "PROTECTED" | "REPLACEABLE";

/** Explicitly classifies all three Rebuild protection sources in memory. */
export const classifyMaintenanceMatch = (
  match: Match,
  protectedHistoryIds: ReadonlySet<string> = new Set<string>(),
): MaintenanceMatchClassification => {
  const row = match as unknown as Record<string, unknown>;
  const status = String(row.status ?? "").trim().toUpperCase();
  const resultStatus = String(row.resultStatus ?? "").trim().toUpperCase();
  const hasActivity = [
    row.actualStart,
    row.actualEnd,
    row.resultType,
    row.winnerEventTeamId,
  ].some((value) => value !== null && value !== undefined && value !== "");
  const hasScore = [row.team1Points, row.team2Points].some(
    (value) => Array.isArray(value) && value.some((score) => Number(score) !== 0),
  );
  return match.locked
    || protectedHistoryIds.has(match.id)
    || protectedStatus.has(status)
    || protectedStatus.has(resultStatus)
    || hasActivity
    || hasScore
    ? "PROTECTED"
    : "REPLACEABLE";
};

export const protectedMaintenanceMatchIds = (
  matches: Match[],
  protectedHistoryIds: ReadonlySet<string> = new Set<string>(),
): Set<string> => {
  const directlyProtected = new Set(
    matches
      .filter((match) => classifyMaintenanceMatch(match, protectedHistoryIds) === "PROTECTED")
      .map((match) => match.id),
  );
  const protectedPhaseDivisionIds = new Set(
    matches
      .filter((match) => directlyProtected.has(match.id))
      .map((match) => match.division?.id ?? "")
      .filter((divisionId) => divisionId.length > 0),
  );
  return new Set(
    matches
      .filter((match) => (
        directlyProtected.has(match.id)
        || protectedPhaseDivisionIds.has(match.division?.id ?? "")
      ))
      .map((match) => match.id),
  );
};

const placementFailureWarningsFor = (
  failures: readonly {
    matchId: string;
    message: string;
    restrictingFactor: NonNullable<EventEditorScheduleWarning["restrictingFactor"]>;
  }[],
): EventEditorScheduleWarning[] =>
  failures.map((failure) => ({
    code: "SCHEDULE_PLACEMENT_FAILED",
    message: failure.message,
    matchIds: [failure.matchId],
    restrictingFactor: failure.restrictingFactor,
  }));


const outcomeFor = (params: {
  event: League | Tournament;
  matches: Match[];
  warnings: EventEditorMaintenanceProposal["scheduleOutcome"]["warnings"];
  diagnostics?: EventEditorScheduleDiagnostics;
}): EventEditorMaintenanceProposal["scheduleOutcome"] => {
  const projections = editorMatchProjectionsFor(
    params.matches,
    params.event.officialPositions,
    params.event.eventType,
  );
  const unplaced = projections.filter((match) => match.placementState === "UNPLACED");
  const details = [
    ...((params.event as unknown as Record<string, unknown>).divisionDetails as unknown[] ?? []),
    ...((params.event as unknown as Record<string, unknown>).playoffDivisionDetails as unknown[] ?? []),
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
  const detailsById = new Map(details.map((detail) => [String(detail.id), detail]));
  const unscheduledMatches = unplaced.map((match) => {
    const phaseDivisionId = [
      match.phaseDivisionId,
      match.division,
      match.sourceDivisionId,
    ].find((value): value is string => Boolean(value?.trim()))?.trim();
    if (!phaseDivisionId) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        `Unscheduled Match ${match.id} has no Competition Phase or Division identity.`,
      );
    }
    const detail = detailsById.get(phaseDivisionId);
    const phase = [
      match.phase,
      typeof detail?.phase === "string" ? detail.phase : null,
    ].find((value): value is string => Boolean(value?.trim()))?.trim();
    if (!phase) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        `Unscheduled Match ${match.id} has no Competition Phase identity.`,
      );
    }
    return {
      id: match.id,
      matchId: match.matchId,
      phaseDivisionId,
      phase,
      sourceDivisionId: match.sourceDivisionId,
    };
  });
  const phases = Array.from(new Map(
    unscheduledMatches.map((match) => {
      const detail = detailsById.get(match.phaseDivisionId);
      return [match.phaseDivisionId, {
        id: match.phaseDivisionId,
        name: String(detail?.name ?? "Competition Phase details unavailable"),
        phase: String(detail?.phase ?? match.phase),
        sourceDivisionId: detail?.sourceDivisionId == null
          ? match.sourceDivisionId
          : String(detail.sourceDivisionId),
      }];
    }),
  ).values());
  if (unplaced.length === 0) {
    return eventEditorMaintenanceScheduleOutcomeSchema.parse({
      status: "COMPLETE",
      isComplete: true,
      matchCount: projections.length,
      placedMatchCount: projections.length,
      unplacedMatchCount: 0,
      matches: projections,
      unscheduledMatches: [],
      affectedCompetitionPhases: [],
      diagnostics: params.diagnostics,
      warnings: params.warnings,
    });
  }
  return eventEditorMaintenanceScheduleOutcomeSchema.parse({
    status: "INCOMPLETE",
    isComplete: false,
    matchCount: projections.length,
    placedMatchCount: projections.length - unplaced.length,
    unplacedMatchCount: unplaced.length,
    matches: projections,
    unscheduledMatches,
    affectedCompetitionPhases: phases,
    diagnostics: params.diagnostics,
    warnings: params.warnings,
  });
};

const proposalFor = (params: {
  event: League | Tournament;
  matches: Match[];
  operation: EventEditorMaintenanceOperation;
  operationId: string;
  revisionBinding: EventEditorRevisionBinding;
  protectedMatchIds: Set<string>;
  warnings: EventEditorMaintenanceProposal["scheduleOutcome"]["warnings"];
  diagnostics?: EventEditorScheduleDiagnostics;
}): EventEditorMaintenanceProposal => {
  const graph = {
    event: serializeEvent(params.event),
    matches: serializeMatches(
      params.matches,
      params.event.officialPositions,
      params.event.eventType,
    ),
  };
  const proposalRevision = hash({
    operation: params.operation,
    operationId: params.operationId,
    revisionBinding: params.revisionBinding,
    graph,
  });
  return eventEditorMaintenanceProposalSchema.parse({
    status: "PROPOSED",
    contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
    eventId: params.event.id,
    operation: params.operation,
    operationId: params.operationId,
    proposalRevision,
    revisionBinding: params.revisionBinding,
    graph,
    protectedMatchIds: [...params.protectedMatchIds].sort(),
    scheduleOutcome: outcomeFor({
      event: params.event,
      matches: params.matches,
      warnings: params.warnings,
      diagnostics: params.diagnostics,
    }),
  });
};
const assertActor = async (
  actor: { userId: string; isAdmin: boolean },
  eventId: string,
  client: MaintenanceClient,
  retainedMatchIds?: string[],
): Promise<MaintenanceActorEvent> => {
  const eventAccess = await client.events.findUnique({
    where: { id: eventId },
  });
  if (!eventAccess) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_NOT_FOUND",
      "Event not found.",
    );
  }
  if (!(await canManageEvent(actor, eventAccess, client))) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_UNAUTHORIZED",
      "You are not authorized to maintain this Event schedule.",
    );
  }
  const event = retainedMatchIds
    ? await loadEventWithRelations(eventId, client, { retainedMatchIds })
    : await loadEventWithRelations(eventId, client);
  if (!event) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_NOT_FOUND",
      "Event not found.",
    );
  }
  return {
    event,
    persistedEvent: eventAccess as unknown as Record<string, unknown>,
    automatedScheduling: eventAccess.automatedScheduling === true,
  };
};
const MAINTENANCE_RESOURCE_LOCK_ROUNDS = 4;

type MaintenanceResourceLocks = MaintenanceLockResourceIds;

const resourceIdsEqual = (
  left: MaintenanceResourceLocks,
  right: MaintenanceResourceLocks,
): boolean => (
  equalJson(left, right)
);

const missingMaintenanceResourceIds = (
  locked: {
    fieldIds: Set<string>;
    timeSlotIds: Set<string>;
    bookingIds: Set<string>;
    bookingItemIds: Set<string>;
  },
  observed: MaintenanceResourceLocks,
): MaintenanceResourceLocks => ({
  fieldIds: observed.fieldIds.filter((id) => !locked.fieldIds.has(id)),
  timeSlotIds: observed.timeSlotIds.filter((id) => !locked.timeSlotIds.has(id)),
  bookingIds: observed.bookingIds.filter((id) => !locked.bookingIds.has(id)),
  bookingItemIds: observed.bookingItemIds.filter(
    (id) => !locked.bookingItemIds.has(id),
  ),
});

const hasMaintenanceResourceIds = (resources: MaintenanceResourceLocks): boolean =>
  resources.fieldIds.length > 0
  || resources.timeSlotIds.length > 0
  || resources.bookingIds.length > 0
  || resources.bookingItemIds.length > 0;

const acquireMaintenanceRentalLocks = async (
  tx: MaintenanceClient,
  bookingIds: string[],
  bookingItemIds: string[],
): Promise<void> => {
  await acquireRentalBookingLocks(tx, bookingIds, bookingItemIds);
};

const lockMaintenanceResourcesAndReload = async (
  tx: MaintenanceClient,
  actor: { userId: string; isAdmin: boolean },
  eventId: string,
  initial: MaintenanceActorEvent,
  retainedMatchIds?: string[],
): Promise<MaintenanceActorEvent> => {
  const locked = {
    fieldIds: new Set<string>(),
    timeSlotIds: new Set<string>(),
    bookingIds: new Set<string>(),
    bookingItemIds: new Set<string>(),
  };
  let observedEvent = initial.event;
  for (let round = 0; round < MAINTENANCE_RESOURCE_LOCK_ROUNDS; round += 1) {
    const observed = await loadMaintenanceLockResourceIdsFor(observedEvent, tx);
    const missing = missingMaintenanceResourceIds(locked, observed);
    if (missing.fieldIds.length) {
      await acquireFieldLocks(tx, missing.fieldIds);
    }
    if (missing.timeSlotIds.length) {
      await acquireTimeSlotLocks(tx, missing.timeSlotIds);
    }
    if (missing.bookingIds.length || missing.bookingItemIds.length) {
      await acquireMaintenanceRentalLocks(
        tx,
        missing.bookingIds,
        missing.bookingItemIds,
      );
    }
    missing.fieldIds.forEach((id) => locked.fieldIds.add(id));
    missing.timeSlotIds.forEach((id) => locked.timeSlotIds.add(id));
    missing.bookingIds.forEach((id) => locked.bookingIds.add(id));
    missing.bookingItemIds.forEach((id) => locked.bookingItemIds.add(id));

    const reloaded = await assertActor(actor, eventId, tx, retainedMatchIds);
    const reloadedResources = await loadMaintenanceLockResourceIdsFor(reloaded.event, tx);
    const uncovered = missingMaintenanceResourceIds(locked, reloadedResources);
    if (
      !hasMaintenanceResourceIds(uncovered)
      && resourceIdsEqual(observed, reloadedResources)
    ) {
      return reloaded;
    }
    observedEvent = reloaded.event;
  }
  throw new MaintenanceOperationError(
    "EDITOR_MAINTENANCE_STALE",
    "The Event scheduling resources changed while the operation was locking them. Request a new proposal.",
  );
};


/** Load one authorized Event after its scheduling resources are locked. */
export const loadLockedScheduleEvent = async (params: {
  tx: MaintenanceClient;
  actor: { userId: string; isAdmin: boolean };
  eventId: string;
}): Promise<MaintenanceActorEvent> => {
  await acquireEventLock(params.tx, params.eventId);
  const rows = await params.tx.matches.findMany({ where: { eventId: params.eventId }, select: { id: true } });
  const retainedMatchIds = rows.map((row) => row.id);
  const initial = await assertActor(params.actor, params.eventId, params.tx, retainedMatchIds);
  return lockMaintenanceResourcesAndReload(params.tx, params.actor, params.eventId, initial, retainedMatchIds);
};

export const createMaintenanceProposal = async (params: {
  tx: MaintenanceClient;
  actor: { userId: string; isAdmin: boolean };
  request: EventEditorMaintenanceRequest;
}): Promise<EventEditorMaintenanceResponse> => {
  const { tx, actor, request } = params;
  await acquireEventLock(tx, request.eventId);
  const operations = operationsFor(tx);
  const requestHash = operationRequestHash(request);
  const existing = await operations.findUnique({
    where: { operationId: request.operationId },
  });
  if (existing) {
    if (existing.eventId !== request.eventId || existing.actorUserId !== actor.userId) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_UNAUTHORIZED",
        "The maintenance operation belongs to another Event organizer.",
      );
    }
    if (existing.requestHash !== requestHash) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        "The operation identity was reused with a different request.",
      );
    }
    await assertActor(actor, request.eventId, tx);
    if (existing.status === "REJECTED") {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_REJECTED",
        "The maintenance proposal has been rejected.",
      );
    }
    if (existing.status === "ACCEPTED" && existing.acceptedResponseJson) {
      return eventEditorMaintenanceAcceptedResultSchema.parse(existing.acceptedResponseJson);
    }
    if (existing.proposalJson) {
      return eventEditorMaintenanceProposalSchema.parse(existing.proposalJson);
    }
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "The maintenance operation is still being computed.",
    );
  }
  const eventUnderEventLock = await assertActor(
    actor,
    request.eventId,
    tx,
  );
  const locked = await lockMaintenanceResourcesAndReload(
    tx,
    actor,
    request.eventId,
    eventUnderEventLock,
  );
  const {
    event,
    persistedEvent,
    automatedScheduling: lockedAutomatedScheduling,
  } = locked;
  assertMaintenanceCapability(event, request.operation, lockedAutomatedScheduling);
  const scheduleState = await loadEventScheduleState(
    persistedEvent,
    request.eventId,
    tx,
  );
  const revisionBinding = await loadMaintenanceRevisionBinding(
    event,
    scheduleState.revision,
    actor,
    tx,
    {
      includeCheckIns: true,
      automatedScheduling: lockedAutomatedScheduling,
      computeRevision: computeEventEditorRevision,
      loadEditorSnapshot: loadExistingEventEditorSnapshot as unknown as (
        eventId: string,
        snapshotActor: { userId: string; isAdmin: boolean },
        snapshotClient: MaintenanceClient,
      ) => Promise<{ editorRevision: string; staffRevision: string | null }>,
    },
  );
  if (
    request.expectedRevisions !== undefined
    && !equalJson(request.expectedRevisions, revisionBinding)
  ) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_STALE",
      "The Event schedule or scheduling inputs changed. Request a new proposal.",
    );
  }
  const history = await loadEventProtectedHistory(request.eventId, tx);
  const currentMatches = Object.values(event.matches);
  const protectedIds = request.operation === "REBUILD"
    ? new Set(
      currentMatches
        .filter((match) =>
          classifyMaintenanceMatch(match, history.protectedMatchIds) === "PROTECTED",
        )
        .map((match) => match.id),
    )
    : new Set(
      currentMatches
        .filter((match) => match.placementState === "PLACED")
        .map((match) => match.id),
    );
  const mutation = await reconcileEventSchedule({
    tx: tx as Prisma.TransactionClient,
    eventId: request.eventId,
    mode: request.operation === "COMPLETE" ? "RESCHEDULE_PRESERVING_LOCKS" : request.operation,
    expectedScheduleRevision: revisionBinding.scheduleRevision,
    historyPolicy: "ALLOW_PROTECTED",
    includePlaceholderTeams: request.includePlaceholderTeams !== false,
    participantCount: request.participantCount,
    allowPartialPlacement: true,
    persist: false,
    protectedMatchIds: protectedIds,
    regenerateGraph: request.operation === "REBUILD",
  });
  const proposalProtectedIds = request.operation === "REBUILD"
    ? protectedMaintenanceMatchIds(mutation.matches, protectedIds)
    : protectedIds;
  const proposal = proposalFor({
    event: mutation.event,
    matches: mutation.matches,
    operation: request.operation,
    operationId: request.operationId,
    revisionBinding,
    protectedMatchIds: proposalProtectedIds,
    warnings: [
      ...mutation.warnings,
      ...placementFailureWarningsFor(mutation.placementFailures ?? []),
    ],
    diagnostics: mutation.diagnostics,
  });
  await operations.create({
    data: {
      operationId: request.operationId,
      eventId: request.eventId,
      actorUserId: actor.userId,
      operation: request.operation,
      requestHash,
      requestJson: jsonSafe(request),
      proposalRevision: proposal.proposalRevision,
      revisionBindingJson: jsonSafe(revisionBinding),
      proposalJson: jsonSafe(proposal),
      status: "PROPOSED",
    },
  });
  return proposal;
};

const loadProposalOperation = async (
  tx: MaintenanceClient,
  actor: { userId: string; isAdmin: boolean },
  reference: EventEditorAcceptMaintenanceProposal | EventEditorRejectMaintenanceProposal,
  allowRejected = false,
): Promise<{ row: MaintenanceOperationRow; proposal: EventEditorMaintenanceProposal }> => {
  const row = await operationsFor(tx).findUnique({
    where: { operationId: reference.operationId },
  });
  if (!row || row.eventId !== reference.eventId || row.operation !== reference.operation) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_NOT_FOUND",
      "Maintenance proposal not found.",
    );
  }
  if (row.actorUserId !== actor.userId && !actor.isAdmin) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_UNAUTHORIZED",
      "You are not authorized to use this maintenance proposal.",
    );
  }
  if (row.status === "REJECTED" && !allowRejected) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_REJECTED",
      "The maintenance proposal has been rejected.",
    );
  }
  const proposal = eventEditorMaintenanceProposalSchema.parse(row.proposalJson);
  if (proposal.proposalRevision !== reference.proposalRevision) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_STALE",
      "The maintenance proposal revision is stale.",
    );
  }
  return { row, proposal };
};

type MaintenanceGraphMatch = EventEditorMaintenanceProposal["graph"]["matches"][number];

const maintenanceRelationFor = (
  id: string | null,
): { id: string } | null => (id ? { id } : null);

const maintenanceDateFor = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const maintenanceScheduledRosterFor = (
  eventId: string,
  event: EventEditorMaintenanceProposal["graph"]["event"],
): ScheduledRosterInput => {
  const teams: Record<string, ScheduledRosterTeamInput> = Object.fromEntries(
    event.teams.map((team) => [
      team.id,
      {
        id: team.id,
        captainId: team.captainId,
        playerIds: team.playerIds,
        division: team.division ? { id: team.division } : null,
        name: team.name,
      },
    ]),
  );
  return {
    id: eventId,
    hostId: event.hostId,
    eventType: event.eventType,
    includePlayoffs: event.includePlayoffs,
    includePlayoffsOrPools: event.includePlayoffs,
    singleDivision: event.singleDivision,
    teamSizeLimit: event.teamSizeLimit,
    divisions: event.divisionDetails,
    playoffDivisions: event.playoffDivisionDetails,
    teams,
  };
};
const persistMaintenanceDivisionTeamAssignments = async (
  tx: MaintenanceClient,
  eventId: string,
  event: EventEditorMaintenanceProposal["graph"]["event"],
): Promise<void> => {
  const divisionRows = Array.from(
    new Map(
      [...event.divisionDetails, ...event.playoffDivisionDetails]
        .map((division) => [division.id, division] as const),
    ).values(),
  );
  if (!divisionRows.length) return;
  const divisions = (tx as unknown as Record<string, unknown>).divisions as {
    update?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof divisions?.update !== "function") {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "Division team assignments could not be persisted.",
    );
  }
  const now = new Date();
  await Promise.all(
    divisionRows.map((division) =>
      divisions.update!({
        where: { id: division.id },
        data: {
          teamIds: [...division.teamIds],
          updatedAt: now,
        },
      }),
    ),
  );
  const phaseTeamIdsByDivision = Object.fromEntries(
    collectPhaseDivisions({
      divisions: event.divisionDetails,
      playoffDivisions: event.playoffDivisionDetails,
    }).map((division) => [
      division.id,
      Array.from(division.teamIds ?? []),
    ]),
  );
  await persistPhaseParticipantAssignments({
    client: tx as unknown as PhasePersistenceClient,
    eventId,
    teamIdsByPhaseDivision: phaseTeamIdsByDivision,
  });
};


const assertMaintenanceGraphReferences = (
  graph: EventEditorMaintenanceProposal["graph"],
): void => {
  const divisionIds = new Set([
    ...graph.event.divisions,
    ...graph.event.divisionDetails.flatMap((division) => [
      division.id,
      ...(division.sourceDivisionId ? [division.sourceDivisionId] : []),
    ]),
    ...graph.event.playoffDivisionDetails.flatMap((division) => [
      division.id,
      ...(division.sourceDivisionId ? [division.sourceDivisionId] : []),
    ]),
  ]);
  const fieldIds = new Set(
    Array.isArray(graph.event.fields)
      ? graph.event.fields.map((field) => field.id)
      : [],
  );
  const teamIds = new Set(graph.event.teams.map((team) => team.id));
  for (const team of graph.event.teams) {
    if (team.division && !divisionIds.has(team.division)) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        `Team ${team.id} references unknown Division ${team.division}.`,
      );
    }
  }
  for (const match of graph.matches) {
    const divisionIdsForMatch = [
      match.division,
      match.sourceDivisionId,
      match.phaseDivisionId,
    ].filter((id): id is string => Boolean(id));
    const unknownDivision = divisionIdsForMatch.find((id) => !divisionIds.has(id));
    if (unknownDivision) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        `Match ${match.id} references unknown Division ${unknownDivision}.`,
      );
    }
    if (fieldIds.size > 0 && match.fieldId && !fieldIds.has(match.fieldId)) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        `Match ${match.id} references unknown Field ${match.fieldId}.`,
      );
    }
    const teamIdsForMatch = [
      match.team1Id,
      match.team2Id,
      match.teamOfficialId,
      match.winnerEventTeamId,
    ].filter((id): id is string => Boolean(id));
    const unknownTeam = teamIdsForMatch.find((id) => !teamIds.has(id));
    if (unknownTeam) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_INVALID",
        `Match ${match.id} references unknown team ${unknownTeam}.`,
      );
    }
  }
};

type MaintenanceGraphDivision =
  EventEditorMaintenanceProposal["graph"]["event"]["divisionDetails"][number];

const maintenanceMatchPersistenceFor = (
  eventId: string,
  match: MaintenanceGraphMatch,
  index: number,
  divisionById: ReadonlyMap<string, MaintenanceGraphDivision>,
): MatchPersistenceInput => {
  const divisionId = match.phaseDivisionId ?? match.division ?? match.sourceDivisionId;
  if (!divisionId) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      `Match ${match.id} has no Competition Phase or Division identity.`,
    );
  }
  const sourceDivision = match.sourceDivisionId
    ? divisionById.get(match.sourceDivisionId)
    : undefined;
  const division = divisionById.get(divisionId);
  if (!division && !sourceDivision) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      `Match ${match.id} references unknown Division ${divisionId}.`,
    );
  }
  const source = division ?? sourceDivision;
  if (!source) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      `Match ${match.id} has no source Division.`,
    );
  }
  return {
    id: match.id,
    eventId,
    matchId: match.matchId ?? index + 1,
    locked: match.locked,
    placementState: match.placementState,
    team1Seed: match.team1Seed,
    team2Seed: match.team2Seed,
    team1Points: match.team1Points,
    team2Points: match.team2Points,
    start: maintenanceDateFor(match.start),
    end: maintenanceDateFor(match.end),
    division: {
      id: division?.id ?? divisionId,
      kind: division?.kind ?? source.kind,
      role: division?.role ?? (match.phaseDivisionId ? "PHASE" : null),
      phase: division?.phase ?? match.phase ?? source.phase,
      sourceDivisionId: division?.sourceDivisionId ?? match.sourceDivisionId ?? null,
      phaseSettings: Object.fromEntries(
        Object.entries(source.phaseSettings).map(([phase, settings]) => [
          phase,
          { officialPositions: settings.officialPositions },
        ]),
      ),
    },
    field: maintenanceRelationFor(match.fieldId),
    team1: maintenanceRelationFor(match.team1Id),
    team2: maintenanceRelationFor(match.team2Id),
    official: maintenanceRelationFor(match.official?.id ?? null),
    teamOfficial: maintenanceRelationFor(match.teamOfficialId),
    officialCheckedIn: match.officialCheckedIn,
    officialAssignments: match.officialAssignments,
    winnerEventTeamId: match.winnerEventTeamId,
    matchRulesSnapshot: match.matchRulesSnapshot,
    resolvedMatchRules: match.resolvedMatchRules,
    status: match.status,
    resultStatus: match.resultStatus,
    resultType: match.resultType,
    actualStart: maintenanceDateFor(match.actualStart),
    actualEnd: maintenanceDateFor(match.actualEnd),
    statusReason: match.statusReason,
    segments: match.segments,
    incidents: match.incidents,
    side: match.side,
    losersBracket: match.losersBracket,
    winnerNextMatch: maintenanceRelationFor(match.winnerNextMatchId),
    loserNextMatch: maintenanceRelationFor(match.loserNextMatchId),
    previousLeftMatch: maintenanceRelationFor(match.previousLeftId),
    previousRightMatch: maintenanceRelationFor(match.previousRightId),
  };
};

const assertProtectedMatchesRetained = (
  proposal: EventEditorMaintenanceProposal,
  graph: EventEditorMaintenanceProposal["graph"],
): void => {
  const graphMatchIds = new Set(graph.matches.map((match) => match.id));
  const missing = proposal.protectedMatchIds
    .filter((matchId) => !graphMatchIds.has(matchId))
    .sort();
  if (missing.length) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      `The reviewed graph omitted protected Match ${missing[0]}.`,
    );
  }
};

const persistMaintenanceProtectedGraphLinks = async (
  tx: MaintenanceClient,
  proposal: EventEditorMaintenanceProposal,
  graph: EventEditorMaintenanceProposal["graph"],
  currentMatches: Match[],
): Promise<void> => {
  if (proposal.operation !== "REBUILD") return;
  const update = (tx as unknown as Record<string, unknown>).matches as {
    update?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof update?.update !== "function") return;
  const currentById = new Map(currentMatches.map((match) => [match.id, match]));
  const graphById = new Map(graph.matches.map((match) => [match.id, match]));
  for (const matchId of [...proposal.protectedMatchIds].sort()) {
    const current = currentById.get(matchId);
    const reviewed = graphById.get(matchId);
    if (!current || !reviewed) continue;
    const links = {
      winnerNextMatchId: reviewed.winnerNextMatchId,
      loserNextMatchId: reviewed.loserNextMatchId,
      previousLeftId: reviewed.previousLeftId,
      previousRightId: reviewed.previousRightId,
    };
    const currentLinks = {
      winnerNextMatchId: current.winnerNextMatch?.id ?? null,
      loserNextMatchId: current.loserNextMatch?.id ?? null,
      previousLeftId: current.previousLeftMatch?.id ?? null,
      previousRightId: current.previousRightMatch?.id ?? null,
    };
    if (equalJson(currentLinks, links)) continue;
    await update.update({
      where: { id: matchId },
      data: { ...links, updatedAt: new Date() },
    });
  }
};

const persistMaintenanceScheduleGraph = async (params: {
  tx: MaintenanceClient;
  eventId: string;
  proposal: EventEditorMaintenanceProposal;
  graph: EventEditorMaintenanceProposal["graph"];
  currentMatches: Match[];
}): Promise<void> => {
  const end = maintenanceDateFor(params.graph.event.end);
  if (!end) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      "The reviewed graph has an invalid Event end.",
    );
  }
  assertProtectedMatchesRetained(params.proposal, params.graph);
  assertMaintenanceGraphReferences(params.graph);
  const protectedIds = new Set(params.proposal.protectedMatchIds);
  const divisionRows: MaintenanceGraphDivision[] = [
    ...params.graph.event.divisionDetails,
    ...params.graph.event.playoffDivisionDetails,
  ];
  const divisionById = new Map(
    divisionRows.map((division) => [division.id, division] as const),
  );
  const mutableMatches = params.graph.matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => !protectedIds.has(match.id))
    .map(({ match, index }) =>
      maintenanceMatchPersistenceFor(
        params.eventId,
        match,
        index,
        divisionById,
      ),
    );
  await persistScheduledRosterTeams(
    {
      eventId: params.eventId,
      scheduled: maintenanceScheduledRosterFor(
        params.eventId,
        params.graph.event,
      ),
    },
    params.tx,
  );
  await persistMaintenanceDivisionTeamAssignments(
    params.tx,
    params.eventId,
    params.graph.event,
  );
  if (mutableMatches.length) {
    await saveMatches(params.eventId, mutableMatches, params.tx);
  }
  await persistMaintenanceProtectedGraphLinks(
    params.tx,
    params.proposal,
    params.graph,
    params.currentMatches,
  );
  await saveEventSchedule({
    id: params.eventId,
    end,
    generatedScheduleEnd: maintenanceDateFor(params.graph.event.generatedScheduleEnd),
    noFixedEndDateTime: params.graph.event.noFixedEndDateTime,
    scheduleEndConstraint: maintenanceDateFor(params.graph.event.scheduleEndConstraint),
  }, params.tx);
};

const deleteRebuildReplacedMatches = async (
  tx: MaintenanceClient,
  eventId: string,
  proposal: EventEditorMaintenanceProposal,
  currentMatches: Match[],
): Promise<void> => {
  if (proposal.operation !== "REBUILD") return;
  const retainedIds = new Set(proposal.graph.matches.map((match) => match.id));
  const protectedIds = new Set(proposal.protectedMatchIds);
  const removedIds = currentMatches
    .map((match) => match.id)
    .filter((id) => !retainedIds.has(id) && !protectedIds.has(id))
    .sort();
  if (!removedIds.length) return;
  const client = tx as unknown as Record<string, unknown>;
  const overlayStates = client.broadcastOverlayStates as {
    updateMany?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof overlayStates?.updateMany === "function") {
    await overlayStates.updateMany({
      where: { eventId, activeMatchId: { in: removedIds } },
      data: {
        activeMatchId: null,
        revision: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }
  for (const model of ["matchSegments", "matchIncidents"]) {
    const delegate = client[model] as {
      deleteMany?: (args: unknown) => Promise<unknown>;
    } | undefined;
    if (typeof delegate?.deleteMany === "function") {
      await delegate.deleteMany({ where: { matchId: { in: removedIds } } });
    }
  }
  const matches = client.matches as {
    deleteMany?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof matches?.deleteMany === "function") {
    await matches.deleteMany({ where: { eventId, id: { in: removedIds } } });
  }
};

export const acceptMaintenanceProposal = async (params: {
  tx: MaintenanceClient;
  actor: { userId: string; isAdmin: boolean };
  request: EventEditorAcceptMaintenanceProposal;
}): Promise<{
  response: EventEditorMaintenanceResponse;
  notification: MatchScheduleNotificationPlan | null;
}> => {
  const { tx, actor, request } = params;
  await acquireEventLock(tx, request.eventId);
  const { row, proposal } = await loadProposalOperation(tx, actor, request);
  if (row.status === "ACCEPTED" && row.acceptedResponseJson) {
    await assertActor(actor, request.eventId, tx);
    if (row.acceptanceOperationId !== request.acceptanceOperationId) {
      throw new MaintenanceOperationError(
        "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT",
        "The proposal was already accepted by another acceptance operation.",
      );
    }
    return {
      response: eventEditorMaintenanceAcceptedResultSchema.parse(row.acceptedResponseJson),
      notification: null,
    };
  }
  const eventUnderEventLock = await assertActor(
    actor,
    request.eventId,
    tx,
  );
  const locked = await lockMaintenanceResourcesAndReload(
    tx,
    actor,
    request.eventId,
    eventUnderEventLock,
  );
  const {
    event,
    persistedEvent,
    automatedScheduling: lockedAutomatedScheduling,
  } = locked;
  const state = await loadEventScheduleState(
    persistedEvent,
    request.eventId,
    tx,
  );
  const currentBinding = await loadMaintenanceRevisionBinding(
    event,
    state.revision,
    actor,
    tx,
    {
      includeCheckIns: true,
      automatedScheduling: lockedAutomatedScheduling,
      computeRevision: computeEventEditorRevision,
      loadEditorSnapshot: loadExistingEventEditorSnapshot as unknown as (
        eventId: string,
        snapshotActor: { userId: string; isAdmin: boolean },
        snapshotClient: MaintenanceClient,
      ) => Promise<{ editorRevision: string; staffRevision: string | null }>,
    },
  );
  if (!equalJson(currentBinding, proposal.revisionBinding)) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_STALE",
      "The Event schedule or scheduling inputs changed. Request a new proposal.",
    );
  }
  if (maintenanceCapabilityDrifted(
    proposal,
    event,
    lockedAutomatedScheduling,
  )) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_STALE",
      "The Event scheduling capability changed. Request a new proposal.",
    );
  }
  assertMaintenanceCapability(event, request.operation, lockedAutomatedScheduling);
  let graph;
  try {
    graph = validateAndNormalizeSerializedGraph(request.eventId, proposal.graph);
  } catch (error) {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_INVALID",
      error instanceof Error ? error.message : "The stored proposal graph is invalid.",
    );
  }
  const beforeMatches = Object.values(event.matches);
  assertProtectedMatchesRetained(proposal, graph);
  assertMaintenanceGraphReferences(graph);
  await deleteRebuildReplacedMatches(tx, request.eventId, proposal, beforeMatches);
  await persistMaintenanceScheduleGraph({
    tx,
    eventId: request.eventId,
    proposal,
    graph,
    currentMatches: beforeMatches,
  });
  const acceptedResponse = eventEditorMaintenanceAcceptedResultSchema.parse({
    ...proposal,
    status: "ACCEPTED",
    acceptanceOperationId: request.acceptanceOperationId,
  });
  await operationsFor(tx).update({
    where: { operationId: request.operationId },
    data: {
      status: "ACCEPTED",
      acceptanceOperationId: request.acceptanceOperationId,
      acceptedResponseJson: jsonSafe(acceptedResponse),
    },
  });
  return {
    response: acceptedResponse,
    notification: beforeMatches.length
      ? {
          eventId: request.eventId,
          eventName: String(event.name ?? "Event"),
          forceBatch: true,
          changes: collectMatchScheduleChanges({
            before: snapshotMatchScheduleState(beforeMatches),
            after: snapshotMatchScheduleState(
              proposal.graph.matches as unknown as Match[],
            ),
          }),
        }
      : null,
  };
};

export const rejectMaintenanceProposal = async (params: {
  tx: MaintenanceClient;
  actor: { userId: string; isAdmin: boolean };
  request: EventEditorRejectMaintenanceProposal;
}): Promise<EventEditorMaintenanceResponse> => {
  const { tx, actor, request } = params;
  await acquireEventLock(tx, request.eventId);
  const { row, proposal } = await loadProposalOperation(tx, actor, request, true);
  await assertActor(actor, request.eventId, tx);
  if (row.status === "REJECTED") {
    return eventEditorMaintenanceRejectedResultSchema.parse({
      status: "REJECTED",
      contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
      eventId: request.eventId,
      operation: request.operation,
      operationId: request.operationId,
      proposalRevision: proposal.proposalRevision,
    });
  }
  if (row.status === "ACCEPTED") {
    throw new MaintenanceOperationError(
      "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT",
      "An accepted proposal cannot be rejected.",
    );
  }
  const rejected = eventEditorMaintenanceRejectedResultSchema.parse({
    status: "REJECTED",
    contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
    eventId: request.eventId,
    operation: request.operation,
    operationId: request.operationId,
    proposalRevision: proposal.proposalRevision,
  });
  await operationsFor(tx).update({
    where: { operationId: request.operationId },
    data: { status: "REJECTED" },
  });
  return rejected;
};
