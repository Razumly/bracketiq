import {
  affiliateExistingDataRepairCorrectionHoldsMatch,
  correctionHoldForMetadata,
  hasAffiliateExistingDataRepairCorrectionHold,
  pendingMappingForMetadata,
  pendingMappingHash,
  type AffiliateExistingDataRepairCorrectionHold,
  type AffiliateExistingDataRepairPendingMapping,
} from './affiliateExistingDataRepairState';

const PENDING_MAPPING_METADATA_KEY = 'pendingMapping';

type AffiliatePendingRepairRow = Readonly<{
  id?: string;
  name?: string | null;
  sourceKey?: string | null;
  supplySourceId?: string | null;
  updatedAt?: Date | string | null;
  metadata?: unknown;
}>;

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
const hasPendingMappingField = (metadata: unknown): boolean => (
  Object.prototype.hasOwnProperty.call(recordValue(metadata), PENDING_MAPPING_METADATA_KEY)
);

type CorrectionPointer = Readonly<{
  present: boolean;
  hold: AffiliateExistingDataRepairCorrectionHold | null;
}>;

const correctionPointerFor = (metadata: unknown): CorrectionPointer => ({
  present: hasAffiliateExistingDataRepairCorrectionHold(metadata),
  hold: correctionHoldForMetadata(metadata),
});

type PendingPointer = Readonly<{
  present: boolean;
  pending: AffiliateExistingDataRepairPendingMapping | null;
}>;
const pendingPointerFor = (metadata: unknown): PendingPointer => ({
  present: hasPendingMappingField(metadata),
  pending: pendingMappingForMetadata(metadata),
});

export type AffiliatePendingRepairSnapshot = Readonly<{
  source: AffiliatePendingRepairRow | null;
  root: AffiliatePendingRepairRow | null;
  sourcePending: AffiliateExistingDataRepairPendingMapping | null;
  rootPending: AffiliateExistingDataRepairPendingMapping | null;
  sourceCorrectionHold: AffiliateExistingDataRepairCorrectionHold | null;
  rootCorrectionHold: AffiliateExistingDataRepairCorrectionHold | null;
  reason: string | null;
}>;

export type AffiliatePendingRepairDatabase = Readonly<{
  affiliateScrapeSources?: {
    findUnique?: (args: unknown) => Promise<AffiliatePendingRepairRow | null>;
  };
  affiliateSupplySources?: {
    findUnique?: (args: unknown) => Promise<AffiliatePendingRepairRow | null>;
    findFirst?: (args: unknown) => Promise<AffiliatePendingRepairRow | null>;
  };
  sources?: {
    findUnique?: (args: unknown) => Promise<AffiliatePendingRepairRow | null>;
  };
  supplySources?: {
    findUnique?: (args: unknown) => Promise<AffiliatePendingRepairRow | null>;
    findFirst?: (args: unknown) => Promise<AffiliatePendingRepairRow | null>;
  };
}>;

type PendingRepairSnapshotInput = Readonly<{
  sourceId: string;
  supplySourceId?: string | null;
  sourceMetadata?: unknown;
  rootId?: string | null;
  rootMetadata?: unknown;
}>;

const normalizedIdentifier = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const correctionHoldReasonFor = (input: PendingRepairSnapshotInput): string | null => {
  const sourcePointer = correctionPointerFor(input.sourceMetadata);
  const rootPointer = correctionPointerFor(input.rootMetadata);
  const sourceHold = sourcePointer.hold;
  const rootHold = rootPointer.hold;
  if ((sourcePointer.present && !sourceHold) || (rootPointer.present && !rootHold)) {
    return 'MALFORMED_EXISTING_DATA_REPAIR_CORRECTION_HOLD';
  }
  if (!sourcePointer.present && !rootPointer.present) return null;

  const expectedSourceId = normalizedIdentifier(input.sourceId);
  const expectedRootId = normalizedIdentifier(input.rootId ?? input.supplySourceId);
  for (const hold of [sourceHold, rootHold]) {
    if (!hold) continue;
    if (
      hold.sourceId !== expectedSourceId
      || (expectedRootId !== null && hold.supplySourceId !== expectedRootId)
    ) {
      return 'MISMATCHED_EXISTING_DATA_REPAIR_CORRECTION_HOLD';
    }
  }
  if (sourceHold && rootHold && !affiliateExistingDataRepairCorrectionHoldsMatch(sourceHold, rootHold)) {
    return 'MISMATCHED_EXISTING_DATA_REPAIR_CORRECTION_HOLD';
  }
  return 'EXISTING_DATA_REPAIR_CORRECTION_HOLD';
};

/**
 * Return the server-owned repair hold for a source/root pair.
 *
 * A present pointer always blocks work. A malformed pointer blocks work too.
 * The source and root pointers must describe the same repair and must bind to
 * the rows that carry them. The guard deliberately does not inspect working
 * status or automation fields.
 */
