import { z } from "zod";

import type {
  AffiliateImportCandidates,
  AffiliateScrapeMappings,
  AffiliateScrapeSources,
  AffiliateSupplySources,
  AffiliateSupplyTargets,
  Organizations,
} from "@/generated/prisma/client";
import {
  affiliateAgentExistingDataRepairContextSchema,
  affiliateAgentMappingRepairContextSchema,
  hashAffiliateAgentValue,
  type AffiliateAgentExistingDataRepairContext,
  type AffiliateAgentMappingRepairContext,
} from "./agentGatewayContracts";
import { hasPublicAffiliateCandidate } from "./affiliateSourcePublicationSafety";

/** The metadata key is server-owned. Agents cannot author or replace it. */
export const AFFILIATE_EXISTING_DATA_REPAIR_METADATA_KEY = "existingDataRepair";
export const AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY = "pendingMapping";
export const AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY = "existingDataRepairAdmission";
export const AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS = "GOVERNED_REPAIR_PENDING";
export const AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_KIND =
  "EXISTING_DATA_REPAIR_PENDING_MAPPING" as const;

const identifierSchema = z.string().trim().min(1).max(200);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const sortedUniqueStringsSchema = z.array(identifierSchema).superRefine((values, context) => {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] >= values[index]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Values must be sorted uniquely.",
        path: [index],
      });
      return;
    }
  }
});

const affiliateExistingDataRepairPendingMappingShape = {
  schemaVersion: z.literal(1),
  kind: z.literal(AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_KIND),
  state: z.enum(["STAGED", "APPROVED"]),
  supplySourceId: identifierSchema,
  sourceId: identifierSchema,
  sourceIdentityKey: sha256Schema,
  mappingJobId: identifierSchema,
  mappingId: identifierSchema,
  mappingSha256: sha256Schema,
  packageHash: sha256Schema,
  candidatePackageHash: sha256Schema,
  candidateHash: sha256Schema,
  evidenceHash: sha256Schema,
  evidenceRefs: sortedUniqueStringsSchema,
  validationHash: sha256Schema,
  validationReceiptId: identifierSchema,
  admissionHash: sha256Schema,
  sourceStateSha256: sha256Schema,
  postCommitSourceStateSha256: sha256Schema,
  workingMappingId: identifierSchema.nullable(),
  workingMappingStateSha256: sha256Schema,
  postCommitWorkingMappingStateSha256: sha256Schema,
  organizationStateSha256: sha256Schema.nullable(),
  postCommitOrganizationStateSha256: sha256Schema.nullable(),
  isPublicReplacement: z.boolean(),
  producerClaimId: identifierSchema.nullable().optional(),
  producerJobId: identifierSchema.nullable().optional(),
  reviewerClaimId: identifierSchema.nullable().optional(),
  reviewerJobId: identifierSchema.nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
} as const;

export const affiliateExistingDataRepairPendingMappingSchema = z.object(
  affiliateExistingDataRepairPendingMappingShape,
).strict();
export type AffiliateExistingDataRepairPendingMapping = z.infer<
  typeof affiliateExistingDataRepairPendingMappingSchema
>;

export type AffiliateExistingDataRepairContext = AffiliateAgentExistingDataRepairContext;


export type AffiliateExistingDataRepairSourceState = Readonly<{
  sourceStateSha256: string;
  workingMappingId: string | null;
  isPublicReplacement: boolean;
  sourceState: Readonly<Record<string, unknown>>;
  workingMappingState: Readonly<Record<string, unknown>> | null;
  organizationState: Readonly<Record<string, unknown>> | null;
  workingMappingStateSha256: string;
  organizationStateSha256: string | null;
}>;

