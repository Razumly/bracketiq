"use client";

import { format, startOfDay } from "date-fns";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  formatDisplayTime,
  getDateTimePartsInTimeZone,
  zonedTimeToUtcDate,
} from "@/lib/dateUtils";
import {
  eventCalendarDayLabel,
  type EventResourceCalendarEntry,
} from "../eventResourceCalendar";
import type { ResourceCalendarResource } from "@/components/calendar/resourceCalendarModel";

const DAY_MINUTES = 24 * 60;
const SLOT_STEP_MINUTES = 30;
export type EventResourceCalendarTimelineRange = {
  start: Date;
  end: Date;
  startInstant: Date;
  endInstant: Date;
  resourceId: string;
};

const DEFAULT_DURATION_MINUTES = 60;
const TIME_LABEL_INTERVAL_MINUTES = 240;
const TIME_AXIS_LABELS = [
  "12 AM",
  "4 AM",
  "8 AM",
  "12 PM",
  "4 PM",
  "8 PM",
] as const;

export type EventResourceCalendarTimelineSelection = {
  day: Date;
  startMinutes: number;
  resourceId: string;
};
type EventResourceCalendarWeekTimelineProps = {
  resources: ResourceCalendarResource[];
  days: Date[];
  entries: EventResourceCalendarEntry[];
  eventTimeZone?: string;
  resourceLabelSingular: string;
  defaultStartMinutes: number;
  readOnly: boolean;
  onCreateSelection: (selection: EventResourceCalendarTimelineSelection) => void;
  onSelectSlot: (slotIndex: number) => void;
  onMoveSlot?: (
    entry: EventResourceCalendarEntry,
    range: EventResourceCalendarTimelineRange,
  ) => void;
  onResizeSlot?: (
    entry: EventResourceCalendarEntry,
    range: EventResourceCalendarTimelineRange,
  ) => void;
};

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

const DAY_MS = 24 * 60 * 60 * 1000;
type CalendarWallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
const wallDayNumber = (parts: Pick<CalendarWallParts, "year" | "month" | "day">): number =>
  Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
const wallMinutesForParts = (parts: CalendarWallParts): number =>
  wallDayNumber(parts) * DAY_MINUTES
    + parts.hour * 60
    + parts.minute
    + parts.second / 60;
const wallPartsForDate = (date: Date): CalendarWallParts => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
  hour: date.getHours(),
  minute: date.getMinutes(),
  second: date.getSeconds(),
});
const wallPartsForEntry = (
  entry: EventResourceCalendarEntry,
  boundary: "start" | "end",
  timeZone: string,
): CalendarWallParts => {
  const instant = boundary === "start" ? entry.instantStart : entry.instantEnd;
  const parts = getDateTimePartsInTimeZone(instant, timeZone);
  return parts ?? wallPartsForDate(boundary === "start" ? entry.start : entry.end);
};
const wallMinutesForEntry = (
  entry: EventResourceCalendarEntry,
  boundary: "start" | "end",
  timeZone: string,
): number => wallMinutesForParts(wallPartsForEntry(entry, boundary, timeZone));
const wallRangeForEntry = (
  entry: EventResourceCalendarEntry,
  timeZone: string,
): { end: number; start: number } => {
  const start = wallMinutesForEntry(entry, "start", timeZone);
  const wallEnd = wallMinutesForEntry(entry, "end", timeZone);
  const instantDuration = Math.max(
    0,
    (entry.instantEnd.getTime() - entry.instantStart.getTime()) / 60_000,
  );
  return {
    end: wallEnd > start ? wallEnd : start + instantDuration,
    start,
  };
};
const wallMinutesForDay = (day: Date): number =>
  wallMinutesForParts({
    ...wallPartsForDate(day),
    hour: 0,
    minute: 0,
    second: 0,
  });
