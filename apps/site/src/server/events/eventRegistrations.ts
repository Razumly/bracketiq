import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { buildEventDivisionId, extractDivisionTokenFromId } from '@/lib/divisionTypes';
import {
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  type WeeklyOccurrenceInput,
} from '@/server/events/weeklyOccurrences';
import { isTournamentPoolPlayEnabled } from '@/server/events/tournamentPools';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';
import { acquireEventLock } from '@/server/repositories/locks';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type RegistrationRegistrantType = 'SELF' | 'CHILD' | 'TEAM';
export type RegistrationRosterRole = 'PARTICIPANT' | 'WAITLIST' | 'FREE_AGENT';
export type RegistrationLifecycleStatus =
  | 'STARTED'
  | 'PENDING'
  | 'PAYMENT_FAILED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'CONSENTFAILED';

export const ACCEPTED_EVENT_REGISTRATION_STATUSES = ['ACTIVE', 'BLOCKED'] as const;

type EventLike = {
  id: string;
  eventType?: unknown;
  includePlayoffs?: unknown;
  includePlayoffsOrPools?: unknown;
  parentEvent?: unknown;
  teamSignup?: unknown;
  singleDivision?: unknown;
  maxParticipants?: unknown;
  timeSlotIds?: unknown;
};

export type RegistrationRow = {
  id: string;
  eventId: string;
  registrantId: string;
  parentId: string | null;
  registrantType: RegistrationRegistrantType;
  rosterRole: RegistrationRosterRole | null;
  status: RegistrationLifecycleStatus | null;
  acceptedAt: Date | null;
  eventTeamId: string | null;
  sourceTeamRegistrationId: string | null;
  ageAtEvent: number | null;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  jerseyNumber: string | null;
  position: string | null;
  isCaptain: boolean | null;
  consentDocumentId: string | null;
  consentStatus: string | null;
  createdBy: string;
  slotId: string | null;
  occurrenceDate: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type EventParticipantEntry = {
  registrationId: string;
  registrantId: string;
  registrantType: RegistrationRegistrantType;
  rosterRole: RegistrationRosterRole;
  status: RegistrationLifecycleStatus;
  parentId: string | null;
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  consentDocumentId: string | null;
  consentStatus: string | null;
  slotId: string | null;
  occurrenceDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EventParticipantDivisionIds = {
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
};

export type EventParticipantDivisionWarning = {
  divisionId: string;
  code: 'OVER_CAPACITY' | 'MISSING_PLACEHOLDERS';
  message: string;
  filledCount: number;
  slotCount: number;
  maxTeams: number;
};

export type EventParticipantIdsSnapshot = {
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
  divisions: EventParticipantDivisionIds[];
};

export type EventParticipantIds = {
  teamIds: string[];
  userIds: string[];
  waitListIds: string[];
  freeAgentIds: string[];
};

export type EventParticipantRegistrationSections = {
  teams: EventParticipantEntry[];
  users: EventParticipantEntry[];
  children: EventParticipantEntry[];
  waitlist: EventParticipantEntry[];
  freeAgents: EventParticipantEntry[];
};

export type EventParticipantSnapshot = {
  participants: EventParticipantIdsSnapshot;
  registrations?: EventParticipantRegistrationSections;
  teams: any[];
  users: any[];
  participantCount: number;
  participantCapacity: number | null;
  occurrence: { slotId: string; occurrenceDate: string } | null;
  divisionWarnings: EventParticipantDivisionWarning[];
};

export const JOINED_EVENT_PARTICIPANT_STATUSES = ['PENDING', 'ACTIVE', 'BLOCKED'] as const;
const DISPLAY_MEMBER_STATUSES = new Set<RegistrationLifecycleStatus>(JOINED_EVENT_PARTICIPANT_STATUSES);
const ACCEPTED_EVENT_REGISTRATION_STATUS_SET = new Set<RegistrationLifecycleStatus>(
  ACCEPTED_EVENT_REGISTRATION_STATUSES,
);

export type EventRegistrationStructure = {
  id: string;
  eventType: string | null;
  teamSignup: boolean | null;
  maxParticipants?: number | null;
  singleDivision?: boolean | null;
  divisionIds?: string[];
};

export class EventConfigurationChangedError extends Error {
  readonly code = 'EVENT_CONFIGURATION_CHANGED';
  readonly status = 409;

  constructor() {
    super('Event configuration changed while the registration was being processed. Reload and try again.');
    this.name = 'EventConfigurationChangedError';
  }
}

export class EventRegistrationCapacityError extends Error {
  readonly code = 'EVENT_REGISTRATION_CAPACITY_EXCEEDED';
  readonly status = 409;
  readonly capacity: number;
  readonly participantCount: number;

  constructor(capacity: number, participantCount: number) {
    super(`This event has reached its registration capacity of ${capacity}.`);
    this.name = 'EventRegistrationCapacityError';
    this.capacity = capacity;
    this.participantCount = participantCount;
  }
}
export class EventRegistrationDivisionError extends Error {
  readonly code = 'INVALID_EVENT_REGISTRATION_DIVISION';
  readonly status = 400;
  readonly divisionId: string | null;
  readonly matchCount: number;

  constructor(divisionId: string | null, matchCount: number) {
    super(
      divisionId
        ? 'Selected registration division is not one active Entry Division for this event.'
        : 'A registration division is required for each participant registration.',
    );
    this.name = 'EventRegistrationDivisionError';
    this.divisionId = divisionId;
    this.matchCount = matchCount;
  }
}
export class EventRegistrationStructureLockedError extends Error {
  readonly code = 'EVENT_REGISTRATION_STRUCTURE_LOCKED';
  readonly status = 409;
  readonly fieldName: 'eventType' | 'teamSignup';

  constructor(fieldName: 'eventType' | 'teamSignup') {
    super(
      fieldName === 'eventType'
        ? 'Event Type cannot change after accepted registration or protected match history.'
        : 'Registration Unit cannot change after accepted registration or protected match history.',
    );
    this.name = 'EventRegistrationStructureLockedError';
    this.fieldName = fieldName;
  }
}

export class EventRegistrationUnitError extends Error {
  readonly code = 'INVALID_EVENT_REGISTRATION_UNIT';
  readonly status = 400;
  readonly eventType: string | null;
  readonly teamSignup: boolean;

  constructor(
    eventType: unknown,
    teamSignup: unknown,
    messageTeamSignup?: boolean,
  ) {
    const normalizedEventType = normalizeEventTypeForRegistration(eventType);
    const normalizedTeamSignup = Boolean(teamSignup);
    const expectedTeamSignup = messageTeamSignup ?? (
      normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT'
        ? true
        : normalizedEventType !== 'TRYOUT' && normalizedTeamSignup
    );
    super(
      expectedTeamSignup
        ? `${normalizedEventType ?? 'This event'} events require team registration.`
        : `${normalizedEventType ?? 'This event'} events require individual registration.`,
    );
    this.name = 'EventRegistrationUnitError';
    this.eventType = normalizedEventType;
    this.teamSignup = normalizedTeamSignup;
  }
}

const normalizeEventTypeForRegistration = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return value == null ? null : String(value).trim().toUpperCase();
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length ? normalized : null;
};


export const assertEventTypeRegistrationUnit = (
  eventType: unknown,
  teamSignup: unknown,
): void => {
  const normalizedEventType = normalizeEventTypeForRegistration(eventType);
  const normalizedTeamSignup = Boolean(teamSignup);
  const requiresTeam = normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT';
  const requiresIndividual = normalizedEventType === 'TRYOUT';
  if ((requiresTeam && !normalizedTeamSignup) || (requiresIndividual && normalizedTeamSignup)) {
    throw new EventRegistrationUnitError(normalizedEventType, normalizedTeamSignup);
  }
};

export const acquireEventLockAndLoadStructure = async (
  client: PrismaLike,
  eventId: string,
  expected?: Partial<Pick<EventRegistrationStructure, 'eventType' | 'teamSignup'>>,
): Promise<EventRegistrationStructure> => {
  await acquireEventLock(client, eventId);
  const event = await client.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      eventType: true,
      teamSignup: true,
      maxParticipants: true,
      singleDivision: true,
    },
  });
  if (!event) {
    throw Object.assign(new Error('Event not found.'), { status: 404 });
  }
  assertEventTypeRegistrationUnit(event.eventType, event.teamSignup);

  const expectedEventType = expected && Object.prototype.hasOwnProperty.call(expected, 'eventType')
    ? normalizeEventTypeForRegistration(expected.eventType)
    : undefined;
  const expectedTeamSignup = expected && Object.prototype.hasOwnProperty.call(expected, 'teamSignup')
    ? Boolean(expected.teamSignup)
    : undefined;
  if (
    (expectedEventType !== undefined && normalizeEventTypeForRegistration(event.eventType) !== expectedEventType)
    || (expectedTeamSignup !== undefined && Boolean(event.teamSignup) !== expectedTeamSignup)
  ) {
    throw new EventConfigurationChangedError();
  }

  const activeEntryDivisionRows = await client.divisions.findMany({
    where: {
      eventId,
      scope: 'EVENT',
      role: 'ENTRY',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const divisionIds = normalizeIdList(
    activeEntryDivisionRows.map((division) => division.id),
  );
  return {
    id: event.id,
    eventType: normalizeEventTypeForRegistration(event.eventType),
    teamSignup: event.teamSignup ?? null,
    maxParticipants: event.maxParticipants ?? null,
    singleDivision: event.singleDivision ?? null,
    divisionIds,
  };
};
export const hasJoinedEventParticipant = async (
  eventId: string,
  client: PrismaLike = prisma,
): Promise<boolean> => {
  const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : '';
  if (!normalizedEventId) return false;
  const row = await client.eventRegistrations.findFirst({
    where: {
      eventId: normalizedEventId,
      rosterRole: 'PARTICIPANT',
      AND: [
        {
          OR: [
            { acceptedAt: { not: null } },
            { status: { in: [...ACCEPTED_EVENT_REGISTRATION_STATUSES] } },
          ],
        },
        {
          OR: [
            { registrantType: 'TEAM' },
            {
              registrantType: { in: ['SELF', 'CHILD'] },
              eventTeamId: null,
              sourceTeamRegistrationId: null,
            },
          ],
        },
      ],
    },
    select: { id: true },
  });
  return Boolean(row);
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

const emptyParticipantIds = (): EventParticipantIds => ({
  teamIds: [],
  userIds: [],
  waitListIds: [],
  freeAgentIds: [],
});

const pushUnique = (values: string[], value: string | null): void => {
  if (!value || values.includes(value)) {
    return;
  }
  values.push(value);
};

const normalizeRosterRole = (value: unknown): RegistrationRosterRole => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'WAITLIST' || normalized === 'FREE_AGENT') {
    return normalized;
  }
  return 'PARTICIPANT';
};

const normalizeLifecycleStatus = (value: unknown): RegistrationLifecycleStatus => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (
    normalized === 'PENDING'
    || normalized === 'PAYMENT_FAILED'
    || normalized === 'ACTIVE'
    || normalized === 'BLOCKED'
    || normalized === 'CANCELLED'
    || normalized === 'CONSENTFAILED'
  ) {
    return normalized;
  }
  return 'STARTED';
};
const positiveInt = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
};

