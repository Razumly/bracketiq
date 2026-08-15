import {
  assertValidOneTimeTimeSlots,
  resolveOneTimeTimeSlot,
  TimeSlotValidationError,
  type ResolvedOneTimeTimeSlot,
} from '@/lib/timeSlotAvailability';
import type { Division, League, TimeSlot, Tournament } from './types';

export type SchedulerAvailabilityEvent = Pick<
  League | Tournament,
  | 'start'
  | 'end'
  | 'scheduleEndConstraint'
  | 'noFixedEndDateTime'
  | 'fields'
  | 'timeSlots'
  | 'divisions'
  | 'playoffDivisions'
>;

export const assertCanonicalSchedulerTimeSlots = (
  event: SchedulerAvailabilityEvent,
): ResolvedOneTimeTimeSlot[] => {
  const resourceIds = Object.keys(event.fields);
  const divisionIds = Array.from(new Set(
    [...(event.divisions ?? []), ...(event.playoffDivisions ?? [])]
      .map((division: Division) => division.id.trim())
      .filter((divisionId) => divisionId.length > 0),
  ));
  const resolved = assertValidOneTimeTimeSlots({
    slots: event.timeSlots,
    fallbackTimeZone: event.timeSlots[0]?.timeZone ?? 'UTC',
    eventStart: event.start,
    eventEnd: event.noFixedEndDateTime ? null : (event.scheduleEndConstraint ?? event.end),
    eligibleResourceIds: resourceIds,
    eligibleDivisionIds: divisionIds,
  });
  const resourceIdSet = new Set(resourceIds.map((id) => id.toLowerCase()));
  const divisionIdSet = new Set(divisionIds.map((id) => id.toLowerCase()));
  for (const slot of resolved) {
    const unknownResourceId = slot.resourceIds.find((id) => !resourceIdSet.has(id.toLowerCase()));
    if (unknownResourceId) {
      throw new TimeSlotValidationError(
        'INVALID_ONE_TIME_SLOT',
        `One-Time Time Slot \"${slot.slotId}\" references unavailable Resource \"${unknownResourceId}\".`,
        { slotIds: [slot.slotId] },
      );
    }
    const unknownDivisionId = slot.divisionIds.find((id) => !divisionIdSet.has(id.toLowerCase()));
    if (unknownDivisionId) {
      throw new TimeSlotValidationError(
        'INVALID_ONE_TIME_SLOT',
        `One-Time Time Slot \"${slot.slotId}\" references unavailable Division \"${unknownDivisionId}\".`,
        { slotIds: [slot.slotId] },
      );
    }
  }
  return resolved;
};

export const resolveCanonicalOneTimeSlots = (
  slots: Iterable<TimeSlot>,
): ResolvedOneTimeTimeSlot[] => {
  const resolved: ResolvedOneTimeTimeSlot[] = [];
  for (const slot of slots) {
    if (slot.repeating) continue;
    resolved.push(resolveOneTimeTimeSlot(slot, slot.timeZone));
  }
  return resolved;
};

export const calculateOneTimeAvailabilityMinutes = (
  event: SchedulerAvailabilityEvent,
): number => {
  const eligibleResourceIds = Object.keys(event.fields);
  const windowsByResourceId = new Map<string, Array<{ start: number; end: number }>>();
  for (const slot of resolveCanonicalOneTimeSlots(event.timeSlots)) {
    const resourceIds = slot.resourceIds.length > 0
      ? slot.resourceIds
      : (eligibleResourceIds.length > 0 ? eligibleResourceIds : ['GLOBAL']);
    const boundedStart = Math.max(slot.start.getTime(), event.start.getTime());
    const boundedEnd = Math.min(slot.end.getTime(), event.end.getTime());
    if (boundedEnd <= boundedStart) continue;
    for (const resourceId of resourceIds) {
      const windows = windowsByResourceId.get(resourceId) ?? [];
      windows.push({ start: boundedStart, end: boundedEnd });
      windowsByResourceId.set(resourceId, windows);
    }
  }

  let totalMs = 0;
  for (const windows of windowsByResourceId.values()) {
    windows.sort((first, second) => first.start - second.start);
    let currentStart: number | null = null;
    let currentEnd: number | null = null;
    for (const window of windows) {
      if (currentStart === null || currentEnd === null) {
        currentStart = window.start;
        currentEnd = window.end;
        continue;
      }
      if (window.start <= currentEnd) {
        currentEnd = Math.max(currentEnd, window.end);
        continue;
      }
      totalMs += currentEnd - currentStart;
      currentStart = window.start;
      currentEnd = window.end;
    }
    if (currentStart !== null && currentEnd !== null) {
      totalMs += currentEnd - currentStart;
    }
  }
  return Math.floor(totalMs / (60 * 1000));
};
