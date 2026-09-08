import type { Field } from '@/types';
import { prepareStaffCalendarRangeChange } from './facilityStaffRangeChanges';
import type { FacilityFeedCalendarEntry, StaffScheduleAssignment } from './facilityCalendarTypes';

const date = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute);
const court: Field = { $id: 'court-1', name: 'Court 1', location: '', lat: 0, long: 0, facilityId: 'facility-1' };
const otherCourt: Field = {
  ...court, $id: 'court-2', name: 'Court 2', facilityId: 'facility-2',
  facility: { $id: 'facility-2', organizationId: 'org-1', name: 'River Center', location: 'River Road' },
};
const parent: StaffScheduleAssignment = {
  id: 'parent-1', userName: 'Open staff shift', assignmentKind: 'STAFF_SHIFT',
  fieldId: court.$id, facilityId: court.facilityId, facilityName: 'Original Center',
  plannedStart: date(1, 9).toISOString(), plannedEnd: date(1, 17).toISOString(),
  timeSlot: {
    startDate: date(1, 9).toISOString(), endDate: date(30, 23).toISOString(),
    repeating: true, daysOfWeek: [1, 3], startTimeMinutes: 540, endTimeMinutes: 1020,
    timeZone: 'America/Los_Angeles',
  },
};

function eventFor(assignment: StaffScheduleAssignment): FacilityFeedCalendarEntry {
  const start = date(3, 9);
  const end = date(3, 17);
  return {
    id: 'event-1', title: assignment.userName, start, end, resourceId: court.$id, fieldName: court.name,
    metaType: 'facility-feed', feedType: 'staff_assignment',
    resource: {
      id: 'feed-1', title: assignment.userName, type: 'staff_assignment', start, end,
      facilityId: court.facilityId!, fieldId: court.$id, source: assignment,
    },
  };
}
function child(id: string, startHour: number, endHour: number): StaffScheduleAssignment {
  return {
    id, parentAssignmentId: parent.id, userId: 'user-1', userName: 'Casey Morgan', assignmentKind: 'STAFF_SHIFT',
    fieldId: court.$id, plannedStart: date(3, startHour).toISOString(), plannedEnd: date(3, endHour).toISOString(),
  };
}
function changeFor(assignment: StaffScheduleAssignment, start: Date, end: Date, resourceId?: string) {
  return { event: eventFor(assignment), start, end, resourceId };
}
function preparedChanges(result: ReturnType<typeof prepareStaffCalendarRangeChange>) {
  if (!result || 'error' in result) throw new Error('Expected prepared changes.');
  return result;
}

it('clips child coverage before the parent update and unassigns fully removed coverage', () => {
  const early = child('early', 9, 10);
  const overlap = child('overlap', 9, 12);
  const contained = child('contained', 12, 14);
  const late = child('late', 14, 17);
  const unrelated = { ...child('unrelated', 9, 17), parentAssignmentId: 'other-parent' };
  const result = preparedChanges(prepareStaffCalendarRangeChange(
    changeFor(parent, date(3, 10), date(3, 15)), [early, overlap, contained, late, unrelated, parent],
    [court, otherCourt], 'resize',
  ));
  expect(result.overrides.map((item) => item.assignmentId)).toEqual(['early', 'overlap', 'late', parent.id]);
  expect(result.overrides[0].override).toEqual({ action: 'unassign', assignmentId: 'early' });
  expect(result.overrides[1].override).toMatchObject({
    action: 'update', assignment: { plannedStart: date(3, 10).toISOString(), plannedEnd: date(3, 12).toISOString() },
  });
  expect(result.overrides[2].override).toMatchObject({
    action: 'update', assignment: { plannedStart: date(3, 14).toISOString(), plannedEnd: date(3, 15).toISOString() },
  });
  expect(result.overrides[3].override).toMatchObject({
    action: 'update', assignment: {
      plannedStart: date(1, 10).toISOString(), plannedEnd: date(1, 15).toISOString(),
      timeSlot: { ...parent.timeSlot, startTimeMinutes: 600, endTimeMinutes: 900 },
    },
  });
  expect(overlap.plannedStart).toBe(date(3, 9).toISOString());
  expect(parent.timeSlot?.startTimeMinutes).toBe(540);
});

