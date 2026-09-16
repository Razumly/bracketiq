/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { PATCH as PATCH_BULK } from '../[eventId]/matches/route';
import { PATCH as PATCH_TERMINAL } from '../[eventId]/matches/terminal/route';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { loadEventWithRelations } from '@/server/repositories/events';
import { sendPushToUsers } from '@/server/pushNotifications';
import { apiRequest } from '@/lib/apiClient';
import { sendTerminalMatch } from '@/lib/terminalMatchClient';
import { createCanonicalReflowFixture, reflowFixtureTime } from '../../../../../test/fixtures/scheduleReflow';

jest.mock('@/lib/permissions', () => ({ requireSession: jest.fn() }));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: jest.fn().mockResolvedValue(null) }));
jest.mock('@/server/realtime/matchRealtime', () => ({ publishEventMatchChanges: jest.fn() }));
jest.mock('@/lib/apiClient', () => ({ ...jest.requireActual('@/lib/apiClient'), apiRequest: jest.fn() }));

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;

databaseTests('terminal Match API', () => {
  const eventIds: string[] = [];
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/bracketiq_e2e_46_563b') {
      throw new Error('Use the isolated issue 46 database.');
    }
  });
  afterEach(async () => {
    jest.clearAllMocks();
    jest.mocked(sendPushToUsers).mockReset().mockResolvedValue({ attempted: false, reason: 'no_tokens',
      recipientCount: 0, tokenCount: 0, successCount: 0, failureCount: 0, prunedTokenCount: 0 });
    for (const eventId of eventIds.splice(0)) {
      await prisma.userNotifications.deleteMany({ where: { data: { path: ['eventId'], equals: eventId } } });
      await prisma.matchOperationReceipts.deleteMany({ where: { eventId } });
      await prisma.matchSegments.deleteMany({ where: { eventId } });
      await prisma.matchIncidents.deleteMany({ where: { eventId } });
      await prisma.eventRegistrations.deleteMany({ where: { eventId } });
      await prisma.matches.deleteMany({ where: { eventId } });
      await prisma.teams.deleteMany({ where: { eventId } });
      await prisma.divisions.deleteMany({ where: { eventId } });
      await prisma.fields.deleteMany({ where: { id: `${eventId}:field` } });
      await prisma.events.deleteMany({ where: { id: eventId } });
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function seed() {
    const fixture = createCanonicalReflowFixture(`terminal-${randomUUID()}`);
    const { event, division, field, teams, first, next } = fixture;
    eventIds.push(event.id);
    jest.mocked(requireSession).mockResolvedValue({ userId: event.hostId, isAdmin: false } as Awaited<ReturnType<typeof requireSession>>);
    await prisma.$transaction(async (tx) => {
      await tx.events.create({ data: {
        id: event.id, name: event.name, eventType: 'TOURNAMENT', hostId: event.hostId,
        start: event.start, end: event.end, scheduleEndConstraint: event.end, noFixedEndDateTime: false,
        automatedScheduling: true, location: 'Harbor Gym', coordinates: [0, 0], teamSizeLimit: 2, price: 0,
        maxParticipants: 4, teamSignup: true, state: 'PUBLISHED', fieldIds: [field.id], timeSlotIds: [],
        winnerBracketPointsToVictory: [], loserBracketPointsToVictory: [], pointsToVictory: [],
        installmentDueDates: [], installmentAmounts: [], requiredTemplateIds: [], restTimeMinutes: 5,
        matchDurationMinutes: 25, doTeamsOfficiate: false, staffingPriority: 'BEST_AVAILABLE_COVERAGE', officialPositions: [],
      } });
      await tx.fields.create({ data: { id: field.id, name: field.name, rentalSlotIds: [] } });
      await tx.divisions.create({ data: { id: division.id, eventId: event.id, name: division.name,
        phase: 'BRACKET', fieldIds: [field.id], teamIds: teams.map((team) => team.id),
        phaseSettings: { BRACKET: { doTeamsOfficiate: false } } } });
      await tx.teams.createMany({ data: teams.map((team) => ({ id: team.id, eventId: event.id, name: team.name,
        captainId: team.captainId, managerId: team.captainId, teamSize: 2, playerIds: [], pending: [], division: division.id })) });
      await tx.eventRegistrations.createMany({ data: teams.map((team) => ({ id: `${team.id}:registration`, eventId: event.id,
        registrantId: team.id, eventTeamId: team.id, registrantType: 'TEAM', status: 'ACTIVE', createdBy: event.hostId })) });
      await tx.matches.createMany({ data: Object.values(event.matches).map((match) => ({ id: match.id, eventId: event.id,
        matchId: match.matchId!, start: match.start, end: match.end, placementState: 'PLACED', fieldId: field.id,
        division: division.id, team1Id: match.id === next.id ? null : match.team1!.id, team2Id: match.team2!.id,
        status: match.id === first.id ? 'IN_PROGRESS' : 'SCHEDULED', actualStart: match.id === first.id ? first.start : null,
        previousLeftId: match.previousLeftMatch?.id, winnerNextMatchId: match.winnerNextMatch?.id,
        team1Points: [], team2Points: [], officialIds: [],
      })) });
    });
    return fixture;
  }

  const patch = (eventId: string, matchId: string, body: unknown) => PATCH_TERMINAL(new NextRequest(
    `http://localhost/api/events/${eventId}/matches/terminal`,
    { method: 'PATCH', body: JSON.stringify({ matchId, update: body }), headers: { 'Content-Type': 'application/json' } },
  ), { params: Promise.resolve({ eventId }) });

  it('commits a forfeit, advancement, and only the affected Reflow changes together', async () => {
    const { event, first, next, final, teams } = await seed();
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.terminalResult?.status).toBe('CHANGED');
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[first.id]!.resultType).toBe('FORFEIT');
    expect(saved.matches[first.id]!.end).toEqual(reflowFixtureTime(25));
    expect(saved.matches[next.id]!.team1?.id).toBe(teams[0]!.id);
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(40));
    expect(saved.matches[final.id]!.start).toEqual(reflowFixtureTime(70));
  });

  it('commits the final segment and normal completion without rewriting the completed placement', async () => {
    const { event, first, next, teams } = await seed();
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      finalize: true, time: reflowFixtureTime(35).toISOString(), segmentOperations: [{
        id: `${first.id}:segment`, sequence: 1, status: 'COMPLETE',
        scores: { [teams[0]!.id]: 25, [teams[1]!.id]: 16 }, winnerEventTeamId: teams[0]!.id,
      }] });
    expect(response.status).toBe(200);
    expect((await response.json()).terminalResult?.status).toBe('CHANGED');
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[first.id]!.status).toBe('COMPLETE');
    expect(saved.matches[first.id]!.actualEnd).toEqual(reflowFixtureTime(35));
    expect(saved.matches[first.id]!.end).toEqual(reflowFixtureTime(25));
    expect(saved.matches[first.id]!.segments[0]!.scores).toEqual({ [teams[0]!.id]: 25, [teams[1]!.id]: 16 });
    expect(saved.matches[next.id]!.team1?.id).toBe(teams[0]!.id);
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(40));
    const second = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      finalize: true, time: reflowFixtureTime(40).toISOString(), segmentOperations: [{
        id: `${first.id}:segment`, sequence: 1, status: 'COMPLETE',
        scores: { [teams[0]!.id]: 16, [teams[1]!.id]: 25 }, winnerEventTeamId: teams[1]!.id,
      }] });
    expect(second.status).toBe(409);
    expect((await loadEventWithRelations(event.id)).matches[first.id]!.segments[0]!.scores)
      .toEqual({ [teams[0]!.id]: 25, [teams[1]!.id]: 16 });
  });

  it('advances an unplayed forfeit before its scheduled start without reserving its Field', async () => {
    const { event, first, next, teams } = await seed();
    await prisma.matches.update({ where: { id: first.id }, data: { status: 'SCHEDULED', actualStart: null } });
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(-5).toISOString() });
    expect(response.status).toBe(200);
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[first.id]!.start).toEqual(reflowFixtureTime(0));
    expect(saved.matches[first.id]!.actualEnd).toEqual(reflowFixtureTime(-5));
    expect(saved.matches[next.id]!.team1?.id).toBe(teams[0]!.id);
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(0));
  });

  it('routes a legacy terminal lifecycle write through the same atomic operation', async () => {
    const { event, first, next, teams } = await seed();
    const response = await patch(event.id, first.id, { clientOperationId: randomUUID(),
      lifecycle: { status: 'COMPLETE', resultType: 'FORFEIT', resultStatus: 'FINAL',
        winnerEventTeamId: teams[0]!.id, actualEnd: reflowFixtureTime(35).toISOString() },
      time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(200);
    expect((await response.json()).terminalResult?.status).toBe('CHANGED');
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[next.id]!.team1?.id).toBe(teams[0]!.id);
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(40));
  });

  it.each(['CANCEL', 'NO_CONTEST'])('%s frees independent capacity without resolving bracket descendants', async (action) => {
    const { event, first, next, final, field, division, teams } = await seed();
    await prisma.matches.update({ where: { id: first.id }, data: { end: reflowFixtureTime(60) } });
    await prisma.matches.update({ where: { id: next.id }, data: { start: reflowFixtureTime(65), end: reflowFixtureTime(90) } });
    await prisma.matches.update({ where: { id: final.id }, data: { start: reflowFixtureTime(95), end: reflowFixtureTime(120) } });
    const independentId = `${event.id}:independent`;
    await prisma.matches.create({ data: { id: independentId, eventId: event.id, matchId: 4,
      start: reflowFixtureTime(125), end: reflowFixtureTime(150), placementState: 'PLACED', fieldId: field.id,
      division: division.id, team1Id: teams[2]!.id, team2Id: teams[3]!.id, status: 'SCHEDULED',
      team1Points: [], team2Points: [], officialIds: [],
    } });
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action }, time: reflowFixtureTime(15).toISOString() });
    expect(response.status).toBe(200);
    expect((await response.json()).terminalResult?.status).toBe('CHANGED');
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[first.id]!.winnerEventTeamId).toBeNull();
    expect(saved.matches[next.id]!.team1).toBeNull();
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(65));
    expect(saved.matches[final.id]!.start).toEqual(reflowFixtureTime(95));
    expect(saved.matches[independentId]!.start).toEqual(reflowFixtureTime(15));
  });

  it('returns one changed result and one typed replay for concurrent copies of the same operation', async () => {
    const { event, first, teams } = await seed();
    const body = { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() };
    const responses = await Promise.all([patch(event.id, first.id, body), patch(event.id, first.id, body)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(results.map((result) => result.terminalResult?.status).sort()).toEqual(['CHANGED', 'REPLAYED']);
    const replay = results.find((result) => result.terminalResult.status === 'REPLAYED')!.terminalResult;
    expect(replay.matches).toEqual([]);
    expect(replay.placementChanges).toEqual([]);
    expect(replay.assignmentChanges).toEqual([]);
  });

  it('rolls back result and advancement on infeasibility, then permits the same operation after repair', async () => {
    const { event, first, next, teams } = await seed();
    await prisma.matches.update({ where: { id: next.id }, data: { locked: true } });
    const body = { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() };
    const failed = await patch(event.id, first.id, body);
    expect(failed.status).toBe(409);
    expect((await failed.json()).code).toBe('TERMINAL_REFLOW_INFEASIBLE');
    const unchanged = await loadEventWithRelations(event.id);
    expect(unchanged.matches[first.id]!.status).toBe('IN_PROGRESS');
    expect(unchanged.matches[first.id]!.winnerEventTeamId).toBeNull();
    expect(unchanged.matches[next.id]!.team1).toBeNull();
    expect(unchanged.matches[next.id]!.start).toEqual(reflowFixtureTime(30));
    await prisma.matches.update({ where: { id: next.id }, data: { locked: false } });
    const retried = await patch(event.id, first.id, body);
    expect(retried.status).toBe(200);
    expect((await retried.json()).terminalResult.status).toBe('CHANGED');
  });

  it('saves the result and advancement with no Reflow when Automated Scheduling is disabled', async () => {
    const { event, first, next, teams } = await seed();
    await prisma.events.update({ where: { id: event.id }, data: { automatedScheduling: false } });
    await prisma.matches.update({ where: { id: next.id }, data: { locked: true } });
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(200);
    const result = (await response.json()).terminalResult;
    expect(result.exploredStates).toBe(0);
    expect(result.placementChanges).toEqual([]);
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[next.id]!.team1?.id).toBe(teams[0]!.id);
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(30));
    expect(saved.end).toEqual(event.end);
  });

  it('rolls back advancement into a Match that has started even when automation is disabled', async () => {
    const { event, first, next, teams } = await seed();
    await prisma.events.update({ where: { id: event.id }, data: { automatedScheduling: false } });
    await prisma.matches.update({ where: { id: next.id }, data: {
      team1Id: teams[1]!.id, status: 'IN_PROGRESS', actualStart: reflowFixtureTime(30),
    } });
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('TERMINAL_DEPENDENCY_STARTED');
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[first.id]!.status).toBe('IN_PROGRESS');
    expect(saved.matches[next.id]!.team1?.id).toBe(teams[1]!.id);
  });

  it('keeps a schedule-set Event end when Reflow does not move the latest scheduled end', async () => {
    const { event, first, next, final, teams } = await seed();
    await prisma.events.update({ where: { id: event.id }, data: {
      noFixedEndDateTime: true, end: reflowFixtureTime(180), generatedScheduleEnd: reflowFixtureTime(180),
    } });
    await prisma.matches.update({ where: { id: next.id }, data: { winnerNextMatchId: null } });
    await prisma.matches.update({ where: { id: final.id }, data: {
      previousLeftId: null, start: reflowFixtureTime(150), end: reflowFixtureTime(175), locked: true,
    } });
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(200);
    const saved = await loadEventWithRelations(event.id);
    expect(saved.matches[next.id]!.start).toEqual(reflowFixtureTime(40));
    expect(saved.matches[final.id]!.end).toEqual(reflowFixtureTime(175));
    expect(saved.end).toEqual(reflowFixtureTime(180));
    expect(saved.generatedScheduleEnd).toEqual(reflowFixtureTime(180));
  });

  it('retries a site terminal action with its original identity and payload after a lost response', async () => {
    const { event, first, teams } = await seed();
    const requests: unknown[] = [];
    jest.mocked(apiRequest).mockImplementation(async (_path, options) => {
      const command = options?.body as { matchId: string; update: Record<string, unknown> };
      expect(command.matchId).toBe(first.id);
      requests.push(command.update);
      const response = await patch(event.id, first.id, command.update);
      expect(response.status).toBe(200);
      if (requests.length === 1) throw new Error('Response lost after commit');
      return response.json();
    });
    const payload = { matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id },
      time: reflowFixtureTime(35).toISOString() };
    await expect(sendTerminalMatch(event.id, first.id, payload)).rejects.toThrow('Response lost');
    const result = await sendTerminalMatch(event.id, first.id, { ...payload, time: reflowFixtureTime(36).toISOString() });
    expect(result).toMatchObject({ terminalResult: { status: 'REPLAYED' } });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0]).toMatchObject({ terminalContractVersion: 1, clientOperationId: expect.any(String) });
  });

  it('requires a stable operation identity for every terminal request', async () => {
    const { event, first } = await seed();
    const response = await patch(event.id, first.id, { matchAction: { action: 'CANCEL' },
      time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(400);
    expect((await prisma.matches.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('IN_PROGRESS');
  });

  it('rejects a terminal bulk transition that would bypass atomic Reflow', async () => {
    const { event, first } = await seed();
    const response = await PATCH_BULK(new NextRequest(`http://localhost/api/events/${event.id}/matches`, {
      method: 'PATCH', body: JSON.stringify({ matches: [{ id: first.id, status: 'CANCELLED', resultType: 'NO_CONTEST' }] }),
    }), { params: Promise.resolve({ eventId: event.id }) });
    expect(response.status).toBe(409);
    expect((await prisma.matches.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('IN_PROGRESS');
  });

  it('rejects a terminal time before actual start and preserves the Schedule', async () => {
    const { event, first } = await seed();
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'CANCEL' }, time: reflowFixtureTime(-1).toISOString() });
    expect(response.status).toBe(400);
    expect((await prisma.matches.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('IN_PROGRESS');
  });

  it('rejects a forfeiting Team outside the Match without changing its result', async () => {
    const { event, first, teams } = await seed();
    const response = await patch(event.id, first.id, { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[2]!.id }, time: reflowFixtureTime(35).toISOString() });
    expect(response.status).toBe(400);
    expect((await prisma.matches.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('IN_PROGRESS');
  });

  it('notifies affected participants after commit with old and new values and does not notify on replay', async () => {
    const { event, first, next, teams } = await seed();
    jest.mocked(sendPushToUsers).mockImplementation(async () => {
      const visible = await loadEventWithRelations(event.id);
      expect(visible.matches[first.id]!.status).toBe('COMPLETE');
      expect(visible.matches[next.id]!.start).toEqual(reflowFixtureTime(40));
      throw new Error('Push provider unavailable');
    });
    const body = { terminalContractVersion: 1, clientOperationId: randomUUID(),
      matchAction: { action: 'FORFEIT', forfeitingEventTeamId: teams[1]!.id }, time: reflowFixtureTime(35).toISOString() };
    expect((await patch(event.id, first.id, body)).status).toBe(200);
    expect(sendPushToUsers).toHaveBeenCalledWith(expect.objectContaining({
      userIds: expect.arrayContaining([teams[0]!.captainId, teams[2]!.captainId]),
      data: expect.objectContaining({ changes: expect.arrayContaining([expect.objectContaining({ matchId: next.id,
        before: expect.objectContaining({ start: reflowFixtureTime(30).toISOString() }),
        after: expect.objectContaining({ start: reflowFixtureTime(40).toISOString() }),
      })]) }),
    }));
    const durable = await prisma.userNotifications.findMany({ where: {
      id: { startsWith: `terminal:${body.clientOperationId}:` },
    } });
    expect(durable.map((entry) => entry.userId)).toEqual(expect.arrayContaining([teams[0]!.captainId, teams[2]!.captainId]));
    expect(durable[0]?.data).toMatchObject({ eventId: event.id, changes: expect.arrayContaining([
      expect.objectContaining({ matchId: next.id, before: expect.objectContaining({ start: reflowFixtureTime(30).toISOString() }),
        after: expect.objectContaining({ start: reflowFixtureTime(40).toISOString() }) }),
    ]) });
    const deliveries = jest.mocked(sendPushToUsers).mock.calls.length;
    expect((await patch(event.id, first.id, body)).status).toBe(200);
    expect(jest.mocked(sendPushToUsers).mock.calls).toHaveLength(deliveries);
  });
});
