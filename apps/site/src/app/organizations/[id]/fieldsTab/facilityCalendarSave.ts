import type { Field, TimeSlot } from '@/types';
import { isWithinOneLocalDay } from './facilityCalendarRangeLimits';
import { apiRequest } from '@/lib/apiClient';
import { fieldService } from '@/lib/fieldService';
import { formatLocalDateTime } from '@/lib/dateUtils';
import { normalizeFieldIds } from './facilityFormUtils';
import { getFieldFacilityId } from './facilityCalendarResources';
import { buildStaffScheduleTimeSlotPayload, mondayDayOf } from './facilityCalendarRanges';
import type {
  ManagerCalendarDraft, ManagerRentalSlotPendingUpdate, ManagerStaffAssignmentPendingOverride,
  StaffScheduleAssignment, StaffScheduleCreateResponse, StaffScheduleUpdateResponse,
} from './facilityCalendarTypes';

type SaveInput = {
  organizationId: string;
  fields: Field[];
  staffAssignments: StaffScheduleAssignment[];
  drafts: ManagerCalendarDraft[];
  rentalUpdates: Record<string, ManagerRentalSlotPendingUpdate>;
  staffOverrides: Record<string, ManagerStaffAssignmentPendingOverride>;
};

export type FacilityCalendarSaveResult = {
  updatedRentalFields: Field[];
  createdAssignments: StaffScheduleAssignment[];
  updatedAssignments: StaffScheduleAssignment[];
  removedAssignmentIds: Set<string>;
  deletedParentAssignmentIds: Set<string>;
};

type SaveContext = {
  input: SaveInput;
  fieldById: Map<string, Field>;
  createdDraftAssignmentIds: Map<string, string>;
  result: FacilityCalendarSaveResult;
};
type DraftRange = {
  start: Date;
  end: Date;
  dayOfWeek: NonNullable<TimeSlot['dayOfWeek']>;
  startTimeMinutes: number;
  endTimeMinutes: number;
};

function draftFieldsAndRange(draft: ManagerCalendarDraft, fieldById: Map<string, Field>) {
  const fields = normalizeFieldIds(draft.fieldIds).map((id) => fieldById.get(id))
    .filter((field): field is Field => Boolean(field));
  if (!fields.length) throw new Error('One draft no longer has a valid resource.');
  const start = new Date(draft.start);
  const end = new Date(draft.end);
  if (end.getTime() <= start.getTime()) throw new Error('A draft has an invalid end time.');
  if (!isWithinOneLocalDay(start, end)) throw new Error('Drafts must not exceed one local day.');
  const range: DraftRange = {
    start, end, dayOfWeek: mondayDayOf(start) as NonNullable<TimeSlot['dayOfWeek']>,
    startTimeMinutes: start.getHours() * 60 + start.getMinutes(),
    endTimeMinutes: end.getHours() * 60 + end.getMinutes(),
  };
  return { fields, range };
}

