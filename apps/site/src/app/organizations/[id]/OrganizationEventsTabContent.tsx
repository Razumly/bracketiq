'use client';

import { useCallback, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Filter,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import {
  Alert,
  Button,
  Checkbox,
  DatePickerInput,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@/components/organization/organization-operation-ui';
import EventCard from '@/components/ui/EventCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import type { Event } from '@/types';
import { getEventDivisionPriceRange } from '@/types';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import {
  eventListFilterKey,
  useEventListFiltering,
} from '@/components/events/event-list-filtering';

const KM_PER_MILE = 1.60934;
const DISTANCE_SLIDER_MIN_MILES = 10;
const DISTANCE_SLIDER_MAX_MILES = 100;

const EVENT_SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'soonest', label: 'Soonest' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'popular', label: 'Most popular' },
  { value: 'alpha', label: 'A to Z' },
] as const;

type EventSortValue = (typeof EVENT_SORT_OPTIONS)[number]['value'];
type EventSegment = 'upcoming' | 'drafts' | 'past';
type EventLocation = { lat: number; lng: number } | null;
type EventDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
type EventTypeOption<TEventType extends string> = readonly TEventType[];
type EventFilter = { key: string; label: string; onRemove: () => void };

type OrganizationEventsTabContentProps<TEventType extends string = Event['eventType']> = {
  organizationName: string;
  location: EventLocation;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedEventTypes: TEventType[];
  setSelectedEventTypes: (value: TEventType[]) => void;
  eventTypeOptions: EventTypeOption<TEventType>;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  defaultMaxDistance: number;
  kmBetween: EventDistance;
  events: Event[];
  totalEvents: number | null;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMoreEvents: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  eventsError: string | null;
  onFilterChange?: () => Promise<void> | void;
  onRetry?: () => void;
  onEventClick: (event: Event) => void;
  onCreateEvent: () => void;
  showCreateEventButton?: boolean;
  createEventDisabled?: boolean;
  createEventHelperText?: string | null;
  hideWeeklyChildren?: boolean;
  setHideWeeklyChildren?: (value: boolean) => void;
};

type EventFilterPanelProps<TEventType extends string> = {
  location: EventLocation;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sportsData: Array<{ value: string; label: string }>;
  sportsLoading: boolean;
  selectedEventTypes: TEventType[];
  setSelectedEventTypes: (value: TEventType[]) => void;
  eventTypeData: Array<{ value: TEventType; label: string }>;
  selectedEventTypeLabels: string;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  sportsError: string | null;
  hideWeeklyChildren: boolean;
  setHideWeeklyChildren?: (value: boolean) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
};

type EventControlsProps<TEventType extends string> = EventFilterPanelProps<TEventType> & {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  eventSort: EventSortValue;
  setEventSort: (value: EventSortValue) => void;
};

type MobileEventFilterControlsProps<TEventType extends string> = EventFilterPanelProps<TEventType> & {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
};

type EventResultsProps = {
  location: EventLocation;
  eventsError: string | null;
  onRetry?: () => void;
  isLoadingInitial: boolean;
  sortedEvents: Event[];
  eventSegment: EventSegment;
  segmentCounts: Record<EventSegment, number>;
  resetFilters: () => void;
  eventSort: EventSortValue;
  setEventSort: (value: EventSortValue) => void;
  onEventClick: (event: Event) => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
  isLoadingMore: boolean;
  hasMoreEvents: boolean;
};

const milesToKm = (value: number): number => value * KM_PER_MILE;
const kmToMiles = (value: number): number => value / KM_PER_MILE;
const clampMiles = (value: number): number => Math.min(
  DISTANCE_SLIDER_MAX_MILES,
  Math.max(DISTANCE_SLIDER_MIN_MILES, Math.round(value)),
);

const isDraftEvent = (event: Event): boolean => {
  const normalizedState = String(event.state ?? '').toUpperCase();
  return normalizedState === 'DRAFT' || normalizedState === 'UNPUBLISHED';
};

