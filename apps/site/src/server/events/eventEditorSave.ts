import { assertEventRegistrationConfiguration, EventRegistrationConfigurationError } from '@/lib/eventRegistration';
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
import { parseDateTimeInTimeZone } from "@/lib/dateUtils";
import { resolveOneTimeTimeSlot } from "@/lib/timeSlotAvailability";
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
  readEventEditorCreateOperationClaimToken,
  readEventEditorCreateProposal,
  readEventEditorCreateProposalForActor,
  waitForEventEditorCreateOperation,
  waitForEventEditorCreateProposal,
  type EventCreateOperationProposal,
  type EventCreateOperationClaim,
} from "./eventCreateOperationReplay";
import {
  getStaffingPriorityPolicy,
  isStaffingPriority,
} from "@/server/officials/config";
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
  type EventEditorAffectedCompetitionPhase,
  type EventEditorBootstrapQuery,
  type EventEditorCreateProposal,
  type EventEditorCreateResult,
  type EventEditorDraft,
  type EventEditorMatchProjection,
  type EventEditorRevisionBinding,
  type EventEditorSaveResult,
  type EventEditorScheduleOutcome,
  type EventEditorScheduleDiagnostics,
  type EventEditorScheduleWarning,
  type EventEditorSnapshot,
  type EventEditorUnscheduledMatch,
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

export { EditorImmutableFieldError } from "./eventEditorAuthority";
import { assertBookedEditorResources, assertRentalBookingAuthority, EditorImmutableFieldError } from "./eventEditorAuthority";

export class EditorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorInputError";
  }
}

const normalizeEditorResourceIds = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeEntityId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

const editorTimeSlotId = (slot: Record<string, unknown>): string | null => (
  normalizeEntityId(slot.id) ?? normalizeEntityId(slot.$id)
);

const editorTimeSlotFieldIds = (slot: Record<string, unknown>): string[] => {
  const many = normalizeEditorResourceIds(slot.scheduledFieldIds);
  if (many.length > 0) return many;
  const legacyMany = normalizeEditorResourceIds(slot.fieldIds);
  if (legacyMany.length > 0) return legacyMany;
  return normalizeEditorResourceIds([
    slot.scheduledFieldId,
    slot.fieldId,
  ]);
};

const assertTryoutResourceAssignments = async (
  tx: Prisma.TransactionClient,
  draft: EventEditorDraft,
): Promise<void> => {
  const organizationId = normalizeEntityId(draft.basics.organizationId);
  if (!organizationId) {
    throw new EditorInputError("Tryout events must belong to an organization.");
  }

  const fieldIds = normalizeEditorResourceIds(draft.resources.fieldIds);
  const fieldRows = fieldIds.length
    ? await tx.fields.findMany({
      where: {
        id: { in: fieldIds },
        organizationId,
        archivedAt: null,
      },
      select: { id: true },
    })
    : [];
  const validFieldIds = new Set(
    fieldRows
      .map((field) => normalizeEntityId(field.id))
      .filter((fieldId): fieldId is string => Boolean(fieldId)),
  );
  if (fieldIds.length === 0 || fieldIds.some((fieldId) => !validFieldIds.has(fieldId))) {
    throw new EditorInputError("Tryout events require at least one active organization field.");
  }

  const timeSlotIds = normalizeEditorResourceIds(draft.resources.timeSlotIds);
  const timeSlotsById = new Map<
    string,
    EventEditorDraft["resources"]["timeSlots"][number]
  >();
  draft.resources.timeSlots.forEach((slot) => {
    const id = editorTimeSlotId(slot as Record<string, unknown>);
    if (id) {
      timeSlotsById.set(id, slot);
    }
  });
  if (
    timeSlotIds.length === 0
    || timeSlotIds.some((timeSlotId) => !timeSlotsById.has(timeSlotId))
  ) {
    throw new EditorInputError("Tryout events require an assigned time slot.");
  }

  const persistedTimeSlots = await tx.timeSlots.findMany({
    where: { id: { in: timeSlotIds } },
    select: { id: true, archivedAt: true },
  });
  const archivedTimeSlotIds = new Set(
    persistedTimeSlots
      .filter((slot) => Boolean(slot.archivedAt))
      .map((slot) => normalizeEntityId(slot.id))
      .filter((slotId): slotId is string => Boolean(slotId)),
  );
  if (archivedTimeSlotIds.size > 0) {
    throw new EditorInputError(
      "Tryout events require active time slots assigned to active organization fields.",
    );
  }

  const hasValidFiniteTimeSlots = timeSlotIds.length > 0 && timeSlotIds.every((timeSlotId) => {
    const slot = timeSlotsById.get(timeSlotId);
    if (!slot || slot.repeating !== false) {
      return false;
    }
    const slotFieldIds = editorTimeSlotFieldIds(slot as Record<string, unknown>);
    if (slotFieldIds.length === 0 || slotFieldIds.some((fieldId) => !validFieldIds.has(fieldId))) {
      return false;
    }
    try {
      const resolved = resolveOneTimeTimeSlot(slot, slot.timeZone);
      return resolved.end.getTime() > resolved.start.getTime();
    } catch {
      return false;
    }
  });
  if (!hasValidFiniteTimeSlots) {
    throw new EditorInputError(
      "Tryout events require at least one finite time slot assigned to an active organization field.",
    );
  }
};
const assertTournamentTeamCount = (
  draft: EventEditorDraft,
  eventType: string,
): void => {
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
};

type DivisionDetailDraft =
  EventEditorDraft["competition"]["divisionDetails"][number];

const assertTournamentDivisionCount = (
  detail: DivisionDetailDraft,
  divisionLabel: string,
  eventType: string,
): void => {
  if (
    eventType === "TOURNAMENT" &&
    typeof detail.maxParticipants === "number" &&
    detail.maxParticipants < MIN_BRACKET_TEAM_COUNT
  ) {
    throw new EditorInputError(
      `Tournament team count must be at least ${MIN_BRACKET_TEAM_COUNT} for division "${divisionLabel}".`,
    );
  }
};

const assertPlayoffDivisionCount = (
  detail: DivisionDetailDraft,
  divisionLabel: string,
  isBracketCountValidationEnabled: boolean,
): void => {
  if (
    isBracketCountValidationEnabled &&
    typeof detail.playoffTeamCount === "number" &&
    detail.playoffTeamCount < MIN_BRACKET_TEAM_COUNT
  ) {
    throw new EditorInputError(
      `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} for division "${divisionLabel}" when playoffs are enabled.`,
    );
  }
};

const assertDivisionMinimumBracketTeamCounts = (
  draft: EventEditorDraft,
  eventType: string,
  isBracketCountValidationEnabled: boolean,
): void => {
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
    assertTournamentDivisionCount(detail, divisionLabel, eventType);
    assertPlayoffDivisionCount(
      detail,
      divisionLabel,
      isBracketCountValidationEnabled,
    );
  }
};

const assertMinimumBracketTeamCounts = (draft: EventEditorDraft): void => {
  const eventType = draft.basics.eventType.trim().toUpperCase();
  assertTournamentTeamCount(draft, eventType);
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
  assertDivisionMinimumBracketTeamCounts(
    draft,
    eventType,
    isBracketCountValidationEnabled,
  );
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
): EventStaffPutInput => {
  const isTryoutEvent = draft.basics.eventType.trim().toUpperCase() === "TRYOUT";
  const staff = isTryoutEvent
    ? {
        ...draft.staff,
        officialPositions: [],
        eventOfficials: [],
        pendingInvites: draft.staff.pendingInvites
          .map((entry) => ({
            ...entry,
            roles: Array.isArray(entry.roles)
              ? entry.roles.filter((role) => role === "ASSISTANT_HOST")
              : [],
          }))
          .filter((entry) => entry.roles.length > 0),
      }
    : draft.staff;
  return {
    contractVersion: EVENT_STAFF_CONTRACT_VERSION,
    expectedRevision: revision,
    assistantHostIds: staff.assistantHostIds,
    officialPositions: staff.officialPositions.map((position) => ({
      id: position.id,
      name: position.name,
      count: position.count,
      order: position.order,
    })),
    eventOfficials: staff.eventOfficials
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
    pendingInvites: staff.pendingInvites
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
  };
};

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

type RegistrationQuestionDraft =
  EventEditorDraft["registration"]["questions"][number];

const persistRegistrationQuestion = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  question: RegistrationQuestionDraft,
  index: number,
  existingIds: Set<string>,
  actorUserId: string,
  now: Date,
): Promise<{ id: string; clientId: string | null }> => {
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
  return { id, clientId };
};

const deactivateRemovedQuestions = async (
  tx: Prisma.TransactionClient,
  existingRows: QuestionRow[],
  activeIds: Set<string>,
  actorUserId: string,
  now: Date,
): Promise<void> => {
  const inactiveIds = existingRows
    .map((row) => row.id)
    .filter((id) => !activeIds.has(id));
  if (!inactiveIds.length) return;
  await tx.registrationQuestions.updateMany({
    where: { id: { in: inactiveIds } },
    data: { isActive: false, updatedBy: actorUserId, updatedAt: now },
  });
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
    const persisted = await persistRegistrationQuestion(
      tx,
      eventId,
      question,
      index,
      existingIds,
      actorUserId,
      now,
    );
    activeIds.add(persisted.id);
    if (persisted.clientId) questionIdMap[persisted.clientId] = persisted.id;
  }
  await deactivateRemovedQuestions(
    tx,
    existingRows,
    activeIds,
    actorUserId,
    now,
  );
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
    assertBookedEditorResources(snapshot.draft, draft);
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