const resourceName = (
  resource: ResourceCalendarResource,
  singular: string,
): string => resource.label || singular;
const formatEntryTime = (
  entry: EventResourceCalendarEntry,
  timeZone: string,
): string => {
  const start = formatDisplayTime(entry.instantStart, { timeZone });
  const end = formatDisplayTime(entry.instantEnd, { timeZone });
  return start && end ? `${start}–${end}` : "Time unavailable";
};
const entryForDay = (
  entry: EventResourceCalendarEntry,
  day: Date,
  timeZone: string,
): { left: number; width: number } | null => {
  const dayStart = wallMinutesForDay(day);
  const dayEnd = dayStart + DAY_MINUTES;
  const entryRange = wallRangeForEntry(entry, timeZone);
  const entryStart = entryRange.start;
  const entryEnd = entryRange.end;
  if (entryEnd <= dayStart || entryStart >= dayEnd) {
    return null;
  }
  const startMinutes = clamp(
    Math.max(entryStart - dayStart, 0),
    0,
    DAY_MINUTES,
  );
  const endMinutes = clamp(
    Math.min(entryEnd - dayStart, DAY_MINUTES),
    0,
    DAY_MINUTES,
  );
  if (endMinutes <= startMinutes) {
    return null;
  }
  return {
    left: (startMinutes / DAY_MINUTES) * 100,
    width: Math.max(0.8, ((endMinutes - startMinutes) / DAY_MINUTES) * 100),
  };
};
type EntryLanes = {
  laneByEntryId: Map<string, number>;
  count: number;
};

const buildEntryLanes = (
  entries: EventResourceCalendarEntry[],
  timeZone: string,
): EntryLanes => {
  const lanes: EventResourceCalendarEntry[][] = [];
  const laneByEntryId = new Map<string, number>();
  entries.forEach((entry) => {
    const entryRange = wallRangeForEntry(entry, timeZone);
    const entryStart = entryRange.start;
    const entryEnd = entryRange.end;
    const laneIndex = lanes.findIndex((lane) => lane.every((candidate) => {
      const candidateRange = wallRangeForEntry(candidate, timeZone);
      return candidateRange.end <= entryStart || candidateRange.start >= entryEnd;
    }));
    const resolvedLaneIndex = laneIndex >= 0 ? laneIndex : lanes.length;
    if (!lanes[resolvedLaneIndex]) {
      lanes[resolvedLaneIndex] = [];
    }
    lanes[resolvedLaneIndex].push(entry);
    laneByEntryId.set(entry.id, resolvedLaneIndex);
  });
  return { laneByEntryId, count: Math.max(1, lanes.length) };
};
type ActiveEntryInteraction = {
  entry: EventResourceCalendarEntry;
  mode: "move" | "resize-start" | "resize-end";
  pointerId: number;
  startPoint: { clientX: number; clientY: number };
  originalStart: Date;
  originalEnd: Date;
  originalResourceId: string;
  currentStart: Date;
  currentEnd: Date;
  currentStartInstant: Date;
  currentEndInstant: Date;
  currentResourceId: string;
  moved: boolean;
  grabOffsetMinutes: number;
};

type TimelinePoint = {
  axisMinutes: number;
  start: Date;
  startInstant: Date;
  resourceId: string;
};


const startMinutesFromPointer = (
  event: MouseEvent<HTMLDivElement>,
  defaultStartMinutes: number,
): number => {
  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect.width) {
    return clamp(defaultStartMinutes, 0, DAY_MINUTES - DEFAULT_DURATION_MINUTES);
  }
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const snapped = Math.round((ratio * DAY_MINUTES) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  return clamp(snapped, 0, DAY_MINUTES - DEFAULT_DURATION_MINUTES);
};

