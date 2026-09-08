import { saveFacilityCalendarChanges } from './facilityCalendarSave';
import type { Field } from '@/types';
import type { ManagerCalendarDraft, StaffScheduleAssignment } from './facilityCalendarTypes';

const apiMock = jest.fn();
const createRentalMock = jest.fn();
const updateRentalMock = jest.fn();
const deleteRentalMock = jest.fn();
jest.mock('@/lib/apiClient', () => ({ apiRequest: (...args: unknown[]) => apiMock(...args) }));
jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    createRentalSlot: (...args: unknown[]) => createRentalMock(...args),
    updateRentalSlot: (...args: unknown[]) => updateRentalMock(...args),
    deleteRentalSlot: (...args: unknown[]) => deleteRentalMock(...args),
  },
}));

const start = new Date(2026, 8, 8, 10);
const end = new Date(2026, 8, 8, 11);
const court: Field = { $id: 'court-1', name: 'Court 1', location: '', lat: 0, long: 0, facilityId: 'facility-1' };
const secondCourt: Field = { ...court, $id: 'court-2', name: 'Court 2' };
const assignment: StaffScheduleAssignment = {
  id: 'assignment-1', userName: 'Casey Morgan', userId: 'user-1', assignmentKind: 'STAFF_SHIFT',
  fieldId: court.$id, facilityId: court.facilityId, rateOverrideCents: 2500, notes: 'Gate coverage',
  timeSlot: { repeating: false, startDate: start.toISOString(), endDate: end.toISOString() },
};
const draft: ManagerCalendarDraft = {
  id: 'draft-1', mode: 'official_assignment', fieldIds: [court.$id], start, end,
  staff: { userId: 'user-1', rateOverrideCents: 2500, notes: 'Court coverage' },
};

function input(overrides: Partial<Parameters<typeof saveFacilityCalendarChanges>[0]> = {}) {
  return {
    organizationId: 'org-1', fields: [court, secondCourt], staffAssignments: [], drafts: [],
    rentalUpdates: {}, staffOverrides: {}, ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.mockReset().mockResolvedValue({ assignment });
  createRentalMock.mockReset().mockImplementation(async (field: Field) => ({ field: { ...field, name: 'Created slot' } }));
  updateRentalMock.mockReset().mockImplementation(async (field: Field) => ({ field: { ...field, name: 'Updated slot' } }));
  deleteRentalMock.mockReset().mockImplementation(async (field: Field) => ({ ...field, name: 'Deleted slot' }));
});

it('waits for each parent draft before saving child drafts and links each child to its resource parent', async () => {
  let releaseParent!: () => void;
  const parentGate = new Promise<void>((resolve) => { releaseParent = resolve; });
  apiMock.mockImplementation(async (_path: string, { body }) => {
    if (!body.parentAssignmentId && body.fieldId === court.$id) await parentGate;
    const prefix = body.parentAssignmentId ? 'child' : 'parent';
    return { assignment: { ...assignment, id: `${prefix}-${body.fieldId}`, ...body } };
  });
  const parent: ManagerCalendarDraft = { ...draft, id: 'parent-draft', fieldIds: [court.$id, secondCourt.$id, court.$id], staff: {} };
  const child: ManagerCalendarDraft = { ...draft, id: 'child-draft', fieldIds: [court.$id, secondCourt.$id], staff: { ...draft.staff, parentDraftId: parent.id } };
  const source = input({ drafts: [child, parent] });
  const before = JSON.stringify(source);
  const pending = saveFacilityCalendarChanges(source);
  expect(apiMock).toHaveBeenCalledTimes(2);
  expect(apiMock.mock.calls.map(([, options]) => options.body.parentAssignmentId)).toEqual([null, null]);
  releaseParent();
  const result = await pending;
  expect(apiMock.mock.calls.map(([, options]) => options.body.parentAssignmentId)).toEqual([
    null, null, 'parent-court-1', 'parent-court-2',
  ]);
  expect(apiMock.mock.calls[2][1].body).toMatchObject({
    parentAssignmentId: 'parent-court-1', fieldId: court.$id, facilityId: court.facilityId,
    assignmentKind: 'OFFICIAL_SHIFT', userId: 'user-1', rateOverrideType: 'HOURLY', rateOverrideCents: 2500,
    notes: 'Court coverage',
    timeSlot: {
      startDate: start.toISOString(), endDate: end.toISOString(), repeating: false,
      daysOfWeek: [1], startTimeMinutes: 600, endTimeMinutes: 660,
    },
  });
  expect(result.createdAssignments.map((value) => value.id)).toEqual([
    'parent-court-1', 'parent-court-2', 'child-court-1', 'child-court-2',
  ]);
  expect(JSON.stringify(source)).toBe(before);
});

