/** @jest-environment node */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { PrismaClient } from "@/generated/prisma/client";
import type { StorageProvider } from "@/lib/storageProvider";

import {
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentSourceSportScope,
  type AffiliateAgentSportEvidence,
} from "../agentGatewayContracts";
import { buildAffiliateSportsCatalogSnapshot } from "../affiliateSportsCatalog";
import {
  buildAffiliateSupplyContractManifest,
  type AffiliateSupplyContractManifest,
} from "../affiliateSupplyLifecycle";
import {
  AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX,
  resolveAffiliateAgentActiveSupplyContractArtifact,
  verifyAffiliateAgentLegacySportRepair,
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
type PackageEvidenceMetadata = Readonly<{
  sourceUrl: string | null;
  finalUrl: string | null;
}>;

const packageAdapterFixtureFor = (
  initialMetadata: PackageEvidenceMetadata,
  evidenceKind: "PAGE_HTML" | "PAGE_MARKDOWN" = "PAGE_HTML",
  options: Readonly<{ listingKind?: "EVENT" | "CLUB"; html?: string }> = {},
) => {
  const listingKind = options.listingKind ?? "EVENT";
  const evidenceBytes = Buffer.from(
    evidenceKind === "PAGE_HTML"
      ? options.html ?? '<div class="event"><span class="title">Sample event</span><p class="description">Join weekly outdoor games with players of all skill levels.</p><a class="link" href="https://outbound.example.test/events/sample">Details</a></div>'
      : '# Sample event\n\n[Details](https://outbound.example.test/events/sample)',
    "utf8",
  );
  const evidenceHash = createHash("sha256").update(evidenceBytes).digest("hex");
  const evidenceMimeType = evidenceKind === "PAGE_HTML" ? "text/html" : "text/markdown";
  const metadata = { ...initialMetadata };
  const storedObjects = new Map<string, StoredObject>();
  const storage: StorageProvider = {
    async putObject({ data, contentType, key }) {
      if (!key) throw new Error("Expected a deterministic storage key.");
      const bytes = Buffer.from(data);
      storedObjects.set(key, { bytes, contentType: contentType ?? undefined });
      return {
        key,
        sizeBytes: bytes.byteLength,
        contentType: contentType ?? undefined,
      };
    },
    async getObjectStream({ key }) {
      const stored = storedObjects.get(key);
      if (!stored) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
      return {
        stream: Readable.from([Buffer.from(stored.bytes)]),
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
        ? {
          exists: true,
          contentType: stored.contentType,
          sizeBytes: stored.bytes.byteLength,
        }
        : { exists: false };
    },
  };
  const artifacts = {
    readImmutable: jest.fn(async ({ fileId }: { fileId: string }) => {
      const stored = fileId === "list-artifact"
        ? { bytes: evidenceBytes, contentType: evidenceMimeType }
        : storedObjects.get(fileId);
      if (!stored) throw new Error(`Missing artifact ${fileId}.`);
      return {
        bytes: stored.bytes,
        mimeType: stored.contentType ?? "application/json",
        byteSize: stored.bytes.byteLength,
        sourceUrl: fileId === "list-artifact" ? metadata.sourceUrl : null,
        finalUrl: fileId === "list-artifact" ? metadata.finalUrl : null,
      };
    }),
  };
  const artifactRows: Record<string, unknown>[] = [];
  const mappingJob: Record<string, unknown> = {
    id: "mapping-job-package",
    supplySourceId: "supply-source-package",
    sourceId: "scrape-source-package",
    resultSummary: null,
  };
  const source = {
    id: "scrape-source-package",
    supplySourceId: "supply-source-package",
    targetKind: listingKind,
    lifecycleGeneration: 7,
  };
  const mappingJobUpdate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    mappingJob.resultSummary = data.resultSummary;
    return mappingJob;
  });
  const transaction = {
    affiliateSupplySources: {
      findUnique: jest.fn(async () => ({ id: "supply-source-package" })),
    },
    affiliateSourceMappingJobs: {
      findUnique: jest.fn(async () => mappingJob),
      update: mappingJobUpdate,
    },
    affiliateScrapeSources: {
      findUnique: jest.fn(async () => source),
      update: jest.fn(),
    },
    affiliateScrapeMappings: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
    },
    affiliateAgentGatewayArtifacts: {
      findUnique: jest.fn(async ({
        where,
      }: {
        where: { claimId_evidenceRef?: { evidenceRef?: string } };
      }) => artifactRows.find(
        (row) => row.evidenceRef === where.claimId_evidenceRef?.evidenceRef,
      ) ?? null),
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        artifactRows.push(data[0]!);
        return { count: 1 };
      }),
    },
  };
  const candidatePackage = {
    schemaVersion: 1 as const,
    supplySourceId: "supply-source-package",
    listingKind,
    listUrlRef: "list-evidence",
    itemSelector: ".event",
    fields: [
      {
        field: "description" as const,
        selector: ".description",
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
        field: "title" as const,
        selector: ".title",
        mode: "TEXT" as const,
        attribute: null,
        transform: "TRIM" as const,
      },
    ],
    evidenceRefs: ["list-evidence"] as const,
  };
  const manifestPreimage = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "list-evidence",
      kind: evidenceKind,
      artifactId: "list-artifact",
      sha256: evidenceHash,
      mimeType: evidenceMimeType,
      byteSize: evidenceBytes.byteLength,
      retention: "INDEFINITE" as const,
    }],
  };
  const claim = {
    claimId: "producer-claim-package",
    claimGeneration: 1,
    invocationId: "producer-invocation-package",
    workerId: "producer-worker-package",
    lifecycleGeneration: 7,
    deploymentContractVersion: 1,
    deploymentContractHash: "deployment-contract-package",
    supplyContractVersion: 1,
    supplyContractHash: "supply-contract-package",
    roleContractVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.version,
    roleContractHash: "role-contract-package",
    promptTemplateVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.promptTemplateVersion,
    promptTemplateHash: "prompt-template-package",
    role: "MAPPING_PRODUCER" as const,
    subject: {
      type: "MAPPING_PRODUCER" as const,
      supplySourceId: "supply-source-package",
      mappingJobId: "mapping-job-package",
      listingKind,
      pass: 1,
    },
    evidenceManifest: {
      ...manifestPreimage,
      hash: hashAffiliateAgentValue(manifestPreimage),
    },
  } as unknown as AffiliateAgentClaimEnvelope;
  const adapters = createProductionAffiliateAgentGatewayAdapters({
    prisma: {} as PrismaClient,
    artifacts,
    storage,
    identifiers: { create: () => "gateway-artifact-package" },
  });
  return {
    adapters,
    artifacts,
    candidatePackage,
    claim,
    mappingJob,
    mappingJobUpdate,
    setMetadata: (nextMetadata: PackageEvidenceMetadata): void => {
      metadata.sourceUrl = nextMetadata.sourceUrl;
      metadata.finalUrl = nextMetadata.finalUrl;
    },
    transaction,
  };
};

