import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  affiliateSportsCatalogSnapshotSchema,
  compareAffiliateCatalogCodeUnits,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import { isAffiliateSportBlacklisted } from './affiliateSportMapping';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const boundedString = (max: number) => z.string().max(max).refine(
  (value) => value.trim().length > 0,
  'Expected a nonblank string.',
);

export const AFFILIATE_SPORT_DETERMINATION_STATUSES = [
  'RESOLVED',
  'VARIANT_UNRESOLVED',
  'UNSUPPORTED',
  'BLACKLISTED',
] as const;
export type AffiliateSportDeterminationStatus = typeof AFFILIATE_SPORT_DETERMINATION_STATUSES[number];

export const AFFILIATE_SPORT_DETERMINATION_BASES = ['SOURCE_EVIDENCE', 'USER_DECISION'] as const;
export type AffiliateSportDeterminationBasis = typeof AFFILIATE_SPORT_DETERMINATION_BASES[number];

export const AFFILIATE_SPORT_CITATION_KINDS = [
  'PAGE_HTML',
  'PAGE_MARKDOWN',
  'PAGE_SCREENSHOT',
] as const;
export type AffiliateSportCitationKind = typeof AFFILIATE_SPORT_CITATION_KINDS[number];
const isCatalogSnapshot = (
  value: AffiliateSportsCatalogSnapshot | readonly string[],
): value is AffiliateSportsCatalogSnapshot => !Array.isArray(value);

export type AffiliateSportCitation = {
  artifactId: string;
  artifactSha256: string;
  artifactKind: AffiliateSportCitationKind;
  pageUrl: string;
  excerpt: string;
};

export type AffiliateSportDetermination = {
  sourceLabels: string[];
  status: AffiliateSportDeterminationStatus;
  resolutionBasis: AffiliateSportDeterminationBasis;
  resolvedFromDeterminationSha256?: string;
  canonicalSportNames: string[];
  rationale: string;
  evidence: AffiliateSportCitation[];
};

export type AffiliateHumanSportResolutionEntry = {
  determinationSha256: string;
  sourceLabels: string[];
  canonicalSportNames: string[];
};

export type AffiliateHumanSportResolution = {
  schemaVersion: 1;
  state: 'PENDING' | 'CONSUMED';
  decidedAt: string;
  decidedByUserId: string;
  catalogSha256: string;
  priorResultSummarySha256: string;
  rationale: string;
  resolutions: AffiliateHumanSportResolutionEntry[];
  consumedAt?: string;
  consumedDeterminationSha256s?: string[];
};

const compareStrings = compareAffiliateCatalogCodeUnits;

const sortedUnique = (values: readonly string[]): string[] => [...values].sort(compareStrings)
  .filter((value, index, all) => index === 0 || value !== all[index - 1]);

const assertSortedUnique = (values: readonly string[], field: string): void => {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.trim().length === 0 || value !== value.trim()) {
      throw new Error(`${field} must contain nonblank, unpadded strings.`);
    }
    if (index > 0 && compareStrings(values[index - 1], value) >= 0) {
      throw new Error(`${field} must be sorted uniquely by code unit order.`);
    }
  }
};

export const sortUniqueAffiliateSportNames = (names: readonly string[]): string[] => {
  const sorted = sortedUnique(names);
  assertSortedUnique(sorted, 'canonicalSportNames');
  return sorted;
};

export const sortUniqueAffiliateSportLabels = (labels: readonly string[]): string[] => {
  const sorted = sortedUnique(labels);
  assertSortedUnique(sorted, 'sourceLabels');
  return sorted;
};

export const canonicalizeAffiliateSportCitationPageUrl = (pageUrl: string): string => {
  try {
    return new URL(pageUrl).toString();
  } catch {
    throw new Error(`Invalid affiliate sport citation URL: ${pageUrl}`);
  }
};

export const affiliateSportCitationTuple = (
  citation: AffiliateSportCitation,
): readonly [string, string, string, string, string] => [
  citation.artifactId,
  citation.artifactSha256.toLowerCase(),
  citation.artifactKind,
  canonicalizeAffiliateSportCitationPageUrl(citation.pageUrl),
  citation.excerpt,
];

export const canonicalizeAffiliateSportCitation = (
  citation: AffiliateSportCitation,
): AffiliateSportCitation => ({
  ...citation,
  artifactSha256: citation.artifactSha256.toLowerCase(),
  pageUrl: canonicalizeAffiliateSportCitationPageUrl(citation.pageUrl),
});

const compareCitationTuples = (
  left: AffiliateSportCitation,
  right: AffiliateSportCitation,
): number => {
  const leftTuple = affiliateSportCitationTuple(left);
  const rightTuple = affiliateSportCitationTuple(right);
  for (let index = 0; index < leftTuple.length; index += 1) {
    const compared = compareStrings(leftTuple[index], rightTuple[index]);
    if (compared !== 0) return compared;
  }
  return 0;
};

