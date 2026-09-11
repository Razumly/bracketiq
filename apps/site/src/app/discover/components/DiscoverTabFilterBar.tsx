'use client';

import { useEffect, useId, useState, type Dispatch, type SetStateAction } from 'react';
import { BarChart3, Clock3, MapPin, Tag, UsersRound } from 'lucide-react';
import { Alert, Loader, Text, TextInput } from '@/components/organization/organization-operation-ui';
import { Slider } from '@/components/ui/slider';
import { formatDisplayTime } from '@/lib/dateUtils';
import type { OrganizationTag } from '@/types';
import type { TeamDivisionFilterOption } from '../utils/teamFilters';
import DivisionDiscoveryFilters, { getSingleSelectedSportKey, type DivisionDiscoveryFilterValue } from './DivisionDiscoveryFilters';
import { DiscoverFilterRows, FilterOptionList, FilterPopover, resolveOpenFilter, type DiscoverFilterItem, type DiscoverFilterRowsProps } from './DiscoverFilterBar';

export const EMPTY_DISCOVERY_DIVISION_FILTERS: DivisionDiscoveryFilterValue = {
  genders: [],
  skillDivisionTypeIds: [],
  ageDivisionTypeIds: [],
  priceMinDollars: null,
  priceMaxDollars: null,
};

export const hasDiscoveryDivisionFilters = (value: DivisionDiscoveryFilterValue): boolean => (
  value.genders.length > 0 || value.skillDivisionTypeIds.length > 0
  || value.ageDivisionTypeIds.length > 0 || value.priceMinDollars !== null || value.priceMaxDollars !== null
);

export type OrganizationDiscoveryFilters = {
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
  organizationTags: OrganizationTag[];
  organizationTagsLoading: boolean;
  organizationTagsError: string | null;
  divisionFilters: DivisionDiscoveryFilterValue;
  setDivisionFilters: (value: DivisionDiscoveryFilterValue) => void;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
};

export type RentalDiscoveryFilters = {
  timeRange: [number, number];
  setTimeRange: (value: [number, number]) => void;
  defaultTimeRange: [number, number];
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
};

export type TeamDiscoveryFilters = {
  selectedDivisionTypeValues: string[];
  setSelectedDivisionTypeValues: Dispatch<SetStateAction<string[]>>;
  divisionTypeOptions: TeamDivisionFilterOption[];
};

type Props = Omit<DiscoverFilterRowsProps, 'filters' | 'filtersKey' | 'filterAriaLabel' | 'moreFiltersLabel'> & {
  location: { lat: number; lng: number } | null;
  defaultMaxDistance: number;
  showDistanceFilter?: boolean;
} & (
  | { target: 'organizations'; filters: OrganizationDiscoveryFilters }
  | { target: 'rentals'; filters: RentalDiscoveryFilters }
  | { target: 'teams'; filters: TeamDiscoveryFilters }
);

export function formatRentalHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return formatDisplayTime(date);
}

const summarize = (labels: string[]) => (
  labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]
);

