import type { Event, TimeSlot } from "@/types";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  formatDateTimeInTimeZone,
  formatLocalDateTime,
  parseDateTimeInTimeZone,
  zonedTimeToUtcDate,
} from "@/lib/dateUtils";
import {
  enumerateRepeatingTimeSlotOccurrences,
  getRepeatingTimeSlotLocalDate,
  RepeatingTimeSlotValidationError,
  repeatingTimeSlotOccurrencesOverlap,
  resolveRepeatingTimeSlotValidationWindow,
} from "@/lib/repeatingTimeSlotAvailability";

import { formatEventDateTimeForForm } from "./dateHelpers";
import { normalizeDivisionKeys } from "./divisionForm";
import { hasParentEventRef } from "./eventRules";
import { normalizeSlotFieldIds, normalizeWeekdays } from "./slotForm";
import { slotDateTimeRangesOverlap } from "./slotValidation";

type EventType = Event["eventType"];

export const CONFLICT_LOOKUP_START = "1970-01-01T00:00:00.000Z";
export const CONFLICT_LOOKUP_END = "2100-01-01T00:00:00.000Z";

const AUTO_RESOLVE_STEP_MINUTES = 15;
const AUTO_RESOLVE_MAX_STEPS = 96;

export type SlotConflictSnapshot = {
  key: string;
  $id?: string;
  scheduledFieldId?: string;
  scheduledFieldIds: string[];
  dayOfWeek?: number;
  daysOfWeek: number[];
  divisions: string[];
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  repeating: boolean;
};

export type SlotConflictPayload = {
  eventId: string;
  eventType: EventType;
  parentEvent?: string | null;
  eventStart?: string;
  eventEnd?: string;
  eventNoFixedEndDateTime?: boolean;
  slots: SlotConflictSnapshot[];
};

export type SlotConflictContext = {
  eventId: string;
  eventStart?: string;
  eventEnd?: string;
  eventNoFixedEndDateTime?: boolean;
};

type BuildSlotConflictPayloadOptions = {
  eventId?: string | null;
  eventType: EventType;
  parentEvent?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  eventNoFixedEndDateTime?: boolean;
  slots: LeagueSlotForm[];
};

type ComparableConflictSlot = {
  repeating?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  dayOfWeek?: number;
  daysOfWeek?: number[];
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  scheduledFieldId?: string;
  scheduledFieldIds?: string[];
};

const addMinutesToDate = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60 * 1000);

const parseEventRange = (event: Event): { start: Date; end: Date } | null => {
  const timeZone = event.timeZone?.trim() || "UTC";
  const start = parseDateTimeInTimeZone(event.start ?? null, timeZone);
  const end = parseDateTimeInTimeZone(event.end ?? null, timeZone);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end };
};

const resolveSlotWindowRange = (
  slot: Pick<ComparableConflictSlot, "startDate" | "endDate" | "timeZone">,
  eventStart?: string,
  eventEnd?: string,
): { start: Date; end: Date } | null => {
  const timeZone =
    typeof slot.timeZone === "string" && slot.timeZone.trim()
      ? slot.timeZone
      : "UTC";
  const localBoundary = (value: string | null | undefined): Date | null => {
    const localDate = getRepeatingTimeSlotLocalDate(value, timeZone);
    return localDate
      ? zonedTimeToUtcDate(`${localDate}T00:00:00`, timeZone)
      : null;
  };
  const parseBoundary = (value: string | null | undefined): Date | null =>
    value ? parseDateTimeInTimeZone(value, timeZone) : null;

  const configuredStart = slot.startDate ? localBoundary(slot.startDate) : null;
  const validationStart = parseBoundary(eventStart) ?? configuredStart;
  if (!validationStart) {
    return null;
  }

  return resolveRepeatingTimeSlotValidationWindow({
    slot,
    eventStart: validationStart,
    eventEnd: parseBoundary(eventEnd),
  });
};

