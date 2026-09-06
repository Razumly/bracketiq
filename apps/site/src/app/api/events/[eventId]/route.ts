import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import { buildRefundCreateParamsForPaymentIntent } from '@/lib/stripeConnectAccounts';
import { parseDateInput } from '@/server/requestParsing';
import {
  canManageEvent,
  projectEventAuthorityCapabilities,
} from '@/server/accessControl';
import { protectAffiliateRow, withAffiliateOutboundAction } from '@/server/affiliateOutbound';
import {
  buildEventDivisionId,
  cleanDivisionDisplayName,
  deriveDivisionTypeDisplayName,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
  normalizeDivisionTypeIds,
} from '@/lib/divisionTypes';
import {
  normalizeManualPaymentInstructions,
  normalizeManualPaymentLinks,
  normalizeRegistrationPaymentMode,
} from '@/lib/manualRegistrationPayments';
import {
  buildEventOfficialPositionsFromTemplates,
  normalizeEventOfficialPositions,
  normalizeSportOfficialPositionTemplates,
} from '@/server/officials/config';
import { normalizeEventStaffingResponse } from '@/server/events/eventResponse';

import type { LeagueDivisionConfig } from '@/server/scheduler/types';
import {
  getEventParticipantIdsForEvent,
  hasJoinedEventParticipant,
} from '@/server/events/eventRegistrations';
import { hasProtectedEventHistory } from '@/server/events/eventProtectedHistory';
import { generatedPoolsForBracket } from '@/server/events/tournamentPools';
import { getEventTagsForEventIds } from '@/server/eventTags';
import { deleteOrArchiveEvent, toDeleteOrArchiveResponse } from '@/server/deletion/archivePolicy';
import { resolveRelationalEventDivisionIds } from '@/lib/eventApiDivisionIds';

export const dynamic = 'force-dynamic';
const RESTRICTED_EVENT_STATES = new Set(['TEMPLATE', 'UNPUBLISHED', 'DRAFT']);

const normalizeResponseLists = (response: Record<string, any>, fields: string[]) => {
  for (const field of fields) {
    if (!Array.isArray(response[field])) response[field] = [];
  }
};
const normalizeEventCheckInResponse = (response: Record<string, any>) => {
  const legacyTeamCheckInMode = typeof (response as any).teamCheckInMode === 'string'
    ? (response as any).teamCheckInMode.trim().toUpperCase()
    : 'OFF';
  (response as any).teamCheckInMode =
    (response as any).teamSignup === true && ['OFF', 'EVENT', 'MATCH'].includes(legacyTeamCheckInMode)
      ? legacyTeamCheckInMode
      : 'OFF';
  const legacyOpenMinutes = Number((response as any).teamCheckInOpenMinutesBefore);
  (response as any).teamCheckInOpenMinutesBefore = Number.isFinite(legacyOpenMinutes)
    ? Math.max(0, Math.trunc(legacyOpenMinutes))
    : 60;
  (response as any).allowMatchRosterEdits =
    (response as any).teamSignup === true && typeof (response as any).allowMatchRosterEdits === 'boolean'
      ? Boolean((response as any).allowMatchRosterEdits)
      : false;
  (response as any).allowTemporaryMatchPlayers =
    (response as any).allowMatchRosterEdits === true && typeof (response as any).allowTemporaryMatchPlayers === 'boolean'
      ? Boolean((response as any).allowTemporaryMatchPlayers)
      : false;
};

const toEventResponse = (row: any) => {
  const response = { ...row };
  (response as any).divisions = resolveRelationalEventDivisionIds((response as any).divisionDetails);
  normalizeResponseLists(response, ['waitListIds', 'freeAgentIds', 'officialIds', 'officialPositions', 'eventOfficials']);
  normalizeEventStaffingResponse(response as Record<string, unknown>);

  normalizeResponseLists(response, ['assistantHostIds', 'requiredTemplateIds']);
  (response as any).registrationPaymentMode = normalizeRegistrationPaymentMode((response as any).registrationPaymentMode);
  (response as any).manualPaymentLinks = normalizeManualPaymentLinks((response as any).manualPaymentLinks);
  (response as any).manualPaymentInstructions = normalizeManualPaymentInstructions(
    (response as any).manualPaymentInstructions,
  );
  if (typeof (response as any).noFixedEndDateTime !== 'boolean') {
    (response as any).noFixedEndDateTime = false;
  }
  if ((response as any).doTeamsOfficiate !== true) {
    (response as any).teamOfficialsMaySwap = false;
  } else if (typeof (response as any).teamOfficialsMaySwap !== 'boolean') {
    (response as any).teamOfficialsMaySwap = false;
  }
  normalizeEventCheckInResponse(response);
  return response;
};

