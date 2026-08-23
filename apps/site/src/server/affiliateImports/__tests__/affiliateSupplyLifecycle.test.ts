/** @jest-environment node */

import {
  AFFILIATE_REPLENISHMENT_PRIORITY,
  affiliateSupplyContractManifestSchema,
  buildAffiliateSupplyContractManifest,
  buildAffiliateSupplyContractImpactReport,
  deriveAffiliateSupplyAssessment,
  normalizeAffiliateSupplyIdentity,
  planAffiliateReplenishment,
  validateAffiliateSupplyCommand,
  type AffiliateSupplyEvidenceSnapshot,
  type AffiliateSupplyContractPolicy,
} from '../affiliateSupplyLifecycle';

const NOW = new Date('2026-08-22T12:00:00.000Z');

const contract: AffiliateSupplyContractPolicy = {
  schemaVersion: 1,
  version: 3,
  rolloutCohort: 'DEFAULT',
  hash: 'contract-hash',
  freshnessWindows: [{ sourceProfile: 'EVENT', maximumAgeHours: 24 }],
  targets: [{
    marketKey: 'portland',
    sportId: 'soccer',
    sourceProfile: 'EVENT',
    minimumFreshPublishedSupply: 2,
  }],
  requiredMappingEvidenceKinds: ['PAGE_HTML'],
  requiredLifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
};

const baseline = {
  schemaVersion: 1 as const,
  mappingId: 'mapping-1',
  mappingVersion: 1,
  approvedAt: '2026-08-21T12:00:00.000Z',
  candidateCount: 1,
  rejectedCount: 0,
  listingKinds: ['EVENT'],
  criticalMissingCount: 0,
  criticalMissingRate: 0,
  normalizedFieldsHash: 'fields-hash',
};

const mappedSnapshot = (overrides: Partial<AffiliateSupplyEvidenceSnapshot> = {}): AffiliateSupplyEvidenceSnapshot => ({
  now: NOW,
  contract,
  source: {
    id: 'source-1',
    canonicalUrl: 'https://club.example/events',
    targetKind: 'EVENT',
    status: 'ACTIVE',
    autoScrapeEnabled: false,
    activeMappingId: 'mapping-1',
    lifecycleGeneration: 4,
  },
  intake: {
    id: 'intake-1',
    status: 'CAPTURED',
    complianceStatus: 'ALLOWED',
  },
  mapping: {
    id: 'mapping-1',
    version: 1,
    isActive: false,
    validatedAt: null,
    schemaValid: true,
    packageHash: 'package-hash',
    evidenceRefs: ['page-html'],
    evidenceKinds: ['PAGE_HTML'],
    mapping: { kind: 'EVENT', listUrl: 'https://club.example/events', itemSelector: '.event' },
  },
  mappingJob: {
    id: 'mapping-job-1',
    status: 'REVIEW_REQUIRED',
    sourceId: 'source-1',
    mappingId: 'mapping-1',
    resultSummary: { packageHash: 'package-hash' },
  },
  approval: null,
  latestRun: null,
  baseline: null,
  lifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
  candidates: [],
  targets: [],
  ...overrides,
});