const startMinutesFromKeyboard = (defaultStartMinutes: number): number => (
  clamp(
    Math.round(defaultStartMinutes / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES,
    0,
    DAY_MINUTES - DEFAULT_DURATION_MINUTES,
  )
);
const readTimelineAxisRect = (
  grid: HTMLElement | null,
): { left: number; width: number } => {
  if (!grid) {
    return { left: 0, width: 1000 };
  }
  const gridRect = grid.getBoundingClientRect();
  if (!gridRect) {
    return { left: 0, width: 1000 };
  }
  const axisRect = grid.querySelector<HTMLElement>(
    ".event-resource-calendar__timeline-header",
  )?.getBoundingClientRect();
  if (axisRect && axisRect.width > 0) {
    return { left: axisRect.left, width: axisRect.width };
  }
  const resourceWidth =
    grid
      .querySelector<HTMLElement>(".event-resource-calendar__resource-header")
      ?.getBoundingClientRect().width ?? 0;
  const width = gridRect.width - resourceWidth;
  return {
    left: gridRect.left + resourceWidth,
    width: width > 0 ? width : gridRect.width > 0 ? gridRect.width : 1000,
  };
};


export const EventResourceCalendarWeekTimeline = ({
  resources,
  days,
  entries,
  eventTimeZone,
  resourceLabelSingular,
  defaultStartMinutes,
  readOnly,
  onCreateSelection,
  onSelectSlot,
  onMoveSlot,
  onResizeSlot,
}: EventResourceCalendarWeekTimelineProps) => {
  const timelineGridRef = useRef<HTMLDivElement>(null);
  const pointerOwnerRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);
  const [activeInteraction, setActiveInteraction] =
    useState<ActiveEntryInteraction | null>(null);
  const calendarTimeZone = eventTimeZone || entries[0]?.timeZone || "UTC";
  const entriesByResource = useMemo(() => {
    const grouped = new Map<string, EventResourceCalendarEntry[]>();
    resources.forEach((resource) => grouped.set(resource.id, []));
    entries.forEach((entry) => {
      const resourceEntries = grouped.get(entry.resourceId);
      if (resourceEntries) {
        resourceEntries.push(entry);
      }
    });
    return grouped;
  }, [entries, resources]);
  const lanesByResource = useMemo(() => {
    const grouped = new Map<string, EntryLanes>();
    entriesByResource.forEach((resourceEntries, resourceId) => {
      grouped.set(resourceId, buildEntryLanes(resourceEntries, calendarTimeZone));
    });
    return grouped;
  }, [calendarTimeZone, entriesByResource]);

  const timelineStyle = {
    "--event-calendar-day-count": days.length,
  } as CSSProperties;
  const totalTimelineMinutes = Math.max(DAY_MINUTES, days.length * DAY_MINUTES);
  const firstDay = days[0] ?? new Date();
  const firstDayWallMinutes = wallMinutesForDay(firstDay);
  const dateAtAxisMinutes = (axisMinutes: number): Date => {
    const date = startOfDay(firstDay);
    date.setMinutes(Math.round(axisMinutes));
    return date;
  };
  const calendarDateTimeAtAxisMinutes = (axisMinutes: number): string => {
    const roundedMinutes = Math.max(0, Math.round(axisMinutes));
    const day = new Date(Date.UTC(
      firstDay.getFullYear(),
      firstDay.getMonth(),
      firstDay.getDate() + Math.floor(roundedMinutes / DAY_MINUTES),
    ));
    const minutes = roundedMinutes % DAY_MINUTES;
    const hours = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  };
  const instantAtAxisMinutes = (axisMinutes: number): Date =>
    zonedTimeToUtcDate(
      calendarDateTimeAtAxisMinutes(axisMinutes),
      calendarTimeZone,
    ) ?? dateAtAxisMinutes(axisMinutes);
  const axisMinutesForEntry = (
    entry: EventResourceCalendarEntry,
    boundary: "start" | "end",
  ): number => {
    const range = wallRangeForEntry(entry, calendarTimeZone);
    return clamp(
      range[boundary] - firstDayWallMinutes,
      0,
      totalTimelineMinutes,
    );
  };
  const resourceIdAtPoint = (
    clientX: number,
    clientY: number,
    fallbackResourceId: string,
  ): string => {
    if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") {
      return fallbackResourceId;
    }
    const resourceId = document
      .elementsFromPoint(clientX, clientY)
      .map((element) =>
        element.closest("[data-resource-id]")?.getAttribute("data-resource-id"))
      .find((value): value is string => Boolean(value));
    return resourceId ?? fallbackResourceId;
  };
  const timelinePointAt = (
    clientX: number,
    clientY: number,
    fallbackResourceId: string,
  ): TimelinePoint | null => {
    const axisRect = readTimelineAxisRect(timelineGridRef.current);
    const ratio = clamp(
      (clientX - axisRect.left) / axisRect.width,
      0,
      1,
    );
    const axisMinutes = clamp(
      Math.round((ratio * totalTimelineMinutes) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES,
      0,
      totalTimelineMinutes,
    );
    return {
      axisMinutes,
      start: dateAtAxisMinutes(axisMinutes),
      startInstant: instantAtAxisMinutes(axisMinutes),
      resourceId: resourceIdAtPoint(clientX, clientY, fallbackResourceId),
    };
  };
  const rangeAtAxisMinutes = (
    startAxis: number,
    endAxis: number,
    resourceId: string,
  ): EventResourceCalendarTimelineRange => ({
    start: dateAtAxisMinutes(startAxis),
    end: dateAtAxisMinutes(endAxis),
    startInstant: instantAtAxisMinutes(startAxis),
    endInstant: instantAtAxisMinutes(endAxis),
    resourceId,
  });
  const interactionRangeAt = (
    interaction: ActiveEntryInteraction,
    clientX: number,
    clientY: number,
  ): EventResourceCalendarTimelineRange | null => {
    const point = timelinePointAt(
      clientX,
      clientY,
      interaction.originalResourceId,
    );
    if (!point) return null;
    const originalStartAxis = axisMinutesForEntry(interaction.entry, "start");
    const originalEndAxis = axisMinutesForEntry(interaction.entry, "end");
    if (interaction.mode === "resize-start") {
      const range = rangeAtAxisMinutes(
        clamp(point.axisMinutes, 0, originalEndAxis - SLOT_STEP_MINUTES),
        originalEndAxis,
        interaction.originalResourceId,
      );
      return {
        ...range,
        end: interaction.originalEnd,
        endInstant: new Date(interaction.entry.instantEnd),
      };
    }
    if (interaction.mode === "resize-end") {
      const range = rangeAtAxisMinutes(
        originalStartAxis,
        clamp(point.axisMinutes, originalStartAxis + SLOT_STEP_MINUTES, totalTimelineMinutes),
        interaction.originalResourceId,
      );
      return {
        ...range,
        start: interaction.originalStart,
        startInstant: new Date(interaction.entry.instantStart),
      };
    }
    const entryRange = wallRangeForEntry(interaction.entry, calendarTimeZone);
    const durationMinutes = Math.max(
      SLOT_STEP_MINUTES,
      Math.round(entryRange.end - entryRange.start),
    );
    const startAxis = clamp(
      point.axisMinutes + interaction.grabOffsetMinutes,
      0,
      Math.max(0, totalTimelineMinutes - durationMinutes),
    );
    return rangeAtAxisMinutes(
      startAxis,
      startAxis + durationMinutes,
      point.resourceId,
    );
  };
  const handleEntryPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    entry: EventResourceCalendarEntry,
    mode: ActiveEntryInteraction["mode"],
  ) => {
    const canInteract = mode === "move" ? onMoveSlot : onResizeSlot;
    if (readOnly || !canInteract) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const initialPoint = timelinePointAt(
      event.clientX,
      event.clientY,
      entry.resourceId,
    );
    const originalStartAxis = axisMinutesForEntry(entry, "start");
    const owner = event.currentTarget;
    const interaction: ActiveEntryInteraction = {
      entry,
      mode,
      pointerId: event.pointerId,
      startPoint: { clientX: event.clientX, clientY: event.clientY },
      originalStart: new Date(entry.start),
      originalEnd: new Date(entry.end),
      originalResourceId: entry.resourceId,
      grabOffsetMinutes:
        mode === "move" && initialPoint
          ? originalStartAxis - initialPoint.axisMinutes
          : 0,
      currentStart: new Date(entry.start),
      currentEnd: new Date(entry.end),
      currentStartInstant: new Date(entry.instantStart),
      currentEndInstant: new Date(entry.instantEnd),
      currentResourceId: entry.resourceId,
      moved: false,
    };
    pointerOwnerRef.current = owner;
    setActiveInteraction(interaction);
    try {
      owner.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail when another interaction owns the pointer.
    }
  };
  const handleEntryPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeInteraction || activeInteraction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const range = interactionRangeAt(activeInteraction, event.clientX, event.clientY);
    if (!range) return;
    setActiveInteraction((current) => current
      ? {
          ...current,
          currentStart: range.start,
          currentEnd: range.end,
          currentStartInstant: range.startInstant,
          currentEndInstant: range.endInstant,
          currentResourceId: range.resourceId,
          moved: current.moved
            || Math.abs(event.clientX - current.startPoint.clientX) >= 4
            || Math.abs(event.clientY - current.startPoint.clientY) >= 4,
        }
      : current);
  };
  const finishEntryInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = activeInteraction;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      pointerOwnerRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released.
    }
    pointerOwnerRef.current = null;
    setActiveInteraction(null);
    suppressClickRef.current = interaction.moved || interaction.mode !== "move";
    if (!interaction.moved) return;
    const range = {
      start: interaction.currentStart,
      end: interaction.currentEnd,
      startInstant: interaction.currentStartInstant,
      endInstant: interaction.currentEndInstant,
      resourceId: interaction.currentResourceId,
    };
    if (interaction.mode === "move") {
      onMoveSlot?.(interaction.entry, range);
    } else {
      onResizeSlot?.(interaction.entry, range);
    }
  };
  const cancelEntryInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeInteraction || activeInteraction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    pointerOwnerRef.current = null;
    setActiveInteraction(null);
    suppressClickRef.current = true;
  };
  const selectEntry = (entry: EventResourceCalendarEntry) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelectSlot(entry.slotIndex);
  };
  const adjustEntryWithKeyboard = (
    entry: EventResourceCalendarEntry,
    mode: "resize-start" | "resize-end",
  ) => {
    if (readOnly || !onResizeSlot) return;
    const step = SLOT_STEP_MINUTES;
    const startAxis = axisMinutesForEntry(entry, "start");
    const endAxis = axisMinutesForEntry(entry, "end");
    const range = mode === "resize-start"
      ? {
          ...rangeAtAxisMinutes(
            Math.max(0, startAxis - step),
            endAxis,
            entry.resourceId,
          ),
          end: entry.end,
          endInstant: new Date(entry.instantEnd),
        }
      : {
          ...rangeAtAxisMinutes(
            startAxis,
            Math.min(totalTimelineMinutes, endAxis + step),
            entry.resourceId,
          ),
          start: entry.start,
          startInstant: new Date(entry.instantStart),
        };
    if (range.endInstant.getTime() > range.startInstant.getTime()) {
      onResizeSlot(entry, range);
    }
  };

  const selectCell = (
    day: Date,
    resourceId: string,
    startMinutes: number,
  ) => {
    if (readOnly) return;
    onCreateSelection({
      day,
      resourceId,
      startMinutes: startMinutesFromKeyboard(startMinutes),
    });
  };

  const handleTrackClick = (
    event: MouseEvent<HTMLDivElement>,
    day: Date,
    resourceId: string,
  ) => {
    if (readOnly || (event.target as Element | null)?.closest("button")) {
      return;
    }
    onCreateSelection({
      day,
      resourceId,
      startMinutes: startMinutesFromPointer(event, defaultStartMinutes),
    });
  };

  const handleTrackKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    day: Date,
    resourceId: string,
  ) => {
    if (readOnly || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    selectCell(day, resourceId, defaultStartMinutes);
  };

  return (
    <div
      className="event-resource-calendar__timeline-viewport"
      role="region"
      aria-label="Weekly Resource timeline"
      onPointerMove={handleEntryPointerMove}
      onPointerUp={finishEntryInteraction}
      onPointerCancel={cancelEntryInteraction}
    >
      <div
        ref={timelineGridRef}
        className="event-resource-calendar__timeline-grid"
        role="grid"
        style={timelineStyle}
        aria-label="Weekly Resource timeline"
        data-calendar-grid
      >
      <div className="event-resource-calendar__timeline-header-row" role="row">
        <div className="event-resource-calendar__resource-header" role="columnheader">
          {resourceLabelSingular}
        </div>
        <div className="event-resource-calendar__timeline-header" role="columnheader">
          <div className="event-resource-calendar__timeline-day-header-row">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="event-resource-calendar__timeline-day-header"
              >
                {eventCalendarDayLabel(day)}
              </div>
            ))}
          </div>
          <div
            className="event-resource-calendar__timeline-time-header-row"
            aria-hidden="true"
          >
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="event-resource-calendar__timeline-time-header-day"
              >
                {Array.from(
                  { length: DAY_MINUTES / TIME_LABEL_INTERVAL_MINUTES },
                  (_, index) => (
                    <span key={`${day.toISOString()}-${index}`}>
                      {TIME_AXIS_LABELS[index]}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="event-resource-calendar__timeline-body">
        {resources.map((resource) => {
          const resourceEntries = entriesByResource.get(resource.id) ?? [];
          const entryLanes = lanesByResource.get(resource.id) ?? {
            laneByEntryId: new Map<string, number>(),
            count: 1,
          };
          const label = resourceName(resource, resourceLabelSingular);
          return (
            <div
              key={resource.id}
              className="event-resource-calendar__timeline-resource-row"
              role="row"
              data-resource-id={resource.id}
            >
              <div
                className="event-resource-calendar__resource-label"
                role="rowheader"
                title={label}
              >
                {label}
              </div>
              <div
                className="event-resource-calendar__timeline-row"
                style={{
                  "--event-calendar-row-height": `${Math.max(7, entryLanes.count * 3.1 + 1)}rem`,
                } as CSSProperties}
              >
                {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="event-resource-calendar__timeline-day-track"
                    role="gridcell"
                    tabIndex={readOnly ? -1 : 0}
                    aria-label={`${label} on ${format(day, "EEEE, MMMM d")}`}
                    onClick={(event) => handleTrackClick(event, day, resource.id)}
                    onKeyDown={(event) => handleTrackKeyDown(event, day, resource.id)}
                  >
                    <button
                      type="button"
                      className="event-resource-calendar__timeline-add"
                      disabled={readOnly}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectCell(day, resource.id, defaultStartMinutes);
                      }}
                    >
                      Add
                    </button>
                  </div>
                ))}
                <div className="event-resource-calendar__timeline-entries">
                  {resourceEntries.flatMap((entry) => days.map((day, dayIndex) => {
                    const renderedEntry = activeInteraction?.entry.id === entry.id
                      ? {
                          ...entry,
                          start: activeInteraction.currentStart,
                          end: activeInteraction.currentEnd,
                          instantStart: activeInteraction.currentStartInstant,
                          instantEnd: activeInteraction.currentEndInstant,
                        }
                      : entry;
                    const segment = entryForDay(renderedEntry, day, calendarTimeZone);
                    if (!segment) return [];
                    const dayWidth = 100 / days.length;
                    const eventStart =
                      dayIndex * dayWidth + (segment.left / 100) * dayWidth;
                    const eventWidth = (segment.width / 100) * dayWidth;
                    const lane = entryLanes.laneByEntryId.get(entry.id) ?? 0;
                    const labelText = `${label}, ${format(day, "EEEE, MMMM d")}: ${formatEntryTime(renderedEntry, calendarTimeZone)}. Select to edit Time Slot ${entry.slotIndex + 1}`;
                    return [
                      <div
                        key={`${entry.id}-${dayIndex}`}
                        className="event-resource-calendar__entry event-resource-calendar__timeline-entry"
                        style={{
                          left: `${eventStart}%`,
                          top: `${0.45 + lane * 3.1}rem`,
                          width: `${Math.max(0.8, eventWidth)}%`,
                        }}
                        data-slot-index={entry.slotIndex}
                        data-resource-id={entry.resourceId}
                        role="button"
                        tabIndex={readOnly ? -1 : 0}
                        aria-label={labelText}
                        onPointerDown={(event) =>
                          handleEntryPointerDown(event, entry, "move")}
                        onClick={() => selectEntry(entry)}
                        onKeyDown={(event) => {
                          if (
                            event.target !== event.currentTarget ||
                            (event.key !== "Enter" && event.key !== " ")
                          ) {
                            return;
                          }
                          event.preventDefault();
                          selectEntry(entry);
                        }}
                      >
                        {onResizeSlot ? (
                          <>
                            <button
                              type="button"
                              className="event-resource-calendar__timeline-resize-handle event-resource-calendar__timeline-resize-handle--start"
                              aria-label={`Adjust start of Time Slot ${entry.slotIndex + 1}`}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                handleEntryPointerDown(event, entry, "resize-start");
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                  return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                adjustEntryWithKeyboard(entry, "resize-start");
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (suppressClickRef.current) {
                                  suppressClickRef.current = false;
                                  return;
                                }
                                adjustEntryWithKeyboard(entry, "resize-start");
                              }}
                            />
                            <button
                              type="button"
                              className="event-resource-calendar__timeline-resize-handle event-resource-calendar__timeline-resize-handle--end"
                              aria-label={`Adjust end of Time Slot ${entry.slotIndex + 1}`}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                handleEntryPointerDown(event, entry, "resize-end");
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                  return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                adjustEntryWithKeyboard(entry, "resize-end");
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (suppressClickRef.current) {
                                  suppressClickRef.current = false;
                                  return;
                                }
                                adjustEntryWithKeyboard(entry, "resize-end");
                              }}
                            />
                          </>
                        ) : null}
                        <span>
                          {entry.repeating
                            ? "Repeating Time Slot"
                            : "One-Time Time Slot"}
                        </span>
                        <small>{formatEntryTime(renderedEntry, calendarTimeZone)}</small>
                      </div>,
                    ];
                  }))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
};

export default EventResourceCalendarWeekTimeline;
