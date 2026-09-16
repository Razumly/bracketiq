"use client";
import {
  Dispatch,
  RefObject,
  SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  Text,
} from "@/components/organization/organization-operation-ui";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Plus } from "lucide-react";

import Navigation from "@/components/layout/Navigation";
import LocationSearch from "@/components/location/LocationSearch";
import Loading from "@/components/ui/Loading";
import { OrganizationDataPlaceholder } from "@/components/organization/OrganizationDataLoading";
import OrganizationCard from "@/components/ui/OrganizationCard";
import TeamCard from "@/components/ui/TeamCard";
import ResponsiveCardGrid from "@/components/ui/ResponsiveCardGrid";
import { useApp } from "@/app/providers";
import { useLocation } from "@/app/hooks/useLocation";
import {
  eventListFilterKey,
  hasEventListFilters,
} from "@/components/events/event-list-filtering";
import { useDebounce } from "@/app/hooks/useDebounce";
import { ActiveEventFilters } from "@/components/events/EventFilterControls";
import {
  Event,
  EventTag,
  Facility,
  Field,
  Organization,
  OrganizationTag,
  Team,
  TimeSlot,
} from "@/types";
import { eventService, type EventSearchSort } from "@/lib/eventService";
import { organizationService } from "@/lib/organizationService";
import { getNextRentalOccurrence } from "./utils/rentals";
import { useSports } from "@/app/hooks/useSports";
import { createId } from "@/lib/id";
import { buildIndividualEventCreateUrl } from "@/lib/eventCreateNavigation";
import {
  buildDiscoverHref,
  discoverDateParamToDate,
  discoverStartOfToday,
  parseDiscoverPreset,
  parseDiscoverSportFilters,
  resolveDiscoverSportFilters,
  type DiscoverTabValue,
} from "@/lib/discoverFilters";
import { normalizeExternalHttpUrl } from "@/lib/externalUrl";
import EventsTabContent, {
  type EventSortValue,
} from "./components/EventsTabContent";
import DiscoverSearchBar from "./components/DiscoverSearchBar";
import DiscoverResultsShell from "./components/DiscoverResultsShell";
import DiscoverFilterBar from "./components/DiscoverFilterBar";
import DiscoverSearchControls from "./components/DiscoverSearchControls";
import DiscoverMapModal, {
  type DiscoverMapVisibleResults,
} from "./components/DiscoverMapModal";
import {
  useDivisionDiscoveryOptions,
  type DivisionDiscoveryFilterValue,
} from "./components/DivisionDiscoveryFilters";
import DiscoverTabFilterBar, {
  formatRentalHourLabel,
  hasDiscoveryDivisionFilters,
} from "./components/DiscoverTabFilterBar";
import {
  buildTeamDivisionFilterOptions,
  filterOpenRegistrationTeams,
  type TeamDivisionFilterOption,
} from "./utils/teamFilters";
import {
  organizationMatchesSports,
  rentalResourceMatchesSports,
} from "./rentalSportFilters";

type RentalListing = {
  kind: "slot" | "affiliateFacility";
  organization: Organization;
  facility?: Facility;
  field?: Field;
  slot?: TimeSlot;
  nextOccurrence: Date;
  distanceKm?: number;
};

const getRentalListingId = (listing: RentalListing): string =>
  listing.kind === "affiliateFacility"
    ? `${listing.organization.$id}:facility:${listing.facility?.$id ?? "affiliate"}`
    : `${listing.organization.$id}:${listing.field?.$id ?? "field"}:${listing.slot?.$id ?? "slot"}`;

type RentalCardEntry = {
  key: string;
  organization: Organization;
  listings: RentalListing[];
  actionLabel: string;
};

type OrganizationResult = {
  organization: Organization;
  distanceKm?: number;
  relevance: number;
};

type DiscoverTab = DiscoverTabValue;

const EVENTS_LIMIT = 100;
const DISCOVERY_PAGE_SIZE = 100;
const FALLBACK_MAP_RADIUS_KM = 50;
const ignoreDistanceChange = () => {};
const EMPTY_DIVISION_FILTERS: DivisionDiscoveryFilterValue = {
  genders: [],
  skillDivisionTypeIds: [],
  ageDivisionTypeIds: [],
  priceMinDollars: null,
  priceMaxDollars: null,
};

const stringArraysEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export default function DiscoverPage() {
  return (
    <Suspense fallback={<Loading text="Loading discover feed..." />}>
      <DiscoverPageContent />
    </Suspense>
  );
}

function DiscoverPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const urlSelectedSports = useMemo(
    () => parseDiscoverSportFilters(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const urlPreset = useMemo(
    () => parseDiscoverPreset(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const {
    location,
    locationInfo,
    requestLocation,
    clearLocation,
    setLocationFromInfo,
  } = useLocation({ loadApproximate: true });

  const hasSearchPreset = Boolean(
    urlPreset.query ||
      urlSelectedSports.length ||
      urlPreset.location ||
      urlPreset.tags.length ||
      urlPreset.eventTypes.length ||
      urlPreset.genders.length ||
      urlPreset.skillDivisionTypeIds.length ||
      urlPreset.ageDivisionTypeIds.length ||
      urlPreset.teamDivisionTypeIds.length ||
      urlPreset.priceMinDollars !== null ||
      urlPreset.priceMaxDollars !== null ||
      urlPreset.startDate ||
      urlPreset.endDate ||
      urlPreset.startHour !== null,
  );
  const [searchExpanded, setSearchExpanded] = useState(!hasSearchPreset);
  const [activeTab, setActiveTab] = useState<DiscoverTab>(() => urlPreset.tab);
  const activeTabRef = useRef(activeTab);
  const locationKey = `${location?.lat ?? ""}:${location?.lng ?? ""}`;
  const [mapScope, setMapScope] = useState<
    (DiscoverMapVisibleResults & { locationKey: string }) | null
  >(null);
  const [loadedListScopes, setLoadedListScopes] = useState<
    Partial<Record<DiscoverTab, string>>
  >({});
  const currentMapScope =
    mapScope?.target === activeTab && mapScope.locationKey === locationKey
      ? mapScope
      : null;
  const mapCenterLat = currentMapScope?.center?.lat ?? location?.lat;
  const mapCenterLng = currentMapScope?.center?.lng ?? location?.lng;
  const mapRadiusKm = currentMapScope?.radiusKm ?? FALLBACK_MAP_RADIUS_KM;
  const mapArea = useMemo(
    () =>
      typeof mapCenterLat === "number" && typeof mapCenterLng === "number"
        ? { lat: mapCenterLat, lng: mapCenterLng, radiusKm: mapRadiusKm }
        : null,
    [mapCenterLat, mapCenterLng, mapRadiusKm],
  );
  const latestMapFilterKeyRef = useRef("");

  const handleActiveTabChange = useCallback((value: string) => {
    if (
      value !== "events" &&
      value !== "organizations" &&
      value !== "rentals" &&
      value !== "teams"
    )
      return;
    if (value === activeTabRef.current) return;
    activeTabRef.current = value;
    setMapScope(null);
    setActiveTab(value);
  }, []);

  const handleMapVisibleResultsChange = useCallback(
    (results: DiscoverMapVisibleResults) => {
      if (
        results.target !== activeTabRef.current ||
        results.filterKey !== latestMapFilterKeyRef.current ||
        !results.center ||
        results.radiusKm === null
      )
        return;
      setMapScope((current) =>
        current?.target === results.target &&
        current.locationKey === locationKey &&
        current.filterKey === results.filterKey &&
        current.center?.lat === results.center?.lat &&
        current.center?.lng === results.center?.lng &&
        current.radiusKm === results.radiusKm &&
        stringArraysEqual(current.ids, results.ids) &&
        stringArraysEqual(current.organizationIds, results.organizationIds)
          ? current
          : { ...results, locationKey },
      );
    },
    [locationKey],
  );

  /**
   * Events tab state
   */
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [eventCacheHasFilters, setEventCacheHasFilters] = useState(false);
  const [eventCacheStartDate, setEventCacheStartDate] = useState<string>();
  const [eventCacheSort, setEventCacheSort] = useState<EventSearchSort | null>(
    null,
  );
  const [eventCacheFilterKey, setEventCacheFilterKey] = useState<string | null>(
    null,
  );
  const [eventOffset, setEventOffset] = useState(0);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const retryEventsFromStartRef = useRef(true);
  const latestFirstPageRequestRef = useRef(0);
  const isFirstPageRequestInFlightRef = useRef(false);
  const isLoadMoreRequestInFlightRef = useRef(false);
  const visibleEventIdsRef = useRef<Set<string>>(new Set());

  const EVENT_TYPE_OPTIONS = useMemo(
    () => ["EVENT", "TOURNAMENT", "LEAGUE", "WEEKLY_EVENT", "TRYOUT"] as const,
    [],
  );
  const [selectedEventTypes, setSelectedEventTypes] = useState<
    (typeof EVENT_TYPE_OPTIONS)[number][]
  >(() => {
    const requested = urlPreset.eventTypes.filter(
      (value): value is (typeof EVENT_TYPE_OPTIONS)[number] =>
        EVENT_TYPE_OPTIONS.includes(
          value as (typeof EVENT_TYPE_OPTIONS)[number],
        ),
    );
    return requested.length ? requested : [...EVENT_TYPE_OPTIONS];
  });
  const [selectedSports, setSelectedSports] = useState<string[]>(
    () => urlSelectedSports,
  );
  const [selectedEventTags, setSelectedEventTags] = useState<string[]>(() =>
    urlPreset.tab === "events" ? urlPreset.tags : [],
  );
  const [eventDivisionFilters, setEventDivisionFilters] =
    useState<DivisionDiscoveryFilterValue>(() => ({
      ...EMPTY_DIVISION_FILTERS,
      genders: urlPreset.tab === "events" ? urlPreset.genders : [],
      skillDivisionTypeIds:
        urlPreset.tab === "events" ? urlPreset.skillDivisionTypeIds : [],
      ageDivisionTypeIds:
        urlPreset.tab === "events" ? urlPreset.ageDivisionTypeIds : [],
      priceMinDollars:
        urlPreset.tab === "events" ? urlPreset.priceMinDollars : null,
      priceMaxDollars:
        urlPreset.tab === "events" ? urlPreset.priceMaxDollars : null,
    }));
  const [eventTags, setEventTags] = useState<EventTag[]>([]);
  const [eventTagsLoading, setEventTagsLoading] = useState(false);
  const [eventTagsError, setEventTagsError] = useState<string | null>(null);
  const [selectedOrganizationTags, setSelectedOrganizationTags] = useState<
    string[]
  >(() => (urlPreset.tab === "organizations" ? urlPreset.tags : []));
  const [organizationDivisionFilters, setOrganizationDivisionFilters] =
    useState<DivisionDiscoveryFilterValue>(() => ({
      ...EMPTY_DIVISION_FILTERS,
      genders: urlPreset.tab === "organizations" ? urlPreset.genders : [],
      skillDivisionTypeIds:
        urlPreset.tab === "organizations" ? urlPreset.skillDivisionTypeIds : [],
      ageDivisionTypeIds:
        urlPreset.tab === "organizations" ? urlPreset.ageDivisionTypeIds : [],
      priceMinDollars:
        urlPreset.tab === "organizations" ? urlPreset.priceMinDollars : null,
      priceMaxDollars:
        urlPreset.tab === "organizations" ? urlPreset.priceMaxDollars : null,
    }));
  const [organizationTags, setOrganizationTags] = useState<OrganizationTag[]>(
    [],
  );
  const [organizationTagsLoading, setOrganizationTagsLoading] = useState(false);
  const [organizationTagsError, setOrganizationTagsError] = useState<
    string | null
  >(null);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(
    () => {
      if (urlPreset.tab !== "events") return null;
      const parsedStartDate = discoverDateParamToDate(urlPreset.startDate);
      return (
        parsedStartDate ?? (urlPreset.endDate ? null : discoverStartOfToday())
      );
    },
  );
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(() =>
    urlPreset.tab === "events"
      ? discoverDateParamToDate(urlPreset.endDate)
      : null,
  );
  const [searchTerm, setSearchTerm] = useState(urlPreset.query);
  const [eventSort, setEventSort] = useState<EventSortValue>("recommended");
  const serverEventSort: EventSearchSort =
    eventSort === "nearest"
      ? "NEAREST"
      : eventSort === "soonest"
        ? "SOONEST"
        : "RECOMMENDED";
  const debouncedSearch = useDebounce(searchTerm, 500);

  const {
    sports,
    categories: sportCategories,
    loading: sportsLoading,
    error: sportsError,
  } = useSports();
  const sportOptions = useMemo(
    () => sports.map((sport) => sport.name),
    [sports],
  );
  const eventDivisionOptions = useDivisionDiscoveryOptions(
    selectedSports,
    activeTab === "events",
  );
  useEffect(() => {
    const controller = new AbortController();
    setEventTagsLoading(true);
    setEventTagsError(null);
    fetch("/api/event-tags?filterOnly=true", { signal: controller.signal })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Failed to load event tags")),
      )
      .then((body) => {
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        setEventTags(tags);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setEventTagsError("Unable to load event tags.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEventTagsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setOrganizationTagsLoading(true);
    setOrganizationTagsError(null);
    fetch("/api/organization-tags?filterOnly=true", {
      signal: controller.signal,
    })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Failed to load organization tags")),
      )
      .then((body) => {
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        setOrganizationTags(tags);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setOrganizationTagsError("Unable to load organization tags.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setOrganizationTagsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);
  const hiddenEventIdsKey = (user?.hiddenEventIds ?? [])
    .slice()
    .sort()
    .join("\0");
  const hiddenEventIds = useMemo(() => {
    if (!hiddenEventIdsKey) {
      return new Set<string>();
    }
    return new Set(hiddenEventIdsKey.split("\0"));
  }, [hiddenEventIdsKey]);

  useEffect(() => {
    visibleEventIdsRef.current = new Set(events.map((event) => event.$id));
  }, [events]);

  /**
   * Rentals tab state
   */
  const [rentalOrganizations, setRentalOrganizations] = useState<
    Organization[]
  >([]);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [rentalsLoadingMore, setRentalsLoadingMore] = useState(false);
  const [hasMoreRentals, setHasMoreRentals] = useState(true);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const retryRentalsFromStartRef = useRef(true);
  const rentalOffsetRef = useRef(0);
  const hasMoreRentalsRef = useRef(true);
  const rentalRequestInFlightRef = useRef(false);
  const latestRentalRequestRef = useRef(0);
  const [timeRange, setTimeRange] = useState<[number, number]>(() =>
    urlPreset.tab === "rentals" &&
    urlPreset.startHour !== null &&
    urlPreset.endHour !== null &&
    urlPreset.startHour < urlPreset.endHour
      ? [urlPreset.startHour, urlPreset.endHour]
      : [8, 22],
  );

  /**
   * Organizations tab state
   */
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsLoadingMore, setOrganizationsLoadingMore] =
    useState(false);
  const [hasMoreOrganizations, setHasMoreOrganizations] = useState(true);
  const [organizationsError, setOrganizationsError] = useState<string | null>(
    null,
  );
  const retryOrganizationsFromStartRef = useRef(true);
  const organizationOffsetRef = useRef(0);
  const hasMoreOrganizationsRef = useRef(true);
  const organizationRequestInFlightRef = useRef(false);
  const latestOrganizationRequestRef = useRef(0);

  /**
   * Teams tab state
   */
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsLoadingMore, setTeamsLoadingMore] = useState(false);
  const [hasMoreTeams, setHasMoreTeams] = useState(true);
  const teamOffsetRef = useRef(0);
  const hasMoreTeamsRef = useRef(true);
  const teamRequestInFlightRef = useRef(false);
  const latestTeamRequestRef = useRef(0);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const retryTeamsFromStartRef = useRef(true);
  const [teamSelectedSports, setTeamSelectedSports] = useState<string[]>(() =>
    urlPreset.tab === "teams" ? urlSelectedSports : [],
  );
  const [teamSelectedDivisionTypeValues, setTeamSelectedDivisionTypeValues] =
    useState<string[]>(() =>
      urlPreset.tab === "teams" ? urlPreset.teamDivisionTypeIds : [],
    );

  const hasGuestSession =
    isGuest ||
    (typeof window !== "undefined" &&
      window.localStorage.getItem("guest-session") === "1");

  /**
   * Helpers
   */
  const kmBetween = useCallback(
    (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const toRad = (value: number) => (value * Math.PI) / 180;
      const R = 6371; // km
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const sinDLat = Math.sin(dLat / 2);
      const sinDLon = Math.sin(dLon / 2);
      const c =
        2 *
        Math.asin(
          Math.sqrt(
            sinDLat * sinDLat +
              Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon,
          ),
        );
      return R * c;
    },
    [],
  );

  const getOrgCoordinates = useCallback((org: Organization) => {
    if (Array.isArray(org.coordinates) && org.coordinates.length >= 2) {
      const [lng, lat] = org.coordinates;
      const latNum = typeof lat === "number" ? lat : Number(lat);
      const lngNum = typeof lng === "number" ? lng : Number(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        return { lat: latNum, lng: lngNum };
      }
    }
    const latRaw = (org as any).lat ?? (org as any).latitude;
    const lngRaw =
      (org as any).long ?? (org as any).longitude ?? (org as any).lng;
    const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === "number" ? lngRaw : Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }, []);

  const getFacilityCoordinates = useCallback((facility: Facility) => {
    if (
      Array.isArray(facility.coordinates) &&
      facility.coordinates.length >= 2
    ) {
      const [lng, lat] = facility.coordinates;
      const latNum = typeof lat === "number" ? lat : Number(lat);
      const lngNum = typeof lng === "number" ? lng : Number(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        return { lat: latNum, lng: lngNum };
      }
    }
    return null;
  }, []);

  /**
   * Keep the active Discover search and filters in a reloadable, shareable URL.
   */
  useEffect(() => {
    if (pathname !== "/discover") {
      return;
    }
    if (
      typeof window === "undefined" ||
      window.location.pathname !== "/discover"
    ) {
      return;
    }
    const activeDivisionFilters =
      activeTab === "organizations"
        ? organizationDivisionFilters
        : eventDivisionFilters;
    const locationLabel =
      locationInfo?.formattedAddress?.trim() ||
      [locationInfo?.city, locationInfo?.state].filter(Boolean).join(", ") ||
      null;
    const nextUrl = buildDiscoverHref({
      tab: activeTab,
      query: debouncedSearch,
      sports: activeTab === "teams" ? teamSelectedSports : selectedSports,
      tags:
        activeTab === "organizations"
          ? selectedOrganizationTags
          : selectedEventTags,
      eventTypes:
        activeTab === "events" &&
        selectedEventTypes.length !== EVENT_TYPE_OPTIONS.length
          ? selectedEventTypes
          : [],
      genders: activeDivisionFilters.genders,
      skillDivisionTypeIds: activeDivisionFilters.skillDivisionTypeIds,
      ageDivisionTypeIds: activeDivisionFilters.ageDivisionTypeIds,
      priceMinDollars: activeDivisionFilters.priceMinDollars,
      priceMaxDollars: activeDivisionFilters.priceMaxDollars,
      startDate: activeTab === "events" ? selectedStartDate : null,
      endDate: activeTab === "events" ? selectedEndDate : null,
      startHour: activeTab === "rentals" ? timeRange[0] : null,
      endHour: activeTab === "rentals" ? timeRange[1] : null,
      teamDivisionTypeIds:
        activeTab === "teams" ? teamSelectedDivisionTypeValues : [],
      location:
        activeTab !== "teams" && location
          ? { ...location, label: locationLabel }
          : null,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) {
      return;
    }
    // Keep discover query params in sync without triggering router navigations
    // that can race with user-initiated route changes (Profile/Organizations).
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [
    EVENT_TYPE_OPTIONS.length,
    activeTab,
    debouncedSearch,
    eventDivisionFilters,
    location,
    locationInfo,
    organizationDivisionFilters,
    pathname,
    selectedEndDate,
    selectedEventTags,
    selectedEventTypes,
    selectedOrganizationTags,
    selectedSports,
    selectedStartDate,
    teamSelectedDivisionTypeValues,
    teamSelectedSports,
    timeRange,
  ]);

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) => {
      const resolved = resolveDiscoverSportFilters(current, sportOptions);
      return stringArraysEqual(current, resolved) ? current : resolved;
    });
    setTeamSelectedSports((current) => {
      const resolved = current.filter((sport) => sportOptions.includes(sport));
      return stringArraysEqual(current, resolved) ? current : resolved;
    });
  }, [sportOptions, sportsLoading]);

  const teamDivisionTypeOptions = useMemo(
    () => buildTeamDivisionFilterOptions(teamSelectedSports),
    [teamSelectedSports],
  );

  useEffect(() => {
    const availableValues = new Set(
      teamDivisionTypeOptions.map((option) => option.value),
    );
    setTeamSelectedDivisionTypeValues((current) =>
      current.filter((value) => availableValues.has(value)),
    );
  }, [teamDivisionTypeOptions]);
  const mapTargetFilterKey = JSON.stringify([
    activeTab,
    searchTerm.trim().toLowerCase(),
    activeTab === "events"
      ? [
          selectedSports,
          selectedEventTags,
          selectedEventTypes,
          selectedStartDate,
          selectedEndDate,
          eventDivisionFilters,
        ]
      : activeTab === "organizations"
        ? [
            selectedSports,
            selectedOrganizationTags,
            organizationDivisionFilters,
          ]
        : activeTab === "rentals"
          ? [timeRange]
          : [teamSelectedSports, teamSelectedDivisionTypeValues],
  ]);
  latestMapFilterKeyRef.current = mapTargetFilterKey;
  const isMapScopePending =
    currentMapScope === null ||
    currentMapScope.filterKey !== mapTargetFilterKey;
  const listFilterKey = JSON.stringify([mapTargetFilterKey, searchTerm.trim()]);
  const listScopeKey = `${activeTab}:${locationKey}:${mapCenterLat}:${mapCenterLng}:${mapRadiusKm}:${listFilterKey}`;
  const latestListScopeKeyRef = useRef(listScopeKey);
  latestListScopeKeyRef.current = listScopeKey;
  const isActiveListPending = loadedListScopes[activeTab] !== listScopeKey;
  const mapResultIds = useMemo(
    () => new Set(currentMapScope?.ids),
    [currentMapScope?.ids],
  );

  const buildEventFilters = useCallback(
    (queryOverride?: string) => {
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0,
      );
      const normalizedQuery = (queryOverride ?? searchTerm).trim();
      const normalizedStartDate =
        selectedStartDate instanceof Date &&
        !Number.isNaN(selectedStartDate.getTime())
          ? selectedStartDate
          : null;
      const normalizedEndDate =
        selectedEndDate instanceof Date &&
        !Number.isNaN(selectedEndDate.getTime())
          ? selectedEndDate
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

      return {
        eventTypes:
          selectedEventTypes.length === EVENT_TYPE_OPTIONS.length
            ? undefined
            : selectedEventTypes,
        sports: selectedSports.length > 0 ? selectedSports : undefined,
        tags: selectedEventTags.length > 0 ? selectedEventTags : undefined,
        divisionGenders: eventDivisionFilters.genders.length
          ? (eventDivisionFilters.genders as Array<"M" | "F" | "C">)
          : undefined,
        skillDivisionTypeIds: eventDivisionFilters.skillDivisionTypeIds.length
          ? eventDivisionFilters.skillDivisionTypeIds
          : undefined,
        ageDivisionTypeIds: eventDivisionFilters.ageDivisionTypeIds.length
          ? eventDivisionFilters.ageDivisionTypeIds
          : undefined,
        priceMin:
          eventDivisionFilters.priceMinDollars === null
            ? undefined
            : Math.round(eventDivisionFilters.priceMinDollars * 100),
        priceMax:
          eventDivisionFilters.priceMaxDollars === null
            ? undefined
            : Math.round(eventDivisionFilters.priceMaxDollars * 100),
        userLocation: mapArea
          ? { lat: mapArea.lat, lng: mapArea.lng }
          : undefined,
        maxDistance: mapArea?.radiusKm,
        dateFrom,
        dateTo,
        query: normalizedQuery || undefined,
      };
    },
    [
      selectedEventTypes,
      selectedSports,
      selectedEventTags,
      eventDivisionFilters,
      mapArea,
      searchTerm,
      selectedStartDate,
      selectedEndDate,
      EVENT_TYPE_OPTIONS,
    ],
  );

  const loadFirstPage = useCallback(
    async (queryOverride?: string) => {
      if (!mapArea || isMapScopePending || activeTabRef.current !== "events")
        return;
      const requestId = latestFirstPageRequestRef.current + 1;
      latestFirstPageRequestRef.current = requestId;
      isFirstPageRequestInFlightRef.current = true;
      isLoadMoreRequestInFlightRef.current = false;
      setIsLoadingInitial(true);
      setIsLoadingMore(false);
      setEventsError(null);
      try {
        const filters = buildEventFilters(queryOverride);
        const page = await eventService.getEventsPage(
          filters,
          EVENTS_LIMIT,
          0,
          serverEventSort,
        );
        if (
          requestId !== latestFirstPageRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        ) {
          return;
        }

        setEvents(
          page.events.filter((event) => !hiddenEventIds.has(event.$id)),
        );
        setLoadedListScopes((current) =>
          current.events === listScopeKey
            ? current
            : { ...current, events: listScopeKey },
        );
        setEventCacheStartDate(filters.dateFrom);
        setEventCacheSort(serverEventSort);
        setEventCacheHasFilters(
          hasEventListFilters({
            searchTerm: filters.query ?? "",
            selectedEventTypes,
            eventTypeOptions: EVENT_TYPE_OPTIONS,
            selectedSports,
            selectedTags: selectedEventTags,
            selectedStartDate,
            selectedEndDate,
            location,
            maxDistance: null,
            hideWeeklyChildren: false,
            divisionFilters: eventDivisionFilters,
          }),
        );
        setEventCacheFilterKey(
          eventListFilterKey({
            searchTerm: filters.query ?? "",
            selectedEventTypes,
            eventTypeOptions: EVENT_TYPE_OPTIONS,
            selectedSports,
            selectedTags: selectedEventTags,
            selectedStartDate,
            selectedEndDate,
            location,
            maxDistance: null,
            hideWeeklyChildren: false,
            divisionFilters: eventDivisionFilters,
          }),
        );
        setEventOffset(page.pagination.nextOffset);
        setHasMoreEvents(page.pagination.hasMore);
      } catch (error) {
        if (
          requestId !== latestFirstPageRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        ) {
          return;
        }
        console.error("Failed to load events:", error);
        retryEventsFromStartRef.current = true;
        setEventsError("Failed to load events. Please try again.");
      } finally {
        if (
          requestId === latestFirstPageRequestRef.current &&
          listScopeKey === latestListScopeKeyRef.current
        ) {
          isFirstPageRequestInFlightRef.current = false;
          setIsLoadingInitial(false);
        }
      }
    },
    [
      buildEventFilters,
      hiddenEventIds,
      serverEventSort,
      selectedEventTypes,
      selectedSports,
      selectedEventTags,
      selectedStartDate,
      selectedEndDate,
      location,
      mapArea,
      isMapScopePending,
      listScopeKey,
      eventDivisionFilters,
      EVENT_TYPE_OPTIONS,
    ],
  );

  const loadMoreEvents = useCallback(async () => {
    if (
      activeTabRef.current !== "events" ||
      isMapScopePending ||
      isActiveListPending ||
      isLoadingInitial ||
      isFirstPageRequestInFlightRef.current ||
      isLoadingMore ||
      isLoadMoreRequestInFlightRef.current ||
      eventCacheSort !== serverEventSort ||
      !hasMoreEvents
    )
      return;
    isLoadMoreRequestInFlightRef.current = true;
    const requestId = latestFirstPageRequestRef.current;
    setIsLoadingMore(true);
    setEventsError(null);
    try {
      const filters = buildEventFilters();
      const page = await eventService.getEventsPage(
        filters,
        EVENTS_LIMIT,
        eventOffset,
        serverEventSort,
      );
      if (
        requestId !== latestFirstPageRequestRef.current ||
        listScopeKey !== latestListScopeKeyRef.current
      )
        return;
      const visiblePageEvents = page.events.filter(
        (event) => !hiddenEventIds.has(event.$id),
      );
      const addedVisibleEventCount = visiblePageEvents.filter(
        (event) => !visibleEventIdsRef.current.has(event.$id),
      ).length;
      setEvents((prev) => {
        const merged = [...prev, ...visiblePageEvents];
        const seen = new Set<string>();
        return merged.filter((event) => {
          if (seen.has(event.$id)) return false;
          seen.add(event.$id);
          return true;
        });
      });
      setEventOffset(page.pagination.nextOffset);
      setHasMoreEvents(page.pagination.hasMore && addedVisibleEventCount > 0);
    } catch (error) {
      if (
        requestId !== latestFirstPageRequestRef.current ||
        listScopeKey !== latestListScopeKeyRef.current
      )
        return;
      console.error("Failed to load more events:", error);
      retryEventsFromStartRef.current = false;
      setEventsError("Failed to load more events. Please try again.");
    } finally {
      if (
        requestId === latestFirstPageRequestRef.current &&
        listScopeKey === latestListScopeKeyRef.current
      ) {
        isLoadMoreRequestInFlightRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [
    buildEventFilters,
    eventCacheSort,
    eventOffset,
    isLoadingInitial,
    isLoadingMore,
    hasMoreEvents,
    hiddenEventIds,
    serverEventSort,
    isMapScopePending,
    isActiveListPending,
    listScopeKey,
  ]);

  useEffect(() => {
    if (hiddenEventIds.size === 0) {
      return;
    }
    setEvents((previous) =>
      previous.filter((event) => !hiddenEventIds.has(event.$id)),
    );
  }, [hiddenEventIds]);

  /**
   * Rentals fetching
   */
  const mergeOrganizationsById = useCallback(
    (previous: Organization[], incoming: Organization[]) => {
      const merged = new Map<string, Organization>();
      previous.forEach((organization) =>
        merged.set(organization.$id, organization),
      );
      incoming.forEach((organization) =>
        merged.set(organization.$id, organization),
      );
      return Array.from(merged.values());
    },
    [],
  );

  const mergeTeamsById = useCallback((previous: Team[], incoming: Team[]) => {
    const merged = new Map<string, Team>();
    previous.forEach((team) => merged.set(team.$id, team));
    incoming.forEach((team) => merged.set(team.$id, team));
    return Array.from(merged.values());
  }, []);

  const loadRentals = useCallback(
    async (reset = false, queryOverride?: string) => {
      if (!mapArea || isMapScopePending || activeTabRef.current !== "rentals")
        return;
      if (!reset && rentalRequestInFlightRef.current) return;
      const nextOffset = reset ? 0 : rentalOffsetRef.current;
      if (!reset && !hasMoreRentalsRef.current) return;

      const requestId = latestRentalRequestRef.current + 1;
      latestRentalRequestRef.current = requestId;
      rentalRequestInFlightRef.current = true;

      if (reset || nextOffset === 0) {
        setRentalsLoading(true);
        setRentalsLoadingMore(false);
      } else {
        setRentalsLoadingMore(true);
      }
      setRentalsError(null);
      try {
        const normalizedQuery = (queryOverride ?? searchTerm).trim();
        const page = await organizationService.listOrganizationsWithFieldsPage(
          DISCOVERY_PAGE_SIZE,
          nextOffset,
          {
            includeAffiliateRentals: true,
            ...(normalizedQuery ? { query: normalizedQuery } : {}),
            area: mapArea,
          },
        );
        if (
          requestId !== latestRentalRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        )
          return;
        setRentalOrganizations((previous) =>
          reset
            ? page.organizations
            : mergeOrganizationsById(previous, page.organizations),
        );
        setLoadedListScopes((current) =>
          current.rentals === listScopeKey
            ? current
            : { ...current, rentals: listScopeKey },
        );
        rentalOffsetRef.current = page.pagination.nextOffset;
        hasMoreRentalsRef.current = page.pagination.hasMore;
        setHasMoreRentals(page.pagination.hasMore);
      } catch (error) {
        if (
          requestId !== latestRentalRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        )
          return;
        console.error("Failed to load rentals:", error);
        retryRentalsFromStartRef.current = reset;
        setRentalsError("Failed to load rentals. Please try again.");
      } finally {
        if (
          requestId === latestRentalRequestRef.current &&
          listScopeKey === latestListScopeKeyRef.current
        ) {
          rentalRequestInFlightRef.current = false;
          setRentalsLoading(false);
          setRentalsLoadingMore(false);
        }
      }
    },
    [
      searchTerm,
      isMapScopePending,
      mapArea,
      listScopeKey,
      mergeOrganizationsById,
    ],
  );

  const loadMoreRentals = useCallback(() => {
    void loadRentals(false);
  }, [loadRentals]);

  /**
   * Organizations fetching
   */
  const loadOrganizations = useCallback(
    async (reset = false, queryOverride?: string) => {
      if (
        !mapArea ||
        isMapScopePending ||
        activeTabRef.current !== "organizations"
      )
        return;
      if (!reset && organizationRequestInFlightRef.current) return;
      const nextOffset = reset ? 0 : organizationOffsetRef.current;
      if (!reset && !hasMoreOrganizationsRef.current) return;

      const requestId = latestOrganizationRequestRef.current + 1;
      latestOrganizationRequestRef.current = requestId;
      organizationRequestInFlightRef.current = true;

      if (reset) {
        setOrganizationsLoading(true);
        setOrganizationsLoadingMore(false);
      } else {
        setOrganizationsLoadingMore(true);
      }
      setOrganizationsError(null);
      try {
        const normalizedQuery = (queryOverride ?? searchTerm).trim();
        const page = await organizationService.listOrganizationsWithFieldsPage(
          DISCOVERY_PAGE_SIZE,
          nextOffset,
          {
            hydrateRelations: false,
            ...(normalizedQuery ? { query: normalizedQuery } : {}),
            area: mapArea,
            tagSlugs: selectedOrganizationTags,
            sports: selectedSports,
            divisionGenders: organizationDivisionFilters.genders,
            skillDivisionTypeIds:
              organizationDivisionFilters.skillDivisionTypeIds,
            ageDivisionTypeIds: organizationDivisionFilters.ageDivisionTypeIds,
            divisionPriceMin:
              organizationDivisionFilters.priceMinDollars === null
                ? undefined
                : Math.round(organizationDivisionFilters.priceMinDollars * 100),
            divisionPriceMax:
              organizationDivisionFilters.priceMaxDollars === null
                ? undefined
                : Math.round(organizationDivisionFilters.priceMaxDollars * 100),
          },
        );
        if (
          requestId !== latestOrganizationRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        )
          return;
        setOrganizations((previous) =>
          reset
            ? page.organizations
            : mergeOrganizationsById(previous, page.organizations),
        );
        setLoadedListScopes((current) =>
          current.organizations === listScopeKey
            ? current
            : { ...current, organizations: listScopeKey },
        );
        organizationOffsetRef.current = page.pagination.nextOffset;
        hasMoreOrganizationsRef.current = page.pagination.hasMore;
        setHasMoreOrganizations(page.pagination.hasMore);
      } catch (error) {
        if (
          requestId !== latestOrganizationRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        )
          return;
        console.error("Failed to load organizations:", error);
        retryOrganizationsFromStartRef.current = reset;
        setOrganizationsError(
          "Failed to load organizations. Please try again.",
        );
      } finally {
        if (
          requestId === latestOrganizationRequestRef.current &&
          listScopeKey === latestListScopeKeyRef.current
        ) {
          organizationRequestInFlightRef.current = false;
          setOrganizationsLoading(false);
          setOrganizationsLoadingMore(false);
        }
      }
    },
    [
      searchTerm,
      isMapScopePending,
      mapArea,
      listScopeKey,
      mergeOrganizationsById,
      selectedOrganizationTags,
      selectedSports,
      organizationDivisionFilters,
    ],
  );

  const loadMoreOrganizations = useCallback(() => {
    void loadOrganizations(false);
  }, [loadOrganizations]);

  const loadTeams = useCallback(
    async (reset = false) => {
      if (!mapArea || isMapScopePending || activeTabRef.current !== "teams")
        return;
      if (!reset && teamRequestInFlightRef.current) return;
      const nextOffset = reset ? 0 : teamOffsetRef.current;
      if (!reset && !hasMoreTeamsRef.current) return;

      const requestId = latestTeamRequestRef.current + 1;
      latestTeamRequestRef.current = requestId;
      teamRequestInFlightRef.current = true;
      if (reset || nextOffset === 0) {
        setTeamsLoading(true);
        setTeamsLoadingMore(false);
      } else {
        setTeamsLoadingMore(true);
      }
      setTeamsError(null);
      try {
        const page = await organizationService.listOrganizationsWithFieldsPage(
          DISCOVERY_PAGE_SIZE,
          nextOffset,
          {
            area: mapArea,
            hydrateRelations: true,
          },
        );
        if (
          requestId !== latestTeamRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        )
          return;
        const pageTeams = page.organizations.flatMap((organization) =>
          (organization.teams ?? [])
            .filter((team) => team.openRegistration === true)
            .map((team) => ({
              ...team,
              organizationId: organization.$id,
              organization,
            })),
        );
        setTeams((previous) =>
          reset ? pageTeams : mergeTeamsById(previous, pageTeams),
        );
        setLoadedListScopes((current) =>
          current.teams === listScopeKey
            ? current
            : { ...current, teams: listScopeKey },
        );
        teamOffsetRef.current = page.pagination.nextOffset;
        hasMoreTeamsRef.current = page.pagination.hasMore;
        setHasMoreTeams(page.pagination.hasMore);
      } catch (error) {
        if (
          requestId !== latestTeamRequestRef.current ||
          listScopeKey !== latestListScopeKeyRef.current
        )
          return;
        console.error("Failed to load open registration teams:", error);
        retryTeamsFromStartRef.current = reset;
        setTeamsError("Failed to load teams. Please try again.");
      } finally {
        if (
          requestId === latestTeamRequestRef.current &&
          listScopeKey === latestListScopeKeyRef.current
        ) {
          teamRequestInFlightRef.current = false;
          setTeamsLoading(false);
          setTeamsLoadingMore(false);
        }
      }
    },
    [isMapScopePending, mapArea, listScopeKey, mergeTeamsById],
  );

  const loadMoreTeams = useCallback(() => {
    void loadTeams(false);
  }, [loadTeams]);

  const handleSearchSubmit = useCallback(() => {
    setSearchExpanded(false);
    if (activeTab === "events") {
      void loadFirstPage(searchTerm);
    }
    if (activeTab === "organizations") {
      void loadOrganizations(true, searchTerm);
    }
    if (activeTab === "rentals") {
      void loadRentals(true, searchTerm);
    }
    if (activeTab === "teams") {
      void loadTeams(true);
    }
  }, [
    activeTab,
    loadFirstPage,
    loadOrganizations,
    loadRentals,
    loadTeams,
    searchTerm,
  ]);

  const loadFirstPageRef = useRef(loadFirstPage);
  useEffect(() => {
    loadFirstPageRef.current = loadFirstPage;
  }, [loadFirstPage]);

  /**
   * Effects
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated && !hasGuestSession) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, hasGuestSession, authLoading, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated && !hasGuestSession) {
      return;
    }
    if (activeTab !== "events") {
      return;
    }
    void loadFirstPageRef.current(searchTerm);
  }, [
    isAuthenticated,
    hasGuestSession,
    authLoading,
    activeTab,
    serverEventSort,
    mapArea,
    isMapScopePending,
    searchTerm,
    selectedEventTypes,
    selectedSports,
    selectedEventTags,
    selectedStartDate,
    selectedEndDate,
    eventDivisionFilters,
    hiddenEventIds,
  ]);

  const presetLocationAppliedRef = useRef(false);
  useEffect(() => {
    if (!urlPreset.location || presetLocationAppliedRef.current) {
      return;
    }
    const labelParts = (urlPreset.location.label ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    setLocationFromInfo({
      lat: urlPreset.location.lat,
      lng: urlPreset.location.lng,
      city: labelParts[0],
      state: labelParts[1],
      formattedAddress: urlPreset.location.label ?? undefined,
    });
    presetLocationAppliedRef.current = true;
  }, [setLocationFromInfo, urlPreset.location]);

  useEffect(() => {
    if (
      authLoading ||
      (!isAuthenticated && !hasGuestSession) ||
      activeTab !== "rentals"
    )
      return;
    void loadRentals(true);
  }, [activeTab, authLoading, hasGuestSession, isAuthenticated, loadRentals]);

  useEffect(() => {
    if (
      authLoading ||
      (!isAuthenticated && !hasGuestSession) ||
      activeTab !== "teams"
    )
      return;
    void loadTeams(true);
  }, [activeTab, authLoading, hasGuestSession, isAuthenticated, loadTeams]);

  useEffect(() => {
    if (
      authLoading ||
      (!isAuthenticated && !hasGuestSession) ||
      activeTab !== "organizations"
    )
      return;
    void loadOrganizations(true);
  }, [
    activeTab,
    authLoading,
    hasGuestSession,
    isAuthenticated,
    loadOrganizations,
  ]);

  const handleCreateEventNavigation = useCallback(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    router.push(buildIndividualEventCreateUrl(createId()));
  }, [router, user]);

  const handleSelectRentalOrganization = useCallback(
    (organization: Organization, listings: RentalListing[] = []) => {
      const affiliateFacilityListings = listings.filter(
        (listing) => listing.kind === "affiliateFacility",
      );
      if (
        affiliateFacilityListings.length === listings.length &&
        affiliateFacilityListings.length > 0
      ) {
        const affiliateUrl = normalizeExternalHttpUrl(
          affiliateFacilityListings[0]?.facility?.affiliateUrl,
        );
        if (affiliateUrl) {
          window.open(affiliateUrl, "_blank", "noopener,noreferrer");
          return;
        }
      }
      router.push(`/organizations/${organization.$id}?tab=fields`);
    },
    [router],
  );

  const handleSelectOrganization = useCallback(
    (organization: Organization) => {
      router.push(`/organizations/${organization.$id}`);
    },
    [router],
  );

  const handleSelectEvent = useCallback(
    (event: Event) => {
      router.push(`/events/${event.$id}?tab=details`);
    },
    [router],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const organizationsSentinelRef = useRef<HTMLDivElement | null>(null);
  const rentalsSentinelRef = useRef<HTMLDivElement | null>(null);
  const teamsSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (
      activeTab !== "events" ||
      isMapScopePending ||
      isActiveListPending ||
      !sentinelRef.current ||
      eventsError
    )
      return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMoreEvents();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    activeTab,
    eventsError,
    isMapScopePending,
    isActiveListPending,
    loadMoreEvents,
  ]);

  useEffect(() => {
    if (isMapScopePending || isActiveListPending) return;
    if (
      (activeTab === "organizations" &&
        (organizationsError ||
          organizationsLoading ||
          organizationsLoadingMore)) ||
      (activeTab === "rentals" &&
        (rentalsError || rentalsLoading || rentalsLoadingMore)) ||
      (activeTab === "teams" &&
        (teamsError || teamsLoading || teamsLoadingMore))
    )
      return;
    const sentinelByTab: Partial<Record<DiscoverTab, HTMLDivElement | null>> = {
      organizations: organizationsSentinelRef.current,
      rentals: rentalsSentinelRef.current,
      teams: teamsSentinelRef.current,
    };
    const loadMoreByTab: Partial<Record<DiscoverTab, () => void>> = {
      organizations: loadMoreOrganizations,
      rentals: loadMoreRentals,
      teams: loadMoreTeams,
    };
    const el = sentinelByTab[activeTab];
    const loadMore = loadMoreByTab[activeTab];
    if (!el || !loadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    activeTab,
    isMapScopePending,
    isActiveListPending,
    loadMoreOrganizations,
    loadMoreRentals,
    loadMoreTeams,
    organizationsError,
    organizationsLoading,
    organizationsLoadingMore,
    rentalsError,
    rentalsLoading,
    rentalsLoadingMore,
    teamsError,
    teamsLoading,
    teamsLoadingMore,
  ]);

  /**
   * Rentals derived data
   */
  const rentalListings = useMemo(() => {
    const referenceDate = new Date();
    const listings: RentalListing[] = [];

    rentalOrganizations.forEach((organization) => {
      const coordinates = getOrgCoordinates(organization);

      (organization.facilities || []).forEach((facility) => {
        const affiliateUrl = normalizeExternalHttpUrl(facility.affiliateUrl);
        if (!affiliateUrl) {
          return;
        }
        if (
          String(facility.status ?? "ACTIVE")
            .trim()
            .toUpperCase() !== "ACTIVE"
        ) {
          return;
        }
        const listing: RentalListing = {
          kind: "affiliateFacility",
          organization,
          facility,
          nextOccurrence: referenceDate,
        };
        const facilityCoordinates =
          getFacilityCoordinates(facility) ?? coordinates;
        if (location && facilityCoordinates) {
          try {
            listing.distanceKm = kmBetween(location, facilityCoordinates);
          } catch {
            // ignore distance issues
          }
        }
        listings.push(listing);
      });

      (organization.fields || []).forEach((field) => {
        (field.rentalSlots || []).forEach((slot) => {
          const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
          if (!nextOccurrence) {
            return;
          }
          const listing: RentalListing = {
            kind: "slot",
            organization,
            field,
            slot,
            nextOccurrence,
          };

          if (location && coordinates) {
            try {
              listing.distanceKm = kmBetween(location, coordinates);
            } catch {
              // ignore distance issues
            }
          }

          listings.push(listing);
        });
      });
    });

    listings.sort((a, b) => {
      if (
        typeof a.distanceKm === "number" &&
        typeof b.distanceKm === "number"
      ) {
        return a.distanceKm - b.distanceKm;
      }
      if (typeof a.distanceKm === "number") return -1;
      if (typeof b.distanceKm === "number") return 1;
      if (a.kind !== b.kind) {
        return a.kind === "slot" ? -1 : 1;
      }
      return a.nextOccurrence.getTime() - b.nextOccurrence.getTime();
    });

    return listings;
  }, [
    rentalOrganizations,
    location,
    kmBetween,
    getOrgCoordinates,
    getFacilityCoordinates,
  ]);

  const defaultTimeRange = useMemo<[number, number]>(() => {
    if (!rentalListings.length) {
      return [8, 22];
    }
    let earliest = 24;
    let latest = 0;
    rentalListings.forEach((listing) => {
      if (listing.kind !== "slot" || !listing.slot) {
        return;
      }
      const startHour =
        listing.nextOccurrence.getHours() +
        listing.nextOccurrence.getMinutes() / 60;
      const endMinutes =
        typeof listing.slot.endTimeMinutes === "number"
          ? listing.slot.endTimeMinutes
          : (listing.slot.startTimeMinutes ??
            listing.nextOccurrence.getHours() * 60);
      const endHour = Math.floor(endMinutes / 60);
      earliest = Math.min(earliest, startHour);
      latest = Math.max(latest, endHour);
    });
    if (earliest === 24 && latest === 0) {
      return [8, 22];
    }
    const floor = Math.max(0, Math.floor(earliest));
    const ceil = Math.min(24, Math.ceil(latest));
    if (floor === ceil) {
      const adjusted = Math.min(24, floor + 1);
      return [Math.max(0, adjusted - 1), adjusted];
    }
    return [floor, ceil];
  }, [rentalListings]);

  const previousDefaultTimeRangeRef = useRef<[number, number]>([8, 22]);
  useEffect(() => {
    const previous = previousDefaultTimeRangeRef.current;
    previousDefaultTimeRangeRef.current = defaultTimeRange;
    setTimeRange((current) =>
      current[0] === previous[0] &&
      current[1] === previous[1] &&
      (current[0] !== defaultTimeRange[0] || current[1] !== defaultTimeRange[1])
        ? defaultTimeRange
        : current,
    );
  }, [defaultTimeRange]);

  const mapScopedEvents = useMemo(
    () =>
      currentMapScope?.target === "events" &&
      loadedListScopes.events === listScopeKey
        ? events.filter((event) => mapResultIds.has(event.$id))
        : [],
    [
      currentMapScope?.target,
      events,
      listScopeKey,
      loadedListScopes.events,
      mapResultIds,
    ],
  );
  const mapScopedOrganizations = useMemo(
    () =>
      currentMapScope?.target === "organizations" &&
      loadedListScopes.organizations === listScopeKey
        ? organizations.filter((organization) =>
            mapResultIds.has(organization.$id),
          )
        : [],
    [
      currentMapScope?.target,
      organizations,
      listScopeKey,
      loadedListScopes.organizations,
      mapResultIds,
    ],
  );
  const mapScopedRentalListings = useMemo(
    () =>
      currentMapScope?.target === "rentals" &&
      loadedListScopes.rentals === listScopeKey
        ? rentalListings.filter((listing) =>
            mapResultIds.has(getRentalListingId(listing)),
          )
        : [],
    [
      currentMapScope?.target,
      rentalListings,
      listScopeKey,
      loadedListScopes.rentals,
      mapResultIds,
    ],
  );

  /**
   * Organizations derived data
   */
  const organizationResults = useMemo<OrganizationResult[]>(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    const results: OrganizationResult[] = [];

    mapScopedOrganizations.forEach((org) => {
      if (!organizationMatchesSports(org, selectedSports)) {
        return;
      }

      const coords = getOrgCoordinates(org);
      const hasCoords = Boolean(coords);
      const text =
        `${org.name} ${org.description ?? ""} ${org.location ?? ""} ${org.website ?? ""}`.toLowerCase();
      const matchesQuery = q ? text.includes(q) : true;

      if (!q && !hasCoords) {
        return;
      }
      if (q && !matchesQuery) {
        return;
      }

      let distanceKm: number | undefined;
      if (coords && location) {
        try {
          distanceKm = kmBetween(location, coords);
        } catch {
          distanceKm = undefined;
        }
      }

      const relevance =
        q && matchesQuery
          ? Math.max(0, text.indexOf(q))
          : Number.MAX_SAFE_INTEGER;

      results.push({ organization: org, distanceKm, relevance });
    });

    results.sort((a, b) => {
      const aDist = a.distanceKm;
      const bDist = b.distanceKm;
      if (typeof aDist === "number" && typeof bDist === "number") {
        return aDist - bDist;
      }
      if (typeof aDist === "number") return -1;
      if (typeof bDist === "number") return 1;
      if (a.relevance !== b.relevance) return a.relevance - b.relevance;
      return a.organization.name.localeCompare(b.organization.name);
    });

    return results;
  }, [
    mapScopedOrganizations,
    searchTerm,
    selectedSports,
    location,
    kmBetween,
    getOrgCoordinates,
  ]);

  const filteredTeams = useMemo(() => {
    if (
      currentMapScope?.target !== "teams" ||
      loadedListScopes.teams !== listScopeKey
    ) {
      return [];
    }
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return filterOpenRegistrationTeams(
      teams.filter((team) => {
        if (!mapResultIds.has(team.$id)) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const searchBlob = [
          team.name,
          team.sport,
          team.organization?.name,
          team.organization?.description,
          team.organization?.location,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchBlob.includes(normalizedQuery);
      }),
      {
        selectedSports: teamSelectedSports,
        selectedDivisionTypeValues: teamSelectedDivisionTypeValues,
        divisionTypeOptions: teamDivisionTypeOptions,
      },
    );
  }, [
    currentMapScope?.target,
    listScopeKey,
    loadedListScopes.teams,
    mapResultIds,
    teams,
    searchTerm,
    teamSelectedSports,
    teamSelectedDivisionTypeValues,
    teamDivisionTypeOptions,
  ]);

  const handleSelectTeam = (team: Team) => {
    const affiliateUrl = normalizeExternalHttpUrl(team.affiliateUrl);
    if (affiliateUrl) {
      window.open(affiliateUrl, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(
      team.organizationId
        ? `/organizations/${team.organizationId}?tab=teams`
        : "/teams",
    );
  };

  const activeSports =
    activeTab === "teams" ? teamSelectedSports : selectedSports;
  const setActiveSports =
    activeTab === "teams" ? setTeamSelectedSports : setSelectedSports;
  const locationLabel = locationInfo
    ? locationInfo.source === "exact" || locationInfo.source === "approximate"
      ? "Near by"
      : `Near ${[locationInfo.city, locationInfo.state].filter(Boolean).join(", ") || locationInfo.zipCode || "selected location"}`
    : "";
  const activeFilterCount =
    Number(Boolean(searchTerm.trim())) +
    activeSports.length +
    (activeTab === "events"
      ? selectedEventTags.length +
        (selectedEventTypes.length === EVENT_TYPE_OPTIONS.length
          ? 0
          : selectedEventTypes.length) +
        Number(Boolean(selectedStartDate)) +
        Number(Boolean(selectedEndDate)) +
        Number(hasDiscoveryDivisionFilters(eventDivisionFilters))
      : activeTab === "organizations"
        ? selectedOrganizationTags.length +
          Number(hasDiscoveryDivisionFilters(organizationDivisionFilters))
        : activeTab === "rentals"
          ? Number(
              timeRange[0] !== defaultTimeRange[0] ||
                timeRange[1] !== defaultTimeRange[1],
            )
          : teamSelectedDivisionTypeValues.length);
  const resetActiveFilters = () => {
    setSearchTerm("");
    setActiveSports([]);
    if (activeTab === "events") {
      setSelectedEventTypes([...EVENT_TYPE_OPTIONS]);
      setSelectedEventTags([]);
      setSelectedStartDate(discoverStartOfToday());
      setSelectedEndDate(null);
      setEventDivisionFilters(EMPTY_DIVISION_FILTERS);
    } else if (activeTab === "organizations") {
      setSelectedOrganizationTags([]);
      setOrganizationDivisionFilters(EMPTY_DIVISION_FILTERS);
    } else if (activeTab === "rentals") {
      setTimeRange(defaultTimeRange);
    } else {
      setTeamSelectedDivisionTypeValues([]);
    }
  };

  const organizationFilters = {
    selectedTags: selectedOrganizationTags,
    setSelectedTags: setSelectedOrganizationTags,
    organizationTags,
    organizationTagsLoading,
    organizationTagsError,
    divisionFilters: organizationDivisionFilters,
    setDivisionFilters: setOrganizationDivisionFilters,
    maxDistance: null,
    setMaxDistance: ignoreDistanceChange,
  };
  const rentalFilters = {
    timeRange,
    setTimeRange,
    defaultTimeRange,
    maxDistance: null,
    setMaxDistance: ignoreDistanceChange,
  };
  const teamFilters = {
    selectedSports: teamSelectedSports,
    setSelectedSports: setTeamSelectedSports,
    selectedDivisionTypeValues: teamSelectedDivisionTypeValues,
    setSelectedDivisionTypeValues: setTeamSelectedDivisionTypeValues,
    divisionTypeOptions: teamDivisionTypeOptions,
  };
  /**
   * Auth guard
   */
  if (authLoading) {
    return <Loading fullScreen text="Loading discover feed..." />;
  }

  if (!isAuthenticated && !hasGuestSession) {
    return <Loading fullScreen text="Redirecting to login..." />;
  }

  /**
   * Render
   */
  const results = (
    <Tabs
      value={activeTab}
      onValueChange={handleActiveTabChange}
      className="discover-tabs min-w-0"
    >
      <TabsContent value="events" aria-label="Events">
        <EventsTabContent
          showLegacyControls={false}
          location={location}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onOpenMap={handleSearchSubmit}
          selectedEventTypes={selectedEventTypes}
          setSelectedEventTypes={setSelectedEventTypes}
          eventTypeOptions={EVENT_TYPE_OPTIONS}
          selectedSports={selectedSports}
          setSelectedSports={setSelectedSports}
          selectedTags={selectedEventTags}
          setSelectedTags={setSelectedEventTags}
          eventTags={eventTags}
          eventTagsLoading={eventTagsLoading}
          eventTagsError={eventTagsError}
          maxDistance={null}
          setMaxDistance={ignoreDistanceChange}
          selectedStartDate={selectedStartDate}
          setSelectedStartDate={setSelectedStartDate}
          selectedEndDate={selectedEndDate}
          setSelectedEndDate={setSelectedEndDate}
          divisionFilters={eventDivisionFilters}
          setDivisionFilters={setEventDivisionFilters}
          sports={sportOptions}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          kmBetween={kmBetween}
          events={mapScopedEvents}
          totalEvents={mapScopedEvents.length}
          isLoadingInitial={
            isMapScopePending ||
            isLoadingInitial ||
            (isActiveListPending && !eventsError)
          }
          isLoadingMore={
            !isMapScopePending && !isActiveListPending && isLoadingMore
          }
          hasMoreEvents={
            !isMapScopePending && !isActiveListPending && hasMoreEvents
          }
          hasScopedEventCache={eventCacheHasFilters}
          cacheStartDate={eventCacheStartDate}
          sentinelRef={sentinelRef}
          cacheFilterKey={eventCacheFilterKey}
          eventsError={eventsError}
          onRetry={() => {
            void (retryEventsFromStartRef.current
              ? loadFirstPage()
              : loadMoreEvents());
          }}
          onEventClick={handleSelectEvent}
          onCreateEvent={handleCreateEventNavigation}
          eventSort={eventSort}
          onEventSortChange={setEventSort}
        />
      </TabsContent>

      <TabsContent value="organizations" aria-label="Organizations">
        <OrganizationsTabContent
          showLegacyControls={false}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onOpenMap={handleSearchSubmit}
          location={location}
          selectedSports={selectedSports}
          setSelectedSports={setSelectedSports}
          selectedTags={selectedOrganizationTags}
          setSelectedTags={setSelectedOrganizationTags}
          divisionFilters={organizationDivisionFilters}
          setDivisionFilters={setOrganizationDivisionFilters}
          organizationTags={organizationTags}
          organizationTagsLoading={organizationTagsLoading}
          organizationTagsError={organizationTagsError}
          sports={sportOptions}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          maxDistance={null}
          setMaxDistance={ignoreDistanceChange}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          results={organizationResults}
          loading={
            isMapScopePending ||
            organizationsLoading ||
            (isActiveListPending && !organizationsError)
          }
          loadingMore={
            !isMapScopePending &&
            !isActiveListPending &&
            organizationsLoadingMore
          }
          hasMore={
            !isMapScopePending && !isActiveListPending && hasMoreOrganizations
          }
          sentinelRef={organizationsSentinelRef}
          error={organizationsError}
          onRetry={() => {
            void loadOrganizations(
              retryOrganizationsFromStartRef.current,
              searchTerm,
            );
          }}
          onSelectOrganization={handleSelectOrganization}
        />
      </TabsContent>

      <TabsContent value="rentals" aria-label="Rentals">
        <RentalsTabContent
          showLegacyControls={false}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onOpenMap={handleSearchSubmit}
          location={location}
          rentalsLoading={
            isMapScopePending ||
            rentalsLoading ||
            (isActiveListPending && !rentalsError)
          }
          rentalsLoadingMore={
            !isMapScopePending && !isActiveListPending && rentalsLoadingMore
          }
          hasMoreRentals={
            !isMapScopePending && !isActiveListPending && hasMoreRentals
          }
          sentinelRef={rentalsSentinelRef}
          rentalsError={rentalsError}
          onRetry={() => {
            void loadRentals(retryRentalsFromStartRef.current, searchTerm);
          }}
          rentalListings={mapScopedRentalListings}
          selectedSports={selectedSports}
          setSelectedSports={setSelectedSports}
          sports={sportOptions}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          maxDistance={null}
          setMaxDistance={ignoreDistanceChange}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          defaultTimeRange={defaultTimeRange}
          onSelectOrganization={(org, listings) =>
            handleSelectRentalOrganization(org, listings)
          }
        />
      </TabsContent>

      <TabsContent value="teams" aria-label="Teams">
        <TeamsTabContent
          showLegacyControls={false}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          onOpenMap={handleSearchSubmit}
          teams={filteredTeams}
          totalTeams={filteredTeams.length}
          loading={
            isMapScopePending ||
            teamsLoading ||
            (isActiveListPending && !teamsError)
          }
          loadingMore={
            !isMapScopePending && !isActiveListPending && teamsLoadingMore
          }
          hasMore={!isMapScopePending && !isActiveListPending && hasMoreTeams}
          sentinelRef={teamsSentinelRef}
          error={teamsError}
          onRetry={() => {
            void loadTeams(retryTeamsFromStartRef.current);
          }}
          selectedSports={teamSelectedSports}
          setSelectedSports={setTeamSelectedSports}
          sports={sportOptions}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          selectedDivisionTypeValues={teamSelectedDivisionTypeValues}
          setSelectedDivisionTypeValues={setTeamSelectedDivisionTypeValues}
          divisionTypeOptions={teamDivisionTypeOptions}
          onSelectTeam={handleSelectTeam}
        />
      </TabsContent>
    </Tabs>
  );
  const map = (
    <DiscoverMapModal
      opened
      embedded
      activeTab={activeTab}
      searchQuery={searchTerm}
      onClose={() => {}}
      onVisibleResultsChange={handleMapVisibleResultsChange}
      location={location}
      locationInfo={locationInfo}
      requestLocation={requestLocation}
      clearLocation={clearLocation}
      kmBetween={kmBetween}
      selectedSports={selectedSports}
      setSelectedSports={setSelectedSports}
      selectedTags={selectedEventTags}
      setSelectedTags={setSelectedEventTags}
      eventTags={eventTags}
      eventTagsLoading={eventTagsLoading}
      eventTagsError={eventTagsError}
      selectedEventTypes={selectedEventTypes}
      setSelectedEventTypes={setSelectedEventTypes}
      eventTypeOptions={EVENT_TYPE_OPTIONS}
      divisionFilters={eventDivisionFilters}
      setDivisionFilters={setEventDivisionFilters}
      organizationFilters={organizationFilters}
      rentalFilters={rentalFilters}
      teamFilters={teamFilters}
      sports={sportOptions}
      sportCategories={sportCategories}
      sportsLoading={sportsLoading}
      sportsError={sportsError?.message ?? null}
      maxDistance={null}
      setMaxDistance={ignoreDistanceChange}
      selectedStartDate={selectedStartDate}
      setSelectedStartDate={setSelectedStartDate}
      selectedEndDate={selectedEndDate}
      setSelectedEndDate={setSelectedEndDate}
      defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
      onEventClick={handleSelectEvent}
      onOrganizationClick={handleSelectOrganization}
      onTeamClick={handleSelectTeam}
    />
  );
  const toolbar = (
    <div className="discover-results-toolbar">
      {activeTab === "events" ? (
        <DiscoverFilterBar
          showAllFilters
          showSports={false}
          showDistanceFilter={false}
          location={location}
          selectedSports={selectedSports}
          setSelectedSports={setSelectedSports}
          sports={sportOptions}
          sportCategories={sportCategories}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          selectedEventTypes={selectedEventTypes}
          setSelectedEventTypes={setSelectedEventTypes}
          eventTypeOptions={EVENT_TYPE_OPTIONS}
          selectedTags={selectedEventTags}
          setSelectedTags={setSelectedEventTags}
          eventTags={eventTags}
          eventTagsLoading={eventTagsLoading}
          eventTagsError={eventTagsError}
          maxDistance={null}
          setMaxDistance={ignoreDistanceChange}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          divisionFilters={eventDivisionFilters}
          setDivisionFilters={setEventDivisionFilters}
          divisionOptions={eventDivisionOptions}
          activeFilterCount={activeFilterCount}
          resetFilters={resetActiveFilters}
        />
      ) : activeTab === "organizations" ? (
        <DiscoverTabFilterBar
          target="organizations"
          showAllFilters
          showSports={false}
          showDistanceFilter={false}
          location={location}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          sports={sportOptions}
          sportCategories={sportCategories}
          selectedSports={selectedSports}
          setSelectedSports={setSelectedSports}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          filters={organizationFilters}
          activeFilterCount={activeFilterCount}
          resetFilters={resetActiveFilters}
        />
      ) : activeTab === "rentals" ? (
        <DiscoverTabFilterBar
          target="rentals"
          showAllFilters
          showSports={false}
          showDistanceFilter={false}
          location={location}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          sports={sportOptions}
          sportCategories={sportCategories}
          selectedSports={selectedSports}
          setSelectedSports={setSelectedSports}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          filters={rentalFilters}
          activeFilterCount={activeFilterCount}
          resetFilters={resetActiveFilters}
        />
      ) : (
        <DiscoverTabFilterBar
          target="teams"
          showAllFilters
          showSports={false}
          showDistanceFilter={false}
          location={null}
          defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
          sports={sportOptions}
          sportCategories={sportCategories}
          selectedSports={teamSelectedSports}
          setSelectedSports={setTeamSelectedSports}
          sportsLoading={sportsLoading}
          sportsError={sportsError?.message ?? null}
          filters={teamFilters}
          activeFilterCount={activeFilterCount}
          resetFilters={resetActiveFilters}
        />
      )}
      {activeTab === "events" && (
        <Button
          type="button"
          radius="xl"
          onClick={handleCreateEventNavigation}
          leftSection={<Plus aria-hidden="true" size={16} />}
          className="discover-create-event"
        >
          Create event
        </Button>
      )}
    </div>
  );

  const search = (
    <div className="discover-search-hero">
      <DiscoverSearchBar
        activeTab={activeTab}
        onTabChange={handleActiveTabChange}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        locationControls={({ open, onOpenChange }) => (
          <LocationSearch
            inline
            open={open}
            onOpenChange={onOpenChange}
            displayLabel={locationLabel || undefined}
          />
        )}
        locationLabel={locationLabel}
        selectedStartDate={selectedStartDate}
        setSelectedStartDate={setSelectedStartDate}
        selectedEndDate={selectedEndDate}
        setSelectedEndDate={setSelectedEndDate}
        selectedSports={activeSports}
        setSelectedSports={setActiveSports}
        sports={sportOptions}
        sportCategories={sportCategories}
        sportsLoading={sportsLoading}
        sportsError={sportsError?.message ?? null}
        onSearch={handleSearchSubmit}
        expanded={searchExpanded}
        onExpandedChange={setSearchExpanded}
      />
    </div>
  );
  return (
    <>
      <Navigation />
      <Container fluid className="discover-shell discover-page">
        <div className="discover-split-results">
          <DiscoverResultsShell
            search={search}
            results={results}
            map={map}
            toolbar={toolbar}
          />
        </div>
      </Container>
    </>
  );
}

function OrganizationsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenMap: () => void;
  showLegacyControls?: boolean;
  location: { lat: number; lng: number } | null;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
  divisionFilters: DivisionDiscoveryFilterValue;
  setDivisionFilters: (value: DivisionDiscoveryFilterValue) => void;
  organizationTags: OrganizationTag[];
  organizationTagsLoading: boolean;
  organizationTagsError: string | null;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  results: OrganizationResult[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  onRetry: () => void;
  onSelectOrganization: (organization: Organization) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    showLegacyControls = true,
    location,
    selectedSports,
    setSelectedSports,
    selectedTags,
    setSelectedTags,
    divisionFilters,
    setDivisionFilters,
    organizationTags,
    organizationTagsLoading,
    organizationTagsError,
    sports,
    sportsLoading,
    sportsError,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    results,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    error,
    onRetry,
    onSelectOrganization,
  } = props;

  const activeQuery = searchTerm.trim();

  const hasResults = results.length > 0;
  const activeFilters: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: "query",
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(""),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () =>
        setSelectedSports((current) =>
          current.filter((value) => value !== sport),
        ),
    });
  });

  selectedTags.forEach((tagSlug) => {
    const tag = organizationTags.find(
      (option) => (option.slug ?? option.name) === tagSlug,
    );
    activeFilters.push({
      key: `tag-${tagSlug}`,
      label: tag?.name ?? tagSlug,
      onRemove: () =>
        setSelectedTags((current) =>
          current.filter((value) => value !== tagSlug),
        ),
    });
  });

  const hasDivisionFilters =
    divisionFilters.genders.length > 0 ||
    divisionFilters.skillDivisionTypeIds.length > 0 ||
    divisionFilters.ageDivisionTypeIds.length > 0 ||
    divisionFilters.priceMinDollars !== null ||
    divisionFilters.priceMaxDollars !== null;
  if (hasDivisionFilters) {
    activeFilters.push({
      key: "division-filters",
      label: "Division filters",
      onRemove: () => setDivisionFilters(EMPTY_DIVISION_FILTERS),
    });
  }

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedSports([]);
    setSelectedTags([]);
    setDivisionFilters(EMPTY_DIVISION_FILTERS);
  }, [setDivisionFilters, setSearchTerm, setSelectedSports, setSelectedTags]);

  const activeFilterCount = activeFilters.length;

  return (
    <div className="mb-8 space-y-6">
      {showLegacyControls && (
        <div className="discover-event-controls mb-8 space-y-4">
          <DiscoverSearchControls
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Search by name or description"
            onSearch={onSearchSubmit}
            onOpenMap={onOpenMap}
            searchLabel="Search organizations"
          />
          <DiscoverTabFilterBar
            target="organizations"
            location={location}
            defaultMaxDistance={defaultMaxDistance}
            showDistanceFilter={false}
            sports={sports}
            selectedSports={selectedSports}
            setSelectedSports={setSelectedSports}
            sportsLoading={sportsLoading}
            sportsError={sportsError}
            filters={{
              selectedTags,
              setSelectedTags,
              organizationTags,
              organizationTagsLoading,
              organizationTagsError,
              divisionFilters,
              setDivisionFilters,
              maxDistance,
              setMaxDistance,
            }}
            activeFilterCount={activeFilterCount}
            resetFilters={resetFilters}
          />
        </div>
      )}

      <div className="space-y-4">
        <Group
          className="discover-results-header"
          justify="space-between"
          align="center"
          gap="sm"
          wrap="wrap"
        >
          <div className="discover-results-summary">
            {(!error || hasResults) && (
              <Text size="sm" c="dimmed">
                {results.length} organization{results.length === 1 ? "" : "s"}
                {" in this map area."}
              </Text>
            )}
            <ActiveEventFilters
              filters={activeFilters}
              className="discover-active-event-filters"
              label="Active filters"
            />
          </div>
        </Group>

        {error && (
          <Alert color="red" radius="md">
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Text size="sm">{error}</Text>
              <Button
                variant="default"
                onClick={onRetry}
                disabled={loading || loadingMore}
              >
                Retry organizations
              </Button>
            </Group>
          </Alert>
        )}

        {loading ? (
          <OrganizationDataPlaceholder
            label="organizations"
            layout="cards"
            count={6}
          />
        ) : !hasResults && !error ? (
          <Paper withBorder p="xl" radius="md">
            <Text fw={600} mb={4}>
              No organizations found
            </Text>
            <Text size="sm" c="dimmed">
              {activeFilterCount
                ? "Try adjusting your current filters."
                : "Move the map or search to find organizations in another area."}
            </Text>
          </Paper>
        ) : (
          <ResponsiveCardGrid>
            {results.map(({ organization, distanceKm }) => (
              <OrganizationCard
                key={organization.$id}
                organization={organization}
                onClick={() => onSelectOrganization(organization)}
                actions={
                  typeof distanceKm === "number" ? (
                    <Text size="xs" c="dimmed">
                      {distanceKm.toFixed(1)} km away
                    </Text>
                  ) : undefined
                }
              />
            ))}
          </ResponsiveCardGrid>
        )}
        <div ref={sentinelRef} aria-hidden="true" />
        {loadingMore && (
          <OrganizationDataPlaceholder
            label="more organizations"
            layout="cards"
            count={3}
          />
        )}
        {!error && !hasMore && results.length > 0 && (
          <Text size="sm" c="dimmed" ta="center">
            No more organizations to load
          </Text>
        )}
      </div>
    </div>
  );
}

function TeamsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenMap: () => void;
  showLegacyControls?: boolean;
  teams: Team[];
  totalTeams: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  onRetry: () => void;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  selectedDivisionTypeValues: string[];
  setSelectedDivisionTypeValues: Dispatch<SetStateAction<string[]>>;
  divisionTypeOptions: TeamDivisionFilterOption[];
  onSelectTeam: (team: Team) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    showLegacyControls = true,
    teams,
    totalTeams,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    error,
    onRetry,
    selectedSports,
    setSelectedSports,
    sports,
    sportsLoading,
    sportsError,
    selectedDivisionTypeValues,
    setSelectedDivisionTypeValues,
    divisionTypeOptions,
    onSelectTeam,
  } = props;
  const activeQuery = searchTerm.trim();
  const divisionOptionByValue = useMemo(
    () => new Map(divisionTypeOptions.map((option) => [option.value, option])),
    [divisionTypeOptions],
  );

  const activeFilters: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }> = [];
  if (activeQuery) {
    activeFilters.push({
      key: "query",
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(""),
    });
  }
  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () =>
        setSelectedSports((current) =>
          current.filter((value) => value !== sport),
        ),
    });
  });
  selectedDivisionTypeValues.forEach((value) => {
    const option = divisionOptionByValue.get(value);
    if (!option) return;
    activeFilters.push({
      key: `division-${value}`,
      label: option.label,
      onRemove: () =>
        setSelectedDivisionTypeValues((current) =>
          current.filter((item) => item !== value),
        ),
    });
  });

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedSports([]);
    setSelectedDivisionTypeValues([]);
  }, [setSearchTerm, setSelectedSports, setSelectedDivisionTypeValues]);

  const activeFilterCount = activeFilters.length;

  return (
    <div className="mb-8 space-y-6">
      {showLegacyControls && (
        <div className="discover-event-controls mb-8 space-y-4">
          <DiscoverSearchControls
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Search teams with Open Registrations"
            onSearch={onSearchSubmit}
            onOpenMap={onOpenMap}
            searchLabel="Search teams"
          />
          <DiscoverTabFilterBar
            target="teams"
            location={null}
            defaultMaxDistance={FALLBACK_MAP_RADIUS_KM}
            sports={sports}
            selectedSports={selectedSports}
            setSelectedSports={setSelectedSports}
            sportsLoading={sportsLoading}
            sportsError={sportsError}
            filters={{
              selectedDivisionTypeValues,
              setSelectedDivisionTypeValues,
              divisionTypeOptions,
            }}
            activeFilterCount={activeFilterCount}
            resetFilters={resetFilters}
          />
        </div>
      )}

      <div className="space-y-4">
        <Group
          className="discover-results-header"
          justify="space-between"
          align="center"
          gap="sm"
          wrap="wrap"
        >
          <div className="discover-results-summary">
            {(!error || teams.length > 0) && (
              <Text size="sm" c="dimmed">
                {teams.length}
                {totalTeams !== teams.length ? ` of ${totalTeams}` : ""} open
                team{teams.length === 1 ? "" : "s"}
                {activeQuery ? ` matching "${activeQuery}".` : "."}
              </Text>
            )}
            <ActiveEventFilters
              filters={activeFilters}
              className="discover-active-event-filters"
              label="Active filters"
            />
          </div>
        </Group>

        {error && (
          <Alert color="red" radius="md">
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Text size="sm">{error}</Text>
              <Button
                variant="default"
                onClick={onRetry}
                disabled={loading || loadingMore}
              >
                Retry teams
              </Button>
            </Group>
          </Alert>
        )}

        {loading ? (
          <OrganizationDataPlaceholder
            label="open teams"
            layout="cards"
            count={6}
          />
        ) : teams.length === 0 && !error ? (
          <Paper withBorder p="xl" radius="md">
            <Text fw={600} mb={4}>
              No open-registration teams found
            </Text>
            <Text size="sm" c="dimmed">
              Try another team, sport, or division search.
            </Text>
          </Paper>
        ) : (
          <ResponsiveCardGrid>
            {teams.map((team) => (
              <TeamCard
                key={team.$id}
                team={team}
                onClick={() => onSelectTeam(team)}
                actions={
                  team.affiliateUrl?.trim() ? undefined : (
                    <Text size="xs" c="green" fw={600}>
                      Open registration
                    </Text>
                  )
                }
              />
            ))}
          </ResponsiveCardGrid>
        )}
        <div ref={sentinelRef} aria-hidden="true" />
        {loadingMore && (
          <OrganizationDataPlaceholder
            label="more open teams"
            layout="cards"
            count={3}
          />
        )}
        {!error && !hasMore && teams.length > 0 && (
          <Text size="sm" c="dimmed" ta="center">
            No more teams to load
          </Text>
        )}
      </div>
    </div>
  );
}

function RentalsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenMap: () => void;
  showLegacyControls?: boolean;
  location: { lat: number; lng: number } | null;
  rentalsLoading: boolean;
  rentalsLoadingMore: boolean;
  hasMoreRentals: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  rentalsError: string | null;
  onRetry: () => void;
  rentalListings: RentalListing[];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  timeRange: [number, number];
  setTimeRange: (range: [number, number]) => void;
  defaultTimeRange: [number, number];
  onSelectOrganization: (
    organization: Organization,
    listings: RentalListing[],
  ) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    showLegacyControls = true,
    location,
    rentalsLoading,
    rentalsLoadingMore,
    hasMoreRentals,
    sentinelRef,
    rentalsError,
    onRetry,
    rentalListings,
    selectedSports,
    setSelectedSports,
    sports,
    sportsLoading,
    sportsError,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    timeRange,
    setTimeRange,
    defaultTimeRange,
    onSelectOrganization,
  } = props;

  const activeQuery = searchTerm.trim();

  const filteredListings = useMemo(() => {
    const [startHour, endHour] = timeRange;
    return rentalListings.filter((listing) => {
      if (!rentalResourceMatchesSports(listing, selectedSports)) {
        return false;
      }
      if (activeQuery) {
        const searchBlob =
          `${listing.organization.name} ${listing.organization.description ?? ""} ${listing.organization.location ?? ""} ${listing.facility?.name ?? ""} ${listing.facility?.location ?? ""} ${listing.field?.name ?? ""} ${listing.field?.location ?? ""}`.toLowerCase();
        if (!searchBlob.includes(activeQuery.toLowerCase())) {
          return false;
        }
      }
      if (listing.kind !== "slot") {
        return true;
      }
      const start = listing.nextOccurrence;
      const hour = start.getHours() + start.getMinutes() / 60;
      return hour >= startHour && hour < endHour;
    });
  }, [rentalListings, timeRange, selectedSports, activeQuery]);

  const rentalCards = useMemo<RentalCardEntry[]>(() => {
    const groupedSlots = new Map<
      string,
      { organization: Organization; listings: RentalListing[] }
    >();
    const entries: RentalCardEntry[] = [];

    filteredListings.forEach((listing) => {
      if (listing.kind === "affiliateFacility" && listing.facility) {
        const facilityName = listing.facility.name?.trim();
        const facilityLocation = listing.facility.location?.trim();
        entries.push({
          key: `affiliate-${listing.organization.$id}-${listing.facility.$id}`,
          organization: {
            ...listing.organization,
            name: facilityName || listing.organization.name,
            location: facilityLocation || listing.organization.location,
            address: listing.facility.address || listing.organization.address,
            description:
              listing.organization.name === facilityName
                ? listing.organization.description
                : [listing.organization.name, listing.organization.description]
                    .filter(Boolean)
                    .join(" - "),
          },
          listings: [listing],
          actionLabel: "External booking",
        });
        return;
      }

      const orgId = listing.organization.$id;
      const existing = groupedSlots.get(orgId);
      if (existing) {
        existing.listings.push(listing);
      } else {
        groupedSlots.set(orgId, {
          organization: listing.organization,
          listings: [listing],
        });
      }
    });

    Array.from(groupedSlots.values()).forEach((entry) => {
      entries.push({
        key: `organization-${entry.organization.$id}`,
        organization: entry.organization,
        listings: entry.listings,
        actionLabel: `${entry.listings.length} rental${entry.listings.length === 1 ? "" : "s"} available`,
      });
    });

    return entries;
  }, [filteredListings]);

  const activeFilters: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: "query",
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(""),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () =>
        setSelectedSports((current) =>
          current.filter((value) => value !== sport),
        ),
    });
  });

  if (
    timeRange[0] !== defaultTimeRange[0] ||
    timeRange[1] !== defaultTimeRange[1]
  ) {
    activeFilters.push({
      key: "time-range",
      label: `${formatRentalHourLabel(timeRange[0])} - ${formatRentalHourLabel(timeRange[1])}`,
      onRemove: () => setTimeRange(defaultTimeRange),
    });
  }

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedSports([]);
    setTimeRange(defaultTimeRange);
  }, [setSearchTerm, setSelectedSports, setTimeRange, defaultTimeRange]);

  const activeFilterCount = activeFilters.length;

  return (
    <div className="mb-8 space-y-6">
      {showLegacyControls && (
        <div className="discover-event-controls mb-8 space-y-4">
          <DiscoverSearchControls
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Search organizations and fields..."
            onSearch={onSearchSubmit}
            onOpenMap={onOpenMap}
            searchLabel="Search rentals"
          />
          <DiscoverTabFilterBar
            target="rentals"
            location={location}
            defaultMaxDistance={defaultMaxDistance}
            showDistanceFilter={false}
            sports={sports}
            selectedSports={selectedSports}
            setSelectedSports={setSelectedSports}
            sportsLoading={sportsLoading}
            sportsError={sportsError}
            filters={{
              timeRange,
              setTimeRange,
              defaultTimeRange,
              maxDistance,
              setMaxDistance,
            }}
            activeFilterCount={activeFilterCount}
            resetFilters={resetFilters}
          />
        </div>
      )}

      <div className="space-y-4">
        <Group
          className="discover-results-header"
          justify="space-between"
          align="center"
          gap="sm"
          wrap="wrap"
        >
          <div className="discover-results-summary">
            {(!rentalsError || rentalCards.length > 0) && (
              <Text size="sm" c="dimmed">
                {rentalCards.length} rental listing
                {rentalCards.length === 1 ? "" : "s"}
                {" in this map area."}
              </Text>
            )}
            <ActiveEventFilters
              filters={activeFilters}
              className="discover-active-event-filters"
              label="Active filters"
            />
          </div>
        </Group>

        {rentalsError && (
          <Alert color="red">
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Text size="sm">{rentalsError}</Text>
              <Button
                variant="default"
                onClick={onRetry}
                disabled={rentalsLoading || rentalsLoadingMore}
              >
                Retry rentals
              </Button>
            </Group>
          </Alert>
        )}

        {rentalsLoading ? (
          <OrganizationDataPlaceholder
            label="rentals"
            layout="cards"
            count={6}
          />
        ) : rentalCards.length === 0 && !rentalsError ? (
          <Paper withBorder p="xl" radius="md">
            <Text fw={600} mb={4}>
              No rentals available
            </Text>
            <Text size="sm" c="dimmed">
              Try adjusting your current filters to explore more fields.
            </Text>
          </Paper>
        ) : (
          <ResponsiveCardGrid>
            {rentalCards.map(({ key, organization, listings, actionLabel }) => (
              <OrganizationCard
                key={key}
                organization={organization}
                onClick={() => onSelectOrganization(organization, listings)}
                actions={
                  <Text size="xs" c="dimmed">
                    {actionLabel}
                  </Text>
                }
              />
            ))}
          </ResponsiveCardGrid>
        )}
        <div ref={sentinelRef} aria-hidden="true" />
        {rentalsLoadingMore && (
          <OrganizationDataPlaceholder
            label="more rentals"
            layout="cards"
            count={3}
          />
        )}
        {!rentalsError && !hasMoreRentals && rentalCards.length > 0 && (
          <Text size="sm" c="dimmed" ta="center">
            No more rentals to load
          </Text>
        )}
      </div>
    </div>
  );
}
