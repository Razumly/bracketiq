'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { SportIcon } from '@/components/ui/SportIcon';
import type { SportCategory } from '@/types';
import {
  buildSportCategoryGroups,
  getSportSelectionLabels,
  getUngroupedSportOptions,
  isSportCategoryPartiallySelected,
  isSportCategorySelected,
  normalizeSportFilterOptions,
  toggleSportCategorySelection,
  toggleSportSelection,
  type SportFilterOption,
} from '@/lib/sportCategoryFilters';

type SportCategoryMultiSelectProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'size' | 'className' | 'placeholder' | 'disabled'
> & {
  data?: ReadonlyArray<SportFilterOption>;
  categories?: ReadonlyArray<SportCategory>;
  value?: ReadonlyArray<string>;
  onChange?: (value: string[]) => void;
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  nothingFoundMessage?: string;
  rightSection?: ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};
const EMPTY_OPTIONS: ReadonlyArray<SportFilterOption> = [];
const EMPTY_CATEGORIES: ReadonlyArray<SportCategory> = [];

const selectedOption = (selected: ReadonlyArray<string>, name: string): boolean => {
  const key = name.trim().toLowerCase();
  return selected.some((value) => value.trim().toLowerCase() === key);
};

export function SportCategoryMultiSelect({
  data = EMPTY_OPTIONS,
  categories = EMPTY_CATEGORIES,
  value = [],
  onChange,
  label,
  description,
  error,
  placeholder = 'All sports',
  nothingFoundMessage = 'No sports found',
  rightSection,
  disabled = false,
  open: openProp,
  onOpenChange,
  className = '',
  id: providedId,
  'aria-label': ariaLabel,
  ...inputProps
}: SportCategoryMultiSelectProps) {
  const generatedId = useId();
  const inputId = providedId ?? `sport-category-select-${generatedId}`;
  const labelId = `${inputId}-label`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
  const isOpen = openProp ?? opened;
  const setOpen = useCallback((nextOpen: boolean) => {
    if (openProp === undefined) setOpened(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange, openProp]);

  const normalizedOptions = useMemo(() => normalizeSportFilterOptions(data), [data]);
  const groups = useMemo(() => buildSportCategoryGroups(data, categories), [data, categories]);
  const ungroupedOptions = useMemo(() => getUngroupedSportOptions(data, categories), [data, categories]);
  const selectionLabels = useMemo(
    () => getSportSelectionLabels(value, data, categories),
    [categories, data, value],
  );
  const search = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => groups.flatMap((group) => {
    if (!search) return [group];
    const categoryMatches = group.category.name.toLowerCase().includes(search);
    const sports = categoryMatches
      ? group.sports
      : group.sports.filter((sport) => sport.name.toLowerCase().includes(search));
    return sports.length > 0 ? [{ ...group, sports }] : [];
  }), [groups, search]);
  const filteredUngroupedOptions = useMemo(
    () => ungroupedOptions.filter((sport) => !search || sport.name.toLowerCase().includes(search)),
    [search, ungroupedOptions],
  );
  const hasResults = filteredGroups.length > 0 || filteredUngroupedOptions.length > 0;

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, setOpen]);
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const emit = (nextValue: string[]) => {
    onChange?.(nextValue);
  };

  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const renderSportOption = (sport: { id: string; name: string }, keyPrefix: string) => {
    const selected = selectedOption(value, sport.name);
    return (
      <button
        key={`${keyPrefix}-${sport.id}`}
        type="button"
        role="option"
        aria-selected={selected}
        className={`sport-category-select__option${selected ? ' is-selected' : ''}`}
        onClick={() => emit(toggleSportSelection(value, sport.name))}
      >
        <span className="sport-category-select__option-label">
          <SportIcon sport={sport.name} size={20} />
          <span>{sport.name}</span>
        </span>
        <span className="sport-category-select__check" aria-hidden="true">
          {selected ? <Check size={16} strokeWidth={2.5} /> : null}
        </span>
      </button>
    );
  };

  return (
    <div ref={rootRef} className={`sport-category-select ${className}`.trim()}>
      {label ? (
        <label id={labelId} htmlFor={inputId} className="sport-category-select__label">
          {label}
        </label>
      ) : null}
      {description ? <div className="sport-category-select__description">{description}</div> : null}
      <div className={`sport-category-select__control${isOpen ? ' is-open' : ''}${error ? ' has-error' : ''}`}>
        <input
          {...inputProps}
          id={inputId}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-labelledby={label ? labelId : undefined}
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          disabled={disabled}
          autoFocus={isOpen}
          readOnly={!isOpen}
          value={isOpen ? query : (selectionLabels.join(', ') || placeholder)}
          placeholder={isOpen ? placeholder : undefined}
          className="sport-category-select__input"
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              close();
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'Enter') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        {rightSection ? <span className="sport-category-select__right-section">{rightSection}</span> : null}
      </div>
      {error ? <div className="sport-category-select__error" role="alert">{error}</div> : null}
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={typeof label === 'string' ? `${label} options` : 'Sport options'}
          aria-multiselectable="true"
          className="sport-category-select__list"
        >
          <button
            type="button"
            role="option"
            aria-selected={value.length === 0}
            className={`sport-category-select__option${value.length === 0 ? ' is-selected' : ''}`}
            onClick={() => emit([])}
          >
            <span className="sport-category-select__option-label">
              <span className="sport-category-select__all-icon" aria-hidden="true">All</span>
              <span>All sports</span>
            </span>
            <span className="sport-category-select__check" aria-hidden="true">
              {value.length === 0 ? <Check size={16} strokeWidth={2.5} /> : null}
            </span>
          </button>

          {filteredGroups.map((group) => {
            const categoryId = `${listboxId}-${group.category.$id}`;
            const childrenId = `${categoryId}-children`;
            const expanded = Boolean(search) || expandedCategoryIds.has(group.category.$id);
            const selected = isSportCategorySelected(group.category, value, data);
            const partial = isSportCategoryPartiallySelected(group.category, value, data);
            return (
              <div
                key={group.category.$id}
                role="group"
                aria-label={group.category.name}
                className="sport-category-select__category-group"
              >
                <div className={`sport-category-select__category${selected ? ' is-selected' : ''}${partial ? ' is-partial' : ''}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className="sport-category-select__category-select"
                    onClick={() => emit(toggleSportCategorySelection(value, group.category, data))}
                  >
                    <SportIcon sport={group.category.name} size={22} />
                    <span className="sport-category-select__category-name">{group.category.name}</span>
                    <span className="sport-category-select__category-count">{group.sports.length}</span>
                    <span className="sport-category-select__check" aria-hidden="true">
                      {selected ? <Check size={16} strokeWidth={2.5} /> : partial ? <Minus size={16} strokeWidth={2.5} /> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sport-category-select__expand"
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.category.name}`}
                    aria-expanded={expanded}
                    aria-controls={childrenId}
                    onClick={() => toggleCategoryExpanded(group.category.$id)}
                  >
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                </div>
                {expanded ? (
                  <div id={childrenId} className="sport-category-select__children">
                    {group.sports.map((sport) => renderSportOption(sport, group.category.$id))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {filteredUngroupedOptions.map((sport) => renderSportOption(sport, 'ungrouped'))}
          {!hasResults ? <div className="sport-category-select__empty">{nothingFoundMessage}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export default SportCategoryMultiSelect;
