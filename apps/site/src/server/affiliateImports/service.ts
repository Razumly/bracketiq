import { createHash } from "crypto";
import path from "path";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import {
  buildDivisionToken,
  deriveDivisionTypeDisplayName,
  normalizeDivisionTypeIds,
  type DivisionGender,
  type DivisionRatingType,
} from "@/lib/divisionTypes";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { slugifyPublicOrganizationName } from "@/lib/publicOrganizationSlug";
import { getStorageProvider } from "@/lib/storageProvider";
import {
  geocodeAddressToCoordinates,
  isValidGeocodeCoordinates,
} from "@/server/geocoding";
import { assertSafePublicUrl } from "./sourceIntakeUrlSafety";
import { acquireEventLock } from "@/server/repositories/locks";
import { syncEventDivisions } from "@/server/repositories/events";
import { applyEventSourceTransition } from "@/server/events/eventSourceTransition";
import {
  isMultiSportEventType,
  validateEventSportIds,
} from "@/server/eventSports";
import { syncEventTags } from "@/server/eventTags";
import { downloadPublicRemoteImage } from "@/server/publicRemoteImage";
import {
  isStaffingPriority,
  normalizeStaffingPriority,
  STAFFING_PRIORITIES,
  type StaffingPriority,
} from "@/server/officials/config";
import {
  extractAffiliateCandidatesFromPage,
  extractAffiliateFieldValuesFromPage,
  normalizeAffiliateCandidateDateTime,
  type AffiliateCandidateDateTimeInput,
} from "./mappingExtractor";
import {
  AFFILIATE_DATE_TIME_CONTRACT_VERSION,
  isValidAffiliateTimeZone,
} from "./affiliateDateTime";
import {
  inferAffiliateParticipantAvailability,
  parseAffiliateMaxParticipants,
} from "./participantAvailability";
import { scrapingDogClient } from "./scrapingDogClient";
import { inferAffiliateEventTagNames } from "./tags";
import {
  buildAffiliateEventLocationQueries,
  buildAffiliatePlaceLocationQueries,
  buildAffiliateSpecificEventLocationQueries,
  normalizeAffiliateCoordinates,
  normalizeAffiliateLocationSource,
} from "./locationResolution";
import {
  AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY,
  AFFILIATE_AUTOMATION_REVIEW_METADATA_KEY,
  affiliateAutomationDriftReasons,
  buildAffiliateAutomationBaseline,
  calculateAffiliateAutomationRunMetrics,
  parseAffiliateAutomationBaseline,
} from "./automationBaseline";
import {
  affiliateSupplyDatabase,
  deriveAndPersistAffiliateSupplyAssessment,
  ensureAffiliateSupplySource,
  executeAffiliateSupplyLifecycleCommand,
  loadActiveAffiliateSupplyContract,
  recordAffiliateCandidateReview,
} from './affiliateSupplyPersistence';
import type {
  AffiliateSupplyClient,
  AffiliateSupplyLifecycleTargetWrite,
  ExecuteAffiliateSupplyLifecycleCommandInput,
} from './affiliateSupplyPersistence';
import { normalizeAffiliateSupplyIdentity, targetRuleFor } from './affiliateSupplyLifecycle';
import { hashAffiliateAgentValue } from './agentGatewayContracts';
import { analyzeAffiliateDescriptionQuality } from "./descriptionQuality";
import {
  type AffiliateDateDisplayMode,
  type AffiliateCandidateInput,
  type AffiliateListingKind,
  type AffiliateScrapeMapping,
  parseAffiliateScrapeMapping,
  type ScrapePageClient,
  type ScrapedPage,

} from "./types";
import { affiliateOrganizationInitialOwnership } from "./organizationOwnership";
import { tryResolveTimeZoneFromCoordinates } from "@/server/timeZones";
type AffiliateCandidateRecord = AffiliateCandidateDateTimeInput & Readonly<{
  [key: string]: unknown;
  id?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  sourceId?: string | null;
  supplySourceId?: string | null;
  runId?: string | null;
  mappingId?: string | null;
  status?: string | null;
  dedupeKey?: string | null;
  formatName?: string | null;
  staffingPriority?: unknown;
  officialSchedulingMode?: unknown;
}>;

type AffiliateSourceCreateInput = {
  name: string;
  sourceKey: string;
  listUrl: string;
  targetKind?: string;
  organizationId?: string | null;
  baseUrl?: string | null;
  status?: string;
  autoScrapeEnabled?: boolean;
  scrapeIntervalMinutes?: number;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  mapping?: AffiliateScrapeMapping;
};

type AffiliateScrapeSourceRow = {
  id: string;
  name?: string | null;
  sourceKey?: string | null;
  activeMappingId: string | null;
  listUrl: string;
  organizationId?: string | null;
  baseUrl?: string | null;
  metadata?: unknown;
};

type AffiliateScrapeMappingRow = {
  id: string;
  sourceId: string;
  mapping: unknown;
  version?: number;
  validatedAt?: Date | string | null;
};

export type AffiliateScrapeImportMode = "REVIEW" | "AUTOMATIC";

const affiliatePrisma = (clientInput: any = prisma) => {
  const client = clientInput as any;
  return {
    sources: client.affiliateScrapeSources,
    mappings: client.affiliateScrapeMappings,
    runs: client.affiliateScrapeRuns,
    candidates: client.affiliateImportCandidates,
    events: client.events,
    teams: client.canonicalTeams,
    facilities: client.facilities,
    divisions: client.divisions,
    organizations: client.organizations,
    approvals: client.affiliateApprovalJobs,
    sports: client.sports,
    files: client.file,
  };
};
const withAffiliateScrapeTransaction = async <T>(
  client: any,
  callback: (transactionClient: any) => Promise<T>,
): Promise<T> => (
  typeof client?.$transaction === "function"
    ? client.$transaction(
        (transactionClient: any) => callback(transactionClient),
        { isolationLevel: "Serializable" },
      )
    : callback(client)
);

const nullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const affiliateStaffingPrioritySchema = {
  type: "string",
  enum: [...STAFFING_PRIORITIES],
  description: [
    "Canonical staffingPriority for an imported event.",
    "FULL_COVERAGE_REQUIRED requires Team-duty and every named Official Position.",
    "TEAM_COVERAGE_REQUIRED requires Team-duty only.",
    "OFFICIAL_COVERAGE_REQUIRED requires every named Official Position only.",
    "BEST_AVAILABLE_COVERAGE preserves the configured requirements and records unresolved gaps instead of silently changing them.",
    "FULL_COVERAGE_WITH_CONFLICTS_ALLOWED requires Team-duty and every named Official Position while allowing explicitly marked overlaps.",
    "doTeamsOfficiate independently controls participation and eligibility and never changes staffingPriority.",
  ].join(" "),
} as const;

const staffingPriorityFromAffiliateCandidate = (
  candidate: Record<string, unknown>,
): StaffingPriority => {
  const rawPayload = recordValue(candidate.rawPayload);
  const canonicalValue =
    nullableString(candidate.staffingPriority)?.toUpperCase() ??
    nullableString(rawPayload.staffingPriority)?.toUpperCase();
  if (isStaffingPriority(canonicalValue)) return canonicalValue;

  const legacyMode =
    candidate.officialSchedulingMode ?? rawPayload.officialSchedulingMode;
  return legacyMode === undefined
    ? "FULL_COVERAGE_WITH_CONFLICTS_ALLOWED"
    : normalizeStaffingPriority(undefined, legacyMode);
};

const sleep = (milliseconds: number): Promise<void> =>
  milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();

const AFFILIATE_DATE_DISPLAY_MODES = new Set([
  "SCHEDULED",
  "DATE_ONLY",
  "NO_FIXED_DATE",
  "ONGOING",
]);
const EVERGREEN_AFFILIATE_START_DATE = new Date("2099-12-31T12:00:00.000Z");

const normalizeDateDisplayMode = (value: unknown): AffiliateDateDisplayMode => {
  const normalized = nullableString(value)?.toUpperCase();
  return normalized && AFFILIATE_DATE_DISPLAY_MODES.has(normalized)
    ? (normalized as AffiliateDateDisplayMode)
    : "SCHEDULED";
};

const isEvergreenAffiliateCandidate = (candidate: AffiliateCandidateRecord): boolean => {
  const mode = normalizeDateDisplayMode(candidate?.dateDisplayMode);
  return mode === "NO_FIXED_DATE" || mode === "ONGOING";
};

const dateDisplayTextFromCandidate = (candidate: AffiliateCandidateRecord): string | null =>
  nullableString(candidate.dateDisplayText) ??
  (isEvergreenAffiliateCandidate(candidate)
    ? nullableString(candidate.scheduleText)
    : null) ??
  (isEvergreenAffiliateCandidate(candidate) ? "No fixed start date" : null);

const normalizeStatus = (value: unknown, fallback: string): string =>
  nullableString(value)?.toUpperCase() ?? fallback;

const parseDateOrNull = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDateText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/gi,
      "",
    )
    .trim();