const captureRecordSummaryFor = (value: Record<string, unknown>) => {
  const canonical = canonicalizeAffiliateAgentValue(value);
  return {
    keys: Object.keys(value).sort(),
    sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
    byteSize: Buffer.byteLength(canonical, "utf8"),
  };
};
const legacySportRepairFixture = (artifactKind: "PAGE_HTML" | "PAGE_MARKDOWN" = "PAGE_HTML") => {
  const bytes = Buffer.from(
    artifactKind === "PAGE_HTML"
      ? '<a href="https://source.example/events/grass-soccer">Outdoor grass soccer registration</a>'
      : '[Outdoor grass soccer registration](https://source.example/events/grass-soccer)',
    "utf8",
  );
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  const mimeType = artifactKind === "PAGE_HTML" ? "text/html" : "text/markdown";
  const catalog = buildAffiliateSportsCatalogSnapshot(
    [{ id: "sport-grass", name: "Grass Soccer" }],
    "2026-09-06T00:00:00.000Z",
  );
  const sportEvidence: AffiliateAgentSportEvidence = {
    evidenceRunId: "evidence-run-1",
    sportsCatalogSha256: catalog.sha256,
    sportDeterminations: [{
      sourceLabels: ["Soccer"],
      status: "RESOLVED",
      resolutionBasis: "SOURCE_EVIDENCE",
      canonicalSportNames: ["Grass Soccer"],
      rationale: "The original page explicitly identifies outdoor grass soccer.",
      evidence: [{
        artifactId: "sport-artifact-1",
        artifactSha256,
        artifactKind,
        pageUrl: "https://source.example/events",
        excerpt: "Outdoor grass soccer",
      }],
    }],
  };
  const manifestPreimage = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "sport-evidence-1",
      kind: artifactKind,
      artifactId: "sport-artifact-1",
      sha256: artifactSha256,
      mimeType,
      byteSize: bytes.byteLength,
      retention: "INDEFINITE" as const,
    }],
  };
  const claim = {
    role: "MAPPING_PRODUCER" as const,
    subject: {
      type: "MAPPING_PRODUCER" as const,
      supplySourceId: "supply-source-1",
      mappingJobId: "mapping-job-1",
      pass: 1,
      repairContext: {
        kind: "LEGACY_SPORT_REPAIR" as const,
        intakeId: "intake-1",
        evidenceRunId: sportEvidence.evidenceRunId,
        sportsCatalog: catalog,
      },
    },
    evidenceManifest: {
      ...manifestPreimage,
      hash: hashAffiliateAgentValue(manifestPreimage),
    },
  } as unknown as AffiliateAgentClaimEnvelope;
  const artifacts = {
    readImmutable: jest.fn(async () => ({
      bytes,
      mimeType,
      byteSize: bytes.byteLength,
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
      runId: "evidence-run-1",
      intakeId: "intake-1",
    })),
  };
  let currentCatalog = catalog;
  const findMany = jest.fn(async () => currentCatalog.sports);
  const prisma = {
    sports: { findMany },
  } as unknown as Pick<PrismaClient, "sports">;
  return {
    catalog,
    claim,
    sportEvidence,
    artifacts,
    prisma,
    setCurrentCatalog: (nextCatalog: typeof catalog) => {
      currentCatalog = nextCatalog;
    },
  };
};
const multiSportRepairEvidenceFixture = () => {
  const bytes = Buffer.from(
    "<p>Outdoor grass soccer registration and indoor volleyball registration.</p>",
    "utf8",
  );
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  const mimeType = "text/html";
  const catalog = buildAffiliateSportsCatalogSnapshot(
    [
      { id: "sport-grass", name: "Grass Soccer" },
      { id: "sport-indoor", name: "Indoor Volleyball" },
    ],
    "2026-09-06T00:00:00.000Z",
  );
  const scopePreimage = {
    schemaVersion: 1 as const,
    supplySourceId: "supply-source-package",
    intakeId: "intake-1",
    evidenceRunId: "evidence-run-1",
    parentGatewayJobId: "parent-gateway-job-1",
    parentResultHash: "a".repeat(64),
    excludedSourceLabels: ["Dance", "Martial Arts"],
    operatorId: "operator-1",
    reason: "Retain verified catalog sports and omit the approved source-only activities.",
  };
  const sourceSportScope: AffiliateAgentSourceSportScope = {
    ...scopePreimage,
    hash: hashAffiliateAgentValue(scopePreimage),
  };
  const sportEvidence: AffiliateAgentSportEvidence = {
    evidenceRunId: "evidence-run-1",
    sportsCatalogSha256: catalog.sha256,
    sportDeterminations: [
      {
        sourceLabels: ["Soccer"],
        status: "RESOLVED",
        resolutionBasis: "SOURCE_EVIDENCE",
        canonicalSportNames: ["Grass Soccer"],
        rationale: "The source identifies outdoor grass soccer.",
        evidence: [{
          artifactId: "sport-artifact-1",
          artifactSha256,
          artifactKind: "PAGE_HTML",
          pageUrl: "https://source.example/events",
          excerpt: "Outdoor grass soccer",
        }],
      },
      {
        sourceLabels: ["Volleyball"],
        status: "RESOLVED",
        resolutionBasis: "SOURCE_EVIDENCE",
        canonicalSportNames: ["Indoor Volleyball"],
        rationale: "The source identifies indoor volleyball.",
        evidence: [{
          artifactId: "sport-artifact-1",
          artifactSha256,
          artifactKind: "PAGE_HTML",
          pageUrl: "https://source.example/events",
          excerpt: "indoor volleyball",
        }],
      },
    ],
  };
  const manifestPreimage = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "sport-evidence-1",
      kind: "PAGE_HTML" as const,
      artifactId: "sport-artifact-1",
      sha256: artifactSha256,
      mimeType,
      byteSize: bytes.byteLength,
      retention: "INDEFINITE" as const,
    }],
  };
  const claim = {
    role: "MAPPING_PRODUCER" as const,
    subject: {
      type: "MAPPING_PRODUCER" as const,
      supplySourceId: "supply-source-package",
      mappingJobId: "mapping-job-package",
      pass: 1,
      repairContext: {
        kind: "LEGACY_SPORT_REPAIR" as const,
        intakeId: "intake-1",
        evidenceRunId: sportEvidence.evidenceRunId,
        sportsCatalog: catalog,
        sourceSportScope,
      },
    },
    evidenceManifest: {
      ...manifestPreimage,
      hash: hashAffiliateAgentValue(manifestPreimage),
    },
  } as unknown as AffiliateAgentClaimEnvelope;
  const artifacts = {
    readImmutable: jest.fn(async () => ({
      bytes,
      mimeType,
      byteSize: bytes.byteLength,
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
      runId: "evidence-run-1",
      intakeId: "intake-1",
    })),
  };
  const prisma = {
    sports: { findMany: jest.fn(async () => catalog.sports) },
  } as unknown as Pick<PrismaClient, "sports">;
  return { catalog, claim, sportEvidence, sourceSportScope, artifacts, prisma };
};
const scopedPackageAdapterFixtureFor = (
  options: Readonly<{
    sportField?: "CONSTANT" | "SELECTOR";
    selectorValue?: string;
  }> = {},
) => {
  const selectorSportValue = options.selectorValue ?? "Grass Soccer|Indoor Volleyball";
  const listHtml = options.sportField === "SELECTOR"
    ? `<article class="event"><h2 class="title">Multi-sport session</h2><p class="description">Outdoor grass soccer and indoor volleyball for all skill levels.</p><span class="sport">${selectorSportValue}</span><a class="link" href="/register">Register</a></article>`
    : '<article class="event"><h2 class="title">Multi-sport session</h2><p class="description">Outdoor grass soccer and indoor volleyball for all skill levels.</p><a class="link" href="/register">Register</a></article>';
  const fixture = packageAdapterFixtureFor({
    sourceUrl: "https://source.example/events",
    finalUrl: "https://source.example/events",
  }, "PAGE_HTML", { html: listHtml });
  const evidence = multiSportRepairEvidenceFixture();
  const readOriginal = fixture.artifacts.readImmutable.getMockImplementation()!;
  fixture.artifacts.readImmutable.mockImplementation(async (input) => (
    input.fileId === "sport-artifact-1"
      ? evidence.artifacts.readImmutable()
      : readOriginal(input)
  ));
  const manifest = {
    schemaVersion: 1 as const,
    entries: [
      ...fixture.claim.evidenceManifest.entries,
      ...evidence.claim.evidenceManifest.entries,
    ].sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef)),
  };
  const claim = {
    ...fixture.claim,
    subject: {
      ...fixture.claim.subject,
      repairContext: evidence.claim.subject.repairContext,
    },
    evidenceManifest: {
      ...manifest,
      hash: hashAffiliateAgentValue(manifest),
    },
  } as AffiliateAgentClaimEnvelope;
  const sportField = options.sportField === "SELECTOR"
    ? {
      field: "sportNames" as const,
      selector: ".sport",
      mode: "TEXT" as const,
      attribute: null,
      transform: "TRIM" as const,
    }
    : {
      field: "sportNames" as const,
      mode: "CONSTANT" as const,
      values: ["Grass Soccer", "Indoor Volleyball"],
    };
  const candidatePackage = {
    ...fixture.candidatePackage,
    fields: [
      ...fixture.candidatePackage.fields,
      sportField,
    ].sort((left, right) => left.field.localeCompare(right.field)),
    evidenceRefs: ["list-evidence", "sport-evidence-1"],
    sportEvidence: evidence.sportEvidence,
    sourceSportScopeHash: evidence.sourceSportScope.hash,
  };
  return {
    fixture,
    evidence,
    claim,
    candidatePackage,
    transaction: {
      ...fixture.transaction,
      sports: evidence.prisma.sports,
    },
  };
};
const legacyApprovalFixture = () => {
  const evidence = legacySportRepairFixture();
  const repairContext = (
    evidence.claim.subject as Extract<
      AffiliateAgentClaimEnvelope["subject"],
      { type: "MAPPING_PRODUCER" }
    >
  ).repairContext!;
  const candidatePackage = {
    schemaVersion: 1 as const,
    supplySourceId: "supply-source-1",
    listingKind: "EVENT" as const,
    listUrlRef: "sport-evidence-1",
    itemSelector: "a",
    fields: [
      {
        field: "description" as const,
        selector: ":scope",
        mode: "TEXT" as const,
        attribute: null,
        transform: "TRIM" as const,
      },
      {
        field: "officialActionUrl" as const,
        selector: ":scope",
        mode: "ATTRIBUTE" as const,
        attribute: "href",
        transform: "ABSOLUTE_URL" as const,
      },
      {
        field: "sportName" as const,
        mode: "CONSTANT" as const,
        value: "Grass Soccer",
      },
      {
        field: "title" as const,
        selector: ":scope",
        mode: "TEXT" as const,
        attribute: null,
        transform: "TRIM" as const,
      },
    ],
    evidenceRefs: ["sport-evidence-1"],
    sportEvidence: evidence.sportEvidence,
  };
  const listBytes = Buffer.from(
    '<a href="https://source.example/events/grass-soccer">Outdoor grass soccer registration</a>',
    "utf8",
  );
  const packageBytes = Buffer.from(
    canonicalizeAffiliateAgentValue(candidatePackage),
    "utf8",
  );
  const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");
  const reviewerManifestPreimage = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "committed-package-1",
      kind: "COMMITTED_PACKAGE" as const,
      artifactId: "reviewer-package-1",
      sha256: packageSha256,
      mimeType: "application/json",
      byteSize: packageBytes.byteLength,
      retention: "INDEFINITE" as const,
    }],
  };
  const producerEnvelope = {
    schemaVersion: 1 as const,
    jobId: "producer-job-1",
    claimId: "producer-claim-1",
    supplySourceId: "supply-source-1",
    claimGeneration: 1,
    lifecycleGeneration: 8,
    deploymentContractVersion: 1,
    deploymentContractHash: "1".repeat(64),
    supplyContractVersion: 1,
    supplyContractHash: "2".repeat(64),
    roleContractHash: "3".repeat(64),
    roleContractVersion: 3,
    promptTemplateVersion: 3,
    promptTemplateHash: "4".repeat(64),
    executionClass: "PRODUCTION_OMP" as const,
    workerId: "producer-worker-1",
    invocationId: "producer-invocation-1",
    workspaceId: "producer-workspace-1",
    claimedAt: "2026-08-22T10:00:00.000Z",
    expiresAt: "2026-08-22T11:00:00.000Z",
    evidenceManifest: evidence.claim.evidenceManifest,
    permittedCommands: [
      "CAPTURE_CLAIM_URL",
      "COMMIT_DECLARATIVE_PACKAGE",
      "SUBMIT_TERMINAL_RESULT",
      "VALIDATE_DECLARATIVE_PACKAGE",
    ],
    role: "MAPPING_PRODUCER" as const,
    queue: "AFFILIATE_MAPPING" as const,
    lane: "MAPPING_PRODUCTION" as const,
    subject: {
      type: "MAPPING_PRODUCER" as const,
      supplySourceId: "supply-source-1",
      mappingJobId: "mapping-job-1",
      pass: 1,
      repairContext,
    },
  };
  const producerClaimRow = {
    id: "producer-claim-1",
    role: "MAPPING_PRODUCER",
    claimGeneration: 1,
    workerId: "producer-worker-1",
    invocationId: "producer-invocation-1",
    claimEnvelopeJson: producerEnvelope,
    claimEnvelopeHash: hashAffiliateAgentValue(producerEnvelope),
  };
  const reviewerClaim = {
    schemaVersion: 1 as const,
    jobId: "reviewer-job-1",
    claimId: "reviewer-claim-repair-1",
    supplySourceId: "supply-source-1",
    claimGeneration: 2,
    lifecycleGeneration: 8,
    deploymentContractVersion: 1,
    deploymentContractHash: "5".repeat(64),
    supplyContractVersion: 1,
    supplyContractHash: "6".repeat(64),
    roleContractHash: "7".repeat(64),
    roleContractVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.SUPPLY_REVIEWER.version,
    promptTemplateVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.SUPPLY_REVIEWER.promptTemplateVersion,
    promptTemplateHash: "8".repeat(64),
    executionClass: "PRODUCTION_OMP" as const,
    workerId: "reviewer-worker-repair-1",
    invocationId: "reviewer-invocation-repair-1",
    workspaceId: "reviewer-workspace-repair-1",
    claimedAt: "2026-08-22T12:00:00.000Z",
    expiresAt: "2026-08-22T13:00:00.000Z",
    evidenceManifest: {
      ...reviewerManifestPreimage,
      hash: hashAffiliateAgentValue(reviewerManifestPreimage),
    },
    permittedCommands: ["SUBMIT_TERMINAL_RESULT"],
    role: "SUPPLY_REVIEWER" as const,
    queue: "AFFILIATE_REVIEW" as const,
    lane: "SUPPLY_REVIEW" as const,
    subject: {
      type: "SUPPLY_REVIEWER" as const,
      supplySourceId: "supply-source-1",
      producerClaimId: "producer-claim-1",
      producerWorkerId: "producer-worker-1",
      producerInvocationId: "producer-invocation-1",
      producerWorkspaceId: "producer-workspace-1",
      committedPackageHash: hashAffiliateAgentValue(candidatePackage),
      targetId: "target-1",
      targetType: "EVENT" as const,
      reviewPass: 1,
      repairContext,
    },
  } as unknown as AffiliateAgentClaimEnvelope;
  let currentCatalog = evidence.catalog;
  const producerClaimLookup = jest.fn(async () => producerClaimRow);
  const readImmutable = jest.fn(async ({ fileId }: { fileId: string }) => {
    if (fileId === "reviewer-package-1") {
      return {
        bytes: packageBytes,
        mimeType: "application/json",
        byteSize: packageBytes.byteLength,
        sourceUrl: null,
        finalUrl: null,
      };
    }
    return {
      bytes: listBytes,
      mimeType: "text/html",
      byteSize: listBytes.byteLength,
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
      runId: "evidence-run-1",
      intakeId: "intake-1",
    };
  });
  const sportsFindMany = jest.fn(async () => currentCatalog.sports);
  const activationJobUpsert = jest.fn();
  const transaction = {
    affiliateAgentGatewayClaims: { findUnique: producerClaimLookup },
    affiliateSupplySources: {
      findUnique: jest.fn(async () => ({
        id: "supply-source-1",
        lifecycleGeneration: 8,
      })),
    },
    sports: { findMany: sportsFindMany },
  };
  const prisma = {
    $transaction: jest.fn(async <T>(callback: (value: typeof transaction) => Promise<T>) =>
      callback(transaction)),
    affiliateAgentGatewayJobs: { upsert: activationJobUpsert },
  } as unknown as PrismaClient;
  const result = {
    claimId: reviewerClaim.claimId,
    claimGeneration: reviewerClaim.claimGeneration,
    invocationId: reviewerClaim.invocationId,
    workerId: reviewerClaim.workerId,
    role: "SUPPLY_REVIEWER",
    disposition: "APPROVED",
    payload: {
      committedPackageHash: hashAffiliateAgentValue(candidatePackage),
    },
    evidenceRefs: ["committed-package-1"],
    supplyContractVersion: 1,
    supplyContractHash: "6".repeat(64),
  } as unknown as AffiliateAgentReviewerTerminalResult;
  return {
    candidatePackage,
    prisma,
    producerEnvelope,
    reviewerClaim,
    result,
    setProducerEnvelope: (next: Record<string, unknown>) => {
      producerClaimRow.claimEnvelopeJson =
        next as typeof producerClaimRow.claimEnvelopeJson;
      producerClaimRow.claimEnvelopeHash = hashAffiliateAgentValue(next);
    },
    setCurrentCatalog: (nextCatalog: typeof evidence.catalog) => {
      currentCatalog = nextCatalog;
    },
    lifecycleCommandResult: {
      assessment: {},
      transition: { generation: 9 },
      isReplayed: false,
    } as unknown as AffiliateSupplyLifecycleCommandResult,
    artifacts: { readImmutable },
    activationJobUpsert,
  };
};


