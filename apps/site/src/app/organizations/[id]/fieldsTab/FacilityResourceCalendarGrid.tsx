"use client";

import { atLocalCalendarMinute, shiftLocalCalendarMinutes, localCalendarDurationMinutes, limitCalendarInteraction } from './facilityCalendarRangeLimits';

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { View } from 'react-big-calendar';
import { useOrganizationDataLoading } from '@/components/organization/OrganizationDataLoading';
import type { CalendarEventData } from './facilityCalendarTypes';
import CalendarLoadingRows from './CalendarLoadingRows';
import { calendarResourceRowAtPoint } from './facilityCalendarDropPoint';
import { facilityCalendarLanes } from './facilityCalendarLanes';

const LAYOUT_STEP_MINUTES = 30;
const TIME_LABEL_INTERVAL_MINUTES = 120;
const FALLBACK_TIMELINE_WIDTH = 1000;
const FALLBACK_RESOURCE_ROW_HEIGHT = 72;
const MIN_TIME_LABEL_WIDTH = 44;
const MAX_TIME_LABEL_WIDTH = 92;
const TIME_LABEL_ZOOM_STEP = 8;

export type FacilityResourceCalendarResource = {
  id: string;
  label: string;
};

type CalendarPoint = {
  start: Date;
  resourceId: string | null;
};

type ActiveEventInteraction = {
  eventId: string;
  mode: 'move' | 'resize-start' | 'resize-end';
  pointerId: number;
  startPoint: { clientX: number; clientY: number };
  currentPoint: { clientX: number; clientY: number };
  originalStart: Date;
  originalEnd: Date;
  originalResourceId: string;
  currentStart: Date;
  currentEnd: Date;
  currentResourceId: string;
  moved: boolean;
};

type FacilityResourceCalendarGridProps = {
  resources: FacilityResourceCalendarResource[];
  events: CalendarEventData[];
  calendarView: Extract<View, 'week' | 'month'>;
  calendarDate: Date;
  calendarRangeStart: Date;
  calendarRangeEnd: Date;
  minTime: Date;
  maxTime: Date;
  fieldEventsLoading: boolean;
  eventPropGetter: (event: CalendarEventData) => Record<string, unknown>;
  onViewChange: (view: Extract<View, 'week' | 'month'>) => void;
  onNavigateDate: (date: Date) => void;
  onSelectSlot: (slotInfo: {
    start: Date;
    end: Date;
    resourceId: string;
  }) => void;
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
  onSelectEvent: (event: CalendarEventData) => void;
  renderEvent: (event: CalendarEventData) => ReactNode;
  canMoveEvent: (event: CalendarEventData) => boolean;
  canResizeEvent: (event: CalendarEventData) => boolean;
  slotPropGetter: (date: Date, resourceId?: string) => Record<string, unknown>;
};

const toMinutes = (value: Date): number => (
  value.getHours() * 60
  + value.getMinutes()
  + value.getSeconds() / 60 + value.getMilliseconds() / 60000
);

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

const getNextTimeLabelWidth = (currentWidth: number, wheelDelta: number): number => {
  if (wheelDelta === 0) {
    return currentWidth;
  }
  const direction = wheelDelta < 0 ? 1 : -1;
  return clamp(
    currentWidth + direction * TIME_LABEL_ZOOM_STEP,
    MIN_TIME_LABEL_WIDTH,
    MAX_TIME_LABEL_WIDTH,
  );
};

const snapMinutes = (value: number): number => (
  Math.round(value / LAYOUT_STEP_MINUTES) * LAYOUT_STEP_MINUTES
);

const getDateRangeLabel = (days: Date[]): string => {
  if (!days.length) {
    return '';
  }
  if (days.length === 1) {
    return format(days[0], 'MMM d, yyyy');
  }
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const sameMonth = firstDay.getFullYear() === lastDay.getFullYear()
    && firstDay.getMonth() === lastDay.getMonth();
  return sameMonth
    ? `${format(firstDay, 'MMM d')}–${format(lastDay, 'd, yyyy')}`
    : `${format(firstDay, 'MMM d')}–${format(lastDay, 'MMM d, yyyy')}`;
};

