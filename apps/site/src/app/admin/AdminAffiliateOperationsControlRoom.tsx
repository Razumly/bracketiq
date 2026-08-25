"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Pagination,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  Database,
  Gauge,
  RefreshCw,
  Search,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import {
  AFFILIATE_OPERATIONS_DETAIL_TYPES,
  AFFILIATE_OPERATIONS_VIEWS,
  type AffiliateOperationsDetailType,
  type AffiliateOperationsFilters,
  type AffiliateOperationsProjection,
  type AffiliateOperationsView,
  type CandidateRow,
  type CoverageCellRow,
  type CampaignRow,
  type CoverageTargetRow,
  type DiscoveryOutcomeRow,
  type CoverageMovementRow,
  type DemandHistoryRow,
  type FailureParetoRow,
  type IntakeRow,
  type JobRow,
  type MarginalYieldRow,
  type ProjectionDetail,
  type ProjectionHistoryRow,
  type QueueAgeLane,
  type ReviewRow,
  type SourceRow,
  type SupplyTargetDeficitRow,
  type WipSeriesPoint,
} from "@/types/affiliateOperations";

import { getAffiliateOperationsProjection } from "@/lib/affiliateOperationsService";
const viewLabels: Record<AffiliateOperationsView, string> = {
  overview: "Overview",
  coverage: "Coverage",
  jobs: "Jobs",
  intake: "Source Intake",
  review: "Review Queue",
  sources: "Sources",
  candidates: "Candidates",
};

