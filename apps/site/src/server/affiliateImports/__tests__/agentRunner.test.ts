/** @jest-environment node */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  runAffiliateMappingDraftJob,
} from '../agentRunner';
import { FixtureAffiliateMappingModelClient } from '../agentModelClient';
import { buildAffiliateSportsCatalogSnapshot } from '../affiliateSportsCatalog';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const sportsCatalog = buildAffiliateSportsCatalogSnapshot(
  [{ id: 'sport_1', name: 'Grass Soccer' }],
  '2026-01-01T00:00:00.000Z',
);
const HASH_C = 'c'.repeat(64);

const model = {
  family: 'fixture',
  upstreamRepository: 'bracketiq/fixture',
  upstreamRevision: 'fixture-v1',
  artifactSha256: HASH_C,
  adapterRevision: null,
  promptTemplateRevision: 'prompt-v1',
};

const draft = {
  schemaVersion: 2,
  contextContractVersion: 2,
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'ALLOWED',
  implementationMode: 'GENERIC_MAPPING',
  listingKind: 'EVENT',
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
    kind: 'EVENT',
    listUrl: 'https://rivercity.example/events',
    itemSelector: '.event',
    fields: {
      title: { selector: '.title' },
      officialActionUrl: {
        selector: 'a',
        mode: 'attribute',
        attribute: 'href',
      },
    },
  },
  expectedCandidates: [{
    listingKind: 'EVENT',
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    sportName: 'Grass Soccer',
    tags: ['League'],
    divisions: [],
  }],
  logo: {
    disposition: 'OFFICIAL_ASSET',
    artifactSha256: HASH_B,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
  sportDeterminations: [{
    sourceLabels: ['outdoor soccer'],
    status: 'RESOLVED',
    resolutionBasis: 'SOURCE_EVIDENCE',
    canonicalSportNames: ['Grass Soccer'],
    rationale: 'Outdoor soccer evidence.',
    evidence: [{
      artifactId: 'artifact_events',
      artifactSha256: HASH_A,
      artifactKind: 'PAGE_HTML',
      pageUrl: 'https://rivercity.example/events',
      excerpt: 'outdoor soccer',
    }],
  }],
};

const context = {
  contextContractVersion: 2,
  jobId: 'job_1',
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  workerId: 'worker_1',
  claimedAt: '2026-01-01T00:00:00.000Z',
  runId: 'run_1',
  evidenceRunIds: ['run_1'],
  sportsCatalog,
  policyDisposition: 'ALLOWED' as const,
  targetKindHints: ['EVENT' as const],
  artifacts: [{
    artifactId: 'artifact_events',
    kind: 'PAGE_HTML',
    sha256: HASH_A,
    pageUrl: 'https://rivercity.example/events',
    intakeId: 'intake_1',
    runId: 'run_1',
  }],
  instructionsRevision: 'v2',
};

describe('affiliate mapping isolated job runner', () => {
  it('renders a valid draft and records validation without publishing', async () => {
      const worktreeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'affiliate-agent-runner-'));
    try {
      const result = await runAffiliateMappingDraftJob({
        context,
        workerId: 'worker_1',
        modelClient: new FixtureAffiliateMappingModelClient(model, new Map([
          ['job_1', draft],
        ])),
        modelManifestSha256: HASH_C,
        promptContractVersion: 2,
        worktreeRoot,
        validate: async ({ generatedPaths }) => ({
          testsPassed: generatedPaths.length === 4,
          scrapePassed: true,
          warnings: [],
        }),
      });
      expect(result).toEqual(expect.objectContaining({
        status: 'DRAFT_READY',
        jobId: 'job_1',
        intakeId: 'intake_1',
        generatedFiles: expect.arrayContaining([
          expect.objectContaining({
            path: 'apps/site/scripts/setup-river-city-affiliate-source.ts',
          }),
        ]),
        validation: {
          schemaPassed: true,
          testsPassed: true,
          scrapePassed: true,
          warnings: [],
        },
      }));
      const setup = await fs.readFile(
        `${worktreeRoot}/apps/site/scripts/setup-river-city-affiliate-source.ts`,
        'utf8',
      );
      expect(setup).toContain('autoScrapeEnabled: false');
      expect(setup).toContain('validatedAt: null');
    } finally {
      await fs.rm(worktreeRoot, { recursive: true, force: true });
    }
  });

  it('rejects identity, policy, and evidence outside the claimed context', async () => {
      const worktreeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'affiliate-agent-runner-'));
    try {
      for (const unsafeDraft of [
        { ...draft, intakeId: 'different_intake' },
        { ...draft, policyDisposition: 'NEEDS_REVIEW', implementationMode: 'INSUFFICIENT_EVIDENCE', mapping: null, expectedCandidates: [] },
        { ...draft, evidence: [{ ...draft.evidence[0], artifactSha256: HASH_C }] },
      ]) {
        await expect(runAffiliateMappingDraftJob({
          context,
          workerId: 'worker_1',
          modelClient: new FixtureAffiliateMappingModelClient(model, new Map([
            ['job_1', unsafeDraft],
          ])),
          modelManifestSha256: HASH_C,
          promptContractVersion: 2,
          worktreeRoot,
        })).rejects.toThrow();
      }
    } finally {
      await fs.rm(worktreeRoot, { recursive: true, force: true });
    }
  });

  it('returns a refusal without writing files for a blocked job', async () => {
      const worktreeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'affiliate-agent-runner-'));
    const blockedContext = {
      ...context,
      jobId: 'job_blocked',
      policyDisposition: 'BLOCKED' as const,
      artifacts: [{
        artifactId: 'artifact_robots',
        kind: 'ROBOTS',
        sha256: HASH_B,
        pageUrl: 'https://blocked.example/robots.txt',
        intakeId: 'intake_1',
        runId: 'run_1',
      }],
    };
    const blockedDraft = {
      ...draft,
      policyDisposition: 'BLOCKED',
      implementationMode: 'BLOCKED',
      listingKind: null,
      evidence: [{
        artifactKind: 'ROBOTS',
        artifactSha256: HASH_B,
        pageUrl: 'https://blocked.example/robots.txt',
        supports: ['policyDisposition'],
      }],
      mapping: null,
      expectedCandidates: [],
      logo: {
        disposition: 'MISSING',
        artifactSha256: null,
        sourceUrl: null,
      },
    };
    try {
      const result = await runAffiliateMappingDraftJob({
        context: blockedContext,
        workerId: 'worker_1',
        modelClient: new FixtureAffiliateMappingModelClient(model, new Map([
          ['job_blocked', blockedDraft],
        ])),
        modelManifestSha256: HASH_C,
        promptContractVersion: 2,
        worktreeRoot,
        validate: async () => ({
          testsPassed: true,
          scrapePassed: true,
          warnings: [],
        }),
      });
      expect(result.status).toBe('REFUSED');
      expect(result.generatedFiles).toHaveLength(0);
      expect(await fs.readdir(worktreeRoot)).toHaveLength(0);
    } finally {
      await fs.rm(worktreeRoot, { recursive: true, force: true });
    }
  });
});