const numericTimingInput = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

const timingInputsFor = (
  draft: EventEditorDraft,
): Parameters<typeof resolveMatchTimingPolicy>[0] => {
  const matchRulesOverride = draft.competition.matchRulesOverride ?? {};
  return {
    usesSets: draft.competition.usesSets,
    segmentCount: numericTimingInput(matchRulesOverride.segmentCount),
    segmentLengthMinutes: numericTimingInput(
      matchRulesOverride.segmentLengthMinutes,
    ),
    segmentBreakMinutes: numericTimingInput(
      matchRulesOverride.segmentBreakMinutes,
    ),
    setsPerMatch: draft.competition.setsPerMatch,
    setDurationMinutes: draft.competition.setDurationMinutes,
    matchDurationMinutes: draft.competition.matchDurationMinutes,
    restTimeMinutes: draft.competition.restTimeMinutes,
  };
};

const shouldUnpublishCreatedBracketEvent = (
  existingSnapshot: EventEditorSnapshot | null,
  draft: EventEditorDraft,
): boolean =>
  existingSnapshot?.mode === "CREATE" &&
  ["LEAGUE", "TOURNAMENT"].includes(
    draft.basics.eventType.trim().toUpperCase(),
  );

const registrationPaymentModeFor = (
  draft: EventEditorDraft,
): "MANUAL" | "ONLINE" =>
  draft.registration.payment.mode === "MANUAL" ? "MANUAL" : "ONLINE";
const sanitizeNonBracketDivisionDetail = (
  detail: DivisionDetailDraft,
  isTryoutEvent = false,
) => ({
  id: detail.id,
  sourceDivisionId: detail.sourceDivisionId,
  key: detail.key,
  name: detail.name,
  kind: detail.kind,
  divisionTypeId: detail.divisionTypeId,
  skillDivisionTypeId: detail.skillDivisionTypeId,
  ageDivisionTypeId: detail.ageDivisionTypeId,
  divisionTypeName: detail.divisionTypeName,
  ratingType: detail.ratingType,
  gender: detail.gender,
  price: detail.price,
  maxParticipants: detail.maxParticipants,
  allowPaymentPlans: detail.allowPaymentPlans,
  installmentCount: detail.installmentCount,
  installmentDueDates: detail.installmentDueDates,
  installmentDueRelativeDays: detail.installmentDueRelativeDays,
  installmentAmounts: detail.installmentAmounts,
  ageCutoffDate: detail.ageCutoffDate,
  ageCutoffLabel: detail.ageCutoffLabel,
  ageCutoffSource: detail.ageCutoffSource,
  fieldIds: detail.fieldIds,
  teamIds: isTryoutEvent ? [] : detail.teamIds,
  isSystemGenerated: false,
  role: "ENTRY" as const,
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
});

const divisionDetailsForSave = (
  draft: EventEditorDraft,
  isBracketEvent: boolean,
): DivisionDetailDraft[] => {
  if (isBracketEvent) {
    return draft.competition.divisionDetails;
  }
  const isTryoutEvent = draft.basics.eventType.trim().toUpperCase() === "TRYOUT";
  return draft.competition.divisionDetails.map((detail) => (
    sanitizeNonBracketDivisionDetail(detail, isTryoutEvent)
  ));
};
const prepareEventPayloadForSave = async (
  actor: EditorActor,
  draft: EventEditorDraft,
  eventId: string,
  existingSnapshot: EventEditorSnapshot | null,
  resolvedHostId?: string,
) => {
  assertMinimumBracketTeamCounts(draft);
  if (existingSnapshot) {
    await assertPaymentCapability(draft, existingSnapshot);
  }
  const eventType = draft.basics.eventType.trim().toUpperCase();
  const isWeeklyChild = eventType === "WEEKLY_EVENT" && Boolean(draft.basics.parentEvent?.trim());
  if (eventType === "TRYOUT" && draft.schedule.mode !== "FIXED_END") {
    throw new EditorInputError("Tryout events require a Planned End.");
  }
  if (isWeeklyChild && draft.schedule.mode !== "FIXED_END") {
    throw new EditorInputError("Weekly child events require a Planned End.");
  }
  if (eventType === "TRYOUT") {
    const start = parseDateTimeInTimeZone(draft.basics.start, draft.basics.timeZone);
    const end = draft.schedule.mode === "FIXED_END"
      ? parseDateTimeInTimeZone(draft.schedule.endConstraint, draft.basics.timeZone)
      : null;
    if (!start || !end || end.getTime() <= start.getTime()) {
      throw new EditorInputError("Tryout Planned End must be after the event start.");
    }
  }
  const eventPayload = editorDraftToLegacyEvent(draft, eventId);
  const timing = resolveMatchTimingPolicy(timingInputsFor(draft));
  if (
    ["LEAGUE", "TOURNAMENT"].includes(eventType) &&
    typeof draft.competition.matchDurationMinutes === "number" &&
    draft.competition.matchDurationMinutes !== timing.durationMinutes
  ) {
    throw new EditorInputError(
      "matchDurationMinutes is a server-calculated projection of the timing inputs.",
    );
  }
  if (shouldUnpublishCreatedBracketEvent(existingSnapshot, draft)) {
    eventPayload.state = "UNPUBLISHED";
  }
  eventPayload.matchDurationMinutes = ["LEAGUE", "TOURNAMENT"].includes(eventType)
    ? timing.durationMinutes
    : null;
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
  delete eventPayload.sourceTemplateId;
  delete eventPayload.rentalBookingId;
  delete eventPayload.rentalBookingItemId;
  eventPayload.hostId = resolvedHostId ?? draft.basics.hostId ?? actor.userId;
  eventPayload.registrationPaymentMode = registrationPaymentModeFor(draft);
  eventPayload.price = draft.registration.payment.priceCents;
  return eventPayload;
};

type LegacyEditorEventPayload = Record<string, unknown>;

const upsertEditorEvent = async (
  tx: Prisma.TransactionClient,
  draft: EventEditorDraft,
  eventId: string,
  eventPayload: LegacyEditorEventPayload,
): Promise<void> => {
  const isBracketEvent = ['LEAGUE', 'TOURNAMENT'].includes(
    draft.basics.eventType.trim().toUpperCase(),
  );
  try {
    assertEventRegistrationConfiguration(draft.basics.eventType, draft.basics.affiliateUrl);
    await upsertEventFromPayload(
      {
        ...eventPayload,
        id: eventId,
        fieldIds: draft.resources.fieldIds,
        timeSlotIds: draft.resources.timeSlotIds,
        fields: draft.resources.fields,
        timeSlots: draft.resources.timeSlots,
        divisionDetails: divisionDetailsForSave(draft, isBracketEvent),
        playoffDivisionDetails: isBracketEvent
          ? draft.competition.playoffDivisionDetails
          : [],
        divisionFieldIds: isBracketEvent ? draft.competition.divisionFieldIds : {},
        tags: draft.basics.tags,
      },
      tx,
      { preserveOperationalState: true, preserveStaffState: true },
    );
  } catch (error) {
    if (error instanceof EventDivisionNameValidationError || error instanceof EventRegistrationConfigurationError) {
      throw new EditorInputError(error.message);
    }
    throw error;
  }
};

