"use client";

import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
} from 'react';
import { Paper, Text } from '@/components/organization/organization-operation-ui';
import {
  type View,
} from 'react-big-calendar';
import SharedCalendarEvent, { type SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import type { EntityColorReferenceValue } from '@/lib/entityColors';
import type { FacilityCalendarFeedItem } from '../fieldCalendar';
import FacilityResourceCalendarGrid, {
  type FacilityResourceCalendarResource,
} from './FacilityResourceCalendarGrid';
import type {
  CalendarEventData,
  ManagerCalendarDraft,
  ManagerCalendarSelectionMode,
  SelectionCalendarEntry,
} from './facilityCalendarTypes';

import {
  facilityEventPresentation, isManagerDraftEvent, isStaffFeedEvent,
  canChangeFacilityEventRange, managerDraftFromCalendarEvent,
  type ManagerDraftCalendarEntry,
} from './facilityCalendarEventPresentation';
import type { FacilityFeedCalendarEntry } from './facilityCalendarTypes';

type FacilityCalendarPanelContextValue = {
  conflictingEventIds?: ReadonlySet<string>;
  canManage: boolean;
  managerCalendarEditMode: boolean;
  fieldEventsLoading: boolean;
  fieldColorReferenceList: EntityColorReferenceValue[];
  managerDraftDragId: string | null;
  managerSelectionTitles: Record<ManagerCalendarSelectionMode, string>;
  getCalendarEventVariant: (event: CalendarEventData | null | undefined) => SharedCalendarEventVariant;
  onManagerDraftClick: (draftId: string, fallbackDraft: ManagerCalendarDraft | null) => void;
  onManagerDraftPointerDown: (entry: SelectionCalendarEntry, event: ReactPointerEvent<HTMLDivElement>) => void;
  onManagerDraftPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onManagerDraftPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onManagerDraftPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isStaffAssignmentActivationSuppressed: () => boolean;
  onOpenStaffAssignmentEdit: (item: FacilityCalendarFeedItem, start: Date, end: Date) => void;
};

const FacilityCalendarPanelContext = createContext<FacilityCalendarPanelContextValue | null>(null);

const useFacilityCalendarPanelContext = () => {
  const value = useContext(FacilityCalendarPanelContext);
  if (!value) {
    throw new Error('FacilityCalendarPanel context is missing.');
  }
  return value;
};

function managerDraftActions(event: ManagerDraftCalendarEntry, context: FacilityCalendarPanelContextValue) {
  return {
    draggable: true,
    selected: context.managerDraftDragId === event.resource.slotKey,
    dataAttributes: { 'data-manager-draft-id': event.resource.slotKey },
    onClick: () => context.onManagerDraftClick(event.resource.slotKey, managerDraftFromCalendarEvent(event)),
    onPointerDown: (pointer: ReactPointerEvent<HTMLDivElement>) => context.onManagerDraftPointerDown(event, pointer),
    onPointerMove: context.onManagerDraftPointerMove,
    onPointerUp: context.onManagerDraftPointerUp,
    onPointerCancel: context.onManagerDraftPointerCancel,
  };
}

function staffAssignmentActions(event: FacilityFeedCalendarEntry, context: FacilityCalendarPanelContextValue) {
  const openAssignment = () => {
    if (context.isStaffAssignmentActivationSuppressed()) return;
    context.onOpenStaffAssignmentEdit(event.resource, event.start, event.end);
  };
  return {
    draggable: context.managerCalendarEditMode,
    dataAttributes: { 'data-staff-assignment-calendar-event-id': String(event.id) },
    onClick: openAssignment,
    onPointerUp: context.managerCalendarEditMode ? undefined : (pointer: ReactPointerEvent<HTMLDivElement>) => {
      pointer.preventDefault();
      pointer.stopPropagation();
      openAssignment();
    },
  };
}

function facilityEventActions(event: CalendarEventData, context: FacilityCalendarPanelContextValue) {
  if (isManagerDraftEvent(event, context.canManage, context.managerCalendarEditMode)) {
    return managerDraftActions(event, context);
  }
  if (isStaffFeedEvent(event, context.canManage)) return staffAssignmentActions(event, context);
  return { draggable: context.canManage && context.managerCalendarEditMode && event.metaType === 'rental' };
}

function FacilityCalendarEvent({ event }: { event: CalendarEventData }) {
  const context = useFacilityCalendarPanelContext();
  const variant = context.getCalendarEventVariant(event);
  const presentation = facilityEventPresentation(event, variant, context.canManage, context.managerSelectionTitles);
  const fieldName = typeof event.fieldName === 'string' ? event.fieldName.trim() : '';
  return (
    <SharedCalendarEvent
      {...presentation}
      {...facilityEventActions(event, context)}
      subtitle={fieldName || undefined}
      colorReferenceList={context.fieldColorReferenceList}
      colorMatchKey={event.resourceId}
      resourceColorMatchKeys={event.resourceId ? [event.resourceId] : undefined}
      compact
      conflict={context.conflictingEventIds?.has(event.id) ?? false}
      variant={variant}
    />
  );
}

type FacilityCalendarPanelProps = FacilityCalendarPanelContextValue & {
  canRenderCalendar: boolean;
  emptyText: string;
  events: CalendarEventData[];
  resources: FacilityResourceCalendarResource[];
  calendarView: View;
  calendarDate: Date;
  calendarRangeStart: Date;
  calendarRangeEnd: Date;
  onViewChange: (view: Extract<View, 'week' | 'month'>) => void;
  onNavigateDate: (date: Date) => void;
  minTime: Date;
  maxTime: Date;
  eventPropGetter: (event: CalendarEventData) => Record<string, unknown>;
  slotPropGetter: (date: Date, resourceId?: string) => Record<string, unknown>;
  onEventDrop: (event: any) => void;
  onEventResize: (event: any) => void;
  onSelectSlot: (slotInfo: any) => void;
  onSelectEvent: (event: CalendarEventData) => void;
  onShellPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onShellPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onShellClickCapture: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
};

export default function FacilityCalendarPanel({
  canRenderCalendar,
  emptyText,
  events,
  resources,
  calendarView,
  calendarDate,
  calendarRangeStart,
  calendarRangeEnd,
  onViewChange,
  onNavigateDate,
  minTime,
  maxTime,
  eventPropGetter,
  slotPropGetter,
  onEventDrop,
  onEventResize,
  onSelectSlot,
  onSelectEvent,
  onShellPointerDownCapture,
  onShellPointerUpCapture,
  onShellClickCapture,
  ...contextValue
}: FacilityCalendarPanelProps) {
  if (!canRenderCalendar) {
    return (
      <Paper
        withBorder
        radius="md"
        style={{
          minHeight: '10rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text c="dimmed">{emptyText}</Text>
      </Paper>
    );
  }

  return (
    <FacilityCalendarPanelContext.Provider value={contextValue}>
      <div
        className="shared-calendar-shell shared-calendar-shell--fields"
        onPointerDownCapture={onShellPointerDownCapture}
        onPointerUpCapture={contextValue.managerCalendarEditMode ? undefined : onShellPointerUpCapture}
        onClickCapture={contextValue.managerCalendarEditMode ? undefined : onShellClickCapture}
      >
        <FacilityResourceCalendarGrid
          resources={resources}
          events={events}
          calendarView={calendarView === 'month' ? 'month' : 'week'}
          calendarDate={calendarDate}
          calendarRangeStart={calendarRangeStart}
          calendarRangeEnd={calendarRangeEnd}
          minTime={minTime}
          maxTime={maxTime}
          fieldEventsLoading={contextValue.fieldEventsLoading}
          eventPropGetter={eventPropGetter}
          onViewChange={onViewChange}
          onNavigateDate={onNavigateDate}
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          slotPropGetter={slotPropGetter}
          renderEvent={(event) => <FacilityCalendarEvent event={event} />}
          canMoveEvent={(event) => canChangeFacilityEventRange(event, contextValue.canManage, contextValue.managerCalendarEditMode)}
          canResizeEvent={(event) => canChangeFacilityEventRange(event, contextValue.canManage, contextValue.managerCalendarEditMode)}
        />
      </div>
    </FacilityCalendarPanelContext.Provider>
  );
}
