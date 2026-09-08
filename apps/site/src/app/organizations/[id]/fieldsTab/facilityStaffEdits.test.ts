import type { Facility, Field } from "@/types";
import {
  planStaffAssignmentEdit,
  planStaffDraftEdit,
  planStaffOccurrenceEdit,
  prepareStaffTimeslot,
  staffOverrideAmountCents,
  type StaffTimeslotForm,
} from "./facilityStaffEdits";
import {
  findRestorableStaffUnassignments,
  getStaffAssignmentOccurrenceRangeForDate,
  staffAssignmentCanDeleteFollowing,
} from "./facilityStaffOccurrences";
import type {
  ManagerCalendarDraft,
  StaffScheduleAssignment,
  StaffScheduleStaffMember,
} from "./facilityCalendarTypes";

const field = {
  $id: "court_1",
  name: "Court 1",
  facilityId: "facility_1",
} as Field;
const facility = {
  $id: "facility_1",
  name: "Austin Sports Center",
} as Facility;
const member: StaffScheduleStaffMember = {
  staffMemberId: "staff_1",
  userId: "user_1",
  fullName: "Jordan Rivers",
};
const selection = {
  fieldIds: [field.$id],
  start: new Date(2026, 8, 7, 9),
  end: new Date(2026, 8, 7, 11),
};
const form: StaffTimeslotForm = {
  mode: "staff_assignment",
  userId: "",
  overrideAmount: "",
  notes: "Front desk",
  repeating: false,
  repeatDays: [],
  repeatEndDate: null,
};
const draft: ManagerCalendarDraft = {
  id: "draft_1",
  mode: "staff_assignment",
  ...selection,
};
const parent: StaffScheduleAssignment = {
  id: "assignment_1",
  userName: "",
  isOpen: true,
  assignmentKind: "STAFF_SHIFT",
  facilityId: facility.$id,
  facilityName: facility.name,
  fieldId: field.$id,
  fieldName: field.name,
  notes: "Existing notes",
  status: "PLANNED",
  timeSlot: {
    startDate: new Date(2026, 8, 1).toISOString(),
    endDate: new Date(2026, 8, 30).toISOString(),
    repeating: true,
    daysOfWeek: [0, 2],
    startTimeMinutes: 540,
    endTimeMinutes: 660,
    timeZone: "America/Chicago",
  },
};

describe("Staff timeslot preparation", () => {
  it("normalizes rates and repeat days without changing the selected occurrence", () => {
    const result = prepareStaffTimeslot(
      {
        ...form,
        overrideAmount: "$12.345",
        repeating: true,
        repeatDays: [2, 0, 2, -1, 7, 1.5],
        repeatEndDate: new Date(2026, 8, 30),
      },
      selection,
      [field],
    );
    expect(result.rateOverrideCents).toBe(1235);
    expect(result.daysOfWeek).toEqual([0, 2]);
    expect(result.repeatEndDate).toBe(
      new Date(2026, 8, 30, 23, 59, 59, 999).toISOString(),
    );
    expect(result.selection).toEqual(selection);
    expect(staffOverrideAmountCents("")).toBeNull();
  });

  it.each([0, -1, "invalid", Number.POSITIVE_INFINITY])(
    "rejects invalid override amounts: %s",
    (overrideAmount) => {
      expect(() =>
        prepareStaffTimeslot({ ...form, overrideAmount }, selection, [field]),
      ).toThrow("Override amount must be greater than 0.");
    },
  );

  it.each([
    { range: null, fields: [field], message: "Select at least one resource" },
    { range: selection, fields: [], message: "Select at least one resource" },
    {
      range: { ...selection, end: selection.start },
      fields: [field],
      message: "End time must be after",
    },
    {
      range: { ...selection, end: new Date(2026, 8, 8, 11) },
      fields: [field],
      message: "within a single day",
    },
    {
      range: { ...selection, start: new Date("invalid") },
      fields: [field],
      message: "Select a valid time range",
    },
  ])(
    "rejects invalid selection before preparing changes: $message",
    ({ range, fields, message }) => {
      expect(() => prepareStaffTimeslot(form, range, fields)).toThrow(message);
    },
  );

  it("rejects an empty repeat schedule and an end date before the first day", () => {
    expect(() =>
      prepareStaffTimeslot({ ...form, repeating: true }, selection, [field]),
    ).toThrow("Select at least one repeat day.");
    expect(() =>
      prepareStaffTimeslot(
        {
          ...form,
          repeating: true,
          repeatDays: [0],
          repeatEndDate: new Date(2026, 8, 6),
        },
        selection,
        [field],
      ),
    ).toThrow("Repeat end date must be on or after the start date.");
  });
});