const parseSourceDateOrNull = (
  value: string | null | undefined,
  params: { referenceYear?: number | null; endOfDay?: boolean } = {},
): Date | null => {
  const text = nullableString(value);
  if (!text) return null;
  const normalized = normalizeDateText(text);
  const hasYear = /\b\d{4}\b/.test(normalized);
  const year = Number.isInteger(params.referenceYear)
    ? params.referenceYear
    : new Date().getFullYear();
  const parsed = new Date(hasYear ? normalized : `${normalized}, ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (params.endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
};

const candidateStartDate = (
  candidate: AffiliateCandidateRecord,
): Date | null => {
  if (
    candidate.startsAt instanceof Date &&
    !Number.isNaN(candidate.startsAt.getTime())
  ) {
    return candidate.startsAt;
  }
  return parseDateOrNull(
    typeof candidate.startsAt === "string" ? candidate.startsAt : null,
  );
};

const candidateUpdatedAtDate = (candidate: AffiliateCandidateRecord): Date | null => {
  if (
    candidate?.updatedAt instanceof Date &&
    !Number.isNaN(candidate.updatedAt.getTime())
  ) {
    return candidate.updatedAt;
  }
  return parseDateOrNull(nullableString(candidate?.updatedAt));
};

const candidateRegistrationDeadline = (
  candidate: AffiliateCandidateRecord,
): Date | null => {
  const text = nullableString(candidate.registrationDeadlineText);
  if (!text) return null;
  const start = candidateStartDate(candidate);
  return parseSourceDateOrNull(text, {
    referenceYear: start?.getFullYear() ?? null,
    endOfDay: true,
  });
};

const isImportableCandidate = (
  candidate: AffiliateCandidateInput,
  now: Date = new Date(),
): boolean => {
  return candidateImportRejectionReasons(candidate, now).length === 0;
};

const isTryoutCandidate = (candidate: AffiliateCandidateRecord): boolean => {
  const haystack = [
    candidate.title,
    candidate.formatLabel,
    candidate.scheduleText,
    candidate.description,
    candidate.statusText,
    candidate.divisionText,
  ]
    .map((value) => nullableString(value)?.toLowerCase() ?? "")
    .join(" ");
  return /\btry[\s-]?outs?\b|\bevaluations?\b/.test(haystack);
};

const candidateTimeZoneRejectionReason = (
  candidate: AffiliateCandidateInput,
): string | null => {
  const dateDisplayMode = normalizeDateDisplayMode(candidate.dateDisplayMode);
  const requiresTimeZone =
    candidate.listingKind === "EVENT" &&
    (dateDisplayMode === "SCHEDULED" || dateDisplayMode === "DATE_ONLY");
  return requiresTimeZone &&
    !isValidAffiliateTimeZone(nullableString(candidate.timeZone) ?? "")
    ? "timeZone:MISSING_IANA_TIME_ZONE"
    : null;
};

const candidateStartRejectionReason = (
  candidate: AffiliateCandidateInput,
  now: Date,
): string | null => {
  const evergreen = isEvergreenAffiliateCandidate(candidate);
  if (evergreen) {
    return isTryoutCandidate(candidate) ? "tryouts cannot be evergreen" : null;
  }
  const start = candidateStartDate(candidate);
  return !start || start.getTime() <= now.getTime()
    ? (start ? "start is not in the future" : "missing source start date")
    : null;
};

const candidateDeadlineRejectionReason = (
  candidate: AffiliateCandidateInput,
  now: Date,
): string | null => {
  const registrationDeadline = candidateRegistrationDeadline(candidate);
  return registrationDeadline && registrationDeadline.getTime() < now.getTime()
    ? "registration deadline passed"
    : null;
};

const nonNullReasons = (reasons: Array<string | null>): string[] =>
  reasons.filter((reason): reason is string => Boolean(reason));

export const candidateImportRejectionReasons = (
  candidate: AffiliateCandidateInput,
  now: Date = new Date(),
): string[] => {
  if (candidate.listingKind === "RENTAL" || candidate.listingKind === "CLUB") {
    return [];
  }
  return nonNullReasons([
    candidateTimeZoneRejectionReason(candidate),
    candidateStartRejectionReason(candidate, now),
    candidateDeadlineRejectionReason(candidate, now),
  ]);
};

const assertEventOrTeamCandidateImportable = (candidate: AffiliateCandidateRecord) => {
  const start = candidateStartDate(candidate);
  if (
    isEvergreenAffiliateCandidate(candidate) &&
    isTryoutCandidate(candidate)
  ) {
    throw new Error("Affiliate tryout candidates cannot be evergreen.");
  }
  if (!isEvergreenAffiliateCandidate(candidate) && !start) {
    throw new Error(
      "Affiliate event candidates must include a valid start date from the source.",
    );
  }
  if (
    !isEvergreenAffiliateCandidate(candidate) &&
    start &&
    start.getTime() <= Date.now()
  ) {
    throw new Error("Affiliate event candidates must start in the future.");
  }
  const registrationDeadline = candidateRegistrationDeadline(candidate);
  if (registrationDeadline && registrationDeadline.getTime() < Date.now()) {
    throw new Error("Affiliate candidate registration deadline has passed.");
  }
};

const candidateValue = (
  candidate: AffiliateCandidateDateTimeInput,
  fieldName: string,
): string => {
  const value = (candidate as Record<string, unknown>)[fieldName];
  return typeof value === "string" ? value.trim().toLowerCase() : "";
};

export const buildAffiliateCandidateDedupeKey = (
  sourceId: string,
  candidate: AffiliateCandidateDateTimeInput,
  mapping?: AffiliateScrapeMapping,
): string => {
  const fields = mapping?.dedupe?.fields?.length
    ? mapping.dedupe.fields
    : ["officialActionUrl", "title", "startsAt"];
  const raw = [
    sourceId,
    ...fields.map((fieldName) => candidateValue(candidate, fieldName)),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
};
const affiliateNullableValue = <T>(
  value: T | null | undefined,
): T | null => (value === undefined ? null : value);

const affiliateValueOrDefault = <T>(
  value: T | null | undefined,
  fallback: T,
): T => (value == null ? fallback : value);

const candidatePersistencePayload = (
  candidate: AffiliateCandidateInput,
): Record<string, unknown> => {
  const rawPayload = {
    ...recordValue(candidate.rawPayload),
  };
  if (candidate.listingKind === "EVENT") {
    delete rawPayload.officialSchedulingMode;
    rawPayload.staffingPriority = staffingPriorityFromAffiliateCandidate(
      candidate as unknown as Record<string, unknown>,
    );
  }
  rawPayload.tags =
    candidate.listingKind === "EVENT"
      ? buildAffiliateEventTagNames(candidate)
      : [];
  rawPayload.normalizedImport = buildAffiliateImportMetadata(candidate);
  rawPayload.sportNames = candidateSportNames(candidate);
  return rawPayload;
};

const supplySourcePersistenceData = (
  supplySourceId: string | null | undefined,
): Record<string, string> =>
  supplySourceId ? { supplySourceId } : {};

const candidatePersistenceData = (params: {
  sourceId: string;
  supplySourceId?: string | null;
  runId: string;
  mappingId: string | null;
  dedupeKey: string;
  candidate: AffiliateCandidateInput;
}) => {
  const {
    sourceId,
    supplySourceId,
    runId,
    mappingId,
    dedupeKey,
    candidate,
  } = params;
  const rawPayload = candidatePersistencePayload(candidate);
  return {
    sourceId,
    ...supplySourcePersistenceData(supplySourceId),
    runId,
    mappingId,
    listingKind: candidate.listingKind,
    dedupeKey,
    title: candidate.title,
    organizerName: affiliateNullableValue(candidate.organizerName),
    sportName: affiliateNullableValue(candidate.sportName),
    formatLabel: affiliateNullableValue(candidate.formatLabel),
    city: affiliateNullableValue(candidate.city),
    venueName: affiliateNullableValue(candidate.venueName),
    address: affiliateNullableValue(candidate.address),
    startsAt: parseDateOrNull(candidate.startsAt),
    endsAt: parseDateOrNull(candidate.endsAt),
    timeZone: affiliateNullableValue(candidate.timeZone),
    scheduleText: affiliateNullableValue(candidate.scheduleText),
    dateDisplayMode: normalizeDateDisplayMode(candidate.dateDisplayMode),
    dateDisplayText: affiliateNullableValue(candidate.dateDisplayText),
    skillLevel: affiliateNullableValue(candidate.skillLevel),
    ageGroup: affiliateNullableValue(candidate.ageGroup),
    divisionText: affiliateNullableValue(candidate.divisionText),
    participantOptionsText: affiliateNullableValue(candidate.participantOptionsText),
    priceText: affiliateNullableValue(candidate.priceText),
    statusText: affiliateNullableValue(candidate.statusText),
    registrationDeadlineText: affiliateNullableValue(
      candidate.registrationDeadlineText,
    ),
    officialActionUrl: candidate.officialActionUrl,
    sourceUrl: candidate.sourceUrl,
    description: affiliateNullableValue(candidate.description),
    rawPayload,
    warnings: affiliateValueOrDefault(candidate.warnings, []),
  };
};

const affiliateCandidateDateTimeRepairData = (
  candidate: AffiliateCandidateDateTimeInput,
  dedupeKey: string,
) => {
  const rawPayload = recordValue(candidate.rawPayload);
  return {
    dedupeKey,
    startsAt: parseDateOrNull(candidate.startsAt),
    endsAt: parseDateOrNull(candidate.endsAt),
    timeZone: candidate.timeZone ?? null,
    dateDisplayMode: normalizeDateDisplayMode(candidate.dateDisplayMode),
    dateDisplayText: candidate.dateDisplayText ?? null,
    rawPayload: {
      ...rawPayload,
      normalizedImport: {
        ...recordValue(rawPayload.normalizedImport),
        ...buildAffiliateImportMetadata(candidate),
      },
    },
    warnings: candidate.warnings ?? [],
  };
};

const parseAffiliateCandidateMapping = (
  candidate: AffiliateCandidateRecord,
  mappingId: string,
  mappingValue: unknown,
): AffiliateScrapeMapping => {
  try {
    return parseAffiliateScrapeMapping(mappingValue);
  } catch {
    throw new Error(
      `Affiliate candidate ${candidate?.id ?? "unknown"} references invalid mapping ${mappingId}; ` +
        "repair cannot safely recalculate its dedupe key.",
    );
  }
};

const mappingForAffiliateCandidateDedupe = async (
  candidate: AffiliateCandidateRecord,
  client: any = prisma,
): Promise<AffiliateScrapeMapping | undefined> => {
  const mappingId = nullableString(candidate?.mappingId);
  if (!mappingId) return undefined;
  const mappingRow = await affiliatePrisma(client).mappings.findUnique({
    where: { id: mappingId },
  });
  if (!mappingRow?.mapping) {
    throw new Error(
      `Affiliate candidate ${candidate?.id ?? "unknown"} references missing mapping ${mappingId}; ` +
        "repair cannot safely recalculate its dedupe key.",
    );
  }
  return parseAffiliateCandidateMapping(candidate, mappingId, mappingRow.mapping);
};

const AFFILIATE_SPORT_REVIEW_WARNING =
  "Sport mapping is not a canonical Sports.name; human review is required.";

const quarantineAffiliateCandidateTarget = async (
  candidate: AffiliateCandidateRecord,
  client: any = prisma,
): Promise<void> => {
  const { events, facilities, organizations } = affiliatePrisma(client);
  const eventId = nullableString(candidate.publishedEventId);
  if (eventId) {
    await events.updateMany({
      where: { id: eventId, state: "PUBLISHED" },
      data: { state: "UNPUBLISHED", updatedAt: new Date() },
    });
  }
  const facilityId = nullableString(candidate.publishedFacilityId);
  if (facilityId) {
    await facilities.updateMany({
      where: { id: facilityId, status: "ACTIVE" },
      data: { status: "DRAFT", updatedAt: new Date() },
    });
  }
  const organizationId = nullableString(candidate.publishedOrganizationId);
  if (organizationId) {
    await organizations.updateMany({
      where: {
        id: organizationId,
        status: "LISTED",
        publicPageEnabled: true,
        ownershipStatus: "UNCLAIMED",
      },
      data: {
        status: "UNLISTED",
        publicPageEnabled: false,
        updatedAt: new Date(),
      },
    });
  }
};

export const listAffiliateSources = async () => {
  const { sources, mappings, runs } = affiliatePrisma();
  const rows = await sources.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  const lastRunIds = rows
    .map((source: any) => nullableString(source.lastScrapeRunId))
    .filter((runId: string | null): runId is string => Boolean(runId));
  const lastRuns = lastRunIds.length
    ? await runs.findMany({
        where: { id: { in: lastRunIds } },
        select: {
          id: true,
          status: true,
          finishedAt: true,
          itemCount: true,
          candidateCount: true,
          errorMessage: true,
          logs: true,
        },
      })
    : [];
  const lastRunById = new Map(lastRuns.map((run: any) => [run.id, run]));
  return Promise.all(
    rows.map(async (source: any) => {
      const mapping = source.activeMappingId
        ? await mappings.findUnique({
            where: { id: source.activeMappingId },
            select: { id: true, version: true, validatedAt: true },
          })
        : null;
      return {
        ...source,
        activeMappingVersion: mapping?.version ?? null,
        activeMappingValidatedAt: mapping?.validatedAt ?? null,
        lastScrapeRun: nullableString(source.lastScrapeRunId)
          ? (lastRunById.get(source.lastScrapeRunId) ?? null)
          : null,
      };
    }),
  );
};

const createAffiliateSupplySourceIfReady = async (
  input: AffiliateSourceCreateInput,
  sourceId: string,
  isLifecycleReady: boolean,
  supplyDatabase: any,
) => (
  isLifecycleReady
    ? ensureAffiliateSupplySource({
        requestedUrl: input.listUrl,
        resolvedCanonicalUrl: input.listUrl,
        isRedirectVerified: true,
        targetKind: input.targetKind,
        liveSourceId: sourceId,
        db: supplyDatabase,
      })
    : null
);

const affiliateSourceCreateData = (
  input: AffiliateSourceCreateInput,
  sourceId: string,
  isLifecycleReady: boolean,
) => ({
  id: sourceId,
  name: input.name.trim(),
  sourceKey: input.sourceKey.trim(),
  organizationId: nullableString(input.organizationId),
  baseUrl: nullableString(input.baseUrl),
  listUrl: input.listUrl.trim(),
  targetKind: normalizeStatus(input.targetKind, "EVENT"),
  status: normalizeStatus(input.status, "ACTIVE"),
  autoScrapeEnabled: isLifecycleReady ? false : input.autoScrapeEnabled === true,
  scrapeIntervalMinutes:
    typeof input.scrapeIntervalMinutes === "number" &&
    Number.isInteger(input.scrapeIntervalMinutes) &&
    input.scrapeIntervalMinutes >= 60
      ? input.scrapeIntervalMinutes
      : 1440,
  notes: nullableString(input.notes),
  metadata: input.metadata ?? null,
});

const affiliateSourceMappingData = (
  input: AffiliateSourceCreateInput,
  sourceId: string,
  supply: any,
  isLifecycleReady: boolean,
  adminUserId: string | undefined,
) => ({
  id: createId(),
  sourceId,
  ...(supply ? { supplySourceId: supply.supplySource.id } : {}),
  version: 1,
  isActive: !isLifecycleReady,
  mapping: input.mapping,
  createdByUserId: adminUserId ?? null,
});

const createAffiliateSourceInTransaction = async (
  input: AffiliateSourceCreateInput,
  adminUserId: string | undefined,
  transactionClient: any,
) => {
  const { sources, mappings } = affiliatePrisma(transactionClient);
  const sourceId = createId();
  const supplyDatabase = affiliateSupplyDatabase(transactionClient);
  const isLifecycleReady = Boolean(supplyDatabase.supplySources?.findUnique);
  const source = await sources.create({
    data: affiliateSourceCreateData(input, sourceId, isLifecycleReady),
  });
  const supply = await createAffiliateSupplySourceIfReady(
    input,
    sourceId,
    isLifecycleReady,
    supplyDatabase,
  );
  if (supply) {
    await sources.update({
      where: { id: sourceId },
      data: { supplySourceId: supply.supplySource.id },
    });
  }
  if (!input.mapping) {
    return supply
      ? { ...source, supplySourceId: supply.supplySource.id }
      : source;
  }
  const mapping = await mappings.create({
    data: affiliateSourceMappingData(
      input,
      sourceId,
      supply,
      isLifecycleReady,
      adminUserId,
    ),
  });
  return sources.update({
    where: { id: sourceId },
    data: { activeMappingId: mapping.id },
  });
};

export const createAffiliateSource = async (
  input: AffiliateSourceCreateInput,
  adminUserId?: string,
) =>
  withAffiliateScrapeTransaction(
    prisma,
    (transactionClient: any) =>
      createAffiliateSourceInTransaction(input, adminUserId, transactionClient),
  );

const assertAffiliateSourceAutomationSource = (source: any): void => {
  if (!source) throw new Error("Affiliate scrape source not found.");
  if (!source.activeMappingId) {
    throw new Error("No active scrape mapping is configured for this source.");
  }
};

const assertAffiliateSourceAutomationMapping = (
  source: any,
  mapping: any,
): void => {
  if (!mapping || mapping.sourceId !== source.id) {
    throw new Error("The active scrape mapping does not belong to this source.");
  }
};

const assertAffiliateSourceAutomationRun = (latestRun: any): void => {
  if (!latestRun) {
    throw new Error(
      "Run and review a successful first-pass scrape before enabling automatic imports.",
    );
  }
};

const assertAffiliateSourceAutomationBaseline = (baseline: any): void => {
  if (baseline.candidateCount === 0) {
    throw new Error(
      "The first-pass scrape must contain at least one reviewable candidate before automatic imports can be enabled.",
    );
  }
};

type AffiliateSourceAutomationApprovalContext = Readonly<{
  source: any;
  mapping: any;
  latestRun: any;
  baseline: any;
  mappingPackageHash: string;
  approvedAt: Date;
  supplyDatabase: any;
  activeContract: any;
  sources: any;
  mappings: any;
  candidates: any;
}>;

const loadAffiliateSourceAutomationApprovalContext = async (
  sourceId: string,
  transactionClient: any,
): Promise<AffiliateSourceAutomationApprovalContext> => {
  const { sources, mappings, runs, candidates } = affiliatePrisma(transactionClient);
  const supplyDatabase = affiliateSupplyDatabase(transactionClient);
  const source = await sources.findUnique({ where: { id: sourceId } });
  assertAffiliateSourceAutomationSource(source);
  const mapping = await mappings.findUnique({ where: { id: source.activeMappingId } });
  assertAffiliateSourceAutomationMapping(source, mapping);
  const latestRun = await runs.findFirst({
    where: { sourceId, mappingId: mapping.id, status: "SUCCEEDED" },
    orderBy: { startedAt: "desc" },
  });
  assertAffiliateSourceAutomationRun(latestRun);
  const baselineCandidates = await candidates.findMany({
    where: { runId: latestRun.id },
    select: {
      listingKind: true,
      title: true,
      officialActionUrl: true,
      sourceUrl: true,
      startsAt: true,
      dateDisplayMode: true,
      city: true,
      venueName: true,
      address: true,
      priceText: true,
    },
  });
  const runLogs = recordValue(latestRun.logs);
  const approvedAt = new Date();
  const baseline = buildAffiliateAutomationBaseline({
    mappingId: mapping.id,
    mappingVersion: Number.isInteger(mapping.version) ? mapping.version : 1,
    approvedAt,
    candidates: baselineCandidates,
    rejectedCount: typeof runLogs.rejectedCount === "number" ? runLogs.rejectedCount : 0,
  });
  assertAffiliateSourceAutomationBaseline(baseline);
  const mappingPackageHash = hashAffiliateAgentValue(mapping.mapping ?? {});
  const isLifecycleReady = Boolean(
    source.supplySourceId
      && typeof supplyDatabase.supplySources.findUnique === "function"
      && typeof supplyDatabase.approvals.upsert === "function"
      && typeof supplyDatabase.transitions.create === "function",
  );
  const activeContract = isLifecycleReady
    ? await loadActiveAffiliateSupplyContract({ db: supplyDatabase })
    : null;
  return {
    source,
    mapping,
    latestRun,
    baseline,
    mappingPackageHash,
    approvedAt,
    supplyDatabase,
    activeContract,
    sources,
    mappings,
    candidates,
  };
};

const approveAffiliateSourceThroughLifecycle = async (
  context: AffiliateSourceAutomationApprovalContext,
  sourceId: string,
  adminUserId: string,
) => {
  const currentRoot = await context.supplyDatabase.supplySources.findUnique({
    where: { id: context.source.supplySourceId },
  });
  if (!currentRoot) {
    throw new Error("Affiliate Supply Source root not found.");
  }
  await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: context.source.supplySourceId,
    command: "APPROVE",
    authority: "SUPPLY_REVIEWER",
    expectedLifecycleGeneration: currentRoot.lifecycleGeneration,
    idempotencyKey: `approve:${context.mapping.id}:${context.baseline.normalizedFieldsHash}`,
    request: {
      sourceId,
      mappingId: context.mapping.id,
      packageHash: context.mappingPackageHash,
      baseline: context.baseline,
      evidenceRefs: [`mapping:${context.mapping.id}`, `run:${context.latestRun.id}`],
      lifecycleEvidenceKinds: ["DURABLE_SOURCE_EVIDENCE", "VALIDATION_OUTPUT"],
    },
    actorKind: "SUPPLY_REVIEWER",
    actorId: adminUserId,
    db: context.supplyDatabase,
    now: context.approvedAt,
  });
  return context.sources.findUnique({ where: { id: sourceId } });
};

const approveAffiliateSourceWithoutLifecycle = async (
  context: AffiliateSourceAutomationApprovalContext,
  adminUserId: string,
) => {
  await context.mappings.update({
    where: { id: context.mapping.id },
    data: {
      validatedAt: context.approvedAt,
      notes: [
        nullableString(context.mapping.notes),
        `Mapping reviewed by ${adminUserId} on ${context.approvedAt.toISOString()}`,
      ].filter(Boolean).join("\n"),
    },
  });
  return context.sources.update({
    where: { id: context.source.id },
    data: {
      autoScrapeEnabled: false,
      metadata: {
        ...recordValue(context.source.metadata),
        [AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY]: context.baseline,
        [AFFILIATE_AUTOMATION_REVIEW_METADATA_KEY]: {
          hold: true,
          reason: "SUPPLY_SOURCE_ROOT_REQUIRED",
        },
      },
    },
  });
};

const approveAffiliateSourceInTransaction = async (
  sourceId: string,
  adminUserId: string,
  transactionClient: any,
) => {
  const context = await loadAffiliateSourceAutomationApprovalContext(
    sourceId,
    transactionClient,
  );
  if (
    context.activeContract &&
    context.source.supplySourceId
  ) {
    return approveAffiliateSourceThroughLifecycle(context, sourceId, adminUserId);
  }
  return approveAffiliateSourceWithoutLifecycle(context, adminUserId);
};

export const approveAffiliateSourceAutomation = async (
  sourceId: string,
  adminUserId: string,
) =>
  withAffiliateScrapeTransaction(
    prisma,
    (transactionClient: any) =>
      approveAffiliateSourceInTransaction(
        sourceId,
        adminUserId,
        transactionClient,
      ),
  );
export type AffiliateSourceActivationInput = Readonly<{
  candidateReviewId: string;
}>;
export const recordAffiliateSourceCandidateReview = recordAffiliateCandidateReview;

type DeferredAffiliateOrganizationLogo = Readonly<{
  candidateId: string;
  organizationId: string;
}>;

const loadAffiliateSourceActivationContext = async (
  sourceId: string,
  transactionClient: any,
) => {
  const { sources, mappings } = affiliatePrisma(transactionClient);
  const supplyDatabase = affiliateSupplyDatabase(transactionClient);
  const source = await sources.findUnique({ where: { id: sourceId } });
  if (!source?.supplySourceId) {
    throw new Error("Affiliate source is not linked to a Supply Source root.");
  }
  if (!source.activeMappingId) {
    throw new Error("No active scrape mapping is configured for this source.");
  }
  const mapping = await mappings.findUnique({ where: { id: source.activeMappingId } });
  if (!mapping || mapping.sourceId !== source.id) {
    throw new Error("The active scrape mapping does not belong to this source.");
  }
  const baseline = parseAffiliateAutomationBaseline(
    recordValue(source.metadata)[AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY],
  );
  if (!baseline) {
    throw new Error("Affiliate source has no reviewed automation baseline.");
  }
  const root = await supplyDatabase.supplySources.findUnique({
    where: { id: source.supplySourceId },
  });
  if (!root) {
    throw new Error("Affiliate Supply Source root not found.");
  }
  return {
    sources,
    source,
    mapping,
    baseline,
    root,
    supplyDatabase,
    mappingPackageHash: hashAffiliateAgentValue(mapping.mapping ?? {}),
  };
};

const affiliateActivationEvidenceRefs = (
  target: Record<string, unknown>,
): string[] =>
  Array.isArray(target.evidenceRefs)
    ? target.evidenceRefs.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

export const publishAffiliateActivationTarget = async (params: {
  client: AffiliateSupplyClient;
  target: Record<string, unknown>;
  adminUserId: string;
  deferredOrganizationLogos: DeferredAffiliateOrganizationLogo[];
  candidate?: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
}) => {
  const candidateId = nullableString(params.target.candidateId);
  if (!candidateId) {
    throw new Error("Affiliate activation target requires a candidate.");
  }
  const candidate = params.candidate
    ?? await affiliatePrisma(params.client).candidates.findUnique({
      where: { id: candidateId },
    });
  if (!candidate) {
    throw new Error("Affiliate import candidate not found.");
  }
  const targetRoute = affiliateTargetRouteForCandidate(candidate);
  if (!targetRoute) {
    throw new Error("Affiliate listing kind is required for lifecycle activation.");
  }
  const publishedTarget = await publishAffiliateCandidateDirect(candidateId, {
    publishedByUserId: params.adminUserId,
    deferOrganizationLogo: targetRoute.targetType === "ORGANIZATION",
    client: params.client,
    candidate,
    source: params.source,
  });
  if (!publishedTarget?.id) {
    throw new Error("Affiliate lifecycle activation did not publish a target.");
  }
  if (targetRoute.targetType === "ORGANIZATION") {
    params.deferredOrganizationLogos.push({
      candidateId,
      organizationId: String(publishedTarget.id),
    });
  }
  return {
    targetType: targetRoute.targetType,
    targetId: String(publishedTarget.id),
    sourceProfile:
      nullableString(params.target.sourceProfile) ?? targetRoute.listingKind,
    candidateId,
    marketKey: nullableString(params.target.marketKey),
    sportId: nullableString(params.target.sportId),
    evidenceRefs: affiliateActivationEvidenceRefs(params.target),
  };
};
type AffiliateSupplyActivationTargetWriter = NonNullable<
  ExecuteAffiliateSupplyLifecycleCommandInput["activationTargetWriter"]
>;

export type AffiliateSupplyActivationTargetWriterBinding = Readonly<{
  actorId: string;
  claimId: string;
  claimGeneration: number;
  invocationId: string;
  supplySourceId: string;
}>;

export const createAffiliateSupplyActivationTargetWriter = (
  binding: AffiliateSupplyActivationTargetWriterBinding,
): AffiliateSupplyActivationTargetWriter => {
  const actorId = nullableString(binding.actorId);
  if (
    !actorId
    || !nullableString(binding.claimId)
    || !nullableString(binding.invocationId)
    || !Number.isInteger(binding.claimGeneration)
    || binding.claimGeneration < 1
    || !nullableString(binding.supplySourceId)
  ) {
    throw new Error("Affiliate lifecycle activation target writer binding is incomplete.");
  }
  return async ({
    database,
    client,
    request,
    target,
    candidate,
  }): Promise<AffiliateSupplyLifecycleTargetWrite> => {
    const requestClaimGeneration = typeof request.reviewerClaimGeneration === "number"
      ? request.reviewerClaimGeneration
      : null;
    if (
      nullableString(request.reviewerWorkerId) !== actorId
      || nullableString(request.reviewerClaimId) !== binding.claimId
      || nullableString(request.reviewerInvocationId) !== binding.invocationId
      || requestClaimGeneration !== binding.claimGeneration
      || nullableString(request.reviewerSupplySourceId) !== binding.supplySourceId
    ) {
      throw new Error("Affiliate lifecycle activation target writer is not bound to the admitted reviewer.");
    }
    const candidateId = nullableString(candidate.id);
    if (!candidateId || nullableString(target.candidateId) !== candidateId) {
      throw new Error("Affiliate lifecycle activation target writer candidate identity is invalid.");
    }
    const root = await database.supplySources.findUnique({
      where: { id: binding.supplySourceId },
    });
    if (!root) {
      throw new Error("Affiliate lifecycle activation target writer Supply Source root is unavailable.");
    }
    const currentCandidate = await database.candidates.findUnique({
      where: { id: candidateId },
    });
    if (!currentCandidate || currentCandidate.id !== candidateId) {
      throw new Error("Affiliate lifecycle activation target writer candidate is unavailable.");
    }
    const currentCandidateSourceId = nullableString(currentCandidate.sourceId);
    if (!currentCandidateSourceId) {
      throw new Error("Affiliate lifecycle activation target writer candidate source is unavailable.");
    }
    const currentSource = await database.sources.findUnique({
      where: { id: currentCandidateSourceId },
    });
    if (
      !currentSource
      || nullableString(currentSource.supplySourceId) !== binding.supplySourceId
      || (
        nullableString(request.sourceId)
        && nullableString(request.sourceId) !== currentSource.id
      )
    ) {
      throw new Error("Affiliate lifecycle activation target writer source lineage is invalid.");
    }
    const currentListingKind = nullableString(currentCandidate.listingKind)?.toUpperCase();
    const reviewedListingKind = nullableString(candidate.listingKind)?.toUpperCase();
    if (!currentListingKind || (reviewedListingKind && currentListingKind !== reviewedListingKind)) {
      throw new Error("Affiliate lifecycle activation target writer candidate kind is stale.");
    }
    if (nullableString(currentCandidate.status)?.toUpperCase() === "REJECTED") {
      throw new Error("Affiliate lifecycle activation target writer cannot publish a rejected candidate.");
    }
    const expectedTargetType = ({
      EVENT: "EVENT",
      TEAM: "TEAM",
      RENTAL: "FACILITY",
      CLUB: "ORGANIZATION",
    } as const)[currentListingKind as "EVENT" | "TEAM" | "RENTAL" | "CLUB"];
    if (
      !expectedTargetType
      || nullableString(target.targetType)?.toUpperCase() !== expectedTargetType
    ) {
      throw new Error("Affiliate lifecycle activation target writer target kind is invalid.");
    }
    const publishedIdField = ({
      EVENT: "publishedEventId",
      TEAM: "publishedTeamId",
      RENTAL: "publishedFacilityId",
      CLUB: "publishedOrganizationId",
    } as const)[currentListingKind as "EVENT" | "TEAM" | "RENTAL" | "CLUB"];
    if (nullableString(currentCandidate[publishedIdField])) {
      throw new Error("Affiliate lifecycle activation target writer candidate already has a target.");
    }
    const currentCandidateForPublication: AffiliateCandidateRecord = {
      ...currentCandidate,
      listingKind: normalizeListingKind(currentCandidate.listingKind),
      rawPayload: recordValue(currentCandidate.rawPayload),
    };
    return publishAffiliateActivationTarget({
      client,
      candidate: currentCandidateForPublication,
      target,
      adminUserId: actorId,
      deferredOrganizationLogos: [],
      source: currentSource,
    });
  };
};

const activateAffiliateSourceInTransaction = async (
  sourceId: string,
  adminUserId: string,
  input: AffiliateSourceActivationInput,
  transactionClient: any,
) => {
  const context = await loadAffiliateSourceActivationContext(
    sourceId,
    transactionClient,
  );
  const now = new Date();
  const deferredOrganizationLogos: DeferredAffiliateOrganizationLogo[] = [];
  await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: context.source.supplySourceId,
    command: "ACTIVATE",
    authority: "SUPPLY_REVIEWER",
    expectedLifecycleGeneration: context.root.lifecycleGeneration,
    idempotencyKey: `activate:${context.mapping.id}:${context.baseline.normalizedFieldsHash}:${hashAffiliateAgentValue(input)}`,
    request: {
      sourceId,
      mappingId: context.mapping.id,
      packageHash: context.mappingPackageHash,
      baselineHash: context.baseline.normalizedFieldsHash,
      candidateReviewId: input.candidateReviewId,
      evidenceRefs: [
        `mapping:${context.mapping.id}`,
        `supply-source:${context.source.supplySourceId}`,
        `candidate-review:${input.candidateReviewId}`,
      ],
    },
    actorKind: "SUPPLY_REVIEWER",
    actorId: adminUserId,
    db: context.supplyDatabase,
    activationTargetWriter: ({ client, target }) =>
      publishAffiliateActivationTarget({
        client,
        target,
        adminUserId,
        deferredOrganizationLogos,
      }),
    now,
  });
  const committedSource = await context.sources.findUnique({
    where: { id: sourceId },
  });
  if (!committedSource) {
    throw new Error("Affiliate source disappeared after lifecycle activation.");
  }
  return { source: committedSource, deferredOrganizationLogos };
};

const replayAffiliateOrganizationCandidateIds = (
  candidateReview: any,
): Set<string> => {
  const reviewDecision = recordValue(candidateReview?.decision);
  const reviewTargets = Array.isArray(reviewDecision.targets)
    ? reviewDecision.targets.filter(
        (target): target is Record<string, unknown> => (
          Boolean(target) && typeof target === "object" && !Array.isArray(target)
        ),
      )
    : [];
  return new Set(
    reviewTargets
      .filter((target) => (
        nullableString(target.targetType)?.toUpperCase() === "ORGANIZATION" &&
        (nullableString(target.status)?.toUpperCase() ?? "PUBLISHED") === "PUBLISHED"
      ))
      .map((target) => nullableString(target.candidateId))
      .filter((candidateId): candidateId is string => Boolean(candidateId)),
  );
};

const replayAffiliateOrganizationLogos = async (
  input: AffiliateSourceActivationInput,
  adminUserId: string,
  committed: {
    deferredOrganizationLogos: DeferredAffiliateOrganizationLogo[];
  },
) => {
  const { candidates, approvals } = affiliatePrisma();
  const candidateReview =
    typeof approvals?.findUnique === "function"
      ? await approvals.findUnique({ where: { id: input.candidateReviewId } })
      : null;
  const replayIds = replayAffiliateOrganizationCandidateIds(candidateReview);
  const deferred = committed.deferredOrganizationLogos;
  const byCandidate = new Map(
    deferred.map((logo) => [logo.candidateId, logo.organizationId]),
  );
  const candidateIds = Array.from(new Set([
    ...deferred.map((logo) => logo.candidateId),
    ...replayIds,
  ]));
  if (!candidateIds.length || typeof candidates.findMany !== "function") {
    return;
  }
  const candidateRows = await candidates.findMany({
    where: { id: { in: candidateIds } },
  }) as Array<AffiliateCandidateRecord>;
  for (const candidate of candidateRows) {
    const candidateId = nullableString(candidate?.id);
    if (!candidateId) continue;
    const organizationId =
      byCandidate.get(candidateId) ??
      nullableString(candidate.publishedOrganizationId);
    if (!organizationId) continue;
    await upsertAffiliateOrganizationLogoForCandidate(
      candidate,
      organizationId,
      adminUserId,
      prisma,
      { assignOrganizationLogo: true },
    );
  }
};

export const activateAffiliateSourceAutomation = async (
  sourceId: string,
  adminUserId: string,
  input: AffiliateSourceActivationInput,
) => {
  const committed = await withAffiliateScrapeTransaction(
    prisma,
    (transactionClient: any) =>
      activateAffiliateSourceInTransaction(
        sourceId,
        adminUserId,
        input,
        transactionClient,
      ),
  );
  await replayAffiliateOrganizationLogos(input, adminUserId, committed);
  return committed.source;
};

const normalizeSourceType = (value: unknown): string | null =>
  nullableString(value)?.toUpperCase() ?? null;

const normalizeListingKind = (value: unknown): AffiliateListingKind => {
  const normalized = normalizeSourceType(value);
  if (
    normalized === "EVENT" ||
    normalized === "TEAM" ||
    normalized === "RENTAL" ||
    normalized === "CLUB"
  ) {
    return normalized;
  }
  throw new Error(
    "Affiliate listing kind must be EVENT, TEAM, RENTAL, or CLUB.",
  );
};
type AffiliatePublishedTargetType =
  | "EVENT"
  | "TEAM"
  | "FACILITY"
  | "ORGANIZATION";

type AffiliateTargetRoute = Readonly<{
  listingKind: AffiliateListingKind;
  targetType: AffiliatePublishedTargetType;
  publishedIdField:
    | "publishedEventId"
    | "publishedTeamId"
    | "publishedFacilityId"
    | "publishedOrganizationId";
}>;

const affiliateTargetRouteForListingKind = (
  listingKind: unknown,
): AffiliateTargetRoute | null => {
  const normalized = normalizeSourceType(listingKind);
  if (normalized === "EVENT") {
    return { listingKind: "EVENT", targetType: "EVENT", publishedIdField: "publishedEventId" };
  }
  if (normalized === "TEAM") {
    return { listingKind: "TEAM", targetType: "TEAM", publishedIdField: "publishedTeamId" };
  }
  if (normalized === "RENTAL") {
    return { listingKind: "RENTAL", targetType: "FACILITY", publishedIdField: "publishedFacilityId" };
  }
  if (normalized === "CLUB") {
    return { listingKind: "CLUB", targetType: "ORGANIZATION", publishedIdField: "publishedOrganizationId" };
  }
  return null;
};

const affiliateTargetRouteForCandidate = (
  candidate: AffiliateCandidateRecord,
): (AffiliateTargetRoute & { targetId: string | null }) | null => {
  const route = affiliateTargetRouteForListingKind(candidate?.listingKind);
  return route
    ? { ...route, targetId: nullableString(candidate?.[route.publishedIdField]) }
    : null;
};

const publishedEventIdFromCandidate = (candidate: AffiliateCandidateRecord): string | null =>
  nullableString(candidate?.publishedEventId);

const publishedTeamIdFromCandidate = (candidate: AffiliateCandidateRecord): string | null =>
  nullableString(candidate?.publishedTeamId);

const publishedOrganizationIdFromCandidate = (candidate: AffiliateCandidateRecord): string | null =>
  nullableString(candidate?.publishedOrganizationId);

const slugifyForId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "item";

const filenameFromUrl = (url: string, fallback: string): string => {
  try {
    const parsed = new URL(url);
    const basename = path.basename(parsed.pathname);
    return basename || fallback;
  } catch {
    return fallback;
  }
};

const normalizeAffiliateOrganizationLogo = async (
  input: Buffer,
): Promise<Buffer> => {
  const flattened = await sharp(input, {
    animated: false,
    limitInputPixels: 25_000_000,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  const trimmed = await sharp(flattened)
    .trim({ background: "#ffffff", threshold: 10 })
    .png()
    .toBuffer()
    .catch(async () => flattened);
  const logo = await sharp(trimmed)
    .resize({ width: 820, height: 820, fit: "inside" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
};

const affiliateOrganizationLogoId = (organizationId: string): string =>
  `${slugifyForId(organizationId)}_logo`;

const parseFirstPositiveInteger = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;
  const match = text.match(/\b([1-9]\d{0,2})\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseMaxParticipants = parseAffiliateMaxParticipants;

const rawExtractedCandidateFields = (
  candidate: AffiliateCandidateRecord,
): Record<string, unknown> => {
  const rawPayload = recordValue(candidate?.rawPayload);
  const detailPage = recordValue(rawPayload.detailPage);
  return {
    ...recordValue(rawPayload.extractedFields),
    ...recordValue(detailPage.extractedFields),
  };
};

const normalizeAffiliateSportNames = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      values
        .map((entry) => nullableString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const candidateSportNames = (candidate: AffiliateCandidateRecord): string[] => {
  const extracted = rawExtractedCandidateFields(candidate);
  const rawPayload = recordValue(candidate?.rawPayload);
  const normalizedImport = recordValue(rawPayload.normalizedImport);
  const persistedSportNames = Array.isArray(rawPayload.sportNames)
    ? rawPayload.sportNames
    : Array.isArray(normalizedImport.sportNames)
      ? normalizedImport.sportNames
      : extracted.sportNames;
  const names = normalizeAffiliateSportNames(
    Array.isArray(candidate?.sportNames)
      ? candidate.sportNames
      : persistedSportNames,
  );
  const primary =
    nullableString(candidate?.sportName) ?? nullableString(extracted.sportName);
  if (primary && !names.includes(primary)) names.unshift(primary);
  return names;
};

const candidateClubLogoUrl = (candidate: AffiliateCandidateRecord): string | null => {
  const fields = rawExtractedCandidateFields(candidate);
  return (
    nullableString(fields.logoUrl) ??
    nullableString(fields.logoSourceUrl) ??
    nullableString(
      (candidate?.rawPayload as Record<string, unknown> | null)?.logoUrl,
    ) ??
    nullableString(
      (candidate?.rawPayload as Record<string, unknown> | null)?.logoSourceUrl,
    )
  );
};

type AffiliateOrganizationLogoOptions = Readonly<{
  assignOrganizationLogo?: boolean;
}>;

type AffiliateLogoObject = Readonly<{
  key: string;
  sizeBytes: number;
  bucket?: string;
}>;

type AffiliatePreviousLogoObject = Readonly<{
  key: string;
  bucket?: string;
}>;

const loadPreviousAffiliateLogoObject = async (
  files: any,
  logoId: string,
): Promise<AffiliatePreviousLogoObject | null> => {
  if (typeof files.findUnique !== "function") return null;
  const existingFile = await files.findUnique({
    where: { id: logoId },
    select: { path: true, bucket: true },
  });
  return existingFile?.path
    ? { key: String(existingFile.path), bucket: existingFile.bucket ?? undefined }
    : null;
};

const writeAffiliateLogoFile = async (params: {
  files: any;
  logoId: string;
  previousObject: AffiliatePreviousLogoObject | null;
  fileData: Record<string, unknown>;
  now: Date;
}) => {
  const { files, logoId, previousObject, fileData, now } = params;
  if (previousObject) {
    if (typeof files.updateMany !== "function") {
      throw new Error("Affiliate organization logo compare-and-set is unavailable.");
    }
    const updated = await files.updateMany({
      where: { id: logoId, path: previousObject.key },
      data: fileData,
    });
    if (updated.count !== 1) {
      throw new Error(
        "Affiliate organization logo replacement lost a compare-and-set race.",
      );
    }
    return;
  }
  if (typeof files.create !== "function") {
    throw new Error("Affiliate organization logo file creation is unavailable.");
  }
  await files.create({
    data: {
      id: logoId,
      ...fileData,
      createdAt: now,
    },
  });
};

const assignAffiliateOrganizationLogo = async (
  persistence: ReturnType<typeof affiliatePrisma>,
  organizationId: string,
  logoId: string,
  shouldAssignOrganizationLogo: boolean,
) => {
  if (!shouldAssignOrganizationLogo) return;
  if (!persistence.organizations?.update) {
    throw new Error("Affiliate organization logo assignment is unavailable.");
  }
  await persistence.organizations.update({
    where: { id: organizationId },
    data: { logoId },
  });
};

const persistAffiliateOrganizationLogo = async (params: {
  persistenceClient: any;
  logoId: string;
  organizationId: string;
  ownerId: string;
  normalized: Buffer;
  originalName: string;
  key: string;
  storedObject: AffiliateLogoObject;
  shouldAssignOrganizationLogo: boolean;
}): Promise<AffiliatePreviousLogoObject | null> => {
  const {
    persistenceClient,
    logoId,
    organizationId,
    ownerId,
    normalized,
    originalName,
    key,
    storedObject,
    shouldAssignOrganizationLogo,
  } = params;
  const persistence = affiliatePrisma(persistenceClient);
  if (!persistence.files) {
    throw new Error("Affiliate organization logo file persistence is unavailable.");
  }
  const previousObject = await loadPreviousAffiliateLogoObject(
    persistence.files,
    logoId,
  );
  const now = new Date();
  const fileData = {
    uploaderId: ownerId,
    organizationId,
    bucket: affiliateNullableValue(storedObject.bucket),
    originalName,
    mimeType: "image/png",
    sizeBytes:
      storedObject.sizeBytes === undefined
        ? normalized.length
        : storedObject.sizeBytes,
    path: storedObject.key || key,
    updatedAt: now,
  };
  await writeAffiliateLogoFile({
    files: persistence.files,
    logoId,
    previousObject,
    fileData,
    now,
  });
  await assignAffiliateOrganizationLogo(
    persistence,
    organizationId,
    logoId,
    shouldAssignOrganizationLogo,
  );
  return previousObject;
};

const affiliateLogoUploadPreparation = async (
  storage: ReturnType<typeof getStorageProvider>,
  organizationId: string,
  shouldAssignOrganizationLogo: boolean,
) => {
  const key = shouldAssignOrganizationLogo
    ? `affiliate-organizations/${organizationId}/logo-${createId()}.png`
    : `affiliate-organizations/${organizationId}/logo.png`;
  if (shouldAssignOrganizationLogo) {
    return { key, stagedKey: key, createdObject: false };
  }
  const existingObject = await storage.headObject({ key });
  return { key, stagedKey: null, createdObject: !existingObject.exists };
};

const cleanupAffiliateLogoAfterCommit = async (
  storage: ReturnType<typeof getStorageProvider>,
  previousObject: AffiliatePreviousLogoObject | null,
  storedObject: AffiliateLogoObject,
  shouldAssignOrganizationLogo: boolean,
) => {
  const committedStoredKey = storedObject.key;
  if (
    !shouldAssignOrganizationLogo ||
    !previousObject ||
    previousObject.key === committedStoredKey
  ) {
    return;
  }
  try {
    await storage.deleteObject({
      key: previousObject.key,
      bucket: previousObject.bucket,
    });
  } catch {
    // Old logo cleanup is best effort after the new logo is committed.
  }
};

const cleanupAffiliateLogoAfterFailure = async (params: {
  storage: ReturnType<typeof getStorageProvider>;
  persistenceCommitted: boolean;
  stagedKey: string | null;
  createdObject: boolean;
  storedObject: AffiliateLogoObject | null;
}) => {
  if (params.persistenceCommitted) return;
  const cleanupKey =
    params.stagedKey ??
    (params.createdObject && params.storedObject
      ? params.storedObject.key
      : null);
  if (!cleanupKey) return;
  try {
    await params.storage.deleteObject({
      key: cleanupKey,
      bucket: params.storedObject?.bucket,
    });
  } catch {
    // Storage cleanup is best effort after a failed logo save.
  }
};

const upsertAffiliateOrganizationLogoForCandidate = async (
  candidate: AffiliateCandidateRecord,
  organizationId: string,
  ownerId: string,
  client: any = prisma,
  options: AffiliateOrganizationLogoOptions = {},
): Promise<string | null> => {
  const logoUrl = candidateClubLogoUrl(candidate);
  if (!logoUrl) return null;
  const storage = getStorageProvider();
  const shouldAssignOrganizationLogo = options.assignOrganizationLogo === true;
  const logoId = affiliateOrganizationLogoId(organizationId);
  let previousObject: AffiliatePreviousLogoObject | null = null;
  let storedObject: AffiliateLogoObject | null = null;
  let createdObject = false;
  let stagedKey: string | null = null;
  let persistenceCommitted = false;
  try {
    const normalized = await normalizeAffiliateOrganizationLogo(
      await downloadPublicRemoteImage(logoUrl),
    );
    const originalName =
      nullableString(rawExtractedCandidateFields(candidate).logoOriginalName) ??
      filenameFromUrl(logoUrl, `${slugifyForId(organizationId)}-logo.png`);
    const upload = await affiliateLogoUploadPreparation(
      storage,
      organizationId,
      shouldAssignOrganizationLogo,
    );
    stagedKey = upload.stagedKey;
    createdObject = upload.createdObject;
    storedObject = await storage.putObject({
      data: normalized,
      originalName,
      contentType: "image/png",
      organizationId,
      key: upload.key,
    });
    const transaction = (client as { $transaction?: unknown }).$transaction;
    const persist = () =>
      persistAffiliateOrganizationLogo({
        persistenceClient: client,
        logoId,
        organizationId,
        ownerId,
        normalized,
        originalName,
        key: upload.key,
        storedObject: storedObject as AffiliateLogoObject,
        shouldAssignOrganizationLogo,
      });
    previousObject =
      shouldAssignOrganizationLogo && typeof transaction === "function"
        ? await (transaction as Function).call(
            client,
            (transactionClient: any) =>
              persistAffiliateOrganizationLogo({
                persistenceClient: transactionClient,
                logoId,
                organizationId,
                ownerId,
                normalized,
                originalName,
                key: upload.key,
                storedObject: storedObject as AffiliateLogoObject,
                shouldAssignOrganizationLogo,
              }),
            { isolationLevel: "Serializable" },
          )
        : await persist();
    persistenceCommitted = true;
    await cleanupAffiliateLogoAfterCommit(
      storage,
      previousObject,
      storedObject as AffiliateLogoObject,
      shouldAssignOrganizationLogo,
    );
    return logoId;
  } catch {
    await cleanupAffiliateLogoAfterFailure({
      storage,
      persistenceCommitted,
      stagedKey,
      createdObject,
      storedObject,
    });
    return null;
  }
};

const inferCandidateParticipantAvailability = (candidate: AffiliateCandidateRecord) =>
  inferAffiliateParticipantAvailability({
    ...rawExtractedCandidateFields(candidate),
    ...candidate,
  });

const parsePriceCents = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;
  const match = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return Math.max(0, Math.round(amount * 100));
};

const affiliateCandidateText = (candidate: AffiliateCandidateRecord): string =>
  [
    candidate.title,
    candidate.description,
    candidate.priceText,
    candidate.participantOptionsText,
    candidate.divisionText,
    candidate.skillLevel,
    candidate.sportName,
    rawExtractedCandidateFields(candidate).priceText,
    rawExtractedCandidateFields(candidate).participantOptionsText,
  ]
    .map((value) => nullableString(value) ?? "")
    .join(" ");

export const buildAffiliateEventTagNames = (
  candidate: AffiliateCandidateRecord,
  eventType: unknown = inferAffiliateEventType(candidate),
): string[] =>
  inferAffiliateEventTagNames(
    {
      ...rawExtractedCandidateFields(candidate),
      ...candidate,
    },
    {
      eventType,
      listingKind: candidate?.listingKind,
    },
  );

const inferAffiliateTeamSignup = (
  candidate: AffiliateCandidateRecord,
  eventType: "EVENT" | "WEEKLY_EVENT" | "LEAGUE" | "TOURNAMENT",
): boolean => {
  const text = affiliateCandidateText(candidate);
  const lower = text.toLowerCase();

  if (
    /\b(?:individual|player|free[-\s]?agent)\s+registration\b|\bindividual\s+type\s+price\b|\bregister\s+individually\b|\bno\s+team\s+required\b|\bopen\s+(?:gym|play|court)\b|\bpick[-\s]?up\b|\bdrop[-\s]?in\b/.test(
      lower,
    )
  ) {
    return false;
  }

  if (
    /\$\s*[0-9]+(?:\.[0-9]{1,2})?\s*\/\s*team\b|\bper\s+team\b|\bteam\s+(?:entry|registration|fee|price|cost)\b|\bregister\s+a\s+(?:full\s+)?team\b/.test(
      lower,
    )
  ) {
    return true;
  }

  if (/\bsoftball\b|\bbaseball\b/.test(lower)) {
    return eventType === "LEAGUE" || eventType === "TOURNAMENT";
  }

  return eventType === "LEAGUE" || eventType === "TOURNAMENT";
};

const explicitAffiliateTeamSize = (text: string): number | null => {
  const match =
    text.match(/\bteams?\s+of\s+([1-9]\d?)\b/) ??
    text.match(/\b([1-9]\d?)\s*(?:person|player)\s+teams?\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
};

const defaultAffiliateTeamSize = (text: string): number => {
  if (/\bsoftball\b|\bbaseball\b/.test(text)) return 10;
  if (/\bquads?\b/.test(text)) return 4;
  if (/\bdoubles?\b|\b2s\b/.test(text)) return 2;
  if (/\bbasketball\b/.test(text)) return 5;
  if (/\bsoccer\b|\bfutsal\b/.test(text)) return 20;
  if (/\bvolleyball\b/.test(text)) return 2;
  return 20;
};

const inferAffiliateTeamSizeLimit = (
  candidate: AffiliateCandidateRecord,
  teamSignup: boolean,
): number => {
  if (!teamSignup) return 1;
  const text = affiliateCandidateText(candidate).toLowerCase();
  return explicitAffiliateTeamSize(text) ?? defaultAffiliateTeamSize(text);
};

const slugToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const inferDivisionGender = (value: unknown): DivisionGender => {
  const text = nullableString(value)?.toLowerCase() ?? "";
  if (/\b(coed|co-ed|mixed)\b/.test(text)) return "C";
  if (/\b(women|womens|women's|female|girls?)\b/.test(text)) return "F";
  if (/\b(men|mens|men's|male|boys?)\b/.test(text)) return "M";
  return "C";
};

type AffiliateAgeRange = {
  minAge: number | null;
  maxAge: number | null;
  ageDivisionTypeId: string | null;
};

const emptyAffiliateAgeRange = (): AffiliateAgeRange => ({
  minAge: null,
  maxAge: null,
  ageDivisionTypeId: null,
});

const affiliateAgeRangeFromMatch = (
  match: RegExpMatchArray | null,
): AffiliateAgeRange | null => {
  if (!match) return null;
  const minAge = Number.parseInt(match[1], 10);
  const maxAge = Number.parseInt(match[2], 10);
  if (!Number.isFinite(minAge) || !Number.isFinite(maxAge)) return null;
  return {
    minAge: Math.min(minAge, maxAge),
    maxAge: Math.max(minAge, maxAge),
    ageDivisionTypeId: `u${Math.max(minAge, maxAge)}`,
  };
};

const affiliateUpperAgeRangeFromMatch = (
  match: RegExpMatchArray | null,
): AffiliateAgeRange | null => {
  if (!match) return null;
  const maxAge = Number.parseInt(match[1], 10);
  return { minAge: null, maxAge, ageDivisionTypeId: `u${maxAge}` };
};

const affiliateOverAgeRangeFromMatch = (
  match: RegExpMatchArray | null,
): AffiliateAgeRange | null => {
  if (!match) return null;
  const minAge = Number.parseInt(match[1], 10);
  return { minAge, maxAge: null, ageDivisionTypeId: `${minAge}plus` };
};

const inferAgeRangeFromText = (
  value: unknown,
): {
  minAge: number | null;
  maxAge: number | null;
  ageDivisionTypeId: string | null;
} => {
  const haystack = nullableString(value) ?? "";
  const range = affiliateAgeRangeFromMatch(
    haystack.match(/\bU\s*([1-9]\d?)\s*(?:-|–|to)\s*U?\s*([1-9]\d?)\b/i) ??
      haystack.match(/\bages?\s*([1-9]\d?)\s*(?:-|–|to)\s*([1-9]\d?)\b/i),
  );
  if (range) return range;
  const upper = affiliateUpperAgeRangeFromMatch(
    haystack.match(/\bU\s*([1-9]\d?)\b/i) ??
      haystack.match(/\b([1-9]\d?)\s*U\b/i),
  );
  if (upper) return upper;
  const over = affiliateOverAgeRangeFromMatch(
    haystack.match(
      /\b(?:ages?|adult)\s*([1-9]\d?)\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)(?!\w)/i,
    ) ??
      haystack.match(/\bover\s*([1-9]\d?)(?!\d)/i) ??
      haystack.match(
        /\b([1-9]\d?)\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)(?!\w)/i,
      ) ??
      haystack.match(/\b(?:ages?|adult)\s*([1-9]\d?)\b/i),
  );
  return over ?? emptyAffiliateAgeRange();
};

const inferAgeRange = (
  candidate: AffiliateCandidateRecord,
): {
  minAge: number | null;
  maxAge: number | null;
  ageDivisionTypeId: string | null;
} =>
  inferAgeRangeFromText(
    [
      candidate.divisionText,
      candidate.skillLevel,
      candidate.ageGroup,
      candidate.description,
      candidate.title,
    ]
      .map((value) => nullableString(value) ?? "")
      .join(" "),
  );

const inferSkillDivisionTypeId = (value: unknown): string => {
  const raw = nullableString(value) ?? "";
  const withoutGender = raw
    .replace(
      /\b(?:men|women)(?:['’]s)?\b|\b(?:mens|womens|coed|co-ed|mixed|male|female|boys?|girls?)\b/gi,
      " ",
    )
    .replace(
      /\b(?:ages?|adult)\s*[1-9]\d?\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)?(?!\w)/gi,
      " ",
    )
    .replace(
      /\b[1-9]\d?\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)(?!\w)/gi,
      " ",
    )
    .replace(/\bU\s*[1-9]\d?\b/gi, " ")
    .replace(/\b[1-9]\d?\s*U\b/gi, " ");
  return slugToken(withoutGender) || "open";
};

const buildAffiliateDivisionDetailFromLabel = (
  sourceLabel: string,
  candidate: AffiliateCandidateRecord,
  sportId?: string | null,
) => {
  const gender = inferDivisionGender(sourceLabel);
  const ageRange = inferAgeRangeFromText(
    [sourceLabel, candidate.ageGroup, candidate.description, candidate.title]
      .map((value) => nullableString(value) ?? "")
      .join(" "),
  );
  const ratingType: DivisionRatingType = "SKILL";
  const normalizedTypeIds = normalizeDivisionTypeIds({
    skillDivisionTypeId: inferSkillDivisionTypeId(sourceLabel),
    ageDivisionTypeId: ageRange.ageDivisionTypeId,
    ratingType,
  });
  const { divisionTypeId, skillDivisionTypeId, ageDivisionTypeId } =
    normalizedTypeIds;
  const key = buildDivisionToken({
    gender,
    ratingType,
    divisionTypeId,
  });
  const divisionTypeName = deriveDivisionTypeDisplayName({
    sportInput: sportId ?? nullableString(candidate.sportName),
    gender,
    ratingType,
    divisionTypeId,
  });

  return {
    key,
    name: sourceLabel,
    kind: "LEAGUE",
    divisionTypeId,
    skillDivisionTypeId,
    ageDivisionTypeId,
    divisionTypeName,
    ratingType,
    gender,
    price: parsePriceCents(candidate.priceText),
    maxParticipants:
      inferCandidateParticipantAvailability(candidate).maxParticipants,
    ageCutoffLabel: nullableString(candidate.ageGroup),
    ageCutoffSource: nullableString(candidate.ageGroup)
      ? "Affiliate source age label"
      : null,
    fieldIds: [],
    teamIds: [],
  };
};

const buildAffiliateDivisionDetail = (
  candidate: AffiliateCandidateRecord,
  sportId?: string | null,
) => {
  const sourceLabel =
    nullableString(candidate.divisionText) ??
    nullableString(candidate.skillLevel);
  if (!sourceLabel) return null;
  return buildAffiliateDivisionDetailFromLabel(sourceLabel, candidate, sportId);
};

const normalizeDivisionGenderValue = (
  value: unknown,
): DivisionGender | null => {
  return value === "M" || value === "F" || value === "C" ? value : null;
};

const normalizeDivisionRatingTypeValue = (
  value: unknown,
): DivisionRatingType | null => {
  return value === "AGE" || value === "SKILL" ? value : null;
};

const normalizeSourceDivisionPrice = (
  value: unknown,
): number | null | undefined => {
  if (value == null) return value === null ? null : undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.round(numeric));
};

const normalizeSourceDivisionMaxParticipants = (
  value: unknown,
): number | null | undefined => {
  if (value == null) return value === null ? null : undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.trunc(numeric));
};

const sourceDivisionRowsFromCandidate = (
  candidate: AffiliateCandidateRecord,
): Record<string, unknown>[] => {
  const rows = rawExtractedCandidateFields(candidate).divisions;
  return Array.isArray(rows)
    ? rows.filter(
        (row): row is Record<string, unknown> =>
          row != null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
};

const buildAffiliateDivisionDetailsFromSourceRows = (
  candidate: AffiliateCandidateRecord,
  sportId?: string | null,
) => {
  return sourceDivisionRowsFromCandidate(candidate)
    .map((row) => {
      const name = nullableString(row.name);
      if (!name) return null;
      const inferred = buildAffiliateDivisionDetailFromLabel(
        name,
        candidate,
        sportId,
      );
      const gender =
        normalizeDivisionGenderValue(row.gender) ?? inferred.gender;
      const ratingType =
        normalizeDivisionRatingTypeValue(row.ratingType) ?? inferred.ratingType;
      const normalizedTypeIds = normalizeDivisionTypeIds({
        divisionTypeId:
          nullableString(row.divisionTypeId) ?? inferred.divisionTypeId,
        skillDivisionTypeId: nullableString(row.skillDivisionTypeId),
        ageDivisionTypeId: nullableString(row.ageDivisionTypeId),
        ratingType,
      });
      const { divisionTypeId, skillDivisionTypeId, ageDivisionTypeId } =
        normalizedTypeIds;
      const key =
        nullableString(row.key) ??
        buildDivisionToken({
          gender,
          ratingType,
          divisionTypeId,
        });

      return {
        ...inferred,
        key,
        name,
        gender,
        ratingType,
        divisionTypeId,
        skillDivisionTypeId,
        ageDivisionTypeId,
        sourceDivisionId: nullableString(row.sourceDivisionId),
        divisionTypeName: deriveDivisionTypeDisplayName({
          sportInput: sportId ?? nullableString(candidate.sportName),
          gender,
          ratingType,
          divisionTypeId,
        }),
        price: normalizeSourceDivisionPrice(row.priceCents),
        maxParticipants: normalizeSourceDivisionMaxParticipants(
          row.maxParticipants,
        ),
        ageCutoffLabel:
          nullableString(row.ageCutoffLabel) ?? inferred.ageCutoffLabel,
        ageCutoffSource:
          nullableString(row.ageCutoffSource) ?? inferred.ageCutoffSource,
      };
    })
    .filter((detail): detail is NonNullable<typeof detail> => detail !== null);
};

const inferSourceDivisionLabels = (candidate: AffiliateCandidateRecord): string[] => {
  const explicitLabel =
    nullableString(candidate.divisionText) ??
    nullableString(candidate.skillLevel);
  if (explicitLabel) return [explicitLabel];

  const haystack = [
    candidate.title,
    candidate.description,
    candidate.participantOptionsText,
  ]
    .map((value) => nullableString(value) ?? "")
    .join(" ");
  const labels: string[] = [];
  const addLabel = (label: string) => {
    if (
      !labels.some((existing) => existing.toLowerCase() === label.toLowerCase())
    ) {
      labels.push(label);
    }
  };

  if (/\bmen(?:['’]s)?\b|\bmens\b/i.test(haystack)) addLabel("Men");
  if (/\bwomen(?:['’]s)?\b|\bwomens\b/i.test(haystack)) addLabel("Women");
  if (/\bcoed\b|\bco-ed\b|\bmixed\b/i.test(haystack)) addLabel("Coed");

  Array.from(
    haystack.matchAll(/\b([1-9]\d?)\s*(?:&|and)\s*over\b|\b([1-9]\d?)\s*\+/gi),
  ).forEach((match) => {
    const age = match[1] ?? match[2];
    if (age) addLabel(`${age}+`);
  });
  if (
    /\bsenior(?:s)?\b/i.test(haystack) &&
    !labels.some((label) => label === "40+")
  ) {
    addLabel("40+");
  }

  return labels;
};

const buildAffiliateDivisionDetails = (
  candidate: AffiliateCandidateRecord,
  sportId?: string | null,
) => {
  const sourceDivisionDetails = buildAffiliateDivisionDetailsFromSourceRows(
    candidate,
    sportId,
  );
  if (sourceDivisionDetails.length > 0) {
    return sourceDivisionDetails;
  }

  const details = inferSourceDivisionLabels(candidate).map((label) =>
    buildAffiliateDivisionDetailFromLabel(label, candidate, sportId),
  );
  const byKey = new Map<
    string,
    NonNullable<ReturnType<typeof buildAffiliateDivisionDetailFromLabel>>
  >();
  details.forEach((detail) => {
    if (detail) byKey.set(detail.key, detail);
  });
  return Array.from(byKey.values());
};

type AffiliatePriceRange = {
  minPriceCents: number;
  maxPriceCents: number;
};

const formatAffiliatePriceCents = (priceCents: number): string =>
  priceCents <= 0 ? "Free" : `$${(priceCents / 100).toFixed(2)}`;

const formatAffiliatePriceRange = (range: AffiliatePriceRange): string =>
  range.minPriceCents === range.maxPriceCents
    ? formatAffiliatePriceCents(range.minPriceCents)
    : `${formatAffiliatePriceCents(range.minPriceCents)} - ${formatAffiliatePriceCents(range.maxPriceCents)}`;

const affiliatePriceRangeFromDivisionDetails = (
  divisionDetails: Array<{ price?: number | null }>,
): AffiliatePriceRange | null => {
  const prices = divisionDetails
    .map((divisionDetail) =>
      typeof divisionDetail.price === "number" &&
      Number.isFinite(divisionDetail.price)
        ? Math.max(0, Math.round(divisionDetail.price))
        : null,
    )
    .filter((price): price is number => price !== null);

  if (prices.length === 0) {
    return null;
  }

  return {
    minPriceCents: Math.min(...prices),
    maxPriceCents: Math.max(...prices),
  };
};

const parseAffiliateSourcePriceRange = (
  value: unknown,
): AffiliatePriceRange | null => {
  const text = nullableString(value);
  if (!text) return null;

  const amountPattern = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
  const rangePatterns = [
    new RegExp(
      `\\$\\s*${amountPattern}\\s*(?:-|–|—|to|through)\\s*(?:\\$\\s*)?${amountPattern}`,
      "i",
    ),
    new RegExp(
      `\\$\\s*${amountPattern}[^$]*?\\b(?:up\\s+to|go(?:es)?\\s+up\\s+to|range(?:s)?\\s+to)\\b[^$]*\\$\\s*${amountPattern}`,
      "i",
    ),
    new RegExp(
      `\\b(?:from|start(?:s|ing)?\\s+at)\\b[^$]*\\$\\s*${amountPattern}[^$]*?\\b(?:up\\s+to|go(?:es)?\\s+up\\s+to|to)\\b[^$]*\\$\\s*${amountPattern}`,
      "i",
    ),
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const left = Number.parseFloat(match[1].replace(/,/g, ""));
    const right = Number.parseFloat(match[2].replace(/,/g, ""));
    if (Number.isFinite(left) && Number.isFinite(right)) {
      const leftCents = Math.max(0, Math.round(left * 100));
      const rightCents = Math.max(0, Math.round(right * 100));
      return {
        minPriceCents: Math.min(leftCents, rightCents),
        maxPriceCents: Math.max(leftCents, rightCents),
      };
    }
  }

  const priceCents = parsePriceCents(text);
  if (priceCents !== null) {
    return {
      minPriceCents: priceCents,
      maxPriceCents: priceCents,
    };
  }

  if (/\bfree\b/i.test(text)) {
    return {
      minPriceCents: 0,
      maxPriceCents: 0,
    };
  }

  return null;
};

const isSimpleAffiliatePriceText = (
  sourcePriceText: string,
  displayPriceText: string | null,
): boolean => {
  const normalize = (value: string) =>
    value.trim().replace(/\.$/, "").toLowerCase();
  const normalizedSource = normalize(sourcePriceText);
  const normalizedDisplay = displayPriceText ? normalize(displayPriceText) : "";
  if (normalizedDisplay && normalizedSource === normalizedDisplay) {
    return true;
  }

  return (
    /^\$?\s*\d[\d,]*(?:\.\d{1,2})?$/.test(sourcePriceText.trim()) ||
    /^free$/i.test(sourcePriceText.trim())
  );
};

const buildAffiliateEventPricing = (
  candidate: AffiliateCandidateRecord,
  divisionDetails: Array<{ price?: number | null }>,
) => {
  const range =
    affiliatePriceRangeFromDivisionDetails(divisionDetails) ??
    parseAffiliateSourcePriceRange(candidate.priceText);
  const displayText = range ? formatAffiliatePriceRange(range) : null;
  const sourcePriceText = nullableString(candidate.priceText);
  const detailsText =
    sourcePriceText && !isSimpleAffiliatePriceText(sourcePriceText, displayText)
      ? sourcePriceText
      : null;

  return {
    priceCents: range?.minPriceCents ?? null,
    displayText,
    detailsText,
  };
};

const buildAffiliateImportMetadata = (candidate: AffiliateCandidateDateTimeInput) => {
  const ageRange = inferAgeRange(candidate);
  const participantAvailability =
    inferCandidateParticipantAvailability(candidate);
  const candidateRawPayload = recordValue(candidate.rawPayload);
  const extractedNormalizedImport = recordValue(
    candidateRawPayload.normalizedImport,
  );
  return {
    division: buildAffiliateDivisionDetail(candidate),
    divisions: buildAffiliateDivisionDetails(candidate),
    ageRange,
    participantAvailability,
    maxParticipants: participantAvailability.maxParticipants,
    dateDisplayMode: normalizeDateDisplayMode(candidate.dateDisplayMode),
    dateDisplayText: dateDisplayTextFromCandidate(candidate),
    evergreen: isEvergreenAffiliateCandidate(candidate),
    tags: buildAffiliateEventTagNames(candidate),
    sportName: nullableString(candidate.sportName),
    sportNames: candidateSportNames(candidate),
    dateTime:
      extractedNormalizedImport.dateTime ??
      candidateRawPayload.dateTime ??
      null,
  };
};

const eventStartFromCandidate = (candidate: AffiliateCandidateRecord): Date => {
  assertEventOrTeamCandidateImportable(candidate);
  return candidateStartDate(candidate) ?? EVERGREEN_AFFILIATE_START_DATE;
};

const buildAffiliateEventDescription = (
  candidate: AffiliateCandidateRecord,
  pricingDetailsText?: string | null,
): string | null => {
  const description = nullableString(candidate.description);
  const pricingDetails = nullableString(pricingDetailsText);
  if (!pricingDetails) {
    return description;
  }

  if (
    description &&
    description.toLowerCase().includes(pricingDetails.toLowerCase())
  ) {
    return description;
  }

  return [description, `Pricing details: ${pricingDetails}`]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
};

type AffiliateInferredEventType =
  | "EVENT"
  | "WEEKLY_EVENT"
  | "LEAGUE"
  | "TOURNAMENT";

const affiliateEventTypeFromText = (
  text: string,
): Exclude<AffiliateInferredEventType, "EVENT"> | null => {
  if (/\btournament\b/.test(text)) return "TOURNAMENT";
  if (/\bleague\b/.test(text)) return "LEAGUE";
  if (/\bweekly\b/.test(text)) return "WEEKLY_EVENT";
  return null;
};

const affiliateLowerText = (values: unknown[]): string =>
  values.map((value) => nullableString(value)?.toLowerCase() ?? "").join(" ");

const inferAffiliateEventType = (
  candidate: AffiliateCandidateRecord,
): "EVENT" | "WEEKLY_EVENT" | "LEAGUE" | "TOURNAMENT" => {
  const sourceFormat =
    nullableString(candidate.formatLabel ?? candidate.formatName)?.toLowerCase() ??
    "";
  if (/\bclass(?:es)?\b/.test(sourceFormat)) return "EVENT";
  const sourceType = affiliateEventTypeFromText(sourceFormat);
  if (sourceType) return sourceType;
  const haystack = affiliateLowerText([
    candidate.title,
    candidate.formatLabel,
    candidate.formatName,
    candidate.scheduleText,
    candidate.description,
  ]);
  if (
    /\btournament\b|\bbracket\b|\bpool play\b|\b(?:[2-9]\s*)?game guarantee\b|\b[2-9]\s*gg\b|\bteam entry fee\b|\bhomerun bracelets?\b/.test(
      haystack,
    )
  ) {
    return "TOURNAMENT";
  }
  if (/\bleague\b|\bleagues\b/.test(haystack)) return "LEAGUE";
  if (
    /\bweekly\b|\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      haystack,
    )
  ) {
    return "WEEKLY_EVENT";
  }
  return "EVENT";
};

const resolveAffiliateSportId = async (
  sportName: unknown,
  client: any = prisma,
): Promise<string | null> => {
  const name = nullableString(sportName);
  if (!name) return null;
  const { sports } = affiliatePrisma(client);
  const sport = await sports.findFirst({
    where: { name },
    select: { id: true },
  });
  return sport?.id ?? null;
};

const affiliateCanonicalSportError = (
  sportName: unknown,
  targetLabel: "event" | "organization" | "rental facility" | "team",
): Error => {
  const received = nullableString(sportName);
  return new Error(
    `Affiliate ${targetLabel} cannot be published unless sportName exactly matches a current Sports.name. ` +
      `Received ${received ?? "no sport name"}. Send unsupported sports to human review instead of guessing a replacement.`,
  );
};

const assertAffiliateCandidateUsesCanonicalSport = async (
  candidate: AffiliateCandidateRecord,
  targetLabel: "event" | "organization" | "rental facility" | "team",
): Promise<string[]> => {
  const sportNames = candidateSportNames(candidate);
  const sportIds: string[] = [];
  for (const sportName of sportNames) {
    const sportId = await resolveAffiliateSportId(sportName);
    if (!sportId) {
      throw affiliateCanonicalSportError(sportName, targetLabel);
    }
    sportIds.push(sportId);
  }
  if (!sportIds.length) {
    throw affiliateCanonicalSportError(null, targetLabel);
  }
  return sportIds;
};

const geocodeFirstAvailableAddressWithQuery = async (
  queries: string[],
): Promise<{ coordinates: [number, number] | null; query: string | null }> => {
  for (const query of queries) {
    const coordinates = await geocodeAddressToCoordinates(query);
    if (coordinates) return { coordinates, query };
  }
  return { coordinates: null, query: null };
};

const geocodeFirstAvailableAddress = async (
  queries: string[],
): Promise<[number, number] | null> =>
  (await geocodeFirstAvailableAddressWithQuery(queries)).coordinates;

const candidateLocationEvidence = (
  candidate: AffiliateCandidateRecord,
): string | null => {
  const fields = rawExtractedCandidateFields(candidate);
  return (
    nullableString(candidate?.locationEvidence) ??
    nullableString(fields.locationEvidence)
  );
};

const candidateLocationSource = (candidate: AffiliateCandidateRecord) => {
  const fields = rawExtractedCandidateFields(candidate);
  return normalizeAffiliateLocationSource(
    candidate?.locationSource ?? fields.locationSource,
  );
};

const candidateResolvedCoordinates = (
  candidate: AffiliateCandidateRecord,
): [number, number] | null => {
  const rawPayload = recordValue(candidate?.rawPayload);
  const resolution = recordValue(rawPayload.locationResolution);
  return normalizeAffiliateCoordinates(resolution.coordinates);
};

const candidateSourceDateTime = (
  candidate: AffiliateCandidateRecord,
): string | null => {
  const rawPayload = recordValue(candidate?.rawPayload);
  const dateTimeInputs = recordValue(rawPayload.dateTimeInputs);
  const rawExtractedFields = recordValue(rawPayload.rawExtractedFields);
  return (
    nullableString(dateTimeInputs.startsAt) ??
    nullableString(rawExtractedFields.startsAt)
  );
};

const candidateDateValue = (
  value: Date | string | null | undefined,
): Date | null =>
  value instanceof Date ? value : parseDateOrNull(nullableString(value));

const candidateDateTimeReferenceDate = (
  candidate: AffiliateCandidateRecord,
): Date => {
  const rawPayload = recordValue(candidate?.rawPayload);
  const capturedAt = parseDateOrNull(nullableString(rawPayload.fetchedAt));
  if (capturedAt) return capturedAt;
  const createdAt = candidateDateValue(candidate?.createdAt);
  if (createdAt) return createdAt;
  return candidateDateValue(candidate?.updatedAt) ?? new Date();
};

const enrichAffiliateEventDateTimeFromCoordinates = (params: {
  candidate: AffiliateCandidateInput;
  referenceDate: Date;
}): AffiliateCandidateInput => {
  const { candidate, referenceDate } = params;
  const dateDisplayMode = normalizeDateDisplayMode(candidate.dateDisplayMode);
  if (
    candidate.listingKind !== "EVENT" ||
    (dateDisplayMode !== "SCHEDULED" && dateDisplayMode !== "DATE_ONLY") ||
    isValidAffiliateTimeZone(nullableString(candidate.timeZone) ?? "")
  ) {
    return candidate;
  }

  const coordinates = candidateResolvedCoordinates(candidate);
  const timeZone = coordinates
    ? tryResolveTimeZoneFromCoordinates(coordinates)
    : null;
  if (!timeZone) return candidate;

  return normalizeAffiliateCandidateDateTime(candidate, {
    timeZone,
    timeZoneEvidence: "COORDINATES",
    referenceDate,
  });
};

type AffiliateSourceOrganizationLocation = {
  id: string;
  name?: string | null;
  location?: string | null;
  address?: string | null;
  coordinates?: unknown;
};

const firstAffiliateNullableString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const normalized = nullableString(value);
    if (normalized) return normalized;
  }
  return null;
};

const affiliateLocationOrganizationFields = (params: {
  candidate: AffiliateCandidateInput;
  mode: "CANDIDATE" | "SOURCE_ORGANIZATION";
  organization?: AffiliateSourceOrganizationLocation | null;
}): Partial<AffiliateCandidateInput> => {
  if (params.mode !== "SOURCE_ORGANIZATION") return {};
  return {
    venueName: firstAffiliateNullableString(
      params.candidate.venueName,
      params.organization?.name,
    ),
    address: firstAffiliateNullableString(
      params.candidate.address,
      params.organization?.address,
    ),
    city: firstAffiliateNullableString(
      params.candidate.city,
      params.organization?.location,
    ),
  };
};

const affiliateLocationOrganizationId = (
  mode: "CANDIDATE" | "SOURCE_ORGANIZATION",
  organization?: AffiliateSourceOrganizationLocation | null,
): string | null =>
  mode === "SOURCE_ORGANIZATION"
    ? affiliateNullableValue(organization?.id)
    : null;

const withCandidateLocationResolution = (params: {
  candidate: AffiliateCandidateInput;
  coordinates: [number, number];
  mode: "CANDIDATE" | "SOURCE_ORGANIZATION";
  query: string | null;
  evidence: string | null;
  organization?: AffiliateSourceOrganizationLocation | null;
}): AffiliateCandidateInput => ({
  ...params.candidate,
  ...affiliateLocationOrganizationFields(params),
  rawPayload: {
    ...affiliateValueOrDefault(params.candidate.rawPayload, {}),
    locationResolution: {
      mode: params.mode,
      coordinates: params.coordinates,
      query: params.query,
      evidence: params.evidence,
      organizationId: affiliateLocationOrganizationId(
        params.mode,
        params.organization,
      ),
    },
  },
});

const resolveAffiliateCandidateLocation = async (
  candidate: AffiliateCandidateInput,
  queries: string[],
  evidence: string | null,
): Promise<AffiliateCandidateInput | null> => {
  for (const query of queries) {
    const coordinates = await geocodeAddressToCoordinates(query);
    if (coordinates) {
      return withCandidateLocationResolution({
        candidate,
        coordinates,
        mode: "CANDIDATE",
        query,
        evidence,
      });
    }
  }
  return null;
};

const resolveAffiliateSourceOrganizationLocation = async (params: {
  candidate: AffiliateCandidateInput;
  sourceOrganization: AffiliateSourceOrganizationLocation | null;
  locationSource: string | null;
  evidence: string | null;
}): Promise<{ candidate: AffiliateCandidateInput; reasons: string[] }> => {
  const {
    candidate,
    sourceOrganization,
    locationSource,
    evidence,
  } = params;
  if (locationSource !== "SOURCE_ORGANIZATION") {
    return { candidate, reasons: ["missing event venue or address"] };
  }
  if (!evidence) {
    return {
      candidate,
      reasons: ["source organization location evidence is required"],
    };
  }
  if (!sourceOrganization) {
    return {
      candidate,
      reasons: ["source organization location is unavailable"],
    };
  }
  const existingCoordinates = normalizeAffiliateCoordinates(
    sourceOrganization.coordinates,
  );
  if (existingCoordinates) {
    return {
      candidate: withCandidateLocationResolution({
        candidate,
        coordinates: existingCoordinates,
        mode: "SOURCE_ORGANIZATION",
        query: null,
        evidence,
        organization: sourceOrganization,
      }),
      reasons: [],
    };
  }
  const organizationQueries = buildAffiliatePlaceLocationQueries({
    name: nullableString(sourceOrganization.name),
    location: nullableString(sourceOrganization.location),
    address: nullableString(sourceOrganization.address),
    city: nullableString(sourceOrganization.location),
  });
  for (const query of organizationQueries) {
    const coordinates = await geocodeAddressToCoordinates(query);
    if (coordinates) {
      return {
        candidate: withCandidateLocationResolution({
          candidate,
          coordinates,
          mode: "SOURCE_ORGANIZATION",
          query,
          evidence,
          organization: sourceOrganization,
        }),
        reasons: [],
      };
    }
  }
  return {
    candidate,
    reasons: ["source organization location could not be resolved"],
  };
};

const resolveAffiliateEventCandidateLocation = async (params: {
  candidate: AffiliateCandidateInput;
  sourceOrganization: AffiliateSourceOrganizationLocation | null;
}): Promise<{ candidate: AffiliateCandidateInput; reasons: string[] }> => {
  const { candidate, sourceOrganization } = params;
  if (candidate.listingKind !== "EVENT") {
    return { candidate, reasons: [] };
  }
  const locationSource = candidateLocationSource(candidate);
  const evidence = candidateLocationEvidence(candidate);
  const candidateQueries = buildAffiliateSpecificEventLocationQueries({
    venueName: nullableString(candidate.venueName),
    address: nullableString(candidate.address),
    city: nullableString(candidate.city),
  });
  const candidateWithLocation = await resolveAffiliateCandidateLocation(
    candidate,
    candidateQueries,
    evidence,
  );
  if (candidateWithLocation) {
    return { candidate: candidateWithLocation, reasons: [] };
  }
  if (candidateQueries.length) {
    return {
      candidate,
      reasons: ["event venue or address could not be resolved"],
    };
  }
  return resolveAffiliateSourceOrganizationLocation({
    candidate,
    sourceOrganization,
    locationSource,
    evidence,
  });
};

const assertAffiliateCoordinatesForPublication = (params: {
  coordinates: unknown;
  targetLabel: "event" | "organization" | "rental facility";
  queries: string[];
}) => {
  if (isValidGeocodeCoordinates(params.coordinates)) return;
  if (params.queries.length === 0) {
    throw new Error(
      `Affiliate ${params.targetLabel} cannot be published without valid non-zero coordinates. ` +
        "No geocoding request was made because this candidate has no source-backed address, city, or venue. " +
        "Add a verified location to the candidate or repair its source mapping, then retry publication.",
    );
  }

  const attemptedQueries = `Attempted location queries: ${params.queries.join(" | ")}.`;
  if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new Error(
      `Affiliate ${params.targetLabel} cannot be published without valid non-zero coordinates. ` +
        "The server-only GOOGLE_MAPS_API_KEY is missing, so the stored location could not be geocoded. " +
        `Configure Places API (New) and Geocoding API, then retry publication. ${attemptedQueries}`,
    );
  }

  throw new Error(
    `Affiliate ${params.targetLabel} cannot be published without valid non-zero coordinates. ` +
      "Google Places and Geocoding did not resolve the stored source-backed location. " +
      "Verify or correct the candidate location. If it is correct, verify the API key restrictions and enabled APIs. " +
      attemptedQueries,
  );
};

type AffiliateEventSportData = Readonly<{
  eventType: AffiliateInferredEventType;
  sportNames: string[];
  sportIds: string[];
}>;

const resolveAffiliateEventSports = async (
  candidate: AffiliateCandidateRecord,
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE",
  client: any,
): Promise<AffiliateEventSportData> => {
  const eventType = inferAffiliateEventType(candidate);
  const sportNames = candidateSportNames(candidate);
  const sportIds: string[] = [];
  for (const sportName of sportNames) {
    const sportId = await resolveAffiliateSportId(sportName, client);
    if (!sportId && state === "PUBLISHED") {
      throw affiliateCanonicalSportError(sportName, "event");
    }
    if (sportId) sportIds.push(sportId);
  }
  if (state === "PUBLISHED" && !sportIds.length) {
    throw affiliateCanonicalSportError(sportNames[0], "event");
  }
  validateEventSportIds({ eventType, sportIds });
  return { eventType, sportNames, sportIds };
};

type AffiliateEventLocationData = Readonly<{
  location: string;
  address: string | null;
  city: string | null;
  geocodeQueries: string[];
  coordinates: [number, number] | null;
}>;

const resolveAffiliateEventCoordinates = async (params: {
  candidate: AffiliateCandidateRecord;
  geocodeQueries: string[];
  fallbackCoordinates?: unknown;
  allowRemoteGeocoding: boolean;
  preferFallbackCoordinates: boolean;
}): Promise<[number, number] | null> => {
  const preparedCoordinates = normalizeAffiliateCoordinates(
    params.fallbackCoordinates,
  );
  const preferredCoordinates = params.preferFallbackCoordinates
    ? preparedCoordinates ?? candidateResolvedCoordinates(params.candidate)
    : candidateResolvedCoordinates(params.candidate) ?? preparedCoordinates;
  if (preferredCoordinates || !params.allowRemoteGeocoding) {
    return preferredCoordinates;
  }
  return geocodeFirstAvailableAddress(params.geocodeQueries);
};

const resolveAffiliateEventLocation = async (params: {
  candidate: AffiliateCandidateRecord;
  fallbackCoordinates?: unknown;
  allowRemoteGeocoding: boolean;
  preferFallbackCoordinates: boolean;
}): Promise<AffiliateEventLocationData> => {
  const address = nullableString(params.candidate.address);
  const city = nullableString(params.candidate.city);
  const geocodeQueries = buildAffiliateEventLocationQueries({
    location: nullableString(params.candidate.venueName),
    address,
    city,
  });
  const coordinates = await resolveAffiliateEventCoordinates({
    candidate: params.candidate,
    geocodeQueries,
    fallbackCoordinates: params.fallbackCoordinates,
    allowRemoteGeocoding: params.allowRemoteGeocoding,
    preferFallbackCoordinates: params.preferFallbackCoordinates,
  });
  return {
    location:
      firstAffiliateNullableString(
        params.candidate.venueName,
        params.candidate.city,
        params.candidate.address,
      ) ?? "Location TBD",
    address,
    city,
    geocodeQueries,
    coordinates,
  };
};

const hasAffiliatePersistedSourceTimeZoneEvidence = (
  rawTimeZone: string | null,
  sourceTimeZone: string | null,
): boolean =>
  Boolean(
    isValidAffiliateTimeZone(rawTimeZone ?? "") &&
      rawTimeZone === sourceTimeZone,
  );

const hasAffiliateCoordinateTimeZoneEvidence = (
  metadata: Record<string, unknown>,
  sourceTimeZone: string | null,
  coordinateTimeZone: string | null,
): boolean =>
  metadata.timeZoneEvidence === "COORDINATES" &&
  nullableString(metadata.timeZone) === sourceTimeZone &&
  coordinateTimeZone === sourceTimeZone;

const hasCurrentAffiliateDateTimeProvenance = (
  metadata: Record<string, unknown>,
  normalizedStartsAt: Date | null,
  existingStart: Date | null,
  eventTimeZone: string | null,
): boolean =>
  metadata.contractVersion === AFFILIATE_DATE_TIME_CONTRACT_VERSION &&
  (metadata.startPrecision === "DATE_TIME" ||
    metadata.startPrecision === "DATE_ONLY") &&
  normalizedStartsAt?.getTime() === existingStart?.getTime() &&
  nullableString(metadata.timeZone) === eventTimeZone;

type AffiliateEventDateTimeEvidence = Readonly<{
  sourceTimeZone: string | null;
  coordinateTimeZone: string | null;
  existingStart: Date | null;
  sourceDateTime: string | null;
  hasMatchingPersistedSourceTimeZoneEvidence: boolean;
  hasTrustedStoredTimeZone: boolean;
  hasCurrentNormalizedStartProvenance: boolean;
  initialDateDisplayMode: AffiliateDateDisplayMode;
  isTimedAffiliateDateDisplayMode: boolean;
  eventTimeZone: string | null;
}>;

const affiliateEventDateTimeEvidence = (
  candidate: AffiliateCandidateRecord,
  coordinates: [number, number] | null,
): AffiliateEventDateTimeEvidence => {
  const sourceTimeZone = nullableString(candidate.timeZone);
  const coordinateTimeZone = tryResolveTimeZoneFromCoordinates(coordinates);
  const existingStart = candidateStartDate(candidate);
  const sourceDateTime = candidateSourceDateTime(candidate);
  const rawPayload = recordValue(candidate.rawPayload);
  const dateTimeInputs = recordValue(rawPayload.dateTimeInputs);
  const rawExtractedFields = recordValue(rawPayload.rawExtractedFields);
  const existingDateTimeMetadata = recordValue(
    recordValue(rawPayload.normalizedImport).dateTime,
  );
  const rawTimeZone = firstAffiliateNullableString(
    dateTimeInputs.timeZone,
    rawExtractedFields.timeZone,
  );
  const hasMatchingPersistedSourceTimeZoneEvidence =
    hasAffiliatePersistedSourceTimeZoneEvidence(
      rawTimeZone,
      sourceTimeZone,
    );
  const hasMatchingCoordinateEvidence = hasAffiliateCoordinateTimeZoneEvidence(
    existingDateTimeMetadata,
    sourceTimeZone,
    coordinateTimeZone,
  );
  const hasTrustedStoredTimeZone =
    Boolean(sourceTimeZone) &&
    isValidAffiliateTimeZone(sourceTimeZone ?? "") &&
    (hasMatchingCoordinateEvidence ||
      hasMatchingPersistedSourceTimeZoneEvidence);
  const eventTimeZone = hasTrustedStoredTimeZone
    ? sourceTimeZone
    : coordinateTimeZone;
  const normalizedStartsAt = parseDateOrNull(
    nullableString(existingDateTimeMetadata.normalizedStartsAt),
  );
  const hasCurrentNormalizedStartProvenance =
    hasCurrentAffiliateDateTimeProvenance(
      existingDateTimeMetadata,
      normalizedStartsAt,
      existingStart,
      eventTimeZone,
    );
  const initialDateDisplayMode = normalizeDateDisplayMode(
    candidate.dateDisplayMode,
  );
  const isTimedAffiliateDateDisplayMode =
    initialDateDisplayMode === "SCHEDULED" ||
    initialDateDisplayMode === "DATE_ONLY";
  return {
    sourceTimeZone,
    coordinateTimeZone,
    existingStart,
    sourceDateTime,
    hasMatchingPersistedSourceTimeZoneEvidence,
    hasTrustedStoredTimeZone,
    hasCurrentNormalizedStartProvenance,
    initialDateDisplayMode,
    isTimedAffiliateDateDisplayMode,
    eventTimeZone,
  };
};

const affiliateEventNeedsDateTimeNormalization = (
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE",
  evidence: AffiliateEventDateTimeEvidence,
): boolean =>
  state === "PUBLISHED" &&
  evidence.isTimedAffiliateDateDisplayMode &&
  Boolean(evidence.sourceDateTime);

const affiliateEventHasStaleDateTimeProvenance = (
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE",
  evidence: AffiliateEventDateTimeEvidence,
): boolean =>
  state === "PUBLISHED" &&
  evidence.isTimedAffiliateDateDisplayMode &&
  Boolean(evidence.existingStart) &&
  (!evidence.hasTrustedStoredTimeZone ||
    !evidence.hasCurrentNormalizedStartProvenance);

const normalizeAffiliatePublishedEventDateTime = async (
  candidate: AffiliateCandidateRecord,
  evidence: AffiliateEventDateTimeEvidence,
  onCandidateNormalized?: (
    candidate: AffiliateCandidateDateTimeInput,
  ) => void | Promise<void>,
): Promise<{ candidate: AffiliateCandidateRecord; eventTimeZone: string | null }> => {
  const normalizationTimeZone = evidence.hasTrustedStoredTimeZone
    ? evidence.sourceTimeZone
    : evidence.coordinateTimeZone;
  if (!normalizationTimeZone) {
    throw new Error(
      "Affiliate event candidates require an evidence-backed IANA time zone before publication.",
    );
  }
  const normalizedCandidate = normalizeAffiliateCandidateDateTime(candidate, {
    timeZone: normalizationTimeZone,
    timeZoneEvidence: evidence.hasMatchingPersistedSourceTimeZoneEvidence
      ? "SOURCE_FIELD"
      : "COORDINATES",
    referenceDate: candidateDateTimeReferenceDate(candidate),
  });
  await onCandidateNormalized?.(normalizedCandidate);
  const eventTimeZone = normalizedCandidate.timeZone ?? null;
  if (!eventTimeZone || !candidateStartDate(normalizedCandidate)) {
    throw new Error(
      "Affiliate event candidate datetime could not be normalized from preserved source text.",
    );
  }
  return { candidate: normalizedCandidate, eventTimeZone };
};

const prepareAffiliateEventDateTime = async (params: {
  candidate: AffiliateCandidateRecord;
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
  coordinates: [number, number] | null;
  onCandidateNormalized?: (
    candidate: AffiliateCandidateDateTimeInput,
  ) => void | Promise<void>;
}): Promise<{ candidate: AffiliateCandidateRecord; eventTimeZone: string | null }> => {
  const evidence = affiliateEventDateTimeEvidence(
    params.candidate,
    params.coordinates,
  );
  if (affiliateEventNeedsDateTimeNormalization(params.state, evidence)) {
    return normalizeAffiliatePublishedEventDateTime(
      params.candidate,
      evidence,
      params.onCandidateNormalized,
    );
  }
  if (affiliateEventHasStaleDateTimeProvenance(params.state, evidence)) {
    throw new Error(
      "Affiliate event candidates cannot be published without preserved source datetime text or current normalized datetime provenance.",
    );
  }
  return { candidate: params.candidate, eventTimeZone: evidence.eventTimeZone };
};

const affiliateEventEndDate = (
  candidate: AffiliateCandidateRecord,
  dateDisplayMode: AffiliateDateDisplayMode,
): Date | null => {
  if (dateDisplayMode !== "SCHEDULED" && dateDisplayMode !== "DATE_ONLY") {
    return null;
  }
  if (candidate.endsAt instanceof Date) return candidate.endsAt;
  return typeof candidate.endsAt === "string"
    ? parseDateOrNull(candidate.endsAt)
    : null;
};

type AffiliateEventDateValues = Readonly<{
  dateDisplayMode: AffiliateDateDisplayMode;
  dateDisplayText: string | null;
  start: Date;
  end: Date | null;
}>;

const affiliateEventDateValues = (
  candidate: AffiliateCandidateRecord,
): AffiliateEventDateValues => {
  const dateDisplayMode = normalizeDateDisplayMode(candidate.dateDisplayMode);
  return {
    dateDisplayMode,
    dateDisplayText: dateDisplayTextFromCandidate(candidate),
    start: eventStartFromCandidate(candidate),
    end: affiliateEventEndDate(candidate, dateDisplayMode),
  };
};

const assertAffiliateEventPublicationData = (params: {
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
  dateDisplayMode: AffiliateDateDisplayMode;
  eventTimeZone: string | null;
  coordinates: [number, number] | null;
  geocodeQueries: string[];
}) => {
  const isTimed =
    params.dateDisplayMode === "SCHEDULED" ||
    params.dateDisplayMode === "DATE_ONLY";
  if (params.state === "PUBLISHED" && isTimed && !params.eventTimeZone) {
    throw new Error(
      "Affiliate scheduled and date-only events require an evidence-backed IANA time zone before publication.",
    );
  }
  if (params.state === "PUBLISHED") {
    assertAffiliateCoordinatesForPublication({
      coordinates: params.coordinates,
      targetLabel: "event",
      queries: params.geocodeQueries,
    });
  }
};

const affiliateStringOrFallback = (
  value: unknown,
  fallback: string,
): string => firstAffiliateNullableString(value) ?? fallback;

const affiliateNoFixedEndDateTime = (end: Date | null): boolean => end === null;

const buildAffiliateEventRecord = (params: {
  candidate: AffiliateCandidateRecord;
  source: { id: string; organizationId?: string | null; name?: string | null };
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
  eventType: AffiliateInferredEventType;
  sportIds: string[];
  ageRange: {
    minAge: number | null;
    maxAge: number | null;
  };
  maxParticipants: number | null;
  hasSourceDivision: boolean;
  teamSignup: boolean;
  locationData: AffiliateEventLocationData;
  eventTimeZone: string | null;
  dateValues: AffiliateEventDateValues;
  affiliatePricing: {
    detailsText: string | null;
    displayText: string | null;
    priceCents: number | null;
  };
}) => {
  const {
    candidate,
    source,
    state,
    eventType,
    sportIds,
    ageRange,
    maxParticipants,
    hasSourceDivision,
    teamSignup,
    locationData,
    eventTimeZone,
    dateValues,
    affiliatePricing,
  } = params;
  const organizerName = firstAffiliateNullableString(
    candidate.organizerName,
    source.name,
  );
  return {
    name: affiliateStringOrFallback(candidate.title, "Untitled affiliate event"),
    createdAt: new Date(),
    updatedAt: new Date(),
    start: dateValues.start,
    end: dateValues.end,
    timeZone: affiliateStringOrFallback(eventTimeZone, "UTC"),
    description: buildAffiliateEventDescription(
      candidate,
      affiliatePricing.detailsText,
    ),
    affiliateUrl: nullableString(candidate.officialActionUrl),
    sourceType: "AFFILIATE_IMPORT",
    sourceId: candidate.id,
    sourceUrl: nullableString(candidate.sourceUrl),
    organizerName,
    scheduleText: affiliateValueOrDefault(
      nullableString(candidate.scheduleText),
      dateValues.dateDisplayText,
    ),
    dateDisplayMode: dateValues.dateDisplayMode,
    dateDisplayText: dateValues.dateDisplayText,
    priceText: affiliatePricing.displayText,
    statusText: nullableString(candidate.statusText),
    winnerSetCount: null,
    loserSetCount: null,
    doubleElimination: false,
    location: locationData.location,
    address: locationData.address,
    rating: null,
    teamSizeLimit: inferAffiliateTeamSizeLimit(candidate, teamSignup),
    maxParticipants,
    minAge: ageRange.minAge,
    maxAge: ageRange.maxAge,
    hostId: null,
    assistantHostIds: [],
    noFixedEndDateTime: affiliateNoFixedEndDateTime(dateValues.end),
    price: affiliateValueOrDefault(affiliatePricing.priceCents, 0),
    taxHandling: "ORGANIZER_COLLECTS",
    organizerManualTaxRateBps: 0,
    singleDivision: !hasSourceDivision,
    registrationByDivisionType: hasSourceDivision,
    cancellationRefundHours: null,
    teamSignup,
    prize: null,
    registrationCutoffHours: null,
    seedColor: 0,
    imageId: null,
    fieldCount: null,
    winnerBracketPointsToVictory: [],
    loserBracketPointsToVictory: [],
    coordinates: affiliateValueOrDefault(locationData.coordinates, [0, 0]),
    gamesPerOpponent: null,
    includePlayoffs: false,
    playoffTeamCount: null,
    usesSets: false,
    matchDurationMinutes: null,
    setDurationMinutes: null,
    setsPerMatch: null,
    restTimeMinutes: null,
    state,
    pointsToVictory: [],
    sportIds,
    timeSlotIds: [],
    fieldIds: [],
    leagueScoringConfigId: null,
    organizationId: nullableString(source.organizationId),
    parentEvent: null,
    autoCancellation: null,
    eventType,
    staffingPriority: staffingPriorityFromAffiliateCandidate(
      candidate as Record<string, unknown>,
    ),
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    officialPositions: [],
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    splitLeaguePlayoffDivisions: false,
    requiredTemplateIds: [],
  };
};

const buildAffiliateEventData = async (
  candidate: AffiliateCandidateRecord,
  source: { id: string; organizationId?: string | null; name?: string | null },
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE" = "UNPUBLISHED",
  fallbackCoordinates?: unknown,
  onCandidateNormalized?: (
    candidate: AffiliateCandidateDateTimeInput,
  ) => void | Promise<void>,
  client: any = prisma,
  allowRemoteGeocoding = true,
  preferFallbackCoordinates = false,
) => {
  const { eventType, sportIds } = await resolveAffiliateEventSports(
    candidate,
    state,
    client,
  );
  const primarySportId = sportIds[0] ?? null;
  const ageRange = inferAgeRange(candidate);
  const participantAvailability =
    inferCandidateParticipantAvailability(candidate);
  const divisionDetails = buildAffiliateDivisionDetails(
    candidate,
    primarySportId,
  );
  const affiliatePricing = buildAffiliateEventPricing(
    candidate,
    divisionDetails,
  );
  const locationData = await resolveAffiliateEventLocation({
    candidate,
    fallbackCoordinates,
    allowRemoteGeocoding,
    preferFallbackCoordinates,
  });
  const preparedDateTime = await prepareAffiliateEventDateTime({
    candidate,
    state,
    coordinates: locationData.coordinates,
    onCandidateNormalized,
  });
  const dateValues = affiliateEventDateValues(preparedDateTime.candidate);
  assertAffiliateEventPublicationData({
    state,
    dateDisplayMode: dateValues.dateDisplayMode,
    eventTimeZone: preparedDateTime.eventTimeZone,
    coordinates: locationData.coordinates,
    geocodeQueries: locationData.geocodeQueries,
  });
  return buildAffiliateEventRecord({
    candidate: preparedDateTime.candidate,
    source,
    state,
    eventType,
    sportIds,
    ageRange,
    maxParticipants: participantAvailability.maxParticipants,
    hasSourceDivision: divisionDetails.length > 0,
    teamSignup: inferAffiliateTeamSignup(candidate, eventType),
    locationData,
    eventTimeZone: preparedDateTime.eventTimeZone,
    dateValues,
    affiliatePricing,
  });
};

const loadSourceOrganization = async (
  source: { organizationId?: string | null },
  client: any = prisma,
) => {
  const organizationId = nullableString(source.organizationId);
  if (!organizationId) {
    throw new Error(
      "Affiliate source must be linked to a private organization before affiliate rows can be created.",
    );
  }

  const { organizations } = affiliatePrisma(client);
  const organization = await organizations.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      ownerId: true,
      name: true,
      location: true,
      address: true,
      coordinates: true,
      updatedAt: true,
      description: true,
      website: true,
      logoId: true,
    },
  });
  if (!organization) {
    throw new Error("Affiliate source organization was not found.");
  }
  return organization;
};

const sourceHasSeparatePublishedClubTarget = async (
  source: { id?: string | null; organizationId?: string | null },
  client: any = prisma,
): Promise<boolean> => {
  const sourceId = nullableString(source.id);
  const sourceOrganizationId = nullableString(source.organizationId);
  if (!sourceId || !sourceOrganizationId) return false;
  const publishedClub = await affiliatePrisma(client).candidates.findFirst({
    where: {
      sourceId,
      listingKind: "CLUB",
      status: "PUBLISHED",
      publishedOrganizationId: { not: null },
    },
    select: { publishedOrganizationId: true },
  });
  const targetOrganizationId = nullableString(
    publishedClub?.publishedOrganizationId,
  );
  return Boolean(
    targetOrganizationId && targetOrganizationId !== sourceOrganizationId,
  );
};

const affiliateEventPublicationCandidateFingerprint = (
  candidate: AffiliateCandidateRecord,
): string =>
  JSON.stringify({
    id: nullableString(candidate?.id),
    sourceId: nullableString(candidate?.sourceId),
    updatedAt: candidateUpdatedAtDate(candidate)?.toISOString() ?? null,
    venueName: nullableString(candidate?.venueName),
    address: nullableString(candidate?.address),
    city: nullableString(candidate?.city),
    locationSource: candidateLocationSource(candidate),
    locationEvidence: candidateLocationEvidence(candidate),
    resolvedCoordinates: candidateResolvedCoordinates(candidate),
  });

const affiliateEventPublicationSourceFingerprint = (source: {
  id?: string | null;
  organizationId?: string | null;
  name?: string | null;
}): string =>
  JSON.stringify({
    id: nullableString(source.id),
    organizationId: nullableString(source.organizationId),
    name: nullableString(source.name),
  });

const affiliateEventPublicationOrganizationFingerprint = (organization: {
  id?: string | null;
  name?: string | null;
  location?: string | null;
  address?: string | null;
  coordinates?: unknown;
  updatedAt?: Date | string | null;
}): string =>
  JSON.stringify({
    id: nullableString(organization.id),
    name: nullableString(organization.name),
    location: nullableString(organization.location),
    address: nullableString(organization.address),
    coordinates: normalizeAffiliateCoordinates(organization.coordinates),
    updatedAt:
      organization.updatedAt instanceof Date
        ? organization.updatedAt.toISOString()
        : nullableString(organization.updatedAt),
  });

const prepareAffiliateEventPublicationLocations = async (
  candidate: AffiliateCandidateRecord,
  source: { id?: string | null; organizationId?: string | null },
  client: any = prisma,
): Promise<{
  eventCoordinates: [number, number] | null;
  sourceOrganizationCoordinates: [number, number] | null;
  candidateFingerprint: string;
  sourceFingerprint: string;
  sourceOrganizationFingerprint: string;
}> => {
  const eventCoordinates =
    candidateResolvedCoordinates(candidate) ??
    (
      await geocodeFirstAvailableAddressWithQuery(
        buildAffiliateEventLocationQueries({
          location: nullableString(candidate.venueName),
          address: nullableString(candidate.address),
          city: nullableString(candidate.city),
        }),
      )
    ).coordinates;
  const sourceOrganization = await loadSourceOrganization(source, client);
  const hasSeparatePublishedClubTarget =
    await sourceHasSeparatePublishedClubTarget(source, client);
  if (hasSeparatePublishedClubTarget) {
    return {
      eventCoordinates,
      sourceOrganizationCoordinates: null,
      candidateFingerprint:
        affiliateEventPublicationCandidateFingerprint(candidate),
      sourceFingerprint: affiliateEventPublicationSourceFingerprint(source),
      sourceOrganizationFingerprint:
        affiliateEventPublicationOrganizationFingerprint(sourceOrganization),
    };
  }

  const sourceOrganizationCoordinates =
    normalizeAffiliateCoordinates(sourceOrganization.coordinates) ??
    (
      await geocodeFirstAvailableAddressWithQuery(
        buildAffiliatePlaceLocationQueries({
          name: nullableString(sourceOrganization.name),
          location: nullableString(sourceOrganization.location),
          address: nullableString(sourceOrganization.address),
          city: nullableString(sourceOrganization.location),
        }),
      )
    ).coordinates;
  return {
    eventCoordinates,
    sourceOrganizationCoordinates,
    candidateFingerprint:
      affiliateEventPublicationCandidateFingerprint(candidate),
    sourceFingerprint: affiliateEventPublicationSourceFingerprint(source),
    sourceOrganizationFingerprint:
      affiliateEventPublicationOrganizationFingerprint(sourceOrganization),
  };
};

const keepSourceOrganizationPrivateForPublishedClub = async (
  source: { organizationId?: string | null },
  targetOrganizationId: string,
  client: any = prisma,
) => {
  const sourceOrganizationId = nullableString(source.organizationId);
  if (!sourceOrganizationId || sourceOrganizationId === targetOrganizationId)
    return;
  const { organizations } = affiliatePrisma(client);
  const sourceOrganization = await organizations.findUnique({
    where: { id: sourceOrganizationId },
    select: { status: true, publicPageEnabled: true },
  });
  if (
    !sourceOrganization ||
    sourceOrganization.publicPageEnabled === true ||
    sourceOrganization.status === "UNLISTED"
  ) {
    return;
  }
  await organizations.update({
    where: { id: sourceOrganizationId },
    data: {
      status: "UNLISTED",
      updatedAt: new Date(),
    },
  });
};

const assertSourceOrganization = async (
  source: { organizationId?: string | null },
  client: any = prisma,
) => {
  await loadSourceOrganization(source, client);
};

const markSourceOrganizationListedForPublishedContent = async (
  source: { id?: string | null; organizationId?: string | null },
  client: any = prisma,
  preparedCoordinates?: unknown,
  preparedOrganizationFingerprint?: string,
) => {
  if (await sourceHasSeparatePublishedClubTarget(source, client)) return;
  const organization = await loadSourceOrganization(source, client);
  if (
    preparedOrganizationFingerprint &&
    affiliateEventPublicationOrganizationFingerprint(organization) !==
      preparedOrganizationFingerprint
  ) {
    throw new Error(
      "Affiliate source organization changed after location preparation. " +
        "Refresh the candidate and retry publication.",
    );
  }
  const { organizations } = affiliatePrisma(client);
  const geocodeQueries = buildAffiliatePlaceLocationQueries({
    name: nullableString(organization.name),
    location: nullableString(organization.location),
    address: nullableString(organization.address),
    city: nullableString(organization.location),
  });
  const coordinates =
    normalizeAffiliateCoordinates(organization.coordinates) ??
    (preparedCoordinates === undefined
      ? await geocodeFirstAvailableAddress(geocodeQueries)
      : normalizeAffiliateCoordinates(preparedCoordinates));
  if (!coordinates) {
    // Publishing a child event or rental must not make an unlocatable source
    // organization visible on the organization map. Its own evidence can be
    // completed independently without blocking a correctly located child.
    return;
  }
  const organizationUpdatedAt = candidateUpdatedAtDate(organization);
  await organizations.update({
    where: { id: organization.id, updatedAt: organizationUpdatedAt },
    data: {
      status: "LISTED",
      coordinates,
      updatedAt: new Date(),
    },
  });
};
const affiliateTeamName = (
  candidate: AffiliateCandidateRecord,
  sourceName: string | null,
): string => {
  const title = affiliateStringOrFallback(
    candidate.title,
    "Affiliate team registration",
  );
  return sourceName && !title.toLowerCase().includes(sourceName.toLowerCase())
    ? `${sourceName} ${title}`
    : title;
};

const affiliateTeamDivision = (candidate: AffiliateCandidateRecord): string =>
  firstAffiliateNullableString(
    candidate.divisionText,
    candidate.formatLabel,
  ) ?? "Community Team";

const buildAffiliateTeamData = async (
  candidate: AffiliateCandidateRecord,
  source: { id: string; organizationId?: string | null; name?: string | null },
  visibility: "ADMIN_ONLY" | "PUBLIC" = "ADMIN_ONLY",
  client: any = prisma,
) => {
  const organization = await loadSourceOrganization(source, client);
  const divisionDetail = buildAffiliateDivisionDetail(candidate);
  return {
    name: affiliateTeamName(candidate, nullableString(source.name)),
    division: affiliateTeamDivision(candidate),
    divisionTypeId: affiliateNullableValue(divisionDetail?.divisionTypeId),
    wins: null,
    losses: null,
    teamSize: affiliateValueOrDefault(
      parseFirstPositiveInteger(candidate.participantOptionsText),
      20,
    ),
    profileImageId: null,
    sport: affiliateStringOrFallback(candidate.sportName, "Soccer"),
    organizationId: organization.id,
    createdBy: nullableString(organization.ownerId),
    openRegistration: true,
    joinPolicy: "OPEN_REGISTRATION",
    registrationPriceCents: 0,
    requiredTemplateIds: [],
    visibility,
    affiliateUrl: nullableString(candidate.officialActionUrl),
    sourceType: "AFFILIATE_IMPORT",
    sourceId: candidate.id,
    sourceUrl: nullableString(candidate.sourceUrl),
  };
};
const affiliateTeamVisibility = (
  requested: unknown,
  existing: unknown,
  fallback = "ADMIN_ONLY",
): "ADMIN_ONLY" | "PUBLIC" =>
  (requested ?? existing ?? fallback) as "ADMIN_ONLY" | "PUBLIC";

const updateAffiliateTeamByPublishedId = async (params: {
  candidate: AffiliateCandidateRecord;
  source: { id: string; organizationId?: string | null; name?: string | null };
  teams: any;
  client: any;
  options: { visibility?: "ADMIN_ONLY" | "PUBLIC" };
}) => {
  const existingTeamId = publishedTeamIdFromCandidate(params.candidate);
  if (!existingTeamId) return null;
  const existingTeam = await params.teams.findUnique({
    where: { id: existingTeamId },
  });
  if (!existingTeam) return null;
  const updateData = await buildAffiliateTeamData(
    params.candidate,
    params.source,
    affiliateTeamVisibility(
      params.options.visibility,
      existingTeam.visibility,
    ),
    params.client,
  );
  return params.teams.update({
    where: { id: existingTeamId },
    data: updateData,
  });
};

const upsertAffiliateTeamForCandidate = async (
  candidate: AffiliateCandidateRecord,
  source: { id: string; organizationId?: string | null; name?: string | null },
  options: { visibility?: "ADMIN_ONLY" | "PUBLIC"; client?: any } = {},
) => {
  const client = options.client ?? prisma;
  const { teams } = affiliatePrisma(client);
  const existingTeam = await updateAffiliateTeamByPublishedId({
    candidate,
    source,
    teams,
    client,
    options,
  });
  if (existingTeam) return existingTeam;

  const existingBySource = await teams.findFirst({
    where: {
      sourceType: "AFFILIATE_IMPORT",
      sourceId: candidate.id,
    },
  });
  if (existingBySource) {
    const updateData = await buildAffiliateTeamData(
      candidate,
      source,
      affiliateTeamVisibility(options.visibility, existingBySource.visibility),
      client,
    );
    return teams.update({
      where: { id: existingBySource.id },
      data: updateData,
    });
  }

  const createData = await buildAffiliateTeamData(
    candidate,
    source,
    affiliateTeamVisibility(options.visibility, undefined),
    client,
  );
  return teams.create({
    data: {
      id: createId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...createData,
    },
  });
};

const affiliateFacilityIdForCandidate = (
  candidate: AffiliateCandidateRecord,
  source: AffiliateScrapeSourceRow,
): string => {
  const sourceKey =
    nullableString(source.sourceKey) ?? nullableString(source.id) ?? "source";
  const title =
    nullableString(candidate.title) ??
    nullableString(candidate.venueName) ??
    candidate.id ?? "candidate";
  return `affiliate_facility_${slugifyForId(sourceKey)}_${slugifyForId(title)}`;
};

type AffiliateFacilityLocationData = Readonly<{
  name: string;
  location: string;
  address: string | null;
  city: string | null;
  geocodeQueries: string[];
}>;

const affiliateFacilityLocationData = (
  candidate: AffiliateCandidateRecord,
): AffiliateFacilityLocationData => {
  const name =
    firstAffiliateNullableString(candidate.title, candidate.venueName) ??
    "Affiliate facility";
  const location =
    firstAffiliateNullableString(
      candidate.venueName,
      candidate.city,
      candidate.address,
    ) ?? name;
  const address = nullableString(candidate.address);
  const city = nullableString(candidate.city);
  return {
    name,
    location,
    address,
    city,
    geocodeQueries: buildAffiliatePlaceLocationQueries({
      name,
      location,
      address,
      city,
    }),
  };
};

const affiliateFacilityCoordinates = async (
  locationData: AffiliateFacilityLocationData,
  existingCoordinates: unknown,
): Promise<[number, number] | null> =>
  affiliateValueOrDefault(
    await geocodeFirstAvailableAddress(locationData.geocodeQueries),
    normalizeAffiliateCoordinates(existingCoordinates),
  );

const affiliateFacilityStatus = (
  candidate: AffiliateCandidateRecord,
  requestedStatus: string | null | undefined,
): string =>
  firstAffiliateNullableString(requestedStatus) ??
  (candidate.status === "PUBLISHED" ? "ACTIVE" : "DRAFT");

const assertAffiliateFacilityCanBePublished = async (params: {
  candidate: AffiliateCandidateRecord;
  status: string;
  coordinates: [number, number] | null;
  geocodeQueries: string[];
}) => {
  if (params.status !== "ACTIVE") return;
  await assertAffiliateCandidateUsesCanonicalSport(
    params.candidate,
    "rental facility",
  );
  assertAffiliateCoordinatesForPublication({
    coordinates: params.coordinates,
    targetLabel: "rental facility",
    queries: params.geocodeQueries,
  });
};

const upsertAffiliateFacilityForCandidate = async (
  candidate: AffiliateCandidateRecord,
  source: AffiliateScrapeSourceRow,
  options: { status?: string | null; client?: any } = {},
) => {
  const client = options.client ?? prisma;
  await loadSourceOrganization(source, client);
  const { facilities } = affiliatePrisma(client);
  const facilityId =
    firstAffiliateNullableString(candidate.publishedFacilityId) ??
    affiliateFacilityIdForCandidate(candidate, source);
  const existingFacility = await facilities.findUnique({
    where: { id: facilityId },
    select: { coordinates: true },
  });
  const locationData = affiliateFacilityLocationData(candidate);
  const coordinates = await affiliateFacilityCoordinates(
    locationData,
    existingFacility?.coordinates,
  );
  const status = affiliateFacilityStatus(candidate, options.status);
  await assertAffiliateFacilityCanBePublished({
    candidate,
    status,
    coordinates,
    geocodeQueries: locationData.geocodeQueries,
  });
  const data = {
    organizationId: nullableString(source.organizationId),
    name: locationData.name,
    location: locationData.location,
    address: locationData.address,
    coordinates,
    operatingHours: null,
    timeZone: affiliateStringOrFallback(
      candidate.timeZone,
      "America/Los_Angeles",
    ),
    status,
    isDefault: false,
    affiliateUrl: nullableString(candidate.officialActionUrl),
  };
  return facilities.upsert({
    where: { id: facilityId },
    create: {
      id: facilityId,
      ...data,
    },
    update: data,
  });
};

const slugifyForPublicSlug = (value: string): string =>
  slugifyPublicOrganizationName(value, 80) || "club";

const affiliateOrganizationIdForCandidate = (
  candidate: AffiliateCandidateRecord,
  source: AffiliateScrapeSourceRow,
): string => {
  const sourceKey =
    nullableString(source.sourceKey) ?? nullableString(source.id) ?? "source";
  const title =
    nullableString(candidate.title) ??
    nullableString(candidate.organizerName) ??
    candidate.id ?? "candidate";
  return `affiliate_org_${slugifyForId(sourceKey)}_${slugifyForId(title)}`;
};

const nextAvailableOrganizationSlug = async (
  baseSlug: string,
  organizationId: string,
  client: any = prisma,
): Promise<string> => {
  const { organizations } = affiliatePrisma(client);
  const base = slugifyForPublicSlug(baseSlug);
  for (let suffix = 0; suffix < 20; suffix += 1) {
    const publicSlug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const conflict = await organizations.findFirst({
      where: {
        publicSlug,
        NOT: { id: organizationId },
      },
      select: { id: true },
    });
    if (!conflict) {
      return publicSlug;
    }
  }
  const shortHash = createHash("sha1")
    .update(organizationId)
    .digest("hex")
    .slice(0, 8);
  return `${base}-${shortHash}`;
};

type AffiliateOrganizationLocationData = Readonly<{
  name: string;
  location: string | null;
  address: string | null;
  city: string | null;
  geocodeQueries: string[];
}>;

const affiliateOrganizationField = (
  values: unknown[],
  canonical: boolean,
  sourceValue: unknown,
): string | null =>
  firstAffiliateNullableString(
    ...values,
    ...(canonical ? [sourceValue] : []),
  );

const affiliateOrganizationLocationData = (params: {
  candidate: AffiliateCandidateRecord;
  source: AffiliateScrapeSourceRow;
  sourceOrganization: any;
  canonical: boolean;
}): AffiliateOrganizationLocationData => {
  const {
    candidate,
    source,
    sourceOrganization,
    canonical,
  } = params;
  const name =
    firstAffiliateNullableString(
      canonical ? sourceOrganization.name : null,
      candidate.title,
      candidate.organizerName,
      source.name,
    ) ?? "Affiliate club";
  const location = affiliateOrganizationField(
    [candidate.venueName, candidate.city, candidate.address],
    canonical,
    sourceOrganization.location,
  );
  const address = affiliateOrganizationField(
    [candidate.address],
    canonical,
    sourceOrganization.address,
  );
  const city = affiliateOrganizationField(
    [candidate.city],
    canonical,
    sourceOrganization.location,
  );
  return {
    name,
    location,
    address,
    city,
    geocodeQueries: buildAffiliatePlaceLocationQueries({
      name,
      location,
      address,
      city,
    }),
  };
};

const affiliateOrganizationCoordinates = async (params: {
  existingOrganization: any;
  sourceOrganization: any;
  canonical: boolean;
  geocodeQueries: string[];
}): Promise<[number, number] | null> => {
  const existingCoordinates = normalizeAffiliateCoordinates(
    params.existingOrganization?.coordinates,
  );
  if (existingCoordinates) return existingCoordinates;
  if (params.canonical) {
    const sourceCoordinates = normalizeAffiliateCoordinates(
      params.sourceOrganization.coordinates,
    );
    if (sourceCoordinates) return sourceCoordinates;
  }
  return geocodeFirstAvailableAddress(params.geocodeQueries);
};

const assertAffiliateOrganizationCanBePublished = async (params: {
  candidate: AffiliateCandidateRecord;
  status: "LISTED" | "UNLISTED";
  publicPageEnabled: boolean;
  coordinates: [number, number] | null;
  geocodeQueries: string[];
}) => {
  if (params.status !== "LISTED" && !params.publicPageEnabled) return;
  await assertAffiliateCandidateUsesCanonicalSport(params.candidate, "organization");
  assertAffiliateCoordinatesForPublication({
    coordinates: params.coordinates,
    targetLabel: "organization",
    queries: params.geocodeQueries,
  });
};

const affiliateOrganizationDescription = (params: {
  candidate: AffiliateCandidateRecord;
  sourceOrganization: any;
  canonical: boolean;
  existingOrganization: { originType?: unknown; ownershipStatus?: unknown } | null;
}): string | null => {
  const preserveSourceDescription =
    params.canonical &&
    !(params.existingOrganization?.originType === "AFFILIATE_IMPORTED" &&
      params.existingOrganization.ownershipStatus === "UNCLAIMED");
  if (preserveSourceDescription) {
    return firstAffiliateNullableString(
      params.sourceOrganization.description,
      params.candidate.description,
    );
  }
  return firstAffiliateNullableString(
    params.candidate.description,
    params.canonical ? params.sourceOrganization.description : null,
  );
};

const affiliateOrganizationWebsite = (params: {
  candidate: AffiliateCandidateRecord;
  source: AffiliateScrapeSourceRow;
  sourceOrganization: any;
  canonical: boolean;
}): string | null =>
  firstAffiliateNullableString(
    params.canonical ? params.sourceOrganization.website : null,
    params.candidate.officialActionUrl,
    params.candidate.sourceUrl,
    params.source.baseUrl,
  );

const affiliateOrganizationLogo = async (params: {
  candidate: AffiliateCandidateRecord;
  sourceOrganization: any;
  organizationId: string;
  ownerId: string;
  client: any;
  existingOrganization: any;
  canonical: boolean;
  deferLogoUpload: boolean;
}): Promise<string | null> => {
  const sourceLogo = params.canonical
    ? nullableString(params.sourceOrganization.logoId)
    : null;
  if (params.deferLogoUpload) {
    return firstAffiliateNullableString(
      params.existingOrganization?.logoId,
      sourceLogo,
    );
  }
  const uploadedLogo = await upsertAffiliateOrganizationLogoForCandidate(
    params.candidate,
    params.organizationId,
    params.ownerId,
    params.client,
  );
  return firstAffiliateNullableString(
    uploadedLogo,
    params.existingOrganization?.logoId,
    sourceLogo,
  );
};

const affiliateOrganizationLogoField = (
  logoId: string | null,
): Record<string, string> => (logoId ? { logoId } : {});

const affiliateOrganizationOwnerId = (sourceOrganization: any): string => {
  const ownerId = nullableString(sourceOrganization.ownerId);
  if (!ownerId) {
    throw new Error(
      "Affiliate source organization must have an owner before club rows can be created.",
    );
  }
  return ownerId;
};

const buildAffiliateOrganizationData = async (
  candidate: AffiliateCandidateRecord,
  source: AffiliateScrapeSourceRow,
  organizationId: string,
  options: {
    status?: "LISTED" | "UNLISTED";
    publicPageEnabled?: boolean;
    deferLogoUpload?: boolean;
  } = {},
  existingOrganization: any = null,
  client: any = prisma,
) => {
  const sourceOrganization = await loadSourceOrganization(source, client);
  const ownerId = affiliateOrganizationOwnerId(sourceOrganization);
  const canonical = organizationId === nullableString(source.organizationId);
  const locationData = affiliateOrganizationLocationData({
    candidate,
    source,
    sourceOrganization,
    canonical,
  });
  const coordinates = await affiliateOrganizationCoordinates({
    existingOrganization,
    sourceOrganization,
    canonical,
    geocodeQueries: locationData.geocodeQueries,
  });
  const status = affiliateValueOrDefault(options.status, "UNLISTED");
  const publicPageEnabled = options.publicPageEnabled === true;
  await assertAffiliateOrganizationCanBePublished({
    candidate,
    status,
    publicPageEnabled,
    coordinates,
    geocodeQueries: locationData.geocodeQueries,
  });
  const sportNames = candidateSportNames(candidate);
  const description = affiliateOrganizationDescription({
    candidate,
    sourceOrganization,
    canonical,
    existingOrganization,
  });
  const website = affiliateOrganizationWebsite({
    candidate,
    source,
    sourceOrganization,
    canonical,
  });
  const logoId = await affiliateOrganizationLogo({
    candidate,
    sourceOrganization,
    organizationId,
    ownerId,
    client,
    existingOrganization,
    canonical,
    deferLogoUpload: options.deferLogoUpload === true,
  });
  return {
    updatedAt: new Date(),
    name: locationData.name,
    ...affiliateOrganizationLogoField(logoId),
    ownerId,
    coordinates,
    location: locationData.location,
    address: locationData.address,
    description,
    website,
    sports: sportNames,
    status,
    hasStripeAccount: false,
    verificationStatus: "UNVERIFIED",
    verificationReviewStatus: "NONE",
    publicSlug: await nextAvailableOrganizationSlug(
      locationData.name,
      organizationId,
      client,
    ),
    publicPageEnabled,
    publicWidgetsEnabled: false,
    publicHeadline: locationData.name,
    publicIntroText: description,
    operatesAthleticFacility: false,
  };
};
const shouldPreserveAffiliateOrganization = (
  existingOrganization: any,
  organizationId: string,
  sourceOrganizationId: string | null,
): boolean =>
  existingOrganization?.id === organizationId &&
  Boolean(existingOrganization.ownershipStatus) &&
  existingOrganization.ownershipStatus !== "UNCLAIMED" &&
  Boolean(
    organizationId !== sourceOrganizationId ||
      existingOrganization.claimedAt ||
      nullableString(existingOrganization.claimedByUserId),
  );

const affiliateOrganizationCreateData = (
  organizationId: string,
  data: Record<string, unknown>,
) => ({
  id: organizationId,
  createdAt: new Date(),
  ...data,
  ...affiliateOrganizationInitialOwnership(),
});

const affiliateOrganizationUpdateData = (
  organizationId: string,
  sourceOrganizationId: string | null,
  data: Record<string, unknown>,
) => ({
  ...data,
  ...(organizationId === sourceOrganizationId
    ? {}
    : { originType: "AFFILIATE_IMPORTED" }),
});

const upsertAffiliateOrganizationForCandidate = async (
  candidate: AffiliateCandidateRecord,
  source: AffiliateScrapeSourceRow,
  options: {
    status?: "LISTED" | "UNLISTED";
    publicPageEnabled?: boolean;
    deferLogoUpload?: boolean;
    client?: any;
  } = {},
) => {
  const client = options.client ?? prisma;
  const { organizations } = affiliatePrisma(client);
  const organizationId =
    publishedOrganizationIdFromCandidate(candidate) ??
    affiliateOrganizationIdForCandidate(candidate, source);
  const existingOrganization = await organizations.findUnique({
    where: { id: organizationId },
  });
  if (
    shouldPreserveAffiliateOrganization(
      existingOrganization,
      organizationId,
      nullableString(source.organizationId),
    )
  ) {
    return existingOrganization;
  }
  const data = await buildAffiliateOrganizationData(
    candidate,
    source,
    organizationId,
    options,
    existingOrganization,
    client,
  );
  return organizations.upsert({
    where: { id: organizationId },
    create: affiliateOrganizationCreateData(organizationId, data),
    update: affiliateOrganizationUpdateData(
      organizationId,
      nullableString(source.organizationId),
      data,
    ),
  });
};

const syncAffiliateEventDivisions = async (params: {
  event: any;
  candidate: AffiliateCandidateRecord;
  source: { organizationId?: string | null };
  metadataClient: any;
}) => {
  const primarySportId = Array.isArray(params.event?.sportIds)
    ? params.event.sportIds[0] ?? null
    : null;
  const divisionDetails = buildAffiliateDivisionDetails(
    params.candidate,
    primarySportId,
  );
  if (divisionDetails.length === 0) return;
  await syncEventDivisions(
    {
      eventId: params.event.id,
      divisionIds: divisionDetails.map(
        (divisionDetail) => divisionDetail.key,
      ),
      fieldIds: [],
      includePlayoffs: false,
      singleDivision: false,
      sportId: primarySportId,
      referenceDate:
        params.event?.start instanceof Date
          ? params.event.start
          : candidateStartDate(params.candidate),
      organizationId: nullableString(params.source.organizationId),
      divisionDetails,
      defaultPrice: null,
      defaultMaxParticipants: null,
      eventType:
        params.event?.eventType ?? inferAffiliateEventType(params.candidate),
    },
    params.metadataClient,
  );
};

const syncAffiliateEventTags = async (params: {
  event: any;
  candidate: AffiliateCandidateRecord;
  metadataClient: any;
}) => {
  const eventType =
    params.event?.eventType ?? inferAffiliateEventType(params.candidate);
  const syncEventType =
    eventType === "LEAGUE" || eventType === "TOURNAMENT"
      ? eventType
      : undefined;
  await syncEventTags(
    params.event.id,
    buildAffiliateEventTagNames(params.candidate, eventType),
    params.metadataClient,
    { eventType: syncEventType },
  );
};

const syncAffiliateEventMetadata = async (params: {
  event: any;
  candidate: AffiliateCandidateRecord;
  source: { organizationId?: string | null };
  metadataClient: any;
}) => {
  await syncAffiliateEventDivisions(params);
  await syncAffiliateEventTags(params);
};

const applyAffiliateLockedEventUpdate = async (params: {
  eventId: string;
  updateData: Record<string, unknown>;
  client: any;
  useCurrentClient: boolean;
  candidate: AffiliateCandidateRecord;
  source: { organizationId?: string | null };
}) => {
  const applyWithinTransaction = async (transactionClient: any) => {
    await acquireEventLock(transactionClient, params.eventId);
    const transactionEvents = affiliatePrisma(transactionClient).events;
    const lockedEvent = await transactionEvents.findUnique({
      where: { id: params.eventId },
    });
    if (!lockedEvent) {
      throw new Error(`Affiliate event ${params.eventId} was not found.`);
    }
    const sourceUpdate = {
      sourceType: nullableString(params.updateData.sourceType),
      sourceId: nullableString(params.updateData.sourceId),
      sourceUrl: nullableString(params.updateData.sourceUrl),
    };
    const eventUpdate = { ...params.updateData };
    delete eventUpdate.sourceType;
    delete eventUpdate.sourceId;
    delete eventUpdate.sourceUrl;
    const transition = await applyEventSourceTransition({
      tx: transactionClient,
      currentEvent: lockedEvent,
      sourceUpdate,
      eventUpdate,
      beforeScheduleReconcile: (updatedEvent) =>
        syncAffiliateEventMetadata({
          event: updatedEvent,
          candidate: params.candidate,
          source: params.source,
          metadataClient: transactionClient,
        }),
    });
    return transition.event;
  };
  if (params.useCurrentClient) {
    return applyWithinTransaction(params.client);
  }
  if (typeof params.client.$transaction === "function") {
    return params.client.$transaction((transactionClient: any) =>
      applyWithinTransaction(transactionClient),
    );
  }
  return applyWithinTransaction(params.client);
};

const affiliateEventState = (
  options: {
    state?: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
  },
  existingState?: string | null,
): "UNPUBLISHED" | "PUBLISHED" | "PRIVATE" =>
  affiliateValueOrDefault(
    options.state,
    affiliateValueOrDefault(existingState as "UNPUBLISHED" | "PUBLISHED" | "PRIVATE" | null | undefined, "UNPUBLISHED"),
  );

const affiliateExistingEventFallbackCoordinates = (
  options: {
    fallbackCoordinates?: unknown;
    preferFallbackCoordinates?: boolean;
  },
  existingCoordinates: unknown,
): unknown =>
  options.preferFallbackCoordinates
    ? options.fallbackCoordinates
    : affiliateValueOrDefault(existingCoordinates, options.fallbackCoordinates);

const updateAffiliateEventFromExisting = async (params: {
  candidate: AffiliateCandidateRecord;
  source: { id: string; organizationId?: string | null; name?: string | null };
  existingEvent: any;
  options: {
    state?: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
    onCandidateNormalized?: (
      candidate: AffiliateCandidateDateTimeInput,
    ) => void | Promise<void>;
    fallbackCoordinates?: unknown;
    allowRemoteGeocoding: boolean;
    preferFallbackCoordinates: boolean;
  };
  client: any;
  useCurrentClient: boolean;
}) => {
  const updateData = await buildAffiliateEventData(
    params.candidate,
    params.source,
    affiliateEventState(params.options, params.existingEvent.state),
    affiliateExistingEventFallbackCoordinates(
      params.options,
      params.existingEvent.coordinates,
    ),
    params.options.onCandidateNormalized,
    params.client,
    params.options.allowRemoteGeocoding,
    params.options.preferFallbackCoordinates,
  );
  delete (updateData as any).createdAt;
  return applyAffiliateLockedEventUpdate({
    eventId: params.existingEvent.id,
    updateData,
    client: params.client,
    useCurrentClient: params.useCurrentClient,
    candidate: params.candidate,
    source: params.source,
  });
};

const affiliateOccurrenceEventUpdateData = (
  createData: Record<string, any>,
  state: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE" | undefined,
  existingEvent: Record<string, any>,
) => ({
  ...createData,
  state: affiliateValueOrDefault(
    state,
    affiliateValueOrDefault(existingEvent.state, createData.state),
  ),
  sourceId: affiliateValueOrDefault(
    existingEvent.sourceId,
    createData.sourceId,
  ),
});

const createAffiliateEventForCandidate = async (params: {
  candidate: AffiliateCandidateRecord;
  source: { id: string; organizationId?: string | null; name?: string | null };
  options: {
    state?: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
    onCandidateNormalized?: (
      candidate: AffiliateCandidateDateTimeInput,
    ) => void | Promise<void>;
    fallbackCoordinates?: unknown;
    allowRemoteGeocoding: boolean;
    preferFallbackCoordinates: boolean;
  };
  client: any;
  events: any;
  useCurrentClient: boolean;
}) => {
  const createData = await buildAffiliateEventData(
    params.candidate,
    params.source,
    affiliateValueOrDefault(params.options.state, "UNPUBLISHED"),
    params.options.fallbackCoordinates,
    params.options.onCandidateNormalized,
    params.client,
    params.options.allowRemoteGeocoding,
    params.options.preferFallbackCoordinates,
  );
  const existingByOccurrence = createData.affiliateUrl
    ? await params.events.findFirst({
        where: {
          sourceType: "AFFILIATE_IMPORT",
          sourceId: { not: params.candidate.id },
          organizationId: createData.organizationId,
          affiliateUrl: createData.affiliateUrl,
          name: createData.name,
          start: createData.start,
          eventType: createData.eventType,
          archivedAt: null,
        },
        orderBy: { createdAt: "asc" },
      })
    : null;
  if (existingByOccurrence) {
    const updateData = affiliateOccurrenceEventUpdateData(
      createData,
      params.options.state,
      existingByOccurrence,
    );
    delete (updateData as any).createdAt;
    return applyAffiliateLockedEventUpdate({
      eventId: existingByOccurrence.id,
      updateData,
      client: params.client,
      useCurrentClient: params.useCurrentClient,
      candidate: params.candidate,
      source: params.source,
    });
  }
  const event = await params.events.create({
    data: {
      id: createId(),
      ...createData,
    },
  });
  await syncAffiliateEventMetadata({
    event,
    candidate: params.candidate,
    source: params.source,
    metadataClient: params.client,
  });
  return event;
};

const upsertAffiliateEventForCandidate = async (
  candidate: AffiliateCandidateRecord,
  source: { id: string; organizationId?: string | null; name?: string | null },
  options: {
    state?: "UNPUBLISHED" | "PUBLISHED" | "PRIVATE";
    onCandidateNormalized?: (
      candidate: AffiliateCandidateDateTimeInput,
    ) => void | Promise<void>;
    client?: any;
    fallbackCoordinates?: unknown;
    allowRemoteGeocoding?: boolean;
    preferFallbackCoordinates?: boolean;
  } = {},
) => {
  const client = options.client ?? prisma;
  const allowRemoteGeocoding = affiliateValueOrDefault(
    options.allowRemoteGeocoding,
    true,
  );
  const preferFallbackCoordinates = affiliateValueOrDefault(
    options.preferFallbackCoordinates,
    false,
  );
  await assertSourceOrganization(source, client);
  const { events } = affiliatePrisma(client);
  const useCurrentClient = Boolean(options.client);
  const existingEventId = publishedEventIdFromCandidate(candidate);
  if (existingEventId) {
    const existingEvent = await events.findUnique({
      where: { id: existingEventId },
    });
    if (existingEvent) {
      return updateAffiliateEventFromExisting({
        candidate,
        source,
        existingEvent,
        options: {
          ...options,
          allowRemoteGeocoding,
          preferFallbackCoordinates,
        },
        client,
        useCurrentClient,
      });
    }
  }
  const existingBySource = await events.findFirst({
    where: {
      sourceType: "AFFILIATE_IMPORT",
      sourceId: candidate.id,
    },
  });
  if (existingBySource) {
    return updateAffiliateEventFromExisting({
      candidate,
      source,
      existingEvent: existingBySource,
      options: {
        ...options,
        allowRemoteGeocoding,
        preferFallbackCoordinates,
      },
      client,
      useCurrentClient,
    });
  }
  return createAffiliateEventForCandidate({
    candidate,
    source,
    options: {
      ...options,
      allowRemoteGeocoding,
      preferFallbackCoordinates,
    },
    client,
    events,
    useCurrentClient,
  });
};

const resolveActiveMapping = async (
  source: AffiliateScrapeSourceRow,
): Promise<{
  row: AffiliateScrapeMappingRow;
  mapping: AffiliateScrapeMapping;
}> => {
  const { mappings } = affiliatePrisma();
  const mappingRow = source.activeMappingId
    ? await mappings.findUnique({ where: { id: source.activeMappingId } })
    : await mappings.findFirst({
        where: { sourceId: source.id, isActive: true },
        orderBy: { version: "desc" },
      });

  if (!mappingRow) {
    throw new Error("No active scrape mapping is configured for this source.");
  }

  return {
    row: mappingRow,
    mapping: parseAffiliateScrapeMapping(mappingRow.mapping),
  };
};

type AffiliateDetailPageMapping = NonNullable<
  AffiliateScrapeMapping["detailPage"]
>;

const applyAffiliateDetailFields = (params: {
  candidate: AffiliateCandidateInput;
  detailValues: Record<string, unknown>;
  fields: AffiliateDetailPageMapping["fields"];
  detailUrl: string;
  detailPage: {
    finalUrl: string;
    statusCode: number | null;
    fetchedAt: string;
  };
}): {
  candidate: AffiliateCandidateInput;
  warnings: string[];
} => {
  const warnings = [...(params.candidate.warnings ?? [])];
  const nextCandidate: AffiliateCandidateInput = {
    ...params.candidate,
    rawPayload: {
      ...affiliateValueOrDefault(params.candidate.rawPayload, {}),
      detailPage: {
        url: params.detailUrl,
        finalUrl: params.detailPage.finalUrl,
        statusCode: params.detailPage.statusCode,
        extractedFields: params.detailValues,
      },
    },
  };
  Object.entries(params.fields).forEach(([fieldName, fieldMapping]) => {
    const value = nullableString(params.detailValues[fieldName]);
    if (value) {
      (nextCandidate as Record<string, unknown>)[fieldName] = value;
    } else if (fieldMapping.required) {
      warnings.push(`Missing required detail field: ${fieldName}`);
    }
  });
  nextCandidate.warnings = warnings;
  return { candidate: nextCandidate, warnings };
};

const affiliateDetailDateTimeInputs = (
  detailValues: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    ["startsAt", "endsAt", "durationText", "timeZone", "dateDisplayMode"]
      .filter((fieldName) => nullableString(detailValues[fieldName]) != null)
      .map((fieldName) => [fieldName, nullableString(detailValues[fieldName])]),
  );

const affiliateDetailTimeZoneEvidence = (
  detailDateTimeInputs: Record<string, unknown>,
  candidate: AffiliateCandidateInput,
): "SOURCE_FIELD" | "COORDINATES" | undefined => {
  if (detailDateTimeInputs.timeZone) return "SOURCE_FIELD";
  const existingEvidence = recordValue(
    recordValue(recordValue(candidate.rawPayload).normalizedImport).dateTime,
  ).timeZoneEvidence;
  if (existingEvidence === "COORDINATES") return "COORDINATES";
  return candidate.timeZone ? "SOURCE_FIELD" : undefined;
};

const affiliateDetailReferenceDate = (
  detailPage: { fetchedAt: string },
  params: { referenceDate?: Date },
): Date => {
  const fetchedAt = new Date(detailPage.fetchedAt);
  return params.referenceDate ??
    (Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt);
};

const normalizeAffiliateDetailDateTime = (params: {
  candidate: AffiliateCandidateInput;
  detailValues: Record<string, unknown>;
  detailPage: { fetchedAt: string };
  referenceDate?: Date;
}): AffiliateCandidateInput => {
  const detailDateTimeInputs = affiliateDetailDateTimeInputs(params.detailValues);
  if (!Object.keys(detailDateTimeInputs).length) return params.candidate;
  return normalizeAffiliateCandidateDateTime(params.candidate, {
    timeZone:
      nullableString(detailDateTimeInputs.timeZone) ??
      nullableString(params.candidate.timeZone),
    timeZoneEvidence: affiliateDetailTimeZoneEvidence(
      detailDateTimeInputs,
      params.candidate,
    ),
    referenceDate: affiliateDetailReferenceDate(
      params.detailPage,
      params,
    ),
    dateTimeInputs: detailDateTimeInputs,
  });
};

const enrichAffiliateDetailCandidate = (params: {
  candidate: AffiliateCandidateInput;
  detailUrl: string;
  detailPage: {
    finalUrl: string;
    statusCode: number | null;
    fetchedAt: string;
  };
  mapping: AffiliateDetailPageMapping;
  referenceDate?: Date;
  detailValues: Record<string, unknown>;
}): AffiliateCandidateInput => {
  const fieldResult = applyAffiliateDetailFields({
    candidate: params.candidate,
    detailValues: params.detailValues,
    fields: params.mapping.fields,
    detailUrl: params.detailUrl,
    detailPage: params.detailPage,
  });
  return normalizeAffiliateDetailDateTime({
    candidate: fieldResult.candidate,
    detailValues: params.detailValues,
    detailPage: params.detailPage,
    referenceDate: params.referenceDate,
  });
};

const affiliateDetailFetchFailureCandidate = (
  candidate: AffiliateCandidateInput,
  error: unknown,
): AffiliateCandidateInput => ({
  ...candidate,
  warnings: [
    ...(candidate.warnings ?? []),
    `Detail page fetch failed: ${error instanceof Error ? error.message : "unknown error"}`,
  ],
});

export const enrichAffiliateCandidatesWithDetailPages = async (
  candidates: AffiliateCandidateInput[],
  mapping: AffiliateScrapeMapping,
  client: ScrapePageClient,
  params: { referenceDate?: Date } = {},
): Promise<AffiliateCandidateInput[]> => {
  const detailPageMapping = mapping.detailPage;
  if (!detailPageMapping) return candidates;
  const delayMs = detailPageMapping.requestDelayMs ?? 0;
  const enriched: AffiliateCandidateInput[] = [];
  let fetchedDetailCount = 0;
  for (const candidate of candidates) {
    const detailUrl = nullableString(candidate[detailPageMapping.urlField]);
    if (!detailUrl) {
      enriched.push(candidate);
      continue;
    }
    if (fetchedDetailCount > 0) await sleep(delayMs);
    try {
      const detailPage = await client.fetchPage({
        url: detailUrl,
        renderJavascript: detailPageMapping.renderJavascript,
        waitMs: detailPageMapping.waitMs,
      });
      fetchedDetailCount += 1;
      const detailValues = extractAffiliateFieldValuesFromPage(
        detailPage,
        detailPageMapping.fields,
      );
      enriched.push(
        enrichAffiliateDetailCandidate({
          candidate,
          detailUrl,
          detailPage,
          mapping: detailPageMapping,
          referenceDate: params.referenceDate,
          detailValues,
        }),
      );
    } catch (error) {
      enriched.push(affiliateDetailFetchFailureCandidate(candidate, error));
    }
  }
  return enriched;
};
const affiliateSupplyTargetDimensions = (
  source: Record<string, unknown>,
  mapping: unknown,
  candidate: AffiliateCandidateInput,
  contract?: Parameters<typeof targetRuleFor>[0] | null,
): Readonly<{ marketKey: string | null; sportId: string | null }> => {
  const sourceMetadata = recordValue(source.metadata);
  const mappingMetadata = recordValue(recordValue(mapping).metadata);
  const candidatePayload = recordValue(candidate.rawPayload);
  const inferredDimensions = {
    marketKey: nullableString(candidatePayload.marketKey)
      ?? nullableString(mappingMetadata.marketKey)
      ?? nullableString(sourceMetadata.marketKey),
    sportId: nullableString(candidatePayload.sportId)
      ?? nullableString(mappingMetadata.sportId)
      ?? nullableString(sourceMetadata.sportId),
  };
  const contractRule = contract
    ? targetRuleFor(contract, {
        sourceProfile: candidate.listingKind,
        marketKey: inferredDimensions.marketKey,
        sportId: inferredDimensions.sportId,
      })
    : null;
  return {
    marketKey: contractRule?.marketKey ?? inferredDimensions.marketKey,
    sportId: contractRule?.sportId ?? inferredDimensions.sportId,
  };
};

const matchesAffiliatePublicEmptyState = (
  page: { body: string },
  mapping: AffiliateScrapeMapping,
): boolean => {
  const condition = mapping.emptyState;
  if (!condition) return false;
  let bodyText = "";
  try {
    const document = new JSDOM(page.body).window.document;
    if (condition.selector) {
      const selected = document.querySelector(condition.selector);
      if (!selected) return false;
      bodyText = selected.textContent ?? "";
    } else {
      bodyText = document.body?.textContent ?? document.textContent ?? "";
    }
  } catch {
    return false;
  }
  const normalizedBodyText = bodyText.replace(/\s+/g, " ").toLowerCase();
  return condition.textIncludes.every((text) => normalizedBodyText.includes(text.toLowerCase()));
};

type AffiliateScrapeRunContext = {
  sourceId: string;
  source: any;
  importMode: AffiliateScrapeImportMode;
  supplyDatabase: any;
  activeSupplySourceId: string | null;
  automaticSupplyContract: Parameters<typeof targetRuleFor>[0] | null;
  mappingRow: AffiliateScrapeMappingRow;
  mapping: AffiliateScrapeMapping;
  sourceOrganization: AffiliateSourceOrganizationLocation | null;
  run: any;
};
type AffiliateScrapeCompletionPage = Pick<
  ScrapedPage,
  "finalUrl" | "statusCode"
>;

const assertAffiliateAutomaticScrapeAssessment = (assessment: any): void => {
  if (
    !["ACTIVATED", "PUBLISHED"].includes(assessment.stage) ||
    !assessment.isAutomationEnabled
  ) {
    throw new Error(
      `Automatic affiliate scrape is not authorized for supply stage ${assessment.stage}.`,
    );
  }
};

const loadAffiliateAutomaticSupplyRoot = async (
  source: any,
  supplyDatabase: any,
) => {
  if (!source.supplySourceId) {
    throw new Error("Automatic affiliate scrape requires a Supply Source root.");
  }
  return supplyDatabase.supplySources?.findUnique
    ? supplyDatabase.supplySources.findUnique({
        where: { id: source.supplySourceId },
        select: { rolloutCohort: true },
      })
    : null;
};

const loadAffiliateAutomaticManifestContract = async (params: {
  supplyDatabase: any;
  rolloutCohort?: string | null;
}): Promise<Parameters<typeof targetRuleFor>[0] | null> => {
  if (!params.supplyDatabase.contractManifests?.findFirst) return null;
  const activeManifest = await params.supplyDatabase.contractManifests.findFirst({
    where: {
      status: "ACTIVE",
      ...(params.rolloutCohort
        ? { rolloutCohort: params.rolloutCohort }
        : {}),
    },
  });
  return activeManifest
    ? (
        await loadActiveAffiliateSupplyContract({
          db: params.supplyDatabase,
          rolloutCohort: params.rolloutCohort ?? undefined,
        })
      ).policy
    : null;
};

const loadAffiliateAutomaticSupplyContract = async (
  source: any,
  supplyDatabase: any,
): Promise<Parameters<typeof targetRuleFor>[0] | null> => {
  const supplyRoot = await loadAffiliateAutomaticSupplyRoot(
    source,
    supplyDatabase,
  );
  const contract = await loadAffiliateAutomaticManifestContract({
    supplyDatabase,
    rolloutCohort: supplyRoot?.rolloutCohort,
  });
  const assessment = await deriveAndPersistAffiliateSupplyAssessment({
    supplySourceId: source.supplySourceId,
    contract: contract ?? undefined,
    db: supplyDatabase,
  });
  assertAffiliateAutomaticScrapeAssessment(assessment);
  return contract;
};

const mappingRequiresAffiliateSourceOrganization = (
  mapping: AffiliateScrapeMapping,
): boolean =>
  mapping.kind === "EVENT" ||
  mapping.kind === "TEAM" ||
  mapping.kind === "CLUB";

const loadAffiliateScrapeRunContext = async (
  sourceId: string,
  params: {
    requestedByUserId?: string | null;
    importMode?: AffiliateScrapeImportMode;
  },
): Promise<AffiliateScrapeRunContext> => {
  const { sources, runs } = affiliatePrisma();
  const source = await sources.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error("Affiliate scrape source not found.");
  }
  const importMode = params.importMode ?? "REVIEW";
  const supplyDatabase = affiliateSupplyDatabase();
  const automaticSupplyContract =
    importMode === "AUTOMATIC"
      ? await loadAffiliateAutomaticSupplyContract(source, supplyDatabase)
      : null;
  const { row: mappingRow, mapping } = await resolveActiveMapping(source);
  if (importMode === "AUTOMATIC" && !mappingRow.validatedAt) {
    throw new Error(
      "Automatic imports require an explicitly validated active mapping.",
    );
  }
  const sourceOrganization = mappingRequiresAffiliateSourceOrganization(mapping)
    ? await loadSourceOrganization(source)
    : null;
  const run = await runs.create({
    data: {
      id: createId(),
      sourceId,
      ...(source.supplySourceId
        ? { supplySourceId: source.supplySourceId }
        : {}),
      mappingId: mappingRow.id,
      requestedByUserId: params.requestedByUserId ?? null,
      status: "RUNNING",
      fetchedUrl: mapping.listUrl,
    },
  });
  return {
    sourceId,
    source,
    importMode,
    supplyDatabase,
    activeSupplySourceId: source.supplySourceId ?? null,
    automaticSupplyContract,
    mappingRow,
    mapping,
    sourceOrganization,
    run,
  };
};

const fetchAffiliateScrapePage = async (
  context: AffiliateScrapeRunContext,
  client?: ScrapePageClient,
) => {
  const pageClient = client ?? scrapingDogClient;
  const fetchedPage = await pageClient.fetchPage({
    url: context.mapping.listUrl || context.source.listUrl,
    renderJavascript: context.mapping.renderJavascript,
    waitMs: context.mapping.waitMs,
  });
  const page = fetchedPage.isRedirectVerified === true
    ? fetchedPage
    : { ...fetchedPage, finalUrl: fetchedPage.url };
  return { pageClient, page };
};

const assertAffiliateScrapeIdentityResult = (identityResult: {
  identity: {
    rootDecision: string;
    isRevalidationRequired?: boolean;
  };
}): void => {
  if (identityResult.identity.rootDecision === "REVIEW_REQUIRED") {
    throw new Error(
      "Affiliate scrape final URL requires Supply Source identity review.",
    );
  }
  if (identityResult.identity.rootDecision === "SUCCESSOR_REQUIRED") {
    throw new Error(
      "Affiliate scrape final URL created a successor Supply Source and requires revalidation.",
    );
  }
  if (
    identityResult.identity.rootDecision === "SAME_ROOT" &&
    identityResult.identity.isRevalidationRequired
  ) {
    throw new Error(
      "Affiliate scrape final URL changed the Supply Source identity and requires revalidation.",
    );
  }
};

const reconcileAffiliateScrapeSupplyIdentity = async (
  context: AffiliateScrapeRunContext,
  page: Pick<ScrapedPage, "finalUrl" | "isRedirectVerified">,
): Promise<void> => {
  if (
    !context.activeSupplySourceId
    || !page.finalUrl
    || page.isRedirectVerified !== true
    || !context.supplyDatabase.supplySources?.findUnique
  ) {
    return;
  }

  // Only a transport-observed redirect can enter identity reconciliation.
  // Validate that resolved transport URL before loading or mutating identity.
  await assertSafePublicUrl(page.finalUrl);

  const currentRoot = await context.supplyDatabase.supplySources.findUnique({
    where: { id: context.activeSupplySourceId },
  });
  if (!currentRoot) {
    throw new Error("Affiliate Supply Source root not found.");
  }
  const identity = normalizeAffiliateSupplyIdentity({
    requestedUrl: currentRoot.canonicalUrl,
    resolvedCanonicalUrl: page.finalUrl,
    isRedirectVerified: page.isRedirectVerified === true,
    operatorDomain: currentRoot.operatorDomain,
    prior: {
      canonicalUrl: currentRoot.canonicalUrl,
      operatorDomain: currentRoot.operatorDomain,
      identityKey: currentRoot.identityKey,
    },
  });
  const successorRequired = identity.rootDecision === "SUCCESSOR_REQUIRED";
  const identityResult = await ensureAffiliateSupplySource({
    requestedUrl: currentRoot.canonicalUrl,
    resolvedCanonicalUrl: page.finalUrl,
    isRedirectVerified: page.isRedirectVerified === true,
    operatorDomain: currentRoot.operatorDomain,
    targetKind: currentRoot.targetKind,
    rolloutCohort: currentRoot.rolloutCohort,
    priorSupplySourceId: currentRoot.id,
    liveSourceId: successorRequired ? null : context.source.id,
    db: context.supplyDatabase,
    now: new Date(),
  });
  assertAffiliateScrapeIdentityResult(identityResult);
  context.activeSupplySourceId = String(identityResult.supplySource.id);
};

const affiliateScrapeEffectiveReferenceDate = (fetchedAt: string): Date => {
  const referenceDate = new Date(fetchedAt);
  return Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
};

const affiliateCandidateHasSourceDateTime = (
  candidate: AffiliateCandidateInput,
): boolean => {
  const rawPayload = recordValue(candidate.rawPayload);
  const dateTimeInputs = recordValue(rawPayload.dateTimeInputs);
  const rawExtractedFields = recordValue(rawPayload.rawExtractedFields);
  return Boolean(
    firstAffiliateNullableString(
      dateTimeInputs.startsAt,
      rawExtractedFields.startsAt,
    ),
  );
};

const affiliateCandidateCanResolveDateTime = (
  candidate: AffiliateCandidateInput,
): boolean =>
  candidate.listingKind === "EVENT" &&
  (normalizeDateDisplayMode(candidate.dateDisplayMode) === "SCHEDULED" ||
    normalizeDateDisplayMode(candidate.dateDisplayMode) === "DATE_ONLY") &&
  affiliateCandidateHasSourceDateTime(candidate);

type AffiliateScrapeCandidateClassification =
  | { candidate: AffiliateCandidateInput; rejection?: never }
  | { candidate?: never; rejection: { title: string; reasons: string[] } };

const affiliateDescriptionQualityRejectionReason = (params: {
  candidate: AffiliateCandidateInput;
  supplyBacked: boolean;
}): string | null => {
  if (
    !params.supplyBacked ||
    (params.candidate.listingKind !== "EVENT" &&
      params.candidate.listingKind !== "CLUB")
  ) {
    return null;
  }
  const issue = analyzeAffiliateDescriptionQuality({
    kind: params.candidate.listingKind === "CLUB" ? "ORGANIZATION" : "EVENT",
    name: params.candidate.title,
    description: params.candidate.description,
  })[0];
  return issue ? `description:${issue.code}` : null;
};

const classifyAffiliateScrapeCandidate = async (params: {
  candidate: AffiliateCandidateInput;
  sourceOrganization: AffiliateSourceOrganizationLocation | null;
  referenceDate: Date;
  now: Date;
}): Promise<AffiliateScrapeCandidateClassification> => {
  const initialReasons = candidateImportRejectionReasons(
    params.candidate,
    params.now,
  );
  if (
    initialReasons.length &&
    !affiliateCandidateCanResolveDateTime(params.candidate)
  ) {
    return {
      rejection: { title: params.candidate.title, reasons: initialReasons },
    };
  }
  const locationResult = await resolveAffiliateEventCandidateLocation({
    candidate: params.candidate,
    sourceOrganization: params.sourceOrganization,
  });
  if (locationResult.reasons.length) {
    return {
      rejection: {
        title: params.candidate.title,
        reasons: locationResult.reasons,
      },
    };
  }
  const normalizedCandidate = enrichAffiliateEventDateTimeFromCoordinates({
    candidate: locationResult.candidate,
    referenceDate: params.referenceDate,
  });
  const reasons = candidateImportRejectionReasons(
    normalizedCandidate,
    params.now,
  );
  if (reasons.length) {
    return {
      rejection: { title: normalizedCandidate.title, reasons },
    };
  }
  return { candidate: normalizedCandidate };
};

const classifyAffiliateScrapeCandidates = async (params: {
  candidates: AffiliateCandidateInput[];
  sourceOrganization: AffiliateSourceOrganizationLocation | null;
  referenceDate: Date;
  supplyBacked: boolean;
}): Promise<{
  rejectedCandidates: Array<{ title: string; reasons: string[] }>;
  importableCandidates: AffiliateCandidateInput[];
}> => {
  const rejectedCandidates: Array<{ title: string; reasons: string[] }> = [];
  const importableCandidates: AffiliateCandidateInput[] = [];
  const now = new Date();
  for (const candidate of params.candidates) {
    const descriptionReason = affiliateDescriptionQualityRejectionReason({
      candidate,
      supplyBacked: params.supplyBacked,
    });
    if (descriptionReason) {
      rejectedCandidates.push({ title: candidate.title, reasons: [descriptionReason] });
      continue;
    }
    const classification = await classifyAffiliateScrapeCandidate({
      candidate,
      sourceOrganization: params.sourceOrganization,
      referenceDate: params.referenceDate,
      now,
    });
    if (classification.rejection) {
      rejectedCandidates.push(classification.rejection);
    } else {
      importableCandidates.push(classification.candidate);
    }
  }
  return { rejectedCandidates, importableCandidates };
};

const extractAffiliateScrapeCandidates = async (params: {
  context: AffiliateScrapeRunContext;
  page: ScrapedPage;
  client: ScrapePageClient;
}) => {
  const isEmptyStateMatched = matchesAffiliatePublicEmptyState(
    params.page,
    params.context.mapping,
  );
  const extractedListCandidates = extractAffiliateCandidatesFromPage(
    params.page,
    params.context.mapping,
  );
  const effectiveReferenceDate = affiliateScrapeEffectiveReferenceDate(
    params.page.fetchedAt,
  );
  const extractedCandidates = await enrichAffiliateCandidatesWithDetailPages(
    extractedListCandidates,
    params.context.mapping,
    params.client,
    { referenceDate: effectiveReferenceDate },
  );
  return {
    isEmptyStateMatched,
    extractedListCandidates,
    extractedCandidates,
    effectiveReferenceDate,
  };
};

const buildAffiliateRejectionSummary = (
  rejectedCandidates: Array<{ title: string; reasons: string[] }>,
): Record<string, number> =>
  rejectedCandidates.reduce<Record<string, number>>((summary, candidate) => {
    candidate.reasons.forEach((reason) => {
      summary[reason] = (summary[reason] ?? 0) + 1;
    });
    return summary;
  }, {});

const buildAffiliateAutomationDecision = (params: {
  context: AffiliateScrapeRunContext;
  importableCandidates: AffiliateCandidateInput[];
  rejectedCandidates: Array<{ title: string; reasons: string[] }>;
}) => {
  const automaticallyRequested = params.context.importMode === "AUTOMATIC";
  const automationMetrics = calculateAffiliateAutomationRunMetrics(
    params.importableCandidates,
    params.rejectedCandidates.length,
  );
  const automationDriftReasons = automaticallyRequested
    ? affiliateAutomationDriftReasons(
        parseAffiliateAutomationBaseline(
          recordValue(params.context.source.metadata)[
            AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY
          ],
        ),
        automationMetrics,
      )
    : [];
  const automationHeld = automationDriftReasons.length > 0;
  return {
    automaticallyPublishCandidates: automaticallyRequested && !automationHeld,
    automationHeld,
    automationDriftReasons,
    automationMetrics,
  };
};

type AffiliateScrapePersistenceResult = {
  savedCandidate: any;
  existingCandidate: any | null;
};

const affiliateCandidateInvalidSportMapping = (
  candidate: AffiliateCandidateInput,
  sportNames: string[],
  sportIds: Array<string | null>,
): boolean => {
  const inferredEventType =
    candidate.listingKind === "EVENT"
      ? inferAffiliateEventType(candidate)
      : null;
  return (
    sportNames.length === 0 ||
    sportIds.some((sportId) => !sportId) ||
    (candidate.listingKind !== "CLUB" &&
      sportNames.length > 1 &&
      !isMultiSportEventType(inferredEventType))
  );
};

const affiliateCandidateWithSportReviewWarning = (
  candidate: AffiliateCandidateInput,
  invalidSportMapping: boolean,
): AffiliateCandidateInput =>
  invalidSportMapping
    ? {
        ...candidate,
        warnings: Array.from(
          new Set([
            ...(candidate.warnings ?? []),
            AFFILIATE_SPORT_REVIEW_WARNING,
          ]),
        ),
      }
    : candidate;

const affiliateCandidateInitialStatus = (
  existingCandidate: any | null,
  quarantineInvalidSport: boolean,
): string =>
  quarantineInvalidSport
    ? "NEEDS_REVIEW"
    : existingCandidate?.status === "PUBLISHED"
      ? "PUBLISHED"
      : "DISCOVERED";

const saveAffiliateCandidateForRun = async (params: {
  candidates: any;
  existingCandidate: any | null;
  data: Record<string, unknown>;
  status: string;
}) => {
  if (params.existingCandidate) {
    return params.candidates.update({
      where: { id: params.existingCandidate.id },
      data: {
        ...params.data,
        publishedEventId: params.existingCandidate.publishedEventId ?? null,
        publishedTeamId: params.existingCandidate.publishedTeamId ?? null,
        publishedFacilityId: params.existingCandidate.publishedFacilityId ?? null,
        publishedOrganizationId:
          params.existingCandidate.publishedOrganizationId ?? null,
        status: params.status,
      },
    });
  }
  return params.candidates.create({
    data: {
      id: createId(),
      ...params.data,
      status: params.status,
    },
  });
};

const affiliateCandidatePublishedStatusData = (
  shouldPublishCandidate: boolean,
): Record<string, string> =>
  shouldPublishCandidate ? { status: "PUBLISHED" } : {};

type AffiliateCandidateTargetPersistenceParams = {
  savedCandidate: any;
  source: any;
  candidate: AffiliateCandidateInput;
  shouldPublishCandidate: boolean;
  transactionClient: any;
  candidates: any;
};

const persistAffiliateEventTarget = async (
  params: AffiliateCandidateTargetPersistenceParams,
  publishedStatusData: Record<string, string>,
) => {
  const event = await upsertAffiliateEventForCandidate(
    params.savedCandidate,
    params.source,
    {
      state: params.shouldPublishCandidate ? "PUBLISHED" : "UNPUBLISHED",
      client: params.transactionClient,
    },
  );
  if (params.shouldPublishCandidate) {
    await markSourceOrganizationListedForPublishedContent(
      params.source,
      params.transactionClient,
    );
  }
  return params.candidates.update({
    where: { id: params.savedCandidate.id },
    data: {
      ...publishedStatusData,
      publishedEventId: event.id,
    },
  });
};

const persistAffiliateTeamTarget = async (
  params: AffiliateCandidateTargetPersistenceParams,
  publishedStatusData: Record<string, string>,
) => {
  const team = await upsertAffiliateTeamForCandidate(
    params.savedCandidate,
    params.source,
    {
      visibility: params.shouldPublishCandidate ? "PUBLIC" : "ADMIN_ONLY",
      client: params.transactionClient,
    },
  );
  return params.candidates.update({
    where: { id: params.savedCandidate.id },
    data: {
      ...publishedStatusData,
      publishedTeamId: team.id,
    },
  });
};

const persistAffiliateFacilityTarget = async (
  params: AffiliateCandidateTargetPersistenceParams,
  publishedStatusData: Record<string, string>,
) => {
  const facility = await upsertAffiliateFacilityForCandidate(
    params.savedCandidate,
    params.source,
    {
      status: params.shouldPublishCandidate ? "ACTIVE" : "DRAFT",
      client: params.transactionClient,
    },
  );
  if (params.shouldPublishCandidate) {
    await markSourceOrganizationListedForPublishedContent(
      params.source,
      params.transactionClient,
    );
  }
  return params.candidates.update({
    where: { id: params.savedCandidate.id },
    data: {
      ...publishedStatusData,
      publishedFacilityId: facility.id,
    },
  });
};

const persistAffiliateClubTarget = async (
  params: AffiliateCandidateTargetPersistenceParams,
  publishedStatusData: Record<string, string>,
) => {
  const organization = await upsertAffiliateOrganizationForCandidate(
    params.savedCandidate,
    params.source,
    {
      status: params.shouldPublishCandidate ? "LISTED" : "UNLISTED",
      publicPageEnabled: params.shouldPublishCandidate,
      client: params.transactionClient,
    },
  );
  const savedWithOrganization = await params.candidates.update({
    where: { id: params.savedCandidate.id },
    data: {
      ...publishedStatusData,
      publishedOrganizationId: organization.id,
    },
  });
  if (params.shouldPublishCandidate) {
    await keepSourceOrganizationPrivateForPublishedClub(
      params.source,
      organization.id,
      params.transactionClient,
    );
  }
  return savedWithOrganization;
};

const persistAffiliateFallbackTarget = async (
  params: AffiliateCandidateTargetPersistenceParams,
) => {
  if (
    params.shouldPublishCandidate &&
    params.savedCandidate.status !== "PUBLISHED"
  ) {
    return params.candidates.update({
      where: { id: params.savedCandidate.id },
      data: { status: "PUBLISHED" },
    });
  }
  return params.savedCandidate;
};

const persistAffiliateCandidateTarget = async (
  params: AffiliateCandidateTargetPersistenceParams,
) => {
  const publishedStatusData = affiliateCandidatePublishedStatusData(
    params.shouldPublishCandidate,
  );
  if (params.candidate.listingKind === "EVENT") {
    return persistAffiliateEventTarget(params, publishedStatusData);
  }
  if (params.candidate.listingKind === "TEAM") {
    return persistAffiliateTeamTarget(params, publishedStatusData);
  }
  if (
    params.candidate.listingKind === "RENTAL" &&
    nullableString(params.source.organizationId)
  ) {
    return persistAffiliateFacilityTarget(params, publishedStatusData);
  }
  if (params.candidate.listingKind === "CLUB") {
    return persistAffiliateClubTarget(params, publishedStatusData);
  }
  return persistAffiliateFallbackTarget(params);
};

const persistAffiliateCandidateForRun = async (params: {
  context: AffiliateScrapeRunContext;
  candidate: AffiliateCandidateInput;
  transactionClient: any;
  automaticallyPublishCandidates: boolean;
  automationHeld: boolean;
}): Promise<AffiliateScrapePersistenceResult> => {
  const { candidates } = affiliatePrisma(params.transactionClient);
  const dedupeKey = buildAffiliateCandidateDedupeKey(
    params.context.sourceId,
    params.candidate,
    params.context.mapping,
  );
  const existingCandidate = await candidates.findUnique({
    where: {
      sourceId_dedupeKey: {
        sourceId: params.context.sourceId,
        dedupeKey,
      },
    },
  });
  if (
    params.automationHeld &&
    existingCandidate?.status === "PUBLISHED"
  ) {
    return { savedCandidate: existingCandidate, existingCandidate };
  }
  const sportNames = candidateSportNames(params.candidate);
  const sportIds = await Promise.all(
    sportNames.map((sportName) =>
      resolveAffiliateSportId(sportName, params.transactionClient),
    ),
  );
  const invalidSportMapping = affiliateCandidateInvalidSportMapping(
    params.candidate,
    sportNames,
    sportIds,
  );
  const candidateForPersistence = affiliateCandidateWithSportReviewWarning(
    params.candidate,
    invalidSportMapping,
  );
  const quarantineInvalidSport =
    invalidSportMapping &&
    (params.context.importMode === "AUTOMATIC" ||
      existingCandidate?.status === "PUBLISHED");
  const data = candidatePersistenceData({
    sourceId: params.context.sourceId,
    supplySourceId: params.context.activeSupplySourceId,
    runId: params.context.run.id,
    mappingId: params.context.mappingRow.id,
    dedupeKey,
    candidate: candidateForPersistence,
  });
  const shouldPublishCandidate =
    !params.automationHeld &&
    !invalidSportMapping &&
    (params.automaticallyPublishCandidates ||
      existingCandidate?.status === "PUBLISHED");
  const initialCandidateStatus = affiliateCandidateInitialStatus(
    existingCandidate,
    quarantineInvalidSport,
  );
  const savedCandidate = await saveAffiliateCandidateForRun({
    candidates,
    existingCandidate,
    data,
    status: initialCandidateStatus,
  });
  if (quarantineInvalidSport) {
    await quarantineAffiliateCandidateTarget(
      savedCandidate,
      params.transactionClient,
    );
    return { savedCandidate, existingCandidate };
  }
  const savedWithTarget = await persistAffiliateCandidateTarget({
    savedCandidate,
    source: params.context.source,
    candidate: params.candidate,
    shouldPublishCandidate,
    transactionClient: params.transactionClient,
    candidates,
  });
  return { savedCandidate: savedWithTarget, existingCandidate };
};

const affiliateLifecycleTargetOptionalData = (params: {
  dimensions: { marketKey?: string | null; sportId?: string | null };
  naturalExpiryAt: unknown;
}): Record<string, unknown> => ({
  ...(params.dimensions.marketKey
    ? { marketKey: params.dimensions.marketKey }
    : {}),
  ...(params.dimensions.sportId ? { sportId: params.dimensions.sportId } : {}),
  ...(params.naturalExpiryAt
    ? { metadata: { naturalExpiryAt: params.naturalExpiryAt } }
    : {}),
});

const buildAffiliateLifecycleTarget = (params: {
  context: AffiliateScrapeRunContext;
  mappingRow: AffiliateScrapeMappingRow;
  candidate: AffiliateCandidateInput;
  savedCandidate: any;
  automationHeld: boolean;
}): Record<string, unknown> | null => {
  if (!params.context.activeSupplySourceId) return null;
  if (params.automationHeld) return null;
  if (params.savedCandidate?.status !== "PUBLISHED") return null;
  const targetRoute = affiliateTargetRouteForListingKind(
    params.candidate.listingKind,
  );
  if (!targetRoute) return null;
  const targetId = nullableString(
    params.savedCandidate[targetRoute.publishedIdField],
  );
  if (!targetId) return null;
  const dimensions = affiliateSupplyTargetDimensions(
    params.context.source,
    params.mappingRow,
    params.candidate,
    params.context.automaticSupplyContract,
  );
  const naturalExpiryAt = params.candidate.endsAt ?? params.candidate.startsAt;
  return {
    targetType: targetRoute.targetType,
    targetId,
    sourceProfile:
      targetRoute.listingKind ?? params.candidate.listingKind,
    candidateId: params.savedCandidate.id,
    ...affiliateLifecycleTargetOptionalData({
      dimensions,
      naturalExpiryAt,
    }),
    evidenceRefs: [
      `run:${params.context.run.id}`,
      `candidate:${params.savedCandidate.id}`,
    ],
  };
};

const persistAffiliateCandidatesForRun = async (params: {
  context: AffiliateScrapeRunContext;
  importableCandidates: AffiliateCandidateInput[];
  automaticallyPublishCandidates: boolean;
  automationHeld: boolean;
  transactionClient: any;
}) => {
  const result = {
    savedCandidates: [] as any[],
    lifecycleTargets: [] as Array<Record<string, unknown>>,
    createdCandidateCount: 0,
    updatedCandidateCount: 0,
    automaticallyPublishedCandidateCount: 0,
  };
  for (const candidate of params.importableCandidates) {
    const persisted = await persistAffiliateCandidateForRun({
      context: params.context,
      candidate,
      transactionClient: params.transactionClient,
      automaticallyPublishCandidates: params.automaticallyPublishCandidates,
      automationHeld: params.automationHeld,
    });
    result.savedCandidates.push(persisted.savedCandidate);
    const lifecycleTarget = buildAffiliateLifecycleTarget({
      context: params.context,
      mappingRow: params.context.mappingRow,
      candidate,
      savedCandidate: persisted.savedCandidate,
      automationHeld: params.automationHeld,
    });
    if (lifecycleTarget) {
      result.lifecycleTargets.push(lifecycleTarget);
    }
    if (persisted.existingCandidate) {
      result.updatedCandidateCount += 1;
    } else {
      result.createdCandidateCount += 1;
    }
    if (
      params.automaticallyPublishCandidates &&
      persisted.savedCandidate.status === "PUBLISHED"
    ) {
      result.automaticallyPublishedCandidateCount += 1;
    }
  }
  return result;
};

const buildAffiliateScrapeRunLogs = (params: {
  isEmptyStateMatched: boolean;
  createdCandidateCount: number;
  updatedCandidateCount: number;
  rejectedCandidates: Array<{ title: string; reasons: string[] }>;
  automaticallyPublishedCandidateCount: number;
  automationHeld: boolean;
  automationDriftReasons: string[];
  automationMetrics: Record<string, unknown>;
}): Record<string, unknown> => ({
  isEmptyStateMatched: params.isEmptyStateMatched,
  createdCandidateCount: params.createdCandidateCount,
  updatedCandidateCount: params.updatedCandidateCount,
  rejectedCount: params.rejectedCandidates.length,
  automaticallyPublishedCandidateCount:
    params.automaticallyPublishedCandidateCount,
  automationHeld: params.automationHeld,
  automationDriftReasons: params.automationDriftReasons,
  automationMetrics: params.automationMetrics,
  rejectionSummary: buildAffiliateRejectionSummary(params.rejectedCandidates),
  rejectedCandidates: params.rejectedCandidates.slice(0, 25),
});

const recordAffiliateAutomationHold = async (params: {
  context: AffiliateScrapeRunContext;
  transactionSources: any;
  automationDriftReasons: string[];
  automationMetrics: Record<string, unknown>;
}) => {
  const heldAt = new Date();
  await params.transactionSources.update({
    where: { id: params.context.sourceId },
    data: {
      autoScrapeEnabled: false,
      metadata: {
        ...recordValue(params.context.source.metadata),
        [AFFILIATE_AUTOMATION_REVIEW_METADATA_KEY]: {
          heldAt: heldAt.toISOString(),
          runId: params.context.run.id,
          mappingId: params.context.mappingRow.id,
          reasons: params.automationDriftReasons,
          metrics: params.automationMetrics,
        },
      },
    },
  });
};

const completeAffiliateScrapeWithLifecycle = async (params: {
  context: AffiliateScrapeRunContext;
  activeSupplySourceId: string;
  transactionRuns: any;
  extractedCandidates: AffiliateCandidateInput[];
  savedCandidates: any[];
  lifecycleTargets: Array<Record<string, unknown>>;
  page: AffiliateScrapeCompletionPage;
  runLogs: Record<string, unknown>;
  isEmptyStateMatched: boolean;
  extractedListCandidates: AffiliateCandidateInput[];
  finishedAt: Date;
  automationHeld: boolean;
  automationDriftReasons: string[];
  automationMetrics: Record<string, unknown>;
  transactionClient: any;
}) => {
  const supplyDatabase = affiliateSupplyDatabase(params.transactionClient);
  const currentRoot = await supplyDatabase.supplySources.findUnique({
    where: { id: params.activeSupplySourceId },
  });
  if (!currentRoot) {
    throw new Error("Affiliate Supply Source not found.");
  }
  const automationReviewRequired = params.automationHeld
    ? {
        heldAt: params.finishedAt.toISOString(),
        runId: params.context.run.id,
        mappingId: params.context.mappingRow.id,
        reasons: params.automationDriftReasons,
        metrics: params.automationMetrics,
      }
    : undefined;
  const command =
    params.isEmptyStateMatched && params.extractedListCandidates.length === 0
      ? "RECORD_EMPTY_REFRESH"
      : "RECORD_REFRESH";
  await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: params.activeSupplySourceId,
    rolloutCohort: currentRoot.rolloutCohort,
    command,
    authority: "SYSTEM",
    expectedLifecycleGeneration: currentRoot.lifecycleGeneration,
    idempotencyKey: `refresh:${params.context.run.id}`,
    request: {
      sourceId: params.context.sourceId,
      runId: params.context.run.id,
      mappingId: params.context.mappingRow.id,
      itemCount: params.extractedCandidates.length,
      candidateCount: params.savedCandidates.length,
      finalUrl: params.page.finalUrl,
      httpStatus: params.page.statusCode,
      isEmptyStateMatched: params.isEmptyStateMatched,
      runLogs: params.runLogs,
      targets: params.lifecycleTargets,
      evidenceRefs: [
        `run:${params.context.run.id}`,
        `source:${params.context.sourceId}`,
        `mapping:${params.context.mappingRow.id}`,
      ],
      ...(automationReviewRequired ? { automationReviewRequired } : {}),
    },
    actorKind: "SYSTEM",
    actorId: "affiliate-source-scrape",
    db: supplyDatabase,
    now: params.finishedAt,
  });
  return params.transactionRuns.findUnique({
    where: { id: params.context.run.id },
  });
};

const completeAffiliateScrapeWithoutLifecycle = async (params: {
  context: AffiliateScrapeRunContext;
  transactionSources: any;
  transactionRuns: any;
  extractedCandidates: AffiliateCandidateInput[];
  savedCandidates: any[];
  page: AffiliateScrapeCompletionPage;
  runLogs: Record<string, unknown>;
  finishedAt: Date;
}) => {
  const finishedRun = await params.transactionRuns.update({
    where: { id: params.context.run.id },
    data: {
      status: "SUCCEEDED",
      finishedAt: params.finishedAt,
      finalUrl: params.page.finalUrl,
      httpStatus: params.page.statusCode,
      itemCount: params.extractedCandidates.length,
      candidateCount: params.savedCandidates.length,
      logs: params.runLogs,
    },
  });
  await params.transactionSources.update({
    where: { id: params.context.sourceId },
    data: {
      lastScrapeRunId: params.context.run.id,
      lastScrapedAt: params.finishedAt,
    },
  });
  return finishedRun;
};

const completeAffiliateScrapeRun = async (params: {
  context: AffiliateScrapeRunContext;
  transactionSources: any;
  transactionRuns: any;
  transactionClient: any;
  extractedCandidates: AffiliateCandidateInput[];
  extractedListCandidates: AffiliateCandidateInput[];
  savedCandidates: any[];
  page: AffiliateScrapeCompletionPage;
  lifecycleTargets: Array<Record<string, unknown>>;
  runLogs: Record<string, unknown>;
  isEmptyStateMatched: boolean;
  finishedAt: Date;
  automationHeld: boolean;
  automationDriftReasons: string[];
  automationMetrics: Record<string, unknown>;
}) => {
  const activeSupplySourceId = params.context.activeSupplySourceId;
  const finishedRun = activeSupplySourceId
    ? await completeAffiliateScrapeWithLifecycle({
        ...params,
        activeSupplySourceId,
      })
    : await completeAffiliateScrapeWithoutLifecycle(params);
  if (!finishedRun) {
    throw new Error("Affiliate scrape run was not found after completion.");
  }
  return {
    run: finishedRun,
    candidates: params.savedCandidates,
  };
};

const persistAffiliateScrapeRunTransaction = async (params: {
  context: AffiliateScrapeRunContext;
  transactionClient: any;
  extractedCandidates: AffiliateCandidateInput[];
  extractedListCandidates: AffiliateCandidateInput[];
  importableCandidates: AffiliateCandidateInput[];
  page: AffiliateScrapeCompletionPage;
  rejectedCandidates: Array<{ title: string; reasons: string[] }>;
  isEmptyStateMatched: boolean;
  automation: ReturnType<typeof buildAffiliateAutomationDecision>;
}) => {
  const {
    sources: transactionSources,
    runs: transactionRuns,
  } = affiliatePrisma(params.transactionClient);
  if (params.automation.automationHeld) {
    await recordAffiliateAutomationHold({
      context: params.context,
      transactionSources,
      automationDriftReasons: params.automation.automationDriftReasons,
      automationMetrics: params.automation.automationMetrics,
    });
  }
  const persisted = await persistAffiliateCandidatesForRun({
    context: params.context,
    importableCandidates: params.importableCandidates,
    automaticallyPublishCandidates:
      params.automation.automaticallyPublishCandidates,
    automationHeld: params.automation.automationHeld,
    transactionClient: params.transactionClient,
  });
  const finishedAt = new Date();
  const runLogs = buildAffiliateScrapeRunLogs({
    isEmptyStateMatched: params.isEmptyStateMatched,
    createdCandidateCount: persisted.createdCandidateCount,
    updatedCandidateCount: persisted.updatedCandidateCount,
    rejectedCandidates: params.rejectedCandidates,
    automaticallyPublishedCandidateCount:
      persisted.automaticallyPublishedCandidateCount,
    automationHeld: params.automation.automationHeld,
    automationDriftReasons: params.automation.automationDriftReasons,
    automationMetrics: params.automation.automationMetrics,
  });
  return completeAffiliateScrapeRun({
    context: params.context,
    transactionSources,
    transactionRuns,
    transactionClient: params.transactionClient,
    page: params.page,
    extractedCandidates: params.extractedCandidates,
    extractedListCandidates: params.extractedListCandidates,
    savedCandidates: persisted.savedCandidates,
    lifecycleTargets: persisted.lifecycleTargets,
    runLogs,
    isEmptyStateMatched: params.isEmptyStateMatched,
    finishedAt,
    automationHeld: params.automation.automationHeld,
    automationDriftReasons: params.automation.automationDriftReasons,
    automationMetrics: params.automation.automationMetrics,
  });
};

const tryRecordAffiliateScrapeLifecycleFailure = async (params: {
  context: AffiliateScrapeRunContext;
  errorMessage: string;
}): Promise<{ recorded: boolean; error: Error | null }> => {
  if (!params.context.activeSupplySourceId) {
    return { recorded: false, error: null };
  }
  try {
    const supplyDatabase = affiliateSupplyDatabase();
    const currentRoot = await supplyDatabase.supplySources.findUnique({
      where: { id: params.context.activeSupplySourceId },
    });
    if (!currentRoot) {
      return { recorded: false, error: null };
    }
    await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: params.context.activeSupplySourceId,
      command: "RECORD_REFRESH_FAILURE",
      authority: "SYSTEM",
      expectedLifecycleGeneration: currentRoot.lifecycleGeneration,
      idempotencyKey: `refresh-failure:${params.context.run.id}`,
      request: {
        sourceId: params.context.sourceId,
        runId: params.context.run.id,
        mappingId: params.context.mappingRow.id,
        errorMessage: params.errorMessage,
        evidenceRefs: [
          `run:${params.context.run.id}`,
          `source:${params.context.sourceId}`,
        ],
      },
      actorKind: "SYSTEM",
      actorId: "affiliate-source-scrape",
      db: supplyDatabase,
      now: new Date(),
    });
    return { recorded: true, error: null };
  } catch (failure) {
    return {
      recorded: false,
      error: failure instanceof Error ? failure : new Error(String(failure)),
    };
  }
};

const handleAffiliateScrapeFailure = async (
  context: AffiliateScrapeRunContext,
  error: unknown,
): Promise<never> => {
  const errorMessage = error instanceof Error ? error.message : "Scrape failed.";
  const lifecycleFailure = await tryRecordAffiliateScrapeLifecycleFailure({
    context,
    errorMessage,
  });
  if (!lifecycleFailure.recorded) {
    const { runs } = affiliatePrisma();
    await runs.update({
      where: { id: context.run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage,
      },
    });
  }
  if (lifecycleFailure.error) {
    throw new Error(
      `${errorMessage} Lifecycle failure recording failed: ${lifecycleFailure.error.message}`,
    );
  }
  throw error;
};

export const runAffiliateSourceScrape = async (
  sourceId: string,
  params: {
    requestedByUserId?: string | null;
    client?: ScrapePageClient;
    importMode?: AffiliateScrapeImportMode;
  } = {},
) => {
  const context = await loadAffiliateScrapeRunContext(sourceId, params);
  try {
    const { pageClient, page } = await fetchAffiliateScrapePage(
      context,
      params.client,
    );
    await reconcileAffiliateScrapeSupplyIdentity(context, page);
    const extracted = await extractAffiliateScrapeCandidates({
      context,
      page,
      client: pageClient,
    });
    const classified = await classifyAffiliateScrapeCandidates({
      candidates: extracted.extractedCandidates,
      sourceOrganization: context.sourceOrganization,
      referenceDate: extracted.effectiveReferenceDate,
      supplyBacked: Boolean(context.activeSupplySourceId),
    });
    const automation = buildAffiliateAutomationDecision({
      context,
      importableCandidates: classified.importableCandidates,
      rejectedCandidates: classified.rejectedCandidates,
    });
    return withAffiliateScrapeTransaction(
      prisma,
      async (transactionClient) =>
        persistAffiliateScrapeRunTransaction({
          context,
          transactionClient,
          page,
          extractedCandidates: extracted.extractedCandidates,
          extractedListCandidates: extracted.extractedListCandidates,
          importableCandidates: classified.importableCandidates,
          rejectedCandidates: classified.rejectedCandidates,
          isEmptyStateMatched: extracted.isEmptyStateMatched,
          automation,
        }),
    );
  } catch (error) {
    return handleAffiliateScrapeFailure(context, error);
  }
};

export const listAffiliateCandidates = async (
  params: { status?: string | null; sourceId?: string | null } = {},
) => {
  const { candidates } = affiliatePrisma();
  const where: Record<string, unknown> = {};
  const status = nullableString(params.status);
  const sourceId = nullableString(params.sourceId);
  if (status) {
    where.status = status.toUpperCase();
  } else {
    where.NOT = { status: "PUBLISHED" };
  }
  if (sourceId) where.sourceId = sourceId;

  return candidates.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: status ? (status.toUpperCase() === "PUBLISHED" ? 100 : 500) : 100,
  });
};

export const getAffiliateCandidate = async (candidateId: string) => {
  const { candidates } = affiliatePrisma();
  return candidates.findUnique({ where: { id: candidateId } });
};

const deleteImportedOrganizationTarget = async (
  candidate: AffiliateCandidateRecord,
  source?: { organizationId?: string | null } | null,
) => {
  const organizationId = nullableString(candidate?.publishedOrganizationId);
  if (
    !organizationId ||
    organizationId === nullableString(source?.organizationId)
  ) {
    return;
  }
  const { organizations } = affiliatePrisma();
  await organizations.deleteMany({ where: { id: organizationId } });
};

export const deleteAffiliateCandidate = async (candidateId: string) => {
  const { candidates, divisions, events, teams, facilities, sources } =
    affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error("Affiliate import candidate not found.");
  }
  const source = await sources.findUnique({
    where: { id: candidate.sourceId },
  });

  const eventId = nullableString(candidate.publishedEventId);
  if (eventId) {
    await divisions.deleteMany({ where: { eventId } });
    await events.deleteMany({ where: { id: eventId } });
  }

  const teamId = nullableString(candidate.publishedTeamId);
  if (teamId) {
    await teams.deleteMany({ where: { id: teamId } });
  }

  const facilityId = nullableString(candidate.publishedFacilityId);
  if (facilityId) {
    await facilities.deleteMany({ where: { id: facilityId } });
  }

  await deleteImportedOrganizationTarget(candidate, source);
  await candidates.delete({ where: { id: candidateId } });
  return candidate;
};

export const reclassifyAffiliateCandidate = async (
  candidateId: string,
  listingKind: unknown,
) => {
  const nextKind = normalizeListingKind(listingKind);
  const { candidates, divisions, events, teams, facilities, sources } =
    affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error("Affiliate import candidate not found.");
  }
  const source = await sources.findUnique({
    where: { id: candidate.sourceId },
  });
  if (!source) {
    throw new Error("Affiliate scrape source not found.");
  }

  const nextCandidate = {
    ...candidate,
    listingKind: nextKind,
  };
  const deleteReplacedTargets = async () => {
    if (nextKind !== "EVENT") {
      const eventId = nullableString(candidate.publishedEventId);
      if (eventId) {
        await divisions.deleteMany({ where: { eventId } });
        await events.deleteMany({ where: { id: eventId } });
      }
    }
    if (nextKind !== "TEAM") {
      const teamId = nullableString(candidate.publishedTeamId);
      if (teamId) {
        await teams.deleteMany({ where: { id: teamId } });
      }
    }
    if (nextKind !== "RENTAL") {
      const facilityId = nullableString(candidate.publishedFacilityId);
      if (facilityId) {
        await facilities.deleteMany({ where: { id: facilityId } });
      }
    }
    if (nextKind !== "CLUB") {
      await deleteImportedOrganizationTarget(candidate, source);
    }
  };

  if (nextKind === "EVENT") {
    const event = await upsertAffiliateEventForCandidate(
      nextCandidate,
      source,
      {
        state: candidate.status === "PUBLISHED" ? "PUBLISHED" : "UNPUBLISHED",
      },
    );
    await deleteReplacedTargets();
    const updatedCandidate = await candidates.update({
      where: { id: candidateId },
      data: {
        listingKind: nextKind,
        publishedEventId: event.id,
        publishedTeamId: null,
        publishedFacilityId: null,
        publishedOrganizationId: null,
      },
    });
    return { candidate: updatedCandidate, target: event };
  }

  if (nextKind === "TEAM") {
    const team = await upsertAffiliateTeamForCandidate(nextCandidate, source, {
      visibility: candidate.status === "PUBLISHED" ? "PUBLIC" : "ADMIN_ONLY",
    });
    await deleteReplacedTargets();
    const updatedCandidate = await candidates.update({
      where: { id: candidateId },
      data: {
        listingKind: nextKind,
        publishedEventId: null,
        publishedTeamId: team.id,
        publishedFacilityId: null,
        publishedOrganizationId: null,
      },
    });
    return { candidate: updatedCandidate, target: team };
  }

  if (nextKind === "RENTAL") {
    const facility = await upsertAffiliateFacilityForCandidate(
      nextCandidate,
      source,
      {
        status: candidate.status === "PUBLISHED" ? "ACTIVE" : "DRAFT",
      },
    );
    await deleteReplacedTargets();
    const updatedCandidate = await candidates.update({
      where: { id: candidateId },
      data: {
        listingKind: nextKind,
        publishedEventId: null,
        publishedTeamId: null,
        publishedFacilityId: facility.id,
        publishedOrganizationId: null,
      },
    });
    return { candidate: updatedCandidate, target: facility };
  }

  const organization = await upsertAffiliateOrganizationForCandidate(
    nextCandidate,
    source,
    {
      status: candidate.status === "PUBLISHED" ? "LISTED" : "UNLISTED",
      publicPageEnabled: candidate.status === "PUBLISHED",
    },
  );
  await deleteReplacedTargets();
  const updatedCandidate = await candidates.update({
    where: { id: candidateId },
    data: {
      listingKind: nextKind,
      publishedEventId: null,
      publishedTeamId: null,
      publishedFacilityId: null,
      publishedOrganizationId: organization.id,
    },
  });
  return { candidate: updatedCandidate, target: organization };
};

type AffiliateDirectPublicationParams = {
  publishedByUserId?: string | null;
  deferOrganizationLogo?: boolean;
  client?: any;
  candidate?: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
};

type AffiliatePreparedEventPublicationLocations = Awaited<
  ReturnType<typeof prepareAffiliateEventPublicationLocations>
>;

const loadAffiliateDirectPublicationContext = async (
  candidateId: string,
  params: AffiliateDirectPublicationParams,
) => {
  const baseClient = params.client ?? prisma;
  const repositories = affiliatePrisma(baseClient);
  const candidate =
    params.candidate ??
    (await repositories.candidates.findUnique({ where: { id: candidateId } }));
  if (!candidate) {
    throw new Error("Affiliate import candidate not found.");
  }
  return { baseClient, repositories, candidate };
};

const loadAffiliatePublicationSource = async (params: {
  candidate: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
  sources: any;
}): Promise<AffiliateScrapeSourceRow> => {
  const source =
    params.source ??
    (await params.sources.findUnique({ where: { id: params.candidate.sourceId } }));
  if (!source) {
    throw new Error("Affiliate scrape source not found.");
  }
  return source;
};

const repairAffiliatePublicationCandidateDateTime = async (params: {
  candidateId: string;
  currentCandidate: AffiliateCandidateRecord & { sourceId: string };
  nextCandidate: AffiliateCandidateDateTimeInput;
  transactionDb: any;
  client: any;
}): Promise<Record<string, unknown>> => {
  const mapping = await mappingForAffiliateCandidateDedupe(
    params.currentCandidate,
    params.client,
  );
  const dedupeKey = buildAffiliateCandidateDedupeKey(
    params.currentCandidate.sourceId,
    params.nextCandidate,
    mapping,
  );
  const conflictingCandidate = await params.transactionDb.candidates.findUnique({
    where: {
      sourceId_dedupeKey: {
        sourceId: params.currentCandidate.sourceId,
        dedupeKey,
      },
    },
    select: { id: true },
  });
  if (
    conflictingCandidate &&
    conflictingCandidate.id !== params.candidateId
  ) {
    throw new Error(
      "Affiliate candidate datetime repair would collide with another candidate dedupe key. " +
        "Review the duplicate candidate before publication.",
    );
  }
  return affiliateCandidateDateTimeRepairData(
    params.nextCandidate,
    dedupeKey,
  );
};

const publishPreparedAffiliateEvent = async (params: {
  candidateId: string;
  client: any;
  transactionDb: any;
  publicationLocations: AffiliatePreparedEventPublicationLocations;
}) => {
  const currentCandidate = await params.transactionDb.candidates.findUnique({
    where: { id: params.candidateId },
  });
  if (!currentCandidate) {
    throw new Error("Affiliate import candidate not found.");
  }
  const source = await params.transactionDb.sources.findUnique({
    where: { id: currentCandidate.sourceId },
  });
  if (!source) {
    throw new Error("Affiliate scrape source not found.");
  }
  if (
    affiliateEventPublicationCandidateFingerprint(currentCandidate) !==
      params.publicationLocations.candidateFingerprint ||
    affiliateEventPublicationSourceFingerprint(source) !==
      params.publicationLocations.sourceFingerprint
  ) {
    throw new Error(
      "Affiliate event candidate or source changed after location preparation. " +
        "Refresh the candidate and retry publication.",
    );
  }
  const sourceOrganization = await loadSourceOrganization(source, params.client);
  if (
    affiliateEventPublicationOrganizationFingerprint(sourceOrganization) !==
    params.publicationLocations.sourceOrganizationFingerprint
  ) {
    throw new Error(
      "Affiliate source organization changed after location preparation. " +
        "Refresh the candidate and retry publication.",
    );
  }
  let repairedDateTimeData: Record<string, unknown> = {};
  const event = await upsertAffiliateEventForCandidate(
    currentCandidate,
    source,
    {
      state: "PUBLISHED",
      client: params.client,
      fallbackCoordinates: params.publicationLocations.eventCoordinates,
      allowRemoteGeocoding: false,
      preferFallbackCoordinates: true,
      onCandidateNormalized: async (nextCandidate) => {
        repairedDateTimeData =
          await repairAffiliatePublicationCandidateDateTime({
            candidateId: params.candidateId,
            currentCandidate,
            nextCandidate,
            transactionDb: params.transactionDb,
            client: params.client,
          });
      },
    },
  );
  await markSourceOrganizationListedForPublishedContent(
    source,
    params.client,
    params.publicationLocations.sourceOrganizationCoordinates,
    params.publicationLocations.sourceOrganizationFingerprint,
  );
  const candidateUpdatedAt = candidateUpdatedAtDate(currentCandidate);
  await params.transactionDb.candidates.update({
    where: candidateUpdatedAt
      ? { id: params.candidateId, updatedAt: candidateUpdatedAt }
      : { id: params.candidateId },
    data: {
      ...repairedDateTimeData,
      status: "PUBLISHED",
      publishedEventId: event.id,
    },
  });
  return event;
};

const publishAffiliateEventCandidateDirect = async (params: {
  candidateId: string;
  candidate: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
  baseClient: any;
  sources: any;
}) => {
  const source = await loadAffiliatePublicationSource({
    candidate: params.candidate,
    source: params.source,
    sources: params.sources,
  });
  const publicationLocations = await prepareAffiliateEventPublicationLocations(
    params.candidate,
    source,
    params.baseClient,
  );
  return withAffiliateScrapeTransaction(
    params.baseClient,
    async (client: any) => {
      const transactionDb = affiliatePrisma(client);
      return publishPreparedAffiliateEvent({
        candidateId: params.candidateId,
        client,
        transactionDb,
        publicationLocations,
      });
    },
  );
};

const publishAffiliateTeamCandidateDirect = async (params: {
  candidateId: string;
  candidate: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
  baseClient: any;
  repositories: any;
}) => {
  const source = await loadAffiliatePublicationSource({
    candidate: params.candidate,
    source: params.source,
    sources: params.repositories.sources,
  });
  const team = await upsertAffiliateTeamForCandidate(params.candidate, source, {
    visibility: "PUBLIC",
    client: params.baseClient,
  });
  await params.repositories.candidates.update({
    where: { id: params.candidateId },
    data: {
      status: "PUBLISHED",
      publishedTeamId: team.id,
    },
  });
  return team;
};

const publishAffiliateFacilityCandidateDirect = async (params: {
  candidateId: string;
  candidate: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
  baseClient: any;
  repositories: any;
}) => {
  const source = await loadAffiliatePublicationSource({
    candidate: params.candidate,
    source: params.source,
    sources: params.repositories.sources,
  });
  const facility = await upsertAffiliateFacilityForCandidate(
    params.candidate,
    source,
    { status: "ACTIVE", client: params.baseClient },
  );
  await markSourceOrganizationListedForPublishedContent(
    source,
    params.baseClient,
  );
  await params.repositories.candidates.update({
    where: { id: params.candidateId },
    data: {
      status: "PUBLISHED",
      publishedFacilityId: facility.id,
    },
  });
  return facility;
};

const publishAffiliateClubCandidateDirect = async (params: {
  candidateId: string;
  candidate: AffiliateCandidateRecord;
  source?: AffiliateScrapeSourceRow;
  baseClient: any;
  repositories: any;
  deferOrganizationLogo?: boolean;
}) => {
  const source = await loadAffiliatePublicationSource({
    candidate: params.candidate,
    source: params.source,
    sources: params.repositories.sources,
  });
  const organization = await upsertAffiliateOrganizationForCandidate(
    params.candidate,
    source,
    {
      status: "LISTED",
      publicPageEnabled: true,
      deferLogoUpload: params.deferOrganizationLogo === true,
      client: params.baseClient,
    },
  );
  await params.repositories.candidates.update({
    where: { id: params.candidateId },
    data: {
      status: "PUBLISHED",
      publishedOrganizationId: organization.id,
    },
  });
  await keepSourceOrganizationPrivateForPublishedClub(
    source,
    organization.id,
    params.baseClient,
  );
  return organization;
};

const publishAffiliateCandidateDirect = async (
  candidateId: string,
  params: AffiliateDirectPublicationParams = {},
) => {
  const context = await loadAffiliateDirectPublicationContext(
    candidateId,
    params,
  );
  const listingKind = normalizeSourceType(context.candidate.listingKind);
  if (listingKind === "EVENT") {
    return publishAffiliateEventCandidateDirect({
      candidateId,
      candidate: context.candidate,
      source: params.source,
      baseClient: context.baseClient,
      sources: context.repositories.sources,
    });
  }
  if (listingKind === "TEAM") {
    return publishAffiliateTeamCandidateDirect({
      candidateId,
      candidate: context.candidate,
      source: params.source,
      baseClient: context.baseClient,
      repositories: context.repositories,
    });
  }
  if (listingKind === "RENTAL") {
    return publishAffiliateFacilityCandidateDirect({
      candidateId,
      candidate: context.candidate,
      source: params.source,
      baseClient: context.baseClient,
      repositories: context.repositories,
    });
  }
  if (listingKind === "CLUB") {
    return publishAffiliateClubCandidateDirect({
      candidateId,
      candidate: context.candidate,
      source: params.source,
      baseClient: context.baseClient,
      repositories: context.repositories,
      deferOrganizationLogo: params.deferOrganizationLogo,
    });
  }
  throw new Error(
    "Affiliate listing kind must be EVENT, TEAM, RENTAL, or CLUB.",
  );
};
type AffiliatePublicationContext = {
  candidate: AffiliateCandidateRecord;
  source: AffiliateScrapeSourceRow | null;
  candidates: any;
  supplySourceId: string | null;
};

const loadAffiliatePublicationContext = async (
  candidateId: string,
): Promise<AffiliatePublicationContext> => {
  const { candidates, sources } = affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error("Affiliate import candidate not found.");
  }
  const source = await sources.findUnique({ where: { id: candidate.sourceId } });
  return {
    candidate,
    source,
    candidates,
    supplySourceId: source?.supplySourceId ?? candidate.supplySourceId,
  };
};

const affiliatePublicationActorId = (
  publishedByUserId?: string | null,
): string => {
  const actorId = publishedByUserId?.trim();
  if (!actorId) {
    throw new Error("Supply-backed affiliate publication requires a human actor.");
  }
  return actorId;
};

const affiliatePublicationEvidenceRefs = (
  candidateId: string,
  candidate: AffiliateCandidateRecord,
): string[] => {
  const rawCandidatePayload = recordValue(candidate.rawPayload);
  const rawEvidenceRefs = Array.isArray(rawCandidatePayload.evidenceRefs)
    ? rawCandidatePayload.evidenceRefs
    : [];
  const candidateEvidenceRefs = rawEvidenceRefs.filter(
    (value: unknown): value is string => typeof value === "string",
  );
  return Array.from(
    new Set([
      ...candidateEvidenceRefs,
      `affiliate-candidate:${candidateId}`,
    ]),
  );
};

type AffiliatePublicationTargetState = {
  publishedTarget: Readonly<{ id: string }> | null;
  deferredOrganizationId: string | null;
};

const writeAffiliatePublicationTarget = async (params: {
  client: any;
  candidateId: string;
  candidate: AffiliateCandidateRecord;
  directParams: AffiliateDirectPublicationParams;
  evidenceRefs: string[];
  state: AffiliatePublicationTargetState;
}) => {
  const targetRoute = affiliateTargetRouteForCandidate(params.candidate);
  if (!targetRoute) {
    throw new Error("Affiliate listing kind is required for lifecycle publication.");
  }
  params.state.publishedTarget = await publishAffiliateCandidateDirect(
    params.candidateId,
    {
      ...params.directParams,
      deferOrganizationLogo: targetRoute.targetType === "ORGANIZATION",
      client: params.client,
    },
  );
  if (!params.state.publishedTarget) {
    throw new Error("Affiliate publication did not return a public target.");
  }
  if (targetRoute.targetType === "ORGANIZATION") {
    params.state.deferredOrganizationId = params.state.publishedTarget.id;
  }
  return {
    targetType: targetRoute.targetType,
    targetId: params.state.publishedTarget.id,
    sourceProfile: targetRoute.listingKind,
    candidateId: params.candidateId,
    evidenceRefs: params.evidenceRefs,
  };
};

const publishAffiliateCandidateThroughLifecycle = async (params: {
  candidateId: string;
  candidate: AffiliateCandidateRecord;
  repositories: { candidates: any };
  supplySourceId: string;
  directParams: AffiliateDirectPublicationParams;
  actorId: string;
}) => {
  const database = affiliateSupplyDatabase();
  const root = await database.supplySources.findUnique({
    where: { id: params.supplySourceId },
  });
  if (!root) {
    throw new Error("Affiliate Supply Source not found.");
  }
  const evidenceRefs = affiliatePublicationEvidenceRefs(
    params.candidateId,
    params.candidate,
  );
  const state: AffiliatePublicationTargetState = {
    publishedTarget: null,
    deferredOrganizationId: null,
  };
  const lifecycleResult = await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: params.supplySourceId,
    command: "PUBLISH_TARGET",
    authority: "HUMAN_DIRECTED_EXECUTOR",
    expectedLifecycleGeneration: root.lifecycleGeneration,
    idempotencyKey: `affiliate-candidate-publication:${params.candidateId}`,
    request: {
      candidateId: params.candidateId,
      evidenceRefs,
    },
    actorKind: "HUMAN",
    actorId: params.actorId,
    rolloutCohort: root.rolloutCohort,
    db: database,
    targetWriter: async ({ client }) =>
      writeAffiliatePublicationTarget({
        client,
        candidateId: params.candidateId,
        candidate: params.candidate,
        directParams: params.directParams,
        evidenceRefs,
        state,
      }),
  });
  const committedCandidate = await params.repositories.candidates.findUnique({
    where: { id: params.candidateId },
  });
  const organizationId =
    state.deferredOrganizationId ??
    nullableString(committedCandidate?.publishedOrganizationId);
  if (
    organizationId &&
    normalizeSourceType(committedCandidate?.listingKind) === "CLUB"
  ) {
    await upsertAffiliateOrganizationLogoForCandidate(
      committedCandidate,
      organizationId,
      params.actorId,
      prisma,
      { assignOrganizationLogo: true },
    );
  }
  if (state.publishedTarget) return state.publishedTarget;
  const replayedTargetId =
    lifecycleResult.assessment.qualifyingTargetIds[0] ?? null;
  return replayedTargetId
    ? { id: replayedTargetId }
    : lifecycleResult.assessment;
};

export const publishAffiliateCandidate = async (
  candidateId: string,
  params: { publishedByUserId?: string | null } = {},
) => {
  const context = await loadAffiliatePublicationContext(candidateId);
  if (!context.supplySourceId) {
    return publishAffiliateCandidateDirect(candidateId, {
      ...params,
      candidate: context.candidate,
      source: context.source ?? undefined,
    });
  }
  const actorId = affiliatePublicationActorId(params.publishedByUserId);
  return publishAffiliateCandidateThroughLifecycle({
    candidateId,
    candidate: context.candidate,
    repositories: { candidates: context.candidates },
    supplySourceId: context.supplySourceId,
    directParams: params,
    actorId,
  });
};
