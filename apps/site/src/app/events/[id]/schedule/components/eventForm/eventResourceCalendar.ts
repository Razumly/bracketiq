import { addDays, endOfDay, format, startOfDay } from "date-fns";

import type { Field } from "@/types";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  enumerateRepeatingTimeSlotOccurrences,
  getRepeatingTimeSlotLocalDate,
  resolveRepeatingTimeSlotValidationWindow,
} from "@/lib/repeatingTimeSlotAvailability";
import {
  calendarDateInTimeZoneToInstant,
  getDateTimePartsInTimeZone,
  instantToCalendarDateInTimeZone,
  parseDateTimeInTimeZone,
  zonedTimeToUtcDate,
} from "@/lib/dateUtils";
import { resolveOneTimeTimeSlot } from "@/lib/timeSlotAvailability";
import { getFacilityScopedFieldDisplayName } from "@/lib/fieldUtils";
import {
  calendarDayKey,
  entriesOverlapRange,
  type ResourceCalendarEntry,
  type ResourceCalendarRange,
  type ResourceCalendarResource,
} from "@/components/calendar/resourceCalendarModel";
import { normalizeSlotFieldIds, normalizeWeekdays } from "./slotForm";

export const REPEATING_SLOT_NO_OCCURRENCE_ERROR =
  "The selected date range contains no occurrence for the selected weekdays.";
export const REPEATING_SLOT_NO_OCCURRENCE_ACTION =
  "Choose another date range or weekday.";
export const SCHEDULE_BOUNDARY_ERROR_PREFIX = "Schedule Boundary Error";

export type EventResourceCalendarEntry = ResourceCalendarEntry<Field> & {
  slotIndex: number;
  slotKey: string;
  logicalSlotKey: string;
  occurrenceDate: string;
  repeating: boolean;
  timeZone: string;
  instantStart: Date;
  instantEnd: Date;
};

export type InvalidEventCalendarSlot = {
  slotIndex: number;
  slotKey: string;
  reason: string;
  resourceIds: string[];
};

export type EventResourceCalendarBuildResult = {
  entries: EventResourceCalendarEntry[];
  invalidSlots: InvalidEventCalendarSlot[];
};

export type EventCalendarTiming = {
  start: Date | null;
  end: Date | null;
  hasFiniteEnd: boolean;
};

type EventCalendarSlotInterval = {
  slot: LeagueSlotForm;
  slotIndex: number;
  start: Date;
  end: Date;
  occurrenceDate: string;
  timeZone: string;
};

const isValidDate = (value: Date | null | undefined): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const normalizeTimeZone = (value: string | null | undefined): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "UTC";
const localDateStartInTimeZone = (
  value: unknown,
  timeZone: string,
): Date | null => {
  const localDate = getRepeatingTimeSlotLocalDate(value, timeZone);
  return localDate
    ? zonedTimeToUtcDate(`${localDate}T00:00:00`, timeZone)
    : null;
};

const displayDate = (value: Date, timeZone: string): Date =>
  instantToCalendarDateInTimeZone(value, timeZone) ?? new Date(value.getTime());

const displayInterval = (
  start: Date,
  end: Date,
  timeZone: string,
): { start: Date; end: Date } => ({
  start: displayDate(start, timeZone),
  end: displayDate(end, timeZone),
});


const eventCalendarResource = (
  field: Field,
  fallback = "Resource",
): ResourceCalendarResource => ({
  id: field.$id,
  label: getFacilityScopedFieldDisplayName(field, fallback),
  facilityId: field.facilityId ?? null,
  facilityName:
    field.facility && typeof field.facility === "object"
      ? field.facility.name ?? null
      : typeof field.facility === "string"
        ? field.facility
        : null,
});

export const buildEventCalendarResources = (
  fields: Field[],
  resourceLabel = "Resource",
): ResourceCalendarResource[] =>
  fields.map((field) => eventCalendarResource(field, resourceLabel));

const resourceIdsForSlot = (slot: LeagueSlotForm): string[] =>
  normalizeSlotFieldIds(slot);
const slotHasConfiguration = (slot: LeagueSlotForm): boolean =>
  Boolean(
    slot.$id
      || resourceIdsForSlot(slot).length
      || normalizeWeekdays(slot).length
      || Number.isFinite(slot.startTimeMinutes)
      || Number.isFinite(slot.endTimeMinutes)
      || slot.startDate
      || slot.endDate,
  );

const addResolvedInterval = (
  intervals: EventCalendarSlotInterval[],
  slot: LeagueSlotForm,
  slotIndex: number,
  start: Date,
  end: Date,
  occurrenceDate: string,
  timeZone: string,
): void => {
  if (!isValidDate(start) || !isValidDate(end) || end <= start) {
    return;
  }
  intervals.push({
    slot,
    slotIndex,
    start,
    end,
    occurrenceDate,
    timeZone,
  });
};

