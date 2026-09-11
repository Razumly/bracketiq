'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Text,
} from '@/components/organization/organization-operation-ui';
import { ArrowUpDown } from 'lucide-react';

import OrganizationEventCard from '@/components/organization/OrganizationEventCard';
import {
  ActiveEventFilters,
  EVENT_SORT_OPTIONS,
  type EventSortValue,
} from '@/components/events/EventFilterControls';
import Loading from '@/components/ui/Loading';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import {
  eventListFilterKey,
  useEventListFiltering,
} from '@/components/events/event-list-filtering';
import { Event, EventTag, getEventDivisionPriceRange } from '@/types';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { trackEventClicked } from '@/lib/analytics/eventAnalytics';
import DiscoverFilterBar from './DiscoverFilterBar';
import DiscoverSearchControls from './DiscoverSearchControls';
import { type DivisionDiscoveryFilterValue, useDivisionDiscoveryOptions } from './DivisionDiscoveryFilters';

export type { EventSortValue };

const KM_PER_MILE = 1.60934;
const EMPTY_DIVISION_FILTERS: DivisionDiscoveryFilterValue = {
  genders: [],
  skillDivisionTypeIds: [],
  ageDivisionTypeIds: [],
  priceMinDollars: null,
  priceMaxDollars: null,
};

const kmToMiles = (value: number): number => value / KM_PER_MILE;

type EventsTabContentProps<TEventType extends string = Event['eventType']> = {
  location: { lat: number; lng: number } | null;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  onSearchSubmit?: () => void;
  onOpenMap?: () => void;
  showLegacyControls?: boolean;
  selectedEventTypes: TEventType[];
  setSelectedEventTypes: (value: TEventType[]) => void;
  eventTypeOptions: readonly TEventType[];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  selectedTags?: string[];
  setSelectedTags?: Dispatch<SetStateAction<string[]>>;
  eventTags?: EventTag[];
  eventTagsLoading?: boolean;
  eventTagsError?: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  divisionFilters?: DivisionDiscoveryFilterValue;
  setDivisionFilters?: (value: DivisionDiscoveryFilterValue) => void;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  defaultMaxDistance: number;
  kmBetween: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  events: Event[];
  totalEvents: number | null;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMoreEvents: boolean;
  hasScopedEventCache?: boolean;
  cacheStartDate?: string;
  cacheFilterKey?: string | null;
  sentinelRef: RefObject<HTMLDivElement | null>;
  eventsError: string | null;
  onRetry: () => void;
  onFilterChange?: () => Promise<void> | void;
  onEventClick: (event: Event) => void;
  onCreateEvent: () => void;
  showCreateEventButton?: boolean;
  createEventDisabled?: boolean;
  createEventHelperText?: string | null;
  hideWeeklyChildren?: boolean;
  setHideWeeklyChildren?: (value: boolean) => void;
  defaultSort?: EventSortValue;
  eventSort?: EventSortValue;
  onEventSortChange?: (value: EventSortValue) => void;
};

function eventTagOptions<T extends string>(props: EventsTabContentProps<T>) {
  return {
    selectedTags: props.selectedTags ?? [],
    setSelectedTags: props.setSelectedTags ?? (() => {}),
    eventTags: props.eventTags ?? [],
    eventTagsLoading: props.eventTagsLoading ?? false,
    eventTagsError: props.eventTagsError ?? null,
  };
}

function eventViewOptions<T extends string>(props: EventsTabContentProps<T>) {
  return {
    ...props,
    ...eventTagOptions(props),
    onSearchSubmit: props.onSearchSubmit ?? (() => {}),
    divisionFilters: props.divisionFilters ?? EMPTY_DIVISION_FILTERS,
    setDivisionFilters: props.setDivisionFilters ?? (() => {}),
    showLegacyControls: props.showLegacyControls ?? true,
    showCreateEventButton: props.showCreateEventButton ?? true,
    createEventDisabled: props.createEventDisabled ?? false,
    createEventHelperText: props.createEventHelperText ?? null,
    hideWeeklyChildren: props.hideWeeklyChildren ?? false,
    defaultSort: props.defaultSort ?? 'recommended',
  };
}

type ActiveEventFilter = { key: string; label: string; onRemove: () => void };

function hasDivisionFilters(value: DivisionDiscoveryFilterValue) {
  return value.genders.length > 0 || value.skillDivisionTypeIds.length > 0
    || value.ageDivisionTypeIds.length > 0 || value.priceMinDollars !== null
    || value.priceMaxDollars !== null;
}

