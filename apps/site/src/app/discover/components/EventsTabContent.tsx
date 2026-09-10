'use client';

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  Alert,
  Button,
  Chip,
  Group,
  Loader,
  Paper,
  Select,
  Text,
  TextInput,
} from '@/components/organization/organization-operation-ui';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowUpDown } from 'lucide-react';

import OrganizationEventCard from '@/components/organization/OrganizationEventCard';
import {
  ActiveEventFilters,
  EVENT_SORT_OPTIONS,
  EventFilterPanel,
  type EventSortValue,
} from '@/components/events/EventFilterControls';
import Loading from '@/components/ui/Loading';
import {
  eventListFilterKey,
  useEventListFiltering,
} from '@/components/events/event-list-filtering';
import { Event, EventTag, getEventDivisionPriceRange } from '@/types';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { trackEventClicked } from '@/lib/analytics/eventAnalytics';
import DiscoverFilterBar, { DiscoverSportFilterList } from './DiscoverFilterBar';
import DiscoverSearchControls from './DiscoverSearchControls';
import DivisionDiscoveryFilters, { type DivisionDiscoveryFilterValue, useDivisionDiscoveryOptions } from './DivisionDiscoveryFilters';

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
  sentinelRef: RefObject<HTMLDivElement | null>;
  eventsError: string | null;
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
    sentinelRef,
    eventsError,
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
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const allEventTypesSelected = selectedEventTypes.length === eventTypeOptions.length;
  const allTagsSelected = selectedTags.length === 0;
  const tagsQuery = tagSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();
  const divisionOptions = useDivisionDiscoveryOptions(selectedSports);

  const visibleEventTags = useMemo(() => {
    const matchingTags = tagsQuery
      ? eventTags.filter((tag) => tag.name.toLowerCase().includes(tagsQuery))
      : eventTags;
    return matchingTags
      .slice()
      .sort((a, b) => {
        const countDiff = (b.eventCount ?? 0) - (a.eventCount ?? 0);
        return countDiff || a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [eventTags, tagsQuery]);

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
  const { visibleEvents, isRefreshing, refreshError } = useEventListFiltering({
    events,
    filters: eventFilters,
    filterKey: eventListFilterKey(eventFilters),
    hasMoreEvents,
    hasScopedEventCache,
    cacheStartDate,
    onFilterChange,
  });

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
  const eventReadoutCount = activeFilterCount > 0
    ? sortedEvents.length
    : typeof totalEvents === 'number'
      ? totalEvents
      : sortedEvents.length;
  const hasActiveDistanceFilter = Boolean(location && typeof maxDistance === 'number');

  const renderTagFilters = () => (
    <div>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
        Tags
      </Text>
      <TextInput
        value={tagSearchTerm}
        onChange={(event) => setTagSearchTerm(event.currentTarget.value)}
        placeholder="Search tag..."
        mb="sm"
      />
      <Group gap="xs">
        <Chip
          color="blue"
          radius="xl"
          checked={allTagsSelected}
          disabled={eventTagsLoading || !eventTags.length}
          onChange={(checked) => {
            if (checked) setSelectedTags([]);
          }}
        >
          All
        </Chip>
        {eventTagsLoading ? (
          <Loader size="sm" aria-label="Loading tags" />
        ) : visibleEventTags.length ? (
          visibleEventTags.map((tag) => (
            <Chip
              key={tag.slug || tag.name}
              color="blue"
              radius="xl"
              checked={selectedTags.includes(tag.name)}
              onChange={(checked) => {
                setSelectedTags((current) => {
                  if (checked) {
                    const next = new Set(current);
                    next.add(tag.name);
                    return Array.from(next);
                  }
                  return current.filter((value) => value !== tag.name);
                });
              }}
            >
              {tag.name} ({tag.eventCount ?? 0})
            </Chip>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            {tagsQuery ? 'No tags match this search.' : 'No tags available.'}
          </Text>
        )}
      </Group>
      {eventTagsError && (
        <Alert color="red" radius="md" mt="sm">
          {eventTagsError}
        </Alert>
      )}
    </div>
  );


  const sportsData = sports.map((sport) => ({ value: sport, label: sport }));
  const eventTypeData = eventTypeOptions.map((type) => ({
    value: type,
    label: formatEnumDisplayLabel(type, 'Event'),
  }));
  const selectedEventTypeLabels = allEventTypesSelected
    ? 'All event types'
    : selectedEventTypes.map((type) => formatEnumDisplayLabel(type, 'Event')).join(', ');

  const sharedFilterProps = {
    location,
    selectedSports,
    setSelectedSports,
    sportsData,
    sportsLoading,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeData,
    selectedEventTypeLabels,
    selectedStartDate,
    setSelectedStartDate,
    selectedEndDate,
    setSelectedEndDate,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    sportsError,
    hideWeeklyChildren,
    setHideWeeklyChildren,
    resetFilters,
    hasActiveFilters: activeFilterCount > 0,
  };

  const filterPanel = (
    <div className="discover-filter-sheet-stack">
      <DiscoverSportFilterList
        sports={sports}
        selectedSports={selectedSports}
        setSelectedSports={setSelectedSports}
        sportsLoading={sportsLoading}
      />
      {renderTagFilters()}
      <EventFilterPanel
        {...sharedFilterProps}
        showSports={false}
        dateHeading="Date Range"
      />
      <DivisionDiscoveryFilters
        value={divisionFilters}
        onChange={setDivisionFilters}
        selectedSports={selectedSports}
        options={divisionOptions}
      />
    </div>
  );

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
        selectedEndDate={selectedEndDate}
        setSelectedEndDate={setSelectedEndDate}
        divisionFilters={divisionFilters}
        setDivisionFilters={setDivisionFilters}
        divisionOptions={divisionOptions}
        activeFilterCount={activeFilterCount}
        resetFilters={resetFilters}
        onOpenMoreFilters={() => setIsFiltersOpen(true)}
      />
    </div>
  );


  const renderEventCards = () => (
    isLoadingInitial ? (
      <Loading text="Loading events..." />
    ) : sortedEvents.length === 0 ? (
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
        <div className="org-event-grid discover-event-grid">
          {sortedEvents.map((event) => (
            <OrganizationEventCard
              key={event.$id}
              event={event}
              onClick={() => {
                trackEventClicked(event, 'discover_events');
                onEventClick(event);
              }}
            />
          ))}
        </div>
        <div ref={sentinelRef} style={{ height: 1 }} />
        {isLoadingMore && (
          <Group justify="center" mt="lg">
            <Loader />
          </Group>
        )}
        {!hasMoreEvents && (
          <Text size="sm" c="dimmed" ta="center" mt="lg">
            You&apos;ve reached the end of the results.
          </Text>
        )}
      </>
    )
  );


  const renderResults = () => (
    <div className="space-y-4">
      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
        <Text size="sm" c="dimmed">
          {eventReadoutCount} event{eventReadoutCount === 1 ? '' : 's'} {hasActiveDistanceFilter ? 'near you' : 'available'}.
        </Text>
        <Select
          aria-label="Sort events"
          data={EVENT_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={eventSort}
          onChange={(value) => setEventSort((value as EventSortValue) ?? 'recommended')}
          leftSection={<ArrowUpDown size={14} />}
          style={{ minWidth: 220 }}
        />
      </Group>

      <ActiveEventFilters filters={activeFilters} className="discover-active-event-filters" label="Active filters" />

      {(eventsError || refreshError) && (
        <Alert color="red">
          {eventsError ?? refreshError}
        </Alert>
      )}

      {isRefreshing && !isLoadingInitial && (
        <Text role="status" aria-live="polite" size="sm" c="dimmed">
          Updating events…
        </Text>
      )}

      {renderEventCards()}
    </div>
  );

  return (
    <>
      {renderSearchActions()}

      <Sheet open={isFiltersOpen} onOpenChange={(open) => setIsFiltersOpen(open)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filter Events</SheetTitle>
            <SheetDescription>Adjust event type, sport, date, division, and distance filters.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <Group justify="space-between" align="center" mb="md">
              <Text fw={700} size="sm">Filters</Text>
              <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
                Reset
              </Button>
            </Group>
            {filterPanel}
          </div>
        </SheetContent>
      </Sheet>

      <div className="discover-event-results">
        {renderResults()}
      </div>
    </>
  );
}
