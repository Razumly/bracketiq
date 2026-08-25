import type { Prisma } from "@/generated/prisma/client";
import type {
  Fields,
  RentalBookingItems,
  RentalBookings,
  TimeSlots,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import {
  EventDivisionNameValidationError,
  isBracketTeamCountEnabled,
  MIN_BRACKET_TEAM_COUNT,
} from "@/lib/divisionTypes";
import {
  acquireEventLock,
  acquireEventTemplateLocks,
  acquireFieldLocks,
  acquireRentalBookingLocks,
  acquireTimeSlotLocks,
} from "@/server/repositories/locks";
import { upsertEventFromPayload } from "@/server/repositories/events";
import { hasOrgPermission, canManageEvent } from "@/server/accessControl";
import { ORG_PERMISSIONS } from "@/lib/organizationPermissions";
import { assertEventTypeRegistrationUnit } from "./eventRegistrations";
import {
  collectOrganizationHostIds,
  normalizeEntityId,
} from "@/lib/organizationEventAccess";

import {
  EVENT_STAFF_CONTRACT_VERSION,
  EventStaffInputError,
  reconcileEventStaffDesiredState,
  type EventStaffPutInput,
} from "./eventStaffReconciliation";
import { isGeneratedTournamentPoolRecord } from "./tournamentPools";
import {
  buildEventEditorSnapshot,
  computeEventEditorRevision,
  loadCreateEventEditorSnapshot,
  loadEventEditorSnapshot,
  type EditorActor,
  type EditorSnapshotClient,
} from "./eventEditorSnapshot";
import {
  assertEventHostTransition,
  EventHostDelegationError,
} from "./eventHostDelegation";
import { editorDraftToLegacyEvent } from "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters";
import {
  claimEventEditorCreateOperation,
  completeEventEditorCreateOperation,
  completeEventEditorCreateProposal,
  deleteEventEditorCreateOperation,
  eventEditorCreateRequestHash,
  eventEditorProposalRevision,
  readEventEditorCreateProposal,
  readEventEditorCreateProposalForActor,
  waitForEventEditorCreateOperation,
  waitForEventEditorCreateProposal,
  type EventCreateOperationClaim,
} from "./eventCreateOperationReplay";
import { resolveMatchTimingPolicy } from "@/server/scheduler/matchTimingPolicy";
import { normalizeAutomatedSchedulingForEventType } from "@/lib/automatedScheduling";
import {
  editorMatchProjectionsFor,
  EventScheduleMutationError,
  EventScheduleProposalGraphError,
  EventScheduleRevisionConflictError,
  persistCreateOnlyMatchGraph,
  persistSerializedScheduleGraph,
  reconcileEventSchedule,
  validateAndNormalizeSerializedGraph,
} from "@/server/scheduler/eventScheduleMutation";
import {
  loadFieldBlockerCatalog,
  type FieldBlockerCatalog,
  type FieldBlockerInterval,
  type FieldBlockerRecurrence,
  type FieldSchedulingConflictSource,
  type PrismaLike as FieldBlockerPrismaLike,
} from "@/server/repositories/fieldSchedulingConflicts";
import { serializeEvent, serializeMatches } from "@/server/scheduler/serialize";
import {
  type CreateEventEditorCommand,
  type EventEditorBootstrapQuery,
  type EventEditorCreateProposal,
  type EventEditorCreateResult,
  type EventEditorDraft,
  type EventEditorRevisionBinding,
  type EventEditorSaveResult,
  type EventEditorScheduleOutcome,
  type EventEditorSnapshot,
  type SaveEventEditorCommand,
} from "@/contracts/eventEditor";

import {
  snapshotMatchScheduleState,
  type MatchScheduleNotificationPlan,
} from "@/server/matchScheduleNotifications";
export class EditorPermissionError extends Error {
  constructor(message = "You do not have permission to edit this event.") {
    super(message);
    this.name = "EditorPermissionError";
  }
}

export class EditorRevisionConflictError extends Error {
  readonly currentEditorRevision: string;
  readonly currentStaffRevision: string | null;
  readonly currentScheduleRevision: string | null;

  constructor(
    editorRevision: string,
    staffRevision: string | null,
    scheduleRevision: string | null = null,
  ) {
    super("Event editor data changed. Reload and try again.");
    this.name = "EditorRevisionConflictError";
    this.currentEditorRevision = editorRevision;
    this.currentStaffRevision = staffRevision;
    this.currentScheduleRevision = scheduleRevision;
  }
}

export class EditorImmutableFieldError extends Error {
  readonly fieldName: string;

  constructor(fieldName: string) {
    super(`Immutable field ${fieldName} cannot be updated.`);
    this.name = "EditorImmutableFieldError";
    this.fieldName = fieldName;
  }
}

export class EditorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorInputError";
  }
}
const assertMinimumBracketTeamCounts = (draft: EventEditorDraft): void => {
  const eventType = draft.basics.eventType.trim().toUpperCase();
  const participationCount = draft.participation?.maxParticipants;
  if (
    eventType === "TOURNAMENT" &&
    (typeof participationCount !== "number" ||
      participationCount < MIN_BRACKET_TEAM_COUNT)
  ) {
    throw new EditorInputError(
      `Tournament team count must be at least ${MIN_BRACKET_TEAM_COUNT}.`,
    );
  }

  const isBracketCountValidationEnabled = isBracketTeamCountEnabled(
    eventType,
    draft.competition.includePlayoffs,
  );
  const eventPlayoffCount = draft.competition.playoffTeamCount;
  if (
    isBracketCountValidationEnabled &&
    typeof eventPlayoffCount === "number" &&
    eventPlayoffCount < MIN_BRACKET_TEAM_COUNT
  ) {
    throw new EditorInputError(
      `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} when playoffs are enabled.`,
    );
  }

  for (const detail of [
    ...draft.competition.divisionDetails,
    ...draft.competition.playoffDivisionDetails,
  ]) {
    const isGeneratedTournamentPool = isGeneratedTournamentPoolRecord({
      eventType,
      isPoolPlayEnabled: isBracketCountValidationEnabled,
      kind: detail.kind,
      isSystemGenerated: detail.isSystemGenerated,
      poolCount: detail.poolCount,
      playoffPlacementDivisionIds: detail.playoffPlacementDivisionIds,
    });
    if (isGeneratedTournamentPool) continue;
    const divisionLabel = detail.name?.trim() || detail.id;
    if (
      eventType === "TOURNAMENT" &&
      typeof detail.maxParticipants === "number" &&
      detail.maxParticipants < MIN_BRACKET_TEAM_COUNT
    ) {
      throw new EditorInputError(
        `Tournament team count must be at least ${MIN_BRACKET_TEAM_COUNT} for division "${divisionLabel}".`,
      );
    }
    if (
      isBracketCountValidationEnabled &&
      typeof detail.playoffTeamCount === "number" &&
      detail.playoffTeamCount < MIN_BRACKET_TEAM_COUNT
    ) {
      throw new EditorInputError(
        `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} for division "${divisionLabel}" when playoffs are enabled.`,
      );
    }
  }
};



export class EditorScheduleIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorScheduleIntentError";
  }
}

export class EditorCapabilityError extends Error {

  constructor(message: string) {
    super(message);
    this.name = "EditorCapabilityError";
  }
}
class EventEditorCreateProposalRollback extends Error {
  readonly proposal: EventEditorCreateProposal;

  constructor(proposal: EventEditorCreateProposal) {
    super("The schedule proposal transaction must roll back.");
    this.name = "EventEditorCreateProposalRollback";
    this.proposal = proposal;
  }
}
export class EventEditorProposalInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventEditorProposalInvalidError";
  }
}

export class EventEditorProposalStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventEditorProposalStaleError";
  }
}

export type EditorSaveOptions = {
  client?: EditorSnapshotClient;
  sendStaffInvites?: (
    candidates: unknown[],
    eventId: string,
  ) => Promise<"NOT_REQUESTED" | "QUEUED" | "FAILED">;
  onEventCreated?: (eventId: string, draft: EventEditorDraft) => Promise<void>;
  onScheduleChanged?: (
    notification: MatchScheduleNotificationPlan,
  ) => Promise<void>;
};
type CreateEventEditorOptions = EditorSaveOptions & {
  shouldReturnScheduleProposal?: boolean;
  preclaimedOperation?: EventCreateOperationClaim;
};


