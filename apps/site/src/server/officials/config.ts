export const STAFFING_PRIORITIES = [
  'FULL_COVERAGE_REQUIRED',
  'TEAM_COVERAGE_REQUIRED',
  'OFFICIAL_COVERAGE_REQUIRED',
  'BEST_AVAILABLE_COVERAGE',
  'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
] as const;
export type StaffingPriority = (typeof STAFFING_PRIORITIES)[number];
export type OfficialAssignmentHolderType = 'OFFICIAL' | 'PLAYER';

export type SportOfficialPositionTemplate = {
  name: string;
  count: number;
};

export type EventOfficialPosition = {
  id: string;
  name: string;
  count: number;
  order: number;
};

export type EventOfficialRecord = {
  id: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive: boolean;
};

export type MatchOfficialAssignment = {
  positionId: string;
  slotIndex: number;
  holderType: OfficialAssignmentHolderType;
  userId: string | null;
  eventOfficialId: string | null;
  checkedIn: boolean;
  hasConflict: boolean;
};

const HOLDER_TYPE_VALUES: Readonly<Record<OfficialAssignmentHolderType, true>> = {
  OFFICIAL: true,
  PLAYER: true,
};
const STAFFING_PRIORITY_VALUES: Readonly<Record<StaffingPriority, true>> = {
  FULL_COVERAGE_REQUIRED: true,
  TEAM_COVERAGE_REQUIRED: true,
  OFFICIAL_COVERAGE_REQUIRED: true,
  BEST_AVAILABLE_COVERAGE: true,
  FULL_COVERAGE_WITH_CONFLICTS_ALLOWED: true,
};


export type StaffingPriorityPolicy = {
  requiresTeamDutySlot: boolean;
  isHardOfficialCoverageRequired: boolean;
  isHardTeamCoverageRequired: boolean;
  isOfficialAssignmentConflictAllowed: boolean;
  isTeamDutySlotReserved: boolean;
  isTeamDutyConflictAllowed: boolean;
};

export const STAFFING_PRIORITY_POLICY: Readonly<Record<StaffingPriority, StaffingPriorityPolicy>> = {
  FULL_COVERAGE_REQUIRED: {
    requiresTeamDutySlot: true,
    isHardOfficialCoverageRequired: true,
    isHardTeamCoverageRequired: true,
    isOfficialAssignmentConflictAllowed: false,
    isTeamDutySlotReserved: true,
    isTeamDutyConflictAllowed: false,
  },
  TEAM_COVERAGE_REQUIRED: {
    requiresTeamDutySlot: true,
    isHardOfficialCoverageRequired: false,
    isHardTeamCoverageRequired: true,
    isOfficialAssignmentConflictAllowed: false,
    isTeamDutySlotReserved: true,
    isTeamDutyConflictAllowed: false,
  },
  OFFICIAL_COVERAGE_REQUIRED: {
    requiresTeamDutySlot: false,
    isHardOfficialCoverageRequired: true,
    isHardTeamCoverageRequired: false,
    isOfficialAssignmentConflictAllowed: false,
    isTeamDutySlotReserved: false,
    isTeamDutyConflictAllowed: false,
  },
  BEST_AVAILABLE_COVERAGE: {
    requiresTeamDutySlot: true,
    isHardOfficialCoverageRequired: false,
    isHardTeamCoverageRequired: false,
    isOfficialAssignmentConflictAllowed: false,
    isTeamDutySlotReserved: false,
    isTeamDutyConflictAllowed: false,
  },
  FULL_COVERAGE_WITH_CONFLICTS_ALLOWED: {
    requiresTeamDutySlot: true,
    isHardOfficialCoverageRequired: true,
    isHardTeamCoverageRequired: true,
    isOfficialAssignmentConflictAllowed: true,
    isTeamDutySlotReserved: false,
    isTeamDutyConflictAllowed: true,
  },
};

export const getStaffingPriorityPolicy = (
  priority: StaffingPriority,
): StaffingPriorityPolicy => STAFFING_PRIORITY_POLICY[priority];


const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const slugify = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
);

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
};

export const ensureStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeString(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);


export const isStaffingPriority = (value: unknown): value is StaffingPriority => (
  typeof value === 'string' && STAFFING_PRIORITY_VALUES[value as StaffingPriority] === true
);

export const normalizeStaffingPriority = (
  value: unknown,
  fallback: StaffingPriority = 'BEST_AVAILABLE_COVERAGE',
): StaffingPriority => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return isStaffingPriority(normalized) ? normalized : fallback;
};

export const normalizeSportOfficialPositionTemplates = (value: unknown): SportOfficialPositionTemplate[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const templates: SportOfficialPositionTemplate[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const name = normalizeString(row.name);
    if (!name) {
      continue;
    }
    templates.push({
      name,
      count: normalizePositiveInt(row.count, 1),
    });
  }
  return templates;
};

export const buildEventOfficialPositionId = (eventId: string, order: number, name: string): string => {
  const slug = slugify(name) || 'official';
  return `event_pos_${eventId}_${order}_${slug}`;
};