export const affiliatePendingRepairReasonFor = (
  input: PendingRepairSnapshotInput,
): string | null => {
  const correctionReason = correctionHoldReasonFor(input);
  if (correctionReason) return correctionReason;
  const sourcePointer = pendingPointerFor(input.sourceMetadata);
  const rootPointer = pendingPointerFor(input.rootMetadata);
  const sourcePending = sourcePointer.pending;
  const rootPending = rootPointer.pending;

  if ((sourcePointer.present && !sourcePending) || (rootPointer.present && !rootPending)) {
    return 'MALFORMED_PENDING_EXISTING_DATA_REPAIR';
  }
  if (!sourcePointer.present && !rootPointer.present) return null;

  const expectedSourceId = normalizedIdentifier(input.sourceId);
  const expectedRootId = normalizedIdentifier(input.rootId ?? input.supplySourceId);
  for (const pending of [sourcePending, rootPending]) {
    if (!pending) continue;
    if (
      pending.sourceId !== expectedSourceId
      || (expectedRootId !== null && pending.supplySourceId !== expectedRootId)
    ) {
      return 'MISMATCHED_PENDING_EXISTING_DATA_REPAIR';
    }
  }

  if (sourcePending && rootPending && pendingMappingHash(sourcePending) !== pendingMappingHash(rootPending)) {
    return 'MISMATCHED_PENDING_EXISTING_DATA_REPAIR';
  }
  return 'PENDING_EXISTING_DATA_REPAIR';
};

const sourceDelegateFor = (database: AffiliatePendingRepairDatabase) => (
  database.affiliateScrapeSources ?? database.sources
);

const rootDelegateFor = (database: AffiliatePendingRepairDatabase) => (
  database.affiliateSupplySources ?? database.supplySources
);

export const readAffiliatePendingRepairSnapshot = async (input: Readonly<{
  database: AffiliatePendingRepairDatabase;
  sourceId: string;
  expectedSupplySourceId?: string | null;
  fallbackSource?: AffiliatePendingRepairRow | null;
  fallbackRoot?: AffiliatePendingRepairRow | null;
}>): Promise<AffiliatePendingRepairSnapshot> => {
  const sourceDelegate = sourceDelegateFor(input.database);
  const source = sourceDelegate?.findUnique
    ? await sourceDelegate.findUnique({ where: { id: input.sourceId } })
    : input.fallbackSource ?? null;
  const sourceSupplySourceId = normalizedIdentifier(source?.supplySourceId);
  const expectedSupplySourceId = normalizedIdentifier(input.expectedSupplySourceId);
  const rootId = sourceSupplySourceId ?? expectedSupplySourceId;
  const rootDelegate = rootDelegateFor(input.database);
  let root = input.fallbackRoot ?? null;
  if (!root && rootId && rootDelegate?.findUnique) {
    root = await rootDelegate.findUnique({ where: { id: rootId } });
  }
  if (!root && !rootId && rootDelegate?.findFirst) {
    root = await rootDelegate.findFirst({
      where: { liveSourceId: input.sourceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  const reason = affiliatePendingRepairReasonFor({
    sourceId: input.sourceId,
    supplySourceId: sourceSupplySourceId ?? expectedSupplySourceId,
    sourceMetadata: source?.metadata,
    rootId: root?.id ?? rootId,
    rootMetadata: root?.metadata,
  });
  if (
    !reason
    && expectedSupplySourceId !== null
    && expectedSupplySourceId !== undefined
    && sourceSupplySourceId !== null
    && sourceSupplySourceId !== expectedSupplySourceId
  ) {
    return {
      source,
      root,
      sourcePending: pendingPointerFor(source?.metadata).pending,
      rootPending: pendingPointerFor(root?.metadata).pending,
      sourceCorrectionHold: correctionPointerFor(source?.metadata).hold,
      rootCorrectionHold: correctionPointerFor(root?.metadata).hold,
      reason: 'MISMATCHED_PENDING_EXISTING_DATA_REPAIR',
    };
  }
  return {
    source,
    root,
    sourcePending: pendingPointerFor(source?.metadata).pending,
    rootPending: pendingPointerFor(root?.metadata).pending,
    sourceCorrectionHold: correctionPointerFor(source?.metadata).hold,
    rootCorrectionHold: correctionPointerFor(root?.metadata).hold,
    reason,
  };
};

export class AffiliatePendingRepairHoldError extends Error {
  readonly reason: string;
  readonly sourceId: string;
  readonly sourceName: string | null;
  readonly sourceKey: string | null;

  constructor(snapshot: AffiliatePendingRepairSnapshot, sourceId: string) {
    super(snapshot.reason ?? 'PENDING_EXISTING_DATA_REPAIR');
    this.name = 'AffiliatePendingRepairHoldError';
    this.reason = snapshot.reason ?? 'PENDING_EXISTING_DATA_REPAIR';
    this.sourceId = sourceId;
    this.sourceName = normalizedIdentifier(snapshot.source?.name);
    this.sourceKey = normalizedIdentifier(snapshot.source?.sourceKey);
  }
}

export const assertAffiliatePendingRepairClear = async (input: Readonly<{
  database: AffiliatePendingRepairDatabase;
  sourceId: string;
  expectedSupplySourceId?: string | null;
  fallbackSource?: AffiliatePendingRepairRow | null;
  fallbackRoot?: AffiliatePendingRepairRow | null;
}>): Promise<AffiliatePendingRepairSnapshot> => {
  const snapshot = await readAffiliatePendingRepairSnapshot(input);
  if (snapshot.reason) throw new AffiliatePendingRepairHoldError(snapshot, input.sourceId);
  return snapshot;
};