type QuestionRow = {
  id: string;
};

const staffInputFor = (
  draft: EventEditorDraft,
  revision: string,
): EventStaffPutInput => ({
  contractVersion: EVENT_STAFF_CONTRACT_VERSION,
  expectedRevision: revision,
  assistantHostIds: draft.staff.assistantHostIds,
  officialPositions: draft.staff.officialPositions.map((position) => ({
    id: position.id,
    name: position.name,
    count: position.count,
    order: position.order,
  })),
  eventOfficials: draft.staff.eventOfficials
    .filter((entry) => typeof entry.userId === "string" && entry.userId.trim())
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : undefined,
      userId: String(entry.userId),
      positionIds: Array.isArray(entry.positionIds)
        ? entry.positionIds.filter((id): id is string => typeof id === "string")
        : [],
      fieldIds: Array.isArray(entry.fieldIds)
        ? entry.fieldIds.filter((id): id is string => typeof id === "string")
        : [],
      isActive: entry.isActive !== false,
    })),
  pendingInvites: draft.staff.pendingInvites
    .filter(
      (entry) =>
        typeof entry.email === "string" &&
        typeof entry.firstName === "string" &&
        typeof entry.lastName === "string",
    )
    .map((entry) => ({
      email: String(entry.email),
      firstName: String(entry.firstName),
      lastName: String(entry.lastName),
      roles: Array.isArray(entry.roles)
        ? entry.roles.filter(
            (role): role is "OFFICIAL" | "ASSISTANT_HOST" =>
              role === "OFFICIAL" || role === "ASSISTANT_HOST",
          )
        : ["OFFICIAL"],
      resolvedUserId:
        typeof entry.resolvedUserId === "string"
          ? entry.resolvedUserId
          : undefined,
    })),
});

const scheduleNotificationForAcceptedProposal = (
  graph: EventEditorCreateProposal["graph"] | null | undefined,
): MatchScheduleNotificationPlan | null => {
  if (!graph) {
    return null;
  }
  const changes = Array.from(snapshotMatchScheduleState(graph.matches).values())
    .filter((match) => match.teamIds.length > 0)
    .map((match) => ({
      matchId: match.id,
      matchNumber: match.matchNumber,
      teamIds: match.teamIds,
      teamNames: match.teamNames,
      scheduleChanged: Boolean(match.start || match.end || match.fieldId),
      teamAdded: true,
      deleted: false,
    }));
  if (!changes.length) {
    return null;
  }
  return {
    eventId: graph.event.id,
    eventName: graph.event.name,
    forceBatch: true,
    changes,
  };
};

const reconcileQuestions = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  draft: EventEditorDraft,
  actorUserId: string,
): Promise<Record<string, string>> => {
  const existingRows = await tx.registrationQuestions.findMany({
    where: { scopeType: "EVENT", scopeId: eventId },
    select: { id: true },
  });
  const existingIds = new Set(existingRows.map((row: QuestionRow) => row.id));
  const activeIds = new Set<string>();
  const questionIdMap: Record<string, string> = {};
  const now = new Date();
  for (const [index, question] of draft.registration.questions.entries()) {
    const canonicalId = "id" in question ? question.id : null;
    const clientId = "clientId" in question ? question.clientId : null;
    if (canonicalId && !existingIds.has(canonicalId)) {
      throw new EditorInputError(
        `Registration question ${canonicalId} does not belong to this event.`,
      );
    }
    const id = canonicalId ?? createId();
    const data = {
      prompt: question.prompt,
      answerType: question.answerType,
      required: question.required,
      sortOrder: question.sortOrder ?? index,
      isActive: true,
      updatedBy: actorUserId,
      updatedAt: now,
    };
    if (canonicalId) {
      await tx.registrationQuestions.update({ where: { id }, data });
    } else {
      await tx.registrationQuestions.create({
        data: {
          id,
          scopeType: "EVENT",
          scopeId: eventId,
          ...data,
          createdBy: actorUserId,
          createdAt: now,
        },
      });
    }
    activeIds.add(id);
    if (clientId) questionIdMap[clientId] = id;
  }

  const inactiveIds = existingRows
    .map((row: QuestionRow) => row.id)
    .filter((id: string) => !activeIds.has(id));
  if (inactiveIds.length) {
    await tx.registrationQuestions.updateMany({
      where: { id: { in: inactiveIds } },
      data: { isActive: false, updatedBy: actorUserId, updatedAt: now },
    });
  }
  return questionIdMap;
};

const assertPaymentCapability = async (
  draft: EventEditorDraft,
  snapshot: { capabilities: { canUseOnlinePayments: boolean } },
) => {
  if (
    draft.registration.payment.mode === "ONLINE" &&
    draft.registration.payment.priceCents > 0 &&
    !snapshot.capabilities.canUseOnlinePayments
  ) {
    throw new EditorCapabilityError(
      "Online paid registration requires a connected payment account.",
    );
  }
};

const assertImmutableFields = (
  draft: EventEditorDraft,
  eventId: string,
  snapshot: EventEditorSnapshot,
) => {
  const protectedFields = new Set(snapshot.immutable.fieldNames);
  if (snapshot.immutable.rental) {
    [
      "start",
      "end",
      "timeZone",
      "location",
      "address",
      "coordinates",
      "fields",
      "fieldIds",
      "timeSlots",
      "timeSlotIds",
      "requiredTemplateIds",
      "rentalBookingId",
      "rentalBookingItemId",
    ].forEach((fieldName) => protectedFields.add(fieldName));
  }
  if (snapshot.immutable.template) {
    protectedFields.add("requiredTemplateIds");
  }
  if (!protectedFields.size) return;
  const current = editorDraftToLegacyEvent(snapshot.draft, eventId);
  const next = editorDraftToLegacyEvent(draft, eventId);
  for (const fieldName of protectedFields) {
    if (
      JSON.stringify(current[fieldName]) !== JSON.stringify(next[fieldName])
    ) {
      throw new EditorImmutableFieldError(fieldName);
    }
  }
};

