import { buildManagerCalendarDraftOccurrences, buildStaffScheduleCalendarItems } from './facilityCalendarOccurrences';
import { mergePublicRentalIntervals, subtractIntervals } from './facilityCalendarIntervals';
import { getPreviousStaffAssignmentOccurrenceRange } from './facilityStaffOccurrences';
import type { Facility, Field } from '@/types';
import type { ManagerCalendarDraft, StaffScheduleAssignment } from './facilityCalendarTypes';

const date = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute);
const interval = (day: number, startHour: number, endHour: number) => ({
  start: date(day, startHour), end: date(day, endHour),
});
const facility: Facility = { $id: 'facility-1', organizationId: 'org-1', name: 'River City Center', location: 'River Road' };
const court: Field = { $id: 'court-1', name: 'Court 1', location: '', lat: 0, long: 0, facilityId: facility.$id };
const parent: StaffScheduleAssignment = {
  id: 'parent-1', userName: '', assignmentKind: 'STAFF_SHIFT', fieldId: court.$id,
  timeSlot: {
    repeating: true, startDate: date(1, 9).toISOString(), endDate: date(4).toISOString(),
    daysOfWeek: [1, 3], startTimeMinutes: 540, endTimeMinutes: 720,
  },
};
const draft: ManagerCalendarDraft = {
  id: 'draft-1', mode: 'staff_assignment', fieldIds: [court.$id],
  start: date(1, 9), end: date(1, 10),
  staff: { repeating: true, daysOfWeek: [1, 3], repeatEndDate: date(3).toISOString() },
};
function calendar(assignments: StaffScheduleAssignment[]) {
  return buildStaffScheduleCalendarItems({
    assignments, fields: [court, { ...court, $id: 'court-2', name: 'Court 2' }],
    facilities: [facility], range: { start: date(1), end: date(6) },
  });
}
function child(id: string, startHour: number, endHour: number, fieldId = court.$id): StaffScheduleAssignment {
  return {
    id, parentAssignmentId: parent.id, userName: 'Casey Morgan', userId: 'user-1',
    assignmentKind: 'STAFF_SHIFT', fieldId, status: 'PLANNED',
    plannedStart: date(1, startHour).toISOString(), plannedEnd: date(1, endHour).toISOString(),
  };
}

it('merges touching intervals, clips blockers, and returns independent uncovered dates', () => {
  const base = interval(1, 8, 16);
  const blockers = [interval(1, 7, 9), interval(1, 10, 11), interval(1, 11, 13), interval(1, 12, 14), interval(1, 16, 17)];
  expect(mergePublicRentalIntervals(blockers)).toEqual([
    interval(1, 7, 9), interval(1, 10, 14), interval(1, 16, 17),
  ]);
  const gaps = subtractIntervals(base, blockers);
  expect(gaps).toEqual([interval(1, 9, 10), interval(1, 14, 16)]);
  gaps[0].start.setHours(0);
  expect(base.start).toEqual(date(1, 8));
  expect(blockers[0].end).toEqual(date(1, 9));
  expect(subtractIntervals(base, [interval(1, 7, 17)])).toEqual([]);
  expect(subtractIntervals(base, [interval(1, 16, 17)])).toEqual([base]);
});

it('expands staff drafts only on selected days through the inclusive repeat end date', () => {
  expect(buildManagerCalendarDraftOccurrences(draft, date(0), date(8))).toEqual([
    interval(1, 9, 10), interval(3, 9, 10),
  ]);
  expect(buildManagerCalendarDraftOccurrences(draft, date(3, 10), date(8))).toEqual([]);
  expect(draft.start).toEqual(date(1, 9));
  expect(draft.staff).toEqual({ repeating: true, daysOfWeek: [1, 3], repeatEndDate: date(3).toISOString() });
});

it('uses rental clock overrides and removes duplicate repeat days', () => {
  const rental: ManagerCalendarDraft = {
    ...draft, mode: 'rental', staff: undefined,
    rental: { repeating: true, daysOfWeek: [1, 3, 3], startTimeMinutes: 480, endTimeMinutes: 660, endDate: date(3).toISOString() },
  };
  expect(buildManagerCalendarDraftOccurrences(rental, date(1), date(8))).toEqual([
    interval(1, 8, 11), interval(3, 8, 11),
  ]);
});

it('uses the seed weekday and the view end when repeat options omit those limits', () => {
  const rental: ManagerCalendarDraft = { ...draft, mode: 'rental', rental: { repeating: true } };
  expect(buildManagerCalendarDraftOccurrences(rental, date(0), date(9))).toEqual([
    interval(1, 9, 10), interval(8, 9, 10),
  ]);
});