const PUBLIC_EVENT_FIELDS = [
  'id', 'name', 'description', 'eventType', 'state', 'start', 'end',
  'noFixedEndDateTime', 'timeZone', 'location', 'address', 'coordinates',
  'imageId', 'sportIds', 'organizationId', 'organization', 'tags',
  'teamSignup', 'price', 'maxParticipants', 'minAge', 'maxAge', 'gender',
  'registrationCutoffHours', 'cancellationRefundHours', 'affiliateUrl',
  'fieldIds', 'timeSlotIds', 'leagueScoringConfigId', 'divisionFieldIds',
  'divisionDetails', 'playoffDivisionDetails', 'divisions',
  'includePlayoffsOrPools', 'parentEvent', 'requiredTemplateIds',
  'allowTeamSplitDefault', 'usesSets', 'setsPerMatch', 'pointsToVictory',
  'winBy', 'maxPoints', 'matchDurationMinutes', 'setDurationMinutes',
  'restTimeMinutes', 'matchRulesOverride', 'resolvedMatchRules',
  'staffingPriority', 'officialSchedulingMode', 'teamCheckInMode', 'teamCheckInOpenMinutesBefore',
] as const;

const toPublicEventResponse = (response: Record<string, unknown>): Record<string, unknown> => {
  const projected: Record<string, unknown> = {};
  for (const fieldName of PUBLIC_EVENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(response, fieldName)) {
      projected[fieldName] = response[fieldName];
    }
  }
  const organization = projected.organization;
  projected.sourceType = ['AFFILIATE_IMPORT', 'ORGANIZATION_CREATED', 'USER_CREATED'].includes(String(response.sourceType))
    ? response.sourceType : null;
  if (organization && typeof organization === 'object') {
    const row = organization as Record<string, unknown>;
    projected.organization = {
      id: row.id,
      name: row.name,
      logoId: row.logoId,
      website: row.website,
      publicSlug: row.publicSlug,
      publicPageEnabled: row.publicPageEnabled === true,
    };
  }
  return projected;
};

const getEventTagsForResponse = async (eventId: string) => {
  try {
    const tagsByEventId = await getEventTagsForEventIds([eventId]);
    return tagsByEventId.get(eventId) ?? [];
  } catch (error) {
    console.warn('Failed to load event tags for event response', { eventId, error });
    return [];
  }
};

const loadOfficialResponseRows = async (event: any) => {
  return Promise.all([
    typeof (prisma as any).eventOfficials?.findMany === 'function'
      ? (prisma as any).eventOfficials.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } })
      : Promise.resolve([]),
    event.sportIds?.[0] && typeof (prisma as any).sports?.findUnique === 'function'
      ? (prisma as any).sports.findUnique({
          where: { id: event.sportIds[0] },
          select: { officialPositionTemplates: true } as any,
        })
      : Promise.resolve(null),
  ]);
};

const buildEventOfficialResponse = async (event: any) => {
  const [eventOfficialRows, sportRow] = await loadOfficialResponseRows(event);
  const templatePositions = buildEventOfficialPositionsFromTemplates(
    event.id,
    normalizeSportOfficialPositionTemplates((sportRow as any)?.officialPositionTemplates),
  );
  let officialPositions = (() => {
    const explicit = normalizeEventOfficialPositions((event as any).officialPositions, event.id);
    if (explicit.length) {
      return explicit;
    }
    return templatePositions;
  })();
  if (!officialPositions.length && eventOfficialRows.length) {
    officialPositions = buildEventOfficialPositionsFromTemplates(event.id, [{ name: 'Official', count: 1 }]);
  }
  const eventOfficials = eventOfficialRows.length
    ? (eventOfficialRows as any[])
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          positionIds: normalizeFieldIds(row.positionIds).filter((positionId: string) => (
            officialPositions.some((position) => position.id === positionId)
          )),
          fieldIds: normalizeFieldIds(row.fieldIds).filter((fieldId: string) => (
            normalizeFieldIds(event.fieldIds).includes(fieldId)
          )),
          isActive: row.isActive !== false,
        }))
        .filter((row) => row.positionIds.length > 0)
    : [];
  const normalizedEvent = normalizeEventStaffingResponse({ ...event });
  return {
    staffingPriority: normalizedEvent.staffingPriority,
    officialPositions,
    eventOfficials,
    officialIds: eventOfficials.map((official: { userId: string }) => official.userId),
  };
};
const normalizeDivisionKind = (value: unknown, fallback: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE'): 'LEAGUE' | 'PLAYOFF' => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PLAYOFF') {
    return 'PLAYOFF';
  }
  return 'LEAGUE';
};

