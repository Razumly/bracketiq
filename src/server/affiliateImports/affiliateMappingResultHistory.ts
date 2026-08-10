import { z } from 'zod';
import { stableAgentArtifactSha256 } from './agentContracts';

/**
 * These fields are the append-only histories currently carried by a mapping
 * result. Suffix matching below intentionally permits a future history field
 * without requiring this module to be changed before the queue can preserve
 * it.
 */
export const AFFILIATE_MAPPING_RESULT_HISTORY_FIELDS = [
  'approvalCycleHistory',
  'approvalHandoffRetryHistory',
  'domainPolicyApprovalReviewHistory',
  'mappingFullReviewHistory',
  'mappingRepairHistory',
  'sportCatalogRefreshHistory',
  'sportReconciliationHistory',
  'sportResolutionHistory',
] as const;

export type AffiliateMappingResultHistoryField =
  | typeof AFFILIATE_MAPPING_RESULT_HISTORY_FIELDS[number]
  | (string & {});

export type AffiliateMappingResultEnvelope = Record<string, unknown>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const historyFieldSchema = z.string().trim().min(1).regex(
  /history$/i,
  'History fields must end with History.',
);

export const affiliateMappingHistoryPrefixSchema = z.object({
  field: historyFieldSchema,
  count: z.number().int().nonnegative(),
  sha256: sha256Schema,
}).strict();

export type AffiliateMappingHistoryPrefix = z.infer<
  typeof affiliateMappingHistoryPrefixSchema
>;

/**
 * An archived envelope is deliberately open-ended: result-summary fields are
 * owned by the producer/reviewer contracts, while this module owns only the
 * history-prefix metadata. `historyPrefixes` is the sole reserved key.
 */
export type ArchivedAffiliateMappingResultEnvelope = AffiliateMappingResultEnvelope & {
  historyPrefixes: AffiliateMappingHistoryPrefix[];
};

export const affiliateArchivedMappingResultEnvelopeSchema = z.object({
  historyPrefixes: z.array(affiliateMappingHistoryPrefixSchema),
}).passthrough();

const HISTORY_PREFIXES_FIELD = 'historyPrefixes';

const codeUnitCompare = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const jsonObjectSchema = z.record(z.string(), z.unknown());

const recordValue = (value: unknown): Record<string, unknown> | null => {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const isHistoryField = (field: string): boolean => (
  field !== HISTORY_PREFIXES_FIELD && (field === 'history' || /History$/i.test(field))
);

const cloneValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cloneValue);
  const record = recordValue(value);
  if (record) {
    return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, cloneValue(nested)]));
  }
  return value;
};

