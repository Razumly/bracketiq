import type { SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import { formatDisplayTime } from '@/lib/dateUtils';
import type { FacilityCalendarFeedItem } from '../fieldCalendar';
import type {
  CalendarEventData, FacilityFeedCalendarEntry, ManagerCalendarDraft,
  ManagerCalendarSelectionMode, SelectionCalendarEntry,
} from './facilityCalendarTypes';

type SelectionTitles = Record<ManagerCalendarSelectionMode, string>;
export type ManagerDraftCalendarEntry = SelectionCalendarEntry & {
  resource: SelectionCalendarEntry['resource'] & { slotKey: string };
};

const timeLabel = (event: CalendarEventData): string | null => (
  event.start && event.end
    ? `${formatDisplayTime(event.start)} - ${formatDisplayTime(event.end)}`
    : null
);

function feedStatus(item: FacilityCalendarFeedItem): string | null {
  if (item.unresolved) return 'Unresolved';
  if (!item.status) return null;
  return item.status.split(/[_\s-]+/).filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join(' ');
}

function bookedTitle(event: CalendarEventData): string {
  const resource = event.resource as { name?: unknown; matchId?: unknown };
  const name = typeof resource?.name === 'string' ? resource.name.trim() : '';
  if (name) return name;
  return typeof resource?.matchId === 'number' ? `Match #${resource.matchId}` : 'Booked slot';
}

function bookedPresentation(event: CalendarEventData, variant: SharedCalendarEventVariant) {
  if (variant === 'unavailable') return { title: 'Unavailable', meta: timeLabel(event) };
  if (variant === 'reservation') return { title: 'Rental reservation', meta: 'Reserved' };
  return { title: bookedTitle(event), meta: 'Booked' };
}

function selectionTitle(event: SelectionCalendarEntry, titles: SelectionTitles): string {
  const mode = event.selectionMode ?? event.resource.mode;
  if ((mode === 'staff_assignment' || mode === 'official_assignment') && event.resource.userId) return event.title;
  return mode ? titles[mode] ?? event.title : event.title;
}

export function facilityEventPresentation(
  event: CalendarEventData,
  variant: SharedCalendarEventVariant,
  canManage: boolean,
  titles: SelectionTitles,
): { title: string; meta: string | null } {
  if (event.metaType === 'facility-feed') {
    return { title: event.resource.title || event.title, meta: feedStatus(event.resource) ?? timeLabel(event) };
  }
  if (event.metaType === 'booked') return bookedPresentation(event, variant);
  if (event.metaType === 'rental') {
    return variant === 'unavailable'
      ? { title: 'Past rental slot', meta: 'Unavailable' }
      : { title: 'Open rental slot', meta: timeLabel(event) };
  }
  if (canManage && event.metaType === 'selection') {
    return { title: selectionTitle(event, titles), meta: 'Unsaved' };
  }
  return { title: event.title, meta: timeLabel(event) };
}

export function isManagerDraftEvent(
  event: CalendarEventData, canManage: boolean, editMode: boolean,
): event is ManagerDraftCalendarEntry {
  return Boolean(canManage && editMode && event.metaType === 'selection'
    && typeof event.resource?.slotKey === 'string' && event.resource.slotKey.length > 0
    && (event.selectionMode || event.resource.mode));
}

export function isStaffFeedEvent(
  event: CalendarEventData, canManage: boolean,
): event is FacilityFeedCalendarEntry {
  return Boolean(canManage && event.metaType === 'facility-feed'
    && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
    && event.start && event.end && event.resource);
}

export function canChangeFacilityEventRange(
  event: CalendarEventData, canManage: boolean, editMode: boolean,
): boolean {
  if (!canManage) return event.metaType === 'selection';
  if (!editMode) return false;
  return event.metaType === 'selection' || event.metaType === 'rental' || isStaffFeedEvent(event, true);
}

export function managerDraftFromCalendarEvent(event: ManagerDraftCalendarEntry): ManagerCalendarDraft | null {
  const mode = event.selectionMode ?? event.resource.mode;
  if (!mode) return null;
  return {
    id: event.resource.slotKey,
    mode,
    fieldIds: event.resourceId ? [event.resourceId] : [],
    start: new Date(event.start),
    end: new Date(event.end),
    ...(mode === 'rental' ? { rental: {} } : {
      staff: {
        userId: event.resource.userId ?? null,
        userName: typeof event.title === 'string' ? event.title : null,
      },
    }),
  };
}
