import { mkdir, writeFile } from 'node:fs/promises';
import { signSessionToken } from '../src/lib/authServer';
import { prisma } from '../src/lib/prisma';
import { upsertEventFromPayload } from '../src/server/repositories/events';

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(database.hostname)
    || database.pathname !== '/bracketiq_e2e_50_samue') {
    throw new Error('Use the isolated local issue 50 database.');
  }
  const run = `issue-50-${Date.now().toString(36)}`;
  const userId = `${run}-host`;
  const organizationId = `${run}-club`;
  const facilityOrganizationId = `${run}-facility`;
  const eventId = `${run}-event`;
  const bookingId = `${run}-booking`;
  const itemId = `${run}-item`;
  const fieldId = `${run}-court`;
  const slotId = `${run}-slot`;
  const templateId = `${run}-template`;
  const start = new Date('2027-01-04T09:00:00Z');
  const end = new Date('2027-01-04T10:00:00Z');
  await prisma.$transaction(async (tx) => {
    await tx.authUser.create({ data: {
      id: userId, email: `${userId}@example.test`, passwordHash: 'unused-test-password', emailVerifiedAt: new Date(),
    } });
    await tx.userData.create({ data: {
      id: userId, userName: userId, firstName: 'Test', lastName: 'Host', dateOfBirth: new Date('1990-01-01'),
      friendIds: [], followingIds: [], friendRequestIds: [], friendRequestSentIds: [], uploadedImages: [],
    } });
    for (const id of [organizationId, facilityOrganizationId]) {
      await tx.organizations.create({ data: {
        id, name: id, ownerId: userId, enabledFeatures: ['EVENT_MANAGEMENT'],
        originType: 'FIRST_PARTY', ownershipStatus: 'CLAIMED', claimVerificationLevel: 'MANUAL_REVIEW', ownershipVerifiedAt: new Date(),
      } });
    }
    await tx.eventTemplates.create({ data: {
      id: templateId, name: 'Template default name', description: 'Template default description',
      createdByUserId: userId, ownerUserId: userId, organizationId: facilityOrganizationId,
      eventType: 'EVENT', timeZone: 'UTC', location: 'Template gym', teamSizeLimit: 1,
      price: 1000, maxParticipants: 8, noFixedEndDateTime: false, endOffsetMinutesFromEventStart: 60,
      requiredTemplateIds: [`${run}-document-default`],
    } });
    await tx.fields.create({ data: {
      id: fieldId, name: 'Booked court', location: 'Test Gym', organizationId: facilityOrganizationId,
      rentalSlotIds: [], createdBy: userId,
    } });
    await tx.rentalBookings.create({ data: {
      id: bookingId, organizationId: facilityOrganizationId, renterType: 'ORGANIZATION', renterOrganizationId: organizationId,
      createdByUserId: userId, status: 'CONFIRMED', totalAmountCents: 2500, currency: 'usd',
    } });
    await tx.rentalBookingItems.create({ data: {
      id: itemId, bookingId, organizationId: facilityOrganizationId, fieldId, start, end, timeZone: 'UTC',
      priceCents: 2500, status: 'CONFIRMED', requiredTemplateIds: [], hostRequiredTemplateIds: [],
    } });
    await upsertEventFromPayload({
      id: eventId, name: 'Rental authority test', description: 'Organizer current value', eventType: 'EVENT',
      hostId: userId, organizationId, start: start.toISOString(), end: '2027-01-04T12:00:00Z',
      scheduleEndConstraint: '2027-01-04T12:00:00Z', noFixedEndDateTime: false, automatedScheduling: false,
      timeZone: 'UTC', state: 'UNPUBLISHED', location: 'Test Gym', address: '1 Test Street', coordinates: [0, 0],
      sportIds: [], teamSignup: false, singleDivision: true, maxParticipants: 8, price: 0,
      registrationPaymentMode: 'ONLINE', staffingPriority: 'BEST_AVAILABLE_COVERAGE',
      fieldIds: [fieldId], fields: [{ id: fieldId, name: 'Booked court', location: 'Test Gym', organizationId: facilityOrganizationId }],
      timeSlotIds: [slotId], timeSlots: [{
        id: slotId, startDate: start.toISOString(), endDate: end.toISOString(), repeating: false, timeZone: 'UTC',
        startTimeMinutes: 540, endTimeMinutes: 600, scheduledFieldId: fieldId, scheduledFieldIds: [fieldId],
        sourceType: 'RENTAL_BOOKING', rentalBookingId: bookingId, rentalBookingItemId: itemId, rentalLocked: true,
        requiredTemplateIds: [], hostRequiredTemplateIds: [], divisions: [],
      }],
      requiredTemplateIds: [], userIds: [], teamIds: [], waitListIds: [], freeAgentIds: [], tags: [],
      officialPositions: [], eventOfficials: [], officialIds: [], assistantHostIds: [],
    }, tx);
  }, { timeout: 60_000 });
  const token = signSessionToken({ userId, isAdmin: false, sessionVersion: 0, device: 'mobile' });
  const bookingBaseline = {
    booking: await prisma.rentalBookings.findUniqueOrThrow({ where: { id: bookingId } }),
    items: await prisma.rentalBookingItems.findMany({ where: { bookingId }, orderBy: { id: 'asc' } }),
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/issue-50-session.json', JSON.stringify({ userId, organizationId, facilityOrganizationId, eventId, bookingId, itemId, fieldId, slotId, templateId, token, bookingBaseline }));
  console.log(`Prepared rental authority fixtures in ${database.pathname.slice(1)}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
