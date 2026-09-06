import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  eventEditorCreateBootstrapSchema,
  parseCreateEventEditorCommand,
  parseEventEditorCreateResult,
} from '../src/contracts/eventEditor';
import { prisma } from '../src/lib/prisma';

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const api = new URL(process.env.MVP_ISSUE50_API_URL ?? '');
  assert(['localhost', '127.0.0.1'].includes(database.hostname));
  assert.equal(database.pathname, '/bracketiq_e2e_50_samue');
  assert(['localhost', '127.0.0.1'].includes(api.hostname));
  assert.equal(api.port, '3108');
  const fixture = JSON.parse(await readFile('test-results/issue-50-session.json', 'utf8'));
  assert(fixture.eventId.startsWith('issue-50-'));
  const request = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(new URL(path, api), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert(response.ok, `Editor API returned ${response.status}: ${await response.clone().text()}`);
    return response.json();
  };
  const query = new URLSearchParams({
    templateId: fixture.templateId, organizationId: fixture.organizationId, start: '2027-01-04T09:00:00Z',
  });
  const bootstrap = eventEditorCreateBootstrapSchema.parse(await request(`/api/events/editor?${query}`));
  assert.equal(bootstrap.snapshot.draft.resources.sourceTemplateId, fixture.templateId);
  assert.equal(bootstrap.snapshot.draft.basics.organizationId, fixture.organizationId);
  assert.equal(bootstrap.snapshot.draft.resources.requiredTemplateIds.length, 1);
  const draft = structuredClone(bootstrap.snapshot.draft);
  draft.basics.name = 'Organizer template name';
  draft.basics.description = 'Organizer template description';
  draft.resources.requiredTemplateIds = [];
  draft.registration.payment.priceCents = 0;
  const command = parseCreateEventEditorCommand({
    contractVersion: 5, createOperationId: bootstrap.createOperationId,
    expectedRevisions: {
      editorRevision: bootstrap.snapshot.editorRevision,
      staffRevision: bootstrap.snapshot.staffRevision,
      scheduleRevision: bootstrap.snapshot.scheduleState.revision,
    },
    draft, completion: { mode: 'CREATE_ONLY' },
  });
  const saved = parseEventEditorCreateResult(await request('/api/events/editor', command));
  assert.equal(saved.snapshot.draft.basics.name, draft.basics.name);
  assert.equal(saved.snapshot.draft.basics.description, draft.basics.description);
  assert.equal(saved.snapshot.draft.basics.organizationId, fixture.organizationId);
  assert.deepEqual(saved.snapshot.draft.resources.requiredTemplateIds, []);
  assert.equal(saved.snapshot.draft.registration.payment.priceCents, 0);
  const replay = parseEventEditorCreateResult(await request('/api/events/editor', command));
  assert.equal(replay.snapshot.eventId, saved.snapshot.eventId);
  const bookingAfter = {
    booking: await prisma.rentalBookings.findUniqueOrThrow({ where: { id: fixture.bookingId } }),
    items: await prisma.rentalBookingItems.findMany({ where: { bookingId: fixture.bookingId }, orderBy: { id: 'asc' } }),
  };
  assert.deepEqual(JSON.parse(JSON.stringify(bookingAfter)), fixture.bookingBaseline);
  console.log('Template current values and create replay passed. Booking rows are unchanged.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
