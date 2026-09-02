jest.mock('@/server/realtime/broadcastOverlayRealtime', () => ({
  publishBroadcastOverlayRevocation: jest.fn(),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: jest.fn().mockResolvedValue(undefined),
  acquireFieldLocks: jest.fn().mockResolvedValue(undefined),
  acquireTimeSlotLocks: jest.fn().mockResolvedValue(undefined),
}));

import { deleteOrArchiveEvent } from '../archivePolicy';
import { publishBroadcastOverlayRevocation } from '@/server/realtime/broadcastOverlayRealtime';
import {
  acquireEventLock,
  acquireFieldLocks,
  acquireTimeSlotLocks,
} from '@/server/repositories/locks';

const mockedPublishBroadcastOverlayRevocation = publishBroadcastOverlayRevocation as jest.MockedFunction<
  typeof publishBroadcastOverlayRevocation
>;

const createArchiveClient = () => {
  const client: Record<string, any> = {
    events: {
      update: jest.fn().mockResolvedValue({ id: 'event_1' }),
    },
    broadcastOverlays: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([
        { id: 'overlay_1' },
        { id: 'overlay_2' },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    broadcastOverlayAccessTokens: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'token_1', overlayId: 'overlay_1' },
        { id: 'token_2', overlayId: 'overlay_1' },
        { id: 'token_3', overlayId: 'overlay_2' },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };
  client.$transaction = jest.fn(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
  return client;
};
const createHardDeleteClient = () => {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const count = jest.fn().mockResolvedValue(0);
  const client: Record<string, any> = {
    events: {
      count,
      delete: jest.fn().mockResolvedValue({ id: 'event_1' }),
    },
    matches: { count, deleteMany },
    divisions: { count, deleteMany },
    eventRegistrations: { count, deleteMany },
    refundRequests: { count, deleteMany },
    signedDocuments: { count, deleteMany },
    invites: { count, deleteMany },
    paymentIntents: { count, deleteMany },
    templateDocuments: { deleteMany },
    broadcastOverlays: {
      count,
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany,
    },
    timeSlots: { count, deleteMany },
    fields: {
      findMany: jest.fn().mockResolvedValue([{ id: 'field_1' }]),
      deleteMany,
    },
  };
  client.$transaction = jest.fn(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
  return client;
};

describe('event hard deletion resource locks', () => {
  beforeEach(() => {
    (acquireFieldLocks as jest.Mock).mockClear();
    (acquireTimeSlotLocks as jest.Mock).mockClear();
  });

  it('locks event fields and time slots before deleting the event', async () => {
    const client = createHardDeleteClient();
    const event = {
      id: 'event_1',
      fieldIds: ['field_1'],
      timeSlotIds: ['slot_1'],
      state: 'EVENT',
    };

    await expect(deleteOrArchiveEvent({
      client,
      event,
      actorUserId: 'user_1',
    })).resolves.toMatchObject({
      action: 'deleted',
      entityId: 'event_1',
    });

    expect(acquireFieldLocks).toHaveBeenCalledWith(client, ['field_1']);
    expect(acquireTimeSlotLocks).toHaveBeenCalledWith(client, ['slot_1']);
    expect(
      (acquireFieldLocks as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(client.events.delete.mock.invocationCallOrder[0]);
    expect(
      (acquireTimeSlotLocks as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(client.events.delete.mock.invocationCallOrder[0]);
  });
});


describe('event broadcast overlay archival', () => {
  beforeEach(() => {
    mockedPublishBroadcastOverlayRevocation.mockReset();
  });

  it('commits overlay and token archival before disconnecting every active program capability', async () => {
    const client = createArchiveClient();
    let transactionCompleted = false;
    client.$transaction.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => {
      const result = await callback(client);
      expect(mockedPublishBroadcastOverlayRevocation).not.toHaveBeenCalled();
      transactionCompleted = true;
      return result;
    });

    await expect(deleteOrArchiveEvent({
      client,
      event: { id: 'event_1' },
      actorUserId: 'user_1',
      reason: 'delete_requested',
    })).resolves.toMatchObject({
      action: 'archived',
      entityType: 'event',
      entityId: 'event_1',
    });

    expect(transactionCompleted).toBe(true);
    expect(acquireEventLock).toHaveBeenCalledWith(client, 'event_1');
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.broadcastOverlays.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['overlay_1', 'overlay_2'] }, archivedAt: null },
      data: expect.objectContaining({ status: 'ARCHIVED' }),
    }));
    expect(client.broadcastOverlayAccessTokens.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { overlayId: { in: ['overlay_1', 'overlay_2'] }, revokedAt: null },
      data: expect.objectContaining({ revokeReason: 'EVENT_ARCHIVED' }),
    }));
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenCalledTimes(3);
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenNthCalledWith(1, {
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
    });
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenNthCalledWith(2, {
      overlayId: 'overlay_1',
      accessTokenId: 'token_2',
    });
    expect(mockedPublishBroadcastOverlayRevocation).toHaveBeenNthCalledWith(3, {
      overlayId: 'overlay_2',
      accessTokenId: 'token_3',
    });
  });

  it('does not emit a socket revocation when the archive transaction fails', async () => {
    const client = createArchiveClient();
    client.$transaction.mockRejectedValue(new Error('archive transaction failed'));

    await expect(deleteOrArchiveEvent({
      client,
      event: { id: 'event_1' },
      actorUserId: 'user_1',
      reason: 'delete_requested',
    })).rejects.toThrow('archive transaction failed');

    expect(mockedPublishBroadcastOverlayRevocation).not.toHaveBeenCalled();
  });
  it('preserves imported evidence during hard event deletion', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const client: Record<string, any> = {
      $transaction: jest.fn(async (callback: (tx: Record<string, any>) => Promise<unknown>) => callback(client)),
      events: { delete: jest.fn().mockResolvedValue({ id: 'event_1' }) },
      matches: { deleteMany },
      divisions: { deleteMany },
      eventRegistrations: { deleteMany },
      refundRequests: { deleteMany },
      signedDocuments: { deleteMany },
      invites: { deleteMany },
      paymentIntents: { deleteMany },
      templateDocuments: { deleteMany },
    };

    await expect(deleteOrArchiveEvent({
      client,
      event: { id: 'event_1' },
      actorUserId: 'user_1',
      reason: 'delete_requested',
    })).resolves.toMatchObject({
      action: 'deleted',
      entityType: 'event',
      entityId: 'event_1',
    });

    expect(client.signedDocuments.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        provenance: { not: 'IMPORTED' },
      },
    });
  });
});

