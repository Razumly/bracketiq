import { z } from 'zod';
import { assertFieldInventory, commandSchemas, protocolSchemas, schemaLeaves, operationSchemas, resultSchemas, valuesAtPath } from '@/test/eventEditor/coverage';
import inventory from '../../../../../test-fixtures/event-editor/field-inventory.json';
import fixtures from '../../../../../test-fixtures/event-editor/complete-wire-fixtures.json';
import shapes from '../../../../../test-fixtures/event-editor/protocol-schema-snapshot.json';
import { createEventEditorCommandSchema } from '@/contracts/eventEditor';
import { webDraftRoundTrip } from '@/test/eventEditor/webRoundTrip';

describe('Event Editor command field inventory', () => {
  it('classifies the exact set of strict command leaves', () => {
    expect(() => assertFieldInventory(commandSchemas, inventory.commands)).not.toThrow();
  });

  it('requires review when required fields, defaults, constraints, or union branches change', () => {
    expect(z.toJSONSchema(protocolSchemas, { unrepresentable: 'any', reused: 'ref' })).toEqual(shapes);
  });

  it.each(fixtures.cases)('preserves the complete $name command through the site parser', ({ command }) => {
    expect(createEventEditorCommandSchema.parse(command)).toEqual(command);
  });

  it.each(fixtures.cases)('preserves $name through the web editor', ({ command }) => {
    const draft = createEventEditorCommandSchema.parse(command).draft;
    expect(webDraftRoundTrip(draft)).toEqual(draft);
  });

  it.each(fixtures.results)('preserves typed $name results', ({ value, kind }) => {
    expect(resultSchemas[kind].parse(value)).toEqual(value);
  });

  it.each(fixtures.operations)('preserves the $name command envelope', (operation) => {
    const command = 'draftCase' in operation
      ? { ...operation.command, draft: fixtures.cases[operation.draftCase].command.draft }
      : operation.command;
    expect(operationSchemas[operation.kind].parse(command)).toEqual(command);
  });

  it('exercises every classified draft leaf with a non-null value', () => {
    const missing = inventory.commands.filter(({ path }) => path.startsWith('draft.')).filter(({ path }) =>
      !fixtures.cases.some(({ command }) => valuesAtPath(command, path).some((value) => value !== null && value !== undefined)));
    expect(missing.map(({ path }) => path)).toEqual([]);
  });

  it('reads collection, record, and tuple values without silently defaulting missing fields', () => {
    expect(valuesAtPath({ rows: [{ x: [7, 9] }] }, 'rows[].x[1]')).toEqual([9]);
    expect(valuesAtPath({ rows: { team: [7] } }, 'rows.*[]')).toEqual([7]);
    expect(valuesAtPath({ rows: [{}] }, 'rows[].missing')).toEqual([]);
  });

  it('rejects an added optional nested command field', () => {
    const schemas = { draft: z.object({ name: z.string(), extra: z.array(z.object({ value: z.string().optional() })) }) };
    expect(() => assertFieldInventory(schemas, [{ path: 'draft.name' }])).toThrow('draft.extra[].value');
  });

  it('rejects a draft field removed from only one command', () => {
    const schemas = { draft: z.object({ name: z.string() }), create: z.object({ draft: z.object({}) }) };
    expect(() => assertFieldInventory(schemas, [{ path: 'draft.name' }])).toThrow('create.draft.name');
  });

  it('rejects a path entry with no reviewed classification', () => {
    expect(() => assertFieldInventory({ draft: z.object({ name: z.string() }) }, [{ path: 'draft.name' }])).toThrow('Missing classification');
  });

  it('rejects a removed field even when its old classification remains', () => {
    expect(() => assertFieldInventory({ draft: z.object({}) }, [{ path: 'draft.removed' }])).toThrow('draft.removed');
  });

  it('enumerates every union branch, tuple position, and open record value', () => {
    const schema = z.union([
      z.object({ point: z.tuple([z.number(), z.number()]) }),
      z.object({ scores: z.record(z.string(), z.array(z.number())) }),
    ]);
    expect(schemaLeaves(schema, 'draft')).toEqual(['draft.point[0]', 'draft.point[1]', 'draft.scores.*[]']);
  });
});
