/** @jest-environment node */

import { eventEditorFixtures } from '@/test/eventEditor/fixtures';
import { legacyEventToEditorDraft } from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import {
  claimEventEditorCreateOperation,
  completeEventEditorCreateOperation,
  eventEditorCreateRequestHash,
  EventCreateOperationConflictError,
  EventCreateOperationPayloadMismatchError,
  waitForEventEditorCreateOperation,
} from '../eventCreateOperationReplay';

const operationRow = (overrides: Record<string, unknown> = {}) => ({
  createOperationId: 'create-operation-1',
  actorUserId: 'user-1',
  requestHash: 'hash-1',
  eventId: 'event-1',
  responseStatus: 201,
  responseJson: null,
  emailDelivery: 'PROCESSING',
  ...overrides,
});

const createClient = (initialRows: Array<Record<string, unknown>> = []) => {
  const rows = new Map(initialRows.map((row) => [String(row.createOperationId), row]));
  const operations = {
    findUnique: jest.fn(async ({ where }: any) => rows.get(String(where.createOperationId)) ?? null),
    createMany: jest.fn(async ({ data }: any) => {
      if (rows.has(String(data.createOperationId))) return { count: 0 };
      rows.set(String(data.createOperationId), { ...data });
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(String(where.createOperationId));
      if (!row) throw new Error('operation not found');
      Object.assign(row, data);
      return row;
    }),
  };
  return { eventEditorCreateOperations: operations, rows } as any;
};

const draft = legacyEventToEditorDraft(eventEditorFixtures[0].event);
const command = {
  contractVersion: 3 as const,
  createOperationId: 'create-operation-1',
  expectedRevisions: {
    editorRevision: 'new',
    staffRevision: null,
    scheduleRevision: 'new',
  },
  draft,
  completion: { mode: 'CREATE_ONLY' as const },
};
const result = {
  status: 'SAVED' as const,
  createOperationId: 'create-operation-1',
  editorRevision: 'revision-1',
  staffRevision: 'staff-revision-1',
  scheduleRevision: 'schedule-revision-1',
  snapshot: {
    contractVersion: 3 as const,
    draft,
    mode: 'EDIT' as const,
    eventId: 'event-1',
    editorRevision: 'revision-1',
    staffRevision: 'staff-revision-1',
    capabilities: {
      canUseOnlinePayments: true,
      canManageStaff: true,
      canEdit: true,
      canDelegateHost: true,
      readOnly: false,
      readOnlyReason: null,
      managementAuthority: null,
      eventHostId: 'host-1',
      viewerIsEventHost: true,
      supportsTeamStaffing: true,
    },
    catalogs: { sports: [], organizations: [], fields: [], templates: [] },
    immutable: { fieldNames: [], rental: false, template: false },
    scheduleState: {
      sourceType: null,
      matchCount: 0,
      revision: 'schedule-revision-1',
      hasProtectedHistory: false,
    },
  },
  questionIdMap: {},
  staffEmailDelivery: 'QUEUED' as const,
  scheduleOutcome: {
    status: 'NOT_REQUESTED' as const,
    matchCount: 0,
    warnings: [],
  },
};

const reorderObjectKeys = (value: any): any => {
  if (Array.isArray(value)) return value.map(reorderObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reorderObjectKeys(child)]),
  );
};