const reconcileEditorStaff = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  draft: EventEditorDraft,
  eventId: string,
  existingSnapshot: EventEditorSnapshot | null,
  resolvedHostId?: string,
) => {
  const staffRevision =
    existingSnapshot?.staffRevision ??
    (await loadEventEditorSnapshot(eventId, { actor, client: tx })).staffRevision;
  const staffDraft =
    resolvedHostId && draft.basics.hostId !== resolvedHostId
      ? {
          ...draft,
          basics: { ...draft.basics, hostId: resolvedHostId },
        }
      : draft;
  try {
    return await reconcileEventStaffDesiredState(
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
  const eventPayload = await prepareEventPayloadForSave(
    actor,
    draft,
    eventId,
    existingSnapshot,
    resolvedHostId,
  );
  await acquireFieldLocks(tx, draft.resources.fieldIds);
  await acquireTimeSlotLocks(tx, draft.resources.timeSlotIds);
  if (draft.basics.eventType.trim().toUpperCase() === "TRYOUT") {
    await assertTryoutResourceAssignments(tx, draft);
  }
  const rentalResourceIds = rentalResourceIdsForDraft(draft);
  await acquireRentalBookingLocks(
    tx,
    rentalResourceIds.bookingIds,
    rentalResourceIds.bookingItemIds,
  );
  await assertRentalBookingAuthority(tx, draft, actor);
  await upsertEditorEvent(tx, draft, eventId, eventPayload);
  const questionIdMap = await reconcileQuestions(
    tx,
    eventId,
    draft,
    actor.userId,
  );
  const staffResult = await reconcileEditorStaff(
    tx,
    actor,
    draft,
    eventId,
    existingSnapshot,
    resolvedHostId,
  );
  return { questionIdMap, emailCandidates: staffResult.emailCandidates };
};
type SaveTransactionResult = {
  questionIdMap: Record<string, string>;
  emailCandidates: unknown[];
  savedSnapshot: EventEditorSnapshot | null;
  scheduleOutcome: EventEditorScheduleOutcome;
  scheduleGraph: EventEditorSaveResult["graph"];
  scheduleNotification: MatchScheduleNotificationPlan | null;
};

const assertSaveHostTransition = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  currentEvent: Parameters<typeof assertEventHostTransition>[0]["event"],
  requestedHostId: string | null,
): Promise<void> => {
  const currentHostId = currentEvent.hostId?.trim() || null;
  const nextHostId = requestedHostId?.trim() || null;
  if (currentHostId === nextHostId) return;
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
};

const teamSignupForDraft = (draft: EventEditorDraft): boolean => {
  const eventType = draft.basics.eventType.trim().toUpperCase();
  return typeof draft.participation?.teamSignup === "boolean"
    ? draft.participation.teamSignup
    : eventType === "LEAGUE" || eventType === "TOURNAMENT";
};

const assertSaveSnapshot = (
  command: SaveEventEditorCommand,
  draft: EventEditorDraft,
  eventId: string,
  currentSnapshot: EventEditorSnapshot,
): string => {
  assertEventTypeRegistrationUnit(
    draft.basics.eventType,
    teamSignupForDraft(draft),
  );
  assertImmutableFields(draft, eventId, currentSnapshot);
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
  const nextEventType = draft.basics.eventType.trim().toUpperCase();
  const eventTypeChanged = currentEventType !== nextEventType;
  const transition = command.scheduleTransition;
  if (!eventTypeChanged && transition.mode === "RECONCILE") {
    throw new EditorScheduleIntentError(
      "Schedule reconciliation requires an event-type change.",
    );
  }
  if (
    transition.mode === "RECONCILE" &&
    transition.expectedScheduleRevision !== currentSnapshot.scheduleState.revision
  ) {
    throw new EventScheduleRevisionConflictError(
      currentSnapshot.scheduleState.revision,
    );
  }
  return nextEventType;
};

type SaveScheduleMode = "BUILD" | "REBUILD" | "DELETE";

const scheduleModeFor = (
  eventType: string,
  currentSnapshot: EventEditorSnapshot,
): SaveScheduleMode =>
  ["LEAGUE", "TOURNAMENT"].includes(eventType)
    ? currentSnapshot.scheduleState.matchCount > 0
      ? "REBUILD"
      : "BUILD"
    : "DELETE";

const reconcileSaveSchedule = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  transition: SaveEventEditorCommand["scheduleTransition"],
  nextEventType: string,
  currentSnapshot: EventEditorSnapshot,
): Promise<{
  scheduleOutcome: EventEditorScheduleOutcome;
  scheduleGraph: EventEditorSaveResult["graph"];
  scheduleNotification: MatchScheduleNotificationPlan | null;
}> => {
  if (transition.mode !== "RECONCILE") {
    return {
      scheduleOutcome: {
        status: "NOT_REQUESTED",
        matchCount: currentSnapshot.scheduleState.matchCount,
        warnings: [],
      },
      scheduleGraph: undefined,
      scheduleNotification: null,
    };
  }
  const scheduleMode = scheduleModeFor(nextEventType, currentSnapshot);
  const mutation = await reconcileEventSchedule({
    tx,
    eventId,
    mode: scheduleMode,
    includePlaceholderTeams: true,
  });
  if (scheduleMode === "DELETE") {
    return {
      scheduleOutcome: {
        status: "DELETED",
        matchCount: 0,
        matches: [],
        warnings: [],
      },
      scheduleGraph: undefined,
      scheduleNotification: mutation.notification,
    };
  }
  return {
    scheduleOutcome: {
      status: scheduleMode === "REBUILD" ? "REBUILT" : "BUILT",
      matchCount: mutation.matches.length,
      matches: editorMatchProjectionsFor(
        mutation.matches,
        mutation.event.officialPositions,
        mutation.event.eventType,
      ),
      warnings: mutation.warnings,
    },
    scheduleGraph: {
      event: serializeEvent(mutation.event),
      matches: serializeMatches(
        mutation.matches,
        mutation.event.officialPositions,
        mutation.event.eventType,
      ),
    },
    scheduleNotification: mutation.notification,
  };
};

const saveEventEditorWithinTransaction = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  command: SaveEventEditorCommand,
  eventId: string,
): Promise<SaveTransactionResult> => {
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
  const requestedHostId =
    typeof command.draft.basics.hostId === "string"
      ? command.draft.basics.hostId
      : null;
  await assertSaveHostTransition(
    tx,
    actor,
    currentEvent as Parameters<typeof assertEventHostTransition>[0]["event"],
    requestedHostId,
  );
  const currentSnapshot = await buildEventEditorSnapshot(
    currentEvent as unknown as Record<string, unknown>,
    { client: tx, actor, mode: "EDIT" },
  );
  const nextEventType = assertSaveSnapshot(
    command,
    command.draft,
    eventId,
    currentSnapshot,
  );
  const { questionIdMap, emailCandidates } = await saveWithinTransaction(
    tx,
    actor,
    command.draft,
    eventId,
    currentSnapshot,
  );
  const schedule = await reconcileSaveSchedule(
    tx,
    eventId,
    command.scheduleTransition,
    nextEventType,
    currentSnapshot,
  );
  const savedSnapshot = await loadEventEditorSnapshot(eventId, {
    actor,
    client: tx,
  });
  return {
    questionIdMap,
    emailCandidates,
    savedSnapshot,
    ...schedule,
  };
};

const notifyScheduleAfterSave = async (
  notification: MatchScheduleNotificationPlan | null,
  options: EditorSaveOptions,
): Promise<void> => {
  if (!notification || !options.onScheduleChanged) return;
  try {
    await options.onScheduleChanged(notification);
  } catch (error) {
    console.error(
      "[event-editor] schedule notification failed after save",
      error,
    );
  }
};

const sendSaveStaffInvites = async (
  emailCandidates: unknown[],
  eventId: string,
  options: EditorSaveOptions,
): Promise<EventEditorSaveResult["staffEmailDelivery"]> => {
  if (!emailCandidates.length || !options.sendStaffInvites) {
    return "NOT_REQUESTED";
  }
  return options.sendStaffInvites(emailCandidates, eventId);
};

export const saveEventEditor = async (
  actor: EditorActor,
  command: SaveEventEditorCommand,
  eventId: string,
  options: EditorSaveOptions = {},
): Promise<EventEditorSaveResult> => {
  const client = options.client ?? prisma;
  const transactionResult = await client.$transaction(
    (tx: Prisma.TransactionClient) =>
      saveEventEditorWithinTransaction(tx, actor, command, eventId),
  );
  await notifyScheduleAfterSave(
    transactionResult.scheduleNotification,
    options,
  );
  const staffEmailDelivery = await sendSaveStaffInvites(
    transactionResult.emailCandidates,
    eventId,
    options,
  );
  const snapshot =
    transactionResult.savedSnapshot ??
    (await loadEventEditorSnapshot(eventId, { actor, client }));
  return {
    status: "SAVED",
    snapshot,
    questionIdMap: transactionResult.questionIdMap,
    staffEmailDelivery,
    scheduleOutcome: transactionResult.scheduleOutcome,
    graph: transactionResult.scheduleGraph,
  };
};

const draftOrganizationId = (draft: EventEditorDraft): string | null =>
  draft.basics.organizationId?.trim() || null;
const assertUnscopedCreateAccess = (
  actor: EditorActor,
  requestedHostId: string | null,
): string => {
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
};

const assertOrganizationEventFeature = (
  organization: {
    enabledFeatures: string[];
  },
  draft: EventEditorDraft,
): void => {
  const requiredFeature =
    draft.basics.eventType.toUpperCase() === "TRYOUT"
      ? "CLUB_TEAMS"
      : "EVENT_MANAGEMENT";
  if (!organization.enabledFeatures.includes(requiredFeature)) {
    throw new EditorCapabilityError(
      "Enable event management tools before creating events.",
    );
  }
};