describe('affiliate supply lifecycle assessment', () => {
  it('derives Mapped Supply from a schema-valid package without approval', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot());

    expect(assessment.stage).toBe('MAPPED');
    expect(assessment.targetContribution).toBe(0);
    expect(assessment.isAutomationEnabled).toBe(false);
    expect(assessment.reasonCodes).toEqual(expect.arrayContaining(['MAPPING_PACKAGE_VALID']));
  });

  it('derives Approved Supply without publishing or enabling automation', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-1',
        status: 'APPROVED',
        decision: 'APPROVE',
        independent: true,
        reviewerId: 'reviewer-1',
        reviewedPackageHash: 'package-hash',
        evidenceRefs: ['review-1'],
      },
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.isAutomationEnabled).toBe(false);
    expect(assessment.targetContribution).toBe(0);
    expect(assessment.reasonCodes).toEqual(expect.arrayContaining(['INDEPENDENT_REVIEW_APPROVED']));
  });

  it('derives Published Supply only from fresh qualifying targets', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-1',
        status: 'APPROVED',
        decision: 'APPROVE',
        independent: true,
        reviewerId: 'reviewer-1',
        reviewedPackageHash: 'package-hash',
        evidenceRefs: ['review-1'],
      },
      mapping: {
        ...mappedSnapshot().mapping!,
        isActive: true,
        validatedAt: new Date('2026-08-21T12:00:00.000Z'),
      },
      source: {
        ...mappedSnapshot().source,
        autoScrapeEnabled: true,
      },
      latestRun: {
        id: 'run-1',
        status: 'SUCCEEDED',
        mappingId: 'mapping-1',
        finishedAt: new Date('2026-08-22T08:00:00.000Z'),
        candidateCount: 1,
        itemCount: 1,
        emptyStateMatched: false,
      },
      baseline,
      candidates: [{ id: 'candidate-1', status: 'PUBLISHED', listingKind: 'EVENT', publishedTargetId: 'event-1' }],
      targets: [{
        id: 'target-1',
        targetType: 'EVENT',
        targetId: 'event-1',
        sourceProfile: 'EVENT',
        marketKey: 'portland',
        sportId: 'soccer',
        status: 'PUBLISHED',
        lastSuccessfulRefreshAt: new Date('2026-08-22T08:00:00.000Z'),
        freshnessExpiresAt: new Date('2026-08-23T08:00:00.000Z'),
        evidenceRefs: ['run-1'],
      }],
    }));

    expect(assessment.stage).toBe('PUBLISHED');
    expect(assessment.freshnessStatus).toBe('FRESH');
    expect(assessment.targetContribution).toBe(1);
    expect(assessment.isTargetMet).toBe(false);
  });

  it('returns Activated Supply after natural expiry without disabling automation', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', independent: true,
        reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'],
      },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-20T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-1', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: new Date('2026-08-20T08:00:00.000Z'), candidateCount: 1, itemCount: 1, emptyStateMatched: false },
      baseline,
      targets: [{
        id: 'target-1', targetType: 'EVENT', targetId: 'event-1', sourceProfile: 'EVENT',
        marketKey: 'portland', sportId: 'soccer', status: 'PUBLISHED',
        lastSuccessfulRefreshAt: new Date('2026-08-20T08:00:00.000Z'), freshnessExpiresAt: new Date('2026-08-21T08:00:00.000Z'), evidenceRefs: ['run-1'],
      }],
    }));

    expect(assessment.stage).toBe('ACTIVATED');
    expect(assessment.freshnessStatus).toBe('STALE');
    expect(assessment.isAutomationEnabled).toBe(true);
    expect(assessment.targetContribution).toBe(0);
  });

  it('accepts an explicitly evidenced public empty state but rejects an unexplained zero', () => {
    const emptyState = {
      selector: '#empty',
      textIncludes: ['No events are scheduled'],
    };
    const base = mappedSnapshot({
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', independent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z'), mapping: { ...mappedSnapshot().mapping!.mapping, emptyState } },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      baseline,
    });
    const valid = deriveAffiliateSupplyAssessment({
      ...base,
      latestRun: { id: 'run-empty', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 0, itemCount: 0, emptyStateMatched: true, evidenceRefs: ['run-empty', 'page-empty'] },
    });
    const invalid = deriveAffiliateSupplyAssessment({
      ...base,
      latestRun: { id: 'run-zero', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 0, itemCount: 0, emptyStateMatched: false, evidenceRefs: ['run-zero'] },
    });

    expect(valid.stage).toBe('ACTIVATED');
    expect(valid.reasonCodes).toContain('VALID_EMPTY_REFRESH');
    expect(invalid.stage).toBe('APPROVED');
    expect(invalid.reasonCodes).toContain('UNEXPLAINED_ZERO_RESULT');
    expect(invalid.isAutomationEnabled).toBe(false);
  });

  it('moves drift and failed refreshes to Approved Supply with repair priority', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', independent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-failed', status: 'FAILED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 0, itemCount: 0, errorCode: 'CAPTURE_FAILED', evidenceRefs: ['run-failed'] },
      baseline,
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.repairPriority).toBe(1);
    expect(assessment.reasonCodes).toContain('REFRESH_FAILED');
  });
  it('keeps source exclusion and target rejection scoped', () => {
    const excluded = deriveAffiliateSupplyAssessment(mappedSnapshot({
      source: { ...mappedSnapshot().source, status: 'EXCLUDED', autoScrapeEnabled: false },
      targets: [{
        id: 'target-1',
        targetType: 'EVENT',
        targetId: 'event-1',
        sourceProfile: 'EVENT',
        marketKey: 'portland',
        sportId: 'soccer',
        status: 'PUBLISHED',
        freshnessExpiresAt: new Date('2026-08-23T00:00:00.000Z'),
        evidenceRefs: ['run-1'],
      }],
    }));
    const rejected = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', independent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-1', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 2, itemCount: 2, emptyStateMatched: false },
      baseline: { ...baseline, candidateCount: 2 },
      targets: [
        { id: 'target-1', targetType: 'EVENT', targetId: 'event-1', sourceProfile: 'EVENT', marketKey: 'portland', sportId: 'soccer', status: 'REJECTED', freshnessExpiresAt: new Date('2026-08-23T00:00:00.000Z'), evidenceRefs: ['rejection-1'] },
        { id: 'target-2', targetType: 'EVENT', targetId: 'event-2', sourceProfile: 'EVENT', marketKey: 'portland', sportId: 'soccer', status: 'PUBLISHED', freshnessExpiresAt: new Date('2026-08-23T00:00:00.000Z'), evidenceRefs: ['run-1'] },
      ],
    }));

    expect(excluded.stage).toBe('SOURCE_EXCLUDED');
    expect(excluded.targetContribution).toBe(0);
    expect(excluded.targets[0].status).toBe('PUBLISHED');
    expect(rejected.stage).toBe('PUBLISHED');
    expect(rejected.targetContribution).toBe(1);
    expect(rejected.reasonCodes).toContain('TARGET_REJECTION_SCOPED');
  });
});