const toEntry = (row: RegistrationRow): EventParticipantEntry => ({
  registrationId: row.id,
  registrantId: row.registrantId,
  registrantType: row.registrantType,
  rosterRole: normalizeRosterRole(row.rosterRole),
  status: normalizeLifecycleStatus(row.status),
  parentId: normalizeId(row.parentId),
  divisionId: normalizeId(row.divisionId),
  divisionTypeId: normalizeId(row.divisionTypeId),
  divisionTypeKey: normalizeId(row.divisionTypeKey),
  consentDocumentId: normalizeId(row.consentDocumentId),
  consentStatus: normalizeId(row.consentStatus),
  slotId: normalizeId(row.slotId),
  occurrenceDate: normalizeId(row.occurrenceDate),
  createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
});

const isRegisteredLifecycleStatus = (value: unknown): boolean => (
  DISPLAY_MEMBER_STATUSES.has(normalizeLifecycleStatus(value))
);

const isTeamRosterRegistration = (
  row: Pick<RegistrationRow, 'registrantType' | 'eventTeamId' | 'sourceTeamRegistrationId'>,
): boolean => (
  row.registrantType !== 'TEAM'
  && Boolean(normalizeId(row.eventTeamId) || normalizeId(row.sourceTeamRegistrationId))
);

export const isAcceptedParticipantRegistration = (
  row: Pick<
    RegistrationRow,
    'rosterRole' | 'status' | 'acceptedAt' | 'registrantType' | 'eventTeamId' | 'sourceTeamRegistrationId'
  >,
): boolean => (
  normalizeRosterRole(row.rosterRole) === 'PARTICIPANT'
  && !isTeamRosterRegistration(row)
  && (
    row.acceptedAt != null
    || ACCEPTED_EVENT_REGISTRATION_STATUS_SET.has(normalizeLifecycleStatus(row.status))
  )
);

const isRegisteredParticipant = (row: RegistrationRow): boolean => (
  isAcceptedParticipantRegistration(row)
  && ACCEPTED_EVENT_REGISTRATION_STATUS_SET.has(normalizeLifecycleStatus(row.status))
);
const isPlaceholderTeamRow = (row?: { kind?: unknown } | null): boolean => (
  String(row?.kind ?? '').trim().toUpperCase() === 'PLACEHOLDER'
);

const normalizeIdKey = (value: unknown): string | null => normalizeId(value)?.toLowerCase() ?? null;

const loadPlaceholderTeamIdKeys = async (
  teamIds: string[],
  client: PrismaLike,
): Promise<Set<string>> => {
  const normalizedTeamIds = Array.from(new Set(
    teamIds
      .map((teamId) => normalizeId(teamId))
      .filter((teamId): teamId is string => Boolean(teamId)),
  ));
  const teamsDelegate = (client as any).teams;
  if (!normalizedTeamIds.length || typeof teamsDelegate?.findMany !== 'function') {
    return new Set();
  }

  const rows = await teamsDelegate.findMany({
    where: {
      id: { in: normalizedTeamIds },
    },
    select: {
      id: true,
      kind: true,
      captainId: true,
      parentTeamId: true,
    },
  });

  return new Set(
    (Array.isArray(rows) ? rows : [])
      .filter(isPlaceholderTeamRow)
      .map((row) => normalizeIdKey(row.id))
      .filter((teamId): teamId is string => Boolean(teamId)),
  );
};

export const isRegistrationCapacityEntry = (
  row: Pick<
    RegistrationRow,
    'rosterRole' | 'status' | 'acceptedAt' | 'registrantType' | 'eventTeamId' | 'sourceTeamRegistrationId'
  >,
): boolean => (
  isAcceptedParticipantRegistration(row)
  && ACCEPTED_EVENT_REGISTRATION_STATUS_SET.has(normalizeLifecycleStatus(row.status))
);

type RegistrationCapacityIdentityRow = Pick<
  RegistrationRow,
  | 'id'
  | 'registrantId'
  | 'parentId'
  | 'registrantType'
  | 'rosterRole'
  | 'status'
  | 'acceptedAt'
  | 'eventTeamId'
  | 'sourceTeamRegistrationId'
>;

export const registrationUnitIdentityKey = (
  event: { teamSignup?: unknown },
  row: Pick<
    RegistrationCapacityIdentityRow,
    'registrantId' | 'parentId' | 'registrantType' | 'eventTeamId' | 'sourceTeamRegistrationId'
  >,
): string | null => {
  if (isTeamRosterRegistration(row)) {
    return null;
  }
  const isTeamUnit = row.registrantType === 'TEAM'
    || Boolean(normalizeId(row.eventTeamId) || normalizeId(row.sourceTeamRegistrationId));
  if (Boolean(event.teamSignup)) {
    if (!isTeamUnit) {
      return null;
    }
    const teamId = normalizeIdKey(row.parentId)
      ?? normalizeIdKey(row.eventTeamId)
      ?? normalizeIdKey(row.sourceTeamRegistrationId)
      ?? normalizeIdKey(row.registrantId);
    return teamId ? `TEAM:${teamId}` : null;
  }
  if (isTeamUnit || (row.registrantType !== 'SELF' && row.registrantType !== 'CHILD')) {
    return null;
  }
  const userId = normalizeIdKey(row.registrantId);
  return userId ? `USER:${userId}` : null;
};

export const registrationCapacityIdentityKey = (
  event: { teamSignup?: unknown },
  row: RegistrationCapacityIdentityRow,
): string | null => {
  if (!isRegistrationCapacityEntry(row)) {
    return null;
  }
  return registrationUnitIdentityKey(event, row);
};

