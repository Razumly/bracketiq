import {
  getDateTimePartsInTimeZone,
  zonedTimeToUtcDate,
} from "@/lib/dateUtils";

const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** One complete recurrence cycle. It is a proof boundary, not a search horizon. */
export const REPEATING_TIME_SLOT_WEEKLY_CYCLE_DAYS = 7;
export const REPEATING_TIME_SLOT_VALIDATION_WINDOW_DAYS = 370;
const REPEATING_TIME_SLOT_VALIDATION_PADDING_MS = 2 * DAY_MS;

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
  | "INVALID_REPEATING_TIME_SLOT"
  | "REPEATING_TIME_SLOT_TIME_GAP";

export type RepeatingTimeSlotTimeAdjustmentKind =
  | "GAP_SHIFT_FORWARD"
  | "FOLD_EARLIER";

export type RepeatingTimeSlotTimeAdjustment = {
  boundary: "start" | "end";
  kind: RepeatingTimeSlotTimeAdjustmentKind;
  requestedDate: string;
  requestedTimeMinutes: number;
  effectiveDate: string;
  effectiveTimeMinutes: number;
  effectiveInstant: Date;
};

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
    this.name = "RepeatingTimeSlotValidationError";
    this.code = code;
    this.slotId = options.slotId ?? "unknown";
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
  dstAdjustments: RepeatingTimeSlotTimeAdjustment[];
  resourceIds: string[];
  divisionIds: string[];
};

type LocalTimeAdjustment = Omit<
  RepeatingTimeSlotTimeAdjustment,
  "boundary"
>;

type LocalDateTimeResolution = {
  instant: Date;
  adjustment: LocalTimeAdjustment | null;
};

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const formatLocalDate = ({ year, month, day }: LocalDateParts): string =>
  `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;

export const formatLocalTime = (minutes: number): string => {
  const normalized =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}:00`;
};

const localDatePartsFromString = (value: string): LocalDateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
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

const compareLocalDates = (
  first: LocalDateParts,
  second: LocalDateParts,
): number => {
  const firstValue = Date.UTC(first.year, first.month - 1, first.day);
  const secondValue = Date.UTC(second.year, second.month - 1, second.day);
  return firstValue - secondValue;
};
const localDateToUtcDate = (date: LocalDateParts): Date =>
  new Date(Date.UTC(date.year, date.month - 1, date.day));

const localDateFromDate = (
  value: Date,
  timeZone: string,
): LocalDateParts | null => {
  const parts = getDateTimePartsInTimeZone(value, timeZone);
  return parts
    ? { year: parts.year, month: parts.month, day: parts.day }
    : null;
};

const localDateFromInput = (
  value: unknown,
  timeZone: string,
): LocalDateParts | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : localDateFromDate(value, timeZone);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return localDateFromDate(new Date(value), timeZone);
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim();
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return localDatePartsFromString(trimmed);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime())
    ? null
    : localDateFromDate(parsed, timeZone);
};
const hasLocalDateInput = (value: unknown): boolean =>
  value instanceof Date ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value.trim().length > 0);

const invalidConfiguredDateError = (
  slotId: string,
  fieldName: "start" | "end",
): RepeatingTimeSlotValidationError =>
  new RepeatingTimeSlotValidationError(
    "INVALID_REPEATING_TIME_SLOT",
    `Repeating Time Slot "${slotId}" has an invalid configured ${fieldName} date.`,
    { slotId },
  );

const normalizeTimeZoneStrict = (
  value: unknown,
  slotId: string | null = null,
): string => {
  const candidate =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(
      new Date(0),
    );
  } catch {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      `Repeating Time Slot has an invalid time zone "${candidate}".`,
      { slotId: slotId ?? undefined },
    );
  }
  return candidate;
};

export const normalizeRepeatingTimeSlotTimeZone = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "UTC";

export const resolveRepeatingTimeSlotLocalDateTime = (
  localDate: string,
  minutes: number,
  timeZone: unknown,
): Date | null =>
  zonedTimeToUtcDate(
    `${localDate}T${formatLocalTime(minutes)}`,
    normalizeRepeatingTimeSlotTimeZone(timeZone),
  );