const addInvalidSlot = (
  invalidSlots: InvalidEventCalendarSlot[],
  slotIndex: number,
  slotKey: string,
  resourceIds: string[],
  error: unknown,
): void => {
  invalidSlots.push({
    slotIndex,
    slotKey,
    reason: error instanceof Error ? error.message : "Time Slot cannot be resolved.",
    resourceIds,
  });
};

type RepeatingCalendarWindow = ResourceCalendarRange & {
  validationWindow: ResourceCalendarRange;
};

const resolveRepeatingCalendarWindow = (options: {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  eventTimeZone: string;
  slot: LeagueSlotForm;
  timeZone: string;
}): RepeatingCalendarWindow => {
  if (!options.rangeStart) {
    throw new Error("Calendar range is required.");
  }
  if (!options.rangeEnd) {
    throw new Error("Calendar range is required.");
  }
  const slotEventStart =
    localDateStartInTimeZone(options.slot.startDate, options.timeZone) ??
    options.eventStart;
  if (!slotEventStart) {
    throw new Error("Event start and Time Slot start date are required.");
  }
  const validationWindow = resolveRepeatingTimeSlotValidationWindow({
    slot: options.slot,
    eventStart: slotEventStart,
    eventEnd: options.slot.endDate ? null : options.eventEnd,
  });
  if (!validationWindow) {
    throw new Error("Repeating Time Slot has no valid date range.");
  }
  const hasFiniteEventEnd =
    isValidDate(options.eventEnd) &&
    options.eventEnd.getTime() > slotEventStart.getTime();
  const displayEnd =
    options.slot.endDate || hasFiniteEventEnd
      ? Math.min(validationWindow.end.getTime(), options.rangeEnd.getTime())
      : options.rangeEnd.getTime();
  return {
    start: new Date(
      Math.max(validationWindow.start.getTime(), options.rangeStart.getTime()),
    ),
    end: new Date(displayEnd),
    validationWindow: {
      start: validationWindow.start,
      end: validationWindow.end,
    },
  };
};

const addNoOccurrenceError = (options: {
  invalidSlots: InvalidEventCalendarSlot[];
  slot: LeagueSlotForm;
  slotIndex: number;
  slotKey: string;
  resourceIds: string[];
  occurrenceCount: number;
}): void => {
  if (options.occurrenceCount === 0 && normalizeWeekdays(options.slot).length > 0) {
    options.invalidSlots.push({
      slotIndex: options.slotIndex,
      slotKey: options.slotKey,
      reason: `${REPEATING_SLOT_NO_OCCURRENCE_ERROR} ${REPEATING_SLOT_NO_OCCURRENCE_ACTION}`,
      resourceIds: options.resourceIds,
    });
  }
};

const resolveRepeatingSlotIntervals = (options: {
  intervals: EventCalendarSlotInterval[];
  invalidSlots: InvalidEventCalendarSlot[];
  rangeStart: Date | null;
  rangeEnd: Date | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  eventTimeZone: string;
  slot: LeagueSlotForm;
  slotIndex: number;
  slotKey: string;
  resourceIds: string[];
  timeZone: string;
}): void => {
  const calendarWindow = resolveRepeatingCalendarWindow(options);
  const validationOccurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: options.slot,
    windowStart: calendarWindow.validationWindow.start,
    windowEnd: calendarWindow.validationWindow.end,
  });
  addNoOccurrenceError({
    invalidSlots: options.invalidSlots,
    slot: options.slot,
    slotIndex: options.slotIndex,
    slotKey: options.slotKey,
    resourceIds: options.resourceIds,
    occurrenceCount: validationOccurrences.length,
  });
  if (calendarWindow.end <= calendarWindow.start) {
    return;
  }
  const occurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: options.slot,
    windowStart: calendarWindow.start,
    windowEnd: calendarWindow.end,
  });
  for (const occurrence of occurrences) {
    addResolvedInterval(
      options.intervals,
      options.slot,
      options.slotIndex,
      occurrence.start,
      occurrence.end,
      occurrence.occurrenceDate,
      options.timeZone,
    );
  }
};