const emptyFilters: AffiliateOperationsFilters = {
  market: "",
  city: "",
  sport: "",
  profile: "",
  range: "",
  status: "",
  lane: "",
  role: "",
  reason: "",
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

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat().format(value);

const statusColor = (status: string | null | undefined): string => {
  const normalized = String(status ?? "").toUpperCase();
  if (
    normalized.includes("FAIL") ||
    normalized.includes("BLOCK") ||
    normalized.includes("EXCLUD")
  )
    return "red";
  if (
    normalized.includes("WAIT") ||
    normalized.includes("REVIEW") ||
    normalized.includes("HOLD")
  )
    return "yellow";
  if (
    normalized.includes("PUBLISH") ||
    normalized.includes("ACTIVE") ||
    normalized.includes("HEALTHY") ||
    normalized === "MET"
  )
    return "green";
  return "gray";
};

const severityColor = (severity: string): string =>
  severity === "critical" ? "red" : severity === "warning" ? "yellow" : "blue";

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

const formatTimeLabel = (value: string | null | undefined): string => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const anchorElementId = (anchor: string): string =>
  `affiliate-operations-anchor-${encodeURIComponent(anchor)}`;

const historyActor = (row: ProjectionHistoryRow): string =>
  [row.actor, row.workerId, row.executorId].filter(Boolean).join(" / ") ||
  "Not recorded";

const historyEvidence = (row: ProjectionHistoryRow): string => {
  const evidence = [
    row.evidenceRefs?.length ? `Refs: ${row.evidenceRefs.join(", ")}` : null,
    row.inputHash ? `Input hash: ${row.inputHash}` : null,
    row.outputHash ? `Output hash: ${row.outputHash}` : null,
    row.previousState || row.nextState
      ? `State: ${row.previousState ?? "Not recorded"} → ${row.nextState ?? "Not recorded"}`
      : null,
    row.lifecycleGeneration !== null && row.lifecycleGeneration !== undefined
      ? `Lifecycle generation: ${row.lifecycleGeneration}`
      : null,
    row.claimGeneration !== null && row.claimGeneration !== undefined
      ? `Claim generation: ${row.claimGeneration}`
      : null,
    row.contractVersion !== null && row.contractVersion !== undefined
      ? `Contract version: ${row.contractVersion}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return evidence.join(" · ") || "Not recorded";
};

type QueryNavigationMode = "push" | "replace";

const retainHistoricalSeries = (
  previous: AffiliateOperationsProjection | null,
  next: AffiliateOperationsProjection,
  previousQuery: string | null,
  nextQuery: string,
): AffiliateOperationsProjection => {
  if (
    !previous ||
    previous.historyRevision !== next.historyRevision ||
    previousQuery === null ||
    listQueryKey(previousQuery) !== listQueryKey(nextQuery)
  )
    return next;
  return {
    ...next,
    overview: { ...next.overview, wipSeries: previous.overview.wipSeries },
    coverage: {
      ...next.coverage,
      marginalYield: previous.coverage.marginalYield,
      demandHistory: previous.coverage.demandHistory,
    },
    sources: {
      ...next.sources,
      lifecycleMovement: previous.sources.lifecycleMovement,
      freshnessMovement: previous.sources.freshnessMovement,
    },
  };
};
const reorderFocusedRow = <T extends Readonly<{ id: string }>>(
  previousRows: readonly T[],
  nextRows: readonly T[],
  selectedId: string,
): readonly T[] => {
  const previousIndex = previousRows.findIndex((row) => row.id === selectedId);
  if (previousIndex < 0) return nextRows;
  const nextFocusedRow = nextRows.find((row) => row.id === selectedId);
  const focusedRow = nextFocusedRow ?? previousRows[previousIndex];
  const rowsWithoutFocusedRow = nextRows.filter((row) => row.id !== selectedId);
  const insertionIndex = Math.min(previousIndex, rowsWithoutFocusedRow.length);
  return [
    ...rowsWithoutFocusedRow.slice(0, insertionIndex),
    focusedRow,
    ...rowsWithoutFocusedRow.slice(insertionIndex),
  ];
};

const retainFocusedListSelection = (
  previous: AffiliateOperationsProjection | null,
  next: AffiliateOperationsProjection,
  view: AffiliateOperationsView,
  selectedType: AffiliateOperationsDetailType | null,
  selectedId: string | null,
): AffiliateOperationsProjection => {
  if (!previous || !selectedId) return next;
  if (
    view === "overview" &&
    (selectedType === "job" ||
      selectedType === "review" ||
      selectedType === "demand")
  ) {
    return {
      ...next,
      overview: {
        ...next.overview,
        priorityWork: reorderFocusedRow(
          previous.overview.priorityWork,
          next.overview.priorityWork,
          selectedId,
        ),
      },
    };
  }
  if (view === "coverage" && selectedType === "coverageCell") {
    return {
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
    };
  }
  if (view === "coverage" && selectedType === "target") {
    return {
      ...next,
      coverage: {
        ...next.coverage,
        targets: reorderFocusedRow(
          previous.coverage.targets,
          next.coverage.targets,
          selectedId,
        ),
      },
    };
  }
  if (view === "jobs" && selectedType === "job") {
    return {
      ...next,
      jobs: {
        ...next.jobs,
        rows: reorderFocusedRow(previous.jobs.rows, next.jobs.rows, selectedId),
      },
    };
  }
  if (view === "intake" && selectedType === "intake") {
    return {
      ...next,
      intake: {
        ...next.intake,
        rows: reorderFocusedRow(
          previous.intake.rows,
          next.intake.rows,
          selectedId,
        ),
      },
    };
  }
  if (view === "review" && selectedType === "review") {
    return {
      ...next,
      review: {
        ...next.review,
        rows: reorderFocusedRow(
          previous.review.rows,
          next.review.rows,
          selectedId,
        ),
      },
    };
  }
  if (view === "sources" && selectedType === "source") {
    return {
      ...next,
      sources: {
        ...next.sources,
        rows: reorderFocusedRow(
          previous.sources.rows,
          next.sources.rows,
          selectedId,
        ),
      },
    };
  }
  if (view === "candidates" && selectedType === "candidate") {
    return {
      ...next,
      candidates: {
        ...next.candidates,
        rows: reorderFocusedRow(
          previous.candidates.rows,
          next.candidates.rows,
          selectedId,
        ),
      },
    };
  }
  return next;
};

const useQueryNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (
      changes: Readonly<Record<string, string | null | undefined>>,
      mode: QueryNavigationMode = "push",
    ) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", "affiliateOperations");
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "")
          nextParams.delete(key);
        else nextParams.set(key, value);
      });
      const href = `${pathname}?${nextParams.toString()}`;
      if (mode === "replace") {
        if (typeof router.replace === "function")
          router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );
};

const mergeProjectionHref = (
  current: URLSearchParams,
  href: string,
): string => {
  const target = new URL(href, "https://bracket-iq.local");
  const nextParams = new URLSearchParams(current.toString());
  target.searchParams.forEach((value, key) => nextParams.set(key, value));
  if (
    !target.searchParams.has("selected") &&
    !target.searchParams.has("selectedType")
  ) {
    nextParams.delete("selected");
    nextParams.delete("selectedType");
  }
  const query = nextParams.toString();
  return `${target.pathname}${query ? `?${query}` : ""}${target.hash}`;
};

const useProjectionNavigation = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  return useCallback(
    (href: string) => {
      router.push(
        mergeProjectionHref(new URLSearchParams(searchParams.toString()), href),
        { scroll: false },
      );
    },
    [router, searchParams],
  );
};

const ProjectionLink = ({
  href,
  children,
}: Readonly<{
  href: string;
  children: React.ReactNode;
}>) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statefulHref = useMemo(
    () =>
      mergeProjectionHref(new URLSearchParams(searchParams.toString()), href),
    [href, searchParams],
  );
  return (
    <Link
      href={statefulHref}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        router.push(statefulHref, { scroll: false });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
    >
      {children}
    </Link>
  );
};

const InteractiveRow = ({
  label,
  anchor,
  onOpen,
  children,
}: Readonly<{
  label: string;
  anchor?: string;
  onOpen: () => void;
  children: React.ReactNode;
}>) => {
  const navigate = useQueryNavigation();
  const rowAnchor = anchor ?? label;
  return (
    <Table.Tr
      id={anchorElementId(rowAnchor)}
      tabIndex={0}
      aria-label={label}
      onFocus={() => navigate({ anchor: rowAnchor }, "replace")}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      style={{ cursor: "pointer" }}
    >
      {children}
    </Table.Tr>
  );
};

const EmptyState = ({ message }: Readonly<{ message: string }>) => (
  <Paper withBorder p="xl" radius="md">
    <Text c="dimmed" ta="center">
      {message}
    </Text>
  </Paper>
);

const TableFrame = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <Paper
    withBorder
    radius="md"
    style={{ maxHeight: "min(65vh, 720px)", overflow: "auto" }}
  >
    <Table.ScrollContainer minWidth={760} type="native">
      {children}
    </Table.ScrollContainer>
  </Paper>
);

const SortableChartTable = ({
  title,
  summary,
  rows,
  columns,
  visual,
}: Readonly<{
  title: string;
  summary: string;
  rows: readonly Readonly<Record<string, string | number | null>>[];
  columns: readonly Readonly<{
    key: string;
    label: string;
    isNumeric?: boolean;
  }>[];
  visual?: React.ReactNode;
}>) => {
  const searchParams = useSearchParams();
  const navigate = useQueryNavigation();
  const columnKeys = columns.map((column) => column.key).join(",");
  const sortScope = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const requestedSort = searchParams.get("sort");
  const requestedKey = requestedSort?.startsWith(`${sortScope}:`)
    ? requestedSort.slice(sortScope.length + 1)
    : null;
  const requestedDirection =
    searchParams.get("direction") === "asc" ? "asc" : "desc";
  const defaultKey = columns[0]?.key ?? "";
  const sort = {
    key:
      requestedKey && columnKeys.split(",").includes(requestedKey)
        ? requestedKey
        : defaultKey,
    direction:
      requestedKey && columnKeys.split(",").includes(requestedKey)
        ? requestedDirection
        : "desc",
  } as const;
  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const leftValue = left[sort.key];
        const rightValue = right[sort.key];
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        return sort.direction === "asc" ? comparison : -comparison;
      }),
    [rows, sort.direction, sort.key],
  );
  const toggleSort = (key: string) => {
    const direction =
      sort.key === key && sort.direction === "desc" ? "asc" : "desc";
    navigate({ sort: `${sortScope}:${key}`, direction });
  };
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <div>
          <Title order={4}>{title}</Title>
          <Text size="sm" c="dimmed">
            {summary}
          </Text>
        </div>
        {visual ?? null}
        <Text size="sm" fw={600}>
          {visual ? "Sortable table alternative" : "Sortable table"}
        </Text>
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th key={column.key}>
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    rightSection={
                      sort.key === column.key ? (
                        sort.direction === "asc" ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <ArrowUpDown size={13} />
                      )
                    }
                    onClick={() => toggleSort(column.key)}
                    aria-label={`Sort by ${column.label}`}
                  >
                    {column.label}
                  </Button>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedRows.map((row, index) => (
              <Table.Tr
                key={`${String(row[columns[0]?.key ?? "row"])}-${index}`}
              >
                {columns.map((column) => {
                  const value = String(row[column.key] ?? "Not recorded");
                  return (
                    <Table.Td key={column.key}>
                      {column.key === columns[0]?.key &&
                      typeof row.href === "string" ? (
                        <ProjectionLink href={row.href}>{value}</ProjectionLink>
                      ) : (
                        value
                      )}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
};

const stepPlotHeight = 104;
const stepColumnWidth = 30;

type StepSeriesSpec = Readonly<{
  key: string;
  label: string;
  color: string;
  points: readonly (number | null)[];
}>;

type StepGroupSpec = Readonly<{
  key: string;
  label: string;
  series: readonly StepSeriesSpec[];
  xLabels: readonly string[];
}>;

const StepTimelineVisual = ({
  groups,
}: Readonly<{ groups: readonly StepGroupSpec[] }>) => {
  const visibleGroups = groups.filter(
    (group) =>
      group.xLabels.length > 0 &&
      group.series.some((series) =>
        series.points.some((value) => value !== null),
      ),
  );
  if (visibleGroups.length === 0) return null;
  const maxValue = Math.max(
    1,
    ...visibleGroups
      .flatMap((group) => group.series.flatMap((series) => series.points))
      .map((value) => value ?? 0),
  );
  const xLabelCount = Math.max(
    ...visibleGroups.map((group) => group.xLabels.length),
  );
  const plotWidth = Math.max(xLabelCount * stepColumnWidth, 480);
  return (
    <div aria-hidden="true">
      <Stack gap="md">
        {visibleGroups.map((group) => (
          <Stack key={group.key} gap={6}>
            <Group justify="space-between" gap="xs" wrap="wrap">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {group.label}
              </Text>
              <Group gap="sm" wrap="wrap">
                {group.series.map((series) => {
                  const lastValue =
                    [...series.points]
                      .reverse()
                      .find((value) => value !== null) ?? null;
                  return (
                    <Group key={series.key} gap={4} wrap="nowrap">
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: series.color,
                        }}
                      />
                      <Text size="xs">
                        {series.label}
                        {lastValue !== null
                          ? ` ${formatNumber(lastValue)}`
                          : ""}
                      </Text>
                    </Group>
                  );
                })}
              </Group>
            </Group>
            <div style={{ overflowX: "auto", paddingTop: 2 }}>
              <div
                style={{
                  position: "relative",
                  width: plotWidth,
                  height: stepPlotHeight,
                  borderBottom: "1px solid var(--mantine-color-gray-4)",
                  borderLeft: "1px solid var(--mantine-color-gray-4)",
                }}
              >
                {group.series.map((series) => {
                  const steps: React.ReactNode[] = [];
                  series.points.forEach((value, index) => {
                    if (value === null) return;
                    const y =
                      stepPlotHeight -
                      6 -
                      Math.round((value / maxValue) * (stepPlotHeight - 14));
                    const left = index * stepColumnWidth;
                    const previous =
                      index > 0 ? series.points[index - 1] : null;
                    if (previous !== null) {
                      const previousY =
                        stepPlotHeight -
                        6 -
                        Math.round(
                          (previous / maxValue) * (stepPlotHeight - 14),
                        );
                      steps.push(
                        <span
                          key={`${series.key}-connector-${index}`}
                          style={{
                            position: "absolute",
                            left: left - 1,
                            top: Math.min(previousY, y),
                            width: 2,
                            height: Math.max(1, Math.abs(previousY - y)),
                            background: series.color,
                          }}
                        />,
                      );
                    }
                    steps.push(
                      <span
                        key={`${series.key}-step-${index}`}
                        style={{
                          position: "absolute",
                          left,
                          top: y,
                          width: stepColumnWidth,
                          height: 2,
                          background: series.color,
                          borderRadius: 1,
                        }}
                      />,
                    );
                  });
                  return steps;
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: plotWidth,
                }}
              >
                <Text size="xs" c="dimmed">
                  {group.xLabels[0] ?? ""}
                </Text>
                {group.xLabels.length > 2 ? (
                  <Text size="xs" c="dimmed">
                    {group.xLabels[
                      Math.floor((group.xLabels.length - 1) / 2)
                    ] ?? ""}
                  </Text>
                ) : null}
                {group.xLabels.length > 1 ? (
                  <Text size="xs" c="dimmed">
                    {group.xLabels[group.xLabels.length - 1] ?? ""}
                  </Text>
                ) : null}
              </div>
            </div>
          </Stack>
        ))}
      </Stack>
    </div>
  );
};

const ageBandColors = [
  "var(--mantine-color-gray-7)",
  "var(--mantine-color-blue-7)",
  "var(--mantine-color-teal-7)",
  "var(--mantine-color-yellow-7)",
  "var(--mantine-color-orange-8)",
  "var(--mantine-color-red-7)",
];

const StackedAgeBandVisual = ({
  lanes,
}: Readonly<{ lanes: readonly QueueAgeLane[] }>) => {
  if (lanes.length === 0) return null;
  const bandLegend: { band: string; description: string; color: string }[] = [];
  lanes.forEach((lane) =>
    lane.bands.forEach((band) => {
      if (!bandLegend.some((entry) => entry.band === band.band)) {
        bandLegend.push({
          band: band.band,
          description: band.description,
          color: ageBandColors[bandLegend.length % ageBandColors.length],
        });
      }
    }),
  );
  const colorFor = (band: string): string =>
    bandLegend.find((entry) => entry.band === band)?.color ?? ageBandColors[0];
  return (
    <div aria-hidden="true">
      <Stack gap={8}>
        {lanes.map((lane) => {
          const total = lane.bands.reduce((sum, band) => sum + band.count, 0);
          return (
            <Stack key={lane.lane} gap={2}>
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" fw={700}>
                  {lane.lane}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatNumber(total)} jobs
                </Text>
              </Group>
              <div
                style={{
                  display: "flex",
                  height: 20,
                  borderRadius: 3,
                  overflow: "hidden",
                  border: "1px solid var(--mantine-color-gray-3)",
                }}
              >
                {lane.bands.map((band) => (
                  <div
                    key={band.band}
                    style={{
                      width:
                        total === 0 ? "0%" : `${(band.count / total) * 100}%`,
                      minWidth: 0,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingInline: 2,
                      background: colorFor(band.band),
                    }}
                  >
                    {band.count > 0 ? (
                      <Text size="xs" c="white" fw={700} truncate>
                        {band.count}
                      </Text>
                    ) : null}
                  </div>
                ))}
              </div>
            </Stack>
          );
        })}
        <Group gap="sm" wrap="wrap">
          {bandLegend.map((band) => (
            <Group key={band.band} gap={4} wrap="nowrap">
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: band.color,
                }}
              />
              <Text size="xs">
                {band.band}: {band.description}
              </Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </div>
  );
};

const divergingPlotHeight = 128;
const divergingColumnWidth = 24;

const DivergingMovementVisual = ({
  rows,
}: Readonly<{ rows: readonly CoverageMovementRow[] }>) => {
  const ordered = [...rows].sort((left, right) =>
    String(left.at ?? "").localeCompare(String(right.at ?? "")),
  );
  if (ordered.length === 0) return null;
  const maxCount = Math.max(1, ...ordered.map((row) => row.count));
  const halfHeight = divergingPlotHeight / 2;
  const plotWidth = Math.max(ordered.length * divergingColumnWidth, 320);
  return (
    <div aria-hidden="true">
      <Group gap="sm" wrap="wrap">
        <Group gap={4} wrap="nowrap">
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "var(--mantine-color-green-6)",
            }}
          />
          <Text size="xs">Forward — above the line</Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "var(--mantine-color-red-6)",
            }}
          />
          <Text size="xs">Regressive — below the line</Text>
        </Group>
      </Group>
      <div style={{ overflowX: "auto", paddingTop: 2 }}>
        <div
          style={{
            position: "relative",
            width: plotWidth,
            height: divergingPlotHeight,
            borderBottom: "1px solid var(--mantine-color-gray-4)",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: halfHeight - 1,
              height: 2,
              background: "var(--mantine-color-gray-5)",
            }}
          />
          {ordered.map((row, index) => {
            const isForward = row.direction !== "regressive";
            const barHeight = Math.max(
              3,
              Math.round((row.count / maxCount) * (halfHeight - 10)),
            );
            const barWidth = Math.max(3, divergingColumnWidth - 8);
            const left = index * divergingColumnWidth;
            return (
              <span
                key={`${row.id}-${index}`}
                title={`${formatDate(row.at)} — ${row.label}: ${row.direction} ${formatNumber(row.count)}`}
                style={
                  isForward
                    ? {
                        position: "absolute",
                        left,
                        bottom: halfHeight + 2,
                        width: barWidth,
                        height: barHeight,
                        background: "var(--mantine-color-green-6)",
                        borderRadius: 2,
                      }
                    : {
                        position: "absolute",
                        left,
                        top: halfHeight + 2,
                        width: barWidth,
                        height: barHeight,
                        background: "var(--mantine-color-red-6)",
                        borderRadius: 2,
                      }
                }
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: plotWidth,
          }}
        >
          <Text size="xs" c="dimmed">
            {formatDate(ordered[0]?.at)}
          </Text>
          {ordered.length > 2 ? (
            <Text size="xs" c="dimmed">
              {formatDate(ordered[Math.floor((ordered.length - 1) / 2)]?.at)}
            </Text>
          ) : null}
          {ordered.length > 1 ? (
            <Text size="xs" c="dimmed">
              {formatDate(ordered[ordered.length - 1]?.at)}
            </Text>
          ) : null}
        </div>
      </div>
    </div>
  );
};
type HorizontalBarSpec = Readonly<{
  label: string;
  value: number;
  color: string;
}>;

const HorizontalBarsVisual = ({
  rows,
  ariaLabel,
}: Readonly<{
  rows: readonly HorizontalBarSpec[];
  ariaLabel: string;
}>) => {
  if (rows.length === 0) return null;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Stack gap={6} role="img" aria-label={ariaLabel}>
      {rows.map((row) => (
        <Stack key={row.label} gap={2}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" truncate>
              {row.label}
            </Text>
            <Text size="xs" fw={700}>
              {formatNumber(row.value)}
            </Text>
          </Group>
          <div
            style={{
              height: 10,
              background: "var(--mantine-color-gray-2)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(row.value / maxValue) * 100}%`,
                height: "100%",
                background: row.color,
                borderRadius: 3,
              }}
            />
          </div>
        </Stack>
      ))}
    </Stack>
  );
};