const saveWithinTransaction = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  draft: EventEditorDraft,
  eventId: string,
  existingSnapshot: EventEditorSnapshot | null,
  resolvedHostId?: string,
): Promise<{
  questionIdMap: Record<string, string>;
  emailCandidates: unknown[];
}> => {
  assertMinimumBracketTeamCounts(draft);
  if (existingSnapshot) {
    await assertPaymentCapability(draft, existingSnapshot);
  }
  const eventPayload = editorDraftToLegacyEvent(draft, eventId);
  const matchRulesOverride = draft.competition.matchRulesOverride ?? {};
  const timing = resolveMatchTimingPolicy({
    usesSets: draft.competition.usesSets,
    segmentCount:
      typeof matchRulesOverride.segmentCount === "number"
        ? matchRulesOverride.segmentCount
        : null,
    segmentLengthMinutes:
      typeof matchRulesOverride.segmentLengthMinutes === "number"
        ? matchRulesOverride.segmentLengthMinutes
        : null,
    segmentBreakMinutes:
      typeof matchRulesOverride.segmentBreakMinutes === "number"
        ? matchRulesOverride.segmentBreakMinutes
        : null,
    setsPerMatch: draft.competition.setsPerMatch,
    setDurationMinutes: draft.competition.setDurationMinutes,
    matchDurationMinutes: draft.competition.matchDurationMinutes,
    restTimeMinutes: draft.competition.restTimeMinutes,
  });
  if (
    typeof draft.competition.matchDurationMinutes === "number" &&
    draft.competition.matchDurationMinutes !== timing.durationMinutes
  ) {
    throw new EditorInputError(
      "matchDurationMinutes is a server-calculated projection of the timing inputs.",
    );
  }
  if (
    existingSnapshot?.mode === "CREATE" &&
    ["LEAGUE", "TOURNAMENT"].includes(
      draft.basics.eventType.trim().toUpperCase(),
    )
  ) {
    eventPayload.state = "UNPUBLISHED";
  }
  eventPayload.matchDurationMinutes = timing.durationMinutes;
  delete eventPayload.fields;
  delete eventPayload.timeSlots;
  delete eventPayload.assistantHostIds;
  delete eventPayload.eventOfficials;
  delete eventPayload.officialIds;
  delete eventPayload.officialPositions;
  delete eventPayload.pendingStaffInvites;
  delete eventPayload.staffInvites;
  delete eventPayload.divisionDetails;
  delete eventPayload.immutableFieldIds;
  delete eventPayload.rentalBookingId;
  delete eventPayload.rentalBookingItemId;
  eventPayload.hostId = resolvedHostId ?? draft.basics.hostId ?? actor.userId;
  eventPayload.registrationPaymentMode =
    draft.registration.payment.mode === "MANUAL" ? "MANUAL" : "ONLINE";
  eventPayload.price = draft.registration.payment.priceCents;
  await acquireFieldLocks(tx, draft.resources.fieldIds);
  await acquireTimeSlotLocks(tx, draft.resources.timeSlotIds);
  const rentalResourceIds = rentalResourceIdsForDraft(draft);
  await acquireRentalBookingLocks(
    tx,
    rentalResourceIds.bookingIds,
    rentalResourceIds.bookingItemIds,
  );
  try {
    await upsertEventFromPayload(
      {
        ...eventPayload,
        id: eventId,
        fieldIds: draft.resources.fieldIds,
        timeSlotIds: draft.resources.timeSlotIds,
        fields: draft.resources.fields,
        timeSlots: draft.resources.timeSlots,
        divisionDetails: draft.competition.divisionDetails,
        playoffDivisionDetails: draft.competition.playoffDivisionDetails,
        divisionFieldIds: draft.competition.divisionFieldIds,
        tags: draft.basics.tags,
      },
      tx,
      { preserveOperationalState: true, preserveStaffState: true },
    );
  } catch (error) {
    if (error instanceof EventDivisionNameValidationError) {
      throw new EditorInputError(error.message);
    }
    throw error;
  }

  const questionIdMap = await reconcileQuestions(
    tx,
    eventId,
    draft,
    actor.userId,
  );
  const staffRevision =
    existingSnapshot?.staffRevision ??
    (await loadEventEditorSnapshot(eventId, { actor, client: tx }))
      .staffRevision;
  let staffResult;
  try {
    const staffDraft =
      resolvedHostId && draft.basics.hostId !== resolvedHostId
        ? {
            ...draft,
            basics: { ...draft.basics, hostId: resolvedHostId },
          }
        : draft;
    staffResult = await reconcileEventStaffDesiredState(
      tx,
      eventId,
      staffInputFor(staffDraft, staffRevision ?? ""),
      actor.userId,
    );
  } catch (error) {
    if (error instanceof EventStaffInputError) {
      throw new EditorInputError(error.message);
    }
    throw error;
  }
  return { questionIdMap, emailCandidates: staffResult.emailCandidates };
};

export const saveEventEditor = async (
  actor: EditorActor,
  command: SaveEventEditorCommand,
  eventId: string,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> => {
  const client = options.client ?? prisma;
  let emailCandidates: unknown[] = [];
  let questionIdMap: Record<string, string> = {};
  let savedSnapshot: EventEditorSnapshot | null = null;
  let scheduleOutcome: EventEditorScheduleOutcome = {
    status: "NOT_REQUESTED",
    matchCount: 0,
    warnings: [],
  };
  let scheduleNotification: MatchScheduleNotificationPlan | null = null;
  await client.$transaction(async (tx: Prisma.TransactionClient) => {
    await acquireEventLock(tx, eventId);
    const currentEvent = await tx.events.findUnique({ where: { id: eventId } });
    if (!currentEvent) {
      throw new Error("Event not found.");
    }
    if (
      !(await canManageEvent(
        { ...actor, isAdmin: Boolean(actor.isAdmin) },
        currentEvent,
        tx,
      ))
    ) {
      throw new EditorPermissionError();
    }
    const currentHostId =
      typeof currentEvent.hostId === "string"
        ? currentEvent.hostId.trim() || null
        : null;
    const nextHostId =
      typeof command.draft.basics.hostId === "string"
        ? command.draft.basics.hostId.trim() || null
        : null;
    if (currentHostId !== nextHostId) {
      try {
        await assertEventHostTransition({
          client: tx,
          actor: { ...actor, isAdmin: Boolean(actor.isAdmin) },
          event: currentEvent,
          nextHostId,
        });
      } catch (error) {
        if (error instanceof EventHostDelegationError) {
          if (error.code === "EVENT_HOST_DELEGATION_FORBIDDEN") {
            throw new EditorPermissionError(error.message);
          }
          throw new EditorInputError(error.message);
        }
        throw error;
      }
    }
    const currentSnapshot = await buildEventEditorSnapshot(
      currentEvent as unknown as Record<string, unknown>,
      { client: tx, actor, mode: "EDIT" },
    );
    const nextEventTypeForRegistration = command.draft.basics.eventType.trim().toUpperCase();
    const draftTeamSignup = typeof command.draft.participation?.teamSignup === "boolean"
      ? command.draft.participation.teamSignup
      : nextEventTypeForRegistration === "LEAGUE" || nextEventTypeForRegistration === "TOURNAMENT";
    assertEventTypeRegistrationUnit(
      command.draft.basics.eventType,
      draftTeamSignup,
    );
    assertImmutableFields(command.draft, eventId, currentSnapshot);
    if (
      currentSnapshot.editorRevision !== command.editorRevision ||
      currentSnapshot.staffRevision !== command.staffRevision
    ) {
      throw new EditorRevisionConflictError(
        currentSnapshot.editorRevision,
        currentSnapshot.staffRevision,
      );
    }
    const currentEventType = currentSnapshot.draft.basics.eventType
      .trim()
      .toUpperCase();
    const nextEventType = command.draft.basics.eventType.trim().toUpperCase();
    const eventTypeChanged = currentEventType !== nextEventType;
    const transition = command.scheduleTransition;
    if (eventTypeChanged && transition.mode !== "RECONCILE") {
      throw new EditorScheduleIntentError(
        "Changing the event type requires schedule reconciliation.",
      );
    }
    if (!eventTypeChanged && transition.mode === "RECONCILE") {
      throw new EditorScheduleIntentError(
        "Schedule reconciliation requires an event-type change.",
      );
    }
    if (
      transition.mode === "RECONCILE" &&
      transition.expectedScheduleRevision !==
        currentSnapshot.scheduleState.revision
    ) {
      throw new EventScheduleRevisionConflictError(
        currentSnapshot.scheduleState.revision,
      );
    }
    ({ questionIdMap, emailCandidates } = await saveWithinTransaction(
      tx,
      actor,
      command.draft,
      eventId,
      currentSnapshot,
    ));
    if (transition.mode === "RECONCILE") {
      const scheduleMode = ["LEAGUE", "TOURNAMENT"].includes(nextEventType)
        ? currentSnapshot.scheduleState.matchCount > 0
          ? "REBUILD"
          : "BUILD"
        : "DELETE";
      const mutation = await reconcileEventSchedule({
        tx,
        eventId,
        mode: scheduleMode,
        includePlaceholderTeams: true,
      });
      scheduleNotification = mutation.notification;
      if (scheduleMode === "DELETE") {
        scheduleOutcome = {
          status: "DELETED",
          matchCount: 0,
          matches: [],
          warnings: [],
        };
      } else {
        scheduleOutcome = {
          status: scheduleMode === "REBUILD" ? "REBUILT" : "BUILT",
          matchCount: mutation.matches.length,
          matches: editorMatchProjectionsFor(
            mutation.matches,
            mutation.event.officialPositions,
            mutation.event.eventType,
          ),
          warnings: mutation.warnings,
        };
      }
    } else {
      scheduleOutcome = {
        status: "NOT_REQUESTED",
        matchCount: currentSnapshot.scheduleState.matchCount,
        warnings: [],
      };
    }
    savedSnapshot = await loadEventEditorSnapshot(eventId, {
      actor,
      client: tx,
    });
  });
  if (scheduleNotification && options.onScheduleChanged) {
    try {
      await options.onScheduleChanged(scheduleNotification);
    } catch (error) {
      console.error(
        "[event-editor] schedule notification failed after save",
        error,
      );
    }
  }
  let staffEmailDelivery: EventEditorSaveResult["staffEmailDelivery"] =
    "NOT_REQUESTED";
  if (emailCandidates.length && options.sendStaffInvites) {
    staffEmailDelivery = await options.sendStaffInvites(
      emailCandidates,
      eventId,
    );
  }
  const snapshot =
    savedSnapshot ??
    (await loadEventEditorSnapshot(eventId, { actor, client }));
  return {
    status: "SAVED",
    snapshot,
    questionIdMap,
    staffEmailDelivery,
    scheduleOutcome,
  };
};

const draftOrganizationId = (draft: EventEditorDraft): string | null =>
  draft.basics.organizationId?.trim() || null;
const assertCreateAccess = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  draft: EventEditorDraft,
): Promise<string> => {
  const organizationId = draftOrganizationId(draft);
  const requestedHostId = normalizeEntityId(draft.basics.hostId);
  if (!organizationId) {
    if (
      !actor.isAdmin &&
      requestedHostId &&
      requestedHostId !== actor.userId
    ) {
      throw new EditorPermissionError(
        "The selected event host cannot create this event.",
      );
    }
    return requestedHostId ?? actor.userId;
  }
  const [organization, staffMembers, staffInvites] = await Promise.all([
    tx.organizations.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        ownerId: true,
        ownershipStatus: true,
        enabledFeatures: true,
      },
    }),
    tx.staffMembers.findMany({
      where: { organizationId },
      select: { organizationId: true, userId: true, types: true },
    }),
    tx.invites.findMany({
      where: { organizationId, type: "STAFF" },
      select: {
        organizationId: true,
        userId: true,
        type: true,
        status: true,
      },
    }),
  ]);
  if (!organization) throw new EditorCapabilityError("Organization not found.");
  if (organization.ownershipStatus?.trim().toUpperCase() !== "CLAIMED") {
    throw new EditorPermissionError(
      "The Organization must be claimed before creating Events.",
    );
  }
  if (
    !actor.isAdmin &&
    !(await hasOrgPermission(
      { ...actor, isAdmin: Boolean(actor.isAdmin) },
      organization,
      ORG_PERMISSIONS.EVENTS_MANAGE,
      tx,
    ))
  ) {
    throw new EditorPermissionError();
  }
  const requiredFeature =
    draft.basics.eventType.toUpperCase() === "TRYOUT"
      ? "CLUB_TEAMS"
      : "EVENT_MANAGEMENT";
  if (!organization.enabledFeatures.includes(requiredFeature)) {
    throw new EditorCapabilityError(
      "Enable event management tools before creating events.",
    );
  }
  const eligibleHostIds = new Set(
    collectOrganizationHostIds({
      ownerId: organization.ownerId,
      staffMembers,
      staffInvites,
    }),
  );
  const resolvedHostId =
    requestedHostId ??
    normalizeEntityId(organization.ownerId) ??
    actor.userId;
  if (!eligibleHostIds.has(resolvedHostId)) {
    throw new EditorPermissionError(
      "The selected Event Host is not an eligible Organization Host.",
    );
  }
  return resolvedHostId;
};


