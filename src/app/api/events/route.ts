import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';
import { canManageEvent, hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { isSessionTokenCurrent } from '@/server/authSessions';
import { withEventAttendeeCounts } from '@/app/api/events/participantCounts';
import { withDerivedEventParticipantIds } from '@/server/events/eventRegistrations';
import { getEventOfficialIdsByEventIds } from '@/server/officials/eventOfficials';
import { parseDateInput } from '@/server/requestParsing';
import {
  cleanDivisionDisplayName,
  deriveDivisionTypeDisplayName,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
} from '@/lib/divisionTypes';
import { getEventTagsForEventIds } from '@/server/eventTags';
import {
  normalizeManualPaymentInstructions,
  normalizeManualPaymentLinks,
  normalizeRegistrationPaymentMode,
} from '@/lib/manualRegistrationPayments';
import { resolveRelationalEventDivisionIds } from '@/lib/eventApiDivisionIds';
import { protectAffiliateRow, withAffiliateOutboundAction } from '@/server/affiliateOutbound';
import { loadRelationalEventDivisionIdsByEventId } from '@/server/events/eventDivisionProjection';

export const dynamic = 'force-dynamic';



const coerceArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return undefined;
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
  const nameCompare = String(left.name ?? '').localeCompare(String(right.name ?? ''));
  return nameCompare || String(left.id ?? '').localeCompare(String(right.id ?? ''));
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

const fallbackAttendeeCount = (event: { teamSignup?: boolean | null; userIds?: unknown }): number => {
  if (event.teamSignup) {
    return 0;
  }
  return (coerceArray(event.userIds) ?? []).length;
};

const normalizeOptionalBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return null;
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

const normalizeInstallmentDateList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => parseDateInput(entry))
    .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
    .map((entry) => entry.toISOString());
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
      sourceDivisionId: true,
      key: true,
      fieldIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
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
  const map: Record<string, string[]> = {};
  for (const key of normalizedKeys) {
    const row = rowsById.get(key)
      ?? rowsByKey.get(key)
      ?? rowsByKey.get(extractDivisionTokenFromId(key) ?? '');
    map[key] = normalizeFieldIds(row?.fieldIds ?? []);
  }
  return map;
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
      fieldIds: true,
      teamIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];

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

  const details = normalizedKeys.map((divisionId) => {
    const row = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
      ?? null;
    const inferred = inferDivisionDetails({
      identifier: row?.key ?? row?.id ?? divisionId,
      sportInput: row?.sportId ?? undefined,
      fallbackName: row?.name ?? undefined,
    });
    const divisionTypeId = row?.divisionTypeId ?? inferred.divisionTypeId;
    const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
    const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
    const divisionTypeName = deriveDivisionTypeDisplayName({
      sportInput: row?.sportId ?? undefined,
      gender,
      ratingType,
      divisionTypeId,
    });
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId,
      sportInput: row?.sportId ?? undefined,
      referenceDate: eventStart ?? null,
    });
    const ageCutoffDate = (() => {
      if (row?.ageCutoffDate instanceof Date && !Number.isNaN(row.ageCutoffDate.getTime())) {
        return row.ageCutoffDate.toISOString();
      }
      return ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null;
    })();
    return {
      id: row?.id ?? divisionId,
      sourceDivisionId: row?.sourceDivisionId ?? null,
      key: row?.key ?? inferred.token,
      name: cleanDivisionDisplayName(row?.name, inferred.defaultName),
      divisionTypeId,
      skillDivisionTypeId: row?.skillDivisionTypeId ?? null,
      ageDivisionTypeId: row?.ageDivisionTypeId ?? null,
      divisionTypeName,
      ratingType,
      gender,
      sportId: row?.sportId ?? null,
      price: typeof row?.price === 'number'
        ? row.price
        : null,
      maxParticipants: typeof row?.maxParticipants === 'number'
        ? row.maxParticipants
        : null,
      playoffTeamCount: typeof row?.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : null,
      allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
        ? row.allowPaymentPlans
        : null,
      installmentCount: typeof row?.installmentCount === 'number'
        ? row.installmentCount
        : null,
      installmentDueDates: Array.isArray(row?.installmentDueDates)
        ? row.installmentDueDates
            .map((entry) => parseDateInput(entry))
            .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
            .map((entry) => entry.toISOString())
        : [],
      installmentDueRelativeDays: Array.isArray((row as any)?.installmentDueRelativeDays)
        ? normalizeInstallmentRelativeDayList((row as any).installmentDueRelativeDays)
        : [],
      installmentAmounts: Array.isArray(row?.installmentAmounts)
        ? normalizeInstallmentAmountList(row.installmentAmounts)
        : [],
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
      fieldIds: normalizeFieldIds(row?.fieldIds ?? []),
      teamIds: normalizeTeamIds((row as any)?.teamIds),
    };
  });

  return details;
};

