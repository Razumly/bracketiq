"use client";

import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@/components/organization/organization-operation-ui';
import type { View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { addHours, differenceInCalendarDays, endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import Loading from '@/components/ui/Loading';
import type { Facility, Field, Organization, TimeSlot, UserData } from '@/types';
import { formatPrice } from '@/types';
import {
  buildFacilityCalendarFeed,
  buildFieldCalendarEvents,
  type FacilityCalendarFeedItem,
  type FacilityCalendarFeedItemType,
  type FieldCalendarEntry,
} from './fieldCalendar';
import { resolveFieldIdsForCalendarHydration } from './fieldCalendarHydration';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFacilityScopedFieldDisplayName, getFieldResolvedLocation, sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import { notifications } from '@/lib/organizationNotifications';
import { organizationService } from '@/lib/organizationService';
import { createId } from '@/lib/id';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import { fieldService } from '@/lib/fieldService';
import { apiRequest } from '@/lib/apiClient';
import { canOrganizationUsePaidBilling } from '@/lib/organizationVerification';
import { buildUniqueColorReferenceList } from '@/lib/calendarColorReferences';
import FieldCalendarFilter, { type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import SharedCalendarEvent, { type SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import CreateRentalSlotModal, { type CreateRentalSlotModalSubmitPayload } from '@/components/ui/CreateRentalSlotModal';
import { alignDateToWeekday, toValidDate, mondayDayOf, dateWithMinutes, parseCalendarDropRange, buildManagerCalendarDraftWithCalendarRange } from './fieldsTab/facilityCalendarRanges';
import { saveFacilityCalendarChanges, type FacilityCalendarSaveResult } from './fieldsTab/facilityCalendarSave';
import { getCalendarEventVariant, getCalendarEventLayer, type CalendarLayerType } from './fieldsTab/facilityCalendarClassification';
import { canChangeFacilityEventRange, isStaffFeedEvent } from './fieldsTab/facilityCalendarEventPresentation';
import FacilityCalendarPanel from './fieldsTab/FacilityCalendarPanel';
import { calendarTargetResourceId, getFieldFacilityId, getFieldFacility, facilityCoordinatesToTuple } from './fieldsTab/facilityCalendarResources';
import { buildRentalSelectionCheckout } from './fieldsTab/facilityRentalCheckout';
import { prepareStaffTimeslot, planStaffDraftEdit, planStaffAssignmentEdit, planStaffOccurrenceEdit, type StaffTimeslotForm } from './fieldsTab/facilityStaffEdits';
import { getStaffAssignmentOccurrenceRangeForDate, getStaffAssignmentPrimaryRange, getPreviousStaffAssignmentOccurrenceRange, staffAssignmentCanDeleteFollowing, findRestorableStaffUnassignments, isOpenParentStaffScheduleAssignment, isOpenParentStaffScheduleSeries } from './fieldsTab/facilityStaffOccurrences';
import { prepareStaffCalendarRangeChange } from './fieldsTab/facilityStaffRangeChanges';
import { compareRanges, mergePublicRentalIntervals, subtractIntervals, type PublicRentalInterval } from './fieldsTab/facilityCalendarIntervals';
import { buildManagerCalendarDraftOccurrences, buildStaffScheduleCalendarItems } from './fieldsTab/facilityCalendarOccurrences';
import { resolveFacilityCalendarDropPoint } from './fieldsTab/facilityCalendarDropPoint';
import ManagerFacilityCalendarSidebar from './fieldsTab/ManagerFacilityCalendarSidebar';
import FacilityScheduleLayout from './fieldsTab/FacilityScheduleLayout';
import PublicRentalSelectionsPanel from './fieldsTab/PublicRentalSelectionsPanel';
import FacilityDetailsWorkspace from './fieldsTab/FacilityDetailsWorkspace';
import StaffTimeslotEditorModal from './fieldsTab/StaffTimeslotEditorModal';
import {
  OpenStaffDeleteConfirmationModal,
  StaffAssignmentScopePromptModal,
} from './fieldsTab/StaffAssignmentConfirmationModals';
import {
  ALL_FACILITIES_FILTER_VALUE,
  STAFF_TIMESLOT_REPEAT_DAY_OPTIONS,
  UNASSIGNED_FACILITY_FILTER_VALUE,
  coerceDatePickerValue,
  normalizeDaysOfWeek,
  normalizeFieldIds,
} from './fieldsTab/facilityFormUtils';
import {
  buildManagerResourceSelectionStorageKey,
  readStoredManagerResourceFieldIds,
  writeStoredManagerResourceFieldIds,
} from './fieldsTab/managerResourceSelectionStorage';
import { useManagerCalendarChangeQueue } from './fieldsTab/useManagerCalendarChangeQueue';
import {
  PUBLIC_RENTAL_MIN_SELECTION_MS,
  buildSelectionFromCalendarRange,
  isPastRentalRangeStart,
  resolveSelectionDateRange,
  updateSelectionWithCalendarRange,
  usePublicRentalSelections,
} from './fieldsTab/usePublicRentalSelections';
import type {
  CalendarEventData,
  FacilityFeedCalendarEntry,
  ManagerCalendarDraft,
  ManagerCalendarSelectionMode,
  ManagerDraftDragState,
  OpenStaffDeleteScope,
  OpenStaffDeleteConfirmationState,
  RentalSelectionCheckoutPayload,
  RentalSelectionCheckoutSelection,
  RentalSlotDragUpdate,
  SelectionCalendarEntry,
  SelectionState,
  StaffAssignmentScopePromptState,
  StaffScheduleAssignment,
  StaffScheduleAssignmentKind,
  StaffScheduleCreateResponse,
  StaffScheduleResponse,
  StaffScheduleStaffMember,
  StaffScheduleTimeSlot,
} from './fieldsTab/facilityCalendarTypes';

export type { RentalSelectionCheckoutPayload } from './fieldsTab/facilityCalendarTypes';

const fieldIdArraysEqual = (first: string[], second: string[]): boolean => (
  first.length === second.length && first.every((fieldId, index) => fieldId === second[index])
);

const MIN_SELECTION_MS = PUBLIC_RENTAL_MIN_SELECTION_MS;
const SLOT_STEP_MINUTES = 30;
const MANAGER_CARD_DRAG_THRESHOLD_PX = 6;

const hasMovedPastDragThreshold = (
  startPoint: { clientX: number; clientY: number },
  nextPoint: { clientX: number; clientY: number },
): boolean => (
  Math.hypot(nextPoint.clientX - startPoint.clientX, nextPoint.clientY - startPoint.clientY)
  >= MANAGER_CARD_DRAG_THRESHOLD_PX
);


const dollarsFromCents = (amountCents: number | null | undefined): string => {
  if (!Number.isFinite(amountCents)) {
    return '';
  }
  return (Number(amountCents) / 100).toFixed(2);
};

const CALENDAR_LAYER_ORDER: CalendarLayerType[] = [
  'rental',
  'reservation',
  'event',
  'game',
  'maintenance_block',
  'official_assignment',
  'staff_assignment',
];

const CALENDAR_LAYER_LABELS: Record<CalendarLayerType, string> = {
  conflict: 'Conflicts',
  rental: 'Open rentals',
  reservation: 'Reservations',
  maintenance_block: 'Maintenance',
  event: 'Events',
  game: 'Games',
  official_assignment: 'Officials',
  staff_assignment: 'Staff',
};

const CALENDAR_LAYER_COLORS: Record<CalendarLayerType, string> = {
  conflict: '#d13b4e',
  rental: '#007f8c',
  reservation: '#102958',
  maintenance_block: '#d99a22',
  event: '#e9462d',
  game: '#4f5dc7',
  official_assignment: '#7147a8',
  staff_assignment: '#0e7490',
};

const MANAGER_SELECTION_TITLES: Record<ManagerCalendarSelectionMode, string> = {
  rental: 'Open rental slot',
  staff_assignment: 'Open staff shift',
  official_assignment: 'Open official shift',
};

const MANAGER_CREATE_TEMPLATES: Array<{
  mode: ManagerCalendarSelectionMode;
  title: string;
  subtitle: string;
  meta: string;
  variant: SharedCalendarEventVariant;
  colorSeed: string;
}> = [
  {
    mode: 'rental',
    title: 'Rental slot',
    subtitle: 'Open inventory',
    meta: '1 hour',
    variant: 'availability',
    colorSeed: 'rental-slot-template',
  },
  {
    mode: 'staff_assignment',
    title: 'Staff shift',
    subtitle: 'Coverage',
    meta: '1 hour',
    variant: 'staff-open',
    colorSeed: 'staff-shift-template',
  },
  {
    mode: 'official_assignment',
    title: 'Official shift',
    subtitle: 'Coverage',
    meta: '1 hour',
    variant: 'official-open',
    colorSeed: 'official-shift-template',
  },
];

const FACILITY_FEED_CALENDAR_TYPES = new Set<FacilityCalendarFeedItemType>([
  'maintenance_block',
  'official_assignment',
  'staff_assignment',
]);

const getFacilitySortOrder = (facility: Facility): number => (
  typeof facility.sortOrder === 'number' && Number.isFinite(facility.sortOrder)
    ? facility.sortOrder
    : Number.MAX_SAFE_INTEGER
);

const compareFacilitiesForManagement = (left: Facility, right: Facility): number => {
  if (Boolean(left.isDefault) !== Boolean(right.isDefault)) {
    return left.isDefault ? -1 : 1;
  }

  const sortDifference = getFacilitySortOrder(left) - getFacilitySortOrder(right);
  if (sortDifference !== 0) {
    return sortDifference;
  }

  const nameComparison = (left.name || '').localeCompare(right.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.$id.localeCompare(right.$id);
};



const getFieldFacilityFilterValue = (field?: Field | null): string => (
  getFieldFacilityId(field) ?? UNASSIGNED_FACILITY_FILTER_VALUE
);

const getFacilityLabelForFilterValue = (facilities: Facility[], filterValue: string): string => {
  if (filterValue === ALL_FACILITIES_FILTER_VALUE) {
    return 'All facilities';
  }
  if (filterValue === UNASSIGNED_FACILITY_FILTER_VALUE) {
    return 'Unassigned resources';
  }
  return facilities.find((facility) => facility.$id === filterValue)?.name || 'Facility';
};



const buildFacilityManagementList = (
  organization: Organization | null,
  fields: Field[],
): Facility[] => {
  const byId = new Map<string, Facility>();

  (organization?.facilities ?? []).forEach((facility) => {
    if (facility?.$id) {
      byId.set(facility.$id, facility);
    }
  });

  fields.forEach((field) => {
    const facility = getFieldFacility(field);
    if (facility?.$id && !byId.has(facility.$id)) {
      byId.set(facility.$id, facility);
      return;
    }

    const facilityId = getFieldFacilityId(field);
    if (facilityId && !byId.has(facilityId)) {
      byId.set(facilityId, {
        $id: facilityId,
        organizationId: organization?.$id ?? '',
        name: facilityId,
        location: '',
        status: 'ACTIVE',
      });
    }
  });

  return Array.from(byId.values()).sort(compareFacilitiesForManagement);
};

const minutesToDate = (base: Date, minutes: number): Date => {
  const copy = new Date(base.getTime());
  copy.setHours(0, 0, 0, 0);
  copy.setMinutes(minutes);
  return copy;
};


const buildPublicRentalCalendarEvents = (events: FieldCalendarEntry[]): FieldCalendarEntry[] => {
  const rentalEntries = events.filter((event) => event.metaType === 'rental');
  const bookedEntries = events.filter((event) => event.metaType === 'booked');
  const publicEntries: FieldCalendarEntry[] = [];

  rentalEntries.forEach((rentalEntry) => {
    const overlaps = mergePublicRentalIntervals(
      bookedEntries.flatMap((bookedEntry) => {
        if (
          bookedEntry.resourceId !== rentalEntry.resourceId
          || !compareRanges(rentalEntry.start, rentalEntry.end, bookedEntry.start, bookedEntry.end)
        ) {
          return [];
        }
        const start = new Date(Math.max(rentalEntry.start.getTime(), bookedEntry.start.getTime()));
        const end = new Date(Math.min(rentalEntry.end.getTime(), bookedEntry.end.getTime()));
        return end.getTime() > start.getTime() ? [{ start, end }] : [];
      }),
    );

    let cursor = new Date(rentalEntry.start.getTime());
    overlaps.forEach((overlap, index) => {
      if (overlap.start.getTime() > cursor.getTime()) {
        publicEntries.push({
          ...rentalEntry,
          id: `${rentalEntry.id}-available-${cursor.getTime()}`,
          start: new Date(cursor.getTime()),
          end: new Date(overlap.start.getTime()),
        });
      }

      publicEntries.push({
        ...rentalEntry,
        id: `${rentalEntry.id}-unavailable-${index}-${overlap.start.getTime()}`,
        title: 'Unavailable',
        start: new Date(overlap.start.getTime()),
        end: new Date(overlap.end.getTime()),
        resource: {
          sourceType: 'RENTAL_UNAVAILABLE',
          sourceId: rentalEntry.id,
        } as unknown as TimeSlot,
        metaType: 'booked',
      });

      if (overlap.end.getTime() > cursor.getTime()) {
        cursor = new Date(overlap.end.getTime());
      }
    });

    if (cursor.getTime() < rentalEntry.end.getTime()) {
      publicEntries.push({
        ...rentalEntry,
        id: overlaps.length ? `${rentalEntry.id}-available-${cursor.getTime()}` : rentalEntry.id,
        start: new Date(cursor.getTime()),
        end: new Date(rentalEntry.end.getTime()),
      });
    }
  });

  return publicEntries.sort((left, right) => (
    left.start.getTime() - right.start.getTime()
    || left.end.getTime() - right.end.getTime()
    || left.resourceId.localeCompare(right.resourceId)
    || left.id.localeCompare(right.id)
  ));
};

const fieldMatchesFacilityFilter = (field: Field, filterValue: string): boolean => {
  if (filterValue === ALL_FACILITIES_FILTER_VALUE) {
    return true;
  }
  const facilityId = getFieldFacilityId(field);
  if (filterValue === UNASSIGNED_FACILITY_FILTER_VALUE) {
    return !facilityId;
  }
  return facilityId === filterValue;
};



function closestCalendarElement(target: EventTarget | null, selector: string): Element | null {
  const element = target as Element | null;
  return typeof element?.closest === 'function' ? element.closest(selector) : null;
}

function isCalendarRangeHandle(target: EventTarget | null): boolean {
  return Boolean(closestCalendarElement(target, [
    '.shared-calendar-event__drag-handle',
    '.rbc-addons-dnd-resize-ns-anchor',
    '.rbc-addons-dnd-resize-ew-anchor',
    '.facility-resource-calendar__resize-handle',
  ].join(', ')));
}

function calendarStaffEventId(target: EventTarget | null): string {
  const card = closestCalendarElement(target, '[data-staff-assignment-calendar-event-id]');
  return card?.getAttribute('data-staff-assignment-calendar-event-id') ?? '';
}

function calendarEventClassName(event: CalendarEventData, canManage: boolean) {
  const assignment = isStaffFeedEvent(event, canManage)
    ? event.resource.source as StaffScheduleAssignment | undefined : undefined;
  const isOpenSeries = assignment && isOpenParentStaffScheduleSeries(assignment);
  return [
    'field-calendar-rbc-event',
    `field-calendar-rbc-event--${getCalendarEventVariant(event)}`,
    isOpenSeries ? 'field-calendar-rbc-event--open-staff-series' : '',
  ].filter(Boolean).join(' ');
}

function calendarEventCursor(event: CalendarEventData, canManage: boolean, editMode: boolean) {
  if (canManage && canChangeFacilityEventRange(event, canManage, editMode)) return 'grab';
  return isStaffFeedEvent(event, canManage) ? 'pointer' : 'default';
}

function calendarManagerDraftId(event: CalendarEventData): string {
  const draftId = event.metaType === 'selection' ? event.resource?.slotKey : null;
  return typeof draftId === 'string' ? draftId : '';
}

function calendarDraftDataAttributes(event: CalendarEventData) {
  const draftId = calendarManagerDraftId(event);
  return draftId ? { 'data-manager-draft-id': draftId } : {};
}

type CalendarRangeChange = {
  event: CalendarEventData;
  start: Date;
  end: Date;
  resourceId?: string | number;
};

function calendarSelectionChangeOptions(
  event: SelectionCalendarEntry, resourceId: CalendarRangeChange['resourceId'], interaction: 'move' | 'resize',
) {
  const slotKey = event.resource?.slotKey;
  const options = { slotKey: typeof slotKey === 'string' ? slotKey : undefined, interaction };
  return interaction === 'resize' ? options : {
    ...options, resourceId: typeof resourceId === 'string' ? resourceId : event.resourceId,
  };
}


const childStaffAssignmentTouchesDeleteScope = (
  assignment: StaffScheduleAssignment,
  occurrenceStart: Date,
): boolean => {
  const timeSlot = assignment.timeSlot ?? null;
  if (timeSlot?.repeating) {
    const scheduleEnd = toValidDate(timeSlot.endDate);
    return !scheduleEnd || endOfDay(scheduleEnd).getTime() >= occurrenceStart.getTime();
  }
  const range = getStaffAssignmentPrimaryRange(assignment);
  if (!range) {
    return false;
  }
  return range.end.getTime() > occurrenceStart.getTime();
};


const buildStaffAssignmentEndingAfterOccurrence = (
  assignment: StaffScheduleAssignment,
  occurrence: PublicRentalInterval,
): StaffScheduleAssignment | null => {
  const timeSlot = assignment.timeSlot ?? null;
  if (!timeSlot?.repeating) {
    return null;
  }
  return {
    ...assignment,
    timeSlot: {
      ...timeSlot,
      endDate: endOfDay(occurrence.start).toISOString(),
    },
    plannedEnd: occurrence.end.toISOString(),
  };
};

const formatStaffAssignmentDeleteChildLabel = (assignment: StaffScheduleAssignment): string => {
  const range = getStaffAssignmentPrimaryRange(assignment);
  const name = assignment.userName || 'Assigned coverage';
  const resource = assignment.fieldName ? ` • ${assignment.fieldName}` : '';
  const time = range ? ` • ${formatDisplayDateTime(range.start)} - ${formatDisplayTime(range.end)}` : '';
  return `${name}${resource}${time}`;
};

const getRentalSlotPendingUpdateKey = (fieldId: string, slotId: string) => `${fieldId}:${slotId}`;

function rentalCalendarDropContext(event: CalendarEventData | null | undefined, start: unknown, end: unknown) {
  if (event?.metaType !== 'rental' || !start || !end) return null;
  const slot = event.resource as TimeSlot | undefined;
  const range = parseCalendarDropRange(start, end);
  return slot?.$id && range ? { slot, range } : null;
}

function rentalSlotModalChange(submission: CreateRentalSlotModalSubmitPayload) {
  if (!submission.slot?.$id || !submission.field?.$id || !submission.updatePayload) return null;
  return {
    key: getRentalSlotPendingUpdateKey(submission.field.$id, submission.slot.$id),
    action: 'update' as const,
    fieldId: submission.field.$id,
    slotId: submission.slot.$id,
    slot: submission.updatePayload,
  };
}

const rentalSlotTemplateIds = (value: TimeSlot['requiredTemplateIds']): string[] => (
  Array.isArray(value) ? value : []
);

const buildRentalSlotUpdateFromCalendarRange = (
  slot: TimeSlot,
  start: Date,
  end: Date,
  fieldId: string,
): RentalSlotDragUpdate | null => {
  if (!slot?.$id || !fieldId) {
    return null;
  }

  const nextStart = new Date(start.getTime());
  const nextEnd = end.getTime() > nextStart.getTime()
    ? new Date(end.getTime())
    : new Date(nextStart.getTime() + MIN_SELECTION_MS);
  const dayOfWeek = mondayDayOf(nextStart) as NonNullable<TimeSlot['dayOfWeek']>;
  const durationMinutes = Math.max(1, Math.round((nextEnd.getTime() - nextStart.getTime()) / (60 * 1000)));
  const startTimeMinutes = nextStart.getHours() * 60 + nextStart.getMinutes();
  const endTimeMinutes = Math.min(24 * 60, startTimeMinutes + durationMinutes);
  const repeating = Boolean(slot.repeating);
  const repeatDays = repeating
    ? normalizeDaysOfWeek(slot.daysOfWeek, slot.dayOfWeek ?? dayOfWeek)
    : [dayOfWeek];
  const baseUpdate: RentalSlotDragUpdate = {
    $id: slot.$id,
    timeZone: slot.timeZone,
    dayOfWeek: repeatDays[0] as NonNullable<TimeSlot['dayOfWeek']>,
    daysOfWeek: repeatDays as NonNullable<TimeSlot['dayOfWeek']>[],
    repeating,
    scheduledFieldId: fieldId,
    scheduledFieldIds: [fieldId],
    requiredTemplateIds: rentalSlotTemplateIds(slot.requiredTemplateIds),
    hostRequiredTemplateIds: rentalSlotTemplateIds(slot.hostRequiredTemplateIds),
    price: slot.price,
  };

  if (repeating) {
    return {
      ...baseUpdate,
      startDate: slot.startDate ?? formatLocalDateTime(nextStart),
      endDate: slot.endDate ?? null,
      startTimeMinutes,
      endTimeMinutes: Math.max(startTimeMinutes + 1, endTimeMinutes),
    };
  }

  return {
    ...baseUpdate,
    startDate: formatLocalDateTime(nextStart),
    endDate: formatLocalDateTime(nextEnd),
    startTimeMinutes: undefined,
    endTimeMinutes: undefined,
  };
};

const applyRentalSlotDragUpdateToFields = (
  fields: Field[],
  slot: TimeSlot,
  targetFieldId: string,
  update: RentalSlotDragUpdate,
): Field[] => {
  const slotId = slot.$id;
  const nextSlot: TimeSlot = { ...slot, ...update };

  return fields.map((field) => {
    const rentalSlots = Array.isArray(field.rentalSlots) ? field.rentalSlots : [];
    const hasSlot = rentalSlots.some((candidate) => candidate?.$id === slotId);
    const isTargetField = field.$id === targetFieldId;
    if (!hasSlot && !isTargetField) {
      return field;
    }

    const nextRentalSlots = isTargetField
      ? hasSlot
        ? rentalSlots.map((candidate) => (candidate?.$id === slotId ? nextSlot : candidate))
        : [...rentalSlots, nextSlot]
      : rentalSlots.filter((candidate) => candidate?.$id !== slotId);
    const rentalSlotIds = Array.isArray(field.rentalSlotIds)
      ? field.rentalSlotIds
      : rentalSlots.map((candidate) => candidate?.$id).filter((id): id is string => Boolean(id));
    const nextRentalSlotIds = isTargetField
      ? Array.from(new Set([...rentalSlotIds, slotId]))
      : rentalSlotIds.filter((id) => id !== slotId);

    return {
      ...field,
      rentalSlots: nextRentalSlots,
      rentalSlotIds: nextRentalSlotIds,
    };
  });
};

const mergeFieldPreservingCalendarHydration = (
  currentField: Field | undefined,
  nextField: Field,
): Field => {
  if (!currentField) {
    return nextField;
  }

  return {
    ...currentField,
    ...nextField,
    events: Array.isArray(nextField.events) ? nextField.events : currentField.events,
    matches: Array.isArray(nextField.matches) ? nextField.matches : currentField.matches,
  };
};

const mergeOrganizationPreservingFieldCalendarHydration = (
  currentOrganization: Organization | null,
  nextOrganization: Organization,
): Organization => {
  if (!currentOrganization?.fields?.length || !Array.isArray(nextOrganization.fields)) {
    return nextOrganization;
  }

  const currentFieldsById = new Map(currentOrganization.fields.map((field) => [field.$id, field]));
  return {
    ...nextOrganization,
    fields: nextOrganization.fields.map((field) => (
      mergeFieldPreservingCalendarHydration(currentFieldsById.get(field.$id), field)
    )),
  };
};

function calendarIdsEqual(
  current: { $id?: string }[] | null | undefined,
  hydrated: { $id?: string }[] | null | undefined,
): boolean {
  const currentRows = current ?? [];
  const hydratedRows = hydrated ?? [];
  return currentRows.length === hydratedRows.length
    && currentRows.every((item, index) => item?.$id === hydratedRows[index]?.$id);
}

function mergeHydratedCalendarField(field: Field, hydrated: Field | undefined): Field {
  if (!hydrated) return field;
  if (calendarIdsEqual(field.events, hydrated.events) && calendarIdsEqual(field.matches, hydrated.matches)) {
    return field;
  }
  return { ...field, events: hydrated.events, matches: hydrated.matches };
}

type CalendarSelectionWindowOptions = {
  slotKey?: string;
  resourceId?: string | null;
  interaction?: 'move' | 'resize';
};

function rentalCalendarSelectionResources(resourceId: unknown, visibleFieldIds: string[], fields: Field[]) {
  const fieldIds = normalizeFieldIds(typeof resourceId === 'string' ? [resourceId] : visibleFieldIds);
  const primaryFieldId = fieldIds[0] ?? fields[0]?.$id;
  return { fieldIds, primaryFieldId };
}

type FieldsTabContentProps = {
  organization: Organization;
  organizationId: string;
  currentUser: UserData | null;
  backHref?: string;
  backLabel?: string;
  showBackButton?: boolean;
  primaryActionLabel?: string;
  canManageFields?: boolean;
  onRentalSelectionReady?: (payload: RentalSelectionCheckoutPayload) => void;
};

function fieldsTabOptions(props: FieldsTabContentProps) {
  return {
    ...props,
    backHref: props.backHref ?? '/discover',
    backLabel: props.backLabel ?? 'Back to Discover',
    showBackButton: props.showBackButton ?? true,
    primaryActionLabel: props.primaryActionLabel ?? 'Reserve resources',
    canManageFields: props.canManageFields ?? false,
  };
}

function canManageFacilities(explicitPermission: boolean, user: UserData | null, organization: Organization | null) {
  return Boolean(explicitPermission || (user && organization && user.$id === organization.ownerId));
}

function staffEditorState(
  mode: Exclude<ManagerCalendarSelectionMode, 'rental'>,
  assignment: StaffScheduleAssignment | null,
  parent: StaffScheduleAssignment | null,
) {
  const staffTimeslotAssignmentKind: StaffScheduleAssignmentKind = mode === 'official_assignment'
    ? 'OFFICIAL_SHIFT' : 'STAFF_SHIFT';
  return {
    staffTimeslotAssignmentKind,
    isEditingStaffAssignment: Boolean(assignment),
    isEditingChildStaffAssignment: Boolean(assignment?.parentAssignmentId),
    isAssigningStaffOccurrence: Boolean(parent) && !assignment,
  };
}

function initialManagerSelectionRange(previous: SelectionState | null) {
  const start = previous?.start ? new Date(previous.start) : new Date();
  start.setMinutes(0, 0, 0);
  const end = previous?.end && previous.end.getTime() > start.getTime()
    ? new Date(previous.end)
    : new Date(start.getTime() + MIN_SELECTION_MS);
  return { start, end };
}

function prepareCalendarEditorSelection(
  selection: SelectionState | null,
  label: 'Rental slots' | 'Staff timeslots',
): { selection: SelectionState } | { error: string } {
  if (!selection || !normalizeFieldIds(selection.fieldIds).length) {
    return { error: 'Select at least one resource and a time range first.' };
  }
  if (selection.start.toDateString() !== selection.end.toDateString()) {
    return { error: `${label} must stay within a single day. Adjust the selection.` };
  }
  return { selection };
}

function staffEditorValues(options: ManagerCalendarDraft['staff'], start: Date) {
  const staff = options ?? {};
  return {
    userId: staff.userId ?? null,
    overrideAmount: dollarsFromCents(staff.rateOverrideCents),
    notes: staff.notes ?? '',
    repeating: Boolean(staff.repeating),
    repeatDays: Array.isArray(staff.daysOfWeek) && staff.daysOfWeek.length
      ? staff.daysOfWeek : [mondayDayOf(start)],
    repeatEndDate: staff.repeatEndDate ? toValidDate(staff.repeatEndDate) : null,
  };
}

function staffAssignmentEditorValues(assignment: StaffScheduleAssignment, start: Date) {
  const timeSlot = assignment.timeSlot;
  return staffEditorValues({
    userId: assignment.userId,
    rateOverrideCents: assignment.rateOverrideCents,
    notes: assignment.notes ?? '',
    repeating: timeSlot?.repeating,
    daysOfWeek: timeSlot?.daysOfWeek ?? undefined,
    repeatEndDate: timeSlot?.endDate,
  }, start);
}

function staffAssignmentEditorState(item: FacilityCalendarFeedItem, assignment: StaffScheduleAssignment, start: Date) {
  const isOpen = isOpenParentStaffScheduleAssignment(assignment);
  const mode: Exclude<ManagerCalendarSelectionMode, 'rental'> = item.type === 'official_assignment'
    ? 'official_assignment' : 'staff_assignment';
  return {
    mode,
    fieldId: isOpen ? item.fieldId : item.fieldId ?? assignment.fieldId ?? null,
    editingAssignment: isOpen ? null : assignment,
    parentAssignment: isOpen ? assignment : null,
    values: isOpen
      ? staffEditorValues({ notes: assignment.notes ?? '' }, start)
      : staffAssignmentEditorValues(assignment, start),
  };
}

export default function FieldsTabContent(props: FieldsTabContentProps) {
  return <FieldsTabWorkspace {...fieldsTabOptions(props)} />;
}

function FieldsTabWorkspace({
  organization,
  organizationId,
  currentUser,
  backHref,
  backLabel,
  showBackButton,
  primaryActionLabel,
  canManageFields,
  onRentalSelectionReady,
}: ReturnType<typeof fieldsTabOptions>) {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(organization ?? null);
  const [orgLoading, setOrgLoading] = useState(!organization);
  const [orgError, setOrgError] = useState<string | null>(null);
  const organizationHasStripeAccount = canOrganizationUsePaidBilling(org);
  const canManage = canManageFacilities(canManageFields, currentUser, org);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const selectionFieldIds = selection?.fieldIds;
  const managerResourceSelectionHydratedKeyRef = useRef<string | null>(null);
  const [readonlyVisibleFieldIds, setReadonlyVisibleFieldIds] = useState<string[]>([]);
  const [calendarView, setCalendarView] = useState<View>('week');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [hostOrganizations, setHostOrganizations] = useState<Organization[]>([]);
  const [hostOptionsLoading, setHostOptionsLoading] = useState(false);
  const [hostSelection, setHostSelection] = useState<string>('self');
  const [fieldEventsLoading, setFieldEventsLoading] = useState(false);
  const lastLoadedFieldEventsKeyRef = useRef<string | null>(null);
  const [createRentalOpen, setCreateRentalOpen] = useState(false);
  const [editingRentalSlot, setEditingRentalSlot] = useState<TimeSlot | null>(null);
  const [editingRentalField, setEditingRentalField] = useState<Field | null>(null);
  const [rentalDraftRange, setRentalDraftRange] = useState<{ start: Date; end: Date } | null>(null);
  const [facilityWorkspaceView, setFacilityWorkspaceView] = useState<'schedule' | 'details'>('schedule');
  const managerCreateDragModeRef = useRef<ManagerCalendarSelectionMode | null>(null);
  const managerCreateDragSourceRef = useRef<'pointer' | null>(null);
  const managerCreateLastPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [managerCreateDragMode, setManagerCreateDragMode] = useState<ManagerCalendarSelectionMode | null>(null);
  const [managerCreateDragSource, setManagerCreateDragSource] = useState<'pointer' | null>(null);
  const [managerCreateDragPreviewPoint, setManagerCreateDragPreviewPoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const managerCreateDropResolverRef = useRef<((clientX: number, clientY: number) => SelectionState | null) | null>(null);
  const managerCreateDraftAdderRef = useRef<((mode: ManagerCalendarSelectionMode, nextSelection: SelectionState) => void) | null>(null);
  const {
    managerCalendarEditMode,
    setManagerCalendarEditMode,
    managerCalendarDrafts,
    managerCalendarPendingChangeCount,
    managerRentalSlotUpdates,
    managerStaffAssignmentOverrides,
    managerCalendarDraftsSaving,
    setManagerCalendarDraftsSaving,
    managerDraftDragId,
    setManagerDraftDragId,
    selectedManagerDraftId,
    setSelectedManagerDraftId,
    editingManagerDraftId,
    setEditingManagerDraftId,
    stageManagerCalendarDraftCreate,
    stageManagerCalendarDraftUpdate,
    stageManagerCalendarDraftScope,
    stageRentalSlotUpdate,
    stageStaffAssignmentOverride,
    stageStaffAssignmentOverrideBatch,
    restorePendingStaffUnassignment,
    undoLastManagerCalendarChange,
    clearManagerCalendarPendingState,
  } = useManagerCalendarChangeQueue({
    setSelection,
    setCalendarDate,
  });
  const managerDraftDragRef = useRef<ManagerDraftDragState | null>(null);
  const managerDraftSuppressNextClickRef = useRef(false);
  const openManagerCalendarDraftEditorRef = useRef<((draftId: string) => void) | null>(null);
  const [calendarLayerFilters, setCalendarLayerFilters] = useState<CalendarLayerType[]>(CALENDAR_LAYER_ORDER);
  const [selectedFacilityFilterValue, setSelectedFacilityFilterValue] = useState<string>(ALL_FACILITIES_FILTER_VALUE);
  const [staffScheduleAssignments, setStaffScheduleAssignments] = useState<StaffScheduleAssignment[]>([]);
  const [staffScheduleMembers, setStaffScheduleMembers] = useState<StaffScheduleStaffMember[]>([]);
  const [staffScheduleLoaded, setStaffScheduleLoaded] = useState(false);
  const [staffScheduleLoading, setStaffScheduleLoading] = useState(false);
  const [staffTimeslotModalOpen, setStaffTimeslotModalOpen] = useState(false);
  const [staffTimeslotParentAssignment, setStaffTimeslotParentAssignment] = useState<StaffScheduleAssignment | null>(null);
  const [editingStaffAssignment, setEditingStaffAssignment] = useState<StaffScheduleAssignment | null>(null);
  const [staffTimeslotMode, setStaffTimeslotMode] = useState<Exclude<ManagerCalendarSelectionMode, 'rental'>>('staff_assignment');
  const [staffTimeslotUserId, setStaffTimeslotUserId] = useState<string | null>(null);
  const [staffTimeslotOverrideAmount, setStaffTimeslotOverrideAmount] = useState<string | number>('');
  const [staffTimeslotNotes, setStaffTimeslotNotes] = useState('');
  const [staffTimeslotRepeating, setStaffTimeslotRepeating] = useState(false);
  const [staffTimeslotRepeatDays, setStaffTimeslotRepeatDays] = useState<number[]>([]);
  const [staffTimeslotRepeatEndDate, setStaffTimeslotRepeatEndDate] = useState<Date | null>(null);
  const [staffTimeslotError, setStaffTimeslotError] = useState<string | null>(null);
  const [staffTimeslotSubmitting, setStaffTimeslotSubmitting] = useState(false);
  const [staffTimeslotDeleting, setStaffTimeslotDeleting] = useState(false);
  const [openStaffDeleteConfirmation, setOpenStaffDeleteConfirmation] = useState<OpenStaffDeleteConfirmationState | null>(null);
  const [staffAssignmentScopePrompt, setStaffAssignmentScopePrompt] = useState<StaffAssignmentScopePromptState | null>(null);
  const openStaffAssignmentEditModalRef = useRef<((item: FacilityCalendarFeedItem, start: Date, end: Date) => void) | null>(null);
  const suppressStaffAssignmentActivationUntilRef = useRef(0);

  const suppressStaffAssignmentActivation = useCallback((durationMs = 600) => {
    suppressStaffAssignmentActivationUntilRef.current = Date.now() + durationMs;
  }, []);

  const isStaffAssignmentActivationSuppressed = useCallback(() => (
    Date.now() < suppressStaffAssignmentActivationUntilRef.current
  ), []);

  useEffect(() => {
    setOrg(organization ?? null);
  }, [organization?.$id, organization]);

  useEffect(() => {
    if (organization) return;
    if (!organizationId) {
      setOrgError('No organization selected.');
      setOrg(null);
      setOrgLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setOrgLoading(true);
        setOrgError(null);
        const result = await organizationService.getOrganizationById(organizationId);
        if (cancelled) return;
        if (!result) {
          setOrgError('Organization not found.');
          setOrg(null);
        } else {
          setOrg(result);
        }
      } catch (error) {
        console.error('Failed to load organization:', error);
        if (!cancelled) {
          setOrgError('Failed to load organization. Please try again.');
          setOrg(null);
        }
      } finally {
        if (!cancelled) {
          setOrgLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organization, organizationId]);

  const fields = useMemo<Field[]>(() => sortFieldsByCreatedAt(org?.fields ?? []), [org?.fields]);
  const allFieldIds = useMemo(() => fields.map((field) => field.$id), [fields]);
  const managerResourceSelectionStorageKey = useMemo(
    () => (canManage ? buildManagerResourceSelectionStorageKey(org?.$id ?? organizationId) : null),
    [canManage, org?.$id, organizationId],
  );
  const facilities = useMemo(() => buildFacilityManagementList(org, fields), [fields, org]);
  const unassignedFields = useMemo(
    () => fields.filter((field) => !getFieldFacilityId(field)),
    [fields],
  );
  const facilityOptions = useMemo(
    () => facilities.map((facility) => ({
      value: facility.$id,
      label: facility.name || 'Facility',
    })),
    [facilities],
  );
  const facilityFilterOptions = useMemo(() => [
    { value: ALL_FACILITIES_FILTER_VALUE, label: 'All facilities' },
    ...facilityOptions,
    ...(unassignedFields.length > 0
      ? [{ value: UNASSIGNED_FACILITY_FILTER_VALUE, label: 'Unassigned resources' }]
      : []),
  ], [facilityOptions, unassignedFields.length]);
  const publicFacilityFilterOptions = useMemo(() => {
    const options = [
      ...facilityOptions,
      ...(unassignedFields.length > 0
        ? [{ value: UNASSIGNED_FACILITY_FILTER_VALUE, label: 'Unassigned resources' }]
        : []),
    ];
    return options.length ? options : facilityFilterOptions;
  }, [facilityFilterOptions, facilityOptions, unassignedFields.length]);
  const facilityFilteredFields = useMemo(
    () => fields.filter((field) => fieldMatchesFacilityFilter(field, selectedFacilityFilterValue)),
    [fields, selectedFacilityFilterValue],
  );
  const facilityFilteredFieldIds = useMemo(
    () => facilityFilteredFields.map((field) => field.$id),
    [facilityFilteredFields],
  );
  const fieldFilterItems = useMemo<FieldCalendarFilterItem[]>(() => facilityFilteredFields.map((field) => {
    const label = getFacilityScopedFieldDisplayName(field);
    const count = (field.events?.length ?? 0) + (field.matches?.length ?? 0) + (field.rentalSlots?.length ?? 0);
    return {
      id: field.$id,
      label,
      detail: getFieldResolvedLocation(field) || null,
      count,
      colorSeed: label || field.$id,
      colorMatchKey: field.$id,
    };
  }), [facilityFilteredFields]);
  const fieldColorReferenceList = useMemo(
    () => buildUniqueColorReferenceList(fields.map((field) => field.$id)),
    [fields],
  );
  const facilityFieldsByFilterValue = useMemo(() => {
    const byFilterValue = new Map<string, Field[]>();
    fields.forEach((field) => {
      const filterValue = getFieldFacilityFilterValue(field);
      const bucket = byFilterValue.get(filterValue) ?? [];
      bucket.push(field);
      byFilterValue.set(filterValue, bucket);
    });
    return byFilterValue;
  }, [fields]);

  const rentalListings = useMemo(() => {
    if (!org) return [];
    const referenceDate = new Date();
    const listings: { field: Field; slot: TimeSlot; nextOccurrence: Date }[] = [];
    (org.fields || []).forEach((field) => {
      (field.rentalSlots || []).forEach((slot) => {
        const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
        if (!nextOccurrence) return;
        listings.push({ field, slot, nextOccurrence });
      });
    });
    listings.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
    return listings;
  }, [org]);
  const {
    rentalSelections,
    setRentalSelections,
    rentalSelectionValidations,
    rentalSelectionValidationByKey,
    totalRentalCents,
    rentalRequiredTemplateIds,
    rentalHostRequiredTemplateIds,
    canReserveRentalResources,
    hasPendingConflictChecks,
    updateRentalSelection,
    handleAddRentalSelection,
    handleRemoveRentalSelection,
  } = usePublicRentalSelections({
    canManage,
    currentUser,
    fields,
    facilityFilteredFields,
    rentalListings,
    selectionContextKey: org?.$id ?? '',
    compareRanges,
  });

  useEffect(() => {
    if (canManage) return;
    if (!rentalListings.length || (selectionFieldIds?.length ?? 0) > 0) return;

    const firstListing = rentalListings[0];
    const baseDate = new Date(firstListing.nextOccurrence);
    const startMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
    const endMinutes = typeof firstListing.slot.endTimeMinutes === 'number'
      ? firstListing.slot.endTimeMinutes
      : (firstListing.slot.startTimeMinutes ?? startMinutes + 60);
    const initialStart = minutesToDate(baseDate, startMinutes);
    const initialEndCandidate = minutesToDate(baseDate, endMinutes);
    const initialEnd = initialEndCandidate > initialStart ? initialEndCandidate : addHours(initialStart, 1);

    setSelection({
      fieldIds: [firstListing.field.$id],
      start: initialStart,
      end: initialEnd,
    });
    setCalendarDate(new Date(firstListing.nextOccurrence.getTime()));
  }, [canManage, rentalListings, selectionFieldIds]);

  useEffect(() => {
    if (canManage) return;
    if ((selectionFieldIds?.length ?? 0) > 0) return;
    if (!fields.length) return;
    if (rentalListings.length) return;

    setSelection(() => {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + MIN_SELECTION_MS);
      return { fieldIds: [fields[0].$id], start, end };
    });
  }, [canManage, fields, rentalListings.length, selectionFieldIds]);

  useEffect(() => {
    if (!canManage || !managerResourceSelectionStorageKey) {
      managerResourceSelectionHydratedKeyRef.current = null;
      return;
    }
    if (!allFieldIds.length) {
      setSelection(null);
      return;
    }
    if (managerResourceSelectionHydratedKeyRef.current === managerResourceSelectionStorageKey) {
      return;
    }

    const storedFieldIds = readStoredManagerResourceFieldIds(managerResourceSelectionStorageKey, allFieldIds);
    const nextFieldIds = storedFieldIds ?? allFieldIds;
    const firstListing = rentalListings[0];
    if (firstListing?.nextOccurrence) {
      setCalendarDate(new Date(firstListing.nextOccurrence.getTime()));
    }
    setSelection((prev) => {
      const { start, end } = initialManagerSelectionRange(prev);
      const currentFieldIds = normalizeFieldIds(prev?.fieldIds ?? []).filter((fieldId) => allFieldIds.includes(fieldId));
      return fieldIdArraysEqual(currentFieldIds, nextFieldIds) && prev
        ? prev
        : { fieldIds: nextFieldIds, start, end };
    });
    managerResourceSelectionHydratedKeyRef.current = managerResourceSelectionStorageKey;
  }, [allFieldIds, canManage, managerResourceSelectionStorageKey, rentalListings]);

  useEffect(() => {
    const hasSelectedOption = facilityFilterOptions.some((option) => option.value === selectedFacilityFilterValue);
    if (!hasSelectedOption) {
      setSelectedFacilityFilterValue(ALL_FACILITIES_FILTER_VALUE);
    }
  }, [facilityFilterOptions, selectedFacilityFilterValue]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    if (selectedFacilityFilterValue !== ALL_FACILITIES_FILTER_VALUE) {
      return;
    }
    const firstFacilityValue = publicFacilityFilterOptions.find((option) => option.value !== ALL_FACILITIES_FILTER_VALUE)?.value;
    if (firstFacilityValue) {
      setSelectedFacilityFilterValue(firstFacilityValue);
    }
  }, [canManage, publicFacilityFilterOptions, selectedFacilityFilterValue]);

  useEffect(() => {
    if (!canManage) {
      return;
    }
    setSelection((prev) => {
      if (!facilityFilteredFieldIds.length) {
        return null;
      }
      const validIds = normalizeFieldIds(prev?.fieldIds ?? []).filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));
      if (prev && validIds.length) {
        return validIds.length === prev.fieldIds.length ? prev : { ...prev, fieldIds: validIds };
      }

      return { fieldIds: facilityFilteredFieldIds, ...initialManagerSelectionRange(prev) };
    });
  }, [canManage, facilityFilteredFieldIds]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    setReadonlyVisibleFieldIds((prev) => {
      const validIds = prev.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));
      if (validIds.length) {
        return validIds;
      }
      const preferredRentalFieldId = rentalListings.find((listing) => (
        facilityFilteredFieldIds.includes(listing.field.$id)
      ))?.field.$id;
      return preferredRentalFieldId ? [preferredRentalFieldId] : facilityFilteredFieldIds.slice(0, 1);
    });
  }, [canManage, facilityFilteredFieldIds, rentalListings]);

  const selectedFieldIds = useMemo(
    () => normalizeFieldIds(selectionFieldIds ?? []),
    [selectionFieldIds],
  );
  useEffect(() => {
    if (!canManage || !managerResourceSelectionStorageKey) {
      return;
    }
    if (managerResourceSelectionHydratedKeyRef.current !== managerResourceSelectionStorageKey) {
      return;
    }
    if (!selectedFieldIds.length) {
      return;
    }
    writeStoredManagerResourceFieldIds(managerResourceSelectionStorageKey, selectedFieldIds);
  }, [canManage, managerResourceSelectionStorageKey, selectedFieldIds]);
  const selectedFields = useMemo(
    () => fields.filter((field) => selectedFieldIds.includes(field.$id)),
    [fields, selectedFieldIds],
  );
  const selectedField = selectedFields[0] ?? null;
  const loadStaffSchedule = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!organizationId || !canManage) {
      setStaffScheduleAssignments([]);
      setStaffScheduleMembers([]);
      setStaffScheduleLoaded(false);
      return null;
    }
    setStaffScheduleLoading(true);
    if (!options.silent) {
      setStaffTimeslotError(null);
    }
    try {
      const response = await apiRequest<StaffScheduleResponse>(`/api/organizations/${organizationId}/staff/schedule`);
      setStaffScheduleAssignments(Array.isArray(response.assignments) ? response.assignments : []);
      setStaffScheduleMembers(Array.isArray(response.staffMembers) ? response.staffMembers : []);
      setStaffScheduleLoaded(true);
      return response;
    } catch (error) {
      if (!options.silent) {
        setStaffTimeslotError(error instanceof Error ? error.message : 'Failed to load staff options.');
      }
      setStaffScheduleLoaded(true);
      return null;
    } finally {
      setStaffScheduleLoading(false);
    }
  }, [canManage, organizationId]);

  useEffect(() => {
    setStaffScheduleAssignments([]);
    setStaffScheduleMembers([]);
    setStaffScheduleLoaded(false);
  }, [organizationId]);

  useEffect(() => {
    if (
      canManage
      && !staffScheduleLoaded
      && (
        calendarLayerFilters.includes('staff_assignment')
        || calendarLayerFilters.includes('official_assignment')
      )
    ) {
      void loadStaffSchedule({ silent: true });
    }
  }, [calendarLayerFilters, canManage, loadStaffSchedule, staffScheduleLoaded]);

  const isEditingManagerDraft = Boolean(editingManagerDraftId);
  const {
    staffTimeslotAssignmentKind, isEditingStaffAssignment, isEditingChildStaffAssignment, isAssigningStaffOccurrence,
  } = staffEditorState(staffTimeslotMode, editingStaffAssignment, staffTimeslotParentAssignment);
  const staffTimeslotUserOptions = useMemo(() => staffScheduleMembers
    .filter((staffMember) => (
      staffTimeslotAssignmentKind === 'OFFICIAL_SHIFT'
        ? Array.isArray(staffMember.types) && staffMember.types.includes('OFFICIAL')
        : true
    ))
    .map((staffMember) => ({
      value: staffMember.userId,
      label: `${staffMember.fullName}${staffMember.roleName ? ` - ${staffMember.roleName}` : ''}`,
    })), [staffScheduleMembers, staffTimeslotAssignmentKind]);

  useEffect(() => {
    setStaffTimeslotUserId((current) => (
      current && staffTimeslotUserOptions.some((option) => option.value === current)
        ? current
        : null
    ));
  }, [staffTimeslotUserOptions]);

  const getSelectionFacilityFilterValue = useCallback(
    (fieldIds: string[]): string => {
      const normalizedIds = normalizeFieldIds(fieldIds);
      const matchingFields = normalizedIds
        .map((fieldId) => fields.find((field) => field.$id === fieldId))
        .filter((field): field is Field => Boolean(field));
      if (!matchingFields.length) {
        return selectedFacilityFilterValue === ALL_FACILITIES_FILTER_VALUE
          ? publicFacilityFilterOptions.find((option) => option.value !== ALL_FACILITIES_FILTER_VALUE)?.value ?? ALL_FACILITIES_FILTER_VALUE
          : selectedFacilityFilterValue;
      }
      const facilityValues = Array.from(new Set(matchingFields.map((field) => getFieldFacilityFilterValue(field))));
      return facilityValues.length === 1 ? facilityValues[0] : ALL_FACILITIES_FILTER_VALUE;
    },
    [fields, publicFacilityFilterOptions, selectedFacilityFilterValue],
  );
  const readonlyCalendarFieldIds = useMemo(() => {
    if (canManage) {
      return [];
    }
    const validIds = readonlyVisibleFieldIds.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));
    return validIds.length ? validIds : facilityFilteredFieldIds;
  }, [canManage, facilityFilteredFieldIds, readonlyVisibleFieldIds]);
  const readonlyCalendarFields = useMemo(
    () => fields.filter((field) => readonlyCalendarFieldIds.includes(field.$id)),
    [fields, readonlyCalendarFieldIds],
  );
  const facilityCalendarFields = useMemo(
    () => (canManage ? selectedFields : readonlyCalendarFields),
    [canManage, readonlyCalendarFields, selectedFields],
  );
  const facilityCalendarFieldsWithPendingRentalUpdates = useMemo(() => {
    const pendingUpdates = Object.values(managerRentalSlotUpdates);
    if (!pendingUpdates.length) {
      return facilityCalendarFields;
    }
    return pendingUpdates.reduce<Field[]>((currentFields, update) => {
      if (update.action === 'delete') {
        return currentFields.map((field) => (
          field.$id === update.fieldId
            ? {
                ...field,
                rentalSlotIds: Array.isArray(field.rentalSlotIds)
                  ? field.rentalSlotIds.filter((slotId) => slotId !== update.slotId)
                  : field.rentalSlotIds,
                rentalSlots: Array.isArray(field.rentalSlots)
                  ? field.rentalSlots.filter((slot) => slot?.$id !== update.slotId)
                  : field.rentalSlots,
              }
            : field
        ));
      }
      const sourceSlot = currentFields
        .flatMap((field) => (Array.isArray(field.rentalSlots) ? field.rentalSlots : []))
        .find((slot) => slot?.$id === update.slotId) ?? ({ $id: update.slotId } as TimeSlot);
      return applyRentalSlotDragUpdateToFields(currentFields, sourceSlot, update.fieldId, update.slot);
    }, facilityCalendarFields);
  }, [facilityCalendarFields, managerRentalSlotUpdates]);
  const visibleStaffScheduleAssignments = useMemo(() => {
    const overrideEntries = Object.entries(managerStaffAssignmentOverrides);
    if (!overrideEntries.length) {
      return staffScheduleAssignments;
    }
    const parentDeleteIds = new Set(
      overrideEntries
        .filter(([, override]) => override.action === 'delete')
        .map(([assignmentId]) => assignmentId),
    );
    const createdAssignments = overrideEntries
      .flatMap(([, override]) => override.action === 'create' ? [override.assignment] : [])
      .filter((assignment) => (
        !assignment.parentAssignmentId || !parentDeleteIds.has(assignment.parentAssignmentId)
      ));
    const existingAssignments = staffScheduleAssignments
      .map((assignment) => {
        const override = managerStaffAssignmentOverrides[assignment.id];
        return override?.action === 'update' ? override.assignment : assignment;
      })
      .filter((assignment) => {
        const override = managerStaffAssignmentOverrides[assignment.id];
        if (override?.action === 'delete' || override?.action === 'unassign') {
          return false;
        }
        if (assignment.parentAssignmentId && parentDeleteIds.has(assignment.parentAssignmentId)) {
          return false;
        }
        return true;
      });
    return [...createdAssignments, ...existingAssignments];
  }, [managerStaffAssignmentOverrides, staffScheduleAssignments]);
  const handleReadonlyVisibleFieldIdsChange = useCallback((values: string[]) => {
    setReadonlyVisibleFieldIds(normalizeFieldIds(values));
  }, []);
  const handleSelectedFieldIdsChange = useCallback((values: string[]) => {
    const nextValues = normalizeFieldIds(values);
    setSelection((prev) => {
      if (!nextValues.length) {
        return prev;
      }
      if (!prev) {
        const start = new Date();
        const end = new Date(start.getTime() + MIN_SELECTION_MS);
        return { fieldIds: nextValues, start, end };
      }
      return { ...prev, fieldIds: nextValues };
    });
  }, []);
  const getFieldIdsForFacilityFilter = useCallback(
    (filterValue: string) => fields
      .filter((field) => fieldMatchesFacilityFilter(field, filterValue))
      .map((field) => field.$id),
    [fields],
  );
  const getPreferredFieldIdsForFacilityFilter = useCallback(
    (filterValue: string): string[] => {
      const fieldIds = getFieldIdsForFacilityFilter(filterValue);
      const preferredRentalFieldId = rentalListings.find((listing) => (
        fieldIds.includes(listing.field.$id)
      ))?.field.$id;
      return preferredRentalFieldId ? [preferredRentalFieldId] : fieldIds.slice(0, 1);
    },
    [getFieldIdsForFacilityFilter, rentalListings],
  );
  const staffTimeslotResourceFacilityValue = useMemo(
    () => getSelectionFacilityFilterValue(selectedFieldIds),
    [getSelectionFacilityFilterValue, selectedFieldIds],
  );
  const staffTimeslotResourceFields = useMemo(
    () => fields.filter((field) => fieldMatchesFacilityFilter(field, staffTimeslotResourceFacilityValue)),
    [fields, staffTimeslotResourceFacilityValue],
  );
  const staffTimeslotResourceOptions = useMemo(() => staffTimeslotResourceFields.map((field) => ({
    value: field.$id,
    label: getFacilityScopedFieldDisplayName(field),
  })), [staffTimeslotResourceFields]);
  const handleStaffTimeslotFacilityChange = useCallback((value: string | null) => {
    const nextValue = value || ALL_FACILITIES_FILTER_VALUE;
    const nextFieldIds = getPreferredFieldIdsForFacilityFilter(nextValue);
    handleSelectedFieldIdsChange(isEditingStaffAssignment ? nextFieldIds.slice(0, 1) : nextFieldIds);
  }, [getPreferredFieldIdsForFacilityFilter, handleSelectedFieldIdsChange, isEditingStaffAssignment]);
  const handleStaffTimeslotResourceChange = useCallback((values: string[]) => {
    const nextFieldIds = normalizeFieldIds(values);
    if (isEditingStaffAssignment) {
      const addedFieldId = nextFieldIds.find((fieldId) => !selectedFieldIds.includes(fieldId));
      handleSelectedFieldIdsChange(addedFieldId ? [addedFieldId] : nextFieldIds.slice(0, 1));
      return;
    }
    handleSelectedFieldIdsChange(nextFieldIds);
  }, [handleSelectedFieldIdsChange, isEditingStaffAssignment, selectedFieldIds]);
  const handleFacilityFilterChange = useCallback((value: string | null) => {
    const nextValue = value || ALL_FACILITIES_FILTER_VALUE;
    const nextFieldIds = getFieldIdsForFacilityFilter(nextValue);
    setSelectedFacilityFilterValue(nextValue);

    if (canManage) {
      setSelection((prev) => {
        if (!nextFieldIds.length) {
          return null;
        }
        const start = prev?.start ? new Date(prev.start) : new Date();
        start.setMinutes(0, 0, 0);
        const end = prev?.end && prev.end.getTime() > start.getTime()
          ? new Date(prev.end)
          : new Date(start.getTime() + MIN_SELECTION_MS);
        return { fieldIds: nextFieldIds, start, end };
      });
      return;
    }

    const preferredNextFieldIds = getPreferredFieldIdsForFacilityFilter(nextValue);
    setReadonlyVisibleFieldIds(preferredNextFieldIds);
    setRentalSelections((current) => current.map((selectionItem) => {
      const validSelectionFieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds)
        .filter((fieldId) => nextFieldIds.includes(fieldId));
      return {
        ...selectionItem,
        scheduledFieldIds: validSelectionFieldIds.length ? validSelectionFieldIds : preferredNextFieldIds,
      };
    }));
  }, [
    canManage,
    getFieldIdsForFacilityFilter,
    getPreferredFieldIdsForFacilityFilter,
    setRentalSelections,
  ]);
  const refreshOrganization = useCallback(async () => {
    if (!organizationId) return;
    try {
      const updated = await organizationService.getOrganizationById(organizationId, true);
      if (updated) {
        lastLoadedFieldEventsKeyRef.current = null;
        setOrg((prev) => mergeOrganizationPreservingFieldCalendarHydration(prev, updated));
      }
    } catch (error) {
      console.warn('Failed to refresh organization:', error);
    }
  }, [organizationId]);

  const computeCalendarRange = useMemo(() => {
    return (view: View, date: Date) => {
      switch (view) {
        case 'day':
          return { start: startOfDay(date), end: endOfDay(date) };
        case 'month':
          return { start: startOfMonth(date), end: endOfMonth(date) };
        case 'agenda':
        case 'week':
        default:
          return {
            start: startOfWeek(date, { weekStartsOn: 0 }),
            end: endOfWeek(date, { weekStartsOn: 0 }),
          };
      }
    };
  }, []);

  const calendarRange = useMemo(() => computeCalendarRange(calendarView, calendarDate), [computeCalendarRange, calendarView, calendarDate]);
  const calendarRangeStartMs = calendarRange.start.getTime();
  const calendarRangeEndMs = calendarRange.end.getTime();
  const fieldIdsToHydrate = useMemo(
    () => resolveFieldIdsForCalendarHydration({
      canManage,
      fields: canManage ? fields : readonlyCalendarFields,
      selectedFieldIds,
      rentalSelections,
    }),
    [canManage, fields, readonlyCalendarFields, rentalSelections, selectedFieldIds],
  );
  const fieldEventsRequestKey = useMemo(
    () => (
      fieldIdsToHydrate.length
        ? `${fieldIdsToHydrate.slice().sort().join(',')}:${calendarRangeStartMs}:${calendarRangeEndMs}`
        : null
    ),
    [fieldIdsToHydrate, calendarRangeStartMs, calendarRangeEndMs],
  );

  const selectionCalendarEvents = useMemo<SelectionCalendarEntry[]>(() => {
    if (!fields.length) {
      return [];
    }

    const byId = new Map(fields.map((field) => [field.$id, field]));
    const rangeStart = new Date(calendarRange.start.getTime());
    rangeStart.setHours(0, 0, 0, 0);
	    const rangeEnd = new Date(calendarRange.end.getTime());
	    rangeEnd.setHours(23, 59, 59, 999);
	    const staffMemberByUserId = new Map(staffScheduleMembers.map((member) => [member.userId, member]));
	    const draftChildCoverageByParentId = managerCalendarDrafts.reduce(
	      (acc, draft) => {
	        const parentDraftId = draft.staff?.parentDraftId ?? null;
	        if (!parentDraftId) {
	          return acc;
	        }
	        const occurrences = buildManagerCalendarDraftOccurrences(draft, rangeStart, rangeEnd);
	        if (!occurrences.length) {
	          return acc;
	        }
	        normalizeFieldIds(draft.fieldIds).forEach((fieldId) => {
	          const existing = acc.get(parentDraftId) ?? [];
	          occurrences.forEach((occurrence) => {
	            existing.push({
	              fieldId,
	              start: occurrence.start,
	              end: occurrence.end,
	            });
	          });
	          acc.set(parentDraftId, existing);
	        });
	        return acc;
	      },
	      new Map<string, Array<{ fieldId: string; start: Date; end: Date }>>(),
	    );

	    const draftEvents: SelectionCalendarEntry[] = [];
	    if (canManage) {
	      const visibleFieldIdSet = new Set(selectedFieldIds);
	      managerCalendarDrafts.forEach((draft) => {
        const occurrences = buildManagerCalendarDraftOccurrences(draft, rangeStart, rangeEnd);
        if (!occurrences.length) {
          return;
        }
        normalizeFieldIds(draft.fieldIds).forEach((fieldId) => {
          if (!visibleFieldIdSet.has(fieldId)) {
            return;
          }
          const field = byId.get(fieldId);
          if (!field) {
            return;
          }
          const assignedStaffName = draft.mode !== 'rental' && draft.staff?.userId
            ? staffMemberByUserId.get(draft.staff.userId)?.fullName ?? 'Staff name unavailable'
            : null;
	          occurrences.forEach((occurrence) => {
	            const coveredRanges = draft.staff?.parentDraftId
	              ? []
	              : (draftChildCoverageByParentId.get(draft.id) ?? [])
	                .filter((covered) => (
	                  covered.fieldId === fieldId
	                  && compareRanges(covered.start, covered.end, occurrence.start, occurrence.end)
	                ))
	                .map((covered) => ({ start: covered.start, end: covered.end }));
	            const visibleRanges = coveredRanges.length
	              ? subtractIntervals(occurrence, coveredRanges)
	              : [occurrence];
	            visibleRanges.forEach((visibleRange) => {
	              draftEvents.push({
	                id: `manager-draft-${draft.id}-${fieldId}-${visibleRange.start.getTime()}`,
	                title: assignedStaffName ?? MANAGER_SELECTION_TITLES[draft.mode],
	                start: visibleRange.start,
	                end: visibleRange.end,
	                resourceId: fieldId,
	                resource: {
	                  type: 'selection',
	                  slotKey: draft.id,
	                  mode: draft.mode,
	                  userId: draft.mode !== 'rental' ? draft.staff?.userId ?? null : null,
	                },
	                metaType: 'selection',
	                selectionMode: draft.mode,
	                fieldName: getFacilityScopedFieldDisplayName(field),
	              });
	            });
	          });
	        });
	      });
      return draftEvents;
    }

    if (!rentalSelections.length) {
      return [];
    }

    rentalSelections.forEach((selectionItem, slotIndex) => {
      const fieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds);
      const dateRange = resolveSelectionDateRange(selectionItem);
      if (!fieldIds.length || !dateRange) {
        return;
      }
      if (!compareRanges(dateRange.start, dateRange.end, rangeStart, rangeEnd)) {
        return;
      }

      const visibleFieldIdSet = new Set(readonlyCalendarFieldIds);
      fieldIds.forEach((fieldId) => {
        if (!visibleFieldIdSet.has(fieldId)) {
          return;
        }
        const field = byId.get(fieldId);
        if (!field) {
          return;
        }
        draftEvents.push({
          id: `selection-${selectionItem.key}-${fieldId}-${dateRange.start.getTime()}`,
          title: `Selection ${slotIndex + 1}`,
          start: dateRange.start,
          end: dateRange.end,
          resourceId: fieldId,
          resource: { type: 'selection', slotKey: selectionItem.key },
          metaType: 'selection',
          fieldName: getFacilityScopedFieldDisplayName(field),
        });
      });
    });
    return draftEvents;
  }, [
    calendarRange.end,
    calendarRange.start,
    canManage,
    fields,
    managerCalendarDrafts,
    readonlyCalendarFieldIds,
    rentalSelections,
    selectedFieldIds,
    staffScheduleMembers,
  ]);

  const baseCalendarEvents = useMemo<FieldCalendarEntry[]>(() => {
    const sourceFields = facilityCalendarFieldsWithPendingRentalUpdates;
    if (!sourceFields.length) {
      return [];
    }
    const events = buildFieldCalendarEvents(sourceFields, calendarRange) as FieldCalendarEntry[];
    if (!canManage) {
      return buildPublicRentalCalendarEvents(events);
    }
    const seenBookedKeys = new Set<string>();
    return events.filter((event) => {
      if (event.metaType !== 'booked') {
        return true;
      }
      const resource = event.resource as { $id?: string } | undefined;
      const resourceId = typeof resource?.$id === 'string' ? resource.$id : '';
      const entryType = event.id.includes('field-booked-match-') ? 'match' : 'event';
      const dedupeKey = `${entryType}:${resourceId || event.start.toISOString()}:${event.end.toISOString()}`;
      if (seenBookedKeys.has(dedupeKey)) {
        return false;
      }
      seenBookedKeys.add(dedupeKey);
      return true;
    });
  }, [calendarRange, canManage, facilityCalendarFieldsWithPendingRentalUpdates]);

  const facilityCalendarFeed = useMemo(
    () => buildFacilityCalendarFeed(facilityCalendarFieldsWithPendingRentalUpdates, calendarRange),
    [calendarRange, facilityCalendarFieldsWithPendingRentalUpdates],
  );
  const facilityCalendarSummary = facilityCalendarFeed.summary;
  const conflictingEventIds = useMemo(() => new Set(facilityCalendarSummary.conflicts.flatMap(
    (conflict) => [conflict.rentalEntryId, conflict.bookingEntryId],
  )), [facilityCalendarSummary.conflicts]);
  const staffScheduleCalendarItems = useMemo(
    () => buildStaffScheduleCalendarItems({
      assignments: visibleStaffScheduleAssignments,
      fields: facilityCalendarFieldsWithPendingRentalUpdates,
      facilities,
      range: calendarRange,
    }),
    [calendarRange, facilities, facilityCalendarFieldsWithPendingRentalUpdates, visibleStaffScheduleAssignments],
  );
  const facilityFeedCalendarEvents = useMemo<FacilityFeedCalendarEntry[]>(() => (
    [...facilityCalendarFeed.items, ...staffScheduleCalendarItems]
      .filter((item) => FACILITY_FEED_CALENDAR_TYPES.has(item.type))
      .map((item) => ({
        id: item.id,
        title: item.title,
        start: item.start,
        end: item.end,
        resourceId: item.fieldId,
        resource: item,
        metaType: 'facility-feed' as const,
        feedType: item.type,
        fieldName: item.fieldName,
      }))
  ), [facilityCalendarFeed.items, staffScheduleCalendarItems]);
  const unfilteredCalendarEvents = useMemo<CalendarEventData[]>(
    () => [...baseCalendarEvents, ...facilityFeedCalendarEvents, ...selectionCalendarEvents],
    [baseCalendarEvents, facilityFeedCalendarEvents, selectionCalendarEvents],
  );
  const calendarLayerCounts = useMemo(() => {
    const counts = new Map<CalendarLayerType, number>();
    unfilteredCalendarEvents.forEach((event) => {
      const layer = getCalendarEventLayer(event);
      if (!layer) {
        return;
      }
      counts.set(layer, (counts.get(layer) ?? 0) + 1);
    });
    return counts;
  }, [unfilteredCalendarEvents]);
  const activeCalendarLayerSet = useMemo(
    () => new Set(calendarLayerFilters),
    [calendarLayerFilters],
  );
  const calendarEvents = useMemo<CalendarEventData[]>(() => {
    if (!canManage) {
      return unfilteredCalendarEvents;
    }
    return unfilteredCalendarEvents.filter((event) => {
      const layer = getCalendarEventLayer(event);
      return !layer || activeCalendarLayerSet.has(layer);
    });
  }, [activeCalendarLayerSet, canManage, unfilteredCalendarEvents]);
  const staffAssignmentCalendarEventById = useMemo(() => new Map(calendarEvents
    .filter((event) => (
      event.metaType === 'facility-feed'
      && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
    ))
    .map((event) => [event.id, event as FacilityFeedCalendarEntry])), [calendarEvents]);
  const allCalendarLayersSelected = CALENDAR_LAYER_ORDER.every((layer) => activeCalendarLayerSet.has(layer));
  const toggleCalendarLayer = useCallback((type: CalendarLayerType) => {
    setCalendarLayerFilters((current) => (
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type]
    ));
  }, []);
  const facilityCalendarRangeLabel = useMemo(
    () => `${formatDisplayDate(calendarRange.start, { year: '2-digit' })} - ${formatDisplayDate(calendarRange.end, { year: '2-digit' })}`,
    [calendarRange.end, calendarRange.start],
  );

  const defaultTimeRange = useMemo<[number, number]>(() => [8, 22], []);
  const minTime = useMemo(() => new Date(1970, 0, 1, defaultTimeRange[0], 0, 0), [defaultTimeRange]);
  const maxTime = useMemo(() => {
    const hour = Math.min(24, Math.max(defaultTimeRange[1], defaultTimeRange[0] + 1));
    if (hour >= 24) {
      return new Date(1970, 0, 1, 23, 59, 59, 999);
    }
    return new Date(1970, 0, 1, hour, 0, 0);
  }, [defaultTimeRange]);
  const calendarBlockers = useMemo(
    () => baseCalendarEvents.filter((event) => event.metaType === 'booked'),
    [baseCalendarEvents],
  );
  const isBlockedRange = useCallback(
    (start: Date, end: Date, resourceId?: string) => {
      if (canManage) {
        return false;
      }
      const normalizedEnd = end.getTime() > start.getTime()
        ? end
        : new Date(start.getTime() + MIN_SELECTION_MS);
      return calendarBlockers.some((blocker) => (
        (!resourceId || blocker.resourceId === resourceId)
        && compareRanges(start, normalizedEnd, blocker.start, blocker.end)
      ));
    },
    [calendarBlockers, canManage],
  );

  const handleCalendarShellStaffEventActivation = useCallback((event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    if (!canManage) {
      return;
    }
    if (isStaffAssignmentActivationSuppressed()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (closestCalendarElement(event.target, 'button')) {
      return;
    }
    if (managerCalendarEditMode && isCalendarRangeHandle(event.target)) {
      return;
    }
    const eventId = calendarStaffEventId(event.target);
    if (!eventId) {
      return;
    }
    const calendarEvent = staffAssignmentCalendarEventById.get(eventId);
    if (!calendarEvent || !isStaffFeedEvent(calendarEvent, canManage)) {
      return;
    }
    event.stopPropagation();
    openStaffAssignmentEditModalRef.current?.(calendarEvent.resource, calendarEvent.start, calendarEvent.end);
  }, [canManage, isStaffAssignmentActivationSuppressed, managerCalendarEditMode, staffAssignmentCalendarEventById]);

  const handleCalendarShellStaffPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canManage || !managerCalendarEditMode) {
      return;
    }
    if (isCalendarRangeHandle(event.target)) {
      suppressStaffAssignmentActivation(1200);
    }
  }, [canManage, managerCalendarEditMode, suppressStaffAssignmentActivation]);

  const eventPropGetter = useCallback(
    (event: CalendarEventData) => {
      const isStaffAssignmentEvent = isStaffFeedEvent(event, canManage);
      return {
        className: calendarEventClassName(event, canManage),
        style: {
          backgroundColor: 'transparent',
          border: 0,
          color: 'inherit',
          padding: 0,
          cursor: calendarEventCursor(event, canManage, managerCalendarEditMode),
        },
        onPointerUp: isStaffAssignmentEvent && !managerCalendarEditMode
          ? (pointerEvent: ReactPointerEvent<HTMLElement>) => {
              if (isStaffAssignmentActivationSuppressed()) {
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                return;
              }
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
              const item = event.resource as FacilityCalendarFeedItem | undefined;
              if (item && event.start && event.end) {
                openStaffAssignmentEditModalRef.current?.(item, event.start, event.end);
              }
          }
        : undefined,
        ...calendarDraftDataAttributes(event),
      };
    },
    [canManage, isStaffAssignmentActivationSuppressed, managerCalendarEditMode],
  );
  const slotPropGetter = useCallback(
    (date: Date, resourceId?: string | number) => {
      if (canManage) {
        return {};
      }
      const normalizedResourceId =
        typeof resourceId === 'string'
          ? resourceId
          : typeof resourceId === 'number'
            ? String(resourceId)
            : undefined;
      const slotStart = new Date(date.getTime());
      const slotEnd = new Date(slotStart.getTime() + SLOT_STEP_MINUTES * 60 * 1000);
      const isPastSlot = isPastRentalRangeStart(slotStart);
      if (!isPastSlot && !isBlockedRange(slotStart, slotEnd, normalizedResourceId)) {
        return {};
      }
      return {
        style: {
          backgroundColor: isPastSlot ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.22)',
          backgroundImage: isPastSlot
            ? 'repeating-linear-gradient(135deg, rgba(100, 116, 139, 0.16) 0 6px, transparent 6px 12px)'
            : undefined,
          cursor: 'not-allowed',
        },
      };
    },
    [canManage, isBlockedRange],
  );
  useEffect(() => {
    if (!fieldEventsRequestKey || !fieldIdsToHydrate.length) return;
    if (lastLoadedFieldEventsKeyRef.current === fieldEventsRequestKey) return;
    let cancelled = false;

    (async () => {
      try {
        setFieldEventsLoading(true);
        const sourceFieldsById = new Map(fields.map((field) => [field.$id, field]));
        const hydratedRows = await Promise.all(
          fieldIdsToHydrate.map(async (fieldId) => {
            const source = sourceFieldsById.get(fieldId);
            if (!source) {
              return null;
            }
            return fieldService.getFieldEventsMatches(
              source,
              {
                start: new Date(calendarRangeStartMs).toISOString(),
                end: new Date(calendarRangeEndMs).toISOString(),
              },
            );
          }),
        );
        if (cancelled) return;
        const hydratedById = new Map(
          hydratedRows
            .filter((row): row is Field => Boolean(row))
            .map((row) => [row.$id, row]),
        );

        setOrg((prev) => {
          if (!prev || !prev.fields) return prev;
          const nextFields = prev.fields.map((field) =>
            mergeHydratedCalendarField(field, hydratedById.get(field.$id)),
          );
          const changed = nextFields.some((field, index) => field !== prev.fields?.[index]);
          return changed ? { ...prev, fields: nextFields } : prev;
        });
        lastLoadedFieldEventsKeyRef.current = fieldEventsRequestKey;
      } catch (error) {
        console.error('Failed to load events/matches for field', error);
      } finally {
        if (!cancelled) {
          setFieldEventsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [calendarRangeEndMs, calendarRangeStartMs, canManage, fieldEventsRequestKey, fieldIdsToHydrate, fields]);

  const summaryColor = useMemo(() => {
    if (!currentUser) return 'dimmed';
    if (hasPendingConflictChecks) return 'yellow';
    return canReserveRentalResources ? 'teal' : 'red';
  }, [canReserveRentalResources, currentUser, hasPendingConflictChecks]);

  const summaryText = useMemo(() => {
    if (!currentUser) {
      return 'Sign in to reserve resources.';
    }
    if (!rentalSelections.length) {
      return 'Add at least one rental selection.';
    }
    if (hasPendingConflictChecks) {
      return 'Checking resource conflicts for your selections...';
    }
    if (!canReserveRentalResources) {
      return 'Resolve selection errors before reserving resources.';
    }
    return `${rentalSelections.length} selection${rentalSelections.length === 1 ? '' : 's'} ready • Total ${formatPrice(totalRentalCents)}`;
  }, [canReserveRentalResources, currentUser, hasPendingConflictChecks, rentalSelections.length, totalRentalCents]);

  const applyManagerSelectionWindow = useCallback(
    (start: Date, end: Date, params: CalendarSelectionWindowOptions) => {
      const nextStart = new Date(start);
      const nextEnd = new Date(Math.max(end.getTime(), nextStart.getTime() + MIN_SELECTION_MS));
      if (!params.slotKey) {
        setSelection((prev) => {
          if (!prev?.fieldIds.length) return prev;
          return { ...prev, start: nextStart, end: nextEnd };
        });
        return;
      }

      const matchingDraft = managerCalendarDrafts.find((draft) => draft.id === params.slotKey);
      const targetFieldIds = typeof params.resourceId === 'string' && params.resourceId.trim().length > 0
        ? [params.resourceId.trim()]
        : matchingDraft?.fieldIds;
      stageManagerCalendarDraftUpdate(
        params.slotKey,
        (draft) => {
          const nextDraft = buildManagerCalendarDraftWithCalendarRange(draft, nextStart, nextEnd, {
            preserveRepeatingPattern: draft.mode === 'rental'
              ? Boolean(draft.rental?.repeating)
              : Boolean(draft.staff?.repeating),
          });
          return {
            ...(nextDraft ?? draft),
            fieldIds: targetFieldIds?.length ? targetFieldIds : normalizeFieldIds(draft.fieldIds),
          };
        },
        params.interaction === 'resize' ? 'Resized draft card' : 'Moved draft card',
      );
      setSelection((prev) => ({
        fieldIds: targetFieldIds?.length
          ? normalizeFieldIds(targetFieldIds)
          : normalizeFieldIds(prev?.fieldIds ?? []),
        start: nextStart,
        end: nextEnd,
      }));
    },
    [managerCalendarDrafts, stageManagerCalendarDraftUpdate],
  );

  const applyPublicSelectionWindow = useCallback(
    (start: Date, end: Date, slotKey: string) => {
      if (isPastRentalRangeStart(start)) {
        notifications.show({
          color: 'red',
          message: 'Rental selections must start in the future.',
        });
        return false;
      }
      const current = rentalSelections.find((item) => item.key === slotKey);
      if (!current) return true;
      const candidate = updateSelectionWithCalendarRange(current, start, end);
      const isBlocked = normalizeFieldIds(candidate.scheduledFieldIds)
        .some((fieldId) => isBlockedRange(start, end, fieldId));
      if (isBlocked) {
        notifications.show({
          color: 'red',
          message: 'That time range is already booked on at least one selected resource.',
        });
        return false;
      }
      setRentalSelections((prev) => prev.map((item) => (
        item.key === slotKey ? updateSelectionWithCalendarRange(item, start, end) : item
      )));
      return true;
    },
    [isBlockedRange, rentalSelections, setRentalSelections],
  );

  const applySelectionWindow = useCallback(
    (start: Date, end: Date, params: CalendarSelectionWindowOptions = {}) => {
      if (canManage) {
        applyManagerSelectionWindow(start, end, params);
      } else if (params.slotKey && !applyPublicSelectionWindow(start, end, params.slotKey)) {
        return;
      }
      setCalendarDate(new Date(start));
    },
    [applyManagerSelectionWindow, applyPublicSelectionWindow, canManage],
  );

  const handleRentalSlotCalendarDrop = useCallback(
    ({ event, start, end, resourceId }: any) => {
      if (!canManage) return;
      const context = rentalCalendarDropContext(event, start, end);
      if (!context) return;
      const { slot, range } = context;
      const { start: nextStart, end: nextEnd } = range;
      const fieldId = calendarTargetResourceId(resourceId, event.resourceId) ?? '';
      const ownerField = fields.find((field) => field.$id === fieldId) ?? selectedField;
      if (!ownerField) {
        notifications.show({ color: 'red', message: 'Unable to resolve the rental slot resource.' });
        return;
      }

      const updatePayload = buildRentalSlotUpdateFromCalendarRange(slot, nextStart, nextEnd, ownerField.$id);
      if (!updatePayload) {
        notifications.show({ color: 'red', message: 'Unable to move this rental slot.' });
        return;
      }

      const pendingKey = getRentalSlotPendingUpdateKey(ownerField.$id, slot.$id);
      stageRentalSlotUpdate({
        key: pendingKey,
        action: 'update',
        fieldId: ownerField.$id,
        slotId: slot.$id,
        slot: updatePayload,
      });
      setCalendarDate(nextStart);
      notifications.show({ color: 'blue', message: 'Rental slot change staged.' });
    },
    [canManage, fields, selectedField, stageRentalSlotUpdate],
  );

  const handleStaffAssignmentCalendarDrop = useCallback(
    ({ event, start, end, resourceId }: any, label: string, interaction: 'move' | 'resize' = 'move') => {
      if (!event || !isStaffFeedEvent(event, canManage) || !start || !end) return;
      suppressStaffAssignmentActivation(900);
      const prepared = prepareStaffCalendarRangeChange(
        { event, start, end, resourceId }, visibleStaffScheduleAssignments, fields, interaction,
      );
      if (!prepared) return;
      if ('error' in prepared) {
        notifications.show(prepared.error);
        return;
      }
      if (prepared.overrides.length === 1) {
        const change = prepared.overrides[0];
        stageStaffAssignmentOverride(change.assignmentId, change.override, label);
      } else {
        stageStaffAssignmentOverrideBatch(prepared.overrides, label);
      }
      setCalendarDate(prepared.start);
      notifications.show({
        color: 'blue',
        message: prepared.overrides.length > 1
          ? 'Staff assignment series changes staged.'
          : 'Staff assignment change staged.',
      });
    },
    [canManage, fields, stageStaffAssignmentOverride, stageStaffAssignmentOverrideBatch, suppressStaffAssignmentActivation, visibleStaffScheduleAssignments],
  );

  const handleSlotSelect = useCallback(
    (slotInfo: any) => {
      if (!slotInfo?.start) return;
      const slotStart = new Date(slotInfo.start);
      const slotEndRaw = slotInfo?.end ? new Date(slotInfo.end) : new Date(slotStart.getTime() + MIN_SELECTION_MS);
      if (canManage) {
        if (managerCalendarEditMode && typeof slotInfo.resourceId === 'string') {
          managerCreateDraftAdderRef.current?.('rental', { start: slotStart, end: slotEndRaw, fieldIds: [slotInfo.resourceId] });
        }
        return;
      }

      const slotEnd = slotEndRaw;
      if (isPastRentalRangeStart(slotStart)) {
        notifications.show({
          color: 'red',
          message: 'Rental selections must start in the future.',
        });
        return;
      }
      const { fieldIds: selectedResourceFieldIds, primaryFieldId: primaryResourceFieldId } =
        rentalCalendarSelectionResources(slotInfo.resourceId, readonlyCalendarFieldIds, fields);
      if (!primaryResourceFieldId) {
        return;
      }
      if (selectedResourceFieldIds.some((fieldId) => isBlockedRange(slotStart, slotEnd, fieldId))) {
        notifications.show({
          color: 'red',
          message: 'That time range is already booked for one of the selected resources.',
        });
        return;
      }
      const nextSelection = {
        ...buildSelectionFromCalendarRange(slotStart, slotEnd, primaryResourceFieldId),
        scheduledFieldIds: selectedResourceFieldIds.length ? selectedResourceFieldIds : [primaryResourceFieldId],
      };
      setRentalSelections((prev) => [nextSelection, ...prev]);
      setCalendarDate(slotStart);
    },
    [canManage, managerCalendarEditMode, fields, isBlockedRange, readonlyCalendarFieldIds, setRentalSelections],
  );

  const handleCalendarEventRangeChange = useCallback(
    ({ event, start, end, resourceId }: CalendarRangeChange, interaction: 'move' | 'resize') => {
      if (!event || !canChangeFacilityEventRange(event, canManage, managerCalendarEditMode)) return;
      const targetResourceId = interaction === 'resize' ? event.resourceId : resourceId;
      if (event.metaType === 'rental') {
        handleRentalSlotCalendarDrop({ event, start, end, resourceId: targetResourceId });
        return;
      }
      if (isStaffFeedEvent(event, canManage)) {
        handleStaffAssignmentCalendarDrop(
          { event, start, end, resourceId: targetResourceId },
          interaction === 'resize' ? 'Resized staff assignment' : 'Moved staff assignment',
          interaction,
        );
        return;
      }
      if (event.metaType !== 'selection' || !start || !end) return;
      applySelectionWindow(
        new Date(start), new Date(end), calendarSelectionChangeOptions(event, resourceId, interaction),
      );
    },
    [applySelectionWindow, canManage, handleRentalSlotCalendarDrop, handleStaffAssignmentCalendarDrop, managerCalendarEditMode],
  );

  const handleEventDrop = useCallback(
    (change: CalendarRangeChange) => handleCalendarEventRangeChange(change, 'move'),
    [handleCalendarEventRangeChange],
  );

  const handleEventResize = useCallback(
    (change: CalendarRangeChange) => handleCalendarEventRangeChange(change, 'resize'),
    [handleCalendarEventRangeChange],
  );
  useEffect(() => {
    if (!currentUser) {
      setHostOrganizations([]);
      setHostSelection('self');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setHostOptionsLoading(true);
        const orgs = await organizationService.getOrganizationsByOwner(currentUser.$id);
        if (cancelled) return;
        setHostOrganizations(orgs);
        setHostSelection((prev) => {
          if (prev !== 'self' && !orgs.some((org) => org.$id === prev)) {
            return 'self';
          }
          return prev;
        });
      } catch (error) {
        console.warn('Failed to load organizations for user:', error);
        if (!cancelled) {
          setHostOrganizations([]);
          setHostSelection('self');
        }
      } finally {
        if (!cancelled) {
          setHostOptionsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const hostSelectOptions = useMemo(() => {
    const base = [{ value: 'self', label: 'My personal account' }];
    if (!hostOrganizations.length) {
      return base;
    }
    return [
      ...base,
      ...hostOrganizations.map((org) => ({
        value: org.$id,
        label: org.name || 'Untitled Organization',
      })),
    ];
  }, [hostOrganizations]);

  const handleReserveResourcesClick = useCallback(() => {
    if (!currentUser) {
      notifications.show({ color: 'yellow', message: 'Sign in to reserve resources.' });
      return;
    }
    if (canManage) {
      return;
    }
    if (!canReserveRentalResources || !rentalSelectionValidations.length) {
      notifications.show({ color: 'red', message: 'Resolve rental selection issues before reserving resources.' });
      return;
    }

    const serializedSelections = rentalSelectionValidations
      .map(({ selection: selectionItem }) => {
        const dateRange = resolveSelectionDateRange(selectionItem);
        if (!dateRange) {
          return null;
        }
        const dayOfWeek = mondayDayOf(dateRange.start);
        return {
          key: selectionItem.key,
          scheduledFieldIds: normalizeFieldIds(selectionItem.scheduledFieldIds),
          dayOfWeek,
          daysOfWeek: [dayOfWeek],
          startTimeMinutes: dateRange.start.getHours() * 60 + dateRange.start.getMinutes(),
          endTimeMinutes: dateRange.end.getHours() * 60 + dateRange.end.getMinutes(),
          startDate: formatLocalDateTime(dateRange.start),
          endDate: formatLocalDateTime(dateRange.end),
          repeating: false,
        };
      })
      .filter((selectionItem): selectionItem is RentalSelectionCheckoutSelection => Boolean(selectionItem));
    if (!serializedSelections.length) {
      notifications.show({ color: 'red', message: 'No valid rental selections were found.' });
      return;
    }

    const checkout = buildRentalSelectionCheckout({
      eventId: createId(),
      rentalSelections: serializedSelections,
      fields,
      facilities,
      organization: org,
      hostSelection,
      totalRentalCents,
      requiredTemplateIds: rentalRequiredTemplateIds,
      hostRequiredTemplateIds: rentalHostRequiredTemplateIds,
    });
    if (onRentalSelectionReady) {
      onRentalSelectionReady(checkout);
      return;
    }
    notifications.show({
      color: 'red',
      message: 'Rental checkout is not available on this page.',
    });
  }, [currentUser, canManage, canReserveRentalResources, rentalSelectionValidations, fields, facilities, org, totalRentalCents, rentalRequiredTemplateIds, rentalHostRequiredTemplateIds, hostSelection, onRentalSelectionReady]);

  const openRentalSlotModalForSelection = useCallback((
    draftSelection?: SelectionState | null,
    options: { draftId?: string | null } = {},
  ) => {
    if (!canManage) return;
    const prepared = prepareCalendarEditorSelection(draftSelection ?? selection, 'Rental slots');
    if ('error' in prepared) {
      notifications.show({ color: 'red', message: prepared.error });
      return;
    }
    const activeSelection = prepared.selection;

    setSelectedManagerDraftId(options.draftId ?? null);
    setEditingManagerDraftId(options.draftId ?? null);
    setEditingRentalSlot(null);
    setEditingRentalField(null);
    setRentalDraftRange({ start: activeSelection.start, end: activeSelection.end });
    setCreateRentalOpen(true);
  }, [canManage, selection, setEditingManagerDraftId, setSelectedManagerDraftId]);

  const resetStaffTimeslotModalState = useCallback(() => {
    setStaffTimeslotModalOpen(false);
    setStaffTimeslotParentAssignment(null);
    setEditingStaffAssignment(null);
    setEditingManagerDraftId(null);
    setStaffTimeslotUserId(null);
    setStaffTimeslotOverrideAmount('');
    setStaffTimeslotNotes('');
    setStaffTimeslotRepeating(false);
    setStaffTimeslotRepeatDays([]);
    setStaffTimeslotRepeatEndDate(null);
    setStaffTimeslotError(null);
    setOpenStaffDeleteConfirmation(null);
    setStaffAssignmentScopePrompt(null);
  }, [setEditingManagerDraftId]);

  const openStaffTimeslotModal = useCallback((
    mode: Exclude<ManagerCalendarSelectionMode, 'rental'>,
    draftSelection?: SelectionState | null,
    options: { draftId?: string | null; draft?: ManagerCalendarDraft | null } = {},
  ) => {
    if (!canManage) {
      return;
    }
    const prepared = prepareCalendarEditorSelection(draftSelection ?? selection, 'Staff timeslots');
    if ('error' in prepared) {
      notifications.show({ color: 'red', message: prepared.error });
      return;
    }
    const values = staffEditorValues(options.draft?.staff, prepared.selection.start);
    setSelectedManagerDraftId(options.draftId ?? null);
    setEditingManagerDraftId(options.draftId ?? null);
    setEditingStaffAssignment(null);
    setStaffTimeslotParentAssignment(null);
    setStaffTimeslotMode(mode);
    setStaffTimeslotUserId(values.userId);
    setStaffTimeslotOverrideAmount(values.overrideAmount);
    setStaffTimeslotNotes(values.notes);
    setStaffTimeslotRepeating(values.repeating);
    setStaffTimeslotRepeatDays(values.repeatDays);
    setStaffTimeslotRepeatEndDate(values.repeatEndDate);
    setStaffTimeslotError(null);
    setStaffTimeslotModalOpen(true);
    if (!staffScheduleLoaded) {
      void loadStaffSchedule();
    }
  }, [canManage, loadStaffSchedule, selection, setEditingManagerDraftId, setSelectedManagerDraftId, staffScheduleLoaded]);

  const openManagerCalendarDraftEditor = useCallback((draftId: string, fallbackDraft: ManagerCalendarDraft | null = null) => {
    const draft = managerCalendarDrafts.find((candidate) => candidate.id === draftId) ?? fallbackDraft;
    if (!draft) {
      return;
    }
    const draftSelection = {
      fieldIds: normalizeFieldIds(draft.fieldIds),
      start: new Date(draft.start),
      end: new Date(draft.end),
    };
    setSelection(draftSelection);
    setCalendarDate(new Date(draft.start));
    setSelectedManagerDraftId(draft.id);
    if (draft.mode === 'rental') {
      openRentalSlotModalForSelection(draftSelection, { draftId: draft.id });
      return;
    }
    openStaffTimeslotModal(draft.mode, draftSelection, { draftId: draft.id, draft });
  }, [managerCalendarDrafts, openRentalSlotModalForSelection, openStaffTimeslotModal, setSelectedManagerDraftId]);

  openManagerCalendarDraftEditorRef.current = (draftId: string) => {
    openManagerCalendarDraftEditor(draftId);
  };

  const resolveRentalModalPayloadRange = useCallback((payload: CreateRentalSlotModalSubmitPayload['payload']) => {
    const startDate = parseLocalDateTime(payload.startDate ?? null) ?? new Date();
    const startDay = startOfDay(startDate);
    const startMinutes = typeof payload.startTimeMinutes === 'number'
      ? payload.startTimeMinutes
      : startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = typeof payload.endTimeMinutes === 'number'
      ? payload.endTimeMinutes
      : startMinutes + Math.round(MIN_SELECTION_MS / 60000);
    const start = payload.repeating
      ? dateWithMinutes(startDay, startMinutes)
      : startDate;
    const parsedEndDate = payload.endDate ? parseLocalDateTime(payload.endDate) : null;
    const end = payload.repeating
      ? dateWithMinutes(startDay, endMinutes)
      : parsedEndDate ?? new Date(start.getTime() + MIN_SELECTION_MS);
    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + MIN_SELECTION_MS);
    }
    return { start, end };
  }, []);

  const handleRentalSlotModalSubmit = useCallback(async (submitPayload: CreateRentalSlotModalSubmitPayload) => {
    if (editingManagerDraftId && !submitPayload.slot) {
      const targetFieldIds = normalizeFieldIds(submitPayload.targetFields.map((targetField) => targetField.$id));
      if (!targetFieldIds.length) {
        throw new Error('Select at least one resource for this draft.');
      }
      const range = resolveRentalModalPayloadRange(submitPayload.payload);
      const updatedDraft = stageManagerCalendarDraftUpdate(
        editingManagerDraftId,
        (draft) => ({
          ...draft,
          mode: 'rental',
          fieldIds: targetFieldIds,
          start: range.start,
          end: range.end,
          rental: {
            repeating: Boolean(submitPayload.payload.repeating),
            dayOfWeek: submitPayload.payload.dayOfWeek,
            daysOfWeek: Array.isArray(submitPayload.payload.daysOfWeek)
              ? submitPayload.payload.daysOfWeek
              : [submitPayload.payload.dayOfWeek],
            startDate: submitPayload.payload.startDate,
            endDate: submitPayload.payload.endDate ?? null,
            startTimeMinutes: submitPayload.payload.startTimeMinutes ?? null,
            endTimeMinutes: submitPayload.payload.endTimeMinutes ?? null,
            price: submitPayload.payload.price ?? 0,
            requiredTemplateIds: submitPayload.payload.requiredTemplateIds ?? [],
            hostRequiredTemplateIds: submitPayload.payload.hostRequiredTemplateIds ?? [],
          },
        }),
        'Edited draft rental slot',
      );
      setEditingManagerDraftId(null);
      if (updatedDraft) {
        notifications.show({ color: 'blue', message: 'Draft rental slot change staged.' });
      }
      return;
    }

    const change = rentalSlotModalChange(submitPayload);
    if (managerCalendarEditMode && change) {
      stageRentalSlotUpdate(change, 'Edited rental slot');
      notifications.show({ color: 'blue', message: 'Rental slot change staged.' });
      return;
    }
  }, [editingManagerDraftId, managerCalendarEditMode, resolveRentalModalPayloadRange, setEditingManagerDraftId, stageManagerCalendarDraftUpdate, stageRentalSlotUpdate]);

  const handleRentalSlotModalDelete = useCallback(async ({ field, slot }: { field: Field | null; slot: TimeSlot }) => {
    if (!managerCalendarEditMode || !field?.$id || !slot?.$id) {
      return;
    }
    const pendingKey = getRentalSlotPendingUpdateKey(field.$id, slot.$id);
    stageRentalSlotUpdate({
      key: pendingKey,
      action: 'delete',
      fieldId: field.$id,
      slotId: slot.$id,
    }, 'Deleted rental slot');
    notifications.show({ color: 'blue', message: 'Rental slot delete staged.' });
  }, [managerCalendarEditMode, stageRentalSlotUpdate]);

  const staffTimeslotForm = useMemo<StaffTimeslotForm>(() => ({
    mode: staffTimeslotMode,
    userId: staffTimeslotUserId ?? '',
    overrideAmount: staffTimeslotOverrideAmount,
    notes: staffTimeslotNotes,
    repeating: staffTimeslotRepeating,
    repeatDays: staffTimeslotRepeatDays,
    repeatEndDate: staffTimeslotRepeatEndDate,
  }), [
    staffTimeslotMode, staffTimeslotUserId, staffTimeslotOverrideAmount, staffTimeslotNotes,
    staffTimeslotRepeating, staffTimeslotRepeatDays, staffTimeslotRepeatEndDate,
  ]);

  const applyStaffDraftEdit = useCallback((draftId: string) => {
    const draft = managerCalendarDrafts.find((candidate) => candidate.id === draftId);
    if (!draft) throw new Error('Unable to resolve this draft assignment.');
    const plan = planStaffDraftEdit({
      draft, form: staffTimeslotForm, selection, fields: selectedFields,
      fieldIds: selectedFieldIds, members: staffScheduleMembers,
    });
    if (plan.type === 'scope') {
      setStaffAssignmentScopePrompt(plan.prompt);
      setStaffTimeslotError(null);
      return;
    }
    const updated = stageManagerCalendarDraftUpdate(draftId, () => plan.draft, 'Edited draft assignment');
    resetStaffTimeslotModalState();
    if (updated) notifications.show({ color: 'blue', message: 'Draft assignment change staged.' });
  }, [
    managerCalendarDrafts, staffTimeslotForm, selection, selectedFields, selectedFieldIds,
    staffScheduleMembers, stageManagerCalendarDraftUpdate, resetStaffTimeslotModalState,
  ]);

  const applyStaffAssignmentEdit = useCallback((assignment: StaffScheduleAssignment) => {
    const next = planStaffAssignmentEdit({
      assignment, isChild: isEditingChildStaffAssignment, form: staffTimeslotForm,
      fields: selectedFields, facilities, members: staffScheduleMembers,
    });
    setStaffTimeslotError(null);
    stageStaffAssignmentOverride(assignment.id, { action: 'update', assignment: next });
    resetStaffTimeslotModalState();
    notifications.show({ color: 'blue', message: 'Staff assignment change staged.' });
  }, [
    isEditingChildStaffAssignment, staffTimeslotForm, selectedFields, facilities,
    staffScheduleMembers, stageStaffAssignmentOverride, resetStaffTimeslotModalState,
  ]);

  const restoreStaffTimeslot = useCallback((range: SelectionState) => {
    const assignments = findRestorableStaffUnassignments(staffScheduleAssignments, managerStaffAssignmentOverrides, {
      parent: staffTimeslotParentAssignment, userId: staffTimeslotForm.userId,
      kind: staffTimeslotAssignmentKind, fieldIds: selectedFieldIds, selection: range,
    });
    const restoredCount = assignments.filter((assignment) => restorePendingStaffUnassignment(assignment.id)).length;
    if (!restoredCount) return false;
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: `${restoredCount} pending staff unassignment${restoredCount === 1 ? '' : 's'} restored.`,
    });
    return true;
  }, [
    staffScheduleAssignments, managerStaffAssignmentOverrides, staffTimeslotParentAssignment,
    staffTimeslotForm.userId, staffTimeslotAssignmentKind, selectedFieldIds,
    restorePendingStaffUnassignment, resetStaffTimeslotModalState,
  ]);

  const applyStaffOccurrenceEdit = useCallback((parent: StaffScheduleAssignment) => {
    const plan = planStaffOccurrenceEdit({
      parent, form: staffTimeslotForm, selection, fields: selectedFields, facilities, members: staffScheduleMembers,
    });
    if (staffAssignmentCanDeleteFollowing(parent)) {
      setStaffAssignmentScopePrompt(plan);
      setStaffTimeslotError(null);
      return;
    }
    stageStaffAssignmentOverride(plan.childOverride.assignment.id, plan.childOverride, `Assigned ${plan.kindLabel} coverage occurrence`);
    resetStaffTimeslotModalState();
    notifications.show({ color: 'blue', message: `${plan.staffName} assignment staged for this occurrence.` });
  }, [
    staffTimeslotForm, selection, selectedFields, facilities, staffScheduleMembers,
    stageStaffAssignmentOverride, resetStaffTimeslotModalState,
  ]);

  const createStaffTimeslots = useCallback(async (prepared: ReturnType<typeof prepareStaffTimeslot>) => {
    const { selection: range, rateOverrideCents, repeating, daysOfWeek } = prepared;
    setStaffTimeslotSubmitting(true);
    setStaffTimeslotError(null);
    try {
      const created = await Promise.all(selectedFields.map(async (field) => {
        const response = await apiRequest<StaffScheduleCreateResponse>(`/api/organizations/${organizationId}/staff/schedule`, {
          method: 'POST',
          body: {
            parentAssignmentId: null,
            userId: staffTimeslotForm.userId || null,
            assignmentKind: staffTimeslotAssignmentKind,
            facilityId: getFieldFacilityId(field),
            fieldId: field.$id,
            rateOverrideType: rateOverrideCents ? 'HOURLY' : null,
            rateOverrideCents,
            notes: staffTimeslotForm.notes,
            timeSlot: {
              startDate: range.start.toISOString(),
              endDate: repeating ? prepared.repeatEndDate : range.end.toISOString(),
              repeating,
              daysOfWeek,
              startTimeMinutes: range.start.getHours() * 60 + range.start.getMinutes(),
              endTimeMinutes: range.end.getHours() * 60 + range.end.getMinutes(),
            },
          },
        });
        return response.assignment ?? null;
      }));
      const createdAssignments = created.filter((assignment): assignment is StaffScheduleAssignment => Boolean(assignment));
      if (createdAssignments.length) setStaffScheduleAssignments((current) => [...createdAssignments, ...current]);
      resetStaffTimeslotModalState();
      const count = createdAssignments.length || selectedFields.length;
      const kind = staffTimeslotAssignmentKind === 'OFFICIAL_SHIFT' ? 'official' : 'staff';
      notifications.show({ color: 'green', message: `${count} ${kind} timeslot${count === 1 ? '' : 's'} added.` });
      void loadStaffSchedule({ silent: true });
    } finally {
      setStaffTimeslotSubmitting(false);
    }
  }, [
    selectedFields, organizationId, staffTimeslotForm, staffTimeslotAssignmentKind,
    resetStaffTimeslotModalState, loadStaffSchedule,
  ]);

  const submitNewStaffTimeslot = useCallback(async () => {
    const form = staffTimeslotParentAssignment ? { ...staffTimeslotForm, repeating: false } : staffTimeslotForm;
    const prepared = prepareStaffTimeslot(form, selection, selectedFields);
    if (staffTimeslotParentAssignment && !form.userId) throw new Error('Choose a staff member for this occurrence.');
    if (restoreStaffTimeslot(prepared.selection)) return;
    if (staffTimeslotParentAssignment) {
      applyStaffOccurrenceEdit(staffTimeslotParentAssignment);
      return;
    }
    await createStaffTimeslots(prepared);
  }, [
    staffTimeslotParentAssignment, staffTimeslotForm, selection, selectedFields,
    restoreStaffTimeslot, applyStaffOccurrenceEdit, createStaffTimeslots,
  ]);

  const submitStaffTimeslot = useCallback(async () => {
    try {
      if (!canManage || !organizationId) throw new Error('Missing organization context.');
      if (editingManagerDraftId) {
        applyStaffDraftEdit(editingManagerDraftId);
        return;
      }
      if (editingStaffAssignment) {
        applyStaffAssignmentEdit(editingStaffAssignment);
        return;
      }
      await submitNewStaffTimeslot();
    } catch (error) {
      setStaffTimeslotError(error instanceof Error ? error.message : 'Failed to apply staff timeslot.');
    }
  }, [
    canManage, organizationId, editingManagerDraftId, editingStaffAssignment,
    applyStaffDraftEdit, applyStaffAssignmentEdit, submitNewStaffTimeslot,
  ]);

		  const applyStaffAssignmentScopePrompt = useCallback((scope: 'all' | 'occurrence') => {
		    if (!staffAssignmentScopePrompt) {
		      return;
		    }
	    if (staffAssignmentScopePrompt.source === 'draft') {
	      if (scope === 'all') {
	        const updatedDraft = stageManagerCalendarDraftUpdate(
	          staffAssignmentScopePrompt.draftId,
	          () => staffAssignmentScopePrompt.allDraft,
	          `Assigned all ${staffAssignmentScopePrompt.kindLabel} draft coverage`,
	        );
	        resetStaffTimeslotModalState();
	        if (updatedDraft) {
	          notifications.show({
	            color: 'blue',
	            message: `${staffAssignmentScopePrompt.staffName} assignment staged for all instances.`,
	          });
	        }
	        return;
	      }
	      const staged = stageManagerCalendarDraftScope(
	        staffAssignmentScopePrompt.draftId,
	        staffAssignmentScopePrompt.parentDraft,
	        staffAssignmentScopePrompt.childDraft,
	        `Assigned ${staffAssignmentScopePrompt.kindLabel} draft coverage occurrence`,
	        staffAssignmentScopePrompt.previousDraft,
	      );
	      resetStaffTimeslotModalState();
	      if (staged) {
	        notifications.show({
	          color: 'blue',
	          message: `${staffAssignmentScopePrompt.staffName} assignment staged for this occurrence.`,
	        });
	      }
	      return;
	    }
		    if (scope === 'all') {
		      stageStaffAssignmentOverride(
		        staffAssignmentScopePrompt.parentAssignment.id,
	        staffAssignmentScopePrompt.parentOverride,
	        `Assigned all ${staffAssignmentScopePrompt.kindLabel} coverage`,
	      );
	      resetStaffTimeslotModalState();
	      notifications.show({
	        color: 'blue',
	        message: `${staffAssignmentScopePrompt.staffName} assignment staged for all instances.`,
	      });
	      return;
	    }
	    const childAssignment = staffAssignmentScopePrompt.childOverride.action === 'create'
	      ? staffAssignmentScopePrompt.childOverride.assignment
	      : null;
	    if (!childAssignment) {
	      return;
	    }
	    stageStaffAssignmentOverride(
	      childAssignment.id,
	      staffAssignmentScopePrompt.childOverride,
	      `Assigned ${staffAssignmentScopePrompt.kindLabel} coverage occurrence`,
	    );
	    resetStaffTimeslotModalState();
	    notifications.show({
	      color: 'blue',
	      message: `${staffAssignmentScopePrompt.staffName} assignment staged for this occurrence.`,
	    });
	  }, [
	    resetStaffTimeslotModalState,
	    staffAssignmentScopePrompt,
	    stageManagerCalendarDraftScope,
	    stageManagerCalendarDraftUpdate,
	    stageStaffAssignmentOverride,
	  ]);

	  const unassignChildStaffAssignment = useCallback(() => {
	    if (!canManage || !organizationId || !editingStaffAssignment?.id || !editingStaffAssignment.parentAssignmentId) {
	      return;
	    }
    setStaffTimeslotError(null);
    stageStaffAssignmentOverride(editingStaffAssignment.id, {
      action: 'unassign',
      assignmentId: editingStaffAssignment.id,
    }, 'Unassigned staff member');
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: 'Staff unassignment staged.',
    });
  }, [canManage, editingStaffAssignment, organizationId, resetStaffTimeslotModalState, stageStaffAssignmentOverride]);

  const deleteStaffAssignment = useCallback(() => {
    if (!canManage || !organizationId || !editingStaffAssignment?.id || editingStaffAssignment.parentAssignmentId) {
      return;
    }
    setStaffTimeslotError(null);
    stageStaffAssignmentOverride(editingStaffAssignment.id, {
      action: 'delete',
      assignmentId: editingStaffAssignment.id,
    }, 'Deleted staff assignment');
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: 'Staff assignment deletion staged.',
    });
  }, [canManage, editingStaffAssignment, organizationId, resetStaffTimeslotModalState, stageStaffAssignmentOverride]);

  const openStaffDeletePlan = useMemo(() => {
    if (!openStaffDeleteConfirmation) {
      return null;
    }
    const parentAssignment = visibleStaffScheduleAssignments
      .find((assignment) => assignment.id === openStaffDeleteConfirmation.assignmentId)
      ?? staffScheduleAssignments.find((assignment) => assignment.id === openStaffDeleteConfirmation.assignmentId)
      ?? null;
    const occurrenceStart = toValidDate(openStaffDeleteConfirmation.occurrenceStart);
    const occurrenceEnd = toValidDate(openStaffDeleteConfirmation.occurrenceEnd);
    if (!parentAssignment || !occurrenceStart || !occurrenceEnd) {
      return null;
    }
    const childAssignments = visibleStaffScheduleAssignments
      .filter((assignment) => (
        assignment.parentAssignmentId === parentAssignment.id
        && Boolean(assignment.userId || assignment.staffMemberId)
        && (
          openStaffDeleteConfirmation.scope === 'all'
          || childStaffAssignmentTouchesDeleteScope(assignment, occurrenceStart)
        )
      ))
      .sort((left, right) => {
        const leftStart = getStaffAssignmentPrimaryRange(left)?.start.getTime() ?? 0;
        const rightStart = getStaffAssignmentPrimaryRange(right)?.start.getTime() ?? 0;
        return leftStart - rightStart;
      });
    const childOverrides = childAssignments.map((assignment) => ({
      assignmentId: assignment.id,
      override: {
        action: 'unassign' as const,
        assignmentId: assignment.id,
      },
    }));

    if (openStaffDeleteConfirmation.scope === 'all') {
      return {
        parentAssignment,
        occurrenceStart,
        occurrenceEnd,
        scope: openStaffDeleteConfirmation.scope,
        childAssignments,
        shortenedAssignment: null,
        deletesParent: true,
        overrides: [{
          assignmentId: parentAssignment.id,
          override: {
            action: 'delete' as const,
            assignmentId: parentAssignment.id,
          },
        }],
      };
    }

    const previousOccurrence = getPreviousStaffAssignmentOccurrenceRange(parentAssignment, occurrenceStart);
    const shortenedAssignment = previousOccurrence
      ? buildStaffAssignmentEndingAfterOccurrence(parentAssignment, previousOccurrence)
      : null;

    return {
      parentAssignment,
      occurrenceStart,
      occurrenceEnd,
      scope: openStaffDeleteConfirmation.scope,
      childAssignments,
      shortenedAssignment,
      deletesParent: !shortenedAssignment,
      overrides: shortenedAssignment
        ? [
            ...childOverrides,
            {
              assignmentId: parentAssignment.id,
              override: {
                action: 'update' as const,
                assignment: shortenedAssignment,
              },
            },
          ]
        : [{
            assignmentId: parentAssignment.id,
            override: {
              action: 'delete' as const,
              assignmentId: parentAssignment.id,
            },
          }],
    };
  }, [openStaffDeleteConfirmation, staffScheduleAssignments, visibleStaffScheduleAssignments]);

  const requestDeleteOpenStaffAssignment = useCallback(() => {
    if (!canManage || !organizationId || !staffTimeslotParentAssignment?.id || !selection) {
      return;
    }
    const defaultScope: OpenStaffDeleteScope = staffAssignmentCanDeleteFollowing(staffTimeslotParentAssignment)
      ? 'following'
      : 'all';
    setStaffTimeslotError(null);
    setOpenStaffDeleteConfirmation({
      assignmentId: staffTimeslotParentAssignment.id,
      occurrenceStart: selection.start.toISOString(),
      occurrenceEnd: selection.end.toISOString(),
      scope: defaultScope,
    });
  }, [canManage, organizationId, selection, staffTimeslotParentAssignment]);

  const confirmOpenStaffAssignmentDelete = useCallback(() => {
    if (!openStaffDeletePlan?.overrides.length) {
      return;
    }
    const parentIsOfficial = openStaffDeletePlan.parentAssignment.assignmentKind === 'OFFICIAL_SHIFT';
    const label = openStaffDeletePlan.scope === 'all'
      ? `Deleted open ${parentIsOfficial ? 'official' : 'staff'} assignment`
      : `Deleted following open ${parentIsOfficial ? 'official' : 'staff'} assignments`;
    stageStaffAssignmentOverrideBatch(openStaffDeletePlan.overrides, label);
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: openStaffDeletePlan.scope === 'all'
        ? `Open ${parentIsOfficial ? 'official' : 'staff'} assignment deletion staged.`
        : `Following open ${parentIsOfficial ? 'official' : 'staff'} assignment changes staged.`,
    });
  }, [openStaffDeletePlan, resetStaffTimeslotModalState, stageStaffAssignmentOverrideBatch]);

  const applyCalendarSaveResult = useCallback((result: FacilityCalendarSaveResult) => {
    const {
      updatedRentalFields, createdAssignments, updatedAssignments, removedAssignmentIds, deletedParentAssignmentIds,
    } = result;
    if (updatedRentalFields.length) {
      const updatedById = new Map(updatedRentalFields.map((field) => [field.$id, field]));
      setOrg((prev) => {
        if (!prev) return prev;
        const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
        return {
          ...prev,
          fields: prevFields.map((field) => {
            const updatedField = updatedById.get(field.$id);
            return updatedField ? mergeFieldPreservingCalendarHydration(field, updatedField) : field;
          }),
        };
      });
    }
    if (createdAssignments.length) {
      setStaffScheduleAssignments((current) => [...createdAssignments, ...current]);
    }
    if (updatedAssignments.length || removedAssignmentIds.size || deletedParentAssignmentIds.size) {
      const updatedById = new Map(updatedAssignments.map((assignment) => [assignment.id, assignment]));
      setStaffScheduleAssignments((current) => current
        .filter((assignment) => (
          !removedAssignmentIds.has(assignment.id)
          && !(assignment.parentAssignmentId && deletedParentAssignmentIds.has(assignment.parentAssignmentId))
        ))
        .map((assignment) => updatedById.get(assignment.id) ?? assignment));
    }
  }, []);

  const handleSaveManagerCalendarDrafts = useCallback(async () => {
    if (!canManage || !organizationId || managerCalendarDraftsSaving || !managerCalendarPendingChangeCount) return;
    setManagerCalendarDraftsSaving(true);
    try {
      const result = await saveFacilityCalendarChanges({
        organizationId, fields, staffAssignments: staffScheduleAssignments,
        drafts: managerCalendarDrafts, rentalUpdates: managerRentalSlotUpdates, staffOverrides: managerStaffAssignmentOverrides,
      });
      applyCalendarSaveResult(result);
      const savedChangeCount = managerCalendarPendingChangeCount;
      clearManagerCalendarPendingState();
      setManagerCalendarEditMode(false);
      notifications.show({
        color: 'green',
        message: `${savedChangeCount} calendar change${savedChangeCount === 1 ? '' : 's'} saved.`,
      });
      await refreshOrganization();
      if (result.createdAssignments.length || Object.keys(managerStaffAssignmentOverrides).length) {
        void loadStaffSchedule({ silent: true });
      }
    } catch (error) {
      console.error('Failed to save calendar drafts:', error);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Calendar changes could not be saved.',
      });
    } finally {
      setManagerCalendarDraftsSaving(false);
    }
  }, [applyCalendarSaveResult, canManage, clearManagerCalendarPendingState, fields, loadStaffSchedule, managerCalendarDrafts, managerCalendarDraftsSaving, managerCalendarPendingChangeCount, managerRentalSlotUpdates, managerStaffAssignmentOverrides, organizationId, refreshOrganization, setManagerCalendarDraftsSaving, setManagerCalendarEditMode, staffScheduleAssignments]);

  const handleCancelManagerCalendarEditMode = useCallback(() => {
    if (managerCalendarPendingChangeCount && typeof window !== 'undefined' && !window.confirm('Discard all unsaved calendar changes?')) {
      return;
    }
    managerCreateDragModeRef.current = null;
    managerCreateDragSourceRef.current = null;
    managerCreateLastPointRef.current = null;
    managerDraftDragRef.current = null;
    setManagerCreateDragSource(null);
    setManagerCreateDragPreviewPoint(null);
    setManagerCreateDragMode(null);
    setManagerDraftDragId(null);
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
    clearManagerCalendarPendingState();
    setManagerCalendarEditMode(false);
  }, [clearManagerCalendarPendingState, managerCalendarPendingChangeCount, setEditingManagerDraftId, setManagerCalendarEditMode, setManagerDraftDragId, setSelectedManagerDraftId]);

  const resolveCalendarPointSelection = useCallback((
    clientX: number,
    clientY: number,
    fieldIds: string[],
    durationMs = MIN_SELECTION_MS,
  ): SelectionState | null => {
    const normalizedFieldIds = normalizeFieldIds(fieldIds);
    if (!canManage || !normalizedFieldIds.length || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const point = resolveFacilityCalendarDropPoint(
      document.querySelector<HTMLElement>('.shared-calendar-shell--fields'),
      clientX,
      clientY,
      {
        rangeStart: calendarRange.start,
        rangeEnd: calendarRange.end,
        minTime,
        maxTime,
        stepMinutes: SLOT_STEP_MINUTES,
        durationMs: Math.max(MIN_SELECTION_MS, durationMs),
      },
    );
    if (!point || !normalizedFieldIds.includes(point.resourceId)) return null;
    return { fieldIds: [point.resourceId], start: point.start, end: point.end };
  }, [calendarRange.start, calendarRange.end, canManage, maxTime, minTime]);

  const resolveManagerCreateDropSelection = useCallback((clientX: number, clientY: number): SelectionState | null => {
    const fieldIds = selectedFieldIds.length ? selectedFieldIds : facilityFilteredFieldIds.slice(0, 1);
    return resolveCalendarPointSelection(clientX, clientY, fieldIds);
  }, [
    facilityFilteredFieldIds,
    resolveCalendarPointSelection,
    selectedFieldIds,
  ]);

  const addManagerCalendarDraft = useCallback((
    mode: ManagerCalendarSelectionMode,
    nextSelection: SelectionState,
  ) => {
    if (!canManage) {
      return;
    }
    const fieldIds = normalizeFieldIds(nextSelection.fieldIds);
    if (!fieldIds.length) {
      notifications.show({ color: 'red', message: 'Select at least one resource first.' });
      return;
    }
    const start = new Date(nextSelection.start);
    const end = new Date(nextSelection.end);
    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + MIN_SELECTION_MS);
    }
    if (start.toDateString() !== end.toDateString()) {
      notifications.show({ color: 'red', message: 'Drafts must stay within a single day.' });
      return;
    }
    const draft: ManagerCalendarDraft = {
      id: createId(),
      mode,
      fieldIds,
      start,
      end,
    };
    stageManagerCalendarDraftCreate(draft, `Added ${MANAGER_SELECTION_TITLES[mode].toLowerCase()}`);
  }, [canManage, stageManagerCalendarDraftCreate]);

  useEffect(() => {
    managerCreateDropResolverRef.current = resolveManagerCreateDropSelection;
    managerCreateDraftAdderRef.current = addManagerCalendarDraft;
  }, [addManagerCalendarDraft, resolveManagerCreateDropSelection]);

  useEffect(() => {
    if (!managerCreateDragMode || managerCreateDragSource !== 'pointer') {
      return undefined;
    }

    const updateLastPoint = (event: PointerEvent | MouseEvent) => {
      const nextPoint = { clientX: event.clientX, clientY: event.clientY };
      managerCreateLastPointRef.current = nextPoint;
      if (managerCreateDragSourceRef.current === 'pointer') {
        setManagerCreateDragPreviewPoint(nextPoint);
      }
    };

    const finishDrag = (event: PointerEvent | MouseEvent) => {
      const mode = managerCreateDragModeRef.current;
      const dropPoint = managerCreateLastPointRef.current ?? { clientX: event.clientX, clientY: event.clientY };
      managerCreateDragModeRef.current = null;
      managerCreateDragSourceRef.current = null;
      managerCreateLastPointRef.current = null;
      setManagerCreateDragSource(null);
      setManagerCreateDragPreviewPoint(null);
      setManagerCreateDragMode(null);
      if (!mode) {
        return;
      }
      const nextSelection = managerCreateDropResolverRef.current?.(dropPoint.clientX, dropPoint.clientY);
      if (!nextSelection) {
        return;
      }
      managerCreateDraftAdderRef.current?.(mode, nextSelection);
    };

    const cancelDrag = () => {
      managerCreateDragModeRef.current = null;
      managerCreateDragSourceRef.current = null;
      managerCreateLastPointRef.current = null;
      setManagerCreateDragSource(null);
      setManagerCreateDragPreviewPoint(null);
      setManagerCreateDragMode(null);
    };

    window.addEventListener('pointermove', updateLastPoint, true);
    window.addEventListener('mousemove', updateLastPoint, true);
    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('mouseup', finishDrag, true);
    window.addEventListener('pointercancel', cancelDrag, true);
    window.addEventListener('blur', cancelDrag);

    return () => {
      window.removeEventListener('pointermove', updateLastPoint, true);
      window.removeEventListener('mousemove', updateLastPoint, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('mouseup', finishDrag, true);
      window.removeEventListener('pointercancel', cancelDrag, true);
      window.removeEventListener('blur', cancelDrag);
    };
  }, [managerCreateDragMode, managerCreateDragSource]);

  const handleManagerCreatePointerDown = useCallback((
    mode: ManagerCalendarSelectionMode,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!managerCalendarEditMode) {
      return;
    }
    if (!canManage || !selectedFieldIds.length) {
      notifications.show({ color: 'red', message: 'Select at least one resource first.' });
      return;
    }
    event.preventDefault();
    managerCreateDragModeRef.current = mode;
    managerCreateDragSourceRef.current = 'pointer';
    managerCreateLastPointRef.current = { clientX: event.clientX, clientY: event.clientY };
    setManagerCreateDragSource('pointer');
    setManagerCreateDragPreviewPoint({ clientX: event.clientX, clientY: event.clientY });
    setManagerCreateDragMode(mode);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail when another interaction has already captured it.
    }
  }, [canManage, managerCalendarEditMode, selectedFieldIds.length]);

  const handleManagerCreatePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!managerCreateDragModeRef.current || managerCreateDragSourceRef.current !== 'pointer') {
      return;
    }
    const nextPoint = { clientX: event.clientX, clientY: event.clientY };
    managerCreateLastPointRef.current = nextPoint;
    setManagerCreateDragPreviewPoint(nextPoint);
  }, []);

  const handleManagerCreatePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (managerCreateDragSourceRef.current !== 'pointer') {
      return;
    }
    const mode = managerCreateDragModeRef.current;
    const dropPoint = managerCreateLastPointRef.current ?? { clientX: event.clientX, clientY: event.clientY };
    if (!mode) {
      return;
    }
    managerCreateDragModeRef.current = null;
    managerCreateDragSourceRef.current = null;
    managerCreateLastPointRef.current = null;
    setManagerCreateDragSource(null);
    setManagerCreateDragPreviewPoint(null);
    setManagerCreateDragMode(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released.
    }

    const nextSelection = resolveManagerCreateDropSelection(dropPoint.clientX, dropPoint.clientY);
    if (!nextSelection) {
      return;
    }
    event.preventDefault();
    addManagerCalendarDraft(mode, nextSelection);
  }, [addManagerCalendarDraft, resolveManagerCreateDropSelection]);

  const handleManagerCreatePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (managerCreateDragSourceRef.current !== 'pointer') {
      return;
    }
    managerCreateDragModeRef.current = null;
    managerCreateDragSourceRef.current = null;
    managerCreateLastPointRef.current = null;
    setManagerCreateDragSource(null);
    setManagerCreateDragPreviewPoint(null);
    setManagerCreateDragMode(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when capture was not active.
    }
  }, []);

  const handleManagerDraftPointerDown = useCallback((
    draftEvent: SelectionCalendarEntry,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!canManage || !managerCalendarEditMode || draftEvent.metaType !== 'selection') {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const draftId = calendarManagerDraftId(draftEvent);
    const draft = managerCalendarDrafts.find((candidate) => candidate.id === draftId);
    if (!draft) {
      return;
    }
    if (!closestCalendarElement(event.target, '.shared-calendar-event__drag-handle')) {
      return;
    }
    event.stopPropagation();
    const startPoint = { clientX: event.clientX, clientY: event.clientY };
    managerDraftDragRef.current = {
      draftId,
      draft,
      fieldIds: normalizeFieldIds(draft.fieldIds),
      durationMs: Math.max(MIN_SELECTION_MS, draft.end.getTime() - draft.start.getTime()),
      startPoint,
      lastPoint: startPoint,
      hasMoved: false,
    };
    setManagerDraftDragId(draftId);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser already released this interaction.
    }
  }, [canManage, managerCalendarDrafts, managerCalendarEditMode, setManagerDraftDragId]);

  const handleManagerDraftPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!managerDraftDragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextPoint = { clientX: event.clientX, clientY: event.clientY };
    managerDraftDragRef.current = {
      ...managerDraftDragRef.current,
      lastPoint: nextPoint,
      hasMoved: managerDraftDragRef.current.hasMoved
        || hasMovedPastDragThreshold(managerDraftDragRef.current.startPoint, nextPoint),
    };
  }, []);

  const resolveManagerDraftDropSelection = useCallback((drag: ManagerDraftDragState): SelectionState | null => {
    const target = resolveCalendarPointSelection(drag.lastPoint.clientX, drag.lastPoint.clientY, facilityFilteredFieldIds, drag.durationMs);
    if (!target) return null;
    if (Math.abs(drag.lastPoint.clientX - drag.startPoint.clientX) >= 4) return target;
    return { ...target, start: new Date(drag.draft.start), end: new Date(drag.draft.end) };
  }, [facilityFilteredFieldIds, resolveCalendarPointSelection]);

  const handleManagerDraftPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = managerDraftDragRef.current;
    if (!dragState) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    managerDraftDragRef.current = null;
    setManagerDraftDragId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when capture was not active.
    }
    if (!dragState.hasMoved) {
      openManagerCalendarDraftEditor(dragState.draftId, dragState.draft);
      return;
    }
    managerDraftSuppressNextClickRef.current = true;
    const nextSelection = resolveManagerDraftDropSelection(dragState);
    if (!nextSelection) {
      return;
    }
    applySelectionWindow(nextSelection.start, nextSelection.end, { slotKey: dragState.draftId, resourceId: nextSelection.fieldIds[0], interaction: 'move' });
  }, [applySelectionWindow, openManagerCalendarDraftEditor, resolveManagerDraftDropSelection, setManagerDraftDragId]);

  const handleManagerDraftPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!managerDraftDragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    managerDraftDragRef.current = null;
    setManagerDraftDragId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when capture was not active.
    }
  }, [setManagerDraftDragId]);

  useEffect(() => {
    if (!managerDraftDragId) {
      return undefined;
    }

    const updateLastPoint = (event: PointerEvent | MouseEvent) => {
      if (!managerDraftDragRef.current) {
        return;
      }
      const nextPoint = { clientX: event.clientX, clientY: event.clientY };
      managerDraftDragRef.current = {
        ...managerDraftDragRef.current,
        lastPoint: nextPoint,
        hasMoved: managerDraftDragRef.current.hasMoved
          || hasMovedPastDragThreshold(managerDraftDragRef.current.startPoint, nextPoint),
      };
    };

    const finishDrag = (event: PointerEvent | MouseEvent) => {
      const dragState = managerDraftDragRef.current;
      if (!dragState) {
        return;
      }
      updateLastPoint(event);
      const finalState = managerDraftDragRef.current ?? dragState;
      managerDraftDragRef.current = null;
      setManagerDraftDragId(null);
      if (!finalState.hasMoved) {
        openManagerCalendarDraftEditor(finalState.draftId, finalState.draft);
        return;
      }
      managerDraftSuppressNextClickRef.current = true;
      const nextSelection = resolveManagerDraftDropSelection(finalState);
      if (!nextSelection) {
        return;
      }
      applySelectionWindow(nextSelection.start, nextSelection.end, { slotKey: finalState.draftId, resourceId: nextSelection.fieldIds[0], interaction: 'move' });
    };

    const cancelDrag = () => {
      managerDraftDragRef.current = null;
      setManagerDraftDragId(null);
    };

    window.addEventListener('pointermove', updateLastPoint, true);
    window.addEventListener('mousemove', updateLastPoint, true);
    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('mouseup', finishDrag, true);
    window.addEventListener('pointercancel', cancelDrag, true);
    window.addEventListener('blur', cancelDrag);

    return () => {
      window.removeEventListener('pointermove', updateLastPoint, true);
      window.removeEventListener('mousemove', updateLastPoint, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('mouseup', finishDrag, true);
      window.removeEventListener('pointercancel', cancelDrag, true);
      window.removeEventListener('blur', cancelDrag);
    };
  }, [applySelectionWindow, managerDraftDragId, openManagerCalendarDraftEditor, resolveManagerDraftDropSelection, setManagerDraftDragId]);

  const openStaffAssignmentEditModal = useCallback((item: FacilityCalendarFeedItem, start: Date, end: Date) => {
    if (!canManage) return;
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
    const assignment = item.source as StaffScheduleAssignment | undefined;
    if (!assignment?.id) {
      notifications.show({ color: 'red', message: 'Unable to resolve this staff assignment.' });
      return;
    }
    const editor = staffAssignmentEditorState(item, assignment, start);
    if (!editor.fieldId) {
      notifications.show({ color: 'red', message: 'Assigning coverage from the calendar requires a resource.' });
      return;
    }
    setSelection({ fieldIds: [editor.fieldId], start, end });
    setCalendarDate(new Date(start));
    setEditingStaffAssignment(editor.editingAssignment);
    setStaffTimeslotParentAssignment(editor.parentAssignment);
    setStaffTimeslotMode(editor.mode);
    setStaffTimeslotUserId(editor.values.userId);
    setStaffTimeslotOverrideAmount(editor.values.overrideAmount);
    setStaffTimeslotNotes(editor.values.notes);
    setStaffTimeslotRepeating(editor.values.repeating);
    setStaffTimeslotRepeatDays(editor.values.repeatDays);
    setStaffTimeslotRepeatEndDate(editor.values.repeatEndDate);
    setStaffTimeslotError(null);
    setStaffTimeslotModalOpen(true);
    if (!staffScheduleLoaded) void loadStaffSchedule();
  }, [canManage, loadStaffSchedule, setEditingManagerDraftId, setSelectedManagerDraftId, staffScheduleLoaded]);
  useEffect(() => {
    openStaffAssignmentEditModalRef.current = openStaffAssignmentEditModal;
  }, [openStaffAssignmentEditModal]);

  const openRentalCalendarEvent = useCallback((event: CalendarEventData) => {
    const slot = event.resource as TimeSlot | undefined;
    if (!slot?.$id) return;
    const eventFieldId = typeof event.resourceId === 'string' ? event.resourceId : '';
    const ownerField = fields.find((field) => field.$id === eventFieldId) ?? selectedField;
    if (!ownerField) return;
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
    setEditingRentalField(ownerField);
    setEditingRentalSlot(slot);
    setRentalDraftRange(null);
    setCreateRentalOpen(true);
  }, [fields, selectedField, setEditingManagerDraftId, setSelectedManagerDraftId]);

  const handleSelectCalendarEvent = useCallback((event: CalendarEventData) => {
    if (!canManage || !event) return;
    if (event.metaType === 'selection') {
      const draftId = calendarManagerDraftId(event);
      if (draftId) openManagerCalendarDraftEditor(draftId);
      return;
    }
    if (isStaffFeedEvent(event, canManage)) {
      if (isStaffAssignmentActivationSuppressed()) return;
      openStaffAssignmentEditModal(event.resource, event.start, event.end);
      return;
    }
    if (event.metaType === 'rental') openRentalCalendarEvent(event);
  }, [canManage, isStaffAssignmentActivationSuppressed, openManagerCalendarDraftEditor, openRentalCalendarEvent, openStaffAssignmentEditModal]);
  const handleManagerDraftCalendarEventClick = useCallback((
    draftId: string,
    fallbackDraft: ManagerCalendarDraft | null,
  ) => {
    if (managerDraftSuppressNextClickRef.current) {
      managerDraftSuppressNextClickRef.current = false;
      return;
    }
    if (draftId) {
      openManagerCalendarDraftEditor(draftId, fallbackDraft);
    }
  }, [openManagerCalendarDraftEditor]);

  const calendarResources = useMemo(
    () => facilityCalendarFields.map((field) => ({
      id: field.$id,
      label: getFacilityScopedFieldDisplayName(field),
    })),
    [facilityCalendarFields],
  );
  const renderFieldCalendar = () => {
    const canRenderCalendar = canManage ? Boolean(selectedFieldIds.length > 0) : readonlyCalendarFields.length > 0;
    return (
      <FacilityCalendarPanel
        canRenderCalendar={canRenderCalendar}
        emptyText={
          canManage ? 'Select at least one resource to view availability.' : 'No resources are available for rentals.'
        }
        events={calendarEvents}
        conflictingEventIds={conflictingEventIds}
        resources={calendarResources}
        calendarView={calendarView}
        calendarDate={calendarDate}
        calendarRangeStart={calendarRange.start}
        calendarRangeEnd={calendarRange.end}
        onViewChange={setCalendarView}
        onNavigateDate={(date) => {
          const nextDate = toValidDate(date);
          if (nextDate) {
            setCalendarDate(nextDate);
          }
        }}
        minTime={minTime}
        maxTime={maxTime}
        eventPropGetter={eventPropGetter}
        slotPropGetter={slotPropGetter}
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
        onSelectSlot={handleSlotSelect}
        onSelectEvent={handleSelectCalendarEvent}
        onShellPointerDownCapture={handleCalendarShellStaffPointerDown}
        onShellPointerUpCapture={handleCalendarShellStaffEventActivation}
        onShellClickCapture={handleCalendarShellStaffEventActivation}
        canManage={canManage}
        managerCalendarEditMode={managerCalendarEditMode}
        fieldEventsLoading={fieldEventsLoading || orgLoading}
        fieldColorReferenceList={fieldColorReferenceList}
        managerDraftDragId={managerDraftDragId}
        managerSelectionTitles={MANAGER_SELECTION_TITLES}
        getCalendarEventVariant={getCalendarEventVariant}
        onManagerDraftClick={handleManagerDraftCalendarEventClick}
        onManagerDraftPointerDown={handleManagerDraftPointerDown}
        onManagerDraftPointerMove={handleManagerDraftPointerMove}
        onManagerDraftPointerUp={handleManagerDraftPointerUp}
        onManagerDraftPointerCancel={handleManagerDraftPointerCancel}
        isStaffAssignmentActivationSuppressed={isStaffAssignmentActivationSuppressed}
        onOpenStaffAssignmentEdit={openStaffAssignmentEditModal}
      />
    );
  };
  const renderCreateDragPreview = () => {
    const managerCreateDragTemplate =
      managerCalendarEditMode && managerCreateDragMode
        ? (MANAGER_CREATE_TEMPLATES.find((template) => template.mode === managerCreateDragMode) ?? null)
        : null;
    return managerCreateDragTemplate && managerCreateDragPreviewPoint ? (
      <div
        className="facility-calendar-create-drag-preview"
        style={{
          left: managerCreateDragPreviewPoint.clientX,
          top: managerCreateDragPreviewPoint.clientY,
        }}
        aria-hidden="true"
      >
        <SharedCalendarEvent
          title={managerCreateDragTemplate.title}
          subtitle={managerCreateDragTemplate.subtitle}
          meta={managerCreateDragTemplate.meta}
          colorSeed={managerCreateDragTemplate.colorSeed}
          colorReferenceList={fieldColorReferenceList}
          colorMatchKey={selectedFieldIds[0] ?? undefined}
          resourceColorMatchKeys={selectedFieldIds}
          variant={managerCreateDragTemplate.variant}
          draggable
          selected
        />
      </div>
    ) : null;
  };

  const renderManagerActions = () =>
    canManage &&
    facilityWorkspaceView === 'schedule' && (
      <Group gap="xs" className="md:justify-end">
        <Button
          size="xs"
          variant="light"
          onClick={() => setFacilityWorkspaceView('details')}
          disabled={managerCalendarDraftsSaving || managerCalendarPendingChangeCount > 0}
        >
          Facility details
        </Button>
        {managerCalendarEditMode ? (
          <>
            <Button
              size="xs"
              variant="default"
              onClick={undoLastManagerCalendarChange}
              disabled={managerCalendarDraftsSaving || !managerCalendarPendingChangeCount}
            >
              Undo
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={handleCancelManagerCalendarEditMode}
              disabled={managerCalendarDraftsSaving}
            >
              Discard changes
            </Button>
            <Button
              size="xs"
              onClick={() => void handleSaveManagerCalendarDrafts()}
              loading={managerCalendarDraftsSaving}
              disabled={!managerCalendarPendingChangeCount}
              data-testid="facility-calendar-save-drafts"
            >
              Save changes
            </Button>
          </>
        ) : (
          <Button size="xs" variant="light" onClick={() => setManagerCalendarEditMode(true)}>
            Edit schedule
          </Button>
        )}
      </Group>
    );

  const renderHeading = () => (
    <div className="org-section-heading">
      <div>
        <Title order={3} mb={4}>
          Facilities
        </Title>
        <Text c="dimmed">
          {canManage
            ? 'Manage venues, courts, rentals, and availability.'
            : 'Choose a resource and drag the calendar to set your rental time.'}
        </Text>
      </div>

      {renderManagerActions()}
    </div>
  );

  const renderManagerSchedule = () => (
    <FacilityScheduleLayout
      loading={fieldEventsLoading || orgLoading}
      facilities={facilities}
      resourceCount={calendarResources.length}
      events={calendarEvents}
    >
      <ManagerFacilityCalendarSidebar
        loading={fieldEventsLoading || orgLoading}
        facilityFilterOptions={facilityFilterOptions}
        selectedFacilityFilterValue={selectedFacilityFilterValue}
        onFacilityFilterChange={handleFacilityFilterChange}
        calendarLayerOrder={CALENDAR_LAYER_ORDER}
        calendarLayerLabels={CALENDAR_LAYER_LABELS}
        calendarLayerColors={CALENDAR_LAYER_COLORS}
        calendarLayerCounts={calendarLayerCounts}
        conflictCount={facilityCalendarSummary.conflictCount}
        activeCalendarLayerSet={activeCalendarLayerSet}
        allCalendarLayersSelected={allCalendarLayersSelected}
        onSelectAllCalendarLayers={() => setCalendarLayerFilters(CALENDAR_LAYER_ORDER)}
        onToggleCalendarLayer={toggleCalendarLayer}
        editMode={managerCalendarEditMode}
        createTemplates={MANAGER_CREATE_TEMPLATES}
        selectedFieldIds={selectedFieldIds}
        facilityFilteredFieldIds={facilityFilteredFieldIds}
        fieldFilterItems={fieldFilterItems}
        fieldColorReferenceList={fieldColorReferenceList}
        createDragMode={managerCreateDragMode}
        onCreatePointerDown={handleManagerCreatePointerDown}
        onCreateActivate={(mode) => {
          if (!managerCalendarEditMode || !selectedFieldIds.length) return;
          const start = new Date(calendarDate);
          start.setHours(8, 0, 0, 0);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          addManagerCalendarDraft(mode, { start, end, fieldIds: [selectedFieldIds[0]] });
        }}
        onCreatePointerMove={handleManagerCreatePointerMove}
        onCreatePointerUp={handleManagerCreatePointerUp}
        onCreatePointerCancel={handleManagerCreatePointerCancel}
        onSelectedFieldIdsChange={handleSelectedFieldIdsChange}
      >
        <Stack gap="sm" className="min-w-0">
          {renderFieldCalendar()}
        </Stack>
      </ManagerFacilityCalendarSidebar>
    </FacilityScheduleLayout>
  );

  const renderPublicSelections = () => (
    <PublicRentalSelectionsPanel
      selections={rentalSelections}
      validationByKey={rentalSelectionValidationByKey}
      fields={fields}
      facilityFieldsByFilterValue={facilityFieldsByFilterValue}
      publicFacilityFilterOptions={publicFacilityFilterOptions}
      allFacilitiesFilterValue={ALL_FACILITIES_FILTER_VALUE}
      resolveSelectionDateRange={resolveSelectionDateRange}
      getSelectionFacilityFilterValue={getSelectionFacilityFilterValue}
      onAddSelection={handleAddRentalSelection}
      onRemoveSelection={handleRemoveRentalSelection}
      onSelectionFacilityChange={(selectionKey, normalizedValue) => {
        const nextFieldIds = getPreferredFieldIdsForFacilityFilter(normalizedValue);
        setSelectedFacilityFilterValue(normalizedValue);
        setReadonlyVisibleFieldIds(nextFieldIds);
        updateRentalSelection(selectionKey, (current) => ({
          ...current,
          scheduledFieldIds: nextFieldIds,
        }));
      }}
      onSelectionFieldIdsChange={(selectionKey, nextValues) => {
        updateRentalSelection(selectionKey, (current) => ({
          ...current,
          scheduledFieldIds: normalizeFieldIds(nextValues),
        }));
      }}
      onSelectionRangeChange={(selectionKey, start, end) => {
        updateRentalSelection(selectionKey, (current) => updateSelectionWithCalendarRange(current, start, end));
      }}
    />
  );

  const renderPublicCalendar = () =>
    !canManage && (
      <div className="shared-calendar-layout">
        <Stack gap="sm">
          {currentUser ? (
            <Select
              label="Book rental as"
              data={hostSelectOptions}
              value={hostSelection}
              onChange={(value) => setHostSelection(value ?? 'self')}
              rightSection={hostOptionsLoading ? <Loader size="xs" /> : undefined}
              rightSectionWidth={hostOptionsLoading ? 36 : undefined}
              disabled={hostOptionsLoading && hostSelectOptions.length === 1}
              allowDeselect={false}
              size="sm"
            />
          ) : null}
          <Select
            label="Facility"
            data={publicFacilityFilterOptions}
            value={selectedFacilityFilterValue}
            onChange={handleFacilityFilterChange}
            allowDeselect={false}
            size="sm"
          />
          <FieldCalendarFilter
            items={fieldFilterItems}
            selectedIds={readonlyCalendarFieldIds}
            onSelectedIdsChange={handleReadonlyVisibleFieldIdsChange}
            colorReferenceList={fieldColorReferenceList}
            title="Resources"
            ariaLabel="Facility resources"
            searchPlaceholder="Search resources"
            searchAriaLabel="Search resources"
            emptyText="No resources match this facility."
          />
        </Stack>
        <Stack gap="sm" className="min-w-0">
          <Text size="sm" c="dimmed">
            Click empty time ranges in the calendar to add selections. Drag or resize a highlighted selection to update
            its date/time across selected resources.
          </Text>
          {renderFieldCalendar()}
          <Text size="sm" c={summaryColor}>
            {summaryText}
          </Text>
        </Stack>
      </div>
    );

  const renderRentalTotal = () =>
    !canManage && (
      <Paper withBorder radius="md" p="sm">
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm">
              Rental Total
            </Text>
            <Badge color={canReserveRentalResources ? 'teal' : 'red'} size="lg">
              {formatPrice(totalRentalCents)}
            </Badge>
          </Group>
          {rentalSelectionValidations.map((validation, index) => {
            const selectionRange = resolveSelectionDateRange(validation.selection);
            return (
              <Group key={validation.selection.key} justify="space-between" align="center">
                <Text size="sm">
                  Selection {index + 1}:{' '}
                  {selectionRange
                    ? `${formatDisplayDateTime(selectionRange.start)} - ${formatDisplayDateTime(selectionRange.end)}`
                    : 'Invalid date range'}
                </Text>
                <Badge color={validation.errors.length ? 'red' : 'teal'} variant="light">
                  {formatPrice(validation.totalCents)}
                </Badge>
              </Group>
            );
          })}
        </Stack>
      </Paper>
    );

  const renderFooter = () => (
    <Group justify="flex-end" mt="md">
      {showBackButton && (
        <Button variant="default" onClick={() => router.push(backHref)}>
          {backLabel}
        </Button>
      )}
      {!canManage ? (
        <Button disabled={!canReserveRentalResources || !currentUser} onClick={handleReserveResourcesClick}>
          {primaryActionLabel}
        </Button>
      ) : null}
    </Group>
  );

  const renderWorkspaceContent = () =>
    !org ? (
      <Paper withBorder radius="md" p="lg">
        <Text c="dimmed">Organization details are unavailable.</Text>
      </Paper>
    ) : canManage && facilityWorkspaceView === 'details' ? (
      <FacilityDetailsWorkspace
        organization={org}
        facilities={facilities}
        fields={fields}
        canManage={canManage}
        onSwitchToSchedule={() => setFacilityWorkspaceView('schedule')}
        onSaved={refreshOrganization}
      />
    ) : !canManage && !(org.fields && org.fields.length) ? (
      <Paper withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Text c="dimmed">No resources available.</Text>
          {canManage ? (
            <Button size="sm" onClick={() => setFacilityWorkspaceView('details')} style={{ alignSelf: 'flex-start' }}>
              Manage facilities
            </Button>
          ) : (
            <Text size="sm" c="dimmed">
              Sign in as the organization owner to add resources and rental slots.
            </Text>
          )}
        </Stack>
      </Paper>
    ) : (
      <Stack gap="md">
        {canManage ? renderManagerSchedule() : renderPublicSelections()}

        {renderPublicCalendar()}

        {renderRentalTotal()}

        {renderFooter()}
      </Stack>
    );

  const staffEditorResourceLabel = () => {
    if (selectedFields.length > 1) return `${selectedFields.length} selected resources`;
    return selectedField ? getFacilityScopedFieldDisplayName(selectedField) : 'Selected resource';
  };

  const renderStaffEditor = () => (
    <StaffTimeslotEditorModal
      opened={staffTimeslotModalOpen}
      mode={staffTimeslotMode}
      error={staffTimeslotError}
      selectedResourceLabel={staffEditorResourceLabel()}
      selectedRangeLabel={
        selection
          ? `${formatDisplayDateTime(selection.start)} - ${formatDisplayTime(selection.end)}`
          : 'Select a time range first.'
      }
      isEditingManagerDraft={isEditingManagerDraft}
      isEditingStaffAssignment={isEditingStaffAssignment}
      isEditingChildStaffAssignment={isEditingChildStaffAssignment}
      isAssigningStaffOccurrence={isAssigningStaffOccurrence}
      assignedUserName={editingStaffAssignment?.userName ?? null}
      facilityOptions={facilityFilterOptions}
      facilityValue={staffTimeslotResourceFacilityValue}
      onFacilityChange={handleStaffTimeslotFacilityChange}
      resourceOptions={staffTimeslotResourceOptions}
      selectedResourceIds={selectedFieldIds.filter((fieldId) =>
        staffTimeslotResourceFields.some((field) => field.$id === fieldId),
      )}
      onResourceIdsChange={handleStaffTimeslotResourceChange}
      userOptions={staffTimeslotUserOptions}
      userId={staffTimeslotUserId}
      onUserIdChange={setStaffTimeslotUserId}
      usersLoading={staffScheduleLoading}
      overrideAmount={staffTimeslotOverrideAmount}
      onOverrideAmountChange={setStaffTimeslotOverrideAmount}
      showRepeatControls={!isAssigningStaffOccurrence && !isEditingStaffAssignment}
      repeating={staffTimeslotRepeating}
      onRepeatingChange={(checked) => {
        setStaffTimeslotRepeating(checked);
        if (checked && staffTimeslotRepeatDays.length === 0 && selection) {
          setStaffTimeslotRepeatDays([mondayDayOf(selection.start)]);
        }
      }}
      repeatDays={staffTimeslotRepeatDays}
      onRepeatDaysChange={setStaffTimeslotRepeatDays}
      repeatDayOptions={STAFF_TIMESLOT_REPEAT_DAY_OPTIONS}
      repeatEndDate={staffTimeslotRepeatEndDate}
      onRepeatEndDateChange={(value) => setStaffTimeslotRepeatEndDate(coerceDatePickerValue(value))}
      repeatMinDate={selection ? startOfDay(selection.start) : undefined}
      notes={staffTimeslotNotes}
      onNotesChange={setStaffTimeslotNotes}
      submitting={staffTimeslotSubmitting}
      deleting={staffTimeslotDeleting}
      submitDisabled={staffTimeslotSubmitting || staffTimeslotDeleting || !selection || !selectedFields.length}
      onClose={resetStaffTimeslotModalState}
      onSubmit={() => void submitStaffTimeslot()}
      onDeleteOpenAssignment={() => void requestDeleteOpenStaffAssignment()}
      onUnassignChildAssignment={() => void unassignChildStaffAssignment()}
      onDeleteAssignment={() => void deleteStaffAssignment()}
    />
  );

  const renderScopePrompt = () => (
    <StaffAssignmentScopePromptModal
      opened={Boolean(staffAssignmentScopePrompt)}
      kindLabel={staffAssignmentScopePrompt?.kindLabel}
      staffName={staffAssignmentScopePrompt?.staffName ?? null}
      occurrenceLabel={staffAssignmentScopePrompt?.occurrenceLabel ?? null}
      onClose={() => setStaffAssignmentScopePrompt(null)}
      onApplyScope={applyStaffAssignmentScopePrompt}
    />
  );

  const staffDeleteDialogFlags = () => ({
    canDeleteFollowing: openStaffDeletePlan
      ? staffAssignmentCanDeleteFollowing(openStaffDeletePlan.parentAssignment)
      : false,
    showShortenedAssignmentWarning: Boolean(
      openStaffDeletePlan?.scope === 'following' && openStaffDeletePlan.shortenedAssignment,
    ),
    showDeletesParentWarning: Boolean(openStaffDeletePlan?.scope === 'following' && openStaffDeletePlan.deletesParent),
  });

  const renderDeleteConfirmation = () => (
    <OpenStaffDeleteConfirmationModal
      opened={Boolean(openStaffDeleteConfirmation)}
      title={
        openStaffDeletePlan?.parentAssignment.assignmentKind === 'OFFICIAL_SHIFT'
          ? 'Delete open official shift'
          : 'Delete open staff shift'
      }
      hasPlan={Boolean(openStaffDeletePlan)}
      {...staffDeleteDialogFlags()}
      scope={openStaffDeleteConfirmation?.scope ?? 'following'}
      occurrenceLabel={
        openStaffDeletePlan
          ? `${formatDisplayDateTime(openStaffDeletePlan.occurrenceStart)} - ${formatDisplayTime(openStaffDeletePlan.occurrenceEnd)}`
          : ''
      }
      childAssignments={
        openStaffDeletePlan?.childAssignments.map((assignment) => ({
          id: assignment.id,
          label: formatStaffAssignmentDeleteChildLabel(assignment),
        })) ?? []
      }
      onScopeChange={(scope) =>
        setOpenStaffDeleteConfirmation((current) => (current ? { ...current, scope } : current))
      }
      onCancel={() => setOpenStaffDeleteConfirmation(null)}
      onConfirm={() => void confirmOpenStaffAssignmentDelete()}
    />
  );

  const renderRentalEditor = () => (
    <CreateRentalSlotModal
      opened={createRentalOpen}
      onClose={() => {
        setCreateRentalOpen(false);
        setEditingRentalSlot(null);
        setEditingRentalField(null);
        setEditingManagerDraftId(null);
        setRentalDraftRange(null);
      }}
      field={editingRentalField ?? selectedField}
      selectedFields={!editingRentalSlot ? selectedFields : undefined}
      slot={editingRentalSlot}
      initialRange={editingRentalSlot ? null : rentalDraftRange}
      onSubmitOverride={managerCalendarEditMode ? handleRentalSlotModalSubmit : undefined}
      onDeleteOverride={managerCalendarEditMode ? handleRentalSlotModalDelete : undefined}
      onSaved={async (updatedFields) => {
        setOrg((prev) => {
          if (!prev) return prev;
          const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
          const updatedById = new Map(updatedFields.map((field) => [field.$id, field]));
          const nextFields = prevFields.map((field) => {
            const updatedField = updatedById.get(field.$id);
            return updatedField ? mergeFieldPreservingCalendarHydration(field, updatedField) : field;
          });
          return { ...prev, fields: nextFields };
        });
        await refreshOrganization();
      }}
      organizationHasStripeAccount={organizationHasStripeAccount}
      organizationId={organizationId}
      fieldColorReferenceList={fieldColorReferenceList}
    />
  );

  return (
    <Stack gap="md">
      {renderCreateDragPreview()}

      {renderHeading()}

      {orgError && (
        <Alert color="red" mb="md">
          {orgError}
        </Alert>
      )}

      {renderWorkspaceContent()}

      {renderStaffEditor()}

      {renderScopePrompt()}

      {renderDeleteConfirmation()}

      {renderRentalEditor()}
    </Stack>
  );
}