const repeatingSlotOverlapsEvent = (
  slot: Pick<
    ComparableConflictSlot,
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "startDate"
    | "endDate"
    | "timeZone"
  >,
  eventRange: { start: Date; end: Date },
): boolean => {
  const slotDays = normalizeWeekdays(slot);
  if (
    !slotDays.length ||
    typeof slot.startTimeMinutes !== "number" ||
    typeof slot.endTimeMinutes !== "number"
  ) {
    return false;
  }
  return enumerateRepeatingTimeSlotOccurrences({
    slot,
    windowStart: eventRange.start,
    windowEnd: eventRange.end,
  }).some((occurrence) =>
    slotDateTimeRangesOverlap(
      occurrence.start,
      occurrence.end,
      eventRange.start,
      eventRange.end,
    ),
  );
};

const parseExplicitSlotRange = (
  slot: Pick<ComparableConflictSlot, "startDate" | "endDate" | "timeZone">,
): { start: Date; end: Date } | null => {
  const timeZone =
    typeof slot.timeZone === "string" && slot.timeZone.trim()
      ? slot.timeZone
      : "UTC";
  const start = parseDateTimeInTimeZone(slot.startDate ?? null, timeZone);
  const end = parseDateTimeInTimeZone(slot.endDate ?? null, timeZone);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end };
};

export const buildSlotConflictSnapshot = (
  slot: LeagueSlotForm,
): SlotConflictSnapshot => {
  const normalizedDays = normalizeWeekdays(slot);
  const normalizedFieldIds = normalizeSlotFieldIds(slot);
  return {
    key: slot.key,
    $id: slot.$id,
    scheduledFieldId: normalizedFieldIds[0],
    scheduledFieldIds: normalizedFieldIds,
    dayOfWeek: normalizedDays[0],
    daysOfWeek: normalizedDays,
    divisions: normalizeDivisionKeys(slot.divisions),
    startDate:
      formatEventDateTimeForForm(
        slot.startDate ?? null,
        slot.timeZone ?? "UTC",
      ) || undefined,
    endDate:
      formatEventDateTimeForForm(
        slot.endDate ?? null,
        slot.timeZone ?? "UTC",
      ) || undefined,
    timeZone: slot.timeZone,
    startTimeMinutes:
      typeof slot.startTimeMinutes === "number"
        ? slot.startTimeMinutes
        : undefined,
    endTimeMinutes:
      typeof slot.endTimeMinutes === "number" ? slot.endTimeMinutes : undefined,
    repeating: slot.repeating !== false,
  };
};

export const buildSlotConflictPayload = ({
  eventId,
  eventType,
  parentEvent,
  eventStart,
  eventEnd,
  eventNoFixedEndDateTime,
  slots,
}: BuildSlotConflictPayloadOptions): SlotConflictPayload => ({
  eventId: eventId ?? "",
  eventType,
  parentEvent: parentEvent ?? null,
  eventStart: eventStart ?? undefined,
  eventEnd: eventNoFixedEndDateTime ? undefined : (eventEnd ?? undefined),
  eventNoFixedEndDateTime: eventNoFixedEndDateTime || undefined,
  slots: slots.map(buildSlotConflictSnapshot),
});

export const buildSlotConflictCheckKey = (
  options: BuildSlotConflictPayloadOptions,
): string => JSON.stringify(buildSlotConflictPayload(options));

export const buildSlotConflictContext = ({
  eventId,
  eventStart,
  eventEnd,
  eventNoFixedEndDateTime,
}: Pick<
  BuildSlotConflictPayloadOptions,
  "eventId" | "eventStart" | "eventEnd" | "eventNoFixedEndDateTime"
>): SlotConflictContext => ({
  eventId: eventId ?? "",
  eventStart: eventStart ?? undefined,
  eventEnd: eventNoFixedEndDateTime ? undefined : (eventEnd ?? undefined),
  eventNoFixedEndDateTime: eventNoFixedEndDateTime || undefined,
});

