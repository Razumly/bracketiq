import type { TimeSlot } from "@/types";
import { isWithinOneLocalDay } from './facilityCalendarRangeLimits';
import { formatLocalDateTime, parseLocalDateTime } from "@/lib/dateUtils";
import type {
  BuildStaffAssignmentCalendarRangeOptions,
  ManagerCalendarDraft,
  StaffScheduleAssignment,
  StaffScheduleTimeSlot,
} from "./facilityCalendarTypes";

export const mondayDayOf = (date: Date): number => (date.getDay() + 6) % 7;

export const alignDateToWeekday = (seed: Date, dayOfWeek: number): Date => {
  const aligned = new Date(seed.getTime());
  aligned.setHours(0, 0, 0, 0);
  const current = mondayDayOf(aligned);
  let diff = dayOfWeek - current;
  if (diff < 0) diff += 7;
  aligned.setDate(aligned.getDate() + diff);
  return aligned;
};

export const toValidDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

export const dateWithMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date.getTime());
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

export function parseCalendarDropRange(startValue: unknown, endValue: unknown): { start: Date; end: Date } | null {
  const start = toValidDate(startValue);
  const end = toValidDate(endValue);
  return start && end ? { start, end } : null;
}

type CalendarRange = {
  start: Date;
  end: Date;
  dayOfWeek: number;
  startTimeMinutes: number;
  endTimeMinutes: number;
};

function calendarRange(start: Date, end: Date): CalendarRange | null {
  const nextStart = new Date(start);
  const nextEnd = new Date(end);
  if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()))
    return null;
  if (
    !isWithinOneLocalDay(nextStart, nextEnd)
  )
    return null;
  return {
    start: nextStart,
    end: nextEnd,
    dayOfWeek: mondayDayOf(nextStart),
    startTimeMinutes: nextStart.getHours() * 60 + nextStart.getMinutes(),
    endTimeMinutes: nextEnd.getHours() * 60 + nextEnd.getMinutes(),
  };
}

function repeatingDays(
  days: number[] | null | undefined,
  fallback: number,
): number[] {
  return Array.isArray(days) && days.length > 0 ? days : [fallback];
}

function plannedRange(
  range: CalendarRange,
  preservePattern: boolean,
  seed: Date,
  days: number[],
) {
  if (!preservePattern) return { start: range.start, end: range.end };
  const date = alignDateToWeekday(seed, days[0] ?? range.dayOfWeek);
  const end = dateWithMinutes(date, range.endTimeMinutes);
  if (range.endTimeMinutes <= range.startTimeMinutes) end.setDate(end.getDate() + 1);
  return {
    start: dateWithMinutes(date, range.startTimeMinutes),
    end,
  };
}

function rentalDraftWithRange(
  draft: ManagerCalendarDraft,
  range: CalendarRange,
  options: BuildStaffAssignmentCalendarRangeOptions,
): ManagerCalendarDraft {
  const rental = draft.rental ?? {};
  const repeating = Boolean(rental.repeating);
  const preservePattern =
    repeating && Boolean(options.preserveRepeatingPattern);
  const existingDays = repeatingDays(
    rental.daysOfWeek,
    rental.dayOfWeek ?? range.dayOfWeek,
  );
  const days = preservePattern ? existingDays : [range.dayOfWeek];
  const seed = parseLocalDateTime(rental.startDate ?? null) ?? draft.start;
  return {
    ...draft,
    ...plannedRange(range, preservePattern, seed, days),
    rental: {
      ...rental,
      repeating,
      dayOfWeek: days[0] as NonNullable<TimeSlot["dayOfWeek"]>,
      daysOfWeek: days,
      startDate: preservePattern
        ? rental.startDate
        : formatLocalDateTime(range.start),
      endDate: repeating
        ? (rental.endDate ?? null)
        : formatLocalDateTime(range.end),
      startTimeMinutes: range.startTimeMinutes,
      endTimeMinutes: range.endTimeMinutes,
    },
  };
}