const MetricCard = ({
  label,
  value,
  detail,
  icon,
}: Readonly<{
  label: string;
  value: number | string;
  detail: string;
  icon: React.ReactNode;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <div>
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          {label}
        </Text>
        <Text size="xl" fw={800}>
          {typeof value === "number" ? formatNumber(value) : value}
        </Text>
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      </div>
      <Badge variant="light" size="lg" leftSection={icon}>
        {label.slice(0, 1)}
      </Badge>
    </Group>
  </Paper>
);

const Pager = ({
  page,
  pageSize,
  total,
  queryKey = "page",
}: Readonly<{
  page: number;
  pageSize: number;
  total: number;
  queryKey?:
    | "page"
    | "targetPage"
    | "campaignPage"
    | "discoveryPage"
    | "historyPage";
}>) => {
  const navigate = useQueryNavigation();
  return (
    <Group justify="space-between" align="center">
      <Text size="sm" c="dimmed">
        {formatNumber(total)} records. Page size {pageSize}.
      </Text>
      <Pagination
        total={Math.max(1, Math.ceil(total / pageSize))}
        value={page}
        onChange={(nextPage) =>
          navigate({ [queryKey]: nextPage > 1 ? String(nextPage) : null })
        }
        withEdges
        getControlProps={(control) => ({
          "aria-label": `${control[0].toUpperCase()}${control.slice(1)} page`,
        })}
      />
    </Group>
  );
};

const FilterBar = ({
  view,
  filters,
  onApply,
}: Readonly<{
  view: AffiliateOperationsView;
  filters: AffiliateOperationsFilters;
  onApply: (filters: AffiliateOperationsFilters) => void;
}>) => {
  const filterSignature = JSON.stringify(filters);
  const [draftState, setDraftState] = useState<{
    signature: string;
    value: AffiliateOperationsFilters;
  }>({
    signature: filterSignature,
    value: filters,
  });
  const draft =
    draftState.signature === filterSignature ? draftState.value : filters;
  const setFilter = (
    key: keyof AffiliateOperationsFilters,
    value: string | null,
  ) => {
    setDraftState({
      signature: filterSignature,
      value: { ...draft, [key]: value ?? "" },
    });
  };
  const filterKeys: Array<keyof AffiliateOperationsFilters> =
    view === "coverage"
      ? ["market", "city", "sport", "profile", "range", "status"]
      : view === "jobs"
        ? ["range", "status", "lane", "role", "reason"]
        : view === "intake"
          ? ["city", "profile", "range", "status", "reason"]
          : view === "review"
            ? ["city", "range", "status", "role", "reason"]
            : view === "sources"
              ? ["city", "profile", "range", "status", "reason"]
              : view === "candidates"
                ? ["city", "sport", "profile", "range", "status"]
                : ["range", "status", "market", "sport", "profile"];
  return (
    <Paper withBorder radius="md" p="sm">
      <Group align="flex-end" wrap="wrap">
        {filterKeys.map((key) => (
          <TextInput
            key={key}
            label={key[0].toUpperCase() + key.slice(1)}
            placeholder={`Filter ${key}`}
            value={draft[key]}
            onChange={(event) => setFilter(key, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onApply(draft);
            }}
            size="sm"
            leftSection={<Search size={14} />}
          />
        ))}
        <Button variant="light" onClick={() => onApply(draft)}>
          Apply filters
        </Button>
        <Button variant="subtle" onClick={() => onApply(emptyFilters)}>
          Clear
        </Button>
      </Group>
    </Paper>
  );
};

const WipChart = ({
  points,
}: Readonly<{ points: readonly WipSeriesPoint[] }>) => {
  const rows = points.map((point) => ({
    lane: point.lane,
    hour: formatDate(point.at),
    activeWorkers: point.activeWorkers,
    waitingJobs: point.waitingJobs,
    workerLimit: point.workerLimit,
    replenishmentWaves: point.replenishmentWaves,
  }));
  const groups: StepGroupSpec[] = (["MAPPING", "REVIEW"] as const).flatMap(
    (lane) => {
      const lanePoints = points.filter((point) => point.lane === lane);
      if (lanePoints.length === 0) return [];
      return [
        {
          key: lane,
          label: lane === "MAPPING" ? "Mapping lane" : "Review lane",
          series: [
            {
              key: "activeWorkers",
              label: "Active workers",
              color: "var(--mantine-color-blue-6)",
              points: lanePoints.map((point) => point.activeWorkers),
            },
            {
              key: "waitingJobs",
              label: "Waiting jobs",
              color: "var(--mantine-color-orange-6)",
              points: lanePoints.map((point) => point.waitingJobs),
            },
            {
              key: "workerLimit",
              label: "Worker limit",
              color: "var(--mantine-color-gray-6)",
              points: lanePoints.map((point) => point.workerLimit),
            },
            {
              key: "replenishmentWaves",
              label: "Replenishment waves",
              color: "var(--mantine-color-teal-6)",
              points: lanePoints.map((point) => point.replenishmentWaves),
            },
          ],
          xLabels: lanePoints.map((point) => formatTimeLabel(point.at)),
        },
      ];
    },
  );
  return (
    <SortableChartTable
      title="Mapping and Review WIP versus limits"
      summary="Twenty-four hourly points. Active workers, waiting jobs, independent limits, and replenishment-wave annotations are direct values."
      rows={rows}
      columns={[
        { key: "lane", label: "Lane" },
        { key: "hour", label: "Time" },
        { key: "activeWorkers", label: "Active workers", isNumeric: true },
        { key: "waitingJobs", label: "Waiting jobs", isNumeric: true },
        { key: "workerLimit", label: "Limits", isNumeric: true },
        { key: "replenishmentWaves", label: "Wave starts", isNumeric: true },
      ]}
      visual={<StepTimelineVisual groups={groups} />}
    />
  );
};

const OverviewView = ({
  projection,
}: Readonly<{ projection: AffiliateOperationsProjection }>) => {
  const navigateProjection = useProjectionNavigation();
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 9 }}>
        <MetricCard
          label="Supply Sources"
          value={projection.overview.counts.supplySources}
          detail="Current lifecycle roots"
          icon={<Database size={16} />}
        />
        <MetricCard
          label="Open demand"
          value={projection.overview.counts.openDemands}
          detail="Target deficits"
          icon={<Gauge size={16} />}
        />
        <MetricCard
          label="Target deficit"
          value={projection.overview.counts.totalTargetDeficit ?? 0}
          detail="Fresh supply units"
          icon={<Gauge size={16} />}
        />
        <MetricCard
          label="Active jobs"
          value={projection.overview.counts.activeJobs}
          detail="Operational work"
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="Waiting jobs"
          value={projection.overview.counts.waitingJobs}
          detail="Queue state"
          icon={<Clock3 size={16} />}
        />
        <MetricCard
          label="Backpressure"
          value={projection.overview.counts.backpressureJobs ?? 0}
          detail="Blocking work"
          icon={<Waypoints size={16} />}
        />
        <MetricCard
          label="Healthy workers"
          value={projection.overview.counts.activeWorkers}
          detail="Current heartbeat"
          icon={<ShieldAlert size={16} />}
        />
        <MetricCard
          label="Stopped workers"
          value={projection.overview.counts.stoppedWorkers ?? 0}
          detail="Expired or unhealthy"
          icon={<AlertTriangle size={16} />}
        />
        <MetricCard
          label="Starved cells"
          value={projection.overview.counts.starvationCells ?? 0}
          detail="Waiting for unresolved leads"
          icon={<AlertTriangle size={16} />}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder radius="md" p="md">
          <Title order={4}>Supply Target deficit</Title>
          <Text size="sm" c="dimmed" mb="sm">
            One row per Market, Sport, and source profile. Sort order uses
            accepted priority, then largest deficit.
          </Text>
          {projection.overview.targetDeficits.length === 0 ? (
            <EmptyState message="No Supply Target evidence is recorded." />
          ) : (
            <TableFrame>
              <Table stickyHeader striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Target</Table.Th>
                    <Table.Th>Current</Table.Th>
                    <Table.Th>Target</Table.Th>
                    <Table.Th>Deficit</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {projection.overview.targetDeficits.map(
                    (row: SupplyTargetDeficitRow) => (
                      <InteractiveRow
                        key={row.id}
                        anchor={row.id}
                        label={`Open target ${row.id}`}
                        onOpen={() => navigateProjection(row.href)}
                      >
                        <Table.Td>
                          <ProjectionLink href={row.href}>
                            <Text fw={600}>
                              {[row.marketKey, row.sportId, row.sourceProfile]
                                .filter(Boolean)
                                .join(" / ") || "Unclassified"}
                            </Text>
                          </ProjectionLink>
                          <Text size="xs" c="dimmed">
                            Priority {row.priority}
                          </Text>
                        </Table.Td>
                        <Table.Td>{row.current}</Table.Td>
                        <Table.Td>{row.target}</Table.Td>
                        <Table.Td fw={700}>{row.deficit}</Table.Td>
                        <Table.Td>
                          <Badge color={statusColor(row.status)}>
                            {row.status}
                          </Badge>
                        </Table.Td>
                      </InteractiveRow>
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </TableFrame>
          )}
        </Paper>
        <WipChart points={projection.overview.wipSeries} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder radius="md" p="md">
          <Title order={4}>Current lifecycle counts</Title>
          <Text size="sm" c="dimmed" mb="sm">
            Counts come from Supply Sources, not completed jobs.
          </Text>
          <Table withTableBorder striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Stage</Table.Th>
                <Table.Th>Count</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projection.overview.lifecycleCounts.map((row) => (
                <Table.Tr key={row.stage}>
                  <Table.Td>
                    <ProjectionLink href={row.href}>
                      <Badge color={statusColor(row.stage)}>{row.stage}</Badge>
                    </ProjectionLink>
                  </Table.Td>
                  <Table.Td>{row.count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
        <Paper withBorder radius="md" p="md">
          <Title order={4}>Exception rail</Title>
          <Text size="sm" c="dimmed" mb="sm">
            Viewing does not acknowledge or suppress an exception.
          </Text>
          {projection.overview.exceptions.length === 0 ? (
            <EmptyState message="No operational exceptions are recorded." />
          ) : (
            <Stack gap="xs">
              {projection.overview.exceptions.slice(0, 12).map((exception) => (
                <ProjectionLink key={exception.id} href={exception.href}>
                  <Paper withBorder p="sm" radius="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text
                          fw={700}
                          c={
                            exception.severity === "critical"
                              ? "red"
                              : undefined
                          }
                        >
                          {exception.title}
                        </Text>
                        <Text size="sm">{exception.detail}</Text>
                        <Text size="xs" c="dimmed">
                          {formatDate(exception.at)}
                        </Text>
                      </div>
                      <Badge color={severityColor(exception.severity)}>
                        {exception.severity}
                      </Badge>
                    </Group>
                  </Paper>
                </ProjectionLink>
              ))}
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Priority Work</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Bounded work ordered by downstream need. The list is descriptive, not
          a queue control.
        </Text>
        {projection.overview.priorityWork.length === 0 ? (
          <EmptyState message="No priority work is recorded." />
        ) : (
          <TableFrame>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Work</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Age</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projection.overview.priorityWork.map((row) => (
                  <InteractiveRow
                    key={`${row.kind}:${row.id}`}
                    anchor={row.id}
                    label={`Open ${row.title}`}
                    onOpen={() => navigateProjection(row.href)}
                  >
                    <Table.Td>{row.priority}</Table.Td>
                    <Table.Td>
                      <ProjectionLink href={row.href}>
                        {row.title}
                      </ProjectionLink>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(row.status)}>
                        {row.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.ageMinutes}m</Table.Td>
                  </InteractiveRow>
                ))}
              </Table.Tbody>
            </Table>
          </TableFrame>
        )}
      </Paper>
    </Stack>
  );
};

const CoverageView = ({
  projection,
}: Readonly<{ projection: AffiliateOperationsProjection }>) => {
  const navigateProjection = useProjectionNavigation();
  const marginalRows = projection.coverage.marginalYield.map(
    (row: MarginalYieldRow) => ({
      cycle: row.cycle,
      at: formatDate(row.at),
      qualified: row.qualifiedSources,
      failed: row.failedQueries,
      unresolved: row.unresolvedLeads,
      strategies: row.strategyFamilies,
      href: row.href,
    }),
  );
  const marginalVisualRows: HorizontalBarSpec[] =
    projection.coverage.marginalYield.flatMap((row) => [
      {
        label: `${row.cycle} — qualified`,
        value: row.qualifiedSources,
        color: "var(--mantine-color-blue-6)",
      },
      {
        label: `${row.cycle} — failed`,
        value: row.failedQueries,
        color: "var(--mantine-color-red-6)",
      },
      {
        label: `${row.cycle} — unresolved`,
        value: row.unresolvedLeads,
        color: "var(--mantine-color-orange-6)",
      },
    ]);
  const demandRows = projection.coverage.demandHistory.map(
    (row: DemandHistoryRow) => ({
      at: formatDate(row.at),
      open: row.openDemand,
      campaigns: row.campaignStarts,
      mapping: row.mappingJobsProduced,
      restored: row.targetRestorations,
      href: row.href,
    }),
  );
  const demandSteps: StepGroupSpec[] = (() => {
    const ordered = [...projection.coverage.demandHistory].sort((left, right) =>
      String(left.at ?? "").localeCompare(String(right.at ?? "")),
    );
    if (ordered.length === 0) return [];
    return [
      {
        key: "replenishment-demand",
        label: "Replenishment Demand",
        series: [
          {
            key: "open",
            label: "Open demand",
            color: "var(--mantine-color-blue-6)",
            points: ordered.map((row) => row.openDemand),
          },
          {
            key: "campaigns",
            label: "Campaign starts",
            color: "var(--mantine-color-orange-6)",
            points: ordered.map((row) => row.campaignStarts),
          },
          {
            key: "mapping",
            label: "Mapping jobs produced",
            color: "var(--mantine-color-teal-6)",
            points: ordered.map((row) => row.mappingJobsProduced),
          },
          {
            key: "restored",
            label: "Target restorations",
            color: "var(--mantine-color-green-6)",
            points: ordered.map((row) => row.targetRestorations),
          },
        ],
        xLabels: ordered.map((row) => formatDate(row.at)),
      },
    ];
  })();
  const discoveryRows = projection.coverage.discoveryOutcomes.map(
    (row: DiscoveryOutcomeRow) => ({
      at: formatDate(row.at),
      query: row.query,
      provider: row.provider,
      status: row.status,
      returned: row.returnedResults,
      qualified: row.qualifiedSources,
      intakes: row.intakesCreated,
      failed: row.failed,
      href: row.href,
    }),
  );
  const campaignRows = projection.coverage.campaigns.map(
    (row: CampaignRow) => ({
      name: row.name,
      region: row.region,
      status: row.status,
      lastRun: formatDate(row.lastRunAt),
      nextRun: formatDate(row.nextRunAt),
      queries: row.queryLimit,
      results: row.resultLimit,
      href: row.href,
    }),
  );
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <MetricCard
          label="Saturated cells"
          value={projection.coverage.saturation.saturated}
          detail="Earliest eligibility reached"
          icon={<Gauge size={16} />}
        />
        <MetricCard
          label="Eligible cells"
          value={projection.coverage.saturation.eligible}
          detail="Coverage inventory"
          icon={<Waypoints size={16} />}
        />
        <MetricCard
          label="Unresolved leads"
          value={projection.coverage.saturation.unresolved}
          detail="Needs evidence"
          icon={<AlertTriangle size={16} />}
        />
      </SimpleGrid>
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Coverage Cells</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Coverage does not imply mapped, approved, activated, or published
          Supply.
        </Text>
        {projection.coverage.cells.rows.length === 0 ? (
          <EmptyState message="No Coverage Cells match the filters." />
        ) : (
          <TableFrame>
            <Table stickyHeader striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cell</Table.Th>
                  <Table.Th>Coverage</Table.Th>
                  <Table.Th>Search</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Sources</Table.Th>
                  <Table.Th>Leads</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projection.coverage.cells.rows.map((row: CoverageCellRow) => (
                  <InteractiveRow
                    key={row.id}
                    label={`Open coverage cell ${row.id}`}
                    onOpen={() => navigateProjection(row.href)}
                  >
                    <Table.Td>
                      <ProjectionLink href={row.href}>
                        <Text fw={600}>
                          {row.city} / {row.sport}
                        </Text>
                      </ProjectionLink>
                      <Text size="xs" c="dimmed">
                        {row.marketKey} / {row.profile}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(row.coverageStatus)}>
                        {row.coverageStatus}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.searchStatus}</Table.Td>
                    <Table.Td>{row.priorityScore}</Table.Td>
                    <Table.Td>{row.approvedSourceCount}</Table.Td>
                    <Table.Td>{row.unresolvedLeadCount}</Table.Td>
                  </InteractiveRow>
                ))}
              </Table.Tbody>
            </Table>
          </TableFrame>
        )}
        <Pager
          page={projection.coverage.cells.page}
          pageSize={projection.coverage.cells.pageSize}
          total={projection.coverage.cells.total}
          queryKey="page"
        />
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Supply Targets</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Target identity, public-target state, freshness, and candidate lineage
          are read from the same projection snapshot.
        </Text>
        {projection.coverage.targets.length === 0 ? (
          <EmptyState message="No Supply Targets match the filters." />
        ) : (
          <TableFrame>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Target</Table.Th>
                  <Table.Th>Market / Sport</Table.Th>
                  <Table.Th>Profile</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Freshness</Table.Th>
                  <Table.Th>Lineage</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projection.coverage.targets.map((row: CoverageTargetRow) => (
                  <InteractiveRow
                    key={row.id}
                    label={`Open target ${row.id}`}
                    onOpen={() => navigateProjection(row.href)}
                  >
                    <Table.Td>
                      <ProjectionLink href={row.href}>
                        {row.targetId ?? row.targetType}
                      </ProjectionLink>
                    </Table.Td>
                    <Table.Td>
                      {row.marketKey ?? "Not recorded"} /{" "}
                      {row.sportId ?? "Not recorded"}
                    </Table.Td>
                    <Table.Td>{row.sourceProfile}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(row.status)}>
                        {row.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatDate(row.freshnessExpiresAt)}</Table.Td>
                    <Table.Td>{row.candidateId ?? "Not recorded"}</Table.Td>
                  </InteractiveRow>
                ))}
              </Table.Tbody>
            </Table>
          </TableFrame>
        )}
        <Pager
          page={projection.coverage.targetPage}
          pageSize={projection.coverage.targetPageSize}
          total={projection.coverage.targetTotal}
          queryKey="targetPage"
        />
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <SortableChartTable
          title="Marginal Yield by assessment cycle"
          summary="Newly qualified direct sources, failed-query markers, unresolved leads, and strategy-family annotations."
          rows={marginalRows}
          columns={[
            { key: "cycle", label: "Cycle" },
            { key: "qualified", label: "Qualified", isNumeric: true },
            { key: "failed", label: "Failed queries", isNumeric: true },
            { key: "unresolved", label: "Unresolved", isNumeric: true },
            { key: "strategies", label: "Strategy families" },
          ]}
          visual={
            <HorizontalBarsVisual
              rows={marginalVisualRows}
              ariaLabel="Marginal Yield by assessment cycle"
            />
          }
        />
        <SortableChartTable
          title="Replenishment Demand history"
          summary="Open demand, campaign starts, Mapping Jobs produced, and target restorations."
          rows={demandRows}
          columns={[
            { key: "at", label: "Time" },
            { key: "open", label: "Open demand", isNumeric: true },
            { key: "campaigns", label: "Campaign starts", isNumeric: true },
            { key: "mapping", label: "Mapping Jobs", isNumeric: true },
            { key: "restored", label: "Restorations", isNumeric: true },
          ]}
          visual={<StepTimelineVisual groups={demandSteps} />}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Stack gap="xs">
          <SortableChartTable
            title="Discovery and capture outcomes"
            summary="Provider results, qualified direct sources, created intakes, and recorded failures by query execution."
            rows={discoveryRows}
            columns={[
              { key: "query", label: "Query" },
              { key: "at", label: "Time" },
              { key: "provider", label: "Provider" },
              { key: "status", label: "Status" },
              { key: "returned", label: "Results", isNumeric: true },
              { key: "qualified", label: "Qualified", isNumeric: true },
              { key: "intakes", label: "Intakes", isNumeric: true },
              { key: "failed", label: "Failed", isNumeric: true },
            ]}
          />
          <Pager
            page={projection.coverage.discoveryPage}
            pageSize={projection.coverage.discoveryPageSize}
            total={projection.coverage.discoveryTotal}
            queryKey="discoveryPage"
          />
        </Stack>
        <Stack gap="xs">
          <SortableChartTable
            title="Discovery campaigns"
            summary="Campaign status, schedule, query limits, and result limits from the server projection."
            rows={campaignRows}
            columns={[
              { key: "name", label: "Campaign" },
              { key: "region", label: "Region" },
              { key: "status", label: "Status" },
              { key: "lastRun", label: "Last run" },
              { key: "nextRun", label: "Next run" },
              { key: "queries", label: "Queries", isNumeric: true },
              { key: "results", label: "Results", isNumeric: true },
            ]}
          />
          <Pager
            page={projection.coverage.campaignPage}
            pageSize={projection.coverage.campaignPageSize}
            total={projection.coverage.campaignTotal}
            queryKey="campaignPage"
          />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
};