const getSortedEvents = (
  events: Event[],
  eventSort: EventSortValue,
  getEventDistanceKm: (event: Event) => number | undefined,
  hideWeeklyChildren: boolean,
): Event[] => {
  const sourceEvents = events.filter(
    (event) => !hideWeeklyChildren || !(event.eventType === 'WEEKLY_EVENT' && typeof event.parentEvent === 'string' && event.parentEvent.trim()),
  );
  const sorted = [...sourceEvents];
  const compareByStart = (left: Event, right: Event) => new Date(left.start).getTime() - new Date(right.start).getTime();

  switch (eventSort) {
    case 'nearest':
      sorted.sort((left, right) => {
        const leftDistance = getEventDistanceKm(left);
        const rightDistance = getEventDistanceKm(right);
        if (typeof leftDistance === 'number' && typeof rightDistance === 'number') return leftDistance - rightDistance;
        if (typeof leftDistance === 'number') return -1;
        if (typeof rightDistance === 'number') return 1;
        return compareByStart(left, right);
      });
      break;
    case 'price-low':
      sorted.sort((left, right) => getEventDivisionPriceRange(left).minPriceCents - getEventDivisionPriceRange(right).minPriceCents || compareByStart(left, right));
      break;
    case 'popular':
      sorted.sort((left, right) => right.attendees - left.attendees || compareByStart(left, right));
      break;
    case 'alpha':
      sorted.sort((left, right) => left.name.localeCompare(right.name));
      break;
    case 'recommended':
      break;
    case 'soonest':
    default:
      sorted.sort(compareByStart);
      break;
  }

  return sorted;
};

const getActiveEventFilters = <TEventType extends string>({
  searchTerm,
  selectedEventTypes,
  eventTypeOptions,
  selectedSports,
  selectedStartDate,
  selectedEndDate,
  location,
  maxDistance,
  hideWeeklyChildren,
  setSearchTerm,
  setSelectedEventTypes,
  setSelectedSports,
  setSelectedStartDate,
  setSelectedEndDate,
  setMaxDistance,
  setHideWeeklyChildren,
}: Pick<OrganizationEventsTabContentProps<TEventType>,
  | 'searchTerm'
  | 'selectedEventTypes'
  | 'eventTypeOptions'
  | 'selectedSports'
  | 'selectedStartDate'
  | 'selectedEndDate'
  | 'location'
  | 'maxDistance'
  | 'hideWeeklyChildren'
  | 'setSearchTerm'
  | 'setSelectedEventTypes'
  | 'setSelectedSports'
  | 'setSelectedStartDate'
  | 'setSelectedEndDate'
  | 'setMaxDistance'
  | 'setHideWeeklyChildren'
>): EventFilter[] => {
  const filters: EventFilter[] = [];
  if (searchTerm.trim()) filters.push({ key: 'search', label: `Search: ${searchTerm.trim()}`, onRemove: () => setSearchTerm('') });
  if (selectedEventTypes.length < eventTypeOptions.length) {
    selectedEventTypes.forEach((type) => filters.push({
      key: `type-${type}`,
      label: formatEnumDisplayLabel(type, 'Event'),
      onRemove: () => setSelectedEventTypes(selectedEventTypes.filter((value) => value !== type)),
    }));
  }
  selectedSports.forEach((sport) => filters.push({
    key: `sport-${sport}`,
    label: sport,
    onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
  }));
  if (selectedStartDate) filters.push({ key: 'start-date', label: `From ${selectedStartDate.toLocaleDateString()}`, onRemove: () => setSelectedStartDate(null) });
  if (selectedEndDate) filters.push({ key: 'end-date', label: `Until ${selectedEndDate.toLocaleDateString()}`, onRemove: () => setSelectedEndDate(null) });
  if (location && typeof maxDistance === 'number') filters.push({ key: 'distance', label: `Within ${Math.round(kmToMiles(maxDistance))} mi`, onRemove: () => setMaxDistance(null) });
  if (hideWeeklyChildren && setHideWeeklyChildren) filters.push({ key: 'weekly', label: 'Hide weekly sessions', onRemove: () => setHideWeeklyChildren(false) });
  return filters;
};