export const getRepeatingTimeSlotLocalDate = (
  value: unknown,
  timeZone: unknown,
): string | null => {
  const normalizedTimeZone = normalizeTimeZoneStrict(timeZone);
  const localDate = localDateFromInput(value, normalizedTimeZone);
  return localDate ? formatLocalDate(localDate) : null;
};
const resolveRepeatingSlotDateStart = (
  value: unknown,
  timeZone: string,
): Date | null => {
  const localDate = getRepeatingTimeSlotLocalDate(value, timeZone);
  return localDate
    ? zonedTimeToUtcDate(`${localDate}T00:00:00`, timeZone)
    : null;
};

export const addRepeatingTimeSlotLocalDays = (
  value: string,
  days: number,
): string | null => {
  const localDate = localDatePartsFromString(value);
  return localDate ? formatLocalDate(addLocalDays(localDate, days)) : null;
};

const normalizeSlotId = (slot: RepeatingTimeSlotIntervalInput): string => {
  const values = [slot.id, slot.$id, slot.key];
  const value = values.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );
  return typeof value === "string" ? value.trim() : "unknown";
};

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => {
          if (typeof entry === "string") return entry.trim();
          if (typeof entry === "number" && Number.isFinite(entry))
            return String(entry);
          if (entry && typeof entry === "object" && "id" in entry) {
            const id = (entry as { id?: unknown }).id;
            return typeof id === "string" ? id.trim() : null;
          }
          return null;
        })
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const normalizeResourceIds = (
  slot: RepeatingTimeSlotIntervalInput,
): string[] => {
  const many = normalizeIds(slot.scheduledFieldIds);
  if (many.length) return many;
  const legacyMany = normalizeIds(slot.fieldIds);
  if (legacyMany.length) return legacyMany;
  const single =
    typeof slot.scheduledFieldId === "string"
      ? slot.scheduledFieldId.trim()
      : typeof slot.field === "string"
        ? slot.field.trim()
        : "";
  return single ? [single] : [];
};

const normalizeDays = (slot: RepeatingTimeSlotIntervalInput): number[] => {
  const source =
    Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
      ? slot.daysOfWeek
      : slot.dayOfWeek === undefined
        ? []
        : [slot.dayOfWeek];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((first, second) => first - second);
};

const normalizeMinutes = (
  value: unknown,
  isNextDayAllowed: boolean,
): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  const max = isNextDayAllowed ? MINUTES_PER_DAY : MINUTES_PER_DAY - 1;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max
    ? parsed
    : null;
};
export type RepeatingTimeSlotValidationWindow = {
  start: Date;
  end: Date;
};
type LocalDateBounds = {
  start: LocalDateParts | null;
  end: LocalDateParts | null;
};

const isValidDateValue = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const readValidationDateBounds = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  timeZone: string;
  slotId: string;
}): LocalDateBounds => {
  const start = localDateFromInput(options.slot.startDate, options.timeZone);
  const end = localDateFromInput(options.slot.endDate, options.timeZone);
  if (hasLocalDateInput(options.slot.startDate) && !start) {
    throw invalidConfiguredDateError(options.slotId, "start");
  }
  if (hasLocalDateInput(options.slot.endDate) && !end) {
    throw invalidConfiguredDateError(options.slotId, "end");
  }
  if (start && end && compareLocalDates(end, start) < 0) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      `Repeating Time Slot "${options.slotId}" is invalid: the configured end date is before the configured start date.`,
      { slotId: options.slotId },
    );
  }
  return { start, end };
};

const resolveValidationWindowStart = (
  eventStart: Date,
  configuredStartDate: LocalDateParts | null,
): { start: Date; anchor: Date } => {
  const configuredStartInstant = configuredStartDate
    ? localDateToUtcDate(configuredStartDate)
    : null;
  const anchor = configuredStartInstant
    ? new Date(Math.max(eventStart.getTime(), configuredStartInstant.getTime()))
    : new Date(eventStart.getTime());
  const start = configuredStartInstant
    ? new Date(
        Math.max(
          eventStart.getTime(),
          configuredStartInstant.getTime() -
            REPEATING_TIME_SLOT_VALIDATION_PADDING_MS,
        ),
      )
    : new Date(eventStart.getTime());
  return { start, anchor };
};

const resolveValidationEventEnd = (
  eventEnd: Date | null | undefined,
  eventStart: Date,
): Date | null =>
  isValidDateValue(eventEnd) && eventEnd.getTime() > eventStart.getTime()
    ? new Date(eventEnd.getTime())
    : null;

const resolveValidationFallbackEnd = (anchor: Date): Date =>
  new Date(
    anchor.getTime() +
      REPEATING_TIME_SLOT_VALIDATION_WINDOW_DAYS * DAY_MS +
      REPEATING_TIME_SLOT_VALIDATION_PADDING_MS,
  );

