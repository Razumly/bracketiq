/** @jest-environment node */

import { buildAffiliateSportsCatalogSnapshot } from '../affiliateSportsCatalog';
import { affiliateSportDeterminationSha256 } from '../affiliateSportDetermination';

const prismaMock = {
  affiliateSourceMappingJobs: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  affiliateSourceIntakes: { update: jest.fn() },
  affiliateApprovalJobs: { findUnique: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  resolveAffiliateMappingSportDecision,
  AffiliateMappingSportResolutionConflictError,
} from '../sourceMappingHumanReview';

const catalog = buildAffiliateSportsCatalogSnapshot([
  { id: 'sport_indoor_soccer', name: 'Indoor Soccer' },
  { id: 'sport_futsal', name: 'Futsal' },
], '2026-08-10T12:00:00.000Z');

const unresolvedDetermination = {
  sourceLabels: ['Soccer'],
  status: 'VARIANT_UNRESOLVED' as const,
  resolutionBasis: 'SOURCE_EVIDENCE' as const,
  canonicalSportNames: [],
  rationale: 'The source says Soccer but does not establish the surface.',
  evidence: [{
    artifactId: 'artifact_1',
    artifactSha256: 'a'.repeat(64),
    artifactKind: 'PAGE_HTML' as const,
    pageUrl: 'https://source.example/sports',
    excerpt: 'Soccer',
  }],
};
const determinationSha256 = affiliateSportDeterminationSha256(unresolvedDetermination);

const job = {
  id: 'mapping_1',
  intakeId: 'intake_1',
  status: 'HUMAN_REVIEW_REQUIRED',
  sourceId: null,
  mappingId: null,
  resultSummary: {
    claimEvidenceContext: { sportsCatalog: catalog },
    humanReviewRequired: {
      reasonCodes: ['SPORT_VARIANT_UNRESOLVED'],
      sourceSportLabels: ['Soccer'],
    },
    sportDeterminations: [unresolvedDetermination],
  },
};

const dependencies = () => ({
  database: prismaMock,
  catalogLoader: async () => catalog,
  now: () => new Date('2026-08-10T13:00:00.000Z'),
});

describe('resolveAffiliateMappingSportDecision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue(job);
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({ id: 'intake_1', status: 'READY_FOR_MAPPING' });
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue(null);
  });

  it('stores authenticated per-determination selections and requeues the same job', async () => {
    await resolveAffiliateMappingSportDecision({
      action: 'SELECT_SPORTS',
      jobId: 'mapping_1',
      actorUserId: 'admin_1',
      expectedCatalogSha256: catalog.sha256,
      resolutions: [{ determinationSha256, canonicalSportNames: ['Indoor Soccer'] }],
      rationale: 'Indoor-board wording in the stored source page establishes Indoor Soccer.',
    }, dependencies());

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'mapping_1', status: 'HUMAN_REVIEW_REQUIRED', sourceId: null, mappingId: null },
      data: expect.objectContaining({ status: 'QUEUED', resultSummary: expect.objectContaining({
        humanSportResolution: expect.objectContaining({
          state: 'PENDING',
          decidedByUserId: 'admin_1',
          catalogSha256: catalog.sha256,
          resolutions: [{ determinationSha256, sourceLabels: ['Soccer'], canonicalSportNames: ['Indoor Soccer'] }],
        }),
        sportResolutionHistory: [expect.objectContaining({
          action: 'SELECT_SPORTS',
          priorResultSummary: expect.objectContaining({ historyPrefixes: [] }),
        })],
      }) }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { status: 'READY_FOR_MAPPING' },
    });
  });

  it('rejects a stale expected catalog before queue mutation', async () => {
    await expect(resolveAffiliateMappingSportDecision({
      action: 'SELECT_SPORTS',
      jobId: 'mapping_1',
      actorUserId: 'admin_1',
      expectedCatalogSha256: 'b'.repeat(64),
      resolutions: [{ determinationSha256, canonicalSportNames: ['Indoor Soccer'] }],
      rationale: 'Selection rationale.',
    }, dependencies())).rejects.toBeInstanceOf(AffiliateMappingSportResolutionConflictError);
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).not.toHaveBeenCalled();
  });
});
