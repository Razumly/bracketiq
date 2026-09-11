/** @jest-environment node */
import {
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLES,
  affiliateAgentContractBundleSchema,
  hashAffiliateAgentValue,
} from '../agentGatewayContracts';
import { buildAffiliateSupplyContractManifest } from '../affiliateSupplyLifecycle';
import {
  AffiliateSourceExclusionAdmissionError,
  assertAffiliateSourceExclusionClaimBinding,
  previewAffiliateSourceExclusionAdmission,
} from '../affiliateSourceExclusionAdmission';

const supplyManifest = buildAffiliateSupplyContractManifest({
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
const deploymentPreimage = {
  schemaVersion: 1,
  version: 1,
  gatewayVersion: 1,
  activeSupplyContract: { version: supplyManifest.supplyContract.version, hash: supplyManifest.supplyContract.hash },
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
    databaseRoles: { gateway: 'bracketiq_affiliate_gateway', lifecycleAuthority: 'bracketiq_affiliate_lifecycle', agent: 'bracketiq_affiliate_agent' },
  },
};
const bundle = affiliateAgentContractBundleSchema.parse({
  schemaVersion: 1,
  supplyContract: supplyManifest.supplyContract,
  roleContracts,
  promptTemplates,
  deploymentContract: {
    ...deploymentPreimage,
    hash: hashAffiliateAgentValue(deploymentPreimage),
  },
});

const artifactStore = {
  readImmutable: jest.fn(async () => {
    throw new Error('not reached');
  }),
};

describe('affiliate source exclusion admission', () => {
  it('requires one operator identity for preview before reading mutable state', async () => {
    await expect(previewAffiliateSourceExclusionAdmission({
      prisma: {} as never,
      artifactStore,
      bundle,
      gatewayJobId: 'producer-job',
      reason: 'exclude the held source',
    } as never)).rejects.toMatchObject<Partial<AffiliateSourceExclusionAdmissionError>>({
      code: 'OPERATOR_REQUIRED',
    });
    expect(artifactStore.readImmutable).not.toHaveBeenCalled();
  });

  it('fails closed when the required Gateway job delegate is unavailable', async () => {
    await expect(previewAffiliateSourceExclusionAdmission({
      prisma: {} as never,
      artifactStore,
      bundle,
      gatewayJobId: 'producer-job',
      reason: 'exclude the held source',
      operatorId: 'affiliate-gateway-operator',
    })).rejects.toMatchObject<Partial<AffiliateSourceExclusionAdmissionError>>({
      code: 'PERSISTENCE_UNAVAILABLE',
    });
  });

  it('rejects a non-source reviewer claim binding without querying or writing state', async () => {
    await expect(assertAffiliateSourceExclusionClaimBinding({
      prisma: {} as never,
      job: { role: 'MAPPING_PRODUCER', subjectType: 'MAPPING_PRODUCER' },
      claim: {},
    })).rejects.toMatchObject<Partial<AffiliateSourceExclusionAdmissionError>>({
      code: 'CLAIM_BINDING_INVALID',
    });
  });
});
