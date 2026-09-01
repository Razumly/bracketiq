/** @jest-environment node */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { PrismaClient } from "@/generated/prisma/client";
import type { StorageProvider } from "@/lib/storageProvider";

import {
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  type AffiliateAgentClaimEnvelope,
} from "../agentGatewayContracts";
import {
  createProductionAffiliateAgentGatewayAdapters,
  type AffiliateAgentCommandAdapters,
  type AffiliateAgentReviewerTerminalResult,
} from "../agentGatewayAdapters";

import * as affiliateSupplyPersistence from "../affiliateSupplyPersistence";
import type {
  AffiliateSupplyDatabase,
  AffiliateSupplyLifecycleCommandResult,
} from "../affiliateSupplyPersistence";
type StoredObject = Readonly<{
  bytes: Buffer;
  contentType?: string;
}>;

type CaptureAdapterOutput = Readonly<{
  artifactId: string;
  byteSize: number;
  evidenceRef: string;
  mimeType: string;
  sha256: string;
}>;

type CaptureAdapterFixture = Readonly<{
  adapters: Readonly<{ commands: AffiliateAgentCommandAdapters }>;
  storedObjects: Map<string, StoredObject>;
  setStorageError(error: unknown): void;
  setStoragePutFailure(key: string, error: unknown): void;
  setStorageReadContentType(contentType: string | undefined): void;
}>;

const operationKey = "capture-operation-1";
const discoveryOperationKey = "discovery-operation-1";
const discoveryJson = Buffer.from('{"results":[{"url":"https://example.test"}]}', "utf8");

const discoveryOutputFor = (): CaptureAdapterOutput => ({
  artifactId: `${discoveryOperationKey}:artifact`,
  byteSize: discoveryJson.byteLength,
  evidenceRef: "discovery-output-1",
  mimeType: "application/json",
  sha256: createHash("sha256").update(discoveryJson).digest("hex"),
});
const capturedHtml = Buffer.from("<html><body>captured</body></html>", "utf8");

