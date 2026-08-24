/** @jest-environment node */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  AffiliateSupplyContractManifestStatus,
  AffiliateSupplyLifecycleStage,
  AffiliateSupplyTargetStatus,
} from "@/generated/prisma/enums";
import {
  buildAffiliateSupplyContractImpactReport,
  buildAffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
} from "../affiliateSupplyLifecycle";
import {
  activateAffiliateSupplyContract,
  executeAffiliateSupplyLifecycleCommand,
  reconcileAffiliateReplenishmentDemands,
} from "../affiliateSupplyPersistence";

const describeDatabase = process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;
const DATABASE_NAME = "bracketiq_e2e_68_lifecycle";
const TEST_PREFIX = `issue68-lifecycle-${randomUUID()}`;
const NOW = new Date("2026-08-22T12:00:00.000Z");

const newId = (label: string): string => `${TEST_PREFIX}-${label}-${randomUUID()}`;

const policyFor = (
  rolloutCohort: string,
  version: number,
  minimumFreshPublishedSupply = 1,
): Omit<AffiliateSupplyContractPolicy, "hash"> & Partial<Pick<AffiliateSupplyContractPolicy, "hash">> => ({
  schemaVersion: 1,
  version,
  rolloutCohort,
  hash: undefined,
  freshnessWindows: [{ sourceProfile: "EVENT", maximumAgeHours: 24 }],
  targets: [{
    marketKey: "portland",
    sportId: "soccer",
    sourceProfile: "EVENT",
    minimumFreshPublishedSupply,
  }],
  requiredMappingEvidenceKinds: ["PAGE_HTML"],
  requiredLifecycleEvidenceKinds: ["DURABLE_SOURCE_EVIDENCE", "VALIDATION_OUTPUT"],
});

const activateContract = async (
  rolloutCohort: string,
  version: number,
  minimumFreshPublishedSupply = 1,
) => {
  const manifest = buildAffiliateSupplyContractManifest({
    version,
    rolloutCohort,
    supplyContract: policyFor(rolloutCohort, version, minimumFreshPublishedSupply),
    status: "ACTIVE",
  });
  const currentManifest = buildAffiliateSupplyContractManifest({
    version: version - 1,
    rolloutCohort,
    supplyContract: {
      ...policyFor(rolloutCohort, version - 1, minimumFreshPublishedSupply),
      targets: [],
    },
    status: "ACTIVE",
  });
  const impactReport = buildAffiliateSupplyContractImpactReport({
    currentManifest,
    sources: [],
    nextPolicy: manifest.supplyContract,
  });
  await activateAffiliateSupplyContract({
    manifest,
    userId: "issue-68-integration",
    impactReport,
    now: NOW,
  });
  return manifest;
};

const createRoot = async (rolloutCohort: string, label: string): Promise<string> => {
  const id = newId(`root-${label}`);
  await prisma.affiliateSupplySources.create({
    data: {
      id,
      identityKey: `${TEST_PREFIX}:identity:${label}`,
      canonicalUrl: `https://example.com/${label}`,
      origin: "https://example.com",
      pathKey: `/${label}`,
      targetKind: "EVENT",
      rolloutCohort,
      derivedStage: AffiliateSupplyLifecycleStage.PRE_MAPPED,
    },
  });
  return id;
};

