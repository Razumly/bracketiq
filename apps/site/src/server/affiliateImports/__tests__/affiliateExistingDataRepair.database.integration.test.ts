/** @jest-environment node */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { getStorageProvider, type StorageProvider } from '@/lib/storageProvider';
import {
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  affiliateAgentContractBundleSchema,
  affiliateAgentExistingDataRepairContextSchema,
  affiliateAgentDeclarativePackageSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  hashAffiliateAgentValue,
} from '../agentGatewayContracts';
import { buildAffiliateSupplyContractManifest, normalizeAffiliateSupplyIdentity } from '../affiliateSupplyLifecycle';
import { affiliateDiscoveryPolicyKeyForUrl } from '../sourceDiscoveryRules';
import {
  previewAffiliateExistingDataRepairAdmission,
  applyAffiliateExistingDataRepairAdmission,
} from '../affiliateExistingDataRepairAdmission';
import {
  previewAffiliateExistingRepairCapture,
  applyAffiliateExistingRepairCapture,
  processAffiliateExistingRepairCapture,
} from '../affiliateExistingDataRepairCapture';
import { queueAffiliateSourceIntakeRun, recoverStaleAffiliateSourceIntakeRuns, reviewAffiliateSourceIntakePolicy } from '../sourceIntake';
import { tryLockAffiliateRepairWrites, withAffiliateRepairActivityLease } from '../affiliateRepairActivityLease';
import { createAffiliateAgentGatewayArtifactStore } from '../../../../scripts/run-affiliate-agent-gateway';
import {
  createPrismaAffiliateAgentGateway,
  createAffiliateAgentClaimAdmission,
  recoverAffiliateAgentReviewerEffect,
} from '../prismaAgentGateway';
import {
  createProductionAffiliateAgentGatewayAdapters,
  createProductionAffiliateAgentGatewayDependencies,
} from '../agentGatewayAdapters';
import { affiliateSupplyDatabase, createAffiliateSupplyLifecycleAuthority } from '../affiliateSupplyPersistence';
import { affiliateAgentTerminalIdentityFor } from '../affiliateAgentTerminalValidation';
import type { AffiliateAgentClaimGrant } from '../agentGateway';
import type { AffiliateAgentRole } from '../agentGatewayContracts';

