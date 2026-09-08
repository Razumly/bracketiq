import { startOfDay } from 'date-fns';
import type { Field } from '@/types';
import { getFacilityScopedFieldDisplayName } from '@/lib/fieldUtils';
import { calendarTargetResourceId, getFieldFacility, getFieldFacilityId } from './facilityCalendarResources';
import { buildStaffAssignmentWithCalendarRange, dateWithMinutes, parseCalendarDropRange, toValidDate } from './facilityCalendarRanges';
import {
  getStaffAssignmentOccurrenceRangeForDate, getStaffAssignmentPrimaryRange, isOpenParentStaffScheduleSeries,
} from './facilityStaffOccurrences';
import type {
  FacilityFeedCalendarEntry, ManagerStaffAssignmentPendingOverride, StaffScheduleAssignment,
} from './facilityCalendarTypes';

type StaffCalendarRangeChange = {
  event: FacilityFeedCalendarEntry;
  start: Date | string;
  end: Date | string;
  resourceId?: string | number;
};
type StaffOverride = { assignmentId: string; override: ManagerStaffAssignmentPendingOverride };
type ChangeContext = {
  change: StaffCalendarRangeChange;
  assignment: StaffScheduleAssignment;
  start: Date;
  end: Date;
};
type ChangeResult =
  | { start: Date; overrides: StaffOverride[] }
  | { error: { color: 'red' | 'yellow'; message: string } }
  | null;

const minutesFromCalendarDate = (date: Date): number => date.getHours() * 60 + date.getMinutes();

const buildChildStaffAssignmentClippedToParentResize = ({
  assignment,
  parentStartMinutes,
  parentEndMinutes,
  shrinkStart,
  shrinkEnd,
}: {
  assignment: StaffScheduleAssignment;
  parentStartMinutes: number;
  parentEndMinutes: number;
  shrinkStart: boolean;
  shrinkEnd: boolean;
}): ManagerStaffAssignmentPendingOverride | null => {
  const range = getStaffAssignmentPrimaryRange(assignment);
  if (!range) {
    return null;
  }

  const targetDay = startOfDay(range.start);
  const nextStart = shrinkStart
    ? new Date(Math.max(range.start.getTime(), dateWithMinutes(targetDay, parentStartMinutes).getTime()))
    : range.start;
  const nextEnd = shrinkEnd
    ? new Date(Math.min(range.end.getTime(), dateWithMinutes(targetDay, parentEndMinutes).getTime()))
    : range.end;

  if (nextEnd.getTime() <= nextStart.getTime()) {
    return {
      action: 'unassign',
      assignmentId: assignment.id,
    };
  }
  if (nextStart.getTime() === range.start.getTime() && nextEnd.getTime() === range.end.getTime()) {
    return null;
  }

  const nextAssignment = buildStaffAssignmentWithCalendarRange(assignment, nextStart, nextEnd, {
    preserveRepeatingPattern: Boolean(assignment.timeSlot?.repeating),
  });
  return nextAssignment ? {
    action: 'update',
    assignment: nextAssignment,
  } : null;
};

const buildOpenParentStaffSeriesResizeOverrides = ({
  assignment,
  children,
  originalStart,
  originalEnd,
  nextStart,
  nextEnd,
}: {
  assignment: StaffScheduleAssignment;
  children: StaffScheduleAssignment[];
  originalStart: Date;
  originalEnd: Date;
  nextStart: Date;
  nextEnd: Date;
}): Array<{ assignmentId: string; override: ManagerStaffAssignmentPendingOverride }> | null => {
  const parentAssignment = buildStaffAssignmentWithCalendarRange(assignment, nextStart, nextEnd, {
    preserveRepeatingPattern: true,
  });
  if (!parentAssignment) {
    return null;
  }

  const originalStartMinutes = minutesFromCalendarDate(originalStart);
  const originalEndMinutes = minutesFromCalendarDate(originalEnd);
  const nextStartMinutes = minutesFromCalendarDate(nextStart);
  const nextEndMinutes = minutesFromCalendarDate(nextEnd);
  const shrinkStart = nextStartMinutes > originalStartMinutes;
  const shrinkEnd = nextEndMinutes < originalEndMinutes;
  const childOverrides = shrinkStart || shrinkEnd
    ? children.flatMap((child) => {
        const override = buildChildStaffAssignmentClippedToParentResize({
          assignment: child,
          parentStartMinutes: nextStartMinutes,
          parentEndMinutes: nextEndMinutes,
          shrinkStart,
          shrinkEnd,
        });
        return override ? [{ assignmentId: child.id, override }] : [];
      })
    : [];

  return [
    ...childOverrides,
    {
      assignmentId: assignment.id,
      override: {
        action: 'update',
        assignment: parentAssignment,
      },
    },
  ];
};