const citationSchema = z.object({
  artifactId: boundedString(200),
  artifactSha256: sha256Schema,
  artifactKind: z.enum(AFFILIATE_SPORT_CITATION_KINDS),
  pageUrl: z.string().url(),
  excerpt: boundedString(1_000),
}).strict();

const validateCitations = (citations: readonly AffiliateSportCitation[]): void => {
  if (citations.length === 0) throw new Error('Every sport determination needs stored evidence.');
  for (let index = 1; index < citations.length; index += 1) {
    const compared = compareCitationTuples(citations[index - 1], citations[index]);
    if (compared >= 0) {
      throw new Error('Determination citations must be sorted uniquely by their canonical tuple.');
    }
  }
};

const determinationSchemaBase = z.object({
  sourceLabels: z.array(boundedString(160)).min(1).max(20),
  status: z.enum(AFFILIATE_SPORT_DETERMINATION_STATUSES),
  resolutionBasis: z.enum(AFFILIATE_SPORT_DETERMINATION_BASES),
  resolvedFromDeterminationSha256: sha256Schema.optional(),
  canonicalSportNames: z.array(boundedString(160)).max(20),
  rationale: boundedString(2_000),
  evidence: z.array(citationSchema).min(1).max(8),
}).strict();

export const affiliateSportDeterminationSchema = determinationSchemaBase.superRefine((determination, context) => {
  try {
    assertSortedUnique(determination.sourceLabels, 'sourceLabels');
    assertSortedUnique(determination.canonicalSportNames, 'canonicalSportNames');
    validateCitations(determination.evidence);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: error instanceof Error ? error.message : 'Invalid sport determination ordering.',
    });
  }

  const resolved = determination.status === 'RESOLVED';
  if (resolved !== (determination.canonicalSportNames.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['canonicalSportNames'],
      message: 'Only RESOLVED determinations may contain canonical sport names, and RESOLVED needs at least one.',
    });
  }
  if (determination.status !== 'RESOLVED' && determination.resolutionBasis !== 'SOURCE_EVIDENCE') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolutionBasis'],
      message: 'Unresolved, unsupported, and blacklisted determinations must use source evidence.',
    });
  }
  if (determination.resolutionBasis === 'USER_DECISION' && !resolved) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolutionBasis'],
      message: 'User decisions may only resolve a prior determination.',
    });
  }
  if (determination.resolutionBasis === 'USER_DECISION' && !determination.resolvedFromDeterminationSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolvedFromDeterminationSha256'],
      message: 'User decisions must identify the prior determination hash.',
    });
  }
  if (determination.resolutionBasis === 'SOURCE_EVIDENCE' && determination.resolvedFromDeterminationSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolvedFromDeterminationSha256'],
      message: 'Source-evidence determinations cannot contain a user-resolution hash.',
    });
  }
});

const normalizeDetermination = (input: AffiliateSportDetermination): AffiliateSportDetermination => {
  const canonical = {
    ...input,
    sourceLabels: sortUniqueAffiliateSportLabels(input.sourceLabels),
    canonicalSportNames: sortUniqueAffiliateSportNames(input.canonicalSportNames),
    evidence: input.evidence.map(canonicalizeAffiliateSportCitation).sort(compareCitationTuples),
  };
  return affiliateSportDeterminationSchema.parse(canonical);
};

const determinationHashPayload = (determination: AffiliateSportDetermination) => {
  const parsed = normalizeDetermination(determination);
  if (parsed.resolvedFromDeterminationSha256) {
    return {
      sourceLabels: parsed.sourceLabels,
      status: parsed.status,
      resolutionBasis: parsed.resolutionBasis,
      resolvedFromDeterminationSha256: parsed.resolvedFromDeterminationSha256.toLowerCase(),
      canonicalSportNames: parsed.canonicalSportNames,
      rationale: parsed.rationale,
      evidence: parsed.evidence,
    };
  }
  return {
    sourceLabels: parsed.sourceLabels,
    status: parsed.status,
    resolutionBasis: parsed.resolutionBasis,
    canonicalSportNames: parsed.canonicalSportNames,
    rationale: parsed.rationale,
    evidence: parsed.evidence,
  };
};

export const affiliateSportDeterminationSha256 = (
  determination: AffiliateSportDetermination,
): string => createHash('sha256')
  .update(JSON.stringify(determinationHashPayload(determination)))
  .digest('hex');

