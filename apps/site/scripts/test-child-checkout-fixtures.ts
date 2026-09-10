import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/authServer';
import { requireEventSignupTestServer } from './event-signup-test-environment';

async function seed(id: string) {
    const parentId = `${id}-parent`;
    await prisma.userData.create({ data: { id: parentId, userName: parentId, firstName: 'Taylor', lastName: 'Rivera', dateOfBirth: new Date('1990-01-01') } });
    await prisma.authUser.create({ data: { id: parentId, email: `${parentId}@example.test`, passwordHash: await hashPassword('password123!'), emailVerifiedAt: new Date() } });
    await prisma.userData.create({ data: { id: `${id}-child`, userName: `${id}-child`, firstName: 'Avery', lastName: 'Rivera', dateOfBirth: new Date('2024-01-01') } });
    await prisma.parentChildLinks.create({ data: { id: `${id}-link`, parentId, childId: `${id}-child`, createdBy: parentId, status: 'ACTIVE' } });
    await prisma.userData.create({ data: { id: `${id}-host`, userName: `${id}-host`, firstName: 'Jordan', lastName: 'Lee', dateOfBirth: new Date('1985-01-01') } });
    await prisma.events.create({ data: { id, name: 'River City Junior Day', start: new Date('2035-06-15'), end: new Date('2035-06-16'), state: 'PUBLISHED', hostId: `${id}-host`, sportIds: ['Indoor Volleyball'], teamSignup: false, singleDivision: true, eventType: 'EVENT', maxParticipants: 16, teamSizeLimit: 1, location: 'River City Gym', price: 0, minAge: 10, maxAge: 13, coordinates: [0, 0] } });
    await prisma.divisions.create({ data: { id: `${id}__division__c_skill_open_age_u12`, eventId: id, name: 'Junior', key: 'junior', kind: 'LEAGUE', scope: 'EVENT', role: 'ENTRY', status: 'ACTIVE', divisionTypeId: 'u12', sportId: 'Indoor Volleyball', maxParticipants: 16, price: 0 } });
    await prisma.registrationQuestions.create({ data: { id: `${id}-question`, scopeType: 'EVENT', scopeId: id, prompt: 'Arrival plan', required: true } });
}

async function verify(id: string) {
    const registrations = await prisma.eventRegistrations.findMany({ where: { eventId: id } });
    const registration = registrations.find((row) => row.registrantId === `${id}-child`);
    if (registrations.length !== 1 || registration?.parentId !== `${id}-parent` || registration.registrantType !== 'CHILD'
        || registration.divisionId !== `${id}__division__c_skill_open_age_u12` || registration.status !== 'ACTIVE') {
        throw new Error('Child, guardian, division, or registration status was not preserved.');
    }
    const response = await prisma.registrationQuestionResponses.findFirst({ where: { scopeId: id, registrantUserId: `${id}-child` } });
    if (response?.responderUserId !== `${id}-parent` || !JSON.stringify(response.answersSnapshot).includes('Family car')) {
        throw new Error('The child answers were not saved with the guardian as responder.');
    }
    console.log('Child identity, division, and answers verified.');
}

async function cleanup(id: string) {
    await prisma.registrationQuestionResponses.deleteMany({ where: { scopeId: id } });
    await prisma.registrationQuestions.deleteMany({ where: { scopeId: id } });
    await prisma.eventRegistrations.deleteMany({ where: { eventId: id } });
    await prisma.divisions.deleteMany({ where: { eventId: id } });
    await prisma.events.deleteMany({ where: { id } });
    await prisma.parentChildLinks.deleteMany({ where: { id: `${id}-link` } });
    await prisma.authUser.deleteMany({ where: { id: `${id}-parent` } });
    await prisma.userData.deleteMany({ where: { id: { in: [`${id}-parent`, `${id}-child`, `${id}-host`] } } });
}

async function main() {
    requireEventSignupTestServer(153);
    const [action, id] = process.argv.slice(2);
    if (!/^checkout-child-[a-z0-9-]+$/.test(id ?? '')) throw new Error('Use a child checkout fixture id.');
    if (action === 'seed') await seed(id);
    else if (action === 'verify') await verify(id);
    else if (action === 'cleanup') await cleanup(id);
    else throw new Error('Use seed, verify, or cleanup.');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; }).finally(() => prisma.$disconnect());