const outputFor = (bytes: Buffer = capturedHtml): CaptureAdapterOutput => ({
  artifactId: `${operationKey}:artifact`,
  byteSize: bytes.byteLength,
  evidenceRef: "artifact-output-1",
  mimeType: "text/html",
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

const stagingRecordFor = (
  output: CaptureAdapterOutput,
  bytes: Buffer = capturedHtml,
) => ({
  schemaVersion: 1 as const,
  commandType: "CAPTURE_CLAIM_URL" as const,
  output,
  lineage: {
    operationKey,
    evidenceRef: output.evidenceRef,
    artifactId: output.artifactId,
    sha256: output.sha256,
  },
  objects: [{
    key: output.artifactId,
    mimeType: output.mimeType,
    byteSize: bytes.byteLength,
    sha256: output.sha256,
    dataBase64: bytes.toString("base64"),
  }],
});

const discoveryStagingRecordFor = (
  output: CaptureAdapterOutput = discoveryOutputFor(),
) => ({
  schemaVersion: 1 as const,
  commandType: "RUN_DISCOVERY_QUERY" as const,
  output,
  lineage: {
    operationKey: discoveryOperationKey,
    evidenceRef: output.evidenceRef,
    artifactId: output.artifactId,
    sha256: output.sha256,
  },
  objects: [{
    key: output.artifactId,
    mimeType: output.mimeType,
    byteSize: discoveryJson.byteLength,
    sha256: output.sha256,
    dataBase64: discoveryJson.toString("base64"),
  }],
});

const createFixture = (): CaptureAdapterFixture => {
  let storageError: unknown;
  let storagePutFailure: { key: string; error: unknown } | undefined;
  let storageReadContentTypeOverride: { value?: string } | null = null;
  const storedObjects = new Map<string, StoredObject>();
  const storage: StorageProvider = {
    async putObject({ data, contentType, key }) {
      if (!key) throw new Error("Expected a deterministic storage key.");
      if (storagePutFailure?.key === key) {
        const failure = storagePutFailure.error;
        storagePutFailure = undefined;
        throw failure;
      }
      const bytes = Buffer.from(data);
      storedObjects.set(key, {
        bytes,
        ...(contentType ? { contentType } : {}),
      });
      return {
        key,
        sizeBytes: bytes.byteLength,
        ...(contentType ? { contentType } : {}),
      };
    },
    async getObjectStream({ key }) {
      if (storageError !== undefined) throw storageError;
      const stored = storedObjects.get(key);
      if (!stored) {
        const error = Object.assign(
          new Error(`Stored object ${key} was not found.`),
          { code: "ENOENT" },
        );
        throw error;
      }
      const contentType = storageReadContentTypeOverride === null
        ? stored.contentType
        : storageReadContentTypeOverride.value;
      return {
        stream: Readable.from([Buffer.from(stored.bytes)]),
        ...(contentType === undefined ? {} : { contentType }),
        sizeBytes: stored.bytes.byteLength,
      };
    },
    async deleteObject({ key }) {
      storedObjects.delete(key);
    },
    async headObject({ key }) {
      const stored = storedObjects.get(key);
      return stored
        ? {
          exists: true,
          contentType: stored.contentType,
          sizeBytes: stored.bytes.byteLength,
        }
        : { exists: false };
    },
  };
  const adapters = createProductionAffiliateAgentGatewayAdapters({
    prisma: {} as PrismaClient,
    artifacts: {
      readImmutable: async () => {
        throw new Error("Artifact reads are not part of recovery tests.");
      },
    },
    storage,
    identifiers: {
      create: (kind) => `${kind}-output-1`,
    },
  });
  return {
    adapters,
    storedObjects,
    setStorageError: (error) => {
      storageError = error;
    },
    setStoragePutFailure: (key, error) => {
      storagePutFailure = { key, error };
    },
    setStorageReadContentType: (contentType) => {
      storageReadContentTypeOverride = { value: contentType };
    },
  };
};

const captureAdapterFor = (fixture: CaptureAdapterFixture) => {
  const adapter = fixture.adapters.commands.external.CAPTURE_CLAIM_URL;
  if (!adapter) throw new Error("Expected the production capture adapter.");
  return adapter;
};

const discoveryAdapterFor = (fixture: CaptureAdapterFixture) => {
  const adapter = fixture.adapters.commands.external.RUN_DISCOVERY_QUERY;
  if (!adapter) throw new Error("Expected the production discovery adapter.");
  return adapter;
};

const storeJson = (
  fixture: CaptureAdapterFixture,
  key: string,
  value: unknown,
): void => {
  fixture.storedObjects.set(key, {
    bytes: Buffer.from(canonicalizeAffiliateAgentValue(value), "utf8"),
    contentType: "application/json",
  });
};

const captureRecordSummaryFor = (value: Record<string, unknown>) => {
  const canonical = canonicalizeAffiliateAgentValue(value);
  return {
    keys: Object.keys(value).sort(),
    sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
    byteSize: Buffer.byteLength(canonical, "utf8"),
  };
};
describe("production Affiliate Agent activation effect", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("passes the admitted target writer through ACTIVATE with reviewer lineage", async () => {
    type LifecycleInput = Parameters<
      typeof affiliateSupplyPersistence.executeAffiliateSupplyLifecycleCommand
    >[0];
    type ActivationWriter = NonNullable<LifecycleInput["activationTargetWriter"]>;
    const targetWrite = {
      targetType: "EVENT",
      targetId: "event-1",
      sourceProfile: "EVENT",
      candidateId: "candidate-1",
      evidenceRefs: ["candidate-review-1"],
    };
    const activationWriter = jest.fn<ReturnType<ActivationWriter>, Parameters<ActivationWriter>>(
      async () => targetWrite,
    );
    const activationWriterFactory = jest.fn(() => activationWriter);
    const lifecycleResult = {
      assessment: {},
      transition: { generation: 9 },
      isReplayed: false,
    } as unknown as Awaited<
      ReturnType<typeof affiliateSupplyPersistence.executeAffiliateSupplyLifecycleCommand>
    >;
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockImplementation(async (input: LifecycleInput) => {
        if (!input.activationTargetWriter) {
          throw new Error("Expected the activation target writer.");
        }
        await input.activationTargetWriter({
          database: {} as unknown as AffiliateSupplyDatabase,
          client: {} as unknown as PrismaClient,
          contract: {} as Parameters<ActivationWriter>[0]["contract"],
          request: input.request ?? {},
          target: {
            candidateId: "candidate-1",
            targetType: "EVENT",
            sourceProfile: "EVENT",
            status: "PUBLISHED",
          },
          candidate: {
            id: "candidate-1",
            listingKind: "EVENT",
            status: "QUARANTINED",
          },
          now: new Date("2026-08-22T10:00:00.000Z"),
        });
        return lifecycleResult;
      });
    const prisma = {
      affiliateSupplySources: {
        findUnique: jest.fn(async () => ({
          id: "supply-source-1",
          lifecycleGeneration: 8,
        })),
      },
    } as unknown as PrismaClient;
    const adapters = createProductionAffiliateAgentGatewayAdapters({
      prisma,
      artifacts: {
        readImmutable: jest.fn(),
      },
      storage: {} as StorageProvider,
      activationTargetWriter: activationWriterFactory,
    });
    const claim = {
      claimId: "reviewer-claim-1",
      claimGeneration: 4,
      invocationId: "reviewer-invocation-1",
      workerId: "reviewer-worker-1",
      supplySourceId: "supply-source-1",
      role: "SUPPLY_REVIEWER",
    } as unknown as AffiliateAgentClaimEnvelope;
    const result = {
      claimId: claim.claimId,
      claimGeneration: claim.claimGeneration,
      invocationId: claim.invocationId,
      workerId: claim.workerId,
      role: "SUPPLY_REVIEWER",
      disposition: "ACTIVATED",
      payload: {
        committedPackageHash: "a".repeat(64),
        baselineHash: "b".repeat(64),
        candidateReviewId: "candidate-review-1",
      },
      evidenceRefs: ["candidate-review-1"],
      supplyContractVersion: 1,
      supplyContractHash: "c".repeat(64),
    } as unknown as AffiliateAgentReviewerTerminalResult;

    await expect(adapters.terminalEffects.ACTIVATED.execute({
      receiptId: "activation-receipt-1",
      claim,
      result,
    })).resolves.toEqual({
      command: "ACTIVATE",
      lifecycleGeneration: 9,
      receiptId: "activation-receipt-1",
    });
    expect(activationWriterFactory).toHaveBeenCalledWith({ claim, result });
    expect(activationWriter).toHaveBeenCalledTimes(1);
    expect(lifecycleCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: "ACTIVATE",
      idempotencyKey: "activation-receipt-1",
      actorKind: "SUPPLY_REVIEWER",
      actorId: "reviewer-worker-1",
      executingAgentId: "reviewer-invocation-1",
      activationTargetWriter: activationWriter,
      request: expect.objectContaining({
        sourceId: "supply-source-1",
        reviewerClaimId: "reviewer-claim-1",
        reviewerClaimGeneration: 4,
        reviewerInvocationId: "reviewer-invocation-1",
        reviewerSupplySourceId: "supply-source-1",
        reviewerWorkerId: "reviewer-worker-1",
      }),
    }));
  });
  it("binds producer repair jobs to the committing lifecycle generation", async () => {
    const packageHash = "a".repeat(64);
    const producerManifestPreimage = { schemaVersion: 1 as const, entries: [] as const };
    const producerEnvelope = {
      schemaVersion: 1,
      jobId: "producer-job-1",
      claimId: "producer-claim-1",
      supplySourceId: "supply-source-1",
      claimGeneration: 1,
      lifecycleGeneration: 8,
      deploymentContractVersion: 1,
      deploymentContractHash: "b".repeat(64),
      supplyContractVersion: 1,
      supplyContractHash: "c".repeat(64),
      roleContractVersion: 1,
      roleContractHash: "d".repeat(64),
      promptTemplateVersion: 1,
      promptTemplateHash: "e".repeat(64),
      executionClass: "PRODUCTION_CODEX" as const,
      workerId: "producer-worker-1",
      invocationId: "producer-invocation-1",
      workspaceId: "producer-workspace-1",
      claimedAt: "2026-08-22T10:00:00.000Z",
      expiresAt: "2026-08-22T11:00:00.000Z",
      evidenceManifest: {
        ...producerManifestPreimage,
        hash: hashAffiliateAgentValue(producerManifestPreimage),
      },
      role: "MAPPING_PRODUCER" as const,
      queue: "AFFILIATE_MAPPING" as const,
      lane: "MAPPING_PRODUCTION" as const,
      subject: {
        type: "MAPPING_PRODUCER" as const,
        supplySourceId: "supply-source-1",
        mappingJobId: "mapping-job-1",
        pass: 1,
      },
      permittedCommands: [
        "CAPTURE_CLAIM_URL",
        "COMMIT_DECLARATIVE_PACKAGE",
        "SUBMIT_TERMINAL_RESULT",
        "VALIDATE_DECLARATIVE_PACKAGE",
      ],
    };
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue({
        assessment: {},
        transition: { generation: 9 },
        isReplayed: false,
      } as unknown as AffiliateSupplyLifecycleCommandResult);
    const supplySourceFindUnique = jest.fn()
      .mockResolvedValueOnce({ id: "supply-source-1", lifecycleGeneration: 8 })
      .mockResolvedValueOnce({ id: "supply-source-1", lifecycleGeneration: 10 });
    const repairJobUpsert = jest.fn(async () => ({ id: "repair-job-1" }));
    const prisma = {
      affiliateSupplySources: { findUnique: supplySourceFindUnique },
      affiliateAgentGatewayClaims: {
        findUnique: jest.fn(async () => ({ claimEnvelopeJson: producerEnvelope })),
      },
      affiliateSourceMappingJobs: {
        findUnique: jest.fn(async () => ({
          sourceId: "scrape-source-1",
          supplySourceId: "supply-source-1",
        })),
      },
      affiliateScrapeSources: {
        findUnique: jest.fn(async () => ({ supplySourceId: "supply-source-1" })),
      },
      affiliateAgentGatewayJobs: { upsert: repairJobUpsert },
    } as unknown as PrismaClient;
    const adapters = createProductionAffiliateAgentGatewayAdapters({
      prisma,
      artifacts: { readImmutable: jest.fn() },
      storage: {} as StorageProvider,
    });
    const claim = {
      claimId: "reviewer-claim-1",
      claimGeneration: 2,
      invocationId: "reviewer-invocation-1",
      workerId: "reviewer-worker-1",
      workspaceId: "reviewer-workspace-1",
      supplySourceId: "supply-source-1",
      lifecycleGeneration: 8,
      role: "SUPPLY_REVIEWER",
      subject: {
        type: "SUPPLY_REVIEWER",
        supplySourceId: "supply-source-1",
        producerClaimId: "producer-claim-1",
        producerWorkerId: "producer-worker-1",
        producerInvocationId: "producer-invocation-1",
        producerWorkspaceId: "producer-workspace-1",
        committedPackageHash: packageHash,
        targetId: "target-1",
        targetType: "EVENT",
        reviewPass: 1,
      },
      evidenceManifest: {
        schemaVersion: 1,
        hash: "f".repeat(64),
        entries: [],
      },
    } as unknown as AffiliateAgentClaimEnvelope;
    const result = {
      claimId: claim.claimId,
      claimGeneration: claim.claimGeneration,
      invocationId: claim.invocationId,
      workerId: claim.workerId,
      role: "SUPPLY_REVIEWER",
      disposition: "PRODUCER_REPAIR_REQUIRED",
      payload: {
        committedPackageHash: packageHash,
        repairIssues: ["MISSING_REQUIRED_FIELD"],
      },
      evidenceRefs: [],
      supplyContractVersion: 1,
      supplyContractHash: "g".repeat(64),
    } as unknown as AffiliateAgentReviewerTerminalResult;

    await expect(adapters.terminalEffects.PRODUCER_REPAIR_REQUIRED.execute({
      receiptId: "repair-receipt-1",
      claim,
      result,
    })).resolves.toEqual(expect.objectContaining({
      lifecycleGeneration: 9,
      repairJobId: "repair-job-1",
      repairPass: 2,
    }));
    expect(lifecycleCommand).toHaveBeenCalledTimes(1);
    expect(repairJobUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        expectedLifecycleGeneration: 9,
      }),
    }));
    expect(supplySourceFindUnique).toHaveBeenCalledTimes(1);
  });
  it("persists approval evidence and queues a lineage-bound activation job", async () => {
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue({
        assessment: {},
        transition: { generation: 9 },
        isReplayed: false,
      } as unknown as Awaited<
        ReturnType<typeof affiliateSupplyPersistence.executeAffiliateSupplyLifecycleCommand>
      >);
    const storedObjects = new Map<string, Buffer>();
    const storage: StorageProvider = {
      async putObject({ data, key }) {
        const bytes = Buffer.from(data);
        storedObjects.set(key, bytes);
        return { key, sizeBytes: bytes.byteLength, contentType: "application/json" };
      },
      async getObjectStream({ key }) {
        const bytes = storedObjects.get(key);
        if (!bytes) {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        }
        return {
          stream: Readable.from([bytes]),
          contentType: "application/json",
          sizeBytes: bytes.byteLength,
        };
      },
      async deleteObject({ key }) {
        storedObjects.delete(key);
      },
      async headObject({ key }) {
        const bytes = storedObjects.get(key);
        return bytes
          ? { exists: true, contentType: "application/json", sizeBytes: bytes.byteLength }
          : { exists: false };
      },
    };
    const artifacts = {
      readImmutable: jest.fn(async ({ fileId }: { fileId: string }) => {
        const bytes = storedObjects.get(fileId);
        if (!bytes) throw new Error(`Missing artifact ${fileId}.`);
        return {
          bytes,
          mimeType: "application/json",
          byteSize: bytes.byteLength,
          sourceUrl: null,
        };
      }),
    };
    const artifactRows: Record<string, unknown>[] = [];
    const metadataUpdates: Record<string, unknown>[] = [];
    const activationJob = { id: "activation-job-1" };
    const source = {
      id: "scrape-source-1",
      supplySourceId: "supply-source-1",
      activeMappingId: "mapping-1",
      metadata: {},
    };
    const transaction = {
      affiliateSupplySources: {
        findUnique: jest.fn(async () => ({
          id: "supply-source-1",
          liveSourceId: "scrape-source-1",
        })),
      },
      affiliateScrapeSources: {
        findUnique: jest.fn(async () => source),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          metadataUpdates.push(data);
          return source;
        }),
      },
      affiliateScrapeMappings: {
        findUnique: jest.fn(async () => ({ id: "mapping-1", version: 3 })),
      },
      affiliateImportCandidates: {
        findMany: jest.fn(async () => [{
          id: "candidate-1",
          status: "QUARANTINED",
          listingKind: "EVENT",
          title: "Event 1",
          officialActionUrl: "https://example.test/register",
          sourceUrl: "https://example.test/events",
          startsAt: new Date("2026-09-01T10:00:00.000Z"),
          endsAt: null,
          dateDisplayMode: "SCHEDULED",
          city: "Portland",
          venueName: "Arena",
          address: "1 Main St",
          priceText: "$10",
          supplySourceId: "supply-source-1",
          sourceId: "scrape-source-1",
          mappingId: "mapping-1",
        }]),
      },
      affiliateSupplyTargets: {
        findMany: jest.fn(async () => [{
          id: "target-1",
          candidateId: "candidate-1",
          targetType: "EVENT",
          targetId: "event-1",
          sourceProfile: "EVENT",
          marketKey: "portland",
          status: "PUBLISHED",
          evidenceRefs: ["producer-durable"],
        }]),
      },
      affiliateAgentGatewayArtifacts: {
        findUnique: jest.fn(async ({
          where,
        }: {
          where: { claimId_evidenceRef: { evidenceRef: string } };
        }) => artifactRows.find(
          (row) => row.evidenceRef === where.claimId_evidenceRef.evidenceRef,
        ) ?? null),
        createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
          artifactRows.push(data[0]!);
          return { count: 1 };
        }),
      },
      affiliateAgentGatewayJobs: {
        upsert: jest.fn(async () => activationJob),
      },
    };
    const prisma = {
      affiliateSupplySources: {
        findUnique: jest.fn(async () => ({
          id: "supply-source-1",
          lifecycleGeneration: 8,
        })),
      },
      $transaction: jest.fn(async (
        callback: (client: typeof transaction) => Promise<unknown>,
      ) => callback(transaction)),
    } as unknown as PrismaClient;
    const adapters = createProductionAffiliateAgentGatewayAdapters({
      prisma,
      artifacts,
      storage,
    });
    const claim = {
      claimId: "reviewer-claim-1",
      claimGeneration: 2,
      invocationId: "reviewer-invocation-1",
      workerId: "reviewer-worker-1",
      workspaceId: "reviewer-workspace-1",
      supplySourceId: "supply-source-1",
      lifecycleGeneration: 8,
      role: "SUPPLY_REVIEWER",
      subject: {
        type: "SUPPLY_REVIEWER",
        supplySourceId: "supply-source-1",
        producerClaimId: "producer-claim-1",
        producerWorkerId: "producer-worker-1",
        producerInvocationId: "producer-invocation-1",
        producerWorkspaceId: "producer-workspace-1",
        committedPackageHash: "a".repeat(64),
        targetId: "event-1",
        targetType: "EVENT",
        reviewPass: 1,
      },
      evidenceManifest: {
        schemaVersion: 1,
        hash: "b".repeat(64),
        entries: [
          {
            evidenceRef: "active-contract",
            kind: "ACTIVE_SUPPLY_CONTRACT",
            artifactId: "contract-artifact",
            sha256: "c".repeat(64),
            mimeType: "application/json",
            byteSize: 1,
            retention: "INDEFINITE",
          },
          {
            evidenceRef: "committed-package",
            kind: "COMMITTED_PACKAGE",
            artifactId: "package-artifact",
            sha256: "a".repeat(64),
            mimeType: "application/json",
            byteSize: 1,
            retention: "INDEFINITE",
          },
          {
            evidenceRef: "deterministic-validation",
            kind: "DETERMINISTIC_VALIDATION",
            artifactId: "validation-artifact",
            sha256: "d".repeat(64),
            mimeType: "application/json",
            byteSize: 1,
            retention: "INDEFINITE",
          },
          {
            evidenceRef: "producer-durable",
            kind: "DURABLE_EVIDENCE",
            artifactId: "durable-artifact",
            sha256: "e".repeat(64),
            mimeType: "application/json",
            byteSize: 1,
            retention: "INDEFINITE",
          },
        ],
      },
    } as unknown as AffiliateAgentClaimEnvelope;
    const result = {
      claimId: claim.claimId,
      claimGeneration: claim.claimGeneration,
      invocationId: claim.invocationId,
      workerId: claim.workerId,
      role: "SUPPLY_REVIEWER",
      disposition: "APPROVED",
      payload: { committedPackageHash: "a".repeat(64) },
      evidenceRefs: ["producer-durable"],
      supplyContractVersion: 1,
      supplyContractHash: "f".repeat(64),
    } as unknown as AffiliateAgentReviewerTerminalResult;

    await expect(adapters.terminalEffects.APPROVED.execute({
      receiptId: "approval-receipt-1",
      claim,
      result,
    })).resolves.toEqual(expect.objectContaining({
      command: "APPROVE",
      lifecycleGeneration: 9,
      activationJobId: activationJob.id,
      candidateCount: 1,
      evidenceRef: "gateway-approval-evidence",
    }));
    expect(lifecycleCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: "APPROVE",
      request: expect.objectContaining({
        sourceId: "supply-source-1",
        reviewerClaimId: claim.claimId,
      }),
    }));
    expect(metadataUpdates[0]?.metadata).toEqual(expect.objectContaining({
      automationBaseline: expect.objectContaining({
        mappingId: "mapping-1",
        mappingVersion: 3,
        candidateCount: 1,
      }),
    }));
    expect(transaction.affiliateAgentGatewayJobs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: `mapping-activation:${claim.subject.producerClaimId}:${"a".repeat(64)}` },
        create: expect.objectContaining({
          parentClaimId: claim.subject.producerClaimId,
          expectedLifecycleGeneration: 9,
        }),
      }),
    );
    expect(artifactRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceRef: "gateway-approval-evidence",
        creatingClaimId: claim.subject.producerClaimId,
      }),
    ]));
  });

});