const JobsView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => {
  const ageByLaneRows = projection.jobs.ageByLane.flatMap((lane) =>
    lane.bands.map((band) => ({
      lane: lane.lane,
      band: band.band,
      count: band.count,
      description: band.description,
    })),
  );
  const failureVisualRows: HorizontalBarSpec[] = [...projection.jobs.failures]
    .sort(
      (left, right) =>
        right.count - left.count || left.reason.localeCompare(right.reason),
    )
    .map((row) => ({
      label: `${row.reason} — ${row.refreshClass}`,
      value: row.count,
      color: "var(--mantine-color-orange-6)",
    }));
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <SortableChartTable
          title="Queue age by lane"
          summary="Descriptive age bands for queued or active work by lane. These values are not health claims."
          rows={ageByLaneRows}
          columns={[
            { key: "lane", label: "Lane" },
            { key: "band", label: "Age band" },
            { key: "count", label: "Jobs", isNumeric: true },
            { key: "description", label: "Meaning" },
          ]}
          visual={<StackedAgeBandVisual lanes={projection.jobs.ageByLane} />}
        />
        <SortableChartTable
          title="Failure and rework Pareto"
          summary="Matching jobs grouped by refresh class and recorded reason."
          rows={projection.jobs.failures.map((row: FailureParetoRow) => ({
            reason: row.reason,
            count: row.count,
            refreshClass: row.refreshClass,
          }))}
          columns={[
            { key: "reason", label: "Reason" },
            { key: "count", label: "Count", isNumeric: true },
            { key: "refreshClass", label: "Refresh class" },
          ]}
          visual={
            <HorizontalBarsVisual
              rows={failureVisualRows}
              ariaLabel="Failure and rework Pareto bars"
            />
          }
        />
      </SimpleGrid>
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Worker health</Title>
        <TableFrame>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Worker</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Heartbeat</Table.Th>
                <Table.Th>Lease</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projection.jobs.workers.map((worker) => (
                <InteractiveRow
                  key={worker.id}
                  label={`Open worker ${worker.workerId}`}
                  onOpen={() => onOpen("worker", worker.id)}
                >
                  <Table.Td>{worker.workerId}</Table.Td>
                  <Table.Td>{worker.role}</Table.Td>
                  <Table.Td>
                    <Badge color={worker.isHealthy ? "green" : "red"}>
                      {worker.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatDate(worker.heartbeatAt)}</Table.Td>
                  <Table.Td>{formatDate(worker.leaseExpiresAt)}</Table.Td>
                </InteractiveRow>
              ))}
            </Table.Tbody>
          </Table>
        </TableFrame>
      </Paper>
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Unified jobs and invocations</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Queue, invocation, provider, transition, retry, worker, failure, and
          lineage fields come from one projection snapshot.
        </Text>
        {projection.jobs.rows.length === 0 ? (
          <EmptyState message="No jobs match the filters." />
        ) : (
          <TableFrame>
            <Table stickyHeader striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Kind</Table.Th>
                  <Table.Th>Queue / lane</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Invocation</Table.Th>
                  <Table.Th>Transition</Table.Th>
                  <Table.Th>Age</Table.Th>
                  <Table.Th>Retries</Table.Th>
                  <Table.Th>Worker</Table.Th>
                  <Table.Th>Failure</Table.Th>
                  <Table.Th>Lineage</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projection.jobs.rows.map((row: JobRow) => (
                  <InteractiveRow
                    key={`${row.kind}:${row.id}`}
                    label={`Open job ${row.id}`}
                    onOpen={() => onOpen("job", row.id)}
                  >
                    <Table.Td>
                      <ProjectionLink href={row.href}>
                        <Badge variant="light">{row.kind}</Badge>
                      </ProjectionLink>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{row.queue}</Text>
                      <Text size="xs" c="dimmed">
                        {row.lane}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(row.status)}>
                        {row.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.provider ?? "Not recorded"}</Table.Td>
                    <Table.Td>{row.invocation ?? "Not recorded"}</Table.Td>
                    <Table.Td>{row.transition ?? "Not recorded"}</Table.Td>
                    <Table.Td>{row.ageMinutes}m</Table.Td>
                    <Table.Td>{row.retries}</Table.Td>
                    <Table.Td>{row.workerId ?? "Not recorded"}</Table.Td>
                    <Table.Td>{row.failure ?? "Not recorded"}</Table.Td>
                    <Table.Td>{row.lineage ?? "Not recorded"}</Table.Td>
                  </InteractiveRow>
                ))}
              </Table.Tbody>
            </Table>
          </TableFrame>
        )}
        <Pager
          page={projection.jobs.page}
          pageSize={projection.jobs.pageSize}
          total={projection.jobs.total}
        />
      </Paper>
    </Stack>
  );
};