export const normalizeSlotBoundaryOverrideForForm = (
  slotValue: string | Date | null | undefined,
  eventBoundary: string | Date | null | undefined,
  timeZone: string,
): string | undefined => {
  const normalizedSlotValue = formatEventDateTimeForForm(
    slotValue ?? null,
    timeZone,
  );
  if (!normalizedSlotValue) {
    return undefined;
  }

  const normalizedEventBoundary = formatEventDateTimeForForm(
    eventBoundary ?? null,
    timeZone,
  );
  return normalizedEventBoundary &&
    normalizedSlotValue === normalizedEventBoundary
    ? undefined
    : normalizedSlotValue;
};

const repeatingSlotsOverlap = (
  slotA: Pick<
    ComparableConflictSlot,
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "startDate"
    | "endDate"
    | "timeZone"
  >,
  contextA: { eventStart?: string; eventEnd?: string },
  slotB: Pick<
    ComparableConflictSlot,
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "startDate"
    | "endDate"
    | "timeZone"
  >,
  contextB: { eventStart?: string; eventEnd?: string },
): boolean => {
  const slotADays = normalizeWeekdays(slotA);
  const slotBDays = normalizeWeekdays(slotB);
  if (
    !slotADays.length ||
    !slotBDays.length ||
    typeof slotA.startTimeMinutes !== "number" ||
    typeof slotA.endTimeMinutes !== "number" ||
    typeof slotB.startTimeMinutes !== "number" ||
    typeof slotB.endTimeMinutes !== "number"
  ) {
    return false;
  }

  const slotAWindow = resolveSlotWindowRange(
    slotA,
    contextA.eventStart,
    contextA.eventEnd,
  );
  const slotBWindow = resolveSlotWindowRange(
    slotB,
    contextB.eventStart,
    contextB.eventEnd,
  );
  if (!slotAWindow || !slotBWindow) {
    return false;
  }

  return repeatingTimeSlotOccurrencesOverlap({
    firstSlot: slotA,
    secondSlot: slotB,
    firstWindow: slotAWindow,
    secondWindow: slotBWindow,
    firstOpenEnded: !slotA.endDate && !contextA.eventEnd,
    secondOpenEnded: !slotB.endDate && !contextB.eventEnd,
  });
};

const slotOverlapsExistingSlot = (
  slot: Pick<
    ComparableConflictSlot,
    | "repeating"
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "startDate"
    | "endDate"
    | "timeZone"
  >,
  slotContext: { eventStart?: string; eventEnd?: string },
  existingSlot: Pick<
    ComparableConflictSlot,
    | "repeating"
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "startDate"
    | "endDate"
    | "timeZone"
  >,
  existingSlotContext: { eventStart?: string; eventEnd?: string },
): boolean => {
  const isSlotRepeating = slot.repeating !== false;
  const isExistingSlotRepeating = existingSlot.repeating !== false;

  if (!isSlotRepeating && !isExistingSlotRepeating) {
    const slotRange = parseExplicitSlotRange(slot);
    const existingRange = parseExplicitSlotRange(existingSlot);
    if (!slotRange || !existingRange) {
      return false;
    }
    return slotDateTimeRangesOverlap(
      slotRange.start,
      slotRange.end,
      existingRange.start,
      existingRange.end,
    );
  }

  if (isSlotRepeating && isExistingSlotRepeating) {
    return repeatingSlotsOverlap(
      slot,
      slotContext,
      existingSlot,
      existingSlotContext,
    );
  }

  if (isSlotRepeating) {
    const existingRange =
      parseExplicitSlotRange(existingSlot) ??
      resolveSlotWindowRange(
        existingSlot,
        existingSlotContext.eventStart,
        existingSlotContext.eventEnd,
      );
    if (!existingRange) {
      return false;
    }
    return repeatingSlotOverlapsEvent(slot, existingRange);
  }

  const slotRange =
    parseExplicitSlotRange(slot) ??
    resolveSlotWindowRange(slot, slotContext.eventStart, slotContext.eventEnd);
  if (!slotRange) {
    return false;
  }
  return repeatingSlotOverlapsEvent(existingSlot, slotRange);
};

