import {
  getDateTimePartsInTimeZone,
  zonedTimeToUtcDate,
} from '@/lib/dateUtils';

const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTimeParts = LocalDateParts & {
  hour: number;
  minute: number;
};

export type RepeatingTimeSlotIntervalInput = {
  id?: unknown;
  $id?: unknown;
  key?: unknown;
  dayOfWeek?: unknown;
  daysOfWeek?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  startTimeMinutes?: unknown;
  endTimeMinutes?: unknown;
  timeZone?: unknown;
  repeating?: unknown;
  scheduledFieldId?: unknown;
  scheduledFieldIds?: unknown;
  field?: unknown;
  fieldIds?: unknown;
  divisions?: unknown;
};

export type RepeatingTimeSlotValidationCode =
  | 'INVALID_REPEATING_TIME_SLOT'
  | 'REPEATING_TIME_SLOT_TIME_GAP'
  | 'REPEATING_TIME_SLOT_TIME_AMBIGUOUS';

export class RepeatingTimeSlotValidationError extends Error {
  readonly code: RepeatingTimeSlotValidationCode;
  readonly slotId: string;
  readonly occurrenceDate: string | null;

  constructor(
    code: RepeatingTimeSlotValidationCode,
    message: string,
    options: { slotId?: string; occurrenceDate?: string | null } = {},
  ) {
    super(message);
    this.name = 'RepeatingTimeSlotValidationError';
    this.code = code;
    this.slotId = options.slotId ?? 'unknown';
    this.occurrenceDate = options.occurrenceDate ?? null;
  }
}

export type ResolvedRepeatingTimeSlot = {
  slotId: string;
  occurrenceDate: string;
  endDate: string;
  start: Date;
  end: Date;
  durationMinutes: number;
  startTimeMinutes: number;
  endTimeMinutes: number;
  timeZone: string;
  isOvernight: boolean;
  nextWeekday: string | null;
  resourceIds: string[];
  divisionIds: string[];
};

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatLocalDate = ({ year, month, day }: LocalDateParts): string =>
  `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;

const formatLocalTime = (minutes: number): string => {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
};

const localDatePartsFromString = (value: string): LocalDateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
};

const addLocalDays = (date: LocalDateParts, days: number): LocalDateParts => {
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(date.year, date.month - 1, date.day);
  probe.setUTCDate(probe.getUTCDate() + days);
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
};

const compareLocalDates = (first: LocalDateParts, second: LocalDateParts): number => {
  const firstValue = Date.UTC(first.year, first.month - 1, first.day);
  const secondValue = Date.UTC(second.year, second.month - 1, second.day);
  return firstValue - secondValue;
};

const localDateFromDate = (value: Date, timeZone: string): LocalDateParts | null => {
  const parts = getDateTimePartsInTimeZone(value, timeZone);
  return parts
    ? { year: parts.year, month: parts.month, day: parts.day }
    : null;
};

const localDateFromInput = (value: unknown, timeZone: string): LocalDateParts | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : localDateFromDate(value, timeZone);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return localDateFromDate(new Date(value), timeZone);
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim();
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return localDatePartsFromString(trimmed);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : localDateFromDate(parsed, timeZone);
};
const hasLocalDateInput = (value: unknown): boolean => (
  value instanceof Date
  || (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && value.trim().length > 0)
);

const invalidConfiguredDateError = (
  slotId: string,
  fieldName: 'start' | 'end',
): RepeatingTimeSlotValidationError => new RepeatingTimeSlotValidationError(
  'INVALID_REPEATING_TIME_SLOT',
  `Repeating Time Slot "${slotId}" has an invalid configured ${fieldName} date.`,
  { slotId },
);


const normalizeTimeZoneStrict = (value: unknown): string => {
  const candidate = typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
  } catch {
    throw new RepeatingTimeSlotValidationError(
      'INVALID_REPEATING_TIME_SLOT',
      `Repeating Time Slot has an invalid time zone "${candidate}".`,
    );
  }
  return candidate;
};

export const getRepeatingTimeSlotLocalDate = (
  value: unknown,
  timeZone: unknown,
): string | null => {
  const normalizedTimeZone = normalizeTimeZoneStrict(timeZone);
  const localDate = localDateFromInput(value, normalizedTimeZone);
  return localDate ? formatLocalDate(localDate) : null;
};

export const addRepeatingTimeSlotLocalDays = (
  value: string,
  days: number,
): string | null => {
  const localDate = localDatePartsFromString(value);
  return localDate ? formatLocalDate(addLocalDays(localDate, days)) : null;
};

export const getRepeatingTimeSlotLocalWeekday = (
  value: string,
): number | null => {
  const localDate = localDatePartsFromString(value);
  return localDate ? localDayIndex(localDate) : null;
};

const normalizeSlotId = (slot: RepeatingTimeSlotIntervalInput): string => {
  const values = [slot.id, slot.$id, slot.key];
  const value = values.find((candidate) => (
    typeof candidate === 'string' && candidate.trim().length > 0
  ));
  return typeof value === 'string' ? value.trim() : 'unknown';
};

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (typeof entry === 'number' && Number.isFinite(entry)) return String(entry);
      if (entry && typeof entry === 'object' && 'id' in entry) {
        const id = (entry as { id?: unknown }).id;
        return typeof id === 'string' ? id.trim() : null;
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry))));
};

const normalizeResourceIds = (slot: RepeatingTimeSlotIntervalInput): string[] => {
  const many = normalizeIds(slot.scheduledFieldIds);
  if (many.length) return many;
  const legacyMany = normalizeIds(slot.fieldIds);
  if (legacyMany.length) return legacyMany;
  const single = typeof slot.scheduledFieldId === 'string'
    ? slot.scheduledFieldId.trim()
    : typeof slot.field === 'string'
      ? slot.field.trim()
      : '';
  return single ? [single] : [];
};

const normalizeDays = (slot: RepeatingTimeSlotIntervalInput): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : slot.dayOfWeek === undefined
      ? []
      : [slot.dayOfWeek];
  return Array.from(new Set(source
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)))
    .sort((first, second) => first - second);
};

const normalizeMinutes = (value: unknown, allowNextDay: boolean): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  const max = allowNextDay ? MINUTES_PER_DAY : MINUTES_PER_DAY - 1;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
};

const localDayIndex = (date: LocalDateParts): number => {
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(date.year, date.month - 1, date.day);
  return (probe.getUTCDay() + 6) % 7;
};

const buildLocalDateTimeString = (date: LocalDateParts, minutes: number): string => {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${formatLocalDate(date)}T${formatLocalTime(normalized)}:00`;
};