const getDivisionDetailsForEvents = async (
  events: Array<{ id: string; sportIds?: string[] | null }>,
): Promise<Map<string, Array<Record<string, unknown>>>> => {
  const eventIds = events.map((event) => event.id).filter(Boolean);

  const detailsByEventId = new Map<string, Array<Record<string, unknown>>>();
  if (!eventIds.length) {
    return detailsByEventId;
  }

  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId: { in: eventIds },
      scope: 'EVENT',
      status: 'ACTIVE',
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: {
      eventId: true,
      id: true,
      sourceDivisionId: true,
      key: true,
      name: true,
      sortOrder: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      divisionTypeId: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
      ratingType: true,
      gender: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const rowsByEventId = new Map<string, Array<(typeof rows)[number]>>();
  rows.forEach((row) => {
    if (!row.eventId) {
      return;
    }
    const existing = rowsByEventId.get(row.eventId) ?? [];
    existing.push(row);
    rowsByEventId.set(row.eventId, existing);
  });

  events.forEach((event) => {
    const eventRows = [...(rowsByEventId.get(event.id) ?? [])].sort(compareDivisionRowsByStoredOrder);
    const details = eventRows.map((row) => {
      const inferred = inferDivisionDetails({
        identifier: row.key ?? row.id,
        sportInput: row.sportId ?? event.sportIds?.[0] ?? undefined,
        fallbackName: row.name ?? undefined,
      });
      const divisionTypeId = row.divisionTypeId ?? inferred.divisionTypeId;
      const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
      const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
      const divisionTypeName = deriveDivisionTypeDisplayName({
        sportInput: row.sportId ?? event.sportIds?.[0] ?? undefined,
        gender,
        ratingType,
        divisionTypeId,
      });

      return {
        id: row.id,
        sourceDivisionId: row.sourceDivisionId ?? null,
        key: row.key ?? inferred.token,
        name: cleanDivisionDisplayName(row.name, inferred.defaultName),
        divisionTypeId,
        skillDivisionTypeId: row.skillDivisionTypeId ?? null,
        ageDivisionTypeId: row.ageDivisionTypeId ?? null,
        divisionTypeName,
        ratingType,
        gender,
        sportId: row.sportId ?? event.sportIds?.[0] ?? null,
        price: typeof row.price === 'number' ? row.price : null,
        maxParticipants: typeof row.maxParticipants === 'number' ? row.maxParticipants : null,
      };
    });

    detailsByEventId.set(event.id, details);
  });

  return detailsByEventId;
};

const toEventResponse = (row: any) => {
  const response = { ...row };
  (response as any).divisions = resolveRelationalEventDivisionIds((response as any).divisionDetails);
  if (!Array.isArray(response.waitListIds)) {
    (response as any).waitListIds = [];
  }
  if (!Array.isArray(response.freeAgentIds)) {
    (response as any).freeAgentIds = [];
  }
  if (!Array.isArray(response.officialIds)) {
    (response as any).officialIds = [];
  }
  if (!Array.isArray((response as any).officialPositions)) {
    (response as any).officialPositions = [];
  }
  if (!Array.isArray((response as any).eventOfficials)) {
    (response as any).eventOfficials = [];
  }
  if (typeof (response as any).officialSchedulingMode !== 'string') {
    (response as any).officialSchedulingMode = 'SCHEDULE';
  }
  if ((response as any).officialSchedulingMode === 'TEAM_STAFFING') {
    (response as any).doTeamsOfficiate = true;
  }
  if (!Array.isArray((response as any).assistantHostIds)) {
    (response as any).assistantHostIds = [];
  }
  if (!Array.isArray(response.requiredTemplateIds)) {
    (response as any).requiredTemplateIds = [];
  }
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
  return response;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  )
);

const loadEventOrganizationsById = async (
  events: Array<{ organizationId?: string | null }>,
): Promise<Map<string, Record<string, unknown>>> => {
  const organizationIds = uniqueStrings(events.map((event) => event.organizationId));
  if (!organizationIds.length) {
    return new Map();
  }

  const organizations = await prisma.organizations.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      website: true,
      logoId: true,
      publicSlug: true,
      publicPageEnabled: true,
      originType: true,
      ownershipStatus: true,
      claimVerificationLevel: true,
      claimedAt: true,
      ownershipVerifiedAt: true,
    },
  });
  return new Map(organizations.map((organization) => [organization.id, organization]));
};