export default function DiscoverTabFilterBar(props: Props) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const panelId = useId();
  const setOpen = (id: string) => (open: boolean) => setOpenFilter((current) => resolveOpenFilter(current, id, open));
  const items: DiscoverFilterItem[] = [];
  const { target, selectedSports, location, defaultMaxDistance, showDistanceFilter = true } = props;
  const organizationFilters = props.target === 'organizations' ? props.filters : null;
  const hasSingleSport = getSingleSelectedSportKey(selectedSports) !== null;

  useEffect(() => {
    if (
      !organizationFilters || hasSingleSport ||
      organizationFilters.divisionFilters.skillDivisionTypeIds.length === 0
    ) return;
    organizationFilters.setDivisionFilters({
      ...organizationFilters.divisionFilters,
      skillDivisionTypeIds: [],
    });
  }, [hasSingleSport, organizationFilters]);

  if (props.target === 'organizations') {
    const filters = props.filters;
    const query = tagSearch.trim().toLowerCase();
    const tagOptions = filters.organizationTags
      .filter((tag) => !query || tag.name.toLowerCase().includes(query))
      .sort((left, right) => (right.organizationCount ?? 0) - (left.organizationCount ?? 0) || left.name.localeCompare(right.name))
      .slice(0, 5)
      .map((tag) => ({ value: tag.slug ?? tag.name, label: tag.name, count: tag.organizationCount }));
    const tagSummary = summarize(filters.selectedTags.map((slug) => (
      filters.organizationTags.find((tag) => (tag.slug ?? tag.name) === slug)?.name ?? slug
    )));
    const divisionActive = hasDiscoveryDivisionFilters(filters.divisionFilters);
    items.push({ key: 'tags', node: (
      <FilterPopover id={`${panelId}-tags`} label="Tags" value={tagSummary} valueLabel={tagSummary}
        icon={Tag} active={filters.selectedTags.length > 0} open={openFilter === 'tags'}
        onOpenChange={setOpen('tags')} onClear={() => filters.setSelectedTags([])}>
        <div className="discover-filter-popover-heading">Organization tags</div>
        <TextInput aria-label="Search organization tags" placeholder="Search organization tags" value={tagSearch}
          onChange={(event) => setTagSearch(event.currentTarget.value)} />
        {filters.organizationTagsLoading ? <Loader size="sm" aria-label="Loading organization tags" /> : tagOptions.length ? (
          <FilterOptionList options={tagOptions} value={filters.selectedTags} allLabel="All tags" onChange={filters.setSelectedTags} />
        ) : <Text size="sm" c="dimmed">{query ? 'No tags match this search.' : 'No tags available.'}</Text>}
        {filters.organizationTagsError && <Alert color="red">{filters.organizationTagsError}</Alert>}
      </FilterPopover>
    ) }, { key: 'division', node: (
      <FilterPopover id={`${panelId}-division`} label="Division" value={divisionActive ? 'Applied' : undefined}
        valueLabel={divisionActive ? 'Applied' : undefined} icon={UsersRound} active={divisionActive}
        open={openFilter === 'division'} onOpenChange={setOpen('division')}
        onClear={() => filters.setDivisionFilters(EMPTY_DISCOVERY_DIVISION_FILTERS)}>
        <DivisionDiscoveryFilters value={filters.divisionFilters} onChange={filters.setDivisionFilters} selectedSports={selectedSports} />
      </FilterPopover>
    ) });
  }

  if (props.target === 'rentals') {
    const { timeRange, setTimeRange, defaultTimeRange } = props.filters;
    const active = timeRange[0] !== defaultTimeRange[0] || timeRange[1] !== defaultTimeRange[1];
    const label = `${formatRentalHourLabel(timeRange[0])} - ${formatRentalHourLabel(timeRange[1])}`;
    items.push({ key: 'time', node: (
      <FilterPopover id={`${panelId}-time`} label="Time" value={active ? label : undefined} valueLabel={active ? label : undefined}
        icon={Clock3} active={active} open={openFilter === 'time'} onOpenChange={setOpen('time')}
        onClear={() => setTimeRange(defaultTimeRange)}>
        <div className="discover-filter-popover-heading">Available time</div>
        <div className="discover-time-range-slider">
          <Slider min={0} max={24} minStepsBetweenValues={1} step={1} value={timeRange}
            onValueChange={(value) => setTimeRange([value[0] ?? 0, value[1] ?? 24])}
            getAriaLabel={(index) => index === 0 ? 'Earliest rental time' : 'Latest rental time'}
            getAriaValueText={(_, value) => formatRentalHourLabel(value)} />
          <div aria-hidden="true" className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
            <span>12am</span><span>12pm</span><span>12am</span>
          </div>
        </div>
      </FilterPopover>
    ) });
  }

  if (props.target === 'teams') {
    const filters = props.filters;
    const labels = filters.selectedDivisionTypeValues.flatMap((value) => {
      const option = filters.divisionTypeOptions.find((entry) => entry.value === value);
      return option ? [option.label] : [];
    });
    const label = summarize(labels);
    items.push({ key: 'division', node: (
      <FilterPopover id={`${panelId}-division`} label="Division" value={label} valueLabel={label} icon={BarChart3}
        active={filters.selectedDivisionTypeValues.length > 0} open={openFilter === 'division'} onOpenChange={setOpen('division')}
        onClear={() => filters.setSelectedDivisionTypeValues([])}>
        <div className="discover-filter-popover-heading">Division type</div>
        {!selectedSports.length ? (
          <Text size="sm" c="dimmed">Select one or more sports to choose division types.</Text>
        ) : !filters.divisionTypeOptions.length ? (
          <Text size="sm" c="dimmed">No division types are available for the selected sports.</Text>
        ) : (
          <FilterOptionList options={filters.divisionTypeOptions} value={filters.selectedDivisionTypeValues}
            allLabel="Any division type" onChange={filters.setSelectedDivisionTypeValues} />
        )}
      </FilterPopover>
    ) });
  } else if (showDistanceFilter) {
    const { maxDistance, setMaxDistance } = props.filters;
    const miles = typeof maxDistance === 'number' ? Math.round(maxDistance / 1.60934) : null;
    const active = Boolean(location && miles !== null);
    items.push({ key: 'distance', node: (
      <FilterPopover id={`${panelId}-distance`} label="Distance" value={active ? `${miles} mi` : undefined}
        valueLabel={location ? (miles !== null ? `${miles} mi` : 'Any distance') : 'Set location'} icon={MapPin}
        active={active} open={openFilter === 'distance'} onOpenChange={setOpen('distance')} onClear={() => setMaxDistance(null)}>
        <div className="discover-filter-popover-heading">Distance</div>
        {location ? (
          <label className="discover-filter-range">
            <span>Within {miles ?? Math.round(defaultMaxDistance / 1.60934)} mi</span>
            <input type="range" min={10} max={100} step={1} value={miles ?? Math.round(defaultMaxDistance / 1.60934)}
              onChange={(event) => setMaxDistance(Number(event.currentTarget.value) * 1.60934)} aria-label="Filter by distance" />
            <span className="discover-filter-range-scale"><span>10 mi</span><span>100 mi</span></span>
          </label>
        ) : <Text size="sm" c="dimmed">Set a location to enable distance filtering.</Text>}
        {active && <button type="button" className="discover-filter-clear-link" onClick={() => setMaxDistance(null)}>Clear distance</button>}
      </FilterPopover>
    ) });
  }

  return <DiscoverFilterRows sports={props.sports} selectedSports={selectedSports} setSelectedSports={props.setSelectedSports}
    sportsLoading={props.sportsLoading} sportsError={props.sportsError} filters={items}
    filtersKey={JSON.stringify([target, props.filters, Boolean(location), showDistanceFilter, props.activeFilterCount])}
    filterAriaLabel={target === 'organizations' ? 'Organization filters' : target === 'rentals' ? 'Rental filters' : 'Team filters'}
    activeFilterCount={props.activeFilterCount} resetFilters={props.resetFilters} />;
}
