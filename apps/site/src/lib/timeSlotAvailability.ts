import {
  getDateTimePartsInTimeZone,
  normalizeTimeZone,
  parseDateTimeInTimeZone,
  zonedTimeToUtcDate,
} from '@/lib/dateUtils';

const MINUTES_PER_DAY = 24 * 60;

export type TimeSlotIntervalInput = {
  id?: unknown;
  $id?: unknown;
  key?: unknown;
  repeating?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  startTimeMinutes?: unknown;
  endTimeMinutes?: unknown;
  timeZone?: unknown;
  scheduledFieldId?: unknown;
  scheduledFieldIds?: unknown;
  field?: unknown;
  fieldIds?: unknown;
  divisions?: unknown;
};

export type ResolvedOneTimeTimeSlot = {
  slotId: string;
  start: Date;
  end: Date;
  localDate: string;
  startTimeMinutes: number;
  endTimeMinutes: number;
  timeZone: string;
  resourceIds: string[];
  divisionIds: string[];
};

export type TimeSlotConflictEvidence = {
  first: ResolvedOneTimeTimeSlot;
  second: ResolvedOneTimeTimeSlot;
  resourceId: string;
  divisionId: string | null;
  divisionScopes: [string[], string[]];
};

export type TimeSlotValidationCode =
  | 'INVALID_ONE_TIME_SLOT'
  | 'ONE_TIME_SLOT_OUTSIDE_EVENT_BOUNDS'
  | 'ONE_TIME_SLOT_CONFLICT';

export class TimeSlotValidationError extends Error {
  readonly code: TimeSlotValidationCode;
  readonly slotIds: string[];
  readonly conflict: TimeSlotConflictEvidence | null;

  constructor(
    code: TimeSlotValidationCode,
    message: string,
    options: { slotIds?: string[]; conflict?: TimeSlotConflictEvidence | null } = {},
  ) {
    super(message);
    this.name = 'TimeSlotValidationError';
    this.code = code;
    this.slotIds = options.slotIds ?? [];
    this.conflict = options.conflict ?? null;
  }
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

const normalizeId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return normalizeId(value.id);
  }
  return null;
};

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeId).filter((entry): entry is string => entry !== null)));
};

const normalizeSlotId = (slot: TimeSlotIntervalInput): string =>
  normalizeId(slot.id) ?? normalizeId(slot.$id) ?? normalizeId(slot.key) ?? 'unknown';

const normalizeMinute = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= MINUTES_PER_DAY) {
    return null;
  }
  return parsed;
};
const parseUnknownDate = (value: unknown, timeZone: string): Date | null => {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return parseDateTimeInTimeZone(value, timeZone);
  }
  return null;
};

const normalizeResourceIds = (slot: TimeSlotIntervalInput): string[] => {
  const many = normalizeIds(slot.scheduledFieldIds);
  if (many.length > 0) return many;
  const legacyMany = normalizeIds(slot.fieldIds);
  if (legacyMany.length > 0) return legacyMany;
  const single = normalizeId(slot.scheduledFieldId) ?? normalizeId(slot.field);
  return single ? [single] : [];
};

const localDateString = (parts: { year: number; month: number; day: number }): string =>
  `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;

const formatMinutes = (minutes: number): string =>
  `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

const formatResolvedInterval = (slot: ResolvedOneTimeTimeSlot): string =>
  `${slot.localDate} ${formatMinutes(slot.startTimeMinutes)}–${formatMinutes(slot.endTimeMinutes)} ${slot.timeZone}`;

const invalidSlot = (slotId: string, detail: string): never => {
  throw new TimeSlotValidationError(
    'INVALID_ONE_TIME_SLOT',
    `One-Time Time Slot "${slotId}" is invalid: ${detail}`,
    { slotIds: [slotId] },
  );
};

const resolveEndLocalDate = (
  slotId: string,
  startParts: { year: number; month: number; day: number },
  endParts: { year: number; month: number; day: number } | null,
  overnight: boolean,
): string => {
  const startLocalDate = localDateString(startParts);
  const followingDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day + 1));
  const nextLocalDate = followingDate.toISOString().slice(0, 10);
  const endLocalDate = overnight ? nextLocalDate : startLocalDate;
  if (endParts) {
    const requestedDate = localDateString(endParts);
    if (requestedDate !== startLocalDate && requestedDate !== endLocalDate) {
      invalidSlot(slotId, 'the interval must not exceed one local day or end before its start date.');
    }
  }
  return endLocalDate;
};

