import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import FacilityResourceCalendarGrid, {
  type FacilityResourceCalendarResource,
} from './FacilityResourceCalendarGrid';
import type { CalendarEventData } from './facilityCalendarTypes';
import { resolveFacilityCalendarDropPoint } from './facilityCalendarDropPoint';

const resources: FacilityResourceCalendarResource[] = [
  { id: 'field_1', label: 'Court 1' },
  { id: 'field_2', label: 'Court 2' },
];

const rentalEvent: CalendarEventData = {
  id: 'rental-event-1',
  title: 'Rental available',
  start: new Date(2026, 7, 24, 10, 0),
  end: new Date(2026, 7, 24, 12, 0),
  resourceId: 'field_1',
  resource: { $id: 'slot_1' } as CalendarEventData['resource'],
  metaType: 'rental',
  fieldName: 'Court 1',
};

const renderGrid = (overrides: Partial<ComponentProps<typeof FacilityResourceCalendarGrid>> = {}) => {
  const onSelectSlot = jest.fn();
  const onSelectEvent = jest.fn();
  const onNavigateDate = jest.fn();
  const onViewChange = jest.fn();
  const view = render(
    <FacilityResourceCalendarGrid
      resources={resources}
      events={[rentalEvent]}
      calendarView="week"
      calendarDate={new Date(2026, 7, 24, 10, 0)}
      calendarRangeStart={new Date(2026, 7, 23)}
      calendarRangeEnd={new Date(2026, 7, 29, 23, 59, 59, 999)}
      minTime={new Date(1970, 0, 1, 8)}
      maxTime={new Date(1970, 0, 1, 22)}
      fieldEventsLoading={false}
      eventPropGetter={() => ({})}
      onViewChange={onViewChange}
      onNavigateDate={onNavigateDate}
      onSelectSlot={onSelectSlot}
      onEventDrop={jest.fn()}
      onEventResize={jest.fn()}
      onSelectEvent={onSelectEvent}
      renderEvent={(event) => event.title}
      canMoveEvent={() => false}
      canResizeEvent={() => false}
      slotPropGetter={() => ({})}
      {...overrides}
    />,
  );
  return { ...view, onNavigateDate, onSelectEvent, onSelectSlot, onViewChange };
};

