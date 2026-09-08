import { endOfDay, startOfDay } from 'date-fns';
import type { Facility, Field } from '@/types';
import { getFacilityScopedFieldDisplayName } from '@/lib/fieldUtils';
import type { FacilityCalendarFeedItem } from '../fieldCalendar';
import { getFieldFacilityId } from './facilityCalendarResources';
import { dateWithMinutes, mondayDayOf, toValidDate } from './facilityCalendarRanges';
import { compareRanges, subtractIntervals, type PublicRentalInterval } from './facilityCalendarIntervals';
import { normalizeDaysOfWeek } from './facilityFormUtils';
import { getStaffAssignmentOccurrenceRangeForDate, getStaffAssignmentPrimaryRange } from './facilityStaffOccurrences';
import type { ManagerCalendarDraft, StaffScheduleAssignment } from './facilityCalendarTypes';

type ScheduleInput = {
  assignments: StaffScheduleAssignment[];
  fields: Field[];
  facilities: Facility[];
  range: PublicRentalInterval;
};

function overlapsRange(value: PublicRentalInterval, range: PublicRentalInterval) {
  return compareRanges(value.start, value.end, range.start, range.end);
}

function staffIntervals(assignment: StaffScheduleAssignment, range: PublicRentalInterval): PublicRentalInterval[] {
  if (!assignment.timeSlot?.repeating) {
    const primary = getStaffAssignmentPrimaryRange(assignment);
    return primary && overlapsRange(primary, range) ? [primary] : [];
  }
  const intervals: PublicRentalInterval[] = [];
  const cursor = startOfDay(range.start);
  while (cursor.getTime() <= range.end.getTime()) {
    const occurrence = getStaffAssignmentOccurrenceRangeForDate(assignment, cursor);
    if (occurrence && overlapsRange(occurrence, range)) intervals.push(occurrence);
    cursor.setDate(cursor.getDate() + 1);
  }
  return intervals;
}

function assignmentFacilityName(assignment: StaffScheduleAssignment, field: Field, facility?: Facility) {
  const expanded = typeof field.facility === 'object' ? field.facility : null;
  return assignment.facilityName ?? facility?.name ?? expanded?.name ?? 'Unassigned facility';
}

function assignmentItemData(
  assignment: StaffScheduleAssignment, field: Field, facilitiesById: Map<string, Facility>,
): Omit<FacilityCalendarFeedItem, 'id' | 'start' | 'end'> {
  const type = assignment.assignmentKind === 'OFFICIAL_SHIFT' ? 'official_assignment' : 'staff_assignment';
  const facilityId = assignment.facilityId ?? getFieldFacilityId(field);
  return {
    type,
    title: assignmentTitle(assignment),
    facilityId,
    facilityName: assignmentFacilityName(assignment, field, facilitiesById.get(facilityId ?? '')),
    fieldId: field.$id,
    fieldName: assignment.fieldName ?? getFacilityScopedFieldDisplayName(field),
    sourceId: assignment.id,
    parentId: assignment.parentAssignmentId ?? null,
    userId: assignment.userId ?? null,
    staffMemberId: assignment.staffMemberId ?? null,
    status: assignment.status ?? null,
    source: assignment,
  };
}

function assignmentTitle(assignment: StaffScheduleAssignment) {
  return assignment.userName || (assignment.assignmentKind === 'OFFICIAL_SHIFT' ? 'Open official shift' : 'Open staff shift');
}

function expandStaffAssignment(
  assignment: StaffScheduleAssignment,
  fieldsById: Map<string, Field>,
  facilitiesById: Map<string, Facility>,
  range: PublicRentalInterval,
): FacilityCalendarFeedItem[] {
  const field = assignment.fieldId ? fieldsById.get(assignment.fieldId) : undefined;
  if (!field) return [];
  const item = assignmentItemData(assignment, field, facilitiesById);
  return staffIntervals(assignment, range).map((interval) => ({
    ...item, ...interval,
    id: `facility-calendar-staff-schedule-${assignment.id}-${field.$id}-${interval.start.getTime()}`,
  }));
}

function childCoverage(items: FacilityCalendarFeedItem[]) {
  const byParent = new Map<string, FacilityCalendarFeedItem[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const children = byParent.get(item.parentId) ?? [];
    children.push(item);
    byParent.set(item.parentId, children);
  }
  return byParent;
}

