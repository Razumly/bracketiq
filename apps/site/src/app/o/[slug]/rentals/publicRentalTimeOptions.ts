import type { Field, TimeSlot } from "@/types";
import { buildFieldCalendarEvents } from "@/app/organizations/[id]/fieldCalendar";
import { compareRanges } from "@/app/organizations/[id]/fieldsTab/facilityCalendarIntervals";
import { getNextSelectableRentalStart } from "@/app/organizations/[id]/fieldsTab/usePublicRentalSelections";

export type RentalTimeOption = {
  key: string;
  fieldId: string;
  fieldName: string;
  start: Date;
  end: Date;
  hourlyRate: number;
  unavailable: boolean;
};

export function buildPublicRentalTimeOptions(fields: Field[], date: Date, durationMinutes: number) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  try {
    const entries = buildFieldCalendarEvents(fields, { start, end });
    const bookings = entries.filter((entry) => entry.metaType === "booked");
    const options = new Map<string, RentalTimeOption>();
    const earliestStart = getNextSelectableRentalStart().getTime();
    for (const entry of entries.filter((item) => item.metaType === "rental")) {
      const firstStart = Math.max(start.getTime(), entry.start.getTime(), earliestStart);
      for (let time = firstStart; time < end.getTime() && time + durationMinutes * 60_000 <= entry.end.getTime(); time += 30 * 60_000) {
        const key = `${entry.resourceId}:${time}:${durationMinutes}`;
        if (options.has(key)) continue;
        const optionStart = new Date(time);
        const optionEnd = new Date(time + durationMinutes * 60_000);
        const slot = entry.resource as TimeSlot;
        options.set(key, {
          key,
          fieldId: entry.resourceId,
          fieldName: entry.fieldName,
          start: optionStart,
          end: optionEnd,
          hourlyRate: slot.price ?? 0,
          unavailable: Boolean(slot.rentalLocked) || bookings.some((booking) => booking.resourceId === entry.resourceId && compareRanges(optionStart, optionEnd, booking.start, booking.end)),
        });
      }
    }
    return { options: [...options.values()].sort((a, b) => a.start.getTime() - b.start.getTime()), error: null };
  } catch (error) {
    return { options: [], error: error instanceof Error ? error.message : "Unable to load rental times." };
  }
}
