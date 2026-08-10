import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import * as affiliateSportsCatalog from '../src/server/affiliateImports/affiliateSportsCatalog';
import * as affiliateSportDetermination from '../src/server/affiliateImports/affiliateSportDetermination';
import * as sourceMappingClaimEvidence from '../src/server/affiliateImports/sourceMappingClaimEvidence';
import * as sourceMappingQueue from '../src/server/affiliateImports/sourceMappingQueue';
import * as affiliateAgentRunner from '../src/server/affiliateImports/agentRunner';
import * as affiliateAgentContracts from '../src/server/affiliateImports/agentContracts';
import * as approvalQueue from '../src/server/affiliateImports/approvalQueue';
import * as affiliateMappingLiveApplication from '../src/server/affiliateImports/affiliateMappingLiveApplication';
import * as approvalLogoEvidence from '../src/server/affiliateImports/approvalLogoEvidence';
import * as coverageAgentQueue from '../src/server/affiliateImports/coverageAgentQueue';
import * as sourceMappingHumanReview from '../src/server/affiliateImports/sourceMappingHumanReview';
import * as affiliateSportReconciliation from '../src/server/affiliateImports/affiliateSportReconciliation';

const CONTRACT = {
  schemaVersion: 1,
  contextContractVersion: 2,
  claimContractVersion: 1,
  completionCasVersion: 1,
  approvalResultVersion: 2,
  approvalCompletionCasVersion: 1,
  approvalEvidenceClaimVersion: 1,
  coverageRepairCasVersion: 1,
  standaloneLiveApplyEnabled: false,
  strategyRevision: 'sport-evidence-v1',
} as const;

type ModuleExports = Record<string, unknown>;

type RequiredModuleExports = readonly [string, ModuleExports, readonly string[]];

const requiredModuleExports: readonly RequiredModuleExports[] = [
  ['claim evidence service', sourceMappingClaimEvidence as unknown as ModuleExports, [
    'acquireAffiliateSourceMappingClaimEvidence',
    'storeAffiliateSourceMappingClaimEvidenceContext',
  ]],
  ['mapping completion CAS', sourceMappingQueue as unknown as ModuleExports, [
    'releaseAffiliateSourceMappingClaim',
    'finishAffiliateSourceMappingClaim',
  ]],
  ['live model-agent adapter', affiliateAgentRunner as unknown as ModuleExports, [
    'runAffiliateMappingDraftJob',
  ]],
  ['versioned model-agent result contract', affiliateAgentContracts as unknown as ModuleExports, [
    'affiliateMappingWorkerResultSchema',
  ]],
  ['approval completion', approvalQueue as unknown as ModuleExports, [
    'completeAffiliateApproval',
  ]],
  ['approval-gated live application', {
    ...(affiliateMappingLiveApplication as unknown as ModuleExports),
    ...(approvalQueue as unknown as ModuleExports),
  }, [
    'assertAffiliateMappingApprovalEligibility',
    'applyVerifiedAffiliateMappingPackage',
  ]],
  ['approval supplemental evidence', approvalLogoEvidence as unknown as ModuleExports, [
    'captureAffiliateApprovalLogoEvidence',
  ]],
  ['coverage repair boundary', coverageAgentQueue as unknown as ModuleExports, [
    'completeAffiliateCoverageJob',
  ]],
  ['mapping reviewer', sourceMappingHumanReview as unknown as ModuleExports, [
    'listAffiliateMappingHumanReviewJobs',
  ]],
  ['sport reconciliation', affiliateSportReconciliation as unknown as ModuleExports, [
    'selectAffiliateSportReconciliationRows',
    'applyAffiliateSportReconciliation',
  ]],
];

const assertRequiredModuleExports = (): void => {
  for (const [moduleName, moduleExports, names] of requiredModuleExports) {
    for (const name of names) {
      assert.equal(
        typeof moduleExports[name] === 'function' || typeof moduleExports[name] === 'object',
        true,
        `${moduleName} is missing required export ${name}`,
      );
    }
  }
};

const assertStandaloneApplyRemoved = (repositoryRoot: string): void => {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, unknown>;
  };
  assert.equal(
    packageJson.scripts?.['affiliate:mapping:apply-approved-live'],
    undefined,
    'The standalone live-application package command must be removed.',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'scripts/apply-approved-affiliate-mapping-jobs.ts')),
    false,
    'The standalone live-application CLI must be removed.',
  );
};

const runPureRepresentativeFixture = (): void => {
  const catalog = affiliateSportsCatalog.buildAffiliateSportsCatalogSnapshot([
    { id: 'fixture-grass-soccer', name: 'Grass Soccer' },
  ], '2026-08-10T00:00:00.000Z');
  const determination = affiliateSportDetermination.affiliateSportDeterminationSchema.parse({
    sourceLabels: ['Outdoor soccer'],
    status: 'RESOLVED',
    resolutionBasis: 'SOURCE_EVIDENCE',
    canonicalSportNames: ['Grass Soccer'],
    rationale: 'The stored first-party page expressly describes an outdoor grass soccer field.',
    evidence: [{
      artifactId: 'fixture-artifact',
      artifactSha256: 'a'.repeat(64),
      artifactKind: 'PAGE_HTML',
      pageUrl: 'https://example.test/sports',
      excerpt: 'Outdoor soccer on our grass field.',
    }],
  });
  const determinationHash = affiliateSportDetermination.affiliateSportDeterminationSha256(determination);
  assert.match(determinationHash, /^[a-f0-9]{64}$/);
  affiliateSportDetermination.verifyAffiliateSportCompletion({
    determinations: [determination],
    catalog,
    resultKind: 'REVIEW_REQUIRED',
  });
  assert.deepEqual(catalog.sports.map(({ name }) => name), ['Grass Soccer']);
  assert.equal(catalog.sha256, affiliateSportsCatalog.affiliateSportsCatalogSha256(catalog.sports));
};

const main = (): void => {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  assertStandaloneApplyRemoved(repositoryRoot);
  assertRequiredModuleExports();
  runPureRepresentativeFixture();
  process.stdout.write(`${JSON.stringify(CONTRACT)}\n`);
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