export default function EventsTabContent<TEventType extends string = Event['eventType']>(
  props: EventsTabContentProps<TEventType>,
) {
  return <EventsTabView {...eventViewOptions(props)} />;
}

function EventsTabView<TEventType extends string>(
  props: ReturnType<typeof eventViewOptions<TEventType>>,
) {
  const {
    location,
    searchTerm,
    setSearchTerm,
    onSearchSubmit,
    onOpenMap,
    showLegacyControls,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    selectedSports,
    setSelectedSports,
    selectedTags,
    setSelectedTags,
    eventTags,
    eventTagsLoading,
    eventTagsError,
    maxDistance,
    setMaxDistance,
    selectedStartDate,
    setSelectedStartDate,
    selectedEndDate,
    setSelectedEndDate,
    divisionFilters,
    setDivisionFilters,
    sports,
    sportsLoading,
    sportsError,
    defaultMaxDistance,
    kmBetween,
    events,
    totalEvents,
    isLoadingInitial,
    isLoadingMore,
    hasMoreEvents,
    hasScopedEventCache,
    cacheStartDate,
    cacheFilterKey,
    sentinelRef,
    eventsError,
    onRetry,
    onFilterChange,
    onEventClick,
    onCreateEvent,
    showCreateEventButton,
    createEventDisabled,
    createEventHelperText,
    hideWeeklyChildren,
    setHideWeeklyChildren,
    defaultSort,
    eventSort: controlledEventSort,
    onEventSortChange,
  } = props;

  const [internalEventSort, setInternalEventSort] = useState<EventSortValue>(defaultSort);
  const eventSort = controlledEventSort ?? internalEventSort;
  const setEventSort = useCallback((value: EventSortValue) => {
    if (onEventSortChange) {
      onEventSortChange(value);
      return;
    }
    setInternalEventSort(value);
  }, [onEventSortChange]);
  const allEventTypesSelected = selectedEventTypes.length === eventTypeOptions.length;
  const activeQuery = searchTerm.trim();
  const divisionOptions = useDivisionDiscoveryOptions(selectedSports);

  const resetFilters = useCallback(() => {
    setSelectedEventTypes([...eventTypeOptions]);
    setSelectedSports([]);
    setSelectedTags([]);
    setMaxDistance(null);
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setDivisionFilters({
      genders: [],
      skillDivisionTypeIds: [],
      ageDivisionTypeIds: [],
      priceMinDollars: null,
      priceMaxDollars: null,
    });
    setSearchTerm('');
  }, [
    eventTypeOptions,
    setMaxDistance,
    setSearchTerm,
    setSelectedStartDate,
    setSelectedEndDate,
    setSelectedEventTypes,
    setDivisionFilters,
    setSelectedSports,
    setSelectedTags,
  ]);

  const getEventDistanceKm = useCallback((event: Event) => {
    if (!location || !Array.isArray(event.coordinates) || event.coordinates.length < 2) {
      return undefined;
    }
    const [lng, lat] = event.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }
    try {
      return kmBetween(location, { lat, lng });
    } catch {
      return undefined;
    }
  }, [kmBetween, location]);

  const eventFilters = useMemo(() => ({
    searchTerm,
    selectedEventTypes,
    eventTypeOptions,
    selectedSports,
    selectedTags,
    selectedStartDate,
    selectedEndDate,
    location,
    maxDistance,
    hideWeeklyChildren,
    divisionFilters,
    getEventDistanceKm,
  }), [
    divisionFilters,
    eventTypeOptions,
    getEventDistanceKm,
    hideWeeklyChildren,
    location,
    maxDistance,
    searchTerm,
    selectedEndDate,
    selectedEventTypes,
    selectedSports,
    selectedStartDate,
    selectedTags,
  ]);
  const currentFilterKey = eventListFilterKey(eventFilters);
  const { visibleEvents, refreshError, isRefreshing, retryRefresh } = useEventListFiltering({
    events,
    filters: eventFilters,
    filterKey: currentFilterKey,
    hasMoreEvents,
    hasScopedEventCache,
    cacheStartDate,
    onFilterChange,
  });
  const resultsError = eventsError ?? refreshError;
  const cacheMatchesCurrentFilters = hasScopedEventCache === true
    && (cacheFilterKey === undefined || cacheFilterKey === currentFilterKey)
    && !isRefreshing;

  const sortedEvents = useMemo(() => {
    const sourceEvents = hideWeeklyChildren
      ? visibleEvents.filter((event) => !(event.eventType === 'WEEKLY_EVENT' && typeof event.parentEvent === 'string' && event.parentEvent.trim().length > 0))
      : visibleEvents;
    const sorted = [...sourceEvents];

    const compareByStart = (a: Event, b: Event) => {
      const aTime = new Date(a.nextOccurrence?.start ?? a.start).getTime();
      const bTime = new Date(b.nextOccurrence?.start ?? b.start).getTime();
      return aTime - bTime;
    };

    switch (eventSort) {
      case 'recommended':
        break;
      case 'nearest':
        sorted.sort((a, b) => {
          const aDistance = getEventDistanceKm(a);
          const bDistance = getEventDistanceKm(b);
          if (typeof aDistance === 'number' && typeof bDistance === 'number') {
            return aDistance - bDistance;
          }
          if (typeof aDistance === 'number') return -1;
          if (typeof bDistance === 'number') return 1;
          return compareByStart(a, b);
        });
        break;
      case 'price-low':
        sorted.sort((a, b) => {
          const aMinPrice = getEventDivisionPriceRange(a).minPriceCents;
          const bMinPrice = getEventDivisionPriceRange(b).minPriceCents;
          return aMinPrice - bMinPrice || compareByStart(a, b);
        });
        break;
      case 'popular':
        sorted.sort((a, b) => b.attendees - a.attendees || compareByStart(a, b));
        break;
      case 'alpha':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'soonest':
      default:
        sorted.sort(compareByStart);
        break;
    }

    return sorted;
  }, [eventSort, getEventDistanceKm, hideWeeklyChildren, visibleEvents]);

  const categoryFilterChips = (): ActiveEventFilter[] => {
    const activeFilters: ActiveEventFilter[] = [];
    if (activeQuery) {
      activeFilters.push({
        key: 'query',
        label: `Search: ${activeQuery}`,
        onRemove: () => setSearchTerm(''),
      });
    }

    if (!allEventTypesSelected) {
      selectedEventTypes.forEach((type) => {
        activeFilters.push({
          key: `event-type-${type}`,
          label: formatEnumDisplayLabel(type, 'Event'),
          onRemove: () => setSelectedEventTypes(selectedEventTypes.filter((value) => value !== type)),
        });
      });
    }

    selectedSports.forEach((sport) => {
      activeFilters.push({
        key: `sport-${sport}`,
        label: sport,
        onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
      });
    });

    selectedTags.forEach((tag) => {
      activeFilters.push({
        key: `tag-${tag}`,
        label: tag,
        onRemove: () => setSelectedTags((current) => current.filter((value) => value !== tag)),
      });
    });
    return activeFilters;
  };

  const rangeFilterChips = (): ActiveEventFilter[] => {
    const activeFilters: ActiveEventFilter[] = [];
    if (selectedStartDate) {
      activeFilters.push({
        key: 'date-from',
        label: `From ${selectedStartDate.toLocaleDateString()}`,
        onRemove: () => setSelectedStartDate(null),
      });
    }

    if (selectedEndDate) {
      activeFilters.push({
        key: 'date-to',
        label: `Until ${selectedEndDate.toLocaleDateString()}`,
        onRemove: () => setSelectedEndDate(null),
      });
    }

    if (hasDivisionFilters(divisionFilters)) {
      activeFilters.push({
        key: 'division-filters',
        label: 'Division filters',
        onRemove: () => setDivisionFilters({
          genders: [],
          skillDivisionTypeIds: [],
          ageDivisionTypeIds: [],
          priceMinDollars: null,
          priceMaxDollars: null,
        }),
      });
    }

    if (location && typeof maxDistance === 'number') {
      activeFilters.push({
        key: 'distance',
        label: `Within ${Math.round(kmToMiles(maxDistance))} mi`,
        onRemove: () => setMaxDistance(null),
      });
    }
    return activeFilters;
  };

  const visibilityFilterChips = (): ActiveEventFilter[] => {
    const activeFilters: ActiveEventFilter[] = [];
    if (hideWeeklyChildren && setHideWeeklyChildren) {
      activeFilters.push({
        key: 'hide-weekly-children',
        label: 'Hide weekly sessions',
        onRemove: () => setHideWeeklyChildren(false),
      });
    }
    return activeFilters;
  };

  const activeFilters = [...categoryFilterChips(), ...rangeFilterChips(), ...visibilityFilterChips()];

  const activeFilterCount = activeFilters.length;
  const eventReadoutCount = cacheMatchesCurrentFilters && typeof totalEvents === 'number'
    ? totalEvents
    : activeFilterCount > 0
      ? sortedEvents.length
      : typeof totalEvents === 'number'
        ? totalEvents
        : sortedEvents.length;
  const hasActiveDistanceFilter = Boolean(location && typeof maxDistance === 'number');


  const renderSearchActions = () => (
    <div className="discover-event-controls mb-8 space-y-4">
      <DiscoverSearchControls
        value={searchTerm}
        onValueChange={setSearchTerm}
        placeholder="Search events"
        onSearch={onSearchSubmit}
        onOpenMap={onOpenMap}
        onCreateEvent={onCreateEvent}
        showCreateEventButton={showCreateEventButton}
        createEventDisabled={createEventDisabled}
        createEventHelperText={createEventHelperText}
        searchLabel="Search events"
      />
      <DiscoverFilterBar
        location={location}
        selectedSports={selectedSports}
        setSelectedSports={setSelectedSports}
        sports={sports}
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
        maxDistance={maxDistance}
        setMaxDistance={setMaxDistance}
        defaultMaxDistance={defaultMaxDistance}
        selectedStartDate={selectedStartDate}
        setSelectedStartDate={setSelectedStartDate}
        setSelectedEndDate={setSelectedEndDate}
        selectedEndDate={selectedEndDate}
        divisionFilters={divisionFilters}
        setDivisionFilters={setDivisionFilters}
        divisionOptions={divisionOptions}
        activeFilterCount={activeFilterCount}
        resetFilters={resetFilters}
        hideWeeklyChildren={hideWeeklyChildren}
        setHideWeeklyChildren={setHideWeeklyChildren}
      />
    </div>
  );


  const renderEventCards = () => (
    isLoadingInitial ? (
      <Loading text="Loading events..." />
    ) : sortedEvents.length === 0 && !resultsError ? (
      <Paper withBorder p="xl" radius="lg">
        <Text fw={700} mb={6}>
          No events match your filters
        </Text>
        <Text size="sm" c="dimmed" mb={12}>
          Try increasing distance, removing a sport filter, or clearing all filters.
        </Text>
        <Button variant="default" onClick={resetFilters}>
          Clear filters
        </Button>
      </Paper>
    ) : (
      <>
        <ResponsiveCardGrid className="discover-card-grid discover-event-grid">
          {sortedEvents.map((event) => (
            <OrganizationEventCard
              key={event.$id}
              event={event}
              userLocation={location}
              onClick={() => {
                trackEventClicked(event, 'discover_events');
                onEventClick(event);
              }}
            />
          ))}
        </ResponsiveCardGrid>
        <div ref={sentinelRef} style={{ height: 1 }} />
        {isLoadingMore && (
          <Group justify="center" mt="lg">
            <Loader />
          </Group>
        )}
        {!resultsError && !hasMoreEvents && (
          <Text size="sm" c="dimmed" ta="center" mt="lg">
            You&apos;ve reached the end of the results.
          </Text>
        )}
      </>
    )
  );


  const renderResults = () => (
    <div className="space-y-4">
      <Group className="discover-results-header" justify="space-between" align="center" gap="sm" wrap="wrap">
        <div className="discover-results-summary">
          {(!resultsError || sortedEvents.length > 0) && (
            <Text size="sm" c="dimmed">
              {eventReadoutCount} event{eventReadoutCount === 1 ? '' : 's'} {hasActiveDistanceFilter ? 'near you' : 'available'}.
            </Text>
          )}
          <ActiveEventFilters filters={activeFilters} className="discover-active-event-filters" label="Active filters" />
        </div>
        <Select
          aria-label="Sort events"
          data={EVENT_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={eventSort}
          onChange={(value) => setEventSort((value as EventSortValue) ?? 'recommended')}
          leftSection={<ArrowUpDown size={14} />}
          style={{ minWidth: 220 }}
        />
      </Group>

      {resultsError && (
        <Alert color="red">
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Text size="sm">{resultsError}</Text>
            <Button
              variant="default"
              onClick={eventsError ? onRetry : retryRefresh}
              disabled={isLoadingInitial || isLoadingMore || isRefreshing}
            >
              Retry events
            </Button>
          </Group>
        </Alert>
      )}

      {renderEventCards()}
    </div>
  );

  return (
    <>
      {showLegacyControls && renderSearchActions()}


      <div className="discover-event-results">
        {renderResults()}
      </div>
    </>
  );
}