const exerciseExistingRepair = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(databaseUrl.hostname, '127.0.0.1');
  assert.match(databaseName, /^bracketiq_e2e_[a-z0-9_]+$/);
  assert.equal(databaseUrl.pathname, `/${databaseName}`);
  assert.equal(process.env.STORAGE_PROVIDER, 'local');
  assert.ok(process.env.STORAGE_ROOT?.includes('existing-repair-smoke'));
  const prefix = `repair-smoke-${randomUUID()}`;
  const rolloutCohort = prefix;
  const policy = {
    schemaVersion: 1 as const,
    version: 10,
    rolloutCohort,
    freshnessWindows: [{ sourceProfile: 'CLUB', maximumAgeHours: 24 }],
    targets: [{ marketKey: null, sportId: null, sourceProfile: 'CLUB', minimumFreshPublishedSupply: 1 }],
    requiredMappingEvidenceKinds: ['PAGE_HTML'],
    requiredLifecycleEvidenceKinds: ['VALIDATION_OUTPUT', 'DURABLE_SOURCE_EVIDENCE'],
  };
  const manifest = buildAffiliateSupplyContractManifest({ version: 10, rolloutCohort, status: 'ACTIVE', supplyContract: policy });
  const deployment = {
    schemaVersion: 1,
    version: 10,
    gatewayVersion: 1,
    activeSupplyContract: { version: manifest.supplyContract.version, hash: manifest.supplyContract.hash },
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(({ role, version, hash }) => ({ role, version, hash })),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES).map(({ role, version, hash }) => ({ role, version, hash })),
    expectedTopology: {
      claimsPerInvocation: 1,
      hasFreshWorkspacePerClaim: true,
      processCommand: ['affiliate-omp-agent'],
      hasNestedGoal: false,
      hasClaimLoop: false,
      hasContextReuse: false,
      executionClass: 'PRODUCTION_OMP',
      databaseRoles: {
        gateway: 'bracketiq_affiliate_gateway', lifecycleAuthority: 'bracketiq_affiliate_lifecycle', agent: 'bracketiq_affiliate_agent',
      },
    },
  };
  const bundle = affiliateAgentContractBundleSchema.parse({
    schemaVersion: 1,
    supplyContract: manifest.supplyContract,
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES),
    deploymentContract: { ...deployment, hash: hashAffiliateAgentValue(deployment) },
  });
  await prisma.affiliateSupplyContractManifests.create({ data: {
    id: `${prefix}-contract`, rolloutCohort, version: manifest.version, status: 'ACTIVE',
    contractHash: manifest.hash, contractJson: manifest.supplyContract,
  } });
  const localStorage = getStorageProvider();
  const storageKeys: string[] = [];
  const storedMimeTypes = new Map<string, string | undefined>();
  const storage: StorageProvider = {
    ...localStorage,
    async putObject(input) {
      const stored = await localStorage.putObject(input);
      storageKeys.push(stored.key);
      storedMimeTypes.set(stored.key, stored.contentType);
      return stored;
    },
    async getObjectStream(input) {
      return { ...await localStorage.getObjectStream(input), contentType: storedMimeTypes.get(input.key) };
    },
  };
  const artifactStore = createAffiliateAgentGatewayArtifactStore(prisma, storage);
  const seed = async (label: string, hasWorkingMapping = false) => {
    const intakeId = `${prefix}-${label}-intake`;
    const pageId = `${prefix}-${label}-page`;
    const aboutPageId = `${prefix}-${label}-about-page`;
    const oldRunId = `${prefix}-${label}-old-run`;
    const runId = `${prefix}-${label}-fresh-run`;
    const jobId = `${prefix}-${label}-mapping-job`;
    const sourceId = hasWorkingMapping ? `${prefix}-${label}-source` : null;
    const mappingId = hasWorkingMapping ? `${prefix}-${label}-working-mapping` : null;
    const organizationId = hasWorkingMapping ? `${prefix}-${label}-organization` : null;
    const url = `https://${prefix}.example.test/${label}`;
    if (organizationId) {
      await prisma.organizations.create({ data: {
        id: organizationId, name: 'Existing public club', ownerId: `${prefix}-owner`, website: url,
        status: 'LISTED', publicPageEnabled: true, publicWidgetsEnabled: true,
        description: 'Keep this public description unchanged.', location: 'Portland, OR',
        coordinates: [-122.6765, 45.5231], verificationStatus: 'VERIFIED', verifiedAt: new Date('2026-08-01T12:00:00Z'),
      } });
    }
    await prisma.affiliateSourceIntakes.create({ data: {
      id: intakeId, name: `Repair smoke ${label}`, sourceKey: `${prefix}-${label}`, baseUrl: url,
      status: 'REVIEW_REQUIRED', complianceStatus: 'ALLOWED', targetKindHints: [], lastRunId: oldRunId,
      affiliateSourceId: sourceId, organizationId,
    } });
    for (const [id, canonicalUrl, role] of [[pageId, url, 'LISTING'], [aboutPageId, `${url}/about`, 'ABOUT']]) {
      await prisma.affiliateSourceIntakePages.create({ data: {
        id, intakeId, url: canonicalUrl, canonicalUrl, urlKey: id, role, status: 'ACTIVE', robotsStatus: 'ALLOWED',
      } });
    }
    for (const [id, createdAt] of [[oldRunId, new Date('2026-08-01T12:00:00Z')], [runId, new Date('2026-09-13T12:00:00Z')]] as const) {
      await prisma.affiliateSourceIntakeRuns.create({ data: {
        id, intakeId, requestedPageIds: [pageId, aboutPageId], status: 'SUCCEEDED', capturedPageCount: 2,
        createdAt, startedAt: createdAt, finishedAt: createdAt,
      } });
      for (const [ownedPageId, ownedUrl] of [[pageId, url], [aboutPageId, `${url}/about`]]) {
        for (const [kind, mimeType, text] of [
          ['PAGE_HTML', 'text/html', '<main><p>We offer indoor volleyball on our hardwood courts.</p><a href="/register">Register</a></main>'],
          ['PAGE_MARKDOWN', 'text/markdown', 'We offer indoor volleyball on our hardwood courts.'],
        ]) {
          const artifactId = `${id}-${ownedPageId}-${kind}`;
          const bytes = Buffer.from(text);
          const stored = await storage.putObject({ data: bytes, originalName: `${kind}.txt`, contentType: mimeType, key: `${prefix}/${artifactId}` });
          const fileId = `${artifactId}-file`;
          await prisma.file.create({ data: { id: fileId, originalName: `${kind}.txt`, mimeType, sizeBytes: bytes.length, path: stored.key } });
          await prisma.affiliateSourceIntakeArtifacts.create({ data: {
            id: artifactId, intakeId, pageId: ownedPageId, runId: id, kind, sourceUrl: ownedUrl, finalUrl: ownedUrl,
            contentHash: createHash('sha256').update(bytes).digest('hex'), dedupeKey: artifactId, fileId, mimeType, sizeBytes: bytes.length,
          } });
        }
      }
    }
    if (sourceId && mappingId) {
      await prisma.affiliateScrapeSources.create({ data: {
        id: sourceId, organizationId, sourceKey: `${prefix}-${label}`, name: 'Existing working source', listUrl: url, baseUrl: url,
        targetKind: 'CLUB', activeMappingId: mappingId, autoScrapeEnabled: true,
      } });
      await prisma.affiliateScrapeMappings.create({ data: {
        id: mappingId, sourceId, version: 1, isActive: true, mapping: { kind: 'CLUB', original: true },
      } });
    }
    await prisma.affiliateSourceMappingJobs.create({ data: {
      id: jobId, intakeId, sourceId, mappingId, status: 'HUMAN_REVIEW_REQUIRED', attemptCount: 3,
      resultSummary: { repairReasons: ['INSUFFICIENT_STORED_EVIDENCE'], historicalResult: 'preserve-this-result' },
    } });
    await prisma.affiliateSourceDomainPolicies.upsert({ where: { policyKey: affiliateDiscoveryPolicyKeyForUrl(url) }, create: {
      id: `${prefix}-policy`, policyKey: affiliateDiscoveryPolicyKeyForUrl(url), status: 'ALLOWED',
      reviewedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
    }, update: {} });
    return { label, intakeId, pageId, aboutPageId, oldRunId, runId, jobId, sourceId, mappingId, organizationId };
  };
  try {
    const privateSource = await seed('private');
    const publicSource = await seed('working', true);
    const gapSource = await seed('gap', true);
    const workingIdentity = normalizeAffiliateSupplyIdentity({ requestedUrl: `https://${prefix}.example.test/working` });
    const existingWorkingRoot = await prisma.affiliateSupplySources.create({ data: {
      id: `${prefix}-existing-working-root`, intakeId: publicSource.intakeId, liveSourceId: publicSource.sourceId,
      canonicalUrl: workingIdentity.canonicalUrl, identityKey: workingIdentity.identityKey,
      origin: workingIdentity.origin, pathKey: workingIdentity.pathKey, targetKind: 'CLUB', rolloutCohort,
    } });
    await prisma.affiliateSourceIntakes.update({ where: { id: publicSource.intakeId }, data: { supplySourceId: existingWorkingRoot.id } });
    await withAffiliateRepairActivityLease(publicSource.sourceId!, async () => {
      assert.equal(await prisma.$transaction((transaction) => tryLockAffiliateRepairWrites(transaction)), false);
    });
    await prisma.$transaction(async (transaction) => {
      assert.equal(await tryLockAffiliateRepairWrites(transaction), true);
      let activityStarted = false;
      await assert.rejects(withAffiliateRepairActivityLease(publicSource.sourceId!, async () => {
        activityStarted = true;
      }));
      assert.equal(activityStarted, false);
    });
    const activityFailure = new Error('The source activity failed.');
    await assert.rejects(
      withAffiliateRepairActivityLease(publicSource.sourceId!, async () => { throw activityFailure; }),
      (error: unknown) => error === activityFailure,
    );
    assert.equal(await prisma.$transaction((transaction) => tryLockAffiliateRepairWrites(transaction)), true);
    const repairFixtures = [privateSource, publicSource, gapSource];
    const captureSource = await seed('capture');
    const capturePages = await prisma.affiliateSourceIntakePages.findMany({ where: { intakeId: captureSource.intakeId } });
    for (const page of capturePages) {
      const identity = normalizeAffiliateSupplyIdentity({ requestedUrl: page.canonicalUrl });
      const root = await prisma.affiliateSupplySources.create({ data: {
        id: `${prefix}-root-${page.id}`, intakeId: captureSource.intakeId, rolloutCohort,
        canonicalUrl: identity.canonicalUrl, identityKey: identity.identityKey,
        origin: identity.origin, pathKey: identity.pathKey, targetKind: 'UNCLASSIFIED',
      } });
      await prisma.affiliateSourceIntakePages.update({ where: { id: page.id }, data: { supplySourceId: root.id } });
      if (page.id === captureSource.pageId) {
        await prisma.affiliateSourceIntakes.update({ where: { id: captureSource.intakeId }, data: { supplySourceId: root.id } });
      }
    }
    const intakeBefore = await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: captureSource.intakeId } });
    const captureInput = {
      prisma, bundle, targets: [{ intakeId: captureSource.intakeId, pageIds: [captureSource.pageId, captureSource.aboutPageId] }],
      reason: 'Verify two known source pages.', operatorId: 'smoke-operator',
    };
    const capturePreview = await previewAffiliateExistingRepairCapture(captureInput);
    assert.equal(capturePreview.rows.every((row) => row.eligible), true, JSON.stringify(capturePreview.rows));
    const captureApplied = await applyAffiliateExistingRepairCapture({ ...captureInput, expectedReportHash: capturePreview.reportHash });
    assert.equal(captureApplied.writeCount, 1);
    assert.deepEqual(await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: captureSource.intakeId } }), intakeBefore);
    const captureReplay = await applyAffiliateExistingRepairCapture({ ...captureInput, expectedReportHash: capturePreview.reportHash });
    assert.equal(captureReplay.writeCount, 0);
    assert.deepEqual(captureReplay.runIds, captureApplied.runIds);
    await prisma.affiliateSourceIntakeRuns.update({ where: { id: captureApplied.runIds[0] }, data: { requestedPageIds: [captureSource.pageId] } });
    await assert.rejects(processAffiliateExistingRepairCapture({
      prisma, bundle, runId: captureApplied.runIds[0]!, operatorId: 'smoke-operator',
    }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CAPTURE_INTENT_DRIFT');
    const finishedCapture = await prisma.affiliateSourceIntakeRuns.update({
      where: { id: captureApplied.runIds[0] },
      data: { requestedPageIds: [captureSource.pageId, captureSource.aboutPageId], status: 'FAILED', finishedAt: new Date() },
    });
    const nextCaptureInput = { ...captureInput, reason: 'Refresh the reviewed source after a terminal attempt.' };
    const nextCapturePreview = await previewAffiliateExistingRepairCapture(nextCaptureInput);
    assert.equal(nextCapturePreview.rows[0]?.eligible, true, JSON.stringify(nextCapturePreview.rows));
    const nextCapture = await applyAffiliateExistingRepairCapture({ ...nextCaptureInput, expectedReportHash: nextCapturePreview.reportHash });
    assert.equal(nextCapture.writeCount, 1);
    assert.notEqual(nextCapture.runIds[0], finishedCapture.id);
    assert.deepEqual(await prisma.affiliateSourceIntakeRuns.findUniqueOrThrow({ where: { id: finishedCapture.id } }), finishedCapture);
    let recoveredCaptureId = nextCapture.runIds[0]!;
    const conflictingCapture = await prisma.affiliateSourceIntakeRuns.create({ data: {
      id: `${prefix}-ordinary-capture-conflict`, intakeId: captureSource.intakeId,
      requestedPageIds: [captureSource.pageId], status: 'QUEUED',
    } });
    const staleWithConflict = await prisma.affiliateSourceIntakeRuns.update({
      where: { id: recoveredCaptureId },
      data: { status: 'RUNNING', workerId: 'stale-conflict', claimedAt: new Date(Date.now() - 7_200_000), startedAt: new Date(Date.now() - 7_200_000) },
    });
    assert.deepEqual(await recoverStaleAffiliateSourceIntakeRuns({ db: prisma, runIds: [recoveredCaptureId] }), []);
    assert.deepEqual(await prisma.affiliateSourceIntakeRuns.findUniqueOrThrow({ where: { id: recoveredCaptureId } }), staleWithConflict);
    await prisma.affiliateSourceIntakeRuns.delete({ where: { id: conflictingCapture.id } });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await prisma.affiliateSourceIntakeRuns.update({
        where: { id: recoveredCaptureId },
        data: { status: 'RUNNING', workerId: `stale-${attempt}`, claimedAt: new Date(Date.now() - 7_200_000), startedAt: new Date(Date.now() - 7_200_000) },
      });
      const replacements = await recoverStaleAffiliateSourceIntakeRuns({ db: prisma, runIds: [recoveredCaptureId] });
      assert.equal(replacements.length, 1);
      recoveredCaptureId = replacements[0]!.replacementRunId;
      const replay = await applyAffiliateExistingRepairCapture({ ...nextCaptureInput, expectedReportHash: nextCapturePreview.reportHash });
      assert.equal(replay.writeCount, 0);
      assert.deepEqual(replay.runIds, [recoveredCaptureId]);
    }
    const recoveredCapture = await prisma.affiliateSourceIntakeRuns.update({
      where: { id: recoveredCaptureId }, data: { status: 'FAILED', finishedAt: new Date() },
    });
    await prisma.affiliateSourceIntakeRuns.create({ data: {
      id: `${prefix}-capture-branch`, intakeId: captureSource.intakeId,
      requestedPageIds: recoveredCapture.requestedPageIds, requestedByUserId: recoveredCapture.requestedByUserId,
      status: 'FAILED', finishedAt: new Date(),
      summary: {
        ...(recoveredCapture.summary as Record<string, Prisma.InputJsonValue>),
        recovery: { reason: 'STALE_WORKER_LEASE_REPLACEMENT', replacesRunId: nextCapture.runIds[0]!, recoveredAt: new Date().toISOString() },
      },
    } });
    const captureRunCount = await prisma.affiliateSourceIntakeRuns.count({ where: { intakeId: captureSource.intakeId } });
    await assert.rejects(
      applyAffiliateExistingRepairCapture({ ...nextCaptureInput, expectedReportHash: nextCapturePreview.reportHash }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CAPTURE_INTENT_DRIFT',
    );
    assert.equal(await prisma.affiliateSourceIntakeRuns.count({ where: { intakeId: captureSource.intakeId } }), captureRunCount);
    const raceSource = await seed('capture-race');
    const raceInput = {
      prisma, bundle, targets: [{ intakeId: raceSource.intakeId, pageIds: [raceSource.pageId] }],
      reason: 'Verify atomic known-source capture ownership.', operatorId: 'smoke-operator',
    };
    const racePreview = await previewAffiliateExistingRepairCapture(raceInput);
    assert.equal(racePreview.rows[0]?.eligible, true, JSON.stringify(racePreview.rows));
    let markOrdinaryRead!: () => void;
    let releaseOrdinaryRead!: () => void;
    const ordinaryRead = new Promise<void>((resolve) => { markOrdinaryRead = resolve; });
    const ordinaryRelease = new Promise<void>((resolve) => { releaseOrdinaryRead = resolve; });
    const coordinatedDatabase = {
      $transaction: (callback: (client: unknown) => Promise<unknown>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => prisma.$transaction(async (transaction) => {
        const coordinatedRuns = new Proxy(transaction.affiliateSourceIntakeRuns, {
          get(target, key) {
            if (key === 'findFirst') return async (...args: Parameters<typeof target.findFirst>) => {
              const row = await target.findFirst(...args);
              markOrdinaryRead();
              await ordinaryRelease;
              return row;
            };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return callback(new Proxy(transaction, {
          get(target, key) {
            if (key === 'affiliateSourceIntakeRuns') return coordinatedRuns;
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }));
      }, options),
    };
    const ordinaryOutcome = queueAffiliateSourceIntakeRun(raceSource.intakeId, [raceSource.pageId], 'ordinary-operator', { db: coordinatedDatabase })
      .then((run) => ({ committed: true, run }), (error: unknown) => ({ committed: false, error }));
    await Promise.race([
      ordinaryRead,
      ordinaryOutcome.then((outcome) => { throw new Error(`The ordinary queue ended before its ownership read: ${JSON.stringify(outcome)}`); }),
    ]);
    let raceApplied: Awaited<ReturnType<typeof applyAffiliateExistingRepairCapture>> | undefined;
    let raceFailure: unknown;
    try {
      raceApplied = await applyAffiliateExistingRepairCapture({ ...raceInput, expectedReportHash: racePreview.reportHash });
    } catch (error) {
      raceFailure = error;
    } finally {
      releaseOrdinaryRead();
    }
    const ordinaryResult = await ordinaryOutcome;
    if (raceFailure) throw raceFailure;
    assert.ok(raceApplied);
    assert.equal(ordinaryResult.committed, false, JSON.stringify(ordinaryResult));
    const activeRaceRuns = await prisma.affiliateSourceIntakeRuns.findMany({
      where: { intakeId: raceSource.intakeId, status: { in: ['QUEUED', 'RUNNING', 'CLAIMED'] } },
    });
    assert.deepEqual(activeRaceRuns.map((run) => run.id), raceApplied.runIds);
    const intakeBeforePolicyConflict = await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: raceSource.intakeId } });
    const sharedPolicyKey = affiliateDiscoveryPolicyKeyForUrl(intakeBeforePolicyConflict.baseUrl!);
    const policyBeforeConflict = await prisma.affiliateSourceDomainPolicies.findUniqueOrThrow({ where: { policyKey: sharedPolicyKey } });
    await assert.rejects(
      reviewAffiliateSourceIntakePolicy(raceSource.intakeId, { complianceStatus: 'ALLOWED', notes: 'This save must roll back with its queue conflict.' }, 'ordinary-operator'),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'GOVERNED_CAPTURE_OWNERSHIP_CONFLICT',
    );
    assert.deepEqual(await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: raceSource.intakeId } }), intakeBeforePolicyConflict);
    assert.deepEqual(await prisma.affiliateSourceDomainPolicies.findUniqueOrThrow({ where: { policyKey: sharedPolicyKey } }), policyBeforeConflict);

    const missingSourceId = `${prefix}-missing-source`;
    const missingSelection = await previewAffiliateExistingDataRepairAdmission({
      prisma, bundle, artifactStore, sourceIds: [missingSourceId], reason: 'Review the explicit source selection.', operatorId: 'smoke-operator',
    });
    assert.equal(missingSelection.rows.length, 1);
    assert.equal(missingSelection.rows[0]?.sourceId, missingSourceId);
    assert.equal(missingSelection.rows[0]?.jobId, null);
    assert.equal(missingSelection.rows[0]?.outcome, 'HELD');

    const publicProjection = await seed('public-projection');
    const projectedSourceId = `${prefix}-public-projection-source`;
    const projectedUrl = `https://${prefix}.example.test/public-projection`;
    await prisma.affiliateScrapeSources.create({ data: {
      id: projectedSourceId, sourceKey: `${prefix}-public-projection`, name: 'Existing published projection',
      listUrl: projectedUrl, targetKind: 'UNCLASSIFIED', autoScrapeEnabled: false,
    } });
    await prisma.affiliateSourceIntakes.update({ where: { id: publicProjection.intakeId }, data: { affiliateSourceId: projectedSourceId } });
    await prisma.affiliateSourceMappingJobs.update({ where: { id: publicProjection.jobId }, data: { sourceId: projectedSourceId } });
    const publishedRunId = `${prefix}-published-run`;
    await prisma.affiliateScrapeRuns.create({ data: { id: publishedRunId, sourceId: projectedSourceId, status: 'SUCCEEDED', finishedAt: new Date() } });
    await prisma.affiliateImportCandidates.create({ data: {
      id: `${prefix}-published-candidate`, sourceId: projectedSourceId, runId: publishedRunId, listingKind: 'CLUB',
      status: 'PUBLISHED', dedupeKey: 'published', title: 'Existing public listing', sourceUrl: projectedUrl,
      officialActionUrl: projectedUrl, publishedOrganizationId: publicSource.organizationId,
    } });
    const publicProjectionPreview = await previewAffiliateExistingDataRepairAdmission({
      prisma, bundle, artifactStore, jobIds: [publicProjection.jobId], operatorId: 'smoke-operator', reason: 'Review existing public projection.',
      evidenceSelections: [{ jobId: publicProjection.jobId, runId: publicProjection.runId, pageId: publicProjection.pageId }],
    });
    assert.equal(publicProjectionPreview.rows[0]?.isPublicReplacement, true, JSON.stringify(publicProjectionPreview.rows));
    assert.equal(publicProjectionPreview.rows[0]?.eligible, false);
    assert.equal((await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: projectedSourceId } })).targetKind, 'UNCLASSIFIED');
    const oldSource = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: publicSource.sourceId! } });
    const oldMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: publicSource.mappingId! } });
    const repairInput = {
      prisma, bundle, artifactStore, jobIds: repairFixtures.map((item) => item.jobId),
      reason: 'Reassess the existing human-review concerns.', operatorId: 'smoke-operator',
      evidenceSelections: repairFixtures.map((item) => ({
        jobId: item.jobId, runId: item.runId, pageId: item.pageId, supportingPageIds: [item.aboutPageId],
      })),
    };
    const privateRepairInput = {
      ...repairInput,
      jobIds: [privateSource.jobId],
      evidenceSelections: [{
        jobId: privateSource.jobId,
        runId: privateSource.runId,
        pageId: privateSource.pageId,
        supportingPageIds: [privateSource.aboutPageId],
      }],
    };
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { sourceId: `${prefix}-dangling-source` },
    });
    const danglingPreview = await previewAffiliateExistingDataRepairAdmission(privateRepairInput);
    assert.equal(danglingPreview.rows[0]?.eligible, false, JSON.stringify(danglingPreview.rows));
    assert.ok(danglingPreview.rows[0]?.reasonCodes.includes('SOURCE_IDENTITY_MISSING'), JSON.stringify(danglingPreview.rows));
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { sourceId: null },
    });
    const historyBefore = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: privateSource.jobId } });
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { resultSummary: { mappingRepairHistory: Array.from({ length: 65 }, (_, index) => ({ repairReason: `Recorded concern ${index}` })) } },
    });
    const oversizedHistory = await previewAffiliateExistingDataRepairAdmission(privateRepairInput);
    assert.equal(oversizedHistory.rows[0]?.eligible, false);
    assert.ok(oversizedHistory.rows[0]?.reasonCodes.includes('REPAIR_REASONS_INVALID'), JSON.stringify(oversizedHistory.rows));
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId }, data: { resultSummary: historyBefore.resultSummary ?? Prisma.JsonNull },
    });
    const policyKey = affiliateDiscoveryPolicyKeyForUrl(`https://${prefix}.example.test/private`);
    const policyBefore = await prisma.affiliateSourceDomainPolicies.findUniqueOrThrow({ where: { policyKey } });
    await prisma.affiliateSourceDomainPolicies.update({ where: { policyKey }, data: { status: 'BLOCKED' } });
    const blockedPreview = await previewAffiliateExistingDataRepairAdmission(privateRepairInput);
    assert.equal(blockedPreview.rows[0]?.eligible, false, JSON.stringify(blockedPreview.rows));
    assert.ok(blockedPreview.rows[0]?.reasonCodes.includes('SOURCE_POLICY_NOT_ALLOWED'), JSON.stringify(blockedPreview.rows));
    await prisma.affiliateSourceDomainPolicies.update({
      where: { policyKey },
      data: {
        status: policyBefore.status,
        reviewedAt: policyBefore.reviewedAt,
        expiresAt: policyBefore.expiresAt,
      },
    });
    const limitedPreview = await previewAffiliateExistingDataRepairAdmission({ ...repairInput, limit: 1 });
    assert.equal(limitedPreview.selectedJobIds.length, 1, JSON.stringify(limitedPreview.rows));
    assert.equal(
      limitedPreview.rows.filter((row) => row.reasonCodes.includes('SELECTION_LIMIT_EXCLUDED')).length,
      2,
      JSON.stringify(limitedPreview.rows),
    );
    const { hash: _supplyHash, ...supplyPreimage } = bundle.supplyContract;
    const driftedSupplyPreimage = { ...supplyPreimage, version: bundle.supplyContract.version + 1 };
    const driftedSupply = { ...driftedSupplyPreimage, hash: hashAffiliateAgentValue(driftedSupplyPreimage) };
    const { hash: _deploymentHash, ...deploymentPreimage } = bundle.deploymentContract;
    const driftedDeploymentPreimage = {
      ...deploymentPreimage,
      activeSupplyContract: { version: driftedSupply.version, hash: driftedSupply.hash },
    };
    const driftedBundle = affiliateAgentContractBundleSchema.parse({
      ...bundle,
      supplyContract: driftedSupply,
      deploymentContract: { ...driftedDeploymentPreimage, hash: hashAffiliateAgentValue(driftedDeploymentPreimage) },
    });
    const driftedPreview = await previewAffiliateExistingDataRepairAdmission({ ...privateRepairInput, bundle: driftedBundle });
    await assert.rejects(
      applyAffiliateExistingDataRepairAdmission({
        ...privateRepairInput,
        bundle: driftedBundle,
        expectedReportHash: driftedPreview.reportHash,
      }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'ACTIVE_CONTRACT_DRIFT',
    );
    const sourceSelection = await previewAffiliateExistingDataRepairAdmission({
      ...repairInput, jobIds: undefined, sourceIds: [publicSource.sourceId!, gapSource.sourceId!],
      evidenceSelections: repairInput.evidenceSelections.filter((selection) => selection.jobId !== privateSource.jobId),
    });
    assert.deepEqual([...sourceSelection.selectedJobIds].sort(), [publicSource.jobId, gapSource.jobId].sort(), JSON.stringify(sourceSelection.rows));
    const preview = await previewAffiliateExistingDataRepairAdmission(repairInput);
    assert.equal(preview.selectedJobIds.length, 3, JSON.stringify(preview.rows));
    const applied = await applyAffiliateExistingDataRepairAdmission({ ...repairInput, expectedReportHash: preview.reportHash });
    assert.equal(applied.appliedJobs.length, 3);
    const privateAfterApply = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: privateSource.jobId } });
    const workingAfterApply = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: publicSource.jobId } });
    assert.ok(workingAfterApply.supplySourceId);
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { supplySourceId: workingAfterApply.supplySourceId },
    });
    const crossRootPreview = await previewAffiliateExistingDataRepairAdmission(privateRepairInput);
    assert.equal(crossRootPreview.rows[0]?.eligible, false, JSON.stringify(crossRootPreview.rows));
    assert.ok(
      crossRootPreview.rows[0]?.reasonCodes.includes('ROOT_IDENTITY_CONFLICT')
        || crossRootPreview.rows[0]?.reasonCodes.includes('ROOT_REFERENCE_CONFLICT'),
      JSON.stringify(crossRootPreview.rows),
    );
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { supplySourceId: privateAfterApply.supplySourceId },
    });
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { status: 'COMPLETED' },
    });
    const terminalCyclePreview = await previewAffiliateExistingDataRepairAdmission(privateRepairInput);
    assert.equal(terminalCyclePreview.rows[0]?.alreadyAdmitted, true, JSON.stringify(terminalCyclePreview.rows));
    assert.equal(terminalCyclePreview.rows[0]?.outcome, 'ALREADY_ADMITTED', JSON.stringify(terminalCyclePreview.rows));
    await prisma.affiliateSourceMappingJobs.update({
      where: { id: privateSource.jobId },
      data: { status: 'GOVERNED_REPAIR_PENDING' },
    });
    await assert.rejects(
      applyAffiliateExistingDataRepairAdmission({
        ...repairInput,
        reason: 'tampered reason',
        expectedReportHash: preview.reportHash,
      }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'ADMISSION_REPORT_DRIFT',
    );
    await assert.rejects(
      applyAffiliateExistingDataRepairAdmission({
        ...repairInput,
        operatorId: 'tampered-operator',
        expectedReportHash: preview.reportHash,
      }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'ADMISSION_REPORT_DRIFT',
    );
    await assert.rejects(
      applyAffiliateExistingDataRepairAdmission({
        ...repairInput,
        expectedReportHash: '0'.repeat(64),
      }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'ADMISSION_REPORT_DRIFT',
    );
    const replay = await applyAffiliateExistingDataRepairAdmission({ ...repairInput, expectedReportHash: preview.reportHash });
    assert.equal(replay.writeCount, 0);
    const afterSource = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: publicSource.sourceId! } });
    const afterMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: publicSource.mappingId! } });
    assert.equal(afterSource.activeMappingId, oldSource.activeMappingId);
    assert.equal(afterSource.autoScrapeEnabled, oldSource.autoScrapeEnabled);
    assert.equal(afterSource.status, oldSource.status);
    assert.deepEqual(afterMapping.mapping, oldMapping.mapping);
    assert.equal(afterMapping.isActive, oldMapping.isActive);
    assert.equal(afterMapping.validatedAt, null);
    const privateJob = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: privateSource.jobId } });
    const privateRecord = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: privateJob.sourceId! } });
    const privateRoot = await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id: privateJob.supplySourceId! } });
    assert.equal(privateRecord.targetKind, 'UNCLASSIFIED');
    assert.equal(privateRoot.targetKind, 'UNCLASSIFIED');
    assert.equal(privateRecord.activeMappingId, null);
    assert.equal(privateRecord.autoScrapeEnabled, false);
    assert.equal(privateJob.attemptCount, 3);
    assert.equal(privateJob.status, 'GOVERNED_REPAIR_PENDING');
    assert.equal(privateJob.legacyIdentityMigrationEligible, false);
    assert.match(JSON.stringify(privateJob.resultSummary), /preserve-this-result/);
    const siblingJob = await prisma.affiliateSourceMappingJobs.create({ data: {
      id: `${prefix}-private-sibling`, intakeId: privateSource.intakeId, sourceId: privateRecord.id,
      supplySourceId: privateRoot.id, status: 'HUMAN_REVIEW_REQUIRED',
    } });
    const siblingPreview = await previewAffiliateExistingDataRepairAdmission({
      ...privateRepairInput, jobIds: [siblingJob.id],
      evidenceSelections: [{ jobId: siblingJob.id, runId: privateSource.runId, pageId: privateSource.pageId }],
    });
    assert.equal(siblingPreview.rows[0]?.eligible, false);
    assert.ok(siblingPreview.rows[0]?.reasonCodes.includes('ACTIVE_MAPPING_JOB_PRESENT'), JSON.stringify(siblingPreview.rows));
    const context = affiliateAgentExistingDataRepairContextSchema.parse((privateRecord.metadata as Record<string, unknown>).existingDataRepair);
    assert.equal(context.evidenceRunId, privateSource.runId);
    assert.deepEqual(context.sourceKindAssessment?.allowedListingKinds, ['CLUB', 'EVENT', 'RENTAL']);
    const jobs = await prisma.affiliateAgentGatewayJobs.findMany({ where: { subjectId: { in: repairInput.jobIds } } });
    for (const job of jobs) {
      const evidence = job.evidenceManifestJson as { entries: unknown[] };
      assert.equal(evidence.entries.length, 4);
    }
    const admission = createAffiliateAgentClaimAdmission();
    const contracts = { loadActiveBundle: async () => bundle };
    let clockOffsetMs = 0;
    const clock = { now: () => new Date(Date.now() + clockOffsetMs) };
    const adapters = createProductionAffiliateAgentGatewayAdapters({ prisma, artifacts: artifactStore, storage, clock });
    const dependencies = createProductionAffiliateAgentGatewayDependencies({
      prisma,
      clock,
      tokenSigningKey: Buffer.from('isolated-repair-smoke-signing-key'.repeat(2)),
      tokenKeyVersion: 'isolated-smoke',
      credentials: { verify: async ({ executionClass }) => executionClass === 'PRODUCTION_OMP' },
      workspaces: { verify: async () => true },
      contracts,
      claimAdmission: admission,
      artifacts: artifactStore,
      commands: adapters.commands,
      terminalEffects: adapters.terminalEffects,
      lifecycle: createAffiliateSupplyLifecycleAuthority({ db: affiliateSupplyDatabase(prisma), contractRegistry: contracts }),
    });
    const gateway = createPrismaAffiliateAgentGateway(dependencies);
    const authorizationFor = (grant: AffiliateAgentClaimGrant) => ({
      token: grant.token, jobId: grant.envelope.jobId, claimId: grant.envelope.claimId,
      claimGeneration: grant.envelope.claimGeneration, lifecycleGeneration: grant.envelope.lifecycleGeneration,
      role: grant.envelope.role, workerId: grant.envelope.workerId, invocationId: grant.envelope.invocationId,
      supplyContractHash: grant.envelope.supplyContractHash,
    });
    const claim = async (jobId: string, role: AffiliateAgentRole, label: string) => {
      const workerId = `${prefix}-${label}-worker`;
      const invocationId = `${prefix}-${label}-invocation`;
      await admission.openBoundedLease({ role, workerId, jobId, leaseSeconds: 1_200 });
      const response = await gateway.claim({
        idempotencyKey: `${prefix}-${label}-claim`, role, workerId, invocationId, roleCredential: 'isolated-smoke-role-credential',
        workspaceAttestation: {
          schemaVersion: 1, workspaceId: `${prefix}-${label}-workspace`, workerId, invocationId,
          mode: role === 'SUPPLY_REVIEWER' ? 'READ_ONLY' : 'READ_WRITE', executionClass: 'PRODUCTION_OMP',
          issuedAt: new Date(Date.now() - 1_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          signature: 'isolated-smoke-workspace-attestation',
        },
      });
      await admission.close();
      assert.ok(response, 'The exact smoke job was not claimed.');
      for (const entry of response.envelope.evidenceManifest.entries) {
        await gateway.perform({
          kind: 'READ_ARTIFACT', idempotencyKey: `${prefix}-${randomUUID()}`,
          authorization: authorizationFor(response), evidenceRef: entry.evidenceRef,
        });
      }
      return response;
    };
    for (const job of jobs) {
      const fixture = repairFixtures.find((item) => item.jobId === job.subjectId);
      assert.ok(fixture);
      const sourceLabel = fixture.label;
      const protectedWorkingSource = fixture.sourceId
        ? await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: fixture.sourceId } })
        : null;
      const protectedOrganization = fixture.organizationId
        ? await prisma.organizations.findUniqueOrThrow({ where: { id: fixture.organizationId } })
        : null;
      const protectedMapping = fixture.mappingId
        ? await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: fixture.mappingId } })
        : null;
      let nextJobId = job.id;
      for (let pass = 1; pass <= (sourceLabel === 'private' ? 3 : 1); pass += 1) {
      const label = `${sourceLabel}-pass-${pass}`;
      const producer = await claim(nextJobId, 'MAPPING_PRODUCER', `${label}-producer`);
      assert.equal(producer.envelope.subject.type, 'MAPPING_PRODUCER');
      if (producer.envelope.subject.type !== 'MAPPING_PRODUCER') throw new Error('Unexpected producer subject.');
      const repair = producer.envelope.subject.repairContext;
      assert.equal(repair?.kind, 'EXISTING_DATA_REPAIR');
      if (!repair) throw new Error('The producer lost its repair context.');
      if (sourceLabel === 'private' && pass === 1) {
        const activeClaimPreview = await previewAffiliateExistingDataRepairAdmission(privateRepairInput);
        assert.equal(activeClaimPreview.rows[0]?.eligible, false, JSON.stringify(activeClaimPreview.rows));
        assert.ok(activeClaimPreview.rows[0]?.reasonCodes.includes('ACTIVE_GATEWAY_CLAIM'), JSON.stringify(activeClaimPreview.rows));
      }
      const repairDirective = producer.envelope.subject.repairDirective;
      if (pass > 1) assert.ok(repairDirective, 'Child producers require the prior reviewer directive.');
      const entries = producer.envelope.evidenceManifest.entries;
      const pageArtifact = await prisma.affiliateSourceIntakeArtifacts.findFirstOrThrow({
        where: { intakeId: fixture.intakeId, runId: fixture.runId, pageId: fixture.pageId, kind: 'PAGE_HTML' },
      });
      const listing = entries.find((entry) => entry.artifactId === `intake-artifact:${pageArtifact.id}`);
      assert.ok(listing);
      const candidatePackage = affiliateAgentDeclarativePackageSchema.parse({
        schemaVersion: 1, supplySourceId: producer.envelope.supplySourceId,
        listingKind: sourceLabel === 'private' && pass === 1 ? 'RENTAL' : 'CLUB', listUrlRef: listing.evidenceRef,
        itemSelector: 'main',
        fields: [
          { field: 'description', selector: 'p', mode: 'TEXT', attribute: null, transform: 'TRIM' },
          { field: 'officialActionUrl', selector: 'a', mode: 'ATTRIBUTE', attribute: 'href', transform: 'ABSOLUTE_URL' },
          { field: 'sportName', mode: 'CONSTANT', value: 'Indoor Volleyball' },
          { field: 'title', selector: 'p', mode: 'TEXT', attribute: null, transform: 'TRIM' },
        ],
        evidenceRefs: [listing.evidenceRef],
        sportEvidence: {
          evidenceRunId: repair.evidenceRunId, sportsCatalogSha256: repair.sportsCatalog.sha256,
          sportDeterminations: [{
            sourceLabels: ['indoor volleyball'], status: 'RESOLVED', resolutionBasis: 'SOURCE_EVIDENCE',
            canonicalSportNames: ['Indoor Volleyball'], rationale: 'The fixture explicitly describes indoor volleyball on hardwood courts.',
            evidence: [{
              artifactId: listing.artifactId, artifactSha256: listing.sha256, artifactKind: 'PAGE_HTML',
              pageUrl: pageArtifact.finalUrl, excerpt: 'We offer indoor volleyball on our hardwood courts.',
            }],
          }],
        },
      });
      if (sourceLabel === 'gap') {
        const gap = await gateway.perform({
          kind: 'SUBMIT_RESULT', idempotencyKey: `${prefix}-${label}-gap`, authorization: authorizationFor(producer),
          result: {
            ...affiliateAgentTerminalIdentityFor(producer.envelope), disposition: 'CONTRACT_GAP',
            reasonCodes: ['CONTRACT_REQUIREMENT_MISSING'], evidenceRefs: [listing.evidenceRef],
            summary: 'Additional first-party location evidence is required.',
            payload: {
              contractArea: 'MAPPING_EVIDENCE', requestedChange: 'Provide the missing first-party location evidence.',
              sportEvidence: candidatePackage.sportEvidence,
            },
          },
        });
        assert.equal(gap.kind, 'TERMINAL_ACCEPTED', JSON.stringify(gap));
        assert.deepEqual(await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: fixture.sourceId! } }), protectedWorkingSource);
        assert.equal((await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: fixture.jobId } })).status, 'HUMAN_REVIEW_REQUIRED');
        assert.deepEqual(await prisma.organizations.findUniqueOrThrow({ where: { id: fixture.organizationId! } }), protectedOrganization);
        assert.deepEqual(await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: fixture.mappingId! } }), protectedMapping);
        const previousGatewayJob = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: producer.envelope.jobId } });
        const sameEvidenceInput = {
          ...repairInput, jobIds: [fixture.jobId],
          evidenceSelections: repairInput.evidenceSelections.filter((selection) => selection.jobId === fixture.jobId),
        };
        const beforeCurrentContextChange = await previewAffiliateExistingDataRepairAdmission(sameEvidenceInput);
        const addedSport = await prisma.sports.create({ data: { id: `${prefix}-catalog-sport`, name: `${prefix} Catalog Sport` } });
        try {
          const newCatalogPreview = await previewAffiliateExistingDataRepairAdmission(sameEvidenceInput);
          assert.equal(newCatalogPreview.rows[0]?.eligible, true, JSON.stringify(newCatalogPreview.rows));
          assert.notEqual(newCatalogPreview.rows[0]?.gatewayDedupeKey, beforeCurrentContextChange.rows[0]?.gatewayDedupeKey);
        } finally {
          await prisma.sports.delete({ where: { id: addedSport.id } });
        }
        const sourceBeforeContextChange = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: fixture.sourceId! } });
        await prisma.affiliateScrapeSources.update({ where: { id: fixture.sourceId! }, data: { name: 'Updated existing source name' } });
        try {
          const newStatePreview = await previewAffiliateExistingDataRepairAdmission(sameEvidenceInput);
          assert.equal(newStatePreview.rows[0]?.eligible, true, JSON.stringify(newStatePreview.rows));
          assert.notEqual(newStatePreview.rows[0]?.gatewayDedupeKey, beforeCurrentContextChange.rows[0]?.gatewayDedupeKey);
        } finally {
          await prisma.affiliateScrapeSources.update({
            where: { id: fixture.sourceId! }, data: { name: sourceBeforeContextChange.name, updatedAt: sourceBeforeContextChange.updatedAt },
          });
        }
        const nextRunId = `${prefix}-gap-next-run`;
        const scopedMappingJob = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: fixture.jobId } });
        await prisma.affiliateSourceIntakeRuns.create({ data: {
          id: nextRunId, intakeId: fixture.intakeId, supplySourceId: scopedMappingJob.supplySourceId, status: 'SUCCEEDED',
          requestedPageIds: [fixture.pageId, fixture.aboutPageId], capturedPageCount: 2, startedAt: new Date(), finishedAt: new Date(),
        } });
        const earlierArtifacts = await prisma.affiliateSourceIntakeArtifacts.findMany({ where: { runId: fixture.runId } });
        for (const [index, artifact] of earlierArtifacts.entries()) {
          await prisma.affiliateSourceIntakeArtifacts.create({ data: {
            id: `${prefix}-next-artifact-${index}`, dedupeKey: `${prefix}-next-artifact-${index}`,
            intakeId: fixture.intakeId, runId: nextRunId, pageId: artifact.pageId, supplySourceId: scopedMappingJob.supplySourceId,
            kind: artifact.kind, sourceUrl: artifact.sourceUrl, finalUrl: artifact.finalUrl, contentHash: artifact.contentHash,
            fileId: artifact.fileId, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes,
          } });
        }
        const nextRepairInput = {
          prisma, bundle, artifactStore, jobIds: [fixture.jobId], reason: 'Use newly reviewed source evidence after the gap.', operatorId: 'smoke-operator',
          evidenceSelections: [{ jobId: fixture.jobId, runId: nextRunId, pageId: fixture.pageId, supportingPageIds: [fixture.aboutPageId] }],
        };
        const nextRepairPreview = await previewAffiliateExistingDataRepairAdmission(nextRepairInput);
        assert.deepEqual(nextRepairPreview.selectedJobIds, [fixture.jobId], JSON.stringify(nextRepairPreview.rows));
        const nextRepair = await applyAffiliateExistingDataRepairAdmission({ ...nextRepairInput, expectedReportHash: nextRepairPreview.reportHash });
        assert.equal(nextRepair.writeCount, 1);
        assert.notEqual(nextRepair.appliedJobs[0]?.jobId, previousGatewayJob.id);
        assert.deepEqual(await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: previousGatewayJob.id } }), previousGatewayJob);
        break;
      }
      const validated = await gateway.perform({
        kind: 'EXECUTE_COMMAND', idempotencyKey: `${prefix}-${label}-validate`, authorization: authorizationFor(producer),
        command: { type: 'VALIDATE_DECLARATIVE_PACKAGE', data: { candidatePackage, evidenceManifestHash: producer.envelope.evidenceManifest.hash } },
      });
      assert.equal(validated.kind, 'COMMAND_SUCCEEDED', JSON.stringify(validated));
      if (validated.kind !== 'COMMAND_SUCCEEDED') throw new Error('Package validation failed.');
      const packageHash = hashAffiliateAgentValue(candidatePackage);
      if (sourceLabel === 'private' && pass === 1 && repair.kind === 'EXISTING_DATA_REPAIR') {
        await withAffiliateRepairActivityLease(repair.sourceId, async () => {
          await assert.rejects(
            gateway.perform({
              kind: 'EXECUTE_COMMAND', idempotencyKey: `${prefix}-${label}-busy-commit`, authorization: authorizationFor(producer),
              command: { type: 'COMMIT_DECLARATIVE_PACKAGE', data: { validationReceiptId: validated.receiptId, validatedPackageHash: packageHash } },
            }),
            (error: unknown) => error instanceof Error && 'code' in error && error.code === 'LIFECYCLE_TRANSITION_CONFLICT'
              && 'isRetryable' in error && error.isRetryable === true,
          );
        });
        assert.equal(await prisma.affiliateScrapeMappings.count({ where: { sourceId: repair.sourceId } }), 0);
      }
      const committed = await gateway.perform({
        kind: 'EXECUTE_COMMAND', idempotencyKey: `${prefix}-${label}-commit`, authorization: authorizationFor(producer),
        command: { type: 'COMMIT_DECLARATIVE_PACKAGE', data: { validationReceiptId: validated.receiptId, validatedPackageHash: packageHash } },
      });
      assert.equal(committed.kind, 'COMMAND_SUCCEEDED', JSON.stringify(committed));
      if (committed.kind !== 'COMMAND_SUCCEEDED') throw new Error('Package commit failed.');
      const submitted = await gateway.perform({
        kind: 'SUBMIT_RESULT',
        idempotencyKey: `${prefix}-${label}-producer-result`,
        authorization: authorizationFor(producer),
        result: {
          ...affiliateAgentTerminalIdentityFor(producer.envelope),
          disposition: sourceLabel === 'private' && pass === 3
            ? 'PACKAGE_COMMITTED'
            : 'BOUNDED_REPAIR_SUBMITTED',
          reasonCodes: ['SCHEMA_VALIDATED'],
          evidenceRefs: candidatePackage.evidenceRefs,
          summary: 'The stored source package passed deterministic validation.',
          payload: sourceLabel === 'private' && pass === 3
            ? { packageHash, commitReceiptId: committed.receiptId }
            : { repairPass: pass, packageHash, commitReceiptId: committed.receiptId },
        },
      });
      assert.equal(submitted.kind, 'TERMINAL_ACCEPTED', JSON.stringify(submitted));
      const reviewerJob = await prisma.affiliateAgentGatewayJobs.findFirstOrThrow({
        where: { parentClaimId: producer.envelope.claimId, role: 'SUPPLY_REVIEWER' },
      });
      const reviewer = await claim(reviewerJob.id, 'SUPPLY_REVIEWER', `${label}-reviewer`);
      if (reviewer.envelope.subject.type !== 'SUPPLY_REVIEWER') throw new Error('Unexpected reviewer subject.');
      assert.equal(reviewer.envelope.subject.reviewPass, pass);
      const reviewerEvidenceRefs = reviewer.envelope.evidenceManifest.entries
        .map((entry) => entry.evidenceRef)
        .sort();
      const repairIssues = repairDirective?.repairIssues ?? ['EVIDENCE_MISMATCH'];
      assert.equal(new Set(reviewerEvidenceRefs).size, reviewerEvidenceRefs.length);
      assert.ok(reviewerEvidenceRefs.every((ref) => /-[a-f0-9]{16}$/i.test(ref)));
      if (sourceLabel === 'private' && pass <= 2) {
        const rejected = await gateway.perform({
          kind: 'SUBMIT_RESULT',
          idempotencyKey: `${prefix}-${label}-reviewer-repair`,
          authorization: authorizationFor(reviewer),
          result: {
            ...affiliateAgentTerminalIdentityFor(reviewer.envelope),
            disposition: 'PRODUCER_REPAIR_REQUIRED',
            reasonCodes: ['TARGET_INVALID'],
            evidenceRefs: reviewerEvidenceRefs,
            summary: repairDirective?.summary
              ?? 'The source is a club. Repair the provisional rental classification.',
            payload: { committedPackageHash: packageHash, repairIssues },
          },
        });
        assert.equal(rejected.kind, 'TERMINAL_ACCEPTED', JSON.stringify(rejected));
        const child = await prisma.affiliateAgentGatewayJobs.findFirstOrThrow({
          where: { parentClaimId: reviewer.envelope.claimId, role: 'MAPPING_PRODUCER' },
        });
        const childSubject = child.subjectJson as { repairDirective?: { reviewerClaimId: string; reviewerResultHash: string; repairIssues: string[] } };
        assert.deepEqual(childSubject.repairDirective?.repairIssues, repairIssues);
        assert.equal(childSubject.repairDirective?.reviewerClaimId, reviewer.envelope.claimId);
        nextJobId = child.id;
        continue;
      }
      if (sourceLabel === 'private' && pass === 3) {
        await assert.rejects(
          gateway.perform({
            kind: 'SUBMIT_RESULT',
            idempotencyKey: `${prefix}-${label}-reviewer-exhausted`,
            authorization: authorizationFor(reviewer),
            result: {
              ...affiliateAgentTerminalIdentityFor(reviewer.envelope),
              disposition: 'PRODUCER_REPAIR_REQUIRED',
              reasonCodes: ['TARGET_INVALID'],
              evidenceRefs: reviewerEvidenceRefs,
              summary: repairDirective?.summary ?? 'No further producer repair is permitted.',
              payload: { committedPackageHash: packageHash, repairIssues },
            },
          }),
          (error: unknown) => error instanceof Error
            && 'code' in error
            && error.code === 'TERMINAL_DISPOSITION_NOT_PERMITTED',
        );
        assert.equal(
          await prisma.affiliateAgentGatewayJobs.count({
            where: { parentClaimId: reviewer.envelope.claimId, role: 'MAPPING_PRODUCER' },
          }),
          0,
        );
      }
      const approvalResult = affiliateAgentTerminalResultEnvelopeSchema.parse({
        ...affiliateAgentTerminalIdentityFor(reviewer.envelope),
        disposition: 'APPROVED',
        reasonCodes: ['EVIDENCE_VERIFIED'],
        evidenceRefs: reviewerEvidenceRefs,
        summary: 'A separate fixture reviewer verified the exact staged package.',
        payload: { committedPackageHash: packageHash },
      });
      if (approvalResult.role !== 'SUPPLY_REVIEWER' || approvalResult.disposition !== 'APPROVED') {
        throw new Error('Expected an approval fixture.');
      }
      if (sourceLabel === 'working') {
        const pendingId = (await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({
          where: { id: fixture.jobId },
        })).mappingId;
        assert.ok(pendingId);
        const persisted = await prisma.affiliateScrapeMappings.findUniqueOrThrow({
          where: { id: pendingId },
        });
        await prisma.affiliateScrapeMappings.update({
          where: { id: pendingId },
          data: {
            mapping: {
              ...(persisted.mapping as Record<string, unknown>),
              listUrl: 'https://changed.example/unauthorized',
            },
          },
        });
        await assert.rejects(adapters.terminalEffects.APPROVED.execute({
          receiptId: `${prefix}-${label}-altered-mapping-guard`,
          claim: reviewer.envelope,
          result: approvalResult,
        }));
        assert.equal((await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: pendingId } })).validatedAt, null);
        await prisma.affiliateScrapeMappings.update({
          where: { id: pendingId },
          data: { mapping: persisted.mapping ?? Prisma.JsonNull },
        });
      }
      const approvalOperation = {
        kind: 'SUBMIT_RESULT' as const,
        idempotencyKey: `${prefix}-${label}-reviewer-result`,
        authorization: authorizationFor(reviewer),
        result: approvalResult,
      };
      if (sourceLabel === 'private') {
        const execute = jest.spyOn(adapters.terminalEffects.APPROVED, 'execute').mockRejectedValue(new Error('Interrupted before the approval effect.'));
        const recover = jest.spyOn(adapters.terminalEffects.APPROVED, 'recover').mockRejectedValue(new Error('Recovery is temporarily unavailable.'));
        try {
          await assert.rejects(
            gateway.perform(approvalOperation),
            (error: unknown) => error instanceof Error && 'code' in error && error.code === 'PARTIAL_COMMAND_UNRESOLVED',
          );
          clockOffsetMs += 120_000;
          await gateway.reconcile({ limit: 10 });
        } finally {
          execute.mockRestore();
          recover.mockRestore();
        }
        const receipt = await prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
          where: { claimId: reviewer.envelope.claimId, operationKind: 'TERMINAL_EFFECT', status: 'UNKNOWN' },
        });
        assert.equal(await prisma.affiliateSupplyLifecycleTransitions.count({
          where: { supplySourceId: reviewer.envelope.subject.supplySourceId, idempotencyKey: receipt.id },
        }), 0);
        const request = {
          receiptId: receipt.id, jobId: reviewer.envelope.jobId, claimId: reviewer.envelope.claimId,
          supplySourceId: reviewer.envelope.subject.supplySourceId, reason: 'Recover approval before its first lifecycle write.',
        };
        const preview = await recoverAffiliateAgentReviewerEffect(dependencies, { mode: 'PREVIEW', ...request }, { operatorId: 'smoke-recovery-operator' });
        assert.equal(preview.eligible, true, JSON.stringify(preview));
        assert.equal(preview.reasonCodes.includes('LIFECYCLE_ALREADY_RECORDED'), false);
        const recovered = await recoverAffiliateAgentReviewerEffect(
          dependencies, { mode: 'APPLY', ...request, expectedReportHash: preview.reportHash }, { operatorId: 'smoke-recovery-operator' },
        );
        assert.equal(recovered.outcome, 'COMPLETED', JSON.stringify(recovered));
      } else {
        const approved = await gateway.perform(approvalOperation);
        assert.equal(approved.kind, 'TERMINAL_ACCEPTED', JSON.stringify(approved));
      }
      const updatedJob = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: fixture.jobId } });
      const updatedSource = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: updatedJob.sourceId! } });
      const pending = (updatedSource.metadata as Record<string, unknown>).pendingMapping as { mappingId: string; state: string };
      assert.equal(pending.state, 'APPROVED');
      const reviewedMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: pending.mappingId } });
      assert.ok(reviewedMapping.validatedAt);
      assert.equal(reviewedMapping.isActive, false);
      assert.equal(updatedSource.targetKind, 'CLUB');
      assert.equal(updatedSource.activeMappingId, sourceLabel === 'working' ? oldSource.activeMappingId : null);
      assert.equal(updatedSource.autoScrapeEnabled, sourceLabel === 'working');
      assert.equal(await prisma.affiliateSupplyTargets.count({ where: { supplySourceId: updatedJob.supplySourceId! } }), 0);
      if (fixture.organizationId) {
        assert.deepEqual(await prisma.organizations.findUniqueOrThrow({ where: { id: fixture.organizationId } }), protectedOrganization);
      }
      if (fixture.mappingId) {
        assert.deepEqual(await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: fixture.mappingId } }), protectedMapping);
      }
      if (sourceLabel === 'working') {
        const reviewerClaim = await prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
          where: { id: reviewer.envelope.claimId },
        });
        const effectReceipt = await prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
          where: {
            claimId: reviewer.envelope.claimId,
            operationKind: 'TERMINAL_EFFECT',
            status: 'SUCCEEDED',
          },
          orderBy: { createdAt: 'desc' },
        });
        const succeededState = effectReceipt.responseJson as Record<string, unknown>;
        const retainedResult = affiliateAgentTerminalResultEnvelopeSchema.parse(succeededState.result);
        const terminalIdempotencyKey = succeededState.terminalIdempotencyKey as string;
        const terminalRequestHash = succeededState.terminalRequestHash as string;
        assert.ok(reviewerClaim.terminalReceiptId);
        await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await transaction.affiliateAgentGatewayEvents.deleteMany({
          where: {
            claimId: reviewerClaim.id,
            eventType: { in: ['TERMINAL_EFFECT_SUCCEEDED', 'CLAIM_TERMINAL_RESULT_ACCEPTED'] },
          },
        });
        await transaction.affiliateAgentGatewayOperationReceipts.delete({
          where: { id: reviewerClaim.terminalReceiptId! },
        });
        await transaction.affiliateAgentGatewayOperationReceipts.update({
          where: { id: effectReceipt.id },
          data: {
            status: 'UNKNOWN',
            responseHash: null,
            responseJson: {
              kind: 'PENDING',
              result: retainedResult,
              terminalIdempotencyKey,
              terminalRequestHash,
            },
            safeErrorCode: 'PARTIAL_COMMAND_UNRESOLVED',
            completedAt: null,
            reconcileAfter: new Date(),
          },
        });
        await transaction.affiliateAgentGatewayClaims.update({
          where: { id: reviewerClaim.id },
          data: {
            status: 'RECONCILIATION_REQUIRED',
            terminalReceiptId: null,
            endedAt: null,
          },
        });
        await transaction.affiliateAgentGatewayJobs.update({
          where: { id: reviewerJob.id },
          data: {
            status: 'RECONCILIATION_REQUIRED',
            activeClaimId: reviewerClaim.id,
            terminalReceiptId: null,
            finishedAt: null,
          },
        });
        });
        const recoveryRequest = {
          receiptId: effectReceipt.id,
          jobId: reviewerJob.id,
          claimId: reviewerClaim.id,
          supplySourceId: updatedJob.supplySourceId!,
          reason: 'Verify exact existing-data approval recovery.',
        };
        const recoveryPreview = await recoverAffiliateAgentReviewerEffect(
          dependencies,
          { mode: 'PREVIEW', ...recoveryRequest },
          { operatorId: 'smoke-recovery-operator' },
        );
        assert.equal(recoveryPreview.eligible, true, JSON.stringify(recoveryPreview));
        const recoveryMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({
          where: { id: pending.mappingId },
        });
        await prisma.affiliateScrapeMappings.update({
          where: { id: recoveryMapping.id },
          data: {
            mapping: {
              ...(recoveryMapping.mapping as Record<string, unknown>),
              itemSelector: '.changed-card',
            },
          },
        });
        await assert.rejects(
          recoverAffiliateAgentReviewerEffect(
            dependencies,
            {
              mode: 'APPLY',
              ...recoveryRequest,
              expectedReportHash: recoveryPreview.reportHash,
            },
            { operatorId: 'smoke-recovery-operator' },
          ),
          (error: unknown) => error instanceof Error
            && 'code' in error
            && (
              error.code === 'REVIEWER_EFFECT_RECOVERY_NOT_ELIGIBLE'
              || error.code === 'REVIEWER_EFFECT_RECOVERY_STALE'
            ),
        );
        const restoredRecoveryMapping = await prisma.affiliateScrapeMappings.update({
          where: { id: recoveryMapping.id },
          data: { mapping: recoveryMapping.mapping ?? Prisma.JsonNull },
        });
        const recovered = await recoverAffiliateAgentReviewerEffect(
          dependencies,
          {
            mode: 'APPLY',
            ...recoveryRequest,
            expectedReportHash: recoveryPreview.reportHash,
          },
          { operatorId: 'smoke-recovery-operator' },
        );
        assert.ok(
          recovered.outcome === 'COMPLETED' || recovered.outcome === 'REPLAYED',
          JSON.stringify(recovered),
        );
        const recoveryReplay = await recoverAffiliateAgentReviewerEffect(
          dependencies,
          {
            mode: 'APPLY',
            ...recoveryRequest,
            expectedReportHash: recoveryPreview.reportHash,
          },
          { operatorId: 'smoke-recovery-operator' },
        );
        assert.equal(recoveryReplay.replayed, true, JSON.stringify(recoveryReplay));
        assert.deepEqual(
          await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: updatedSource.id } }),
          updatedSource,
        );
        assert.deepEqual(
          await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: recoveryMapping.id } }),
          restoredRecoveryMapping,
        );
      }
      break;
      }
    }
    assert.equal(await prisma.affiliateAgentGatewayClaims.count({ where: { status: 'ACTIVE' } }), 0);
  } finally {
    await cleanRepairFixture(prefix, storageKeys);
    for (const key of storageKeys) await storage.deleteObject({ key });
  }
};