const normalizeStandingsOverrides = (value: unknown): Record<string, number> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const rows = Object.entries(value as Record<string, unknown>)
    .map(([teamId, points]) => {
      const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';
      const normalizedPoints = typeof points === 'number' ? points : Number(points);
      if (!normalizedTeamId || !Number.isFinite(normalizedPoints)) {
        return null;
      }
      return [normalizedTeamId, normalizedPoints] as const;
    })
    .filter((row): row is readonly [string, number] => row !== null);
  if (!rows.length) {
    return null;
  }
  return Object.fromEntries(rows);
};

type PlayoffDivisionConfig = {
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

const PLAYOFF_CONFIG_KEYS: ReadonlyArray<keyof PlayoffDivisionConfig> = [
  'doubleElimination',
  'winnerSetCount',
  'loserSetCount',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'prize',
  'fieldCount',
  'restTimeMinutes',
  'matchDurationMinutes',
  'setDurationMinutes',
];

const normalizePlayoffDivisionConfig = (value: unknown): PlayoffDivisionConfig | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = PLAYOFF_CONFIG_KEYS.some(
    (key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined,
  );
  if (!hasConfigValue) {
    return null;
  }

  const normalizeNumber = (input: unknown, fallback: number, min: number = 0): number => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.trunc(parsed));
  };
  const normalizeOptionalDuration = (input: unknown): number | undefined => {
    if (input === null || input === undefined || input === '') {
      return undefined;
    }
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(0, Math.trunc(parsed));
  };

  const normalizePoints = (input: unknown, expectedLength: number): number[] => {
    const values = Array.isArray(input)
      ? input
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
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
    winnerBracketPointsToVictory: normalizePoints(row.winnerBracketPointsToVictory, winnerSetCount),
    loserBracketPointsToVictory: normalizePoints(row.loserBracketPointsToVictory, normalizedLoserSetCount),
    prize: typeof row.prize === 'string' ? row.prize : '',
    fieldCount: normalizeNumber(row.fieldCount, 1, 1),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0, 0),
    matchDurationMinutes: normalizeOptionalDuration(row.matchDurationMinutes),
    setDurationMinutes: normalizeOptionalDuration(row.setDurationMinutes),
  };
};

const normalizeDivisionPlayoffConfigFields = (value: unknown): PlayoffDivisionConfig | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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

type LeagueDivisionConfigPayload = LeagueDivisionConfig;

const LEAGUE_CONFIG_KEYS: ReadonlyArray<keyof LeagueDivisionConfigPayload> = [
  'gamesPerOpponent',
  'usesSets',
  'matchDurationMinutes',
  'setDurationMinutes',
  'setsPerMatch',
  'pointsToVictory',
  'restTimeMinutes',
];

const divisionUsesSets = (row: Record<string, unknown>): boolean | undefined => {
  if (typeof row.usesSets === 'boolean') return row.usesSets;
  return ['setsPerMatch', 'setDurationMinutes', 'pointsToVictory'].some(
    (key) => Object.prototype.hasOwnProperty.call(row, key),
  ) ? true : undefined;
};
const normalizeLeagueDivisionConfig = (value: unknown): LeagueDivisionConfigPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = LEAGUE_CONFIG_KEYS.some(
    (key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined,
  );
  if (!hasConfigValue) {
    return null;
  }

  const normalizeNumber = (input: unknown, min: number): number | undefined => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(min, Math.trunc(parsed));
  };
  const normalizeSetCount = (input: unknown): number | undefined => {
    const parsed = normalizeNumber(input, 1);
    return parsed && [1, 3, 5].includes(parsed) ? parsed : undefined;
  };
  const normalizePoints = (input: unknown, expectedLength: number): number[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const values = input
      .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry))
      .map((entry) => Math.max(1, Math.trunc(entry)));
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const usesSets = divisionUsesSets(row);
  const setsPerMatch = usesSets ? (normalizeSetCount(row.setsPerMatch) ?? 1) : undefined;
  const config: LeagueDivisionConfigPayload = {
    gamesPerOpponent: normalizeNumber(row.gamesPerOpponent, 1),
    usesSets,
    matchDurationMinutes: normalizeNumber(row.matchDurationMinutes, 0),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0),
    setDurationMinutes: usesSets ? normalizeNumber(row.setDurationMinutes, 0) : undefined,
    setsPerMatch,
    pointsToVictory: usesSets ? normalizePoints(row.pointsToVictory, setsPerMatch ?? 1) : undefined,
  };

  return Object.fromEntries(
    Object.entries(config).filter(([, entry]) => entry !== undefined),
  ) as LeagueDivisionConfigPayload;
};

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const keys = value
    .map((entry) => normalizeDivisionKey(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(keys));
};