describe("production Affiliate Agent capture adapter", () => {
  it("recovers a canonical internal output from a durable receipt", async () => {
    const fixture = createFixture();
    const output = outputFor();
    storeJson(fixture, operationKey, output);

    await expect(captureAdapterFor(fixture).recover(operationKey)).resolves.toEqual(output);
  });

  it("repairs missing staged artifacts and receipts during recovery", async () => {
    const fixture = createFixture();
    const output = outputFor();
    storeJson(fixture, `${operationKey}:staging`, stagingRecordFor(output));

    await expect(captureAdapterFor(fixture).recover(operationKey)).resolves.toEqual(output);
    expect(fixture.storedObjects.get(`${operationKey}:artifact`)).toEqual({
      bytes: capturedHtml,
      contentType: "text/html",
    });
    expect(fixture.storedObjects.get(operationKey)).toEqual({
      bytes: Buffer.from(canonicalizeAffiliateAgentValue(output), "utf8"),
      contentType: "application/json",
    });
  });
  it("uses canonical MIME fallbacks for local manifest, discovery, and capture reads", async () => {
    const manifestFixture = createFixture();
    manifestFixture.setStorageReadContentType(undefined);
    const manifestOutput = outputFor();
    storeJson(manifestFixture, operationKey, manifestOutput);
    await expect(captureAdapterFor(manifestFixture).recover(operationKey))
      .resolves.toEqual(manifestOutput);

    const discoveryFixture = createFixture();
    discoveryFixture.setStorageReadContentType(undefined);
    const discoveryOutput = discoveryOutputFor();
    storeJson(
      discoveryFixture,
      `${discoveryOperationKey}:staging`,
      discoveryStagingRecordFor(discoveryOutput),
    );
    await expect(discoveryAdapterFor(discoveryFixture).recover(discoveryOperationKey))
      .resolves.toEqual(discoveryOutput);

    const captureFixture = createFixture();
    captureFixture.setStorageReadContentType(undefined);
    const captureOutput = outputFor();
    storeJson(captureFixture, `${operationKey}:staging`, stagingRecordFor(captureOutput));
    await expect(captureAdapterFor(captureFixture).recover(operationKey))
      .resolves.toEqual(captureOutput);
  });

  it("rejects an application/octet-stream MIME claim for local gateway artifacts", async () => {
    const manifestFixture = createFixture();
    manifestFixture.setStorageReadContentType("application/octet-stream");
    storeJson(manifestFixture, operationKey, outputFor());
    await expect(captureAdapterFor(manifestFixture).recover(operationKey))
      .rejects.toThrow("The stored external provider output failed its size or MIME check.");

    const discoveryFixture = createFixture();
    discoveryFixture.setStorageReadContentType("application/octet-stream");
    storeJson(
      discoveryFixture,
      `${discoveryOperationKey}:staging`,
      discoveryStagingRecordFor(),
    );
    await expect(discoveryAdapterFor(discoveryFixture).recover(discoveryOperationKey))
      .rejects.toThrow("The stored external provider output failed its size or MIME check.");

    const captureFixture = createFixture();
    captureFixture.setStorageReadContentType("application/octet-stream");
    storeJson(captureFixture, `${operationKey}:staging`, stagingRecordFor(outputFor()));
    await expect(captureAdapterFor(captureFixture).recover(operationKey))
      .rejects.toThrow("The stored external provider output failed its size or MIME check.");
  });
  it("reserves producer artifact identity before writing immutable bytes", async () => {
    const calls: string[] = [];
    const storedObjects = new Map<string, StoredObject>();
    const evidenceBytes = Buffer.from(
      '<div class="event"><span class="title">Sample event</span><span class="tags">Soccer</span><span class="division">Adults</span><a class="link" href="/events/sample">Details</a></div>',
      "utf8",
    );
    const evidenceHash = createHash("sha256").update(evidenceBytes).digest("hex");
    const storage: StorageProvider = {
      async putObject({ data, contentType, key }) {
        if (!key) throw new Error("Expected a deterministic storage key.");
        calls.push("storage-write");
        const bytes = Buffer.from(data);
        storedObjects.set(key, { bytes, contentType: contentType ?? undefined });
        return {
          key,
          sizeBytes: bytes.byteLength,
          contentType: contentType ?? undefined,
        };
      },
      async getObjectStream({ key }) {
        calls.push("storage-read");
        const stored = storedObjects.get(key);
        if (!stored) {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        }
        return {
          stream: Readable.from([stored.bytes]),
          contentType: stored.contentType,
          sizeBytes: stored.bytes.byteLength,
        };
      },
      async deleteObject({ key }) {
        storedObjects.delete(key);
      },
      async headObject({ key }) {
        const stored = storedObjects.get(key);
        return stored
          ? { exists: true, contentType: stored.contentType, sizeBytes: stored.bytes.byteLength }
          : { exists: false };
      },
    };
    const artifacts: Readonly<{
      readImmutable(input: Readonly<{ fileId: string; maximumBytes: number }>): Promise<{
        bytes: Uint8Array;
        mimeType: string;
        byteSize: number;
        sourceUrl: string | null;
      }>;
    }> = {
      readImmutable: async ({ fileId }) => {
        calls.push("artifact-read");
        const bytes = fileId === "source-artifact"
          ? evidenceBytes
          : storedObjects.get(fileId)?.bytes;
        if (!bytes) throw new Error(`Missing artifact ${fileId}.`);
        return {
          bytes,
          mimeType: fileId === "source-artifact" ? "text/html" : "application/json",
          byteSize: bytes.byteLength,
          sourceUrl: "https://evidence.example.test/events",
        };
      },
    };
    const artifactRows: Record<string, unknown>[] = [];
    let scrapeSourceKind = "EVENT";
    let mappingUpdateData: Record<string, unknown> | undefined;
    const transaction = {
      affiliateSupplySources: {
        findUnique: async () => ({ id: "supply-source-1" }),
      },
      affiliateSourceMappingJobs: {
        findUnique: async () => ({
          id: "mapping-job-1",
          supplySourceId: "supply-source-1",
          sourceId: "scrape-source-1",
          resultSummary: null,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          mappingUpdateData = data;
        },
      },
      affiliateScrapeSources: {
        findUnique: async () => ({
          id: "scrape-source-1",
          supplySourceId: "supply-source-1",
          targetKind: scrapeSourceKind,
        }),
      },
      affiliateAgentGatewayArtifacts: {
        findUnique: async ({
          where,
        }: {
          where: { claimId_evidenceRef?: { evidenceRef?: string } };
        }) => artifactRows.find(
          (row) => row.evidenceRef === where.claimId_evidenceRef?.evidenceRef,
        ) ?? null,
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          calls.push("db-reserve");
          artifactRows.push(data[0]!);
          return { count: 1 };
        },
      },
    };
    const adapters = createProductionAffiliateAgentGatewayAdapters({
      prisma: {} as PrismaClient,
      artifacts,
      storage,
      identifiers: { create: () => "gateway-artifact-1" },
    });
    const adapter = adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
    if (!adapter) throw new Error("Expected the production validation adapter.");
    const candidatePackage = {
      schemaVersion: 1 as const,
      supplySourceId: "supply-source-1",
      listingKind: "EVENT" as const,
      listUrlRef: "list-evidence",
      itemSelector: ".event",
      fields: [
        {
          field: "divisions" as const,
          selector: ".division",
          mode: "TEXT" as const,
          attribute: null,
          transform: "TRIM" as const,
        },
        {
          field: "officialActionUrl" as const,
          selector: ".link",
          mode: "ATTRIBUTE" as const,
          attribute: "href",
          transform: "ABSOLUTE_URL" as const,
        },
        {
          field: "tags" as const,
          selector: ".tags",
          mode: "TEXT" as const,
          attribute: null,
          transform: "TRIM" as const,
        },
        {
          field: "title" as const,
          selector: ".title",
          mode: "TEXT" as const,
          attribute: null,
          transform: "TRIM" as const,
        },
      ],
      evidenceRefs: ["list-evidence"],
    };
    const claim = {
      claimId: "producer-claim-1",
      claimGeneration: 1,
      invocationId: "producer-invocation-1",
      supplyContractHash: "b".repeat(64),
      deploymentContractVersion: 1,
      deploymentContractHash: "d".repeat(64),
      supplyContractVersion: 1,
      roleContractVersion: 1,
      roleContractHash: "e".repeat(64),
      promptTemplateVersion: 1,
      promptTemplateHash: "f".repeat(64),
      role: "MAPPING_PRODUCER",
      subject: {
        type: "MAPPING_PRODUCER",
        supplySourceId: "supply-source-1",
        mappingJobId: "mapping-job-1",
        pass: 1,
      },
      evidenceManifest: {
        hash: "c".repeat(64),
        entries: [{
          evidenceRef: "list-evidence",
          artifactId: "source-artifact",
          sha256: evidenceHash,
          mimeType: "text/html",
          byteSize: evidenceBytes.byteLength,
          kind: "PAGE_HTML",
          retention: "INDEFINITE",
        }],
      },
    } as unknown as AffiliateAgentClaimEnvelope;
    await expect(adapter.execute({
      transaction,
      claim,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
      receiptId: "validation-receipt-1",
    })).resolves.toMatchObject({
      isValid: true,
      validatedPackageHash: expect.any(String),
    });
    expect(mappingUpdateData?.resultSummary).toEqual(expect.objectContaining({
      gatewayCandidatePackage: expect.objectContaining({
        validationOutput: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              divisionText: "Adults",
              tagText: "Soccer",
              tags: ["Soccer"],
            }),
          ]),
        }),
      }),
    }));
    expect(calls.indexOf("db-reserve")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("storage-read")).toBeGreaterThan(calls.indexOf("db-reserve"));
    expect(calls.indexOf("storage-write")).toBeGreaterThan(calls.indexOf("db-reserve"));
    scrapeSourceKind = "RENTAL";
    await expect(adapter.execute({
      transaction,
      claim,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
      receiptId: "mismatched-kind-receipt",
    })).rejects.toThrow(
      "The declarative package listing kind does not match the scrape source target kind.",
    );
  });


  it("recovers zero-byte staged objects when their size and digest are authoritative", async () => {
    const fixture = createFixture();
    const output = outputFor();
    const emptyBytes = Buffer.alloc(0);
    const staging = stagingRecordFor(output);
    staging.objects.push({
      key: `${operationKey}:empty-html`,
      mimeType: "text/html",
      byteSize: emptyBytes.byteLength,
      sha256: createHash("sha256").update(emptyBytes).digest("hex"),
      dataBase64: "",
    });
    storeJson(fixture, `${operationKey}:staging`, staging);

    await expect(captureAdapterFor(fixture).recover(operationKey)).resolves.toEqual(output);
    expect(fixture.storedObjects.get(`${operationKey}:empty-html`)).toEqual({
      bytes: emptyBytes,
      contentType: "text/html",
    });
  });

  it("retains screenshot provenance and rejects a mismatched staged sidecar", async () => {
    const fixture = createFixture();
    const screenshotBytes = Buffer.from("staged-screenshot", "utf8");
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const emptySetSummary = {
      count: 0,
      sha256: createHash("sha256")
        .update(canonicalizeAffiliateAgentValue([]), "utf8")
        .digest("hex"),
      refs: [],
    };
    const request = { url: "https://example.test/events" };
    const response = { statusCode: 200 };
    const captureMetadata = {
      provider: "FIRECRAWL" as const,
      request: captureRecordSummaryFor(request),
      response: captureRecordSummaryFor(response),
      requestedUrl: request.url,
      finalUrl: request.url,
      isRedirectVerified: false,
      inferredCanonicalUrl: null,
      providerStatusCode: 200,
      targetStatusCode: 200,
      renderMode: "JAVASCRIPT" as const,
      elapsedMs: 10,
      estimatedCredits: null,
      warnings: [],
      providerArtifacts: {
        markdown: null,
        links: emptySetSummary,
        images: emptySetSummary,
        branding: null,
        screenshotUrl: "https://cdn.example.test/events.png",
        screenshotEvidence: {
          sourceUrl: "https://cdn.example.test/events.png",
          finalUrl: "https://cdn.example.test/events-final.png",
          statusCode: 200,
          mimeType: "image/png",
          byteSize: screenshotBytes.byteLength,
          sha256: screenshotSha256,
        },
        metadata: {},
      },
    };
    const output = {
      ...outputFor(),
      captureMetadata,
    };
    const staging = stagingRecordFor(output);
    staging.objects.push({
      key: `${operationKey}:screenshot`,
      mimeType: "image/png",
      byteSize: screenshotBytes.byteLength,
      sha256: screenshotSha256,
      dataBase64: screenshotBytes.toString("base64"),
    });
    storeJson(fixture, `${operationKey}:staging`, staging);

    await expect(captureAdapterFor(fixture).recover(operationKey)).resolves.toEqual(output);
    expect(fixture.storedObjects.get(`${operationKey}:screenshot`)).toEqual({
      bytes: screenshotBytes,
      contentType: "image/png",
    });

    const tampered = {
      ...staging,
      output: {
        ...output,
        captureMetadata: {
          ...captureMetadata,
          providerArtifacts: {
            ...captureMetadata.providerArtifacts,
            screenshotEvidence: {
              ...captureMetadata.providerArtifacts.screenshotEvidence,
              sha256: "a".repeat(64),
            },
          },
        },
      },
    };
    storeJson(fixture, `${operationKey}:staging`, tampered);
    await expect(captureAdapterFor(fixture).recover(operationKey))
      .rejects.toThrow("The staged external provider output is invalid.");
  });

  it("rejects a staged record with the wrong command type", async () => {
    const fixture = createFixture();
    const output = outputFor();
    storeJson(fixture, `${operationKey}:staging`, {
      ...stagingRecordFor(output),
      commandType: "RUN_DISCOVERY_QUERY",
    });

    await expect(captureAdapterFor(fixture).recover(operationKey))
      .rejects.toThrow("The staged external provider output is invalid.");
  });

  it("rejects a staged record bound to another operation key", async () => {
    const fixture = createFixture();
    const output = outputFor();
    storeJson(fixture, `${operationKey}:staging`, {
      ...stagingRecordFor(output),
      lineage: {
        ...stagingRecordFor(output).lineage,
        operationKey: "another-operation",
      },
    });

    await expect(captureAdapterFor(fixture).recover(operationKey))
      .rejects.toThrow("The staged external provider output is invalid.");
  });

  it("rejects a staged record without its primary artifact object", async () => {
    const fixture = createFixture();
    const output = outputFor();
    const staging = stagingRecordFor(output);
    storeJson(fixture, `${operationKey}:staging`, {
      ...staging,
      objects: [],
    });

    await expect(captureAdapterFor(fixture).recover(operationKey))
      .rejects.toThrow("The staged external provider output is invalid.");
  });

  it.each([
    { name: "artifact", failureKey: `${operationKey}:artifact` },
    { name: "recovery receipt", failureKey: operationKey },
  ])("retries after a transient $name storage write", async ({ failureKey }) => {
    const fixture = createFixture();
    const output = outputFor();
    storeJson(fixture, `${operationKey}:staging`, stagingRecordFor(output));
    const error = Object.assign(new Error("storage write temporarily unavailable"), {
      code: "ETIMEDOUT",
    });
    fixture.setStoragePutFailure(failureKey, error);

    await expect(captureAdapterFor(fixture).recover(operationKey)).rejects.toBe(error);
    await expect(captureAdapterFor(fixture).recover(operationKey)).resolves.toEqual(output);
    expect(fixture.storedObjects.get(`${operationKey}:artifact`)).toEqual({
      bytes: capturedHtml,
      contentType: "text/html",
    });
    expect(fixture.storedObjects.has(operationKey)).toBe(true);
  });

  it("rejects untrusted metadata during deterministic recovery", async () => {
    const fixture = createFixture();
    storeJson(fixture, operationKey, {
      ...outputFor(),
      captureMetadata: { untrusted: "must reject" },
    });

    await expect(captureAdapterFor(fixture).recover(operationKey)).resolves.toBeNull();
  });

  it("returns null for definitive missing storage objects", async () => {
    const fixture = createFixture();

    await expect(captureAdapterFor(fixture).recover("missing-operation"))
      .resolves.toBeNull();
  });

  it("propagates transient storage failures for retry", async () => {
    const fixture = createFixture();
    const error = Object.assign(new Error("storage temporarily unavailable"), {
      code: "ETIMEDOUT",
    });
    fixture.setStorageError(error);

    await expect(captureAdapterFor(fixture).recover(operationKey))
      .rejects.toBe(error);
  });
});