const offsetAt = (instant: Date, timeZone: string): number => {
  const parts = getDateTimePartsInTimeZone(instant, timeZone);
  if (!parts) return 0;
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - instant.getTime();
};

const resolveStrictLocalDateTime = (
  date: LocalDateParts,
  minutes: number,
  timeZone: string,
  slotId: string,
): Date => {
  const localDateTime = buildLocalDateTimeString(date, minutes);
  const localAsUtcMs = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Math.floor((minutes % MINUTES_PER_DAY) / 60),
    minutes % 60,
    0,
  );
  const offsets = new Set<number>();
  for (let dayOffset = -3; dayOffset <= 3; dayOffset += 1) {
    for (let hourOffset = 0; hourOffset < 24; hourOffset += 6) {
      const probe = new Date(localAsUtcMs + dayOffset * DAY_MS + hourOffset * 60 * MINUTE_MS);
      offsets.add(offsetAt(probe, timeZone));
    }
  }
  const guessed = zonedTimeToUtcDate(localDateTime, timeZone);
  if (guessed) offsets.add(offsetAt(guessed, timeZone));

  const matches = Array.from(offsets)
    .map((offset) => new Date(localAsUtcMs - offset))
    .filter((candidate) => {
      const parts = getDateTimePartsInTimeZone(candidate, timeZone);
      return Boolean(
        parts
        && parts.year === date.year
        && parts.month === date.month
        && parts.day === date.day
        && parts.hour === Math.floor((minutes % MINUTES_PER_DAY) / 60)
        && parts.minute === minutes % 60
        && parts.second === 0,
      );
    })
    .filter((candidate, index, candidates) => (
      candidates.findIndex((other) => other.getTime() === candidate.getTime()) === index
    ));

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new RepeatingTimeSlotValidationError(
      'REPEATING_TIME_SLOT_TIME_GAP',
      `Repeating Time Slot "${slotId}" uses a local time that does not exist on ${formatLocalDate(date)} in ${timeZone}.`,
      { slotId, occurrenceDate: formatLocalDate(date) },
    );
  }
  throw new RepeatingTimeSlotValidationError(
    'REPEATING_TIME_SLOT_TIME_AMBIGUOUS',
    `Repeating Time Slot "${slotId}" uses an ambiguous local time on ${formatLocalDate(date)} in ${timeZone}. Choose a different time.`,
    { slotId, occurrenceDate: formatLocalDate(date) },
  );
};