const normalizeDivisionSortOrder = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const compareDivisionNames = (
  left: { id?: string | null; name?: string | null },
  right: { id?: string | null; name?: string | null },
): number => {
  const nameCompare = String(left.name ?? '').localeCompare(String(right.name ?? ''));
  return nameCompare || String(left.id ?? '').localeCompare(String(right.id ?? ''));
};
const compareDivisionRowsByStoredOrder = <T extends {
  id?: string | null;
  name?: string | null;
  sortOrder?: number | null;
}>(left: T, right: T): number => {
  const leftOrder = normalizeDivisionSortOrder(left.sortOrder);
  const rightOrder = normalizeDivisionSortOrder(right.sortOrder);
  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  return compareDivisionNames(left, right);
};

const normalizePlacementDivisionIds = (value: unknown, eventId: string): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const normalized = normalizeDivisionKey(entry);
    if (!normalized) {
      return '';
    }
    return normalized.includes('__division__') || normalized.startsWith('division_')
      ? normalized
      : buildEventDivisionId(eventId, normalized);
  });
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry)).filter(Boolean)));
};

const normalizeTeamIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeInstallmentAmountList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.round(entry)));
};

const normalizeInstallmentRelativeDayList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
};



const mapDivisionRowsToFieldMap = (
  rows: Array<{ id: string; key: string | null; fieldIds: string[] | null }>,
  divisionKeys: string[],
): Record<string, string[]> => {
  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const rowId = normalizeDivisionKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeDivisionKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  const result: Record<string, string[]> = {};
  for (const divisionKey of divisionKeys) {
    const row = rowsById.get(divisionKey)
      ?? rowsByKey.get(divisionKey)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionKey) ?? '');
    result[divisionKey] = normalizeFieldIds(row?.fieldIds ?? []);
  }
  return result;
};


const getDivisionFieldMapForEvent = async (
  eventId: string,
  divisionKeys: string[],
): Promise<Record<string, string[]>> => {
  if (!divisionKeys.length) {
    return {};
  }
  const normalizedKeys = normalizeDivisionKeys(divisionKeys);
  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId,
      OR: [
        { id: { in: normalizedKeys } },
        { key: { in: normalizedKeys } },
      ],
    },
    select: {
      id: true,
      key: true,
      fieldIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return mapDivisionRowsToFieldMap(rows, normalizedKeys);
};

const groupPhaseParticipants = (phaseParticipantRows: unknown): Map<string, string[]> => {
  const phaseParticipantTeamIdsByDivision = new Map<string, string[]>();
  for (const participant of Array.isArray(phaseParticipantRows) ? phaseParticipantRows : []) {
    const phaseDivisionId = normalizeDivisionKey(participant.phaseDivisionId);
    const eventTeamId = normalizeEntityId(participant.eventTeamId);
    if (!phaseDivisionId || !eventTeamId) continue;
    const teamIds = phaseParticipantTeamIdsByDivision.get(phaseDivisionId) ?? [];
    if (!teamIds.includes(eventTeamId)) teamIds.push(eventTeamId);
    phaseParticipantTeamIdsByDivision.set(phaseDivisionId, teamIds);
  }
  return phaseParticipantTeamIdsByDivision;
};

const numberOrNull = (value: unknown): number | null => typeof value === 'number' ? value : null;

const divisionIdentityResponse = (
  row: Record<string, any>,
  divisionId: string,
  inferred: ReturnType<typeof inferDivisionDetails>,
) => {
  const divisionTypeId = row.divisionTypeId ?? inferred.divisionTypeId;
  const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
  const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
  return {
    id: row.id ?? divisionId,
    key: row.key ?? inferred.token,
    name: cleanDivisionDisplayName(row.name, inferred.defaultName),
    kind: normalizeDivisionKind(row.kind, 'LEAGUE'),
    isSystemGenerated: row.isSystemGenerated ?? null,
    divisionTypeId,
    divisionTypeName: deriveDivisionTypeDisplayName({
      sportInput: row.sportId ?? undefined, gender, ratingType, divisionTypeId,
    }),
    ratingType,
    gender,
    sportId: row.sportId ?? null,
  };
};

const divisionPoolResponse = (
  rows: Parameters<typeof generatedPoolsForBracket>[0], kind: string, divisionId: string,
) => {
  const pools = kind === 'PLAYOFF' ? generatedPoolsForBracket(rows, divisionId) : [];
  const capacities = Array.from(new Set(pools.map((pool) => numberOrNull(pool.maxParticipants))
    .filter((value): value is number => typeof value === 'number')));
  return { poolCount: pools.length || null, poolTeamCount: capacities.length === 1 ? capacities[0] : null };
};