const assertOrganizationCreateAccess = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  draft: EventEditorDraft,
  organizationId: string,
  requestedHostId: string | null,
): Promise<string> => {
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
  assertOrganizationEventFeature(organization, draft);
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

const assertCreateAccess = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  draft: EventEditorDraft,
): Promise<string> => {
  const organizationId = draftOrganizationId(draft);
  const requestedHostId = normalizeEntityId(draft.basics.hostId);
  if (!organizationId) {
    return assertUnscopedCreateAccess(actor, requestedHostId);
  }
  return assertOrganizationCreateAccess(
    tx,
    actor,
    draft,
    organizationId,
    requestedHostId,
  );
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
      [draft.resources.sourceTemplateId]
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

const assertOriginalStaffingAssignments = (
  graph: EventEditorCreateProposal["graph"],
): void => {
  const divisionDetails = [
    ...graph.event.divisionDetails,
    ...graph.event.playoffDivisionDetails,
  ];
  const officialPositionIds = new Set([
    ...graph.event.officialPositions.map((position) => position.id),
    ...divisionDetails.flatMap((division) =>
      Object.values(division.phaseSettings).flatMap(
        (settings) => settings.officialPositions?.map((position) => position.id) ?? [],
      ),
    ),
  ]);
  const officialIds = new Set(graph.event.officials.map((official) => official.id));
  const eventOfficialIds = new Set(
    graph.event.eventOfficials.map((official) => official.id),
  );
  const knownOfficialUserIds = new Set([
    ...officialIds,
    ...graph.event.eventOfficials.map((official) => official.userId),
  ]);
  const knownPlayerIds = new Set(
    graph.event.teams.flatMap((team) => [
      ...team.playerIds,
      ...team.players.map((player) => player.id),
      ...team.playerRegistrations.map((registration) => registration.userId),
    ]),
  );

  graph.matches.forEach((match) => {
    const label = `Match ${match.id}`;
    match.officialAssignments.forEach((assignment, index) => {
      const holderType = assignment.holderType.trim().toUpperCase();
      if (holderType !== "OFFICIAL" && holderType !== "PLAYER") {
        throw new EventScheduleProposalGraphError(
          `${label} has an unsupported officiating holder at slot ${index + 1}.`,
        );
      }
      if (!officialPositionIds.has(assignment.positionId)) {
        throw new EventScheduleProposalGraphError(
          `${label} officiating position at slot ${index + 1} ${assignment.positionId} is not present in the proposal.`,
        );
      }
      const knownHolderIds =
        holderType === "PLAYER" ? knownPlayerIds : knownOfficialUserIds;
      if (assignment.userId !== null && !knownHolderIds.has(assignment.userId)) {
        throw new EventScheduleProposalGraphError(
          `${label} ${holderType === "PLAYER" ? "player" : "official"} at slot ${index + 1} ${assignment.userId} is not present in the proposal.`,
        );
      }
      if (
        assignment.eventOfficialId !== null
        && !eventOfficialIds.has(assignment.eventOfficialId)
      ) {
        throw new EventScheduleProposalGraphError(
          `${label} event official at slot ${index + 1} ${assignment.eventOfficialId} is not present in the proposal.`,
        );
      }
      if (holderType === "PLAYER" && assignment.eventOfficialId !== null) {
        throw new EventScheduleProposalGraphError(
          `${label} player assignment has an event official at slot ${index + 1}.`,
        );
      }
      if (assignment.userId !== null && assignment.eventOfficialId !== null) {
        const eventOfficial = graph.event.eventOfficials.find(
          (candidate) => candidate.id === assignment.eventOfficialId,
        );
        if (eventOfficial?.userId !== assignment.userId) {
          throw new EventScheduleProposalGraphError(
            `${label} event official does not match its user at slot ${index + 1}.`,
          );
        }
      }
    });
  });
};

const graphForProposalValidation = (
  graph: EventEditorCreateProposal["graph"],
  staffingPriority: unknown,
): EventEditorCreateProposal["graph"] => {
  const policy = isStaffingPriority(staffingPriority)
    ? getStaffingPriorityPolicy(staffingPriority)
    : null;
  const relaxTeamCoverage = policy !== null
    && !policy.isHardTeamCoverageRequired;
  const relaxOfficialCoverage = policy !== null
    && !policy.isHardOfficialCoverageRequired;
  if (!relaxTeamCoverage && !relaxOfficialCoverage) return graph;
  if (relaxOfficialCoverage) {
    assertOriginalStaffingAssignments(graph);
  }

  const relaxedOfficialPositions = (
    positions: typeof graph.event.officialPositions,
  ) => positions.map((position) => ({ ...position, count: 0 }));
  const relaxedDivisionDetails = (
    details: typeof graph.event.divisionDetails,
  ) => details.map((division) => ({
    ...division,
    phaseSettings: Object.fromEntries(
      Object.entries(division.phaseSettings).map(([phase, settings]) => [
        phase,
        {
          ...settings,
          ...(relaxTeamCoverage ? { doTeamsOfficiate: false } : {}),
          ...(relaxOfficialCoverage && settings.officialPositions
            ? { officialPositions: relaxedOfficialPositions(settings.officialPositions) }
            : {}),
        },
      ]),
    ),
  }));
  const relaxedAssignments = (
    assignments: typeof graph.matches[number]["officialAssignments"],
  ) => assignments.filter((assignment) => {
    const holderType = assignment.holderType.trim().toUpperCase();
    const isUnresolvedSlot =
      (holderType === "OFFICIAL" || holderType === "PLAYER")
      && !assignment.userId
      && !assignment.eventOfficialId;
    return !isUnresolvedSlot;
  });

  return {
    ...graph,
    event: {
      ...graph.event,
      ...(relaxTeamCoverage ? { doTeamsOfficiate: false } : {}),
      ...(relaxOfficialCoverage
        ? {
            officialPositions: relaxedOfficialPositions(graph.event.officialPositions),
            divisionDetails: relaxedDivisionDetails(graph.event.divisionDetails),
            playoffDivisionDetails: relaxedDivisionDetails(graph.event.playoffDivisionDetails),
          }
        : relaxTeamCoverage
          ? {
              divisionDetails: relaxedDivisionDetails(graph.event.divisionDetails),
              playoffDivisionDetails: relaxedDivisionDetails(graph.event.playoffDivisionDetails),
            }
          : {}),
    },
    matches: relaxOfficialCoverage
      ? graph.matches.map((match) => ({
          ...match,
          officialAssignments: relaxedAssignments(match.officialAssignments),
        }))
      : graph.matches,
  };
};

const validateProposalGraphForPolicy = (
  eventId: string,
  graph: EventEditorCreateProposal["graph"],
  staffingPriority: unknown,
): EventEditorCreateProposal["graph"] => {
  try {
    validateAndNormalizeSerializedGraph(
      eventId,
      graphForProposalValidation(graph, staffingPriority),
    );
  } catch (error) {
    if (error instanceof EventScheduleProposalGraphError) {
      throw new EventEditorProposalInvalidError(error.message);
    }
    throw error;
  }
  return graph;
};
type EditorScheduleGraph = {
  event: Parameters<typeof serializeEvent>[0];
  matches: Parameters<typeof serializeMatches>[0];
};

type CreateScheduleState = {
  scheduleOutcome: EventEditorScheduleOutcome;
  scheduleNotification: MatchScheduleNotificationPlan | null;
  proposalGraph: EditorScheduleGraph | null;
};

const createDefaultScheduleState = (): CreateScheduleState => ({
  scheduleOutcome: {
    status: "NOT_REQUESTED",
    matchCount: 0,
    warnings: [],
  },
  scheduleNotification: null,
  proposalGraph: null,
});

const persistCreateOnlySchedule = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  eventType: string,
): Promise<CreateScheduleState> => {
  if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
    return createDefaultScheduleState();
  }
  const graph = await persistCreateOnlyMatchGraph({
    tx,
    eventId,
    includePlaceholderTeams: true,
  });
  const proposalGraph: EditorScheduleGraph = {
    event: graph.event,
    matches: graph.matches,
  };
  return {
    scheduleOutcome: {
      status: "NOT_REQUESTED",
      matchCount: graph.matches.length,
      matches: editorMatchProjectionsFor(
        graph.matches,
        graph.event.officialPositions,
        graph.event.eventType,
      ),
      warnings: [],
    },
    scheduleNotification: null,
    proposalGraph,
  };
};
type PartialPlacementFailure = {
  matchId: string;
  message: string;
  restrictingFactor: NonNullable<
    EventEditorScheduleWarning["restrictingFactor"]
  >;
  evidence?: import("@/server/scheduler/scheduleDiagnostics").ScheduleDiagnosticEvidence[];
  candidateCount?: number;
  searchExhaustive?: boolean;
};

const recordsFromUnknown = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

const stringOrNullFromUnknown = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const eventRecordFor = (event: unknown): Record<string, unknown> =>
  event && typeof event === "object" && !Array.isArray(event)
    ? (event as Record<string, unknown>)
    : {};

const phaseDetailRecordsFor = (event: unknown): Record<string, unknown>[] => {
  const eventRecord = eventRecordFor(event);
  return [
    ...recordsFromUnknown(eventRecord.divisionDetails),
    ...recordsFromUnknown(eventRecord.playoffDivisionDetails),
    ...recordsFromUnknown(eventRecord.divisions),
    ...recordsFromUnknown(eventRecord.playoffDivisions),
  ];
};

const phaseRoleFor = (detail: Record<string, unknown> | undefined): string =>
  String(detail?.role ?? "").trim().toUpperCase();

const shouldPreferPhaseDetail = (
  existing: Record<string, unknown> | undefined,
  candidate: Record<string, unknown>,
): boolean =>
  !existing
  || (phaseRoleFor(candidate) === "PHASE" && phaseRoleFor(existing) !== "PHASE");