function uncoveredParentItems(item: FacilityCalendarFeedItem, children: FacilityCalendarFeedItem[]) {
  const covered = children.filter((child) => child.fieldId === item.fieldId && overlapsRange(child, item));
  if (!covered.length) return [item];
  return subtractIntervals(item, covered).map((gap) => ({
    ...item, ...gap,
    id: `${item.id}-open-gap-${gap.start.getTime()}-${gap.end.getTime()}`,
  }));
}

export function buildStaffScheduleCalendarItems({ assignments, fields, facilities, range }: ScheduleInput) {
  const fieldsById = new Map(fields.map((field) => [field.$id, field]));
  const facilitiesById = new Map(facilities.map((facility) => [facility.$id, facility]));
  const expand = (assignment: StaffScheduleAssignment) => expandStaffAssignment(assignment, fieldsById, facilitiesById, range);
  const children = assignments.filter((assignment) => Boolean(assignment.parentAssignmentId)).flatMap(expand);
  const coverageByParent = childCoverage(children);
  const parents = assignments.filter((assignment) => !assignment.parentAssignmentId).flatMap((assignment) => (
    expand(assignment).flatMap((item) => uncoveredParentItems(item, coverageByParent.get(assignment.id) ?? []))
  ));
  return [...parents, ...children];
}

type RepeatSettings = {
  repeating: boolean;
  days: number[];
  startMinutes: number;
  endMinutes: number;
  endDate: Date | null;
};

function rentalRepeatSettings(draft: ManagerCalendarDraft, start: Date, end: Date): RepeatSettings {
  const options = draft.rental ?? {};
  return {
    repeating: Boolean(options.repeating),
    days: normalizeDaysOfWeek(options.daysOfWeek, options.dayOfWeek ?? mondayDayOf(start)),
    startMinutes: typeof options.startTimeMinutes === 'number'
      ? options.startTimeMinutes : start.getHours() * 60 + start.getMinutes(),
    endMinutes: typeof options.endTimeMinutes === 'number'
      ? options.endTimeMinutes : end.getHours() * 60 + end.getMinutes(),
    endDate: toValidDate(options.endDate),
  };
}

function staffRepeatSettings(draft: ManagerCalendarDraft, start: Date, end: Date): RepeatSettings {
  const options = draft.staff ?? {};
  return {
    repeating: Boolean(options.repeating),
    days: normalizeDaysOfWeek(options.daysOfWeek, mondayDayOf(start)),
    startMinutes: start.getHours() * 60 + start.getMinutes(),
    endMinutes: end.getHours() * 60 + end.getMinutes(),
    endDate: toValidDate(options.repeatEndDate),
  };
}

function repeatingDraftIntervals(
  start: Date, range: PublicRentalInterval, settings: RepeatSettings,
): PublicRentalInterval[] {
  const lastDay = settings.endDate ? endOfDay(settings.endDate) : endOfDay(range.end);
  const cursor = new Date(Math.max(startOfDay(range.start).getTime(), startOfDay(start).getTime()));
  const cursorEnd = Math.min(endOfDay(range.end).getTime(), lastDay.getTime());
  const occurrences: PublicRentalInterval[] = [];
  while (cursor.getTime() <= cursorEnd) {
    if (settings.days.includes(mondayDayOf(cursor))) {
      const occurrence = {
        start: dateWithMinutes(cursor, settings.startMinutes),
        end: dateWithMinutes(cursor, settings.endMinutes),
      };
      if (occurrence.end > occurrence.start && overlapsRange(occurrence, range)) occurrences.push(occurrence);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return occurrences;
}

export function buildManagerCalendarDraftOccurrences(
  draft: ManagerCalendarDraft, rangeStart: Date, rangeEnd: Date,
): PublicRentalInterval[] {
  const start = new Date(draft.start);
  const end = new Date(draft.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
  const settings = draft.mode === 'rental' ? rentalRepeatSettings(draft, start, end) : staffRepeatSettings(draft, start, end);
  const range = { start: rangeStart, end: rangeEnd };
  if (!settings.repeating) return overlapsRange({ start, end }, range) ? [{ start, end }] : [];
  if (settings.endMinutes <= settings.startMinutes || !settings.days.length) return [];
  return repeatingDraftIntervals(start, range, settings);
}