const findOverlappingEventSlotForField = (
  slot: Pick<
    ComparableConflictSlot,
    | "repeating"
    | "startDate"
    | "endDate"
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "timeZone"
  >,
  event: Event,
  context: SlotConflictContext,
  fieldId?: string,
): TimeSlot | null => {
  if (!event?.$id || event.$id === context.eventId) {
    return null;
  }
  if (!Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
    return null;
  }
  const normalizedFieldId = typeof fieldId === "string" ? fieldId.trim() : "";
  if (!normalizedFieldId) {
    return null;
  }

  const eventSlotContext = {
    eventStart: event.start ?? undefined,
    eventEnd: event.noFixedEndDateTime ? undefined : (event.end ?? undefined),
  };

  for (const eventSlot of event.timeSlots) {
    const eventSlotFieldIds = normalizeSlotFieldIds({
      scheduledFieldId: eventSlot.scheduledFieldId,
      scheduledFieldIds: eventSlot.scheduledFieldIds,
    });
    if (!eventSlotFieldIds.includes(normalizedFieldId)) {
      continue;
    }
    if (slotOverlapsExistingSlot(slot, context, eventSlot, eventSlotContext)) {
      return eventSlot;
    }
  }

  return null;
};

const slotOverlapsExistingEvent = (
  slot: Pick<
    ComparableConflictSlot,
    | "repeating"
    | "startDate"
    | "endDate"
    | "dayOfWeek"
    | "daysOfWeek"
    | "startTimeMinutes"
    | "endTimeMinutes"
    | "timeZone"
  >,
  event: Event,
  context: SlotConflictContext,
  fieldId?: string,
): boolean => {
  if (!event?.$id || event.$id === context.eventId) {
    return false;
  }

  const normalizedEventType =
    typeof event.eventType === "string" ? event.eventType.toUpperCase() : "";
  const isSlotBasedEventType =
    normalizedEventType === "LEAGUE" ||
    normalizedEventType === "TOURNAMENT" ||
    (normalizedEventType === "WEEKLY_EVENT" &&
      !hasParentEventRef(event.parentEvent ?? null));
  const overlappingEventSlot = findOverlappingEventSlotForField(
    slot,
    event,
    context,
    fieldId,
  );
  if (overlappingEventSlot) {
    return true;
  }
  if (isSlotBasedEventType) {
    return false;
  }

  const eventRange = parseEventRange(event);
  if (!eventRange) {
    return false;
  }

  if (slot.repeating === false) {
    const slotRange = parseExplicitSlotRange(slot);
    if (!slotRange) {
      return false;
    }
    return slotDateTimeRangesOverlap(
      slotRange.start,
      slotRange.end,
      eventRange.start,
      eventRange.end,
    );
  }

  return repeatingSlotOverlapsEvent(slot, eventRange);
};

export const snapshotToSlotForm = (
  slot: SlotConflictSnapshot,
): LeagueSlotForm => ({
  key: slot.key,
  $id: slot.$id,
  scheduledFieldId: slot.scheduledFieldId,
  scheduledFieldIds: slot.scheduledFieldIds,
  dayOfWeek: slot.dayOfWeek as LeagueSlotForm["dayOfWeek"],
  daysOfWeek: slot.daysOfWeek as LeagueSlotForm["daysOfWeek"],
  divisions: slot.divisions,
  startDate: slot.startDate,
  endDate: slot.endDate,
  timeZone: slot.timeZone,
  startTimeMinutes: slot.startTimeMinutes,
  endTimeMinutes: slot.endTimeMinutes,
  repeating: slot.repeating,
  conflicts: [],
  checking: false,
  error: undefined,
});