export type AffiliateExistingRepairPrisma = Readonly<{
  affiliateScrapeSources: Readonly<{
    findUnique(args: { where: { id: string } }): Promise<AffiliateScrapeSources | null>;
  }>;
  affiliateSupplySources: Readonly<{
    findUnique(args: { where: { id: string } }): Promise<AffiliateSupplySources | null>;
  }>;
  affiliateScrapeMappings: Readonly<{
    findUnique(args: { where: { id: string } }): Promise<AffiliateScrapeMappings | null>;
  }>;
  organizations?: Readonly<{
    findUnique(args: { where: { id: string } }): Promise<Organizations | null>;
  }>;
  affiliateImportCandidates: Readonly<{
    findMany(args: unknown): Promise<readonly AffiliateImportCandidates[]>;
  }>;
  affiliateSupplyTargets: Readonly<{
    findMany(args: unknown): Promise<readonly AffiliateSupplyTargets[]>;
  }>;
}>;

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
const stableMetadata = (value: unknown): Readonly<Record<string, unknown>> => {
  const metadata = { ...recordValue(value) };
  delete metadata[AFFILIATE_EXISTING_DATA_REPAIR_METADATA_KEY];
  delete metadata[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
  delete metadata[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY];
  return metadata;
};
const AFFILIATE_EXISTING_REPAIR_PUBLIC_STATE_MAX_ROWS = 1_000;
const PUBLIC_SOURCE_STATUSES: Readonly<Record<string, true>> = {
  PUBLIC: true,
  PUBLISHED: true,
  LISTED: true,
  ACTIVE_PUBLIC: true,
};
const PUBLIC_TARGET_STATUSES: Readonly<Record<string, true>> = {
  PUBLISHED: true,
  ACTIVE: true,
  LAST_KNOWN_GOOD: true,
};
type PublicRowsRead<T> = Readonly<{
  rows: readonly T[];
  status: "COMPLETE" | "TRUNCATED" | "UNAVAILABLE" | "NOT_APPLICABLE";
}>;
type PublicStateSnapshot = Readonly<{
  sourceStatus: string;
  sourceMetadata: Readonly<Record<string, unknown>>;
  candidateReadStatus: PublicRowsRead<AffiliateImportCandidates>["status"];
  targetReadStatus: PublicRowsRead<AffiliateSupplyTargets>["status"];
  organizationReadStatus: "AVAILABLE" | "MISSING" | "UNAVAILABLE" | "NOT_APPLICABLE";
  publishedCandidates: readonly Readonly<Record<string, unknown>>[];
  publishedTargets: readonly Readonly<Record<string, unknown>>[];
}>;

const stableTimestamp = (value: unknown): unknown => (
  value instanceof Date ? value.toISOString() : value ?? null
);

const stablePublicCandidate = (
  candidate: AffiliateImportCandidates,
): Readonly<Record<string, unknown>> => ({
  id: candidate.id,
  sourceId: candidate.sourceId,
  supplySourceId: candidate.supplySourceId,
  runId: candidate.runId,
  mappingId: candidate.mappingId,
  listingKind: candidate.listingKind,
  status: candidate.status,
  dedupeKey: candidate.dedupeKey,
  title: candidate.title,
  organizerName: candidate.organizerName,
  sportName: candidate.sportName,
  formatLabel: candidate.formatLabel,
  city: candidate.city,
  venueName: candidate.venueName,
  address: candidate.address,
  startsAt: stableTimestamp(candidate.startsAt),
  endsAt: stableTimestamp(candidate.endsAt),
  timeZone: candidate.timeZone,
  scheduleText: candidate.scheduleText,
  dateDisplayMode: candidate.dateDisplayMode,
  dateDisplayText: candidate.dateDisplayText,
  skillLevel: candidate.skillLevel,
  ageGroup: candidate.ageGroup,
  divisionText: candidate.divisionText,
  participantOptionsText: candidate.participantOptionsText,
  priceText: candidate.priceText,
  statusText: candidate.statusText,
  registrationDeadlineText: candidate.registrationDeadlineText,
  officialActionUrl: candidate.officialActionUrl,
  sourceUrl: candidate.sourceUrl,
  description: candidate.description,
  publishedEventId: candidate.publishedEventId,
  publishedTeamId: candidate.publishedTeamId,
  publishedFacilityId: candidate.publishedFacilityId,
  publishedOrganizationId: candidate.publishedOrganizationId,
});

const stablePublicTarget = (
  target: AffiliateSupplyTargets,
): Readonly<Record<string, unknown>> => ({
  id: target.id,
  supplySourceId: target.supplySourceId,
  candidateId: target.candidateId,
  targetType: target.targetType,
  targetId: target.targetId,
  marketKey: target.marketKey,
  sportId: target.sportId,
  sourceProfile: target.sourceProfile,
  status: target.status,
  publishedAt: stableTimestamp(target.publishedAt),
  lastSuccessfulRefreshAt: stableTimestamp(target.lastSuccessfulRefreshAt),
  freshnessExpiresAt: stableTimestamp(target.freshnessExpiresAt),
  rejectedAt: stableTimestamp(target.rejectedAt),
  rejectionReason: target.rejectionReason,
  evidenceRefs: target.evidenceRefs,
  evidenceHash: target.evidenceHash,
  metadata: stableMetadata(target.metadata),
});

const boundedPublicRows = async <T>(
  delegate: Readonly<{ findMany(args: unknown): Promise<readonly T[]>; }> | undefined,
  args: unknown,
): Promise<PublicRowsRead<T>> => {
  if (!delegate?.findMany) {
    return { rows: [], status: "UNAVAILABLE" };
  }
  try {
    const rows = await delegate.findMany(args);
    if (!Array.isArray(rows)) return { rows: [], status: "UNAVAILABLE" };
    const truncated = rows.length > AFFILIATE_EXISTING_REPAIR_PUBLIC_STATE_MAX_ROWS;
    return {
      rows: rows.slice(0, AFFILIATE_EXISTING_REPAIR_PUBLIC_STATE_MAX_ROWS),
      status: truncated ? "TRUNCATED" : "COMPLETE",
    };
  } catch {
    return { rows: [], status: "UNAVAILABLE" };
  }
};

const publicStatusFromMetadata = (metadata: unknown): string[] => {
  const value = recordValue(metadata);
  const publication = recordValue(value.publication);
  const publicationState = recordValue(value.publicationState);
  return [
    value.publicationStatus,
    value.publicStatus,
    value.lifecycleStatus,
    publication.status,
    publicationState.status,
  ]
    .map((status) => String(status ?? "").trim().toUpperCase())
    .filter(Boolean);
};

const hasPublicMetadata = (metadata: unknown): boolean => {
  const value = recordValue(metadata);
  const publication = recordValue(value.publication);
  const publicationState = recordValue(value.publicationState);
  return value.isPublic === true
    || value.public === true
    || publication.isPublic === true
    || publication.public === true
    || publicationState.isPublic === true
    || publicationState.public === true
    || publicStatusFromMetadata(value).some((status) => PUBLIC_SOURCE_STATUSES[status] === true);
};

const hasPublicSourceState = (
  source: AffiliateScrapeSources,
  root: AffiliateSupplySources | null,
): boolean => (
  PUBLIC_SOURCE_STATUSES[String(source.status ?? "").trim().toUpperCase()] === true
  || hasPublicMetadata(source.metadata)
  || Boolean(root && (
    PUBLIC_SOURCE_STATUSES[String(root.freshnessStatus ?? "").trim().toUpperCase()] === true
    || hasPublicMetadata(root.metadata)
  ))
  || Boolean(root && String(root.targetContribution ?? "").trim().toUpperCase() === "PUBLIC")
  || Boolean(root && root.liveSourceId && source.id === root.liveSourceId && root.derivedStage === "PUBLISHED")
);

const previouslyPublicReplacement = (
  source: AffiliateScrapeSources,
  root: AffiliateSupplySources | null,
): boolean => [
  recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_METADATA_KEY]).isPublicReplacement,
  recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]).isPublicReplacement,
  recordValue(recordValue(root?.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_METADATA_KEY]).isPublicReplacement,
  recordValue(recordValue(root?.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]).isPublicReplacement,
].some((value) => value === true);


