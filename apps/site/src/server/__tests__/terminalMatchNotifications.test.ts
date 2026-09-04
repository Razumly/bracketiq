import { collectMatchScheduleChanges, notifyTeamsOfMatchScheduleUpdate, snapshotMatchScheduleState } from '../matchScheduleNotifications';
import { sendPushToUsers } from '../pushNotifications';

jest.mock('../pushNotifications', () => ({ sendPushToUsers: jest.fn().mockResolvedValue(null) }));

afterEach(() => jest.clearAllMocks());

test('assignment-only changes notify the former and new officials without claiming a time change', async () => {
  const before = snapshotMatchScheduleState([{ id: 'match', start: '2026-09-04T09:00:00Z',
    end: '2026-09-04T09:25:00Z', officialAssignments: [{ positionId: 'referee', slotIndex: 0, userId: 'Dana' }] }]);
  const after = snapshotMatchScheduleState([{ id: 'match', start: '2026-09-04T09:00:00Z',
    end: '2026-09-04T09:25:00Z', officialAssignments: [{ positionId: 'referee', slotIndex: 0, userId: 'Lee' }] }]);
  await notifyTeamsOfMatchScheduleUpdate({ eventId: 'event', eventName: 'Cup',
    changes: collectMatchScheduleChanges({ before, after }) });
  const notification = jest.mocked(sendPushToUsers).mock.calls[0]![0];
  expect(notification.userIds).toEqual(['Dana', 'Lee']);
  expect(notification.body).not.toContain('rescheduled');
  expect(notification.data).toMatchObject({ changes: [{ before: { officialAssignments: [{ userId: 'Dana' }] },
    after: { officialAssignments: [{ userId: 'Lee' }] } }] });
});

test('a large repair sends one bounded change preview and a count of remaining changes', async () => {
  const rows = Array.from({ length: 400 }, (_, index) => ({ id: `match-${index}`,
    start: '2026-09-04T09:00:00Z', end: '2026-09-04T09:25:00Z', officialId: 'Dana' }));
  const before = snapshotMatchScheduleState(rows);
  const after = snapshotMatchScheduleState(rows.map((row) => ({ ...row, start: '2026-09-04T09:05:00Z', end: '2026-09-04T09:30:00Z' })));
  await notifyTeamsOfMatchScheduleUpdate({ eventId: 'event', eventName: 'Cup',
    changes: collectMatchScheduleChanges({ before, after }) });
  expect(sendPushToUsers).toHaveBeenCalledTimes(1);
  const notification = jest.mocked(sendPushToUsers).mock.calls[0]![0];
  expect(Buffer.byteLength(JSON.stringify(notification.data))).toBeLessThan(3000);
  expect(notification.data).toMatchObject({ changeCount: 400, omittedChangeCount: expect.any(Number) });
});
