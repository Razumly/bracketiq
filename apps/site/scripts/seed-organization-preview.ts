import { loadEnvConfig } from '@next/env';
import { spawnSync } from 'node:child_process';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadEnvConfig(process.cwd());
const database = new URL(process.env.DATABASE_URL!);
if (database.hostname !== '127.0.0.1' || database.port !== '5433') {
  throw new Error('This script requires the local test database.');
}
database.pathname = '/bracketiq_e2e_155_samue';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.toString() }) });
const orgId = 'org_1';
const ownerId = 'user_host';
const prefix = 'preview_org1_';
const now = new Date();
const day = (offset: number, hour = 17) => {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + offset);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const names = ['Maya Rodriguez', 'Jordan Lee', 'Avery Chen', 'Taylor Brooks', 'Morgan Rivera', 'Casey Patel', 'Riley Walker', 'Jamie Park', 'Alex Martinez', 'Drew Wilson', 'Sam Nguyen', 'Charlie Davis'];
const teamNames = ['Summit United', 'Riverside FC', 'Cascade Crew', 'Harbor Strikers'];
const uid = (index: number) => `${prefix}user_${index}`;
const teamId = (index: number) => `${prefix}team_${index}`;
const eventId = (index: number) => `${prefix}event_${index}`;
const fieldId = (index: number) => `${prefix}field_${index}`;

async function addPeople(tx: Prisma.TransactionClient) {
  await tx.userData.createMany({ skipDuplicates: true, data: names.map((name, index) => ({
    id: uid(index), firstName: name.split(' ')[0], lastName: name.split(' ')[1],
    userName: `preview_${name.toLowerCase().replace(' ', '_')}`, dateOfBirth: new Date('1994-05-15'),
    friendIds: [], followingIds: [], friendRequestIds: [], friendRequestSentIds: [], uploadedImages: [],
    createdAt: now, updatedAt: now,
  })) });
  await tx.authUser.createMany({ skipDuplicates: true, data: names.map((name, index) => ({
    id: uid(index), name, email: `preview.${name.toLowerCase().replace(' ', '.')}@example.test`,
    passwordHash: '!', disabledAt: now, disabledReason: 'Local visual fixture; sign-in is disabled.',
    createdAt: now, updatedAt: now,
  })) });
  const roles = ['Facility manager', 'Event coordinator', 'Match official', 'Court assistant'];
  await tx.sensitiveUserData.createMany({ skipDuplicates: true, data: names.map((name, index) => ({
    id: `${prefix}contact_${index}`, userId: uid(index),
    email: `preview.${name.toLowerCase().replace(' ', '.')}@example.test`, createdAt: now, updatedAt: now,
  })) });
  await tx.organizationRoles.createMany({ skipDuplicates: true, data: roles.map((name, index) => ({
    id: `${prefix}role_${index}`, organizationId: orgId, name,
    kind: index === 2 ? 'OFFICIAL' : 'STAFF', createdAt: now, updatedAt: now,
  })) });
  await tx.staffMembers.createMany({ skipDuplicates: true, data: roles.map((_, index) => ({
    id: `${prefix}staff_${index}`, organizationId: orgId, userId: uid(index),
    roleId: `${prefix}role_${index}`, types: [index === 2 ? 'OFFICIAL' : 'STAFF'], createdAt: now, updatedAt: now,
  })) });
  await tx.staffCompensationRates.createMany({ skipDuplicates: true, data: roles.map((_, index) => ({
    id: `${prefix}wage_${index}`, organizationId: orgId, staffMemberId: `${prefix}staff_${index}`,
    wageType: 'HOURLY', amountCents: 2200 + index * 300, effectiveFrom: day(-30), createdBy: ownerId,
  })) });
}

