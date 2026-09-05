/** @jest-environment node */
import { NextRequest } from 'next/server';

const findUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({ prisma: { invites: { findUnique: (...args: unknown[]) => findUnique(...args) } } }));
jest.mock('@/lib/permissions', () => ({ requireSession: async () => ({ userId: 'player', isAdmin: false }) }));
jest.mock('@/server/teams/teamInvitationViews', () => ({ withTeamInvitationViews: async (_client: unknown, rows: unknown[]) => rows }));
jest.mock('@/server/teams/teamGuardianInvites', () => ({ listActiveChildIdsForParent: async () => [] }));
import { GET, DELETE } from '../route';
import { POST as decline } from '../decline/route';
import { POST as accept } from '../accept/route';

describe('recipient history retention', () => {
  afterEach(() => jest.useRealTimers());
  it('stops exposing a closed attempt at the original 90-day cutoff', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    findUnique.mockResolvedValue({ id: 'attempt', type: 'TEAM', userId: 'player', teamId: 'team', status: 'DECLINED',
      finalizedAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-03-31T00:00:00Z') });
    const read = () => GET(new NextRequest('http://localhost/api/invites/attempt'), { params: Promise.resolve({ id: 'attempt' }) });
    jest.setSystemTime(new Date('2026-03-31T23:59:59.999Z'));
    expect((await read()).status).toBe(200);
    jest.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    expect((await read()).status).toBe(404);
    const params = { params: Promise.resolve({ id: 'attempt' }) };
    expect((await DELETE(new NextRequest('http://localhost/api/invites/attempt', { method: 'DELETE' }), params)).status).toBe(404);
    expect((await decline(new NextRequest('http://localhost/api/invites/attempt/decline', { method: 'POST' }), params)).status).toBe(404);
    expect((await accept(new NextRequest('http://localhost/api/invites/attempt/accept', { method: 'POST' }), params)).status).toBe(404);
  });
});
