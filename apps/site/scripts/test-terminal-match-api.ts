// Pass mobile requests through the real site route in an isolated database.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { NextRequest } from 'next/server';
import { createCanonicalReflowFixture } from '../test/fixtures/scheduleReflow';

async function main() {
  if (process.env.RUN_DATABASE_INTEGRATION !== '1') throw new Error('Enable the isolated database integration test.');
  const local = parse(readFileSync('.env.local'));
  const url = new URL(local.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5543') throw new Error('Use the local issue database server.');
  url.pathname = '/bracketiq_e2e_46_563b';
  process.env.DATABASE_URL = url.toString();
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  process.env.REDIS_URL = '';
  const { prisma } = await import('../src/lib/prisma');
  const { serializeMatches } = await import('../src/server/scheduler/serialize');
  const { loadEventWithRelations } = await import('../src/server/repositories/events');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const command = JSON.parse(input) as { action: string; eventId: string; matchId?: string; body?: unknown };
  if (!/^terminal-mobile-[a-f0-9-]{36}$/.test(command.eventId)) throw new Error('Use a unique terminal mobile fixture ID.');
  const fixture = createCanonicalReflowFixture(command.eventId);
  const { event, teams, field, division, first, next } = fixture;
  try {
    if (command.action === 'seed') {
      await prisma.$transaction(async (tx) => {
        await tx.authUser.create({ data: { id: event.hostId, email: `${event.id}@example.test`,
          passwordHash: 'unused-fixture-password', emailVerifiedAt: new Date() } });
        await tx.events.create({ data: {
          id: event.id, name: event.name, hostId: event.hostId, eventType: 'TOURNAMENT',
          start: event.start, end: fixture.final.end, generatedScheduleEnd: fixture.final.end,
          noFixedEndDateTime: true, automatedScheduling: true, state: 'PUBLISHED',
          location: 'Harbor Gym', coordinates: [0, 0], teamSizeLimit: 2, price: 0, maxParticipants: 4,
          teamSignup: true, fieldIds: [field.id], timeSlotIds: [], winnerBracketPointsToVictory: [],
          loserBracketPointsToVictory: [], pointsToVictory: [], installmentDueDates: [], installmentAmounts: [],
          requiredTemplateIds: [], restTimeMinutes: 5, matchDurationMinutes: 25, doTeamsOfficiate: false,
          staffingPriority: 'BEST_AVAILABLE_COVERAGE', officialPositions: [],
        } });
        await tx.fields.create({ data: { id: field.id, name: field.name, rentalSlotIds: [] } });
        await tx.divisions.create({ data: { id: division.id, eventId: event.id, name: division.name, phase: 'BRACKET',
          fieldIds: [field.id], teamIds: teams.map((team) => team.id), phaseSettings: { BRACKET: { doTeamsOfficiate: false } } } });
        await tx.teams.createMany({ data: teams.map((team) => ({ id: team.id, eventId: event.id, name: team.name,
          captainId: team.captainId, managerId: team.captainId, teamSize: 2, playerIds: [], pending: [], division: division.id })) });
        await tx.eventRegistrations.createMany({ data: teams.map((team) => ({ id: `${team.id}:registration`, eventId: event.id,
          registrantId: team.id, eventTeamId: team.id, registrantType: 'TEAM', status: 'ACTIVE', createdBy: event.hostId })) });
        await tx.matches.createMany({ data: Object.values(event.matches).map((match) => ({
          id: match.id, eventId: event.id, matchId: match.matchId!, start: match.start, end: match.end,
          placementState: 'PLACED', fieldId: field.id, division: division.id,
          team1Id: match.id === next.id ? null : match.team1!.id, team2Id: match.team2!.id,
          status: match.id === first.id ? 'IN_PROGRESS' : 'SCHEDULED', actualStart: match.id === first.id ? first.start : null,
          previousLeftId: match.previousLeftMatch?.id, winnerNextMatchId: match.winnerNextMatch?.id,
          team1Points: [], team2Points: [], officialIds: [],
        })) });
      });
      const loaded = await loadEventWithRelations(event.id);
      process.stdout.write(JSON.stringify({ status: 200, body: { event: { id: event.id, end: loaded.end.toISOString() },
        matches: serializeMatches(Object.values(loaded.matches)) } }));
    } else if (command.action === 'patch') {
      if (!Object.prototype.hasOwnProperty.call(event.matches, command.matchId ?? '')) throw new Error('Use a fixture Match.');
      const { signSessionToken } = await import('../src/lib/authServer');
      const { PATCH } = await import('../src/app/api/events/[eventId]/matches/terminal/route');
      const token = signSessionToken({ userId: event.hostId, isAdmin: false, sessionVersion: 0, device: 'mobile' });
      const request = new NextRequest(`http://localhost/api/events/${event.id}/matches/terminal`, {
        method: 'PATCH', body: JSON.stringify({ matchId: command.matchId, update: command.body }),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const response = await PATCH(request, { params: Promise.resolve({ eventId: event.id }) });
      const text = await response.text();
      process.stdout.write(JSON.stringify({ status: response.status, body: text }));
    } else if (command.action === 'cleanup') {
      await prisma.$transaction(async (tx) => {
        await tx.userNotifications.deleteMany({ where: { data: { path: ['eventId'], equals: event.id } } });
        await tx.matchOperationReceipts.deleteMany({ where: { eventId: event.id } });
        await tx.matchSegments.deleteMany({ where: { eventId: event.id } });
        await tx.matchIncidents.deleteMany({ where: { eventId: event.id } });
        await tx.eventRegistrations.deleteMany({ where: { eventId: event.id } });
        await tx.matches.deleteMany({ where: { eventId: event.id } });
        await tx.teams.deleteMany({ where: { eventId: event.id } });
        await tx.divisions.deleteMany({ where: { eventId: event.id } });
        await tx.fields.deleteMany({ where: { id: field.id } });
        await tx.events.deleteMany({ where: { id: event.id } });
        await tx.authUser.deleteMany({ where: { id: event.hostId } });
      });
      process.stdout.write(JSON.stringify({ status: 200 }));
    } else throw new Error('Unknown terminal fixture command.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
