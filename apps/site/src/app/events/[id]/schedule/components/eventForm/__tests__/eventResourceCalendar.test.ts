import type { Field } from "@/types";
import { getResourceCalendarRange } from "@/components/calendar/resourceCalendarModel";
import {
  buildEventResourceCalendar,
  deriveCalendarTimingFromSlots,
  REPEATING_SLOT_NO_OCCURRENCE_ERROR,
  REPEATING_SLOT_NO_OCCURRENCE_ACTION,
} from "../eventResourceCalendar";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import { createLeagueSlotForm } from "../slotForm";

const field = (id: string, name = id): Field => ({
  $id: id,
  name,
  location: "",
  lat: 0,
  long: 0,
});

const slot = (overrides: Partial<LeagueSlotForm> = {}): LeagueSlotForm => ({
  key: "slot-1",
  timeZone: "UTC",
  scheduledFieldIds: ["field-a"],
  scheduledFieldId: "field-a",
  daysOfWeek: [0],
  dayOfWeek: 0,
  startDate: "2026-05-01T00:00",
  endDate: "2026-05-31T00:00",
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  repeating: true,
  divisions: [],
  conflicts: [],
  checking: false,
  ...overrides,
});

describe("Event resource calendar", () => {
  it("renders one visual entry per Resource without duplicating the logical slot", () => {
    const oneTimeSlot = slot({
      repeating: false,
      scheduledFieldIds: ["field-a", "field-b"],
      scheduledFieldId: "field-a",
      startDate: "2026-05-11T10:00",
      endDate: "2026-05-11T11:00",
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 11 * 60,
    });
    const result = buildEventResourceCalendar({
      slots: [oneTimeSlot],
      fields: [field("field-a", "Court A"), field("field-b", "Court B")],
      eventStart: "2026-05-01T00:00",
      eventEnd: "2026-06-01T00:00",
      eventTimeZone: "UTC",
      range: getResourceCalendarRange("week", new Date("2026-05-11T12:00:00")),
    });

    expect(result.invalidSlots).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(new Set(result.entries.map((entry) => entry.logicalSlotKey))).toEqual(new Set(["slot-1"]));
    expect(new Set(result.entries.map((entry) => entry.resourceId))).toEqual(new Set(["field-a", "field-b"]));
  });
  it("projects slot intervals into the Event timezone for calendar display", () => {
    const result = buildEventResourceCalendar({
      slots: [
        slot({
          repeating: false,
          timeZone: "America/New_York",
          scheduledFieldIds: ["field-a"],
          scheduledFieldId: "field-a",
          startDate: "2026-05-11T09:00",
          endDate: "2026-05-11T10:00",
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
        }),
      ],
      fields: [field("field-a")],
      eventStart: "2026-05-01T00:00",
      eventEnd: "2026-06-01T00:00",
      eventTimeZone: "America/Los_Angeles",
      range: getResourceCalendarRange("week", new Date("2026-05-11T12:00:00")),
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].start.getHours()).toBe(6);
    expect(result.entries[0].end.getHours()).toBe(7);
  });
  it("keeps repeating occurrences visible across slot and Event time zones", () => {
    const result = buildEventResourceCalendar({
      slots: [
        slot({
          timeZone: "America/New_York",
          daysOfWeek: [5],
          dayOfWeek: 5,
          startDate: "2026-05-31T00:00",
          endDate: "2026-06-06T00:00",
          startTimeMinutes: 23 * 60 + 30,
          endTimeMinutes: 23 * 60 + 59,
        }),
      ],
      fields: [field("field-a")],
      eventStart: "2026-05-31T00:00",
      eventEnd: "2026-06-07T00:00",
      eventTimeZone: "America/Los_Angeles",
      range: getResourceCalendarRange("week", new Date("2026-06-03T12:00:00")),
    });

    expect(result.invalidSlots).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].occurrenceDate).toBe("2026-06-06");
    expect(result.entries[0].start.getDate()).toBe(6);
    expect(result.entries[0].start.getHours()).toBe(20);
  });


  it("reports no-occurrence ranges and ignores an empty new-slot placeholder", () => {
    const result = buildEventResourceCalendar({
      slots: [
        slot({
          key: "no-occurrence",
          daysOfWeek: [0],
          dayOfWeek: 0,
          startDate: "2026-05-09T00:00",
          endDate: "2026-05-10T00:00",
        }),
        {
          key: "new-placeholder",
          timeZone: "UTC",
          scheduledFieldIds: [],
          scheduledFieldId: undefined,
          daysOfWeek: [],
          dayOfWeek: undefined,
          startDate: undefined,
          endDate: undefined,
          startTimeMinutes: undefined,
          endTimeMinutes: undefined,
          repeating: true,
          divisions: [],
          conflicts: [],
          checking: false,
        } as LeagueSlotForm,
      ],
      fields: [field("field-a")],
      eventStart: "2026-05-01T00:00",
      eventEnd: "2026-06-01T00:00",
      eventTimeZone: "UTC",
      range: {
        start: new Date("2026-05-09T00:00:00"),
        end: new Date("2026-05-10T23:59:59"),
      },
    });

    expect(result.invalidSlots).toHaveLength(1);
    expect(result.invalidSlots[0]).toMatchObject({
      slotKey: "no-occurrence",
      reason: `${REPEATING_SLOT_NO_OCCURRENCE_ERROR} ${REPEATING_SLOT_NO_OCCURRENCE_ACTION}`,
    });
  });

  it("does not mark a valid repeating range invalid outside the current view", () => {
    const result = buildEventResourceCalendar({
      slots: [
        slot({
          startDate: "2026-05-01T00:00",
          endDate: "2026-05-31T00:00",
          daysOfWeek: [0],
          dayOfWeek: 0,
        }),
      ],
      fields: [field("field-a")],
      eventStart: "2026-05-01T00:00",
      eventEnd: "2026-06-01T00:00",
      eventTimeZone: "UTC",
      range: getResourceCalendarRange("week", new Date("2026-06-01T12:00:00")),
    });

    expect(result.entries).toEqual([]);
    expect(result.invalidSlots).toEqual([]);
  });
  it("renders open repeating slots beyond the validation lookahead", () => {
    const result = buildEventResourceCalendar({
      slots: [
        slot({
          endDate: undefined,
          startDate: "2026-01-01T00:00",
        }),
      ],
      fields: [field("field-a")],
      eventStart: "2026-01-01T00:00",
      eventEnd: undefined,
      eventTimeZone: "UTC",
      range: {
        start: new Date("2027-02-07T00:00:00.000Z"),
        end: new Date("2027-02-14T00:00:00.000Z"),
      },
    });

    expect(result.invalidSlots).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].occurrenceDate).toBe("2027-02-08");
  });
  it("uses the local slot date when deriving an earlier first occurrence", () => {
    const timing = deriveCalendarTimingFromSlots({
      slots: [
        slot({
          dayOfWeek: 0,
          daysOfWeek: [0],
          endDate: "2026-05-11T23:59",
          startDate: "2026-05-11T09:00",
          startTimeMinutes: 7 * 60,
          endTimeMinutes: 8 * 60,
        }),
      ],
      eventStart: "2026-05-11T00:00",
      eventEnd: "2026-05-12T00:00",
      eventTimeZone: "UTC",
      eventType: "TRYOUT",
    });

    expect(timing.start?.toISOString()).toBe("2026-05-11T07:00:00.000Z");
    expect(timing.end?.toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });

  it("derives finite boundaries and keeps open Weekly Events open-ended", () => {
    const finite = deriveCalendarTimingFromSlots({
      slots: [slot({ repeating: false, startDate: "2026-05-11T10:00", endDate: "2026-05-11T11:00", startTimeMinutes: 600, endTimeMinutes: 660 })],
      eventTimeZone: "UTC",
      eventType: "TRYOUT",
    });
    expect(finite.hasFiniteEnd).toBe(true);
    expect(finite.start?.toISOString()).toBe("2026-05-11T10:00:00.000Z");
    expect(finite.end?.toISOString()).toBe("2026-05-11T11:00:00.000Z");

    const open = deriveCalendarTimingFromSlots({
      slots: [slot({ endDate: undefined })],
      eventTimeZone: "UTC",
      eventType: "WEEKLY_EVENT",
    });
    expect(open.hasFiniteEnd).toBe(false);
    expect(open.end).toBeNull();
  });
  it.each([
    ["TRYOUT", undefined],
    ["LEAGUE", false],
    ["TOURNAMENT", false],
  ])("does not promote an open slot lookahead to Planned End for %s", (eventType, isAutomatedScheduling) => {
    const timing = deriveCalendarTimingFromSlots({
      slots: [slot({ endDate: undefined })],
      eventStart: "2026-05-01T00:00",
      eventEnd: undefined,
      eventTimeZone: "UTC",
      eventType,
      isAutomatedScheduling,
      ignoreEventBounds: true,
    });

    expect(timing.start).not.toBeNull();
    expect(timing.hasFiniteEnd).toBe(false);
    expect(timing.end).toBeNull();
  });
  it("derives finite timing when an invalid open slot is ignored", () => {
    const timing = deriveCalendarTimingFromSlots({
      slots: [
        slot({
          key: "finite-slot",
          repeating: false,
          startDate: "2026-05-11T10:00",
          endDate: "2026-05-11T11:00",
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
        }),
        slot({
          key: "invalid-open-slot",
          endDate: undefined,
          daysOfWeek: [],
          dayOfWeek: undefined,
          startTimeMinutes: undefined,
          endTimeMinutes: undefined,
        }),
      ],
      eventTimeZone: "UTC",
      eventType: "WEEKLY_EVENT",
    });

    expect(timing.hasFiniteEnd).toBe(true);
    expect(timing.end?.toISOString()).toBe("2026-05-11T11:00:00.000Z");
  });
  it("preserves explicit repeating date bounds during Event hydration", () => {
    const hydrated = createLeagueSlotForm(
      {
        $id: "slot-1",
        timeZone: "UTC",
        scheduledFieldId: "field-a",
        scheduledFieldIds: ["field-a"],
        daysOfWeek: [0],
        dayOfWeek: 0,
        startDate: "2026-05-01T00:00",
        endDate: "2026-05-31T00:00",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
        repeating: true,
      },
      [],
      "2026-05-01T00:00",
      "2026-05-31T00:00",
      "UTC",
    );

    expect(hydrated.startDate).toBe("2026-05-01T00:00:00");
    expect(hydrated.endDate).toBe("2026-05-31T00:00:00");
  });
  it("uses the next local midnight after a finite repeating boundary", () => {
    const timing = deriveCalendarTimingFromSlots({
      slots: [
        slot({
          daysOfWeek: [6],
          dayOfWeek: 6,
          startDate: "2026-05-01T00:00",
          endDate: "2026-05-31T00:00",
        }),
      ],
      eventTimeZone: "UTC",
      eventType: "TRYOUT",
    });

    expect(timing.hasFiniteEnd).toBe(true);
    expect(timing.end?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