const stableSourceState = (
  source: AffiliateScrapeSources,
  root: AffiliateSupplySources | null,
  publicState: PublicStateSnapshot,
): Readonly<Record<string, unknown>> => ({
  id: source.id,
  supplySourceId: source.supplySourceId ?? null,
  sourceKey: source.sourceKey,
  name: source.name,
  organizationId: source.organizationId,
  baseUrl: source.baseUrl,
  listUrl: source.listUrl,
  targetKind: source.targetKind,
  status: source.status,
  activeMappingId: source.activeMappingId,
  lastScrapeRunId: source.lastScrapeRunId,
  lifecycleGeneration: source.lifecycleGeneration,
  activeSupplyContractVersion: source.activeSupplyContractVersion,
  activeSupplyContractHash: source.activeSupplyContractHash,
  autoScrapeEnabled: source.autoScrapeEnabled,
  scrapeIntervalMinutes: source.scrapeIntervalMinutes,
  notes: source.notes,
  metadata: stableMetadata(source.metadata),
  publicState,
  root: root
    ? {
      id: root.id,
      identityKey: root.identityKey,
      canonicalUrl: root.canonicalUrl,
      origin: root.origin,
      pathKey: root.pathKey,
      operatorDomain: root.operatorDomain,
      targetKind: root.targetKind,
      rolloutCohort: root.rolloutCohort,
      intakeId: root.intakeId,
      liveSourceId: root.liveSourceId,
      predecessorId: root.predecessorId,
      successorId: root.successorId,
      activeSupplyContractVersion: root.activeSupplyContractVersion,
      activeSupplyContractHash: root.activeSupplyContractHash,
      freshnessStatus: root.freshnessStatus,
      targetContribution: root.targetContribution,
      repairPriority: root.repairPriority,
      isAutomationEnabled: root.isAutomationEnabled,
      isExcluded: root.isExcluded,
      automationHoldReason: root.automationHoldReason,
      metadata: stableMetadata(root.metadata),
    }
    : null,
});

