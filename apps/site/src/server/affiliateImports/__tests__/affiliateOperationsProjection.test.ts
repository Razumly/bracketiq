/** @jest-environment node */

import {
  buildAffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
} from "../affiliateSupplyLifecycle";
import {
  loadAffiliateOperationsProjection,
} from "../affiliateOperationsProjection";
import type { AffiliateOperationsProjectionInput } from "@/types/affiliateOperations";

const transactionMock = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const policy: AffiliateSupplyContractPolicy = {
  schemaVersion: 1,
  version: 1,
  rolloutCohort: "DEFAULT",
  hash: "ignored-by-builder",
  freshnessWindows: [{ sourceProfile: "EVENT", maximumAgeHours: 24 }],
  targets: [],
  requiredMappingEvidenceKinds: [],
  requiredLifecycleEvidenceKinds: [],
};
const manifest = buildAffiliateSupplyContractManifest({
  version: policy.version,
  rolloutCohort: policy.rolloutCohort,
  supplyContract: { ...policy, hash: undefined },
});

const inputFor = (
  overrides: Partial<AffiliateOperationsProjectionInput> = {},
): AffiliateOperationsProjectionInput => ({
  view: "cutover",
  page: 1,
  pageSize: 25,
  targetPage: 1,
  campaignPage: 1,
  discoveryPage: 1,
  historyPage: 1,
  historyPageSize: 25,
  filters: {
    market: "",
    city: "",
    sport: "",
    profile: "",
    range: "",
    status: "",
    lane: "",
    role: "",
    reason: "",
  },
  contract: { rolloutCohort: "DEFAULT", contractVersion: 1 },
  sort: { key: "", direction: "desc" },
  scrollAnchor: null,
  selectedType: null,
  selectedId: null,
  ...overrides,
});

type Delegate = {
  findFirst?: jest.Mock;
  findMany: jest.Mock;
  count?: jest.Mock;
  groupBy?: jest.Mock;
};
const setupProjection = (
  collections: Record<string, unknown[]> = {},
  options: Readonly<{ queryRaw?: jest.Mock }> = {},
) => {
  const delegates = new Map<string, Delegate>();
  const delegateFor = (name: string): Delegate => {
    const existing = delegates.get(name);
    if (existing) return existing;
    const delegate: Delegate = {
      findMany: jest.fn(async () => collections[name] ?? []),
    };
    delegates.set(name, delegate);
    return delegate;
  };
  const contractDelegate: Delegate = {
    findFirst: jest.fn(async () => ({
      id: "contract-1",
      rolloutCohort: "DEFAULT",
      version: 1,
      status: "ACTIVE",
      contractHash: manifest.hash,
      contractJson: manifest.supplyContract,
      componentHashes: [],
      activatedAt: new Date("2026-08-29T00:00:00.000Z"),
    })),
    findMany: jest.fn(async () => []),
  };
  delegates.set("affiliateSupplyContractManifests", contractDelegate);
  Object.keys(collections).forEach((name) => {
    delegateFor(name);
  });
  const client = new Proxy(
    {},
    {
      get: (_target, property: string) =>
        property === "$queryRaw" && options.queryRaw
          ? options.queryRaw
          : delegateFor(property),
    },
  );
  transactionMock.mockImplementation(async (callback: (value: unknown) => unknown) =>
    callback(client),
  );
  return delegates;
};

const reconciliationRun = (
  id: string,
  reportJson: Record<string, unknown> = {},
) => ({
  id,
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
  updatedAt: new Date("2026-08-29T00:01:00.000Z"),
  mode: "ROLLBACK_DRILL",
  status: "BINARY_ROLLBACK_ALLOWED",
  operatorId: "operator-1",
  rolloutCohort: "DEFAULT",
  supplyContractVersion: 1,
  supplyContractHash: manifest.supplyContract.hash,
  deploymentContractVersion: 2,
  deploymentContractHash: "deployment-hash",
  inputHash: "input-hash",
  outputHash: "output-hash",
  reportHash: `report-${id}`,
  counts: {
    processInventory: 1,
    recordsByKind: { CANDIDATE: 3, MAPPING: 2 },
  },
  failedInvariants: [],
  resolutionRefs: [],
  reportJson,
  appliedAt: null,
  appliedBy: null,
});
const operationalAlert = (id: string, createdAt: Date) => ({
  id,
  createdAt,
  eventKey: `event-${id}`,
  category: "CUTOVER",
  severity: "WARNING",
  title: `Alert ${id}`,
  detail: "Recorded alert",
  subjectType: null,
  subjectId: null,
  rolloutCohort: null,
  contractVersion: null,
  supplySourceId: null,
  coverageCellId: null,
  demandId: null,
  waveId: null,
  queue: null,
  lifecycleGeneration: null,
  claimGeneration: null,
  workerId: null,
  attempt: null,
  previousState: null,
  nextState: null,
  reasonCodes: [],
  evidenceRefs: [],
  inputHash: null,
  outputHash: null,
  payload: {},
  retentionClass: "INDEFINITE",
  retentionDeadline: null,
});
const alertWith = (
  id: string,
  createdAt: Date,
  overrides: Partial<ReturnType<typeof operationalAlert>> = {},
) => ({
  ...operationalAlert(id, createdAt),
  ...overrides,
});

const expectContractLink = (href: string | null | undefined): void => {
  const params = new URL(
    href ?? "",
    "https://affiliate-operations.invalid",
  ).searchParams;
  expect(params.get("rolloutCohort")).toBe("CANARY");
  expect(params.get("contractVersion")).toBe("2");
};