export const dedupeRegistrationCapacityRows = <T extends RegistrationCapacityIdentityRow>(
  event: { teamSignup?: unknown },
  rows: T[],
): T[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const identity = registrationCapacityIdentityKey(event, row);
    if (!identity || seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
};

const isDisplayableRole = (row: RegistrationRow, role: RegistrationRosterRole): boolean => (
  normalizeRosterRole(row.rosterRole) === role
  && isRegisteredLifecycleStatus(row.status)
);

const buildOccurrenceWhere = (occurrence?: { slotId: string; occurrenceDate: string } | null) => (
  occurrence
    ? {
      slotId: occurrence.slotId,
      occurrenceDate: occurrence.occurrenceDate,
    }
    : {
      slotId: null,
      occurrenceDate: null,
    }
);

const registrationSelect = {
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
  paymentResolutionReason: true,
} as const;

const participantDivisionSelect = {
  id: true,
  key: true,
  kind: true,
  divisionTypeId: true,
  maxParticipants: true,
  teamIds: true,
} as const;

const resolveDivisionAliases = (value: string | null): string[] => {
  const normalized = normalizeId(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return [];
  }
  const token = extractDivisionTokenFromId(normalized);
  return Array.from(new Set([normalized, token].filter((entry): entry is string => Boolean(entry))));
};

const registerUniqueDivisionReference = (
  references: Map<string, string | null>,
  value: unknown,
  divisionId: string,
) => {
  const normalized = normalizeId(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return;
  }
  const existing = references.get(normalized);
  if (existing === undefined) {
    references.set(normalized, divisionId);
    return;
  }
  if (existing !== divisionId) {
    references.set(normalized, null);
  }
};

type EventCapacityDivisionRow = {
  eventId?: string | null;
  id: string;
  key: string | null;
  kind: string | null;
  maxParticipants: number | null;
};

const capacityFromDivisionRows = (
  event: EventLike,
  divisionIds: string[] | undefined,
  divisionRows: EventCapacityDivisionRow[],
): number | null => {
  const fallbackCapacity = positiveInt(event.maxParticipants);
  const scopedDivisionIds = normalizeIdList(divisionIds);
  const leagueRows = divisionRows.filter(
    (row) => String(row.kind ?? 'LEAGUE').toUpperCase() !== 'PLAYOFF',
  );
  if (!leagueRows.length) {
    return fallbackCapacity;
  }

  if (Boolean(event.singleDivision)) {
    const preferredIds = scopedDivisionIds.map((divisionId) => divisionId.toLowerCase());
    const preferred = leagueRows.find((row) => {
      const aliases = resolveDivisionAliases(row.id).concat(resolveDivisionAliases(row.key));
      return aliases.some((alias) => preferredIds.includes(alias));
    }) ?? leagueRows[0];
    return positiveInt(preferred?.maxParticipants);
  }

  const summedCapacity = leagueRows.reduce(
    (sum, row) => sum + (positiveInt(row.maxParticipants) ?? 0),
    0,
  );
  return summedCapacity > 0 ? summedCapacity : null;
};

const eventCapacityForDivisions = async (
  params: {
    event: EventLike;
    divisionIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<number | null> => {
  const fallbackCapacity = positiveInt(params.event.maxParticipants);
  const scopedDivisionIds = normalizeIdList(params.divisionIds);
  if (params.divisionIds && !scopedDivisionIds.length) {
    return fallbackCapacity;
  }

  const divisionRows = await client.divisions.findMany({
    where: scopedDivisionIds.length
      ? {
          eventId: params.event.id,
          role: 'ENTRY',
          status: 'ACTIVE',
          OR: [
            { id: { in: scopedDivisionIds } },
            { key: { in: scopedDivisionIds } },
          ],
        }
      : {
          eventId: params.event.id,
          role: 'ENTRY',
          status: 'ACTIVE',
          OR: [
            { kind: 'LEAGUE' as any },
            { kind: null },
          ],
        },
    select: {
      eventId: true,
      id: true,
      key: true,
      kind: true,
      maxParticipants: true,
    },
  }) as EventCapacityDivisionRow[];

  return capacityFromDivisionRows(params.event, params.divisionIds, divisionRows);
};

const eventCapacitiesForEvents = async (
  events: EventLike[],
  client: PrismaLike = prisma,
): Promise<Map<string, number | null>> => {
  const eventIds = normalizeIdList(events.map((event) => event.id));
  if (!eventIds.length) {
    return new Map();
  }

  const divisionRows = await client.divisions.findMany({
    where: {
      eventId: { in: eventIds },
      role: 'ENTRY',
      status: 'ACTIVE',
      OR: [
        { kind: 'LEAGUE' as any },
        { kind: null },
      ],
    },
    select: {
      eventId: true,
      id: true,
      key: true,
      kind: true,
      maxParticipants: true,
    },
  }) as EventCapacityDivisionRow[];
  const rowsByEventId = new Map<string, EventCapacityDivisionRow[]>();
  divisionRows.forEach((row) => {
    const eventId = normalizeId(row.eventId);
    if (!eventId) {
      return;
    }
    const rows = rowsByEventId.get(eventId) ?? [];
    rows.push(row);
    rowsByEventId.set(eventId, rows);
  });

  return new Map(events.map((event) => [
    event.id,
    capacityFromDivisionRows(event, undefined, rowsByEventId.get(event.id) ?? []),
  ]));
};

export const buildEventRegistrationId = (params: {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  slotId?: string | null;
  occurrenceDate?: string | null;
}): string => {
  const eventId = normalizeId(params.eventId);
  const registrantId = normalizeId(params.registrantId);
  if (!eventId || !registrantId) {
    throw new Error('Registration id requires event and registrant ids.');
  }

  const registrantType = params.registrantType.trim().toLowerCase();
  const slotId = normalizeId(params.slotId);
  const occurrenceDate = normalizeId(params.occurrenceDate);
  if (slotId && occurrenceDate) {
    return `${eventId}__${registrantType}__${registrantId}__${slotId}__${occurrenceDate}`;
  }
  return `${eventId}__${registrantType}__${registrantId}`;
};

export const findEventRegistration = async (params: {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  occurrence?: WeeklyOccurrenceInput | null;
}, client: PrismaLike = prisma) => {
  const registrationId = buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: params.registrantType,
    registrantId: params.registrantId,
    slotId: params.occurrence?.slotId ?? null,
    occurrenceDate: params.occurrence?.occurrenceDate ?? null,
  });
  return client.eventRegistrations.findUnique({
    where: { id: registrationId },
    select: registrationSelect,
  }) as Promise<RegistrationRow | null>;
};

export type EventRegistrationWriteParams = {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  registrationId?: string | null;
  rosterRole: RegistrationRosterRole;
  status: RegistrationLifecycleStatus;
  createdBy: string;
  parentId?: string | null;
  eventTeamId?: string | null;
  sourceTeamRegistrationId?: string | null;
  ageAtEvent?: number | null;
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean | null;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  occurrence?: WeeklyOccurrenceInput | null;
};

const isTeamRegistrationUnit = (
  params: Pick<EventRegistrationWriteParams, 'registrantType' | 'eventTeamId' | 'sourceTeamRegistrationId'>,
): boolean => (
  params.registrantType === 'TEAM'
  || Boolean(normalizeId(params.eventTeamId) || normalizeId(params.sourceTeamRegistrationId))
);

export const assertEventRegistrationUnit = (
  event: EventRegistrationStructure,
  params: Pick<
    EventRegistrationWriteParams,
    'registrantType' | 'rosterRole' | 'eventTeamId' | 'sourceTeamRegistrationId'
  >,
): void => {
  if (params.rosterRole !== 'PARTICIPANT') {
    return;
  }
  assertEventTypeRegistrationUnit(event.eventType, event.teamSignup);
  const normalizedEventType = normalizeEventTypeForRegistration(event.eventType);
  const requiresTeam = normalizedEventType === 'LEAGUE'
    || normalizedEventType === 'TOURNAMENT'
    || Boolean(event.teamSignup);
  if (requiresTeam !== isTeamRegistrationUnit(params)) {
    throw new EventRegistrationUnitError(event.eventType, event.teamSignup, requiresTeam);
  }
};
const resolveParticipantEntryDivision = async (
  params: EventRegistrationWriteParams,
  event: EventRegistrationStructure,
  client: PrismaLike,
): Promise<EventRegistrationWriteParams> => {
  if (params.rosterRole !== 'PARTICIPANT') {
    return params;
  }

  const divisionDelegate = (client as any).divisions;
  if (typeof divisionDelegate?.findMany !== 'function') {
    return params;
  }

  const requestedDivisionId = normalizeId(params.divisionId);
  const rows = await divisionDelegate.findMany({
    where: {
      eventId: params.eventId,
      role: 'ENTRY',
      status: 'ACTIVE',
    },
    select: {
      id: true,
      key: true,
      divisionTypeId: true,
    },
  }) as Array<{
    id?: unknown;
    key?: unknown;
    divisionTypeId?: unknown;
  }>;
  const activeRows = Array.isArray(rows) ? rows : [];
  const requestedAliases = requestedDivisionId
    ? new Set(resolveDivisionAliases(requestedDivisionId))
    : null;
  const matches = requestedAliases
    ? activeRows.filter((row) => {
      const aliases = resolveDivisionAliases(normalizeId(row.id))
        .concat(resolveDivisionAliases(normalizeId(row.key)));
      return aliases.some((alias) => requestedAliases.has(alias));
    })
    : activeRows;

  if (activeRows.length > 0) {
    if (matches.length !== 1) {
      throw new EventRegistrationDivisionError(requestedDivisionId, matches.length);
    }
    const matchedDivision = matches[0];
    const resolvedDivisionId = normalizeId(matchedDivision?.id);
    if (!resolvedDivisionId) {
      throw new EventRegistrationDivisionError(requestedDivisionId, 0);
    }
    const resolvedDivisionTypeId = normalizeId(matchedDivision?.divisionTypeId);
    const resolvedDivisionTypeKey = normalizeId(matchedDivision?.key);
    return {
      ...params,
      divisionId: resolvedDivisionId,
      ...(resolvedDivisionTypeId
        ? { divisionTypeId: resolvedDivisionTypeId }
        : {}),
      ...(resolvedDivisionTypeKey
        ? { divisionTypeKey: resolvedDivisionTypeKey }
        : {}),
    };
  }

  const legacyDivisionIds = normalizeIdList(event.divisionIds);
  const legacyCandidates = requestedAliases
    ? legacyDivisionIds.filter((divisionId) => (
      resolveDivisionAliases(divisionId).some((alias) => requestedAliases.has(alias))
    ))
    : legacyDivisionIds;
  const canonicalCandidates = Array.from(new Set(
    legacyCandidates
      .map((divisionId) => extractDivisionTokenFromId(divisionId) ?? divisionId)
      .filter((divisionId): divisionId is string => Boolean(divisionId)),
  ));
  if (!canonicalCandidates.length && (
    !requestedAliases
    || requestedAliases.has('open')
  )) {
    canonicalCandidates.push('open');
  }
  if (canonicalCandidates.length !== 1) {
    throw new EventRegistrationDivisionError(requestedDivisionId, canonicalCandidates.length);
  }

  const divisionTypeKey = canonicalCandidates[0];
  const resolvedDivisionId = buildEventDivisionId(params.eventId, divisionTypeKey);
  if (typeof divisionDelegate.upsert === 'function') {
    await divisionDelegate.upsert({
      where: { id: resolvedDivisionId },
      create: {
        id: resolvedDivisionId,
        eventId: params.eventId,
        key: divisionTypeKey,
        name: divisionTypeKey,
        role: 'ENTRY',
        phase: null,
        kind: 'LEAGUE',
        isSystemGenerated: true,
        status: 'ACTIVE',
      },
      update: {
        eventId: params.eventId,
        key: divisionTypeKey,
        role: 'ENTRY',
        status: 'ACTIVE',
      },
    });
  }

  return {
    ...params,
    divisionId: resolvedDivisionId,
    divisionTypeKey: params.divisionTypeKey ?? divisionTypeKey,
  };
};

const assertRegistrationCapacity = async (
  event: EventRegistrationStructure,
  params: EventRegistrationWriteParams,
  registrationId: string,
  acceptedAt: Date,
  client: PrismaLike,
): Promise<void> => {
  if (
    params.rosterRole !== 'PARTICIPANT'
    || !ACCEPTED_EVENT_REGISTRATION_STATUS_SET.has(normalizeLifecycleStatus(params.status))
  ) {
    return;
  }

  const registrationDelegate = (client as any).eventRegistrations;
  if (typeof registrationDelegate?.findMany !== 'function') {
    return;
  }
  const divisionDelegate = (client as any).divisions;
  const selectedDivisionInput = normalizeId(params.divisionId);
  let targetDivisionAliases: Set<string> | null = selectedDivisionInput
    ? new Set(resolveDivisionAliases(selectedDivisionInput))
    : null;
  let capacity = positiveInt(event.maxParticipants);
  if (typeof divisionDelegate?.findMany === 'function') {
    if (selectedDivisionInput) {
      const divisionRows = await divisionDelegate.findMany({
        where: {
          eventId: params.eventId,
          role: 'ENTRY',
          status: 'ACTIVE',
        },
        select: {
          id: true,
          key: true,
          kind: true,
          maxParticipants: true,
        },
      });
      const selectedDivision = (Array.isArray(divisionRows) ? divisionRows : []).find((row) => {
        if (String(row.kind ?? '').trim().toUpperCase() === 'PLAYOFF') {
          return false;
        }
        const aliases = resolveDivisionAliases(row.id)
          .concat(resolveDivisionAliases(row.key));
        return aliases.some((alias) => targetDivisionAliases?.has(alias));
      });
      if (selectedDivision) {
        targetDivisionAliases = new Set([
          ...(targetDivisionAliases ?? []),
          ...resolveDivisionAliases(selectedDivision.id),
          ...resolveDivisionAliases(selectedDivision.key),
        ]);
        capacity = positiveInt(selectedDivision.maxParticipants) ?? capacity;
      }
    } else {
      capacity = await eventCapacityForDivisions({ event }, client);
    }
  }
  if (capacity === null) {
    return;
  }

  const rows = await registrationDelegate.findMany({
    where: {
      eventId: params.eventId,
      rosterRole: 'PARTICIPANT',
      status: { in: [...ACCEPTED_EVENT_REGISTRATION_STATUSES] },
    },
    select: {
      id: true,
      rosterRole: true,
      status: true,
      acceptedAt: true,
      registrantId: true,
      parentId: true,
      registrantType: true,
      eventTeamId: true,
      sourceTeamRegistrationId: true,
      slotId: true,
      occurrenceDate: true,
      divisionId: true,
    },
  });

  const targetSlotId = normalizeId(params.occurrence?.slotId);
  const targetOccurrenceDate = normalizeId(params.occurrence?.occurrenceDate);
  const isTargetOccurrence = (row: {
    slotId?: unknown;
    occurrenceDate?: unknown;
    divisionId?: unknown;
  }): boolean => {
    if (
      normalizeId(row.slotId) !== targetSlotId
      || normalizeId(row.occurrenceDate) !== targetOccurrenceDate
    ) {
      return false;
    }
    if (!targetDivisionAliases) {
      return true;
    }
    return resolveDivisionAliases(normalizeId(row.divisionId))
      .some((alias) => targetDivisionAliases?.has(alias));
  };
  const allRows = Array.isArray(rows) ? rows : [];
  const targetRows = allRows.filter(isTargetOccurrence);
  const candidate: RegistrationCapacityIdentityRow = {
    id: registrationId,
    registrantId: params.registrantId,
    parentId: normalizeId(params.parentId),
    rosterRole: params.rosterRole,
    status: params.status,
    acceptedAt,
    registrantType: params.registrantType,
    eventTeamId: normalizeId(params.eventTeamId),
    sourceTeamRegistrationId: normalizeId(params.sourceTeamRegistrationId),
  };
  const projectedRows = targetRows
    .filter((row) => row.id !== registrationId)
    .concat(candidate);
  const projectedParticipantCount = dedupeRegistrationCapacityRows(
    event,
    projectedRows,
  ).length;
  if (projectedParticipantCount > capacity) {
    throw new EventRegistrationCapacityError(capacity, projectedParticipantCount);
  }
};

const upsertEventRegistrationWithinTransaction = async (
  params: EventRegistrationWriteParams,
  client: PrismaLike,
): Promise<RegistrationRow> => {
  const occurrence = params.occurrence
    ? {
      slotId: normalizeId(params.occurrence.slotId),
      occurrenceDate: normalizeId(params.occurrence.occurrenceDate),
    }
    : null;
  const registrationId = normalizeId(params.registrationId) ?? buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: params.registrantType,
    registrantId: params.registrantId,
    slotId: occurrence?.slotId ?? null,
    occurrenceDate: occurrence?.occurrenceDate ?? null,
  });
  const event = await acquireEventLockAndLoadStructure(client, params.eventId);
  const resolvedParams = await resolveParticipantEntryDivision(params, event, client);
  assertEventRegistrationUnit(event, resolvedParams);
  const now = new Date();
  const acceptedRegistration =
    resolvedParams.rosterRole === 'PARTICIPANT'
    && ACCEPTED_EVENT_REGISTRATION_STATUS_SET.has(
      normalizeLifecycleStatus(resolvedParams.status),
    );
  await assertRegistrationCapacity(event, resolvedParams, registrationId, now, client);

  return client.eventRegistrations.upsert({
    where: { id: registrationId },
    create: {
      id: registrationId,
      eventId: resolvedParams.eventId,
      registrantId: resolvedParams.registrantId,
      parentId: normalizeId(resolvedParams.parentId),
      registrantType: resolvedParams.registrantType,
      rosterRole: resolvedParams.rosterRole,
      status: resolvedParams.status,
      acceptedAt: acceptedRegistration ? now : null,
      eventTeamId: normalizeId(resolvedParams.eventTeamId),
      sourceTeamRegistrationId: normalizeId(resolvedParams.sourceTeamRegistrationId),
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
      ageAtEvent: resolvedParams.ageAtEvent ?? null,
      divisionId: normalizeId(resolvedParams.divisionId),
      divisionTypeId: normalizeId(resolvedParams.divisionTypeId),
      divisionTypeKey: normalizeId(resolvedParams.divisionTypeKey),
      jerseyNumber: normalizeId(resolvedParams.jerseyNumber),
      position: normalizeId(resolvedParams.position),
      isCaptain: resolvedParams.isCaptain ?? false,
      consentDocumentId: normalizeId(resolvedParams.consentDocumentId),
      consentStatus: normalizeId(resolvedParams.consentStatus),
      createdBy: resolvedParams.createdBy,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      parentId: normalizeId(resolvedParams.parentId),
      rosterRole: resolvedParams.rosterRole,
      status: resolvedParams.status,
      ...(acceptedRegistration ? { acceptedAt: now } : {}),
      eventTeamId: normalizeId(resolvedParams.eventTeamId),
      sourceTeamRegistrationId: normalizeId(resolvedParams.sourceTeamRegistrationId),
      slotId: occurrence?.slotId ?? null,
      occurrenceDate: occurrence?.occurrenceDate ?? null,
      ageAtEvent: resolvedParams.ageAtEvent ?? null,
      divisionId: normalizeId(resolvedParams.divisionId),
      divisionTypeId: normalizeId(resolvedParams.divisionTypeId),
      divisionTypeKey: normalizeId(resolvedParams.divisionTypeKey),
      jerseyNumber: normalizeId(resolvedParams.jerseyNumber),
      position: normalizeId(resolvedParams.position),
      isCaptain: resolvedParams.isCaptain ?? false,
      consentDocumentId: normalizeId(resolvedParams.consentDocumentId),
      consentStatus: normalizeId(resolvedParams.consentStatus),
      updatedAt: now,
    },
    select: registrationSelect,
  }) as Promise<RegistrationRow>;
};

