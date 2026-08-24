/** @jest-environment node */

let idCounter = 0;
let currentResult: any = null;
let currentPolicy: any = null;
const queuedRuns: any[] = [];

const campaign = {
  id: 'campaign_1',
  name: 'Portland soccer sources',
  region: 'Portland, Oregon',
  location: 'Portland, Oregon',
  sportIds: ['sport_soccer'],
  sourceTypeHints: ['CLUB'],
  status: 'ACTIVE',
  autoCreateIntakes: true,
  searchIntervalMinutes: 10080,
  maxQueriesPerRun: 1,
  maxResultsPerQuery: 5,
  queryCursor: 0,
  metadata: {
    coveredCities: [
      { city: 'Portland', state: 'Oregon' },
      { city: 'Gresham', state: 'Oregon' },
    ],
  },
};

const prismaMock = {
  affiliateSourceDiscoveryCampaigns: {
    findUnique: jest.fn(async () => campaign),
    findMany: jest.fn(async () => []),
    update: jest.fn(async ({ data }) => ({ ...campaign, ...data })),
    updateMany: jest.fn(async () => ({ count: 1 })),
  },
  affiliateSourceDiscoveryRuns: {
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async ({ where }) => queuedRuns.find((run) => {
      const statusMatches = !where.status
        || (typeof where.status === 'string' ? where.status === run.status : where.status.in.includes(run.status));
      return (!where.id || run.id === where.id)
        && (!where.campaignId || run.campaignId === where.campaignId)
        && statusMatches;
    }) ?? null),
    updateMany: jest.fn(async ({ where, data }) => {
      const run = queuedRuns.find((entry) => entry.id === where.id && entry.status === where.status);
      if (!run) return { count: 0 };
      Object.assign(run, data, { attemptCount: (run.attemptCount ?? 0) + 1 });
      return { count: 1 };
    }),
    findUnique: jest.fn(async ({ where }) => queuedRuns.find((run) => run.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }) => {
      const run = queuedRuns.find((entry) => entry.id === where.id);
      Object.assign(run, data);
      return run;
    }),
    create: jest.fn(async ({ data }) => {
      const run = { ...data };
      queuedRuns.push(run);
      return run;
    }),
  },
  affiliateSourceDiscoveryResults: {
    groupBy: jest.fn(async () => []),
    findUnique: jest.fn(async ({ where }) => {
      if (where.id) return currentResult?.id === where.id ? currentResult : null;
      return currentResult?.campaignId === where.campaignId_urlKey.campaignId
        && currentResult?.urlKey === where.campaignId_urlKey.urlKey ? currentResult : null;
    }),
    findFirst: jest.fn(async ({ where }) => (
      currentResult?.policyKey === where.policyKey
      && currentResult?.matchingIntakeId ? { matchingIntakeId: currentResult.matchingIntakeId } : null
    )),
    create: jest.fn(async ({ data }) => {
      currentResult = { ...data };
      return currentResult;
    }),
    update: jest.fn(async ({ where, data }) => {
      if (currentResult?.id !== where.id) throw new Error('Result not found');
      currentResult = {
        ...currentResult,
        ...data,
        seenCount: data.seenCount?.increment
          ? currentResult.seenCount + data.seenCount.increment
          : data.seenCount ?? currentResult.seenCount,
      };
      return currentResult;
    }),
    findMany: jest.fn(async ({ where }) => {
      if (where?.latestRunId) {
        return currentResult?.latestRunId === where.latestRunId && currentResult?.matchingIntakeId
          ? [{ matchingIntakeId: currentResult.matchingIntakeId, status: currentResult.status }]
          : [];
      }
      return currentResult?.policyKey === where.policyKey && currentResult?.matchingIntakeId
        ? [{ id: currentResult.id, matchingIntakeId: currentResult.matchingIntakeId }]
        : [];
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      if (currentResult?.policyKey !== where.policyKey) return { count: 0 };
      if (where.status?.in && !where.status.in.includes(currentResult.status)) return { count: 0 };
      if (where.matchingIntakeId === null && currentResult.matchingIntakeId) return { count: 0 };
      if (where.matchingIntakeId?.not === null && !currentResult.matchingIntakeId) return { count: 0 };
      currentResult = { ...currentResult, ...data };
      return { count: 1 };
    }),
  },
  affiliateSourceDiscoveryQueryExecutions: {
    findMany: jest.fn(async () => []),
    upsert: jest.fn(async ({ create }) => create),
  },
  affiliateSourceDomainPolicies: {
    findUnique: jest.fn(async () => currentPolicy),
    create: jest.fn(async ({ data }) => {
      currentPolicy = { ...data };
      return currentPolicy;
    }),
    upsert: jest.fn(async ({ create, update }) => {
      currentPolicy = currentPolicy ? { ...currentPolicy, ...update } : { ...create };
      return currentPolicy;
    }),
  },
  affiliateSourceIntakes: {
    findUnique: jest.fn(async ({ where }) => where.id === 'intake_1' ? { id: 'intake_1' } : null),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
  affiliateSourceIntakePages: {
    findUnique: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
  affiliateSourceIntakeRuns: {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
  affiliateSourceMappingJobs: {
    findMany: jest.fn(async () => []),
  },
  affiliateCoverageAgentJobs: {
    findUnique: jest.fn(async () => null),
  },
  affiliateScrapeSources: { findFirst: jest.fn(async () => null) },
  organizations: { findFirst: jest.fn(async () => null) },
  sports: { findMany: jest.fn(async () => [{ id: 'sport_soccer', name: 'Soccer' }]) },
};

const createIntakeMock = jest.fn(async () => ({ id: 'intake_1' }));
const addPageMock = jest.fn(async () => ({}));
const queueIntakeMock = jest.fn();
const reviewPolicyMock = jest.fn();
const processIntakeMock = jest.fn();
const recoverStaleIntakesMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const mockPgClient = {
  connect: jest.fn(async () => undefined),
  query: jest.fn(async (sql: string) => ({
    rows: sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : [],
  })),
  end: jest.fn(async () => undefined),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => `generated_${++idCounter}` }));