export const slotCanCheckExternalConflicts = (
  slot: LeagueSlotForm,
  context: SlotConflictContext,
): boolean => {
  if (!normalizeSlotFieldIds(slot).length) {
    return false;
  }

  if (slot.repeating === false) {
    const slotRange = parseExplicitSlotRange(slot);
    return Boolean(slotRange);
  }

  const hasTimeRange =
    typeof slot.startTimeMinutes === "number" &&
    Number.isFinite(slot.startTimeMinutes) &&
    typeof slot.endTimeMinutes === "number" &&
    Number.isFinite(slot.endTimeMinutes);
  if (!hasTimeRange || normalizeWeekdays(slot).length === 0) {
    return false;
  }

  try {
    return Boolean(
      resolveSlotWindowRange(slot, context.eventStart, context.eventEnd),
    );
  } catch (error) {
    if (error instanceof RepeatingTimeSlotValidationError) {
      return false;
    }
    throw error;
  }
};

const minutesFromDate = (value: Date | null): number | undefined => {
  if (!value) {
    return undefined;
  }
  return value.getHours() * 60 + value.getMinutes();
};

const buildConflictEntry = (
  slot: LeagueSlotForm,
  event: Event,
  fieldId: string,
  context: SlotConflictContext,
): LeagueSlotForm["conflicts"][number] => {
  const overlappingEventSlot = findOverlappingEventSlotForField(
    slot,
    event,
    context,
    fieldId,
  );
  if (overlappingEventSlot) {
    const overlappingFieldIds = normalizeSlotFieldIds({
      scheduledFieldId: overlappingEventSlot.scheduledFieldId,
      scheduledFieldIds: overlappingEventSlot.scheduledFieldIds,
    });
    return {
      event,
      schedule: {
        $id: overlappingEventSlot.$id || `event-${event.$id}-field-${fieldId}`,
        repeating: overlappingEventSlot.repeating !== false,
        dayOfWeek: overlappingEventSlot.dayOfWeek,
        daysOfWeek: overlappingEventSlot.daysOfWeek,
        startDate: overlappingEventSlot.startDate,
        endDate: overlappingEventSlot.endDate ?? undefined,
        timeZone: overlappingEventSlot.timeZone ?? event.timeZone,
        startTimeMinutes: overlappingEventSlot.startTimeMinutes,
        endTimeMinutes: overlappingEventSlot.endTimeMinutes,
        scheduledFieldId: overlappingFieldIds[0] ?? fieldId,
        scheduledFieldIds: overlappingFieldIds.length
          ? overlappingFieldIds
          : [fieldId],
      },
    };
  }

  const eventTimeZone = event.timeZone?.trim() || "UTC";
  const eventStart = parseDateTimeInTimeZone(
    event.start ?? null,
    eventTimeZone,
  );
  const eventEnd = parseDateTimeInTimeZone(event.end ?? null, eventTimeZone);

  return {
    event,
    schedule: {
      $id: `event-${event.$id}-field-${fieldId}`,
      repeating: false,
      startDate: event.start ?? undefined,
      endDate: event.end ?? undefined,
      timeZone: eventTimeZone,
      startTimeMinutes: minutesFromDate(eventStart),
      endTimeMinutes: minutesFromDate(eventEnd),
      scheduledFieldId: fieldId,
      scheduledFieldIds: [fieldId],
    },
  };
};