const assertCreateSchedulingIntent = (
  command: CreateEventEditorCommand,
): void => {
  const eventType = command.draft.basics.eventType.trim().toUpperCase();
  if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
    return;
  }
  const isAutomatedScheduling = normalizeAutomatedSchedulingForEventType(
    eventType,
    command.draft.schedule.isAutomatedScheduling,
  );
  if (
    command.completion.mode === "CREATE_AND_BUILD_SCHEDULE"
    && isAutomatedScheduling !== true
  ) {
    throw new EditorScheduleIntentError(
      "Automated Scheduling must be enabled when Create builds a schedule.",
    );
  }
  if (
    command.completion.mode !== "CREATE_ONLY"
    || isAutomatedScheduling !== false
  ) {
    return;
  }
  if (command.draft.schedule.mode !== "FIXED_END") {
    throw new EditorInputError(
      "A finite Planned End is required when Automated Scheduling is off.",
    );
  }

  const plannedEnd = new Date(command.draft.schedule.endConstraint);
  if (!Number.isFinite(plannedEnd.getTime())) {
    throw new EditorInputError(
      "A finite Planned End is required when Automated Scheduling is off.",
    );
  }
};
type RevisionModel = "fields" | "timeSlots" | "rentalBookings" | "rentalBookingItems";
type RevisionRow = Fields | TimeSlots | RentalBookings | RentalBookingItems;

const readRevisionRows = async <T extends RevisionRow>(
  ids: string[],
  read: (ids: string[]) => Promise<T[]>,
): Promise<T[]> => {
  if (!ids.length) return [];
  return read(ids);
};

const readFieldRevisionRows = (
  client: EditorSnapshotClient,
  ids: string[],
): Promise<Fields[]> =>
  client.fields.findMany({
    where: { id: { in: ids } },
  });

const readTimeSlotRevisionRows = (
  client: EditorSnapshotClient,
  ids: string[],
): Promise<TimeSlots[]> =>
  client.timeSlots.findMany({
    where: { id: { in: ids } },
  });

const readRentalBookingRevisionRows = (
  client: EditorSnapshotClient,
  ids: string[],
): Promise<RentalBookings[]> =>
  client.rentalBookings.findMany({
    where: { id: { in: ids } },
  });

const readRentalBookingItemRevisionRows = (
  client: EditorSnapshotClient,
  ids: string[],
): Promise<RentalBookingItems[]> =>
  client.rentalBookingItems.findMany({
    where: { id: { in: ids } },
  });

const rowRevision = (
  model: RevisionModel,
  id: string,
  row: RevisionRow | null,
): string =>
  computeEventEditorRevision({
    model,
    id,
    row,
  });


const scheduleWindowFor = (
  snapshot: EventEditorSnapshot,
): { start: Date; end: Date } => {
  const start = new Date(snapshot.draft.basics.start);
  if (!Number.isFinite(start.getTime())) {
    throw new EditorInputError("The schedule proposal has an invalid start time.");
  }
  const endCandidates = [
    snapshot.draft.schedule.endConstraint,
    "generatedScheduleEnd" in snapshot.draft.schedule
      ? snapshot.draft.schedule.generatedScheduleEnd
      : null,
  ]
    .map((value) => (value ? new Date(value) : null))
    .filter((value): value is Date => Boolean(value && Number.isFinite(value.getTime())));
  const end = endCandidates.reduce(
    (latest, candidate) =>
      candidate.getTime() > latest.getTime() ? candidate : latest,
    new Date(start.getTime() + 24 * 60 * 60 * 1000),
  );
  return {
    start,
    end: end.getTime() > start.getTime()
      ? end
      : new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
};

const fieldBlockerSourceKey = (
  source: FieldSchedulingConflictSource,
): string =>
  JSON.stringify({
    ...source,
    daysOfWeek: [...source.daysOfWeek].sort((left, right) => left - right),
    scheduledFieldIds: [...source.scheduledFieldIds].sort(),
  });

const fieldBlockerIntervalKey = (
  interval: FieldBlockerInterval,
): string =>
  [
    interval.start.toISOString(),
    interval.end.toISOString(),
    fieldBlockerSourceKey(interval.source),
  ].join("\u0000");

const fieldBlockerRecurrenceKey = (
  recurrence: FieldBlockerRecurrence,
): string => {
  const daysOfWeek = Array.isArray(recurrence.slot.daysOfWeek)
    ? recurrence.slot.daysOfWeek.map(Number).sort((left, right) => left - right)
    : [];
  const scheduledFieldIds = Array.isArray(recurrence.slot.scheduledFieldIds)
    ? recurrence.slot.scheduledFieldIds.map(String).sort()
    : [];
  return [
    fieldBlockerSourceKey(recurrence.source),
    JSON.stringify({
      ...recurrence.slot,
      daysOfWeek,
      scheduledFieldIds,
    }),
  ].join("\u0000");
};

const serializeFieldBlockerCatalog = (
  catalog: FieldBlockerCatalog,
): Record<string, unknown> => ({
  lowerBound: catalog.lowerBound.toISOString(),
  intervalsByFieldId: Array.from(catalog.intervalsByFieldId.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, intervals]) => ({
      fieldId,
      intervals: [...intervals]
        .sort((left, right) =>
          fieldBlockerIntervalKey(left).localeCompare(
            fieldBlockerIntervalKey(right),
          ),
        )
        .map((interval) => ({
          start: interval.start.toISOString(),
          end: interval.end.toISOString(),
          source: interval.source,
        })),
    })),
  recurringByFieldId: Array.from(catalog.recurringByFieldId.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, recurrences]) => ({
      fieldId,
      recurrences: [...recurrences]
        .sort((left, right) =>
          fieldBlockerRecurrenceKey(left).localeCompare(
            fieldBlockerRecurrenceKey(right),
          ),
        )
        .map((recurrence) => ({
          source: recurrence.source,
          slot: recurrence.slot,
        })),
    })),
});