const resolveConfiguredEndInstant = (
  configuredEndDate: LocalDateParts | null,
): Date | null =>
  configuredEndDate
    ? new Date(
        localDateToUtcDate(configuredEndDate).getTime() +
          REPEATING_TIME_SLOT_VALIDATION_PADDING_MS,
      )
    : null;

const selectValidationWindowEnd = (
  eventEnd: Date | null,
  configuredEndInstant: Date | null,
  fallbackEnd: Date,
): Date => {
  const boundedEnds = [eventEnd, configuredEndInstant].filter(isValidDateValue);
  return boundedEnds.length
    ? new Date(Math.min(...boundedEnds.map((value) => value.getTime())))
    : fallbackEnd;
};


export const resolveRepeatingTimeSlotValidationWindow = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  eventStart: Date;
  eventEnd?: Date | null;
}): RepeatingTimeSlotValidationWindow | null => {
  if (!isValidDateValue(options.eventStart)) {
    return null;
  }
  const slotId = normalizeSlotId(options.slot);
  const timeZone = normalizeTimeZoneStrict(options.slot.timeZone, slotId);
  const dateBounds = readValidationDateBounds({
    slot: options.slot,
    timeZone,
    slotId,
  });
  const windowStart = resolveValidationWindowStart(
    options.eventStart,
    dateBounds.start,
  );
  const eventEnd = resolveValidationEventEnd(
    options.eventEnd,
    options.eventStart,
  );
  const fallbackEnd = resolveValidationFallbackEnd(windowStart.anchor);
  const configuredEndInstant = resolveConfiguredEndInstant(dateBounds.end);
  const end = selectValidationWindowEnd(
    eventEnd,
    configuredEndInstant,
    fallbackEnd,
  );
  return end.getTime() > windowStart.start.getTime()
    ? { start: windowStart.start, end }
    : null;
};

const localDayIndex = (date: LocalDateParts): number => {
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(date.year, date.month - 1, date.day);
  return (probe.getUTCDay() + 6) % 7;
};

