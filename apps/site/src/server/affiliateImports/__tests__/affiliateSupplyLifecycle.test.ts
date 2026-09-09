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
    isSchemaValid: true,
    packageHash: 'package-hash',
    evidenceRefs: ['page-html'],
    evidenceKinds: ['PAGE_HTML'],
    mapping: {
      kind: 'EVENT',
      listUrl: 'https://club.example/events',
      itemSelector: '.event',
      fields: {
        title: { selector: '.title' },
        officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href' },
      },
    },
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
  it('treats ordinary producer REVIEW_REQUIRED as independent mapping review', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      source: {
        ...mappedSnapshot().source,
        status: 'REVIEW_REQUIRED',
        isAutomationOnHold: true,
        automationHoldReason: 'LEGACY_SPORT_REPAIR',
      },
    }));

    expect(assessment.automationHoldReason).toBe('LEGACY_SPORT_REPAIR');
    expect(assessment.stage).toBe('MAPPED');
    expect(assessment.outcome).toBeNull();
    expect(assessment.reasonCodes).not.toContain('HUMAN_REVIEW_REQUIRED');

    const decision = validateAffiliateSupplyCommand({
      command: 'APPROVE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['review:ordinary-mapping'],
      assessment,
    });

    expect(decision.isAccepted).toBe(true);
    expect(decision.nextStage).toBe('MAPPED');
  });

  it('keeps an explicit HUMAN_REVIEW_REQUIRED source out of mapping approval', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      source: { ...mappedSnapshot().source, status: 'HUMAN_REVIEW_REQUIRED' },
    }));

    expect(assessment.stage).toBe('HUMAN_REVIEW_REQUIRED');
    expect(assessment.outcome).toBe('HUMAN_REVIEW_REQUIRED');

    const decision = validateAffiliateSupplyCommand({
      command: 'APPROVE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['review:explicit-human-hold'],
      assessment,
    });

    expect(decision.isAccepted).toBe(false);
    expect(decision.reasonCodes).toContain('APPROVAL_PRECONDITION_FAILED');
  });
  it('keeps a historical run from a replaced mapping out of current review readiness', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      latestRun: null,
      historicalRuns: [{
        id: 'run-v1',
        status: 'SUCCEEDED',
        mappingId: 'mapping-v1',
        finishedAt: new Date('2026-08-21T10:00:00.000Z'),
        candidateCount: 1,
        itemCount: 1,
        evidenceRefs: ['historical-run'],
      }],
    }));

    expect(assessment.stage).toBe('MAPPED');
    expect(assessment.reasonCodes).not.toContain('LATEST_RUN_MAPPING_MISMATCH');
    expect(assessment.evidenceRefs).not.toContain('historical-run');

    const approval = validateAffiliateSupplyCommand({
      command: 'APPROVE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['review:historical-replacement'],
      assessment,
    });
    expect(approval.isAccepted).toBe(true);
    expect(approval.nextStage).toBe('MAPPED');
  });

  it('still rejects a current run whose mapping lineage is corrupt', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      latestRun: {
        id: 'run-corrupt',
        status: 'SUCCEEDED',
        mappingId: 'mapping-v1',
        finishedAt: new Date('2026-08-22T10:00:00.000Z'),
        candidateCount: 1,
        itemCount: 1,
      },
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.outcome).toBe('REPAIR_REQUIRED');
    expect(assessment.invariantViolations).toContain('LATEST_RUN_MAPPING_MISMATCH');

    const approval = validateAffiliateSupplyCommand({
      command: 'APPROVE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['review:corrupt-current-run'],
      assessment,
    });
    expect(approval.isAccepted).toBe(false);
    expect(approval.reasonCodes).toContain('APPROVAL_PRECONDITION_FAILED');
  });


  it('does not infer lifecycle evidence from an unbound validation result', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      lifecycleEvidenceKinds: [],
      mapping: {
        ...mappedSnapshot().mapping!,
        validationOutput: { isValid: true },
      },
      approval: {
        id: 'approval-unbound',
        status: 'APPROVED',
        decision: 'APPROVE',
        isIndependent: true,
        reviewerId: 'reviewer-1',
        reviewedPackageHash: 'package-hash',
        evidenceRefs: ['review-1'],
      },
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.outcome).toBe('REPAIR_REQUIRED');
    expect(assessment.reasonCodes).toContain('REQUIRED_LIFECYCLE_EVIDENCE_MISSING');
  });
  it('rejects approval without current mapping lifecycle proof even when no approval exists', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      lifecycleEvidenceKinds: [],
      approval: null,
    }));
    const decision = validateAffiliateSupplyCommand({
      command: 'APPROVE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 0,
      currentLifecycleGeneration: 0,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['review:approval'],
      assessment,
    });

    expect(decision.isAccepted).toBe(false);
    expect(decision.reasonCodes).toContain('APPROVAL_LIFECYCLE_EVIDENCE_MISSING');
  });



  it('does not promote a malformed mapping package', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      mapping: {
        ...mappedSnapshot().mapping!,
        mapping: { kind: 'EVENT' },
      },
    }));

    expect(assessment.stage).toBe('PRE_MAPPED');
    expect(assessment.reasonCodes).toContain('MAPPING_PACKAGE_MISSING_OR_INVALID');
    expect(assessment.isAutomationEnabled).toBe(false);
  });

  it('derives Approved Supply without publishing or enabling automation', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-1',
        status: 'APPROVED',
        decision: 'APPROVE',
        isIndependent: true,
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
  it('keeps a legacy sport repair hold after approval state is present', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      source: {
        ...mappedSnapshot().source,
        autoScrapeEnabled: false,
        isAutomationEnabled: false,
        isAutomationOnHold: true,
        automationHoldReason: 'LEGACY_SPORT_REPAIR',
      },
      approval: {
        id: 'approval-legacy-sport',
        status: 'APPROVED',
        decision: 'APPROVE',
        isIndependent: true,
        reviewerId: 'reviewer-legacy-sport',
        reviewedPackageHash: 'package-hash',
        evidenceRefs: ['legacy-sport-review'],
      },
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.isAutomationEnabled).toBe(false);
    expect(assessment.automationHoldReason).toBe('LEGACY_SPORT_REPAIR');
    expect(assessment.reasonCodes).toContain('AUTOMATION_HOLD');
  });

  it('derives Published Supply only from fresh qualifying targets', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-1',
        status: 'APPROVED',
        decision: 'APPROVE',
        isIndependent: true,
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
        isEmptyStateMatched: false,
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
  it('counts fresh targets against a wildcard contract cell', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-wildcard',
        status: 'APPROVED',
        decision: 'APPROVE',
        isIndependent: true,
        reviewerId: 'reviewer-wildcard',
        reviewedPackageHash: 'package-hash',
        evidenceRefs: ['review-wildcard'],
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
        id: 'run-wildcard',
        status: 'SUCCEEDED',
        mappingId: 'mapping-1',
        finishedAt: new Date('2026-08-22T08:00:00.000Z'),
        candidateCount: 2,
        itemCount: 2,
        isEmptyStateMatched: false,
      },
      baseline,
      contract: {
        ...contract,
        targets: [
          {
            marketKey: null,
            sportId: null,
            sourceProfile: 'EVENT',
            minimumFreshPublishedSupply: 2,
          },
          {
            marketKey: 'portland',
            sportId: 'soccer',
            sourceProfile: 'EVENT',
            minimumFreshPublishedSupply: 1,
          },
        ],
      },
      targets: [
        {
          id: 'target-portland',
          targetType: 'EVENT',
          targetId: 'event-portland',
          sourceProfile: 'EVENT',
          marketKey: 'portland',
          sportId: 'soccer',
          status: 'PUBLISHED',
          lastSuccessfulRefreshAt: new Date('2026-08-22T08:00:00.000Z'),
          freshnessExpiresAt: new Date('2026-08-23T08:00:00.000Z'),
          evidenceRefs: ['run-1'],
        },
        {
          id: 'target-seattle',
          targetType: 'EVENT',
          targetId: 'event-seattle',
          sourceProfile: 'EVENT',
          marketKey: 'seattle',
          sportId: 'baseball',
          status: 'PUBLISHED',
          lastSuccessfulRefreshAt: new Date('2026-08-22T08:00:00.000Z'),
          freshnessExpiresAt: new Date('2026-08-23T08:00:00.000Z'),
          evidenceRefs: ['run-1'],
        },
      ],
    }));

    expect(assessment.targetMinimum).toBe(2);
    expect(assessment.targetContribution).toBe(2);
    expect(assessment.isTargetMet).toBe(true);
  });

  it('returns Activated Supply after natural expiry without disabling automation', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: {
        id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', isIndependent: true,
        reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'],
      },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-20T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-1', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: new Date('2026-08-20T08:00:00.000Z'), candidateCount: 1, itemCount: 1, isEmptyStateMatched: false },
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
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', isIndependent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z'), mapping: { ...mappedSnapshot().mapping!.mapping, emptyState } },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      baseline,
    });
    const valid = deriveAffiliateSupplyAssessment({
      ...base,
      latestRun: { id: 'run-empty', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 0, itemCount: 0, isEmptyStateMatched: true, evidenceRefs: ['run-empty', 'page-empty'] },
    });
    const invalid = deriveAffiliateSupplyAssessment({
      ...base,
      latestRun: { id: 'run-zero', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 0, itemCount: 0, isEmptyStateMatched: false, evidenceRefs: ['run-zero'] },
    });

    expect(valid.stage).toBe('ACTIVATED');
    expect(valid.reasonCodes).toContain('VALID_EMPTY_REFRESH');
    expect(invalid.stage).toBe('APPROVED');
    expect(invalid.reasonCodes).toContain('UNEXPLAINED_ZERO_RESULT');
    expect(invalid.isAutomationEnabled).toBe(false);
  });

  it('moves drift and failed refreshes to Approved Supply with repair priority', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', isIndependent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-failed', status: 'FAILED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 0, itemCount: 0, errorCode: 'CAPTURE_FAILED', evidenceRefs: ['run-failed'] },
      baseline,
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.repairPriority).toBe(1);
    expect(assessment.reasonCodes).toContain('REFRESH_FAILED');
  });
  it('does not treat an in-flight refresh as a failure', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', isIndependent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-running', status: 'RUNNING', mappingId: 'mapping-1', startedAt: NOW, finishedAt: null, candidateCount: 0, itemCount: 0, evidenceRefs: ['run-running'] },
      baseline,
    }));

    expect(assessment.isAutomationEnabled).toBe(true);
    expect(assessment.stage).toBe('ACTIVATED');
    expect(assessment.reasonCodes).not.toContain('REFRESH_FAILED');
  });
  it('moves operational evidence invariant failures to Approved repair state', () => {
    const assessment = deriveAffiliateSupplyAssessment(mappedSnapshot({
      source: { ...mappedSnapshot().source, activeMappingId: 'mapping-current', autoScrapeEnabled: true },
      baseline: { malformed: true },
    }));

    expect(assessment.stage).toBe('APPROVED');
    expect(assessment.outcome).toBe('REPAIR_REQUIRED');
    expect(assessment.isAutomationEnabled).toBe(false);
    expect(assessment.repairPriority).toBe(AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED);
    expect(assessment.reasonCodes).toContain('INVARIANT_REPAIR_REQUIRED');
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
      approval: { id: 'approval-1', status: 'APPROVED', decision: 'APPROVE', isIndependent: true, reviewerId: 'reviewer-1', reviewedPackageHash: 'package-hash', evidenceRefs: ['review-1'] },
      mapping: { ...mappedSnapshot().mapping!, isActive: true, validatedAt: new Date('2026-08-21T12:00:00.000Z') },
      source: { ...mappedSnapshot().source, autoScrapeEnabled: true },
      latestRun: { id: 'run-1', status: 'SUCCEEDED', mappingId: 'mapping-1', finishedAt: NOW, candidateCount: 2, itemCount: 2, isEmptyStateMatched: false },
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
        { id: 'source-2', stage: 'APPROVED', targetContribution: 1, isAutomationEnabled: true, repairPriority: 1, freshnessStatus: 'STALE' },
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

    expect(decision.isAccepted).toBe(false);
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(['LIFECYCLE_GENERATION_STALE', 'EVIDENCE_REQUIRED', 'ACTIVATION_PRECONDITION_FAILED']));
  });
  it('rejects legacy reconciliation from the generic lifecycle command validator', () => {
    const decision = validateAffiliateSupplyCommand({
      command: 'LEGACY_RECONCILED',
      authority: 'SYSTEM',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['legacy-report:report-1'],
      assessment: deriveAffiliateSupplyAssessment(mappedSnapshot()),
    });

    expect(decision.isAccepted).toBe(false);
    expect(decision.reasonCodes).toContain('LEGACY_RECONCILIATION_WRITER_REQUIRED');
  });

  it('keeps the explicit reconciliation command available to system callers', () => {
    const decision = validateAffiliateSupplyCommand({
      command: 'RECONCILE',
      authority: 'SYSTEM',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['reconciliation-report:report-1'],
      assessment: deriveAffiliateSupplyAssessment(mappedSnapshot()),
    });

    expect(decision.isAccepted).toBe(true);
    expect(decision.nextStage).toBe('MAPPED');
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

    expect(decision.isAccepted).toBe(false);
    expect(decision.reasonCodes).toContain('PUBLICATION_PRECONDITION_FAILED');
  });
  it('allows exact target rejection after freshness loss', () => {
    const decision = validateAffiliateSupplyCommand({
      command: 'REJECT_TARGET',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 4,
      currentLifecycleGeneration: 4,
      activeContractVersion: contract.version,
      activeContractHash: contract.hash,
      commandContractVersion: contract.version,
      commandContractHash: contract.hash,
      evidenceRefs: ['rejection:target-1'],
      assessment: deriveAffiliateSupplyAssessment(mappedSnapshot({
        targets: [{
          id: 'target-1',
          targetType: 'EVENT',
          targetId: 'event-1',
          sourceProfile: 'EVENT',
          status: 'LAST_KNOWN_GOOD',
          evidenceRefs: ['target:target-1'],
        }],
      })),
    });

    expect(decision.isAccepted).toBe(true);
    expect(decision.reasonCodes).not.toContain('TARGET_REJECTION_PRECONDITION_FAILED');
  });


  it('normalizes one same-origin root and creates a successor for a domain change', () => {
    const same = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'HTTP://Example.com/events/?utm_source=x#today',
      resolvedCanonicalUrl: 'https://example.com/events',
      isRedirectVerified: true,
      prior: { canonicalUrl: 'https://example.com/events', operatorDomain: 'example.com' },
    });
    const successor = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://example.com/events',
      resolvedCanonicalUrl: 'https://new-operator.example/events',
      isRedirectVerified: true,
      prior: { canonicalUrl: 'https://example.com/events', operatorDomain: 'example.com' },
    });
    const operatorChanged = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://example.com/events',
      resolvedCanonicalUrl: 'https://example.com/events',
      isRedirectVerified: true,
      operatorDomain: 'new-operator.example',
      prior: { canonicalUrl: 'https://example.com/events', operatorDomain: null },
    });

    expect(same.canonicalUrl).toBe('https://example.com/events');
    expect(successor.canonicalUrl).toBe('https://new-operator.example/events');
    expect(successor.identityKey).not.toBe(same.identityKey);
    expect(same.rootDecision).toBe('SAME_ROOT');
    expect(successor.rootDecision).toBe('SUCCESSOR_REQUIRED');
    expect(operatorChanged.rootDecision).toBe('SUCCESSOR_REQUIRED');
  });
});

describe('affiliate replenishment planning', () => {
  const base = {
    now: NOW,
    isContractSafe: true,
    mapping: { waiting: 1, active: 2, activeProducerCount: 2 },
    review: { waiting: 1, active: 1, activeReviewerCount: 2, healthyReviewerCount: 2 },
    activeWaves: [],
    campaigns: [{ id: 'campaign-1', isEligible: true, priority: 2, nextEligibleAt: new Date('2026-08-22T11:00:00.000Z') }],
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