const resolveSlotIntervals = (options: {
  slots: LeagueSlotForm[];
  eventStart: Date | null;
  eventEnd: Date | null;
  eventTimeZone: string;
  range: ResourceCalendarRange;
}): { intervals: EventCalendarSlotInterval[]; invalidSlots: InvalidEventCalendarSlot[] } => {
  const intervals: EventCalendarSlotInterval[] = [];
  const invalidSlots: InvalidEventCalendarSlot[] = [];
  const rangeStart =
    calendarDateInTimeZoneToInstant(options.range.start, options.eventTimeZone) ??
    options.range.start;
  const rangeEnd =
    calendarDateInTimeZoneToInstant(options.range.end, options.eventTimeZone) ??
    options.range.end;

  for (const [slotIndex, slot] of options.slots.entries()) {
    const slotKey = slot.key || slot.$id || `slot-${slotIndex + 1}`;
    if (!slotHasConfiguration(slot)) {
      continue;
    }
    const resourceIds = resourceIdsForSlot(slot);
    const timeZone = normalizeTimeZone(slot.timeZone);

    try {
      if (slot.repeating === false) {
        const resolved = resolveOneTimeTimeSlot(slot, timeZone);
        addResolvedInterval(
          intervals,
          slot,
          slotIndex,
          resolved.start,
          resolved.end,
          resolved.localDate,
          timeZone,
        );
      } else {
        resolveRepeatingSlotIntervals({
          intervals,
          invalidSlots,
          rangeStart,
          rangeEnd,
          eventStart: options.eventStart,
          eventEnd: options.eventEnd,
          eventTimeZone: options.eventTimeZone,
          slot,
          slotIndex,
          slotKey,
          resourceIds,
          timeZone,
        });
      }
    } catch (error) {
      addInvalidSlot(invalidSlots, slotIndex, slotKey, resourceIds, error);
    }
  }

  return { intervals, invalidSlots };
};

export const buildEventResourceCalendar = (options: {
  slots: LeagueSlotForm[];
  fields: Field[];
  eventStart?: string | null;
  eventEnd?: string | null;
  eventTimeZone?: string | null;
  range: ResourceCalendarRange;
}): EventResourceCalendarBuildResult => {
  const eventTimeZone = normalizeTimeZone(options.eventTimeZone);
  const eventStart = parseDateTimeInTimeZone(options.eventStart, eventTimeZone);
  const eventEnd = parseDateTimeInTimeZone(options.eventEnd, eventTimeZone);
  const fieldById = new Map(options.fields.map((field) => [field.$id, field]));
  const resolved = resolveSlotIntervals({
    slots: options.slots,
    eventStart,
    eventEnd,
    eventTimeZone,
    range: options.range,
  });
  const entries: EventResourceCalendarEntry[] = [];

  resolved.intervals.forEach((interval) => {
    const resourceIds = resourceIdsForSlot(interval.slot);
    const slotKey = interval.slot.key || interval.slot.$id || `slot-${interval.slotIndex + 1}`;
    const intervalDisplay = displayInterval(
      interval.start,
      interval.end,
      eventTimeZone,
    );
    resourceIds.forEach((resourceId) => {
      const resource = fieldById.get(resourceId);
      if (!resource) {
        return;
      }
      const entry: EventResourceCalendarEntry = {
        id: `event-slot-${slotKey}-${resourceId}-${interval.occurrenceDate}`,
        title: getFacilityScopedFieldDisplayName(resource),
        start: intervalDisplay.start,
        end: intervalDisplay.end,
        instantStart: interval.start,
        instantEnd: interval.end,
        resourceId,
        resource,
        slotIndex: interval.slotIndex,
        slotKey,
        logicalSlotKey: slotKey,
        occurrenceDate: interval.occurrenceDate,
        repeating: interval.slot.repeating !== false,
        timeZone: interval.timeZone,
      };
      if (entriesOverlapRange(entry, options.range)) {
        entries.push(entry);
      }
    });
  });

  options.slots.forEach((slot, slotIndex) => {
    if (!slotHasConfiguration(slot)) {
      return;
    }
    const resourceIds = resourceIdsForSlot(slot);
    const slotKey = slot.key || slot.$id || `slot-${slotIndex + 1}`;
    if (resourceIds.length === 0) {
      const alreadyInvalid = resolved.invalidSlots.some(
        (invalid) => invalid.slotIndex === slotIndex,
      );
      if (!alreadyInvalid) {
        resolved.invalidSlots.push({
          slotIndex,
          slotKey,
          reason: "Assign at least one Resource or delete this Time Slot.",
          resourceIds,
        });
      }
      return;
    }
    const unknownResource = resourceIds.some((resourceId) => !fieldById.has(resourceId));
    if (unknownResource) {
      resolved.invalidSlots.push({
        slotIndex,
        slotKey,
        reason: "The selected Resource is not available. Assign another Resource or delete this Time Slot.",
        resourceIds,
      });
    }
  });

  return {
    entries,
    invalidSlots: resolved.invalidSlots.filter(
      (invalid, index, all) =>
        all.findIndex((candidate) => candidate.slotIndex === invalid.slotIndex) === index,
    ),
  };
};

const nextLocalMidnightAfter = (
  value: string | number | Date | null | undefined,
  timeZone: string,
): Date | null => {
  const parsed = parseDateTimeInTimeZone(value, timeZone);
  const parts = parsed ? getDateTimePartsInTimeZone(parsed, timeZone) : null;
  if (!parts) {
    return null;
  }
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return zonedTimeToUtcDate(
    `${nextDate.toISOString().slice(0, 10)}T00:00:00`,
    timeZone,
  );
};