export const resolveRepeatingTimeSlotOccurrence = (
  slot: RepeatingTimeSlotIntervalInput,
  occurrenceDate: string,
): ResolvedRepeatingTimeSlot => {
  const slotId = normalizeSlotId(slot);
  const parsedOccurrenceDate = localDatePartsFromString(occurrenceDate);
  if (!parsedOccurrenceDate) {
    throw new RepeatingTimeSlotValidationError(
      'INVALID_REPEATING_TIME_SLOT',
      `Repeating Time Slot "${slotId}" has an invalid occurrence date "${occurrenceDate}".`,
      { slotId, occurrenceDate: null },
    );
  }
  const timeZone = normalizeTimeZoneStrict(slot.timeZone);
  const days = normalizeDays(slot);
  const startMinutes = normalizeMinutes(slot.startTimeMinutes, false);
  const endMinutes = normalizeMinutes(slot.endTimeMinutes, true);
  const fail = (detail: string): never => {
    throw new RepeatingTimeSlotValidationError(
      'INVALID_REPEATING_TIME_SLOT',
      `Repeating Time Slot "${slotId}" is invalid: ${detail}`,
      { slotId, occurrenceDate: formatLocalDate(parsedOccurrenceDate) },
    );
  };
  const configuredStartDate = localDateFromInput(slot.startDate, timeZone);
  const configuredEndDate = localDateFromInput(slot.endDate, timeZone);
  if (hasLocalDateInput(slot.startDate) && !configuredStartDate) {
    throw invalidConfiguredDateError(slotId, 'start');
  }
  if (hasLocalDateInput(slot.endDate) && !configuredEndDate) {
    throw invalidConfiguredDateError(slotId, 'end');
  }
  if (
    configuredStartDate
    && configuredEndDate
    && compareLocalDates(configuredEndDate, configuredStartDate) < 0
  ) {
    fail('the configured end date is before the configured start date.');
  }
  if (configuredStartDate && compareLocalDates(parsedOccurrenceDate, configuredStartDate) < 0) {
    fail(`the occurrence is before the configured start date ${formatLocalDate(configuredStartDate)}.`);
  }
  if (configuredEndDate && compareLocalDates(parsedOccurrenceDate, configuredEndDate) > 0) {
    fail(`the occurrence is after the configured end date ${formatLocalDate(configuredEndDate)}.`);
  }
  if (!days.length) fail('select at least one weekday.');
  if (!days.includes(localDayIndex(parsedOccurrenceDate))) {
    fail(`the date ${formatLocalDate(parsedOccurrenceDate)} is not one of its selected weekdays.`);
  }
  const requireMinutes = (value: number | null, detail: string): number => (
    value ?? fail(detail)
  );
  const resolvedStartMinutes = requireMinutes(startMinutes, 'select a start time.');
  const resolvedEndMinutes = requireMinutes(endMinutes, 'select an end time.');

  const isOvernight = resolvedEndMinutes === MINUTES_PER_DAY || resolvedEndMinutes <= resolvedStartMinutes;
  const resolvedEndDate = isOvernight ? addLocalDays(parsedOccurrenceDate, 1) : parsedOccurrenceDate;
  const start = resolveStrictLocalDateTime(parsedOccurrenceDate, resolvedStartMinutes, timeZone, slotId);
  const end = resolveStrictLocalDateTime(
    resolvedEndDate,
    resolvedEndMinutes === MINUTES_PER_DAY ? 0 : resolvedEndMinutes,
    timeZone,
    slotId,
  );
  if (end.getTime() <= start.getTime()) {
    fail('the resolved end time is not after the resolved start time.');
  }

  return {
    slotId,
    occurrenceDate: formatLocalDate(parsedOccurrenceDate),
    endDate: formatLocalDate(resolvedEndDate),
    start,
    end,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / MINUTE_MS),
    startTimeMinutes: resolvedStartMinutes,
    endTimeMinutes: resolvedEndMinutes,
    timeZone,
    isOvernight,
    nextWeekday: isOvernight ? WEEKDAY_NAMES[localDayIndex(resolvedEndDate)] : null,
    resourceIds: normalizeResourceIds(slot),
    divisionIds: normalizeIds(slot.divisions),
  };
};