const stableMappingState = (
  mapping: AffiliateScrapeMappings | null,
): Readonly<Record<string, unknown>> | null => mapping
  ? {
    id: mapping.id,
    sourceId: mapping.sourceId,
    supplySourceId: mapping.supplySourceId,
    version: mapping.version,
    isActive: mapping.isActive,
    mapping: mapping.mapping,
    createdByUserId: mapping.createdByUserId,
    notes: mapping.notes,
    validatedAt: mapping.validatedAt?.toISOString?.() ?? mapping.validatedAt,
  }
  : null;

const stableOrganizationState = (
  organization: Organizations | null,
): Readonly<Record<string, unknown>> | null => organization
  ? {
    id: organization.id,
    name: organization.name,
    location: organization.location,
    address: organization.address,
    description: organization.description,
    logoId: organization.logoId,
    ownerId: organization.ownerId,
    website: organization.website,
    sports: organization.sports,
    enabledFeatures: organization.enabledFeatures,
    status: organization.status,
    hasStripeAccount: organization.hasStripeAccount,
    verificationStatus: organization.verificationStatus,
    verifiedAt: organization.verifiedAt?.toISOString?.() ?? organization.verifiedAt,
    verificationReviewStatus: organization.verificationReviewStatus,
    verificationReviewNotes: organization.verificationReviewNotes,
    verificationReviewUpdatedAt: organization.verificationReviewUpdatedAt?.toISOString?.()
      ?? organization.verificationReviewUpdatedAt,
    originType: organization.originType,
    ownershipStatus: organization.ownershipStatus,
    claimedAt: organization.claimedAt?.toISOString?.() ?? organization.claimedAt,
    claimedByUserId: organization.claimedByUserId,
    claimVerificationLevel: organization.claimVerificationLevel,
    ownershipVerifiedAt: organization.ownershipVerifiedAt?.toISOString?.()
      ?? organization.ownershipVerifiedAt,
    ownershipVerificationLastCheckedAt: organization.ownershipVerificationLastCheckedAt?.toISOString?.()
      ?? organization.ownershipVerificationLastCheckedAt,
    coordinates: organization.coordinates,
    productIds: organization.productIds,
    publicSlug: organization.publicSlug,
    publicPageEnabled: organization.publicPageEnabled,
    publicWidgetsEnabled: organization.publicWidgetsEnabled,
    brandPrimaryColor: organization.brandPrimaryColor,
    brandAccentColor: organization.brandAccentColor,
    publicHeadline: organization.publicHeadline,
    publicIntroText: organization.publicIntroText,
    embedAllowedDomains: organization.embedAllowedDomains,
    publicCompletionRedirectUrl: organization.publicCompletionRedirectUrl,
    taxOrganizationType: organization.taxOrganizationType,
    operatesAthleticFacility: organization.operatesAthleticFacility,
    defaultEventTaxHandling: organization.defaultEventTaxHandling,
    defaultRentalTaxHandling: organization.defaultRentalTaxHandling,
    taxResponsibilityAcceptedAt: organization.taxResponsibilityAcceptedAt?.toISOString?.()
      ?? organization.taxResponsibilityAcceptedAt,
    taxResponsibilityAcceptedByUserId: organization.taxResponsibilityAcceptedByUserId,
    taxResponsibilityAgreementVersion: organization.taxResponsibilityAgreementVersion,
  }
  : null;