it('preserves rental dates, clock overrides, price, document requirements, and duplicate valid repeat days', async () => {
  const rental: ManagerCalendarDraft = {
    ...draft, mode: 'rental', fieldIds: [court.$id, secondCourt.$id], staff: undefined,
    rental: {
      repeating: true, dayOfWeek: 4, daysOfWeek: [1, 99, 1, -1], startDate: '2026-09-01T00:00:00',
      endDate: '2026-09-30T23:59:59', startTimeMinutes: 540, endTimeMinutes: 720, price: 4200,
      requiredTemplateIds: ['waiver'], hostRequiredTemplateIds: ['host-waiver'],
    },
  };
  const result = await saveFacilityCalendarChanges(input({ drafts: [rental] }));
  expect(createRentalMock).toHaveBeenCalledTimes(2);
  expect(createRentalMock.mock.calls[0]).toEqual([court, {
    dayOfWeek: 4, daysOfWeek: [1, 1], repeating: true,
    startDate: '2026-09-01T00:00:00', endDate: '2026-09-30T23:59:59',
    startTimeMinutes: 540, endTimeMinutes: 720, price: 4200,
    scheduledFieldId: court.$id, scheduledFieldIds: [court.$id],
    requiredTemplateIds: ['waiver'], hostRequiredTemplateIds: ['host-waiver'],
  }]);
  expect(createRentalMock.mock.calls[1][1].scheduledFieldIds).toEqual([secondCourt.$id]);
  expect(result.updatedRentalFields.map((value) => value.$id)).toEqual([court.$id, secondCourt.$id]);
  expect(apiMock).not.toHaveBeenCalled();
});

it('keeps default rental values and saves pending rental edits before staff overrides', async () => {
  const operations: string[] = [];
  createRentalMock.mockImplementation(async (field) => { operations.push('create rental'); return { field }; });
  updateRentalMock.mockImplementation(async (field) => { operations.push('update rental'); return { field }; });
  deleteRentalMock.mockImplementation(async (field) => { operations.push('delete rental'); return field; });
  apiMock.mockImplementation(async () => { operations.push('staff'); return { assignment }; });
  await saveFacilityCalendarChanges(input({
    drafts: [{ ...draft, mode: 'rental', rental: { daysOfWeek: [99] } }],
    rentalUpdates: {
      edit: { key: 'edit', action: 'update', fieldId: court.$id, slotId: 'slot-1', slot: { $id: 'slot-1', dayOfWeek: 1 } },
      remove: { key: 'remove', action: 'delete', fieldId: secondCourt.$id, slotId: 'slot-2' },
    },
    staffOverrides: { update: { action: 'update', assignment } },
  }));
  expect(operations).toEqual(['create rental', 'update rental', 'delete rental', 'staff']);
  expect(createRentalMock.mock.calls[0][1]).toMatchObject({
    dayOfWeek: 1, daysOfWeek: [1], repeating: false, startDate: '2026-09-08T10:00:00',
    endDate: '2026-09-08T11:00:00', startTimeMinutes: 600, endTimeMinutes: 660,
    price: 0, requiredTemplateIds: [], hostRequiredTemplateIds: [],
  });
  expect(deleteRentalMock).toHaveBeenCalledWith(secondCourt, 'slot-2');
});

