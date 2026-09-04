import { createHash } from "node:crypto";
import { z } from "zod";

type CanonicalAffiliateAgentPrimitive = null | string | boolean | number;

const isCanonicalAffiliateAgentPrimitive = (
  value: unknown,
): value is CanonicalAffiliateAgentPrimitive =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));


const canonicalAffiliateAgentValue = (
  value: unknown,
  ancestors: Set<object> = new Set(),
): unknown => {
  if (isCanonicalAffiliateAgentPrimitive(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    throw new TypeError(
      "Affiliate Agent values must use canonical JSON data types.",
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError(
      "Affiliate Agent values must not contain canonical JSON cycles.",
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalAffiliateAgentValue(item, ancestors));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError("Affiliate Agent values must use plain objects.");
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [
          key,
          canonicalAffiliateAgentValue(nested, ancestors),
        ]),
    );
  } finally {
    ancestors.delete(value);
  }
};

export const canonicalizeAffiliateAgentValue = (value: unknown): string =>
  JSON.stringify(canonicalAffiliateAgentValue(value));

export const hashAffiliateAgentValue = (value: unknown): string =>
  createHash("sha256")
    .update(canonicalizeAffiliateAgentValue(value))
    .digest("hex");

export type AffiliateAgentCaptureRecordSummary = Readonly<{
  keys: readonly string[];
  sha256: string;
  byteSize: number;
}>;

export type AffiliateAgentCaptureTextSummary = Readonly<{
  sha256: string;
  byteSize: number;
}>;

export type AffiliateAgentCaptureSetSummary = Readonly<{
  count: number;
  sha256: string;
  refs: readonly string[];
}>;
export type AffiliateAgentCaptureScreenshotEvidence = Readonly<{
  sourceUrl: string;
  finalUrl: string;
  statusCode: number;
  mimeType: string;
  byteSize: number;
  sha256: string;
}>;

export type AffiliateAgentCaptureMetadata = Readonly<{
  provider: "SCRAPINGDOG" | "FIRECRAWL";
  request: AffiliateAgentCaptureRecordSummary;
  response: AffiliateAgentCaptureRecordSummary;
  requestedUrl: string;
  /** URL reached by provider transport, never an HTML-declared canonical. */
  finalUrl: string;
  /** True only when transport explicitly observed a network redirect. */
  isRedirectVerified: boolean;
  /** HTML-declared canonical retained as untrusted evidence. */
  inferredCanonicalUrl?: string | null;
  providerStatusCode: number;
  targetStatusCode: number | null;
  renderMode: "STATIC" | "JAVASCRIPT";
  elapsedMs: number;
  estimatedCredits: number | null;
  warnings: readonly string[];
  providerJobId?: string | null;
  attempts?: readonly Readonly<{
    renderMode: "STATIC" | "JAVASCRIPT";
    providerStatusCode: number;
    elapsedMs: number;
    estimatedCredits: number | null;
    accepted: boolean;
    quality?: Readonly<Record<string, unknown>>;
    error?: string;
  }>[];
  providerArtifacts?: Readonly<{
    markdown: AffiliateAgentCaptureTextSummary | null;
    links: AffiliateAgentCaptureSetSummary;
    images: AffiliateAgentCaptureSetSummary;
    branding: Readonly<Record<string, unknown>> | null;
    screenshotUrl: string | null;
    screenshotEvidence?: AffiliateAgentCaptureScreenshotEvidence | null;
    metadata: Readonly<Record<string, unknown>>;
  }>;
}>;

export const AFFILIATE_AGENT_MAX_CAPTURE_METADATA_CANONICAL_BYTES = 12_000 as const;

const CAPTURE_METADATA_MAX_DEPTH = 8;
const CAPTURE_METADATA_MAX_OBJECT_ENTRIES = 64;
const CAPTURE_METADATA_MAX_ARRAY_ITEMS = 64;
const CAPTURE_METADATA_MAX_RECORD_KEYS = 32;
const CAPTURE_METADATA_MAX_REF_ITEMS = 8;
const CAPTURE_METADATA_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const CAPTURE_METADATA_MAX_STRING_BYTES = 4_096;
const CAPTURE_METADATA_MAX_KEY_BYTES = 256;

const captureMetadataRecordSchema = z.record(
  z.string().max(CAPTURE_METADATA_MAX_KEY_BYTES),
  z.unknown(),
);
const captureMetadataSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/);
const captureMetadataSummaryByteSizeSchema = z
  .number()
  .int()
  .min(0)
  .max(CAPTURE_METADATA_MAX_SOURCE_BYTES);
const captureMetadataStatusSchema = z.number().int().min(0).max(999);
const captureMetadataElapsedSchema = z.number().int().min(0).max(3_600_000);
const captureMetadataCreditsSchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .nullable();
const captureMetadataStringSchema = z.string().trim().min(1).max(2_048);
const captureMetadataNullableStringSchema = z
  .string()
  .trim()
  .max(2_048)
  .nullable();
const captureMetadataScreenshotMimeTypeSchema = z
  .string()
  .trim()
  .regex(/^image\/[a-z0-9][a-z0-9.+-]*$/i)
  .max(255);
const captureMetadataScreenshotStatusSchema = z
  .number()
  .int()
  .min(200)
  .max(299);
const captureMetadataScreenshotByteSizeSchema = z
  .number()
  .int()
  .min(0)
const captureMetadataScreenshotEvidenceSchema = z
  .object({
    sourceUrl: z.string().trim().url().max(2_048),
    finalUrl: z.string().trim().url().max(2_048),
    statusCode: captureMetadataScreenshotStatusSchema,
    mimeType: captureMetadataScreenshotMimeTypeSchema,
    byteSize: captureMetadataScreenshotByteSizeSchema,
    sha256: captureMetadataSha256Schema,
  })
  .strict();
const captureMetadataTextSummarySchema = z
  .object({
    sha256: captureMetadataSha256Schema,
    byteSize: captureMetadataSummaryByteSizeSchema,
  })
  .strict();
const captureMetadataSetSummarySchema = z
  .object({
    count: z.number().int().min(0).max(10_000),
    sha256: captureMetadataSha256Schema,
    refs: z.array(captureMetadataStringSchema).max(CAPTURE_METADATA_MAX_REF_ITEMS),
  })
  .strict();
const captureMetadataRecordSummarySchema = z
  .object({
    keys: z.array(captureMetadataStringSchema).max(CAPTURE_METADATA_MAX_RECORD_KEYS),
    sha256: captureMetadataSha256Schema,
    byteSize: captureMetadataSummaryByteSizeSchema,
  })
  .strict();