export const sortAffiliateSportDeterminations = (
  determinations: readonly AffiliateSportDetermination[],
): AffiliateSportDetermination[] => {
  const sorted = [...determinations]
    .map(normalizeDetermination)
    .sort((left, right) => (
      compareStrings(left.status, right.status)
      || compareStrings(left.sourceLabels.join('\u0000'), right.sourceLabels.join('\u0000'))
      || compareStrings(left.canonicalSportNames.join('\u0000'), right.canonicalSportNames.join('\u0000'))
      || compareStrings(affiliateSportDeterminationSha256(left), affiliateSportDeterminationSha256(right))
    ));
  for (let index = 1; index < sorted.length; index += 1) {
    if (affiliateSportDeterminationSha256(sorted[index - 1]) === affiliateSportDeterminationSha256(sorted[index])) {
      throw new Error(`Duplicate sport determination ${affiliateSportDeterminationSha256(sorted[index])}.`);
    }
  }
  return sorted;
};

export const affiliateSportDeterminationsSha256 = (
  determinations: readonly AffiliateSportDetermination[],
): string => createHash('sha256')
  .update(JSON.stringify(sortAffiliateSportDeterminations(determinations).map(determinationHashPayload)))
  .digest('hex');
export const affiliateSportDeterminationsSchema = z.array(affiliateSportDeterminationSchema)
  .max(50)
  .superRefine((determinations, context) => {
    try {
      sortAffiliateSportDeterminations(determinations);
      const expected = sortAffiliateSportDeterminations(determinations)
        .map(affiliateSportDeterminationSha256);
      const actual = determinations.map(affiliateSportDeterminationSha256);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Sport determinations must be sorted by status, source labels, names, then hash.');
      }
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: error instanceof Error ? error.message : 'Invalid sport determination list.',
      });
    }
  });

const resolutionEntrySchema = z.object({
  determinationSha256: sha256Schema,
  sourceLabels: z.array(boundedString(160)).min(1).max(20),
  canonicalSportNames: z.array(boundedString(160)).min(1).max(20),
}).strict();

const resolutionSchemaBase = z.object({
  schemaVersion: z.literal(1),
  state: z.enum(['PENDING', 'CONSUMED']),
  decidedAt: z.string().datetime({ offset: true }),
  decidedByUserId: boundedString(200),
  catalogSha256: sha256Schema,
  priorResultSummarySha256: sha256Schema,
  rationale: boundedString(2_000),
  resolutions: z.array(resolutionEntrySchema).max(50),
  consumedAt: z.string().datetime({ offset: true }).optional(),
  consumedDeterminationSha256s: z.array(sha256Schema).max(50).optional(),
}).strict();

const validateResolutionOrdering = (resolution: AffiliateHumanSportResolution): void => {
  for (let index = 0; index < resolution.resolutions.length; index += 1) {
    const entry = resolution.resolutions[index];
    assertSortedUnique(entry.sourceLabels, 'resolution sourceLabels');
    assertSortedUnique(entry.canonicalSportNames, 'resolution canonicalSportNames');
    if (index > 0 && compareStrings(resolution.resolutions[index - 1].determinationSha256, entry.determinationSha256) >= 0) {
      throw new Error('Human sport resolutions must be sorted uniquely by determination hash.');
    }
  }
  if (resolution.consumedDeterminationSha256s) {
    assertSortedUnique(resolution.consumedDeterminationSha256s, 'consumedDeterminationSha256s');
  }
};

export const affiliateHumanSportResolutionSchema = resolutionSchemaBase.superRefine((resolution, context) => {
  try {
    validateResolutionOrdering(resolution);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: error instanceof Error ? error.message : 'Invalid human sport resolution ordering.',
    });
  }

  if (resolution.state === 'PENDING' && (resolution.consumedAt || resolution.consumedDeterminationSha256s)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['state'],
      message: 'Pending human resolutions cannot contain consumed fields.',
    });
  }
  if (resolution.state === 'CONSUMED' && (!resolution.consumedAt || !resolution.consumedDeterminationSha256s)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['state'],
      message: 'Consumed human resolutions require consumedAt and consumedDeterminationSha256s.',
    });
  }
});

const normalizeHumanResolution = (
  input: AffiliateHumanSportResolution,
): AffiliateHumanSportResolution => affiliateHumanSportResolutionSchema.parse({
  ...input,
  resolutions: [...input.resolutions].map((entry) => ({
    ...entry,
    sourceLabels: sortUniqueAffiliateSportLabels(entry.sourceLabels),
    canonicalSportNames: sortUniqueAffiliateSportNames(entry.canonicalSportNames),
  })).sort((left, right) => compareStrings(left.determinationSha256, right.determinationSha256)),
  consumedDeterminationSha256s: input.consumedDeterminationSha256s
    ? sortUniqueAffiliateSportNames(input.consumedDeterminationSha256s)
    : undefined,
});

