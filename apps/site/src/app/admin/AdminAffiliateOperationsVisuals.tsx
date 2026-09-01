"use client";
import { useMemo, useState } from "react";
import type * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Group,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
} from "lucide-react";
import type {
  AffiliateOperationsFilters,
  AffiliateOperationsView,
  CoverageMovementRow,
  QueueAgeLane,
  WipSeriesPoint,
} from "@/types/affiliateOperations";
import {
  anchorElementId,
  formatDate,
  formatNumber,
  formatTimeLabel,
} from "./AdminAffiliateOperationsFormatting";
import {
  filterKeysByView,
  isExternalProjectionHref,
  mergeProjectionHref,
  useProjectionNavigation,
  useQueryNavigation,
} from "./AdminAffiliateOperationsNavigation";

export const emptyFilters: AffiliateOperationsFilters = {
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

export const ProjectionLink = ({
  href,
  children,
  preserveQueryState = true,
}: Readonly<{
  href: string;
  children: React.ReactNode;
  preserveQueryState?: boolean;
}>) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statefulHref = useMemo(
    () =>
      preserveQueryState
        ? mergeProjectionHref(new URLSearchParams(searchParams.toString()), href)
        : href,
    [href, preserveQueryState, searchParams],
  );
  return (
    <Link
      href={statefulHref}
      onClick={(event) => {
        event.stopPropagation();
        if (isExternalProjectionHref(statefulHref)) return;
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
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

export const InteractiveRow = ({
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

export const EmptyState = ({ message }: Readonly<{ message: string }>) => (
  <Paper withBorder p="xl" radius="md">
    <Text c="dimmed" ta="center">
      {message}
    </Text>
  </Paper>
);

export const TableFrame = ({ children }: Readonly<{ children: React.ReactNode }>) => (
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

type SortableTableRow = Readonly<Record<string, string | number | null>>;
type SortableTableColumn = Readonly<{
  key: string;
  label: string;
  isNumeric?: boolean;
  render?: (
    value: string | number | null,
    row: SortableTableRow,
  ) => React.ReactNode;
}>;
type SortDirection = "asc" | "desc";
type SortState = Readonly<{
  key: string;
  direction: SortDirection;
}>;

const resolveSortState = (
  searchParams: URLSearchParams,
  sortScope: string,
  columnKeys: readonly string[],
): SortState => {
  const requestedSort = searchParams.get("sort");
  const requestedKey = requestedSort?.startsWith(`${sortScope}:`)
    ? requestedSort.slice(sortScope.length + 1)
    : null;
  const knownKey =
    requestedKey && columnKeys.includes(requestedKey) ? requestedKey : null;
  return {
    key: knownKey ?? columnKeys[0] ?? "",
    direction:
      knownKey && searchParams.get("direction") === "asc" ? "asc" : "desc",
  };
};

const compareSortableValues = (
  leftValue: string | number | null,
  rightValue: string | number | null,
): number => {
  const bothNumbers =
    typeof leftValue === "number" && typeof rightValue === "number";
  return bothNumbers
    ? leftValue - rightValue
    : String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
};

const sortTableRows = (
  rows: readonly SortableTableRow[],
  sort: SortState,
): readonly SortableTableRow[] =>
  [...rows].sort((left, right) => {
    const comparison = compareSortableValues(left[sort.key], right[sort.key]);
    return sort.direction === "asc" ? comparison : -comparison;
  });

const SortIndicator = ({
  active,
  direction,
}: Readonly<{ active: boolean; direction: SortDirection }>) =>
  active ? (
    direction === "asc" ? (
      <ArrowUp size={13} />
    ) : (
      <ArrowDown size={13} />
    )
  ) : (
    <ArrowUpDown size={13} />
  );

const SortableChartTableHeader = ({
  columns,
  sort,
  onSort,
}: Readonly<{
  columns: readonly SortableTableColumn[];
  sort: SortState;
  onSort: (key: string) => void;
}>) => (
  <Table.Thead>
    <Table.Tr>
      {columns.map((column) => (
        <Table.Th key={column.key}>
          <Button
            variant="subtle"
            size="compact-xs"
            rightSection={
              <SortIndicator
                active={sort.key === column.key}
                direction={sort.direction}
              />
            }
            onClick={() => onSort(column.key)}
            aria-label={`Sort by ${column.label}`}
          >
            {column.label}
          </Button>
        </Table.Th>
      ))}
    </Table.Tr>
  </Table.Thead>
);

const SortableChartTableRows = ({
  rows,
  columns,
}: Readonly<{
  rows: readonly SortableTableRow[];
  columns: readonly SortableTableColumn[];
}>) => {
  const firstColumnKey = columns[0]?.key ?? "row";
  return (
    <Table.Tbody>
      {rows.map((row, index) => (
        <Table.Tr key={`${String(row[firstColumnKey])}-${index}`}>
          {columns.map((column) => {
            const rawValue = row[column.key];
            const value = column.render
              ? column.render(rawValue, row)
              : String(rawValue ?? "Not recorded");
            const firstColumnLink =
              column.key === firstColumnKey && typeof row.href === "string";
            return (
              <Table.Td key={column.key}>
                {firstColumnLink ? (
                  <ProjectionLink href={row.href as string}>
                    {value}
                  </ProjectionLink>
                ) : (
                  value
                )}
              </Table.Td>
            );
          })}
        </Table.Tr>
      ))}
    </Table.Tbody>
  );
};

export const SortableChartTable = ({
  title,
  summary,
  rows,
  columns,
  visual,
}: Readonly<{
  title: string;
  summary: string;
  rows: readonly SortableTableRow[];
  columns: readonly SortableTableColumn[];
  visual?: React.ReactNode;
}>) => {
  const searchParams = useSearchParams();
  const navigate = useQueryNavigation();
  const columnKeys = columns.map((column) => column.key).join(",");
  const sortScope = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const sort = useMemo(
    () => resolveSortState(searchParams, sortScope, columnKeys.split(",")),
    [columnKeys, searchParams, sortScope],
  );
  const sortedRows = useMemo(
    () => sortTableRows(rows, sort),
    [rows, sort],
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
        {visual}
        <Text size="sm" fw={600}>
          {visual ? "Sortable table alternative" : "Sortable table"}
        </Text>
        <Table withTableBorder striped highlightOnHover>
          <SortableChartTableHeader
            columns={columns}
            sort={sort}
            onSort={toggleSort}
          />
          <SortableChartTableRows rows={sortedRows} columns={columns} />
        </Table>
      </Stack>
    </Paper>
  );
};

const stepPlotHeight = 104;
const stepColumnWidth = 30;

export type StepSeriesSpec = Readonly<{
  key: string;
  label: string;
  color: string;
  points: readonly (number | null)[];
}>;

export type StepGroupSpec = Readonly<{
  key: string;
  label: string;
  series: readonly StepSeriesSpec[];
  xLabels: readonly string[];
}>;

export const StepTimelineVisual = ({
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

export const StackedAgeBandVisual = ({
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

export const DivergingMovementVisual = ({
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
export type HorizontalBarSpec = Readonly<{
  label: string;
  value: number;
  color: string;
}>;

export const HorizontalBarsVisual = ({
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

export const MetricCard = ({
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

export const Pager = ({
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


export const FilterBar = ({
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
  const filterKeys = filterKeysByView[view];
  if (filterKeys.length === 0) return null;
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

export const WipChart = ({
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
