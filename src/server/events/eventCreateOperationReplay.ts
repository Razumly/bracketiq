import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  eventEditorSaveResultSchema,
  type CreateEventEditorCommand,
  type EventEditorSaveResult,
} from '@/contracts/eventEditor';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type CreateOperationRow = {
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
  eventId: string;
  responseStatus: number;
  responseJson: unknown;
  emailDelivery: string;
};

type CreateOperationDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<CreateOperationRow | null>;
  createMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

type EventCreateOperationClaimBase = {
  createOperationId: string;
  eventId: string;
  requestHash: string;
  responseStatus: number;
  emailDelivery: string;
};

export type EventCreateOperationClaim =
  | (EventCreateOperationClaimBase & {
    firstClaim: true;
    result: null;
  })
  | (EventCreateOperationClaimBase & {
    firstClaim: false;
    result: EventEditorSaveResult | null;
  });

export class EventCreateOperationPayloadMismatchError extends Error {
  constructor() {
    super('The create operation ID was already used for a different payload.');
    this.name = 'EventCreateOperationPayloadMismatchError';
  }
}

export class EventCreateOperationConflictError extends Error {
  constructor() {
    super('The create operation ID cannot be used.');
    this.name = 'EventCreateOperationConflictError';
  }
}

export class EventCreateOperationIncompleteError extends Error {
  constructor() {
    super('The create operation is still being resolved. Retry the exact create request.');
    this.name = 'EventCreateOperationIncompleteError';
  }
}

const operationsFor = (client: PrismaLike): CreateOperationDelegate => (
  (client as PrismaLike & { eventEditorCreateOperations: CreateOperationDelegate }).eventEditorCreateOperations
);

const stableJsonSafe = (value: unknown): unknown => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) return value.map((entry) => stableJsonSafe(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonSafe(entry)]),
    );
  }
  return value;
};

export const eventEditorCreateRequestHash = (command: CreateEventEditorCommand): string => (
  createHash('sha256')
    .update(JSON.stringify(stableJsonSafe({
      contractVersion: command.contractVersion,
      draft: command.draft,
    })))
    .digest('hex')
);

const selectOperation = {
  createOperationId: true,
  actorUserId: true,
  requestHash: true,
  eventId: true,
  responseStatus: true,
  responseJson: true,
  emailDelivery: true,
};

const loadOperation = async (
  client: PrismaLike,
  createOperationId: string,
): Promise<CreateOperationRow | null> => operationsFor(client).findUnique({
  where: { createOperationId },
  select: selectOperation,
});

const parseStoredResult = (row: CreateOperationRow): EventEditorSaveResult => {
  if (row.responseJson == null) {
    throw new EventCreateOperationIncompleteError();
  }
  return eventEditorSaveResultSchema.parse(row.responseJson);
};

const assertReplayIdentity = (
  row: CreateOperationRow,
  actorUserId: string,
  requestHash: string,
): void => {
  if (row.actorUserId !== actorUserId) throw new EventCreateOperationConflictError();
  if (row.requestHash !== requestHash) throw new EventCreateOperationPayloadMismatchError();
};

const claimFor = (
  row: CreateOperationRow,
  actorUserId: string,
  requestHash: string,
): EventCreateOperationClaim => {
  assertReplayIdentity(row, actorUserId, requestHash);
  const replayReady = row.responseJson != null && row.emailDelivery !== 'PROCESSING';
  return {
    firstClaim: false,
    createOperationId: row.createOperationId,
    eventId: row.eventId,
    requestHash,
    responseStatus: row.responseStatus,
    emailDelivery: row.emailDelivery,
    result: replayReady ? parseStoredResult(row) : null,
  };
};

/**
 * Atomically claims one create operation. The operation row is created in the
 * caller's event transaction, so a domain failure rolls the claim back too.
 */
export const claimEventEditorCreateOperation = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
}): Promise<EventCreateOperationClaim> => {
  const existing = await loadOperation(params.client, params.createOperationId);
  if (existing) return claimFor(existing, params.actorUserId, params.requestHash);

  const eventId = createId();
  const inserted = await operationsFor(params.client).createMany({
    data: {
      createOperationId: params.createOperationId,
      actorUserId: params.actorUserId,
      requestHash: params.requestHash,
      eventId,
      responseStatus: 201,
      responseJson: null,
      emailDelivery: 'PROCESSING',
    },
    skipDuplicates: true,
  });
  if (inserted.count > 0) {
    return {
      firstClaim: true,
      createOperationId: params.createOperationId,
      eventId,
      requestHash: params.requestHash,
      responseStatus: 201,
      emailDelivery: 'PROCESSING',
      result: null,
    };
  }

  const winner = await loadOperation(params.client, params.createOperationId);
  if (!winner) throw new EventCreateOperationIncompleteError();
  return claimFor(winner, params.actorUserId, params.requestHash);
};

export const completeEventEditorCreateOperation = async (params: {
  client: PrismaLike;
  createOperationId: string;
  result: EventEditorSaveResult;
  emailDelivery: string;
}): Promise<void> => {
  const parsed = eventEditorSaveResultSchema.parse(params.result);
  await operationsFor(params.client).update({
    where: { createOperationId: params.createOperationId },
    data: {
      responseStatus: 201,
      responseJson: stableJsonSafe(parsed),
      emailDelivery: params.emailDelivery,
    },
  });
};

/**
 * Waits for the first claimant to finish writing the canonical result and
 * terminal post-commit metadata. A committed result remains available as a
 * recovery fallback when the process that owns the operation stops before
 * delivery completes.
 */
export const waitForEventEditorCreateOperation = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
  timeoutMs?: number;
  returnCommittedResultOnTimeout?: boolean;
}): Promise<EventCreateOperationClaim> => {
  const deadline = Date.now() + (params.timeoutMs ?? 30_000);
  while (Date.now() <= deadline) {
    const row = await loadOperation(params.client, params.createOperationId);
    if (!row) throw new EventCreateOperationIncompleteError();
    assertReplayIdentity(row, params.actorUserId, params.requestHash);
    if (row.responseJson != null && row.emailDelivery !== 'PROCESSING') {
      return claimFor(row, params.actorUserId, params.requestHash);
    }
    const promise = new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    await promise;
  }
  if (params.returnCommittedResultOnTimeout) {
    const row = await loadOperation(params.client, params.createOperationId);
    if (row) {
      assertReplayIdentity(row, params.actorUserId, params.requestHash);
      if (row.responseJson != null) {
        const committedClaim = claimFor(row, params.actorUserId, params.requestHash);
        return {
          firstClaim: false,
          createOperationId: committedClaim.createOperationId,
          eventId: committedClaim.eventId,
          requestHash: committedClaim.requestHash,
          responseStatus: committedClaim.responseStatus,
          emailDelivery: committedClaim.emailDelivery,
          result: parseStoredResult(row),
        };
      }
    }
  }
  throw new EventCreateOperationIncompleteError();
};

export const readEventEditorCreateOperation = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
}): Promise<EventCreateOperationClaim | null> => {
  const row = await loadOperation(params.client, params.createOperationId);
  return row ? claimFor(row, params.actorUserId, params.requestHash) : null;
};
