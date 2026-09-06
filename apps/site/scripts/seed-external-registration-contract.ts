import { mkdir, writeFile } from 'node:fs/promises';
import { signSessionToken } from '../src/lib/authServer';
import { buildEventDivisionId } from '../src/lib/divisionTypes';
import { prisma } from '../src/lib/prisma';
import { upsertEventFromPayload } from '../src/server/repositories/events';
import { persistCreateOnlyMatchGraph } from '../src/server/scheduler/eventScheduleMutation';

const fixtureDivision = (
  eventType: string,
  divisionId: string,
  fieldId: string,
  clubDivisionId: string,
  competition: boolean,
) => ({
id: divisionId, key: 'open', name: 'Open', kind: eventType,
          sourceDivisionId: eventType === 'TRYOUT' ? clubDivisionId : null,
          maxParticipants: 4, fieldIds: [fieldId], teamIds: [],
          playoffTeamCount: eventType === 'TOURNAMENT' ? 4 : null,
          gamesPerOpponent: 1, matchDurationMinutes: competition ? 30 : 0, restTimeMinutes: competition ? 5 : 0,
          pointsToVictory: [21],
});

async function main() {
  const issue = process.env.MVP_CONTRACT_ISSUE ?? '48';
  if (!['48', '49'].includes(issue)) throw new Error('Use issue 48 or 49.');
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(database.hostname)
    || !database.pathname.startsWith(`/bracketiq_e2e_${issue}_`)) {
    throw new Error('Use an isolated local issue database.');
  }
  const userId = `issue-${issue}-host`;
  const organizationId = `issue-${issue}-organization`;
  const eventTypes = ['EVENT', 'WEEKLY_EVENT', 'LEAGUE', 'TOURNAMENT', 'TRYOUT'] as const;
  const fixtureRun = Date.now().toString(36);
  const eventIds = eventTypes.map((type) => `issue-${issue}-${fixtureRun}-${type.toLowerCase()}`);
  const unclaimedEventId = `issue-${issue}-${fixtureRun}-unclaimed`;
  await prisma.$transaction(async (tx) => {
    await tx.authUser.upsert({
      where: { id: userId }, update: {},
      create: { id: userId, email: `issue-${issue}-host@example.test`, passwordHash: 'unused-test-password', emailVerifiedAt: new Date() },
    });
    await tx.userData.upsert({
      where: { id: userId }, update: {},
      create: {
        id: userId, userName: `issue${issue}host`, firstName: 'Test', lastName: 'Host',
        dateOfBirth: new Date('1990-01-01'), friendIds: [], followingIds: [],
        friendRequestIds: [], friendRequestSentIds: [], uploadedImages: [],
      },
    });
    await tx.organizations.upsert({
      where: { id: organizationId }, update: {},
      create: {
        id: organizationId, name: `Issue ${issue} Club`, ownerId: userId,
        enabledFeatures: ['EVENT_MANAGEMENT', 'CLUB_TEAMS'],
        originType: 'FIRST_PARTY', ownershipStatus: 'CLAIMED',
        claimVerificationLevel: 'MANUAL_REVIEW', ownershipVerifiedAt: new Date(),
      },
    });
    const clubDivisionId = `issue-${issue}-club-division`;
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
          id: fieldId, name: 'Court 1', location: `Issue ${issue} Gym`,
          organizationId, createdBy: userId, rentalSlotIds: [],
        } });
      }
      await upsertEventFromPayload({
        id, name: `Issue ${issue} ${eventType}`, eventType, hostId: userId, organizationId,
        affiliateUrl: 'https://organizer.example/register',
        start: '2027-01-04T08:00:00Z', end: '2027-01-04T20:00:00Z',
        scheduleEndConstraint: '2027-01-04T20:00:00Z', noFixedEndDateTime: false,
        automatedScheduling: competition || eventType === 'WEEKLY_EVENT',
        timeZone: 'UTC', state: 'PUBLISHED', location: `Issue ${issue} Gym`,
        address: '1 Test Street', coordinates: [0, 0], sportIds: [],
        teamSignup: competition, singleDivision: eventType !== 'TRYOUT', maxParticipants: 4, teamSizeLimit: 2,
        divisions: [divisionId],
        divisionDetails: [fixtureDivision(eventType, divisionId, fieldId, clubDivisionId, competition)],
        fields: [{ id: fieldId, name: 'Court 1', location: `Issue ${issue} Gym`, divisions: [divisionId] }],
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
    if (issue === '49') {
      const unclaimedOrganizationId = `${unclaimedEventId}-organization`;
      await tx.organizations.create({ data: {
        id: unclaimedOrganizationId, name: 'Unclaimed operator', ownerId: userId,
        originType: 'AFFILIATE_IMPORTED', ownershipStatus: 'UNCLAIMED', enabledFeatures: ['EVENT_MANAGEMENT'],
      } });
      await upsertEventFromPayload({
        id: unclaimedEventId, name: 'Unclaimed Event', eventType: 'EVENT', hostId: userId,
        organizationId: unclaimedOrganizationId, affiliateUrl: 'http://organizer.example/register',
        start: '2027-01-04T08:00:00Z', end: '2027-01-04T20:00:00Z', noFixedEndDateTime: false,
        timeZone: 'UTC', state: 'PUBLISHED', location: 'Operator gym', coordinates: [0, 0],
        maxParticipants: 8, teamSizeLimit: 1, teamSignup: false, singleDivision: true, price: 0,
        automatedScheduling: false, sportIds: [], fieldIds: [], timeSlotIds: [],
      }, tx);
      await tx.events.update({ where: { id: unclaimedEventId }, data: {
        sourceType: 'AFFILIATE_IMPORT', sourceId: `${unclaimedEventId}-source`, sourceUrl: 'https://source.example/event',
      } });
    }
  }, { timeout: 60_000 });
  const token = signSessionToken({ userId, isAdmin: false, sessionVersion: 0, device: 'mobile' });
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/issue-${issue}-session.json`, JSON.stringify({ userId, eventIds, unclaimedEventId, token }));
  console.log(`Prepared ${eventIds.length} Event Types in ${database.pathname.slice(1)}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