const divisionStandingsResponse = (row: Record<string, any>, kind: string, eventId: string) => {
  const confirmedAt = parseDateInput(row.standingsConfirmedAt);
  const confirmationDate = confirmedAt ? confirmedAt.toISOString() : null;
  return {
    playoffPlacementDivisionIds: kind === 'PLAYOFF' ? [] : normalizePlacementDivisionIds(row.playoffPlacementDivisionIds, eventId),
    standingsOverrides: kind === 'PLAYOFF' ? null : normalizeStandingsOverrides(row.standingsOverrides),
    standingsConfirmedAt: kind === 'PLAYOFF' ? null : confirmationDate,
    standingsConfirmedBy: kind === 'PLAYOFF' ? null : normalizeEntityId(row.standingsConfirmedBy),
  };
};

const divisionPlayoffResponse = (row: Record<string, any>, kind: string) => kind === 'PLAYOFF'
  ? normalizePlayoffDivisionConfig(row.standingsOverrides) ?? normalizePlayoffDivisionConfig(row)
  : normalizeDivisionPlayoffConfigFields(row);

const divisionLeagueResponse = (value: LeagueDivisionConfigPayload | null) => {
  const config: Partial<LeagueDivisionConfigPayload> = value ?? {};
  return {
    gamesPerOpponent: config.gamesPerOpponent ?? null,
    restTimeMinutes: config.restTimeMinutes ?? null,
    usesSets: config.usesSets ?? null,
    matchDurationMinutes: config.matchDurationMinutes ?? null,
    setDurationMinutes: config.setDurationMinutes ?? null,
    setsPerMatch: config.setsPerMatch ?? null,
    pointsToVictory: config.pointsToVictory ?? [],
  };
};

const installmentDatesResponse = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => parseDateInput(entry))
    .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
    .map((entry) => entry.toISOString());
};

const divisionPaymentResponse = (row: Record<string, any>) => ({
  allowPaymentPlans: typeof row.allowPaymentPlans === 'boolean' ? row.allowPaymentPlans : null,
  installmentCount: numberOrNull(row.installmentCount),
  installmentDueDates: installmentDatesResponse(row.installmentDueDates),
  installmentDueRelativeDays: Array.isArray(row.installmentDueRelativeDays) ? normalizeInstallmentRelativeDayList(row.installmentDueRelativeDays) : [],
  installmentAmounts: Array.isArray(row.installmentAmounts) ? normalizeInstallmentAmountList(row.installmentAmounts) : [],
});

const divisionAgeResponse = (
  row: Record<string, any>, eligibility: ReturnType<typeof evaluateDivisionAgeEligibility>,
) => {
  const storedDate = row.ageCutoffDate instanceof Date && !Number.isNaN(row.ageCutoffDate.getTime());
  const ageCutoffDate = storedDate ? row.ageCutoffDate.toISOString()
    : eligibility.applies ? eligibility.cutoffDate.toISOString() : null;
  return {
    ageCutoffDate,
    ageCutoffLabel: row.ageCutoffLabel ?? eligibility.message ?? null,
    ageCutoffSource: row.ageCutoffSource ?? (eligibility.applies ? eligibility.cutoffRule.source : null),
  };
};