export const affiliateHumanSportResolutionSha256 = (
  resolution: AffiliateHumanSportResolution,
): string => {
  const parsed = normalizeHumanResolution(resolution);
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: 1 as const,
    state: parsed.state,
    decidedAt: parsed.decidedAt,
    decidedByUserId: parsed.decidedByUserId,
    catalogSha256: parsed.catalogSha256.toLowerCase(),
    priorResultSummarySha256: parsed.priorResultSummarySha256.toLowerCase(),
    rationale: parsed.rationale,
    resolutions: parsed.resolutions,
    ...(parsed.consumedAt ? { consumedAt: parsed.consumedAt } : {}),
    ...(parsed.consumedDeterminationSha256s
      ? { consumedDeterminationSha256s: parsed.consumedDeterminationSha256s.map((hash) => hash.toLowerCase()) }
      : {}),
  })).digest('hex');
};

export const resolvedAffiliateSportNameUnion = (
  determinations: readonly AffiliateSportDetermination[],
): string[] => sortUniqueAffiliateSportNames(
  determinations.flatMap((determination) => (
    determination.status === 'RESOLVED' ? determination.canonicalSportNames : []
  )),
);

export const affiliateSportSourceLabelUnion = (
  determinations: readonly AffiliateSportDetermination[],
): string[] => sortUniqueAffiliateSportLabels(determinations.flatMap((determination) => determination.sourceLabels));

export const assertAffiliateHumanSportResolutionMatchesDeterminations = ({
  resolution,
  determinations,
  catalog,
}: {
  resolution: AffiliateHumanSportResolution;
  determinations: readonly AffiliateSportDetermination[];
  catalog: AffiliateSportsCatalogSnapshot | readonly string[];
}): void => {
  affiliateHumanSportResolutionSchema.parse(resolution);
  const catalogNames = new Set(
    isCatalogSnapshot(catalog) ? catalog.sports.map((sport) => sport.name) : catalog,
  );
  if (isCatalogSnapshot(catalog) && resolution.catalogSha256.toLowerCase() !== catalog.sha256) {
    throw new Error('Human resolution catalog hash does not match the supplied catalog.');
  }
  const userDecisionDeterminations = determinations.filter((determination) => (
    determination.resolutionBasis === 'USER_DECISION'
  ));
  const resolutionHashes = new Set<string>();
  for (const entry of resolution.resolutions) {
    const normalizedHash = entry.determinationSha256.toLowerCase();
    if (resolutionHashes.has(normalizedHash)) {
      throw new Error(`Human resolution repeats determination ${entry.determinationSha256}.`);
    }
    resolutionHashes.add(normalizedHash);
    if (userDecisionDeterminations.length > 0) {
      const determination = userDecisionDeterminations.find((candidate) => (
        candidate.status === 'RESOLVED'
        && candidate.resolvedFromDeterminationSha256?.toLowerCase() === normalizedHash
      ));
      if (!determination) {
        throw new Error(`Human resolution has no matching USER_DECISION determination ${entry.determinationSha256}.`);
      }
      if (JSON.stringify(entry.sourceLabels) !== JSON.stringify(determination.sourceLabels)) {
        throw new Error(`Human resolution labels do not match determination ${entry.determinationSha256}.`);
      }
      if (JSON.stringify(entry.canonicalSportNames) !== JSON.stringify(determination.canonicalSportNames)) {
        throw new Error(`Human resolution sports do not match determination ${entry.determinationSha256}.`);
      }
    } else {
      const priorDetermination = determinations.find((candidate) => (
        ['VARIANT_UNRESOLVED', 'UNSUPPORTED'].includes(candidate.status)
        && affiliateSportDeterminationSha256(candidate).toLowerCase() === normalizedHash
      ));
      if (!priorDetermination) {
        throw new Error(`Human resolution has no matching unresolved determination ${entry.determinationSha256}.`);
      }
      if (JSON.stringify(entry.sourceLabels) !== JSON.stringify(priorDetermination.sourceLabels)) {
        throw new Error(`Human resolution labels do not match determination ${entry.determinationSha256}.`);
      }
    }
    if (entry.canonicalSportNames.some((name) => !catalogNames.has(name) || isAffiliateSportBlacklisted(name))) {
      throw new Error(`Human resolution selects a missing or blacklisted catalog sport for ${entry.determinationSha256}.`);
    }
  }
  if (userDecisionDeterminations.length > 0 && (
    resolutionHashes.size !== userDecisionDeterminations.length
    || userDecisionDeterminations.some((determination) => (
      !determination.resolvedFromDeterminationSha256
      || !resolutionHashes.has(determination.resolvedFromDeterminationSha256.toLowerCase())
    ))
  )) {
    throw new Error('Human resolution must cover every USER_DECISION determination exactly once.');
  }
  if (resolution.state === 'CONSUMED') {
    const consumedHashes = resolution.consumedDeterminationSha256s ?? [];
    if (JSON.stringify(consumedHashes) !== JSON.stringify([...resolutionHashes].sort(compareStrings))) {
      throw new Error('Consumed determination hashes must equal the resolved determination set.');
    }
  }
};

