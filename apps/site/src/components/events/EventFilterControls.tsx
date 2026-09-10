'use client';

import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ArrowUpDown, CalendarDays, RotateCcw, Search, X } from 'lucide-react';

import {
  Button,
  Checkbox,
  DatePickerInput,
  MultiSelect,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
} from '@/components/organization/organization-operation-ui';

const KM_PER_MILE = 1.60934;
const DISTANCE_SLIDER_MIN_MILES = 10;
const DISTANCE_SLIDER_MAX_MILES = 100;

export const EVENT_SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'soonest', label: 'Soonest' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'popular', label: 'Most popular' },
  { value: 'alpha', label: 'A to Z' },
] as const;

export type EventSortValue = (typeof EVENT_SORT_OPTIONS)[number]['value'];
export type EventLocation = { lat: number; lng: number } | null;
export type EventFilter = { key: string; label: string; onRemove: () => void };

export type EventFilterPanelProps<TEventType extends string> = {
  location: EventLocation;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sportsData: Array<{ value: string; label: string }>;
  sportsLoading: boolean;
  selectedEventTypes: TEventType[];
  setSelectedEventTypes: (value: TEventType[]) => void;
  eventTypeData: Array<{ value: TEventType; label: string }>;
  selectedEventTypeLabels?: string;
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
  dateHeading?: ReactNode;
  sportsHeading?: ReactNode;
};

type EventFilterControlsProps<TEventType extends string> = Pick<
  EventFilterPanelProps<TEventType>,
  | 'selectedSports'
  | 'setSelectedSports'
  | 'sportsData'
  | 'sportsLoading'
  | 'selectedEventTypes'
  | 'setSelectedEventTypes'
  | 'eventTypeData'
  | 'selectedEventTypeLabels'
  | 'selectedStartDate'
  | 'setSelectedStartDate'
  | 'selectedEndDate'
  | 'setSelectedEndDate'
  | 'resetFilters'
  | 'hasActiveFilters'
> & {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  eventSort: EventSortValue;
  setEventSort: (value: EventSortValue) => void;
  showSearch?: boolean;
  showSort?: boolean;
  searchPlaceholder?: string;
  searchLabel?: string;
  additionalControls?: ReactNode;
};

const milesToKm = (value: number): number => value * KM_PER_MILE;
const kmToMiles = (value: number): number => value / KM_PER_MILE;
const clampMiles = (value: number): number => Math.min(
  DISTANCE_SLIDER_MAX_MILES,
  Math.max(DISTANCE_SLIDER_MIN_MILES, Math.round(value)),
);

export function EventFilterPanel<TEventType extends string>({
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
  dateHeading,
  sportsHeading,
}: EventFilterPanelProps<TEventType>) {
  const resolvedEventTypeLabels = selectedEventTypeLabels
    ?? (selectedEventTypes.length === eventTypeData.length
      ? 'All event types'
      : selectedEventTypes.map((type) => eventTypeData.find((option) => option.value === type)?.label ?? type).join(', '));

  return (
    <Stack gap="md">
      {sportsHeading && <Text size="xs" fw={700} c="dimmed" tt="uppercase">{sportsHeading}</Text>}
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
        placeholder={resolvedEventTypeLabels || 'All event types'}
        data={eventTypeData}
        value={selectedEventTypes}
        onChange={(value) => setSelectedEventTypes(value as TEventType[])}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {dateHeading && <Text size="xs" fw={700} c="dimmed" tt="uppercase" className="sm:col-span-2">{dateHeading}</Text>}
        <DatePickerInput aria-label="Filter by start date" value={selectedStartDate} clearable onChange={setSelectedStartDate} />
        <DatePickerInput aria-label="Filter by end date" value={selectedEndDate} minDate={selectedStartDate ?? undefined} clearable onChange={setSelectedEndDate} />
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
      {sportsError && <div role="alert" className="text-sm text-destructive">{sportsError}</div>}
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
}

export function EventFilterControls<TEventType extends string>({
  searchTerm,
  setSearchTerm,
  eventSort,
  setEventSort,
  showSearch = true,
  showSort = true,
  searchPlaceholder = 'Search',
  searchLabel = 'Search',
  additionalControls,
  ...filterProps
}: EventFilterControlsProps<TEventType>) {
  const [datesOpen, setDatesOpen] = useState(false);
  return (
    <>
      {showSearch && (
        <TextInput
          aria-label={searchLabel}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          placeholder={searchPlaceholder}
          leftSection={<Search aria-hidden="true" className="size-4" />}
          className="min-w-0 flex-1"
        />
      )}
      <MultiSelect
        aria-label="Filter by sports"
        placeholder="Sports"
        data={filterProps.sportsData}
        value={filterProps.selectedSports}
        onChange={filterProps.setSelectedSports}
        disabled={filterProps.sportsLoading}
        className="w-40"
      />
      <Popover opened={datesOpen} onChange={setDatesOpen}>
        <Popover.Target><Button variant="outline" aria-haspopup="dialog" aria-expanded={datesOpen} onClick={() => setDatesOpen((open) => !open)} leftSection={<CalendarDays aria-hidden="true" className="size-4" />}>Dates</Button></Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <DatePickerInput label="Start date" aria-label="Filter by start date" value={filterProps.selectedStartDate} clearable onChange={filterProps.setSelectedStartDate} />
            <DatePickerInput label="End date" aria-label="Filter by end date" value={filterProps.selectedEndDate} minDate={filterProps.selectedStartDate ?? undefined} clearable onChange={filterProps.setSelectedEndDate} />
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <MultiSelect
        aria-label="Filter by event type"
        placeholder={filterProps.selectedEventTypeLabels || 'Event type'}
        data={filterProps.eventTypeData}
        value={filterProps.selectedEventTypes}
        onChange={(value) => filterProps.setSelectedEventTypes(value as TEventType[])}
        className="w-44"
      />
      {additionalControls}
      <Button variant="ghost" onClick={filterProps.resetFilters} disabled={!filterProps.hasActiveFilters}>Clear all</Button>
      {showSort && (
        <div className="org-event-sort">
          <Text size="xs" c="dimmed">Sort by</Text>
          <Select
            aria-label="Sort events"
            data={EVENT_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={eventSort}
            onChange={(value) => setEventSort((value as EventSortValue) ?? 'soonest')}
            rightSection={<ArrowUpDown aria-hidden="true" className="size-4" />}
          />
        </div>
      )}
    </>
  );
}

export function ActiveEventFilters({ filters }: { filters: EventFilter[] }) {
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
}