const divisionResponseTeamIds = (row: Record<string, any>, kind: string): string[] => {
  const isPhaseRow = String(row.role ?? '').toUpperCase() === 'PHASE';
  return isPhaseRow ? normalizeTeamIds(row.teamIds) : kind === 'PLAYOFF' ? [] : normalizeTeamIds(row.teamIds);
};
const getDivisionDetailsForEvent = async (
  eventId: string,
  divisionKeys: string[],
  eventStart?: Date | null,
  eventDefaults?: {
    price?: number | null;
    maxParticipants?: number | null;
    playoffTeamCount?: number | null;
    allowPaymentPlans?: boolean | null;
    installmentCount?: number | null;
    installmentDueDates?: unknown;
    installmentDueRelativeDays?: unknown;
    installmentAmounts?: unknown;
  },
): Promise<Array<Record<string, unknown>>> => {
  void eventDefaults;
  if (!divisionKeys.length) {
    return [];
  }
  const normalizedKeys = normalizeDivisionKeys(divisionKeys);
  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId,
      OR: [
        { id: { in: normalizedKeys } },
        { key: { in: normalizedKeys } },
      ],
    },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      role: true,
      phase: true,
      isSystemGenerated: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      playoffTeamCount: true,
      playoffPlacementDivisionIds: true,
      standingsOverrides: true,
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
      allowPaymentPlans: true,
      installmentCount: true,
      installmentDueDates: true,
      installmentDueRelativeDays: true,
      installmentAmounts: true,
      divisionTypeId: true,
      ratingType: true,
      gender: true,
      ageCutoffDate: true,
      ageCutoffLabel: true,
      ageCutoffSource: true,
      fieldIds: true,
      teamIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const allPoolRows = await prisma.divisions.findMany({
    where: {
      eventId,
      role: 'PHASE',
      isSystemGenerated: true,
      phase: 'POOL',
      status: 'ACTIVE',
    },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      isSystemGenerated: true,
      maxParticipants: true,
      playoffTeamCount: true,
      playoffPlacementDivisionIds: true,
      teamIds: true,
    },
  });
  const phaseParticipantDelegate = (prisma as any).eventDivisionPhaseParticipants;
  const phaseParticipantRows = typeof phaseParticipantDelegate?.findMany === 'function'
    ? await phaseParticipantDelegate.findMany({
      where: { eventId },
      select: { phaseDivisionId: true, eventTeamId: true },
    })
    : [];
  const phaseParticipantTeamIdsByDivision = groupPhaseParticipants(phaseParticipantRows);
  const hydratedRows = rows.map((row) => {
    if (String((row as any).role ?? '').toUpperCase() !== 'PHASE') return row;
    return {
      ...row,
      teamIds: phaseParticipantTeamIdsByDivision.get(normalizeDivisionKey(row.id) ?? row.id) ?? [],
    };
  });
  const hydratedPoolRows = allPoolRows.map((row) => ({
    ...row,
    teamIds: phaseParticipantTeamIdsByDivision.get(normalizeDivisionKey(row.id) ?? row.id) ?? [],
  }));
  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  hydratedRows.forEach((row) => {
    const rowId = normalizeDivisionKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeDivisionKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  return normalizedKeys.map((divisionId) => {
    const row: Record<string, any> = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
      ?? {};
    const inferred = inferDivisionDetails({
      identifier: row.key ?? row.id ?? divisionId,
      sportInput: row.sportId ?? undefined,
      fallbackName: row.name ?? undefined,
    });
    const identity = divisionIdentityResponse(row, divisionId, inferred);
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId: inferred.divisionTypeId,
      sportInput: row.sportId,
      referenceDate: eventStart ?? null,
    });
    return {
      ...identity,
      price: numberOrNull(row.price),
      maxParticipants: numberOrNull(row.maxParticipants),
      playoffTeamCount: numberOrNull(row.playoffTeamCount),
      ...divisionPoolResponse(hydratedPoolRows, identity.kind, identity.id),
      ...divisionStandingsResponse(row, identity.kind, eventId),
      playoffConfig: divisionPlayoffResponse(row, identity.kind),
      ...divisionLeagueResponse(normalizeLeagueDivisionConfig(row)),
      ...divisionPaymentResponse(row),
      ...divisionAgeResponse(row, ageEligibility),
      fieldIds: normalizeFieldIds(row.fieldIds),
      teamIds: divisionResponseTeamIds(row, identity.kind),
    };
  });
};
const getDivisionKeysForEventKind = async (
  eventId: string,
  kind: 'LEAGUE' | 'PLAYOFF',
  role: 'ENTRY' | 'PHASE' = 'ENTRY',
  client: any = prisma,
): Promise<string[]> => {
  const rows = await client.divisions.findMany({
    where: {
      eventId,
      scope: 'EVENT',
      status: 'ACTIVE',
      role,
      ...(kind === 'LEAGUE'
        ? { kind: 'LEAGUE' }
        : { kind }),
    },
    orderBy: [
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: {
      id: true,
      name: true,
      sortOrder: true,
    },
  });
  return [...rows]
    .sort(compareDivisionRowsByStoredOrder)
    .map((row) => normalizeDivisionKey(row.id))
    .filter((value): value is string => Boolean(value));
};

const getTournamentPoolDivisionKeysForEvent = async (eventId: string): Promise<string[]> => {
  const rows = await prisma.divisions.findMany({
    where: {
      eventId,
      scope: 'EVENT',
      status: 'ACTIVE',
      role: 'PHASE',
      isSystemGenerated: true,
      phase: 'POOL',
    },
    select: {
      id: true,
    },
  });

  return rows
    .map((row) => normalizeDivisionKey(row.id))
    .filter((value): value is string => Boolean(value));
};

const getVisibleDivisionKeysForEventResponse = async (
  eventId: string,
  event: { eventType?: unknown; includePlayoffs?: unknown },
): Promise<string[]> => {
  const baseDivisionKeys = await getDivisionKeysForEventKind(eventId, 'LEAGUE', 'ENTRY');
  const isTournamentPoolPlay = String(event.eventType ?? '').toUpperCase() === 'TOURNAMENT'
    && Boolean(event.includePlayoffs);
  if (!isTournamentPoolPlay) {
    return baseDivisionKeys;
  }
  const poolDivisionKeys = await getTournamentPoolDivisionKeysForEvent(eventId);
  return poolDivisionKeys.length ? poolDivisionKeys : baseDivisionKeys;
};


const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeEntityIdList = (value: unknown): string[] => (
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


const normalizeStripeSecretKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === 'undefined' || normalizedLower === 'null') {
    return null;
  }
  return normalized;
};

