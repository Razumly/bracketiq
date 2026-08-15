/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  events: { findMany: jest.fn() },
  timeSlots: { findMany: jest.fn(), update: jest.fn() },
  divisions: { findMany: jest.fn() },
};
const prismaMock = {
  timeSlots: { findUnique: jest.fn(), update: jest.fn() },
  fields: { findMany: jest.fn() },
  organizations: { findUnique: jest.fn() },
  $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
};
const requireSessionMock = jest.fn();
const canManageTimeSlotMock = jest.fn();
const canManageScheduledFieldsMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/timeSlotAccess', () => ({
  canManageTimeSlot: (...args: unknown[]) => canManageTimeSlotMock(...args),
  canManageScheduledFields: (...args: unknown[]) => canManageScheduledFieldsMock(...args),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: unknown[]) => acquireEventLockMock(...args),
}));

import { PATCH } from '@/app/api/time-slots/[id]/route';

const params = { params: Promise.resolve({ id: 'slot_target' }) };
const request = (slot: Record<string, unknown>) => new NextRequest('http://localhost/api/time-slots/slot_target', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slot }),
});
const event = {
  id: 'event_1',
  start: new Date('2026-08-10T08:00:00.000Z'),
  end: new Date('2026-08-10T18:00:00.000Z'),
  noFixedEndDateTime: false,
  timeZone: 'UTC',
  fieldIds: ['resource_1'],
  timeSlotIds: ['slot_target', 'slot_sibling'],
};
const target = {
  id: 'slot_target',
  startDate: new Date('2026-08-10T10:00:00.000Z'),
  endDate: new Date('2026-08-10T11:00:00.000Z'),
  startTimeMinutes: 10 * 60,
  endTimeMinutes: 11 * 60,
  timeZone: 'UTC',
  repeating: false,
  scheduledFieldId: 'resource_1',
  scheduledFieldIds: ['resource_1'],
  divisions: ['division_1'],
};
const sibling = {
  ...target,
  id: 'slot_sibling',
  startDate: new Date('2026-08-10T09:00:00.000Z'),
  endDate: new Date('2026-08-10T10:00:00.000Z'),
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  divisions: ['division_2'],
};

beforeEach(() => {
  jest.clearAllMocks();
  requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
  canManageTimeSlotMock.mockResolvedValue(true);
  canManageScheduledFieldsMock.mockResolvedValue(true);
  acquireEventLockMock.mockResolvedValue(undefined);
  prismaMock.timeSlots.findUnique.mockResolvedValue(target);
  prismaMock.fields.findMany.mockResolvedValue([{ id: 'resource_1', lat: null, long: null, organizationId: null }]);
  prismaMock.organizations.findUnique.mockResolvedValue(null);
  txMock.events.findMany.mockResolvedValue([event]);
  txMock.timeSlots.findMany.mockResolvedValue([target, sibling]);
  txMock.divisions.findMany.mockResolvedValue([
    { eventId: 'event_1', id: 'division_1', key: 'division_1' },
    { eventId: 'event_1', id: 'division_2', key: 'division_2' },
  ]);
  txMock.timeSlots.update.mockResolvedValue(target);
});

describe('PATCH /api/time-slots/[id]', () => {
  it('locks referencing Events and atomically rejects a shared-Resource overlap across disjoint Divisions', async () => {
    const response = await PATCH(request({
      startDate: '2026-08-10T09:30:00.000Z',
      endDate: '2026-08-10T10:30:00.000Z',
      startTimeMinutes: 9 * 60 + 30,
      endTimeMinutes: 10 * 60 + 30,
    }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: 'INVALID_TIME_SLOT',
      error: expect.stringMatching(/Resource "resource_1".*disjoint Division scopes/),
    }));
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(txMock.timeSlots.update).not.toHaveBeenCalled();
  });

  it('rejects a candidate outside a referencing fixed Event boundary before persistence', async () => {
    txMock.events.findMany.mockResolvedValue([{ ...event, timeSlotIds: ['slot_target'] }]);
    txMock.timeSlots.findMany.mockResolvedValue([target]);

    const response = await PATCH(request({
      startDate: '2026-08-10T18:00:00.000Z',
      endDate: '2026-08-10T19:00:00.000Z',
      startTimeMinutes: 18 * 60,
      endTimeMinutes: 19 * 60,
    }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: 'INVALID_TIME_SLOT',
      error: expect.stringMatching(/outside the Event boundary.*rejected rather than clipped/),
    }));
    expect(txMock.timeSlots.update).not.toHaveBeenCalled();
  });
});
