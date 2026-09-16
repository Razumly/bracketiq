import {
  calendarDayKey,
  entriesForCalendarDay,
  entriesOverlapRange,
  filterResourceCalendarEntries,
  getResourceCalendarMonthDays,
  getResourceCalendarRange,
  getResourceCalendarWeekDays,
  nextResourceCalendarDate,
} from "../resourceCalendarModel";

describe("resource calendar model", () => {
  it("builds Sunday-based week and complete month ranges", () => {
    const date = new Date("2026-05-13T12:00:00");

    expect(getResourceCalendarWeekDays(date).map(calendarDayKey)).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
    ]);

    const monthDays = getResourceCalendarMonthDays(date);
    expect(monthDays).toHaveLength(42);
    expect(calendarDayKey(monthDays[0])).toBe("2026-04-26");
    expect(calendarDayKey(monthDays[monthDays.length - 1])).toBe("2026-06-06");

    const monthRange = getResourceCalendarRange("month", date);
    expect(calendarDayKey(monthRange.start)).toBe("2026-04-26");
    expect(calendarDayKey(monthRange.end)).toBe("2026-06-06");
  });

  it("advances from an end-of-month date without skipping a month", () => {
    const nextMonth = nextResourceCalendarDate(
      "month",
      new Date("2026-01-31T12:00:00"),
      1,
    );

    expect(calendarDayKey(nextMonth)).toBe("2026-02-01");
  });

  it("filters entries by resource and keeps cross-midnight entries on both days", () => {
    const entry = {
      id: "overnight",
      title: "Availability",
      start: new Date("2026-05-11T23:30:00"),
      end: new Date("2026-05-12T01:00:00"),
      resourceId: "resource-a",
    };
    const range = getResourceCalendarRange("week", entry.start);

    expect(entriesOverlapRange(entry, range)).toBe(true);
    expect(entriesForCalendarDay([entry], new Date("2026-05-11T12:00:00"))).toEqual([entry]);
    expect(entriesForCalendarDay([entry], new Date("2026-05-12T12:00:00"))).toEqual([entry]);
    expect(
      filterResourceCalendarEntries(
        [entry, { ...entry, id: "other-resource", resourceId: "resource-b" }],
        [{ id: "resource-a", label: "Court A" }],
        range,
      ),
    ).toEqual([entry]);
  });
});
