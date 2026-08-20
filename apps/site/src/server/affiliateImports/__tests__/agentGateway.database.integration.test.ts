/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  hashAffiliateAgentValue,
} from "../agentGatewayContracts";
import type {
  AffiliateAgentClaimAuthorization,
  AffiliateAgentClaimGrant,
  AffiliateAgentClaimRequest,
} from "../agentGateway";
import { createProductionAffiliateAgentGatewayDependencies } from "../agentGatewayAdapters";
import { createPrismaAffiliateAgentGateway } from "../prismaAgentGateway";

const describeDatabase =
  process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;
const DATABASE_NAME = "bracketiq_e2e_67_gateway";
const NOW = new Date("2026-08-20T18:00:00.000Z");

const supplyContractFixture = {
  schemaVersion: 1,
  version: 1,
  components: [
    {
      schemaVersion: 1,
      name: "COVERAGE_APPLICABILITY",
      version: 1,
      hash: "f13a898bc1710efb2b926ed38da263437d44afcd0039dc684065142d3d451608",
      payload: {
        applicability: [
          {
            sourceProfile: "EVENT",
            sportIds: ["sport_basketball", "sport_soccer"],
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "SEARCH_STRATEGIES",
      version: 1,
      hash: "0aa04cef3f1f03afb8359f17cece3fca596f5cae8fd4d95ca1ecdbd70378ca38",
      payload: {
        families: [
          {
            family: "OFFICIAL_SITE_SEARCH",
            minimumDistinctCycles: 2,
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "SUPPLY_TARGETS_AND_MARKET_TIERS",
      version: 1,
      hash: "0de164fdcc9a4b0cb731cc2dd659706c79d657f6d0512b25ca0027e3c3139c03",
      payload: {
        tiers: [
          {
            tier: "LARGE",
            targets: [
              {
                minimumFreshPublishedSupply: 2,
                sourceProfile: "EVENT",
              },
            ],
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "FRESHNESS",
      version: 1,
      hash: "69ff8f25c91412b3327058ed9daefee5b52cdfc784efd8294704c30adcb20340",
      payload: {
        windows: [
          {
            maximumAgeHours: 24,
            sourceProfile: "EVENT",
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "MAPPING_EVIDENCE",
      version: 1,
      hash: "277dd86e998a419d93a1b4fe7045b90754979a73202e0e39f3600f71edd56d76",
      payload: {
        requiredEvidenceKinds: ["EXPECTED_CANDIDATE", "PAGE_MARKDOWN"],
        requiresDeterministicValidation: true,
      },
    },
    {
      schemaVersion: 1,
      name: "LIFECYCLE_EVIDENCE",
      version: 1,
      hash: "db8e8c028ef8876ad00d5a7dea9ddbf89fc014c1991a7c690b2b21745db26d29",
      payload: {
        requiredEvidenceKinds: ["DURABLE_SOURCE_EVIDENCE", "VALIDATION_OUTPUT"],
        requiresIndependentReview: true,
      },
    },
  ],
  hash: "fb7d336037f5dafbe4bfd37d4b21e369b12da6b328051744fe3fe28d8c9608c0",
} as const;

const contractBundleFixture = (() => {
  const deploymentPreimage = {
    schemaVersion: 1,
    version: 1,
    gatewayVersion: 1,
    activeSupplyContract: {
      version: supplyContractFixture.version,
      hash: supplyContractFixture.hash,
    },
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(
      ({ role, version, hash }) => ({ role, version, hash }),
    ),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES).map(
      ({ role, version, hash }) => ({ role, version, hash }),
    ),
    expectedTopology: {
      claimsPerInvocation: 1,
      freshWorkspacePerClaim: true,
      processCommand: ["codex", "exec", "--ephemeral"],
      nestedGoal: false,
      claimLoop: false,
      contextReuse: false,
      executionClass: "PRODUCTION_CODEX",
    },
  };
  return {
    schemaVersion: 1,
    supplyContract: supplyContractFixture,
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES),
    deploymentContract: {
      ...deploymentPreimage,
      hash: hashAffiliateAgentValue(deploymentPreimage),
    },
  };
})();

const authorizationFor = (
  grant: AffiliateAgentClaimGrant,
): AffiliateAgentClaimAuthorization => ({
  token: grant.token,
  jobId: grant.envelope.jobId,
  claimId: grant.envelope.claimId,
  claimGeneration: grant.envelope.claimGeneration,
  lifecycleGeneration: grant.envelope.lifecycleGeneration,
  role: grant.envelope.role,
  workerId: grant.envelope.workerId,
  invocationId: grant.envelope.invocationId,
  supplyContractHash: grant.envelope.supplyContractHash,
});

const requestFor = (worker: string): AffiliateAgentClaimRequest => ({
  idempotencyKey: `gateway-race-request-${worker}`,
  roleCredential: "coverage-planner-test-credential",
  role: "COVERAGE_PLANNER",
  workerId: `gateway-race-worker-${worker}`,
  invocationId: `gateway-race-invocation-${worker}`,
  workspaceAttestation: {
    schemaVersion: 1,
    workspaceId: `gateway-race-workspace-${worker}`,
    mode: "READ_WRITE",
    executionClass: "PRODUCTION_CODEX",
    workerId: `gateway-race-worker-${worker}`,
    invocationId: `gateway-race-invocation-${worker}`,
    issuedAt: "2026-08-20T17:59:00.000Z",
    expiresAt: "2026-08-20T18:20:00.000Z",
    signature: "valid-test-attestation",
  },
});

const truncateGatewayTables = async (): Promise<void> => {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      "AffiliateAgentGatewayEvents",
      "AffiliateAgentGatewayOperationReceipts",
      "AffiliateAgentGatewayArtifacts",
      "AffiliateAgentGatewayClaims",
      "AffiliateAgentGatewayJobs"
  `;
};

describeDatabase("Affiliate Agent Gateway PostgreSQL authority", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (rows[0]?.database !== DATABASE_NAME) {
      throw new Error(`Gateway integration requires ${DATABASE_NAME}.`);
    }
    await truncateGatewayTables();
  });

  afterAll(async () => {
    await truncateGatewayTables();
    await prisma.$disconnect();
  });

  it("admits one race winner and persists CAS, idempotency, and terminal replay", async () => {
    const runId = randomUUID();
    const artifactBytes = Buffer.from("database gateway evidence", "utf8");
    const manifestPreimage = {
      schemaVersion: 1,
      entries: [
        {
          evidenceRef: "database-evidence-1",
          kind: "PAGE_MARKDOWN",
          artifactId: `database-file-${runId}`,
          sha256: createHash("sha256").update(artifactBytes).digest("hex"),
          mimeType: "text/markdown",
          byteSize: artifactBytes.byteLength,
          retention: "INDEFINITE",
        },
      ],
    };
    await prisma.affiliateAgentGatewayJobs.create({
      data: {
        id: `gateway-job-${runId}`,
        dedupeKey: `gateway-dedupe-${runId}`,
        queue: "AFFILIATE_COVERAGE",
        lane: "COVERAGE_PLANNING",
        role: "COVERAGE_PLANNER",
        subjectType: "COVERAGE_PLANNER",
        subjectId: `coverage-cell-${runId}`,
        subjectJson: {
          type: "COVERAGE_PLANNER",
          coverageCellId: `coverage-cell-${runId}`,
          assessmentCycleId: "database-cycle-1",
        },
        evidenceManifestJson: {
          ...manifestPreimage,
          hash: hashAffiliateAgentValue(manifestPreimage),
        },
        nextAttemptAt: NOW,
      },
    });

    let selectedCount = 0;
    let releaseSelection = (): void => undefined;
    let markBothSelected = (): void => undefined;
    const selectionBarrier = new Promise<void>((resolve) => {
      releaseSelection = resolve;
    });
    const bothSelected = new Promise<void>((resolve) => {
      markBothSelected = resolve;
    });
    const racingPrisma = prisma.$extends({
      query: {
        affiliateAgentGatewayJobs: {
          async findFirst({ args, query }) {
            const selected = await query(args);
            if (selected?.id === `gateway-job-${runId}`) {
              selectedCount += 1;
              if (selectedCount === 2) markBothSelected();
              await selectionBarrier;
            }
            return selected;
          },
        },
      },
    });
    const dependencies = createProductionAffiliateAgentGatewayDependencies({
      prisma: racingPrisma,
      tokenSigningKey: Buffer.from("database-gateway-signing-key".repeat(2)),
      tokenKeyVersion: "database-key-v1",
      clock: { now: () => new Date(NOW) },
      identifiers: { create: (kind) => `${kind}-${randomUUID()}` },
      credentials: { verify: async () => true },
      workspaces: { verify: async () => true },
      contracts: { loadActiveBundle: async () => contractBundleFixture },
      artifacts: {
        readImmutable: async () => ({
          bytes: new Uint8Array(artifactBytes),
          mimeType: "text/markdown",
          byteSize: artifactBytes.byteLength,
          sourceUrl: "https://evidence.example.test/database",
        }),
      },
      commands: { transactional: {}, external: {} },
      lifecycle: { kind: "UNAVAILABLE" },
    });
    const gateway = createPrismaAffiliateAgentGateway(dependencies);
    const claimPromises = [
      gateway.claim(requestFor("one")),
      gateway.claim(requestFor("two")),
    ];
    await bothSelected;
    releaseSelection();
    expect(selectedCount).toBe(2);
    const grants = await Promise.all(claimPromises);
    const winners = grants.filter(
      (grant): grant is AffiliateAgentClaimGrant => grant !== null,
    );

    expect(winners).toHaveLength(1);
    const grant = winners[0];
    if (!grant) throw new Error("Expected one database claim winner.");
    const authorization = authorizationFor(grant);
    await expect(
      gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: "database-stale-generation",
        authorization: {
          ...authorization,
          claimGeneration: authorization.claimGeneration + 1,
        },
      }),
    ).rejects.toMatchObject({ code: "CLAIM_GENERATION_STALE" });

    const heartbeat = {
      kind: "HEARTBEAT" as const,
      idempotencyKey: "database-heartbeat",
      authorization,
    };
    const heartbeatAccepted = await gateway.perform(heartbeat);
    expect(await gateway.perform(heartbeat)).toEqual(heartbeatAccepted);

    const activeClaim =
      await prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      });
    await expect(
      prisma.affiliateAgentGatewayClaims.create({
        data: {
          id: `duplicate-claim-${runId}`,
          jobId: activeClaim.jobId,
          parentClaimId: activeClaim.parentClaimId,
          claimGeneration: activeClaim.claimGeneration + 1,
          lifecycleGeneration: activeClaim.lifecycleGeneration,
          queue: activeClaim.queue,
          lane: activeClaim.lane,
          role: activeClaim.role,
          workerId: `duplicate-worker-${runId}`,
          invocationId: `duplicate-invocation-${runId}`,
          workspaceId: `duplicate-workspace-${runId}`,
          workspaceMode: activeClaim.workspaceMode,
          workspaceAttestationHash: activeClaim.workspaceAttestationHash,
          claimRequestId: `duplicate-request-${runId}`,
          claimRequestHash: activeClaim.claimRequestHash,
          claimedAt: activeClaim.claimedAt,
          lastHeartbeatAt: activeClaim.lastHeartbeatAt,
          leaseExpiresAt: activeClaim.leaseExpiresAt,
          hardDeadlineAt: activeClaim.hardDeadlineAt,
          tokenNonce: `duplicate-nonce-${runId}`,
          tokenHash: createHash("sha256")
            .update(`duplicate-token-${runId}`)
            .digest("hex"),
          tokenKeyVersion: activeClaim.tokenKeyVersion,
          tokenExpiresAt: activeClaim.tokenExpiresAt,
          deploymentContractVersion: activeClaim.deploymentContractVersion,
          deploymentContractHash: activeClaim.deploymentContractHash,
          roleContractVersion: activeClaim.roleContractVersion,
          roleContractHash: activeClaim.roleContractHash,
          promptTemplateVersion: activeClaim.promptTemplateVersion,
          promptTemplateHash: activeClaim.promptTemplateHash,
          supplyContractVersion: activeClaim.supplyContractVersion,
          supplyContractHash: activeClaim.supplyContractHash,
          claimEnvelopeHash: activeClaim.claimEnvelopeHash,
          claimEnvelopeJson: grant.envelope,
          evidenceManifestHash: activeClaim.evidenceManifestHash,
          permittedCommandHash: activeClaim.permittedCommandHash,
          permittedCommands: activeClaim.permittedCommands,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const terminalOperation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "database-terminal",
      authorization,
      result: {
        schemaVersion: 1 as const,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        roleContractVersion: grant.envelope.roleContractVersion,
        roleContractHash: grant.envelope.roleContractHash,
        supplyContractHash: grant.envelope.supplyContractHash,
        workerId: grant.envelope.workerId,
        invocationId: grant.envelope.invocationId,
        role: "COVERAGE_PLANNER" as const,
        disposition: "NO_ACTION" as const,
        reasonCodes: ["NO_QUALIFIED_ACTION"] as const,
        evidenceRefs: ["database-evidence-1"] as const,
        summary: "The database race left one authoritative claim.",
        payload: { basis: "NO_QUALIFIED_ACTION" as const },
      },
    };
    const terminalAccepted = await gateway.perform(terminalOperation);
    expect(await gateway.perform(terminalOperation)).toEqual(terminalAccepted);

    const [job, claim, claimCount, receiptCount, eventCount] =
      await Promise.all([
        prisma.affiliateAgentGatewayJobs.findUnique({
          where: { id: grant.envelope.jobId },
        }),
        prisma.affiliateAgentGatewayClaims.findUnique({
          where: { id: grant.envelope.claimId },
        }),
        prisma.affiliateAgentGatewayClaims.count({
          where: { jobId: grant.envelope.jobId },
        }),
        prisma.affiliateAgentGatewayOperationReceipts.count({
          where: { claimId: grant.envelope.claimId },
        }),
        prisma.affiliateAgentGatewayEvents.count({
          where: { jobId: grant.envelope.jobId },
        }),
      ]);
    expect({
      selectedCount,
      claimCount,
      receiptCount,
      eventCount,
      jobStatus: job?.status,
      activeClaimId: job?.activeClaimId,
      claimStatus: claim?.status,
      tokenInvalidated: claim?.tokenInvalidatedAt instanceof Date,
    }).toEqual({
      selectedCount: 2,
      claimCount: 1,
      receiptCount: 2,
      eventCount: 3,
      jobStatus: "COMPLETED",
      activeClaimId: null,
      claimStatus: "COMPLETED",
      tokenInvalidated: true,
    });
    await expect(
      prisma.affiliateAgentGatewayEvents.updateMany({
        where: { jobId: grant.envelope.jobId },
        data: { payload: { mutated: true } },
      }),
    ).rejects.toThrow("Affiliate Agent Gateway events are immutable");
  }, 20_000);
});