const getTimeLabel = (day: Date, minutes: number): string => (
  format(atLocalCalendarMinute(day, minutes), 'h a')
);

const getEventLabel = (event: CalendarEventData): string => (
  typeof event.title === 'string' && event.title.trim().length > 0
    ? event.title.trim()
    : 'Calendar entry'
);

function visibleMinuteRange(eventMinutes: number[], configuredMin: number, configuredMax: number) {
  const earliest = eventMinutes.length ? Math.min(...eventMinutes) : configuredMin;
  const latest = eventMinutes.length ? Math.max(...eventMinutes) : configuredMax;
  const minMinutes = Math.max(0, Math.min(configuredMin, Math.floor(earliest / TIME_LABEL_INTERVAL_MINUTES) * TIME_LABEL_INTERVAL_MINUTES));
  const maxMinutes = Math.min(24 * 60, Math.max(minMinutes + LAYOUT_STEP_MINUTES, configuredMax, Math.ceil(latest / TIME_LABEL_INTERVAL_MINUTES) * TIME_LABEL_INTERVAL_MINUTES));
  return { minMinutes, maxMinutes };
}

function eventRangeKey(event: CalendarEventData) {
  const sourceId = (event.resource as { $id?: unknown } | null | undefined)?.$id;
  return typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : event.id;
}

function isStaffAssignmentEntry(event: CalendarEventData) {
  return event.metaType === 'facility-feed'
    && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
}

