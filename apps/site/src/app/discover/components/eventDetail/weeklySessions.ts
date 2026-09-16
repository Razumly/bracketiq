import type { Event } from "@/types";
import type { WeeklyOccurrenceSelection } from "@/lib/eventService";
import { resolveOneTimeTimeSlot } from "@/lib/timeSlotAvailability";
import {
  addRepeatingTimeSlotLocalDays,
  enumerateRepeatingTimeSlotOccurrences,
  getRepeatingTimeSlotLocalDate,
  normalizeRepeatingTimeSlotTimeZone,
  resolveRepeatingTimeSlotOccurrence,
  type ResolvedRepeatingTimeSlot,
} from "@/lib/repeatingTimeSlotAvailability";

import {
  buildDivisionDisplayNameIndex,
  resolveDivisionDisplayName,
} from "@/lib/divisionDisplay";
import { getDivisionIdFromEventEntry } from "./divisionRegistration";
import { parseDateValue } from "./dateValues";

export { parseDateValue };

export type WeeklySessionOption = {
  id: string;
  slotId: string;
  occurrenceDate: string;
  start: Date;
  end: Date;
  label: string;
  divisionLabel: string;
};

const formatWeeklyTimeLabel = (value: Date, timeZone: string): string =>
  value
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    })
    .replace(" ", "")
    .toLowerCase();

const formatWeeklySessionLabel = (
  start: Date,
  end: Date,
  timeZone: string,
): string => {
  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone,
  });
  return `${dateLabel}, ${formatWeeklyTimeLabel(start, timeZone)}-${formatWeeklyTimeLabel(end, timeZone)}`;
};

const resolveOneTimeWeeklySlot = (
  slot: Parameters<typeof resolveOneTimeTimeSlot>[0],
  timeZone: string,
) => {
  try {
    return resolveOneTimeTimeSlot(slot, timeZone);
  } catch {
    return null;
  }
};

const resolveDivisionNames = (
  entries: unknown[],
  divisionNameIndex: Map<string, string>,
  sportInput: string | null,
): string[] => {
  const labels: string[] = [];
  const seen = new Set<string>();

  entries.forEach((entry) => {
    const divisionId = getDivisionIdFromEventEntry(entry);
    const fromDivisionId = divisionId
      ? resolveDivisionDisplayName({
          division: divisionId,
          divisionNameIndex,
          sportInput,
        })
      : null;
    const fromEntryString =
      typeof entry === "string"
        ? resolveDivisionDisplayName({
            division: entry,
            divisionNameIndex,
            sportInput,
          })
        : null;
    const fromObjectName =
      entry && typeof entry === "object"
        ? (() => {
            const row = entry as Record<string, unknown>;
            return typeof row.name === "string" ? row.name : null;
          })()
        : null;

    const label = (
      fromDivisionId ??
      fromEntryString ??
      fromObjectName ??
      ""
    ).trim();
    if (!label.length) {
      return;
    }
    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    labels.push(label);
  });

  return labels;
};

export const buildWeeklySessionOptions = (
  event: Event | null,
  weeks: number = 3,
  referenceDate: Date = new Date(),
): WeeklySessionOption[] => {
  if (
    !event ||
    event.eventType !== "WEEKLY_EVENT" ||
    !Array.isArray(event.timeSlots) ||
    event.timeSlots.length === 0
  ) {
    return [];
  }

  const safeWeekCount = Math.max(0, Math.trunc(weeks));
  const sessions: WeeklySessionOption[] = [];
  const sportInput =
    typeof event.sport === "string"
      ? event.sport
      : (event.sport?.name ?? event.sportIds[0] ?? null);
  const divisionNameIndex = buildDivisionDisplayNameIndex(
    event.divisionDetails,
  );
  const fallbackDivisionNames = resolveDivisionNames(
    Array.isArray(event.divisions) ? event.divisions : [],
    divisionNameIndex,
    sportInput,
  );

  event.timeSlots.forEach((slot) => {
    const slotDivisionNames = resolveDivisionNames(
      Array.isArray(slot.divisions) && slot.divisions.length
        ? slot.divisions
        : Array.isArray(event.divisions)
          ? event.divisions
          : [],
      divisionNameIndex,
      sportInput,
    );
    const divisionLabel =
      (slotDivisionNames.length
        ? slotDivisionNames
        : fallbackDivisionNames
      ).join(", ") || "All divisions";

    if (slot.repeating === false) {
      const timeZone = normalizeRepeatingTimeSlotTimeZone(slot.timeZone);
      const referenceLocalDate = getRepeatingTimeSlotLocalDate(
        referenceDate,
        timeZone,
      );
      const startMinutes =
        typeof slot.startTimeMinutes === "number"
          ? slot.startTimeMinutes
          : null;
      const endMinutes =
        typeof slot.endTimeMinutes === "number" ? slot.endTimeMinutes : null;
      if (
        !referenceLocalDate ||
        startMinutes === null ||
        endMinutes === null ||
        !Number.isInteger(startMinutes) ||
        !Number.isInteger(endMinutes) ||
        startMinutes < 0 ||
        startMinutes >= 24 * 60 ||
        endMinutes < 0 ||
        endMinutes >= 24 * 60
      ) {
        return;
      }
      const resolved = resolveOneTimeWeeklySlot(slot, timeZone);
      if (!resolved || resolved.localDate < referenceLocalDate) {
        return;
      }
      sessions.push({
        id: `${resolved.slotId}-${resolved.localDate}`,
        slotId: resolved.slotId,
        occurrenceDate: resolved.localDate,
        start: resolved.start,
        end: resolved.end,
        label: formatWeeklySessionLabel(resolved.start, resolved.end, timeZone),
        divisionLabel,
      });
      return;
    }

    if (safeWeekCount === 0) {
      return;
    }
    const startMinutes =
      typeof slot.startTimeMinutes === "number" ? slot.startTimeMinutes : null;
    const endMinutes =
      typeof slot.endTimeMinutes === "number" ? slot.endTimeMinutes : null;
    if (
      startMinutes === null ||
      endMinutes === null ||
      !Number.isInteger(startMinutes) ||
      !Number.isInteger(endMinutes) ||
      startMinutes < 0 ||
      startMinutes >= 24 * 60 ||
      endMinutes < 0 ||
      endMinutes > 24 * 60
    ) {
      return;
    }

    const referenceLocalDate = getRepeatingTimeSlotLocalDate(
      referenceDate,
      slot.timeZone,
    );
    const rangeEndExclusive = referenceLocalDate
      ? addRepeatingTimeSlotLocalDays(referenceLocalDate, safeWeekCount * 7)
      : null;
    if (!referenceLocalDate || !rangeEndExclusive) {
      return;
    }

    const windowStart = new Date(
      referenceDate.getTime() - 2 * 24 * 60 * 60 * 1000,
    );
    const windowEnd = new Date(
      referenceDate.getTime() + (safeWeekCount * 7 + 2) * 24 * 60 * 60 * 1000,
    );
    const resolvedOccurrences = enumerateRepeatingTimeSlotOccurrences({
      slot,
      windowStart,
      windowEnd,
    });
    resolvedOccurrences.forEach((resolved: ResolvedRepeatingTimeSlot) => {
      if (
        resolved.occurrenceDate < referenceLocalDate ||
        resolved.occurrenceDate >= rangeEndExclusive
      ) {
        return;
      }
      sessions.push({
        id: `${slot.$id}-${resolved.occurrenceDate}`,
        slotId: String(slot.$id ?? ""),
        occurrenceDate: resolved.occurrenceDate,
        start: resolved.start,
        end: resolved.end,
        label: formatWeeklySessionLabel(
          resolved.start,
          resolved.end,
          normalizeRepeatingTimeSlotTimeZone(slot.timeZone),
        ),
        divisionLabel,
      });
    });
  });

  return sessions.sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  );
};

