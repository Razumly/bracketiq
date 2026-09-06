/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

jest.mock('@/lib/permissions', () => ({
  requireSession: async (req: NextRequest) => ({ userId: req.headers.get('x-test-user'), isAdmin: false }),
}));

jest.mock('@/server/email', () => ({ isEmailEnabled: () => true, sendEmail: jest.fn(async () => { throw new Error('Test delivery failure'); }) }));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: jest.fn(async () => ({ reason: 'no_tokens', attempted: false, successCount: 0 })) }));
jest.mock('@/server/notificationPreferences', () => ({ isUserNotificationChannelEnabled: async () => true }));

import { POST as createPlayer } from '@/app/api/teams/[id]/member-invites/route';
import { POST as acceptInvite } from '@/app/api/invites/[id]/accept/route';
import { prisma } from '@/lib/prisma';
import { buildDivisionToken } from '@/lib/divisionTypes';
import { POST as createTeam } from '@/app/api/teams/route';
import { GET, PATCH } from '@/app/api/events/[eventId]/registration-draft/route';

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;

databaseTests('shared Event registration drafts', () => {
  let prefix: string;
  const id = (name: string) => `${prefix}-${name}`;
  const context = () => ({ params: Promise.resolve({ eventId: id('event') }) });
  const request = (actor: string, body?: unknown) => new NextRequest(
    `http://localhost/api/events/${id('event')}/registration-draft`,
    {
      method: body ? 'PATCH' : 'GET',
      headers: { 'content-type': 'application/json', 'x-test-user': id(actor) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );

  beforeEach(async () => {
    prefix = `issue151-${randomUUID()}`;
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe('/bracketiq_e2e_151_codex');
    await prisma.userData.createMany({ data: ['manager', 'other'].map((name) => ({
      id: id(name), userName: id(name), firstName: name, lastName: 'Test', dateOfBirth: new Date('1990-01-01'),
    })) });
    await prisma.authUser.createMany({ data: ['manager', 'other'].map((actor) => ({ id: id(actor), email: `${id(actor)}@example.test`, passwordHash: 'unused', emailVerifiedAt: new Date() })) });
    await prisma.events.create({ data: {
      id: id('event'), name: 'River City Cup', start: new Date('2035-01-01'),
      location: 'River City', coordinates: [], teamSizeLimit: 10, price: 0,
      teamSignup: true, sportIds: ['Volleyball'], eventType: 'EVENT',
    } });
    await prisma.canonicalTeams.create({ data: {
      id: id('team'), name: 'Cascade Crew', teamSize: 10, sport: 'Volleyball', createdBy: id('manager'),
    } });
    await prisma.teamStaffAssignments.create({ data: {
      id: id('manager-role'), teamId: id('team'), userId: id('manager'), role: 'MANAGER', status: 'ACTIVE',
    } });
  });

  afterEach(async () => {
    await prisma.eventRegistrationDrafts.deleteMany({ where: { accountId: { startsWith: prefix } } });
    await prisma.eventRegistrationTeamPreferences.deleteMany({ where: { accountId: { startsWith: prefix } } });
    const invitations = await prisma.invites.findMany({ where: { teamId: { startsWith: prefix } }, select: { id: true } });
    const inviteIds = invitations.map((invite) => invite.id);
    await prisma.inviteDeliveries.deleteMany({ where: { inviteId: { in: inviteIds } } });
    await prisma.invitationRequests.deleteMany({ where: { teamId: { startsWith: prefix } } });
    await prisma.teamInviteEventSyncs.deleteMany({ where: { canonicalTeamId: { startsWith: prefix } } });
    await prisma.invites.deleteMany({ where: { id: { in: inviteIds } } });
    await prisma.teams.deleteMany({ where: { eventId: { startsWith: prefix } } });
    await prisma.eventRegistrations.deleteMany({ where: { eventId: { startsWith: prefix } } });
    await prisma.teamCreationRequests.deleteMany({ where: { teamId: { startsWith: prefix } } });
    await prisma.teamRegistrations.deleteMany({ where: { teamId: { startsWith: prefix } } });
    await prisma.teamStaffAssignments.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.canonicalTeams.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.divisions.deleteMany({ where: { eventId: { startsWith: prefix } } });
    await prisma.events.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.userData.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.sports.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.authUser.deleteMany({ where: { id: { startsWith: prefix } } });
  });

  afterAll(async () => prisma.$disconnect());

  it('restores the saved selection and answers for another client of the same Account', async () => {
    const saved = await PATCH(request('manager', {
      version: 1, baseRevision: 0,
      patch: { selectedTeamId: id('team'), answers: { travel: 'Bus' }, step: 'questions' },
    }), context());
    expect(saved.status).toBe(200);

    const resumed = await GET(request('manager'), context());
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      version: 1, selectedTeamId: id('team'), selectionSource: 'draft',
      draft: { revision: 1, selectedTeamId: id('team'), answers: { travel: 'Bus' }, step: 'questions' },
    });
    const other = await GET(request('other'), context());
    expect(await other.json()).toMatchObject({ draft: null, selectedTeamId: null, eligibleTeams: [] });
  });

  const read = async () => (await GET(request('manager'), context())).json();
  const save = (patch: unknown, baseRevision = 0) => PATCH(request('manager', { version: 1, baseRevision, patch }), context());
  const extraTeam = async (name: string, sport = 'Volleyball') => {
    await prisma.canonicalTeams.create({ data: { id: id(name), name, sport, teamSize: 10, createdBy: id('manager') } });
    await prisma.teamStaffAssignments.create({ data: { id: id(`${name}-role`), teamId: id(name), userId: id('manager'), role: 'MANAGER', status: 'ACTIVE' } });
  };
  const complete = async (team: string, name: string, event = 'event') => prisma.eventRegistrations.create({ data: {
    id: id(name), eventId: id(event), registrantType: 'TEAM', registrantId: id(team), createdBy: id('manager'),
    status: 'ACTIVE', rosterRole: 'PARTICIPANT', acceptedAt: new Date(),
  } });

  it('rejects a stale device save and returns the actual saved state', async () => {
    expect((await save({ answers: { travel: 'Train' } })).status).toBe(200);
    const stale = await save({ answers: { travel: 'Car' } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ state: { draft: { revision: 1, answers: { travel: 'Train' } } } });
    expect((await read()).draft.answers).toEqual({ travel: 'Train' });
  });

  it('remembers only completed registration and isolates the preference by Account and sport', async () => {
    await extraTeam('second');
    await extraTeam('soccer', 'Soccer');
    expect(await read()).toMatchObject({ selectedTeamId: null, selectionSource: null });
    await save({ selectedTeamId: id('second'), step: 'review' });
    expect(await prisma.eventRegistrationTeamPreferences.count({ where: { accountId: id('manager') } })).toBe(0);
    await prisma.eventRegistrationDrafts.deleteMany({ where: { accountId: id('manager') } });
    await complete('second', 'completed');
    expect(await read()).toMatchObject({ selectedTeamId: id('second'), selectionSource: 'remembered' });
    await prisma.events.create({ data: { id: id('soccer-event'), name: 'Soccer', sportIds: ['Soccer'], start: new Date('2035-01-01'), location: 'River City', teamSizeLimit: 10, coordinates: [], price: 0 } });
    await complete('soccer', 'soccer-completed', 'soccer-event');
    expect(await read()).toMatchObject({ selectedTeamId: id('second'), selectionSource: 'remembered' });
    expect(await prisma.eventRegistrationTeamPreferences.count({ where: { accountId: id('manager') } })).toBe(2);
    expect(await (await GET(request('other'), context())).json()).toMatchObject({ selectedTeamId: null });
    await complete('team', 'latest');
    await prisma.eventRegistrations.update({ where: { id: id('completed') }, data: { updatedAt: new Date() } });
    expect(await read()).toMatchObject({ selectedTeamId: id('team') });
  });

  it('uses a valid draft before the remembered Team and rechecks authority on resume', async () => {
    await extraTeam('second');
    await complete('second', 'completed');
    await save({ selectedTeamId: id('team'), answers: { travel: 'Bus' }, step: 'signing' });
    expect(await read()).toMatchObject({ selectedTeamId: id('team'), selectionSource: 'draft' });
    await prisma.teamStaffAssignments.update({ where: { id: id('manager-role') }, data: { status: 'REMOVED' } });
    expect(await read()).toMatchObject({ selectedTeamId: id('second'), selectionSource: 'remembered', draft: { selectedTeamId: null, answers: { travel: 'Bus' }, step: 'review' } });
    expect((await save({ selectedTeamId: id('team') }, 1)).status).toBe(403);
  });

  it('falls back to the sole eligible Team and otherwise requires a choice', async () => {
    await complete('team', 'completed');
    await extraTeam('second');
    await prisma.canonicalTeams.update({ where: { id: id('team') }, data: { archivedAt: new Date() } });
    expect(await read()).toMatchObject({ selectedTeamId: id('second'), selectionSource: 'sole' });
    await extraTeam('third');
    expect(await read()).toMatchObject({ selectedTeamId: null, selectionSource: null });
    await prisma.teamStaffAssignments.updateMany({ where: { userId: id('manager') }, data: { status: 'REMOVED' } });
    expect(await read()).toMatchObject({ selectedTeamId: null, eligibleTeams: [] });
  });

  it('keeps answers and Team preparation when a checkout reservation expires', async () => {
    await prisma.eventRegistrations.create({ data: { id: id('hold'), eventId: id('event'), registrantType: 'TEAM', registrantId: id('team'), createdBy: id('manager'), status: 'STARTED', createdAt: new Date(Date.now() - 11 * 60 * 1000) } });
    await save({ selectedTeamId: id('team'), registrationId: id('hold'), answers: { travel: 'Bus' }, step: 'checkout' });
    expect(await read()).toMatchObject({ draft: { selectedTeamId: id('team'), registrationId: null, answers: { travel: 'Bus' }, step: 'review' } });
  });

  it('resolves a Division type to its canonical ID and clears an unavailable selection', async () => {
    await prisma.events.update({ where: { id: id('event') }, data: { registrationByDivisionType: true } });
    const divisionKey = (divisionTypeId: string) => buildDivisionToken({ gender: 'C', ratingType: 'SKILL', divisionTypeId });
    await prisma.divisions.createMany({ data: ['open', 'competitive'].map((divisionTypeId) => ({
      id: id(divisionTypeId), eventId: id('event'), name: divisionTypeId,
      key: divisionKey(divisionTypeId), divisionTypeId, gender: 'C', ratingType: 'SKILL', sportId: 'Volleyball',
    })) });
    expect((await save({ selectedTeamId: id('team'), selectedDivisionId: id('open'), answers: { travel: 'Bus' } })).status).toBe(200);
    expect(await read()).toMatchObject({ draft: { selectedDivisionId: id('open'), selectedDivisionTypeKey: divisionKey('open') } });
    expect((await save({ selectedDivisionTypeKey: divisionKey('competitive') }, 1)).status).toBe(200);
    expect(await read()).toMatchObject({ draft: { selectedDivisionId: id('competitive'), selectedDivisionTypeKey: divisionKey('competitive') } });
    await prisma.divisions.delete({ where: { id: id('competitive') } });
    expect(await read()).toMatchObject({ draft: { selectedDivisionId: null, selectedDivisionTypeKey: null, answers: { travel: 'Bus' } } });
  });

  it('preserves a draft but prevents saves after the Event closes', async () => {
    await save({ selectedTeamId: id('team'), answers: { travel: 'Bus' } });
    await prisma.events.update({ where: { id: id('event') }, data: { start: new Date('2020-01-01') } });
    expect(await read()).toMatchObject({ available: false, draft: { answers: { travel: 'Bus' } } });
    expect((await save({ step: 'checkout' }, 1)).status).toBe(409);
  });

  it('atomically saves a new Team and the next step without registration or payment, including retry', async () => {
    await save({ teamCreationId: id('created'), step: 'team', answers: { travel: 'Bus' } });
    const input = { id: id('created'), name: 'New Crew', sport: 'Volleyball', teamSize: 8, registrationDraft: { eventId: id('event'), baseRevision: 1 } };
    const submit = () => createTeam(new NextRequest('http://localhost/api/teams', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': id('manager') }, body: JSON.stringify(input) }));
    const response = await submit();
    expect({ status: response.status, body: await response.json() }).toMatchObject({ status: 201 });
    const retry = await submit();
    expect(retry.status).toBeLessThan(300);
    expect(await read()).toMatchObject({ draft: { selectedTeamId: id('created'), teamCreationId: id('created'), step: 'players', answers: { travel: 'Bus' }, revision: 2 } });
    expect(await prisma.canonicalTeams.count({ where: { id: id('created') } })).toBe(1);
    expect(await prisma.eventRegistrations.count({ where: { eventId: id('event') } })).toBe(0);
    expect(await prisma.bills.count({ where: { eventId: id('event') } })).toBe(0);
    expect(await prisma.eventRegistrationTeamPreferences.count({ where: { accountId: id('manager') } })).toBe(0);
  });

  it('rolls back Team creation when the related draft save conflicts', async () => {
    await save({ answers: { travel: 'Bus' } });
    const response = await createTeam(new NextRequest('http://localhost/api/teams', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': id('manager') }, body: JSON.stringify({ id: id('failed'), name: 'Unsaved Crew', sport: 'Volleyball', teamSize: 8, registrationDraft: { eventId: id('event'), baseRevision: 0 } }) }));
    expect(response.status).toBe(409);
    expect(await prisma.canonicalTeams.count({ where: { id: id('failed') } })).toBe(0);
    expect(await prisma.teamCreationRequests.count({ where: { teamId: id('failed') } })).toBe(0);
    expect((await read()).draft.answers).toEqual({ travel: 'Bus' });
  });

  it('keeps a saved invitation after delivery failure and updates only the current Event on acceptance', async () => {
    process.env.AUTH_SECRET = 'issue-151-isolated-test-secret';
    await prisma.events.create({ data: { id: id('other-event'), name: 'Other Cup', start: new Date('2035-02-01'), location: 'River City', teamSizeLimit: 8, price: 0, coordinates: [] } });
    for (const event of ['event', 'other-event']) {
      await prisma.teams.create({ data: { id: id(`${event}-team`), eventId: id(event), parentTeamId: id('team'), name: 'Event roster', captainId: id('manager'), managerId: id('manager'), teamSize: 8, playerIds: [], pending: [] } });
    }
    const input = { userId: id('other'), role: 'player', idempotencyKey: 'save-player', eventRegistration: { eventId: id('event') } };
    const submit = () => createPlayer(new NextRequest('http://localhost/api/teams/member-invites', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': id('manager') }, body: JSON.stringify(input) }), { params: Promise.resolve({ id: id('team') }) });
    const first = await submit();
    const body = await first.json();
    expect({ status: first.status, body }).toMatchObject({ status: 201, body: { delivery: { failed: true } } });
    const retry = await submit();
    expect((await retry.json()).invite.id).toBe(body.invite.id);
    expect(body.invite.id).toEqual(expect.any(String));
    expect(await prisma.invites.count({ where: { teamId: id('team') } })).toBe(1);
    expect(await prisma.inviteDeliveries.count({ where: { inviteId: body.invite.id } })).toBe(1);
    expect(await prisma.teamRegistrations.findUnique({ where: { teamId_userId: { teamId: id('team'), userId: id('other') } } })).toMatchObject({ status: 'INVITED' });
    expect(await prisma.teams.findUnique({ where: { id: id('event-team') } })).toMatchObject({ pending: [id('other')], playerIds: [] });
    expect(await prisma.teams.findUnique({ where: { id: id('other-event-team') } })).toMatchObject({ pending: [], playerIds: [] });
    const registration = await prisma.eventRegistrations.findFirst({ where: { eventId: id('event'), registrantId: id('other') } });
    expect(registration).toMatchObject({ status: 'PENDING', acceptedAt: null, consentStatus: null });
    const accepted = await acceptInvite(new NextRequest('http://localhost/api/invites/accept', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': id('other') }, body: '{}' }), { params: Promise.resolve({ id: body.invite.id }) });
    expect(accepted.status).toBe(200);
    expect(await prisma.teams.findUnique({ where: { id: id('event-team') } })).toMatchObject({ pending: [], playerIds: [id('other')] });
    expect(await prisma.teams.findUnique({ where: { id: id('other-event-team') } })).toMatchObject({ pending: [], playerIds: [] });
    expect(await prisma.eventRegistrations.findUnique({ where: { id: registration!.id } })).toMatchObject({ consentStatus: null });
  });

  it('matches the Event sport ID to the Team sport name without admitting another sport', async () => {
    await prisma.sports.create({ data: { id: id('sport'), name: id('Sport name') } });
    await prisma.events.update({ where: { id: id('event') }, data: { sportIds: [id('sport')] } });
    await prisma.canonicalTeams.update({ where: { id: id('team') }, data: { sport: id('Sport name') } });
    await extraTeam('other-sport', 'Soccer');
    expect(await read()).toMatchObject({ selectedTeamId: id('team'), eligibleTeams: [{ id: id('team') }] });
  });

  it('resumes an unfinished Team creation without selecting the remembered Team', async () => {
    await complete('team', 'completed');
    await save({ selectedTeamId: null, teamCreationId: id('new-team'), step: 'team' });
    expect(await read()).toMatchObject({ selectedTeamId: null, selectionSource: null, draft: { teamCreationId: id('new-team'), step: 'team' } });
  });

  it('does not remember an intermediate accepted state when the committed registration still needs payment', async () => {
    await save({ selectedTeamId: id('team'), step: 'billing' });
    await prisma.$transaction(async (tx) => {
      await tx.eventRegistrations.create({ data: { id: id('manual-payment'), eventId: id('event'), registrantType: 'TEAM', registrantId: id('team'), createdBy: id('manager'), status: 'ACTIVE', rosterRole: 'PARTICIPANT', acceptedAt: new Date() } });
      await tx.eventRegistrations.update({ where: { id: id('manual-payment') }, data: { status: 'PENDING' } });
    });
    expect(await prisma.eventRegistrationTeamPreferences.count({ where: { accountId: id('manager') } })).toBe(0);
    expect((await read()).draft.completedAt).toBeNull();
    await prisma.eventRegistrations.update({ where: { id: id('manual-payment') }, data: { status: 'ACTIVE', acceptedAt: new Date() } });
    expect(await prisma.eventRegistrationTeamPreferences.findUnique({ where: { accountId_sport: { accountId: id('manager'), sport: 'volleyball' } } })).toMatchObject({ teamId: id('team') });
    expect((await read()).draft.completedAt).not.toBeNull();
  });
});
