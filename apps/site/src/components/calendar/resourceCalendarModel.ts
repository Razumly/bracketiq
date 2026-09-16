import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type ResourceCalendarView = "week" | "month";

export type ResourceCalendarResource = {
  id: string;
  label: string;
  facilityId?: string | null;
  facilityName?: string | null;
};

export type ResourceCalendarEntry<TResource = unknown> = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource?: TResource;
};

export type ResourceCalendarRange = {
  start: Date;
  end: Date;
};

const validDate = (value: Date): boolean =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const normalizeResourceIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean),
    ),
  );
};

export const getResourceCalendarRange = (
  view: ResourceCalendarView,
  date: Date,
): ResourceCalendarRange => {
  const safeDate = validDate(date) ? date : new Date();
  if (view === "month") {
    return {
      start: startOfWeek(startOfMonth(safeDate), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(safeDate), { weekStartsOn: 0 }),
    };
  }
  return {
    start: startOfWeek(safeDate, { weekStartsOn: 0 }),
    end: endOfWeek(safeDate, { weekStartsOn: 0 }),
  };
};

export const getResourceCalendarWeekDays = (date: Date): Date[] => {
  const range = getResourceCalendarRange("week", date);
  return Array.from({ length: 7 }, (_, index) => addDays(range.start, index));
};

export const getResourceCalendarMonthDays = (date: Date): Date[] => {
  const range = getResourceCalendarRange("month", date);
  const days: Date[] = [];
  let cursor = startOfDay(range.start);
  const lastDay = startOfDay(range.end);
  while (cursor.getTime() <= lastDay.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
};

export const calendarDayKey = (date: Date): string => format(date, "yyyy-MM-dd");

export const entriesOverlapRange = (
  entry: Pick<ResourceCalendarEntry, "start" | "end">,
  range: ResourceCalendarRange,
): boolean =>
  validDate(entry.start) &&
  validDate(entry.end) &&
  entry.end.getTime() > range.start.getTime() &&
  entry.start.getTime() < range.end.getTime();

export const filterResourceCalendarEntries = <TResource>(
  entries: Array<ResourceCalendarEntry<TResource>>,
  resources: ResourceCalendarResource[],
  range: ResourceCalendarRange,
): Array<ResourceCalendarEntry<TResource>> => {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  return entries.filter(
    (entry) =>
      resourceIds.has(entry.resourceId) && entriesOverlapRange(entry, range),
  );
};

export const entriesForCalendarDay = <TResource>(
  entries: Array<ResourceCalendarEntry<TResource>>,
  day: Date,
): Array<ResourceCalendarEntry<TResource>> => {
  const range = { start: startOfDay(day), end: endOfDay(day) };
  return entries.filter((entry) => entriesOverlapRange(entry, range));
};

export const formatCalendarRangeLabel = (
  days: Date[],
): string => {
  if (!days.length) return "";
  const first = days[0];
  const last = days[days.length - 1];
  if (calendarDayKey(first) === calendarDayKey(last)) {
    return format(first, "MMM d, yyyy");
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${format(first, "MMM d")}–${format(last, "MMM d, yyyy")}`;
  }
  return `${format(first, "MMM d, yyyy")}–${format(last, "MMM d, yyyy")}`;
};

export const nextResourceCalendarDate = (
  view: ResourceCalendarView,
  date: Date,
  direction: -1 | 1,
): Date => {
  const next = new Date(date.getTime());
  if (view === "month") {
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
  } else {
    next.setDate(next.getDate() + direction * 7);
  }
  return next;
};
