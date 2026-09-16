import type { SharedCalendarEventVariant } from "@/components/calendar/SharedCalendarEvent";
import type {
  FacilityCalendarFeedItemType,
  FieldCalendarEntry,
} from "../fieldCalendar";
import type {
  CalendarEventData,
  FacilityFeedCalendarEntry,
  SelectionCalendarEntry,
} from "./facilityCalendarTypes";
import { isPastRentalRangeStart } from "./usePublicRentalSelections";

export type CalendarLayerType = FacilityCalendarFeedItemType | "reservation";

function selectionVariant(
  event: SelectionCalendarEntry,
): SharedCalendarEventVariant {
  const isAssigned = Boolean(event.resource?.userId);
  const hasMode = (mode: SelectionCalendarEntry["selectionMode"]) =>
    event.selectionMode === mode || event.resource?.mode === mode;
  if (hasMode("rental")) return "availability";
  if (hasMode("official_assignment"))
    return isAssigned ? "official-assigned" : "official-open";
  if (hasMode("staff_assignment"))
    return isAssigned ? "staff-assigned" : "staff-open";
  return event.selectionMode || event.resource?.mode ? "default" : "selection";
}

function feedVariant(
  event: FacilityFeedCalendarEntry,
): SharedCalendarEventVariant {
  const isAssigned = event.resource.userId || event.resource.staffMemberId;
  if (event.feedType === "conflict") return "conflict";
  if (event.feedType === "maintenance_block") return "unavailable";
  if (event.feedType === "official_assignment")
    return isAssigned ? "official-assigned" : "official-open";
  if (event.feedType === "staff_assignment")
    return isAssigned ? "staff-assigned" : "staff-open";
  return "default";
}

function bookedSourceType(event: FieldCalendarEntry): string {
  const sourceType = (event.resource as { sourceType?: unknown } | undefined)
    ?.sourceType;
  return typeof sourceType === "string" ? sourceType.toUpperCase() : "";
}

export function getCalendarEventVariant(
  event: CalendarEventData | null | undefined,
): SharedCalendarEventVariant {
  if (!event) return "default";
  if (event.metaType === "selection") return selectionVariant(event);
  if (event.metaType === "facility-feed") return feedVariant(event);
  if (event.metaType === "rental")
    return isPastRentalRangeStart(event.start) ? "unavailable" : "availability";
  const sourceType = bookedSourceType(event);
  if (sourceType === "RENTAL_UNAVAILABLE") return "unavailable";
  return sourceType === "RENTAL_BOOKING" ? "reservation" : "booked";
}

export function getCalendarEventLayer(
  event: CalendarEventData,
): CalendarLayerType | null {
  if (event.metaType === "selection") return null;
  if (event.metaType === "facility-feed") return event.feedType;
  if (event.metaType === "rental") return "rental";
  if (bookedSourceType(event) === "RENTAL_BOOKING") return "reservation";
  return event.id.includes("field-booked-match-") ? "game" : "event";
}