const rentalResourceIdsForDraft = (
  draft: EventEditorDraft,
): { bookingIds: string[]; bookingItemIds: string[] } => {
  const bookingIds = new Set<string>();
  const bookingItemIds = new Set<string>();
  const add = (target: Set<string>, value: unknown) => {
    const normalized = normalizeEntityId(value);
    if (normalized) target.add(normalized);
  };
  add(bookingIds, draft.resources.rentalBookingId);
  add(bookingItemIds, draft.resources.rentalBookingItemId);
  draft.resources.timeSlots.forEach((slot) => {
    add(bookingIds, slot.rentalBookingId);
    add(bookingItemIds, slot.rentalBookingItemId);
  });
  return {
    bookingIds: Array.from(bookingIds).sort(),
    bookingItemIds: Array.from(bookingItemIds).sort(),
  };
};

const revisionBindingResourceIds = (
  draft: EventEditorDraft,
): { fieldIds: string[]; timeSlotIds: string[] } => {
  const fieldIds = new Set<string>();
  const timeSlotIds = new Set<string>();
  const add = (target: Set<string>, value: unknown) => {
    const normalized = normalizeEntityId(value);
    if (normalized) target.add(normalized);
  };
  const addMany = (target: Set<string>, values: unknown) => {
    if (!Array.isArray(values)) return;
    values.forEach((value) => add(target, value));
  };

  addMany(fieldIds, draft.resources.fieldIds);
  addMany(timeSlotIds, draft.resources.timeSlotIds);
  draft.resources.fields.forEach((field) => {
    add(fieldIds, field.id ?? field.$id);
  });
  draft.resources.timeSlots.forEach((slot) => {
    add(timeSlotIds, slot.id ?? slot.$id);
    add(fieldIds, slot.scheduledFieldId);
    add(fieldIds, slot.fieldId);
    addMany(fieldIds, slot.scheduledFieldIds);
    addMany(fieldIds, slot.fieldIds);
  });
  return {
    fieldIds: Array.from(fieldIds).sort(),
    timeSlotIds: Array.from(timeSlotIds).sort(),
  };
};
const templateIdsForDraft = (draft: EventEditorDraft): string[] =>
  Array.from(
    new Set(
      draft.resources.requiredTemplateIds
        .map((templateId) => normalizeEntityId(templateId))
        .filter((templateId): templateId is string => Boolean(templateId)),
    ),
  ).sort();

