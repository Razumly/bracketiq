'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  DollarSign,
  MapPin,
  Search,
  Tag,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  Alert,
  Button,
  DatePickerInput,
  Loader,
  NumberInput,
  Text,
  TextInput,
} from '@/components/organization/organization-operation-ui';
import { Popover as UiPopover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Event, EventTag } from '@/types';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import type {
  DivisionDiscoveryFilterOptions,
  DivisionDiscoveryFilterValue,
  DivisionOption,
} from './DivisionDiscoveryFilters';

const KM_PER_MILE = 1.60934;
const DISTANCE_SLIDER_MIN_MILES = 10;
const DISTANCE_SLIDER_MAX_MILES = 100;
export function calculateVisibleFilterCount(
  itemWidths: readonly number[],
  availableWidth: number,
  gap: number,
  moreWidth: number,
  trailingWidth: number,
): number {
  const itemWidth = itemWidths.reduce((sum, width) => sum + width, 0);
  const itemGaps = Math.max(0, itemWidths.length - 1) * gap;
  const trailingSpace = trailingWidth > 0 ? trailingWidth + (gap > 0 ? gap : 0) : 0;
  const fullWidth = itemWidth + itemGaps + trailingSpace;

  if (fullWidth <= availableWidth + 1) return itemWidths.length;

  let usedWidth = 0;
  let fitCount = 0;
  for (const width of itemWidths) {
    const itemGap = fitCount > 0 ? gap : 0;
    const moreGap = moreWidth > 0 ? gap : 0;
    if (usedWidth + itemGap + width + moreGap + moreWidth + trailingSpace > availableWidth + 1) break;
    usedWidth += itemGap + width;
    fitCount += 1;
  }
  return fitCount;
}


type FilterItem = { key: string; node: ReactNode };
type FilterOption = { value: string; label: string; count?: number };

type OverflowFilterRowProps = {
  items: FilterItem[];
  contentKey: string;
  ariaLabel: string;
  moreLabel: string;
  onMore: () => void;
  trailing?: ReactNode;
  className?: string;
};
function OverflowFilterRow({ items, contentKey, ariaLabel, moreLabel, onMore, trailing, className }: OverflowFilterRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<{ key: string; count: number | null }>({ key: contentKey, count: null });
  const visibleCount = measurement.key === contentKey ? measurement.count : null;

  /* eslint-disable react-hooks/set-state-in-effect -- The row width is a DOM measurement that controls overflow visibility. */
  useLayoutEffect(() => {
    if (visibleCount !== null) return;
    const row = rowRef.current;
    if (!row) return;
    const itemElements = Array.from(row.querySelectorAll<HTMLElement>('[data-overflow-item]'));
    if (itemElements.length === 0) {
      setMeasurement({ key: contentKey, count: 0 });
      return;
    }

    const availableWidth = row.clientWidth;
    if (availableWidth <= 0) {
      setMeasurement({ key: contentKey, count: Math.min(items.length, 3) });
      return;
    }

    const gap = Number.parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap || '0') || 0;
    const moreElement = row.querySelector<HTMLElement>('[data-overflow-more]');
    const trailingElement = row.querySelector<HTMLElement>('[data-overflow-trailing]');
    const moreWidth = moreElement?.getBoundingClientRect().width ?? 0;
    const trailingWidth = trailingElement?.getBoundingClientRect().width ?? 0;
    const itemWidths = itemElements.map((item) => item.getBoundingClientRect().width);
    const visibleItemCount = calculateVisibleFilterCount(itemWidths, availableWidth, gap, moreWidth, trailingWidth);
    setMeasurement({ key: contentKey, count: visibleItemCount });
  }, [contentKey, items.length, visibleCount]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setMeasurement((current) => current.count === null ? current : { key: current.key, count: null });
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  const showMore = visibleCount === null || visibleCount < items.length;
  return (
    <div ref={rowRef} className={`discover-filter-row ${className ?? ''}`} aria-label={ariaLabel}>
      {items.map((item, index) => (
        <span
          key={item.key}
          data-overflow-item
          className="discover-filter-row-item"
          hidden={visibleCount !== null && index >= visibleCount}
        >
          {item.node}
        </span>
      ))}
      {showMore && (
        <Button
          variant="outline"
          size="sm"
          data-overflow-more
          aria-label={moreLabel}
          aria-hidden={visibleCount === null ? true : undefined}
          tabIndex={visibleCount === null ? -1 : undefined}
          onClick={onMore}
          style={visibleCount === null ? { visibility: 'hidden' } : undefined}
        >
          {moreLabel}
        </Button>
      )}
      {trailing && <span data-overflow-trailing className="discover-filter-row-trailing">{trailing}</span>}
    </div>
  );
}