const removeEntityIdFromList = (values: unknown, targetId: string): string[] => {
  const normalizedTargetId = normalizeEntityId(targetId);
  if (!normalizedTargetId) {
    return normalizeEntityIdList(values);
  }
  return normalizeEntityIdList(values).filter((value) => value !== normalizedTargetId);
};

const isAlreadyRefundedStripeError = (error: unknown): boolean => {
  const normalizedCode = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code.toLowerCase()
    : '';
  if (normalizedCode === 'charge_already_refunded') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already refunded');
};

const isCancellablePaymentIntentStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized === 'requires_payment_method'
    || normalized === 'requires_confirmation'
    || normalized === 'requires_action'
    || normalized === 'requires_capture'
    || normalized === 'processing';
};

const collectEventBillIds = async (
  eventId: string,
  client: any = prisma,
): Promise<string[]> => {
  const rootRows = await client.bills.findMany({
    where: { eventId },
    select: { id: true },
  });
  const collected = new Set<string>(normalizeEntityIdList(rootRows.map((row: { id: string }) => row.id)));
  let frontier = Array.from(collected);

  while (frontier.length > 0) {
    const childRows = await client.bills.findMany({
      where: { parentBillId: { in: frontier } },
      select: { id: true },
    });
    const nextFrontier: string[] = [];
    childRows.forEach((row: { id: string }) => {
      const normalizedId = normalizeEntityId(row.id);
      if (!normalizedId || collected.has(normalizedId)) {
        return;
      }
      collected.add(normalizedId);
      nextFrontier.push(normalizedId);
    });
    frontier = nextFrontier;
  }

  return Array.from(collected);
};

const refundPaidEventIntent = async (stripe: Stripe, eventId: string, intentId: string): Promise<void> => {
  try {
    await stripe.refunds.create(await buildRefundCreateParamsForPaymentIntent({
      stripe,
      paymentIntentId: intentId,
      reason: 'requested_by_customer',
      metadata: { event_id: eventId, source: 'event_delete' },
    }));
  } catch (error) {
    if (!isAlreadyRefundedStripeError(error)) throw error;
  }
};

const cancelPendingEventIntent = async (stripe: Stripe, intentId: string): Promise<boolean> => {
  try {
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (!isCancellablePaymentIntentStatus(intent.status)) return false;
    await stripe.paymentIntents.cancel(intentId);
    return true;
  } catch (error) {
    console.warn(`Failed to cancel pending PaymentIntent ${intentId} before event delete.`, error);
    return false;
  }
};
const eventBillingStripeClient = (): Stripe | null => {
  const secretKey = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  return secretKey ? new Stripe(secretKey) : null;
};

const settleEventBillingBeforeDelete = async (params: {
  eventId: string;
  billIds: string[];
  client?: any;
}): Promise<{ refundedPaymentIntentIds: string[]; cancelledPaymentIntentIds: string[] }> => {
  if (!params.billIds.length) {
    return {
      refundedPaymentIntentIds: [],
      cancelledPaymentIntentIds: [],
    };
  }

  const client = params.client ?? prisma;
  const paymentRows = await client.billPayments.findMany({
    where: {
      billId: { in: params.billIds },
      paymentIntentId: { not: null },
    },
    select: {
      id: true,
      paymentIntentId: true,
      status: true,
    },
  });

  const byIntentId = new Map<string, { hasPaid: boolean; hasPending: boolean }>();
  paymentRows.forEach((row: { paymentIntentId: string | null; status: string | null }) => {
    const intentId = normalizeEntityId(row.paymentIntentId);
    if (!intentId) {
      return;
    }
    const existing = byIntentId.get(intentId) ?? { hasPaid: false, hasPending: false };
    const normalizedStatus = typeof row.status === 'string' ? row.status.toUpperCase() : '';
    if (normalizedStatus === 'PAID') {
      existing.hasPaid = true;
    } else if (normalizedStatus === '' || normalizedStatus === 'PENDING') {
      existing.hasPending = true;
    }
    byIntentId.set(intentId, existing);
  });

  const paidIntentIds = Array.from(byIntentId.entries())
    .filter(([, state]) => state.hasPaid)
    .map(([intentId]) => intentId);
  const stripe = eventBillingStripeClient();

  if (paidIntentIds.length > 0 && !stripe) {
    throw new Error('Cannot refund paid bills because Stripe is not configured.');
  }

  const refundedPaymentIntentIds: string[] = [];
  const cancelledPaymentIntentIds: string[] = [];

  for (const [intentId, state] of byIntentId.entries()) {
    if (state.hasPaid) {
      await refundPaidEventIntent(stripe!, params.eventId, intentId);
      refundedPaymentIntentIds.push(intentId);
      continue;
    }

    if (!state.hasPending || !stripe) {
      continue;
    }

    if (await cancelPendingEventIntent(stripe, intentId)) cancelledPaymentIntentIds.push(intentId);
  }

  return {
    refundedPaymentIntentIds,
    cancelledPaymentIntentIds,
  };
};