describe("affiliate operations projection cutover evidence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("projects bounded immutable report, process, finding, and rollback evidence", async () => {
    const processes = Array.from({ length: 101 }, (_value, index) => ({
      id: `legacy-${index}`,
      kind: "LEGACY",
      processClass: "MAPPING",
      command: "runner --token=secret-value",
      status: "STOPPED",
    }));
    const run = reconciliationRun("rollback-1", {
      kind: "AFFILIATE_CUTOVER_ROLLBACK_DRILL",
      schemaVersion: 1,
      evaluatedAt: "2026-08-29T00:02:00.000Z",
      sessionId: "session-1",
      sessionHash: "session-hash",
      evidenceHash: "evidence-hash",
      evidenceComplete: true,
      counts: {
        processInventory: 101,
        recordsByKind: {
          CANDIDATE: 3,
          MAPPING: 2,
        },
      },
      warnings: [{
        code: "MANY_RECORDS",
        severity: "WARNING",
        detail: "All linked records remain inspectable.",
        recordIds: Array.from(
          { length: 101 },
          (_value, index) => `record-${index}`,
        ),
      }],
      decision: {
        mode: "BINARY_ROLLBACK_ALLOWED",
        reasonCode: "NO_GOVERNED_WRITES",
        detail: "No governed writes were recorded.",
        resolution: "Binary rollback remains allowed.",
      },
      roots: [{
        existingRootId: "existing-root-1",
        sourceIds: ["source-1"],
        recordIds: ["root-record"],
        evidenceRefs: ["root-ref"],
        targetProjections: [],
      }],
      claimActions: [{
        id: "claim-1",
        kind: "MAPPING",
        sourceId: "source-1",
        supplySourceId: "supply-1",
        evidenceRefs: ["claim-ref"],
      }],
      evidence: {
        processInventory: processes,
        governedReceipts: [{
          id: "receipt-1",
          status: "SUCCEEDED",
          createdAt: "2026-08-29T00:03:00.000Z",
          jobId: "job-1",
          payload: { password: "must-not-project" },
        }],
      },
    });
    setupProjection({ affiliateSupplyReconciliationRuns: [run] });

    const projection = await loadAffiliateOperationsProjection(inputFor());
    const row = projection.cutover.rows[0];
    expect(row.reportEvidence.warnings).toHaveLength(1);
    expect(row.reportEvidence.warnings[0]?.recordIds).toHaveLength(101);
    expect(row.reportEvidence.warnings[0]?.recordIds.at(-1)).toBe("record-100");

    expect(row.reportEvidence.kind).toBe("AFFILIATE_CUTOVER_ROLLBACK_DRILL");
    expect(row.reportEvidence.recordsByKind).toEqual({
      CANDIDATE: 3,
      MAPPING: 2,
    });
    expect(row.recordsByKind).toEqual({
      CANDIDATE: 3,
      MAPPING: 2,
    });
    expect(row.reportEvidence.processes).toHaveLength(100);
    expect(row.reportEvidence.evidencePagination.processes).toEqual({
      page: 1,
      pageSize: 100,
      total: 101,
      truncated: true,
    });
    expect(row.reportEvidence.evidencePagination.sourceIds.total).toBe(3);
    expect(row.reportEvidence.evidencePagination.recordIds.total).toBe(104);
    expect(row.reportEvidence.evidencePagination.evidenceRefs.total).toBe(2);
    expect(row.reportEvidence.processes[0]).toEqual(expect.objectContaining({
      id: "legacy-0",
      command: "runner",
      status: "STOPPED",
    }));
    expect(row.reportEvidence.recordEvidence).toEqual([
      expect.objectContaining({
        id: "receipt-1",
        kind: "GOVERNED_RECEIPT",
        status: "SUCCEEDED",
        refs: ["job-1"],
        sourceIds: [],
        recordIds: ["job-1"],
        evidenceRefs: [],
      }),
    ]);
    expect(JSON.stringify(row.reportEvidence)).not.toContain("must-not-project");

    const selected = await loadAffiliateOperationsProjection(inputFor({
      selectedType: "reconciliationRun",
      selectedId: "rollback-1",
      historyPage: 3,
      historyPageSize: 50,
    }));
    expect(selected.selected?.history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "PROCESS LEGACY",
        evidenceRefs: ["legacy-99"],
      }),
    ]));
  });

  it("opens reconciliation and rollback details with evidence history and related records", async () => {
    const run = reconciliationRun("rollback-2", {
      kind: "AFFILIATE_CUTOVER_ROLLBACK_DRILL",
      schemaVersion: 1,
      evaluatedAt: "2026-08-29T00:02:00.000Z",
      sessionId: "session-2",
      sessionHash: "session-hash",
      blockingFindings: [{
        code: "LEGACY_WRITER_RUNNING",
        severity: "BLOCKING",
        detail: "A legacy writer is still running.",
        recordIds: ["legacy-1"],
        resolution: "Stop the legacy writer before cutover.",
      }],
      resolutions: [{
        code: "LEGACY_WRITER_RUNNING",
        severity: "BLOCKING",
        detail: "A legacy writer is still running.",
        recordIds: ["legacy-1"],
        resolution: "Stop the legacy writer before cutover.",
      }],
      roots: [{
        existingRootId: "root-1",
        identityKey: "identity-1",
        canonicalUrl: "https://example.test/events",
        origin: "https://example.test",
        pathKey: "/events",
        derivedStage: "MAPPED",
        action: "REUSE_ROOT",
        sourceIds: ["source-1"],
        recordIds: ["intake-1"],
        evidenceRefs: ["page:1"],
        targetProjections: [],
      }],
      claimActions: [{
        id: "claim-1",
        kind: "MAPPING",
        status: "EXPIRED",
        action: "REVOKE_EXPIRED",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["claim:1"],
      }, {
        id: "gateway-claim-1",
        kind: "GATEWAY_CLAIM",
        status: "EXPIRED",
        action: "REVOKE_EXPIRED",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["gateway-claim:1"],
      }, {
        id: "mapping-job-claim-1",
        kind: "MAPPING_JOB",
        status: "ACTIVE",
        action: "BLOCK_APPLY",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["mapping-job-claim:1"],
      }, {
        id: "intake-run-claim-1",
        kind: "INTAKE_RUN",
        status: "ACTIVE",
        action: "BLOCK_APPLY",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["intake-run-claim:1"],
      }, {
        id: "approval-job-claim-1",
        kind: "APPROVAL_JOB",
        status: "ACTIVE",
        action: "BLOCK_APPLY",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["approval-job-claim:1"],
      }, {
        id: "discovery-run-claim-1",
        kind: "DISCOVERY_RUN",
        status: "ACTIVE",
        action: "BLOCK_APPLY",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["discovery-run-claim:1"],
      }, {
        id: "coverage-job-claim-1",
        kind: "COVERAGE_JOB",
        status: "ACTIVE",
        action: "BLOCK_APPLY",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["coverage-job-claim:1"],
      }, {
        id: "unsupported-claim-1",
        kind: "FACILITY",
        status: "ACTIVE",
        action: "BLOCK_APPLY",
        sourceId: "source-1",
        supplySourceId: "root-1",
        evidenceRefs: ["unsupported-claim:1"],
      }],
      preflight: {
        evaluatedAt: "2026-08-29T00:01:00.000Z",
        isReady: true,
        gatewayVersion: 7,
        reviewedLegacyProcessManifestHash: "manifest-hash",
        reviewedLegacyProcessManifestCount: 2,
        reviewedLegacyProcessManifestArtifactId: "manifest-artifact",
        processInventoryArtifactId: "inventory-artifact",
        processInventoryHash: "inventory-hash",
        processInventoryCount: 4,
        reviewedSystemdUnits: [{
          processId: "legacy-1",
          unitId: "affiliate-intake.service",
        }],
        legacyServiceUnits: [{
          id: "affiliate-intake",
          isEnabled: "disabled",
          isActive: "inactive",
        }],
        counts: { stoppedLegacyProcesses: 2 },
        reviewedAgentNetwork: "affiliate-net",
      },
      evidence: {
        processInventory: [{
          id: "legacy-1",
          kind: "LEGACY",
          processClass: "GOAL",
          command: "legacy-goal",
          status: "STOPPED",
        }],
      },
    });
    setupProjection({ affiliateSupplyReconciliationRuns: [run] });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      selectedType: "reconciliationRun",
      selectedId: "rollback-2",
      historyPageSize: 50,
    }));

    expect(projection.selected).toEqual(expect.objectContaining({
      id: "rollback-2",
      kind: "reconciliationRun",
      historyTotal: expect.any(Number),
    }));
    expect(projection.selected?.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Hashes and contracts",
        fields: expect.arrayContaining([
          expect.objectContaining({ label: "Input hash", value: "input-hash" }),
          expect.objectContaining({ label: "Session ID", value: "session-2" }),
        ]),
      }),
      expect.objectContaining({
        title: "Counts and findings",
        fields: expect.arrayContaining([
          expect.objectContaining({ label: "Blocking findings count", value: "1" }),
          expect.objectContaining({ label: "Resolutions count", value: "1" }),
        ]),
      }),
      expect.objectContaining({
        title: "Cutover session preflight",
        fields: expect.arrayContaining([
          expect.objectContaining({
            label: "Preflight evaluated at",
            value: "2026-08-29T00:01:00.000Z",
          }),
          expect.objectContaining({ label: "Preflight ready", value: "Yes" }),
          expect.objectContaining({ label: "Gateway version", value: "7" }),
          expect.objectContaining({
            label: "Process inventory artifact",
            value: "inventory-artifact",
          }),
          expect.objectContaining({
            label: "Reviewed agent network",
            value: "affiliate-net",
          }),
        ]),
      }),
    ]));
    expect(projection.selected?.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "BLOCKING LEGACY_WRITER_RUNNING" }),
      expect.objectContaining({ kind: "RESOLUTION LEGACY_WRITER_RUNNING" }),

    ]));
    expect(projection.selected?.related).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "CUTOVER_SESSION", id: "session-2" }),
      expect.objectContaining({ kind: "SOURCE", id: "root-1", href: null }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=sources&selectedType=source&selected=root-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "gateway-claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=jobs&selectedType=claim&selected=gateway-claim-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "mapping-job-claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=jobs&selectedType=job&selected=mapping-job-claim-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "intake-run-claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=intake&selectedType=intakeRun&selected=intake-run-claim-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "approval-job-claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=review&selectedType=review&selected=approval-job-claim-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "discovery-run-claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=coverage&selectedType=discoveryRun&selected=discovery-run-claim-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "coverage-job-claim-1",
        href: expect.stringContaining(
          "/admin?tab=affiliateOperations&view=jobs&selectedType=job&selected=coverage-job-claim-1",
        ),
      }),
      expect.objectContaining({
        kind: "CLAIM",
        id: "unsupported-claim-1",
        href: null,
      }),
    ]));
  });

  it("uses complete detail evidence for selected reconciliation related rows", async () => {
    const run = reconciliationRun("detail-evidence", {
      roots: Array.from({ length: 101 }, (_value, index) => ({
        existingRootId: `root-${index}`,
        identityKey: `identity-${index}`,
        sourceIds: [`source-${index}`],
        recordIds: [],
        evidenceRefs: [],
        targetProjections: [],
      })),
    });
    setupProjection({ affiliateSupplyReconciliationRuns: [run] });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      selectedType: "reconciliationRun",
      selectedId: run.id,
    }));

    expect(projection.selected?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "SOURCE", id: "source-100" }),
      ]),
    );
  });

  it("links legacy reconciliation sources to their live roots", async () => {
    const run = reconciliationRun("legacy-related", {
      roots: [{
        identityKey: "identity-live",
        canonicalUrl: "https://example.test/live",
        origin: "https://example.test",
        pathKey: "/live",
        derivedStage: "MAPPED",
        action: "REUSE_ROOT",
        sourceIds: ["legacy-source"],
        recordIds: [],
        evidenceRefs: [],
        targetProjections: [{
          sourceTargetId: "source-target-1",
          candidateId: "candidate-1",
          targetType: "EVENT",
          targetId: "event-1",
          status: "PUBLISHED",
          action: "KEEP",
          evidenceRefs: ["target-evidence"],
        }],
      }],
    });
    const now = new Date("2026-08-29T00:00:00.000Z");
    const liveRoot = {
      id: "live-root",
      liveSourceId: "legacy-source",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      lifecycleGeneration: 1,
      derivedStage: "MAPPED",
      isExcluded: false,
      canonicalUrl: "https://example.test/live",
      pathKey: "/live",
      targetContribution: 0,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: now,
      updatedAt: now,
      createdAt: now,
      intakeId: null,
    };
    const target = {
      id: "source-target-1",
      supplySourceId: "live-root",
      candidateId: "candidate-1",
      targetType: "EVENT",
      targetId: "event-1",
      marketKey: "market",
      sportId: "sport",
      sourceProfile: "EVENT",
      status: "PUBLISHED",
      publishedAt: now,
      lastSuccessfulRefreshAt: now,
      freshnessExpiresAt: new Date("2026-08-30T00:00:00.000Z"),
      rejectedAt: null,
      rejectionReason: null,
      evidenceRefs: [],
      evidenceHash: null,
      metadata: {},
    };
    const candidate = {
      id: "candidate-1",
      createdAt: now,
      updatedAt: now,
      sourceId: "legacy-source",
      supplySourceId: "live-root",
      runId: null,
      mappingId: null,
      listingKind: "EVENT",
      status: "PUBLISHED",
      title: "Published event",
      organizerName: null,
      sportName: "sport",
      city: "city",
      venueName: null,
      startsAt: now,
      endsAt: null,
      officialActionUrl: null,
      sourceUrl: "https://example.test/live",
      description: null,
      rawPayload: {},
      warnings: [],
      publishedEventId: "event-1",
      publishedTeamId: null,
      publishedFacilityId: null,
      publishedOrganizationId: null,
    };
    setupProjection({
      affiliateSupplyReconciliationRuns: [run],
      affiliateSupplySources: [liveRoot],
      affiliateSupplyTargets: [target],
      affiliateImportCandidates: [candidate],
    });
    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "cutover",
      selectedType: "reconciliationRun",
      selectedId: run.id,
    }));
    const source = projection.selected?.related.find(
      (row) => row.kind === "SOURCE" && row.id === "legacy-source",
    );
    expect(source?.href).toContain("selected=live-root");
    expect(projection.selected?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "TARGET",
          id: "source-target-1",
          href: expect.stringContaining("selected=source-target-1"),
        }),
        expect.objectContaining({
          kind: "CANDIDATE",
          id: "candidate-1",
          href: expect.stringContaining("selected=candidate-1"),
        }),
        expect.objectContaining({
          kind: "CANONICAL_TARGET",
          id: "event-1",
          href: expect.stringContaining("selected=source-target-1"),
        }),
      ]),
    );
  });

  it("omits links for planned reconciliation targets outside scoped rows", async () => {
    const run = {
      ...reconciliationRun("planned-related", {
        roots: [{
          identityKey: "identity-planned",
          sourceIds: [],
          recordIds: [],
          evidenceRefs: [],
          targetProjections: [{
            sourceTargetId: "planned-target",
            candidateId: "planned-candidate",
            targetType: "EVENT",
            targetId: "planned-event",
            status: "PLANNED",
            action: "CREATE",
            evidenceRefs: ["planned-evidence"],
          }],
        }],
      }),
      mode: "DRY_RUN",
    };
    setupProjection({ affiliateSupplyReconciliationRuns: [run] });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      selectedType: "reconciliationRun",
      selectedId: run.id,
    }));

    expect(projection.selected?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "TARGET",
          id: "planned-target",
          href: null,
        }),
        expect.objectContaining({
          kind: "CANDIDATE",
          id: "planned-candidate",
          href: null,
        }),
        expect.objectContaining({
          kind: "CANONICAL_TARGET",
          id: "planned-event",
          href: null,
        }),
      ]),
    );
  });
  it("uses primary list pagination for alerts and cutover while keeping history pagination for details", async () => {
    const alerts = [0, 1, 2].map((index) => ({
      id: `alert-${index}`,
      createdAt: new Date(`2026-08-29T00:0${index}:00.000Z`),
      eventKey: `event-${index}`,
      category: "CUTOVER",
      severity: "WARNING",
      title: `Alert ${index}`,
      detail: "Recorded alert",
      subjectType: null,
      subjectId: null,
      rolloutCohort: null,
      contractVersion: null,
      supplySourceId: null,
      coverageCellId: null,
      demandId: null,
      waveId: null,
      queue: null,
      lifecycleGeneration: null,
      claimGeneration: null,
      workerId: null,
      attempt: null,
      previousState: null,
      nextState: null,
      reasonCodes: [],
      evidenceRefs: [],
      inputHash: null,
      outputHash: null,
      payload: {},
      retentionClass: "INDEFINITE",
      retentionDeadline: null,
    }));
    const runs = [0, 1, 2].map((index) => reconciliationRun(`run-${index}`));
    setupProjection({
      affiliateOperationalAlerts: alerts,
      affiliateOperationalAlertDeliveries: [
        {
          id: "delivery-in-flight",
          alertId: "alert-1",
          channel: "webhook",
          status: "IN_FLIGHT",
          attempt: 1,
          createdAt: new Date("2026-08-29T00:05:00.000Z"),
        },
        {
          id: "delivery-terminal",
          alertId: "alert-1",
          channel: "webhook",
          status: "DELIVERED",
          attempt: 1,
          createdAt: new Date("2026-08-29T00:05:00.000Z"),
        },
      ],
      affiliateSupplyReconciliationRuns: runs,
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 2,
      pageSize: 1,
      historyPage: 1,
      historyPageSize: 1,
    }));

    expect(projection.alerts.page).toBe(2);
    expect(projection.alerts.pageSize).toBe(1);
    expect(projection.alerts.rows.map((row) => row.id)).toEqual(["alert-1"]);
    expect(projection.alerts.rows[0]?.latestDeliveryStatus).toBe("DELIVERED");
    expect(projection.cutover.page).toBe(2);
    expect(projection.cutover.pageSize).toBe(1);
    expect(projection.cutover.rows.map((row) => row.id)).toEqual(["run-1"]);
  });
  it("pages durable alert history in the database and retains delivery state", async () => {
    const alerts = Array.from({ length: 10_001 }, (_value, index) => {
      const createdAt = new Date("2027-01-01T00:00:00.000Z");
      createdAt.setSeconds(createdAt.getSeconds() - index);
      return operationalAlert(
        `alert-${String(10_000 - index).padStart(5, "0")}`,
        createdAt,
      );
    });
    const pageAlert = alerts.at(-1);
    const selectedAlert = alerts[0];
    if (!pageAlert || !selectedAlert) throw new Error("Missing alert fixture");
    const delegates = setupProjection({
      affiliateOperationalAlerts: alerts,
      affiliateOperationalAlertDeliveries: [
        {
          id: "delivery-page",
          alertId: pageAlert.id,
          channel: "webhook",
          status: "DELIVERED",
          attempt: 1,
          createdAt: pageAlert.createdAt,
        },
        {
          id: "delivery-selected",
          alertId: selectedAlert.id,
          channel: "webhook",
          status: "FAILED",
          attempt: 1,
          createdAt: selectedAlert.createdAt,
        },
      ],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    const deliveryDelegate = delegates.get(
      "affiliateOperationalAlertDeliveries",
    );
    if (!deliveryDelegate) throw new Error("Missing delivery delegate");
    alertDelegate.count = jest.fn(async () => alerts.length);
    alertDelegate.findMany.mockImplementation(async (args: {
      skip?: number;
      take?: number;
      where?: unknown;
    }) => {
      const serializedWhere = JSON.stringify(args.where ?? {});
      const selected = alerts.find((alert) =>
        serializedWhere.includes(`"id":"${alert.id}"`),
      );
      if (selected) return [selected];
      const start = args.skip ?? 0;
      return alerts.slice(start, start + (args.take ?? alerts.length));
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 999,
      pageSize: 25,
      selectedType: "alert",
      selectedId: selectedAlert.id,
    }));

    expect(alertDelegate.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.any(Object) }),
    );
    expect(alertDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10_000,
        take: 25,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(deliveryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ["alertId"],
        take: 1,
      }),
    );
    expect(deliveryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
      }),
    );
    expect(projection.alerts.total).toBe(10_001);
    expect(projection.alerts.page).toBe(401);
    expect(projection.alerts.rows).toHaveLength(1);
    expect(projection.selected).toEqual(
      expect.objectContaining({
        historyPage: 1,
        historyPageSize: 25,
        historyTotal: 1,
        historyTotalPages: 1,
      }),
    );
    expect(projection.alerts.rows[0]?.id).toBe("alert-00000");
    expect(projection.alerts.rows[0]).toEqual(
      expect.objectContaining({
        deliveryCount: 1,
        deliveredCount: 1,
        latestDeliveryStatus: "DELIVERED",
      }),
    );
    expect(projection.selected?.id).toBe(selectedAlert.id);
    expect(projection.selected?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Delivery",
          fields: [
            expect.objectContaining({ value: "FAILED" }),
          ],
        }),
      ]),
    );
    expect(projection.overview.exceptionTotal).toBe(10_001);
  });

  it("pages selected alert delivery history independently from alert rows", async () => {
    const alert = operationalAlert(
      "delivery-history-alert",
      new Date("2027-01-01T00:00:00.000Z"),
    );
    const deliveries = [
      {
        id: "delivery-3",
        alertId: alert.id,
        channel: "webhook",
        status: "FAILED",
        attempt: 3,
        createdAt: new Date("2027-01-01T00:03:00.000Z"),
      },
      {
        id: "delivery-2",
        alertId: alert.id,
        channel: "webhook",
        status: "DELIVERED",
        attempt: 2,
        createdAt: new Date("2027-01-01T00:02:00.000Z"),
      },
      {
        id: "delivery-1",
        alertId: alert.id,
        channel: "webhook",
        status: "FAILED",
        attempt: 1,
        createdAt: new Date("2027-01-01T00:01:00.000Z"),
      },
    ];
    const delegates = setupProjection({
      affiliateOperationalAlerts: [alert],
      affiliateOperationalAlertDeliveries: deliveries,
    });
    const deliveryDelegate = delegates.get(
      "affiliateOperationalAlertDeliveries",
    );
    if (!deliveryDelegate) throw new Error("Missing delivery delegate");
    deliveryDelegate.count = jest.fn(async () => deliveries.length);
    deliveryDelegate.findMany.mockImplementation(async (args: {
      distinct?: unknown;
      skip?: number;
      take?: number;
    }) =>
      args.distinct
        ? [deliveries[0]]
        : deliveries.slice(
            args.skip ?? 0,
            (args.skip ?? 0) + (args.take ?? deliveries.length),
          ),
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: alert.id,
      historyPage: 2,
      historyPageSize: 1,
    }));

    expect(projection.selected).toEqual(
      expect.objectContaining({
        historyPage: 2,
        historyPageSize: 1,
        historyTotal: 3,
        historyTotalPages: 3,
      }),
    );
    expect(projection.selected?.history[0]).toEqual(
      expect.objectContaining({
        id: "delivery-2",
        status: "DELIVERED",
      }),
    );
    expect(deliveryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1 }),
    );
  });
  it("pages alert delivery history by channel and retry attempt", async () => {
    const alert = operationalAlert(
      "delivery-attempt-alert",
      new Date("2027-01-01T00:00:00.000Z"),
    );
    const deliveries = [
      {
        id: "webhook-attempt-1-in-flight",
        alertId: alert.id,
        channel: "webhook",
        status: "IN_FLIGHT",
        attempt: 1,
        createdAt: new Date("2027-01-01T00:01:00.000Z"),
      },
      {
        id: "webhook-attempt-1-failed",
        alertId: alert.id,
        channel: "webhook",
        status: "FAILED",
        attempt: 1,
        createdAt: new Date("2027-01-01T00:02:00.000Z"),
      },
      {
        id: "email-attempt-1-delivered",
        alertId: alert.id,
        channel: "email",
        status: "DELIVERED",
        attempt: 1,
        createdAt: new Date("2027-01-01T00:03:00.000Z"),
      },
      {
        id: "webhook-attempt-2-delivered",
        alertId: alert.id,
        channel: "webhook",
        status: "DELIVERED",
        attempt: 2,
        createdAt: new Date("2027-01-01T00:04:00.000Z"),
      },
    ];
    const delegates = setupProjection({
      affiliateOperationalAlerts: [alert],
      affiliateOperationalAlertDeliveries: deliveries,
    });
    const deliveryDelegate = delegates.get(
      "affiliateOperationalAlertDeliveries",
    );
    if (!deliveryDelegate) throw new Error("Missing delivery delegate");
    const attemptGroups = [
      {
        alertId: alert.id,
        channel: "webhook",
        attempt: 1,
        status: "IN_FLIGHT",
        _max: { createdAt: deliveries[0]?.createdAt ?? null },
      },
      {
        alertId: alert.id,
        channel: "webhook",
        attempt: 1,
        status: "FAILED",
        _max: { createdAt: deliveries[1]?.createdAt ?? null },
      },
      {
        alertId: alert.id,
        channel: "email",
        attempt: 1,
        status: "DELIVERED",
        _max: { createdAt: deliveries[2]?.createdAt ?? null },
      },
      {
        alertId: alert.id,
        channel: "webhook",
        attempt: 2,
        status: "DELIVERED",
        _max: { createdAt: deliveries[3]?.createdAt ?? null },
      },
    ];
    deliveryDelegate.groupBy = jest.fn(async () => attemptGroups);
    deliveryDelegate.findMany.mockImplementation(async (args: {
      distinct?: unknown;
      where?: { OR?: Array<Record<string, unknown>> };
    }) => {
      if (args.distinct) return [deliveries[3]];
      const clauses = args.where?.OR ?? [];
      return deliveries.filter((delivery) =>
        clauses.some(
          (clause) =>
            clause.alertId === delivery.alertId &&
            clause.channel === delivery.channel &&
            clause.attempt === delivery.attempt,
        ),
      );
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: alert.id,
      historyPage: 2,
      historyPageSize: 1,
    }));

    expect(deliveryDelegate.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["alertId", "channel", "attempt", "status"],
      }),
    );
    expect(projection.selected).toEqual(
      expect.objectContaining({
        historyPage: 2,
        historyPageSize: 1,
        historyTotal: 3,
        historyTotalPages: 3,
      }),
    );
    expect(projection.alerts.rows[0]).toEqual(
      expect.objectContaining({
        deliveryCount: 3,
        deliveredCount: 2,
        latestDeliveryStatus: "DELIVERED",
      }),
    );
    expect(projection.selected?.history[0]).toEqual(
      expect.objectContaining({
        id: "email-attempt-1-delivered",
        status: "DELIVERED",
      }),
    );
  });
  it("keeps large retry histories database-paged", async () => {
    const alert = operationalAlert(
      "large-delivery-history-alert",
      new Date("2027-01-01T00:00:00.000Z"),
    );
    const latestDelivery = {
      id: "delivery-latest",
      createdAt: new Date("2027-01-01T00:02:00.000Z"),
      alertId: alert.id,
      channel: "webhook",
      status: "DELIVERED",
      attempt: 10_001,
      deliveredAt: new Date("2027-01-01T00:02:00.000Z"),
      responseCode: 200,
      responseBody: null,
      errorMessage: null,
    };
    const pageDelivery = {
      ...latestDelivery,
      id: "delivery-page-10001",
      status: "FAILED",
      attempt: 10_001,
    };
    const rawQuery = jest
      .fn()
      .mockResolvedValueOnce([
        {
          alertId: alert.id,
          deliveryCount: 10_001,
          deliveredCount: 10_000,
          latestDeliveryStatus: "DELIVERED",
        },
      ])
      .mockResolvedValueOnce([{ total: 10_001 }])
      .mockResolvedValueOnce([pageDelivery]);
    setupProjection(
      {
        affiliateOperationalAlerts: [alert],
        affiliateOperationalAlertDeliveries: [latestDelivery],
      },
      { queryRaw: rawQuery },
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: alert.id,
      historyPage: 999,
      historyPageSize: 25,
    }));

    expect(rawQuery).toHaveBeenCalledTimes(3);
    expect(projection.alerts.rows[0]).toEqual(
      expect.objectContaining({
        deliveryCount: 10_001,
        deliveredCount: 10_000,
        latestDeliveryStatus: "DELIVERED",
      }),
    );
    expect(projection.selected).toEqual(
      expect.objectContaining({
        historyPage: 401,
        historyPageSize: 25,
        historyTotal: 10_001,
        historyTotalPages: 401,
      }),
    );
    expect(projection.selected?.history).toEqual([
      expect.objectContaining({
        id: pageDelivery.id,
        status: pageDelivery.status,
      }),
    ]);
  });
  it("counts recovered alerts outside the bounded display rows", async () => {
    const alerts = Array.from({ length: 100 }, (_value, index) => {
      const createdAt = new Date("2027-01-01T00:00:00.000Z");
      createdAt.setSeconds(createdAt.getSeconds() - index);
      const alert = operationalAlert(
        `recovery-alert-${String(99 - index).padStart(2, "0")}`,
        createdAt,
      );
      return index >= 25
        ? { ...alert, payload: { recovered: true } }
        : alert;
    });
    const delegates = setupProjection({
      affiliateOperationalAlerts: alerts,
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) =>
      JSON.stringify(args?.where ?? {}).includes('"NOT"')
        ? 25
        : alerts.length,
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 4,
      pageSize: 25,
    }));

    expect(projection.alerts.total).toBe(100);
    expect(projection.alerts.rows).toHaveLength(25);
    expect(projection.alerts.rows.every((row) => row.recovered)).toBe(true);
    expect(projection.overview.exceptions).toHaveLength(25);
    expect(projection.overview.exceptionTotal).toBe(25);
    expect(
      alertDelegate.findMany.mock.calls.some(([args]) => {
        const serialized = JSON.stringify(args?.where ?? {});
        return serialized.includes('"NOT"');
      }),
    ).toBe(true);
  });
  it("keeps nested false recovery markers in the unrecovered alert rail", async () => {
    const nestedFalse = alertWith(
      "nested-false-recovery",
      new Date("2027-01-01T00:00:00.000Z"),
      {
        payload: {
          operationalAlertRecovered: {
            recovered: false,
          },
        },
      },
    );
    const nestedTrue = alertWith(
      "nested-true-recovery",
      new Date("2026-12-31T00:00:00.000Z"),
      {
        payload: {
          operationalAlertRecovered: {
            recovered: true,
          },
        },
      },
    );
    const delegates = setupProjection({
      affiliateOperationalAlerts: [nestedFalse, nestedTrue],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) =>
      JSON.stringify(args?.where ?? {}).includes('"NOT"') ? 1 : 2,
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 1,
      pageSize: 25,
    }));

    expect(projection.alerts.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: nestedFalse.id,
          recovered: false,
          active: true,
        }),
        expect.objectContaining({
          id: nestedTrue.id,
          recovered: true,
          active: false,
        }),
      ]),
    );
    expect(projection.overview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `alert:${nestedFalse.id}`,
          kind: "ALERT",
        }),
      ]),
    );
    expect(projection.overview.exceptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `alert:${nestedTrue.id}` }),
      ]),
    );
    expect(
      alertDelegate.findMany.mock.calls.some(([args]) =>
        JSON.stringify(args?.where ?? {}).includes('"NOT"'),
      ),
    ).toBe(true);
  });
  it("renders the claim generation on claim event history", async () => {
    const createdAt = new Date("2026-08-29T00:00:00.000Z");
    const root = {
      id: "root-claim",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "MAPPED",
      isExcluded: false,
      canonicalUrl: "https://example.test/claim",
      pathKey: "/claim",
      targetContribution: 0,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: null,
      updatedAt: createdAt,
      createdAt,
      intakeId: null,
      liveSourceId: null,
    };
    const job = {
      id: "job-claim",
      createdAt,
      updatedAt: createdAt,
      queue: "affiliate",
      lane: "mapping",
      role: "MAPPING_PRODUCER",
      subjectType: "AFFILIATE_SOURCE",
      subjectId: "source-claim",
      subjectJson: { rolloutCohort: "DEFAULT", contractVersion: 1 },
      evidenceManifestJson: {},
      supplySourceId: root.id,
      expectedLifecycleGeneration: null,
      status: "CLAIMED",
      priority: 1,
      nextAttemptAt: null,
      claimGeneration: 7,
      activeClaimId: "claim-1",
      parentClaimId: null,
      invocationFailureCount: 0,
      lastInvocationFailedAt: null,
      pipelineBlockedAt: null,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      terminalReceiptId: null,
      finishedAt: null,
      eventSequence: 101,
    };
    const claim = {
      id: "claim-1",
      createdAt,
      updatedAt: createdAt,
      jobId: job.id,
      parentClaimId: null,
      claimGeneration: 7,
      lifecycleGeneration: null,
      queue: job.queue,
      lane: job.lane,
      role: job.role,
      workerId: "worker-claim",
      invocationId: "invocation-claim",
      claimRequestHash: "claim-request",
      workspaceId: null,
      workspaceMode: null,
      status: "ACTIVE",
      claimedAt: createdAt,
      lastHeartbeatAt: createdAt,
      leaseExpiresAt: new Date("2026-08-29T01:00:00.000Z"),
      hardDeadlineAt: new Date("2026-08-29T02:00:00.000Z"),
      endedAt: null,
      terminalReceiptId: null,
      safeFailureCode: null,
      safeFailureSummary: null,
      diagnosticRetainUntil: null,
    };
    const event = {
      id: "event-claim",
      createdAt,
      eventKey: "event-key-claim",
      jobId: job.id,
      claimId: claim.id,
      receiptId: null,
      sequence: 101,
      eventType: "CLAIM_ADMITTED",
      actorKind: "AGENT",
      actorId: "worker-claim",
      role: job.role,
      requestHash: "claim-request",
      inputHash: "event-input",
      outputHash: "event-output",
      reasonCodes: [],
      payload: {},
      retentionClass: "INDEFINITE",
      retentionDeadline: null,
    };
    setupProjection({
      affiliateSupplySources: [root],
      affiliateAgentGatewayJobs: [job],
      affiliateAgentGatewayClaims: [claim],
      affiliateAgentGatewayEvents: [event],
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "jobs",
      selectedType: "claim",
      selectedId: claim.id,
    }));

    expect(projection.selected?.history).toEqual([
      expect.objectContaining({
        id: event.id,
        claimGeneration: claim.claimGeneration,
      }),
    ]);
  });

  it("counts reconciliation runs in the database and fetches only the selected page", async () => {
    const runs = Array.from({ length: 10_001 }, (_value, index) =>
      reconciliationRun(`run-${String(index).padStart(5, "0")}`),
    );
    const delegates = setupProjection({
      affiliateSupplyReconciliationRuns: runs,
    });
    const reconciliationDelegate = delegates.get("affiliateSupplyReconciliationRuns");
    if (!reconciliationDelegate) throw new Error("Missing reconciliation delegate");
    reconciliationDelegate.count = jest.fn(async () => runs.length);
    reconciliationDelegate.findMany.mockImplementation(async (args: {
      where?: { id?: string };
      skip?: number;
      take?: number;
    }) => {
      if (args.where?.id) {
        return runs.filter((run) => run.id === args.where?.id);
      }
      const start = args.skip ?? 0;
      return runs.slice(start, start + (args.take ?? runs.length));
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      page: 999,
      pageSize: 25,
      selectedType: "reconciliationRun",
      selectedId: "run-10000",
    }));

    expect(reconciliationDelegate.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ rolloutCohort: "DEFAULT" }),
    }));
    expect(reconciliationDelegate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10_000,
      take: 25,
    }));
    expect(projection.cutover.total).toBe(10_001);
    expect(projection.cutover.page).toBe(401);
    expect(projection.cutover.rows).toHaveLength(1);
    expect(projection.cutover.rows[0]?.id).toBe("run-10000");
    expect(projection.selected?.id).toBe("run-10000");
  });

  it("deduplicates delivery rows per channel attempt and derives recovery state", async () => {
    const alert = {
      id: "alert-recovered",
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      eventKey: "source-refresh-failed:source-recovered:run-1",
      category: "AUTOMATIC_REFRESH_FAILURE",
      severity: "WARNING",
      title: "Source refresh failed",
      detail: "The source did not respond.",
      subjectType: null,
      subjectId: null,
      rolloutCohort: null,
      contractVersion: null,
      supplySourceId: null,
      coverageCellId: null,
      demandId: null,
      waveId: null,
      queue: null,
      lifecycleGeneration: null,
      claimGeneration: null,
      workerId: null,
      attempt: null,
      previousState: null,
      nextState: null,
      reasonCodes: [],
      evidenceRefs: [],
      inputHash: null,
      outputHash: null,
      payload: {
        operationalAlertRecovered: {
          recovered: true,
          detail: "The source refresh completed successfully.",
          evidenceRefs: ["refresh-run-1"],
        },
      },
      retentionClass: "INDEFINITE",
      retentionDeadline: null,
    };
    setupProjection({
      affiliateOperationalAlerts: [alert],
      affiliateOperationalAlertDeliveries: [
        {
          id: "delivery-in-flight",
          alertId: alert.id,
          channel: "webhook",
          status: "IN_FLIGHT",
          attempt: 1,
          createdAt: new Date("2026-08-29T00:01:00.000Z"),
        },
        {
          id: "delivery-terminal",
          alertId: alert.id,
          channel: "webhook",
          status: "FAILED",
          attempt: 1,
          createdAt: new Date("2026-08-29T00:02:00.000Z"),
          errorMessage: "HTTP 503",
        },
      ],
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: alert.id,
    }));

    expect(projection.alerts.rows[0]).toEqual(expect.objectContaining({
      active: false,
      recovered: true,
      recoveryDetail: "The source refresh completed successfully.",
      recoveryEvidenceRefs: ["refresh-run-1"],
      deliveryCount: 1,
      deliveredCount: 0,
      latestDeliveryStatus: "FAILED",
    }));
    expect(projection.selected?.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Recovery",
        fields: expect.arrayContaining([
          expect.objectContaining({
            label: "Recovery detail",
            value: "The source refresh completed successfully.",
          }),
        ]),
      }),
      expect.objectContaining({
        title: "Delivery",
        fields: [
          expect.objectContaining({
            label: "webhook attempt 1",
            value: "FAILED: HTTP 503",
          }),
        ],
      }),
    ]));
    expect(projection.selected?.history).toHaveLength(1);
  });
  it("keeps invocation failures active through heartbeats until later job success", async () => {
    const jobId = "job-invocation";
    const alert = {
      id: "alert-invocation-failure",
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      eventKey: "affiliate-agent-invocation-failed:receipt-failure",
      category: "AGENT_INVOCATION_FAILURE",
      severity: "WARNING",
      title: "Affiliate agent invocation failed",
      detail: "The invocation output was malformed.",
      subjectType: "AGENT_JOB",
      subjectId: jobId,
      rolloutCohort: "DEFAULT",
      contractVersion: 1,
      supplySourceId: "root-invocation",
      coverageCellId: null,
      demandId: null,
      waveId: null,
      queue: "affiliate",
      lifecycleGeneration: null,
      claimGeneration: 1,
      workerId: "worker-1",
      attempt: 1,
      previousState: "CLAIMED",
      nextState: "RETRY_WAIT",
      reasonCodes: ["MALFORMED_OUTPUT"],
      evidenceRefs: [],
      inputHash: null,
      outputHash: null,
      payload: {
        jobId,
        claimId: "claim-1",
        invocationId: "invocation-1",
      },
      retentionClass: "INDEFINITE",
      retentionDeadline: null,
    };
    const job = {
      id: jobId,
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:03:00.000Z"),
      queue: "affiliate",
      lane: "mapping",
      role: "MAPPING_PRODUCER",
      subjectType: "AFFILIATE_SOURCE",
      subjectId: "source-1",
      subjectJson: { rolloutCohort: "DEFAULT", contractVersion: 1 },
      evidenceManifestJson: {},
      supplySourceId: "root-invocation",
      expectedLifecycleGeneration: null,
      status: "RETRY_WAIT",
      priority: 1,
      nextAttemptAt: new Date("2026-08-29T00:05:00.000Z"),
      claimGeneration: 1,
      activeClaimId: null,
      parentClaimId: null,
      invocationFailureCount: 1,
      lastInvocationFailedAt: new Date("2026-08-29T00:00:00.000Z"),
      pipelineBlockedAt: null,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      terminalReceiptId: null,
      finishedAt: null,
      eventSequence: 1,
    };
    const worker = {
      id: "worker-health-1",
      workerId: "worker-1",
      role: "MAPPING_PRODUCER",
      status: "HEALTHY",
      heartbeatAt: new Date("2026-08-29T00:03:00.000Z"),
      leaseExpiresAt: new Date("2026-08-29T00:10:00.000Z"),
      metadata: {},
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:03:00.000Z"),
    };
    const heartbeatReceipt = {
      id: "heartbeat-receipt",
      createdAt: new Date("2026-08-29T00:02:00.000Z"),
      updatedAt: new Date("2026-08-29T00:02:00.000Z"),
      claimId: "claim-1",
      jobId,
      claimGeneration: 1,
      idempotencyKey: "heartbeat-1",
      operationKind: "HEARTBEAT",
      commandName: null,
      requestHash: "heartbeat-hash",
      status: "SUCCEEDED",
      responseHash: null,
      safeErrorCode: null,
      externalOperationKey: null,
      startedAt: new Date("2026-08-29T00:02:00.000Z"),
      completedAt: new Date("2026-08-29T00:02:00.000Z"),
      reconcileAfter: null,
      retentionClass: "INDEFINITE",
      retentionDeadline: null,
    };
    const heartbeatEvent = {
      id: "heartbeat-event",
      createdAt: new Date("2026-08-29T00:02:00.000Z"),
      eventKey: "heartbeat-event-key",
      jobId,
      claimId: "claim-1",
      receiptId: heartbeatReceipt.id,
      sequence: 2,
      eventType: "CLAIM_HEARTBEAT_ACCEPTED",
      actorKind: "AGENT_INVOCATION",
      actorId: "invocation-1",
      role: "MAPPING_PRODUCER",
      requestHash: "heartbeat-hash",
      inputHash: null,
      outputHash: null,
      reasonCodes: [],
      payload: {},
      retentionClass: "INDEFINITE",
      retentionDeadline: null,
    };
    const root = {
      id: "root-invocation",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/invocation",
      pathKey: "/invocation",
      targetContribution: 0,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: null,
      updatedAt: new Date("2026-08-29T00:03:00.000Z"),
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      intakeId: null,
      liveSourceId: null,
    };
    const projectionRows = {
      affiliateSupplySources: [root],
      affiliateOperationalAlerts: [alert],
      affiliateAgentGatewayJobs: [job],
      affiliateAgentGatewayOperationReceipts: [heartbeatReceipt],
      affiliateAgentGatewayEvents: [heartbeatEvent],
      affiliateAgentWorkerHealth: [worker],
    };

    setupProjection(projectionRows);
    const heartbeatProjection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
    }));
    expect(heartbeatProjection.alerts.rows[0]).toEqual(expect.objectContaining({
      active: true,
      recovered: false,
    }));

    const successReceipt = {
      ...heartbeatReceipt,
      id: "success-receipt",
      idempotencyKey: "submit-result-1",
      operationKind: "SUBMIT_RESULT",
      createdAt: new Date("2026-08-29T00:04:00.000Z"),
      updatedAt: new Date("2026-08-29T00:04:00.000Z"),
      startedAt: new Date("2026-08-29T00:04:00.000Z"),
      completedAt: new Date("2026-08-29T00:04:00.000Z"),
    };
    const successEvent = {
      ...heartbeatEvent,
      id: "success-event",
      eventKey: "success-event-key",
      receiptId: successReceipt.id,
      sequence: 3,
      eventType: "CLAIM_TERMINAL_RESULT_ACCEPTED",
      createdAt: new Date("2026-08-29T00:04:00.000Z"),
    };
    setupProjection({
      ...projectionRows,
      affiliateAgentGatewayOperationReceipts: [
        heartbeatReceipt,
        successReceipt,
      ],
      affiliateAgentGatewayEvents: [heartbeatEvent, successEvent],
    });
    const successProjection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: alert.id,
    }));
    expect(successProjection.alerts.rows[0]).toEqual(expect.objectContaining({
      active: false,
      recovered: true,
      recoveryDetail: "A later successful gateway receipt or event was recorded for this job.",
      recoveryEvidenceRefs: ["success-receipt", "success-event"],
    }));
    expect(successProjection.selected?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "GATEWAY_JOB",
          id: jobId,
          href: expect.stringContaining(`selected=${jobId}`),
        }),
        expect.objectContaining({
          kind: "GATEWAY_RECEIPT",
          id: "success-receipt",
          href: expect.stringContaining("selected=success-receipt"),
        }),
        expect.objectContaining({
          kind: "GATEWAY_EVENT",
          id: "success-event",
          href: expect.stringContaining("selected=success-event"),
        }),
      ]),
    );
  });


  it("preserves non-default cohort and contract version in every admin deep link", async () => {
    const run = {
      ...reconciliationRun("canary-run"),
      rolloutCohort: "CANARY",
      supplyContractVersion: 2,
    };
    const delegates = setupProjection({
      affiliateSupplyReconciliationRuns: [run],
    });
    const contractDelegate = delegates.get("affiliateSupplyContractManifests");
    if (!contractDelegate?.findFirst) throw new Error("Missing contract delegate");
    contractDelegate.findFirst.mockResolvedValue({
      id: "canary-contract",
      rolloutCohort: "CANARY",
      version: 2,
      status: "ACTIVE",
      contractHash: manifest.hash,
      contractJson: manifest.supplyContract,
      componentHashes: [],
      activatedAt: new Date("2026-08-29T00:00:00.000Z"),
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      contract: { rolloutCohort: "CANARY", contractVersion: 2 },
      selectedType: "reconciliationRun",
      selectedId: "canary-run",
    }));
    expectContractLink(projection.cutover.rows[0]?.href);
    expectContractLink(projection.selected?.history[0]?.href);
  });

  it("loads both ORGANIZATION and ORG target aliases before projecting public records", async () => {
    const root = {
      id: "root-1",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test",
      pathKey: "/",
      targetContribution: 1,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: null,
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      intakeId: null,
      liveSourceId: null,
    };
    const targets = ["org-1", "org-2"].map((targetId, index) => ({
      id: `target-${index}`,
      supplySourceId: "root-1",
      candidateId: null,
      targetType: index === 0 ? "ORGANIZATION" : "ORG",
      targetId,
      marketKey: null,
      sportId: null,
      sourceProfile: "EVENT",
      status: "PUBLISHED",
      publishedAt: new Date("2026-08-29T00:00:00.000Z"),
      lastSuccessfulRefreshAt: new Date("2026-08-29T00:00:00.000Z"),
      freshnessExpiresAt: new Date("2026-08-30T00:00:00.000Z"),
      rejectedAt: null,
      rejectionReason: null,
      evidenceRefs: [],
      evidenceHash: null,
      metadata: null,
    }));
    const organizations = ["org-1", "org-2"].map((id) => ({
      id,
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      name: `Organization ${id}`,
      location: "Portland",
      website: "https://example.test",
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      originType: "AFFILIATE",
      ownershipStatus: "UNCLAIMED",
      publicSlug: id,
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
    }));
    const delegates = setupProjection({
      affiliateSupplySources: [root],
      affiliateSupplyTargets: targets,
      organizations,
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "coverage",
    }));
    const organizationQuery = delegates.get("organizations")?.findMany;

    expect(organizationQuery).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: expect.arrayContaining(["org-1", "org-2"]) } },
    }));
    expect(projection.coverage.targets.map((target) => target.publicTargetState)).toEqual([
      "VISIBLE",
      "VISIBLE",
    ]);
    const detailProjection = await loadAffiliateOperationsProjection(inputFor({
      view: "coverage",
      selectedType: "target",
      selectedId: "target-0",
    }));
    expect(detailProjection.selected?.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Publication and freshness",
        fields: expect.arrayContaining([
          expect.objectContaining({ label: "Public target state", value: "VISIBLE" }),
          expect.objectContaining({ label: "Public target name", value: "Organization org-1" }),
        ]),
      }),
    ]));
  });
  it("resolves typed source and agent-job alerts through authoritative root lineage", async () => {
    const now = new Date("2026-08-29T00:05:00.000Z");
    const rootResolved = {
      id: "root-resolved",
      liveSourceId: "legacy-source-resolved",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/resolved",
      pathKey: "/resolved",
      targetContribution: 0,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: now,
      updatedAt: now,
      createdAt: now,
      lifecycleGeneration: 2,
      intakeId: null,
    };
    const rootCurrent = {
      ...rootResolved,
      id: "root-current",
      liveSourceId: "legacy-source-current",
      invariantViolations: ["MISSING_MAPPING"],
    };
    const sourceAlert = alertWith("typed-source-alert", now, {
      category: "SUPPLY_SOURCE_INVARIANT",
      subjectType: "AFFILIATE_SUPPLY_SOURCE",
      subjectId: rootResolved.liveSourceId,
      lifecycleGeneration: 1,
      reasonCodes: ["MISSING_MAPPING"],
    });
    const currentInvariantAlert = alertWith("current-invariant-alert", now, {
      category: "SUPPLY_SOURCE_INVARIANT",
      subjectType: "AFFILIATE_SUPPLY_SOURCE",
      subjectId: rootCurrent.liveSourceId,
      lifecycleGeneration: 2,
      reasonCodes: ["MISSING_MAPPING"],
    });
    const jobAlert = alertWith("agent-job-alert", now, {
      category: "AGENT_TIMEOUT",
      subjectType: "AGENT_JOB",
      subjectId: "job-authoritative",
    });
    const job = {
      id: "job-authoritative",
      supplySourceId: rootResolved.id,
      status: "COMPLETED",
      subjectType: "MAPPING_PRODUCER",
      subjectId: rootResolved.liveSourceId,
      subjectJson: { rolloutCohort: "DEFAULT", contractVersion: 1 },
      queue: "affiliate",
      lane: "mapping",
      role: "MAPPING_PRODUCER",
      updatedAt: now,
      createdAt: now,
      claimGeneration: 1,
    };
    setupProjection({
      affiliateSupplySources: [rootResolved, rootCurrent],
      affiliateOperationalAlerts: [
        sourceAlert,
        currentInvariantAlert,
        jobAlert,
      ],
      affiliateAgentGatewayJobs: [job],
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      pageSize: 25,
    }));
    const rowsById = new Map(
      projection.alerts.rows.map((row) => [row.id, row]),
    );
    expect(rowsById.get(sourceAlert.id)).toEqual(expect.objectContaining({
      recovered: true,
      active: false,
    }));
    expect(rowsById.get(currentInvariantAlert.id)).toEqual(expect.objectContaining({
      recovered: false,
      active: true,
    }));
    expect(rowsById.get(jobAlert.id)).toEqual(expect.objectContaining({
      recovered: true,
      active: false,
    }));
  });
  it("pages only alerts whose typed job lineage belongs to the selected cohort", async () => {
    const now = new Date("2026-08-29T00:05:00.000Z");
    const root = {
      id: "root-in-scope",
      liveSourceId: null,
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/in-scope",
      pathKey: "/in-scope",
      targetContribution: 0,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: now,
      updatedAt: now,
      createdAt: now,
      lifecycleGeneration: 1,
      intakeId: null,
    };
    const job = (id: string, supplySourceId: string) => ({
      id,
      supplySourceId,
      status: "FAILED",
      subjectType: "MAPPING_PRODUCER",
      subjectId: supplySourceId,
      subjectJson: { rolloutCohort: "DEFAULT", contractVersion: 1 },
      queue: "affiliate",
      lane: "mapping",
      role: "MAPPING_PRODUCER",
      updatedAt: now,
      createdAt: now,
      claimGeneration: 1,
    });
    const inScopeAlert = alertWith("in-scope-alert", now, {
      subjectType: "AGENT_JOB",
      subjectId: "job-in-scope",
    });
    const crossCohortAlert = alertWith("cross-cohort-alert", now, {
      subjectType: "AGENT_JOB",
      subjectId: "job-out-of-scope",
    });
    const delegates = setupProjection({
      affiliateSupplySources: [root],
      affiliateAgentGatewayJobs: [
        job("job-in-scope", root.id),
        job("job-out-of-scope", "root-out-of-scope"),
      ],
      affiliateOperationalAlerts: [inScopeAlert, crossCohortAlert],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) =>
      JSON.stringify(args?.where ?? {}).includes('"job-in-scope"') ? 1 : 0,
    );
    alertDelegate.findMany.mockImplementation(async (args: {
      where?: unknown;
      take?: number;
      skip?: number;
    }) => {
      const serializedWhere = JSON.stringify(args.where ?? {});
      if (serializedWhere.includes('"id":"in-scope-alert"')) {
        return [inScopeAlert];
      }
      if (serializedWhere.includes('"job-in-scope"')) return [inScopeAlert];
      return [];
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 1,
      pageSize: 25,
    }));

    expect(projection.alerts.rows.map((row) => row.id)).toEqual([
      inScopeAlert.id,
    ]);
    expect(projection.alerts.total).toBe(1);

    expect(
      alertDelegate.findMany.mock.calls.some(
        ([args]) =>
          args &&
          typeof args === "object" &&
          JSON.stringify(args.where ?? {}).includes('"job-in-scope"') &&
          !JSON.stringify(args.where ?? {}).includes('"job-out-of-scope"'),
      ),
    ).toBe(true);
  });
  it("retains SQL-scoped rootless agent-job alerts for coverage cells", async () => {
    const now = new Date("2026-08-29T00:05:00.000Z");
    const coverageCell = {
      id: "coverage-cell-rootless",
      cityId: "Austin",
      marketKey: "US-Austin",
      cohort: "DEFAULT",
      cohortPriority: 1,
      sportId: "soccer",
      sportName: "Soccer",
      profileKey: "EVENT",
      coverageStatus: "OPEN",
      searchStatus: "READY",
      populationWeight: 1,
      gapSeverity: "LOW",
      profileWeight: 1,
      stalenessWeight: 1,
      priorityScore: 1,
      directPolicyKeyCount: 1,
      approvedSourceCount: 0,
      strategyFamilyCount: 1,
      unresolvedLeadCount: 0,
      consecutiveNoYieldCycles: 0,
      queryStrategyVersion: 1,
      evidenceQuality: "UNKNOWN",
      lastAssessedAt: now,
      nextReviewAt: null,
      evidence: {},
      createdAt: now,
      updatedAt: now,
    };
    const alert = alertWith("rootless-coverage-alert", now, {
      category: "AGENT_TIMEOUT",
      severity: "CRITICAL",
      subjectType: "AGENT_JOB",
      subjectId: coverageCell.id,
    });
    const job = {
      id: "coverage-agent-job",
      supplySourceId: null,
      status: "FAILED",
      subjectType: "COVERAGE_PLANNER",
      subjectId: coverageCell.id,
      subjectJson: {
        coverageCellId: coverageCell.id,
        rolloutCohort: "DEFAULT",
        contractVersion: 1,
      },
      queue: "affiliate",
      lane: "COVERAGE",
      role: "COVERAGE_PLANNER",
      updatedAt: now,
      createdAt: now,
      claimGeneration: 1,
    };
    const delegates = setupProjection({
      affiliateCoverageCells: [coverageCell],
      affiliateAgentGatewayJobs: [job],
      affiliateOperationalAlerts: [alert],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) =>
      JSON.stringify(args?.where ?? {}).includes(`"${coverageCell.id}"`)
        ? 1
        : 0,
    );
    alertDelegate.findMany.mockImplementation(async (args: {
      where?: unknown;
    }) =>
      JSON.stringify(args.where ?? {}).includes(`"${coverageCell.id}"`)
        ? [alert]
        : [],
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "overview",
      filters: {
        ...inputFor().filters,
        market: "US-Austin",
        city: "Austin",
        sport: "soccer",
        profile: "EVENT",
      },
    }));

    expect(projection.overview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `alert:${alert.id}` }),
      ]),
    );
    expect(projection.overview.exceptionTotal).toBe(1);
  });
  it("retains SQL-scoped discovery-run alerts in overview linkage", async () => {
    const now = new Date("2026-08-29T00:05:00.000Z");
    const campaign = {
      id: "rootless-discovery-campaign",
      createdAt: now,
      updatedAt: now,
      name: "Austin discovery",
      region: "Austin",
      location: "Austin",
      sportIds: ["soccer"],
      sourceTypeHints: ["EVENT"],
      status: "ACTIVE",
      lastRunAt: now,
      nextRunAt: null,
      maxQueriesPerRun: 1,
      maxResultsPerQuery: 10,
      queryCursor: null,
      coverageFingerprint: null,
      metadata: {
        rolloutCohort: "DEFAULT",
        contractVersion: 1,
      },
    };
    const run = {
      id: "rootless-discovery-run",
      createdAt: now,
      updatedAt: now,
      campaignId: campaign.id,
      requestedByUserId: null,
      status: "SUCCEEDED",
      queuedAt: now,
      startedAt: now,
      finishedAt: now,
      claimedAt: now,
      workerId: null,
      attemptCount: 1,
      generatedQueryCount: 1,
      returnedResultCount: 1,
      newResultCount: 1,
      duplicateCount: 0,
      rejectedCount: 0,
      createdIntakeCount: 0,
      providerJobIds: [],
      errorMessage: null,
      summary: {},
    };
    const query = {
      id: "rootless-discovery-query",
      createdAt: now,
      updatedAt: now,
      runId: run.id,
      campaignId: campaign.id,
      queryKey: "austin-soccer",
      cityGeoid: null,
      targetCity: "Austin",
      targetState: "TX",
      sportId: "soccer",
      sportName: "Soccer",
      profileKey: "EVENT",
      strategyKey: "CITY_SPORT",
      strategyFamilyKey: "CITY_SPORT",
      queryText: "Austin soccer",
      provider: "BRAVE",
      status: "SUCCEEDED",
      returnedResultCount: 1,
      qualifiedDirectCount: 1,
      newQualifiedPolicyKeyCount: 1,
      intakeCreatedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      qualifiedPolicyKeys: [],
      newQualifiedPolicyKeys: [],
      errorCode: null,
      metadata: {},
    };
    const alert = alertWith("rootless-discovery-alert", now, {
      category: "DISCOVERY_FAILURE",
      severity: "CRITICAL",
      subjectType: "DISCOVERY_RUN",
      subjectId: run.id,
    });
    const delegates = setupProjection({
      affiliateSourceDiscoveryCampaigns: [campaign],
      affiliateSourceDiscoveryRuns: [run],
      affiliateSourceDiscoveryQueryExecutions: [query],
      affiliateOperationalAlerts: [alert],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) =>
      JSON.stringify(args?.where ?? {}).includes(`"${run.id}"`) ? 1 : 0,
    );
    alertDelegate.findMany.mockImplementation(async (args: {
      where?: unknown;
    }) =>
      JSON.stringify(args.where ?? {}).includes(`"${run.id}"`) ? [alert] : [],
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "overview",
      filters: {
        ...inputFor().filters,
        market: "Austin",
        city: "Austin",
        sport: "soccer",
        profile: "EVENT",
      },
    }));

    expect(projection.overview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `alert:${alert.id}` }),
      ]),
    );
    expect(projection.overview.exceptionTotal).toBe(1);
  });
  it("keeps alert totals aligned with dimension and root lineage scope", async () => {
    const now = new Date("2026-08-29T00:05:00.000Z");
    const root = {
      id: "root-market-a",
      liveSourceId: null,
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/market-a",
      pathKey: "/market-a",
      targetContribution: 1,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: now,
      updatedAt: now,
      createdAt: now,
      lifecycleGeneration: 1,
      intakeId: null,
    };
    const outOfScopeRoot = {
      ...root,
      id: "root-market-b",
      canonicalUrl: "https://example.test/market-b",
      pathKey: "/market-b",
    };
    const target = (id: string, supplySourceId: string, marketKey: string) => ({
      id,
      supplySourceId,
      candidateId: null,
      targetType: "EVENT",
      targetId: `${id}-event`,
      marketKey,
      sportId: "soccer",
      sourceProfile: "EVENT",
      status: "PUBLISHED",
      publishedAt: now,
      lastSuccessfulRefreshAt: now,
      freshnessExpiresAt: new Date("2026-08-30T00:00:00.000Z"),
      rejectedAt: null,
      rejectionReason: null,
      evidenceRefs: [],
      evidenceHash: null,
      metadata: { city: "Austin" },
    });
    const inScopeAlert = alertWith("dimension-alert-in-scope", now, {
      category: "SUPPLY_SOURCE_INVARIANT",
      supplySourceId: root.id,
    });
    const outOfScopeAlert = alertWith("dimension-alert-out-of-scope", now, {
      category: "SUPPLY_SOURCE_INVARIANT",
      supplySourceId: outOfScopeRoot.id,
    });
    const delegates = setupProjection({
      affiliateSupplySources: [root, outOfScopeRoot],
      affiliateSupplyTargets: [
        target("target-market-a", root.id, "Austin"),
        target("target-market-b", outOfScopeRoot.id, "Portland"),
      ],
      affiliateOperationalAlerts: [inScopeAlert, outOfScopeAlert],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) => {
      const serializedWhere = JSON.stringify(args.where ?? {});
      return serializedWhere.includes(`"${root.id}"`) &&
        !serializedWhere.includes(`"${outOfScopeRoot.id}"`)
        ? 1
        : 0;
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "overview",
      filters: {
        ...inputFor().filters,
        market: "Austin",
        city: "Austin",
        sport: "soccer",
        profile: "EVENT",
      },
    }));

    expect(projection.overview.exceptionTotal).toBe(1);
    expect(projection.overview.exceptions).toEqual([
      expect.objectContaining({ id: `alert:${inScopeAlert.id}` }),
    ]);
  });
  it("requires a post-alert successful refresh before marking refresh alerts recovered", async () => {
    const failureAt = new Date("2026-08-29T00:05:00.000Z");
    const refreshAt = new Date("2026-08-29T00:10:00.000Z");
    const root = {
      id: "refresh-root",
      liveSourceId: "refresh-source",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/refresh",
      pathKey: "/refresh",
      targetContribution: 1,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: refreshAt,
      lastSuccessfulRefreshAt: refreshAt,
      updatedAt: refreshAt,
      createdAt: refreshAt,
      lifecycleGeneration: 1,
      intakeId: null,
    };
    const alert = alertWith("refresh-alert", failureAt, {
      category: "AUTOMATIC_REFRESH_FAILURE",
      subjectType: "SOURCE_REFRESH",
      subjectId: "refresh-run",
      supplySourceId: root.id,
    });
    const laterAlert = alertWith(
      "refresh-alert-after-success",
      new Date("2026-08-29T00:11:00.000Z"),
      {
        category: "AUTOMATIC_REFRESH_FAILURE",
        subjectType: "SOURCE_REFRESH",
        subjectId: "refresh-run",
        supplySourceId: root.id,
      },
    );
    const refreshRun = {
      id: "refresh-run",
      supplySourceId: root.liveSourceId,
      sourceId: null,
      status: "SUCCEEDED",
      createdAt: refreshAt,
      updatedAt: refreshAt,
      startedAt: new Date("2026-08-29T00:06:00.000Z"),
      finishedAt: refreshAt,
    };
    setupProjection({
      affiliateSupplySources: [root],
      affiliateOperationalAlerts: [alert, laterAlert],
      affiliateScrapeRuns: [refreshRun],
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: alert.id,
    }));

    expect(projection.alerts.rows.find((row) => row.id === alert.id)).toEqual(
      expect.objectContaining({
        recovered: true,
        recoveryEvidenceRefs: [refreshRun.id],
      }),
    );
    expect(projection.selected?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "SOURCE_REFRESH",
          id: refreshRun.id,
          href: expect.stringContaining(`selected=${refreshRun.id}`),
        }),
      ]),
    );
    expect(
      projection.alerts.rows.find((row) => row.id === laterAlert.id),
    ).toEqual(expect.objectContaining({
      recovered: false,
      active: true,
      recoveryEvidenceRefs: [],
    }));
  });
  it("keeps failed refresh exceptions when FRESH predates the failure", async () => {
    const failedAt = new Date("2026-08-29T00:05:00.000Z");
    const previousRefreshAt = new Date("2026-08-29T00:00:00.000Z");
    const root = {
      id: "fresh-before-failure-root",
      liveSourceId: "fresh-before-failure-source",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/fresh-before-failure",
      pathKey: "/fresh-before-failure",
      targetContribution: 1,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: previousRefreshAt,
      lastSuccessfulRefreshAt: previousRefreshAt,
      updatedAt: failedAt,
      createdAt: previousRefreshAt,
      lifecycleGeneration: 1,
      intakeId: null,
    };
    const failedRun = {
      id: "fresh-before-failure-run",
      supplySourceId: root.liveSourceId,
      sourceId: null,
      status: "FAILED",
      createdAt: failedAt,
      updatedAt: failedAt,
      startedAt: failedAt,
      finishedAt: failedAt,
      errorMessage: "Refresh failed",
    };
    setupProjection({
      affiliateSupplySources: [root],
      affiliateScrapeRuns: [failedRun],
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "overview",
    }));

    expect(projection.overview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `scrape:${failedRun.id}` }),
      ]),
    );
  });
  it("recovers alert-delivery failures from delivered attempts on the source alert", async () => {
    const failureAt = new Date("2026-08-29T00:05:00.000Z");
    const failureAlert = alertWith("delivery-failure", failureAt, {
      category: "ALERT_DELIVERY_FAILURE",
      payload: {
        sourceEventKey: "source-alert-event",
        channel: "webhook",
      },
    });
    const sourceAlert = alertWith(
      "source-alert",
      new Date("2026-08-29T00:04:00.000Z"),
      {
        eventKey: "source-alert-event",
        rolloutCohort: "CANARY",
        contractVersion: 2,
      },
    );
    setupProjection({
      affiliateOperationalAlerts: [failureAlert, sourceAlert],
      affiliateOperationalAlertDeliveries: [{
        id: "source-delivery",
        alertId: sourceAlert.id,
        channel: "webhook",
        status: "DELIVERED",
        attempt: 1,
        createdAt: failureAt,
      }],
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: failureAlert.id,
    }));
    expect(projection.alerts.rows.find((row) => row.id === failureAlert.id))
      .toEqual(expect.objectContaining({
        recovered: true,
        active: false,
        recoveryEvidenceRefs: ["source-delivery"],
      }));
    expect(projection.selected?.related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "SOURCE_ALERT",
          id: sourceAlert.id,
          href: expect.stringContaining(`selected=${sourceAlert.id}`),
        }),
        expect.objectContaining({
          kind: "ALERT_DELIVERY",
          id: "source-delivery",
          href: expect.stringContaining(`selected=${sourceAlert.id}`),
        }),
      ]),
    );
    const sourceRelated = projection.selected?.related.find(
      (row) => row.kind === "SOURCE_ALERT" && row.id === sourceAlert.id,
    );
    const deliveryRelated = projection.selected?.related.find(
      (row) => row.kind === "ALERT_DELIVERY" && row.id === "source-delivery",
    );
    expectContractLink(sourceRelated?.href);
    expectContractLink(deliveryRelated?.href);
  });

  it("uses the AGENT_JOB contract for source alert recovery links", async () => {
    const failureAt = new Date("2026-08-29T00:05:00.000Z");
    const sourceAlert = alertWith("agent-source-alert", failureAt, {
      eventKey: "agent-source-event",
      category: "AGENT_INVOCATION_FAILURE",
      subjectType: "AGENT_JOB",
      subjectId: "agent-job-contract",
      rolloutCohort: null,
      contractVersion: null,
    });
    const failureAlert = alertWith("agent-delivery-failure", failureAt, {
      category: "ALERT_DELIVERY_FAILURE",
      payload: {
        sourceEventKey: sourceAlert.eventKey,
        channel: "webhook",
      },
    });
    const gatewayJob = {
      id: "agent-job-contract",
      supplySourceId: null,
      status: "FAILED",
      subjectType: "MAPPING_PRODUCER",
      subjectId: "agent-source",
      subjectJson: {
        rolloutCohort: "CANARY",
        contractVersion: 2,
      },
      queue: "affiliate",
      lane: "MAPPING",
      role: "MAPPING_PRODUCER",
      updatedAt: failureAt,
      createdAt: failureAt,
      claimGeneration: 1,
    };
    const delegates = setupProjection({
      affiliateOperationalAlerts: [failureAlert, sourceAlert],
      affiliateAgentGatewayJobs: [gatewayJob],
      affiliateOperationalAlertDeliveries: [{
        id: "agent-source-delivery",
        alertId: sourceAlert.id,
        channel: "webhook",
        status: "DELIVERED",
        attempt: 1,
        createdAt: failureAt,
      }],
    });
    const gatewayJobDelegate = delegates.get("affiliateAgentGatewayJobs");
    if (!gatewayJobDelegate) throw new Error("Missing gateway job delegate");
    gatewayJobDelegate.findMany.mockImplementation(async (args: {
      where?: unknown;
    }) =>
      JSON.stringify(args.where ?? {}).includes('"id"')
        ? [gatewayJob]
        : [],
    );

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      selectedType: "alert",
      selectedId: failureAlert.id,
    }));
    expect(gatewayJobDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [gatewayJob.id] } },
      }),
    );
    const sourceRelated = projection.selected?.related.find(
      (row) => row.kind === "SOURCE_ALERT" && row.id === sourceAlert.id,
    );
    const sourceHref = new URL(
      sourceRelated?.href ?? "",
      "https://affiliate-operations.invalid",
    );
    expect(sourceHref.searchParams.get("rolloutCohort")).toBe("CANARY");
    expect(sourceHref.searchParams.get("contractVersion")).toBe("2");
  });
  it("retains off-page source delivery recovery evidence and contracts", async () => {
    const failureAt = new Date("2026-08-29T00:05:00.000Z");
    const sourceAlert = alertWith(
      "off-page-source-alert",
      new Date("2026-08-29T00:04:00.000Z"),
      {
        eventKey: "off-page-source-event",
        rolloutCohort: "CANARY",
        contractVersion: 2,
      },
    );
    const failureAlert = alertWith("off-page-delivery-failure", failureAt, {
      category: "ALERT_DELIVERY_FAILURE",
      payload: {
        sourceEventKey: sourceAlert.eventKey,
        channel: "webhook",
      },
    });
    const alerts = [failureAlert, sourceAlert];
    const delegates = setupProjection({
      affiliateOperationalAlerts: alerts,
      affiliateOperationalAlertDeliveries: [{
        id: "off-page-source-delivery",
        alertId: sourceAlert.id,
        channel: "webhook",
        status: "DELIVERED",
        attempt: 1,
        createdAt: failureAt,
      }],
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    const deliveryDelegate = delegates.get(
      "affiliateOperationalAlertDeliveries",
    );
    if (!alertDelegate || !deliveryDelegate) {
      throw new Error("Missing alert delegates");
    }
    alertDelegate.count = jest.fn(async () => alerts.length);
    alertDelegate.findMany.mockImplementation(async (args: {
      where?: unknown;
      skip?: number;
      take?: number;
    }) => {
      const serializedWhere = JSON.stringify(args.where ?? {});
      if (serializedWhere.includes(`"id":"${failureAlert.id}"`)) {
        return [failureAlert];
      }
      if (serializedWhere.includes(`"${sourceAlert.eventKey}"`)) {
        return [sourceAlert];
      }
      if (args.take === 1 && (args.skip ?? 0) === 0) {
        return [failureAlert];
      }
      const start = args.skip ?? 0;
      return alerts.slice(start, start + (args.take ?? alerts.length));
    });
    deliveryDelegate.findMany.mockImplementation(async (args: {
      where?: unknown;
    }) => {
      return JSON.stringify(args.where ?? {}).includes(sourceAlert.id)
        ? [{
            id: "off-page-source-delivery",
            alertId: sourceAlert.id,
            channel: "webhook",
            status: "DELIVERED",
          }]
        : [];
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      pageSize: 1,
      selectedType: "alert",
      selectedId: failureAlert.id,
    }));

    expect(projection.overview.exceptionTotal).toBe(1);
    expect(projection.alerts.rows).toEqual([
      expect.objectContaining({
        id: failureAlert.id,
        recovered: true,
        active: false,
        recoveryEvidenceRefs: ["off-page-source-delivery"],
      }),
    ]);
    expect(projection.selected?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Recovery",
          fields: expect.arrayContaining([
            expect.objectContaining({
              label: "Recovery evidence",
              value: "off-page-source-delivery",
            }),
          ]),
        }),
      ]),
    );
    const sourceRelated = projection.selected?.related.find(
      (row) =>
        row.kind === "SOURCE_ALERT" && row.id === sourceAlert.id,
    );
    const deliveryRelated = projection.selected?.related.find(
      (row) =>
        row.kind === "ALERT_DELIVERY" &&
        row.id === "off-page-source-delivery",
    );
    expectContractLink(sourceRelated?.href);
    expectContractLink(deliveryRelated?.href);
  });
  it("selects the newest bounded unrecovered alert rail after recovery filtering", async () => {
    const alerts = Array.from({ length: 100 }, (_value, index) => {
      const createdAt = new Date("2027-01-01T00:00:00.000Z");
      createdAt.setSeconds(createdAt.getSeconds() - index);
      return alertWith(`rail-${index}`, createdAt, {
        payload: index < 75 ? { recovered: true } : {},
      });
    });
    const delegates = setupProjection({
      affiliateOperationalAlerts: alerts,
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.findMany.mockImplementation(async (args: {
      skip?: number;
      take?: number;
      where?: unknown;
    }) => {
      const selected = alerts.find((alert) =>
        JSON.stringify(args.where ?? {}).includes(`"id":"${alert.id}"`),
      );
      if (selected) return [selected];
      const start = args.skip ?? 0;
      return alerts.slice(start, start + (args.take ?? alerts.length));
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 1,
      pageSize: 25,
    }));
    expect(
      alertDelegate.findMany.mock.calls.some(
        ([args]) =>
          args &&
          typeof args === "object" &&
          "take" in args &&
          args.take === 10_050 &&
          "skip" in args &&
          args.skip === 0,
      ),
    ).toBe(true);
    expect(projection.alerts.rows.every((row) => row.recovered)).toBe(true);
    expect(projection.overview.exceptionTotal).toBe(25);
    expect(projection.overview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "alert:rail-75", kind: "ALERT" }),
      ]),
    );
    expect(projection.overview.exceptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "alert:rail-0", kind: "ALERT" }),
      ]),
    );
  });

  it("finds an older active alert after more than the projection row bound of recovered alerts", async () => {
    const alerts = Array.from({ length: 10_051 }, (_value, index) => {
      const createdAt = new Date("2027-01-01T00:00:00.000Z");
      createdAt.setSeconds(createdAt.getSeconds() - index);
      return alertWith(`durable-rail-${index}`, createdAt, {
        payload: index < 10_050 ? { recovered: true } : {},
      });
    });
    const delegates = setupProjection({
      affiliateOperationalAlerts: alerts,
    });
    const alertDelegate = delegates.get("affiliateOperationalAlerts");
    if (!alertDelegate) throw new Error("Missing alert delegate");
    alertDelegate.count = jest.fn(async (args: { where?: unknown }) =>
      JSON.stringify(args?.where ?? {}).includes('"NOT"')
        ? 1
        : alerts.length,
    );
    alertDelegate.findMany.mockImplementation(async (args: {
      skip?: number;
      take?: number;
      where?: unknown;
    }) => {
      const serializedWhere = JSON.stringify(args.where ?? {});
      const selected = alerts.find((alert) =>
        serializedWhere.includes(`"id":"${alert.id}"`),
      );
      if (selected) return [selected];
      if (serializedWhere.includes('"NOT"')) return [alerts[10_050]];
      const start = args.skip ?? 0;
      return alerts.slice(start, start + (args.take ?? alerts.length));
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "alerts",
      page: 1,
      pageSize: 25,
    }));
    expect(projection.alerts.total).toBe(alerts.length);
    expect(projection.alerts.rows.every((row) => row.recovered)).toBe(true);
    expect(projection.overview.exceptionTotal).toBe(1);
    expect(projection.overview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "alert:durable-rail-10050",
          kind: "ALERT",
        }),
      ]),
    );
    expect(
      alertDelegate.findMany.mock.calls.some(
        ([args]) =>
          args &&
          JSON.stringify(args.where ?? {}).includes('"NOT"') &&
          args.take === 50 &&
          args.skip === 0,
      ),
    ).toBe(true);
  });

  it("deduplicates reviewed and full process inventory by id, preferring LEGACY records", async () => {
    const run = reconciliationRun("process-dedupe", {
      session: {
        reviewedLegacyProcessManifest: {
          processes: [{ id: "legacy-1", processClass: "GOAL" }],
        },
      },
      evidence: {
        processInventory: [
          {
            id: "legacy-1",
            kind: "LEGACY",
            processClass: "GOAL",
            command: "legacy-goal --from-inventory",
            status: "STOPPED",
          },
          {
            id: "governed-1",
            kind: "GOVERNED",
            role: "MAPPING_PRODUCER",
            command: "affiliate:agent",
            status: "STOPPED",
          },
        ],
      },
    });
    setupProjection({ affiliateSupplyReconciliationRuns: [run] });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "cutover",
    }));
    const evidence = projection.cutover.rows[0]?.reportEvidence;
    expect(evidence?.processes).toHaveLength(2);
    expect(evidence?.processes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "legacy-1",
        kind: "LEGACY",
        command: "legacy-goal",
      }),
    ]));
    expect(evidence?.evidencePagination.processes.total).toBe(2);
  });

  it("preserves last-known-good public targets and excludes them from fresh supply counts", async () => {
    const now = new Date("2026-08-29T00:05:00.000Z");
    const targetManifest = buildAffiliateSupplyContractManifest({
      version: 1,
      rolloutCohort: "DEFAULT",
      supplyContract: {
        ...policy,
        targets: [{
          marketKey: "MARKET",
          sportId: "SPORT",
          sourceProfile: "EVENT",
          minimumFreshPublishedSupply: 2,
        }],
        hash: undefined,
      },
    });
    const root = {
      id: "root-public",
      rolloutCohort: "DEFAULT",
      activeSupplyContractVersion: 1,
      derivedStage: "PUBLISHED",
      isExcluded: false,
      canonicalUrl: "https://example.test/events",
      pathKey: "/events",
      targetContribution: 2,
      freshnessStatus: "FRESH",
      invariantViolations: [],
      lastAssessmentAt: null,
      updatedAt: now,
      createdAt: now,
      intakeId: null,
      liveSourceId: null,
    };
    const targetDefaults = {
      supplySourceId: root.id,
      candidateId: null,
      targetType: "EVENT",
      marketKey: "MARKET",
      sportId: "SPORT",
      sourceProfile: "EVENT",
      status: "PUBLISHED",
      publishedAt: new Date("2099-01-01T00:00:00.000Z"),
      lastSuccessfulRefreshAt: new Date("2099-01-01T00:00:00.000Z"),
      freshnessExpiresAt: new Date("2099-01-02T00:00:00.000Z"),
      rejectedAt: null,
      rejectionReason: null,
      evidenceRefs: [],
      evidenceHash: null,
    };
    const targets = [
      {
        ...targetDefaults,
        id: "target-visible",
        targetId: "event-visible",
        metadata: null,
      },
      {
        ...targetDefaults,
        id: "target-retained",
        targetId: "event-retained",
        metadata: {
          publicTargetName: "Retained event",
          publicTargetHref: "https://public.example.test/events/event-retained",
        },
      },
      {
        ...targetDefaults,
        id: "target-unsafe",
        targetId: "event-unsafe",
        metadata: {
          publicTargetName: "Unsafe event",
          publicTargetHref: "javascript:alert(1)",
        },
      },
      {
        ...targetDefaults,
        id: "target-hidden",
        targetId: "event-hidden",
        status: "DRAFT",
        metadata: null,
      },
    ];
    const delegates = setupProjection({
      affiliateSupplySources: [root],
      affiliateSupplyTargets: targets,
      events: [
        {
          id: "event-visible",
          name: "Visible event",
          organizationId: "org-public",
          archivedAt: null,
          state: "PUBLISHED",
        },
        {
          id: "event-hidden",
          name: "Hidden event",
          organizationId: "org-public",
          archivedAt: null,
          state: "DRAFT",
        },
      ],
      organizations: [{
        id: "org-public",
        name: "Public organization",
        publicSlug: "public-org",
        publicPageEnabled: true,
      }],
    });
    const contractDelegate = delegates.get("affiliateSupplyContractManifests");
    if (!contractDelegate?.findFirst) throw new Error("Missing contract delegate");
    contractDelegate.findFirst.mockResolvedValue({
      id: "contract-public-target",
      rolloutCohort: "DEFAULT",
      version: 1,
      status: "ACTIVE",
      contractHash: targetManifest.hash,
      contractJson: targetManifest.supplyContract,
      componentHashes: [],
      activatedAt: now,
    });

    const projection = await loadAffiliateOperationsProjection(inputFor({
      view: "coverage",
    }));
    const targetsById = new Map(
      projection.coverage.targets.map((target) => [target.targetId, target]),
    );

    expect(targetsById.get("event-visible")).toEqual(expect.objectContaining({
      publicTargetExists: true,
      publicTargetState: "VISIBLE",
      publicTargetName: "Visible event",
      publicTargetHref: "/o/public-org/events/event-visible",
    }));
    expect(targetsById.get("event-retained")).toEqual(expect.objectContaining({
      publicTargetExists: true,
      publicTargetState: "LAST_KNOWN_GOOD",
      publicTargetName: "Retained event",
      publicTargetHref: "https://public.example.test/events/event-retained",
    }));
    expect(targetsById.get("event-unsafe")).toEqual(expect.objectContaining({
      publicTargetExists: true,
      publicTargetState: "LAST_KNOWN_GOOD",
      publicTargetName: "Unsafe event",
      publicTargetHref: null,
    }));
    expect(targetsById.get("event-hidden")).toEqual(expect.objectContaining({
      publicTargetExists: true,
      publicTargetState: "HIDDEN",
      publicTargetName: "Hidden event",
      publicTargetHref: null,
    }));
    expect(
      projection.overview.targetDeficits.find(
        (row) => row.marketKey === "MARKET" && row.sportId === "SPORT",
      ),
    ).toEqual(expect.objectContaining({
      current: 1,
      target: 2,
      deficit: 1,
    }));
  });
});
