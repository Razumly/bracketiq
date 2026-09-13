"use client";

import { format } from "date-fns";

import { Button, Popover } from "@/components/organization/organization-operation-ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type { Field } from "@/types";
import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";
import {
  calendarDayKey,
  entriesForCalendarDay,
  formatCalendarRangeLabel,
  getResourceCalendarMonthDays,
  getResourceCalendarRange,
  getResourceCalendarWeekDays,
  nextResourceCalendarDate,
  type ResourceCalendarResource,
} from "@/components/calendar/resourceCalendarModel";
import FieldCalendarFilter, {
  type FieldCalendarFilterItem,
} from "@/components/calendar/FieldCalendarFilter";
import {
  formatDisplayDateTime,
  formatDisplayTime,
  getDateTimePartsInTimeZone,
  instantToCalendarDateInTimeZone,
  parseDateTimeInTimeZone,
} from "@/lib/dateUtils";
import {
  buildEventCalendarResources,
  buildEventResourceCalendar,
  type EventResourceCalendarEntry,
  type InvalidEventCalendarSlot,
} from "../eventResourceCalendar";
import EventResourceCalendarWeekTimeline, {
  type EventResourceCalendarTimelineRange,
  type EventResourceCalendarTimelineSelection,
} from "./EventResourceCalendarWeekTimeline";

export type EventCalendarSlotSelection = {
  start: Date;
  end: Date;
  resourceId: string;
};

type EventResourceCalendarProps = {
  eventType: string;
  slots: LeagueSlotForm[];
  fields: Field[];
  eventStart?: string | null;
  eventEnd?: string | null;
  eventTimeZone?: string | null;
  resourceLabelSingular?: string;
  resourceLabelPlural?: string;
  showBoundaryOnlyRange?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  onCreateSelection: (selection: EventCalendarSlotSelection) => void;
  onSelectSlot: (slotIndex: number) => void;
  onAssignResource: (slotIndex: number, resourceId: string) => void;
  onDeleteSlot: (slotIndex: number) => void;
  onMoveSlot?: (
    entry: EventResourceCalendarEntry,
    range: EventResourceCalendarTimelineRange,
  ) => void;
  onResizeSlot?: (
    entry: EventResourceCalendarEntry,
    range: EventResourceCalendarTimelineRange,
  ) => void;
  header?: ReactNode;
};

const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_DURATION_MINUTES = 60;

const boundaryOnlyResource: ResourceCalendarResource = {
  id: "boundary-only",
  label: "Event boundary",
};
const calendarDateTimeAtMinutes = (day: Date, minutes: number): string => {
  const date = new Date(Date.UTC(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  ));
  return date.toISOString().slice(0, 19);
};

const formatEntryTime = (
  entry: EventResourceCalendarEntry,
  timeZone: string,
): string => {
  const start = formatDisplayTime(entry.instantStart, { timeZone });
  const end = formatDisplayTime(entry.instantEnd, { timeZone });
  return start && end ? `${start}–${end}` : "Time unavailable";
};

const resourceLabel = (
  resource: ResourceCalendarResource,
  singular: string,
): string => resource.label || singular;

const entryForResourceAndDay = (
  entries: EventResourceCalendarEntry[],
  day: Date,
  resourceId: string,
): EventResourceCalendarEntry[] =>
  (entriesForCalendarDay(entries, day) as EventResourceCalendarEntry[]).filter(
    (entry) => entry.resourceId === resourceId,
  );

