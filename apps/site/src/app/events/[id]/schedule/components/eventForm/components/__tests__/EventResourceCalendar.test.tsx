import { fireEvent, screen, within } from '@testing-library/react';

import type { Field } from '@/types';
import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';

import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';

import EventResourceCalendar from '../EventResourceCalendar';

const fields: Field[] = [
  {
    $id: 'field-1',
    name: 'Court 1',
    location: '',
    lat: 0,
    long: 0,
    facilityId: 'facility-1',
    facility: {
      $id: 'facility-1',
      organizationId: 'org-1',
      name: 'South Center',
      location: '',
    },
  },
  {
    $id: 'field-2',
    name: 'Court 2',
    location: '',
    lat: 0,
    long: 0,
    facilityId: 'facility-2',
    facility: {
      $id: 'facility-2',
      organizationId: 'org-1',
      name: 'North Center',
      location: '',
    },
  },
];
const slots: LeagueSlotForm[] = fields.map((field, index) => ({
  key: `slot-${field.$id}`,
  timeZone: 'UTC',
  scheduledFieldId: field.$id,
  scheduledFieldIds: [field.$id],
  daysOfWeek: [],
  dayOfWeek: undefined,
  startDate: `2026-08-${String(15 + index).padStart(2, '0')}T09:00`,
  endDate: `2026-08-${String(15 + index).padStart(2, '0')}T10:00`,
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  repeating: false,
  divisions: [],
  conflicts: [],
  checking: false,
}));

describe('EventResourceCalendar', () => {
  it('filters month rows by Resource without changing Event slot callbacks', () => {
    const onCreateSelection = jest.fn();
    const onSelectSlot = jest.fn();
    const onAssignResource = jest.fn();
    const onDeleteSlot = jest.fn();
    const { container } = renderWithMantine(
      <EventResourceCalendar
        slots={slots}
        fields={fields}
        eventStart="2026-08-15T09:00:00"
        eventEnd="2026-08-15T17:00:00"
        eventTimeZone="UTC"
        onCreateSelection={onCreateSelection}
        onSelectSlot={onSelectSlot}
        onAssignResource={onAssignResource}
        onDeleteSlot={onDeleteSlot}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    const grid = screen.getByRole('grid');
    expect(within(grid).getAllByText('South Center - Court 1')).toHaveLength(42);
    expect(within(grid).getAllByText('North Center - Court 2')).toHaveLength(42);
    expect(container.querySelector('[data-resource-id="field-1"] .event-resource-calendar__entry')).toBeInTheDocument();
    expect(container.querySelector('[data-resource-id="field-2"] .event-resource-calendar__entry')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter Resources' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search Resources or Facilities' }),
      { target: { value: 'North Center' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /Court 2/ }));

    expect(within(grid).getAllByText('South Center - Court 1')).toHaveLength(42);
    expect(within(grid).queryByText('North Center - Court 2')).not.toBeInTheDocument();
    expect(container.querySelector('[data-resource-id="field-1"] .event-resource-calendar__entry')).toBeInTheDocument();
    expect(container.querySelector('[data-resource-id="field-2"] .event-resource-calendar__entry')).not.toBeInTheDocument();
    expect(onCreateSelection).not.toHaveBeenCalled();
    expect(onSelectSlot).not.toHaveBeenCalled();
    expect(onAssignResource).not.toHaveBeenCalled();
    expect(onDeleteSlot).not.toHaveBeenCalled();
  });
  it('shows a selectable boundary-only range without creating a Time Slot', () => {
    const onCreateSelection = jest.fn();
    const { container } = renderWithMantine(
      <EventResourceCalendar
        eventType="LEAGUE"
        slots={[]}
        fields={fields}
        eventStart="2026-08-15T09:00:00"
        eventEnd="2026-08-15T17:00:00"
        eventTimeZone="UTC"
        showBoundaryOnlyRange
        onCreateSelection={onCreateSelection}
        onSelectSlot={jest.fn()}
        onAssignResource={jest.fn()}
        onDeleteSlot={jest.fn()}
      />,
    );

    const boundaryRange = screen.getByRole('button', {
      name: /Select boundary-only range/i,
    });
    expect(boundaryRange).toHaveTextContent('No Time Slot is created for this range.');
    expect(container.querySelector('.event-resource-calendar__entry')).not.toBeInTheDocument();

    fireEvent.click(boundaryRange);

    expect(onCreateSelection).toHaveBeenCalledWith({
      start: new Date('2026-08-15T09:00:00.000Z'),
      end: new Date('2026-08-15T17:00:00.000Z'),
      resourceId: '',
    });
  });
  it('allows boundary-only selection without Resources', () => {
    const onCreateSelection = jest.fn();
    renderWithMantine(
      <EventResourceCalendar
        eventType="LEAGUE"
        slots={[]}
        fields={[]}
        eventStart="2026-08-15T09:00:00"
        eventEnd="2026-08-15T17:00:00"
        eventTimeZone="UTC"
        showBoundaryOnlyRange
        onCreateSelection={onCreateSelection}
        onSelectSlot={jest.fn()}
        onAssignResource={jest.fn()}
        onDeleteSlot={jest.fn()}
      />,
    );

    const boundaryCell = screen.getByRole('gridcell', {
      name: /Event boundary on Saturday, August 15/,
    });
    fireEvent.click(within(boundaryCell).getByRole('button', { name: 'Add' }));

    expect(onCreateSelection).toHaveBeenCalledWith({
      start: new Date('2026-08-15T09:00:00.000Z'),
      end: new Date('2026-08-15T10:00:00.000Z'),
      resourceId: '',
    });
  });
});
