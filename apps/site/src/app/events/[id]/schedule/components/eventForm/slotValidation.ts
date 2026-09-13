import type { Event } from "@/types";
import { zonedTimeToUtcDate } from "@/lib/dateUtils";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  assertOneTimeTimeSlotFutureEnd,
  assertOneTimeTimeSlotWithinEventBounds,
  describeOneTimeTimeSlotConflict,
  findOneTimeTimeSlotConflicts,
  resolveOneTimeTimeSlot,
  TimeSlotValidationError,
  type ResolvedOneTimeTimeSlot,
} from "@/lib/timeSlotAvailability";
import {
  enumerateRepeatingTimeSlotOccurrences,
  getRepeatingTimeSlotLocalDate,
  repeatingTimeSlotOccurrencesOverlap,
  RepeatingTimeSlotValidationError,
  resolveRepeatingTimeSlotValidationWindow,
} from "@/lib/repeatingTimeSlotAvailability";

import { supportsScheduleSlotsForEvent } from "./eventRules";
import { normalizeSlotFieldIds, normalizeWeekdays } from "./slotForm";

type EventType = Event["eventType"];

// Compares two numeric start/end pairs to detect overlapping minutes within the same day.
export const slotsOverlap = (
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean => Math.max(startA, startB) < Math.min(endA, endB);

export const slotDateTimeRangesOverlap = (
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

type SlotValidationContext = {
  eventStart?: Date | null;
  eventEnd?: Date | null;
};
const localDateStartInTimeZone = (
  value: unknown,
  timeZone: string | null | undefined,
): Date | null => {
  const normalizedTimeZone =
    typeof timeZone === "string" && timeZone.trim().length > 0
      ? timeZone
      : "UTC";
  const localDate = getRepeatingTimeSlotLocalDate(value, normalizedTimeZone);
  return localDate
    ? zonedTimeToUtcDate(`${localDate}T00:00:00`, normalizedTimeZone)
    : null;
};

const resolveConflictWindow = (
  slot: LeagueSlotForm,
  context: SlotValidationContext,
): { start: Date; end: Date } | null => {
  if (slot.repeating === false) {
    try {
      const resolved = resolveOneTimeTimeSlot(slot, slot.timeZone);
      return { start: resolved.start, end: resolved.end };
    } catch {
      return null;
    }
  }

  const eventStart =
    context.eventStart ??
    localDateStartInTimeZone(slot.startDate, slot.timeZone) ??
    new Date(Date.UTC(1970, 0, 1));
  return resolveRepeatingTimeSlotValidationWindow({
    slot,
    eventStart,
    eventEnd: context.eventEnd,
  });
};

type ResolvedConflictInterval = {
  start: Date;
  end: Date;
};

const resolveRepeatingOccurrencesForConflict = (
  slot: LeagueSlotForm,
  window: { start: Date; end: Date },
): ResolvedConflictInterval[] =>
  enumerateRepeatingTimeSlotOccurrences({
    slot,
    windowStart: window.start,
    windowEnd: window.end,
  });

const describeRepeatingResolutionError = (error: unknown): string =>
  error instanceof RepeatingTimeSlotValidationError
    ? error.message
    : "Repeating timeslot cannot be resolved.";

const mixedSlotIntervalsOverlap = (
  first: LeagueSlotForm,
  second: LeagueSlotForm,
  context: SlotValidationContext,
): boolean => {
  const firstIsRepeating = first.repeating !== false;
  const repeatingSlot = firstIsRepeating ? first : second;
  const oneTimeSlot = firstIsRepeating ? second : first;
  const oneTimeWindow = resolveConflictWindow(oneTimeSlot, context);
  if (!oneTimeWindow) {
    return false;
  }

  const overlapStart = new Date(
    Math.max(
      oneTimeWindow.start.getTime(),
      context.eventStart?.getTime() ?? oneTimeWindow.start.getTime(),
    ),
  );
  const overlapEnd = new Date(
    Math.min(
      oneTimeWindow.end.getTime(),
      context.eventEnd?.getTime() ?? oneTimeWindow.end.getTime(),
    ),
  );
  if (overlapEnd.getTime() <= overlapStart.getTime()) {
    return false;
  }

  const repeatingOccurrences = resolveRepeatingOccurrencesForConflict(
    repeatingSlot,
    { start: overlapStart, end: overlapEnd },
  );
  return repeatingOccurrences.some((occurrence) =>
    slotDateTimeRangesOverlap(
      occurrence.start,
      occurrence.end,
      oneTimeWindow.start,
      oneTimeWindow.end,
    ),
  );
};

const slotIntervalsOverlap = (
  first: LeagueSlotForm,
  second: LeagueSlotForm,
  context: SlotValidationContext,
): boolean => {
  const isFirstRepeating = first.repeating !== false;
  const isSecondRepeating = second.repeating !== false;
  if (!isFirstRepeating && !isSecondRepeating) {
    const firstWindow = resolveConflictWindow(first, context);
    const secondWindow = resolveConflictWindow(second, context);
    return Boolean(
      firstWindow &&
        secondWindow &&
        slotDateTimeRangesOverlap(
          firstWindow.start,
          firstWindow.end,
          secondWindow.start,
          secondWindow.end,
        ),
    );
  }

  if (isFirstRepeating !== isSecondRepeating) {
    return mixedSlotIntervalsOverlap(first, second, context);
  }

  const firstWindow = resolveConflictWindow(first, context);
  const secondWindow = resolveConflictWindow(second, context);
  if (!firstWindow || !secondWindow) {
    return false;
  }

  return repeatingTimeSlotOccurrencesOverlap({
    firstSlot: first,
    secondSlot: second,
    firstWindow,
    secondWindow,
    isFirstOpenEnded: !first.endDate && !context.eventEnd,
    isSecondOpenEnded: !second.endDate && !context.eventEnd,
  });
};

// Evaluates the current slot against other form slots to surface inline validation errors for schedulable event types.
export const computeSlotError = (
  slots: LeagueSlotForm[],
  index: number,
  eventType: EventType,
  parentEvent?: string | null,
  context: SlotValidationContext = {},
): string | undefined => {
  if (!supportsScheduleSlotsForEvent(eventType, parentEvent)) {
    return undefined;
  }

  const slot = slots[index];
  if (!slot) {
    return undefined;
  }

  const slotFieldIds = normalizeSlotFieldIds(slot);
  if (!slotFieldIds.length) {
    return undefined;
  }

  const hasSharedResource = (other: LeagueSlotForm): boolean => {
    const otherFieldIds = normalizeSlotFieldIds(other);
    return (
      otherFieldIds.length > 0 &&
      otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))
    );
  };

  const isRepeating = slot.repeating !== false;
  function computeOneTimeConflictError(): string | undefined {
    let resolvedSlot: ResolvedOneTimeTimeSlot;
    try {
      resolvedSlot = resolveOneTimeTimeSlot(slot, slot.timeZone);
    } catch (error) {
      return error instanceof TimeSlotValidationError
        ? error.message
        : "Timeslot cannot be resolved.";
    }

    const resolvedSlots = slots.flatMap((candidate) => {
      if (candidate.repeating !== false) {
        return [];
      }
      try {
        return [resolveOneTimeTimeSlot(candidate, candidate.timeZone)];
      } catch {
        return [];
      }
    });
    const conflict = findOneTimeTimeSlotConflicts(resolvedSlots).find(
      (evidence) =>
        evidence.first.slotId === resolvedSlot.slotId ||
        evidence.second.slotId === resolvedSlot.slotId,
    );
    if (conflict) {
      return describeOneTimeTimeSlotConflict(conflict);
    }

    try {
      const hasOverlap = slots.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.repeating !== false &&
          hasSharedResource(other) &&
          slotIntervalsOverlap(slot, other, context),
      );
      return hasOverlap
        ? "Overlaps with another timeslot in this form."
        : undefined;
    } catch (error) {
      return describeRepeatingResolutionError(error);
    }
  }
  if (!isRepeating) return computeOneTimeConflictError();

  function computeRepeatingConflictError(): string | undefined {
    const slotDays = normalizeWeekdays(slot);
    if (
      slotDays.length === 0 ||
      typeof slot.startTimeMinutes !== "number" ||
      typeof slot.endTimeMinutes !== "number"
    ) {
      return undefined;
    }

    const slotStartTime = slot.startTimeMinutes;
    const slotEndTime = slot.endTimeMinutes;
    if (hasInvalidSlotClockRange(slotStartTime, slotEndTime)) {
      return "Select valid start and end times for this timeslot.";
    }

    try {
      const hasOverlap = slots.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          hasSharedResource(other) &&
          slotIntervalsOverlap(slot, other, context),
      );
      return hasOverlap
        ? "Overlaps with another timeslot in this form."
        : undefined;
    } catch (error) {
      return describeRepeatingResolutionError(error);
    }
  }
  return computeRepeatingConflictError();
};
type RepeatingSlotTemporalOptions = {
  slot: LeagueSlotForm;
  eventStart: Date | null;
  eventEnd: Date | null;
};
type ResolvedRepeatingSlotTemporalOptions = Omit<
  RepeatingSlotTemporalOptions,
  "eventStart"