it('orders unassignments and deletions before child and parent overrides and limits child patch fields', async () => {
  const child = { ...assignment, id: 'child', parentAssignmentId: 'parent' };
  const result = await saveFacilityCalendarChanges(input({
    staffAssignments: [{ ...child, id: 'source-child' }],
    staffOverrides: {
      parent: { action: 'update', assignment },
      createParent: { action: 'create', assignment },
      'source-child': { action: 'update', assignment: { ...assignment, id: 'source-child' } },
      child: { action: 'update', assignment: child },
      createChild: { action: 'create', assignment: child },
      delete: { action: 'delete', assignmentId: 'delete' },
      unassign: { action: 'unassign', assignmentId: 'unassign' },
    },
  }));
  expect(apiMock.mock.calls.map(([path, options]) => [path.split('/').pop(), options.method])).toEqual([
    ['unassign', 'PATCH'], ['delete', 'DELETE'], ['source-child', 'PATCH'], ['child', 'PATCH'],
    ['schedule', 'POST'], ['parent', 'PATCH'], ['schedule', 'POST'],
  ]);
  expect(apiMock.mock.calls[0][1].body).toEqual({ action: 'UNASSIGN' });
  expect(apiMock.mock.calls[3][1].body).toEqual({
    rateOverrideType: 'HOURLY', rateOverrideCents: 2500,
    timeSlot: {
      startDate: start.toISOString(), endDate: end.toISOString(), repeating: false,
      daysOfWeek: null, startTimeMinutes: null, endTimeMinutes: null, timeZone: null,
    },
  });
  expect(apiMock.mock.calls[4][1].body).toMatchObject({
    parentAssignmentId: 'parent', userId: assignment.userId, assignmentKind: 'STAFF_SHIFT',
    fieldId: court.$id, facilityId: court.facilityId, notes: 'Gate coverage',
  });
  expect(result.removedAssignmentIds).toEqual(new Set(['unassign', 'delete']));
  expect(result.deletedParentAssignmentIds).toEqual(new Set(['delete']));
  expect(result.createdAssignments).toHaveLength(2);
  expect(result.updatedAssignments).toHaveLength(3);
});

it('omits missing timeslots and retains null rate values in assignment requests', async () => {
  apiMock.mockResolvedValue({});
  const noSlot = { ...assignment, timeSlot: null, rateOverrideCents: null, userId: null, notes: null };
  const result = await saveFacilityCalendarChanges(input({
    staffOverrides: { create: { action: 'create', assignment: noSlot }, update: { action: 'update', assignment: noSlot } },
  }));
  expect(apiMock.mock.calls[0][1].body).not.toHaveProperty('timeSlot');
  expect(apiMock.mock.calls[0][1].body).toMatchObject({
    parentAssignmentId: null, userId: null, rateOverrideType: null, rateOverrideCents: null, notes: '',
  });
  expect(result.createdAssignments).toEqual([]);
  expect(result.updatedAssignments).toEqual([]);
});

it.each([
  { change: { ...draft, fieldIds: ['missing'] }, error: 'One draft no longer has a valid resource.' },
  { change: { ...draft, end: start }, error: 'A draft has an invalid end time.' },
  { change: { ...draft, end: new Date(2026, 8, 9, 11) }, error: 'Drafts must stay within a single day.' },
])('rejects an invalid first draft before any write', async ({ change, error }) => {
  await expect(saveFacilityCalendarChanges(input({ drafts: [change] }))).rejects.toThrow(error);
  expect(apiMock).not.toHaveBeenCalled();
  expect(createRentalMock).not.toHaveBeenCalled();
});

it('rejects a child draft whose resource parent was not returned', async () => {
  apiMock.mockResolvedValue({});
  await expect(saveFacilityCalendarChanges(input({
    drafts: [draft, { ...draft, id: 'child', staff: { parentDraftId: draft.id } }],
  }))).rejects.toThrow('One draft child assignment no longer has a saved parent assignment.');
  expect(apiMock).toHaveBeenCalledTimes(1);
});

it('propagates a later request failure without starting the remaining staff writes', async () => {
  updateRentalMock.mockRejectedValue(new Error('Rental update failed'));
  await expect(saveFacilityCalendarChanges(input({
    drafts: [{ ...draft, mode: 'rental' }],
    rentalUpdates: { update: { key: 'update', action: 'update', fieldId: court.$id, slotId: 'slot-1', slot: { $id: 'slot-1', dayOfWeek: 1 } } },
    staffOverrides: { create: { action: 'create', assignment } },
  }))).rejects.toThrow('Rental update failed');
  expect(createRentalMock).toHaveBeenCalledTimes(1);
  expect(updateRentalMock).toHaveBeenCalledTimes(1);
  expect(apiMock).not.toHaveBeenCalled();
});

it('rejects a pending rental edit when its resource is missing', async () => {
  await expect(saveFacilityCalendarChanges(input({
    rentalUpdates: { remove: { key: 'remove', action: 'delete', fieldId: 'missing', slotId: 'slot-1' } },
  }))).rejects.toThrow('One rental slot no longer has a valid resource.');
  expect(deleteRentalMock).not.toHaveBeenCalled();
});
