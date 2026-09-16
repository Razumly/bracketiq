import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCreateEventEditorCommand } from '../src/contracts/eventEditor';
import { operationSchemas } from '../src/test/eventEditor/coverage';
import { mergeFixturePatch } from '../src/test/eventEditor/pairwise';

const fixtures = JSON.parse(readFileSync(resolve('../../test-fixtures/event-editor/complete-wire-fixtures.json'), 'utf8'));

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { commands, operations, pairwise }: { commands: unknown[]; operations: unknown[]; pairwise: unknown[] } = JSON.parse(input);
  assert.equal(commands.length, fixtures.cases.length);
  commands.forEach((value, index) => {
    const parsed = parseCreateEventEditorCommand(value);
    assert.deepEqual(parsed, fixtures.cases[index].command, fixtures.cases[index].name);
  });
  assert.equal(operations.length, fixtures.operations.length);
  operations.forEach((value, index) => {
    const fixture = fixtures.operations[index];
    const expected = fixture.draftCase === undefined
      ? fixture.command
      : { ...fixture.command, draft: fixtures.cases[fixture.draftCase].command.draft };
    assert.deepEqual(operationSchemas[fixture.kind].parse(value), expected, fixture.name);
  });
  assert.equal(pairwise.length, fixtures.pairwise.rows.length);
  pairwise.forEach((value, index) => {
    const row = fixtures.pairwise.rows[index];
    const base = fixtures.cases[row.draftCase].command;
    assert.deepEqual(parseCreateEventEditorCommand(value), { ...base, draft: mergeFixturePatch(base.draft, row.patch) }, row.name);
  });
  process.stdout.write(JSON.stringify({ accepted: commands.length + operations.length + pairwise.length }));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
