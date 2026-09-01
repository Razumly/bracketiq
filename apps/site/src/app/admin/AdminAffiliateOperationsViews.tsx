"use client";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  Gauge,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import type {
  AffiliateOperationsDetailType,
  AffiliateOperationsProjection,
  AlertHistoryRow,
  CampaignRow,
  CandidateRow,
  CoverageCellRow,
  CoverageMovementRow,
  CoverageTargetRow,
  DemandHistoryRow,
  DiscoveryOutcomeRow,
  FailureParetoRow,
  IntakeRow,
  JobRow,
  ReconciliationRunRow,
  MarginalYieldRow,
  ReviewRow,
  SourceRow,
  SupplyTargetDeficitRow,
} from "@/types/affiliateOperations";
import {
  formatDate,
  formatNumber,
  severityColor,
  statusColor,
} from "./AdminAffiliateOperationsFormatting";
import { useProjectionNavigation } from "./AdminAffiliateOperationsNavigation";
import {
  DivergingMovementVisual,
  EmptyState,
  FilterBar,
  HorizontalBarsVisual,
  InteractiveRow,
  MetricCard,
  Pager,
  ProjectionLink,
  SortableChartTable,
  StackedAgeBandVisual,
  TableFrame,
  type HorizontalBarSpec,
  type StepGroupSpec,
  StepTimelineVisual,
  WipChart,
} from "./AdminAffiliateOperationsVisuals";
const displayDate = (value: string | number | null): string =>
  formatDate(typeof value === "string" ? value : null);