export const upsertEventRegistration = async (
  params: EventRegistrationWriteParams,
  client: PrismaLike = prisma,
): Promise<RegistrationRow> => {
  const transaction = (client as any).$transaction;
  if (typeof transaction === 'function') {
    return transaction.call(client, (tx: PrismaLike) => (
      upsertEventRegistrationWithinTransaction(params, tx)
    ));
  }
  return upsertEventRegistrationWithinTransaction(params, client);
};
export type EventRegistrationStatusTransition = {
  registrationId: string;
  eventId?: string;
  status: RegistrationLifecycleStatus;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  current?: RegistrationRow;
  fallbackCurrent?: RegistrationRow;
  event?: EventRegistrationStructure;
  create?: Omit<EventRegistrationWriteParams, 'registrationId' | 'status'>;
};

const transitionEventRegistrationStatusWithinTransaction = async (
  params: EventRegistrationStatusTransition,
  client: PrismaLike,
): Promise<RegistrationRow> => {
  const findUnique = client.eventRegistrations.findUnique;
  const loadedCurrent = typeof findUnique === 'function'
    ? await findUnique.call(client.eventRegistrations, {
      where: { id: params.registrationId },
      select: registrationSelect,
    }) as RegistrationRow | null
    : null;
  const current = params.current ?? (
    loadedCurrent
    && loadedCurrent.eventId
    && loadedCurrent.registrantId
    && loadedCurrent.registrantType
      ? loadedCurrent
      : params.fallbackCurrent ?? null
  );
  if (!current && !params.create) {
    throw new Error('Event registration not found.');
  }
  const eventId = params.eventId ?? current?.eventId ?? params.create?.eventId;
  if (!eventId) {
    throw new Error('Event registration event is required.');
  }
  const baseWriteParams: EventRegistrationWriteParams = current
    ? {
      eventId,
      registrationId: current.id,
      registrantType: current.registrantType,
      registrantId: current.registrantId,
      parentId: current.parentId,
      rosterRole: current.rosterRole ?? 'PARTICIPANT',
      status: params.status,
      eventTeamId: current.eventTeamId,
      sourceTeamRegistrationId: current.sourceTeamRegistrationId,
      ageAtEvent: current.ageAtEvent,
      divisionId: current.divisionId,
      divisionTypeId: current.divisionTypeId,
      divisionTypeKey: current.divisionTypeKey,
      jerseyNumber: current.jerseyNumber,
      position: current.position,
      isCaptain: current.isCaptain,
      consentDocumentId: current.consentDocumentId,
      consentStatus: current.consentStatus,
      createdBy: current.createdBy,
      occurrence: current.slotId && current.occurrenceDate
        ? { slotId: current.slotId, occurrenceDate: current.occurrenceDate }
        : null,
    }
    : {
      ...params.create!,
      registrationId: params.registrationId,
      status: params.status,
    };
  const event = params.event ?? await acquireEventLockAndLoadStructure(client, eventId);
  const writeParams = await resolveParticipantEntryDivision(baseWriteParams, event, client);
  assertEventRegistrationUnit(event, writeParams);
  const now = new Date();
  const acceptedRegistration = (
    writeParams.rosterRole === 'PARTICIPANT'
    && ACCEPTED_EVENT_REGISTRATION_STATUS_SET.has(normalizeLifecycleStatus(writeParams.status))
  );
  await assertRegistrationCapacity(event, writeParams, params.registrationId, now, client);
  if (current) {
    return client.eventRegistrations.update({
      where: { id: current.id },
      data: {
        status: params.status,
        divisionId: normalizeId(writeParams.divisionId),
        ...(acceptedRegistration ? { acceptedAt: now } : {}),
        ...(params.consentDocumentId !== undefined
          ? { consentDocumentId: normalizeId(params.consentDocumentId) }
          : {}),
        ...(params.consentStatus !== undefined
          ? { consentStatus: normalizeId(params.consentStatus) }
          : {}),
        updatedAt: now,
      },
      select: registrationSelect,
    }) as Promise<RegistrationRow>;
  }
  return client.eventRegistrations.create({
    data: {
      id: params.registrationId,
      eventId: writeParams.eventId,
      registrantId: writeParams.registrantId,
      parentId: normalizeId(writeParams.parentId),
      registrantType: writeParams.registrantType,
      rosterRole: writeParams.rosterRole,
      status: writeParams.status,
      acceptedAt: acceptedRegistration ? now : null,
      eventTeamId: normalizeId(writeParams.eventTeamId),
      sourceTeamRegistrationId: normalizeId(writeParams.sourceTeamRegistrationId),
      slotId: writeParams.occurrence?.slotId ?? null,
      occurrenceDate: writeParams.occurrence?.occurrenceDate ?? null,
      ageAtEvent: writeParams.ageAtEvent ?? null,
      divisionId: normalizeId(writeParams.divisionId),
      divisionTypeId: normalizeId(writeParams.divisionTypeId),
      divisionTypeKey: normalizeId(writeParams.divisionTypeKey),
      jerseyNumber: normalizeId(writeParams.jerseyNumber),
      position: normalizeId(writeParams.position),
      isCaptain: writeParams.isCaptain ?? false,
      consentDocumentId: normalizeId(
        params.consentDocumentId !== undefined
          ? params.consentDocumentId
          : writeParams.consentDocumentId,
      ),
      consentStatus: normalizeId(
        params.consentStatus !== undefined
          ? params.consentStatus
          : writeParams.consentStatus,
      ),
      createdBy: writeParams.createdBy,
      createdAt: now,
      updatedAt: now,
    },
    select: registrationSelect,
  }) as Promise<RegistrationRow>;
};