async function addFacilities(tx: Prisma.TransactionClient) {
  await tx.facilities.createMany({ skipDuplicates: true, data: ['Community Sports Center', 'Riverside Recreation Center'].map((name, index) => ({
    id: `${prefix}facility_${index}`, organizationId: orgId, name, location: 'Test City',
    address: `${120 + index * 40} Recreation Way`, timeZone: 'America/Los_Angeles', sortOrder: index,
  })) });
  await tx.fields.createMany({ skipDuplicates: true, data: ['Court B', 'Training Gym', 'Court C', 'Meeting Room'].map((name, index) => ({
    id: fieldId(index), organizationId: orgId, facilityId: `${prefix}facility_${Math.floor(index / 2)}`,
    name, location: 'Test City', rentalSlotIds: [`${prefix}rental_${index}`], sportIds: ['Indoor Volleyball'], createdBy: ownerId,
    createdAt: now, updatedAt: now,
  })) });
  await tx.timeSlots.createMany({ skipDuplicates: true, data: [0, 1, 2, 3].map((index) => ({
    id: `${prefix}rental_${index}`, startDate: day(1, 7), endDate: day(60, 7), repeating: true,
    daysOfWeek: [1, 3, 5], dayOfWeek: 1, startTimeMinutes: 480, endTimeMinutes: 720,
    timeZone: 'America/Los_Angeles', scheduledFieldId: fieldId(index), price: 4500 + index * 500,
    createdAt: now, updatedAt: now,
  })) });
  await tx.timeSlots.createMany({ skipDuplicates: true, data: [0, 1, 2, 3].map((index) => ({
    id: `${prefix}shift_slot_${index}`, startDate: day(1 + index, 20), endDate: day(1 + index, 23),
    repeating: false, scheduledFieldId: fieldId(index), timeZone: 'America/Los_Angeles', createdAt: now, updatedAt: now,
  })) });
  await tx.staffScheduleAssignments.createMany({ skipDuplicates: true, data: [0, 1, 2, 3].map((index) => ({
    id: `${prefix}shift_${index}`, organizationId: orgId, staffMemberId: `${prefix}staff_${index}`, userId: uid(index),
    organizationRoleId: `${prefix}role_${index}`, assignmentKind: index === 2 ? 'OFFICIAL_SHIFT' : 'STAFF_SHIFT',
    facilityId: `${prefix}facility_${Math.floor(index / 2)}`, fieldId: fieldId(index), timeSlotId: `${prefix}shift_slot_${index}`,
    plannedStart: day(1 + index, 20), plannedEnd: day(1 + index, 23), plannedMinutes: 180, createdBy: ownerId,
    notes: 'Example coverage for the local preview.',
  })) });
}

async function addTeamsAndEvents(tx: Prisma.TransactionClient) {
  await tx.divisions.createMany({ skipDuplicates: true, data: ['Open recreation', 'Competitive club'].map((name, index) => ({
    id: `${prefix}division_${index}`, organizationId: orgId, scope: 'ORGANIZATION', name,
    sportId: 'Indoor Volleyball', teamIds: [teamId(index * 2), teamId(index * 2 + 1)],
    createdAt: now, updatedAt: now,
  })) });
  await tx.canonicalTeams.createMany({ skipDuplicates: true, data: teamNames.map((name, index) => ({
    id: teamId(index), name, organizationId: orgId, createdBy: ownerId, sport: 'Indoor Volleyball',
    teamSize: 6, wins: index + 2, losses: index, division: 'Open', createdAt: now, updatedAt: now,
  })) });
  await tx.teamRegistrations.createMany({ skipDuplicates: true, data: names.map((_, index) => ({
    id: `${prefix}roster_${index}`, teamId: teamId(Math.floor(index / 3)), userId: uid(index),
    status: 'ACTIVE', rosterRole: 'PARTICIPANT', isCaptain: index % 3 === 0,
    jerseyNumber: String(index + 1), createdBy: ownerId, createdAt: now, updatedAt: now,
  })) });
  const eventNames = ['Community Volleyball Night', 'Autumn Club League', 'Weekend Skills Clinic', 'September Invitational', 'Summer Community Cup', 'Winter League Draft'];
  await tx.events.createMany({ skipDuplicates: true, data: eventNames.map((name, index) => ({
    id: eventId(index), name, organizationId: orgId, hostId: ownerId, start: day(index === 4 ? -10 : index + 2),
    end: day(index === 4 ? -10 : index + 2, 20), timeZone: 'America/Los_Angeles',
    state: index === 5 ? 'UNPUBLISHED' : 'PUBLISHED', eventType: index === 1 ? 'LEAGUE' : 'EVENT',
    description: 'Meet local players, build your skills, and enjoy a friendly community session.',
    location: 'Community Sports Center', address: '120 Recreation Way', coordinates: [-122.4194, 37.7749],
    teamSizeLimit: 6, maxParticipants: 48, price: 1500 + index * 500, teamSignup: index === 1,
    sportIds: ['Indoor Volleyball'], fieldIds: [fieldId(index % 4)], timeSlotIds: [], imageId: 'image_1',
    winnerBracketPointsToVictory: [], loserBracketPointsToVictory: [], pointsToVictory: [],
    installmentDueDates: [], installmentAmounts: [], requiredTemplateIds: [], createdAt: day(-14), updatedAt: now,
  })) });
  await tx.teams.createMany({ skipDuplicates: true, data: teamNames.map((name, index) => ({
    id: `${prefix}event_team_${index}`, name, eventId: eventId(1), parentTeamId: teamId(index),
    playerIds: [uid(index * 3), uid(index * 3 + 1), uid(index * 3 + 2)], pending: [],
    captainId: uid(index * 3), managerId: uid(index * 3), teamSize: 6, sport: 'Indoor Volleyball',
    createdAt: now, updatedAt: now,
  })) });
  await tx.eventRegistrations.createMany({ skipDuplicates: true, data: names.flatMap((_, index) => [0, 1].map((eventIndex) => ({
    id: `${prefix}registration_${index}_${eventIndex}`, eventId: eventId(eventIndex), registrantId: uid(index),
    registrantType: 'SELF', status: 'ACTIVE', createdBy: ownerId, acceptedAt: now,
    eventTeamId: eventIndex === 1 ? `${prefix}event_team_${Math.floor(index / 3)}` : null,
    createdAt: now, updatedAt: now,
  }))) });
  await tx.eventRegistrations.createMany({ skipDuplicates: true, data: teamNames.map((_, index) => ({
    id: `${prefix}team_registration_${index}`, eventId: eventId(1), registrantId: `${prefix}event_team_${index}`,
    eventTeamId: `${prefix}event_team_${index}`, registrantType: 'TEAM', status: 'ACTIVE',
    createdBy: ownerId, acceptedAt: now, createdAt: now, updatedAt: now,
  })) });
}

