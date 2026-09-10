/** @jest-environment node */

const prismaMock = {
  affiliateSourceMappingJobs: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  affiliateSourceIntakes: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  affiliateApprovalJobs: { findUnique: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { buildAffiliateSportsCatalogSnapshot } from '../affiliateSportsCatalog';
import { affiliateSportDeterminationSha256 } from '../affiliateSportDetermination';
import {
  affiliateMappingReviewGuidance,
  listAffiliateMappingHumanReviewJobs,
  resolveAffiliateMappingSportDecision,
  AffiliateMappingSportResolutionInputError,
} from '@/server/affiliateImports/sourceMappingHumanReview';

const reviewCatalog = buildAffiliateSportsCatalogSnapshot([
  { id: 'sport_grass_soccer', name: 'Grass Soccer' },
  { id: 'sport_indoor_soccer', name: 'Indoor Soccer' },
], '2026-08-10T12:00:00.000Z');
const staleCatalog = buildAffiliateSportsCatalogSnapshot([
  { id: 'sport_grass_soccer', name: 'Grass Soccer' },
], '2026-08-09T12:00:00.000Z');

const sportCitation = (artifactId: string, excerpt: string) => ({
  artifactId,
  artifactSha256: `${artifactId.slice(0, 1)}${'a'.repeat(63)}`,
  artifactKind: 'PAGE_HTML' as const,
  pageUrl: 'https://source.example/sports',
  excerpt,
});

const historicalUnsupportedTrack = {
  sourceLabels: ['Track and Field'],
  status: 'UNSUPPORTED' as const,
  resolutionBasis: 'SOURCE_EVIDENCE' as const,
  canonicalSportNames: [],
  rationale: 'The historical envelope recorded Track and Field as unsupported.',
  evidence: [sportCitation('a', 'Track and Field')],
};
const historicalUnsupportedTrackHash = affiliateSportDeterminationSha256(historicalUnsupportedTrack);

const blacklistedTrack = {
  sourceLabels: ['Track and Field'],
  status: 'BLACKLISTED' as const,
  resolutionBasis: 'SOURCE_EVIDENCE' as const,
  canonicalSportNames: [],
  rationale: 'The source names Track and Field, which remains excluded.',
  evidence: [sportCitation('b', 'Track and Field')],
};
const unresolvedSoccer = {
  sourceLabels: ['Soccer'],
  status: 'VARIANT_UNRESOLVED' as const,
  resolutionBasis: 'SOURCE_EVIDENCE' as const,
  canonicalSportNames: [],
  rationale: 'The source says Soccer but does not establish the surface.',
  evidence: [sportCitation('c', 'Soccer')],
};
const unresolvedSoccerHash = affiliateSportDeterminationSha256(unresolvedSoccer);

const humanReviewJob = (
  sportDeterminations: readonly { sourceLabels: readonly string[] }[],
  reasonCodes: readonly string[],
  claimCatalog = reviewCatalog,
) => ({
  id: 'mapping_1',
  intakeId: 'intake_1',
  status: 'HUMAN_REVIEW_REQUIRED',
  sourceId: null,
  mappingId: null,
  resultSummary: {
    claimEvidenceContext: { sportsCatalog: claimCatalog },
    humanReviewRequired: {
      reasonCodes,
      sourceSportLabels: sportDeterminations.flatMap((determination) => determination.sourceLabels),
    },
    sportDeterminations,
  },
});

const resolutionDependencies = () => ({
  database: prismaMock,
  catalogLoader: async () => reviewCatalog,
  now: () => new Date('2026-08-10T13:00:00.000Z'),
});

describe('affiliate mapping human-review queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({ id: 'intake_1', status: 'READY_FOR_MAPPING' });
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue(null);
  });

  it('joins terminal mapping jobs to intake identity and structured reasons', async () => {
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([{
      id: 'mapping_1',
      intakeId: 'intake_1',
      status: 'HUMAN_REVIEW_REQUIRED',
      updatedAt: new Date('2026-08-02T12:00:00.000Z'),
      finishedAt: new Date('2026-08-02T11:55:00.000Z'),
      attemptCount: 3,
      errorMessage: 'No supported logo could be verified.',
      resultSummary: {
        humanReviewRequired: {
          markedAt: '2026-08-02T11:56:00.000Z',
          source: 'HISTORICAL_TERMINAL_CLASSIFICATION',
          requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
          reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO', 'RETRY_LIMIT_EXCEEDED', 'NO_VERIFIABLE_OFFICIAL_LOGO'],
          sourceSportLabels: ['Volleyball'],
          rationale: 'Stored first-party evidence contains no reusable mark.',
          blockingIssues: ['Logo evidence is exhausted.'],
        },
      },
    }]);
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([{
      id: 'intake_1',
      name: 'New York Elite Volleyball',
      sourceKey: 'new-york-elite-volleyball',
      region: 'New York, NY',
      baseUrl: 'https://example.test',
      status: 'REVIEW_REQUIRED',
      complianceStatus: 'ALLOWED',
      selectedLogoArtifactId: null,
    }]);

    await expect(listAffiliateMappingHumanReviewJobs()).resolves.toEqual([{
      jobId: 'mapping_1',
      intakeId: 'intake_1',
      intakeName: 'New York Elite Volleyball',
      sourceKey: 'new-york-elite-volleyball',
      region: 'New York, NY',
      baseUrl: 'https://example.test',
      intakeStatus: 'REVIEW_REQUIRED',
      complianceStatus: 'ALLOWED',
      attemptCount: 3,
      markedAt: '2026-08-02T11:56:00.000Z',
      errorMessage: 'No supported logo could be verified.',
      source: 'HISTORICAL_TERMINAL_CLASSIFICATION',
      requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO', 'RETRY_LIMIT_EXCEEDED'],
      sourceSportLabels: ['Volleyball'],
      rationale: 'Stored first-party evidence contains no reusable mark.',
      blockingIssues: ['Logo evidence is exhausted.'],
      hasSelectedLogo: false,
      reviewOwner: 'MAPPING_AGENT',
      reviewQuestion: 'Can this mapping proceed with no official logo?',
      recommendedAction: 'Accept the missing logo and return the package to automated review. A missing logo alone must not block the mapping.',
    }]);
    expect(prismaMock.affiliateSourceMappingJobs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'HUMAN_REVIEW_REQUIRED' },
      take: 250,
    }));
  });

  it('identifies producer commit handoff failures as system repairs', () => {
    expect(affiliateMappingReviewGuidance({
      reasonCodes: ['INSUFFICIENT_STORED_EVIDENCE'],
      rationale: 'The package-evidence command cannot resolve the exact producer commit in /producer-workspace.',
    })).toEqual(expect.objectContaining({
      reviewOwner: 'SYSTEM',
      reviewQuestion: expect.stringContaining('exact-commit evidence handoff'),
    }));
  });

  it('identifies conflicting live records as user decisions', () => {
    expect(affiliateMappingReviewGuidance({
      reasonCodes: ['CONFLICTING_LIVE_RECORD'],
    })).toEqual(expect.objectContaining({
      reviewOwner: 'USER',
      reviewQuestion: expect.stringContaining('conflicting live record'),
    }));
  });

  it('explains the product decision for an unsupported sport', () => {
    expect(affiliateMappingReviewGuidance({
      requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_NOT_IN_CATALOG'],
      blockingIssues: ['Badminton is not in the BracketIQ sports catalog.'],
    })).toEqual({
      reviewOwner: 'USER',
      reviewQuestion: 'Should this sport be added to the BracketIQ sports catalog?',
      recommendedAction: 'Review the source sport below. Add a fully configured canonical sport only when BracketIQ should support it; otherwise leave this mapping stopped.',
    });
  });

  it('routes a pure-blacklist historical review away from catalog addition', () => {
    expect(affiliateMappingReviewGuidance({
      reasonCodes: ['SPORT_NOT_IN_CATALOG'],
      sourceSportLabels: ['Track and Field'],
    })).toEqual({
      reviewOwner: 'USER',
      reviewQuestion: 'Should this blacklisted source activity remain excluded?',
      recommendedAction: 'Confirm the exact blacklisted determinations when the source must remain excluded. Blacklisted activities cannot become executable sports.',
    });
  });

  it('rejects a historical blacklisted source replacement without queue mutation', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue(
      humanReviewJob([historicalUnsupportedTrack], ['SPORT_NOT_IN_CATALOG']),
    );

    await expect(resolveAffiliateMappingSportDecision({
      action: 'SELECT_SPORTS',
      jobId: 'mapping_1',
      actorUserId: 'admin_1',
      expectedCatalogSha256: reviewCatalog.sha256,
      resolutions: [{
        determinationSha256: historicalUnsupportedTrackHash,
        canonicalSportNames: ['Grass Soccer'],
      }],
      rationale: 'The historical source label should be treated as Grass Soccer.',
    }, resolutionDependencies())).rejects.toBeInstanceOf(AffiliateMappingSportResolutionInputError);

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('rejects a pure-blacklist historical catalog refresh without queue mutation', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue(
      humanReviewJob([historicalUnsupportedTrack], ['SPORT_NOT_IN_CATALOG'], staleCatalog),
    );

    await expect(resolveAffiliateMappingSportDecision({
      action: 'REFRESH_CATALOG',
      jobId: 'mapping_1',
      actorUserId: 'admin_1',
    }, resolutionDependencies())).rejects.toThrow(/blacklisted/i);

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('rejects legacy blacklist catalog refresh without determinations', async () => {
    const job = humanReviewJob([], ['SPORT_NOT_IN_CATALOG'], staleCatalog);
    job.resultSummary.humanReviewRequired.sourceSportLabels = ['Track and Field'];
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue(job);

    await expect(resolveAffiliateMappingSportDecision({
      action: 'REFRESH_CATALOG',
      jobId: job.id,
      actorUserId: 'admin_1',
    }, resolutionDependencies())).rejects.toBeInstanceOf(AffiliateMappingSportResolutionInputError);

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('confirms current-policy exclusions despite a stale claim catalog without requeueing', async () => {
    const job = humanReviewJob([blacklistedTrack], ['SPORT_BLACKLISTED'], staleCatalog);
    const determinationSha256 = affiliateSportDeterminationSha256(blacklistedTrack);
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue(job);

    await resolveAffiliateMappingSportDecision({
      action: 'CONFIRM_EXCLUSIONS',
      jobId: job.id,
      actorUserId: 'admin_1',
      determinationSha256s: [determinationSha256],
      rationale: 'Keep the evidenced blacklisted activity excluded.',
    }, resolutionDependencies());

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith({
      where: { id: job.id, status: 'HUMAN_REVIEW_REQUIRED', sourceId: null, mappingId: null },
      data: {
        resultSummary: expect.objectContaining({
          sportResolutionHistory: [expect.objectContaining({
            action: 'EXCLUSIONS_CONFIRMED',
            determinationSha256s: [determinationSha256],
            priorResultSummary: expect.objectContaining(job.resultSummary),
          })],
        }),
      },
    });
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('keeps a separate nonblacklisted human decision valid in a mixed review', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue(
      humanReviewJob(
        [blacklistedTrack, unresolvedSoccer],
        ['SPORT_BLACKLISTED', 'SPORT_VARIANT_UNRESOLVED'],
      ),
    );

    await resolveAffiliateMappingSportDecision({
      action: 'SELECT_SPORTS',
      jobId: 'mapping_1',
      actorUserId: 'admin_1',
      expectedCatalogSha256: reviewCatalog.sha256,
      resolutions: [{
        determinationSha256: unresolvedSoccerHash,
        canonicalSportNames: ['Indoor Soccer'],
      }],
      rationale: 'The stored evidence establishes an indoor playing surface for Soccer.',
    }, resolutionDependencies());

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'QUEUED',
        resultSummary: expect.objectContaining({
          humanSportResolution: expect.objectContaining({
            resolutions: [{
              determinationSha256: unresolvedSoccerHash,
              sourceLabels: ['Soccer'],
              canonicalSportNames: ['Indoor Soccer'],
            }],
          }),
        }),
      }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { status: 'READY_FOR_MAPPING' },
    });
  });

  it('does not query intakes when the terminal queue is empty', async () => {
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([]);

    await expect(listAffiliateMappingHumanReviewJobs()).resolves.toEqual([]);
    expect(prismaMock.affiliateSourceIntakes.findMany).not.toHaveBeenCalled();
  });
});