it('does not expand child coverage when an open parent range expands', () => {
  const result = preparedChanges(prepareStaffCalendarRangeChange(
    changeFor(parent, date(3, 8), date(3, 18)), [parent, child('child-1', 10, 12)], [court], 'resize',
  ));
  expect(result.overrides).toHaveLength(1);
  expect(result.overrides[0]).toMatchObject({
    assignmentId: parent.id, override: { action: 'update', assignment: { plannedMinutes: 600 } },
  });
});

it.each([
  { start: date(3, 8), end: date(3, 10), assignments: [parent] },
  { start: date(3, 16), end: date(3, 18), assignments: [parent] },
  { start: date(2, 10), end: date(2, 12), assignments: [parent] },
  { start: date(3, 10), end: date(3, 12), assignments: [] },
])('rejects child coverage outside its parent occurrence', ({ start, end, assignments }) => {
  expect(prepareStaffCalendarRangeChange(
    changeFor(child('child-1', 10, 12), start, end), assignments, [court], 'move',
  )).toEqual({ error: { color: 'yellow', message: 'Assigned coverage must stay inside the parent shift.' } });
});

it('allows child coverage at the parent edges but keeps the parent resource', () => {
  const result = preparedChanges(prepareStaffCalendarRangeChange(
    changeFor(child('child-1', 10, 12), date(3, 9), date(3, 17), otherCourt.$id), [parent], [court, otherCourt], 'move',
  ));
  expect(result.overrides[0].override).toMatchObject({
    action: 'update', assignment: {
      fieldId: court.$id, parentAssignmentId: parent.id,
      plannedStart: date(3, 9).toISOString(), plannedEnd: date(3, 17).toISOString(),
    },
  });
});

it('moves an assigned series to the target resource without changing its repeat dates or pay', () => {
  const assignment = { ...parent, userId: 'user-1', userName: 'Casey Morgan', rateOverrideCents: 2500 };
  const result = preparedChanges(prepareStaffCalendarRangeChange(
    changeFor(assignment, date(3, 10), date(3, 12), ' court-2 '), [assignment], [court, otherCourt], 'move',
  ));
  expect(result.overrides[0].override).toMatchObject({
    action: 'update', assignment: {
      fieldId: otherCourt.$id, fieldName: 'River Center - Court 2', facilityId: otherCourt.facilityId,
      facilityName: 'River Center', rateOverrideCents: 2500,
      plannedStart: date(1, 10).toISOString(), plannedEnd: date(1, 12).toISOString(),
      timeSlot: { ...parent.timeSlot, startTimeMinutes: 600, endTimeMinutes: 720 },
    },
  });
  expect(assignment.fieldId).toBe(court.$id);
});

it('retains resource identity when the target is unknown and keeps the existing facility name without an expanded facility', () => {
  const unknown = preparedChanges(prepareStaffCalendarRangeChange(
    changeFor(parent, date(3, 10), date(3, 12), 'missing'), [], [court], 'move',
  ));
  expect(unknown.overrides[0].override).toMatchObject({ assignment: { fieldId: court.$id } });
  const unexpanded = { ...otherCourt, facility: undefined };
  const moved = preparedChanges(prepareStaffCalendarRangeChange(
    changeFor(parent, date(3, 10), date(3, 12), otherCourt.$id), [], [court, unexpanded], 'move',
  ));
  expect(moved.overrides[0].override).toMatchObject({
    assignment: { fieldId: otherCourt.$id, facilityId: otherCourt.facilityId, facilityName: 'Original Center' },
  });
});

it.each([
  { start: new Date('invalid'), end: date(3, 12) },
  { start: date(3, 10), end: new Date('invalid') },
])('skips invalid calendar dates without preparing a write', ({ start, end }) => {
  expect(prepareStaffCalendarRangeChange(changeFor(parent, start, end), [], [court], 'move')).toBeNull();
});

it('rejects invalid ranges and skips a missing source identity', () => {
  expect(prepareStaffCalendarRangeChange(
    changeFor(parent, date(3, 12), date(3, 10)), [], [court], 'move',
  )).toEqual({ error: { color: 'red', message: 'Unable to move this staff assignment.' } });
  expect(prepareStaffCalendarRangeChange(
    changeFor(parent, date(3, 22), date(4, 1)), [], [court], 'resize',
  )).toEqual({ error: { color: 'red', message: 'Unable to resize this staff assignment.' } });
  expect(prepareStaffCalendarRangeChange(
    changeFor({ ...parent, id: '' }, date(3, 10), date(3, 12)), [], [court], 'move',
  )).toBeNull();
});