const IntakeView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Title order={4}>Source Intake evidence</Title>
    <Text size="sm" c="dimmed" mb="sm">
      Intake, page, capture, artifact, policy, and Mapping handoff evidence. No
      intake action is available here.
    </Text>
    {projection.intake.rows.length === 0 ? (
      <EmptyState message="No source intakes match the filters." />
    ) : (
      <TableFrame>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Intake</Table.Th>
              <Table.Th>Status / policy</Table.Th>
              <Table.Th>Supply Source</Table.Th>
              <Table.Th>Pages</Table.Th>
              <Table.Th>Captures</Table.Th>
              <Table.Th>Artifacts</Table.Th>
              <Table.Th>Mapping</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projection.intake.rows.map((row: IntakeRow) => (
              <InteractiveRow
                key={row.id}
                label={`Open intake ${row.name}`}
                onOpen={() => onOpen("intake", row.id)}
              >
                <Table.Td>
                  <ProjectionLink href={row.href}>
                    <Text fw={600}>{row.name}</Text>
                  </ProjectionLink>
                  <Text size="xs" c="dimmed">
                    {row.region ?? row.sourceKey}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={statusColor(row.status)}>{row.status}</Badge>
                  <Text size="xs">{row.complianceStatus}</Text>
                </Table.Td>
                <Table.Td>{row.supplySourceId ?? "Not recorded"}</Table.Td>
                <Table.Td>{row.pageCount}</Table.Td>
                <Table.Td>{row.captureCount}</Table.Td>
                <Table.Td>{row.artifactCount}</Table.Td>
                <Table.Td>{row.mappingJobId ?? "Not recorded"}</Table.Td>
              </InteractiveRow>
            ))}
          </Table.Tbody>
        </Table>
      </TableFrame>
    )}
    <Pager
      page={projection.intake.page}
      pageSize={projection.intake.pageSize}
      total={projection.intake.total}
    />
  </Paper>
);