function staffDraftWithRange(
  draft: ManagerCalendarDraft,
  range: CalendarRange,
  options: BuildStaffAssignmentCalendarRangeOptions,
): ManagerCalendarDraft {
  const staff = draft.staff ?? {};
  const repeating = Boolean(staff.repeating);
  const preservePattern =
    repeating && Boolean(options.preserveRepeatingPattern);
  const days = preservePattern
    ? repeatingDays(staff.daysOfWeek, range.dayOfWeek)
    : [range.dayOfWeek];
  return {
    ...draft,
    ...plannedRange(range, preservePattern, draft.start, days),
    staff: { ...staff, repeating, daysOfWeek: days },
  };
}

export function buildManagerCalendarDraftWithCalendarRange(
  draft: ManagerCalendarDraft,
  start: Date,
  end: Date,
  options: BuildStaffAssignmentCalendarRangeOptions = {},
): ManagerCalendarDraft | null {
  const range = calendarRange(start, end);
  if (!range) return null;
  return draft.mode === "rental"
    ? rentalDraftWithRange(draft, range, options)
    : staffDraftWithRange(draft, range, options);
}

function assignmentTimeSlot(
  existing: Partial<StaffScheduleTimeSlot>,
  range: CalendarRange,
  days: number[],
): StaffScheduleTimeSlot {
  const repeating = Boolean(existing.repeating);
  return {
    startDate: repeating
      ? (existing.startDate ?? range.start.toISOString())
      : range.start.toISOString(),
    endDate: repeating
      ? (existing.endDate ?? range.end.toISOString())
      : range.end.toISOString(),
    repeating,
    dayOfWeek: days[0] ?? range.dayOfWeek,
    daysOfWeek: days,
    startTimeMinutes: range.startTimeMinutes,
    endTimeMinutes: range.endTimeMinutes,
    timeZone: existing.timeZone ?? null,
  };
}

export function buildStaffAssignmentWithCalendarRange(
  assignment: StaffScheduleAssignment,
  start: Date,
  end: Date,
  options: BuildStaffAssignmentCalendarRangeOptions = {},
): StaffScheduleAssignment | null {
  const range = calendarRange(start, end);
  if (!range) return null;
  const existing: Partial<StaffScheduleTimeSlot> = assignment.timeSlot ?? {};
  const preservePattern =
    Boolean(existing.repeating) && Boolean(options.preserveRepeatingPattern);
  const days = preservePattern
    ? repeatingDays(existing.daysOfWeek, range.dayOfWeek)
    : [range.dayOfWeek];
  const planned = plannedRange(
    range,
    preservePattern,
    toValidDate(existing.startDate) ?? range.start,
    days,
  );
  return {
    ...assignment,
    timeSlot: assignmentTimeSlot(existing, range, days),
    plannedStart: planned.start.toISOString(),
    plannedEnd: planned.end.toISOString(),
    plannedMinutes: Math.max(
      0,
      Math.round((planned.end.getTime() - planned.start.getTime()) / 60000),
    ),
  };
}

export const buildStaffScheduleTimeSlotPayload = (
  timeSlot?: StaffScheduleTimeSlot | null,
) => {
  if (!timeSlot) {
    return undefined;
  }
  return {
    startDate: timeSlot.startDate,
    endDate: timeSlot.endDate ?? null,
    repeating: Boolean(timeSlot.repeating),
    daysOfWeek: Array.isArray(timeSlot.daysOfWeek) ? timeSlot.daysOfWeek : null,
    startTimeMinutes:
      typeof timeSlot.startTimeMinutes === "number"
        ? timeSlot.startTimeMinutes
        : null,
    endTimeMinutes:
      typeof timeSlot.endTimeMinutes === "number"
        ? timeSlot.endTimeMinutes
        : null,
    timeZone: timeSlot.timeZone ?? null,
  };
};
