'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, RefreshCw } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  MultiSelect,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
type SportCitation = {
  artifactId: string;
  artifactSha256: string;
  artifactKind: 'PAGE_HTML' | 'PAGE_MARKDOWN' | 'PAGE_SCREENSHOT';
  pageUrl: string;
  excerpt: string;
};

type SportDetermination = {
  determinationSha256: string;
  sourceLabels: string[];
  status: 'RESOLVED' | 'VARIANT_UNRESOLVED' | 'UNSUPPORTED' | 'BLACKLISTED';
  resolutionBasis: 'SOURCE_EVIDENCE' | 'USER_DECISION';
  canonicalSportNames: string[];
  rationale: string;
  evidence: SportCitation[];
};

type HumanSportResolution = {
  state: 'PENDING' | 'CONSUMED';
  decidedAt: string;
  decidedByUserId: string;
  rationale: string;
  resolutions: Array<{
    determinationSha256: string;
    sourceLabels: string[];
    canonicalSportNames: string[];
  }>;
};

type HumanReviewRow = {
  jobId: string;
  intakeId: string;
  intakeName: string;
  sourceKey: string;
  region?: string | null;
  baseUrl?: string | null;
  intakeStatus: string;
  complianceStatus: string;
  attemptCount: number;
  markedAt: string;
  errorMessage?: string | null;
  source?: string | null;
  requestedNextAction?: string | null;
  reasonCodes: string[];
  sourceSportLabels: string[];
  rationale?: string | null;
  blockingIssues: string[];
  hasSelectedLogo: boolean;
  reviewOwner: 'USER' | 'MAPPING_AGENT' | 'SYSTEM';
  reviewQuestion: string;
  recommendedAction: string;
  claimCatalogSha256?: string | null;
  currentCatalogSha256?: string | null;
  catalogCurrent?: boolean | null;
  sportDeterminations?: SportDetermination[];
  humanSportResolution?: HumanSportResolution | null;
};
type SportsCatalog = { sports: Array<{ id: string; name: string }> };

const isHumanReviewRow = (value: unknown): value is HumanReviewRow => (
  value !== null
  && typeof value === 'object'
  && 'jobId' in value
  && typeof value.jobId === 'string'
  && 'intakeId' in value
  && typeof value.intakeId === 'string'
  && 'reviewOwner' in value
  && (value.reviewOwner === 'USER' || value.reviewOwner === 'MAPPING_AGENT' || value.reviewOwner === 'SYSTEM')
);

const isSportsCatalog = (value: unknown): value is SportsCatalog => {
  if (value === null || typeof value !== 'object' || !('sports' in value) || !Array.isArray(value.sports)) return false;
  const { sports } = value as { sports: unknown[] };
  return sports.every((sport) => {
    if (!sport || typeof sport !== 'object' || !('name' in sport)) return false;
    const name: unknown = sport.name;
    return typeof name === 'string';
  });
};

type ReviewFilter = HumanReviewRow['reviewOwner'] | 'ALL';

type Props = {
  active: boolean;
  refreshKey: number;
  onReviewIntake: (intakeId: string) => void;
};

const readPayload = async (response: Response): Promise<unknown> => {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      && typeof payload.error === 'string'
      ? payload.error
      : 'Request failed.';
    throw new Error(message);
  }
  return payload;
};

const labelForReason = (value: string): string => (
  value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase())
);

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};
const reviewOwnerPresentation = {
  USER: { label: 'Your decision', color: 'red' },
  MAPPING_AGENT: { label: 'Agent repair', color: 'orange' },
  SYSTEM: { label: 'System repair', color: 'violet' },
} as const;

