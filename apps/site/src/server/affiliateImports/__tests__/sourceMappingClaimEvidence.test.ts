/** @jest-environment node */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const prismaMock = {};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => 'generated-job' }));

import {
  buildAffiliateSportsCatalogSnapshot,
} from '../affiliateSportsCatalog';
import {
  acquireAffiliateSourceMappingClaimEvidence,
} from '../sourceMappingClaimEvidence';
import {
  storeAffiliateSourceMappingClaimEvidenceContext,
} from '../sourceMappingQueue';

type Job = {
  id: string;
  intakeId: string;
  status: string;
  createdAt: Date;
  resultSummary: Record<string, unknown> | null;
  workerId?: string | null;
  claimedAt?: Date | null;
  leaseExpiresAt?: Date | null;
  attemptCount?: number;
};

type Intake = {
  id: string;
  sourceKey: string;
  name: string;
  baseUrl: string;
  status: string;
  complianceStatus: string;
};

const claimHandle = {
  jobId: 'job-1',
  workerId: 'worker-1',
  claimedAt: '2026-08-10T00:00:00.000Z',
} as const;

const catalog = buildAffiliateSportsCatalogSnapshot([
  { id: 'sport-1', name: 'Grass Soccer' },
], '2026-08-10T00:00:00.000Z');

const sourceContext = {
  intake: {
    id: 'intake-1',
    sourceKey: 'example-sports',
    name: 'Example Sports',
    baseUrl: 'https://example.test',
    complianceStatus: 'ALLOWED',
  },
  pages: [{
    id: 'page-1',
    url: 'https://example.test/sports',
    role: 'LISTING',
    robotsStatus: 'ALLOWED',
  }],
  runs: [{
    id: 'run-1',
    status: 'SUCCEEDED',
    provider: 'FIRECRAWL',
    finishedAt: '2026-08-09T23:00:00.000Z',
  }],
  selectedRunId: 'run-1',
  artifacts: [{
    id: 'artifact-1',
    kind: 'PAGE_HTML',
    sourceUrl: 'https://example.test/sports',
    contentHash: 'a'.repeat(64),
  }],
  policyKey: null,
  domainPolicy: null,
  relatedDiscoveryResults: [],
};

const makeDb = () => {
  const job: Job = {
    id: claimHandle.jobId,
    intakeId: 'intake-1',
    status: 'QUEUED',
    createdAt: new Date('2026-08-09T22:00:00.000Z'),
    resultSummary: null,
  };
  const intake: Intake = {
    id: 'intake-1',
    sourceKey: 'example-sports',
    name: 'Example Sports',
    baseUrl: 'https://example.test',
    status: 'READY_FOR_MAPPING',
    complianceStatus: 'ALLOWED',
  };
  const jobs = {
    findFirst: jest.fn(async ({ where }: any) => {
      if (where?.status === 'CLAIMED') {
        return job.status === 'CLAIMED'
          && job.workerId === where.workerId
          && job.leaseExpiresAt instanceof Date
          && job.leaseExpiresAt.getTime() >= Date.now()
          ? job
          : null;
      }
      if (where?.OR) return job.status === 'QUEUED' ? job : null;
      return null;
    }),
    findUnique: jest.fn(async () => job),
    create: jest.fn(async ({ data }: any) => {
      Object.assign(job, data);
      return job;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (where.id !== job.id) return { count: 0 };
      const matchesClaim = where.status === 'CLAIMED'
        && job.status === 'CLAIMED'
        && job.workerId === where.workerId
        && job.claimedAt?.getTime() === where.claimedAt?.getTime()
        && job.leaseExpiresAt instanceof Date
        && (!where.leaseExpiresAt?.gte || job.leaseExpiresAt.getTime() >= where.leaseExpiresAt.gte.getTime());
      const matchesQueued = Array.isArray(where.OR)
        && job.status === 'QUEUED';
      if (!matchesClaim && !matchesQueued) return { count: 0 };
      if (data.status) job.status = data.status;
      if (data.workerId !== undefined) job.workerId = data.workerId;
      if (data.claimedAt !== undefined) job.claimedAt = data.claimedAt;
      if (data.leaseExpiresAt !== undefined) job.leaseExpiresAt = data.leaseExpiresAt;
      if (data.attemptCount?.increment) job.attemptCount = (job.attemptCount ?? 0) + data.attemptCount.increment;
      if (data.resultSummary !== undefined) job.resultSummary = data.resultSummary;
      return { count: 1 };
    }),
    update: jest.fn(async ({ data }: any) => {
      Object.assign(job, data);
      return job;
    }),
  };
  const intakes = {
    findUnique: jest.fn(async () => intake),
    findFirst: jest.fn(async () => intake),
    update: jest.fn(async ({ data }: any) => {
      Object.assign(intake, data);
      return intake;
    }),
  };
  return {
    affiliateSourceMappingJobs: jobs,
    affiliateSourceIntakes: intakes,
    affiliateApprovalJobs: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    job,
    intake,
  };
};

