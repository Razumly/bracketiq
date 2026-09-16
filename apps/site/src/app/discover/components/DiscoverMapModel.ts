import type { Event, Facility, Field, Organization, TimeSlot, Team } from '@/types';

export type MapCenter = { lat: number; lng: number };

export type RentalMapListing = {
  kind: 'slot' | 'affiliateFacility';
  organization: Organization;
  facility?: Facility;
  field?: Field;
  slot?: TimeSlot;
  nextOccurrence: Date;
  coordinates: MapCenter;
  distanceKm?: number;
};

export type TeamMapListing = {
  team: Team;
  organization: Organization;
  coordinates: MapCenter;
};

export type MapMarkerGroup<T> = {
  id: string;
  position: MapCenter;
  items: T[];
};

const MAP_SEARCH_RADIUS_KM = 50;
const MIN_MAP_SEARCH_RADIUS_KM = 1;
const MAP_CENTER_EPSILON_DEGREES = 0.00001;
const KM_PER_MILE = 1.60934;
const MARKER_GROUP_DISTANCE_PX = 44;
const MAP_TILE_SIZE_PX = 256;
const MAX_MERCATOR_SIN_LAT = 0.9999;

export const kmToMiles = (value: number): number => value / KM_PER_MILE;

export const normalizeMapRadiusKm = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MAP_SEARCH_RADIUS_KM;
  }
  return Math.max(MIN_MAP_SEARCH_RADIUS_KM, value);
};

export const mapCentersAreClose = (left: MapCenter, right: MapCenter): boolean =>
  Math.abs(left.lat - right.lat) < MAP_CENTER_EPSILON_DEGREES &&
  Math.abs(left.lng - right.lng) < MAP_CENTER_EPSILON_DEGREES;

