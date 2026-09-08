import { endOfDay, startOfDay } from "date-fns";
import type { Facility, Field } from "@/types";
import { createId } from "@/lib/id";
import { formatDisplayDateTime, formatDisplayTime } from "@/lib/dateUtils";
import { getFacilityScopedFieldDisplayName } from "@/lib/fieldUtils";
import { getFieldFacilityId } from "./facilityCalendarResources";
import { mondayDayOf } from "./facilityCalendarRanges";
import { normalizeDaysOfWeek, normalizeFieldIds } from "./facilityFormUtils";
import type {
  ManagerCalendarDraft,
  ManagerCalendarSelectionMode,
  SelectionState,
  StaffAssignmentScopePromptState,
  StaffScheduleAssignment,
  StaffScheduleStaffMember,
} from "./facilityCalendarTypes";

export type StaffTimeslotForm = {
  mode: Exclude<ManagerCalendarSelectionMode, "rental">;
  userId: string;
  overrideAmount: string | number;
  notes: string;
  repeating: boolean;
  repeatDays: readonly number[];
  repeatEndDate: Date | null;
};

export function staffOverrideAmountCents(
  value: string | number,
): number | null {
  if (value === "") return null;
  const dollars =
    typeof value === "number" ? value : Number(value.replace(/^\$/, ""));
  const cents = Math.round(dollars * 100);
  if (!Number.isFinite(cents) || cents <= 0)
    throw new Error("Override amount must be greater than 0.");
  return cents;
}

function requireSelection(
  selection: SelectionState | null,
  fields: readonly Field[],
): SelectionState {
  if (!selection || !fields.length)
    throw new Error("Select at least one resource and a time range first.");
  if (
    !Number.isFinite(selection.start.getTime()) ||
    !Number.isFinite(selection.end.getTime())
  ) {
    throw new Error("Select a valid time range first.");
  }
  if (selection.end.getTime() <= selection.start.getTime())
    throw new Error("End time must be after the start time.");
  if (selection.start.toDateString() !== selection.end.toDateString()) {
    throw new Error("Staff timeslots must stay within a single day.");
  }
  return selection;
}

function repeatSchedule(form: StaffTimeslotForm, selection: SelectionState) {
  const daysOfWeek = form.repeating
    ? normalizeDaysOfWeek(form.repeatDays)
    : [mondayDayOf(selection.start)];
  if (form.repeating && !daysOfWeek.length)
    throw new Error("Select at least one repeat day.");
  if (
    form.repeating &&
    form.repeatEndDate &&
    startOfDay(form.repeatEndDate) < startOfDay(selection.start)
  ) {
    throw new Error("Repeat end date must be on or after the start date.");
  }
  return {
    repeating: form.repeating,
    daysOfWeek,
    repeatEndDate:
      form.repeating && form.repeatEndDate
        ? endOfDay(form.repeatEndDate).toISOString()
        : null,
  };
}

export function prepareStaffTimeslot(
  form: StaffTimeslotForm,
  selection: SelectionState | null,
  fields: readonly Field[],
) {
  const range = requireSelection(selection, fields);
  const rateOverrideCents = staffOverrideAmountCents(form.overrideAmount);
  return {
    selection: range,
    rateOverrideCents,
    ...repeatSchedule(form, range),
  };
}

function selectedMember(
  form: StaffTimeslotForm,
  members: readonly StaffScheduleStaffMember[],
) {
  return members.find((member) => member.userId === form.userId) ?? null;
}

function scopeLabels(
  form: StaffTimeslotForm,
  selection: SelectionState,
  member: StaffScheduleStaffMember,
) {
  return {
    staffName: member.fullName,
    occurrenceLabel: `${formatDisplayDateTime(selection.start)} - ${formatDisplayTime(selection.end)}`,
    kindLabel:
      form.mode === "official_assignment"
        ? ("official" as const)
        : ("staff" as const),
  };
}

type DraftEditInput = {
  draft: ManagerCalendarDraft;
  form: StaffTimeslotForm;
  selection: SelectionState | null;
  fields: readonly Field[];
  fieldIds: readonly string[];
  members: readonly StaffScheduleStaffMember[];
};

type DraftEditPlan =
  | { type: "update"; draft: ManagerCalendarDraft }
  | {
      type: "scope";
      prompt: Extract<StaffAssignmentScopePromptState, { source: "draft" }>;
    };

export function planStaffDraftEdit(
  input: DraftEditInput,
  makeId = createId,
): DraftEditPlan {
  const { draft, form } = input;
  const prepared = prepareStaffTimeslot(form, input.selection, input.fields);
  const { selection, ...schedule } = prepared;
  const member = selectedMember(form, input.members);
  if (form.userId && !member)
    throw new Error("Choose a valid staff member for this assignment.");
  const updated: ManagerCalendarDraft = {
    ...draft,
    mode: form.mode,
    fieldIds: normalizeFieldIds(input.fieldIds),
    start: new Date(selection.start),
    end: new Date(selection.end),
    staff: {
      ...schedule,
      userId: form.userId || null,
      userName: member?.fullName ?? null,
      notes: form.notes,
    },
  };
  if (!member || (!prepared.repeating && updated.fieldIds.length <= 1))
    return { type: "update", draft: updated };
  const childDraft: ManagerCalendarDraft = {
    id: makeId(),
    mode: updated.mode,
    fieldIds: updated.fieldIds,
    start: new Date(selection.start),
    end: new Date(selection.end),
    staff: {
      ...updated.staff,
      parentDraftId: draft.id,
      repeating: false,
      daysOfWeek: [mondayDayOf(selection.start)],
      repeatEndDate: null,
    },
  };
  return {
    type: "scope",
    prompt: {
      source: "draft",
      draftId: draft.id,
      previousDraft: draft,
      allDraft: updated,
      parentDraft: {
        ...updated,
        staff: { ...updated.staff, userId: null, userName: null },
      },
      childDraft,
      ...scopeLabels(form, selection, member),
    },
  };
}

