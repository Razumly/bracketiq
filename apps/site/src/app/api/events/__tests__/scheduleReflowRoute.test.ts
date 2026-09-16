/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '../[eventId]/schedule/reflow/route';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { reflowEventSchedule } from '@/server/scheduler/reflow/eventReflow';
import { MaintenanceOperationError } from '@/server/scheduler/eventScheduleMaintenance';

jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('@/lib/permissions', () => ({ requireSession: jest.fn() }));
jest.mock('@/server/scheduler/reflow/eventReflow', () => ({ reflowEventSchedule: jest.fn() }));

const request = { contractVersion: 1, eventId: 'event', changedMatchIds: ['match'],
  expectedScheduleRevision: 'revision', fieldPolicy: 'KEEP_ASSIGNED_FIELDS' };
const post = (body: unknown = request, eventId = 'event') => POST(new NextRequest(`http://localhost/api/events/${eventId}/schedule/reflow`, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), { params: Promise.resolve({ eventId }) });

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireSession).mockResolvedValue({ userId: 'host', isAdmin: false } as Awaited<ReturnType<typeof requireSession>>);
  jest.mocked(prisma.$transaction).mockImplementation(async (action: unknown) => {
    if (typeof action !== 'function') throw new Error('Expected a transaction.');
    return action({});
  });
});

it.each([
  ['unauthenticated', 401], ['wrong version', 400], ['wrong path', 400], ['duplicate changed IDs', 400],
])('rejects %s before opening a write transaction', async (reason, status) => {
  if (reason === 'unauthenticated') jest.mocked(requireSession).mockRejectedValue(new Response(null, { status: 401 }));
  const body = reason === 'wrong version' ? { ...request, contractVersion: 2 }
    : reason === 'duplicate changed IDs' ? { ...request, changedMatchIds: ['match', 'match'] } : request;
  const response = await post(body, reason === 'wrong path' ? 'different' : 'event');
  expect(response.status).toBe(status);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('returns authorization errors from the locked service without a success body', async () => {
  jest.mocked(reflowEventSchedule).mockRejectedValue(new MaintenanceOperationError(
    'EDITOR_MAINTENANCE_UNAUTHORIZED', 'You cannot change this Event.',
  ));
  const response = await post();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'EDITOR_MAINTENANCE_UNAUTHORIZED', error: 'You cannot change this Event.' });
});

it('returns the canonical unchanged-state failure for the client to decode', async () => {
  const result = { contractVersion: 1 as const, eventId: 'event', status: 'INFEASIBLE' as const,
    scheduleRevision: 'revision', affectedMatchIds: ['match'], protectedMatchIds: [],
    placementChanges: [], assignmentChanges: [], warnings: [], exploredStates: 3, graph: null };
  jest.mocked(reflowEventSchedule).mockResolvedValue(result);
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(reflowEventSchedule).toHaveBeenCalledWith(expect.objectContaining({
    request, actor: { userId: 'host', isAdmin: false },
  }));
});
