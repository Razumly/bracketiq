'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Image from 'next/image';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Text,
} from '@/components/organization/organization-operation-ui';

import {
  GoogleMap,
  MarkerF,
  OVERLAY_LAYER,
  OverlayViewF,
  useJsApiLoader,
} from '@react-google-maps/api';
import {
  CalendarDays,
  ChevronDown,
  CircleDot,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';

import {
  Event,
  Facility,
  Field,
  Organization,
  TimeSlot,
  Team,
  getEventImageFallbackUrl,
  getEventImageUrl,
  getOrganizationAvatarUrl,
  getTeamAvatarUrl,
} from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { normalizeExternalHttpUrl } from '@/lib/externalUrl';
import { normalizeTimeZone } from '@/lib/dateUtils';
import type { LocationInfo } from '@/lib/locationService';
import {
  GOOGLE_MAP_OPTIONS_WITH_MAP_ID,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_SCRIPT_ID,
} from '@/lib/googleMapsLoader';
import { getNextRentalOccurrence } from '../utils/rentals';
import DiscoverFilterBar, { type DiscoverFilterBarProps } from './DiscoverFilterBar';
import DiscoverTabFilterBar, {
  EMPTY_DISCOVERY_DIVISION_FILTERS,
  hasDiscoveryDivisionFilters,
  type OrganizationDiscoveryFilters,
  type RentalDiscoveryFilters,
  type TeamDiscoveryFilters,
} from './DiscoverTabFilterBar';
import { useDivisionDiscoveryOptions } from './DivisionDiscoveryFilters';
import { filterLoadedEvents } from '@/components/events/event-list-filtering';
import { rentalResourceMatchesSports } from '../rentalSportFilters';
import { buildTeamDivisionFilterOptions, filterOpenRegistrationTeams } from '../utils/teamFilters';
import type { DiscoverTabValue } from '@/lib/discoverFilters';

type MapCenter = { lat: number; lng: number };
type MapSearchTarget = DiscoverTabValue;

type RentalMapListing = {
  kind: 'slot' | 'affiliateFacility';
  organization: Organization;
  facility?: Facility;
  field?: Field;
  slot?: TimeSlot;
  nextOccurrence: Date;
  coordinates: MapCenter;
  distanceKm?: number;
};

type TeamMapListing = {
  team: Team;
  organization: Organization;
  coordinates: MapCenter;
};

type MarkerSelection =
  | { type: 'event'; id: string }
  | { type: 'eventGroup'; ids: string[]; position: MapCenter }
  | { type: 'organization'; id: string }
  | { type: 'organizationGroup'; ids: string[]; position: MapCenter }
  | { type: 'rental'; id: string }
  | { type: 'rentalGroup'; ids: string[]; position: MapCenter }
  | { type: 'team'; id: string }
  | { type: 'teamGroup'; ids: string[]; position: MapCenter };

type SearchResult =
  | { type: 'event'; id: string; label: string; description: string; coordinates: MapCenter; event: Event }
  | { type: 'organization'; id: string; label: string; description: string; coordinates: MapCenter; organization: Organization }
  | { type: 'rental'; id: string; label: string; description: string; coordinates: MapCenter; rental: RentalMapListing }
  | { type: 'team'; id: string; label: string; description: string; coordinates: MapCenter; listing: TeamMapListing };

type MapMarkerGroup<T> = {
  id: string;
  position: MapCenter;
  items: T[];
};

type DiscoverMapModalProps = Omit<DiscoverFilterBarProps, 'divisionOptions' | 'activeFilterCount' | 'resetFilters' | 'showDistanceFilter'> & {
  opened: boolean;
  embedded?: boolean;
  searchQuery?: string;
  activeTab: DiscoverTabValue;
  onClose: () => void;
  locationInfo?: LocationInfo | null;
  requestLocation: () => Promise<void>;
  clearLocation?: () => void;
  kmBetween: (a: MapCenter, b: MapCenter) => number;
  organizationFilters: OrganizationDiscoveryFilters;
  rentalFilters: RentalDiscoveryFilters;
  teamFilters: Omit<TeamDiscoveryFilters, 'divisionTypeOptions'> & {
    selectedSports: string[];
    setSelectedSports: Dispatch<SetStateAction<string[]>>;
  };
  onEventClick: (event: Event) => void;
  onOrganizationClick: (organization: Organization) => void;
  onTeamClick: (team: Team) => void;
};

const DEFAULT_CENTER: MapCenter = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_MAP_ZOOM = 11;
const MAP_SEARCH_RADIUS_KM = 50;
const MIN_MAP_SEARCH_RADIUS_KM = 1;
const MAP_CENTER_EPSILON_DEGREES = 0.00001;
const VIEWPORT_RADIUS_EPSILON_KM = 0.1;
const KM_PER_MILE = 1.60934;
const MARKER_SIZE_PX = 44;
const MARKER_CLICK_TARGET_SIZE_PX = 52;
const MARKER_GROUP_DISTANCE_PX = MARKER_SIZE_PX;
const MAP_TILE_SIZE_PX = 256;
const MAX_MERCATOR_SIN_LAT = 0.9999;
const TRANSPARENT_MARKER_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="26" fill="black" fill-opacity="0.01"/></svg>',
)}`;

const kmToMiles = (value: number): number => value / KM_PER_MILE;
const normalizeMapRadiusKm = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MAP_SEARCH_RADIUS_KM;
  }
  return Math.max(MIN_MAP_SEARCH_RADIUS_KM, value);
};
const mapCentersAreClose = (left: MapCenter, right: MapCenter): boolean =>
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

const SEARCH_TARGETS: Array<{ value: MapSearchTarget; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'organizations', label: 'Organizations' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'teams', label: 'Teams' },
];

const MARKER_STYLES: Record<MapSearchTarget, {
  color: string;
  shortLabel: string;
  singular: string;
}> = {
  events: {
    color: '#f66b45',
    shortLabel: 'E',
    singular: 'event',
  },
  organizations: {
    color: '#16a34a',
    shortLabel: 'O',
    singular: 'organization',
  },
  rentals: {
    color: '#7c3aed',
    shortLabel: 'R',
    singular: 'rental',
  },
  teams: {
    color: '#2563eb',
    shortLabel: 'T',
    singular: 'team',
  },
};

const getOrgCoordinates = (org: Organization): MapCenter | null => {
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

const getFieldCoordinates = (field: Field): MapCenter | null => {
  const lat = typeof field.lat === 'number' ? field.lat : Number(field.lat);
  const lng = typeof field.long === 'number' ? field.long : Number(field.long);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
};

const getFacilityCoordinates = (facility: Facility): MapCenter | null => {
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

const getRentalListingId = (rental: RentalMapListing): string => {
  if (rental.kind === 'affiliateFacility') {
    return `${rental.organization.$id}:facility:${rental.facility?.$id ?? 'affiliate'}`;
  }
  return `${rental.organization.$id}:${rental.field?.$id ?? 'field'}:${rental.slot?.$id ?? 'slot'}`;
};

const getRentalListingName = (rental: RentalMapListing): string => {
  if (rental.kind === 'affiliateFacility') {
    return rental.facility?.name || rental.organization.name;
  }
  return rental.field?.name || rental.organization.name;
};

const matchesOrganizationSearch = (organization: Organization, query: string): boolean => (
  !query || `${organization.name} ${organization.location ?? ''} ${organization.description ?? ''}`.toLowerCase().includes(query)
);

const matchesRentalSearch = (rental: RentalMapListing, query: string): boolean => {
  if (!query) return true;
  const rentalLocation = rental.kind === 'affiliateFacility'
    ? rental.facility?.location ?? ''
    : rental.field?.location ?? '';
  return `${rental.organization.name} ${rental.organization.description ?? ''} ${rental.organization.location ?? ''} ${getRentalListingName(rental)} ${rentalLocation}`.toLowerCase().includes(query);
};

const matchesTeamSearch = ({ team, organization }: TeamMapListing, query: string): boolean => (
  !query || `${team.name} ${team.sport} ${organization.name} ${organization.location ?? ''}`.toLowerCase().includes(query)
);

const getEventCoordinates = (event: Event): MapCenter | null => {
  if (!Array.isArray(event.coordinates) || event.coordinates.length < 2) {
    return null;
  }
  const [lng, lat] = event.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

const buildMapMarkerGroups = <T,>(
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

const resolveEventDateRange = (startDate: Date | null, endDate: Date | null): { dateFrom: string; dateTo?: string } => {
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


const getInitials = (value: string, fallback: string): string => {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return fallback;
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || fallback;
};

const getEventMapImageUrl = (event: Event): string => (
  getEventImageUrl({
    imageId: event.imageId,
    width: 360,
    height: 180,
    placeholderUrl: getEventImageFallbackUrl({
      event,
      width: 360,
      height: 180,
      fit: 'inside',
    }),
    fit: 'inside',
  })
);

const getEventSummary = (event: Event): string | null => {
  const description = event.description?.trim();
  if (!description || description.toLowerCase() === event.location.trim().toLowerCase()) {
    return null;
  }
  return description;
};

const getEventSportLabel = (event: Event): string => (
  event.sport?.name?.trim() || event.sportIds?.[0]?.trim() || 'Sport not specified'
);

const getOrganizationSummary = (organization: Organization): string => (
  organization.description?.trim() || organization.location || 'Organization details'
);

function getEventMapDate(event: Event): string {
  const displayMode = String(event.dateDisplayMode);
  if (displayMode === 'NO_FIXED_DATE' || displayMode === 'ONGOING') {
    return event.dateDisplayText || event.scheduleText || 'No fixed start date';
  }
  if (displayMode === 'DATE_ONLY' && event.dateDisplayText?.trim()) {
    return event.dateDisplayText.trim();
  }
  const schedule = event.nextOccurrence ?? event;
  const timeZone = normalizeTimeZone(schedule.timeZone ?? event.timeZone);
  const formatDate = (value: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
  };
  const start = formatDate(schedule.start);
  const end = formatDate(schedule.end);
  if (!start) return 'Date to be announced';
  return end && end !== start ? `${start} – ${end}` : start;
}

function MapEventRow({
  event,
  distance,
  onSelect,
}: {
  event: Event;
  distance: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="discover-map-result-row"
      aria-label={`Select ${event.name}`}
      data-map-result-id={event.$id}
      onClick={onSelect}
    >
      <Image
        src={getEventMapImageUrl(event)}
        alt=""
        width={96}
        height={104}
        unoptimized
        className="discover-map-result-image"
      />
      <span className="discover-map-result-copy">
        <strong>{event.name}</strong>
        <span className="discover-map-result-sport"><CircleDot size={15} aria-hidden="true" />{getEventSportLabel(event)}</span>
        <span className="discover-map-result-date">{getEventMapDate(event)}</span>
        <span className="discover-map-result-location">
          <span>{event.location}</span>
          {distance && <span className="discover-map-result-distance">{distance}</span>}
        </span>
      </span>
    </button>
  );
}

function MapEntityMarker({
  position,
  title,
  markerStyle,
  initials,
  imageUrl,
  dot = false,
  selected = false,
  zIndex,
  clickTargetIcon,
  onClick,
}: {
  position: MapCenter;
  title: string;
  markerStyle: { color: string };
  initials: string;
  imageUrl?: string;
  dot?: boolean;
  selected?: boolean;
  zIndex?: number;
  clickTargetIcon?: google.maps.Icon;
  onClick: () => void;
}) {
  return (
    <Fragment>
      <MarkerF
        position={position}
        title={title}
        icon={clickTargetIcon}
        clickable
        zIndex={(zIndex ?? 0) + 1000}
        onClick={onClick}
      />
      <OverlayViewF
        position={position}
        mapPaneName={OVERLAY_LAYER}
        zIndex={zIndex}
        getPixelPositionOffset={(width, height) => ({
          x: -(width / 2),
          y: -(height / 2),
        })}
      >
        <div
          className={`discover-map-marker${dot ? ' discover-map-marker--dot' : ''}${selected ? ' is-selected' : ''}`}
          style={{
            background: imageUrl ? 'var(--background)' : markerStyle.color,
            borderColor: dot ? '#ffffff' : markerStyle.color,
          }}
          title={title}
          aria-hidden="true"
        >
          {!dot && (imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              width={MARKER_SIZE_PX}
              height={MARKER_SIZE_PX}
              unoptimized
            />
          ) : (
            <span>{initials}</span>
          ))}
        </div>
      </OverlayViewF>
    </Fragment>
  );
}

function MapClusterMarker({
  position,
  title,
  markerStyle,
  count,
  zIndex,
  clickTargetIcon,
  onClick,
}: {
  position: MapCenter;
  title: string;
  markerStyle: { color: string };
  count: number;
  zIndex?: number;
  clickTargetIcon?: google.maps.Icon;
  onClick: () => void;
}) {
  return (
    <Fragment>
      <MarkerF
        position={position}
        title={title}
        icon={clickTargetIcon}
        clickable
        zIndex={(zIndex ?? 0) + 1000}
        onClick={onClick}
      />
      <OverlayViewF
        position={position}
        mapPaneName={OVERLAY_LAYER}
        zIndex={zIndex}
        getPixelPositionOffset={(width, height) => ({
          x: -(width / 2),
          y: -(height / 2),
        })}
      >
        <div
          className="discover-map-marker discover-map-marker--cluster"
          style={{
            background: markerStyle.color,
            borderColor: '#ffffff',
          }}
          title={title}
          aria-hidden="true"
        >
          <span>{count}</span>
        </div>
      </OverlayViewF>
    </Fragment>
  );
}

type MapScriptLoadState = {
  isLoaded: boolean;
  loadError: Error | undefined;
};

function DiscoverMapScriptLoader({
  googleMapsApiKey,
  onStateChange,
}: {
  googleMapsApiKey: string;
  onStateChange: (state: MapScriptLoadState) => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    onStateChange({ isLoaded, loadError });
  }, [isLoaded, loadError, onStateChange]);

  return null;
}

export default function DiscoverMapModal({
  opened,
  embedded = false,
  searchQuery = '',
  activeTab,
  onClose,
  location,
  locationInfo,
  requestLocation,
  clearLocation,
  kmBetween,
  selectedSports,
  setSelectedSports,
  selectedTags,
  setSelectedTags,
  eventTags,
  eventTagsLoading,
  eventTagsError,
  selectedEventTypes,
  setSelectedEventTypes,
  eventTypeOptions,
  divisionFilters,
  setDivisionFilters,
  organizationFilters,
  rentalFilters,
  teamFilters,
  sports,
  sportsLoading,
  sportsError,
  maxDistance,
  setMaxDistance,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  defaultMaxDistance,
  onEventClick,
  onOrganizationClick,
  onTeamClick,
}: DiscoverMapModalProps) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const [{ isLoaded, loadError }, setMapLoadState] = useState<MapScriptLoadState>({
    isLoaded: false,
    loadError: undefined,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [center, setCenter] = useState<MapCenter>(location ?? DEFAULT_CENTER);
  const [searchedCenter, setSearchedCenter] = useState<MapCenter | null>(null);
  const [viewportRadiusKm, setViewportRadiusKm] = useState(MAP_SEARCH_RADIUS_KM);
  const [events, setEvents] = useState<Event[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [rentals, setRentals] = useState<RentalMapListing[]>([]);
  const [teamListings, setTeamListings] = useState<TeamMapListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [locationRequestError, setLocationRequestError] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState<MapSearchTarget>(activeTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<MarkerSelection | null>(null);
  const [isSearchAreaDirty, setIsSearchAreaDirty] = useState(false);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const selectionCardRef = useRef<HTMLDivElement>(null);
  const resultRailRef = useRef<HTMLDivElement>(null);
  const previousSelectionRef = useRef<MarkerSelection | null>(null);
  const locationRequestRef = useRef<Promise<void> | null>(null);
  const latestLoadMapDataRef = useRef<(
    nextCenter: MapCenter,
    radiusKm?: number,
    target?: MapSearchTarget,
  ) => Promise<void>>(async () => {});
  const initialMapLoadKeyRef = useRef<string | null>(null);
  const mapSettledOnceRef = useRef(false);
  const loadRequestRef = useRef(0);
  const pendingLoadRequestRef = useRef<number | null>(null);
  const lastLoadedFiltersRef = useRef<string | null>(null);
  const openingTargetRef = useRef<MapSearchTarget | null>(null);
  const divisionOptions = useDivisionDiscoveryOptions(selectedSports, opened && searchTarget === 'events');
  const teamDivisionOptions = useMemo(() => buildTeamDivisionFilterOptions(teamFilters.selectedSports), [teamFilters.selectedSports]);
  const embeddedSearchQuery = embedded ? searchQuery.trim().toLowerCase() : '';
  const targetFiltersKey = JSON.stringify([
    searchTarget,
    embeddedSearchQuery,
    searchTarget === 'events'
      ? [selectedSports, selectedTags, selectedEventTypes, selectedStartDate, selectedEndDate, maxDistance, divisionFilters]
      : searchTarget === 'organizations'
        ? [selectedSports, organizationFilters.selectedTags, organizationFilters.divisionFilters, organizationFilters.maxDistance]
        : searchTarget === 'rentals' ? rentalFilters.maxDistance : null,
  ]);

  const eventDateRange = useMemo(
    () => resolveEventDateRange(selectedStartDate, selectedEndDate),
    [selectedEndDate, selectedStartDate],
  );

  const userLocationIcon = useMemo<google.maps.Symbol | undefined>(() => {
    if (!isLoaded || typeof google === 'undefined') {
      return undefined;
    }
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#1c7ed6',
      fillOpacity: 1,
      scale: 8,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    };
  }, [isLoaded]);

  const markerClickTargetIcon = useMemo<google.maps.Icon | undefined>(() => {
    if (!isLoaded || typeof google === 'undefined') {
      return undefined;
    }
    return {
      url: TRANSPARENT_MARKER_ICON_URL,
      scaledSize: new google.maps.Size(MARKER_CLICK_TARGET_SIZE_PX, MARKER_CLICK_TARGET_SIZE_PX),
      anchor: new google.maps.Point(MARKER_CLICK_TARGET_SIZE_PX / 2, MARKER_CLICK_TARGET_SIZE_PX / 2),
    };
  }, [isLoaded]);

  const resolveViewportRadiusKm = useCallback((mapInstance: google.maps.Map | null, fallbackCenter: MapCenter) => {
    const bounds = mapInstance?.getBounds();
    if (!bounds) {
      return MAP_SEARCH_RADIUS_KM;
    }

    const boundsCenter = mapInstance?.getCenter();
    const nextCenter = boundsCenter
      ? { lat: boundsCenter.lat(), lng: boundsCenter.lng() }
      : fallbackCenter;
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    return normalizeMapRadiusKm(Math.max(
      kmBetween(nextCenter, { lat: northEast.lat(), lng: northEast.lng() }),
      kmBetween(nextCenter, { lat: southWest.lat(), lng: southWest.lng() }),
    ));
  }, [kmBetween]);

  const requestMapLocation = useCallback(() => {
    if (locationRequestRef.current) return locationRequestRef.current;
    setRequestingLocation(true);
    setLocationRequestError(null);
    const request = requestLocation().finally(() => {
      locationRequestRef.current = null;
      setRequestingLocation(false);
    });
    locationRequestRef.current = request;
    return request;
  }, [requestLocation]);

  const loadMapData = useCallback(async (
    nextCenter: MapCenter,
    nextRadiusKm?: number,
    target: MapSearchTarget = searchTarget,
  ) => {
    const requestId = ++loadRequestRef.current;
    pendingLoadRequestRef.current = requestId;
    const distanceLimit = target === 'events' ? maxDistance : target === 'organizations'
      ? organizationFilters.maxDistance : target === 'rentals' ? rentalFilters.maxDistance : null;
    const viewportRadius = normalizeMapRadiusKm(nextRadiusKm);
    const mapSearchRadiusKm = typeof distanceLimit === 'number' ? Math.min(distanceLimit, viewportRadius) : viewportRadius;
    lastLoadedFiltersRef.current = target === searchTarget ? targetFiltersKey : null;
    setLoading(true);
    setError(null);
    setEvents([]);
    setOrganizations([]);
    setRentals([]);
    setTeamListings([]);
    setSelected(null);
    try {
      const [nearbyEvents, orgs] = await Promise.all([
        target === 'events'
          ? eventService.getEventsPaginated({
              userLocation: nextCenter,
              query: embeddedSearchQuery || undefined,
              maxDistance: mapSearchRadiusKm,
              dateFrom: eventDateRange.dateFrom,
              dateTo: eventDateRange.dateTo,
              tags: selectedTags.length > 0 ? selectedTags : undefined,
              sports: selectedSports.length > 0 ? selectedSports : undefined,
              eventTypes: selectedEventTypes.length === eventTypeOptions.length ? undefined : selectedEventTypes,
              divisionGenders: divisionFilters.genders.length ? divisionFilters.genders as Array<'M' | 'F' | 'C'> : undefined,
              skillDivisionTypeIds: divisionFilters.skillDivisionTypeIds.length ? divisionFilters.skillDivisionTypeIds : undefined,
              ageDivisionTypeIds: divisionFilters.ageDivisionTypeIds.length ? divisionFilters.ageDivisionTypeIds : undefined,
              priceMin: divisionFilters.priceMinDollars === null ? undefined : Math.round(divisionFilters.priceMinDollars * 100),
              priceMax: divisionFilters.priceMaxDollars === null ? undefined : Math.round(divisionFilters.priceMaxDollars * 100),
            }, 100, 0, 'NEAREST')
          : Promise.resolve([]),
        target === 'events'
          ? Promise.resolve([])
          : organizationService.listOrganizationsInArea({
              area: { lat: nextCenter.lat, lng: nextCenter.lng, radiusKm: mapSearchRadiusKm },
              includeAffiliateRentals: target === 'rentals',
              hydrateRelations: target === 'rentals' || target === 'teams',
              ...(target === 'organizations' ? {
                query: embeddedSearchQuery || undefined,
                tagSlugs: organizationFilters.selectedTags,
                sports: selectedSports,
                divisionGenders: organizationFilters.divisionFilters.genders,
                skillDivisionTypeIds: organizationFilters.divisionFilters.skillDivisionTypeIds,
                ageDivisionTypeIds: organizationFilters.divisionFilters.ageDivisionTypeIds,
                divisionPriceMin: organizationFilters.divisionFilters.priceMinDollars === null
                  ? undefined : Math.round(organizationFilters.divisionFilters.priceMinDollars * 100),
                divisionPriceMax: organizationFilters.divisionFilters.priceMaxDollars === null
                  ? undefined : Math.round(organizationFilters.divisionFilters.priceMaxDollars * 100),
              } : {}),
            }),
      ]);
      if (requestId !== loadRequestRef.current) return;

      const orgsWithDistance = orgs
        .flatMap((organization) => {
          const coordinates = getOrgCoordinates(organization);
          return coordinates ? [{ organization, coordinates, distanceKm: kmBetween(nextCenter, coordinates) }] : [];
        })
        .filter((entry) => entry.distanceKm <= mapSearchRadiusKm)
        .sort((left, right) => left.distanceKm - right.distanceKm);

      const referenceDate = new Date();
      const rentalRows: RentalMapListing[] = [];
      (target === 'rentals' ? orgs : []).forEach((organization) => {
        const orgCoordinates = getOrgCoordinates(organization);
        (organization.facilities ?? []).forEach((facility) => {
          const affiliateUrl = normalizeExternalHttpUrl(facility.affiliateUrl);
          if (!affiliateUrl) return;
          if (String(facility.status ?? 'ACTIVE').trim().toUpperCase() !== 'ACTIVE') return;
          const facilityCoordinates = getFacilityCoordinates(facility) ?? orgCoordinates;
          if (!facilityCoordinates) return;
          const distanceKm = kmBetween(nextCenter, facilityCoordinates);
          if (distanceKm > mapSearchRadiusKm) return;
          rentalRows.push({
            kind: 'affiliateFacility',
            organization,
            facility,
            nextOccurrence: referenceDate,
            coordinates: facilityCoordinates,
            distanceKm,
          });
        });
        (organization.fields ?? []).forEach((field) => {
          const fieldCoordinates = getFieldCoordinates(field) ?? orgCoordinates;
          if (!fieldCoordinates) return;
          (field.rentalSlots ?? []).forEach((slot) => {
            const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
            if (!nextOccurrence) return;
            const distanceKm = kmBetween(nextCenter, fieldCoordinates);
            if (distanceKm > mapSearchRadiusKm) return;
            rentalRows.push({
              kind: 'slot',
              organization,
              field,
              slot,
              nextOccurrence,
              coordinates: fieldCoordinates,
              distanceKm,
            });
          });
        });
      });

      setEvents(nearbyEvents.filter((event) => Boolean(getEventCoordinates(event))));
      setOrganizations(orgsWithDistance.map((entry) => entry.organization));
      setRentals(rentalRows.sort((left, right) => (left.distanceKm ?? 0) - (right.distanceKm ?? 0)));
      const teamRows = target === 'teams' ? orgsWithDistance.flatMap(({ organization, coordinates }) => (
        (organization.teams ?? []).filter((team) => team.openRegistration === true).map((team) => ({
          team: { ...team, organizationId: organization.$id },
          organization,
          coordinates,
        }))
      )) : [];
      setTeamListings(teamRows);
      setSearchedCenter(nextCenter);
      setIsSearchAreaDirty(false);
      setSelected(null);
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Failed to load discover map data:', loadError);
      setError('Failed to load nearby map results. Please try again.');
    } finally {
      if (requestId === loadRequestRef.current) {
        pendingLoadRequestRef.current = null;
        setLoading(false);
      }
    }
  }, [
    embeddedSearchQuery,
    eventDateRange.dateFrom,
    eventDateRange.dateTo,
    kmBetween,
    maxDistance,
    searchTarget,
    selectedSports,
    selectedTags,
    selectedEventTypes,
    eventTypeOptions.length,
    divisionFilters,
    organizationFilters,
    rentalFilters.maxDistance,
    targetFiltersKey,
  ]);

  useEffect(() => {
    latestLoadMapDataRef.current = loadMapData;
  }, [loadMapData]);

  useEffect(() => {
    if (!opened) {
      initialMapLoadKeyRef.current = null;
      lastLoadedFiltersRef.current = null;
      openingTargetRef.current = null;
      loadRequestRef.current += 1;
      pendingLoadRequestRef.current = null;
      mapSettledOnceRef.current = false;
      setIsSearchAreaDirty(false);
      setMobileSearchOpen(false);
      setMobileFiltersOpen(false);
      return;
    }
    if (initialMapLoadKeyRef.current === null) {
      openingTargetRef.current = activeTab;
      setSearchTarget(activeTab);
    }
    if (location) {
      const locationLoadKey = `location:${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
      if (initialMapLoadKeyRef.current === locationLoadKey) {
        return;
      }
      initialMapLoadKeyRef.current = locationLoadKey;
      mapSettledOnceRef.current = false;
      setIsSearchAreaDirty(false);
      setCenter(location);
      setSearchedCenter(null);
      setViewportRadiusKm(MAP_SEARCH_RADIUS_KM);
      setMapZoom(DEFAULT_MAP_ZOOM);
      setSelected(null);
      setEvents([]);
      setOrganizations([]);
      setRentals([]);
      setError(null);
      setLoading(false);
      void latestLoadMapDataRef.current(location, MAP_SEARCH_RADIUS_KM, openingTargetRef.current ?? undefined);
      return;
    }
    if (initialMapLoadKeyRef.current !== null) {
      initialMapLoadKeyRef.current = 'fallback';
      return;
    }

    let cancelled = false;
    let fallbackStarted = false;
    const loadFallback = () => {
      if (cancelled || fallbackStarted) {
        return;
      }
      fallbackStarted = true;
      initialMapLoadKeyRef.current = 'fallback';
      setIsSearchAreaDirty(false);
      void latestLoadMapDataRef.current(DEFAULT_CENTER, MAP_SEARCH_RADIUS_KM, openingTargetRef.current ?? activeTab);
    };
    setCenter(DEFAULT_CENTER);
    setSearchedCenter(null);
    setViewportRadiusKm(MAP_SEARCH_RADIUS_KM);
    setMapZoom(DEFAULT_MAP_ZOOM);
    setIsSearchAreaDirty(false);
    mapSettledOnceRef.current = false;
    setSelected(null);
    setEvents([]);
    setOrganizations([]);
    setRentals([]);
    setError(null);
    setLoading(false);

    void requestMapLocation().catch(loadFallback);

    const fallbackTimer = window.setTimeout(() => {
      loadFallback();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [activeTab, location, opened, requestMapLocation]);

  useEffect(() => {
    if (!embedded || !opened || searchTarget === activeTab) return;
    setSearchTarget(activeTab);
    setSelected(null);
  }, [activeTab, embedded, opened, searchTarget]);

  useEffect(() => {
    if (!opened || !initialMapLoadKeyRef.current) return;
    if (embedded && searchTarget !== activeTab) return;
    if (openingTargetRef.current) {
      if (searchTarget !== openingTargetRef.current) return;
      openingTargetRef.current = null;
      lastLoadedFiltersRef.current = targetFiltersKey;
    }
    if (lastLoadedFiltersRef.current === targetFiltersKey) return;
    void loadMapData(center, viewportRadiusKm);
  }, [activeTab, center, embedded, loadMapData, opened, searchTarget, targetFiltersKey, viewportRadiusKm]);

  useEffect(() => () => { loadRequestRef.current += 1; }, []);

  const updateViewportRadius = useCallback((nextRadiusKm: number) => {
    setViewportRadiusKm((current) => (
      Math.abs(current - nextRadiusKm) < VIEWPORT_RADIUS_EPSILON_KM ? current : nextRadiusKm
    ));
  }, []);

  const syncMapZoom = useCallback((mapInstance: google.maps.Map | null) => {
    const nextZoom = mapInstance?.getZoom();
    if (typeof nextZoom !== 'number' || !Number.isFinite(nextZoom)) {
      return;
    }
    setMapZoom((current) => (current === nextZoom ? current : nextZoom));
  }, []);

  const handleMapIdle = useCallback(() => {
    const nextCenter = map?.getCenter();
    if (!nextCenter) return;
    const nextMapCenter = { lat: nextCenter.lat(), lng: nextCenter.lng() };
    const nextRadiusKm = resolveViewportRadiusKm(map, nextMapCenter);
    setCenter((current) => (mapCentersAreClose(current, nextMapCenter) ? current : nextMapCenter));
    updateViewportRadius(nextRadiusKm);
    syncMapZoom(map);
    mapSettledOnceRef.current = true;
  }, [map, resolveViewportRadiusKm, syncMapZoom, updateViewportRadius]);

  const handleMapDragEnd = useCallback(() => {
    setIsSearchAreaDirty(true);
  }, []);

  const handleMapZoomChanged = useCallback(() => {
    if (mapSettledOnceRef.current) {
      setIsSearchAreaDirty(true);
    }
  }, []);

  const handleMapLoad = useCallback((nextMap: google.maps.Map) => {
    setMap(nextMap);
    syncMapZoom(nextMap);
    updateViewportRadius(resolveViewportRadiusKm(nextMap, center));
  }, [center, resolveViewportRadiusKm, syncMapZoom, updateViewportRadius]);

  const handleMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const handleSearchAreaClick = useCallback(() => {
    if (pendingLoadRequestRef.current !== null) return;
    void loadMapData(center, viewportRadiusKm);
  }, [center, loadMapData, viewportRadiusKm]);

  const showSearchArea = isSearchAreaDirty;

  const visibleEvents = useMemo(() => searchTarget === 'events' ? filterLoadedEvents(events, {
    searchTerm: embeddedSearchQuery,
    selectedEventTypes,
    eventTypeOptions,
    selectedSports,
    selectedTags,
    selectedStartDate: new Date(eventDateRange.dateFrom),
    selectedEndDate,
    divisionFilters,
    location: searchedCenter ?? center,
    maxDistance,
    hideWeeklyChildren: false,
    getEventDistanceKm: (event) => {
      const coordinates = getEventCoordinates(event);
      return coordinates ? kmBetween(searchedCenter ?? center, coordinates) : undefined;
    },
  }) : [], [
    center, divisionFilters, embeddedSearchQuery, eventDateRange.dateFrom, events, eventTypeOptions, kmBetween, maxDistance,
    searchedCenter, searchTarget, selectedEndDate, selectedEventTypes, selectedSports, selectedTags,
  ]);
  const visibleOrganizations = useMemo(() => {
    if (searchTarget !== 'organizations') return [];
    return embeddedSearchQuery
      ? organizations.filter((organization) => matchesOrganizationSearch(organization, embeddedSearchQuery))
      : organizations;
  }, [embeddedSearchQuery, organizations, searchTarget]);
  const visibleRentals = useMemo(() => searchTarget === 'rentals' ? rentals.filter((rental) => {
    if (!matchesRentalSearch(rental, embeddedSearchQuery)) return false;
    if (!rentalResourceMatchesSports(rental, selectedSports)) return false;
    if (typeof rentalFilters.maxDistance === 'number' && (rental.distanceKm ?? Infinity) > rentalFilters.maxDistance) return false;
    if (rental.kind !== 'slot') return true;
    const hour = rental.nextOccurrence.getHours() + rental.nextOccurrence.getMinutes() / 60;
    return hour >= rentalFilters.timeRange[0] && hour < rentalFilters.timeRange[1];
  }) : [], [embeddedSearchQuery, rentalFilters.maxDistance, rentalFilters.timeRange, rentals, searchTarget, selectedSports]);
  const visibleTeams = useMemo(() => {
    if (searchTarget !== 'teams') return [];
    const matching = new Set(filterOpenRegistrationTeams(teamListings.map((listing) => listing.team), {
      selectedSports: teamFilters.selectedSports,
      selectedDivisionTypeValues: teamFilters.selectedDivisionTypeValues,
      divisionTypeOptions: teamDivisionOptions,
    }));
    return teamListings.filter((listing) => matching.has(listing.team) && matchesTeamSearch(listing, embeddedSearchQuery));
  }, [embeddedSearchQuery, searchTarget, teamDivisionOptions, teamFilters.selectedDivisionTypeValues, teamFilters.selectedSports, teamListings]);
  const eventMarkerGroups = useMemo(
    () => buildMapMarkerGroups(visibleEvents, mapZoom, (event) => event.$id, getEventCoordinates),
    [mapZoom, visibleEvents],
  );
  const organizationMarkerGroups = useMemo(
    () => buildMapMarkerGroups(
      visibleOrganizations,
      mapZoom,
      (organization) => organization.$id,
      getOrgCoordinates,
    ),
    [mapZoom, visibleOrganizations],
  );
  const rentalMarkerGroups = useMemo(
    () => buildMapMarkerGroups(
      visibleRentals,
      mapZoom,
      getRentalListingId,
      (rental) => rental.coordinates,
    ),
    [mapZoom, visibleRentals],
  );
  const teamMarkerGroups = useMemo(() => buildMapMarkerGroups(
    visibleTeams, mapZoom, (listing) => listing.team.$id, (listing) => listing.coordinates,
  ), [mapZoom, visibleTeams]);

  const activeResultCount = searchTarget === 'events'
    ? visibleEvents.length
    : searchTarget === 'organizations'
      ? visibleOrganizations.length
      : searchTarget === 'rentals' ? visibleRentals.length : visibleTeams.length;

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    const results: SearchResult[] = [];

    if (searchTarget === 'events') {
      visibleEvents.forEach((event) => {
        const coordinates = getEventCoordinates(event);
        if (!coordinates) return;
        const text = `${event.name} ${event.location} ${event.description ?? ''}`.toLowerCase();
        if (text.includes(query)) {
          results.push({
            type: 'event' as const,
            id: event.$id,
            label: event.name,
            description: event.location,
            coordinates,
            event,
          });
        }
      });
      return results;
    }

    if (searchTarget === 'organizations') {
      visibleOrganizations.forEach((organization) => {
        const coordinates = getOrgCoordinates(organization);
        if (!coordinates) return;
        if (matchesOrganizationSearch(organization, query)) {
          results.push({
            type: 'organization' as const,
            id: organization.$id,
            label: organization.name,
            description: organization.location ?? 'Organization',
            coordinates,
            organization,
          });
        }
      });
      return results;
    }

    if (searchTarget === 'teams') {
      visibleTeams.forEach((listing) => {
        const { team, organization, coordinates } = listing;
        if (!matchesTeamSearch(listing, query)) return;
        results.push({
          type: 'team', id: team.$id, label: team.name,
          description: `Organization location: ${organization.name}`, coordinates, listing,
        });
      });
      return results;
    }

    visibleRentals.forEach((rental) => {
      const rentalName = getRentalListingName(rental);
      if (matchesRentalSearch(rental, query)) {
        results.push({
          type: 'rental' as const,
          id: getRentalListingId(rental),
          label: rentalName,
          description: rental.organization.name,
          coordinates: rental.coordinates,
          rental,
        });
      }
    });
    return results;
  }, [searchTarget, searchTerm, visibleEvents, visibleOrganizations, visibleRentals, visibleTeams]);

  const handleSearchTargetChange = useCallback((value: string | null) => {
    const nextTarget = SEARCH_TARGETS.find((target) => (
      target.value === value || target.label === value
    ))?.value ?? 'events';
    if (nextTarget === searchTarget) return;
    setSearchTarget(nextTarget);
    setSelected(null);
  }, [searchTarget]);

  const focusResult = useCallback((result: SearchResult) => {
    map?.panTo(result.coordinates);
    const nextZoom = Math.max(map?.getZoom() ?? DEFAULT_MAP_ZOOM, 13);
    map?.setZoom(nextZoom);
    setMapZoom(nextZoom);
    setCenter(result.coordinates);
    setSelected({ type: result.type, id: result.id });
  }, [map]);

  const handleSearchSubmit = useCallback(() => {
    if (searchResults.length > 0) {
      focusResult(searchResults[0]);
    }
  }, [focusResult, searchResults]);


  const resetEventFilters = useCallback(() => {
    setSelectedSports([]);
    setSelectedTags([]);
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setSelectedEventTypes([...eventTypeOptions]);
    setDivisionFilters(EMPTY_DISCOVERY_DIVISION_FILTERS);
    setMaxDistance(null);
  }, [
    setSelectedEndDate,
    setSelectedSports,
    setSelectedTags,
    setSelectedStartDate,
    setSelectedEventTypes,
    eventTypeOptions,
    setDivisionFilters,
    setMaxDistance,
  ]);
  const activeEventFilterCount = selectedSports.length + selectedTags.length
    + Number(Boolean(selectedStartDate)) + Number(Boolean(selectedEndDate))
    + Number(selectedEventTypes.length !== eventTypeOptions.length)
    + Number(hasDiscoveryDivisionFilters(divisionFilters))
    + Number(typeof maxDistance === 'number');
  const resetTabFilters = () => {
    if (searchTarget === 'teams') {
      teamFilters.setSelectedSports([]);
      teamFilters.setSelectedDivisionTypeValues([]);
      return;
    }
    setSelectedSports([]);
    if (searchTarget === 'organizations') {
      organizationFilters.setSelectedTags([]);
      organizationFilters.setDivisionFilters(EMPTY_DISCOVERY_DIVISION_FILTERS);
      organizationFilters.setMaxDistance(null);
    } else {
      rentalFilters.setTimeRange(rentalFilters.defaultTimeRange);
      rentalFilters.setMaxDistance(null);
    }
  };
  const activeTabFilterCount = searchTarget === 'teams'
    ? teamFilters.selectedSports.length + teamFilters.selectedDivisionTypeValues.length
    : selectedSports.length + (searchTarget === 'organizations'
      ? organizationFilters.selectedTags.length
        + Number(hasDiscoveryDivisionFilters(organizationFilters.divisionFilters))
        + Number(typeof organizationFilters.maxDistance === 'number')
      : Number(rentalFilters.timeRange.some((hour, index) => hour !== rentalFilters.defaultTimeRange[index]))
        + Number(typeof rentalFilters.maxDistance === 'number'));

  const selectedEvent = selected?.type === 'event'
    ? visibleEvents.find((event) => event.$id === selected.id) ?? null
    : null;
  const selectedEventGroup = selected?.type === 'eventGroup'
    ? {
        position: selected.position,
        events: selected.ids
          .map((id) => visibleEvents.find((event) => event.$id === id) ?? null)
          .filter((event): event is Event => Boolean(event)),
      }
    : null;
  const selectedOrganizationGroup = selected?.type === 'organizationGroup'
    ? {
        position: selected.position,
        organizations: selected.ids
          .map((id) => visibleOrganizations.find((organization) => organization.$id === id) ?? null)
          .filter((organization): organization is Organization => Boolean(organization)),
      }
    : null;
  const selectedOrganization = selected?.type === 'organization'
    ? visibleOrganizations.find((organization) => organization.$id === selected.id) ?? null
    : null;
  const selectedRentalGroup = selected?.type === 'rentalGroup'
    ? {
        position: selected.position,
        rentals: selected.ids
          .map((id) => visibleRentals.find((rental) => getRentalListingId(rental) === id) ?? null)
          .filter((rental): rental is RentalMapListing => Boolean(rental)),
      }
    : null;
  const selectedRental = selected?.type === 'rental'
    ? visibleRentals.find((rental) => getRentalListingId(rental) === selected.id) ?? null
    : null;
  const selectedTeam = selected?.type === 'team'
    ? visibleTeams.find((listing) => listing.team.$id === selected.id) ?? null : null;
  const selectedTeamGroup = selected?.type === 'teamGroup'
    ? visibleTeams.filter((listing) => selected.ids.includes(listing.team.$id)) : [];

  const hasMapSelection = Boolean(selectedEvent || selectedOrganization || selectedRental
    || selectedEventGroup?.events.length || selectedOrganizationGroup?.organizations.length
    || selectedRentalGroup?.rentals.length || selectedTeam || selectedTeamGroup.length);
  const showResultRail = !hasMapSelection && activeResultCount > 0;
  const selectedEventSummary = selectedEvent ? getEventSummary(selectedEvent) : null;
  const locationLabel = locationInfo?.formattedAddress?.trim()
    || [locationInfo?.city, locationInfo?.state].filter(Boolean).join(', ')
    || (location ? 'Your location' : 'Map area');
  const distanceOrigin = location ?? searchedCenter ?? center;
  const distanceLabel = (coordinates: MapCenter | null): string | null => (
    coordinates ? `${kmToMiles(kmBetween(distanceOrigin, coordinates)).toFixed(1)} mi` : null
  );
  const selectEvent = (event: Event) => {
    const coordinates = getEventCoordinates(event);
    if (coordinates) {
      focusResult({ type: 'event', id: event.$id, label: event.name, description: event.location, coordinates, event });
    }
  };
  const selectOrganization = (organization: Organization) => {
    const coordinates = getOrgCoordinates(organization);
    if (coordinates) {
      focusResult({
        type: 'organization',
        id: organization.$id,
        label: organization.name,
        description: organization.location ?? 'Organization',
        coordinates,
        organization,
      });
    }
  };
  const selectRental = (rental: RentalMapListing) => {
    focusResult({
      type: 'rental',
      id: getRentalListingId(rental),
      label: getRentalListingName(rental),
      description: rental.organization.name,
      coordinates: rental.coordinates,
      rental,
    });
  };
  const selectTeam = (listing: TeamMapListing) => {
    focusResult({
      type: 'team', id: listing.team.$id, label: listing.team.name,
      description: `Organization location: ${listing.organization.name}`, coordinates: listing.coordinates, listing,
    });
  };

  useEffect(() => {
    if (selected) {
      selectionCardRef.current?.focus({ preventScroll: !embedded });
    } else {
      const previous = previousSelectionRef.current;
      if (previous) {
        const buttons = resultRailRef.current?.querySelectorAll<HTMLButtonElement>('[data-map-result-id]');
        const row = Array.from(buttons ?? []).find((button) => (
          'id' in previous
            ? button.dataset.mapResultId === previous.id
            : previous.ids.includes(button.dataset.mapResultId ?? '')
        ));
        row?.focus({ preventScroll: !embedded });
      }
    }
    previousSelectionRef.current = selected;
  }, [embedded, selected]);

  return (
    <Modal
      opened={opened}
      embedded={embedded}
      onClose={onClose}
      title={<span className="discover-map-title">Discover map</span>}
      size="xl"
      styles={{
        body: { padding: 0, flex: 1, minHeight: 0, overflowY: embedded ? 'auto' : undefined },
        content: {
          width: embedded ? '100%' : 'calc(100vw - 2rem)',
          maxWidth: embedded ? 'none' : 1275,
          height: embedded ? '100%' : 'min(930px, calc(100dvh - 2rem))',
          padding: 0,
          gap: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <div className="discover-map-shell" data-embedded={embedded || undefined}>
        {/* Retry the shared script loader without remounting the modal or reloading its results. */}
        <DiscoverMapScriptLoader
          key={mapLoadAttempt}
          googleMapsApiKey={googleMapsApiKey}
          onStateChange={setMapLoadState}
        />
        <div className="discover-map-tabs" role="tablist" aria-label="Map categories">
          {SEARCH_TARGETS.map((target) => (
            <button
              key={target.value}
              id={`discover-map-tab-${target.value}`}
              type="button"
              role="tab"
              aria-selected={searchTarget === target.value}
              aria-controls="discover-map-workspace"
              tabIndex={searchTarget === target.value ? 0 : -1}
              onClick={() => handleSearchTargetChange(target.value)}
              onKeyDown={(event) => {
                const index = SEARCH_TARGETS.findIndex((item) => item.value === target.value);
                const nextIndex = event.key === 'ArrowRight' ? (index + 1) % SEARCH_TARGETS.length
                  : event.key === 'ArrowLeft' ? (index + SEARCH_TARGETS.length - 1) % SEARCH_TARGETS.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? SEARCH_TARGETS.length - 1 : null;
                if (nextIndex === null) return;
                event.preventDefault();
                const nextTarget = SEARCH_TARGETS[nextIndex];
                handleSearchTargetChange(nextTarget.value);
                document.getElementById(`discover-map-tab-${nextTarget.value}`)?.focus();
              }}
            >
              {target.label}
            </button>
          ))}
        </div>

        <div className="discover-map-chrome">
          <div className="discover-map-search-shell" data-mobile-expanded={mobileSearchOpen}>
            <div id="discover-map-search-controls">
              <div className="discover-map-search-row">
                <form
                  className="discover-map-search-field"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSearchSubmit();
                  }}
                >
                  <button type="submit" aria-label="Search" className="discover-map-search-submit">
                    <Search size={20} aria-hidden="true" />
                  </button>
                  <input
                    aria-label="Map search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.currentTarget.value)}
                    placeholder="Search this map"
                    autoComplete="off"
                  />
                  <span className="discover-map-location" title={locationLabel}>
                    <MapPin size={17} aria-hidden="true" />
                    <span>{locationLabel}</span>
                    {(!location || clearLocation) && (
                      <button
                        type="button"
                        className="discover-map-location-action"
                        aria-label={location ? 'Clear location' : 'Use current location'}
                        title={location ? 'Clear location' : 'Use current location'}
                        aria-busy={requestingLocation}
                        disabled={requestingLocation}
                        onClick={() => {
                          if (location) {
                            setLocationRequestError(null);
                            clearLocation?.();
                            return;
                          }
                          void requestMapLocation().catch(() => {
                            setLocationRequestError('Unable to use your current location. Please try again.');
                          });
                        }}
                      >
                        {requestingLocation ? <Loader size="sm" /> : location ? <X size={18} aria-hidden="true" /> : <Navigation size={18} aria-hidden="true" />}
                      </button>
                    )}
                  </span>
                </form>
                <span className="discover-map-result-count" role="status">
                  {activeResultCount} {activeResultCount === 1 ? MARKER_STYLES[searchTarget].singular : searchTarget} found
                </span>
              </div>
              {searchTerm.trim() && (
                <ScrollArea.Autosize mah={180} className="discover-map-search-results">
                  {searchResults.length > 0 ? (
                    searchResults.slice(0, 8).map((result) => (
                      <button
                        key={`${result.type}:${result.id}`}
                        type="button"
                        onClick={() => focusResult(result)}
                        className="discover-map-search-result"
                      >
                        <span>{result.label}</span>
                        <small>{result.description}</small>
                      </button>
                    ))
                  ) : (
                    <Text size="sm" c="dimmed" className="px-3" py={10}>
                      No nearby {searchTarget} match this search.
                    </Text>
                  )}
                </ScrollArea.Autosize>
              )}
            </div>
            <ActionIcon
              variant="default"
              size="lg"
              radius="xl"
              className="discover-map-search-toggle"
              aria-label={mobileSearchOpen ? 'Hide map search' : 'Show map search'}
              aria-controls="discover-map-search-controls"
              aria-expanded={mobileSearchOpen}
              onClick={() => setMobileSearchOpen((current) => !current)}
            >
              {mobileSearchOpen ? <X size={20} /> : <Search size={20} />}
            </ActionIcon>
          </div>

          <div className="discover-map-filter-shell" data-mobile-expanded={mobileFiltersOpen}>
            <div id="discover-map-filter-controls" className="discover-map-filter-scroll">
              {searchTarget === 'events' ? (
                <DiscoverFilterBar
                  key="events"
                  location={center}
                  sports={sports}
                  selectedSports={selectedSports}
                  setSelectedSports={setSelectedSports}
                  sportsLoading={sportsLoading}
                  sportsError={sportsError}
                  selectedEventTypes={selectedEventTypes}
                  setSelectedEventTypes={setSelectedEventTypes}
                  eventTypeOptions={eventTypeOptions}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                  eventTags={eventTags}
                  eventTagsLoading={eventTagsLoading}
                  eventTagsError={eventTagsError}
                  selectedStartDate={selectedStartDate}
                  setSelectedStartDate={setSelectedStartDate}
                  selectedEndDate={selectedEndDate}
                  setSelectedEndDate={setSelectedEndDate}
                  divisionFilters={divisionFilters}
                  setDivisionFilters={setDivisionFilters}
                  divisionOptions={divisionOptions}
                  maxDistance={maxDistance}
                  setMaxDistance={setMaxDistance}
                  defaultMaxDistance={defaultMaxDistance}
                  activeFilterCount={activeEventFilterCount}
                  resetFilters={resetEventFilters}
                />
              ) : (
                <DiscoverTabFilterBar
                  key={searchTarget}
                  {...(searchTarget === 'organizations'
                    ? { target: 'organizations', filters: organizationFilters } as const
                    : searchTarget === 'rentals'
                      ? { target: 'rentals', filters: rentalFilters } as const
                      : { target: 'teams', filters: { ...teamFilters, divisionTypeOptions: teamDivisionOptions } } as const)}
                  location={center}
                  defaultMaxDistance={defaultMaxDistance}
                  sports={sports}
                  selectedSports={searchTarget === 'teams' ? teamFilters.selectedSports : selectedSports}
                  setSelectedSports={searchTarget === 'teams' ? teamFilters.setSelectedSports : setSelectedSports}
                  sportsLoading={sportsLoading}
                  sportsError={sportsError}
                  activeFilterCount={activeTabFilterCount}
                  resetFilters={resetTabFilters}
                />
              )}
            </div>
              <ActionIcon
                variant="default"
                size="lg"
                radius="xl"
                className="discover-map-filter-toggle"
                aria-label={mobileFiltersOpen ? 'Hide map filters' : 'Show map filters'}
                aria-controls="discover-map-filter-controls"
                aria-expanded={mobileFiltersOpen}
                onClick={() => setMobileFiltersOpen((current) => !current)}
              >
                {mobileFiltersOpen ? <X size={20} /> : <ChevronDown size={20} />}
              </ActionIcon>
            </div>
        </div>

        <div
          id="discover-map-workspace"
          role="tabpanel"
          aria-labelledby={`discover-map-tab-${searchTarget}`}
          className={`discover-map-workspace${showResultRail ? ' discover-map-workspace--split' : ''}`}
          style={embedded ? {
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridTemplateRows: showResultRail ? 'minmax(20rem, 1fr) 10rem' : 'minmax(20rem, 1fr)',
            minHeight: showResultRail ? '30rem' : '20rem',
          } : undefined}
        >
          <div className="discover-map-canvas">
            {isLoaded && googleMapsApiKey ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={center}
                zoom={DEFAULT_MAP_ZOOM}
                onLoad={handleMapLoad}
                onUnmount={handleMapUnmount}
                onDragEnd={handleMapDragEnd}
                onIdle={handleMapIdle}
                onZoomChanged={handleMapZoomChanged}
                options={{
                  ...GOOGLE_MAP_OPTIONS_WITH_MAP_ID,
                  clickableIcons: false,
                  mapTypeControl: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                }}
              >
                {location && (
                  <Fragment>
                    <OverlayViewF
                      position={location}
                      mapPaneName={OVERLAY_LAYER}
                      getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -(height / 2) })}
                    >
                      <span className="discover-map-user-halo" aria-hidden="true" />
                    </OverlayViewF>
                    <MarkerF
                      position={location}
                      title="Your location"
                      icon={userLocationIcon}
                      zIndex={1000}
                    />
                  </Fragment>
                )}
                {eventMarkerGroups.map((eventGroup) => {
                  if (eventGroup.items.length === 1) {
                    const event = eventGroup.items[0];
                    const markerId = event.$id;
                    return (
                      <MapEntityMarker
                        key={`event-${markerId}`}
                        position={eventGroup.position}
                        title={event.name}
                        markerStyle={MARKER_STYLES.events}
                        initials={MARKER_STYLES.events.shortLabel}
                        dot
                        selected={selectedEvent?.$id === markerId}
                        zIndex={selectedEvent?.$id === markerId ? 50 : 30}
                        clickTargetIcon={markerClickTargetIcon}
                        onClick={() => setSelected({ type: 'event', id: markerId })}
                      />
                    );
                  }
                  const eventIds = eventGroup.items.map((event) => event.$id);
                  return (
                    <MapClusterMarker
                      key={`event-group-${eventGroup.id}`}
                      position={eventGroup.position}
                      title={`${eventGroup.items.length} events`}
                      markerStyle={MARKER_STYLES.events}
                      count={eventGroup.items.length}
                      zIndex={40}
                      clickTargetIcon={markerClickTargetIcon}
                      onClick={() => setSelected({ type: 'eventGroup', ids: eventIds, position: eventGroup.position })}
                    />
                  );
                })}
                {organizationMarkerGroups.map((organizationGroup) => {
                  if (organizationGroup.items.length === 1) {
                    const organization = organizationGroup.items[0];
                    return (
                      <MapEntityMarker
                        key={`org-${organization.$id}`}
                        position={organizationGroup.position}
                        title={organization.name}
                        markerStyle={MARKER_STYLES.organizations}
                        initials={getInitials(organization.name, MARKER_STYLES.organizations.shortLabel)}
                        imageUrl={getOrganizationAvatarUrl(organization, 64)}
                        zIndex={20}
                        clickTargetIcon={markerClickTargetIcon}
                        onClick={() => setSelected({ type: 'organization', id: organization.$id })}
                      />
                    );
                  }
                  const organizationIds = organizationGroup.items.map((organization) => organization.$id);
                  return (
                    <MapClusterMarker
                      key={`organization-group-${organizationGroup.id}`}
                      position={organizationGroup.position}
                      title={`${organizationGroup.items.length} organizations`}
                      markerStyle={MARKER_STYLES.organizations}
                      count={organizationGroup.items.length}
                      zIndex={30}
                      clickTargetIcon={markerClickTargetIcon}
                      onClick={() => setSelected({
                        type: 'organizationGroup',
                        ids: organizationIds,
                        position: organizationGroup.position,
                      })}
                    />
                  );
                })}
                {rentalMarkerGroups.map((rentalGroup) => {
                  if (rentalGroup.items.length === 1) {
                    const rental = rentalGroup.items[0];
                    const id = getRentalListingId(rental);
                    const rentalName = getRentalListingName(rental);
                    return (
                      <MapEntityMarker
                        key={`rental-${id}`}
                        position={rentalGroup.position}
                        title={rentalName}
                        markerStyle={MARKER_STYLES.rentals}
                        initials={getInitials(rentalName, MARKER_STYLES.rentals.shortLabel)}
                        imageUrl={getOrganizationAvatarUrl(rental.organization, 64)}
                        zIndex={10}
                        clickTargetIcon={markerClickTargetIcon}
                        onClick={() => setSelected({ type: 'rental', id })}
                      />
                    );
                  }
                  const rentalIds = rentalGroup.items.map(getRentalListingId);
                  return (
                    <MapClusterMarker
                      key={`rental-group-${rentalGroup.id}`}
                      position={rentalGroup.position}
                      title={`${rentalGroup.items.length} rentals`}
                      markerStyle={MARKER_STYLES.rentals}
                      count={rentalGroup.items.length}
                      zIndex={20}
                      clickTargetIcon={markerClickTargetIcon}
                      onClick={() => setSelected({
                        type: 'rentalGroup',
                        ids: rentalIds,
                        position: rentalGroup.position,
                      })}
                    />
                  );
                })}
                {teamMarkerGroups.map((group) => {
                  if (group.items.length === 1) {
                    const listing = group.items[0];
                    return (
                      <MapEntityMarker key={`team-${listing.team.$id}`} position={group.position}
                        title={`${listing.team.name} — organization location: ${listing.organization.name}`}
                        markerStyle={MARKER_STYLES.teams} initials={getInitials(listing.team.name, 'T')}
                        imageUrl={getTeamAvatarUrl(listing.team, 64)} zIndex={20} clickTargetIcon={markerClickTargetIcon}
                        onClick={() => setSelected({ type: 'team', id: listing.team.$id })} />
                    );
                  }
                  return (
                    <MapClusterMarker key={`team-group-${group.id}`} position={group.position}
                      title={`${group.items.length} teams at organization locations`} markerStyle={MARKER_STYLES.teams}
                      count={group.items.length} zIndex={30} clickTargetIcon={markerClickTargetIcon}
                      onClick={() => setSelected({ type: 'teamGroup', ids: group.items.map((listing) => listing.team.$id), position: group.position })} />
                  );
                })}
              </GoogleMap>
            ) : (
              <div className="discover-map-placeholder">
                <Text size="sm" c="dimmed">{googleMapsApiKey && !loadError ? 'Loading map...' : 'Map unavailable'}</Text>
              </div>
            )}

            {showSearchArea && (
              <Button className="discover-map-search-area" onClick={handleSearchAreaClick} loading={loading}>
                Search this area
              </Button>
            )}

            {hasMapSelection && (
              <div
                ref={selectionCardRef}
                tabIndex={-1}
                role="region"
                aria-label={selectedEvent ? 'Selected event' : selectedOrganization ? 'Selected organization' : selectedRental ? 'Selected rental' : selectedTeam ? 'Selected team' : 'Selected map group'}
                className={`discover-map-selection${selectedEvent ? ' discover-map-selection--event' : ''}`}
              >
                <button
                  type="button"
                  className="discover-map-selection-close"
                  aria-label={selectedEvent ? 'Close selected event' : 'Close map selection'}
                  onClick={() => setSelected(null)}
                >
                  <X size={22} aria-hidden="true" />
                </button>
                {selectedEvent && (
                  <>
                    <Image
                      src={getEventMapImageUrl(selectedEvent)}
                      alt=""
                      width={360}
                      height={210}
                      unoptimized
                      className="discover-map-card-image"
                    />
                    <div className="discover-map-selection-body">
                      <h3>{selectedEvent.name}</h3>
                      <div className="discover-map-event-pills">
                        <span>{formatEnumDisplayLabel(selectedEvent.eventType, 'Event')}</span>
                        <span>{getEventSportLabel(selectedEvent)}</span>
                      </div>
                      {selectedEventSummary && <p>{selectedEventSummary}</p>}
                      <ul className="discover-map-event-meta">
                        <li><MapPin size={18} aria-hidden="true" /><span>{selectedEvent.location}</span></li>
                        <li><CalendarDays size={18} aria-hidden="true" /><span>{getEventMapDate(selectedEvent)}</span></li>
                        <li><Navigation size={18} aria-hidden="true" /><span>{distanceLabel(getEventCoordinates(selectedEvent))}</span></li>
                      </ul>
                      <button
                        type="button"
                        className="discover-map-card-action"
                        onClick={() => {
                          onClose();
                          onEventClick(selectedEvent);
                        }}
                      >
                        View event
                      </button>
                    </div>
                  </>
                )}
                {selectedEventGroup && (
                  <>
                    <h3 className="discover-map-group-title">{selectedEventGroup.events.length} events</h3>
                    <div className="discover-map-group-list">
                      {selectedEventGroup.events.map((event) => (
                        <MapEventRow
                          key={event.$id}
                          event={event}
                          distance={distanceLabel(getEventCoordinates(event))}
                          onSelect={() => selectEvent(event)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {selectedOrganizationGroup && (
                  <>
                    <h3 className="discover-map-group-title">{selectedOrganizationGroup.organizations.length} organizations</h3>
                    <div className="discover-map-group-list">
                      {selectedOrganizationGroup.organizations.map((organization) => (
                        <button
                          key={organization.$id}
                          type="button"
                          className="discover-map-group-item"
                          onClick={() => selectOrganization(organization)}
                        >
                          <strong>{organization.name}</strong>
                          <span>{organization.location ?? 'Organization'}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {selectedOrganization && (
                  <div className="discover-map-selection-body">
                    <div className="discover-map-card-header">
                      <Image
                        src={getOrganizationAvatarUrl(selectedOrganization, 96)}
                        alt=""
                        width={52}
                        height={52}
                        unoptimized
                        className="discover-map-card-avatar"
                      />
                      <h3>{selectedOrganization.name}</h3>
                    </div>
                    <p>{getOrganizationSummary(selectedOrganization)}</p>
                    <ul className="discover-map-event-meta">
                      <li><MapPin size={18} aria-hidden="true" /><span>{selectedOrganization.location ?? 'Organization'}</span></li>
                      <li><Navigation size={18} aria-hidden="true" /><span>{distanceLabel(getOrgCoordinates(selectedOrganization))}</span></li>
                    </ul>
                    <button
                      type="button"
                      className="discover-map-card-action"
                      onClick={() => {
                        onClose();
                        onOrganizationClick(selectedOrganization);
                      }}
                    >
                      View organization
                    </button>
                  </div>
                )}
                {selectedRentalGroup && (
                  <>
                    <h3 className="discover-map-group-title">{selectedRentalGroup.rentals.length} rentals</h3>
                    <div className="discover-map-group-list">
                      {selectedRentalGroup.rentals.map((rental) => (
                        <button
                          key={getRentalListingId(rental)}
                          type="button"
                          className="discover-map-group-item"
                          onClick={() => selectRental(rental)}
                        >
                          <strong>{getRentalListingName(rental)}</strong>
                          <span>{rental.organization.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {selectedRental && (
                  <div className="discover-map-selection-body">
                    <div className="discover-map-card-header">
                      <Image
                        src={getOrganizationAvatarUrl(selectedRental.organization, 96)}
                        alt=""
                        width={52}
                        height={52}
                        unoptimized
                        className="discover-map-card-avatar"
                      />
                      <h3>{getRentalListingName(selectedRental)}</h3>
                    </div>
                    <p>{getOrganizationSummary(selectedRental.organization)}</p>
                    <ul className="discover-map-event-meta">
                      <li><MapPin size={18} aria-hidden="true" /><span>{selectedRental.organization.name}</span></li>
                      <li><Navigation size={18} aria-hidden="true" /><span>{distanceLabel(selectedRental.coordinates)}</span></li>
                    </ul>
                    <button
                      type="button"
                      className="discover-map-card-action"
                      onClick={() => {
                        if (selectedRental.kind === 'affiliateFacility') {
                          const affiliateUrl = normalizeExternalHttpUrl(selectedRental.facility?.affiliateUrl);
                          if (affiliateUrl) {
                            window.open(affiliateUrl, '_blank', 'noopener,noreferrer');
                            setSelected(null);
                            return;
                          }
                        }
                        onClose();
                        onOrganizationClick(selectedRental.organization);
                      }}
                    >
                      {selectedRental.kind === 'affiliateFacility' ? 'Open booking' : 'View rentals'}
                    </button>
                  </div>
                )}
                {selectedTeam && (
                  <div className="discover-map-selection-body">
                    <div className="discover-map-card-header">
                      <Image src={getTeamAvatarUrl(selectedTeam.team, 96)} alt="" width={52} height={52} unoptimized className="discover-map-card-avatar" />
                      <h3>{selectedTeam.team.name}</h3>
                    </div>
                    <p>{selectedTeam.team.sport} · Open registration</p>
                    <ul className="discover-map-event-meta">
                      <li><MapPin size={18} aria-hidden="true" /><span>Organization location: {selectedTeam.organization.name}{selectedTeam.organization.location ? ` — ${selectedTeam.organization.location}` : ''}</span></li>
                      <li><Navigation size={18} aria-hidden="true" /><span>{distanceLabel(selectedTeam.coordinates)}</span></li>
                    </ul>
                    <button type="button" className="discover-map-card-action" onClick={() => { onClose(); onTeamClick(selectedTeam.team); }}>
                      View team
                    </button>
                  </div>
                )}
                {selectedTeamGroup.length > 0 && (
                  <>
                    <h3 className="discover-map-group-title">{selectedTeamGroup.length} teams at organization locations</h3>
                    <div className="discover-map-group-list">
                      {selectedTeamGroup.map((listing) => (
                        <button key={listing.team.$id} type="button" className="discover-map-group-item" onClick={() => selectTeam(listing)}>
                          <strong>{listing.team.name}</strong>
                          <span>Organization location: {listing.organization.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {!loading && !error && !hasMapSelection && activeResultCount === 0 && (
              <div className="discover-map-empty" role="status">
                <strong>No nearby {searchTarget} found</strong>
                <span>Move the map or change your filters to search again.</span>
              </div>
            )}
          </div>

          {showResultRail && (
            <aside
              className="discover-map-results"
              aria-labelledby="discover-map-results-title"
              style={embedded ? { borderLeft: 0, borderTop: '1px solid var(--discover-border)' } : undefined}
            >
              <h3 id="discover-map-results-title">Nearby {searchTarget}</h3>
              <div ref={resultRailRef} className="discover-map-results-scroll">
                {searchTarget === 'events' && visibleEvents.map((event) => (
                  <MapEventRow
                    key={event.$id}
                    event={event}
                    distance={distanceLabel(getEventCoordinates(event))}
                    onSelect={() => selectEvent(event)}
                  />
                ))}
                {searchTarget === 'organizations' && visibleOrganizations.map((organization) => (
                  <button
                    key={organization.$id}
                    type="button"
                    className="discover-map-result-row discover-map-result-row--generic"
                    aria-label={`Select ${organization.name}`}
                    data-map-result-id={organization.$id}
                    onClick={() => selectOrganization(organization)}
                  >
                    <Image
                      src={getOrganizationAvatarUrl(organization, 96)}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                      className="discover-map-result-image"
                    />
                    <span className="discover-map-result-copy">
                      <strong>{organization.name}</strong>
                      <span>{organization.location ?? 'Organization'}</span>
                      <span>{distanceLabel(getOrgCoordinates(organization))}</span>
                    </span>
                  </button>
                ))}
                {searchTarget === 'rentals' && visibleRentals.map((rental) => (
                  <button
                    key={getRentalListingId(rental)}
                    type="button"
                    className="discover-map-result-row discover-map-result-row--generic"
                    aria-label={`Select ${getRentalListingName(rental)}`}
                    data-map-result-id={getRentalListingId(rental)}
                    onClick={() => selectRental(rental)}
                  >
                    <Image
                      src={getOrganizationAvatarUrl(rental.organization, 96)}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                      className="discover-map-result-image"
                    />
                    <span className="discover-map-result-copy">
                      <strong>{getRentalListingName(rental)}</strong>
                      <span>{rental.organization.name}</span>
                      <span>{distanceLabel(rental.coordinates)}</span>
                    </span>
                  </button>
                ))}
                {searchTarget === 'teams' && visibleTeams.map((listing) => (
                  <button key={listing.team.$id} type="button" className="discover-map-result-row discover-map-result-row--generic"
                    aria-label={`Select ${listing.team.name}`} data-map-result-id={listing.team.$id} onClick={() => selectTeam(listing)}>
                    <Image src={getTeamAvatarUrl(listing.team, 96)} alt="" width={72} height={72} unoptimized className="discover-map-result-image" />
                    <span className="discover-map-result-copy">
                      <strong>{listing.team.name}</strong>
                      <span>{listing.team.sport} · Open registration</span>
                      <span>Organization location: {listing.organization.name}</span>
                      <span>{distanceLabel(listing.coordinates)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          )}
        </div>
        {(loading || error || loadError || locationRequestError || !googleMapsApiKey) && (
          <div className="discover-map-status">
            {loading && (
              <Group gap="xs" role="status">
                <Loader size="sm" />
                <Text size="sm">Loading nearby results...</Text>
              </Group>
            )}
            {error && (
              <Alert color="red">
                <Group justify="space-between" gap="sm">
                  <Text size="sm">{error}</Text>
                  <Button type="button" variant="outline" className="discover-map-retry" onClick={handleSearchAreaClick} loading={loading}>
                    Retry results
                  </Button>
                </Group>
              </Alert>
            )}
            {loadError && (
              <Alert color="red">
                <Group justify="space-between" gap="sm">
                  <Text size="sm">Google Maps failed to load.</Text>
                  <Button
                    type="button"
                    variant="outline"
                    className="discover-map-retry"
                    onClick={() => {
                      setMapLoadState({ isLoaded: false, loadError: undefined });
                      setMapLoadAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry map
                  </Button>
                </Group>
              </Alert>
            )}
            {locationRequestError && <Alert color="red">{locationRequestError}</Alert>}
            {!googleMapsApiKey && <Alert color="red">Google Maps API key is not configured.</Alert>}
          </div>
        )}
        <footer className="discover-map-footer">
          {searchTarget === 'teams' ? 'Teams appear at their organization locations. ' : ''}
          Move the map, then select Search this area to update results.
        </footer>
      </div>
    </Modal>
  );
}