async function addCommerce(tx: Prisma.TransactionClient) {
  await tx.products.createMany({ skipDuplicates: true, data: ['Community Day Pass', 'Monthly Court Membership', 'Club Training Shirt'].map((name, index) => ({
    id: `${prefix}product_${index}`, organizationId: orgId, createdBy: ownerId, name,
    description: 'Local preview product. No live checkout is connected.', priceCents: [1500, 6500, 2500][index],
    period: index === 1 ? 'MONTH' : 'SINGLE', isActive: true, createdAt: now, updatedAt: now,
  })) });
  await tx.discounts.createMany({ skipDuplicates: true, data: ['Welcome offer', 'Early registration'].map((name, index) => ({
    id: `${prefix}discount_${index}`, ownerType: 'ORGANIZATION', ownerId: orgId, createdBy: ownerId, name,
    description: 'Example discount for visual testing.', targetType: 'EVENT', targetId: eventId(index),
    originalPriceCentsSnapshot: 1500 + index * 500, discountedPriceCents: 1000 + index * 500,
  })) });
  await tx.discountCodes.createMany({ skipDuplicates: true, data: [0, 1].map((index) => ({
    id: `${prefix}code_${index}`, discountId: `${prefix}discount_${index}`, code: `PREVIEW${index + 1}`, usageLimit: 50, createdBy: ownerId,
  })) });
  await tx.bills.createMany({ skipDuplicates: true, data: names.map((_, index) => ({
    id: `${prefix}bill_${index}`, organizationId: orgId, eventId: eventId(0), ownerType: 'USER', ownerId: uid(index),
    totalAmountCents: 1500, paidAmountCents: index < 8 ? 1500 : 0, status: index < 8 ? 'PAID' : 'OPEN',
    nextPaymentDue: day(2), nextPaymentAmountCents: index < 8 ? 0 : 1500, createdBy: ownerId,
    createdAt: day(-3), updatedAt: now, lineItems: [{ name: 'Community Volleyball Night registration', amountCents: 1500 }],
  })) });
  await tx.billPayments.createMany({ skipDuplicates: true, data: names.map((_, index) => ({
    id: `${prefix}payment_${index}`, billId: `${prefix}bill_${index}`, sequence: 1, dueDate: day(2), amountCents: 1500,
    paidAmountCents: index < 8 ? 1500 : 0, status: index < 8 ? 'PAID' : 'PENDING',
    paidAt: index < 8 ? day(-2) : null, payerUserId: uid(index), createdAt: day(-3), updatedAt: now,
  })) });
  await tx.refundRequests.createMany({ skipDuplicates: true, data: [0, 1].map((index) => ({
    id: `${prefix}refund_${index}`, organizationId: orgId, eventId: eventId(0), userId: uid(index), hostId: ownerId,
    reason: index ? 'Unable to attend the rescheduled session.' : 'Schedule conflict with another event.',
    status: 'WAITING', requestedAmountCents: 1500, billIds: [`${prefix}bill_${index}`],
    paymentIds: [`${prefix}payment_${index}`], createdAt: now, updatedAt: now,
  })) });
}