const cleanRepairFixture = async (prefix: string, storageKeys: readonly string[]) => {
  const intakes = await prisma.affiliateSourceIntakes.findMany({
    where: { id: { startsWith: prefix } }, select: { id: true, supplySourceId: true },
  });
  const intakeIds = intakes.map((row) => row.id);
  const roots = await prisma.affiliateSupplySources.findMany({ where: { intakeId: { in: intakeIds } }, select: { id: true } });
  const rootIds = roots.map((row) => row.id);
  const sources = await prisma.affiliateScrapeSources.findMany({
    where: { OR: [{ sourceKey: { startsWith: prefix } }, { supplySourceId: { in: rootIds } }] }, select: { id: true },
  });
  const sourceIds = sources.map((row) => row.id);
  const mappings = await prisma.affiliateScrapeMappings.findMany({ where: { sourceId: { in: sourceIds } }, select: { id: true } });
  const jobs = await prisma.affiliateAgentGatewayJobs.findMany({
    where: { OR: [{ subjectId: { startsWith: prefix } }, { supplySourceId: { in: rootIds } }] }, select: { id: true },
  });
  const jobIds = jobs.map((row) => row.id);
  const claims = await prisma.affiliateAgentGatewayClaims.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
  const alerts = await prisma.affiliateOperationalAlerts.findMany({
    where: { OR: [{ supplySourceId: { in: rootIds } }, { rolloutCohort: prefix }] }, select: { id: true },
  });
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await transaction.affiliateOperationalAlertDeliveries.deleteMany({ where: { alertId: { in: alerts.map((row) => row.id) } } });
    await transaction.affiliateOperationalAlerts.deleteMany({ where: { id: { in: alerts.map((row) => row.id) } } });
    await transaction.affiliateAgentGatewayEvents.deleteMany({ where: { jobId: { in: jobIds } } });
    await transaction.affiliateAgentGatewayOperationReceipts.deleteMany({ where: { jobId: { in: jobIds } } });
    await transaction.affiliateAgentGatewayArtifacts.deleteMany({ where: { claimId: { in: claims.map((row) => row.id) } } });
    await transaction.affiliateAgentGatewayClaims.deleteMany({ where: { jobId: { in: jobIds } } });
    await transaction.affiliateAgentGatewayJobs.deleteMany({ where: { id: { in: jobIds } } });
    await transaction.affiliateApprovalJobs.deleteMany({ where: { OR: [{ supplySourceId: { in: rootIds } }, { subjectKey: { in: mappings.map((row) => row.id) } }] } });
    await transaction.affiliateSupplyLifecycleTransitions.deleteMany({ where: { supplySourceId: { in: rootIds } } });
    await transaction.affiliateSupplyTargets.deleteMany({ where: { supplySourceId: { in: rootIds } } });
    await transaction.affiliateImportCandidates.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await transaction.affiliateScrapeRuns.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await transaction.affiliateScrapeMappings.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await transaction.affiliateSourceMappingJobs.deleteMany({ where: { intakeId: { in: intakeIds } } });
    await transaction.affiliateSourceIntakeArtifacts.deleteMany({ where: { intakeId: { in: intakeIds } } });
    await transaction.affiliateSourceIntakeRuns.deleteMany({ where: { intakeId: { in: intakeIds } } });
    await transaction.affiliateSourceIntakePages.deleteMany({ where: { intakeId: { in: intakeIds } } });
    await transaction.affiliateSourceIntakes.deleteMany({ where: { id: { in: intakeIds } } });
    await transaction.affiliateScrapeSources.deleteMany({ where: { id: { in: sourceIds } } });
    await transaction.affiliateSupplySources.deleteMany({ where: { id: { in: rootIds } } });
    await transaction.organizations.deleteMany({ where: { id: { startsWith: prefix } } });
    await transaction.affiliateSourceDomainPolicies.deleteMany({ where: { id: { startsWith: prefix } } });
    await transaction.affiliateSupplyContractManifests.deleteMany({ where: { rolloutCohort: prefix } });
    await transaction.file.deleteMany({ where: { path: { in: [...storageKeys] } } });
  });
};

const describeDatabase = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
const databaseName = process.env.AFFILIATE_TEST_DATABASE_NAME ?? 'bracketiq_e2e_70_existing_repair';
describeDatabase('existing-data repair PostgreSQL lifecycle', () => {
  let storageRoot: string;
  const priorStorageRoot = process.env.STORAGE_ROOT;
  const priorProvider = process.env.STORAGE_PROVIDER;
  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'bracketiq-existing-repair-smoke-'));
    process.env.STORAGE_ROOT = storageRoot;
    process.env.STORAGE_PROVIDER = 'local';
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
    if (priorStorageRoot === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = priorStorageRoot;
    if (priorProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = priorProvider;
  });
  it('repairs a provisional kind through review while preserving working supply on approval and evidence gaps', exerciseExistingRepair, 60_000);
});
