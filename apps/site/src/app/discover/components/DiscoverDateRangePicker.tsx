'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, format, isAfter, isBefore, isSameDay } from 'date-fns';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { discoverStartOfToday } from '@/lib/discoverFilters';

export type DiscoverDateRangePickerProps = {
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  searchExpanded: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  hasClearAction?: boolean;
};

type DateSelectionTarget = 'start' | 'end';

const dateLabel = (value: Date | null): string => (
  value ? format(value, 'MMM d, yyyy') : 'Add dates'
);

const initialSelectionTarget = (startDate: Date | null, endDate: Date | null): DateSelectionTarget => (
  startDate && !endDate ? 'end' : 'start'
);

const DATE_PREVIEW_CLASS_NAMES = {
  datePreviewForward1: 'discover-date-preview-forward-1',
  datePreviewForward2: 'discover-date-preview-forward-2',
  datePreviewForward3: 'discover-date-preview-forward-3',
  datePreviewBackward1: 'discover-date-preview-backward-1',
  datePreviewBackward2: 'discover-date-preview-backward-2',
  datePreviewBackward3: 'discover-date-preview-backward-3',
} as const;

const datePreviewModifiers = (
  startDate: Date | null,
  endDate: Date | null,
): Record<string, Date[]> => {
  if (startDate && !endDate) {
    return {
      datePreviewForward1: [addDays(startDate, 1)],
      datePreviewForward2: [addDays(startDate, 2)],
      datePreviewForward3: [addDays(startDate, 3)],
    };
  }
  if (endDate && !startDate) {
    return {
      datePreviewBackward1: [addDays(endDate, -1)],
      datePreviewBackward2: [addDays(endDate, -2)],
      datePreviewBackward3: [addDays(endDate, -3)],
    };
  }
  return {};
};

