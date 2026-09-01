"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { Activity, AlertTriangle, RefreshCw } from "lucide-react";
import {
  AFFILIATE_OPERATIONS_DETAIL_TYPES,
  AFFILIATE_OPERATIONS_VIEWS,
  type AffiliateOperationsDetailType,
  type AffiliateOperationsFilters,
  type AffiliateOperationsProjection,
  type AffiliateOperationsView,
} from "@/types/affiliateOperations";
import { getAffiliateOperationsProjection } from "@/lib/affiliateOperationsService";
import {
  anchorElementId,
  formatDate,
} from "./AdminAffiliateOperationsFormatting";
import {
  filterKeysByView,
  normalizeProjectionSearchParams,
  useQueryNavigation,
} from "./AdminAffiliateOperationsNavigation";
import {
  emptyFilters,
  FilterBar,
} from "./AdminAffiliateOperationsVisuals";
import {
  AlertsView,
  CandidatesView,
  CoverageView,
  CutoverView,
  IntakeView,
  JobsView,
  OverviewView,
  ReviewView,
  SourcesView,
} from "./AdminAffiliateOperationsViews";
import { DetailDrawer } from "./AdminAffiliateOperationsDetail";
const viewLabels: Record<AffiliateOperationsView, string> = {
  overview: "Overview",
  coverage: "Coverage",
  jobs: "Jobs",
  intake: "Source Intake",
  review: "Review Queue",
  sources: "Sources",
  candidates: "Candidates",
  alerts: "Alerts",
  cutover: "Cutover",
};


const isView = (value: string | null): value is AffiliateOperationsView =>
  Boolean(
    value && (AFFILIATE_OPERATIONS_VIEWS as readonly string[]).includes(value),
  );

const isDetailType = (
  value: string | null,
): value is AffiliateOperationsDetailType =>
  Boolean(
    value &&
      (AFFILIATE_OPERATIONS_DETAIL_TYPES as readonly string[]).includes(value),
  );


const listQueryKey = (query: string): string => {
  const params = new URLSearchParams(query);
  params.delete("selectedType");
  params.delete("selected");
  params.delete("anchor");
  return params.toString();
};
const MAX_PROJECTION_CACHE_ENTRIES = 4;

const setCachedProjection = (
  cache: Map<string, AffiliateOperationsProjection>,
  query: string,
  projection: AffiliateOperationsProjection,
): void => {
  cache.set(query, projection);
  while (cache.size > MAX_PROJECTION_CACHE_ENTRIES) {
    const oldestQuery = cache.keys().next().value;
    if (typeof oldestQuery !== "string") break;
    cache.delete(oldestQuery);
  }
};




const reorderFocusedRow = <T extends Readonly<{ id: string }>>(
  previousRows: readonly T[],
  nextRows: readonly T[],
  selectedId: string,
): readonly T[] => {
  const previousIndex = previousRows.findIndex((row) => row.id === selectedId);
  if (previousIndex < 0) return nextRows;
  const nextFocusedRow = nextRows.find((row) => row.id === selectedId);
  if (nextFocusedRow) {
    const rowsWithoutFocusedRow = nextRows.filter((row) => row.id !== selectedId);
    const insertionIndex = Math.min(previousIndex, rowsWithoutFocusedRow.length);
    return [
      ...rowsWithoutFocusedRow.slice(0, insertionIndex),
      nextFocusedRow,
      ...rowsWithoutFocusedRow.slice(insertionIndex),
    ];
  }
  const retainedRows = [
    ...nextRows.slice(0, previousIndex),
    previousRows[previousIndex],
    ...nextRows.slice(previousIndex),
  ];
  return retainedRows.slice(0, Math.max(nextRows.length, previousIndex + 1));
};
type FocusedListSelection = (
  previous: AffiliateOperationsProjection,
  next: AffiliateOperationsProjection,
  selectedId: string,
) => AffiliateOperationsProjection;

const retainOverviewFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  overview: {
    ...next.overview,
    priorityWork: reorderFocusedRow(
      previous.overview.priorityWork,
      next.overview.priorityWork,
      selectedId,
    ),
  },
});

const retainCoverageCellFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  coverage: {
    ...next.coverage,
    cells: {
      ...next.coverage.cells,
      rows: reorderFocusedRow(
        previous.coverage.cells.rows,
        next.coverage.cells.rows,
        selectedId,
      ),
    },
  },
});

const retainCoverageTargetFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  coverage: {
    ...next.coverage,
    targets: reorderFocusedRow(
      previous.coverage.targets,
      next.coverage.targets,
      selectedId,
    ),
  },
});

const retainJobsFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  jobs: {
    ...next.jobs,
    rows: reorderFocusedRow(previous.jobs.rows, next.jobs.rows, selectedId),
  },
});

const retainIntakeFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  intake: {
    ...next.intake,
    rows: reorderFocusedRow(previous.intake.rows, next.intake.rows, selectedId),
  },
});

const retainReviewFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  review: {
    ...next.review,
    rows: reorderFocusedRow(previous.review.rows, next.review.rows, selectedId),
  },
});

const retainSourcesFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  sources: {
    ...next.sources,
    rows: reorderFocusedRow(previous.sources.rows, next.sources.rows, selectedId),
  },
});

const retainCandidatesFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  candidates: {
    ...next.candidates,
    rows: reorderFocusedRow(
      previous.candidates.rows,
      next.candidates.rows,
      selectedId,
    ),
  },
});

const retainAlertsFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  alerts: {
    ...next.alerts,
    rows: reorderFocusedRow(previous.alerts.rows, next.alerts.rows, selectedId),
  },
});

const retainCutoverFocusedRow: FocusedListSelection = (
  previous,
  next,
  selectedId,
) => ({
  ...next,
  cutover: {
    ...next.cutover,
    rows: reorderFocusedRow(previous.cutover.rows, next.cutover.rows, selectedId),
  },
});

const focusedListSelections: Record<string, FocusedListSelection> = {
  "overview:job": retainOverviewFocusedRow,
  "overview:review": retainOverviewFocusedRow,
  "overview:demand": retainOverviewFocusedRow,
  "coverage:coverageCell": retainCoverageCellFocusedRow,
  "coverage:target": retainCoverageTargetFocusedRow,
  "jobs:job": retainJobsFocusedRow,
  "intake:intake": retainIntakeFocusedRow,
  "review:review": retainReviewFocusedRow,
  "sources:source": retainSourcesFocusedRow,
  "candidates:candidate": retainCandidatesFocusedRow,
  "alerts:alert": retainAlertsFocusedRow,
  "cutover:reconciliationRun": retainCutoverFocusedRow,
};

const retainFocusedListSelection = (
  previous: AffiliateOperationsProjection | null,
  next: AffiliateOperationsProjection,
  view: AffiliateOperationsView,
  selectedType: AffiliateOperationsDetailType | null,
  selectedId: string | null,
): AffiliateOperationsProjection => {
  if (!previous || !selectedId) return next;
  const selection =
    focusedListSelections[`${view}:${String(selectedType)}`];
  return selection ? selection(previous, next, selectedId) : next;
};
type ControlRoomSearchParams = Readonly<{
  get: (key: string) => string | null;
  toString: () => string;
}>;

type ControlRoomQuery = Readonly<{
  view: AffiliateOperationsView;
  selectedType: AffiliateOperationsDetailType | null;
  selectedId: string | null;
  anchor: string | null;
  filters: AffiliateOperationsFilters;
  queryString: string;
}>;

