/** @jest-environment node */

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

jest.mock('@/lib/permissions', () => ({
  requireSession: async (req: NextRequest) => ({ userId: req.headers.get('x-test-user'), isAdmin: false }),
}));
jest.mock('@/server/email', () => ({ isEmailEnabled: () => true, sendEmail: jest.fn(async () => undefined) }));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: jest.fn(async () => ({ reason: 'no_tokens', attempted: false, successCount: 0 })) }));
jest.mock('@/server/notificationPreferences', () => ({ isUserNotificationChannelEnabled: async () => true }));

import { prisma } from '@/lib/prisma';
import { POST as createInvite } from '@/app/api/teams/[id]/member-invites/route';
import { POST as decline } from '@/app/api/invites/[id]/decline/route';
import { POST as accept } from '@/app/api/invites/[id]/accept/route';
import { POST as remind } from '@/app/api/invites/[id]/remind/route';
import { POST as reinvite } from '@/app/api/invites/[id]/reinvite/route';
import { GET as readInvite, DELETE as cancel } from '@/app/api/invites/[id]/route';
import { GET as listInvites } from '@/app/api/invites/route';
import { GET as readBlocks } from '@/app/api/users/team-blocks/route';
import { DELETE as removeTeamBlock } from '@/app/api/users/team-blocks/[teamId]/route';
import { POST as blockUser } from '@/app/api/users/social/blocked/route';
import { DELETE as unblockUser } from '@/app/api/users/social/blocked/[targetUserId]/route';
import { PATCH as patchTeam } from '@/app/api/teams/[id]/route';
import { POST as createTeamRoute } from '@/app/api/teams/route';
import { reserveTeamRegistrationSlot } from '@/server/teams/teamOpenRegistration';
import { reviewTeamJoinRequest } from '@/server/teams/teamJoinRequests';
import { getCanonicalTeamIdsByUserIds } from '@/server/teams/teamMembership';

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
databaseTests('issue 149 invitation commands with PostgreSQL', () => {
  let prefix: string;
  const id = (name: string) => `${prefix}-${name}`;
  const req = (path: string, actor: string, body?: unknown, method = 'POST') => new NextRequest(`http://localhost${path}`, {
    method, headers: { 'x-test-user': id(actor), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const params = (inviteId: string) => ({ params: Promise.resolve({ id: inviteId }) });
  const add = async (player = 'player', team = 'team', sender = 'manager', key = randomUUID()) => {
    const response = await createInvite(req(`/api/teams/${id(team)}/member-invites`, sender, { userId: id(player), idempotencyKey: key }), params(id(team)));
    expect(response.status).toBe(201);
    return (await response.json()).invite;
  };
  const read = async (inviteId: string, actor = 'player') => {
    const response = await readInvite(req(`/api/invites/${inviteId}`, actor, undefined, 'GET'), params(inviteId));
    expect(response.status).toBe(200);
    return (await response.json()).invite;
  };
  const createTeam = async (name: string) => {
    await prisma.canonicalTeams.create({ data: { id: id(name), name, teamSize: 10, createdBy: id('manager'), createdAt: new Date(), joinPolicy: 'CLOSED' } });
    await prisma.teamRegistrations.create({ data: { id: `${id(name)}-captain`, teamId: id(name), userId: id('manager'), status: 'ACTIVE', isCaptain: true } });
    await prisma.teamStaffAssignments.createMany({ data: ['manager', 'alternate'].map((actor) => ({ id: `${id(name)}-${actor}`, teamId: id(name), userId: id(actor), role: 'MANAGER' as const, status: 'ACTIVE' as const })) });
  };

  const eventPlacement = async (inviteId: string, completed: boolean) => {
    const event = await prisma.events.create({ data: { id: id('event'), name: 'Invitation history', start: new Date('2025-01-01'), end: new Date(completed ? '2025-01-02' : '2035-01-02'), location: 'Test', teamSizeLimit: 6, price: 0, coordinates: [0, 0] } });
    const team = await prisma.teams.create({ data: { id: id('event-team'), eventId: event.id, parentTeamId: id('team'), name: 'Event roster', captainId: id('manager'), managerId: id('manager'), playerIds: [], pending: [id('player')], teamSize: 6 } });
    const registration = await prisma.eventRegistrations.create({ data: { id: id('event-registration'), eventId: event.id, eventTeamId: team.id, registrantId: id('player'), registrantType: 'SELF', status: 'INVITED', createdBy: id('manager') } });
    await prisma.teamInviteEventSyncs.create({ data: { id: id('event-sync'), inviteId, canonicalTeamId: id('team'), eventId: event.id, eventTeamId: team.id, userId: id('player'), status: 'PENDING', eventTeamHadUser: false, eventTeamHadPendingUser: false } });
    return { team, registration };
  };

  beforeEach(async () => {
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe('/bracketiq_e2e_149_codex');
    process.env.AUTH_SECRET = 'issue-149-isolated-integration-secret';
    prefix = `issue149-${randomUUID()}`;
    const users = ['manager', 'alternate', 'player', 'guardian', 'child1', 'child2', 'unclaimed'];
    await prisma.userData.createMany({ data: users.map((name) => ({ id: id(name), userName: id(name), firstName: name, lastName: 'Invitation test', dateOfBirth: new Date(name.startsWith('child') ? '2015-01-01' : '1990-01-01'), isManagedPlayer: name === 'unclaimed' })) });
    await prisma.authUser.createMany({ data: users.filter((name) => name !== 'unclaimed').map((name) => ({ id: id(name), email: `${id(name)}@example.com`, passwordHash: 'test-hash', emailVerifiedAt: new Date() })) });
    await prisma.parentChildLinks.createMany({ data: ['child1', 'child2'].map((child) => ({ id: id(`link-${child}`), parentId: id('guardian'), childId: id(child), createdBy: id('guardian'), status: 'ACTIVE' as const })) });
    await createTeam('team');
    await createTeam('other-team');
  });

  afterEach(async () => {
    const teamIds = [id('team'), id('other-team'), id('created-team')];
    await prisma.teamCreationRequests.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.teamJoinRequests.deleteMany({ where: { teamId: { in: teamIds } } });
    const inviteIds = (await prisma.invites.findMany({ where: { teamId: { in: teamIds } }, select: { id: true } })).map((row) => row.id);
    await prisma.inviteDeliveries.deleteMany({ where: { inviteId: { in: inviteIds } } });
    await prisma.invitationRequests.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.teamInviteEventSyncs.deleteMany({ where: { canonicalTeamId: { in: teamIds } } });
    await prisma.invites.deleteMany({ where: { id: { in: inviteIds } } });
    await prisma.eventRegistrations.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.teams.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.events.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.teamBlocks.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.teamRegistrations.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.teamStaffAssignments.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.chatGroup.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { id: { startsWith: prefix } }] } });
    await prisma.canonicalTeams.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.moderationReport.deleteMany({ where: { reporterUserId: { startsWith: prefix } } });
    await prisma.parentChildLinks.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.authUser.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.userData.deleteMany({ where: { id: { startsWith: prefix } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('replays Team creation without changing the roster or sending another invitation', async () => {
    const input = { id: id('created-team'), name: 'Retry Team', teamSize: 6, pending: [id('player')] };
    const [first, retry] = await Promise.all([1, 2].map(() => createTeamRoute(req('/api/teams', 'manager', input))));
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect((await first.json()).id).toBe((await retry.json()).id);
    expect(await prisma.invites.count({ where: { teamId: id('created-team'), userId: id('player') } })).toBe(1);
    expect(await prisma.teamRegistrations.count({ where: { teamId: id('created-team'), userId: id('player') } })).toBe(1);
    const mismatch = await createTeamRoute(req('/api/teams', 'manager', { ...input, name: 'Changed draft' }));
    expect(mismatch.status).toBe(409);
  });

  it('blocks an old join-request approval and direct registration without saving a roster place', async () => {
    await prisma.canonicalTeams.update({ where: { id: id('team') }, data: { joinPolicy: 'OPEN_REGISTRATION', openRegistration: true } });
    const invitation = await add();
    await prisma.teamJoinRequests.create({ data: { id: id('old-request'), teamId: id('team'), requesterUserId: id('player'), registrantUserId: id('player'), registrantType: 'SELF', status: 'PENDING' } });
    expect((await decline(req('', 'player', { blockScope: 'team' }), params(invitation.id))).status).toBe(200);
    const approval = await reviewTeamJoinRequest({ teamId: id('team'), requestId: id('old-request'), reviewerUserId: id('alternate'), action: 'APPROVE' });
    expect(approval).toMatchObject({ ok: false, status: 403 });
    const registration = await reserveTeamRegistrationSlot({ teamId: id('team'), userId: id('player'), actorUserId: id('manager'), status: 'ACTIVE', now: new Date() });
    expect(registration).toMatchObject({ ok: false, status: 403 });
    expect(await prisma.teamRegistrations.count({ where: { teamId: id('team'), userId: id('player') } })).toBe(0);
    expect((await prisma.teamJoinRequests.findUniqueOrThrow({ where: { id: id('old-request') } })).status).toBe('PENDING');
  });

  it('retains decline and reinvites immediately on a closed Team; old IDs cannot change the new attempt', async () => {
    const original = await add('player', 'team', 'manager', 'first');
    expect((await decline(req('', 'player', {}), params(original.id))).status).toBe(200);
    const final = await read(original.id);
    expect(final).toMatchObject({ status: 'DECLINED', actedBy: id('player') });
    const response = await reinvite(req('', 'manager', { idempotencyKey: 'second' }), params(original.id));
    expect(response.status).toBe(201);
    const next = (await response.json()).invite;
    expect(next.id).not.toBe(original.id);
    expect((await cancel(req('', 'manager', undefined, 'DELETE'), params(original.id))).status).toBe(409);
    expect((await accept(req('', 'player', {}), params(original.id))).status).not.toBe(200);
    expect((await remind(req('', 'manager', { idempotencyKey: 'stale' }), params(original.id))).status).toBe(409);
    expect((await read(next.id)).status).toBe('PENDING');
    expect((await read(original.id)).finalizedAt).toBe(final.finalizedAt);
    expect((await add('player', 'team', 'manager', 'first')).status).toBe('DECLINED');
  });

  it('deduplicates concurrent creation and reminders without adding a roster place', async () => {
    const [first, retry] = await Promise.all([add('player', 'team', 'manager', 'create'), add('player', 'team', 'manager', 'create')]);
    expect(first.id).toBe(retry.id);
    await Promise.all([1, 2].map(() => remind(req('', 'manager', { idempotencyKey: 'reminder' }), params(first.id))));
    expect(await prisma.inviteDeliveries.count({ where: { inviteId: first.id, idempotencyKey: 'reminder' } })).toBe(1);
    expect(await prisma.teamRegistrations.count({ where: { teamId: id('team'), userId: id('player'), status: 'INVITED' } })).toBe(1);
    expect((await read(first.id)).deliveries).toHaveLength(2);
  });

  it.each(['decline', 'cancel'])('preserves completed Event roster and registration history after %s', async (action) => {
    const invite = await add();
    const before = await eventPlacement(invite.id, true);
    const response = action === 'decline'
      ? await decline(req('', 'player', {}), params(invite.id))
      : await cancel(req('', 'manager', undefined, 'DELETE'), params(invite.id));
    expect(response.status).toBe(200);
    expect(await prisma.teams.findUnique({ where: { id: before.team.id } })).toEqual(before.team);
    expect(await prisma.eventRegistrations.findUnique({ where: { id: before.registration.id } })).toEqual(before.registration);
    expect((await read(invite.id)).status).toBe(action === 'decline' ? 'DECLINED' : 'CANCELLED');
  });

  it('keeps expiry on the roster without granting Team access', async () => {
    const invite = await add();
    const before = await eventPlacement(invite.id, false);
    const expiresAt = new Date(Date.now() - 1000);
    await prisma.invites.update({ where: { id: invite.id }, data: { linkExpiresAt: expiresAt } });
    expect((await accept(req('', 'player', {}), params(invite.id))).status).toBe(410);
    const saved = await read(invite.id);
    expect(await prisma.teams.findUnique({ where: { id: before.team.id } })).toEqual(before.team);
    expect(await prisma.eventRegistrations.findUnique({ where: { id: before.registration.id } })).toEqual(before.registration);
    expect(saved).toMatchObject({ status: 'EXPIRED', invitationLabel: 'Invitation expired', finalizedAt: expiresAt.toISOString() });
    expect((await prisma.teamRegistrations.findUnique({ where: { teamId_userId: { teamId: id('team'), userId: id('player') } } }))?.status).toBe('INVITED');
    expect((await getCanonicalTeamIdsByUserIds([id('player')])).get(id('player'))).not.toContain(id('team'));
    const history = await listInvites(req(`/api/invites?teamId=${id('team')}&history=true`, 'manager', undefined, 'GET'));
    expect((await history.json()).invites).toEqual(expect.arrayContaining([expect.objectContaining({ id: invite.id, status: 'EXPIRED' })]));
  });

  it('enforces a Team Block for every manager, including direct roster additions, and removes it without reviving the attempt', async () => {
    const invite = await add();
    expect((await decline(req('', 'player', { blockScope: 'team' }), params(invite.id))).status).toBe(200);
    for (const actor of ['manager', 'alternate']) {
      expect((await createInvite(req('', actor, { userId: id('player') }), params(id('team')))).status).toBe(403);
    }
    const direct = await patchTeam(req('', 'alternate', { team: { pending: [id('player')] } }, 'PATCH'), params(id('team')));
    expect(direct.status).toBe(403);
    expect((await direct.json()).error).toMatch(/blocked invitations and roster additions/);
    expect((await readBlocks(req('', 'player', undefined, 'GET')).then((response) => response.json())).blocks).toHaveLength(1);
    expect((await removeTeamBlock(req(`/api/users/team-blocks/${id('team')}?playerId=${id('player')}`, 'player', undefined, 'DELETE'), { params: Promise.resolve({ teamId: id('team') }) })).status).toBe(200);
    expect((await read(invite.id)).status).toBe('DECLINED');
    const replay = await decline(req('', 'player', { blockScope: 'team' }), params(invite.id));
    expect((await replay.json()).block.active).toBe(false);
    expect(await prisma.teamBlocks.count({ where: { teamId: id('team') } })).toBe(0);
    expect((await reinvite(req('', 'alternate', { idempotencyKey: 'allowed' }), params(invite.id))).status).toBe(201);
  });

  it('makes a guardian sender block cover both siblings and both Teams while a child Team Block stays on that child', async () => {
    const first = await add('child1');
    const sibling = await add('child2', 'other-team');
    const saved = await decline(req('', 'guardian', { blockScope: 'sender' }), params(first.id));
    expect(saved.status).toBe(200);
    expect((await saved.json()).invite).toMatchObject({ actedBy: id('guardian'), actingGuardianId: id('guardian') });
    expect((await remind(req('', 'manager', { idempotencyKey: 'blocked-sibling' }), params(sibling.id))).status).toBe(403);
    expect((await createInvite(req('', 'manager', { userId: id('child1') }), params(id('other-team')))).status).toBe(403);
    expect((await unblockUser(req('', 'guardian', undefined, 'DELETE'), { params: Promise.resolve({ targetUserId: id('manager') }) })).status).toBe(200);
    expect((await read(first.id, 'guardian')).status).toBe('DECLINED');
    expect((await decline(req('', 'guardian', { blockScope: 'team' }), params(sibling.id))).status).toBe(200);
    expect((await createInvite(req('', 'alternate', { userId: id('child2') }), params(id('other-team')))).status).toBe(403);
    expect((await add('child1', 'other-team', 'alternate')).status).toBe('PENDING');
  });

  it('rejects User Blocks for unclaimed and disabled Accounts', async () => {
    await prisma.authUser.update({ where: { id: id('alternate') }, data: { disabledAt: new Date() } });
    for (const target of ['unclaimed', 'alternate']) {
      expect((await blockUser(req('', 'player', { targetUserId: id(target), leaveSharedChats: false }))).status).toBe(409);
    }
    expect((await prisma.userData.findUnique({ where: { id: id('player') } }))?.blockedUserIds).toEqual([]);
  });

  it.each([false, true])('leaves shared chats only when explicitly selected (%s)', async (leaveSharedChats) => {
    const invite = await add();
    const chat = await prisma.chatGroup.create({ data: { id: id('chat'), hostId: id('manager'), userIds: [id('player'), id('manager'), id('alternate')] } });
    expect((await decline(req('', 'player', { blockScope: 'sender', ...(leaveSharedChats ? { leaveSharedChats: true } : {}) }), params(invite.id))).status).toBe(200);
    const current = await prisma.chatGroup.findUnique({ where: { id: chat.id } });
    expect(current?.userIds.includes(id('player'))).toBe(!leaveSharedChats);
  });

  it('rolls back decline, roster removal, and Team Block when a related write fails', async () => {
    const invite = await add();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION issue149_fail_decline() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER issue149_fail_decline BEFORE UPDATE ON "Invites" FOR EACH ROW WHEN (NEW."id" = '${invite.id}' AND NEW."status" = 'DECLINED') EXECUTE FUNCTION issue149_fail_decline()`);
    try {
      const response = await decline(req('', 'player', { blockScope: 'team' }), params(invite.id));
      expect(response.status).toBe(500);
      expect((await response.json()).saved).toBe(false);
      expect((await read(invite.id)).status).toBe('PENDING');
      expect((await readBlocks(req('', 'player', undefined, 'GET')).then((response) => response.json())).blocks).toEqual([]);
      expect((await prisma.teamRegistrations.findUnique({ where: { teamId_userId: { teamId: id('team'), userId: id('player') } } }))?.status).toBe('INVITED');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER issue149_fail_decline ON "Invites"');
      await prisma.$executeRawUnsafe('DROP FUNCTION issue149_fail_decline()');
    }
  });

  it('serializes competing acceptance and cancellation and keeps the winning outcome stable', async () => {
    const invite = await add();
    await Promise.all([accept(req('', 'player', {}), params(invite.id)), cancel(req('', 'manager', undefined, 'DELETE'), params(invite.id))]);
    const final = await read(invite.id);
    expect(['ACCEPTED', 'CANCELLED']).toContain(final.status);
    expect(final.finalizedAt).toBeTruthy();
    await cancel(req('', 'manager', undefined, 'DELETE'), params(invite.id));
    expect((await read(invite.id)).finalizedAt).toBe(final.finalizedAt);
    const registration = await prisma.teamRegistrations.findUnique({ where: { teamId_userId: { teamId: id('team'), userId: id('player') } } });
    expect(registration?.status).toBe(final.status === 'ACCEPTED' ? 'ACTIVE' : 'REMOVED');
  });
});