> & {
  eventStart: Date;
};

const resolveRepeatingSlotTemporalError = (
  options: ResolvedRepeatingSlotTemporalOptions,
): string | undefined => {
  const validationWindow = resolveRepeatingTimeSlotValidationWindow({
    slot: options.slot,
    eventStart:
      localDateStartInTimeZone(
        options.slot.startDate,
        options.slot.timeZone,
      ) ?? options.eventStart,
    eventEnd: options.eventEnd,
  });
  if (!validationWindow) {
    return undefined;
  }
  const occurrences = enumerateRepeatingTimeSlotOccurrences({
    slot: options.slot,
    windowStart: validationWindow.start,
    windowEnd: validationWindow.end,
  });
  return occurrences.length === 0
    ? "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday."
    : undefined;
};

export const computeRepeatingSlotTemporalError = (
  options: RepeatingSlotTemporalOptions,
): string | undefined => {
  if (options.slot.repeating === false) {
    return undefined;
  }
  if (!options.eventStart) {
    return undefined;
  }
  if (normalizeWeekdays(options.slot).length === 0) {
    return undefined;
  }
  if (typeof options.slot.startTimeMinutes !== "number") {
    return undefined;
  }
  if (typeof options.slot.endTimeMinutes !== "number") {
    return undefined;
  }
  try {
    return resolveRepeatingSlotTemporalError({
      ...options,
      eventStart: options.eventStart,
    });
  } catch (error) {
    return error instanceof RepeatingTimeSlotValidationError
      ? error.message
      : "Repeating timeslot cannot be resolved.";
  }
};


