import { mkdir, writeFile } from 'node:fs/promises';
import { signSessionToken } from '../src/lib/authServer';
import { buildEventDivisionId } from '../src/lib/divisionTypes';
import { prisma } from '../src/lib/prisma';
import { upsertEventFromPayload } from '../src/server/repositories/events';
import { persistCreateOnlyMatchGraph } from '../src/server/scheduler/eventScheduleMutation';

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(database.hostname)
    || !database.pathname.startsWith('/bracketiq_e2e_48_')) {
    throw new Error('Use an isolated local issue 48 database.');
  }
  const userId = 'issue-48-host';
  const organizationId = 'issue-48-organization';
  const eventTypes = ['EVENT', 'WEEKLY_EVENT', 'LEAGUE', 'TOURNAMENT', 'TRYOUT'] as const;
  const fixtureRun = Date.now().toString(36);
  const eventIds = eventTypes.map((type) => `issue-48-${fixtureRun}-${type.toLowerCase()}`);
  await prisma.$transaction(async (tx) => {
    await tx.authUser.upsert({
      where: { id: userId }, update: {},
      create: { id: userId, email: 'issue-48-host@example.test', passwordHash: 'unused-test-password', emailVerifiedAt: new Date() },
    });
    await tx.userData.upsert({
      where: { id: userId }, update: {},
      create: {
        id: userId, userName: 'issue48host', firstName: 'Test', lastName: 'Host',
        dateOfBirth: new Date('1990-01-01'), friendIds: [], followingIds: [],
        friendRequestIds: [], friendRequestSentIds: [], uploadedImages: [],
      },
    });
    await tx.organizations.upsert({
      where: { id: organizationId }, update: {},
      create: {
        id: organizationId, name: 'Issue 48 Club', ownerId: userId,
        enabledFeatures: ['EVENT_MANAGEMENT', 'CLUB_TEAMS'],
        originType: 'FIRST_PARTY', ownershipStatus: 'CLAIMED',
        claimVerificationLevel: 'MANUAL_REVIEW', ownershipVerifiedAt: new Date(),
      },
    });
    const clubDivisionId = 'issue-48-club-division';
    await tx.divisions.upsert({
      where: { id: clubDivisionId }, update: {},
      create: { id: clubDivisionId, name: 'Club Open', organizationId, scope: 'ORGANIZATION' },
    });
    for (const [index, eventType] of eventTypes.entries()) {
      const id = eventIds[index];
      const fieldId = `${id}-court`;
      const slotId = `${id}-slot`;
      const divisionId = buildEventDivisionId(id, 'open');
      const competition = eventType === 'LEAGUE' || eventType === 'TOURNAMENT';
      if (eventType === 'TRYOUT') {
        await tx.fields.create({ data: {
          id: fieldId, name: 'Court 1', location: 'Issue 48 Gym',
          organizationId, createdBy: userId, rentalSlotIds: [],
        } });
      }
      await upsertEventFromPayload({
        id, name: `Issue 48 ${eventType}`, eventType, hostId: userId, organizationId,
        affiliateUrl: 'https://organizer.example/register',
        start: '2027-01-04T08:00:00Z', end: '2027-01-04T20:00:00Z',
        scheduleEndConstraint: '2027-01-04T20:00:00Z', noFixedEndDateTime: false,
        automatedScheduling: competition || eventType === 'WEEKLY_EVENT',
        timeZone: 'UTC', state: 'PUBLISHED', location: 'Issue 48 Gym',
        address: '1 Test Street', coordinates: [0, 0], sportIds: [],
        teamSignup: competition, singleDivision: eventType !== 'TRYOUT', maxParticipants: 4, teamSizeLimit: 2,
        divisions: [divisionId],
        divisionDetails: [{
          id: divisionId, key: 'open', name: 'Open', kind: eventType,
          sourceDivisionId: eventType === 'TRYOUT' ? clubDivisionId : null,
          maxParticipants: 4, fieldIds: [fieldId], teamIds: [],
          playoffTeamCount: eventType === 'TOURNAMENT' ? 4 : null,
          gamesPerOpponent: 1, matchDurationMinutes: competition ? 30 : 0, restTimeMinutes: competition ? 5 : 0,
          pointsToVictory: [21],
        }],
        fields: [{ id: fieldId, name: 'Court 1', location: 'Issue 48 Gym', divisions: [divisionId] }],
        fieldIds: [fieldId], divisionFieldIds: { [divisionId]: [fieldId] },
        timeSlots: [{
          id: slotId, startDate: '2027-01-04T08:00:00Z', endDate: '2027-01-04T20:00:00Z',
          startTimeMinutes: 480, endTimeMinutes: 1200, timeZone: 'UTC',
          repeating: eventType === 'WEEKLY_EVENT', dayOfWeek: 1, daysOfWeek: [1],
          scheduledFieldId: fieldId, scheduledFieldIds: [fieldId], divisions: [divisionId],
        }],
        timeSlotIds: [slotId], price: 0, registrationPaymentMode: 'ONLINE',
        includePlayoffs: false, splitLeaguePlayoffDivisions: false,
        doubleElimination: false, winnerSetCount: 1, loserSetCount: 1,
        pointsToVictory: [21], winnerBracketPointsToVictory: [21], loserBracketPointsToVictory: [21],
        usesSets: false, matchDurationMinutes: 30, restTimeMinutes: 5, gamesPerOpponent: 1,
        staffingPriority: 'BEST_AVAILABLE_COVERAGE', doTeamsOfficiate: competition,
        teamOfficialsMaySwap: competition,
        officialPositions: eventType === 'TRYOUT' ? [] : [{ id: `${id}-referee`, name: 'Referee', count: 1, order: 0 }],
        eventOfficials: [], officialIds: [], assistantHostIds: [], requiredTemplateIds: [],
        userIds: [], teamIds: [], waitListIds: [], freeAgentIds: [], tags: [],
      }, tx);
      if (index % 2 === 1) {
        await tx.events.update({ where: { id }, data: {
          sourceType: 'AFFILIATE_IMPORT', sourceId: `${id}-source`,
          sourceUrl: 'https://source.example/event',
        } });
      }
      if (competition) {
        await persistCreateOnlyMatchGraph({ tx, eventId: id, includePlaceholderTeams: true });
      }
    }
  }, { timeout: 60_000 });
  const token = signSessionToken({ userId, isAdmin: false, sessionVersion: 0, device: 'mobile' });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/issue-48-session.json', JSON.stringify({ userId, eventIds, token }));
  console.log(`Prepared ${eventIds.length} Event Types in ${database.pathname.slice(1)}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