const readQueryFilter = (
  searchParams: ControlRoomSearchParams,
  key: keyof AffiliateOperationsFilters,
): string => {
  const value = searchParams.get(key);
  return value === null ? "" : value;
};
const readControlRoomQuery = (
  searchParams: ControlRoomSearchParams,
): ControlRoomQuery => {
  const requestedView = searchParams.get("view");
  const view = isView(requestedView) ? requestedView : "overview";
  const normalizedParams = new URLSearchParams(searchParams.toString());
  normalizedParams.set("view", view);
  normalizeProjectionSearchParams(normalizedParams);
  const requestedType = searchParams.get("selectedType");
  return {
    view,
    selectedType: isDetailType(requestedType) ? requestedType : null,
    selectedId: searchParams.get("selected"),
    anchor: searchParams.get("anchor"),
    filters: {
      ...emptyFilters,
      market: readQueryFilter(normalizedParams, "market"),
      city: readQueryFilter(normalizedParams, "city"),
      sport: readQueryFilter(normalizedParams, "sport"),
      profile: readQueryFilter(normalizedParams, "profile"),
      range: readQueryFilter(normalizedParams, "range"),
      status: readQueryFilter(normalizedParams, "status"),
      lane: readQueryFilter(normalizedParams, "lane"),
      role: readQueryFilter(normalizedParams, "role"),
      reason: readQueryFilter(normalizedParams, "reason"),
    },
    queryString: normalizedParams.toString(),
  };
};

const selectVisibleProjection = (
  projectionState: AffiliateOperationsProjection | null,
  projectionQuery: string | null,
  queryString: string,
): AffiliateOperationsProjection | null => {
  if (projectionQuery === queryString) return projectionState;
  const sameListQuery =
    projectionQuery !== null &&
    listQueryKey(projectionQuery) === listQueryKey(queryString);
  return sameListQuery && projectionState
    ? { ...projectionState, selected: null }
    : null;
};

const pollingMsByView: Record<AffiliateOperationsView, number | null> = {
  overview: 15_000,
  coverage: 60_000,
  jobs: 15_000,
  intake: null,
  review: null,
  sources: null,
  candidates: null,
  alerts: null,
  cutover: null,
};

const pollingIntervalFor = (
  view: AffiliateOperationsView,
  selectedType: AffiliateOperationsDetailType | null,
): number | null =>
  selectedType === "job" ? 15_000 : pollingMsByView[view];

type ProjectionLoadContext = Readonly<{
  requestSequence: MutableRefObject<number>;
  requestInFlight: MutableRefObject<boolean>;
  requestAbortController: MutableRefObject<AbortController | null>;
  projectionRef: MutableRefObject<AffiliateOperationsProjection | null>;
  projectionCacheRef: MutableRefObject<
    Map<string, AffiliateOperationsProjection>
  >;
  projectionQueryRef: MutableRefObject<string | null>;
  setProjection: Dispatch<
    SetStateAction<AffiliateOperationsProjection | null>
  >;
  setProjectionQuery: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsStale: Dispatch<SetStateAction<boolean>>;
  setHasNewerResults: Dispatch<SetStateAction<boolean>>;
  view: AffiliateOperationsView;
  selectedType: AffiliateOperationsDetailType | null;
  selectedId: string | null;
}>;

const startProjectionRequest = (
  context: ProjectionLoadContext,
): Readonly<{ controller: AbortController; sequence: number }> => {
  context.requestAbortController.current?.abort();
  const controller = new AbortController();
  context.requestAbortController.current = controller;
  context.requestInFlight.current = true;
  const sequence = context.requestSequence.current + 1;
  context.requestSequence.current = sequence;
  return { controller, sequence };
};

const readProjectionCache = (
  context: ProjectionLoadContext,
  query: string,
  background: boolean,
): AffiliateOperationsProjection | null => {
  let cachedProjection =
    context.projectionCacheRef.current.get(query) ?? null;
  if (!cachedProjection && !background) {
    const previousProjection = context.projectionRef.current;
    const previousQuery = context.projectionQueryRef.current;
    if (
      previousProjection &&
      previousQuery !== null &&
      listQueryKey(previousQuery) === listQueryKey(query)
    ) {
      cachedProjection = { ...previousProjection, selected: null };
      setCachedProjection(
        context.projectionCacheRef.current,
        query,
        cachedProjection,
      );
    }
  }
  return cachedProjection;
};