describe('FacilityResourceCalendarGrid', () => {
  it('opens an unsaved rental when a captured pointer is released without dragging', () => {
    const draft = { ...rentalEvent, metaType: 'selection' as const };
    const { onSelectEvent } = renderGrid({ events: [draft], canMoveEvent: () => true });
    const entry = screen.getByTestId('event-range-slot_1');
    fireEvent.pointerDown(entry, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 180, clientY: 50 });
    fireEvent.pointerUp(entry, { pointerId: 7, pointerType: 'mouse', clientX: 180, clientY: 50 });
    fireEvent.click(entry);
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
    expect(onSelectEvent).toHaveBeenCalledWith(draft);
  });

  it('shows the final hour of an overnight slot on the daylight-saving fall-back date', () => {
    renderGrid({
      calendarDate: new Date(2026, 10, 1),
      calendarRangeStart: new Date(2026, 10, 1),
      calendarRangeEnd: new Date(2026, 10, 7, 23, 59),
      events: [{ ...rentalEvent, start: new Date(2026, 10, 1, 23), end: new Date(2026, 10, 2) }],
    });
    expect(screen.getByTestId('event-range-slot_1')).toBeVisible();
  });

  it('keeps keyboard resizing within visible hours without opening the modal', () => {
    const onEventResize = jest.fn();
    const { onSelectEvent } = renderGrid({
      events: [{ ...rentalEvent, end: new Date(2026, 7, 24, 22) }],
      canResizeEvent: () => true, onEventResize,
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Adjust end of Rental available' }), { key: 'Enter' });
    expect(onEventResize).not.toHaveBeenCalled();
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it('previews the start edge and restores the original range when resizing is cancelled', () => {
    const onEventResize = jest.fn();
    const { onSelectEvent } = renderGrid({ canResizeEvent: () => true, onEventResize });
    const entry = screen.getByTestId('event-range-slot_1');
    const originalLeft = entry.style.left;
    const originalWidth = entry.style.width;
    const handle = screen.getByRole('button', { name: 'Adjust start of Rental available' });
    fireEvent.pointerDown(handle, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 160, clientY: 40 });
    fireEvent.pointerMove(handle, { pointerId: 3, pointerType: 'mouse', clientX: 150, clientY: 40 });
    expect(entry.style.left).not.toBe(originalLeft);
    expect(entry.style.width).not.toBe(originalWidth);
    expect(onEventResize).not.toHaveBeenCalled();
    fireEvent.pointerCancel(handle, { pointerId: 3 });
    expect(entry.style.left).toBe(originalLeft);
    expect(entry.style.width).toBe(originalWidth);
    fireEvent.click(handle);
    expect(onEventResize).not.toHaveBeenCalled();
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it('resizes in place before committing and does not open the entry on release', () => {
    const onEventResize = jest.fn();
    const onEventDrop = jest.fn();
    const { onSelectEvent } = renderGrid({ canMoveEvent: () => true, canResizeEvent: () => true, onEventResize, onEventDrop });
    const entry = screen.getByTestId('event-range-slot_1');
    const originalWidth = entry.style.width;
    const handle = screen.getByRole('button', { name: 'Adjust end of Rental available' });
    fireEvent.pointerDown(handle, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 184, clientY: 40 });
    fireEvent.pointerMove(handle, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 40 });
    expect(onEventResize).not.toHaveBeenCalled();
    expect(entry.style.width).not.toBe(originalWidth);
    expect(screen.queryByTestId('calendar-event-drag-preview')).not.toBeInTheDocument();
    fireEvent.pointerUp(handle, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 40 });
    fireEvent.click(handle);
    expect(onEventResize).toHaveBeenCalledTimes(1);
    expect(onEventDrop).not.toHaveBeenCalled();
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it.each(['rental', 'selection'] as const)('does not open %s from the click produced by a completed move', (metaType) => {
    const { onSelectEvent } = renderGrid({ events: [{ ...rentalEvent, metaType }], canMoveEvent: () => true });
    const entry = screen.getByTestId('event-range-slot_1');
    fireEvent.pointerDown(entry, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 180, clientY: 40 });
    fireEvent.pointerMove(entry, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 40 });
    fireEvent.pointerUp(entry, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 40 });
    fireEvent.click(entry);
    expect(onSelectEvent).not.toHaveBeenCalled();
    fireEvent.pointerDown(entry, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 200, clientY: 40 });
    fireEvent.pointerUp(entry, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 40 });
    fireEvent.click(entry);
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects creation drops on sticky labels and clipped time slots after scrolling', () => {
    const { container } = renderGrid();
    container.querySelector<HTMLElement>('[data-calendar-timeline]')!.getBoundingClientRect = () => new DOMRect(-280, 80, 980, 72);
    container.querySelector<HTMLElement>('.facility-resource-calendar__viewport')!.getBoundingClientRect = () => new DOMRect(0, 0, 600, 224);
    container.querySelectorAll<HTMLElement>('[data-resource-row]').forEach((row, index) => {
      row.getBoundingClientRect = () => new DOMRect(0, 80 + index * 72, 980, 72);
      row.querySelector<HTMLElement>('.facility-resource-calendar__resource-label')!.getBoundingClientRect = () => new DOMRect(0, 80 + index * 72, 112, 72);
    });
    const options = {
      rangeStart: new Date(2026, 7, 23), rangeEnd: new Date(2026, 7, 29),
      minTime: new Date(1970, 0, 1, 8), maxTime: new Date(1970, 0, 1, 22),
      stepMinutes: 30, durationMs: 3600000,
    };
    expect(resolveFacilityCalendarDropPoint(container, 50, 100, options)).toBeNull();
    expect(resolveFacilityCalendarDropPoint(container, 650, 100, options)).toBeNull();
    expect(resolveFacilityCalendarDropPoint(container, 300, 100, options)).toEqual({
      resourceId: 'field_1', start: new Date(2026, 7, 27, 10), end: new Date(2026, 7, 27, 11),
    });
  });

  it('resolves an external creation drop on the second resource and rejects space below it', () => {
    const { container } = renderGrid();
    const timeline = container.querySelector<HTMLElement>('[data-calendar-timeline]')!;
    timeline.getBoundingClientRect = () => new DOMRect(0, 80, 980, 72);
    container.querySelectorAll<HTMLElement>('[data-resource-row]').forEach((row, index) => {
      row.getBoundingClientRect = () => new DOMRect(0, 80 + index * 72, 980, 72);
    });
    const options = {
      rangeStart: new Date(2026, 7, 23), rangeEnd: new Date(2026, 7, 29),
      minTime: new Date(1970, 0, 1, 8), maxTime: new Date(1970, 0, 1, 22),
      stepMinutes: 30, durationMs: 3600000,
    };
    expect(resolveFacilityCalendarDropPoint(container, 160, 180, options)).toEqual({
      resourceId: 'field_2', start: rentalEvent.start, end: new Date(2026, 7, 24, 11),
    });
    expect(resolveFacilityCalendarDropPoint(container, 160, 225, options)).toBeNull();
  });

  it.each([[0, 120], [15, 120], [15, 15]])('keeps a later-day entry at the same time when moved to another resource (%i start minutes, %i duration)', (minutes, duration) => {
    const onEventDrop = jest.fn();
    const start = new Date(2026, 7, 24, 10, minutes);
    const booking = { ...rentalEvent, start, end: new Date(start.getTime() + duration * 60000) };
    renderGrid({ events: [booking], canMoveEvent: () => true, onEventDrop });
    const entry = screen.getByTestId('event-range-slot_1');
    fireEvent.pointerDown(entry, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 180, clientY: 40 });
    fireEvent.pointerMove(entry, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 100 });
    fireEvent.pointerUp(entry, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 100 });
    expect(onEventDrop).toHaveBeenCalledWith({
      event: booking,
      start: booking.start,
      end: booking.end,
      resourceId: 'field_2',
    });
  });

  it('keeps date navigation and zoom usable while resource rows load', () => {
    const { container, onNavigateDate, onViewChange, onSelectSlot } = renderGrid({ fieldEventsLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading resources');
    expect(screen.queryByText('Rental available')).not.toBeInTheDocument();
    expect(screen.getAllByText('10 AM')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Next Week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(onNavigateDate).toHaveBeenCalledWith(new Date(2026, 7, 31, 10, 0));
    expect(onViewChange).toHaveBeenCalledWith('month');
    const viewport = container.querySelector<HTMLElement>('.facility-resource-calendar__viewport')!;
    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -100 });
    expect(onSelectSlot).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.facility-resource-calendar__resource-row')).toHaveLength(2);
  });
  it('renders dates and times across resource rows', () => {
    const { container } = renderGrid();

    expect(screen.getByRole('columnheader', { name: 'Resource' })).toBeInTheDocument();
    expect(screen.getByText('Sun 23')).toBeInTheDocument();
    expect(screen.getByText('Mon 24')).toBeInTheDocument();
    expect(screen.getAllByText('10 AM')).toHaveLength(7);
    expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-calendar-timeline]')).toHaveLength(2);
    expect(container.querySelectorAll('.rbc-day-slot')).toHaveLength(14);
    expect(screen.getByText('Rental available')).toBeInTheDocument();
  });

  it('selects a time slot in the resource row and selects rental events', () => {
    const { container, onSelectEvent, onSelectSlot } = renderGrid();
    const firstDayTrack = container.querySelector<HTMLElement>('.rbc-day-slot');
    const event = screen.getByTestId('event-range-slot_1');

    expect(firstDayTrack).not.toBeNull();
    fireEvent.click(firstDayTrack as HTMLElement, { clientX: 0, clientY: 0 });
    fireEvent.click(event);

    expect(onSelectSlot).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 'field_1',
      start: new Date(2026, 7, 23, 8, 0),
      end: new Date(2026, 7, 23, 8, 30),
    }));
    expect(onSelectEvent).toHaveBeenCalledWith(rentalEvent);
  });

  it('keeps the selected date while navigating and changes the calendar view', () => {
    const { onNavigateDate, onViewChange } = renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Next Week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));

    expect(onNavigateDate).toHaveBeenCalledWith(new Date(2026, 7, 31, 10, 0));
    expect(onViewChange).toHaveBeenCalledWith('month');
  });

  it('keeps time labels readable and changes their scale only with Control plus wheel', () => {
    const { container } = renderGrid();
    const viewport = container.querySelector<HTMLElement>('.facility-resource-calendar__viewport');
    const grid = screen.getByRole('grid');

    expect(viewport).not.toBeNull();
    expect(grid.style.getPropertyValue('--facility-calendar-time-label-width')).toBe('44px');

    fireEvent.wheel(viewport as HTMLElement, { deltaY: -100 });
    expect(grid.style.getPropertyValue('--facility-calendar-time-label-width')).toBe('44px');

    fireEvent.wheel(viewport as HTMLElement, { ctrlKey: true, deltaY: -100 });
    expect(grid.style.getPropertyValue('--facility-calendar-time-label-width')).toBe('52px');

    fireEvent.wheel(viewport as HTMLElement, { ctrlKey: true, deltaY: 100 });
    expect(grid.style.getPropertyValue('--facility-calendar-time-label-width')).toBe('44px');
  });

  it('sizes the calendar body from its resource rows', () => {
    renderGrid();

    expect(screen.getByRole('grid')).not.toHaveStyle({ minHeight: '420px' });
  });

  it('shows a floating card while an existing entry moves', () => {
    renderGrid({ canMoveEvent: () => true });
    const event = screen.getByTestId('event-range-slot_1');

    fireEvent.pointerDown(event, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 200,
      clientY: 40,
    });
    fireEvent.pointerMove(event, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 260,
      clientY: 40,
    });

    expect(screen.getByTestId('calendar-event-drag-preview')).toHaveTextContent('Rental available');
  });

  it('provides large handles for changing both edges of an entry', () => {
    const onEventResize = jest.fn();
    renderGrid({ canResizeEvent: () => true, onEventResize });

    expect(screen.getByRole('button', { name: 'Adjust start of Rental available' })).toBeInTheDocument();
    const endHandle = screen.getByRole('button', { name: 'Adjust end of Rental available' });

    fireEvent.pointerDown(endHandle, {
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      clientX: 184,
      clientY: 40,
    });
    fireEvent.pointerMove(endHandle, {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 200,
      clientY: 40,
    });
    fireEvent.pointerUp(endHandle, {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 200,
      clientY: 40,
    });

    expect(onEventResize).toHaveBeenCalledWith(expect.objectContaining({
      event: rentalEvent,
      resourceId: 'field_1',
      start: rentalEvent.start,
      end: new Date(2026, 7, 24, 13, 30),
    }));
  });
});