const cleanup = async (): Promise<void> => {
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`ALTER TABLE "AffiliateSupplyLifecycleTransitions" DISABLE TRIGGER "AffiliateSupplyLifecycleTransitions_immutable"`;
    await transaction.$executeRaw`ALTER TABLE "AffiliateSupplyContractManifests" DISABLE TRIGGER "AffiliateSupplyContractManifests_immutable_content"`;
    try {
      await transaction.affiliateReplenishmentWaves.deleteMany({
        where: { demandId: { startsWith: TEST_PREFIX } },
      });
      await transaction.affiliateReplenishmentDemands.deleteMany({
        where: { rolloutCohort: { startsWith: TEST_PREFIX } },
      });
      await transaction.affiliateSupplyLifecycleTransitions.deleteMany({
        where: { supplySourceId: { startsWith: TEST_PREFIX } },
      });
      await transaction.affiliateSupplyTargets.deleteMany({
        where: { supplySourceId: { startsWith: TEST_PREFIX } },
      });
      await transaction.affiliateScrapeRuns.deleteMany({
        where: { supplySourceId: { startsWith: TEST_PREFIX } },
      });
      await transaction.affiliateSupplySources.deleteMany({
        where: { id: { startsWith: TEST_PREFIX } },
      });
      await transaction.affiliateSupplyContractManifests.deleteMany({
        where: { rolloutCohort: { startsWith: TEST_PREFIX } },
      });
    } finally {
      await transaction.$executeRaw`ALTER TABLE "AffiliateSupplyLifecycleTransitions" ENABLE TRIGGER "AffiliateSupplyLifecycleTransitions_immutable"`;
      await transaction.$executeRaw`ALTER TABLE "AffiliateSupplyContractManifests" ENABLE TRIGGER "AffiliateSupplyContractManifests_immutable_content"`;
    }
  });
};