export const normalizeEventOfficialPositions = (
  value: unknown,
  eventId: string,
): EventOfficialPosition[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const positions: EventOfficialPosition[] = [];
  const seenIds = new Set<string>();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const row = entry as Record<string, unknown>;
    const name = normalizeString(row.name);
    if (!name) {
      return;
    }
    const order = typeof row.order === 'number' && Number.isFinite(row.order)
      ? Math.max(0, Math.trunc(row.order))
      : index;
    const explicitId = normalizeString(row.id);
    const id = explicitId ?? buildEventOfficialPositionId(eventId, order, name);
    if (seenIds.has(id)) {
      return;
    }
    seenIds.add(id);
    positions.push({
      id,
      name,
      count: normalizePositiveInt(row.count, 1),
      order,
    });
  });
  positions.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  return positions.map((position, index) => ({ ...position, order: index }));
};

export const buildEventOfficialPositionsFromTemplates = (
  eventId: string,
  templates: SportOfficialPositionTemplate[],
): EventOfficialPosition[] => (
  templates.map((template, index) => ({
    id: buildEventOfficialPositionId(eventId, index, template.name),
    name: template.name,
    count: normalizePositiveInt(template.count, 1),
    order: index,
  }))
);

export const buildEventOfficialRecordId = (eventId: string, userId: string): string => (
  `event_official_${eventId}_${slugify(userId) || 'user'}`
);

export const normalizeEventOfficials = (
  value: unknown,
  options: {
    eventId: string;
    positionIds: string[];
    fieldIds: string[];
  },
): EventOfficialRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const validPositionIds = new Set(options.positionIds);
  const validFieldIds = new Set(options.fieldIds);
  const records: EventOfficialRecord[] = [];
  const seenUsers = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const userId = normalizeString(row.userId);
    if (!userId || seenUsers.has(userId)) {
      continue;
    }
    const positionIds = ensureStringArray(row.positionIds).filter((positionId) => validPositionIds.has(positionId));
    if (!positionIds.length) {
      throw new Error(`Event official ${userId} must reference at least one valid position.`);
    }
    const fieldIds = ensureStringArray(row.fieldIds).filter((fieldId) => validFieldIds.has(fieldId));
    const explicitId = normalizeString(row.id);
    records.push({
      id: explicitId ?? buildEventOfficialRecordId(options.eventId, userId),
      userId,
      positionIds,
      fieldIds,
      isActive: row.isActive !== false,
    });
    seenUsers.add(userId);
  }
  return records;
};

export const filterEventOfficialsByUserIds = (
  value: unknown,
  userIds: string[],
): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowedUserIds = new Set(
    userIds
      .map((userId) => normalizeString(userId))
      .filter((userId): userId is string => Boolean(userId)),
  );
  if (!allowedUserIds.size) {
    return [];
  }
  return value.filter((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const userId = normalizeString((entry as Record<string, unknown>).userId);
    return Boolean(userId && allowedUserIds.has(userId));
  });
};

export const deriveEventOfficialsFromLegacyOfficialIds = (params: {
  eventId: string;
  officialIds: string[];
  positionIds: string[];
}): EventOfficialRecord[] => (
  Array.from(new Set(params.officialIds))
    .map((userId) => normalizeString(userId))
    .filter((userId): userId is string => Boolean(userId))
    .map((userId) => ({
      id: buildEventOfficialRecordId(params.eventId, userId),
      userId,
      positionIds: [...params.positionIds],
      fieldIds: [],
      isActive: true,
    }))
);