export const assertOneTimeTimeSlotFutureEnd = (
  slot: Pick<ResolvedOneTimeTimeSlot, 'slotId' | 'end'>,
  now = new Date(),
): void => {
  if (!Number.isFinite(slot.end.getTime()) || slot.end.getTime() <= now.getTime()) {
    invalidSlot(slot.slotId, 'the end date and time must be in the future.');
  }
};

const readOneTimeIntervalInput = (
  slot: TimeSlotIntervalInput,
  fallbackTimeZone: string,
) => {
  const slotId = normalizeSlotId(slot);
  if (slot.repeating !== false) {
    invalidSlot(slotId, 'the slot must be marked as non-repeating.');
  }
  const timeZone = normalizeTimeZone(
    typeof slot.timeZone === 'string' ? slot.timeZone : null,
    normalizeTimeZone(fallbackTimeZone),
  );
  const parsedStart = parseUnknownDate(slot.startDate, timeZone);
  if (!parsedStart) {
    return invalidSlot(slotId, 'select one local date.');
  }
  const startParts = getDateTimePartsInTimeZone(parsedStart, timeZone);
  if (!startParts) {
    return invalidSlot(slotId, 'the local date cannot be resolved in its time zone.');
  }
  const parsedEnd = parseUnknownDate(slot.endDate, timeZone);
  const endParts = parsedEnd ? getDateTimePartsInTimeZone(parsedEnd, timeZone) : null;
  return { slotId, timeZone, parsedStart, parsedEnd, startParts, endParts };
};

type LocalDateParts = NonNullable<ReturnType<typeof getDateTimePartsInTimeZone>>;

const resolveSlotMinutes = (slotId: string, value: unknown, parts: LocalDateParts | null, label: string): number => {
  if (value !== null && value !== undefined) {
    return normalizeMinute(value) ?? invalidSlot(slotId, `select a valid ${label} time.`);
  }
  return parts ? parts.hour * 60 + parts.minute : invalidSlot(slotId, `select a ${label} time.`);
};

const resolveExactSlotInstant = (parsed: Date | null, parts: LocalDateParts | null, date: string, minutes: number, timeZone: string): Date | null => {
  if (parsed && parts && localDateString(parts) === date && parts.hour * 60 + parts.minute === minutes) return parsed;
  return zonedTimeToUtcDate(`${date}T${formatMinutes(minutes)}:00`, timeZone);
};

const localTimestamp = (date: Date, timeZone: string): number => {
  const parts = getDateTimePartsInTimeZone(date, timeZone);
  if (!parts) return Number.NaN;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds());
};

export const resolveOneTimeTimeSlot = (
  slot: TimeSlotIntervalInput,
  fallbackTimeZone = 'UTC',
): ResolvedOneTimeTimeSlot => {
  const { slotId, timeZone, parsedStart, parsedEnd, startParts, endParts } = readOneTimeIntervalInput(slot, fallbackTimeZone);
  const startTimeMinutes = resolveSlotMinutes(slotId, slot.startTimeMinutes, startParts, 'start');
  const endTimeMinutes = resolveSlotMinutes(slotId, slot.endTimeMinutes, endParts, 'end');
  const endLocalDate = resolveEndLocalDate(slotId, startParts, endParts, endTimeMinutes <= startTimeMinutes);

  const localDate = localDateString(startParts);
  const start = resolveExactSlotInstant(parsedStart, startParts, localDate, startTimeMinutes, timeZone);
  const end = resolveExactSlotInstant(parsedEnd, endParts, endLocalDate, endTimeMinutes, timeZone);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return invalidSlot(slotId, 'the exact interval cannot be resolved.');
  }
  if (localTimestamp(end, timeZone) - localTimestamp(start, timeZone) > MINUTES_PER_DAY * 60000) {
    invalidSlot(slotId, 'the interval must not exceed one local day.');
  }

  return {
    slotId,
    start,
    end,
    localDate,
    startTimeMinutes,
    endTimeMinutes,
    timeZone,
    resourceIds: normalizeResourceIds(slot),
    divisionIds: normalizeIds(slot.divisions),
  };
};

const scopeIntersection = (
  first: string[],
  second: string[],
  universe: string[],
  globalId: string,
): string | null => {
  const normalizedUniverse = universe;
  const firstScope = first.length > 0 ? first : normalizedUniverse;
  const secondScope = second.length > 0 ? second : normalizedUniverse;
  if (firstScope.length === 0 && secondScope.length === 0) {
    return globalId;
  }
  if (firstScope.length === 0) {
    return secondScope[0];
  }
  if (secondScope.length === 0) {
    return firstScope[0];
  }
  const secondByKey = new Map(secondScope.map((id) => [id.toLowerCase(), id]));
  for (const id of firstScope) {
    if (secondByKey.has(id.toLowerCase())) {
      return id;
    }
  }
  return null;
};

