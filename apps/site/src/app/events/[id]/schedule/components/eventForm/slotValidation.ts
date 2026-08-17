import type { Event } from '@/types';
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import {
    assertOneTimeTimeSlotWithinEventBounds,
    describeOneTimeTimeSlotConflict,
    findOneTimeTimeSlotConflicts,
    resolveOneTimeTimeSlot,
    TimeSlotValidationError,
    type ResolvedOneTimeTimeSlot,
} from '@/lib/timeSlotAvailability';

import { supportsScheduleSlotsForEvent } from './eventRules';
import { normalizeSlotFieldIds, normalizeWeekdays } from './slotForm';

type EventType = Event['eventType'];

// Compares two numeric start/end pairs to detect overlapping minutes within the same day.
export const slotsOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
    Math.max(startA, startB) < Math.min(endA, endB);

export const slotDateTimeRangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
    startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

// Evaluates the current slot against other form slots to surface inline validation errors for schedulable event types.
export const computeSlotError = (
    slots: LeagueSlotForm[],
    index: number,
    eventType: EventType,
    parentEvent?: string | null,
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

    const isRepeating = slot.repeating !== false;
    if (!isRepeating) {
        let resolvedSlot: ResolvedOneTimeTimeSlot;
        try {
            resolvedSlot = resolveOneTimeTimeSlot(slot, slot.timeZone);
        } catch (error) {
            return error instanceof TimeSlotValidationError ? error.message : 'Timeslot cannot be resolved.';
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
        const conflict = findOneTimeTimeSlotConflicts(resolvedSlots)
            .find((evidence) => (
                evidence.first.slotId === resolvedSlot.slotId ||
                evidence.second.slotId === resolvedSlot.slotId
            ));
        return conflict ? describeOneTimeTimeSlotConflict(conflict) : undefined;
    }

    const slotDays = normalizeWeekdays(slot);
    if (
        slotDays.length === 0 ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number'
    ) {
        return undefined;
    }

    const slotStartTime = slot.startTimeMinutes;
    const slotEndTime = slot.endTimeMinutes;
    if (slotEndTime <= slotStartTime) {
        return 'Timeslot must end after it starts.';
    }

    const hasOverlap = slots.some((other, otherIndex) => {
        if (otherIndex === index || other.repeating === false) {
            return false;
        }
        const otherFieldIds = normalizeSlotFieldIds(other);
        if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
            return false;
        }
        const otherDays = normalizeWeekdays(other);
        if (otherDays.length === 0 || !otherDays.some((day) => slotDays.includes(day))) {
            return false;
        }
        if (
            typeof other.startTimeMinutes !== 'number' ||
            typeof other.endTimeMinutes !== 'number'
        ) {
            return false;
        }
        return slotsOverlap(slotStartTime, slotEndTime, other.startTimeMinutes, other.endTimeMinutes);
    });

    return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
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
        const resolved = resolveOneTimeTimeSlot(options.slot, options.slot.timeZone);
        assertOneTimeTimeSlotWithinEventBounds(resolved, options.eventStart, options.eventEnd);
        return undefined;
    } catch (error) {
        return error instanceof TimeSlotValidationError ? error.message : 'Timeslot cannot be resolved.';
    }
};

// Resets conflict bookkeeping and assigns slot errors so UI can block submission when overlaps exist.
export const normalizeSlotState = (slots: LeagueSlotForm[], eventType: EventType, parentEvent?: string | null): LeagueSlotForm[] => {
    let mutated = false;

    const normalized = slots.map((slot, index) => {
        const error = computeSlotError(slots, index, eventType, parentEvent);
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
