/** @jest-environment jsdom */

import {
  buildManagerCalendarDraftWithCalendarRange,
  buildStaffAssignmentWithCalendarRange,
  parseCalendarDropRange,
} from "./facilityCalendarRanges";
import type {
  ManagerCalendarDraft,
  StaffScheduleAssignment,
} from "./facilityCalendarTypes";

const draft: ManagerCalendarDraft = {
  id: "draft-1",
  mode: "staff_assignment",
  fieldIds: ["court-1"],
  start: new Date(2026, 7, 31, 9),
  end: new Date(2026, 7, 31, 10),
  staff: {
    repeating: true,
    daysOfWeek: [0, 2],
    userId: "user-1",
    rateOverrideCents: 1500,
  },
};
const start = new Date(2026, 8, 9, 10, 15);
const end = new Date(2026, 8, 9, 10, 30);

describe("Facility calendar range edits", () => {
  it('parses independent drop dates without applying rental or staff duration rules', () => {
    const parsed = parseCalendarDropRange(start.toISOString(), end);
    expect(parsed).toEqual({ start, end });
    expect(parsed?.end).not.toBe(end);
    expect(parseCalendarDropRange(end, start)).toEqual({ start: end, end: start });
    expect(parseCalendarDropRange('invalid', end)).toBeNull();
    expect(parseCalendarDropRange(start, new Date('invalid'))).toBeNull();
    expect(parseCalendarDropRange(undefined, end)).toBeNull();
  });

  it("preserves a repeating staff pattern or moves one occurrence without mutating its source", () => {
    const repeating = buildManagerCalendarDraftWithCalendarRange(
      draft,
      start,
      end,
      { preserveRepeatingPattern: true },
    );
    expect(repeating).toMatchObject({
      start: new Date(2026, 7, 31, 10, 15),
      end: new Date(2026, 7, 31, 10, 30),
      staff: {
        repeating: true,
        daysOfWeek: [0, 2],
        userId: "user-1",
        rateOverrideCents: 1500,
      },
    });
    expect(
      buildManagerCalendarDraftWithCalendarRange(draft, start, end),
    ).toMatchObject({
      start,
      end,
      staff: { daysOfWeek: [2] },
    });
    expect(draft.start).toEqual(new Date(2026, 7, 31, 9));
    expect(draft.staff?.daysOfWeek).toEqual([0, 2]);
  });

  it("anchors a repeating rental to its stored start date and keeps its end boundary and price", () => {
    const rental: ManagerCalendarDraft = {
      ...draft,
      mode: "rental",
      staff: undefined,
      rental: {
        repeating: true,
        daysOfWeek: [2, 4],
        startDate: "2026-08-30T00:00:00",
        endDate: "2026-10-01T00:00:00",
        price: 3000,
      },
    };
    expect(
      buildManagerCalendarDraftWithCalendarRange(rental, start, end, {
        preserveRepeatingPattern: true,
      }),
    ).toMatchObject({
      start: new Date(2026, 8, 2, 10, 15),
      end: new Date(2026, 8, 2, 10, 30),
      rental: {
        daysOfWeek: [2, 4],
        startDate: "2026-08-30T00:00:00",
        endDate: "2026-10-01T00:00:00",
        price: 3000,
        startTimeMinutes: 615,
        endTimeMinutes: 630,
      },
    });
  });

  it("keeps assignment recurrence bounds and time zone while updating the planned duration", () => {
    const assignment: StaffScheduleAssignment = {
      id: "assignment-1",
      userName: "Casey Morgan",
      assignmentKind: "STAFF_SHIFT",
      rateOverrideCents: 1500,
      timeSlot: {
        repeating: true,
        daysOfWeek: [0, 2],
        startDate: new Date(2026, 7, 31).toISOString(),
        endDate: new Date(2026, 9, 1).toISOString(),
        timeZone: "America/Chicago",
      },
    };
    expect(
      buildStaffAssignmentWithCalendarRange(assignment, start, end, {
        preserveRepeatingPattern: true,
      }),
    ).toMatchObject({
      plannedStart: new Date(2026, 7, 31, 10, 15).toISOString(),
      plannedEnd: new Date(2026, 7, 31, 10, 30).toISOString(),
      plannedMinutes: 15,
      rateOverrideCents: 1500,
      timeSlot: {
        daysOfWeek: [0, 2],
        startDate: assignment.timeSlot?.startDate,
        endDate: assignment.timeSlot?.endDate,
        timeZone: "America/Chicago",
        startTimeMinutes: 615,
        endTimeMinutes: 630,
      },
    });
    expect(
      buildStaffAssignmentWithCalendarRange(
        { ...assignment, timeSlot: undefined },
        start,
        end,
      ),
    ).toMatchObject({
      plannedStart: start.toISOString(),
      plannedEnd: end.toISOString(),
      plannedMinutes: 15,
      timeSlot: {
        repeating: false,
        daysOfWeek: [2],
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });
  });

  it.each([
    [new Date("invalid"), end],
    [end, start],
    [start, start],
    [new Date(2026, 8, 9, 23), new Date(2026, 8, 11, 1)],
  ])(
    "rejects invalid, reversed, empty, and multi-day ranges",
    (invalidStart, invalidEnd) => {
      expect(
        buildManagerCalendarDraftWithCalendarRange(
          draft,
          invalidStart,
          invalidEnd,
        ),
      ).toBeNull();
      expect(
        buildStaffAssignmentWithCalendarRange(
          {
            id: "assignment-1",
            userName: "Casey Morgan",
            assignmentKind: "STAFF_SHIFT",
          },
          invalidStart,
          invalidEnd,
        ),
      ).toBeNull();
    },
  );
});