const InvalidSlotRecovery = ({
  invalidSlots,
  resources,
  singular,
  readOnly,
  onAssignResource,
  onDeleteSlot,
}: {
  invalidSlots: InvalidEventCalendarSlot[];
  resources: ResourceCalendarResource[];
  singular: string;
  readOnly: boolean;
  onAssignResource: (slotIndex: number, resourceId: string) => void;
  onDeleteSlot: (slotIndex: number) => void;
}) => {
  if (!invalidSlots.length) return null;
  return (
    <div className="event-resource-calendar__invalid" role="alert">
      <strong>Time Slot needs attention</strong>
      {invalidSlots.map((invalid) => {
        const assignmentResource = resources.find(
          (resource) => !invalid.resourceIds.includes(resource.id),
        );
        return (
          <div
            key={`${invalid.slotKey}-${invalid.slotIndex}`}
            className="event-resource-calendar__invalid-row"
          >
            <div>
              <strong>Time Slot {invalid.slotIndex + 1}</strong>
              <p>{invalid.reason}</p>
            </div>
            <div className="event-resource-calendar__invalid-actions">
              {assignmentResource ? (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    onAssignResource(invalid.slotIndex, assignmentResource.id)
                  }
                >
                  Assign {singular}
                </button>
              ) : null}
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onDeleteSlot(invalid.slotIndex)}
              >
                Delete Time Slot
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const EventResourceCalendar = ({
  eventType,
  slots,
  fields,
  eventStart,
  eventEnd,
  eventTimeZone,
  resourceLabelSingular = "Resource",
  resourceLabelPlural = "Resources",
  loading = false,
  showBoundaryOnlyRange = false,
  readOnly = false,
  onCreateSelection,
  onSelectSlot,
  onAssignResource,
  onDeleteSlot,
  onMoveSlot,
  onResizeSlot,
  header,
}: EventResourceCalendarProps) => {
  const [view, setView] = useState<"week" | "month">("week");
  const [calendarDate, setCalendarDate] = useState(() => {
    const timeZone = eventTimeZone || "UTC";
    const parsed = parseDateTimeInTimeZone(eventStart, timeZone);
    return parsed
      ? instantToCalendarDateInTimeZone(parsed, timeZone) ?? new Date(parsed)
      : instantToCalendarDateInTimeZone(new Date(), timeZone) ?? new Date();
  });
  const resources = useMemo(
    () => buildEventCalendarResources(fields, resourceLabelSingular),
    [fields, resourceLabelSingular],
  );
  const [visibleResourceIds, setVisibleResourceIds] = useState<string[]>([]);
  const resourceIds = useMemo(
    () => resources.map((resource) => resource.id),
    [resources],
  );
  const resourceFilterItems = useMemo<FieldCalendarFilterItem[]>(
    () => resources.map((resource) => ({
      id: resource.id,
      label: resource.label || resourceLabelSingular,
      detail: resource.facilityName || null,
      colorSeed: resource.id,
      colorMatchKey: resource.id,
    })),
    [resourceLabelSingular, resources],
  );
  const selectedResourceIds = useMemo(() => {
    const validSelectedIds = visibleResourceIds.filter((resourceId) =>
      resourceIds.includes(resourceId),
    );
    return validSelectedIds.length ? validSelectedIds : resourceIds;
  }, [resourceIds, visibleResourceIds]);
  const resourceIndependentBoundary = showBoundaryOnlyRange && resources.length === 0;
  const calendarResources = resourceIndependentBoundary
    ? [boundaryOnlyResource]
    : resources;
  const visibleResources = view === "month"
    ? resourceIndependentBoundary
      ? calendarResources
      : resources.filter((resource) => selectedResourceIds.includes(resource.id))
    : calendarResources;
  const range = useMemo(
    () => getResourceCalendarRange(view, calendarDate),
    [calendarDate, view],
  );
  const days = useMemo(
    () =>
      view === "month"
        ? getResourceCalendarMonthDays(calendarDate)
        : getResourceCalendarWeekDays(calendarDate),
    [calendarDate, view],
  );
  const calendar = useMemo(
    () =>
      buildEventResourceCalendar({
        slots,
        fields,
        eventStart,
        eventEnd,
        eventTimeZone,
        range,
      }),
    [eventEnd, eventStart, eventTimeZone, fields, range, slots],
  );
  const eventStartParts = useMemo(() => {
    const timeZone = eventTimeZone || "UTC";
    const parsed = parseDateTimeInTimeZone(eventStart, timeZone);
    return parsed ? getDateTimePartsInTimeZone(parsed, timeZone) : null;
  }, [eventStart, eventTimeZone]);
  const defaultStartMinutes = eventStartParts
    ? eventStartParts.hour * 60 + eventStartParts.minute
    : DEFAULT_START_MINUTES;
  const boundaryOnlyRange = useMemo(() => {
    if (!showBoundaryOnlyRange) {
      return null;
    }
    const timeZone = eventTimeZone || "UTC";
    const start = parseDateTimeInTimeZone(eventStart, timeZone);
    const end = parseDateTimeInTimeZone(eventEnd, timeZone);
    return start && end && end.getTime() > start.getTime()
      ? { start, end, timeZone }
      : null;
  }, [eventEnd, eventStart, eventTimeZone, showBoundaryOnlyRange]);

  const handleCellSelection = (
    day: Date,
    resourceId: string,
    startMinutes = defaultStartMinutes,
  ) => {
    if (readOnly || loading) return;
    const timeZone = eventTimeZone || "UTC";
    const normalizedStartMinutes = Math.min(
      24 * 60 - DEFAULT_DURATION_MINUTES,
      Math.max(0, startMinutes),
    );
    const localStart = calendarDateTimeAtMinutes(day, normalizedStartMinutes);
    const localEnd = calendarDateTimeAtMinutes(
      day,
      Math.min(24 * 60, normalizedStartMinutes + DEFAULT_DURATION_MINUTES),
    );
    const start = parseDateTimeInTimeZone(localStart, timeZone)
      ?? new Date(`${localStart}Z`);
    const end = parseDateTimeInTimeZone(localEnd, timeZone)
      ?? new Date(`${localEnd}Z`);
    onCreateSelection({
      start,
      end,
      resourceId: resourceIndependentBoundary ? "" : resourceId,
    });
  };

  const handleTimelineSelection = (
    selection: EventResourceCalendarTimelineSelection,
  ) => {
    handleCellSelection(selection.day, selection.resourceId, selection.startMinutes);
  };

  const handleNavigate = (direction: -1 | 1) => {
    setCalendarDate(nextResourceCalendarDate(view, calendarDate, direction));
  };

  const renderEntry = (entry: EventResourceCalendarEntry) => (
    <button
      key={entry.id}
      type="button"
      className="event-resource-calendar__entry"
      data-slot-index={entry.slotIndex}
      data-resource-id={entry.resourceId}
      onClick={() => onSelectSlot(entry.slotIndex)}
    >
      <span>{entry.repeating ? "Repeating Time Slot" : "One-Time Time Slot"}</span>
      <small>{formatEntryTime(entry, eventTimeZone || "UTC")}</small>
    </button>
  );

  return (
    <section
      className="event-resource-calendar"
      aria-label={`${resourceLabelPlural} calendar`}
      data-calendar-view={view}
      data-event-type={eventType}
    >
      <div className="event-resource-calendar__heading">
        <div>
          <h3>Resource calendar</h3>
          <p>
            Select a date and {resourceLabelSingular.toLocaleLowerCase()} to add availability.
            Select an entry to edit its Time Slot.
          </p>
        </div>
        {header}
      </div>
      <div className="event-resource-calendar__toolbar">
        <div className="event-resource-calendar__navigation" role="group" aria-label="Calendar navigation">
          <button
            type="button"
            aria-label={view === "month" ? "Previous month" : "Previous week"}
            onClick={() => handleNavigate(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() =>
              setCalendarDate(
                instantToCalendarDateInTimeZone(new Date(), eventTimeZone || "UTC") ??
                  new Date(),
              )
            }
          >
            Today
          </button>
          <button
            type="button"
            aria-label={view === "month" ? "Next month" : "Next week"}
            onClick={() => handleNavigate(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <span className="event-resource-calendar__range" aria-live="polite">
          {formatCalendarRangeLabel(days)}
        </span>
        {view === "month" && !resourceIndependentBoundary ? (
          <Popover position="bottom-end" shadow="md">
            <Popover.Target>
              <Button
                type="button"
                variant="default"
                size="sm"
                aria-label={`Filter ${resourceLabelPlural}`}
              >
                {resourceLabelPlural} ({visibleResources.length})
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <FieldCalendarFilter
                items={resourceFilterItems}
                selectedIds={selectedResourceIds}
                onSelectedIdsChange={setVisibleResourceIds}
                title={`Visible ${resourceLabelPlural}`}
                ariaLabel={`${resourceLabelPlural} calendar filter`}
                searchPlaceholder="Search Resources or Facilities"
                searchAriaLabel="Search Resources or Facilities"
                emptyText={`No ${resourceLabelPlural.toLocaleLowerCase()} match your search.`}
              />
            </Popover.Dropdown>
          </Popover>
        ) : null}
        <div className="event-resource-calendar__views" role="group" aria-label="Calendar view">
          {(["week", "month"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={view === candidate}
              className={view === candidate ? "is-active" : undefined}
              onClick={() => setView(candidate)}
            >
              {candidate === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>
      {boundaryOnlyRange ? (
        <button
          type="button"
          className="event-resource-calendar__boundary-range"
          data-boundary-only-range
          disabled={readOnly || loading}
          aria-label={`Select boundary-only range ${formatDisplayDateTime(
            boundaryOnlyRange.start,
            { timeZone: boundaryOnlyRange.timeZone },
          )} to ${formatDisplayDateTime(boundaryOnlyRange.end, {
            timeZone: boundaryOnlyRange.timeZone,
          })}`}
          onClick={() =>
            onCreateSelection({
              start: boundaryOnlyRange.start,
              end: boundaryOnlyRange.end,
              resourceId: showBoundaryOnlyRange ? "" : resources[0]?.id ?? "",
            })
          }
        >
          <strong>
            Boundary-only range:{" "}
            {formatDisplayDateTime(boundaryOnlyRange.start, {
              timeZone: boundaryOnlyRange.timeZone,
            })}{" "}
            –{" "}
            {formatDisplayDateTime(boundaryOnlyRange.end, {
              timeZone: boundaryOnlyRange.timeZone,
            })}
          </strong>
          <span>No Time Slot is created for this range.</span>
        </button>
      ) : null}
      {loading ? (
        <div className="event-resource-calendar__loading" role="status">
          Loading Resources
        </div>
      ) : resources.length === 0 && !resourceIndependentBoundary ? (
        <div className="event-resource-calendar__empty" role="status">
          Add at least one {resourceLabelSingular.toLocaleLowerCase()} before selecting availability.
        </div>
      ) : view === "week" ? (
        <EventResourceCalendarWeekTimeline
          resources={calendarResources}
          days={days}
          entries={calendar.entries}
          eventTimeZone={eventTimeZone || "UTC"}
          resourceLabelSingular={resourceLabelSingular}
          defaultStartMinutes={defaultStartMinutes}
          readOnly={readOnly}
          onCreateSelection={handleTimelineSelection}
          onSelectSlot={onSelectSlot}
          onMoveSlot={onMoveSlot}
          onResizeSlot={onResizeSlot}
        />
      ) : (
        <div
          className="event-resource-calendar__month-grid"
          role="grid"
          data-calendar-grid
        >
          {days.map((day) => (
            <div
              key={calendarDayKey(day)}
              className="event-resource-calendar__month-cell"
              role="gridcell"
              aria-label={format(day, "EEEE, MMMM d")}
            >
              <div className="event-resource-calendar__month-day-label">
                {format(day, "EEE d")}
              </div>
              {visibleResources.map((resource) => {
                const entries = entryForResourceAndDay(
                  calendar.entries,
                  day,
                  resource.id,
                );
                return (
                  <div
                    key={`${calendarDayKey(day)}-${resource.id}`}
                    className="event-resource-calendar__month-resource"
                    data-resource-id={resource.id}
                  >
                    <span>{resourceLabel(resource, resourceLabelSingular)}</span>
                    {entries.map(renderEntry)}
                    <button
                      type="button"
                      className="event-resource-calendar__add"
                      disabled={readOnly}
                      onClick={() => handleCellSelection(day, resource.id)}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <InvalidSlotRecovery
        invalidSlots={calendar.invalidSlots}
        resources={resources}
        singular={resourceLabelSingular}
        readOnly={readOnly}
        onAssignResource={onAssignResource}
        onDeleteSlot={onDeleteSlot}
      />
    </section>
  );
};

export default EventResourceCalendar;