it('keeps one-off overnight drafts whole when they overlap the visible range', () => {
  const overnight: ManagerCalendarDraft = { ...draft, start: date(1, 23), end: date(2, 1), staff: {} };
  expect(buildManagerCalendarDraftOccurrences(overnight, date(2), date(3))).toEqual([
    { start: date(1, 23), end: date(2, 1) },
  ]);
  expect(buildManagerCalendarDraftOccurrences(overnight, date(2, 1), date(3))).toEqual([]);
});

it.each([
  { start: new Date('invalid') },
  { end: date(1, 9) },
  { end: date(1, 8) },
  { staff: { repeating: true, daysOfWeek: [-1] } },
  { mode: 'rental' as const, rental: { repeating: true, startTimeMinutes: 600, endTimeMinutes: 540 } },
])('rejects invalid draft dates, days, and clock ranges', (changes) => {
  expect(buildManagerCalendarDraftOccurrences({ ...draft, ...changes }, date(0), date(8))).toEqual([]);
});

it('subtracts overlapping child coverage on the same resource without losing other open days', () => {
  const entries = calendar([parent, child('child-1', 10, 11), child('child-2', 10, 12), child('other-court', 9, 12, 'court-2')]);
  const open = entries.filter((entry) => entry.sourceId === parent.id);
  expect(open.map(({ start, end }) => ({ start, end }))).toEqual([interval(1, 9, 10), interval(3, 9, 12)]);
  expect(open.map((entry) => entry.id)).toEqual([
    `facility-calendar-staff-schedule-parent-1-court-1-${date(1, 9).getTime()}-open-gap-${date(1, 9).getTime()}-${date(1, 10).getTime()}`,
    `facility-calendar-staff-schedule-parent-1-court-1-${date(3, 9).getTime()}`,
  ]);
  expect(entries.filter((entry) => entry.parentId === parent.id)).toHaveLength(3);
  expect(open[0]).toMatchObject({ title: 'Open staff shift', facilityName: facility.name, fieldId: court.$id });
  expect(parent.timeSlot?.endTimeMinutes).toBe(720);
});

it('keeps source identity and official labels and skips entries without a valid resource or range', () => {
  const official: StaffScheduleAssignment = {
    ...child('official-1', 10, 11), parentAssignmentId: null, assignmentKind: 'OFFICIAL_SHIFT',
    userName: '', facilityName: 'Saved facility name', fieldName: 'Saved resource name',
  };
  const entries = calendar([
    official, { ...official, id: 'no-resource', fieldId: 'missing' },
    { ...official, id: 'invalid', plannedEnd: 'invalid' },
  ]);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    sourceId: official.id, source: official, title: 'Open official shift', type: 'official_assignment',
    facilityName: 'Saved facility name', fieldName: 'Saved resource name', status: 'PLANNED', userId: 'user-1',
  });
});

it('uses the saved start weekday and planned duration when staff repeat options omit clock values', () => {
  const assignment: StaffScheduleAssignment = {
    ...parent, plannedMinutes: 15,
    timeSlot: { repeating: true, startDate: date(1, 9).toISOString(), endDate: date(8).toISOString() },
  };
  expect(calendar([assignment]).map(({ start, end }) => ({ start, end }))).toEqual([
    { start: date(1, 9), end: date(1, 9, 30) },
  ]);
});

it('finds the preceding occurrence without crossing the series start or end', () => {
  expect(getPreviousStaffAssignmentOccurrenceRange(parent, date(3, 9))).toEqual(interval(1, 9, 12));
  expect(getPreviousStaffAssignmentOccurrenceRange(parent, date(3, 10))).toEqual(interval(3, 9, 12));
  expect(getPreviousStaffAssignmentOccurrenceRange(parent, date(8))).toEqual(interval(3, 9, 12));
  expect(getPreviousStaffAssignmentOccurrenceRange(parent, date(1, 9))).toBeNull();
  expect(getPreviousStaffAssignmentOccurrenceRange(child('one-off', 9, 10), date(2))).toBeNull();
});

it('rejects an invalid repeating staff clock range in lookup and feed expansion', () => {
  const invalid: StaffScheduleAssignment = {
    ...parent, timeSlot: { ...parent.timeSlot!, startTimeMinutes: 720, endTimeMinutes: 540 },
  };
  expect(getPreviousStaffAssignmentOccurrenceRange(invalid, date(8))).toBeNull();
  expect(calendar([invalid])).toEqual([]);
});