const effectiveScope = (scope: string[], universe: string[], globalId: string): string[] => (
  scope.length > 0
    ? scope
    : universe.length > 0
      ? universe
      : [globalId]
);

export const oneTimeTimeSlotsOverlap = (
  first: ResolvedOneTimeTimeSlot,
  second: ResolvedOneTimeTimeSlot,
): boolean => first.start.getTime() < second.end.getTime() && first.end.getTime() > second.start.getTime();

export const findOneTimeTimeSlotConflicts = (
  slots: ResolvedOneTimeTimeSlot[],
  options: { eligibleResourceIds?: string[]; eligibleDivisionIds?: string[] } = {},
): TimeSlotConflictEvidence[] => {
  const conflicts: TimeSlotConflictEvidence[] = [];
  const eligibleResourceIds = normalizeIds(options.eligibleResourceIds ?? []);
  const eligibleDivisionIds = normalizeIds(options.eligibleDivisionIds ?? []);
  for (let firstIndex = 0; firstIndex < slots.length; firstIndex += 1) {
    const first = slots[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < slots.length; secondIndex += 1) {
      const second = slots[secondIndex];
      if (!oneTimeTimeSlotsOverlap(first, second)) continue;
      const resourceId = scopeIntersection(
        first.resourceIds,
        second.resourceIds,
        eligibleResourceIds,
        'GLOBAL',
      );
      if (!resourceId) continue;
      const divisionId = scopeIntersection(
        first.divisionIds,
        second.divisionIds,
        eligibleDivisionIds,
        'GLOBAL',
      );
      conflicts.push({
        first,
        second,
        resourceId,
        divisionId,
        divisionScopes: [
          effectiveScope(first.divisionIds, eligibleDivisionIds, 'GLOBAL'),
          effectiveScope(second.divisionIds, eligibleDivisionIds, 'GLOBAL'),
        ],
      });
    }
  }
  return conflicts;
};

export const describeOneTimeTimeSlotConflict = (conflict: TimeSlotConflictEvidence): string => {
  const divisionEvidence = conflict.divisionId
    ? `for Division "${conflict.divisionId}"`
    : `across disjoint Division scopes "${conflict.divisionScopes[0].join(', ')}" and "${conflict.divisionScopes[1].join(', ')}"`;
  return `One-Time Time Slots "${conflict.first.slotId}" and "${conflict.second.slotId}" conflict on Resource "${conflict.resourceId}" ${divisionEvidence}: ${formatResolvedInterval(conflict.first)} overlaps ${formatResolvedInterval(conflict.second)}.`;
};

export const assertOneTimeTimeSlotWithinEventBounds = (
  slot: ResolvedOneTimeTimeSlot,
  eventStart: Date,
  eventEnd: Date | null,
): void => {
  const beforeStart = slot.start.getTime() < eventStart.getTime();
  const afterEnd = eventEnd !== null && slot.end.getTime() > eventEnd.getTime();
  if (!beforeStart && !afterEnd) return;
  const eventRange = eventEnd
    ? `${eventStart.toISOString()}–${eventEnd.toISOString()}`
    : `starting ${eventStart.toISOString()}`;
  throw new TimeSlotValidationError(
    'ONE_TIME_SLOT_OUTSIDE_EVENT_BOUNDS',
    `One-Time Time Slot "${slot.slotId}" (${formatResolvedInterval(slot)}) is outside the Event boundary ${eventRange}; Time Slots are rejected rather than clipped.`,
    { slotIds: [slot.slotId] },
  );
};

export const assertValidOneTimeTimeSlots = (options: {
  slots: Iterable<TimeSlotIntervalInput>;
  fallbackTimeZone?: string;
  eventStart?: Date | null;
  eventEnd?: Date | null;
  eligibleResourceIds?: string[];
  eligibleDivisionIds?: string[];
}): ResolvedOneTimeTimeSlot[] => {
  const resolved: ResolvedOneTimeTimeSlot[] = [];
  for (const slot of options.slots) {
    if (slot.repeating !== false) continue;
    const interval = resolveOneTimeTimeSlot(slot, options.fallbackTimeZone);
    if (options.eventStart) {
      assertOneTimeTimeSlotWithinEventBounds(interval, options.eventStart, options.eventEnd ?? null);
    }
    resolved.push(interval);
  }
  const conflict = findOneTimeTimeSlotConflicts(resolved, options)[0];
  if (conflict) {
    throw new TimeSlotValidationError(
      'ONE_TIME_SLOT_CONFLICT',
      describeOneTimeTimeSlotConflict(conflict),
      { slotIds: [conflict.first.slotId, conflict.second.slotId], conflict },
    );
  }
  return resolved;
};