export default function FacilityResourceCalendarGrid({
  resources,
  events,
  calendarView,
  calendarDate,
  calendarRangeStart,
  calendarRangeEnd,
  minTime,
  maxTime,
  fieldEventsLoading,
  eventPropGetter,
  onViewChange,
  onNavigateDate,
  onSelectSlot,
  onEventDrop,
  onEventResize,
  onSelectEvent,
  renderEvent,
  canMoveEvent,
  canResizeEvent,
  slotPropGetter,
}: FacilityResourceCalendarGridProps) {
  const isDataLoading = useOrganizationDataLoading(fieldEventsLoading);
  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerOwnerRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const [activeInteraction, setActiveInteraction] = useState<ActiveEventInteraction | null>(null);
  const [timeLabelWidth, setTimeLabelWidth] = useState(MIN_TIME_LABEL_WIDTH);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
      setTimeLabelWidth((currentWidth) => getNextTimeLabelWidth(currentWidth, event.deltaY));
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  const days = useMemo(() => {
    const start = startOfDay(calendarRangeStart);
    const dayCount = calendarView === 'month'
      ? differenceInCalendarDays(startOfDay(calendarRangeEnd), start) + 1
      : 7;
    return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
  }, [calendarRangeEnd, calendarRangeStart, calendarView]);
  const configuredMinMinutes = toMinutes(minTime);
  const configuredMaxMinutes = Math.max(configuredMinMinutes + LAYOUT_STEP_MINUTES, toMinutes(maxTime));
  const eventTimesInRange = events
    .filter((event) => (
      resources.some((resource) => resource.id === event.resourceId)
      && event.end.getTime() > calendarRangeStart.getTime()
      && event.start.getTime() < addDays(startOfDay(calendarRangeEnd), 1).getTime()
    ))
    .flatMap((event) => event.start.toDateString() !== event.end.toDateString()
      ? [0, 1440] : [toMinutes(event.start), toMinutes(event.end)]);
  const { minMinutes, maxMinutes } = visibleMinuteRange(eventTimesInRange, configuredMinMinutes, configuredMaxMinutes);
  const daySpanMinutes = Math.max(LAYOUT_STEP_MINUTES, maxMinutes - minMinutes);
  const slotCountPerDay = Math.ceil(daySpanMinutes / TIME_LABEL_INTERVAL_MINUTES);
  const layoutSlotCountPerDay = Math.ceil(daySpanMinutes / LAYOUT_STEP_MINUTES);
  const totalTimelineMinutes = daySpanMinutes * days.length;
  const timelineMinWidth = days.length * slotCountPerDay * timeLabelWidth;
  const rangeEnd = startOfDay(calendarRangeEnd);

  const visibleEvents = useMemo(() => events.filter((event) => (
    resources.some((resource) => resource.id === event.resourceId)
    && event.end.getTime() > calendarRangeStart.getTime()
    && event.start.getTime() < new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000).getTime()
  )), [calendarRangeStart, events, rangeEnd, resources]);

  const eventsByResource = useMemo(() => {
    const grouped = new Map<string, CalendarEventData[]>();
    resources.forEach((resource) => grouped.set(resource.id, []));
    visibleEvents.forEach((event) => {
      const entries = grouped.get(event.resourceId);
      if (entries) {
        entries.push(event);
      }
    });
    return grouped;
  }, [resources, visibleEvents]);

  const lanesByResource = useMemo(() => new Map(
    [...eventsByResource].map(([resourceId, entries]) => [resourceId, facilityCalendarLanes(entries)]),
  ), [eventsByResource]);

  const gridStyle = {
    '--facility-calendar-day-count': days.length,
    '--facility-calendar-time-label-count': slotCountPerDay,
    '--facility-calendar-slots-per-day': layoutSlotCountPerDay,
  } as CSSProperties;

  const timelineGridStyle = {
    '--facility-calendar-time-label-width': `${timeLabelWidth}px`,
    '--facility-calendar-timeline-min-width': `${timelineMinWidth}px`,
  } as CSSProperties;

  const handleTimelineKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setTimeLabelWidth((currentWidth) => getNextTimeLabelWidth(currentWidth, -1));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      setTimeLabelWidth((currentWidth) => getNextTimeLabelWidth(currentWidth, 1));
    }
  };

  const getTimelineRect = (): { left: number; top: number; width: number; height: number } => {
    const rect = timelineRef.current?.getBoundingClientRect();
    return {
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
      width: rect?.width || FALLBACK_TIMELINE_WIDTH,
      height: rect?.height || Math.max(FALLBACK_RESOURCE_ROW_HEIGHT, resources.length * FALLBACK_RESOURCE_ROW_HEIGHT),
    };
  };

  const getResourceIdAtPoint = (clientY: number, fallbackResourceId: string | null = null): string | null => {
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-resource-row]') ?? []);
    const row = calendarResourceRowAtPoint(rows, clientY, getTimelineRect());
    return row?.dataset.resourceId ?? fallbackResourceId ?? resources[0]?.id ?? null;
  };

  const getCalendarPoint = (clientX: number, clientY: number, fallbackResourceId: string | null = null): CalendarPoint | null => {
    const timelineRect = getTimelineRect();
    if (!resources.length || clientX < timelineRect.left || clientX > timelineRect.left + timelineRect.width) {
      return null;
    }
    const xRatio = clamp((clientX - timelineRect.left) / timelineRect.width, 0, 0.999999);
    const rawAxisMinutes = xRatio * totalTimelineMinutes;
    const snappedAxisMinutes = clamp(
      snapMinutes(rawAxisMinutes),
      0,
      Math.max(0, totalTimelineMinutes - LAYOUT_STEP_MINUTES),
    );
    const dayIndex = Math.min(days.length - 1, Math.floor(snappedAxisMinutes / daySpanMinutes));
    const minutesInDay = minMinutes + (snappedAxisMinutes - (dayIndex * daySpanMinutes));
    const day = days[dayIndex] ?? days[0];
    if (!day) {
      return null;
    }
    return {
      start: atLocalCalendarMinute(day, minutesInDay),
      resourceId: getResourceIdAtPoint(clientY, fallbackResourceId),
    };
  };

  const getStartAtAxisMinutes = (axisMinutes: number, durationMinutes: number): Date => {
    const maxStartAxisMinutes = Math.max(0, totalTimelineMinutes - Math.max(0, durationMinutes));
    const normalizedAxisMinutes = clamp(axisMinutes, 0, maxStartAxisMinutes);
    const dayIndex = Math.min(days.length - 1, Math.floor(normalizedAxisMinutes / daySpanMinutes));
    const minutesInDay = minMinutes + (normalizedAxisMinutes - (dayIndex * daySpanMinutes));
    return atLocalCalendarMinute(days[dayIndex] ?? days[0], minutesInDay);
  };

  const getAxisMinutesForDate = (date: Date): number => {
    const firstDayStart = startOfDay(days[0] ?? calendarDate);
    const dayOffset = differenceInCalendarDays(date, firstDayStart) * daySpanMinutes;
    return dayOffset + (toMinutes(date) - minMinutes);
  };

  const getUnboundedInteractionRange = (interaction: ActiveEventInteraction, clientX: number, clientY: number) => {
    const timelineRect = getTimelineRect();
    const horizontalDeltaMinutes = snapMinutes(((clientX - interaction.startPoint.clientX) / timelineRect.width) * totalTimelineMinutes);
    const durationMinutes = differenceInCalendarDays(interaction.originalEnd, interaction.originalStart) * 1440
      + toMinutes(interaction.originalEnd) - toMinutes(interaction.originalStart);
    const originalAxisMinutes = getAxisMinutesForDate(interaction.originalStart);
    if (interaction.mode === 'resize-start') {
      const point = getCalendarPoint(clientX, clientY, interaction.originalResourceId);
      if (!point) {
        return null;
      }
      const originalEndAxisMinutes = getAxisMinutesForDate(interaction.originalEnd);
      const nextStartAxisMinutes = clamp(
        snapMinutes(getAxisMinutesForDate(point.start)),
        0,
        originalEndAxisMinutes - LAYOUT_STEP_MINUTES,
      );
      return {
        start: getStartAtAxisMinutes(nextStartAxisMinutes, 0),
        end: interaction.originalEnd,
        resourceId: interaction.originalResourceId,
      };
    }
    if (interaction.mode === 'resize-end') {
      const point = getCalendarPoint(clientX, clientY, interaction.originalResourceId);
      if (!point) {
        return null;
      }
      const nextEndAxisMinutes = clamp(
        snapMinutes(getAxisMinutesForDate(point.start)),
        originalAxisMinutes + LAYOUT_STEP_MINUTES,
        totalTimelineMinutes,
      );
      const nextEnd = getStartAtAxisMinutes(nextEndAxisMinutes, 0);
      return {
        start: interaction.originalStart,
        end: nextEnd.getTime() > interaction.originalStart.getTime()
          ? nextEnd
          : shiftLocalCalendarMinutes(interaction.originalStart, LAYOUT_STEP_MINUTES),
        resourceId: interaction.originalResourceId,
      };
    }
    const nextStart = getStartAtAxisMinutes(originalAxisMinutes + horizontalDeltaMinutes, durationMinutes);
    const point = getCalendarPoint(clientX, clientY, interaction.originalResourceId);
    const nextEnd = new Date(nextStart);
    nextEnd.setMinutes(nextEnd.getMinutes() + durationMinutes);
    return {
      start: nextStart,
      end: nextEnd,
      resourceId: point?.resourceId ?? interaction.originalResourceId,
    };
  };

  const getInteractionRange = (interaction: ActiveEventInteraction, clientX: number, clientY: number) => {
    const range = getUnboundedInteractionRange(interaction, clientX, clientY);
    if (!range) return null;
    const limited = limitCalendarInteraction(range.start, range.end, interaction.mode, minMinutes, maxMinutes);
    return limited ? { ...range, ...limited } : null;
  };

  const handleEventPointerDown = (
    event: CalendarEventData,
    mode: ActiveEventInteraction['mode'],
    pointerEvent: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const isAllowed = mode === 'move' ? canMoveEvent(event) : canResizeEvent(event);
    if (!isAllowed) {
      return;
    }
    if (pointerEvent.pointerType === 'mouse' && pointerEvent.button !== 0) {
      return;
    }
    const target = pointerEvent.target as Element | null;
    if (mode === 'move' && event.metaType === 'selection' && target?.closest('.shared-calendar-event__drag-handle')) {
      return;
    }
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const nextInteraction: ActiveEventInteraction = {
      eventId: event.id,
      mode,
      pointerId: pointerEvent.pointerId,
      startPoint: { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY },
      currentPoint: { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY },
      originalStart: new Date(event.start),
      originalEnd: new Date(event.end),
      originalResourceId: event.resourceId,
      currentStart: new Date(event.start),
      currentEnd: new Date(event.end),
      currentResourceId: event.resourceId,
      moved: false,
    };
    setActiveInteraction(nextInteraction);
    pointerOwnerRef.current = pointerEvent.currentTarget;
    try {
      pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    } catch {
      // Pointer capture can fail when another interaction already owns the pointer.
    }
  };

  const handleEventPointerMove = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeInteraction || activeInteraction.pointerId !== pointerEvent.pointerId) {
      return;
    }
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const range = getInteractionRange(activeInteraction, pointerEvent.clientX, pointerEvent.clientY);
    if (!range) {
      return;
    }
    setActiveInteraction((current) => current
      ? {
          ...current,
          currentStart: range.start,
          currentEnd: range.end,
          currentResourceId: range.resourceId,
          currentPoint: { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY },
          moved: current.moved
            || Math.abs(pointerEvent.clientX - current.startPoint.clientX) >= 4
            || Math.abs(pointerEvent.clientY - current.startPoint.clientY) >= 4,
        }
      : current);
  };

  const commitEventResize = (event: CalendarEventData, mode: 'resize-start' | 'resize-end', start: Date, end: Date) => {
    const range = limitCalendarInteraction(start, end, mode, minMinutes, maxMinutes);
    if (!range || (range.start.getTime() === event.start.getTime() && range.end.getTime() === event.end.getTime())) return;
    onEventResize({ event, ...range, resourceId: event.resourceId });
  };

  const finishEventInteraction = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = activeInteraction;
    if (!interaction || interaction.pointerId !== pointerEvent.pointerId) {
      return;
    }
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    try {
      pointerOwnerRef.current?.releasePointerCapture(pointerEvent.pointerId);
    } catch {
      // The pointer may already be released.
    }
    setActiveInteraction(null);
    pointerOwnerRef.current = null;
    suppressClickRef.current = interaction.moved || interaction.mode !== 'move';
    if (!interaction.moved) {
      return;
    }
    const event = events.find((candidate) => candidate.id === interaction.eventId);
    if (!event) {
      return;
    }
    if (interaction.mode !== 'move') {
      commitEventResize(event, interaction.mode, interaction.currentStart, interaction.currentEnd);
      return;
    }
    onEventDrop({
      event,
      start: interaction.currentStart,
      end: interaction.currentEnd,
      resourceId: interaction.currentResourceId,
    });
  };

  const handleEventPointerCancel = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeInteraction || activeInteraction.pointerId !== pointerEvent.pointerId) {
      return;
    }
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    suppressClickRef.current = true;
    pointerOwnerRef.current = null;
    setActiveInteraction(null);
  };

  const handleSlotClick = (event: ReactMouseEvent<HTMLDivElement>, resourceId: string, day: Date) => {
    const target = event.target as Element | null;
    if (target?.closest('.facility-resource-calendar__event')) {
      return;
    }
    const timelineRect = event.currentTarget.getBoundingClientRect();
    const trackWidth = timelineRect.width || FALLBACK_TIMELINE_WIDTH / Math.max(1, days.length);
    const xRatio = clamp((event.clientX - (timelineRect.left || 0)) / trackWidth, 0, 0.999999);
    const startMinutes = minMinutes + snapMinutes(xRatio * daySpanMinutes);
    const start = atLocalCalendarMinute(day, clamp(startMinutes, minMinutes, maxMinutes - LAYOUT_STEP_MINUTES));
    onSelectSlot({
      start,
      end: shiftLocalCalendarMinutes(start, LAYOUT_STEP_MINUTES),
      resourceId,
    });
  };

  const handleSlotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, resourceId: string, day: Date) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    const start = atLocalCalendarMinute(day, minMinutes);
    onSelectSlot({ start, end: shiftLocalCalendarMinutes(start, LAYOUT_STEP_MINUTES), resourceId });
  };

  const handleNavigate = (direction: -1 | 1) => {
    const nextDate = calendarView === 'month'
      ? addMonths(calendarDate, direction)
      : addDays(calendarDate, direction * 7);
    onNavigateDate(nextDate);
  };

  const handleViewChange = (view: Extract<View, 'week' | 'month'>) => {
    onViewChange(view);
  };

  const renderEventSegment = (event: CalendarEventData, dayIndex: number) => {
    const previewEvent = activeInteraction?.eventId === event.id && activeInteraction.mode !== 'move'
      ? { ...event, start: activeInteraction.currentStart, end: activeInteraction.currentEnd }
      : event;
    const day = days[dayIndex];
    if (!day) {
      return null;
    }
    const dayStart = atLocalCalendarMinute(day, minMinutes);
    const dayEnd = atLocalCalendarMinute(day, maxMinutes);
    const segmentStart = Math.max(previewEvent.start.getTime(), dayStart.getTime());
    const segmentEnd = Math.min(previewEvent.end.getTime(), dayEnd.getTime());
    if (segmentEnd <= segmentStart) {
      return null;
    }
    const left = (localCalendarDurationMinutes(dayStart, new Date(segmentStart)) / daySpanMinutes) * 100;
    const width = (localCalendarDurationMinutes(new Date(segmentStart), new Date(segmentEnd)) / daySpanMinutes) * 100;
    const dayOffset = dayIndex * 100;
    const eventLeft = (dayOffset + left) / days.length;
    const eventWidth = Math.max(0.8, width / days.length);
    const eventProps = eventPropGetter(event);
    const eventClassName = typeof eventProps.className === 'string' ? eventProps.className : '';
    const eventStyle = eventProps.style && typeof eventProps.style === 'object'
      ? eventProps.style as CSSProperties
      : {};
    const isActive = activeInteraction?.eventId === event.id;
    const canMove = canMoveEvent(event);
    const canResize = canResizeEvent(event);
    const eventLabel = getEventLabel(event);
    const eventTestId = eventRangeKey(event);
    const isStaffAssignment = isStaffAssignmentEntry(event);

    return (
      <div
        key={`${event.id}-${dayIndex}`}
        className={[
          'facility-resource-calendar__event',
          eventClassName,
          isActive ? 'facility-resource-calendar__event--active' : '',
        ].filter(Boolean).join(' ')}
        data-testid={`event-range-${eventTestId}`}
        data-calendar-event-id={event.id}
        data-resource-id={event.resourceId}
        style={{
          ...eventStyle,
          left: `${eventLeft}%`,
          width: `${eventWidth}%`,
          top: `${0.55 + (lanesByResource.get(event.resourceId)?.laneById.get(event.id) ?? 0) * 4.1}rem`,
        }}
        onPointerDown={(pointerEvent) => handleEventPointerDown(event, 'move', pointerEvent)}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          const isCapturedDraftClick = event.metaType === 'selection'
            && clickEvent.target === clickEvent.currentTarget;
          if (event.metaType === 'rental' || isCapturedDraftClick) {
            onSelectEvent(event);
          }
        }}
      >
        {renderEvent(previewEvent)}
        {canResize ? (
          <>
            <div
              className="facility-resource-calendar__resize-handle facility-resource-calendar__resize-handle--start"
              role="button"
              tabIndex={0}
              aria-label={`Adjust start of ${eventLabel}`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(pointerEvent) => {
                pointerEvent.stopPropagation();
                handleEventPointerDown(event, 'resize-start', pointerEvent);
              }}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                  keyEvent.preventDefault();
                  keyEvent.stopPropagation();
                  commitEventResize(event, 'resize-start', shiftLocalCalendarMinutes(event.start, -LAYOUT_STEP_MINUTES), event.end);
                }
              }}
            />
            <div
              className="facility-resource-calendar__resize-handle facility-resource-calendar__resize-handle--end"
              role="button"
              tabIndex={0}
              aria-label={`Adjust end of ${eventLabel}`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(pointerEvent) => {
                pointerEvent.stopPropagation();
                handleEventPointerDown(event, 'resize-end', pointerEvent);
              }}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                  keyEvent.preventDefault();
                  keyEvent.stopPropagation();
                  commitEventResize(event, 'resize-end', event.start, shiftLocalCalendarMinutes(event.end, LAYOUT_STEP_MINUTES));
                }
              }}
            />
          </>
        ) : null}
        <div className="sr-only">
          <button
            type="button"
            disabled={!canMove}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              const start = shiftLocalCalendarMinutes(event.start, event.metaType === 'selection' ? LAYOUT_STEP_MINUTES : 24 * 60);
              onEventDrop({
                event,
                start,
                end: shiftLocalCalendarMinutes(start, Math.max(LAYOUT_STEP_MINUTES, localCalendarDurationMinutes(event.start, event.end))),
                resourceId: event.resourceId,
              });
              if (isStaffAssignment) {
                onSelectEvent(event);
              }
            }}
          >
            Drag {eventLabel}
          </button>
          <button
            type="button"
            disabled={!canResize}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              commitEventResize(event, 'resize-end', event.start, shiftLocalCalendarMinutes(event.end, LAYOUT_STEP_MINUTES));
              if (isStaffAssignment) {
                onSelectEvent(event);
              }
            }}
          >
            Resize {eventLabel}
          </button>
          <button type="button" onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onSelectEvent(event);
          }}>
            Select {eventLabel}
          </button>
        </div>
        <span className="sr-only" aria-hidden="true">
          {event.start.toISOString()}|{event.end.toISOString()}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className="facility-resource-calendar"
      style={gridStyle}
      data-calendar-view={calendarView}
      data-calendar-min-minutes={minMinutes}
      data-calendar-max-minutes={maxMinutes}
      aria-label="Facility resource schedule"
      onPointerDownCapture={() => { suppressClickRef.current = false; }}
      onPointerMove={handleEventPointerMove}
      onPointerUp={finishEventInteraction}
      onPointerCancel={handleEventPointerCancel}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }
      }}
    >
      <div className="facility-resource-calendar__toolbar">
        <div className="facility-resource-calendar__toolbar-nav" role="group" aria-label="Calendar navigation">
          <button
            type="button"
            className="facility-resource-calendar__icon-button"
            aria-label={calendarView === 'month' ? 'Previous month' : 'Previous week'}
            title={calendarView === 'month' ? 'Previous month' : 'Previous week'}
            onClick={() => handleNavigate(-1)}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onNavigateDate(new Date())}>Today</button>
          <button
            type="button"
            className="facility-resource-calendar__icon-button"
            aria-label={calendarView === 'month' ? 'Next month' : 'Next Week'}
            title={calendarView === 'month' ? 'Next month' : 'Next Week'}
            onClick={() => handleNavigate(1)}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="facility-resource-calendar__range-label" aria-live="polite">
          {getDateRangeLabel(days)}
        </div>
        <div className="facility-resource-calendar__view-switch" role="group" aria-label="Calendar view">
          {(['week', 'month'] as const).map((view) => (
            <button
              key={view}
              type="button"
              className={calendarView === view ? 'is-active' : ''}
              aria-pressed={calendarView === view}
              onClick={() => handleViewChange(view)}
            >
              {view === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>
      <span data-testid="calendar-date" className="sr-only">{calendarDate.toISOString()}</span>
      <div
        ref={viewportRef}
        className="facility-resource-calendar__viewport"
        role="region"
        tabIndex={0}
        aria-label="Facility calendar timeline. Hold Control and scroll to zoom."
        onKeyDown={handleTimelineKeyDown}
      >
        <div
          className="facility-resource-calendar__grid"
          role="grid"
          style={timelineGridStyle}
        >
          <div className="facility-resource-calendar__header-row" role="row">
            <div className="facility-resource-calendar__resource-header" role="columnheader">Resource</div>
            <div className="facility-resource-calendar__timeline-header">
              <div className="facility-resource-calendar__day-header-row">
                {days.map((day) => (
                  <div key={day.toISOString()} className="facility-resource-calendar__day-header" role="columnheader">
                    {format(day, 'EEE d')}
                  </div>
                ))}
              </div>
              <div className="facility-resource-calendar__time-header-row">
                {days.map((day) => (
                  <div key={day.toISOString()} className="facility-resource-calendar__time-header-day">
                    {Array.from({ length: slotCountPerDay }, (_, slotIndex) => (
                      <span key={`${day.toISOString()}-${slotIndex}`}>
                        {getTimeLabel(day, minMinutes + slotIndex * TIME_LABEL_INTERVAL_MINUTES)}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="facility-resource-calendar__body" aria-busy={isDataLoading}>
            {isDataLoading ? <CalendarLoadingRows resources={resources} /> : resources.length ? resources.map((resource, resourceIndex) => (
              <div
                key={resource.id}
                className="facility-resource-calendar__resource-row"
                role="row"
                data-resource-row
                data-resource-id={resource.id}
                style={{
                  '--facility-calendar-resource-index': resourceIndex,
                  '--facility-calendar-row-height': `${(lanesByResource.get(resource.id)?.count ?? 1) * 4.1 + 0.6}rem`,
                } as CSSProperties}
              >
                <div className="facility-resource-calendar__resource-label" role="rowheader" title={resource.label}>
                  {resource.label}
                </div>
                <div
                  ref={resourceIndex === 0 ? timelineRef : undefined}
                  className="facility-resource-calendar__timeline-row"
                  data-calendar-timeline
                >
                  {days.map((day, dayIndex) => (
                    <div
                      key={day.toISOString()}
                      className="facility-resource-calendar__day-track rbc-day-slot"
                      data-day-index={dayIndex}
                      role="gridcell"
                      tabIndex={0}
                      aria-label={`${format(day, 'EEEE, MMMM d')} ${resource.label}`}
                      onClick={(event) => handleSlotClick(event, resource.id, day)}
                      onKeyDown={(event) => handleSlotKeyDown(event, resource.id, day)}
                    >
                      {Array.from({ length: layoutSlotCountPerDay }, (_, slotIndex) => {
                        const slotStart = atLocalCalendarMinute(day, minMinutes + slotIndex * LAYOUT_STEP_MINUTES);
                        const slotProps = slotPropGetter(slotStart, resource.id);
                        const slotStyle = slotProps.style && typeof slotProps.style === 'object'
                          ? slotProps.style as CSSProperties
                          : {};
                        return (
                          <span
                            key={`${day.toISOString()}-${slotIndex}`}
                            className="facility-resource-calendar__time-cell"
                            style={slotStyle}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </div>
                  ))}
                  {(eventsByResource.get(resource.id) ?? []).flatMap((event) => (
                    days.map((_, dayIndex) => renderEventSegment(event, dayIndex))
                  ))}
                </div>
              </div>
            )) : (
              <div className="facility-resource-calendar__empty-row" role="row">
                <span>No resources selected.</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {activeInteraction?.moved && activeInteraction.mode === 'move' ? (
        <div
          className="facility-calendar-create-drag-preview facility-calendar-event-drag-preview"
          data-testid="calendar-event-drag-preview"
          style={{
            left: activeInteraction.currentPoint.clientX,
            top: activeInteraction.currentPoint.clientY,
          }}
          aria-hidden="true"
        >
          {renderEvent({
            ...(events.find((event) => event.id === activeInteraction.eventId) as CalendarEventData),
            start: activeInteraction.currentStart,
            end: activeInteraction.currentEnd,
            resourceId: activeInteraction.currentResourceId,
          })}
        </div>
      ) : null}
    </div>
  );
}