const ReviewView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Title order={4}>Review Queue</Title>
    <Text size="sm" c="dimmed" mb="sm">
      Package, activation, regression, exclusion, target-rejection, and Human
      Review cases. This view has no inline decision controls.
    </Text>
    {projection.review.rows.length === 0 ? (
      <EmptyState message="No review cases match the filters." />
    ) : (
      <TableFrame>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Case</Table.Th>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Reviewer</Table.Th>
              <Table.Th>Evidence</Table.Th>
              <Table.Th>Reason</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projection.review.rows.map((row: ReviewRow) => (
              <InteractiveRow
                key={row.id}
                anchor={row.id}
                label={`Open review case ${row.id}`}
                onOpen={() =>
                  onOpen(row.detailType ?? "review", row.detailId ?? row.id)
                }
              >
                <Table.Td>
                  <ProjectionLink href={row.href}>
                    {row.caseType}
                  </ProjectionLink>
                </Table.Td>
                <Table.Td>{row.subjectId ?? "Not recorded"}</Table.Td>
                <Table.Td>
                  <Badge color={statusColor(row.status)}>{row.status}</Badge>
                </Table.Td>
                <Table.Td>{row.reviewerId ?? "Not recorded"}</Table.Td>
                <Table.Td>{row.evidenceCount}</Table.Td>
                <Table.Td>{row.reason ?? "Not recorded"}</Table.Td>
              </InteractiveRow>
            ))}
          </Table.Tbody>
        </Table>
      </TableFrame>
    )}
    <Pager
      page={projection.review.page}
      pageSize={projection.review.pageSize}
      total={projection.review.total}
    />
  </Paper>
);

