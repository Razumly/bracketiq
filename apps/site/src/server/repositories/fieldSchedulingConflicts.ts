import { prisma } from "@/lib/prisma";
import {
  addRepeatingTimeSlotLocalDays,
  enumerateRepeatingTimeSlotOccurrences,
  getRepeatingTimeSlotLocalDate,
  REPEATING_TIME_SLOT_WEEKLY_CYCLE_DAYS,
  resolveRepeatingTimeSlotLocalDateTime,
  resolveRepeatingTimeSlotOccurrence,
  RepeatingTimeSlotValidationError,
  type RepeatingTimeSlotIntervalInput,
} from "@/lib/repeatingTimeSlotAvailability";
import {
  DEFAULT_EVENT_TIME_ZONE,
  parseDateInputInTimeZone,
  resolveTimeZone,
} from "@/server/timeZones";
import {
  normalizeTimeSlotDays,
  normalizeTimeSlotFieldIds,
} from "@/server/timeSlotCanonical";
import type {
  FieldSchedulingConflictResponse,
  FieldSchedulingConflictSourceProjection,
  FieldSchedulingConflictVisibleKind,
} from "@/contracts/fieldSchedulingConflicts";

export type FieldSchedulingConflictSource = {
  id: string | null;
  eventId: string | null;
  parentId: string | null;
  kind: FieldSchedulingConflictVisibleKind;
  eventType: string | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  eventTimeZone: string | null;
  noFixedEndDateTime: boolean;
  repeating: boolean;
  startDate: Date | null;
  endDate: Date | null;
  timeZone: string | null;
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  daysOfWeek: number[];
  scheduledFieldIds: string[];
};

export type FieldBlockerInterval = {
  fieldId: string;
  start: Date;
  end: Date;
  source: FieldSchedulingConflictSource;
};

export type FieldBlockerRecurrence = {
  fieldId: string;
  source: FieldSchedulingConflictSource;
  slot: RepeatingTimeSlotIntervalInput;
};

export type FieldBlockerCatalog = {
  lowerBound: Date;
  intervalsByFieldId: Map<string, FieldBlockerInterval[]>;
  recurringByFieldId: Map<string, FieldBlockerRecurrence[]>;
};

export type PrismaLike = {
  matches?: { findMany?: (args: unknown) => Promise<unknown[]> };
  events?: {
    findMany?: (args: unknown) => Promise<unknown[]>;
    findUnique?: (args: unknown) => Promise<unknown>;
  };
  timeSlots?: { findMany?: (args: unknown) => Promise<unknown[]> };
  rentalBookingItems?: { findMany?: (args: unknown) => Promise<unknown[]> };
};

export type LoadFieldBlockerCatalogInput = {
  client?: PrismaLike;
  fieldIds: string[];
  lowerBound: Date;
  excludeEventId?: string | null;
};

export type FieldConflictDraftSlot = {
  key: string;
  $id?: string;
  scheduledFieldId?: string;
  scheduledFieldIds?: string[];
  dayOfWeek?: number;
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  repeating: boolean;
};

