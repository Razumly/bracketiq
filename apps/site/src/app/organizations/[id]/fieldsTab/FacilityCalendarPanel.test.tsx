import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import FacilityCalendarPanel from './FacilityCalendarPanel';
import {
  facilityEventPresentation, isManagerDraftEvent, isStaffFeedEvent,
  canChangeFacilityEventRange, managerDraftFromCalendarEvent,
  type ManagerDraftCalendarEntry,
} from './facilityCalendarEventPresentation';
import type { CalendarEventData, FacilityFeedCalendarEntry } from './facilityCalendarTypes';

const start = new Date(2026, 7, 24, 9);
const end = new Date(2026, 7, 24, 10);
const base = { id: 'entry_1', title: 'Avery Chen', start, end, resourceId: 'field_1', fieldName: 'Court 1' };
const titles = { rental: 'New rental slot', staff_assignment: 'Open staff shift', official_assignment: 'Open official shift' };
const selection: ManagerDraftCalendarEntry = {
  ...base, metaType: 'selection',
  resource: { type: 'selection', slotKey: 'draft_1', mode: 'staff_assignment', userId: 'user_1' },
};
const rental: CalendarEventData = {
  ...base, metaType: 'rental', resource: { $id: 'slot_1', repeating: false },
};
const staffEvent: FacilityFeedCalendarEntry = {
  ...base, metaType: 'facility-feed', feedType: 'staff_assignment',
  resource: {
    id: 'staff_1', type: 'staff_assignment', title: 'Avery Chen', start, end,
    facilityId: 'facility_1', facilityName: 'Sports Center', fieldId: 'field_1', fieldName: 'Court 1',
    status: 'CONFIRMED', userId: 'user_1', source: {},
  },
};

function renderPanel(overrides: Partial<ComponentProps<typeof FacilityCalendarPanel>> = {}) {
  const props: ComponentProps<typeof FacilityCalendarPanel> = {
    canRenderCalendar: true, emptyText: 'No resources', events: [staffEvent],
    resources: [{ id: 'field_1', label: 'Court 1' }],
    calendarView: 'week', calendarDate: start,
    calendarRangeStart: new Date(2026, 7, 23), calendarRangeEnd: new Date(2026, 7, 29, 23, 59, 59, 999),
    minTime: new Date(1970, 0, 1, 8), maxTime: new Date(1970, 0, 1, 22),
    canManage: true, managerCalendarEditMode: false, fieldEventsLoading: false,
    fieldColorReferenceList: [], managerDraftDragId: null, managerSelectionTitles: titles,
    getCalendarEventVariant: () => 'staff-assigned',
    onManagerDraftClick: jest.fn(), onManagerDraftPointerDown: jest.fn(),
    onManagerDraftPointerMove: jest.fn(), onManagerDraftPointerUp: jest.fn(), onManagerDraftPointerCancel: jest.fn(),
    isStaffAssignmentActivationSuppressed: jest.fn(() => false), onOpenStaffAssignmentEdit: jest.fn(),
    eventPropGetter: () => ({}), slotPropGetter: () => ({}),
    onViewChange: jest.fn(), onNavigateDate: jest.fn(), onEventDrop: jest.fn(), onEventResize: jest.fn(),
    onSelectSlot: jest.fn(), onSelectEvent: jest.fn(), onShellPointerDownCapture: jest.fn(),
    onShellPointerUpCapture: jest.fn(), onShellClickCapture: jest.fn(), ...overrides,
  };
  return { props, ...render(<FacilityCalendarPanel {...props} />) };
}

