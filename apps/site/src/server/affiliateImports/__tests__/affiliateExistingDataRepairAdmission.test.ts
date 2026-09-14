/** @jest-environment node */
import type { PrismaClient } from '@/generated/prisma/client';
import {
  AFFILIATE_AGENT_ROLES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  affiliateAgentContractBundleSchema,
  hashAffiliateAgentValue,
} from '../agentGatewayContracts';
import { buildAffiliateSupplyContractManifest } from '../affiliateSupplyLifecycle';
import {
  AffiliateExistingDataRepairAdmissionError,
  assertAffiliateExistingDataRepairClaimBinding,
  previewAffiliateExistingDataRepairAdmission,
} from '../affiliateExistingDataRepairAdmission';

const manifest = buildAffiliateSupplyContractManifest({
  version: 1,
  rolloutCohort: 'DEFAULT',
  status: 'ACTIVE',
  supplyContract: {
    schemaVersion: 1,
    version: 1,
    rolloutCohort: 'DEFAULT',
    freshnessWindows: [{ sourceProfile: 'CLUB', maximumAgeHours: 168 }],
    targets: [{ marketKey: 'test-market', sportId: 'Grass Soccer', sourceProfile: 'CLUB', minimumFreshPublishedSupply: 1 }],
    requiredMappingEvidenceKinds: ['PAGE_HTML'],
    requiredLifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
    searchSaturationMinimumCycles: 2,
  },
});
const roleContracts = AFFILIATE_AGENT_ROLES.map((role) => AFFILIATE_AGENT_ROLE_CONTRACTS[role]);
const promptTemplates = AFFILIATE_AGENT_ROLES.map((role) => AFFILIATE_AGENT_PROMPT_TEMPLATES[role]);
const deployment = {
  schemaVersion: 1,
  version: 1,
  gatewayVersion: 1,
  activeSupplyContract: { version: manifest.supplyContract.version, hash: manifest.supplyContract.hash },
  roleContracts: roleContracts.map(({ role, version, hash }) => ({ role, version, hash })),
  promptTemplates: promptTemplates.map(({ role, version, hash }) => ({ role, version, hash })),
  expectedTopology: {
    claimsPerInvocation: 1,
    hasFreshWorkspacePerClaim: true,
    processCommand: ['affiliate-omp-agent'],
    hasNestedGoal: false,
    hasClaimLoop: false,
    hasContextReuse: false,
    executionClass: 'PRODUCTION_OMP',
    databaseRoles: {
      gateway: 'bracketiq_affiliate_gateway',
      lifecycleAuthority: 'bracketiq_affiliate_lifecycle',
      agent: 'bracketiq_affiliate_agent',
    },
  },
};
const bundle = affiliateAgentContractBundleSchema.parse({
  schemaVersion: 1,
  supplyContract: manifest.supplyContract,
  roleContracts,
  promptTemplates,
  deploymentContract: { ...deployment, hash: hashAffiliateAgentValue(deployment) },
});
const baseInput = {
  prisma: {} as PrismaClient,
  bundle,
  reason: 'repair existing source',
  operatorId: 'operator-test',
};
const admissionError = (error: unknown): AffiliateExistingDataRepairAdmissionError => {
  expect(error).toBeInstanceOf(AffiliateExistingDataRepairAdmissionError);
  return error as AffiliateExistingDataRepairAdmissionError;
};

describe('existing-data repair admission safety', () => {
  it('requires explicit job or source selection', async () => {
    await expect(previewAffiliateExistingDataRepairAdmission(baseInput)).rejects.toMatchObject({
      code: 'SELECTION_REQUIRED',
    });
  });

  it('bounds combined explicit selection before reading mutable data', async () => {
    const jobIds = Array.from({ length: 21 }, (_, index) => `job-${index}`);
    await expect(previewAffiliateExistingDataRepairAdmission({ ...baseInput, jobIds })).rejects.toMatchObject({
      code: 'SELECTION_LIMIT_EXCEEDED',
    });
  });

  it('rejects repeated evidence selections and more than two supporting pages', async () => {
    const duplicate = previewAffiliateExistingDataRepairAdmission({
      ...baseInput,
      jobIds: ['job-a'],
      evidenceSelections: [
        { jobId: 'job-a', runId: 'run-a', pageId: 'page-a' },
        { jobId: 'job-a', runId: 'run-b', pageId: 'page-b' },
      ],
    });
    const tooManySupportPages = previewAffiliateExistingDataRepairAdmission({
      ...baseInput,
      jobIds: ['job-a'],
      evidenceSelections: [{ jobId: 'job-a', runId: 'run-a', pageId: 'page-a', supportingPageIds: ['page-b', 'page-c', 'page-d'] }],
    });
    await expect(duplicate).rejects.toMatchObject({ code: 'DUPLICATE_EVIDENCE_SELECTION' });
    await expect(tooManySupportPages).rejects.toMatchObject({ code: 'SUPPORTING_PAGE_LIMIT_EXCEEDED' });
  });

  it('requires the Gateway job to be present in the active database', async () => {
    const prisma = {
      affiliateAgentGatewayJobs: { findUnique: async () => null },
    } as unknown as PrismaClient;
    try {
      await assertAffiliateExistingDataRepairClaimBinding({ prisma, job: { id: 'gateway-job' }, claim: {} });
      throw new Error('expected claim binding to fail');
    } catch (error) {
      expect(admissionError(error).code).toBe('CLAIM_BINDING_INVALID');
    }
  });
});
