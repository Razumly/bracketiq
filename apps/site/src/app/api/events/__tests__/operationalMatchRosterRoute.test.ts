/** @jest-environment node */
import { NextRequest } from 'next/server';
const db = {
  events: { findUnique: jest.fn() }, matches: { findFirst: jest.fn() },
  teams: { findMany: jest.fn(), findUnique: jest.fn() }, eventTeamStaffAssignments: { findFirst: jest.fn() },
  eventOfficials: { findFirst: jest.fn() }, eventRegistrations: { findMany: jest.fn(), findFirst: jest.fn() },
  matchRosterEntries: { findMany: jest.fn() }, templateDocuments: { findMany: jest.fn() },
  userData: { findMany: jest.fn() }, userProfileMerges: { findMany: jest.fn() },
  documentSubjects: { findMany: jest.fn() }, documentRequirementSatisfactions: { findMany: jest.fn() },
  signedDocuments: { findMany: jest.fn() },
};
const session = jest.fn();
const manage = jest.fn();
jest.mock('@/lib/prisma', () => ({ prisma: db }));
jest.mock('@/lib/permissions', () => ({ requireSession: session }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => manage(...args) }));
import { GET } from '@/app/api/events/[eventId]/matches/[matchId]/roster/route';
const read = () => GET(new NextRequest('http://localhost/api/events/event/matches/match/roster'),
  { params: Promise.resolve({ eventId: 'event', matchId: 'match' }) });
const evidence = { documentSubjectId: 'original-subject', templateDocumentId: 'version',
  scopeType: 'EVENT_PARTICIPATION', scopeId: 'event', sourceEvidenceId: 'evidence', completedSignerRoles: ['participant'] };
beforeEach(() => {
  jest.resetAllMocks();
  session.mockResolvedValue({ userId: 'official', isAdmin: false });
  manage.mockResolvedValue(false);
  db.events.findUnique.mockResolvedValue({ id: 'event', organizationId: 'org', start: new Date('2026-08-01'),
    requiredTemplateIds: ['version'], hostId: 'host', assistantHostIds: [], teamSignup: true,
    allowMatchRosterEdits: true, allowTemporaryMatchPlayers: true });
  db.matches.findFirst.mockResolvedValue({ id: 'match', team1Id: 'team1', team2Id: 'team2', officialId: 'official', officialIds: [], teamOfficialId: null });
  db.teams.findUnique.mockResolvedValue(null);
  db.teams.findMany.mockResolvedValue([
    { id: 'team1', name: 'River Crew', playerIds: ['accepted'], pending: ['managed'] },
    { id: 'team2', name: 'Summit United', playerIds: [], pending: ['opponent'] },
  ]);
  db.eventOfficials.findFirst.mockResolvedValue({ id: 'official-record' });
  db.eventRegistrations.findMany.mockResolvedValue([]);
  db.matchRosterEntries.findMany.mockResolvedValue([]);
  db.templateDocuments.findMany.mockResolvedValue([{ id: 'version', title: 'Waiver', type: 'TEXT', signOnce: false, requiredSignerType: 'PARTICIPANT' }]);
  db.userData.findMany.mockImplementation(async ({ where }) => where.id.in.map((id: string) => ({ id,
    firstName: id, lastName: 'Player', userName: id, dateOfBirth: new Date('2000-01-01') })));
  db.userProfileMerges.findMany.mockResolvedValue([]);
  db.documentSubjects.findMany.mockResolvedValue([{ organizationId: 'org', id: 'original-subject', userId: 'managed' }]);
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
  db.signedDocuments.findMany.mockResolvedValue([{ id: 'evidence', signedAt: '2026-07-01', status: 'SIGNED' }]);
});
it('shows complete assigned-work rosters without Accounts or individual registrations', async () => {
  const response = await read(); const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.rosters.map((row: any) => row.entries.map((entry: any) => entry.userId))).toEqual([['accepted', 'managed'], ['opponent']]);
  expect(body.rosters[0].entries[1].documentReadiness.documents).toEqual({ signedCount: 0, requiredCount: 1 });
  expect(body.rosters.every((row: any) => row.canEdit === false)).toBe(true);
  expect(JSON.stringify(body)).not.toMatch(/invitation|delivery|payment|registrationAnswers/);
  expect(db.teams.findMany).toHaveBeenCalledTimes(1);
  expect(db.userData.findMany).toHaveBeenCalledTimes(1);
});
it.each(['member', 'unrelated-official'])('denies private identities to %s', async (userId) => {
  session.mockResolvedValue({ userId, isAdmin: false });
  const response = await read(); expect(response.status).toBe(403);
  expect(db.userData.findMany).not.toHaveBeenCalled();
});
it('limits a Team manager to their own match roster', async () => {
  session.mockResolvedValue({ userId: 'manager', isAdmin: false });
  db.teams.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, managerId: where.id === 'team1' ? 'manager' : 'other', coachIds: [] }));
  const body = await (await read()).json();
  expect(body.rosters).toHaveLength(1); expect(body.rosters[0].eventTeamId).toBe('team1');
});
it('retains a valid completion under a stored Subject ID after profile claim', async () => {
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([evidence]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents.signedCount).toBe(1);
  expect(body.rosters[1].entries[0].documentReadiness.documents.signedCount).toBe(0);
});
it('retains evidence attached to a confirmed merged source profile', async () => {
  db.userProfileMerges.findMany.mockResolvedValueOnce([{ sourceProfileId: 'source', primaryProfileId: 'managed' }]).mockResolvedValue([]);
  db.documentSubjects.findMany.mockResolvedValue([{ organizationId: 'org', id: 'original-subject', userId: 'source' }]);
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([evidence]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents.signedCount).toBe(1);
});
it.each([
  { documentSubjectId: 'sibling-subject' }, { templateDocumentId: 'old-version' },
  { scopeId: 'other-event' }, { scopeType: 'TEAM_MEMBERSHIP', scopeId: 'team1' },
  { completedSignerRoles: ['parent_guardian'] },
])('does not count mismatched evidence %j', async (change) => {
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([{ ...evidence, ...change }]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents.signedCount).toBe(0);
});
it('does not count void evidence or trust a completion flag alone', async () => {
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([evidence]);
  db.signedDocuments.findMany.mockResolvedValue([{ id: 'evidence', status: 'VOIDED' }]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents.signedCount).toBe(0);
  expect(db.documentRequirementSatisfactions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ invalidatedAt: null }) }));
});

