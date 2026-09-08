import type { Facility, Field, Organization } from "@/types";
import {
  calendarTargetResourceId,
  facilityCoordinatesToTuple,
  getFieldCoordinatesWithFallback,
  getFieldFacilityId,
} from "./facilityCalendarResources";

describe("Calendar resource context", () => {
  it('uses a supplied resource before the event resource and distinguishes empty from missing IDs', () => {
    expect(calendarTargetResourceId(' court-2 ', 'court-1')).toBe('court-2');
    expect(calendarTargetResourceId(' ', ' court-1 ')).toBe('court-1');
    expect(calendarTargetResourceId(12, ' court-1 ')).toBe('court-1');
    expect(calendarTargetResourceId(undefined, '')).toBe('');
    expect(calendarTargetResourceId(undefined, undefined)).toBeNull();
  });

  it("prefers the explicit facility link and can resolve a hydrated facility", () => {
    const hydrated = { $id: "hydrated_facility" } as Facility;
    expect(
      getFieldFacilityId({
        facilityId: " explicit_facility ",
        facility: hydrated,
      } as Field),
    ).toBe("explicit_facility");
    expect(getFieldFacilityId({ facility: hydrated } as Field)).toBe(
      "hydrated_facility",
    );
    expect(
      getFieldFacilityId({ facility: " linked_facility " } as unknown as Field),
    ).toBe("linked_facility");
    expect(getFieldFacilityId(null)).toBeNull();
  });

  it("uses resource coordinates before facility coordinates and Organization coordinates", () => {
    const facility = { coordinates: [-98, 31] } as Facility;
    const organization = { coordinates: [-99, 32] } as Organization;
    expect(
      getFieldCoordinatesWithFallback(
        { lat: 30, long: -97 } as Field,
        facility,
        organization,
      ),
    ).toEqual([-97, 30]);
    expect(
      getFieldCoordinatesWithFallback(
        { lat: 0, long: 0 } as Field,
        facility,
        organization,
      ),
    ).toEqual([-98, 31]);
    expect(getFieldCoordinatesWithFallback(null, null, organization)).toEqual([
      -99, 32,
    ]);
    expect(getFieldCoordinatesWithFallback(null, null, null)).toBeUndefined();
  });

  it("normalizes coordinate aliases and rejects unset or non-finite coordinates", () => {
    expect(
      facilityCoordinatesToTuple({ longitude: "-97", latitude: "30" }),
    ).toEqual([-97, 30]);
    expect(facilityCoordinatesToTuple([0, 0])).toBeNull();
    expect(facilityCoordinatesToTuple({ lat: "invalid", lng: 5 })).toBeNull();
    expect(facilityCoordinatesToTuple(undefined)).toBeNull();
  });
});