const loadEventResponseData = async (
  eventId: string,
  event: NonNullable<Awaited<ReturnType<typeof prisma.events.findUnique>>>,
  canEdit: boolean,
) => {
  const [
    divisionKeys,
    playoffDivisionKeys,
    hasAcceptedParticipant,
    hasProtectedHistory,
  ] = await Promise.all([
    getVisibleDivisionKeysForEventResponse(eventId, event),
    getDivisionKeysForEventKind(eventId, 'PLAYOFF', 'PHASE'),
    canEdit ? hasJoinedEventParticipant(eventId) : Promise.resolve(false),
    canEdit ? hasProtectedEventHistory(eventId, prisma) : Promise.resolve(false),
  ]);
  const [
    divisionFieldIds,
    divisionDetails,
    playoffDivisionDetails,
    staffInvites,
    participantIds,
    tags,
    organization,
  ] = await Promise.all([
    getDivisionFieldMapForEvent(eventId, divisionKeys),
    getDivisionDetailsForEvent(eventId, divisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentDueRelativeDays: (event as any).installmentDueRelativeDays,
      installmentAmounts: event.installmentAmounts,
    }),
    getDivisionDetailsForEvent(eventId, playoffDivisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentDueRelativeDays: (event as any).installmentDueRelativeDays,
      installmentAmounts: event.installmentAmounts,
    }),
    canEdit
      ? prisma.invites.findMany({
          where: { eventId, type: 'STAFF' },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    canEdit ? getEventParticipantIdsForEvent(eventId) : Promise.resolve({}),
    getEventTagsForResponse(eventId),
    event.organizationId
      ? prisma.organizations.findUnique({
          where: { id: event.organizationId },
          select: {
            id: true,
            name: true,
            logoId: true,
            website: true,
            publicSlug: true,
            publicPageEnabled: true,
            originType: true,
            ownershipStatus: true,
            claimVerificationLevel: true,
            claimedAt: true,
            ownershipVerifiedAt: true,
          },
        })
      : Promise.resolve(null),
  ]);
  return { divisionFieldIds, divisionDetails, playoffDivisionDetails, staffInvites, participantIds, tags, organization, hasAcceptedParticipant, hasProtectedHistory };
};

const eventOrganizationResponse = <T extends { publicPageEnabled: boolean | null; publicSlug: string | null }>(organization: T | null) => (
  organization
    ? {
        ...organization,
        publicSlug: organization.publicPageEnabled ? organization.publicSlug : null,
        publicPageEnabled: organization.publicPageEnabled === true,
      }
    : undefined
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (RESTRICTED_EVENT_STATES.has(String(event.state ?? '').toUpperCase())) {
    const session = await requireSession(_req);
    if (!(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const optionalSession = await getOptionalSession(_req);
  const capabilities = await projectEventAuthorityCapabilities(optionalSession, event);
  const { divisionFieldIds, divisionDetails, playoffDivisionDetails, staffInvites, participantIds, tags, organization, hasAcceptedParticipant, hasProtectedHistory } = await loadEventResponseData(eventId, event, capabilities.canEdit);
  const officialResponse = capabilities.canEdit
    ? await buildEventOfficialResponse(event)
    : {};
  const canExposeAffiliateDestination = capabilities.canEdit;
  const response = toEventResponse({
    ...event,
    organization: eventOrganizationResponse(organization),
    includePlayoffsOrPools: Boolean(event.includePlayoffs),
    eventTypeLocked: hasAcceptedParticipant || hasProtectedHistory,
    registrationUnitLocked: hasAcceptedParticipant,
    eventTypeHasProtectedHistory: hasProtectedHistory,
    ...participantIds,
    ...officialResponse,
    divisionFieldIds,
    divisionDetails,
    playoffDivisionDetails,
    tags,
    staffInvites: staffInvites.map((invite) => invite),
  });
  const authorityResponse = capabilities.canEdit
    ? response
    : toPublicEventResponse(response);
  const protectedResponse = canExposeAffiliateDestination
    ? withAffiliateOutboundAction(authorityResponse, 'event')
    : protectAffiliateRow(authorityResponse, 'event');
  return NextResponse.json(
    { ...protectedResponse, capabilities },
    { status: 200 },
  );
}


export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      fieldIds: true,
      timeSlotIds: true,
      state: true,
      leagueScoringConfigId: true,
      archivedAt: true,
      archivedByUserId: true,
      archiveReason: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await deleteOrArchiveEvent({
    client: prisma,
    event,
    actorUserId: session.userId,
    reason: 'delete_requested',
  });

  return NextResponse.json(toDeleteOrArchiveResponse(result), { status: 200 });
}