export class AffiliateSportVerificationError extends Error {
  constructor(
    readonly path: readonly (string | number)[],
    message: string,
  ) {
    super(message);
    this.name = 'AffiliateSportVerificationError';
  }
}

export const assertAffiliateSportDeterminationReasonStatusConsistency = ({
  determinations,
  reasonCodes,
  allowBlacklistedExclusion = false,
}: {
  determinations: readonly AffiliateSportDetermination[];
  reasonCodes: readonly string[];
  allowBlacklistedExclusion?: boolean;
}): void => {
  const requiredByStatus: Partial<Record<AffiliateSportDeterminationStatus, string>> = {
    VARIANT_UNRESOLVED: 'SPORT_VARIANT_UNRESOLVED',
    UNSUPPORTED: 'SPORT_NOT_IN_CATALOG',
    BLACKLISTED: 'SPORT_BLACKLISTED',
  };
  for (const determination of determinations) {
    const requiredReason = requiredByStatus[determination.status];
    if (requiredReason
      && !(allowBlacklistedExclusion && determination.status === 'BLACKLISTED')
      && !reasonCodes.includes(requiredReason)) {
      throw new AffiliateSportVerificationError(['reasonCodes'], `${determination.status} requires reason code ${requiredReason}.`);
    }
  }
  if (reasonCodes.includes('SPORT_VARIANT_UNRESOLVED')
    && !determinations.some((d) => d.status === 'VARIANT_UNRESOLVED')) {
    throw new AffiliateSportVerificationError(['reasonCodes', reasonCodes.indexOf('SPORT_VARIANT_UNRESOLVED')], 'SPORT_VARIANT_UNRESOLVED requires a matching determination.');
  }
  if (reasonCodes.includes('SPORT_NOT_IN_CATALOG')
    && !determinations.some((d) => d.status === 'UNSUPPORTED')) {
    throw new AffiliateSportVerificationError(['reasonCodes', reasonCodes.indexOf('SPORT_NOT_IN_CATALOG')], 'SPORT_NOT_IN_CATALOG requires a matching determination.');
  }
  if (reasonCodes.includes('SPORT_BLACKLISTED')
    && !determinations.some((d) => d.status === 'BLACKLISTED')) {
    throw new AffiliateSportVerificationError(['reasonCodes', reasonCodes.indexOf('SPORT_BLACKLISTED')], 'SPORT_BLACKLISTED requires a matching determination.');
  }
};


export const assertAffiliateSportCompletionReady = ({
  determinations,
  catalog,
  resultKind,
  reasonCodes = [],
  humanResolution,
}: {
  determinations: readonly AffiliateSportDetermination[];
  catalog: AffiliateSportsCatalogSnapshot | readonly string[];
  resultKind: 'REVIEW_REQUIRED' | 'HUMAN_REVIEW_REQUIRED';
  reasonCodes?: readonly string[];
  humanResolution?: AffiliateHumanSportResolution;
}): void => {
  if (determinations.length > 50) throw new AffiliateSportVerificationError(['sportDeterminations'], 'A mapping result may contain at most 50 determinations.');
  const parsedDeterminations = determinations.map((determination) => (
    affiliateSportDeterminationSchema.parse(determination)
  ));
  const sortedDeterminations = sortAffiliateSportDeterminations(parsedDeterminations);
  if (JSON.stringify(parsedDeterminations.map(affiliateSportDeterminationSha256))
    !== JSON.stringify(sortedDeterminations.map(affiliateSportDeterminationSha256))) {
    throw new AffiliateSportVerificationError(['sportDeterminations'], 'Sport determinations must be sorted by status, source labels, names, then hash.');
  }
  const catalogNames = new Set(
    isCatalogSnapshot(catalog) ? catalog.sports.map((sport) => sport.name) : catalog,
  );
  const hashes = new Set<string>();
  for (let index = 0; index < parsedDeterminations.length; index += 1) {
    const parsed = parsedDeterminations[index];
    const hash = affiliateSportDeterminationSha256(parsed);
    if (hashes.has(hash)) throw new AffiliateSportVerificationError(['sportDeterminations', index], 'Duplicate sport determinations are not permitted.');
    hashes.add(hash);
    if (parsed.status === 'RESOLVED' && parsed.canonicalSportNames.some(
      (name) => !catalogNames.has(name) || isAffiliateSportBlacklisted(name),
    )) {
      throw new AffiliateSportVerificationError(['sportDeterminations', index, 'canonicalSportNames'], 'Resolved determination contains a missing or blacklisted catalog sport.');
    }
    if (parsed.status === 'BLACKLISTED' && parsed.sourceLabels.every((name) => !isAffiliateSportBlacklisted(name))) {
      throw new AffiliateSportVerificationError(['sportDeterminations', index, 'sourceLabels'], 'Blacklisted determination does not identify a blacklisted source label.');
    }
  }
  const userDecisionIndex = parsedDeterminations.findIndex(
    determination => determination.resolutionBasis === 'USER_DECISION',
  );
  if (userDecisionIndex >= 0 && !humanResolution) {
    throw new AffiliateSportVerificationError(['sportDeterminations', userDecisionIndex, 'resolutionBasis'], 'USER_DECISION determinations require a matching authenticated human sport resolution.');
  }

  if (humanResolution) {
    assertAffiliateHumanSportResolutionMatchesDeterminations({
      resolution: humanResolution,
      determinations: parsedDeterminations,
      catalog,
    });
  }
  assertAffiliateSportDeterminationReasonStatusConsistency({
    determinations: parsedDeterminations,
    reasonCodes,
    allowBlacklistedExclusion: resultKind === 'REVIEW_REQUIRED'
      && parsedDeterminations.some((determination) => determination.status === 'RESOLVED'),
  });

  if (resultKind === 'REVIEW_REQUIRED') {
    if (!parsedDeterminations.some((d) => d.status === 'RESOLVED')) {
      throw new AffiliateSportVerificationError(['sportDeterminations'], 'Review-ready mappings require at least one resolved determination.');
    }
    if (parsedDeterminations.some((d) => !['RESOLVED', 'BLACKLISTED'].includes(d.status))) {
      throw new AffiliateSportVerificationError(['sportDeterminations'], 'Review-ready mappings cannot contain unresolved or unsupported determinations.');
    }
  } else if (reasonCodes.some((code) => (
    ['SPORT_VARIANT_UNRESOLVED', 'SPORT_NOT_IN_CATALOG', 'SPORT_BLACKLISTED'].includes(code)
  )) && parsedDeterminations.length === 0) {
    throw new AffiliateSportVerificationError(['sportDeterminations'], 'Sport-coded human review requires determinations.');
  }
};