const prepareProjectionLoad = (
  context: ProjectionLoadContext,
  query: string,
  background: boolean,
): AffiliateOperationsProjection | null => {
  const cachedProjection = readProjectionCache(context, query, background);
  if (!background) {
    context.projectionRef.current = cachedProjection;
    context.projectionQueryRef.current = query;
    context.setProjectionQuery(query);
    context.setProjection(cachedProjection);
    context.setHasNewerResults(false);
  }
  return cachedProjection;
};

const buildAppliedProjection = (
  context: ProjectionLoadContext,
  query: string,
  nextProjection: AffiliateOperationsProjection,
  background: boolean,
): AffiliateOperationsProjection => {
  const previousProjection = context.projectionRef.current;
  const previousQuery = context.projectionQueryRef.current;
  const projectionToApply = nextProjection;
  const canRetainFocusedRow =
    background &&
    previousQuery !== null &&
    listQueryKey(previousQuery) === listQueryKey(query);
  return canRetainFocusedRow
    ? retainFocusedListSelection(
        previousProjection,
        projectionToApply,
        context.view,
        context.selectedType,
        context.selectedId,
      )
    : projectionToApply;
};

const applyLoadedProjection = (
  context: ProjectionLoadContext,
  query: string,
  appliedProjection: AffiliateOperationsProjection,
  background: boolean,
): void => {
  const hadFocusedSelection = Boolean(
    context.projectionRef.current &&
      context.selectedType &&
      context.selectedId,
  );
  setCachedProjection(
    context.projectionCacheRef.current,
    query,
    appliedProjection,
  );
  context.projectionRef.current = appliedProjection;
  context.projectionQueryRef.current = query;
  context.setProjectionQuery(query);
  context.setProjection(appliedProjection);
  context.setHasNewerResults(background && hadFocusedSelection);
  context.setIsStale(false);
  context.setError(null);
};


const projectionErrorMessage = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : "Affiliate operations projection is unavailable.";

const applyFailedProjection = (
  context: ProjectionLoadContext,
  query: string,
  cause: unknown,
): void => {
  const lastGoodProjection =
    context.projectionCacheRef.current.get(query) ?? null;
  context.projectionRef.current = lastGoodProjection;
  context.projectionQueryRef.current = query;
  context.setProjectionQuery(query);
  context.setProjection(lastGoodProjection);
  context.setIsStale(true);
  context.setError(projectionErrorMessage(cause));
};

const finishProjectionRequest = (
  context: ProjectionLoadContext,
  controller: AbortController,
  sequence: number,
): void => {
  if (context.requestAbortController.current === controller) {
    context.requestAbortController.current = null;
    context.requestInFlight.current = false;
  }
  if (sequence === context.requestSequence.current) {
    context.setIsLoading(false);
  }
};

const requestProjection = async (
  query: string,
  background: boolean,
  context: ProjectionLoadContext,
): Promise<void> => {
  if (background && context.requestInFlight.current) return;
  const { controller, sequence } = startProjectionRequest(context);
  prepareProjectionLoad(context, query, background);
  context.setIsLoading(true);
  try {
    const nextProjection = await getAffiliateOperationsProjection(
      query,
      controller.signal,
    );
    if (sequence !== context.requestSequence.current) return;
    const appliedProjection = buildAppliedProjection(
      context,
      query,
      nextProjection,
      background,
    );
    applyLoadedProjection(context, query, appliedProjection, background);
  } catch (cause) {
    if (sequence !== context.requestSequence.current) return;
    applyFailedProjection(context, query, cause);
  } finally {
    finishProjectionRequest(context, controller, sequence);
  }
};





