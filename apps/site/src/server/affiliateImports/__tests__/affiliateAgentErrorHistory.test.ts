/** @jest-environment node */

import {
  AFFILIATE_AGENT_ERROR_EVENT,
  AFFILIATE_AGENT_ERROR_LIMIT_EVENT,
  AFFILIATE_AGENT_ERROR_MAX_RECORD_BYTES,
  AFFILIATE_AGENT_ERROR_MAX_RECORDS,
  AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
  affiliateAgentErrorObservationFor,
} from "../affiliateAgentErrorObservations";
import {
  AFFILIATE_AGENT_ERROR_HISTORY_MAX_RESULTS,
  buildAffiliateAgentErrorHistoryReport,
  loadAffiliateAgentErrorHistoryReport,
  parseAffiliateAgentErrorHistoryFilters,
} from "../affiliateAgentErrorHistory";

const observation = affiliateAgentErrorObservationFor({
  tool: "execute_command",
  stage: "LOCAL_SCHEMA",
  command: { type: "RUN_DISCOVERY_QUERY" },
  errorCode: "COMMAND_SCHEMA_INVALID",
  reasonCode: "LOCAL_SCHEMA_INVALID",
  issues: [{ code: "INVALID_VALUE", path: ["command", "data", "queryRef"] }],
});

const eventFor = (id: string, payload: unknown = {
  schemaVersion: 1,
  origin: "GATEWAY",
  category: "INPUT",
  observation,
}) => ({
  id,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  eventKey: `error:${id}`,
  jobId: "job-1",
  claimId: "claim-1",
  receiptId: `receipt-${id}`,
  sequence: 4,
  eventType: AFFILIATE_AGENT_ERROR_EVENT,
  actorKind: "AGENT_INVOCATION",
  actorId: "invocation-1",
  role: "MAPPING_PRODUCER",
  reasonCodes: [],
  payload,
});

const job = {
  id: "job-1",
  createdAt: new Date("2026-08-31T23:00:00.000Z"),
  updatedAt: new Date("2026-09-01T01:00:00.000Z"),
  queue: "affiliate-mapping",
  lane: "MAPPING",
  role: "MAPPING_PRODUCER",
  subjectType: "SUPPLY_SOURCE",
  subjectId: "source-1",
  supplySourceId: "source-1",
  expectedLifecycleGeneration: 2,
  status: "COMPLETED",
  claimGeneration: 1,
  invocationFailureCount: 1,
  terminalDisposition: "COMPLETED",
  terminalReceiptId: "terminal-receipt-1",
  finishedAt: new Date("2026-09-01T01:00:00.000Z"),
};

const claim = {
  id: "claim-1",
  jobId: "job-1",
  claimGeneration: 1,
  lifecycleGeneration: 2,
  role: "MAPPING_PRODUCER",
  workerId: "worker-1",
  invocationId: "invocation-1",
  status: "COMPLETED",
  claimedAt: new Date("2026-08-31T23:01:00.000Z"),
  endedAt: new Date("2026-09-01T01:00:00.000Z"),
  terminalReceiptId: "terminal-receipt-1",
  diagnosticRetainUntil: new Date("2026-09-15T00:00:00.000Z"),
  deploymentContractVersion: 1,
  deploymentContractHash: "a".repeat(64),
  roleContractVersion: 12,
  roleContractHash: "b".repeat(64),
  promptTemplateVersion: 12,
  promptTemplateHash: "c".repeat(64),
  supplyContractVersion: 4,
  supplyContractHash: "d".repeat(64),
};

const source = {
  id: "source-1",
  canonicalUrl: "https://example.test/programs",
  operatorDomain: "example.test",
  pathKey: "programs",
  targetKind: "EVENT",
  lifecycleGeneration: 2,
  derivedStage: "MAPPED",
  derivedOutcome: "READY",
  freshnessStatus: "FRESH",
};

const receipts = [
  {
    id: "receipt-error-1",
    operationKind: "RECORD_ERROR",
    commandName: null,
    status: "SUCCEEDED",
    safeErrorCode: null,
    startedAt: new Date("2026-09-01T00:00:00.000Z"),
    completedAt: new Date("2026-09-01T00:00:00.000Z"),
    retentionClass: "INDEFINITE",
    retentionDeadline: null,
  },
  {
    id: "terminal-receipt-1",
    operationKind: "SUBMIT_RESULT",
    commandName: null,
    status: "SUCCEEDED",
    safeErrorCode: null,
    startedAt: new Date("2026-09-01T01:00:00.000Z"),
    completedAt: new Date("2026-09-01T01:00:00.000Z"),
    retentionClass: "INDEFINITE",
    retentionDeadline: null,
  },
];