export const isAffiliateSportCompletionReady = (
  input: Parameters<typeof assertAffiliateSportCompletionReady>[0],
): boolean => {
  try {
    assertAffiliateSportCompletionReady(input);
    return true;
  } catch {
    return false;
  }
};
export type AffiliateSportCompletionStoredArtifact = {
  artifactId?: string;
  id?: string;
  runId: string;
  intakeId?: string | null;
  kind: AffiliateSportCitationKind;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  contentHash?: string | null;
  artifactSha256?: string | null;
  mimeType?: string | null;
  bytes?: Uint8Array | string;
  data?: Uint8Array | string;
  text?: string | null;
  body?: string | null;
};

export type AffiliateSportCompletionVerificationInput = {
  result?: {
    status: 'REVIEW_REQUIRED' | 'HUMAN_REVIEW_REQUIRED' | 'EXPANDED' | 'FAILED';
    evidenceRunId: string;
    sportsCatalogSha256: string;
    sportDeterminations: AffiliateSportDetermination[];
    humanReviewRequired?: {
      reasonCodes: string[];
      sourceSportLabels: string[];
    } | null;
  };
  resultKind?: 'REVIEW_REQUIRED' | 'HUMAN_REVIEW_REQUIRED';
  reasonCodes?: readonly string[];
  determinations?: readonly AffiliateSportDetermination[];
  catalog?: AffiliateSportsCatalogSnapshot | readonly string[];
  claimEvidenceContext?: {
    intakeId?: string;
    evidenceRunId: string;
    sportsCatalog: AffiliateSportsCatalogSnapshot;
  };
  freshCatalog?: AffiliateSportsCatalogSnapshot;
  humanResolution?: AffiliateHumanSportResolution;
  expectedIntakeId?: string;
  artifacts?: readonly AffiliateSportCompletionStoredArtifact[];
  expectedSportNames?: readonly string[];
  observedSportNames?: readonly string[];
  sportQuality?: {
    passed: boolean;
    expectedSportNames?: readonly string[];
    observedSportNames?: readonly string[];
  };
};

export type AffiliateSportCompletionVerificationDependencies = {
  loadCurrentCatalog?: () => Promise<AffiliateSportsCatalogSnapshot>;
  readArtifact?: (
    runId: string,
    artifactId: string,
  ) => Promise<AffiliateSportCompletionStoredArtifact>;
  loadArtifacts?: (
    runId: string,
    artifactIds: readonly string[],
  ) => Promise<readonly AffiliateSportCompletionStoredArtifact[]>;
};

export type VerifiedAffiliateSportCompletion = {
  evidenceRunId: string;
  sportsCatalogSha256: string;
  sportDeterminations: AffiliateSportDetermination[];
  expectedSportNames: string[];
  observedSportNames: string[];
  catalogHashMatched: true;
  evidenceOwnershipPassed: true;
  determinationCoveragePassed: true;
};