export const resolveSelectedWeeklySessionOption = (
  event: Event | null,
  selection: WeeklyOccurrenceSelection | null,
): WeeklySessionOption | null => {
  if (!event || !selection) {
    return null;
  }
  const selectedSlotId =
    typeof selection.slotId === "string" ? selection.slotId.trim() : "";
  const selectedOccurrenceDate =
    typeof selection.occurrenceDate === "string"
      ? selection.occurrenceDate.trim()
      : "";
  if (!selectedSlotId || !selectedOccurrenceDate) {
    return null;
  }

  const originalTimeSlots = Array.isArray(event.timeSlots)
    ? event.timeSlots
    : [];
  const matchingSlot = originalTimeSlots.find(
    (slot) => String(slot?.$id ?? "").trim() === selectedSlotId,
  );
  if (!matchingSlot) {
    return null;
  }

  const sportInput =
    typeof event.sport === "string"
      ? event.sport
      : (event.sport?.name ?? event.sportIds[0] ?? null);
  const divisionNameIndex = buildDivisionDisplayNameIndex(
    event.divisionDetails,
  );
  const slotDivisionEntries =
    Array.isArray(matchingSlot.divisions) && matchingSlot.divisions.length
      ? matchingSlot.divisions
      : Array.isArray(event.divisions)
        ? event.divisions
        : [];
  const divisionLabel =
    resolveDivisionNames(
      slotDivisionEntries,
      divisionNameIndex,
      sportInput,
    ).join(", ") || "All divisions";

  const timeZone = normalizeRepeatingTimeSlotTimeZone(matchingSlot.timeZone);
  let occurrenceDate = selectedOccurrenceDate;
  let start: Date;
  let end: Date;
  if (matchingSlot.repeating === false) {
    const normalizedSelectedDate = getRepeatingTimeSlotLocalDate(
      selectedOccurrenceDate,
      "UTC",
    );
    const startMinutes =
      typeof matchingSlot.startTimeMinutes === "number"
        ? matchingSlot.startTimeMinutes
        : null;
    const endMinutes =
      typeof matchingSlot.endTimeMinutes === "number"
        ? matchingSlot.endTimeMinutes
        : null;
    if (
      !normalizedSelectedDate ||
      startMinutes === null ||
      endMinutes === null ||
      !Number.isInteger(startMinutes) ||
      !Number.isInteger(endMinutes) ||
      startMinutes < 0 ||
      startMinutes >= 24 * 60 ||
      endMinutes < 0 ||
      endMinutes >= 24 * 60
    ) {
      return null;
    }
    const resolved = resolveOneTimeWeeklySlot(matchingSlot, timeZone);
    if (!resolved || normalizedSelectedDate !== resolved.localDate) {
      return null;
    }
    occurrenceDate = resolved.localDate;
    start = resolved.start;
    end = resolved.end;
  } else {
    const resolved = resolveRepeatingTimeSlotOccurrence(
      matchingSlot,
      selectedOccurrenceDate,
    );
    occurrenceDate = resolved.occurrenceDate;
    start = resolved.start;
    end = resolved.end;
  }

  return {
    id: `${selectedSlotId}-${occurrenceDate}`,
    slotId: selectedSlotId,
    occurrenceDate,
    start,
    end,
    label: formatWeeklySessionLabel(start, end, timeZone),
    divisionLabel,
  };
};