function rentalDays(days: number[] | undefined, dayOfWeek: DraftRange['dayOfWeek']) {
  const validDays = Array.isArray(days)
    ? days.filter((day): day is NonNullable<TimeSlot['dayOfWeek']> => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  return validDays.length ? validDays : [dayOfWeek];
}

function rentalDraftSchedule(draft: ManagerCalendarDraft, range: DraftRange) {
  const rental = draft.rental ?? {};
  const repeating = Boolean(rental.repeating);
  return {
    dayOfWeek: rental.dayOfWeek ?? range.dayOfWeek,
    daysOfWeek: rentalDays(rental.daysOfWeek, range.dayOfWeek),
    repeating,
    startDate: rental.startDate ?? formatLocalDateTime(range.start),
    endDate: rental.endDate ?? (repeating ? null : formatLocalDateTime(range.end)),
    startTimeMinutes: rental.startTimeMinutes ?? range.startTimeMinutes,
    endTimeMinutes: rental.endTimeMinutes ?? range.endTimeMinutes,
  };
}

function rentalDraftCosts(draft: ManagerCalendarDraft) {
  const rental = draft.rental ?? {};
  return {
    price: rental.price ?? 0,
    requiredTemplateIds: rental.requiredTemplateIds ?? [],
    hostRequiredTemplateIds: rental.hostRequiredTemplateIds ?? [],
  };
}

async function saveRentalDraft(context: SaveContext, draft: ManagerCalendarDraft, fields: Field[], range: DraftRange) {
  const schedule = rentalDraftSchedule(draft, range);
  const costs = rentalDraftCosts(draft);
  const results = await Promise.all(fields.map((field) => fieldService.createRentalSlot(field, {
    ...schedule, scheduledFieldId: field.$id, scheduledFieldIds: [field.$id], ...costs,
  })));
  context.result.updatedRentalFields.push(...results.map((result) => result.field));
}

function staffDraftSchedule(draft: ManagerCalendarDraft, range: DraftRange) {
  const staff = draft.staff ?? {};
  const repeating = Boolean(staff.repeating);
  return {
    startDate: range.start.toISOString(),
    endDate: repeating ? staff.repeatEndDate ?? null : range.end.toISOString(),
    repeating,
    daysOfWeek: Array.isArray(staff.daysOfWeek) && staff.daysOfWeek.length ? staff.daysOfWeek : [range.dayOfWeek],
    startTimeMinutes: range.startTimeMinutes,
    endTimeMinutes: range.endTimeMinutes,
  };
}

function rateOverride(amount: number | null | undefined) {
  return { rateOverrideType: amount ? 'HOURLY' : null, rateOverrideCents: amount ?? null };
}

function draftParentAssignmentId(context: SaveContext, parentDraftId: string | null, fieldId: string) {
  const parentId = parentDraftId ? context.createdDraftAssignmentIds.get(`${parentDraftId}:${fieldId}`) ?? null : null;
  if (parentDraftId && !parentId) {
    throw new Error('One draft child assignment no longer has a saved parent assignment.');
  }
  return parentId;
}

function staffDraftBody(draft: ManagerCalendarDraft, field: Field, range: DraftRange, parentAssignmentId: string | null) {
  const staff = draft.staff ?? {};
  return {
    parentAssignmentId, userId: staff.userId || null,
    assignmentKind: draft.mode === 'official_assignment' ? 'OFFICIAL_SHIFT' : 'STAFF_SHIFT',
    facilityId: getFieldFacilityId(field), fieldId: field.$id,
    ...rateOverride(staff.rateOverrideCents), notes: staff.notes ?? '',
    timeSlot: staffDraftSchedule(draft, range),
  };
}

async function saveStaffDraft(context: SaveContext, draft: ManagerCalendarDraft, fields: Field[], range: DraftRange) {
  const parentDraftId = draft.staff?.parentDraftId ?? null;
  const results = await Promise.all(fields.map(async (field) => {
    const parentId = draftParentAssignmentId(context, parentDraftId, field.$id);
    const response = await apiRequest<StaffScheduleCreateResponse>(
      `/api/organizations/${context.input.organizationId}/staff/schedule`,
      { method: 'POST', body: staffDraftBody(draft, field, range, parentId) },
    );
    if (response.assignment && !parentDraftId) {
      context.createdDraftAssignmentIds.set(`${draft.id}:${field.$id}`, response.assignment.id);
    }
    return response.assignment ?? null;
  }));
  context.result.createdAssignments.push(...results.filter((assignment): assignment is StaffScheduleAssignment => Boolean(assignment)));
}

function orderedDrafts(drafts: ManagerCalendarDraft[]) {
  return [...drafts].sort((left, right) => {
    const leftIsChild = Boolean(left.staff?.parentDraftId);
    const rightIsChild = Boolean(right.staff?.parentDraftId);
    if (leftIsChild === rightIsChild) return 0;
    return leftIsChild ? 1 : -1;
  });
}

async function saveDrafts(context: SaveContext) {
  for (const draft of orderedDrafts(context.input.drafts)) {
    const { fields, range } = draftFieldsAndRange(draft, context.fieldById);
    if (draft.mode === 'rental') await saveRentalDraft(context, draft, fields, range);
    else await saveStaffDraft(context, draft, fields, range);
  }
}

async function saveRentalUpdates(context: SaveContext) {
  for (const update of Object.values(context.input.rentalUpdates)) {
    const field = context.fieldById.get(update.fieldId);
    if (!field) throw new Error('One rental slot no longer has a valid resource.');
    const result = update.action === 'delete'
      ? { field: await fieldService.deleteRentalSlot(field, update.slotId) }
      : await fieldService.updateRentalSlot(field, update.slot);
    context.result.updatedRentalFields.push(result.field);
  }
}

function overrideRank(id: string, override: ManagerStaffAssignmentPendingOverride, assignments: StaffScheduleAssignment[]) {
  if (override.action === 'create') return override.assignment.parentAssignmentId ? 2 : 3;
  if (override.action === 'unassign') return 0;
  if (override.action === 'delete') return 1;
  if (override.assignment.parentAssignmentId) return 2;
  return assignments.find((assignment) => assignment.id === id)?.parentAssignmentId ? 2 : 3;
}

function orderedOverrides(input: SaveInput) {
  return Object.entries(input.staffOverrides).sort(([leftId, left], [rightId, right]) => (
    overrideRank(leftId, left, input.staffAssignments) - overrideRank(rightId, right, input.staffAssignments)
  ));
}

function assignmentTimeSlot(assignment: StaffScheduleAssignment) {
  const timeSlot = buildStaffScheduleTimeSlotPayload(assignment.timeSlot);
  return timeSlot ? { timeSlot } : {};
}

function assignmentBody(assignment: StaffScheduleAssignment) {
  return {
    userId: assignment.userId || null, facilityId: assignment.facilityId || null, fieldId: assignment.fieldId || null,
    ...rateOverride(assignment.rateOverrideCents), notes: assignment.notes ?? '', ...assignmentTimeSlot(assignment),
  };
}

async function createAssignmentOverride(context: SaveContext, assignment: StaffScheduleAssignment) {
  const response = await apiRequest<StaffScheduleCreateResponse>(
    `/api/organizations/${context.input.organizationId}/staff/schedule`,
    {
      method: 'POST',
      body: {
        parentAssignmentId: assignment.parentAssignmentId ?? null,
        assignmentKind: assignment.assignmentKind, ...assignmentBody(assignment),
      },
    },
  );
  if (response.assignment) context.result.createdAssignments.push(response.assignment);
}

async function updateAssignmentOverride(context: SaveContext, id: string, assignment: StaffScheduleAssignment) {
  const body = assignment.parentAssignmentId
    ? { ...rateOverride(assignment.rateOverrideCents), ...assignmentTimeSlot(assignment) }
    : assignmentBody(assignment);
  const response = await apiRequest<StaffScheduleUpdateResponse>(
    `/api/organizations/${context.input.organizationId}/staff/schedule/${id}`, { method: 'PATCH', body },
  );
  if (response.assignment) context.result.updatedAssignments.push(response.assignment);
}

async function removeAssignmentOverride(context: SaveContext, id: string, unassign: boolean) {
  const path = `/api/organizations/${context.input.organizationId}/staff/schedule/${id}`;
  if (unassign) {
    await apiRequest<StaffScheduleUpdateResponse>(path, { method: 'PATCH', body: { action: 'UNASSIGN' } });
  } else {
    await apiRequest<{ id: string; deleted: boolean }>(path, { method: 'DELETE' });
    context.result.deletedParentAssignmentIds.add(id);
  }
  context.result.removedAssignmentIds.add(id);
}

async function saveStaffOverrides(context: SaveContext) {
  for (const [id, override] of orderedOverrides(context.input)) {
    if (override.action === 'create') await createAssignmentOverride(context, override.assignment);
    else if (override.action === 'update') await updateAssignmentOverride(context, id, override.assignment);
    else await removeAssignmentOverride(context, id, override.action === 'unassign');
  }
}

export async function saveFacilityCalendarChanges(input: SaveInput): Promise<FacilityCalendarSaveResult> {
  const context: SaveContext = {
    input, fieldById: new Map(input.fields.map((field) => [field.$id, field])), createdDraftAssignmentIds: new Map(),
    result: {
      updatedRentalFields: [], createdAssignments: [], updatedAssignments: [],
      removedAssignmentIds: new Set(), deletedParentAssignmentIds: new Set(),
    },
  };
  await saveDrafts(context);
  await saveRentalUpdates(context);
  await saveStaffOverrides(context);
  return context.result;
}