const resolveSessionContext = async (
  req: NextRequest,
): Promise<{ userId: string; isAdmin: boolean } | null> => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }
  const session = verifySessionToken(token);
  if (!session) {
    return null;
  }
  const userId = typeof session.userId === 'string' ? session.userId.trim() : '';
  if (!userId) {
    return null;
  }
  const authUser = await prisma.authUser.findUnique({
    where: { id: userId },
    select: { disabledAt: true, sessionVersion: true },
  });
  if (!authUser || authUser.disabledAt || !isSessionTokenCurrent(session, authUser.sessionVersion)) {
    return null;
  }
  return {
    userId,
    isAdmin: Boolean(session.isAdmin),
  };
};

const loadHiddenEventIdsForSessionUser = async (
  sessionUserId: string | null,
  isAdmin: boolean,
): Promise<string[]> => {
  if (!sessionUserId || isAdmin) {
    return [];
  }

  const user = await prisma.userData.findUnique({
    where: { id: sessionUserId },
    select: { hiddenEventIds: true },
  });

  return Array.from(
    new Set(
      (user?.hiddenEventIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
};

const HIDDEN_EVENT_STATES = ['UNPUBLISHED', 'PRIVATE'] as const;

const isHiddenEventStateFilter = (
  value: string | undefined,
): value is (typeof HIDDEN_EVENT_STATES)[number] => (
  value === 'UNPUBLISHED' || value === 'PRIVATE'
);

const buildDefaultEventVisibilityClause = (
  sessionUserId: string | null,
  isAdmin: boolean,
  includeManagedOrganizationDrafts: boolean = false,
) => {
  const visibilityOr: any[] = [
    { state: 'PUBLISHED' },
    { state: null },
  ];

  if (isAdmin || includeManagedOrganizationDrafts) {
    visibilityOr.push({ state: { in: [...HIDDEN_EVENT_STATES] } });
  } else if (sessionUserId) {
    visibilityOr.push({
      state: { in: [...HIDDEN_EVENT_STATES] },
      OR: [
        { hostId: sessionUserId },
        { assistantHostIds: { has: sessionUserId } },
      ],
    });
  }

  return {
    AND: [
      { NOT: { state: 'TEMPLATE' } },
      { OR: visibilityOr },
    ],
  };
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const organizationId = params.get('organizationId') || undefined;
  let hostId = params.get('hostId') || undefined;
  const sportId = params.get('sportId') || undefined;
  const eventType = params.get('eventType') || undefined;
  const state = params.get('state') || undefined;
  const limit = Number(params.get('limit') || '100');
  const offset = Number(params.get('offset') || '0');
  const normalizedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), 500)
    : 100;
  const normalizedOffset = Number.isFinite(offset)
    ? Math.max(Math.trunc(offset), 0)
    : 0;
  let templateSession: Awaited<ReturnType<typeof requireSession>> | null = null;

  const normalizedStateRaw = typeof state === 'string' ? state.toUpperCase() : undefined;
  const normalizedState = normalizedStateRaw === 'DRAFT' ? 'UNPUBLISHED' : normalizedStateRaw;
  const sessionContext = await resolveSessionContext(req);
  const sessionUserId = sessionContext?.userId ?? null;
  const isAdminSession = sessionContext?.isAdmin === true;
  const hiddenEventIds = await loadHiddenEventIdsForSessionUser(sessionUserId, isAdminSession);
  if (normalizedState === 'TEMPLATE') {
    templateSession = await requireSession(req);
    if (!templateSession.isAdmin) {
      if (organizationId) {
        const organization = await prisma.organizations.findUnique({
          where: { id: organizationId },
          select: { id: true, ownerId: true },
        });
        if (!(await hasOrgPermission(templateSession, organization, ORG_PERMISSIONS.TEMPLATES_MANAGE))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        // Organization template visibility is org-scoped, not host-scoped.
        hostId = undefined;
      } else {
        // Personal templates are private to the signed-in host.
        if (hostId && hostId !== templateSession.userId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        hostId = templateSession.userId;
      }
    }
  }

  const ids = idsParam
    ? idsParam.split(',').map((id) => id.trim()).filter(Boolean)
    : undefined;
  const includeManagedOrganizationDrafts = (() => {
    if (normalizedState || !organizationId || !sessionContext) {
      return Promise.resolve(false);
    }
    return prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    }).then((organization) => hasOrgPermission(sessionContext, organization, ORG_PERMISSIONS.EVENTS_MANAGE));
  })();
  const canViewOrganizationDrafts = await includeManagedOrganizationDrafts;

  const where: any = { archivedAt: null };
  // Event templates are not real events and should not appear in normal lists.
  if (!normalizedState) {
    const visibilityClause = buildDefaultEventVisibilityClause(
      sessionUserId,
      isAdminSession,
      canViewOrganizationDrafts,
    );
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...visibilityClause.AND];
  }
  if (ids?.length) where.id = { in: ids };
  if (organizationId) where.organizationId = organizationId;
  if (!organizationId && normalizedState === 'TEMPLATE' && templateSession && !templateSession.isAdmin) {
    where.organizationId = null;
  }
  if (hostId) where.hostId = hostId;
  if (sportId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { sportIds: { has: sportId } },
    ];
  }
  if (eventType) where.eventType = eventType;
  if (state) where.state = normalizedState ?? state;
  if (hiddenEventIds.length > 0) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { id: { notIn: hiddenEventIds } }];
  }
  if (isHiddenEventStateFilter(normalizedState) && !isAdminSession) {
    if (canViewOrganizationDrafts) {
      // Organization managers can view hidden events within the scoped organization.
    } else if (sessionUserId) {
      where.OR = [
        { hostId: sessionUserId },
        { assistantHostIds: { has: sessionUserId } },
      ];
    } else {
      where.id = { in: [] };
    }
  }

  const fetchedEvents = await prisma.events.findMany({
    where,
    skip: normalizedOffset,
    take: normalizedLimit + 1,
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
  });
  const events = fetchedEvents.slice(0, normalizedLimit);

  const eventsWithAttendees = await withEventAttendeeCounts(events).catch((error) => {
    console.error('Failed to enrich attendee counts for events list', error);
    return events.map((event) => ({
      ...event,
      attendees: fallbackAttendeeCount(event),
    }));
  });

  const divisionDetailsByEventId = await getDivisionDetailsForEvents(
    eventsWithAttendees.map((event) => ({
      id: event.id,
      sportIds: event.sportIds,
    })),
  ).catch((error) => {
    console.error('Failed to enrich division details for events list', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });

  const eventsWithParticipantIds = await withDerivedEventParticipantIds(eventsWithAttendees).catch((error) => {
    console.error('Failed to enrich participant ids for events list', error);
    return eventsWithAttendees.map((event) => ({
      ...event,
      teamIds: [],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    }));
  });
  const officialIdsByEventId = await getEventOfficialIdsByEventIds(
    eventsWithParticipantIds.map((event) => event.id),
  ).catch((error) => {
    console.error('Failed to enrich official ids for events list', error);
    return new Map<string, string[]>();
  });
  const tagsByEventId = await getEventTagsForEventIds(
    eventsWithParticipantIds.map((event) => event.id),
  ).catch((error) => {
    console.error('Failed to enrich tags for events list', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });
  const organizationsById = await loadEventOrganizationsById(eventsWithParticipantIds).catch((error) => {
    console.error('Failed to enrich event organizations for events list', error);
    return new Map<string, Record<string, unknown>>();
  });

  const normalized = eventsWithParticipantIds.map((row) => {
    const divisionDetails = divisionDetailsByEventId.get(row.id) ?? [];
    const organizationId = typeof row.organizationId === 'string' ? row.organizationId : '';
    const response = toEventResponse({
      ...row,
      organization: organizationId ? organizationsById.get(organizationId) ?? null : null,
      officialIds: officialIdsByEventId.get(row.id) ?? [],
      divisions: divisionDetails.map((division) => division.id).filter((id): id is string => typeof id === 'string'),
      divisionDetails,
      tags: tagsByEventId.get(row.id) ?? [],
    });
    const canExposeAffiliateDestination = isAdminSession
      || (Boolean(sessionUserId) && row.hostId === sessionUserId)
      || (sessionUserId ? Array.isArray(row.assistantHostIds) && row.assistantHostIds.includes(sessionUserId) : false)
      || (Boolean(organizationId) && canViewOrganizationDrafts);
    return canExposeAffiliateDestination
      ? withAffiliateOutboundAction(response, 'event')
      : protectAffiliateRow(response, 'event');
  });

  return NextResponse.json({
    events: normalized,
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      nextOffset: normalizedOffset + events.length,
      hasMore: fetchedEvents.length > normalizedLimit,
    },
  }, { status: 200 });
}