const OrganizationEventsHeading = ({
  organizationName,
  onCreateEvent,
  showCreateEventButton,
  createEventDisabled,
  createEventHelperText,
}: Pick<OrganizationEventsTabContentProps, 'organizationName' | 'onCreateEvent' | 'showCreateEventButton' | 'createEventDisabled' | 'createEventHelperText'>) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <Title id="organization-events-heading" order={2} size="xl">Events</Title>
      <Text c="dimmed" className="mt-1">Create and manage events hosted by {organizationName}</Text>
    </div>
    {showCreateEventButton && (
      <div className="w-full sm:w-auto">
        <Button
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
          disabled={createEventDisabled}
          onClick={onCreateEvent}
          leftSection={<Plus aria-hidden="true" />}
        >
          New event
        </Button>
        {createEventHelperText && <Text size="xs" c={createEventDisabled ? 'red' : 'dimmed'} className="mt-1 max-w-xs sm:text-right">{createEventHelperText}</Text>}
      </div>
    )}
  </div>
);

const OrganizationEventsFilterPanel = <TEventType extends string>({
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
  hasActiveFilters,
}: EventFilterPanelProps<TEventType>) => (
  <Stack gap="md">
    <MultiSelect
      aria-label="Filter by sports"
      placeholder="All sports"
      data={sportsData}
      value={selectedSports}
      onChange={setSelectedSports}
      disabled={sportsLoading}
    />
    <MultiSelect
      aria-label="Filter by event type"
      placeholder={selectedEventTypeLabels || 'All event types'}
      data={eventTypeData}
      value={selectedEventTypes}
      onChange={(value) => setSelectedEventTypes(value as TEventType[])}
    />
    <div className="grid gap-3 sm:grid-cols-2">
      <DatePickerInput aria-label="Filter by start date" value={selectedStartDate} onChange={setSelectedStartDate} />
      <DatePickerInput aria-label="Filter by end date" value={selectedEndDate} minDate={selectedStartDate ?? undefined} onChange={setSelectedEndDate} />
    </div>
    {location && (
      <label className="block space-y-2 text-sm">
        <span className="flex items-center justify-between gap-3 font-medium">
          <span>Distance</span>
          <span className="text-muted-foreground">{typeof maxDistance === 'number' ? `Within ${Math.round(kmToMiles(maxDistance))} mi` : 'Any distance'}</span>
        </span>
        <input
          type="range"
          min={DISTANCE_SLIDER_MIN_MILES}
          max={DISTANCE_SLIDER_MAX_MILES}
          step={1}
          value={clampMiles(typeof maxDistance === 'number' ? kmToMiles(maxDistance) : kmToMiles(defaultMaxDistance))}
          onChange={(event) => setMaxDistance(milesToKm(Number(event.currentTarget.value)))}
          className="w-full accent-primary"
          aria-label="Filter by distance"
        />
      </label>
    )}
    {sportsError && <Alert color="red">{sportsError}</Alert>}
    {setHideWeeklyChildren && (
      <Checkbox
        checked={hideWeeklyChildren}
        onChange={(event) => setHideWeeklyChildren(event.currentTarget.checked)}
        label="Hide weekly sessions"
      />
    )}
    <Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters}>
      <RotateCcw data-icon="inline-start" aria-hidden="true" />
      Clear all filters
    </Button>
  </Stack>
);