export const buildExternalSlotConflicts = (
  slot: LeagueSlotForm,
  eventsByFieldId: Map<string, Event[]>,
  context: SlotConflictContext,
): LeagueSlotForm["conflicts"] => {
  const seen = new Set<string>();
  const conflicts: LeagueSlotForm["conflicts"] = [];

  normalizeSlotFieldIds(slot).forEach((fieldId) => {
    const fieldEvents = eventsByFieldId.get(fieldId) ?? [];
    fieldEvents.forEach((event) => {
      if (!slotOverlapsExistingEvent(slot, event, context, fieldId)) {
        return;
      }
      const key = `${event.$id}:${fieldId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      conflicts.push(buildConflictEntry(slot, event, fieldId, context));
    });
  });

  return conflicts.sort((left, right) => {
    const leftTimeZone = left.event.timeZone?.trim() || "UTC";
    const rightTimeZone = right.event.timeZone?.trim() || "UTC";
    const leftStart =
      parseDateTimeInTimeZone(
        left.event.start ?? null,
        leftTimeZone,
      )?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightStart =
      parseDateTimeInTimeZone(
        right.event.start ?? null,
        rightTimeZone,
      )?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  });
};

const hasConflictingEvents = (
  slot: LeagueSlotForm,
  conflicts: LeagueSlotForm["conflicts"],
  context: SlotConflictContext,
): boolean =>
  conflicts.some((conflict) =>
    slotOverlapsExistingEvent(
      slot,
      conflict.event,
      context,
      normalizeSlotFieldIds({
        scheduledFieldId: conflict.schedule?.scheduledFieldId,
        scheduledFieldIds: conflict.schedule?.scheduledFieldIds,
      })[0],
    ),
  );

export const buildAutoResolvedSlotUpdate = (
  slot: LeagueSlotForm,
  context: SlotConflictContext,
): Partial<LeagueSlotForm> | null => {
  if (!slot.conflicts.length) {
    return null;
  }

  if (slot.repeating === false) {
    const slotRange = parseExplicitSlotRange(slot);
    if (!slotRange) {
      return null;
    }
    const durationMinutes = Math.max(
      AUTO_RESOLVE_STEP_MINUTES,
      Math.ceil(
        (slotRange.end.getTime() - slotRange.start.getTime()) / (60 * 1000),
      ),
    );
    const latestConflictEnd = slot.conflicts
      .map((conflict) => {
        const timeZone = conflict.event.timeZone?.trim() || "UTC";
        return parseDateTimeInTimeZone(conflict.event.end ?? null, timeZone);
      })
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    let candidateStart =
      latestConflictEnd &&
      latestConflictEnd.getTime() > slotRange.start.getTime()
        ? addMinutesToDate(latestConflictEnd, AUTO_RESOLVE_STEP_MINUTES)
        : addMinutesToDate(slotRange.start, AUTO_RESOLVE_STEP_MINUTES);
    const slotTimeZone = slot.timeZone?.trim() || "UTC";

    for (let step = 0; step < AUTO_RESOLVE_MAX_STEPS; step += 1) {
      const candidateEnd = addMinutesToDate(candidateStart, durationMinutes);
      const candidateSlot: LeagueSlotForm = {
        ...slot,
        startDate:
          formatDateTimeInTimeZone(candidateStart, slotTimeZone) || undefined,
        endDate:
          formatDateTimeInTimeZone(candidateEnd, slotTimeZone) || undefined,
      };
      if (!hasConflictingEvents(candidateSlot, slot.conflicts, context)) {
        return {
          startDate: candidateSlot.startDate,
          endDate: candidateSlot.endDate,
        };
      }
      candidateStart = addMinutesToDate(
        candidateStart,
        AUTO_RESOLVE_STEP_MINUTES,
      );
    }

    return null;
  }

  if (
    typeof slot.startTimeMinutes !== "number" ||
    typeof slot.endTimeMinutes !== "number" ||
    slot.endTimeMinutes <= slot.startTimeMinutes
  ) {
    return null;
  }

  const durationMinutes = slot.endTimeMinutes - slot.startTimeMinutes;
  for (let step = 1; step < AUTO_RESOLVE_MAX_STEPS; step += 1) {
    const candidateStart =
      slot.startTimeMinutes + step * AUTO_RESOLVE_STEP_MINUTES;
    const candidateEnd = candidateStart + durationMinutes;
    if (candidateEnd > 24 * 60) {
      break;
    }
    const candidateSlot: LeagueSlotForm = {
      ...slot,
      startTimeMinutes: candidateStart,
      endTimeMinutes: candidateEnd,
    };
    if (!hasConflictingEvents(candidateSlot, slot.conflicts, context)) {
      return {
        startTimeMinutes: candidateStart,
        endTimeMinutes: candidateEnd,
      };
    }
  }

  return null;
};