function changeContext(change: StaffCalendarRangeChange): ChangeContext | null {
  const assignment = change.event.resource?.source as StaffScheduleAssignment | undefined;
  const range = parseCalendarDropRange(change.start, change.end);
  if (!assignment?.id || !range) return null;
  return { change, assignment, ...range };
}

function isInsideParent(context: ChangeContext, assignments: StaffScheduleAssignment[]): boolean {
  if (!context.assignment.parentAssignmentId) return true;
  const parent = assignments.find((assignment) => assignment.id === context.assignment.parentAssignmentId);
  const range = parent ? getStaffAssignmentOccurrenceRangeForDate(parent, context.start) : null;
  return Boolean(range && context.start >= range.start && context.end <= range.end);
}

function openSeriesOccurrence(context: ChangeContext, interaction: 'move' | 'resize') {
  if (interaction !== 'resize' || !isOpenParentStaffScheduleSeries(context.assignment)) return null;
  const item = context.change.event.resource;
  const start = item.start instanceof Date ? item.start : toValidDate(context.change.event.start);
  const end = item.end instanceof Date ? item.end : toValidDate(context.change.event.end);
  return start && end ? { start, end } : null;
}

function resizedSeriesChanges(
  context: ChangeContext, assignments: StaffScheduleAssignment[], original: { start: Date; end: Date },
): ChangeResult {
  const children = assignments.filter((candidate) => (
    candidate.parentAssignmentId === context.assignment.id && Boolean(candidate.userId || candidate.staffMemberId)
  ));
  const overrides = buildOpenParentStaffSeriesResizeOverrides({
    assignment: context.assignment, children,
    originalStart: original.start, originalEnd: original.end,
    nextStart: context.start, nextEnd: context.end,
  });
  if (!overrides?.length) return { error: { color: 'red', message: 'Unable to resize this staff assignment.' } };
  return { start: context.start, overrides };
}

function targetFieldId(context: ChangeContext) {
  const { resourceId, event } = context.change;
  return calendarTargetResourceId(resourceId, event.resourceId) ?? event.resource.fieldId ?? context.assignment.fieldId ?? null;
}

function movedFacilityName(field: Field, assignment: StaffScheduleAssignment) {
  return getFieldFacility(field)?.name ?? assignment.facilityName ?? null;
}

function assignmentWithTargetField(
  context: ChangeContext, assignment: StaffScheduleAssignment, fields: Field[],
): StaffScheduleAssignment {
  const fieldId = targetFieldId(context);
  if (context.assignment.parentAssignmentId || !fieldId || fieldId === context.assignment.fieldId) return assignment;
  const field = fields.find((candidate) => candidate.$id === fieldId);
  if (!field) return assignment;
  return {
    ...assignment, fieldId: field.$id, fieldName: getFacilityScopedFieldDisplayName(field),
    facilityId: getFieldFacilityId(field), facilityName: movedFacilityName(field, assignment),
  };
}

function singleAssignmentChange(context: ChangeContext, fields: Field[]): ChangeResult {
  const assignment = buildStaffAssignmentWithCalendarRange(context.assignment, context.start, context.end, {
    preserveRepeatingPattern: Boolean(context.assignment.timeSlot?.repeating),
  });
  if (!assignment) return { error: { color: 'red', message: 'Unable to move this staff assignment.' } };
  return {
    start: context.start,
    overrides: [{
      assignmentId: context.assignment.id,
      override: { action: 'update', assignment: assignmentWithTargetField(context, assignment, fields) },
    }],
  };
}

export function prepareStaffCalendarRangeChange(
  change: StaffCalendarRangeChange,
  assignments: StaffScheduleAssignment[],
  fields: Field[],
  interaction: 'move' | 'resize',
): ChangeResult {
  const context = changeContext(change);
  if (!context) return null;
  if (!isInsideParent(context, assignments)) {
    return { error: { color: 'yellow', message: 'Assigned coverage must stay inside the parent shift.' } };
  }
  const original = openSeriesOccurrence(context, interaction);
  return original ? resizedSeriesChanges(context, assignments, original) : singleAssignmentChange(context, fields);
}