describe('event editor create operation replay', () => {
  it('keeps legacy request hashes stable when proposal support is absent or disabled', () => {
    expect(eventEditorCreateRequestHash(command)).toBe(
      eventEditorCreateRequestHash({
        ...command,
        hasScheduleProposalSupport: false,
      }),
    );
    expect(eventEditorCreateRequestHash(command)).not.toBe(
      eventEditorCreateRequestHash({
        ...command,
        hasScheduleProposalSupport: true,
      }),
    );
  });

  it('hashes semantically identical object key order identically but preserves array order', () => {
    const reordered = {
      ...command,
      draft: reorderObjectKeys(command.draft),
    };
    expect(eventEditorCreateRequestHash(command)).toBe(eventEditorCreateRequestHash(reordered));

    const arrayOrderBase = {
      ...command,
      draft: {
        ...command.draft,
        basics: {
          ...command.draft.basics,
          sportIds: ['sport-a', 'sport-b'],
        },
      },
    };
    const changedArrayOrder = {
      ...arrayOrderBase,
      draft: {
        ...arrayOrderBase.draft,
        basics: {
          ...arrayOrderBase.draft.basics,
          sportIds: [...arrayOrderBase.draft.basics.sportIds].reverse(),
        },
      },
    };
    expect(eventEditorCreateRequestHash(arrayOrderBase)).not.toBe(eventEditorCreateRequestHash(changedArrayOrder));
  });

  it('claims once and replays the stored canonical result without another insert', async () => {
    const client = createClient();
    const requestHash = eventEditorCreateRequestHash(command);
    const first = await claimEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: 'user-1',
      requestHash,
    });
    expect(first.firstClaim).toBe(true);
    expect(first.eventId).toBeTruthy();

    const storedResult = { ...result, snapshot: { ...result.snapshot, eventId: first.eventId } };
    await completeEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      result: storedResult,
      emailDelivery: 'QUEUED',
    });
    const replay = await claimEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: 'user-1',
      requestHash,
    });

    expect(replay.firstClaim).toBe(false);
    expect(replay.result).toEqual(storedResult);
    expect(client.eventEditorCreateOperations.createMany).toHaveBeenCalledTimes(1);
  });
  it('waits for terminal delivery metadata before replaying a committed result', async () => {
    jest.useFakeTimers();
    try {
      const client = createClient();
      const requestHash = eventEditorCreateRequestHash(command);
      const first = await claimEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        actorUserId: 'user-1',
        requestHash,
      });
      const storedResult = { ...result, snapshot: { ...result.snapshot, eventId: first.eventId } };
      await completeEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        result: storedResult,
        emailDelivery: 'PROCESSING',
      });

      const claim = await claimEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        actorUserId: 'user-1',
        requestHash,
      });
      expect(claim.result).toBeNull();

      let settled = false;
      const replayPromise = waitForEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        actorUserId: 'user-1',
        requestHash,
        timeoutMs: 500,
      }).then((value) => {
        settled = true;
        return value;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);

      await completeEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        result: { ...storedResult, staffEmailDelivery: 'QUEUED' },
        emailDelivery: 'QUEUED',
      });
      await jest.advanceTimersByTimeAsync(10);

      await expect(replayPromise).resolves.toEqual(expect.objectContaining({
        result: { ...storedResult, staffEmailDelivery: 'QUEUED' },
        emailDelivery: 'QUEUED',
      }));
    } finally {
      jest.useRealTimers();
    }
  });
  it('returns the committed domain result after the terminal metadata wait expires', async () => {
    jest.useFakeTimers();
    try {
      const requestHash = eventEditorCreateRequestHash(command);
      const storedResult = { ...result, snapshot: { ...result.snapshot, eventId: 'event-1' } };
      const client = createClient([operationRow({
        requestHash,
        responseJson: storedResult,
        emailDelivery: 'PROCESSING',
      })]);
      const replayPromise = waitForEventEditorCreateOperation({
        client,
        createOperationId: command.createOperationId,
        actorUserId: 'user-1',
        requestHash,
        timeoutMs: 20,
        returnCommittedResultOnTimeout: true,
      });
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(30);

      await expect(replayPromise).resolves.toEqual(expect.objectContaining({
        result: storedResult,
        emailDelivery: 'PROCESSING',
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns an incomplete claim while the winning transaction is finalizing', async () => {
    const client = createClient([operationRow({ requestHash: eventEditorCreateRequestHash(command) })]);
    const claim = await claimEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: 'user-1',
      requestHash: eventEditorCreateRequestHash(command),
    });
    expect(claim.firstClaim).toBe(false);
    expect(claim.result).toBeNull();

    const finalResult = { ...result, snapshot: { ...result.snapshot, eventId: 'event-1' } };
    await completeEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      result: finalResult,
      emailDelivery: 'NOT_REQUESTED',
    });
    const replay = await waitForEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: 'user-1',
      requestHash: eventEditorCreateRequestHash(command),
      timeoutMs: 100,
    });
    expect(replay.result).toEqual(finalResult);
  });

  it('does not disclose the first operation owner or payload', async () => {
    const client = createClient([operationRow({ requestHash: eventEditorCreateRequestHash(command) })]);
    await expect(claimEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: 'different-user',
      requestHash: eventEditorCreateRequestHash(command),
    })).rejects.toBeInstanceOf(EventCreateOperationConflictError);
    await expect(claimEventEditorCreateOperation({
      client,
      createOperationId: command.createOperationId,
      actorUserId: 'user-1',
      requestHash: 'different-hash',
    })).rejects.toBeInstanceOf(EventCreateOperationPayloadMismatchError);
  });
});