const buildLocalDateTimeString = (
  date: LocalDateParts,
  minutes: number,
): string => {
  const normalized =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${formatLocalDate(date)}T${formatLocalTime(normalized)}`;
};

const offsetAt = (instant: Date, timeZone: string): number => {
  const parts = getDateTimePartsInTimeZone(instant, timeZone);
  if (!parts) return 0;
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - instant.getTime()
  );
};

const collectLocalDateTimeMatches = (options: {
  date: LocalDateParts;
  normalizedMinutes: number;
  timeZone: string;
  localAsUtcMs: number;
  guessed: Date | null;
}): Date[] => {
  const offsets = new Set<number>();
  for (let dayOffset = -3; dayOffset <= 3; dayOffset += 1) {
    for (let hourOffset = 0; hourOffset < 24; hourOffset += 6) {
      const probe = new Date(
        options.localAsUtcMs + dayOffset * DAY_MS + hourOffset * 60 * MINUTE_MS,
      );
      offsets.add(offsetAt(probe, options.timeZone));
    }
  }
  if (options.guessed) {
    offsets.add(offsetAt(options.guessed, options.timeZone));
  }

  const matches = Array.from(offsets)
    .map((offset) => new Date(options.localAsUtcMs - offset))
    .filter((candidate) => {
      const parts = getDateTimePartsInTimeZone(candidate, options.timeZone);
      return Boolean(
        parts &&
          parts.year === options.date.year &&
          parts.month === options.date.month &&
          parts.day === options.date.day &&
          parts.hour === Math.floor(options.normalizedMinutes / 60) &&
          parts.minute === options.normalizedMinutes % 60 &&
          parts.second === 0,
      );
    });
  return matches.filter(
    (candidate, index, candidates) =>
      candidates.findIndex(
        (other) => other.getTime() === candidate.getTime(),
      ) === index,
  );
};

const buildLocalTimeAdjustment = (options: {
  kind: RepeatingTimeSlotTimeAdjustmentKind;
  date: LocalDateParts;
  normalizedMinutes: number;
  instant: Date;
  timeZone: string;
}): LocalTimeAdjustment | null => {
  const parts = getDateTimePartsInTimeZone(options.instant, options.timeZone);
  if (!parts) return null;
  return {
    kind: options.kind,
    requestedDate: formatLocalDate(options.date),
    requestedTimeMinutes: options.normalizedMinutes,
    effectiveDate: formatLocalDate(parts),
    effectiveTimeMinutes: parts.hour * 60 + parts.minute,
    effectiveInstant: options.instant,
  };
};

const throwGapError = (
  date: LocalDateParts,
  timeZone: string,
  slotId: string,
): never => {
  throw new RepeatingTimeSlotValidationError(
    "REPEATING_TIME_SLOT_TIME_GAP",
    `Repeating Time Slot "${slotId}" uses a local time that does not exist on ${formatLocalDate(date)} in ${timeZone}.`,
    { slotId, occurrenceDate: formatLocalDate(date) },
  );
};

const resolveGapLocalDateTime = (options: {
  date: LocalDateParts;
  normalizedMinutes: number;
  localAsUtcMs: number;
  guessed: Date | null;
  timeZone: string;
  slotId: string;
}): LocalDateTimeResolution => {
  const guessed = options.guessed
    ?? throwGapError(options.date, options.timeZone, options.slotId);
  const guessedParts =
    getDateTimePartsInTimeZone(guessed, options.timeZone)
    ?? throwGapError(options.date, options.timeZone, options.slotId);
  const guessedLocalAsUtcMs = Date.UTC(
    guessedParts.year,
    guessedParts.month - 1,
    guessedParts.day,
    guessedParts.hour,
    guessedParts.minute,
    guessedParts.second,
  );
  if (guessedLocalAsUtcMs <= options.localAsUtcMs) {
    throwGapError(options.date, options.timeZone, options.slotId);
  }
  const adjustment = buildLocalTimeAdjustment({
    kind: "GAP_SHIFT_FORWARD",
    date: options.date,
    normalizedMinutes: options.normalizedMinutes,
    instant: guessed,
    timeZone: options.timeZone,
  });
  if (!adjustment) {
    throwGapError(options.date, options.timeZone, options.slotId);
  }
  return { instant: guessed, adjustment };
};

const resolveLocalDateTime = (
  date: LocalDateParts,
  minutes: number,
  timeZone: string,
  slotId: string,
): LocalDateTimeResolution => {
  const normalizedMinutes =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const localDateTime = buildLocalDateTimeString(date, normalizedMinutes);
  const localAsUtcMs = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Math.floor(normalizedMinutes / 60),
    normalizedMinutes % 60,
    0,
  );
  const guessed = zonedTimeToUtcDate(localDateTime, timeZone);
  const matches = collectLocalDateTimeMatches({
    date,
    normalizedMinutes,
    timeZone,
    localAsUtcMs,
    guessed,
  });

  if (matches.length === 1) {
    return { instant: matches[0]!, adjustment: null };
  }
  if (matches.length === 0) {
    return resolveGapLocalDateTime({
      date,
      normalizedMinutes,
      localAsUtcMs,
      guessed,
      timeZone,
      slotId,
    });
  }
  const instant = matches.reduce((earliest, candidate) =>
    candidate.getTime() < earliest.getTime() ? candidate : earliest,
  );
  return {
    instant,
    adjustment: buildLocalTimeAdjustment({
      kind: "FOLD_EARLIER",
      date,
      normalizedMinutes,
      instant,
      timeZone,
    }),
  };
};

type OccurrenceValidationFailure = (detail: string) => never;

const parseOccurrenceDateOrThrow = (
  slotId: string,
  occurrenceDate: string,
): LocalDateParts => {
  const parsedOccurrenceDate = localDatePartsFromString(occurrenceDate);
  if (parsedOccurrenceDate) {
    return parsedOccurrenceDate;
  }
  throw new RepeatingTimeSlotValidationError(
    "INVALID_REPEATING_TIME_SLOT",
    `Repeating Time Slot "${slotId}" has an invalid occurrence date "${occurrenceDate}".`,
    { slotId, occurrenceDate: null },
  );
};

const throwOccurrenceValidationError = (
  slotId: string,
  occurrenceDate: LocalDateParts,
  detail: string,
): never => {
  throw new RepeatingTimeSlotValidationError(
    "INVALID_REPEATING_TIME_SLOT",
    `Repeating Time Slot "${slotId}" is invalid: ${detail}`,
    { slotId, occurrenceDate: formatLocalDate(occurrenceDate) },
  );
};

const readConfiguredDateBounds = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  timeZone: string;
  slotId: string;
  occurrenceDate: LocalDateParts;
}): { start: LocalDateParts | null; end: LocalDateParts | null } => {
  const configuredStartDate = localDateFromInput(
    options.slot.startDate,
    options.timeZone,
  );
  const configuredEndDate = localDateFromInput(
    options.slot.endDate,
    options.timeZone,
  );
  if (hasLocalDateInput(options.slot.startDate) && !configuredStartDate) {
    throw invalidConfiguredDateError(options.slotId, "start");
  }
  if (hasLocalDateInput(options.slot.endDate) && !configuredEndDate) {
    throw invalidConfiguredDateError(options.slotId, "end");
  }
  if (
    configuredStartDate &&
    configuredEndDate &&
    compareLocalDates(configuredEndDate, configuredStartDate) < 0
  ) {
    throwOccurrenceValidationError(
      options.slotId,
      options.occurrenceDate,
      "the configured end date is before the configured start date.",
    );
  }
  return { start: configuredStartDate, end: configuredEndDate };
};

const validateOccurrenceDateBounds = (options: {
  configuredStartDate: LocalDateParts | null;
  configuredEndDate: LocalDateParts | null;
  occurrenceDate: LocalDateParts;
  fail: OccurrenceValidationFailure;
}): void => {
  if (
    options.configuredStartDate &&
    compareLocalDates(options.occurrenceDate, options.configuredStartDate) < 0
  ) {
    options.fail(
      `the occurrence is before the configured start date ${formatLocalDate(options.configuredStartDate)}.`,
    );
  }
  if (
    options.configuredEndDate &&
    compareLocalDates(options.occurrenceDate, options.configuredEndDate) > 0
  ) {
    options.fail(
      `the occurrence is after the configured end date ${formatLocalDate(options.configuredEndDate)}.`,
    );
  }
};

const validateOccurrenceWeekday = (
  days: number[],
  occurrenceDate: LocalDateParts,
  fail: OccurrenceValidationFailure,
): void => {
  if (!days.length) {
    fail("select at least one weekday.");
  }
  if (!days.includes(localDayIndex(occurrenceDate))) {
    fail(
      `the date ${formatLocalDate(occurrenceDate)} is not one of its selected weekdays.`,
    );
  }
};

const requireOccurrenceMinutes = (
  startMinutes: number | null,
  endMinutes: number | null,
  fail: OccurrenceValidationFailure,
): { start: number; end: number } => ({
  start: startMinutes ?? fail("select a start time."),
  end: endMinutes ?? fail("select an end time."),
});

const buildDstAdjustments = (
  startResolution: LocalDateTimeResolution,
  endResolution: LocalDateTimeResolution,
): RepeatingTimeSlotTimeAdjustment[] => {
  const adjustments: RepeatingTimeSlotTimeAdjustment[] = [];
  if (startResolution.adjustment) {
    adjustments.push({
      ...startResolution.adjustment,
      boundary: "start",
    });
  }
  if (endResolution.adjustment) {
    adjustments.push({
      ...endResolution.adjustment,
      boundary: "end",
    });
  }
  return adjustments;
};

export const resolveRepeatingTimeSlotOccurrence = (
  slot: RepeatingTimeSlotIntervalInput,
  occurrenceDate: string,
): ResolvedRepeatingTimeSlot => {
  const slotId = normalizeSlotId(slot);
  const parsedOccurrenceDate = parseOccurrenceDateOrThrow(slotId, occurrenceDate);
  const timeZone = normalizeTimeZoneStrict(slot.timeZone, slotId);
  const days = normalizeDays(slot);
  const startMinutes = normalizeMinutes(slot.startTimeMinutes, false);
  const endMinutes = normalizeMinutes(slot.endTimeMinutes, true);
  const fail: OccurrenceValidationFailure = (detail) =>
    throwOccurrenceValidationError(slotId, parsedOccurrenceDate, detail);
  const configuredDateBounds = readConfiguredDateBounds({
    slot,
    timeZone,
    slotId,
    occurrenceDate: parsedOccurrenceDate,
  });
  validateOccurrenceDateBounds({
    configuredStartDate: configuredDateBounds.start,
    configuredEndDate: configuredDateBounds.end,
    occurrenceDate: parsedOccurrenceDate,
    fail,
  });
  validateOccurrenceWeekday(days, parsedOccurrenceDate, fail);
  const resolvedMinutes = requireOccurrenceMinutes(startMinutes, endMinutes, fail);
  const isOvernight =
    resolvedMinutes.end === MINUTES_PER_DAY ||
    resolvedMinutes.end <= resolvedMinutes.start;
  const resolvedEndDate = isOvernight
    ? addLocalDays(parsedOccurrenceDate, 1)
    : parsedOccurrenceDate;
  const startResolution = resolveLocalDateTime(
    parsedOccurrenceDate,
    resolvedMinutes.start,
    timeZone,
    slotId,
  );
  const endResolution = resolveLocalDateTime(
    resolvedEndDate,
    resolvedMinutes.end === MINUTES_PER_DAY ? 0 : resolvedMinutes.end,
    timeZone,
    slotId,
  );
  const start = startResolution.instant;
  const end = endResolution.instant;
  if (end.getTime() <= start.getTime()) {
    fail("the resolved end time is not after the resolved start time.");
  }

  return {
    slotId,
    occurrenceDate: formatLocalDate(parsedOccurrenceDate),
    endDate: formatLocalDate(resolvedEndDate),
    start,
    end,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / MINUTE_MS),
    startTimeMinutes: resolvedMinutes.start,
    endTimeMinutes: resolvedMinutes.end,
    timeZone,
    isOvernight,
    nextWeekday: isOvernight
      ? WEEKDAY_NAMES[localDayIndex(resolvedEndDate)]
      : null,
    dstAdjustments: buildDstAdjustments(startResolution, endResolution),
    resourceIds: normalizeResourceIds(slot),
    divisionIds: normalizeIds(slot.divisions),
  };
};

const readValidOccurrenceWindow = (
  windowStart: unknown,
  windowEnd: unknown,
): RepeatingTimeSlotValidationWindow | null => {
  if (
    !(windowStart instanceof Date) ||
    Number.isNaN(windowStart.getTime()) ||
    !(windowEnd instanceof Date) ||
    Number.isNaN(windowEnd.getTime()) ||
    windowEnd.getTime() <= windowStart.getTime()
  ) {
    return null;
  }
  return { start: windowStart, end: windowEnd };
};


const isWithinConfiguredDateBounds = (
  date: LocalDateParts,
  bounds: { start: LocalDateParts | null; end: LocalDateParts | null },
): boolean =>
  (!bounds.start || compareLocalDates(date, bounds.start) >= 0) &&
  (!bounds.end || compareLocalDates(date, bounds.end) <= 0);

const resolvedOccurrenceOverlapsWindow = (
  occurrence: ResolvedRepeatingTimeSlot,
  window: RepeatingTimeSlotValidationWindow,
): boolean =>
  occurrence.start.getTime() < window.end.getTime() &&
  occurrence.end.getTime() > window.start.getTime();

export const enumerateRepeatingTimeSlotOccurrences = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  windowStart: Date;
  windowEnd: Date;
}): ResolvedRepeatingTimeSlot[] => {
  const window = readValidOccurrenceWindow(
    options.windowStart,
    options.windowEnd,
  );
  if (!window) return [];
  const slotId = normalizeSlotId(options.slot);
  const timeZone = normalizeTimeZoneStrict(options.slot.timeZone, slotId);
  const firstParts = localDateFromDate(window.start, timeZone);
  if (!firstParts) return [];
  const days = normalizeDays(options.slot);
  const bounds = readValidationDateBounds({
    slot: options.slot,
    timeZone,
    slotId,
  });
  if (!days.length) {
    resolveRepeatingTimeSlotOccurrence(options.slot, formatLocalDate(firstParts));
  }
  const lastParts = localDateFromDate(window.end, timeZone);
  if (!lastParts) return [];
  let cursor = addLocalDays(firstParts, -1);
  const lastDate = addLocalDays(lastParts, 1);
  const occurrences: ResolvedRepeatingTimeSlot[] = [];
  while (compareLocalDates(cursor, lastDate) <= 0) {
    if (
      isWithinConfiguredDateBounds(cursor, bounds) &&
      days.includes(localDayIndex(cursor))
    ) {
      const resolved = resolveRepeatingTimeSlotOccurrence(
        options.slot,
        formatLocalDate(cursor),
      );
      if (resolvedOccurrenceOverlapsWindow(resolved, window)) {
        occurrences.push(resolved);
      }
    }
    cursor = addLocalDays(cursor, 1);
  }
  return occurrences;
};
export const listRepeatingTimeSlotDstAdjustments = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  eventStart: Date;
  finalGeneratedEnd?: Date | null;
}): RepeatingTimeSlotTimeAdjustment[] => {
  const finalGeneratedEnd = options.finalGeneratedEnd;
  if (
    !(options.eventStart instanceof Date) ||
    Number.isNaN(options.eventStart.getTime()) ||
    !(finalGeneratedEnd instanceof Date) ||
    Number.isNaN(finalGeneratedEnd.getTime()) ||
    finalGeneratedEnd.getTime() <= options.eventStart.getTime()
  ) {
    return [];
  }
  const validationWindow = resolveRepeatingTimeSlotValidationWindow({
    slot: options.slot,
    eventStart: options.eventStart,
    eventEnd: finalGeneratedEnd,
  });
  if (!validationWindow) return [];
  const finalGeneratedEndMs = finalGeneratedEnd.getTime();
  return enumerateRepeatingTimeSlotOccurrences({
    slot: options.slot,
    windowStart: validationWindow.start,
    windowEnd: validationWindow.end,
  }).flatMap((occurrence) =>
    occurrence.dstAdjustments.filter(
      (adjustment) =>
        adjustment.effectiveInstant.getTime() <= finalGeneratedEndMs,
    ),
  );
};


export const repeatingTimeSlotOccurrencesOverlap = (options: {
  firstSlot: RepeatingTimeSlotIntervalInput;
  secondSlot: RepeatingTimeSlotIntervalInput;
  firstWindow: RepeatingTimeSlotValidationWindow;
  secondWindow: RepeatingTimeSlotValidationWindow;
  isFirstOpenEnded: boolean;
  isSecondOpenEnded: boolean;
}): boolean => {
  const overlapStart = new Date(
    Math.max(
      options.firstWindow.start.getTime(),
      options.secondWindow.start.getTime(),
    ),
  );
  const boundedEnds = [
    options.isFirstOpenEnded ? null : options.firstWindow.end,
    options.isSecondOpenEnded ? null : options.secondWindow.end,
  ].filter((value): value is Date => Boolean(value));
  // An unbounded pair needs one complete local recurrence cycle only.
  const cycleEnd =
    options.isFirstOpenEnded && options.isSecondOpenEnded
      ? new Date(
          overlapStart.getTime()
            + REPEATING_TIME_SLOT_WEEKLY_CYCLE_DAYS * DAY_MS,
        )
      : null;
  const overlapEndCandidates = [
    ...boundedEnds,
    ...(cycleEnd ? [cycleEnd] : []),
  ];
  const overlapEnd = new Date(
    Math.min(...overlapEndCandidates.map((value) => value.getTime())),
  );
  if (overlapEnd.getTime() <= overlapStart.getTime()) {
    return false;
  }

  const firstOccurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: options.firstSlot,
    windowStart: overlapStart,
    windowEnd: overlapEnd,
  });
  const secondOccurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: options.secondSlot,
    windowStart: overlapStart,
    windowEnd: overlapEnd,
  });
  return firstOccurrences.some((firstOccurrence) =>
    secondOccurrences.some(
      (secondOccurrence) =>
        firstOccurrence.start.getTime() < secondOccurrence.end.getTime() &&
        secondOccurrence.start.getTime() < firstOccurrence.end.getTime(),
    ),
  );
};

export const repeatingTimeSlotHasOvernightWindow = (
  startTimeMinutes: unknown,
  endTimeMinutes: unknown,
): boolean => {
  const start = normalizeMinutes(startTimeMinutes, false);
  const end = normalizeMinutes(endTimeMinutes, true);
  return (
    start !== null && end !== null && (end === MINUTES_PER_DAY || end <= start)
  );
};
export const formatOvernightWeekdayWarning = (daysOfWeek: number[]): string => {
  const labels = Array.from(new Set(daysOfWeek))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => WEEKDAY_NAMES[(day + 1) % WEEKDAY_NAMES.length]);

  if (labels.length === 0) {
    return "Overnight slot ends on the next local day.";
  }
  if (labels.length === 1) {
    return `Overnight slot ends on the next local weekday: ${labels[0]}.`;
  }
  return `Overnight slot ends on the next local weekdays: ${labels.join(", ")}.`;
};

const assertRepeatingSlotResources = (
  slot: RepeatingTimeSlotIntervalInput,
  eligibleResourceIds: Set<string> | null,
): void => {
  const resourceIds = normalizeResourceIds(slot);
  if (resourceIds.length === 0) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      "Assign at least one Resource or delete this Time Slot.",
      { slotId: normalizeSlotId(slot) },
    );
  }
  if (!eligibleResourceIds) {
    return;
  }
  const unavailableResourceId = resourceIds.find(
    (resourceId) => !eligibleResourceIds.has(resourceId),
  );
  if (unavailableResourceId) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      `Repeating Time Slot "${normalizeSlotId(slot)}" references unavailable Resource "${unavailableResourceId}".`,
      { slotId: normalizeSlotId(slot) },
    );
  }
};

const repeatingOccurrenceOutsideEventBounds = (
  occurrence: ResolvedRepeatingTimeSlot,
  eventStart: Date,
  eventEnd?: Date | null,
): boolean => {
  if (occurrence.start.getTime() < eventStart.getTime()) {
    return true;
  }
  if (!eventEnd) {
    return false;
  }
  return occurrence.end.getTime() > eventEnd.getTime();
};

const assertRepeatingSlotOccurrences = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  eventStart: Date;
  eventEnd?: Date | null;
}): void => {
  const timeZone =
    typeof options.slot.timeZone === "string"
      ? options.slot.timeZone
      : "UTC";
  const configuredStart = resolveRepeatingSlotDateStart(
    options.slot.startDate,
    timeZone,
  );
  const fullWindow = resolveRepeatingTimeSlotValidationWindow({
    slot: options.slot,
    eventStart: configuredStart ?? options.eventStart,
    eventEnd: options.slot.endDate ? null : options.eventEnd,
  });
  if (!fullWindow) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday.",
      { slotId: normalizeSlotId(options.slot) },
    );
  }
  const allOccurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: options.slot,
    windowStart: fullWindow.start,
    windowEnd: fullWindow.end,
  });
  if (allOccurrences.length === 0 && normalizeDays(options.slot).length > 0) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday.",
      { slotId: normalizeSlotId(options.slot) },
    );
  }
  const outsideBoundary = allOccurrences.some((occurrence) =>
    repeatingOccurrenceOutsideEventBounds(
      occurrence,
      options.eventStart,
      options.eventEnd,
    ),
  );
  if (outsideBoundary) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      "Schedule Boundary Error: Repeating Time Slot is outside the Event boundary; Time Slots are rejected rather than clipped.",
      { slotId: normalizeSlotId(options.slot) },
    );
  }
};

const assertRepeatingSlotValidation = (options: {
  slot: RepeatingTimeSlotIntervalInput;
  eventStart: Date;
  eventEnd?: Date | null;
}): void => {
  const validationWindow = resolveRepeatingTimeSlotValidationWindow({
    slot: options.slot,
    eventStart:
      resolveRepeatingSlotDateStart(
        options.slot.startDate,
        typeof options.slot.timeZone === "string"
          ? options.slot.timeZone
          : "UTC",
      ) ?? options.eventStart,
    eventEnd: options.eventEnd,
  });
  if (!validationWindow) {
    throw new RepeatingTimeSlotValidationError(
      "INVALID_REPEATING_TIME_SLOT",
      "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday.",
      { slotId: normalizeSlotId(options.slot) },
    );
  }
  enumerateRepeatingTimeSlotOccurrences({
    slot: options.slot,
    windowStart: validationWindow.start,
    windowEnd: validationWindow.end,
  });
};

const assertRepeatingTimeSlotResolvable = (
  slot: RepeatingTimeSlotIntervalInput,
  options: { eventStart: Date; eventEnd?: Date | null },
  eligibleResourceIds: Set<string> | null,
): void => {
  if (slot.repeating === false) {
    return;
  }
  assertRepeatingSlotResources(slot, eligibleResourceIds);
  assertRepeatingSlotOccurrences({
    slot,
    eventStart: options.eventStart,
    eventEnd: options.eventEnd,
  });
  assertRepeatingSlotValidation({
    slot,
    eventStart: options.eventStart,
    eventEnd: options.eventEnd,
  });
};

export const assertRepeatingTimeSlotsResolvable = (options: {
  slots: RepeatingTimeSlotIntervalInput[];
  eventStart: Date;
  eventEnd?: Date | null;
  eligibleResourceIds?: string[];
}): void => {
  if (!(options.eventStart instanceof Date)) {
    return;
  }
  if (Number.isNaN(options.eventStart.getTime())) {
    return;
  }
  const eligibleResourceIds = options.eligibleResourceIds
    ? new Set(options.eligibleResourceIds)
    : null;
  for (const slot of options.slots) {
    assertRepeatingTimeSlotResolvable(slot, options, eligibleResourceIds);
  }
};