const SourcesView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => {
  const lifecycleRows = projection.sources.lifecycleMovement.map(
    (row: CoverageMovementRow) => ({
      at: formatDate(row.at),
      transition: row.label,
      direction: row.direction,
      count: row.count,
      command: row.refreshClass,
      reason: row.reason ?? "Not recorded",
    }),
  );
  const freshnessRows = projection.sources.freshnessMovement.map(
    (row: CoverageMovementRow) => ({
      at: formatDate(row.at),
      movement: row.label,
      direction: row.direction,
      count: row.count,
      refreshClass: row.refreshClass,
      reason: row.reason ?? "Not recorded",
    }),
  );
  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Title order={4}>Supply Sources</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Canonical identity, predecessor or successor, lifecycle, freshness,
          hold or exclusion, mapping, Organization, automation, and target
          lineage.
        </Text>
        {projection.sources.rows.length === 0 ? (
          <EmptyState message="No Supply Sources match the filters." />
        ) : (
          <TableFrame>
            <Table stickyHeader striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Canonical identity</Table.Th>
                  <Table.Th>Lifecycle</Table.Th>
                  <Table.Th>Freshness</Table.Th>
                  <Table.Th>Automation</Table.Th>
                  <Table.Th>Targets</Table.Th>
                  <Table.Th>Lineage</Table.Th>
                  <Table.Th>Violations</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projection.sources.rows.map((row: SourceRow) => (
                  <InteractiveRow
                    key={row.id}
                    label={`Open Supply Source ${row.id}`}
                    onOpen={() => onOpen("source", row.id)}
                  >
                    <Table.Td>
                      <ProjectionLink href={row.href}>
                        <Text fw={600} lineClamp={1}>
                          {row.canonicalUrl}
                        </Text>
                      </ProjectionLink>
                      <Text size="xs" c="dimmed">
                        {row.operatorDomain ?? "Not recorded"} / gen{" "}
                        {row.lifecycleGeneration}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(row.lifecycleStage)}>
                        {row.lifecycleStage}
                      </Badge>
                      <Text size="xs">{row.outcome ?? "No outcome"}</Text>
                    </Table.Td>
                    <Table.Td>{row.freshness}</Table.Td>
                    <Table.Td>
                      <Badge color={row.isAutomationEnabled ? "green" : "gray"}>
                        {row.isAutomationEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {row.holdReason ? (
                        <Text size="xs" c="red">
                          {row.holdReason}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {row.targetContribution} fresh / {row.targetCount} linked
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        Intake: {row.intakeId ?? "Not recorded"}
                      </Text>
                      <Text size="xs">
                        Org: {row.organizationId ?? "Not recorded"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {row.invariantViolations.length ? (
                        <Badge color="red">
                          {row.invariantViolations.length}
                        </Badge>
                      ) : (
                        "None"
                      )}
                    </Table.Td>
                  </InteractiveRow>
                ))}
              </Table.Tbody>
            </Table>
          </TableFrame>
        )}
        <Pager
          page={projection.sources.page}
          pageSize={projection.sources.pageSize}
          total={projection.sources.total}
        />
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <SortableChartTable
          title="Lifecycle movement"
          summary="Forward and regressive lifecycle transitions from immutable Supply Source history."
          rows={lifecycleRows}
          columns={[
            { key: "at", label: "Time" },
            { key: "transition", label: "Transition" },
            { key: "direction", label: "Direction" },
            { key: "count", label: "Count", isNumeric: true },
            { key: "command", label: "Command" },
            { key: "reason", label: "Reason" },
          ]}
          visual={
            <DivergingMovementVisual
              rows={projection.sources.lifecycleMovement}
            />
          }
        />
        <SortableChartTable
          title="Freshness movement"
          summary="Freshness losses and restorations grouped by refresh class and recorded reason."
          rows={freshnessRows}
          columns={[
            { key: "at", label: "Time" },
            { key: "movement", label: "Movement" },
            { key: "direction", label: "Direction" },
            { key: "count", label: "Count", isNumeric: true },
            { key: "refreshClass", label: "Refresh class" },
            { key: "reason", label: "Reason" },
          ]}
          visual={
            <DivergingMovementVisual
              rows={projection.sources.freshnessMovement}
            />
          }
        />
      </SimpleGrid>
    </Stack>
  );
};

const CandidatesView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Title order={4}>Candidates</Title>
    <Text size="sm" c="dimmed" mb="sm">
      Candidate, publication target, rejection, freshness, source, run, and
      lifecycle context. Publication is not available here.
    </Text>
    {projection.candidates.rows.length === 0 ? (
      <EmptyState message="No candidates match the filters." />
    ) : (
      <TableFrame>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Candidate</Table.Th>
              <Table.Th>Kind / status</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Freshness</Table.Th>
              <Table.Th>Event context</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projection.candidates.rows.map((row: CandidateRow) => (
              <InteractiveRow
                key={row.id}
                label={`Open candidate ${row.title}`}
                onOpen={() => onOpen("candidate", row.id)}
              >
                <Table.Td>
                  <ProjectionLink href={row.href}>
                    <Text fw={600}>{row.title}</Text>
                  </ProjectionLink>
                  <Text size="xs" c="dimmed">
                    {row.city ?? "Not recorded"} / {row.sport ?? "Not recorded"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{row.listingKind}</Badge>
                  <Text size="xs">{row.status}</Text>
                </Table.Td>
                <Table.Td>{row.supplySourceId ?? row.sourceId}</Table.Td>
                <Table.Td>
                  {row.targetId ?? "Not recorded"}
                  {row.targetStatus ? (
                    <Text size="xs">{row.targetStatus}</Text>
                  ) : null}
                  {row.rejectionReason ? (
                    <Text size="xs" c="red">
                      {row.rejectionReason}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>{formatDate(row.freshnessExpiresAt)}</Table.Td>
                <Table.Td>
                  {row.startsAt ? formatDate(row.startsAt) : "Not recorded"}
                </Table.Td>
              </InteractiveRow>
            ))}
          </Table.Tbody>
        </Table>
      </TableFrame>
    )}
    <Pager
      page={projection.candidates.page}
      pageSize={projection.candidates.pageSize}
      total={projection.candidates.total}
    />
  </Paper>
);

const DetailDrawer = ({
  detail,
  isOpened,
  isLoading,
  isMobile,
  onClose,
}: Readonly<{
  detail: ProjectionDetail | null;
  isOpened: boolean;
  isLoading: boolean;
  isMobile: boolean;
  onClose: () => void;
}>) => (
  <Drawer
    opened={isOpened}
    onClose={onClose}
    title={detail?.title ?? "Detail"}
    position="right"
    size={isMobile ? "100%" : "min(100vw, 620px)"}
  >
    {detail ? (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" c="dimmed">
              {detail.subtitle}
            </Text>
            <Text size="xs" ff="monospace">
              {detail.id}
            </Text>
          </div>
          <Badge color={statusColor(detail.status)}>
            {detail.status ?? "Not recorded"}
          </Badge>
        </Group>
        {detail.sections.map((section) => (
          <Paper key={section.title} withBorder p="sm" radius="sm">
            <Title order={5}>{section.title}</Title>
            <Stack gap={4} mt="xs">
              {section.fields.map((item) => (
                <Text key={item.label} size="sm">
                  <Text span fw={700}>
                    {item.label}:
                  </Text>{" "}
                  {item.href ? (
                    <ProjectionLink href={item.href}>
                      {item.value}
                    </ProjectionLink>
                  ) : (
                    item.value
                  )}
                </Text>
              ))}
            </Stack>
          </Paper>
        ))}
        <Paper withBorder p="sm" radius="sm">
          <Title order={5}>History</Title>
          {detail.history.length ? (
            <TableFrame>
              <Table striped style={{ minWidth: 720 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>When</Table.Th>
                    <Table.Th>Record</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actor</Table.Th>
                    <Table.Th>Evidence</Table.Th>
                    <Table.Th>Reason</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {detail.history.map((row: ProjectionHistoryRow) => (
                    <Table.Tr key={row.id}>
                      <Table.Td>{formatDate(row.at)}</Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {row.href ? (
                            <ProjectionLink href={row.href}>
                              {row.kind}
                            </ProjectionLink>
                          ) : (
                            row.kind
                          )}
                        </Text>
                        <Text size="xs" ff="monospace">
                          {row.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>{row.status ?? "Not recorded"}</Table.Td>
                      <Table.Td>{historyActor(row)}</Table.Td>
                      <Table.Td>{historyEvidence(row)}</Table.Td>
                      <Table.Td>{row.reason ?? "Not recorded"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </TableFrame>
          ) : (
            <Text size="sm" c="dimmed">
              Not recorded
            </Text>
          )}
          <Pager
            page={detail.historyPage ?? 1}
            pageSize={detail.historyPageSize ?? Math.max(1, detail.history.length)}
            total={detail.historyTotal ?? detail.history.length}
            queryKey="historyPage"
          />
        </Paper>
        <Paper withBorder p="sm" radius="sm">
          <Title order={5}>Related records</Title>
          {detail.related.length ? (
            <Stack gap={4}>
              {detail.related.map((row) => (
                <Group key={`${row.kind}:${row.id}`} gap="xs" wrap="wrap">
                  <Badge size="sm" variant="light">
                    {row.kind}
                  </Badge>
                  <Text size="sm">
                    {row.href ? (
                      <ProjectionLink href={row.href}>
                        {row.label}
                      </ProjectionLink>
                    ) : (
                      row.label
                    )}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {row.status ?? "Not recorded"}
                  </Text>
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Not recorded
            </Text>
          )}
        </Paper>
      </Stack>
    ) : isLoading ? (
      <Text c="dimmed">Loading detail evidence…</Text>
    ) : (
      <Text c="dimmed">
        Detail evidence is not recorded for this selection.
      </Text>
    )}
  </Drawer>
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
  const view = isView(searchParams.get("view"))
    ? (searchParams.get("view") as AffiliateOperationsView)
    : "overview";
  const selectedType = isDetailType(searchParams.get("selectedType"))
    ? (searchParams.get("selectedType") as AffiliateOperationsDetailType)
    : null;
  const selectedId = searchParams.get("selected");
  const anchor = searchParams.get("anchor");
  const filters: AffiliateOperationsFilters = {
    ...emptyFilters,
    market: searchParams.get("market") ?? "",
    city: searchParams.get("city") ?? "",
    sport: searchParams.get("sport") ?? "",
    profile: searchParams.get("profile") ?? "",
    range: searchParams.get("range") ?? "",
    status: searchParams.get("status") ?? "",
    lane: searchParams.get("lane") ?? "",
    role: searchParams.get("role") ?? "",
    reason: searchParams.get("reason") ?? "",
  };
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
  const queryString = searchParams.toString();
  const projection = useMemo(
    () =>
      projectionQuery === queryString
        ? projectionState
        : projectionQuery !== null &&
            listQueryKey(projectionQuery) === listQueryKey(queryString) &&
            projectionState
          ? { ...projectionState, selected: null }
          : null,
    [projectionQuery, projectionState, queryString],
  );
  const pollingMs =
    selectedType === "job"
      ? 15_000
      : view === "overview" || view === "jobs"
        ? 15_000
        : view === "coverage"
          ? 60_000
          : null;

  const loadProjection = useCallback(
    async (query: string, background = false) => {
      if (background && requestInFlight.current) return;
      requestAbortController.current?.abort();
      const controller = new AbortController();
      requestAbortController.current = controller;
      requestInFlight.current = true;
      const sequence = requestSequence.current + 1;
      requestSequence.current = sequence;
      let cachedProjection = projectionCacheRef.current.get(query) ?? null;
      if (!cachedProjection && !background) {
        const previousProjection = projectionRef.current;
        const previousQuery = projectionQueryRef.current;
        if (
          previousProjection &&
          previousQuery !== null &&
          listQueryKey(previousQuery) === listQueryKey(query)
        ) {
          cachedProjection = { ...previousProjection, selected: null };
          setCachedProjection(
            projectionCacheRef.current,
            query,
            cachedProjection,
          );
        }
      }
      if (!background) {
        projectionRef.current = cachedProjection;
        projectionQueryRef.current = query;
        setProjectionQuery(query);
        setProjection(cachedProjection);
        setHasNewerResults(false);
      }
      setIsLoading(true);
      try {
        const nextProjection = await getAffiliateOperationsProjection(
          query,
          controller.signal,
        );
        if (sequence !== requestSequence.current) return;
        const previousProjection = projectionRef.current;
        const previousQuery = projectionQueryRef.current;
        const historicalProjection = retainHistoricalSeries(
          previousProjection,
          nextProjection,
          previousQuery,
          query,
        );
        const appliedProjection = background
          ? retainFocusedListSelection(
              previousProjection,
              historicalProjection,
              view,
              selectedType,
              selectedId,
            )
          : historicalProjection;
        setCachedProjection(
          projectionCacheRef.current,
          query,
          appliedProjection,
        );
        projectionRef.current = appliedProjection;
        projectionQueryRef.current = query;
        setProjectionQuery(query);
        setProjection(appliedProjection);
        setHasNewerResults(
          background &&
            Boolean(previousProjection && selectedType && selectedId),
        );
        setIsStale(false);
        setError(null);
      } catch (cause) {
        if (sequence !== requestSequence.current) return;
        const lastGoodProjection =
          projectionCacheRef.current.get(query) ?? null;
        projectionRef.current = lastGoodProjection;
        projectionQueryRef.current = query;
        setProjectionQuery(query);
        setProjection(lastGoodProjection);
        setIsStale(true);
        setError(
          cause instanceof Error
            ? cause.message
            : "Affiliate operations projection is unavailable.",
        );
      } finally {
        if (requestAbortController.current === controller) {
          requestAbortController.current = null;
          requestInFlight.current = false;
        }
        if (sequence === requestSequence.current) setIsLoading(false);
      }
    },
    [requestSequence, selectedId, selectedType, view],
  );

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
  const activeDetail = projection?.selected ?? null;

  if (!isActive) return null;
  return (
    <Stack gap="md">
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
              onClick={() => {
                void loadProjection(queryString);
              }}
            >
              Refresh
            </Button>
          </Group>
        </Group>
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
      </Paper>
      {error ? (
        <Alert
          color="yellow"
          title={
            isStale && projection
              ? "Stale projection"
              : "Projection unavailable"
          }
          icon={<AlertTriangle size={16} />}
        >
          {error}
          {projection ? " Last-good data remains visible." : ""}
        </Alert>
      ) : null}
      <Tabs
        value={view}
        onChange={(value) =>
          navigate({
            view: isView(value) ? value : "overview",
            page: null,
            targetPage: null,
            campaignPage: null,
            discoveryPage: null,
            selected: null,
            selectedType: null,
          })
        }
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
      {isLoading && !projection ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
          <Text size="sm">Loading projection…</Text>
        </Group>
      ) : null}
      {projection ? (
        view === "overview" ? (
          <OverviewView projection={projection} />
        ) : view === "coverage" ? (
          <CoverageView projection={projection} />
        ) : view === "jobs" ? (
          <JobsView projection={projection} onOpen={openDetail} />
        ) : view === "intake" ? (
          <IntakeView projection={projection} onOpen={openDetail} />
        ) : view === "review" ? (
          <ReviewView projection={projection} onOpen={openDetail} />
        ) : view === "sources" ? (
          <SourcesView projection={projection} onOpen={openDetail} />
        ) : (
          <CandidatesView projection={projection} onOpen={openDetail} />
        )
      ) : null}
      <DetailDrawer
        detail={activeDetail}
        isOpened={Boolean(selectedType && selectedId)}
        isLoading={isLoading && !activeDetail}
        isMobile={isMobile}
        onClose={closeDetail}
      />
      <Text size="xs" c="dimmed">
        This control room only reads the server projection. Human-directed
        changes use a separate authorized workflow.
      </Text>
    </Stack>
  );
}
