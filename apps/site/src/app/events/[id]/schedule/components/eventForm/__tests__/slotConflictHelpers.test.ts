import type { Event } from "@/types";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  buildExternalSlotConflicts,
  slotCanCheckExternalConflicts,
} from "../slotConflictHelpers";

const buildOvernightSlot = (): LeagueSlotForm => ({
  key: "slot-overnight",
  scheduledFieldIds: ["field-1"],
  divisions: ["OPEN"],
  daysOfWeek: [0],
  startDate: "2026-03-01T05:00:00.000Z",
  endDate: "2026-03-10T04:00:00.000Z",
  timeZone: "America/New_York",
  startTimeMinutes: 22 * 60,
  endTimeMinutes: 2 * 60,
  repeating: true,
  conflicts: [],
  checking: false,
});
const buildSameDaySlot = (): LeagueSlotForm => ({
  key: "slot-same-day",
  scheduledFieldIds: ["field-1"],
  divisions: ["OPEN"],
  daysOfWeek: [6],
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: "2026-03-01T00:00:00.000Z",
  timeZone: "UTC",
  startTimeMinutes: 10 * 60,
  endTimeMinutes: 12 * 60,
  repeating: true,
  conflicts: [],
  checking: false,
});

describe("slot conflict helpers", () => {
  it("allows external conflict checks for overnight repeating slots", () => {
    expect(
      slotCanCheckExternalConflicts(buildOvernightSlot(), {
        eventId: "event-1",
        eventStart: "2026-03-01T00:00:00.000Z",
        eventEnd: "2026-03-10T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("reports external conflicts for same-day repeating slots within their bounds", () => {
    const slot = buildSameDaySlot();
    const event = {
      $id: "event-same-day",
      eventType: "EVENT",
      parentEvent: null,
      start: "2026-03-01T11:00:00.000Z",
      end: "2026-03-01T11:30:00.000Z",
      timeSlots: [],
    } as unknown as Event;

    const conflicts = buildExternalSlotConflicts(
      slot,
      new Map([["field-1", [event]]]),
      {
        eventId: "event-1",
        eventStart: "2026-03-01T00:00:00.000Z",
        eventEnd: "2026-03-02T00:00:00.000Z",
      },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.event.$id).toBe("event-same-day");
  });

  it("reports conflicts against same-day repeating event slots", () => {
    const slot = buildSameDaySlot();
    const event = {
      $id: "event-same-day-slot",
      eventType: "LEAGUE",
      parentEvent: null,
      start: "2026-03-01T00:00:00.000Z",
      end: "2026-03-02T00:00:00.000Z",
      timeZone: "UTC",
      timeSlots: [
        {
          $id: "existing-same-day-slot",
          repeating: true,
          daysOfWeek: [6],
          startDate: "2026-03-01T00:00:00.000Z",
          endDate: "2026-03-01T00:00:00.000Z",
          timeZone: "UTC",
          startTimeMinutes: 11 * 60,
          endTimeMinutes: 11 * 60 + 30,
          scheduledFieldIds: ["field-1"],
        },
      ],
    } as unknown as Event;

    const conflicts = buildExternalSlotConflicts(
      slot,
      new Map([["field-1", [event]]]),
      {
        eventId: "event-1",
        eventStart: "2026-03-01T00:00:00.000Z",
        eventEnd: "2026-03-02T00:00:00.000Z",
      },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.schedule?.$id).toBe("existing-same-day-slot");
  });
  it("compares repeating occurrences in the slot and event time zones", () => {
    const slot: LeagueSlotForm = {
      ...buildSameDaySlot(),
      key: "slot-new-york",
      daysOfWeek: [6],
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      timeZone: "America/New_York",
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 12 * 60,
    };
    const event = {
      $id: "event-new-york",
      eventType: "EVENT",
      parentEvent: null,
      start: "2026-03-01T10:30:00",
      end: "2026-03-01T11:30:00",
      timeZone: "America/New_York",
      timeSlots: [],
    } as unknown as Event;

    const conflicts = buildExternalSlotConflicts(
      slot,
      new Map([["field-1", [event]]]),
      {
        eventId: "event-1",
        eventStart: "2026-03-01T00:00:00",
        eventEnd: "2026-03-02T00:00:00",
      },
    );

    expect(conflicts).toHaveLength(1);
  });

  it("compares explicit slot dates in the slot time zone", () => {
    const slot: LeagueSlotForm = {
      ...buildSameDaySlot(),
      key: "slot-explicit-new-york",
      startDate: "2026-03-01T10:00:00",
      endDate: "2026-03-01T12:00:00",
      timeZone: "America/New_York",
      repeating: false,
      startTimeMinutes: undefined,
      endTimeMinutes: undefined,
    };
    const event = {
      $id: "event-explicit-new-york",
      eventType: "EVENT",
      parentEvent: null,
      start: "2026-03-01T10:30:00",
      end: "2026-03-01T11:30:00",
      timeZone: "America/New_York",
      timeSlots: [],
    } as unknown as Event;

    const conflicts = buildExternalSlotConflicts(
      slot,
      new Map([["field-1", [event]]]),
      {
        eventId: "event-1",
        eventStart: "2026-03-01T00:00:00",
        eventEnd: "2026-03-02T00:00:00",
      },
    );

    expect(conflicts).toHaveLength(1);
  });
});