const OrganizationEventsControls = <TEventType extends string>({
  searchTerm,
  setSearchTerm,
  eventSort,
  setEventSort,
  ...filterProps
}: EventControlsProps<TEventType>) => (
  <>
    <div className="hidden items-end gap-3 rounded-lg border border-border bg-card p-3 lg:flex">
      <TextInput
        aria-label="Search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.currentTarget.value)}
        placeholder="Search"
        leftSection={<Search aria-hidden="true" className="size-4" />}
        className="min-w-0 flex-1"
      />
      <MultiSelect
        aria-label="Filter by sports"
        placeholder="Sports"
        data={filterProps.sportsData}
        value={filterProps.selectedSports}
        onChange={filterProps.setSelectedSports}
        disabled={filterProps.sportsLoading}
        className="w-40"
      />
      <div className="grid min-w-56 grid-cols-2 gap-2">
        <DatePickerInput aria-label="Filter by start date" value={filterProps.selectedStartDate} onChange={filterProps.setSelectedStartDate} />
        <DatePickerInput aria-label="Filter by end date" value={filterProps.selectedEndDate} minDate={filterProps.selectedStartDate ?? undefined} onChange={filterProps.setSelectedEndDate} />
      </div>
      <MultiSelect
        aria-label="Filter by event type"
        placeholder={filterProps.selectedEventTypeLabels || 'Event type'}
        data={filterProps.eventTypeData}
        value={filterProps.selectedEventTypes}
        onChange={(value) => filterProps.setSelectedEventTypes(value as TEventType[])}
        className="w-44"
      />
      <Button variant="ghost" onClick={filterProps.resetFilters} disabled={!filterProps.hasActiveFilters}>Clear all</Button>
      <div className="w-40">
        <Text size="xs" c="dimmed" className="mb-1">Sort by</Text>
        <Select
          aria-label="Sort events"
          data={EVENT_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={eventSort}
          onChange={(value) => setEventSort((value as EventSortValue) ?? 'soonest')}
          rightSection={<ArrowUpDown aria-hidden="true" className="size-4" />}
        />
      </div>
    </div>

    <div className="space-y-3 lg:hidden">
      <MobileEventFilterControls searchTerm={searchTerm} setSearchTerm={setSearchTerm} {...filterProps} />
    </div>
  </>
);

const MobileEventFilterControls = <TEventType extends string>({
  searchTerm,
  setSearchTerm,
  ...filterProps
}: MobileEventFilterControlsProps<TEventType>) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <TextInput
          aria-label="Search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          placeholder="Search"
          leftSection={<Search aria-hidden="true" className="size-5" />}
          className="min-w-0 flex-1"
        />
        <Button
          variant="outline"
          aria-expanded={filtersOpen}
          aria-controls="organization-events-filters"
          onClick={() => setFiltersOpen((open) => !open)}
          leftSection={<Filter aria-hidden="true" />}
        >
          Filters
        </Button>
      </div>
      {filtersOpen && (
        <Paper id="organization-events-filters" withBorder p="md" className="bg-card">
          <Group justify="space-between" align="center" className="mb-4">
            <Text fw={600}>Filters</Text>
            <Button variant="ghost" size="sm" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <X aria-hidden="true" />
            </Button>
          </Group>
          <OrganizationEventsFilterPanel {...filterProps} />
        </Paper>
      )}
    </>
  );
};

const ActiveEventFilters = ({ filters }: { filters: EventFilter[] }) => {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active event filters">
      <Text size="sm" c="dimmed" className="mr-1">Filters:</Text>
      {filters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={filter.onRemove}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm text-foreground hover:bg-accent/10"
        >
          <span>{filter.label}</span>
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ))}
    </div>
  );
};

const EVENT_SEGMENTS: EventSegment[] = ['upcoming', 'drafts', 'past'];