export const normalizeMatchOfficialAssignments = (
  value: unknown,
  options: {
    positionCountsById: Map<string, number>;
    eventOfficialsById: Map<string, EventOfficialRecord>;
  },
): MatchOfficialAssignment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const assignments: MatchOfficialAssignment[] = [];
  const seenPositionSlots = new Set<string>();
  const seenUsers = new Set<string>();
  const positionOrderById = new Map(
    Array.from(options.positionCountsById.keys()).map((positionId, index) => [positionId, index]),
  );
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const positionId = normalizeString(row.positionId);
    const userId = normalizeString(row.userId);
    const holderType = typeof row.holderType === 'string'
      ? row.holderType.trim().toUpperCase()
      : '';
    const slotIndexRaw = typeof row.slotIndex === 'number' ? row.slotIndex : Number(row.slotIndex);
    const slotIndex = Number.isFinite(slotIndexRaw) ? Math.max(0, Math.trunc(slotIndexRaw)) : -1;
    if (
      !positionId
      || HOLDER_TYPE_VALUES[holderType as OfficialAssignmentHolderType] !== true
      || (!userId && holderType !== 'OFFICIAL')
    ) {
      continue;
    }
    const slotCount = options.positionCountsById.get(positionId);
    if (!slotCount) {
      throw new Error(`Unknown official position ${positionId}.`);
    }
    if (slotIndex < 0 || slotIndex >= slotCount) {
      throw new Error(`Official assignment slot ${slotIndex} is invalid for position ${positionId}.`);
    }
    const slotKey = `${positionId}:${slotIndex}`;
    if (seenPositionSlots.has(slotKey)) {
      throw new Error(`Duplicate official assignment for position ${positionId} slot ${slotIndex}.`);
    }
    if (userId && seenUsers.has(userId)) {
      throw new Error(`User ${userId} cannot be assigned to multiple official slots on the same match.`);
    }
    const eventOfficialId = normalizeString(row.eventOfficialId);
    if (!userId) {
      if (eventOfficialId) {
        throw new Error(`Unbound official assignment for position ${positionId} cannot reference an event official id.`);
      }
    } else if (holderType === 'OFFICIAL') {
      if (!eventOfficialId) {
        throw new Error(`Official assignment for ${userId} must reference an event official id.`);
      }
      const eventOfficial = options.eventOfficialsById.get(eventOfficialId);
      if (!eventOfficial || eventOfficial.userId !== userId) {
        throw new Error(`Official assignment ${eventOfficialId} does not match user ${userId}.`);
      }
      if (!eventOfficial.positionIds.includes(positionId)) {
        throw new Error(`Official ${userId} is not eligible for position ${positionId}.`);
      }
    } else if (eventOfficialId) {
      throw new Error(`Player assignment for ${userId} cannot include an event official id.`);
    }
    assignments.push({
      positionId,
      slotIndex,
      holderType: holderType as OfficialAssignmentHolderType,
      userId,
      eventOfficialId,
      checkedIn: userId ? row.checkedIn === true : false,
      hasConflict: userId ? row.hasConflict === true : false,
    });
    seenPositionSlots.add(slotKey);
    if (userId) {
      seenUsers.add(userId);
    }
  }
  return assignments.sort((left, right) => (
    (positionOrderById.get(left.positionId) ?? Number.MAX_SAFE_INTEGER)
      - (positionOrderById.get(right.positionId) ?? Number.MAX_SAFE_INTEGER)
    || left.slotIndex - right.slotIndex
  ));
};

export const completeMatchOfficialAssignmentSlots = (
  assignments: MatchOfficialAssignment[],
  officialPositions: EventOfficialPosition[],
): MatchOfficialAssignment[] => {
  const assignmentBySlot = new Map<string, MatchOfficialAssignment>();
  for (const assignment of assignments) {
    const key = `${assignment.positionId}:${assignment.slotIndex}`;
    if (!assignmentBySlot.has(key)) {
      assignmentBySlot.set(key, assignment);
    }
  }

  const completed: MatchOfficialAssignment[] = [];
  const orderedPositions = [...officialPositions].sort((left, right) => (
    left.order - right.order
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id)
  ));
  for (const position of orderedPositions) {
    for (let slotIndex = 0; slotIndex < position.count; slotIndex += 1) {
      const existing = assignmentBySlot.get(`${position.id}:${slotIndex}`);
      if (
        existing?.userId
        && (
          existing.holderType === 'PLAYER'
          || Boolean(existing.eventOfficialId)
        )
      ) {
        completed.push({
          positionId: position.id,
          slotIndex,
          holderType: existing.holderType,
          userId: existing.userId,
          eventOfficialId: existing.holderType === 'OFFICIAL'
            ? existing.eventOfficialId
            : null,
          checkedIn: existing.checkedIn === true,
          hasConflict: existing.hasConflict === true,
        });
      } else {
        completed.push({
          positionId: position.id,
          slotIndex,
          holderType: 'OFFICIAL',
          userId: null,
          eventOfficialId: null,
          checkedIn: false,
          hasConflict: false,
        });
      }
    }
  }
  return completed;
};

export const deriveLegacyOfficialIdFromAssignments = (assignments: MatchOfficialAssignment[]): string | null => {
  const primary = assignments.find((assignment) => (
    assignment.holderType === 'OFFICIAL' && assignment.userId !== null
  ));
  return primary?.userId ?? null;
};

export const deriveLegacyOfficialCheckedInFromAssignments = (assignments: MatchOfficialAssignment[]): boolean => {
  const primary = assignments.find((assignment) => (
    assignment.holderType === 'OFFICIAL' && assignment.userId !== null
  ));
  return primary?.checkedIn === true;
};

export const buildLegacyOfficialAssignment = (params: {
  eventId: string;
  officialId: string | null;
  officialCheckedIn: boolean;
  officialPositions: EventOfficialPosition[];
}): MatchOfficialAssignment[] => {
  const officialId = normalizeString(params.officialId);
  const primaryPosition = params.officialPositions[0];
  if (!officialId || !primaryPosition) {
    return [];
  }
  return [{
    positionId: primaryPosition.id,
    slotIndex: 0,
    holderType: 'OFFICIAL',
    userId: officialId,
    eventOfficialId: buildEventOfficialRecordId(params.eventId, officialId),
    checkedIn: params.officialCheckedIn,
    hasConflict: false,
  }];
};