const isPublicOrganization = (
  organization: Readonly<Record<string, unknown>> | null,
): boolean => {
  if (!organization) return false;
  const status = String(organization.status ?? "").trim().toUpperCase();
  return status === "LISTED"
    || organization.publicPageEnabled === true
    || organization.publicWidgetsEnabled === true;
};

const stateHash = (value: unknown): string => hashAffiliateAgentValue(value);
const loadPublicState = async (
  prisma: AffiliateExistingRepairPrisma,
  source: AffiliateScrapeSources,
  root: AffiliateSupplySources | null,
  workingMappingId: string | null,
  organization: Organizations | null,
): Promise<Readonly<{
  snapshot: PublicStateSnapshot;
  hasPublishedCandidate: boolean;
  hasPublishedTarget: boolean;
  hasUnavailableRead: boolean;
}>> => {
  const candidateRead = await boundedPublicRows(
    prisma.affiliateImportCandidates,
    {
      where: {
        OR: [
          { sourceId: source.id },
          ...(workingMappingId ? [{ mappingId: workingMappingId }] : []),
          ...(root ? [{ supplySourceId: root.id }] : []),
        ],
      },
      orderBy: { id: "asc" },
      take: AFFILIATE_EXISTING_REPAIR_PUBLIC_STATE_MAX_ROWS + 1,
    },
  );
  const targetRead = root
    ? await boundedPublicRows(
      prisma.affiliateSupplyTargets,
      {
        where: { supplySourceId: root.id },
        orderBy: [{ targetType: "asc" }, { targetId: "asc" }, { id: "asc" }],
        take: AFFILIATE_EXISTING_REPAIR_PUBLIC_STATE_MAX_ROWS + 1,
      },
    )
    : {
      rows: [] as readonly AffiliateSupplyTargets[],
      status: "NOT_APPLICABLE" as const,
    };
  const organizations = organization ? [stableOrganizationState(organization)!] : [];
  const publishedCandidates = candidateRead.rows
    .filter((candidate) => hasPublicAffiliateCandidate(
      candidate,
      source.organizationId,
      organizations,
    ))
    .map(stablePublicCandidate)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const publishedTargets = targetRead.rows
    .filter((target) => (
      !target.rejectedAt
      && PUBLIC_TARGET_STATUSES[String(target.status ?? "").trim().toUpperCase()] === true
    ))
    .map(stablePublicTarget)
    .sort((left, right) => (
      `${String(left.targetType)}:${String(left.targetId)}:${String(left.id)}`
        .localeCompare(`${String(right.targetType)}:${String(right.targetId)}:${String(right.id)}`)
    ));
  const organizationReadStatus = source.organizationId
    ? prisma.organizations?.findUnique
      ? organization ? "AVAILABLE" as const : "MISSING" as const
      : "UNAVAILABLE" as const
    : "NOT_APPLICABLE" as const;
  const hasUnavailableRead = candidateRead.status !== "COMPLETE"
    || (root !== null && targetRead.status !== "COMPLETE")
    || organizationReadStatus === "UNAVAILABLE";
  return {
    snapshot: {
      sourceStatus: source.status,
      sourceMetadata: stableMetadata(source.metadata),
      candidateReadStatus: candidateRead.status,
      targetReadStatus: targetRead.status,
      organizationReadStatus,
      publishedCandidates,
      publishedTargets,
    },
    hasPublishedCandidate: publishedCandidates.length > 0,
    hasPublishedTarget: publishedTargets.length > 0,
    hasUnavailableRead,
  };
};