const affiliateAgentCaptureMetadataSchema = z
  .object({
    provider: z.enum(["SCRAPINGDOG", "FIRECRAWL"]),
    request: captureMetadataRecordSummarySchema,
    response: captureMetadataRecordSummarySchema,
    requestedUrl: z.string().trim().url().max(2_048),
    finalUrl: z.string().trim().url().max(2_048),
    isRedirectVerified: z.boolean().default(false),
    inferredCanonicalUrl: captureMetadataNullableStringSchema.optional(),
    providerStatusCode: captureMetadataStatusSchema,
    targetStatusCode: captureMetadataStatusSchema.nullable(),
    renderMode: z.enum(["STATIC", "JAVASCRIPT"]),
    elapsedMs: captureMetadataElapsedSchema,
    estimatedCredits: captureMetadataCreditsSchema,
    warnings: z.array(captureMetadataStringSchema).max(CAPTURE_METADATA_MAX_ARRAY_ITEMS),
    providerJobId: captureMetadataStringSchema.nullable().optional(),
    attempts: z
      .array(
        z
          .object({
            renderMode: z.enum(["STATIC", "JAVASCRIPT"]),
            providerStatusCode: captureMetadataStatusSchema,
            elapsedMs: captureMetadataElapsedSchema,
            estimatedCredits: captureMetadataCreditsSchema,
            accepted: z.boolean(),
            quality: captureMetadataRecordSchema.optional(),
            error: captureMetadataStringSchema.optional(),
          })
          .strict(),
      )
      .max(CAPTURE_METADATA_MAX_ARRAY_ITEMS)
      .optional(),
    providerArtifacts: z
      .object({
        markdown: captureMetadataTextSummarySchema.nullable(),
        links: captureMetadataSetSummarySchema,
        images: captureMetadataSetSummarySchema,
        branding: captureMetadataRecordSchema.nullable(),
        screenshotUrl: captureMetadataNullableStringSchema,
        screenshotEvidence: captureMetadataScreenshotEvidenceSchema.nullable().optional(),
        metadata: captureMetadataRecordSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const boundedCaptureMetadataArray = (
  value: readonly unknown[],
  depth: number,
  ancestors: Set<object>,
): unknown[] => {
  if (value.length > CAPTURE_METADATA_MAX_ARRAY_ITEMS) {
    throw new TypeError("Capture metadata contains too many array items.");
  }
  return value.map((item) => boundedCaptureMetadataValue(
    item,
    depth + 1,
    ancestors,
  ));
};

const boundedCaptureMetadataObject = (
  value: Record<string, unknown>,
  depth: number,
  ancestors: Set<object>,
): Record<string, unknown> => {
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Capture metadata contains a non-plain object.");
  }
  const entries = Object.entries(value);
  if (entries.length > CAPTURE_METADATA_MAX_OBJECT_ENTRIES) {
    throw new TypeError("Capture metadata contains too many object fields.");
  }
  for (const [key] of entries) {
    if (Buffer.byteLength(key, "utf8") > CAPTURE_METADATA_MAX_KEY_BYTES) {
      throw new TypeError("Capture metadata contains an oversized key.");
    }
  }
  return Object.fromEntries(
    entries.map(([key, nested]) => [
      key,
      boundedCaptureMetadataValue(nested, depth + 1, ancestors),
    ]),
  );
};

type BoundedCaptureMetadataScalar =
  | Readonly<{ kind: "VALUE"; value: null | string | boolean | number }>
  | Readonly<{ kind: "NOT_SCALAR" }>;

const boundedCaptureMetadataScalar = (
  value: unknown,
): BoundedCaptureMetadataScalar => {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    if (
      typeof value === "string"
      && Buffer.byteLength(value, "utf8") > CAPTURE_METADATA_MAX_STRING_BYTES
    ) {
      throw new TypeError("Capture metadata contains an oversized string.");
    }
    return { kind: "VALUE", value };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Capture metadata contains a non-finite number.");
    }
    return { kind: "VALUE", value };
  }
  return { kind: "NOT_SCALAR" };
};

const boundedCaptureMetadataValue = (
  value: unknown,
  depth = 0,
  ancestors: Set<object> = new Set(),
): unknown => {
  const scalar = boundedCaptureMetadataScalar(value);
  if (scalar.kind === "VALUE") return scalar.value;
  if (!value || typeof value !== "object") {
    throw new TypeError("Capture metadata contains an unsupported value.");
  }
  if (depth >= CAPTURE_METADATA_MAX_DEPTH || ancestors.has(value)) {
    throw new TypeError("Capture metadata is too deeply nested or cyclic.");
  }
  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? boundedCaptureMetadataArray(value, depth, ancestors)
      : boundedCaptureMetadataObject(value as Record<string, unknown>, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
};

export const parseAffiliateAgentCaptureMetadata = (
  value: unknown,
): AffiliateAgentCaptureMetadata => {
  const parsed = affiliateAgentCaptureMetadataSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError("Affiliate capture metadata has invalid settings.");
  }
  try {
    const normalized = {
      ...parsed.data,
      requestedUrl: new URL(parsed.data.requestedUrl).toString(),
      finalUrl: new URL(parsed.data.finalUrl).toString(),
    };
    const bounded = boundedCaptureMetadataValue(normalized);
    const canonical = canonicalizeAffiliateAgentValue(bounded);
    if (
      Buffer.byteLength(canonical, "utf8")
      > AFFILIATE_AGENT_MAX_CAPTURE_METADATA_CANONICAL_BYTES
    ) {
      throw new TypeError("Affiliate capture metadata is too large.");
    }
    return JSON.parse(canonical) as AffiliateAgentCaptureMetadata;
  } catch {
    throw new TypeError("Affiliate capture metadata is invalid or unbounded.");
  }
};

const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hash.");
const identifierSchema = z.string().trim().min(1).max(200);
const positiveIntegerSchema = z.number().int().positive();
const sourceProfileSchema = z.enum(["CLUB", "EVENT", "RENTAL"]);

export const AFFILIATE_AGENT_MAX_SET_ITEMS = 64 as const;
export const AFFILIATE_AGENT_MAX_SET_CANONICAL_BYTES = 16_384 as const;
export const AFFILIATE_AGENT_MAX_MANIFEST_ENTRIES = 64 as const;
export const AFFILIATE_AGENT_MAX_MANIFEST_CANONICAL_BYTES = 65_536 as const;
export const AFFILIATE_AGENT_MAX_CLAIM_ENVELOPE_CANONICAL_BYTES =
  65_536 as const;
export const AFFILIATE_AGENT_MAX_ENVIRONMENT_VALUE_BYTES = 65_536 as const;

const MAX_DECLARATIVE_PACKAGE_FIELDS = 64 as const;
const MAX_DECLARATIVE_PACKAGE_CANONICAL_BYTES = 65_536 as const;
export const AFFILIATE_AGENT_MAX_TERMINAL_RESULT_CANONICAL_BYTES =
  65_536 as const;
const MAX_TERMINAL_RESULT_CANONICAL_BYTES =
  AFFILIATE_AGENT_MAX_TERMINAL_RESULT_CANONICAL_BYTES;
const MAX_MANIFEST_ARTIFACT_BYTES = 8_388_608 as const;
const MAX_SCHEMA_ISSUE_PATH_ITEMS = 32 as const;

const addCanonicalByteLimitIssue = (
  value: unknown,
  maxBytes: number,
  context: z.RefinementCtx,
  path: (string | number)[],
  label: string,
): boolean => {
  const exceedsLimit =
    Buffer.byteLength(canonicalizeAffiliateAgentValue(value), "utf8") >
    maxBytes;
  if (exceedsLimit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} must not exceed ${maxBytes} canonical UTF-8 bytes.`,
      path,
    });
  }
  return !exceedsLimit;
};

const sortedUniqueStringsSchema = <T extends z.ZodType<string>>(
  itemSchema: T,
  minimumItems = 0,
) =>
  z
    .array(itemSchema)
    .min(minimumItems)
    .max(AFFILIATE_AGENT_MAX_SET_ITEMS)
    .superRefine((values, context) => {
      for (let index = 1; index < values.length; index += 1) {
        if (values[index - 1] >= values[index]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Set-like arrays must be sorted and unique.",
            path: [index],
          });
        }
      }
      addCanonicalByteLimitIssue(
        values,
        AFFILIATE_AGENT_MAX_SET_CANONICAL_BYTES,
        context,
        [],
        "Set-like arrays",
      );
    });

const assertSortedUniqueObjects = <T>(
  values: T[],
  context: z.RefinementCtx,
  key: (value: T) => string,
): void => {
  for (let index = 1; index < values.length; index += 1) {
    if (key(values[index - 1]) >= key(values[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set-like arrays must be sorted and unique.",
        path: [index],
      });
    }
  }
};

const assertSelfHash = (
  value: Readonly<{ hash: string }> & Record<string, unknown>,
  context: z.RefinementCtx,
): void => {
  const { hash, ...preimage } = value;
  if (hash !== hashAffiliateAgentValue(preimage)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hash must match the parsed canonical self-hash-free preimage.",
      path: ["hash"],
    });
  }
};

export const AFFILIATE_AGENT_SUPPLY_CONTRACT_COMPONENT_NAMES = [
  "COVERAGE_APPLICABILITY",
  "SEARCH_STRATEGIES",
  "SUPPLY_TARGETS_AND_MARKET_TIERS",
  "FRESHNESS",
  "MAPPING_EVIDENCE",
  "LIFECYCLE_EVIDENCE",
] as const;

export type AffiliateAgentSupplyContractComponentName =
  (typeof AFFILIATE_AGENT_SUPPLY_CONTRACT_COMPONENT_NAMES)[number];

const supplyContractComponentBase = {
  schemaVersion: z.literal(1),
  version: positiveIntegerSchema,
  hash: sha256Schema,
};

const coverageApplicabilityComponentSchema = z
  .object({
    ...supplyContractComponentBase,
    name: z.literal("COVERAGE_APPLICABILITY"),
    payload: z
      .object({
        applicability: z
          .array(
            z
              .object({
                sourceProfile: sourceProfileSchema,
                sportIds: sortedUniqueStringsSchema(identifierSchema).min(1),
              })
              .strict(),
          )
          .superRefine((values, context) => {
            assertSortedUniqueObjects(
              values,
              context,
              (value) =>
                `${value.sourceProfile}\u0000${value.sportIds.join("\u0000")}`,
            );
          }),
      })
      .strict(),
  })
  .strict();

const searchStrategiesComponentSchema = z
  .object({
    ...supplyContractComponentBase,
    name: z.literal("SEARCH_STRATEGIES"),
    payload: z
      .object({
        families: z
          .array(
            z
              .object({
                family: z.enum([
                  "DIRECTORY_SEARCH",
                  "GOVERNING_BODY_SEARCH",
                  "OFFICIAL_SITE_SEARCH",
                  "SEARCH_ENGINE_QUERY",
                ]),
                minimumDistinctCycles: positiveIntegerSchema,
              })
              .strict(),
          )
          .superRefine((values, context) => {
            assertSortedUniqueObjects(values, context, (value) => value.family);
          }),
      })
      .strict(),
  })
  .strict();

const supplyTargetsComponentSchema = z
  .object({
    ...supplyContractComponentBase,
    name: z.literal("SUPPLY_TARGETS_AND_MARKET_TIERS"),
    payload: z
      .object({
        tiers: z
          .array(
            z
              .object({
                tier: z.enum(["LARGE", "MEDIUM", "SMALL"]),
                targets: z
                  .array(
                    z
                      .object({
                        sourceProfile: sourceProfileSchema,
                        minimumFreshPublishedSupply: positiveIntegerSchema,
                      })
                      .strict(),
                  )
                  .superRefine((values, context) => {
                    assertSortedUniqueObjects(
                      values,
                      context,
                      (value) => value.sourceProfile,
                    );
                  }),
              })
              .strict(),
          )
          .superRefine((values, context) => {
            assertSortedUniqueObjects(values, context, (value) => value.tier);
          }),
      })
      .strict(),
  })
  .strict();

const freshnessComponentSchema = z
  .object({
    ...supplyContractComponentBase,
    name: z.literal("FRESHNESS"),
    payload: z
      .object({
        windows: z
          .array(
            z
              .object({
                sourceProfile: sourceProfileSchema,
                maximumAgeHours: positiveIntegerSchema,
              })
              .strict(),
          )
          .superRefine((values, context) => {
            assertSortedUniqueObjects(
              values,
              context,
              (value) => value.sourceProfile,
            );
          }),
      })
      .strict(),
  })
  .strict();

const mappingEvidenceComponentSchema = z
  .object({
    ...supplyContractComponentBase,
    name: z.literal("MAPPING_EVIDENCE"),
    payload: z
      .object({
        requiredEvidenceKinds: sortedUniqueStringsSchema(
          z.enum([
            "EXPECTED_CANDIDATE",
            "PAGE_HTML",
            "PAGE_MARKDOWN",
            "SOURCE_POLICY",
          ]),
        ),
        hasDeterministicValidation: z.literal(true),
      })
      .strict(),
  })
  .strict();

const lifecycleEvidenceComponentSchema = z
  .object({
    ...supplyContractComponentBase,
    name: z.literal("LIFECYCLE_EVIDENCE"),
    payload: z
      .object({
        requiredEvidenceKinds: sortedUniqueStringsSchema(
          z.enum([
            "DURABLE_SOURCE_EVIDENCE",
            "HUMAN_DECISION",
            "VALIDATION_OUTPUT",
          ]),
        ),
        hasIndependentReview: z.literal(true),
      })
      .strict(),
  })
  .strict();

const affiliateAgentSupplyContractComponentSchema = z
  .discriminatedUnion("name", [
    coverageApplicabilityComponentSchema,
    searchStrategiesComponentSchema,
    supplyTargetsComponentSchema,
    freshnessComponentSchema,
    mappingEvidenceComponentSchema,
    lifecycleEvidenceComponentSchema,
  ])
  .superRefine(assertSelfHash);

export type AffiliateAgentSupplyContractComponent = z.infer<
  typeof affiliateAgentSupplyContractComponentSchema
>;

export const affiliateAgentSupplyContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: positiveIntegerSchema,
    components: z
      .tuple([
        coverageApplicabilityComponentSchema,
        searchStrategiesComponentSchema,
        supplyTargetsComponentSchema,
        freshnessComponentSchema,
        mappingEvidenceComponentSchema,
        lifecycleEvidenceComponentSchema,
      ])
      .superRefine((components, context) => {
        components.forEach((component, index) => {
          const { hash, ...preimage } = component;
          if (hash !== hashAffiliateAgentValue(preimage)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "Component hash must match its parsed canonical self-hash-free preimage.",
              path: [index, "hash"],
            });
          }
        });
      }),
    hash: sha256Schema,
  })
  .strict()
  .superRefine(assertSelfHash);

export type AffiliateAgentSupplyContract = z.infer<
  typeof affiliateAgentSupplyContractSchema
>;

export const AFFILIATE_AGENT_ROLES = [
  "COVERAGE_PLANNER",
  "MAPPING_PRODUCER",
  "SUPPLY_REVIEWER",
  "HUMAN_DIRECTED_EXECUTOR",
] as const;

export type AffiliateAgentRole = (typeof AFFILIATE_AGENT_ROLES)[number];
const AFFILIATE_AGENT_TERMINAL_RESULT_PAYLOAD_SHAPES: Readonly<
  Record<AffiliateAgentRole, readonly string[]>
> = {
  COVERAGE_PLANNER: [
    '- CAMPAIGN_PROPOSED: {"campaignProposalRefs":["<identifier>"]}',
    '- FAILED_CAPTURE_EVIDENCE_RECORDED: {"captureEvidenceRef":"<identifier>"}',
    '- SOURCE_EXCLUSION_PROPOSED: {"supplySourceId":"<identifier>","policyEvidenceRefs":["<identifier>"]}',
    '- CONTRACT_GAP: {"contractArea":"<COVERAGE_APPLICABILITY|FRESHNESS|LIFECYCLE_EVIDENCE|MAPPING_EVIDENCE|SEARCH_STRATEGIES|SUPPLY_TARGETS_AND_MARKET_TIERS>","requestedChange":"<non-empty string>"}',
    '- NO_ACTION: {"basis":"<NO_QUALIFIED_ACTION|SEARCH_SATURATED|TARGET_MET>"}; evidenceRefs must be non-empty',
  ],
  MAPPING_PRODUCER: [
    '- PACKAGE_COMMITTED: {"packageHash":"<sha256>","commitReceiptId":"<identifier>"}',
    '- BOUNDED_REPAIR_SUBMITTED: {"repairPass":<integer 1-3>,"packageHash":"<sha256>","commitReceiptId":"<identifier>"}',
    '- SOURCE_INCOMPATIBLE: {"incompatibilityCode":"<SOURCE_BLOCKED|SOURCE_POLICY_PROHIBITS_CAPTURE|UNSUPPORTED_LAYOUT>"}',
    '- CONTRACT_GAP: {"contractArea":"<COVERAGE_APPLICABILITY|FRESHNESS|LIFECYCLE_EVIDENCE|MAPPING_EVIDENCE|SEARCH_STRATEGIES|SUPPLY_TARGETS_AND_MARKET_TIERS>","requestedChange":"<non-empty string>"}',
  ],
  SUPPLY_REVIEWER: [
    '- APPROVED: {"committedPackageHash":"<sha256>"}',
    '- ACTIVATED: {"committedPackageHash":"<sha256>","baselineHash":"<sha256>","candidateReviewId":"<identifier>"}',
    '- PRODUCER_REPAIR_REQUIRED: {"committedPackageHash":"<sha256>","repairIssues":["<EVIDENCE_MISMATCH|MISSING_REQUIRED_FIELD|VALIDATION_FAILED>"]}',
    '- REGRESSION_ASSESSED: {"supplySourceId":"<identifier>","assessment":"<FAIL|PASS>"}',
    '- SOURCE_EXCLUSION_ASSESSED: {"supplySourceId":"<identifier>","recommendation":"<EXCLUDE|HUMAN_REVIEW|KEEP>"}',
    '- EXACT_TARGET_REJECTED: {"targetId":"<identifier>","targetType":"<EVENT|FACILITY|ORGANIZATION>"}',
    '- HUMAN_REVIEW_REQUIRED: {"caseReason":"<non-empty string>"}; evidenceRefs must be non-empty',
  ],
  HUMAN_DIRECTED_EXECUTOR: [
    '- LIFECYCLE_COMMAND_EXECUTED: {"caseId":"<identifier>","lifecycleCommandRef":"<identifier>","receiptId":"<identifier>"}',
    '- CONTRACT_GAP: {"contractArea":"<COVERAGE_APPLICABILITY|FRESHNESS|LIFECYCLE_EVIDENCE|MAPPING_EVIDENCE|SEARCH_STRATEGIES|SUPPLY_TARGETS_AND_MARKET_TIERS>","requestedChange":"<non-empty string>"}',
  ],
};

const terminalResultShapeForRole = (
  role: AffiliateAgentRole,
): readonly string[] => [
  `{"schemaVersion":1,"jobId":"<claim jobId>","claimId":"<claim id>","claimGeneration":<claim generation>,"lifecycleGeneration":<claim lifecycle generation or null>,"deploymentContractVersion":<claim deployment contract version>,"deploymentContractHash":"<deployment contract hash>","supplyContractVersion":<claim supply contract version>,"supplyContractHash":"<claim supply contract hash>","roleContractVersion":<role contract version>,"roleContractHash":"<role contract hash>","promptTemplateVersion":<prompt template version>,"promptTemplateHash":"<prompt template hash>","workerId":"<claim workerId>","invocationId":"<claim invocationId>","reasonCodes":["<allowed reason code>"],"evidenceRefs":["<sorted unique evidence ref>"],"summary":"<non-empty summary>","role":"${role}","disposition":"<one listed terminal disposition>","payload":<payload shape below>}`,
  "Allowed reasonCodes: CONTRACT_REQUIREMENT_MISSING | EVIDENCE_VERIFIED | NO_QUALIFIED_ACTION | POLICY_CONFLICT | SCHEMA_VALIDATED | SOURCE_UNSUPPORTED | TARGET_INVALID.",
  "Use an empty reasonCodes array when no reason code applies; evidenceRefs are sorted unique identifiers.",
  "All result and payload objects are strict: add no fields beyond this shape.",
  ...AFFILIATE_AGENT_TERMINAL_RESULT_PAYLOAD_SHAPES[role],
];



const ROLE_PROMPT_INSTRUCTIONS: Readonly<
  Record<AffiliateAgentRole, readonly string[]>
> = {
  COVERAGE_PLANNER: [
    "Read the claim envelope from the supplied environment.",
    "Read the authority projection from the supplied environment.",
    "Read only listed evidence refs through the gateway.",
    "Do not call discovery providers directly.",
    "Do not call capture providers directly.",
    "Use only the non-terminal commands listed in the authority projection.",
    "Return one evidence-backed terminal disposition.",
    "Use only the listed terminal dispositions.",
    "Use a contract gap or no-action disposition when the evidence does not support work.",
    "Do not invent facts.",
  ],
  MAPPING_PRODUCER: [
    "Read the claim envelope from the supplied environment.",
    "Read the authority projection from the supplied environment.",
    "Read only listed evidence refs through the gateway.",
    "Do not call providers directly.",
    "Do not mutate live mappings directly.",
    "Build only the closed declarative package shape defined by the mapping contract.",
    "Validate the package before you commit it.",
    "Commit only the validated package receipt.",
    "Return one evidence-backed terminal disposition.",
    "Use only the listed terminal dispositions.",
    "Never submit executable code.",
  ],
  SUPPLY_REVIEWER: [
    "Read the claim envelope from the supplied environment.",
    "Read the authority projection from the supplied environment.",
    "Read the committed package through the gateway.",
    "Read listed reviewer evidence through the gateway.",
    "Review the package.",
    "Do not edit the package.",
    "Do not reuse producer context.",
    "Return one evidence-backed terminal disposition.",
    "Use only the listed terminal dispositions.",
    "Use human review or producer repair when the evidence does not support approval or activation.",
    "Do not invent authority.",
  ],
  HUMAN_DIRECTED_EXECUTOR: [
    "Read the claim envelope from the supplied environment.",
    "Read the authority projection from the supplied environment.",
    "Read the listed human decision through the gateway.",
    "Read reviewer evidence through the gateway.",
    "Execute only the exact recorded lifecycle command.",
    "Use the claim and decision evidence to identify the command.",
    "Verify the case ID, decision hash, and lifecycle command reference before execution.",
    "Return one evidence-backed terminal disposition.",
    "Use only the listed terminal dispositions.",
    "Do not substitute a human decision.",
  ],
};

const AFFILIATE_AGENT_TERMINAL_REQUEST_SHAPE =
  '{"kind":"SUBMIT_RESULT","idempotencyKey":"<new idempotency key>","authorization":<claim authorization object>,"result":<valid role-specific affiliate-agent/terminal-result@1 object>}' as const;

const PROMPT_GATEWAY_PROTOCOL = {
  method: "POST" as const,
  gatewayAddressEnvironment: "AFFILIATE_AGENT_GATEWAY_ADDRESS" as const,
  gatewayPathPrefixEnvironment: "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX" as const,
  pathSuffix: "/perform" as const,
  authorizationEnvironment: "AFFILIATE_AGENT_CLAIM_TOKEN" as const,
  claimEnvelopeEnvironment: "AFFILIATE_AGENT_CLAIM_ENVELOPE" as const,
  requestFields: [
    "kind",
    "idempotencyKey",
    "authorization",
    "evidenceRef",
    "command",
    "result",
  ] as const,
  terminalResultSchema: "affiliate-agent/terminal-result@1" as const,
  terminalRequestShape: AFFILIATE_AGENT_TERMINAL_REQUEST_SHAPE,
} as const;



export const AFFILIATE_AGENT_EXECUTION_CLASSES = [
  "PRODUCTION_CODEX",
  "OFFLINE_OPEN_WEIGHT_EVALUATION",
] as const;

export type AffiliateAgentExecutionClass =
  (typeof AFFILIATE_AGENT_EXECUTION_CLASSES)[number];

const affiliateAgentCommandNameSchema = z.enum([
  "CAPTURE_CLAIM_URL",
  "COMMIT_DECLARATIVE_PACKAGE",
  "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
  "RUN_DISCOVERY_QUERY",
  "SUBMIT_TERMINAL_RESULT",
  "VALIDATE_DECLARATIVE_PACKAGE",
]);

const affiliateAgentTerminalDispositionSchema = z.enum([
  "ACTIVATED",
  "APPROVED",
  "BOUNDED_REPAIR_SUBMITTED",
  "CAMPAIGN_PROPOSED",
  "CONTRACT_GAP",
  "EXACT_TARGET_REJECTED",
  "FAILED_CAPTURE_EVIDENCE_RECORDED",
  "HUMAN_REVIEW_REQUIRED",
  "LIFECYCLE_COMMAND_EXECUTED",
  "NO_ACTION",
  "PACKAGE_COMMITTED",
  "PRODUCER_REPAIR_REQUIRED",
  "REGRESSION_ASSESSED",
  "SOURCE_EXCLUSION_ASSESSED",
  "SOURCE_EXCLUSION_PROPOSED",
  "SOURCE_INCOMPATIBLE",
]);

export type AffiliateAgentTerminalDisposition = z.infer<
  typeof affiliateAgentTerminalDispositionSchema
>;

const affiliateAgentForbiddenEffectSchema = z.enum([
  "ACCESS_ADMIN_CREDENTIALS",
  "ACCESS_PRODUCTION_DATABASE",
  "ACCESS_PRODUCTION_PROVIDER_CREDENTIALS",
  "ACCESS_PRODUCTION_STORAGE",
  "ACCESS_REPOSITORY",
  "EDIT_COMMITTED_PACKAGE",
  "EXECUTE_ARBITRARY_CODE",
  "EXECUTE_DISCOVERY_PROVIDER_DIRECTLY",
  "EXECUTE_UNRECORDED_LIFECYCLE_COMMAND",
  "MUTATE_LIVE_MAPPING",
  "REUSE_PRODUCER_CONTEXT",
  "SUBMIT_EXECUTABLE_CODE",
  "SUBSTITUTE_HUMAN_DECISION",
]);

const affiliateAgentRetentionSchema = z
  .object({
    authoritativeResults: z.literal("INDEFINITE"),
    lifecycleReceipts: z.literal("INDEFINITE"),
    humanDecisions: z.literal("INDEFINITE"),
    evidence: z.literal("INDEFINITE"),
    idempotencyReceipts: z.literal("INDEFINITE"),
    failedInvocationDiagnosticsDays: z.literal(14),
    boundedLogsDays: z.literal(14),
    workspace: z.literal("DESTROY_AFTER_TERMINAL_OR_FAILURE"),
  })
  .strict();

const affiliateAgentRoleContractObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    role: z.enum(AFFILIATE_AGENT_ROLES),
    version: positiveIntegerSchema,
    hash: sha256Schema,
    promptTemplateVersion: positiveIntegerSchema,
    promptTemplateHash: sha256Schema,
    inputSchemaId: z.enum([
      "affiliate-agent/coverage-planner-subject@1",
      "affiliate-agent/human-directed-executor-subject@1",
      "affiliate-agent/mapping-producer-subject@1",
      "affiliate-agent/supply-reviewer-subject@1",
    ]),
    permittedCommands: sortedUniqueStringsSchema(
      affiliateAgentCommandNameSchema,
    ),
    terminalDispositions: sortedUniqueStringsSchema(
      affiliateAgentTerminalDispositionSchema,
      1,
    ),
    forbiddenEffects: sortedUniqueStringsSchema(
      affiliateAgentForbiddenEffectSchema,
    ),
    retention: affiliateAgentRetentionSchema,
    executionClass: z.literal("PRODUCTION_CODEX"),
  })
  .strict();

export type AffiliateAgentRoleContract = z.infer<
  typeof affiliateAgentRoleContractObjectSchema
>;

const ROLE_PROMPT_TEMPLATE_HEADING_ORDER = [
  "AUTHORITY_PROJECTION",
  "ROLE_INSTRUCTIONS",
  "GATEWAY_PROTOCOL",
  "COMPLETION",
] as const;

export const affiliateAgentPromptTemplateSchema = z
  .object({
    schemaVersion: z.literal(1),
    role: z.enum(AFFILIATE_AGENT_ROLES),
    version: positiveIntegerSchema,
    headingOrder: z.tuple([
      z.literal("AUTHORITY_PROJECTION"),
      z.literal("ROLE_INSTRUCTIONS"),
      z.literal("GATEWAY_PROTOCOL"),
      z.literal("COMPLETION"),
    ]),
    lineEnding: z.literal("LF"),
    roleInstructions: z
      .array(z.string().trim().min(1).max(1_000))
      .min(1)
      .max(16),
    gatewayProtocol: z
      .object({
        method: z.literal("POST"),
        gatewayAddressEnvironment: z.literal("AFFILIATE_AGENT_GATEWAY_ADDRESS"),
        gatewayPathPrefixEnvironment: z.literal("AFFILIATE_AGENT_GATEWAY_PATH_PREFIX"),
        pathSuffix: z.literal("/perform"),
        authorizationEnvironment: z.literal("AFFILIATE_AGENT_CLAIM_TOKEN"),
        claimEnvelopeEnvironment: z.literal("AFFILIATE_AGENT_CLAIM_ENVELOPE"),
        requestFields: z
          .array(z.string().trim().min(1).max(100))
          .min(1)
          .max(16),
        terminalResultSchema: z.literal("affiliate-agent/terminal-result@1"),

        terminalResultShape: z
          .array(z.string().trim().min(1).max(4_000))
          .min(1)
          .max(32),
        terminalRequestShape: z.literal(
          AFFILIATE_AGENT_TERMINAL_REQUEST_SHAPE,
        ),
      })
      .strict(),

    terminalCommand: z.literal("SUBMIT_TERMINAL_RESULT"),
    hash: sha256Schema,
  })
  .strict()
  .superRefine(assertSelfHash);

export type AffiliateAgentPromptTemplate = z.infer<
  typeof affiliateAgentPromptTemplateSchema
>;

const createPromptTemplate = (
  role: AffiliateAgentRole,
): AffiliateAgentPromptTemplate => {
  const preimage = {
    schemaVersion: 1 as const,
    role,
    version: 1,
    headingOrder: ROLE_PROMPT_TEMPLATE_HEADING_ORDER,
    lineEnding: "LF" as const,
    roleInstructions: ROLE_PROMPT_INSTRUCTIONS[role],
    gatewayProtocol: {
      ...PROMPT_GATEWAY_PROTOCOL,
      terminalResultShape: terminalResultShapeForRole(role),
    },
    terminalCommand: "SUBMIT_TERMINAL_RESULT" as const,
  };
  return affiliateAgentPromptTemplateSchema.parse({
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  });
};

export const AFFILIATE_AGENT_PROMPT_TEMPLATES: Readonly<
  Record<AffiliateAgentRole, AffiliateAgentPromptTemplate>
> = {
  COVERAGE_PLANNER: createPromptTemplate("COVERAGE_PLANNER"),
  MAPPING_PRODUCER: createPromptTemplate("MAPPING_PRODUCER"),
  SUPPLY_REVIEWER: createPromptTemplate("SUPPLY_REVIEWER"),
  HUMAN_DIRECTED_EXECUTOR: createPromptTemplate("HUMAN_DIRECTED_EXECUTOR"),
};

const ROLE_RETENTION: AffiliateAgentRoleContract["retention"] = {
  authoritativeResults: "INDEFINITE",
  lifecycleReceipts: "INDEFINITE",
  humanDecisions: "INDEFINITE",
  evidence: "INDEFINITE",
  idempotencyReceipts: "INDEFINITE",
  failedInvocationDiagnosticsDays: 14,
  boundedLogsDays: 14,
  workspace: "DESTROY_AFTER_TERMINAL_OR_FAILURE",
};

const COMMON_FORBIDDEN_EFFECTS = [
  "ACCESS_ADMIN_CREDENTIALS",
  "ACCESS_PRODUCTION_DATABASE",
  "ACCESS_PRODUCTION_PROVIDER_CREDENTIALS",
  "ACCESS_PRODUCTION_STORAGE",
  "ACCESS_REPOSITORY",
  "EXECUTE_ARBITRARY_CODE",
] as const;

type AffiliateAgentRoleCapability = Pick<
  AffiliateAgentRoleContract,
  | "inputSchemaId"
  | "permittedCommands"
  | "terminalDispositions"
  | "forbiddenEffects"
  | "retention"
>;

const AFFILIATE_AGENT_ROLE_CAPABILITIES: Readonly<
  Record<AffiliateAgentRole, AffiliateAgentRoleCapability>
> = {
  COVERAGE_PLANNER: {
    inputSchemaId: "affiliate-agent/coverage-planner-subject@1",
    permittedCommands: [
      "CAPTURE_CLAIM_URL",
      "RUN_DISCOVERY_QUERY",
      "SUBMIT_TERMINAL_RESULT",
    ],
    terminalDispositions: [
      "CAMPAIGN_PROPOSED",
      "CONTRACT_GAP",
      "FAILED_CAPTURE_EVIDENCE_RECORDED",
      "NO_ACTION",
      "SOURCE_EXCLUSION_PROPOSED",
    ],
    forbiddenEffects: [
      ...COMMON_FORBIDDEN_EFFECTS,
      "EXECUTE_DISCOVERY_PROVIDER_DIRECTLY",
    ],
    retention: ROLE_RETENTION,
  },
  MAPPING_PRODUCER: {
    inputSchemaId: "affiliate-agent/mapping-producer-subject@1",
    permittedCommands: [
      "CAPTURE_CLAIM_URL",
      "COMMIT_DECLARATIVE_PACKAGE",
      "SUBMIT_TERMINAL_RESULT",
      "VALIDATE_DECLARATIVE_PACKAGE",
    ],
    terminalDispositions: [
      "BOUNDED_REPAIR_SUBMITTED",
      "CONTRACT_GAP",
      "PACKAGE_COMMITTED",
      "SOURCE_INCOMPATIBLE",
    ],
    forbiddenEffects: [
      ...COMMON_FORBIDDEN_EFFECTS,
      "MUTATE_LIVE_MAPPING",
      "SUBMIT_EXECUTABLE_CODE",
    ],
    retention: ROLE_RETENTION,
  },
  SUPPLY_REVIEWER: {
    inputSchemaId: "affiliate-agent/supply-reviewer-subject@1",
    permittedCommands: ["SUBMIT_TERMINAL_RESULT"],
    terminalDispositions: [
      "ACTIVATED",
      "APPROVED",
      "EXACT_TARGET_REJECTED",
      "HUMAN_REVIEW_REQUIRED",
      "PRODUCER_REPAIR_REQUIRED",
      "REGRESSION_ASSESSED",
      "SOURCE_EXCLUSION_ASSESSED",
    ],
    forbiddenEffects: [
      "ACCESS_ADMIN_CREDENTIALS",
      "ACCESS_PRODUCTION_DATABASE",
      "ACCESS_PRODUCTION_PROVIDER_CREDENTIALS",
      "ACCESS_PRODUCTION_STORAGE",
      "ACCESS_REPOSITORY",
      "EDIT_COMMITTED_PACKAGE",
      "EXECUTE_ARBITRARY_CODE",
      "REUSE_PRODUCER_CONTEXT",
    ],
    retention: ROLE_RETENTION,
  },
  HUMAN_DIRECTED_EXECUTOR: {
    inputSchemaId: "affiliate-agent/human-directed-executor-subject@1",
    permittedCommands: [
      "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
      "SUBMIT_TERMINAL_RESULT",
    ],
    terminalDispositions: ["CONTRACT_GAP", "LIFECYCLE_COMMAND_EXECUTED"],
    forbiddenEffects: [
      ...COMMON_FORBIDDEN_EFFECTS,
      "EXECUTE_UNRECORDED_LIFECYCLE_COMMAND",
      "SUBSTITUTE_HUMAN_DECISION",
    ],
    retention: ROLE_RETENTION,
  },
};

export const affiliateAgentRoleContractSchema =
  affiliateAgentRoleContractObjectSchema.superRefine((contract, context) => {
    assertSelfHash(contract, context);
    if (contract.version !== 1) {
      return;
    }

    const expectedCapabilities =
      AFFILIATE_AGENT_ROLE_CAPABILITIES[contract.role];
    const parsedCapabilities: AffiliateAgentRoleCapability = {
      inputSchemaId: contract.inputSchemaId,
      permittedCommands: contract.permittedCommands,
      terminalDispositions: contract.terminalDispositions,
      forbiddenEffects: contract.forbiddenEffects,
      retention: contract.retention,
    };
    if (
      canonicalizeAffiliateAgentValue(parsedCapabilities) !==
      canonicalizeAffiliateAgentValue(expectedCapabilities)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Version-1 role capabilities must match the registered capability matrix.",
      });
    }
  });

const createRoleContract = (
  role: AffiliateAgentRole,
): AffiliateAgentRoleContract => {
  const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES[role];
  const input = {
    schemaVersion: 1 as const,
    role,
    version: 1,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    ...AFFILIATE_AGENT_ROLE_CAPABILITIES[role],
    executionClass: "PRODUCTION_CODEX" as const,
  };
  return affiliateAgentRoleContractSchema.parse({
    ...input,
    hash: hashAffiliateAgentValue(input),
  });
};

export const AFFILIATE_AGENT_ROLE_CONTRACTS: Readonly<
  Record<AffiliateAgentRole, AffiliateAgentRoleContract>
> = {
  COVERAGE_PLANNER: createRoleContract("COVERAGE_PLANNER"),
  MAPPING_PRODUCER: createRoleContract("MAPPING_PRODUCER"),
  SUPPLY_REVIEWER: createRoleContract("SUPPLY_REVIEWER"),
  HUMAN_DIRECTED_EXECUTOR: createRoleContract("HUMAN_DIRECTED_EXECUTOR"),
};

const deploymentRoleReferenceSchema = (role: AffiliateAgentRole) =>
  z
    .object({
      role: z.literal(role),
      version: positiveIntegerSchema,
      hash: sha256Schema,
    })
    .strict();

export const affiliateAgentDeploymentContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: positiveIntegerSchema,
    gatewayVersion: positiveIntegerSchema,
    activeSupplyContract: z
      .object({
        version: positiveIntegerSchema,
        hash: sha256Schema,
      })
      .strict(),
    roleContracts: z.tuple([
      deploymentRoleReferenceSchema("COVERAGE_PLANNER"),
      deploymentRoleReferenceSchema("MAPPING_PRODUCER"),
      deploymentRoleReferenceSchema("SUPPLY_REVIEWER"),
      deploymentRoleReferenceSchema("HUMAN_DIRECTED_EXECUTOR"),
    ]),
    promptTemplates: z.tuple([
      deploymentRoleReferenceSchema("COVERAGE_PLANNER"),
      deploymentRoleReferenceSchema("MAPPING_PRODUCER"),
      deploymentRoleReferenceSchema("SUPPLY_REVIEWER"),
      deploymentRoleReferenceSchema("HUMAN_DIRECTED_EXECUTOR"),
    ]),
    expectedTopology: z
      .object({
        claimsPerInvocation: z.literal(1),
        hasFreshWorkspacePerClaim: z.literal(true),
        processCommand: z.tuple([
          z.literal("codex"),
          z.literal("exec"),
          z.literal("--ephemeral"),
        ]),
        hasNestedGoal: z.literal(false),
        hasClaimLoop: z.literal(false),
        hasContextReuse: z.literal(false),
        executionClass: z.literal("PRODUCTION_CODEX"),
        databaseRoles: z
          .object({
            gateway: z.literal("bracketiq_affiliate_gateway"),
            lifecycleAuthority: z.literal("bracketiq_affiliate_lifecycle"),
            agent: z.literal("bracketiq_affiliate_agent"),
          })
          .strict(),
      })
      .strict(),
    hash: sha256Schema,
  })
  .strict()
  .superRefine(assertSelfHash);

export type AffiliateAgentDeploymentContract = z.infer<
  typeof affiliateAgentDeploymentContractSchema
>;

const affiliateAgentRoleContractBundleTupleSchema = z.tuple([
  affiliateAgentRoleContractSchema,
  affiliateAgentRoleContractSchema,
  affiliateAgentRoleContractSchema,
  affiliateAgentRoleContractSchema,
]);

const affiliateAgentPromptTemplateBundleTupleSchema = z.tuple([
  affiliateAgentPromptTemplateSchema,
  affiliateAgentPromptTemplateSchema,
  affiliateAgentPromptTemplateSchema,
  affiliateAgentPromptTemplateSchema,
]);

const addContractReferenceMismatch = (
  context: z.RefinementCtx,
  path: (string | number)[],
): void => {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Deployment contract reference must match the parsed bundle.",
    path,
  });
};

const affiliateAgentPolicySupplyContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: positiveIntegerSchema,
    rolloutCohort: z.string().trim().min(1),
    hash: sha256Schema,
    freshnessWindows: z.array(
      z.object({
        sourceProfile: z.string().trim().min(1),
        maximumAgeHours: positiveIntegerSchema,
      }).strict(),
    ),
    targets: z.array(
      z.object({
        marketKey: z.string().trim().min(1).nullable().optional(),
        sportId: z.string().trim().min(1).nullable().optional(),
        sourceProfile: z.string().trim().min(1),
        minimumFreshPublishedSupply: positiveIntegerSchema,
      }).strict(),
    ),
    requiredMappingEvidenceKinds: z.array(z.string().trim().min(1)),
    requiredLifecycleEvidenceKinds: z.array(z.string().trim().min(1)),
    searchSaturationMinimumCycles: positiveIntegerSchema.optional(),
  })
  .strict()
  .superRefine(assertSelfHash);

export const affiliateAgentContractBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    supplyContract: z.union([
      affiliateAgentSupplyContractSchema,
      affiliateAgentPolicySupplyContractSchema,
    ]),
    roleContracts: affiliateAgentRoleContractBundleTupleSchema,
    promptTemplates: affiliateAgentPromptTemplateBundleTupleSchema,
    deploymentContract: affiliateAgentDeploymentContractSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    const { deploymentContract } = bundle;
    if (
      deploymentContract.activeSupplyContract.version !==
        bundle.supplyContract.version ||
      deploymentContract.activeSupplyContract.hash !==
        bundle.supplyContract.hash
    ) {
      addContractReferenceMismatch(context, [
        "deploymentContract",
        "activeSupplyContract",
      ]);
    }

    AFFILIATE_AGENT_ROLES.forEach((role, index) => {
      const roleContract = bundle.roleContracts[index];
      const promptTemplate = bundle.promptTemplates[index];
      const deploymentRole = deploymentContract.roleContracts[index];
      const deploymentPrompt = deploymentContract.promptTemplates[index];

      if (roleContract.role !== role) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Role contract ${index} must be ${role}.`,
          path: ["roleContracts", index, "role"],
        });
      }
      if (promptTemplate.role !== role) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Prompt template ${index} must be ${role}.`,
          path: ["promptTemplates", index, "role"],
        });
      }
      if (
        deploymentRole.version !== roleContract.version ||
        deploymentRole.hash !== roleContract.hash
      ) {
        addContractReferenceMismatch(context, [
          "deploymentContract",
          "roleContracts",
          index,
        ]);
      }
      if (
        deploymentPrompt.version !== promptTemplate.version ||
        deploymentPrompt.hash !== promptTemplate.hash
      ) {
        addContractReferenceMismatch(context, [
          "deploymentContract",
          "promptTemplates",
          index,
        ]);
      }
      if (
        roleContract.promptTemplateVersion !== promptTemplate.version ||
        roleContract.promptTemplateHash !== promptTemplate.hash
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Role contract prompt reference must match the parsed bundle.",
          path: ["roleContracts", index, "promptTemplateHash"],
        });
      }
    });
  });

export type AffiliateAgentContractBundle = z.infer<
  typeof affiliateAgentContractBundleSchema
>;

const affiliateAgentEvidenceManifestEntrySchema = z
  .object({
    evidenceRef: identifierSchema,
    kind: z.enum([
      "ACTIVE_SUPPLY_CONTRACT",
      "COMMITTED_PACKAGE",
      "DETERMINISTIC_VALIDATION",
      "DURABLE_EVIDENCE",
      "HUMAN_DECISION",
      "PAGE_HTML",
      "PAGE_MARKDOWN",
      "REVIEWER_EVIDENCE",
    ]),
    artifactId: identifierSchema,
    sha256: sha256Schema,
    mimeType: z.string().trim().min(1).max(200),
    byteSize: z.number().int().nonnegative().max(MAX_MANIFEST_ARTIFACT_BYTES),
    retention: z.literal("INDEFINITE"),
  })
  .strict();

export type AffiliateAgentEvidenceManifestEntry = z.infer<
  typeof affiliateAgentEvidenceManifestEntrySchema
>;

export const affiliateAgentEvidenceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z
      .array(affiliateAgentEvidenceManifestEntrySchema)
      .max(AFFILIATE_AGENT_MAX_MANIFEST_ENTRIES)
      .superRefine((entries, context) => {
        assertSortedUniqueObjects(
          entries,
          context,
          (entry) => entry.evidenceRef,
        );
      }),
    hash: sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const withinCanonicalByteLimit = addCanonicalByteLimitIssue(
      manifest,
      AFFILIATE_AGENT_MAX_MANIFEST_CANONICAL_BYTES,
      context,
      [],
      "Evidence manifest",
    );
    if (
      withinCanonicalByteLimit &&
      manifest.entries.length <= AFFILIATE_AGENT_MAX_MANIFEST_ENTRIES
    ) {
      assertSelfHash(manifest, context);
    }
  });

export type AffiliateAgentEvidenceManifest = z.infer<
  typeof affiliateAgentEvidenceManifestSchema
>;

const coveragePlannerSubjectSchema = z
  .object({
    type: z.literal("COVERAGE_PLANNER"),
    coverageCellId: identifierSchema,
    assessmentCycleId: identifierSchema,
  })
  .strict();

const mappingProducerSubjectSchema = z
  .object({
    type: z.literal("MAPPING_PRODUCER"),
    supplySourceId: identifierSchema,
    mappingJobId: identifierSchema,
    pass: z.number().int().min(1).max(3),
  })
  .strict();

const supplyReviewerSubjectSchema = z
  .object({
    type: z.literal("SUPPLY_REVIEWER"),
    supplySourceId: identifierSchema,
    producerClaimId: identifierSchema,
    producerWorkerId: identifierSchema,
    producerInvocationId: identifierSchema,
    producerWorkspaceId: identifierSchema,
    committedPackageHash: sha256Schema,
    targetId: identifierSchema,
    targetType: z.enum(["EVENT", "FACILITY", "ORGANIZATION"]),
    reviewPass: z.number().int().min(1).max(3),
  })
  .strict();

const humanDirectedExecutorSubjectSchema = z
  .object({
    type: z.literal("HUMAN_DIRECTED_EXECUTOR"),
    caseId: identifierSchema,
    recordedHumanActorId: identifierSchema,
    decisionHash: sha256Schema,
    reviewerClaimId: identifierSchema,
    lifecycleCommandRef: identifierSchema,
  })
  .strict();

export const affiliateAgentSubjectSchema = z.discriminatedUnion("type", [
  coveragePlannerSubjectSchema,
  mappingProducerSubjectSchema,
  supplyReviewerSubjectSchema,
  humanDirectedExecutorSubjectSchema,
]);

export type AffiliateAgentSubject = z.infer<typeof affiliateAgentSubjectSchema>;

const claimEnvelopeBase = {
  schemaVersion: z.literal(1),
  jobId: identifierSchema,
  claimId: identifierSchema,
  supplySourceId: identifierSchema.nullable(),
  claimGeneration: positiveIntegerSchema,
  lifecycleGeneration: z.number().int().nonnegative().nullable(),
  deploymentContractVersion: positiveIntegerSchema,
  deploymentContractHash: sha256Schema,
  supplyContractVersion: positiveIntegerSchema,
  supplyContractHash: sha256Schema,
  roleContractVersion: positiveIntegerSchema,
  roleContractHash: sha256Schema,
  promptTemplateVersion: positiveIntegerSchema,
  promptTemplateHash: sha256Schema,
  executionClass: z.literal("PRODUCTION_CODEX"),
  workerId: identifierSchema,
  invocationId: identifierSchema,
  workspaceId: identifierSchema,
  claimedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  evidenceManifest: affiliateAgentEvidenceManifestSchema,
  permittedCommands: sortedUniqueStringsSchema(affiliateAgentCommandNameSchema),
};

export const affiliateAgentClaimEnvelopeSchema = z
  .discriminatedUnion("role", [
    z
      .object({
        ...claimEnvelopeBase,
        role: z.literal("COVERAGE_PLANNER"),
        queue: z.literal("AFFILIATE_COVERAGE"),
        lane: z.literal("COVERAGE_PLANNING"),
        subject: coveragePlannerSubjectSchema,
      })
      .strict(),
    z
      .object({
        ...claimEnvelopeBase,
        role: z.literal("MAPPING_PRODUCER"),
        queue: z.literal("AFFILIATE_MAPPING"),
        lane: z.literal("MAPPING_PRODUCTION"),
        subject: mappingProducerSubjectSchema,
      })
      .strict(),
    z
      .object({
        ...claimEnvelopeBase,
        role: z.literal("SUPPLY_REVIEWER"),
        queue: z.literal("AFFILIATE_REVIEW"),
        lane: z.literal("SUPPLY_REVIEW"),
        subject: supplyReviewerSubjectSchema,
      })
      .strict(),
    z
      .object({
        ...claimEnvelopeBase,
        role: z.literal("HUMAN_DIRECTED_EXECUTOR"),
        queue: z.literal("AFFILIATE_HUMAN_DIRECTED"),
        lane: z.literal("HUMAN_EXECUTION"),
        subject: humanDirectedExecutorSubjectSchema,
      })
      .strict(),
  ])
  .superRefine((claim, context) => {
    addCanonicalByteLimitIssue(
      claim,
      AFFILIATE_AGENT_MAX_CLAIM_ENVELOPE_CANONICAL_BYTES,
      context,
      [],
      "Claim envelope",
    );
    assertClaimEnvelopeCommands(claim, context);
    assertClaimEnvelopeSourceRequirements(claim, context);
    assertClaimEnvelopeSubjectSource(claim, context);
    assertSupplyReviewerIdentity(claim, context);
  });

type AffiliateAgentClaimEnvelopeForAssertions = z.infer<
  typeof affiliateAgentClaimEnvelopeSchema
>;

const assertClaimEnvelopeCommands = (
  claim: AffiliateAgentClaimEnvelopeForAssertions,
  context: z.RefinementCtx,
): void => {
  const expectedCommands =
    AFFILIATE_AGENT_ROLE_CONTRACTS[claim.role].permittedCommands;
  if (
    claim.permittedCommands.join("\u0000") !== expectedCommands.join("\u0000")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Claim commands must match the active role contract.",
      path: ["permittedCommands"],
    });
  }
};

const assertClaimEnvelopeSourceRequirements = (
  claim: AffiliateAgentClaimEnvelopeForAssertions,
  context: z.RefinementCtx,
): void => {
  if (claim.role === "COVERAGE_PLANNER" && claim.supplySourceId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Coverage Planner claims cannot identify a Supply Source.",
      path: ["supplySourceId"],
    });
  }
  if (
    claim.role !== "COVERAGE_PLANNER" &&
    (claim.supplySourceId === null || claim.lifecycleGeneration === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Non-coverage claims require a Supply Source and lifecycle generation.",
      path: [
        claim.supplySourceId === null
          ? "supplySourceId"
          : "lifecycleGeneration",
      ],
    });
  }
};

const assertClaimEnvelopeSubjectSource = (
  claim: AffiliateAgentClaimEnvelopeForAssertions,
  context: z.RefinementCtx,
): void => {
  if (
    (claim.role === "MAPPING_PRODUCER" || claim.role === "SUPPLY_REVIEWER") &&
    claim.supplySourceId !== claim.subject.supplySourceId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Claim Supply Source must match the role subject Supply Source.",
      path: ["supplySourceId"],
    });
  }
};

const assertSupplyReviewerIdentity = (
  claim: AffiliateAgentClaimEnvelopeForAssertions,
  context: z.RefinementCtx,
): void => {
  if (claim.role !== "SUPPLY_REVIEWER") return;
  const identityChecks = [
    {
      claimValue: claim.workerId,
      producerValue: claim.subject.producerWorkerId,
      path: "workerId",
    },
    {
      claimValue: claim.invocationId,
      producerValue: claim.subject.producerInvocationId,
      path: "invocationId",
    },
    {
      claimValue: claim.workspaceId,
      producerValue: claim.subject.producerWorkspaceId,
      path: "workspaceId",
    },
  ];
  identityChecks.forEach(({ claimValue, producerValue, path }) => {
    if (claimValue === producerValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Supply Reviewer identity must differ from the producer identity.",
        path: [path],
      });
    }
  });
};

export type AffiliateAgentClaimEnvelope = z.infer<
  typeof affiliateAgentClaimEnvelopeSchema
>;

const affiliateAgentDeclarativePackageSchema = z
  .object({
    schemaVersion: z.literal(1),
    supplySourceId: identifierSchema,
    listingKind: z.enum(["CLUB", "EVENT", "RENTAL"]),
    listUrlRef: identifierSchema,
    itemSelector: z.string().trim().min(1).max(500),
    fields: z
      .array(
        z
          .object({
            field: z.enum([
              "address",
              "city",
              "dateDisplayMode",
              "dateDisplayText",
              "divisions",
              "officialActionUrl",
              "sourceUrl",
              "sportName",
              "startsAt",
              "tags",
              "title",
              "venueName",
            ]),
            selector: z.string().trim().min(1).max(500),
            mode: z.enum(["ATTRIBUTE", "TEXT"]),
            attribute: z.string().trim().min(1).max(100).nullable(),
            transform: z.enum(["ABSOLUTE_URL", "NONE", "TRIM"]),
          })
          .strict()
          .superRefine((field, context) => {
            if (field.mode === "ATTRIBUTE" && field.attribute === null) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Attribute mode requires one attribute name.",
                path: ["attribute"],
              });
            }
            if (field.mode === "TEXT" && field.attribute !== null) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Text mode cannot name an attribute.",
                path: ["attribute"],
              });
            }
          }),
      )
      .max(MAX_DECLARATIVE_PACKAGE_FIELDS)
      .superRefine((fields, context) => {
        assertSortedUniqueObjects(fields, context, (field) => field.field);
      }),
    evidenceRefs: sortedUniqueStringsSchema(identifierSchema),
  })
  .strict()
  .superRefine((candidatePackage, context) => {
    addCanonicalByteLimitIssue(
      candidatePackage,
      MAX_DECLARATIVE_PACKAGE_CANONICAL_BYTES,
      context,
      [],
      "Declarative package",
    );
  });

export const affiliateAgentCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("RUN_DISCOVERY_QUERY"),
      data: z
        .object({
          strategyRef: identifierSchema,
          queryRef: identifierSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CAPTURE_CLAIM_URL"),
      data: z
        .object({
          urlRef: identifierSchema,
          captureProfileRef: identifierSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("VALIDATE_DECLARATIVE_PACKAGE"),
      data: z
        .object({
          candidatePackage: affiliateAgentDeclarativePackageSchema,
          evidenceManifestHash: sha256Schema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("COMMIT_DECLARATIVE_PACKAGE"),
      data: z
        .object({
          validationReceiptId: identifierSchema,
          validatedPackageHash: sha256Schema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("EXECUTE_RECORDED_LIFECYCLE_COMMAND"),
      data: z
        .object({
          caseId: identifierSchema,
          decisionHash: sha256Schema,
          lifecycleCommandRef: identifierSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SUBMIT_TERMINAL_RESULT"),
    })
    .strict(),
]);

export const affiliateAgentDeclarativePackageValidationOutputSchema = z
  .object({ isValid: z.literal(true), validatedPackageHash: sha256Schema })
  .strict();

export type AffiliateAgentDeclarativePackageValidationOutput = z.infer<
  typeof affiliateAgentDeclarativePackageValidationOutputSchema
>;

export const affiliateAgentDeclarativePackageCommitOutputSchema = z
  .object({
    packageHash: sha256Schema,
  })
  .strict();

export type AffiliateAgentDeclarativePackageCommitOutput = z.infer<
  typeof affiliateAgentDeclarativePackageCommitOutputSchema
>;

export type AffiliateAgentCommand = z.infer<typeof affiliateAgentCommandSchema>;

const terminalResultBase = {
  schemaVersion: z.literal(1),
  jobId: identifierSchema,
  claimId: identifierSchema,
  claimGeneration: positiveIntegerSchema,
  lifecycleGeneration: z.number().int().nonnegative().nullable(),
  deploymentContractVersion: positiveIntegerSchema,
  deploymentContractHash: sha256Schema,
  supplyContractVersion: positiveIntegerSchema,
  supplyContractHash: sha256Schema,
  roleContractVersion: positiveIntegerSchema,
  roleContractHash: sha256Schema,
  promptTemplateVersion: positiveIntegerSchema,
  promptTemplateHash: sha256Schema,
  workerId: identifierSchema,
  invocationId: identifierSchema,
  reasonCodes: sortedUniqueStringsSchema(
    z.enum([
      "CONTRACT_REQUIREMENT_MISSING",
      "EVIDENCE_VERIFIED",
      "NO_QUALIFIED_ACTION",
      "POLICY_CONFLICT",
      "SCHEMA_VALIDATED",
      "SOURCE_UNSUPPORTED",
      "TARGET_INVALID",
    ]),
  ),
  evidenceRefs: sortedUniqueStringsSchema(identifierSchema),
  summary: z.string().trim().min(1).max(2_000),
};

const contractGapPayloadSchema = z
  .object({
    contractArea: z.enum([
      "COVERAGE_APPLICABILITY",
      "FRESHNESS",
      "LIFECYCLE_EVIDENCE",
      "MAPPING_EVIDENCE",
      "SEARCH_STRATEGIES",
      "SUPPLY_TARGETS_AND_MARKET_TIERS",
    ]),
    requestedChange: z.string().trim().min(1).max(1_000),
  })
  .strict();

const terminalResultVariant = <
  R extends AffiliateAgentRole,
  D extends AffiliateAgentTerminalDisposition,
  P extends z.ZodType,
>(
  role: R,
  disposition: D,
  payload: P,
) =>
  z
    .object({
      ...terminalResultBase,
      role: z.literal(role),
      disposition: z.literal(disposition),
      payload,
    })
    .strict()
    .superRefine((result, context) => {
      addCanonicalByteLimitIssue(
        result,
        MAX_TERMINAL_RESULT_CANONICAL_BYTES,
        context,
        [],
        "Terminal result",
      );
    });

export const affiliateAgentTerminalResultEnvelopeSchema = z.union([
  terminalResultVariant(
    "COVERAGE_PLANNER",
    "CAMPAIGN_PROPOSED",
    z
      .object({
        campaignProposalRefs: sortedUniqueStringsSchema(identifierSchema, 1),
      })
      .strict(),
  ),
  terminalResultVariant(
    "COVERAGE_PLANNER",
    "FAILED_CAPTURE_EVIDENCE_RECORDED",
    z
      .object({
        captureEvidenceRef: identifierSchema,
      })
      .strict(),
  ),
  terminalResultVariant(
    "COVERAGE_PLANNER",
    "SOURCE_EXCLUSION_PROPOSED",
    z
      .object({
        supplySourceId: identifierSchema,
        policyEvidenceRefs: sortedUniqueStringsSchema(identifierSchema, 1),
      })
      .strict(),
  ),
  terminalResultVariant(
    "COVERAGE_PLANNER",
    "CONTRACT_GAP",
    contractGapPayloadSchema,
  ),
  terminalResultVariant(
    "COVERAGE_PLANNER",
    "NO_ACTION",
    z
      .object({
        basis: z.enum([
          "NO_QUALIFIED_ACTION",
          "SEARCH_SATURATED",
          "TARGET_MET",
        ]),
      })
      .strict(),
  ).superRefine((result, context) => {
    if (result.evidenceRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A no-action result requires evidence.",
        path: ["evidenceRefs"],
      });
    }
  }),
  terminalResultVariant(
    "MAPPING_PRODUCER",
    "PACKAGE_COMMITTED",
    z
      .object({
        packageHash: sha256Schema,
        commitReceiptId: identifierSchema,
      })
      .strict(),
  ),
  terminalResultVariant(
    "MAPPING_PRODUCER",
    "BOUNDED_REPAIR_SUBMITTED",
    z
      .object({
        repairPass: z.number().int().min(1).max(3),
        packageHash: sha256Schema,
        commitReceiptId: identifierSchema,
      })
      .strict(),
  ),
  terminalResultVariant(
    "MAPPING_PRODUCER",
    "SOURCE_INCOMPATIBLE",
    z
      .object({
        incompatibilityCode: z.enum([
          "SOURCE_BLOCKED",
          "SOURCE_POLICY_PROHIBITS_CAPTURE",
          "UNSUPPORTED_LAYOUT",
        ]),
      })
      .strict(),
  ),
  terminalResultVariant(
    "MAPPING_PRODUCER",
    "CONTRACT_GAP",
    contractGapPayloadSchema,
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "APPROVED",
    z
      .object({
        committedPackageHash: sha256Schema,
      })
      .strict(),
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "ACTIVATED",
    z
      .object({
        committedPackageHash: sha256Schema,
        baselineHash: sha256Schema,
        candidateReviewId: identifierSchema,
      })
      .strict(),
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "PRODUCER_REPAIR_REQUIRED",
    z
      .object({
        committedPackageHash: sha256Schema,
        repairIssues: sortedUniqueStringsSchema(
          z.enum([
            "EVIDENCE_MISMATCH",
            "MISSING_REQUIRED_FIELD",
            "VALIDATION_FAILED",
          ]),
          1,
        ),
      })
      .strict(),
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "REGRESSION_ASSESSED",
    z
      .object({
        supplySourceId: identifierSchema,
        assessment: z.enum(["FAIL", "PASS"]),
      })
      .strict(),
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "SOURCE_EXCLUSION_ASSESSED",
    z
      .object({
        supplySourceId: identifierSchema,
        recommendation: z.enum(["EXCLUDE", "HUMAN_REVIEW", "KEEP"]),
      })
      .strict(),
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "EXACT_TARGET_REJECTED",
    z
      .object({
        targetId: identifierSchema,
        targetType: z.enum(["EVENT", "FACILITY", "ORGANIZATION"]),
      })
      .strict(),
  ),
  terminalResultVariant(
    "SUPPLY_REVIEWER",
    "HUMAN_REVIEW_REQUIRED",
    z
      .object({
        caseReason: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  ).superRefine((result, context) => {
    if (result.evidenceRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A human-review result requires evidence.",
        path: ["evidenceRefs"],
      });
    }
  }),
  terminalResultVariant(
    "HUMAN_DIRECTED_EXECUTOR",
    "LIFECYCLE_COMMAND_EXECUTED",
    z
      .object({
        caseId: identifierSchema,
        lifecycleCommandRef: identifierSchema,
        receiptId: identifierSchema,
      })
      .strict(),
  ),
  terminalResultVariant(
    "HUMAN_DIRECTED_EXECUTOR",
    "CONTRACT_GAP",
    contractGapPayloadSchema,
  ),
]);

export type AffiliateAgentTerminalResultEnvelope = z.infer<
  typeof affiliateAgentTerminalResultEnvelopeSchema
>;

const affiliateAgentSchemaIssueSchema = z
  .object({
    path: z
      .array(z.union([z.string().max(200), z.number().int().nonnegative()]))
      .max(MAX_SCHEMA_ISSUE_PATH_ITEMS),
    code: z.enum([
      "INVALID_TYPE",
      "INVALID_VALUE",
      "MISSING_VALUE",
      "UNKNOWN_KEY",
    ]),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export type AffiliateAgentSchemaIssue = z.infer<
  typeof affiliateAgentSchemaIssueSchema
>;

export type AffiliateAgentPromptAuthorityProjection = {
  schemaVersion: 1;
  role: AffiliateAgentRole;
  queue: AffiliateAgentClaimEnvelope["queue"];
  lane: AffiliateAgentClaimEnvelope["lane"];
  jobId: string;
  claimId: string;
  supplySourceId: string | null;
  executionClass: "PRODUCTION_CODEX";
  workerId: string;
  invocationId: string;
  workspaceId: string;
  claimedAt: string;
  expiresAt: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  supplyContractVersion: number;
  supplyContractHash: string;
  roleContractVersion: number;
  roleContractHash: string;
  promptTemplateVersion: number;
  promptTemplateHash: string;
  claimEnvelopeHash: string;
  evidenceManifestHash: string;
  claimGeneration: number;
  lifecycleGeneration: number | null;
  subject: AffiliateAgentSubject;
  nonTerminalCommands: AffiliateAgentRoleContract["permittedCommands"];
  terminalDispositions: AffiliateAgentRoleContract["terminalDispositions"];
  forbiddenEffects: AffiliateAgentRoleContract["forbiddenEffects"];
};

export const projectAffiliateAgentPromptAuthority = (
  roleContract: AffiliateAgentRoleContract,
  claimEnvelope: AffiliateAgentClaimEnvelope,
): AffiliateAgentPromptAuthorityProjection => {
  const parsedRoleContract =
    affiliateAgentRoleContractSchema.parse(roleContract);
  const parsedClaimEnvelope =
    affiliateAgentClaimEnvelopeSchema.parse(claimEnvelope);
  const promptTemplate =
    AFFILIATE_AGENT_PROMPT_TEMPLATES[parsedRoleContract.role];
  if (
    parsedClaimEnvelope.role !== parsedRoleContract.role ||
    parsedClaimEnvelope.roleContractVersion !== parsedRoleContract.version ||
    parsedClaimEnvelope.roleContractHash !== parsedRoleContract.hash ||
    parsedClaimEnvelope.promptTemplateVersion !== promptTemplate.version ||
    parsedClaimEnvelope.promptTemplateHash !== promptTemplate.hash ||
    parsedRoleContract.promptTemplateVersion !== promptTemplate.version ||
    parsedRoleContract.promptTemplateHash !== promptTemplate.hash
  ) {
    throw new Error(
      "Claim contract references must match the parsed role and prompt contracts.",
    );
  }

  return {
    schemaVersion: 1 as const,
    role: parsedClaimEnvelope.role,
    queue: parsedClaimEnvelope.queue,
    lane: parsedClaimEnvelope.lane,
    jobId: parsedClaimEnvelope.jobId,
    claimId: parsedClaimEnvelope.claimId,
    supplySourceId: parsedClaimEnvelope.supplySourceId,
    executionClass: parsedClaimEnvelope.executionClass,
    workerId: parsedClaimEnvelope.workerId,
    invocationId: parsedClaimEnvelope.invocationId,
    workspaceId: parsedClaimEnvelope.workspaceId,
    claimedAt: parsedClaimEnvelope.claimedAt,
    expiresAt: parsedClaimEnvelope.expiresAt,
    deploymentContractVersion: parsedClaimEnvelope.deploymentContractVersion,
    deploymentContractHash: parsedClaimEnvelope.deploymentContractHash,
    supplyContractVersion: parsedClaimEnvelope.supplyContractVersion,
    supplyContractHash: parsedClaimEnvelope.supplyContractHash,
    roleContractVersion: parsedRoleContract.version,
    roleContractHash: parsedRoleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    claimEnvelopeHash: hashAffiliateAgentValue(parsedClaimEnvelope),
    evidenceManifestHash: parsedClaimEnvelope.evidenceManifest.hash,
    claimGeneration: parsedClaimEnvelope.claimGeneration,
    lifecycleGeneration: parsedClaimEnvelope.lifecycleGeneration,
    subject: parsedClaimEnvelope.subject,
    nonTerminalCommands: parsedClaimEnvelope.permittedCommands.filter(
      (command) => command !== "SUBMIT_TERMINAL_RESULT",
    ),
    terminalDispositions: parsedRoleContract.terminalDispositions,
    forbiddenEffects: parsedRoleContract.forbiddenEffects,
  };
};

export const renderAffiliateAgentPrompt = (
  roleContract: AffiliateAgentRoleContract,
  claimEnvelope: AffiliateAgentClaimEnvelope,
): string => {
  const authorityProjection = projectAffiliateAgentPromptAuthority(
    roleContract,
    claimEnvelope,
  );
  const promptTemplate =
    AFFILIATE_AGENT_PROMPT_TEMPLATES[authorityProjection.role];

  return [
    "# Affiliate Agent Invocation",
    "",
    "## Authority Projection",
    canonicalizeAffiliateAgentValue(authorityProjection),
    "",
    "## Role Instructions",
    ...promptTemplate.roleInstructions.map(
      (instruction, index) => `${index + 1}. ${instruction}`,
    ),
    "",
    `Send ${promptTemplate.gatewayProtocol.method} JSON requests to the URL in ${promptTemplate.gatewayProtocol.gatewayAddressEnvironment}, using the path prefix in ${promptTemplate.gatewayProtocol.gatewayPathPrefixEnvironment} and appending ${promptTemplate.gatewayProtocol.pathSuffix}.`,
    `Read each permitted artifact with a READ_ARTIFACT request before using it. Use EXECUTE_COMMAND only for a command listed in the authority projection.`,
    `Each request must contain kind, a new idempotencyKey, authorization, and the field required by that kind: evidenceRef, command, or result.`,
    `Set authorization.token from ${promptTemplate.gatewayProtocol.authorizationEnvironment}. Copy jobId, claimId, claimGeneration, lifecycleGeneration, role, workerId, invocationId, and supplyContractHash from the claim envelope.`,
    `The terminal result must match ${promptTemplate.gatewayProtocol.terminalResultSchema} and the claim's role, hashes, identity, evidence refs, and listed disposition.`,
    "Submit the terminal result directly to the gateway. If the gateway returns SCHEMA_CORRECTION_REQUIRED, use its correctionPrompt and submit a new idempotencyKey with the corrected result. Make at most three terminal submissions for this claim.",
    "Do not return a plain terminal result to the supervisor. After the gateway returns TERMINAL_ACCEPTED or INVOCATION_FAILED, print exactly one JSON object with kind TERMINAL_SUBMISSION, the accepted submission idempotencyKey, and the submitted result.",
    "",
    "## Completion",
    `Submit one terminal result using the ${promptTemplate.terminalCommand} capability (not as the wire discriminator). Send exactly this JSON request shape to the gateway: ${promptTemplate.gatewayProtocol.terminalRequestShape}. The result value must match ${promptTemplate.gatewayProtocol.terminalResultSchema} and use this strict role-specific shape (use only a listed disposition; add no extra fields):\n${promptTemplate.gatewayProtocol.terminalResultShape.join("\n")}`,
  ].join("\n");
};