export const transitionEventRegistrationStatus = async (
  params: EventRegistrationStatusTransition,
  client: PrismaLike = prisma,
): Promise<RegistrationRow> => {
  const transaction = (client as any).$transaction;
  if (typeof transaction === 'function') {
    return transaction.call(client, (tx: PrismaLike) => (
      transitionEventRegistrationStatusWithinTransaction(params, tx)
    ));
  }
  return transitionEventRegistrationStatusWithinTransaction(params, client);
};

type EventRegistrationDeleteParams = {
  eventId: string;
  registrantType: RegistrationRegistrantType;
  registrantId: string;
  occurrence?: WeeklyOccurrenceInput | null;
};

const deleteEventRegistrationWithinTransaction = async (
  params: EventRegistrationDeleteParams,
  client: PrismaLike,
): Promise<void> => {
  await acquireEventLockAndLoadStructure(client, params.eventId);
  const registrationId = buildEventRegistrationId({
    eventId: params.eventId,
    registrantType: params.registrantType,
    registrantId: params.registrantId,
    slotId: params.occurrence?.slotId ?? null,
    occurrenceDate: params.occurrence?.occurrenceDate ?? null,
  });
  await client.eventRegistrations.updateMany({
    where: { id: registrationId },
    data: {
      status: 'CANCELLED',
      updatedAt: new Date(),
    },
  });
};

export const deleteEventRegistration = async (
  params: EventRegistrationDeleteParams,
  client: PrismaLike = prisma,
): Promise<void> => {
  const transaction = (client as any).$transaction;
  if (typeof transaction === 'function') {
    await transaction.call(client, (tx: PrismaLike) => (
      deleteEventRegistrationWithinTransaction(params, tx)
    ));
    return;
  }
  await deleteEventRegistrationWithinTransaction(params, client);
};