const phaseDetailsByIdFor = (event: unknown): Map<string, Record<string, unknown>> => {
  const byId = new Map<string, Record<string, unknown>>();
  for (const detail of phaseDetailRecordsFor(event)) {
    const id = stringOrNullFromUnknown(detail.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (shouldPreferPhaseDetail(existing, detail)) {
      byId.set(id, detail);
    }
  }
  return byId;
};

const partialUnscheduledMatchesFor = (
  projections: EventEditorMatchProjection[],
): EventEditorUnscheduledMatch[] =>
  projections
    .filter((match) => match.placementState === "UNPLACED")
    .map((match) => {
      if (!match.phaseDivisionId || !match.phase) {
        throw new EventScheduleMutationError(
          "EDITOR_SCHEDULE_INPUT_INVALID",
          `Unplaced Match ${match.id} is missing its Competition Phase identity.`,
        );
      }
      return {
        id: match.id,
        matchId: match.matchId,
        phaseDivisionId: match.phaseDivisionId,
        phase: match.phase,
        sourceDivisionId: match.sourceDivisionId,
      };
    });

const partialAffectedPhasesFor = (
  event: unknown,
  unscheduledMatches: EventEditorUnscheduledMatch[],
): EventEditorAffectedCompetitionPhase[] => {
  const detailsById = phaseDetailsByIdFor(event);
  const phasesById = new Map<string, EventEditorAffectedCompetitionPhase>();
  for (const match of unscheduledMatches) {
    const detail = detailsById.get(match.phaseDivisionId);
    const phase = stringOrNullFromUnknown(detail?.phase) ?? match.phase;
    const sourceDivisionId =
      stringOrNullFromUnknown(detail?.sourceDivisionId)
      ?? match.sourceDivisionId;
    const phaseRecord = {
      id: match.phaseDivisionId,
      name: stringOrNullFromUnknown(detail?.name)
        ?? "Competition Phase details unavailable",
      phase,
      sourceDivisionId,
    };
    const existing = phasesById.get(phaseRecord.id);
    if (
      existing
      && (
        existing.name !== phaseRecord.name
        || existing.phase !== phaseRecord.phase
        || existing.sourceDivisionId !== phaseRecord.sourceDivisionId
      )
    ) {
      throw new EventScheduleMutationError(
        "EDITOR_SCHEDULE_INPUT_INVALID",
        `Unplaced matches disagree about Competition Phase ${phaseRecord.id}.`,
      );
    }
    phasesById.set(phaseRecord.id, phaseRecord);
  }
  return Array.from(phasesById.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
};


const placementFailureWarningsFor = (
  failures: readonly PartialPlacementFailure[],
): EventEditorScheduleWarning[] =>
  failures.map((failure) => ({
    code: "SCHEDULE_PLACEMENT_FAILED",
    message: failure.message,
    matchIds: [failure.matchId],
    restrictingFactor: failure.restrictingFactor,
  }));

const createBuildScheduleOutcomeFor = (params: {
  event: unknown;
  matches: Parameters<typeof editorMatchProjectionsFor>[0];
  projections: EventEditorMatchProjection[];
  warnings: EventEditorScheduleWarning[];
  diagnostics?: EventEditorScheduleDiagnostics;
  placementFailures: readonly PartialPlacementFailure[];
}): EventEditorScheduleOutcome => {
  const placementStates = params.matches.map((match, index) => {
    const rawState = (
      match && typeof match === "object"
        ? (match as { placementState?: unknown }).placementState
        : undefined
    );
    const projectionState = params.projections[index]?.placementState;
    const state = String(rawState ?? projectionState ?? "").trim().toUpperCase();
    if (state !== "PLACED" && state !== "UNPLACED") {
      throw new EventScheduleMutationError(
        "EDITOR_SCHEDULE_INPUT_INVALID",
        `Match Graph node ${params.projections[index]?.id ?? index + 1} has an invalid placement state.`,
      );
    }
    return state;
  });
  const unplacedProjections = params.projections.filter(
    (_, index) => placementStates[index] === "UNPLACED",
  );
  const placedMatchCount = placementStates.filter(
    (state) => state === "PLACED",
  ).length;
  if (unplacedProjections.length === 0) {
    return {
      status: "BUILT",
      matchCount: params.projections.length,
      matches: params.projections,
      diagnostics: params.diagnostics,
      warnings: params.warnings,
    };
  }
  const unscheduledMatches = partialUnscheduledMatchesFor(unplacedProjections);
  return {
    status: "PARTIAL",
    isComplete: false,
    matchCount: params.projections.length,
    placedMatchCount,
    unplacedMatchCount: unplacedProjections.length,
    matches: params.projections,
    unscheduledMatches,
    affectedCompetitionPhases: partialAffectedPhasesFor(
      params.event,
      unscheduledMatches,
    ),
    diagnostics: params.diagnostics,
    warnings: [
      ...params.warnings,
      ...placementFailureWarningsFor(params.placementFailures),
    ],
  };
};


const persistCreateBuildSchedule = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  eventType: string,
): Promise<CreateScheduleState> => {
  if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
    throw new EditorScheduleIntentError(
      "Create-and-build is only supported for League and Tournament events.",
    );
  }
  const mutation = await reconcileEventSchedule({
    tx,
    eventId,
    mode: "BUILD",
    includePlaceholderTeams: true,
    allowPartialPlacement: true,
  });
  if (mutation.matches.length === 0) {
    throw new EventScheduleMutationError(
      "EDITOR_SCHEDULE_INPUT_INVALID",
      "The scheduler did not produce any matches.",
    );
  }
  const projections = editorMatchProjectionsFor(
    mutation.matches,
    mutation.event.officialPositions,
    mutation.event.eventType,
  );
  return {
    scheduleOutcome: createBuildScheduleOutcomeFor({
      event: mutation.event,
      matches: mutation.matches,
      projections,
      warnings: mutation.warnings ?? [],
      diagnostics: mutation.diagnostics,
      placementFailures: mutation.placementFailures ?? [],
    }),
    scheduleNotification: mutation.notification,
    proposalGraph: {
      event: mutation.event,
      matches: mutation.matches,
    },
  };
};

const createScheduleForCompletion = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  command: CreateEventEditorCommand,
): Promise<CreateScheduleState> => {
  const eventType = command.draft.basics.eventType.trim().toUpperCase();
  if (command.completion.mode === "CREATE_ONLY") {
    return persistCreateOnlySchedule(tx, eventId, eventType);
  }
  if (command.completion.mode === "CREATE_AND_BUILD_SCHEDULE") {
    return persistCreateBuildSchedule(tx, eventId, eventType);
  }
  return createDefaultScheduleState();
};

const acquireCreateLocks = async (
  tx: Prisma.TransactionClient,
  command: CreateEventEditorCommand,
  eventId: string,
  includeResourceLocks: boolean,
): Promise<void> => {
  await acquireEventLock(tx, eventId);
  if (!includeResourceLocks) return;
  await acquireEventTemplateLocks(
    tx,
    templateIdsForDraft(command.draft),
  );
  const resourceIds = revisionBindingResourceIds(command.draft);
  await acquireFieldLocks(tx, resourceIds.fieldIds);
  await acquireTimeSlotLocks(tx, resourceIds.timeSlotIds);
  const rentalResourceIds = rentalResourceIdsForDraft(command.draft);
  await acquireRentalBookingLocks(
    tx,
    rentalResourceIds.bookingIds,
    rentalResourceIds.bookingItemIds,
  );
};

const createBootstrapQueryFor = (
  command: CreateEventEditorCommand,
  organizationId: string | null,
): EventEditorBootstrapQuery => ({
  organizationId: organizationId ?? undefined,
  eventType: command.draft.basics.eventType,
  sportId: command.draft.basics.sportIds[0],
  parentEventId: command.draft.basics.parentEvent ?? undefined,
  templateId: command.draft.resources.sourceTemplateId ??
    (command.contractVersion < 5 ? command.draft.resources.requiredTemplateIds[0] : undefined),
  rentalBookingId: command.draft.resources.rentalBookingId ?? undefined,
  start: command.draft.basics.start,
});

const assertCreateSnapshot = async (
  command: CreateEventEditorCommand,
  createSnapshot: EventEditorSnapshot,
  eventId: string,
): Promise<void> => {
  if (
    command.expectedRevisions.editorRevision !==
      createSnapshot.editorRevision ||
    command.expectedRevisions.staffRevision !== createSnapshot.staffRevision ||
    command.expectedRevisions.scheduleRevision !==
      createSnapshot.scheduleState.revision
  ) {
    throw new EditorRevisionConflictError(
      createSnapshot.editorRevision,
      createSnapshot.staffRevision,
      createSnapshot.scheduleState.revision,
    );
  }
  assertEventTypeRegistrationUnit(
    command.draft.basics.eventType,
    teamSignupForDraft(command.draft),
  );
  await assertPaymentCapability(command.draft, createSnapshot);
  assertImmutableFields(command.draft, eventId, createSnapshot);
};

const createProposalRevisionBindingFor = async (
  tx: Prisma.TransactionClient,
  command: CreateEventEditorCommand,
  createSnapshot: EventEditorSnapshot,
  shouldReturnScheduleProposal: boolean | undefined,
): Promise<EventEditorRevisionBinding | null> => {
  if (!shouldReturnScheduleProposal) return null;
  const bindingSnapshot = {
    ...createSnapshot,
    draft: {
      ...createSnapshot.draft,
      basics: command.draft.basics,
      schedule: command.draft.schedule,
      resources: command.draft.resources,
    },
  } as EventEditorSnapshot;
  return revisionBindingFor(
    bindingSnapshot,
    command.expectedRevisions,
    tx,
  );
};