export default function DiscoverDateRangePicker({
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  searchExpanded,
  open: openProp,
  onOpenChange,
  className,
  hasClearAction = false,
}: DiscoverDateRangePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = openProp ?? uncontrolledOpen;
  const setPickerOpen = useCallback((nextOpen: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange, openProp]);
  const [selectionTarget, setSelectionTarget] = useState<DateSelectionTarget>(() => (
    initialSelectionTarget(selectedStartDate, selectedEndDate)
  ));
  const hasRange = Boolean(selectedStartDate && selectedEndDate);
  const singleSelectedDate = selectedStartDate ?? selectedEndDate ?? undefined;
  const singleSelectionSide = selectedStartDate && !selectedEndDate
    ? 'start'
    : selectedEndDate && !selectedStartDate
      ? 'end'
      : null;
  const calendarDefaultMonth = selectedStartDate ?? selectedEndDate ?? discoverStartOfToday();

  /* eslint-disable react-hooks/set-state-in-effect -- The search panel controls whether the portaled picker can reopen. */
  useEffect(() => {
    if (!searchExpanded) setPickerOpen(false);
  }, [searchExpanded, setPickerOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDateSelect = (date: Date) => {
    const isSelectedStart = Boolean(selectedStartDate && isSameDay(date, selectedStartDate));
    const isSelectedEnd = Boolean(selectedEndDate && isSameDay(date, selectedEndDate));

    if (isSelectedStart && isSelectedEnd) {
      setSelectedStartDate(null);
      setSelectedEndDate(null);
      setSelectionTarget('start');
      return;
    }
    if (isSelectedStart) {
      setSelectedStartDate(null);
      setSelectionTarget('start');
      return;
    }
    if (isSelectedEnd) {
      setSelectedEndDate(null);
      setSelectionTarget('end');
      return;
    }

    if (selectionTarget === 'start') {
      if (selectedEndDate && isAfter(date, selectedEndDate)) {
        setSelectedEndDate(null);
      }
      setSelectedStartDate(date);
      setSelectionTarget('end');
      return;
    }

    if (selectedStartDate && isBefore(date, selectedStartDate)) {
      setSelectedStartDate(null);
    }
    setSelectedEndDate(date);
    setSelectionTarget('start');
  };

  const calendarProps = {
    'aria-label': 'Date range calendar',
    autoFocus: true,
    defaultMonth: calendarDefaultMonth,
    numberOfMonths: 2,
    showOutsideDays: false,
    modifiers: datePreviewModifiers(selectedStartDate, selectedEndDate),
    modifiersClassNames: DATE_PREVIEW_CLASS_NAMES,
    className: 'discover-date-calendar',
    onDayClick: handleDateSelect,
    // Keep DayPicker controlled while custom onDayClick owns range transitions.
    onSelect: () => undefined,
  } as const;

  const triggerLabel = `When: ${hasRange
    ? `${dateLabel(selectedStartDate)} – ${dateLabel(selectedEndDate)}`
    : selectedStartDate
      ? `From ${dateLabel(selectedStartDate)}`
      : selectedEndDate
        ? `Until ${dateLabel(selectedEndDate)}`
        : 'Any dates'}`;

  return (
    <div className="discover-date-range-picker">
      <Popover
        open={isOpen && searchExpanded}
        onOpenChange={(nextOpen) => {
          if (searchExpanded && nextOpen) {
            setSelectionTarget(initialSelectionTarget(selectedStartDate, selectedEndDate));
          }
          setPickerOpen(searchExpanded && nextOpen);
        }}
      >
        <PopoverTrigger
          aria-label={triggerLabel}
          data-has-clear={hasClearAction || undefined}
          className={cn(
            'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left hover:bg-muted',
            className,
          )}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">
            {hasRange
              ? `${dateLabel(selectedStartDate)} – ${dateLabel(selectedEndDate)}`
              : selectedStartDate
                ? `From ${dateLabel(selectedStartDate)}`
                : selectedEndDate
                  ? `Until ${dateLabel(selectedEndDate)}`
                  : 'Any dates'}
          </span>
          {!hasClearAction ? <ChevronDown aria-hidden="true" className="discover-search-date-chevron size-4 shrink-0 text-muted-foreground" /> : null}
        </PopoverTrigger>
        <PopoverContent
          align="center"
          aria-label="Choose dates"
          hidden={!searchExpanded}
          inert={!searchExpanded || undefined}
          finalFocus={searchExpanded ? undefined : false}
          className="discover-date-picker-popover w-[calc(100vw-2rem)] max-w-3xl rounded-xl p-4 sm:p-6"
        >
          <div
            className="discover-date-picker"
            data-selection-target={selectionTarget}
            data-single-selection={singleSelectionSide ?? undefined}
          >
            <p className="discover-date-picker-instruction" role="status" aria-live="polite">
              {selectionTarget === 'start' ? 'Select a start date' : 'Select an end date'}
            </p>
            <div className="discover-date-picker-fields" role="group" aria-label="Date selection">
              <button
                type="button"
                className={cn('discover-date-picker-field', selectionTarget === 'start' && 'is-active')}
                aria-label={`Select start date${selectedStartDate ? `: ${dateLabel(selectedStartDate)}` : ''}`}
                aria-pressed={selectionTarget === 'start'}
                onClick={() => setSelectionTarget('start')}
              >
                <span className="discover-date-picker-field-label">Start date</span>
                <span className={cn('discover-date-picker-field-value', !selectedStartDate && 'is-placeholder')}>
                  {dateLabel(selectedStartDate)}
                </span>
              </button>
              <button
                type="button"
                className={cn('discover-date-picker-field', selectionTarget === 'end' && 'is-active')}
                aria-label={`Select end date${selectedEndDate ? `: ${dateLabel(selectedEndDate)}` : ''}`}
                aria-pressed={selectionTarget === 'end'}
                onClick={() => setSelectionTarget('end')}
              >
                <span className="discover-date-picker-field-label">End date</span>
                <span className={cn('discover-date-picker-field-value', !selectedEndDate && 'is-placeholder')}>
                  {dateLabel(selectedEndDate)}
                </span>
              </button>
            </div>
            <div className="discover-date-picker-calendar-shell">
              {hasRange ? (
                <Calendar
                  {...calendarProps}
                  mode="range"
                  selected={{ from: selectedStartDate!, to: selectedEndDate! } satisfies DateRange}
                />
              ) : (
                <Calendar
                  {...calendarProps}
                  mode="single"
                  selected={singleSelectedDate}
                />
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