export const syncDivisionTeamMembershipFromRegistrations = async (
  event: EventLike,
  client: PrismaLike = prisma,
): Promise<string[]> => {
  if (!Boolean(event.teamSignup) || isWeeklyParentEvent(event)) {
    return [];
  }

  const poolPlayEnabled = isTournamentPoolPlayEnabled(event);
  const phaseSourceDelegate = (client as any).eventDivisionPhaseSources;
  const phaseSourceRows: Array<{ entryDivisionId?: string | null; phaseDivisionId?: string | null }> = (
    poolPlayEnabled && typeof phaseSourceDelegate?.findMany === 'function'
      ? await phaseSourceDelegate.findMany({
        where: { eventId: event.id },
        select: { entryDivisionId: true, phaseDivisionId: true },
      })
      : []
  );
  const entryIdsByPhaseId = new Map<string, string[]>();
  for (const row of phaseSourceRows) {
    const phaseId = normalizeId(row.phaseDivisionId)?.toLowerCase() ?? null;
    const entryId = normalizeId(row.entryDivisionId);
    if (!phaseId || !entryId) continue;
    const entryIds = entryIdsByPhaseId.get(phaseId) ?? [];
    if (!entryIds.includes(entryId)) entryIds.push(entryId);
    entryIdsByPhaseId.set(phaseId, entryIds);
  }

  const divisionRows = await client.divisions.findMany({
    where: { eventId: event.id, role: 'ENTRY', status: 'ACTIVE' },
    select: {
      id: true,
      key: true,
      kind: true,
      teamIds: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  const leagueRows = divisionRows.filter((row) => String(row.kind ?? 'LEAGUE').toUpperCase() !== 'PLAYOFF');
  if (!leagueRows.length) {
    return [];
  }

  const activeTeamRows = await client.eventRegistrations.findMany({
    where: {
      eventId: event.id,
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: { in: Array.from(DISPLAY_MEMBER_STATUSES) },
      slotId: null,
      occurrenceDate: null,
    },
    select: {
      registrantId: true,
      divisionId: true,
    },
  });

  const activeRegisteredTeamIds = Array.from(new Set(activeTeamRows.map((row) => row.registrantId).filter(Boolean)));
  const currentTeamIdsByDivisionId = new Map<string, string[]>();
  leagueRows.forEach((row) => {
    currentTeamIdsByDivisionId.set(row.id, normalizeIdList(row.teamIds));
  });
  const currentDivisionTeamIds = Array.from(new Set(
    Array.from(currentTeamIdsByDivisionId.values()).flat(),
  ));
  const teamIdsToInspect = Array.from(new Set([...currentDivisionTeamIds, ...activeRegisteredTeamIds]));
  const placeholderTeamIdKeys = await loadPlaceholderTeamIdKeys(teamIdsToInspect, client);
  const activeTeamRowsForSync = activeTeamRows.filter((row) => !placeholderTeamIdKeys.has(normalizeIdKey(row.registrantId) ?? ''));
  const activeTeamIds = Array.from(new Set(activeTeamRowsForSync.map((row) => row.registrantId).filter(Boolean)));

  const divisionIdByExactId = new Map<string, string>();
  const divisionIdByUniqueKey = new Map<string, string | null>();
  const divisionIdByUniqueToken = new Map<string, string | null>();
  leagueRows.forEach((row) => {
    const rowId = normalizeId(row.id);
    if (!rowId) {
      return;
    }
    divisionIdByExactId.set(rowId.toLowerCase(), row.id);
    registerUniqueDivisionReference(divisionIdByUniqueKey, row.key, row.id);
    registerUniqueDivisionReference(divisionIdByUniqueToken, extractDivisionTokenFromId(row.id), row.id);
    registerUniqueDivisionReference(divisionIdByUniqueToken, extractDivisionTokenFromId(row.key), row.id);
  });

  const resolveDivisionReference = (value: unknown): string | null => {
    const normalized = normalizeId(value)?.toLowerCase() ?? null;
    if (!normalized) {
      return null;
    }

    const exactIdMatch = divisionIdByExactId.get(normalized);
    if (exactIdMatch) {
      return exactIdMatch;
    }
    const phaseEntryIds = entryIdsByPhaseId.get(normalized);
    if (phaseEntryIds?.length === 1) {
      return phaseEntryIds[0];
    }
    if (phaseEntryIds && phaseEntryIds.length > 1) {
      return null;
    }

    const keyMatch = divisionIdByUniqueKey.get(normalized);
    if (keyMatch) {
      return keyMatch;
    }
    if (keyMatch === null) {
      return null;
    }

    const token = extractDivisionTokenFromId(normalized);
    const tokenMatch = token ? divisionIdByUniqueToken.get(token) : undefined;
    return tokenMatch ?? null;
  };

  const teamIdsByDivisionId = new Map<string, string[]>();
  activeTeamRowsForSync.forEach((row) => {
    const divisionId = resolveDivisionReference(row.divisionId);
    if (!divisionId) {
      return;
    }
    const existing = teamIdsByDivisionId.get(divisionId) ?? [];
    if (!existing.includes(row.registrantId)) {
      existing.push(row.registrantId);
    }
    teamIdsByDivisionId.set(divisionId, existing);
  });

  const now = new Date();
  const eventDivisionIds = leagueRows.map((row) => row.id.toLowerCase());
  const primaryDivisionId = eventDivisionIds
    .map((divisionId) => resolveDivisionReference(divisionId))
    .find((divisionId): divisionId is string => Boolean(divisionId));
  const primaryDivision = leagueRows.find((row) => row.id === primaryDivisionId) ?? leagueRows[0];
  const buildNextTeamIds = (divisionId: string, assignedTeamIds: string[]): string[] => {
    const assigned = new Set(assignedTeamIds);
    const nextTeamIds = (currentTeamIdsByDivisionId.get(divisionId) ?? [])
      .filter((teamId) => assigned.has(teamId) || placeholderTeamIdKeys.has(normalizeIdKey(teamId) ?? ''));
    assignedTeamIds.forEach((teamId) => {
      if (!nextTeamIds.includes(teamId)) {
        nextTeamIds.push(teamId);
      }
    });
    return Array.from(new Set(nextTeamIds));
  };

  await Promise.all(
    leagueRows.map((row) => {
      const nextTeamIds = Boolean(event.singleDivision)
        ? (row.id === primaryDivision.id ? buildNextTeamIds(row.id, activeTeamIds) : buildNextTeamIds(row.id, []))
        : buildNextTeamIds(row.id, teamIdsByDivisionId.get(row.id) ?? []);
      return client.divisions.update({
        where: { id: row.id },
        data: {
          teamIds: nextTeamIds,
          updatedAt: now,
        },
      });
    }),
  );
  return activeTeamIds;
};

export const buildEventParticipantSnapshot = async (params: {
  event: EventLike;
  occurrence?: WeeklyOccurrenceInput | null;
  includeRegistrations?: boolean;
}, client: PrismaLike = prisma): Promise<EventParticipantSnapshot> => {
  const resolvedOccurrence = isWeeklyParentEvent(params.event)
    ? (() => {
      if (!params.occurrence?.slotId || !params.occurrence?.occurrenceDate) {
        return null;
      }
      return resolveWeeklyOccurrence({
        event: params.event,
        occurrence: params.occurrence,
      }, client);
    })()
    : null;

  const occurrenceResult = resolvedOccurrence ? await resolvedOccurrence : null;
  if (occurrenceResult && !occurrenceResult.ok) {
    throw new Error(occurrenceResult.error);
  }
  const occurrence = occurrenceResult?.ok ? occurrenceResult.value : null;

  const registrations = await client.eventRegistrations.findMany({
    where: {
      eventId: params.event.id,
      ...buildOccurrenceWhere(occurrence ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      } : null),
    },
    select: registrationSelect,
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as RegistrationRow[];

  const divisionRows = await client.divisions.findMany({
    where: {
      eventId: params.event.id,
      scope: 'EVENT',
      status: 'ACTIVE',
      role: 'ENTRY',
      OR: [
        { kind: 'LEAGUE' as any },
        { kind: null },
      ],
    },
    select: participantDivisionSelect,
    orderBy: [
      { sortOrder: 'asc' } as any,
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  const teamIds = Array.from(new Set(
    registrations
      .filter((row) => row.registrantType === 'TEAM')
      .map((row) => row.registrantId),
  ));
  const userIds = Array.from(new Set(
    registrations
      .filter((row) => row.registrantType === 'SELF' || row.registrantType === 'CHILD')
      .map((row) => row.registrantId),
  ));

  const [teams, selectedUsers] = await Promise.all([
    teamIds.length
      ? client.teams.findMany({
        where: { id: { in: teamIds } },
      })
      : Promise.resolve([]),
    userIds.length
      ? client.userData.findMany({
        where: { id: { in: userIds } },
      })
      : Promise.resolve([]),
  ]);
  const users = await withDerivedCanonicalTeamIds(selectedUsers, client);
  const parentTeamIds = Array.from(new Set(
    (teams as Array<{ parentTeamId?: unknown }>)
      .map((team) => normalizeId(team.parentTeamId))
      .filter((teamId): teamId is string => Boolean(teamId)),
  ));
  const parentTeams = parentTeamIds.length
    && typeof (client as any).canonicalTeams?.findMany === 'function'
    ? await client.canonicalTeams.findMany({
      where: { id: { in: parentTeamIds } },
      select: {
        id: true,
        organizationId: true,
        createdBy: true,
        openRegistration: true,
        joinPolicy: true,
        registrationPriceCents: true,
        requiredTemplateIds: true,
        visibility: true,
      },
    })
    : [];
  const parentTeamsById = new Map(
    parentTeams.map((team) => [team.id, team]),
  );
  const enrichEventTeamRegistrationMetadata = (team: any) => {
    const parentTeamId = normalizeId(team?.parentTeamId);
    const parentTeam = parentTeamId ? parentTeamsById.get(parentTeamId) : null;
    if (!parentTeam) {
      return team;
    }
    return {
      ...team,
      organizationId: parentTeam.organizationId ?? team.organizationId ?? null,
      createdBy: parentTeam.createdBy ?? team.createdBy ?? null,
      openRegistration: parentTeam.openRegistration,
      joinPolicy: parentTeam.joinPolicy,
      registrationPriceCents: parentTeam.registrationPriceCents,
      requiredTemplateIds: parentTeam.requiredTemplateIds ?? [],
      visibility: parentTeam.visibility,
    };
  };
  const placeholderTeamIds = new Set<string>(
    (teams as Array<{ id?: unknown; kind?: unknown; captainId?: unknown; parentTeamId?: unknown }>)
      .filter(isPlaceholderTeamRow)
      .map((team) => normalizeIdKey(team.id))
      .filter((teamId): teamId is string => Boolean(teamId)),
  );
  const teamsById = new Map<string, any>(
    (teams as any[])
      .map((team) => [normalizeIdKey(team.id), team])
      .filter((entry): entry is [string, any] => Boolean(entry[0])),
  );
  const isDisplayableTeamRegistration = (row: RegistrationRow): boolean => (
    row.registrantType !== 'TEAM'
    || (
      !placeholderTeamIds.has(normalizeIdKey(row.registrantId) ?? '')
      && !placeholderTeamIds.has(normalizeIdKey(row.eventTeamId) ?? '')
    )
  );
  const teamRegistrationIdentityKey = (row: RegistrationRow): string | null => {
    if (row.registrantType !== 'TEAM') {
      return null;
    }
    const eventTeam = teamsById.get(normalizeIdKey(row.eventTeamId) ?? '')
      ?? teamsById.get(normalizeIdKey(row.registrantId) ?? '');
    return normalizeIdKey(row.parentId)
      ?? normalizeIdKey(eventTeam?.parentTeamId)
      ?? normalizeIdKey(row.eventTeamId)
      ?? normalizeIdKey(row.registrantId);
  };
  const compareTeamRegistrationFreshness = (left: RegistrationRow, right: RegistrationRow): number => {
    const leftUpdatedAt = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightUpdatedAt = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    if (leftUpdatedAt !== rightUpdatedAt) {
      return leftUpdatedAt - rightUpdatedAt;
    }
    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }
    return String(left.id).localeCompare(String(right.id));
  };
  const dedupeTeamParticipantEntries = (rows: RegistrationRow[]): RegistrationRow[] => {
    if (!Boolean(params.event.teamSignup)) {
      return rows;
    }
    const selectedByIdentity = new Map<string, RegistrationRow>();
    const passthroughRows: RegistrationRow[] = [];
    rows.forEach((row) => {
      if (row.registrantType !== 'TEAM') {
        passthroughRows.push(row);
        return;
      }
      const identityKey = teamRegistrationIdentityKey(row);
      if (!identityKey) {
        passthroughRows.push(row);
        return;
      }
      const existing = selectedByIdentity.get(identityKey);
      if (!existing || compareTeamRegistrationFreshness(existing, row) < 0) {
        selectedByIdentity.set(identityKey, row);
      }
    });
    const selectedIds = new Set(Array.from(selectedByIdentity.values()).map((row) => row.id));
    return rows.filter((row) => row.registrantType !== 'TEAM' || selectedIds.has(row.id));
  };

  const participantEntries = dedupeTeamParticipantEntries(
    registrations.filter(isRegisteredParticipant).filter(isDisplayableTeamRegistration),
  );
  const waitlistEntries = registrations.filter((row) => isDisplayableRole(row, 'WAITLIST'));
  const freeAgentEntries = registrations.filter((row) => isDisplayableRole(row, 'FREE_AGENT'));
  const participantCount = dedupeRegistrationCapacityRows(
    params.event,
    participantEntries,
  ).length;

  const participantCapacity = await eventCapacityForDivisions({
    event: params.event,
    divisionIds: occurrence?.divisionIds,
  }, client);

  const uniqueRegistrantIds = (rows: RegistrationRow[], allowedTypes: RegistrationRegistrantType[]) => (
    Array.from(new Set(
      rows
        .filter((row) => allowedTypes.includes(row.registrantType))
        .map((row) => normalizeId(row.registrantId))
        .filter((value): value is string => Boolean(value)),
    ))
  );

  const divisionRowReferences = new Map<string, typeof divisionRows[number] | null>();
  const registerDivisionRowReference = (value: unknown, row: typeof divisionRows[number]) => {
    resolveDivisionAliases(normalizeId(value))
      .forEach((alias) => {
        const existing = divisionRowReferences.get(alias);
        if (existing === undefined) {
          divisionRowReferences.set(alias, row);
        } else if (existing?.id !== row.id) {
          divisionRowReferences.set(alias, null);
        }
      });
  };
  divisionRows.forEach((row) => {
    registerDivisionRowReference(row.id, row);
    registerDivisionRowReference(row.key, row);
  });
  const findCanonicalDivisionRow = (value: unknown): typeof divisionRows[number] | null => {
    const normalized = normalizeId(value)?.toLowerCase() ?? null;
    if (!normalized) {
      return null;
    }
    const direct = divisionRowReferences.get(normalized);
    if (direct) {
      return direct;
    }
    const token = extractDivisionTokenFromId(normalized);
    return token ? (divisionRowReferences.get(token) ?? null) : null;
  };

  const resolveDivisionIdentity = (row?: Pick<RegistrationRow, 'divisionId' | 'divisionTypeId' | 'divisionTypeKey'> | null): {
    divisionId: string | null;
    divisionTypeId: string | null;
    divisionTypeKey: string | null;
  } => {
    const explicitDivisionId = normalizeId(row?.divisionId);
    const canonicalDivision = findCanonicalDivisionRow(explicitDivisionId);
    const divisionId = normalizeId(canonicalDivision?.id)
      ?? explicitDivisionId
      ?? normalizeId(divisionRows[0]?.id);
    const matchingDivision = canonicalDivision ?? divisionRows.find((entry) => entry.id === divisionId);
    const divisionTypeId = normalizeId(matchingDivision?.divisionTypeId)
      ?? normalizeId(row?.divisionTypeId);
    const divisionTypeKey = normalizeId(matchingDivision?.key)
      ?? normalizeId(row?.divisionTypeKey)
      ?? (divisionId ? extractDivisionTokenFromId(divisionId) : null)
      ?? null;
    return {
      divisionId,
      divisionTypeId,
      divisionTypeKey,
    };
  };

  const divisionGroups = new Map<string, EventParticipantDivisionIds>();
  const toDivisionKey = (identity: { divisionId: string | null; divisionTypeId: string | null; divisionTypeKey: string | null }) => (
    `${identity.divisionId ?? ''}::${identity.divisionTypeId ?? ''}::${identity.divisionTypeKey ?? ''}`
  );
  const ensureDivisionGroup = (identity: { divisionId: string | null; divisionTypeId: string | null; divisionTypeKey: string | null }) => {
    const key = toDivisionKey(identity);
    const existing = divisionGroups.get(key);
    if (existing) {
      return existing;
    }
    const created: EventParticipantDivisionIds = {
      divisionId: identity.divisionId,
      divisionTypeId: identity.divisionTypeId,
      divisionTypeKey: identity.divisionTypeKey,
      teamIds: [],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    };
    divisionGroups.set(key, created);
    return created;
  };
  const pushUnique = (values: string[], value: string | null) => {
    if (!value || values.includes(value)) {
      return;
    }
    values.push(value);
  };

  divisionRows.forEach((row) => {
    ensureDivisionGroup(resolveDivisionIdentity({
      divisionId: row.id,
      divisionTypeId: row.divisionTypeId,
      divisionTypeKey: row.key ?? extractDivisionTokenFromId(row.id) ?? null,
    }));
  });

  participantEntries.forEach((row) => {
    const group = ensureDivisionGroup(resolveDivisionIdentity(row));
    if (row.registrantType === 'TEAM') {
      pushUnique(group.teamIds, normalizeId(row.registrantId));
    } else {
      pushUnique(group.userIds, normalizeId(row.registrantId));
    }
  });
  waitlistEntries.forEach((row) => {
    const group = ensureDivisionGroup(resolveDivisionIdentity(row));
    pushUnique(group.waitListIds, normalizeId(row.registrantId));
  });
  freeAgentEntries.forEach((row) => {
    const group = ensureDivisionGroup(resolveDivisionIdentity(row));
    pushUnique(group.freeAgentIds, normalizeId(row.registrantId));
  });

  const divisionWarnings: EventParticipantDivisionWarning[] = [];
  if (Boolean(params.event.teamSignup)) {
    const filledCountsByDivisionId = new Map<string, number>();
    participantEntries
      .filter((row) => row.registrantType === 'TEAM')
      .forEach((row) => {
        const divisionId = resolveDivisionIdentity(row).divisionId;
        if (!divisionId) {
          return;
        }
        filledCountsByDivisionId.set(divisionId, (filledCountsByDivisionId.get(divisionId) ?? 0) + 1);
      });

    divisionRows.forEach((row) => {
      const divisionId = normalizeId(row.id);
      if (!divisionId || String(row.kind ?? 'LEAGUE').toUpperCase() === 'PLAYOFF') {
        return;
      }
      const maxTeams = positiveInt(row.maxParticipants)
        ?? (Boolean(params.event.singleDivision) ? positiveInt(params.event.maxParticipants) : null);
      if (!maxTeams) {
        return;
      }
      const filledCount = filledCountsByDivisionId.get(divisionId) ?? 0;
      const slotCount = normalizeIdList(row.teamIds).length;
      if (filledCount > maxTeams) {
        divisionWarnings.push({
          divisionId,
          code: 'OVER_CAPACITY',
          message: `This division has ${filledCount} teams, which is over the ${maxTeams}-team limit.`,
          filledCount,
          slotCount,
          maxTeams,
        });
      }
      if (slotCount < maxTeams) {
        divisionWarnings.push({
          divisionId,
          code: 'MISSING_PLACEHOLDERS',
          message: `This division has ${slotCount} team slots for a ${maxTeams}-team max. Rebuilding the event will create the missing placeholders.`,
          filledCount,
          slotCount,
          maxTeams,
        });
      }
    });
  }

  return {
    participants: {
      teamIds: uniqueRegistrantIds(participantEntries, ['TEAM']),
      userIds: uniqueRegistrantIds(participantEntries, ['SELF', 'CHILD']),
      waitListIds: Array.from(new Set(
        waitlistEntries
          .map((row) => normalizeId(row.registrantId))
          .filter((value): value is string => Boolean(value)),
      )),
      freeAgentIds: Array.from(new Set(
        freeAgentEntries
          .map((row) => normalizeId(row.registrantId))
          .filter((value): value is string => Boolean(value)),
      )),
      divisions: Array.from(divisionGroups.values()),
    },
    registrations: params.includeRegistrations
      ? {
        teams: participantEntries
          .filter((row) => row.registrantType === 'TEAM')
          .map(toEntry),
        users: participantEntries
          .filter((row) => row.registrantType === 'SELF')
          .map(toEntry),
        children: participantEntries
          .filter((row) => row.registrantType === 'CHILD')
          .map(toEntry),
        waitlist: waitlistEntries.map(toEntry),
        freeAgents: freeAgentEntries.map(toEntry),
      }
      : undefined,
    teams: (() => {
      const displayableTeamIds = new Set(uniqueRegistrantIds(participantEntries, ['TEAM']).map((teamId) => teamId.toLowerCase()));
      return (teams as any[]).filter((team) => {
        const teamId = normalizeIdKey(team.id);
        return Boolean(teamId && displayableTeamIds.has(teamId) && !placeholderTeamIds.has(teamId));
      }).map(enrichEventTeamRegistrationMetadata);
    })(),
    users,
    participantCount,
    participantCapacity,
    occurrence: occurrence
      ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      }
      : null,
    divisionWarnings,
  };
};

export const reserveCapacityRows = (
  event: Pick<EventLike, 'teamSignup'>,
  rows: RegistrationRow[],
): number => dedupeRegistrationCapacityRows(event, rows).length;

export const getEventParticipantIds = async (
  eventIds: string[],
  client: PrismaLike = prisma,
  occurrence?: WeeklyOccurrenceInput | null,
): Promise<Map<string, EventParticipantIds>> => {
  const normalizedEventIds = normalizeIdList(eventIds);
  const response = new Map<string, EventParticipantIds>();
  normalizedEventIds.forEach((eventId) => response.set(eventId, emptyParticipantIds()));
  if (!normalizedEventIds.length || typeof (client as any).eventRegistrations?.findMany !== 'function') {
    return response;
  }
  const occurrenceSlotId = normalizeId(occurrence?.slotId);
  const occurrenceDate = normalizeId(occurrence?.occurrenceDate);
  const occurrenceWhere = occurrenceSlotId && occurrenceDate
    ? { slotId: occurrenceSlotId, occurrenceDate }
    : { slotId: null, occurrenceDate: null };

  const rows = await client.eventRegistrations.findMany({
    where: {
      eventId: { in: normalizedEventIds },
      status: { in: Array.from(DISPLAY_MEMBER_STATUSES) },
      ...occurrenceWhere,
    },
    select: {
      eventId: true,
      registrantId: true,
      eventTeamId: true,
      sourceTeamRegistrationId: true,
      registrantType: true,
      rosterRole: true,
      status: true,
      acceptedAt: true,
      createdAt: true,
      id: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  const placeholderTeamIdKeys = await loadPlaceholderTeamIdKeys(
    rows
      .filter((row) => row.registrantType === 'TEAM')
      .flatMap((row) => [row.registrantId, row.eventTeamId])
      .filter((teamId): teamId is string => Boolean(teamId)),
    client,
  );

  rows.forEach((row) => {
    const eventId = normalizeId(row.eventId);
    const registrantId = normalizeId(row.registrantId);
    const role = normalizeRosterRole(row.rosterRole);
    if (
      row.registrantType === 'TEAM'
      && (
        placeholderTeamIdKeys.has(normalizeIdKey(row.registrantId) ?? '')
        || placeholderTeamIdKeys.has(normalizeIdKey(row.eventTeamId) ?? '')
      )
    ) {
      return;
    }
    if (!eventId || !registrantId) {
      return;
    }
    const ids = response.get(eventId) ?? emptyParticipantIds();
    if (role === 'PARTICIPANT') {
      if (row.registrantType === 'TEAM') {
        pushUnique(ids.teamIds, registrantId);
      } else if (row.registrantType === 'SELF' || row.registrantType === 'CHILD') {
        pushUnique(ids.userIds, registrantId);
      }
    } else if (role === 'WAITLIST') {
      pushUnique(ids.waitListIds, registrantId);
    } else if (role === 'FREE_AGENT') {
      pushUnique(ids.freeAgentIds, registrantId);
    }
    response.set(eventId, ids);
  });

  return response;
};

export const getEventParticipantIdsForEvent = async (
  eventId: string,
  client: PrismaLike = prisma,
  occurrence?: WeeklyOccurrenceInput | null,
): Promise<EventParticipantIds> => {
  const ids = await getEventParticipantIds([eventId], client, occurrence);
  return ids.get(eventId) ?? emptyParticipantIds();
};

export const withDerivedEventParticipantIds = async <T extends { id: string }>(
  events: T[],
  client: PrismaLike = prisma,
): Promise<Array<T & EventParticipantIds>> => {
  const idsByEventId = await getEventParticipantIds(events.map((event) => event.id), client);
  return events.map((event) => ({
    ...event,
    ...(idsByEventId.get(event.id) ?? emptyParticipantIds()),
  }));
};

export const getEventParticipantAggregates = async (
  events: EventLike[],
  client: PrismaLike = prisma,
): Promise<Map<string, { participantCount: number | null; participantCapacity: number | null }>> => {
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const nonWeeklyIds = events
    .filter((event) => !isWeeklyParentEvent(event))
    .map((event) => event.id);

  const response = new Map<string, { participantCount: number | null; participantCapacity: number | null }>();
  events.forEach((event) => {
    response.set(event.id, {
      participantCount: isWeeklyParentEvent(event) ? null : 0,
      participantCapacity: isWeeklyParentEvent(event) ? null : positiveInt(event.maxParticipants),
    });
  });

  if (!nonWeeklyIds.length) {
    return response;
  }

  const registrations = await client.eventRegistrations.findMany({
    where: {
      eventId: { in: nonWeeklyIds },
      status: { in: Array.from(DISPLAY_MEMBER_STATUSES) },
    },
    select: {
      id: true,
      eventId: true,
      registrantId: true,
      parentId: true,
      eventTeamId: true,
      sourceTeamRegistrationId: true,
      registrantType: true,
      rosterRole: true,
      status: true,
      acceptedAt: true,
      slotId: true,
      occurrenceDate: true,
    },
  });

  const placeholderTeamIdKeys = await loadPlaceholderTeamIdKeys(
    registrations
      .filter((row) => row.registrantType === 'TEAM')
      .flatMap((row) => [row.registrantId, row.eventTeamId])
      .filter((teamId): teamId is string => Boolean(teamId)),
    client,
  );

  const seenCapacityIdentities = new Map<string, Set<string>>();
  registrations.forEach((row) => {
    if (normalizeId(row.slotId) || normalizeId(row.occurrenceDate)) {
      return;
    }
    const event = eventMap.get(row.eventId);
    if (!event || isWeeklyParentEvent(event)) {
      return;
    }
    if (
      Boolean(event.teamSignup)
      && row.registrantType === 'TEAM'
      && (
        placeholderTeamIdKeys.has(normalizeIdKey(row.registrantId) ?? '')
        || placeholderTeamIdKeys.has(normalizeIdKey(row.eventTeamId) ?? '')
      )
    ) {
      return;
    }
    const identity = registrationCapacityIdentityKey(event, row);
    if (!identity) {
      return;
    }
    const eventIdentities = seenCapacityIdentities.get(row.eventId) ?? new Set<string>();
    if (eventIdentities.has(identity)) {
      return;
    }
    eventIdentities.add(identity);
    seenCapacityIdentities.set(row.eventId, eventIdentities);
    const aggregate = response.get(row.eventId) ?? { participantCount: 0, participantCapacity: null };
    aggregate.participantCount = (aggregate.participantCount ?? 0) + 1;
    response.set(row.eventId, aggregate);
  });

  const capacities = await eventCapacitiesForEvents(
    nonWeeklyIds.map((eventId) => eventMap.get(eventId)!),
    client,
  );

  capacities.forEach((capacity, eventId) => {
    const current = response.get(eventId) ?? { participantCount: 0, participantCapacity: null };
    current.participantCapacity = capacity;
    response.set(eventId, current);
  });

  return response;
};