const resolveAllSlotIntervals = (options: {
  slots: LeagueSlotForm[];
  eventStart: Date | null;
  eventEnd: Date | null;
  ignoreEventBounds?: boolean;
}): EventCalendarSlotInterval[] => {
  const intervals: EventCalendarSlotInterval[] = [];
  options.slots.forEach((slot, slotIndex) => {
    if (resourceIdsForSlot(slot).length === 0) {
      return;
    }
    const timeZone = normalizeTimeZone(slot.timeZone);
    try {
      if (slot.repeating === false) {
        const resolved = resolveOneTimeTimeSlot(slot, timeZone);
        addResolvedInterval(
          intervals,
          slot,
          slotIndex,
          resolved.start,
          resolved.end,
          resolved.localDate,
          timeZone,
        );
        return;
      }
      const slotEventStart =
        localDateStartInTimeZone(slot.startDate, timeZone) ?? options.eventStart;
      const slotEventEnd =
        options.ignoreEventBounds || slot.endDate ? null : options.eventEnd;
      if (!slotEventStart) {
        return;
      }
      const validationWindow = resolveRepeatingTimeSlotValidationWindow({
        slot,
        eventStart: slotEventStart,
        eventEnd: slotEventEnd,
      });
      if (!validationWindow) {
        return;
      }
      enumerateRepeatingTimeSlotOccurrences({
        slot,
        windowStart: validationWindow.start,
        windowEnd: validationWindow.end,
      }).forEach((occurrence) => {
        addResolvedInterval(
          intervals,
          slot,
          slotIndex,
          occurrence.start,
          occurrence.end,
          occurrence.occurrenceDate,
          timeZone,
        );
      });
    } catch {
      // Invalid legacy slots do not contribute to derived timing.
    }
  });
  return intervals;
};

export const deriveCalendarTimingFromSlots = (options: {
  slots: LeagueSlotForm[];
  eventStart?: string | null;
  eventEnd?: string | null;
  eventTimeZone?: string | null;
  eventType?: string;
  isAutomatedScheduling?: boolean;
  ignoreEventBounds?: boolean;
}): EventCalendarTiming => {
  const timeZone = normalizeTimeZone(options.eventTimeZone);
  const eventStart = parseDateTimeInTimeZone(options.eventStart, timeZone);
  const eventEnd = parseDateTimeInTimeZone(options.eventEnd, timeZone);
  const intervals = resolveAllSlotIntervals({
    slots: options.slots,
    eventStart,
    eventEnd,
    ignoreEventBounds: options.ignoreEventBounds,
  });
  if (!intervals.length) {
    return { start: null, end: null, hasFiniteEnd: false };
  }
  const start = new Date(
    Math.min(...intervals.map((interval) => interval.start.getTime())),
  );
  const finiteCalendarBoundaryEnds = intervals.flatMap((interval) => {
    if (interval.slot.repeating === false || !interval.slot.endDate) {
      return [];
    }
    const boundary = nextLocalMidnightAfter(
      interval.slot.endDate,
      normalizeTimeZone(interval.slot.timeZone),
    );
    return boundary ? [boundary.getTime()] : [];
  });
  const latestEnd = new Date(
    Math.max(
      ...intervals.map((interval) => interval.end.getTime()),
      ...finiteCalendarBoundaryEnds,
    ),
  );
  const hasOpenRepeatingSlot = intervals.some(
    ({ slot }) =>
      slot.repeating !== false &&
      !slot.endDate &&
      resourceIdsForSlot(slot).length > 0 &&
      slotHasConfiguration(slot),
  );
  const hasOpenEventEnd =
    (options.ignoreEventBounds || !eventEnd) && hasOpenRepeatingSlot;
  const hasFiniteEnd = !hasOpenEventEnd;
  return {
    start,
    end: hasFiniteEnd ? latestEnd : null,
    hasFiniteEnd,
  };
};

export const formatEventCalendarInterval = (
  entry: Pick<EventResourceCalendarEntry, "start" | "end">,
): string => `${format(entry.start, "yyyy-MM-dd HH:mm")} – ${format(entry.end, "yyyy-MM-dd HH:mm")}`;

export const eventCalendarDayRange = (date: Date): ResourceCalendarRange => ({
  start: startOfDay(date),
  end: endOfDay(date),
});

export const eventCalendarNextDate = (
  view: "week" | "month",
  date: Date,
  direction: -1 | 1,
): Date => (view === "month" ? new Date(date.getFullYear(), date.getMonth() + direction, 1) : addDays(date, direction * 7));

export const eventCalendarDayLabel = (date: Date): string => format(date, "EEE d");