/**
 * Capture the protected working state from the database. The hash excludes
 * row timestamps and the two server-owned repair metadata entries. It binds
 * the source, its current working mapping, and its organization state.
 */
export const captureAffiliateExistingRepairSourceState = async (
  prisma: AffiliateExistingRepairPrisma,
  sourceId: string,
  options: Readonly<{ resolvedRoot?: AffiliateSupplySources | null }> = {},
): Promise<AffiliateExistingDataRepairSourceState> => {
  const source = await prisma.affiliateScrapeSources.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Existing-data repair source was not found.');
  const supplySourceId = source.supplySourceId;
  const rootWasResolved = Object.prototype.hasOwnProperty.call(options, "resolvedRoot");
  const root = rootWasResolved
    ? options.resolvedRoot ?? null
    : supplySourceId
      ? await prisma.affiliateSupplySources.findUnique({ where: { id: supplySourceId } })
      : null;
  if (supplySourceId && (!root || root.id !== supplySourceId)) {
    throw new Error("Existing-data repair source backlink conflicts with the resolved Supply Source root.");
  }
  const workingMappingId = source.activeMappingId ?? null;
  const workingMapping = workingMappingId
    ? await prisma.affiliateScrapeMappings.findUnique({ where: { id: workingMappingId } })
    : null;
  if (workingMappingId && !workingMapping) {
    throw new Error("Existing-data repair working mapping was not found.");
  }
  const organizationReadAvailable = Boolean(source.organizationId && prisma.organizations?.findUnique);
  const organization = organizationReadAvailable
    ? await prisma.organizations!.findUnique({ where: { id: source.organizationId! } })
    : null;
  const publicState = await loadPublicState(
    prisma,
    source,
    root,
    workingMappingId,
    organization,
  );
  const sourceState = stableSourceState(source, root, publicState.snapshot);
  const workingMappingState = stableMappingState(workingMapping);
  const organizationState = stableOrganizationState(organization);
  const workingMappingStateSha256 = stateHash(workingMappingState ?? {});
  const organizationStateSha256 = organizationState ? stateHash(organizationState) : null;
  const isPublicReplacement = Boolean(
    workingMappingId
    || source.autoScrapeEnabled
    || root?.isAutomationEnabled
    || Boolean(workingMapping?.validatedAt)
    || isPublicOrganization(organizationState)
    || hasPublicSourceState(source, root)
    || publicState.hasPublishedCandidate
    || publicState.hasPublishedTarget
    || publicState.hasUnavailableRead
    || previouslyPublicReplacement(source, root)
  );
  const sourceStateSha256 = stateHash({
    source: sourceState,
    workingMapping: workingMappingState,
    organization: organizationState,
  });
  return {
    sourceStateSha256,
    workingMappingId,
    isPublicReplacement,
    sourceState,
    workingMappingState,
    organizationState,
    workingMappingStateSha256,
    organizationStateSha256,
  };
};

export const hashAffiliateExistingRepairSourceState = (
  state: Pick<AffiliateExistingDataRepairSourceState, "sourceState" | "workingMappingState" | "organizationState">,
): string => stateHash({
  source: state.sourceState,
  workingMapping: state.workingMappingState,
  organization: state.organizationState,
});