type CreateTransactionCommit = {
  firstClaimResult: EventEditorCreateResult;
  emailCandidates: unknown[];
  scheduleNotification: MatchScheduleNotificationPlan | null;
  claimToken: Date;
};

const createProposalForTransaction = (params: {
  command: CreateEventEditorCommand;
  eventId: string;
  createSnapshot: EventEditorSnapshot;
  proposalRevisionBinding: EventEditorRevisionBinding | null;
  schedule: CreateScheduleState;
}): EventEditorCreateProposal => {
  const scheduleOutcome = params.schedule.scheduleOutcome;
  const proposalScheduleOutcome =
    scheduleOutcome.status === "BUILT" || scheduleOutcome.status === "REBUILT"
      ? {
          ...scheduleOutcome,
          status: "BUILT" as const,
        }
      : scheduleOutcome.status === "PARTIAL"
        ? scheduleOutcome
        : null;
  if (
    !proposalScheduleOutcome
    || !params.schedule.proposalGraph
    || params.schedule.proposalGraph.matches.length === 0
  ) {
    throw new EditorScheduleIntentError(
      "A schedule proposal requires a generated schedule graph.",
    );
  }
  if (!params.proposalRevisionBinding) {
    throw new Error("The schedule proposal revision was not captured.");
  }
  const proposalSnapshot: EventEditorSnapshot = {
    ...params.createSnapshot,
    contractVersion: params.command.contractVersion,
    mode: "CREATE",
    eventId: null,
    draft: params.command.draft,
  };
  const proposal = scheduleProposalFor({
    command: params.command,
    eventId: params.eventId,
    snapshot: proposalSnapshot,
    revisionBinding: params.proposalRevisionBinding,
    event: params.schedule.proposalGraph.event,
    matches: params.schedule.proposalGraph.matches,
    scheduleOutcome: proposalScheduleOutcome,
  });
  validateProposalGraphForPolicy(
    params.eventId,
    proposal.graph,
    proposal.graph.event.staffingPriority,
  );
  return proposal;
};

const createResultForTransaction = (params: {
  command: CreateEventEditorCommand;
  snapshot: EventEditorSnapshot;
  questionIdMap: Record<string, string>;
  schedule: CreateScheduleState;
}): EventEditorCreateResult => ({
  status: "SAVED",
  createOperationId: params.command.createOperationId,
  editorRevision: params.snapshot.editorRevision,
  staffRevision: params.snapshot.staffRevision,
  scheduleRevision: params.snapshot.scheduleState.revision,
  snapshot: params.snapshot,
  questionIdMap: params.questionIdMap,
  staffEmailDelivery: "NOT_REQUESTED",
  scheduleOutcome: params.schedule.scheduleOutcome,
  ...(params.schedule.proposalGraph
    ? {
        graph: {
          event: serializeEvent(params.schedule.proposalGraph.event),
          matches: serializeMatches(
            params.schedule.proposalGraph.matches,
            params.schedule.proposalGraph.event.officialPositions,
            params.schedule.proposalGraph.event.eventType,
          ),
        },
      }
    : {}),
});

const persistCreatedEventWithinTransaction = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: CreateEventEditorOptions,
  claimed: EventCreateOperationClaim,
): Promise<CreateTransactionCommit> => {
  const organizationId = draftOrganizationId(command.draft);
  const resolvedCreateHostId = await assertCreateAccess(
    tx,
    actor,
    command.draft,
  );
  const createQuery = createBootstrapQueryFor(command, organizationId);
  await acquireCreateLocks(
    tx,
    command,
    claimed.eventId,
    Boolean(options.shouldReturnScheduleProposal),
  );
  const createSnapshot = await loadCreateEventEditorSnapshot(createQuery, {
    actor,
    client: tx,
  });
  await assertCreateSnapshot(command, createSnapshot, claimed.eventId);
  const proposalRevisionBinding = await createProposalRevisionBindingFor(
    tx,
    command,
    createSnapshot,
    options.shouldReturnScheduleProposal,
  );
  const { questionIdMap, emailCandidates } = await saveWithinTransaction(
    tx,
    actor,
    command.draft,
    claimed.eventId,
    createSnapshot,
    resolvedCreateHostId,
  );
  const schedule = await createScheduleForCompletion(tx, claimed.eventId, command);
  const snapshot = await loadEventEditorSnapshot(claimed.eventId, {
    actor,
    client: tx,
  });
  if (options.shouldReturnScheduleProposal) {
    throw new EventEditorCreateProposalRollback(
      createProposalForTransaction({
        command,
        eventId: claimed.eventId,
        createSnapshot,
        proposalRevisionBinding,
        schedule,
      }),
    );
  }
  const firstClaimResult = createResultForTransaction({
    command,
    snapshot,
    questionIdMap,
    schedule,
  });
  // Keep the receipt non-replayable until all post-commit hooks finish.
  // The canonical domain result is already durable for recovery.
  const claimToken = await completeEventEditorCreateOperation({
    client: tx,
    createOperationId: command.createOperationId,
    claimToken: claimed.claimToken,
    result: firstClaimResult,
    emailDelivery: "PROCESSING",
  });
  return {
    firstClaimResult,
    emailCandidates,
    scheduleNotification: schedule.scheduleNotification,
    claimToken,
  };
};

type CreateTransactionState = {
  claim: EventCreateOperationClaim | null;
  firstClaimResult: EventEditorCreateResult | null;
  emailCandidates: unknown[];
  scheduleNotification: MatchScheduleNotificationPlan | null;
  claimToken: Date | null;
};

const runCreateTransaction = async (
  client: EditorSnapshotClient,
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: CreateEventEditorOptions,
  requestHash: string,
): Promise<CreateTransactionState> => {
  const state: CreateTransactionState = {
    claim: null,
    firstClaimResult: null,
    emailCandidates: [],
    scheduleNotification: null,
    claimToken: null,
  };
  await client.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed =
      options.preclaimedOperation ??
      (await claimEventEditorCreateOperation({
        client: tx,
        createOperationId: command.createOperationId,
        actorUserId: actor.userId,
        requestHash,
      }));
    state.claim = claimed;
    if (!claimed.firstClaim) return;
    const committed = await persistCreatedEventWithinTransaction(
      tx,
      actor,
      command,
      options,
      claimed,
    );
    state.firstClaimResult = committed.firstClaimResult;
    state.emailCandidates = committed.emailCandidates;
    state.scheduleNotification = committed.scheduleNotification;
    state.claimToken = committed.claimToken;
  });
  return state;
};

const cleanupPreclaimedCreateOperation = async (
  client: EditorSnapshotClient,
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: CreateEventEditorOptions,
  requestHash: string,
  cleanupMessage = "[event-editor] proposal operation cleanup failed",
): Promise<void> => {
  const claimToken = options.preclaimedOperation?.firstClaim === true
    ? options.preclaimedOperation.claimToken
    : null;
  if (!claimToken) return;
  try {
    await deleteEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: actor.userId,
      requestHash,
      claimToken,
    });
  } catch (cleanupError) {
    console.error(
      cleanupMessage,
      cleanupError,
    );
  }
};

const handleCreateTransactionError = async (
  error: unknown,
  client: EditorSnapshotClient,
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: CreateEventEditorOptions,
  requestHash: string,
): Promise<EventEditorCreateProposal> => {
  const ownsPreclaimedOperation =
    options.preclaimedOperation?.firstClaim === true;
  if (error instanceof EventEditorCreateProposalRollback) {
    const preclaimedClaim = options.preclaimedOperation;
    if (!preclaimedClaim?.firstClaim) throw error;
    try {
      await completeEventEditorCreateProposal({
        client,
        createOperationId: command.createOperationId,
        claimToken: preclaimedClaim.claimToken,
        proposal: error.proposal,
      });
      return error.proposal;
    } catch (completionError) {
      if (ownsPreclaimedOperation) {
        await cleanupPreclaimedCreateOperation(
          client,
          actor,
          command,
          options,
          requestHash,
          "[event-editor] failed proposal receipt cleanup",
        );
      }
      throw completionError;
    }
  }
  if (ownsPreclaimedOperation) {
    await cleanupPreclaimedCreateOperation(
      client,
      actor,
      command,
      options,
      requestHash,
    );
  }
  throw error;
};

const waitForCreateResultReplay = async (params: {
  client: EditorSnapshotClient;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
}): Promise<EventEditorCreateResult> => {
  const replay = await waitForEventEditorCreateOperation({
    client: params.client,
    createOperationId: params.createOperationId,
    actorUserId: params.actorUserId,
    requestHash: params.requestHash,
    returnCommittedResultOnTimeout: true,
  });
  if (!replay.result) {
    throw new Error("The event create operation has no stored result.");
  }
  return replay.result;
};

const resolveCreateReplay = async (
  client: EditorSnapshotClient,
  actor: EditorActor,
  command: CreateEventEditorCommand,
  requestHash: string,
): Promise<EventEditorCreateResult> => waitForCreateResultReplay({
  client,
  createOperationId: command.createOperationId,
  actorUserId: actor.userId,
  requestHash,
});