describe("Staff draft and assignment edits", () => {
  it("offers a series assignment or an open parent with one assigned child without mutating the source", () => {
    const result = planStaffDraftEdit(
      {
        draft,
        form: {
          ...form,
          mode: "official_assignment",
          userId: member.userId,
          repeating: true,
          repeatDays: [0, 2],
        },
        selection,
        fields: [field],
        fieldIds: [field.$id, field.$id, "court_2"],
        members: [member],
      },
      () => "child_draft",
    );
    if (result.type !== "scope")
      throw new Error("Expected an assignment-scope choice.");
    expect(result.prompt.allDraft.staff).toMatchObject({
      userId: member.userId,
      repeating: true,
      daysOfWeek: [0, 2],
    });
    expect(result.prompt.parentDraft.staff).toMatchObject({
      userId: null,
      userName: null,
      repeating: true,
    });
    expect(result.prompt.childDraft).toMatchObject({
      id: "child_draft",
      mode: "official_assignment",
      fieldIds: ["court_1", "court_2"],
      staff: {
        parentDraftId: draft.id,
        userId: member.userId,
        repeating: false,
        daysOfWeek: [0],
        repeatEndDate: null,
      },
    });
    expect(draft.staff).toBeUndefined();
    expect(draft.fieldIds).toEqual(["court_1"]);
  });

  it("updates a single-resource draft without a scope prompt and rejects an unknown staff member", () => {
    const input = {
      draft,
      form: { ...form, userId: member.userId },
      selection,
      fields: [field],
      fieldIds: [field.$id],
      members: [member],
    };
    const result = planStaffDraftEdit(input);
    if (result.type !== "update")
      throw new Error("Expected a direct draft update.");
    expect(result.draft.staff).toMatchObject({
      userId: member.userId,
      userName: member.fullName,
      repeating: false,
      notes: form.notes,
    });
    expect(() => planStaffDraftEdit({ ...input, members: [] })).toThrow(
      "Choose a valid staff member",
    );
  });

  it("keeps a child assignment identity, resource, notes, and time range when its rate is edited", () => {
    const child = {
      ...parent,
      id: "child_1",
      parentAssignmentId: parent.id,
      userId: member.userId,
    };
    const result = planStaffAssignmentEdit({
      assignment: child,
      isChild: true,
      form: {
        ...form,
        userId: "different_user",
        notes: "Changed",
        overrideAmount: 25,
      },
      fields: [],
      facilities: [],
      members: [member],
    });
    expect(result).toMatchObject({
      userId: member.userId,
      userName: member.fullName,
      fieldId: child.fieldId,
      facilityId: child.facilityId,
      notes: "Existing notes",
      rateOverrideType: "HOURLY",
      rateOverrideCents: 2500,
      isOpen: false,
    });
    expect(result.timeSlot).toEqual(child.timeSlot);
    expect(child.rateOverrideCents).toBeUndefined();
  });

  it("reassigns a parent resource and can reopen it without changing the repeat schedule", () => {
    const nextField = {
      ...field,
      $id: "court_2",
      name: "Court 2",
      facilityId: "facility_2",
    };
    const result = planStaffAssignmentEdit({
      assignment: { ...parent, userId: member.userId },
      isChild: false,
      form,
      fields: [nextField],
      facilities: [{ ...facility, $id: "facility_2", name: "North Center" }],
      members: [member],
    });
    expect(result).toMatchObject({
      fieldId: "court_2",
      facilityId: "facility_2",
      facilityName: "North Center",
      userId: null,
      isOpen: true,
      notes: form.notes,
    });
    expect(result.timeSlot).toEqual(parent.timeSlot);
    expect(() =>
      planStaffAssignmentEdit({
        assignment: parent,
        isChild: false,
        form,
        fields: [],
        facilities: [],
        members: [],
      }),
    ).toThrow("Select a resource");
  });

  it("creates one occurrence and a separate all-series option while retaining the parent schedule", () => {
    const plan = planStaffOccurrenceEdit(
      {
        parent,
        form: {
          ...form,
          mode: "official_assignment",
          userId: member.userId,
          overrideAmount: 20,
          repeating: true,
        },
        selection,
        fields: [field],
        facilities: [facility],
        members: [member],
      },
      () => "child_1",
    );
    expect(plan.childOverride.assignment).toMatchObject({
      id: "child_1",
      parentAssignmentId: parent.id,
      assignmentKind: "OFFICIAL_SHIFT",
      userId: member.userId,
      fieldId: field.$id,
      rateOverrideCents: 2000,
      plannedMinutes: 120,
      timeSlot: {
        repeating: false,
        daysOfWeek: [0],
        startTimeMinutes: 540,
        endTimeMinutes: 660,
        timeZone: "America/Chicago",
      },
    });
    if (plan.parentOverride.action !== "update")
      throw new Error("Expected a parent update.");
    expect(plan.parentOverride.assignment.timeSlot).toEqual(parent.timeSlot);
    expect(plan.parentOverride.assignment.userId).toBe(member.userId);
    expect(parent.isOpen).toBe(true);
  });
});