describe('affiliate supply commands and contracts', () => {
  it('validates a manifest and reports impact before activation', () => {
    const manifest = buildAffiliateSupplyContractManifest({
      version: contract.version,
      rolloutCohort: contract.rolloutCohort,
      supplyContract: {
        ...contract,
        hash: undefined,
      },
    });
    expect(affiliateSupplyContractManifestSchema.parse(manifest).hash).toBe(manifest.hash);
    expect(() => affiliateSupplyContractManifestSchema.parse({
      ...manifest,
      supplyContract: { ...manifest.supplyContract, hash: 'tampered-contract-hash' },
    })).toThrow('Supply Contract policy hash');
    const report = buildAffiliateSupplyContractImpactReport({
      currentManifest: manifest,
      sources: [
        { id: 'source-1', stage: 'PUBLISHED', targetContribution: 1, isAutomationEnabled: true, repairPriority: 4, freshnessStatus: 'FRESH' },
        { id: 'source-2', stage: 'APPROVED', targetContribution: 2, isAutomationEnabled: true, repairPriority: 1, freshnessStatus: 'STALE' },
      ],
      nextPolicy: { ...contract, version: 4, hash: 'next-contract-hash', targets: [{ ...contract.targets[0], minimumFreshPublishedSupply: 3 }] },
    });

    expect(report.sourceCount).toBe(2);
    expect(report.stageRegressions).toBe(1);
    expect(report.automationStops).toBe(1);
    expect(report.targetMetChanges).toBe(1);
  });

  it('rejects stale generations, wrong authority, and missing evidence', () => {
    const decision = validateAffiliateSupplyCommand({
      command: 'ACTIVATE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 3,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: [],
      assessment: deriveAffiliateSupplyAssessment(mappedSnapshot()),
    });

    expect(decision.accepted).toBe(false);
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(['LIFECYCLE_GENERATION_STALE', 'EVIDENCE_REQUIRED', 'ACTIVATION_PRECONDITION_FAILED']));
  });
  it('blocks target publication until the source is Activated or Published', () => {
    const decision = validateAffiliateSupplyCommand({
      command: 'PUBLISH_TARGET',
      authority: 'HUMAN_DIRECTED_EXECUTOR',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['candidate:candidate-1'],
      assessment: deriveAffiliateSupplyAssessment(mappedSnapshot()),
    });

    expect(decision.accepted).toBe(false);
    expect(decision.reasonCodes).toContain('PUBLICATION_PRECONDITION_FAILED');
  });


  it('normalizes one same-origin root and creates a successor for a domain change', () => {
    const same = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'HTTP://Example.com/events/?utm_source=x#today',
      resolvedCanonicalUrl: 'https://example.com/events',
      redirectVerified: true,
      prior: { canonicalUrl: 'https://example.com/events', operatorDomain: 'example.com' },
    });
    const successor = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://example.com/events',
      resolvedCanonicalUrl: 'https://new-operator.example/events',
      redirectVerified: true,
      prior: { canonicalUrl: 'https://example.com/events', operatorDomain: 'example.com' },
    });

    expect(same.canonicalUrl).toBe('https://example.com/events');
    expect(successor.canonicalUrl).toBe('https://new-operator.example/events');
    expect(successor.identityKey).not.toBe(same.identityKey);
    expect(same.rootDecision).toBe('SAME_ROOT');
    expect(successor.rootDecision).toBe('SUCCESSOR_REQUIRED');
  });
});