const readClientFor = (events: readonly unknown[]) => ({
  affiliateAgentGatewayEvents: { findMany: jest.fn().mockResolvedValue(events) },
  affiliateAgentGatewayJobs: { findMany: jest.fn().mockResolvedValue([job]) },
  affiliateAgentGatewayClaims: { findMany: jest.fn().mockResolvedValue([claim]) },
  affiliateAgentGatewayOperationReceipts: { findMany: jest.fn().mockResolvedValue(receipts) },
  affiliateSupplySources: { findMany: jest.fn().mockResolvedValue([source]) },
  affiliateScrapeSources: { findMany: jest.fn().mockResolvedValue([]) },
});
const recordFor = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const matchesWhere = (
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean => {
  const and = where.AND;
  if (Array.isArray(and) && !and.every((clause) => matchesWhere(row, recordFor(clause)))) {
    return false;
  }
  const or = where.OR;
  if (Array.isArray(or) && !or.some((clause) => matchesWhere(row, recordFor(clause)))) {
    return false;
  }
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND" || key === "OR") return true;
    const value = row[key];
    const conditionRecord = recordFor(condition);
    if (Array.isArray(conditionRecord.in)) return conditionRecord.in.includes(value);
    return Object.keys(conditionRecord).length === 0
      ? value === condition
      : false;
  });
};
const whereFrom = (args: unknown): Record<string, unknown> => (
  recordFor(recordFor(args).where)
);