describeDatabase("Affiliate Supply lifecycle PostgreSQL authority", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (rows[0]?.database !== DATABASE_NAME) {
      throw new Error(`Lifecycle integration requires ${DATABASE_NAME}.`);
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("allows one generation winner and replays its idempotent transition", async () => {
    const rolloutCohort = `${TEST_PREFIX}-cas`;
    const manifest = await activateContract(rolloutCohort, 1);
    const supplySourceId = await createRoot(rolloutCohort, "cas");
    const firstInput = {
      supplySourceId,
      command: "RECORD_REFRESH_FAILURE" as const,
      authority: "SYSTEM" as const,
      expectedLifecycleGeneration: 0,
      idempotencyKey: newId("cas-first"),
      request: { evidenceRefs: ["integration:cas"], errorMessage: "provider unavailable" },
      actorKind: "SYSTEM",
      actorId: "integration-cas",
      rolloutCohort,
      now: NOW,
    };
    const secondInput = {
      ...firstInput,
      idempotencyKey: newId("cas-second"),
    };

    const outcomes = await Promise.allSettled([
      executeAffiliateSupplyLifecycleCommand(firstInput),
      executeAffiliateSupplyLifecycleCommand(secondInput),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const transition = await prisma.affiliateSupplyLifecycleTransitions.findFirst({
      where: { supplySourceId },
    });
    expect(transition).toEqual(expect.objectContaining({
      generation: 1,
      contractVersion: manifest.version,
    }));
    const winningInput = transition?.idempotencyKey === firstInput.idempotencyKey ? firstInput : secondInput;
    await expect(executeAffiliateSupplyLifecycleCommand(winningInput)).resolves.toEqual(
      expect.objectContaining({ replayed: true }),
    );
    await expect(prisma.affiliateSupplyLifecycleTransitions.update({
      where: { id: transition?.id },
      data: { resultJson: { tampered: true } },
    })).rejects.toThrow();
  });

  it("rolls back a lifecycle run update when a later target write fails", async () => {
    const rolloutCohort = `${TEST_PREFIX}-rollback`;
    await activateContract(rolloutCohort, 1);
    const supplySourceId = await createRoot(rolloutCohort, "rollback");
    const runId = newId("run-rollback");
    await prisma.affiliateScrapeRuns.create({
      data: {
        id: runId,
        sourceId: newId("source-rollback"),
        supplySourceId,
        status: "PENDING",
      },
    });

    await expect(executeAffiliateSupplyLifecycleCommand({
      supplySourceId,
      command: "RECORD_REFRESH_FAILURE",
      authority: "SYSTEM",
      expectedLifecycleGeneration: 0,
      idempotencyKey: newId("rollback-command"),
      request: {
        runId,
        evidenceRefs: ["integration:rollback"],
        targets: [{ targetType: "UNSUPPORTED", targetId: "bad-target", sourceProfile: "EVENT" }],
      },
      actorKind: "SYSTEM",
      actorId: "integration-rollback",
      rolloutCohort,
      now: NOW,
    })).rejects.toThrow();

    await expect(prisma.affiliateScrapeRuns.findUnique({ where: { id: runId } })).resolves.toEqual(
      expect.objectContaining({ status: "PENDING" }),
    );
    await expect(prisma.affiliateSupplySources.findUnique({ where: { id: supplySourceId } })).resolves.toEqual(
      expect.objectContaining({ lifecycleGeneration: 0 }),
    );
    await expect(prisma.affiliateSupplyLifecycleTransitions.count({ where: { supplySourceId } })).resolves.toBe(0);
  });

  it("enforces one active contract per cohort and durable demand state", async () => {
    const rolloutCohort = `${TEST_PREFIX}-contract`;
    const firstManifest = await activateContract(rolloutCohort, 1, 2);
    const secondManifest = buildAffiliateSupplyContractManifest({
      version: 2,
      rolloutCohort,
      supplyContract: policyFor(rolloutCohort, 2, 2),
      status: "ACTIVE",
    });
    const secondImpact = buildAffiliateSupplyContractImpactReport({
      currentManifest: firstManifest,
      sources: [],
      nextPolicy: secondManifest.supplyContract,
    });
    await activateAffiliateSupplyContract({
      manifest: secondManifest,
      userId: "issue-68-integration",
      impactReport: secondImpact,
      now: NOW,
    });
    await expect(prisma.affiliateSupplyContractManifests.count({
      where: { rolloutCohort, status: AffiliateSupplyContractManifestStatus.ACTIVE },
    })).resolves.toBe(1);
    await expect(prisma.affiliateSupplyContractManifests.create({
      data: {
        id: newId("duplicate-active-contract"),
        rolloutCohort,
        version: 3,
        status: AffiliateSupplyContractManifestStatus.ACTIVE,
        contractHash: newId("duplicate-contract-hash"),
        contractJson: secondManifest.supplyContract,
        componentHashes: [],
      },
    })).rejects.toThrow();

    const publishedRootId = await createRoot(rolloutCohort, "demand");
    await prisma.affiliateSupplySources.update({
      where: { id: publishedRootId },
      data: { derivedStage: AffiliateSupplyLifecycleStage.PUBLISHED },
    });
    const targetData = {
      supplySourceId: publishedRootId,
      targetType: "EVENT",
      sourceProfile: "EVENT",
      marketKey: "portland",
      sportId: "soccer",
      status: AffiliateSupplyTargetStatus.PUBLISHED,
      publishedAt: NOW,
      lastSuccessfulRefreshAt: NOW,
      freshnessExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      evidenceRefs: ["integration:demand"],
    } as const;
    await prisma.affiliateSupplyTargets.create({
      data: { id: newId("target-one"), targetId: newId("event-one"), ...targetData },
    });
    const policy = secondManifest.supplyContract;
    const firstDemand = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      rolloutCohort,
      now: NOW,
    });
    expect(firstDemand.demands[0]).toEqual(expect.objectContaining({
      status: "OPEN",
      observedFreshPublishedSupply: 1,
      generation: 1,
    }));
    await prisma.affiliateSupplyTargets.create({
      data: { id: newId("target-two"), targetId: newId("event-two"), ...targetData },
    });
    const secondDemand = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      rolloutCohort,
      now: NOW,
    });
    expect(secondDemand.demands[0]).toEqual(expect.objectContaining({
      id: firstDemand.demands[0].id,
      status: "CLOSED",
      observedFreshPublishedSupply: 2,
      generation: 2,
    }));
  });
});
