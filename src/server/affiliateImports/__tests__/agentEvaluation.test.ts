/** @jest-environment node */

import {
  evaluateAffiliateMappingModel,
  type AffiliateMappingEvaluationExample,
} from '../agentEvaluation';
import { FixtureAffiliateMappingModelClient } from '../agentModelClient';
import { buildAffiliateSportsCatalogSnapshot } from '../affiliateSportsCatalog';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const sportsCatalog = buildAffiliateSportsCatalogSnapshot(
  [{ id: 'sport_grass_soccer', name: 'Grass Soccer' }],
  '2026-01-01T00:00:00.000Z',
);
const model = {
  family: 'fixture',
  upstreamRepository: 'bracketiq/fixture',
  upstreamRevision: 'fixture-v1',
  artifactSha256: HASH_C,
  adapterRevision: null,
  promptTemplateRevision: 'prompt-v1',
};

const allowedDraft = {
  schemaVersion: 2 as const,
  contextContractVersion: 2 as const,
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'ALLOWED' as const,
  implementationMode: 'GENERIC_MAPPING' as const,
  listingKind: 'EVENT' as const,
  evidence: [{
    artifactKind: 'PAGE_HTML',
    artifactSha256: HASH_A,
    pageUrl: 'https://rivercity.example/events',
    supports: ['title', 'officialActionUrl'],
  }],
  organization: {
    name: 'River City Sports Club',
    website: 'https://rivercity.example',
    description: 'Local sports organization.',
    city: 'Portland',
    address: '100 Main Street',
  },
  mapping: {
    kind: 'EVENT' as const,
    listUrl: 'https://rivercity.example/events',
    itemSelector: '.event',
    fields: {
      title: { selector: '.title' },
      officialActionUrl: {
        selector: 'a',
        mode: 'attribute' as const,
        attribute: 'href',
      },
    },
  },
  expectedCandidates: [{
    listingKind: 'EVENT' as const,
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    sourceUrl: 'https://rivercity.example/events',
    sportName: 'Grass Soccer',
    tags: ['League'],
    venueName: 'River City Sports Complex',
    address: '100 Main Street',
    city: 'Portland',
    startsAt: null,
    dateDisplayMode: 'NO_FIXED_DATE' as const,
    dateDisplayText: 'Registration open',
    priceText: null,
    divisions: ['Adult'],
  }],
  logo: {
    disposition: 'OFFICIAL_ASSET' as const,
    artifactSha256: HASH_B,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
  sportDeterminations: [{
    sourceLabels: ['outdoor soccer'],
    status: 'RESOLVED' as const,
    resolutionBasis: 'SOURCE_EVIDENCE' as const,
    canonicalSportNames: ['Grass Soccer'],
    rationale: 'The page describes an outdoor grass soccer league.',
    evidence: [{
      artifactId: 'artifact_a',
      artifactSha256: HASH_A,
      artifactKind: 'PAGE_HTML' as const,
      pageUrl: 'https://rivercity.example/events',
      excerpt: 'outdoor soccer',
    }],
  }],
};

const blockedDraft = {
  ...allowedDraft,
  intakeId: 'intake_blocked',
  sourceKey: 'blocked-source',
  runId: 'run_blocked',
  policyDisposition: 'BLOCKED' as const,
  implementationMode: 'BLOCKED' as const,
  listingKind: null,
  evidence: [{
    artifactKind: 'PAGE_HTML',
    artifactSha256: HASH_B,
    pageUrl: 'https://blocked.example/robots.txt',
    supports: ['policyDisposition'],
  }],
  mapping: null,
  expectedCandidates: [],
  logo: {
    disposition: 'MISSING' as const,
    artifactSha256: null,
    sourceUrl: null,
  },
  sportDeterminations: [],
};

const examples: AffiliateMappingEvaluationExample[] = [
  {
    context: {
      contextContractVersion: 2,
      jobId: 'job_allowed',
      intakeId: 'intake_1',
      sourceKey: 'river-city',
      workerId: 'worker_1',
      claimedAt: '2026-01-01T00:00:00.000Z',
      runId: 'run_1',
      evidenceRunIds: ['run_1'],
      sportsCatalog,
      policyDisposition: 'ALLOWED',
      targetKindHints: ['EVENT'],
      artifacts: [{
        artifactId: 'artifact_a',
        kind: 'PAGE_HTML',
        sha256: HASH_A,
        pageUrl: 'https://rivercity.example/events',
        intakeId: 'intake_1',
        runId: 'run_1',
      }],
      instructionsRevision: 'v2',
    },
    expectedDraft: allowedDraft,
  },
  {
    exampleId: 'blocked',
    context: {
      contextContractVersion: 2,
      jobId: 'job_blocked',
      intakeId: 'intake_blocked',
      sourceKey: 'blocked-source',
      workerId: 'worker_1',
      claimedAt: '2026-01-01T00:00:00.000Z',
      runId: 'run_blocked',
      evidenceRunIds: ['run_blocked'],
      sportsCatalog,
      policyDisposition: 'BLOCKED',
      targetKindHints: [],
      artifacts: [{
        artifactId: 'artifact_b',
        kind: 'PAGE_HTML',
        sha256: HASH_B,
        pageUrl: 'https://blocked.example/robots.txt',
        intakeId: 'intake_blocked',
        runId: 'run_blocked',
      }],
      instructionsRevision: 'v2',
    },
    expectedDraft: blockedDraft,
  },
];

describe('affiliate mapping evaluation control harness', () => {
  it('passes a deterministic allowed draft and safe refusal', async () => {
    const worker = new FixtureAffiliateMappingModelClient(model, new Map([
      ['job_allowed', allowedDraft],
      ['job_blocked', blockedDraft],
    ]));
    const report = await evaluateAffiliateMappingModel({ examples, worker });
    expect(report.summary).toEqual(expect.objectContaining({
      exampleCount: 2,
      validResultEnvelopeRate: 1,
      safeRefusalAccuracy: 1,
      policyAccuracy: 1,
      targetKindAccuracy: 1,
      officialUrlAccuracy: 1,
      publishCriticalFieldAccuracy: 1,
      candidatePrecision: 1,
      candidateRecall: 1,
      evidenceCitationAccuracy: 1,
      generatorPassRate: 1,
      hardViolationCount: 0,
      assistedPilotEligible: true,
    }));
    expect(report.examples[0].generatedFileCount).toBe(4);
    expect(report.examples[1].generatedFileCount).toBe(0);
  });

  it('fails closed when a blocked fixture contains executable output', async () => {
    const unsafeBlocked = {
      ...allowedDraft,
      intakeId: 'intake_blocked',
      sourceKey: 'blocked-source',
      runId: 'run_blocked',
      policyDisposition: 'BLOCKED',
    };
    const worker = new FixtureAffiliateMappingModelClient(model, new Map([
      ['job_allowed', allowedDraft],
      ['job_blocked', unsafeBlocked],
    ]));
    const report = await evaluateAffiliateMappingModel({ examples, worker });
    expect(report.summary.assistedPilotEligible).toBe(false);
    expect(report.summary.validResultEnvelopeRate).toBe(0.5);
    expect(report.examples[1].hardViolations).toContain('BLOCKED_SOURCE_EXECUTABLE_OUTPUT');
  });

  it('rejects citations to artifacts outside the frozen job context', async () => {
    const unknownEvidence = {
      ...allowedDraft,
      evidence: [{
        ...allowedDraft.evidence[0],
        artifactSha256: HASH_C,
      }],
    };
    const worker = new FixtureAffiliateMappingModelClient(model, new Map([
      ['job_allowed', unknownEvidence],
      ['job_blocked', blockedDraft],
    ]));
    const report = await evaluateAffiliateMappingModel({ examples, worker });
    expect(report.examples[0].evidenceCitationAccuracy).toBe(0);
    expect(report.examples[0].hardViolations).toContain('UNKNOWN_EVIDENCE_ARTIFACT');
    expect(report.summary.assistedPilotEligible).toBe(false);
  });
});
