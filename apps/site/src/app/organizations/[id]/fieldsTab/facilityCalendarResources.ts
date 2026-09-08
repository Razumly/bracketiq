import type { Facility, Field, Organization } from "@/types";

export function getFieldFacility(field?: Field | null): Facility | null {
  const facility = field?.facility;
  if (facility && typeof facility === 'object' && typeof facility.$id === 'string') return facility;
  return null;
}

export function getFieldFacilityFromList(field: Field | null | undefined, facilities: Facility[]): Facility | null {
  const expanded = getFieldFacility(field);
  if (expanded) return expanded;
  const facilityId = getFieldFacilityId(field);
  return facilityId ? facilities.find((facility) => facility.$id === facilityId) ?? null : null;
}

export function calendarTargetResourceId(resourceId: unknown, eventResourceId: unknown): string | null {
  if (typeof resourceId === 'string' && resourceId.trim().length > 0) return resourceId.trim();
  return typeof eventResourceId === 'string' ? eventResourceId.trim() : null;
}

export function getFieldFacilityId(field?: Field | null): string | null {
  if (typeof field?.facilityId === "string" && field.facilityId.trim())
    return field.facilityId.trim();
  const facility = field?.facility;
  if (typeof facility === "string" && facility.trim()) return facility.trim();
  if (
    facility &&
    typeof facility === "object" &&
    typeof facility.$id === "string"
  )
    return facility.$id;
  return null;
}

function coordinateTuple(
  longitude: unknown,
  latitude: unknown,
): [number, number] | null {
  const lng = Number(longitude);
  const lat = Number(latitude);
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    (lng === 0 && lat === 0)
  )
    return null;
  return [lng, lat];
}

export function facilityCoordinatesToTuple(
  value: unknown,
): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2)
    return coordinateTuple(value[0], value[1]);
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return coordinateTuple(
    record.lng ?? record.long ?? record.longitude,
    record.lat ?? record.latitude,
  );
}

export function getFieldCoordinatesWithFallback(
  field: Field | null | undefined,
  facility?: Facility | null,
  organization?: Organization | null,
): [number, number] | undefined {
  return (
    coordinateTuple(field?.long, field?.lat) ??
    facilityCoordinatesToTuple(facility?.coordinates) ??
    facilityCoordinatesToTuple(organization?.coordinates) ??
    undefined
  );
}
