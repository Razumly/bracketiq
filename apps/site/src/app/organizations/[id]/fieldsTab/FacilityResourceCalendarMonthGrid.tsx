'use client';

import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

import type { CalendarEventData } from './facilityCalendarTypes';
import { entriesOverlapRange, type ResourceCalendarRange } from '@/components/calendar/resourceCalendarModel';
import { useOrganizationDataLoading } from '@/components/organization/OrganizationDataLoading';
import CalendarLoadingRows from './CalendarLoadingRows';
import type { FacilityResourceCalendarResource } from './FacilityResourceCalendarGrid';

type FacilityResourceCalendarMonthGridProps = {
  resources: FacilityResourceCalendarResource[];
  events: CalendarEventData[];
  calendarRangeStart: Date;
  calendarRangeEnd: Date;
  fieldEventsLoading: boolean;
  eventPropGetter: (event: CalendarEventData) => Record<string, unknown>;
  onSelectSlot: (slotInfo: { start: Date; end: Date; resourceId: string }) => void;
  onSelectEvent: (event: CalendarEventData) => void;
  onEventDrop: (payload: {
    event: CalendarEventData;
    start: Date;
    end: Date;
    resourceId: string;
  }) => void;
  onEventResize: (payload: {
    event: CalendarEventData;
    start: Date;
    end: Date;
    resourceId: string;
  }) => void;
  renderEvent: (event: CalendarEventData) => ReactNode;
  canMoveEvent: (event: CalendarEventData) => boolean;
  canResizeEvent: (event: CalendarEventData) => boolean;
  slotPropGetter: (date: Date, resourceId?: string) => Record<string, unknown>;
};

const SLOT_DURATION_MINUTES = 30;

const monthDays = (start: Date, end: Date): Date[] => {
  const first = startOfDay(start);
  const count = differenceInCalendarDays(startOfDay(end), first) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(first, index));
};

const dayRange = (day: Date): ResourceCalendarRange => {
  const start = startOfDay(day);
  return {
    start,
    end: addDays(start, 1),
  };
};

const selectRange = (day: Date): { start: Date; end: Date } => {
  const start = new Date(day);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
  return { start, end };
};

const eventLabel = (event: CalendarEventData): string => (
  typeof event.title === 'string' && event.title.trim() ? event.title.trim() : 'Calendar entry'
);

export default function FacilityResourceCalendarMonthGrid({
  resources,
  events,
  calendarRangeStart,
  calendarRangeEnd,
  fieldEventsLoading,
  eventPropGetter,
  onSelectSlot,
  onSelectEvent,
  onEventDrop,
  onEventResize,
  renderEvent,
  canMoveEvent,
  canResizeEvent,
  slotPropGetter,
}: FacilityResourceCalendarMonthGridProps) {
  const isDataLoading = useOrganizationDataLoading(fieldEventsLoading);
  const days = monthDays(calendarRangeStart, calendarRangeEnd);
  const visibleEvents = events.filter((event) => resources.some((resource) => resource.id === event.resourceId));

  if (isDataLoading) {
    return (
      <div className="facility-resource-calendar__month-grid" role="grid" aria-busy="true">
        <CalendarLoadingRows resources={resources} />
      </div>
    );
  }

  if (!resources.length) {
    return (
      <div className="facility-resource-calendar__month-empty" role="status">
        No resources selected.
      </div>
    );
  }

  return (
    <div
      className="facility-resource-calendar__month-grid"
      role="grid"
      aria-label="Facility resource month calendar"
      style={{ '--facility-calendar-month-columns': 7 } as CSSProperties}
    >
      {days.map((day) => {
        const range = dayRange(day);
        const dayEvents = visibleEvents.filter((event) => entriesOverlapRange(event, range));
        const dayLabel = day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        const daySlotProps = slotPropGetter(day, undefined);
        const daySlotStyle = daySlotProps.style && typeof daySlotProps.style === 'object'
          ? daySlotProps.style as CSSProperties
          : {};
        return (
          <div
            key={day.toISOString()}
            className="facility-resource-calendar__month-cell"
            role="gridcell"
            style={daySlotStyle}
            aria-label={dayLabel}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const resource = resources[0];
              if (!resource) return;
              const selection = selectRange(day);
              onSelectSlot({ ...selection, resourceId: resource.id });
            }}
          >
            <div className="facility-resource-calendar__month-cell-header">
              <span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <time dateTime={day.toISOString().slice(0, 10)}>{day.getDate()}</time>
            </div>
            <div className="facility-resource-calendar__month-resource-list">
              {resources.map((resource) => {
                const resourceEvents = dayEvents.filter((event) => event.resourceId === resource.id);
                return (
                  <div
                    key={`${day.toISOString()}-${resource.id}`}
                    className="facility-resource-calendar__month-resource"
                    data-resource-id={resource.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      const selection = selectRange(day);
                      onSelectSlot({ ...selection, resourceId: resource.id });
                    }}
                  >
                    <span className="facility-resource-calendar__month-resource-label">{resource.label}</span>
                    <button
                      type="button"
                      className="facility-resource-calendar__month-add"
                      aria-label={`Add availability for ${resource.label} on ${dayLabel}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        const selection = selectRange(day);
                        onSelectSlot({ ...selection, resourceId: resource.id });
                      }}
                    >
                      Add
                    </button>
                    {resourceEvents.map((calendarEvent) => {
                      const props = eventPropGetter(calendarEvent);
                      const className = typeof props.className === 'string' ? props.className : '';
                      const style = props.style && typeof props.style === 'object'
                        ? props.style as CSSProperties
                        : {};
                      const label = eventLabel(calendarEvent);
                      const canMove = canMoveEvent(calendarEvent);
                      const canResize = canResizeEvent(calendarEvent);
                      return (
                        <div
                          key={`${calendarEvent.id}-${resource.id}`}
                          className={['facility-resource-calendar__month-event', className].filter(Boolean).join(' ')}
                          style={style}
                          data-calendar-event-id={calendarEvent.id}
                          data-resource-id={resource.id}
                        >
                          <button
                            type="button"
                            className="facility-resource-calendar__month-event-trigger"
                            aria-label={label}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectEvent(calendarEvent);
                            }}
                          >
                            {renderEvent(calendarEvent)}
                          </button>
                          <div className="facility-resource-calendar__month-event-actions">
                            {canMove ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEventDrop({
                                    event: calendarEvent,
                                    start: addDays(calendarEvent.start, 1),
                                    end: addDays(calendarEvent.end, 1),
                                    resourceId: resource.id,
                                  });
                                }}
                              >
                                Move to next day
                              </button>
                            ) : null}
                            {canResize ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEventResize({
                                    event: calendarEvent,
                                    start: calendarEvent.start,
                                    end: new Date(calendarEvent.end.getTime() + SLOT_DURATION_MINUTES * 60 * 1000),
                                    resourceId: resource.id,
                                  });
                                }}
                              >
                                Extend by 30 minutes
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