async function addTemplatesAndReviews(tx: Prisma.TransactionClient) {
  await tx.eventTemplates.createMany({ skipDuplicates: true, data: ['Community pickup session', 'Club league starter', 'Skills clinic starter'].map((name, index) => ({
    id: `${prefix}event_template_${index}`, organizationId: orgId, name, createdByUserId: ownerId,
    description: 'Reusable example for local visual testing.', eventType: index === 1 ? 'LEAGUE' : 'EVENT',
    location: 'Community Sports Center', timeZone: 'America/Los_Angeles', teamSizeLimit: 6,
    maxParticipants: 48, price: 1500, endOffsetMinutesFromEventStart: 120, sportIds: ['Indoor Volleyball'],
  })) });
  for (const [index, title] of ['Participation information', 'Facility use guidelines'].entries()) {
    const requirementId = `${prefix}requirement_${index}`;
    await tx.documentRequirements.upsert({ where: { id: requirementId }, update: {}, create: {
      id: requirementId, organizationId: orgId, title, status: 'ACTIVE', createdBy: ownerId, createdAt: now, updatedAt: now,
    } });
    await tx.templateDocuments.upsert({ where: { id: `${prefix}document_${index}` }, update: {}, create: {
      id: `${prefix}document_${index}`, documentRequirementId: requirementId, versionSequence: 1,
      organizationId: orgId, title, type: 'TEXT', status: 'ACTIVE', createdBy: ownerId,
      roleIndexes: [], signerRoles: ['PARTICIPANT'], signOnce: true,
      content: 'Example document for visual testing only. Arrive ten minutes early. Bring water and suitable sports shoes. Ask a staff member if you need assistance.',
      createdAt: now, updatedAt: now,
    } });
  }
  await tx.organizationReviews.createMany({ skipDuplicates: true, data: [4, 5, 6, 7].map((index) => ({
    id: `${prefix}review_${index}`, organizationId: orgId, reviewerUserId: uid(index), rating: index === 6 ? 4 : 5,
    body: ['Friendly staff and well-organized games.', 'A great place to meet other local players.', 'Clean courts and a welcoming atmosphere.', 'The skills clinic was helpful and fun.'][index - 4],
  })) });
}

async function seed() {
  await prisma.$transaction(async (tx) => {
    const org = await tx.organizations.findUniqueOrThrow({ where: { id: orgId } });
    if (org.name !== 'Test Organization' || org.ownerId !== ownerId) throw new Error('Unexpected test organization.');
    await addPeople(tx);
    await addFacilities(tx);
    await addTeamsAndEvents(tx);
    await addCommerce(tx);
    await addTemplatesAndReviews(tx);
    await tx.organizations.update({ where: { id: orgId }, data: {
      enabledFeatures: ['EVENT_MANAGEMENT', 'CLUB_TEAMS', 'FACILITIES_RENTALS'],
      productIds: [...new Set([...org.productIds, ...[0, 1, 2].map((index) => `${prefix}product_${index}`)])],
      sports: [...new Set([...org.sports, 'Indoor Volleyball'])],
      description: org.description || 'Community sports, friendly competition, and year-round training for local players.',
      publicSlug: org.publicSlug || 'test-organization-preview', publicPageEnabled: true,
      publicHeadline: org.publicHeadline || 'Find your next game',
      publicIntroText: org.publicIntroText || 'Explore community events, join a team, or book a court.', updatedAt: now,
    } });
  }, { timeout: 60000 });
}

async function main() {
  const status = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'status'], {
    env: { ...process.env, DATABASE_URL: database.toString() }, encoding: 'utf8',
  });
  console.log(status.stdout);
  if (status.status !== 0 || !status.stdout.includes('Database schema is up to date')) {
    throw new Error('The test database must have all migrations before seeding.');
  }
  if (process.argv.includes('--apply')) await seed();
  console.log(JSON.stringify({
    organization: await prisma.organizations.findUnique({ where: { id: 'org_1' }, select: { id: true, name: true } }),
    counts: {
      staff: await prisma.staffMembers.count({ where: { organizationId: 'org_1' } }),
      teams: await prisma.canonicalTeams.count({ where: { organizationId: 'org_1' } }),
      events: await prisma.events.count({ where: { organizationId: 'org_1' } }),
      facilities: await prisma.facilities.count({ where: { organizationId: 'org_1' } }),
      fields: await prisma.fields.count({ where: { organizationId: orgId } }),
      users: await prisma.userData.count({ where: { id: { startsWith: prefix } } }),
      products: await prisma.products.count({ where: { organizationId: orgId } }),
      bills: await prisma.bills.count({ where: { organizationId: orgId } }),
      refunds: await prisma.refundRequests.count({ where: { organizationId: orgId } }),
      eventTemplates: await prisma.eventTemplates.count({ where: { organizationId: orgId } }),
      documents: await prisma.templateDocuments.count({ where: { organizationId: orgId } }),
      discounts: await prisma.discounts.count({ where: { ownerId: orgId } }),
      reviews: await prisma.organizationReviews.count({ where: { organizationId: orgId } }),
    },
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
