import {
  affiliateSourceMatchesIntakeEvidence,
  resolveApprovedAffiliateSetupScript,
  selectAffiliateMappingLiveApprovalCandidates,
} from '../affiliateMappingApproval';

const HASH = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);

const job = (logoDisposition: 'OFFICIAL_ASSET' | 'OFFICIAL_SCREENSHOT_CROP' | 'MANUAL_REVIEW') => ({
  id: `job-${logoDisposition}`,
  intakeId: `intake-${logoDisposition}`,
  status: 'REVIEW_REQUIRED',
  resultSummary: {
    schemaVersion: 2,
    claimEvidenceContext: {
      evidenceRunId: 'run-1',
      sportsCatalogSha256: HASH,
    },
    result: {
      schemaVersion: 2,
      jobId: `job-${logoDisposition}`,
      intakeId: `intake-${logoDisposition}`,
      sourceKey: `source-${logoDisposition}`,
      evidenceRunId: 'run-1',
      sportsCatalogSha256: HASH,
      sportDeterminations: [{
        sourceLabels: ['Outdoor soccer'],
        status: 'RESOLVED',
        resolutionBasis: 'SOURCE_EVIDENCE',
        canonicalSportNames: ['Grass Soccer'],
        rationale: 'The source explicitly describes outdoor soccer.',
        evidence: [{
          artifactId: 'artifact_1',
          artifactSha256: HASH,
          artifactKind: 'PAGE_HTML',
          pageUrl: 'https://example.com/',
          excerpt: 'Outdoor soccer',
        }],
      }],
      workerId: 'worker-1',
      status: 'REVIEW_REQUIRED',
      branch: 'codex/affiliate-ingestion-live',
      commit: COMMIT,
      generatedPaths: [
        `apps/site/scripts/setup-source-${logoDisposition.toLowerCase().replaceAll('_', '-')}-affiliate-source.ts`,
      ],
      logoDisposition,
      candidateCount: 1,
      reviewScrapes: [
        { runId: 'run-1', candidateCount: 1, normalizedCandidateSha256: HASH, passed: true },
        { runId: 'run-2', candidateCount: 1, normalizedCandidateSha256: HASH, passed: true },
      ],
      validation: {
        testsPassed: true,
        diffCheckPassed: true,
        duplicateSafe: true,
        warnings: [],
      },
      errorMessage: null,
    },
  },
});

describe('Codex ingestion live approval', () => {
  it('keeps manual-logo packages eligible for explicit reviewer approval', () => {
    const selected = selectAffiliateMappingLiveApprovalCandidates([
      job('OFFICIAL_ASSET'),
      job('OFFICIAL_SCREENSHOT_CROP'),
      job('MANUAL_REVIEW'),
    ]);

    expect(selected.approvable.map((candidate) => candidate.result.logoDisposition)).toEqual([
      'OFFICIAL_ASSET',
      'OFFICIAL_SCREENSHOT_CROP',
      'MANUAL_REVIEW',
    ]);
    expect(selected.manualReview).toHaveLength(1);
  });

  it('rejects mismatched job identity and unsafe generated paths', () => {
    const mismatched = job('OFFICIAL_ASSET');
    mismatched.intakeId = 'different-intake';
    expect(() => selectAffiliateMappingLiveApprovalCandidates([mismatched])).toThrow(
      'result identity does not match',
    );

    expect(() => resolveApprovedAffiliateSetupScript('/repo', '../outside.ts')).toThrow(
      'escapes the repository',
    );
  });

  it('matches a generated source by intake evidence when its operational key differs', () => {
    expect(affiliateSourceMatchesIntakeEvidence(
      {
        sourceEvidence: {
          intakeId: 'intake-1',
          intakeSourceKey: 'new-york-long-intake-key',
        },
      },
      {
        intakeId: 'intake-1',
        intakeSourceKey: 'new-york-long-intake-key',
      },
    )).toBe(true);

    expect(affiliateSourceMatchesIntakeEvidence(
      { sourceEvidence: { intakeSourceKey: 'new-york-long-intake-key' } },
      { intakeId: 'intake-1', intakeSourceKey: 'different-key' },
    )).toBe(false);
  });
});