export const parseAffiliateExistingDataRepairContext = (
  value: unknown,
): AffiliateExistingDataRepairContext | null => {
  const parsed = affiliateAgentExistingDataRepairContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const parseAffiliateMappingRepairContext = (
  value: unknown,
): AffiliateAgentMappingRepairContext | null => {
  const parsed = affiliateAgentMappingRepairContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const readAffiliateExistingDataRepairPendingMapping = (
  value: unknown,
): AffiliateExistingDataRepairPendingMapping | null => {
  const parsed = affiliateExistingDataRepairPendingMappingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const pendingMappingForMetadata = (
  metadata: unknown,
): AffiliateExistingDataRepairPendingMapping | null => (
  readAffiliateExistingDataRepairPendingMapping(
    recordValue(metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY],
  )
);

export const existingDataRepairContextForMetadata = (
  metadata: unknown,
): AffiliateExistingDataRepairContext | null => (
  parseAffiliateExistingDataRepairContext(
    recordValue(metadata)[AFFILIATE_EXISTING_DATA_REPAIR_METADATA_KEY],
  )
);

export const metadataWithExistingDataRepairContext = (
  metadata: unknown,
  context: AffiliateAgentExistingDataRepairContext,
): Record<string, unknown> => ({
  ...recordValue(metadata),
  [AFFILIATE_EXISTING_DATA_REPAIR_METADATA_KEY]: context,
});

export const metadataWithPendingMapping = (
  metadata: unknown,
  pendingMapping: AffiliateExistingDataRepairPendingMapping,
): Record<string, unknown> => ({
  ...recordValue(metadata),
  [AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]: pendingMapping,
});

export const pendingMappingFor = (input: Readonly<{
  context: AffiliateExistingDataRepairContext;
  sourceState: AffiliateExistingDataRepairSourceState;
  postCommitSourceState?: AffiliateExistingDataRepairSourceState;
  mappingJobId: string;
  mappingSha256: string;
  mappingId: string;
  packageHash: string;
  candidatePackageHash?: string;
  candidateHash: string;
  evidenceHash: string;
  evidenceRefs: readonly string[];
  validationHash: string;
  validationReceiptId: string;
  producerClaimId?: string | null;
  producerJobId?: string | null;
  reviewerClaimId?: string | null;
  reviewerJobId?: string | null;
  now: Date;
  state?: "STAGED" | "APPROVED";
}>): AffiliateExistingDataRepairPendingMapping => {
  const evidenceRefs = Array.from(new Set(input.evidenceRefs)).sort();
  const sourceState = input.sourceState;
  const postCommitSourceState = input.postCommitSourceState ?? sourceState;
  return affiliateExistingDataRepairPendingMappingSchema.parse({
    schemaVersion: 1,
    kind: AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_KIND,
    state: input.state ?? "STAGED",
    supplySourceId: String(input.sourceState.sourceState.supplySourceId ?? ""),
    sourceId: input.context.sourceId,
    sourceIdentityKey: input.context.sourceIdentityKey,
    mappingSha256: input.mappingSha256,
    mappingJobId: input.mappingJobId,
    mappingId: input.mappingId,
    packageHash: input.packageHash,
    candidatePackageHash: input.candidatePackageHash ?? input.packageHash,
    candidateHash: input.candidateHash,
    evidenceHash: input.evidenceHash,
    evidenceRefs,
    validationHash: input.validationHash,
    validationReceiptId: input.validationReceiptId,
    admissionHash: input.context.admissionHash,
    sourceStateSha256: input.context.sourceStateSha256,
    postCommitSourceStateSha256: postCommitSourceState.sourceStateSha256,
    workingMappingId: input.context.workingMappingId,
    workingMappingStateSha256: sourceState.workingMappingStateSha256,
    postCommitWorkingMappingStateSha256: postCommitSourceState.workingMappingStateSha256,
    organizationStateSha256: sourceState.organizationStateSha256,
    postCommitOrganizationStateSha256: postCommitSourceState.organizationStateSha256,
    isPublicReplacement: input.context.isPublicReplacement,
    producerClaimId: input.producerClaimId ?? null,
    producerJobId: input.producerJobId ?? null,
    reviewerClaimId: input.reviewerClaimId ?? null,
    reviewerJobId: input.reviewerJobId ?? null,
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  });
};

export const pendingMappingHash = (pendingMapping: AffiliateExistingDataRepairPendingMapping): string => (
  hashAffiliateAgentValue(pendingMapping)
);