export const enumerateRepeatingTimeSlotOccurrences = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  windowStart: Date;
  windowEnd: Date;
}): ResolvedRepeatingTimeSlot[] => {
  if (
    !(options.windowStart instanceof Date)
    || Number.isNaN(options.windowStart.getTime())
    || !(options.windowEnd instanceof Date)
    || Number.isNaN(options.windowEnd.getTime())
    || options.windowEnd.getTime() <= options.windowStart.getTime()
  ) {
    return [];
  }
  const timeZone = normalizeTimeZoneStrict(options.slot.timeZone);
  const firstParts = localDateFromDate(options.windowStart, timeZone);
  if (!firstParts) return [];
  const days = normalizeDays(options.slot);
  const configuredStartDate = localDateFromInput(options.slot.startDate, timeZone);
  const configuredEndDate = localDateFromInput(options.slot.endDate, timeZone);
  const slotId = normalizeSlotId(options.slot);
  if (hasLocalDateInput(options.slot.startDate) && !configuredStartDate) {
    throw invalidConfiguredDateError(slotId, 'start');
  }
  if (hasLocalDateInput(options.slot.endDate) && !configuredEndDate) {
    throw invalidConfiguredDateError(slotId, 'end');
  }
  if (
    configuredStartDate
    && configuredEndDate
    && compareLocalDates(configuredEndDate, configuredStartDate) < 0
  ) {
    throw new RepeatingTimeSlotValidationError(
      'INVALID_REPEATING_TIME_SLOT',
      `Repeating Time Slot "${slotId}" is invalid: the configured end date is before the configured start date.`,
      { slotId },
    );
  }
  if (!days.length) {
    const firstDate = formatLocalDate(firstParts);
    resolveRepeatingTimeSlotOccurrence(options.slot, firstDate);
  }
  const lastParts = localDateFromDate(options.windowEnd, timeZone);
  if (!lastParts) return [];
  let cursor = addLocalDays(firstParts, -1);
  const lastDate = addLocalDays(lastParts, 1);
  const occurrences: ResolvedRepeatingTimeSlot[] = [];
  while (compareLocalDates(cursor, lastDate) <= 0) {
    const occurrenceDate = formatLocalDate(cursor);
    const isInConfiguredBounds = (
      (!configuredStartDate || compareLocalDates(cursor, configuredStartDate) >= 0)
      && (!configuredEndDate || compareLocalDates(cursor, configuredEndDate) <= 0)
    );
    if (isInConfiguredBounds && days.includes(localDayIndex(cursor))) {
      const resolved = resolveRepeatingTimeSlotOccurrence(options.slot, occurrenceDate);
      if (
        resolved.start.getTime() < options.windowEnd.getTime()
        && resolved.end.getTime() > options.windowStart.getTime()
      ) {
        occurrences.push(resolved);
      }
    }
    cursor = addLocalDays(cursor, 1);
  }
  return occurrences;
};

export const repeatingTimeSlotHasOvernightWindow = (
  startTimeMinutes: unknown,
  endTimeMinutes: unknown,
): boolean => {
  const start = normalizeMinutes(startTimeMinutes, false);
  const end = normalizeMinutes(endTimeMinutes, true);
  return start !== null && end !== null && (end === MINUTES_PER_DAY || end <= start);
};



export const assertRepeatingTimeSlotsResolvable = (options: {
  slots: RepeatingTimeSlotIntervalInput[];
  eventStart: Date;
  eventEnd?: Date | null;
}): void => {
  if (!(options.eventStart instanceof Date) || Number.isNaN(options.eventStart.getTime())) {
    return;
  }
  const windowEnd = options.eventEnd
    && options.eventEnd instanceof Date
    && !Number.isNaN(options.eventEnd.getTime())
    && options.eventEnd.getTime() > options.eventStart.getTime()
    ? options.eventEnd
    : new Date(options.eventStart.getTime() + 370 * DAY_MS);
  for (const slot of options.slots) {
    if (slot.repeating === false) continue;
    enumerateRepeatingTimeSlotOccurrences({
      slot,
      windowStart: options.eventStart,
      windowEnd,
    });
  }
};