describe("affiliate agent error history report", () => {
  it("links rows to stored source and claim metadata and groups repeated errors without inferring recovery", async () => {
    const client = readClientFor([
      { ...eventFor("event-1"), receiptId: "receipt-error-1" },
      { ...eventFor("event-2"), receiptId: "receipt-error-1" },
    ]);
    const report = await loadAffiliateAgentErrorHistoryReport(client, {
      sourceId: "source-1",
      maxResults: 10,
    });

    expect(report.rows).toHaveLength(2);
    expect(report.groups).toEqual([expect.objectContaining({
      recordCount: 2,
      errorCode: "COMMAND_SCHEMA_INVALID",
      reasonCodes: ["LOCAL_SCHEMA_INVALID"],
      recordReferences: [
        { kind: "EVENT", id: "event-1" },
        { kind: "EVENT", id: "event-2" },
      ],
    })]);
    expect(report.rows[0]).toMatchObject({
      claim: {
        id: "claim-1",
        generation: 1,
        role: "MAPPING_PRODUCER",
        invocationId: "invocation-1",
        status: "COMPLETED",
      },
      job: { id: "job-1", status: "COMPLETED", supplySourceId: "source-1" },
      source: {
        id: "source-1",
        canonicalUrl: "https://example.test/programs",
        links: ["https://example.test/programs"],
      },
      receipt: { operationKind: "RECORD_ERROR", status: "SUCCEEDED" },
      finalReceipt: { id: "terminal-receipt-1", operationKind: "SUBMIT_RESULT" },
      markers: {
        diagnosticRecordingReceipt: true,
        recoveryNotInferred: true,
      },
    });
    expect(report.recoveryAssessment).toBe("NOT_INFERRED");
  });
  it("conjoins source, job, and claim filters for events and receipt-only rows", async () => {
    const sourceA = { ...source, id: "source-a" };
    const sourceB = { ...source, id: "source-b", canonicalUrl: "https://other.test/programs" };
    const jobA = { ...job, id: "job-a", subjectId: "source-a", supplySourceId: "source-a" };
    const jobB = { ...job, id: "job-b", subjectId: "source-b", supplySourceId: "source-b" };
    const claimA = { ...claim, id: "claim-a", jobId: "job-a" };
    const claimB = { ...claim, id: "claim-b", jobId: "job-b" };
    const eventA = { ...eventFor("event-a"), jobId: "job-a", claimId: "claim-a", receiptId: "receipt-a" };
    const eventB = { ...eventFor("event-b"), jobId: "job-b", claimId: "claim-b", receiptId: "receipt-b" };
    const receiptA = {
      ...receipts[0],
      id: "receipt-a",
      claimId: "claim-a",
      jobId: "job-a",
    };
    const receiptB = {
      ...receipts[0],
      id: "receipt-b",
      claimId: "claim-b",
      jobId: "job-b",
    };
    const receiptOnlyA = {
      ...receiptA,
      id: "receipt-only-a",
      operationKind: "EXECUTE_COMMAND",
      status: "FAILED",
      safeErrorCode: "COMMAND_SCHEMA_INVALID",
    };
    const receiptOnlyB = {
      ...receiptB,
      id: "receipt-only-b",
      operationKind: "EXECUTE_COMMAND",
      status: "FAILED",
      safeErrorCode: "COMMAND_SCHEMA_INVALID",
    };
    const allSources = [sourceA, sourceB];
    const allJobs = [jobA, jobB];
    const allClaims = [claimA, claimB];
    const allEvents = [eventA, eventB];
    const allReceipts = [receiptA, receiptB, receiptOnlyA, receiptOnlyB, receipts[1]];
    const client = {
      affiliateAgentGatewayEvents: {
        findMany: jest.fn(async (args: unknown) => (
          allEvents.filter((row) => matchesWhere(row, whereFrom(args)))
        )),
      },
      affiliateAgentGatewayJobs: {
        findMany: jest.fn(async (args: unknown) => (
          allJobs.filter((row) => matchesWhere(row, whereFrom(args)))
        )),
      },
      affiliateAgentGatewayClaims: {
        findMany: jest.fn(async (args: unknown) => (
          allClaims.filter((row) => matchesWhere(row, whereFrom(args)))
        )),
      },
      affiliateAgentGatewayOperationReceipts: {
        findMany: jest.fn(async (args: unknown) => (
          allReceipts.filter((row) => matchesWhere(row, whereFrom(args)))
        )),
      },
      affiliateSupplySources: {
        findMany: jest.fn(async (args: unknown) => (
          allSources.filter((row) => matchesWhere(row, whereFrom(args)))
        )),
      },
      affiliateScrapeSources: {
        findMany: jest.fn(async () => []),
      },
    };
    const sourceAReport = await loadAffiliateAgentErrorHistoryReport(client, {
      sourceId: "source-a",
      maxResults: 50,
    });
    expect(sourceAReport.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "event-a", recordKind: "EVENT" }),
      expect.objectContaining({
        eventId: null,
        recordKind: "RECEIPT",
        receipt: expect.objectContaining({ id: "receipt-only-a" }),
        markers: expect.objectContaining({ receiptOnly: true }),
        finalReceipt: expect.objectContaining({ id: "terminal-receipt-1" }),
      }),
    ]));
    expect(sourceAReport.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recordReferences: [{ kind: "RECEIPT", id: "receipt-only-a" }],
      }),
    ]));


    const sourceAndDifferentJob = await loadAffiliateAgentErrorHistoryReport(client, {
      sourceId: "source-a",
      jobId: "job-b",
      maxResults: 50,
    });
    const jobAndDifferentClaim = await loadAffiliateAgentErrorHistoryReport(client, {
      jobId: "job-a",
      claimId: "claim-b",
      maxResults: 50,
    });

    expect(sourceAndDifferentJob.rows).toHaveLength(0);
    expect(jobAndDifferentClaim.rows).toHaveLength(0);
  });

  it("resolves an older explicit source job without truncating its exact scope", async () => {
    const sourceA = { ...source, id: "source-a" };
    const olderJob = {
      ...job,
      id: "older-job",
      subjectId: "source-a",
      supplySourceId: "source-a",
    };
    const olderClaim = { ...claim, id: "older-claim", jobId: "older-job" };
    const olderEvent = {
      ...eventFor("older-event"),
      jobId: "older-job",
      claimId: "older-claim",
      receiptId: null,
    };
    const jobsFindMany = jest.fn(async (args: unknown) => {
      const where = whereFrom(args);
      return Array.isArray(where.AND)
        ? [olderJob]
        : Array.from({ length: 2_001 }, (_, index) => ({
            ...olderJob,
            id: `recent-job-${index}`,
          }));
    });
    const client = {
      affiliateAgentGatewayEvents: {
        findMany: jest.fn(async () => [olderEvent]),
      },
      affiliateAgentGatewayJobs: { findMany: jobsFindMany },
      affiliateAgentGatewayClaims: {
        findMany: jest.fn(async () => [olderClaim]),
      },
      affiliateAgentGatewayOperationReceipts: {
        findMany: jest.fn(async () => []),
      },
      affiliateSupplySources: {
        findMany: jest.fn(async () => [sourceA]),
      },
      affiliateScrapeSources: {
        findMany: jest.fn(async () => []),
      },
    };
    const report = await loadAffiliateAgentErrorHistoryReport(client, {
      sourceId: "source-a",
      jobId: "older-job",
      maxResults: 1,
    });

    expect(report.rows[0]).toMatchObject({ job: { id: "older-job" } });
    expect(report.limits.scopeTruncated).toBe(false);
    expect(jobsFindMany).toHaveBeenCalledTimes(1);
    expect(recordFor(jobsFindMany.mock.calls[0][0]).take).toBe(1);
    expect(whereFrom(jobsFindMany.mock.calls[0][0]).AND).toEqual([
      { supplySourceId: { in: ["source-a"] } },
      { id: { in: ["older-job"] } },
    ]);
  });

  it("bounds legacy source prefetches and follows canonical live source links", async () => {
    const liveSource = { ...source, liveSourceId: "legacy-source-1" };
    const legacySource = {
      id: "legacy-source-1",
      supplySourceId: "source-1",
      sourceKey: "legacy-source",
      baseUrl: "https://legacy.example.test",
      listUrl: "https://legacy.example.test/programs",
    };
    const representativeLegacySource = {
      ...legacySource,
      id: "legacy-source-a",
      sourceKey: "legacy-source-a",
    };
    const scopedScrapeCalls: unknown[] = [];
    const scopedBase = readClientFor([
      { ...eventFor("event-1"), receiptId: "receipt-error-1" },
    ]);
    const scopedClient = {
      ...scopedBase,
      affiliateSupplySources: {
        findMany: jest.fn(async () => [liveSource]),
      },
      affiliateScrapeSources: {
        findMany: jest.fn(async (args: unknown) => {
          scopedScrapeCalls.push(args);
          const where = recordFor(recordFor(args).where);
          if (where.id === "source-1") return [];
          if (where.supplySourceId === "source-1") return [representativeLegacySource];
          const ids = recordFor(where.id).in;
          return Array.isArray(ids) && ids.includes("legacy-source-1")
            ? [legacySource]
            : [];
        }),
      },
    };
    const scopedReport = await loadAffiliateAgentErrorHistoryReport(scopedClient, {
      sourceId: "source-1",
      maxResults: 1,
    });

    expect(scopedScrapeCalls).toHaveLength(3);
    expect(scopedScrapeCalls.every((args) => recordFor(args).take === 1)).toBe(true);
    expect(scopedReport.rows[0].source).toMatchObject({
      legacySourceId: "legacy-source-1",
    });

    const enrichmentScrapeCalls: unknown[] = [];
    const enrichmentClient = {
      ...scopedBase,
      affiliateSupplySources: {
        findMany: jest.fn(async () => [liveSource]),
      },
      affiliateScrapeSources: {
        findMany: jest.fn(async (args: unknown) => {
          enrichmentScrapeCalls.push(args);
          return [legacySource];
        }),
      },
    };
    const enrichmentReport = await loadAffiliateAgentErrorHistoryReport(enrichmentClient, {
      maxResults: 1,
    });
    const enrichmentArgs = recordFor(enrichmentScrapeCalls[0]);

    expect(enrichmentScrapeCalls).toHaveLength(1);
    expect(enrichmentArgs.take).toBe(1);
    expect(recordFor(recordFor(enrichmentArgs.where).id).in).toEqual(["legacy-source-1"]);
    expect(enrichmentReport.rows[0].source).toMatchObject({
      legacySourceId: "legacy-source-1",
    });
  });

  it("sorts event and receipt failures by occurrence before applying maxResults", () => {
    const olderEvent = {
      ...eventFor("event-older"),
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      receiptId: null,
    };
    const newestReceipt = {
      ...receipts[0],
      id: "receipt-newest",
      operationKind: "EXECUTE_COMMAND",
      status: "FAILED",
      safeErrorCode: "ARTIFACT_READ_INTERRUPTED",
      completedAt: new Date("2026-09-01T01:00:00.000Z"),
    };
    const report = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 1 },
      events: [olderEvent],
      receipts: [newestReceipt],
      receiptOnlyReceipts: [newestReceipt],
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      eventId: null,
      recordKind: "RECEIPT",
      createdAt: "2026-09-01T01:00:00.000Z",
      receipt: {
        id: "receipt-newest",
        safeErrorCode: "ARTIFACT_READ_INTERRUPTED",
      },
      classification: {
        category: "PLATFORM",
        errorCode: "ARTIFACT_READ_INTERRUPTED",
        reasonCodes: ["RECEIPT_FAILURE"],
      },
    });
    expect(report.limits.resultTruncated).toBe(true);
  });


  it("retains finite terminal reasons and groups typed event references", () => {
    const terminalEvent = {
      ...eventFor("event-terminal"),
      eventType: "TERMINAL_EFFECT_FAILURE_RECORDED",
      reasonCodes: ["LIFECYCLE_GENERATION_STALE", "EVIDENCE_REQUIRED", "private-reason"],
      payload: {
        code: "REVIEWER_TERMINAL_EFFECT_FAILED",
        diagnostics: [
          {
            code: "REVIEWER_TERMINAL_EFFECT_FAILED",
            stage: "EXECUTE",
            reasonCodes: ["LIFECYCLE_GENERATION_STALE", "private-reason"],
          },
          {
            code: "REVIEWER_TERMINAL_EFFECT_FAILED",
            stage: "RECOVER",
            reasonCodes: ["EVIDENCE_REQUIRED"],
          },
        ],
        message: "private terminal prose",
      },
    };
    const report = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 10 },
      events: [terminalEvent],
    });

    expect(report.rows[0]).toMatchObject({
      classification: {
        category: "PLATFORM",
        errorCode: "PARTIAL_COMMAND_UNRESOLVED",
        reasonCodes: ["EVIDENCE_REQUIRED", "LIFECYCLE_GENERATION_STALE"],
      },
      markers: { malformedPayload: true },
    });
    expect(report.groups).toEqual([expect.objectContaining({
      reasonCodes: ["EVIDENCE_REQUIRED", "LIFECYCLE_GENERATION_STALE"],
      recordReferences: [{ kind: "EVENT", id: "event-terminal" }],
    })]);
    expect(JSON.stringify(report)).not.toContain("private");
  });

  it("redacts malformed new history and unsafe old schema-correction payloads", () => {
    const malformed = eventFor("event-malformed", {
      schemaVersion: 1,
      origin: "GATEWAY",
      category: "PLATFORM",
      privateField: "private-malformed-history",
    });
    const oldSchemaEvent = {
      ...eventFor("event-schema"),
      eventType: "CLAIM_SCHEMA_CORRECTION_REQUIRED",
      payload: {
        reason: "private old schema prose",
        issuePath: ["private", "field"],
      },
    };
    const report = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 10 },
      events: [malformed, oldSchemaEvent],
    });

    expect(report.rows.map((row) => row.classification)).toEqual([
      expect.objectContaining({
        errorCode: "HISTORY_PAYLOAD_INVALID",
        reasonCodes: ["HISTORY_PAYLOAD_INVALID"],
        sourceKind: "MALFORMED_HISTORY",
      }),
      expect.objectContaining({
        errorCode: "RESULT_SCHEMA_INVALID",
        reasonCodes: ["SCHEMA_CORRECTION_REQUIRED"],
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain("private-malformed-history");
    expect(JSON.stringify(report)).not.toContain("private old schema prose");
    expect(JSON.stringify(report)).not.toContain("private");
  });
  it("keeps authoritative invocation and lease failures neutral and finite", () => {
    const invocation = {
      ...eventFor("event-invocation", { privateSummary: "do not expose" }),
      eventType: "CLAIM_INVOCATION_FAILED",
      reasonCodes: ["PROCESS_CRASH", "private-reason"],
    };
    const expired = {
      ...eventFor("event-expired", { privateSummary: "do not expose" }),
      eventType: "CLAIM_EXPIRED",
    };
    const report = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 10 },
      events: [invocation, expired],
    });

    expect(report.rows.map((row) => row.classification)).toEqual([
      expect.objectContaining({
        category: "PLATFORM",
        errorCode: "PROCESS_CRASH",
        reasonCodes: ["INVOCATION_FAILURE"],
        sourceKind: "INVOCATION_FAILURE",
      }),
      expect.objectContaining({
        category: "AUTHORITY",
        errorCode: "LEASE_EXPIRED",
        reasonCodes: ["CLAIM_LEASE_EXPIRED"],
        sourceKind: "CLAIM_LEASE_FAILURE",
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain("private");
  });


  it("keeps storage limit markers and reports result truncation", () => {
    const limitEvent = {
      ...eventFor("event-limit"),
      eventType: AFFILIATE_AGENT_ERROR_LIMIT_EVENT,
      payload: {
        schemaVersion: 1,
        maxRecords: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
        recordedCount: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        recordedBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      },
    };
    const report = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 2 },
      events: [limitEvent, eventFor("event-2"), eventFor("event-3")],
      resultTruncated: true,
    });

    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({
      eventType: AFFILIATE_AGENT_ERROR_LIMIT_EVENT,
      limit: {
        maxRecords: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
        recordedCount: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        recordedBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      },
    });
    expect(report.rows[0].classification).toMatchObject({
      category: "PLATFORM",
      errorCode: "HISTORY_LIMIT_REACHED",
      reasonCodes: ["HISTORY_LIMIT_REACHED"],
    });

    expect(report.limits).toMatchObject({
      resultTruncated: true,
      limitMarkerCount: 1,
      limitMarkerEventIds: ["event-limit"],
      storage: {
        maxRecordsPerClaim: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        maxRecordBytes: AFFILIATE_AGENT_ERROR_MAX_RECORD_BYTES,
        maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      },
    });
  });
  it("accepts legitimate count/byte markers and rejects forged limit payloads", () => {
    const limitEventFor = (id: string, payload: unknown) => ({
      ...eventFor(id),
      eventType: AFFILIATE_AGENT_ERROR_LIMIT_EVENT,
      payload,
    });
    const base = {
      schemaVersion: 1,
      maxRecords: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
      maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
    };
    const countLimited = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 1 },
      events: [limitEventFor("event-count-limit", {
        ...base,
        recordedCount: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        recordedBytes: 1,
      })],
    });
    const byteLimited = buildAffiliateAgentErrorHistoryReport({
      filters: { maxResults: 1 },
      events: [limitEventFor("event-byte-limit", {
        ...base,
        recordedCount: 1,
        recordedBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      })],
    });
    const invalidPayloads = [
      { ...base, maxRecords: AFFILIATE_AGENT_ERROR_MAX_RECORDS - 1, recordedCount: 1, recordedBytes: 1 },
      { ...base, maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES - 1, recordedCount: 1, recordedBytes: 1 },
      { ...base, recordedCount: AFFILIATE_AGENT_ERROR_MAX_RECORDS + 1, recordedBytes: 1 },
      { ...base, recordedCount: 0, recordedBytes: 1 },
    ];

    expect(countLimited.rows[0].limit).toEqual({
      maxRecords: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
      maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      recordedCount: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
      recordedBytes: 1,
    });
    expect(byteLimited.rows[0].limit).toEqual({
      maxRecords: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
      maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      recordedCount: 1,
      recordedBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
    });
    for (const [index, payload] of invalidPayloads.entries()) {
      const report = buildAffiliateAgentErrorHistoryReport({
        filters: { maxResults: 1 },
        events: [limitEventFor(`event-invalid-limit-${index}`, payload)],
      });
      expect(report.rows[0]).toMatchObject({
        classification: {
          errorCode: "HISTORY_PAYLOAD_INVALID",
          reasonCodes: ["HISTORY_PAYLOAD_INVALID"],
        },
        markers: { malformedPayload: true },
        limit: {
          maxRecords: null,
          maxTotalBytes: null,
          recordedCount: null,
          recordedBytes: null,
        },
      });
    }
  });

  it("rejects unsafe scope identifiers and unbounded result filters", () => {
    expect(() => parseAffiliateAgentErrorHistoryFilters({ claimId: "not safe" })).toThrow();
    expect(() => parseAffiliateAgentErrorHistoryFilters({ maxResults: AFFILIATE_AGENT_ERROR_HISTORY_MAX_RESULTS + 1 })).toThrow();
  });
});