const projectMapPosition = (position: MapCenter, zoom: number): { x: number; y: number } => {
  const sinLat = Math.max(
    -MAX_MERCATOR_SIN_LAT,
    Math.min(MAX_MERCATOR_SIN_LAT, Math.sin((position.lat * Math.PI) / 180)),
  );
  const scale = MAP_TILE_SIZE_PX * 2 ** zoom;
  return {
    x: ((position.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
};

const distanceBetweenPoints = (
  left: { x: number; y: number },
  right: { x: number; y: number },
): number => Math.hypot(left.x - right.x, left.y - right.y);

export const getOrgCoordinates = (org: Organization): MapCenter | null => {
  if (Array.isArray(org.coordinates) && org.coordinates.length >= 2) {
    const [lng, lat] = org.coordinates;
    const latNum = typeof lat === 'number' ? lat : Number(lat);
    const lngNum = typeof lng === 'number' ? lng : Number(lng);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return { lat: latNum, lng: lngNum };
    }
  }
  const latRaw = (org as any).lat ?? (org as any).latitude;
  const lngRaw = (org as any).long ?? (org as any).longitude ?? (org as any).lng;
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
};

export const getFieldCoordinates = (field: Field): MapCenter | null => {
  const lat = typeof field.lat === 'number' ? field.lat : Number(field.lat);
  const lng = typeof field.long === 'number' ? field.long : Number(field.long);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
};

export const getFacilityCoordinates = (facility: Facility): MapCenter | null => {
  if (Array.isArray(facility.coordinates) && facility.coordinates.length >= 2) {
    const [lng, lat] = facility.coordinates;
    const latNum = typeof lat === 'number' ? lat : Number(lat);
    const lngNum = typeof lng === 'number' ? lng : Number(lng);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return { lat: latNum, lng: lngNum };
    }
  }
  return null;
};

export const getRentalListingId = (rental: RentalMapListing): string => {
  if (rental.kind === 'affiliateFacility') {
    return `${rental.organization.$id}:facility:${rental.facility?.$id ?? 'affiliate'}`;
  }
  return `${rental.organization.$id}:${rental.field?.$id ?? 'field'}:${rental.slot?.$id ?? 'slot'}`;
};

export const getRentalListingName = (rental: RentalMapListing): string => {
  if (rental.kind === 'affiliateFacility') {
    return rental.facility?.name || rental.organization.name;
  }
  return rental.field?.name || rental.organization.name;
};

export const matchesOrganizationSearch = (organization: Organization, query: string): boolean => (
  !query || `${organization.name} ${organization.location ?? ''} ${organization.description ?? ''} ${organization.website ?? ''}`.toLowerCase().includes(query)
);

export const matchesRentalSearch = (rental: RentalMapListing, query: string): boolean => {
  if (!query) return true;
  const rentalLocation = rental.kind === 'affiliateFacility'
    ? rental.facility?.location ?? ''
    : rental.field?.location ?? '';
  return `${rental.organization.name} ${rental.organization.description ?? ''} ${rental.organization.location ?? ''} ${getRentalListingName(rental)} ${rentalLocation}`.toLowerCase().includes(query);
};

export const matchesTeamSearch = ({ team, organization }: TeamMapListing, query: string): boolean => (
  !query || `${team.name} ${team.sport} ${organization.name} ${organization.location ?? ''} ${organization.description ?? ''}`.toLowerCase().includes(query)
);

export const getEventCoordinates = (event: Event): MapCenter | null => {
  if (!Array.isArray(event.coordinates) || event.coordinates.length < 2) {
    return null;
  }
  const [lng, lat] = event.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

export const buildMapMarkerGroups = <T,>(
  items: T[],
  zoom: number,
  getId: (item: T) => string,
  getCoordinates: (item: T) => MapCenter | null,
): MapMarkerGroup<T>[] => {
  const markers = items
    .map((item) => {
      const coordinates = getCoordinates(item);
      if (!coordinates) {
        return null;
      }
      return {
        item,
        coordinates,
        point: projectMapPosition(coordinates, zoom),
      };
    })
    .filter((entry): entry is {
      item: T;
      coordinates: MapCenter;
      point: { x: number; y: number };
    } => Boolean(entry));

  const parent = markers.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]);
    }
    return parent[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[rightRoot] = leftRoot;
    }
  };

  markers.forEach((marker, markerIndex) => {
    for (let comparisonIndex = markerIndex + 1; comparisonIndex < markers.length; comparisonIndex += 1) {
      if (distanceBetweenPoints(marker.point, markers[comparisonIndex].point) <= MARKER_GROUP_DISTANCE_PX) {
        union(markerIndex, comparisonIndex);
      }
    }
  });

  const groupsByRoot = new Map<number, typeof markers>();
  markers.forEach((marker, markerIndex) => {
    const root = find(markerIndex);
    const group = groupsByRoot.get(root);
    if (group) {
      group.push(marker);
    } else {
      groupsByRoot.set(root, [marker]);
    }
  });

  return Array.from(groupsByRoot.values())
    .map((group) => {
      const sortedGroup = [...group].sort((left, right) => getId(left.item).localeCompare(getId(right.item)));
      const position = sortedGroup.length === 1
        ? sortedGroup[0].coordinates
        : {
            lat: sortedGroup.reduce((sum, marker) => sum + marker.coordinates.lat, 0) / sortedGroup.length,
            lng: sortedGroup.reduce((sum, marker) => sum + marker.coordinates.lng, 0) / sortedGroup.length,
          };
      return {
        id: sortedGroup.map((marker) => getId(marker.item)).join(':'),
        position,
        items: sortedGroup.map((marker) => marker.item),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
};

export const resolveEventDateRange = (startDate: Date | null, endDate: Date | null): { dateFrom: string; dateTo?: string } => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const normalizedStartDate = startDate instanceof Date && !Number.isNaN(startDate.getTime())
    ? startDate
    : null;
  const normalizedEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime())
    ? endDate
    : null;
  const effectiveDate = normalizedStartDate
    ? normalizedStartDate
    : normalizedEndDate && normalizedEndDate < startOfToday
      ? normalizedEndDate
      : startOfToday;

  const dateFrom = new Date(
    effectiveDate.getFullYear(),
    effectiveDate.getMonth(),
    effectiveDate.getDate(),
    0,
    0,
    0,
    0,
  ).toISOString();
  const dateTo = normalizedEndDate
    ? new Date(
        normalizedEndDate.getFullYear(),
        normalizedEndDate.getMonth(),
        normalizedEndDate.getDate(),
        23,
        59,
        59,
        999,
      ).toISOString()
    : undefined;

  return { dateFrom, dateTo };
};