const EventSegmentTabs = ({
  eventSegment,
  setEventSegment,
  segmentCounts,
}: {
  eventSegment: EventSegment;
  setEventSegment: (segment: EventSegment) => void;
  segmentCounts: Record<EventSegment, number>;
}) => (
  <div role="tablist" aria-label="Event status" className="flex min-w-0 overflow-x-auto border-b border-border">
    {EVENT_SEGMENTS.map((segment) => (
      <button
        key={segment}
        type="button"
        role="tab"
        id={`organization-events-tab-${segment}`}
        aria-controls="organization-events-panel"
        aria-selected={eventSegment === segment}
        tabIndex={eventSegment === segment ? 0 : -1}
        onClick={() => setEventSegment(segment)}
        onKeyDown={(event) => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const currentIndex = EVENT_SEGMENTS.indexOf(segment);
          const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? EVENT_SEGMENTS.length - 1
              : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + EVENT_SEGMENTS.length) % EVENT_SEGMENTS.length;
          setEventSegment(EVENT_SEGMENTS[nextIndex]);
          document.getElementById(`organization-events-tab-${EVENT_SEGMENTS[nextIndex]}`)?.focus();
        }}
        className={`min-h-12 shrink-0 border-b-2 px-5 text-sm font-medium capitalize transition-colors ${eventSegment === segment ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
      >
        {segment}
        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{segmentCounts[segment]}</span>
      </button>
    ))}
  </div>
);

const EventErrorState = ({ onRetry }: Pick<EventResultsProps, 'onRetry'>) => (
  <Paper withBorder p="xl" className="border-destructive/50 bg-destructive/5 text-center">
    <AlertCircle aria-hidden="true" className="mx-auto size-10 text-destructive" />
    <Title order={3} size="lg" className="mt-4">Events could not load</Title>
    <Text c="dimmed" className="mt-2">Check your connection and try again.</Text>
    {onRetry && (
      <Button className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90" onClick={onRetry}>
        <RotateCcw data-icon="inline-start" aria-hidden="true" />
        Retry
      </Button>
    )}
  </Paper>
);

const EventLoadingState = () => (
  <div role="status" aria-live="polite" className="space-y-4">
    <Group justify="center" gap="sm" className="text-muted-foreground">
      <Loader aria-hidden="true" />
      <Text>Loading events</Text>
    </Group>
    {Array.from({ length: 3 }, (_, index) => (
      <Paper key={index} withBorder className="h-44 animate-pulse bg-muted/40 motion-reduce:animate-none" />
    ))}
  </div>
);

const EventEmptyState = ({ eventSegment, resetFilters }: Pick<EventResultsProps, 'eventSegment' | 'resetFilters'>) => (
  <Paper withBorder p="xl" className="text-center">
    <SlidersHorizontal aria-hidden="true" className="mx-auto size-10 text-muted-foreground" />
    {eventSegment === 'past' ? (
      <>
        <Title order={3} size="lg" className="mt-4">Past events are not available yet</Title>
        <Text size="sm" c="dimmed" className="mx-auto mt-2 max-w-md">Past event history is not loaded in this view.</Text>
      </>
    ) : (
      <>
        <Title order={3} size="lg" className="mt-4">No events match your filters</Title>
        <Text size="sm" c="dimmed" className="mx-auto mt-2 max-w-md">Try removing a filter or clear all filters to see more events.</Text>
        <Button variant="outline" className="mt-5" onClick={resetFilters}>Clear all filters</Button>
      </>
    )}
  </Paper>
);

const LoadedEventResults = ({
  location,
  sortedEvents,
  eventSegment,
  segmentCounts,
  eventSort,
  setEventSort,
  onEventClick,
  sentinelRef,
  isLoadingMore,
  hasMoreEvents,
}: Omit<EventResultsProps, 'eventsError' | 'onRetry' | 'isLoadingInitial' | 'resetFilters'>) => (
  <>
    <div className="flex items-center justify-between gap-3 lg:hidden">
      <Text size="sm" c="dimmed">{segmentCounts[eventSegment]} event{segmentCounts[eventSegment] === 1 ? '' : 's'}</Text>
      <Select
        aria-label="Sort events"
        data={EVENT_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={eventSort}
        onChange={(value) => setEventSort((value as EventSortValue) ?? 'soonest')}
      />
    </div>
    <ResponsiveCardGrid>
      {sortedEvents.map((event) => (
      <EventCard
          key={event.$id}
          event={event}
          showDistance={Boolean(location)}
          userLocation={location}
          onClick={() => onEventClick(event)}
        />
      ))}
    </ResponsiveCardGrid>
    <div ref={sentinelRef} style={{ height: 1 }} />
    {isLoadingMore && (
      <Group justify="center" gap="sm" className="text-muted-foreground">
        <Loader aria-hidden="true" />
        <Text size="sm">Loading more events</Text>
      </Group>
    )}
    {!hasMoreEvents && eventSegment === 'upcoming' && (
      <Text size="sm" c="dimmed" ta="center">You&apos;ve reached the end of the results.</Text>
    )}
  </>
);

const OrganizationEventResults = ({
  location,
  eventsError,
  onRetry,
  isLoadingInitial,
  sortedEvents,
  eventSegment,
  segmentCounts,
  resetFilters,
  eventSort,
  setEventSort,
  onEventClick,
  sentinelRef,
  isLoadingMore,
  hasMoreEvents,
}: EventResultsProps) => {
  if (eventsError) return <EventErrorState onRetry={onRetry} />;
  if (isLoadingInitial) return <EventLoadingState />;
  if (sortedEvents.length === 0) return <EventEmptyState eventSegment={eventSegment} resetFilters={resetFilters} />;
  return (
    <LoadedEventResults
      sortedEvents={sortedEvents}
      location={location}
      eventSegment={eventSegment}
      segmentCounts={segmentCounts}
      eventSort={eventSort}
      setEventSort={setEventSort}
      onEventClick={onEventClick}
      sentinelRef={sentinelRef}
      isLoadingMore={isLoadingMore}
      hasMoreEvents={hasMoreEvents}
    />
  );
};

export default function OrganizationEventsTabContent<TEventType extends string = Event['eventType']>(
  props: OrganizationEventsTabContentProps<TEventType>,
) {
  const {
    organizationName,
    location,
    searchTerm,
    setSearchTerm,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    selectedSports,
    setSelectedSports,
    maxDistance,
    setMaxDistance,
    selectedStartDate,
    setSelectedStartDate,
    selectedEndDate,
    setSelectedEndDate,
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
    sentinelRef,
    eventsError,
    onFilterChange,
    onRetry,
    onEventClick,
    onCreateEvent,
    showCreateEventButton = true,
    createEventDisabled = false,
    createEventHelperText = null,
    hideWeeklyChildren = false,
    setHideWeeklyChildren,
  } = props;
  const [eventSegment, setEventSegment] = useState<EventSegment>('upcoming');
  const [eventSort, setEventSort] = useState<EventSortValue>('soonest');

  const resetFilters = useCallback(() => {
    setSelectedEventTypes([...eventTypeOptions]);
    setSelectedSports([]);
    setMaxDistance(null);
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setSearchTerm('');
    setHideWeeklyChildren?.(false);
  }, [
    eventTypeOptions,
    setMaxDistance,
    setSearchTerm,
    setSelectedEndDate,
    setSelectedEventTypes,
    setSelectedSports,
    setSelectedStartDate,
    setHideWeeklyChildren,
  ]);

  const getEventDistanceKm = useCallback((event: Event) => {
    if (!location || !Array.isArray(event.coordinates) || event.coordinates.length < 2) return undefined;
    const [lng, lat] = event.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return kmBetween(location, { lat, lng });
  }, [kmBetween, location]);

  const eventFilters = useMemo(() => ({
    searchTerm,
    selectedEventTypes,
    eventTypeOptions,
    selectedSports,
    selectedStartDate,
    selectedEndDate,
    location,
    maxDistance,
    hideWeeklyChildren,
    getEventDistanceKm,
  }), [
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
  ]);
  const { visibleEvents } = useEventListFiltering({
    events,
    filters: eventFilters,
    filterKey: eventListFilterKey(eventFilters),
    hasMoreEvents,
    onFilterChange,
  });

  const segmentEvents = useMemo(() => ({
    upcoming: visibleEvents.filter((event) => !isDraftEvent(event)),
    drafts: visibleEvents.filter(isDraftEvent),
    past: [] as Event[],
  }), [visibleEvents]);
  const sortedEvents = useMemo(
    () => getSortedEvents(segmentEvents[eventSegment], eventSort, getEventDistanceKm, hideWeeklyChildren),
    [eventSegment, eventSort, getEventDistanceKm, hideWeeklyChildren, segmentEvents],
  );
  const activeFilters = useMemo(() => getActiveEventFilters({
    searchTerm,
    selectedEventTypes,
    eventTypeOptions,
    selectedSports,
    selectedStartDate,
    selectedEndDate,
    location,
    maxDistance,
    hideWeeklyChildren,
    setSearchTerm,
    setSelectedEventTypes,
    setSelectedSports,
    setSelectedStartDate,
    setSelectedEndDate,
    setMaxDistance,
    setHideWeeklyChildren,
  }), [
    eventTypeOptions,
    hideWeeklyChildren,
    location,
    maxDistance,
    searchTerm,
    selectedEndDate,
    selectedEventTypes,
    selectedSports,
    selectedStartDate,
    setHideWeeklyChildren,
    setMaxDistance,
    setSearchTerm,
    setSelectedEndDate,
    setSelectedEventTypes,
    setSelectedSports,
    setSelectedStartDate,
  ]);

  const selectedEventTypeLabels = selectedEventTypes.length === eventTypeOptions.length
    ? 'All event types'
    : selectedEventTypes.map((type) => formatEnumDisplayLabel(type, 'Event')).join(', ');
  const segmentCounts: Record<EventSegment, number> = {
    upcoming: activeFilters.length > 0 ? segmentEvents.upcoming.length : totalEvents ?? segmentEvents.upcoming.length,
    drafts: segmentEvents.drafts.length,
    past: segmentEvents.past.length,
  };
  const sportsData = sports.map((sport) => ({ value: sport, label: sport }));
  const eventTypeData = eventTypeOptions.map((type) => ({ value: type, label: formatEnumDisplayLabel(type, 'Event') }));
  const filterProps: EventFilterPanelProps<TEventType> = {
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
    hasActiveFilters: activeFilters.length > 0,
  };

  return (
    <section aria-labelledby="organization-events-heading" className="space-y-6">
      <OrganizationEventsHeading
        organizationName={organizationName}
        onCreateEvent={onCreateEvent}
        showCreateEventButton={showCreateEventButton}
        createEventDisabled={createEventDisabled}
        createEventHelperText={createEventHelperText}
      />
      <OrganizationEventsControls
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        eventSort={eventSort}
        setEventSort={setEventSort}
        {...filterProps}
      />
      <ActiveEventFilters filters={activeFilters} />
      <EventSegmentTabs eventSegment={eventSegment} setEventSegment={setEventSegment} segmentCounts={segmentCounts} />
      <div
        id="organization-events-panel"
        role="tabpanel"
        aria-labelledby={`organization-events-tab-${eventSegment}`}
        tabIndex={0}
      >
        <OrganizationEventResults
          location={location}
          eventsError={eventsError}
          onRetry={onRetry}
          isLoadingInitial={isLoadingInitial}
          sortedEvents={sortedEvents}
          eventSegment={eventSegment}
          segmentCounts={segmentCounts}
          resetFilters={resetFilters}
          eventSort={eventSort}
          setEventSort={setEventSort}
          onEventClick={onEventClick}
          sentinelRef={sentinelRef}
          isLoadingMore={isLoadingMore}
          hasMoreEvents={hasMoreEvents}
        />
      </div>
    </section>
  );
}
