/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { requireEventSignupTestDatabase } from '../../../scripts/event-signup-test-environment';

jest.mock('@/lib/permissions', () => ({
  requireSession: async (req: NextRequest) => ({ userId: req.headers.get('x-test-user'), isAdmin: false }),
  getOptionalSession: async () => null,
}));

import { prisma } from '@/lib/prisma';
import { deleteOrArchiveEvent } from '@/server/deletion/archivePolicy';
import { GET as readInvite } from '@/app/api/invites/[id]/route';
import { POST as claimShareInvite } from '@/app/api/team-invites/[id]/claim/route';
import { buildTeamInviteShareUrl } from '@/server/teamInviteLinks';
import { prepareLegacyPlayerInvitations } from '@/server/teams/legacyPlayerInvitationPreparation';
import { GET as previewClaim } from '@/app/api/public/profile-claims/[id]/route';
import { POST as declineInvite } from '@/app/api/invites/[id]/decline/route';
import { buildEventRegistrationId } from '@/server/events/eventRegistrations';
import { GET as readEvent } from '@/app/api/events/[eventId]/route';
import { withTeamInvitationViews } from '@/server/teams/teamInvitationViews';
import { withRosterInvitationViews } from '@/server/teams/teamRosterInvitationViews';

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;

databaseTests('Event signup cutover through persisted application reads', () => {
  const prefix = `issue153-${randomUUID()}`;
  const id = (name: string) => `${prefix}-${name}`;

  beforeAll(async () => {
    requireEventSignupTestDatabase(153);
    process.env.AUTH_SECRET = 'issue153-claim-regression-secret';
    await prisma.userData.create({ data: {
      id: id('manager'), userName: id('manager'), firstName: 'Taylor', lastName: 'Reed',
      dateOfBirth: new Date('1990-01-01'),
    } });
    await prisma.authUser.create({ data: {
      id: id('manager'), email: `${id('manager')}@example.test`, passwordHash: 'unused',
    } });
  });

  afterAll(async () => {
    const prepared = await prisma.invites.findMany({ where: { id: { startsWith: prefix } }, select: { userId: true } });
    await prisma.teamInviteEventSyncs.deleteMany({ where: { canonicalTeamId: { startsWith: prefix } } });
    await prisma.teams.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.invites.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.eventRegistrations.deleteMany({ where: { eventId: { startsWith: prefix } } });
    await prisma.events.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.teamRegistrations.deleteMany({ where: { teamId: { startsWith: prefix } } });
    await prisma.canonicalTeams.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.authUser.deleteMany({ where: { id: id('manager') } });
    await prisma.userData.deleteMany({ where: { id: id('manager') } });
    await prisma.userData.deleteMany({ where: { id: { in: prepared.flatMap(row => row.userId ? [row.userId] : []) }, isManagedPlayer: true } });
    await prisma.$disconnect();
  });

  it('uses the current Player age for pending labels in both invitation views', async () => {
    const today = new Date();
    const adultBirthday = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
    const cases = [
      { name: 'adult-label', birthday: adultBirthday, expired: false, label: 'Awaiting player' },
      { name: 'child-label', birthday: new Date('2020-01-01'), expired: false, label: 'Awaiting guardian' },
      { name: 'expired-label', birthday: new Date('2020-01-01'), expired: true, label: 'Invitation expired' },
    ];
    for (const entry of cases) {
      await prisma.userData.create({ data: { id: id(entry.name), userName: id(entry.name),
        firstName: 'Test', lastName: 'Player', dateOfBirth: entry.birthday, isManagedPlayer: true } });
      const invite = await prisma.invites.create({ data: { id: id(`${entry.name}-invite`),
        type: 'TEAM', teamId: id('label-team'), userId: id(entry.name), status: 'PENDING',
        isMinor: true, dateOfBirth: new Date('2020-01-01'),
        linkExpiresAt: new Date(Date.now() + (entry.expired ? -86_400_000 : 86_400_000)) } });
      const [view] = await withTeamInvitationViews(prisma, [invite]);
      expect(view).toMatchObject({ invitationLabel: entry.label });
      const [roster] = await withRosterInvitationViews(prisma, [{ id: id('label-team'),
        playerRegistrations: [{ userId: id(entry.name), status: 'INVITED' }] }]);
      expect(roster.playerRegistrations).toEqual([{ userId: id(entry.name), status: 'INVITED',
        invitationId: invite.id, invitationLabel: entry.label }]);
    }
  });

  it('preserves an existing profile and adds it only to the invitation Event roster', async () => {
    await prisma.userData.create({ data: {
      id: id('known-player'), userName: id('known-player'), firstName: 'Jamie', lastName: 'Reed',
      dateOfBirth: new Date('1990-04-15'), isManagedPlayer: false,
    } });
    await prisma.canonicalTeams.create({ data: { id: id('scoped-team'), name: 'Summit Crew', teamSize: 8 } });
    for (const name of ['current', 'other', 'completed']) {
      await prisma.events.create({ data: {
        id: id(name), name, start: new Date('2025-01-01'), end: new Date(name === 'completed' ? '2025-01-02' : '2035-01-02'),
        location: 'River City', coordinates: [], teamSizeLimit: 8, price: 0,
      } });
      await prisma.teams.create({ data: {
        id: id(`snapshot-${name}`), eventId: id(name), parentTeamId: id('scoped-team'), name: 'Summit Crew', teamSize: 8,
        captainId: id('manager'), managerId: id('manager'), playerIds: [], pending: [],
      } });
    }
    const invite = await prisma.invites.create({ data: {
      id: id('scoped-invite'), type: 'TEAM', role: 'player', teamId: id('scoped-team'), eventId: id('current'),
      userId: id('known-player'), firstName: 'Manager Entered', lastName: 'Different', status: 'PENDING',
    } });
    await prepareLegacyPlayerInvitations(prisma, [invite.id]);
    const profile = await prisma.userData.findUniqueOrThrow({ where: { id: id('known-player') } });
    expect(profile).toMatchObject({ firstName: 'Jamie', lastName: 'Reed', isManagedPlayer: true });
    const current = await prisma.teams.findUniqueOrThrow({ where: { id: id('snapshot-current') } });
    expect(current.pending).toEqual([profile.id]);
    for (const name of ['other', 'completed']) {
      const snapshot = await prisma.teams.findUniqueOrThrow({ where: { id: id(`snapshot-${name}`) } });
      expect(snapshot.pending).toEqual([]);
      expect(snapshot.playerIds).toEqual([]);
    }
  });

  it('converts existing accountless invitations without Accounts, name merges, or duplicate placement on retry', async () => {
    await prisma.canonicalTeams.create({ data: {
      id: id('conversion-team'), name: 'River City Crew', teamSize: 8, createdBy: id('manager'),
    } });
    const invites = await Promise.all(['one', 'two'].map(name => prisma.invites.create({ data: {
      id: id(`conversion-${name}`), type: 'TEAM', role: 'player', teamId: id('conversion-team'),
      firstName: 'Alex', lastName: 'Morgan', status: 'PENDING', createdBy: id('manager'),
      linkExpiresAt: new Date(Date.now() + 86_400_000),
    } })));
    const accountsBefore = await prisma.authUser.count();
    const first = await prepareLegacyPlayerInvitations(prisma, invites.map(invite => invite.id));
    const retry = await prepareLegacyPlayerInvitations(prisma, invites.map(invite => invite.id));
    expect(retry).toEqual(first);
    const profiles: string[] = [];
    for (const invite of invites) {
      const link = new URL(buildTeamInviteShareUrl(invite, 'http://localhost'));
      const response = await previewClaim(new NextRequest(`http://localhost/api/public/profile-claims/${invite.id}${link.search}`), {
        params: Promise.resolve({ id: invite.id }),
      });
      expect(response.status).toBe(200);
      const preview = await response.json();
      profiles.push(preview.invite.profileId);
      expect(preview.profile.isManaged).toBe(true);
    }
    expect(new Set(profiles).size).toBe(2);
    expect(await prisma.authUser.count()).toBe(accountsBefore);
    const roster = await prisma.teamRegistrations.findMany({ where: { teamId: id('conversion-team') } });
    expect(roster.map(row => row.userId).sort()).toEqual(profiles.sort());
    expect(roster.every(row => row.status === 'INVITED')).toBe(true);
  });

  it('does not bind a forwarded legacy Player link to the Account that reviews it', async () => {
    await prisma.canonicalTeams.create({ data: {
      id: id('legacy-team'), name: 'Summit United', teamSize: 8, createdBy: id('manager'),
    } });
    const invite = await prisma.invites.create({ data: {
      id: id('legacy-invite'), type: 'TEAM', role: 'player', teamId: id('legacy-team'),
      email: 'different-player@example.test', firstName: 'Alex', lastName: 'Morgan',
      status: 'PENDING', linkExpiresAt: new Date(Date.now() + 86_400_000),
    } });
    const link = new URL(buildTeamInviteShareUrl(invite, 'http://localhost'));
    const response = await claimShareInvite(new NextRequest(
      `http://localhost/api/team-invites/${invite.id}/claim${link.search}`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': id('manager') },
        body: JSON.stringify({ action: 'review' }),
      },
    ), { params: Promise.resolve({ id: invite.id }) });
    expect(response.status).toBe(409);
    const read = await readInvite(new NextRequest(`http://localhost/api/invites/${invite.id}`, {
      headers: { 'x-test-user': id('manager') },
    }), { params: Promise.resolve({ id: invite.id }) });
    expect(read.status).toBe(404);
  });

  it('rejects an old expired attempt after a newer decline without restoring placement', async () => {
    await prisma.canonicalTeams.create({ data: { id: id('stale-team'), name: 'River Crew', teamSize: 8 } });
    const original = await prisma.invites.create({ data: {
      id: id('stale-original'), type: 'TEAM', role: 'player', teamId: id('stale-team'),
      email: `${id('manager')}@example.test`, status: 'EXPIRED', createdAt: new Date('2025-01-01'),
    } });
    await prisma.invites.create({ data: {
      id: id('stale-newer'), type: 'TEAM', role: 'player', teamId: id('stale-team'),
      userId: id('manager'), status: 'DECLINED', createdAt: new Date('2025-01-02'),
    } });
    await expect(prepareLegacyPlayerInvitations(prisma, [original.id])).rejects.toThrow('latest');
    expect(await prisma.teamRegistrations.count({ where: { teamId: id('stale-team') } })).toBe(0);
  });

  it('rejects an obsolete accountless email attempt before creating a profile', async () => {
    const teamId = id('unbound-stale-team');
    const email = `${id('unbound-contact')}@example.test`;
    await prisma.canonicalTeams.create({ data: { id: teamId, name: 'River Crew', teamSize: 8 } });
    const original = await prisma.invites.create({ data: {
      id: id('unbound-original'), type: 'TEAM', role: 'player', teamId, email,
      firstName: 'Jamie', lastName: 'River', status: 'EXPIRED', createdAt: new Date('2025-01-01'),
    } });
    await prisma.invites.create({ data: {
      id: id('unbound-newer'), type: 'TEAM', role: 'player', teamId, email: email.toUpperCase(),
      firstName: 'Jamie', lastName: 'River', status: 'DECLINED', createdAt: new Date('2025-01-02'),
    } });
    const profilesBefore = await prisma.userData.count();
    await expect(prepareLegacyPlayerInvitations(prisma, [original.id])).rejects.toThrow('unbound invitation');
    expect(await prisma.userData.count()).toBe(profilesBefore);
    expect(await prisma.teamRegistrations.count({ where: { teamId } })).toBe(0);
  });

  it('preserves independent Event participation after conversion and decline', async () => {
    const eventId = id('independent-event');
    const teamId = id('independent-team');
    await prisma.events.create({ data: {
      id: eventId, name: 'River Cup', start: new Date('2035-01-01'), end: new Date('2035-01-02'),
      teamSignup: true, location: 'River City', coordinates: [], teamSizeLimit: 8, price: 0,
    } });
    await prisma.canonicalTeams.create({ data: { id: teamId, name: 'River Crew', teamSize: 8 } });
    await prisma.teams.create({ data: {
      id: id('independent-snapshot'), eventId, parentTeamId: teamId, name: 'River Crew', teamSize: 8,
      captainId: id('manager'), managerId: id('manager'),
    } });
    const registrationId = buildEventRegistrationId({ eventId, registrantType: 'SELF', registrantId: id('manager') });
    await prisma.eventRegistrations.create({ data: {
      id: registrationId, eventId, registrantType: 'SELF', registrantId: id('manager'), status: 'ACTIVE',
      rosterRole: 'FREE_AGENT', createdBy: id('manager'), acceptedAt: new Date('2025-01-01'),
    } });
    const invite = await prisma.invites.create({ data: {
      id: id('independent-invite'), type: 'TEAM', role: 'player', teamId, eventId,
      userId: id('manager'), status: 'PENDING',
    } });
    await prepareLegacyPlayerInvitations(prisma, [invite.id]);
    const response = await declineInvite(new NextRequest(`http://localhost/api/invites/${invite.id}/decline`, {
      method: 'POST', headers: { 'x-test-user': id('manager'), 'content-type': 'application/json' }, body: '{}',
    }), { params: Promise.resolve({ id: invite.id }) });
    expect(response.status).toBe(200);
    expect(await prisma.eventRegistrations.findUnique({ where: { id: registrationId } })).toMatchObject({
      status: 'ACTIVE', rosterRole: 'FREE_AGENT', acceptedAt: new Date('2025-01-01'), eventTeamId: null,
    });
  });

  it('rolls back the complete conversion batch when a later stored profile is missing', async () => {
    const teamId = id('rollback-team');
    await prisma.canonicalTeams.create({ data: { id: teamId, name: 'River Crew', teamSize: 8 } });
    const first = await prisma.invites.create({ data: {
      id: id('rollback-1'), type: 'TEAM', role: 'player', teamId, firstName: 'Alex', lastName: 'Morgan', status: 'PENDING',
    } });
    const second = await prisma.invites.create({ data: {
      id: id('rollback-2'), type: 'TEAM', role: 'player', teamId, userId: id('missing-profile'), status: 'PENDING',
    } });
    const profilesBefore = await prisma.userData.count();
    await expect(prepareLegacyPlayerInvitations(prisma, [first.id, second.id])).rejects.toThrow('stored profile');
    expect(await prisma.userData.count()).toBe(profilesBefore);
    expect(await prisma.teamRegistrations.count({ where: { teamId } })).toBe(0);
    expect(await prisma.invites.findUnique({ where: { id: first.id } })).toMatchObject({ userId: null, status: 'PENDING' });
  });

  it('keeps a terminal Team invitation readable when its otherwise empty Event is removed', async () => {
    const event = await prisma.events.create({ data: {
      id: id('event'), name: 'River City Cup', start: new Date('2035-01-01'),
      location: 'River City', coordinates: [], teamSizeLimit: 8, price: 0, hostId: id('manager'),
    } });
    await prisma.invites.create({ data: {
      id: id('invite'), type: 'TEAM', role: 'player', eventId: event.id,
      createdBy: id('manager'), userId: id('manager'), status: 'DECLINED', finalizedAt: new Date(),
    } });

    const result = await deleteOrArchiveEvent({ client: prisma, event, actorUserId: id('manager') });
    const request = new NextRequest(`http://localhost/api/invites/${id('invite')}`, {
      headers: { 'x-test-user': id('manager') },
    });
    const response = await readInvite(request, { params: Promise.resolve({ id: id('invite') }) });

    expect(response.status).toBe(200);
    expect((await response.json()).invite.status).toBe('DECLINED');
    expect(result.action).toBe('archived');
  });

  it('publishes registration limits without disclosing private roster identities', async () => {
    const eventId = id('public-limits');
    await prisma.events.create({ data: {
      id: eventId, name: 'River Cup', state: 'PUBLISHED', start: new Date('2035-01-01'),
      location: 'River City', coordinates: [], teamSignup: true, teamSizeLimit: 8,
      singleDivision: true, maxParticipants: 16, price: 0, hostId: id('manager'),
    } });
    await prisma.invites.create({ data: {
      id: id('public-hidden-invite'), type: 'TEAM', role: 'player', eventId,
      userId: id('private-player'), status: 'PENDING', email: 'private-contact@example.test',
    } });
    const response = await readEvent(new NextRequest(`http://localhost/api/events/${eventId}`), {
      params: Promise.resolve({ eventId }),
    });
    expect(response.status).toBe(200);
    const publicEvent = await response.json();
    expect(publicEvent).toMatchObject({ teamSizeLimit: 8, singleDivision: true, maxParticipants: 16 });
    expect(JSON.stringify(publicEvent)).not.toContain(id('private-player'));
    expect(JSON.stringify(publicEvent)).not.toContain('private-contact@example.test');
  });
});