const sendCreateStaffInvites = async (
  emailCandidates: unknown[],
  eventId: string,
  options: CreateEventEditorOptions,
): Promise<EventEditorCreateResult["staffEmailDelivery"]> => {
  if (!emailCandidates.length || !options.sendStaffInvites) {
    return "NOT_REQUESTED";
  }
  try {
    return await options.sendStaffInvites(emailCandidates, eventId);
  } catch (error) {
    console.error(
      "[event-editor] staff invite delivery failed after create",
      error,
    );
    return "FAILED";
  }
};

const notifyCreateEvent = async (
  eventId: string,
  draft: EventEditorDraft,
  options: CreateEventEditorOptions,
): Promise<void> => {
  if (!options.onEventCreated) return;
  try {
    await options.onEventCreated(eventId, draft);
  } catch (error) {
    console.error(
      "[event-editor] create notification failed after commit",
      error,
    );
  }
};

const notifyCreateSchedule = async (
  notification: MatchScheduleNotificationPlan | null,
  options: CreateEventEditorOptions,
): Promise<void> => {
  if (!notification || !options.onScheduleChanged) return;
  try {
    await options.onScheduleChanged(notification);
  } catch (error) {
    console.error(
      "[event-editor] schedule notification failed after create",
      error,
    );
  }
};

const completeCreateDelivery = async (
  client: EditorSnapshotClient,
  command: CreateEventEditorCommand,
  claimToken: Date,
  result: EventEditorCreateResult,
  staffEmailDelivery: EventEditorCreateResult["staffEmailDelivery"],
): Promise<void> => {
  try {
    await completeEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      claimToken,
      result,
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
};

const createEventEditorInternal = async (
  actor: EditorActor,
  command: CreateEventEditorCommand,
  options: CreateEventEditorOptions = {},
): Promise<EventEditorCreateResult | EventEditorCreateProposal> => {
  const client = options.client ?? prisma;
  assertCreateSchedulingIntent(command);
  const requestHash = eventEditorCreateRequestHash(command);
  let transactionState: CreateTransactionState;
  try {
    transactionState = await runCreateTransaction(
      client,
      actor,
      command,
      options,
      requestHash,
    );
  } catch (error) {
    return handleCreateTransactionError(
      error,
      client,
      actor,
      command,
      options,
      requestHash,
    );
  }
  const operationClaim = transactionState.claim;
  if (!operationClaim) {
    throw new Error("The event create operation was not claimed.");
  }
  if (!operationClaim.firstClaim) {
    return resolveCreateReplay(
      client,
      actor,
      command,
      requestHash,
    );
  }
  const canonicalResult = transactionState.firstClaimResult;
  if (!canonicalResult) {
    throw new Error("The event create operation has no canonical result.");
  }
  const claimToken = transactionState.claimToken;
  if (!claimToken) {
    throw new Error("The event create operation has no active claim token.");
  }
  const staffEmailDelivery = await sendCreateStaffInvites(
    transactionState.emailCandidates,
    operationClaim.eventId,
    options,
  );
  await notifyCreateEvent(operationClaim.eventId, command.draft, options);
  await notifyCreateSchedule(transactionState.scheduleNotification, options);
  const finalResult = { ...canonicalResult, staffEmailDelivery };
  await completeCreateDelivery(
    client,
    command,
    claimToken,
    finalResult,
    staffEmailDelivery,
  );
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
    if (existing?.result) {
      return waitForCreateResultReplay({
        client,
        createOperationId: command.createOperationId,
        actorUserId: actor.userId,
        requestHash,
      });
    }
    if (existing) return existing.proposal;
    const waited = await waitForEventEditorCreateProposal({
      client,
      createOperationId: command.createOperationId,
      actorUserId: actor.userId,
      requestHash,
    });
    return waited.result ?? waited.proposal;
  }
  const result = await createEventEditorInternal(actor, command, {
    ...options,
    shouldReturnScheduleProposal: true,
    preclaimedOperation: claim,
  });
  if (result.status !== "PROPOSED") {
    throw new Error("The create operation did not return a schedule proposal.");
  }
  return result;
};

const readProposalForAcceptance = async (
  client: EditorSnapshotClient,
  createOperationId: string,
  actorUserId: string,
): Promise<{
  stored: EventCreateOperationProposal;
  proposal: EventEditorCreateProposal;
}> => {
  const stored = await readEventEditorCreateProposalForActor({
    client,
    createOperationId,
    actorUserId,
  });
  if (!stored?.proposal) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal was not found.",
    );
  }
  return { stored, proposal: stored.proposal };
};

const assertStoredProposalRevision = (
  proposal: EventEditorCreateProposal,
  proposalRevision: string,
): void => {
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
};

const assertProposalDraftUnchanged = (
  draft: EventEditorDraft,
  proposal: EventEditorCreateProposal,
): void => {
  if (
    computeEventEditorRevision(draft) !==
    computeEventEditorRevision(proposal.snapshot.draft)
  ) {
    throw new EventEditorProposalStaleError(
      "The event configuration changed before proposal acceptance.",
    );
  }
};

const assertProposalPending = (
  proposal: EventEditorCreateProposal,
): void => {
  if (proposal.status !== "PROPOSED") {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal is not pending review.",
    );
  }
};
const assertProposalAcceptanceMode = (
  proposal: EventEditorCreateProposal,
  partial: boolean,
): void => {
  const isPartial = proposal.scheduleOutcome.status === "PARTIAL";
  if (isPartial !== partial) {
    throw new EventEditorProposalInvalidError(
      isPartial
        ? "A PARTIAL schedule proposal requires explicit partial acceptance."
        : "Only PARTIAL schedule proposals may use explicit partial acceptance.",
    );
  }
};

const assertAcceptanceIntentReplay = (
  storedResult: EventEditorCreateResult,
  acceptanceOperationId: string | undefined,
): void => {
  if (storedResult.acceptanceOperationId !== acceptanceOperationId) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal was already accepted with a different acceptance identity.",
    );
  }
};
const assertFreshAcceptanceIdentity = (
  createOperationId: string,
  acceptanceOperationId: string | undefined,
): void => {
  if (
    acceptanceOperationId !== undefined
    && acceptanceOperationId === createOperationId
  ) {
    throw new EventEditorProposalInvalidError(
      "Partial acceptance requires an acceptance identity different from the proposal identity.",
    );
  }
};

const assertCurrentProposalRecord = (
  currentStored: EventCreateOperationProposal | null,
  proposalRevision: string,
): void => {
  if (
    !currentStored?.proposal ||
    currentStored.proposal.proposalRevision !== proposalRevision
  ) {
    throw new EventEditorProposalStaleError(
      "The schedule proposal changed before acceptance.",
    );
  }
};

const acquireProposalResourceLocks = async (
  tx: Prisma.TransactionClient,
  proposal: EventEditorCreateProposal,
): Promise<void> => {
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
};

const assertProposalEventAbsent = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> => {
  const existingEvent = await tx.events.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (existingEvent) {
    throw new EventEditorProposalInvalidError(
      "The schedule proposal was already accepted.",
    );
  }
};

