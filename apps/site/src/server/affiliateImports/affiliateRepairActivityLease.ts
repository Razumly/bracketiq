import { Client } from 'pg';
import { resolvePrismaPgPoolConfig } from '@/lib/prismaConfig';
import { advisoryLockId } from '@/server/repositories/locks';
import {
  AffiliatePendingRepairHoldError,
  type AffiliatePendingRepairSnapshot,
} from './affiliatePendingRepairGuard';

/** One global lease serializes ordinary source activity with repair writers. */
export const AFFILIATE_REPAIR_ACTIVITY_LOCK_ID = advisoryLockId(
  'affiliate:existing-data-repair:activity',
);
export const AFFILIATE_REPAIR_ACTIVITY_BUSY_REASON = 'AFFILIATE_REPAIR_ACTIVITY_BUSY';

export class AffiliateRepairActivityBusyError extends AffiliatePendingRepairHoldError {
  constructor(sourceId: string) {
    const snapshot: AffiliatePendingRepairSnapshot = {
      source: null,
      root: null,
      sourcePending: null,
      rootPending: null,
      reason: AFFILIATE_REPAIR_ACTIVITY_BUSY_REASON,
    };
    super(snapshot, sourceId);
    this.name = 'AffiliateRepairActivityBusyError';
  }
}

export class AffiliateRepairActivityLockUnavailableError extends Error {
  readonly code = 'AFFILIATE_REPAIR_ACTIVITY_LOCK_UNAVAILABLE';

  constructor(message = 'The affiliate repair activity advisory lock is unavailable.') {
    super(message);
    this.name = 'AffiliateRepairActivityLockUnavailableError';
  }
}

type AdvisoryLockRow = Readonly<{ locked?: unknown; unlocked?: unknown }>;

type TransactionRawClient = Readonly<{
  $queryRaw?: (
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
}>;

const booleanResultFromRows = (
  value: unknown,
  field: 'locked' | 'unlocked',
  message: string,
): boolean => {
  if (
    !Array.isArray(value)
    || value.length !== 1
    || value[0] === null
    || typeof value[0] !== 'object'
    || typeof (value[0] as AdvisoryLockRow)[field] !== 'boolean'
  ) {
    throw new AffiliateRepairActivityLockUnavailableError(message);
  }
  return (value[0] as AdvisoryLockRow)[field] as boolean;
};

const lockResultFromTransaction = (value: unknown): boolean =>
  booleanResultFromRows(
    value,
    'locked',
    'The transaction advisory lock query returned no boolean result.',
  );

const unlockResultFromSession = (value: { rows?: unknown }): boolean =>
  booleanResultFromRows(
    value.rows,
    'unlocked',
    'The affiliate repair activity unlock query returned an invalid result.',
  );

/**
 * Run ordinary source activity while holding the shared session advisory lock.
 * The dedicated pg client remains checked out for the complete action so the
 * lease covers provider access, identity reconciliation, and all side effects.
 */
export const withAffiliateRepairActivityLease = async <T>(
  sourceId: string,
  action: () => Promise<T>,
): Promise<T> => {
  const { max: _poolMax, ...clientConfig } = resolvePrismaPgPoolConfig();
  const client = new Client(clientConfig);
  let ended = false;
  const endClient = async (): Promise<void> => {
    if (ended) return;
    ended = true;
    await client.end();
  };

  try {
    await client.connect();
    const lockResult = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock_shared($1) AS locked',
      [AFFILIATE_REPAIR_ACTIVITY_LOCK_ID],
    );
    if (!booleanResultFromRows(
      lockResult.rows,
      'locked',
      'The affiliate repair activity lock query returned no boolean result.',
    )) {
      await endClient();
      throw new AffiliateRepairActivityBusyError(sourceId);
    }

    try {
      return await action();
    } finally {
      try {
        const unlockResult = await client.query<{ unlocked: boolean }>(
          'SELECT pg_advisory_unlock_shared($1) AS unlocked',
          [AFFILIATE_REPAIR_ACTIVITY_LOCK_ID],
        );
        if (!unlockResultFromSession(unlockResult)) {
          throw new AffiliateRepairActivityLockUnavailableError(
            'The affiliate repair activity advisory lock was not owned by its dedicated connection.',
          );
        }
      } finally {
        await endClient();
      }
    }
  } catch (error) {
    await endClient().catch(() => undefined);
    throw error;
  }
};

/**
 * Try to enter the exclusive repair-writer side of the shared lease. The
 * transaction receiver must expose Prisma's raw-query seam; an unavailable
 * seam is an error rather than permission to proceed without the lock.
 */
export const tryLockAffiliateRepairWrites = async (
  transaction: unknown,
): Promise<boolean> => {
  const rawClient = transaction as TransactionRawClient | null;
  if (!rawClient || typeof rawClient.$queryRaw !== 'function') {
    throw new AffiliateRepairActivityLockUnavailableError(
      'The transaction advisory lock query is unavailable.',
    );
  }
  const result = await rawClient.$queryRaw`
    SELECT pg_try_advisory_xact_lock(${AFFILIATE_REPAIR_ACTIVITY_LOCK_ID}) AS locked
  `;
  return lockResultFromTransaction(result);
};