type FilterPopoverProps = {
  id: string;
  label: string;
  valueLabel?: string;
  value?: ReactNode;
  icon: LucideIcon;
  active?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear?: () => void;
  children: ReactNode;
};

function FilterPopover({ id, label, valueLabel, value, icon: Icon, active = false, open, onOpenChange, onClear, children }: FilterPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  return (
    <UiPopover open={open} onOpenChange={onOpenChange}>
      <div className="discover-filter-control" data-active={active ? '' : undefined}>
        <PopoverTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              className="discover-filter-trigger"
              aria-label={valueLabel ? `${label}: ${valueLabel}` : label}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={`${id}-panel`}
            />
          }
        >
          <Icon aria-hidden="true" className="discover-filter-trigger-icon" />
          <span className="discover-filter-trigger-label">{label}</span>
          {value && <span className="discover-filter-trigger-value">{value}</span>}
          <ChevronDown aria-hidden="true" className="discover-filter-trigger-chevron" />
        </PopoverTrigger>
        {active && onClear && (
          <button
            type="button"
            className="discover-filter-trigger-clear"
            aria-label={`Clear ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
              onOpenChange(false);
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <PopoverContent align="start" className="discover-filter-popover p-4">
        <div id={`${id}-panel`} role="dialog" aria-label={`${label} filter`}>
          {children}
        </div>
      </PopoverContent>
    </UiPopover>
  );
}

type FilterOptionListProps = {
  options: FilterOption[];
  value: string[];
  allLabel: string;
  onChange: (value: string[]) => void;
  allValue?: string[];
};

function FilterOptionList({ options, value, allLabel, onChange, allValue }: FilterOptionListProps) {
  const allSelected = allValue ? value.length === allValue.length : value.length === 0;
  const toggle = (option: FilterOption) => {
    onChange(value.includes(option.value)
      ? value.filter((entry) => entry !== option.value)
      : [...value, option.value]);
  };

  return (
    <div className="discover-filter-option-list">
      <button
        type="button"
        className={`discover-filter-option${allSelected ? ' is-selected' : ''}`}
        aria-pressed={allSelected}
        onClick={() => onChange(allValue ?? [])}
      >
        <span className="discover-filter-option-copy">
          <span>{allLabel}</span>
          <small>{allSelected ? 'Remove restriction' : 'Clear selection'}</small>
        </span>
        {allSelected && <Check aria-hidden="true" className="discover-filter-option-check" />}
      </button>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={`discover-filter-option${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            onClick={() => toggle(option)}
          >
            <span>{option.label}</span>
            {typeof option.count === 'number' && <span className="discover-filter-option-count">{option.count}</span>}
            {selected && <Check aria-hidden="true" className="discover-filter-option-check" />}
          </button>
        );
      })}
    </div>
  );
}

const selectedLabels = (value: string[], options: FilterOption[]): string[] => (
  value.map((entry) => options.find((option) => option.value === entry)?.label ?? entry)
);