const normalizeCitationText = (value: string): string => value
  .normalize('NFKC')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const artifactIdentifier = (artifact: AffiliateSportCompletionStoredArtifact): string => (
  artifact.artifactId ?? artifact.id ?? ''
);

const artifactBytes = (artifact: AffiliateSportCompletionStoredArtifact): Uint8Array => {
  const value = artifact.bytes ?? artifact.data;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error(`Stored artifact ${artifactIdentifier(artifact)} has no bytes.`);
};

const artifactText = (
  artifact: AffiliateSportCompletionStoredArtifact,
  bytes: Uint8Array,
): string => {
  if (typeof artifact.text === 'string') return artifact.text;
  if (typeof artifact.body === 'string') return artifact.body;
  const decoded = Buffer.from(bytes).toString('utf8');
  if (artifact.kind === 'PAGE_HTML') {
    return decoded
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }
  return decoded;
};

const sportCitationVerificationError = (
  determinationIndex: number,
  citationIndex: number,
  field: keyof AffiliateSportCitation,
  message: string,
): AffiliateSportVerificationError => new AffiliateSportVerificationError(
  ['sportDeterminations', determinationIndex, 'evidence', citationIndex, field],
  message,
);

const assertArtifactCitation = (
  artifact: AffiliateSportCompletionStoredArtifact,
  citation: AffiliateSportCitation,
  evidenceRunId: string,
  expectedIntakeId: string | undefined,
  determinationIndex: number,
  citationIndex: number,
): void => {
  const id = artifactIdentifier(artifact);
  if (!id || id !== citation.artifactId) throw sportCitationVerificationError(determinationIndex, citationIndex, 'artifactId', 'The citation artifact is not owned by the claimed run.');
  if (artifact.runId !== evidenceRunId) throw sportCitationVerificationError(determinationIndex, citationIndex, 'artifactId', 'The citation artifact belongs to a different evidence run.');
  if (expectedIntakeId && artifact.intakeId && artifact.intakeId !== expectedIntakeId) {
    throw sportCitationVerificationError(determinationIndex, citationIndex, 'artifactId', 'The citation artifact belongs to a different intake.');
  }
  if (artifact.kind !== citation.artifactKind) throw sportCitationVerificationError(determinationIndex, citationIndex, 'artifactKind', 'The citation artifact kind does not match.');
  const expectedUrl = canonicalizeAffiliateSportCitationPageUrl(citation.pageUrl);
  const artifactUrls = [artifact.sourceUrl, artifact.finalUrl]
    .filter((url): url is string => Boolean(url))
    .map(canonicalizeAffiliateSportCitationPageUrl);
  if (!artifactUrls.includes(expectedUrl)) throw sportCitationVerificationError(determinationIndex, citationIndex, 'pageUrl', 'The citation page URL does not match the stored artifact provenance.');
  const bytes = artifactBytes(artifact);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const storedHash = (artifact.contentHash ?? artifact.artifactSha256 ?? '').toLowerCase();
  if (hash !== citation.artifactSha256.toLowerCase() || (storedHash && hash !== storedHash)) {
    throw sportCitationVerificationError(determinationIndex, citationIndex, 'artifactSha256', 'The citation artifact bytes do not match the claimed SHA-256.');
  }
  if (citation.artifactKind !== 'PAGE_SCREENSHOT') {
    const text = normalizeCitationText(artifactText(artifact, bytes));
    const excerpt = normalizeCitationText(citation.excerpt);
    if (!excerpt || !text.includes(excerpt)) throw sportCitationVerificationError(determinationIndex, citationIndex, 'excerpt', 'The citation excerpt is not present in the stored artifact.');
  } else if (!citation.excerpt.trim()) {
    throw sportCitationVerificationError(determinationIndex, citationIndex, 'excerpt', 'A screenshot citation requires a visible observation.');
  }
};

