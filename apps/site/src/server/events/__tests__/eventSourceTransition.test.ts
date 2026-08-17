/** @jest-environment node */

const reconcileEventScheduleMock = jest.fn();

jest.mock('@/server/scheduler/eventScheduleMutation', () => ({
  reconcileEventSchedule: reconcileEventScheduleMock,
}));

import { applyEventSourceTransition } from '@/server/events/eventSourceTransition';

type TransactionMock = {
  events: {
    update: jest.Mock;
  };
  matches: {
    count: jest.Mock;
  };
};

const makeTransaction = (): TransactionMock => ({
  events: {
    update: jest.fn().mockResolvedValue({ id: 'event_1', eventType: 'LEAGUE' }),
  },
  matches: {
    count: jest.fn().mockResolvedValue(0),
  },
});

describe('applyEventSourceTransition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reconcileEventScheduleMock.mockResolvedValue({
      event: { id: 'event_1', eventType: 'LEAGUE' },
      matches: [{ id: 'match_1' }],
      warnings: [],
      previousMatchCount: 0,
      notification: null,
    });
  });

  it('builds a League schedule when an existing source changes', async () => {
    const tx = makeTransaction();
    tx.matches.count.mockResolvedValue(0);

    const result = await applyEventSourceTransition({
      tx: tx as never,
      currentEvent: {
        id: 'event_1',
        eventType: 'LEAGUE',
        sourceType: 'AFFILIATE_IMPORT',
      },
      sourceUpdate: {
        sourceType: 'NATIVE_IMPORT',
        sourceId: 'source_2',
        sourceUrl: 'https://example.com/event',
      },
      eventUpdate: { name: 'Updated event' },
    });

    expect(tx.events.update).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      data: expect.objectContaining({
        name: 'Updated event',
        sourceType: 'NATIVE_IMPORT',
        sourceId: 'source_2',
        sourceUrl: 'https://example.com/event',
      }),
    });
    expect(reconcileEventScheduleMock).toHaveBeenCalledWith({
      tx,
      eventId: 'event_1',
      mode: 'BUILD',
      includePlaceholderTeams: true,
      participantCount: undefined,
      historyPolicy: 'REJECT_PROTECTED',
    });
    expect(result.sourceChanged).toBe(true);
    expect(result.scheduleMutation?.previousMatchCount).toBe(0);
  });

  it('deletes an existing schedule when the changed source targets a non-schedulable type', async () => {
    const tx = makeTransaction();
    tx.matches.count.mockResolvedValue(4);

    await applyEventSourceTransition({
      tx: tx as never,
      currentEvent: {
        id: 'event_1',
        eventType: 'TOURNAMENT',
        sourceType: 'AFFILIATE_IMPORT',
      },
      sourceUpdate: { sourceType: 'RENTAL_BOOKING' },
      eventUpdate: { eventType: 'EVENT' },
    });

    expect(reconcileEventScheduleMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      mode: 'DELETE',
      historyPolicy: 'REJECT_PROTECTED',
    }));
  });

  it('does not reconcile when neither source nor event type changed', async () => {
    const tx = makeTransaction();

    const result = await applyEventSourceTransition({
      tx: tx as never,
      currentEvent: {
        id: 'event_1',
        eventType: 'EVENT',
        sourceType: 'AFFILIATE_IMPORT',
      },
      sourceUpdate: { sourceType: 'affiliate_import' },
      eventUpdate: { name: 'Description-only update' },
    });

    expect(reconcileEventScheduleMock).not.toHaveBeenCalled();
    expect(result.sourceChanged).toBe(false);
    expect(result.scheduleMutation).toBeNull();
  });
});
