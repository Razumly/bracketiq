"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { CalendarDays, Search, X } from "lucide-react";
import {
  Button,
  Loader,
  TextInput,
} from "@/components/organization/organization-operation-ui";
import SportCategoryMultiSelect from "@/components/ui/SportCategoryMultiSelect";
import { type DiscoverTabValue } from "@/lib/discoverFilters";
import DiscoverDateRangePicker from "./DiscoverDateRangePicker";
import { getSportSelectionLabels } from "@/lib/sportCategoryFilters";
import type { SportCategory } from "@/types";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<DiscoverTabValue, string> = {
  events: "Events",
  organizations: "Organizations",
  rentals: "Rentals",
  teams: "Teams",
};
const TAB_VALUES: DiscoverTabValue[] = [
  "events",
  "organizations",
  "rentals",
  "teams",
];
const PANEL_EXIT_DURATION_MS = 360;

type SearchSection = "where" | "when" | "sport";
type LocationControlProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
type LocationControlRenderer = (props: LocationControlProps) => ReactNode;

export type DiscoverSearchBarProps = {
  activeTab: DiscoverTabValue;
  onTabChange: (tab: DiscoverTabValue) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  locationControls: ReactNode | LocationControlRenderer;
  locationLabel: string;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  selectedSports: string[];
  setSelectedSports: (value: string[]) => void;
  sports: string[];
  sportCategories?: SportCategory[];
  sportsLoading: boolean;
  sportsError: string | null;
  onSearch: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const dateLabel = (value: Date | null): string =>
  value
    ? value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

const dateRangeLabel = (start: Date | null, end: Date | null): string => {
  if (start && end) return `${dateLabel(start)} – ${dateLabel(end)}`;
  if (start) return `From ${dateLabel(start)}`;
  if (end) return `Until ${dateLabel(end)}`;
  return "Any dates";
};

const sectionLabel: Record<SearchSection, string> = {
  where: "Where",
  when: "When",
  sport: "Sport",
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
  sportCategories = [],
  sportsLoading,
  sportsError,
  onSearch,
  expanded,
  onExpandedChange,
}: DiscoverSearchBarProps) {
  const id = useId();
  const searchFormId = `${id}-form`;
  const panelId = `${id}-controls`;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const wasExpanded = useRef(false);
  const insideClickRef = useRef<Event | null>(null);
  const [isPanelMounted, setIsPanelMounted] = useState(expanded);
  const [isPanelReady, setIsPanelReady] = useState(expanded);
  const [activeSection, setActiveSection] = useState<SearchSection | null>(
    null,
  );
  const whereSummary = locationLabel.trim() || "Anywhere";
  const isEventSearch = activeTab === "events";
  const whenSummary = isEventSearch
    ? dateRangeLabel(selectedStartDate, selectedEndDate)
    : "Events only";
  const sportSummary =
    getSportSelectionLabels(selectedSports, sports, sportCategories).join(
      ", ",
    ) || "All sports";
  const hasSelectedDates = Boolean(selectedStartDate || selectedEndDate);

  const setExpanded = (nextExpanded: boolean) => {
    if (!nextExpanded) {
      setActiveSection(null);
    } else {
      setIsPanelMounted(true);
      if (!expanded) setIsPanelReady(false);
    }
    onExpandedChange(nextExpanded);
  };

  const selectSection = (section: SearchSection) => {
    if (section === "when" && !isEventSearch) return;
    setActiveSection(section);
    setExpanded(true);
  };

  const handleSectionOpenChange = (
    section: SearchSection,
    nextOpen: boolean,
  ) => {
    if (nextOpen) {
      setActiveSection(section);
      if (!expanded) setExpanded(true);
    } else if (activeSection === section) {
      setActiveSection(null);
    }
  };

  const handleSectionClick = (
    section: SearchSection,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (!expanded) {
      selectSection(section);
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('button, input, [role="combobox"]')) return;
    selectSection(section);
  };

  const handleSurfaceClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (expanded) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, [role="combobox"], [data-section]'))
      return;
    setActiveSection(null);
    setExpanded(true);
  };

  const renderLocationControls =
    typeof locationControls === "function"
      ? locationControls({
          open: expanded && activeSection === "where",
          onOpenChange: (nextOpen) =>
            handleSectionOpenChange("where", nextOpen),
        })
      : locationControls;

  useEffect(() => {
    if (!expanded) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (insideClickRef.current !== event) {
        setActiveSection(null);
        onExpandedChange(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setActiveSection(null);
      onExpandedChange(false);
    };
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (wasExpanded.current === expanded) return;
    wasExpanded.current = expanded;
    if (expanded) {
      if (activeSection === null)
        queryRef.current?.focus({ preventScroll: true });
    } else {
      surfaceRef.current
        ?.querySelector<HTMLButtonElement>(".discover-search-submit-button")
        ?.focus({ preventScroll: true });
    }
  }, [activeSection, expanded]);
  useEffect(() => {
    if (!expanded || !isPanelMounted || isPanelReady) return;

    const frame = window.requestAnimationFrame(() => setIsPanelReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, isPanelMounted, isPanelReady]);

  useEffect(() => {
    if (expanded || !isPanelMounted) return;

    const timeout = window.setTimeout(() => {
      setIsPanelMounted(false);
      setIsPanelReady(false);
    }, PANEL_EXIT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [expanded, isPanelMounted]);

  return (
    <div
      role="search"
      aria-label="Discover search"
      className="discover-search-bar mx-auto w-full max-w-5xl min-w-0"
      onClickCapture={(event) => {
        insideClickRef.current = event.nativeEvent;
      }}
    >
      <div
        ref={surfaceRef}
        className="discover-search-surface"
        data-state={expanded ? "open" : isPanelMounted ? "closing" : "closed"}
        onClick={handleSurfaceClick}
      >
        <div className="discover-search-type-row">
          <div
            role="group"
            aria-label="Search type"
            className="discover-search-type-group"
            data-active-tab={activeTab}
          >
            {TAB_VALUES.map((tab) => {
              const isActiveTab = activeTab === tab;
              return (
                <Button
                  key={tab}
                  type="button"
                  variant="subtle"
                  radius="xl"
                  aria-pressed={isActiveTab}
                  aria-hidden={(!expanded && !isActiveTab) || undefined}
                  tabIndex={!expanded && !isActiveTab ? -1 : undefined}
                  data-active={isActiveTab || undefined}
                  onClick={() => {
                    if (!expanded) {
                      setActiveSection(null);
                      setExpanded(true);
                    }
                    if (tab !== "events") setActiveSection(null);
                    onTabChange(tab);
                  }}
                  className={cn(
                    "discover-search-type-button min-h-11 rounded-md px-4",
                    isActiveTab && "bg-primary/10 text-primary font-semibold",
                  )}
                >
                  {TAB_LABELS[tab]}
                </Button>
              );
            })}
          </div>
        </div>
        <div
          id={panelId}
          className="discover-search-panel"
          data-state={
            expanded
              ? isPanelReady
                ? "open"
                : "closed"
              : isPanelMounted
                ? "closing"
                : "closed"
          }
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && !expanded) {
              setIsPanelMounted(false);
              setIsPanelReady(false);
            }
          }}
        >
          <form
            id={searchFormId}
            aria-hidden={!expanded || undefined}
            inert={!expanded || undefined}
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
            className="discover-search-query mx-auto w-full max-w-xl"
          >
            <TextInput
              ref={queryRef}
              label="Search by name or keyword"
              value={searchTerm}
              onChange={(event) =>
                onSearchTermChange(event.currentTarget.value)
              }
              placeholder={`Search ${TAB_LABELS[activeTab].toLowerCase()}`}
              leftSection={
                <Search
                  aria-hidden="true"
                  className="text-muted-foreground size-4"
                />
              }
              radius="xl"
              disabled={!expanded}
            />
          </form>
          <div className="discover-search-sections-frame">
            <div className="discover-search-sections">
              <section
                className={cn(
                  "discover-search-section-item",
                  activeSection === "where" && "is-active",
                )}
                data-section="where"
                aria-label={`${sectionLabel.where}: ${whereSummary}`}
                onClick={(event) => handleSectionClick("where", event)}
              >
                <span className="discover-search-section-label">
                  {sectionLabel.where}
                </span>
                <div className="discover-search-section-control">
                  {renderLocationControls}
                </div>
              </section>
              <section
                className={cn(
                  "discover-search-section-item",
                  activeSection === "when" && "is-active",
                )}
                data-section="when"
                aria-label={`${sectionLabel.when}: ${whenSummary}`}
                onClick={(event) => handleSectionClick("when", event)}
              >
                <span className="discover-search-section-label">
                  {sectionLabel.when}
                </span>
                {isEventSearch ? (
                  <div className="discover-search-section-control discover-search-date-control">
                    <DiscoverDateRangePicker
                      selectedStartDate={selectedStartDate}
                      setSelectedStartDate={setSelectedStartDate}
                      selectedEndDate={selectedEndDate}
                      setSelectedEndDate={setSelectedEndDate}
                      searchExpanded={expanded}
                      open={expanded && activeSection === "when"}
                      onOpenChange={(nextOpen) =>
                        handleSectionOpenChange("when", nextOpen)
                      }
                      className="discover-search-date-trigger"
                      hasClearAction={hasSelectedDates}
                    />
                    {hasSelectedDates ? (
                      <button
                        type="button"
                        aria-label="Clear dates"
                        className="discover-search-date-clear"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedStartDate(null);
                          setSelectedEndDate(null);
                        }}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div
                    role="group"
                    aria-label={`When: ${whenSummary}`}
                    className="discover-search-section-disabled"
                  >
                    <CalendarDays
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span className="text-sm">{whenSummary}</span>
                  </div>
                )}
              </section>
              <section
                className={cn(
                  "discover-search-section-item",
                  activeSection === "sport" && "is-active",
                )}
                data-section="sport"
                aria-label={`${sectionLabel.sport}: ${sportSummary}`}
                onClick={(event) => handleSectionClick("sport", event)}
              >
                <span className="discover-search-section-label">
                  {sectionLabel.sport}
                </span>
                <SportCategoryMultiSelect
                  aria-label="Sport"
                  data={sports}
                  categories={sportCategories}
                  value={selectedSports}
                  onChange={setSelectedSports}
                  open={expanded && activeSection === "sport"}
                  onOpenChange={(nextOpen) =>
                    handleSectionOpenChange("sport", nextOpen)
                  }
                  placeholder={sportsLoading ? "Loading sports…" : "All sports"}
                  disabled={sportsLoading}
                  aria-busy={sportsLoading}
                  error={sportsError}
                  nothingFoundMessage="No sports match your search."
                  rightSection={
                    sportsLoading ? (
                      <Loader size="sm" aria-label="Loading sports" />
                    ) : undefined
                  }
                  className="discover-search-sport-select"
                />
              </section>
              <Button
                type="submit"
                form={searchFormId}
                radius="xl"
                aria-label="Search"
                className="discover-search-submit-button min-h-11 w-full rounded-md px-6"
                leftSection={<Search aria-hidden="true" className="size-4" />}
                onClick={(event) => {
                  if (!expanded) {
                    event.preventDefault();
                    setActiveSection(null);
                    setExpanded(true);
                  }
                }}
              >
                <span className="discover-search-submit-label">Search</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
      {(expanded || isPanelMounted) && (
        <div
          aria-hidden="true"
          className="discover-search-backdrop"
          data-state={expanded ? "open" : "closed"}
          onClick={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