export type FieldConflictDraftContext = {
  eventId?: string | null;
  eventType?: string | null;
  parentEvent?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  hasNoFixedEventEnd?: boolean;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MATCH_BLOCK_PREFIX = "__field_match_block__";
const EVENT_BLOCK_PREFIX = "__field_event_block__";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeStrictTimeZone = (
  value: unknown,
  slotId: string | null,
): string => {
  const candidate =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : DEFAULT_EVENT_TIME_ZONE;
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

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const normalizeDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const rangesOverlap = (
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean =>
  firstStart.getTime() < secondEnd.getTime() &&
  firstEnd.getTime() > secondStart.getTime();

const isPositiveRange = (
  start: Date | null,
  end: Date | null,
): boolean => Boolean(start && end && end.getTime() > start.getTime());

const normalizeEventType = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const isWeeklyChild = (row: Record<string, unknown>): boolean =>
  normalizeEventType(row.eventType) === "WEEKLY_EVENT" &&
  Boolean(normalizeString(row.parentEvent));

const isSlotBasedEvent = (row: Record<string, unknown>): boolean => {
  const eventType = normalizeEventType(row.eventType);
  return (
    eventType === "LEAGUE" ||
    eventType === "TOURNAMENT" ||
    eventType === "TRYOUT" ||
    (eventType === "WEEKLY_EVENT" && !normalizeString(row.parentEvent))
  );
};

const eventEndForBlocker = (
  row: Record<string, unknown>,
): Date | null => {
  const plannedEnd = normalizeDate(row.scheduleEndConstraint);
  const generatedEnd = normalizeDate(row.generatedScheduleEnd);
  if (plannedEnd) return plannedEnd;
  if (generatedEnd) return generatedEnd;
  return row.noFixedEndDateTime === true ? null : normalizeDate(row.end);
};

const earliestDate = (values: Array<Date | null>): Date | null => {
  const dates = values.filter((value): value is Date => Boolean(value));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
};

const createSource = (
  values: Partial<FieldSchedulingConflictSource> &
    Pick<FieldSchedulingConflictSource, "kind">,
): FieldSchedulingConflictSource => ({
  id: values.id ?? null,
  eventId: values.eventId ?? null,
  parentId: values.parentId ?? null,
  kind: values.kind,
  eventType: values.eventType ?? null,
  eventStart: values.eventStart ?? null,
  eventEnd: values.eventEnd ?? null,
  eventTimeZone: values.eventTimeZone ?? null,
  noFixedEndDateTime: values.noFixedEndDateTime ?? false,
  repeating: values.repeating ?? false,
  startDate: values.startDate ?? null,
  endDate: values.endDate ?? null,
  timeZone: values.timeZone ?? null,
  startTimeMinutes: values.startTimeMinutes ?? null,
  endTimeMinutes: values.endTimeMinutes ?? null,
  daysOfWeek: values.daysOfWeek ?? [],
  scheduledFieldIds: values.scheduledFieldIds ?? [],
});

const createCatalog = (lowerBound: Date): FieldBlockerCatalog => ({
  lowerBound: new Date(lowerBound.getTime()),
  intervalsByFieldId: new Map(),
  recurringByFieldId: new Map(),
});

const addConcreteInterval = (
  catalog: FieldBlockerCatalog,
  fieldId: string,
  start: Date,
  end: Date,
  blockerSource: FieldSchedulingConflictSource,
): void => {
  if (!isPositiveRange(start, end)) return;
  if (end.getTime() <= catalog.lowerBound.getTime()) return;
  const intervals = catalog.intervalsByFieldId.get(fieldId) ?? [];
  intervals.push({ fieldId, start, end, source: blockerSource });
  catalog.intervalsByFieldId.set(fieldId, intervals);
};

const addRecurringInterval = (
  catalog: FieldBlockerCatalog,
  fieldId: string,
  slot: RepeatingTimeSlotIntervalInput,
  blockerSource: FieldSchedulingConflictSource,
): void => {
  if (
    blockerSource.endDate &&
    blockerSource.endDate.getTime() <= catalog.lowerBound.getTime()
  ) {
    return;
  }
  const recurring = catalog.recurringByFieldId.get(fieldId) ?? [];
  recurring.push({ fieldId, slot, source: blockerSource });
  catalog.recurringByFieldId.set(fieldId, recurring);
};

const normalizeRecurringRule = (
  row: Record<string, unknown>,
  slot: Record<string, unknown>,
  allowedFieldIds: Set<string>,
): {
  rule: RepeatingTimeSlotIntervalInput;
  source: FieldSchedulingConflictSource;
  fieldIds: string[];
} | null => {
  const eventId = normalizeString(row.id);
  const slotId = normalizeString(slot.id) ?? normalizeString(slot.$id);
  if (!slotId) return null;
  const eventTimeZone = normalizeStrictTimeZone(
    row.timeZone,
    eventId,
  );
  const timeZone = normalizeStrictTimeZone(slot.timeZone, slotId);
  const eventStart = normalizeDate(row.start);
  const eventEnd = eventEndForBlocker(row);
  const startDate = normalizeDate(slot.startDate) ?? eventStart;
  const endDate = earliestDate([normalizeDate(slot.endDate), eventEnd]);
  const fieldIds = normalizeTimeSlotFieldIds(slot).filter((fieldId) =>
    allowedFieldIds.has(fieldId),
  );
  const daysOfWeek = normalizeTimeSlotDays({
    dayOfWeek: slot.dayOfWeek,
    daysOfWeek: slot.daysOfWeek,
  });
  const startTimeMinutes =
    typeof slot.startTimeMinutes === "number" ? slot.startTimeMinutes : null;
  const endTimeMinutes =
    typeof slot.endTimeMinutes === "number" ? slot.endTimeMinutes : null;
  if (
    !startDate ||
    !fieldIds.length ||
    !daysOfWeek.length ||
    startTimeMinutes === null ||
    endTimeMinutes === null
  ) {
    return null;
  }
  const rule: RepeatingTimeSlotIntervalInput = {
    id: slotId,
    $id: slotId,
    daysOfWeek,
    startDate,
    endDate,
    startTimeMinutes,
    endTimeMinutes,
    timeZone,
    repeating: true,
    scheduledFieldIds: fieldIds,
    divisions: Array.isArray(slot.divisions) ? slot.divisions : [],
  };
  return {
    rule,
    fieldIds,
    source: createSource({
      id: slotId,
      eventId,
      parentId: eventId,
      kind: "EVENT_TIME_SLOT",
      eventType: normalizeEventType(row.eventType) || null,
      eventStart,
      eventEnd,
      eventTimeZone,
      noFixedEndDateTime: row.noFixedEndDateTime === true,
      repeating: true,
      startDate,
      endDate,
      timeZone,
      startTimeMinutes,
      endTimeMinutes,
      daysOfWeek,
      scheduledFieldIds: fieldIds,
    }),
  };
};

const addEventTimeSlot = (
  catalog: FieldBlockerCatalog,
  row: Record<string, unknown>,
  slot: Record<string, unknown>,
  allowedFieldIds: Set<string>,
): void => {
  const eventId = normalizeString(row.id);
  if (!eventId) return;
  const eventTimeZone = normalizeStrictTimeZone(
    row.timeZone,
    eventId,
  );
  const timeZone = normalizeStrictTimeZone(
    slot.timeZone,
    normalizeString(slot.id) ?? normalizeString(slot.$id),
  );
  const eventStart = normalizeDate(row.start);
  const eventEnd = eventEndForBlocker(row);
  if (slot.repeating !== false) {
    const normalized = normalizeRecurringRule(row, slot, allowedFieldIds);
    if (!normalized) return;
    for (const fieldId of normalized.fieldIds) {
      addRecurringInterval(catalog, fieldId, normalized.rule, normalized.source);
    }
    return;
  }

  const fieldIds = normalizeTimeSlotFieldIds(slot).filter((fieldId) =>
    allowedFieldIds.has(fieldId),
  );
  if (!fieldIds.length) return;
  const start = normalizeDate(slot.startDate) ?? eventStart;
  const end = normalizeDate(slot.endDate) ?? eventEnd;
  if (!start || !end) return;
  const blockerSource = createSource({
    id: normalizeString(slot.id) ?? normalizeString(slot.$id),
    eventId,
    parentId: eventId,
    kind: "EVENT_TIME_SLOT",
    eventType: normalizeEventType(row.eventType) || null,
    eventStart,
    eventEnd,
    eventTimeZone,
    noFixedEndDateTime: row.noFixedEndDateTime === true,
    repeating: false,
    startDate: start,
    endDate: end,
    timeZone,
    startTimeMinutes:
      typeof slot.startTimeMinutes === "number" ? slot.startTimeMinutes : null,
    endTimeMinutes:
      typeof slot.endTimeMinutes === "number" ? slot.endTimeMinutes : null,
    daysOfWeek: normalizeTimeSlotDays({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek,
    }),
    scheduledFieldIds: fieldIds,
  });
  for (const fieldId of fieldIds) {
    addConcreteInterval(catalog, fieldId, start, end, blockerSource);
  }
};

const invokeRows = async (
  method: ((args: unknown) => Promise<unknown[]>) | undefined,
  args: unknown,
): Promise<Record<string, unknown>[]> => {
  if (typeof method !== "function") return [];
  const rows = await method(args);
  return Array.isArray(rows) ? rows.map(asRecord) : [];
};

const boundMethod = (
  model: { findMany?: (args: unknown) => Promise<unknown[]> } | undefined,
): ((args: unknown) => Promise<unknown[]>) | undefined =>
  typeof model?.findMany === "function" ? model.findMany.bind(model) : undefined;

export const loadFieldBlockerCatalog = async (
  params: LoadFieldBlockerCatalogInput,
): Promise<FieldBlockerCatalog> => {
  const client = params.client ?? (prisma as unknown as PrismaLike);
  const fieldIds = Array.from(
    new Set(
      params.fieldIds
        .map((fieldId) => normalizeString(fieldId))
        .filter((fieldId): fieldId is string => Boolean(fieldId)),
    ),
  );
  const lowerBound = normalizeDate(params.lowerBound);
  if (!fieldIds.length || !lowerBound) {
    return createCatalog(lowerBound ?? new Date(0));
  }
  const catalog = createCatalog(lowerBound);
  const allowedFieldIds = new Set(fieldIds);
  const excludeEventId = normalizeString(params.excludeEventId);

  const [matchRows, eventRows] = await Promise.all([
    invokeRows(boundMethod(client.matches), {
      where: {
        fieldId: { in: fieldIds },
        ...(excludeEventId ? { eventId: { not: excludeEventId } } : {}),
        start: { not: null },
        end: { not: null, gt: lowerBound },
      },
      select: {
        id: true,
        eventId: true,
        fieldId: true,
        start: true,
        end: true,
        placementState: true,
      },
    }),
    invokeRows(boundMethod(client.events), {
      where: {
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        fieldIds: { hasSome: fieldIds },
        archivedAt: null,
        NOT: { state: "TEMPLATE" },
      },
      select: {
        id: true,
        eventType: true,
        parentEvent: true,
        start: true,
        end: true,
        scheduleEndConstraint: true,
        generatedScheduleEnd: true,
        noFixedEndDateTime: true,
        timeZone: true,
        fieldIds: true,
        timeSlotIds: true,
        state: true,
      },
    }),
  ]);


  for (const row of matchRows) {
    const placementState = normalizeEventType(row.placementState);
    if (placementState && placementState !== "PLACED") continue;
    const fieldId = normalizeString(row.fieldId);
    const start = normalizeDate(row.start);
    const end = normalizeDate(row.end);
    if (!fieldId || !allowedFieldIds.has(fieldId) || !start || !end) continue;
    addConcreteInterval(
      catalog,
      fieldId,
      start,
      end,
      createSource({
        id: normalizeString(row.id),
        eventId: normalizeString(row.eventId),
        parentId: normalizeString(row.eventId),
        kind: "MATCH",
        eventStart: start,
        eventEnd: end,
        repeating: false,
        startDate: start,
        endDate: end,
        scheduledFieldIds: [fieldId],
      }),
    );
  }

  const activeEventRows = eventRows.filter((row) => {
    if (row.archivedAt) return false;
    if (normalizeEventType(row.state) === "TEMPLATE") return false;
    return !isWeeklyChild(row);
  });
  const eventSlotIds = Array.from(
    new Set(activeEventRows.flatMap((row) => normalizeIdList(row.timeSlotIds))),
  );
  const slotRows = eventSlotIds.length
    ? await invokeRows(boundMethod(client.timeSlots), {
        where: { id: { in: eventSlotIds }, archivedAt: null },
      })
    : [];
  const slotsById = new Map(
    slotRows
      .map((row) => [normalizeString(row.id), row] as const)
      .filter(
        (entry): entry is [string, Record<string, unknown>] => Boolean(entry[0]),
      ),
  );

  for (const row of activeEventRows) {
    const eventId = normalizeString(row.id);
    if (!eventId) continue;
    const eventFieldIds = normalizeIdList(row.fieldIds).filter((fieldId) =>
      allowedFieldIds.has(fieldId),
    );
    if (!eventFieldIds.length) continue;

    if (isSlotBasedEvent(row)) {
      for (const slotId of normalizeIdList(row.timeSlotIds)) {
        const slot = slotsById.get(slotId);
        if (slot) addEventTimeSlot(catalog, row, slot, allowedFieldIds);
      }
      continue;
    }

    const start = normalizeDate(row.start);
    const end = eventEndForBlocker(row);
    if (!start || !end) continue;
    const eventTimeZone = normalizeStrictTimeZone(row.timeZone, eventId);
    for (const fieldId of eventFieldIds) {
      addConcreteInterval(
        catalog,
        fieldId,
        start,
        end,
        createSource({
          id: eventId,
          eventId,
          parentId: eventId,
          kind: "ONE_TIME_EVENT",
          eventType: normalizeEventType(row.eventType) || null,
          eventStart: start,
          eventEnd: end,
          eventTimeZone,
          noFixedEndDateTime: row.noFixedEndDateTime === true,
          repeating: false,
          startDate: start,
          endDate: end,
          timeZone: eventTimeZone,
          scheduledFieldIds: eventFieldIds,
        }),
      );
    }
  }

  const rentalRows = await invokeRows(boundMethod(client.rentalBookingItems), {
    where: {
      fieldId: { in: fieldIds },
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      end: { not: null, gt: lowerBound },
      ...(excludeEventId
        ? { OR: [{ eventId: null }, { eventId: { not: excludeEventId } }] }
        : {}),
    },
    select: {
      id: true,
      bookingId: true,
      eventId: true,
      fieldId: true,
      start: true,
      end: true,
      timeZone: true,
    },
  });
  for (const row of rentalRows) {
    const fieldId = normalizeString(row.fieldId);
    const start = normalizeDate(row.start);
    const end = normalizeDate(row.end);
    if (!fieldId || !allowedFieldIds.has(fieldId) || !start || !end) continue;
    addConcreteInterval(
      catalog,
      fieldId,
      start,
      end,
      createSource({
        id: normalizeString(row.id),
        eventId: normalizeString(row.eventId),
        parentId: normalizeString(row.bookingId),
        kind: "RENTAL_BOOKING",
        eventStart: start,
        eventEnd: end,
        repeating: false,
        startDate: start,
        endDate: end,
        timeZone: normalizeString(row.timeZone),
        scheduledFieldIds: [fieldId],
      }),
    );
  }

  for (const intervals of catalog.intervalsByFieldId.values()) {
    intervals.sort(
      (left, right) =>
        left.start.getTime() - right.start.getTime() ||
        left.end.getTime() - right.end.getTime(),
    );
  }
  return catalog;
};

const enumerateOverlappingOccurrences = (
  slot: RepeatingTimeSlotIntervalInput,
  windowStart: Date,
  windowEnd: Date,
) => {
  if (windowEnd.getTime() <= windowStart.getTime()) return [];
  return enumerateRepeatingTimeSlotOccurrences({
    slot,
    windowStart: new Date(windowStart.getTime() - DAY_MS),
    windowEnd: new Date(windowEnd.getTime() + DAY_MS),
  }).filter((occurrence) =>
    rangesOverlap(occurrence.start, occurrence.end, windowStart, windowEnd),
  );
};

const materializeRecurringConflict = (
  recurrence: FieldBlockerRecurrence,
  occurrenceStart: Date,
  occurrenceEnd: Date,
): FieldBlockerInterval => ({
  fieldId: recurrence.fieldId,
  start: occurrenceStart,
  end: occurrenceEnd,
  source: {
    ...recurrence.source,
    startDate: occurrenceStart,
    endDate: occurrenceEnd,
  },
});

export const materializeFieldBlockerCatalog = (
  catalog: FieldBlockerCatalog,
  windowStart: Date,
  windowEnd: Date,
): FieldBlockerInterval[] => {
  if (windowEnd.getTime() <= windowStart.getTime()) return [];
  const conflicts: FieldBlockerInterval[] = [];
  for (const intervals of catalog.intervalsByFieldId.values()) {
    for (const interval of intervals) {
      if (rangesOverlap(interval.start, interval.end, windowStart, windowEnd)) {
        conflicts.push(interval);
      }
    }
  }
  for (const recurring of catalog.recurringByFieldId.values()) {
    for (const recurrence of recurring) {
      for (const occurrence of enumerateOverlappingOccurrences(
        recurrence.slot,
        windowStart,
        windowEnd,
      )) {
        conflicts.push(
          materializeRecurringConflict(
            recurrence,
            occurrence.start,
            occurrence.end,
          ),
        );
      }
    }
  }
  return conflicts.sort(
    (left, right) =>
      left.fieldId.localeCompare(right.fieldId) ||
      left.start.getTime() - right.start.getTime() ||
      left.end.getTime() - right.end.getTime(),
  );
};

export const findFieldConflictsForInterval = (
  catalog: FieldBlockerCatalog,
  fieldIds: string[],
  start: Date,
  end: Date,
): FieldBlockerInterval[] => {
  if (end.getTime() <= start.getTime()) return [];
  const normalizedFieldIds = Array.from(
    new Set(fieldIds.map((fieldId) => normalizeString(fieldId)).filter((fieldId): fieldId is string => Boolean(fieldId))),
  );
  const conflicts: FieldBlockerInterval[] = [];
  for (const fieldId of normalizedFieldIds) {
    for (const interval of catalog.intervalsByFieldId.get(fieldId) ?? []) {
      if (rangesOverlap(interval.start, interval.end, start, end)) {
        conflicts.push(interval);
      }
    }
    for (const recurrence of catalog.recurringByFieldId.get(fieldId) ?? []) {
      for (const occurrence of enumerateOverlappingOccurrences(
        recurrence.slot,
        start,
        end,
      )) {
        conflicts.push(
          materializeRecurringConflict(
            recurrence,
            occurrence.start,
            occurrence.end,
          ),
        );
      }
    }
  }
  return conflicts.sort(
    (left, right) =>
      left.start.getTime() - right.start.getTime() ||
      left.end.getTime() - right.end.getTime(),
  );
};

const localBoundary = (
  value: Date | null,
  timeZone: string,
  endOfDay = false,
): Date | null => {
  if (!value) return null;
  const localDate = getRepeatingTimeSlotLocalDate(value, timeZone);
  if (!localDate) return null;
  return resolveRepeatingTimeSlotLocalDateTime(
    localDate,
    endOfDay ? 24 * 60 - 1 : 0,
    timeZone,
  );
};

const normalizeDraftRule = (
  slot: FieldConflictDraftSlot,
  context: FieldConflictDraftContext,
): RepeatingTimeSlotIntervalInput | null => {
  const timeZone = resolveTimeZone(slot.timeZone, DEFAULT_EVENT_TIME_ZONE);
  const eventStart = parseDateInputInTimeZone(context.eventStart, timeZone);
  const eventEnd = context.hasNoFixedEventEnd
    ? null
    : parseDateInputInTimeZone(context.eventEnd, timeZone);
  const startDate = parseDateInputInTimeZone(slot.startDate, timeZone) ?? eventStart;
  const endDate = earliestDate([
    parseDateInputInTimeZone(slot.endDate, timeZone),
    eventEnd,
  ]);
  const daysOfWeek = normalizeTimeSlotDays({
    dayOfWeek: slot.dayOfWeek,
    daysOfWeek: slot.daysOfWeek,
  });
  if (
    !startDate ||
    !daysOfWeek.length ||
    typeof slot.startTimeMinutes !== "number" ||
    typeof slot.endTimeMinutes !== "number"
  ) {
    return null;
  }
  return {
    id: slot.$id ?? slot.key,
    $id: slot.$id ?? slot.key,
    key: slot.key,
    daysOfWeek,
    startDate,
    endDate,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    timeZone,
    repeating: true,
    scheduledFieldIds: normalizeTimeSlotFieldIds({
      scheduledFieldId: slot.scheduledFieldId,
      scheduledFieldIds: slot.scheduledFieldIds,
    }),
  };
};

const normalizeDraftInterval = (
  slot: FieldConflictDraftSlot,
  context: FieldConflictDraftContext,
): { start: Date; end: Date } | null => {
  const timeZone = resolveTimeZone(slot.timeZone, DEFAULT_EVENT_TIME_ZONE);
  const start = parseDateInputInTimeZone(
    slot.startDate ?? context.eventStart,
    timeZone,
  );
  const end = parseDateInputInTimeZone(
    slot.endDate ?? context.eventEnd,
    timeZone,
  );
  return isPositiveRange(start, end) ? { start: start!, end: end! } : null;
};
type ResolvedConflictInterval = { start: Date; end: Date };

const localDateForRule = (
  slot: RepeatingTimeSlotIntervalInput,
  value: unknown,
): string | null => getRepeatingTimeSlotLocalDate(
  value,
  resolveTimeZone(slot.timeZone, DEFAULT_EVENT_TIME_ZONE),
);

const localDateWeekday = (value: string): number => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (parsed.getUTCDay() + 6) % 7;
};

const localDateInRuleBounds = (
  slot: RepeatingTimeSlotIntervalInput,
  date: string,
): boolean => {
  const startDate = localDateForRule(slot, slot.startDate);
  const endDate = localDateForRule(slot, slot.endDate);
  return (
    (!startDate || date >= startDate)
    && (!endDate || date <= endDate)
  );
};

const ruleDays = (slot: RepeatingTimeSlotIntervalInput): Set<number> =>
  new Set(normalizeTimeSlotDays({
    dayOfWeek: slot.dayOfWeek,
    daysOfWeek: slot.daysOfWeek,
  }));

const resolveRuleOccurrenceOnDate = (
  slot: RepeatingTimeSlotIntervalInput,
  date: string,
): ResolvedConflictInterval | null => {
  if (
    !localDateInRuleBounds(slot, date)
    || !ruleDays(slot).has(localDateWeekday(date))
  ) {
    return null;
  }
  const occurrence = resolveRepeatingTimeSlotOccurrence(slot, date);
  return { start: occurrence.start, end: occurrence.end };
};

const localRuleCanOverlap = (
  first: RepeatingTimeSlotIntervalInput,
  second: RepeatingTimeSlotIntervalInput,
): boolean => {
  const firstStart = Number(first.startTimeMinutes);
  const firstEnd = Number(first.endTimeMinutes);
  const secondStart = Number(second.startTimeMinutes);
  const secondEnd = Number(second.endTimeMinutes);
  if (
    !Number.isInteger(firstStart)
    || !Number.isInteger(firstEnd)
    || !Number.isInteger(secondStart)
    || !Number.isInteger(secondEnd)
  ) {
    return false;
  }
  const firstDays = ruleDays(first);
  const secondDays = ruleDays(second);
  const firstEndOnDayAxis =
    firstEnd <= firstStart || firstEnd === 24 * 60
      ? firstEnd + 24 * 60
      : firstEnd;
  const secondEndOnDayAxis =
    secondEnd <= secondStart || secondEnd === 24 * 60
      ? secondEnd + 24 * 60
      : secondEnd;
  for (const firstDay of firstDays) {
    for (const dayOffset of [-1, 0, 1]) {
      const secondDay = (firstDay + dayOffset + 7) % 7;
      if (!secondDays.has(secondDay)) continue;
      const secondStartOnAxis = dayOffset * 24 * 60 + secondStart;
      const secondEndOnAxis = dayOffset * 24 * 60 + secondEndOnDayAxis;
      if (
        firstStart < secondEndOnAxis
        && secondStartOnAxis < firstEndOnDayAxis
      ) {
        return true;
      }
    }
  }
  return false;
};

const firstRecurringOverlap = (
  first: RepeatingTimeSlotIntervalInput,
  second: RepeatingTimeSlotIntervalInput,
): ResolvedConflictInterval | null => {
  const firstZone = resolveTimeZone(first.timeZone, DEFAULT_EVENT_TIME_ZONE);
  const secondZone = resolveTimeZone(second.timeZone, DEFAULT_EVENT_TIME_ZONE);
  const firstStartDate = localDateForRule(first, first.startDate);
  const secondStartDate = localDateForRule(second, second.startDate);
  if (!firstStartDate || !secondStartDate) return null;

  if (firstZone === secondZone) {
    const firstEndDate = localDateForRule(first, first.endDate);
    const secondEndDate = localDateForRule(second, second.endDate);
    const latestStartDate = firstStartDate > secondStartDate
      ? firstStartDate
      : secondStartDate;
    const finiteEndDates = [firstEndDate, secondEndDate]
      .filter((date): date is string => Boolean(date))
      .sort();
    const earliestEndDate = finiteEndDates[0] ?? null;
    if (earliestEndDate && earliestEndDate < latestStartDate) return null;
    if (!earliestEndDate && !localRuleCanOverlap(first, second)) {
      return null;
    }

    const cycleEndDate = earliestEndDate
      ?? addRepeatingTimeSlotLocalDays(
        latestStartDate,
        REPEATING_TIME_SLOT_WEEKLY_CYCLE_DAYS,
      );
    if (!cycleEndDate) return null;
    const lastCandidateDate = addRepeatingTimeSlotLocalDays(cycleEndDate, 1);
    let cursor = addRepeatingTimeSlotLocalDays(latestStartDate, -1);
    if (!lastCandidateDate || !cursor) return null;
    let result: ResolvedConflictInterval | null = null;
    while (cursor <= lastCandidateDate) {
      const previousDate = addRepeatingTimeSlotLocalDays(cursor, -1);
      const firstOccurrences = [
        previousDate ? resolveRuleOccurrenceOnDate(first, previousDate) : null,
        resolveRuleOccurrenceOnDate(first, cursor),
      ].filter((occurrence): occurrence is ResolvedConflictInterval => Boolean(occurrence));
      const secondOccurrences = [
        previousDate ? resolveRuleOccurrenceOnDate(second, previousDate) : null,
        resolveRuleOccurrenceOnDate(second, cursor),
      ].filter((occurrence): occurrence is ResolvedConflictInterval => Boolean(occurrence));
      for (const firstOccurrence of firstOccurrences) {
        for (const secondOccurrence of secondOccurrences) {
          if (!rangesOverlap(
            firstOccurrence.start,
            firstOccurrence.end,
            secondOccurrence.start,
            secondOccurrence.end,
          )) {
            continue;
          }
          const start = new Date(Math.max(
            firstOccurrence.start.getTime(),
            secondOccurrence.start.getTime(),
          ));
          const end = new Date(Math.min(
            firstOccurrence.end.getTime(),
            secondOccurrence.end.getTime(),
          ));
          if (!result || start.getTime() < result.start.getTime()) {
            result = { start, end };
          }
        }
      }
      cursor = addRepeatingTimeSlotLocalDays(cursor, 1);
      if (!cursor) break;
    }
    return result;
  }

  const firstStart = localBoundary(normalizeDate(first.startDate), firstZone);
  const secondStart = localBoundary(normalizeDate(second.startDate), secondZone);
  if (!firstStart || !secondStart) return null;
  const comparisonStart = new Date(
    Math.max(firstStart.getTime(), secondStart.getTime()),
  );
  const finiteEnds = [
    localBoundary(normalizeDate(first.endDate), firstZone, true),
    localBoundary(normalizeDate(second.endDate), secondZone, true),
  ].filter((value): value is Date => Boolean(value));
  // One local week covers every weekday combination. The resolver handles
  // daylight-saving transitions inside that rule cycle.
  const comparisonEnd = finiteEnds.length
    ? new Date(Math.min(...finiteEnds.map((value) => value.getTime())) + DAY_MS)
    : new Date(
        comparisonStart.getTime()
          + REPEATING_TIME_SLOT_WEEKLY_CYCLE_DAYS * DAY_MS,
      );
  if (comparisonEnd.getTime() <= comparisonStart.getTime()) return null;
  const firstOccurrences = enumerateOverlappingOccurrences(
    first,
    comparisonStart,
    comparisonEnd,
  );
  const secondOccurrences = enumerateOverlappingOccurrences(
    second,
    comparisonStart,
    comparisonEnd,
  );
  let result: ResolvedConflictInterval | null = null;
  for (const firstOccurrence of firstOccurrences) {
    for (const secondOccurrence of secondOccurrences) {
      if (!rangesOverlap(
        firstOccurrence.start,
        firstOccurrence.end,
        secondOccurrence.start,
        secondOccurrence.end,
      )) {
        continue;
      }
      const start = new Date(Math.max(
        firstOccurrence.start.getTime(),
        secondOccurrence.start.getTime(),
      ));
      const end = new Date(Math.min(
        firstOccurrence.end.getTime(),
        secondOccurrence.end.getTime(),
      ));
      if (!result || start.getTime() < result.start.getTime()) {
        result = { start, end };
      }
    }
  }
  return result;
};

const sourceConflict = (
  fieldId: string,
  interval: FieldBlockerInterval,
): FieldBlockerInterval => ({ ...interval, fieldId });

export const findFieldConflictsForDraftSlot = (
  catalog: FieldBlockerCatalog,
  slot: FieldConflictDraftSlot,
  context: FieldConflictDraftContext,
): FieldBlockerInterval[] => {
  const fieldIds = normalizeTimeSlotFieldIds({
    scheduledFieldId: slot.scheduledFieldId,
    scheduledFieldIds: slot.scheduledFieldIds,
  });
  if (!fieldIds.length) return [];
  if (slot.repeating === false) {
    const range = normalizeDraftInterval(slot, context);
    return range
      ? findFieldConflictsForInterval(catalog, fieldIds, range.start, range.end)
      : [];
  }

  const draftRule = normalizeDraftRule(slot, context);
  if (!draftRule) return [];
  const conflicts: FieldBlockerInterval[] = [];
  for (const fieldId of fieldIds) {
    for (const interval of catalog.intervalsByFieldId.get(fieldId) ?? []) {
      for (const occurrence of enumerateOverlappingOccurrences(
        draftRule,
        interval.start,
        interval.end,
      )) {
        if (rangesOverlap(occurrence.start, occurrence.end, interval.start, interval.end)) {
          conflicts.push(sourceConflict(fieldId, interval));
          break;
        }
      }
    }
    for (const recurrence of catalog.recurringByFieldId.get(fieldId) ?? []) {
      const overlap = firstRecurringOverlap(draftRule, recurrence.slot);
      if (!overlap) continue;
      conflicts.push({
        fieldId,
        start: overlap.start,
        end: overlap.end,
        source: {
          ...recurrence.source,
          startDate: overlap.start,
          endDate: overlap.end,
        },
      });
    }
  }
  return conflicts.sort(
    (left, right) =>
      left.start.getTime() - right.start.getTime() ||
      left.end.getTime() - right.end.getTime(),
  );
};

export const findFirstRepeatingFieldConflict = (
  catalog: FieldBlockerCatalog,
  slot: FieldConflictDraftSlot,
  context: FieldConflictDraftContext,
): FieldBlockerInterval | null =>
  findFieldConflictsForDraftSlot(catalog, slot, context)[0] ?? null;

export const getFieldConflictLowerBound = (
  slots: FieldConflictDraftSlot[],
  context: FieldConflictDraftContext,
): Date | null => {
  const candidates: Date[] = [];
  const eventStart = normalizeDate(context.eventStart);
  if (eventStart) candidates.push(eventStart);
  for (const slot of slots) {
    const timeZone = resolveTimeZone(slot.timeZone, DEFAULT_EVENT_TIME_ZONE);
    const start = parseDateInputInTimeZone(slot.startDate, timeZone);
    if (start) candidates.push(start);
  }
  return candidates.length
    ? new Date(Math.min(...candidates.map((value) => value.getTime())))
    : null;
};

const toSourceProjection = (
  blockerSource: FieldSchedulingConflictSource,
): FieldSchedulingConflictSourceProjection => ({
  id: blockerSource.id,
  eventId: blockerSource.eventId,
  parentId: blockerSource.parentId,
  kind: blockerSource.kind,
  eventType: blockerSource.eventType,
  eventStart: blockerSource.eventStart?.toISOString() ?? null,
  eventEnd: blockerSource.eventEnd?.toISOString() ?? null,
  eventTimeZone: blockerSource.eventTimeZone,
  noFixedEndDateTime: blockerSource.noFixedEndDateTime,
  repeating: blockerSource.repeating,
  startDate: blockerSource.startDate?.toISOString() ?? null,
  endDate: blockerSource.endDate?.toISOString() ?? null,
  timeZone: blockerSource.timeZone,
  startTimeMinutes: blockerSource.startTimeMinutes,
  endTimeMinutes: blockerSource.endTimeMinutes,
  daysOfWeek: blockerSource.daysOfWeek,
  scheduledFieldIds: blockerSource.scheduledFieldIds,
});

export const serializeFieldSchedulingConflict = (
  slotKey: string,
  conflict: FieldBlockerInterval,
  options: { canViewSource?: boolean } = {},
): FieldSchedulingConflictResponse => {
  const start = conflict.start.toISOString();
  const end = conflict.end.toISOString();
  if (options.canViewSource === false) {
    return {
      slotKey,
      fieldId: conflict.fieldId,
      kind: "OCCUPIED",
      start,
      end,
      source: null,
    };
  }
  return {
    slotKey,
    fieldId: conflict.fieldId,
    kind: conflict.source.kind,
    start,
    end,
    source: toSourceProjection(conflict.source),
  };
};

export const fieldSchedulingConflictDetails = (
  catalog: FieldBlockerCatalog,
  windowStart: Date,
  windowEnd: Date,
): Array<FieldBlockerInterval & { blockId: string; parentId: string | null }> =>
  materializeFieldBlockerCatalog(catalog, windowStart, windowEnd).map((conflict) => ({
    ...conflict,
    blockId:
      conflict.source.kind === "MATCH"
        ? `${MATCH_BLOCK_PREFIX}${conflict.source.id ?? "unknown"}`
        : conflict.source.kind === "RENTAL_BOOKING"
          ? `rental-booking:${conflict.source.parentId ?? "unknown"}:${conflict.source.id ?? "unknown"}`
          : `${EVENT_BLOCK_PREFIX}${conflict.source.id ?? "unknown"}__${conflict.fieldId}`,
    parentId: conflict.source.parentId,
  }));