jest.mock('@/lib/prismaConfig', () => ({ resolvePrismaPgPoolConfig: () => ({}) }));
jest.mock('pg', () => ({ Client: jest.fn(() => mockPgClient) }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));
jest.mock('@/server/affiliateImports/sourceIntake', () => ({
  createAffiliateSourceIntake: (...args: any[]) => createIntakeMock(...args),
  addAffiliateSourceIntakePage: (...args: any[]) => addPageMock(...args),
  queueAffiliateSourceIntakeRun: (...args: any[]) => queueIntakeMock(...args),
  reviewAffiliateSourceIntakePolicy: (...args: any[]) => reviewPolicyMock(...args),
  processNextAffiliateSourceIntakeRun: (...args: any[]) => processIntakeMock(...args),
  recoverStaleAffiliateSourceIntakeRuns: (...args: any[]) => recoverStaleIntakesMock(...args),
}));

import {
  applyAffiliateSourceDomainPolicy,
  listAffiliateSourceDiscoveryCampaigns,
  processNextAffiliateSourceDiscoveryRun,
  queueAffiliateSourceDiscoveryRun,
  queueDueAffiliateSourceDiscoveryRuns,
  runAffiliateIntakeAutomation,
  runAffiliateReplenishmentCampaignWave,
} from '@/server/affiliateImports/sourceDiscovery';

