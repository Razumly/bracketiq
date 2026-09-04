/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { loadEventScheduleState } from '@/server/events/eventEditorSnapshot';
import { reflowEventSchedule } from '../eventReflow';
import { createCanonicalReflowFixture, reflowFixtureTime } from '../../../../../test/fixtures/scheduleReflow';
import type { ScheduleReflowRequest } from '@/contracts/scheduleReflow';

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;

databaseTests('atomic Reflow database operation', () => {
  const fixtureIds: string[] = [];
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/bracketiq_e2e_45_[a-z0-9_]+$/.test(url.pathname)) {
      throw new Error('Use an isolated local issue 45 database.');
    }
  });
  afterEach(async () => {
    for (const eventId of fixtureIds.splice(0)) {
      await prisma.teamCheckIns.deleteMany({ where: { eventId } });
      await prisma.eventRegistrations.deleteMany({ where: { eventId } });
      await prisma.matches.deleteMany({ where: { eventId } });
      await prisma.teams.deleteMany({ where: { eventId } });
      await prisma.divisions.deleteMany({ where: { eventId } });
      await prisma.fields.deleteMany({ where: { id: { in: [`${eventId}:field`, `${eventId}:field-2`] } } });
      await prisma.events.deleteMany({ where: { id: eventId } });
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function seed(assignmentOnly = false) {
    const fixture = createCanonicalReflowFixture(`issue-45-${randomUUID()}`, assignmentOnly);
    const { event, division, field, teams } = fixture;
    fixtureIds.push(event.id);
    await prisma.$transaction(async (tx) => {
      await tx.events.create({ data: { id: event.id, name: event.name, eventType: 'TOURNAMENT', hostId: event.hostId,
        start: event.start, end: event.end, scheduleEndConstraint: event.end, noFixedEndDateTime: false,
        location: 'Harbor Gym', coordinates: [0, 0], teamSizeLimit: 2, price: 0, maxParticipants: 4,
        teamSignup: true, state: 'PUBLISHED', fieldIds: [field.id], timeSlotIds: [],
        winnerBracketPointsToVictory: [], loserBracketPointsToVictory: [], pointsToVictory: [],
        installmentDueDates: [], installmentAmounts: [], requiredTemplateIds: [],
        restTimeMinutes: 5, matchDurationMinutes: 25, doTeamsOfficiate: assignmentOnly,
        staffingPriority: event.staffingPriority, officialPositions: [], teamCheckInMode: 'EVENT',
      } });
      await tx.fields.create({ data: { id: field.id, name: field.name, rentalSlotIds: [] } });
      await tx.divisions.create({ data: { id: division.id, eventId: event.id, name: division.name,
        phase: 'BRACKET', fieldIds: [field.id], teamIds: teams.map((team) => team.id),
        phaseSettings: { BRACKET: { doTeamsOfficiate: assignmentOnly } },
      } });
      await tx.teams.createMany({ data: teams.map((team) => ({ id: team.id, eventId: event.id, name: team.name,
        captainId: team.captainId, managerId: team.captainId, teamSize: 2, playerIds: [], pending: [], division: division.id })) });
      await tx.eventRegistrations.createMany({ data: teams.map((team) => ({ id: `${team.id}:registration`, eventId: event.id,
        registrantId: team.id, eventTeamId: team.id, registrantType: 'TEAM', status: 'ACTIVE', createdBy: event.hostId })) });
      await tx.matches.createMany({ data: Object.values(event.matches).map((match) => ({ id: match.id, eventId: event.id,
        matchId: match.matchId!, start: match.start, end: match.end, actualEnd: match.actualEnd,
        placementState: 'PLACED', fieldId: field.id, division: division.id, team1Id: match.team1!.id, team2Id: match.team2!.id,
        status: match.status, resultStatus: match.resultStatus, winnerEventTeamId: match.winnerEventTeamId,
        previousLeftId: match.previousLeftMatch?.id, winnerNextMatchId: match.winnerNextMatch?.id,
        team1Points: [], team2Points: [], officialIds: [], teamOfficialId: match.teamOfficial?.id,
      })) });
      if (assignmentOnly) await tx.teamCheckIns.create({ data: { id: `${event.id}:checkin`, eventId: event.id,
        checkInKey: `${event.id}:event:${teams[3]!.id}`,
        checkedInAt: reflowFixtureTime(0),
        eventTeamId: teams[3]!.id, scope: 'EVENT', status: 'CHECKED_IN', checkedInByUserId: event.hostId,
      } });
    });
    const row = await prisma.events.findUniqueOrThrow({ where: { id: event.id } });
    const state = await loadEventScheduleState(row, event.id, prisma);
    const request: ScheduleReflowRequest = { contractVersion: 1, eventId: event.id,
      changedMatchIds: [assignmentOnly ? fixture.next.id : fixture.first.id],
      expectedScheduleRevision: state.revision, fieldPolicy: 'KEEP_ASSIGNED_FIELDS' };
    const input = { request, actor: { userId: event.hostId, isAdmin: false }, now: reflowFixtureTime(assignmentOnly ? 25 : 35) };
    return { ...fixture, input };
  }

  it('saves a dependent chain and then rejects a concurrent stale request', async () => {
    const { event, input, first } = await seed();
    const before = await prisma.matches.findUniqueOrThrow({ where: { id: first.id } });
    const responses = await Promise.all([1, 2].map(() => prisma.$transaction((tx) => reflowEventSchedule({ tx, ...input }))));
    expect(responses.map((result) => result.status).sort()).toEqual(['CHANGED', 'STALE']);
    const changed = responses.find((result) => result.status === 'CHANGED')!;
    expect(changed.placementChanges).toHaveLength(2);
    expect(await prisma.matches.findUnique({ where: { id: first.id } })).toEqual(before);
    const persisted = await prisma.events.findUniqueOrThrow({ where: { id: event.id } });
    expect((await loadEventScheduleState(persisted, event.id, prisma)).revision).toBe(changed.scheduleRevision);
  });

  it('rolls back all placements if a later Match update fails', async () => {
    const { event, input } = await seed();
    const before = await prisma.matches.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } });
    let writes = 0;
    const failing = prisma.$extends({ query: { matches: { async update({ args, query }) {
      const result = await query(args);
      writes += 1;
      if (writes === 2) throw new Error('injected second Match failure');
      return result;
    } } } });
    await expect(failing.$transaction((tx) => reflowEventSchedule({ tx, ...input }))).rejects.toThrow('injected second Match failure');
    expect(writes).toBe(2);
    expect(await prisma.matches.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('saves an assignment-only repair without changing times or the protected Match', async () => {
    const { event, input, next, first, teams } = await seed(true);
    const before = await prisma.matches.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } });
    const result = await prisma.$transaction((tx) => reflowEventSchedule({ tx, ...input }));
    expect(result.status).toBe('CHANGED');
    expect(result.placementChanges).toEqual([]);
    expect(result.assignmentChanges).toHaveLength(1);
    const after = await prisma.matches.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } });
    expect(after.find((match) => match.id === next.id)?.teamOfficialId).toBe(teams[3]!.id);
    expect(after.map((match) => [match.start, match.end])).toEqual(before.map((match) => [match.start, match.end]));
    expect(after.find((match) => match.id === first.id)).toEqual(before.find((match) => match.id === first.id));
  });

  it('rejects an unauthorized actor and an infeasible repair without changing stored rows', async () => {
    const { event, input, next } = await seed();
    await prisma.matches.update({ where: { id: next.id }, data: { locked: true } });
    const row = await prisma.events.findUniqueOrThrow({ where: { id: event.id } });
    input.request.expectedScheduleRevision = (await loadEventScheduleState(row, event.id, prisma)).revision;
    const before = await prisma.matches.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } });
    await expect(prisma.$transaction((tx) => reflowEventSchedule({ tx, ...input,
      actor: { userId: 'unrelated-user', isAdmin: false } }))).rejects.toThrow('not authorized');
    expect((await prisma.$transaction((tx) => reflowEventSchedule({ tx, ...input }))).status).toBe('INFEASIBLE');
    expect(await prisma.matches.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('retains historical Resources in the graph without offering them for new placements', async () => {
    const { event, input, first, division } = await seed();
    const fieldId = `${event.id}:field-2`;
    await prisma.fields.create({ data: { id: fieldId, name: 'Court 2', rentalSlotIds: [] } });
    await prisma.divisions.update({ where: { id: division.id }, data: { fieldIds: [fieldId] } });
    const row = await prisma.events.update({ where: { id: event.id }, data: { fieldIds: [fieldId] } });
    input.request.expectedScheduleRevision = (await loadEventScheduleState(row, event.id, prisma)).revision;
    input.request.fieldPolicy = 'ALLOW_ELIGIBLE_FIELD_CHANGES';
    const protectedBefore = await prisma.matches.findUniqueOrThrow({ where: { id: first.id } });
    const result = await prisma.$transaction((tx) => reflowEventSchedule({ tx, ...input }));
    expect(result.status).toBe('CHANGED');
    expect(result.placementChanges).toHaveLength(2);
    expect(result.placementChanges.every((change) => change.after.fieldId === fieldId)).toBe(true);
    expect(result.graph?.matches.find((match) => match.id === first.id)?.fieldId).toBe(`${event.id}:field`);
    expect(await prisma.matches.findUnique({ where: { id: first.id } })).toEqual(protectedBefore);
  });
});