type AssignmentEditInput = {
  assignment: StaffScheduleAssignment;
  isChild: boolean;
  form: StaffTimeslotForm;
  fields: readonly Field[];
  facilities: readonly Facility[];
  members: readonly StaffScheduleStaffMember[];
};

function assignmentResource(input: AssignmentEditInput) {
  const { assignment } = input;
  if (input.isChild) {
    return {
      facilityId: assignment.facilityId ?? null,
      facilityName: assignment.facilityName ?? null,
      fieldId: assignment.fieldId ?? null,
      fieldName: assignment.fieldName ?? null,
      notes: assignment.notes,
    };
  }
  const field = input.fields[0];
  if (!field) throw new Error("Select a resource for this assignment.");
  const facilityId = getFieldFacilityId(field);
  return {
    facilityId,
    facilityName:
      input.facilities.find((facility) => facility.$id === facilityId)?.name ??
      null,
    fieldId: field.$id,
    fieldName: getFacilityScopedFieldDisplayName(field),
    notes: input.form.notes,
  };
}

export function planStaffAssignmentEdit(
  input: AssignmentEditInput,
): StaffScheduleAssignment {
  const rateOverrideCents = staffOverrideAmountCents(input.form.overrideAmount);
  const userId = input.isChild
    ? (input.assignment.userId ?? null)
    : input.form.userId || null;
  const member = input.members.find((candidate) => candidate.userId === userId);
  return {
    ...input.assignment,
    ...assignmentResource(input),
    userId,
    userName: userId ? (member?.fullName ?? "Staff name unavailable") : "",
    isOpen: !userId,
    rateOverrideType: rateOverrideCents ? "HOURLY" : null,
    rateOverrideCents,
  };
}

type OccurrenceEditInput = {
  parent: StaffScheduleAssignment;
  form: StaffTimeslotForm;
  selection: SelectionState | null;
  fields: readonly Field[];
  facilities: readonly Facility[];
  members: readonly StaffScheduleStaffMember[];
};

function occurrenceResource(input: OccurrenceEditInput) {
  const field = input.fields[0];
  const facilityId = getFieldFacilityId(field);
  return {
    facilityId,
    facilityName:
      input.facilities.find((facility) => facility.$id === facilityId)?.name ??
      input.parent.facilityName ??
      null,
    fieldId: field.$id,
    fieldName: getFacilityScopedFieldDisplayName(field),
  };
}

function occurrenceTimeSlot(
  selection: SelectionState,
  parent: StaffScheduleAssignment,
) {
  const { start, end } = selection;
  const dayOfWeek = mondayDayOf(start);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    repeating: false,
    dayOfWeek,
    daysOfWeek: [dayOfWeek],
    startTimeMinutes: start.getHours() * 60 + start.getMinutes(),
    endTimeMinutes: end.getHours() * 60 + end.getMinutes(),
    timeZone: parent.timeSlot?.timeZone ?? null,
  };
}

export function planStaffOccurrenceEdit(
  input: OccurrenceEditInput,
  makeId = createId,
): Extract<StaffAssignmentScopePromptState, { source: "assignment" }> & {
  childOverride: { action: "create"; assignment: StaffScheduleAssignment };
} {
  const { parent, form } = input;
  const { selection, rateOverrideCents } = prepareStaffTimeslot(
    { ...form, repeating: false },
    input.selection,
    input.fields,
  );
  const member = selectedMember(form, input.members);
  if (!member)
    throw new Error("Choose a valid staff member for this occurrence.");
  const assigned = {
    staffMemberId: member.staffMemberId,
    userId: member.userId,
    userName: member.fullName,
    isOpen: false,
    rateOverrideType: rateOverrideCents ? "HOURLY" : null,
    rateOverrideCents,
    notes: form.notes,
  };
  const child: StaffScheduleAssignment = {
    id: makeId(),
    parentAssignmentId: parent.id,
    ...assigned,
    isChildAssignment: true,
    assignmentKind:
      form.mode === "official_assignment" ? "OFFICIAL_SHIFT" : "STAFF_SHIFT",
    ...occurrenceResource(input),
    status: parent.status ?? "PLANNED",
    timeSlot: occurrenceTimeSlot(selection, parent),
    plannedStart: selection.start.toISOString(),
    plannedEnd: selection.end.toISOString(),
    plannedMinutes: Math.max(
      0,
      Math.round((selection.end.getTime() - selection.start.getTime()) / 60000),
    ),
  };
  return {
    source: "assignment",
    parentAssignment: parent,
    parentOverride: {
      action: "update",
      assignment: { ...parent, ...assigned },
    },
    childOverride: { action: "create", assignment: child },
    ...scopeLabels(form, selection, member),
  };
}
