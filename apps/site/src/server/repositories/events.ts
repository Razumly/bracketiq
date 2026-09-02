import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePrismaSchemaContract } from "@/lib/prismaSchemaContract";
import { canOrganizationUsePaidBilling } from "@/lib/organizationVerification";
import { sanitizeOrganizationEventAssignments } from "@/lib/organizationEventAccess";
import {
  hasWeeklyRepeatingTimeSlot,
  WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE,
} from "@/lib/eventScheduling";
import { normalizeAutomatedSchedulingForEventType } from "@/lib/automatedScheduling";
import {
  normalizeEventTaxHandling,
  normalizeOrganizerManualTaxRateBps,
  normalizeRentalTaxHandling,
} from "@/lib/taxPolicy";
import { assertValidOneTimeTimeSlots } from "@/lib/timeSlotAvailability";
import {
  assertRepeatingTimeSlotsResolvable,
  type ResolvedRepeatingTimeSlot,
  enumerateRepeatingTimeSlotOccurrences,
} from "@/lib/repeatingTimeSlotAvailability";

import {
  normalizeManualPaymentInstructions,
  normalizeManualPaymentLinks,
  normalizeManualPaymentLinksForPersistence,
  normalizeRegistrationPaymentMode,
} from "@/lib/manualRegistrationPayments";
import {
  buildDivisionToken,
  EventDivisionNameValidationError,
  findDuplicateDivisionNames,
  MIN_BRACKET_TEAM_COUNT,
  normalizeBracketTeamCount,
  buildEventDivisionId,
  cleanDivisionDisplayName,
  deriveDivisionTypeDisplayName,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
  normalizeDivisionTypeIds,
  parseCompositeDivisionTypeId,
  type DivisionGender,
  type DivisionNameCandidate,
  type DivisionRatingType,
} from "@/lib/divisionTypes";
import { evaluatePlayoffPlacementCapacities } from "@/lib/divisionCapacity";
import {
  BlockingEvent,
  Division,
  League,
  Match,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
  UserData,
  sideFrom,
  MINUTE_MS,
  type LeagueDivisionConfig,
} from "@/server/scheduler/types";
import {
  canonicalizeTimeSlots,
  type CanonicalTimeSlotInput,
  normalizeTimeSlotDays,
  normalizeTimeSlotFieldIds,
} from "@/server/timeSlotCanonical";
import {
  buildEventOfficialPositionsFromTemplates,
  buildLegacyOfficialAssignment,
  completeMatchOfficialAssignmentSlots,
  deriveLegacyOfficialCheckedInFromAssignments,
  deriveLegacyOfficialIdFromAssignments,
  filterEventOfficialsByUserIds,
  normalizeEventOfficials,
  normalizeEventOfficialPositions,
  normalizeMatchOfficialAssignments,
  normalizeOfficialSchedulingMode,
  normalizeStaffingPriority,
  normalizeSportOfficialPositionTemplates,
  type EventOfficialRecord,
  type EventOfficialPosition,
  type MatchOfficialAssignment,
} from "@/server/officials/config";
import {
  resolveMatchRules,
  resolveMatchRulesForDivisionPhase,
  resolveMatchRulesForContext,
  serializeMatchIncidentRow,
  serializeMatchSegmentRow,
} from "@/server/matches/matchOperations";
import {
  EventRegistrationStructureLockedError,
  buildEventRegistrationId,
  getEventParticipantIdsForEvent,
  hasJoinedEventParticipant,
  upsertEventRegistration,
} from "@/server/events/eventRegistrations";
import { hasProtectedEventHistory } from "@/server/events/eventProtectedHistory";
import { getCanonicalTeamIdsByUserIds } from "@/server/teams/teamMembership";
import {
  buildGeneratedTournamentPools,
  generatedPoolsForBracket,
  isTournamentPoolPlayEnabled,
  isGeneratedTournamentPoolRecord,
  TournamentPoolValidationError,
} from "@/server/events/tournamentPools";
import {
  collectPhaseDivisions,
  collectPhaseTeamIdsByDivision,
  collectScheduledDivisions,
  persistPhaseParticipantAssignments,
  syncEventDivisionPhases,
  type PhasePersistenceClient,
  type PhaseDivisionCandidate,
} from "./eventDivisionPhases";
import {
  fieldSchedulingConflictDetails,
  loadFieldBlockerCatalog,
  type FieldBlockerCatalog,
  type LoadFieldBlockerCatalogInput,
} from "./fieldSchedulingConflicts";
import { acquireFieldLocks } from "@/server/repositories/locks";
import {
  DEFAULT_EVENT_TIME_ZONE,
  localDatePartsInTimeZone,
  mondayDayInTimeZone,
  minutesInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromCoordinates,
  resolveTimeZoneFromFieldOrOrganization,
} from "@/server/timeZones";
import { syncEventTags, syncEventTypeTagsForEvent } from "@/server/eventTags";
import {
  normalizeDivisionPhaseSettingsMap,
  resolveDivisionCompetitionPhase,
} from "@/lib/divisionPhaseSettings";
import type { DivisionCompetitionPhase, DivisionPhaseSettingsMap } from "@/types";
import {
  normalizeEventSportIds,
  validateEventSportIds,
  validateEventSportIdsExist,
} from "@/server/eventSports";
export type EventSchedulePersistenceInput = {
  id: string;
  end: Date;
  generatedScheduleEnd?: Date | null;
  noFixedEndDateTime?: boolean | null;
  scheduleEndConstraint?: Date | null;
};

export type ScheduledRosterTeamInput = {
  id?: string | null;
  captainId?: string | null;
  playerIds?: readonly string[] | null;
  division?: { id?: string | null } | null;
  name?: string | null;
};

export type ScheduledRosterInput = {
  id?: string;
  hostId?: string | null;
  eventType?: unknown;
  includePlayoffs?: unknown;
  includePlayoffsOrPools?: unknown;
  singleDivision?: boolean | null;
  teamSizeLimit?: number | null;
  divisions?: readonly PhaseDivisionCandidate[] | null;
  playoffDivisions?: readonly PhaseDivisionCandidate[] | null;
  teams: Record<string, ScheduledRosterTeamInput>;
};
type MatchPersistenceRelation = { id: string } | null;
type MatchPersistenceDivision = {
  id: string;
  kind?: string | null;
  role?: string | null;
  phase?: string | null;
  sourceDivisionId?: string | null;
  phaseSettings?: Record<
    string,
    { officialPositions?: EventOfficialPosition[] }
  >;
};
type MatchPersistenceOfficialAssignment = {
  positionId: string;
  slotIndex: number;
  holderType: string;
  userId: string | null;
  eventOfficialId: string | null;
  checkedIn: boolean;
  hasConflict: boolean;
};
type MatchPersistenceSegment = {
  id?: string | null;
  sequence: number;
  status?: string | null;
  scores?: Record<string, number>;
  winnerEventTeamId?: string | null;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
  resultType?: string | null;
  statusReason?: string | null;
  metadata?: Record<string, unknown> | null;
};
type MatchPersistenceIncident = {
  id?: string | null;
  sequence: number;
  segmentId?: string | null;
  eventTeamId?: string | null;
  eventRegistrationId?: string | null;
  participantUserId?: string | null;
  officialUserId?: string | null;
  incidentType: string;
  minute?: number | null;
  clock?: string | null;
  clockSeconds?: number | null;
  linkedPointDelta?: number | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MatchPersistenceInput = {
  id: string;
  matchId?: number | null;
  locked?: boolean;
  placementState?: string | null;
  team1Seed?: number | null;
  team2Seed?: number | null;
  team1Points?: number[];
  team2Points?: number[];
  start?: Date | null;
  end?: Date | null;
  division?: MatchPersistenceDivision | null;
  field?: MatchPersistenceRelation;
  team1?: MatchPersistenceRelation;
  team2?: MatchPersistenceRelation;
  official?: MatchPersistenceRelation;
  teamOfficial?: MatchPersistenceRelation;
  eventId?: string;
  officialCheckedIn?: boolean | null;
  officialAssignments?: readonly MatchPersistenceOfficialAssignment[];
  winnerEventTeamId?: string | null;
  matchRulesSnapshot?: unknown;
  resolvedMatchRules?: unknown;
  status?: string | null;
  resultStatus?: string | null;
  resultType?: string | null;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  statusReason?: string | null;
  segments?: readonly MatchPersistenceSegment[];
  incidents?: readonly MatchPersistenceIncident[];
  side?: string | null;
  losersBracket?: boolean | null;
  winnerNextMatch?: MatchPersistenceRelation;
  loserNextMatch?: MatchPersistenceRelation;
  previousLeftMatch?: MatchPersistenceRelation;
  previousRightMatch?: MatchPersistenceRelation;
};

type PrismaLike = PrismaClient | any;
type MatchRow = Prisma.MatchesGetPayload<{}>;

const normalizeLegacyBracketTeamCount = (value: unknown): number =>
  Math.max(MIN_BRACKET_TEAM_COUNT, normalizeBracketTeamCount(value));

export type EventFieldScheduleConflict = {
  fieldId: string;
  blockId: string;
  parentId: string | null;
  start: Date;
  end: Date;
};

/**
 * An opaque occupied interval for a field.  Unlike EventFieldScheduleConflict,
 * this deliberately contains no event, match, booking, or participant data so
 * it can be used by rental discovery responses without exposing schedule
 * details.
 */
export type FieldSchedulingConflict = {
  fieldId: string;
  start: Date;
  end: Date;
};

export type ListFieldSchedulingConflictsInput = {
  client?: PrismaLike;
  organizationId?: string | null;
  fieldIds: string[];
  windowStart: Date;
  windowEnd: Date;
  excludeEventId?: string | null;
};

export class EventFieldConflictError extends Error {
  readonly conflicts: EventFieldScheduleConflict[];

  constructor(conflicts: EventFieldScheduleConflict[]) {
    super(
      "Selected fields and time range conflict with existing reservations.",
    );
    this.name = "EventFieldConflictError";
    this.conflicts = conflicts;
  }
}

export const isEventFieldConflictError = (
  error: unknown,
): error is EventFieldConflictError => error instanceof EventFieldConflictError;

export class LeaguePlayoffTeamCountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaguePlayoffTeamCountValidationError";
  }
}

export const isLeaguePlayoffTeamCountValidationError = (
  error: unknown,
): error is LeaguePlayoffTeamCountValidationError =>
  error instanceof LeaguePlayoffTeamCountValidationError;

export class RentalBookingReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RentalBookingReservationError";
  }
}

export const isRentalBookingReservationError = (
  error: unknown,
): error is RentalBookingReservationError =>
  error instanceof RentalBookingReservationError;
export class EventFieldReferenceError extends Error {
  constructor(fieldIds: string[]) {
    super(
      `The selected field resources were not found: ${fieldIds.join(", ")}.`,
    );
    this.name = "EventFieldReferenceError";
  }
}

export const isEventFieldConfigurationError = (error: unknown): boolean => {
  if (error instanceof EventFieldReferenceError) return true;
  return (
    error instanceof Error && error.message === EVENT_FIELDS_REQUIRED_MESSAGE
  );
};

const EVENT_FIELDS_REQUIRED_MESSAGE =
  "Select or create at least one field for this event.";

const upsertEventWithSchemaContract = async (
  client: PrismaLike,
  id: string,
  eventData: Record<string, unknown>,
) =>
  requirePrismaSchemaContract("Events", () =>
    client.events.upsert({
      where: { id },
      create: { ...eventData, createdAt: new Date() } as any,
      update: eventData as any,
    }),
  );

const ensureArray = <T>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];
const ensureStringArray = (value: unknown): string[] =>
  ensureArray(value as string[]);
const normalizeTeamIdList = (value: unknown): string[] =>
  Array.from(
    new Set(
      ensureArray(value as Array<string | null | undefined>)
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  );
const ensureNumberArray = (value: unknown): number[] =>
  ensureArray(value as Array<number | string>)
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
const isSchedulableEventType = (value: unknown): boolean => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "";
  return (
    normalized === "LEAGUE" ||
    normalized === "TOURNAMENT" ||
    normalized === "WEEKLY_EVENT" ||
    normalized === "TRYOUT"
  );
};
const requiresScheduledFields = (value: unknown): boolean => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "";
  return normalized === "LEAGUE" || normalized === "TOURNAMENT";
};
const isBracketEventType = (value: unknown): boolean => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "";
  return normalized === "LEAGUE" || normalized === "TOURNAMENT";
};
const FIELD_CONFLICT_LOOKAHEAD_WEEKS = 52;
const FIELD_MATCH_BLOCK_PREFIX = "__field_match_block__";
const FIELD_EVENT_BLOCK_PREFIX = "__field_event_block__";
const coerceBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
};

const normalizeTeamCheckInMode = (
  value: unknown,
  fallback: "OFF" | "EVENT" | "MATCH" = "OFF",
): "OFF" | "EVENT" | "MATCH" => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "EVENT" ||
    normalized === "MATCH" ||
    normalized === "OFF"
  ) {
    return normalized;
  }
  return fallback;
};

const normalizeOpenMinutesBefore = (value: unknown, fallback = 60): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
};

const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

type HydratedWinnerEventTeamParams = {
  persistedWinnerEventTeamId: unknown;
  shouldHydrateSegments: boolean;
  segments: Array<{ status?: unknown; winnerEventTeamId?: unknown }>;
  resolvedMatchRules:
    | { scoringModel?: unknown; segmentCount?: unknown }
    | null
    | undefined;
  team1Id: unknown;
  team2Id: unknown;
};

const resolveCompletedSegmentWinner = (
  segments: Array<{ status?: unknown; winnerEventTeamId?: unknown }>,
): string | null => {
  const completedSegment = segments.find(
    (segment) =>
      String(segment.status ?? "")
        .trim()
        .toUpperCase() === "COMPLETE" &&
      normalizeEntityId(segment.winnerEventTeamId),
  );
  return normalizeEntityId(completedSegment?.winnerEventTeamId);
};

const resolveSetsWinner = (params: {
  segments: Array<{ status?: unknown; winnerEventTeamId?: unknown }>;
  resolvedMatchRules:
    | { segmentCount?: unknown }
    | null
    | undefined;
  team1Id: unknown;
  team2Id: unknown;
}): string | null => {
  const team1Id = normalizeEntityId(params.team1Id);
  const team2Id = normalizeEntityId(params.team2Id);
  if (!team1Id || !team2Id) {
    return null;
  }
  const configuredSegmentCount = Number(
    params.resolvedMatchRules?.segmentCount,
  );
  const segmentCount =
    Number.isFinite(configuredSegmentCount) && configuredSegmentCount > 0
      ? Math.trunc(configuredSegmentCount)
      : Math.max(params.segments.length, 1);
  const winsNeeded = Math.max(1, Math.ceil(segmentCount / 2));
  const completedWinnerIds = params.segments
    .filter(
      (segment) =>
        String(segment.status ?? "")
          .trim()
          .toUpperCase() === "COMPLETE" ||
        Boolean(normalizeEntityId(segment.winnerEventTeamId)),
    )
    .map((segment) => normalizeEntityId(segment.winnerEventTeamId));
  const team1Wins = completedWinnerIds.filter(
    (winnerId) => winnerId === team1Id,
  ).length;
  const team2Wins = completedWinnerIds.filter(
    (winnerId) => winnerId === team2Id,
  ).length;
  if (team1Wins >= winsNeeded) {
    return team1Id;
  }
  if (team2Wins >= winsNeeded) {
    return team2Id;
  }
  return null;
};

const resolveHydratedWinnerEventTeamId = (
  params: HydratedWinnerEventTeamParams,
): string | null => {
  const persistedWinnerEventTeamId = normalizeEntityId(
    params.persistedWinnerEventTeamId,
  );
  if (persistedWinnerEventTeamId) {
    return persistedWinnerEventTeamId;
  }
  if (!params.shouldHydrateSegments) {
    return null;
  }
  const scoringModel =
    typeof params.resolvedMatchRules?.scoringModel === "string"
      ? params.resolvedMatchRules.scoringModel.trim().toUpperCase()
      : "";
  if (scoringModel === "SETS") {
    return resolveSetsWinner(params);
  }
  return resolveCompletedSegmentWinner(params.segments);
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const ACTIVE_EVENT_REGISTRATION_STATUSES = [
  "STARTED",
  "PENDING",
  "ACTIVE",
  "BLOCKED",
] as const;

type CompatibilityRegistrationParameters = {
  eventId: string;
  createdBy: string;
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
  syncTeams: boolean;
  syncUsers: boolean;
  syncWaitList: boolean;
  syncFreeAgents: boolean;
  placeholderTeamIds?: string[];
  divisionIdByRegistrantId?: Record<string, string | null | undefined>;
};

type CompatibilityRegistrationState = {
  createdBy: string;
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
  activeTeamIds: string[];
  placeholderTeamIds: Set<string>;
  waitListTeamIds: Set<string>;
  entryDivisionRows: any[];
  defaultEntryDivisionId: string | null;
  existingRowsById: Map<string, any>;
};

type CompatibilityRegistrationEntry = {
  registrantType: "TEAM" | "SELF";
  registrantId: string;
  rosterRole: "PARTICIPANT" | "WAITLIST" | "FREE_AGENT";
};

const loadCompatibilityTeamRows = async (
  client: PrismaLike,
  teamIds: string[],
): Promise<any[]> =>
  teamIds.length && typeof (client as any).teams?.findMany === "function"
    ? (client as any).teams.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          kind: true,
          captainId: true,
          name: true,
          parentTeamId: true,
        },
      })
    : [];

const collectCompatibilityPlaceholderTeamIds = (
  teamIds: string[],
  explicitPlaceholderTeamIds: string[],
  teamRows: any[],
): { placeholderTeamIds: Set<string>; activeTeamIds: string[] } => {
  const placeholderTeamIds = new Set(explicitPlaceholderTeamIds);
  for (const row of teamRows as Array<{
    id?: unknown;
    kind?: unknown;
    captainId?: unknown;
    name?: unknown;
    parentTeamId?: unknown;
  }>) {
    const id = normalizeEntityId(row.id);
    if (!id) {
      continue;
    }
    const kind = String(row.kind ?? "")
      .trim()
      .toUpperCase();
    const captainId = String(row.captainId ?? "").trim();
    const name = String(row.name ?? "")
      .trim()
      .toLowerCase();
    const parentTeamId = normalizeEntityId(row.parentTeamId);
    if (
      kind === "PLACEHOLDER" ||
      (!parentTeamId && !captainId && name.startsWith("place holder"))
    ) {
      placeholderTeamIds.add(id);
    }
  }
  return {
    placeholderTeamIds,
    activeTeamIds: teamIds.filter(
      (teamId) => !placeholderTeamIds.has(teamId),
    ),
  };
};

const loadCompatibilityWaitListTeamIds = async (
  client: PrismaLike,
  waitListIds: string[],
): Promise<Set<string>> => {
  const rows =
    waitListIds.length && typeof (client as any).teams?.findMany === "function"
      ? await (client as any).teams.findMany({
          where: { id: { in: waitListIds } },
          select: { id: true },
        })
      : [];
  return new Set(
    (rows as Array<{ id?: unknown }>)
      .map((row) => normalizeEntityId(row.id))
      .filter((id): id is string => Boolean(id)),
  );
};

const loadCompatibilityEntryDivisionRows = async (
  client: PrismaLike,
  eventId: string,
): Promise<any[]> =>
  typeof (client as any).divisions?.findMany === "function"
    ? (client as any).divisions.findMany({
        where: {
          eventId,
          role: "ENTRY",
          status: "ACTIVE",
        },
        select: { id: true, key: true },
      })
    : [];

const compatibilityRegistrationIdsFor = (
  eventId: string,
  activeTeamIds: string[],
  userIds: string[],
  waitListIds: string[],
  freeAgentIds: string[],
): string[] =>
  Array.from(new Set([
    ...activeTeamIds.map((registrantId) => buildEventRegistrationId({
      eventId,
      registrantType: "TEAM",
      registrantId,
    })),
    ...userIds.map((registrantId) => buildEventRegistrationId({
      eventId,
      registrantType: "SELF",
      registrantId,
    })),
    ...waitListIds.flatMap((registrantId) => [
      buildEventRegistrationId({
        eventId,
        registrantType: "TEAM",
        registrantId,
      }),
      buildEventRegistrationId({
        eventId,
        registrantType: "SELF",
        registrantId,
      }),
    ]),
    ...freeAgentIds.map((registrantId) => buildEventRegistrationId({
      eventId,
      registrantType: "SELF",
      registrantId,
    })),
  ]));

const loadExistingCompatibilityRows = async (
  client: PrismaLike,
  eventId: string,
  ids: string[],
): Promise<Map<string, any>> => {
  const rows =
    ids.length && typeof (client as any).eventRegistrations?.findMany === "function"
      ? await (client as any).eventRegistrations.findMany({
          where: {
            eventId,
            id: { in: ids },
          },
          select: {
            id: true,
            eventId: true,
            registrantId: true,
            parentId: true,
            registrantType: true,
            rosterRole: true,
            status: true,
            acceptedAt: true,
            eventTeamId: true,
            sourceTeamRegistrationId: true,
            ageAtEvent: true,
            divisionId: true,
            divisionTypeId: true,
            divisionTypeKey: true,
            jerseyNumber: true,
            position: true,
            isCaptain: true,
            consentDocumentId: true,
            consentStatus: true,
            createdBy: true,
            slotId: true,
            occurrenceDate: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];
  return new Map<string, any>(
    (Array.isArray(rows) ? rows : [])
      .map((row: { id?: unknown }) => [normalizeEntityId(row.id), row] as const)
      .filter((entry): entry is readonly [string, any] => Boolean(entry[0])),
  );
};

const loadCompatibilityRegistrationState = async (
  client: PrismaLike,
  params: CompatibilityRegistrationParameters,
): Promise<CompatibilityRegistrationState> => {
  const createdBy = normalizeEntityId(params.createdBy) ?? "system";
  const teamIds = normalizeTeamIdList(params.teamIds);
  const userIds = normalizeTeamIdList(params.userIds);
  const waitListIds = normalizeTeamIdList(params.waitListIds);
  const freeAgentIds = normalizeTeamIdList(params.freeAgentIds);
  const explicitPlaceholderTeamIds = normalizeTeamIdList(
    params.placeholderTeamIds ?? [],
  );
  const teamRows = await loadCompatibilityTeamRows(client, teamIds);
  const { placeholderTeamIds, activeTeamIds } =
    collectCompatibilityPlaceholderTeamIds(
      teamIds,
      explicitPlaceholderTeamIds,
      teamRows,
    );
  const waitListTeamIds = await loadCompatibilityWaitListTeamIds(
    client,
    waitListIds,
  );
  const entryDivisionRows = await loadCompatibilityEntryDivisionRows(
    client,
    params.eventId,
  );
  const defaultEntryDivisionId =
    Array.isArray(entryDivisionRows) && entryDivisionRows.length === 1
      ? normalizeEntityId(entryDivisionRows[0]?.id)
      : null;
  const compatibilityRegistrationIds = compatibilityRegistrationIdsFor(
    params.eventId,
    activeTeamIds,
    userIds,
    waitListIds,
    freeAgentIds,
  );
  const existingRowsById = await loadExistingCompatibilityRows(
    client,
    params.eventId,
    compatibilityRegistrationIds,
  );
  return {
    createdBy,
    teamIds,
    userIds,
    waitListIds,
    freeAgentIds,
    activeTeamIds,
    placeholderTeamIds,
    waitListTeamIds,
    entryDivisionRows,
    defaultEntryDivisionId,
    existingRowsById,
  };
};

const existingCompatibilityValue = (
  existing: Record<string, any>,
  key: string,
  fallback: unknown,
): any => {
  const value = existing[key];
  if (value !== null && value !== undefined) {
    return value;
  }
  return fallback;
};

const resolveCompatibilityRegistrationDivisionId = (
  params: CompatibilityRegistrationParameters,
  state: CompatibilityRegistrationState,
  registrantId: string,
): string | null =>
  normalizeEntityId(params.divisionIdByRegistrantId?.[registrantId]) ??
  state.defaultEntryDivisionId;

const isExistingCompatibilityRegistrationAccepted = (
  existing: Record<string, any> | null,
): boolean =>
  Boolean(
    existing?.acceptedAt ||
      ["ACTIVE", "BLOCKED"].includes(
        String(existing?.status ?? "").toUpperCase(),
      ),
  );

const resolveCompatibilityRegistrationStatus = (
  entry: CompatibilityRegistrationEntry,
  existing: Record<string, any> | null,
): string =>
  entry.rosterRole !== "PARTICIPANT"
    ? "ACTIVE"
    : isExistingCompatibilityRegistrationAccepted(existing)
      ? String(existing?.status ?? "ACTIVE").toUpperCase()
      : "STARTED";

const resolveCompatibilityEventTeamId = (
  entry: CompatibilityRegistrationEntry,
): string | null => (entry.registrantType === "TEAM" ? entry.registrantId : null);

const resolveCompatibilityDivisionForEntry = (
  entry: CompatibilityRegistrationEntry,
  divisionId: string | null,
  existing: Record<string, any> | null,
): string | null =>
  entry.rosterRole === "PARTICIPANT"
    ? divisionId
    : existingCompatibilityValue(existing ?? {}, "divisionId", null);

const resolveCompatibilityOccurrence = (
  existing: Record<string, any> | null,
): { slotId: unknown; occurrenceDate: unknown } | null => {
  if (!existing?.slotId || !existing.occurrenceDate) {
    return null;
  }
  return {
    slotId: existing.slotId,
    occurrenceDate: existing.occurrenceDate,
  };
};

const buildExistingCompatibilityRegistrationInput = (
  params: CompatibilityRegistrationParameters,
  state: CompatibilityRegistrationState,
  entry: CompatibilityRegistrationEntry,
  id: string,
  divisionId: string | null,
  status: string,
  existing: Record<string, any>,
): Record<string, unknown> => ({
  eventId: existingCompatibilityValue(existing, "eventId", params.eventId),
  registrationId: id,
  registrantType: entry.registrantType,
  registrantId: entry.registrantId,
  rosterRole: entry.rosterRole,
  status,
  parentId: existingCompatibilityValue(existing, "parentId", null),
  eventTeamId: resolveCompatibilityEventTeamId(entry),
  sourceTeamRegistrationId: null,
  ageAtEvent: existingCompatibilityValue(existing, "ageAtEvent", null),
  divisionId: resolveCompatibilityDivisionForEntry(entry, divisionId, existing),
  divisionTypeId: existingCompatibilityValue(existing, "divisionTypeId", null),
  divisionTypeKey: existingCompatibilityValue(existing, "divisionTypeKey", null),
  jerseyNumber: existingCompatibilityValue(existing, "jerseyNumber", null),
  position: existingCompatibilityValue(existing, "position", null),
  isCaptain: existingCompatibilityValue(existing, "isCaptain", false),
  consentDocumentId: existingCompatibilityValue(
    existing,
    "consentDocumentId",
    null,
  ),
  consentStatus: existingCompatibilityValue(existing, "consentStatus", null),
  createdBy: existingCompatibilityValue(existing, "createdBy", state.createdBy),
  occurrence: resolveCompatibilityOccurrence(existing),
});

const buildNewCompatibilityRegistrationInput = (
  params: CompatibilityRegistrationParameters,
  entry: CompatibilityRegistrationEntry,
  divisionId: string | null,
  status: string,
): Record<string, unknown> => ({
  eventId: params.eventId,
  registrantType: entry.registrantType,
  registrantId: entry.registrantId,
  rosterRole: entry.rosterRole,
  status,
  parentId: null,
  eventTeamId: resolveCompatibilityEventTeamId(entry),
  divisionId,
  createdBy: normalizeEntityId(params.createdBy) ?? "system",
});

const upsertCompatibilityRegistration = async (
  client: PrismaLike,
  params: CompatibilityRegistrationParameters,
  state: CompatibilityRegistrationState,
  entry: CompatibilityRegistrationEntry,
): Promise<void> => {
  const id = buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: entry.registrantType,
    registrantId: entry.registrantId,
  });
  const divisionId =
    entry.rosterRole === "PARTICIPANT"
      ? resolveCompatibilityRegistrationDivisionId(
          params,
          state,
          entry.registrantId,
        )
      : null;
  if (
    entry.rosterRole === "PARTICIPANT" &&
    state.entryDivisionRows.length > 0 &&
    !divisionId
  ) {
    return;
  }
  const existing = state.existingRowsById.get(id) ?? null;
  const status = resolveCompatibilityRegistrationStatus(entry, existing);
  const input = existing
    ? buildExistingCompatibilityRegistrationInput(
        params,
        state,
        entry,
        id,
        divisionId,
        status,
        existing,
      )
    : buildNewCompatibilityRegistrationInput(
        params,
        entry,
        divisionId,
        status,
      );
  await upsertEventRegistration(input as any, client);
};

const deleteCompatibilityPlaceholderRegistrations = async (
  client: PrismaLike,
  params: CompatibilityRegistrationParameters,
  state: CompatibilityRegistrationState,
  now: Date,
): Promise<void> => {
  const ids = Array.from(state.placeholderTeamIds);
  if (!ids.length) {
    return;
  }
  const where = {
    eventId: params.eventId,
    registrantType: "TEAM",
    rosterRole: "PARTICIPANT",
    OR: [{ registrantId: { in: ids } }, { eventTeamId: { in: ids } }],
  };
  if (typeof (client as any).eventRegistrations?.deleteMany === "function") {
    await (client as any).eventRegistrations.deleteMany({ where });
    return;
  }
  if (typeof (client as any).eventRegistrations?.updateMany === "function") {
    await (client as any).eventRegistrations.updateMany({
      where: {
        ...where,
        status: { in: [...ACTIVE_EVENT_REGISTRATION_STATUSES] },
      },
      data: {
        status: "CANCELLED",
        updatedAt: now,
      },
    });
  }
};

const cancelMissingCompatibilityRegistrations = async (
  client: PrismaLike,
  eventId: string,
  where: Record<string, unknown>,
  desiredIds: string[],
  now: Date,
): Promise<void> => {
  if (typeof (client as any).eventRegistrations?.updateMany !== "function") {
    return;
  }
  await (client as any).eventRegistrations.updateMany({
    where: {
      eventId,
      slotId: null,
      occurrenceDate: null,
      status: { in: [...ACTIVE_EVENT_REGISTRATION_STATUSES] },
      ...where,
      ...(desiredIds.length ? { registrantId: { notIn: desiredIds } } : {}),
    },
    data: {
      status: "CANCELLED",
      updatedAt: now,
    },
  });
};

const syncCompatibilityRegistrationEntries = async (
  client: PrismaLike,
  params: CompatibilityRegistrationParameters,
  state: CompatibilityRegistrationState,
  now: Date,
): Promise<void> => {
  if (params.syncTeams) {
    await cancelMissingCompatibilityRegistrations(
      client,
      params.eventId,
      { registrantType: "TEAM", rosterRole: "PARTICIPANT" },
      state.teamIds,
      now,
    );
    await deleteCompatibilityPlaceholderRegistrations(client, params, state, now);
    for (const registrantId of state.activeTeamIds) {
      await upsertCompatibilityRegistration(client, params, state, {
        registrantType: "TEAM",
        registrantId,
        rosterRole: "PARTICIPANT",
      });
    }
  }
  if (params.syncUsers) {
    await cancelMissingCompatibilityRegistrations(
      client,
      params.eventId,
      { registrantType: "SELF", rosterRole: "PARTICIPANT" },
      state.userIds,
      now,
    );
    for (const registrantId of state.userIds) {
      await upsertCompatibilityRegistration(client, params, state, {
        registrantType: "SELF",
        registrantId,
        rosterRole: "PARTICIPANT",
      });
    }
  }
  if (params.syncWaitList) {
    await cancelMissingCompatibilityRegistrations(
      client,
      params.eventId,
      { rosterRole: "WAITLIST" },
      state.waitListIds,
      now,
    );
    for (const registrantId of state.waitListIds) {
      await upsertCompatibilityRegistration(client, params, state, {
        registrantType: state.waitListTeamIds.has(registrantId)
          ? "TEAM"
          : "SELF",
        registrantId,
        rosterRole: "WAITLIST",
      });
    }
  }
  if (params.syncFreeAgents) {
    await cancelMissingCompatibilityRegistrations(
      client,
      params.eventId,
      { registrantType: "SELF", rosterRole: "FREE_AGENT" },
      state.freeAgentIds,
      now,
    );
    for (const registrantId of state.freeAgentIds) {
      await upsertCompatibilityRegistration(client, params, state, {
        registrantType: "SELF",
        registrantId,
        rosterRole: "FREE_AGENT",
      });
    }
  }
};

export const syncEventParticipantRegistrationsFromCompatibilityIds = async (
  client: PrismaLike,
  params: CompatibilityRegistrationParameters,
): Promise<void> => {
  if (typeof (client as any).eventRegistrations?.upsert !== "function") {
    return;
  }
  const now = new Date();
  const state = await loadCompatibilityRegistrationState(client, params);
  await syncCompatibilityRegistrationEntries(client, params, state, now);
};

const loadEventOfficialRows = async (
  client: PrismaLike,
  eventId: string,
): Promise<any[]> => {
  if (typeof (client as any).eventOfficials?.findMany !== "function") {
    return [];
  }
  return (client as any).eventOfficials.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
};

const persistEventOfficialRows = async (
  client: PrismaLike,
  eventId: string,
  rows: EventOfficialRecord[],
): Promise<void> => {
  if (typeof (client as any).eventOfficials?.deleteMany !== "function") {
    return;
  }
  await (client as any).eventOfficials.deleteMany({ where: { eventId } });
  for (const row of rows) {
    await (client as any).eventOfficials.create({
      data: {
        id: row.id,
        eventId,
        userId: row.userId,
        positionIds: row.positionIds,
        fieldIds: row.fieldIds,
        isActive: row.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
};

const isOfficialAssignmentWithinField = (
  official: EventOfficialRecord,
  matchFieldId: string | null,
): boolean => {
  if (!matchFieldId || !official.fieldIds.length) {
    return true;
  }
  return official.fieldIds.includes(matchFieldId);
};

const isValidOfficialAssignmentIdentity = (
  row: Record<string, unknown>,
  activeOfficialById: Map<string, EventOfficialRecord>,
): boolean => {
  const userId = normalizeEntityId(row.userId);
  const eventOfficialId = normalizeEntityId(row.eventOfficialId);
  if (!userId && !eventOfficialId) {
    return true;
  }
  if (!userId || !eventOfficialId) {
    return false;
  }
  const official = activeOfficialById.get(eventOfficialId);
  if (!official || official.userId !== userId) {
    return false;
  }
  const positionId = normalizeEntityId(row.positionId);
  return Boolean(
    positionId &&
      official.positionIds.includes(positionId),
  ) && isOfficialAssignmentWithinField(official, row.matchFieldId as string | null);
};

const shouldKeepMatchOfficialAssignment = (
  assignment: unknown,
  activeOfficialById: Map<string, EventOfficialRecord>,
  _activeOfficialByUserId: Map<string, EventOfficialRecord>,
  matchFieldId: string | null,
): boolean => {
  if (!assignment || typeof assignment !== "object") {
    return false;
  }
  const row = assignment as Record<string, unknown>;
  const holderType =
    typeof row.holderType === "string"
      ? row.holderType.trim().toUpperCase()
      : "";
  if (holderType !== "OFFICIAL") {
    return true;
  }
  return isValidOfficialAssignmentIdentity({
    ...row,
    matchFieldId,
  }, activeOfficialById);
};

const canonicalizeOfficialAssignment = (
  assignment: Record<string, unknown>,
): { assignment: Record<string, unknown>; changed: boolean } => {
  const canonicalAssignment = {
    ...assignment,
    positionId: normalizeEntityId(assignment.positionId),
    slotIndex: Number(assignment.slotIndex),
    holderType:
      typeof assignment.holderType === "string"
        ? assignment.holderType.trim().toUpperCase()
        : assignment.holderType,
    userId: normalizeEntityId(assignment.userId),
    eventOfficialId: normalizeEntityId(assignment.eventOfficialId),
    checkedIn: assignment.checkedIn === true,
    hasConflict: assignment.hasConflict === true,
  };
  const changed =
    assignment.positionId !== canonicalAssignment.positionId ||
    assignment.slotIndex !== canonicalAssignment.slotIndex ||
    assignment.holderType !== canonicalAssignment.holderType ||
    assignment.userId !== canonicalAssignment.userId ||
    assignment.eventOfficialId !== canonicalAssignment.eventOfficialId ||
    assignment.checkedIn !== canonicalAssignment.checkedIn ||
    assignment.hasConflict !== canonicalAssignment.hasConflict;
  return { assignment: canonicalAssignment, changed };
};

const isConfiguredOfficialAssignmentSlot = (
  holderType: string,
  positionId: string | null,
  slotIndex: number,
  configuredSlotCount: number | undefined,
  officialPositions: EventOfficialPosition[] | undefined,
): boolean =>
  holderType === "OFFICIAL" &&
  Boolean(positionId) &&
  Number.isInteger(slotIndex) &&
  slotIndex >= 0 &&
  (officialPositions === undefined ||
    (typeof configuredSlotCount === "number" &&
      slotIndex < configuredSlotCount));

const replacementOfficialAssignment = (
  assignment: unknown,
  configuredPositionCounts: Map<string, number>,
  officialPositions: EventOfficialPosition[] | undefined,
): Record<string, unknown>[] => {
  if (!assignment || typeof assignment !== "object") {
    return [];
  }
  const row = assignment as Record<string, unknown>;
  const holderType =
    typeof row.holderType === "string"
      ? row.holderType.trim().toUpperCase()
      : "";
  const positionId = normalizeEntityId(row.positionId);
  const slotIndex = Number(row.slotIndex);
  const configuredSlotCount = positionId
    ? configuredPositionCounts.get(positionId)
    : undefined;
  if (
    !isConfiguredOfficialAssignmentSlot(
      holderType,
      positionId,
      slotIndex,
      configuredSlotCount,
      officialPositions,
    )
  ) {
    return [];
  }
  return [
    {
      positionId,
      slotIndex,
      holderType: "OFFICIAL",
      userId: null,
      eventOfficialId: null,
      checkedIn: false,
      hasConflict: false,
    },
  ];
};

const sanitizeOfficialAssignment = (
  assignment: unknown,
  activeOfficialById: Map<string, EventOfficialRecord>,
  activeOfficialByUserId: Map<string, EventOfficialRecord>,
  matchFieldId: string | null,
  configuredPositionCounts: Map<string, number>,
  officialPositions: EventOfficialPosition[] | undefined,
): { assignments: Record<string, unknown>[]; changed: boolean } => {
  if (
    shouldKeepMatchOfficialAssignment(
      assignment,
      activeOfficialById,
      activeOfficialByUserId,
      matchFieldId,
    )
  ) {
    const canonical = canonicalizeOfficialAssignment(
      assignment as Record<string, unknown>,
    );
    return {
      assignments: [canonical.assignment],
      changed: canonical.changed,
    };
  }
  return {
    assignments: replacementOfficialAssignment(
      assignment,
      configuredPositionCounts,
      officialPositions,
    ),
    changed: true,
  };
};

const sanitizeOfficialAssignments = (
  rawAssignments: unknown[],
  activeOfficialById: Map<string, EventOfficialRecord>,
  activeOfficialByUserId: Map<string, EventOfficialRecord>,
  matchFieldId: string | null,
  configuredPositionCounts: Map<string, number>,
  officialPositions: EventOfficialPosition[] | undefined,
): { assignments: Record<string, unknown>[]; changed: boolean } => {
  let changed = false;
  const assignments = rawAssignments.flatMap((assignment) => {
    const sanitized = sanitizeOfficialAssignment(
      assignment,
      activeOfficialById,
      activeOfficialByUserId,
      matchFieldId,
      configuredPositionCounts,
      officialPositions,
    );
    changed ||= sanitized.changed;
    return sanitized.assignments;
  });
  return { assignments, changed };
};

const officialAssignmentsEqual = (
  left: MatchOfficialAssignment | undefined,
  right: MatchOfficialAssignment | undefined,
): boolean => {
  if (!left || !right) {
    return false;
  }
  const keys: Array<keyof MatchOfficialAssignment> = [
    "positionId",
    "slotIndex",
    "holderType",
    "userId",
    "eventOfficialId",
    "checkedIn",
    "hasConflict",
  ];
  for (const key of keys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
};

const officialAssignmentsChanged = (
  nextAssignments: MatchOfficialAssignment[],
  sanitizedAssignments: Record<string, unknown>[],
): boolean => {
  if (nextAssignments.length !== sanitizedAssignments.length) {
    return true;
  }
  return nextAssignments.some((assignment, index) =>
    !officialAssignmentsEqual(
      assignment,
      sanitizedAssignments[index] as unknown as MatchOfficialAssignment,
    ),
  );
};

const shouldClearLegacyOfficialAssignment = (
  match: Record<string, unknown>,
  matchFieldId: string | null,
  activeOfficialByUserId: Map<string, EventOfficialRecord>,
): boolean => {
  const existingPrimaryOfficialId = normalizeEntityId(match.officialId);
  if (!existingPrimaryOfficialId) {
    return false;
  }
  const legacyOfficial = activeOfficialByUserId.get(existingPrimaryOfficialId);
  return (
    !legacyOfficial ||
    Boolean(
      matchFieldId &&
        legacyOfficial.fieldIds.length &&
        !legacyOfficial.fieldIds.includes(matchFieldId),
    )
  );
};

const cleanupOfficialAssignmentsForMatch = (
  match: Record<string, unknown>,
  activeOfficialById: Map<string, EventOfficialRecord>,
  activeOfficialByUserId: Map<string, EventOfficialRecord>,
  configuredPositionCounts: Map<string, number>,
  officialPositions: EventOfficialPosition[] | undefined,
): {
  matchId: string | null;
  assignments: MatchOfficialAssignment[];
  assignmentsChanged: boolean;
  primaryOfficialId: string | null;
  primaryOfficialCheckedIn: boolean;
} => {
  const matchFieldId = normalizeEntityId(match.fieldId);
  const rawAssignments = Array.isArray(match.officialIds)
    ? match.officialIds
    : [];
  const sanitized = sanitizeOfficialAssignments(
    rawAssignments,
    activeOfficialById,
    activeOfficialByUserId,
    matchFieldId,
    configuredPositionCounts,
    officialPositions,
  );
  const sanitizedAssignments =
    sanitized.assignments as unknown as MatchOfficialAssignment[];
  const nextAssignments =
    officialPositions === undefined
      ? sanitizedAssignments
      : completeMatchOfficialAssignmentSlots(
          sanitizedAssignments,
          officialPositions,
        );
  const assignmentsChanged =
    sanitized.changed ||
    officialAssignmentsChanged(nextAssignments, sanitized.assignments);
  const primaryOfficialId = nextAssignments.length
    ? deriveLegacyOfficialIdFromAssignments(nextAssignments)
    : null;
  const primaryOfficialCheckedIn = nextAssignments.length
    ? deriveLegacyOfficialCheckedInFromAssignments(nextAssignments)
    : false;
  return {
    matchId: normalizeEntityId(match.id),
    assignments: nextAssignments,
    assignmentsChanged:
      assignmentsChanged ||
      shouldClearLegacyOfficialAssignment(
        match,
        matchFieldId,
        activeOfficialByUserId,
      ),
    primaryOfficialId,
    primaryOfficialCheckedIn,
  };
};

export const clearRemovedEventOfficialMatchAssignments = async (
  client: PrismaLike,
  eventId: string,
  eventOfficials: EventOfficialRecord[],
  officialPositions?: EventOfficialPosition[],
): Promise<number> => {
  if (
    typeof (client as any).matches?.findMany !== "function" ||
    typeof (client as any).matches?.update !== "function"
  ) {
    return 0;
  }
  const activeOfficials = eventOfficials.filter(
    (official) => official.isActive !== false,
  );
  const activeOfficialById = new Map(
    activeOfficials.map((official) => [official.id, official]),
  );
  const activeOfficialByUserId = new Map(
    activeOfficials.map((official) => [official.userId, official]),
  );
  const configuredPositionCounts = new Map(
    (officialPositions ?? []).map((position) => [position.id, position.count]),
  );
  const matches = await (client as any).matches.findMany({
    where: { eventId },
    select: {
      id: true,
      officialId: true,
      officialIds: true,
      officialCheckedIn: true,
      fieldId: true,
    },
  });
  let updatedCount = 0;
  for (const match of matches as Array<Record<string, unknown>>) {
    const cleanup = cleanupOfficialAssignmentsForMatch(
      match,
      activeOfficialById,
      activeOfficialByUserId,
      configuredPositionCounts,
      officialPositions,
    );
    if (!cleanup.assignmentsChanged || !cleanup.matchId) {
      continue;
    }
    await (client as any).matches.update({
      where: { id: cleanup.matchId },
      data: {
        officialIds: cleanup.assignments.length
          ? (cleanup.assignments as unknown as Record<string, unknown>[])
          : null,
        officialId: cleanup.primaryOfficialId,
        officialCheckedIn: cleanup.primaryOfficialCheckedIn,
      },
    });
    updatedCount += 1;
  }
  return updatedCount;
};

const resolveBillingOwnerHasStripeAccount = async (
  client: PrismaLike,
  params: {
    organizationId?: unknown;
    hostId?: unknown;
  },
): Promise<boolean> => {
  const organizationId = normalizeEntityId(params.organizationId);
  if (organizationId) {
    const organization = await client.organizations.findUnique({
      where: { id: organizationId },
      select: { hasStripeAccount: true, verificationStatus: true },
    });
    return canOrganizationUsePaidBilling(organization);
  }

  const hostId = normalizeEntityId(params.hostId);
  if (!hostId) {
    return false;
  }
  const hostProfile = await client.userData.findUnique({
    where: { id: hostId },
    select: { hasStripeAccount: true },
  });
  return Boolean(hostProfile?.hasStripeAccount);
};

const DEFAULT_DIVISION_KEY = "open";
const DEFAULT_DIVISION_KIND: "LEAGUE" | "PLAYOFF" = "LEAGUE";
const LEAGUE_SCORING_BOOLEAN_FIELDS: readonly string[] = [];
const LEAGUE_SCORING_NUMBER_FIELDS = [
  "pointsForWin",
  "pointsForDraw",
  "pointsForLoss",
  "pointsPerGoalScored",
  "pointsPerGoalConceded",
] as const;

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const normalizeDivisionKind = (
  value: unknown,
  fallback: "LEAGUE" | "PLAYOFF" = DEFAULT_DIVISION_KIND,
): "LEAGUE" | "PLAYOFF" => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "PLAYOFF") {
    return "PLAYOFF";
  }
  return "LEAGUE";
};

const normalizeStandingsOverrides = (
  value: unknown,
): Record<string, number> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([teamId, points]) => {
      const normalizedTeamId = typeof teamId === "string" ? teamId.trim() : "";
      const normalizedPoints =
        typeof points === "number" ? points : Number(points);
      if (!normalizedTeamId || !Number.isFinite(normalizedPoints)) {
        return null;
      }
      return [normalizedTeamId, normalizedPoints] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);
  if (!entries.length) {
    return null;
  }
  return Object.fromEntries(entries);
};

type PlayoffDivisionConfigPayload = {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  prize: string;
  fieldCount: number;
  restTimeMinutes: number;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
};

const PLAYOFF_CONFIG_KEYS: ReadonlyArray<keyof PlayoffDivisionConfigPayload> = [
  "doubleElimination",
  "winnerSetCount",
  "loserSetCount",
  "winnerBracketPointsToVictory",
  "loserBracketPointsToVictory",
  "prize",
  "fieldCount",
  "restTimeMinutes",
  "matchDurationMinutes",
  "setDurationMinutes",
];

const normalizePlayoffDivisionConfig = (
  value: unknown,
): PlayoffDivisionConfigPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = PLAYOFF_CONFIG_KEYS.some(
    (key) =>
      Object.prototype.hasOwnProperty.call(row, key) &&
      row[key] !== null &&
      row[key] !== undefined,
  );
  if (!hasConfigValue) {
    return null;
  }

  const normalizeNumber = (
    input: unknown,
    fallback: number,
    min: number = 0,
  ): number => {
    const parsed = typeof input === "number" ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.trunc(parsed));
  };
  const normalizeOptionalDuration = (input: unknown): number | undefined => {
    if (input === null || input === undefined || input === "") {
      return undefined;
    }
    const parsed = typeof input === "number" ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(0, Math.trunc(parsed));
  };

  const normalizePoints = (
    input: unknown,
    expectedLength: number,
  ): number[] => {
    const values = Array.isArray(input)
      ? input
          .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.max(1, Math.trunc(entry)))
      : [];
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const winnerSetCount = normalizeNumber(row.winnerSetCount, 1, 1);
  const doubleElimination = Boolean(row.doubleElimination);
  const loserSetCount = normalizeNumber(row.loserSetCount, 1, 1);
  const normalizedLoserSetCount = doubleElimination ? loserSetCount : 1;

  return {
    doubleElimination,
    winnerSetCount,
    loserSetCount: normalizedLoserSetCount,
    winnerBracketPointsToVictory: normalizePoints(
      row.winnerBracketPointsToVictory,
      winnerSetCount,
    ),
    loserBracketPointsToVictory: normalizePoints(
      row.loserBracketPointsToVictory,
      normalizedLoserSetCount,
    ),
    prize: typeof row.prize === "string" ? row.prize : "",
    fieldCount: normalizeNumber(row.fieldCount, 1, 1),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0, 0),
    matchDurationMinutes: normalizeOptionalDuration(row.matchDurationMinutes),
    setDurationMinutes: normalizeOptionalDuration(row.setDurationMinutes),
  };
};

const serializePlayoffDivisionConfig = (
  value: PlayoffDivisionConfigPayload,
): Record<string, unknown> => ({
  doubleElimination: value.doubleElimination,
  winnerSetCount: value.winnerSetCount,
  loserSetCount: value.loserSetCount,
  winnerBracketPointsToVictory: [...value.winnerBracketPointsToVictory],
  loserBracketPointsToVictory: [...value.loserBracketPointsToVictory],
  prize: value.prize,
  fieldCount: value.fieldCount,
  restTimeMinutes: value.restTimeMinutes,
  matchDurationMinutes: value.matchDurationMinutes ?? null,
  setDurationMinutes: value.setDurationMinutes ?? null,
});

const normalizeDivisionPlayoffConfigFields = (
  value: unknown,
): PlayoffDivisionConfigPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return normalizePlayoffDivisionConfig({
    doubleElimination: row.playoffDoubleElimination,
    winnerSetCount: row.playoffWinnerSetCount,
    loserSetCount: row.playoffLoserSetCount,
    winnerBracketPointsToVictory: row.playoffWinnerBracketPointsToVictory,
    loserBracketPointsToVictory: row.playoffLoserBracketPointsToVictory,
    prize: row.playoffPrize,
    fieldCount: row.playoffFieldCount,
    restTimeMinutes: row.playoffRestTimeMinutes,
    matchDurationMinutes: row.playoffMatchDurationMinutes,
    setDurationMinutes: row.playoffSetDurationMinutes,
  });
};

const nullablePlayoffConfigField = <T>(
  value: T | null | undefined,
): T | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return value;
};

const playoffConfigArrayField = (
  value: number[] | null | undefined,
): number[] => {
  if (value === null || value === undefined) {
    return [];
  }
  return value;
};

const readPlayoffConfigField = <
  K extends keyof PlayoffDivisionConfigPayload,
>(
  value: PlayoffDivisionConfigPayload | null | undefined,
  key: K,
): PlayoffDivisionConfigPayload[K] | undefined => {
  if (!value) {
    return undefined;
  }
  return value[key];
};

const playoffConfigToDivisionFields = (
  value: PlayoffDivisionConfigPayload | null | undefined,
) => ({
  playoffDoubleElimination: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "doubleElimination"),
  ),
  playoffWinnerSetCount: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "winnerSetCount"),
  ),
  playoffLoserSetCount: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "loserSetCount"),
  ),
  playoffWinnerBracketPointsToVictory: playoffConfigArrayField(
    readPlayoffConfigField(value, "winnerBracketPointsToVictory"),
  ),
  playoffLoserBracketPointsToVictory: playoffConfigArrayField(
    readPlayoffConfigField(value, "loserBracketPointsToVictory"),
  ),
  playoffPrize: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "prize"),
  ),
  playoffFieldCount: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "fieldCount"),
  ),
  playoffRestTimeMinutes: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "restTimeMinutes"),
  ),
  playoffMatchDurationMinutes: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "matchDurationMinutes"),
  ),
  playoffSetDurationMinutes: nullablePlayoffConfigField(
    readPlayoffConfigField(value, "setDurationMinutes"),
  ),
});

type LeagueDivisionConfigPayload = LeagueDivisionConfig;

const LEAGUE_CONFIG_KEYS: ReadonlyArray<keyof LeagueDivisionConfigPayload> = [
  "gamesPerOpponent",
  "usesSets",
  "matchDurationMinutes",
  "setDurationMinutes",
  "setsPerMatch",
  "pointsToVictory",
  "restTimeMinutes",
];

const hasLeagueDivisionConfigValue = (
  row: Record<string, unknown>,
): boolean =>
  LEAGUE_CONFIG_KEYS.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      return false;
    }
    return row[key] !== null && row[key] !== undefined;
  });

const normalizeLeagueConfigNumber = (
  input: unknown,
  min: number,
): number | undefined => {
  const parsed = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(min, Math.trunc(parsed));
};

const normalizeLeagueConfigSetCount = (
  input: unknown,
): number | undefined => {
  const parsed = normalizeLeagueConfigNumber(input, 1);
  if (parsed === undefined || ![1, 3, 5].includes(parsed)) {
    return undefined;
  }
  return parsed;
};

const normalizeLeagueConfigPoints = (
  input: unknown,
  expectedLength: number,
): number[] | undefined => {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const values = input
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(1, Math.trunc(entry)));
  const next = values.slice(0, expectedLength);
  while (next.length < expectedLength) {
    next.push(21);
  }
  return next;
};

const resolveLeagueConfigUsesSets = (
  row: Record<string, unknown>,
): boolean | undefined => {
  if (typeof row.usesSets === "boolean") {
    return row.usesSets;
  }
  if (
    Object.prototype.hasOwnProperty.call(row, "setsPerMatch") ||
    Object.prototype.hasOwnProperty.call(row, "setDurationMinutes") ||
    Object.prototype.hasOwnProperty.call(row, "pointsToVictory")
  ) {
    return true;
  }
  return undefined;
};

const buildLeagueDivisionConfig = (
  row: Record<string, unknown>,
  usesSets: boolean | undefined,
): LeagueDivisionConfigPayload => {
  const setsPerMatch = usesSets
    ? (normalizeLeagueConfigSetCount(row.setsPerMatch) ?? 1)
    : undefined;
  const config: LeagueDivisionConfigPayload = {
    gamesPerOpponent: normalizeLeagueConfigNumber(row.gamesPerOpponent, 1),
    usesSets,
    matchDurationMinutes: normalizeLeagueConfigNumber(
      row.matchDurationMinutes,
      0,
    ),
    restTimeMinutes: normalizeLeagueConfigNumber(row.restTimeMinutes, 0),
    setDurationMinutes: usesSets
      ? normalizeLeagueConfigNumber(row.setDurationMinutes, 0)
      : undefined,
    setsPerMatch,
    pointsToVictory: usesSets
      ? normalizeLeagueConfigPoints(
          row.pointsToVictory,
          setsPerMatch ?? 1,
        )
      : undefined,
  };
  return Object.fromEntries(
    Object.entries(config).filter(([, entry]) => entry !== undefined),
  ) as LeagueDivisionConfigPayload;
};

const normalizeLeagueDivisionConfig = (
  value: unknown,
): LeagueDivisionConfigPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (!hasLeagueDivisionConfigValue(row)) {
    return null;
  }
  return buildLeagueDivisionConfig(row, resolveLeagueConfigUsesSets(row));
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const keys = value
    .map((entry) => normalizeDivisionKey(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(keys));
};

const isMissingTimeSlotDivisionsColumnError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeslots") &&
    normalized.includes("divisions") &&
    normalized.includes("does not exist")
  );
};

const persistTimeSlotDivisions = async (
  client: PrismaLike,
  slotId: string,
  divisions: string[],
  updatedAt: Date,
): Promise<void> => {
  if (typeof (client as any).$executeRaw !== "function") {
    return;
  }
  try {
    await client.$executeRaw`
      UPDATE "TimeSlots"
      SET "divisions" = ${divisions}::TEXT[],
          "updatedAt" = ${updatedAt}
      WHERE "id" = ${slotId}
    `;
  } catch (error) {
    if (isMissingTimeSlotDivisionsColumnError(error)) {
      return;
    }
    throw error;
  }
};

const isMissingTimeSlotArrayColumnError = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2022") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeslots") &&
    (normalized.includes("scheduledfieldids") ||
      normalized.includes("daysofweek") ||
      normalized.includes("(not available)")) &&
    normalized.includes("does not exist")
  );
};

const loadTimeSlotRows = async (
  client: PrismaLike,
  timeSlotIds: string[],
): Promise<any[]> => {
  if (!timeSlotIds.length) {
    return [];
  }
  try {
    return await client.timeSlots.findMany({
      where: { id: { in: timeSlotIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        dayOfWeek: true,
        daysOfWeek: true,
        startTimeMinutes: true,
        endTimeMinutes: true,
        startDate: true,
        timeZone: true,
        repeating: true,
        endDate: true,
        scheduledFieldId: true,
        scheduledFieldIds: true,
        price: true,
        taxHandling: true,
        divisions: true,
        requiredTemplateIds: true,
        hostRequiredTemplateIds: true,
        sourceType: true,
        rentalBookingId: true,
        rentalBookingItemId: true,
        rentalLocked: true,
      } as any,
    });
  } catch (error) {
    if (!isMissingTimeSlotArrayColumnError(error)) {
      throw error;
    }
    const legacyRows = await client.timeSlots.findMany({
      where: { id: { in: timeSlotIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        dayOfWeek: true,
        startTimeMinutes: true,
        endTimeMinutes: true,
        startDate: true,
        repeating: true,
        endDate: true,
        scheduledFieldId: true,
        price: true,
        taxHandling: true,
        sourceType: true,
        rentalBookingId: true,
        rentalBookingItemId: true,
        rentalLocked: true,
      } as any,
    });
    return legacyRows.map((row: any) => ({
      ...row,
      daysOfWeek:
        row.dayOfWeek === null || row.dayOfWeek === undefined
          ? []
          : [Number(row.dayOfWeek)],
      scheduledFieldIds: row.scheduledFieldId
        ? [String(row.scheduledFieldId)]
        : [],
      divisions: [],
      requiredTemplateIds: [],
    }));
  }
};

const defaultDivisionKeysForSport = (sportId: unknown): string[] => {
  const normalizedSport =
    typeof sportId === "string" ? sportId.toLowerCase() : "";
  if (normalizedSport.includes("soccer")) {
    return ["beginner", "advanced"];
  }
  return ["beginner", "intermediate", "advanced"];
};

const buildDivisionDisplayName = (
  key: string,
  sportId?: string | null,
): string => {
  if (!key.length) return "Open";
  const literalName = key
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
  const normalizedKey = key.trim().toLowerCase().replace(/-/g, "_");
  if (!/(?:^|_)skill_|(?:^|_)age_/.test(normalizedKey)) {
    return literalName || "Open";
  }
  const inferred = inferDivisionDetails({
    identifier: key,
    sportInput: sportId ?? undefined,
  });
  return inferred.defaultName?.trim() || literalName || "Open";
};

const buildDivisionId = (eventId: string, key: string): string =>
  buildEventDivisionId(eventId, key);

const normalizeEventIdForDivisionScope = (eventId: string): string =>
  (eventId || "event").toString().trim().toLowerCase().replace(/\s+/g, "_") ||
  "event";

const isSameEventScopedDivisionId = (
  identifier: string,
  eventId: string,
): boolean => {
  const marker = "__division__";
  const markerIndex = identifier.lastIndexOf(marker);
  if (markerIndex < 0) {
    return false;
  }

  const prefix = identifier.slice(0, markerIndex);
  const normalizedEventId = normalizeEventIdForDivisionScope(eventId);
  if (prefix === normalizedEventId) {
    return true;
  }

  if (!prefix.startsWith(`${normalizedEventId}_`)) {
    return false;
  }

  const suffix = prefix.slice(normalizedEventId.length + 1);
  return /^\d+$/.test(suffix);
};

const scopeDivisionIdentifierToEvent = (
  identifier: string,
  eventId: string,
): string => {
  const normalizedIdentifier = normalizeDivisionKey(identifier) ?? identifier;
  if (normalizedIdentifier.startsWith("division_")) {
    return normalizedIdentifier;
  }
  if (isSameEventScopedDivisionId(normalizedIdentifier, eventId)) {
    return normalizedIdentifier;
  }
  const token =
    extractDivisionTokenFromId(normalizedIdentifier) ?? normalizedIdentifier;
  return buildDivisionId(eventId, token);
};

const normalizeDivisionIdentifierList = (
  value: unknown,
  eventId?: string,
): string[] => {
  const normalized = normalizeDivisionKeys(value);
  if (!normalized.length) {
    return [];
  }
  if (!eventId) {
    return normalized;
  }
  return normalized.map((entry) =>
    scopeDivisionIdentifierToEvent(entry, eventId),
  );
};

const normalizePlacementDivisionIdentifierList = (
  value: unknown,
  eventId?: string,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const normalized = normalizeDivisionKey(entry);
    if (!normalized) {
      return "";
    }
    if (!eventId) {
      return normalized;
    }
    return scopeDivisionIdentifierToEvent(normalized, eventId);
  });
};

type DivisionDetailPayload = {
  id: string;
  sourceDivisionId?: string | null;
  key: string;
  name: string;
  kind: "LEAGUE" | "PLAYOFF";
  role?: "ENTRY" | "PHASE";
  isSystemGenerated?: boolean;
  phase?: "LEAGUE" | "POOL" | "BRACKET" | "PLAYOFF" | null;
  divisionTypeId: string;
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  divisionTypeName: string;
  ratingType: DivisionRatingType;
  gender: DivisionGender;
  price?: number | null;
  maxParticipants?: number | null;
  playoffTeamCount?: number | null;
  poolCount?: number | null;
  poolTeamCount?: number | null;
  phaseSettings?: DivisionPhaseSettingsMap;
  playoffPlacementDivisionIds?: string[];
  standingsOverrides?: Record<string, number> | null;
  playoffConfig?: PlayoffDivisionConfigPayload | null;
  gamesPerOpponent?: number | null;
  restTimeMinutes?: number | null;
  usesSets?: boolean | null;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
  setsPerMatch?: number | null;
  pointsToVictory?: number[];
  standingsConfirmedAt?: string | null;
  standingsConfirmedBy?: string | null;
  allowPaymentPlans?: boolean | null;
  installmentCount?: number | null;
  installmentDueDates?: string[];
  installmentDueRelativeDays?: number[];
  installmentAmounts?: number[];
  ageCutoffDate: string | null;
  ageCutoffLabel: string | null;
  ageCutoffSource: string | null;
  fieldIds: string[];
  teamIds?: string[];
};

const resolveDivisionDetailSportInput = (
  row: Record<string, unknown>,
  sportId?: string | null,
): string | undefined =>
  typeof row.sportId === "string" ? row.sportId : (sportId ?? undefined);

const resolveDivisionDetailRawKey = (
  row: Record<string, unknown>,
  rawId: string | null,
): string | null =>
  normalizeDivisionKey(row.key) ??
  (rawId ? extractDivisionTokenFromId(rawId) : null);

const assertDivisionDetailTypeIdsMatch = (
  rawComposite: ReturnType<typeof parseCompositeDivisionTypeId>,
  rawSkillDivisionTypeId: string | null,
  rawAgeDivisionTypeId: string | null,
): void => {
  if (
    rawComposite &&
    ((rawSkillDivisionTypeId &&
      rawSkillDivisionTypeId !== rawComposite.skillDivisionTypeId) ||
      (rawAgeDivisionTypeId &&
        rawAgeDivisionTypeId !== rawComposite.ageDivisionTypeId))
  ) {
    throw new Error(
      "Division age and skill values do not match the composite division type.",
    );
  }
};

type DivisionDetailIdentity = {
  row: Record<string, unknown>;
  rawId: string | null;
  inferred: ReturnType<typeof inferDivisionDetails>;
  gender: DivisionGender;
  ratingType: DivisionRatingType;
  divisionTypeId: string;
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  key: string;
  id: string;
  divisionTypeName: string;
  rawKind: "LEAGUE" | "PLAYOFF";
};

const buildDivisionDetailIdentity = (
  row: Record<string, unknown>,
  eventId: string,
  sportId: string | null | undefined,
  defaultKind: "LEAGUE" | "PLAYOFF",
): DivisionDetailIdentity => {
  const rawId = normalizeDivisionKey(row.id);
  const rawKey = resolveDivisionDetailRawKey(row, rawId);
  const sportInput = resolveDivisionDetailSportInput(row, sportId);
  const inferred = inferDivisionDetails({
    identifier: rawKey ?? rawId ?? "c_skill_open",
    sportInput,
    fallbackName: typeof row.name === "string" ? row.name : undefined,
  });
  const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
  const ratingType =
    normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
  const rawComposite = parseCompositeDivisionTypeId(
    normalizeDivisionKey(row.divisionTypeId),
  );
  const rawSkillDivisionTypeId = normalizeDivisionKey(
    row.skillDivisionTypeId,
  );
  const rawAgeDivisionTypeId = normalizeDivisionKey(row.ageDivisionTypeId);
  assertDivisionDetailTypeIdsMatch(
    rawComposite,
    rawSkillDivisionTypeId,
    rawAgeDivisionTypeId,
  );
  const normalizedTypeIds = normalizeDivisionTypeIds({
    divisionTypeId:
      normalizeDivisionKey(row.divisionTypeId) ?? inferred.divisionTypeId,
    skillDivisionTypeId: rawSkillDivisionTypeId,
    ageDivisionTypeId: rawAgeDivisionTypeId,
    ratingType,
  });
  const { divisionTypeId, skillDivisionTypeId, ageDivisionTypeId } =
    normalizedTypeIds;
  const key =
    normalizeDivisionKey(row.key) ??
    buildDivisionToken({
      gender,
      ratingType,
      divisionTypeId,
    });
  const id = rawId
    ? scopeDivisionIdentifierToEvent(rawId, eventId)
    : buildDivisionId(eventId, key);
  const divisionTypeName = deriveDivisionTypeDisplayName({
    sportInput,
    gender,
    ratingType,
    divisionTypeId,
  });
  return {
    row,
    rawId,
    inferred,
    gender,
    ratingType,
    divisionTypeId,
    skillDivisionTypeId,
    ageDivisionTypeId,
    key,
    id,
    divisionTypeName,
    rawKind: normalizeDivisionKind(row.kind, defaultKind),
  };
};

const normalizeDivisionDetailPhase = (
  value: unknown,
): "LEAGUE" | "POOL" | "BRACKET" | "PLAYOFF" | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!["LEAGUE", "POOL", "BRACKET", "PLAYOFF"].includes(normalized)) {
    return null;
  }
  return normalized as "LEAGUE" | "POOL" | "BRACKET" | "PLAYOFF";
};

const normalizeOptionalDivisionDetailList = <T>(
  value: unknown,
  normalize: (input: unknown) => T[],
): T[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return normalize(value);
};

type DivisionDetailOptionalValues = {
  rawPrice: number | null | undefined;
  rawMaxParticipants: number | null | undefined;
  rawPlayoffTeamCount: number | null | undefined;
  rawPoolCount: number | null | undefined;
  rawRole: "ENTRY" | "PHASE";
  rawPhase: "LEAGUE" | "POOL" | "BRACKET" | "PLAYOFF" | null;
  rawPlayoffPlacementDivisionIds: string[] | undefined;
  rawStandingsOverrides: Record<string, number> | null;
  rawPlayoffConfig: PlayoffDivisionConfigPayload | null | undefined;
  rawLeagueConfig: LeagueDivisionConfigPayload | null;
  rawPhaseSettings: DivisionPhaseSettingsMap | undefined;
  rawStandingsConfirmedAt: string | null;
  rawStandingsConfirmedBy: string | null;
  rawAllowPaymentPlans: boolean | null | undefined;
  rawInstallmentCount: number | null | undefined;
  rawInstallmentDueDates: string[] | undefined;
  rawInstallmentDueRelativeDays: number[] | undefined;
  rawInstallmentAmounts: number[] | undefined;
  hasTeamIdsInput: boolean;
  rawTeamIds: string[] | undefined;
};

const normalizeDivisionDetailRelationshipValues = (
  row: Record<string, unknown>,
  eventId: string,
  rawKind: "LEAGUE" | "PLAYOFF",
): Pick<
  DivisionDetailOptionalValues,
  | "rawPlayoffPlacementDivisionIds"
  | "rawPhaseSettings"
  | "hasTeamIdsInput"
  | "rawTeamIds"
> => {
  const hasPlayoffPlacementDivisionIdsInput =
    Object.prototype.hasOwnProperty.call(
      row,
      "playoffPlacementDivisionIds",
    );
  const hasPhaseSettingsInput = Object.prototype.hasOwnProperty.call(
    row,
    "phaseSettings",
  );
  const hasTeamIdsInput = Object.prototype.hasOwnProperty.call(row, "teamIds");
  return {
    rawPlayoffPlacementDivisionIds: hasPlayoffPlacementDivisionIdsInput
      ? normalizePlacementDivisionIdentifierList(
          row.playoffPlacementDivisionIds,
          eventId,
        )
      : undefined,
    rawPhaseSettings: hasPhaseSettingsInput
      ? normalizeDivisionPhaseSettingsMap(row.phaseSettings)
      : undefined,
    hasTeamIdsInput,
    rawTeamIds:
      rawKind === "PLAYOFF" || !hasTeamIdsInput
        ? undefined
        : normalizeTeamIdList(row.teamIds),
  };
};

const normalizeDivisionDetailOptionalValues = (
  row: Record<string, unknown>,
  eventId: string,
  defaultKind: "LEAGUE" | "PLAYOFF",
): DivisionDetailOptionalValues => {
  const rawKind = normalizeDivisionKind(row.kind, defaultKind);
  const relationships = normalizeDivisionDetailRelationshipValues(
    row,
    eventId,
    rawKind,
  );
  const hasExplicitPlayoffConfigClear =
    Object.prototype.hasOwnProperty.call(row, "playoffConfig") &&
    row.playoffConfig === null;
  const rawExplicitPlayoffConfig = normalizePlayoffDivisionConfig(
    row.playoffConfig,
  );
  return {
    rawPrice: coerceNullableNumber(row.price),
    rawMaxParticipants: coerceNullableNumber(row.maxParticipants),
    rawPlayoffTeamCount: coerceNullableNumber(row.playoffTeamCount),
    rawPoolCount: coerceNullableNumber(row.poolCount),
    rawRole:
      String(row.role ?? "ENTRY").toUpperCase() === "PHASE"
        ? "PHASE"
        : "ENTRY",
    rawPhase: normalizeDivisionDetailPhase(row.phase),
    rawPlayoffPlacementDivisionIds:
      relationships.rawPlayoffPlacementDivisionIds,
    rawStandingsOverrides: normalizeStandingsOverrides(
      row.standingsOverrides,
    ),
    rawPlayoffConfig:
      rawKind === "PLAYOFF"
        ? hasExplicitPlayoffConfigClear
          ? null
          : (rawExplicitPlayoffConfig ??
            normalizePlayoffDivisionConfig(row) ??
            undefined)
        : rawExplicitPlayoffConfig,
    rawLeagueConfig: normalizeLeagueDivisionConfig(row),
    rawPhaseSettings: relationships.rawPhaseSettings,
    rawStandingsConfirmedAt: normalizeIsoDateString(row.standingsConfirmedAt),
    rawStandingsConfirmedBy:
      typeof row.standingsConfirmedBy === "string"
        ? row.standingsConfirmedBy.trim() || null
        : null,
    rawAllowPaymentPlans: coerceNullableBoolean(row.allowPaymentPlans),
    rawInstallmentCount: coerceNullableNumber(row.installmentCount),
    rawInstallmentDueDates: normalizeOptionalDivisionDetailList(
      row.installmentDueDates,
      normalizeInstallmentDateList,
    ),
    rawInstallmentDueRelativeDays: normalizeOptionalDivisionDetailList(
      row.installmentDueRelativeDays,
      normalizeInstallmentRelativeDayList,
    ),
    rawInstallmentAmounts: normalizeOptionalDivisionDetailList(
      row.installmentAmounts,
      normalizeInstallmentAmountList,
    ),
    hasTeamIdsInput: relationships.hasTeamIdsInput,
    rawTeamIds: relationships.rawTeamIds,
  };
};

const normalizeDivisionDetailPrice = (
  value: number | null | undefined,
): number | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }
  return Math.max(0, Math.round(value));
};

const normalizeDivisionDetailCount = (
  value: number | null | undefined,
): number | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }
  return Math.max(0, Math.trunc(value));
};

const nullableDivisionDetailValue = <T>(
  value: T | null | undefined,
  fallback: T | null,
): T | null => {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
};

const optionalDivisionDetailProperty = <T>(
  key: string,
  value: T | undefined,
): Record<string, T> => {
  if (value === undefined) {
    return {};
  }
  return { [key]: value };
};

const divisionDetailTeamIdsProperty = (
  rawKind: "LEAGUE" | "PLAYOFF",
  hasTeamIdsInput: boolean,
  rawTeamIds: string[] | undefined,
): Record<string, string[] | undefined> => {
  if (rawKind === "PLAYOFF") {
    return { teamIds: [] };
  }
  if (hasTeamIdsInput) {
    return { teamIds: rawTeamIds };
  }
  return {};
};

const buildDivisionDetailPayload = (
  identity: DivisionDetailIdentity,
  values: DivisionDetailOptionalValues,
): DivisionDetailPayload => {
  const {
    row,
    id,
    key,
    inferred,
    divisionTypeId,
    skillDivisionTypeId,
    ageDivisionTypeId,
    divisionTypeName,
    gender,
    ratingType,
    rawKind,
  } = identity;
  return {
    id,
    sourceDivisionId: normalizeDivisionKey(row.sourceDivisionId),
    key,
    name: cleanDivisionDisplayName(row.name, divisionTypeName),
    role: values.rawRole,
    phase: values.rawPhase,
    kind: rawKind,
    divisionTypeId,
    skillDivisionTypeId,
    ageDivisionTypeId,
    divisionTypeName,
    ratingType,
    gender,
    price: normalizeDivisionDetailPrice(values.rawPrice),
    maxParticipants: normalizeDivisionDetailCount(values.rawMaxParticipants),
    playoffTeamCount: normalizeDivisionDetailCount(
      values.rawPlayoffTeamCount,
    ),
    poolCount: normalizeDivisionDetailCount(values.rawPoolCount),
    ...optionalDivisionDetailProperty(
      "phaseSettings",
      values.rawPhaseSettings,
    ),
    ...optionalDivisionDetailProperty(
      "playoffPlacementDivisionIds",
      values.rawPlayoffPlacementDivisionIds,
    ),
    standingsOverrides: values.rawStandingsOverrides,
    playoffConfig: values.rawPlayoffConfig,
    gamesPerOpponent: nullableDivisionDetailValue(
      values.rawLeagueConfig?.gamesPerOpponent,
      null,
    ),
    restTimeMinutes: nullableDivisionDetailValue(
      values.rawLeagueConfig?.restTimeMinutes,
      null,
    ),
    usesSets: nullableDivisionDetailValue(values.rawLeagueConfig?.usesSets, null),
    matchDurationMinutes: nullableDivisionDetailValue(
      values.rawLeagueConfig?.matchDurationMinutes,
      null,
    ),
    setDurationMinutes: nullableDivisionDetailValue(
      values.rawLeagueConfig?.setDurationMinutes,
      null,
    ),
    setsPerMatch: nullableDivisionDetailValue(
      values.rawLeagueConfig?.setsPerMatch,
      null,
    ),
    pointsToVictory: values.rawLeagueConfig?.pointsToVictory ?? [],
    standingsConfirmedAt: values.rawStandingsConfirmedAt,
    standingsConfirmedBy: values.rawStandingsConfirmedBy,
    allowPaymentPlans: values.rawAllowPaymentPlans,
    installmentCount: normalizeDivisionDetailCount(
      values.rawInstallmentCount,
    ),
    installmentDueDates: values.rawInstallmentDueDates,
    installmentDueRelativeDays: values.rawInstallmentDueRelativeDays,
    installmentAmounts: values.rawInstallmentAmounts,
    ageCutoffDate: normalizeIsoDateString(row.ageCutoffDate),
    ageCutoffLabel:
      typeof row.ageCutoffLabel === "string" ? row.ageCutoffLabel : null,
    ageCutoffSource:
      typeof row.ageCutoffSource === "string" ? row.ageCutoffSource : null,
    fieldIds: normalizeFieldIds(row.fieldIds),
    ...divisionDetailTeamIdsProperty(
      rawKind,
      values.hasTeamIdsInput,
      values.rawTeamIds,
    ),
  };
};

const normalizeDivisionDetailEntry = (
  entry: unknown,
  eventId: string,
  sportId: string | null | undefined,
  defaultKind: "LEAGUE" | "PLAYOFF",
): DivisionDetailPayload | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const row = entry as Record<string, unknown>;
  const identity = buildDivisionDetailIdentity(
    row,
    eventId,
    sportId,
    defaultKind,
  );
  const values = normalizeDivisionDetailOptionalValues(
    row,
    eventId,
    defaultKind,
  );
  return buildDivisionDetailPayload(identity, values);
};

const normalizeDivisionDetailsPayload = (
  value: unknown,
  eventId: string,
  sportId?: string | null,
  defaultKind: "LEAGUE" | "PLAYOFF" = "LEAGUE",
): DivisionDetailPayload[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const details = value
    .map((entry) =>
      normalizeDivisionDetailEntry(entry, eventId, sportId, defaultKind),
    )
    .filter((entry): entry is DivisionDetailPayload => entry !== null);
  const seen = new Set<string>();
  const unique: DivisionDetailPayload[] = [];
  for (const detail of details) {
    if (seen.has(detail.id)) {
      continue;
    }
    seen.add(detail.id);
    unique.push(detail);
  }
  return unique;
};

type PersistedSplitLeagueDivisionDetail = {
  id: string;
  key: string | null;
  maxParticipants: number | null;
  playoffTeamCount: number | null;
  playoffPlacementDivisionIds: string[];
};

const divisionDetailAliases = (
  id: string | null | undefined,
  key: string | null | undefined,
): string[] => [
  normalizeDivisionKey(id),
  normalizeDivisionKey(key),
  id ? extractDivisionTokenFromId(id) : null,
].filter((alias): alias is string => Boolean(alias));

const buildPersistedSplitDivisionLookup = (
  persistedDivisionDetails: PersistedSplitLeagueDivisionDetail[],
): Map<string, PersistedSplitLeagueDivisionDetail> => {
  const lookup = new Map<string, PersistedSplitLeagueDivisionDetail>();
  for (const detail of persistedDivisionDetails) {
    for (const alias of divisionDetailAliases(detail.id, detail.key)) {
      lookup.set(alias, detail);
    }
  }
  return lookup;
};

const findPersistedSplitDivisionDetail = (
  detail: DivisionDetailPayload,
  persistedByIdentifier: Map<string, PersistedSplitLeagueDivisionDetail>,
): PersistedSplitLeagueDivisionDetail | undefined => {
  for (const alias of divisionDetailAliases(detail.id, detail.key)) {
    const persisted = persistedByIdentifier.get(alias);
    if (persisted) {
      return persisted;
    }
  }
  return undefined;
};

const buildSplitPlacementCapacityInputs = (
  divisionDetails: DivisionDetailPayload[],
  persistedByIdentifier: Map<string, PersistedSplitLeagueDivisionDetail>,
  defaultPlayoffTeamCount: number | null,
) =>
  divisionDetails.map((detail) => {
    const persisted = findPersistedSplitDivisionDetail(
      detail,
      persistedByIdentifier,
    );
    return {
      placementCount: resolveDivisionValue(
        detail.playoffTeamCount,
        persisted?.playoffTeamCount,
        defaultPlayoffTeamCount ?? undefined,
      ),
      playoffDivisionIds:
        resolveDivisionValue(
          detail.playoffPlacementDivisionIds,
          persisted?.playoffPlacementDivisionIds,
          [],
        ) ?? [],
    };
  });

const buildSplitPlayoffCapacityInputs = (
  playoffDivisionDetails: DivisionDetailPayload[],
  persistedByIdentifier: Map<string, PersistedSplitLeagueDivisionDetail>,
) =>
  playoffDivisionDetails.map((detail) => {
    const persisted = findPersistedSplitDivisionDetail(
      detail,
      persistedByIdentifier,
    );
    return {
      playoffDivisionId: detail.id,
      capacity: resolveDivisionValue(
        detail.maxParticipants,
        persisted?.maxParticipants,
        undefined,
      ),
      name: detail.name,
    };
  });

const assertSplitLeaguePlayoffMappingCounts = ({
  divisionDetails,
  playoffDivisionDetails,
  persistedDivisionDetails,
  defaultPlayoffTeamCount,
}: {
  divisionDetails: DivisionDetailPayload[];
  playoffDivisionDetails: DivisionDetailPayload[];
  persistedDivisionDetails: PersistedSplitLeagueDivisionDetail[];
  defaultPlayoffTeamCount: number | null;
}): void => {
  if (divisionDetails.length === 0 || playoffDivisionDetails.length === 0) {
    return;
  }
  const persistedByIdentifier = buildPersistedSplitDivisionLookup(
    persistedDivisionDetails,
  );
  const capacityResults = evaluatePlayoffPlacementCapacities(
    buildSplitPlacementCapacityInputs(
      divisionDetails,
      persistedByIdentifier,
      defaultPlayoffTeamCount,
    ),
    buildSplitPlayoffCapacityInputs(
      playoffDivisionDetails,
      persistedByIdentifier,
    ),
    normalizeDivisionKey,
  );
  for (const result of capacityResults) {
    if (result.capacity === null) {
      throw new Error(
        `Playoff division "${result.name ?? result.playoffDivisionId}" requires maxParticipants.`,
      );
    }
    if (result.matchesCapacity) {
      continue;
    }
    throw new Error(
      `Playoff division "${result.name ?? result.playoffDivisionId}" has ${result.mappedPositionCount} mapped positions but ${result.capacity} team slots.`,
    );
  }
};

const resolveLeaguePlayoffTeamCount = (
  value: number | null | undefined,
  message: string,
): number => {
  if (value === null || value === undefined) {
    return MIN_BRACKET_TEAM_COUNT;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LeaguePlayoffTeamCountValidationError(message);
  }
  return normalizeLegacyBracketTeamCount(value);
};

type DivisionRatingWindow = {
  minRating: number | null;
  maxRating: number | null;
};

const divisionRatingWindow = (
  key: string,
  sportId?: string | null,
): DivisionRatingWindow => {
  const normalizedSport =
    typeof sportId === "string" ? sportId.toLowerCase() : "";
  // Some sports don't have standardized public ratings, so keep labels only.
  if (normalizedSport.includes("soccer")) {
    return { minRating: null, maxRating: null };
  }
  const inferred = inferDivisionDetails({
    identifier: key,
    sportInput: sportId ?? undefined,
  });
  const divisionTypeId = inferred.divisionTypeId;
  if (divisionTypeId === "beginner") return { minRating: 1.0, maxRating: 2.5 };
  if (divisionTypeId === "intermediate")
    return { minRating: 2.5, maxRating: 3.5 };
  if (divisionTypeId === "advanced") return { minRating: 3.5, maxRating: 4.5 };
  if (divisionTypeId === "expert") return { minRating: 4.5, maxRating: null };
  return { minRating: null, maxRating: null };
};

const coerceDivisionFieldMap = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const map: Record<string, string[]> = {};
  for (const [rawKey, rawFieldIds] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const key = normalizeDivisionKey(rawKey);
    if (!key) continue;
    const fieldIds = Array.from(
      new Set(
        ensureStringArray(rawFieldIds)
          .map((id) => String(id))
          .filter(Boolean),
      ),
    );
    map[key] = fieldIds;
  }
  return map;
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => String(entry)).filter(Boolean)),
  );
};

type RentalBookingSlotInput = Pick<
  CanonicalTimeSlotInput,
  | "id"
  | "scheduledFieldIds"
  | "startDate"
  | "endDate"
  | "repeating"
  | "rentalBookingId"
  | "rentalBookingItemId"
  | "rentalLocked"
  | "sourceType"
>;

const RENTAL_BOOKING_ITEM_ACTIVE_STATUSES = ["PENDING_PAYMENT", "CONFIRMED"];

const isRentalBookingSlot = (slot: RentalBookingSlotInput): boolean =>
  slot.rentalLocked ||
  Boolean(slot.rentalBookingId) ||
  Boolean(slot.rentalBookingItemId) ||
  slot.sourceType === "RENTAL_BOOKING";

const collectRentalBookingSlots = (
  slots: RentalBookingSlotInput[],
): Map<string, RentalBookingSlotInput> => {
  const rentalSlots = slots.filter(isRentalBookingSlot);
  const slotsByBookingItemId = new Map<string, RentalBookingSlotInput>();
  const duplicateItemIds = new Set<string>();
  for (const slot of rentalSlots) {
    const bookingItemId = normalizeEntityId(slot.rentalBookingItemId);
    if (!bookingItemId) {
      throw new RentalBookingReservationError(
        "Rental-backed time slots must include a rental booking item.",
      );
    }
    if (slotsByBookingItemId.has(bookingItemId)) {
      duplicateItemIds.add(bookingItemId);
    }
    slotsByBookingItemId.set(bookingItemId, slot);
  }
  if (duplicateItemIds.size > 0) {
    throw new RentalBookingReservationError(
      "A rental reservation can only be used in one event timeslot.",
    );
  }
  return slotsByBookingItemId;
};

const loadRentalBookingItems = async (
  client: PrismaLike,
  bookingItemIds: string[],
): Promise<Map<string, any>> => {
  const bookingItems = await client.rentalBookingItems.findMany({
    where: { id: { in: bookingItemIds } },
    select: {
      id: true,
      bookingId: true,
      fieldId: true,
      start: true,
      end: true,
      status: true,
      eventId: true,
      eventTimeSlotId: true,
    } as any,
  });
  return new Map<string, any>(
    (bookingItems as any[]).map((item) => [String(item.id), item]),
  );
};

const assertRentalBookingItemReservationIdentity = (
  eventId: string,
  slot: RentalBookingSlotInput,
  item: Record<string, any>,
): void => {
  const expectedBookingId = normalizeEntityId(slot.rentalBookingId);
  const actualBookingId = normalizeEntityId(item.bookingId);
  if (expectedBookingId && actualBookingId !== expectedBookingId) {
    throw new RentalBookingReservationError(
      "Rental reservation does not match the selected booking.",
    );
  }
  const itemEventId = normalizeEntityId(item.eventId);
  const itemEventTimeSlotId = normalizeEntityId(item.eventTimeSlotId);
  if (itemEventId && itemEventId !== eventId) {
    throw new RentalBookingReservationError(
      "This rental reservation is already attached to another event.",
    );
  }
  if (itemEventTimeSlotId && itemEventTimeSlotId !== slot.id) {
    throw new RentalBookingReservationError(
      "This rental reservation is already attached to another event timeslot.",
    );
  }
};

const assertRentalBookingItemAvailability = (
  slot: RentalBookingSlotInput,
  item: Record<string, any>,
): void => {
  const status = typeof item.status === "string" ? item.status : "";
  if (!RENTAL_BOOKING_ITEM_ACTIVE_STATUSES.includes(status)) {
    throw new RentalBookingReservationError(
      "This rental reservation is not available for event scheduling.",
    );
  }
  const itemFieldId = normalizeEntityId(item.fieldId);
  if (!itemFieldId || !slot.scheduledFieldIds.includes(itemFieldId)) {
    throw new RentalBookingReservationError(
      "Rental-backed time slots must include the rented resource.",
    );
  }
};

const assertRentalBookingItemOwnership = (
  eventId: string,
  slot: RentalBookingSlotInput,
  item: Record<string, any>,
): void => {
  assertRentalBookingItemReservationIdentity(eventId, slot, item);
  assertRentalBookingItemAvailability(slot, item);
};

const assertRentalBookingItemDateRange = (
  slot: RentalBookingSlotInput,
  item: Record<string, any>,
): void => {
  const itemStart =
    item.start instanceof Date ? item.start : new Date(item.start);
  const itemEnd = item.end instanceof Date ? item.end : new Date(item.end);
  const datesDoNotMatch =
    slot.repeating ||
    !slot.endDate ||
    !Number.isFinite(itemStart.getTime()) ||
    !Number.isFinite(itemEnd.getTime()) ||
    itemStart.getTime() !== slot.startDate.getTime() ||
    itemEnd.getTime() !== slot.endDate.getTime();
  if (datesDoNotMatch) {
    throw new RentalBookingReservationError(
      "Rental-backed time slots must match the reserved date and time.",
    );
  }
};

const validateRentalBookingItems = (
  eventId: string,
  slotsByBookingItemId: Map<string, RentalBookingSlotInput>,
  bookingItemById: Map<string, any>,
): void => {
  for (const bookingItemId of slotsByBookingItemId.keys()) {
    const slot = slotsByBookingItemId.get(bookingItemId);
    const item = bookingItemById.get(bookingItemId);
    if (!slot || !item) {
      throw new RentalBookingReservationError(
        "Rental reservation could not be found.",
      );
    }
    assertRentalBookingItemOwnership(eventId, slot, item);
    assertRentalBookingItemDateRange(slot, item);
  }
};

const persistRentalBookingReservations = async (
  client: PrismaLike,
  eventId: string,
  slotsByBookingItemId: Map<string, RentalBookingSlotInput>,
  bookingItemById: Map<string, any>,
  now: Date,
): Promise<void> => {
  for (const [bookingItemId, slot] of slotsByBookingItemId.entries()) {
    const item = bookingItemById.get(bookingItemId);
    const bookingId = normalizeEntityId(item?.bookingId);
    const updateResult = await client.rentalBookingItems.updateMany({
      where: {
        id: bookingItemId,
        status: { in: RENTAL_BOOKING_ITEM_ACTIVE_STATUSES },
        OR: [{ eventId: null }, { eventId }],
        AND: [
          {
            OR: [{ eventTimeSlotId: null }, { eventTimeSlotId: slot.id }],
          },
        ],
      } as any,
      data: {
        eventId,
        eventTimeSlotId: slot.id,
        updatedAt: now,
      } as any,
    });
    if (typeof updateResult?.count === "number" && updateResult.count !== 1) {
      throw new RentalBookingReservationError(
        "This rental reservation was already attached to another event.",
      );
    }
    if (bookingId) {
      await client.rentalBookings.updateMany({
        where: {
          id: bookingId,
          OR: [{ eventId: null }, { eventId }],
        } as any,
        data: {
          eventId,
          updatedAt: now,
        } as any,
      });
    }
  }
};

export const reserveRentalBookingSlotsForEvent = async (
  client: PrismaLike,
  eventId: string,
  slots: RentalBookingSlotInput[],
  now: Date = new Date(),
): Promise<void> => {
  if (
    !client.rentalBookingItems?.findMany ||
    !client.rentalBookingItems?.updateMany ||
    !client.rentalBookings?.updateMany
  ) {
    return;
  }
  const rentalSlots = slots.filter(isRentalBookingSlot);
  if (!rentalSlots.length) {
    return;
  }
  const slotsByBookingItemId = collectRentalBookingSlots(rentalSlots);
  const bookingItemById = await loadRentalBookingItems(
    client,
    Array.from(slotsByBookingItemId.keys()),
  );
  validateRentalBookingItems(eventId, slotsByBookingItemId, bookingItemById);
  await persistRentalBookingReservations(
    client,
    eventId,
    slotsByBookingItemId,
    bookingItemById,
    now,
  );
};

const buildDivisionFieldMap = (
  divisionKeys: string[],
  fieldIds: string[],
  incomingMap: Record<string, string[]>,
): Record<string, string[]> => {
  const map: Record<string, Set<string>> = {};
  for (const key of divisionKeys) {
    const aliases = new Set<string>([
      key,
      extractDivisionTokenFromId(key) ?? "",
    ]);
    const normalizedKey = normalizeDivisionKey(key);
    if (normalizedKey) {
      aliases.add(normalizedKey);
    }
    const merged = new Set<string>();
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeDivisionKey(alias);
      if (!normalizedAlias) return;
      ensureStringArray(incomingMap[normalizedAlias]).forEach((fieldId) =>
        merged.add(String(fieldId)),
      );
    });
    map[key] = merged;
  }

  // Field/division ownership now lives on time slots, not fields.
  // Keep division->field mappings only when explicitly provided by legacy clients.

  const allowed = new Set(fieldIds);
  const result: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(map)) {
    result[key] = Array.from(ids).filter((id) => allowed.has(id));
  }
  return result;
};

const coerceDate = (
  value: unknown,
  timeZone = DEFAULT_EVENT_TIME_ZONE,
): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = parseDateInputInTimeZone(value, timeZone);
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const coerceNullableNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const parseNullableBooleanString = (
  value: string,
): boolean | null | undefined => {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parseNullableBooleanNumber = (
  value: number,
): boolean | null | undefined => {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return undefined;
};

const coerceNullableBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return parseNullableBooleanString(value);
  }
  if (typeof value === "number") {
    return parseNullableBooleanNumber(value);
  }
  return undefined;
};

const normalizeLeagueScoringFields = (
  row: Record<string, unknown>,
  keys: readonly string[],
  normalize: (value: unknown) => number | boolean | null | undefined,
): Record<string, number | boolean | null> => {
  const data: Record<string, number | boolean | null> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const normalized = normalize(row[key]);
    if (normalized !== undefined) {
      data[key] = normalized;
    }
  }
  return data;
};

const normalizeLeagueScoringConfigId = (
  row: Record<string, unknown>,
): string | undefined => {
  if (typeof row.id !== "string" || row.id.trim().length === 0) {
    return undefined;
  }
  return row.id.trim();
};

const normalizeLeagueScoringConfigPayload = (
  value: unknown,
): { id?: string; data: Record<string, number | boolean | null> } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const data = {
    ...normalizeLeagueScoringFields(
      row,
      LEAGUE_SCORING_NUMBER_FIELDS,
      coerceNullableNumber,
    ),
    ...normalizeLeagueScoringFields(
      row,
      LEAGUE_SCORING_BOOLEAN_FIELDS,
      coerceNullableBoolean,
    ),
  };
  return { id: normalizeLeagueScoringConfigId(row), data };
};

const normalizeInstallmentAmountList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.round(entry)));
};

const normalizeInstallmentDateList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeIsoDateString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const normalizeInstallmentRelativeDayList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
};

const resolveDivisionValue = <T>(
  incoming: T | undefined,
  existing: T | undefined,
  fallback: T | undefined,
): T | undefined => {
  if (incoming !== undefined) {
    return incoming;
  }
  if (existing !== undefined) {
    return existing;
  }
  return fallback;
};

const normalizeIsoDateString = (value: unknown): string | null => {
  const parsed = coerceDate(value);
  return parsed ? parsed.toISOString() : null;
};

const matchBufferMs = (event: Tournament | League): number => {
  const restMinutes = event.restTimeMinutes ?? 0;
  return Math.max(restMinutes, 0) * MINUTE_MS;
};

const normalizeDivisionSortOrder = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const compareDivisionSortOrders = (
  leftOrder: number | null,
  rightOrder: number | null,
): number | null => {
  if (leftOrder === null && rightOrder === null) {
    return null;
  }
  if (leftOrder === null) {
    return 1;
  }
  if (rightOrder === null) {
    return -1;
  }
  return leftOrder === rightOrder ? 0 : leftOrder - rightOrder;
};

const storedDivisionDate = (
  value: Date | string | null | undefined,
): number => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    return Date.parse(value);
  }
  return Number.NaN;
};

const compareStoredDivisionDates = (
  leftCreated: number,
  rightCreated: number,
): number | null => {
  if (!Number.isFinite(leftCreated) && !Number.isFinite(rightCreated)) {
    return null;
  }
  if (!Number.isFinite(leftCreated)) {
    return 1;
  }
  if (!Number.isFinite(rightCreated)) {
    return -1;
  }
  return leftCreated === rightCreated ? 0 : leftCreated - rightCreated;
};

const compareDivisionRowsByStoredOrder = <
  T extends {
    id?: string | null;
    name?: string | null;
    createdAt?: Date | string | null;
    sortOrder?: number | null;
  },
>(
  left: T,
  right: T,
): number => {
  const orderComparison = compareDivisionSortOrders(
    normalizeDivisionSortOrder(left.sortOrder),
    normalizeDivisionSortOrder(right.sortOrder),
  );
  if (orderComparison !== null && orderComparison !== 0) {
    return orderComparison;
  }
  const dateComparison = compareStoredDivisionDates(
    storedDivisionDate(left.createdAt),
    storedDivisionDate(right.createdAt),
  );
  if (dateComparison !== null && dateComparison !== 0) {
    return dateComparison;
  }
  const nameCompare = String(left.name ?? "").localeCompare(
    String(right.name ?? ""),
  );
  return (
    nameCompare || String(left.id ?? "").localeCompare(String(right.id ?? ""))
  );
};

type EventDivisionHydrationRow = {
  id: string;
  name?: string | null;
  key?: string | null;
  kind?: "LEAGUE" | "PLAYOFF" | null;
  role?: "ENTRY" | "PHASE" | string | null;
  phase?: "LEAGUE" | "POOL" | "BRACKET" | "PLAYOFF" | string | null;
  isSystemGenerated?: boolean | null;
  sortOrder?: number | null;
  fieldIds?: string[] | null;
  sportId?: string | null;
  price?: number | null;
  maxParticipants?: number | null;
  playoffTeamCount?: number | null;
  playoffPlacementDivisionIds?: string[] | null;
  standingsOverrides?: unknown;
  gamesPerOpponent?: number | null;
  restTimeMinutes?: number | null;
  usesSets?: boolean | null;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
  setsPerMatch?: number | null;
  pointsToVictory?: number[] | null;
  playoffDoubleElimination?: boolean | null;
  playoffWinnerSetCount?: number | null;
  playoffLoserSetCount?: number | null;
  playoffWinnerBracketPointsToVictory?: number[] | null;
  playoffLoserBracketPointsToVictory?: number[] | null;
  playoffPrize?: string | null;
  playoffFieldCount?: number | null;
  playoffRestTimeMinutes?: number | null;
  playoffMatchDurationMinutes?: number | null;
  playoffSetDurationMinutes?: number | null;
  standingsConfirmedAt?: Date | null;
  standingsConfirmedBy?: string | null;
  teamIds?: string[] | null;
  phaseSettings?: unknown;
  sourceDivisionId?: string | null;
};

type BuildDivisionsOptions = {
  allowFallback?: boolean;
  fallbackKind?: "LEAGUE" | "PLAYOFF";
  includeSourceAliases?: boolean;
};

const readDivisionRowValue = <T>(
  row: EventDivisionHydrationRow | undefined,
  key: string,
  fallback: T,
): T => {
  const value = row?.[key as keyof EventDivisionHydrationRow];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const indexDivisionRows = (
  divisionRows: EventDivisionHydrationRow[],
): {
  rowsById: Map<string, EventDivisionHydrationRow>;
  rowsByKey: Map<string, EventDivisionHydrationRow>;
} => {
  const rowsById = new Map<string, EventDivisionHydrationRow>();
  const rowsByKey = new Map<string, EventDivisionHydrationRow>();
  for (const row of divisionRows) {
    const normalizedId = normalizeDivisionKey(row.id) ?? row.id;
    const normalizedKey = normalizeDivisionKey(row.key);
    rowsById.set(normalizedId, row);
    if (normalizedKey) {
      rowsByKey.set(normalizedKey, row);
    }
    const tokenFromId = extractDivisionTokenFromId(row.id);
    if (tokenFromId) {
      rowsByKey.set(tokenFromId, row);
    }
  }
  return { rowsById, rowsByKey };
};

const addDivisionAliases = (
  aliases: Array<string | null | undefined>,
  division: Division,
  fieldIds: string[],
  map: Map<string, Division>,
  fieldIdsByDivision: Map<string, string[]>,
): void => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeDivisionKey(alias);
    if (!normalizedAlias) continue;
    map.set(normalizedAlias, division);
    fieldIdsByDivision.set(normalizedAlias, fieldIds);
  }
};

const resolveDivisionRowKindAndPhase = (
  row: EventDivisionHydrationRow | undefined,
): {
  kind: "LEAGUE" | "PLAYOFF";
  role: "ENTRY" | "PHASE";
  phase: "LEAGUE" | "POOL" | "BRACKET" | "PLAYOFF" | null;
} => {
  const kind = normalizeDivisionKind(
    readDivisionRowValue(row, "kind", null),
    "LEAGUE",
  );
  const role =
    String(readDivisionRowValue(row, "role", "ENTRY")).toUpperCase() === "PHASE"
      ? "PHASE"
      : "ENTRY";
  return {
    kind,
    role,
    phase: normalizeDivisionDetailPhase(
      readDivisionRowValue(row, "phase", null),
    ),
  };
};

const buildDivisionFromRow = (
  divisionId: string,
  matchedRow: EventDivisionHydrationRow | undefined,
  sportId?: string | null,
): { division: Division; fieldIds: string[] } => {
  const { kind, role, phase } = resolveDivisionRowKindAndPhase(matchedRow);
  const standingsOverrides =
    kind === "PLAYOFF"
      ? null
      : (normalizeStandingsOverrides(
          readDivisionRowValue(matchedRow, "standingsOverrides", null),
        ) ?? null);
  const playoffConfig =
    kind === "PLAYOFF"
      ? normalizePlayoffDivisionConfig(
          readDivisionRowValue(matchedRow, "standingsOverrides", null),
        )
      : normalizeDivisionPlayoffConfigFields(matchedRow);
  const leagueConfig =
    kind === "LEAGUE" ? normalizeLeagueDivisionConfig(matchedRow) : null;
  const inferred = inferDivisionDetails({
    identifier: divisionId,
    sportInput: sportId ?? undefined,
    fallbackName: readDivisionRowValue<string | undefined>(
      matchedRow,
      "name",
      undefined,
    ),
  });
  const divisionName =
    readDivisionRowValue<string | undefined>(
      matchedRow,
      "name",
      undefined,
    ) ??
    inferred.defaultName ??
    buildDivisionDisplayName(divisionId, sportId);
  const fieldIds = ensureStringArray(
    readDivisionRowValue(matchedRow, "fieldIds", null),
  );
  const teamIds = normalizeTeamIdList(
    readDivisionRowValue(matchedRow, "teamIds", null),
  );
  const division = new Division(
    divisionId,
    divisionName,
    fieldIds,
    readDivisionRowValue(matchedRow, "price", null),
    readDivisionRowValue(matchedRow, "maxParticipants", null),
    readDivisionRowValue(matchedRow, "playoffTeamCount", null),
    kind,
    normalizePlacementDivisionIdentifierList(
      readDivisionRowValue(matchedRow, "playoffPlacementDivisionIds", null),
    ),
    standingsOverrides,
    readDivisionRowValue(matchedRow, "standingsConfirmedAt", null),
    readDivisionRowValue(matchedRow, "standingsConfirmedBy", null),
    playoffConfig,
    teamIds,
    leagueConfig,
    normalizeDivisionPhaseSettingsMap(
      readDivisionRowValue(matchedRow, "phaseSettings", null),
    ),
    role,
    phase,
    readDivisionRowValue(matchedRow, "sourceDivisionId", null),
    readDivisionRowValue<boolean>(matchedRow, "isSystemGenerated", false) === true,
  );
  return { division, fieldIds };
};

const resolveMatchedDivisionRow = (
  divisionId: string,
  rowsById: Map<string, EventDivisionHydrationRow>,
  rowsByKey: Map<string, EventDivisionHydrationRow>,
): EventDivisionHydrationRow | undefined =>
  rowsById.get(divisionId) ??
  rowsByKey.get(divisionId) ??
  rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? "");

const resolveBuildDivisionsOptions = (
  options: BuildDivisionsOptions | undefined,
): Required<BuildDivisionsOptions> => ({
  allowFallback: options?.allowFallback ?? true,
  fallbackKind: options?.fallbackKind ?? "LEAGUE",
  includeSourceAliases: options?.includeSourceAliases ?? true,
});

const buildDivisionAliases = (
  divisionId: string,
  matchedRow: EventDivisionHydrationRow | undefined,
  includeSourceAliases: boolean,
): Array<string | null | undefined> => [
  divisionId,
  matchedRow?.id,
  matchedRow?.key,
  extractDivisionTokenFromId(divisionId),
  extractDivisionTokenFromId(matchedRow?.id),
  ...(includeSourceAliases ? [matchedRow?.sourceDivisionId] : []),
];

const buildFallbackDivision = (
  fallbackKind: "LEAGUE" | "PLAYOFF",
  sportId?: string | null,
): Division =>
  new Division(
    DEFAULT_DIVISION_KEY,
    buildDivisionDisplayName(DEFAULT_DIVISION_KEY, sportId),
    [],
    null,
    null,
    null,
    fallbackKind,
  );

const buildDivisions = (
  divisionIds: string[],
  divisionRows: EventDivisionHydrationRow[],
  sportId?: string | null,
  options?: BuildDivisionsOptions,
) => {
  const resolvedOptions = resolveBuildDivisionsOptions(options);
  const map = new Map<string, Division>();
  const fieldIdsByDivision = new Map<string, string[]>();
  const { rowsById, rowsByKey } = indexDivisionRows(divisionRows);
  const result: Division[] = [];
  for (const rawDivisionId of divisionIds) {
    const divisionId = normalizeDivisionKey(rawDivisionId) ?? rawDivisionId;
    const matchedRow = resolveMatchedDivisionRow(
      divisionId,
      rowsById,
      rowsByKey,
    );
    const { division, fieldIds } = buildDivisionFromRow(
      divisionId,
      matchedRow,
      sportId,
    );
    result.push(division);
    addDivisionAliases(
      buildDivisionAliases(
        divisionId,
        matchedRow,
        resolvedOptions.includeSourceAliases,
      ),
      division,
      fieldIds,
      map,
      fieldIdsByDivision,
    );
  }
  if (!result.length && resolvedOptions.allowFallback) {
    const fallback = buildFallbackDivision(resolvedOptions.fallbackKind, sportId);
    result.push(fallback);
    addDivisionAliases(
      [DEFAULT_DIVISION_KEY],
      fallback,
      [],
      map,
      fieldIdsByDivision,
    );
  }
  return { divisions: result, map, fieldIdsByDivision };
};

type EventDivisionPayloadRow = DivisionNameCandidate & {
  [key: string]: unknown;
  installmentDueDates?: unknown[];
};

const collectSystemGeneratedDivisionIds = (
  rows: readonly any[],
): Set<string> => {
  const systemGeneratedIds = new Set<string>();
  rows.forEach((row) => {
    if (row?.isSystemGenerated !== true) {
      return;
    }
    const id = normalizeDivisionKey(row?.id);
    if (id) {
      systemGeneratedIds.add(id);
    }
  });
  return systemGeneratedIds;
};

const assertUniqueSubmittedEventDivisionNames = (
  payload: any,
  systemGeneratedDivisionIds: ReadonlySet<string> = new Set(),
  systemGeneratedEntryIds: ReadonlySet<string> = new Set(),
): void => {
  const candidates = [
    ...(Array.isArray(payload?.divisionDetails) ? payload.divisionDetails : []),
    ...(Array.isArray(payload?.playoffDivisionDetails)
      ? payload.playoffDivisionDetails
      : []),
  ].filter((candidate) => {
    const id = normalizeDivisionKey(candidate?.id);
    if (!id || !systemGeneratedDivisionIds.has(id)) {
      return true;
    }
    if (systemGeneratedEntryIds.has(id)) {
      return false;
    }
    const role = String(candidate?.role ?? "")
      .trim()
      .toUpperCase();
    const kind = normalizeDivisionKind(candidate?.kind, "LEAGUE");
    return role !== "PHASE" && kind !== "PLAYOFF";
  });
  const duplicateNames = findDuplicateDivisionNames(candidates);
  if (duplicateNames.length > 0) {
    throw new EventDivisionNameValidationError(duplicateNames);
  }
};

const readDivisionTemplateValue = <T>(
  row: EventDivisionPayloadRow,
  key: string,
  fallback: T,
): T => {
  const value = row[key];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const serializeDivisionTemplateDate = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value === null || value === undefined ? null : value;
};
const serializeDivisionTemplateRole = (
  value: unknown,
): "ENTRY" | "PHASE" =>
  String(value ?? "ENTRY").toUpperCase() === "PHASE" ? "PHASE" : "ENTRY";

const serializeDivisionDetailRow = (
  row: EventDivisionPayloadRow,
  index: number,
): Record<string, unknown> => ({
  id: row.id,
  sourceDivisionId: readDivisionTemplateValue(row, "sourceDivisionId", null),
  key:
    readDivisionTemplateValue<string | null>(row, "key", null) ??
    extractDivisionTokenFromId(row.id) ??
    row.id,
  name: row.name,
  kind: normalizeDivisionKind(row.kind, "LEAGUE"),
  role: serializeDivisionTemplateRole(row.role),
  phase: readDivisionTemplateValue(row, "phase", null),
  sortOrder:
    typeof row.sortOrder === "number" ? row.sortOrder : index,
  sportId: readDivisionTemplateValue(row, "sportId", null),
  price: readDivisionTemplateValue(row, "price", null),
  maxParticipants: readDivisionTemplateValue(row, "maxParticipants", null),
  playoffTeamCount: readDivisionTemplateValue(row, "playoffTeamCount", null),
  playoffPlacementDivisionIds: ensureStringArray(
    row.playoffPlacementDivisionIds,
  ),
  standingsOverrides: readDivisionTemplateValue(
    row,
    "standingsOverrides",
    null,
  ),
  phaseSettings: normalizeDivisionPhaseSettingsMap(row.phaseSettings),
  gamesPerOpponent: readDivisionTemplateValue(row, "gamesPerOpponent", null),
  restTimeMinutes: readDivisionTemplateValue(row, "restTimeMinutes", null),
  usesSets: readDivisionTemplateValue(row, "usesSets", null),
  matchDurationMinutes: readDivisionTemplateValue(
    row,
    "matchDurationMinutes",
    null,
  ),
  setDurationMinutes: readDivisionTemplateValue(
    row,
    "setDurationMinutes",
    null,
  ),
  setsPerMatch: readDivisionTemplateValue(row, "setsPerMatch", null),
  pointsToVictory: ensureNumberArray(row.pointsToVictory),
  standingsConfirmedAt: serializeDivisionTemplateDate(row.standingsConfirmedAt),
  standingsConfirmedBy: readDivisionTemplateValue(
    row,
    "standingsConfirmedBy",
    null,
  ),
  allowPaymentPlans: readDivisionTemplateValue(
    row,
    "allowPaymentPlans",
    null,
  ),
  installmentCount: readDivisionTemplateValue(row, "installmentCount", null),
  installmentDueDates: ensureArray(row.installmentDueDates)
    .map((value) => coerceDate(value))
    .filter(Boolean)
    .map((date) => (date as Date).toISOString()),
  installmentDueRelativeDays: ensureNumberArray(
    row.installmentDueRelativeDays,
  ),
  installmentAmounts: ensureNumberArray(row.installmentAmounts),
  divisionTypeId: readDivisionTemplateValue(row, "divisionTypeId", null),
  skillDivisionTypeId: readDivisionTemplateValue(
    row,
    "skillDivisionTypeId",
    null,
  ),
  ageDivisionTypeId: readDivisionTemplateValue(
    row,
    "ageDivisionTypeId",
    null,
  ),
  ratingType: readDivisionTemplateValue(row, "ratingType", null),
  gender: readDivisionTemplateValue(row, "gender", null),
  ageCutoffDate: serializeDivisionTemplateDate(row.ageCutoffDate),
  ageCutoffLabel: readDivisionTemplateValue(row, "ageCutoffLabel", null),
  ageCutoffSource: readDivisionTemplateValue(row, "ageCutoffSource", null),
  fieldIds: ensureStringArray(row.fieldIds),
  teamIds: [],
});

const serializeDivisionDetailsForTemplate = (
  divisionRows: EventDivisionPayloadRow[],
): Array<Record<string, unknown>> =>
  divisionRows.map(serializeDivisionDetailRow);

const readTeamRowValue = <T>(
  row: Record<string, unknown>,
  key: string,
  fallback: T,
): T => {
  const value = row[key];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const resolveTeamDivision = (
  row: Record<string, unknown>,
  divisionMap: Map<string, Division>,
  fallbackDivision: Division,
  divisionByTeamId: Map<string, Division>,
): Division => {
  const mappedDivision = divisionByTeamId.get(String(row.id));
  if (mappedDivision) {
    return mappedDivision;
  }
  const normalizedDivisionId = normalizeDivisionKey(row.division);
  if (normalizedDivisionId) {
    const normalizedDivision = divisionMap.get(normalizedDivisionId);
    if (normalizedDivision) {
      return normalizedDivision;
    }
  }
  const rawDivision = row.division;
  if (typeof rawDivision === "string") {
    const rawMappedDivision = divisionMap.get(rawDivision);
    if (rawMappedDivision) {
      return rawMappedDivision;
    }
  }
  return fallbackDivision;
};

const resolveTeamPlayers = (
  row: Record<string, unknown>,
  playerLookup: Map<string, UserData>,
): UserData[] =>
  ensureArray(row.playerIds as unknown[])
    .map((playerId) => playerLookup.get(String(playerId)))
    .filter((player): player is UserData => Boolean(player));

const buildTeamFromRow = (
  row: Record<string, unknown>,
  divisionMap: Map<string, Division>,
  fallbackDivision: Division,
  divisionByTeamId: Map<string, Division>,
  playerLookup: Map<string, UserData>,
  playerRegistrationsByTeamId: Map<
    string,
    Array<{
      id: string;
      teamId?: string | null;
      userId: string;
      status: string;
      jerseyNumber?: string | null;
      position?: string | null;
      isCaptain?: boolean;
    }>
  >,
): Team => {
  const teamId = String(row.id);
  const playerIds = ensureArray(readTeamRowValue(row, "playerIds", []));
  return new Team({
    id: teamId,
    captainId: readTeamRowValue(row, "captainId", ""),
    kind: readTeamRowValue(row, "kind", null),
    division: resolveTeamDivision(
      row,
      divisionMap,
      fallbackDivision,
      divisionByTeamId,
    ),
    name: readTeamRowValue(row, "name", ""),
    matches: [],
    playerIds,
    players: resolveTeamPlayers(row, playerLookup),
    playerRegistrations: playerRegistrationsByTeamId.get(teamId) ?? [],
  });
};

const buildTeams = (
  rows: any[],
  divisionMap: Map<string, Division>,
  fallbackDivision: Division,
  divisionByTeamId: Map<string, Division> = new Map<string, Division>(),
  playerLookup: Map<string, UserData> = new Map<string, UserData>(),
  playerRegistrationsByTeamId: Map<
    string,
    Array<{
      id: string;
      teamId?: string | null;
      userId: string;
      status: string;
      jerseyNumber?: string | null;
      position?: string | null;
      isCaptain?: boolean;
    }>
  > = new Map(),
) => {
  const teams: Record<string, Team> = {};
  for (const row of rows) {
    const team = buildTeamFromRow(
      row,
      divisionMap,
      fallbackDivision,
      divisionByTeamId,
      playerLookup,
      playerRegistrationsByTeamId,
    );
    teams[row.id] = team;
  }
  return teams;
};
const buildFields = (
  rows: any[],
  divisionMap: Map<string, Division>,
  fallbackDivisionIds: string[],
  divisionFieldIds: Map<string, string[]>,
  explicitDivisionIdsByFieldId: Map<string, string[]> = new Map(),
) => {
  const fields: Record<string, PlayingField> = {};
  for (const row of rows) {
    const explicitDivisionIds = Array.from(divisionFieldIds.entries())
      .filter(([, fieldIds]) => fieldIds.includes(row.id))
      .map(([divisionId]) => divisionId);
    const divisionIds = explicitDivisionIds.length
      ? explicitDivisionIds
      : fallbackDivisionIds;
    const divisions = Array.from(
      new Map(
        divisionIds.map((id) => {
          const division =
            divisionMap.get(id) ??
            new Division(id, buildDivisionDisplayName(id));
          return [division.id, division] as const;
        }),
      ).values(),
    );
    fields[row.id] = new PlayingField({
      id: row.id,
      organizationId: row.organizationId ?? null,
      divisions,
      explicitDivisionIds: explicitDivisionIdsByFieldId.get(row.id) ?? [],
      matches: [],
      events: [],
      rentalSlots: [],
      name: row.name ?? "",
    });
  }
  return fields;
};

const readTimeSlotValue = <T>(
  row: Record<string, unknown>,
  key: string,
  fallback: T,
): T => {
  const value = row[key];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const resolveTimeSlotDateValues = (
  row: Record<string, unknown>,
  slotTimeZone: string,
): {
  startDate: Date;
  endDate: Date | null;
  startTimeMinutes: number;
  endTimeMinutes: number;
} => {
  const rawStartDate = row.startDate;
  const startDate =
    rawStartDate instanceof Date ? rawStartDate : new Date(rawStartDate as any);
  const rawEndDate = row.endDate;
  const endDate = rawEndDate ? new Date(rawEndDate as any) : null;
  const startTimeMinutes =
    typeof row.startTimeMinutes === "number"
      ? row.startTimeMinutes
      : minutesInTimeZone(startDate, slotTimeZone);
  const endTimeMinutes =
    typeof row.endTimeMinutes === "number"
      ? row.endTimeMinutes
      : endDate
        ? minutesInTimeZone(endDate, slotTimeZone)
        : 0;
  return { startDate, endDate, startTimeMinutes, endTimeMinutes };
};

const resolveTimeSlotDivisions = (
  row: Record<string, unknown>,
  divisionMap: Map<string, Division>,
  fallbackDivisions: Division[],
): { divisionIds: string[]; divisions: Division[] } => {
  const divisionIds = normalizeDivisionKeys(row.divisions);
  if (!divisionIds.length) {
    return { divisionIds, divisions: fallbackDivisions };
  }
  const divisions = divisionIds.map(
    (id) =>
      divisionMap.get(id) ?? new Division(id, buildDivisionDisplayName(id)),
  );
  return { divisionIds, divisions };
};

const resolveTimeSlotDays = (
  row: Record<string, unknown>,
  startDate: Date,
  slotTimeZone: string,
): { dayOfWeek: number; daysOfWeek: number[] } => {
  const normalizedDays = normalizeTimeSlotDays({
    dayOfWeek: row.dayOfWeek,
    daysOfWeek: row.daysOfWeek,
  });
  const daysOfWeek = normalizedDays.length
    ? normalizedDays
    : [mondayDayInTimeZone(startDate, slotTimeZone)];
  const defaultDay = mondayDayInTimeZone(startDate, slotTimeZone);
  return { dayOfWeek: daysOfWeek[0] ?? defaultDay, daysOfWeek };
};

const buildTimeSlotFromRow = (
  row: Record<string, unknown>,
  divisionMap: Map<string, Division>,
  fallbackDivisions: Division[],
): TimeSlot => {
  const repeating = Boolean(row.repeating);
  const slotTimeZone = resolveTimeZone(
    row.timeZone,
    DEFAULT_EVENT_TIME_ZONE,
  );
  const { startDate, endDate, startTimeMinutes, endTimeMinutes } =
    resolveTimeSlotDateValues(row, slotTimeZone);
  const normalizedFieldIds = normalizeTimeSlotFieldIds(row);
  const { divisionIds, divisions } = resolveTimeSlotDivisions(
    row,
    divisionMap,
    fallbackDivisions,
  );
  const { dayOfWeek, daysOfWeek } = resolveTimeSlotDays(
    row,
    startDate,
    slotTimeZone,
  );
  return new TimeSlot({
    id: String(row.id),
    dayOfWeek,
    daysOfWeek,
    startDate,
    endDate,
    repeating,
    startTimeMinutes,
    endTimeMinutes,
    price: readTimeSlotValue(row, "price", null),
    sourceType: readTimeSlotValue(row, "sourceType", null),
    rentalBookingId: readTimeSlotValue(row, "rentalBookingId", null),
    rentalBookingItemId: readTimeSlotValue(row, "rentalBookingItemId", null),
    rentalLocked: Boolean(row.rentalLocked),
    field: normalizedFieldIds[0] ?? null,
    fieldIds: normalizedFieldIds,
    divisions: [...divisions],
    explicitDivisionIds: divisionIds,
    timeZone: slotTimeZone,
  });
};

const buildTimeSlots = (
  rows: any[],
  divisionMap: Map<string, Division>,
  fallbackDivisions: Division[],
) => rows.map((row) => buildTimeSlotFromRow(row, divisionMap, fallbackDivisions));

const buildOfficials = (
  rows: any[],
  divisions: Division[],
  eventTeamIdsByUserId: Map<string, Set<string>>,
) => {
  return rows.map(
    (row) =>
      new UserData({
        id: row.id,
        firstName: row.firstName ?? "",
        lastName: row.lastName ?? "",
        userName: row.userName ?? "",
        hasStripeAccount: Boolean(row.hasStripeAccount),
        teamIds: [
          ...(eventTeamIdsByUserId.get(row.id) ?? new Set<string>()),
        ].sort(),
        matches: [],
        divisions: divisions.length ? [...divisions] : [],
      }),
  );
};

const linkEventTeamRelationship = (
  relationships: Map<string, Set<string>>,
  relationshipId: string | null,
  eventTeamId: string,
): void => {
  if (!relationshipId) {
    return;
  }
  const linkedEventTeamIds =
    relationships.get(relationshipId) ?? new Set<string>();
  linkedEventTeamIds.add(eventTeamId);
  relationships.set(relationshipId, linkedEventTeamIds);
};

const indexOfficialEventTeams = (
  rows: any[],
): {
  eventTeamIds: Set<string>;
  eventTeamIdsByRelationshipId: Map<string, Set<string>>;
} => {
  const eventTeamIds = new Set<string>();
  const eventTeamIdsByRelationshipId = new Map<string, Set<string>>();
  for (const eventTeam of rows) {
    const eventTeamId = normalizeEntityId(eventTeam?.id);
    if (!eventTeamId) {
      continue;
    }
    eventTeamIds.add(eventTeamId);
    linkEventTeamRelationship(
      eventTeamIdsByRelationshipId,
      eventTeamId,
      eventTeamId,
    );
    linkEventTeamRelationship(
      eventTeamIdsByRelationshipId,
      normalizeEntityId(eventTeam?.parentTeamId),
      eventTeamId,
    );
  }
  return { eventTeamIds, eventTeamIdsByRelationshipId };
};

const addOfficialMembership = (
  userIdValue: unknown,
  eventTeamIdValue: unknown,
  officialIds: Set<string>,
  eventTeamIds: Set<string>,
  eventTeamIdsByUserId: Map<string, Set<string>>,
): void => {
  const userId = normalizeEntityId(userIdValue);
  const eventTeamId = normalizeEntityId(eventTeamIdValue);
  if (
    !userId ||
    !eventTeamId ||
    !officialIds.has(userId) ||
    !eventTeamIds.has(eventTeamId)
  ) {
    return;
  }
  eventTeamIdsByUserId.get(userId)?.add(eventTeamId);
};

const addCanonicalOfficialMemberships = (
  params: {
    officialIds: string[];
    canonicalTeamIdsByUserId: Map<string, string[]>;
    eventTeamIdsByRelationshipId: Map<string, Set<string>>;
  },
  officialIds: Set<string>,
  eventTeamIds: Set<string>,
  eventTeamIdsByUserId: Map<string, Set<string>>,
): void => {
  for (const userId of params.officialIds) {
    for (const canonicalTeamId of params.canonicalTeamIdsByUserId.get(userId) ??
      []) {
      for (const eventTeamId of params.eventTeamIdsByRelationshipId.get(
        canonicalTeamId,
      ) ?? []) {
        addOfficialMembership(
          userId,
          eventTeamId,
          officialIds,
          eventTeamIds,
          eventTeamIdsByUserId,
        );
      }
    }
  }
};

const addOfficialRosterMemberships = (
  rows: any[],
  officialIds: Set<string>,
  eventTeamIds: Set<string>,
  eventTeamIdsByUserId: Map<string, Set<string>>,
): void => {
  for (const eventTeam of rows) {
    const eventTeamId = normalizeEntityId(eventTeam?.id);
    if (!eventTeamId) {
      continue;
    }
    const rosterUserIds = [
      ...ensureStringArray(eventTeam?.playerIds),
      normalizeEntityId(eventTeam?.captainId),
      normalizeEntityId(eventTeam?.managerId),
      normalizeEntityId(eventTeam?.headCoachId),
      ...ensureStringArray(eventTeam?.coachIds),
    ];
    rosterUserIds.forEach((userId) =>
      addOfficialMembership(
        userId,
        eventTeamId,
        officialIds,
        eventTeamIds,
        eventTeamIdsByUserId,
      ),
    );
  }
};

const addOfficialParticipantMemberships = (
  rows: any[],
  officialIds: Set<string>,
  eventTeamIds: Set<string>,
  eventTeamIdsByUserId: Map<string, Set<string>>,
): void => {
  rows.forEach((row) => {
    if (row?.status === "ACTIVE") {
      addOfficialMembership(
        row?.registrantId,
        row?.eventTeamId,
        officialIds,
        eventTeamIds,
        eventTeamIdsByUserId,
      );
    }
  });
};

const addOfficialStaffMemberships = (
  rows: any[],
  officialIds: Set<string>,
  eventTeamIds: Set<string>,
  eventTeamIdsByUserId: Map<string, Set<string>>,
): void => {
  rows.forEach((row) => {
    addOfficialMembership(
      row?.userId,
      row?.eventTeamId,
      officialIds,
      eventTeamIds,
      eventTeamIdsByUserId,
    );
  });
};

const buildOfficialEventTeamIds = (params: {
  officialIds: string[];
  canonicalTeamIdsByUserId: Map<string, string[]>;
  eventTeamRows: any[];
  eventParticipantRows: any[];
  eventTeamStaffRows: any[];
}): Map<string, Set<string>> => {
  const officialIds = new Set(params.officialIds);
  const eventTeamIdsByUserId = new Map<string, Set<string>>(
    params.officialIds.map((userId) => [userId, new Set<string>()]),
  );
  const { eventTeamIds, eventTeamIdsByRelationshipId } =
    indexOfficialEventTeams(params.eventTeamRows);
  addCanonicalOfficialMemberships(
    {
      officialIds: params.officialIds,
      canonicalTeamIdsByUserId: params.canonicalTeamIdsByUserId,
      eventTeamIdsByRelationshipId,
    },
    officialIds,
    eventTeamIds,
    eventTeamIdsByUserId,
  );
  addOfficialRosterMemberships(
    params.eventTeamRows,
    officialIds,
    eventTeamIds,
    eventTeamIdsByUserId,
  );
  addOfficialParticipantMemberships(
    params.eventParticipantRows,
    officialIds,
    eventTeamIds,
    eventTeamIdsByUserId,
  );
  addOfficialStaffMemberships(
    params.eventTeamStaffRows,
    officialIds,
    eventTeamIds,
    eventTeamIdsByUserId,
  );
  return eventTeamIdsByUserId;
};

const attachTimeSlotsToFields = (
  fields: Record<string, PlayingField>,
  slots: TimeSlot[],
) => {
  for (const field of Object.values(fields)) {
    field.rentalSlots = slots.filter((slot) =>
      (Array.isArray(slot.fieldIds) && slot.fieldIds.length
        ? slot.fieldIds
        : slot.field
          ? [slot.field]
          : []
      ).includes(field.id),
    );
  }
};

const resolveFieldConflictWindowEnd = (params: {
  start: Date;
  end: Date;
  noFixedEndDateTime: boolean;
}): Date => {
  const baselineEndMs = Math.max(params.start.getTime(), params.end.getTime());
  if (!params.noFixedEndDateTime) {
    return new Date(baselineEndMs);
  }
  return new Date(
    baselineEndMs + FIELD_CONFLICT_LOOKAHEAD_WEEKS * 7 * 24 * 60 * MINUTE_MS,
  );
};

const clearManagedFieldBlockingEvents = (
  fields: Record<string, PlayingField>,
): void => {
  for (const field of Object.values(fields)) {
    field.events = field.events.filter((event) => {
      const id = String(event.id ?? "");
      return (
        !id.startsWith(FIELD_MATCH_BLOCK_PREFIX) &&
        !id.startsWith(FIELD_EVENT_BLOCK_PREFIX)
      );
    });
  }
};

const mondayIndexFromUtcNoon = (date: Date): number =>
  (date.getUTCDay() + 6) % 7;

const localNoonForDateInTimeZone = (date: Date, timeZone: string): Date => {
  const parts = localDatePartsInTimeZone(date, timeZone);
  if (!parts) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        12,
      ),
    );
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
};

const datePrefixFromUtcNoon = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

const instantFromUtcNoonAndMinutes = (
  date: Date,
  minutes: number,
  timeZone: string,
): Date | null => {
  const dayOffset = Math.floor(minutes / (24 * 60));
  const minuteOfDay = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const targetDay = new Date(date.getTime() + dayOffset * 24 * 60 * MINUTE_MS);
  const hours = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return parseDateInputInTimeZone(
    `${datePrefixFromUtcNoon(targetDay)}T${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    timeZone,
  );
};

const rangesOverlap = (
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

const normalizeBlockingSlotDays = (slot: any): number[] =>
  normalizeTimeSlotDays({
    dayOfWeek: slot?.dayOfWeek,
    daysOfWeek: slot?.daysOfWeek,
  });

const normalizeBlockingSlotFieldIds = (slot: any): string[] =>
  normalizeTimeSlotFieldIds({
    scheduledFieldId: slot?.scheduledFieldId,
    scheduledFieldIds: slot?.scheduledFieldIds,
  });

const appendBlockingEvent = (params: {
  field: PlayingField;
  id: string;
  start: Date;
  end: Date;
  parentId: string;
}): void => {
  if (params.end.getTime() <= params.start.getTime()) {
    return;
  }
  params.field.events.push(
    new BlockingEvent({
      id: params.id,
      start: params.start,
      end: params.end,
      participants: [],
      field: params.field,
      parentId: params.parentId,
    }),
  );
};

type ResolvedBlockingSlotTimes = {
  slotTimeZone: string;
  slotStart: Date;
  repeating: boolean;
  startMinutes: number;
  explicitEnd: Date | null;
  endMinutes: number | null;
};

const firstBlockingDate = (
  primary: Date | null | undefined,
  fallback: Date | null | undefined,
): Date | null => {
  if (primary !== null && primary !== undefined) {
    return primary;
  }
  if (fallback !== null && fallback !== undefined) {
    return fallback;
  }
  return null;
};

const resolveBlockingStartMinutes = (
  slot: any,
  slotStart: Date,
  slotTimeZone: string,
): number => {
  if (typeof slot?.startTimeMinutes === "number") {
    return slot.startTimeMinutes;
  }
  return minutesInTimeZone(slotStart, slotTimeZone);
};

const resolveBlockingEndMinutes = (
  slot: any,
  explicitEnd: Date | null,
  slotTimeZone: string,
): number | null => {
  if (typeof slot?.endTimeMinutes === "number") {
    return slot.endTimeMinutes;
  }
  if (explicitEnd) {
    return minutesInTimeZone(explicitEnd, slotTimeZone);
  }
  return null;
};

const resolveBlockingSlotTimes = (params: {
  slot: any;
  fallbackStart?: Date | null;
  fallbackEnd?: Date | null;
}): ResolvedBlockingSlotTimes | null => {
  const slotTimeZone = resolveTimeZone(
    params.slot?.timeZone,
    DEFAULT_EVENT_TIME_ZONE,
  );
  const slotStart = firstBlockingDate(
    parseDateInputInTimeZone(params.slot?.startDate, slotTimeZone),
    params.fallbackStart,
  );
  if (!slotStart) {
    return null;
  }
  const explicitEnd = firstBlockingDate(
    parseDateInputInTimeZone(params.slot?.endDate, slotTimeZone),
    params.fallbackEnd,
  );
  return {
    slotTimeZone,
    slotStart,
    repeating: params.slot?.repeating !== false,
    startMinutes: resolveBlockingStartMinutes(
      params.slot,
      slotStart,
      slotTimeZone,
    ),
    explicitEnd,
    endMinutes: resolveBlockingEndMinutes(
      params.slot,
      explicitEnd,
      slotTimeZone,
    ),
  };
};

const deriveBlockingSlotEnd = (
  slotStart: Date,
  startMinutes: number,
  explicitEnd: Date | null,
  endMinutes: number | null,
): Date | null => {
  if (explicitEnd) {
    return explicitEnd;
  }
  if (typeof endMinutes === "number" && endMinutes > startMinutes) {
    return new Date(
      slotStart.getTime() + (endMinutes - startMinutes) * MINUTE_MS,
    );
  }
  return null;
};

const appendSingleBlockingSlot = (
  params: {
    field: PlayingField;
    fieldId: string;
    blockPrefix: string;
    parentId: string;
    windowStart: Date;
    windowEnd: Date;
  },
  slotStart: Date,
  resolvedEnd: Date | null,
): void => {
  if (!resolvedEnd) {
    return;
  }
  if (
    !rangesOverlap(
      slotStart,
      resolvedEnd,
      params.windowStart,
      params.windowEnd,
    )
  ) {
    return;
  }
  const startTime = Math.max(slotStart.getTime(), params.windowStart.getTime());
  const endTime = Math.min(resolvedEnd.getTime(), params.windowEnd.getTime());
  appendBlockingEvent({
    field: params.field,
    id: `${params.blockPrefix}${params.fieldId}__${startTime}`,
    start: new Date(startTime),
    end: new Date(endTime),
    parentId: params.parentId,
  });
};

const appendRepeatingBlockingSlot = (
  params: {
    slot: any;
    field: PlayingField;
    fieldId: string;
    blockPrefix: string;
    parentId: string;
    windowStart: Date;
    windowEnd: Date;
  },
  slotStart: Date,
): void => {
  const effectiveStart = new Date(
    Math.max(slotStart.getTime(), params.windowStart.getTime()),
  );
  const effectiveEnd = new Date(params.windowEnd.getTime());
  if (effectiveEnd.getTime() <= effectiveStart.getTime()) {
    return;
  }
  const occurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: params.slot,
    windowStart: effectiveStart,
    windowEnd: effectiveEnd,
  });
  occurrences.forEach((occurrence) => {
    if (
      !rangesOverlap(
        occurrence.start,
        occurrence.end,
        effectiveStart,
        effectiveEnd,
      )
    ) {
      return;
    }
    appendBlockingEvent({
      field: params.field,
      id: `${params.blockPrefix}${params.fieldId}__${occurrence.start.getTime()}`,
      start: occurrence.start,
      end: occurrence.end,
      parentId: params.parentId,
    });
  });
};

const appendBlockingEventsFromSlot = (params: {
  slot: any;
  field: PlayingField;
  fieldId: string;
  blockPrefix: string;
  parentId: string;
  windowStart: Date;
  windowEnd: Date;
  fallbackStart?: Date | null;
  fallbackEnd?: Date | null;
}): void => {
  const resolved = resolveBlockingSlotTimes(params);
  if (!resolved) {
    return;
  }
  if (!resolved.repeating) {
    appendSingleBlockingSlot(
      params,
      resolved.slotStart,
      deriveBlockingSlotEnd(
        resolved.slotStart,
        resolved.startMinutes,
        resolved.explicitEnd,
        resolved.endMinutes,
      ),
    );
    return;
  }
  appendRepeatingBlockingSlot(params, resolved.slotStart);
};

type FieldSchedulingConflictDetail = FieldSchedulingConflict & {
  blockId: string;
  parentId: string | null;
};

/**
 * The scheduler and rental discovery both need the same conflict sources.
 * Keep the source IDs private here; callers that need a public-safe result use
 * listFieldSchedulingConflicts below.
 */
const listFieldSchedulingConflictDetails = async (
  params: ListFieldSchedulingConflictsInput,
): Promise<EventFieldScheduleConflict[]> => {
  const fieldIds = normalizeFieldIds(params.fieldIds);
  if (
    !fieldIds.length ||
    params.windowEnd.getTime() <= params.windowStart.getTime()
  ) {
    return [];
  }

  const catalog = await loadFieldBlockerCatalog({
    client: params.client,
    fieldIds,
    lowerBound: params.windowStart,
    excludeEventId: params.excludeEventId,
  });

  return fieldSchedulingConflictDetails(
    catalog,
    params.windowStart,
    params.windowEnd,
  );
};

/**
 * Read-only, public-safe scheduling conflict view. It uses exactly the same
 * event, match, recurring-slot, and active-rental-booking checks as event
 * scheduling validation but strips source metadata from the result.
 */
export const listFieldSchedulingConflicts = async (
  params: ListFieldSchedulingConflictsInput,
): Promise<FieldSchedulingConflict[]> => {
  const conflicts = await listFieldSchedulingConflictDetails(params);
  return conflicts
    .map(({ fieldId, start, end }) => ({ fieldId, start, end }))
    .sort(
      (left, right) =>
        left.fieldId.localeCompare(right.fieldId) ||
        left.start.getTime() - right.start.getTime() ||
        left.end.getTime() - right.end.getTime(),
    );
};

const attachFieldSchedulingConflicts = async (params: {
  client: PrismaLike;
  eventId: string;
  fields: Record<string, PlayingField>;
  windowStart: Date;
  windowEnd: Date;
}): Promise<void> => {
  if (
    !Object.keys(params.fields).length ||
    params.windowEnd.getTime() <= params.windowStart.getTime()
  ) {
    return;
  }
  clearManagedFieldBlockingEvents(params.fields);
  const catalog = await loadFieldBlockerCatalog({
    client: params.client,
    fieldIds: Object.keys(params.fields),
    lowerBound: params.windowStart,
    excludeEventId: params.eventId,
  });
  const conflicts = fieldSchedulingConflictDetails(
    catalog,
    params.windowStart,
    params.windowEnd,
  );
  for (const conflict of conflicts) {
    const field = params.fields[conflict.fieldId];
    if (!field) {
      continue;
    }
    appendBlockingEvent({
      field,
      id: conflict.blockId,
      start: conflict.start,
      end: conflict.end,
      parentId: conflict.parentId ?? "",
    });
  }
};

const toOptionalDate = (value: unknown): Date | null => {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildConflictFieldMap = (
  fieldIds: string[],
): Record<string, PlayingField> => {
  const fields: Record<string, PlayingField> = {};
  for (const fieldId of fieldIds) {
    fields[fieldId] = {
      id: fieldId,
      events: [],
      matches: [],
      rentalSlots: [],
    } as unknown as PlayingField;
  }
  return fields;
};

const buildFieldScheduleConflict = (
  fieldId: string,
  block: any,
  start: Date,
  end: Date,
): EventFieldScheduleConflict | null => {
  const blockStart = toOptionalDate(block?.start);
  const blockEnd = toOptionalDate(block?.end);
  if (
    !blockStart ||
    !blockEnd ||
    blockEnd.getTime() <= blockStart.getTime()
  ) {
    return null;
  }
  if (!rangesOverlap(blockStart, blockEnd, start, end)) {
    return null;
  }
  return {
    fieldId,
    blockId: String(block?.id ?? ""),
    parentId: normalizeEntityId(block?.parentId),
    start: blockStart,
    end: blockEnd,
  };
};

const collectFieldScheduleConflicts = (params: {
  fields: Record<string, PlayingField>;
  start: Date;
  end: Date;
}): EventFieldScheduleConflict[] => {
  const conflicts: EventFieldScheduleConflict[] = [];
  for (const [fieldId, field] of Object.entries(params.fields)) {
    for (const block of ensureArray((field as any)?.events)) {
      const conflict = buildFieldScheduleConflict(
        fieldId,
        block,
        params.start,
        params.end,
      );
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }
  return conflicts;
};

export const assertNoEventFieldSchedulingConflicts = async (params: {
  client: PrismaLike;
  eventId: string;
  organizationId?: string | null;
  fieldIds: string[];
  timeSlotIds?: string[];
  start: Date;
  end: Date;
  noFixedEndDateTime: boolean;
  eventType?: string | null;
  parentEvent?: string | null;
}): Promise<void> => {
  const eventType =
    typeof params.eventType === "string" ? params.eventType.toUpperCase() : "";
  const parentEventId = normalizeEntityId(params.parentEvent);
  const shouldValidate =
    eventType === "EVENT" || (eventType === "WEEKLY_EVENT" && !parentEventId);
  if (!shouldValidate) {
    return;
  }

  const fieldIds = normalizeFieldIds(params.fieldIds);
  if (!fieldIds.length) {
    return;
  }
  if (params.end.getTime() <= params.start.getTime()) {
    return;
  }

  const conflictWindowEnd = resolveFieldConflictWindowEnd({
    start: params.start,
    end: params.end,
    noFixedEndDateTime: params.noFixedEndDateTime,
  });
  if (conflictWindowEnd.getTime() <= params.start.getTime()) {
    return;
  }
  await acquireFieldLocks(params.client, fieldIds);
  const fields = buildConflictFieldMap(fieldIds);
  await attachFieldSchedulingConflicts({
    client: params.client,
    eventId: params.eventId,
    fields,
    windowStart: params.start,
    windowEnd: conflictWindowEnd,
  });

  const conflicts = collectFieldScheduleConflicts({
    fields,
    start: params.start,
    end: conflictWindowEnd,
  });
  if (conflicts.length > 0) {
    throw new EventFieldConflictError(conflicts);
  }
};

const readMatchRowValue = <T>(
  row: Record<string, unknown>,
  key: string,
  fallback: T,
): T => {
  const value = row[key];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const resolveMatchDivision = (
  row: Record<string, unknown>,
  divisionLookup: Map<string, Division>,
  divisions: Division[],
): Division => {
  const normalizedDivisionId = normalizeDivisionKey(row.division);
  if (normalizedDivisionId) {
    const normalizedDivision = divisionLookup.get(normalizedDivisionId);
    if (normalizedDivision) {
      return normalizedDivision;
    }
  }
  if (typeof row.division === "string") {
    const rawDivision = divisionLookup.get(row.division);
    if (rawDivision) {
      return rawDivision;
    }
  }
  return divisions[0] as Division;
};

const resolveMatchHydrationFlags = (
  row: Record<string, unknown>,
  hydration: {
    segmentMatchIds?: Set<string> | null;
    incidentMatchIds?: Set<string> | null;
  },
): {
  rowMatchId: string;
  shouldHydrateSegments: boolean;
  shouldHydrateIncidents: boolean;
} => {
  const rowMatchId =
    normalizeEntityId(row.id) ?? String(readMatchRowValue(row, "id", ""));
  const shouldHydrateSegments =
    !hydration.segmentMatchIds || hydration.segmentMatchIds.has(rowMatchId);
  const shouldHydrateIncidents =
    !hydration.incidentMatchIds || hydration.incidentMatchIds.has(rowMatchId);
  return { rowMatchId, shouldHydrateSegments, shouldHydrateIncidents };
};

const sortMatchDetailRows = (rows: any[]): any[] =>
  rows.sort(
    (left, right) =>
      Number(left.sequence ?? 0) - Number(right.sequence ?? 0),
  );

const resolveMatchSegments = (
  row: Record<string, unknown>,
  shouldHydrate: boolean,
  segmentRowsByMatchId: Map<string, any[]>,
): any[] => {
  if (!shouldHydrate) {
    return [];
  }
  const rowMatchId = normalizeEntityId(row.id);
  return sortMatchDetailRows(
    rowMatchId ? segmentRowsByMatchId.get(rowMatchId) ?? [] : [],
  ).map(
    serializeMatchSegmentRow,
  );
};

const resolveMatchIncidents = (
  row: Record<string, unknown>,
  shouldHydrate: boolean,
  incidentRowsByMatchId: Map<string, any[]>,
): any[] => {
  if (!shouldHydrate) {
    return [];
  }
  const rowMatchId = normalizeEntityId(row.id);
  return sortMatchDetailRows(
    rowMatchId ? incidentRowsByMatchId.get(rowMatchId) ?? [] : [],
  ).map(
    serializeMatchIncidentRow,
  );
};

const hasMatchBracketLinks = (row: Record<string, unknown>): boolean =>
  Boolean(
    row.losersBracket ||
      row.previousLeftId ||
      row.previousRightId ||
      row.winnerNextMatchId ||
      row.loserNextMatchId,
  );

const resolveMatchCompetitionPhase = (
  row: Record<string, unknown>,
  event: Tournament | League,
  division: Division,
): DivisionCompetitionPhase =>
  division.phase ??
  resolveDivisionCompetitionPhase({
    eventType: event.eventType,
    divisionKind: division.kind,
    hasBracketLinks: hasMatchBracketLinks(row),
  });

const resolveMatchOfficialAssignments = (params: {
  row: Record<string, unknown>;
  event: Tournament | League;
  officialPositionsForMatch: EventOfficialPosition[];
  eventOfficialsById: Map<string, EventOfficialRecord>;
}): MatchOfficialAssignment[] => {
  const positionCountsForMatch = new Map(
    params.officialPositionsForMatch.map((position) => [
      position.id,
      position.count,
    ]),
  );
  let officialAssignments: MatchOfficialAssignment[] = [];
  try {
    officialAssignments = normalizeMatchOfficialAssignments(
      params.row.officialIds,
      {
        positionCountsById: positionCountsForMatch,
        eventOfficialsById: params.eventOfficialsById,
      },
    );
  } catch {
    officialAssignments = [];
  }
  if (!officialAssignments.length) {
    officialAssignments = buildLegacyOfficialAssignment({
      eventId: readMatchRowValue(params.row, "eventId", params.event.id),
      officialId: readMatchRowValue<string | null>(
        params.row,
        "officialId",
        null,
      ),
      officialCheckedIn:
        readMatchRowValue<boolean>(params.row, "officialCheckedIn", false) === true,
      officialPositions: params.officialPositionsForMatch,
    });
  }
  return completeMatchOfficialAssignmentSlots(
    officialAssignments,
    params.officialPositionsForMatch,
  );
};

const resolveMatchOfficialData = (params: {
  row: Record<string, unknown>;
  event: Tournament | League;
  division: Division;
  eventOfficialsById: Map<string, EventOfficialRecord>;
}): {
  officialAssignments: MatchOfficialAssignment[];
  primaryOfficialId: string | null;
  primaryOfficialCheckedIn: boolean;
} => {
  const competitionPhase = resolveMatchCompetitionPhase(
    params.row,
    params.event,
    params.division,
  );
  const officialPositionsForMatch =
    params.division.phaseSettings?.[competitionPhase]?.officialPositions ??
    params.event.officialPositions;
  const officialAssignments = resolveMatchOfficialAssignments({
    row: params.row,
    event: params.event,
    officialPositionsForMatch,
    eventOfficialsById: params.eventOfficialsById,
  });
  const primaryOfficialId =
    deriveLegacyOfficialIdFromAssignments(officialAssignments) ??
    normalizeEntityId(params.row.officialId);
  const primaryOfficialCheckedIn = officialAssignments.length
    ? deriveLegacyOfficialCheckedInFromAssignments(officialAssignments)
    : readMatchRowValue(params.row, "officialCheckedIn", false);
  return {
    officialAssignments,
    primaryOfficialId,
    primaryOfficialCheckedIn,
  };
};

type MatchPhaseRuleInputs = {
  competitionPhase: DivisionCompetitionPhase;
  phaseUsesSets: boolean;
  phaseSetsPerMatch: number | null;
  phaseWinnerSetCount: number | null;
  phaseLoserSetCount: number | null;
  phaseMatchDurationMinutes: number;
};

const resolveMatchPhaseUsesSets = (
  division: Division,
  event: Tournament | League,
): boolean =>
  division.kind === "LEAGUE"
    ? division.leagueConfig?.usesSets ?? event.usesSets
    : event.usesSets;

const resolveMatchPhaseSetCounts = (
  division: Division,
  event: Tournament | League,
): Pick<
  MatchPhaseRuleInputs,
  "phaseSetsPerMatch" | "phaseWinnerSetCount" | "phaseLoserSetCount"
> => ({
  phaseSetsPerMatch:
    division.leagueConfig?.setsPerMatch ??
    (event as any).setsPerMatch ??
    null,
  phaseWinnerSetCount:
    division.playoffConfig?.winnerSetCount ??
    (event as any).winnerSetCount ??
    null,
  phaseLoserSetCount:
    division.playoffConfig?.loserSetCount ??
    (event as any).loserSetCount ??
    null,
});

const resolveMatchPhaseDuration = (
  competitionPhase: string,
  division: Division,
  event: Tournament | League,
): number =>
  competitionPhase === "LEAGUE" || competitionPhase === "POOL"
    ? division.leagueConfig?.matchDurationMinutes ??
      event.matchDurationMinutes
    : division.playoffConfig?.matchDurationMinutes ??
      event.matchDurationMinutes;

const resolveMatchPhaseRuleInputs = (params: {
  row: Record<string, unknown>;
  event: Tournament | League;
  division: Division;
}): MatchPhaseRuleInputs => {
  const competitionPhase = resolveMatchCompetitionPhase(
    params.row,
    params.event,
    params.division,
  );
  const setCounts = resolveMatchPhaseSetCounts(params.division, params.event);
  return {
    competitionPhase,
    phaseUsesSets: resolveMatchPhaseUsesSets(
      params.division,
      params.event,
    ),
    ...setCounts,
    phaseMatchDurationMinutes: resolveMatchPhaseDuration(
      competitionPhase,
      params.division,
      params.event,
    ),
  };
};

const buildContextualMatchRules = (params: {
  row: Record<string, unknown>;
  event: Tournament | League;
  phaseRules: MatchPhaseRuleInputs;
  phaseResolvedMatchRules: any;
  segments: any[];
}): any => {
  const { row, event, phaseRules, phaseResolvedMatchRules, segments } = params;
  if (row.matchRulesSnapshot) {
    return row.matchRulesSnapshot;
  }
  return resolveMatchRulesForContext({
    baseRules: phaseResolvedMatchRules,
    eventType: event.eventType,
    usesSets: phaseRules.phaseUsesSets,
    setsPerMatch: phaseRules.phaseSetsPerMatch,
    winnerSetCount: phaseRules.phaseWinnerSetCount,
    loserSetCount: phaseRules.phaseLoserSetCount,
    losersBracket: Boolean(row.losersBracket),
    previousLeftId: readMatchRowValue(row, "previousLeftId", null),
    previousRightId: readMatchRowValue(row, "previousRightId", null),
    winnerNextMatchId: readMatchRowValue(row, "winnerNextMatchId", null),
    loserNextMatchId: readMatchRowValue(row, "loserNextMatchId", null),
    existingSegmentCount: segments.length,
    existingTeam1PointCount: ensureArray(row.team1Points as unknown[]).length,
    existingTeam2PointCount: ensureArray(row.team2Points as unknown[]).length,
  });
};

const resolveMatchPhaseRules = (params: {
  row: Record<string, unknown>;
  event: Tournament | League;
  division: Division;
  segments: any[];
  resolvedMatchRules: ReturnType<typeof resolveMatchRules> | null;
}): any => {
  const phaseRules = resolveMatchPhaseRuleInputs(params);
  const phaseResolvedMatchRules = resolveMatchRulesForDivisionPhase({
    phase: phaseRules.competitionPhase,
    phaseSettings: params.division.phaseSettings,
    sportTemplate:
      params.resolvedMatchRules ?? (params.event as any).resolvedMatchRules,
    autoCreatePointMatchIncidents: (params.event as any)
      .autoCreatePointMatchIncidents,
    usesSets: phaseRules.phaseUsesSets,
    setsPerMatch: phaseRules.phaseSetsPerMatch,
    winnerSetCount: phaseRules.phaseWinnerSetCount,
    matchDurationMinutes: phaseRules.phaseMatchDurationMinutes,
    officialPositions: params.event.officialPositions,
  });
  return buildContextualMatchRules({
    row: params.row,
    event: params.event,
    phaseRules,
    phaseResolvedMatchRules,
    segments: params.segments,
  });
};

const resolveMatchField = (
  row: Record<string, unknown>,
  fields: Record<string, PlayingField>,
): PlayingField | null => {
  const fieldId = readMatchRowValue<string | null>(row, "fieldId", null);
  if (!fieldId) {
    return null;
  }
  return fields[fieldId] ?? null;
};

const resolveMatchTeam = (
  row: Record<string, unknown>,
  teams: Record<string, Team>,
  key: string,
): Team | null => {
  const teamId = readMatchRowValue<string | null>(row, key, null);
  if (!teamId) {
    return null;
  }
  return teams[teamId] ?? null;
};

const resolveMatchOfficial = (
  row: Record<string, unknown>,
  officialLookup: Map<string, UserData>,
): UserData | null => {
  const officialId = normalizeEntityId(row.officialId);
  if (!officialId) {
    return null;
  }
  return officialLookup.get(officialId) ?? null;
};

const resolveMatchPlacementState = (
  row: Record<string, unknown>,
): "PLACED" | "UNPLACED" =>
  readMatchRowValue(row, "placementState", null) === "PLACED" ||
  Boolean(row.fieldId)
    ? "PLACED"
    : "UNPLACED";

const resolveMatchNullableDateForConstructor = (
  value: Date | null,
): Date => value ?? new Date(0);

const applyHydratedMatchDates = (
  match: Match,
  start: Date | null,
  end: Date | null,
): void => {
  if (!start) {
    (match as unknown as { start: Date | null }).start = null;
  }
  if (!end) {
    (match as unknown as { end: Date | null }).end = null;
  }
};

const markHydratedMatchDetails = (
  match: Match,
  shouldHydrateSegments: boolean,
  shouldHydrateIncidents: boolean,
): void => {
  Object.defineProperty(match, hydratedMatchSegmentsSymbol, {
    configurable: true,
    enumerable: false,
    value: shouldHydrateSegments,
    writable: true,
  });
  Object.defineProperty(match, hydratedMatchIncidentsSymbol, {
    configurable: true,
    enumerable: false,
    value: shouldHydrateIncidents,
    writable: true,
  });
};

const buildMatchFromRow = (params: {
  row: any;
  event: Tournament | League;
  teams: Record<string, Team>;
  fields: Record<string, PlayingField>;
  divisionLookup: Map<string, Division>;
  divisions: Division[];
  officialLookup: Map<string, UserData>;
  eventOfficialsById: Map<string, EventOfficialRecord>;
  segmentRowsByMatchId: Map<string, any[]>;
  incidentRowsByMatchId: Map<string, any[]>;
  resolvedMatchRules: ReturnType<typeof resolveMatchRules> | null;
  hydration: {
    segmentMatchIds?: Set<string> | null;
    incidentMatchIds?: Set<string> | null;
  };
}): Match => {
  const division = resolveMatchDivision(
    params.row,
    params.divisionLookup,
    params.divisions,
  );
  const {
    rowMatchId,
    shouldHydrateSegments,
    shouldHydrateIncidents,
  } = resolveMatchHydrationFlags(params.row, params.hydration);
  const start = toOptionalDate(params.row.start);
  const end = toOptionalDate(params.row.end);
  const segments = resolveMatchSegments(
    params.row,
    shouldHydrateSegments,
    params.segmentRowsByMatchId,
  );
  const incidents = resolveMatchIncidents(
    params.row,
    shouldHydrateIncidents,
    params.incidentRowsByMatchId,
  );
  const officialData = resolveMatchOfficialData({
    row: params.row,
    event: params.event,
    division,
    eventOfficialsById: params.eventOfficialsById,
  });
  const contextualResolvedMatchRules = resolveMatchPhaseRules({
    row: params.row,
    event: params.event,
    division,
    segments,
    resolvedMatchRules: params.resolvedMatchRules,
  });
  const winnerEventTeamId = resolveHydratedWinnerEventTeamId({
    persistedWinnerEventTeamId: params.row.winnerEventTeamId,
    shouldHydrateSegments,
    segments,
    resolvedMatchRules: contextualResolvedMatchRules,
    team1Id: params.row.team1Id,
    team2Id: params.row.team2Id,
  });
  const match = new Match({
    id: params.row.id,
    matchId: readMatchRowValue(params.row, "matchId", null),
    locked: Boolean(params.row.locked),
    placementState: resolveMatchPlacementState(params.row),
    team1Seed:
      typeof params.row.team1Seed === "number" ? params.row.team1Seed : null,
    team2Seed:
      typeof params.row.team2Seed === "number" ? params.row.team2Seed : null,
    team1Points: ensureArray(params.row.team1Points),
    team2Points: ensureArray(params.row.team2Points),
    // Match currently expects Date in constructor, but unscheduled matches may be null.
    // Use a temporary fallback and overwrite below.
    start: resolveMatchNullableDateForConstructor(start),
    end: resolveMatchNullableDateForConstructor(end),
    createdAt: readMatchRowValue(params.row, "createdAt", null),
    updatedAt: readMatchRowValue(params.row, "updatedAt", null),
    losersBracket: Boolean(params.row.losersBracket),
    division,
    status: readMatchRowValue(params.row, "status", null),
    field: resolveMatchField(params.row, params.fields),
    resultStatus: readMatchRowValue(params.row, "resultStatus", null),
    resultType: readMatchRowValue(params.row, "resultType", null),
    actualStart: toOptionalDate(params.row.actualStart),
    actualEnd: toOptionalDate(params.row.actualEnd),
    statusReason: readMatchRowValue(params.row, "statusReason", null),
    winnerEventTeamId,
    matchRulesSnapshot: readMatchRowValue(
      params.row,
      "matchRulesSnapshot",
      null,
    ),
    resolvedMatchRules: contextualResolvedMatchRules,
    segments,
    incidents,
    bufferMs: matchBufferMs(params.event),
    side: sideFrom(params.row.side),
    officialCheckedIn: officialData.primaryOfficialCheckedIn,
    officialAssignments: officialData.officialAssignments,
    teamOfficial: resolveMatchTeam(params.row, params.teams, "teamOfficialId"),
    official: resolveMatchOfficial(params.row, params.officialLookup),
    team1: resolveMatchTeam(params.row, params.teams, "team1Id"),
    team2: resolveMatchTeam(params.row, params.teams, "team2Id"),
    eventId: params.row.eventId,
  });
  applyHydratedMatchDates(match, start, end);
  markHydratedMatchDetails(
    match,
    shouldHydrateSegments,
    shouldHydrateIncidents,
  );
  return match;
};

const resolveMatchPointer = (
  matches: Record<string, Match>,
  matchId: unknown,
): Match | null => {
  if (!matchId) {
    return null;
  }
  return matches[String(matchId)] ?? null;
};

const wireMatchPointers = (
  rows: any[],
  matches: Record<string, Match>,
): void => {
  for (const row of rows) {
    const match = matches[row.id];
    if (!match) continue;
    match.previousLeftMatch = resolveMatchPointer(
      matches,
      row.previousLeftId,
    );
    match.previousRightMatch = resolveMatchPointer(
      matches,
      row.previousRightId,
    );
    match.winnerNextMatch = resolveMatchPointer(
      matches,
      row.winnerNextMatchId,
    );
    match.loserNextMatch = resolveMatchPointer(
      matches,
      row.loserNextMatchId,
    );
  }
};

const attachMatchesToRelations = (
  matches: Record<string, Match>,
): void => {
  for (const match of Object.values(matches)) {
    if (match.field) {
      match.field.matches.push(match);
    }
    for (const participant of match.getParticipants()) {
      const matchesAttr = (participant as any).matches as Match[] | undefined;
      if (!matchesAttr || matchesAttr.includes(match)) continue;
      matchesAttr.push(match);
    }
  }
};

const buildMatches = (
  rows: any[],
  event: Tournament | League,
  teams: Record<string, Team>,
  fields: Record<string, PlayingField>,
  divisions: Division[],
  officials: UserData[],
  segmentRowsByMatchId: Map<string, any[]> = new Map(),
  incidentRowsByMatchId: Map<string, any[]> = new Map(),
  resolvedMatchRules: ReturnType<typeof resolveMatchRules> | null = null,
  hydration: {
    segmentMatchIds?: Set<string> | null;
    incidentMatchIds?: Set<string> | null;
  } = {},
) => {
  const divisionLookup = new Map(
    divisions.map((division) => [division.id, division]),
  );
  const officialLookup = new Map(
    officials.map((official) => [official.id, official]),
  );
  const eventOfficialsById = new Map(
    event.eventOfficials.map((official) => [official.id, official]),
  );
  const matches: Record<string, Match> = {};
  for (const row of rows) {
    matches[row.id] = buildMatchFromRow({
      row,
      event,
      teams,
      fields,
      divisionLookup,
      divisions,
      officialLookup,
      eventOfficialsById,
      segmentRowsByMatchId,
      incidentRowsByMatchId,
      resolvedMatchRules,
      hydration,
    });
  }
  wireMatchPointers(rows, matches);
  attachMatchesToRelations(matches);
  return matches;
};

const hydratedMatchSegmentsSymbol = Symbol("hydratedMatchSegments");
const hydratedMatchIncidentsSymbol = Symbol("hydratedMatchIncidents");
type HydratedMatchPersistenceInput = MatchPersistenceInput & {
  [hydratedMatchSegmentsSymbol]?: boolean;
  [hydratedMatchIncidentsSymbol]?: boolean;
};

type LoadEventWithRelationsOptions = {
  hydratedMatchDetailIds?: string[] | null;
  retainedMatchIds?: string[] | null;
  includeTeamPlayers?: boolean;
  includeTeamRegistrations?: boolean;
};

const shouldPersistHydratedMatchSegments = (
  match: HydratedMatchPersistenceInput,
): boolean =>
  match[hydratedMatchSegmentsSymbol] !== false;

const shouldPersistHydratedMatchIncidents = (
  match: HydratedMatchPersistenceInput,
): boolean =>
  match[hydratedMatchIncidentsSymbol] !== false;
type EventPhaseParticipantRow = {
  phaseDivisionId?: string | null;
  eventTeamId?: string | null;
};

type EventPhaseSourceRow = {
  phaseDivisionId?: string | null;
  entryDivisionId?: string | null;
};

type EventDivisionHydrationState = {
  hydratedDivisionRows: any[];
  divisions: Division[];
  playoffDivisions: Division[];
  divisionMap: Map<string, Division>;
  fieldIdsByDivision: Map<string, string[]>;
  allDivisions: Division[];
  phaseSourceDivisionIdsByPhase: Map<string, string[]>;
  phaseDivisionsBySource: Map<string, Division[]>;
  relatedPhaseDivisionsByPhaseId: Map<string, Division[]>;
};

const loadEventPhaseRows = async (
  client: PrismaLike,
  eventId: string,
): Promise<{
  participantRows: EventPhaseParticipantRow[];
  sourceRows: EventPhaseSourceRow[];
}> => {
  const participantDelegate = (client as any).eventDivisionPhaseParticipants;
  const sourceDelegate = (client as any).eventDivisionPhaseSources;
  const participantRows =
    typeof participantDelegate?.findMany === "function"
      ? await participantDelegate.findMany({
          where: { eventId },
          select: { phaseDivisionId: true, eventTeamId: true },
          orderBy: [
            { phaseDivisionId: "asc" },
            { eventTeamId: "asc" },
          ],
        })
      : [];
  const sourceRows =
    typeof sourceDelegate?.findMany === "function"
      ? await sourceDelegate.findMany({
          where: { eventId },
          select: { phaseDivisionId: true, entryDivisionId: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        })
      : [];
  return { participantRows, sourceRows };
};

const collectPhaseParticipantTeamIds = (
  rows: EventPhaseParticipantRow[],
): Map<string, string[]> => {
  const teamIdsByDivision = new Map<string, string[]>();
  for (const row of rows) {
    const divisionId = normalizeDivisionKey(row.phaseDivisionId);
    const teamId = normalizeEntityId(row.eventTeamId);
    if (!divisionId || !teamId) continue;
    const teamIds = teamIdsByDivision.get(divisionId) ?? [];
    if (!teamIds.includes(teamId)) teamIds.push(teamId);
    teamIdsByDivision.set(divisionId, teamIds);
  }
  return teamIdsByDivision;
};

const hydratePhaseDivisionRow = (
  row: any,
  participantTeamIdsByDivision: Map<string, string[]>,
): any => {
  if (String(row.role ?? "").toUpperCase() !== "PHASE") {
    return row;
  }
  const divisionId = normalizeDivisionKey(row.id) ?? row.id;
  const participantTeamIds =
    participantTeamIdsByDivision.get(divisionId) ?? [];
  return {
    ...row,
    teamIds: Array.from(new Set(participantTeamIds)),
  };
};

const hydrateEventDivisionRows = (
  rows: any[],
  participantRows: EventPhaseParticipantRow[],
): any[] => {
  const teamIdsByDivision = collectPhaseParticipantTeamIds(participantRows);
  return rows.map((row) =>
    hydratePhaseDivisionRow(row, teamIdsByDivision),
  );
};

const isExplicitPhaseDivisionRow = (row: any): boolean =>
  String(row?.role ?? "").toUpperCase() === "PHASE" || Boolean(row?.phase);

const filterDivisionRowsByPhase = (
  rows: any[],
  phase: string,
): any[] =>
  rows.filter(
    (row) => String(row?.phase ?? "").toUpperCase() === phase,
  );

const selectEventDivisionRows = (
  rows: any[],
  eventTypeValue: unknown,
): {
  leagueDivisionRows: any[];
  playoffDivisionRows: any[];
} => {
  const legacyLeagueDivisionRows = rows.filter(
    (row) => normalizeDivisionKind(row?.kind, "LEAGUE") !== "PLAYOFF",
  );
  const legacyPlayoffDivisionRows = rows.filter(
    (row) => normalizeDivisionKind(row?.kind, "LEAGUE") === "PLAYOFF",
  );
  if (!rows.some(isExplicitPhaseDivisionRow)) {
    return {
      leagueDivisionRows: legacyLeagueDivisionRows,
      playoffDivisionRows: legacyPlayoffDivisionRows,
    };
  }
  const phaseRows = rows.filter(isExplicitPhaseDivisionRow);
  const eventType = String(eventTypeValue ?? "").toUpperCase();
  let leagueDivisionRows: any[];
  let playoffDivisionRows: any[];
  if (eventType === "LEAGUE") {
    leagueDivisionRows = filterDivisionRowsByPhase(phaseRows, "LEAGUE");
    playoffDivisionRows = filterDivisionRowsByPhase(phaseRows, "PLAYOFF");
  } else if (eventType === "TOURNAMENT") {
    const poolRows = filterDivisionRowsByPhase(phaseRows, "POOL");
    const bracketRows = phaseRows.filter((row) =>
      ["BRACKET", "PLAYOFF"].includes(
        String(row?.phase ?? "").toUpperCase(),
      ),
    );
    leagueDivisionRows = poolRows.length ? poolRows : bracketRows;
    playoffDivisionRows = poolRows.length ? bracketRows : [];
  } else {
    leagueDivisionRows = filterDivisionRowsByPhase(phaseRows, "LEAGUE");
    playoffDivisionRows = [];
  }
  if (!leagueDivisionRows.length) {
    leagueDivisionRows = legacyLeagueDivisionRows;
  }
  return { leagueDivisionRows, playoffDivisionRows };
};

const mergeDivisionMaps = (
  target: Map<string, Division>,
  source: Map<string, Division>,
): void => {
  for (const [key, division] of source.entries()) {
    target.set(key, division);
  }
};

const mergeDivisionFieldIds = (
  target: Map<string, string[]>,
  source: Map<string, string[]>,
): void => {
  for (const [divisionId, phaseFieldIds] of source.entries()) {
    const existingFieldIds = target.get(divisionId) ?? [];
    target.set(
      divisionId,
      Array.from(new Set([...existingFieldIds, ...phaseFieldIds])),
    );
  }
};

const addPhaseSourceId = (
  phaseSourceDivisionIdsByPhase: Map<string, string[]>,
  phaseDivisionId: string,
  entryDivisionId: string,
): void => {
  const sourceIds = phaseSourceDivisionIdsByPhase.get(phaseDivisionId) ?? [];
  if (!sourceIds.includes(entryDivisionId)) sourceIds.push(entryDivisionId);
  phaseSourceDivisionIdsByPhase.set(phaseDivisionId, sourceIds);
};

const collectPhaseSourceDivisionIds = (
  rows: EventPhaseSourceRow[],
): Map<string, string[]> => {
  const sourceIdsByPhase = new Map<string, string[]>();
  for (const row of rows) {
    const phaseDivisionId = normalizeDivisionKey(row.phaseDivisionId);
    const entryDivisionId = normalizeDivisionKey(row.entryDivisionId);
    if (!phaseDivisionId || !entryDivisionId) {
      throw new Error(
        "Unable to hydrate Phase Division scope because a persisted phase or source Division ID is missing.",
      );
    }
    addPhaseSourceId(sourceIdsByPhase, phaseDivisionId, entryDivisionId);
  }
  return sourceIdsByPhase;
};

const projectPhaseDivisionFieldIds = (
  rows: any[],
  phaseSourceDivisionIdsByPhase: Map<string, string[]>,
  fieldIdsByDivision: Map<string, string[]>,
  eventFieldIds: unknown,
): void => {
  for (const row of rows) {
    if (String(row.role ?? "").toUpperCase() !== "PHASE") continue;
    const phaseDivisionId = normalizeDivisionKey(row.id);
    if (!phaseDivisionId) continue;
    const sourceDivisionIds = [
      ...(phaseSourceDivisionIdsByPhase.get(phaseDivisionId) ?? []),
      normalizeDivisionKey(row.sourceDivisionId),
    ].filter((id): id is string => Boolean(id));
    const inheritedFieldIds = sourceDivisionIds.flatMap(
      (sourceDivisionId) => fieldIdsByDivision.get(sourceDivisionId) ?? [],
    );
    const ownFieldIds = ensureStringArray(row.fieldIds);
    const projectedFieldIds = Array.from(
      new Set([
        ...ownFieldIds,
        ...inheritedFieldIds,
        ...(ownFieldIds.length || inheritedFieldIds.length
          ? []
          : ensureStringArray(eventFieldIds)),
      ]),
    );
    fieldIdsByDivision.set(phaseDivisionId, projectedFieldIds);
  }
};

const isRegularDivisionPhase = (phase: string): boolean =>
  phase === "LEAGUE" || phase === "POOL";

const isFinalDivisionPhase = (phase: string): boolean =>
  phase === "PLAYOFF" || phase === "BRACKET";

const addPhaseSourceRelation = (
  phaseDivisionsBySource: Map<string, Division[]>,
  phaseSourceDivisionIdsByPhase: Map<string, string[]>,
  divisionMap: Map<string, Division>,
  phaseDivisionId: string,
  sourceDivisionId: string,
): void => {
  const normalizedPhaseId = normalizeDivisionKey(phaseDivisionId);
  const normalizedSourceId = normalizeDivisionKey(sourceDivisionId);
  if (!normalizedPhaseId || !normalizedSourceId) {
    throw new Error(
      "Unable to hydrate Phase Division scope because a phase or source Division ID is missing.",
    );
  }
  const phaseDivision = divisionMap.get(normalizedPhaseId);
  if (!phaseDivision) {
    throw new Error(
      `Unable to hydrate Phase Division scope because ${phaseDivisionId} is not present in the Event.`,
    );
  }
  const phaseDivisions = phaseDivisionsBySource.get(normalizedSourceId) ?? [];
  if (!phaseDivisions.some((division) => division.id === phaseDivision.id)) {
    phaseDivisions.push(phaseDivision);
  }
  phaseDivisionsBySource.set(normalizedSourceId, phaseDivisions);
  addPhaseSourceId(
    phaseSourceDivisionIdsByPhase,
    normalizedPhaseId,
    normalizedSourceId,
  );
};

const buildPhaseDivisionsBySource = (
  rows: any[],
  phaseSourceDivisionIdsByPhase: Map<string, string[]>,
  divisionMap: Map<string, Division>,
): Map<string, Division[]> => {
  const phaseDivisionsBySource = new Map<string, Division[]>();
  for (const [
    phaseDivisionId,
    sourceDivisionIds,
  ] of phaseSourceDivisionIdsByPhase.entries()) {
    for (const sourceDivisionId of sourceDivisionIds) {
      addPhaseSourceRelation(
        phaseDivisionsBySource,
        phaseSourceDivisionIdsByPhase,
        divisionMap,
        phaseDivisionId,
        sourceDivisionId,
      );
    }
  }
  for (const row of rows) {
    if (String(row.role ?? "").toUpperCase() !== "PHASE") continue;
    const phaseDivisionId = normalizeDivisionKey(row.id);
    const sourceDivisionId = normalizeDivisionKey(row.sourceDivisionId);
    if (!phaseDivisionId) {
      throw new Error(
        "Unable to hydrate Phase Division scope because a persisted phase Division ID is missing.",
      );
    }
    if (sourceDivisionId) {
      addPhaseSourceRelation(
        phaseDivisionsBySource,
        phaseSourceDivisionIdsByPhase,
        divisionMap,
        phaseDivisionId,
        sourceDivisionId,
      );
    } else if (!phaseSourceDivisionIdsByPhase.has(phaseDivisionId)) {
      throw new Error(
        `Unable to hydrate Phase Division scope because ${row.id} has no source Division.`,
      );
    }
  }
  return phaseDivisionsBySource;
};

const shouldLinkRelatedPhaseDivisions = (
  phase: string,
  relatedPhase: string,
): boolean => {
  const isRegularPhase = isRegularDivisionPhase(phase);
  const isFinalPhase = isFinalDivisionPhase(phase);
  const isRelatedRegularPhase = isRegularDivisionPhase(relatedPhase);
  const isRelatedFinalPhase = isFinalDivisionPhase(relatedPhase);
  return (
    (isRegularPhase && isRelatedFinalPhase) ||
    (isFinalPhase && isRelatedRegularPhase)
  );
};

const collectRelatedPhaseDivisions = (
  sourceDivisionIds: string[],
  phase: string,
  phaseDivisionsBySource: Map<string, Division[]>,
  phaseDivision: Division,
): Map<string, Division> => {
  const relatedDivisions = new Map<string, Division>([
    [phaseDivision.id, phaseDivision],
  ]);
  const isKnownPhase =
    isRegularDivisionPhase(phase) || isFinalDivisionPhase(phase);
  if (!isKnownPhase) {
    return relatedDivisions;
  }
  for (const sourceDivisionId of sourceDivisionIds) {
    for (const relatedPhaseDivision of phaseDivisionsBySource.get(
      sourceDivisionId,
    ) ?? []) {
      const relatedPhase = String(
        relatedPhaseDivision.phase ?? "",
      ).toUpperCase();
      if (shouldLinkRelatedPhaseDivisions(phase, relatedPhase)) {
        relatedDivisions.set(
          relatedPhaseDivision.id,
          relatedPhaseDivision,
        );
      }
    }
  }
  return relatedDivisions;
};

const buildRelatedPhaseDivisions = (
  phaseSourceDivisionIdsByPhase: Map<string, string[]>,
  phaseDivisionsBySource: Map<string, Division[]>,
  divisionMap: Map<string, Division>,
): Map<string, Division[]> => {
  const relatedPhaseDivisionsByPhaseId = new Map<string, Division[]>();
  for (const [
    phaseDivisionId,
    sourceDivisionIds,
  ] of phaseSourceDivisionIdsByPhase.entries()) {
    const phaseDivision = divisionMap.get(phaseDivisionId);
    if (!phaseDivision) {
      throw new Error(
        `Unable to hydrate Phase Division scope because ${phaseDivisionId} is not present in the Event.`,
      );
    }
    const phase = String(phaseDivision.phase ?? "").toUpperCase();
    const relatedDivisions = collectRelatedPhaseDivisions(
      sourceDivisionIds,
      phase,
      phaseDivisionsBySource,
      phaseDivision,
    );
    relatedPhaseDivisionsByPhaseId.set(
      phaseDivisionId,
      Array.from(relatedDivisions.values()),
    );
  }
  return relatedPhaseDivisionsByPhaseId;
};

const expandTimeSlotDivisions = (
  timeSlots: TimeSlot[],
  relatedPhaseDivisionsByPhaseId: Map<string, Division[]>,
  phaseDivisionsBySource: Map<string, Division[]>,
): void => {
  for (const timeSlot of timeSlots) {
    const expandedDivisions = new Map(
      timeSlot.divisions.map((division) => [division.id, division]),
    );
    for (const division of timeSlot.divisions) {
      const divisionId = normalizeDivisionKey(division.id) ?? division.id;
      const sourcePhaseDivisions =
        relatedPhaseDivisionsByPhaseId.get(divisionId) ??
        phaseDivisionsBySource.get(divisionId) ??
        [];
      for (const phaseDivision of sourcePhaseDivisions) {
        expandedDivisions.set(phaseDivision.id, phaseDivision);
      }
    }
    timeSlot.divisions = Array.from(expandedDivisions.values());
  }
};

const loadRetainedMatchDivisionIds = async (
  client: PrismaLike,
  eventId: string,
  retainedMatchIds: string[],
): Promise<string[]> => {
  if (!retainedMatchIds.length) return [];
  const matches = client.matches;
  if (typeof matches?.findMany !== "function") return [];
  const rows: unknown = await matches.findMany({
    where: { eventId, id: { in: retainedMatchIds } },
    select: { division: true },
  });
  const divisionIds = (Array.isArray(rows) ? rows : [])
    .map((row: unknown) => {
      if (!row || typeof row !== "object" || !("division" in row)) {
        return "";
      }
      const division = row.division;
      return typeof division === "string" ? division.trim() : "";
    })
    .filter((divisionId): divisionId is string => divisionId.length > 0);
  return Array.from(new Set(divisionIds));
};

const loadEventDivisionState = async (
  client: PrismaLike,
  event: any,
  retainedMatchIds: string[] = [],
): Promise<EventDivisionHydrationState> => {
  const retainedDivisionIds = await loadRetainedMatchDivisionIds(
    client,
    event.id,
    retainedMatchIds,
  );
  const allDivisionRows = await client.divisions.findMany({
    where: {
      eventId: event.id,
      scope: "EVENT",
      ...(retainedDivisionIds.length
        ? {
            OR: [
              { status: "ACTIVE" },
              { id: { in: retainedDivisionIds } },
            ],
          }
        : { status: "ACTIVE" }),
    },
    orderBy: [
      { kind: "asc" },
      { sortOrder: "asc" },
      { createdAt: "asc" },
      { name: "asc" },
      { id: "asc" },
    ],
  });
  const orderedDivisionRows = [...allDivisionRows].sort(
    compareDivisionRowsByStoredOrder,
  );
  const { participantRows, sourceRows } = await loadEventPhaseRows(
    client,
    event.id,
  );
  const hydratedDivisionRows = hydrateEventDivisionRows(
    orderedDivisionRows,
    participantRows,
  );
  const { leagueDivisionRows, playoffDivisionRows } =
    selectEventDivisionRows(hydratedDivisionRows, event.eventType);
  const primarySportId = event.sportIds?.[0] ?? null;
  const {
    divisions,
    map: leagueDivisionMap,
    fieldIdsByDivision,
  } = buildDivisions(
    leagueDivisionRows.map((row: any) => row.id),
    leagueDivisionRows,
    primarySportId,
  );
  const {
    divisions: playoffDivisions,
    map: playoffDivisionMap,
    fieldIdsByDivision: playoffFieldIdsByDivision,
  } = buildDivisions(
    playoffDivisionRows.map((row: any) => row.id),
    playoffDivisionRows,
    primarySportId,
    {
      allowFallback: false,
      fallbackKind: "PLAYOFF",
      includeSourceAliases: false,
    },
  );
  const divisionMap = new Map<string, Division>();
  mergeDivisionMaps(divisionMap, leagueDivisionMap);
  mergeDivisionMaps(divisionMap, playoffDivisionMap);
  mergeDivisionFieldIds(fieldIdsByDivision, playoffFieldIdsByDivision);
  const phaseSourceDivisionIdsByPhase =
    collectPhaseSourceDivisionIds(sourceRows);
  projectPhaseDivisionFieldIds(
    hydratedDivisionRows,
    phaseSourceDivisionIdsByPhase,
    fieldIdsByDivision,
    event.fieldIds,
  );
  const allDivisions = [...divisions, ...playoffDivisions];
  const phaseDivisionsBySource = buildPhaseDivisionsBySource(
    hydratedDivisionRows,
    phaseSourceDivisionIdsByPhase,
    divisionMap,
  );
  const relatedPhaseDivisionsByPhaseId = buildRelatedPhaseDivisions(
    phaseSourceDivisionIdsByPhase,
    phaseDivisionsBySource,
    divisionMap,
  );
  return {
    hydratedDivisionRows,
    divisions,
    playoffDivisions,
    divisionMap,
    fieldIdsByDivision,
    allDivisions,
    phaseSourceDivisionIdsByPhase,
    phaseDivisionsBySource,
    relatedPhaseDivisionsByPhaseId,
  };
};

type EventLoadParticipantIds = {
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
};

type EventLoadParticipantAndMatchInputs = {
  participantIds: EventLoadParticipantIds;
  registeredTeamIds: string[];
  fieldIds: string[];
  teamIdsToLoad: string[];
  timeSlotIds: string[];
  matchRows: any[];
};

const collectMatchGraphTeamIds = (rows: any[]): string[] =>
  rows.flatMap((row) =>
    [row.team1Id, row.team2Id, row.teamOfficialId]
      .map((id) => normalizeEntityId(id))
      .filter((id): id is string => Boolean(id)),
  );

const loadEventParticipantAndMatchInputs = async (
  event: any,
  client: PrismaLike,
  includeTeamRegistrations: boolean,
  retainedMatchIds: string[] = [],
): Promise<EventLoadParticipantAndMatchInputs> => {
  const participantIds = includeTeamRegistrations
    ? await getEventParticipantIdsForEvent(event.id, client)
    : { teamIds: [], userIds: [], waitListIds: [], freeAgentIds: [] };
  const matchRows: MatchRow[] = await client.matches.findMany({
    where: { eventId: event.id },
  });
  const retainedMatchIdSet = new Set(retainedMatchIds);
  const retainedFieldIds = matchRows
    .filter((row) => retainedMatchIdSet.has(String(row.id ?? "")))
    .map((row) => normalizeEntityId(row.fieldId))
    .filter((id): id is string => Boolean(id));
  const fieldIds = Array.from(new Set([
    ...ensureStringArray(event.fieldIds),
    ...retainedFieldIds,
  ]));
  const teamIds = participantIds.teamIds.length
    ? participantIds.teamIds
    : ensureStringArray((event as any).teamIds);
  const graphTeamIds = collectMatchGraphTeamIds(matchRows as any[]);
  const teamIdsToLoad = Array.from(new Set([...teamIds, ...graphTeamIds]));
  const timeSlotIds = ensureStringArray(event.timeSlotIds);
  return {
    participantIds,
    fieldIds,
    registeredTeamIds: teamIds,
    teamIdsToLoad,
    timeSlotIds,
    matchRows,
  };
};

type EventLoadOfficialData = {
  eventOfficialRows: any[];
  sportRow: any;
  officialPositions: any[];
  eventOfficials: any[];
  officialIds: string[];
};

const loadEventSportRow = async (
  client: PrismaLike,
  primarySportId: string | null,
): Promise<any> => {
  const sportsDelegate = (client as any).sports;
  if (
    !primarySportId ||
    typeof sportsDelegate?.findUnique !== "function"
  ) {
    return null;
  }
  return sportsDelegate.findUnique({
    where: { id: primarySportId },
    select: {
      officialPositionTemplates: true,
      matchRulesTemplate: true,
    } as any,
  });
};

const resolveEventOfficialPositionsForLoad = (
  event: any,
  eventOfficialRows: any[],
  templatePositions: any[],
): any[] => {
  const explicitPositions = normalizeEventOfficialPositions(
    (event as any).officialPositions,
    event.id,
  );
  if (explicitPositions.length) {
    return explicitPositions;
  }
  if (templatePositions.length) {
    return templatePositions;
  }
  if (eventOfficialRows.length) {
    return buildEventOfficialPositionsFromTemplates(event.id, [
      { name: "Official", count: 1 },
    ]);
  }
  return [];
};

const normalizeEventOfficialsForLoad = (
  eventOfficialRows: any[],
  officialPositions: any[],
  fieldIds: string[],
): any[] => {
  const validPositionIdSet = new Set(
    officialPositions.map((position) => position.id),
  );
  const validFieldIdSet = new Set(fieldIds);
  if (!eventOfficialRows.length) {
    return [];
  }
  return eventOfficialRows
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      positionIds: ensureStringArray(row.positionIds).filter((positionId) =>
        validPositionIdSet.has(positionId),
      ),
      fieldIds: ensureStringArray(row.fieldIds).filter((fieldId) =>
        validFieldIdSet.has(fieldId),
      ),
      isActive: row.isActive !== false,
    }))
    .filter((row) => row.positionIds.length > 0);
};

const loadEventOfficialData = async (
  event: any,
  client: PrismaLike,
  primarySportId: string | null,
  fieldIds: string[],
): Promise<EventLoadOfficialData> => {
  const [eventOfficialRows, sportRow] = await Promise.all([
    loadEventOfficialRows(client, event.id),
    loadEventSportRow(client, primarySportId),
  ]);
  const templatePositions = buildEventOfficialPositionsFromTemplates(
    event.id,
    normalizeSportOfficialPositionTemplates(
      (sportRow as any)?.officialPositionTemplates,
    ),
  );
  const officialPositions = resolveEventOfficialPositionsForLoad(
    event,
    eventOfficialRows,
    templatePositions,
  );
  const eventOfficials = normalizeEventOfficialsForLoad(
    eventOfficialRows,
    officialPositions,
    fieldIds,
  );
  const officialIds = eventOfficials.map((official: any) => official.userId);
  return {
    eventOfficialRows,
    sportRow,
    officialPositions,
    eventOfficials,
    officialIds,
  };
};

type RelationRowWithId = {
  id?: unknown;
};

const orderRelationRowsByRequestedIds = <T extends RelationRowWithId>(
  rows: readonly T[],
  requestedIds: readonly string[],
): T[] => {
  const requestedIndexById = new Map<string, number>();
  for (const [index, requestedId] of requestedIds.entries()) {
    const normalizedId = normalizeEntityId(requestedId);
    if (normalizedId && !requestedIndexById.has(normalizedId)) {
      requestedIndexById.set(normalizedId, index);
    }
  }
  return [...rows].sort((left, right) => {
    const leftId = normalizeEntityId(left.id);
    const rightId = normalizeEntityId(right.id);
    const leftIndex = leftId
      ? requestedIndexById.get(leftId)
      : undefined;
    const rightIndex = rightId
      ? requestedIndexById.get(rightId)
      : undefined;
    if (leftIndex !== undefined || rightIndex !== undefined) {
      if (leftIndex === undefined) {
        return 1;
      }
      if (rightIndex === undefined) {
        return -1;
      }
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
    }
    return (leftId ?? "").localeCompare(rightId ?? "");
  });
};

type EventLoadPrimaryRelationRows = {
  fieldRows: any[];
  teamRows: any[];
  timeSlotRows: any[];
  officialRows: any[];
  leagueConfigRow: any;
  canonicalTeamIdsByOfficialId: Map<string, string[]>;
};

const loadEventPrimaryRelationRows = async (params: {
  event: any;
  client: PrismaLike;
  fieldIds: string[];
  teamIdsToLoad: string[];
  timeSlotIds: string[];
  officialIds: string[];
}): Promise<EventLoadPrimaryRelationRows> => {
  const {
    event,
    client,
    fieldIds,
    teamIdsToLoad,
    timeSlotIds,
    officialIds,
  } = params;
  const [
    fieldRows,
    teamRows,
    timeSlotRows,
    officialRows,
    leagueConfigRow,
    canonicalTeamIdsByOfficialId,
  ] = await Promise.all([
    fieldIds.length
      ? client.fields.findMany({ where: { id: { in: fieldIds } } })
      : Promise.resolve([]),
    teamIdsToLoad.length
      ? client.teams.findMany({ where: { id: { in: teamIdsToLoad } } })
      : Promise.resolve([]),
    loadTimeSlotRows(client, timeSlotIds),
    officialIds.length
      ? client.userData.findMany({ where: { id: { in: officialIds } } })
      : Promise.resolve([]),
    event.leagueScoringConfigId
      ? client.leagueScoringConfigs.findUnique({
          where: { id: event.leagueScoringConfigId },
        })
      : Promise.resolve(null),
    getCanonicalTeamIdsByUserIds(officialIds, client),
  ]);
  return {
    fieldRows: orderRelationRowsByRequestedIds(fieldRows, fieldIds),
    teamRows: orderRelationRowsByRequestedIds(teamRows, teamIdsToLoad),
    timeSlotRows: orderRelationRowsByRequestedIds(timeSlotRows, timeSlotIds),
    officialRows: orderRelationRowsByRequestedIds(officialRows, officialIds),
    leagueConfigRow,
    canonicalTeamIdsByOfficialId,
  };
};

const collectTeamPlayerIds = (
  teamRows: any[],
  includeTeamPlayers: boolean,
): string[] => {
  if (!includeTeamPlayers) {
    return [];
  }
  return Array.from(
    new Set(
      teamRows.flatMap((row) => ensureStringArray(row.playerIds)),
    ),
  );
};

type EventLoadPlayerRegistration = {
  id: string;
  teamId?: string | null;
  userId: string;
  status: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean;
};
type EventLoadSecondaryRelationRows = {
  teamPlayerRows: any[];
  eventRegistrationRows: any[];
  eventTeamStaffRows: any[];
};

const loadEventTeamPlayerRows = async (params: {
  client: PrismaLike;
  teamPlayerIds: string[];
  includeTeamPlayers: boolean;
}): Promise<any[]> => {
  if (!params.includeTeamPlayers || !params.teamPlayerIds.length) {
    return [];
  }
  return params.client.userData.findMany({
    where: { id: { in: params.teamPlayerIds } },
  });
};

const loadEventRegistrationRows = async (params: {
  event: any;
  client: PrismaLike;
  includeTeamRegistrations: boolean;
  teamIdsToLoad: string[];
}): Promise<any[]> => {
  const registrationsDelegate = (params.client as any).eventRegistrations;
  if (
    !params.includeTeamRegistrations ||
    !params.teamIdsToLoad.length ||
    typeof registrationsDelegate?.findMany !== "function"
  ) {
    return [];
  }
  return registrationsDelegate.findMany({
    where: {
      eventId: params.event.id,
      eventTeamId: { in: params.teamIdsToLoad },
      rosterRole: "PARTICIPANT",
      status: { in: ["ACTIVE", "PENDING", "STARTED"] },
    },
    select: {
      id: true,
      eventTeamId: true,
      registrantId: true,
      status: true,
      jerseyNumber: true,
      position: true,
      isCaptain: true,
    },
  });
};

const loadEventTeamStaffRows = async (params: {
  client: PrismaLike;
  teamIdsToLoad: string[];
}): Promise<any[]> => {
  const staffDelegate = (params.client as any).eventTeamStaffAssignments;
  if (
    !params.teamIdsToLoad.length ||
    typeof staffDelegate?.findMany !== "function"
  ) {
    return [];
  }
  return staffDelegate.findMany({
    where: {
      eventTeamId: { in: params.teamIdsToLoad },
      status: "ACTIVE",
    },
    select: {
      eventTeamId: true,
      userId: true,
    },
  });
};

const loadEventSecondaryRelationRows = async (params: {
  event: any;
  client: PrismaLike;
  teamPlayerIds: string[];
  includeTeamPlayers: boolean;
  includeTeamRegistrations: boolean;
  teamIdsToLoad: string[];
}): Promise<EventLoadSecondaryRelationRows> => {
  const [teamPlayerRows, eventRegistrationRows, eventTeamStaffRows] =
    await Promise.all([
      loadEventTeamPlayerRows(params),
      loadEventRegistrationRows(params),
      loadEventTeamStaffRows(params),
    ]);
  return { teamPlayerRows, eventRegistrationRows, eventTeamStaffRows };
};

const buildTeamPlayerLookup = (
  rows: any[],
  allDivisions: Division[],
): Map<string, UserData> => {
  const lookup = new Map<string, UserData>();
  for (const row of rows) {
    const normalizedId = normalizeEntityId(row?.id);
    if (!normalizedId) continue;
    lookup.set(
      normalizedId,
      new UserData({
        id: normalizedId,
        firstName: row?.firstName ?? "",
        lastName: row?.lastName ?? "",
        userName: row?.userName ?? "",
        divisions: allDivisions,
      }),
    );
  }
  return lookup;
};

const buildEventPlayerRegistration = (
  row: any,
): EventLoadPlayerRegistration | null => {
  const eventTeamId = normalizeEntityId(
    readTeamRowValue(row, "eventTeamId", null),
  );
  const userId = normalizeEntityId(
    readTeamRowValue(row, "registrantId", null),
  );
  const registrationId = normalizeEntityId(
    readTeamRowValue(row, "id", null),
  );
  if (!eventTeamId || !userId || !registrationId) {
    return null;
  }
  return {
    id: registrationId,
    teamId: eventTeamId,
    userId,
    status: String(readTeamRowValue(row, "status", "ACTIVE")),
    jerseyNumber: readTeamRowValue(row, "jerseyNumber", null),
    position: readTeamRowValue(row, "position", null),
    isCaptain: Boolean(readTeamRowValue(row, "isCaptain", false)),
  };
};

const buildPlayerRegistrationsByTeamId = (
  rows: any[],
): Map<string, EventLoadPlayerRegistration[]> => {
  const registrations = new Map<string, EventLoadPlayerRegistration[]>();
  for (const row of rows) {
    const registration = buildEventPlayerRegistration(row);
    if (!registration || !registration.teamId) continue;
    const list = registrations.get(registration.teamId) ?? [];
    list.push(registration);
    registrations.set(registration.teamId, list);
  }
  return registrations;
};

const resolveHydratedMatchDetailIds = (
  matchRows: any[],
  requestedIds: unknown,
): { matchIds: string[]; matchDetailIdsToLoad: string[]; detailIdSet: Set<string> | null } => {
  const matchIds = matchRows
    .map((row) => normalizeEntityId(row.id))
    .filter((id): id is string => Boolean(id));
  const detailIdSet = Array.isArray(requestedIds)
    ? new Set(
        requestedIds
          .map((value) => normalizeEntityId(value))
          .filter((value): value is string => Boolean(value)),
      )
    : null;
  const matchDetailIdsToLoad = detailIdSet
    ? matchIds.filter((id) => detailIdSet.has(id))
    : matchIds;
  return { matchIds, matchDetailIdsToLoad, detailIdSet };
};

const indexRowsByMatchId = (rows: any[]): Map<string, any[]> => {
  const rowsByMatchId = new Map<string, any[]>();
  for (const row of rows) {
    const rowMatchId = normalizeEntityId(row.matchId);
    if (!rowMatchId) continue;
    const list = rowsByMatchId.get(rowMatchId) ?? [];
    list.push(row);
    rowsByMatchId.set(rowMatchId, list);
  }
  return rowsByMatchId;
};

type EventLoadMatchDetailRows = {
  segmentRowsByMatchId: Map<string, any[]>;
  incidentRowsByMatchId: Map<string, any[]>;
  hydratedMatchDetailIdSet: Set<string> | null;
};

const loadEventMatchDetailRows = async (params: {
  client: PrismaLike;
  matchRows: any[];
  requestedIds: unknown;
}): Promise<EventLoadMatchDetailRows> => {
  const { matchDetailIdsToLoad, detailIdSet } = resolveHydratedMatchDetailIds(
    params.matchRows,
    params.requestedIds,
  );
  const [segmentRows, incidentRows] = await Promise.all([
    matchDetailIdsToLoad.length &&
    typeof (params.client as any).matchSegments?.findMany === "function"
      ? (params.client as any).matchSegments.findMany({
          where: { matchId: { in: matchDetailIdsToLoad } },
        })
      : Promise.resolve([]),
    matchDetailIdsToLoad.length &&
    typeof (params.client as any).matchIncidents?.findMany === "function"
      ? (params.client as any).matchIncidents.findMany({
          where: { matchId: { in: matchDetailIdsToLoad } },
        })
      : Promise.resolve([]),
  ]);
  return {
    segmentRowsByMatchId: indexRowsByMatchId(segmentRows as any[]),
    incidentRowsByMatchId: indexRowsByMatchId(incidentRows as any[]),
    hydratedMatchDetailIdSet: detailIdSet,
  };
};

type EventLoadRelationRows = EventLoadPrimaryRelationRows &
  EventLoadSecondaryRelationRows & {
    teamPlayerLookup: Map<string, UserData>;
    playerRegistrationsByTeamId: Map<
      string,
      EventLoadPlayerRegistration[]
    >;
    segmentRowsByMatchId: Map<string, any[]>;
    incidentRowsByMatchId: Map<string, any[]>;
    hydratedMatchDetailIdSet: Set<string> | null;
  };

const loadEventRelationRows = async (params: {
  event: any;
  client: PrismaLike;
  fieldIds: string[];
  teamIdsToLoad: string[];
  timeSlotIds: string[];
  officialIds: string[];
  includeTeamPlayers: boolean;
  includeTeamRegistrations: boolean;
  allDivisions: Division[];
  matchRows: any[];
  requestedMatchDetailIds: unknown;
}): Promise<EventLoadRelationRows> => {
  const primaryRows = await loadEventPrimaryRelationRows(params);
  const teamPlayerIds = collectTeamPlayerIds(
    primaryRows.teamRows,
    params.includeTeamPlayers,
  );
  const secondaryRows = await loadEventSecondaryRelationRows({
    event: params.event,
    client: params.client,
    teamPlayerIds,
    includeTeamPlayers: params.includeTeamPlayers,
    includeTeamRegistrations: params.includeTeamRegistrations,
    teamIdsToLoad: params.teamIdsToLoad,
  });
  const teamPlayerLookup = buildTeamPlayerLookup(
    secondaryRows.teamPlayerRows as any[],
    params.allDivisions,
  );
  const playerRegistrationsByTeamId = buildPlayerRegistrationsByTeamId(
    secondaryRows.eventRegistrationRows as any[],
  );
  const detailRows = await loadEventMatchDetailRows({
    client: params.client,
    matchRows: params.matchRows,
    requestedIds: params.requestedMatchDetailIds,
  });
  return {
    ...primaryRows,
    ...secondaryRows,
    teamPlayerLookup,
    playerRegistrationsByTeamId,
    ...detailRows,
  };
};

const buildRawFieldDivisionIdsByFieldId = (
  rows: any[],
): Map<string, string[]> => {
  const divisionIdsByFieldId = new Map<string, string[]>();
  for (const row of rows) {
    const divisionId = normalizeDivisionKey(row.id);
    if (!divisionId) {
      continue;
    }
    for (const fieldId of ensureStringArray(row.fieldIds)) {
      const scopedDivisionIds = divisionIdsByFieldId.get(fieldId) ?? [];
      if (!scopedDivisionIds.includes(divisionId)) {
        scopedDivisionIds.push(divisionId);
      }
      divisionIdsByFieldId.set(fieldId, scopedDivisionIds);
    }
  }
  return divisionIdsByFieldId;
};

const resolveTeamAssignmentDivisions = (
  divisions: Division[],
  event: any,
): Division[] => {
  if (!Boolean(event.singleDivision)) {
    return divisions;
  }
  const poolDivisions = divisions.filter(
    (division) => division.phase === "POOL",
  );
  return poolDivisions.length > 1 ? poolDivisions : [];
};

const buildDivisionByTeamId = (
  divisions: Division[],
  teamIdsToLoad: string[],
  event: any,
): Map<string, Division> => {
  const teamRosterSet = new Set(teamIdsToLoad);
  const divisionByTeamId = new Map<string, Division>();
  const teamAssignmentDivisions = resolveTeamAssignmentDivisions(
    divisions,
    event,
  );
  for (const division of teamAssignmentDivisions) {
    for (const divisionTeamId of division.teamIds) {
      if (!teamRosterSet.has(divisionTeamId)) {
        continue;
      }
      if (!divisionByTeamId.has(divisionTeamId)) {
        divisionByTeamId.set(divisionTeamId, division);
      }
    }
  }
  return divisionByTeamId;
};
type EventFieldTeamRelations = {
  fields: Record<string, PlayingField>;
  teams: Record<string, Team>;
  timeSlots: TimeSlot[];
};
const buildEventFieldTeamRelations = (params: {
  event: any;
  hydratedDivisionRows: any[];
  fieldRows: any[];
  teamRows: any[];
  timeSlotRows: any[];
  divisionMap: Map<string, Division>;
  fieldIdsByDivision: Map<string, string[]>;
  allDivisions: Division[];
  assignmentDivisions: Division[];
  teamIdsToLoad: string[];
  fallbackDivision: Division;
  teamPlayerLookup: Map<string, UserData>;
  playerRegistrationsByTeamId: Map<string, EventLoadPlayerRegistration[]>;
  relatedPhaseDivisionsByPhaseId: Map<string, Division[]>;
  phaseDivisionsBySource: Map<string, Division[]>;
}): EventFieldTeamRelations => {
  const fallbackFieldDivisionIds = params.allDivisions.length
    ? params.allDivisions.map((division) => division.id)
    : [DEFAULT_DIVISION_KEY];
  const rawFieldDivisionIdsByFieldId = buildRawFieldDivisionIdsByFieldId(
    params.hydratedDivisionRows,
  );
  const fields = buildFields(
    params.fieldRows,
    params.divisionMap,
    fallbackFieldDivisionIds,
    params.fieldIdsByDivision,
    rawFieldDivisionIdsByFieldId,
  );
  const divisionByTeamId = buildDivisionByTeamId(
    params.assignmentDivisions,
    params.teamIdsToLoad,
    params.event,
  );
  const teams = buildTeams(
    params.teamRows,
    params.divisionMap,
    params.fallbackDivision,
    divisionByTeamId,
    params.teamPlayerLookup,
    params.playerRegistrationsByTeamId,
  );
  const timeSlots = buildTimeSlots(
    params.timeSlotRows,
    params.divisionMap,
    params.allDivisions,
  );
  expandTimeSlotDivisions(
    timeSlots,
    params.relatedPhaseDivisionsByPhaseId,
    params.phaseDivisionsBySource,
  );
  return { fields, teams, timeSlots };
};


type LoadedEventTimeline = {
  eventStart: Date;
  eventEnd: Date;
  normalizedParentEvent: string | null;
  isWeeklyChild: boolean;
  noFixedEndDateTime: boolean;
};

const resolveLoadedEventTimeline = (event: any): LoadedEventTimeline => {
  const eventStart =
    event.start instanceof Date ? event.start : new Date(event.start);
  const eventEnd =
    event.end instanceof Date
      ? event.end
      : event.end
        ? new Date(event.end)
        : eventStart;
  const normalizedParentEvent = normalizeEntityId(event.parentEvent);
  const isWeeklyChild =
    String(event.eventType ?? "").toUpperCase() === "WEEKLY_EVENT" &&
    Boolean(normalizedParentEvent);
  const noFixedEndDateTime =
    typeof event.noFixedEndDateTime === "boolean"
      ? event.noFixedEndDateTime
      : false;
  return {
    eventStart,
    eventEnd,
    normalizedParentEvent,
    isWeeklyChild,
    noFixedEndDateTime,
  };
};

const attachLoadedEventSchedulingConflicts = async (params: {
  event: any;
  client: PrismaLike;
  fields: Record<string, PlayingField>;
  timeline: LoadedEventTimeline;
}): Promise<void> => {
  if (params.timeline.isWeeklyChild) {
    return;
  }
  const conflictWindowEnd = resolveFieldConflictWindowEnd({
    start: params.timeline.eventStart,
    end: params.timeline.eventEnd,
    noFixedEndDateTime: params.timeline.noFixedEndDateTime,
  });
  await attachFieldSchedulingConflicts({
    client: params.client,
    eventId: params.event.id,
    fields: params.fields,
    windowStart: params.timeline.eventStart,
    windowEnd: conflictWindowEnd,
  });
};

const resolveLoadedCoordinates = (event: any): number[] | null =>
  Array.isArray(event.coordinates)
    ? event.coordinates.filter(
        (value: unknown): value is number => typeof value === "number",
      )
    : null;

const resolveLoadedFieldCount = (
  fields: Record<string, PlayingField>,
  event: any,
): number | null => {
  const resolvedFieldEntries = Object.keys(fields).length;
  if (resolvedFieldEntries > 0) {
    return resolvedFieldEntries;
  }
  const linkedFieldCount = ensureStringArray(event.fieldIds).length;
  return linkedFieldCount > 0 ? linkedFieldCount : null;
};

const readLoadedEventValue = <T>(
  event: any,
  key: string,
  fallback: T,
): T => {
  const value = event[key];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const resolveLoadedList = (
  loadedIds: string[],
  event: any,
  key: string,
): string[] =>
  loadedIds.length
    ? loadedIds
    : ensureStringArray(event[key]);

const resolveLoadedMaxParticipants = (event: any): number =>
  event.eventType === "TOURNAMENT"
    ? normalizeBracketTeamCount(event.maxParticipants)
    : readLoadedEventValue(event, "maxParticipants", 0);

const resolveLoadedSchedulerPlayoffTeamCount = (event: any): number => {
  if (!Boolean(event.includePlayoffs)) {
    return readLoadedEventValue(event, "playoffTeamCount", 0);
  }
  if (event.eventType === "LEAGUE" || event.eventType === "TOURNAMENT") {
    return normalizeBracketTeamCount(event.playoffTeamCount);
  }
  return readLoadedEventValue(event, "playoffTeamCount", 0);
};

const resolveLoadedTeamOfficialsMaySwap = (
  event: any,
  doTeamsOfficiate: boolean,
): boolean => {
  if (!doTeamsOfficiate) {
    return false;
  }
  return typeof event.teamOfficialsMaySwap === "boolean"
    ? Boolean(event.teamOfficialsMaySwap)
    : false;
};

const resolveLoadedTeamCheckInMode = (
  event: any,
): ReturnType<typeof normalizeTeamCheckInMode> | "OFF" =>
  Boolean(event.teamSignup)
    ? normalizeTeamCheckInMode(event.teamCheckInMode)
    : "OFF";

const resolveLoadedDoTeamsOfficiate = (
  event: any,
  legacyOfficialSchedulingMode: ReturnType<
    typeof normalizeOfficialSchedulingMode
  >,
): boolean =>
  typeof event.doTeamsOfficiate === "boolean"
    ? event.doTeamsOfficiate
    : legacyOfficialSchedulingMode === "TEAM_STAFFING";

const buildLoadedEventBaseParams = (params: {
  event: any;
  participantIds: EventLoadParticipantIds;
  timeline: LoadedEventTimeline;
  coordinates: number[] | null;
  resolvedFieldCount: number | null;
  resolvedMatchRules: any;
  staffingPriority: any;
  doTeamsOfficiate: boolean;
  schedulerPlayoffTeamCount: number;
  officialPositions: any[];
  eventOfficials: any[];
  leagueConfigRow: any;
  registeredTeamIds: string[];
  teams: Record<string, Team>;
  divisions: Division[];
  officials: UserData[];
  fields: Record<string, PlayingField>;
  timeSlots: TimeSlot[];
  playoffDivisions: Division[];
}): ConstructorParameters<typeof Tournament>[0] & { address: string | null } => {
  const {
    event,
    timeline,
    coordinates,
    resolvedFieldCount,
    resolvedMatchRules,
    staffingPriority,
    doTeamsOfficiate,
    schedulerPlayoffTeamCount,
    officialPositions,
    eventOfficials,
    leagueConfigRow,
    registeredTeamIds,
    teams,
    divisions,
    officials,
    fields,
    timeSlots,
    playoffDivisions,
  } = params;
  const teamOfficialsMaySwap = resolveLoadedTeamOfficialsMaySwap(
    event,
    doTeamsOfficiate,
  );
  const allowMatchRosterEdits =
    Boolean(event.teamSignup) &&
    Boolean(event.allowMatchRosterEdits);
  const allowTemporaryMatchPlayers =
    allowMatchRosterEdits &&
    Boolean(event.allowTemporaryMatchPlayers);
  return {
    id: event.id,
    start: timeline.eventStart,
    end: timeline.eventEnd,
    createdAt: readLoadedEventValue(event, "createdAt", null),
    updatedAt: readLoadedEventValue(event, "updatedAt", null),
    name: event.name,
    description: readLoadedEventValue(event, "description", ""),
    waitListIds: resolveLoadedList(
      params.participantIds.waitListIds,
      event,
      "waitListIds",
    ),
    freeAgentIds: resolveLoadedList(
      params.participantIds.freeAgentIds,
      event,
      "freeAgentIds",
    ),
    maxParticipants: resolveLoadedMaxParticipants(event),
    teamSignup: Boolean(event.teamSignup),
    coordinates,
    organizationId: readLoadedEventValue(event, "organizationId", null),
    requiredTemplateIds: ensureStringArray(event.requiredTemplateIds),
    location: readLoadedEventValue(event, "location", ""),
    address: readLoadedEventValue<string | null>(event, "address", null),
    price: readLoadedEventValue(event, "price", null),
    registrationPaymentMode: readLoadedEventValue(
      event,
      "registrationPaymentMode",
      "ONLINE",
    ),
    manualPaymentLinks: Array.isArray(event.manualPaymentLinks)
      ? event.manualPaymentLinks
      : [],
    manualPaymentInstructions: readLoadedEventValue(
      event,
      "manualPaymentInstructions",
      null,
    ),
    taxHandling: readLoadedEventValue(event, "taxHandling", "INHERIT_ORG"),
    organizerManualTaxRateBps: readLoadedEventValue(
      event,
      "organizerManualTaxRateBps",
      0,
    ),
    allowPaymentPlans: Boolean(event.allowPaymentPlans),
    installmentCount: readLoadedEventValue(event, "installmentCount", 0),
    installmentDueDates: ensureArray(event.installmentDueDates)
      .map((value) => coerceDate(value))
      .filter(Boolean) as Date[],
    installmentDueRelativeDays: normalizeInstallmentRelativeDayList(
      event.installmentDueRelativeDays,
    ),
    installmentAmounts: ensureNumberArray(event.installmentAmounts),
    allowTeamSplitDefault: Boolean(event.allowTeamSplitDefault),
    sportIds: ensureStringArray(event.sportIds),
    teamSizeLimit: readLoadedEventValue(event, "teamSizeLimit", null),
    singleDivision: Boolean(event.singleDivision),
    seedColor: readLoadedEventValue(event, "seedColor", null),
    cancellationRefundHours: readLoadedEventValue(
      event,
      "cancellationRefundHours",
      null,
    ),
    registrationCutoffHours: readLoadedEventValue(
      event,
      "registrationCutoffHours",
      null,
    ),
    rating: readLoadedEventValue(event, "rating", null),
    minAge: readLoadedEventValue(event, "minAge", null),
    maxAge: readLoadedEventValue(event, "maxAge", null),
    doTeamsOfficiate,
    teamOfficialsMaySwap,
    teamCheckInMode: resolveLoadedTeamCheckInMode(event),
    teamCheckInOpenMinutesBefore: normalizeOpenMinutesBefore(
      event.teamCheckInOpenMinutesBefore,
    ),
    allowMatchRosterEdits,
    allowTemporaryMatchPlayers,
    staffingPriority,
    officialPositions,
    eventOfficials,
    matchRulesOverride: readLoadedEventValue(
      event,
      "matchRulesOverride",
      null,
    ),
    autoCreatePointMatchIncidents: Boolean(
      event.autoCreatePointMatchIncidents,
    ),
    resolvedMatchRules,
    fieldCount: resolvedFieldCount,
    prize: readLoadedEventValue(event, "prize", null),
    hostId: readLoadedEventValue(event, "hostId", ""),
    assistantHostIds: ensureStringArray(event.assistantHostIds),
    noFixedEndDateTime: timeline.noFixedEndDateTime,
    imageId: readLoadedEventValue(event, "imageId", ""),
    loserBracketPointsToVictory: ensureNumberArray(
      event.loserBracketPointsToVictory,
    ),
    winnerBracketPointsToVictory: ensureNumberArray(
      event.winnerBracketPointsToVictory,
    ),
    restTimeMinutes: readLoadedEventValue(event, "restTimeMinutes", 0),
    state: readLoadedEventValue(event, "state", "UNPUBLISHED"),
    leagueScoringConfig: leagueConfigRow,
    registeredTeamIds,
    teams,
    players: [],
    divisions,
    officials,
    eventType: readLoadedEventValue(event, "eventType", "EVENT"),
    fields,
    doubleElimination: Boolean(event.doubleElimination),
    matches: {},
    winnerSetCount: readLoadedEventValue(event, "winnerSetCount", null),
    loserSetCount: readLoadedEventValue(event, "loserSetCount", null),
    matchDurationMinutes: readLoadedEventValue(
      event,
      "matchDurationMinutes",
      0,
    ),
    usesSets: Boolean(event.usesSets),
    setDurationMinutes: readLoadedEventValue(
      event,
      "setDurationMinutes",
      0,
    ),
    gamesPerOpponent: readLoadedEventValue(event, "gamesPerOpponent", 1),
    includePlayoffs: Boolean(event.includePlayoffs),
    playoffTeamCount: schedulerPlayoffTeamCount,
    setsPerMatch: readLoadedEventValue(event, "setsPerMatch", 0),
    pointsToVictory: ensureNumberArray(event.pointsToVictory),
    timeSlots,
    splitLeaguePlayoffDivisions: Boolean(
      event.splitLeaguePlayoffDivisions,
    ),
    playoffDivisions,
  };
};

type LoadedEventModel = {
  constructed: League | Tournament;
  normalizedParentEvent: string | null;
  resolvedMatchRules: any;
};

const buildLoadedEventModel = (params: {
  event: any;
  sportRow: any;
  officialPositions: any[];
  eventOfficials: any[];
  leagueConfigRow: any;
  participantIds: EventLoadParticipantIds;
  registeredTeamIds: string[];
  teams: Record<string, Team>;
  divisions: Division[];
  playoffDivisions: Division[];
  officials: UserData[];
  fields: Record<string, PlayingField>;
  timeSlots: TimeSlot[];
}): LoadedEventModel => {
  const timeline = resolveLoadedEventTimeline(params.event);
  const resolvedFieldCount = resolveLoadedFieldCount(
    params.fields,
    params.event,
  );
  const resolvedMatchRules = resolveMatchRules({
    sportTemplate: params.sportRow?.matchRulesTemplate,
    eventOverride: params.event.matchRulesOverride,
    autoCreatePointMatchIncidents:
      params.event.autoCreatePointMatchIncidents,
    usesSets: params.event.usesSets,
    setsPerMatch: params.event.setsPerMatch,
    winnerSetCount: params.event.winnerSetCount,
    matchDurationMinutes: params.event.matchDurationMinutes,
    officialPositions: params.officialPositions,
  });
  const legacyOfficialSchedulingMode = normalizeOfficialSchedulingMode(
    params.event.officialSchedulingMode,
  );
  const staffingPriority = normalizeStaffingPriority(
    params.event.staffingPriority,
    legacyOfficialSchedulingMode,
  );
  const doTeamsOfficiate = resolveLoadedDoTeamsOfficiate(
    params.event,
    legacyOfficialSchedulingMode,
  );
  const schedulerPlayoffTeamCount =
    resolveLoadedSchedulerPlayoffTeamCount(params.event);
  const baseParams = buildLoadedEventBaseParams({
    event: params.event,
    timeline,
    coordinates: resolveLoadedCoordinates(params.event),
    resolvedFieldCount,
    resolvedMatchRules,
    staffingPriority,
    doTeamsOfficiate,
    schedulerPlayoffTeamCount,
    officialPositions: params.officialPositions,
    eventOfficials: params.eventOfficials,
    leagueConfigRow: params.leagueConfigRow,
    participantIds: params.participantIds,
    registeredTeamIds: params.registeredTeamIds,
    teams: params.teams,
    divisions: params.divisions,
    officials: params.officials,
    fields: params.fields,
    timeSlots: params.timeSlots,
    playoffDivisions: params.playoffDivisions,
  });
  const constructed =
    params.event.eventType === "LEAGUE"
      ? new League({
          ...baseParams,
          gamesPerOpponent: readLoadedEventValue(
            params.event,
            "gamesPerOpponent",
            1,
          ),
          includePlayoffs: Boolean(params.event.includePlayoffs),
          playoffTeamCount: schedulerPlayoffTeamCount,
          setsPerMatch: readLoadedEventValue(
            params.event,
            "setsPerMatch",
            0,
          ),
          pointsToVictory: ensureNumberArray(params.event.pointsToVictory),
        })
      : new Tournament(baseParams);
  return {
    constructed,
    normalizedParentEvent: timeline.normalizedParentEvent,
    resolvedMatchRules,
  };
};

const isLoadedEntryDivisionRow = (row: any): boolean =>
  String(row?.role ?? "")
      .trim()
      .toUpperCase() !== "PHASE" &&
  normalizeDivisionKind(row?.kind, "LEAGUE") !== "PLAYOFF";

const isLoadedExplicitPlayoffRow = (row: any): boolean =>
  normalizeDivisionKind(row?.kind, "LEAGUE") === "PLAYOFF" &&
  row?.isSystemGenerated !== true;

const finalizeLoadedEvent = (params: {
  constructed: League | Tournament;
  matchRows: any[];
  teams: Record<string, Team>;
  fields: Record<string, PlayingField>;
  allDivisions: Division[];
  officials: UserData[];
  segmentRowsByMatchId: Map<string, any[]>;
  incidentRowsByMatchId: Map<string, any[]>;
  resolvedMatchRules: any;
  hydratedMatchDetailIdSet: Set<string> | null;
  normalizedParentEvent: string | null;
  hydratedDivisionRows: any[];
}): League | Tournament => {
  const matches = buildMatches(
    params.matchRows,
    params.constructed,
    params.teams,
    params.fields,
    params.allDivisions,
    params.officials,
    params.segmentRowsByMatchId,
    params.incidentRowsByMatchId,
    params.resolvedMatchRules,
    {
      segmentMatchIds: params.hydratedMatchDetailIdSet,
      incidentMatchIds: params.hydratedMatchDetailIdSet,
    },
  );
  params.constructed.matches = matches;
  (params.constructed as any).parentEvent = params.normalizedParentEvent;
  const entryDivisionRows = params.hydratedDivisionRows.filter(
    isLoadedEntryDivisionRow,
  );
  const explicitPlayoffRows = params.hydratedDivisionRows.filter(
    isLoadedExplicitPlayoffRow,
  );
  (params.constructed as any).divisionDetails =
    serializeDivisionDetailsForTemplate(entryDivisionRows);
  (params.constructed as any).playoffDivisionDetails =
    serializeDivisionDetailsForTemplate(explicitPlayoffRows);
  return params.constructed;
};

const buildLoadedOfficials = (
  officialIds: string[],
  officialRows: any[],
  allDivisions: Division[],
  eventOfficialTeamIds: Map<string, Set<string>>,
): UserData[] => {
  const officialRowsById = new Map<string, any>(
    officialRows.map((row) => [String(row.id), row]),
  );
  const orderedOfficialRows = officialIds
    .map((officialId) => officialRowsById.get(officialId))
    .filter((row): row is any => row !== undefined);
  return buildOfficials(
    orderedOfficialRows,
    allDivisions,
    eventOfficialTeamIds,
  );
};

export const loadEventWithRelations = async (
  eventId: string,
  client: PrismaLike = prisma,
  options: LoadEventWithRelationsOptions = {},
): Promise<League | Tournament> => {
  const event = await client.events.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new Error("Event not found");
  }
  const includeTeamPlayers = options.includeTeamPlayers !== false;
  const includeTeamRegistrations = options.includeTeamRegistrations !== false;
  const retainedMatchIds =
    options.retainedMatchIds
      ?.map((matchId) => normalizeEntityId(matchId))
      .filter((matchId): matchId is string => Boolean(matchId)) ?? [];

  const {
    hydratedDivisionRows,
    divisions,
    playoffDivisions,
    divisionMap,
    fieldIdsByDivision,
    allDivisions,
    phaseSourceDivisionIdsByPhase,
    phaseDivisionsBySource,
    relatedPhaseDivisionsByPhaseId,
  } = await loadEventDivisionState(client, event, retainedMatchIds);
  const primarySportId = event.sportIds?.[0] ?? null;
  const fallbackDivision =
    divisions[0] ??
    new Division(
      DEFAULT_DIVISION_KEY,
      buildDivisionDisplayName(DEFAULT_DIVISION_KEY, primarySportId),
    );

  const {
    participantIds,
    registeredTeamIds,
    fieldIds,
    teamIdsToLoad,
    timeSlotIds,
    matchRows,
  } = await loadEventParticipantAndMatchInputs(
    event,
    client,
    includeTeamRegistrations,
    retainedMatchIds,
  );
  const {
    sportRow,
    officialPositions,
    eventOfficials,
    officialIds,
  } = await loadEventOfficialData(
    event,
    client,
    primarySportId,
    fieldIds,
  );
  const {
    fieldRows,
    teamRows,
    timeSlotRows,
    officialRows,
    leagueConfigRow,
    canonicalTeamIdsByOfficialId,
    eventRegistrationRows,
    eventTeamStaffRows,
    teamPlayerLookup,
    playerRegistrationsByTeamId,
    segmentRowsByMatchId,
    incidentRowsByMatchId,
    hydratedMatchDetailIdSet,
  } = await loadEventRelationRows({
    event,
    client,
    fieldIds,
    teamIdsToLoad,
    timeSlotIds,
    officialIds,
    includeTeamPlayers,
    includeTeamRegistrations,
    allDivisions,
    matchRows,
    requestedMatchDetailIds: options.hydratedMatchDetailIds,
  });

  const { fields, teams, timeSlots } = buildEventFieldTeamRelations({
    event,
    hydratedDivisionRows,
    fieldRows,
    teamRows,
    timeSlotRows,
    divisionMap,
    fieldIdsByDivision,
    allDivisions,
    assignmentDivisions: divisions,
    teamIdsToLoad,
    fallbackDivision,
    teamPlayerLookup,
    playerRegistrationsByTeamId,
    relatedPhaseDivisionsByPhaseId,
    phaseDivisionsBySource,
  });
  const officialEventTeamIds = buildOfficialEventTeamIds({
    officialIds,
    canonicalTeamIdsByUserId: canonicalTeamIdsByOfficialId,
    eventTeamRows: teamRows,
    eventParticipantRows: eventRegistrationRows,
    eventTeamStaffRows,
  });
  const officials = buildLoadedOfficials(
    officialIds,
    officialRows,
    allDivisions,
    officialEventTeamIds,
  );
  attachTimeSlotsToFields(fields, timeSlots);
  const timeline = resolveLoadedEventTimeline(event);
  await attachLoadedEventSchedulingConflicts({
    event,
    client,
    fields,
    timeline,
  });

  const {
    constructed,
    normalizedParentEvent,
    resolvedMatchRules,
  } = buildLoadedEventModel({
    event,
    sportRow,
    officialPositions,
    eventOfficials,
    leagueConfigRow,
    participantIds,
    registeredTeamIds,
    teams,
    divisions,
    playoffDivisions,
    officials,
    fields,
    timeSlots,
  });
  return finalizeLoadedEvent({
    constructed,
    matchRows,
    teams,
    fields,
    allDivisions,
    officials,
    segmentRowsByMatchId,
    incidentRowsByMatchId,
    resolvedMatchRules,
    hydratedMatchDetailIdSet,
    normalizedParentEvent,
    hydratedDivisionRows,
  });
};

export const loadEventForMatchMutation = async (
  eventId: string,
  matchId: string,
  client: PrismaLike = prisma,
): Promise<League | Tournament> =>
  loadEventWithRelations(eventId, client, {
    hydratedMatchDetailIds: [matchId],
    includeTeamPlayers: false,
    includeTeamRegistrations: true,
  });

type SavedMatchPlacement = {
  placementState: "PLACED" | "UNPLACED";
  isPlaced: boolean;
  isBracketMatch: boolean;
};

const resolveSavedMatchPlacement = (
  match: MatchPersistenceInput,
): SavedMatchPlacement => {
  const placementState =
    match.placementState === "PLACED" || match.field ? "PLACED" : "UNPLACED";
  return {
    placementState,
    isPlaced: placementState === "PLACED",
    isBracketMatch: Boolean(
      match.previousLeftMatch ||
        match.previousRightMatch ||
        match.winnerNextMatch ||
        match.loserNextMatch,
    ),
  };
};

const resolveSavedMatchPhase = (
  match: MatchPersistenceInput,
  isBracketMatch: boolean,
): string =>
  match.division?.phase ??
  resolveDivisionCompetitionPhase({
    divisionKind: match.division?.kind,
    hasBracketLinks: isBracketMatch,
  });

const resolveSavedMatchOfficialPositions = (
  match: MatchPersistenceInput,
  matchPhase: string,
  persistedOfficialPositions: EventOfficialPosition[] | null,
): EventOfficialPosition[] | null =>
  match.division?.phaseSettings?.[matchPhase]?.officialPositions ??
  persistedOfficialPositions;

const resolveSavedRawOfficialAssignments = (
  match: MatchPersistenceInput,
  isPlaced: boolean,
): unknown[] =>
  isPlaced && Array.isArray(match.officialAssignments)
    ? match.officialAssignments
    : [];

const resolveSavedLegacyOfficialAssignments = (params: {
  eventId: string;
  match: MatchPersistenceInput;
  isPlaced: boolean;
  rawOfficialAssignments: unknown[];
  officialPositionsForMatch: EventOfficialPosition[] | null;
}): unknown[] => {
  if (
    params.rawOfficialAssignments.length > 0 ||
    !params.officialPositionsForMatch
  ) {
    return params.rawOfficialAssignments;
  }
  return buildLegacyOfficialAssignment({
    eventId: params.eventId,
    officialId: params.isPlaced ? (params.match.official?.id ?? null) : null,
    officialCheckedIn:
      params.isPlaced && params.match.officialCheckedIn === true,
    officialPositions: params.officialPositionsForMatch,
  });
};

const completeSavedOfficialAssignments = (
  assignments: unknown[],
  officialPositionsForMatch: EventOfficialPosition[] | null,
): MatchOfficialAssignment[] => {
  if (!officialPositionsForMatch) {
    return assignments as MatchOfficialAssignment[];
  }
  return completeMatchOfficialAssignmentSlots(
    assignments as MatchOfficialAssignment[],
    officialPositionsForMatch,
  );
};

const resolveSavedOfficialIdentity = (params: {
  match: MatchPersistenceInput;
  isPlaced: boolean;
  officialAssignments: MatchOfficialAssignment[];
}): {
  primaryOfficialId: string | null;
  primaryOfficialCheckedIn: boolean;
} => {
  const primaryOfficialId = params.officialAssignments.length
    ? deriveLegacyOfficialIdFromAssignments(params.officialAssignments)
    : params.isPlaced
      ? (params.match.official?.id ?? null)
      : null;
  const primaryOfficialCheckedIn = params.officialAssignments.length
    ? deriveLegacyOfficialCheckedInFromAssignments(params.officialAssignments)
    : params.isPlaced
      ? (params.match.officialCheckedIn ?? false)
      : false;
  return { primaryOfficialId, primaryOfficialCheckedIn };
};

const resolveSavedMatchOfficialData = (params: {
  eventId: string;
  match: MatchPersistenceInput;
  isPlaced: boolean;
  isBracketMatch: boolean;
  persistedOfficialPositions: EventOfficialPosition[] | null;
}): {
  officialAssignments: MatchOfficialAssignment[];
  primaryOfficialId: string | null;
  primaryOfficialCheckedIn: boolean;
} => {
  const matchPhase = resolveSavedMatchPhase(
    params.match,
    params.isBracketMatch,
  );
  const officialPositionsForMatch = resolveSavedMatchOfficialPositions(
    params.match,
    matchPhase,
    params.persistedOfficialPositions,
  );
  const rawOfficialAssignments = resolveSavedRawOfficialAssignments(
    params.match,
    params.isPlaced,
  );
  const legacyOfficialAssignments = resolveSavedLegacyOfficialAssignments({
    eventId: params.eventId,
    match: params.match,
    isPlaced: params.isPlaced,
    rawOfficialAssignments,
    officialPositionsForMatch,
  });
  const officialAssignments = completeSavedOfficialAssignments(
    legacyOfficialAssignments,
    officialPositionsForMatch,
  );
  return {
    officialAssignments,
    ...resolveSavedOfficialIdentity({
      match: params.match,
      isPlaced: params.isPlaced,
      officialAssignments,
    }),
  };
};

const readSavedMatchValue = <T>(
  match: any,
  key: string,
  fallback: T,
): T => {
  const value = match[key];
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as T;
};

const resolveSavedRelationId = (
  relation: { id?: string | null } | null | undefined,
): string | null => relation?.id ?? null;

const resolveSavedPlacedRelationId = (
  isPlaced: boolean,
  relation: { id?: string | null } | null | undefined,
): string | null => (isPlaced ? resolveSavedRelationId(relation) : null);

const resolveSavedBracketSeed = (
  isBracketMatch: boolean,
  seed: unknown,
): number | null =>
  isBracketMatch && typeof seed === "number" ? seed : null;

const resolveSavedMatchRulesSnapshot = (
  match: MatchPersistenceInput,
): Record<string, unknown> | null => {
  const matchRulesSnapshot =
    match.matchRulesSnapshot ?? match.resolvedMatchRules;
  return matchRulesSnapshot
    ? (matchRulesSnapshot as Record<string, unknown>)
    : null;
};

const buildSavedMatchData = (params: {
  eventId: string;
  index: number;
  now: Date;
  match: MatchPersistenceInput;
  placement: SavedMatchPlacement;
  officialData: {
    officialAssignments: MatchOfficialAssignment[];
    primaryOfficialId: string | null;
    primaryOfficialCheckedIn: boolean;
  };
}): Record<string, unknown> => {
  const { eventId, index, now, match, placement, officialData } = params;
  const { isPlaced, isBracketMatch, placementState } = placement;
  const persistedOfficialIds = officialData.officialAssignments.length
    ? (officialData.officialAssignments as unknown as Record<string, unknown>[])
    : null;
  return {
    id: match.id,
    matchId: readSavedMatchValue(match, "matchId", index + 1),
    start: isPlaced ? match.start : null,
    end: isPlaced ? match.end : null,
    locked: Boolean(match.locked),
    placementState,
    team1Seed: resolveSavedBracketSeed(isBracketMatch, match.team1Seed),
    team2Seed: resolveSavedBracketSeed(isBracketMatch, match.team2Seed),
    division: resolveSavedRelationId(match.division),
    team1Points: readSavedMatchValue(match, "team1Points", []),
    team2Points: readSavedMatchValue(match, "team2Points", []),
    status: readSavedMatchValue(match, "status", null),
    resultStatus: readSavedMatchValue(match, "resultStatus", null),
    resultType: readSavedMatchValue(match, "resultType", null),
    actualStart: readSavedMatchValue(match, "actualStart", null),
    actualEnd: readSavedMatchValue(match, "actualEnd", null),
    statusReason: readSavedMatchValue(match, "statusReason", null),
    winnerEventTeamId: readSavedMatchValue(match, "winnerEventTeamId", null),
    matchRulesSnapshot: resolveSavedMatchRulesSnapshot(match),
    side: readSavedMatchValue(match, "side", null),
    losersBracket: Boolean(match.losersBracket),
    winnerNextMatchId: resolveSavedRelationId(match.winnerNextMatch),
    loserNextMatchId: resolveSavedRelationId(match.loserNextMatch),
    previousLeftId: resolveSavedRelationId(match.previousLeftMatch),
    previousRightId: resolveSavedRelationId(match.previousRightMatch),
    officialCheckedIn: officialData.primaryOfficialCheckedIn,
    officialId: officialData.primaryOfficialId,
    officialIds: persistedOfficialIds,
    teamOfficialId: resolveSavedPlacedRelationId(
      isPlaced,
      match.teamOfficial,
    ),
    team1Id: resolveSavedRelationId(match.team1),
    team2Id: resolveSavedRelationId(match.team2),
    eventId,
    fieldId: resolveSavedPlacedRelationId(isPlaced, match.field),
    updatedAt: now,
  };
};

const toSavedDetailDate = (value: unknown): Date | null =>
  value ? new Date(value as string | number | Date) : null;

const canPersistMatchSegments = (
  client: PrismaLike,
  match: MatchPersistenceInput,
): boolean => {
  if (!shouldPersistHydratedMatchSegments(match)) {
    return false;
  }
  if (!Array.isArray(match.segments)) {
    return false;
  }
  const segmentsDelegate = (client as any).matchSegments;
  return (
    typeof segmentsDelegate?.upsert === "function" ||
    (typeof segmentsDelegate?.deleteMany === "function" &&
      typeof segmentsDelegate?.createMany === "function")
  );
};

const canPersistMatchIncidents = (
  client: PrismaLike,
  match: MatchPersistenceInput,
): boolean => {
  if (!shouldPersistHydratedMatchIncidents(match)) {
    return false;
  }
  if (!Array.isArray(match.incidents)) {
    return false;
  }
  const incidentsDelegate = (client as any).matchIncidents;
  return (
    typeof incidentsDelegate?.upsert === "function" ||
    (typeof incidentsDelegate?.deleteMany === "function" &&
      typeof incidentsDelegate?.createMany === "function")
  );
};

const appendSavedMatchSegments = (
  eventId: string,
  match: MatchPersistenceInput,
  now: Date,
  segmentRows: Array<Record<string, unknown>>,
): void => {
  for (const segment of match.segments ?? []) {
    const segmentId =
      segment.id || `${match.id}_segment_${segment.sequence}`;
    segmentRows.push({
      id: segmentId,
      createdAt: now,
      updatedAt: now,
      eventId,
      matchId: match.id,
      sequence: segment.sequence,
      status: segment.status ?? "NOT_STARTED",
      scores: segment.scores ?? {},
      winnerEventTeamId: segment.winnerEventTeamId ?? null,
      startedAt: toSavedDetailDate(segment.startedAt),
      endedAt: toSavedDetailDate(segment.endedAt),
      resultType: segment.resultType ?? null,
      statusReason: segment.statusReason ?? null,
      metadata: segment.metadata ?? null,
    });
  }
};

const buildSavedMatchIncidentRow = (
  eventId: string,
  match: MatchPersistenceInput,
  now: Date,
  incident: any,
): Record<string, unknown> => ({
  id: incident.id || `${match.id}_incident_${incident.sequence}`,
  createdAt: now,
  updatedAt: now,
  eventId,
  matchId: match.id,
  segmentId: readSavedMatchValue(incident, "segmentId", null),
  eventTeamId: readSavedMatchValue(incident, "eventTeamId", null),
  eventRegistrationId: readSavedMatchValue(
    incident,
    "eventRegistrationId",
    null,
  ),
  participantUserId: readSavedMatchValue(incident, "participantUserId", null),
  officialUserId: readSavedMatchValue(incident, "officialUserId", null),
  incidentType: incident.incidentType,
  sequence: incident.sequence,
  minute: readSavedMatchValue(incident, "minute", null),
  clock: readSavedMatchValue(incident, "clock", null),
  clockSeconds: readSavedMatchValue(incident, "clockSeconds", null),
  linkedPointDelta: readSavedMatchValue(incident, "linkedPointDelta", null),
  note: readSavedMatchValue(incident, "note", null),
  metadata: readSavedMatchValue(incident, "metadata", null),
});

const appendSavedMatchIncidents = (
  eventId: string,
  match: MatchPersistenceInput,
  now: Date,
  incidentRows: Array<Record<string, unknown>>,
): void => {
  for (const incident of match.incidents ?? []) {
    incidentRows.push(
      buildSavedMatchIncidentRow(eventId, match, now, incident),
    );
  }
};

const persistOneMatch = async (params: {
  eventId: string;
  index: number;
  match: MatchPersistenceInput;
  client: PrismaLike;
  now: Date;
  persistedOfficialPositions: EventOfficialPosition[] | null;
  segmentMatchIds: Set<string>;
  incidentMatchIds: Set<string>;
  segmentRows: Array<Record<string, unknown>>;
  incidentRows: Array<Record<string, unknown>>;
}): Promise<void> => {
  const placement = resolveSavedMatchPlacement(params.match);
  const officialData = resolveSavedMatchOfficialData({
    eventId: params.eventId,
    match: params.match,
    isPlaced: placement.isPlaced,
    isBracketMatch: placement.isBracketMatch,
    persistedOfficialPositions: params.persistedOfficialPositions,
  });
  const data = buildSavedMatchData({
    eventId: params.eventId,
    index: params.index,
    now: params.now,
    match: params.match,
    placement,
    officialData,
  });
  const { id, ...updateData } = data;
  await params.client.matches.upsert({
    where: { id },
    create: { ...data, createdAt: params.now },
    update: updateData,
  });
  if (canPersistMatchSegments(params.client, params.match)) {
    params.segmentMatchIds.add(params.match.id);
    appendSavedMatchSegments(
      params.eventId,
      params.match,
      params.now,
      params.segmentRows,
    );
  }
  if (canPersistMatchIncidents(params.client, params.match)) {
    params.incidentMatchIds.add(params.match.id);
    appendSavedMatchIncidents(
      params.eventId,
      params.match,
      params.now,
      params.incidentRows,
    );
  }
};

const persistSavedMatchSegmentsWithReplacement = async (params: {
  client: PrismaLike;
  segmentMatchIds: Set<string>;
  segmentRows: Array<Record<string, unknown>>;
}): Promise<boolean> => {
  const matchSegments = (params.client as any).matchSegments;
  if (
    params.segmentMatchIds.size === 0 ||
    typeof matchSegments?.deleteMany !== "function" ||
    typeof matchSegments?.createMany !== "function"
  ) {
    return false;
  }
  await matchSegments.deleteMany({
    where: { matchId: { in: Array.from(params.segmentMatchIds) } },
  });
  if (params.segmentRows.length > 0) {
    await matchSegments.createMany({ data: params.segmentRows });
  }
  return true;
};

const persistSavedMatchSegmentsWithUpsert = async (
  client: PrismaLike,
  segmentRows: Array<Record<string, unknown>>,
): Promise<void> => {
  const matchSegments = (client as any).matchSegments;
  if (typeof matchSegments?.upsert !== "function") {
    return;
  }
  for (const segmentRow of segmentRows) {
    await matchSegments.upsert({
      where: {
        matchId_sequence: {
          matchId: String(segmentRow.matchId),
          sequence: Number(segmentRow.sequence),
        },
      },
      create: { ...segmentRow },
      update: {
        ...segmentRow,
        createdAt: undefined,
      },
    });
  }
};

const persistSavedMatchSegments = async (params: {
  client: PrismaLike;
  segmentMatchIds: Set<string>;
  segmentRows: Array<Record<string, unknown>>;
}): Promise<void> => {
  const replaced = await persistSavedMatchSegmentsWithReplacement(params);
  if (!replaced) {
    await persistSavedMatchSegmentsWithUpsert(
      params.client,
      params.segmentRows,
    );
  }
};

const persistSavedMatchIncidentsWithReplacement = async (params: {
  client: PrismaLike;
  incidentMatchIds: Set<string>;
  incidentRows: Array<Record<string, unknown>>;
}): Promise<boolean> => {
  const matchIncidents = (params.client as any).matchIncidents;
  if (
    params.incidentMatchIds.size === 0 ||
    typeof matchIncidents?.deleteMany !== "function" ||
    typeof matchIncidents?.createMany !== "function"
  ) {
    return false;
  }
  await matchIncidents.deleteMany({
    where: { matchId: { in: Array.from(params.incidentMatchIds) } },
  });
  if (params.incidentRows.length > 0) {
    await matchIncidents.createMany({ data: params.incidentRows });
  }
  return true;
};

const persistSavedMatchIncidentsWithUpsert = async (
  client: PrismaLike,
  incidentRows: Array<Record<string, unknown>>,
): Promise<void> => {
  const matchIncidents = (client as any).matchIncidents;
  if (typeof matchIncidents?.upsert !== "function") {
    return;
  }
  for (const incidentRow of incidentRows) {
    await matchIncidents.upsert({
      where: { id: String(incidentRow.id) },
      create: { ...incidentRow },
      update: {
        ...incidentRow,
        createdAt: undefined,
      },
    });
  }
};

const persistSavedMatchIncidents = async (params: {
  client: PrismaLike;
  incidentMatchIds: Set<string>;
  incidentRows: Array<Record<string, unknown>>;
}): Promise<void> => {
  const replaced = await persistSavedMatchIncidentsWithReplacement(params);
  if (!replaced) {
    await persistSavedMatchIncidentsWithUpsert(
      params.client,
      params.incidentRows,
    );
  }
};

const loadPersistedOfficialPositionsForMatches = async (
  client: PrismaLike,
  eventId: string,
): Promise<EventOfficialPosition[] | null> => {
  let persistedOfficialPositions: EventOfficialPosition[] | null = null;
  if (typeof client.events?.findUnique === "function") {
    const persistedEvent = await client.events.findUnique({
      where: { id: eventId },
      select: { officialPositions: true },
    });
    if (persistedEvent) {
      persistedOfficialPositions = normalizeEventOfficialPositions(
        persistedEvent.officialPositions,
        eventId,
      );
    }
  }
  return persistedOfficialPositions;
};

export const saveMatches = async (
  eventId: string,
  matches: MatchPersistenceInput[],
  client: PrismaLike = prisma,
): Promise<void> => {
  const now = new Date();
  const segmentMatchIds = new Set<string>();
  const incidentMatchIds = new Set<string>();
  const segmentRows: Array<Record<string, unknown>> = [];
  const incidentRows: Array<Record<string, unknown>> = [];
  const persistedOfficialPositions =
    await loadPersistedOfficialPositionsForMatches(client, eventId);
  for (const [index, match] of matches.entries()) {
    await persistOneMatch({
      eventId,
      index,
      match,
      client,
      now,
      persistedOfficialPositions,
      segmentMatchIds,
      incidentMatchIds,
      segmentRows,
      incidentRows,
    });
  }
  await persistSavedMatchSegments({
    client,
    segmentMatchIds,
    segmentRows,
  });
  await persistSavedMatchIncidents({
    client,
    incidentMatchIds,
    incidentRows,
  });
};

const collectPlaceholderRosterTeamIds = (
  scheduled: ScheduledRosterInput,
  rosterTeamIds: string[],
): string[] =>
  rosterTeamIds.filter((teamId) => {
    const team = scheduled.teams?.[teamId];
    const captainId = String(team?.captainId ?? "").trim();
    const playerIds = ensureStringArray(team?.playerIds);
    return !captainId && playerIds.length === 0;
  });

const loadScheduledPhaseSourceRows = async (
  client: PrismaLike,
  eventId: string,
  phaseDivisionIds: string[],
): Promise<any[]> =>
  typeof (client as any).eventDivisionPhaseSources?.findMany === "function"
    ? await (client as any).eventDivisionPhaseSources.findMany({
        where: {
          eventId,
          phaseDivisionId: { in: phaseDivisionIds },
        },
        select: { phaseDivisionId: true, entryDivisionId: true },
      })
    : [];

const addScheduledPhaseSourceRows = (
  sourceDivisionIdByPhase: Map<string, string>,
  rows: any[],
  preferExisting: boolean,
): void => {
  for (const row of rows) {
    const phaseDivisionId = normalizeDivisionKey(row.id ?? row.phaseDivisionId);
    const entryDivisionId = normalizeDivisionKey(
      row.sourceDivisionId ?? row.entryDivisionId,
    );
    if (
      phaseDivisionId &&
      entryDivisionId &&
      (!preferExisting || !sourceDivisionIdByPhase.has(phaseDivisionId))
    ) {
      sourceDivisionIdByPhase.set(phaseDivisionId, entryDivisionId);
    }
  }
};

const loadScheduledPhaseSourceDivisionMap = async (
  client: PrismaLike,
  eventId: string,
  phaseDivisionIds: string[],
): Promise<Map<string, string>> => {
  const sourceDivisionIdByPhase = new Map<string, string>();
  const phaseSourceRows = await loadScheduledPhaseSourceRows(
    client,
    eventId,
    phaseDivisionIds,
  );
  addScheduledPhaseSourceRows(
    sourceDivisionIdByPhase,
    phaseSourceRows,
    false,
  );
  if (
    phaseDivisionIds.length &&
    typeof client.divisions?.findMany === "function"
  ) {
    const phaseRows = await client.divisions.findMany({
      where: {
        eventId,
        role: "PHASE",
        status: "ACTIVE",
        id: { in: phaseDivisionIds },
      },
      select: { id: true, sourceDivisionId: true },
    });
    addScheduledPhaseSourceRows(sourceDivisionIdByPhase, phaseRows, true);
  }
  return sourceDivisionIdByPhase;
};

const collectScheduledLeagueDivisionIds = (params: {
  scheduledDivisions: PhaseDivisionCandidate[];
  phaseDivisionIds: string[];
  sourceDivisionIdByPhase: Map<string, string>;
}): string[] => {
  const ids: string[] = [];
  for (const division of params.scheduledDivisions) {
    const normalizedDivisionId = normalizeDivisionKey(division.id);
    if (!normalizedDivisionId) continue;
    const isPhaseDivision = params.phaseDivisionIds.includes(division.id);
    const ownerDivisionId = isPhaseDivision
      ? (params.sourceDivisionIdByPhase.get(normalizedDivisionId) ??
        division.id)
      : division.id;
    if (!ids.includes(ownerDivisionId)) ids.push(ownerDivisionId);
  }
  return ids;
};

const addScheduledDivisionAliases = (
  aliasesById: Map<string, string>,
  divisionId: string,
  ownerDivisionId: string,
): void => {
  const aliases = [
    normalizeDivisionKey(divisionId),
    normalizeDivisionKey(extractDivisionTokenFromId(divisionId)),
    normalizeDivisionKey(ownerDivisionId),
    normalizeDivisionKey(extractDivisionTokenFromId(ownerDivisionId)),
  ].filter((alias): alias is string => Boolean(alias));
  for (const alias of aliases) {
    if (!aliasesById.has(alias)) {
      aliasesById.set(alias, ownerDivisionId);
    }
  }
};

type ScheduledRosterDivisionContext = {
  scheduledDivisions: PhaseDivisionCandidate[];
  phaseDivisions: PhaseDivisionCandidate[];
  phaseDivisionIds: string[];
  scheduledDivisionAliasToId: Map<string, string>;
  scheduledLeagueDivisionIds: string[];
  fallbackDivisionId: string;
  resolveTeamDivisionId: (
    team: ScheduledRosterTeamInput | undefined,
  ) => string;
};

const buildScheduledRosterDivisionContext = async (params: {
  client: PrismaLike;
  eventId: string;
  scheduled: ScheduledRosterInput;
}): Promise<ScheduledRosterDivisionContext> => {
  const scheduledDivisions = collectScheduledDivisions(params.scheduled);
  const phaseDivisions = collectPhaseDivisions(params.scheduled);
  const scheduledDivisionIds = scheduledDivisions
    .map((division) => division.id)
    .filter((divisionId) => normalizeDivisionKey(divisionId));
  const phaseDivisionIds = phaseDivisions
    .map((division) => division.id)
    .filter((divisionId) => scheduledDivisionIds.includes(divisionId));
  const sourceDivisionIdByPhase = await loadScheduledPhaseSourceDivisionMap(
    params.client,
    params.eventId,
    phaseDivisionIds,
  );
  const scheduledLeagueDivisionIds = collectScheduledLeagueDivisionIds({
    scheduledDivisions,
    phaseDivisionIds,
    sourceDivisionIdByPhase,
  });
  const scheduledDivisionAliasToId = new Map<string, string>();
  for (const divisionId of scheduledLeagueDivisionIds) {
    addScheduledDivisionAliases(
      scheduledDivisionAliasToId,
      divisionId,
      divisionId,
    );
  }
  for (const division of scheduledDivisions) {
    const divisionId = normalizeDivisionKey(division.id);
    if (!divisionId) continue;
    const ownerDivisionId = phaseDivisionIds.includes(division.id)
      ? (sourceDivisionIdByPhase.get(divisionId) ?? divisionId)
      : divisionId;
    addScheduledDivisionAliases(
      scheduledDivisionAliasToId,
      divisionId,
      ownerDivisionId,
    );
  }
  const fallbackDivisionId =
    scheduledLeagueDivisionIds[0] ?? DEFAULT_DIVISION_KEY;
  const resolveTeamDivisionId = (
    team: ScheduledRosterTeamInput | undefined,
  ): string => {
    const explicitDivisionId = normalizeDivisionKey(team?.division?.id);
    if (explicitDivisionId) {
      const mappedFromId = scheduledDivisionAliasToId.get(explicitDivisionId);
      if (mappedFromId) return mappedFromId;
      const token = normalizeDivisionKey(
        extractDivisionTokenFromId(team?.division?.id),
      );
      if (token) {
        const mappedFromToken = scheduledDivisionAliasToId.get(token);
        if (mappedFromToken) return mappedFromToken;
      }
    }
    return fallbackDivisionId;
  };
  return {
    scheduledDivisions,
    phaseDivisions,
    phaseDivisionIds,
    scheduledDivisionAliasToId,
    scheduledLeagueDivisionIds,
    fallbackDivisionId,
    resolveTeamDivisionId,
  };
};

const removeOmittedScheduledPlaceholderTeams = async (params: {
  client: PrismaLike;
  eventId: string;
  rosterTeamIds: string[];
  shouldRemove: boolean;
}): Promise<void> => {
  if (
    !params.shouldRemove ||
    typeof (params.client as any).teams?.deleteMany !== "function"
  ) {
    return;
  }
  await (params.client as any).teams.deleteMany({
    where: {
      eventId: params.eventId,
      ...(params.rosterTeamIds.length
        ? { id: { notIn: params.rosterTeamIds } }
        : {}),
      kind: "PLACEHOLDER",
    } as any,
  });
};

const clearScheduledPhaseAssignmentsForEmptyRoster = async (params: {
  client: PhasePersistenceClient;
  eventId: string;
  phaseDivisions: PhaseDivisionCandidate[];
}): Promise<void> => {
  if (!params.phaseDivisions.length) return;
  await persistPhaseParticipantAssignments({
    client: params.client,
    eventId: params.eventId,
    teamIdsByPhaseDivision: Object.fromEntries(
      params.phaseDivisions.map((division) => [division.id, []]),
    ),
  });
};


const loadScheduledRosterEventAndTeams = async (params: {
  client: PrismaLike;
  eventId: string;
  rosterTeamIds: string[];
}): Promise<{
  teamSizeLimit: number | null;
  singleDivision: boolean;
  existingTeamById: Map<string, any>;
}> => {
  const event = await params.client.events.findUnique({
    where: { id: params.eventId },
    select: {
      teamSizeLimit: true,
      singleDivision: true,
    },
  });
  const teamSizeLimit =
    typeof event?.teamSizeLimit === "number" &&
    Number.isFinite(event.teamSizeLimit)
      ? Math.max(0, Math.trunc(event.teamSizeLimit))
      : null;
  const existingTeams = await params.client.teams.findMany({
    where: { id: { in: params.rosterTeamIds } },
    select: {
      id: true,
      division: true,
    },
  });
  return {
    teamSizeLimit,
    singleDivision: Boolean(event?.singleDivision),
    existingTeamById: new Map(
      existingTeams.map((team: any) => [team.id, team]),
    ),
  };
};

const buildScheduledRosterTeamCreateData = (params: {
  eventId: string;
  teamId: string;
  scheduledTeam: ScheduledRosterTeamInput;
  playerIds: string[];
  captainId: string;
  divisionId: string;
  teamSize: number;
  now: Date;
}): Record<string, unknown> => ({
  id: params.teamId,
  createdAt: params.now,
  updatedAt: params.now,
  eventId: params.eventId,
  kind: params.captainId ? "REGISTERED" : "PLACEHOLDER",
  playerIds: params.playerIds,
  playerRegistrationIds: [],
  division: params.divisionId,
  divisionTypeId: null,
  name: params.scheduledTeam.name ?? "",
  captainId: params.captainId,
  managerId: params.captainId || "",
  headCoachId: null,
  coachIds: [],
  staffAssignmentIds: [],
  parentTeamId: null,
  pending: [],
  teamSize: params.teamSize,
  profileImageId: null,
  sport: null,
});

const persistScheduledRosterTeamRows = async (params: {
  client: PrismaLike;
  eventId: string;
  scheduled: ScheduledRosterInput;
  rosterTeamIds: string[];
  existingTeamById: Map<string, any>;
  eventTeamSizeLimit: number | null;
  isTournamentPoolPlaySchedule: boolean;
  resolveTeamDivisionId: (
    team: ScheduledRosterTeamInput | undefined,
  ) => string;
  now: Date;
}): Promise<void> => {
  for (const teamId of params.rosterTeamIds) {
    const scheduledTeam = params.scheduled.teams[teamId];
    if (!scheduledTeam) continue;
    const existingTeam = params.existingTeamById.get(teamId);
    const captainId = String(scheduledTeam.captainId ?? "");
    const playerIds = ensureStringArray(scheduledTeam.playerIds);
    const divisionId = params.resolveTeamDivisionId(scheduledTeam);
    const teamSize = params.eventTeamSizeLimit ?? playerIds.length;
    if (!existingTeam) {
      await params.client.teams.create({
        data: buildScheduledRosterTeamCreateData({
          eventId: params.eventId,
          teamId,
          scheduledTeam,
          playerIds,
          captainId,
          divisionId,
          teamSize,
          now: params.now,
        }),
      });
      continue;
    }
    const existingDivision = normalizeDivisionKey(existingTeam.division);
    const nextDivision = normalizeDivisionKey(divisionId);
    if (
      !params.isTournamentPoolPlaySchedule &&
      existingDivision !== nextDivision
    ) {
      await params.client.teams.update({
        where: { id: teamId },
        data: {
          division: divisionId,
          updatedAt: params.now,
        },
      });
    }
  }
};

const groupScheduledTeamIdsByDivision = (params: {
  scheduled: ScheduledRosterInput;
  rosterTeamIds: string[];
  resolveTeamDivisionId: (
    team: ScheduledRosterTeamInput | undefined,
  ) => string;
}): Map<string, string[]> => {
  const assignedTeamIdsByDivisionId = new Map<string, string[]>();
  for (const teamId of params.rosterTeamIds) {
    const divisionId = params.resolveTeamDivisionId(
      params.scheduled.teams[teamId],
    );
    const bucket = assignedTeamIdsByDivisionId.get(divisionId) ?? [];
    bucket.push(teamId);
    assignedTeamIdsByDivisionId.set(divisionId, bucket);
  }
  return assignedTeamIdsByDivisionId;
};

const resolveScheduledEntryDivisionId = (params: {
  row: any;
  scheduledDivisionAliasToId: Map<string, string>;
  fallbackDivisionId: string;
}): string => {
  const aliases = [
    normalizeDivisionKey(params.row.id),
    normalizeDivisionKey(params.row.key),
    normalizeDivisionKey(extractDivisionTokenFromId(params.row.id)),
  ].filter((alias): alias is string => Boolean(alias));
  return (
    aliases
      .map((alias) => params.scheduledDivisionAliasToId.get(alias))
      .find((value): value is string => Boolean(value)) ??
    params.fallbackDivisionId
  );
};

const syncScheduledLeagueDivisionTeams = async (params: {
  client: PrismaLike;
  eventId: string;
  scheduled: ScheduledRosterInput;
  rosterTeamIds: string[];
  singleDivision: boolean;
  now: Date;
  scheduledDivisionAliasToId: Map<string, string>;
  fallbackDivisionId: string;
  resolveTeamDivisionId: (
    team: ScheduledRosterTeamInput | undefined,
  ) => string;
}): Promise<void> => {
  const isLeagueSchedule =
    String(params.scheduled.eventType ?? "").toUpperCase() === "LEAGUE";
  if (!isLeagueSchedule || params.singleDivision) return;
  const assignedTeamIdsByDivisionId = groupScheduledTeamIdsByDivision(params);
  const divisionRows = await params.client.divisions.findMany({
    where: { eventId: params.eventId, role: "ENTRY", status: "ACTIVE" },
    select: {
      id: true,
      key: true,
      kind: true,
    },
  });
  for (const row of divisionRows) {
    if (normalizeDivisionKind(row.kind, "LEAGUE") === "PLAYOFF") continue;
    const mappedDivisionId = resolveScheduledEntryDivisionId({
      row,
      scheduledDivisionAliasToId: params.scheduledDivisionAliasToId,
      fallbackDivisionId: params.fallbackDivisionId,
    });
    await params.client.divisions.update({
      where: { id: row.id },
      data: {
        teamIds: assignedTeamIdsByDivisionId.get(mappedDivisionId) ?? [],
        updatedAt: params.now,
      },
    });
  }
};

export const persistScheduledRosterTeams = async (
  params: {
    eventId: string;
    scheduled: ScheduledRosterInput;
    removeOmittedPlaceholderTeams?: boolean;
  },
  client: PrismaLike = prisma,
): Promise<string[]> => {
  const rosterTeamIds = Object.keys(params.scheduled.teams ?? {});
  const placeholderRosterTeamIds = collectPlaceholderRosterTeamIds(
    params.scheduled,
    rosterTeamIds,
  );
  const now = new Date();
  const phasePersistenceClient = client as unknown as PhasePersistenceClient;
  const shouldRemoveOmittedPlaceholderTeams =
    params.removeOmittedPlaceholderTeams !== false;
  const divisionContext = await buildScheduledRosterDivisionContext({
    client,
    eventId: params.eventId,
    scheduled: params.scheduled,
  });

  await client.events.update({
    where: { id: params.eventId },
    data: {
      updatedAt: now,
    },
  });
  await syncEventParticipantRegistrationsFromCompatibilityIds(client, {
    eventId: params.eventId,
    createdBy: params.scheduled.hostId ?? "system",
    teamIds: rosterTeamIds,
    userIds: [],
    waitListIds: [],
    freeAgentIds: [],
    syncTeams: true,
    syncUsers: false,
    syncWaitList: false,
    syncFreeAgents: false,
    divisionIdByRegistrantId: Object.fromEntries(
      rosterTeamIds.map((teamId) => [
        teamId,
        divisionContext.resolveTeamDivisionId(
          params.scheduled.teams?.[teamId],
        ),
      ]),
    ),
    placeholderTeamIds: placeholderRosterTeamIds,
  });
  await removeOmittedScheduledPlaceholderTeams({
    client,
    eventId: params.eventId,
    rosterTeamIds,
    shouldRemove: shouldRemoveOmittedPlaceholderTeams,
  });

  if (!rosterTeamIds.length) {
    await clearScheduledPhaseAssignmentsForEmptyRoster({
      client: phasePersistenceClient,
      eventId: params.eventId,
      phaseDivisions: divisionContext.phaseDivisions,
    });
    return rosterTeamIds;
  }

  const rosterState = await loadScheduledRosterEventAndTeams({
    client,
    eventId: params.eventId,
    rosterTeamIds,
  });
  await persistScheduledRosterTeamRows({
    client,
    eventId: params.eventId,
    scheduled: params.scheduled,
    rosterTeamIds,
    existingTeamById: rosterState.existingTeamById,
    eventTeamSizeLimit: rosterState.teamSizeLimit,
    isTournamentPoolPlaySchedule: isTournamentPoolPlayEnabled(
      params.scheduled,
    ),
    resolveTeamDivisionId: divisionContext.resolveTeamDivisionId,
    now,
  });
  await syncScheduledLeagueDivisionTeams({
    client,
    eventId: params.eventId,
    scheduled: params.scheduled,
    rosterTeamIds,
    singleDivision: rosterState.singleDivision,
    now,
    scheduledDivisionAliasToId:
      divisionContext.scheduledDivisionAliasToId,
    fallbackDivisionId: divisionContext.fallbackDivisionId,
    resolveTeamDivisionId: divisionContext.resolveTeamDivisionId,
  });
  if (divisionContext.phaseDivisions.length) {
    const teamIdsByPhaseDivision = collectPhaseTeamIdsByDivision(
      params.scheduled,
      params.scheduled.teams,
    );
    await persistPhaseParticipantAssignments({
      client: phasePersistenceClient,
      eventId: params.eventId,
      teamIdsByPhaseDivision,
    });
  }
  return rosterTeamIds;
};

export const deletePristineScheduleByEvent = async (
  eventId: string,
  client: PrismaLike = prisma,
): Promise<string[]> => {
  const matches = await client.matches.findMany({
    where: { eventId },
    select: { id: true },
  });
  const matchIds = matches
    .map((match: { id?: unknown }) => match.id)
    .filter(
      (id: unknown): id is string => typeof id === "string" && id.length > 0,
    );
  if (!matchIds.length) return [];

  await client.matchSegments.deleteMany({
    where: { matchId: { in: matchIds } },
  });
  await client.broadcastOverlayStates.updateMany({
    where: { eventId, activeMatchId: { in: matchIds } },
    data: { activeMatchId: null, updatedAt: new Date() },
  });
  await client.matches.deleteMany({ where: { id: { in: matchIds } } });
  return matchIds;
};

export const deleteMatchesByEvent = async (
  eventId: string,
  client: PrismaLike = prisma,
) => {
  await client.matches.deleteMany({ where: { eventId } });
};

export const saveEventSchedule = async (
  event: EventSchedulePersistenceInput,
  client: PrismaLike = prisma,
): Promise<void> => {
  const scheduleEndData = event.noFixedEndDateTime
    ? {
        end: event.end,
        generatedScheduleEnd: event.generatedScheduleEnd ?? event.end,
      }
    : event.scheduleEndConstraint
      ? { scheduleEndConstraint: event.scheduleEndConstraint }
      : {};
  await client.events.update({
    where: { id: event.id },
    data: {
      ...scheduleEndData,
      updatedAt: new Date(),
    } as any,
  });
};

type SyncEventDivisionsParams = {
  eventId: string;
  divisionIds: string[];
  fieldIds: string[];
  includePlayoffs?: boolean;
  singleDivision?: boolean;
  sportId?: string | null;
  referenceDate?: Date | null;
  organizationId?: string | null;
  divisionFieldMap?: Record<string, string[]>;
  divisionDetails?: unknown[];
  playoffDivisionDetails?: unknown[];
  defaultPrice?: number | null;
  defaultMaxParticipants?: number | null;
  defaultPlayoffTeamCount?: number | null;
  defaultAllowPaymentPlans?: boolean | null;
  defaultInstallmentCount?: number | null;
  defaultInstallmentDueDates?: string[];
  defaultInstallmentDueRelativeDays?: number[];
  defaultInstallmentAmounts?: number[];
  eventType?: string | null;
  clearPlayoffPlacementMappings?: boolean;
};

type SyncEventDivisionState = {
  usesRelativeInstallmentDueDates: boolean;
  submittedDivisionIds: string[];
  divisionFieldMap: Record<string, string[]>;
  allowedFieldIds: Set<string>;
  submittedLeagueDetails: DivisionDetailPayload[];
  submittedPlayoffDetails: DivisionDetailPayload[];
  persistedRows: any[];
  existingRows: any[];
  existingById: Map<string, any>;
  existingByKey: Map<string, any>;
  normalizedEventType: string;
  tournamentPoolPlayEnabled: boolean;
  submittedLeagueDetailIds: Set<string>;
  normalizedLeagueDetails: DivisionDetailPayload[];
  normalizedPlayoffDetails: DivisionDetailPayload[];
  divisionIds: string[];
  detailLookup: Map<string, DivisionDetailPayload>;
  trustedInternalDivisionIds: Set<string>;
  normalizedDefaultPlayoffTeamCount: number | null | undefined;
  clearSingleDivisionTeamAssignments: boolean;
  effectiveDivisionIds: string[];
};

const loadSyncEventDivisionRows = async (
  client: PrismaLike,
  eventId: string,
): Promise<any[]> =>
  client.divisions.findMany({
    where: {
      eventId,
      role: { in: ["ENTRY", "PHASE"] },
      status: "ACTIVE",
    },
    select: {
      id: true,
      sourceDivisionId: true,
      key: true,
      name: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      playoffTeamCount: true,
      allowPaymentPlans: true,
      installmentCount: true,
      installmentDueDates: true,
      installmentDueRelativeDays: true,
      installmentAmounts: true,
      divisionTypeId: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
      ratingType: true,
      gender: true,
      ageCutoffDate: true,
      ageCutoffLabel: true,
      ageCutoffSource: true,
      kind: true,
      sortOrder: true,
      role: true,
      phase: true,
      playoffPlacementDivisionIds: true,
      isSystemGenerated: true,
      standingsOverrides: true,
      phaseSettings: true,
      gamesPerOpponent: true,
      restTimeMinutes: true,
      usesSets: true,
      matchDurationMinutes: true,
      setDurationMinutes: true,
      setsPerMatch: true,
      pointsToVictory: true,
      playoffDoubleElimination: true,
      playoffWinnerSetCount: true,
      playoffLoserSetCount: true,
      playoffWinnerBracketPointsToVictory: true,
      playoffLoserBracketPointsToVictory: true,
      playoffPrize: true,
      playoffFieldCount: true,
      playoffRestTimeMinutes: true,
      playoffMatchDurationMinutes: true,
      playoffSetDurationMinutes: true,
      standingsConfirmedAt: true,
      standingsConfirmedBy: true,
      teamIds: true,
      fieldIds: true,
    },
  });

const buildSyncEventDivisionLookups = (persistedRows: any[]): {
  existingRows: any[];
  existingById: Map<string, any>;
  existingByKey: Map<string, any>;
} => {
  const existingRows = persistedRows.filter(
    (row: any) => String(row.role ?? "").toUpperCase() !== "PHASE",
  );
  const existingLookupRows = persistedRows.filter(
    (row: any) =>
      String(row.role ?? "").toUpperCase() !== "PHASE" ||
      normalizeDivisionKind(row.kind, "LEAGUE") === "PLAYOFF",
  );
  const existingById = new Map<string, any>();
  const existingByKey = new Map<string, any>();
  for (const row of existingLookupRows) {
    const normalizedId = normalizeDivisionKey(row.id);
    if (normalizedId) {
      existingById.set(normalizedId, row);
      const token = extractDivisionTokenFromId(normalizedId);
      if (token) existingByKey.set(token, row);
    }
    const normalizedKey = normalizeDivisionKey(row.key);
    if (normalizedKey) existingByKey.set(normalizedKey, row);
  }
  return { existingRows, existingById, existingByKey };
};

const getSyncIgnoredSystemGeneratedDivisionIds = (
  persistedRows: any[],
  tournamentPoolPlayEnabled: boolean,
): Set<string> =>
  new Set(
    persistedRows
      .filter((row: any) => {
        if (row.isSystemGenerated !== true) return false;
        const role = String(row.role ?? "").trim().toUpperCase();
        return role === "PHASE" || !tournamentPoolPlayEnabled;
      })
      .map((row: any) => normalizeDivisionKey(row.id))
      .filter((id: string | null): id is string => Boolean(id)),
  );

const normalizeSyncSubmittedDivisionDetails = (params: {
  submittedLeagueDetails: DivisionDetailPayload[];
  submittedPlayoffDetails: DivisionDetailPayload[];
  persistedRows: any[];
  normalizedEventType: string;
  tournamentPoolPlayEnabled: boolean;
}): {
  submittedLeagueDetailIds: Set<string>;
  normalizedLeagueDetails: DivisionDetailPayload[];
  normalizedPlayoffDetails: DivisionDetailPayload[];
} => {
  const submittedLeagueDetailIds = new Set(
    params.submittedLeagueDetails
      .map((detail) => normalizeDivisionKey(detail.id))
      .filter((id): id is string => Boolean(id)),
  );
  const ignoredSystemGeneratedDivisionIds =
    getSyncIgnoredSystemGeneratedDivisionIds(
      params.persistedRows,
      params.tournamentPoolPlayEnabled,
    );
  const isIgnored = (id: unknown): boolean => {
    const normalizedId = normalizeDivisionKey(id);
    return Boolean(
      normalizedId && ignoredSystemGeneratedDivisionIds.has(normalizedId),
    );
  };
  const normalizedLeagueDetails = params.submittedLeagueDetails.filter(
    (detail) => !isIgnored(detail.id),
  );
  const normalizedPlayoffDetails = params.submittedPlayoffDetails.filter(
    (detail) => {
      const id = normalizeDivisionKey(detail.id);
      const regularTournamentProjection =
        params.normalizedEventType === "TOURNAMENT" &&
        !params.tournamentPoolPlayEnabled &&
        Boolean(id && submittedLeagueDetailIds.has(id));
      return !regularTournamentProjection && !isIgnored(detail.id);
    },
  );
  return {
    submittedLeagueDetailIds,
    normalizedLeagueDetails,
    normalizedPlayoffDetails,
  };
};

const buildSyncDivisionDetailLookup = (
  details: DivisionDetailPayload[],
): Map<string, DivisionDetailPayload> => {
  const detailLookup = new Map<string, DivisionDetailPayload>();
  for (const detail of details) {
    const aliases = new Set<string>([
      detail.id,
      detail.key,
      extractDivisionTokenFromId(detail.id) ?? "",
    ]);
    aliases.forEach((alias) => {
      const normalized = normalizeDivisionKey(alias);
      if (normalized) detailLookup.set(normalized, detail);
    });
  }
  return detailLookup;
};

const addSyncGeneratedPoolAliases = (
  detailLookup: Map<string, DivisionDetailPayload>,
  entryDetail: DivisionDetailPayload,
): void => {
  const aliases = new Set<string>([
    entryDetail.id,
    entryDetail.key,
    extractDivisionTokenFromId(entryDetail.id) ?? "",
  ]);
  aliases.forEach((alias) => {
    const normalized = normalizeDivisionKey(alias);
    if (normalized && !detailLookup.has(normalized)) {
      detailLookup.set(normalized, entryDetail);
    }
  });
};

const buildSyncGeneratedPoolEntryDetail = (
  bracketDetail: DivisionDetailPayload,
  pool: any,
  existingPool: any,
): DivisionDetailPayload => ({
  ...bracketDetail,
  id: pool.id,
  key: pool.key,
  name: pool.name,
  role: "ENTRY",
  phase: null,
  kind: "LEAGUE",
  isSystemGenerated: true,
  sourceDivisionId:
    existingPool?.sourceDivisionId ?? bracketDetail.sourceDivisionId ?? null,
  maxParticipants: pool.maxParticipants,
  playoffTeamCount: pool.playoffTeamCount,
  playoffPlacementDivisionIds: pool.playoffPlacementDivisionIds,
  standingsOverrides: undefined,
  standingsConfirmedAt: undefined,
  standingsConfirmedBy: undefined,
  teamIds: pool.teamIds,
});

const hasSyncExplicitTournamentPoolEntries = (
  normalizedLeagueDetails: DivisionDetailPayload[],
  normalizedPlayoffDetails: DivisionDetailPayload[],
): boolean => {
  const normalizedPlayoffDivisionIds = new Set(
    normalizedPlayoffDetails
      .map((detail) => normalizeDivisionKey(detail.id))
      .filter((id): id is string => Boolean(id)),
  );
  return normalizedLeagueDetails.some((detail) => {
    const id = normalizeDivisionKey(detail.id);
    return Boolean(id && !normalizedPlayoffDivisionIds.has(id));
  });
};

const appendSyncGeneratedPoolsForBracket = (params: {
  eventId: string;
  existingRows: any[];
  existingById: Map<string, any>;
  bracketDetail: DivisionDetailPayload;
  detailLookup: Map<string, DivisionDetailPayload>;
  trustedInternalDivisionIds: Set<string>;
  generatedPoolEntryIds: string[];
}): void => {
  const existingPools = generatedPoolsForBracket(
    params.existingRows,
    params.bracketDetail.id,
  );
  const generatedPools = buildGeneratedTournamentPools({
    eventId: params.eventId,
    bracket: {
      id: params.bracketDetail.id,
      key: params.bracketDetail.key,
      name: params.bracketDetail.name,
      maxParticipants: normalizeLegacyBracketTeamCount(
        params.bracketDetail.maxParticipants,
      ),
      playoffTeamCount: normalizeLegacyBracketTeamCount(
        params.bracketDetail.playoffTeamCount,
      ),
      poolCount: params.bracketDetail.poolCount,
    },
    existingPools,
  });
  for (const pool of generatedPools) {
    const existingPool = params.existingById.get(
      normalizeDivisionKey(pool.id) ?? pool.id,
    );
    if (existingPool && existingPool.isSystemGenerated !== true) {
      throw new TournamentPoolValidationError(
        `Generated tournament pool "${pool.id}" conflicts with organizer-owned division "${existingPool.id}".`,
      );
    }
    const entryDetail = buildSyncGeneratedPoolEntryDetail(
      params.bracketDetail,
      pool,
      existingPool,
    );
    params.generatedPoolEntryIds.push(entryDetail.id);
    const generatedPoolId = normalizeDivisionKey(entryDetail.id);
    if (generatedPoolId) {
      params.trustedInternalDivisionIds.add(generatedPoolId);
    }
    addSyncGeneratedPoolAliases(params.detailLookup, entryDetail);
  }
};

const ensureSyncGeneratedPoolEntries = (params: {
  eventId: string;
  existingRows: any[];
  existingById: Map<string, any>;
  normalizedLeagueDetails: DivisionDetailPayload[];
  normalizedPlayoffDetails: DivisionDetailPayload[];
  tournamentPoolPlayEnabled: boolean;
  detailLookup: Map<string, DivisionDetailPayload>;
  trustedInternalDivisionIds: Set<string>;
  effectiveDivisionIds: string[];
}): string[] => {
  const hasExplicitTournamentPoolEntries =
    hasSyncExplicitTournamentPoolEntries(
      params.normalizedLeagueDetails,
      params.normalizedPlayoffDetails,
    );
  if (
    !params.tournamentPoolPlayEnabled ||
    hasExplicitTournamentPoolEntries ||
    !params.normalizedPlayoffDetails.length
  ) {
    return params.effectiveDivisionIds;
  }
  const generatedPoolEntryIds: string[] = [];
  for (const bracketDetail of params.normalizedPlayoffDetails) {
    appendSyncGeneratedPoolsForBracket({
      eventId: params.eventId,
      existingRows: params.existingRows,
      existingById: params.existingById,
      bracketDetail,
      detailLookup: params.detailLookup,
      trustedInternalDivisionIds: params.trustedInternalDivisionIds,
      generatedPoolEntryIds,
    });
  }
  return generatedPoolEntryIds;
};

const resolveSyncPlayoffDivisionLabel = (
  normalizedDivisionId: string,
  detail: DivisionDetailPayload | null,
  existing: any,
): string =>
  detail?.name ??
  existing?.name ??
  detail?.key ??
  existing?.key ??
  extractDivisionTokenFromId(normalizedDivisionId) ??
  normalizedDivisionId;

const resolveSyncPlayoffDivisionValidationInput = (params: {
  rawDivisionId: string;
  detailLookup: Map<string, DivisionDetailPayload>;
  existingById: Map<string, any>;
  existingByKey: Map<string, any>;
}): {
  detail: DivisionDetailPayload | null;
  existing: any;
  label: string;
} => {
  const normalizedDivisionId =
    normalizeDivisionKey(params.rawDivisionId) ?? params.rawDivisionId;
  const detail = findSyncFinalEntryDetail(
    normalizedDivisionId,
    params.detailLookup,
  );
  const existing = findSyncFinalEntryExisting(
    normalizedDivisionId,
    params.existingById,
    params.existingByKey,
  );
  return {
    detail,
    existing,
    label: resolveSyncPlayoffDivisionLabel(
      normalizedDivisionId,
      detail,
      existing,
    ),
  };
};

const validateSyncPlayoffTeamCountForDivision = (params: {
  rawDivisionId: string;
  normalizedDefaultPlayoffTeamCount: number | null | undefined;
  detailLookup: Map<string, DivisionDetailPayload>;
  existingById: Map<string, any>;
  existingByKey: Map<string, any>;
}): void => {
  const { detail, existing, label } =
    resolveSyncPlayoffDivisionValidationInput(params);
  resolveLeaguePlayoffTeamCount(
    detail?.playoffTeamCount ??
      existing?.playoffTeamCount ??
      params.normalizedDefaultPlayoffTeamCount,
    `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} for division "${label}" when playoffs are enabled.`,
  );
};

const validateSyncPlayoffTeamCounts = (params: {
  includePlayoffs?: boolean;
  tournamentPoolPlayEnabled: boolean;
  divisionIds: string[];
  normalizedPlayoffDetails: DivisionDetailPayload[];
  normalizedDefaultPlayoffTeamCount: number | null | undefined;
  detailLookup: Map<string, DivisionDetailPayload>;
  existingById: Map<string, any>;
  existingByKey: Map<string, any>;
}): void => {
  const usesPerDivisionPlayoffTeamCount =
    params.divisionIds.length > 1 || params.normalizedPlayoffDetails.length > 0;
  if (
    !params.includePlayoffs ||
    params.tournamentPoolPlayEnabled ||
    usesPerDivisionPlayoffTeamCount
  ) {
    if (
      params.includePlayoffs &&
      !params.tournamentPoolPlayEnabled &&
      usesPerDivisionPlayoffTeamCount
    ) {
      for (const rawDivisionId of params.divisionIds) {
        validateSyncPlayoffTeamCountForDivision({
          rawDivisionId,
          normalizedDefaultPlayoffTeamCount:
            params.normalizedDefaultPlayoffTeamCount,
          detailLookup: params.detailLookup,
          existingById: params.existingById,
          existingByKey: params.existingByKey,
        });
      }
    }
    return;
  }
  resolveLeaguePlayoffTeamCount(
    params.normalizedDefaultPlayoffTeamCount,
    `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} when playoffs are enabled.`,
  );
};

const prepareSyncEventDivisionState = async (params: {
  client: PrismaLike;
  values: SyncEventDivisionsParams;
}): Promise<SyncEventDivisionState> => {
  const values = params.values;
  const usesRelativeInstallmentDueDates =
    String(values.eventType ?? "").toUpperCase() === "WEEKLY_EVENT";
  const submittedDivisionIds = normalizeDivisionIdentifierList(
    values.divisionIds,
    values.eventId,
  );
  const divisionFieldMap = values.divisionFieldMap ?? {};
  const allowedFieldIds = new Set(
    values.fieldIds.map((fieldId) => String(fieldId)),
  );
  const submittedLeagueDetails = normalizeDivisionDetailsPayload(
    values.divisionDetails ?? [],
    values.eventId,
    values.sportId,
    "LEAGUE",
  );
  const submittedPlayoffDetails = normalizeDivisionDetailsPayload(
    values.playoffDivisionDetails ?? [],
    values.eventId,
    values.sportId,
    "PLAYOFF",
  );
  const persistedRows = await loadSyncEventDivisionRows(
    params.client,
    values.eventId,
  );
  const { existingRows, existingById, existingByKey } =
    buildSyncEventDivisionLookups(persistedRows);
  const normalizedEventType =
    typeof values.eventType === "string" ? values.eventType.toUpperCase() : "";
  const tournamentPoolPlayEnabled = isTournamentPoolPlayEnabled({
    eventType: normalizedEventType,
    includePlayoffs: values.includePlayoffs,
  });
  const normalizedDetails = normalizeSyncSubmittedDivisionDetails({
    submittedLeagueDetails,
    submittedPlayoffDetails,
    persistedRows,
    normalizedEventType,
    tournamentPoolPlayEnabled,
  });
  const activeSubmittedDivisionIds = submittedDivisionIds.filter(
    (id) =>
      !getSyncIgnoredSystemGeneratedDivisionIds(
        persistedRows,
        tournamentPoolPlayEnabled,
      ).has(normalizeDivisionKey(id) ?? id),
  );
  const divisionIds = activeSubmittedDivisionIds.length
    ? activeSubmittedDivisionIds
    : [buildDivisionId(values.eventId, DEFAULT_DIVISION_KEY)];
  const detailLookup = buildSyncDivisionDetailLookup([
    ...normalizedDetails.normalizedLeagueDetails,
    ...normalizedDetails.normalizedPlayoffDetails,
  ]);
  const trustedInternalDivisionIds = collectSystemGeneratedDivisionIds(
    persistedRows.filter(
      (row: any) =>
        !getSyncIgnoredSystemGeneratedDivisionIds(
          persistedRows,
          tournamentPoolPlayEnabled,
        ).has(normalizeDivisionKey(row.id) ?? row.id),
    ),
  );
  const normalizedDefaultPlayoffTeamCount = values.includePlayoffs
    ? resolveLeaguePlayoffTeamCount(
        values.defaultPlayoffTeamCount,
        `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} when playoffs are enabled.`,
      )
    : values.defaultPlayoffTeamCount;
  const clearSingleDivisionTeamAssignments =
    Boolean(values.singleDivision) && !tournamentPoolPlayEnabled;
  const normalizedPlayoffDivisionIds = new Set(
    normalizedDetails.normalizedPlayoffDetails
      .map((detail) => normalizeDivisionKey(detail.id))
      .filter((id): id is string => Boolean(id)),
  );
  const effectiveDivisionIds = ensureSyncGeneratedPoolEntries({
    eventId: values.eventId,
    existingRows,
    existingById,
    normalizedLeagueDetails: normalizedDetails.normalizedLeagueDetails,
    normalizedPlayoffDetails: normalizedDetails.normalizedPlayoffDetails,
    tournamentPoolPlayEnabled,
    detailLookup,
    trustedInternalDivisionIds,
    effectiveDivisionIds: divisionIds,
  });
  validateSyncPlayoffTeamCounts({
    includePlayoffs: values.includePlayoffs,
    tournamentPoolPlayEnabled,
    divisionIds,
    normalizedPlayoffDetails: normalizedDetails.normalizedPlayoffDetails,
    normalizedDefaultPlayoffTeamCount,
    detailLookup,
    existingById,
    existingByKey,
  });
  return {
    usesRelativeInstallmentDueDates,
    submittedDivisionIds,
    divisionFieldMap,
    allowedFieldIds,
    submittedLeagueDetails,
    submittedPlayoffDetails,
    persistedRows,
    existingRows,
    existingById,
    existingByKey,
    normalizedEventType,
    tournamentPoolPlayEnabled,
    submittedLeagueDetailIds: normalizedDetails.submittedLeagueDetailIds,
    normalizedLeagueDetails: normalizedDetails.normalizedLeagueDetails,
    normalizedPlayoffDetails: normalizedDetails.normalizedPlayoffDetails,
    divisionIds,
    detailLookup,
    trustedInternalDivisionIds,
    normalizedDefaultPlayoffTeamCount,
    clearSingleDivisionTeamAssignments,
    effectiveDivisionIds,
  };
};

type SyncFinalEntryIdentity = {
  normalizedDivisionId: string;
  detail: DivisionDetailPayload | null;
  existing: any;
  fallbackIdentifier: string;
  inferred: any;
  persistedId: string;
};

const findSyncFinalEntryDetail = (
  normalizedDivisionId: string,
  detailLookup: Map<string, DivisionDetailPayload>,
): DivisionDetailPayload | null =>
  detailLookup.get(normalizedDivisionId) ??
  detailLookup.get(extractDivisionTokenFromId(normalizedDivisionId) ?? "") ??
  null;

const findSyncFinalEntryExisting = (
  normalizedDivisionId: string,
  existingById: Map<string, any>,
  existingByKey: Map<string, any>,
): any =>
  existingById.get(normalizedDivisionId) ??
  existingByKey.get(normalizedDivisionId) ??
  existingByKey.get(
    extractDivisionTokenFromId(normalizedDivisionId) ?? "",
  ) ??
  null;

const resolveSyncFinalEntryPersistedId = (params: {
  eventId: string;
  normalizedDivisionId: string;
  detail: DivisionDetailPayload | null;
  existing: any;
  inferred: any;
}): string => {
  if (
    params.normalizedDivisionId.includes("__division__") ||
    params.normalizedDivisionId.startsWith("division_")
  ) {
    return params.normalizedDivisionId;
  }
  if (params.existing?.id) {
    const existingId = normalizeDivisionKey(params.existing.id);
    if (existingId) return existingId;
  }
  if (params.detail?.id) return params.detail.id;
  return buildDivisionId(params.eventId, params.inferred.token);
};

const resolveSyncFinalEntryFallbackIdentifier = (
  normalizedDivisionId: string,
  detail: DivisionDetailPayload | null,
  existing: any,
): string =>
  detail?.key ??
  existing?.key ??
  extractDivisionTokenFromId(normalizedDivisionId) ??
  normalizedDivisionId;

const buildSyncFinalEntryIdentity = (params: {
  eventId: string;
  rawDivisionId: string;
  detailLookup: Map<string, DivisionDetailPayload>;
  existingById: Map<string, any>;
  existingByKey: Map<string, any>;
  sportId?: string | null;
}): SyncFinalEntryIdentity => {
  const normalizedDivisionId =
    normalizeDivisionKey(params.rawDivisionId) ?? params.rawDivisionId;
  const detail = findSyncFinalEntryDetail(
    normalizedDivisionId,
    params.detailLookup,
  );
  const existing = findSyncFinalEntryExisting(
    normalizedDivisionId,
    params.existingById,
    params.existingByKey,
  );
  const fallbackIdentifier = resolveSyncFinalEntryFallbackIdentifier(
    normalizedDivisionId,
    detail,
    existing,
  );
  const inferred = inferDivisionDetails({
    identifier: fallbackIdentifier,
    sportInput: params.sportId ?? existing?.sportId ?? undefined,
    fallbackName: detail?.name ?? existing?.name ?? undefined,
  });
  const persistedId = resolveSyncFinalEntryPersistedId({
    eventId: params.eventId,
    normalizedDivisionId,
    detail,
    existing,
    inferred,
  });
  return {
    normalizedDivisionId,
    detail,
    existing,
    fallbackIdentifier,
    inferred,
    persistedId,
  };
};

type SyncFinalEntryClassification = {
  kind: string;
  isTournamentBracketDivision: boolean;
  gender: any;
  ratingType: any;
  divisionTypeId: any;
  skillDivisionTypeId: any;
  ageDivisionTypeId: any;
  key: string;
  divisionTypeName: any;
};

const resolveSyncFinalEntryTypeIds = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  inferred: any;
  ratingType: any;
}): {
  divisionTypeId: any;
  skillDivisionTypeId: any;
  ageDivisionTypeId: any;
} =>
  normalizeDivisionTypeIds({
    divisionTypeId:
      params.detail?.divisionTypeId ?? params.inferred.divisionTypeId,
    skillDivisionTypeId:
      params.detail?.skillDivisionTypeId ?? params.existing?.skillDivisionTypeId,
    ageDivisionTypeId:
      params.detail?.ageDivisionTypeId ?? params.existing?.ageDivisionTypeId,
    ratingType: params.ratingType,
  });

const resolveSyncFinalEntryKey = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  fallbackIdentifier: string;
  gender: any;
  ratingType: any;
  divisionTypeId: any;
}): string =>
  params.detail?.key ??
  params.existing?.key ??
  (params.detail || params.existing
    ? buildDivisionToken({
        gender: params.gender,
        ratingType: params.ratingType,
        divisionTypeId: params.divisionTypeId,
      })
    : params.fallbackIdentifier);
const resolveSyncFinalEntryKind = (params: {
  targetKind: "LEAGUE" | "PLAYOFF";
  detail: DivisionDetailPayload | null;
  existing: any;
}): string =>
  normalizeDivisionKind(
    params.detail?.kind ?? params.existing?.kind ?? params.targetKind,
    params.targetKind,
  );

const resolveSyncFinalEntryDemographics = (params: {
  detail: DivisionDetailPayload | null;
  inferred: any;
}): { gender: any; ratingType: any } => ({
  gender: params.detail?.gender ?? params.inferred.gender,
  ratingType: params.detail?.ratingType ?? params.inferred.ratingType,
});

const buildSyncFinalEntryClassification = (params: {
  targetKind: "LEAGUE" | "PLAYOFF";
  detail: DivisionDetailPayload | null;
  existing: any;
  inferred: any;
  fallbackIdentifier: string;
  tournamentPoolPlayEnabled: boolean;
  sportId?: string | null;
}): SyncFinalEntryClassification => {
  const kind = resolveSyncFinalEntryKind(params);
  const isTournamentBracketDivision =
    params.tournamentPoolPlayEnabled && kind === "PLAYOFF";
  const { gender, ratingType } = resolveSyncFinalEntryDemographics({
    detail: params.detail,
    inferred: params.inferred,
  });
  const { divisionTypeId, skillDivisionTypeId, ageDivisionTypeId } =
    resolveSyncFinalEntryTypeIds({
      detail: params.detail,
      existing: params.existing,
      inferred: params.inferred,
      ratingType,
    });
  const key = resolveSyncFinalEntryKey({
    detail: params.detail,
    existing: params.existing,
    fallbackIdentifier: params.fallbackIdentifier,
    gender,
    ratingType,
    divisionTypeId,
  });
  const divisionTypeName = deriveDivisionTypeDisplayName({
    sportInput: params.sportId ?? undefined,
    gender,
    ratingType,
    divisionTypeId,
  });
  return {
    kind,
    isTournamentBracketDivision,
    gender,
    ratingType,
    divisionTypeId,
    skillDivisionTypeId,
    ageDivisionTypeId,
    key,
    divisionTypeName,
  };
};

const buildSyncFinalEntryFieldIds = (params: {
  normalizedDivisionId: string;
  persistedId: string;
  key: string;
  detail: DivisionDetailPayload | null;
  divisionFieldMap: Record<string, string[]>;
  allowedFieldIds: Set<string>;
}): string[] => {
  const fieldMapAliases = Array.from(
    new Set(
      [
        params.normalizedDivisionId,
        params.persistedId,
        params.key,
        params.detail?.id,
        params.detail?.key,
        extractDivisionTokenFromId(params.normalizedDivisionId),
        extractDivisionTokenFromId(params.persistedId),
      ]
        .map((alias) => normalizeDivisionKey(alias))
        .filter((alias): alias is string => Boolean(alias)),
    ),
  );
  return Array.from(
    new Set([
      ...fieldMapAliases.flatMap((alias) =>
        ensureStringArray(params.divisionFieldMap[alias]),
      ),
      ...ensureStringArray(params.detail?.fieldIds),
    ]),
  ).filter(
    (fieldId) =>
      !params.allowedFieldIds.size || params.allowedFieldIds.has(fieldId),
  );
};

const buildSyncFinalEntryTeamIds = (params: {
  kind: string;
  singleDivision?: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
}): string[] => {
  if (params.kind === "PLAYOFF" || params.singleDivision) return [];
  return normalizeTeamIdList(
    resolveDivisionValue(
      params.detail?.teamIds,
      normalizeTeamIdList(params.existing?.teamIds),
      [],
    ) ?? [],
  );
};

const resolveSyncFinalEntryRatings = (params: {
  kind: string;
  isTournamentBracketDivision: boolean;
  key: string;
  sportId?: string | null;
}): any =>
  params.kind === "PLAYOFF" && !params.isTournamentBracketDivision
    ? { minRating: null, maxRating: null }
    : divisionRatingWindow(params.key, params.sportId ?? null);

const resolveSyncFinalEntryFallbackName = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  divisionTypeName: any;
  inferred: any;
  key: string;
  sportId?: string | null;
}): string =>
  params.detail || params.existing
    ? params.divisionTypeName ||
      params.inferred.defaultName ||
      buildDivisionDisplayName(params.key, params.sportId ?? null)
    : buildDivisionDisplayName(params.key, params.sportId ?? null);

const resolveSyncFinalEntryName = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  fallbackName: string;
}): string =>
  cleanDivisionDisplayName(
    params.detail?.name ?? params.existing?.name,
    params.fallbackName,
  );

const resolveSyncFinalEntryRatingsAndName = (params: {
  kind: string;
  isTournamentBracketDivision: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  divisionTypeName: any;
  inferred: any;
  key: string;
  sportId?: string | null;
}): { ratings: any; name: string } => {
  const ratings = resolveSyncFinalEntryRatings(params);
  const fallbackName = resolveSyncFinalEntryFallbackName(params);
  const name = resolveSyncFinalEntryName({
    detail: params.detail,
    existing: params.existing,
    fallbackName,
  });
  return { ratings, name };
};

type SyncFinalEntryEligibility = {
  ageCutoffDate: string | null;
  ageCutoffLabel: string | null;
  ageCutoffSource: string | null;
};

const resolveSyncAgeCutoffDate = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  ageEligibility: any;
}): string | null =>
  params.detail?.ageCutoffDate ??
  normalizeIsoDateString(params.existing?.ageCutoffDate) ??
  (params.ageEligibility?.applies
    ? params.ageEligibility.cutoffDate.toISOString()
    : null);

const resolveSyncAgeCutoffLabel = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  ageEligibility: any;
}): string | null =>
  params.detail?.ageCutoffLabel ??
  params.existing?.ageCutoffLabel ??
  params.ageEligibility?.message ??
  null;

const resolveSyncAgeCutoffSource = (params: {
  detail: DivisionDetailPayload | null;
  existing: any;
  ageEligibility: any;
}): string | null =>
  params.detail?.ageCutoffSource ??
  params.existing?.ageCutoffSource ??
  (params.ageEligibility?.applies
    ? params.ageEligibility.cutoffRule.source
    : null);

const resolveSyncFinalEntryEligibility = (params: {
  kind: string;
  isTournamentBracketDivision: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  divisionTypeId: any;
  sportId?: string | null;
  referenceDate?: Date | null;
}): SyncFinalEntryEligibility => {
  const isNonBracketPlayoff =
    params.kind === "PLAYOFF" && !params.isTournamentBracketDivision;
  if (isNonBracketPlayoff) {
    return {
      ageCutoffDate: null,
      ageCutoffLabel: null,
      ageCutoffSource: null,
    };
  }
  const ageEligibility = evaluateDivisionAgeEligibility({
    divisionTypeId: params.divisionTypeId,
    sportInput: params.sportId ?? null,
    referenceDate: params.referenceDate ?? null,
  });
  return {
    ageCutoffDate: resolveSyncAgeCutoffDate({
      detail: params.detail,
      existing: params.existing,
      ageEligibility,
    }),
    ageCutoffLabel: resolveSyncAgeCutoffLabel({
      detail: params.detail,
      existing: params.existing,
      ageEligibility,
    }),
    ageCutoffSource: resolveSyncAgeCutoffSource({
      detail: params.detail,
      existing: params.existing,
      ageEligibility,
    }),
  };
};

const resolveSyncFinalEntryPrice = (params: {
  isNonBracketPlayoff: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  defaultPrice?: number | null;
}): number | null =>
  params.isNonBracketPlayoff
    ? null
    : (resolveDivisionValue(
        params.detail?.price,
        params.existing?.price,
        params.defaultPrice ?? undefined,
      ) ?? null);

const resolveSyncFinalEntryGeneratedPool = (params: {
  eventType: string;
  tournamentPoolPlayEnabled: boolean;
  kind: string;
  persistedId: string;
  trustedInternalDivisionIds: Set<string>;
  detail: DivisionDetailPayload | null;
  existing: any;
}): boolean =>
  isGeneratedTournamentPoolRecord({
    eventType: params.eventType,
    isPoolPlayEnabled: params.tournamentPoolPlayEnabled,
    kind: params.kind,
    isSystemGenerated: Boolean(
      params.persistedId &&
        params.trustedInternalDivisionIds.has(params.persistedId),
    ),
    poolCount: params.detail?.poolCount,
    playoffPlacementDivisionIds: [
      ...ensureStringArray(params.detail?.playoffPlacementDivisionIds),
      ...ensureStringArray(params.existing?.playoffPlacementDivisionIds),
    ],
  });

const resolveSyncFinalEntryMaxParticipants = (params: {
  kind: string;
  eventType: string;
  isGeneratedTournamentPool: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  defaultMaxParticipants?: number | null;
}): number | null => {
  const isLeaguePlayoffTarget =
    params.eventType === "LEAGUE" && params.kind === "PLAYOFF";
  const rawMaxParticipants =
    resolveDivisionValue(
      params.detail?.maxParticipants,
      params.existing?.maxParticipants,
      isLeaguePlayoffTarget
        ? undefined
        : params.defaultMaxParticipants ?? undefined,
    ) ?? null;
  return params.eventType === "TOURNAMENT" && !params.isGeneratedTournamentPool
    ? normalizeLegacyBracketTeamCount(rawMaxParticipants)
    : rawMaxParticipants;
};

const resolveSyncFinalEntryPlayoffTeamCount = (params: {
  kind: string;
  eventType: string;
  includePlayoffs?: boolean;
  isGeneratedTournamentPool: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  defaultPlayoffTeamCount: number | null | undefined;
}): number | null => {
  const isLeaguePlayoffTarget =
    params.eventType === "LEAGUE" && params.kind === "PLAYOFF";
  if (isLeaguePlayoffTarget) return null;
  const rawPlayoffTeamCount =
    resolveDivisionValue(
      params.detail?.playoffTeamCount,
      params.existing?.playoffTeamCount,
      params.includePlayoffs
        ? (params.defaultPlayoffTeamCount ?? undefined)
        : undefined,
    ) ?? null;
  return params.includePlayoffs && !params.isGeneratedTournamentPool
    ? normalizeLegacyBracketTeamCount(rawPlayoffTeamCount)
    : rawPlayoffTeamCount;
};

const resolveSyncFinalEntryAllowPaymentPlans = (params: {
  kind: string;
  isTournamentBracketDivision: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  defaultAllowPaymentPlans?: boolean | null;
}): boolean | null => {
  if (params.kind === "PLAYOFF" && !params.isTournamentBracketDivision) {
    return false;
  }
  return (
    resolveDivisionValue(
      params.detail?.allowPaymentPlans,
      params.existing?.allowPaymentPlans ?? undefined,
      params.defaultAllowPaymentPlans ?? undefined,
    ) ?? null
  );
};

type SyncFinalEntryCapacity = {
  price: number | null;
  maxParticipants: number | null;
  playoffTeamCount: number | null;
  allowPaymentPlans: boolean | null;
};

const resolveSyncFinalEntryCapacity = (params: {
  eventType: string;
  tournamentPoolPlayEnabled: boolean;
  kind: string;
  isTournamentBracketDivision: boolean;
  persistedId: string;
  trustedInternalDivisionIds: Set<string>;
  detail: DivisionDetailPayload | null;
  existing: any;
  includePlayoffs?: boolean;
  defaultPrice?: number | null;
  defaultMaxParticipants?: number | null;
  defaultPlayoffTeamCount: number | null | undefined;
  defaultAllowPaymentPlans?: boolean | null;
}): SyncFinalEntryCapacity => {
  const isNonBracketPlayoff =
    params.kind === "PLAYOFF" && !params.isTournamentBracketDivision;
  const isGeneratedTournamentPool = resolveSyncFinalEntryGeneratedPool(params);
  return {
    price: resolveSyncFinalEntryPrice({
      isNonBracketPlayoff,
      detail: params.detail,
      existing: params.existing,
      defaultPrice: params.defaultPrice,
    }),
    maxParticipants: resolveSyncFinalEntryMaxParticipants({
      kind: params.kind,
      eventType: params.eventType,
      isGeneratedTournamentPool,
      detail: params.detail,
      existing: params.existing,
      defaultMaxParticipants: params.defaultMaxParticipants,
    }),
    playoffTeamCount: resolveSyncFinalEntryPlayoffTeamCount({
      kind: params.kind,
      eventType: params.eventType,
      includePlayoffs: params.includePlayoffs,
      isGeneratedTournamentPool,
      detail: params.detail,
      existing: params.existing,
      defaultPlayoffTeamCount: params.defaultPlayoffTeamCount,
    }),
    allowPaymentPlans: resolveSyncFinalEntryAllowPaymentPlans({
      kind: params.kind,
      isTournamentBracketDivision: params.isTournamentBracketDivision,
      detail: params.detail,
      existing: params.existing,
      defaultAllowPaymentPlans: params.defaultAllowPaymentPlans,
    }),
  };
};

const resolveSyncFinalEntryPlacementIds = (params: {
  kind: string;
  clearPlayoffPlacementMappings?: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
}): string[] =>
  params.kind === "PLAYOFF" || params.clearPlayoffPlacementMappings
    ? []
    : (resolveDivisionValue(
        params.detail?.playoffPlacementDivisionIds,
        normalizePlacementDivisionIdentifierList(
          params.existing?.playoffPlacementDivisionIds,
        ),
        [],
      ) ?? []);

const resolveSyncFinalEntryPlayoffConfig = (params: {
  kind: string;
  detail: DivisionDetailPayload | null;
  existing: any;
}): any =>
  params.kind === "PLAYOFF"
    ? (resolveDivisionValue(
        params.detail?.playoffConfig,
        normalizePlayoffDivisionConfig(params.existing?.standingsOverrides),
        normalizePlayoffDivisionConfig(params.detail),
      ) ?? null)
    : (resolveDivisionValue(
        params.detail?.playoffConfig,
        normalizeDivisionPlayoffConfigFields(params.existing),
        normalizePlayoffDivisionConfig(params.detail),
      ) ?? null);

const resolveSyncFinalEntryStandingsOverrides = (params: {
  kind: string;
  playoffConfig: any;
  detail: DivisionDetailPayload | null;
  existing: any;
}): any =>
  params.kind === "PLAYOFF"
    ? params.playoffConfig
      ? serializePlayoffDivisionConfig(params.playoffConfig)
      : null
    : (resolveDivisionValue(
        params.detail?.standingsOverrides,
        normalizeStandingsOverrides(params.existing?.standingsOverrides),
        null,
      ) ?? null);

const resolveSyncFinalEntryStandingsConfirmation = (params: {
  kind: string;
  detail: DivisionDetailPayload | null;
  existing: any;
}): {
  standingsConfirmedAt: string | null;
  standingsConfirmedBy: string | null;
} =>
  params.kind === "PLAYOFF"
    ? { standingsConfirmedAt: null, standingsConfirmedBy: null }
    : {
        standingsConfirmedAt:
          resolveDivisionValue(
            params.detail?.standingsConfirmedAt,
            normalizeIsoDateString(params.existing?.standingsConfirmedAt),
            null,
          ) ?? null,
        standingsConfirmedBy:
          resolveDivisionValue(
            params.detail?.standingsConfirmedBy,
            params.existing?.standingsConfirmedBy ?? null,
            null,
          ) ?? null,
      };

type SyncFinalEntryConfigs = {
  playoffPlacementDivisionIds: string[];
  playoffConfig: any;
  leagueConfig: any;
  standingsOverrides: any;
  phaseSettings: any;
  standingsConfirmedAt: string | null;
  standingsConfirmedBy: string | null;
};

const resolveSyncFinalEntryConfigs = (params: {
  kind: string;
  clearPlayoffPlacementMappings?: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
}): SyncFinalEntryConfigs => {
  const playoffPlacementDivisionIds = resolveSyncFinalEntryPlacementIds(params);
  const playoffConfig = resolveSyncFinalEntryPlayoffConfig(params);
  const leagueConfig =
    resolveDivisionValue(
      normalizeLeagueDivisionConfig(params.detail),
      normalizeLeagueDivisionConfig(params.existing),
      null,
    ) ?? null;
  const standingsOverrides = resolveSyncFinalEntryStandingsOverrides({
    kind: params.kind,
    playoffConfig,
    detail: params.detail,
    existing: params.existing,
  });
  const phaseSettings =
    resolveDivisionValue(
      params.detail?.phaseSettings,
      normalizeDivisionPhaseSettingsMap(params.existing?.phaseSettings),
      {},
    ) ?? {};
  return {
    playoffPlacementDivisionIds,
    playoffConfig,
    leagueConfig,
    standingsOverrides,
    phaseSettings,
    ...resolveSyncFinalEntryStandingsConfirmation(params),
  };
};

type SyncFinalEntryInstallments = {
  installmentCount: number | null;
  installmentDueDates: string[];
  installmentDueRelativeDays: number[];
  installmentAmounts: number[];
};

const resolveSyncFinalEntryInstallmentFallbacks = (params: {
  usesRelativeInstallmentDueDates: boolean;
  defaultInstallmentDueDates?: string[];
  defaultInstallmentDueRelativeDays?: number[];
  defaultInstallmentAmounts?: number[];
}): {
  fallbackInstallmentAmounts: number[];
  fallbackInstallmentDueDates: string[];
  fallbackInstallmentDueRelativeDays: number[];
} => ({
  fallbackInstallmentAmounts: normalizeInstallmentAmountList(
    params.defaultInstallmentAmounts ?? [],
  ),
  fallbackInstallmentDueDates: params.usesRelativeInstallmentDueDates
    ? []
    : normalizeInstallmentDateList(params.defaultInstallmentDueDates ?? []),
  fallbackInstallmentDueRelativeDays: params.usesRelativeInstallmentDueDates
    ? normalizeInstallmentRelativeDayList(
        params.defaultInstallmentDueRelativeDays ?? [],
      )
    : [],
});

const resolveSyncFinalEntryInstallmentAmounts = (params: {
  allowPaymentPlans: boolean | null;
  detail: DivisionDetailPayload | null;
  existing: any;
  fallbackInstallmentAmounts: number[];
}): number[] =>
  params.allowPaymentPlans
    ? (resolveDivisionValue(
        params.detail?.installmentAmounts,
        Array.isArray(params.existing?.installmentAmounts)
          ? normalizeInstallmentAmountList(params.existing.installmentAmounts)
          : undefined,
        params.fallbackInstallmentAmounts,
      ) ?? [])
    : [];

const resolveSyncFinalEntryInstallmentDueDates = (params: {
  allowPaymentPlans: boolean | null;
  usesRelativeInstallmentDueDates: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  fallbackInstallmentDueDates: string[];
}): string[] =>
  params.allowPaymentPlans && !params.usesRelativeInstallmentDueDates
    ? (resolveDivisionValue(
        params.detail?.installmentDueDates,
        Array.isArray(params.existing?.installmentDueDates)
          ? normalizeInstallmentDateList(params.existing.installmentDueDates)
          : undefined,
        params.fallbackInstallmentDueDates,
      ) ?? [])
    : [];

const resolveSyncFinalEntryInstallmentRelativeDays = (params: {
  allowPaymentPlans: boolean | null;
  usesRelativeInstallmentDueDates: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  fallbackInstallmentDueRelativeDays: number[];
}): number[] =>
  params.allowPaymentPlans && params.usesRelativeInstallmentDueDates
    ? (resolveDivisionValue(
        params.detail?.installmentDueRelativeDays,
        Array.isArray(params.existing?.installmentDueRelativeDays)
          ? normalizeInstallmentRelativeDayList(
              params.existing.installmentDueRelativeDays,
            )
          : undefined,
        params.fallbackInstallmentDueRelativeDays,
      ) ?? [])
    : [];

const resolveSyncFinalEntryInstallmentCount = (params: {
  allowPaymentPlans: boolean | null;
  detail: DivisionDetailPayload | null;
  existing: any;
  defaultInstallmentCount?: number | null;
  installmentAmounts: number[];
}): number | null => {
  if (!params.allowPaymentPlans) return null;
  const resolvedInstallmentCount = resolveDivisionValue(
    params.detail?.installmentCount,
    params.existing?.installmentCount ?? undefined,
    params.defaultInstallmentCount ?? undefined,
  );
  return typeof resolvedInstallmentCount === "number" &&
    Number.isFinite(resolvedInstallmentCount)
    ? Math.max(0, Math.trunc(resolvedInstallmentCount))
    : params.installmentAmounts.length;
};

const resolveSyncFinalEntryInstallments = (params: {
  allowPaymentPlans: boolean | null;
  usesRelativeInstallmentDueDates: boolean;
  detail: DivisionDetailPayload | null;
  existing: any;
  defaultInstallmentCount?: number | null;
  defaultInstallmentDueDates?: string[];
  defaultInstallmentDueRelativeDays?: number[];
  defaultInstallmentAmounts?: number[];
}): SyncFinalEntryInstallments => {
  const fallbacks = resolveSyncFinalEntryInstallmentFallbacks(params);
  const installmentAmounts = resolveSyncFinalEntryInstallmentAmounts({
    allowPaymentPlans: params.allowPaymentPlans,
    detail: params.detail,
    existing: params.existing,
    fallbackInstallmentAmounts: fallbacks.fallbackInstallmentAmounts,
  });
  return {
    installmentAmounts,
    installmentDueDates: resolveSyncFinalEntryInstallmentDueDates({
      allowPaymentPlans: params.allowPaymentPlans,
      usesRelativeInstallmentDueDates: params.usesRelativeInstallmentDueDates,
      detail: params.detail,
      existing: params.existing,
      fallbackInstallmentDueDates: fallbacks.fallbackInstallmentDueDates,
    }),
    installmentDueRelativeDays: resolveSyncFinalEntryInstallmentRelativeDays({
      allowPaymentPlans: params.allowPaymentPlans,
      usesRelativeInstallmentDueDates: params.usesRelativeInstallmentDueDates,
      detail: params.detail,
      existing: params.existing,
      fallbackInstallmentDueRelativeDays:
        fallbacks.fallbackInstallmentDueRelativeDays,
    }),
    installmentCount: resolveSyncFinalEntryInstallmentCount({
      allowPaymentPlans: params.allowPaymentPlans,
      detail: params.detail,
      existing: params.existing,
      defaultInstallmentCount: params.defaultInstallmentCount,
      installmentAmounts,
    }),
  };
};

const buildSyncFinalEntryIdentityFields = (params: {
  identity: SyncFinalEntryIdentity;
  state: SyncEventDivisionState;
}): Record<string, unknown> => ({
  sourceDivisionId:
    params.identity.detail?.sourceDivisionId ??
    params.identity.existing?.sourceDivisionId ??
    null,
  isSystemGenerated: Boolean(
    params.identity.persistedId &&
      params.state.trustedInternalDivisionIds.has(
        params.identity.persistedId,
      ),
  ),
});

const readSyncLeagueConfigValue = <T>(
  config: any,
  key: string,
  fallback: T,
): T => config?.[key] ?? fallback;

const buildSyncFinalEntryLeagueFields = (params: {
  classification: SyncFinalEntryClassification;
  configs: SyncFinalEntryConfigs;
}): Record<string, unknown> => ({
  ...playoffConfigToDivisionFields(
    params.classification.kind === "LEAGUE"
      ? params.configs.playoffConfig
      : null,
  ),
  gamesPerOpponent: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "gamesPerOpponent",
    null,
  ),
  restTimeMinutes: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "restTimeMinutes",
    null,
  ),
  usesSets: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "usesSets",
    null,
  ),
  matchDurationMinutes: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "matchDurationMinutes",
    null,
  ),
  setDurationMinutes: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "setDurationMinutes",
    null,
  ),
  setsPerMatch: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "setsPerMatch",
    null,
  ),
  pointsToVictory: readSyncLeagueConfigValue(
    params.configs.leagueConfig,
    "pointsToVictory",
    [],
  ),
});

const buildSyncFinalEntryResult = (params: {
  values: SyncEventDivisionsParams;
  state: SyncEventDivisionState;
  sortOrder: number;
  identity: SyncFinalEntryIdentity;
  classification: SyncFinalEntryClassification;
  ratingsAndName: { ratings: any; name: string };
  capacity: SyncFinalEntryCapacity;
  eligibility: SyncFinalEntryEligibility;
  configs: SyncFinalEntryConfigs;
  installments: SyncFinalEntryInstallments;
  mappedFieldIds: string[];
  mappedTeamIds: string[];
}): any => ({
  ...buildSyncFinalEntryIdentityFields({
    identity: params.identity,
    state: params.state,
  }),
  id: params.identity.persistedId,
  key: params.classification.key,
  name: params.ratingsAndName.name,
  kind: params.classification.kind,
  sortOrder: params.sortOrder,
  divisionTypeId: params.classification.divisionTypeId,
  skillDivisionTypeId: params.classification.skillDivisionTypeId,
  ageDivisionTypeId: params.classification.ageDivisionTypeId,
  divisionTypeName: params.classification.divisionTypeName,
  ratingType: params.classification.ratingType,
  gender: params.classification.gender,
  ageCutoffDate: params.eligibility.ageCutoffDate,
  ageCutoffLabel: params.eligibility.ageCutoffLabel,
  ageCutoffSource: params.eligibility.ageCutoffSource,
  price: params.capacity.price,
  maxParticipants: params.capacity.maxParticipants,
  playoffTeamCount: params.capacity.playoffTeamCount,
  playoffPlacementDivisionIds:
    params.configs.playoffPlacementDivisionIds,
  standingsOverrides: params.configs.standingsOverrides,
  phaseSettings: params.configs.phaseSettings,
  ...buildSyncFinalEntryLeagueFields({
    classification: params.classification,
    configs: params.configs,
  }),
  standingsConfirmedAt: params.configs.standingsConfirmedAt,
  standingsConfirmedBy: params.configs.standingsConfirmedBy,
  allowPaymentPlans: params.capacity.allowPaymentPlans,
  installmentCount: params.installments.installmentCount,
  installmentDueDates: params.installments.installmentDueDates,
  installmentDueRelativeDays:
    params.installments.installmentDueRelativeDays,
  installmentAmounts: params.installments.installmentAmounts,
  minRating: params.ratingsAndName.ratings.minRating,
  maxRating: params.ratingsAndName.ratings.maxRating,
  fieldIds: params.mappedFieldIds,
  teamIds: params.mappedTeamIds,
});

const buildSyncFinalEntry = (params: {
  values: SyncEventDivisionsParams;
  state: SyncEventDivisionState;
  rawDivisionId: string;
  targetKind: "LEAGUE" | "PLAYOFF";
  sortOrder: number;
}): any => {
  const values = params.values;
  const state = params.state;
  const identity = buildSyncFinalEntryIdentity({
    eventId: values.eventId,
    rawDivisionId: params.rawDivisionId,
    detailLookup: state.detailLookup,
    existingById: state.existingById,
    existingByKey: state.existingByKey,
    sportId: values.sportId,
  });
  const classification = buildSyncFinalEntryClassification({
    targetKind: params.targetKind,
    detail: identity.detail,
    existing: identity.existing,
    inferred: identity.inferred,
    fallbackIdentifier: identity.fallbackIdentifier,
    tournamentPoolPlayEnabled: state.tournamentPoolPlayEnabled,
    sportId: values.sportId,
  });
  const mappedFieldIds = buildSyncFinalEntryFieldIds({
    normalizedDivisionId: identity.normalizedDivisionId,
    persistedId: identity.persistedId,
    key: classification.key,
    detail: identity.detail,
    divisionFieldMap: state.divisionFieldMap,
    allowedFieldIds: state.allowedFieldIds,
  });
  const mappedTeamIds = buildSyncFinalEntryTeamIds({
    kind: classification.kind,
    singleDivision: values.singleDivision,
    detail: identity.detail,
    existing: identity.existing,
  });
  const ratingsAndName = resolveSyncFinalEntryRatingsAndName({
    kind: classification.kind,
    isTournamentBracketDivision: classification.isTournamentBracketDivision,
    detail: identity.detail,
    existing: identity.existing,
    divisionTypeName: classification.divisionTypeName,
    inferred: identity.inferred,
    key: classification.key,
    sportId: values.sportId,
  });
  const capacity = resolveSyncFinalEntryCapacity({
    eventType: state.normalizedEventType,
    tournamentPoolPlayEnabled: state.tournamentPoolPlayEnabled,
    kind: classification.kind,
    isTournamentBracketDivision: classification.isTournamentBracketDivision,
    persistedId: identity.persistedId,
    trustedInternalDivisionIds: state.trustedInternalDivisionIds,
    detail: identity.detail,
    existing: identity.existing,
    includePlayoffs: values.includePlayoffs,
    defaultPrice: values.defaultPrice,
    defaultMaxParticipants: values.defaultMaxParticipants,
    defaultPlayoffTeamCount: state.normalizedDefaultPlayoffTeamCount,
    defaultAllowPaymentPlans: values.defaultAllowPaymentPlans,
  });
  const eligibility = resolveSyncFinalEntryEligibility({
    kind: classification.kind,
    isTournamentBracketDivision: classification.isTournamentBracketDivision,
    detail: identity.detail,
    existing: identity.existing,
    divisionTypeId: classification.divisionTypeId,
    sportId: values.sportId,
    referenceDate: values.referenceDate,
  });
  const configs = resolveSyncFinalEntryConfigs({
    kind: classification.kind,
    clearPlayoffPlacementMappings: values.clearPlayoffPlacementMappings,
    detail: identity.detail,
    existing: identity.existing,
  });
  const installments = resolveSyncFinalEntryInstallments({
    allowPaymentPlans: capacity.allowPaymentPlans,
    usesRelativeInstallmentDueDates: state.usesRelativeInstallmentDueDates,
    detail: identity.detail,
    existing: identity.existing,
    defaultInstallmentCount: values.defaultInstallmentCount,
    defaultInstallmentDueDates: values.defaultInstallmentDueDates,
    defaultInstallmentDueRelativeDays: values.defaultInstallmentDueRelativeDays,
    defaultInstallmentAmounts: values.defaultInstallmentAmounts,
  });
  return buildSyncFinalEntryResult({
    values,
    state,
    sortOrder: params.sortOrder,
    identity,
    classification,
    ratingsAndName,
    capacity,
    eligibility,
    configs,
    installments,
    mappedFieldIds,
    mappedTeamIds,
  });
};

const buildSyncFinalEntries = (
  params: SyncEventDivisionsParams,
  state: SyncEventDivisionState,
): any[] => {
  const targetDivisionDescriptors = [
    ...state.effectiveDivisionIds.map((rawDivisionId, sortOrder) => ({
      rawDivisionId,
      kind: "LEAGUE" as const,
      sortOrder,
    })),
    ...state.normalizedPlayoffDetails.map((detail, sortOrder) => ({
      rawDivisionId: detail.id,
      kind: "PLAYOFF" as const,
      sortOrder,
    })),
  ];
  const seenDivisionIds = new Set<string>();
  return targetDivisionDescriptors
    .filter(({ rawDivisionId }) => {
      const normalizedDivisionId =
        normalizeDivisionKey(rawDivisionId) ?? rawDivisionId;
      if (seenDivisionIds.has(normalizedDivisionId)) return false;
      seenDivisionIds.add(normalizedDivisionId);
      return true;
    })
    .map(({ rawDivisionId, kind, sortOrder }) =>
      buildSyncFinalEntry({
        values: params,
        state,
        rawDivisionId,
        targetKind: kind,
        sortOrder,
      }),
    );
};
const validateSyncTeamDivisionAssignments = (finalEntries: any[]): void => {
  const teamDivisionMap = new Map<string, string>();
  for (const entry of finalEntries) {
    if (entry.kind === "PLAYOFF") continue;
    for (const teamId of entry.teamIds ?? []) {
      const existingDivisionId = teamDivisionMap.get(teamId);
      if (existingDivisionId && existingDivisionId !== entry.id) {
        throw new Error(
          `Team ${teamId} is assigned to more than one division.`,
        );
      }
      teamDivisionMap.set(teamId, entry.id);
    }
  }
};

const collectSyncStaleDivisionIds = (
  finalEntries: any[],
  existingRows: any[],
): string[] => {
  const finalIdSet = new Set(
    finalEntries.map((entry) => normalizeDivisionKey(entry.id) ?? entry.id),
  );
  return existingRows
    .filter((row: any) => {
      const normalizedId = normalizeDivisionKey(row.id) ?? row.id;
      if (String(row.role ?? "").toUpperCase() === "PHASE") return false;
      return !finalIdSet.has(normalizedId);
    })
    .map((row: any) => row.id);
};

const assertNoStaleAssignedTournamentPool = (
  finalEntries: any[],
  existingRows: any[],
  tournamentPoolPlayEnabled: boolean,
): void => {
  if (!tournamentPoolPlayEnabled) return;
  const finalIdSet = new Set(
    finalEntries.map((entry) => normalizeDivisionKey(entry.id) ?? entry.id),
  );
  const staleAssignedPool = existingRows.find((row: any) => {
    const normalizedId = normalizeDivisionKey(row.id) ?? row.id;
    if (finalIdSet.has(normalizedId)) return false;
    if (normalizeDivisionKind(row.kind, "LEAGUE") === "PLAYOFF") {
      return false;
    }
    return normalizeTeamIdList(row.teamIds).length > 0;
  });
  if (staleAssignedPool) {
    throw new Error(
      `Cannot remove pool "${staleAssignedPool.name ?? staleAssignedPool.id}" while it has assigned teams.`,
    );
  }
};

const validateSyncFinalEntries = (params: {
  finalEntries: any[];
  existingRows: any[];
  trustedInternalDivisionIds: Set<string>;
  singleDivision?: boolean;
  tournamentPoolPlayEnabled: boolean;
}): string[] => {
  const duplicateDivisionNames = findDuplicateDivisionNames(
    params.finalEntries.filter((entry) => {
      const id = normalizeDivisionKey(entry.id);
      return !id || !params.trustedInternalDivisionIds.has(id);
    }),
  );
  if (duplicateDivisionNames.length > 0) {
    throw new EventDivisionNameValidationError(duplicateDivisionNames);
  }
  if (!params.singleDivision || params.tournamentPoolPlayEnabled) {
    validateSyncTeamDivisionAssignments(params.finalEntries);
  }
  assertNoStaleAssignedTournamentPool(
    params.finalEntries,
    params.existingRows,
    params.tournamentPoolPlayEnabled,
  );
  return collectSyncStaleDivisionIds(
    params.finalEntries,
    params.existingRows,
  );
};

const resolveSyncDivisionRole = (kind: string): string =>
  kind === "PLAYOFF" ? "PHASE" : "ENTRY";

const resolveSyncDivisionPhase = (
  kind: string,
  tournamentPoolPlayEnabled: boolean,
): string | null => {
  if (kind !== "PLAYOFF") return null;
  return tournamentPoolPlayEnabled ? "BRACKET" : "PLAYOFF";
};

const normalizeSyncDivisionDueDates = (values: string[]): Date[] =>
  values
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

const resolveSyncDivisionDate = (value: string | null): Date | null =>
  value ? new Date(value) : null;

const resolveSyncDivisionTeamIds = (
  clearSingleDivisionTeamAssignments: boolean,
  entry: any,
): string[] =>
  clearSingleDivisionTeamAssignments ? [] : (entry.teamIds ?? []);

const buildSyncDivisionPersistenceBase = (params: {
  entry: any;
  values: SyncEventDivisionsParams;
  tournamentPoolPlayEnabled: boolean;
  clearSingleDivisionTeamAssignments: boolean;
}): Record<string, unknown> => {
  const entry = params.entry;
  return {
    key: entry.key,
    name: entry.name,
    kind: entry.kind,
    sortOrder: entry.sortOrder,
    eventId: params.values.eventId,
    scope: "EVENT",
    status: "ACTIVE",
    role: resolveSyncDivisionRole(entry.kind),
    isSystemGenerated: entry.isSystemGenerated,
    phase: resolveSyncDivisionPhase(
      entry.kind,
      params.tournamentPoolPlayEnabled,
    ),
    sourceDivisionId: entry.sourceDivisionId,
    organizationId: params.values.organizationId ?? null,
    sportId: params.values.sportId ?? null,
    price: entry.price,
    maxParticipants: entry.maxParticipants,
    playoffTeamCount: entry.playoffTeamCount,
    playoffPlacementDivisionIds: entry.playoffPlacementDivisionIds,
    standingsOverrides: entry.standingsOverrides,
    phaseSettings: entry.phaseSettings,
    gamesPerOpponent: entry.gamesPerOpponent,
    restTimeMinutes: entry.restTimeMinutes,
    usesSets: entry.usesSets,
    matchDurationMinutes: entry.matchDurationMinutes,
    setDurationMinutes: entry.setDurationMinutes,
    setsPerMatch: entry.setsPerMatch,
    pointsToVictory: entry.pointsToVictory,
    playoffDoubleElimination: entry.playoffDoubleElimination,
    playoffWinnerSetCount: entry.playoffWinnerSetCount,
    playoffLoserSetCount: entry.playoffLoserSetCount,
    playoffWinnerBracketPointsToVictory:
      entry.playoffWinnerBracketPointsToVictory,
    playoffLoserBracketPointsToVictory:
      entry.playoffLoserBracketPointsToVictory,
    playoffPrize: entry.playoffPrize,
    playoffFieldCount: entry.playoffFieldCount,
    playoffRestTimeMinutes: entry.playoffRestTimeMinutes,
    playoffMatchDurationMinutes: entry.playoffMatchDurationMinutes,
    playoffSetDurationMinutes: entry.playoffSetDurationMinutes,
    standingsConfirmedAt: resolveSyncDivisionDate(entry.standingsConfirmedAt),
    standingsConfirmedBy: entry.standingsConfirmedBy,
    allowPaymentPlans: entry.allowPaymentPlans,
    installmentCount: entry.installmentCount,
    installmentDueDates: normalizeSyncDivisionDueDates(
      entry.installmentDueDates,
    ),
    installmentDueRelativeDays: entry.installmentDueRelativeDays,
    installmentAmounts: entry.installmentAmounts,
    divisionTypeId: entry.divisionTypeId,
    skillDivisionTypeId: entry.skillDivisionTypeId,
    ageDivisionTypeId: entry.ageDivisionTypeId,
    ratingType: entry.ratingType,
    gender: entry.gender,
    ageCutoffDate: resolveSyncDivisionDate(entry.ageCutoffDate),
    ageCutoffLabel: entry.ageCutoffLabel,
    ageCutoffSource: entry.ageCutoffSource,
    minRating: entry.minRating,
    maxRating: entry.maxRating,
    fieldIds: entry.fieldIds,
    teamIds: resolveSyncDivisionTeamIds(
      params.clearSingleDivisionTeamAssignments,
      entry,
    ),
  };
};

const buildSyncDivisionUpsertArgs = (params: {
  entry: any;
  values: SyncEventDivisionsParams;
  tournamentPoolPlayEnabled: boolean;
  clearSingleDivisionTeamAssignments: boolean;
  now: Date;
}): {
  where: { id: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
} => {
  const base = buildSyncDivisionPersistenceBase(params);
  return {
    where: { id: params.entry.id },
    create: {
      id: params.entry.id,
      ...base,
      createdAt: params.now,
      updatedAt: params.now,
    },
    update: {
      ...base,
      updatedAt: params.now,
    },
  };
};

const persistSyncDivisionEntries = async (params: {
  client: PrismaLike;
  entries: any[];
  values: SyncEventDivisionsParams;
  tournamentPoolPlayEnabled: boolean;
  clearSingleDivisionTeamAssignments: boolean;
  now: Date;
}): Promise<void> => {
  for (const entry of params.entries) {
    await params.client.divisions.upsert(
      buildSyncDivisionUpsertArgs({
        entry,
        values: params.values,
        tournamentPoolPlayEnabled: params.tournamentPoolPlayEnabled,
        clearSingleDivisionTeamAssignments:
          params.clearSingleDivisionTeamAssignments,
        now: params.now,
      }),
    );
  }
};

const persistSyncEventDivisions = async (params: {
  client: PrismaLike;
  values: SyncEventDivisionsParams;
  finalEntries: any[];
  staleDivisionIds: string[];
  tournamentPoolPlayEnabled: boolean;
  clearSingleDivisionTeamAssignments: boolean;
}): Promise<void> => {
  if (params.staleDivisionIds.length) {
    await params.client.divisions.deleteMany({
      where: { id: { in: params.staleDivisionIds } },
    });
  }
  const now = new Date();
  await persistSyncDivisionEntries({
    client: params.client,
    entries: params.finalEntries,
    values: params.values,
    tournamentPoolPlayEnabled: params.tournamentPoolPlayEnabled,
    clearSingleDivisionTeamAssignments:
      params.clearSingleDivisionTeamAssignments,
    now,
  });
  await syncEventDivisionPhases({
    client: params.client,
    eventId: params.values.eventId,
    eventType: params.values.eventType,
    includePlayoffs: params.values.includePlayoffs,
    tournamentPoolPlayEnabled: params.tournamentPoolPlayEnabled,
    organizationId: params.values.organizationId,
    entries: params.finalEntries as any,
  });
};

export const syncEventDivisions = async (
  params: SyncEventDivisionsParams,
  client: PrismaLike = prisma,
) => {
  const state = await prepareSyncEventDivisionState({
    client,
    values: params,
  });
  const finalEntries = buildSyncFinalEntries(params, state);
  const staleDivisionIds = validateSyncFinalEntries({
    finalEntries,
    existingRows: state.existingRows,
    trustedInternalDivisionIds: state.trustedInternalDivisionIds,
    singleDivision: params.singleDivision,
    tournamentPoolPlayEnabled: state.tournamentPoolPlayEnabled,
  });
  await persistSyncEventDivisions({
    client,
    values: params,
    finalEntries,
    staleDivisionIds,
    tournamentPoolPlayEnabled: state.tournamentPoolPlayEnabled,
    clearSingleDivisionTeamAssignments:
      state.clearSingleDivisionTeamAssignments,
  });
  return finalEntries
    .filter((entry) => entry.kind !== "PLAYOFF")
    .map((entry) => entry.id);
};

export type EventUpsertOptions = {
  preserveOperationalState?: boolean;
  preserveStaffState?: boolean;
};

const normalizeUpsertEventType = (value: unknown): string | null =>
  typeof value === "string"
    ? value.trim().toUpperCase()
    : (value as string | null | undefined) ?? null;

const eventUpsertExistingEventSelect = {
  fieldIds: true,
  timeSlotIds: true,
  eventType: true,
  teamSignup: true,
  includePlayoffs: true,
  end: true,
  scheduleEndConstraint: true,
  generatedScheduleEnd: true,
  noFixedEndDateTime: true,
  automatedScheduling: true,
  hostId: true,
  assistantHostIds: true,
  organizationId: true,
  parentEvent: true,
  location: true,
  officialPositions: true as any,
  officialSchedulingMode: true as any,
  staffingPriority: true as any,
  doTeamsOfficiate: true as any,
  matchRulesOverride: true as any,
  autoCreatePointMatchIncidents: true,
  sportIds: true,
  coordinates: true,
  timeZone: true,
};

const loadExistingEventForUpsert = async (
  id: string,
  client: PrismaLike,
): Promise<any> =>
  client.events.findUnique({
    where: { id },
    select: eventUpsertExistingEventSelect,
  });
const resolveEventUpsertTeamSignup = (
  payload: any,
  existingEvent: any,
): boolean =>
  Boolean(
    Object.prototype.hasOwnProperty.call(payload, "teamSignup")
      ? payload.teamSignup
      : existingEvent.teamSignup,
  );


const assertEventUpsertStructureUnlocked = async (params: {
  id: string;
  payload: any;
  existingEvent: any;
  client: PrismaLike;
}): Promise<void> => {
  if (!params.existingEvent) return;
  const existingEventType = normalizeUpsertEventType(
    params.existingEvent.eventType,
  );
  const incomingEventType = normalizeUpsertEventType(
    params.payload.eventType ?? params.existingEvent.eventType,
  );
  const existingTeamSignup = Boolean(params.existingEvent.teamSignup);
  const incomingTeamSignup = resolveEventUpsertTeamSignup(
    params.payload,
    params.existingEvent,
  );

  const eventRegistrationsDelegate = (params.client as any)
    .eventRegistrations;
  const hasAcceptedParticipant =
    typeof eventRegistrationsDelegate?.findFirst === "function"
      ? await hasJoinedEventParticipant(params.id, params.client)
      : false;
  const hasProtectedHistory = await hasProtectedEventHistory(
    params.id,
    params.client,
  );
  if (hasAcceptedParticipant || hasProtectedHistory) {
    if (incomingEventType !== existingEventType) {
      throw new EventRegistrationStructureLockedError("eventType");
    }
  }
  if (hasAcceptedParticipant && incomingTeamSignup !== existingTeamSignup) {
    throw new EventRegistrationStructureLockedError("teamSignup");
  }
};

type EventUpsertOrganizationContext = {
  resolvedOrganizationId: string | null;
  resolvedHostId: string | null;
  organizationAccess: any;
  organizationStaffMembers: any[];
  organizationStaffInvites: any[];
};
const loadEventUpsertOrganizationAccess = async (
  client: PrismaLike,
  organizationId: string | null,
) =>
  organizationId
    ? client.organizations.findUnique({
        where: { id: organizationId },
        select: {
          ownerId: true,
          coordinates: true,
          enabledFeatures: true,
        } as any,
      })
    : null;

const loadEventUpsertStaffMembers = async (
  client: PrismaLike,
  organizationId: string | null,
) => {
  if (!organizationId || !client.staffMembers?.findMany) return [];
  return client.staffMembers.findMany({
    where: { organizationId },
    select: {
      organizationId: true,
      userId: true,
      types: true,
    },
  });
};

const loadEventUpsertStaffInvites = async (
  client: PrismaLike,
  organizationId: string | null,
) => {
  if (!organizationId || !client.invites?.findMany) return [];
  return client.invites.findMany({
    where: { organizationId, type: "STAFF" },
    select: {
      organizationId: true,
      userId: true,
      type: true,
      status: true,
    },
  });
};


const loadEventUpsertOrganizationContext = async (params: {
  payload: any;
  existingEvent: any;
  client: PrismaLike;
}): Promise<EventUpsertOrganizationContext> => {
  const resolvedOrganizationId =
    normalizeEntityId(params.payload.organizationId) ??
    normalizeEntityId(params.existingEvent?.organizationId);
  const resolvedHostId =
    normalizeEntityId(params.payload.hostId) ??
    normalizeEntityId(params.existingEvent?.hostId);
  const organizationAccess = await loadEventUpsertOrganizationAccess(
    params.client,
    resolvedOrganizationId,
  );
  const organizationStaffMembers = await loadEventUpsertStaffMembers(
    params.client,
    resolvedOrganizationId,
  );
  const organizationStaffInvites = await loadEventUpsertStaffInvites(
    params.client,
    resolvedOrganizationId,
  );
  return {
    resolvedOrganizationId,
    resolvedHostId,
    organizationAccess,
    organizationStaffMembers,
    organizationStaffInvites,
  };
};

const extractRequestedEventOfficialIds = (payload: any): string[] =>
  Array.isArray(payload.eventOfficials)
    ? Array.from(
        new Set(
          payload.eventOfficials
            .map((entry: unknown) =>
              entry && typeof entry === "object"
                ? normalizeEntityId((entry as Record<string, unknown>).userId)
                : null,
            )
            .filter((userId: string | null): userId is string =>
              Boolean(userId),
            ),
        ),
      )
    : [];

const resolveEventUpsertAssistantHostIds = (
  payload: any,
  existingEvent: any,
  preserveStaffState: boolean,
): string[] => {
  if (Object.prototype.hasOwnProperty.call(payload, "assistantHostIds")) {
    return ensureStringArray(payload.assistantHostIds);
  }
  if (preserveStaffState) {
    return ensureStringArray(existingEvent?.assistantHostIds);
  }
  return [];
};

const resolveEventUpsertOrganizationAssignments = (params: {
  payload: any;
  organization: EventUpsertOrganizationContext;
  assistantHostIds: string[];
  officialIds: string[];
}) => {
  if (!params.organization.resolvedOrganizationId) return null;
  const organizationAccess = params.organization.organizationAccess
    ? {
        ...params.organization.organizationAccess,
        staffMembers: params.organization.organizationStaffMembers,
        staffInvites: params.organization.organizationStaffInvites,
      }
    : null;
  return sanitizeOrganizationEventAssignments(
    {
      hostId:
        params.payload.hostId ??
        params.organization.resolvedHostId ??
        null,
      assistantHostIds: params.assistantHostIds,
      officialIds: params.officialIds,
    },
    organizationAccess,
  );
};

const resolveEventUpsertNormalizedHostId = (
  organizationAssignments: any,
  requestedPayloadHostId: string | null,
  resolvedHostId: string | null,
): string =>
  organizationAssignments?.hostId ??
  requestedPayloadHostId ??
  resolvedHostId ??
  "";

const resolveEventUpsertAssignments = (params: {
  payload: any;
  existingEvent: any;
  organization: EventUpsertOrganizationContext;
  options: EventUpsertOptions;
}): {
  normalizedHostId: string;
  normalizedAssistantHostIds: string[];
  normalizedOfficialIds: string[];
} => {
  const assistantHostIds = resolveEventUpsertAssistantHostIds(
    params.payload,
    params.existingEvent,
    params.options.preserveStaffState === true,
  );
  const requestedPayloadHostId = normalizeEntityId(params.payload.hostId);
  const requestedEventOfficialIds = extractRequestedEventOfficialIds(
    params.payload,
  );
  const organizationAssignments = resolveEventUpsertOrganizationAssignments({
    payload: params.payload,
    organization: params.organization,
    assistantHostIds,
    officialIds: requestedEventOfficialIds,
  });
  return {
    normalizedHostId: resolveEventUpsertNormalizedHostId(
      organizationAssignments,
      requestedPayloadHostId,
      params.organization.resolvedHostId,
    ),
    normalizedAssistantHostIds: organizationAssignments
      ? organizationAssignments.assistantHostIds
      : assistantHostIds,
    normalizedOfficialIds: organizationAssignments
      ? organizationAssignments.officialIds
      : requestedEventOfficialIds,
  };
};

const resolveEventUpsertState = (params: {
  payload: any;
  existingEvent: any;
}) => {
  const normalizedState =
    normalizeUpsertEventType(params.payload.state) ??
    normalizeUpsertEventType(params.existingEvent?.state) ??
    "";
  const payloadIncludesAffiliateUrl = Object.prototype.hasOwnProperty.call(
    params.payload,
    "affiliateUrl",
  );
  const payloadAffiliateUrl =
    normalizeUpsertTrimmedString(params.payload.affiliateUrl);
  const existingAffiliateUrl = normalizeUpsertTrimmedString(
    params.existingEvent?.affiliateUrl,
  );
  const normalizedAffiliateUrl = payloadIncludesAffiliateUrl
    ? payloadAffiliateUrl
    : existingAffiliateUrl;
  const existingEventType = normalizeUpsertEventType(
    params.existingEvent?.eventType,
  );
  const payloadEventType = normalizeUpsertEventType(params.payload.eventType);
  return {
    normalizedState,
    isTemplateState: normalizedState === "TEMPLATE",
    normalizedAffiliateUrl,
    isAffiliateExternalEvent: normalizedAffiliateUrl.length > 0,
    existingEventType,
    payloadEventType,
    nextEventType: payloadEventType ?? existingEventType,
  };
};

const normalizeUpsertTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const resolveEventUpsertPayloadOrExisting = (
  payload: any,
  existingEvent: any,
  key: string,
): unknown =>
  Object.prototype.hasOwnProperty.call(payload, key)
    ? payload[key]
    : existingEvent?.[key];

const loadEventUpsertOfficialRows = async (
  client: PrismaLike,
  id: string,
  existingEvent: any,
) => (existingEvent ? loadEventOfficialRows(client, id) : []);

const loadEventUpsertSportRow = async (
  client: PrismaLike,
  primarySportId: string | null,
) => {
  if (!primarySportId) return null;
  const sportDelegate = (client as any).sports;
  if (typeof sportDelegate?.findUnique !== "function") return null;
  return sportDelegate.findUnique({
    where: { id: primarySportId },
    select: { officialPositionTemplates: true } as any,
  });
};

const loadEventUpsertSportContext = async (params: {
  payload: any;
  existingEvent: any;
  client: PrismaLike;
  id: string;
  nextEventType: string | null;
  resolvedOrganizationId: string | null;
  normalizedHostId: string;
}) => {
  const effectiveSportIds = normalizeEventSportIds(
    resolveEventUpsertPayloadOrExisting(
      params.payload,
      params.existingEvent,
      "sportIds",
    ),
  );
  validateEventSportIds({
    eventType: params.nextEventType ?? "EVENT",
    sportIds: effectiveSportIds,
  });
  await validateEventSportIdsExist(params.client, effectiveSportIds);
  const primarySportId = effectiveSportIds[0] ?? null;
  const [existingEventOfficialRows, sportRow] = await Promise.all([
    loadEventUpsertOfficialRows(
      params.client,
      params.id,
      params.existingEvent,
    ),
    loadEventUpsertSportRow(params.client, primarySportId),
  ]);
  const normalizedRegistrationPaymentMode =
    normalizeRegistrationPaymentMode(
      resolveEventUpsertPayloadOrExisting(
        params.payload,
        params.existingEvent,
        "registrationPaymentMode",
      ),
    );
  const isManualRegistrationPayment =
    normalizedRegistrationPaymentMode === "MANUAL";
  const normalizedManualPaymentLinks =
    normalizeManualPaymentLinksForPersistence(
      resolveEventUpsertPayloadOrExisting(
        params.payload,
        params.existingEvent,
        "manualPaymentLinks",
      ),
    );
  const normalizedManualPaymentInstructions =
    normalizeManualPaymentInstructions(
      resolveEventUpsertPayloadOrExisting(
        params.payload,
        params.existingEvent,
        "manualPaymentInstructions",
      ),
    );
  const billingOwnerHasStripeAccount =
    await resolveBillingOwnerHasStripeAccount(params.client, {
      organizationId: params.resolvedOrganizationId,
      hostId: params.normalizedHostId,
    });
  return {
    effectiveSportIds,
    primarySportId,
    existingEventOfficialRows,
    sportRow,
    normalizedRegistrationPaymentMode,
    isManualRegistrationPayment,
    normalizedManualPaymentLinks,
    normalizedManualPaymentInstructions,
    canPersistEventPricing:
      billingOwnerHasStripeAccount ||
      isManualRegistrationPayment ||
      normalizeUpsertTrimmedString(params.payload.affiliateUrl).length > 0,
  };
};

const normalizeUpsertPayloadFields = (payload: any): any[] =>
  Array.isArray(payload.fields)
    ? payload.fields.map((field: unknown) => {
        if (!field || typeof field !== "object" || Array.isArray(field)) {
          return field;
        }
        const fieldRecord = field as Record<string, unknown>;
        const fieldId =
          normalizeEntityId(fieldRecord.id) ??
          normalizeEntityId(fieldRecord.$id);
        return fieldId ? { ...fieldRecord, id: fieldId } : fieldRecord;
      })
    : [];

const resolveEventUpsertPayloadCoordinates = (
  payload: any,
): number[] | null =>
  Array.isArray(payload.coordinates)
    ? payload.coordinates.filter(
        (value: unknown): value is number => typeof value === "number",
      )
    : null;

const resolveEventUpsertPayloadTeams = (payload: any): any[] =>
  Array.isArray(payload.teams) ? payload.teams : [];

const resolveEventUpsertPayloadTimeSlots = (payload: any): any[] =>
  Array.isArray(payload.timeSlots) ? payload.timeSlots : [];

const buildEventUpsertCompatibilityDivisionMap = (
  teams: any[],
): Record<string, string | null> =>
  Object.fromEntries(
    teams
      .map((team: any) => {
        const registrantId = normalizeEntityId(team?.id);
        const divisionId = normalizeEntityId(
          team?.divisionId ??
            (typeof team?.division === "object"
              ? team.division?.id
              : team?.division),
        );
        return registrantId
          ? ([registrantId, divisionId] as [string, string | null])
          : null;
      })
      .filter(
        (
          entry: [string, string | null] | null,
        ): entry is [string, string | null] => Boolean(entry),
      ),
  );

const resolveEventUpsertLocationContext = (params: {
  payload: any;
  existingEvent: any;
  organizationAccess: any;
}) => {
  const fields = normalizeUpsertPayloadFields(params.payload);
  const eventLocation =
    (resolveEventUpsertPayloadOrExisting(
      params.payload,
      params.existingEvent,
      "location",
    ) as string | null) ?? "";
  const payloadCoordinates = resolveEventUpsertPayloadCoordinates(
    params.payload,
  );
  const existingEventTimeZone = resolveTimeZone(
    params.existingEvent?.timeZone,
    DEFAULT_EVENT_TIME_ZONE,
  );
  const coordinateTimeZone = resolveTimeZoneFromCoordinates(
    payloadCoordinates ??
      params.existingEvent?.coordinates ??
      params.organizationAccess?.coordinates,
    existingEventTimeZone,
  );
  const eventTimeZone = payloadCoordinates
    ? coordinateTimeZone
    : resolveTimeZone(params.payload.timeZone, coordinateTimeZone);
  const defaultFieldLocation = normalizeOptionalText(eventLocation);
  const teams = resolveEventUpsertPayloadTeams(params.payload);
  const compatibilityDivisionIdByRegistrantId =
    buildEventUpsertCompatibilityDivisionMap(teams);
  const timeSlots = resolveEventUpsertPayloadTimeSlots(params.payload);
  return {
    fields,
    eventLocation,
    payloadCoordinates,
    eventTimeZone,
    defaultFieldLocation,
    teams,
    compatibilityDivisionIdByRegistrantId,
    timeSlots,
  };
};

const loadEventUpsertTimeSlotContext = async (params: {
  client: PrismaLike;
  fields: any[];
  timeSlots: any[];
  organizationAccess: any;
  eventTimeZone: string;
}) => {
  const payloadFieldById = new Map<string, Record<string, unknown>>();
  for (const field of params.fields) {
    const fieldId =
      typeof field?.id === "string" && field.id.trim().length > 0
        ? field.id.trim()
        : "";
    if (fieldId) payloadFieldById.set(fieldId, field);
  }
  const rawTimeSlotFieldIds = normalizeFieldIds(
    params.timeSlots.flatMap((slot: Record<string, unknown>) =>
      normalizeTimeSlotFieldIds(slot),
    ),
  );
  const persistedSlotFields =
    rawTimeSlotFieldIds.length &&
    typeof (params.client as any).fields?.findMany === "function"
      ? await (params.client as any).fields.findMany({
          where: { id: { in: rawTimeSlotFieldIds } },
          select: { id: true, lat: true, long: true, organizationId: true },
        })
      : [];
  const persistedSlotFieldById = new Map<string, Record<string, unknown>>(
    (persistedSlotFields as Array<Record<string, unknown>>).map((field) => [
      String(field.id),
      field,
    ]),
  );
  const timeSlotsWithResolvedTimeZones = params.timeSlots.map(
    (slot: Record<string, unknown>) => {
      const scheduledFieldIds = normalizeTimeSlotFieldIds(slot);
      const primaryFieldId = scheduledFieldIds[0] ?? null;
      const primaryField = primaryFieldId
        ? (payloadFieldById.get(primaryFieldId) ??
          persistedSlotFieldById.get(primaryFieldId) ??
          null)
        : null;
      return {
        ...slot,
        timeZone: resolveTimeZoneFromFieldOrOrganization(
          primaryField,
          params.organizationAccess,
          params.eventTimeZone,
        ),
      };
    },
  );
  return { timeSlotsWithResolvedTimeZones };
};
const normalizeEventUpsertDivisionBilling = (
  detail: DivisionDetailPayload,
  canPersistEventPricing: boolean,
  isManualRegistrationPayment: boolean,
): DivisionDetailPayload => {
  if (canPersistEventPricing && !isManualRegistrationPayment) return detail;
  return {
    ...detail,
    price: canPersistEventPricing
      ? detail.price
      : detail.kind === "PLAYOFF"
        ? null
        : 0,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
  };
};

const resolveEventUpsertIncludePlayoffs = (payload: any): boolean =>
  coerceBoolean(
    Object.prototype.hasOwnProperty.call(payload, "includePlayoffsOrPools")
      ? payload.includePlayoffsOrPools
      : payload.includePlayoffs,
    false,
  );

const resolveEventUpsertDivisionDetails = (params: {
  payload: any;
  id: string;
  primarySportId: string | null;
  nextEventType: string | null;
  canPersistEventPricing: boolean;
  isManualRegistrationPayment: boolean;
}) => {
  const isBracketEvent = params.nextEventType === "LEAGUE" || params.nextEventType === "TOURNAMENT";
  const normalizeDivisionBilling = (detail: DivisionDetailPayload) =>
    normalizeEventUpsertDivisionBilling(
      detail,
      params.canPersistEventPricing,
      params.isManualRegistrationPayment,
    );
  const normalizedDivisionDetails = normalizeDivisionDetailsPayload(
    params.payload.divisionDetails,
    params.id,
    params.primarySportId,
    "LEAGUE",
  )
    .filter((detail) => isBracketEvent || detail.kind !== "PLAYOFF")
    .map(normalizeDivisionBilling);
  const normalizedPlayoffDivisionDetails = isBracketEvent
    ? normalizeDivisionDetailsPayload(
      params.payload.playoffDivisionDetails,
      params.id,
      params.primarySportId,
      "PLAYOFF",
    ).map(normalizeDivisionBilling)
    : [];
  const payloadDivisionIds = normalizeDivisionIdentifierList(
    params.payload.divisions,
    params.id,
  );
  const divisionIdsFromDetails = normalizedDivisionDetails.map(
    (detail) => detail.id,
  );
  const fallbackDivisionIds = defaultDivisionKeysForSport(
    params.primarySportId,
  ).map((divisionKey) => buildDivisionId(params.id, divisionKey));
  const normalizedEventDivisionIds = payloadDivisionIds.length
    ? payloadDivisionIds
    : divisionIdsFromDetails.length
      ? divisionIdsFromDetails
      : fallbackDivisionIds;
  const singleDivisionEnabled = Boolean(params.payload.singleDivision);
  const includePlayoffsOrPools = isBracketEvent
    ? resolveEventUpsertIncludePlayoffs(params.payload)
    : false;
  const parsedPlayoffTeamCount = coerceNullableNumber(
    params.payload.playoffTeamCount,
  );
  const normalizedEventPlayoffTeamCount =
    !includePlayoffsOrPools ||
    (params.nextEventType !== "LEAGUE" &&
      params.nextEventType !== "TOURNAMENT")
      ? parsedPlayoffTeamCount ?? null
      : resolveLeaguePlayoffTeamCount(
          parsedPlayoffTeamCount,
          `Playoff team count must be at least ${MIN_BRACKET_TEAM_COUNT} when playoffs are enabled.`,
        );
  const isTournamentPoolPlay = isBracketEvent && isTournamentPoolPlayEnabled({
    eventType: params.payload.eventType,
    includePlayoffs: includePlayoffsOrPools,
  });
  return {
    normalizedDivisionDetails,
    normalizedPlayoffDivisionDetails,
    normalizedEventDivisionIds,
    singleDivisionEnabled,
    includePlayoffsOrPools,
    normalizedEventPlayoffTeamCount,
    isTournamentPoolPlay,
  };
};

const canonicalizeEventUpsertTimeSlots = (params: {
  isAffiliateExternalEvent: boolean;
  eventId: string;
  timeSlotsWithResolvedTimeZones: any[];
  start: Date;
  eventTimeZone: string;
  normalizedEventDivisionIds: string[];
  singleDivisionEnabled: boolean;
  isTournamentPoolPlay: boolean;
}) =>
  params.isAffiliateExternalEvent
    ? []
    : canonicalizeTimeSlots({
        eventId: params.eventId,
        slots: params.timeSlotsWithResolvedTimeZones,
        fallbackStartDate: params.start,
        timeZone: params.eventTimeZone,
        fallbackDivisionKeys: params.normalizedEventDivisionIds,
        enforceAllDivisions:
          params.singleDivisionEnabled && !params.isTournamentPoolPlay,
        normalizeDivisions: (value) =>
          normalizeDivisionIdentifierList(value, params.eventId),
      });

const resolveEventUpsertFieldIds = (params: {
  payload: any;
  fields: any[];
  existingFieldIds: string[];
  canonicalTimeSlots: any[];
  isAffiliateExternalEvent: boolean;
  isTemplateState: boolean;
  payloadEventType: string | null;
}): { fieldIds: string[]; payloadLocalFieldIds: any[] } => {
  const slotFieldIds = normalizeFieldIds(
    params.canonicalTimeSlots.flatMap((slot) => slot.scheduledFieldIds),
  );
  const hasPayloadFieldIds = Array.isArray(params.payload.fieldIds);
  const payloadLocalFieldIds = params.fields
    .map((field: any) => field.id)
    .filter(Boolean);
  const fieldIds = slotFieldIds.length
    ? slotFieldIds
    : hasPayloadFieldIds
      ? normalizeFieldIds(params.payload.fieldIds)
      : payloadLocalFieldIds.length
        ? normalizeFieldIds(payloadLocalFieldIds)
        : params.existingFieldIds;
  if (
    !params.isAffiliateExternalEvent &&
    !params.isTemplateState &&
    requiresScheduledFields(params.payloadEventType) &&
    fieldIds.length === 0
  ) {
    throw new Error(EVENT_FIELDS_REQUIRED_MESSAGE);
  }
  return { fieldIds, payloadLocalFieldIds };
};

const resolveEventUpsertOfficialPositions = (params: {
  payload: any;
  id: string;
  existingEvent: any;
  existingEventOfficialRows: any[];
  normalizedOfficialIds: string[];
  sportRow: any;
}) => {
  const hasExplicitOfficialPositions = Object.prototype.hasOwnProperty.call(
    params.payload,
    "officialPositions",
  );
  const sportTemplatePositions = buildEventOfficialPositionsFromTemplates(
    params.id,
    normalizeSportOfficialPositionTemplates(
      params.sportRow?.officialPositionTemplates,
    ),
  );
  let resolvedOfficialPositions = normalizeEventOfficialPositions(
    hasExplicitOfficialPositions
      ? params.payload.officialPositions
      : params.existingEvent?.officialPositions,
    params.id,
  );
  if (!resolvedOfficialPositions.length) {
    resolvedOfficialPositions = sportTemplatePositions;
  }
  if (
    !resolvedOfficialPositions.length &&
    (params.normalizedOfficialIds.length ||
      params.existingEventOfficialRows.length)
  ) {
    resolvedOfficialPositions = buildEventOfficialPositionsFromTemplates(
      params.id,
      [{ name: "Official", count: 1 }],
    );
  }
  return resolvedOfficialPositions;
};
const collectEventUpsertOfficialPositionIds = (
  resolvedOfficialPositions: EventOfficialPosition[],
  divisionDetails: DivisionDetailPayload[],
): string[] => {
  const phasePositionIds = divisionDetails.flatMap((detail) =>
    Object.values(detail.phaseSettings ?? {}).flatMap(
      (settings) => settings?.officialPositions?.map((position) => position.id) ?? [],
    ),
  );
  return Array.from(
    new Set([...resolvedOfficialPositions.map((position) => position.id), ...phasePositionIds]),
  );
};

const buildEventUpsertExistingOfficials = (
  rows: any[],
  validPositionIdSet: Set<string>,
  validFieldIdSet: Set<string>,
) =>
  rows
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      positionIds: ensureStringArray(row.positionIds).filter((positionId) =>
        validPositionIdSet.has(positionId),
      ),
      fieldIds: ensureStringArray(row.fieldIds).filter((fieldId) =>
        validFieldIdSet.has(fieldId),
      ),
      isActive: row.isActive !== false,
    }))
    .filter((row: any) => row.positionIds.length > 0);

const resolveEventUpsertOfficials = (params: {
  payload: any;
  id: string;
  fieldIds: string[];
  existingEvent: any;
  existingEventOfficialRows: any[];
  normalizedOfficialIds: string[];
  sportRow: any;
  divisionDetails: DivisionDetailPayload[];
}) => {
  const resolvedOfficialPositions = resolveEventUpsertOfficialPositions(params);
  const hasExplicitEventOfficials = Object.prototype.hasOwnProperty.call(
    params.payload,
    "eventOfficials",
  );
  const validOfficialPositionIds = collectEventUpsertOfficialPositionIds(
    resolvedOfficialPositions,
    params.divisionDetails,
  );
  const validPositionIdSet = new Set(validOfficialPositionIds);
  const validFieldIdSet = new Set(params.fieldIds);
  const existingEventOfficials = buildEventUpsertExistingOfficials(
    params.existingEventOfficialRows,
    validPositionIdSet,
    validFieldIdSet,
  );
  const allowedEventOfficialUserIds = hasExplicitEventOfficials
    ? params.normalizedOfficialIds
    : existingEventOfficials.map((row: any) => row.userId);
  const eventOfficialsInput = hasExplicitEventOfficials
    ? filterEventOfficialsByUserIds(
        params.payload.eventOfficials,
        allowedEventOfficialUserIds,
      )
    : params.payload.eventOfficials;
  const resolvedEventOfficials = hasExplicitEventOfficials
    ? normalizeEventOfficials(eventOfficialsInput, {
        eventId: params.id,
        positionIds: validOfficialPositionIds,
        fieldIds: params.fieldIds,
      })
    : existingEventOfficials.length
      ? existingEventOfficials
      : [];
  return {
    hasExplicitEventOfficials,
    resolvedOfficialPositions,
    existingEventOfficials,
    resolvedEventOfficials,
  };
};

const loadEventUpsertFieldOwnership = async (params: {
  client: PrismaLike;
  fieldsToPersistIds: string[];
  fieldIds: string[];
  hasExplicitFieldResourcePayload: boolean;
  existingEvent: any;
}) => {
  const fieldsToInspect = Array.from(
    new Set([...params.fieldsToPersistIds, ...params.fieldIds]),
  );
  const existingFieldOwnershipById = new Map<
    string,
    { organizationId: string | null; createdBy: string | null }
  >();
  if (
    fieldsToInspect.length &&
    typeof (params.client as any).fields?.findMany === "function"
  ) {
    const existingFields = await (params.client as any).fields.findMany({
      where: { id: { in: fieldsToInspect } },
      select: { id: true, organizationId: true, createdBy: true },
    });
    for (const row of existingFields as Array<{
      id: string;
      organizationId?: string | null;
      createdBy?: string | null;
    }>) {
      existingFieldOwnershipById.set(row.id, {
        organizationId: normalizeEntityId(row.organizationId) ?? null,
        createdBy: normalizeEntityId(row.createdBy) ?? null,
      });
    }
  }
  if (params.hasExplicitFieldResourcePayload || !params.existingEvent) {
    const payloadFieldIdSet = new Set(params.fieldsToPersistIds);
    const missingFieldIds = params.fieldIds.filter(
      (fieldId) =>
        !existingFieldOwnershipById.has(fieldId) &&
        !payloadFieldIdSet.has(fieldId),
    );
    if (missingFieldIds.length) {
      throw new EventFieldReferenceError(missingFieldIds);
    }
  }
  return { fieldsToInspect, existingFieldOwnershipById };
};

const normalizeUpsertTeamText = (value: unknown): string =>
  String(value ?? "").trim();

const isUpsertPlaceholderTeam = (team: any): boolean => {
  const id = normalizeEntityId(team?.id);
  if (!id) return false;
  const kind = normalizeUpsertTeamText(team?.kind).toUpperCase();
  const captainId = normalizeUpsertTeamText(team?.captainId);
  const parentTeamId = normalizeEntityId(team?.parentTeamId);
  const name = normalizeUpsertTeamText(team?.name).toLowerCase();
  return (
    kind === "PLACEHOLDER" ||
    (!parentTeamId && !captainId && name.startsWith("place holder"))
  );
};

const resolveEventUpsertTeamIds = (payload: any, teams: any[]): string[] =>
  Array.isArray(payload.teamIds) && payload.teamIds.length
    ? payload.teamIds
    : teams.map((team: any) => team.id).filter(Boolean);

const resolveEventUpsertPlaceholderTeamIds = (teams: any[]): string[] =>
  teams
    .filter(isUpsertPlaceholderTeam)
    .map((team: any) => team.id)
    .filter(
      (id: unknown): id is string => typeof id === "string" && id.length > 0,
    );

const resolveEventUpsertTimeSlotIds = (
  payload: any,
  canonicalTimeSlots: any[],
  isAffiliateExternalEvent: boolean,
): string[] => {
  if (isAffiliateExternalEvent) return [];
  const derivedTimeSlotIds = canonicalTimeSlots
    .map((slot) => slot.id)
    .filter(Boolean);
  if (derivedTimeSlotIds.length) return derivedTimeSlotIds;
  return Array.isArray(payload.timeSlotIds) && payload.timeSlotIds.length
    ? payload.timeSlotIds
    : [];
};

const resolveEventUpsertTeamAndSlotIds = (params: {
  payload: any;
  teams: any[];
  canonicalTimeSlots: any[];
  isAffiliateExternalEvent: boolean;
}) => {
  const teamIds = resolveEventUpsertTeamIds(params.payload, params.teams);
  const placeholderTeamIds = resolveEventUpsertPlaceholderTeamIds(params.teams);
  const timeSlotIds = resolveEventUpsertTimeSlotIds(
    params.payload,
    params.canonicalTimeSlots,
    params.isAffiliateExternalEvent,
  );
  return { teamIds, placeholderTeamIds, timeSlotIds };
};
const assertEventUpsertTryoutDivisions = async (params: {
  nextEventType: string | null;
  resolvedOrganizationId: string | null;
  organizationAccess: any;
  singleDivisionEnabled: boolean;
  normalizedDivisionDetails: DivisionDetailPayload[];
  client: PrismaLike;
}): Promise<void> => {
  if (params.nextEventType !== "TRYOUT") return;
  if (!params.resolvedOrganizationId || !params.organizationAccess) {
    throw new Error("Tryout events must belong to an organization.");
  }
  const enabledFeatures = ensureStringArray(
    params.organizationAccess.enabledFeatures,
  );
  if (!enabledFeatures.includes("CLUB_TEAMS")) {
    throw new Error(
      "Enable club and team features before creating tryout events.",
    );
  }
  if (params.singleDivisionEnabled) {
    throw new Error("Tryout events must use their selected club divisions.");
  }
  if (
    !params.normalizedDivisionDetails.length ||
    params.normalizedDivisionDetails.some((detail) => !detail.sourceDivisionId)
  ) {
    throw new Error("Select at least one club division for this tryout.");
  }
  const sourceDivisionIds = Array.from(
    new Set(
      params.normalizedDivisionDetails
        .map((detail) => detail.sourceDivisionId)
        .filter((divisionId): divisionId is string => Boolean(divisionId)),
    ),
  );
  const sourceDivisions = await params.client.divisions.findMany({
    where: {
      id: { in: sourceDivisionIds },
      organizationId: params.resolvedOrganizationId,
      scope: "ORGANIZATION",
      status: { not: "ARCHIVED" },
    } as any,
    select: { id: true },
  });
  if (sourceDivisions.length !== sourceDivisionIds.length) {
    throw new Error("One or more selected club divisions are unavailable.");
  }
};
const resolveEventUpsertAutomatedScheduling = (
  payload: any,
  existingEvent: any,
  nextEventType: string | null,
) =>
  normalizeAutomatedSchedulingForEventType(
    nextEventType,
    Object.prototype.hasOwnProperty.call(payload, "isAutomatedScheduling")
      ? payload.isAutomatedScheduling
      : Object.prototype.hasOwnProperty.call(payload, "automatedScheduling")
        ? payload.automatedScheduling
        : existingEvent?.automatedScheduling,
  );

const resolveEventUpsertSplitLeaguePlayoffDivisions = (params: {
  payload: any;
  payloadEventType: string | null;
  nextEventType: string | null;
  includePlayoffsOrPools: boolean;
}) =>
  params.payloadEventType === "LEAGUE"
    ? coerceBoolean(params.payload.splitLeaguePlayoffDivisions, false)
    : params.nextEventType === "TOURNAMENT" && params.includePlayoffsOrPools;

const resolveEventUpsertSchedulingFlags = (params: {
  payload: any;
  existingEvent: any;
  nextEventType: string | null;
  payloadEventType: string | null;
  includePlayoffsOrPools: boolean;
  isAffiliateExternalEvent: boolean;
}) => {
  const isAutomatedScheduling = resolveEventUpsertAutomatedScheduling(
    params.payload,
    params.existingEvent,
    params.nextEventType,
  );
  const normalizedParentEvent =
    normalizeEntityId(params.payload.parentEvent) ??
    normalizeEntityId(params.existingEvent?.parentEvent);
  const isWeeklyParent =
    params.nextEventType === "WEEKLY_EVENT" && !normalizedParentEvent;
  const supportsNoFixedEndDateTime =
    !params.isAffiliateExternalEvent &&
    (isWeeklyParent || isBracketEventType(params.nextEventType));
  const splitLeaguePlayoffDivisions =
    resolveEventUpsertSplitLeaguePlayoffDivisions(params);
  const shouldClearLeaguePlayoffDivisionMappings =
    params.nextEventType === "LEAGUE" &&
    Object.prototype.hasOwnProperty.call(
      params.payload,
      "splitLeaguePlayoffDivisions",
    ) &&
    !splitLeaguePlayoffDivisions;
  return {
    isAutomatedScheduling,
    normalizedParentEvent,
    isWeeklyParent,
    supportsNoFixedEndDateTime,
    splitLeaguePlayoffDivisions,
    shouldClearLeaguePlayoffDivisionMappings,
  };
};

const assertEventUpsertExplicitDate = (params: {
  field: string;
  included: boolean;
  value: unknown;
  parsed: Date | null;
}): void => {
  if (!params.included || params.value === null || params.value === undefined) {
    return;
  }
  if (typeof params.value === "string" && params.value.trim().length === 0) {
    throw new Error(`${params.field} must be a valid date/time.`);
  }
  if (!params.parsed || Number.isNaN(params.parsed.getTime())) {
    throw new Error(`${params.field} must be a valid date/time.`);
  }
};

const resolveEventUpsertParsedEnds = (params: {
  payload: any;
  existingEvent: any;
  eventTimeZone: string;
}) => {
  const payloadIncludesEnd = Object.prototype.hasOwnProperty.call(
    params.payload,
    "end",
  );
  const payloadIncludesScheduleEndConstraint =
    Object.prototype.hasOwnProperty.call(params.payload, "scheduleEndConstraint");
  const payloadIncludesGeneratedScheduleEnd =
    Object.prototype.hasOwnProperty.call(
      params.payload,
      "generatedScheduleEnd",
    );
  const payloadIncludesNoFixedEndDateTime = Object.prototype.hasOwnProperty.call(
    params.payload,
    "noFixedEndDateTime",
  );
  const parsedPayloadEnd = payloadIncludesEnd
    ? coerceDate(params.payload.end, params.eventTimeZone)
    : null;
  const parsedExistingEnd = coerceDate(
    params.existingEvent?.end,
    params.eventTimeZone,
  );
  const parsedPayloadScheduleEndConstraint =
    payloadIncludesScheduleEndConstraint
      ? coerceDate(
          params.payload.scheduleEndConstraint,
          params.eventTimeZone,
        )
      : null;
  const parsedPayloadGeneratedScheduleEnd =
    payloadIncludesGeneratedScheduleEnd
      ? coerceDate(params.payload.generatedScheduleEnd, params.eventTimeZone)
      : null;
  const parsedExistingScheduleEndConstraint = coerceDate(
    params.existingEvent?.scheduleEndConstraint,
    params.eventTimeZone,
  );
  const parsedExistingGeneratedScheduleEnd = coerceDate(
    params.existingEvent?.generatedScheduleEnd,
    params.eventTimeZone,
  );
  assertEventUpsertExplicitDate({
    field: "end",
    included: payloadIncludesEnd,
    value: params.payload.end,
    parsed: parsedPayloadEnd,
  });
  assertEventUpsertExplicitDate({
    field: "scheduleEndConstraint",
    included: payloadIncludesScheduleEndConstraint,
    value: params.payload.scheduleEndConstraint,
    parsed: parsedPayloadScheduleEndConstraint,
  });
  assertEventUpsertExplicitDate({
    field: "generatedScheduleEnd",
    included: payloadIncludesGeneratedScheduleEnd,
    value: params.payload.generatedScheduleEnd,
    parsed: parsedPayloadGeneratedScheduleEnd,
  });
  return {
    payloadIncludesEnd,
    payloadIncludesScheduleEndConstraint,
    payloadIncludesGeneratedScheduleEnd,
    payloadIncludesNoFixedEndDateTime,
    parsedPayloadEnd,
    parsedExistingEnd,
    parsedPayloadScheduleEndConstraint,
    parsedPayloadGeneratedScheduleEnd,
    parsedExistingScheduleEndConstraint,
    parsedExistingGeneratedScheduleEnd,
  };
};

const resolveEventUpsertNoFixedEndDateTime = (params: {
  payload: any;
  existingEvent: any;
  supportsNoFixedEndDateTime: boolean;
  hasExplicitScheduleMode: boolean;
  payloadIncludesNoFixedEndDateTime: boolean;
  parsedPayloadScheduleEndConstraint: Date | null;
  candidateEnd: Date | null;
}) => {
  const fallbackNoFixedEndDateTime = params.supportsNoFixedEndDateTime
    ? params.hasExplicitScheduleMode
      ? !params.parsedPayloadScheduleEndConstraint
      : !params.payloadIncludesNoFixedEndDateTime &&
          typeof params.existingEvent?.noFixedEndDateTime === "boolean"
        ? Boolean(params.existingEvent.noFixedEndDateTime)
        : params.candidateEnd === null
    : false;
  return params.supportsNoFixedEndDateTime
    ? params.hasExplicitScheduleMode
      ? !params.parsedPayloadScheduleEndConstraint
      : coerceBoolean(
          params.payload.noFixedEndDateTime,
          fallbackNoFixedEndDateTime,
        )
    : false;
};

const resolveEventUpsertScheduleEndConstraint = (params: {
  noFixedEndDateTime: boolean;
  parsedPayloadScheduleEndConstraint: Date | null;
  payloadIncludesScheduleEndConstraint: boolean;
  parsedExistingScheduleEndConstraint: Date | null;
  candidateEnd: Date | null;
}) => {
  if (params.noFixedEndDateTime) return null;
  if (params.parsedPayloadScheduleEndConstraint) {
    return params.parsedPayloadScheduleEndConstraint;
  }
  if (params.payloadIncludesScheduleEndConstraint) return null;
  return params.parsedExistingScheduleEndConstraint ?? params.candidateEnd;
};

const resolveEventUpsertGeneratedScheduleEnd = (params: {
  noFixedEndDateTime: boolean;
  isWeeklyParent: boolean;
  parsedPayloadGeneratedScheduleEnd: Date | null;
  payloadIncludesGeneratedScheduleEnd: boolean;
  parsedExistingGeneratedScheduleEnd: Date | null;
  parsedExistingEnd: Date | null;
  candidateEnd: Date | null;
}) => {
  if (!params.noFixedEndDateTime || params.isWeeklyParent) return null;
  if (params.parsedPayloadGeneratedScheduleEnd) {
    return params.parsedPayloadGeneratedScheduleEnd;
  }
  if (params.payloadIncludesGeneratedScheduleEnd) return null;
  return (
    params.parsedExistingGeneratedScheduleEnd ??
    params.parsedExistingEnd ??
    params.candidateEnd
  );
};

const resolveEventUpsertScheduleEnds = (params: {
  noFixedEndDateTime: boolean;
  isWeeklyParent: boolean;
  parsedPayloadGeneratedScheduleEnd: Date | null;
  payloadIncludesGeneratedScheduleEnd: boolean;
  parsedExistingGeneratedScheduleEnd: Date | null;
  parsedExistingScheduleEndConstraint: Date | null;
  parsedExistingEnd: Date | null;
  candidateEnd: Date | null;
  parsedPayloadScheduleEndConstraint: Date | null;
  payloadIncludesScheduleEndConstraint: boolean;
}) => {
  const scheduleEndConstraint = resolveEventUpsertScheduleEndConstraint(params);
  const generatedScheduleEnd = resolveEventUpsertGeneratedScheduleEnd(params);
  return {
    scheduleEndConstraint,
    generatedScheduleEnd,
    normalizedEnd: params.noFixedEndDateTime
      ? generatedScheduleEnd
      : scheduleEndConstraint,
  };
};
const assertEventUpsertScheduling = async (params: {
  isAffiliateExternalEvent: boolean;
  isTemplateState: boolean;
  isWeeklyParent: boolean;
  canonicalTimeSlots: any[];
  eventTimeZone: string;
  start: Date;
  noFixedEndDateTime: boolean;
  normalizedEnd: Date | null;
  fieldIds: string[];
  normalizedEventDivisionIds: string[];
  client: PrismaLike;
  id: string;
  timeSlotIds: string[];
  resolvedOrganizationId: string | null;
  nextEventType: string | null;
  normalizedParentEvent: string | null;
}): Promise<void> => {
  if (params.nextEventType === "TRYOUT" && params.noFixedEndDateTime) {
    throw new Error("Tryout events require a Planned End.");
  }
  if (
    !params.isAffiliateExternalEvent &&
    !params.isTemplateState &&
    params.isWeeklyParent &&
    !hasWeeklyRepeatingTimeSlot(params.canonicalTimeSlots)
  ) {
    throw new Error(WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE);
  }
  if (!params.isAffiliateExternalEvent) {
    assertValidOneTimeTimeSlots({
      slots: params.canonicalTimeSlots,
      fallbackTimeZone: params.eventTimeZone,
      eventStart: params.start,
      eventEnd: params.noFixedEndDateTime ? null : params.normalizedEnd,
      eligibleResourceIds: params.fieldIds,
      eligibleDivisionIds: params.normalizedEventDivisionIds,
    });
    assertRepeatingTimeSlotsResolvable({
      slots: params.canonicalTimeSlots,
      eventStart: params.start,
      eventEnd: params.noFixedEndDateTime ? null : params.normalizedEnd,
    });
    await reserveRentalBookingSlotsForEvent(
      params.client,
      params.id,
      params.canonicalTimeSlots,
    );
  }
  if (!params.isAffiliateExternalEvent && params.normalizedEnd) {
    await assertNoEventFieldSchedulingConflicts({
      client: params.client,
      eventId: params.id,
      organizationId: params.resolvedOrganizationId,
      fieldIds: params.fieldIds,
      timeSlotIds: params.timeSlotIds,
      start: params.start,
      end: params.normalizedEnd,
      noFixedEndDateTime: params.noFixedEndDateTime,
      eventType: params.nextEventType,
      parentEvent: params.normalizedParentEvent,
    });
  }
};
const normalizeUpsertOptionalId = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
const resolveEventUpsertLeagueScoringIdentity = (
  normalizedConfig: { id?: string; data?: Record<string, unknown> } | null,
  fallbackId: string | null,
) => ({
  id: normalizedConfig?.id ?? fallbackId ?? crypto.randomUUID(),
  data: normalizedConfig?.data ?? {},
});


const resolveEventUpsertLeagueScoringConfigId = async (params: {
  payload: any;
  existingEvent: any;
  client: PrismaLike;
  nextEventType: string | null;
  isAffiliateExternalEvent: boolean;
}): Promise<string | null> => {
  const normalizedLeagueScoringConfig = normalizeLeagueScoringConfigPayload(
    params.payload.leagueScoringConfig,
  );
  const payloadLeagueScoringConfigId = normalizeUpsertOptionalId(
    params.payload.leagueScoringConfigId,
  );
  const existingLeagueScoringConfigId = normalizeUpsertOptionalId(
    params.existingEvent?.leagueScoringConfigId,
  );
  const fallbackId =
    payloadLeagueScoringConfigId ?? existingLeagueScoringConfigId ?? null;
  if (params.isAffiliateExternalEvent || params.nextEventType !== "LEAGUE") {
    return null;
  }
  const {
    id: leagueScoringConfigId,
    data: leagueScoringData,
  } = resolveEventUpsertLeagueScoringIdentity(
    normalizedLeagueScoringConfig,
    fallbackId,
  );
  const now = new Date();
  await params.client.leagueScoringConfigs.upsert({
    where: { id: leagueScoringConfigId },
    create: {
      id: leagueScoringConfigId,
      ...leagueScoringData,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      ...leagueScoringData,
      updatedAt: now,
    },
  });
  return leagueScoringConfigId;
};

const resolveEventUpsertEventPrice = (
  payload: any,
  canPersistEventPricing: boolean,
): number => {
  if (!canPersistEventPricing) return 0;
  const parsed = coerceNullableNumber(payload.price);
  return typeof parsed === "number"
    ? Math.max(0, Math.round(parsed))
    : 0;
};

const resolveEventUpsertInstallmentFields = (params: {
  payload: any;
  canPersistEventPricing: boolean;
  isAffiliateExternalEvent: boolean;
  isManualRegistrationPayment: boolean;
  isWeeklyParent: boolean;
  eventTimeZone: string;
}) => {
  const canPersistInstallments =
    params.canPersistEventPricing &&
    !params.isAffiliateExternalEvent &&
    !params.isManualRegistrationPayment;
  if (!canPersistInstallments) {
    return {
      normalizedEventAllowPaymentPlans: false,
      normalizedEventInstallmentCount: 0,
      normalizedEventInstallmentDueDates: [],
      normalizedEventInstallmentDueRelativeDays: [],
      normalizedEventInstallmentAmounts: [],
    };
  }
  return {
    normalizedEventAllowPaymentPlans:
      params.payload.allowPaymentPlans ?? null,
    normalizedEventInstallmentCount: params.payload.installmentCount ?? null,
    normalizedEventInstallmentDueDates: params.isWeeklyParent
      ? []
      : (ensureArray(params.payload.installmentDueDates)
          .map((value) => coerceDate(value, params.eventTimeZone))
          .filter(Boolean) as Date[]),
    normalizedEventInstallmentDueRelativeDays: params.isWeeklyParent
      ? normalizeInstallmentRelativeDayList(
          params.payload.installmentDueRelativeDays,
        )
      : [],
    normalizedEventInstallmentAmounts: ensureNumberArray(
      params.payload.installmentAmounts,
    ),
  };
};

const resolveEventUpsertEventPricing = (params: {
  payload: any;
  canPersistEventPricing: boolean;
  isAffiliateExternalEvent: boolean;
  isManualRegistrationPayment: boolean;
  isWeeklyParent: boolean;
  eventTimeZone: string;
}) => ({
  normalizedEventPrice: resolveEventUpsertEventPrice(
    params.payload,
    params.canPersistEventPricing,
  ),
  ...resolveEventUpsertInstallmentFields(params),
});

const resolveEventUpsertDivisionInstallmentFields = (params: {
  payload: any;
  canPersistEventPricing: boolean;
  isAffiliateExternalEvent: boolean;
  isManualRegistrationPayment: boolean;
  isWeeklyParent: boolean;
}) => {
  const canPersistInstallments =
    params.canPersistEventPricing &&
    !params.isAffiliateExternalEvent &&
    !params.isManualRegistrationPayment;
  if (!canPersistInstallments) {
    return {
      defaultDivisionAllowPaymentPlans: false,
      defaultDivisionInstallmentCount: 0,
      defaultDivisionInstallmentDueDates: [],
      defaultDivisionInstallmentDueRelativeDays: [],
      defaultDivisionInstallmentAmounts: [],
    };
  }
  const parsedAllowPaymentPlans = coerceNullableBoolean(
    params.payload.allowPaymentPlans,
  );
  const parsedInstallmentCount = coerceNullableNumber(
    params.payload.installmentCount,
  );
  return {
    defaultDivisionAllowPaymentPlans:
      typeof parsedAllowPaymentPlans === "boolean"
        ? parsedAllowPaymentPlans
        : (parsedAllowPaymentPlans ?? null),
    defaultDivisionInstallmentCount:
      typeof parsedInstallmentCount === "number"
        ? Math.max(0, Math.trunc(parsedInstallmentCount))
        : (parsedInstallmentCount ?? null),
    defaultDivisionInstallmentDueDates: params.isWeeklyParent
      ? []
      : normalizeInstallmentDateList(params.payload.installmentDueDates),
    defaultDivisionInstallmentDueRelativeDays: params.isWeeklyParent
      ? normalizeInstallmentRelativeDayList(
          params.payload.installmentDueRelativeDays,
        )
      : [],
    defaultDivisionInstallmentAmounts: normalizeInstallmentAmountList(
      params.payload.installmentAmounts,
    ),
  };
};

const resolveEventUpsertDivisionPricingDefaults = (params: {
  payload: any;
  canPersistEventPricing: boolean;
  isAffiliateExternalEvent: boolean;
  isManualRegistrationPayment: boolean;
  isWeeklyParent: boolean;
  normalizedEventPrice: number;
  normalizedEventMaxParticipants: number | null;
  normalizedEventPlayoffTeamCount: number | null;
}) => {
  const parsedPrice = params.canPersistEventPricing
    ? params.normalizedEventPrice
    : 0;
  const defaultDivisionMaxParticipants =
    typeof params.normalizedEventMaxParticipants === "number"
      ? Math.max(0, Math.trunc(params.normalizedEventMaxParticipants))
      : params.normalizedEventMaxParticipants;
  return {
    defaultDivisionPrice: parsedPrice,
    defaultDivisionMaxParticipants,
    defaultDivisionPlayoffTeamCount: params.normalizedEventPlayoffTeamCount,
    ...resolveEventUpsertDivisionInstallmentFields(params),
  };
};

const resolveEventUpsertStaffingPriority = (params: {
  payload: any;
  existingEvent: any;
  isAffiliateExternalEvent: boolean;
  hasLegacyOfficialSchedulingModeInput: boolean;
}) => {
  if (params.isAffiliateExternalEvent) {
    return "FULL_COVERAGE_WITH_CONFLICTS_ALLOWED";
  }
  const staffingPriorityInput =
    params.payload.staffingPriority ??
    (params.hasLegacyOfficialSchedulingModeInput
      ? undefined
      : params.existingEvent?.staffingPriority);
  const officialSchedulingModeInput =
    params.hasLegacyOfficialSchedulingModeInput
      ? params.payload.officialSchedulingMode
      : params.existingEvent?.officialSchedulingMode;
  return normalizeStaffingPriority(
    staffingPriorityInput,
    officialSchedulingModeInput,
  );
};

const resolveEventUpsertDoTeamsOfficiate = (params: {
  payload: any;
  existingEvent: any;
  isAffiliateExternalEvent: boolean;
}) => {
  const requestedDoTeamsOfficiate = coerceNullableBoolean(
    resolveEventUpsertPayloadOrExisting(
      params.payload,
      params.existingEvent,
      "doTeamsOfficiate",
    ),
  );
  return params.isAffiliateExternalEvent
    ? false
    : requestedDoTeamsOfficiate;
};

const resolveEventUpsertNormalizedTeamSignup = (
  isAffiliateExternalEvent: boolean,
  normalizedTeamSignupInput: unknown,
  nextEventType: string | null,
): boolean =>
  isAffiliateExternalEvent || nextEventType === "TRYOUT"
    ? false
    : coerceBoolean(normalizedTeamSignupInput, true);

const resolveEventUpsertTeamCheckInMode = (
  payload: any,
  existingEvent: any,
  normalizedTeamSignup: any,
) => {
  const existingTeamCheckInMode = normalizeTeamCheckInMode(
    existingEvent?.teamCheckInMode,
  );
  if (!normalizedTeamSignup) return "OFF";
  return normalizeTeamCheckInMode(
    payload.teamCheckInMode,
    existingTeamCheckInMode,
  );
};

const resolveEventUpsertRosterEditFlags = (
  payload: any,
  existingEvent: any,
  normalizedTeamSignup: any,
) => {
  const normalizedAllowMatchRosterEdits = normalizedTeamSignup
    ? coerceBoolean(
        payload.allowMatchRosterEdits,
        Boolean(existingEvent?.allowMatchRosterEdits),
      )
    : false;
  const normalizedAllowTemporaryMatchPlayers =
    normalizedTeamSignup && normalizedAllowMatchRosterEdits
      ? coerceBoolean(
          payload.allowTemporaryMatchPlayers,
          Boolean(existingEvent?.allowTemporaryMatchPlayers),
        )
      : false;
  return {
    normalizedAllowMatchRosterEdits,
    normalizedAllowTemporaryMatchPlayers,
  };
};

const resolveEventUpsertStaffing = (params: {
  payload: any;
  existingEvent: any;
  isAffiliateExternalEvent: boolean;
  normalizedTeamSignupInput: unknown;
  nextEventType: string | null;
}) => {
  const hasLegacyOfficialSchedulingModeInput =
    Object.prototype.hasOwnProperty.call(params.payload, "officialSchedulingMode");
  const legacyOfficialSchedulingMode = normalizeOfficialSchedulingMode(
    params.payload.officialSchedulingMode,
    normalizeOfficialSchedulingMode(params.existingEvent?.officialSchedulingMode),
  );
  const staffingPriority = resolveEventUpsertStaffingPriority({
    payload: params.payload,
    existingEvent: params.existingEvent,
    isAffiliateExternalEvent: params.isAffiliateExternalEvent,
    hasLegacyOfficialSchedulingModeInput,
  });
  const normalizedDoTeamsOfficiate = params.nextEventType === "TRYOUT"
    ? false
    : resolveEventUpsertDoTeamsOfficiate({
      payload: params.payload,
      existingEvent: params.existingEvent,
      isAffiliateExternalEvent: params.isAffiliateExternalEvent,
    });
  const normalizedTeamOfficialsMaySwap =
    normalizedDoTeamsOfficiate === true
      ? coerceBoolean(params.payload.teamOfficialsMaySwap, false)
      : false;
  const normalizedTeamSignup = resolveEventUpsertNormalizedTeamSignup(
    params.isAffiliateExternalEvent,
    params.normalizedTeamSignupInput,
    params.nextEventType,
  );
  const normalizedTeamCheckInMode = resolveEventUpsertTeamCheckInMode(
    params.payload,
    params.existingEvent,
    normalizedTeamSignup,
  );
  const normalizedTeamCheckInOpenMinutesBefore = normalizeOpenMinutesBefore(
    params.payload.teamCheckInOpenMinutesBefore,
    normalizeOpenMinutesBefore(
      params.existingEvent?.teamCheckInOpenMinutesBefore,
    ),
  );
  const {
    normalizedAllowMatchRosterEdits,
    normalizedAllowTemporaryMatchPlayers,
  } = resolveEventUpsertRosterEditFlags(
    params.payload,
    params.existingEvent,
    normalizedTeamSignup,
  );
  return {
    hasLegacyOfficialSchedulingModeInput,
    legacyOfficialSchedulingMode,
    staffingPriority,
    normalizedDoTeamsOfficiate,
    normalizedTeamOfficialsMaySwap,
    normalizedTeamSignup,
    normalizedTeamCheckInMode,
    normalizedTeamCheckInOpenMinutesBefore,
    normalizedAllowMatchRosterEdits,
    normalizedAllowTemporaryMatchPlayers,
  };
};

const cloneEventUpsertMatchRulesObject = (value: any) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;

const resolveEventUpsertExistingMatchRulesOverride = (value: any) => {
  const cloned = cloneEventUpsertMatchRulesObject(value);
  if (cloned !== null) return cloned;
  return value === null ? null : undefined;
};

const resolveEventUpsertMatchRulesOverride = (params: {
  payload: any;
  existingEvent: any;
  isAffiliateExternalEvent: boolean;
  nextEventType: string | null;
}) => {
  if (
    params.isAffiliateExternalEvent ||
    (params.nextEventType !== "LEAGUE" && params.nextEventType !== "TOURNAMENT")
  ) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(params.payload, "matchRulesOverride")) {
    return cloneEventUpsertMatchRulesObject(params.payload.matchRulesOverride);
  }
  return resolveEventUpsertExistingMatchRulesOverride(
    params.existingEvent?.matchRulesOverride,
  );
};

const resolveEventUpsertMaxParticipants = (
  payload: any,
  nextEventType: string | null,
) => {
  const rawEventMaxParticipants =
    coerceNullableNumber(payload.maxParticipants) ??
    (nextEventType === "TOURNAMENT" ? MIN_BRACKET_TEAM_COUNT : null);
  return nextEventType === "TOURNAMENT"
    ? normalizeLegacyBracketTeamCount(rawEventMaxParticipants)
    : rawEventMaxParticipants;
};

const resolveEventUpsertIncidentAndTaxData = (params: {
  payload: any;
  existingEvent: any;
  isAffiliateExternalEvent: boolean;
  nextEventType: string | null;
}) => {
  const payloadIncludesAutoCreatePointMatchIncidents =
    Object.prototype.hasOwnProperty.call(
      params.payload,
      "autoCreatePointMatchIncidents",
    );
  const normalizedAutoCreatePointMatchIncidents =
    params.isAffiliateExternalEvent || params.nextEventType === "TRYOUT"
      ? false
      : payloadIncludesAutoCreatePointMatchIncidents
        ? coerceBoolean(params.payload.autoCreatePointMatchIncidents, false)
        : typeof params.existingEvent?.autoCreatePointMatchIncidents ===
            "boolean"
          ? Boolean(params.existingEvent.autoCreatePointMatchIncidents)
          : undefined;
  const normalizedTaxHandling = normalizeEventTaxHandling(
    Object.prototype.hasOwnProperty.call(params.payload, "taxHandling")
      ? params.payload.taxHandling
      : params.existingEvent?.taxHandling,
  );
  const normalizedOrganizerManualTaxRateBps =
    normalizeOrganizerManualTaxRateBps(
      Object.prototype.hasOwnProperty.call(
        params.payload,
        "organizerManualTaxRateBps",
      )
        ? params.payload.organizerManualTaxRateBps
        : params.existingEvent?.organizerManualTaxRateBps,
    );
  return {
    normalizedAutoCreatePointMatchIncidents,
    normalizedTaxHandling,
    normalizedOrganizerManualTaxRateBps,
  };
};
const buildEventUpsertRegistrationFields = (params: {
  isAffiliateExternalEvent: boolean;
  isManualRegistrationPayment: boolean;
  normalizedRegistrationPaymentMode: string;
  normalizedManualPaymentLinks: any[];
  normalizedManualPaymentInstructions: string | null;
}) => ({
  registrationPaymentMode: params.isAffiliateExternalEvent
    ? "ONLINE"
    : params.normalizedRegistrationPaymentMode,
  manualPaymentLinks:
    params.isManualRegistrationPayment && !params.isAffiliateExternalEvent
      ? params.normalizedManualPaymentLinks
      : [],
  manualPaymentInstructions:
    params.isManualRegistrationPayment && !params.isAffiliateExternalEvent
      ? params.normalizedManualPaymentInstructions
      : null,
});

const buildEventUpsertAssignmentFields = (params: {
  isAffiliateExternalEvent: boolean;
  normalizedAssistantHostIds: string[];
  resolvedOfficialPositions: any[];
}) => ({
  assistantHostIds: params.isAffiliateExternalEvent
    ? []
    : params.normalizedAssistantHostIds,
  officialPositions: params.isAffiliateExternalEvent
    ? []
    : params.resolvedOfficialPositions,
});

const buildEventUpsertOptionalFields = (params: {
  payload: any;
  isAffiliateExternalEvent: boolean;
  hasLegacyOfficialSchedulingModeInput: boolean;
  legacyOfficialSchedulingMode: string;
  staffingPriority: string;
  normalizedMatchRulesOverride: any;
  normalizedAutoCreatePointMatchIncidents: boolean | undefined;
}) => ({
  ...(params.hasLegacyOfficialSchedulingModeInput
    ? { officialSchedulingMode: params.legacyOfficialSchedulingMode }
    : {}),
  staffingPriority: params.staffingPriority,
  ...(params.normalizedMatchRulesOverride !== undefined
    ? { matchRulesOverride: params.normalizedMatchRulesOverride }
    : {}),
  ...(params.normalizedAutoCreatePointMatchIncidents !== undefined
    ? {
        autoCreatePointMatchIncidents:
          params.normalizedAutoCreatePointMatchIncidents,
      }
    : {}),
  requiredTemplateIds: params.isAffiliateExternalEvent
    ? []
    : ensureStringArray(params.payload.requiredTemplateIds),
});

type EventUpsertDataParams = {
  payload: any;
  id: string;
  start: Date;
  normalizedEnd: Date | null;
  scheduleEndConstraint: Date | null;
  generatedScheduleEnd: Date | null;
  eventTimeZone: string;
  normalizedAffiliateUrl: string;
  eventLocation: any;
  payloadCoordinates: number[] | null;
  isAutomatedScheduling: boolean;
  normalizedEventMaxParticipants: number | null;
  normalizedHostId: string;
  normalizedAssistantHostIds: string[];
  isAffiliateExternalEvent: boolean;
  noFixedEndDateTime: boolean;
  normalizedEventPrice: number;
  normalizedRegistrationPaymentMode: string;
  isManualRegistrationPayment: boolean;
  normalizedManualPaymentLinks: any[];
  normalizedManualPaymentInstructions: string | null;
  normalizedTaxHandling: string;
  normalizedOrganizerManualTaxRateBps: number | null;
  normalizedTeamSignup: boolean;
  fieldIds: string[];
  normalizedEventPlayoffTeamCount: number | null;
  includePlayoffsOrPools: boolean;
  effectiveSportIds: string[];
  timeSlotIds: string[];
  resolvedLeagueScoringConfigId: string | null;
  normalizedParentEvent: string | null;
  hasLegacyOfficialSchedulingModeInput: boolean;
  legacyOfficialSchedulingMode: string;
  staffingPriority: string;
  normalizedDoTeamsOfficiate: boolean | null | undefined;
  normalizedTeamOfficialsMaySwap: boolean;
  normalizedTeamCheckInMode: string;
  normalizedTeamCheckInOpenMinutesBefore: number;
  normalizedAllowMatchRosterEdits: boolean;
  normalizedAllowTemporaryMatchPlayers: boolean;
  resolvedOfficialPositions: any[];
  normalizedMatchRulesOverride: any;
  normalizedAutoCreatePointMatchIncidents: boolean | undefined;
  normalizedEventAllowPaymentPlans: boolean | null;
  normalizedEventInstallmentCount: number | null;
  normalizedEventInstallmentDueDates: Date[];
  normalizedEventInstallmentDueRelativeDays: number[];
  normalizedEventInstallmentAmounts: number[];
  splitLeaguePlayoffDivisions: boolean;
};

const buildEventUpsertIdentityFields = (params: EventUpsertDataParams) => {
  const isBracket = isBracketEventType(params.payload.eventType);
  return {
    name: params.payload.name ?? "Untitled Event",
    description: params.payload.description ?? null,
    affiliateUrl:
      params.normalizedAffiliateUrl.length > 0
        ? params.normalizedAffiliateUrl
        : null,
    winnerSetCount: isBracket ? params.payload.winnerSetCount ?? null : null,
    loserSetCount: isBracket ? params.payload.loserSetCount ?? null : null,
    doubleElimination: isBracket ? params.payload.doubleElimination ?? false : false,
  };
};

const buildEventUpsertLocationFields = (params: EventUpsertDataParams) => ({
  location: params.eventLocation,
  address: params.payload.address ?? null,
  rating: params.payload.rating ?? null,
  teamSizeLimit: params.normalizedTeamSignup
    ? params.payload.teamSizeLimit ?? 0
    : 0,
  minAge: params.payload.minAge ?? null,
  maxAge: params.payload.maxAge ?? null,
});

const buildEventUpsertRegistrationMetadataFields = (
  params: EventUpsertDataParams,
) => ({
  singleDivision: params.payload.singleDivision ?? false,
  registrationByDivisionType:
    params.payload.registrationByDivisionType ?? false,
  cancellationRefundHours: params.isManualRegistrationPayment
    ? null
    : (params.payload.cancellationRefundHours ?? null),
  prize: params.payload.prize ?? null,
  registrationCutoffHours: params.payload.registrationCutoffHours ?? null,
});

const buildEventUpsertPresentationFields = (params: EventUpsertDataParams) => ({
  seedColor: params.payload.seedColor ?? null,
  imageId: params.payload.imageId ?? "",
  fieldCount: params.fieldIds.length > 0 ? params.fieldIds.length : null,
});

const buildEventUpsertBracketFields = (params: EventUpsertDataParams) => {
  const isBracket = isBracketEventType(params.payload.eventType);
  return {
    winnerBracketPointsToVictory: isBracket
      ? ensureNumberArray(params.payload.winnerBracketPointsToVictory)
      : [],
    loserBracketPointsToVictory: isBracket
      ? ensureNumberArray(params.payload.loserBracketPointsToVictory)
      : [],
    coordinates: params.payloadCoordinates,
    gamesPerOpponent: isBracket ? params.payload.gamesPerOpponent ?? null : null,
    includePlayoffs: isBracket ? params.includePlayoffsOrPools : false,
    playoffTeamCount: isBracket ? params.normalizedEventPlayoffTeamCount : null,
    usesSets: isBracket ? params.payload.usesSets ?? false : false,
    matchDurationMinutes: isBracket
      ? params.payload.matchDurationMinutes ?? null
      : null,
    setDurationMinutes: isBracket ? params.payload.setDurationMinutes ?? null : null,
    setsPerMatch: isBracket ? params.payload.setsPerMatch ?? null : null,
  };
};

const buildEventUpsertSchedulingFields = (params: EventUpsertDataParams) => {
  const isBracket = isBracketEventType(params.payload.eventType);
  return {
    restTimeMinutes: isBracket ? params.payload.restTimeMinutes ?? null : null,
    state: params.payload.state ?? null,
    pointsToVictory: isBracket ? ensureNumberArray(params.payload.pointsToVictory) : [],
    sportIds: params.effectiveSportIds,
    timeSlotIds: params.timeSlotIds,
    fieldIds: params.fieldIds,
    leagueScoringConfigId: params.resolvedLeagueScoringConfigId,
    organizationId: params.payload.organizationId ?? null,
    parentEvent: params.normalizedParentEvent,
    autoCancellation: params.payload.autoCancellation ?? null,
    eventType: params.payload.eventType ?? null,
  };
};

const buildEventUpsertStaffFields = (params: EventUpsertDataParams) => ({
  doTeamsOfficiate: params.normalizedDoTeamsOfficiate ?? null,
  teamOfficialsMaySwap: params.normalizedTeamOfficialsMaySwap,
  teamCheckInMode: params.normalizedTeamCheckInMode,
  teamCheckInOpenMinutesBefore:
    params.normalizedTeamCheckInOpenMinutesBefore,
  allowMatchRosterEdits: params.normalizedAllowMatchRosterEdits,
  allowTemporaryMatchPlayers: params.normalizedAllowTemporaryMatchPlayers,
  allowPaymentPlans: params.normalizedEventAllowPaymentPlans,
  installmentCount: params.normalizedEventInstallmentCount,
  installmentDueDates: params.normalizedEventInstallmentDueDates,
  installmentDueRelativeDays: params.normalizedEventInstallmentDueRelativeDays,
  installmentAmounts: params.normalizedEventInstallmentAmounts,
  allowTeamSplitDefault: params.payload.allowTeamSplitDefault ?? null,
  splitLeaguePlayoffDivisions: params.splitLeaguePlayoffDivisions,
});

const buildEventUpsertData = (params: EventUpsertDataParams) => ({
  id: params.id,
  ...buildEventUpsertIdentityFields(params),
  start: params.start,
  end: params.normalizedEnd,
  scheduleEndConstraint: params.scheduleEndConstraint,
  generatedScheduleEnd: params.generatedScheduleEnd,
  timeZone: params.eventTimeZone,
  ...buildEventUpsertLocationFields(params),
  automatedScheduling: params.isAutomatedScheduling,
  maxParticipants: params.normalizedEventMaxParticipants,
  hostId: params.normalizedHostId,
  ...buildEventUpsertAssignmentFields({
    isAffiliateExternalEvent: params.isAffiliateExternalEvent,
    normalizedAssistantHostIds: params.normalizedAssistantHostIds,
    resolvedOfficialPositions: params.resolvedOfficialPositions,
  }),
  noFixedEndDateTime: params.noFixedEndDateTime,
  price: params.normalizedEventPrice,
  ...buildEventUpsertRegistrationFields({
    isAffiliateExternalEvent: params.isAffiliateExternalEvent,
    isManualRegistrationPayment: params.isManualRegistrationPayment,
    normalizedRegistrationPaymentMode: params.normalizedRegistrationPaymentMode,
    normalizedManualPaymentLinks: params.normalizedManualPaymentLinks,
    normalizedManualPaymentInstructions:
      params.normalizedManualPaymentInstructions,
  }),
  taxHandling: params.normalizedTaxHandling,
  organizerManualTaxRateBps: params.normalizedOrganizerManualTaxRateBps,
  ...buildEventUpsertRegistrationMetadataFields(params),
  teamSignup: params.normalizedTeamSignup,
  ...buildEventUpsertPresentationFields(params),
  ...buildEventUpsertBracketFields(params),
  ...buildEventUpsertSchedulingFields(params),
  ...buildEventUpsertOptionalFields({
    payload: params.payload,
    isAffiliateExternalEvent: params.isAffiliateExternalEvent,
    hasLegacyOfficialSchedulingModeInput:
      params.hasLegacyOfficialSchedulingModeInput,
    legacyOfficialSchedulingMode: params.legacyOfficialSchedulingMode,
    staffingPriority: params.staffingPriority,
    normalizedMatchRulesOverride: params.normalizedMatchRulesOverride,
    normalizedAutoCreatePointMatchIncidents:
      params.normalizedAutoCreatePointMatchIncidents,
  }),
  ...buildEventUpsertStaffFields(params),
  updatedAt: new Date(),
});
const loadEventUpsertDivisionNameContext = async (params: {
  client: PrismaLike;
  eventId: string;
  existingEvent: any;
}) => {
  const persistedInternalDivisionRows = params.existingEvent
    ? await params.client.divisions.findMany({
        where: {
          eventId: params.eventId,
          role: { in: ["ENTRY", "PHASE"] },
          status: "ACTIVE",
        },
        select: {
          id: true,
          key: true,
          kind: true,
          role: true,
          phase: true,
          sourceDivisionId: true,
          isSystemGenerated: true,
          playoffPlacementDivisionIds: true,
        },
      })
    : [];
  return {
    systemGeneratedDivisionIds: collectSystemGeneratedDivisionIds(
      persistedInternalDivisionRows,
    ),
    systemGeneratedEntryIds: collectSystemGeneratedDivisionIds(
      persistedInternalDivisionRows.filter(
        (row: any) =>
          String(row.role ?? "")
            .trim()
            .toUpperCase() === "ENTRY",
      ),
    ),
  };
};

const assertEventUpsertSplitLeagueMappings = async (params: {
  nextEventType: string | null;
  includePlayoffsOrPools: boolean;
  splitLeaguePlayoffDivisions: boolean;
  existingEvent: any;
  client: PrismaLike;
  id: string;
  normalizedDivisionDetails: DivisionDetailPayload[];
  normalizedPlayoffDivisionDetails: DivisionDetailPayload[];
  defaultDivisionPlayoffTeamCount: number | null;
}): Promise<void> => {
  if (
    params.nextEventType !== "LEAGUE" ||
    !params.includePlayoffsOrPools ||
    !params.splitLeaguePlayoffDivisions
  ) {
    return;
  }
  const needsPersistedDivisionDetails =
    Boolean(params.existingEvent) &&
    (params.normalizedDivisionDetails.some(
      (detail) =>
        detail.playoffTeamCount === undefined ||
        detail.playoffPlacementDivisionIds === undefined,
    ) ||
      params.normalizedPlayoffDivisionDetails.some(
        (detail) => detail.maxParticipants === undefined,
      ));
  const persistedDivisionDetails = needsPersistedDivisionDetails
    ? ((await params.client.divisions.findMany({
        where: {
          eventId: params.id,
          role: { in: ["ENTRY", "PHASE"] },
          status: "ACTIVE",
        },
        select: {
          id: true,
          key: true,
          maxParticipants: true,
          playoffTeamCount: true,
          playoffPlacementDivisionIds: true,
        },
      })) as PersistedSplitLeagueDivisionDetail[])
    : [];
  assertSplitLeaguePlayoffMappingCounts({
    divisionDetails: params.normalizedDivisionDetails,
    playoffDivisionDetails: params.normalizedPlayoffDivisionDetails,
    persistedDivisionDetails,
    defaultPlayoffTeamCount: params.defaultDivisionPlayoffTeamCount,
  });
};

const syncEventUpsertTags = async (params: {
  client: PrismaLike;
  id: string;
  payload: any;
}): Promise<void> => {
  const hasIncomingTags = Object.prototype.hasOwnProperty.call(
    params.payload,
    "tags",
  );
  const hasIncomingEventType = Object.prototype.hasOwnProperty.call(
    params.payload,
    "eventType",
  );
  if (hasIncomingTags) {
    await syncEventTags(params.id, params.payload.tags, params.client, {
      eventType: params.payload.eventType,
    });
  } else if (hasIncomingEventType) {
    await syncEventTypeTagsForEvent(
      params.id,
      params.payload.eventType,
      params.client,
    );
  }
};

const syncEventUpsertParticipantRegistrations = async (params: {
  client: PrismaLike;
  id: string;
  payload: any;
  normalizedHostId: string;
  teamIds: string[];
  teams: any[];
  compatibilityDivisionIdByRegistrantId: Record<string, string | null>;
  placeholderTeamIds: string[];
}): Promise<void> => {
  const normalizedParentEvent = normalizeEntityId(params.payload.parentEvent);
  const isWeeklyParent =
    String(params.payload.eventType ?? "").trim().toUpperCase() === "WEEKLY_EVENT" &&
    !normalizedParentEvent;
  if (isWeeklyParent) {
    // Weekly registrations are occurrence-scoped. Legacy participant arrays
    // do not carry the selected slot and date, so they cannot be synchronized.
    return;
  }
  await syncEventParticipantRegistrationsFromCompatibilityIds(params.client, {
    eventId: params.id,
    createdBy: params.normalizedHostId,
    teamIds: params.teamIds,
    userIds: ensureStringArray(params.payload.userIds),
    waitListIds: ensureStringArray(params.payload.waitListIds),
    freeAgentIds: ensureStringArray(params.payload.freeAgentIds),
    syncTeams:
      Object.prototype.hasOwnProperty.call(params.payload, "teamIds") ||
      params.teams.length > 0,
    syncUsers: Object.prototype.hasOwnProperty.call(
      params.payload,
      "userIds",
    ),
    syncWaitList: Object.prototype.hasOwnProperty.call(
      params.payload,
      "waitListIds",
    ),
    syncFreeAgents: Object.prototype.hasOwnProperty.call(
      params.payload,
      "freeAgentIds",
    ),
    divisionIdByRegistrantId: params.compatibilityDivisionIdByRegistrantId,
    placeholderTeamIds: params.placeholderTeamIds,
  });
};

const persistEventUpsertOfficials = async (params: {
  client: PrismaLike;
  id: string;
  isAffiliateExternalEvent: boolean;
  hasExplicitEventOfficials: boolean;
  existingEvent: any;
  existingEventOfficials: any[];
  resolvedEventOfficials: any[];
  resolvedOfficialPositions: any[];
}): Promise<void> => {
  if (
    !params.isAffiliateExternalEvent &&
    !params.hasExplicitEventOfficials &&
    params.existingEvent &&
    params.existingEventOfficials.length > 0
  ) {
    return;
  }
  const eventOfficialsToPersist = params.isAffiliateExternalEvent
    ? []
    : params.resolvedEventOfficials;
  const officialPositions = params.isAffiliateExternalEvent
    ? []
    : params.resolvedOfficialPositions;
  await persistEventOfficialRows(
    params.client,
    params.id,
    eventOfficialsToPersist,
  );
  await clearRemovedEventOfficialMatchAssignments(
    params.client,
    params.id,
    eventOfficialsToPersist,
    officialPositions,
  );
};

const persistEventUpsertCore = async (params: {
  client: PrismaLike;
  id: string;
  payload: any;
  eventData: Record<string, unknown>;
  existingEvent: any;
  normalizedHostId: string;
  teamIds: string[];
  teams: any[];
  compatibilityDivisionIdByRegistrantId: Record<string, string | null>;
  placeholderTeamIds: string[];
  isAffiliateExternalEvent: boolean;
  hasExplicitEventOfficials: boolean;
  existingEventOfficials: any[];
  resolvedEventOfficials: any[];
  resolvedOfficialPositions: any[];
  divisionSyncInput: SyncEventDivisionsParams;
}): Promise<void> => {
  await upsertEventWithSchemaContract(
    params.client,
    params.id,
    params.eventData,
  );
  await syncEventUpsertTags({
    client: params.client,
    id: params.id,
    payload: params.payload,
  });
  await syncEventUpsertParticipantRegistrations({
    client: params.client,
    id: params.id,
    payload: params.payload,
    normalizedHostId: params.normalizedHostId,
    teamIds: params.teamIds,
    teams: params.teams,
    compatibilityDivisionIdByRegistrantId:
      params.compatibilityDivisionIdByRegistrantId,
    placeholderTeamIds: params.placeholderTeamIds,
  });
  await persistEventUpsertOfficials({
    client: params.client,
    id: params.id,
    isAffiliateExternalEvent: params.isAffiliateExternalEvent,
    hasExplicitEventOfficials: params.hasExplicitEventOfficials,
    existingEvent: params.existingEvent,
    existingEventOfficials: params.existingEventOfficials,
    resolvedEventOfficials: params.resolvedEventOfficials,
    resolvedOfficialPositions: params.resolvedOfficialPositions,
  });
  await syncEventDivisions(params.divisionSyncInput, params.client);
};

const buildEventUpsertFieldScalarData = (field: any) => ({
  lat: field.lat ?? null,
  long: field.long ?? null,
  heading: field.heading ?? null,
  inUse: field.inUse ?? null,
  name: field.name ?? null,
});

const buildEventUpsertFieldCreateData = (params: {
  fieldId: string;
  field: any;
  normalizedRentalSlotIds: string[] | null;
  fieldLocation: string | null;
  defaultFieldLocation: string | null;
  persistedFieldCreatedBy: string | null;
  normalizedHostId: string;
}) => ({
  id: params.fieldId,
  ...buildEventUpsertFieldScalarData(params.field),
  rentalSlotIds: params.normalizedRentalSlotIds ?? [],
  location: params.fieldLocation ?? params.defaultFieldLocation,
  organizationId: null,
  createdBy: params.persistedFieldCreatedBy ?? (params.normalizedHostId || null),
  createdAt: new Date(),
  updatedAt: new Date(),
});

const buildEventUpsertFieldUpdateData = (params: {
  field: any;
  normalizedRentalSlotIds: string[] | null;
  hasPersistedFieldOwnership: boolean;
  persistedFieldOrganizationId: string | null;
  persistedFieldCreatedBy: string | null;
}) => ({
  ...buildEventUpsertFieldScalarData(params.field),
  ...(params.normalizedRentalSlotIds !== null
    ? { rentalSlotIds: params.normalizedRentalSlotIds }
    : {}),
  location: params.field.location ?? null,
  ...(params.hasPersistedFieldOwnership
    ? {
        organizationId: params.persistedFieldOrganizationId ?? null,
        createdBy: params.persistedFieldCreatedBy ?? null,
      }
    : {}),
  updatedAt: new Date(),
});

const warnOnEventUpsertFieldOwnershipChange = (params: {
  fieldId: string;
  hasPersistedFieldOwnership: boolean;
  incomingFieldOrganizationId: string | null;
  persistedFieldOrganizationId: string | null;
}) => {
  if (
    params.hasPersistedFieldOwnership &&
    params.incomingFieldOrganizationId !== null &&
    params.persistedFieldOrganizationId !== params.incomingFieldOrganizationId
  ) {
    console.warn(
      `[events] Ignoring attempted field ownership change in upsertEventFromPayload for field ${params.fieldId}: ` +
        `${params.persistedFieldOrganizationId ?? "null"} -> ${params.incomingFieldOrganizationId}`,
    );
  }
};

const persistEventUpsertField = async (params: {
  client: PrismaLike;
  field: any;
  existingFieldOwnershipById: Map<
    string,
    { organizationId: string | null; createdBy: string | null }
  >;
  defaultFieldLocation: string | null;
  normalizedHostId: string;
}): Promise<void> => {
  const fieldId = params.field.id;
  if (!fieldId) return;
  const field = params.field;
  const existingFieldOwnership =
    params.existingFieldOwnershipById.get(fieldId);
  const incomingFieldOrganizationId = normalizeEntityId(field.organizationId);
  const persistedFieldOrganizationId =
    existingFieldOwnership?.organizationId ?? null;
  const persistedFieldCreatedBy = existingFieldOwnership?.createdBy ?? null;
  const hasPersistedFieldOwnership = Boolean(existingFieldOwnership);
  warnOnEventUpsertFieldOwnershipChange({
    fieldId,
    hasPersistedFieldOwnership,
    incomingFieldOrganizationId,
    persistedFieldOrganizationId,
  });
  const hasRentalSlotIdsInput = Array.isArray(field.rentalSlotIds);
  const normalizedRentalSlotIds = hasRentalSlotIdsInput
    ? ensureArray(field.rentalSlotIds)
        .map((value) => String(value))
        .filter(Boolean)
    : null;
  const fieldLocation = normalizeOptionalText(field.location);
  await params.client.fields.upsert({
    where: { id: fieldId },
    create: buildEventUpsertFieldCreateData({
      fieldId,
      field,
      normalizedRentalSlotIds,
      fieldLocation,
      defaultFieldLocation: params.defaultFieldLocation,
      persistedFieldCreatedBy,
      normalizedHostId: params.normalizedHostId,
    }),
    update: buildEventUpsertFieldUpdateData({
      field,
      normalizedRentalSlotIds,
      hasPersistedFieldOwnership,
      persistedFieldOrganizationId,
      persistedFieldCreatedBy,
    }),
  });
};

const persistEventUpsertFields = async (params: {
  client: PrismaLike;
  fieldsToPersist: any[];
  existingFieldOwnershipById: Map<
    string,
    { organizationId: string | null; createdBy: string | null }
  >;
  defaultFieldLocation: string | null;
  normalizedHostId: string;
}): Promise<void> => {
  for (const field of params.fieldsToPersist) {
    await persistEventUpsertField({
      client: params.client,
      field,
      existingFieldOwnershipById: params.existingFieldOwnershipById,
      defaultFieldLocation: params.defaultFieldLocation,
      normalizedHostId: params.normalizedHostId,
    });
  }
};

const buildEventUpsertTeamRoleFields = (team: any) => ({
  kind: (team.captainId ?? "") ? "REGISTERED" : "PLACEHOLDER",
  name: team.name ?? null,
  captainId: team.captainId ?? "",
  managerId: team.managerId ?? team.captainId ?? "",
  headCoachId: team.headCoachId ?? null,
});

const buildEventUpsertTeamCollectionFields = (team: any) => ({
  playerIds: ensureArray(team.playerIds),
  playerRegistrationIds: ensureArray(team.playerRegistrationIds),
  coachIds: ensureArray(team.assistantCoachIds ?? team.coachIds),
  staffAssignmentIds: ensureArray(team.staffAssignmentIds),
  pending: ensureArray(team.pending),
});

const buildEventUpsertTeamMetadataFields = (team: any) => ({
  teamSize: team.teamSize ?? 0,
  profileImageId: team.profileImageId ?? null,
  sport: team.sport ?? null,
});

const buildEventUpsertTeamPersistenceBase = (params: {
  id: string;
  team: any;
  normalizedTeamDivision: string;
  normalizedTeamDivisionTypeId: string | null;
}) => ({
  eventId: params.id,
  ...buildEventUpsertTeamRoleFields(params.team),
  ...buildEventUpsertTeamCollectionFields(params.team),
  division: params.normalizedTeamDivision,
  divisionTypeId: params.normalizedTeamDivisionTypeId,
  parentTeamId: params.team.parentTeamId ?? null,
  ...buildEventUpsertTeamMetadataFields(params.team),
});

const persistEventUpsertTeam = async (params: {
  client: PrismaLike;
  id: string;
  team: any;
  normalizedEventDivisionIds: string[];
  primarySportId: string | null;
}): Promise<void> => {
  const teamId = params.team.id;
  if (!teamId) return;
  const normalizedTeamDivision =
    normalizeDivisionKey(
      typeof params.team.division === "string"
        ? params.team.division
        : params.team.division?.id,
    ) ??
    params.normalizedEventDivisionIds[0] ??
    DEFAULT_DIVISION_KEY;
  const inferredTeamDivision = inferDivisionDetails({
    identifier: normalizedTeamDivision,
    sportInput: params.primarySportId ?? undefined,
  });
  const normalizedTeamDivisionTypeId =
    normalizeDivisionKey(params.team.divisionTypeId) ??
    inferredTeamDivision.divisionTypeId;
  const base = buildEventUpsertTeamPersistenceBase({
    id: params.id,
    team: params.team,
    normalizedTeamDivision,
    normalizedTeamDivisionTypeId,
  });
  await params.client.teams.upsert({
    where: { id: teamId },
    create: {
      id: teamId,
      ...base,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      ...base,
      updatedAt: new Date(),
    },
  });
};

const persistEventUpsertTeams = async (params: {
  client: PrismaLike;
  id: string;
  teams: any[];
  normalizedEventDivisionIds: string[];
  primarySportId: string | null;
}): Promise<void> => {
  for (const team of params.teams) {
    await persistEventUpsertTeam({
      client: params.client,
      id: params.id,
      team,
      normalizedEventDivisionIds: params.normalizedEventDivisionIds,
      primarySportId: params.primarySportId,
    });
  }
};

const resolveEventUpsertSlotDivisions = (
  singleDivisionEnabled: boolean,
  slotDivisionKeys: string[],
  normalizedEventDivisionIds: string[],
) =>
  singleDivisionEnabled
    ? normalizedEventDivisionIds
    : slotDivisionKeys.length
      ? slotDivisionKeys
      : normalizedEventDivisionIds;

const buildEventUpsertTimeSlotData = (params: {
  slot: any;
  slotTimeZone: string;
  startDate: Date;
  endDate: Date | null;
}) => ({
  dayOfWeek: params.slot.dayOfWeek ?? null,
  daysOfWeek: params.slot.daysOfWeek,
  startTimeMinutes: params.slot.startTimeMinutes ?? null,
  endTimeMinutes: params.slot.endTimeMinutes ?? null,
  startDate: params.startDate,
  timeZone: params.slotTimeZone,
  repeating: Boolean(params.slot.repeating),
  endDate: params.endDate,
  scheduledFieldId: params.slot.scheduledFieldId ?? null,
  scheduledFieldIds: params.slot.scheduledFieldIds,
  price: params.slot.price ?? null,
  taxHandling: normalizeRentalTaxHandling(params.slot.taxHandling),
  sourceType: params.slot.sourceType,
  rentalBookingId: params.slot.rentalBookingId,
  rentalBookingItemId: params.slot.rentalBookingItemId,
  rentalLocked: params.slot.rentalLocked,
});

const persistEventUpsertTimeSlot = async (params: {
  client: PrismaLike;
  id: string;
  slot: any;
  eventTimeZone: string;
  singleDivisionEnabled: boolean;
  normalizedEventDivisionIds: string[];
}): Promise<void> => {
  const slotId = params.slot.id;
  if (!slotId) return;
  const slotTimeZone = resolveTimeZone(
    params.slot.timeZone,
    params.eventTimeZone,
  );
  const startDate =
    coerceDate(params.slot.startDate, slotTimeZone) ?? new Date();
  const endDate = params.slot.endDate
    ? coerceDate(params.slot.endDate, slotTimeZone)
    : null;
  const slotDivisionKeys = normalizeDivisionIdentifierList(
    params.slot.divisions,
    params.id,
  );
  const slotDivisions = resolveEventUpsertSlotDivisions(
    params.singleDivisionEnabled,
    slotDivisionKeys,
    params.normalizedEventDivisionIds,
  );
  const now = new Date();
  const slotData = buildEventUpsertTimeSlotData({
    slot: params.slot,
    slotTimeZone,
    startDate,
    endDate,
  });
  await params.client.timeSlots.upsert({
    where: { id: slotId },
    create: {
      id: slotId,
      ...slotData,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      ...slotData,
      updatedAt: now,
    },
  } as any);
  await persistTimeSlotDivisions(params.client, slotId, slotDivisions, now);
};

const persistEventUpsertTimeSlots = async (params: {
  client: PrismaLike;
  id: string;
  canonicalTimeSlots: any[];
  eventTimeZone: string;
  singleDivisionEnabled: boolean;
  normalizedEventDivisionIds: string[];
}): Promise<void> => {
  for (const slot of params.canonicalTimeSlots) {
    await persistEventUpsertTimeSlot({
      client: params.client,
      id: params.id,
      slot,
      eventTimeZone: params.eventTimeZone,
      singleDivisionEnabled: params.singleDivisionEnabled,
      normalizedEventDivisionIds: params.normalizedEventDivisionIds,
    });
  }
};

const removeEventUpsertStaleFields = async (params: {
  client: PrismaLike;
  id: string;
  existingFieldIds: string[];
  allowedFieldIdSet: Set<string>;
  preserveOperationalState: boolean;
}): Promise<void> => {
  const removedFieldIds = params.existingFieldIds.filter(
    (fieldId) => !params.allowedFieldIdSet.has(fieldId),
  );
  if (removedFieldIds.length && !params.preserveOperationalState) {
    await params.client.matches.deleteMany({
      where: {
        eventId: params.id,
        fieldId: { in: removedFieldIds },
      },
    });
    await params.client.fields.deleteMany({
      where: {
        id: { in: removedFieldIds },
        organizationId: null,
      },
    });
  }
};

const removeEventUpsertStaleTimeSlots = async (params: {
  client: PrismaLike;
  id: string;
  existingTimeSlotIds: string[];
  timeSlotIds: string[];
}): Promise<void> => {
  const nextTimeSlotIdSet = new Set(params.timeSlotIds);
  const staleTimeSlotIds = params.existingTimeSlotIds.filter(
    (slotId) => !nextTimeSlotIdSet.has(slotId),
  );
  if (!staleTimeSlotIds.length) return;
  if (params.client.rentalBookingItems?.updateMany) {
    await params.client.rentalBookingItems.updateMany({
      where: {
        eventId: params.id,
        eventTimeSlotId: { in: staleTimeSlotIds },
      } as any,
      data: {
        eventId: null,
        eventTimeSlotId: null,
        updatedAt: new Date(),
      } as any,
    });
  }
  await params.client.timeSlots.deleteMany({
    where: { id: { in: staleTimeSlotIds } },
  });
};
const resolveEventUpsertExistingResourceIds = (existingEvent: any) => ({
  existingFieldIds: normalizeFieldIds(existingEvent?.fieldIds ?? []),
  existingTimeSlotIds: normalizeFieldIds(existingEvent?.timeSlotIds ?? []),
});

const hasEventUpsertFieldResourcePayload = (payload: any): boolean =>
  Object.prototype.hasOwnProperty.call(payload, "fields") ||
  Object.prototype.hasOwnProperty.call(payload, "fieldIds") ||
  Object.prototype.hasOwnProperty.call(payload, "timeSlots");

const filterEventUpsertFieldsToPersist = (
  fields: any[],
  allowedFieldIdSet: Set<string>,
) => {
  if (!allowedFieldIdSet.size) return fields;
  return fields.filter((field: any) => {
    const fieldId = field?.id;
    return typeof fieldId === "string" && allowedFieldIdSet.has(fieldId);
  });
};

const resolveEventUpsertStart = (payload: any, eventTimeZone: string): Date =>
  coerceDate(payload.start, eventTimeZone) ?? new Date();

const resolveEventUpsertCandidateEnd = (
  payloadIncludesEnd: boolean,
  parsedPayloadEnd: Date | null,
  parsedExistingEnd: Date | null,
) => (payloadIncludesEnd ? parsedPayloadEnd : parsedExistingEnd);

const hasEventUpsertExplicitScheduleMode = (
  payloadIncludesScheduleEndConstraint: boolean,
  payloadIncludesGeneratedScheduleEnd: boolean,
) =>
  payloadIncludesScheduleEndConstraint || payloadIncludesGeneratedScheduleEnd;

const assertEventUpsertEndAfterStart = (params: {
  noFixedEndDateTime: boolean;
  normalizedEnd: Date | null;
  start: Date;
}): void => {
  if (params.noFixedEndDateTime) return;
  if (!params.normalizedEnd || params.normalizedEnd.getTime() <= params.start.getTime()) {
    throw new Error(
      'End date/time must be after start date/time when "No fixed end datetime scheduling" is disabled.',
    );
  }
};

const resolveEventUpsertOrganizationId = (payload: any): unknown =>
  payload.organizationId ?? null;

export const upsertEventFromPayload = async (
  payload: any,
  client: PrismaLike = prisma,
  options: EventUpsertOptions = {},
): Promise<string> => {
  const id = payload?.id;
  if (!id) {
    throw new Error("Event payload missing id");
  }
  const existingEvent = await loadExistingEventForUpsert(id, client);
  const organization = await loadEventUpsertOrganizationContext({
    payload,
    existingEvent,
    client,
  });
  await assertEventUpsertStructureUnlocked({
    id,
    payload,
    existingEvent,
    client,
  });
  const {
    systemGeneratedDivisionIds,
    systemGeneratedEntryIds,
  } = await loadEventUpsertDivisionNameContext({
    client,
    eventId: id,
    existingEvent,
  });
  assertUniqueSubmittedEventDivisionNames(
    payload,
    systemGeneratedDivisionIds,
    systemGeneratedEntryIds,
  );
  const {
    existingFieldIds,
    existingTimeSlotIds,
  } = resolveEventUpsertExistingResourceIds(existingEvent);
  const hasExplicitFieldResourcePayload =
    hasEventUpsertFieldResourcePayload(payload);
  const {
    resolvedOrganizationId,
    organizationAccess,
  } = organization;
  const {
    normalizedHostId,
    normalizedAssistantHostIds,
    normalizedOfficialIds,
  } = resolveEventUpsertAssignments({
    payload,
    existingEvent,
    organization,
    options,
  });
  const upsertState = resolveEventUpsertState({ payload, existingEvent });
  const {
    normalizedState,
    isTemplateState,
    normalizedAffiliateUrl,
    isAffiliateExternalEvent,
    existingEventType,
    payloadEventType,
    nextEventType,
  } = upsertState;
  const upsertSport = await loadEventUpsertSportContext({
    payload,
    existingEvent,
    client,
    id,
    nextEventType,
    resolvedOrganizationId,
    normalizedHostId,
  });
  const {
    effectiveSportIds,
    primarySportId,
    existingEventOfficialRows,
    sportRow,
    normalizedRegistrationPaymentMode,
    isManualRegistrationPayment,
    normalizedManualPaymentLinks,
    normalizedManualPaymentInstructions,
    canPersistEventPricing,
  } = upsertSport;
  const upsertLocation = resolveEventUpsertLocationContext({
    payload,
    existingEvent,
    organizationAccess,
  });
  const {
    fields,
    eventLocation,
    payloadCoordinates,
    eventTimeZone,
    defaultFieldLocation,
    teams,
    compatibilityDivisionIdByRegistrantId,
    timeSlots,
  } = upsertLocation;
  const { timeSlotsWithResolvedTimeZones } =
    await loadEventUpsertTimeSlotContext({
      client,
      fields,
      timeSlots,
      organizationAccess,
      eventTimeZone,
    });
  const upsertDivisions = resolveEventUpsertDivisionDetails({
    payload,
    id,
    primarySportId,
    nextEventType,
    canPersistEventPricing,
    isManualRegistrationPayment,
  });
  const {
    normalizedDivisionDetails,
    singleDivisionEnabled,
    includePlayoffsOrPools,
    normalizedEventPlayoffTeamCount,
    isTournamentPoolPlay,
    normalizedEventDivisionIds,
  } = upsertDivisions;
  const start = resolveEventUpsertStart(payload, eventTimeZone);
  const canonicalTimeSlots = canonicalizeEventUpsertTimeSlots({
    isAffiliateExternalEvent,
    eventId: id,
    timeSlotsWithResolvedTimeZones,
    start,
    eventTimeZone,
    normalizedEventDivisionIds,
    singleDivisionEnabled,
    isTournamentPoolPlay,
  });
  const { fieldIds } = resolveEventUpsertFieldIds({
    payload,
    fields,
    existingFieldIds,
    canonicalTimeSlots,
    isAffiliateExternalEvent,
    isTemplateState,
    payloadEventType,
  });
  const upsertOfficials = resolveEventUpsertOfficials({
    payload,
    id,
    fieldIds,
    existingEvent,
    existingEventOfficialRows,
    normalizedOfficialIds,
    sportRow,
    divisionDetails: [
      ...normalizedDivisionDetails,
      ...upsertDivisions.normalizedPlayoffDivisionDetails,
    ],
  });
  const {
    resolvedOfficialPositions,
    existingEventOfficials,
    resolvedEventOfficials,
    hasExplicitEventOfficials,
  } = upsertOfficials;
const allowedFieldIdSet = new Set(fieldIds);
  const fieldsToPersist = filterEventUpsertFieldsToPersist(
    fields,
    allowedFieldIdSet,
  );
  const fieldsToPersistIds = fieldsToPersist
    .map((field: any) => field?.id)
    .filter(
      (fieldId: unknown): fieldId is string =>
        typeof fieldId === "string" && fieldId.length > 0,
    );
  const { existingFieldOwnershipById } = await loadEventUpsertFieldOwnership({
    client,
    fieldsToPersistIds,
    fieldIds,
    hasExplicitFieldResourcePayload,
    existingEvent,
  });
  const { teamIds, placeholderTeamIds, timeSlotIds } =
    resolveEventUpsertTeamAndSlotIds({
      payload,
      teams,
      canonicalTimeSlots,
      isAffiliateExternalEvent,
    });
  const divisionFieldMap = buildDivisionFieldMap(
    normalizedEventDivisionIds,
    fieldIds,
    coerceDivisionFieldMap(payload.divisionFieldIds),
  );

  await assertEventUpsertTryoutDivisions({
    nextEventType,
    resolvedOrganizationId,
    organizationAccess,
    singleDivisionEnabled,
    normalizedDivisionDetails,
    client,
  });
  const upsertSchedulingFlags = resolveEventUpsertSchedulingFlags({
    payload,
    existingEvent,
    nextEventType,
    payloadEventType,
    includePlayoffsOrPools,
    isAffiliateExternalEvent,
  });
  const {
    isAutomatedScheduling,
    normalizedParentEvent,
    isWeeklyParent,
    supportsNoFixedEndDateTime,
    splitLeaguePlayoffDivisions,
    shouldClearLeaguePlayoffDivisionMappings,
  } = upsertSchedulingFlags;
  const normalizedPlayoffDivisionDetails = shouldClearLeaguePlayoffDivisionMappings
    ? []
    : upsertDivisions.normalizedPlayoffDivisionDetails;
  const parsedEnds = resolveEventUpsertParsedEnds({
    payload,
    existingEvent,
    eventTimeZone,
  });
  const {
    payloadIncludesEnd,
    payloadIncludesScheduleEndConstraint,
    payloadIncludesGeneratedScheduleEnd,
    payloadIncludesNoFixedEndDateTime,
    parsedPayloadEnd,
    parsedExistingEnd,
    parsedPayloadScheduleEndConstraint,
    parsedPayloadGeneratedScheduleEnd,
    parsedExistingScheduleEndConstraint,
    parsedExistingGeneratedScheduleEnd,
  } = parsedEnds;
  const candidateEnd = resolveEventUpsertCandidateEnd(
    payloadIncludesEnd,
    parsedPayloadEnd,
    parsedExistingEnd,
  );
  const hasExplicitScheduleMode = hasEventUpsertExplicitScheduleMode(
    payloadIncludesScheduleEndConstraint,
    payloadIncludesGeneratedScheduleEnd,
  );
  const noFixedEndDateTime = resolveEventUpsertNoFixedEndDateTime({
    payload,
    existingEvent,
    supportsNoFixedEndDateTime,
    hasExplicitScheduleMode,
    payloadIncludesNoFixedEndDateTime,
    parsedPayloadScheduleEndConstraint,
    candidateEnd,
  });
  const {
    scheduleEndConstraint,
    generatedScheduleEnd,
    normalizedEnd,
  } = resolveEventUpsertScheduleEnds({
    noFixedEndDateTime,
    isWeeklyParent,
    parsedPayloadGeneratedScheduleEnd,
    payloadIncludesGeneratedScheduleEnd,
    parsedExistingGeneratedScheduleEnd,
    parsedExistingScheduleEndConstraint,
    parsedExistingEnd,
    candidateEnd,
    parsedPayloadScheduleEndConstraint,
    payloadIncludesScheduleEndConstraint,
  });
  assertEventUpsertEndAfterStart({
    noFixedEndDateTime,
    normalizedEnd,
    start,
  });
  await assertEventUpsertScheduling({
    isAffiliateExternalEvent,
    isTemplateState,
    isWeeklyParent,
    canonicalTimeSlots,
    eventTimeZone,
    start,
    noFixedEndDateTime,
    normalizedEnd,
    fieldIds,
    normalizedEventDivisionIds,
    client,
    id,
    timeSlotIds,
    resolvedOrganizationId,
    nextEventType,
    normalizedParentEvent,
  });
  const resolvedLeagueScoringConfigId =
    await resolveEventUpsertLeagueScoringConfigId({
      payload,
      existingEvent,
      client,
      nextEventType,
      isAffiliateExternalEvent,
    });
  const eventPricing = resolveEventUpsertEventPricing({
    payload,
    canPersistEventPricing,
    isAffiliateExternalEvent,
    isManualRegistrationPayment,
    isWeeklyParent,
    eventTimeZone,
  });
  const {
    normalizedEventPrice,
    normalizedEventAllowPaymentPlans,
    normalizedEventInstallmentCount,
    normalizedEventInstallmentDueDates,
    normalizedEventInstallmentDueRelativeDays,
    normalizedEventInstallmentAmounts,
  } = eventPricing;
  const normalizedEventMaxParticipants = resolveEventUpsertMaxParticipants(
    payload,
    nextEventType,
  );
  const staffing = resolveEventUpsertStaffing({
    payload,
    existingEvent,
    isAffiliateExternalEvent,
    normalizedTeamSignupInput: payload.teamSignup,
    nextEventType,
  });
  const {
    hasLegacyOfficialSchedulingModeInput,
    legacyOfficialSchedulingMode,
    staffingPriority,
    normalizedDoTeamsOfficiate,
    normalizedTeamOfficialsMaySwap,
    normalizedTeamSignup,
    normalizedTeamCheckInMode,
    normalizedTeamCheckInOpenMinutesBefore,
    normalizedAllowMatchRosterEdits,
    normalizedAllowTemporaryMatchPlayers,
  } = staffing;
  const normalizedMatchRulesOverride = resolveEventUpsertMatchRulesOverride({
    payload,
    existingEvent,
    isAffiliateExternalEvent,
    nextEventType,
  });
  const {
    normalizedAutoCreatePointMatchIncidents,
    normalizedTaxHandling,
    normalizedOrganizerManualTaxRateBps,
  } = resolveEventUpsertIncidentAndTaxData({
    payload,
    existingEvent,
    isAffiliateExternalEvent,
    nextEventType,
  });
  const eventData = buildEventUpsertData({
    payload,
    id,
    start,
    normalizedEnd,
    scheduleEndConstraint,
    generatedScheduleEnd,
    eventTimeZone,
    normalizedAffiliateUrl,
    eventLocation,
    isAutomatedScheduling,
    normalizedEventMaxParticipants,
    normalizedHostId,
    normalizedAssistantHostIds,
    isAffiliateExternalEvent,
    noFixedEndDateTime,
    normalizedEventPrice,
    normalizedRegistrationPaymentMode,
    isManualRegistrationPayment,
    normalizedManualPaymentLinks,
    normalizedManualPaymentInstructions,
    normalizedTaxHandling,
    normalizedOrganizerManualTaxRateBps,
    normalizedTeamSignup,
    fieldIds,
    normalizedEventPlayoffTeamCount,
    includePlayoffsOrPools,
    effectiveSportIds,
    timeSlotIds,
    resolvedLeagueScoringConfigId,
    normalizedParentEvent,
    hasLegacyOfficialSchedulingModeInput,
    legacyOfficialSchedulingMode,
    staffingPriority,
    normalizedDoTeamsOfficiate,
    normalizedTeamOfficialsMaySwap,
    normalizedTeamCheckInMode,
    normalizedTeamCheckInOpenMinutesBefore,
    normalizedAllowMatchRosterEdits,
    normalizedAllowTemporaryMatchPlayers,
    resolvedOfficialPositions,
    normalizedMatchRulesOverride,
    normalizedAutoCreatePointMatchIncidents,
    normalizedEventAllowPaymentPlans,
    normalizedEventInstallmentCount,
    normalizedEventInstallmentDueDates,
    normalizedEventInstallmentDueRelativeDays,
    normalizedEventInstallmentAmounts,
    splitLeaguePlayoffDivisions,
    payloadCoordinates,
  });
  const divisionPricingDefaults =
    resolveEventUpsertDivisionPricingDefaults({
      payload,
      canPersistEventPricing,
      isAffiliateExternalEvent,
      isManualRegistrationPayment,
      isWeeklyParent,
      normalizedEventPrice,
      normalizedEventMaxParticipants,
      normalizedEventPlayoffTeamCount,
    });
  const {
    defaultDivisionPrice,
    defaultDivisionMaxParticipants,
    defaultDivisionPlayoffTeamCount,
    defaultDivisionAllowPaymentPlans,
    defaultDivisionInstallmentCount,
    defaultDivisionInstallmentDueDates,
    defaultDivisionInstallmentDueRelativeDays,
    defaultDivisionInstallmentAmounts,
  } = divisionPricingDefaults;

  await assertEventUpsertSplitLeagueMappings({
    nextEventType,
    includePlayoffsOrPools,
    splitLeaguePlayoffDivisions,
    existingEvent,
    client,
    id,
    normalizedDivisionDetails,
    normalizedPlayoffDivisionDetails,
    defaultDivisionPlayoffTeamCount,
  });

  await persistEventUpsertCore({
    client,
    id,
    payload,
    eventData: eventData as Record<string, unknown>,
    existingEvent,
    normalizedHostId,
    teamIds,
    teams,
    compatibilityDivisionIdByRegistrantId,
    placeholderTeamIds,
    isAffiliateExternalEvent,
    hasExplicitEventOfficials,
    existingEventOfficials,
    resolvedEventOfficials,
    resolvedOfficialPositions,
    divisionSyncInput: {
      eventId: id,
      divisionIds: normalizedEventDivisionIds,
      fieldIds,
      includePlayoffs: includePlayoffsOrPools,
      singleDivision: singleDivisionEnabled,
      sportId: primarySportId,
      referenceDate: start,
      organizationId: payload.organizationId ?? null,
      divisionFieldMap,
      divisionDetails: normalizedDivisionDetails,
      playoffDivisionDetails: normalizedPlayoffDivisionDetails,
      defaultPrice: defaultDivisionPrice,
      defaultMaxParticipants: defaultDivisionMaxParticipants,
      defaultPlayoffTeamCount: defaultDivisionPlayoffTeamCount,
      defaultAllowPaymentPlans: defaultDivisionAllowPaymentPlans,
      defaultInstallmentCount: defaultDivisionInstallmentCount,
      defaultInstallmentDueDates: defaultDivisionInstallmentDueDates,
      defaultInstallmentDueRelativeDays:
        defaultDivisionInstallmentDueRelativeDays,
      defaultInstallmentAmounts: defaultDivisionInstallmentAmounts,
      eventType: nextEventType,
      clearPlayoffPlacementMappings: shouldClearLeaguePlayoffDivisionMappings,
    },
  });
  await removeEventUpsertStaleFields({
    client,
    id,
    existingFieldIds,
    allowedFieldIdSet,
    preserveOperationalState: options.preserveOperationalState === true,
  });
  await persistEventUpsertFields({
    client,
    fieldsToPersist,
    existingFieldOwnershipById,
    defaultFieldLocation,
    normalizedHostId,
  });
  await persistEventUpsertTeams({
    client,
    id,
    teams,
    normalizedEventDivisionIds,
    primarySportId,
  });
  await persistEventUpsertTimeSlots({
    client,
    id,
    canonicalTimeSlots,
    eventTimeZone,
    singleDivisionEnabled,
    normalizedEventDivisionIds,
  });
  await removeEventUpsertStaleTimeSlots({
    client,
    id,
    existingTimeSlotIds,
    timeSlotIds,
  });
  return id;
};
