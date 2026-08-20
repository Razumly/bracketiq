import type { Event } from "@/types";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  assertOneTimeTimeSlotWithinEventBounds,
  describeOneTimeTimeSlotConflict,
  findOneTimeTimeSlotConflicts,
  resolveOneTimeTimeSlot,
  TimeSlotValidationError,
  type ResolvedOneTimeTimeSlot,
} from "@/lib/timeSlotAvailability";
import {
  enumerateRepeatingTimeSlotOccurrences,
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
const parseCalendarDate = (value: unknown): Date | null => {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
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
    parseCalendarDate(slot.startDate) ??
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

  const firstWindow = resolveConflictWindow(first, context);
  const secondWindow = resolveConflictWindow(second, context);
  if (!firstWindow || !secondWindow) {
    return false;
  }

  if (isFirstRepeating && isSecondRepeating) {
    return repeatingTimeSlotOccurrencesOverlap({
      firstSlot: first,
      secondSlot: second,
      firstWindow,
      secondWindow,
      firstOpenEnded: !first.endDate && !context.eventEnd,
      secondOpenEnded: !second.endDate && !context.eventEnd,
    });
  }

  const overlapStart = new Date(
    Math.max(firstWindow.start.getTime(), secondWindow.start.getTime()),
  );
  const overlapEnd = new Date(
    Math.min(firstWindow.end.getTime(), secondWindow.end.getTime()),
  );
  if (overlapEnd.getTime() <= overlapStart.getTime()) {
    return false;
  }
  const firstOccurrences = isFirstRepeating
    ? resolveRepeatingOccurrencesForConflict(first, {
        start: overlapStart,
        end: overlapEnd,
      })
    : [firstWindow];
  const secondOccurrences = isSecondRepeating
    ? resolveRepeatingOccurrencesForConflict(second, {
        start: overlapStart,
        end: overlapEnd,
      })
    : [secondWindow];
  return firstOccurrences.some((firstOccurrence) =>
    secondOccurrences.some((secondOccurrence) =>
      slotDateTimeRangesOverlap(
        firstOccurrence.start,
        firstOccurrence.end,
        secondOccurrence.start,
        secondOccurrence.end,
      ),
    ),
  );
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
  if (!isRepeating) {
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
  if (
    !Number.isInteger(slotStartTime) ||
    slotStartTime < 0 ||
    slotStartTime >= 24 * 60 ||
    !Number.isInteger(slotEndTime) ||
    slotEndTime < 0 ||
    slotEndTime > 24 * 60
  ) {
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
};

export const computeRepeatingSlotTemporalError = (options: {
  slot: LeagueSlotForm;
  eventStart: Date | null;
  eventEnd: Date | null;
}): string | undefined => {
  if (
    options.slot.repeating === false ||
    !options.eventStart ||
    normalizeWeekdays(options.slot).length === 0 ||
    typeof options.slot.startTimeMinutes !== "number" ||
    typeof options.slot.endTimeMinutes !== "number"
  ) {
    return undefined;
  }
  try {
    const validationWindow = resolveRepeatingTimeSlotValidationWindow({
      slot: options.slot,
      eventStart: options.eventStart,
      eventEnd: options.eventEnd,
    });
    if (!validationWindow) {
      return undefined;
    }
    enumerateRepeatingTimeSlotOccurrences({
      slot: options.slot,
      windowStart: validationWindow.start,
      windowEnd: validationWindow.end,
    });
    return undefined;
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
    return undefined;
  } catch (error) {
    return error instanceof TimeSlotValidationError
      ? error.message
      : "Timeslot cannot be resolved.";
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