const dependenciesFor = (root: string, overrides: Record<string, unknown> = {}) => ({
  db: undefined,
  outputRoot: root,
  now: () => new Date('2026-08-10T00:00:00.000Z'),
  loadCatalog: async () => catalog,
  loadContext: async () => sourceContext,
  readArtifact: async () => ({
    object: { stream: Readable.from(['<html>Grass Soccer</html>']) },
    file: { originalName: 'sports.html', mimeType: 'text/html', sizeBytes: 28 },
    artifact: { contentHash: 'a'.repeat(64) },
  }),
  ...overrides,
});

describe('affiliate source mapping claim evidence boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists the exact claim generation, selected run, and catalog snapshot', async () => {
    const db = makeDb();
    const root = await mkdtemp(path.join(os.tmpdir(), 'affiliate-claim-evidence-'));
    try {
      const result = await acquireAffiliateSourceMappingClaimEvidence({
        workerId: claimHandle.workerId,
        outputDirectory: path.join(root, 'evidence'),
        environment: 'local',
      }, { ...dependenciesFor(root), db });

      expect(result).toEqual(expect.objectContaining({
        jobId: claimHandle.jobId,
        intakeId: 'intake-1',
        runId: 'run-1',
        sportsCatalog: catalog,
      }));
      expect(result?.sportsCatalog.sha256).toBe(catalog.sha256);
      expect(result?.claimHandle).toEqual(claimHandle);
      expect(result?.claimEvidenceContext).toEqual(expect.objectContaining({
        jobId: claimHandle.jobId,
        workerId: claimHandle.workerId,
        claimedAt: claimHandle.claimedAt,
        evidenceRunId: 'run-1',
        sportsCatalogSha256: catalog.sha256,
        artifactIds: ['artifact-1'],
      }));
      expect(db.job.resultSummary).toEqual(expect.objectContaining({
        claimEvidenceContext: expect.objectContaining({
          jobId: claimHandle.jobId,
          workerId: claimHandle.workerId,
          sportsCatalogSha256: catalog.sha256,
        }),
      }));
      expect(db.job.status).toBe('CLAIMED');
      expect(db.intake.status).toBe('READY_FOR_MAPPING');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects persistence when the claim generation no longer owns the row', async () => {
    const db = makeDb();
    db.job.status = 'REVIEW_REQUIRED';
    const context = {
      schemaVersion: 1,
      jobId: claimHandle.jobId,
      intakeId: 'intake-1',
      workerId: claimHandle.workerId,
      claimedAt: claimHandle.claimedAt,
      evidenceRunId: 'run-1',
      sportsCatalogSha256: catalog.sha256,
      sportsCatalog: catalog,
      sourceEvidence: {},
      artifactIds: [],
    };

    await expect(storeAffiliateSourceMappingClaimEvidenceContext({
      claimHandle,
      context,
      db,
    })).rejects.toThrow('stale or no longer owned');
    expect(db.job.resultSummary).toBeNull();
  });

  it('releases the exact claim when catalog or artifact acquisition fails', async () => {
    const db = makeDb();
    const root = await mkdtemp(path.join(os.tmpdir(), 'affiliate-claim-evidence-'));
    try {
      await expect(acquireAffiliateSourceMappingClaimEvidence({
        workerId: claimHandle.workerId,
        outputDirectory: path.join(root, 'evidence'),
        environment: 'local',
      }, {
        ...dependenciesFor(root),
        db,
        loadCatalog: async () => {
          throw new Error('catalog unavailable');
        },
      })).rejects.toThrow('catalog unavailable');

      expect(db.job.status).toBe('QUEUED');
      expect(db.job.workerId).toBeNull();
      expect(db.job.claimedAt).toBeNull();
      expect(db.job.leaseExpiresAt).toBeNull();
      expect(db.intake.status).toBe('READY_FOR_MAPPING');
      expect(db.job.resultSummary).not.toHaveProperty('claimEvidenceContext');
      expect(db.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          id: claimHandle.jobId,
          status: 'CLAIMED',
          workerId: claimHandle.workerId,
        }),
        data: expect.objectContaining({
          status: 'QUEUED',
          workerId: null,
          claimedAt: null,
          leaseExpiresAt: null,
        }),
      }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