const verifyAffiliateSportCompletionEvidence = async (
  input: AffiliateSportCompletionVerificationInput,
  dependencies: AffiliateSportCompletionVerificationDependencies,
): Promise<VerifiedAffiliateSportCompletion> => {
  const result = input.result;
  if (!result) throw new Error('Completion verification requires a version-2 producer result.');
  const resultKind = input.resultKind ?? (
    result.status === 'REVIEW_REQUIRED' || result.status === 'HUMAN_REVIEW_REQUIRED'
      ? result.status
      : 'REVIEW_REQUIRED'
  );
  const determinations = affiliateSportDeterminationsSchema.parse(
    input.determinations ?? result.sportDeterminations,
  );
  const claimContext = input.claimEvidenceContext;
  if (!claimContext) throw new Error('Completion verification requires persisted claim evidence context.');
  if (claimContext.evidenceRunId !== result.evidenceRunId) {
    throw new Error('Result evidence run does not match persisted claim evidence.');
  }
  if (input.expectedIntakeId && claimContext.intakeId && claimContext.intakeId !== input.expectedIntakeId) {
    throw new Error('Claim evidence intake does not match the claimed intake.');
  }
  const claimCatalog = affiliateSportsCatalogSnapshotSchema.parse(claimContext.sportsCatalog);
  const currentCatalog = dependencies.loadCurrentCatalog
    ? await dependencies.loadCurrentCatalog()
    : input.freshCatalog;
  if (!currentCatalog) throw new Error('Completion verification requires a fresh live catalog.');
  const freshCatalog = affiliateSportsCatalogSnapshotSchema.parse(currentCatalog);
  const catalogHashMatched = (
    result.sportsCatalogSha256.toLowerCase() === claimCatalog.sha256.toLowerCase()
    && result.sportsCatalogSha256.toLowerCase() === freshCatalog.sha256.toLowerCase()
  );
  if (!catalogHashMatched) {
    const error = new Error('SPORT_CATALOG_MISMATCH');
    error.name = 'SPORT_CATALOG_MISMATCH';
    throw error;
  }

  const reasonCodes = input.reasonCodes
    ?? result.humanReviewRequired?.reasonCodes
    ?? [];
  assertAffiliateSportCompletionReady({
    determinations,
    catalog: claimCatalog,
    resultKind,
    reasonCodes,
    humanResolution: input.humanResolution,
  });

  const artifactIds = Array.from(new Set(determinations.flatMap((determination) => (
    determination.evidence.map((citation) => citation.artifactId)
  ))));
  const artifacts = new Map<string, AffiliateSportCompletionStoredArtifact>();
  (input.artifacts ?? []).forEach((artifact) => artifacts.set(artifactIdentifier(artifact), artifact));
  if (dependencies.loadArtifacts) {
    const loaded = await dependencies.loadArtifacts(result.evidenceRunId, artifactIds);
    loaded.forEach((artifact) => artifacts.set(artifactIdentifier(artifact), artifact));
  }
  for (const artifactId of artifactIds) {
    if (!artifacts.has(artifactId) && dependencies.readArtifact) {
      artifacts.set(artifactId, await dependencies.readArtifact(result.evidenceRunId, artifactId));
    }
  }
  determinations.forEach((determination, determinationIndex) => determination.evidence.forEach((citation, citationIndex) => {
    const artifact = artifacts.get(citation.artifactId);
    if (!artifact) {
      throw new AffiliateSportVerificationError(
        ['sportDeterminations', determinationIndex, 'evidence', citationIndex, 'artifactId'],
        'The stored citation artifact was not found.',
      );
    }
    assertArtifactCitation(artifact, citation, result.evidenceRunId, input.expectedIntakeId, determinationIndex, citationIndex);
  }));

  const expectedSportNames = [...(input.expectedSportNames ?? resolvedAffiliateSportNameUnion(determinations))]
    .sort(compareStrings)
    .filter((name, index, all) => index === 0 || all[index - 1] !== name);
  const observedSportNames = [...(input.observedSportNames ?? input.sportQuality?.observedSportNames ?? expectedSportNames)]
    .sort(compareStrings)
    .filter((name, index, all) => index === 0 || all[index - 1] !== name);
  const unionMatches = expectedSportNames.length === observedSportNames.length
    && expectedSportNames.every((name, index) => name === observedSportNames[index]);
  if (!unionMatches || input.sportQuality && !input.sportQuality.passed) {
    throw new Error('Disposable sport quality did not prove the exact determination sport union.');
  }

  return {
    evidenceRunId: result.evidenceRunId,
    sportsCatalogSha256: result.sportsCatalogSha256,
    sportDeterminations: determinations,
    expectedSportNames,
    observedSportNames,
    catalogHashMatched: true,
    evidenceOwnershipPassed: true,
    determinationCoveragePassed: true,
  };
};

export function verifyAffiliateSportCompletion(
  input: Parameters<typeof assertAffiliateSportCompletionReady>[0],
): void;
export function verifyAffiliateSportCompletion(
  input: AffiliateSportCompletionVerificationInput,
  dependencies?: AffiliateSportCompletionVerificationDependencies,
): Promise<VerifiedAffiliateSportCompletion>;
export function verifyAffiliateSportCompletion(
  input: Parameters<typeof assertAffiliateSportCompletionReady>[0] | AffiliateSportCompletionVerificationInput,
  dependencies?: AffiliateSportCompletionVerificationDependencies,
): void | Promise<VerifiedAffiliateSportCompletion> {
  if (!dependencies && !('result' in input) && !('claimEvidenceContext' in input)) {
    assertAffiliateSportCompletionReady(input as Parameters<typeof assertAffiliateSportCompletionReady>[0]);
    return;
  }
  return verifyAffiliateSportCompletionEvidence(
    input as AffiliateSportCompletionVerificationInput,
    dependencies ?? {},
  );
}