export const OverviewView = ({
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
          <Text size="xs" c="dimmed" mb="sm">
            Showing {projection.overview.exceptions.length} of{" "}
            {projection.overview.exceptionTotal} recorded exceptions.
          </Text>
          {projection.overview.exceptions.length === 0 ? (
            <EmptyState message="No operational exceptions are recorded." />
          ) : (
            <Stack gap="xs">
              {projection.overview.exceptions.map((exception) => (
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
          {projection.overview.exceptionTotal >
          projection.overview.exceptions.length ? (
            <ProjectionLink
              href="/admin?tab=affiliateOperations&view=alerts"
            >
              <Text size="sm" fw={600}>
                View remaining alert history
              </Text>
            </ProjectionLink>
          ) : null}
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

export const CoverageView = ({
  projection,
}: Readonly<{ projection: AffiliateOperationsProjection }>) => {
  const navigateProjection = useProjectionNavigation();
  const marginalRows = projection.coverage.marginalYield.map(
    (row: MarginalYieldRow) => ({
      cycle: row.cycle,
      at: row.at,
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
      at: row.at,
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
      at: row.at,
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
      lastRun: row.lastRunAt,
      nextRun: row.nextRunAt,
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
                  <Table.Th>Public target</Table.Th>
                  <Table.Th>Lineage</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projection.coverage.targets.map((row: CoverageTargetRow) => (
                  <InteractiveRow
                    key={row.id}
                    anchor={row.id}
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
                    <Table.Td>
                      <Badge color={statusColor(row.publicTargetState)}>
                        {row.publicTargetState || "Not recorded"}
                      </Badge>
                      <Text size="xs">
                        {row.publicTargetHref ? (
                          <ProjectionLink
                            href={row.publicTargetHref}
                            preserveQueryState={false}
                          >
                            {row.publicTargetName ?? "Public target"}
                          </ProjectionLink>
                        ) : (
                          row.publicTargetName ?? "Not recorded"
                        )}
                      </Text>
                      {!row.publicTargetHref ? (
                        <Text size="xs" c="dimmed">
                          Public link not recorded
                        </Text>
                      ) : null}
                    </Table.Td>
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
            { key: "at", label: "Time", render: displayDate },
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
              { key: "at", label: "Time", render: displayDate },
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
              { key: "lastRun", label: "Last run", render: displayDate },
              { key: "nextRun", label: "Next run", render: displayDate },
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

export const JobsView = ({
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

export const IntakeView = ({
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

export const ReviewView = ({
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

export const SourcesView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => {
  const lifecycleRows = projection.sources.lifecycleMovement.map(
    (row: CoverageMovementRow) => ({
      at: row.at,
      transition: row.label,
      direction: row.direction,
      count: row.count,
      command: row.refreshClass,
      reason: row.reason ?? "Not recorded",
      href: row.href,
    }),
  );
  const freshnessRows = projection.sources.freshnessMovement.map(
    (row: CoverageMovementRow) => ({
      at: row.at,
      movement: row.label,
      direction: row.direction,
      count: row.count,
      refreshClass: row.refreshClass,
      reason: row.reason ?? "Not recorded",
      href: row.href,
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
            { key: "at", label: "Time", render: displayDate },
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
            { key: "at", label: "Time", render: displayDate },
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

export const CandidatesView = ({
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
export const AlertsView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Title order={4}>Operational alert history</Title>
    <Text size="sm" c="dimmed" mb="sm">
      Alert state and delivery evidence from the server projection. This view
      has no acknowledgement controls.
    </Text>
    {projection.alerts.rows.length === 0 ? (
      <EmptyState message="No operational alerts match the filters." />
    ) : (
      <TableFrame>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Alert</Table.Th>
              <Table.Th>Severity</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Deliveries</Table.Th>
              <Table.Th>Latest delivery</Table.Th>
              <Table.Th>Recorded</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projection.alerts.rows.map((row: AlertHistoryRow) => (
              <InteractiveRow
                key={row.id}
                anchor={row.id}
                label={`Open alert ${row.title}`}
                onOpen={() => onOpen("alert", row.id)}
              >
                <Table.Td>
                  <ProjectionLink href={row.href}>
                    <Text fw={600}>{row.title}</Text>
                  </ProjectionLink>
                  <Text size="xs" c="dimmed">
                    {row.category} / {row.eventKey}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={severityColor(row.severity)}>
                    {row.severity}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={row.active ? "red" : "gray"}>
                    {row.active ? "Active" : row.recovered ? "Recovered" : "Resolved"}
                  </Badge>
                  {row.recoveryDetail ? (
                    <Text size="xs" c="dimmed">
                      {row.recoveryDetail}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  {row.deliveredCount}/{row.deliveryCount}
                </Table.Td>
                <Table.Td>{row.latestDeliveryStatus ?? "Not recorded"}</Table.Td>
                <Table.Td>{formatDate(row.at)}</Table.Td>
              </InteractiveRow>
            ))}
          </Table.Tbody>
        </Table>
      </TableFrame>
    )}
    <Pager
      page={projection.alerts.page}
      pageSize={projection.alerts.pageSize}
      total={projection.alerts.total}
      queryKey="page"
    />
  </Paper>
);

export const CutoverView = ({
  projection,
  onOpen,
}: Readonly<{
  projection: AffiliateOperationsProjection;
  onOpen: (type: AffiliateOperationsDetailType, id: string) => void;
}>) => (
  <Paper withBorder radius="md" p="md">
    <Title order={4}>Cutover and reconciliation history</Title>
    <Text size="sm" c="dimmed" mb="sm">
      Durable dry-run, apply, and rollback evidence. This view is read-only.
    </Text>
    {projection.cutover.rows.length === 0 ? (
      <EmptyState message="No reconciliation runs are recorded." />
    ) : (
      <TableFrame>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Run</Table.Th>
              <Table.Th>Mode</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Report hash</Table.Th>
              <Table.Th>Immutable evidence</Table.Th>
              <Table.Th>Counts</Table.Th>
              <Table.Th>Applied</Table.Th>
              <Table.Th>Recorded</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projection.cutover.rows.map((row: ReconciliationRunRow) => (
              <InteractiveRow
                key={row.id}
                anchor={row.id}
                label={`Open reconciliation run ${row.id}`}
                onOpen={() => onOpen("reconciliationRun", row.id)}
              >
                <Table.Td>
                  <ProjectionLink href={row.href}>
                    <Text fw={600}>{row.id}</Text>
                  </ProjectionLink>
                  <Text size="xs" c="dimmed">
                    {row.rolloutCohort} /{" "}
                    {row.supplyContractVersion === null
                      ? "Not recorded"
                      : `v${row.supplyContractVersion}`}
                  </Text>
                </Table.Td>
                <Table.Td>{row.mode}</Table.Td>
                <Table.Td>
                  <Badge color={statusColor(row.status)}>{row.status}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" ff="monospace" lineClamp={1}>
                    {row.reportHash}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">
                    Session: {row.reportEvidence.sessionId ?? "Not recorded"}
                  </Text>
                  <Text size="xs" ff="monospace">
                    Evidence: {row.reportEvidence.evidenceHash ?? "Not recorded"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Processes: {row.reportEvidence.evidencePagination.processes.total}; Findings:{" "}
                    {row.reportEvidence.evidencePagination.blockingFindings.total} blocking /{" "}
                    {row.reportEvidence.evidencePagination.warnings.total} warnings /{" "}
                    {row.reportEvidence.evidencePagination.resolutions.total} resolved
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">
                    Counts:{" "}
                    {Object.entries(row.counts)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ") || "Not recorded"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Records by kind:{" "}
                    {Object.entries(row.recordsByKind ?? {})
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ") || "Not recorded"}
                  </Text>
                </Table.Td>
                <Table.Td>{formatDate(row.appliedAt)}</Table.Td>
                <Table.Td>{formatDate(row.createdAt)}</Table.Td>
              </InteractiveRow>
            ))}
          </Table.Tbody>
        </Table>
      </TableFrame>
    )}
    <Pager
      page={projection.cutover.page}
      pageSize={projection.cutover.pageSize}
      total={projection.cutover.total}
      queryKey="page"
    />
  </Paper>
);
