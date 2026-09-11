'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  Button,
  Loader,
  MultiSelect,
  TextInput,
} from '@/components/organization/organization-operation-ui';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  discoverDateParamToDate,
  discoverDateToParam,
  type DiscoverTabValue,
} from '@/lib/discoverFilters';
import { cn } from '@/lib/utils';

const TAB_LABELS: Record<DiscoverTabValue, string> = {
  events: 'Events',
  organizations: 'Organizations',
  rentals: 'Rentals',
  teams: 'Teams',
};
const TAB_VALUES: DiscoverTabValue[] = ['events', 'organizations', 'rentals', 'teams'];

export type DiscoverSearchBarProps = {
  activeTab: DiscoverTabValue;
  onTabChange: (tab: DiscoverTabValue) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  locationControls: ReactNode;
  locationLabel: string;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  selectedSports: string[];
  setSelectedSports: (value: string[]) => void;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  onSearch: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const dateLabel = (value: Date | null): string => (
  value ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
);

const dateRangeLabel = (start: Date | null, end: Date | null): string => {
  if (start && end) return `${dateLabel(start)} – ${dateLabel(end)}`;
  if (start) return `From ${dateLabel(start)}`;
  if (end) return `Until ${dateLabel(end)}`;
  return 'Any dates';
};

export default function DiscoverSearchBar({
  activeTab,
  onTabChange,
  searchTerm,
  onSearchTermChange,
  locationControls,
  locationLabel,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  selectedSports,
  setSelectedSports,
  sports,
  sportsLoading,
  sportsError,
  onSearch,
  expanded,
  onExpandedChange,
}: DiscoverSearchBarProps) {
  const id = useId();
  const searchFormId = `${id}-form`;
  const panelId = `${id}-controls`;
  const summaryRef = useRef<HTMLButtonElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const wasExpanded = useRef(expanded);
  const whereSummary = locationLabel.trim() || 'Anywhere';
  const isEventSearch = activeTab === 'events';
  const whenSummary = isEventSearch ? dateRangeLabel(selectedStartDate, selectedEndDate) : 'Events only';
  const sportSummary = selectedSports.join(', ') || 'All sports';

  useEffect(() => {
    if (wasExpanded.current === expanded) return;
    wasExpanded.current = expanded;
    if (expanded) queryRef.current?.focus();
    else summaryRef.current?.focus();
  }, [expanded]);

  return (
    <div role="search" aria-label="Discover search" className="mx-auto w-full min-w-0 max-w-5xl">
      {!expanded ? (
        <button
          ref={summaryRef}
          type="button"
          aria-label={`Edit search: ${TAB_LABELS[activeTab]}${searchTerm.trim() ? `, ${searchTerm.trim()}` : ''}, ${whereSummary}, ${whenSummary}, ${sportSummary}`}
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => onExpandedChange(true)}
          className="mx-auto flex min-h-11 w-full max-w-3xl items-center gap-3 rounded-3xl border border-border bg-background px-4 py-3 text-left shadow-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none sm:rounded-full sm:px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="mb-2 block truncate text-sm font-semibold text-foreground">
              {TAB_LABELS[activeTab]}{searchTerm.trim() ? ` · ${searchTerm.trim()}` : ''}
            </span>
            <span className="grid min-w-0 grid-cols-3 divide-x divide-border">
              {[
                { label: 'Where', value: whereSummary },
                { label: 'When', value: whenSummary },
                { label: 'Sport', value: sportSummary },
              ].map(({ label, value }) => (
                <span key={label} className="min-w-0 px-2 first:pl-0 sm:px-4">
                  <span className="block text-xs font-semibold text-foreground">{label}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground" title={value}>{value}</span>
                </span>
              ))}
            </span>
          </span>
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Search className="size-5" />
          </span>
        </button>
      ) : (
        <div id={panelId} className="space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div role="group" aria-label="Search type" className="flex min-w-0 flex-wrap justify-center gap-1">
              {TAB_VALUES.map((tab) => (
                <Button
                  key={tab}
                  type="button"
                  variant="subtle"
                  radius="xl"
                  aria-pressed={activeTab === tab}
                  onClick={() => onTabChange(tab)}
                  className={cn('min-h-11 rounded-full px-4', activeTab === tab && 'bg-primary/10 font-semibold text-primary')}
                >
                  {TAB_LABELS[tab]}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="subtle"
              radius="xl"
              aria-label="Collapse search"
              aria-expanded={true}
              aria-controls={panelId}
              onClick={() => onExpandedChange(false)}
              className="min-h-11 min-w-11 rounded-full"
              leftSection={<ChevronUp aria-hidden="true" className="size-4" />}
            >
              <span className="hidden sm:inline">Collapse</span>
            </Button>
          </div>
          <form
            id={searchFormId}
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
            className="mx-auto w-full max-w-xl"
          >
            <TextInput
              ref={queryRef}
              label="Search by name or keyword"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.currentTarget.value)}
              placeholder={`Search ${TAB_LABELS[activeTab].toLowerCase()}`}
              leftSection={<Search aria-hidden="true" className="size-4 text-muted-foreground" />}
              radius="xl"
            />
          </form>
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 rounded-3xl border border-border bg-background p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-3 md:rounded-full md:px-6">
            <fieldset className="min-w-0 space-y-1.5 border-0 p-0">
              <legend className="mb-1.5 text-sm font-semibold text-foreground">Where</legend>
              <div className="min-w-0 max-w-full [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:max-w-full [&_button]:whitespace-normal">
                {locationControls}
              </div>
            </fieldset>
            <div className="min-w-0 space-y-1.5">
              <span id={`${id}-when-label`} className="block text-sm font-semibold text-foreground">When</span>
              {isEventSearch ? (
                <Popover>
                  <PopoverTrigger
                    aria-label={`When: ${whenSummary}`}
                    className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-full border border-input bg-background px-3 py-2 text-left hover:bg-muted"
                  >
                    <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm" title={whenSummary}>{whenSummary}</span>
                    <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </PopoverTrigger>
                  <PopoverContent align="center" aria-label="Choose dates" className="w-[calc(100vw-2rem)] max-w-lg gap-4 rounded-2xl p-4">
                    <fieldset className="grid min-w-0 grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
                      <legend className="mb-3 text-base font-semibold">Date range</legend>
                      <TextInput
                        type="date"
                        label="Start date"
                        value={discoverDateToParam(selectedStartDate) ?? ''}
                        max={discoverDateToParam(selectedEndDate) ?? undefined}
                        onChange={(event) => {
                          const startDate = discoverDateParamToDate(event.currentTarget.value);
                          if (startDate && selectedEndDate && startDate > selectedEndDate) {
                            setSelectedEndDate(null);
                          }
                          setSelectedStartDate(startDate);
                        }}
                      />
                      <TextInput
                        type="date"
                        label="End date"
                        value={discoverDateToParam(selectedEndDate) ?? ''}
                        min={discoverDateToParam(selectedStartDate) ?? undefined}
                        onChange={(event) => {
                          const endDate = discoverDateParamToDate(event.currentTarget.value);
                          if (endDate && selectedStartDate && endDate < selectedStartDate) {
                            setSelectedStartDate(null);
                          }
                          setSelectedEndDate(endDate);
                        }}
                      />
                    </fieldset>
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => {
                          setSelectedStartDate(null);
                          setSelectedEndDate(null);
                        }}
                      >
                        Clear dates
                      </Button>
                      <PopoverClose className="items-center justify-center rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-action-hover">
                        Done
                      </PopoverClose>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <div
                  role="group"
                  aria-label={`When: ${whenSummary}`}
                  className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-2 text-muted-foreground"
                >
                  <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                  <span className="text-sm">{whenSummary}</span>
                </div>
              )}
            </div>
            <MultiSelect
              label="Sport"
              data={sports}
              value={selectedSports}
              onChange={setSelectedSports}
              placeholder={sportsLoading ? 'Loading sports…' : 'All sports'}
              disabled={sportsLoading}
              aria-busy={sportsLoading}
              error={sportsError}
              nothingFoundMessage="No sports match your search."
              rightSection={sportsLoading ? <Loader size="sm" aria-label="Loading sports" /> : undefined}
              className="min-w-0 [&_button]:min-h-11 [&_button]:min-w-11"
            />
            <Button
              type="submit"
              form={searchFormId}
              radius="xl"
              className="min-h-11 w-full rounded-full px-6 md:mt-[1.625rem] md:w-auto"
              leftSection={<Search aria-hidden="true" className="size-4" />}
            >
              Search
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