const loadProposalAcceptanceSnapshot = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  proposal: EventEditorCreateProposal,
): Promise<{
  current: EventEditorSnapshot;
  expectedBinding: EventEditorRevisionBinding;
}> => {
  const current = await loadCreateEventEditorSnapshot(
    {
      organizationId:
        proposal.snapshot.draft.basics.organizationId ?? undefined,
      eventType: proposal.snapshot.draft.basics.eventType,
      sportId: proposal.snapshot.draft.basics.sportIds[0],
      parentEventId: proposal.snapshot.draft.basics.parentEvent ?? undefined,
      templateId:
        proposal.snapshot.draft.resources.sourceTemplateId ??
        (proposal.snapshot.contractVersion < 5
          ? proposal.snapshot.draft.resources.requiredTemplateIds[0]
          : undefined),
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
  return { current, expectedBinding };
};

const assertProposalBindingCurrent = (
  expectedBinding: EventEditorRevisionBinding,
  proposal: EventEditorCreateProposal,
): void => {
  if (
    computeEventEditorRevision(expectedBinding) !==
    computeEventEditorRevision(proposal.revisionBinding)
  ) {
    throw new EventEditorProposalStaleError(
      "The Event Configuration or authoritative availability changed.",
    );
  }
};

const validateProposalDraftForAcceptance = async (
  tx: Prisma.TransactionClient,
  actor: EditorActor,
  proposal: EventEditorCreateProposal,
  current: EventEditorSnapshot,
  eventId: string,
): Promise<string> => {
  const resolvedHostId = await assertCreateAccess(
    tx,
    actor,
    proposal.snapshot.draft,
  );
  assertMinimumBracketTeamCounts(proposal.snapshot.draft);
  assertEventTypeRegistrationUnit(
    proposal.snapshot.draft.basics.eventType,
    teamSignupForDraft(proposal.snapshot.draft),
  );
  assertImmutableFields(proposal.snapshot.draft, eventId, current);
  await assertPaymentCapability(proposal.snapshot.draft, current);
  return resolvedHostId;
};

const validateProposalGraphForAcceptance = (
  eventId: string,
  proposal: EventEditorCreateProposal,
): EventEditorCreateProposal["graph"] =>
  validateProposalGraphForPolicy(
    eventId,
    proposal.graph,
    proposal.graph.event.staffingPriority,
  );

type ProposalAcceptanceTransactionResult = {
  accepted: EventEditorCreateResult;
  emailCandidates: unknown[];
  replayed: boolean;
  claimToken: Date | null;
};

const persistAcceptedProposal = async (params: {
  tx: Prisma.TransactionClient;
  actor: EditorActor;
  createOperationId: string;
  acceptanceOperationId?: string;
  eventId: string;
  proposal: EventEditorCreateProposal;
  current: EventEditorSnapshot;
  validatedProposalGraph: EventEditorCreateProposal["graph"];
  resolvedHostId: string;
  claimToken: Date;
}): Promise<ProposalAcceptanceTransactionResult> => {
  const { questionIdMap, emailCandidates } = await saveWithinTransaction(
    params.tx,
    params.actor,
    params.proposal.snapshot.draft,
    params.eventId,
    params.current,
    params.resolvedHostId,
  );
  await persistSerializedScheduleGraph({
    tx: params.tx,
    eventId: params.eventId,
    graph: params.validatedProposalGraph,
  });
  const snapshot = await loadEventEditorSnapshot(params.eventId, {
    actor: params.actor,
    client: params.tx,
  });
  const accepted: EventEditorCreateResult = {
    status: "SAVED",
    createOperationId: params.createOperationId,
    ...(params.acceptanceOperationId
      ? { acceptanceOperationId: params.acceptanceOperationId }
      : {}),
    editorRevision: snapshot.editorRevision,
    staffRevision: snapshot.staffRevision,
    scheduleRevision: snapshot.scheduleState.revision,
    snapshot,
    questionIdMap,
    staffEmailDelivery: "NOT_REQUESTED",
    scheduleOutcome: params.proposal.scheduleOutcome,
    graph: params.proposal.graph,
  };
  const claimToken = await completeEventEditorCreateOperation({
    client: params.tx,
    createOperationId: params.createOperationId,
    claimToken: params.claimToken,
    result: accepted,
    emailDelivery: "PROCESSING",
    proposalStatus: "ACCEPTED",
  });
  return { accepted, emailCandidates, replayed: false, claimToken };
};

const acceptProposalWithinTransaction = async (params: {
  tx: Prisma.TransactionClient;
  actor: EditorActor;
  createOperationId: string;
  acceptanceOperationId?: string;
  proposalRevision: string;
  storedEventId: string;
  proposal: EventEditorCreateProposal;
  partial: boolean;
}): Promise<ProposalAcceptanceTransactionResult> => {
  await acquireEventLock(params.tx, params.storedEventId);
  await acquireEventTemplateLocks(
    params.tx,
    templateIdsForDraft(params.proposal.snapshot.draft),
  );
  const currentStored = await readEventEditorCreateProposalForActor({
    client: params.tx,
    createOperationId: params.createOperationId,
    actorUserId: params.actor.userId,
  });
  assertCurrentProposalRecord(currentStored, params.proposalRevision);
  assertProposalAcceptanceMode(params.proposal, params.partial);
  if (currentStored?.result) {
    assertAcceptanceIntentReplay(
      currentStored.result,
      params.acceptanceOperationId,
    );
    return {
      accepted: currentStored.result,
      emailCandidates: [],
      replayed: true,
      claimToken: null,
    };
  }
  const claimToken = await readEventEditorCreateOperationClaimToken({
    client: params.tx,
    createOperationId: params.createOperationId,
    actorUserId: params.actor.userId,
  });
  await acquireProposalResourceLocks(params.tx, params.proposal);
  await assertProposalEventAbsent(params.tx, params.storedEventId);
  const { current, expectedBinding } = await loadProposalAcceptanceSnapshot(
    params.tx,
    params.actor,
    params.proposal,
  );
  assertProposalBindingCurrent(expectedBinding, params.proposal);
  const resolvedHostId = await validateProposalDraftForAcceptance(
    params.tx,
    params.actor,
    params.proposal,
    current,
    params.storedEventId,
  );
  const validatedProposalGraph = validateProposalGraphForAcceptance(
    params.storedEventId,
    params.proposal,
  );
  return persistAcceptedProposal({
    tx: params.tx,
    actor: params.actor,
    createOperationId: params.createOperationId,
    acceptanceOperationId: params.acceptanceOperationId,
    eventId: params.storedEventId,
    proposal: params.proposal,
    current,
    validatedProposalGraph,
    resolvedHostId,
    claimToken,
  });
};

const sendAcceptedStaffInvites = async (
  emailCandidates: unknown[],
  eventId: string,
  options: EditorSaveOptions,
): Promise<EventEditorCreateResult["staffEmailDelivery"]> => {
  if (!emailCandidates.length || !options.sendStaffInvites) {
    return "NOT_REQUESTED";
  }
  try {
    return await options.sendStaffInvites(emailCandidates, eventId);
  } catch (error) {
    console.error(
      "[event-editor] staff invite delivery failed after proposal acceptance",
      error,
    );
    return "FAILED";
  }
};

const notifyAcceptedEvent = async (
  eventId: string,
  draft: EventEditorDraft,
  options: EditorSaveOptions,
): Promise<void> => {
  if (!options.onEventCreated) return;
  try {
    await options.onEventCreated(eventId, draft);
  } catch (error) {
    console.error(
      "[event-editor] create notification failed after proposal acceptance",
      error,
    );
  }
};

const notifyAcceptedSchedule = async (
  graph: EventEditorCreateProposal["graph"] | null | undefined,
  options: EditorSaveOptions,
): Promise<void> => {
  const scheduleNotification = scheduleNotificationForAcceptedProposal(graph);
  if (!scheduleNotification || !options.onScheduleChanged) return;
  try {
    await options.onScheduleChanged(scheduleNotification);
  } catch (error) {
    console.error(
      "[event-editor] schedule notification failed after proposal acceptance",
      error,
    );
  }
};

const completeAcceptedDelivery = async (
  client: EditorSnapshotClient,
  createOperationId: string,
  claimToken: Date,
  result: EventEditorCreateResult,
  staffEmailDelivery: EventEditorCreateResult["staffEmailDelivery"],
): Promise<void> => {
  try {
    await completeEventEditorCreateOperation({
      client,
      createOperationId,
      claimToken,
      result,
      emailDelivery: staffEmailDelivery,
      proposalStatus: "ACCEPTED",
    });
  } catch (error) {
    console.error(
      "[event-editor] proposal acceptance metadata update failed",
      error,
    );
  }
};

const acceptProposalInternal = async (
  actor: EditorActor,
  createOperationId: string,
  proposalRevision: string,
  draft: EventEditorDraft,
  partial: boolean,
  acceptanceOperationId: string | undefined,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateResult> => {
  const client = options.client ?? prisma;
  const { stored, proposal } = await readProposalForAcceptance(
    client,
    createOperationId,
    actor.userId,
  );
  assertStoredProposalRevision(proposal, proposalRevision);
  assertFreshAcceptanceIdentity(createOperationId, acceptanceOperationId);
  assertProposalDraftUnchanged(draft, proposal);
  assertProposalAcceptanceMode(proposal, partial);
  if (stored.result) {
    assertAcceptanceIntentReplay(stored.result, acceptanceOperationId);
    return waitForCreateResultReplay({
      client,
      createOperationId,
      actorUserId: actor.userId,
      requestHash: stored.requestHash,
    });
  }
  assertProposalPending(proposal);
  const result = await client.$transaction(
    (tx: Prisma.TransactionClient) =>
      acceptProposalWithinTransaction({
        tx,
        actor,
        createOperationId,
        acceptanceOperationId,
        proposalRevision,
        storedEventId: stored.eventId,
        proposal,
        partial,
      }),
  );
  if (result.replayed) {
    assertAcceptanceIntentReplay(result.accepted, acceptanceOperationId);
    return waitForCreateResultReplay({
      client,
      createOperationId,
      actorUserId: actor.userId,
      requestHash: stored.requestHash,
    });
  }
  if (!result.claimToken) {
    throw new Error("The accepted create operation has no active claim token.");
  }
  const eventId = result.accepted.snapshot.eventId ?? stored.eventId;
  const staffEmailDelivery = await sendAcceptedStaffInvites(
    result.emailCandidates,
    eventId,
    options,
  );
  await notifyAcceptedEvent(stored.eventId, proposal.snapshot.draft, options);
  await notifyAcceptedSchedule(result.accepted.graph ?? proposal.graph, options);
  const finalResult = {
    ...result.accepted,
    staffEmailDelivery,
  };
  await completeAcceptedDelivery(
    client,
    createOperationId,
    result.claimToken,
    finalResult,
    staffEmailDelivery,
  );
  return finalResult;
};

export const acceptScheduleProposalFromEditor = async (
  actor: EditorActor,
  createOperationId: string,
  proposalRevision: string,
  draft: EventEditorDraft,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateResult> =>
  acceptProposalInternal(
    actor,
    createOperationId,
    proposalRevision,
    draft,
    false,
    undefined,
    options,
  );

export const acceptPartialScheduleProposalFromEditor = async (
  actor: EditorActor,
  createOperationId: string,
  proposalRevision: string,
  acceptanceOperationId: string,
  draft: EventEditorDraft,
  options: EditorSaveOptions = {},
): Promise<EventEditorCreateResult> =>
  acceptProposalInternal(
    actor,
    createOperationId,
    proposalRevision,
    draft,
    true,
    acceptanceOperationId,
    options,
  );

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
