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
  previewAffiliateExistingDataRepairCorrection,
  applyAffiliateExistingDataRepairCorrection,
  assertAffiliateExistingDataRepairClaimBinding,
} from '../affiliateExistingDataRepairAdmission';
import {
  previewAffiliateExistingRepairCapture,
  applyAffiliateExistingRepairCapture,
  processAffiliateExistingRepairCapture,
} from '../affiliateExistingDataRepairCapture';
import {
  ensureAffiliateIntakeSupplySource,
  processNextAffiliateSourceIntakeRun,
  queueAffiliateSourceIntakeRun,
  recoverStaleAffiliateSourceIntakeRuns,
  reviewAffiliateSourceIntakePolicy,
  type AffiliateExistingDataRepairEvidenceOnlyMarker,
} from '../sourceIntake';
import { tryLockAffiliateRepairWrites, withAffiliateRepairActivityLease } from '../affiliateRepairActivityLease';
import { assertAffiliatePendingRepairClear, AffiliatePendingRepairHoldError } from '../affiliatePendingRepairGuard';
import { captureAffiliateExistingRepairSourceState } from '../affiliateExistingDataRepairState';
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
    const url = `https://${prefix}.test/${label}`;
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
          ['PAGE_HTML', 'text/html', '<main><h1>Harbor Court Club</h1><p>We offer indoor volleyball on our hardwood courts.</p><a href=\"/register\">Register or book court time</a></main>'],
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
    const workingIdentity = normalizeAffiliateSupplyIdentity({ requestedUrl: `https://${prefix}.test/working` });
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
    const createHeldIdentityFixture = async (
      label: string,
      pageUrl: string,
      heldUrl = pageUrl,
    ) => {
      const heldIntakeId = `${prefix}-${label}-intake`;
      const heldPageId = `${prefix}-${label}-page`;
      const heldSourceId = `${prefix}-${label}-source`;
      const heldRootId = `${prefix}-${label}-root`;
      const intake = await prisma.affiliateSourceIntakes.create({
        data: {
          id: heldIntakeId,
          name: `Repair smoke ${label}`,
          sourceKey: `${prefix}-${label}`,
          baseUrl: pageUrl,
          status: 'REVIEW_REQUIRED',
          complianceStatus: 'ALLOWED',
          targetKindHints: [],
        },
      });
      const page = await prisma.affiliateSourceIntakePages.create({
        data: {
          id: heldPageId,
          intakeId: intake.id,
          url: pageUrl,
          canonicalUrl: pageUrl,
          urlKey: `${prefix}-${label}-url`,
          role: 'LISTING',
          status: 'ACTIVE',
          robotsStatus: 'ALLOWED',
        },
      });
      const identity = normalizeAffiliateSupplyIdentity({ requestedUrl: heldUrl });
      const root = await prisma.affiliateSupplySources.create({
        data: {
          id: heldRootId,
          intakeId: intake.id,
          rolloutCohort,
          canonicalUrl: identity.canonicalUrl,
          identityKey: identity.identityKey,
          origin: identity.origin,
          pathKey: identity.pathKey,
          targetKind: 'CLUB',
        },
      });
      const source = await prisma.affiliateScrapeSources.create({
        data: {
          id: heldSourceId,
          sourceKey: `${prefix}-${label}-live-source`,
          name: `Repair smoke ${label} live source`,
          listUrl: heldUrl,
          baseUrl: heldUrl,
          targetKind: 'CLUB',
          supplySourceId: root.id,
          autoScrapeEnabled: false,
        },
      });
      const hold = {
        schemaVersion: 1,
        sourceId: source.id,
        supplySourceId: root.id,
        mappingJobId: `${prefix}-${label}-mapping-job`,
        admissionHash: 'c'.repeat(64),
        priorPendingMappingHash: 'd'.repeat(64),
      };
      await prisma.affiliateSupplySources.update({
        where: { id: root.id },
        data: {
          liveSourceId: source.id,
          metadata: { existingDataRepairCorrectionHold: hold },
        },
      });
      await prisma.affiliateScrapeSources.update({
        where: { id: source.id },
        data: { metadata: { existingDataRepairCorrectionHold: hold } },
      });
      return {
        intake,
        page,
        root: await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id: root.id } }),
        source: await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: source.id } }),
        heldUrl,
      };
    };
    const urlHeld = await createHeldIdentityFixture(
      'url-held',
      `https://${prefix}.test/url-held`,
    );
    const urlHeldPageBefore = await prisma.affiliateSourceIntakePages.findUniqueOrThrow({
      where: { id: urlHeld.page.id },
    });
    const urlHeldIntakeBefore = await prisma.affiliateSourceIntakes.findUniqueOrThrow({
      where: { id: urlHeld.intake.id },
    });
    const urlHeldRootBefore = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: urlHeld.root.id },
    });
    const urlHeldRunCount = await prisma.affiliateSourceIntakeRuns.count({
      where: { intakeId: urlHeld.intake.id },
    });
    await assert.rejects(
      queueAffiliateSourceIntakeRun(urlHeld.intake.id, [urlHeld.page.id], 'ordinary-url-held', { db: prisma }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'GOVERNED_CAPTURE_OWNERSHIP_CONFLICT',
    );
    assert.equal(
      await prisma.affiliateSourceIntakeRuns.count({ where: { intakeId: urlHeld.intake.id } }),
      urlHeldRunCount,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakePages.findUniqueOrThrow({ where: { id: urlHeld.page.id } }),
      urlHeldPageBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: urlHeld.intake.id } }),
      urlHeldIntakeBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id: urlHeld.root.id } }),
      urlHeldRootBefore,
    );
    const pathHeld = await createHeldIdentityFixture(
      'path-held',
      `https://${prefix}.test/events?candidate=1`,
      `https://${prefix}.test/events?held=1`,
    );
    const pathHeldPageBefore = await prisma.affiliateSourceIntakePages.findUniqueOrThrow({
      where: { id: pathHeld.page.id },
    });
    const pathHeldIntakeBefore = await prisma.affiliateSourceIntakes.findUniqueOrThrow({
      where: { id: pathHeld.intake.id },
    });
    const pathHeldRootBefore = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: pathHeld.root.id },
    });
    const pathHeldSourceBefore = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: pathHeld.source.id },
    });
    const pathHeldArtifactAssociationsBefore = await prisma.affiliateSourceIntakeArtifacts.findMany({
      where: { intakeId: pathHeld.intake.id },
      select: { id: true, supplySourceId: true, pageId: true },
    });
    const pathHeldTargetCountBefore = await prisma.affiliateSupplyTargets.count({
      where: { supplySourceId: pathHeld.root.id },
    });
    const pathHeldRunCount = await prisma.affiliateSourceIntakeRuns.count({
      where: { intakeId: pathHeld.intake.id },
    });
    await assert.rejects(
      queueAffiliateSourceIntakeRun(pathHeld.intake.id, [pathHeld.page.id], 'ordinary-path-held', { db: prisma }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'GOVERNED_CAPTURE_OWNERSHIP_CONFLICT',
    );
    assert.equal(
      await prisma.affiliateSourceIntakeRuns.count({ where: { intakeId: pathHeld.intake.id } }),
      pathHeldRunCount,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakePages.findUniqueOrThrow({ where: { id: pathHeld.page.id } }),
      pathHeldPageBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: pathHeld.intake.id } }),
      pathHeldIntakeBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id: pathHeld.root.id } }),
      pathHeldRootBefore,
    );
    assert.deepEqual(
      await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: pathHeld.source.id } }),
      pathHeldSourceBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakeArtifacts.findMany({
        where: { intakeId: pathHeld.intake.id },
        select: { id: true, supplySourceId: true, pageId: true },
      }),
      pathHeldArtifactAssociationsBefore,
    );
    assert.equal(
      await prisma.affiliateSupplyTargets.count({ where: { supplySourceId: pathHeld.root.id } }),
      pathHeldTargetCountBefore,
    );
    const redirectHeld = await createHeldIdentityFixture(
      'redirect-held',
      `https://${prefix}.test/redirect-source`,
      `https://${prefix}.test/redirect-target`,
    );
    const redirectIntakeBefore = await prisma.affiliateSourceIntakes.findUniqueOrThrow({
      where: { id: redirectHeld.intake.id },
    });
    const redirectPageBefore = await prisma.affiliateSourceIntakePages.findUniqueOrThrow({
      where: { id: redirectHeld.page.id },
    });
    const redirectRootBefore = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: redirectHeld.root.id },
    });
    const redirectSourceBefore = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: redirectHeld.source.id },
    });
    const redirectArtifactAssociationsBefore = await prisma.affiliateSourceIntakeArtifacts.findMany({
      where: { intakeId: redirectHeld.intake.id },
      select: { id: true, supplySourceId: true, pageId: true },
    });
    const redirectTargetCountBefore = await prisma.affiliateSupplyTargets.count({
      where: { supplySourceId: redirectHeld.root.id },
    });
    await assert.rejects(
      ensureAffiliateIntakeSupplySource({
        intakeId: redirectHeld.intake.id,
        pageId: redirectHeld.page.id,
        pageUrl: redirectHeld.heldUrl,
        isRedirectVerified: true,
        db: prisma,
      }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'GOVERNED_CAPTURE_OWNERSHIP_CONFLICT',
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakes.findUniqueOrThrow({ where: { id: redirectHeld.intake.id } }),
      redirectIntakeBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakePages.findUniqueOrThrow({ where: { id: redirectHeld.page.id } }),
      redirectPageBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id: redirectHeld.root.id } }),
      redirectRootBefore,
    );
    assert.deepEqual(
      await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: redirectHeld.source.id } }),
      redirectSourceBefore,
    );
    assert.deepEqual(
      await prisma.affiliateSourceIntakeArtifacts.findMany({
        where: { intakeId: redirectHeld.intake.id },
        select: { id: true, supplySourceId: true, pageId: true },
      }),
      redirectArtifactAssociationsBefore,
    );
    assert.equal(
      await prisma.affiliateSupplyTargets.count({ where: { supplySourceId: redirectHeld.root.id } }),
      redirectTargetCountBefore,
    );
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
    const projectedUrl = `https://${prefix}.test/public-projection`;
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
    const policyKey = affiliateDiscoveryPolicyKeyForUrl(`https://${prefix}.test/private`);
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
    let activeBundle = bundle;
    const contracts = { loadActiveBundle: async () => activeBundle };
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
          { field: 'title', selector: 'h1', mode: 'TEXT', attribute: null, transform: 'TRIM' },
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

    const queuedFixture = await seed('correction-queued');
    const queuedInput = {
      ...repairInput,
      jobIds: [queuedFixture.jobId],
      evidenceSelections: [{ jobId: queuedFixture.jobId, runId: queuedFixture.runId, pageId: queuedFixture.pageId }],
    };
    const queuedPreview = await previewAffiliateExistingDataRepairAdmission(queuedInput);
    const queuedAdmission = await applyAffiliateExistingDataRepairAdmission({
      ...queuedInput, expectedReportHash: queuedPreview.reportHash,
    });
    assert.equal(queuedAdmission.appliedJobs.length, 1, JSON.stringify(queuedAdmission));
    const oldQueuedJob = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
      where: { id: queuedAdmission.appliedJobs[0].jobId },
    });
    const approvedSource = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: publicSource.sourceId! } });
    const approvedJob = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: publicSource.jobId } });
    const approvedRoot = await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id: approvedJob.supplySourceId! } });
    const oldPendingMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: approvedJob.mappingId! } });
    const correctionWorkingMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: oldMapping.id } });
    const oldCompletedJobs = await prisma.affiliateAgentGatewayJobs.findMany({
      where: { supplySourceId: approvedRoot.id, status: 'COMPLETED' }, orderBy: { id: 'asc' },
    });
    const protectedState = await captureAffiliateExistingRepairSourceState(prisma, approvedSource.id);
    const articleRunId = `${prefix}-correction-article-run`;
    await prisma.affiliateSourceIntakeRuns.create({ data: {
      id: articleRunId, intakeId: publicSource.intakeId, supplySourceId: approvedRoot.id,
      requestedPageIds: [publicSource.pageId], status: 'SUCCEEDED', capturedPageCount: 1,
      startedAt: new Date(), finishedAt: new Date(),
    } });
    for (const [kind, mimeType, body] of [
      ['PAGE_HTML', 'text/html', '<meta property="og:type" content="article"><article><h1>Four colleges add club teams</h1><p>We offer indoor volleyball on our hardwood courts.</p><a href="/news/another-story">Read another story</a></article>'],
      ['PAGE_MARKDOWN', 'text/markdown', 'Four colleges add club teams. We offer indoor volleyball on our hardwood courts.'],
    ]) {
      const artifactId = `${articleRunId}-${kind}`;
      const bytes = Buffer.from(body);
      const stored = await storage.putObject({ data: bytes, originalName: `${kind}.txt`, contentType: mimeType, key: `${prefix}/${artifactId}` });
      const fileId = `${artifactId}-file`;
      await prisma.file.create({ data: { id: fileId, originalName: `${kind}.txt`, mimeType, sizeBytes: bytes.length, path: stored.key } });
      await prisma.affiliateSourceIntakeArtifacts.create({ data: {
        id: artifactId, intakeId: publicSource.intakeId, pageId: publicSource.pageId, runId: articleRunId,
        supplySourceId: approvedRoot.id, kind, sourceUrl: workingIdentity.canonicalUrl, finalUrl: workingIdentity.canonicalUrl,
        contentHash: createHash('sha256').update(bytes).digest('hex'), dedupeKey: artifactId, fileId, mimeType, sizeBytes: bytes.length,
      } });
    }
    const correctionDeployment = { ...deployment, version: 11 };
    activeBundle = affiliateAgentContractBundleSchema.parse({
      ...bundle, deploymentContract: { ...correctionDeployment, hash: hashAffiliateAgentValue(correctionDeployment) },
    });
    const correctionInput = {
      prisma, artifactStore, bundle: activeBundle, operatorId: 'smoke-correction-operator',
      reason: 'Recheck entity and official action evidence under the current contract.',
      jobIds: [publicSource.jobId, privateSource.jobId, queuedFixture.jobId],
      evidenceSelections: [
        { jobId: publicSource.jobId, runId: articleRunId, pageId: publicSource.pageId },
        { jobId: privateSource.jobId, runId: privateSource.runId, pageId: privateSource.pageId },
        { jobId: queuedFixture.jobId, runId: queuedFixture.runId, pageId: queuedFixture.pageId },
      ],
    };
    const correctionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
    assert.equal(correctionPreview.counts.selected, 3, JSON.stringify(correctionPreview.rows.map(({ mappingJobId, reasonCodes }) => ({ mappingJobId, reasonCodes }))));
    assert.equal(correctionPreview.writeCount, 0);
    const leaseCaptureInput = {
      ...captureInput,
      bundle: activeBundle,
      targets: [{ intakeId: captureSource.intakeId, pageIds: [captureSource.pageId] }],
      reason: 'Queue a governed evidence-only run before correction apply.',
      operatorId: 'smoke-lease-operator',
    };
    const leaseCapturePreview = await previewAffiliateExistingRepairCapture(leaseCaptureInput);
    assert.equal(leaseCapturePreview.rows[0]?.eligible, true, JSON.stringify(leaseCapturePreview.rows));
    const leaseCaptureApplied = await applyAffiliateExistingRepairCapture({
      ...leaseCaptureInput,
      expectedReportHash: leaseCapturePreview.reportHash,
    });
    assert.equal(leaseCaptureApplied.writeCount, 1, JSON.stringify(leaseCaptureApplied));
    const leaseRunId = leaseCaptureApplied.runIds[0];
    assert.ok(leaseRunId);
    const leaseRun = await prisma.affiliateSourceIntakeRuns.findUniqueOrThrow({ where: { id: leaseRunId } });
    const leaseMarker = (
      (leaseRun.summary as Record<string, unknown>).existingDataRepairEvidenceOnly
    ) as AffiliateExistingDataRepairEvidenceOnlyMarker;
    let markLeaseVerification!: () => void;
    let releaseLeaseVerification!: () => void;
    const leaseVerificationReached = new Promise<void>((resolve) => { markLeaseVerification = resolve; });
    const leaseVerificationRelease = new Promise<void>((resolve) => { releaseLeaseVerification = resolve; });
    const leaseProcess = processNextAffiliateSourceIntakeRun({
      runId: leaseRunId,
      workerId: 'smoke-lease-worker',
      governedProcessIntent: {
        purpose: 'EXISTING_DATA_REPAIR_EVIDENCE_ONLY',
        operatorId: leaseMarker.operatorId,
        markerSha256: hashAffiliateAgentValue(leaseMarker),
        verifyAfterClaim: async () => {
          markLeaseVerification();
          await leaseVerificationRelease;
          throw new Error('controlled before provider access');
        },
      },
    });
    await leaseVerificationReached;
    const correctionGatewayCountBeforeActivity = await prisma.affiliateAgentGatewayJobs.count();
    await assert.rejects(
      applyAffiliateExistingDataRepairCorrection({
        ...correctionInput,
        expectedReportHash: correctionPreview.reportHash,
      }),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'ACTIVE_SOURCE_ACTIVITY',
    );
    assert.equal(await prisma.affiliateAgentGatewayJobs.count(), correctionGatewayCountBeforeActivity);
    releaseLeaseVerification();
    const leaseTerminalResult = await leaseProcess;
    assert.ok(leaseTerminalResult);
    assert.equal(leaseTerminalResult.status, 'FAILED', JSON.stringify(leaseTerminalResult));
    assert.match(leaseTerminalResult.errorMessage ?? '', /controlled before provider access/);
    assert.equal(await prisma.$transaction((transaction) => tryLockAffiliateRepairWrites(transaction)), true);
    const reverseSourceId = `${prefix}-reverse-source`;
    const reversePage = await prisma.affiliateSourceIntakePages.findUniqueOrThrow({
      where: { id: captureSource.pageId },
    });
    await prisma.affiliateSupplySources.update({
      where: { id: reversePage.supplySourceId! },
      data: { liveSourceId: null, metadata: Prisma.JsonNull },
    });
    const reverseRoot = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: reversePage.supplySourceId! },
    });
    assert.equal(reverseRoot.liveSourceId, null);
    const reverseSource = await prisma.affiliateScrapeSources.create({
      data: {
        id: reverseSourceId,
        sourceKey: `${prefix}-capture`,
        name: 'Reverse-link source',
        listUrl: reversePage.canonicalUrl!,
        baseUrl: reversePage.canonicalUrl!,
        targetKind: 'CLUB',
        supplySourceId: reverseRoot.id,
        autoScrapeEnabled: false,
      },
    });
    const ordinaryReverseRun = await queueAffiliateSourceIntakeRun(
      captureSource.intakeId,
      [captureSource.pageId],
      'smoke-reverse-operator',
      { db: prisma },
    );
    const reverseHold = {
      schemaVersion: 1,
      sourceId: reverseSource.id,
      supplySourceId: reverseRoot.id,
      mappingJobId: `${prefix}-reverse-hold-job`,
      admissionHash: 'a'.repeat(64),
      priorPendingMappingHash: 'b'.repeat(64),
    };
    const reverseSourceHeld = await prisma.affiliateScrapeSources.update({
      where: { id: reverseSource.id },
      data: { metadata: { existingDataRepairCorrectionHold: reverseHold } },
    });
    const reverseSourceCount = await prisma.affiliateScrapeSources.count({
      where: { id: reverseSource.id },
    });
    const reverseArtifactCount = await prisma.affiliateSourceIntakeArtifacts.count({
      where: { intakeId: captureSource.intakeId },
    });
    const reverseMappingJobCount = await prisma.affiliateSourceMappingJobs.count({
      where: { intakeId: captureSource.intakeId },
    });
    const blockedReverseRun = await processNextAffiliateSourceIntakeRun({
      runId: ordinaryReverseRun.id,
      workerId: 'smoke-reverse-worker',
    });
    assert.equal(blockedReverseRun?.status, 'BLOCKED', JSON.stringify(blockedReverseRun));
    assert.equal(await prisma.affiliateScrapeSources.count({ where: { id: reverseSource.id } }), reverseSourceCount);
    assert.equal(
      await prisma.affiliateSourceIntakeArtifacts.count({ where: { intakeId: captureSource.intakeId } }),
      reverseArtifactCount,
    );
    assert.equal(
      await prisma.affiliateSourceMappingJobs.count({ where: { intakeId: captureSource.intakeId } }),
      reverseMappingJobCount,
    );
    assert.deepEqual(
      await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: reverseSource.id } }),
      reverseSourceHeld,
    );
    const limitedCorrectionPreview = await previewAffiliateExistingDataRepairCorrection({
      ...correctionInput,
      limit: 1,
    });
    assert.equal(limitedCorrectionPreview.counts.selected, 1, JSON.stringify(limitedCorrectionPreview.rows));
    assert.equal(limitedCorrectionPreview.selectedJobIds.length, 1);
    assert.equal(limitedCorrectionPreview.proposedWrites.length, 1);
    assert.equal(
      limitedCorrectionPreview.rows.filter((row) => row.reasonCodes.includes('SELECTION_LIMIT_EXCLUDED')).length,
      2,
      JSON.stringify(limitedCorrectionPreview.rows),
    );
    const queuedIntakeBeforeCorrection = await prisma.affiliateSourceIntakes.findUniqueOrThrow({
      where: { id: queuedFixture.intakeId },
    });
    await prisma.affiliateSourceIntakes.update({
      where: { id: queuedFixture.intakeId },
      data: { complianceStatus: 'BLOCKED' },
    });
    try {
      const mixedCorrectionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      assert.equal(mixedCorrectionPreview.counts.selected, 2, JSON.stringify(mixedCorrectionPreview.rows));
      assert.deepEqual(mixedCorrectionPreview.selectedJobIds, [privateSource.jobId, publicSource.jobId].sort());
      const heldQueuedRow = mixedCorrectionPreview.rows.find((row) => row.mappingJobId === queuedFixture.jobId);
      assert.equal(heldQueuedRow?.eligible, false, JSON.stringify(mixedCorrectionPreview.rows));
      assert.ok(heldQueuedRow?.reasonCodes.includes('SOURCE_POLICY_NOT_ALLOWED'), JSON.stringify(mixedCorrectionPreview.rows));
    } finally {
      await prisma.affiliateSourceIntakes.update({
        where: { id: queuedFixture.intakeId },
        data: { complianceStatus: queuedIntakeBeforeCorrection.complianceStatus, updatedAt: queuedIntakeBeforeCorrection.updatedAt },
      });
    }
    const activeCorrectionRunId = `${prefix}-correction-active-run`;
    await prisma.affiliateSourceIntakeRuns.create({
      data: {
        id: activeCorrectionRunId,
        intakeId: publicSource.intakeId,
        requestedPageIds: [publicSource.pageId],
        status: 'QUEUED',
      },
    });
    try {
      const activeRunCorrectionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const activeRunRow = activeRunCorrectionPreview.rows.find((row) => row.mappingJobId === publicSource.jobId);
      assert.equal(activeRunRow?.eligible, false, JSON.stringify(activeRunCorrectionPreview.rows));
      assert.ok(activeRunRow?.reasonCodes.includes('ACTIVE_INTAKE_RUN_PRESENT'), JSON.stringify(activeRunCorrectionPreview.rows));
    } finally {
      await prisma.affiliateSourceIntakeRuns.delete({ where: { id: activeCorrectionRunId } });
    }
    const mappingBeforeCorrectionProof = await prisma.affiliateScrapeMappings.findUniqueOrThrow({
      where: { id: oldPendingMapping.id },
    });
    await prisma.affiliateScrapeMappings.update({
      where: { id: oldPendingMapping.id },
      data: {
        mapping: {
          ...(mappingBeforeCorrectionProof.mapping as Record<string, unknown>),
          itemSelector: '.correction-proof-drift',
        },
      },
    });
    try {
      const mappingProofCorrectionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const mappingProofRow = mappingProofCorrectionPreview.rows.find((row) => row.mappingJobId === publicSource.jobId);
      assert.equal(mappingProofRow?.eligible, false, JSON.stringify(mappingProofCorrectionPreview.rows));
      assert.ok(mappingProofRow?.reasonCodes.includes('PRIOR_PENDING_MAPPING_PROOF_INVALID'), JSON.stringify(mappingProofCorrectionPreview.rows));
    } finally {
      await prisma.affiliateScrapeMappings.update({
        where: { id: oldPendingMapping.id },
        data: { mapping: mappingBeforeCorrectionProof.mapping ?? Prisma.JsonNull, updatedAt: mappingBeforeCorrectionProof.updatedAt },
      });
    }
    const rootBeforeCorrectionIdentity = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: approvedRoot.id },
    });
    await prisma.affiliateSupplySources.update({
      where: { id: approvedRoot.id },
      data: { canonicalUrl: `${rootBeforeCorrectionIdentity.canonicalUrl}/changed`, updatedAt: rootBeforeCorrectionIdentity.updatedAt },
    });
    try {
      const rootIdentityCorrectionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const rootIdentityRow = rootIdentityCorrectionPreview.rows.find((row) => row.mappingJobId === publicSource.jobId);
      assert.equal(rootIdentityRow?.eligible, false, JSON.stringify(rootIdentityCorrectionPreview.rows));
      assert.ok(rootIdentityRow?.reasonCodes.includes('ROOT_CANONICAL_URL_CONFLICT'), JSON.stringify(rootIdentityCorrectionPreview.rows));
    } finally {
      await prisma.affiliateSupplySources.update({
        where: { id: approvedRoot.id },
        data: {
          canonicalUrl: rootBeforeCorrectionIdentity.canonicalUrl,
          updatedAt: rootBeforeCorrectionIdentity.updatedAt,
        },
      });
    }
    const sourceBeforeCorrectionContext = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: approvedSource.id },
    });
    const sourceContextBeforeCorrection = sourceBeforeCorrectionContext.metadata as Record<string, unknown>;
    const priorContextBeforeCorrection = sourceContextBeforeCorrection.existingDataRepair as Record<string, unknown>;
    await prisma.affiliateScrapeSources.update({
      where: { id: approvedSource.id },
      data: {
        metadata: {
          ...sourceContextBeforeCorrection,
          existingDataRepair: { ...priorContextBeforeCorrection, evidenceRunId: `${prefix}-tampered-prior-run` },
        } as Prisma.InputJsonValue,
      },
    });
    try {
      const contextCorrectionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const contextRow = contextCorrectionPreview.rows.find((row) => row.mappingJobId === publicSource.jobId);
      assert.equal(contextRow?.eligible, false, JSON.stringify(contextCorrectionPreview.rows));
      assert.ok(
        contextRow?.reasonCodes.includes('PRIOR_REPAIR_CONTEXT_CONFLICT')
          || contextRow?.reasonCodes.includes('PRIOR_REPAIR_CONTEXT_INVALID'),
        JSON.stringify(contextCorrectionPreview.rows),
      );
    } finally {
      await prisma.affiliateScrapeSources.update({
        where: { id: approvedSource.id },
        data: { metadata: sourceBeforeCorrectionContext.metadata ?? Prisma.JsonNull, updatedAt: sourceBeforeCorrectionContext.updatedAt },
      });
    }
    const rootBeforeCorrectionAudit = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: approvedRoot.id },
    });
    const rootMetadataBeforeCorrectionAudit = rootBeforeCorrectionAudit.metadata as Record<string, unknown>;
    await prisma.affiliateSupplySources.update({
      where: { id: approvedRoot.id },
      data: {
        metadata: {
          ...rootMetadataBeforeCorrectionAudit,
          existingDataRepairAdmission: null,
        } as Prisma.InputJsonValue,
      },
    });
    try {
      const auditCorrectionPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const auditRow = auditCorrectionPreview.rows.find((row) => row.mappingJobId === publicSource.jobId);
      assert.equal(auditRow?.eligible, false, JSON.stringify(auditCorrectionPreview.rows));
      assert.ok(auditRow?.reasonCodes.includes('PRIOR_ADMISSION_AUDIT_MISSING'), JSON.stringify(auditCorrectionPreview.rows));
    } finally {
      await prisma.affiliateSupplySources.update({
        where: { id: approvedRoot.id },
        data: {
          metadata: rootBeforeCorrectionAudit.metadata ?? Prisma.JsonNull,
          updatedAt: rootBeforeCorrectionAudit.updatedAt,
        },
      });
    }
    const sourceBeforeCrossRootPointer = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: approvedSource.id },
    });
    const rootBeforeCrossRootPointer = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: approvedRoot.id },
    });
    const sourceCrossRootMetadata = sourceBeforeCrossRootPointer.metadata as Record<string, unknown>;
    const rootCrossRootMetadata = rootBeforeCrossRootPointer.metadata as Record<string, unknown>;
    const crossRootPending = {
      ...(sourceCrossRootMetadata.pendingMapping as Record<string, unknown>),
      producerJobId: oldQueuedJob.id,
    };
    await prisma.affiliateScrapeSources.update({
      where: { id: approvedSource.id },
      data: {
        metadata: { ...sourceCrossRootMetadata, pendingMapping: crossRootPending } as Prisma.InputJsonValue,
      },
    });
    await prisma.affiliateSupplySources.update({
      where: { id: approvedRoot.id },
      data: {
        metadata: {
          ...rootCrossRootMetadata,
          pendingMapping: { ...(rootCrossRootMetadata.pendingMapping as Record<string, unknown>), producerJobId: oldQueuedJob.id },
        } as Prisma.InputJsonValue,
      },
    });
    try {
      const crossRootPointerPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const crossRootPointerRow = crossRootPointerPreview.rows.find((row) => row.mappingJobId === publicSource.jobId);
      assert.equal(crossRootPointerRow?.eligible, false, JSON.stringify(crossRootPointerPreview.rows));
      assert.ok(
        crossRootPointerRow?.reasonCodes.includes('PENDING_GATEWAY_POINTER_IDENTITY_CONFLICT'),
        JSON.stringify(crossRootPointerPreview.rows),
      );
      assert.deepEqual(
        await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: oldQueuedJob.id } }),
        oldQueuedJob,
      );
    } finally {
      await prisma.affiliateScrapeSources.update({
        where: { id: approvedSource.id },
        data: { metadata: sourceBeforeCrossRootPointer.metadata ?? Prisma.JsonNull, updatedAt: sourceBeforeCrossRootPointer.updatedAt },
      });
      await prisma.affiliateSupplySources.update({
        where: { id: approvedRoot.id },
        data: { metadata: rootBeforeCrossRootPointer.metadata ?? Prisma.JsonNull, updatedAt: rootBeforeCrossRootPointer.updatedAt },
      });
    }
    assert.deepEqual(await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: approvedSource.id } }), approvedSource);
    assert.deepEqual(await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: oldQueuedJob.id } }), oldQueuedJob);
    const oldSourceMetadata = approvedSource.metadata as Record<string, unknown>;
    await prisma.affiliateScrapeSources.update({
      where: { id: approvedSource.id },
      data: { metadata: { ...oldSourceMetadata, pendingMapping: { ...(oldSourceMetadata.pendingMapping as Record<string, unknown>), state: 'STAGED' } } as Prisma.InputJsonValue },
    });
    try {
      await assert.rejects(
        applyAffiliateExistingDataRepairCorrection({ ...correctionInput, expectedReportHash: correctionPreview.reportHash }),
        (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ADMISSION_REPORT_DRIFT',
      );
      assert.deepEqual(await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: oldQueuedJob.id } }), oldQueuedJob);
    } finally {
      await prisma.affiliateScrapeSources.update({
        where: { id: approvedSource.id }, data: { metadata: approvedSource.metadata ?? Prisma.JsonNull, updatedAt: approvedSource.updatedAt },
      });
    }
    const intakeIdentityBeforeCorrection = await prisma.affiliateSourceIntakes.findUniqueOrThrow({
      where: { id: publicSource.intakeId },
    });
    await prisma.affiliateSourceIntakes.update({
      where: { id: publicSource.intakeId },
      data: { affiliateSourceId: null },
    });
    try {
      const intakeIdentityPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const intakeIdentityRow = intakeIdentityPreview.rows.find((row) => row.mappingJobId === approvedJob.id);
      assert.equal(intakeIdentityRow?.eligible, false, JSON.stringify(intakeIdentityPreview.rows));
      assert.ok(
        intakeIdentityRow?.reasonCodes.includes('INTAKE_SOURCE_IDENTITY_CONFLICT'),
        JSON.stringify(intakeIdentityPreview.rows),
      );
    } finally {
      await prisma.affiliateSourceIntakes.update({
        where: { id: publicSource.intakeId },
        data: {
          affiliateSourceId: intakeIdentityBeforeCorrection.affiliateSourceId,
          supplySourceId: intakeIdentityBeforeCorrection.supplySourceId,
          updatedAt: intakeIdentityBeforeCorrection.updatedAt,
        },
      });
    }
    const reviewerJobForQueue = oldCompletedJobs.find((candidate) => (
      candidate.role === 'SUPPLY_REVIEWER' && candidate.subjectId === approvedRoot.id
    ));
    assert.ok(reviewerJobForQueue);
    const reviewerBeforeQueue = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
      where: { id: reviewerJobForQueue.id },
    });
    await prisma.affiliateAgentGatewayJobs.update({
      where: { id: reviewerJobForQueue.id },
      data: { status: 'RETRY_WAIT' },
    });
    try {
      const queuedReviewerPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const queuedReviewerRow = queuedReviewerPreview.rows.find((row) => row.mappingJobId === approvedJob.id);
      assert.equal(queuedReviewerRow?.eligible, false, JSON.stringify(queuedReviewerPreview.rows));
      assert.ok(
        queuedReviewerRow?.reasonCodes.includes('PRIOR_PENDING_MAPPING_PROOF_INVALID'),
        JSON.stringify(queuedReviewerPreview.rows),
      );
    } finally {
      await prisma.affiliateAgentGatewayJobs.update({
        where: { id: reviewerBeforeQueue.id },
        data: { status: reviewerBeforeQueue.status, updatedAt: reviewerBeforeQueue.updatedAt },
      });
    }
    const pendingProofSourceBefore = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: approvedSource.id },
    });
    const pendingProofRootBefore = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: approvedRoot.id },
    });
    const pendingProofSourceMetadata = pendingProofSourceBefore.metadata as Record<string, unknown>;
    const pendingProofRootMetadata = pendingProofRootBefore.metadata as Record<string, unknown>;
    const pendingProof = pendingProofSourceMetadata.pendingMapping as Record<string, unknown>;
    assert.ok(pendingProof);
    const invalidPendingProof = {
      ...pendingProof,
      producerClaimId: `${prefix}-missing-pending-producer-claim`,
    };
    await prisma.$transaction([
      prisma.affiliateScrapeSources.update({
        where: { id: approvedSource.id },
        data: {
          metadata: { ...pendingProofSourceMetadata, pendingMapping: invalidPendingProof } as Prisma.InputJsonValue,
        },
      }),
      prisma.affiliateSupplySources.update({
        where: { id: approvedRoot.id },
        data: {
          metadata: { ...pendingProofRootMetadata, pendingMapping: invalidPendingProof } as Prisma.InputJsonValue,
        },
      }),
    ]);
    try {
      const pendingProofPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const pendingProofRow = pendingProofPreview.rows.find((row) => row.mappingJobId === approvedJob.id);
      assert.equal(pendingProofRow?.eligible, false, JSON.stringify(pendingProofPreview.rows));
      assert.ok(
        pendingProofRow?.reasonCodes.includes('PRIOR_PENDING_MAPPING_PROOF_INVALID'),
        JSON.stringify(pendingProofPreview.rows),
      );
    } finally {
      await prisma.$transaction([
        prisma.affiliateScrapeSources.update({
          where: { id: approvedSource.id },
          data: {
            metadata: pendingProofSourceBefore.metadata ?? Prisma.JsonNull,
            updatedAt: pendingProofSourceBefore.updatedAt,
          },
        }),
        prisma.affiliateSupplySources.update({
          where: { id: approvedRoot.id },
          data: {
            metadata: pendingProofRootBefore.metadata ?? Prisma.JsonNull,
            updatedAt: pendingProofRootBefore.updatedAt,
          },
        }),
      ]);
    }
    const originalPendingContent = oldPendingMapping.mapping as Record<string, unknown>;
    const originalPendingMetadata = originalPendingContent.metadata as Record<string, unknown>;
    const alteredPackageHash = 'f'.repeat(64);
    const alteredValidation = {
      ...(originalPendingMetadata.validationOutput as Record<string, unknown>),
      validatedPackageHash: alteredPackageHash,
    };
    const alteredPendingContent = {
      ...originalPendingContent,
      metadata: { ...originalPendingMetadata, packageHash: alteredPackageHash, validationOutput: alteredValidation },
    };
    const coherentButUncommittedPointer = {
      ...pendingProof,
      packageHash: alteredPackageHash,
      candidatePackageHash: alteredPackageHash,
      mappingSha256: hashAffiliateAgentValue(alteredPendingContent),
      validationHash: hashAffiliateAgentValue(alteredValidation),
    };
    await prisma.$transaction([
      prisma.affiliateScrapeMappings.update({
        where: { id: oldPendingMapping.id }, data: { mapping: alteredPendingContent as Prisma.InputJsonValue },
      }),
      prisma.affiliateScrapeSources.update({
        where: { id: approvedSource.id },
        data: { metadata: { ...pendingProofSourceMetadata, pendingMapping: coherentButUncommittedPointer } as Prisma.InputJsonValue },
      }),
      prisma.affiliateSupplySources.update({
        where: { id: approvedRoot.id },
        data: { metadata: { ...pendingProofRootMetadata, pendingMapping: coherentButUncommittedPointer } as Prisma.InputJsonValue },
      }),
    ]);
    try {
      const uncommittedPreview = await previewAffiliateExistingDataRepairCorrection(correctionInput);
      const uncommittedRow = uncommittedPreview.rows.find((row) => row.mappingJobId === approvedJob.id);
      assert.equal(uncommittedRow?.eligible, false);
      assert.ok(uncommittedRow?.reasonCodes.includes('PRIOR_PENDING_MAPPING_PROOF_INVALID'));
    } finally {
      await prisma.$transaction([
        prisma.affiliateScrapeMappings.update({
          where: { id: oldPendingMapping.id },
          data: { mapping: oldPendingMapping.mapping ?? Prisma.JsonNull, updatedAt: oldPendingMapping.updatedAt },
        }),
        prisma.affiliateScrapeSources.update({
          where: { id: approvedSource.id },
          data: { metadata: pendingProofSourceBefore.metadata ?? Prisma.JsonNull, updatedAt: pendingProofSourceBefore.updatedAt },
        }),
        prisma.affiliateSupplySources.update({
          where: { id: approvedRoot.id },
          data: { metadata: pendingProofRootBefore.metadata ?? Prisma.JsonNull, updatedAt: pendingProofRootBefore.updatedAt },
        }),
      ]);
    }
    const boundedRelationEventRows = Array.from({ length: 200 }, (_, index) => ({
      id: `${prefix}-bounded-relation-event-${index}`,
      eventKey: `${prefix}-bounded-relation-event-${index}`,
      jobId: oldQueuedJob.id,
      claimId: null,
      receiptId: null,
      sequence: 10_000 + index,
      eventType: 'BOUNDED_RELATION_TEST',
      actorKind: 'OPERATOR',
      actorId: 'bounded-relation-test',
      role: 'MAPPING_PRODUCER',
      requestHash: null,
      inputHash: null,
      outputHash: null,
      reasonCodes: [],
      payload: {},
      retentionClass: 'INDEFINITE',
    }));
    await prisma.affiliateAgentGatewayEvents.createMany({ data: boundedRelationEventRows });
    try {
      await assert.rejects(
        previewAffiliateExistingDataRepairCorrection(correctionInput),
        (error: unknown) => error instanceof Error && 'code' in error && error.code === 'SNAPSHOT_OVERFLOW',
      );
    } finally {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await transaction.affiliateAgentGatewayEvents.deleteMany({
          where: { id: { startsWith: `${prefix}-bounded-relation-event-` } },
        });
      });
    }
    const corrected = await applyAffiliateExistingDataRepairCorrection({
      ...correctionInput, expectedReportHash: correctionPreview.reportHash,
    });
    assert.equal(corrected.appliedJobs.length, 3, JSON.stringify(corrected.rows));
    const supersededJob = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: oldQueuedJob.id } });
    assert.equal(supersededJob.status, 'PIPELINE_BLOCKED');
    assert.equal(supersededJob.terminalDisposition, 'CORRECTION_SUPERSEDED');
    assert.deepEqual(supersededJob.subjectJson, oldQueuedJob.subjectJson);
    assert.deepEqual(supersededJob.evidenceManifestJson, oldQueuedJob.evidenceManifestJson);
    assert.deepEqual(await prisma.affiliateAgentGatewayJobs.findMany({
      where: { id: { in: oldCompletedJobs.map((job) => job.id) } }, orderBy: { id: 'asc' },
    }), oldCompletedJobs);
    assert.deepEqual(await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: oldPendingMapping.id } }), oldPendingMapping);
    assert.equal((await captureAffiliateExistingRepairSourceState(prisma, approvedSource.id)).sourceStateSha256, protectedState.sourceStateSha256);
    const replayTamperFirst = corrected.appliedJobs[0];
    const replayTamperApplied = corrected.appliedJobs.find((entry) => entry.mappingJobId !== replayTamperFirst?.mappingJobId);
    assert.ok(replayTamperApplied);
    const replayTamperSourceBefore = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: replayTamperApplied.sourceId },
    });
    const replayTamperRootBefore = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: replayTamperApplied.supplySourceId },
    });
    const replayTamperSourceMetadata = replayTamperSourceBefore.metadata as Record<string, unknown>;
    const replayTamperRootMetadata = replayTamperRootBefore.metadata as Record<string, unknown>;
    const replayTamperAudit = replayTamperSourceMetadata.existingDataRepairAdmission as Record<string, unknown>;
    const replayTamperSnapshot = replayTamperAudit.reportSnapshot as Record<string, unknown>;
    assert.ok(replayTamperAudit);
    assert.ok(replayTamperSnapshot);
    const replayTamperedAudit = {
      ...replayTamperAudit,
      reportSnapshot: { ...replayTamperSnapshot, reason: 'Tampered one selected audit entry.' },
    };
    await prisma.$transaction([
      prisma.affiliateScrapeSources.update({
        where: { id: replayTamperApplied.sourceId },
        data: {
          metadata: {
            ...replayTamperSourceMetadata,
            existingDataRepairAdmission: replayTamperedAudit,
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.affiliateSupplySources.update({
        where: { id: replayTamperApplied.supplySourceId },
        data: {
          metadata: {
            ...replayTamperRootMetadata,
            existingDataRepairAdmission: replayTamperedAudit,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    try {
      await assert.rejects(
        applyAffiliateExistingDataRepairCorrection({
          ...correctionInput, expectedReportHash: correctionPreview.reportHash,
        }),
        (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ADMISSION_REPORT_DRIFT',
      );
    } finally {
      await prisma.$transaction([
        prisma.affiliateScrapeSources.update({
          where: { id: replayTamperApplied.sourceId },
          data: {
            metadata: replayTamperSourceBefore.metadata ?? Prisma.JsonNull,
            updatedAt: replayTamperSourceBefore.updatedAt,
          },
        }),
        prisma.affiliateSupplySources.update({
          where: { id: replayTamperApplied.supplySourceId },
          data: {
            metadata: replayTamperRootBefore.metadata ?? Prisma.JsonNull,
            updatedAt: replayTamperRootBefore.updatedAt,
          },
        }),
      ]);
    }
    const correctionReplay = await applyAffiliateExistingDataRepairCorrection({
      ...correctionInput, expectedReportHash: correctionPreview.reportHash,
    });
    assert.equal(correctionReplay.writeCount, 0);
    assert.deepEqual(correctionReplay.appliedJobs, corrected.appliedJobs);
    const subsetCorrectionInput = {
      ...correctionInput,
      jobIds: [publicSource.jobId],
      evidenceSelections: correctionInput.evidenceSelections.filter((selection) => selection.jobId === publicSource.jobId),
    };
    await assert.rejects(
      applyAffiliateExistingDataRepairCorrection({
        ...subsetCorrectionInput,
        expectedReportHash: correctionPreview.reportHash,
      }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ADMISSION_REPORT_DRIFT',
    );
    await assert.rejects(
      applyAffiliateExistingDataRepairCorrection({
        ...correctionInput,
        limit: 1,
        expectedReportHash: correctionPreview.reportHash,
      }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ADMISSION_REPORT_DRIFT',
    );
    await assert.rejects(
      applyAffiliateExistingDataRepairCorrection({
        ...correctionInput, operatorId: 'different-correction-operator', expectedReportHash: correctionPreview.reportHash,
      }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ADMISSION_REPORT_DRIFT',
    );
    for (const correctedJob of corrected.appliedJobs) {
      const isArticle = correctedJob.mappingJobId === publicSource.jobId;
      const isKnownClub = correctedJob.mappingJobId === privateSource.jobId;
      const fixture = isArticle ? publicSource : isKnownClub ? privateSource : queuedFixture;
      const label = isArticle ? 'corrected-article' : isKnownClub ? 'corrected-known-club' : 'corrected-queued';
      const sourceState = await captureAffiliateExistingRepairSourceState(prisma, correctedJob.sourceId);
      assert.equal(sourceState.correctionHold?.admissionHash, corrected.reviewedReportHash);
      await assert.rejects(
        assertAffiliatePendingRepairClear({
          database: prisma as unknown as Parameters<typeof assertAffiliatePendingRepairClear>[0]['database'],
          sourceId: correctedJob.sourceId, expectedSupplySourceId: correctedJob.supplySourceId,
        }),
        (error: unknown) => error instanceof AffiliatePendingRepairHoldError
          && error.reason === 'EXISTING_DATA_REPAIR_CORRECTION_HOLD',
      );
      const producer = await claim(correctedJob.jobId, 'MAPPING_PRODUCER', `${label}-producer`);
      if (producer.envelope.subject.type !== 'MAPPING_PRODUCER') throw new Error('Unexpected correction producer subject.');
      const repair = producer.envelope.subject.repairContext;
      assert.equal(repair?.kind, 'EXISTING_DATA_REPAIR');
      if (repair?.kind !== 'EXISTING_DATA_REPAIR') throw new Error('The correction claim lost its context.');
      assert.equal(repair.deploymentContract.version, 11);
      assert.ok(repair.correction);
      if (isKnownClub) {
        const legacyBeforeHistoryDrift = await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({
          where: { id: correctedJob.mappingJobId },
        });
        const legacySummary = legacyBeforeHistoryDrift.resultSummary as Record<string, unknown>;
        const history = legacySummary.existingDataRepairAdmissionHistory as Record<string, unknown>[];
        assert.ok(Array.isArray(history));
        const claimedGatewayJob = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
          where: { id: producer.envelope.jobId },
        });
        const malformedHistories = [
          history.filter((entry) => entry.reportHash !== repair.admissionHash),
          history.map((entry) => entry.reportHash === repair.correction!.priorAdmissionHash
            ? { ...entry, operatorId: 'changed-prior-audit-operator' }
            : entry),
        ];
        try {
          for (const changedHistory of malformedHistories) {
            await prisma.affiliateSourceMappingJobs.update({
              where: { id: correctedJob.mappingJobId },
              data: { resultSummary: { ...legacySummary, existingDataRepairAdmissionHistory: changedHistory } as Prisma.InputJsonValue },
            });
            await assert.rejects(assertAffiliateExistingDataRepairClaimBinding({
              prisma, job: claimedGatewayJob, claim: producer.envelope,
            }));
          }
        } finally {
          await prisma.affiliateSourceMappingJobs.update({
            where: { id: correctedJob.mappingJobId },
            data: {
              resultSummary: legacyBeforeHistoryDrift.resultSummary ?? Prisma.JsonNull,
              updatedAt: legacyBeforeHistoryDrift.updatedAt,
            },
          });
        }
      }
      if (isKnownClub) assert.equal(repair.sourceKindAssessment, undefined);
      assert.equal(repair.evidenceRunId, isArticle ? articleRunId : fixture.runId);
      const pageArtifact = await prisma.affiliateSourceIntakeArtifacts.findFirstOrThrow({
        where: { intakeId: fixture.intakeId, runId: repair.evidenceRunId, pageId: fixture.pageId, kind: 'PAGE_HTML' },
      });
      const listing = producer.envelope.evidenceManifest.entries.find((entry) => entry.artifactId === `intake-artifact:${pageArtifact.id}`);
      assert.ok(listing);
      const candidatePackage = affiliateAgentDeclarativePackageSchema.parse({
        schemaVersion: 1, supplySourceId: correctedJob.supplySourceId, listingKind: 'CLUB',
        listUrlRef: listing.evidenceRef, itemSelector: isArticle ? 'article' : 'main',
        fields: [
          { field: 'description', selector: 'p', mode: 'TEXT', attribute: null, transform: 'TRIM' },
          { field: 'officialActionUrl', selector: 'a', mode: 'ATTRIBUTE', attribute: 'href', transform: 'ABSOLUTE_URL' },
          { field: 'sportName', mode: 'CONSTANT', value: 'Indoor Volleyball' },
          { field: 'title', selector: 'h1', mode: 'TEXT', attribute: null, transform: 'TRIM' },
        ],
        evidenceRefs: [listing.evidenceRef],
        sportEvidence: {
          evidenceRunId: repair.evidenceRunId, sportsCatalogSha256: repair.sportsCatalog.sha256,
          sportDeterminations: [{
            sourceLabels: ['indoor volleyball'], status: 'RESOLVED', resolutionBasis: 'SOURCE_EVIDENCE',
            canonicalSportNames: ['Indoor Volleyball'], rationale: 'The source specifies indoor volleyball on hardwood courts.',
            evidence: [{
              artifactId: listing.artifactId, artifactSha256: listing.sha256, artifactKind: 'PAGE_HTML',
              pageUrl: pageArtifact.finalUrl, excerpt: 'We offer indoor volleyball on our hardwood courts.',
            }],
          }],
        },
      });
      const validationOperation = {
        kind: 'EXECUTE_COMMAND' as const, idempotencyKey: `${prefix}-${label}-validate`, authorization: authorizationFor(producer),
        command: { type: 'VALIDATE_DECLARATIVE_PACKAGE' as const, data: { candidatePackage, evidenceManifestHash: producer.envelope.evidenceManifest.hash } },
      };
      if (isArticle) {
        await assert.rejects(
          gateway.perform(validationOperation),
          (error: unknown) => error instanceof Error && 'code' in error && error.code === 'COMMAND_SCHEMA_INVALID',
        );
        const gap = await gateway.perform({
          kind: 'SUBMIT_RESULT', idempotencyKey: `${prefix}-${label}-gap`, authorization: authorizationFor(producer),
          result: {
            ...affiliateAgentTerminalIdentityFor(producer.envelope), disposition: 'CONTRACT_GAP',
            reasonCodes: ['CONTRACT_REQUIREMENT_MISSING'], evidenceRefs: [listing.evidenceRef],
            summary: 'The article does not establish one club or its official action.',
            payload: { contractArea: 'MAPPING_EVIDENCE', requestedChange: 'Provide a first-party club page.', sportEvidence: candidatePackage.sportEvidence },
          },
        });
        assert.equal(gap.kind, 'TERMINAL_ACCEPTED', JSON.stringify(gap));
        const held = await captureAffiliateExistingRepairSourceState(prisma, correctedJob.sourceId);
        assert.deepEqual(held.correctionHold, sourceState.correctionHold);
        assert.equal(held.sourceStateSha256, protectedState.sourceStateSha256);
        assert.equal((await prisma.affiliateSourceMappingJobs.findUniqueOrThrow({ where: { id: fixture.jobId } })).status, 'HUMAN_REVIEW_REQUIRED');
        const ordinarySourceBeforeHeldAttempt = await prisma.affiliateScrapeSources.findUniqueOrThrow({
          where: { id: correctedJob.sourceId },
        });
        const ordinaryAdmissionWhileHeld = {
          prisma,
          artifactStore,
          bundle: activeBundle,
          jobIds: [fixture.jobId],
          reason: 'Attempt an ordinary admission while correction owns the source.',
          operatorId: 'smoke-ordinary-operator',
          evidenceSelections: [{ jobId: fixture.jobId, runId: articleRunId, pageId: fixture.pageId }],
        };
        const ordinaryHeldPreview = await previewAffiliateExistingDataRepairAdmission(ordinaryAdmissionWhileHeld);
        assert.equal(ordinaryHeldPreview.rows[0]?.eligible, false, JSON.stringify(ordinaryHeldPreview.rows));
        assert.ok(
          ordinaryHeldPreview.rows[0]?.reasonCodes.includes('CORRECTION_HOLD_PRESENT'),
          JSON.stringify(ordinaryHeldPreview.rows),
        );
        const ordinaryHeldApply = await applyAffiliateExistingDataRepairAdmission({
          ...ordinaryAdmissionWhileHeld,
          expectedReportHash: ordinaryHeldPreview.reportHash,
        });
        assert.equal(ordinaryHeldApply.writeCount, 0, JSON.stringify(ordinaryHeldApply));
        assert.deepEqual(
          await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: correctedJob.sourceId } }),
          ordinarySourceBeforeHeldAttempt,
        );
        continue;
      }
      const validated = await gateway.perform(validationOperation);
      assert.equal(validated.kind, 'COMMAND_SUCCEEDED', JSON.stringify(validated));
      if (validated.kind !== 'COMMAND_SUCCEEDED') throw new Error('Correction validation failed.');
      const packageHash = hashAffiliateAgentValue(candidatePackage);
      const committed = await gateway.perform({
        kind: 'EXECUTE_COMMAND', idempotencyKey: `${prefix}-${label}-commit`, authorization: authorizationFor(producer),
        command: { type: 'COMMIT_DECLARATIVE_PACKAGE', data: { validationReceiptId: validated.receiptId, validatedPackageHash: packageHash } },
      });
      assert.equal(committed.kind, 'COMMAND_SUCCEEDED', JSON.stringify(committed));
      if (committed.kind !== 'COMMAND_SUCCEEDED') throw new Error('Correction commit failed.');
      assert.equal((await captureAffiliateExistingRepairSourceState(prisma, correctedJob.sourceId)).correctionHold, null);
      const submitted = await gateway.perform({
        kind: 'SUBMIT_RESULT', idempotencyKey: `${prefix}-${label}-result`, authorization: authorizationFor(producer),
        result: {
          ...affiliateAgentTerminalIdentityFor(producer.envelope), disposition: 'BOUNDED_REPAIR_SUBMITTED',
          reasonCodes: ['SCHEMA_VALIDATED'], evidenceRefs: [listing.evidenceRef],
          summary: 'The new package passed current entity and action checks.',
          payload: { repairPass: 1, packageHash, commitReceiptId: committed.receiptId },
        },
      });
      assert.equal(submitted.kind, 'TERMINAL_ACCEPTED', JSON.stringify(submitted));
      const reviewerJob = await prisma.affiliateAgentGatewayJobs.findFirstOrThrow({
        where: { parentClaimId: producer.envelope.claimId, role: 'SUPPLY_REVIEWER' },
      });
      const reviewer = await claim(reviewerJob.id, 'SUPPLY_REVIEWER', `${label}-reviewer`);
      const approvedResult = affiliateAgentTerminalResultEnvelopeSchema.parse({
        ...affiliateAgentTerminalIdentityFor(reviewer.envelope),
        disposition: 'APPROVED' as const,
        reasonCodes: ['EVIDENCE_VERIFIED'],
        evidenceRefs: reviewer.envelope.evidenceManifest.entries.map((entry) => entry.evidenceRef),
        summary: 'The independent reviewer verified the current club and action evidence.',
        payload: { committedPackageHash: packageHash },
      });
      if (approvedResult.role !== 'SUPPLY_REVIEWER' || approvedResult.disposition !== 'APPROVED') {
        throw new Error('Expected a correction approval result.');
      }
      if (isKnownClub) {
        const approvalSourceBeforeHold = await prisma.affiliateScrapeSources.findUniqueOrThrow({
          where: { id: correctedJob.sourceId },
        });
        const approvalRootBeforeHold = await prisma.affiliateSupplySources.findUniqueOrThrow({
          where: { id: correctedJob.supplySourceId },
        });
        const approvalSourceMetadata = approvalSourceBeforeHold.metadata as Record<string, unknown>;
        const approvalPending = approvalSourceMetadata.pendingMapping as Record<string, unknown>;
        const approvalMappingId = approvalPending.mappingId as string;
        assert.ok(approvalMappingId);
        const approvalMappingBeforeHold = await prisma.affiliateScrapeMappings.findUniqueOrThrow({
          where: { id: approvalMappingId },
        });
        assert.equal(approvalPending.state, 'STAGED');
        const approvalHold = {
          schemaVersion: 1,
          sourceId: approvalSourceBeforeHold.id,
          supplySourceId: approvalRootBeforeHold.id,
          mappingJobId: correctedJob.mappingJobId,
          admissionHash: repair.admissionHash,
          priorPendingMappingHash: repair.correction!.priorPendingMappingHash,
        };
        const approvalReceiptCount = await prisma.affiliateAgentGatewayOperationReceipts.count();
        const approvalRootMetadata = approvalRootBeforeHold.metadata as Record<string, unknown>;
        await prisma.$transaction([
          prisma.affiliateScrapeSources.update({
            where: { id: approvalSourceBeforeHold.id },
            data: { metadata: { ...approvalSourceMetadata, existingDataRepairCorrectionHold: approvalHold } as Prisma.InputJsonValue },
          }),
          prisma.affiliateSupplySources.update({
            where: { id: approvalRootBeforeHold.id },
            data: { metadata: { ...approvalRootMetadata, existingDataRepairCorrectionHold: approvalHold } as Prisma.InputJsonValue },
          }),
        ]);
        try {
          await assert.rejects(
            adapters.terminalEffects.APPROVED.execute({
              receiptId: `${prefix}-${label}-approved-hold`,
              claim: reviewer.envelope,
              result: approvedResult,
            }),
          );
          assert.equal(await prisma.affiliateAgentGatewayOperationReceipts.count(), approvalReceiptCount);
          assert.deepEqual(
            await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: approvalMappingBeforeHold.id } }),
            approvalMappingBeforeHold,
          );
        } finally {
          await prisma.$transaction([
            prisma.affiliateScrapeSources.update({
              where: { id: approvalSourceBeforeHold.id },
              data: { metadata: approvalSourceBeforeHold.metadata ?? Prisma.JsonNull, updatedAt: approvalSourceBeforeHold.updatedAt },
            }),
            prisma.affiliateSupplySources.update({
              where: { id: approvalRootBeforeHold.id },
              data: { metadata: approvalRootBeforeHold.metadata ?? Prisma.JsonNull, updatedAt: approvalRootBeforeHold.updatedAt },
            }),
          ]);
        }
      }
      const approved = await gateway.perform({
        kind: 'SUBMIT_RESULT',
        idempotencyKey: `${prefix}-${label}-approved`,
        authorization: authorizationFor(reviewer),
        result: approvedResult,
      });
      assert.equal(approved.kind, 'TERMINAL_ACCEPTED', JSON.stringify(approved));
      const finalSource = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: correctedJob.sourceId } });
      const pending = (finalSource.metadata as Record<string, unknown>).pendingMapping as { mappingId: string; state: string };
      assert.equal(pending.state, 'APPROVED');
      assert.equal(finalSource.activeMappingId, null);
      assert.equal(finalSource.autoScrapeEnabled, false);
      const finalMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: pending.mappingId } });
      assert.equal(finalMapping.isActive, false);
      assert.ok(finalMapping.validatedAt);
    }
    assert.deepEqual(await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: oldPendingMapping.id } }), oldPendingMapping);
    assert.deepEqual(await prisma.affiliateScrapeMappings.findUniqueOrThrow({ where: { id: correctionWorkingMapping.id } }), correctionWorkingMapping);
    assert.equal(await prisma.affiliateSupplyTargets.count({ where: { supplySourceId: { in: corrected.appliedJobs.map((job) => job.supplySourceId) } } }), 0);

    const boundedFixtures = [
      await seed('bounded-a'),
      await seed('bounded-b'),
      await seed('bounded-held'),
    ];
    const boundedAdmissionInput = {
      ...repairInput,
      jobIds: boundedFixtures.map((fixture) => fixture.jobId),
      evidenceSelections: boundedFixtures.map((fixture) => ({
        jobId: fixture.jobId, runId: fixture.runId, pageId: fixture.pageId,
      })),
    };
    const boundedAdmissionPreview = await previewAffiliateExistingDataRepairAdmission(boundedAdmissionInput);
    await applyAffiliateExistingDataRepairAdmission({
      ...boundedAdmissionInput, expectedReportHash: boundedAdmissionPreview.reportHash,
    });
    await prisma.affiliateSourceIntakes.update({
      where: { id: boundedFixtures[2].intakeId }, data: { complianceStatus: 'BLOCKED' },
    });
    const boundedCorrectionInput = { ...boundedAdmissionInput, bundle: activeBundle, limit: 1 };
    const boundedPreview = await previewAffiliateExistingDataRepairCorrection(boundedCorrectionInput);
    assert.deepEqual(boundedPreview.selectedJobIds, [boundedFixtures[0].jobId]);
    assert.ok(boundedPreview.rows.find((row) => row.jobId === boundedFixtures[1].jobId)?.reasonCodes.includes('SELECTION_LIMIT_EXCLUDED'));
    assert.ok(boundedPreview.rows.find((row) => row.jobId === boundedFixtures[2].jobId)?.reasonCodes.includes('SOURCE_POLICY_NOT_ALLOWED'));
    const boundedJobsBefore = await prisma.affiliateAgentGatewayJobs.count();
    const boundedApplied = await applyAffiliateExistingDataRepairCorrection({
      ...boundedCorrectionInput, expectedReportHash: boundedPreview.reportHash,
    });
    assert.equal(boundedApplied.writeCount, 1);
    assert.equal(await prisma.affiliateAgentGatewayJobs.count(), boundedJobsBefore + 1);
    assert.equal(boundedApplied.appliedJobs.length, 1);
    const boundedProducer = await claim(boundedApplied.appliedJobs[0].jobId, 'MAPPING_PRODUCER', 'bounded-mixed-producer');
    if (boundedProducer.envelope.subject.type !== 'MAPPING_PRODUCER'
      || boundedProducer.envelope.subject.repairContext?.kind !== 'EXISTING_DATA_REPAIR') {
      throw new Error('The bounded mixed correction is not claimable.');
    }
    const boundedContext = boundedProducer.envelope.subject.repairContext;
    const boundedHtml = boundedProducer.envelope.evidenceManifest.entries.find((entry) => entry.kind === 'PAGE_HTML');
    assert.ok(boundedHtml);
    const boundedPage = await prisma.affiliateSourceIntakePages.findUniqueOrThrow({ where: { id: boundedFixtures[0].pageId } });
    const boundedGap = await gateway.perform({
      kind: 'SUBMIT_RESULT', idempotencyKey: `${prefix}-bounded-mixed-gap`, authorization: authorizationFor(boundedProducer),
      result: {
        ...affiliateAgentTerminalIdentityFor(boundedProducer.envelope),
        disposition: 'CONTRACT_GAP', reasonCodes: ['CONTRACT_REQUIREMENT_MISSING'],
        evidenceRefs: [boundedHtml.evidenceRef],
        summary: 'The current source needs additional first-party location evidence.',
        payload: {
          contractArea: 'MAPPING_EVIDENCE', requestedChange: 'Provide the missing first-party location evidence.',
          sportEvidence: {
            evidenceRunId: boundedContext.evidenceRunId,
            sportsCatalogSha256: boundedContext.sportsCatalog.sha256,
            sportDeterminations: [{
              sourceLabels: ['indoor volleyball'], status: 'RESOLVED', resolutionBasis: 'SOURCE_EVIDENCE',
              canonicalSportNames: ['Indoor Volleyball'], rationale: 'The source specifies indoor volleyball on hardwood courts.',
              evidence: [{
                artifactId: boundedHtml.artifactId, artifactSha256: boundedHtml.sha256, artifactKind: 'PAGE_HTML',
                pageUrl: boundedPage.canonicalUrl, excerpt: 'We offer indoor volleyball on our hardwood courts.',
              }],
            }],
          },
        },
      },
    });
    assert.equal(boundedGap.kind, 'TERMINAL_ACCEPTED');
    await prisma.affiliateSourceIntakes.update({
      where: { id: boundedFixtures[2].intakeId }, data: { complianceStatus: 'ALLOWED' },
    });
    const boundedReplay = await applyAffiliateExistingDataRepairCorrection({
      ...boundedCorrectionInput, expectedReportHash: boundedPreview.reportHash,
    });
    assert.equal(boundedReplay.writeCount, 0);
    assert.deepEqual(boundedReplay.appliedJobs, boundedApplied.appliedJobs);
    assert.equal(await prisma.affiliateAgentGatewayJobs.count(), boundedJobsBefore + 1);
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