type ControlRoomNavigate = (
  changes: Readonly<Record<string, string | null | undefined>>,
  mode?: "push" | "replace",
) => void;

type ProjectionViewProps = Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>;

const projectionViewComponents: Record<
  AffiliateOperationsView,
  ComponentType<ProjectionViewProps>
> = {
  overview: ({ projection }) => <OverviewView projection={projection} />,
  coverage: ({ projection }) => <CoverageView projection={projection} />,
  jobs: ({ projection, onOpen }) => (
    <JobsView projection={projection} onOpen={onOpen} />
  ),
  intake: ({ projection, onOpen }) => (
    <IntakeView projection={projection} onOpen={onOpen} />
  ),
  review: ({ projection, onOpen }) => (
    <ReviewView projection={projection} onOpen={onOpen} />
  ),
  sources: ({ projection, onOpen }) => (
    <SourcesView projection={projection} onOpen={onOpen} />
  ),
  candidates: ({ projection, onOpen }) => (
    <CandidatesView projection={projection} onOpen={onOpen} />
  ),
  alerts: ({ projection, onOpen }) => (
    <AlertsView projection={projection} onOpen={onOpen} />
  ),
  cutover: ({ projection, onOpen }) => (
    <CutoverView projection={projection} onOpen={onOpen} />
  ),
};

const ProjectionMeta = ({
  projection,
}: Readonly<{ projection: AffiliateOperationsProjection | null }>) => (
  <Group gap="xs" mt="sm" wrap="wrap">
    <Text size="xs" c="dimmed">
      As of
    </Text>
    <Text size="xs" ff="monospace">
      {projection?.asOf ? formatDate(projection.asOf) : "Not recorded"}
    </Text>
    <Text size="xs" c="dimmed">
      Schema {projection?.schemaVersion ?? 1}
    </Text>
    <Text size="xs" c="dimmed">
      Contract
    </Text>
    <Text size="xs" ff="monospace">
      {projection?.contract
        ? `${projection.contract.rolloutCohort} / v${projection.contract.contractVersion ?? "Not recorded"}`
        : "Not recorded"}
    </Text>
    <Text size="xs" c="dimmed">
      History
    </Text>
    <Text size="xs" ff="monospace">
      {projection?.historyRevision ?? "Not recorded"}
    </Text>
  </Group>
);