describe("Staff occurrence selection", () => {
  it("resolves only active repeat days within the series bounds", () => {
    expect(
      getStaffAssignmentOccurrenceRangeForDate(parent, selection.start),
    ).toEqual({ start: selection.start, end: selection.end });
    expect(
      getStaffAssignmentOccurrenceRangeForDate(parent, new Date(2026, 8, 8)),
    ).toBeNull();
    expect(
      getStaffAssignmentOccurrenceRangeForDate(parent, new Date(2026, 7, 31)),
    ).toBeNull();
    expect(
      getStaffAssignmentOccurrenceRangeForDate(parent, new Date(2026, 9, 5)),
    ).toBeNull();
    expect(staffAssignmentCanDeleteFollowing(parent)).toBe(true);
  });

  it("restores only pending unassignments for the same person, resource, kind, parent, and time range", () => {
    const child: StaffScheduleAssignment = {
      ...parent,
      id: "child",
      parentAssignmentId: parent.id,
      userId: member.userId,
      timeSlot: {
        startDate: selection.start.toISOString(),
        endDate: selection.end.toISOString(),
        repeating: false,
      },
    };
    const wrongField = { ...child, id: "wrong_field", fieldId: "court_2" };
    const wrongUser = { ...child, id: "wrong_user", userId: "other_user" };
    const wrongTime = {
      ...child,
      id: "wrong_time",
      plannedStart: new Date(2026, 8, 7, 10).toISOString(),
    };
    const wrongKind = {
      ...child,
      id: "wrong_kind",
      assignmentKind: "OFFICIAL_SHIFT" as const,
    };
    const wrongParent = {
      ...child,
      id: "wrong_parent",
      parentAssignmentId: "other_parent",
    };
    const notPending = { ...child, id: "not_pending" };
    const pending = [
      child,
      wrongField,
      wrongUser,
      wrongTime,
      wrongKind,
      wrongParent,
    ];
    const result = findRestorableStaffUnassignments(
      [...pending, notPending],
      Object.fromEntries(
        pending.map((assignment) => [
          assignment.id,
          { action: "unassign" as const, assignmentId: assignment.id },
        ]),
      ),
      {
        parent,
        userId: member.userId,
        kind: "STAFF_SHIFT",
        fieldIds: [field.$id],
        selection,
      },
    );
    expect(result.map((assignment) => assignment.id)).toEqual(["child"]);
    expect(staffAssignmentCanDeleteFollowing(child)).toBe(false);
  });
});
