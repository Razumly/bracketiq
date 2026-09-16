/** @jest-environment node */

import { NextRequest } from 'next/server';

const getOptionalSessionMock = jest.fn();
const canManageScheduledFieldsMock = jest.fn();
const loadFieldBlockerCatalogMock = jest.fn();
const getFieldConflictLowerBoundMock = jest.fn();
const findFieldConflictsForDraftSlotMock = jest.fn();
const serializeFieldSchedulingConflictMock = jest.fn();
const canManageEventMock = jest.fn();
const isPublicEventStateMock = jest.fn();
const prismaMock = {
  events: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));
jest.mock('@/server/eventVisibility', () => ({
  isPublicEventState: (...args: unknown[]) => isPublicEventStateMock(...args),
}));


jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: unknown[]) => getOptionalSessionMock(...args),
}));
jest.mock('@/server/timeSlotAccess', () => ({
  canManageScheduledFields: (...args: unknown[]) => canManageScheduledFieldsMock(...args),
}));
jest.mock('@/server/repositories/fieldSchedulingConflicts', () => ({
  loadFieldBlockerCatalog: (...args: unknown[]) => loadFieldBlockerCatalogMock(...args),
  getFieldConflictLowerBound: (...args: unknown[]) => getFieldConflictLowerBoundMock(...args),
  findFieldConflictsForDraftSlot: (...args: unknown[]) => findFieldConflictsForDraftSlotMock(...args),
  serializeFieldSchedulingConflict: (...args: unknown[]) => serializeFieldSchedulingConflictMock(...args),
}));

import { POST } from '@/app/api/events/field-conflicts/route';

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/events/field-conflicts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/field-conflicts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOptionalSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageScheduledFieldsMock.mockResolvedValue(true);
    getFieldConflictLowerBoundMock.mockReturnValue(new Date('2026-06-01T00:00:00.000Z'));
    prismaMock.events.findMany.mockResolvedValue([]);
    isPublicEventStateMock.mockReturnValue(false);
    canManageEventMock.mockResolvedValue(false);
    loadFieldBlockerCatalogMock.mockResolvedValue({});
    findFieldConflictsForDraftSlotMock.mockReturnValue([
      { fieldId: 'field_1', start: new Date('2026-06-01T10:00:00.000Z'), end: new Date('2026-06-01T11:00:00.000Z') },
    ]);
    serializeFieldSchedulingConflictMock.mockReturnValue({
      slotKey: 'slot_1',
      fieldId: 'field_1',
      kind: 'MATCH',
      start: '2026-06-01T10:00:00.000Z',
      end: '2026-06-01T11:00:00.000Z',
    });
  });

  it('loads the blocker catalog once for all draft fields and returns typed conflicts by slot', async () => {
    const response = await POST(jsonRequest({
      eventId: 'draft_event',
      organizationId: 'organization_1',
      eventType: 'LEAGUE',
      eventStart: '2026-06-01T00:00:00.000Z',
      slots: [
        {
          key: 'slot_1',
          scheduledFieldIds: ['field_1', 'field_2'],
          daysOfWeek: [0],
          startDate: '2026-06-01',
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
        },
      ],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conflicts: [expect.objectContaining({ slotKey: 'slot_1', kind: 'MATCH' })],
    });
    expect(canManageScheduledFieldsMock).toHaveBeenCalledWith(
      expect.anything(),
      ['field_1', 'field_2'],
    );
    expect(loadFieldBlockerCatalogMock).toHaveBeenCalledTimes(1);
    expect(loadFieldBlockerCatalogMock).toHaveBeenCalledWith(expect.objectContaining({
      fieldIds: ['field_1', 'field_2'],
      lowerBound: new Date('2026-06-01T00:00:00.000Z'),
      excludeEventId: 'draft_event',
    }));

    expect(findFieldConflictsForDraftSlotMock).toHaveBeenCalledTimes(1);
  });
  it('returns an opaque occupied interval when the source event is not visible', async () => {
    const conflict = {
      fieldId: 'field_1',
      start: new Date('2026-06-01T10:00:00.000Z'),
      end: new Date('2026-06-01T11:00:00.000Z'),
      source: {
        id: 'match_1',
        eventId: 'private_event',
        parentId: 'private_event',
        kind: 'MATCH',
      },
    };
    findFieldConflictsForDraftSlotMock.mockReturnValueOnce([conflict]);
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'private_event',
        state: 'DRAFT',
        archivedAt: null,
        hostId: 'other_user',
        assistantHostIds: [],
        organizationId: 'other_org',
      },
    ]);
    serializeFieldSchedulingConflictMock.mockImplementationOnce(
      (...args: unknown[]) => {
        const [slotKey, value, options] = args as [
          string,
          typeof conflict,
          { canViewSource?: boolean } | undefined,
        ];
        return {
          slotKey,
          fieldId: value.fieldId,
          kind: options?.canViewSource === false ? 'OCCUPIED' : value.source.kind,
          start: value.start.toISOString(),
          end: value.end.toISOString(),
          source: options?.canViewSource === false ? null : value.source,
        };
      },
    );

    const response = await POST(jsonRequest({
      eventId: 'draft_event',
      eventStart: '2026-06-01T00:00:00.000Z',
      slots: [
        {
          key: 'slot_1',
          scheduledFieldIds: ['field_1'],
          startDate: '2026-06-01',
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
        },
      ],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conflicts: [{
        slotKey: 'slot_1',
        fieldId: 'field_1',
        kind: 'OCCUPIED',
        start: '2026-06-01T10:00:00.000Z',
        end: '2026-06-01T11:00:00.000Z',
        source: null,
      }],
    });
    expect(serializeFieldSchedulingConflictMock).toHaveBeenLastCalledWith(
      'slot_1',
      conflict,
      { canViewSource: false },
    );
  });

  it('rejects unauthenticated requests before field lookup', async () => {
    getOptionalSessionMock.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({
      slots: [{ key: 'slot_1', scheduledFieldId: 'field_1', repeating: false }],
    }));

    expect(response.status).toBe(401);
    expect(canManageScheduledFieldsMock).not.toHaveBeenCalled();
    expect(loadFieldBlockerCatalogMock).not.toHaveBeenCalled();
  });
});
