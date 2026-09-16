import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ResourceCalendarResource } from '@/components/calendar/resourceCalendarModel';

import EventResourceCalendarWeekTimeline from '../EventResourceCalendarWeekTimeline';
import type { EventResourceCalendarEntry } from '../../eventResourceCalendar';

const resources: ResourceCalendarResource[] = [
  { id: 'field-1', label: 'Court 1' },
  { id: 'field-2', label: 'Court 2' },
];

const days = Array.from({ length: 7 }, (_, index) => new Date(2026, 7, 23 + index));

const entry: EventResourceCalendarEntry = {
  id: 'entry-1',
  title: 'Court 1',
  start: new Date(2026, 7, 24, 10),
  end: new Date(2026, 7, 24, 12),
  instantStart: new Date('2026-08-24T17:00:00.000Z'),
  instantEnd: new Date('2026-08-24T19:00:00.000Z'),
  resourceId: 'field-1',
  slotIndex: 0,
  slotKey: 'slot-1',
  logicalSlotKey: 'slot-1',
  occurrenceDate: '2026-08-24',
  repeating: false,
  timeZone: 'America/Los_Angeles',
};

describe('EventResourceCalendarWeekTimeline', () => {
  it('renders every Resource as a seven-day time-axis row', () => {
    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[entry]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
      />,
    );

    const courtOneRow = screen.getByRole('row', { name: /Court 1 on Monday/ });
    const courtTwoRow = screen.getByRole('row', { name: /Court 2 on Monday/ });
    expect(within(courtOneRow).getAllByRole('gridcell')).toHaveLength(7);
    expect(within(courtTwoRow).getAllByRole('gridcell')).toHaveLength(7);
    expect(screen.getByText('Mon 24')).toBeInTheDocument();
    expect(screen.getByText('One-Time Time Slot')).toBeInTheDocument();
  });
  it('formats Event wall time from the Event timezone across a browser DST gap', () => {
    const dstEntry: EventResourceCalendarEntry = {
      ...entry,
      start: new Date('2027-03-14T07:15:00.000Z'),
      end: new Date('2027-03-14T07:45:00.000Z'),
      instantStart: new Date('2027-03-14T02:15:00.000Z'),
      instantEnd: new Date('2027-03-14T02:45:00.000Z'),
      timeZone: 'UTC',
    };
    const dstDays = Array.from({ length: 7 }, (_, index) =>
      new Date(2027, 2, 14 + index));

    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={dstDays}
        entries={[dstEntry]}
        eventTimeZone="UTC"
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /02:15 AM–02:45 AM/ })).toBeInTheDocument();
  });


  it('keeps a repeated-hour Event interval visible', () => {
    const foldEntry: EventResourceCalendarEntry = {
      ...entry,
      start: new Date('2027-11-07T05:45:00.000Z'),
      end: new Date('2027-11-07T06:15:00.000Z'),
      instantStart: new Date('2027-11-07T05:45:00.000Z'),
      instantEnd: new Date('2027-11-07T06:15:00.000Z'),
      timeZone: 'America/New_York',
    };
    const foldDays = Array.from({ length: 7 }, (_, index) =>
      new Date(2027, 10, 7 + index));

    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={foldDays}
        entries={[foldEntry]}
        eventTimeZone="America/New_York"
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /01:45 AM–01:15 AM/ })).toBeInTheDocument();
  });

  it('selects the clicked half-hour on the selected Resource row', () => {
    const onCreateSelection = jest.fn();
    const { container } = render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={onCreateSelection}
        onSelectSlot={jest.fn()}
      />,
    );
    const mondayTrack = container.querySelectorAll<HTMLElement>(
      '[data-resource-id="field-1"] .event-resource-calendar__timeline-day-track',
    )[1];
    mondayTrack.getBoundingClientRect = () => new DOMRect(0, 0, 240, 80);

    fireEvent.click(mondayTrack, { clientX: 100 });

    expect(onCreateSelection).toHaveBeenCalledWith({
      day: days[1],
      resourceId: 'field-1',
      startMinutes: 600,
    });
  });

  it('selects a visible Time Slot for editing', () => {
    const onSelectSlot = jest.fn();
    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[entry]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={onSelectSlot}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Select to edit Time Slot 1/ }));

    expect(onSelectSlot).toHaveBeenCalledWith(0);
  });
  it('keeps an interval ending at local midnight visible', () => {
    const overnightEntry = {
      ...entry,
      start: new Date(2026, 7, 24, 23),
      end: new Date(2026, 7, 25, 0),
      instantStart: new Date('2026-08-25T06:00:00.000Z'),
      instantEnd: new Date('2026-08-25T07:00:00.000Z'),
    };
    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[overnightEntry]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Select to edit Time Slot 1/ })).toBeInTheDocument();
  });

  it('moves a visible Time Slot through the weekly timeline', () => {
    const onMoveSlot = jest.fn();
    const { container } = render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[entry]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
        onMoveSlot={onMoveSlot}
      />,
    );
    const event = screen.getByRole('button', { name: /Select to edit Time Slot 1/ });
    const viewport = container.querySelector('.event-resource-calendar__timeline-viewport') as HTMLElement;
    const grid = container.querySelector('[data-calendar-grid]') as HTMLElement;
    grid.getBoundingClientRect = () => new DOMRect(0, 0, 11680, 200);
    const axis = container.querySelector('.event-resource-calendar__timeline-header') as HTMLElement;
    axis.getBoundingClientRect = () => new DOMRect(0, 0, 10080, 200);

    fireEvent.pointerDown(event, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 2040,
      clientY: 0,
    });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 2340, clientY: 0 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 2340, clientY: 0 });

    expect(onMoveSlot).toHaveBeenCalledWith(
      entry,
      expect.objectContaining({
        start: new Date(2026, 7, 24, 15),
        end: new Date(2026, 7, 24, 17),
        resourceId: 'field-1',
      }),
    );
  });

  it('keeps a slot time when moving it to another Resource', () => {
    const onMoveSlot = jest.fn();
    const { container } = render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[entry]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
        onMoveSlot={onMoveSlot}
      />,
    );
    const event = screen.getByRole('button', { name: /Select to edit Time Slot 1/ });
    const viewport = container.querySelector('.event-resource-calendar__timeline-viewport') as HTMLElement;
    const axis = container.querySelector('.event-resource-calendar__timeline-header') as HTMLElement;
    axis.getBoundingClientRect = () => new DOMRect(0, 0, 10080, 200);
    const resourceElement = document.createElement('div');
    const resourceRow = document.createElement('div');
    resourceRow.setAttribute('data-resource-id', 'field-2');
    resourceRow.append(resourceElement);
    const originalElementsFromPoint = document.elementsFromPoint;
    document.elementsFromPoint = () => [resourceElement];

    try {
      fireEvent.pointerDown(event, {
        pointerId: 2,
        pointerType: 'mouse',
        button: 0,
        clientX: 2040,
        clientY: 0,
      });
      fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 2040, clientY: 40 });
      fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 2040, clientY: 40 });
    } finally {
      document.elementsFromPoint = originalElementsFromPoint;
    }

    expect(onMoveSlot).toHaveBeenCalledWith(
      entry,
      expect.objectContaining({
        start: entry.start,
        end: entry.end,
        resourceId: 'field-2',
      }),
    );
  });

  it('preserves the original Start when resizing an overnight slot at the week edge', () => {
    const onResizeSlot = jest.fn();
    const crossingEntry: EventResourceCalendarEntry = {
      ...entry,
      start: new Date('2026-08-22T23:00:00.000Z'),
      end: new Date('2026-08-23T01:00:00.000Z'),
      instantStart: new Date('2026-08-22T23:00:00.000Z'),
      instantEnd: new Date('2026-08-23T01:00:00.000Z'),
      timeZone: 'UTC',
    };
    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[crossingEntry]}
        eventTimeZone="UTC"
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
        onResizeSlot={onResizeSlot}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Adjust end of Time Slot 1' }), {
      key: 'Enter',
    });

    expect(onResizeSlot).toHaveBeenCalledWith(
      crossingEntry,
      expect.objectContaining({
        start: crossingEntry.start,
        startInstant: crossingEntry.instantStart,
        endInstant: new Date('2026-08-23T01:30:00.000Z'),
      }),
    );
  });

  it('resizes a visible Time Slot from an accessible edge handle', () => {
    const onResizeSlot = jest.fn();
    render(
      <EventResourceCalendarWeekTimeline
        resources={resources}
        days={days}
        entries={[entry]}
        resourceLabelSingular="Court"
        defaultStartMinutes={8 * 60}
        readOnly={false}
        onCreateSelection={jest.fn()}
        onSelectSlot={jest.fn()}
        onResizeSlot={onResizeSlot}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Adjust end of Time Slot 1' }), {
      key: 'Enter',
    });

    expect(onResizeSlot).toHaveBeenCalledWith(
      entry,
      expect.objectContaining({
        start: entry.start,
        end: new Date(2026, 7, 24, 12, 30),
        resourceId: 'field-1',
      }),
    );
  });
});