const revisionBindingFor = async (
  snapshot: EventEditorSnapshot,
  expected: CreateEventEditorCommand["expectedRevisions"] | undefined,
  client: EditorSnapshotClient,
): Promise<EventEditorRevisionBinding> => {
  const { fieldIds, timeSlotIds } = revisionBindingResourceIds(snapshot.draft);
  const rentalResourceIds = rentalResourceIdsForDraft(snapshot.draft);
  const rentalBookingId =
    normalizeEntityId(snapshot.draft.resources.rentalBookingId) ??
    rentalResourceIds.bookingIds[0] ??
    null;
  const { start: scheduleWindowStart, end: scheduleWindowEnd } =
    scheduleWindowFor(snapshot);
  const [
    fieldRows,
    timeSlotRows,
    rentalBookingRows,
    rentalBookingItemRows,
    blockerCatalog,
  ] = await Promise.all([
    readRevisionRows(fieldIds, (ids) => readFieldRevisionRows(client, ids)),
    readRevisionRows(timeSlotIds, (ids) =>
      readTimeSlotRevisionRows(client, ids),
    ),
    readRevisionRows(rentalResourceIds.bookingIds, (ids) =>
      readRentalBookingRevisionRows(client, ids),
    ),
    readRevisionRows(rentalResourceIds.bookingItemIds, (ids) =>
      readRentalBookingItemRevisionRows(client, ids),
    ),
    loadFieldBlockerCatalog({
      client: client as unknown as FieldBlockerPrismaLike,
      fieldIds,
      lowerBound: scheduleWindowStart,
      excludeEventId: snapshot.eventId,
    }),
  ]);
  const fieldRowsById = new Map(fieldRows.map((row) => [row.id, row]));
  const timeSlotRowsById = new Map(timeSlotRows.map((row) => [row.id, row]));
  const rentalBookingRowsById = new Map(
    rentalBookingRows.map((row) => [row.id, row]),
  );
  const rentalBookingItemRowsById = new Map(
    rentalBookingItemRows.map((row) => [row.id, row]),
  );
  const fieldRevisions = Object.fromEntries(
    fieldIds.map((fieldId) => [
      fieldId,
      rowRevision("fields", fieldId, fieldRowsById.get(fieldId) ?? null),
    ]),
  );
  const timeSlotRevisions = Object.fromEntries(
    timeSlotIds.map((timeSlotId) => [
      timeSlotId,
      rowRevision(
        "timeSlots",
        timeSlotId,
        timeSlotRowsById.get(timeSlotId) ?? null,
      ),
    ]),
  );
  const rentalBookingRevisions = Object.fromEntries(
    rentalResourceIds.bookingIds.map((bookingId) => [
      bookingId,
      rowRevision(
        "rentalBookings",
        bookingId,
        rentalBookingRowsById.get(bookingId) ?? null,
      ),
    ]),
  );
  const rentalBookingRevision = rentalBookingId
    ? rentalBookingRevisions[rentalBookingId] ?? null
    : null;
  const rentalBookingItemRevisions = Object.fromEntries(
    rentalResourceIds.bookingItemIds.map((bookingItemId) => [
      bookingItemId,
      rowRevision(
        "rentalBookingItems",
        bookingItemId,
        rentalBookingItemRowsById.get(bookingItemId) ?? null,
      ),
    ]),
  );
  const scheduleRevision =
    expected?.scheduleRevision ?? snapshot.scheduleState.revision;
  const availabilityRevision = computeEventEditorRevision({
    scheduleRevision,
    windowStart: scheduleWindowStart.toISOString(),
    windowEnd: scheduleWindowEnd.toISOString(),
    fields: fieldRows
      .map((row) => ({ id: row.id, row }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    timeSlots: timeSlotRows
      .map((row) => ({ id: row.id, row }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    rentalBookings: rentalBookingRows
      .map((row) => ({ id: row.id, row }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    rentalBookingItems: rentalBookingItemRows
      .map((row) => ({ id: row.id, row }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    blockers: serializeFieldBlockerCatalog(blockerCatalog),
  });
  return {
    editorRevision: snapshot.editorRevision,
    staffRevision: expected?.staffRevision ?? snapshot.staffRevision,
    scheduleRevision,
    fieldRevisions,
    timeSlotRevisions,
    rentalBookingRevision,
    rentalBookingRevisions,
    rentalBookingItemRevisions,
    availabilityRevision,
  };
};

const scheduleProposalFor = (params: {
  command: CreateEventEditorCommand;
  eventId: string;
  snapshot: EventEditorSnapshot;
  revisionBinding: EventEditorRevisionBinding;
  event: Parameters<typeof serializeEvent>[0];
  matches: Parameters<typeof serializeMatches>[0];
  scheduleOutcome: EventEditorCreateProposal["scheduleOutcome"];
}): EventEditorCreateProposal => {
  const proposalWithoutRevision = {
    status: "PROPOSED" as const,
    createOperationId: params.command.createOperationId,
    eventId: params.eventId,
    expectedRevisions: params.command.expectedRevisions,
    completion: params.command.completion,
    snapshot: params.snapshot,
    revisionBinding: params.revisionBinding,
    scheduleOutcome: params.scheduleOutcome,
    graph: {
      event: serializeEvent(params.event),
      matches: serializeMatches(
        params.matches,
        params.event.officialPositions,
        params.event.eventType,
      ),
    },
  };
  return {
    ...proposalWithoutRevision,
    proposalRevision: eventEditorProposalRevision(proposalWithoutRevision),
  };
};
const createEventEditorInternal = async (
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: CreateEventEditorOptions = {},
): Promise<EventEditorCreateResult | EventEditorCreateProposal> => {
  const client = options.client ?? prisma;
  assertCreateSchedulingIntent(command);
  const requestHash = eventEditorCreateRequestHash(command);
  let claim: EventCreateOperationClaim | null = null;
  let firstClaimResult: EventEditorCreateResult | null = null;
  let questionIdMap: Record<string, string> = {};
  let emailCandidates: unknown[] = [];
  let scheduleOutcome: EventEditorScheduleOutcome = {
    status: "NOT_REQUESTED",
    matchCount: 0,
    warnings: [],
  };
  let proposalRevisionBinding: EventEditorRevisionBinding | null = null;
  let scheduleNotification: MatchScheduleNotificationPlan | null = null;
  let proposalGraph: {
    event: Parameters<typeof serializeEvent>[0];
    matches: Parameters<typeof serializeMatches>[0];
  } | null = null;

  try {
    await client.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed =
      options.preclaimedOperation ??
      (await claimEventEditorCreateOperation({
        client: tx,
        createOperationId: command.createOperationId,
        actorUserId: actor.userId,
        requestHash,
      }));
    claim = claimed;
    if (!claimed.firstClaim) return;

    const organizationId = draftOrganizationId(command.draft);
    const requestedHostId = normalizeEntityId(command.draft.basics.hostId);
    let resolvedCreateHostId = requestedHostId ?? actor.userId;
    if (organizationId) {
      const [organization, staffMembers, staffInvites] = await Promise.all([
        tx.organizations.findUnique({
          where: { id: organizationId },
          select: {
            id: true,
            ownerId: true,
            ownershipStatus: true,
            enabledFeatures: true,
          },
        }),
        tx.staffMembers.findMany({
          where: { organizationId },
          select: { organizationId: true, userId: true, types: true },
        }),
        tx.invites.findMany({
          where: { organizationId, type: "STAFF" },
          select: {
            organizationId: true,
            userId: true,
            type: true,
            status: true,
          },
        }),
      ]);
      if (!organization) {
        throw new EditorCapabilityError("Organization not found.");
      }
      if (organization.ownershipStatus?.trim().toUpperCase() !== "CLAIMED") {
        throw new EditorPermissionError(
          "The Organization must be claimed before creating Events.",
        );
      }
      if (
        !actor.isAdmin &&
        !(await hasOrgPermission(
          { ...actor, isAdmin: Boolean(actor.isAdmin) },
          organization,
          ORG_PERMISSIONS.EVENTS_MANAGE,
          tx,
        ))
      ) {
        throw new EditorPermissionError();
      }
      const requiredFeature =
        command.draft.basics.eventType.toUpperCase() === "TRYOUT"
          ? "CLUB_TEAMS"
          : "EVENT_MANAGEMENT";
      if (!organization.enabledFeatures.includes(requiredFeature)) {
        throw new EditorCapabilityError(
          "Enable event management tools before creating events.",
        );
      }
      const eligibleHostIds = new Set(
        collectOrganizationHostIds({
          ownerId: organization.ownerId,
          staffMembers,
          staffInvites,
        }),
      );
      resolvedCreateHostId =
        requestedHostId ??
        normalizeEntityId(organization.ownerId) ??
        actor.userId;
      if (!eligibleHostIds.has(resolvedCreateHostId)) {
        throw new EditorPermissionError(
          "The selected Event Host is not an eligible Organization Host.",
        );
      }
    } else if (
      !actor.isAdmin &&
      requestedHostId &&
      requestedHostId !== actor.userId
    ) {
      throw new EditorPermissionError(
        "The selected event host cannot create this event.",
      );
    }
    const createQuery: EventEditorBootstrapQuery = {
      organizationId: organizationId ?? undefined,
      eventType: command.draft.basics.eventType,
      sportId: command.draft.basics.sportIds[0],
      parentEventId: command.draft.basics.parentEvent ?? undefined,
      templateId: command.draft.resources.requiredTemplateIds[0],
      rentalBookingId: command.draft.resources.rentalBookingId ?? undefined,
      start: command.draft.basics.start,
    };
    const createSnapshot = await loadCreateEventEditorSnapshot(createQuery, {
      actor,
      client: tx,
    });
    if (
      command.expectedRevisions.editorRevision !==
        createSnapshot.editorRevision ||
      command.expectedRevisions.staffRevision !==
        createSnapshot.staffRevision ||
      command.expectedRevisions.scheduleRevision !==
        createSnapshot.scheduleState.revision
    ) {
      throw new EditorRevisionConflictError(
        createSnapshot.editorRevision,
        createSnapshot.staffRevision,
        createSnapshot.scheduleState.revision,
      );
    }
    const nextEventTypeForRegistration = command.draft.basics.eventType.trim().toUpperCase();
    const draftTeamSignup = typeof command.draft.participation?.teamSignup === "boolean"
      ? command.draft.participation.teamSignup
      : nextEventTypeForRegistration === "LEAGUE" || nextEventTypeForRegistration === "TOURNAMENT";
    assertEventTypeRegistrationUnit(
      command.draft.basics.eventType,
      draftTeamSignup,
    );
    await assertPaymentCapability(command.draft, createSnapshot);
    assertImmutableFields(command.draft, claimed.eventId, createSnapshot);

    await acquireEventLock(tx, claimed.eventId);
    if (options.shouldReturnScheduleProposal) {
      await acquireEventTemplateLocks(tx, templateIdsForDraft(command.draft));
      const resourceIds = revisionBindingResourceIds(command.draft);
      await acquireFieldLocks(tx, resourceIds.fieldIds);
      await acquireTimeSlotLocks(tx, resourceIds.timeSlotIds);
      const rentalResourceIds = rentalResourceIdsForDraft(command.draft);
      await acquireRentalBookingLocks(
        tx,
        rentalResourceIds.bookingIds,
        rentalResourceIds.bookingItemIds,
      );
    }
    if (options.shouldReturnScheduleProposal) {
      const bindingSnapshot = {
        ...createSnapshot,
        draft: {
          ...createSnapshot.draft,
          basics: command.draft.basics,
          schedule: command.draft.schedule,
          resources: command.draft.resources,
        },
      } as EventEditorSnapshot;
      proposalRevisionBinding = await revisionBindingFor(
        bindingSnapshot,
        command.expectedRevisions,
        tx,
      );
    }
    ({ questionIdMap, emailCandidates } = await saveWithinTransaction(
      tx,
      actor,
      command.draft,
      claimed.eventId,
      createSnapshot,
      resolvedCreateHostId,
    ));
    if (command.completion.mode === "CREATE_ONLY") {
      const eventType = command.draft.basics.eventType.trim().toUpperCase();
      if (["LEAGUE", "TOURNAMENT"].includes(eventType)) {
        const graph = await persistCreateOnlyMatchGraph({
          tx,
          eventId: claimed.eventId,
          includePlaceholderTeams: true,
        });
        scheduleOutcome = {
          status: "NOT_REQUESTED",
          matchCount: graph.matches.length,
          matches: editorMatchProjectionsFor(
            graph.matches,
            graph.event.officialPositions,
            graph.event.eventType,
          ),
          warnings: [],
        };
      }
    }
    if (command.completion.mode === "CREATE_AND_BUILD_SCHEDULE") {
      const eventType = command.draft.basics.eventType.trim().toUpperCase();
      if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
        throw new EditorScheduleIntentError(
          "Create-and-build is only supported for League and Tournament events.",
        );
      }
      const mutation = await reconcileEventSchedule({
        tx,
        eventId: claimed.eventId,
        mode: "BUILD",
        includePlaceholderTeams: true,
      });
      if (mutation.matches.length === 0) {
        throw new EventScheduleMutationError(
          "EDITOR_SCHEDULE_INPUT_INVALID",
          "The scheduler did not produce any matches.",
        );
      }
      scheduleNotification = mutation.notification;
      scheduleOutcome = {
        status: "BUILT",
        matchCount: mutation.matches.length,
        matches: editorMatchProjectionsFor(
          mutation.matches,
          mutation.event.officialPositions,
          mutation.event.eventType,
        ),
        warnings: mutation.warnings,
      };
      proposalGraph = {
        event: mutation.event,
        matches: mutation.matches,
      };
    }
    const snapshot = await loadEventEditorSnapshot(claimed.eventId, {
      actor,
      client: tx,
    });
    if (options.shouldReturnScheduleProposal) {
      const builtScheduleOutcome =
        scheduleOutcome.status === "BUILT" || scheduleOutcome.status === "REBUILT"
          ? {
              ...scheduleOutcome,
              status: "BUILT" as const,
            }
          : null;
      if (!builtScheduleOutcome || !proposalGraph) {
        throw new EditorScheduleIntentError(
          "A complete schedule proposal requires a built schedule.",
        );
      }
      if (!proposalRevisionBinding) {
        throw new Error("The schedule proposal revision was not captured.");
      }
      const proposalSnapshot: EventEditorSnapshot = {
        ...createSnapshot,
        mode: "CREATE",
        eventId: null,
        draft: command.draft,
      };
      const proposal = scheduleProposalFor({
        command,
        eventId: claimed.eventId,
        snapshot: proposalSnapshot,
        revisionBinding: proposalRevisionBinding,
        event: proposalGraph.event,
        matches: proposalGraph.matches,
        scheduleOutcome: builtScheduleOutcome,
      });
      try {
        validateAndNormalizeSerializedGraph(claimed.eventId, proposal.graph);
      } catch (error) {
        if (error instanceof EventScheduleProposalGraphError) {
          throw new EventEditorProposalInvalidError(error.message);
        }
        throw error;
      }
      throw new EventEditorCreateProposalRollback(proposal);
    }
    firstClaimResult = {
      status: "SAVED",
      createOperationId: command.createOperationId,
      editorRevision: snapshot.editorRevision,
      staffRevision: snapshot.staffRevision,
      scheduleRevision: snapshot.scheduleState.revision,
      snapshot,
      questionIdMap,
      staffEmailDelivery: "NOT_REQUESTED",
      scheduleOutcome,
    };
    // Keep the receipt non-replayable until all post-commit hooks finish.
    // The canonical domain result is already durable for recovery.
    await completeEventEditorCreateOperation({
      client: tx,
      createOperationId: command.createOperationId,
      result: firstClaimResult,
      emailDelivery: "PROCESSING",
    });
  });
  } catch (error) {
    if (error instanceof EventEditorCreateProposalRollback) {
      try {
        await completeEventEditorCreateProposal({
          client,
          createOperationId: command.createOperationId,
          proposal: error.proposal,
        });
        return error.proposal;
      } catch (completionError) {
        if (options.preclaimedOperation?.firstClaim) {
          try {
            await deleteEventEditorCreateOperation({
              client,
              createOperationId: command.createOperationId,
              actorUserId: actor.userId,
              requestHash,
            });
          } catch (cleanupError) {
            console.error(
              "[event-editor] failed proposal receipt cleanup",
              cleanupError,
            );
          }
        }
        throw completionError;
      }
    }
    if (options.preclaimedOperation?.firstClaim) {
      try {
        await deleteEventEditorCreateOperation({
          client,
          createOperationId: command.createOperationId,
          actorUserId: actor.userId,
          requestHash,
        });
      } catch (cleanupError) {
        console.error(
          "[event-editor] proposal operation cleanup failed",
          cleanupError,
        );
      }
    }
    throw error;
  }

  const operationClaim: EventCreateOperationClaim | null =
    claim as EventCreateOperationClaim | null;
  if (!operationClaim)
    throw new Error("The event create operation was not claimed.");
  if (operationClaim.firstClaim === false) {
    const replay = operationClaim.result
      ? operationClaim
      : await waitForEventEditorCreateOperation({
          client,
          createOperationId: command.createOperationId,
          actorUserId: actor.userId,
          requestHash,
          returnCommittedResultOnTimeout: true,
        });
    if (!replay.result)
      throw new Error("The event create operation has no stored result.");
    return replay.result;
  }
  const canonicalResult: EventEditorCreateResult | null =
    firstClaimResult as EventEditorCreateResult | null;
  if (!canonicalResult)
    throw new Error("The event create operation has no canonical result.");

  let staffEmailDelivery: EventEditorCreateResult["staffEmailDelivery"] =
    "NOT_REQUESTED";
  if (emailCandidates.length && options.sendStaffInvites) {
    try {
      staffEmailDelivery = await options.sendStaffInvites(
        emailCandidates,
        operationClaim.eventId,
      );
    } catch (error) {
      staffEmailDelivery = "FAILED";
      console.error(
        "[event-editor] staff invite delivery failed after create",
        error,
      );
    }
  }
  if (options.onEventCreated) {
    try {
      await options.onEventCreated(operationClaim.eventId, command.draft);
    } catch (error) {
      console.error(
        "[event-editor] create notification failed after commit",
        error,
      );
    }
  }
  if (scheduleNotification && options.onScheduleChanged) {
    try {
      await options.onScheduleChanged(scheduleNotification);
    } catch (error) {
      console.error(
        "[event-editor] schedule notification failed after create",
        error,
      );
    }
  }
  const finalResult = { ...canonicalResult, staffEmailDelivery };
  try {
    await completeEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      result: finalResult,
      emailDelivery: staffEmailDelivery,
    });
  } catch (error) {
    // The committed canonical result remains replayable if delivery metadata
    // cannot be updated after the domain transaction.
    console.error(
      "[event-editor] create delivery metadata update failed",
      error,
    );
  }
  return finalResult;
};
export const createEventEditor = async (
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateResult> => {
  const result = await createEventEditorInternal(actor, command, options);
  if (result.status !== "SAVED") {
    throw new Error("A schedule proposal requires the proposal-specific create path.");
  }
  return result;
};

export const createScheduleProposalFromEditor = async (
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateProposal | EventEditorCreateResult> => {
  const eventType = command.draft.basics.eventType.trim().toUpperCase();
  if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
    throw new EditorScheduleIntentError(
      "Schedule proposals are only supported for League and Tournament events.",
    );
  }
  if (command.completion.mode !== "CREATE_AND_BUILD_SCHEDULE") {
    throw new EditorScheduleIntentError(
      "A schedule proposal requires Create-and-build.",
    );
  }
  assertCreateSchedulingIntent(command);
  const client = options.client ?? prisma;
  const requestHash = eventEditorCreateRequestHash(command);
  const claim = await client.$transaction((tx: Prisma.TransactionClient) =>
    claimEventEditorCreateOperation({
      client: tx,
      createOperationId: command.createOperationId,
      actorUserId: actor.userId,
      requestHash,
    }),
  );
  if (!claim.firstClaim) {
    const existing = await readEventEditorCreateProposal({
      client,
      createOperationId: command.createOperationId,
      actorUserId: actor.userId,
      requestHash,
    });
    if (existing) return existing.result ?? existing.proposal;
    const waited = await waitForEventEditorCreateProposal({
      client,
      createOperationId: command.createOperationId,
      actorUserId: actor.userId,
      requestHash,
    });
    return waited.result ?? waited.proposal;
  }
  const result = await createEventEditorInternal(actor, command, {
    shouldReturnScheduleProposal: true,
    preclaimedOperation: claim,
  });
  if (result.status !== "PROPOSED") {
    throw new Error("The create operation did not return a schedule proposal.");
  }
  return result;
};

export const acceptScheduleProposalFromEditor = async (
  actor: EditorActor,
  createOperationId: string,
  proposalRevision: string,
  draft: EventEditorDraft,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateResult> => {
  const client = options.client ?? prisma;
  const stored = await readEventEditorCreateProposalForActor({
    client,
    createOperationId,
    actorUserId: actor.userId,
  });
  if (!stored) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal was not found.",
    );
  }
  const proposal = stored.proposal;
  if (!proposal) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal was not found.",
    );
  }
  const { proposalRevision: _storedRevision, ...proposalWithoutRevision } =
    proposal;
  if (
    proposal.proposalRevision !== proposalRevision ||
    eventEditorProposalRevision(proposalWithoutRevision) !== proposalRevision
  ) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal revision is invalid.",
    );
  }
  if (stored.result) return stored.result;
  if (
    computeEventEditorRevision(draft) !==
    computeEventEditorRevision(proposal.snapshot.draft)
  ) {
    throw new EventEditorProposalStaleError(
      "The event configuration changed before proposal acceptance.",
    );
  }
  if (proposal.status !== "PROPOSED") {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal is not pending review.",
    );
  }
  const result = await client.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await acquireEventLock(tx, stored.eventId);
      await acquireEventTemplateLocks(
        tx,
        templateIdsForDraft(proposal.snapshot.draft),
      );
      const currentStored = await readEventEditorCreateProposalForActor({
        client: tx,
        createOperationId,
        actorUserId: actor.userId,
      });
      if (currentStored?.result) {
        return {
          accepted: currentStored.result,
          emailCandidates: [] as unknown[],
          replayed: true as const,
        };
      }
      if (
        !currentStored?.proposal ||
        currentStored.proposal.proposalRevision !== proposalRevision
      ) {
        throw new EventEditorProposalStaleError(
          "The schedule proposal changed before acceptance.",
        );
      }
      const resourceIds = revisionBindingResourceIds(proposal.snapshot.draft);
      await acquireFieldLocks(
        tx,
        [
          ...resourceIds.fieldIds,
          ...proposal.graph.matches
            .map((match) => match.fieldId)
            .filter((fieldId): fieldId is string => Boolean(fieldId)),
        ],
      );
      await acquireTimeSlotLocks(tx, resourceIds.timeSlotIds);
      const rentalResourceIds = rentalResourceIdsForDraft(
        proposal.snapshot.draft,
      );
      await acquireRentalBookingLocks(
        tx,
        rentalResourceIds.bookingIds,
        rentalResourceIds.bookingItemIds,
      );
      const existingEvent = await tx.events.findUnique({
        where: { id: stored.eventId },
        select: { id: true },
      });
      if (existingEvent) {
        throw new EventEditorProposalInvalidError(
          "The schedule proposal was already accepted.",
        );
      }
      const current = await loadCreateEventEditorSnapshot(
        {
          organizationId:
            proposal.snapshot.draft.basics.organizationId ?? undefined,
          eventType: proposal.snapshot.draft.basics.eventType,
          sportId: proposal.snapshot.draft.basics.sportIds[0],
          parentEventId:
            proposal.snapshot.draft.basics.parentEvent ?? undefined,
          templateId:
            proposal.snapshot.draft.resources.requiredTemplateIds[0],
          rentalBookingId:
            proposal.snapshot.draft.resources.rentalBookingId ?? undefined,
          start: proposal.snapshot.draft.basics.start,
        },
        { actor, client: tx },
      );
      const expectedBindingSnapshot = {
        ...current,
        draft: proposal.snapshot.draft,
      } as EventEditorSnapshot;
      const expectedBinding = await revisionBindingFor(
        expectedBindingSnapshot,
        undefined,
        tx,
      );
      if (
        computeEventEditorRevision(expectedBinding)
        !== computeEventEditorRevision(proposal.revisionBinding)
      ) {
        throw new EventEditorProposalStaleError(
          "The Event Configuration or authoritative availability changed.",
        );
      }
      const resolvedHostId = await assertCreateAccess(
        tx,
        actor,
        proposal.snapshot.draft,
      );
      assertMinimumBracketTeamCounts(proposal.snapshot.draft);
      const draftTeamSignup =
        typeof proposal.snapshot.draft.participation?.teamSignup === "boolean"
          ? proposal.snapshot.draft.participation.teamSignup
          : ["LEAGUE", "TOURNAMENT"].includes(
              proposal.snapshot.draft.basics.eventType.trim().toUpperCase(),
            );
      assertEventTypeRegistrationUnit(
        proposal.snapshot.draft.basics.eventType,
        draftTeamSignup,
      );
      assertImmutableFields(
        proposal.snapshot.draft,
        stored.eventId,
        current,
      );
      await assertPaymentCapability(proposal.snapshot.draft, current);
      let validatedProposalGraph: EventEditorCreateProposal["graph"];
      try {
        validatedProposalGraph = validateAndNormalizeSerializedGraph(
          stored.eventId,
          proposal.graph,
        );
      } catch (error) {
        if (error instanceof EventScheduleProposalGraphError) {
          throw new EventEditorProposalInvalidError(error.message);
        }
        throw error;
      }
      const { questionIdMap, emailCandidates } = await saveWithinTransaction(
        tx,
        actor,
        proposal.snapshot.draft,
        stored.eventId,
        current,
        resolvedHostId,
      );
      await persistSerializedScheduleGraph({
        tx,
        eventId: stored.eventId,
        graph: validatedProposalGraph,
      });
      const snapshot = await loadEventEditorSnapshot(stored.eventId, {
        actor,
        client: tx,
      });
      const accepted: EventEditorCreateResult = {
        status: "SAVED",
        createOperationId,
        editorRevision: snapshot.editorRevision,
        staffRevision: snapshot.staffRevision,
        scheduleRevision: snapshot.scheduleState.revision,
        snapshot,
        questionIdMap,
        staffEmailDelivery: "NOT_REQUESTED",
        scheduleOutcome: proposal.scheduleOutcome,
        graph: proposal.graph,
      };
      await completeEventEditorCreateOperation({
        client: tx,
        createOperationId,
        result: accepted,
        emailDelivery: "PROCESSING",
        proposalStatus: "ACCEPTED",
      });
      return { accepted, emailCandidates, replayed: false as const };
    },
  );
  if (result.replayed) return result.accepted;
  let staffEmailDelivery: EventEditorCreateResult["staffEmailDelivery"] =
    "NOT_REQUESTED";
  if (result.emailCandidates.length && options.sendStaffInvites) {
    try {
      staffEmailDelivery = await options.sendStaffInvites(
        result.emailCandidates,
        result.accepted.snapshot.eventId ?? stored.eventId,
      );
    } catch (error) {
      staffEmailDelivery = "FAILED";
      console.error(
        "[event-editor] staff invite delivery failed after proposal acceptance",
        error,
      );
    }
  }
  if (options.onEventCreated) {
    try {
      await options.onEventCreated(stored.eventId, proposal.snapshot.draft);
    } catch (error) {
      console.error(
        "[event-editor] create notification failed after proposal acceptance",
        error,
      );
    }
  }
  const scheduleNotification = scheduleNotificationForAcceptedProposal(
    result.accepted.graph ?? proposal.graph,
  );
  if (scheduleNotification && options.onScheduleChanged) {
    try {
      await options.onScheduleChanged(scheduleNotification);
    } catch (error) {
      console.error(
        "[event-editor] schedule notification failed after proposal acceptance",
        error,
      );
    }
  }
  const finalResult = {
    ...result.accepted,
    staffEmailDelivery,
  };
  try {
    await completeEventEditorCreateOperation({
      client,
      createOperationId,
      result: finalResult,
      emailDelivery: staffEmailDelivery,
      proposalStatus: "ACCEPTED",
    });
  } catch (error) {
    console.error(
      "[event-editor] proposal acceptance metadata update failed",
      error,
    );
  }
  return finalResult;
};

