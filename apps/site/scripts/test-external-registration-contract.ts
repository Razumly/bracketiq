import assert from 'node:assert/strict';
import { eventEditorDraftSchema, parseSaveEventEditorCommand } from '../src/contracts/eventEditor';
import { assertEventRegistrationConfiguration } from '../src/lib/eventRegistration';

async function main() {
  let body = '';
  for await (const chunk of process.stdin) body += chunk;
  const input = JSON.parse(body);
  const before = eventEditorDraftSchema.parse(input.before);
  const command = parseSaveEventEditorCommand(input.command);
  assertEventRegistrationConfiguration(command.draft.basics.eventType, command.draft.basics.affiliateUrl);
  assert.equal(command.scheduleTransition.mode, 'PRESERVE');
  assert.deepEqual(command.draft, {
    ...before,
    basics: {
      ...before.basics,
      affiliateUrl: input.affiliateUrl,
      name: input.affiliateUrl.includes('new-partner') ? `${before.basics.name} Updated` : before.basics.name,
    },
  });
  process.stdout.write(JSON.stringify({ draft: command.draft }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