const nestedHistoryPath = (value: unknown, path: string): string | null => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = nestedHistoryPath(value[index], `${path}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }
  const record = recordValue(value);
  if (!record) return null;

  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedPath = path ? `${path}.${key}` : key;
    if (isHistoryField(key)) return nestedPath;
    const nested = nestedHistoryPath(nestedValue, nestedPath);
    if (nested) return nested;
  }
  return null;
};

const assertNoNestedHistory = (value: unknown, path: string): void => {
  const nested = nestedHistoryPath(value, path);
  if (nested) {
    throw new Error(`Mapping result history is recursive at ${nested}.`);
  }
};

const historyFieldsFromEnvelope = (envelope: AffiliateMappingResultEnvelope): string[] => (
  Object.keys(envelope)
    .filter(isHistoryField)
    .sort(codeUnitCompare)
);
const assertCurrentEnvelope = (value: unknown): AffiliateMappingResultEnvelope => {
  const envelope = recordValue(value);
  if (!envelope) throw new Error('Mapping result envelope must be an object.');
  if (Object.prototype.hasOwnProperty.call(envelope, HISTORY_PREFIXES_FIELD)) {
    throw new Error('A current mapping result envelope cannot contain historyPrefixes.');
  }

  for (const [field, history] of Object.entries(envelope)) {
    if (!isHistoryField(field)) {
      assertNoNestedHistory(history, field);
      continue;
    }
    if (!Array.isArray(history)) {
      throw new Error(`Mapping result history field ${field} must be an array.`);
    }
    history.forEach((entry, index) => {
      assertNoNestedHistory(entry, `${field}[${index}]`);
    });
  }
  return envelope;
};

const historyPrefixFor = (
  field: string,
  history: readonly unknown[],
): AffiliateMappingHistoryPrefix => affiliateMappingHistoryPrefixSchema.parse({
  field,
  count: history.length,
  sha256: stableAgentArtifactSha256(history),
});

const stripHistory = (value: AffiliateMappingResultEnvelope): AffiliateMappingResultEnvelope => {
  const result: AffiliateMappingResultEnvelope = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === HISTORY_PREFIXES_FIELD || isHistoryField(key)) continue;
    result[key] = cloneValue(nested);
  }
  return result;
};

const prefixesFor = (envelope: AffiliateMappingResultEnvelope): AffiliateMappingHistoryPrefix[] => (
  historyFieldsFromEnvelope(envelope).map((field) => (
    historyPrefixFor(field, envelope[field] as readonly unknown[])
  ))
);

/**
 * Archive one complete prior result without copying any append-only history
 * array into the archive. The arrays remain at the result-summary top level;
 * each archive retains only a count and content hash for each array prefix.
 */
export const archiveAffiliateMappingResultEnvelope = (
  value: AffiliateMappingResultEnvelope,
): ArchivedAffiliateMappingResultEnvelope => {
  const envelope = assertCurrentEnvelope(value);
  const archived = stripHistory(envelope) as ArchivedAffiliateMappingResultEnvelope;
  archived.historyPrefixes = prefixesFor(envelope);
  return archived;
};

const parseArchivedEnvelope = (
  value: unknown,
): ArchivedAffiliateMappingResultEnvelope => {
  const archivedValue = recordValue(value);
  if (!archivedValue) throw new Error('Archived mapping result envelope must be an object.');
  const prefixesValue = archivedValue[HISTORY_PREFIXES_FIELD];
  if (!Array.isArray(prefixesValue)) {
    throw new Error('Archived mapping result envelope must contain historyPrefixes.');
  }
  for (const [key, nested] of Object.entries(archivedValue)) {
    if (key === HISTORY_PREFIXES_FIELD) continue;
    if (isHistoryField(key)) {
      throw new Error(`Archived mapping result envelope contains history field ${key}.`);
    }
    assertNoNestedHistory(nested, key);
  }
  const parsedPrefixes = prefixesValue
    .map((prefix) => affiliateMappingHistoryPrefixSchema.parse(prefix));
  const prefixes = [...parsedPrefixes].sort(
    (left, right) => codeUnitCompare(left.field, right.field),
  );
  if (parsedPrefixes.some((prefix, index) => prefix.field !== prefixes[index].field)) {
    throw new Error('Archived mapping result history prefixes must be sorted by field.');
  }
  const fields = prefixes.map((prefix) => prefix.field);
  if (new Set(fields).size !== fields.length) {
    throw new Error('Archived mapping result envelope contains duplicate history prefixes.');
  }
  if (prefixes.some((prefix) => prefix.field === HISTORY_PREFIXES_FIELD)) {
    throw new Error('historyPrefixes cannot describe itself.');
  }

  return {
    ...stripHistory(archivedValue),
    historyPrefixes: prefixes,
  };
};

/**
 * Verify a full result against an archived prior envelope. With one argument,
 * this performs the local nonrecursive-history check only. The boolean form is
 * useful at persistence boundaries; `assertAffiliateMappingResultHistory`
 * provides the throwing form for callers that need a detailed failure.
 */
export const verifyAffiliateMappingResultHistory = (
  value: unknown,
  archived?: unknown,
): boolean => {
  try {
    const candidate = recordValue(value);
    if (!candidate) return false;
    if (archived === undefined) {
      if (Object.prototype.hasOwnProperty.call(candidate, HISTORY_PREFIXES_FIELD)) {
        parseArchivedEnvelope(candidate);
      } else {
        assertCurrentEnvelope(candidate);
      }
      return true;
    }
    const envelope = assertCurrentEnvelope(candidate);
    const parsedArchived = parseArchivedEnvelope(archived);
    if (stableAgentArtifactSha256(stripHistory(envelope))
      !== stableAgentArtifactSha256(stripHistory(parsedArchived))) return false;
    const currentFields = historyFieldsFromEnvelope(envelope);
    const archivedFields = parsedArchived.historyPrefixes.map((prefix) => prefix.field);
    if (new Set(archivedFields).size !== archivedFields.length) return false;
    if (currentFields.length < archivedFields.length) return false;
    return parsedArchived.historyPrefixes.every((prefix) => {
      const currentHistory = envelope[prefix.field];
      if (!Array.isArray(currentHistory) || currentHistory.length < prefix.count) return false;
      return stableAgentArtifactSha256(currentHistory.slice(0, prefix.count)) === prefix.sha256;
    });
  } catch {
    return false;
  }
};

export const assertAffiliateMappingResultHistory = (
  value: unknown,
  archived?: unknown,
): void => {
  if (!verifyAffiliateMappingResultHistory(value, archived)) {
    throw new Error('Mapping result history is invalid or does not match its archived envelope.');
  }
};

export interface AppendAffiliateMappingResultHistoryInput {
  envelope: AffiliateMappingResultEnvelope;
  field: AffiliateMappingResultHistoryField;
  entry: unknown;
}

type AppendAffiliateMappingResultHistoryEntryInput = Omit<
  AppendAffiliateMappingResultHistoryInput,
  'envelope'
>;

function appendAffiliateMappingResultHistory(
  input: AppendAffiliateMappingResultHistoryInput,
): AffiliateMappingResultEnvelope;
function appendAffiliateMappingResultHistory(
  envelope: AffiliateMappingResultEnvelope,
  input: AppendAffiliateMappingResultHistoryEntryInput,
): AffiliateMappingResultEnvelope;
function appendAffiliateMappingResultHistory(
  envelope: AffiliateMappingResultEnvelope,
  field: AffiliateMappingResultHistoryField,
  entry: unknown,
): AffiliateMappingResultEnvelope;
function appendAffiliateMappingResultHistory(
  inputOrEnvelope: AppendAffiliateMappingResultHistoryInput | AffiliateMappingResultEnvelope,
  field?: AffiliateMappingResultHistoryField | AppendAffiliateMappingResultHistoryEntryInput,
  entry?: unknown,
): AffiliateMappingResultEnvelope {
  const input: AppendAffiliateMappingResultHistoryInput = field === undefined
    ? inputOrEnvelope as AppendAffiliateMappingResultHistoryInput
    : typeof field === 'object'
      ? { envelope: inputOrEnvelope as AffiliateMappingResultEnvelope, ...field }
      : { envelope: inputOrEnvelope as AffiliateMappingResultEnvelope, field, entry };
  if (!isHistoryField(input.field)) {
    throw new Error(`Invalid mapping result history field: ${input.field}.`);
  }
  const envelope = assertCurrentEnvelope(input.envelope);
  assertNoNestedHistory(input.entry, `${input.field}[new]`);
  const current = envelope[input.field];
  if (current !== undefined && !Array.isArray(current)) {
    throw new Error(`Mapping result history field ${input.field} must be an array.`);
  }
  const updated: AffiliateMappingResultEnvelope = Object.fromEntries(
    Object.entries(envelope).map(([key, value]) => [key, cloneValue(value)]),
  );
  updated[input.field] = [
    ...(Array.isArray(current) ? current.map(cloneValue) : []),
    cloneValue(input.entry),
  ];
  assertCurrentEnvelope(updated);
  return updated;
}

export { appendAffiliateMappingResultHistory };

/** Alias retained for queue/reconciliation call sites that name the operation as a history append. */
export const appendAffiliateMappingHistory = appendAffiliateMappingResultHistory;

/** Return the deterministic hash used for a history prefix. */
export const affiliateMappingHistorySha256 = (history: readonly unknown[]): string => (
  stableAgentArtifactSha256(history)
);

/** Return the sorted prefix metadata for a current result envelope. */
export const affiliateMappingResultHistoryPrefixes = (
  value: AffiliateMappingResultEnvelope,
): AffiliateMappingHistoryPrefix[] => {
  const envelope = assertCurrentEnvelope(value);
  return prefixesFor(envelope);
};
/** Descriptive aliases for callers that use the full result-history name. */
export const affiliateMappingResultHistoryPrefixSchema = affiliateMappingHistoryPrefixSchema;
export const affiliateMappingResultHistoryArchiveSchema = affiliateArchivedMappingResultEnvelopeSchema;

export const affiliateMappingResultHistorySha256 = affiliateMappingHistorySha256;
export const appendAffiliateMappingResultHistoryEntry = appendAffiliateMappingResultHistory;
export const verifyAffiliateMappingResultEnvelopeHistory = verifyAffiliateMappingResultHistory;