const summaryLabel = (labels: string[]): string | undefined => {
  if (labels.length === 0) return undefined;
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1}`;
};

const dateLabel = (value: Date | null): string | undefined => (
  value ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined
);

const dollarLabel = (value: number | null): string | undefined => (
  typeof value === 'number' && Number.isFinite(value)
    ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : undefined
);

const priceSummary = (minimum: number | null, maximum: number | null): string | undefined => {
  const minimumLabel = dollarLabel(minimum);
  const maximumLabel = dollarLabel(maximum);
  if (minimumLabel && maximumLabel) return `${minimumLabel} – ${maximumLabel}`;
  if (minimumLabel) return `${minimumLabel}+`;
  if (maximumLabel) return `Up to ${maximumLabel}`;
  return undefined;
};

const optionList = (options: DivisionOption[]): FilterOption[] => options.map((option) => ({ value: option.id, label: option.name }));
const renderClearAllControl = (activeFilterCount: number, resetFilters: () => void): ReactNode => (
  activeFilterCount > 0
    ? <button type="button" className="discover-filter-clear-all" onClick={resetFilters}>Clear all</button>
    : undefined
);
type DiscoverFilterItemContext<TEventType extends string> = {
  panelId: string;
  openFilter: string | null;
  setOpen: (id: string) => (open: boolean) => void;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  selectedEventTypes: TEventType[];
  setSelectedEventTypes: (value: TEventType[]) => void;
  eventTypeOptions: readonly TEventType[];
  eventTypeOptionsData: FilterOption[];
  eventTypeLabels: string[];
  tagLabels: string[];
  eventTypesActive: boolean;
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
  tagSearch: string;
  setTagSearch: Dispatch<SetStateAction<string>>;
  filteredTagOptions: FilterOption[];
  tagActive: boolean;
  eventTagsLoading: boolean;
  eventTagsError: string | null;
  location: { lat: number; lng: number } | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  distanceMiles: number | null;
  distanceActive: boolean;
  dateActive: boolean;
  priceActive: boolean;
  divisionFilters: DivisionDiscoveryFilterValue;
  setDivisionFilters: (value: DivisionDiscoveryFilterValue) => void;
  genderOptions: FilterOption[];
  genderLabels: string[];
  ageOptions: FilterOption[];
  ageLabels: string[];
  skillOptions: FilterOption[];
  skillLabels: string[];
};

type DiscoverFilterItemProps<TEventType extends string> = {
  context: DiscoverFilterItemContext<TEventType>;
};

function DatesFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const {
    panelId,
    openFilter,
    setOpen,
    selectedStartDate,
    setSelectedStartDate,
    selectedEndDate,
    setSelectedEndDate,
    dateActive,
  } = context;
  const value = [dateLabel(selectedStartDate), dateLabel(selectedEndDate)].filter(Boolean).join(' – ');
  return (
    <FilterPopover
      id={`${panelId}-dates`}
      label="Dates"
      valueLabel={dateActive ? value : undefined}
      value={dateActive ? value : undefined}
      icon={CalendarDays}
      active={dateActive}
      open={openFilter === 'dates'}
      onOpenChange={setOpen('dates')}
      onClear={() => { setSelectedStartDate(null); setSelectedEndDate(null); }}
    >
      <div className="discover-filter-popover-heading">Date range</div>
      <div className="discover-filter-popover-fields">
        <DatePickerInput label="Start date" aria-label="Filter by start date" value={selectedStartDate} clearable onChange={setSelectedStartDate} />
        <DatePickerInput label="End date" aria-label="Filter by end date" value={selectedEndDate} minDate={selectedStartDate ?? undefined} clearable onChange={setSelectedEndDate} />
      </div>
    </FilterPopover>
  );
}

function PriceFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const {
    panelId,
    openFilter,
    setOpen,
    divisionFilters,
    setDivisionFilters,
    priceActive,
  } = context;
  const value = priceSummary(divisionFilters.priceMinDollars, divisionFilters.priceMaxDollars);
  const setPrice = (field: 'priceMinDollars' | 'priceMaxDollars', next: unknown) => {
    const numericValue = typeof next === 'number' && Number.isFinite(next) ? next : null;
    setDivisionFilters({ ...divisionFilters, [field]: numericValue });
  };
  const clearPrice = () => setDivisionFilters({ ...divisionFilters, priceMinDollars: null, priceMaxDollars: null });
  return (
    <FilterPopover
      id={`${panelId}-price`}
      label="Price"
      valueLabel={value}
      value={value}
      icon={DollarSign}
      active={priceActive}
      open={openFilter === 'price'}
      onOpenChange={setOpen('price')}
      onClear={clearPrice}
    >
      <div className="discover-filter-popover-heading">Price range</div>
      <div className="discover-filter-popover-fields two-columns">
        <NumberInput label="Minimum" prefix="$" min={0} decimalScale={2} value={divisionFilters.priceMinDollars ?? ''} onChange={(next) => setPrice('priceMinDollars', next)} />
        <NumberInput label="Maximum" prefix="$" min={0} decimalScale={2} value={divisionFilters.priceMaxDollars ?? ''} onChange={(next) => setPrice('priceMaxDollars', next)} />
      </div>
      {priceActive && <button type="button" className="discover-filter-clear-link" onClick={clearPrice}>Clear price</button>}
    </FilterPopover>
  );
}

function DistanceFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const {
    panelId,
    openFilter,
    setOpen,
    location,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    distanceMiles,
    distanceActive,
  } = context;
  const valueLabel = location
    ? (distanceMiles !== null ? `${distanceMiles} mi` : 'Any distance')
    : 'Set location';
  const value = location && distanceMiles !== null ? `${distanceMiles} mi` : (location ? undefined : 'Set location');
  const rangeValue = distanceMiles ?? Math.round(defaultMaxDistance / KM_PER_MILE);
  return (
    <FilterPopover
      id={`${panelId}-distance`}
      label="Distance"
      valueLabel={valueLabel}
      value={value}
      icon={MapPin}
      active={distanceActive}
      open={openFilter === 'distance'}
      onOpenChange={setOpen('distance')}
      onClear={() => setMaxDistance(null)}
    >
      <div className="discover-filter-popover-heading">Distance</div>
      {location ? (
        <label className="discover-filter-range">
          <span>Within {rangeValue} mi</span>
          <input
            type="range"
            min={DISTANCE_SLIDER_MIN_MILES}
            max={DISTANCE_SLIDER_MAX_MILES}
            step={1}
            value={rangeValue}
            onChange={(event) => setMaxDistance(Number(event.currentTarget.value) * KM_PER_MILE)}
            aria-label="Filter by distance"
          />
          <span className="discover-filter-range-scale"><span>10 mi</span><span>100 mi</span></span>
        </label>
      ) : (
        <Text size="sm" c="dimmed">Set a location to enable distance filtering.</Text>
      )}
      {distanceActive && <button type="button" className="discover-filter-clear-link" onClick={() => setMaxDistance(null)}>Clear distance</button>}
    </FilterPopover>
  );
}

function EventTypeFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const {
    panelId,
    openFilter,
    setOpen,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    eventTypeOptionsData,
    eventTypeLabels,
    eventTypesActive,
  } = context;
  return (
    <FilterPopover
      id={`${panelId}-event-types`}
      label="Event type"
      valueLabel={summaryLabel(eventTypeLabels)}
      value={summaryLabel(eventTypeLabels)}
      icon={Tag}
      active={eventTypesActive}
      open={openFilter === 'event-types'}
      onOpenChange={setOpen('event-types')}
      onClear={() => setSelectedEventTypes([...eventTypeOptions])}
    >
      <div className="discover-filter-popover-heading">Event type</div>
      <FilterOptionList options={eventTypeOptionsData} value={selectedEventTypes} allLabel="All event types" allValue={[...eventTypeOptions]} onChange={(value) => setSelectedEventTypes(value as TEventType[])} />
    </FilterPopover>
  );
}

function EventTagsFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const {
    panelId,
    openFilter,
    setOpen,
    selectedTags,
    setSelectedTags,
    tagLabels,
    tagSearch,
    setTagSearch,
    filteredTagOptions,
    tagActive,
    eventTagsLoading,
    eventTagsError,
  } = context;
  return (
    <FilterPopover
      id={`${panelId}-event-tags`}
      label="Event tags"
      valueLabel={summaryLabel(tagLabels)}
      value={summaryLabel(tagLabels)}
      icon={Tag}
      active={tagActive}
      open={openFilter === 'event-tags'}
      onOpenChange={setOpen('event-tags')}
      onClear={() => setSelectedTags([])}
    >
      <div className="discover-filter-popover-heading">Event tags</div>
      <TextInput aria-label="Search event tags" placeholder="Search event tags" value={tagSearch} onChange={(event) => setTagSearch(event.currentTarget.value)} leftSection={<Search aria-hidden="true" className="size-4" />} />
      {eventTagsLoading ? <Loader size="sm" aria-label="Loading event tags" /> : <FilterOptionList options={filteredTagOptions} value={selectedTags} allLabel="All tags" onChange={setSelectedTags} />}
      {eventTagsError && <Alert color="red">{eventTagsError}</Alert>}
    </FilterPopover>
  );
}

function GenderFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const { panelId, openFilter, setOpen, divisionFilters, setDivisionFilters, genderOptions, genderLabels } = context;
  return (
    <FilterPopover
      id={`${panelId}-gender`}
      label="Gender"
      valueLabel={summaryLabel(genderLabels)}
      value={summaryLabel(genderLabels)}
      icon={UsersRound}
      active={genderLabels.length > 0}
      open={openFilter === 'gender'}
      onOpenChange={setOpen('gender')}
      onClear={() => setDivisionFilters({ ...divisionFilters, genders: [] })}
    >
      <div className="discover-filter-popover-heading">Gender</div>
      <FilterOptionList options={genderOptions} value={divisionFilters.genders} allLabel="Any gender" onChange={(genders) => setDivisionFilters({ ...divisionFilters, genders })} />
    </FilterPopover>
  );
}

function AgeGroupFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const { panelId, openFilter, setOpen, divisionFilters, setDivisionFilters, ageOptions, ageLabels } = context;
  return (
    <FilterPopover
      id={`${panelId}-age-group`}
      label="Age group"
      valueLabel={summaryLabel(ageLabels)}
      value={summaryLabel(ageLabels)}
      icon={UserRound}
      active={ageLabels.length > 0}
      open={openFilter === 'age-group'}
      onOpenChange={setOpen('age-group')}
      onClear={() => setDivisionFilters({ ...divisionFilters, ageDivisionTypeIds: [] })}
    >
      <div className="discover-filter-popover-heading">Age group</div>
      <FilterOptionList options={ageOptions} value={divisionFilters.ageDivisionTypeIds} allLabel="Any age group" onChange={(ageDivisionTypeIds) => setDivisionFilters({ ...divisionFilters, ageDivisionTypeIds })} />
    </FilterPopover>
  );
}

function SkillLevelFilterItem<TEventType extends string>({ context }: DiscoverFilterItemProps<TEventType>) {
  const { panelId, openFilter, setOpen, divisionFilters, setDivisionFilters, skillOptions, skillLabels } = context;
  return (
    <FilterPopover
      id={`${panelId}-skill-level`}
      label="Skill level"
      valueLabel={summaryLabel(skillLabels)}
      value={summaryLabel(skillLabels)}
      icon={BarChart3}
      active={skillLabels.length > 0}
      open={openFilter === 'skill-level'}
      onOpenChange={setOpen('skill-level')}
      onClear={() => setDivisionFilters({ ...divisionFilters, skillDivisionTypeIds: [] })}
    >
      <div className="discover-filter-popover-heading">Skill level</div>
      <FilterOptionList options={skillOptions} value={divisionFilters.skillDivisionTypeIds} allLabel="Any skill level" onChange={(skillDivisionTypeIds) => setDivisionFilters({ ...divisionFilters, skillDivisionTypeIds })} />
    </FilterPopover>
  );
}

export type DiscoverSportFilterListProps = {
  sports: string[];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sportsLoading: boolean;
};

export function DiscoverSportFilterList({ sports, selectedSports, setSelectedSports, sportsLoading }: DiscoverSportFilterListProps) {
  const allSportsSelected = selectedSports.length === 0;
  if (sportsLoading) return <Loader size="sm" aria-label="Loading sports" />;

  return (
    <div className="discover-filter-sheet-section">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">Sports</Text>
      <div className="discover-filter-sheet-options" aria-label="Sports">
        <button
          type="button"
          className={`discover-filter-option${allSportsSelected ? ' is-selected' : ''}`}
          aria-pressed={allSportsSelected}
          onClick={() => setSelectedSports([])}
        >
          <span>All sports</span>
          {allSportsSelected && <Check aria-hidden="true" className="discover-filter-option-check" />}
        </button>
        {sports.map((sport) => {
          const selected = selectedSports.includes(sport);
          return (
            <button
              key={sport}
              type="button"
              className={`discover-filter-option${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => setSelectedSports((current) => (
                selected ? current.filter((value) => value !== sport) : [...current, sport]
              ))}
            >
              <span>{sport}</span>
              {selected && <Check aria-hidden="true" className="discover-filter-option-check" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type DiscoverFilterBarProps<TEventType extends string = Event['eventType']> = {
  location: { lat: number; lng: number } | null;
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  selectedEventTypes: TEventType[];
  setSelectedEventTypes: (value: TEventType[]) => void;
  eventTypeOptions: readonly TEventType[];
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
  eventTags: EventTag[];
  eventTagsLoading: boolean;
  eventTagsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  divisionFilters: DivisionDiscoveryFilterValue;
  setDivisionFilters: (value: DivisionDiscoveryFilterValue) => void;
  divisionOptions: DivisionDiscoveryFilterOptions;
  activeFilterCount: number;
  resetFilters: () => void;
  onOpenMoreFilters: () => void;
};

export default function DiscoverFilterBar<TEventType extends string = Event['eventType']>({
  location,
  selectedSports,
  setSelectedSports,
  sports,
  sportsLoading,
  sportsError,
  selectedEventTypes,
  setSelectedEventTypes,
  eventTypeOptions,
  selectedTags,
  setSelectedTags,
  eventTags,
  eventTagsLoading,
  eventTagsError,
  maxDistance,
  setMaxDistance,
  defaultMaxDistance,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  divisionFilters,
  setDivisionFilters,
  divisionOptions,
  activeFilterCount,
  resetFilters,
  onOpenMoreFilters,
}: DiscoverFilterBarProps<TEventType>) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const panelId = useId();
  const setOpen = (id: string) => (open: boolean) => setOpenFilter(open ? id : null);

  const eventTypeOptionsData = eventTypeOptions.map((type) => ({
    value: type,
    label: formatEnumDisplayLabel(type, 'Event'),
  }));
  const eventTypesActive = selectedEventTypes.length !== eventTypeOptions.length;
  const eventTypeLabels = eventTypesActive ? selectedLabels(selectedEventTypes, eventTypeOptionsData) : [];
  const tagOptions = eventTags
    .slice()
    .sort((left, right) => (right.eventCount ?? 0) - (left.eventCount ?? 0) || left.name.localeCompare(right.name))
    .map((tag) => ({ value: tag.name, label: tag.name, count: tag.eventCount }));
  const filteredTagOptions = tagSearch.trim()
    ? tagOptions.filter((tag) => tag.label.toLowerCase().includes(tagSearch.trim().toLowerCase()))
    : tagOptions;
  const tagLabels = selectedLabels(selectedTags, tagOptions);
  const tagActive = selectedTags.length > 0;
  const genderOptions = optionList(divisionOptions.genders);
  const ageOptions = optionList(divisionOptions.ages);
  const skillOptions = divisionOptions.skillOptions;
  const genderLabels = selectedLabels(divisionFilters.genders, genderOptions);
  const ageLabels = selectedLabels(divisionFilters.ageDivisionTypeIds, ageOptions);
  const skillLabels = selectedLabels(divisionFilters.skillDivisionTypeIds, skillOptions);
  const distanceMiles = typeof maxDistance === 'number' ? Math.round(maxDistance / KM_PER_MILE) : null;
  const distanceActive = Boolean(location && distanceMiles !== null);
  const priceActive = divisionFilters.priceMinDollars !== null || divisionFilters.priceMaxDollars !== null;
  const dateActive = Boolean(selectedStartDate || selectedEndDate);
  const sportsKey = `${sports.join('|')}::${selectedSports.join('|')}`;
  const filtersKey = [
    selectedStartDate?.toISOString() ?? '',
    selectedEndDate?.toISOString() ?? '',
    selectedEventTypes.join('|'),
    selectedTags.join('|'),
    maxDistance ?? '',
    location ? 'location' : 'no-location',
    distanceMiles ?? '',
    divisionFilters.genders.join('|'),
    divisionFilters.ageDivisionTypeIds.join('|'),
    divisionFilters.skillDivisionTypeIds.join('|'),
    divisionFilters.priceMinDollars ?? '',
    divisionFilters.priceMaxDollars ?? '',
    eventTags.length,
    divisionOptions.genders.length,
    divisionOptions.ages.length,
    divisionOptions.skillOptions.length,
    activeFilterCount,
  ].join('::');

  const sportsItems: FilterItem[] = sportsLoading
    ? [{ key: 'loading', node: <Loader size="sm" aria-label="Loading sports" /> }]
    : [
      {
        key: 'all-sports',
        node: (
          <button type="button" className={`discover-sport-filter${selectedSports.length === 0 ? ' is-all-selected' : ''}`} aria-pressed={selectedSports.length === 0} onClick={() => setSelectedSports([])}>
            All sports
          </button>
        ),
      },
      ...sports.map((sport) => ({
        key: sport,
        node: (
          <button
            type="button"
            className={`discover-sport-filter${selectedSports.includes(sport) ? ' is-selected' : ''}`}
            aria-pressed={selectedSports.includes(sport)}
            onClick={() => setSelectedSports((current) => (
              current.includes(sport) ? current.filter((value) => value !== sport) : [...current, sport]
            ))}
          >
            {sport}
          </button>
        ),
      })),
    ];

  const filterContext: DiscoverFilterItemContext<TEventType> = {
    panelId,
    openFilter,
    setOpen,
    selectedStartDate,
    setSelectedStartDate,
    selectedEndDate,
    setSelectedEndDate,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    eventTypeOptionsData,
    eventTypeLabels,
    eventTypesActive,
    selectedTags,
    setSelectedTags,
    tagLabels,
    tagSearch,
    setTagSearch,
    filteredTagOptions,
    tagActive,
    eventTagsLoading,
    eventTagsError,
    location,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    distanceMiles,
    distanceActive,
    dateActive,
    priceActive,
    divisionFilters,
    setDivisionFilters,
    genderOptions,
    genderLabels,
    ageOptions,
    ageLabels,
    skillOptions,
    skillLabels,
  };
  const filterItems: FilterItem[] = [
    { key: 'dates', node: <DatesFilterItem context={filterContext} /> },
    { key: 'price', node: <PriceFilterItem context={filterContext} /> },
    { key: 'distance', node: <DistanceFilterItem context={filterContext} /> },
    { key: 'event-types', node: <EventTypeFilterItem context={filterContext} /> },
    { key: 'event-tags', node: <EventTagsFilterItem context={filterContext} /> },
    { key: 'gender', node: <GenderFilterItem context={filterContext} /> },
    { key: 'age-group', node: <AgeGroupFilterItem context={filterContext} /> },
    { key: 'skill-level', node: <SkillLevelFilterItem context={filterContext} /> },
  ];
  const clearAllControl = renderClearAllControl(activeFilterCount, resetFilters);

  return (
    <div className="discover-filter-bar">
      <OverflowFilterRow items={sportsItems} contentKey={sportsKey} ariaLabel="Sports" moreLabel="More sports" onMore={onOpenMoreFilters} />
      <OverflowFilterRow
        items={filterItems}
        contentKey={filtersKey}
        ariaLabel="Event filters"
        moreLabel={`More filters${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
        onMore={onOpenMoreFilters}
        trailing={clearAllControl}
      />
      {sportsError && <div className="discover-filter-error" role="alert">{sportsError}</div>}
    </div>
  );
}
