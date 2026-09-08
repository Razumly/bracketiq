import { endOfDay, startOfDay } from "date-fns";
import {
  dateWithMinutes,
  mondayDayOf,
  toValidDate,
} from "./facilityCalendarRanges";
import type {
  ManagerStaffAssignmentPendingOverride,
  SelectionState,
  StaffScheduleAssignment,
  StaffScheduleAssignmentKind,
  StaffScheduleTimeSlot,
} from "./facilityCalendarTypes";

type StaffOccurrenceRange = { start: Date; end: Date };

export function getStaffAssignmentPrimaryRange(
  assignment: StaffScheduleAssignment,
): StaffOccurrenceRange | null {
  const start =
    toValidDate(assignment.plannedStart) ??
    toValidDate(assignment.timeSlot?.startDate);
  const end =
    toValidDate(assignment.plannedEnd) ??
    toValidDate(assignment.timeSlot?.endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return { start, end };
}

function isScheduledDay(
  timeSlot: StaffScheduleTimeSlot,
  scheduleStart: Date,
  targetDay: Date,
): boolean {
  const days = timeSlot.daysOfWeek?.length
    ? timeSlot.daysOfWeek
    : [mondayDayOf(scheduleStart)];
  if (!days.includes(mondayDayOf(targetDay))) return false;
  if (targetDay < startOfDay(scheduleStart)) return false;
  const scheduleEnd = toValidDate(timeSlot.endDate);
  return !scheduleEnd || targetDay <= endOfDay(scheduleEnd);
}

function repeatingRange(
  assignment: StaffScheduleAssignment,
  timeSlot: StaffScheduleTimeSlot,
  scheduleStart: Date,
  targetDay: Date,
): StaffOccurrenceRange | null {
  const startMinutes =
    typeof timeSlot.startTimeMinutes === "number"
      ? timeSlot.startTimeMinutes
      : scheduleStart.getHours() * 60 + scheduleStart.getMinutes();
  const endMinutes =
    typeof timeSlot.endTimeMinutes === "number"
      ? timeSlot.endTimeMinutes
      : startMinutes + Math.max(30, assignment.plannedMinutes ?? 60);
  const start = dateWithMinutes(targetDay, startMinutes);
  const end = dateWithMinutes(targetDay, endMinutes);
  return end > start ? { start, end } : null;
}

export function getStaffAssignmentOccurrenceRangeForDate(
  assignment: StaffScheduleAssignment,
  occurrenceDate: Date,
): StaffOccurrenceRange | null {
  const timeSlot = assignment.timeSlot;
  const targetDay = startOfDay(occurrenceDate);
  if (!timeSlot?.repeating) {
    const range = getStaffAssignmentPrimaryRange(assignment);
    return range && startOfDay(range.start).getTime() === targetDay.getTime()
      ? range
      : null;
  }
  const scheduleStart = toValidDate(timeSlot.startDate);
  if (!scheduleStart || !isScheduledDay(timeSlot, scheduleStart, targetDay))
    return null;
  return repeatingRange(assignment, timeSlot, scheduleStart, targetDay);
}

export function getPreviousStaffAssignmentOccurrenceRange(
  assignment: StaffScheduleAssignment,
  beforeStart: Date,
): StaffOccurrenceRange | null {
  const timeSlot = assignment.timeSlot;
  if (!timeSlot?.repeating) return null;
  const scheduleStart = toValidDate(timeSlot.startDate);
  if (!scheduleStart) return null;
  const cursor = startOfDay(beforeStart);
  if (!repeatingRange(assignment, timeSlot, scheduleStart, cursor)) return null;
  const scheduleStartDay = startOfDay(scheduleStart);
  for (let attempts = 0; cursor >= scheduleStartDay && attempts < 3660; attempts += 1) {
    const range = getStaffAssignmentOccurrenceRangeForDate(assignment, cursor);
    if (range && range.start < beforeStart) return range;
    cursor.setDate(cursor.getDate() - 1);
  }
  return null;
}

export function staffAssignmentCanDeleteFollowing(
  assignment: StaffScheduleAssignment,
): boolean {
  if (assignment.timeSlot?.repeating) return true;
  const range = getStaffAssignmentPrimaryRange(assignment);
  return Boolean(
    range &&
      startOfDay(range.start).getTime() !== startOfDay(range.end).getTime(),
  );
}

export function isOpenParentStaffScheduleAssignment(assignment: StaffScheduleAssignment): boolean {
  return !assignment.parentAssignmentId && !assignment.userId && !assignment.staffMemberId;
}

export function isOpenParentStaffScheduleSeries(assignment: StaffScheduleAssignment): boolean {
  return isOpenParentStaffScheduleAssignment(assignment) && staffAssignmentCanDeleteFollowing(assignment);
}

type RestoreSelection = {
  parent: StaffScheduleAssignment | null;
  userId: string;
  kind: StaffScheduleAssignmentKind;
  fieldIds: readonly string[];
  selection: SelectionState;
};

function matchesRestoreSelection(
  assignment: StaffScheduleAssignment,
  target: RestoreSelection,
): boolean {
  if (assignment.parentAssignmentId !== target.parent?.id) return false;
  if (
    assignment.assignmentKind !== target.kind ||
    assignment.userId !== target.userId
  )
    return false;
  return !assignment.fieldId || target.fieldIds.includes(assignment.fieldId);
}

function matchesOccurrenceRange(
  assignment: StaffScheduleAssignment,
  selection: SelectionState,
): boolean {
  const range =
    getStaffAssignmentOccurrenceRangeForDate(assignment, selection.start) ??
    getStaffAssignmentPrimaryRange(assignment);
  return Boolean(
    range &&
      range.start.getTime() === selection.start.getTime() &&
      range.end.getTime() === selection.end.getTime(),
  );
}

export function findRestorableStaffUnassignments(
  assignments: readonly StaffScheduleAssignment[],
  overrides: Readonly<Record<string, ManagerStaffAssignmentPendingOverride>>,
  target: RestoreSelection,
): StaffScheduleAssignment[] {
  if (!target.parent || !target.userId) return [];
  return assignments.filter(
    (assignment) =>
      overrides[assignment.id]?.action === "unassign" &&
      matchesRestoreSelection(assignment, target) &&
      matchesOccurrenceRange(assignment, target.selection),
  );
}
