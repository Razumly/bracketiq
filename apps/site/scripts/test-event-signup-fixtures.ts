import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/authServer';
import { eventRegistrationDraftService } from '../src/lib/eventRegistrationDraftService';

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const base = new URL(process.env.MVP_TEST_BACKEND_URL ?? 'http://127.0.0.1:3151');
  if (!['127.0.0.1', 'localhost'].includes(database.hostname) || database.pathname !== '/bracketiq_e2e_151_codex'
    || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.port !== '3151') {
    throw new Error('Use the isolated issue 151 database and test server.');
  }
  const [action, eventId = 'issue151-resume-event', teamId] = process.argv.slice(2);
  if (!eventId.startsWith('issue151-')) throw new Error('Use an issue 151 fixture Event.');
  if (action === 'seed') {
    const passwordHash = await hashPassword('password123!');
    for (const [id, email, firstName] of [['user_host', 'host@example.com', 'Taylor'], ['user_participant', 'player@example.com', 'Jordan']]) {
      await prisma.userData.upsert({ where: { id }, create: { id, userName: id, firstName, lastName: 'Test', dateOfBirth: new Date('1990-01-01'), onboardingIntent: 'DISCOVER_EVENTS' }, update: { onboardingIntent: 'DISCOVER_EVENTS' } });
      await prisma.authUser.upsert({ where: { id }, create: { id, email, passwordHash, emailVerifiedAt: new Date() }, update: { passwordHash, emailVerifiedAt: new Date() } });
    }
    await prisma.sports.upsert({ where: { id: 'Indoor Volleyball' }, create: { id: 'Indoor Volleyball', name: 'Indoor Volleyball' }, update: {} });
    await prisma.events.upsert({ where: { id: eventId }, create: { id: eventId, name: 'River City Cup', start: new Date('2035-01-01'), end: new Date('2035-01-02'), state: 'PUBLISHED', hostId: 'user_host', sportIds: ['Indoor Volleyball'], teamSignup: true, eventType: 'EVENT', teamSizeLimit: 8, maxParticipants: 16, price: 0, coordinates: [0, 0], location: 'River City' }, update: {} });
    return;
  }
  if (!['site-save', 'site-read'].includes(action)) throw new Error('Use seed, site-save, or site-read.');
  const transport = globalThis.fetch;
  const login = await transport(new URL('/api/auth/login', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'host@example.com', password: 'password123!' }) });
  if (!login.ok) throw new Error(`Fixture login failed: ${login.status}`);
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Fixture login did not return a session cookie.');
  // Supply the same origin and session that the browser supplies to the site service.
  globalThis.fetch = (input, init) => transport(new URL(String(input), base), { ...init, headers: { ...init?.headers, cookie } });
  try {
    const state = await eventRegistrationDraftService.get(eventId);
    if (action === 'site-read') { console.log(JSON.stringify(state)); return; }
    if (!teamId) throw new Error('site-save needs the selected Team.');
    const saved = await eventRegistrationDraftService.save(eventId, { version: 1, baseRevision: state.draft?.revision ?? 0, patch: { selectedTeamId: teamId, answers: { travel: 'Bus from site' }, step: 'signing', completedSteps: ['team', 'players', 'review', 'questions'] } });
    console.log(JSON.stringify(saved));
  } finally { globalThis.fetch = transport; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
