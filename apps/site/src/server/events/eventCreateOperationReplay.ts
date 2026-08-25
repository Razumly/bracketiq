import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  eventEditorCreateProposalSchema,
  eventEditorCreateResultSchema,
  type CreateEventEditorCommand,
  type EventEditorCreateProposal,
  type EventEditorCreateResult,
} from '@/contracts/eventEditor';
type PrismaLike = PrismaClient | Prisma.TransactionClient;


type CreateOperationRow = {
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
  eventId: string;
  responseStatus: number;
  responseJson: unknown;
  proposalJson: unknown;
  proposalRevision: string | null;
  proposalStatus: string;
  emailDelivery: string;
  updatedAt: Date;
};

type CreateOperationDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<CreateOperationRow | null>;
  createMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
};

export type EventCreateOperationProposal = {
  createOperationId: string;
  eventId: string;
  requestHash: string;
  proposal: EventEditorCreateProposal;
  result: EventEditorCreateResult | null;
  proposalStatus: string;
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
    result: EventEditorCreateResult | null;
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

export const eventEditorCreateRequestHash = (
  command: CreateEventEditorCommand,
): string => (
  createHash('sha256')
    .update(JSON.stringify(stableJsonSafe({
      contractVersion: command.contractVersion,
      hasScheduleProposalSupport:
        command.hasScheduleProposalSupport === true ? true : undefined,
      expectedRevisions: command.expectedRevisions,
      draft: command.draft,
      completion: command.completion,
    })))
    .digest('hex')
);

export const eventEditorProposalRevision = (
  proposal: Omit<EventEditorCreateProposal, 'proposalRevision'>,
): string => (
  createHash('sha256')
    .update(JSON.stringify(stableJsonSafe(proposal)))
    .digest('hex')
);


const CREATE_OPERATION_CLAIM_LEASE_MS = 30_000;
const selectOperation = {
  createOperationId: true,
  actorUserId: true,
  requestHash: true,
  eventId: true,
  responseStatus: true,
  responseJson: true,
  proposalJson: true,
  proposalRevision: true,
  proposalStatus: true,
  emailDelivery: true,
  updatedAt: true,
};

const loadOperation = async (
  client: PrismaLike,
  createOperationId: string,
): Promise<CreateOperationRow | null> => operationsFor(client).findUnique({
  where: { createOperationId },
  select: selectOperation,
});

const parseStoredResult = (row: CreateOperationRow): EventEditorCreateResult => {
  if (row.responseJson == null) {
    throw new EventCreateOperationIncompleteError();
  }
  return eventEditorCreateResultSchema.parse(row.responseJson);
};
const parseStoredProposal = (
  row: CreateOperationRow,
): EventEditorCreateProposal => {
  if (row.proposalJson == null) {
    throw new EventCreateOperationIncompleteError();
  }
  return eventEditorCreateProposalSchema.parse(row.proposalJson);
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
const isAbandonedClaim = (row: CreateOperationRow): boolean => {
  const updatedAt = row.updatedAt instanceof Date
    ? row.updatedAt.getTime()
    : Date.parse(String(row.updatedAt ?? ""));
  return (
    row.responseJson == null &&
    row.proposalJson == null &&
    row.proposalStatus === "NONE" &&
    row.emailDelivery === "PROCESSING" &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt >= CREATE_OPERATION_CLAIM_LEASE_MS
  );
};

const reclaimAbandonedClaim = async (params: {
  client: PrismaLike;
  row: CreateOperationRow;
  actorUserId: string;
  requestHash: string;
}): Promise<EventCreateOperationClaim | null> => {
  assertReplayIdentity(params.row, params.actorUserId, params.requestHash);
  if (!isAbandonedClaim(params.row)) return null;
  const reclaimed = await operationsFor(params.client).updateMany({
    where: {
      createOperationId: params.row.createOperationId,
      actorUserId: params.actorUserId,
      requestHash: params.requestHash,
      responseJson: null,
      proposalJson: null,
      proposalStatus: "NONE",
      emailDelivery: "PROCESSING",
      updatedAt: params.row.updatedAt,
    },
    data: { updatedAt: new Date() },
  });
  if (reclaimed.count !== 1) {
    const winner = await loadOperation(
      params.client,
      params.row.createOperationId,
    );
    if (!winner) throw new EventCreateOperationIncompleteError();
    return claimFor(winner, params.actorUserId, params.requestHash);
  }
  return {
    firstClaim: true,
    createOperationId: params.row.createOperationId,
    eventId: params.row.eventId,
    requestHash: params.requestHash,
    responseStatus: params.row.responseStatus,
    emailDelivery: "PROCESSING",
    result: null,
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
  if (existing) {
    const reclaimed = await reclaimAbandonedClaim({
      ...params,
      row: existing,
    });
    return reclaimed ?? claimFor(existing, params.actorUserId, params.requestHash);
  }

  const eventId = createId();
  const inserted = await operationsFor(params.client).createMany({
    data: {
      createOperationId: params.createOperationId,
      actorUserId: params.actorUserId,
      requestHash: params.requestHash,
      eventId,
      responseStatus: 201,
      responseJson: null,
      emailDelivery: "PROCESSING",
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
      emailDelivery: "PROCESSING",
      result: null,
    };
  }

  const winner = await loadOperation(params.client, params.createOperationId);
  if (!winner) throw new EventCreateOperationIncompleteError();
  const reclaimed = await reclaimAbandonedClaim({
    ...params,
    row: winner,
  });
  return reclaimed ?? claimFor(winner, params.actorUserId, params.requestHash);
};

export const completeEventEditorCreateOperation = async (params: {
  client: PrismaLike;
  createOperationId: string;
  result: EventEditorCreateResult;
  emailDelivery: string;
  proposalStatus?: string;
}): Promise<void> => {
  const parsed = eventEditorCreateResultSchema.parse(params.result);
  await operationsFor(params.client).update({
    where: { createOperationId: params.createOperationId },
    data: {
      responseStatus: 201,
      responseJson: stableJsonSafe(parsed),
      proposalStatus: params.proposalStatus ?? "NONE",
      emailDelivery: params.emailDelivery,
    },
  });
};
export const completeEventEditorCreateProposal = async (params: {
  client: PrismaLike;
  createOperationId: string;
  proposal: EventEditorCreateProposal;
}): Promise<void> => {
  const parsed = eventEditorCreateProposalSchema.parse(params.proposal);
  await operationsFor(params.client).update({
    where: { createOperationId: params.createOperationId },
    data: {
      responseStatus: 202,
      proposalJson: stableJsonSafe(parsed),
      proposalRevision: parsed.proposalRevision,
      proposalStatus: "PENDING",
      emailDelivery: "PROPOSED",
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

export const waitForEventEditorCreateProposal = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
  timeoutMs?: number;
}): Promise<EventCreateOperationProposal> => {
  const deadline = Date.now() + (params.timeoutMs ?? 30_000);
  while (Date.now() <= deadline) {
    const row = await loadOperation(params.client, params.createOperationId);
    if (!row) throw new EventCreateOperationIncompleteError();
    assertReplayIdentity(row, params.actorUserId, params.requestHash);
    if (row.proposalJson != null) {
      return {
        createOperationId: row.createOperationId,
        eventId: row.eventId,
        requestHash: row.requestHash,
        proposal: parseStoredProposal(row),
        result: row.responseJson == null ? null : parseStoredResult(row),
        proposalStatus: row.proposalStatus,
      };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new EventCreateOperationIncompleteError();
};

export const readEventEditorCreateProposal = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
}): Promise<EventCreateOperationProposal | null> => {
  const row = await loadOperation(params.client, params.createOperationId);
  if (!row) return null;
  assertReplayIdentity(row, params.actorUserId, params.requestHash);
  return row.proposalJson == null
    ? null
    : {
        createOperationId: row.createOperationId,
        eventId: row.eventId,
        requestHash: row.requestHash,
        proposal: parseStoredProposal(row),
        result: row.responseJson == null ? null : parseStoredResult(row),
        proposalStatus: row.proposalStatus,
      };
};

export const deleteEventEditorCreateOperation = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
  requestHash: string;
}): Promise<void> => {
  const row = await loadOperation(params.client, params.createOperationId);
  if (!row) return;
  assertReplayIdentity(row, params.actorUserId, params.requestHash);
  await operationsFor(params.client).delete({
    where: { createOperationId: params.createOperationId },
  });
};

export const readEventEditorCreateProposalForActor = async (params: {
  client: PrismaLike;
  createOperationId: string;
  actorUserId: string;
}): Promise<EventCreateOperationProposal | null> => {
  const row = await loadOperation(params.client, params.createOperationId);
  if (!row) return null;
  if (row.actorUserId !== params.actorUserId) {
    throw new EventCreateOperationConflictError();
  }
  return row.proposalJson == null
    ? null
    : {
        createOperationId: row.createOperationId,
        eventId: row.eventId,
        requestHash: row.requestHash,
        proposal: parseStoredProposal(row),
        result: row.responseJson == null ? null : parseStoredResult(row),
        proposalStatus: row.proposalStatus,
      };
};