describe("legacy sport repair evidence verifier", () => {
  it("accepts exact catalog, manifest-owned bytes, source URL, and sport union", async () => {
    const fixture = legacySportRepairFixture();
    await expect(verifyAffiliateAgentLegacySportRepair({
      ...fixture,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: ["Grass Soccer"],
    })).resolves.toEqual(expect.objectContaining({
      catalogHashMatched: true,
      evidenceOwnershipPassed: true,
      determinationCoveragePassed: true,
      expectedSportNames: ["Grass Soccer"],
      observedSportNames: ["Grass Soccer"],
    }));
  });
  it("rejects an excluded activity from the extracted retained union", async () => {
    const fixture = multiSportRepairEvidenceFixture();

    await expect(verifyAffiliateAgentLegacySportRepair({
      ...fixture,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: ["Grass Soccer", "Indoor Volleyball", "Martial Arts"],
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      issues: [{
        path: ["sportEvidence", "observedSportNames"],
      }],
    });
  });

  it("distinguishes a missing extracted sport from a rejected citation", async () => {
    const fixture = legacySportRepairFixture();
    await expect(verifyAffiliateAgentLegacySportRepair({
      ...fixture,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: [],
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      safeMessage: "Extracted sports do not match the resolved sport evidence.",
      isRetryable: false,
    });
  });

  it("rejects a forged citation URL even when the artifact bytes hash matches", async () => {
    const fixture = legacySportRepairFixture();
    const determination = fixture.sportEvidence.sportDeterminations[0]!;
    const sportEvidence = {
      ...fixture.sportEvidence,
      sportDeterminations: [{
        ...determination,
        evidence: [{
          ...determination.evidence[0]!,
          pageUrl: "https://attacker.example/forged",
        }],
      }],
    };
    await expect(verifyAffiliateAgentLegacySportRepair({
      ...fixture,
      sportEvidence,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: ["Grass Soccer"],
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      isRetryable: false,
    });
  });

  it("rejects a stale current catalog during validation", async () => {
    const fixture = legacySportRepairFixture();
    const staleCatalog = buildAffiliateSportsCatalogSnapshot(
      [{ id: "sport-indoor", name: "Indoor Soccer" }],
      "2026-09-06T00:00:00.000Z",
    );
    fixture.setCurrentCatalog(staleCatalog);
    await expect(verifyAffiliateAgentLegacySportRepair({
      ...fixture,
      resultKind: "REVIEW_REQUIRED",
      observedSportNames: ["Grass Soccer"],
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      isRetryable: false,
    });
  });
});

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
        targetId: "target-1",
        targetType: "EVENT",
        reviewPass: 1,
      },
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
  it("records legacy repair approval without enqueueing activation", async () => {
    const fixture = legacyApprovalFixture();
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue(fixture.lifecycleCommandResult);
    const adapters = createProductionAffiliateAgentGatewayAdapters({
      prisma: fixture.prisma,
      artifacts: fixture.artifacts,
      storage: {} as StorageProvider,
    });

    await expect(adapters.terminalEffects.APPROVED.execute({
      receiptId: "approval-repair-receipt-1",
      claim: fixture.reviewerClaim,
      result: fixture.result,
    })).resolves.toEqual({
      command: "APPROVE",
      lifecycleGeneration: 9,
      receiptId: "approval-repair-receipt-1",
      activationHeld: true,
      holdReason: "LEGACY_SPORT_REPAIR",
    });
    expect(fixture.activationJobUpsert).not.toHaveBeenCalled();
    expect(lifecycleCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: "APPROVE",
    }));
  });

  it("rejects legacy approval against a stale catalog before any lifecycle effect", async () => {
    const fixture = legacyApprovalFixture();
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue(fixture.lifecycleCommandResult);
    fixture.setCurrentCatalog(buildAffiliateSportsCatalogSnapshot(
      [{ id: "sport-indoor", name: "Indoor Soccer" }],
      "2026-09-06T00:00:00.000Z",
    ));
    const adapters = createProductionAffiliateAgentGatewayAdapters({
      prisma: fixture.prisma,
      artifacts: fixture.artifacts,
      storage: {} as StorageProvider,
    });

    await expect(adapters.terminalEffects.APPROVED.execute({
      receiptId: "approval-repair-stale-receipt-1",
      claim: fixture.reviewerClaim,
      result: fixture.result,
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      isRetryable: false,
    });
    expect(lifecycleCommand).not.toHaveBeenCalled();
    expect(fixture.activationJobUpsert).not.toHaveBeenCalled();
  });

  it("rejects hash-consistent historical producer identity tampering before lifecycle effect", async () => {
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue({} as AffiliateSupplyLifecycleCommandResult);
    const malformedOverrides: readonly Readonly<Record<string, unknown>>[] = [
      { supplySourceId: "other-source" },
      { supplySourceId: null },
      { lifecycleGeneration: null },
    ];

    for (const override of malformedOverrides) {
      const fixture = legacyApprovalFixture();
      fixture.setProducerEnvelope({
        ...fixture.producerEnvelope,
        ...override,
      });
      const adapters = createProductionAffiliateAgentGatewayAdapters({
        prisma: fixture.prisma,
        artifacts: fixture.artifacts,
        storage: {} as StorageProvider,
      });

      await expect(adapters.terminalEffects.APPROVED.execute({
        receiptId: "approval-repair-identity-tamper",
        claim: fixture.reviewerClaim,
        result: fixture.result,
      })).rejects.toMatchObject({
        code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
        isRetryable: false,
      });
    }
    expect(lifecycleCommand).not.toHaveBeenCalled();
  });
  it.each([false, true])("bounds producer repair follow-up for single-claim review=%s", async (singleClaim) => {
    const packageHash = "a".repeat(64);
    const repairContext = {
      kind: "LEGACY_SPORT_REPAIR" as const,
      intakeId: "intake-1",
      evidenceRunId: "evidence-run-1",
      sportsCatalog: buildAffiliateSportsCatalogSnapshot(
        [{ id: "sport-grass", name: "Grass Soccer" }],
        "2026-09-06T00:00:00.000Z",
      ),
    };
    const producerManifestPreimage = {
      schemaVersion: 1 as const,
      entries: [] as const,
    };
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
      roleContractHash: "d".repeat(64),
      roleContractVersion: 3,
      promptTemplateVersion: 3,
      promptTemplateHash: "e".repeat(64),
      executionClass: "PRODUCTION_OMP" as const,
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
        repairContext,
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
    const producerClaimRow = {
      id: producerEnvelope.claimId,
      role: producerEnvelope.role,
      claimGeneration: producerEnvelope.claimGeneration,
      workerId: producerEnvelope.workerId,
      invocationId: producerEnvelope.invocationId,
      workspaceId: producerEnvelope.workspaceId,
      claimEnvelopeJson: producerEnvelope,
      claimEnvelopeHash: hashAffiliateAgentValue(producerEnvelope),
    };
    const prisma = {
      affiliateSupplySources: { findUnique: supplySourceFindUnique },
      affiliateAgentGatewayClaims: {
        findUnique: jest.fn(async () => producerClaimRow),
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
      ...(singleClaim ? { executionBudget: "SINGLE_CLAIM" } : {}),
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
        repairContext,
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

    const output = await adapters.terminalEffects.PRODUCER_REPAIR_REQUIRED.execute({
      receiptId: "repair-receipt-1",
      claim,
      result,
    });
    expect(output).toMatchObject({ lifecycleGeneration: 9 });
    expect(lifecycleCommand).toHaveBeenCalledTimes(1);
    if (singleClaim) {
      expect(output).toMatchObject({ repairBudgetExhausted: true });
      expect(repairJobUpsert).not.toHaveBeenCalled();
    } else {
      expect(output).toMatchObject({ repairJobId: "repair-job-1", repairPass: 2 });
      expect(repairJobUpsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({
          expectedLifecycleGeneration: 9,
          subjectJson: expect.objectContaining({ repairContext }),
        }),
      }));
      const producerContextWithCatalogDrift = {
        ...repairContext,
        sportsCatalog: buildAffiliateSportsCatalogSnapshot(
          [{ id: "sport-indoor", name: "Indoor Soccer" }],
          "2026-08-20T18:00:00.000Z",
        ),
      };
      const driftedProducerEnvelope = {
        ...producerEnvelope,
        subject: {
          ...producerEnvelope.subject,
          repairContext: producerContextWithCatalogDrift,
        },
      };
      producerClaimRow.claimEnvelopeJson = driftedProducerEnvelope;
      producerClaimRow.claimEnvelopeHash = hashAffiliateAgentValue(driftedProducerEnvelope);
      await expect(adapters.terminalEffects.PRODUCER_REPAIR_REQUIRED.execute({
        receiptId: "repair-receipt-catalog-drift",
        claim,
        result,
      })).rejects.toThrow("producer repair context");
      expect(lifecycleCommand).toHaveBeenCalledTimes(2);
    }
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
          finalUrl: null,
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

describe("production Affiliate Agent package evidence", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects a blacklisted sport from a normal producer without repair context", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    }, "PAGE_HTML", {
      html: '<article class="event"><h2 class="title">Spring Meet</h2><p class="description">Join our running and field events.</p><span class="sport">Track and Field</span><a class="link" href="/register">Register</a></article>',
    });
    const candidatePackage = {
      ...fixture.candidatePackage,
      fields: [
        ...fixture.candidatePackage.fields,
        { field: "sportName" as const, selector: ".sport", mode: "TEXT" as const, attribute: null, transform: "TRIM" as const },
      ].sort((left, right) => left.field < right.field ? -1 : left.field > right.field ? 1 : 0),
    };
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "blacklisted-description-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: expect.stringContaining("SPORT_BLACKLISTED"),
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
    expect(fixture.transaction.affiliateAgentGatewayArtifacts.createMany).not.toHaveBeenCalled();
  });

  it("preserves first-party event wording in validated candidates", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    }, "PAGE_HTML", {
      html: '<article class="event"><h2 class="title">Summer Games</h2><p class="description">We welcome <strong>new players</strong> &amp; experienced teams. Players must be listed by a coach before Friday. Visit our official website to register.</p><a class="link" href="/register">Register</a></article>',
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "source-description-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage: fixture.candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    });
    expect(fixture.mappingJob.resultSummary).toEqual(expect.objectContaining({
      gatewayCandidatePackage: expect.objectContaining({
        validationOutput: expect.objectContaining({
          candidates: [expect.objectContaining({
            description: "We welcome new players & experienced teams. Players must be listed by a coach before Friday. Visit our official website to register.",
          })],
        }),
      }),
    }));
  });

  it("rejects organization discovery narration before saving a reviewable package", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/clubs",
      finalUrl: "https://source.example/clubs",
    }, "PAGE_HTML", {
      listingKind: "CLUB",
      html: '<article class="event"><h2 class="title">Community Club</h2><p class="description">This organization was found on DiscNY.</p><a class="link" href="/join">Join</a></article>',
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "narrative-description-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage: fixture.candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: expect.stringContaining("DISCOVERY_NARRATION"),
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
    expect(fixture.transaction.affiliateAgentGatewayArtifacts.createMany).not.toHaveBeenCalled();
  });

  it("rejects named-event found-by narration", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    }, "PAGE_HTML", {
      html: '<article class="event"><h2 class="title">Summer League</h2><p class="description">Summer League was found by our mapping agent and offers weekly play.</p><a class="link" href="/register">Register</a></article>',
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "found-by-description-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage: fixture.candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: expect.stringContaining("DISCOVERY_NARRATION"),
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });

  it("rejects a URL-only value from a permitted text attribute", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    }, "PAGE_HTML", {
      html: '<article class="event"><h2 class="title">Summer Games</h2><p class="description" data-description="/register"></p><a class="link" href="/register">Register</a></article>',
    });
    const candidatePackage = {
      ...fixture.candidatePackage,
      fields: fixture.candidatePackage.fields.map((field) => field.field === "description"
        ? { ...field, mode: "ATTRIBUTE" as const, attribute: "data-description" }
        : field),
    };
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "url-description-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: expect.stringContaining("URL_DESCRIPTION"),
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });

  it("rejects a later candidate without source prose instead of accepting a partial description mapping", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    }, "PAGE_HTML", {
      html: '<article class="event"><h2 class="title">Summer Games</h2><p class="description">Join our weekly outdoor games.</p><a class="link" href="/summer">Register</a></article><article class="event"><h2 class="title">Winter Games</h2><a class="link" href="/winter">Register</a></article>',
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "missing-description-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage: fixture.candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: expect.stringContaining("Candidate 2: MISSING_DESCRIPTION"),
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
    expect(fixture.transaction.affiliateAgentGatewayArtifacts.createMany).not.toHaveBeenCalled();
  });
  it("validates and commits a plural retained source-scope package", async () => {
    const {
      fixture,
      evidence,
      claim,
      candidatePackage,
      transaction,
    } = scopedPackageAdapterFixtureFor();
    const validationAdapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
    const commitAdapter = fixture.adapters.commands.transactional.COMMIT_DECLARATIVE_PACKAGE;
    if (!validationAdapter || !commitAdapter) {
      throw new Error("Expected the production package adapters.");
    }
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue({
        assessment: {},
        transition: { generation: 8 },
        isReplayed: false,
      } as unknown as AffiliateSupplyLifecycleCommandResult);
    const validationReceiptId = "plural-validation";
    const packageHash = hashAffiliateAgentValue(candidatePackage);

    await expect(validationAdapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: validationReceiptId,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
    })).resolves.toEqual({
      isValid: true,
      validatedPackageHash: packageHash,
    });

    await expect(commitAdapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "plural-commit",
      command: {
        type: "COMMIT_DECLARATIVE_PACKAGE",
        data: {
          validationReceiptId,
          validatedPackageHash: packageHash,
        },
      },
    })).resolves.toEqual({ packageHash });
    expect(lifecycleCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: "RECORD_MAPPING",
      request: expect.objectContaining({
        validationOutput: expect.objectContaining({
          sourceSportScopeHash: evidence.sourceSportScope.hash,
        }),
      }),
    }));
    const mappingCreateCall = fixture.transaction.affiliateScrapeMappings.create.mock.calls[0]?.[0] as {
      data?: {
        mapping?: {
          fields?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
        };
      };
    } | undefined;
    const committedMapping = mappingCreateCall?.data?.mapping;
    expect(committedMapping).toEqual(expect.objectContaining({
      fields: expect.objectContaining({
        sportNames: expect.objectContaining({
          mode: "literal",
          value: "Grass Soccer|Indoor Volleyball",
        }),
      }),
      metadata: expect.objectContaining({
        sourceSportScopeHash: evidence.sourceSportScope.hash,
        sourceSportScope: evidence.sourceSportScope,
      }),
    }));
  });
  it.each([
    ["missing", undefined],
    ["different", "b".repeat(64)],
  ] as const)("rejects a %s source-scope package hash", async (_label, sourceSportScopeHash) => {
    const {
      fixture,
      claim,
      candidatePackage,
      transaction,
    } = scopedPackageAdapterFixtureFor();
    const packageWithoutScope = { ...candidatePackage };
    delete packageWithoutScope.sourceSportScopeHash;
    const submittedPackage = sourceSportScopeHash === undefined
      ? packageWithoutScope
      : { ...candidatePackage, sourceSportScopeHash };
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;

    await expect(adapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "scope-hash-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: submittedPackage,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: "The package source sport scope hash does not match the repair context.",
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });
  it("rejects a plural package that omits one retained sport", async () => {
    const {
      fixture,
      claim,
      candidatePackage,
      transaction,
    } = scopedPackageAdapterFixtureFor();
    const packageWithMissingSport = {
      ...candidatePackage,
      fields: candidatePackage.fields.map((field) => field.field === "sportNames"
        ? { ...field, values: ["Grass Soccer"] as const }
        : field),
    };
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;

    await expect(adapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "missing-retained-sport-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: packageWithMissingSport,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
    });
  });
  it("validates a selector that emits the complete plural sport union", async () => {
    const {
      fixture,
      claim,
      candidatePackage,
      transaction,
    } = scopedPackageAdapterFixtureFor({ sportField: "SELECTOR" });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    const packageHash = hashAffiliateAgentValue(candidatePackage);

    await expect(adapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "selector-sports-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
    })).resolves.toEqual({
      isValid: true,
      validatedPackageHash: packageHash,
    });
    expect(fixture.mappingJob.resultSummary).toEqual(expect.objectContaining({
      gatewayCandidatePackage: expect.objectContaining({
        validationOutput: expect.objectContaining({
          candidates: [expect.objectContaining({
            sportNames: ["Grass Soccer", "Indoor Volleyball"],
          })],
        }),
      }),
    }));
  });

  it("reports excluded extracted sports at the editable package fields path", async () => {
    const {
      fixture,
      claim,
      candidatePackage,
      transaction,
    } = scopedPackageAdapterFixtureFor({
      sportField: "SELECTOR",
      selectorValue: "Grass Soccer|Indoor Volleyball|Martial Arts",
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;

    await expect(adapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "excluded-selector-sport-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
    })).rejects.toMatchObject({
      code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
      issues: [{
        path: ["candidatePackage", "fields"],
      }],
    });
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });
  it("rejects an unverified constant sport from the retained package", async () => {
    const {
      fixture,
      claim,
      candidatePackage,
      transaction,
    } = scopedPackageAdapterFixtureFor();
    const packageWithUnverifiedSport = {
      ...candidatePackage,
      fields: candidatePackage.fields.map((field) => field.field === "sportNames"
        ? { ...field, values: ["Grass Soccer", "Indoor Volleyball", "Unverified Sport"] as const }
        : field),
    };
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;

    await expect(adapter.execute({
      transaction: transaction as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "unverified-sport-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: packageWithUnverifiedSport,
          evidenceManifestHash: claim.evidenceManifest.hash,
        },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
    });
  });

  it("rejects Markdown CSS listing evidence before writing validation artifacts", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    }, "PAGE_MARKDOWN");
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "markdown-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage: fixture.candidatePackage, evidenceManifestHash: fixture.claim.evidenceManifest.hash },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: "Declarative CSS extraction requires PAGE_HTML listing evidence.",
      isRetryable: false,
    });
    expect(fixture.transaction.affiliateAgentGatewayArtifacts.createMany).not.toHaveBeenCalled();
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });
  it("rejects a source scope hash on an unscoped package", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;

    await expect(adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "unexpected-scope-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: {
            ...fixture.candidatePackage,
            sourceSportScopeHash: "a".repeat(64),
          },
          evidenceManifestHash: fixture.claim.evidenceManifest.hash,
        },
      },
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
    });
  });

  it("returns safe selector feedback without exposing rejected selector text", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    const failure = await adapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      receiptId: "invalid-selector-validation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: { ...fixture.candidatePackage, itemSelector: "[private-selector-value" },
          evidenceManifestHash: fixture.claim.evidenceManifest.hash,
        },
      },
    }).then(() => { throw new Error("Expected selector rejection."); }, (error: unknown) => error);
    expect(failure).toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      safeMessage: "The declarative package selectors are invalid.",
      isRetryable: false,
    });
    expect(JSON.stringify(failure)).not.toContain("private-selector-value");
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });

  it("validates HTML extraction with a separate Markdown sport citation", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example/events",
      finalUrl: "https://source.example/events",
    });
    const citation = legacySportRepairFixture("PAGE_MARKDOWN");
    if (citation.claim.subject.type !== "MAPPING_PRODUCER") throw new Error("Expected producer evidence.");
    const manifest = {
      schemaVersion: 1 as const,
      entries: [...fixture.claim.evidenceManifest.entries, ...citation.claim.evidenceManifest.entries],
    };
    const claim = {
      ...fixture.claim,
      subject: { ...fixture.claim.subject, repairContext: citation.claim.subject.repairContext },
      evidenceManifest: { ...manifest, hash: hashAffiliateAgentValue(manifest) },
    } as AffiliateAgentClaimEnvelope;
    const readOriginal = fixture.artifacts.readImmutable.getMockImplementation()!;
    fixture.artifacts.readImmutable.mockImplementation(async (input) => (
      input.fileId === "sport-artifact-1"
        ? citation.artifacts.readImmutable()
        : readOriginal(input)
    ));
    const candidatePackage = {
      ...fixture.candidatePackage,
      fields: [
        fixture.candidatePackage.fields[0]!,
        fixture.candidatePackage.fields[1]!,
        { field: "sportName" as const, mode: "CONSTANT" as const, value: "Grass Soccer" },
        fixture.candidatePackage.fields[2]!,
      ],
      sportEvidence: citation.sportEvidence,
      evidenceRefs: ["list-evidence", "sport-evidence-1"],
    };
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE!;
    await expect(adapter.execute({
      transaction: { ...fixture.transaction, sports: citation.prisma.sports } as unknown as Prisma.TransactionClient,
      claim,
      receiptId: "html-with-markdown-citation",
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: { candidatePackage, evidenceManifestHash: claim.evidenceManifest.hash },
      },
    })).resolves.toMatchObject({ isValid: true });
  });

  it("rejects a page list reference without stored provenance during package validation", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: null,
      finalUrl: null,
    });
    const adapter = fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
    if (!adapter) throw new Error("Expected the production validation adapter.");

    let failure: unknown;
    try {
      await adapter.execute({
        transaction: fixture.transaction as unknown as Prisma.TransactionClient,
        claim: fixture.claim,
        command: {
          type: "VALIDATE_DECLARATIVE_PACKAGE",
          data: {
            candidatePackage: fixture.candidatePackage,
            evidenceManifestHash: fixture.claim.evidenceManifest.hash,
          },
        },
        receiptId: "validation-no-provenance",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    const message = failure instanceof Error ? failure.message : "";
    expect(message).toBe(
      "The package listing evidence must include stored source or final URL metadata.",
    );
    expect(message).not.toContain("https://outbound.example.test/events/sample");
    expect(fixture.mappingJobUpdate).not.toHaveBeenCalled();
  });
  it("commits a page package after validation with final URL provenance", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example.test/events",
      finalUrl: "https://final.example.test/events",
    });
    const validationAdapter =
      fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
    const commitAdapter = fixture.adapters.commands.transactional.COMMIT_DECLARATIVE_PACKAGE;
    if (!validationAdapter || !commitAdapter) {
      throw new Error("Expected the production package adapters.");
    }
    const lifecycleResult = {
      assessment: {},
      transition: { generation: 8 },
      isReplayed: false,
    } as unknown as AffiliateSupplyLifecycleCommandResult;
    const lifecycleCommand = jest
      .spyOn(affiliateSupplyPersistence, "executeAffiliateSupplyLifecycleCommand")
      .mockResolvedValue(lifecycleResult);
    const validationReceiptId = "validation-with-provenance";
    const packageHash = hashAffiliateAgentValue(fixture.candidatePackage);

    await expect(validationAdapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: fixture.candidatePackage,
          evidenceManifestHash: fixture.claim.evidenceManifest.hash,
        },
      },
      receiptId: validationReceiptId,
    })).resolves.toEqual({
      isValid: true,
      validatedPackageHash: packageHash,
    });

    await expect(commitAdapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      command: {
        type: "COMMIT_DECLARATIVE_PACKAGE",
        data: {
          validationReceiptId,
          validatedPackageHash: packageHash,
        },
      },
      receiptId: "commit-with-provenance",
    })).resolves.toEqual({ packageHash });

    expect(fixture.transaction.affiliateScrapeMappings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mapping: expect.objectContaining({
            listUrl: "https://final.example.test/events",
          }),
        }),
      }),
    );
    expect(lifecycleCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: "RECORD_MAPPING",
      idempotencyKey: "commit-with-provenance",
    }));
  });


  it("rejects a page list reference without stored provenance during package commit", async () => {
    const fixture = packageAdapterFixtureFor({
      sourceUrl: "https://source.example.test/events",
      finalUrl: "https://final.example.test/events",
    });
    const validationAdapter =
      fixture.adapters.commands.transactional.VALIDATE_DECLARATIVE_PACKAGE;
    const commitAdapter = fixture.adapters.commands.transactional.COMMIT_DECLARATIVE_PACKAGE;
    if (!validationAdapter || !commitAdapter) {
      throw new Error("Expected the production package adapters.");
    }
    const validationReceiptId = "validation-before-commit-no-provenance";
    const packageHash = hashAffiliateAgentValue(fixture.candidatePackage);

    await expect(validationAdapter.execute({
      transaction: fixture.transaction as unknown as Prisma.TransactionClient,
      claim: fixture.claim,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage: fixture.candidatePackage,
          evidenceManifestHash: fixture.claim.evidenceManifest.hash,
        },
      },
      receiptId: validationReceiptId,
    })).resolves.toEqual({
      isValid: true,
      validatedPackageHash: packageHash,
    });

    fixture.setMetadata({ sourceUrl: null, finalUrl: null });
    let failure: unknown;
    try {
      await commitAdapter.execute({
        transaction: fixture.transaction as unknown as Prisma.TransactionClient,
        claim: fixture.claim,
        command: {
          type: "COMMIT_DECLARATIVE_PACKAGE",
          data: {
            validationReceiptId,
            validatedPackageHash: packageHash,
          },
        },
        receiptId: "commit-no-provenance",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    const message = failure instanceof Error ? failure.message : "";
    expect(message).toBe(
      "The package listing evidence must include stored source or final URL metadata.",
    );
    expect(message).not.toContain("https://outbound.example.test/events/sample");
    expect(fixture.transaction.affiliateScrapeMappings.create).not.toHaveBeenCalled();
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
      '<div class="event"><span class="title">Sample event</span><p class="description">Join weekly outdoor games with players of all skill levels.</p><span class="tags">Soccer</span><span class="division">Adults</span><a class="link" href="/events/sample">Details</a></div>',
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
        finalUrl: string | null;
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
          sourceUrl: "https://evidence.example.test/source-events",
          finalUrl: "https://evidence.example.test/final-events",
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
          field: "description" as const,
          selector: ".description",
          mode: "TEXT" as const,
          attribute: null,
          transform: "TRIM" as const,
        },
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
      roleContractHash: "e".repeat(64),
      roleContractVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.version,
      promptTemplateVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.promptTemplateVersion,
      promptTemplateHash: "f".repeat(64),
      role: "MAPPING_PRODUCER",
      subject: {
        type: "MAPPING_PRODUCER",
        supplySourceId: "supply-source-1",
        mappingJobId: "mapping-job-1",
        pass: 1,
        listingKind: "EVENT",
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
        validationReceiptId: "validation-receipt-1",
        validationOutput: expect.objectContaining({
          listUrl: "https://evidence.example.test/final-events",
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
    })).rejects.toMatchObject({
      code: "COMMAND_SCHEMA_INVALID",
      isRetryable: false,
      safeMessage: "The declarative package listing kind does not match the source target kind.",
    });
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
describe("production active Supply Contract artifact resolver", () => {
  const activeManifestFor = (): AffiliateSupplyContractManifest =>
    buildAffiliateSupplyContractManifest({
      version: 7,
      rolloutCohort: "TEST-COHORT",
      status: "ACTIVE",
      supplyContract: {
        schemaVersion: 1,
        version: 7,
        rolloutCohort: "TEST-COHORT",
        hash: undefined,
        freshnessWindows: [{ sourceProfile: "EVENT", maximumAgeHours: 24 }],
        targets: [{
          marketKey: "test-market",
          sourceProfile: "EVENT",
          minimumFreshPublishedSupply: 1,
        }],
        requiredMappingEvidenceKinds: ["PAGE_HTML"],
        requiredLifecycleEvidenceKinds: ["DURABLE_SOURCE_EVIDENCE"],
      },
    });

  const rowFor = (manifest: AffiliateSupplyContractManifest) => ({
    version: manifest.version,
    rolloutCohort: manifest.rolloutCohort,
    status: manifest.status,
    contractHash: manifest.hash,
    contractJson: manifest.supplyContract,
  });

  const bytesFor = (manifest: AffiliateSupplyContractManifest): Buffer => {
    const { hash: _policyHash, ...contractPreimage } = manifest.supplyContract;
    return Buffer.from(
      canonicalizeAffiliateAgentValue(contractPreimage),
      "utf8",
    );
  };

  const prismaFor = (rows: readonly unknown[]) => ({
    affiliateSupplyContractManifests: {
      findMany: jest.fn(async () => rows),
    },
  }) as unknown as PrismaClient;

  it("resolves the policy hash handle against its active manifest", async () => {
    const manifest = activeManifestFor();
    const bytes = bytesFor(manifest);
    const entry = {
      kind: "ACTIVE_SUPPLY_CONTRACT",
      artifactId: `${AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX}${manifest.supplyContract.hash}`,
      sha256: manifest.supplyContract.hash,
      mimeType: "application/json",
      byteSize: bytes.byteLength,
    };

    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor([rowFor(manifest)]),
      entry,
      maximumBytes: 8 * 1024 * 1024,
    })).resolves.toEqual({
      bytes,
      mimeType: "application/json",
      byteSize: bytes.byteLength,
      sourceUrl: null,
      finalUrl: null,
    });
    expect(manifest.hash).not.toBe(manifest.supplyContract.hash);
  });

  it("rejects synthetic handles with invalid manifest binding metadata", async () => {
    const manifest = activeManifestFor();
    const bytes = bytesFor(manifest);
    const artifactId = `${AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX}${manifest.supplyContract.hash}`;
    const baseEntry = {
      kind: "ACTIVE_SUPPLY_CONTRACT",
      artifactId,
      sha256: manifest.supplyContract.hash,
      mimeType: "application/json",
      byteSize: bytes.byteLength,
    };
    const rows = [rowFor(manifest)];

    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor(rows),
      entry: { ...baseEntry, sha256: "a".repeat(64) },
    })).rejects.toThrow("The active Supply Contract artifact is not valid.");
    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor(rows),
      entry: { ...baseEntry, mimeType: "text/plain" },
    })).rejects.toThrow("The active Supply Contract artifact is not valid.");
    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor(rows),
      entry: { ...baseEntry, byteSize: bytes.byteLength + 1 },
    })).rejects.toThrow("The active Supply Contract artifact is not valid.");
    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor(rows),
      entry: { ...baseEntry, kind: "COMMITTED_PACKAGE" },
    })).rejects.toThrow("The active Supply Contract artifact is not valid.");
  });

  it("rejects ambiguous and corrupted active manifests", async () => {
    const manifest = activeManifestFor();
    const entry = {
      kind: "ACTIVE_SUPPLY_CONTRACT",
      artifactId: `${AFFILIATE_AGENT_ACTIVE_SUPPLY_CONTRACT_ARTIFACT_PREFIX}${manifest.supplyContract.hash}`,
      sha256: manifest.supplyContract.hash,
      mimeType: "application/json",
      byteSize: bytesFor(manifest).byteLength,
    };

    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor([rowFor(manifest), rowFor(manifest)]),
      entry,
    })).rejects.toThrow("The active Supply Contract artifact is not valid.");

    const corruptHash = manifest.hash[0] === "0"
      ? `1${manifest.hash.slice(1)}`
      : `0${manifest.hash.slice(1)}`;
    await expect(resolveAffiliateAgentActiveSupplyContractArtifact({
      prisma: prismaFor([{
        ...rowFor(manifest),
        contractHash: corruptHash,
      }]),
      entry,
    })).rejects.toThrow("The active Supply Contract artifact is not valid.");
  });
});
