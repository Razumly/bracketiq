import type { Event } from "@/types";
import type { WeeklyOccurrenceSelection } from "@/lib/eventService";
import {
  buildDivisionDisplayNameIndex,
  resolveDivisionDisplayName,
} from "@/lib/divisionDisplay";
import {
  addRepeatingTimeSlotLocalDays,
  enumerateRepeatingTimeSlotOccurrences,
  getRepeatingTimeSlotLocalDate,
  resolveRepeatingTimeSlotOccurrence,
  type ResolvedRepeatingTimeSlot,
} from "@/lib/repeatingTimeSlotAvailability";

import { zonedTimeToUtcDate } from "@/lib/dateUtils";

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

const normalizeSlotTimeZone = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "UTC";

const formatLocalTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

const resolveLocalSlotDateTime = (
  localDate: string,
  minutes: number,
  timeZone: string,
): Date | null =>
  zonedTimeToUtcDate(`${localDate}T${formatLocalTime(minutes)}`, timeZone);

const formatWeeklyTimeLabel = (value: Date): string =>
  value
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" ", "")
    .toLowerCase();

const formatWeeklySessionLabel = (start: Date, end: Date): string => {
  const dateLabel = `${start.toLocaleDateString("en-US", { weekday: "short" })} ${start.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })}`;
  return `${dateLabel}, ${formatWeeklyTimeLabel(start)}-${formatWeeklyTimeLabel(end)}`;
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
      const timeZone = normalizeSlotTimeZone(slot.timeZone);
      const slotStartDate = getRepeatingTimeSlotLocalDate(
        slot.startDate ?? null,
        timeZone,
      );
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
        !slotStartDate ||
        !referenceLocalDate ||
        startMinutes === null ||
        endMinutes === null ||
        !Number.isInteger(startMinutes) ||
        !Number.isInteger(endMinutes) ||
        startMinutes < 0 ||
        startMinutes >= 24 * 60 ||
        endMinutes < 0 ||
        endMinutes >= 24 * 60 ||
        endMinutes <= startMinutes ||
        slotStartDate < referenceLocalDate
      ) {
        return;
      }
      const sessionStart = resolveLocalSlotDateTime(
        slotStartDate,
        startMinutes,
        timeZone,
      );
      const sessionEnd = resolveLocalSlotDateTime(
        slotStartDate,
        endMinutes,
        timeZone,
      );
      if (
        !sessionStart ||
        !sessionEnd ||
        sessionEnd.getTime() <= sessionStart.getTime()
      ) {
        return;
      }
      sessions.push({
        id: `${slot.$id}-${slotStartDate}`,
        slotId: String(slot.$id ?? ""),
        occurrenceDate: slotStartDate,
        start: sessionStart,
        end: sessionEnd,
        label: formatWeeklySessionLabel(sessionStart, sessionEnd),
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
      endMinutes > 24 * 60 ||
      endMinutes === startMinutes
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
        label: formatWeeklySessionLabel(resolved.start, resolved.end),
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

  let occurrenceDate = selectedOccurrenceDate;
  let start: Date;
  let end: Date;
  if (matchingSlot.repeating === false) {
    const timeZone = normalizeSlotTimeZone(matchingSlot.timeZone);
    const normalizedSelectedDate = getRepeatingTimeSlotLocalDate(
      selectedOccurrenceDate,
      "UTC",
    );
    const slotStartDate = getRepeatingTimeSlotLocalDate(
      matchingSlot.startDate ?? null,
      timeZone,
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
      !slotStartDate ||
      startMinutes === null ||
      endMinutes === null ||
      !Number.isInteger(startMinutes) ||
      !Number.isInteger(endMinutes) ||
      startMinutes < 0 ||
      startMinutes >= 24 * 60 ||
      endMinutes < 0 ||
      endMinutes >= 24 * 60 ||
      endMinutes <= startMinutes ||
      normalizedSelectedDate !== slotStartDate
    ) {
      return null;
    }
    const resolvedStart = resolveLocalSlotDateTime(
      slotStartDate,
      startMinutes,
      timeZone,
    );
    const resolvedEnd = resolveLocalSlotDateTime(
      slotStartDate,
      endMinutes,
      timeZone,
    );
    if (
      !resolvedStart ||
      !resolvedEnd ||
      resolvedEnd.getTime() <= resolvedStart.getTime()
    ) {
      return null;
    }
    occurrenceDate = slotStartDate;
    start = resolvedStart;
    end = resolvedEnd;
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
    label: formatWeeklySessionLabel(start, end),
    divisionLabel,
  };
};