describe('affiliate source discovery orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    currentResult = null;
    currentPolicy = null;
    mockPgClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : [],
    }));
    campaign.maxQueriesPerRun = 1;
    campaign.queryCursor = 0;
    campaign.sourceTypeHints = ['CLUB'];
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceDiscoveryRuns.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceDiscoveryResults.groupBy.mockResolvedValue([]);
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([]);
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    recoverStaleIntakesMock.mockResolvedValue([]);
    queuedRuns.splice(0, queuedRuns.length,
      { id: 'run_1', campaignId: campaign.id, requestedByUserId: 'admin_1', status: 'QUEUED', queuedAt: new Date(), attemptCount: 0 },
      { id: 'run_2', campaignId: campaign.id, requestedByUserId: 'admin_1', status: 'QUEUED', queuedAt: new Date(), attemptCount: 0 },
    );
  });

  it('reuses a deterministic replenishment discovery run reservation', async () => {
    queuedRuns.splice(0, queuedRuns.length);

    const first = await queueAffiliateSourceDiscoveryRun(
      campaign.id,
      'affiliate-replenishment',
      'affiliate-replenishment-discovery-wave_1',
    );
    const second = await queueAffiliateSourceDiscoveryRun(
      campaign.id,
      'affiliate-replenishment',
      'affiliate-replenishment-discovery-wave_1',
    );

    expect(second).toBe(first);
    expect(first).toEqual(expect.objectContaining({
      id: 'affiliate-replenishment-discovery-wave_1',
      campaignId: campaign.id,
      status: 'QUEUED',
    }));
    expect(prismaMock.affiliateSourceDiscoveryRuns.create).toHaveBeenCalledTimes(1);
  });
  it('aggregates campaign result counts in the database', async () => {
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([
      { ...campaign, id: 'campaign_1' },
      { ...campaign, id: 'campaign_2', name: 'Portland rental sources' },
    ]);
    prismaMock.affiliateSourceDiscoveryResults.groupBy.mockResolvedValue([
      { campaignId: 'campaign_1', status: 'NEW', _count: { _all: 7 } },
      { campaignId: 'campaign_1', status: 'REVIEW_REQUIRED', _count: { _all: 2 } },
      { campaignId: 'campaign_2', status: 'INTAKE_CREATED', _count: { _all: 5 } },
    ]);
    prismaMock.affiliateSourceDiscoveryRuns.findMany.mockResolvedValue([
      { id: 'run_latest', campaignId: 'campaign_1', createdAt: new Date('2026-08-02') },
      { id: 'run_old', campaignId: 'campaign_1', createdAt: new Date('2026-08-01') },
    ]);

    const rows = await listAffiliateSourceDiscoveryCampaigns();

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'campaign_2',
        statusCounts: { INTAKE_CREATED: 5 },
        latestRun: null,
      }),
      expect.objectContaining({
        id: 'campaign_1',
        statusCounts: { NEW: 7, REVIEW_REQUIRED: 2 },
        latestRun: expect.objectContaining({ id: 'run_latest' }),
      }),
    ]);
    expect(prismaMock.affiliateSourceDiscoveryResults.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['campaignId', 'status'],
      _count: { _all: true },
    }));
  });
  it('persists one exact query-execution row per query and records provider failures as failed', async () => {
    const searchSources = jest.fn()
      .mockResolvedValueOnce({
        provider: 'TEST_PROVIDER',
        request: { query: 'Portland Oregon Soccer clubs' },
        response: { web: [] },
        rows: [],
        estimatedCredits: 1,
      })
      .mockRejectedValueOnce(new Error('HTTP 503 from provider'));
    const searchClient = { provider: 'TEST_PROVIDER', searchSources };
    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { searchClient });
    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_2' }, { searchClient });

    expect(prismaMock.affiliateSourceDiscoveryQueryExecutions.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.affiliateSourceDiscoveryQueryExecutions.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          runId: 'run_1',
          campaignId: 'campaign_1',
          cityGeoid: expect.any(String),
          sportId: 'sport_soccer',
          profileKey: 'clubs-programs',
          strategyKey: 'legacy-web-v1',
          strategyFamilyKey: 'legacy-web',
          provider: 'TEST_PROVIDER',
          status: 'SUCCEEDED',
          returnedResultCount: 0,
          newQualifiedPolicyKeyCount: 0,
        }),
      }),
    );
    expect(prismaMock.affiliateSourceDiscoveryQueryExecutions.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          runId: 'run_2',
          provider: 'TEST_PROVIDER',
          status: 'FAILED',
          returnedResultCount: 0,
          newQualifiedPolicyKeyCount: 0,
          errorCode: 'HTTP_5XX',
        }),
      }),
    );
  });

  it('reuses one discovery result and one intake while unknown policy prevents capture', async () => {
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({
        request: { sources: ['web'], limit: 5 },
        response: { web: [{ url: 'https://portland-soccer.example.test/tryouts' }] },
        rows: [{
          url: 'https://portland-soccer.example.test/tryouts',
          title: 'Portland Oregon Soccer Club Tryouts Registration 2026',
          description: 'Official Portland soccer club registration and tryouts.',
          category: 'web',
        }],
        providerJobId: 'search_1',
      })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };
    const fetchResource = jest.fn(async () => ({
      statusCode: 200,
      body: Buffer.from('User-agent: *\nDisallow:'),
    }));

    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { firecrawlClient, fetchResource });
    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_2' }, { firecrawlClient, fetchResource });

    expect(currentResult).toMatchObject({
      seenCount: 2,
      matchingIntakeId: 'intake_1',
      status: 'REVIEW_REQUIRED',
    });
    expect(createIntakeMock).toHaveBeenCalledTimes(1);
    expect(addPageMock).toHaveBeenCalledTimes(1);
    expect(currentPolicy).toMatchObject({ status: 'NEEDS_REVIEW' });
    expect(queueIntakeMock).not.toHaveBeenCalled();
    expect(processIntakeMock).not.toHaveBeenCalled();
    expect(firecrawlClient.scrapeSourcePage).not.toHaveBeenCalled();
    expect(firecrawlClient.searchSources).toHaveBeenCalledWith(
      expect.stringContaining('Portland, Oregon'),
      expect.objectContaining({ location: 'Portland, Oregon' }),
    );
    expect(prismaMock.affiliateSourceDiscoveryResults.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        campaignId: campaign.id,
        policyKey: 'example.test',
      }),
    }));
    expect(prismaMock.affiliateSourceIntakes.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        region: campaign.region,
        baseUrl: expect.objectContaining({ in: expect.any(Array) }),
      }),
    }));
    expect(prismaMock.organizations.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        website: expect.objectContaining({ in: expect.any(Array) }),
      },
    }));
  });

  it('does not auto-create an intake for an intermediary even when its keyword score is high', async () => {
    const searchClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [{
          url: 'https://www.yelp.com/search?find_desc=Soccer+League&find_loc=Portland%2C+OR',
          title: 'Portland Oregon Soccer League Events Registration 2026',
          description: 'Find sports clubs, schedules, registration, and events.',
          category: 'web',
        }],
        providerJobId: null,
      })),
    };

    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { searchClient });

    expect(currentResult).toMatchObject({
      status: 'REVIEW_REQUIRED',
      matchingIntakeId: null,
    });
    expect(currentResult.reasonCodes).toContain('INTERMEDIARY_SOURCE');
    expect(createIntakeMock).not.toHaveBeenCalled();
    expect(queuedRuns[0].summary).toEqual(expect.objectContaining({
      outcomes: expect.objectContaining({
        newReview: 1,
        autoIntakeCreated: 0,
      }),
    }));
  });

  it('blocks a new result before an intake exists', async () => {
    currentResult = {
      id: 'result_1',
      policyKey: 'example.test',
      status: 'NEW',
      matchingIntakeId: null,
    };

    await applyAffiliateSourceDomainPolicy('example.test', {
      status: 'BLOCKED',
      restrictionNotes: 'Public policy prohibits automated access.',
    }, 'admin_1');

    expect(currentResult.status).toBe('BLOCKED');
    expect(currentPolicy).toMatchObject({ status: 'BLOCKED' });
    expect(createIntakeMock).not.toHaveBeenCalled();
    expect(queueIntakeMock).not.toHaveBeenCalled();
  });

  it('allows and queues a directory child intake without a discovery-result link', async () => {
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([
      { id: 'directory_child_1', baseUrl: 'https://club.example.test' },
    ]);
    prismaMock.affiliateSourceIntakePages.findMany.mockImplementation(async ({ where }: any) => (
      where?.intakeId === 'directory_child_1'
        ? [{ id: 'page_child_1' }]
        : [{ intakeId: 'directory_child_1', canonicalUrl: 'https://club.example.test/events' }]
    ));

    const result = await applyAffiliateSourceDomainPolicy('example.test', {
      status: 'ALLOWED',
      termsUrl: 'https://club.example.test/terms',
      robotsSummary: 'Public listing pages are crawlable.',
    }, 'codex-luna-approval-vm-1');

    expect(result.intakeIds).toEqual(['directory_child_1']);
    expect(reviewPolicyMock).toHaveBeenCalledWith(
      'directory_child_1',
      expect.objectContaining({ complianceStatus: 'ALLOWED' }),
      'codex-luna-approval-vm-1',
      { db: prismaMock },
    );
    expect(queueIntakeMock).toHaveBeenCalledWith(
      'directory_child_1',
      ['page_child_1'],
      'codex-luna-approval-vm-1',
      { db: prismaMock },
    );
  });

  it('does not advance the campaign query cursor when every provider query fails', async () => {
    const firecrawlClient = {
      searchSources: jest.fn(async () => {
        throw new Error('Invalid request body');
      }),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };

    const result = await processNextAffiliateSourceDiscoveryRun(
      { runId: 'run_1' },
      { firecrawlClient },
    );

    expect(result?.run.status).toBe('FAILED');
    expect(prismaMock.affiliateSourceDiscoveryCampaigns.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ queryCursor: 0 }),
    }));
  });

  it('queues only the highest-priority due location', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([
      { ...campaign, id: 'campaign_2', name: 'Los Angeles', metadata: { priorityRank: 2 } },
      { ...campaign, id: 'campaign_1', name: 'New York', metadata: { priorityRank: 1 } },
    ]);

    await expect(queueDueAffiliateSourceDiscoveryRuns(new Date('2026-07-21T12:00:00Z'))).resolves.toBe(1);
    expect(queuedRuns).toHaveLength(1);
    expect(queuedRuns[0].campaignId).toBe('campaign_1');
  });

  it('skips a due campaign with an active run and queues the next campaign', async () => {
    queuedRuns.splice(0, queuedRuns.length, {
      id: 'active_run',
      campaignId: 'campaign_1',
      status: 'RUNNING',
      queuedAt: new Date('2026-07-21T10:00:00Z'),
    });
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([
      { ...campaign, id: 'campaign_1', name: 'Highest priority', metadata: { priorityRank: 1 } },
      { ...campaign, id: 'campaign_2', name: 'Next priority', metadata: { priorityRank: 2 } },
    ]);

    await expect(queueDueAffiliateSourceDiscoveryRuns(new Date('2026-07-21T12:00:00Z'))).resolves.toBe(1);
    expect(queuedRuns).toHaveLength(2);
    expect(queuedRuns[1]).toEqual(expect.objectContaining({
      campaignId: 'campaign_2',
      status: 'QUEUED',
    }));
  });

  it('fails stale discovery runs, makes their campaigns due, and does not recover them twice', async () => {
    const now = new Date('2026-08-06T12:00:00Z');
    const staleRun = {
      id: 'stale_discovery_run',
      campaignId: 'campaign_1',
      status: 'RUNNING',
      startedAt: new Date('2026-08-06T09:00:00Z'),
      workerId: 'dead-worker',
      summary: { prior: true },
    };
    prismaMock.affiliateSourceDiscoveryRuns.findMany.mockResolvedValue([staleRun]);
    prismaMock.affiliateSourceDiscoveryRuns.updateMany.mockResolvedValueOnce({ count: 1 });

    const { recoverStaleAffiliateSourceDiscoveryRuns } = await import('@/server/affiliateImports/sourceDiscovery');
    await expect(recoverStaleAffiliateSourceDiscoveryRuns({
      now,
      maxAgeMs: 60 * 60 * 1000,
    })).resolves.toEqual([expect.objectContaining({
      discoveryRunId: 'stale_discovery_run',
      campaignId: 'campaign_1',
      reason: expect.stringContaining('Recovered stale affiliate source discovery run'),
    })]);
    expect(prismaMock.affiliateSourceDiscoveryRuns.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stale_discovery_run', status: 'RUNNING' },
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: expect.stringContaining('60 minute limit'),
      }),
    }));
    expect(prismaMock.affiliateSourceDiscoveryCampaigns.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign_1' },
      data: { nextRunAt: now },
    });

    prismaMock.affiliateSourceDiscoveryRuns.findMany.mockResolvedValue([]);
    await expect(recoverStaleAffiliateSourceDiscoveryRuns({ now })).resolves.toEqual([]);
  });

  it('continues an incomplete due campaign within the same automation run', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([campaign]);
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [],
        providerJobId: null,
      })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };
    const now = new Date('2026-07-21T12:00:00Z');

    const result = await runAffiliateIntakeAutomation(
      { discoveryLimit: 3, intakeLimit: 1, sendSummary: false },
      { firecrawlClient, now: () => now },
    );

    expect(result.queuedCampaigns).toBe(3);
    expect(result.discoveryRuns).toHaveLength(3);
    expect(firecrawlClient.searchSources).toHaveBeenCalledTimes(3);
  });
  it('does not create daily discovery quota work in demand-driven mode', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([campaign]);

    const result = await runAffiliateIntakeAutomation(
      { discoveryLimit: 1, intakeLimit: 1, isDemandDriven: true, sendSummary: false },
      { now: () => new Date('2026-07-21T12:00:00Z') },
    );

    expect(result.queuedCampaigns).toBe(0);
    expect(result.discoveryRuns).toHaveLength(0);
    expect(queuedRuns).toHaveLength(0);
  });


  it('does not email from the frequent intake worker unless explicitly requested', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([campaign]);
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [],
        providerJobId: null,
      })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };

    const result = await runAffiliateIntakeAutomation(
      { discoveryLimit: 1, intakeLimit: 1 },
      { firecrawlClient, now: () => new Date('2026-07-21T12:00:00Z') },
    );

    expect(result.discoveryRuns).toHaveLength(1);
    expect(result.emailSent).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('recovers stale capture leases before processing the normal intake queue', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    recoverStaleIntakesMock.mockResolvedValue([{
      staleRunId: 'stale_1',
      replacementRunId: 'replacement_1',
      intakeId: 'intake_1',
    }]);
    processIntakeMock.mockResolvedValue(null);

    const result = await runAffiliateIntakeAutomation(
      { discoveryLimit: 1, intakeLimit: 1, sendSummary: false },
      { now: () => new Date('2026-08-02T01:30:00.000Z') },
    );

    expect(result.recoveredIntakeRuns).toEqual([expect.objectContaining({
      staleRunId: 'stale_1',
      replacementRunId: 'replacement_1',
    })]);
    expect(recoverStaleIntakesMock.mock.invocationCallOrder[0]).toBeLessThan(
      processIntakeMock.mock.invocationCallOrder[0],
    );
  });

  it('makes an incomplete location query cycle immediately due again', async () => {
    campaign.maxQueriesPerRun = 2;
    campaign.sourceTypeHints = ['CLUB', 'TRYOUT'];
    const now = new Date('2026-07-21T12:00:00Z');
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({ request: {}, response: {}, rows: [], providerJobId: null })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };

    await processNextAffiliateSourceDiscoveryRun(
      { runId: 'run_1' },
      { firecrawlClient, now: () => now },
    );

    expect(prismaMock.affiliateSourceDiscoveryCampaigns.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ queryCursor: 2, nextRunAt: now }),
    }));
  });

  it('retains the strongest evaluation when one URL appears in multiple queries in the same run', async () => {
    campaign.autoCreateIntakes = false;
    campaign.maxQueriesPerRun = 2;
    campaign.sourceTypeHints = ['RENTAL'];
    campaign.sportIds = ['sport_grass_soccer', 'sport_hockey'];
    campaign.metadata = {
      coveredCities: [{ city: 'Portland', state: 'Oregon' }],
    };
    prismaMock.sports.findMany.mockResolvedValueOnce([
      { id: 'sport_grass_soccer', name: 'Grass Soccer' },
      { id: 'sport_hockey', name: 'Hockey' },
    ]);
    const searchClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [{
          url: 'https://rentals.example.test/portland/reservations/soccer-fields',
          title: 'Soccer Fields For Rent In Portland, Oregon',
          description: 'Reserve an outdoor soccer field online.',
          category: 'web',
        }],
        providerJobId: null,
      })),
    };

    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { searchClient });

    expect(searchClient.searchSources).toHaveBeenCalledTimes(2);
    expect(currentResult).toMatchObject({
      status: 'NEW',
      score: expect.any(Number),
      sourceTypeHints: expect.arrayContaining(['RENTAL']),
      sportHints: expect.arrayContaining(['sport_grass_soccer']),
      latestQuery: expect.stringContaining('outdoor soccer'),
      seenCount: 2,
    });
    expect(currentResult.score).toBeGreaterThanOrEqual(75);
    expect(currentResult.reasonCodes).toEqual(expect.arrayContaining([
      'SELECTED_SPORT',
      'PROFILE_ALIGNED',
      'AUTO_PROMOTION_ELIGIBLE',
    ]));
  });
  it('pauses a wave when terminal coverage planning has no campaign', async () => {
    prismaMock.affiliateCoverageAgentJobs.findUnique.mockResolvedValueOnce({
      id: 'coverage_1',
      status: 'SUCCEEDED',
      result: {},
      errorMessage: null,
    });

    const result = await runAffiliateReplenishmentCampaignWave({
      wave: {
        id: 'wave_1',
        campaignId: null,
        coveragePlanningJobId: 'coverage_1',
        resultJson: {},
      },
      demand: { id: 'demand_1' },
      contract: { version: 1, hash: 'contract-hash' },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'PAUSED',
      provider: 'COVERAGE_PLANNER',
      providerOperationKey: 'affiliate-replenishment:coverage:coverage_1',
      errorCode: 'COVERAGE_PLANNING_NO_CAMPAIGN',
    }));
    expect(result.result).toEqual(expect.objectContaining({
      coveragePlanningJobId: 'coverage_1',
      status: 'SUCCEEDED',
    }));
    expect(prismaMock.affiliateSourceDiscoveryRuns.findFirst).not.toHaveBeenCalled();
  });
  it('keeps a replenishment wave open while capture is still active', async () => {
    queuedRuns.splice(0, queuedRuns.length, {
      id: 'wave-discovery-run',
      campaignId: campaign.id,
      status: 'SUCCEEDED',
      summary: {},
      errorMessage: null,
    });
    prismaMock.affiliateSourceDiscoveryResults.findMany.mockResolvedValue([
      { matchingIntakeId: 'intake_1', status: 'INTAKE_CREATED' },
    ]);
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([
      { id: 'intake_1', status: 'CAPTURED' },
    ]);
    prismaMock.affiliateSourceIntakeRuns.findMany.mockResolvedValue([
      { id: 'capture_1', intakeId: 'intake_1', status: 'RUNNING', errorMessage: null },
    ]);
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([]);

    const result = await runAffiliateReplenishmentCampaignWave({
      wave: {
        id: 'wave_1',
        campaignId: campaign.id,
        resultJson: { discoveryRunId: 'wave-discovery-run' },
      },
      demand: { id: 'demand_1' },
      contract: { version: 1, hash: 'contract-hash' },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'WAITING',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: 'affiliate-replenishment:discovery:wave-discovery-run',
    }));
    expect(result.result).toEqual(expect.objectContaining({
      discoveryRunId: 'wave-discovery-run',
      waitingFor: 'capture:intake_1',
    }));
  });
  it('retries partial discovery results with provider errors without zero yield', async () => {
    queuedRuns.splice(0, queuedRuns.length, {
      id: 'wave-discovery-run',
      campaignId: campaign.id,
      status: 'PARTIAL',
      summary: { errors: [{ query: 'Portland soccer', message: 'provider timeout' }] },
      errorMessage: null,
    });
    currentResult = {
      id: 'result_1',
      campaignId: campaign.id,
      latestRunId: 'wave-discovery-run',
      matchingIntakeId: 'intake_1',
      status: 'INTAKE_CREATED',
    };

    const result = await runAffiliateReplenishmentCampaignWave({
      wave: {
        id: 'wave_1',
        campaignId: campaign.id,
        resultJson: { discoveryRunId: 'wave-discovery-run' },
      },
      demand: { id: 'demand_1' },
      contract: { version: 1, hash: 'contract-hash' },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'FAILED',
      provider: 'AFFILIATE_DISCOVERY',
      marginalYield: null,
      errorCode: 'DISCOVERY_PROVIDER_FAILURE',
      retryAt: expect.any(Date),
    }));
    expect(result.result).toEqual(expect.objectContaining({
      discoveryRunId: 'wave-discovery-run',
      intakeIds: ['intake_1'],
    }));
  });
  it('executes one queued capture before reporting replenishment yield', async () => {
    queuedRuns.splice(0, queuedRuns.length, {
      id: 'wave-discovery-run',
      campaignId: campaign.id,
      status: 'SUCCEEDED',
      summary: {},
      errorMessage: null,
    });
    currentResult = {
      id: 'result_1',
      campaignId: campaign.id,
      latestRunId: 'wave-discovery-run',
      matchingIntakeId: 'intake_1',
      policyKey: 'example.test',
    };
    prismaMock.affiliateSourceDiscoveryResults.findMany.mockResolvedValue([
      { matchingIntakeId: 'intake_1', status: 'INTAKE_CREATED' },
    ]);
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([
      { id: 'intake_1', status: 'CAPTURED' },
    ]);
    prismaMock.affiliateSourceIntakeRuns.findMany
      .mockResolvedValueOnce([
        { id: 'capture_1', intakeId: 'intake_1', status: 'QUEUED', errorMessage: null },
      ])
      .mockResolvedValueOnce([
        { id: 'capture_1', intakeId: 'intake_1', status: 'SUCCEEDED', errorMessage: null },
      ]);
    prismaMock.affiliateSourceMappingJobs.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'mapping_1', intakeId: 'intake_1', status: 'QUEUED' },
      ]);
    processIntakeMock.mockResolvedValueOnce({
      run: { id: 'capture_1', status: 'SUCCEEDED' },
    });

    const result = await runAffiliateReplenishmentCampaignWave({
      wave: {
        id: 'wave_1',
        campaignId: campaign.id,
        resultJson: { discoveryRunId: 'wave-discovery-run' },
      },
      demand: { id: 'demand_1' },
      contract: { version: 1, hash: 'contract-hash' },
    }, {
      workerId: 'replenishment-worker',
    });

    expect(processIntakeMock).toHaveBeenCalledWith(
      { runId: 'capture_1', workerId: 'replenishment-worker' },
      { workerId: 'replenishment-worker' },
    );

    expect(result).toEqual(expect.objectContaining({
      status: 'SUCCEEDED',
      marginalYield: 1,
      provider: 'AFFILIATE_DISCOVERY',
    }));
    expect(result.result).toEqual(expect.objectContaining({
      discoveryRunId: 'wave-discovery-run',
      mappingJobIds: ['mapping_1'],
    }));
  });
});