export const rejectScheduleProposalFromEditor = async (
  actor: EditorActor,
  createOperationId: string,
  proposalRevision: string,
  options: EditorSaveOptions = {},
): Promise<void> => {
  const client = options.client ?? prisma;
  const storedForLock = await readEventEditorCreateProposalForActor({
    client,
    createOperationId,
    actorUserId: actor.userId,
  });
  if (!storedForLock) return;
  if (!storedForLock.proposal || storedForLock.result) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal is not pending review.",
    );
  }
  await client.$transaction(async (tx: Prisma.TransactionClient) => {
    await acquireEventLock(tx, storedForLock.eventId);
    const stored = await readEventEditorCreateProposalForActor({
      client: tx,
      createOperationId,
      actorUserId: actor.userId,
    });
    if (!stored) return;
    if (!stored.proposal || stored.result) {
      throw new EventEditorProposalInvalidError(
        "The schedule proposal is not pending review.",
      );
    }
    const { proposalRevision: _storedRevision, ...proposalWithoutRevision } =
      stored.proposal;
    if (
      stored.proposal.proposalRevision !== proposalRevision ||
      eventEditorProposalRevision(proposalWithoutRevision) !== proposalRevision
    ) {
      throw new EventEditorProposalInvalidError(
        "The schedule proposal revision is invalid.",
      );
    }
    const existingEvent = await tx.events.findUnique({
      where: { id: stored.eventId },
      select: { id: true },
    });
    if (existingEvent) {
      throw new EventEditorProposalInvalidError(
        "The schedule proposal was already accepted.",
      );
    }
    await deleteEventEditorCreateOperation({
      client: tx,
      createOperationId,
      actorUserId: actor.userId,
      requestHash: stored.requestHash,
    });
  });
};

export const createEventFromEditor = async (
  command: CreateEventEditorCommand,
  actor: EditorActor,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateResult> =>
  createEventEditor(actor, command, options);

export const saveEventFromEditor = async (
  eventId: string,
  command: SaveEventEditorCommand,
  actor: EditorActor,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> =>
  saveEventEditor(actor, command, eventId, options);