const ControlRoomHeader = ({
  projection,
  isStale,
  hasNewerResults,
  isLoading,
  onRefresh,
}: Readonly<{
  projection: AffiliateOperationsProjection | null;
  isStale: boolean;
  hasNewerResults: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <div>
        <Group gap="xs">
          <Activity size={20} />
          <Title order={3}>Affiliate Operations Control Room</Title>
        </Group>
        <Text size="sm" c="dimmed">
          Read-only projections of supply, evidence, work, and immutable
          operational history.
        </Text>
      </div>
      <Group gap="xs">
        <Badge color={isStale ? "yellow" : "green"}>
          {isStale ? "Stale" : "Live snapshot"}
        </Badge>
        {hasNewerResults ? (
          <Badge color="blue">Newer results available</Badge>
        ) : null}
        <Button
          variant="light"
          leftSection={<RefreshCw size={15} />}
          loading={isLoading}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </Group>
    </Group>
    <ProjectionMeta projection={projection} />
  </Paper>
);

const ProjectionErrorAlert = ({
  error,
  isStale,
  projection,
}: Readonly<{
  error: string | null;
  isStale: boolean;
  projection: AffiliateOperationsProjection | null;
}>) =>
  error ? (
    <Alert
      color="yellow"
      title={
        isStale && projection ? "Stale projection" : "Projection unavailable"
      }
      icon={<AlertTriangle size={16} />}
    >
      {error}
      {projection ? " Last-good data remains visible." : ""}
    </Alert>
  ) : null;

const unsupportedFilterChangesForView = (
  view: AffiliateOperationsView,
): Readonly<Record<string, null>> =>
  Object.fromEntries(
    (Object.keys(emptyFilters) as (keyof AffiliateOperationsFilters)[])
      .filter((key) => !filterKeysByView[view].includes(key))
      .map((key) => [key, null]),
  );

const ControlRoomTabs = ({
  view,
  navigate,
}: Readonly<{
  view: AffiliateOperationsView;
  navigate: ControlRoomNavigate;
}>) => (
  <Tabs
    value={view}
    onChange={(value) => {
      const nextView = isView(value) ? value : "overview";
      navigate({
        ...unsupportedFilterChangesForView(nextView),
        view: nextView,
        page: null,
        targetPage: null,
        campaignPage: null,
        discoveryPage: null,
        selected: null,
        selectedType: null,
      });
    }}
    keepMounted={false}
  >
    <Tabs.List style={{ overflowX: "auto", flexWrap: "nowrap" }}>
      {AFFILIATE_OPERATIONS_VIEWS.map((item) => (
        <Tabs.Tab key={item} value={item}>
          {viewLabels[item]}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  </Tabs>
);

const LoadingProjection = () => (
  <Group justify="center" py="xl">
    <Loader size="sm" />
    <Text size="sm">Loading projection…</Text>
  </Group>
);

const ProjectionView = ({
  view,
  projection,
  onOpen,
}: Readonly<{
  view: AffiliateOperationsView;
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => {
  const ViewComponent = projectionViewComponents[view];
  return <ViewComponent projection={projection} onOpen={onOpen} />;
};

const ControlRoomContent = ({
  view,
  filters,
  projection,
  isLoading,
  error,
  isStale,
  hasNewerResults,
  selectedType,
  selectedId,
  isMobile,
  queryString,
  navigate,
  loadProjection,
  openDetail,
  closeDetail,
}: Readonly<{
  view: AffiliateOperationsView;
  filters: AffiliateOperationsFilters;
  projection: AffiliateOperationsProjection | null;
  isLoading: boolean;
  error: string | null;
  isStale: boolean;
  hasNewerResults: boolean;
  selectedType: AffiliateOperationsDetailType | null;
  selectedId: string | null;
  isMobile: boolean;
  queryString: string;
  navigate: ControlRoomNavigate;
  loadProjection: (query: string, background?: boolean) => Promise<void>;
  openDetail: (type: AffiliateOperationsDetailType, id: string) => void;
  closeDetail: () => void;
}>) => (
  <Stack gap="md">
    <ControlRoomHeader
      projection={projection}
      isStale={isStale}
      hasNewerResults={hasNewerResults}
      isLoading={isLoading}
      onRefresh={() => {
        void loadProjection(queryString);
      }}
    />
    <ProjectionErrorAlert
      error={error}
      isStale={isStale}
      projection={projection}
    />
    <ControlRoomTabs view={view} navigate={navigate} />
    <FilterBar
      view={view}
      filters={filters}
      onApply={(nextFilters) =>
        navigate({
          ...nextFilters,
          page: null,
          targetPage: null,
          campaignPage: null,
          discoveryPage: null,
          selected: null,
          selectedType: null,
        })
      }
    />
    {isLoading && !projection ? <LoadingProjection /> : null}
    {projection ? (
      <ProjectionView
        view={view}
        projection={projection}
        onOpen={openDetail}
      />
    ) : null}
    <DetailDrawer
      detail={projection?.selected ?? null}
      isOpened={Boolean(selectedType && selectedId)}
      isLoading={isLoading && !projection?.selected}
      isMobile={isMobile}
      onClose={closeDetail}
    />
    <Text size="xs" c="dimmed">
      This control room only reads the server projection. Human-directed
      changes use a separate authorized workflow.
    </Text>
  </Stack>
);

export default function AdminAffiliateOperationsControlRoom({
  isActive,
  refreshKey,
}: Readonly<{
  isActive: boolean;
  refreshKey: number;
}>) {
  const searchParams = useSearchParams();
  const navigate = useQueryNavigation();
  const {
    view,
    selectedType,
    selectedId,
    anchor,
    filters,
    queryString,
  } = readControlRoomQuery(searchParams);
  const rawQueryString = searchParams.toString();
  const [projectionState, setProjection] =
    useState<AffiliateOperationsProjection | null>(null);
  const [projectionQuery, setProjectionQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [hasNewerResults, setHasNewerResults] = useState(false);
  const requestSequence = useRef(0);
  const requestInFlight = useRef(false);
  const requestAbortController = useRef<AbortController | null>(null);
  const projectionRef = useRef<AffiliateOperationsProjection | null>(null);
  const projectionCacheRef = useRef(
    new Map<string, AffiliateOperationsProjection>(),
  );
  const projectionQueryRef = useRef<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const projection = selectVisibleProjection(
    projectionState,
    projectionQuery,
    queryString,
  );
  const pollingMs = pollingIntervalFor(view, selectedType);
  const loadProjection = useCallback(
    (query: string, background = false) =>
      requestProjection(query, background, {
        requestSequence,
        requestInFlight,
        requestAbortController,
        projectionRef,
        projectionCacheRef,
        projectionQueryRef,
        setProjection,
        setProjectionQuery,
        setIsLoading,
        setError,
        setIsStale,
        setHasNewerResults,
        view,
        selectedType,
        selectedId,
      }),
    [
      requestAbortController,
      projectionCacheRef,
      requestInFlight,
      requestSequence,
      projectionQueryRef,
      projectionRef,
      selectedId,
      selectedType,
      setError,
      setHasNewerResults,
      setIsLoading,
      setIsStale,
      setProjection,
      setProjectionQuery,
      view,
    ],
  );
  useEffect(() => {
    if (!isActive || rawQueryString === queryString) return undefined;
    navigate({}, "replace");
    return undefined;
  }, [isActive, navigate, queryString, rawQueryString]);

  useEffect(() => {
    if (!isActive) return undefined;
    let interval: number | undefined;
    const startPolling = () => {
      if (document.hidden || pollingMs === null || interval !== undefined)
        return;
      interval = window.setInterval(() => {
        void loadProjection(queryString, true);
      }, pollingMs);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (interval !== undefined) window.clearInterval(interval);
        interval = undefined;
      } else {
        void loadProjection(queryString, true);
        startPolling();
      }
    };
    void loadProjection(queryString);
    document.addEventListener("visibilitychange", onVisibilityChange);
    startPolling();
    return () => {
      requestAbortController.current?.abort();
      requestAbortController.current = null;
      if (interval !== undefined) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isActive, loadProjection, pollingMs, queryString, refreshKey]);
  useEffect(() => {
    if (!isActive || !projection || !anchor) return;
    const target = document.getElementById(anchorElementId(anchor));
    target?.scrollIntoView?.({ block: "nearest" });
  }, [isActive, anchor, projection, view]);

  const openDetail = useCallback(
    (type: AffiliateOperationsDetailType, id: string) => {
      navigate({ selectedType: type, selected: id });
    },
    [navigate],
  );
  const closeDetail = useCallback(
    () => navigate({ selected: null, selectedType: null }),
    [navigate],
  );

  if (!isActive) return null;
  return (
    <ControlRoomContent
      view={view}
      filters={filters}
      projection={projection}
      isLoading={isLoading}
      error={error}
      isStale={isStale}
      hasNewerResults={hasNewerResults}
      selectedType={selectedType}
      selectedId={selectedId}
      isMobile={isMobile}
      queryString={queryString}
      navigate={navigate}
      loadProjection={loadProjection}
      openDetail={openDetail}
      closeDetail={closeDetail}
    />
  );
}
