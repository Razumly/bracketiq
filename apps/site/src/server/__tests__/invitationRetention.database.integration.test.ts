/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { requireEventSignupTestDatabase } from '../../../scripts/event-signup-test-environment';
import { NextRequest } from 'next/server';
jest.mock('@/lib/permissions', () => ({ requireSession: async (req: NextRequest) => ({ userId: req.headers.get('x-test-user'), isAdmin: req.headers.get('x-reviewer') === 'true' }) }));
jest.mock('@/server/razumlyAdmin', () => ({ requireRazumlyAdmin: async (req: NextRequest) => {
  if (req.headers.get('x-reviewer') !== 'true') throw new Response('Forbidden', { status: 403 });
  return { userId: 'reviewer', isAdmin: true };
} }));
jest.mock('@/server/email', () => ({ isEmailEnabled: () => false, sendEmail: jest.fn() }));
import { prisma } from '@/lib/prisma';
import { reportInvitation } from '@/server/invitationEvidence';
import { completeTeamInvitationDelivery } from '@/server/teams/teamInvitationDelivery';
import { INVITATION_EXPIRY_BATCH_SIZE } from '@/server/teams/teamInvitationState';
import { hashPassword } from '@/lib/authServer';
import { pruneExpiredTerminalInvites } from '@/server/inviteListing';
import { POST as report } from '@/app/api/moderation/reports/route';
import { GET as evidence } from '@/app/api/admin/moderation/[id]/evidence/route';
import { PATCH as closeReport } from '@/app/api/admin/moderation/[id]/route';
import { GET as readInvite } from '@/app/api/invites/[id]/route';
import { POST as createMemberInvite } from '@/app/api/teams/[id]/member-invites/route';
import { withRosterInvitationViews } from '@/server/teams/teamRosterInvitationViews';
import { recordInvitationRequest } from '@/server/teams/teamInvitationRequests';
import { GET as listInvites, POST as createGenericInvite } from '@/app/api/invites/route';
import { DELETE as deleteAccount } from '@/app/api/auth/account/route';
import { DELETE as unblock } from '@/app/api/users/social/blocked/[targetUserId]/route';

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
databaseTests('invitation retention through application reads', () => {
  let prefix: string;
  const id = (name: string) => `${prefix}-${name}`;
  const params = (value: string) => ({ params: Promise.resolve({ id: value }) });
  const req = (actor: string, body?: unknown, reviewer = false, method = 'POST', path = '/api/invites') => new NextRequest(`http://localhost${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-test-user': id(actor), 'x-reviewer': String(reviewer) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const attempt = async (name: string, status = 'DECLINED', time = '2026-01-01T00:00:00Z') => prisma.invites.create({ data: {
    id: id(name), type: 'TEAM', teamId: id('team'), userId: id('player'), createdBy: id('sender'), status,
    createdAt: new Date(time), updatedAt: new Date(time), finalizedAt: status === 'PENDING' ? null : new Date(time),
    linkExpiresAt: new Date('2035-01-01'), email: 'private@example.test', dateOfBirth: new Date('1990-01-01'),
  } });
  const submit = async (inviteId: string, actor = 'player', reviewer = false) => {
    const result = await report(req(actor, { targetType: 'TEAM_INVITATION', targetId: inviteId }, reviewer));
    expect(result.status).toBe(201);
    const body = await result.json();
    return body.report.id as string;
  };
  const readEvidence = async (reportId: string, reviewer = true) => {
    const result = await evidence(req('player', undefined, reviewer, 'GET'), params(reportId));
    return { status: result.status, body: result.status === 200 ? await result.json() : null };
  };
  beforeEach(async () => {
    requireEventSignupTestDatabase(150);
    prefix = `issue150-${randomUUID()}`;
    process.env.AUTH_SECRET = 'issue-150-isolated-test-secret';
    await prisma.userData.createMany({ data: ['player', 'sender', 'stranger'].map((name) => ({ id: id(name), userName: id(name), firstName: name, lastName: 'Test', dateOfBirth: new Date('1990-01-01') })) });
    await prisma.authUser.createMany({ data: ['player', 'sender'].map((name) => ({ id: id(name), email: `${id(name)}@example.test`, passwordHash: 'temporary', emailVerifiedAt: new Date() })) });
    await prisma.canonicalTeams.create({ data: { id: id('team'), name: 'Retention test', teamSize: 8, createdBy: id('sender') } });
    await prisma.teamRegistrations.create({ data: { id: id('membership'), teamId: id('team'), userId: id('player'), status: 'ACTIVE' } });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-03-31T23:59:59.999Z'));
  });
  afterEach(async () => {
    jest.useRealTimers();
    await prisma.moderationReport.deleteMany({ where: { reporterUserId: { startsWith: prefix } } });
    await prisma.invitationRequests.deleteMany({ where: { teamId: id('team') } });
    await prisma.inviteDeliveries.deleteMany({ where: { inviteId: { startsWith: prefix } } });
    await prisma.teamInviteEventSyncs.deleteMany({ where: { canonicalTeamId: id('team') } });
    await prisma.invites.deleteMany({ where: { OR: [{ teamId: id('team') }, { id: { startsWith: prefix } }] } });
    await prisma.teamRegistrations.deleteMany({ where: { teamId: id('team') } });
    await prisma.canonicalTeams.deleteMany({ where: { id: id('team') } });
    await prisma.authUser.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.userData.deleteMany({ where: { id: { startsWith: prefix } } });
  });
  afterAll(async () => prisma.$disconnect());

  it('erases closed attempts at 90 days while an open report retains only review evidence', async () => {
    const invite = await attempt('closed');
    await prisma.inviteDeliveries.create({ data: { id: id('delivery'), inviteId: invite.id, idempotencyKey: 'first', kind: 'INITIAL', status: 'SENT', createdAt: new Date('2026-01-01') } });
    const reportId = await submit(invite.id);
    expect((await readInvite(req('player', undefined, false, 'GET'), params(invite.id))).status).toBe(200);
    expect((await readEvidence(reportId, false)).status).toBe(403);
    jest.setSystemTime(new Date('2026-04-01'));
    expect(await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId: id('team') } })).toBe(1);
    expect((await readInvite(req('player', undefined, false, 'GET'), params(invite.id))).status).toBe(404);
    const held = (await readEvidence(reportId)).body.evidence;
    expect(held).toMatchObject({ inviteId: invite.id, status: 'DECLINED', finalizedAt: '2026-01-01T00:00:00.000Z' });
    expect(held.deliveries).toHaveLength(1);
    expect(JSON.stringify(held)).not.toContain('private@example.test');
    expect(held).not.toHaveProperty('dateOfBirth');
    expect(await prisma.inviteDeliveries.count({ where: { inviteId: invite.id } })).toBe(0);
    expect(await prisma.teamRegistrations.findUnique({ where: { id: id('membership') } })).toMatchObject({ status: 'ACTIVE' });
    expect(await prisma.userData.findUnique({ where: { id: id('player') } })).not.toBeNull();
    const closed = await closeReport(req('sender', { status: 'DISMISSED' }, true, 'PATCH'), params(reportId));
    expect(closed.status).toBe(200);
    expect((await readEvidence(reportId)).body.evidence).toBeNull();
  });

  it('keeps each open report independent and does not reset the age on closure or later attempts', async () => {
    const invite = await attempt('closed');
    const first = await submit(invite.id);
    expect(await submit(invite.id)).toBe(first);
    const second = await submit(invite.id, 'stranger', true);
    await prisma.invites.update({ where: { id: invite.id }, data: { updatedAt: new Date('2026-03-31') } });
    await attempt('new', 'PENDING', '2026-03-31T00:00:00Z');
    jest.setSystemTime(new Date('2026-04-02'));
    await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId: id('team') } });
    expect((await closeReport(req('sender', { status: 'ACTIONED' }, true, 'PATCH'), params(first))).status).toBe(200);
    expect((await readEvidence(first)).body.evidence).toBeNull();
    expect((await readEvidence(second)).body.evidence.finalizedAt).toBe('2026-01-01T00:00:00.000Z');
    expect((await closeReport(req('sender', { status: 'DISMISSED' }, true, 'PATCH'), params(second))).status).toBe(200);
    expect((await readEvidence(second)).body.evidence).toBeNull();
    expect((await closeReport(req('sender', { status: 'OPEN' }, true, 'PATCH'), params(second))).status).toBe(409);
  });

  it('keeps the original window when a report closes before the cutoff', async () => {
    const invite = await attempt('closed');
    const reportId = await submit(invite.id);
    await closeReport(req('sender', { status: 'DISMISSED' }, true, 'PATCH'), params(reportId));
    expect((await readEvidence(reportId)).body.evidence).not.toBeNull();
    jest.setSystemTime(new Date('2026-04-01'));
    expect((await readEvidence(reportId)).body.evidence).toBeNull();
  });

  it('retains pending attempts and skips a full protected batch without starving unrelated cleanup', async () => {
    const pending = await attempt('pending', 'PENDING');
    for (let index = 0; index < 251; index++) {
      const invite = await attempt(`protected-${index}`);
      await prisma.teamInviteEventSyncs.create({ data: { id: id(`sync-${index}`), inviteId: invite.id,
        canonicalTeamId: id('team'), eventId: id('event'), eventTeamId: id('event-team'), userId: id('player'), status: 'PENDING' } });
    }
    const expired = await attempt('expired', 'EXPIRED');
    const cancelled = await attempt('cancelled', 'CANCELLED');
    jest.setSystemTime(new Date('2026-04-02'));
    expect(await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId: id('team') } })).toBe(2);
    expect((await readInvite(req('player', undefined, false, 'GET'), params(pending.id))).status).toBe(200);
    expect(await prisma.invites.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.invites.findUnique({ where: { id: cancelled.id } })).toBeNull();
    const response = await listInvites(req('player', undefined, false, 'GET', `/api/invites?userId=${id('player')}&history=true`));
    expect((await response.json()).invites).toEqual([]);
  });

  it('preserves held evidence through unblock and sender Account deletion without rewriting old outcomes', async () => {
    const invite = await attempt('closed');
    const reportId = await submit(invite.id);
    await prisma.userData.update({ where: { id: id('player') }, data: { blockedUserIds: [id('sender')] } });
    await prisma.moderationReport.create({ data: { id: id('block-report'), reporterUserId: id('player'), targetType: 'BLOCK_USER', targetId: id('sender'), dueAt: new Date() } });
    expect((await unblock(req('player', undefined, false, 'DELETE'), { params: Promise.resolve({ targetUserId: id('sender') }) })).status).toBe(200);
    expect((await readEvidence(reportId)).body.evidence).not.toBeNull();
    const accepted = await prisma.invites.create({ data: { id: id('received'), type: 'TEAM', teamId: id('team'), userId: id('sender'), createdBy: id('player'), status: 'ACCEPTED', finalizedAt: new Date('2026-01-01') } });
    await prisma.authUser.update({ where: { id: id('sender') }, data: { passwordHash: await hashPassword('password123!') } });
    const result = await deleteAccount(req('sender', { confirmationText: 'delete my account', currentPassword: 'password123!' }, false, 'DELETE'));
    expect(result.status).toBe(200);
    expect(await prisma.authUser.findUnique({ where: { id: id('sender') } })).toBeNull();
    expect(await prisma.invites.findUnique({ where: { id: accepted.id } })).toMatchObject({ status: 'ACCEPTED', finalizedAt: new Date('2026-01-01') });
    jest.setSystemTime(new Date('2026-04-02'));
    await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId: id('team') } });
    expect((await readEvidence(reportId)).body.evidence).toMatchObject({ senderId: id('sender'), status: 'DECLINED' });
  });

  it('rejects a report from an unrelated Account', async () => {
    const invite = await attempt('closed');
    expect((await report(req('stranger', { targetType: 'TEAM_INVITATION', targetId: invite.id }))).status).toBe(404);
    expect(await prisma.invitationEvidence.count({ where: { inviteId: invite.id } })).toBe(0);
  });

  it('keeps later delivery results and the final time for a report opened while pending', async () => {
    jest.setSystemTime(new Date('2026-01-01'));
    const invite = await attempt('pending', 'PENDING');
    const reportId = await submit(invite.id);
    await prisma.inviteDeliveries.create({ data: { id: id('reminder'), inviteId: invite.id, idempotencyKey: 'reminder', kind: 'REMINDER', status: 'DISPATCHING', createdAt: new Date() } });
    await prisma.inviteDeliveries.update({ where: { id: id('reminder') }, data: { status: 'SENT', completedAt: new Date(), sentAt: new Date() } });
    const response = await deleteAccount(req('sender', { confirmationText: 'delete my account', currentPassword: 'password123!' }, false, 'DELETE'));
    // The password gate must leave a pending reported attempt unchanged.
    expect(response.status).toBe(401);
    const pendingEvidence = (await readEvidence(reportId)).body.evidence;
    expect(pendingEvidence.status).toBe('PENDING');
    expect(pendingEvidence.deliveries).toEqual([expect.objectContaining({ id: id('reminder'), status: 'SENT', createdAt: '2026-01-01T00:00:00.000Z', sentAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:00.000Z' })]);
    await prisma.authUser.update({ where: { id: id('sender') }, data: { passwordHash: await hashPassword('password123!') } });
    expect((await deleteAccount(req('sender', { confirmationText: 'delete my account', currentPassword: 'password123!' }, false, 'DELETE'))).status).toBe(200);
    expect((await readEvidence(reportId)).body.evidence).toMatchObject({ status: 'CANCELLED', finalizedAt: '2026-01-01T00:00:00.000Z' });
    jest.setSystemTime(new Date('2026-04-01'));
    await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId: id('team') } });
    expect((await readEvidence(reportId)).body.evidence.deliveries).toHaveLength(1);
  });

  it('does not restore an older attempt as current after a newer attempt is erased', async () => {
    const old = await attempt('older', 'DECLINED', '2026-03-31T00:00:00Z');
    const recent = await attempt('newer', 'CANCELLED', '2026-01-01T00:00:00Z');
    jest.setSystemTime(new Date('2026-04-02'));
    await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId: id('team') } });
    expect(await prisma.invites.findUnique({ where: { id: recent.id } })).toBeNull();
    const response = await readInvite(req('player', undefined, false, 'GET'), params(old.id));
    expect((await response.json()).invite.isCurrentAttempt).toBe(false);
  });
  it('bounds pending expiry while hiding the remaining expired backlog and cleaning closed history', async () => {
    await prisma.invites.createMany({ data: Array.from({ length: INVITATION_EXPIRY_BATCH_SIZE * 2 + 1 }, (_, index) => ({
      id: id(`backlog-${index}`), type: 'TEAM', userId: id('player'), createdBy: id('sender'), status: 'PENDING',
      createdAt: new Date('2025-12-01'), linkExpiresAt: new Date('2026-01-01'),
    })) });
    const closed = await attempt('closed');
    jest.setSystemTime(new Date('2026-04-02'));
    const response = await listInvites(req('player', undefined, false, 'GET', `/api/invites?userId=${id('player')}&status=PENDING`));
    expect(response.status).toBe(200);
    expect((await response.json()).invites).toEqual([]);
    expect(await prisma.invites.count({ where: { userId: id('player'), status: 'PENDING' } })).toBe(INVITATION_EXPIRY_BATCH_SIZE + 1);
    expect(await prisma.invites.findUnique({ where: { id: closed.id } })).toBeNull();
    expect(await prisma.teamRegistrations.findUnique({ where: { id: id('membership') } })).toMatchObject({ status: 'ACTIVE' });
  });

  it('keeps a delivery completion that races with report capture', async () => {
    jest.setSystemTime(new Date('2026-01-01'));
    const invite = await attempt('pending', 'PENDING');
    const delivery = await prisma.inviteDeliveries.create({ data: {
      id: id('racing-delivery'), inviteId: invite.id, idempotencyKey: 'race', kind: 'INITIAL', status: 'DISPATCHING', createdAt: new Date(),
    } });
    let completion: ReturnType<typeof completeTeamInvitationDelivery> | undefined;
    let capturedReportId: string;
    try {
      capturedReportId = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Invites" WHERE "id" = ${invite.id} FOR UPDATE`;
        const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        completion = completeTeamInvitationDelivery(delivery.id, invite.id, { status: 'SENT', sentAt: new Date() });
        // Wait until completion reaches the held row, not for an arbitrary delay.
        let blocked = false;
        for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
          const [waiting] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
            SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${connection.pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
          blocked = waiting.blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        return (await reportInvitation(tx, { inviteId: invite.id, reporterUserId: id('player') })).id;
      }, { timeout: 15000 });
    } finally {
      await completion;
    }
    const retained = (await readEvidence(capturedReportId!)).body.evidence;
    expect(retained.deliveries).toEqual([expect.objectContaining({ id: delivery.id, status: 'SENT', sentAt: '2026-01-01T00:00:00.000Z' })]);
  });

  it.each(['member', 'generic', 'reinvite', 'replay'])('resolves the selected expired attempt outside the batch for %s', async (path) => {
    jest.setSystemTime(new Date('2026-01-03'));
    await prisma.teamRegistrations.update({ where: { id: id('membership') }, data: { status: 'INVITED' } });
    await prisma.invites.createMany({ data: Array.from({ length: INVITATION_EXPIRY_BATCH_SIZE * 3 }, (_, index) => ({
      id: id(`backlog-${index}`), type: 'TEAM', teamId: id('team'), userId: id(`other-${index}`), createdBy: id('sender'), status: 'PENDING',
      createdAt: new Date('2025-12-01'), linkExpiresAt: new Date('2026-01-01'),
    })) });
    const invite = await attempt('selected', 'PENDING');
    await prisma.invites.update({ where: { id: invite.id }, data: { linkExpiresAt: new Date('2026-01-02'), role: 'player' } });
    const registrations = [...Array.from({ length: INVITATION_EXPIRY_BATCH_SIZE * 3 }, (_, index) => ({ userId: id(`other-${index}`), status: 'INVITED' })), { userId: id('player'), status: 'INVITED' }];
    const roster = await withRosterInvitationViews(prisma, [{ id: id('team'), playerRegistrations: registrations }]);
    expect(roster[0].playerRegistrations.find((row) => row.userId === id('player'))).toMatchObject({ invitationLabel: 'Invitation expired' });
    const payload = { userId: id('player'), role: 'player', idempotencyKey: 'selected', ...(path === 'reinvite' ? { reinviteId: invite.id } : {}) };
    if (path === 'replay') await recordInvitationRequest(prisma, { teamId: id('team'), senderId: id('sender'), requestKey: 'selected', payload }, invite.id);
    const response = path === 'generic'
      ? await createGenericInvite(req('sender', { invites: [{ ...payload, type: 'TEAM', teamId: id('team') }] }, true))
      : await createMemberInvite(req('sender', payload, true), params(id('team')));
    const body = await response.json();
    expect({ status: response.status, error: body.error }).toEqual({ status: 201, error: undefined });
    const result = path === 'generic' ? body.invites[0] : body.invite;
    expect(result.id ?? result.$id).toEqual(path === 'replay' ? invite.id : expect.not.stringMatching(invite.id));
    expect(result.status).toBe(path === 'replay' ? 'EXPIRED' : 'PENDING');
    expect(await prisma.invites.findUnique({ where: { id: invite.id } })).toMatchObject({ status: 'EXPIRED', finalizedAt: new Date('2026-01-02') });
  });

});