it('shows guardian requirements for a Managed Player with an unknown birth date', async () => {
  db.userData.findMany.mockResolvedValue([{ id: 'accepted', userName: 'accepted', dateOfBirth: new Date(0) },
    { id: 'managed', userName: 'managed', dateOfBirth: new Date(0) }, { id: 'opponent', userName: 'opponent', dateOfBirth: new Date(0) }]);
  db.templateDocuments.findMany.mockResolvedValue([{ id: 'version', title: 'Consent', type: 'TEXT', requiredSignerType: 'PARENT_GUARDIAN' }]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents).toEqual({ signedCount: 0, requiredCount: 1 });
});
it.each(['userData', 'templateDocuments'])('reports incomplete data instead of hiding missing requirements: %s', async (delegate) => {
  db[delegate as 'userData' | 'templateDocuments'].findMany.mockResolvedValue([]);
  expect((await read()).status).toBe(409);
});

it('keeps merged evidence on the current profile when history also references its source', async () => {
  db.userProfileMerges.findMany.mockResolvedValueOnce([{ sourceProfileId: 'source', primaryProfileId: 'managed' }]).mockResolvedValue([]);
  db.documentSubjects.findMany.mockResolvedValue([{ organizationId: 'org', id: 'original-subject', userId: 'source' }]);
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([evidence]);
  db.matchRosterEntries.findMany.mockResolvedValue([{ id: 'history', eventTeamId: 'team1', source: 'TEMPORARY', status: 'ACTIVE', userId: 'source' }]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries.find((entry: any) => entry.userId === 'managed').documentReadiness.documents.signedCount).toBe(1);
});

it('reads new signing evidence after a merge retains the original stored Subject ID', async () => {
  db.documentSubjects.findMany.mockResolvedValue([{ organizationId: 'org', id: 'original-subject', userId: 'managed' }]);
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([{ ...evidence, documentSubjectId: 'document-subject:org:managed' }]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents.signedCount).toBe(1);
});
it('uses off-roster stored Subject ownership instead of assuming ownership from an ID', async () => {
  db.documentSubjects.findMany.mockResolvedValue([{ organizationId: 'org', id: 'document-subject:org:managed', userId: 'off-roster-owner' }]);
  db.documentRequirementSatisfactions.findMany.mockResolvedValue([{ ...evidence, documentSubjectId: 'document-subject:org:managed' }]);
  const body = await (await read()).json();
  expect(body.rosters[0].entries[1].documentReadiness.documents.signedCount).toBe(0);
  expect(db.documentSubjects.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { OR: expect.arrayContaining([
      { id: { in: expect.arrayContaining(['document-subject:org:managed']) } },
    ]) },
  }));
});