describe('affiliate replenishment planning', () => {
  const base = {
    now: NOW,
    isContractSafe: true,
    mapping: { waiting: 1, active: 2, activeProducerCount: 2 },
    review: { waiting: 1, active: 1, activeReviewerCount: 2, healthyReviewerCount: 2 },
    activeWaves: [],
    campaigns: [{ id: 'campaign-1', eligible: true, priority: 2, nextEligibleAt: new Date('2026-08-22T11:00:00.000Z') }],
  };

  it('targets two waiting jobs per producer and chooses restore demand first', () => {
    const plan = planAffiliateReplenishment({
      ...base,
      demands: [
        { id: 'new', status: 'OPEN', priority: AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: null },
        { id: 'restore', status: 'OPEN', priority: AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: null },
      ],
    });

    expect(plan.targetWaitingMapping).toBe(4);
    expect(plan.selectedDemandId).toBe('restore');
    expect(plan.action).toBe('REUSE_CAMPAIGN');
  });

  it('pauses mapping and campaigns at review pressure or without a reviewer', () => {
    const atLimit = planAffiliateReplenishment({
      ...base,
      review: { ...base.review, waiting: 4 },
      demands: [{ id: 'demand', status: 'OPEN', priority: 1, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: null }],
    });
    const missing = planAffiliateReplenishment({
      ...base,
      review: { ...base.review, healthyReviewerCount: 0 },
      demands: [{ id: 'demand', status: 'OPEN', priority: 1, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: null }],
    });

    expect(atLimit.isMappingPaused).toBe(true);
    expect(atLimit.isCampaignPaused).toBe(true);
    expect(atLimit.isAdmissionHalted).toBe(false);
    expect(missing.reasonCodes).toContain('NO_HEALTHY_REVIEWER');
    expect(missing.isAdmissionHalted).toBe(true);
    expect(missing.action).toBe('NONE');
  });

  it('retains valid overshoot and waits for active waves and search saturation', () => {
    const overshoot = planAffiliateReplenishment({
      ...base,
      mapping: { ...base.mapping, waiting: 5 },
      demands: [{ id: 'demand', status: 'OPEN', priority: 1, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: null }],
    });
    const active = planAffiliateReplenishment({
      ...base,
      demands: [{ id: 'demand', status: 'OPEN', priority: 1, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: null }],
      activeWaves: [{ id: 'wave-1', status: 'ACTIVE', demandId: 'demand' }],
    });
    const saturated = planAffiliateReplenishment({
      ...base,
      demands: [{ id: 'demand', status: 'OPEN', priority: 1, openedAt: NOW, nextEligibleAt: null, searchSaturatedUntil: new Date('2026-08-23T00:00:00.000Z') }],
    });

    expect(overshoot.action).toBe('NONE');
    expect(overshoot.reasonCodes).toContain('VALID_OVERSHOOT_RETAINED');
    expect(active.reasonCodes).toContain('ACTIVE_WAVE');
    expect(saturated.reasonCodes).toContain('SEARCH_SATURATION_NOT_ELIGIBLE');
  });
});