export default function AdminAffiliateMappingReviewPanel({ active, refreshKey, onReviewIntake }: Props) {
  const [jobs, setJobs] = useState<HumanReviewRow[]>([]);
  const [catalog, setCatalog] = useState<SportsCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('USER');
  const [selections, setSelections] = useState<Record<string, Record<string, string[]>>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const ownerCounts = useMemo(() => ({
    USER: jobs.filter((job) => job.reviewOwner === 'USER').length,
    MAPPING_AGENT: jobs.filter((job) => job.reviewOwner === 'MAPPING_AGENT').length,
    SYSTEM: jobs.filter((job) => job.reviewOwner === 'SYSTEM').length,
  }), [jobs]);
  const visibleJobs = useMemo(() => (
    reviewFilter === 'ALL'
      ? jobs
      : jobs.filter((job) => job.reviewOwner === reviewFilter || (reviewFilter === 'USER' && job.catalogCurrent === false))
  ), [jobs, reviewFilter]);
  const catalogOptions = useMemo(
    () => (catalog?.sports ?? []).map((sport) => ({ value: sport.name, label: sport.name })),
    [catalog],
  );

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readPayload(await fetch('/api/admin/affiliate-mapping-reviews', {
        credentials: 'include',
      }));
      if (!payload || typeof payload !== 'object') throw new Error('Invalid human-review queue response.');
      const jobsValue = 'jobs' in payload && Array.isArray(payload.jobs)
        ? payload.jobs.filter(isHumanReviewRow)
        : [];
      const catalogValue = 'sportsCatalog' in payload && isSportsCatalog(payload.sportsCatalog)
        ? payload.sportsCatalog
        : null;
      setJobs(jobsValue);
      setCatalog(catalogValue);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load human-review jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitDecision = useCallback(async (
    job: HumanReviewRow,
    body: Record<string, unknown>,
  ) => {
    setPendingAction(job.jobId);
    setActionError(null);
    try {
      await readPayload(await fetch(`/api/admin/affiliate-mapping-reviews/${encodeURIComponent(job.jobId)}/sport-resolution`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
      await loadJobs();
    } catch (decisionError) {
      setActionError(decisionError instanceof Error ? decisionError.message : 'The sport decision could not be saved.');
    } finally {
      setPendingAction(null);
    }
  }, [loadJobs]);

  useEffect(() => {
    if (active) void loadJobs();
  }, [active, loadJobs, refreshKey]);

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm" align="flex-start">
        <div>
          <Title order={3}>Terminal mapping review queue</Title>
          <Text size="sm" c="dimmed">
            This queue separates source decisions from agent repairs and system handoff failures.
          </Text>
        </div>
        <Group gap="xs">
          {loading ? <Loader size="sm" /> : null}
          <Button
            size="xs"
            variant="default"
            leftSection={<RefreshCw size={14} />}
            disabled={loading || Boolean(pendingAction)}
            onClick={() => void loadJobs()}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {error ? <Alert color="red" title="Human-review queue unavailable" mb="sm">{error}</Alert> : null}
      {actionError ? <Alert color="red" title="Sport decision not saved" mb="sm">{actionError}</Alert> : null}

      <Alert color="blue" title="What needs your review?" mb="sm">
        Only items marked <strong>Your decision</strong> need a source or evidence decision from you.
        Agent repair items contain mapping instructions. System repair items describe infrastructure failures and do not require a source judgment.
      </Alert>

      <Group mb="sm" justify="space-between" align="flex-end">
        <Select
          label="Show review items"
          value={reviewFilter}
          onChange={(value) => setReviewFilter((value as ReviewFilter | null) ?? 'USER')}
          data={[
            { value: 'USER', label: `Needs your decision (${ownerCounts.USER})` },
            { value: 'MAPPING_AGENT', label: `Agent repair (${ownerCounts.MAPPING_AGENT})` },
            { value: 'SYSTEM', label: `System repair (${ownerCounts.SYSTEM})` },
            { value: 'ALL', label: `All terminal items (${jobs.length})` },
          ]}
          w={280}
        />
        <Group gap="xs">
          <Badge color="red" variant="light">Your decision: {ownerCounts.USER}</Badge>
          <Badge color="orange" variant="light">Agent repair: {ownerCounts.MAPPING_AGENT}</Badge>
          <Badge color="violet" variant="light">System repair: {ownerCounts.SYSTEM}</Badge>
        </Group>
      </Group>

      <ScrollArea type="auto">
        <Table striped highlightOnHover withTableBorder withColumnBorders miw={1400}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Question and next action</Table.Th>
              <Table.Th>Recorded concern and evidence</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Marked</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleJobs.map((job) => {
              const owner = reviewOwnerPresentation[job.reviewOwner];
              const determinations = job.sportDeterminations ?? [];
              const unresolved = determinations.filter((determination) => (
                determination.status === 'VARIANT_UNRESOLVED' || determination.status === 'UNSUPPORTED'
              ));
              const blacklistedOnly = determinations.length > 0
                && determinations.every((determination) => determination.status === 'BLACKLISTED');
              const isPending = pendingAction === job.jobId;
              const rowSelections = selections[job.jobId] ?? {};
              const rationale = rationales[job.jobId] ?? '';
              const canResolve = unresolved.length > 0
                && job.catalogCurrent !== false
                && Boolean(catalog)
                && Boolean(job.currentCatalogSha256);
              return (
                <Table.Tr key={job.jobId}>
                  <Table.Td>
                    <Text fw={600}>{job.intakeName}</Text>
                    <Text size="xs" c="dimmed">{job.sourceKey}</Text>
                    {job.region ? <Text size="xs" c="dimmed">{job.region}</Text> : null}
                    <Group gap={4} mt={4}>
                      <Badge size="xs" color="gray" variant="light">Terminal</Badge>
                      {job.hasSelectedLogo ? <Badge size="xs" color="teal" variant="light">Logo selected</Badge> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={owner.color} variant="light">{owner.label}</Badge>
                    {job.catalogCurrent === false ? <Badge color="violet" variant="light" mt={4}>Catalog stale</Badge> : null}
                  </Table.Td>
                  <Table.Td maw={400}>
                    <Stack gap={6}>
                      <Text size="sm" fw={600}>{job.reviewQuestion}</Text>
                      <Text size="xs" c="dimmed">{job.recommendedAction}</Text>
                      {job.catalogCurrent === false ? (
                        <Button
                          size="xs"
                          color="violet"
                          variant="light"
                          loading={isPending}
                          disabled={Boolean(pendingAction)}
                          onClick={() => void submitDecision(job, { action: 'REFRESH_CATALOG' })}
                        >
                          Requeue on current catalog
                        </Button>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td maw={500}>
                    <Stack gap={6}>
                      <Group gap={4} maw={480}>
                        {(job.reasonCodes.length ? job.reasonCodes : ['UNSPECIFIED']).map((reason) => (
                          <Badge key={reason} size="xs" color="orange" variant="light">
                            {labelForReason(reason)}
                          </Badge>
                        ))}
                      </Group>
                      {job.sourceSportLabels.length ? (
                        <Text size="sm" fw={600}>Source sport: {job.sourceSportLabels.join(', ')}</Text>
                      ) : null}
                      {job.rationale ? <Text size="sm">{job.rationale}</Text> : null}
                      {job.blockingIssues.map((issue) => (
                        <Text key={issue} size="xs" c="dimmed">• {issue}</Text>
                      ))}
                      {determinations.map((determination) => (
                        <Paper key={determination.determinationSha256} withBorder p="xs" radius="sm">
                          <Group gap="xs" mb={4}>
                            <Badge size="xs" color={determination.status === 'RESOLVED' ? 'teal' : determination.status === 'BLACKLISTED' ? 'gray' : 'orange'}>
                              {labelForReason(determination.status)}
                            </Badge>
                            <Text size="xs" c="dimmed">Determination {determination.determinationSha256.slice(0, 12)}…</Text>
                          </Group>
                          <Text size="xs"><strong>Source labels:</strong> {determination.sourceLabels.join(', ')}</Text>
                          {determination.canonicalSportNames.length ? (
                            <Text size="xs"><strong>Catalog sports:</strong> {determination.canonicalSportNames.join(', ')}</Text>
                          ) : null}
                          <Text size="xs">{determination.rationale}</Text>
                          {determination.evidence.map((citation) => (
                            <Stack key={`${citation.artifactId}-${citation.artifactSha256}-${citation.excerpt}`} gap={1} mt={4}>
                              <Text size="xs" c="dimmed">
                                {citation.artifactKind === 'PAGE_SCREENSHOT' ? 'Observation' : 'Excerpt'}: {citation.excerpt}
                              </Text>
                              <Group gap="xs">
                                <Text component="a" href={citation.pageUrl} target="_blank" rel="noreferrer" size="xs">
                                  Open source page
                                </Text>
                                <Text
                                  component="a"
                                  href={`/api/admin/affiliate-intakes/${encodeURIComponent(job.intakeId)}/artifacts/${encodeURIComponent(citation.artifactId)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  size="xs"
                                >
                                  Open stored artifact
                                </Text>
                                <Text size="xs" c="dimmed">SHA-256: {citation.artifactSha256}</Text>
                              </Group>
                            </Stack>
                          ))}
                        </Paper>
                      ))}
                      {!job.rationale && !job.blockingIssues.length && !determinations.length ? (
                        <Text size="sm" c="dimmed">{job.errorMessage || 'No structured explanation was recorded.'}</Text>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{job.attemptCount}</Table.Td>
                  <Table.Td>{formatDateTime(job.markedAt)}</Table.Td>
                  <Table.Td>
                    <Stack gap="xs">
                      <Group gap="xs" wrap="nowrap">
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<Eye size={14} />}
                          onClick={() => onReviewIntake(job.intakeId)}
                        >
                          View evidence
                        </Button>
                        {job.baseUrl ? (
                          <Button
                            component="a"
                            href={job.baseUrl}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                            variant="default"
                            leftSection={<ExternalLink size={14} />}
                          >
                            Source
                          </Button>
                        ) : null}
                      </Group>
                      {canResolve ? (
                        <Stack gap={5} mt={4}>
                          {unresolved.map((determination) => (
                            <MultiSelect
                              key={determination.determinationSha256}
                              label={`Select sport for ${determination.sourceLabels.join(', ')}`}
                              placeholder="Search exact catalog sports"
                              searchable
                              clearable
                              data={catalogOptions}
                              value={rowSelections[determination.determinationSha256] ?? []}
                              onChange={(value) => setSelections((current) => ({
                                ...current,
                                [job.jobId]: { ...(current[job.jobId] ?? {}), [determination.determinationSha256]: value },
                              }))}
                              size="xs"
                            />
                          ))}
                          <Textarea
                            label="Required rationale"
                            placeholder="Explain why the cited source evidence establishes these sports."
                            value={rationale}
                            onChange={(event) => setRationales((current) => ({ ...current, [job.jobId]: event.currentTarget.value }))}
                            minRows={2}
                            size="xs"
                          />
                          <Button
                            size="xs"
                            loading={isPending}
                            disabled={Boolean(pendingAction) || !rationale.trim() || unresolved.some((determination) => !(rowSelections[determination.determinationSha256] ?? []).length)}
                            onClick={() => void submitDecision(job, {
                              action: 'SELECT_SPORTS',
                              expectedCatalogSha256: job.currentCatalogSha256,
                              resolutions: unresolved.map((determination) => ({
                                determinationSha256: determination.determinationSha256,
                                canonicalSportNames: rowSelections[determination.determinationSha256] ?? [],
                              })),
                              rationale,
                            })}
                          >
                            Requeue with decision
                          </Button>
                        </Stack>
                      ) : null}
                      {blacklistedOnly && !job.humanSportResolution ? (
                        <Stack gap={5} mt={4}>
                          <Textarea
                            label="Exclusion rationale"
                            placeholder="Explain why this source remains excluded."
                            value={rationale}
                            onChange={(event) => setRationales((current) => ({ ...current, [job.jobId]: event.currentTarget.value }))}
                            minRows={2}
                            size="xs"
                          />
                          <Button
                            size="xs"
                            color="gray"
                            loading={isPending}
                            disabled={Boolean(pendingAction) || !rationale.trim()}
                            onClick={() => void submitDecision(job, {
                              action: 'CONFIRM_EXCLUSIONS',
                              determinationSha256s: determinations.map((determination) => determination.determinationSha256),
                              rationale,
                            })}
                          >
                            Confirm exclusions
                          </Button>
                        </Stack>
                      ) : null}
                      {job.humanSportResolution ? (
                        <Text size="xs" c="dimmed">
                          {job.humanSportResolution.state === 'CONSUMED' ? 'Decision consumed' : 'Decision pending'} by {job.humanSportResolution.decidedByUserId} on {formatDateTime(job.humanSportResolution.decidedAt)}: {job.humanSportResolution.rationale}
                        </Text>
                      ) : null}
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {!visibleJobs.length && !loading && !error ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="dimmed">
                    {jobs.length
                      ? 'No items match this review owner. Choose another filter to inspect the remaining terminal items.'
                      : 'No mapping jobs currently require human review.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