describe('facility calendar cards', () => {
  it('clears the conflict border when the conflict resolves and keeps the card editable', () => {
    const { props, rerender } = renderPanel({ conflictingEventIds: new Set([staffEvent.id]) });
    const card = screen.getByRole('button', { name: /Avery Chen Court 1 Confirmed/ });
    expect(card).toHaveClass('shared-calendar-event--conflict');
    fireEvent.click(card);
    expect(props.onOpenStaffAssignmentEdit).toHaveBeenCalledTimes(1);
    rerender(<FacilityCalendarPanel {...props} conflictingEventIds={new Set()} />);
    expect(card).not.toHaveClass('shared-calendar-event--conflict');
    expect(card).toHaveClass('shared-calendar-event--staff-assigned');
  });
  it.each([
    { event: selection, publicAllowed: true, managerAllowed: true },
    { event: rental, publicAllowed: false, managerAllowed: true },
    { event: { ...rental, metaType: 'booked' } as CalendarEventData, publicAllowed: false, managerAllowed: false },
    { event: staffEvent, publicAllowed: false, managerAllowed: true },
    { event: { ...staffEvent, feedType: 'official_assignment' } as CalendarEventData, publicAllowed: false, managerAllowed: true },
    { event: { ...staffEvent, feedType: 'event' } as CalendarEventData, publicAllowed: false, managerAllowed: false },
  ])('keeps move and resize permissions for $event.metaType/$event.feedType', ({ event, publicAllowed, managerAllowed }) => {
    expect(canChangeFacilityEventRange(event, false, false)).toBe(publicAllowed);
    expect(canChangeFacilityEventRange(event, false, true)).toBe(publicAllowed);
    expect(canChangeFacilityEventRange(event, true, false)).toBe(false);
    expect(canChangeFacilityEventRange(event, true, true)).toBe(managerAllowed);
  });

  it('keeps assigned names and uses open-shift titles only for unassigned drafts', () => {
    expect(facilityEventPresentation(selection, 'staff-assigned', true, titles)).toEqual({ title: 'Avery Chen', meta: 'Unsaved' });
    const unassigned = { ...selection, resource: { ...selection.resource, userId: null } };
    expect(facilityEventPresentation(unassigned, 'staff-open', true, titles)).toEqual({ title: 'Open staff shift', meta: 'Unsaved' });
    expect(facilityEventPresentation(unassigned, 'selection', false, titles)).toEqual({ title: 'Avery Chen', meta: '09:00 AM - 10:00 AM' });
  });

  it('uses status for feed entries and distinguishes open rentals, past rentals, and reservations', () => {
    expect(facilityEventPresentation(staffEvent, 'staff-assigned', true, titles)).toEqual({ title: 'Avery Chen', meta: 'Confirmed' });
    expect(facilityEventPresentation({ ...staffEvent, resource: { ...staffEvent.resource, unresolved: true } }, 'conflict', true, titles).meta).toBe('Unresolved');
    expect(facilityEventPresentation(rental, 'availability', false, titles)).toEqual({ title: 'Open rental slot', meta: '09:00 AM - 10:00 AM' });
    expect(facilityEventPresentation(rental, 'unavailable', false, titles)).toEqual({ title: 'Past rental slot', meta: 'Unavailable' });
    expect(facilityEventPresentation({ ...rental, metaType: 'booked' }, 'reservation', false, titles)).toEqual({ title: 'Rental reservation', meta: 'Reserved' });
  });

  it('requires a draft identity and edit permission before opening a draft', () => {
    expect(isManagerDraftEvent(selection, true, true)).toBe(true);
    expect(isManagerDraftEvent(selection, true, false)).toBe(false);
    expect(isManagerDraftEvent(selection, false, true)).toBe(false);
    expect(isManagerDraftEvent({ ...selection, resource: { ...selection.resource, slotKey: '' } }, true, true)).toBe(false);
    expect(isStaffFeedEvent(staffEvent, true)).toBe(true);
    expect(isStaffFeedEvent(staffEvent, false)).toBe(false);
  });

  it('copies the selected resource and occurrence into a fallback draft without mutating the calendar event', () => {
    const draft = managerDraftFromCalendarEvent(selection)!;
    expect(draft).toEqual({
      id: 'draft_1', mode: 'staff_assignment', fieldIds: ['field_1'], start, end,
      staff: { userId: 'user_1', userName: 'Avery Chen' },
    });
    draft.start.setHours(12);
    expect(selection.start.getHours()).toBe(9);
    const rentalDraft = managerDraftFromCalendarEvent({ ...selection, selectionMode: 'rental' });
    expect(rentalDraft).toEqual(expect.objectContaining({ mode: 'rental', rental: {} }));
    expect(rentalDraft).not.toHaveProperty('staff');
  });

  it('opens staff details by keyboard and suppresses clicks and pointer activation after a drag', () => {
    const suppressed = jest.fn(() => true);
    const { props } = renderPanel({ isStaffAssignmentActivationSuppressed: suppressed });
    const card = screen.getByRole('button', { name: /Avery Chen Court 1 Confirmed/ });
    fireEvent.click(card);
    fireEvent.pointerUp(card);
    expect(props.onOpenStaffAssignmentEdit).not.toHaveBeenCalled();
    suppressed.mockReturnValue(false);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(props.onOpenStaffAssignmentEdit).toHaveBeenCalledTimes(1);
    expect(props.onOpenStaffAssignmentEdit).toHaveBeenCalledWith(staffEvent.resource, start, end);
  });

  it('moves staff cards without opening details from the release click', () => {
    const { props } = renderPanel({ managerCalendarEditMode: true });
    const card = screen.getByRole('button', { name: /Avery Chen Court 1 Confirmed/ });
    fireEvent.pointerDown(card, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 180, clientY: 40 });
    fireEvent.pointerMove(card, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 40 });
    fireEvent.pointerUp(card, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 40 });
    fireEvent.click(card);
    expect(props.onEventDrop).toHaveBeenCalledTimes(1);
    expect(props.onOpenStaffAssignmentEdit).not.toHaveBeenCalled();
    expect(props.onShellPointerUpCapture).not.toHaveBeenCalled();
    expect(props.onShellClickCapture).not.toHaveBeenCalled();
  });

  it('opens a draft by keyboard and forwards draft pointer actions', () => {
    const { props } = renderPanel({ events: [selection], managerCalendarEditMode: true });
    const card = screen.getByRole('button', { name: /Avery Chen Court 1 Unsaved/ });
    fireEvent.keyDown(card, { key: ' ' });
    expect(props.onManagerDraftClick).toHaveBeenCalledWith('draft_1', expect.objectContaining({ fieldIds: ['field_1'], mode: 'staff_assignment' }));
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(card, { pointerId: 1 });
    fireEvent.pointerCancel(card, { pointerId: 1 });
    expect(props.onManagerDraftPointerDown).toHaveBeenCalledWith(selection, expect.anything());
    expect(props.onManagerDraftPointerMove).toHaveBeenCalledTimes(1);
    expect(props.onManagerDraftPointerUp).toHaveBeenCalledTimes(1);
    expect(props.onManagerDraftPointerCancel).toHaveBeenCalledTimes(1);
  });

  it('enables keyboard resizing only after a manager enters edit mode', () => {
    const { props, rerender } = renderPanel();
    expect(screen.queryByRole('button', { name: 'Adjust end of Avery Chen' })).not.toBeInTheDocument();
    rerender(<FacilityCalendarPanel {...props} managerCalendarEditMode />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Adjust end of Avery Chen' }), { key: 'Enter' });
    expect(props.onEventResize).toHaveBeenCalledWith({
      event: staffEvent, start, end: new Date(2026, 7, 24, 10, 30), resourceId: 'field_1',
    });
  });
});