export const computeOneTimeSlotBoundsError = (options: {
  slot: LeagueSlotForm;
  eventStart: Date | null;
  eventEnd: Date | null;
}): string | undefined => {
  if (options.slot.repeating !== false || !options.eventStart) {
    return undefined;
  }
  try {
    const resolved = resolveOneTimeTimeSlot(
      options.slot,
      options.slot.timeZone,
    );
    assertOneTimeTimeSlotWithinEventBounds(
      resolved,
      options.eventStart,
      options.eventEnd,
    );
    assertOneTimeTimeSlotFutureEnd(resolved);
    return undefined;
  } catch (error) {
    if (
      error instanceof TimeSlotValidationError &&
      error.code === "ONE_TIME_SLOT_OUTSIDE_EVENT_BOUNDS"
    ) {
      return error.message.startsWith("Schedule Boundary Error")
        ? error.message
        : `Schedule Boundary Error: ${error.message}`;
    }
    return error instanceof TimeSlotValidationError
      ? error.message
      : "Timeslot cannot be resolved.";
  }
};

const hasRepeatingSlotTiming = (slot: LeagueSlotForm): boolean => {
  if (normalizeWeekdays(slot).length === 0) {
    return false;
  }
  if (typeof slot.startTimeMinutes !== "number") {
    return false;
  }
  return typeof slot.endTimeMinutes === "number";
};

const repeatingOccurrenceOutsideEventBounds = (
  occurrence: { start: Date; end: Date },
  eventStart: Date,
  eventEnd: Date | null,
): boolean => {
  if (occurrence.start.getTime() < eventStart.getTime()) {
    return true;
  }
  if (!eventEnd) {
    return false;
  }
  return occurrence.end.getTime() > eventEnd.getTime();
};

export const computeRepeatingSlotBoundsError = (options: {
  slot: LeagueSlotForm;
  eventStart: Date | null;
  eventEnd: Date | null;
}): string | undefined => {
  if (options.slot.repeating === false) {
    return undefined;
  }
  if (!options.eventStart || !hasRepeatingSlotTiming(options.slot)) {
    return undefined;
  }
  try {
    const slotStart = localDateStartInTimeZone(
      options.slot.startDate,
      options.slot.timeZone,
    );
    const validationWindow = resolveRepeatingTimeSlotValidationWindow({
      slot: options.slot,
      eventStart: slotStart ?? options.eventStart,
      eventEnd: options.slot.endDate ? null : options.eventEnd,
    });
    if (!validationWindow) return undefined;
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot: options.slot,
      windowStart: validationWindow.start,
      windowEnd: validationWindow.end,
    });
    const outsideBoundary = occurrences.some((occurrence) =>
      repeatingOccurrenceOutsideEventBounds(
        occurrence,
        options.eventStart as Date,
        options.eventEnd,
      ),
    );
    return outsideBoundary
      ? "Schedule Boundary Error: Repeating Time Slot is outside the Event boundary; Time Slots are rejected rather than clipped."
      : undefined;
  } catch (error) {
    return error instanceof RepeatingTimeSlotValidationError
      ? error.message
      : "Repeating timeslot cannot be resolved.";
  }
};

// Resets conflict bookkeeping and assigns slot errors so UI can block submission when overlaps exist.
export const normalizeSlotState = (
  slots: LeagueSlotForm[],
  eventType: EventType,
  parentEvent?: string | null,
  context: SlotValidationContext = {},
): LeagueSlotForm[] => {
  let mutated = false;

  const normalized = slots.map((slot, index) => {
    const error = computeSlotError(
      slots,
      index,
      eventType,
      parentEvent,
      context,
    );
    const needsUpdate = slot.error !== error;

    if (!needsUpdate) {
      return slot;
    }

    mutated = true;
    return {
      ...slot,
      error,
    };
  });

  return mutated ? normalized : slots;
};

function hasInvalidSlotClockRange(
  slotStartTime: number,
  slotEndTime: number,
): boolean {
  return (
    !Number.isInteger(slotStartTime) ||
    slotStartTime < 0 ||
    slotStartTime >= 24 * 60 ||
    !Number.isInteger(slotEndTime) ||
    slotEndTime < 0 ||
    slotEndTime > 24 * 60
  );
}
